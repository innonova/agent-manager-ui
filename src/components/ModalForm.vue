<script setup lang="ts">
defineProps<{ title: string; error?: string | null; busy?: boolean }>()
const emit = defineEmits<{ close: []; submit: [] }>()
</script>

<template>
  <div
    class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40"
    @click.self="emit('close')"
  >
    <form
      class="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      @submit.prevent="emit('submit')"
    >
      <h2 class="mb-4 text-lg font-semibold">{{ title }}</h2>
      <div class="flex flex-col gap-3">
        <slot />
      </div>
      <p v-if="error" class="mt-3 text-sm text-red-700" data-test="form-error">{{ error }}</p>
      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          class="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          @click="emit('close')"
        >
          cancel
        </button>
        <button
          type="submit"
          class="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="busy"
          data-test="form-submit"
        >
          {{ busy ? '…' : 'create' }}
        </button>
      </div>
    </form>
  </div>
</template>
