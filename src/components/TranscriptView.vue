<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import type { StoredItem } from '@/api/types'
import TranscriptItem from './TranscriptItem.vue'

const props = defineProps<{ items: StoredItem[] }>()
const el = ref<HTMLElement | null>(null)
const following = ref(true)

function onScroll() {
  const e = el.value
  if (!e) return
  following.value = e.scrollHeight - e.scrollTop - e.clientHeight < 40
}

async function follow() {
  if (!following.value) return
  await nextTick()
  const e = el.value
  if (e) e.scrollTop = e.scrollHeight
}

watch(() => props.items.length, follow)
watch(() => props.items[props.items.length - 1]?.item, follow, { deep: true })
onMounted(follow)
</script>

<template>
  <div ref="el" class="h-full overflow-y-auto px-4 py-3" data-test="transcript" @scroll="onScroll">
    <div class="mx-auto flex max-w-3xl flex-col gap-3">
      <TranscriptItem v-for="it in items" :key="it.index" :item="it.item" />
      <p v-if="items.length === 0" class="text-sm text-slate-400 dark:text-slate-500">
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
