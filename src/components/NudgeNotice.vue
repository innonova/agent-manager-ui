<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

/**
 * Lies over the flow's input while the manager is about to ask a
 * stopped agent whether it can go on (agent-manager's "Nudge"). It
 * says what will happen and when, and its one button calls it off: to
 * type here the person presses it first, so their message and the
 * manager's question cannot cross, and nobody wonders which of the two
 * the agent will get.
 */
const props = defineProps<{
  nudge: { state: 'reading' | 'waiting'; at: number | null }
  busy?: boolean
}>()
const emit = defineEmits<{ hold: [] }>()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 1000)))
onUnmounted(() => clearInterval(timer))

const left = computed(() => {
  if (props.nudge.at === null) return ''
  const s = Math.max(0, Math.round((props.nudge.at - now.value) / 1000))
  return s >= 90 ? `in ${Math.round(s / 60)} min` : s > 0 ? `in ${s} s` : 'now'
})
</script>

<template>
  <div
    class="absolute inset-0 z-10 flex items-center justify-between gap-3 rounded border border-blue-300 bg-blue-50/95 px-3 py-2 text-base dark:border-blue-900 dark:bg-slate-900/95"
    data-test="nudge-notice"
    role="status"
  >
    <p class="min-w-0 text-slate-700 dark:text-slate-200">
      <template v-if="nudge.state === 'reading'">
        It stopped. The manager is reading its last message to see whether it needs you.
      </template>
      <template v-else>
        It stopped with work left. The manager asks it
        <span class="font-medium" data-test="nudge-when">{{ left }}</span>
        whether it can go on or needs you.
      </template>
    </p>
    <button
      type="button"
      class="shrink-0 rounded border border-blue-600 bg-white px-3 py-1.5 text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800"
      title="call the question off: you are here, and what you write is what it gets next"
      data-test="nudge-hold"
      :disabled="busy"
      @click="emit('hold')"
    >
      I'll write instead
    </button>
  </div>
</template>
