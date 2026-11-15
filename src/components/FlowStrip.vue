<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Activity, AgentState } from '@/api/types'
import { toolPhrase } from '@/activity'
import { since } from '@/time'

/**
 * The flow, folded to one line above the chat: what the agent is doing
 * right now and for how long, and a click away from the whole of it.
 */
const props = defineProps<{
  state: AgentState
  activity: Activity
  toolName?: string | null
}>()
defineEmits<{ open: [] }>()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => (timer = setInterval(() => (now.value = Date.now()), 1000)))
onUnmounted(() => clearInterval(timer))

const text = computed(() => {
  const a = props.activity
  if (!a) return props.state
  switch (a.kind) {
    case 'requesting':
      return 'waiting for the model'
    case 'thinking':
      return 'thinking'
    case 'writing':
      return 'writing'
    case 'tool':
      return toolPhrase(props.toolName)
    case 'waiting':
      return 'waiting for your answer'
    default:
      return props.state
  }
})
const elapsed = computed(() =>
  props.activity && props.activity.kind !== 'writing' ? since(props.activity.since, now.value) : '',
)
</script>

<template>
  <button
    type="button"
    class="flex w-full shrink-0 items-baseline gap-2 border-b border-slate-200 bg-white px-4 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
    title="show the flow: everything the agent does, as it does it"
    data-test="flow-strip"
    @click="$emit('open')"
  >
    <span class="text-slate-400 dark:text-slate-500">▸ flow</span>
    <span class="min-w-0 grow truncate" data-test="flow-strip-activity">{{ text }}</span>
    <span v-if="elapsed" class="shrink-0 tabular-nums">{{ elapsed }}</span>
  </button>
</template>
