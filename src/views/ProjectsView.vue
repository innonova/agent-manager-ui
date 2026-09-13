<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ApiError, api } from '@/api/client'
import type { AccountUsageRow, Profile, Project } from '@/api/types'
import AgentCountBadges from '@/components/AgentCountBadges.vue'
import AppShell from '@/components/AppShell.vue'
import UsageChip from '@/components/UsageChip.vue'
import { events } from '@/api/events'
import ModalForm from '@/components/ModalForm.vue'
import ProjectForm, { type ProjectFormValue } from '@/components/ProjectForm.vue'
import { useProjectsStore } from '@/stores/projects'
import { useHostsStore } from '@/stores/hosts'
import { useAgentsStore } from '@/stores/agents'
import { useNotificationsStore } from '@/stores/notifications'

const projects = useProjectsStore()
const hosts = useHostsStore()
const route = useRoute()
const router = useRouter()
const showForm = ref(false)
const editing = ref<Project | null>(null)
const form = ref<ProjectFormValue>(empty())
const error = ref<string | null>(null)
const busy = ref(false)
const profiles = ref<Profile[]>([])
/** Per host, the accounts' usage; refreshed when any agent reports new usage. */
const usage = ref<{ host: string; accounts: AccountUsageRow[] }[]>([])
async function loadUsage() {
  usage.value = (await api.usage().catch(() => ({ hosts: [] }))).hosts
}
let usageTimer: number | null = null
/** The report time last seen per agent: a state frame carries the usage forever, only a new report matters. */
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

function empty(): ProjectFormValue {
  return {
    name: '',
    repos: [{ name: '', path: '' }],
    defaultProfile: '',
    host: hosts.local?.name ?? '',
  }
}

onMounted(async () => {
  await projects.load()
  profiles.value = (await api.profiles().catch(() => ({ profiles: [] }))).profiles.filter(
    (p) => p.supported,
  )
  // ?edit=<id>: sent here from inside a project to edit it
  void loadUsage()
  const wanted = typeof route.query.edit === 'string' ? projects.byId.get(route.query.edit) : null
  if (wanted) {
    openEdit(wanted.project)
    void router.replace({ query: {} })
  }
})

function openNew() {
  editing.value = null
  form.value = empty()
  error.value = null
  showForm.value = true
}

function openEdit(p: Project) {
  editing.value = p
  form.value = {
    name: p.name,
    repos: p.repos.map((r) => ({ ...r })),
    defaultProfile: p.defaultProfile ?? '',
    host: p.host ?? '',
  }
  error.value = null
  showForm.value = true
}

/** Saves; with `restart`, then stops and resumes the project's idle agents so they see the change. */
async function submit(restart = false) {
  error.value = null
  busy.value = true
  try {
    const input = {
      name: form.value.name,
      // an empty name lets the manager derive one from the directory name
      repos: form.value.repos
        .filter((r) => r.path.trim())
        .map((r) =>
          r.name.trim() ? { name: r.name.trim(), path: r.path.trim() } : { path: r.path.trim() },
        ),
      defaultProfile: form.value.defaultProfile || null,
    }
    if (editing.value) await projects.update(editing.value.id, input)
    else
      await projects.create(
        hosts.several && form.value.host ? { ...input, host: form.value.host } : input,
      )
    if (restart && editing.value) {
      const { restarted, skipped } = await api.restartAgents(editing.value.id)
      const agents = useAgentsStore()
      const name = (id: string) => agents.byId.get(id)?.agent.name ?? id.slice(0, 8)
      const parts = [`restarted ${restarted.length} agent${restarted.length === 1 ? '' : 's'}`]
      if (skipped.length)
        parts.push(`skipped ${skipped.map((s) => `${name(s.id)} (${s.why})`).join(', ')}`)
      useNotificationsStore().push('info', parts.join('; '))
    }
    showForm.value = false
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppShell>
    <template #title><span class="text-slate-400 dark:text-slate-500">/ projects</span></template>
    <div class="mx-auto max-w-4xl p-6">
      <div class="mb-4 flex items-center">
        <h1 class="text-xl font-semibold">Projects</h1>
        <span class="grow" />
        <button
          class="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          data-test="new-project"
          @click="openNew"
        >
          new project
        </button>
      </div>
      <!-- the vendor accounts' limits, per machine, as last reported through an agent -->
      <div
        v-if="usage.length"
        class="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900"
        data-test="usage"
      >
        <div
          class="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
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
          <span v-if="h.accounts.length === 0" class="text-xs text-slate-400 dark:text-slate-500"
            >nothing reported yet</span
          >
        </div>
      </div>
      <p
        v-if="projects.loaded && projects.rows.length === 0"
        class="text-sm text-slate-500 dark:text-slate-400"
      >
        No projects yet. A project is one or more repositories on this machine, registered by
        absolute path.
      </p>
      <ul
        class="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900"
      >
        <li v-for="r in projects.rows" :key="r.project.id" data-test="project-row">
          <RouterLink
            :to="{ name: 'project', params: { id: r.project.id } }"
            class="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <div class="min-w-0 grow">
              <div class="font-medium">
                {{ r.project.name }}
                <span
                  v-if="hosts.several && r.project.host"
                  class="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  :class="
                    hosts.byName(r.project.host)?.connected === false ||
                    hosts.byName(r.project.host)?.error
                      ? 'line-through'
                      : ''
                  "
                  :title="
                    hosts.byName(r.project.host)?.connected === false
                      ? `${r.project.host} is unreachable`
                      : hosts.byName(r.project.host)?.local
                        ? 'on this machine'
                        : `on ${r.project.host}`
                  "
                  data-test="project-host"
                  >{{ r.project.host }}</span
                >
              </div>
              <div
                v-for="repo in r.project.repos"
                :key="repo.name"
                class="truncate font-mono text-xs text-slate-500 dark:text-slate-400"
                data-test="project-repo"
              >
                <span v-if="r.project.repos.length > 1" class="text-slate-700 dark:text-slate-300"
                  >{{ repo.name }}:
                </span>
                {{ repo.path }}
              </div>
            </div>
            <AgentCountBadges :counts="r.agentCounts" />
            <button
              type="button"
              class="text-xs text-slate-400 hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-100"
              data-test="edit-project"
              title="Edit project"
              @click.prevent="openEdit(r.project)"
            >
              edit
            </button>
          </RouterLink>
        </li>
      </ul>
    </div>

    <ModalForm
      v-if="showForm"
      :title="editing ? 'Edit project' : 'New project'"
      :error="error"
      :busy="busy"
      :submit-label="editing ? 'save' : 'create'"
      :secondary-label="editing ? 'save and restart agents' : undefined"
      @close="showForm = false"
      @submit="submit()"
      @secondary="submit(true)"
    >
      <ProjectForm v-model="form" :profiles="profiles" :hosts="editing ? [] : hosts.list" />
    </ModalForm>
  </AppShell>
</template>
