<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ApiError, api } from '@/api/client'
import type { Profile } from '@/api/types'
import AgentCountBadges from '@/components/AgentCountBadges.vue'
import AppShell from '@/components/AppShell.vue'
import ModalForm from '@/components/ModalForm.vue'
import { useProjectsStore } from '@/stores/projects'

const projects = useProjectsStore()
const showNew = ref(false)
const form = ref({ name: '', path: '', defaultProfile: '' })
const error = ref<string | null>(null)
const busy = ref(false)
const profiles = ref<Profile[]>([])

onMounted(async () => {
  await projects.load()
  profiles.value = (await api.profiles().catch(() => ({ profiles: [] }))).profiles.filter(
    (p) => p.supported,
  )
})

async function create() {
  error.value = null
  busy.value = true
  try {
    await projects.create({
      name: form.value.name,
      path: form.value.path,
      defaultProfile: form.value.defaultProfile || null,
    })
    showNew.value = false
    form.value = { name: '', path: '', defaultProfile: '' }
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppShell>
    <template #title><span class="text-slate-400">/ projects</span></template>
    <div class="mx-auto max-w-4xl p-6">
      <div class="mb-4 flex items-center">
        <h1 class="text-xl font-semibold">Projects</h1>
        <span class="grow" />
        <button
          class="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          data-test="new-project"
          @click="showNew = true"
        >
          new project
        </button>
      </div>
      <p v-if="projects.loaded && projects.rows.length === 0" class="text-sm text-slate-500">
        No projects yet. Register a repository on this machine by its absolute path.
      </p>
      <ul class="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        <li v-for="r in projects.rows" :key="r.project.id" data-test="project-row">
          <RouterLink
            :to="{ name: 'project', params: { id: r.project.id } }"
            class="flex items-center gap-4 px-4 py-3 hover:bg-slate-50"
          >
            <div class="min-w-0 grow">
              <div class="font-medium">{{ r.project.name }}</div>
              <div class="truncate font-mono text-xs text-slate-500">{{ r.project.path }}</div>
            </div>
            <AgentCountBadges :counts="r.agentCounts" />
          </RouterLink>
        </li>
      </ul>
    </div>

    <ModalForm
      v-if="showNew"
      title="New project"
      :error="error"
      :busy="busy"
      @close="showNew = false"
      @submit="create"
    >
      <label class="text-sm">
        <span class="text-slate-600">Name</span>
        <input
          v-model="form.name"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          data-test="project-name"
          required
        />
      </label>
      <label class="text-sm">
        <span class="text-slate-600">Path (absolute, on this machine)</span>
        <input
          v-model="form.path"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono"
          data-test="project-path"
          required
        />
      </label>
      <label class="text-sm">
        <span class="text-slate-600">Default agent profile</span>
        <select
          v-model="form.defaultProfile"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          data-test="project-profile"
        >
          <option value="">(none)</option>
          <option v-for="p in profiles" :key="p.name" :value="p.name">
            {{ p.name }}<template v-if="p.description"> — {{ p.description }}</template>
          </option>
        </select>
      </label>
    </ModalForm>
  </AppShell>
</template>
