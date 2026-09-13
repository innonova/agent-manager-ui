<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ApiError } from '@/api/client'
import { useAgentsStore } from '@/stores/agents'
import { useNotificationsStore } from '@/stores/notifications'
import { useAttentionStore } from '@/stores/attention'
import { useHostsStore } from '@/stores/hosts'
import { useProjectsStore } from '@/stores/projects'
import AgentCountBadges from './AgentCountBadges.vue'
import StateBadge from './StateBadge.vue'

/**
 * The sidebar: every project, the current one expanded with its agents,
 * the others collapsed to their agent counts. Switching project or agent
 * is one click from anywhere; the projects page is only for creating
 * and editing projects.
 */
const props = defineProps<{ projectId: string; agentId?: string }>()
const emit = defineEmits<{ newAgent: [projectId: string] }>()
const projects = useProjectsStore()
const agents = useAgentsStore()
const attention = useAttentionStore()
const hosts = useHostsStore()

/**
 * Expanded besides the current project: toggled by the user, kept across
 * reloads, and a project you leave stays open, so several can be unfolded
 * at once.
 */
const KEY = 'tree-expanded'
const expanded = ref(
  new Set<string>(
    (() => {
      try {
        return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]
      } catch {
        return []
      }
    })(),
  ),
)
function remember() {
  localStorage.setItem(KEY, JSON.stringify([...expanded.value]))
}
const isOpen = (id: string) => id === props.projectId || expanded.value.has(id)
async function toggle(id: string) {
  if (id === props.projectId) return
  if (expanded.value.has(id)) expanded.value.delete(id)
  else {
    expanded.value.add(id)
    if (!agents.byProject.has(id)) await loadAgents(id)
  }
  remember()
}
for (const id of expanded.value) if (!agents.byProject.has(id)) void loadAgents(id)
/** A project on a machine that is down, or one deleted meanwhile, is a toast, not an unhandled rejection. */
async function loadAgents(id: string) {
  try {
    await agents.load(id)
  } catch (e) {
    useNotificationsStore().push(
      'error',
      `could not load the agents: ${e instanceof ApiError ? e.message : String(e)}`,
    )
  }
}
watch(
  () => props.projectId,
  (id, was) => {
    expanded.value.delete(id) // open as the current one; back in the set once left
    if (was) expanded.value.add(was)
    remember()
    if (!agents.byProject.has(id)) void loadAgents(id)
  },
  { immediate: true },
)
const rows = computed(() => projects.rows)
const agentsOf = (id: string) => agents.byProject.get(id) ?? []
</script>

<template>
  <ul class="min-h-0 grow overflow-y-auto py-1" data-test="project-tree">
    <li
      v-for="r in rows"
      :key="r.project.id"
      data-test="tree-project"
      :data-open="isOpen(r.project.id) || undefined"
    >
      <div
        class="flex items-center gap-1 px-2 py-1.5 text-sm"
        :class="r.project.id === projectId ? 'font-semibold' : 'text-slate-700 dark:text-slate-300'"
      >
        <button
          class="w-4 shrink-0 text-xs text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          :title="isOpen(r.project.id) ? 'collapse' : 'expand'"
          data-test="tree-toggle"
          @click="toggle(r.project.id)"
        >
          {{ isOpen(r.project.id) ? '▾' : '▸' }}
        </button>
        <RouterLink
          :to="{ name: 'project', params: { id: r.project.id } }"
          class="flex min-w-0 grow items-center gap-2 hover:underline"
          data-test="tree-project-link"
        >
          <span class="truncate">{{ r.project.name }}</span>
          <span
            v-if="hosts.several && r.project.host"
            class="rounded bg-slate-100 px-1 text-[10px] font-normal text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            :class="
              hosts.byName(r.project.host)?.connected === false ||
              hosts.byName(r.project.host)?.error
                ? 'line-through'
                : ''
            "
            >{{ r.project.host }}</span
          >
        </RouterLink>
        <AgentCountBadges v-if="!isOpen(r.project.id)" :counts="r.agentCounts" class="shrink-0" />
        <button
          v-else
          class="shrink-0 text-xs text-blue-700 hover:underline dark:text-blue-300"
          :data-test="r.project.id === projectId ? 'new-agent' : 'tree-new-agent'"
          title="New agent in this project"
          @click="emit('newAgent', r.project.id)"
        >
          + new
        </button>
      </div>
      <ul v-if="isOpen(r.project.id)">
        <li v-for="a in agentsOf(r.project.id)" :key="a.agent.id" data-test="agent-row">
          <RouterLink
            :to="{ name: 'agent', params: { id: r.project.id, agentId: a.agent.id } }"
            class="flex items-center gap-2 py-1.5 pr-3 pl-7 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            :class="a.agent.id === agentId ? 'bg-slate-100 font-medium dark:bg-slate-800' : ''"
          >
            <span
              v-if="attention.finishedAway.has(a.agent.id)"
              class="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
              title="finished while you were away"
            />
            <span class="truncate">{{ a.agent.name }}</span>
            <span class="grow" />
            <StateBadge
              :state="a.status.state"
              :background="a.status.background"
              :title="a.status.error ?? undefined"
            />
          </RouterLink>
        </li>
        <li
          v-if="agentsOf(r.project.id).length === 0"
          class="py-1 pl-7 text-xs text-slate-400 dark:text-slate-500"
        >
          no agents
        </li>
      </ul>
    </li>
  </ul>
</template>
