/**
 * Claude's 1M context window is asked for by `[1m]` at the end of the
 * model name (`claude-fable-5-2[1m]`); without it the window is the
 * model's default, 200K for some. The forms offer the suffix as a choice
 * so nobody has to know it; the name stays what is sent.
 */
const LONG = /\[1m\]$/i

export const hasLongWindow = (model: string): boolean => LONG.test(model.trim())

export function withLongWindow(model: string, on: boolean): string {
  const base = model.trim().replace(LONG, '')
  return on && base ? `${base}[1m]` : base
}

/** A context window's size as people say it: 1M, 200k. */
export const windowSize = (n: number): string =>
  n >= 1e6 && n % 1e5 === 0 ? `${n / 1e6}M` : `${Math.round(n / 1e3)}k`
