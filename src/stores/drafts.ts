import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'

const KEY = 'agent-manager-ui.drafts'

/**
 * Unsent turn text per agent. Lives outside the input component so that
 * switching tab, agent or project, or reloading the page, does not throw
 * away what was being typed. Persisted per browser in localStorage; an
 * entry is dropped when the text is sent or cleared.
 */
export const useDraftsStore = defineStore('drafts', () => {
  const drafts = reactive(new Map<string, string>())

  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, unknown>
      for (const [id, text] of Object.entries(saved))
        if (typeof text === 'string' && text) drafts.set(id, text)
    }
  } catch {
    /* no storage, or garbage: start empty */
  }

  watch(drafts, () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(drafts)))
    } catch {
      /* ignore */
    }
  })

  function get(agentId: string): string {
    return drafts.get(agentId) ?? ''
  }

  function set(agentId: string, text: string): void {
    if (text) drafts.set(agentId, text)
    else drafts.delete(agentId)
  }

  return { get, set }
})
