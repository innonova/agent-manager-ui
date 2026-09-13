import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { StoredItem } from '@/api/types'

const items = vi.fn<(id: string, query: Record<string, number | undefined>) => Promise<unknown>>()
vi.mock('@/api/client', () => ({
  api: {
    items: (id: string, q: Record<string, number | undefined>) => items(id, q),
    agent: vi.fn<() => void>(),
  },
  ApiError: class extends Error {},
}))
vi.mock('@/api/events', () => ({ events: { on: vi.fn<() => void>(), onReconnect: undefined } }))
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

  it('a short transcript has nothing earlier', async () => {
    items.mockResolvedValue({ items: range(0, 5), total: 5 })
    const store = useAgentsStore()
    store.byId.set('a', { agent: { id: 'a' } as never, status: {} as never })
    await store.loadItems('a')
    expect(store.items.get('a')!.length).toBe(5)
    expect(store.hasEarlier('a')).toBe(false)
  })
})
