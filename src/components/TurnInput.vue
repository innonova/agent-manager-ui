<script setup lang="ts">
import { computed } from 'vue'
import type { AgentState } from '@/api/types'
import { useDraftsStore } from '@/stores/drafts'
import { usePreferencesStore } from '@/stores/preferences'

const props = defineProps<{ agentId: string; state: AgentState; disabled?: boolean }>()
/** The manager refuses overlapping turns, so sending is only offered while the agent can take one. */
const busy = computed(
  () => props.disabled || props.state === 'working' || props.state === 'starting',
)
const emit = defineEmits<{ send: [text: string]; interrupt: [] }>()
const prefs = usePreferencesStore()
const drafts = useDraftsStore()
/** The draft is kept in the store, keyed by agent, so it survives navigation and reloads. */
const text = computed({
  get: () => drafts.get(props.agentId),
  set: (v: string) => drafts.set(props.agentId, v),
})
const enterSends = computed(() => prefs.enterSends())
const hint = computed(() =>
  enterSends.value
    ? 'Enter to send, Shift+Enter for newline'
    : 'Ctrl+Enter or the button to send, Enter for newline',
)

function send() {
  const t = text.value.trim()
  if (!t || busy.value) return
  emit('send', t)
  text.value = ''
}

/**
 * Ctrl+Enter (or Cmd+Enter) always sends. A bare Enter sends or inserts a
 * newline according to the preference; Shift+Enter is always a newline.
 */
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return
  if (e.ctrlKey || e.metaKey || enterSends.value) {
    e.preventDefault()
    send()
  }
}
</script>

<template>
  <form
    class="flex items-end gap-2 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
    @submit.prevent="send"
  >
    <textarea
      v-model="text"
      rows="2"
      class="grow resize-none rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700"
      :placeholder="
        state === 'exited' ? 'Send a message to resume the agent…' : `Message the agent… (${hint})`
      "
      :disabled="disabled"
      spellcheck="true"
      data-test="turn-input"
      @keydown="onKey"
    />
    <button
      v-if="state === 'working'"
      type="button"
      class="rounded border border-amber-400 px-3 py-2 text-sm text-amber-900 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-100 dark:hover:bg-amber-950"
      data-test="interrupt"
      @click="emit('interrupt')"
    >
      interrupt
    </button>
    <button
      type="submit"
      class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
      :disabled="busy || !text.trim()"
      data-test="send"
    >
      send
    </button>
  </form>
</template>
