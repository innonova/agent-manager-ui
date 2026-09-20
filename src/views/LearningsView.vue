<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ApiError, api } from '@/api/client'
import type { Learning } from '@/api/types'
import AppShell from '@/components/AppShell.vue'
import { useHostsStore } from '@/stores/hosts'
import { useNotificationsStore } from '@/stores/notifications'
import { when } from '@/time'

/**
 * The install's learnings log: observations about running agents and
 * working with them, appended at the moment of noticing and never
 * edited; the method is curated from it now and then. Newest first here,
 * the file itself is oldest first.
 */
const route = useRoute()
const router = useRouter()
const hosts = useHostsStore()
const notifications = useNotificationsStore()
const host = ref(String(route.query.host ?? ''))
const entries = ref<Learning[]>([])
const text = ref('')
const refText = ref('')
const busy = ref(false)
const loaded = ref(false)

const newestFirst = computed(() => [...entries.value].reverse())
async function load() {
  entries.value = (
    await api.learnings(host.value || undefined).catch(() => ({ entries: [] }))
  ).entries
  loaded.value = true
}
function pick(h: string) {
  host.value = h
  void router.replace({ name: 'learnings', query: { host: h } })
  void load()
}
async function add() {
  if (!text.value.trim()) return
  busy.value = true
  try {
    await api.addLearning(
      text.value.trim(),
      refText.value.trim() || undefined,
      host.value || undefined,
    )
    text.value = ''
    refText.value = ''
    await load()
  } catch (e) {
    notifications.push('error', e instanceof ApiError ? e.message : String(e))
  } finally {
    busy.value = false
  }
}
onMounted(load)
</script>

<template>
  <AppShell>
    <template #title>
      <span class="text-base text-slate-500 dark:text-slate-400">
        <RouterLink :to="{ name: 'projects' }" class="hover:underline">projects</RouterLink>
        · learnings
      </span>
    </template>
    <div class="mx-auto flex h-full min-h-0 max-w-3xl flex-col px-4 py-3">
      <div v-if="hosts.several" class="mb-3 flex gap-1" data-test="learnings-hosts">
        <button
          v-for="h in hosts.list"
          :key="h.name"
          type="button"
          class="rounded px-2 py-0.5 text-base"
          :class="
            h.name === host || (!host && h.local)
              ? 'bg-slate-200 font-medium dark:bg-slate-700'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
          "
          @click="pick(h.name)"
        >
          {{ h.name }}
        </button>
      </div>
      <form class="mb-4 flex flex-col gap-2" @submit.prevent="add">
        <textarea
          v-model="text"
          rows="3"
          class="w-full rounded border border-slate-300 bg-white px-2 py-1 text-base dark:border-slate-700 dark:bg-slate-950"
          placeholder="Something learned about running agents or working with them: what happened, with the evidence. An observation, not a rule."
          data-test="learning-text"
        ></textarea>
        <div class="flex items-center gap-2">
          <input
            v-model="refText"
            class="grow rounded border border-slate-300 bg-white px-2 py-1 text-base dark:border-slate-700 dark:bg-slate-950"
            placeholder="pointer, optional: a run id, a feature slug, a commit"
            data-test="learning-ref"
          />
          <button
            type="submit"
            class="rounded bg-blue-600 px-3 py-1 text-base text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="busy || !text.trim()"
            data-test="learning-add"
          >
            add
          </button>
        </div>
      </form>
      <ol class="min-h-0 grow overflow-y-auto" data-test="learnings">
        <li
          v-for="e in newestFirst"
          :key="e.n"
          class="border-t border-slate-200 py-3 text-base dark:border-slate-800"
          data-test="learning"
        >
          <div class="mb-1 text-sm text-slate-500 dark:text-slate-400">
            #{{ e.n }} · {{ when(e.at) }} · {{ e.by }}<span v-if="e.ref"> · {{ e.ref }}</span>
          </div>
          <div class="whitespace-pre-wrap">{{ e.text }}</div>
        </li>
        <li
          v-if="loaded && entries.length === 0"
          class="py-3 text-base text-slate-500 dark:text-slate-400"
        >
          Nothing recorded yet. Agents add entries with <code>am learn</code>; people here.
        </li>
      </ol>
    </div>
  </AppShell>
</template>
