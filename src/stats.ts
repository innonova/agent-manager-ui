/** A length of time as people say it: 6 d 14 h, 9 h 29 min, 12 min, 40 s. */
export function span(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const min = Math.round(s / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`
}

/** A token count: 4.5k, 34M, 1.2B. */
export function count(n: number): string {
  const short = (v: number, unit: string) => `${v >= 100 ? Math.round(v) : v.toFixed(1)}${unit}`
  if (n >= 1e9) return short(n / 1e9, 'B')
  if (n >= 1e6) return short(n / 1e6, 'M')
  if (n >= 1e3) return short(n / 1e3, 'k')
  return String(n)
}

export const day = (at: number): string =>
  new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
/** A moment as a day and a time of day. */
export const moment = (at: number): string =>
  `${day(at)} ${new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
