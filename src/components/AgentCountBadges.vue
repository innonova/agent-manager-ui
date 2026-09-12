<script setup lang="ts">
import type { AgentCounts, AgentState } from '@/api/types'
import StateBadge from './StateBadge.vue'

defineProps<{ counts: AgentCounts }>()
const order: AgentState[] = [
  'working',
  'waiting-input',
  'waiting-permission',
  'error',
  'idle',
  'starting',
  'exited',
]
</script>

<template>
  <span class="flex flex-wrap gap-1">
    <template v-for="s in order" :key="s">
      <span v-if="counts[s] > 0" class="flex items-center gap-1 text-xs" :data-count="s">
        <span class="font-mono">{{ counts[s] }}</span>
        <StateBadge :state="s" />
      </span>
    </template>
    <span v-if="order.every((s) => counts[s] === 0)" class="text-xs text-slate-400">no agents</span>
  </span>
</template>
