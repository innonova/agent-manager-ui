<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import FileTreeNode from '@/components/FileTreeNode.vue'
import ProjectTabs from '@/components/ProjectTabs.vue'
import { useFilesStore } from '@/stores/files'
import { useProjectsStore } from '@/stores/projects'

// Monaco is several megabytes; it loads only when a file is opened.
const CodeViewer = defineAsyncComponent(() => import('@/components/CodeViewer.vue'))

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()
const files = useFilesStore()
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
  await files.select(props.id)
  const p = route.query.path
  if (typeof p === 'string' && p) {
    await files.reveal(p)
    await files.openFile(p)
  }
})

watch(
  () => files.openPath,
  (p) => {
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
          <span
            class="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
            >Files</span
          >
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
        <input
          v-model="files.filter"
          type="search"
          class="mx-3 mb-1 rounded border border-slate-300 px-2 py-0.5 text-xs focus:border-blue-500 focus:outline-none dark:border-slate-700"
          placeholder="filter loaded entries"
          data-test="files-filter"
          @keydown.escape="files.filter = ''"
        />
        <ul
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
          v-if="files.error"
          class="px-3 py-2 text-xs text-red-700 dark:text-red-300"
          data-test="files-error"
        >
          {{ files.error }}
        </p>
      </aside>
      <section class="flex min-w-0 grow flex-col">
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
