<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { languageFor, monaco } from '@/monaco'
import { usePreferencesStore } from '@/stores/preferences'

/** Monaco's diff editor, read-only: the file at the base on the left, the working tree on the right. */
const props = defineProps<{ path: string; before: string; after: string; inline?: boolean }>()
const el = ref<HTMLElement | null>(null)
const prefs = usePreferencesStore()
let editor: monaco.editor.IStandaloneDiffEditor | null = null
let observer: ResizeObserver | null = null

const theme = () => (prefs.isDark() ? 'vs-dark' : 'vs')

function setModels() {
  if (!editor) return
  const old = editor.getModel()
  editor.setModel({
    original: monaco.editor.createModel(props.before, languageFor(props.path)),
    modified: monaco.editor.createModel(props.after, languageFor(props.path)),
  })
  old?.original.dispose()
  old?.modified.dispose()
}

onMounted(() => {
  editor = monaco.editor.createDiffEditor(el.value!, {
    readOnly: true,
    originalEditable: false,
    automaticLayout: false,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: prefs.fontSize - 1,
    theme: theme(),
    renderSideBySide: !props.inline,
    ignoreTrimWhitespace: false,
    renderOverviewRuler: false,
  })
  setModels()
  observer = new ResizeObserver(() => editor?.layout())
  observer.observe(el.value!)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  const m = editor?.getModel()
  editor?.dispose()
  m?.original.dispose()
  m?.modified.dispose()
})

watch(() => [props.path, props.before, props.after] as const, setModels)
watch(
  () => props.inline,
  (inline) => editor?.updateOptions({ renderSideBySide: !inline }),
)
watch(
  () => [prefs.theme, prefs.fontSize] as const,
  () => {
    monaco.editor.setTheme(theme())
    editor?.updateOptions({ fontSize: prefs.fontSize - 1 })
  },
)
</script>

<template>
  <div ref="el" class="h-full w-full" data-test="diff-editor" />
</template>
