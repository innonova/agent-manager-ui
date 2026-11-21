import { describe, expect, it } from 'vitest'
import { count, span } from './stats'

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
})
