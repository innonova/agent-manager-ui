<script setup lang="ts">
import type { HostStatus, Profile } from '@/api/types'

export interface ProjectFormValue {
  name: string
  repos: { name: string; path: string }[]
  defaultProfile: string
  /** The machine to create it on; only offered when there are several. */
  host: string
}

const model = defineModel<ProjectFormValue>({ required: true })
defineProps<{ profiles: Profile[]; hosts?: HostStatus[] }>()

function addRepo() {
  model.value.repos.push({ name: '', path: '' })
}
function removeRepo(i: number) {
  model.value.repos.splice(i, 1)
}
function move(i: number, d: -1 | 1) {
  const repos = model.value.repos
  const j = i + d
  if (j < 0 || j >= repos.length) return
  ;[repos[i], repos[j]] = [repos[j]!, repos[i]!]
}
</script>

<template>
  <label v-if="hosts && hosts.length > 1" class="text-sm">
    <span class="text-slate-600 dark:text-slate-300">Machine</span>
    <select
      v-model="model.host"
      class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
      data-test="project-host-select"
    >
      <option v-for="h in hosts" :key="h.name" :value="h.name" :disabled="!h.connected">
        {{ h.name }}{{ h.local ? ' (this machine)' : '' }}{{ h.connected ? '' : ' (unreachable)' }}
      </option>
    </select>
  </label>
  <label class="text-sm">
    <span class="text-slate-600 dark:text-slate-300">Name</span>
    <input
      v-model="model.name"
      class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
      data-test="project-name"
      required
    />
  </label>
  <div class="text-sm">
    <div class="flex items-center">
      <span class="text-slate-600 dark:text-slate-300"
        >Repositories (absolute paths on this machine)</span
      >
      <span class="grow" />
      <button
        type="button"
        class="text-xs text-blue-700 hover:underline dark:text-blue-300"
        data-test="add-repo"
        @click="addRepo"
      >
        + add
      </button>
    </div>
    <p class="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
      The first one is the primary repository: agents start there by default and new features are
      created there. The name defaults to the directory name. Running agents keep the repositories
      they were started with until they are restarted.
    </p>
    <div
      v-for="(repo, i) in model.repos"
      :key="i"
      class="mt-2 flex items-center gap-2"
      data-test="repo-row"
    >
      <input
        v-model="repo.name"
        class="w-28 rounded border border-slate-300 px-2 py-1.5 font-mono text-xs dark:border-slate-700"
        placeholder="name"
        data-test="repo-name"
      />
      <input
        v-model="repo.path"
        class="min-w-0 grow rounded border border-slate-300 px-2 py-1.5 font-mono text-xs dark:border-slate-700"
        placeholder="/absolute/path"
        data-test="repo-path"
        :required="i === 0"
      />
      <button
        type="button"
        class="text-xs text-slate-400 hover:text-slate-900 disabled:opacity-30 dark:hover:text-slate-100"
        title="Move up"
        :disabled="i === 0"
        @click="move(i, -1)"
      >
        ↑
      </button>
      <button
        type="button"
        class="text-xs text-slate-400 hover:text-red-700 disabled:opacity-30"
        title="Remove"
        :disabled="model.repos.length === 1"
        data-test="remove-repo"
        @click="removeRepo(i)"
      >
        ✕
      </button>
    </div>
  </div>
  <label class="text-sm">
    <span class="text-slate-600 dark:text-slate-300">Default agent profile</span>
    <select
      v-model="model.defaultProfile"
      class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
      data-test="project-profile"
    >
      <option value="">(none)</option>
      <option v-for="p in profiles" :key="p.name" :value="p.name">
        {{ p.name }}<template v-if="p.description"> — {{ p.description }}</template>
      </option>
    </select>
  </label>
</template>
