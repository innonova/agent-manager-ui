<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { Item } from '@/api/types'
import { THINKING_FOLD_CHARS } from '@/constants'
import { when } from '@/time'

const props = defineProps<{ item: Item; at?: number }>()
const time = computed(() => (props.at ? when(props.at) : ''))
const emit = defineEmits<{ decide: [requestId: string, option: string] }>()
/** Set on the first click; the manager's item update replaces the card with the decision. */
const deciding = ref(false)
/** Browsers refuse to navigate to a data: URL from a page; a blob URL opens fine. */
function openImage(img: { mediaType: string; data: string }) {
  const bytes = Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: img.mediaType }))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
let decidingTimer: number | null = null
function decide(requestId: string, option: string) {
  if (deciding.value) return
  deciding.value = true
  // the manager's item update normally replaces the card; if the decision
  // was refused (a toast says so) the buttons come back after a moment
  decidingTimer = window.setTimeout(() => (deciding.value = false), 4000)
  emit('decide', requestId, option)
}
watch(
  () => props.item,
  () => {
    deciding.value = false // a different item under this index
    if (decidingTimer) clearTimeout(decidingTimer)
  },
)
const open = ref(false)
const permissionInput = computed(() =>
  props.item.kind === 'permission'
    ? typeof (props.item.input as { command?: unknown })?.command === 'string'
      ? String((props.item.input as { command: string }).command)
      : JSON.stringify(props.item.input, null, 2)
    : '',
)
const decidedLabel = computed(() => {
  if (props.item.kind !== 'permission' || !props.item.decision) return ''
  const d = props.item.decision
  return props.item.options.find((o) => o.id === d)?.label ?? d
})
const OPTION_CLASS: Record<string, string> = {
  allow:
    'border-emerald-500 text-emerald-800 hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-950',
  'allow-always':
    'border-emerald-500 text-emerald-800 hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-950',
  deny: 'border-red-400 text-red-800 hover:bg-red-50 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-950',
}

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
  <div
    v-if="item.kind === 'user'"
    class="rounded-r border-l-2 border-blue-500 bg-blue-50/70 px-3 py-2 dark:bg-blue-950/40"
    data-item="user"
    :title="time"
  >
    <div class="mb-0.5 flex items-baseline gap-2 text-sm text-slate-500 dark:text-slate-400">
      <span
        v-if="item.by"
        class="font-medium text-slate-700 dark:text-slate-300"
        data-test="turn-by"
        >{{ item.by }}</span
      >
      <span>{{ time }}</span>
    </div>
    <div class="whitespace-pre-wrap">{{ item.text }}</div>
    <div v-if="item.images?.length" class="mt-2 flex flex-wrap gap-2" data-test="user-images">
      <a
        v-for="(img, i) in item.images"
        :key="i"
        href="#"
        title="Open full size"
        @click.prevent="openImage(img)"
      >
        <img
          :src="`data:${img.mediaType};base64,${img.data}`"
          alt="pasted image"
          class="max-h-40 max-w-[16rem] rounded border border-blue-300 object-contain dark:border-blue-800"
        />
      </a>
    </div>
  </div>

  <div
    v-else-if="item.kind === 'text'"
    class="prose dark:prose-invert max-w-none"
    :data-item="item.streaming ? 'text-streaming' : 'text'"
  >
    <div v-html="html" />
    <span
      v-if="item.streaming"
      class="inline-block h-4 w-2 animate-pulse bg-slate-400 align-text-bottom dark:bg-slate-500"
    />
  </div>

  <div
    v-else-if="item.kind === 'permission'"
    class="rounded border px-3 py-2 text-base"
    :class="
      item.decision
        ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
        : 'border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950'
    "
    data-item="permission"
    :data-decision="item.decision ?? undefined"
  >
    <div class="flex items-center gap-2">
      <span class="font-mono text-sm font-semibold">{{ item.tool }}</span>
      <span class="truncate">{{ item.title }}</span>
      <span class="grow" />
      <span v-if="item.decision" class="text-sm text-slate-500 dark:text-slate-400">{{
        decidedLabel
      }}</span>
      <span v-else class="animate-pulse text-sm text-amber-800 dark:text-amber-200"
        >waiting for you<template v-if="time"> since {{ time }}</template></span
      >
    </div>
    <pre
      v-if="permissionInput"
      class="mt-1 overflow-x-auto font-mono text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300"
      >{{ permissionInput }}</pre>
    <div v-if="!item.decision" class="mt-2 flex gap-2 text-sm">
      <button
        v-for="o in item.options"
        :key="o.id"
        class="rounded border px-3 py-1 disabled:opacity-50"
        :class="OPTION_CLASS[o.kind]"
        :disabled="deciding"
        :data-test="`permission-${o.kind}`"
        @click="decide(item.requestId, o.id)"
      >
        {{ o.label }}
      </button>
    </div>
  </div>

  <!-- Summarised thinking is short, curated commentary, worth reading in
       place; only a long block is folded. -->
  <div
    v-else-if="item.kind === 'thinking' && item.text.length <= THINKING_FOLD_CHARS"
    class="text-base whitespace-pre-wrap"
    data-item="thinking"
  >
    {{ item.text }}
  </div>
  <details
    v-else-if="item.kind === 'thinking'"
    class="text-sm text-slate-500 dark:text-slate-400"
    data-item="thinking"
  >
    <summary class="cursor-pointer select-none">thinking · {{ item.text.length }} chars</summary>
    <div class="mt-1 border-l-2 border-slate-200 pl-2 whitespace-pre-wrap dark:border-slate-800">
      {{ item.text }}
    </div>
  </details>

  <div
    v-else-if="item.kind === 'tool_use'"
    class="rounded border border-slate-200 bg-white text-sm dark:border-slate-800 dark:bg-slate-900"
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
    class="ml-4 text-sm"
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
    class="rounded border border-red-300 bg-red-50 px-3 py-2 text-base text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
    data-item="error"
  >
    {{ item.message }}
  </div>

  <div
    v-else-if="item.kind === 'system'"
    class="text-sm text-slate-400 dark:text-slate-500"
    data-item="system"
  >
    <span v-if="time" class="mr-2 tabular-nums">{{ time }}</span
    >{{ item.text }}
  </div>

  <div
    v-else-if="item.kind === 'turn_end'"
    class="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500"
    data-item="turn_end"
  >
    <span class="h-px grow bg-slate-200 dark:bg-slate-700" />
    <span v-if="time" data-test="turn-end-time">{{ time }}</span>
    <span v-if="duration">{{ duration }}</span>
    <span v-if="cost">{{ cost }}</span>
    <span class="h-px grow bg-slate-200 dark:bg-slate-700" />
  </div>
</template>
