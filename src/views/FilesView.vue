<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import FileTreeNode from '@/components/FileTreeNode.vue'
import ProjectTabs from '@/components/ProjectTabs.vue'
import { useChangesStore } from '@/stores/changes'
import { useFeaturesStore } from '@/stores/features'
import { useFilesStore } from '@/stores/files'
import { useProjectsStore } from '@/stores/projects'

// Monaco is several megabytes; it loads only when a file is opened.
const CodeViewer = defineAsyncComponent(() => import('@/components/CodeViewer.vue'))
const DiffViewer = defineAsyncComponent(() => import('@/components/DiffViewer.vue'))

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()
const files = useFilesStore()
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
  await files.select(props.id)
  const p = route.query.path
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
    if (m === 'changes') await changes.select(props.id, b)
  },
)

watch(
  () => files.openPath,
  (p) => {
    if (mode.value !== 'tree') return
    if (p !== (typeof route.query.path === 'string' ? route.query.path : null))
      void router.replace({ query: p ? { path: p } : {} })
  },
)
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
            class="mr-2 text-xs text-blue-700 hover:underline dark:text-blue-300"
            data-test="files-collapse"
            @click="files.collapseAll()"
          >
            collapse
          </button>
          <button
            class="text-xs text-blue-700 hover:underline dark:text-blue-300"
            data-test="files-refresh"
            @click="files.refresh()"
          >
            refresh
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
              class="text-blue-700 hover:underline dark:text-blue-300"
              data-test="mark-read"
              @click="changes.markRead()"
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
