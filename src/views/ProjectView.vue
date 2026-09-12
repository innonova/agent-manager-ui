<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ApiError, api } from '@/api/client'
import type { Profile } from '@/api/types'
import AppShell from '@/components/AppShell.vue'
import ModalForm from '@/components/ModalForm.vue'
import ProjectTabs from '@/components/ProjectTabs.vue'
import StateBadge from '@/components/StateBadge.vue'
import TranscriptView from '@/components/TranscriptView.vue'
import TurnInput from '@/components/TurnInput.vue'
import { useAgentsStore } from '@/stores/agents'
import { useChangesStore } from '@/stores/changes'
import { useNotificationsStore } from '@/stores/notifications'
import { useProjectsStore } from '@/stores/projects'

const props = defineProps<{ id: string; agentId?: string }>()
const changes = useChangesStore()
const router = useRouter()
const projects = useProjectsStore()
const agents = useAgentsStore()
const notifications = useNotificationsStore()

const project = computed(() => projects.byId.get(props.id)?.project)
const rows = computed(() => agents.byProject.get(props.id) ?? [])
const current = computed(() => (props.agentId ? agents.byId.get(props.agentId) : undefined))
const items = computed(() => (props.agentId ? (agents.items.get(props.agentId) ?? []) : []))

const showNew = ref(false)
const form = ref({ name: '', profile: '', cwd: '' })
const error = ref<string | null>(null)
const busy = ref(false)
const profiles = ref<Profile[]>([])

onMounted(() => void changes.countUnread(props.id))
onMounted(async () => {
  if (!projects.loaded) await projects.load()
  await agents.load(props.id)
  profiles.value = (await api.profiles().catch(() => ({ profiles: [] }))).profiles.filter(
    (p) => p.supported,
  )
  form.value.profile = project.value?.defaultProfile ?? profiles.value[0]?.name ?? ''
  form.value.cwd = project.value?.repos[0]?.name ?? ''
  if (!props.agentId && rows.value[0])
    await router.replace({
      name: 'agent',
      params: { id: props.id, agentId: rows.value[0].agent.id },
    })
})

watch(
  () => props.agentId,
  async (id) => {
    if (id) await agents.loadItems(id)
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

async function send(text: string) {
  if (!props.agentId) return
  try {
    await api.turn(props.agentId, text)
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
    <template #title>
      <span class="text-slate-400 dark:text-slate-500">/</span>
      <span data-test="project-title">{{ project?.name ?? '…' }}</span>
      <ProjectTabs :id="id" />
    </template>
    <div class="flex h-full">
      <aside
        class="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex items-center px-3 py-2">
          <span
            class="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
            >Agents</span
          >
          <span class="grow" />
          <button
            class="text-xs text-blue-700 hover:underline dark:text-blue-300"
            data-test="new-agent"
            @click="showNew = true"
          >
            + new
          </button>
        </div>
        <ul class="min-h-0 grow overflow-y-auto">
          <li v-for="r in rows" :key="r.agent.id" data-test="agent-row">
            <RouterLink
              :to="{ name: 'agent', params: { id, agentId: r.agent.id } }"
              class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              :class="r.agent.id === agentId ? 'bg-slate-100 font-medium dark:bg-slate-800' : ''"
            >
              <span class="truncate">{{ r.agent.name }}</span>
              <span class="grow" />
              <StateBadge
                :state="r.status.state"
                :background="r.status.background"
                :title="r.status.error ?? undefined"
              />
            </RouterLink>
          </li>
        </ul>
        <p v-if="rows.length === 0" class="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
          No agents. Create one to start a conversation.
        </p>
      </aside>

      <section v-if="current" class="relative flex min-w-0 grow flex-col">
        <div
          class="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <span class="font-medium" data-test="agent-name">{{ current.agent.name }}</span>
          <StateBadge
            :state="current.status.state"
            :background="current.status.background"
            data-test="agent-state"
          />
          <span
            v-if="current.status.error"
            class="truncate text-red-700 dark:text-red-300"
            data-test="agent-error"
            >{{ current.status.error }}</span
          >
          <span class="grow" />
          <span
            class="font-mono text-xs text-slate-400 dark:text-slate-500"
            data-test="agent-cwd-label"
            >{{ current.agent.profile }} · {{ current.agent.cwd }}</span
          >
          <RouterLink
            v-if="changes.unread.get(id)"
            :to="{ name: 'files', params: { id }, query: { mode: 'changes' } }"
            class="text-xs text-blue-700 hover:underline dark:text-blue-300"
            data-test="unread-link"
            >{{ changes.unread.get(id) }} changed since you last looked</RouterLink
          >
          <button
            v-if="current.status.state !== 'exited'"
            class="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            data-test="stop"
            @click="stop"
          >
            stop
          </button>
          <button
            class="text-xs text-slate-500 hover:text-red-700 dark:text-slate-400"
            data-test="archive"
            @click="archive"
          >
            archive
          </button>
        </div>
        <div class="relative min-h-0 grow">
          <TranscriptView :items="items" />
        </div>
        <TurnInput
          :agent-id="current.agent.id"
          :state="current.status.state"
          @send="send"
          @interrupt="interrupt"
        />
      </section>
      <section
        v-else
        class="flex grow items-center justify-center text-sm text-slate-400 dark:text-slate-500"
      >
        Select or create an agent.
      </section>
    </div>

    <ModalForm
      v-if="showNew"
      title="New agent"
      :error="error"
      :busy="busy"
      @close="showNew = false"
      @submit="create"
    >
      <label class="text-sm">
        <span class="text-slate-600 dark:text-slate-300">Name</span>
        <input
          v-model="form.name"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
          data-test="agent-name-input"
          required
        />
      </label>
      <label class="text-sm">
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
      <label v-if="(project?.repos.length ?? 0) > 1" class="text-sm">
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
