import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api/client'
import { events } from '@/api/events'
import type { HostStatus } from '@/api/types'

/**
 * The machines behind this manager: itself, and as a hub its spokes.
 * From `hello` and `hosts` frames; a project's `host` names one of them.
 */
export const useHostsStore = defineStore('hosts', () => {
  const list = ref<HostStatus[]>([])
  events.on((f) => {
    if (f.type === 'hello' && f.hosts) list.value = f.hosts
    if (f.type === 'hosts') list.value = f.hosts
  })
  // The store may be created after the socket's hello has passed (a view's lazy
  // chunk); health is public and says the same, so ask once.
  void api.health().then(
    (h) => {
      if (h.hosts && list.value.length === 0) list.value = h.hosts
    },
    () => undefined,
  )
  const several = computed(() => list.value.length > 1)
  const byName = (name: string | undefined) => list.value.find((h) => h.name === name)
  const local = computed(() => list.value.find((h) => h.local))
  return { list, several, byName, local }
})
