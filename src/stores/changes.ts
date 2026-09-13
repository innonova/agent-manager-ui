import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api/client'
import { events } from '@/api/events'
import type { FileDiff, RepoChanges } from '@/api/types'

/**
 * What changed in a project since a base: the user's read cursor ("read"),
 * a feature's range ("feature:<slug>") or a commit. Reloaded whenever an
 * agent in the project stops working, like the file tree.
 */
export const useChangesStore = defineStore('changes', () => {
  const projectId = ref<string | null>(null)
  const base = ref('read')
  const repos = ref<RepoChanges[]>([])
  const open = ref<FileDiff | null>(null)
  const openPath = ref<string | null>(null)
  const error = ref<string | null>(null)
  const loading = ref(false)
  /** Unread file count per project, for the agent page's link. */
  const unread = ref(new Map<string, number>())
  let refreshTimer: number | null = null

  events.on((f) => {
    if (f.type !== 'agent.state') return
    if (f.status.state === 'idle' || f.status.state === 'error' || f.status.state === 'exited') {
      if (f.projectId === projectId.value) scheduleRefresh()
      void countUnread(f.projectId)
    }
  })

  /** Set by the files view while it shows changes; the unread count is kept regardless. */
  const active = ref(false)

  function scheduleRefresh(): void {
    if (!active.value) return
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = window.setTimeout(() => void load(), 300)
  }

  async function select(id: string, b = 'read'): Promise<void> {
    if (projectId.value !== id || base.value !== b) {
      open.value = null
      openPath.value = null
    }
    projectId.value = id
    base.value = b
    await load()
  }

  async function load(): Promise<void> {
    if (!projectId.value) return
    loading.value = true
    const forProject = projectId.value
    const forBase = base.value
    try {
      const r = await api.changes(forProject, forBase)
      if (projectId.value !== forProject || base.value !== forBase) return
      repos.value = r.repos
      error.value = null
      if (openPath.value) await openFile(openPath.value)
    } catch (e) {
      error.value = String((e as Error).message ?? e)
    } finally {
      loading.value = false
    }
  }

  async function openFile(path: string): Promise<void> {
    if (!projectId.value) return
    openPath.value = path
    const forProject = projectId.value
    try {
      const d = await api.changedFile(forProject, path, base.value)
      if (projectId.value !== forProject || openPath.value !== path) return
      open.value = d
      error.value = null
    } catch (e) {
      if (projectId.value !== forProject || openPath.value !== path) return
      open.value = null
      error.value = String((e as Error).message ?? e)
    }
  }

  async function markRead(): Promise<void> {
    if (!projectId.value) return
    await api.markRead(projectId.value)
    await load()
    void countUnread(projectId.value)
  }

  async function countUnread(id: string): Promise<void> {
    try {
      const r = await api.changes(id, 'read')
      unread.value.set(
        id,
        r.repos.reduce((n, repo) => n + repo.files.length, 0),
      )
      unread.value = new Map(unread.value)
    } catch {
      /* not important */
    }
  }

  return {
    active,
    projectId,
    base,
    repos,
    open,
    openPath,
    error,
    loading,
    unread,
    select,
    load,
    openFile,
    markRead,
    countUnread,
  }
})
