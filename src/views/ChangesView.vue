<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import ResizeHandle from '@/components/ResizeHandle.vue'
import { useResizable } from '@/composables/useResizable'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import ProjectHeader from '@/components/ProjectHeader.vue'
import { useChangesStore } from '@/stores/changes'
import { useProjectsStore } from '@/stores/projects'
import { useFeaturesStore } from '@/stores/features'
import { useAgentsStore } from '@/stores/agents'
import { when } from '@/time'

const DiffViewer = defineAsyncComponent(() => import('@/components/DiffViewer.vue'))

const props = defineProps<{ id: string }>()
const listPane = useResizable('changes-list', 320)
const filesPane = useResizable('changes-files', 256)
const route = useRoute()
const router = useRouter()
const changes = useChangesStore()
const projects = useProjectsStore()
const features = useFeaturesStore()
const agents = useAgentsStore()
const inline = ref(false)

const repos = computed(() => projects.byId.get(props.id)?.project.repos ?? [])
const featureList = computed(() => features.byProject.get(props.id) ?? [])
const agentList = computed(() => (agents.byProject.get(props.id) ?? []).map((r) => r.agent))

const STATUS_LETTER: Record<string, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
}
const STATUS_CLASS: Record<string, string> = {
  modified: 'text-[#895503] dark:text-[#e2c08d]',
  added: 'text-[#587c0c] dark:text-[#81b88b]',
  deleted: 'text-[#ad0707] dark:text-[#c74e39]',
  renamed: 'text-[#895503] dark:text-[#e2c08d]',
  untracked: 'text-[#007100] dark:text-[#73c991]',
}

const strOr = (v: unknown) => (typeof v === 'string' && v ? v : null)

/** The commit list, newest first; the "you last looked here" divider goes before the first read commit. */
const dividerAt = computed(() => {
  const i = changes.commits.findIndex((c) => !c.unread)
  return i === -1 ? changes.commits.length : i
})

// Filters live in the URL, so a link (a feature's "changes", a run) carries
// them and a reload keeps them. The selects write the query; one watcher
// reads it back into the store and reloads.
function setFilter(kind: 'repo' | 'feature' | 'agent', value: string | null) {
  const query = { ...route.query }
  if (value) query[kind] = value
  else delete query[kind]
  void router.replace({ query })
}
function syncFromQuery() {
  const repo = strOr(route.query.repo)
  const feature = strOr(route.query.feature)
  const agent = strOr(route.query.agent)
  if (
    repo === changes.filterRepo &&
    feature === changes.filterFeature &&
    agent === changes.filterAgent
  )
    return
  changes.setFilters({ repo, feature, agent })
}
watch(() => route.query, syncFromQuery)

onMounted(async () => {
  if (!projects.loaded) await projects.load()
  if (!features.byProject.has(props.id)) void features.load(props.id)
  if (!agents.byProject.has(props.id)) void agents.load(props.id).catch(() => undefined)
  changes.active = true
  await changes.select(props.id)
  syncFromQuery() // apply any filters the URL arrived with
})
watch(
  () => props.id,
  async (id) => {
    if (!features.byProject.has(id)) void features.load(id)
    if (!agents.byProject.has(id)) void agents.load(id).catch(() => undefined)
    await changes.select(id)
    syncFromQuery()
  },
)

// The marker moves to HEAD when the reader leaves the view — not when they
// open it — so "you last looked here" means the last time they had it open.
// A route change and an unmount both count; a tab closed on the view has not
// looked away, so nothing fires there.
onBeforeRouteLeave(() => {
  void changes.moveMarker()
})
onUnmounted(() => {
  changes.active = false
})

// keyboard: up and down move through the commit list
const commitIndex = computed(() => {
  const s = changes.selection
  if (s?.kind !== 'commit') return -1
  return changes.commits.findIndex((c) => c.hash === s.hash)
})
function openCommit(repo: string, hash: string, subject: string) {
  void changes.openCommit(repo, hash, subject)
}
function onListKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const n = changes.commits.length
  if (!n) return
  const cur = commitIndex.value
  const next = e.key === 'ArrowDown' ? Math.min(n - 1, cur + 1) : Math.max(0, cur < 0 ? 0 : cur - 1)
  const c = changes.commits[next]
  if (c) openCommit(c.repo, c.hash, c.subject)
  e.preventDefault()
}

