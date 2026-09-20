import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api/client'
import { events } from '@/api/events'
import type { ChangedFile, Commit, FileDiff, WorkingChange } from '@/api/types'

/** What is selected in the changes view: a commit, or a repository's working tree. */
type Selection =
  | { kind: 'commit'; repo: string; hash: string; label: string }
  | { kind: 'working'; repo: string; head: string }

/**
 * The project's commits, newest first, each attributed to a run's window
 * (who and which feature) or to the git author. Reloaded whenever an agent
 * in the project stops working, so a commit an agent just made appears
 * without a reload. The read cursor marks "you last looked here"; it moves
 * to HEAD when the reader leaves the view, not when they open it.
 */
export const useChangesStore = defineStore('changes', () => {
  const projectId = ref<string | null>(null)
  const commits = ref<Commit[]>([])
  const working = ref<WorkingChange[]>([])
  const sinceCount = ref(0)
  // filters
  const filterRepo = ref<string | null>(null)
  const filterFeature = ref<string | null>(null)
  const filterAgent = ref<string | null>(null)
  // the selected commit (or working tree) and its file list
  const selection = ref<Selection | null>(null)
  const selFiles = ref<ChangedFile[]>([])
  // the selected file's diff
  const open = ref<FileDiff | null>(null)
  const openPath = ref<string | null>(null)
  const error = ref<string | null>(null)
  const loading = ref(false)
  /** Unread commit count per project, for the tab badge and the agent-page link. */
  const unread = ref(new Map<string, number>())
  /** Set while the changes view is mounted; the unread count is kept regardless. */
  const active = ref(false)
  let refreshTimer: number | null = null

  events.on((f) => {
    if (f.type !== 'agent.state') return
    if (f.status.state === 'idle' || f.status.state === 'error' || f.status.state === 'exited') {
      if (f.projectId === projectId.value) scheduleRefresh()
      void countUnread(f.projectId)
    }
  })

  function scheduleRefresh(): void {
    if (!active.value) return
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = window.setTimeout(() => void loadCommits(), 300)
  }

  async function select(id: string): Promise<void> {
    if (projectId.value !== id) {
      selection.value = null
      selFiles.value = []
      open.value = null
      openPath.value = null
      filterRepo.value = filterFeature.value = filterAgent.value = null
    }
    projectId.value = id
    await loadCommits()
  }

  async function loadCommits(): Promise<void> {
    if (!projectId.value) return
    loading.value = true
    const forProject = projectId.value
    try {
      const r = await api.commits(forProject, {
        repo: filterRepo.value ?? undefined,
        feature: filterFeature.value ?? undefined,
        agent: filterAgent.value ?? undefined,
      })
      if (projectId.value !== forProject) return
      commits.value = r.commits
      working.value = r.working
      sinceCount.value = r.sinceCount
      unread.value = new Map(unread.value).set(forProject, r.sinceCount)
      error.value = null
    } catch (e) {
      error.value = String((e as Error).message ?? e)
    } finally {
      loading.value = false
    }
  }

  function setFilters(f: { repo?: string | null; feature?: string | null; agent?: string | null }) {
    if (f.repo !== undefined) filterRepo.value = f.repo
    if (f.feature !== undefined) filterFeature.value = f.feature
    if (f.agent !== undefined) filterAgent.value = f.agent
    void loadCommits()
  }

  /** Selects a commit and loads its file list. */
  async function openCommit(repo: string, hash: string, label: string): Promise<void> {
    selection.value = { kind: 'commit', repo, hash, label }
    open.value = null
    openPath.value = null
    const forSel = selection.value
    try {
      const r = await api.commitFiles(projectId.value!, repo, hash)
      if (selection.value !== forSel) return
      selFiles.value = r.files
      error.value = null
    } catch (e) {
      selFiles.value = []
      error.value = String((e as Error).message ?? e)
    }
  }

  /** Selects a repository's working tree (uncommitted work) and loads its file list. */
  async function openWorking(repo: string, head: string): Promise<void> {
    selection.value = { kind: 'working', repo, head }
    open.value = null
    openPath.value = null
    const forSel = selection.value
    try {
      // the uncommitted diff is what changed since HEAD; the changes route
      // returns repo-prefixed paths, so strip the prefix to a repo-relative one
      const r = await api.changes(projectId.value!, head)
      if (selection.value !== forSel) return
      const one = r.repos.find((x) => x.repo === repo)
      selFiles.value = (one?.files ?? []).map((file) => ({
        ...file,
        path: file.path.slice(repo.length + 1),
        ...(file.oldPath ? { oldPath: file.oldPath.slice(repo.length + 1) } : {}),
      }))
      error.value = null
    } catch (e) {
      selFiles.value = []
      error.value = String((e as Error).message ?? e)
    }
  }

  /** Loads the diff of one file (repo-relative) within the current selection. */
  async function openFile(relPath: string): Promise<void> {
    const sel = selection.value
    if (!sel || !projectId.value) return
    openPath.value = relPath
    const forProject = projectId.value
    try {
      const d =
        sel.kind === 'commit'
          ? await api.commitDiff(forProject, sel.repo, sel.hash, relPath)
          : await api.changedFile(forProject, `${sel.repo}/${relPath}`, sel.head)
      if (projectId.value !== forProject || openPath.value !== relPath) return
      open.value = d
      error.value = null
    } catch (e) {
      if (projectId.value !== forProject || openPath.value !== relPath) return
      open.value = null
      error.value = String((e as Error).message ?? e)
    }
  }

  /** Moves the read cursor to HEAD in every repository: called when the reader leaves the view. */
  async function moveMarker(): Promise<void> {
    const id = projectId.value
    if (!id) return
    try {
      await api.markRead(id)
      await countUnread(id)
    } catch {
      /* leaving the view; a failure here is not worth a toast */
    }
  }

  async function countUnread(id: string): Promise<void> {
    try {
      const r = await api.commitCount(id)
      unread.value = new Map(unread.value).set(id, r.sinceCount)
    } catch {
      /* not important */
    }
  }

  return {
    active,
    projectId,
    commits,
    working,
    sinceCount,
    filterRepo,
    filterFeature,
    filterAgent,
    selection,
    selFiles,
    open,
    openPath,
    error,
    loading,
    unread,
    select,
    loadCommits,
    setFilters,
    openCommit,
    openWorking,
    openFile,
    moveMarker,
    countUnread,
  }
})
