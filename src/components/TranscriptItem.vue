<script setup lang="ts">
import { computed, ref } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { Item } from '@/api/types'

const props = defineProps<{ item: Item }>()
const open = ref(false)

const html = computed(() =>
  props.item.kind === 'text'
    ? DOMPurify.sanitize(marked.parse(props.item.text, { async: false }) as string)
    : '',
)
const inputSummary = computed(() => {
  if (props.item.kind !== 'tool_use') return ''
  const s = JSON.stringify(props.item.input)
  return s.length > 120 ? s.slice(0, 117) + '…' : s
})
const duration = computed(() =>
  props.item.kind === 'turn_end' && props.item.durationMs
    ? `${(props.item.durationMs / 1000).toFixed(1)}s`
    : '',
)
const cost = computed(() =>
  props.item.kind === 'turn_end' && props.item.costUsd ? `$${props.item.costUsd.toFixed(4)}` : '',
)
</script>

<template>
  <div v-if="item.kind === 'user'" class="flex justify-end" data-item="user">
    <div
      class="max-w-[80%] rounded-lg bg-blue-600 px-3 py-2 text-sm whitespace-pre-wrap text-white"
    >
      {{ item.text }}
    </div>
  </div>

  <div
    v-else-if="item.kind === 'text'"
    class="prose prose-sm dark:prose-invert max-w-none"
    :data-item="item.streaming ? 'text-streaming' : 'text'"
  >
    <div v-html="html" />
    <span
      v-if="item.streaming"
      class="inline-block h-4 w-2 animate-pulse bg-slate-400 align-text-bottom dark:bg-slate-500"
    />
  </div>

  <details
    v-else-if="item.kind === 'thinking'"
    class="text-xs text-slate-500 dark:text-slate-400"
    data-item="thinking"
  >
    <summary class="cursor-pointer select-none">thinking</summary>
    <div class="mt-1 border-l-2 border-slate-200 pl-2 whitespace-pre-wrap dark:border-slate-800">
      {{ item.text }}
    </div>
  </details>

  <div
    v-else-if="item.kind === 'tool_use'"
    class="rounded border border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900"
    data-item="tool_use"
  >
    <button
      class="flex w-full items-center gap-2 px-2 py-1 text-left font-mono"
      @click="open = !open"
    >
      <span class="text-slate-400 dark:text-slate-500">{{ open ? '▾' : '▸' }}</span>
      <span class="font-semibold">{{ item.name }}</span>
      <span class="truncate text-slate-500 dark:text-slate-400">{{ inputSummary }}</span>
    </button>
    <pre
      v-if="open"
      class="overflow-x-auto border-t border-slate-200 px-2 py-1 whitespace-pre-wrap text-slate-700 dark:border-slate-800 dark:text-slate-300"
      >{{ JSON.stringify(item.input, null, 2) }}</pre>
  </div>

  <details
    v-else-if="item.kind === 'tool_result'"
    class="ml-4 text-xs"
    :class="item.isError ? 'text-red-800 dark:text-red-200' : 'text-slate-600 dark:text-slate-300'"
    data-item="tool_result"
  >
    <summary class="cursor-pointer select-none">
      {{ item.isError ? 'tool error' : 'result' }} · {{ item.output.length }} chars
    </summary>
    <pre
      class="mt-1 max-h-80 overflow-auto rounded bg-slate-100 p-2 whitespace-pre-wrap dark:bg-slate-800"
      >{{ item.output }}</pre>
  </details>

  <div
    v-else-if="item.kind === 'error'"
    class="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
    data-item="error"
  >
    {{ item.message }}
  </div>

  <div
    v-else-if="item.kind === 'system'"
    class="text-xs text-slate-400 dark:text-slate-500"
    data-item="system"
  >
    {{ item.text }}
  </div>

  <div
    v-else-if="item.kind === 'turn_end'"
    class="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500"
    data-item="turn_end"
  >
    <span class="h-px grow bg-slate-200 dark:bg-slate-700" />
    <span v-if="duration">{{ duration }}</span>
    <span v-if="cost">{{ cost }}</span>
    <span class="h-px grow bg-slate-200 dark:bg-slate-700" />
  </div>
</template>
