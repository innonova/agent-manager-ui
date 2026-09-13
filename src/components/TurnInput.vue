<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { AgentState } from '@/api/types'
import { useDraftsStore } from '@/stores/drafts'
import { usePreferencesStore } from '@/stores/preferences'

const props = defineProps<{ agentId: string; state: AgentState; disabled?: boolean }>()
/** The manager refuses overlapping turns, so sending is only offered while the agent can take one. */
const busy = computed(
  () =>
    props.disabled ||
    props.state === 'working' ||
    props.state === 'starting' ||
    props.state === 'waiting-permission',
)
const emit = defineEmits<{
  send: [text: string]
  interrupt: []
  typing: []
  stoppedTyping: []
}>()
const prefs = usePreferencesStore()
const drafts = useDraftsStore()
/** The draft is kept in the store, keyed by agent, so it survives navigation and reloads. */
const text = computed({
  get: () => drafts.get(props.agentId),
  set: (v: string) => drafts.set(props.agentId, v),
})

// The box grows with its content (up to the CSS max-height, then scrolls),
// so the line being typed never sits on the bottom edge.
const box = ref<HTMLTextAreaElement | null>(null)
function fit(): void {
  const el = box.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
onMounted(fit)
watch(text, () => void nextTick(fit))
/** Typing is reported from keystrokes only, never from a draft being restored. */
function onInput() {
  if (text.value.trim()) emit('typing')
  else emit('stoppedTyping')
}
const enterSends = computed(() => prefs.enterSends())
const hint = computed(() =>
  enterSends.value
    ? 'Enter to send, Shift+Enter for newline'
    : 'Ctrl+Enter or the button to send, Enter for newline',
)

function send() {
  const t = text.value.trim()
  if (!t || busy.value) return
  emit('send', t) // the parent clears the draft once the manager accepted the turn
  emit('stoppedTyping')
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
      ref="box"
      v-model="text"
      rows="2"
      class="max-h-72 grow resize-none overflow-y-auto rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700"
      :placeholder="
        state === 'exited'
          ? 'Send a message to resume the agent…'
          : state === 'waiting-permission'
            ? 'The agent is waiting for your answer above.'
            : `Message the agent… (${hint})`
      "
      :disabled="disabled"
      spellcheck="true"
      data-test="turn-input"
      @keydown="onKey"
      @input="onInput"
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
