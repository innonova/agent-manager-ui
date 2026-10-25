<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import SettingsMenu from '@/components/SettingsMenu.vue'
import { useSessionStore } from '@/stores/session'
import { useUpdateStore } from '@/stores/update'
import { useAttentionStore } from '@/stores/attention'
import { useProjectsStore } from '@/stores/projects'

const session = useSessionStore()
const update = useUpdateStore()
useAttentionStore() // keeps the title and favicon badge current on every page
const projects = useProjectsStore()
if (!projects.loaded) void projects.load()
const router = useRouter()

async function logout() {
  await session.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div
    class="flex h-[var(--app-h,100%)] translate-y-[var(--app-top,0px)] flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
  >
    <header
      class="flex items-center gap-3 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 whitespace-nowrap md:gap-4 md:overflow-visible md:px-4 md:whitespace-normal dark:border-slate-800 dark:bg-slate-900"
    >
      <RouterLink :to="{ name: 'projects' }" class="hidden font-semibold md:inline"
        >agent-manager</RouterLink
      >
      <slot name="title" />
      <span class="grow" />
      <button
        v-if="update.available"
        class="rounded bg-blue-600 px-2 py-0.5 text-sm text-white hover:bg-blue-700"
        title="A newer version of this page is available"
        data-test="update-available"
        @click="update.reload()"
      >
        update available · reload
      </button>
      <span
        v-if="session.offline"
        class="rounded bg-amber-100 px-2 py-0.5 text-sm text-amber-900 dark:bg-amber-900 dark:text-amber-100"
        data-test="disconnected"
        >reconnecting…</span
      >
      <span
        v-else-if="!session.daemonConnected"
        class="rounded bg-red-100 px-2 py-0.5 text-sm text-red-900 dark:bg-red-900 dark:text-red-100"
        data-test="daemon-down"
        >daemon unreachable</span
      >
      <SettingsMenu />
      <span class="text-base text-slate-500 dark:text-slate-400">{{ session.user?.name }}</span>
      <button
        class="text-base text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        @click="logout"
      >
        log out
      </button>
    </header>
    <main class="min-h-0 grow overflow-y-auto">
      <slot />
    </main>
  </div>
</template>
