<script setup lang="ts">
import { computed } from 'vue'
import type { DirEntry } from '@/api/types'
import FileIcon from '@/components/FileIcon.vue'
import { useFilesStore } from '@/stores/files'

const props = defineProps<{ entry: DirEntry; depth: number; treeFocused: boolean }>()
const files = useFilesStore()
const isDir = computed(() => props.entry.type === 'dir')
const expanded = computed(() => isDir.value && files.isOpen(props.entry.path))
const focused = computed(() => files.focused === props.entry.path)

/** VS Code's git decoration colours, light and dark. */
const STATUS_CLASS: Record<NonNullable<DirEntry['status']>, string> = {
  modified: 'text-[#895503] dark:text-[#e2c08d]',
  added: 'text-[#587c0c] dark:text-[#81b88b]',
  deleted: 'text-[#ad0707] dark:text-[#c74e39]',
  untracked: 'text-[#007100] dark:text-[#73c991]',
  conflict: 'text-[#ad0707] dark:text-[#e4676b]',
}
const STATUS_LETTER: Record<NonNullable<DirEntry['status']>, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  untracked: 'U',
  conflict: 'C',
}
const statusClass = computed(() => (props.entry.status ? STATUS_CLASS[props.entry.status] : ''))

function activate(): void {
  files.focus(props.entry.path)
  if (isDir.value) void files.toggle(props.entry.path)
  else void files.openFile(props.entry.path)
}

function formatSize(n: number): string {
  return n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`
}
const title = computed(() => {
  const e = props.entry
  const parts = [e.path]
  if (e.type !== 'dir') parts.push(formatSize(e.size))
  if (e.mtime) parts.push(new Date(e.mtime).toLocaleString())
  if (e.ignored) parts.push('ignored by git')
  if (e.status) parts.push(`git: ${e.status}`)
  return parts.join(' · ')
})
</script>

<template>
  <li>
    <button
      class="flex w-full items-center gap-1.5 truncate py-0.5 pr-2 text-left text-base hover:bg-slate-100 dark:hover:bg-slate-800"
      :class="[
        files.openPath === entry.path ? 'bg-slate-200 font-medium dark:bg-slate-700' : '',
        entry.ignored ? 'opacity-50' : '',
        // the selected row stays marked when the tree is not the focused element (a
        // button in the header is), with the ring only while it is
        focused
          ? treeFocused
            ? 'bg-slate-100 ring-1 ring-blue-500 ring-inset dark:bg-slate-800'
            : 'bg-slate-100 dark:bg-slate-800'
          : '',
      ]"
      :style="{ paddingLeft: `${depth * 0.9 + 0.5}rem` }"
      :title="title"
      tabindex="-1"
      :data-test="`tree-${entry.type}`"
      :data-path="entry.path"
      :data-ignored="entry.ignored ? 'true' : undefined"
      :data-status="entry.status ?? undefined"
      :data-expanded="isDir ? String(expanded) : undefined"
      :data-focused="focused ? 'true' : undefined"
      @click="activate"
    >
      <!-- chevron: points right when collapsed, down when expanded -->
      <svg
        class="h-4 w-4 shrink-0 text-slate-500 transition-transform duration-100 dark:text-slate-400"
        :class="[isDir ? '' : 'invisible', expanded ? 'rotate-90' : '']"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M6 3.5L10.5 8 6 12.5" />
      </svg>
      <FileIcon :entry="entry" :expanded="expanded" />
      <span
        class="truncate"
        :class="statusClass || (isDir ? '' : 'text-slate-700 dark:text-slate-300')"
        >{{ entry.name }}</span
      >
      <span class="grow" />
      <span
        v-if="entry.status"
        class="shrink-0 text-sm"
        :class="statusClass"
        :title="`git: ${entry.status}`"
        >{{ STATUS_LETTER[entry.status] }}</span
      >
    </button>
    <!-- indent guide under the parent's chevron, as in VS Code -->
    <ul
      v-if="isDir && expanded"
      class="relative before:absolute before:top-0 before:bottom-0 before:left-(--guide) before:w-px before:bg-slate-200 dark:before:bg-slate-700"
      :style="{ '--guide': `${depth * 0.9 + 1}rem` }"
    >
      <FileTreeNode
        v-for="child in files.children(entry.path)"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
        :tree-focused="treeFocused"
      />
    </ul>
  </li>
</template>
