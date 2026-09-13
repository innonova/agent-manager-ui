import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api/client'
import { events } from '@/api/events'
import type { AgentCounts, Project, RepoInput } from '@/api/types'

export interface ProjectRow {
  project: Project
  agentCounts: AgentCounts
}

export const useProjectsStore = defineStore('projects', () => {
  const rows = ref<ProjectRow[]>([])
  const loaded = ref(false)
  const byId = computed(() => new Map(rows.value.map((r) => [r.project.id, r])))

  events.on((f) => {
    if (f.type === 'project.counts') {
      const row = byId.value.get(f.projectId)
      if (row) row.agentCounts = f.counts
    }
  })

  async function load(): Promise<void> {
    rows.value = await api.projects()
    loaded.value = true
  }
  events.onReconnect = ((prev) => () => {
    prev?.()
    if (loaded.value) void load() // counts may have moved while the socket was down
  })(events.onReconnect)

  const sorted = (list: ProjectRow[]) =>
    [...list].sort((a, b) => a.project.name.localeCompare(b.project.name))

  async function create(input: {
    name: string
    repos: RepoInput[]
    defaultProfile?: string | null
    host?: string
  }): Promise<Project> {
    const row = await api.createProject(input)
    rows.value = sorted([...rows.value, row])
    return row.project
  }

  async function update(
    id: string,
    input: { name?: string; repos?: RepoInput[]; defaultProfile?: string | null },
  ): Promise<Project> {
    const row = await api.updateProject(id, input)
    rows.value = sorted(rows.value.map((r) => (r.project.id === id ? row : r)))
    return row.project
  }

  async function remove(id: string): Promise<void> {
    await api.deleteProject(id)
    rows.value = rows.value.filter((r) => r.project.id !== id)
  }

  return { rows, loaded, byId, load, create, update, remove }
})
