import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, unauthorized } from '@/api/client'
import { events } from '@/api/events'
import type { User } from '@/api/types'

export const useSessionStore = defineStore('session', () => {
  const user = ref<User | null>(null)
  const checked = ref(false)
  const connected = ref(false)
  const daemonConnected = ref(true)

  events.onStatus = (c) => (connected.value = c)
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

  return { user, checked, connected, daemonConnected, restore, login, logout }
})
