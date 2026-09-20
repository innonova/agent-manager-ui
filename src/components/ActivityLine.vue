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

/**
 * Words for a thinking stretch: quiet ones and sillier ones, all of them
 * the model turning something over. The session's first is the plain
 * one; after that one is drawn at random, never the one just shown.
 */
const THINKING_WORDS = [
  'thinking',
  'musing',
  'pondering',
  'mulling',
  'weighing',
  'considering',
  'contemplating',
  'deliberating',
  'ruminating',
  'cogitating',
  'noodling',
  'percolating',
  'brewing',
  'simmering',
  'stewing',
  'marinating',
  'incubating',
  'hatching',
  'scheming',
  'puzzling',
  'untangling',
  'sifting',
  'distilling',
  'digesting',
  'chewing on it',
  'turning it over',
  'working it out',
  'connecting the dots',
  'scratching its head',
  'gathering wool',
  'wondering',
  'reckoning',
]
/** How long a word stays before the next: long enough to read, short enough that a real stretch shows a few. */
const THINKING_WORD_MS = 4000
let wordsShown = 0
const thinkingWord = ref(THINKING_WORDS[0])
/** When the current word was picked, so it holds for `THINKING_WORD_MS` before the next. */
let wordPickedAt = 0
/** The `since` of the stretch the current word was picked for, so a token-only update (same stretch) does not reroll it. */
const wordedSince = ref<number | null>(null)
function pickThinkingWord(at: number) {
  wordPickedAt = at
  if (wordsShown++ === 0) return // the plain word first
  const others = THINKING_WORDS.filter((w) => w !== thinkingWord.value)
  thinkingWord.value = others[Math.floor(Math.random() * others.length)]!
}
watch(
  () => (props.activity?.kind === 'thinking' ? props.activity.since : null),
  (thinkingSince) => {
    if (thinkingSince == null || thinkingSince === wordedSince.value) return
    wordedSince.value = thinkingSince
    pickThinkingWord(Date.now())
  },
  { immediate: true },
)

/**
 * What kind of thing a tool call is, from its name; the transcript already
 * has the command or path, so the line just says the shape of it. Claude
 * Code's, Codex's and Copilot's names, as far as they are known here.
 */
const TOOL_PHRASES: Record<string, string> = {
  Bash: 'running a command',
  shell: 'running a command',
  bash: 'running a command',
  Read: 'reading a file',
  view: 'reading a file',
  Write: 'editing a file',
  Edit: 'editing a file',
  NotebookEdit: 'editing a file',
  edit: 'editing a file',
  create: 'editing a file',
  str_replace_editor: 'editing a file',
  Glob: 'searching',
  Grep: 'searching',
  grep: 'searching',
  glob: 'searching',
  WebSearch: 'searching the web',
  WebFetch: 'fetching a page',
  Agent: 'running a helper',
  Task: 'running a helper',
  TodoWrite: 'updating its plan',
  Skill: 'loading a skill',
  ToolSearch: 'looking up a tool',
  Monitor: 'watching a job',
}
/** A name with no phrase still says which tool: "running WebPreview"; an MCP tool by its own name, its server dropped. */
function toolPhrase(name: string | null | undefined): string {
  if (!name) return 'waiting for a tool'
  const known = TOOL_PHRASES[name]
  if (known) return known
  const mcp = /^mcp__[^_]+(?:_[^_]+)*__(.+)$/.exec(name)
  return `running ${mcp ? mcp[1] : name}`
}

/** Ticks once a second so "thinking for Ns" advances locally between status updates. */
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
    // a long stretch shows a few words, not one for a minute
    if (props.activity?.kind === 'thinking' && now.value - wordPickedAt >= THINKING_WORD_MS)
      pickThinkingWord(now.value)
  }, 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

/** requesting, thinking and tool are open-ended enough to want elapsed time and a token count; writing and waiting already show themselves. */
const timed = computed(
  () =>
    props.activity?.kind === 'requesting' ||
    props.activity?.kind === 'thinking' ||
    props.activity?.kind === 'tool',
)

const durationText = computed(() => {
  const a = props.activity
  return a && timed.value ? since(a.since, now.value) : null
})

/** The state, without the count: the ellipsis goes right after it. */
const stateText = computed(() => {
  const a = props.activity
  if (!a) return ''
  switch (a.kind) {
    case 'requesting':
      // the request is out and nothing has come back: the wait before
      // every message of a turn, not only the first
      return 'waiting for the model'
    case 'thinking':
      return thinkingWord.value
    case 'writing':
      return 'writing'
    case 'tool':
      return toolPhrase(props.toolName)
    case 'waiting':
      return 'waiting for your answer'
    default:
      return ''
  }
})
/** The turn's count so far, beside the elapsed time on the right, when the vendor has given one and the kind carries it. */
const tokensText = computed(() => {
  const a = props.activity
  if (!a || a.tokens == null || !timed.value) return ''
  return `${a.tokens.toLocaleString('en-US')} tokens`
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
      <!-- What it does on the left, its measures on the right: the word
           changes every few seconds and the count every second, and neither
           may push the other about, so each side has its own edge. -->
      <div
        class="flex items-baseline justify-between gap-3 text-sm text-slate-500 dark:text-slate-400"
        data-test="activity-label"
      >
        <span class="min-w-0 truncate">
          <Transition name="word" mode="out-in">
            <span :key="stateText">{{ stateText }}</span>
          </Transition>
          <span v-if="timed" class="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>
        </span>
        <span v-if="durationText" class="shrink-0 tabular-nums">
          <span v-if="tokensText" data-test="activity-tokens">{{ tokensText }} · </span>
          <span data-test="activity-duration">{{ durationText }}</span>
        </span>
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

<style scoped>
/* The word swaps with a short crossfade rather than a jump. */
.word-enter-active,
.word-leave-active {
  transition: opacity 0.15s ease;
}
.word-enter-from,
.word-leave-to {
  opacity: 0;
}
/* An ellipsis that breathes: the three dots light up in turn, so the
   line is visibly alive between the once-a-second status updates. Fixed
   width, so the token count after it does not shift as they fade. */
.dots {
  display: inline-block;
  width: 1.1em;
  text-align: left;
}
.dots i {
  font-style: normal;
  animation: dot 1.2s infinite;
  opacity: 0.25;
}
.dots i:nth-child(2) {
  animation-delay: 0.2s;
}
.dots i:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes dot {
  0%,
  60%,
  100% {
    opacity: 0.25;
  }
  30% {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dots i {
    animation: none;
    opacity: 0.6;
  }
}
</style>
