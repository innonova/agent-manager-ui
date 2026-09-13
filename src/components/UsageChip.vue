<script setup lang="ts">
import { computed } from 'vue'
import type { AccountUsage } from '@/api/types'
import { when } from '@/time'

/** The account's rolling windows as "5h 33% · 7d 41%", coloured by how close to the limit they are. */
const props = defineProps<{ usage: AccountUsage; compact?: boolean }>()
const worst = computed(() => Math.max(0, ...props.usage.windows.map((w) => w.usedPercent)))
// plain text in the facts line's own grey; near a limit it tints, lightly, so it can be found but does not shout
const tone = computed(() =>
  props.usage.status === 'rejected' || worst.value >= 100
    ? 'text-red-600/70 dark:text-red-400/70'
    : props.usage.status === 'warning' || worst.value >= 80
      ? 'text-amber-600/70 dark:text-amber-400/70'
      : 'text-slate-400 dark:text-slate-500',
)
const tokens = (n: number) =>
  n >= 999_500 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n)
/** What the agent has spent over all its sessions, or this one's when it has had only one. */
const spent = computed(() => props.usage.total ?? props.usage.spend)
const spendLine = (s: NonNullable<AccountUsage['spend']>) =>
  `${s.turns} turn${s.turns === 1 ? '' : 's'}, ${tokens(s.inputTokens)} in / ${tokens(s.outputTokens)} out${s.costUsd !== undefined ? `, $${s.costUsd.toFixed(2)}` : ''}`
const text = computed(() => {
  const parts = props.usage.windows.map((w) => `${w.name} ${w.usedPercent}%`)
  if (props.usage.context)
    parts.push(
      `ctx ${Math.round((100 * props.usage.context.used) / Math.max(1, props.usage.context.size))}%`,
    )
  // no windows (Bedrock, Vertex, Copilot): the agent's spend is what there is
  if (spent.value && props.usage.windows.length === 0)
    parts.push(
      spent.value.costUsd !== undefined
        ? `$${spent.value.costUsd.toFixed(2)}`
        : `${tokens(spent.value.inputTokens + spent.value.outputTokens)} tok`,
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
  // the vendor's counters start over at a restart: the total is the agent's, the session line is since the last restart
  if (props.usage.total) lines.push(`all sessions: ${spendLine(props.usage.total)}`)
  if (props.usage.spend)
    lines.push(
      `${props.usage.total ? 'since the last restart' : 'this session'}: ${spendLine(props.usage.spend)}`,
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
    class="font-mono text-xs whitespace-nowrap"
    :class="tone"
    :title="title"
    data-test="usage-chip"
    >{{ text }}</span
  >
</template>
