<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { AgentState, TurnImage } from '@/api/types'
import { useDraftsStore } from '@/stores/drafts'

const props = defineProps<{
  agentId: string
  state: AgentState
  disabled?: boolean
  /** Messages the manager holds for the next turn. */
  queued?: number
  /** The agent's open question this message answers, when the person chose to answer one. */
  reply?: { id: number; excerpt: string } | null
}>()
/**
 * The composer of the agent's chat. Outside a turn a message starts one.
 * During a turn it is left beside the work: the agent is told a message
 * waits and reads it when it chooses, so nothing is interrupted; "steer"
 * puts it into the turn instead, which is the way to interrupt. An image
 * travels with a turn or a steer only.
 */
const inTurn = computed(
  () =>
    props.state === 'working' || props.state === 'starting' || props.state === 'waiting-permission',
)
const steerable = computed(() => props.state === 'working')
const emit = defineEmits<{
  send: [text: string, images: TurnImage[], steer: boolean]
  interrupt: []
  typing: []
  stoppedTyping: []
  cancelReply: []
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
/** One rule, shown in the placeholder: Enter is a newline, the modifier or the button sends. A phone keyboard has no modifier; there the button is the way and the placeholder says nothing. */
const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const coarse = window.matchMedia('(pointer: coarse)').matches
const hint = coarse ? '' : isMac ? ' (⌘+Enter to send)' : ' (Ctrl+Enter to send)'

/** The field grows with its text up to its cap, so a long message is read whole while it is written. */
function grow() {
  const el = box.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 288)}px`
}
watch(text, () => void nextTick(grow))
onMounted(grow)

/** A phone attaches from the camera roll; a desktop pastes or drops. */
const picker = ref<HTMLInputElement | null>(null)
function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  void attach(Array.from(input.files ?? []))
  input.value = ''
}

/** Why the plain send is off, when it is: said on the button. */
const blocked = computed(() =>
  inTurn.value && attachments.value.length > 0
    ? steerable.value
      ? 'an image cannot wait beside the work: steer with it, or send it when the turn has ended'
      : 'an image cannot wait beside the work: send it when the turn has ended'
    : null,
)
const empty = computed(() => !text.value.trim() && attachments.value.length === 0)
function send(steer = false) {
  const t = text.value.trim()
  if (empty.value || props.disabled || reading.value > 0) return
  if (steer ? !steerable.value : blocked.value) return
  // the parent clears the draft and the attachments once the manager accepted the message
  emit(
    'send',
    t || '(image)',
    attachments.value.map((a) => ({ mediaType: a.mediaType, data: a.data })),
    steer,
  )
  emit('stoppedTyping')
}

/**
 * Ctrl+Enter (or Cmd+Enter) sends; a bare Enter is a newline, as in any
 * editor. Turns here are more often several lines than one, and a chat
 * tool's Enter-to-send lost too many of them to a slipped finger; one rule
 * also means nothing has to guess what kind of device this is. With
 * Shift as well, while the agent works, the message steers.
 */
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.isComposing || !(e.ctrlKey || e.metaKey)) return
  e.preventDefault()
  send(e.shiftKey && steerable.value)
}
</script>

<template>
  <form
    class="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
    @submit.prevent="send()"
    @dragover.prevent
    @drop="onDrop"
  >
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-2">
      <div
        v-if="reply"
        class="flex items-baseline gap-2 rounded border-l-2 border-amber-500 bg-amber-50 px-2 py-1 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        data-test="reply-chip"
      >
        <span class="shrink-0">answering</span>
        <span class="min-w-0 grow truncate italic">{{ reply.excerpt }}</span>
        <button
          type="button"
          class="shrink-0 hover:underline"
          title="not an answer after all: an ordinary message"
          data-test="reply-cancel"
          @click="emit('cancelReply')"
        >
          cancel
        </button>
      </div>
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
      <div class="flex flex-wrap items-end gap-2 md:flex-nowrap">
        <textarea
          ref="box"
          v-model="text"
          rows="2"
          class="max-h-72 grow basis-full resize-none overflow-y-auto rounded border border-slate-300 px-3 py-2 text-base focus:border-blue-500 focus:outline-none md:min-w-[12rem] md:basis-0 dark:border-slate-700 max-md:pointer-coarse:py-3"
          :placeholder="
            reply
              ? `Your answer…${hint}`
              : state === 'exited'
                ? 'Send a message to resume the agent…'
                : inTurn
                  ? `Say something beside its work…${hint}`
                  : `Message the agent…${hint}`
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
          class="rounded border border-amber-400 px-3 py-2 text-base text-amber-900 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-100 dark:hover:bg-amber-950 max-md:pointer-coarse:py-3"
          data-test="interrupt"
          @click="emit('interrupt')"
        >
          interrupt
        </button>
        <input
          ref="picker"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          class="hidden"
          data-test="attach-picker"
          @change="onPick"
        />
        <button
          type="button"
          class="hidden rounded border border-slate-300 px-3 py-3 text-base text-slate-600 dark:border-slate-700 dark:text-slate-300 pointer-coarse:inline-block"
          title="attach a photo"
          data-test="attach"
          @click="picker?.click()"
        >
          📷
        </button>
        <button
          v-if="steerable"
          type="button"
          class="ml-auto rounded border border-blue-600 px-3 py-2 text-base text-blue-700 hover:bg-blue-50 disabled:opacity-50 md:ml-0 dark:text-blue-300 dark:hover:bg-blue-950 max-md:pointer-coarse:py-3"
          :disabled="disabled || reading > 0 || empty"
          data-test="steer"
          title="Into the turn now, as an instruction the agent acts on at its next step: for when you mean to interrupt (Ctrl+Shift+Enter)"
          @click="send(true)"
        >
          steer
        </button>
        <button
          type="submit"
          class="rounded bg-blue-600 px-4 py-2 text-base text-white hover:bg-blue-700 disabled:opacity-50 max-md:pointer-coarse:px-5 max-md:pointer-coarse:py-3"
          :class="steerable ? '' : 'ml-auto md:ml-0'"
          :disabled="disabled || reading > 0 || empty || !!blocked"
          data-test="send"
          :title="
            blocked ??
            (inTurn
              ? 'Left beside its work: the agent is told a message waits and reads it when it chooses; nothing is interrupted'
              : undefined)
          "
        >
          send
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
