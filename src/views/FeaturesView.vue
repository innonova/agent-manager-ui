<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ApiError } from '@/api/client'
import type { Feature, FeatureStatus } from '@/api/types'
import AppShell from '@/components/AppShell.vue'
import FeatureStatusBadge from '@/components/FeatureStatusBadge.vue'
import ModalForm from '@/components/ModalForm.vue'
import ProjectTabs from '@/components/ProjectTabs.vue'
import { useAgentsStore } from '@/stores/agents'
import { useFeaturesStore } from '@/stores/features'
import { useNotificationsStore } from '@/stores/notifications'
import { useProjectsStore } from '@/stores/projects'

const props = defineProps<{ id: string }>()
const projects = useProjectsStore()
const agents = useAgentsStore()
const features = useFeaturesStore()
const notifications = useNotificationsStore()

const project = computed(() => projects.byId.get(props.id)?.project)
const list = computed(() => features.byProject.get(props.id) ?? [])
const agentRows = computed(() => agents.byProject.get(props.id) ?? [])
const agentName = (id: string | null) =>
  id ? (agents.byId.get(id)?.agent.name ?? id.slice(0, 8)) : ''
const open = ref<string | null>(null)
const chosenAgent = ref<string>('')
const showNew = ref(false)
const form = ref({ title: '', slug: '', body: '', priority: 100 })
/** Slug and priority are rarely needed; they hide behind a toggle. */
const showMore = ref(false)
const multiRepo = computed(() => (project.value?.repos.length ?? 0) > 1)
const error = ref<string | null>(null)
const busy = ref(false)

const groups = computed(() => {
  const order: FeatureStatus[] = ['in-progress', 'queued', 'review', 'blocked', 'planned', 'done']
  return order
    .map((status) => ({ status, items: list.value.filter((f) => f.status === status) }))
    .filter((g) => g.items.length)
})

onMounted(async () => {
  if (!projects.loaded) await projects.load()
  await Promise.all([features.load(props.id), agents.load(props.id)])
  chosenAgent.value =
    agentRows.value.find((a) => a.status.state !== 'working')?.agent.id ??
    agentRows.value[0]?.agent.id ??
    ''
})

const html = (f: Feature) => DOMPurify.sanitize(marked.parse(f.body, { async: false }) as string)
const slugify = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

async function act(fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (e) {
    notifications.push('error', e instanceof ApiError ? e.message : String(e))
  }
}

