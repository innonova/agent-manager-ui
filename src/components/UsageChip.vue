<script setup lang="ts">
import { computed } from 'vue'
import type { AccountUsage } from '@/api/types'
import { when } from '@/time'

/** The account's rolling windows as "5h 33% · 7d 41%", coloured by how close to the limit they are. */
const props = defineProps<{ usage: AccountUsage; compact?: boolean }>()
const worst = computed(() => Math.max(0, ...props.usage.windows.map((w) => w.usedPercent)))
const tone = computed(() =>
  props.usage.status === 'rejected' || worst.value >= 100
    ? 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100'
    : props.usage.status === 'warning' || worst.value >= 80
      ? 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
)
const text = computed(() => {
  const parts = props.usage.windows.map((w) => `${w.name} ${w.usedPercent}%`)
  if (props.usage.context)
    parts.push(
      `ctx ${Math.round((100 * props.usage.context.used) / Math.max(1, props.usage.context.size))}%`,
    )
  return parts.join(' · ')
})
const title = computed(() => {
  const lines = props.usage.windows.map(
    (w) => `${w.name}: ${w.usedPercent}% used${w.resetsAt ? `, resets ${when(w.resetsAt)}` : ''}`,
  )
  if (props.usage.context)
    lines.push(
      `context: ${props.usage.context.used.toLocaleString()} of ${props.usage.context.size.toLocaleString()} tokens`,
    )
  if (props.usage.plan) lines.push(`plan: ${props.usage.plan}`)
  lines.push(`reported ${when(props.usage.at)}`)
  return lines.join('\n')
})
</script>

<template>
  <span
    v-if="text"
    class="rounded px-1.5 py-0.5 font-mono text-xs whitespace-nowrap"
    :class="tone"
    :title="title"
    data-test="usage-chip"
    >{{ text }}</span
  >
</template>
