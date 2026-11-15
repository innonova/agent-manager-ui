<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { ChatMessage } from '@/api/types'
import { when } from '@/time'

/**
 * The chat between the people and one agent, beside the flow of its
 * work: short, and it stays put. What the agent asked and has no answer
 * to yet is pinned at the top however much was said since; what it
 * decided alone stands out; each of a person's messages says whether the
 * agent has read it. The composer below is the parent's.
 */
const props = defineProps<{
  messages: ChatMessage[]
  hasEarlier?: boolean
  loadingEarlier?: boolean
}>()
const emit = defineEmits<{
  /** Answer this open question: the composer takes it from here. */
  answer: [message: ChatMessage]
  dismiss: [message: ChatMessage]
  /** Show where this message is in the flow. */
  locate: [message: ChatMessage]
  loadEarlier: []
}>()

const open = computed(() =>
  props.messages.filter((m) => m.from === 'agent' && m.kind === 'question' && !m.closedAt),
)
const md = (text: string) => DOMPurify.sanitize(marked.parse(text, { async: false }) as string)

/** How a person's message reached the agent, and whether it has: the line under their name. */
function delivery(m: ChatMessage): { text: string; title: string } {
  if (m.via === 'turn')
    return { text: 'sent as a turn', title: 'the agent was not working: this started a turn' }
  if (m.via === 'steer')
    return { text: 'steered', title: 'put into the turn the agent was in, as an instruction' }
  return m.readAt
    ? { text: `read ${when(m.readAt)}`, title: 'the agent fetched it then' }
    : {
        text: 'not read yet',
        title:
          'left beside its work: the agent has been told a message waits, and reads it when it chooses',
      }
}
const closed = (m: ChatMessage) =>
  m.closedBy === 'answer'
    ? 'answered'
    : m.closedBy === 'person'
      ? 'dismissed'
      : 'no longer needed by the agent'
/** A message has a place in the flow once the agent has it: its own call that said it, a turn or steer where it arrived, an aside where it was read. */
const located = (m: ChatMessage) => m.from === 'agent' || m.via !== 'aside' || !!m.readAt

const el = ref<HTMLElement | null>(null)
const following = ref(true)
function onScroll() {
  const e = el.value
  if (e) following.value = e.scrollHeight - e.scrollTop - e.clientHeight < 40
}
async function follow() {
  if (!following.value) return
  await nextTick()
  const e = el.value
  if (e) e.scrollTop = e.scrollHeight
}
// earlier messages are prepended: what is being read stays where it is
watch(
  () => props.messages[0]?.id,
  async (first, was) => {
    const e = el.value
    if (!e || first === undefined || was === undefined || first >= was) return
    const height = e.scrollHeight
    const top = e.scrollTop
    await nextTick()
    e.scrollTop = top + (e.scrollHeight - height)
  },
)
watch(
  () => props.messages,
  () => {
    following.value = true // another agent's chat starts at its end
    void follow()
  },
)
watch(() => props.messages.length, follow)
onMounted(follow)
/** The pinned question, where it was asked. */
function show(id: number) {
  const row = el.value?.querySelector<HTMLElement>(`[data-id="${id}"]`)
  if (!row) return
  following.value = false
  row.scrollIntoView({ block: 'center' })
}

const TONE = {
  person: 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40',
  message: 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900',
  decision: 'border-violet-500 bg-violet-50/70 dark:bg-violet-950/30',
  important: 'border-red-500 bg-red-50/70 dark:bg-red-950/30',
  question: 'border-amber-500 bg-amber-50 dark:bg-amber-950/40',
}
function tone(m: ChatMessage): string {
  if (m.from === 'person') return TONE.person
  if (m.kind === 'question') return m.closedAt ? TONE.message : TONE.question
  if (m.important) return TONE.important
  return m.kind === 'decision' ? TONE.decision : TONE.message
}
</script>

