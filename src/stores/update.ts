import { defineStore } from 'pinia'
import { ref } from 'vue'
import { events } from '@/api/events'

declare const __BUILD_ID__: string

/**
 * Whether the manager serves a newer UI build than the one running. The
 * manager says which build it serves in `hello` and announces a change
 * with `ui.build` (it re-reads build.json on its ping tick), so the page
 * never polls. The header then shows a badge that reloads.
 *
 * In development the served build (if any) is never the one running, so
 * only a change announced after load counts there.
 */
export const useUpdateStore = defineStore('update', () => {
  const available = ref(false)
  const running = __BUILD_ID__

  events.on((f) => {
    // hello: a tab loaded before a deploy and reconnecting after it.
    if (f.type === 'hello' && !import.meta.env.DEV && f.uiBuild && f.uiBuild !== running)
      available.value = true
    // ui.build is only sent when the served build changed: always an update.
    if (f.type === 'ui.build' && f.id && (import.meta.env.DEV || f.id !== running))
      available.value = true
  })

  function reload(): void {
    location.reload()
  }

  return { available, reload }
})
