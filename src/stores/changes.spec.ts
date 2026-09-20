import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { CommitsResult, EventFrame } from '@/api/types'

const commits = vi.fn<() => Promise<CommitsResult>>()
const commitCount = vi.fn<() => Promise<CommitsResult>>()
const markRead = vi.fn<() => Promise<unknown>>()
vi.mock('@/api/client', () => ({
  api: {
    commits: (...a: unknown[]) => commits(...(a as [])),
    commitCount: (...a: unknown[]) => commitCount(...(a as [])),
    markRead: (...a: unknown[]) => markRead(...(a as [])),
  },
  ApiError: class extends Error {},
}))
const handlers: ((f: EventFrame) => void)[] = []
const dispatch = (f: EventFrame) => handlers.forEach((h) => h(f))
vi.mock('@/api/events', () => ({
  events: { on: (cb: (f: EventFrame) => void) => handlers.push(cb), onReconnect: undefined },
}))

import { useChangesStore } from './changes'

const result = (over: Partial<CommitsResult> = {}): CommitsResult => ({
  commits: [
    {
      repo: 'r',
      hash: 'h1',
      shortHash: 'h1',
      subject: 's1',
      author: 'a',
      at: 2,
      agent: 'alice',
      agentId: 'ag1',
      feature: 'feat',
      unread: true,
    },
    {
      repo: 'r',
      hash: 'h0',
      shortHash: 'h0',
      subject: 's0',
      author: 'a',
      at: 1,
      agent: null,
      agentId: null,
      feature: null,
      unread: false,
    },
  ],
  working: [{ repo: 'r', agent: 'alice', files: 2, head: 'h1' }],
  sinceCount: 1,
  ...over,
})

describe('changes store: commits, filters, refresh and the marker', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    handlers.length = 0
    commits.mockReset()
    commitCount.mockReset()
    markRead.mockReset()
    commits.mockResolvedValue(result())
    commitCount.mockResolvedValue(result({ commits: [], working: [], sinceCount: 3 }))
    markRead.mockResolvedValue({})
  })

  it('loads the commit list, the working rows and the unread count', async () => {
    const store = useChangesStore()
    await store.select('p')
    expect(store.commits.map((c) => c.hash)).toEqual(['h1', 'h0'])
    expect(store.working).toHaveLength(1)
    expect(store.sinceCount).toBe(1)
    expect(store.unread.get('p')).toBe(1)
  })

  it('passes the filters to the API', async () => {
    const store = useChangesStore()
    await store.select('p')
    store.setFilters({ feature: 'feat', agent: 'ag1' })
    await Promise.resolve()
    expect(commits).toHaveBeenLastCalledWith('p', {
      repo: undefined,
      feature: 'feat',
      agent: 'ag1',
    })
  })

  it('reloads when an agent in the project stops working, but only while active', async () => {
    const store = useChangesStore()
    store.active = true
    await store.select('p') // 1st call
    commits.mockClear()
    vi.useFakeTimers()
    dispatch({
      type: 'agent.state',
      agentId: 'x',
      projectId: 'p',
      status: { state: 'idle' } as never,
    })
    await vi.advanceTimersByTimeAsync(400) // the 300ms debounce
    vi.useRealTimers()
    expect(commits).toHaveBeenCalledTimes(1)
  })

  it('moves the marker (mark read) and refreshes the count on leaving', async () => {
    const store = useChangesStore()
    await store.select('p')
    await store.moveMarker()
    expect(markRead).toHaveBeenCalledWith('p')
    expect(store.unread.get('p')).toBe(3) // from commitCount
  })
})
