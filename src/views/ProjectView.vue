<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import ResizeHandle from '@/components/ResizeHandle.vue'
import { useResizable } from '@/composables/useResizable'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ApiError, api } from '@/api/client'
import type { ChatMessage, Profile, TurnImage } from '@/api/types'
import ActivityLine from '@/components/ActivityLine.vue'
import AppShell from '@/components/AppShell.vue'
import ChatPane from '@/components/ChatPane.vue'
import FlowStrip from '@/components/FlowStrip.vue'
import ModalForm from '@/components/ModalForm.vue'
import ProjectHeader from '@/components/ProjectHeader.vue'
import StateBadge from '@/components/StateBadge.vue'
import UsageChip from '@/components/UsageChip.vue'
import { hasLongWindow, windowSize, withLongWindow } from '@/model'
import { statRows } from '@/stats'
import ProjectTree from '@/components/ProjectTree.vue'
import TranscriptView from '@/components/TranscriptView.vue'
import TurnInput from '@/components/TurnInput.vue'
import { useAgentsStore } from '@/stores/agents'
import { useChatStore } from '@/stores/chat'
import { useDraftsStore } from '@/stores/drafts'
import { usePresenceStore } from '@/stores/presence'
import { since, when } from '@/time'
import { useNotificationsStore } from '@/stores/notifications'
import { useHostsStore } from '@/stores/hosts'
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
const hosts = useHostsStore()
const agents = useAgentsStore()
const chat = useChatStore()
const notifications = useNotificationsStore()

const project = computed(() => projects.byId.get(props.id)?.project)
const rows = computed(() => agents.byProject.get(props.id) ?? [])
const current = computed(() => (props.agentId ? agents.byId.get(props.agentId) : undefined))
const showNote = ref(false)
/** The agent's statistics, fetched when asked for: reading a long transcript takes a moment. */
const stats = ref<{ rows: ReturnType<typeof statRows> | null; error: string | null } | null>(null)
async function showStats() {
  if (!props.agentId) return
  stats.value = { rows: null, error: null }
  try {
    stats.value = { rows: statRows(await api.stats(props.agentId)), error: null }
  } catch (e) {
    stats.value = { rows: null, error: e instanceof ApiError ? e.message : String(e) }
  }
}
const showDetails = ref(false)
const treePane = useResizable('project-tree', 288)
/**
 * The agent's view is two panes, each with its own input: the flow of its
 * work on the left, where a message is the direct conversation (a turn,
 * or a steer into the one it is in), and the chat on the right, whose
 * width is the one dragged and remembered, where a message is left beside
 * the work. Either pane can be put away: the flow alone is the
 * conversation as it was before there was a chat, the chat alone has the
 * flow folded to a line above it. Where the view is too narrow for two
 * panes (a phone, a small window) they are tabs.
 */
const chatPane = useResizable('agent-chat', 520, 320, 1400, 'left')
const chatEl = ref<HTMLElement | null>(null)
/** A drag starts from the width the chat has, which in a small window is less than the one remembered. */
function startChatDrag(e: PointerEvent) {
  const shown = chatEl.value?.getBoundingClientRect().width
  if (shown) chatPane.width.value = Math.round(shown)
  chatPane.start(e)
}
const LAYOUTS = ['flow', 'both', 'chat'] as const
type Layout = (typeof LAYOUTS)[number]
const LAYOUT_KEY = 'agent-panes'
const LAYOUT_TITLE: Record<Layout, string> = {
  flow: 'the flow alone, the conversation as it was: the chat is put away, and what the agent asks or says in it is counted here',
  both: 'the flow and the chat side by side, each with its own input',
  chat: 'the chat alone, the flow folded to one line above it',
}
const layout = ref<Layout>(
  LAYOUTS.find((l) => l === localStorage.getItem(LAYOUT_KEY)) ??
    // what "hide flow" used to remember
    (localStorage.getItem('agent-flow-collapsed') === '1' ? 'chat' : 'both'),
)
function setLayout(l: Layout) {
  layout.value = l
  localStorage.setItem(LAYOUT_KEY, l)
}
/** As tabs, the one in front is the pane the layout keeps: the chat, unless it was put away. */
const firstTab = () => (layout.value === 'flow' ? 'flow' : 'chat')
const tab = ref<'chat' | 'flow'>(firstTab())
const messages = computed(() => (props.agentId ? chat.of(props.agentId) : []))
const openQuestions = computed(() => (props.agentId ? chat.questionsOf(props.agentId) : 0))
/**
 * What the agent said while the chat was put away: counted on the way
 * back to it, so a decision is not missed for not having been looked at.
 * Per tab and from when the chat was last in sight; nothing is kept.
 */
