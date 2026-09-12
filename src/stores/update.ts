import { defineStore } from 'pinia'
import { ref } from 'vue'
import { events } from '@/api/events'

declare const __BUILD_ID__: string

/**
 * Whether the manager serves a newer UI build than the one running. Checked
 * when the events socket reconnects (a deploy restarts the manager), when
 * the tab becomes visible, and every ten minutes; the header then shows a
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
  window.setInterval(() => void check(), 10 * 60 * 1000)

  function reload(): void {
    location.reload()
  }

  return { available, check, reload }
})
