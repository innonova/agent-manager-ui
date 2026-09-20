<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import ResizeHandle from '@/components/ResizeHandle.vue'
import { useResizable } from '@/composables/useResizable'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ApiError, api } from '@/api/client'
import type { Profile, TurnImage } from '@/api/types'
import ActivityLine from '@/components/ActivityLine.vue'
import AppShell from '@/components/AppShell.vue'
import ModalForm from '@/components/ModalForm.vue'
import ProjectHeader from '@/components/ProjectHeader.vue'
import StateBadge from '@/components/StateBadge.vue'
import UsageChip from '@/components/UsageChip.vue'
import ProjectTree from '@/components/ProjectTree.vue'
import TranscriptView from '@/components/TranscriptView.vue'
import TurnInput from '@/components/TurnInput.vue'
import { useAgentsStore } from '@/stores/agents'
import { useDraftsStore } from '@/stores/drafts'
import { usePresenceStore } from '@/stores/presence'
import { since, when } from '@/time'
import { useNotificationsStore } from '@/stores/notifications'
import { useProjectsStore } from '@/stores/projects'

const props = defineProps<{ id: string; agentId?: string }>()
const drafts = useDraftsStore()
const presence = usePresenceStore()
watch(
  () => props.agentId ?? null,
  (id) => presence.setViewing(id),
  { immediate: true },
)
onUnmounted(() => presence.setViewing(null))
const othersHere = computed(() => (props.agentId ? presence.others(props.agentId) : []))
const othersTyping = computed(() => othersHere.value.filter((u) => u.typing))
const router = useRouter()
const projects = useProjectsStore()
const agents = useAgentsStore()
const notifications = useNotificationsStore()

const project = computed(() => projects.byId.get(props.id)?.project)
const rows = computed(() => agents.byProject.get(props.id) ?? [])
const current = computed(() => (props.agentId ? agents.byId.get(props.agentId) : undefined))
const showNote = ref(false)
const showDetails = ref(false)
const treePane = useResizable('project-tree', 288)
const items = computed(() => (props.agentId ? (agents.items.get(props.agentId) ?? []) : []))
const route = useRoute()
/** An item index to scroll the transcript to (a link from the changes tab). */
const scrollTarget = ref<number | null>(null)
const activity = computed(() => current.value?.status.activity ?? null)
/** The current thinking item's live text: only the last item counts, since nothing else appends while it streams. */
const liveThinkingText = computed(() => {
  if (activity.value?.kind !== 'thinking') return null
  const last = items.value[items.value.length - 1]
  return last?.item.kind === 'thinking' ? last.item.text : null
})
/**
 * A tool call whose result has not arrived: the manager's own activity
 * broadcast for it is throttled to at most once a second and can lag a
 * turn that just started one, but the transcript already has it the
 * instant the item does.
 */
const pendingToolUse = computed(() => {
  const last = items.value[items.value.length - 1]
  return last?.item.kind === 'tool_use' ? { name: last.item.name, since: last.at } : null
})
/** What status.activity says, corrected for that lag. */
const effectiveActivity = computed(() => {
  const a = activity.value
  const pending = pendingToolUse.value
  if (!a || !pending || a.kind === 'tool' || a.kind === 'waiting') return a
  return { kind: 'tool' as const, tool: pending.name, tokens: a.tokens, since: pending.since }
})
/** The status names the tool itself from the moment the call starts streaming; the transcript's item is the fallback for a status without one. */
const activeToolName = computed(() =>
  effectiveActivity.value?.kind === 'tool'
    ? (effectiveActivity.value.tool ?? pendingToolUse.value?.name ?? null)
    : null,
)
/** The activity overlay's measured height, so the transcript's floating buttons can clear it. */
const activityHeight = ref(0)

const showNew = ref(false)
/** "+ agent" under a project in the tree: go there first when it is not the current one. */
async function openNew(projectId: string) {
  if (projectId !== props.id) {
    await router.push({ name: 'project', params: { id: projectId } })
    await loadProject() // the form's profiles and cwd must be the new project's
  }
  showNew.value = true
}
const form = ref({
  name: '',
  profile: '',
  cwd: '',
  permissions: 'bypass' as 'bypass' | 'ask',
  model: '',
  effort: '',
})
const error = ref<string | null>(null)
const busy = ref(false)
const profiles = ref<Profile[]>([])