const seenUpTo = ref(new Map<string, number>())
watch(
  [
    () => props.agentId,
    // a chat that is loaded and empty has been seen as far as it goes
    () =>
      props.agentId && chat.messages.has(props.agentId)
        ? (messages.value.at(-1)?.id ?? 0)
        : undefined,
    layout,
  ],
  ([id, last]) => {
    if (!id || last === undefined) return
    if (layout.value !== 'flow' || !seenUpTo.value.has(id))
      seenUpTo.value = new Map(seenUpTo.value).set(id, last)
  },
  { immediate: true },
)
const unseen = computed(() => {
  const upTo = props.agentId ? seenUpTo.value.get(props.agentId) : undefined
  if (upTo === undefined || layout.value !== 'flow') return 0
  // an open question is counted as that, not twice
  return messages.value.filter(
    (m) => m.from === 'agent' && m.id > upTo && !(m.kind === 'question' && !m.closedAt),
  ).length
})
/** What was left beside the agent's work and it has not read: with the chat put away, the only sign of where a message went. */
const waiting = computed(
  () => messages.value.filter((m) => m.from === 'person' && m.via === 'aside' && !m.readAt).length,
)
/** On the switch's "chat" while the chat is put away: what is in it that the flow does not show. */
const chatNews = computed(() =>
  layout.value !== 'flow'
    ? []
    : [
        {
          key: 'questions',
          n: openQuestions.value,
          text: `${openQuestions.value} ?`,
          tone: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
          title: 'the agent has a question open in the chat',
        },
        {
          key: 'new',
          n: unseen.value,
          text: `${unseen.value} new`,
          tone: 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100',
          title: 'said by the agent in the chat since you put it away',
        },
        {
          key: 'waiting',
          n: waiting.value,
          text: `${waiting.value} waiting`,
          tone: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
          title:
            'left beside its work and not read yet: the agent has been told a message waits, and gets it as its next turn if this one ends first',
        },
      ].filter((c) => c.n > 0),
)
function showChat() {
  if (layout.value === 'flow') setLayout('both')
  tab.value = 'chat'
}
/** The agent's open question the chat's input is answering. */
const replyTo = ref<ChatMessage | null>(null)
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
/** The tree as a drawer on a phone; closes when an agent is chosen, the one already open included. */
const drawer = ref(false)
watch(
  () => props.agentId,
  () => {
    drawer.value = false
    replyTo.value = null
    tab.value = firstTab()
  },
)
watch(
  () => props.agentId,
  (id) => {
    if (id)
      chat
        .load(id, props.id)
        .catch((e) =>
          notifications.push(
            'error',
            `could not load the chat: ${e instanceof ApiError ? e.message : String(e)}`,
          ),
        )
  },
  { immediate: true },
)
// answered or dismissed meanwhile, here or by someone else: nothing left to answer
watch(
  () => messages.value.find((m) => m.id === replyTo.value?.id)?.closedAt,
  (closedAt) => {
    if (closedAt) replyTo.value = null
  },
)
function onTreeClick(e: MouseEvent) {
  if ((e.target as HTMLElement | null)?.closest('[data-test=agent-row]')) drawer.value = false
}
/** The current agent's context window, for the header: how full, and of what size. */
const context = computed(() => {
  const c = current.value?.status.usage?.context
  if (!c) return null
  return {
    percent: Math.round((100 * c.used) / Math.max(1, c.size)),
    size: windowSize(c.size),
    title: `context window: ${c.used.toLocaleString()} of ${c.size.toLocaleString()} tokens in use. When it fills, the conversation is compacted: replaced by a summary of itself.`,
  }
})
const LONG_WINDOW_TITLE =
  "Claude's 1M window is asked for by [1m] at the end of the model name; without it the window is the model's default, 200K for some. With no model set, Claude Code's own settings decide. The agent's header shows the window it got."
