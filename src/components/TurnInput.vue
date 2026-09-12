<script setup lang="ts">
import { ref } from 'vue'
import type { AgentState } from '@/api/types'

const props = defineProps<{ state: AgentState; disabled?: boolean }>()
const emit = defineEmits<{ send: [text: string]; interrupt: [] }>()
const text = ref('')

function send() {
  const t = text.value.trim()
  if (!t || props.disabled) return
  emit('send', t)
  text.value = ''
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
</script>

<template>
  <form class="flex items-end gap-2 border-t border-slate-200 bg-white p-3" @submit.prevent="send">
    <textarea
      v-model="text"
      rows="2"
      class="grow resize-none rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      :placeholder="
        state === 'exited'
          ? 'Send a message to resume the agent…'
          : 'Message the agent… (Enter to send, Shift+Enter for newline)'
      "
      :disabled="disabled"
      data-test="turn-input"
      @keydown="onKey"
    />
    <button
      v-if="state === 'working'"
      type="button"
      class="rounded border border-amber-400 px-3 py-2 text-sm text-amber-900 hover:bg-amber-50"
      data-test="interrupt"
      @click="emit('interrupt')"
    >
      interrupt
    </button>
    <button
      type="submit"
      class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
      :disabled="disabled || !text.trim()"
      data-test="send"
    >
      send
    </button>
  </form>
</template>
