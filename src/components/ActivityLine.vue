<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Activity } from '@/api/types'
import { THINKING_FOLD_CHARS } from '@/constants'
import { since } from '@/time'

const props = defineProps<{
  activity: Activity
  /** The current thinking item's text, live, while `activity.kind === 'thinking'`. */
  thinkingText?: string | null
  /** The name of the tool call under way, while `activity.kind === 'tool'`, for the phrase. */
  toolName?: string | null
}>()
/** Its own measured height, so the transcript's floating buttons can shift up to clear it. */
const emit = defineEmits<{ resize: [height: number] }>()

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

/** Only for text the transcript doesn't already show inline (it folds above this length); nothing would be gained by repeating a short one twice. */
const showThinkingBox = computed(
  () =>
    props.activity?.kind === 'thinking' &&
    !!props.thinkingText &&
    props.thinkingText.length > THINKING_FOLD_CHARS,
)

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

// An overlay, not laid out in flow (see the root wrapper below): its
// height still has to be known outside, so the transcript's own floating
// buttons can be nudged up clear of it while it shows.
const root = ref<HTMLDivElement | null>(null)
let observer: ResizeObserver | undefined
watch(root, (el, prev) => {
  if (prev && observer) observer.unobserve(prev)
  if (el && observer) observer.observe(el)
  if (!el) emit('resize', 0)
})
onMounted(() => {
  // borderBoxSize (not contentRect, which excludes padding) is the full
  // footprint the overlay actually covers, padding included.
  observer = new ResizeObserver((entries) =>
    emit('resize', entries[0]?.target.getBoundingClientRect().height ?? 0),
  )
  if (root.value) observer.observe(root.value)
})
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <!-- An overlay over the bottom of the transcript, not inserted above the
       composer: reflowing either on every turn start/end would move a
       reader's scroll position and the composer itself. Full width so its
       inner column can centre and align with the transcript's items. -->
  <div v-if="activity" ref="root" class="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-2">
    <div
      class="mx-auto max-w-3xl rounded bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur-sm dark:bg-slate-900/90"
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
        v-if="showThinkingBox"
        ref="box"
        class="mt-1 max-h-12 overflow-y-auto rounded bg-slate-50 px-2 py-1 font-mono text-[11px] leading-4 whitespace-pre-wrap text-slate-400 dark:bg-slate-950/40 dark:text-slate-500"
        data-test="activity-thinking"
      >
        {{ thinkingText }}
      </div>
    </div>
  </div>
</template>
