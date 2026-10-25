<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/api/client'
import type { NoteItem } from '@/api/types'
import AppShell from '@/components/AppShell.vue'
import ProjectHeader from '@/components/ProjectHeader.vue'
import { useDraftsStore } from '@/stores/drafts'
import { useNotesStore } from '@/stores/notes'
import { useNotificationsStore } from '@/stores/notifications'

/**
 * The project's notes: small actionable items, written here as they come
 * up, often while an agent works on something else. An add box first,
 * always ready; open items as a checklist; done ones folded away below.
 * Nothing here reaches an agent until someone asks it to take care of the
 * notes, which is the point: writing one down disturbs nobody.
 */
const props = defineProps<{ id: string }>()
const notes = useNotesStore()
const notifications = useNotificationsStore()
const drafts = useDraftsStore()

const all = computed(() => notes.byProject.get(props.id)?.items ?? [])
const open = computed(() => all.value.filter((n) => !n.done))
const done = computed(() => all.value.filter((n) => n.done))
const showDone = ref(false)
const draftKey = computed(() => `note-new:${props.id}`)
const text = computed({
  get: () => drafts.get(draftKey.value),
  set: (v: string) => drafts.set(draftKey.value, v),
})
const busy = ref(false)
const isMac = /Mac|iPhone|iPad/.test(navigator.platform)

onMounted(() => void notes.load(props.id).catch(report))

function report(e: unknown) {
  notifications.push('error', e instanceof ApiError ? e.message : String(e))
}

async function add() {
  const t = text.value.trim()
  if (!t || busy.value) return
  busy.value = true
  try {
    await notes.add(props.id, t)
    text.value = ''
  } catch (e) {
    report(e)
  } finally {
    busy.value = false
  }
}

/** Enter is a newline, as in the turn input; the modifier or the button adds. */
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.isComposing || !(e.ctrlKey || e.metaKey)) return
  e.preventDefault()
  void add()
}

const tick = (n: NoteItem, done: boolean) => notes.update(props.id, n.id, { done }).catch(report)
const remove = (n: NoteItem) => notes.remove(props.id, n.id).catch(report)

/** Editing in place: the title and body back into one text, saved on blur or Ctrl+Enter. */
const editing = ref<{ id: string; text: string } | null>(null)
function startEdit(n: NoteItem) {
  editing.value = { id: n.id, text: n.body ? `${n.title}\n\n${n.body}` : n.title }
}
async function saveEdit() {
  const e = editing.value
  if (!e) return
  editing.value = null
  const t = e.text.trim()
  if (!t) return
  await notes.update(props.id, e.id, { text: t }).catch(report)
}
</script>

<template>
  <AppShell>
    <template #title><ProjectHeader :id="id" /></template>
    <div class="mx-auto flex h-full max-w-3xl flex-col p-6">
      <h1 class="mb-3 text-xl font-semibold">Notes</h1>
      <!-- the add box first and always: a note is written while an agent works, without a word to it -->
      <div class="mb-5 flex items-end gap-2">
        <textarea
          v-model="text"
          rows="2"
          class="max-h-60 grow resize-none overflow-y-auto rounded border border-slate-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none dark:border-slate-700"
          :placeholder="`A small thing to do, as it comes to you… (${isMac ? '⌘' : 'Ctrl'}+Enter to add; the first line is the title)`"
          data-test="note-input"
          @keydown="onKey"
        />
        <button
          class="rounded bg-blue-600 px-3 py-2 text-base text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="busy || !text.trim()"
          data-test="note-add"
          @click="add"
        >
          add
        </button>
      </div>
      <p v-if="all.length === 0" class="text-base text-slate-500 dark:text-slate-400">
        Small actionable items about the project, never features. Kept by the manager, not in a
        repository, so adding one while an agent works touches nothing it commits. Tell an agent to
        take care of the notes when there are enough; it ticks them off as it goes.
      </p>
      <div class="min-h-0 grow overflow-y-auto">
        <ul class="divide-y divide-slate-100 dark:divide-slate-800" data-test="notes-open">
          <li
            v-for="n in open"
            :key="n.id"
            class="flex items-start gap-3 py-2"
            data-test="note-row"
            :data-id="n.id"
          >
            <input
              type="checkbox"
              class="mt-1.5 h-4 w-4 pointer-coarse:h-6 pointer-coarse:w-6"
              :checked="false"
              title="done"
              data-test="note-tick"
              @change="tick(n, true)"
            />
            <div class="min-w-0 grow">
              <template v-if="editing?.id === n.id">
                <textarea
                  v-model="editing.text"
                  rows="3"
                  class="w-full resize-none rounded border border-slate-300 px-2 py-1 text-base dark:border-slate-700"
                  data-test="note-edit"
                  @keydown.ctrl.enter.prevent="saveEdit"
                  @keydown.meta.enter.prevent="saveEdit"
                  @blur="saveEdit"
                />
              </template>
              <template v-else>
                <div class="flex items-baseline gap-2">
                  <div class="text-base" data-test="note-title" @dblclick="startEdit(n)">
                    {{ n.title }}
                  </div>
                  <button
                    class="hidden text-sm text-slate-400 dark:text-slate-500 pointer-coarse:inline"
                    title="edit"
                    data-test="note-edit-button"
                    @click.stop="startEdit(n)"
                  >
                    edit
                  </button>
                </div>
                <div
                  v-if="n.body"
                  class="mt-0.5 text-sm whitespace-pre-wrap text-slate-500 dark:text-slate-400"
                  data-test="note-body"
                  @dblclick="startEdit(n)"
                >
                  {{ n.body }}
                </div>
              </template>
            </div>
            <span
              class="shrink-0 pt-1 font-mono text-sm text-slate-400 dark:text-slate-500"
              :title="`notes/${n.id}.md`"
              >{{ n.date }} #{{ n.id }}</span
            >
            <button
              class="shrink-0 pt-1 text-sm text-slate-400 hover:text-red-700 dark:text-slate-500 dark:hover:text-red-300 pointer-coarse:px-3 pointer-coarse:text-lg"
              title="remove this note"
              data-test="note-remove"
              @click="remove(n)"
            >
              ×
            </button>
          </li>
        </ul>
        <div v-if="done.length" class="mt-4">
          <button
            class="text-sm text-slate-500 hover:underline dark:text-slate-400"
            data-test="notes-done-toggle"
            @click="showDone = !showDone"
          >
            {{ showDone ? 'hide' : 'show' }} {{ done.length }} done
          </button>
          <ul
            v-if="showDone"
            class="mt-2 divide-y divide-slate-100 dark:divide-slate-800"
            data-test="notes-done"
          >
            <li
              v-for="n in done"
              :key="n.id"
              class="flex items-start gap-3 py-2 text-slate-400 dark:text-slate-500"
              data-test="note-row"
              :data-id="n.id"
            >
              <input
                type="checkbox"
                class="mt-1.5 h-4 w-4 pointer-coarse:h-6 pointer-coarse:w-6"
                checked
                title="reopen"
                data-test="note-untick"
                @change="tick(n, false)"
              />
              <div class="min-w-0 grow line-through">{{ n.title }}</div>
              <span class="shrink-0 pt-1 font-mono text-sm">{{ n.date }} #{{ n.id }}</span>
              <button
                class="shrink-0 pt-1 text-sm hover:text-red-700 dark:hover:text-red-300"
                title="remove this note"
                data-test="note-remove"
                @click="remove(n)"
              >
                ×
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </AppShell>
</template>
