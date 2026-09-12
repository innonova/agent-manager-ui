<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { FONT_SIZES, usePreferencesStore, type Theme } from '@/stores/preferences'

const prefs = usePreferencesStore()
const open = ref(false)
const el = ref<HTMLElement | null>(null)
const themes: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

function onDocClick(e: MouseEvent) {
  if (open.value && el.value && !el.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="el" class="relative">
    <button
      class="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      title="Display settings"
      aria-label="Display settings"
      data-test="settings"
      @click="open = !open"
    >
      ⚙
    </button>
    <div
      v-if="open"
      class="absolute right-0 z-30 mt-1 w-56 rounded-md border border-slate-200 bg-white p-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
      data-test="settings-menu"
    >
      <div
        class="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
      >
        Theme
      </div>
      <div class="mb-3 flex gap-1">
        <button
          v-for="t in themes"
          :key="t.value"
          class="grow rounded border px-2 py-1"
          :class="
            prefs.theme === t.value
              ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100'
              : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
          "
          :data-test="`theme-${t.value}`"
          @click="prefs.setTheme(t.value)"
        >
          {{ t.label }}
        </button>
      </div>
      <div
        class="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
      >
        Font size
      </div>
      <div class="flex items-center gap-2">
        <button
          class="rounded border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-slate-700"
          :disabled="prefs.fontSize <= FONT_SIZES[0]!"
          data-test="font-smaller"
          @click="prefs.stepFontSize(-1)"
        >
          A−
        </button>
        <span class="grow text-center font-mono" data-test="font-size">{{ prefs.fontSize }}px</span>
        <button
          class="rounded border border-slate-300 px-2 py-1 disabled:opacity-40 dark:border-slate-700"
          :disabled="prefs.fontSize >= FONT_SIZES[FONT_SIZES.length - 1]!"
          data-test="font-larger"
          @click="prefs.stepFontSize(1)"
        >
          A+
        </button>
      </div>
    </div>
  </div>
</template>
