<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { ApiError, api } from '@/api/client'
import type { HarnessRow } from '@/api/types'
import AppShell from '@/components/AppShell.vue'
import { useHostsStore } from '@/stores/hosts'
import { useNotificationsStore } from '@/stores/notifications'

const CodeViewer = defineAsyncComponent(() => import('@/components/CodeViewer.vue'))

/**
 * The harness note's template, per machine, in a real editor: what every
 * agent there is told at session start. The whole page is the editor, so
 * the text can be read and discussed, not peered at through a form.
 */
const route = useRoute()
const router = useRouter()
const hosts = useHostsStore()
const notifications = useNotificationsStore()
const rows = ref<HarnessRow[]>([])
const host = ref('')
const text = ref('')
const busy = ref(false)
const loaded = ref(false)

const current = computed(() => rows.value.find((r) => r.host === host.value) ?? null)
const dirty = computed(() => !!current.value && text.value !== current.value.template)
const sourceLabel = computed(() =>
  current.value?.source === 'built-in'
    ? 'the built-in note'
    : current.value?.source === 'custom'
      ? 'a custom note'
      : 'off: agents here get no note',
)

async function load() {
  rows.value = (await api.harness().catch(() => ({ hosts: [] }))).hosts
  const wanted = String(route.query.host ?? '')
  host.value = rows.value.some((r) => r.host === wanted) ? wanted : (rows.value[0]?.host ?? '')
  loaded.value = true
}
/** The editor shows the template in force; off means an empty file, shown as the built-in text to start from. */
watch(current, (row) => {
  text.value = row ? (row.source === 'off' ? row.builtIn : row.template) : ''
})
function pick(h: string) {
  if (dirty.value && !confirm('Discard the unsaved changes?')) return
  host.value = h
  void router.replace({ name: 'harness', query: { host: h } })
}

/** `template` null: back to the built-in one; empty: off; text: the operator's. */
async function save(template: string | null) {
  if (!current.value) return
  busy.value = true
  try {
    const row = await api.saveHarness(current.value.host, template)
    rows.value = rows.value.map((r) => (r.host === row.host ? row : r))
    text.value = row.source === 'off' ? row.builtIn : row.template
    notifications.push(
      'info',
      template === null
        ? 'back to the built-in note; agents get it at their next restart'
        : template.trim() === ''
          ? 'the note is off; agents get none at their next restart'
          : 'saved; agents get it at their next restart',
    )
  } catch (e) {
    notifications.push('error', e instanceof ApiError ? e.message : String(e))
  } finally {
    busy.value = false
  }
}
function useBuiltIn() {
  if (!confirm('Remove the custom note on this machine and use the built-in one?')) return
  void save(null)
}
function turnOff() {
  if (!confirm('Turn the note off on this machine? Agents there will be told nothing.')) return
  void save('')
}
function loadBuiltIn() {
  if (current.value) text.value = current.value.builtIn
}

onMounted(load)
</script>

<template>
  <AppShell>
    <template #title>
      <span class="text-sm text-slate-500 dark:text-slate-400">
        <RouterLink :to="{ name: 'projects' }" class="hover:underline">projects</RouterLink>
        · harness note
      </span>
    </template>
    <div class="flex h-full min-h-0 flex-col">
      <div
        class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 px-4 py-2 text-sm dark:border-slate-800"
      >
        <div v-if="hosts.several" class="flex gap-1" data-test="harness-hosts">
          <button
            v-for="r in rows"
            :key="r.host"
            type="button"
            class="rounded px-2 py-0.5"
            :class="
              r.host === host
                ? 'bg-slate-200 font-medium dark:bg-slate-700'
                : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            "
            @click="pick(r.host)"
          >
            {{ r.host }}
          </button>
        </div>
        <span
          v-if="current"
          class="text-slate-500 dark:text-slate-400"
          data-test="harness-source"
          >{{ sourceLabel }}</span
        >
        <span
          v-if="current"
          class="truncate font-mono text-xs text-slate-400 dark:text-slate-500"
          >{{ current.file }}</span
        >
        <span class="grow" />
        <button
          type="button"
          class="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          title="put the built-in text in the editor (nothing is saved until you save)"
          data-test="harness-load-builtin"
          @click="loadBuiltIn"
        >
          load the built-in text
        </button>
        <button
          v-if="current && current.source !== 'built-in'"
          type="button"
          class="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          title="remove this machine's file"
          data-test="harness-use-builtin"
          :disabled="busy"
          @click="useBuiltIn"
        >
          use the built-in note
        </button>
        <button
          v-if="current && current.source !== 'off'"
          type="button"
          class="text-xs text-slate-500 hover:text-red-700 dark:text-slate-400"
          title="agents on this machine get no note"
          data-test="harness-off"
          :disabled="busy"
          @click="turnOff"
        >
          turn off
        </button>
        <button
          type="button"
          class="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
          data-test="harness-save"
          :disabled="busy || !dirty"
          @click="save(text)"
        >
          {{ busy ? '…' : 'save' }}
        </button>
      </div>
      <div class="min-h-0 grow" data-test="harness-editor">
        <CodeViewer
          v-if="loaded && current"
          path="harness.md"
          :content="text"
          editable
          wrap
          @update:content="text = $event"
        />
        <p v-else-if="loaded" class="p-4 text-sm text-slate-500 dark:text-slate-400">
          Nothing to edit: no machine answered.
        </p>
      </div>
      <p
        class="border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"
      >
        Every agent on this machine is given this text at session start, with
        <code v-pre>{{ agent }}</code
        >, <code v-pre>{{ project }}</code
        >, <code v-pre>{{ host }}</code
        >, <code v-pre>{{ profile }}</code
        >, <code v-pre>{{ cwd }}</code
        >, <code v-pre>{{ permissions }}</code> and <code v-pre>{{ repos }}</code> filled in. A
        change reaches an agent at its next restart. Saving an empty text turns the note off.
      </p>
    </div>
  </AppShell>
</template>
