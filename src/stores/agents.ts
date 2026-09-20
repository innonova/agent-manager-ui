import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { api, ApiError } from '@/api/client'
import { events } from '@/api/events'
import type { Agent, AgentStatus, StoredItem } from '@/api/types'
import { useNotificationsStore } from './notifications'
import { useAttentionStore } from '@/stores/attention'

export interface AgentRow {
  agent: Agent
  status: AgentStatus
}

/** Items fetched at a time: the tail on open, and each page of earlier history. */
export const PAGE = 300

/**
 * Agents per project and transcripts per agent. A transcript is an array
 * indexed by item index and as long as the whole history, but only the
 * tail is fetched on open; earlier pages fill in holes on request. Live
 * items come from the event stream; after a reconnect the open transcript
 * is refetched from its last known index.
 */
export const useAgentsStore = defineStore('agents', () => {
  const byProject = reactive(new Map<string, AgentRow[]>())
  const byId = reactive(new Map<string, AgentRow>())
  const items = reactive(new Map<string, StoredItem[]>())
  const loaded = reactive(new Set<string>())
  /** The agent last opened in each project, for actions elsewhere that want "the" agent. */
  const lastAgent = reactive(new Map<string, string>())

  events.on((f) => {
    if (f.type === 'agent.state') {
      const row = byId.get(f.agentId)
      if (row) {
        const was = row.status.state
        const wasBackground = row.status.background
        row.status = f.status
        if (wasBackground !== f.status.background)
          useNotificationsStore().backgroundChanged(row, wasBackground, f.status.background)
        if (f.status.state === 'error' && was !== 'error') {
          useNotificationsStore().push('error', `${row.agent.name}: ${f.status.error ?? 'error'}`)
        }
        if (was !== f.status.state) useNotificationsStore().agentChanged(row, was, f.status.state)
        if (was === 'working' && f.status.state === 'idle' && !f.status.background)
          useAttentionStore().finished(f.agentId)
      }
      return
    }
    if (f.type === 'agent.session') {
      // a new session: the record changed with it (session id, the harness note it was given)
      const row = byId.get(f.agentId)
      if (row)
        void api
          .agent(f.agentId)
          .then((fresh) => {
            row.agent = fresh.agent
          })
          .catch(() => undefined)
      return
    }
    if (f.type === 'agent.reset') {
      // the manager rebuilt this transcript from scratch; start over
      generation.set(f.agentId, (generation.get(f.agentId) ?? 0) + 1)
      items.set(f.agentId, [])
      loaded.delete(f.agentId)
      earliest.delete(f.agentId)
      arriving.delete(f.agentId) // held items carry the old numbering
      void loadItems(f.agentId)
      return
    }
    if (f.type === 'agent.item') {
      const list = items.get(f.agentId)
      if (!list || fetching.has(f.agentId)) {
        // a load is in flight: keep the item and apply it after the snapshot,
        // so an older snapshot cannot overwrite a newer live item
        const held = arriving.get(f.agentId) ?? []
        held.push(f.item)
        if (held.length > 5000) held.splice(0, held.length - 5000)
        arriving.set(f.agentId, held)
        return
      }
      if (f.item.index < list.length) list[f.item.index] = f.item
      else if (f.item.index === list.length) list.push(f.item)
      else void loadItems(f.agentId) // a gap: refetch rather than guess
    }
  })

  events.onReconnect = ((prev) => () => {
    prev?.()
    for (const id of new Set([...loaded, ...failed])) void loadItems(id, { sinceTurnStart: true })
    for (const projectId of byProject.keys()) load(projectId).catch(() => undefined) // a spoke down: nothing to do here
  })(events.onReconnect)
  // A spoke's stream came back on the hub: what we show of that machine may
  // have missed events, so refetch it like after our own reconnect.
  events.on((f) => {
    if (f.type !== 'host.reconnected') return
    const mine = (id: string) => id.startsWith(`${f.name}:`)
    for (const id of new Set([...loaded, ...failed]))
      if (mine(id)) void loadItems(id, { sinceTurnStart: true })
    for (const projectId of byProject.keys())
      if (mine(projectId)) load(projectId).catch(() => undefined)
  })

  async function load(projectId: string): Promise<void> {
    const rows = await api.agents(projectId)
    byProject.set(projectId, rows)
    for (const r of rows) byId.set(r.agent.id, r)
  }

  /** Bumped on agent.reset so a load started before the reset is discarded. */
  const generation = new Map<string, number>()
  /** Items that arrived while a load of their agent was in flight. */
  const arriving = new Map<string, StoredItem[]>()
  const fetching = new Set<string>()
  /** Loads that failed; retried on reconnect. */
  const failed = new Set<string>()
  /** Lowest index fetched so far per agent; everything below it is a hole. */
  const earliest = reactive(new Map<string, number>())
  const loadingEarlier = reactive(new Set<string>())
  const hasEarlier = (agentId: string) => (earliest.get(agentId) ?? 0) > 0

  /**
   * The index a refetch after a gap starts from: the beginning of the
   * unfinished turn, since its items may have changed in place (a stream
   * ending, a permission answered) while the socket was down.
   */
  function turnStart(list: (StoredItem | undefined)[]): number {
    for (let i = list.length - 1; i >= 0 && i >= list.length - PAGE; i--)
      if (list[i]?.item.kind === 'turn_end') return i + 1
    return Math.max(0, list.length - PAGE)
  }

  async function loadItems(
    agentId: string,
    opts: { sinceTurnStart?: boolean } = {},
  ): Promise<void> {
    if (fetching.has(agentId)) return
    const gen = generation.get(agentId) ?? 0
    const list0 = items.get(agentId)
    const from = loaded.has(agentId)
      ? opts.sinceTurnStart && list0
        ? turnStart(list0)
        : (list0?.length ?? 0)
      : 0
    fetching.add(agentId)
    let fetched: StoredItem[]
    let total: number
    try {
      ;({ items: fetched, total } = await api.items(
        agentId,
        loaded.has(agentId) ? { from } : { tail: PAGE },
      ))
    } catch (e) {
      fetching.delete(agentId)
      arriving.delete(agentId)
      failed.add(agentId)
      useNotificationsStore().push(
        'error',
        `could not load the transcript: ${e instanceof ApiError ? e.message : String(e)}`,
      )
      return
    }
    fetching.delete(agentId)
    failed.delete(agentId)
    if ((generation.get(agentId) ?? 0) !== gen) return void loadItems(agentId)
    const list = items.get(agentId) ?? []
    if (loaded.has(agentId) && (total < list.length || (fetched[0]?.index ?? from) > from)) {
      // the manager renumbered (a rebuild whose reset this tab missed): start over
      items.set(agentId, [])
      loaded.delete(agentId)
      earliest.delete(agentId)
      arriving.delete(agentId)
      return void loadItems(agentId)
    }
    if (total > list.length) list.length = total // holes below the tail are earlier history
    let first = fetched[0]?.index ?? total
    for (const it of fetched) list[it.index] = it
    for (const it of arriving.get(agentId) ?? [])
      if (it.index <= list.length) {
        list[it.index] = it
        first = Math.min(first, it.index)
      }
    arriving.delete(agentId)
    items.set(agentId, list)
    if (!loaded.has(agentId)) earliest.set(agentId, Math.min(first, total))
    loaded.add(agentId)
    if (!byId.has(agentId)) {
      const row = await api.agent(agentId)
      byId.set(agentId, row)
    }
  }

  /** Fills in the page of history before the earliest item fetched so far. */
  async function loadEarlier(agentId: string): Promise<void> {
    const before = earliest.get(agentId) ?? 0
    if (before <= 0 || loadingEarlier.has(agentId) || !loaded.has(agentId)) return
    const gen = generation.get(agentId) ?? 0
    loadingEarlier.add(agentId)
    try {
      const { items: fetched } = await api.items(agentId, { before, limit: PAGE })
      if ((generation.get(agentId) ?? 0) !== gen) return
      const list = items.get(agentId)
      if (!list) return
      for (const it of fetched) list[it.index] = it
      earliest.set(agentId, fetched[0]?.index ?? 0)
    } catch (e) {
      useNotificationsStore().push(
        'error',
        `could not load earlier history: ${e instanceof ApiError ? e.message : String(e)}`,
      )
    } finally {
      loadingEarlier.delete(agentId)
    }
  }

  async function create(
    projectId: string,
    input: {
      name: string
      profile?: string
      cwd?: string
      permissions?: 'bypass' | 'ask'
      model?: string
      effort?: string
    },
  ): Promise<Agent> {
    const row = await api.createAgent(projectId, input)
    byId.set(row.agent.id, row)
    byProject.set(projectId, [...(byProject.get(projectId) ?? []), row])
    return row.agent
  }

  const decide = (agentId: string, requestId: string, option: string) =>
    api.decide(agentId, requestId, option)

  async function archive(agentId: string): Promise<void> {
    await api.archive(agentId)
    for (const [pid, aid] of lastAgent) if (aid === agentId) lastAgent.delete(pid)
    items.delete(agentId)
    loaded.delete(agentId)
    failed.delete(agentId)
    arriving.delete(agentId)
    earliest.delete(agentId)
    const row = byId.get(agentId)
    if (row)
      byProject.set(
        row.agent.projectId,
        (byProject.get(row.agent.projectId) ?? []).filter((r) => r.agent.id !== agentId),
      )
    byId.delete(agentId)
  }

  return {
    byProject,
    byId,
    items,
    load,
    loadItems,
    loadEarlier,
    hasEarlier,
    lastAgent,
    loadingEarlier,
    create,
    archive,
    decide,
  }
})
