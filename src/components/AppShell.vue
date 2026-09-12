<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()

async function logout() {
  await session.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div class="flex h-screen flex-col bg-slate-50 text-slate-900">
    <header class="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2">
      <RouterLink :to="{ name: 'projects' }" class="font-semibold">agent-manager</RouterLink>
      <slot name="title" />
      <span class="grow" />
      <span
        v-if="!session.connected"
        class="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900"
        data-test="disconnected"
        >reconnecting…</span
      >
      <span
        v-else-if="!session.daemonConnected"
        class="rounded bg-red-100 px-2 py-0.5 text-xs text-red-900"
        data-test="daemon-down"
        >daemon unreachable</span
      >
      <span class="text-sm text-slate-500">{{ session.user?.name }}</span>
      <button class="text-sm text-slate-500 hover:text-slate-900" @click="logout">log out</button>
    </header>
    <main class="min-h-0 grow">
      <slot />
    </main>
  </div>
</template>
