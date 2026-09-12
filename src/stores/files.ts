import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { api } from '@/api/client'
import { events } from '@/api/events'
import type { DirEntry, FileContent } from '@/api/types'

/**
 * A project's tree as the user has explored it, plus the open file. Loaded
 * directories and the open file are refreshed whenever an agent in the
 * project stops working, since that is when files change.
 */
export const useFilesStore = defineStore('files', () => {
  const projectId = ref<string | null>(null)
  /** directory path -> entries, for every directory that has been expanded */
  const dirs = reactive(new Map<string, DirEntry[]>())
  const expanded = reactive(new Set<string>())
  const open = ref<FileContent | null>(null)
  const openPath = ref<string | null>(null)
  const error = ref<string | null>(null)
  let refreshTimer: number | null = null

  events.on((f) => {
    if (f.type !== 'agent.state' || f.projectId !== projectId.value) return
    if (f.status.state === 'idle' || f.status.state === 'error' || f.status.state === 'exited')
      scheduleRefresh()
  })
  events.onReconnect = ((prev) => () => {
    prev?.()
    scheduleRefresh()
  })(events.onReconnect)

  function scheduleRefresh(): void {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = window.setTimeout(() => void refresh(), 300)
  }

  async function select(id: string): Promise<void> {
    if (projectId.value === id) return
    projectId.value = id
    dirs.clear()
    expanded.clear()
    open.value = null
    openPath.value = null
    await loadDir('')
    expanded.add('')
  }

  async function loadDir(path: string): Promise<void> {
    if (!projectId.value) return
    try {
      const r = await api.files(projectId.value, path)
      dirs.set(path, r.entries)
      error.value = null
    } catch (e) {
      error.value = String((e as Error).message ?? e)
    }
  }

  async function toggle(path: string): Promise<void> {
    if (expanded.has(path)) {
      expanded.delete(path)
      return
    }
    if (!dirs.has(path)) await loadDir(path)
    expanded.add(path)
  }

  async function openFile(path: string): Promise<void> {
    if (!projectId.value) return
    openPath.value = path
    try {
      open.value = await api.file(projectId.value, path)
      error.value = null
    } catch (e) {
      open.value = null
      error.value = String((e as Error).message ?? e)
    }
  }

  /** Re-read every expanded directory and the open file (only if it changed). */
  async function refresh(): Promise<void> {
    if (!projectId.value) return
    await Promise.all([...dirs.keys()].map((d) => loadDir(d)))
    if (openPath.value) {
      const before = open.value?.mtime
      const fresh = await api.file(projectId.value, openPath.value).catch(() => null)
      if (fresh && fresh.mtime !== before) open.value = fresh
    }
  }

  return { projectId, dirs, expanded, open, openPath, error, select, toggle, openFile, refresh }
})
