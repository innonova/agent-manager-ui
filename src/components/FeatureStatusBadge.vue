<script setup lang="ts">
import type { FeatureStatus } from '@/api/types'

defineProps<{ status: FeatureStatus }>()
const styles: Record<FeatureStatus, string> = {
  planned: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  queued: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  'in-progress': 'bg-blue-100 text-blue-800 animate-pulse dark:bg-blue-900 dark:text-blue-200',
  review: 'bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100',
  blocked: 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
}
</script>

<template>
  <span
    class="rounded px-1.5 py-0.5 text-xs font-medium"
    :class="styles[status]"
    :data-status="status"
    >{{ status }}</span
  >
</template>
