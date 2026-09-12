import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, unauthorized } from '@/api/client'
import { events } from '@/api/events'
import type { User } from '@/api/types'

export const useSessionStore = defineStore('session', () => {
  const user = ref<User | null>(null)
  const checked = ref(false)
  const connected = ref(false)
  /**
   * `connected` gone false for a couple of seconds. The events socket is
   * dropped by proxies and by manager restarts and comes back within a
   * second; the header badge follows this so it does not flash each time.
   */
  const offline = ref(false)
  let offlineTimer: number | null = null
  const daemonConnected = ref(true)

  events.onStatus = (c) => {
    connected.value = c
    if (offlineTimer) clearTimeout(offlineTimer)
    offlineTimer = null
    if (c) offline.value = false
    else offlineTimer = window.setTimeout(() => (offline.value = !connected.value), 2000)
  }
  events.on((f) => {
    if (f.type === 'hello') daemonConnected.value = f.daemon.connected
    if (f.type === 'daemon') daemonConnected.value = f.connected
  })
  unauthorized.addEventListener('unauthorized', () => {
    user.value = null
    events.stop()
  })

  async function restore(): Promise<void> {
    try {
      user.value = (await api.me()).user
      events.start()
    } catch {
      user.value = null
    } finally {
      checked.value = true
    }
  }

  async function login(name: string, password: string): Promise<void> {
    user.value = (await api.login(name, password)).user
    events.start()
  }

  async function logout(): Promise<void> {
    events.stop()
    await api.logout().catch(() => undefined)
    user.value = null
  }

  return { user, checked, connected, offline, daemonConnected, restore, login, logout }
})
