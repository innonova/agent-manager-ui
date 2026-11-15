import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { ChatMessage, ChatSummary, EventFrame } from '@/api/types'

type Fetched = { messages: ChatMessage[]; summary: ChatSummary }
const chat = vi.fn<(id: string, q: { before?: number; limit?: number }) => Promise<Fetched>>()
const projectChat = vi.fn<(id: string) => Promise<({ agentId: string } & ChatSummary)[]>>()
const chatSay =
  vi.fn<
    (
      id: string,
      body: unknown,
    ) => Promise<{ message: ChatMessage; mode: 'aside' | 'turn' | 'steer' }>
  >()
vi.mock('@/api/client', () => ({
  api: {
    chat: (id: string, q: { before?: number; limit?: number }) => chat(id, q),
    projectChat: (id: string) => projectChat(id),
    chatSay: (id: string, body: unknown) => chatSay(id, body),
  },
}))
// Capture the store's frame handlers so a test can feed it an event.
const handlers: ((f: EventFrame) => void)[] = []
const dispatch = (f: EventFrame) => handlers.forEach((h) => h(f))
const events = vi.hoisted(() => ({
  on: (() => 0) as (cb: (f: EventFrame) => void) => number,
  onReconnect: null as (() => void) | null,
}))
events.on = (cb) => handlers.push(cb)
vi.mock('@/api/events', () => ({ events }))

const agentSaid = vi.fn<(projectId: string, m: ChatMessage) => void>()
vi.mock('./notifications', () => ({ useNotificationsStore: () => ({ agentSaid }) }))

import { CHAT_PAGE, useChatStore } from './chat'

const message = (id: number, more: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  agentId: 'a',
  from: 'agent',
  author: 'worker',
  kind: 'message',
  important: false,
  text: `m${id}`,
  re: null,
  via: null,
  images: 0,
  at: id,
  readAt: null,
  closedAt: null,
  closedBy: null,
  ...more,
})
const summary = (more: Partial<ChatSummary> = {}): ChatSummary => ({
  unread: 0,
  questions: 0,
  last: 0,
  ...more,
})
const changed = (
  messages: ChatMessage[],
  s: Partial<ChatSummary> = {},
  agentId = 'a',
): EventFrame => ({
  type: 'chat.changed',
  agentId,
  projectId: 'p',
  messages,
  summary: summary(s),
})
const ids = (list: ChatMessage[]) => list.map((m) => m.id)