/** The edit form for the current agent: name at once, the rest at its next restart. */
const editing = ref<{
  name: string
  model: string
  effort: string
  permissions: 'bypass' | 'ask'
} | null>(null)
function startEditAgent() {
  const a = current.value?.agent
  if (!a) return
  editing.value = {
    name: a.name,
    model: a.model ?? '',
    effort: a.effort ?? '',
    permissions: a.permissions,
  }
}
/** Saves; with `andRestart`, restarts afterwards so model, effort and permissions take effect now. */
async function saveAgent(andRestart = false) {
  const a = current.value?.agent
  const e = editing.value
  if (!a || !e) return
  error.value = null
  busy.value = true
  try {
    const r = await api.updateAgent(a.id, {
      name: e.name.trim(),
      model: e.model.trim() || null,
      effort: e.effort || null,
      permissions: e.permissions,
    })
    const row = agents.byId.get(a.id)
    if (row) row.agent = r.agent
    editing.value = null
    if (andRestart) await api.restart(a.id)
    else if (r.appliesAtRestart.length)
      notifications.push('info', `${r.appliesAtRestart.join(', ')} take effect at the next restart`)
  } catch (e2) {
    error.value = e2 instanceof ApiError ? e2.message : String(e2)
  } finally {
    busy.value = false
  }
}
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
  /** '' for this project's own machine; a spoke's name puts the agent's session there, with `cwd` a path on it. */
  host: '',
  cwd: '',
  permissions: 'bypass' as 'bypass' | 'ask',
  model: '',
  effort: '',
})
const error = ref<string | null>(null)
const busy = ref(false)
const profiles = ref<Profile[]>([])
/** The profiles whose CLI the manager can ask to compact; the form's list above changes with its host, this one is the project's. */
const compacts = ref(new Set<string>())

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
  compacts.value = new Set(fetched.filter((p) => p.compacts).map((p) => p.name))
  form.value.host = ''
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
    const n = typeof itemQ === 'string' && Number.isInteger(Number(itemQ)) ? Number(itemQ) : null
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

/** The profiles a form offers are the chosen host's: its daemon runs the CLI. */
async function hostChanged() {
  const host = form.value.host || null
  const fetched = (await api.profiles(host).catch(() => ({ profiles: [] }))).profiles.filter(
    (p) => p.supported,
  )
  if ((form.value.host || null) !== host) return
  profiles.value = fetched
  if (!profiles.value.some((p) => p.name === form.value.profile))
    form.value.profile = profiles.value[0]?.name ?? ''
  if (!host) form.value.cwd = ''
}

