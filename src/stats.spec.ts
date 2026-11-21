import { describe, expect, it } from 'vitest'
import type { AgentStats } from '@/api/types'
import { count, span, statRows } from './stats'

const MIN = 60_000
const H = 60 * MIN

describe('statistics in words', () => {
  it('says lengths of time and token counts as people do', () => {
    expect(
      [40_000, 12 * MIN, 9 * H + 29 * MIN, 3 * H, 6 * 24 * H + 14 * H, 2 * 24 * H].map(span),
    ).toEqual(['40 s', '12 min', '9 h 29 min', '3 h', '6 d 14 h', '2 d'])
    expect([950, 4_500, 34_000_000, 1_234_000_000, 250_000].map(count)).toEqual([
      '950',
      '4.5k',
      '34.0M',
      '1.2B',
      '250k',
    ])
  })

  it('makes rows of the statistics, leaving out what there is nothing of', () => {
    const none = { turns: 0, runtimeMs: 0 }
    const s: AgentStats = {
      since: Date.UTC(2026, 8, 12, 12),
      turns: 1204,
      runtimeMs: 6 * 24 * H + 14 * H,
      tokens: {
        input: 2_100_000,
        cacheWrite: 34_000_000,
        cacheRead: 1_200_000_000,
        output: 5_600_000,
      },
      costUsd: 3412.4,
      working: true,
      startedBy: {
        person: { turns: 310, runtimeMs: 4 * 24 * H },
        self: { turns: 120, runtimeMs: 24 * H },
        manager: none,
        agent: none,
      },
      sinceLastMessage: {
        at: Date.UTC(2026, 10, 21, 12),
        by: 'aek',
        runtimeMs: 12 * MIN,
        turns: 1,
        outputTokens: 4_500,
      },
      runs: {
        count: 274,
        medianMs: 6 * MIN,
        longestMs: 9 * H,
        longest: [{ at: Date.UTC(2026, 10, 4, 12), by: 'aek', runtimeMs: 9 * H }],
      },
      unattended: {
        afterMs: 30 * MIN,
        runtimeMs: 2 * 24 * H,
        share: 0.32,
        runs: 41,
        longestMs: 9 * H,
        medianMs: 48 * MIN,
      },
    }
    const rows = Object.fromEntries(statRows(s).map((r) => [r.label, r.text]))
    expect(rows.runtime).toMatch(/^6 d 14 h in 1,204 turns, since .*; working now$/)
    expect(rows.tokens).toBe(
      '5.6M out · 2.1M read fresh · 34.0M written to cache · 1.2B read from cache',
    )
    expect(rows.cost).toBe('$3,412')
    expect(rows['started by']).toBe('a person 310 (4 d) · itself 120 (1 d)')
    expect(rows["since aek's last message"]).toMatch(/^12 min of work, 4\.5k tokens out; written /)
    expect(rows.runs).toMatch(/^274 · median 6 min · longest 9 h \(/)
    expect(rows.unattended).toBe(
      '2 d, 32% of the runtime; 41 runs went on unattended, median 48 min, longest 9 h',
    )
    expect(statRows({ ...s, since: null })).toEqual([
      { label: 'runtime', text: 'this agent has not run yet' },
    ])
  })
})