const selectedFileTitle = computed(() => {
  const s = changes.selection
  if (!s) return ''
  return s.kind === 'commit'
    ? `${s.repo} · ${s.hash.slice(0, 8)} — ${s.label}`
    : `${s.repo} · working tree`
})
</script>

<template>
  <AppShell>
    <template #title><ProjectHeader :id="id" /></template>
    <div class="flex h-full">
      <!-- left: filters, working tree, the commit list -->
      <aside
        :style="{ width: `${listPane.width.value}px` }"
        class="flex min-w-0 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex flex-wrap items-center gap-1.5 px-3 py-2 text-sm">
          <span class="font-semibold tracking-wide text-slate-900 uppercase dark:text-slate-100"
            >Changes</span
          >
          <span class="grow" />
          <button
            class="text-blue-700 hover:underline dark:text-blue-300"
            data-test="commits-refresh"
            @click="changes.loadCommits()"
          >
            refresh
          </button>
        </div>
        <div class="flex flex-wrap gap-1.5 px-3 pb-2 text-sm">
          <select
            v-if="repos.length > 1"
            class="rounded border border-slate-300 bg-white px-1 py-0.5 dark:border-slate-700 dark:bg-slate-900"
            data-test="filter-repo"
            :value="changes.filterRepo ?? ''"
            @change="setFilter('repo', ($event.target as HTMLSelectElement).value || null)"
          >
            <option value="">all repos</option>
            <option v-for="r in repos" :key="r.name" :value="r.name">{{ r.name }}</option>
          </select>
          <select
            class="min-w-0 grow rounded border border-slate-300 bg-white px-1 py-0.5 dark:border-slate-700 dark:bg-slate-900"
            data-test="filter-feature"
            :value="changes.filterFeature ?? ''"
            @change="setFilter('feature', ($event.target as HTMLSelectElement).value || null)"
          >
            <option value="">all features</option>
            <option v-for="f in featureList" :key="f.slug" :value="f.slug">{{ f.title }}</option>
          </select>
          <select
            class="rounded border border-slate-300 bg-white px-1 py-0.5 dark:border-slate-700 dark:bg-slate-900"
            data-test="filter-agent"
            :value="changes.filterAgent ?? ''"
            @change="setFilter('agent', ($event.target as HTMLSelectElement).value || null)"
          >
            <option value="">all agents</option>
            <option v-for="a in agentList" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>
        <div
          class="min-h-0 grow overflow-auto pb-4 outline-none"
          tabindex="0"
          data-test="commits-list"
          @keydown="onListKey"
        >
          <!-- uncommitted work, above the commits -->
          <button
            v-for="w in changes.working"
            :key="`w-${w.repo}`"
            class="flex w-full items-center gap-2 px-3 py-1 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
            :class="
              changes.selection?.kind === 'working' && changes.selection.repo === w.repo
                ? 'bg-slate-200 dark:bg-slate-700'
                : ''
            "
            data-test="working-row"
            @click="changes.openWorking(w.repo, w.head)"
          >
            <span class="truncate text-slate-600 italic dark:text-slate-300"
              >working tree<span v-if="repos.length > 1" class="font-mono not-italic">
                · {{ w.repo }}</span
              ><span v-if="w.agent"> · {{ w.agent }}</span> · in progress</span
            >
            <span class="grow" />
            <span class="shrink-0 text-xs text-slate-400">{{ w.files }}</span>
          </button>

          <template v-for="(c, i) in changes.commits" :key="c.hash">
            <div
              v-if="i === dividerAt"
              class="flex items-center gap-2 px-3 py-1 text-xs text-blue-700 dark:text-blue-300"
              data-test="last-looked"
            >
              <span class="h-px grow bg-blue-300 dark:bg-blue-700" />you last looked here<span
                class="h-px grow bg-blue-300 dark:bg-blue-700"
              />
            </div>
            <button
              class="flex w-full flex-col gap-0.5 border-l-2 px-3 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
              :class="
                changes.selection?.kind === 'commit' && changes.selection.hash === c.hash
                  ? 'border-blue-500 bg-slate-200 dark:bg-slate-700'
                  : 'border-transparent'
              "
              data-test="commit-row"
              :data-hash="c.hash"
              @click="openCommit(c.repo, c.hash, c.subject)"
            >
              <span class="flex items-center gap-2 text-sm">
                <span class="truncate">{{ c.subject }}</span>
                <span class="grow" />
                <span class="shrink-0 font-mono text-xs text-slate-400">{{ c.shortHash }}</span>
              </span>
              <span class="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span v-if="repos.length > 1" class="font-mono">{{ c.repo }}</span>
                <span :class="c.agent ? 'text-slate-600 dark:text-slate-300' : ''">{{
                  c.agent ?? c.author
                }}</span>
                <span>·</span>
                <span>{{ when(c.at) }}</span>
                <span
                  v-if="c.feature"
                  class="rounded bg-violet-100 px-1 text-violet-900 dark:bg-violet-900 dark:text-violet-100"
                  data-test="commit-feature"
                  >{{ c.feature }}</span
                >
              </span>
            </button>
          </template>
          <div
            v-if="dividerAt === changes.commits.length && changes.commits.length"
            class="flex items-center gap-2 px-3 py-1 text-xs text-blue-700 dark:text-blue-300"
            data-test="last-looked"
          >
            <span class="h-px grow bg-blue-300 dark:bg-blue-700" />you last looked here<span
              class="h-px grow bg-blue-300 dark:bg-blue-700"
            />
          </div>
          <p
            v-if="!changes.loading && !changes.commits.length && !changes.working.length"
            class="px-3 py-2 text-sm text-slate-400 dark:text-slate-500"
            data-test="commits-empty"
          >
            No commits{{ changes.filterFeature || changes.filterAgent ? ' for this filter' : '' }}.
          </p>
        </div>
        <p
          v-if="changes.error"
          class="px-3 py-2 text-sm text-red-700 dark:text-red-300"
          data-test="commits-error"
        >
          {{ changes.error }}
        </p>
      </aside>
      <ResizeHandle @start="listPane.start" />

      <!-- middle: the selected commit's (or working tree's) files; its handle goes with it -->
      <template v-if="changes.selection">
        <aside
          :style="{ width: `${filesPane.width.value}px` }"
          class="flex min-w-0 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          <div
            class="truncate px-3 py-2 text-sm text-slate-500 dark:text-slate-400"
            data-test="commit-meta"
          >
            {{ selectedFileTitle }}
          </div>
          <div class="min-h-0 grow overflow-auto pb-4">
            <button
              v-for="f in changes.selFiles"
              :key="f.path"
              class="flex w-full items-center gap-2 truncate px-3 py-0.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              :class="
                changes.openPath === f.path ? 'bg-slate-200 font-medium dark:bg-slate-700' : ''
              "
              :title="f.oldPath ? `${f.oldPath} → ${f.path}` : f.path"
              data-test="commit-file"
              :data-path="f.path"
              :data-status="f.status"
              @click="changes.openFile(f.path)"
            >
              <span class="truncate" :class="STATUS_CLASS[f.status]">{{ f.path }}</span>
              <span class="grow" />
              <span class="shrink-0 text-xs" :class="STATUS_CLASS[f.status]">{{
                STATUS_LETTER[f.status]
              }}</span>
            </button>
            <p
              v-if="!changes.selFiles.length"
              class="px-3 py-2 text-sm text-slate-400 dark:text-slate-500"
            >
              No files.
            </p>
          </div>
        </aside>
        <ResizeHandle @start="filesPane.start" />
      </template>

      <!-- right: the diff -->
      <section class="flex min-w-0 grow flex-col">
        <div
          class="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-base dark:border-slate-800 dark:bg-slate-900"
        >
          <span class="truncate font-mono text-sm" data-test="diff-path">{{
            changes.openPath ?? 'select a commit, then a file'
          }}</span>
          <span class="grow" />
          <label v-if="changes.open" class="flex items-center gap-1 text-sm text-slate-500">
            <input v-model="inline" type="checkbox" /> inline
          </label>
        </div>
        <div class="min-h-0 grow bg-white dark:bg-slate-950">
          <p v-if="!changes.open" class="p-6 text-base text-slate-400">
            The project's commits, newest first, with who made each and for which feature. Select a
            commit to see its files, then a file for its diff. This list refreshes when an agent
            finishes a turn.
          </p>
          <p
            v-else-if="changes.open.binary || changes.open.truncated"
            class="p-6 text-base text-slate-400"
            data-test="diff-unavailable"
          >
            {{ changes.open.binary ? 'Binary file.' : 'Too large to show.' }}
          </p>
          <DiffViewer
            v-else
            :path="changes.open.path"
            :before="changes.open.before ?? ''"
            :after="changes.open.after ?? ''"
            :inline="inline"
          />
        </div>
      </section>
    </div>
  </AppShell>
</template>