async function create() {
  error.value = null
  busy.value = true
  try {
    const agent = await agents.create(props.id, {
      name: form.value.name,
      profile: form.value.profile || undefined,
      host: form.value.host || undefined,
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

/** The last message sent, by transcript index: stops at a withdrawal's marker (that message is gone already). */
const lastPromptIndex = computed((): number | null => {
  for (let i = items.value.length - 1; i >= 0; i--) {
    const s = items.value[i]
    if (!s) continue
    if (s.item.kind === 'system' && s.item.withdrawnFrom !== undefined) return null
    if (s.item.kind === 'user' && s.item.text) return s.index
  }
  return null
})
/**
 * The last message can be taken back to be edited and sent again: "that
 * was nonsense: stop, edit, go". The manager stops the turn if one runs
 * and hands the text back; a Claude agent also forgets the message and
 * its reply (the others keep their conversation out of reach). What the
 * reply did on disk stays, and the line left in the flow says what.
 */
const takingBack = ref(false)
const withdrawal = computed(() => {
  const row = current.value
  const claude = row?.agent.profile === 'claude'
  return {
    reason: !row ? 'no agent' : row.status.state === 'starting' ? 'the agent is starting' : null,
    title:
      'take this message back to edit it: the agent is stopped if it still works on it, and the text returns to the input below. ' +
      (claude
        ? 'The agent forgets the message and its reply; what the reply changed on disk stays.'
        : `The agent still has the message (${row?.agent.profile} keeps its conversation out of reach).`),
    busy: takingBack.value,
  }
})
/** A message sent this recently is taken back at once: that is the slip being corrected. An older one has a reply that may be worth keeping, and asks first. */
const SLIP_MS = 2 * 60_000
async function withdraw() {
  const row = current.value
  const index = lastPromptIndex.value
  if (!props.agentId || !row || index === null || takingBack.value) return
  const agentId = props.agentId
  const sent = items.value.find((s) => s?.index === index)
  if (!sent || sent.item.kind !== 'user') return
  const claude = row.agent.profile === 'claude'
  const working = row.status.state !== 'idle' && row.status.state !== 'exited'
  const minutes = Math.round((Date.now() - sent.at) / 60_000)
  if (Date.now() - sent.at > SLIP_MS && (claude || working)) {
    const ask =
      `This message was sent ${minutes} min ago. Take it back to edit it? ` +
      (working ? 'The agent is stopped. ' : '') +
      (claude
        ? 'It will have no memory of the message or of anything it did since; what it changed on disk stays.'
        : '')
    if (!confirm(ask.trim())) return
  }
  takingBack.value = true
  try {
    const { text } = await api.undo(agentId, index)
    const draft = drafts.get(agentId)
    drafts.set(agentId, draft.trim() ? `${text}\n\n${draft}` : text)
    if (props.agentId === agentId) flowInput.value?.restore(sent.item.images)
  } catch (e) {
    notifications.push('error', e instanceof ApiError ? e.message : String(e))
  } finally {
    takingBack.value = false
  }
}
/** The permission waiting for an answer, for the phone's bar above the composer: the one place a thumb needs to reach first. */
const pendingPermission = computed(() => {
  for (let i = items.value.length - 1; i >= 0; i--) {
    const it = items.value[i]?.item // the array can have holes while history is paged in
    if (it?.kind === 'permission') return it.decision ? null : it
  }
  return null
})
const flowInput = ref<InstanceType<typeof TurnInput> | null>(null)
const chatInput = ref<InstanceType<typeof TurnInput> | null>(null)
/**
 * The flow's input is the direct conversation: a turn, or into the turn
 * the agent is in. It is not copied into the chat; its place is the flow,
 * where the answer follows it.
 */
async function send(text: string, images: TurnImage[] = []) {
  if (!props.agentId) return
  const agentId = props.agentId
  try {
    const steer = current.value?.status.state === 'working'
    const { mode } = await api.turn(agentId, text, steer, images)
    drafts.set(agentId, '') // accepted: the draft is done; refused: it stays
    flowInput.value?.clearAttachments()
    if (mode === 'queued')
      notifications.push(
        'info',
        'the agent cannot take a message mid-turn; queued for when it finishes',
      )
  } catch (e) {
    notifications.push('error', e instanceof ApiError ? e.message : String(e))
  }
}
/**
 * The chat's input: beside the work while the agent is in a turn (it is
 * told a message waits, and reads it when it chooses), and what wakes it
 * when it is not; the chat shows which.
 */
async function say(text: string, images: TurnImage[] = []) {
  if (!props.agentId) return
  const agentId = props.agentId
  try {
    await chat.say(agentId, { text, images, replyTo: replyTo.value?.id })
    drafts.set(`${agentId}:chat`, '')
    chatInput.value?.clearAttachments()
    replyTo.value = null
  } catch (e) {
    notifications.push('error', e instanceof ApiError ? e.message : String(e))
  }
}
function answer(m: ChatMessage) {
  replyTo.value = m
  void nextTick(() =>
    document.querySelector<HTMLTextAreaElement>('[data-test=chat-input]')?.focus(),
  )
}
async function dismiss(m: ChatMessage) {
  try {
    await chat.close(m.agentId, m.id)
  } catch (e) {
    notifications.push('error', e instanceof ApiError ? e.message : String(e))
  }
}
/**
 * Scrolls the flow to where a chat message is in it: the agent's own
 * call that said it, a person's turn or steer where it arrived, an aside
 * where the agent read it. The two records share a clock and nothing
 * else, so the place is found by time; what was handed over as it was
 * written (a turn, a steer, an aside the turn ended before) is the
 * person's own item with the text in it, which settles it between two
 * sent close together.
 */
async function locate(m: ChatMessage) {
  const agentId = props.agentId
  if (!agentId) return
  const aside = m.from === 'person' && m.via === 'aside'
  const t = aside ? m.readAt : m.at
  if (t == null) return
  const first = () => agents.items.get(agentId)?.find((s) => s)?.at ?? 0
  for (let guard = 0; guard < 200 && agents.hasEarlier(agentId) && first() > t; guard++)
    await agents.loadEarlier(agentId)
  const list = agents.items.get(agentId) ?? []
  let index: number | null = null
  if (m.from === 'person') {
    // an aside is marked read once the turn that carries it is under way, which can take a moment
    const near = list.filter(
      (s) =>
        s &&
        s.item.kind === 'user' &&
        s.at >= t - (aside ? 10_000 : 2000) &&
        (!aside || s.at <= t + 2000),
    )
    const own = near.find((s) => s.item.kind === 'user' && s.item.text.includes(m.text))
    index = (own ?? (aside ? undefined : near.find((s) => s.at >= t)))?.index ?? null
  }
  if (index === null)
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      // a result is folded under its call: the call is the row to land on
      if (s && s.at <= t && s.item.kind !== 'tool_result') {
        index = s.index
        break
      }
    }
  if (index === null) {
    notifications.push('info', 'that moment is not in the flow')
    return
  }
  if (layout.value === 'chat') setLayout('both')
  tab.value = 'flow'
  scrollTarget.value = null // the same place again is still a request to go there
  await nextTick()
  scrollTarget.value = index
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

/**
 * Compacts the agent's context on the person's word. Worth a button
 * since the dialog is handed back afterwards: a window that was filled
 * before there was a hand-back, or that has drifted, is traded for a
 * fresh summary plus what was said, word for word.
 */
async function compact() {
  if (
    !props.agentId ||
    !confirm(
      "Compact this agent's context now? What it holds is replaced by a summary of it, and its dialog with you is handed back to it word for word. The dialog is weighed first if it has grown since the last time, which takes minutes; the flow says how it goes.",
    )
  )
    return
  await api
    .compact(props.agentId)
    .then(() => notifications.push('info', 'compaction asked for'))
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
      <!-- On a phone the tree is a drawer: the transcript needs the whole
           width, and the tree is what you open to go somewhere else. With no
           agent chosen it is the page itself. On wider screens it is the pane
           it always was, at its remembered width. -->
      <div
        v-if="drawer"
        class="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
        data-test="tree-backdrop"
        @click="drawer = false"
      />
      <aside
        :style="{ '--tree-w': `${treePane.width.value}px` }"
        class="min-w-0 shrink-0 flex-col border-r border-slate-200 bg-white md:static md:z-auto md:flex md:w-[var(--tree-w)] md:shadow-none dark:border-slate-800 dark:bg-slate-900"
        :class="
          !agentId
            ? 'flex w-full'
            : drawer
              ? 'fixed inset-y-0 left-0 z-40 flex w-72 shadow-xl'
              : 'hidden'
        "
        data-test="project-tree-pane"
        @click="onTreeClick"
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
      <div class="hidden md:contents"><ResizeHandle @start="treePane.start" /></div>

      <section v-if="current" class="@container relative flex min-w-0 grow flex-col">
        <div
          class="border-b border-slate-200 bg-white px-4 py-2 text-base dark:border-slate-800 dark:bg-slate-900"
        >
          <!-- one line: who, how it is doing, what you can do; the facts fold away under the name -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              class="rounded px-1 text-slate-500 md:hidden dark:text-slate-400"
              title="projects and agents"
              data-test="tree-open"
              @click="drawer = true"
            >
              ☰
            </button>
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
            <button
              v-if="openQuestions"
              type="button"
              class="rounded bg-amber-100 px-1.5 py-0.5 text-sm text-amber-900 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
              title="asked in the chat and not answered yet; the agent carries on meanwhile. Click to see it"
              data-test="agent-questions"
              @click="showChat"
            >
              {{ openQuestions }} open question{{ openQuestions === 1 ? '' : 's' }}
            </button>
            <span
              v-if="current.status.model"
              class="font-mono text-sm text-slate-500 dark:text-slate-400"
              title="model reported by the agent"
              data-test="agent-model-chip"
              >{{ current.status.model }}</span
            >
            <!-- beside the model, not among the facts: which window the agent got is not seen in the name -->
            <span
              v-if="context"
              class="font-mono text-sm whitespace-nowrap"
              :class="
                context.percent >= 80
                  ? 'text-amber-600/80 dark:text-amber-400/80'
                  : 'text-slate-400 dark:text-slate-500'
              "
              :title="context.title"
              data-test="agent-context"
              >ctx {{ context.percent }}% of {{ context.size }}</span
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
              for {{ since(current.status.lastActivityAt)
              }}<template v-if="current.status.holdUntil && current.status.holdUntil > Date.now()">
                · expected until {{ when(current.status.holdUntil) }}</template
              ></span
            >
            <span class="grow" />
            <span
              v-if="othersHere.length"
              class="text-sm text-violet-700 dark:text-violet-300"
              data-test="presence"
            >
              {{ othersHere.map((u) => `${u.name} is here`).join(' · ') }}
            </span>
            <!-- which panes: the flow, the chat, or both; as tabs (too narrow for two) there is nothing to choose -->
            <div
              class="hidden items-center overflow-hidden rounded border border-slate-300 text-sm @3xl:flex dark:border-slate-700"
              role="group"
              aria-label="panes shown"
              data-test="panes"
            >
              <button
                v-for="l in LAYOUTS"
                :key="l"
                type="button"
                class="border-slate-300 px-2 py-0.5 not-first:border-l dark:border-slate-700"
                :class="
                  layout === l
                    ? 'bg-slate-200 font-medium text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                "
                :title="LAYOUT_TITLE[l]"
                :aria-pressed="layout === l"
                :data-test="`panes-${l}`"
                @click="setLayout(l)"
              >
                {{ l }}
                <template v-if="l === 'chat'">
                  <span
                    v-for="c in chatNews"
                    :key="c.key"
                    class="ml-0.5 rounded px-1"
                    :class="c.tone"
                    :title="c.title"
                    :data-test="`panes-chat-${c.key}`"
                    >{{ c.text }}</span
                  >
                </template>
              </button>
            </div>
            <div
              class="flex items-center overflow-hidden rounded border border-slate-300 text-sm dark:border-slate-700 max-md:pointer-coarse:text-base"
              data-test="agent-actions"
            >
              <button
                class="px-2 py-0.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 max-md:pointer-coarse:px-3 max-md:pointer-coarse:py-2"
                title="edit the agent: name, model, effort, permissions"
                data-test="edit-agent"
                @click="startEditAgent"
              >
                edit
              </button>
              <button
                v-if="current.status.state !== 'exited'"
                class="border-l border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 max-md:pointer-coarse:px-3 max-md:pointer-coarse:py-2"
                title="end the session: its process exits; the next message resumes it with the conversation intact"
                data-test="end-session"
                @click="stop"
              >
                end session
              </button>
              <button
                class="border-l border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 max-md:pointer-coarse:px-3 max-md:pointer-coarse:py-2"
                title="stop and resume with the current settings (repositories, harness note); the conversation continues"
                data-test="restart"
                @click="restart"
              >
                restart
              </button>
              <button
                v-if="compacts.has(current.agent.profile)"
                class="border-l border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 max-md:pointer-coarse:px-3 max-md:pointer-coarse:py-2"
                :disabled="!['idle', 'exited'].includes(current.status.state)"
                :title="
                  ['idle', 'exited'].includes(current.status.state)
                    ? 'replace what the agent holds in its context by a summary of it, and hand its dialog with you back to it word for word'
                    : 'the agent is in a turn; compact it when the turn has ended'
                "
                data-test="compact"
                @click="compact"
              >
                compact
              </button>
              <button
                class="border-l border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 max-md:pointer-coarse:px-3 max-md:pointer-coarse:py-2"
                title="end the session and take the agent off the list; its transcript stays"
                data-test="archive"
                @click="archive"
              >
                archive
              </button>
              <button
                class="border-l border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-red-950 max-md:pointer-coarse:px-3 max-md:pointer-coarse:py-2"
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
            <span
              v-if="current.agent.host"
              class="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800"
              title="the machine this agent's session runs on"
              data-test="agent-host-chip"
              >{{ current.agent.host }}</span
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
              type="button"
              class="text-blue-700 hover:underline dark:text-blue-300"
              title="how long it has worked and on how many tokens, the work since a person last wrote, and how much went on unattended"
              data-test="stats-link"
              @click="showStats"
            >
              statistics
            </button>
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
        <!-- too narrow for two panes: tabs, the chat first unless it was put away -->
        <div
          class="flex border-b border-slate-200 bg-white text-base @3xl:hidden dark:border-slate-800 dark:bg-slate-900"
          data-test="pane-tabs"
        >
          <button
            v-for="t in ['chat', 'flow'] as const"
            :key="t"
            type="button"
            class="grow border-b-2 px-3 py-2"
            :class="
              tab === t
                ? 'border-blue-600 font-medium'
                : 'border-transparent text-slate-500 dark:text-slate-400'
            "
            :data-test="`pane-tab-${t}`"
            :aria-selected="tab === t"
            @click="tab = t"
          >
            {{ t }}
            <span
              v-if="t === 'chat' && openQuestions"
              class="ml-1 rounded bg-amber-100 px-1.5 text-sm text-amber-900 dark:bg-amber-900 dark:text-amber-100"
              >{{ openQuestions }} ?</span
            >
          </button>
        </div>
        <div
          class="grid min-h-0 grow grid-cols-1 grid-rows-[minmax(0,1fr)_auto_auto]"
          :class="
            layout === 'both' ? '@3xl:grid-cols-[minmax(18rem,1fr)_minmax(0,var(--chat-w))]' : ''
          "
          :style="{ '--chat-w': `${chatPane.width.value}px` }"
          data-test="agent-panes"
        >
          <div
            class="relative min-h-0 min-w-0"
            :class="[
              tab === 'flow' ? 'block' : 'hidden',
              layout === 'chat' ? '@3xl:hidden' : '@3xl:col-start-1 @3xl:row-start-1 @3xl:block',
            ]"
            data-test="flow-pane"
          >
            <TranscriptView
              :items="items"
              :has-earlier="!!props.agentId && agents.hasEarlier(props.agentId)"
              :loading-earlier="!!props.agentId && agents.loadingEarlier.has(props.agentId)"
              :activity-height="activityHeight"
              :scroll-to="scrollTarget"
              :withdraw-index="lastPromptIndex"
              :withdraw="withdrawal"
              @decide="decide"
              @withdraw="withdraw"
              @load-earlier="props.agentId && agents.loadEarlier(props.agentId)"
            />
            <!-- an overlay, not inserted in flow: see ActivityLine.vue -->
            <ActivityLine
              :activity="effectiveActivity"
              :thinking-text="liveThinkingText"
              :tool-name="activeToolName"
              @resize="activityHeight = $event"
            />
          </div>
          <div
            ref="chatEl"
            class="min-h-0 min-w-0 flex-col border-slate-200 dark:border-slate-800"
            :class="[
              tab === 'chat' ? 'flex' : 'hidden',
              layout === 'flow'
                ? '@3xl:hidden'
                : layout === 'both'
                  ? '@3xl:col-start-2 @3xl:row-start-1 @3xl:flex @3xl:border-l'
                  : '@3xl:flex',
            ]"
            data-test="chat-pane"
          >
            <div v-if="layout === 'chat'" class="hidden shrink-0 @3xl:block">
              <FlowStrip
                :state="current.status.state"
                :activity="effectiveActivity"
                :tool-name="activeToolName"
                @open="setLayout('both')"
              />
            </div>
            <ChatPane
              :messages="messages"
              :has-earlier="chat.earlier.has(current.agent.id)"
              :loading-earlier="chat.loadingEarlier.has(current.agent.id)"
              @answer="answer"
              @dismiss="dismiss"
              @locate="locate"
              @load-earlier="chat.loadEarlier(current.agent.id)"
            />
          </div>
          <!-- the divider between the panes, on the chat's left edge -->
          <div
            v-if="layout === 'both'"
            class="z-10 hidden justify-self-start @3xl:col-start-2 @3xl:row-start-1 @3xl:flex"
          >
            <ResizeHandle @start="startChatDrag" />
          </div>
          <!-- where the flow may be out of sight (tabs, or folded to its line): the permission's
               answers as big buttons above the input, until answered -->
          <div
            v-if="pendingPermission"
            class="flex items-center gap-2 border-t border-amber-400 bg-amber-50 px-3 py-2 dark:border-amber-600 dark:bg-amber-950"
            :class="layout === 'chat' ? '' : '@3xl:hidden'"
            data-test="permission-bar"
          >
            <span class="min-w-0 grow truncate text-sm text-amber-900 dark:text-amber-100"
              ><span class="font-mono font-semibold">{{ pendingPermission.tool }}</span>
              {{ pendingPermission.title }}</span
            >
            <button
              v-for="o in pendingPermission.options"
              :key="o.id"
              class="shrink-0 rounded border px-4 py-3 text-base"
              :class="
                o.kind === 'deny'
                  ? 'border-red-400 text-red-800 dark:border-red-700 dark:text-red-200'
                  : 'border-emerald-500 bg-white text-emerald-800 dark:bg-slate-900 dark:text-emerald-200'
              "
              :data-test="`permission-bar-${o.kind}`"
              @click="decide(pendingPermission.requestId, o.id)"
            >
              {{ o.label }}
            </button>
          </div>
          <!-- an input under each pane, and what is written goes to the pane above it: under the
               flow a turn or a steer, under the chat a message beside the work -->
          <div
            class="relative grid min-w-0 grid-cols-1"
            :class="layout === 'both' ? '@3xl:col-span-2 @3xl:grid-cols-subgrid' : ''"
            data-test="composer"
          >
            <!-- typing floats right above the inputs, without moving anything -->
            <div
              v-if="othersTyping.length"
              class="pointer-events-none absolute bottom-full left-4 mb-2 rounded bg-white/90 px-2 py-0.5 text-sm text-violet-700 shadow-sm dark:bg-slate-900/90 dark:text-violet-300"
              data-test="presence-typing"
            >
              <span class="animate-pulse">{{
                othersTyping.map((u) => `${u.name} is typing…`).join(' · ')
              }}</span>
            </div>
            <div
              class="min-w-0"
              :class="[
                tab === 'flow' ? 'block' : 'hidden',
                layout === 'chat' ? '@3xl:hidden' : '@3xl:block',
              ]"
            >
              <TurnInput
                ref="flowInput"
                :key="current.agent.id"
                :agent-id="current.agent.id"
                :state="current.status.state"
                :queued="current.status.queued"
                @send="send"
                @interrupt="interrupt"
                @typing="presence.typed()"
                @stopped-typing="presence.stoppedTyping()"
              />
            </div>
            <div
              class="min-w-0 border-slate-200 dark:border-slate-800"
              :class="[
                tab === 'chat' ? 'block' : 'hidden',
                layout === 'flow'
                  ? '@3xl:hidden'
                  : layout === 'both'
                    ? '@3xl:block @3xl:border-l'
                    : '@3xl:block',
              ]"
            >
              <!-- beside the flow's input, that one's interrupt is the one -->
              <TurnInput
                ref="chatInput"
                :key="current.agent.id"
                chat
                :agent-id="current.agent.id"
                :state="current.status.state"
                :reply="replyTo ? { id: replyTo.id, excerpt: replyTo.text } : null"
                :interrupt-class="layout === 'both' ? '@3xl:hidden' : ''"
                @send="say"
                @interrupt="interrupt"
                @typing="presence.typed()"
                @stopped-typing="presence.stoppedTyping()"
                @cancel-reply="replyTo = null"
              />
            </div>
          </div>
        </div>
      </section>
      <section
        v-else
        class="flex grow items-center justify-center text-base text-slate-400 dark:text-slate-500"
      >
        Select or create an agent.
      </section>
    </div>

    <ModalForm
      v-if="stats && current"
      :title="`How ${current.agent.name} has been run`"
      :error="stats.error"
      submit-label="close"
      @close="stats = null"
      @submit="stats = null"
    >
      <p v-if="!stats.rows && !stats.error" class="text-base text-slate-500 dark:text-slate-400">
        reading the transcript…
      </p>
      <dl v-if="stats.rows" class="flex flex-col gap-3 text-base" data-test="stats">
        <div v-for="r in stats.rows" :key="r.label" :data-stat="r.label">
          <dt class="text-sm text-slate-500 dark:text-slate-400">{{ r.label }}</dt>
          <dd>{{ r.text }}</dd>
          <dd v-if="r.note" class="text-sm text-slate-500 dark:text-slate-400">{{ r.note }}</dd>
        </div>
      </dl>
    </ModalForm>
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
      v-if="editing && current"
      title="Edit agent"
      :error="error"
      :busy="busy"
      submit-label="save"
      :secondary-label="current.status.state === 'idle' ? 'save and restart' : undefined"
      @close="editing = null"
      @submit="saveAgent(false)"
      @secondary="saveAgent(true)"
    >
      <label class="text-base">
        <span class="text-slate-600 dark:text-slate-300">Name</span>
        <input
          v-model="editing.name"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
          data-test="edit-agent-name"
          required
        />
      </label>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-base">
            <span class="text-slate-600 dark:text-slate-300">Model</span>
            <input
              v-model="editing.model"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm dark:border-slate-700"
              placeholder="vendor default"
              title="The vendor's model name, passed as is at the next session start."
              data-test="edit-agent-model"
            />
          </label>
          <label
            v-if="current.agent.profile === 'claude'"
            class="mt-1.5 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
            :title="LONG_WINDOW_TITLE"
          >
            <input
              type="checkbox"
              :checked="hasLongWindow(editing.model)"
              :disabled="!editing.model.trim()"
              data-test="edit-agent-1m"
              @change="
                editing.model = withLongWindow(
                  editing.model,
                  ($event.target as HTMLInputElement).checked,
                )
              "
            />
            1M context window
          </label>
        </div>
        <label class="text-base">
          <span class="text-slate-600 dark:text-slate-300">Effort</span>
          <select
            v-model="editing.effort"
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
            data-test="edit-agent-effort"
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
          v-model="editing.permissions"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
          data-test="edit-agent-permissions"
        >
          <option value="bypass">bypass — the agent acts without asking</option>
          <option value="ask">ask — gated tools wait for your answer here</option>
        </select>
      </label>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        The name applies at once. Model, effort and permissions are session settings: they take
        effect at the next restart, which "save and restart" does now while the agent is idle.
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
      <label v-if="hosts.several" class="text-base">
        <span class="text-slate-600 dark:text-slate-300">Machine</span>
        <select
          v-model="form.host"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
          title="Where the agent's session runs. The project and its repositories stay here; on another machine the agent works in a directory there."
          data-test="agent-host"
          @change="hostChanged"
        >
          <option value="">{{ hosts.local?.name ?? 'this machine' }} — where the project is</option>
          <option
            v-for="h in hosts.list.filter((x) => !x.local)"
            :key="h.name"
            :value="h.name"
            :disabled="!h.daemon"
          >
            {{ h.name }}<template v-if="!h.daemon"> — daemon not reachable</template>
          </option>
        </select>
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
        <div>
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
          <label
            v-if="form.profile === 'claude'"
            class="mt-1.5 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
            :title="LONG_WINDOW_TITLE"
          >
            <input
              type="checkbox"
              :checked="hasLongWindow(form.model)"
              :disabled="!form.model.trim()"
              data-test="agent-1m"
              @change="
                form.model = withLongWindow(form.model, ($event.target as HTMLInputElement).checked)
              "
            />
            1M context window
          </label>
        </div>
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
      <label v-if="form.host" class="text-base">
        <span class="text-slate-600 dark:text-slate-300"
          >Working directory on {{ form.host }} (an absolute path there, usually a checkout of the
          project)</span
        >
        <input
          v-model="form.cwd"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono dark:border-slate-700"
          placeholder="C:\Users\me\checkout or /home/me/checkout"
          data-test="agent-remote-cwd"
          required
        />
      </label>
      <label v-else-if="(project?.repos.length ?? 0) > 1" class="text-base">
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
