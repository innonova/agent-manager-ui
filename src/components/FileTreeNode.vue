<script setup lang="ts">
import { computed } from 'vue'
import type { DirEntry } from '@/api/types'
import FileIcon from '@/components/FileIcon.vue'
import { useFilesStore } from '@/stores/files'

const props = defineProps<{ entry: DirEntry; depth: number }>()
const files = useFilesStore()
const isDir = computed(() => props.entry.type === 'dir')
const expanded = computed(() => isDir.value && files.expanded.has(props.entry.path))

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
  return parts.join(' · ')
})
</script>

<template>
  <li>
    <button
      class="flex w-full items-center gap-1.5 truncate py-0.5 pr-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
      :class="[
        files.openPath === entry.path ? 'bg-slate-200 font-medium dark:bg-slate-700' : '',
        entry.ignored ? 'opacity-50' : '',
      ]"
      :style="{ paddingLeft: `${depth * 0.9 + 0.5}rem` }"
      :title="title"
      :data-test="`tree-${entry.type}`"
      :data-path="entry.path"
      :data-ignored="entry.ignored ? 'true' : undefined"
      :data-expanded="isDir ? String(expanded) : undefined"
      @click="isDir ? files.toggle(entry.path) : files.openFile(entry.path)"
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
      <span class="truncate" :class="isDir ? '' : 'text-slate-700 dark:text-slate-300'">{{
        entry.name
      }}</span>
    </button>
    <!-- indent guide under the parent's chevron, as in VS Code -->
    <ul
      v-if="isDir && expanded"
      class="relative before:absolute before:top-0 before:bottom-0 before:left-(--guide) before:w-px before:bg-slate-200 dark:before:bg-slate-700"
      :style="{ '--guide': `${depth * 0.9 + 1}rem` }"
    >
      <FileTreeNode
        v-for="child in files.dirs.get(entry.path) ?? []"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
      />
    </ul>
  </li>
</template>
