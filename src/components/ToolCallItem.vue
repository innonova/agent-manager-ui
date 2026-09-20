<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Item } from '@/api/types'

type ToolUse = Extract<Item, { kind: 'tool_use' }>
type ToolResult = Extract<Item, { kind: 'tool_result' }>
const props = defineProps<{ call: ToolUse; result: ToolResult | null }>()
const open = ref(false)

const input = computed(() => (props.call.input ?? {}) as Record<string, unknown>)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const clip = (s: string, n = 100) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/**
 * One line that says what the call is for. Claude's Bash carries a
 * `description`; file tools carry a path; search tools a pattern. Codex's
 * shell and Copilot's calls (whose name is already a title) fall through
 * to the command or a compact input.
 */
const summary = computed(() => {
  const i = input.value
  const name = props.call.name
  if (str(i.description)) return str(i.description)
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit':
      return str(i.file_path) || str(i.path)
    case 'Glob':
    case 'Grep':
      return [str(i.pattern), str(i.path)].filter(Boolean).join(' in ')
    case 'WebFetch':
    case 'WebSearch':
      return str(i.url) || str(i.query)
    case 'Bash':
    case 'shell':
      return clip(str(i.command).replace(/\s+/g, ' '))
    case 'Task':
    case 'Agent':
      return str(i.description) || str(i.prompt)
    default: {
      const s = JSON.stringify(props.call.input)
      return s && s !== '{}' && s !== 'null' ? clip(s) : ''
    }
  }
})

/** The input as the user would want to read it: a command as text, the rest as JSON. */
const inputText = computed(() => {
  const i = input.value
  if (str(i.command)) return str(i.command)
  return JSON.stringify(props.call.input, null, 2)
})

const status = computed(() => {
  if (!props.result) return 'running…'
  if (props.result.isError) return 'error'
  const n = props.result.output.length
  return n ? `${n} chars` : 'no output'
})
</script>

<template>
  <div
    class="rounded border border-slate-200 bg-white text-sm dark:border-slate-800 dark:bg-slate-900"
    :class="result?.isError ? 'border-red-300 dark:border-red-800' : ''"
    data-item="tool_use"
    :data-open="open || undefined"
  >
    <button
      class="flex w-full items-center gap-2 px-2 py-1 text-left"
      data-test="tool-toggle"
      @click="open = !open"
    >
      <svg
        class="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-100 dark:text-slate-500"
        :class="open ? 'rotate-90' : ''"
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
      <!-- The description leads and the tool name sits on the right: a column of
           lines all starting with "Bash" is hard to skim; their purpose is not. -->
      <span class="truncate text-slate-700 dark:text-slate-200">{{ summary || call.name }}</span>
      <span class="grow" />
      <span
        v-if="summary"
        class="shrink-0 font-mono text-slate-400 dark:text-slate-500"
        data-test="tool-name"
        >{{ call.name }}</span
      >
      <span
        class="shrink-0"
        :class="
          result?.isError
            ? 'text-red-700 dark:text-red-300'
            : result
              ? 'text-slate-400 dark:text-slate-500'
              : 'animate-pulse text-blue-600 dark:text-blue-300'
        "
        data-test="tool-status"
        >{{ status }}</span
      >
    </button>
    <div v-if="open" class="border-t border-slate-200 dark:border-slate-800">
      <pre
        class="overflow-x-auto px-2 py-1 font-mono whitespace-pre-wrap text-slate-700 dark:text-slate-300"
        data-test="tool-input"
        >{{ inputText }}</pre>
      <pre
        v-if="result"
        class="max-h-80 overflow-auto border-t border-slate-200 bg-slate-100 px-2 py-1 whitespace-pre-wrap dark:border-slate-800 dark:bg-slate-800"
        :class="
          result.isError ? 'text-red-800 dark:text-red-200' : 'text-slate-600 dark:text-slate-300'
        "
        data-item="tool_result"
        >{{ result.output || '(no output)' }}</pre>
    </div>
  </div>
</template>
