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
const tokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n)
const text = computed(() => {
  const parts = props.usage.windows.map((w) => `${w.name} ${w.usedPercent}%`)
  if (props.usage.context)
    parts.push(
      `ctx ${Math.round((100 * props.usage.context.used) / Math.max(1, props.usage.context.size))}%`,
    )
  // no windows (Bedrock, Vertex, Copilot): the session's spend is what there is
  if (props.usage.spend && props.usage.windows.length === 0)
    parts.push(
      props.usage.spend.costUsd !== undefined
        ? `$${props.usage.spend.costUsd.toFixed(2)}`
        : `${tokens(props.usage.spend.inputTokens + props.usage.spend.outputTokens)} tok`,
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
  if (props.usage.spend)
    lines.push(
      `this session: ${props.usage.spend.turns} turn${props.usage.spend.turns === 1 ? '' : 's'}, ${tokens(props.usage.spend.inputTokens)} in / ${tokens(props.usage.spend.outputTokens)} out${props.usage.spend.costUsd !== undefined ? `, $${props.usage.spend.costUsd.toFixed(2)}` : ''}`,
    )
  if (props.usage.provider) lines.push(`provider: ${props.usage.provider}`)
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
