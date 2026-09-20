<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import ResizeHandle from '@/components/ResizeHandle.vue'
import { useResizable } from '@/composables/useResizable'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import FileTreeNode from '@/components/FileTreeNode.vue'
import ProjectHeader from '@/components/ProjectHeader.vue'
import { useDraftsStore } from '@/stores/drafts'
import { useAgentsStore } from '@/stores/agents'
import { ApiError } from '@/api/client'
import { useFilesStore } from '@/stores/files'
import { useNotificationsStore } from '@/stores/notifications'
import { useProjectsStore } from '@/stores/projects'

// Monaco is several megabytes; it loads only when a file is opened.
const CodeViewer = defineAsyncComponent(() => import('@/components/CodeViewer.vue'))

const props = defineProps<{ id: string }>()
const filesPane = useResizable('files-tree', 288)
const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()
const files = useFilesStore()
const agents = useAgentsStore()
const drafts = useDraftsStore()
const notifications = useNotificationsStore()

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
  files.active = true
  const p = route.query.path // before select(), which resets the open path and the URL follows
  await files.select(props.id)
  if (files.openPath && !p) void router.replace({ query: { path: files.openPath } })
  if (typeof p === 'string' && p) {
    await files.reveal(p)
    await files.openFile(p)
  }
})
// the top bar's switcher changes the project under this view; follow it
watch(
  () => props.id,
  async (id) => {
    await files.select(id)
  },
)
onUnmounted(() => {
  files.active = false
})

watch(
  () => files.openPath,
  (p) => {
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
    <template #title><ProjectHeader :id="id" /></template>
    <div class="flex h-full">
      <aside
        :style="{ width: `${filesPane.width.value}px` }"
        class="flex min-w-0 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex items-center px-3 py-2">
          <span
            class="text-sm font-semibold tracking-wide text-slate-900 uppercase dark:text-slate-100"
            >Files</span
          >
          <span class="grow" />
        </div>
        <!-- the tree's toolbar: where writes go, and the actions as icons (VS Code's explorer header) -->
        <div
          class="flex items-center gap-1 px-2 pb-1 text-slate-500 dark:text-slate-400"
          data-test="files-toolbar"
        >
          <span
            v-if="files.targetDir()"
            class="min-w-0 grow truncate pl-1 text-sm text-slate-500 dark:text-slate-400"
            :title="`Uploads and new folders go into ${files.targetDir()}; select a folder or a file in the tree to change it`"
            data-test="files-target"
            >uploads go to <span class="font-mono">{{ files.targetDir() }}</span></span
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
        <form
          v-if="newFolder !== null"
          class="flex items-center gap-2 px-3 pb-1 text-sm"
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
          v-model="files.filter"
          type="search"
          class="mx-3 mb-1 rounded border border-slate-300 px-2 py-0.5 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700"
          placeholder="filter loaded entries"
          data-test="files-filter"
          @keydown.escape="files.filter = ''"
        />
        <ul
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
          v-if="files.error"
          class="px-3 py-2 text-sm text-red-700 dark:text-red-300"
          data-test="files-error"
        >
          {{ files.error }}
        </p>
      </aside>
      <ResizeHandle @start="filesPane.start" />
      <section class="flex min-w-0 grow flex-col">
        <div
          class="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-base dark:border-slate-800 dark:bg-slate-900"
        >
          <span class="truncate font-mono text-sm" data-test="file-path">{{
            files.openPath ?? 'select a file'
          }}</span>
          <span class="grow" />
          <span v-if="files.open" class="text-sm text-slate-400">{{ size }}</span>
        </div>
        <div class="min-h-0 grow bg-white dark:bg-slate-950">
          <p v-if="!files.open" class="p-6 text-base text-slate-500 dark:text-slate-400">
            Select a file in the tree, or see
            <RouterLink
              :to="{ name: 'changes', params: { id } }"
              class="text-blue-700 hover:underline dark:text-blue-300"
              >what changed</RouterLink
            >. Files are read-only here; agents work in the tree, and this view refreshes when one
            finishes a turn.
          </p>
          <p
            v-else-if="files.open.binary"
            class="p-6 text-base text-slate-400"
            data-test="file-binary"
          >
            Binary file, {{ size }}.
          </p>
          <p
            v-else-if="files.open.truncated"
            class="p-6 text-base text-slate-400"
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