describe('chat store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    handlers.length = 0
    events.onReconnect = null
    chat.mockReset()
    projectChat.mockReset()
    chatSay.mockReset()
    agentSaid.mockReset()
  })

  it('merges a frame by id: a new message is added in its place, a changed one replaced', async () => {
    chat.mockResolvedValue({ messages: [message(1), message(3)], summary: summary({ last: 3 }) })
    const store = useChatStore()
    await store.load('a', 'p')
    expect(chat).toHaveBeenCalledWith('a', { limit: CHAT_PAGE })
    dispatch(changed([message(4, { kind: 'question' })], { questions: 1, last: 4 }))
    dispatch(changed([message(2)], { questions: 1, last: 4 })) // out of order: still sorted by id
    expect(ids(store.of('a'))).toEqual([1, 2, 3, 4])
    expect(store.questionsOf('a')).toBe(1)
    // the same message again, closed: replaced where it is, never a second copy
    dispatch(changed([message(4, { kind: 'question', closedAt: 9, closedBy: 'person' })]))
    expect(ids(store.of('a'))).toEqual([1, 2, 3, 4])
    expect(store.of('a')[3]?.closedBy).toBe('person')
    expect(store.questionsOf('a')).toBe(0)
  })

  it('what an agent says is offered for a notification once: when said, not when it is closed or read', () => {
    useChatStore()
    const q = message(1, { kind: 'question' })
    dispatch(changed([q], { questions: 1, last: 1 }))
    expect(agentSaid).toHaveBeenCalledExactlyOnceWith('p', q)
    dispatch(changed([{ ...q, closedAt: 5, closedBy: 'answer' }]))
    dispatch(changed([message(2, { from: 'person', author: 'admin', via: 'aside' })]))
    expect(agentSaid).toHaveBeenCalledTimes(1)
  })

  it('a frame for a chat nobody opened here keeps its summary and no messages', () => {
    const store = useChatStore()
    dispatch(changed([message(1, { kind: 'question' })], { questions: 1, last: 1 }, 'b'))
    expect(store.messages.has('b')).toBe(false)
    expect(store.questionsOf('b')).toBe(1)
    expect(store.questionsIn('p')).toBe(1)
    expect(store.questions).toBe(1)
  })

  it('an answer fetched before a frame arrived does not overwrite what the frame said', async () => {
    let release!: (v: Fetched) => void
    chat.mockImplementationOnce(() => new Promise<Fetched>((r) => (release = r)))
    // asked again because news arrived meanwhile: this time the server has it too
    chat.mockResolvedValueOnce({
      messages: [message(1, { kind: 'question' })],
      summary: summary({ questions: 1, last: 1 }),
    })
    const store = useChatStore()
    const loading = store.load('a', 'p')
    dispatch(changed([message(1, { kind: 'question' })], { questions: 1, last: 1 }))
    release({ messages: [], summary: summary() }) // read before the question was asked
    await loading
    expect(chat).toHaveBeenCalledTimes(2)
    expect(ids(store.of('a'))).toEqual([1])
    expect(store.questionsOf('a')).toBe(1)
  })

  it('pages earlier messages in front, until a short page says there are no more', async () => {
    const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => message(from + i))
    chat.mockResolvedValueOnce({ messages: page(301, CHAT_PAGE), summary: summary({ last: 500 }) })
    const store = useChatStore()
    await store.load('a', 'p')
    expect(store.earlier.has('a')).toBe(true)
    chat.mockResolvedValueOnce({ messages: page(101, CHAT_PAGE), summary: summary() })
    await store.loadEarlier('a')
    expect(chat).toHaveBeenLastCalledWith('a', { before: 301, limit: CHAT_PAGE })
    expect(store.of('a')[0]?.id).toBe(101)
    expect(store.of('a')).toHaveLength(2 * CHAT_PAGE)
    expect(store.earlier.has('a')).toBe(true)
    chat.mockResolvedValueOnce({ messages: page(1, 100), summary: summary() })
    await store.loadEarlier('a')
    expect(store.of('a')[0]?.id).toBe(1)
    expect(store.earlier.has('a')).toBe(false)
    await store.loadEarlier('a') // nothing left to ask for
    expect(chat).toHaveBeenCalledTimes(3)
  })

  it('a project’s summaries are fetched once, counted per project, and yield to a newer frame', async () => {
    let release!: (v: ({ agentId: string } & ChatSummary)[]) => void
    projectChat.mockImplementationOnce(() => new Promise((r) => (release = r)))
    const store = useChatStore()
    store.ensureProject('p')
    store.ensureProject('p')
    expect(projectChat).toHaveBeenCalledTimes(1)
    // while the list is on its way, a's question is answered
    dispatch(changed([message(1, { kind: 'question', closedAt: 5, closedBy: 'answer' })]))
    release([
      { agentId: 'a', ...summary({ questions: 1, last: 1 }) },
      { agentId: 'b', ...summary({ questions: 2, last: 7 }) },
    ])
    await vi.waitFor(() => expect(store.questionsOf('b')).toBe(2))
    expect(store.questionsOf('a')).toBe(0) // the frame was newer than the list
    expect(store.questionsIn('p')).toBe(2)
    expect(store.questionsIn('elsewhere')).toBe(0)
    expect(store.questions).toBe(2)
  })

  it('a project whose machine is down is asked again when the connection is back', async () => {
    projectChat.mockRejectedValueOnce(new Error('down'))
    const store = useChatStore()
    await store.loadProject('p')
    expect(store.questions).toBe(0)
    projectChat.mockResolvedValueOnce([{ agentId: 'a', ...summary({ questions: 1, last: 1 }) }])
    events.onReconnect?.()
    await vi.waitFor(() => expect(store.questionsOf('a')).toBe(1))
  })

  it('an archived agent no longer counts; a removed one is forgotten', async () => {
    chat.mockResolvedValue({
      messages: [message(1, { kind: 'question' })],
      summary: summary({ questions: 1, last: 1 }),
    })
    const store = useChatStore()
    await store.load('a', 'p')
    expect(store.questions).toBe(1)
    dispatch({ type: 'agent.archived', agentId: 'a' } as EventFrame)
    expect(store.questions).toBe(0)
    expect(ids(store.of('a'))).toEqual([1]) // still readable
    dispatch({ type: 'agent.removed', agentId: 'a' } as EventFrame)
    expect(store.of('a')).toEqual([])
  })

  it('what was just said is in the chat at once, and not twice when its frame came first', async () => {
    chat.mockResolvedValue({ messages: [], summary: summary() })
    const store = useChatStore()
    await store.load('a', 'p')
    const mine = message(1, { from: 'person', author: 'admin', via: 'aside' })
    chatSay.mockResolvedValueOnce({ message: mine, mode: 'aside' })
    expect(await store.say('a', { text: 'm1' })).toBe('aside')
    expect(chatSay).toHaveBeenCalledWith('a', { text: 'm1' })
    expect(ids(store.of('a'))).toEqual([1])
    // the next one's frame, already read by the agent, beats the answer to the request
    const next = message(2, { from: 'person', author: 'admin', via: 'turn', readAt: 3 })
    chatSay.mockImplementationOnce(async () => {
      dispatch(changed([next], { last: 2 }))
      return { message: { ...next, readAt: null }, mode: 'turn' }
    })
    expect(await store.say('a', { text: 'm2', replyTo: 9, steer: false })).toBe('turn')
    expect(chatSay).toHaveBeenLastCalledWith('a', { text: 'm2', replyTo: 9 })
    expect(ids(store.of('a'))).toEqual([1, 2])
    expect(store.of('a')[1]?.readAt).toBe(3)
  })
})
