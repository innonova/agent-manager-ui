import { defineStore } from 'pinia'
import { ref } from 'vue'
import router from '@/router'
import type { AgentState } from '@/api/types'
import type { AgentRow } from '@/stores/agents'
import { usePreferencesStore } from '@/stores/preferences'

export interface Toast {
  id: number
  level: 'info' | 'error'
  text: string
}

export const useNotificationsStore = defineStore('notifications', () => {
  const toasts = ref<Toast[]>([])
  let next = 1

  function push(level: Toast['level'], text: string, ttlMs = 8000): void {
    const id = next++
    toasts.value.push({ id, level, text })
    setTimeout(() => dismiss(id), ttlMs)
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  /**
   * A browser notification when an agent stops needing the user's absence:
   * it finished working (ready for more), needs input or a permission, or
   * failed. Only when the preference is on, the browser allows it, and the
   * page is not focused; someone looking at the page sees the state badge
   * change anyway. Clicking it brings the window up on that agent.
   */
  function agentChanged(row: AgentRow, was: AgentState, now: AgentState): void {
    const prefs = usePreferencesStore()
    if (!prefs.desktopNotifications || prefs.notificationPermission() !== 'granted') return
    if (document.hasFocus()) return
    const text =
      now === 'idle' && was === 'working'
        ? 'is ready for more'
        : now === 'waiting-input' || now === 'waiting-permission'
          ? 'needs your input'
          : now === 'error' && was !== 'error'
            ? `failed: ${row.status.error ?? 'error'}`
            : null
    if (!text) return
    const n = new Notification(`${row.agent.name} ${text}`, {
      body: 'agent-manager',
      tag: `agent-${row.agent.id}`, // one at a time per agent
    })
    n.onclick = () => {
      window.focus()
      void router.push({
        name: 'agent',
        params: { id: row.agent.projectId, agentId: row.agent.id },
      })
      n.close()
    }
  }

  return { toasts, push, dismiss, agentChanged }
})
