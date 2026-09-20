<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
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
/** The framing row of a host, so the Method block can offer both documents on one line. */
const framingOf = (host: string) => framing.value.find((r) => r.host === host) ?? null
const sourceLabel = (s: HarnessRow['source']) =>
  s === 'built-in' ? 'the shipped text' : s === 'custom' ? 'a custom text' : 'off'

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
      <!-- the harness note's template, per machine: what every agent is told at session start -->
      <div
        v-if="harness.length"
        class="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-base dark:border-slate-800 dark:bg-slate-900"
        data-test="harness"
      >
        <div
          class="mb-1 text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
        >
          Harness note
        </div>
        <div
          v-for="h in harness"
          :key="h.host"
          class="flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5"
        >
          <span v-if="hosts.several" class="w-28 truncate font-medium">{{ h.host }}</span>
          <span class="text-slate-500 dark:text-slate-400" data-test="harness-source">{{
            h.source === 'built-in'
              ? 'the shipped note'
              : h.source === 'custom'
                ? 'a custom note'
                : 'off'
          }}</span>
          <RouterLink
            :to="{ name: 'harness', query: { host: h.host } }"
            class="text-sm text-blue-700 hover:underline dark:text-blue-300"
            data-test="harness-edit"
            >view / edit</RouterLink
          >
        </div>
        <p class="mt-1 text-sm text-slate-400 dark:text-slate-500">
          What every agent is told about running here, at session start; a change reaches an agent
          at its next restart.
        </p>
      </div>
      <!-- the models file, per machine: the house view rendered into every note -->
      <div
        v-if="models.length"
        class="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-base dark:border-slate-800 dark:bg-slate-900"
        data-test="models"
      >
        <div
          class="mb-1 text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
        >
          Models
        </div>
        <div
          v-for="h in models"
          :key="h.host"
          class="flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5"
        >
          <span v-if="hosts.several" class="w-28 truncate font-medium">{{ h.host }}</span>
          <span class="text-slate-500 dark:text-slate-400" data-test="models-source">{{
            sourceLabel(h.source)
          }}</span>
          <RouterLink
            :to="{ name: 'models', query: { host: h.host } }"
            class="text-sm text-blue-700 hover:underline dark:text-blue-300"
            data-test="models-edit"
            >view / edit</RouterLink
          >
        </div>
        <p class="mt-1 text-sm text-slate-400 dark:text-slate-500">
          Which model suits which work, as we have learned it; every agent gets it in its note, so
          one that starts a helper chooses with it in front of it.
        </p>
      </div>
      <!-- the method and its framing, per machine, with the log both are curated from -->
      <div
        v-if="method.length"
        class="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-base dark:border-slate-800 dark:bg-slate-900"
        data-test="method"
      >
        <div
          class="mb-1 text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
        >
          Method
        </div>
        <div
          v-for="h in method"
          :key="h.host"
          class="flex flex-wrap items-center gap-x-3 gap-y-1 py-0.5"
        >
          <span v-if="hosts.several" class="w-28 truncate font-medium">{{ h.host }}</span>
          <span class="text-slate-500 dark:text-slate-400" data-test="method-source">{{
            sourceLabel(h.source)
          }}</span>
          <RouterLink
            :to="{ name: 'method', query: { host: h.host } }"
            class="text-sm text-blue-700 hover:underline dark:text-blue-300"
            data-test="method-edit"
            >view / edit</RouterLink
          >
          <span v-if="framingOf(h.host)" class="text-slate-400 dark:text-slate-500">framing</span>
          <span
            v-if="framingOf(h.host)"
            class="text-slate-500 dark:text-slate-400"
            data-test="framing-source"
            >{{ sourceLabel(framingOf(h.host)!.source) }}</span
          >
          <RouterLink
            v-if="framingOf(h.host)"
            :to="{ name: 'framing', query: { host: h.host } }"
            class="text-sm text-blue-700 hover:underline dark:text-blue-300"
            data-test="framing-edit"
            >view / edit</RouterLink
          >
          <RouterLink
            :to="{ name: 'learnings', query: { host: h.host } }"
            class="text-sm text-blue-700 hover:underline dark:text-blue-300"
            data-test="learnings-link"
            >learnings</RouterLink
          >
        </div>
        <p class="mt-1 text-sm text-slate-400 dark:text-slate-500">
          How work is run here: features, the gate, helpers, reviews — and, beside it, the framing:
          how a feature and a brief are written. Both are curated now and then from the learnings
          log, where anyone records what was learned at the moment of noticing.
        </p>
      </div>
    </div>
  </AppShell>
</template>
