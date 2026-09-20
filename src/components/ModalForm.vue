<script setup lang="ts">
defineProps<{
  title: string
  error?: string | null
  busy?: boolean
  submitLabel?: string
  /** A second way to submit, shown next to the main one. */
  secondaryLabel?: string
}>()
const emit = defineEmits<{ close: []; submit: []; secondary: [] }>()
</script>

<template>
  <div
    class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40"
    @click.self="emit('close')"
  >
    <form
      class="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900"
      @submit.prevent="emit('submit')"
    >
      <h2 class="mb-4 text-lg font-semibold">{{ title }}</h2>
      <div class="flex flex-col gap-3">
        <slot />
      </div>
      <p v-if="error" class="mt-3 text-base text-red-700 dark:text-red-300" data-test="form-error">
        {{ error }}
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          class="rounded px-3 py-1.5 text-base text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          @click="emit('close')"
        >
          cancel
        </button>
        <button
          v-if="secondaryLabel"
          type="button"
          class="rounded border border-blue-600 px-3 py-1.5 text-base text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:text-blue-300 dark:hover:bg-slate-800"
          :disabled="busy"
          data-test="form-secondary"
          @click="emit('secondary')"
        >
          {{ secondaryLabel }}
        </button>
        <button
          type="submit"
          class="rounded bg-blue-600 px-4 py-1.5 text-base text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="busy"
          data-test="form-submit"
        >
          {{ busy ? '…' : (submitLabel ?? 'create') }}
        </button>
      </div>
    </form>
  </div>
</template>
