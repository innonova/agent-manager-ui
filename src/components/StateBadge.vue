<script setup lang="ts">
import type { AgentState } from '@/api/types'

defineProps<{ state: AgentState; title?: string; background?: number }>()

const styles: Record<AgentState, string> = {
  starting: 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  idle: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200',
  working: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 animate-pulse',
  'waiting-input': 'bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100',
  'waiting-permission': 'bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100',
  error: 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100',
  exited: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
}
</script>

<template>
  <span
    class="rounded px-1.5 py-0.5 text-sm"
    :class="styles[state]"
    :title="title ?? (background ? `${background} background job(s) pending` : undefined)"
    :data-state="state"
    :data-background="background || undefined"
    >{{ state }}<template v-if="background"> · {{ background }} bg</template></span
  >
</template>
