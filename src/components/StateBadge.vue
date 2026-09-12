<script setup lang="ts">
import type { AgentState } from '@/api/types'

defineProps<{ state: AgentState; title?: string }>()

const styles: Record<AgentState, string> = {
  starting: 'bg-slate-200 text-slate-700',
  idle: 'bg-emerald-100 text-emerald-800',
  working: 'bg-blue-100 text-blue-800 animate-pulse',
  'waiting-input': 'bg-amber-100 text-amber-900',
  'waiting-permission': 'bg-amber-100 text-amber-900',
  error: 'bg-red-100 text-red-900',
  exited: 'bg-slate-100 text-slate-500',
}
</script>

<template>
  <span
    class="rounded px-1.5 py-0.5 text-xs font-medium"
    :class="styles[state]"
    :title="title"
    :data-state="state"
    >{{ state }}</span
  >
</template>
