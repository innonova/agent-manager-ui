<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api } from '@/api/client'
import type { AccountUsageRow, HarnessRow } from '@/api/types'
import AppShell from '@/components/AppShell.vue'
import UsageChip from '@/components/UsageChip.vue'
import { events } from '@/api/events'
import { useHostsStore } from '@/stores/hosts'

/**
 * This machine, and on a hub the others: what the vendor accounts are up
 * to and the four texts an operator keeps (the harness note, the models
 * file, the method, the framing) with the learnings log. Read once a
 * week and edited less, so it lives off the projects page.
 */
const hosts = useHostsStore()
const usage = ref<{ host: string; accounts: AccountUsageRow[] }[]>([])
async function loadUsage() {
  usage.value = (await api.usage().catch(() => ({ hosts: [] }))).hosts
}
let usageTimer: number | null = null
const usageSeen = new Map<string, number>()
const offUsage = events.on((f) => {
  if (f.type !== 'agent.state' || !f.status.usage) return
  if (usageSeen.get(f.agentId) === f.status.usage.at) return
  usageSeen.set(f.agentId, f.status.usage.at)
  if (usageTimer) clearTimeout(usageTimer)
  usageTimer = window.setTimeout(() => void loadUsage(), 500)
})
onUnmounted(() => {
  offUsage?.()
  if (usageTimer) clearTimeout(usageTimer)
})

/** Per host, the harness note's template: what every agent there is told at session start. */
const harness = ref<HarnessRow[]>([])
/** Per host, the models file: the house view rendered into every note. */
const models = ref<HarnessRow[]>([])
/** Per host, the method: how work is run under this manager. */
const method = ref<HarnessRow[]>([])
/** Per host, the framing: how a feature and a brief are written, the method's companion. */
const framing = ref<HarnessRow[]>([])
async function loadHarness() {
  harness.value = (await api.harness().catch(() => ({ hosts: [] }))).hosts
  models.value = (await api.noteFile('models').catch(() => ({ hosts: [] }))).hosts
  method.value = (await api.noteFile('method').catch(() => ({ hosts: [] }))).hosts
  framing.value = (await api.noteFile('framing').catch(() => ({ hosts: [] }))).hosts
}
const sourceLabel = (s: HarnessRow['source'], what: 'note' | 'text') =>
  s === 'built-in' ? `the shipped ${what}` : s === 'custom' ? `a custom ${what}` : 'off'
/**
 * The four texts and the log, one row each, per machine: what it is,
 * what it is for, what is in force, and where to read or edit it. One
 * block of rows rather than a card per text: the answer to "what is this
 * machine running on" is a glance down one column.
 */
const rows = computed(() => {
  const hostNames = [...new Set(harness.value.map((r) => r.host))]
  const of = (list: HarnessRow[], host: string) => list.find((r) => r.host === host) ?? null
  return hostNames.map((host) => {
    const items: {
      key: string
      name: string
      what: string
      source: string | null
      route: string
      link: string
    }[] = []
    const h = of(harness.value, host)
    if (h)
      items.push({
        key: 'harness',
        name: 'Harness note',
        what: 'What every agent is told about running here, at session start; a change reaches an agent at its next restart.',
        source: sourceLabel(h.source, 'note'),
        route: 'harness',
        link: 'view / edit',
      })
    const m = of(models.value, host)
    if (m)
      items.push({
        key: 'models',
        name: 'Models',
        what: 'Which model suits which work, as we have learned it; rendered into every note, so an agent that starts a helper chooses with it in front of it.',
        source: sourceLabel(m.source, 'text'),
        route: 'models',
        link: 'view / edit',
      })
    const me = of(method.value, host)
    if (me)
      items.push({
        key: 'method',
        name: 'Method',
        what: 'How work is run here: features, the gate, helpers, reviews.',
        source: sourceLabel(me.source, 'text'),
        route: 'method',
        link: 'view / edit',
      })
    const fr = of(framing.value, host)
    if (fr)
      items.push({
        key: 'framing',
        name: 'Framing',
        what: 'How a feature and a brief are written; the method’s companion.',
        source: sourceLabel(fr.source, 'text'),
        route: 'framing',
        link: 'view / edit',
      })
    if (me)
      items.push({
        key: 'learnings',
        name: 'Learnings',
        what: 'What anyone learned, recorded at the moment of noticing; the method and the framing are curated from it now and then.',
        source: null,
        route: 'learnings',
        link: 'read',
      })
    return { host, items }
  })
})

onMounted(() => {
  void loadUsage()
  void loadHarness()
})
</script>

<template>
  <AppShell>
    <template #title>
      <span class="text-slate-400 dark:text-slate-500">/</span>
      <RouterLink :to="{ name: 'projects' }" class="hover:underline">projects</RouterLink>
      <span class="text-slate-400 dark:text-slate-500">/ this machine</span>
    </template>
    <div class="mx-auto max-w-4xl p-6">
      <div class="mb-4 flex items-center">
        <h1 class="text-xl font-semibold">
          {{ hosts.several ? 'These machines' : 'This machine' }}
        </h1>
      </div>
      <!-- the vendor accounts' limits, per machine, as last reported through an agent -->
      <div
        v-if="usage.length"
        class="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-base dark:border-slate-800 dark:bg-slate-900"
        data-test="usage"
      >
        <div
          class="mb-1 text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
        >
          Account usage
        </div>
        <div
          v-for="h in usage"
          :key="h.host"
          class="flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5"
        >
          <span v-if="hosts.several" class="w-28 truncate font-medium">{{ h.host }}</span>
          <template v-for="a in h.accounts" :key="a.profile">
            <span class="text-slate-500 dark:text-slate-400">{{ a.profile }}</span>
            <UsageChip :usage="a.usage" />
          </template>
          <span v-if="h.accounts.length === 0" class="text-sm text-slate-400 dark:text-slate-500"
            >nothing reported yet</span
          >
        </div>
      </div>
      <!-- the four texts an operator keeps, and the log, per machine -->
      <div
        v-if="rows.length"
        class="rounded-lg border border-slate-200 bg-white px-4 py-3 text-base dark:border-slate-800 dark:bg-slate-900"
        data-test="texts"
      >
        <div
          class="mb-1 text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
        >
          What agents are told, and how work runs
        </div>
        <template v-for="h in rows" :key="h.host">
          <div v-if="hosts.several" class="mt-2 font-medium" data-test="texts-host">
            {{ h.host }}
          </div>
          <div
            v-for="it in h.items"
            :key="it.key"
            class="grid grid-cols-[7rem_1fr_auto_auto] items-baseline gap-x-4 border-t border-slate-100 py-2 first:border-t-0 dark:border-slate-800"
            :data-test="it.key"
          >
            <span class="font-medium">{{ it.name }}</span>
            <span class="text-sm text-slate-500 dark:text-slate-400">{{ it.what }}</span>
            <span
              class="text-sm whitespace-nowrap text-slate-500 dark:text-slate-400"
              :data-test="`${it.key}-source`"
              >{{ it.source ?? '' }}</span
            >
            <RouterLink
              :to="{ name: it.route, query: { host: h.host } }"
              class="text-sm whitespace-nowrap text-blue-700 hover:underline dark:text-blue-300"
              :data-test="it.key === 'learnings' ? 'learnings-link' : `${it.key}-edit`"
              >{{ it.link }}</RouterLink
            >
          </div>
        </template>
      </div>
    </div>
  </AppShell>
</template>
