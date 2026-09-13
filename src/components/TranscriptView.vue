<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { Item, StoredItem } from '@/api/types'
import ToolCallItem from './ToolCallItem.vue'
import TranscriptItem from './TranscriptItem.vue'

const props = defineProps<{
  items: StoredItem[]
  /** Older history exists that is not loaded. */
  hasEarlier?: boolean
  loadingEarlier?: boolean
}>()
const emit = defineEmits<{ decide: [requestId: string, option: string]; loadEarlier: [] }>()

type ToolUse = Extract<Item, { kind: 'tool_use' }>
type ToolResult = Extract<Item, { kind: 'tool_result' }>
type Row =
  | { key: number; kind: 'item'; item: Item; at: number }
  | { key: number; kind: 'tool'; call: ToolUse; result: ToolResult | null }

/**
 * A tool call and its result render as one collapsed line, so the result
 * is folded under the call that produced it rather than listed after it.
 * Results whose call is not in the transcript stay as plain items.
 */
const rows = computed<Row[]>(() => {
  const out: Row[] = []
  const calls = new Map<string, Row & { kind: 'tool' }>()
  for (const s of props.items) {
    if (!s) continue // a hole: history not loaded
    const it = s.item
    if (it.kind === 'tool_use') {
      const row: Row & { kind: 'tool' } = { key: s.index, kind: 'tool', call: it, result: null }
      calls.set(it.id, row)
      out.push(row)
    } else if (it.kind === 'tool_result' && calls.has(it.toolUseId)) {
      const row = calls.get(it.toolUseId)!
      if (!row.result) row.result = it
      else out.push({ key: s.index, kind: 'item', item: it, at: s.at }) // a second result for the same call
    } else {
      out.push({ key: s.index, kind: 'item', item: it, at: s.at })
    }
  }
  return out
})
const el = ref<HTMLElement | null>(null)
const following = ref(true)

function onScroll() {
  const e = el.value
  if (!e) return
  following.value = e.scrollHeight - e.scrollTop - e.clientHeight < 40
  if (e.scrollTop < 200 && props.hasEarlier && !props.loadingEarlier) emit('loadEarlier')
}

/**
 * Earlier history is prepended; keep what the reader is looking at in
 * place by growing the scroll offset by what the new rows added above.
 */
watch(
  () => rows.value[0]?.key,
  async (first, was) => {
    const e = el.value
    if (!e || first === undefined || was === undefined || first >= was) return
    const height = e.scrollHeight
    const top = e.scrollTop
    await nextTick()
    e.scrollTop = top + (e.scrollHeight - height)
  },
)

async function follow() {
  if (!following.value) return
  await nextTick()
  const e = el.value
  if (e) e.scrollTop = e.scrollHeight
}

watch(
  () => props.items,
  () => {
    following.value = true // a different transcript starts at its end
    void follow()
  },
)
watch(() => props.items.length, follow)
watch(() => props.items[props.items.length - 1]?.item, follow, { deep: true })
onMounted(follow)
</script>

<template>
  <div ref="el" class="h-full overflow-y-auto px-4 py-3" data-test="transcript" @scroll="onScroll">
    <div class="mx-auto flex max-w-3xl flex-col gap-3">
      <button
        v-if="hasEarlier"
        class="self-center rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        data-test="load-earlier"
        :disabled="loadingEarlier"
        @click="emit('loadEarlier')"
      >
        {{ loadingEarlier ? 'loading earlier…' : 'load earlier' }}
      </button>
      <template v-for="r in rows" :key="r.key">
        <ToolCallItem v-if="r.kind === 'tool'" :call="r.call" :result="r.result" />
        <TranscriptItem
          v-else
          :item="r.item"
          :at="r.at"
          @decide="(id, o) => emit('decide', id, o)"
        />
      </template>
      <p v-if="rows.length === 0" class="text-sm text-slate-400 dark:text-slate-500">
        No transcript yet.
      </p>
    </div>
  </div>
  <button
    v-if="!following"
    class="absolute right-6 bottom-24 rounded-full bg-slate-800 px-3 py-1 text-xs text-white shadow"
    @click="((following = true), follow())"
  >
    ↓ latest
  </button>
</template>
