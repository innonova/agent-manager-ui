import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { events } from '@/api/events'
import type { PresenceUser } from '@/api/types'
import { useSessionStore } from '@/stores/session'

/**
 * Who is looking at which agent, and who is typing there, from the
 * manager's presence broadcasts; and this tab's own reports. Typing is
 * reported at most every two seconds while the text changes and stopped
 * when the turn is sent or the field emptied; the manager expires it on
 * its own after five seconds anyway.
 */
export const usePresenceStore = defineStore('presence', () => {
  const session = useSessionStore()
  const agents = ref<Record<string, PresenceUser[]>>({})
  const viewing = ref<string | null>(null)
  let typing = false
  let lastTypingSent = 0

  events.on((f) => {
    if (f.type === 'presence') agents.value = f.agents
    if (f.type === 'hello' && f.presence) agents.value = f.presence
  })
  events.onReconnect = ((prev) => () => {
    prev?.()
    events.send({ type: 'presence', agentId: viewing.value, typing: false })
  })(events.onReconnect)

  function setViewing(agentId: string | null): void {
    if (viewing.value === agentId) return
    viewing.value = agentId
    typing = false
    events.send({ type: 'presence', agentId, typing: false })
  }

  function typed(): void {
    if (!viewing.value) return
    const now = Date.now()
    if (typing && now - lastTypingSent < 2000) return
    typing = true
    lastTypingSent = now
    events.send({ type: 'presence', agentId: viewing.value, typing: true })
  }

  function stoppedTyping(): void {
    if (!typing) return
    typing = false
    events.send({ type: 'presence', agentId: viewing.value, typing: false })
  }

  /** Other users on an agent, for the header. */
  const others = computed(
    () => (agentId: string) =>
      (agents.value[agentId] ?? []).filter((u) => u.userId !== session.user?.id),
  )

  return { agents, viewing, others, setViewing, typed, stoppedTyping }
})
