import { describe, expect, it } from 'vitest'
import { hasLongWindow, withLongWindow } from './model'

describe('the 1M window as a suffix on the model name', () => {
  it('reads the suffix off a name', () => {
    expect(hasLongWindow('claude-fable-5-2[1m]')).toBe(true)
    expect(hasLongWindow(' claude-fable-5-2[1M] ')).toBe(true)
    expect(hasLongWindow('claude-fable-5-2')).toBe(false)
    expect(hasLongWindow('')).toBe(false)
  })
  it('adds it once and takes it off again, and has nothing to add it to without a name', () => {
    expect(withLongWindow('claude-fable-5-2', true)).toBe('claude-fable-5-2[1m]')
    expect(withLongWindow('claude-fable-5-2[1m]', true)).toBe('claude-fable-5-2[1m]')
    expect(withLongWindow('claude-fable-5-2[1m]', false)).toBe('claude-fable-5-2')
    expect(withLongWindow('  ', true)).toBe('')
  })
})
