<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import FileTreeNode from '@/components/FileTreeNode.vue'
import ProjectTabs from '@/components/ProjectTabs.vue'
import { useChangesStore } from '@/stores/changes'
import { useFeaturesStore } from '@/stores/features'
import { useDraftsStore } from '@/stores/drafts'
import { useAgentsStore } from '@/stores/agents'
import { ApiError } from '@/api/client'
import { useFilesStore } from '@/stores/files'
import { useNotificationsStore } from '@/stores/notifications'
import { useProjectsStore } from '@/stores/projects'

// Monaco is several megabytes; it loads only when a file is opened.
const CodeViewer = defineAsyncComponent(() => import('@/components/CodeViewer.vue'))
const DiffViewer = defineAsyncComponent(() => import('@/components/DiffViewer.vue'))

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()
const files = useFilesStore()
const agents = useAgentsStore()
const drafts = useDraftsStore()
const changes = useChangesStore()
const features = useFeaturesStore()
/** "tree" or "changes"; changes take a base: "read", "feature:<slug>" or a commit. */
const mode = computed(() => (route.query.mode === 'changes' ? 'changes' : 'tree'))
const base = computed(() => (typeof route.query.base === 'string' && route.query.base) || 'read')
const inline = ref(false)
const baseLabel = computed(() => {
  if (base.value === 'read') return 'since you last looked'
  if (base.value.startsWith('feature:')) {
    const slug = base.value.slice(8)
    const f = (features.byProject.get(props.id) ?? []).find((x) => x.slug === slug)
    return `feature: ${f?.title ?? slug}`
  }
  return `since ${base.value.slice(0, 8)}`
})
const changedCount = computed(() => changes.repos.reduce((n, r) => n + r.files.length, 0))
/** Meaningful when a cursor is missing or commits exist since it; uncommitted work is never "read". */
const canMarkRead = computed(
  () =>
    base.value === 'read' &&
    // any fallback note (nothing read yet, history rewritten) is cleared by marking read too
    changes.repos.some((r) => r.head && (r.base !== r.head || r.note)),
)
const notifications = useNotificationsStore()
async function markRead() {
  await changes.markRead()
  const left = changedCount.value
  notifications.push(
    'info',
    left
      ? `Marked as read. ${left} uncommitted change${left === 1 ? '' : 's'} still show${left === 1 ? 's' : ''}.`
      : 'Marked as read; nothing left to look at.',
  )
}
const STATUS_LETTER: Record<string, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
}
const STATUS_CLASS: Record<string, string> = {
  modified: 'text-[#895503] dark:text-[#e2c08d]',
  added: 'text-[#587c0c] dark:text-[#81b88b]',
  deleted: 'text-[#ad0707] dark:text-[#c74e39]',
  renamed: 'text-[#895503] dark:text-[#e2c08d]',
  untracked: 'text-[#007100] dark:text-[#73c991]',
}

function setMode(m: 'tree' | 'changes', b?: string) {
  const query: Record<string, string> = {}
  if (m === 'changes') {
    query.mode = 'changes'
    if (b && b !== 'read') query.base = b
    if (changes.openPath) query.path = changes.openPath
  } else if (files.openPath) {
    query.path = files.openPath
  }
  void router.replace({ query })
}

