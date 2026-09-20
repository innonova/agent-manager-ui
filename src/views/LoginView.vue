<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/api/client'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()
const name = ref('')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit() {
  error.value = null
  busy.value = true
  try {
    await session.login(name.value, password.value)
    const next = typeof route.query.next === 'string' ? route.query.next : '/'
    await router.push(next)
  } catch (e) {
    error.value =
      e instanceof ApiError && e.status === 401
        ? 'Wrong name or password.'
        : String((e as Error).message ?? e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
    <form
      class="w-80 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      @submit.prevent="submit"
    >
      <h1 class="mb-4 text-lg font-semibold">agent-manager</h1>
      <label class="mb-3 block text-base">
        <span class="text-slate-600 dark:text-slate-300">Name</span>
        <input
          v-model="name"
          autocomplete="username"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
          data-test="login-name"
          required
        />
      </label>
      <label class="mb-4 block text-base">
        <span class="text-slate-600 dark:text-slate-300">Password</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-700"
          data-test="login-password"
          required
        />
      </label>
      <p v-if="error" class="mb-3 text-base text-red-700 dark:text-red-300" data-test="login-error">
        {{ error }}
      </p>
      <button
        class="w-full rounded bg-blue-600 py-2 text-base text-white hover:bg-blue-700 disabled:opacity-50"
        :disabled="busy"
        data-test="login-submit"
      >
        log in
      </button>
    </form>
  </div>
</template>
