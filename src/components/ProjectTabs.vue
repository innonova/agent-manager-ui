<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

defineProps<{ id: string }>()
const route = useRoute()
const tab = (name: string) =>
  route.name === name || (name === 'project' && route.name === 'agent')
    ? 'border-blue-600 text-slate-900 dark:text-slate-100'
    : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
</script>

<template>
  <nav class="flex gap-4 text-sm">
    <RouterLink
      :to="{ name: 'project', params: { id } }"
      class="border-b-2 py-1"
      :class="tab('project')"
      data-test="tab-agents"
      >agents</RouterLink
    >
    <RouterLink
      :to="{ name: 'files', params: { id } }"
      class="border-b-2 py-1"
      :class="tab('files')"
      data-test="tab-files"
      >files</RouterLink
    >
  </nav>
</template>
