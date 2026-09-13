<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { ApiError } from '@/api/client'
import type { Feature, FeatureStatus } from '@/api/types'
import AppShell from '@/components/AppShell.vue'
import FeatureStatusBadge from '@/components/FeatureStatusBadge.vue'
import ModalForm from '@/components/ModalForm.vue'
import ProjectTabs from '@/components/ProjectTabs.vue'
import { useDraftsStore } from '@/stores/drafts'
import { useFeaturesStore } from '@/stores/features'
import { useNotificationsStore } from '@/stores/notifications'
import { useProjectsStore } from '@/stores/projects'

const props = defineProps<{ id: string }>()
const projects = useProjectsStore()
const features = useFeaturesStore()
const notifications = useNotificationsStore()
const drafts = useDraftsStore()

const project = computed(() => projects.byId.get(props.id)?.project)
const list = computed(() => features.byProject.get(props.id) ?? [])
const open = ref<string | null>(null)
const showNew = ref(false)

// Unsent text lives in the drafts store, like the turn input's, so switching
// tab or reloading does not lose it: a response per feature, one new-feature
// form per project.
const responseKey = (slug: string) => `feature-response:${props.id}/${slug}`
const response = computed({
  get: () => (open.value ? drafts.get(responseKey(open.value)) : ''),
  set: (v: string) => {
    if (open.value) drafts.set(responseKey(open.value), v)
  },
})
const EMPTY_FORM = { title: '', slug: '', body: '', priority: 100 }
const formKey = computed(() => `feature-new:${props.id}`)
const form = computed({
  get: () => {
    try {
      return { ...EMPTY_FORM, ...(JSON.parse(drafts.get(formKey.value) || '{}') as object) }
    } catch {
      return { ...EMPTY_FORM }
    }
  },
  set: (v: typeof EMPTY_FORM) => drafts.set(formKey.value, JSON.stringify(v)),
})
const patchForm = (patch: Partial<typeof EMPTY_FORM>) => (form.value = { ...form.value, ...patch })

