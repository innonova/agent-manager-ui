<script setup lang="ts">
import { useNotificationsStore } from '@/stores/notifications'
const notifications = useNotificationsStore()
</script>

<template>
  <div class="pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 flex-col gap-2">
    <div
      v-for="t in notifications.toasts"
      :key="t.id"
      class="pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-lg"
      :class="
        t.level === 'error'
          ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
          : 'border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
      "
      role="status"
      @click="notifications.dismiss(t.id)"
    >
      {{ t.text }}
    </div>
  </div>
</template>