let loadGen = 0
async function loadProject() {
  const gen = ++loadGen // a newer load (fast tree clicks) wins; a stale one changes nothing
  if (!projects.loaded) await projects.load()
  try {
    await agents.load(props.id)
  } catch (e) {
    notifications.push(
      'error',
      `could not load the agents: ${e instanceof ApiError ? e.message : String(e)}`,
    )
  }
  const fetched = (
    await api.projectProfiles(props.id).catch(() => ({ profiles: [] }))
  ).profiles.filter((p) => p.supported)
  if (gen !== loadGen) return
  profiles.value = fetched
  form.value.profile = project.value?.defaultProfile ?? profiles.value[0]?.name ?? ''
  form.value.cwd = project.value?.repos[0]?.name ?? ''
  if (!props.agentId && rows.value[0])
    await router.replace({
      name: 'agent',
      params: { id: props.id, agentId: rows.value[0].agent.id },
    })
}
onMounted(loadProject)
watch(
  () => props.id,
  () => {
    // the same component serves every project: a notification click can swap the id under us
    void loadProject()
  },
)

watch(
  () => [props.agentId, route.query.item] as const,
  async ([id, itemQ]) => {
    if (!id) {
      scrollTarget.value = null
      return
    }
    agents.lastAgent.set(props.id, id)
    // a link from the changes tab carries ?item=<index>: load back to it, then scroll
    const n =
      typeof itemQ === 'string' && Number.isInteger(Number(itemQ)) ? Number(itemQ) : null
    if (n != null) {
      await agents.loadUntil(id, n)
      scrollTarget.value = n
    } else {
      await agents.loadItems(id)
      scrollTarget.value = null
    }
  },
  { immediate: true },
)