<template>
  <div class="flex min-h-0 grow flex-col" data-test="chat">
    <!-- what the agent is still waiting to hear, however far the chat has moved on -->
    <div
      v-if="open.length"
      class="flex max-h-[45%] shrink-0 flex-col gap-2 overflow-y-auto border-b border-amber-300 bg-amber-50/60 px-4 py-2 dark:border-amber-700 dark:bg-amber-950/20"
      data-test="chat-pinned"
    >
      <div
        v-for="q in open"
        :key="q.id"
        class="mx-auto w-full max-w-3xl"
        data-test="chat-question"
        :data-id="q.id"
      >
        <div class="flex items-baseline gap-2 text-sm text-amber-900 dark:text-amber-100">
          <span class="font-semibold">open question</span>
          <button
            type="button"
            class="hover:underline"
            title="show it where it was asked"
            @click="show(q.id)"
          >
            {{ when(q.at) }}
          </button>
          <span class="grow" />
          <button
            type="button"
            class="rounded border border-amber-500 bg-white px-2 py-0.5 text-amber-900 hover:bg-amber-100 dark:bg-slate-900 dark:text-amber-100 dark:hover:bg-amber-950"
            data-test="chat-answer"
            @click="emit('answer', q)"
          >
            answer
          </button>
          <button
            type="button"
            class="text-amber-800 hover:underline dark:text-amber-200"
            title="it needs no answer: take it off the top; the agent can see that it was dismissed"
            data-test="chat-dismiss"
            @click="emit('dismiss', q)"
          >
            dismiss
          </button>
        </div>
        <div
          class="chat-md md-fit prose dark:prose-invert max-h-40 max-w-none overflow-y-auto"
          v-html="md(q.text)"
        />
      </div>
    </div>

    <div ref="el" class="min-h-0 grow overflow-y-auto px-4 py-3" @scroll="onScroll">
      <div class="mx-auto flex max-w-3xl flex-col gap-3">
        <button
          v-if="hasEarlier"
          class="self-center rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          :disabled="loadingEarlier"
          data-test="chat-load-earlier"
          @click="emit('loadEarlier')"
        >
          {{ loadingEarlier ? 'loading earlier…' : 'load earlier' }}
        </button>
        <article
          v-for="m in messages"
          :key="m.id"
          class="min-w-0 rounded-r border-l-2 px-3 py-2"
          :class="tone(m)"
          data-test="chat-message"
          :data-id="m.id"
          :data-from="m.from"
          :data-kind="m.kind"
          :data-important="m.important || undefined"
          :data-via="m.via ?? undefined"
        >
          <div
            class="mb-0.5 flex flex-wrap items-baseline gap-x-2 text-sm text-slate-500 dark:text-slate-400"
          >
            <span class="font-medium text-slate-700 dark:text-slate-300" data-test="chat-author">{{
              m.author
            }}</span>
            <span
              v-if="m.from === 'agent' && m.kind !== 'message'"
              class="font-semibold"
              :class="
                m.kind === 'decision'
                  ? 'text-violet-700 dark:text-violet-300'
                  : 'text-amber-800 dark:text-amber-200'
              "
              data-test="chat-kind"
              >{{ m.kind }}</span
            >
            <span
              v-if="m.important"
              class="font-semibold text-red-700 dark:text-red-300"
              title="the agent marked it as mattering: hard to undo, or something you might have chosen otherwise"
              data-test="chat-important"
              >important</span
            >
            <button
              v-if="located(m)"
              type="button"
              class="hover:underline"
              title="show where this is in the flow"
              data-test="chat-locate"
              @click="emit('locate', m)"
            >
              {{ when(m.at) }}
            </button>
            <span v-else>{{ when(m.at) }}</span>
            <span class="grow" />
            <span
              v-if="m.from === 'person'"
              :class="
                m.via === 'aside' && !m.readAt ? 'text-amber-700 dark:text-amber-300' : undefined
              "
              :title="delivery(m).title"
              data-test="chat-read"
              >{{ delivery(m).text }}</span
            >
            <span
              v-else-if="m.kind === 'question'"
              :class="m.closedAt ? undefined : 'text-amber-800 dark:text-amber-200'"
              data-test="chat-question-state"
              >{{ m.closedAt ? `${closed(m)} ${when(m.closedAt)}` : 'open, pinned above' }}</span
            >
          </div>
          <div
            v-if="m.re"
            class="mb-1 truncate border-l-2 border-slate-300 pl-2 text-sm text-slate-500 italic dark:border-slate-600 dark:text-slate-400"
            :title="m.re.excerpt"
            data-test="chat-re"
          >
            {{ m.re.kind === 'question' ? 'answering' : 're' }}: {{ m.re.excerpt }}
          </div>
          <div
            v-if="m.from === 'agent'"
            class="chat-md md-fit prose dark:prose-invert max-w-none"
            data-test="chat-text"
            v-html="md(m.text)"
          />
          <div v-else class="break-words whitespace-pre-wrap" data-test="chat-text">
            {{ m.text }}
          </div>
          <div v-if="m.images" class="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {{ m.images }} image{{ m.images === 1 ? '' : 's' }}, shown in the flow
          </div>
        </article>
        <p
          v-if="messages.length === 0"
          class="text-base text-slate-400 dark:text-slate-500"
          data-test="chat-empty"
        >
          Nothing said yet. What you write here reaches the agent without stopping it: while it
          works it is told a message waits and reads it when it chooses. Its questions, its
          decisions and what it wants you to know show here.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* A message's width is the pane's (.md-fit, main.css); its first and
   last block sit flush in it. */
.chat-md > :deep(:first-child) {
  margin-top: 0;
}
.chat-md > :deep(:last-child) {
  margin-bottom: 0;
}
</style>
