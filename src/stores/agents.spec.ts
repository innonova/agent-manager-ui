import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { EventFrame, StoredItem } from '@/api/types'

const items = vi.fn<(id: string, query: Record<string, number | undefined>) => Promise<unknown>>()
vi.mock('@/api/client', () => ({
  api: {
    items: (id: string, q: Record<string, number | undefined>) => items(id, q),
    agent: vi.fn<() => void>(),
  },
  ApiError: class extends Error {},
}))
// Capture the store's frame handlers so a test can feed it an event.
const handlers: ((f: EventFrame) => void)[] = []
const dispatch = (f: EventFrame) => handlers.forEach((h) => h(f))
vi.mock('@/api/events', () => ({
  events: {
    on: (cb: (f: EventFrame) => void) => handlers.push(cb),
    onReconnect: undefined,
  },
}))
vi.mock('./notifications', () => ({ useNotificationsStore: () => ({ push: vi.fn<() => void>() }) }))
vi.mock('@/stores/attention', () => ({
  useAttentionStore: () => ({ finished: vi.fn<() => void>() }),
}))

import { useAgentsStore, PAGE } from './agents'

const item = (index: number): StoredItem => ({
  index,
  sessionId: 's',
  seqFrom: 0,
  seqTo: 0,
  at: index,
  item: { kind: 'text', text: `t${index}`, streaming: false },
})
const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => item(from + i))

describe('agents store transcript paging', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    items.mockReset()
  })

  it('opens on the tail and pages earlier history into the holes', async () => {
    const total = PAGE * 2 + 10
    items.mockImplementation(
      async (_id: string, q: { tail?: number; before?: number; limit?: number; from?: number }) => {
        if (q.tail !== undefined) return { items: range(total - q.tail, total), total }
        if (q.before !== undefined)
          return { items: range(Math.max(0, q.before - q.limit!), q.before), total }
        return { items: range(q.from!, total), total }
      },
    )
    const store = useAgentsStore()
    store.byId.set('a', { agent: { id: 'a' } as never, status: {} as never })
    await store.loadItems('a')
    const list = store.items.get('a')!
    expect(list.length).toBe(total)
    expect(list[total - 1]?.index).toBe(total - 1)
    expect(list[total - PAGE]?.index).toBe(total - PAGE)
    expect(list[total - PAGE - 1]).toBeUndefined()
    expect(store.hasEarlier('a')).toBe(true)
    expect(items).toHaveBeenLastCalledWith('a', { tail: PAGE })

    await store.loadEarlier('a')
    expect(items).toHaveBeenLastCalledWith('a', { before: total - PAGE, limit: PAGE })
    expect(list[10]?.index).toBe(10)
    expect(list[9]).toBeUndefined()
    expect(store.hasEarlier('a')).toBe(true)

    await store.loadEarlier('a')
    expect(list[0]?.index).toBe(0)
    expect(store.hasEarlier('a')).toBe(false)
    await store.loadEarlier('a') // nothing left: no request
    expect(items).toHaveBeenCalledTimes(3)

    // a later refetch (reconnect) continues from the end, not from zero
    await store.loadItems('a')
    expect(items).toHaveBeenLastCalledWith('a', { from: total })
  })

  it('a refetch that comes back shorter starts over from the tail', async () => {
    items.mockResolvedValueOnce({ items: range(0, 10), total: 10 })
    const store = useAgentsStore()
    store.byId.set('a', { agent: { id: 'a' } as never, status: {} as never })
    await store.loadItems('a')
    expect(store.items.get('a')!.length).toBe(10)
    // the manager rebuilt meanwhile: fewer items, and this tab missed the reset
    items.mockResolvedValueOnce({ items: [], total: 4 })
    items.mockResolvedValueOnce({ items: range(0, 4), total: 4 })
    await store.loadItems('a')
    expect(items).toHaveBeenNthCalledWith(2, 'a', { from: 10 })
    expect(items).toHaveBeenNthCalledWith(3, 'a', { tail: PAGE })
    expect(store.items.get('a')!.length).toBe(4)
    expect(store.items.get('a')![3]?.index).toBe(3)
  })

  it('a refetch after a gap starts at the unfinished turn, so items changed in place are picked up', async () => {
    items.mockResolvedValueOnce({ items: range(0, 6), total: 6 }) // ..., turn_end at 3, then a user item and a streaming text
    const store = useAgentsStore()
    store.byId.set('a', { agent: { id: 'a' } as never, status: {} as never })
    await store.loadItems('a')
    const list = store.items.get('a')!
    list[3] = { ...item(3), item: { kind: 'turn_end' } }
    list[5] = { ...item(5), item: { kind: 'text', text: 'partial', streaming: true } }
    items.mockResolvedValueOnce({
      items: [
        item(4), // the server answers from the requested index
        { ...item(5), item: { kind: 'text', text: 'partial and done', streaming: false } },
        { ...item(6), item: { kind: 'turn_end' } },
      ],
      total: 7,
    })
    await store.loadItems('a', { sinceTurnStart: true })
    expect(items).toHaveBeenLastCalledWith('a', { from: 4 })
    expect(list[5]?.item).toMatchObject({ text: 'partial and done', streaming: false })
    expect(list[6]?.item.kind).toBe('turn_end')
    expect(list.length).toBe(7)
  })

  it('a short transcript has nothing earlier', async () => {
    items.mockResolvedValue({ items: range(0, 5), total: 5 })
    const store = useAgentsStore()
    store.byId.set('a', { agent: { id: 'a' } as never, status: {} as never })
    await store.loadItems('a')
    expect(store.items.get('a')!.length).toBe(5)
    expect(store.hasEarlier('a')).toBe(false)
  })
})

const created = (id: string, projectId: string): EventFrame => ({
  type: 'agent.created',
  agent: { id, projectId, name: id } as never,
  status: { state: 'idle' } as never,
})

describe('agents store: an agent appearing and leaving live', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    handlers.length = 0
  })

  it('adds a created agent to a project whose list is loaded', () => {
    const store = useAgentsStore()
    store.byProject.set('p', []) // this tab has loaded project p
    dispatch(created('a', 'p'))
    expect(store.byProject.get('p')!.map((r) => r.agent.id)).toEqual(['a'])
    expect(store.byId.get('a')?.status.state).toBe('idle')
  })

  it('ignores a created agent for a project this tab has not loaded', () => {
    const store = useAgentsStore()
    // no byProject entry for 'p': load() will fetch the whole list later
    dispatch(created('a', 'p'))
    expect(store.byProject.get('p')).toBeUndefined()
    expect(store.byId.has('a')).toBe(false)
  })

  it('is idempotent: the creating tab that added optimistically hears its own frame', () => {
    const store = useAgentsStore()
    const row = { agent: { id: 'a', projectId: 'p', name: 'a' } as never, status: {} as never }
    store.byProject.set('p', [row])
    store.byId.set('a', row)
    dispatch(created('a', 'p'))
    expect(store.byProject.get('p')!.length).toBe(1) // not doubled
    expect(store.byId.get('a')?.status.state).toBe('idle') // status refreshed from the frame
  })

  it('drops an archived agent from the active list', () => {
    const store = useAgentsStore()
    const row = { agent: { id: 'a', projectId: 'p', name: 'a' } as never, status: {} as never }
    store.byProject.set('p', [row])
    store.byId.set('a', row)
    dispatch({ type: 'agent.archived', agentId: 'a', projectId: 'p' })
    expect(store.byProject.get('p')).toEqual([])
    expect(store.byId.has('a')).toBe(false)
  })
})