async function create() {
  error.value = null
  busy.value = true
  try {
    await features.create(props.id, {
      slug: form.value.slug || slugify(form.value.title),
      title: form.value.title,
      body: form.value.body,
      priority: Number(form.value.priority),
    })
    showNew.value = false
    showMore.value = false
    form.value = { title: '', slug: '', body: '', priority: 100 }
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppShell>
    <template #title>
      <span class="text-slate-400 dark:text-slate-500">/</span>
      <span data-test="project-title">{{ project?.name ?? '…' }}</span>
      <ProjectTabs :id="id" />
    </template>
    <div class="mx-auto flex h-full max-w-5xl flex-col p-6">
      <div class="mb-4 flex items-center gap-3">
        <h1 class="text-xl font-semibold">Features</h1>
        <span class="text-xs text-slate-400">features/*.md in each repository</span>
        <span class="grow" />
        <label class="flex items-center gap-2 text-sm">
          <span class="text-slate-500 dark:text-slate-400">run on</span>
          <select
            v-model="chosenAgent"
            class="rounded border border-slate-300 px-2 py-1 dark:border-slate-700"
            data-test="feature-agent"
          >
            <option v-for="a in agentRows" :key="a.agent.id" :value="a.agent.id">
              {{ a.agent.name }} ({{ a.status.state }})
            </option>
          </select>
        </label>
        <button
          class="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          data-test="new-feature"
          @click="showNew = true"
        >
          new feature
        </button>
      </div>
      <p v-if="list.length === 0" class="text-sm text-slate-500 dark:text-slate-400">
        No features yet. Each feature is a markdown file under <code>features/</code> in one of the
        project's repositories, with a title, a status and a description; the description is what
        the agent is asked to implement.
      </p>
      <div class="min-h-0 grow overflow-y-auto">
        <section v-for="g in groups" :key="g.status" class="mb-6">
          <h2
            class="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
          >
            {{ g.status }}
          </h2>
          <ul
            class="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900"
          >
            <li v-for="f in g.items" :key="f.slug" data-test="feature-row" :data-slug="f.slug">
              <div class="flex items-center gap-3 px-4 py-2">
                <button
                  class="min-w-0 grow text-left"
                  @click="open = open === f.slug ? null : f.slug"
                >
                  <span class="font-medium" data-test="feature-title">{{ f.title }}</span>
                  <span class="ml-2 font-mono text-xs text-slate-400"
                    >{{ f.slug }} · p{{ f.priority }}</span
                  >
                  <span
                    v-if="multiRepo"
                    class="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    data-test="feature-repo"
                    >{{ f.repo }}</span
                  >
                  <span v-if="f.dependsOn.length" class="ml-2 text-xs text-slate-400"
                    >after {{ f.dependsOn.join(', ') }}</span
                  >
                </button>
                <span v-if="f.agentId" class="text-xs text-slate-500 dark:text-slate-400">{{
                  agentName(f.agentId)
                }}</span>
                <FeatureStatusBadge :status="f.status" data-test="feature-status" />
                <div class="flex gap-2 text-xs">
                  <button
                    v-if="['planned', 'review', 'blocked'].includes(f.status)"
                    class="rounded border border-blue-500 px-2 py-0.5 text-blue-700 hover:bg-blue-50 disabled:opacity-40 dark:text-blue-300 dark:hover:bg-blue-950"
                    :disabled="!chosenAgent"
                    data-test="feature-queue"
                    @click="act(() => features.queue(id, f.slug, chosenAgent))"
                  >
                    queue
                  </button>
                  <button
                    v-if="f.status === 'queued'"
                    class="rounded border border-slate-300 px-2 py-0.5 dark:border-slate-700"
                    data-test="feature-dequeue"
                    @click="act(() => features.dequeue(id, f.slug))"
                  >
                    dequeue
                  </button>
                  <button
                    v-if="f.status === 'review'"
                    class="rounded border border-emerald-500 px-2 py-0.5 text-emerald-800 dark:text-emerald-200"
                    data-test="feature-done"
                    @click="act(() => features.setStatus(id, f.slug, 'done'))"
                  >
                    done
                  </button>
                  <button
                    v-if="f.status === 'done' || f.status === 'blocked'"
                    class="rounded border border-slate-300 px-2 py-0.5 dark:border-slate-700"
                    data-test="feature-reopen"
                    @click="act(() => features.setStatus(id, f.slug, 'planned'))"
                  >
                    reopen
                  </button>
                </div>
              </div>
              <div
                v-if="open === f.slug"
                class="border-t border-slate-100 px-4 py-3 dark:border-slate-800"
                data-test="feature-body"
              >
                <div class="prose prose-sm dark:prose-invert max-w-none" v-html="html(f)" />
                <p v-if="f.lastRun" class="mt-3 text-xs text-slate-400">
                  last run on {{ agentName(f.lastRun.agentId) }} ·
                  {{ f.lastRun.outcome ?? 'running' }}
                </p>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <ModalForm
      v-if="showNew"
      title="New feature"
      :error="error"
      :busy="busy"
      @close="showNew = false"
      @submit="create"
    >
      <label class="text-sm">
        <span class="text-slate-600 dark:text-slate-300">Title</span>
        <input
          v-model="form.title"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
          data-test="feature-title-input"
          required
        />
      </label>
      <label class="text-sm">
        <span class="text-slate-600 dark:text-slate-300"
          >Description (markdown; this is what the agent is asked to do)</span
        >
        <textarea
          v-model="form.body"
          rows="8"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700"
          data-test="feature-body-input"
        />
      </label>
      <p class="text-xs text-slate-500 dark:text-slate-400">
        Saved as <code>features/{{ form.slug || slugify(form.title) || '…' }}.md</code> in
        {{ project?.repos[0]?.name ?? 'the primary repository' }}.
        <button
          type="button"
          class="ml-1 text-blue-700 hover:underline dark:text-blue-300"
          data-test="feature-more"
          @click="showMore = !showMore"
        >
          {{ showMore ? 'fewer options' : 'more options' }}
        </button>
      </p>
      <template v-if="showMore">
        <label class="text-sm">
          <span class="text-slate-600 dark:text-slate-300">File name (slug)</span>
          <input
            v-model="form.slug"
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono dark:border-slate-700"
            :placeholder="slugify(form.title) || 'derived from the title'"
            data-test="feature-slug-input"
          />
        </label>
        <label class="text-sm">
          <span class="text-slate-600 dark:text-slate-300">Priority (lower runs first)</span>
          <input
            v-model="form.priority"
            type="number"
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
            data-test="feature-priority-input"
          />
        </label>
      </template>
    </ModalForm>
  </AppShell>
</template>
