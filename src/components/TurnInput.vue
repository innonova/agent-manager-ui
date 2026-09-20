<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { AgentState, TurnImage } from '@/api/types'
import { useDraftsStore } from '@/stores/drafts'
import { usePreferencesStore } from '@/stores/preferences'

const props = defineProps<{
  agentId: string
  state: AgentState
  disabled?: boolean
  /** Messages the manager holds for the next turn. */
  queued?: number
}>()
/**
 * While the agent works, a message steers the turn (the manager delivers
 * it mid-turn or queues it); while it starts or waits on a permission,
 * nothing can be sent.
 */
const busy = computed(
  () => props.disabled || props.state === 'starting' || props.state === 'waiting-permission',
)
const steering = computed(() => props.state === 'working')
const emit = defineEmits<{
  send: [text: string, images: TurnImage[]]
  interrupt: []
  typing: []
  stoppedTyping: []
}>()

/** Images pasted or dropped into the box, shown as thumbnails until sent. Not part of the draft. */
const attachments = ref<
  { mediaType: string; data: string; size: number; url: string; name: string }[]
>([])
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const MAX_IMAGES = 4
const MAX_BYTES = 3 * 1024 * 1024
const MAX_TOTAL = 6 * 1024 * 1024
/** Files still being read: sending waits for them, so a paste followed by a quick Enter is not lost. */
const reading = ref(0)
async function attach(files: File[]) {
  for (const f of files) {
    if (!IMAGE_TYPES.includes(f.type)) continue
    if (attachments.value.length >= MAX_IMAGES) {
      attachError.value = `at most ${MAX_IMAGES} images per message`
      return
    }
    if (f.size > MAX_BYTES) {
      attachError.value = `${f.name || 'image'} is over ${MAX_BYTES / 1024 / 1024} MB`
      continue
    }
    const total = attachments.value.reduce((n, x) => n + x.size, 0) + f.size
    if (total > MAX_TOTAL) {
      attachError.value = `images may total at most ${MAX_TOTAL / 1024 / 1024} MB per message`
      continue
    }
    reading.value++
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
        r.onerror = () => reject(r.error)
        r.readAsDataURL(f)
      })
      attachments.value.push({
        mediaType: f.type,
        data,
        size: f.size,
        url: URL.createObjectURL(f),
        name: f.name || 'pasted image',
      })
      attachError.value = null
    } finally {
      reading.value--
    }
  }
}
const attachError = ref<string | null>(null)
function detach(i: number) {
  const [a] = attachments.value.splice(i, 1)
  if (a) URL.revokeObjectURL(a.url)
}
function onPaste(e: ClipboardEvent) {
  const files = [...(e.clipboardData?.items ?? [])]
    .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
    .map((it) => it.getAsFile())
    .filter((f): f is File => !!f)
  if (files.length === 0) return
  // text alongside the image still pastes as text; the image alone would paste as nothing
  if (!e.clipboardData?.getData('text/plain')) e.preventDefault()
  void attach(files)
}
function onDrop(e: DragEvent) {
  const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'))
  if (files.length === 0) return
  e.preventDefault()
  void attach(files)
}
/** The parent calls this once the manager accepted the turn; also on leaving, so nothing pasted for one agent goes to another. */
function clearAttachments() {
  for (const a of attachments.value) URL.revokeObjectURL(a.url)
  attachments.value = []
  attachError.value = null
}
onUnmounted(clearAttachments)
defineExpose({ clearAttachments })
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
  if ((!t && attachments.value.length === 0) || busy.value || reading.value > 0) return
  // the parent clears the draft and the attachments once the manager accepted the turn
  emit(
    'send',
    t || '(image)',
    attachments.value.map((a) => ({ mediaType: a.mediaType, data: a.data })),
  )
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
    class="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
    @submit.prevent="send"
    @dragover.prevent
    @drop="onDrop"
  >
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-2">
      <div
        v-if="attachments.length || attachError"
        class="flex flex-wrap items-center gap-2"
        data-test="attachments"
      >
        <div
          v-for="(a, i) in attachments"
          :key="a.url"
          class="relative h-16 w-16 overflow-hidden rounded border border-slate-300 dark:border-slate-700"
          data-test="attachment"
          :title="a.name"
        >
          <img :src="a.url" :alt="a.name" class="h-full w-full object-cover" />
          <button
            type="button"
            class="absolute top-0 right-0 rounded-bl bg-slate-900/70 px-1 text-sm text-white hover:bg-red-700"
            title="Remove"
            data-test="attachment-remove"
            @click="detach(i)"
          >
            ×
          </button>
        </div>
        <span v-if="attachError" class="text-sm text-red-700 dark:text-red-300">{{
          attachError
        }}</span>
      </div>
      <div class="flex items-end gap-2">
        <textarea
          ref="box"
          v-model="text"
          rows="2"
          class="max-h-72 grow resize-none overflow-y-auto rounded border border-slate-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none dark:border-slate-700"
          :placeholder="
            state === 'exited'
              ? 'Send a message to resume the agent…'
              : state === 'waiting-permission'
                ? 'The agent is waiting for your answer above.'
                : state === 'working'
                  ? `Steer the agent… (${hint})`
                  : `Message the agent… (${hint})`
          "
          :disabled="disabled"
          spellcheck="true"
          data-test="turn-input"
          @keydown="onKey"
          @input="onInput"
          @paste="onPaste"
        />
        <button
          v-if="state === 'working'"
          type="button"
          class="rounded border border-amber-400 px-3 py-2 text-base text-amber-900 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-100 dark:hover:bg-amber-950"
          data-test="interrupt"
          @click="emit('interrupt')"
        >
          interrupt
        </button>
        <button
          type="submit"
          class="rounded bg-blue-600 px-4 py-2 text-base text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="busy || reading > 0 || (!text.trim() && attachments.length === 0)"
          data-test="send"
          :title="
            steering
              ? 'Delivered during the turn, at the agent\'s next step; or held for the next turn where the vendor cannot take one'
              : undefined
          "
        >
          {{ steering ? 'steer' : 'send' }}
        </button>
        <span
          v-if="queued"
          class="text-sm text-slate-500 dark:text-slate-400"
          data-test="queued"
          title="Held by the manager; sent when the agent finishes this turn"
          >{{ queued }} queued</span
        >
      </div>
    </div>
  </form>
</template>
