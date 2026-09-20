<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Activity } from '@/api/types'
import { since } from '@/time'

const props = defineProps<{
  activity: Activity
  /** The current thinking item's text, live, while `activity.kind === 'thinking'`. */
  thinkingText?: string | null
  /** The name of the tool call under way, while `activity.kind === 'tool'`, for the phrase. */
  toolName?: string | null
}>()

/** Quiet words for a thinking stretch; one is picked per stretch, not per tick. */
const THINKING_WORDS = ['thinking', 'musing', 'pondering', 'weighing', 'considering']
let nextThinkingWord = 0
const thinkingWord = ref(THINKING_WORDS[0])
/** The `since` of the stretch the current word was picked for, so a token-only update (same stretch) does not reroll it. */
const wordedSince = ref<number | null>(null)
watch(
  () => (props.activity?.kind === 'thinking' ? props.activity.since : null),
  (thinkingSince) => {
    if (thinkingSince == null || thinkingSince === wordedSince.value) return
    wordedSince.value = thinkingSince
    thinkingWord.value = THINKING_WORDS[nextThinkingWord % THINKING_WORDS.length]
    nextThinkingWord++
  },
  { immediate: true },
)

/**
 * What kind of thing a tool call is, from its name; the transcript already
 * has the command or path, so the line just says the shape of it.
 */
const TOOL_PHRASES: Record<string, string> = {
  Bash: 'running a command',
  shell: 'running a command',
  Read: 'reading a file',
  Write: 'editing a file',
  Edit: 'editing a file',
  NotebookEdit: 'editing a file',
  Glob: 'searching',
  Grep: 'searching',
  WebSearch: 'searching',
}
const FALLBACK_TOOL_PHRASE = 'waiting for a tool'

/** Ticks once a second so "thinking for Ns" advances locally between status updates. */
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

/** thinking and tool are open-ended enough to want elapsed time and a token count; writing and waiting already show themselves. */
const timed = computed(() => props.activity?.kind === 'thinking' || props.activity?.kind === 'tool')

const durationText = computed(() => {
  const a = props.activity
  return a && timed.value ? since(a.since, now.value) : null
})

const leftText = computed(() => {
  const a = props.activity
  if (!a) return ''
  const tokensSuffix = a.tokens != null ? ` · ${a.tokens} tokens` : ''
  switch (a.kind) {
    case 'thinking':
      return `${thinkingWord.value}${tokensSuffix}`
    case 'writing':
      return 'writing'
    case 'tool':
      return `${(props.toolName && TOOL_PHRASES[props.toolName]) || FALLBACK_TOOL_PHRASE}${tokensSuffix}`
    case 'waiting':
      return 'waiting for your answer'
    default:
      return ''
  }
})

// Pinned to the bottom as the thinking text grows, so older lines scroll
// away and the newest is always visible without a scrollbar to operate.
const box = ref<HTMLDivElement | null>(null)
watch(
  () => props.thinkingText,
  () =>
    void nextTick(() => {
      if (box.value) box.value.scrollTop = box.value.scrollHeight
    }),
)
</script>

<template>
  <div
    v-if="activity"
    class="border-t border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900"
    data-test="activity-line"
  >
    <div
      class="flex items-baseline justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"
      data-test="activity-label"
    >
      <span>{{ leftText }}</span>
      <span v-if="durationText" class="tabular-nums" data-test="activity-duration">{{
        durationText
      }}</span>
    </div>
    <div
      v-if="activity.kind === 'thinking' && thinkingText"
      ref="box"
      class="mt-1 max-h-20 overflow-y-auto rounded bg-slate-50 px-2 py-1 font-mono text-[11px] leading-4 text-slate-400 whitespace-pre-wrap dark:bg-slate-950/40 dark:text-slate-500"
      data-test="activity-thinking"
    >
      {{ thinkingText }}
    </div>
  </div>
</template>
