<script setup lang="ts">
import type { DirEntry } from '@/api/types'
import { useFilesStore } from '@/stores/files'

defineProps<{ entry: DirEntry; depth: number }>()
const files = useFilesStore()
</script>

<template>
  <li>
    <button
      class="flex w-full items-center gap-1 truncate py-0.5 pr-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
      :class="files.openPath === entry.path ? 'bg-slate-200 font-medium dark:bg-slate-700' : ''"
      :style="{ paddingLeft: `${depth * 0.9 + 0.5}rem` }"
      :data-test="`tree-${entry.type}`"
      :data-path="entry.path"
      @click="entry.type === 'dir' ? files.toggle(entry.path) : files.openFile(entry.path)"
    >
      <span class="w-3 shrink-0 text-xs text-slate-400 dark:text-slate-500">
        <template v-if="entry.type === 'dir'">{{
          files.expanded.has(entry.path) ? '▾' : '▸'
        }}</template>
      </span>
      <span
        class="truncate"
        :class="entry.type === 'dir' ? '' : 'text-slate-700 dark:text-slate-300'"
        >{{ entry.name }}</span
      >
      <span v-if="entry.type === 'symlink'" class="text-xs text-slate-400" title="symbolic link"
        >↗</span
      >
    </button>
    <ul v-if="entry.type === 'dir' && files.expanded.has(entry.path)">
      <FileTreeNode
        v-for="child in files.dirs.get(entry.path) ?? []"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
      />
    </ul>
  </li>
</template>
