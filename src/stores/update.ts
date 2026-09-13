import { defineStore } from 'pinia'
import { ref } from 'vue'
import { events } from '@/api/events'

declare const __BUILD_ID__: string

/**
 * Whether the manager serves a newer UI build than the one running. Checked
 * when the events socket reconnects (a manager deploy restarts it), when
 * the tab becomes visible or focused, and every minute (a UI-only deploy
 * swaps the build without a restart); the header then shows a
 * badge that reloads the page.
 */
export const useUpdateStore = defineStore('update', () => {
  const available = ref(false)
  const running = __BUILD_ID__

  async function check(): Promise<void> {
    try {
      const res = await fetch(`/build.json?${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) return
      const { id } = (await res.json()) as { id?: unknown }
      if (typeof id === 'string' && id !== running) available.value = true
    } catch {
      /* offline or not served: nothing to say */
    }
  }

  events.onReconnect = ((prev) => () => {
    prev?.()
    void check()
  })(events.onReconnect)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check()
  })
  window.addEventListener('focus', () => void check())
  // A UI-only deploy swaps the build under a running manager: no reconnect
  // to notice it by, so poll. One tiny fetch a minute is nothing.
  window.setInterval(() => void check(), 60 * 1000)

  function reload(): void {
    location.reload()
  }

  return { available, check, reload }
})