async function create() {
  error.value = null
  busy.value = true
  try {
    const agent = await agents.create(props.id, {
      name: form.value.name,
      profile: form.value.profile || undefined,
      cwd: form.value.cwd || undefined,
      permissions: form.value.permissions,
      model: form.value.model.trim() || undefined,
      effort: form.value.effort || undefined,
    })
    showNew.value = false
    form.value.name = ''
    await router.push({ name: 'agent', params: { id: props.id, agentId: agent.id } })
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function decide(requestId: string, option: string) {
  if (!props.agentId) return
  try {
    await agents.decide(props.agentId, requestId, option)
  } catch (e) {
    notifications.push('error', e instanceof ApiError ? e.message : String(e))
  }
}

const turnInput = ref<InstanceType<typeof TurnInput> | null>(null)
async function send(text: string, images: TurnImage[] = []) {
  if (!props.agentId) return
  const agentId = props.agentId
  try {
    const steer = current.value?.status.state === 'working'
    const { mode } = await api.turn(agentId, text, steer, images)
    drafts.set(agentId, '') // accepted: the draft is done; refused: it stays
    turnInput.value?.clearAttachments()
    if (mode === 'queued')
      notifications.push(
        'info',
        'the agent cannot take a message mid-turn; queued for when it finishes',
      )
  } catch (e) {
    notifications.push('error', e instanceof ApiError ? e.message : String(e))
  }
}

async function interrupt() {
  if (props.agentId)
    await api
      .interrupt(props.agentId)
      .catch((e) => notifications.push('error', String(e.message ?? e)))
}

async function stop() {
  if (props.agentId)
    await api.stop(props.agentId).catch((e) => notifications.push('error', String(e.message ?? e)))
}

async function restart() {
  if (props.agentId)
    await api
      .restart(props.agentId)
      .catch((e) => notifications.push('error', String(e.message ?? e)))
}

async function remove() {
  if (
    !props.agentId ||
    !confirm(
      "Delete this agent for good? Its process ends and the daemon logs and cached transcript are removed; the vendor's own conversation store stays.",
    )
  )
    return
  await agents
    .remove(props.agentId)
    .catch((e) => notifications.push('error', String(e.message ?? e)))
  await router.replace({ name: 'project', params: { id: props.id } })
}

async function archive() {
  if (
    !props.agentId ||
    !confirm('Archive this agent? Its session ends; the transcript stays in the daemon log.')
  )
    return
  await agents.archive(props.agentId)
  await router.replace({ name: 'project', params: { id: props.id } })
}
</script>

<template>
  <AppShell>
    <template #title><ProjectHeader :id="id" /></template>
    <div class="flex h-full">
      <aside
        :style="{ width: `${treePane.width.value}px` }"
        class="flex min-w-0 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex items-center px-3 py-2">
          <span
            class="text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
            >Projects</span
          >
          <span class="grow" />
          <RouterLink
            :to="{ name: 'projects' }"
            class="text-sm text-slate-500 hover:underline dark:text-slate-400"
            title="Create or edit projects"
            >manage</RouterLink
          >
        </div>
        <ProjectTree :project-id="id" :agent-id="agentId" @new-agent="openNew" />
      </aside>
      <ResizeHandle @start="treePane.start" />

      <section v-if="current" class="relative flex min-w-0 grow flex-col">
        <div
          class="border-b border-slate-200 bg-white px-4 py-2 text-base dark:border-slate-800 dark:bg-slate-900"
        >
          <!-- one line: who, how it is doing, what you can do; the facts fold away under the name -->
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="flex items-center gap-1.5 text-left"
              :title="
                showDetails
                  ? 'hide the details'
                  : 'profile, directory, usage, effort, the harness note'
              "
              data-test="agent-details-toggle"
              @click="showDetails = !showDetails"
            >
              <span class="font-medium" data-test="agent-name">{{ current.agent.name }}</span>
              <span class="text-sm text-slate-400 dark:text-slate-500">{{
                showDetails ? '▾' : '▸'
              }}</span>
            </button>
            <StateBadge
              :state="current.status.state"
              :background="current.status.background"
              data-test="agent-state"
            />
            <span
              v-if="current.status.model"
              class="font-mono text-sm text-slate-500 dark:text-slate-400"
              title="model reported by the agent"
              data-test="agent-model-chip"
              >{{ current.status.model }}</span
            >
            <span
              v-if="current.agent.createdBy && current.agent.createdBy.startsWith('agent-')"
              class="text-sm text-slate-500 dark:text-slate-400"
              title="a helper: the agent that started it gives it its work and reviews it"
              data-test="started-by"
              >started by {{ current.agent.createdBy.slice(6) }}</span
            >
            <span
              v-if="current.status.error"
              class="truncate text-red-700 dark:text-red-300"
              data-test="agent-error"
              >{{ current.status.error }}</span
            >
            <span
              v-if="current.status.state === 'idle' && current.status.background"
              class="text-sm text-blue-700 dark:text-blue-300"
              :title="`no activity since ${when(current.status.lastActivityAt)}`"
              data-test="waiting-since"
              >waiting on {{ current.status.background }} background job{{
                current.status.background === 1 ? '' : 's'
              }}
              for {{ since(current.status.lastActivityAt) }}</span
            >
            <span class="grow" />
            <span
              v-if="othersHere.length"
              class="text-sm text-violet-700 dark:text-violet-300"
              data-test="presence"
            >
              {{ othersHere.map((u) => `${u.name} is here`).join(' · ') }}
            </span>
            <div
              class="flex items-center overflow-hidden rounded border border-slate-300 text-sm dark:border-slate-700"
              data-test="agent-actions"
            >
              <button
                v-if="current.status.state !== 'exited'"
                class="px-2 py-0.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                title="end the session; the next message resumes it"
                data-test="stop"
                @click="stop"
              >
                stop
              </button>
              <button
                class="border-l border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                title="stop and resume with the current settings (repositories, harness note); the conversation continues"
                data-test="restart"
                @click="restart"
              >
                restart
              </button>
              <button
                class="border-l border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                title="end the session and take the agent off the list; its transcript stays"
                data-test="archive"
                @click="archive"
              >
                archive
              </button>
              <button
                class="border-l border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-red-950"
                title="forget this agent for good: its process, the daemon's logs of its sessions, the cached transcript; the vendor's own store stays"
                data-test="delete"
                @click="remove"
              >
                delete
              </button>
            </div>
          </div>
          <!-- the facts, on request: read once an hour, not once a glance -->
          <div
            v-if="showDetails"
            class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400"
            data-test="agent-details"
          >
            <span
              >profile <span class="font-mono">{{ current.agent.profile }}</span></span
            >
            <span class="font-mono" data-test="agent-cwd-label">{{ current.agent.cwd }}</span>
            <span v-if="current.agent.effort" data-test="agent-effort-chip"
              >effort {{ current.agent.effort }}</span
            >
            <span
              v-if="current.agent.permissions === 'ask'"
              title="Gated tools wait for your answer"
              >asks before gated tools</span
            >
            <span v-if="current.agent.createdBy && !current.agent.createdBy.startsWith('agent-')"
              >started by {{ current.agent.createdBy }}</span
            >
            <UsageChip v-if="current.status.usage" :usage="current.status.usage" />
            <button
              v-if="current.agent.harnessNote"
              type="button"
              class="text-blue-700 hover:underline dark:text-blue-300"
              title="what the agent was told about running here, at its last session start"
              data-test="harness-note-link"
              @click="showNote = true"
            >
              what it was told
            </button>
          </div>
        </div>
        <div class="relative min-h-0 grow">
          <TranscriptView
            :items="items"
            :has-earlier="!!props.agentId && agents.hasEarlier(props.agentId)"
            :loading-earlier="!!props.agentId && agents.loadingEarlier.has(props.agentId)"
            :activity-height="activityHeight"
            :scroll-to="scrollTarget"
            @decide="decide"
            @load-earlier="props.agentId && agents.loadEarlier(props.agentId)"
          />
          <!-- typing floats over the bottom of the transcript, right above the
               input, without moving anything -->
          <div
            v-if="othersTyping.length"
            class="pointer-events-none absolute bottom-2 left-4 rounded bg-white/90 px-2 py-0.5 text-sm text-violet-700 shadow-sm dark:bg-slate-900/90 dark:text-violet-300"
            data-test="presence-typing"
          >
            <span class="animate-pulse">{{
              othersTyping.map((u) => `${u.name} is typing…`).join(' · ')
            }}</span>
          </div>
          <!-- also an overlay, not inserted in flow: see ActivityLine.vue -->
          <ActivityLine
            :activity="effectiveActivity"
            :thinking-text="liveThinkingText"
            :tool-name="activeToolName"
            @resize="activityHeight = $event"
          />
        </div>
        <TurnInput
          ref="turnInput"
          :key="current.agent.id"
          :agent-id="current.agent.id"
          :state="current.status.state"
          :queued="current.status.queued"
          @send="send"
          @interrupt="interrupt"
          @typing="presence.typed()"
          @stopped-typing="presence.stoppedTyping()"
        />
      </section>
      <section
        v-else
        class="flex grow items-center justify-center text-base text-slate-400 dark:text-slate-500"
      >
        Select or create an agent.
      </section>
    </div>

    <ModalForm
      v-if="showNote && current?.agent.harnessNote"
      title="What the agent was told"
      submit-label="close"
      @close="showNote = false"
      @submit="showNote = false"
    >
      <pre
        class="max-h-96 overflow-auto rounded bg-slate-50 p-3 text-sm whitespace-pre-wrap dark:bg-slate-800"
        data-test="harness-note"
        >{{ current.agent.harnessNote }}</pre>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Given at session start; a changed template reaches the agent at its next restart.
      </p>
    </ModalForm>
    <ModalForm
      v-if="showNew"
      title="New agent"
      :error="error"
      :busy="busy"
      @close="showNew = false"
      @submit="create"
    >
      <label class="text-base">
        <span class="text-slate-600 dark:text-slate-300">Name</span>
        <input
          v-model="form.name"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
          data-test="agent-name-input"
          required
        />
      </label>
      <label class="text-base">
        <span class="text-slate-600 dark:text-slate-300">Profile</span>
        <select
          v-model="form.profile"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
          data-test="agent-profile"
          required
        >
          <option v-for="p in profiles" :key="p.name" :value="p.name">
            {{ p.name }}<template v-if="p.description"> — {{ p.description }}</template>
          </option>
        </select>
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="text-base">
          <span class="text-slate-600 dark:text-slate-300">Model</span>
          <input
            v-model="form.model"
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700"
            placeholder="vendor default"
            title="The vendor's model name, passed as is: claude-opus-5, gpt-6, … The vendor rejects a bad one at start."
            data-test="agent-model"
          />
        </label>
        <label class="text-base">
          <span class="text-slate-600 dark:text-slate-300">Effort</span>
          <select
            v-model="form.effort"
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
            data-test="agent-effort"
          >
            <option value="">vendor default</option>
            <option v-for="e in ['low', 'medium', 'high', 'xhigh', 'max']" :key="e" :value="e">
              {{ e }}
            </option>
          </select>
        </label>
      </div>
      <label class="text-base">
        <span class="text-slate-600 dark:text-slate-300">Permissions</span>
        <select
          v-model="form.permissions"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
          data-test="agent-permissions"
        >
          <option value="bypass">bypass — the agent acts without asking</option>
          <option value="ask">ask — gated tools wait for your answer here</option>
        </select>
      </label>
      <label v-if="(project?.repos.length ?? 0) > 1" class="text-base">
        <span class="text-slate-600 dark:text-slate-300"
          >Working repository (the others are passed as extra directories)</span
        >
        <select
          v-model="form.cwd"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono dark:border-slate-700"
          data-test="agent-cwd"
        >
          <option v-for="r in project?.repos" :key="r.name" :value="r.name">
            {{ r.name }} — {{ r.path }}
          </option>
        </select>
      </label>
    </ModalForm>
  </AppShell>
</template>
