import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { api } from '@/api/client'
import { events } from '@/api/events'
import type { Agent, AgentStatus, StoredItem } from '@/api/types'
import { useNotificationsStore } from './notifications'

export interface AgentRow {
  agent: Agent
  status: AgentStatus
}

/**
 * Agents per project and transcripts per agent. Everything live comes from
 * the event stream; after a reconnect the open transcript is refetched
 * from its last known index.
 */
export const useAgentsStore = defineStore('agents', () => {
  const byProject = reactive(new Map<string, AgentRow[]>())
  const byId = reactive(new Map<string, AgentRow>())
  const items = reactive(new Map<string, StoredItem[]>())
  const loaded = reactive(new Set<string>())

  events.on((f) => {
    if (f.type === 'agent.state') {
      const row = byId.get(f.agentId)
      if (row) {
        const was = row.status.state
        row.status = f.status
        if (f.status.state === 'error' && was !== 'error') {
          useNotificationsStore().push('error', `${row.agent.name}: ${f.status.error ?? 'error'}`)
        }
      }
      return
    }
    if (f.type === 'agent.item') {
      const list = items.get(f.agentId)
      if (!list) return
      if (f.item.index < list.length) list[f.item.index] = f.item
      else if (f.item.index === list.length) list.push(f.item)
      else void loadItems(f.agentId) // a gap: refetch rather than guess
    }
  })

  events.onReconnect = () => {
    for (const id of loaded) void loadItems(id)
    for (const projectId of byProject.keys()) void load(projectId)
  }

  async function load(projectId: string): Promise<void> {
    const rows = await api.agents(projectId)
    byProject.set(projectId, rows)
    for (const r of rows) byId.set(r.agent.id, r)
  }

  async function loadItems(agentId: string): Promise<void> {
    const from = loaded.has(agentId) ? (items.get(agentId)?.length ?? 0) : 0
    const { items: fetched } = await api.items(agentId, from)
    const list = items.get(agentId) ?? []
    for (const it of fetched) list[it.index] = it
    items.set(agentId, list)
    loaded.add(agentId)
    if (!byId.has(agentId)) {
      const row = await api.agent(agentId)
      byId.set(agentId, row)
    }
  }

  async function create(
    projectId: string,
    input: { name: string; profile?: string; cwd?: string },
  ): Promise<Agent> {
    const row = await api.createAgent(projectId, input)
    byId.set(row.agent.id, row)
    byProject.set(projectId, [...(byProject.get(projectId) ?? []), row])
    return row.agent
  }

  async function archive(agentId: string): Promise<void> {
    await api.archive(agentId)
    const row = byId.get(agentId)
    if (row)
      byProject.set(
        row.agent.projectId,
        (byProject.get(row.agent.projectId) ?? []).filter((r) => r.agent.id !== agentId),
      )
    byId.delete(agentId)
  }

  return { byProject, byId, items, load, loadItems, create, archive }
})
