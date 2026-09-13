import { defineStore } from 'pinia'
import { nextTick, reactive, ref } from 'vue'
import { api } from '@/api/client'
import { events } from '@/api/events'
import type { DirEntry, FileContent } from '@/api/types'

const EXPANDED_KEY = 'agent-manager-ui.files.expanded'

function loadExpanded(projectId: string): string[] {
  try {
    const all = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '{}') as Record<string, unknown>
    const v = all[projectId]
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function saveExpanded(projectId: string, paths: string[]): void {
  try {
    const all = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '{}') as Record<string, unknown>
    all[projectId] = paths
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

/** The directories above `path`, outermost first, excluding the root. */
function ancestors(path: string): string[] {
  const parts = path.split('/')
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'))
}

/**
 * A project's tree as the user has explored it, plus the open file. Loaded
 * directories and the open file are refreshed whenever an agent in the
 * project stops working, since that is when files change. Which
 * directories are expanded is remembered per project in localStorage.
 */
export const useFilesStore = defineStore('files', () => {
  const projectId = ref<string | null>(null)
  /** directory path -> entries, for every directory that has been expanded */
  const dirs = reactive(new Map<string, DirEntry[]>())
  const expanded = reactive(new Set<string>())
  const open = ref<FileContent | null>(null)
  const openPath = ref<string | null>(null)
  const error = ref<string | null>(null)
  /** Substring filter on names; matching directories are held open while it is set. */
  const filter = ref('')
  /** Keyboard cursor in the tree. */
  const focused = ref<string | null>(null)
  let refreshTimer: number | null = null

  const HIDDEN = new Set(['.git'])
  const matches = (name: string) => name.toLowerCase().includes(filter.value.toLowerCase())

  /** Whether any loaded entry below `dir` matches the filter. */
  function hasMatch(dir: string): boolean {
    for (const e of dirs.get(dir) ?? []) {
      if (HIDDEN.has(e.name)) continue
      if (matches(e.name)) return true
      if (e.type === 'dir' && hasMatch(e.path)) return true
    }
    return false
  }

  /** The entries of `dir` as shown: `.git` hidden, and only matches while filtering. */
  function children(dir: string): DirEntry[] {
    const all = (dirs.get(dir) ?? []).filter((e) => !HIDDEN.has(e.name))
    if (!filter.value) return all
    return all.filter((e) => matches(e.name) || (e.type === 'dir' && hasMatch(e.path)))
  }

  function isOpen(dir: string): boolean {
    return expanded.has(dir) || (Boolean(filter.value) && hasMatch(dir))
  }

  /** Every visible row, top to bottom, as the keyboard sees it. */
  function rows(): DirEntry[] {
    const out: DirEntry[] = []
    const walk = (dir: string) => {
      for (const e of children(dir)) {
        out.push(e)
        if (e.type === 'dir' && isOpen(e.path)) walk(e.path)
      }
    }
    walk('')
    return out
  }

  function focus(path: string | null): void {
    focused.value = path
    if (!path) return
    void nextTick(() => {
      document
        .querySelector(`[data-test=file-tree] [data-path="${CSS.escape(path)}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    })
  }

  events.on((f) => {
    if (f.type !== 'agent.state' || f.projectId !== projectId.value) return
    if (f.status.state === 'idle' || f.status.state === 'error' || f.status.state === 'exited')
      scheduleRefresh()
  })
  events.onReconnect = ((prev) => () => {
    prev?.()
    scheduleRefresh()
  })(events.onReconnect)

  /** Set by the files view while it is mounted; nothing refreshes for a view nobody is looking at. */
  const active = ref(false)

  function scheduleRefresh(): void {
    if (!active.value) return
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
    filter.value = ''
    focused.value = null
    const remembered = loadExpanded(id)
    await Promise.all(['', ...remembered].map((d) => loadDir(d)))
    expanded.add('')
    for (const d of remembered) if (dirs.has(d)) expanded.add(d)
  }

  function remember(): void {
    if (projectId.value)
      saveExpanded(
        projectId.value,
        [...expanded].filter((d) => d !== ''),
      )
  }

  /** Expands every directory above `path` so the entry is visible in the tree. */
  async function reveal(path: string): Promise<void> {
    for (const d of ancestors(path)) {
      if (!dirs.has(d)) await loadDir(d)
      expanded.add(d)
    }
    remember()
  }

  function collapseAll(): void {
    expanded.clear()
    expanded.add('')
    remember()
  }

  async function loadDir(path: string): Promise<void> {
    if (!projectId.value) return
    const forProject = projectId.value
    try {
      const r = await api.files(forProject, path)
      if (projectId.value !== forProject) return // switched meanwhile
      dirs.set(path, r.entries)
      error.value = null
    } catch (e) {
      error.value = String((e as Error).message ?? e)
    }
  }

  async function toggle(path: string): Promise<void> {
    if (expanded.has(path)) {
      expanded.delete(path)
    } else {
      if (!dirs.has(path)) await loadDir(path)
      expanded.add(path)
    }
    remember()
  }

  async function openFile(path: string): Promise<void> {
    if (!projectId.value) return
    const forProject = projectId.value
    openPath.value = path
    try {
      const content = await api.file(forProject, path)
      if (projectId.value !== forProject || openPath.value !== path) return
      open.value = content
      error.value = null
    } catch (e) {
      if (projectId.value !== forProject || openPath.value !== path) return
      open.value = null
      error.value = String((e as Error).message ?? e)
    }
  }

  /**
   * Where an upload or a new folder goes: the focused directory, else the
   * directory of the focused or open file, else the first repository.
   */
  function targetDir(): string | null {
    const isDir = (p: string) => {
      const parent = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
      return (dirs.get(parent) ?? []).some((e) => e.path === p && e.type === 'dir')
    }
    const pick = focused.value ?? openPath.value
    if (pick) {
      if (isDir(pick)) return pick
      if (pick.includes('/')) return pick.slice(0, pick.lastIndexOf('/'))
      return pick
    }
    return (dirs.get('') ?? [])[0]?.path ?? null
  }

  /** Uploads files into `dir`; a name in use is not replaced unless `overwrite`. Returns the paths written. */
  async function upload(dir: string, list: File[], overwrite = false): Promise<string[]> {
    if (!projectId.value) return []
    const done: string[] = []
    for (const f of list) {
      const r = await api.upload(projectId.value, `${dir}/${f.name}`, f, overwrite)
      done.push(r.path)
    }
    await loadDir(dir)
    if (!expanded.has(dir)) {
      expanded.add(dir)
      remember()
    }
    return done
  }

  async function mkdir(dir: string, name: string): Promise<string> {
    if (!projectId.value) throw new Error('no project')
    const r = await api.mkdir(projectId.value, `${dir}/${name}`)
    await loadDir(dir)
    if (!expanded.has(dir)) expanded.add(dir)
    if (!dirs.has(r.path)) await loadDir(r.path)
    remember()
    focus(r.path)
    return r.path
  }

  /** Re-read every expanded directory and the open file (only if it changed). */
  async function refresh(): Promise<void> {
    if (!projectId.value) return
    await Promise.all([...dirs.keys()].map((d) => loadDir(d)))
    if (openPath.value) {
      const forProject = projectId.value
      const forPath = openPath.value
      const before = open.value?.mtime
      const fresh = await api.file(forProject, forPath).catch(() => null)
      if (projectId.value !== forProject || openPath.value !== forPath) return
      if (fresh && fresh.mtime !== before) open.value = fresh
    }
  }

  return {
    active,
    projectId,
    dirs,
    expanded,
    open,
    openPath,
    error,
    filter,
    focused,
    children,
    isOpen,
    rows,
    focus,
    select,
    toggle,
    reveal,
    collapseAll,
    openFile,
    refresh,
    targetDir,
    upload,
    mkdir,
  }
})
