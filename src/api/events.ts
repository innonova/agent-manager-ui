import type { EventFrame } from './types'

type Listener = (frame: EventFrame) => void

/**
 * The manager's event stream. Reconnects with backoff; after a reconnect
 * `onReconnect` fires so stores can refetch what they may have missed.
 */
export class EventStream {
  private ws: WebSocket | null = null
  private listeners = new Set<Listener>()
  private backoff = 500
  private timer: number | null = null
  private wasConnected = false
  private stopped = false
  onReconnect: (() => void) | null = null
  onStatus: ((connected: boolean) => void) | null = null

  start(): void {
    this.stopped = false
    this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.ws?.close()
    this.ws = null
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private connect(): void {
    if (this.stopped) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/api/events`)
    this.ws = ws
    ws.onopen = () => {
      this.backoff = 500
      this.onStatus?.(true)
      if (this.wasConnected) this.onReconnect?.()
      this.wasConnected = true
    }
    ws.onmessage = (m) => {
      const frame = JSON.parse(String(m.data)) as EventFrame
      for (const l of this.listeners) l(frame)
    }
    ws.onclose = (ev) => {
      this.ws = null
      this.onStatus?.(false)
      if (ev.code === 4401 || this.stopped) return
      this.timer = window.setTimeout(() => this.connect(), this.backoff)
      this.backoff = Math.min(this.backoff * 2, 10_000)
    }
  }
}

export const events = new EventStream()