// Editing a planned feature: title, body and priority, in the same kind of dialog.
const editing = ref<Feature | null>(null)
const edit = ref({ title: '', body: '', priority: 100 })
const editError = ref<string | null>(null)
function startEdit(f: Feature) {
  editing.value = f
  edit.value = { title: f.title, body: f.body, priority: f.priority }
  editError.value = null
}
async function saveEdit() {
  if (!editing.value) return
  editError.value = null
  busy.value = true
  try {
    await features.update(props.id, editing.value.slug, {
      title: edit.value.title,
      body: edit.value.body,
      priority: Number(edit.value.priority),
    })
    editing.value = null
  } catch (e) {
    editError.value = e instanceof ApiError ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
/** Slug and priority are rarely needed; they hide behind a toggle. */
const showMore = ref(false)
const multiRepo = computed(() => (project.value?.repos.length ?? 0) > 1)
const error = ref<string | null>(null)
const busy = ref(false)

const groups = computed(() => {
  const order: FeatureStatus[] = ['in-progress', 'review', 'blocked', 'planned', 'done']
  return order
    .map((status) => ({ status, items: list.value.filter((f) => f.status === status) }))
    .filter((g) => g.items.length)
})

onMounted(async () => {
  if (!projects.loaded) await projects.load()
  await features.load(props.id)
})

function toggle(slug: string) {
  open.value = open.value === slug ? null : slug
}

async function respond(slug: string) {
  const text = response.value.trim()
  if (!text) return
  await act(async () => {
    await features.respond(props.id, slug, text)
    drafts.set(responseKey(slug), '')
  })
}

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
    drafts.set(formKey.value, '')
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
        <span class="text-xs text-slate-400"
          >features/*.md in each repository · ask an agent in its conversation to work on them; it
          reports here</span
        >
        <span class="grow" />
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
        project's repositories: a title, a status and a description. Ask an agent, in its
        conversation, to work on one; it appends its report to the file and puts it in review.
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
                <button class="min-w-0 grow text-left" @click="toggle(f.slug)">
                  <span class="font-medium" data-test="feature-title">{{ f.title }}</span>
                  <span class="ml-2 font-mono text-xs text-slate-400"
                    >{{ f.slug
                    }}<template v-if="f.status !== 'done'"> · p{{ f.priority }}</template></span
                  >
                  <span
                    v-if="f.status === 'done'"
                    class="ml-2 text-xs text-slate-400"
                    :title="new Date(f.mtime).toLocaleString()"
                    data-test="feature-done-at"
                    >{{ new Date(f.mtime).toLocaleDateString() }}</span
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
                <RouterLink
                  v-if="f.range"
                  :to="{
                    name: 'files',
                    params: { id },
                    query: { mode: 'changes', base: `feature:${f.slug}` },
                  }"
                  class="text-xs text-blue-700 hover:underline dark:text-blue-300"
                  data-test="feature-changes"
                  >changes</RouterLink
                >
                <FeatureStatusBadge :status="f.status" data-test="feature-status" />
                <div class="flex gap-2 text-xs">
                  <button
                    v-if="f.status !== 'in-progress'"
                    class="rounded border border-slate-300 px-2 py-0.5 dark:border-slate-700"
                    data-test="feature-edit"
                    @click="startEdit(f)"
                  >
                    edit
                  </button>
                  <button
                    v-if="f.status === 'review' || f.status === 'blocked' || f.status === 'planned'"
                    class="rounded border border-emerald-500 px-2 py-0.5 text-emerald-800 dark:text-emerald-200"
                    data-test="feature-done"
                    @click="act(() => features.setStatus(id, f.slug, 'done'))"
                  >
                    done
                  </button>
                  <button
                    v-if="f.status === 'done' || f.status === 'blocked' || f.status === 'review'"
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
                <div v-if="f.status !== 'in-progress'" class="mt-4">
                  <textarea
                    v-model="response"
                    rows="3"
                    class="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700"
                    placeholder="Respond to the report… (appended to the file as a dated Response section)"
                    data-test="feature-response-input"
                  />
                  <div class="mt-2 flex items-center gap-2 text-xs">
                    <button
                      class="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
                      :disabled="!response.trim()"
                      data-test="feature-respond"
                      @click="respond(f.slug)"
                    >
                      respond
                    </button>
                    <span class="text-slate-400"
                      >Sets it back to planned; then ask an agent to work on it again, with whatever
                      caveats you like. Use "done" on the row to close it.</span
                    >
                  </div>
                </div>
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
          :value="form.title"
          @input="patchForm({ title: ($event.target as HTMLInputElement).value })"
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
          :value="form.body"
          @input="patchForm({ body: ($event.target as HTMLTextAreaElement).value })"
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
            :value="form.slug"
            @input="patchForm({ slug: ($event.target as HTMLInputElement).value })"
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono dark:border-slate-700"
            :placeholder="slugify(form.title) || 'derived from the title'"
            data-test="feature-slug-input"
          />
        </label>
        <label class="text-sm">
          <span class="text-slate-600 dark:text-slate-300">Priority (lower runs first)</span>
          <input
            :value="form.priority"
            @input="patchForm({ priority: Number(($event.target as HTMLInputElement).value) })"
            type="number"
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
            data-test="feature-priority-input"
          />
        </label>
      </template>
    </ModalForm>

    <ModalForm
      v-if="editing"
      title="Edit feature"
      submit-label="save"
      :error="editError"
      :busy="busy"
      @close="editing = null"
      @submit="saveEdit"
    >
      <label class="text-sm">
        <span class="text-slate-600 dark:text-slate-300">Title</span>
        <input
          v-model="edit.title"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
          data-test="feature-edit-title"
          required
        />
      </label>
      <label class="text-sm">
        <span class="text-slate-600 dark:text-slate-300"
          >Description (markdown; the whole file below the frontmatter)</span
        >
        <textarea
          v-model="edit.body"
          rows="10"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs dark:border-slate-700"
          data-test="feature-edit-body"
        />
      </label>
      <label class="text-sm">
        <span class="text-slate-600 dark:text-slate-300">Priority (lower first)</span>
        <input
          v-model="edit.priority"
          type="number"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
          data-test="feature-edit-priority"
        />
      </label>
    </ModalForm>
  </AppShell>
</template>
