<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Activity } from '@/api/types'
import { since } from '@/time'

const props = defineProps<{
  activity: Activity
  /** The current thinking item's text, live, while `activity.kind === 'thinking'`. */
  thinkingText?: string | null
  /** The name of the tool call under way, while `activity.kind === 'tool'`, for the verb. */
  toolName?: string | null
}>()

/** How to say what a tool call is doing, from its name; unknown names just "run". */
const TOOL_VERBS: Record<string, string> = {
  Bash: 'running',
  shell: 'running',
  Read: 'reading',
  Write: 'editing',
  Edit: 'editing',
  NotebookEdit: 'editing',
  Glob: 'searching',
  Grep: 'searching',
  WebFetch: 'fetching',
  WebSearch: 'searching',
}

/** Ticks once a second so "thinking for Ns" advances locally between status updates. */
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const label = computed(() => {
  const a = props.activity
  if (!a) return ''
  switch (a.kind) {
    case 'thinking':
      return `thinking for ${since(a.since, now.value)}`
    case 'writing':
      return 'writing'
    case 'tool': {
      const verb = (props.toolName && TOOL_VERBS[props.toolName]) || 'running'
      return a.detail ? `${verb} \`${a.detail}\`` : verb
    }
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
    <div class="text-xs text-slate-500 dark:text-slate-400" data-test="activity-label">
      {{ label }}
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
