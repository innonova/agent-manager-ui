import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'
import { api } from '@/api/client'
import { events } from '@/api/events'
import type { ChatMessage, ChatSummary, TurnImage } from '@/api/types'
import { useNotificationsStore } from './notifications'

/** Messages fetched at a time: the newest on open, and each page of earlier ones. */
export const CHAT_PAGE = 200

/**
 * The chats between the people and the agents: the messages of the chats
 * opened in this tab, and a summary (unread, open questions) of every
 * chat it has heard of, which is what the agent list shows. Kept current
 * from `chat.changed`, which carries the changed messages themselves;
 * a message is never removed, so everything merges by id.
 */
export const useChatStore = defineStore('chat', () => {
  const messages = reactive(new Map<string, ChatMessage[]>())
  const summaries = reactive(new Map<string, ChatSummary & { projectId: string }>())
  /** Chats with messages older than the oldest one fetched. */
  const earlier = reactive(new Set<string>())
  const loadingEarlier = reactive(new Set<string>())
  /** Projects whose summaries were fetched, to fetch each once and again after a gap. */
  const projects = new Set<string>()
  /**
   * A count of frames, and the count at each agent's last one: a fetch
   * that started before a frame about the same agent holds older news
   * than the frame, and does not overwrite it.
   */
  let tick = 0
  const heard = new Map<string, number>()

  function merge(agentId: string, incoming: ChatMessage[]): void {
    const list = messages.get(agentId)
    if (!list) return
    for (const m of incoming) {
      const i = list.findIndex((x) => x.id >= m.id)
      if (i === -1) list.push(m)
      else if (list[i]!.id === m.id) list[i] = m
      else list.splice(i, 0, m)
    }
  }

  function forget(agentId: string): void {
    messages.delete(agentId)
    summaries.delete(agentId)
    earlier.delete(agentId)
  }

  events.on((f) => {
    if (f.type === 'chat.changed') {
      heard.set(f.agentId, ++tick)
      summaries.set(f.agentId, { ...f.summary, projectId: f.projectId })
      merge(f.agentId, f.messages)
      // an agent's message is announced when said and when closed: one not closed is new
      for (const m of f.messages)
        if (m.from === 'agent' && !m.closedAt) useNotificationsStore().agentSaid(f.projectId, m)
      return
    }
    // an archived agent's chat stays readable, but it no longer has a question open for anyone
    if (f.type === 'agent.archived') summaries.delete(f.agentId)
    if (f.type === 'agent.removed') forget(f.agentId)
  })

  /** Opens an agent's chat: its newest messages. Again after a gap, to pick up what was missed. */
  async function load(agentId: string, projectId: string): Promise<void> {
    let since: number
    let fetched: { messages: ChatMessage[]; summary: ChatSummary }
    do {
      since = tick
      fetched = await api.chat(agentId, { limit: CHAT_PAGE })
    } while ((heard.get(agentId) ?? 0) > since) // news arrived meanwhile: this answer may predate it
    if (!messages.has(agentId)) {
      messages.set(agentId, fetched.messages)
      if (fetched.messages.length >= CHAT_PAGE) earlier.add(agentId)
    } else merge(agentId, fetched.messages)
    summaries.set(agentId, { ...fetched.summary, projectId })
  }

  async function loadEarlier(agentId: string): Promise<void> {
    const first = messages.get(agentId)?.[0]
    if (!first || !earlier.has(agentId) || loadingEarlier.has(agentId)) return
    loadingEarlier.add(agentId)
    try {
      const { messages: page } = await api.chat(agentId, { before: first.id, limit: CHAT_PAGE })
      merge(agentId, page)
      if (page.length < CHAT_PAGE) earlier.delete(agentId)
    } finally {
      loadingEarlier.delete(agentId)
    }
  }

  /** The summaries of a project's chats, for its agents in the list; quiet when the project's machine is down. */
  async function loadProject(projectId: string): Promise<void> {
    projects.add(projectId)
    const since = tick
    let rows: Awaited<ReturnType<typeof api.projectChat>>
    try {
      rows = await api.projectChat(projectId)
    } catch {
      return // its machine is down: asked again when that machine is back
    }
    for (const { agentId, ...summary } of rows)
      if ((heard.get(agentId) ?? 0) <= since) summaries.set(agentId, { ...summary, projectId })
  }
  /** The same, once per project. */
  function ensureProject(projectId: string): void {
    if (!projects.has(projectId)) void loadProject(projectId)
  }

  function refetch(mine: (id: string) => boolean): void {
    for (const id of messages.keys()) {
      const projectId = summaries.get(id)?.projectId
      if (projectId && mine(id)) load(id, projectId).catch(() => undefined)
    }
    for (const id of projects) if (mine(id)) void loadProject(id)
  }
  events.onReconnect = ((prev) => () => {
    prev?.()
    refetch(() => true)
  })(events.onReconnect)
  // a spoke's stream came back on the hub: its chats may have moved meanwhile
  events.on((f) => {
    if (f.type === 'host.reconnected') refetch((id) => id.startsWith(`${f.name}:`))
  })

  async function say(
    agentId: string,
    body: { text: string; replyTo?: number; steer?: boolean; images?: TurnImage[] },
  ): Promise<'aside' | 'turn' | 'steer'> {
    const { message, mode } = await api.chatSay(agentId, {
      text: body.text,
      ...(body.replyTo !== undefined ? { replyTo: body.replyTo } : {}),
      ...(body.steer ? { steer: true } : {}),
      ...(body.images?.length ? { images: body.images } : {}),
    })
    // the frame usually got here first, and may already say more (read, as a turn's start)
    if (!messages.get(agentId)?.some((m) => m.id === message.id)) merge(agentId, [message])
    return mode
  }

  async function close(agentId: string, messageId: number): Promise<void> {
    await api.chatClose(agentId, messageId)
  }

  const of = (agentId: string): ChatMessage[] => messages.get(agentId) ?? []
  const questionsOf = (agentId: string): number => summaries.get(agentId)?.questions ?? 0
  function questionsIn(projectId: string): number {
    let n = 0
    for (const s of summaries.values()) if (s.projectId === projectId) n += s.questions
    return n
  }
  /** Open questions across every chat known here: each is an agent wanting a person. */
  const questions = computed(() => {
    let n = 0
    for (const s of summaries.values()) n += s.questions
    return n
  })

  return {
    messages,
    summaries,
    earlier,
    loadingEarlier,
    load,
    loadEarlier,
    loadProject,
    ensureProject,
    say,
    close,
    of,
    questionsOf,
    questionsIn,
    questions,
  }
})
