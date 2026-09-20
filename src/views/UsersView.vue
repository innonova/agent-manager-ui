<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { api, ApiError } from '@/api/client'
import type { User } from '@/api/types'
import { events } from '@/api/events'
import AppShell from '@/components/AppShell.vue'
import ModalForm from '@/components/ModalForm.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const notifications = useNotificationsStore()
const users = ref<User[]>([])
const showNew = ref(false)
const newName = ref('')
const error = ref<string | null>(null)
const busy = ref(false)
/** A generated password, shown once. */
const reveal = ref<{ name: string; password: string; created: boolean } | null>(null)
const renaming = ref(false)
const myName = ref('')

async function load() {
  users.value = (await api.users()).users
}
onMounted(load)
const off = events.on((f) => {
  if (f.type === 'users.changed') users.value = f.users
})
onUnmounted(off)

const when = (t: number | null) => (t ? new Date(t).toLocaleString() : 'never')

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
    const r = await api.createUser(newName.value.trim())
    showNew.value = false
    newName.value = ''
    reveal.value = { name: r.user.name, password: r.password, created: true }
    await load()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function resetPassword(u: User) {
  const self = u.id === session.user?.id
  if (
    !window.confirm(
      self
        ? 'Generate a new password for yourself? Your other logins will end; this one stays.'
        : `Generate a new password for ${u.name}? All their logins will end.`,
    )
  )
    return
  await act(async () => {
    const r = await api.resetPassword(u.id)
    reveal.value = { name: u.name, password: r.password, created: false }
  })
}

async function remove(u: User) {
  if (!window.confirm(`Remove ${u.name}? Their logins end at once.`)) return
  await act(async () => {
    await api.deleteUser(u.id)
    await load()
  })
}

function startRename() {
  myName.value = session.user?.name ?? ''
  renaming.value = true
}
async function saveRename() {
  await act(async () => {
    await api.renameMe(myName.value.trim())
    renaming.value = false
    await load()
  })
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    notifications.push('info', 'Copied.')
  } catch {
    /* no clipboard: it is on screen */
  }
}
</script>

<template>
  <AppShell>
    <template #title>
      <span class="text-slate-400 dark:text-slate-500">/</span>
      <span>users</span>
    </template>
    <div class="mx-auto flex h-full max-w-3xl flex-col p-6">
      <div class="mb-4 flex items-center gap-3">
        <h1 class="text-xl font-semibold">Users</h1>
        <span class="text-sm text-slate-400"
          >everyone here is a trusted admin; accounts exist only because someone created them</span
        >
        <span class="grow" />
        <button
          class="rounded bg-blue-600 px-3 py-1.5 text-base text-white hover:bg-blue-700"
          data-test="new-user"
          @click="showNew = true"
        >
          new user
        </button>
      </div>
      <ul
        class="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900"
      >
        <li
          v-for="u in users"
          :key="u.id"
          class="flex items-center gap-3 px-4 py-2"
          data-test="user-row"
          :data-name="u.name"
        >
          <template v-if="renaming && u.id === session.user?.id">
            <input
              v-model="myName"
              class="rounded border border-slate-300 px-2 py-1 text-base dark:border-slate-700"
              data-test="rename-input"
              @keydown.enter.prevent="saveRename"
              @keydown.escape="renaming = false"
            />
            <button
              class="text-sm text-blue-700 hover:underline dark:text-blue-300"
              data-test="rename-save"
              @click="saveRename"
            >
              save
            </button>
            <button class="text-sm text-slate-500 hover:underline" @click="renaming = false">
              cancel
            </button>
          </template>
          <template v-else>
            <span class="font-medium" data-test="user-name">{{ u.name }}</span>
            <span v-if="u.id === session.user?.id" class="text-sm text-slate-400">(you)</span>
            <button
              v-if="u.id === session.user?.id"
              class="text-sm text-blue-700 hover:underline dark:text-blue-300"
              data-test="rename"
              @click="startRename"
            >
              rename
            </button>
          </template>
          <span class="grow" />
          <span class="text-sm text-slate-400" :title="`created ${when(u.createdAt)}`"
            >last login {{ when(u.lastLoginAt) }}</span
          >
          <button
            class="rounded border border-slate-300 px-2 py-0.5 text-sm dark:border-slate-700"
            data-test="reset-password"
            @click="resetPassword(u)"
          >
            new password
          </button>
          <button
            v-if="u.id !== session.user?.id"
            class="rounded border border-red-400 px-2 py-0.5 text-sm text-red-800 dark:border-red-700 dark:text-red-200"
            data-test="remove-user"
            @click="remove(u)"
          >
            remove
          </button>
        </li>
      </ul>
    </div>

    <ModalForm
      v-if="showNew"
      title="New user"
      :error="error"
      :busy="busy"
      @close="showNew = false"
      @submit="create"
    >
      <label class="text-base">
        <span class="text-slate-600 dark:text-slate-300">Name</span>
        <input
          v-model="newName"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
          data-test="user-name-input"
          required
        />
      </label>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        A password is generated and shown once; pass it on and they can log in.
      </p>
    </ModalForm>

    <ModalForm
      v-if="reveal"
      :title="reveal.created ? `Password for ${reveal.name}` : `New password for ${reveal.name}`"
      submit-label="done"
      @close="reveal = null"
      @submit="reveal = null"
    >
      <p class="text-base text-slate-600 dark:text-slate-300">
        Shown once. Copy it now; it is not stored anywhere readable.
      </p>
      <div class="flex items-center gap-2">
        <code
          class="grow rounded bg-slate-100 px-3 py-2 font-mono text-base dark:bg-slate-800"
          data-test="password"
          >{{ reveal.password }}</code
        >
        <button
          type="button"
          class="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700"
          @click="copy(reveal!.password)"
        >
          copy
        </button>
      </div>
    </ModalForm>
  </AppShell>
</template>
