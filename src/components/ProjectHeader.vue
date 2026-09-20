<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useChangesStore } from '@/stores/changes'
import { useFeaturesStore } from '@/stores/features'
import { useHostsStore } from '@/stores/hosts'
import { useProjectsStore } from '@/stores/projects'

/**
 * The project as the anchor of the top bar: its name is a switcher (the
 * other projects, and "edit"), and the three views are its tabs, each
 * saying what it holds for attention, so "agents / files / features"
 * reads as this project's agents, files and features.
 */
const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()
const changes = useChangesStore()
const features = useFeaturesStore()
const hosts = useHostsStore()

const row = computed(() => projects.byId.get(props.id))
const project = computed(() => row.value?.project)
const host = computed(() => (project.value?.host ? hosts.byName(project.value.host) : undefined))
const waiting = computed(() =>
  row.value
    ? row.value.agentCounts['waiting-permission'] + row.value.agentCounts['waiting-input']
    : 0,
)
const changed = computed(() => changes.unread.get(props.id) ?? 0)
const toReview = computed(
  () => (features.byProject.get(props.id) ?? []).filter((f) => f.status === 'review').length,
)
onMounted(() => {
  if (!features.byProject.has(props.id)) void features.load(props.id)
  void changes.countUnread(props.id) // keep the changes-tab badge fresh
})

const open = ref(false)
function onDocClick(e: MouseEvent) {
  if (
    !(e.target as HTMLElement).closest(
      '[data-test=project-switcher-menu],[data-test=project-switcher]',
    )
  )
    open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
function go(id: string) {
  open.value = false
  const name = route.name === 'agent' ? 'project' : String(route.name ?? 'project')
  void router.push({ name, params: { id } })
}

const tab = (name: string) =>
  route.name === name || (name === 'project' && route.name === 'agent')
    ? 'border-blue-600 text-slate-900 dark:border-blue-500 dark:text-slate-100'
    : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
</script>

<template>
  <span class="text-slate-400 dark:text-slate-500">/</span>
  <div class="relative">
    <button
      type="button"
      class="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
      title="switch project, or edit this one"
      data-test="project-switcher"
      @click="open = !open"
    >
      <span class="font-medium" data-test="project-title">{{
        project?.name ?? (host && !host.connected ? '(unreachable)' : '…')
      }}</span>
      <span class="text-sm text-slate-400 dark:text-slate-500">▾</span>
    </button>
    <div
      v-if="open"
      class="absolute left-0 z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
      data-test="project-switcher-menu"
    >
      <button
        v-for="r in projects.rows"
        :key="r.project.id"
        type="button"
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
        :class="r.project.id === id ? 'font-medium' : ''"
        @click="go(r.project.id)"
      >
        <span class="truncate">{{ r.project.name }}</span>
        <span v-if="hosts.several && r.project.host" class="text-sm text-slate-400">{{
          r.project.host
        }}</span>
        <span class="grow" />
        <span
          v-if="r.agentCounts['waiting-permission'] + r.agentCounts['waiting-input']"
          class="rounded bg-amber-100 px-1.5 text-sm text-amber-900 dark:bg-amber-900 dark:text-amber-100"
          >{{ r.agentCounts['waiting-permission'] + r.agentCounts['waiting-input'] }} waiting</span
        >
        <span v-else-if="r.agentCounts.working" class="text-sm text-blue-700 dark:text-blue-300"
          >{{ r.agentCounts.working }} working</span
        >
      </button>
      <div class="my-1 border-t border-slate-200 dark:border-slate-700" />
      <RouterLink
        :to="{ name: 'projects', query: { edit: id } }"
        class="block px-3 py-1.5 text-blue-700 hover:bg-slate-100 dark:text-blue-300 dark:hover:bg-slate-800"
        title="Edit the project: name, repositories, default profile"
        data-test="edit-project-link"
        @click="open = false"
        >edit {{ project?.name ?? 'project' }}…</RouterLink
      >
      <RouterLink
        :to="{ name: 'projects' }"
        class="block px-3 py-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        @click="open = false"
        >all projects</RouterLink
      >
    </div>
  </div>
  <span
    v-if="host && (!host.connected || !host.daemon || host.error)"
    class="rounded bg-amber-100 px-2 py-0.5 text-sm text-amber-900 dark:bg-amber-900 dark:text-amber-100"
    data-test="host-warning"
    >{{
      !host.connected
        ? `${host.name} unreachable`
        : host.error
          ? `${host.name}: ${host.error}`
          : `${host.name}: daemon disconnected`
    }}</span
  >
  <span
    v-else-if="hosts.several && project?.host"
    class="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300"
    data-test="project-host"
    >{{ project.host }}</span
  >
  <!-- the project's three views, each with what it holds for attention -->
  <nav class="ml-2 flex gap-4 text-base">
    <RouterLink
      :to="{ name: 'project', params: { id } }"
      class="flex items-center gap-1.5 border-b-2 py-1"
      :class="tab('project')"
      data-test="tab-agents"
      >agents<span
        v-if="waiting"
        class="rounded bg-amber-100 px-1.5 text-sm text-amber-900 dark:bg-amber-900 dark:text-amber-100"
        :title="`${waiting} waiting for you`"
        >{{ waiting }}</span
      ></RouterLink
    >
    <RouterLink
      :to="{ name: 'files', params: { id } }"
      class="flex items-center gap-1.5 border-b-2 py-1"
      :class="tab('files')"
      data-test="tab-files"
      >files</RouterLink
    >
    <RouterLink
      :to="{ name: 'changes', params: { id } }"
      class="flex items-center gap-1.5 border-b-2 py-1"
      :class="tab('changes')"
      data-test="tab-changes"
      >changes<span
        v-if="changed"
        class="rounded bg-blue-100 px-1.5 text-sm text-blue-900 dark:bg-blue-900 dark:text-blue-100"
        :title="`${changed} commit${changed === 1 ? '' : 's'} since you last looked`"
        >{{ changed }}</span
      ></RouterLink
    >
    <RouterLink
      :to="{ name: 'features', params: { id } }"
      class="flex items-center gap-1.5 border-b-2 py-1"
      :class="tab('features')"
      data-test="tab-features"
      >features<span
        v-if="toReview"
        class="rounded bg-violet-100 px-1.5 text-sm text-violet-900 dark:bg-violet-900 dark:text-violet-100"
        :title="`${toReview} to review`"
        >{{ toReview }} to review</span
      ></RouterLink
    >
  </nav>
</template>