async function openChange(path: string) {
  await changes.openFile(path)
  void router.replace({ query: { ...route.query, path } })
}
const project = computed(() => projects.byId.get(props.id)?.project)
const size = computed(() => {
  const n = files.open?.size ?? 0
  return n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`
})

const treeFocused = ref(false)

/**
 * VS Code's tree keys: up/down move, right expands or steps in, left
 * collapses or steps out, Enter or Space activates, Home/End jump.
 */
async function onTreeKey(e: KeyboardEvent): Promise<void> {
  const rows = files.rows()
  if (rows.length === 0) return
  const i = rows.findIndex((r) => r.path === files.focused)
  const cur = i >= 0 ? rows[i]! : null
  const go = (n: number) => files.focus(rows[Math.max(0, Math.min(rows.length - 1, n))]!.path)
  switch (e.key) {
    case 'ArrowDown':
      go(i + 1)
      break
    case 'ArrowUp':
      go(i < 0 ? 0 : i - 1)
      break
    case 'Home':
      go(0)
      break
    case 'End':
      go(rows.length - 1)
      break
    case 'ArrowRight':
      if (!cur) go(0)
      else if (cur.type === 'dir' && !files.isOpen(cur.path)) await files.toggle(cur.path)
      else if (cur.type === 'dir') go(i + 1)
      break
    case 'ArrowLeft':
      if (!cur) go(0)
      else if (cur.type === 'dir' && files.isOpen(cur.path)) await files.toggle(cur.path)
      else if (cur.path.includes('/')) files.focus(cur.path.slice(0, cur.path.lastIndexOf('/')))
      break
    case 'Enter':
    case ' ':
      if (!cur) return
      if (cur.type === 'dir') await files.toggle(cur.path)
      else await files.openFile(cur.path)
      break
    default:
      return
  }
  e.preventDefault()
}

onMounted(async () => {
  if (!projects.loaded) await projects.load()
  if (!features.byProject.has(props.id)) void features.load(props.id)
  void changes.countUnread(props.id)
  files.active = true
  changes.active = mode.value === 'changes'
  const p = route.query.path // before select(), which resets the open path and the URL follows
  await files.select(props.id)
  // remounted with a file still open (tab switch and back): put it back in the URL
  if (mode.value === 'tree' && files.openPath && !p)
    void router.replace({ query: { path: files.openPath } })
  if (mode.value === 'changes') {
    await changes.select(props.id, base.value)
    if (typeof p === 'string' && p) await changes.openFile(p)
  } else if (typeof p === 'string' && p) {
    await files.reveal(p)
    await files.openFile(p)
  }
})

watch(
  () => [mode.value, base.value] as const,
  async ([m, b]) => {
    changes.active = m === 'changes'
    if (m === 'changes') await changes.select(props.id, b)
  },
)
onUnmounted(() => {
  files.active = false
  changes.active = false
})

watch(
  () => files.openPath,
  (p) => {
    if (mode.value !== 'tree') return
    if (p !== (typeof route.query.path === 'string' ? route.query.path : null))
      void router.replace({ query: p ? { path: p } : {} })
  },
)

// ---- writing into the tree: uploads and new folders
const filePicker = ref<HTMLInputElement | null>(null)
const newFolder = ref<string | null>(null)
const newFolderInput = ref<HTMLInputElement | null>(null)
function toggleNewFolder() {
  newFolder.value = newFolder.value === null ? '' : null
  if (newFolder.value !== null) void nextTick(() => newFolderInput.value?.focus())
}
const dragging = ref(false)
function pickFiles() {
  filePicker.value?.click()
}
function onPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const list = [...(input.files ?? [])]
  input.value = ''
  void uploadFiles(list)
}
function onDrop(e: DragEvent) {
  dragging.value = false
  const list = [...(e.dataTransfer?.files ?? [])]
  if (list.length) void uploadFiles(list)
}
/** A name the manager would place somewhere else: a path, a dot entry, a backslash, nothing. */
const BAD_NAME = /[/\\]|^\.\.?$|^\s*$/
/** Uploads into the target directory; a name in use asks before replacing; the toast offers to mention the path to the agent. */
async function uploadFiles(list: File[]) {
  const dir = files.targetDir()
  if (!dir) return notifications.push('error', 'select a folder in the tree first')
  const done: string[] = []
  for (const f of list) {
    if (f.size === 0 && !f.type) {
      notifications.push(
        'error',
        `${f.name || 'that'} is a folder or empty; folders cannot be dropped`,
      )
      continue
    }
    if (BAD_NAME.test(f.name)) {
      notifications.push('error', `${f.name}: a file name cannot contain a slash or backslash`)
      continue
    }
    try {
      done.push(...(await files.upload(dir, [f])))
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        if (!confirm(`${f.name} exists in ${dir}. Replace it?`)) continue
        try {
          done.push(...(await files.upload(dir, [f], true)))
        } catch (e2) {
          notifications.push('error', e2 instanceof ApiError ? e2.message : String(e2))
        }
      } else notifications.push('error', e instanceof ApiError ? e.message : String(e))
    }
  }
  if (!done.length) return
  // the agent last opened here, else the project's first: the one a mention goes to
  const remembered = agents.lastAgent.get(props.id)
  const agentId =
    remembered && agents.byId.has(remembered)
      ? remembered
      : agents.byProject.get(props.id)?.[0]?.agent.id
  notifications.push(
    'info',
    `uploaded ${done.length === 1 ? done[0] : `${done.length} files into ${dir}`}`,
    12000,
    agentId
      ? {
          label: 'mention to agent',
          run: () => {
            const current = drafts.get(agentId)
            drafts.set(agentId, `${current ? current + '\n' : ''}See ${done.join(', ')}`)
            void router.push({ name: 'agent', params: { id: props.id, agentId } })
          },
        }
      : undefined,
  )
}
async function createFolder() {
  const dir = files.targetDir()
  const name = (newFolder.value ?? '').trim()
  if (!dir || !name) return
  if (BAD_NAME.test(name)) {
    notifications.push('error', 'a folder name cannot contain a slash or be . or ..')
    return
  }
  try {
    await files.mkdir(dir, name)
    newFolder.value = null
  } catch (e) {
    notifications.push('error', e instanceof ApiError ? e.message : String(e))
  }
}
</script>

<template>
  <AppShell>
    <template #title>
      <span class="text-slate-400 dark:text-slate-500">/</span>
      <span data-test="project-title">{{ project?.name ?? '…' }}</span>
      <ProjectTabs :id="id" />
    </template>
    <div class="flex h-full">
      <aside
        class="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex items-center px-3 py-2">
          <button
            class="text-xs font-semibold tracking-wide uppercase"
            :class="
              mode === 'tree'
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300'
            "
            data-test="mode-tree"
            @click="setMode('tree')"
          >
            Files
          </button>
          <button
            class="ml-3 text-xs font-semibold tracking-wide uppercase"
            :class="
              mode === 'changes'
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300'
            "
            data-test="mode-changes"
            @click="setMode('changes')"
          >
            Changes<span
              v-if="changes.unread.get(id)"
              class="ml-1 rounded bg-blue-600 px-1 text-[10px] text-white"
              data-test="unread-count"
              >{{ changes.unread.get(id) }}</span
            >
          </button>
          <span class="grow" />
          <button
            v-if="mode === 'changes'"
            class="text-xs text-blue-700 hover:underline dark:text-blue-300"
            data-test="files-refresh"
            @click="changes.load()"
          >
            refresh
          </button>
        </div>
        <!-- the tree's toolbar: where writes go, and the actions as icons (VS Code's explorer header) -->
        <div
          v-if="mode === 'tree'"
          class="flex items-center gap-1 px-2 pb-1 text-slate-500 dark:text-slate-400"
          data-test="files-toolbar"
        >
          <span
            v-if="files.targetDir()"
            class="min-w-0 grow truncate pl-1 font-mono text-[11px]"
            :title="`Uploads and new folders go into ${files.targetDir()}; select a folder or a file in the tree to change it`"
            data-test="files-target"
            >into {{ files.targetDir() }}</span
          >
          <span v-else class="grow" />
          <button
            class="rounded p-1 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            :title="`Upload files into ${files.targetDir() ?? 'the project'}`"
            :aria-label="`Upload files into ${files.targetDir() ?? 'the project'}`"
            data-test="files-upload"
            @click="pickFiles()"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M8 11V3M4.5 6.5 8 3l3.5 3.5M3 13h10" />
            </svg>
          </button>
          <input
            ref="filePicker"
            type="file"
            multiple
            class="hidden"
            data-test="files-upload-input"
            @change="onPicked"
          />
          <button
            class="rounded p-1 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            :title="`New folder in ${files.targetDir() ?? 'the project'}`"
            :aria-label="`New folder in ${files.targetDir() ?? 'the project'}`"
            data-test="files-new-folder"
            @click="toggleNewFolder()"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path
                d="M2 4.5A1.5 1.5 0 0 1 3.5 3H6l1.5 1.5h5A1.5 1.5 0 0 1 14 6v6.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5z"
              />
              <path d="M8 7.5v4M6 9.5h4" />
            </svg>
          </button>
          <button
            class="rounded p-1 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            title="Collapse all folders"
            aria-label="Collapse all folders"
            data-test="files-collapse"
            @click="files.collapseAll()"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 3h10v10H3zM3 6.5h10M3 9.5h10" />
            </svg>
          </button>
          <button
            class="rounded p-1 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            title="Refresh the tree"
            aria-label="Refresh the tree"
            data-test="files-refresh"
            @click="files.refresh()"
          >
            <svg
              class="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M13 8a5 5 0 1 1-1.5-3.6M13 3v2.5h-2.5" />
            </svg>
          </button>
        </div>
        <template v-if="mode === 'changes'">
          <div class="flex items-center gap-2 px-3 pb-1 text-xs text-slate-500 dark:text-slate-400">
            <span class="truncate" data-test="changes-base">{{ baseLabel }}</span>
            <span class="grow" />
            <button
              v-if="base !== 'read'"
              class="text-blue-700 hover:underline dark:text-blue-300"
              @click="setMode('changes')"
            >
              since last read
            </button>
            <button
              class="text-blue-700 hover:underline disabled:cursor-default disabled:text-slate-400 disabled:no-underline dark:text-blue-300 dark:disabled:text-slate-500"
              :disabled="!canMarkRead"
              :title="
                canMarkRead
                  ? 'Move your read cursor to the current commit'
                  : 'Nothing committed since you last looked; uncommitted work always shows'
              "
              data-test="mark-read"
              @click="markRead()"
            >
              mark as read
            </button>
          </div>
          <div class="min-h-0 grow overflow-auto pb-4" data-test="changes-list">
            <template v-for="r in changes.repos" :key="r.repo">
              <div
                v-if="changes.repos.length > 1 || r.note"
                class="px-3 pt-2 pb-1 text-xs text-slate-500 dark:text-slate-400"
              >
                <span v-if="changes.repos.length > 1" class="font-mono">{{ r.repo }}</span>
                <span v-if="r.note" class="ml-1 italic" data-test="changes-note">{{ r.note }}</span>
              </div>
              <button
                v-for="f in r.files"
                :key="f.path"
                class="flex w-full items-center gap-2 truncate px-3 py-0.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                :class="
                  changes.openPath === f.path ? 'bg-slate-200 font-medium dark:bg-slate-700' : ''
                "
                :title="f.oldPath ? `${f.oldPath} → ${f.path}` : f.path"
                data-test="changed-file"
                :data-path="f.path"
                :data-status="f.status"
                @click="openChange(f.path)"
              >
                <span class="truncate" :class="STATUS_CLASS[f.status]">{{
                  f.path.slice(f.path.indexOf('/') + 1)
                }}</span>
                <span class="grow" />
                <span class="shrink-0 text-xs" :class="STATUS_CLASS[f.status]">{{
                  STATUS_LETTER[f.status]
                }}</span>
              </button>
            </template>
            <p
              v-if="!changes.loading && changedCount === 0"
              class="px-3 py-2 text-xs text-slate-400 dark:text-slate-500"
              data-test="changes-empty"
            >
              No changes {{ baseLabel }}.
            </p>
          </div>
          <p
            v-if="changes.error"
            class="px-3 py-2 text-xs text-red-700 dark:text-red-300"
            data-test="changes-error"
          >
            {{ changes.error }}
          </p>
        </template>
        <form
          v-if="mode === 'tree' && newFolder !== null"
          class="flex items-center gap-2 px-3 pb-1 text-xs"
          data-test="new-folder-form"
          @submit.prevent="createFolder()"
        >
          <span class="truncate text-slate-500 dark:text-slate-400"
            >{{ files.targetDir() ?? '' }}/</span
          >
          <input
            v-model="newFolder"
            class="min-w-0 grow rounded border border-slate-300 px-2 py-1 font-mono dark:border-slate-700"
            placeholder="folder name"
            ref="newFolderInput"
            data-test="new-folder-name"
            @keydown.escape="newFolder = null"
          />
          <button type="submit" class="text-blue-700 hover:underline dark:text-blue-300">
            create
          </button>
        </form>
        <input
          v-if="mode === 'tree'"
          v-model="files.filter"
          type="search"
          class="mx-3 mb-1 rounded border border-slate-300 px-2 py-0.5 text-xs focus:border-blue-500 focus:outline-none dark:border-slate-700"
          placeholder="filter loaded entries"
          data-test="files-filter"
          @keydown.escape="files.filter = ''"
        />
        <ul
          v-if="mode === 'tree'"
          class="min-h-0 grow overflow-auto pb-4 outline-none"
          tabindex="0"
          data-test="file-tree"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
          @focus="treeFocused = true"
          @blur="treeFocused = false"
          @keydown="onTreeKey"
        >
          <FileTreeNode
            v-for="e in files.children('')"
            :key="e.path"
            :entry="e"
            :depth="0"
            :tree-focused="treeFocused"
          />
        </ul>
        <p
          v-if="mode === 'tree' && files.error"
          class="px-3 py-2 text-xs text-red-700 dark:text-red-300"
          data-test="files-error"
        >
          {{ files.error }}
        </p>
      </aside>
      <section v-if="mode === 'changes'" class="flex min-w-0 grow flex-col">
        <div
          class="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <span class="truncate font-mono text-xs" data-test="diff-path">{{
            changes.openPath ?? 'select a changed file'
          }}</span>
          <span class="grow" />
          <label v-if="changes.open" class="flex items-center gap-1 text-xs text-slate-500">
            <input v-model="inline" type="checkbox" /> inline
          </label>
        </div>
        <div class="min-h-0 grow bg-white dark:bg-slate-950">
          <p v-if="!changes.open" class="p-6 text-sm text-slate-400">
            Changes are measured from a base to the working tree, so uncommitted work shows too.
            "Mark as read" moves the base to the current commit.
          </p>
          <p
            v-else-if="changes.open.binary || changes.open.truncated"
            class="p-6 text-sm text-slate-400"
            data-test="diff-unavailable"
          >
            {{ changes.open.binary ? 'Binary file.' : 'Too large to show.' }}
          </p>
          <DiffViewer
            v-else
            :path="changes.open.path"
            :before="changes.open.before ?? ''"
            :after="changes.open.after ?? ''"
            :inline="inline"
          />
        </div>
      </section>
      <section v-else class="flex min-w-0 grow flex-col">
        <div
          class="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <span class="truncate font-mono text-xs" data-test="file-path">{{
            files.openPath ?? 'select a file'
          }}</span>
          <span class="grow" />
          <span v-if="files.open" class="text-xs text-slate-400">{{ size }}</span>
        </div>
        <div class="min-h-0 grow bg-white dark:bg-slate-950">
          <p v-if="!files.open" class="p-6 text-sm text-slate-400">
            Files are shown read-only; agents work in the tree directly, and this view refreshes
            when one finishes a turn.
          </p>
          <p
            v-else-if="files.open.binary"
            class="p-6 text-sm text-slate-400"
            data-test="file-binary"
          >
            Binary file, {{ size }}.
          </p>
          <p
            v-else-if="files.open.truncated"
            class="p-6 text-sm text-slate-400"
            data-test="file-truncated"
          >
            Too large to show ({{ size }}).
          </p>
          <CodeViewer v-else :path="files.open.path" :content="files.open.content" />
        </div>
      </section>
    </div>
  </AppShell>
</template>
