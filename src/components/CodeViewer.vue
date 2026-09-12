<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { languageFor, monaco } from '@/monaco'
import { usePreferencesStore } from '@/stores/preferences'

const props = defineProps<{ path: string; content: string }>()
const el = ref<HTMLElement | null>(null)
const prefs = usePreferencesStore()
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let observer: ResizeObserver | null = null

function theme() {
  return prefs.isDark() ? 'vs-dark' : 'vs'
}

onMounted(() => {
  editor = monaco.editor.create(el.value!, {
    value: props.content,
    language: languageFor(props.path),
    readOnly: true,
    automaticLayout: false,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: prefs.fontSize - 1,
    theme: theme(),
    renderLineHighlight: 'none',
    wordWrap: 'off',
  })
  observer = new ResizeObserver(() => editor?.layout())
  observer.observe(el.value!)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  editor?.getModel()?.dispose()
  editor?.dispose()
})

watch(
  () => [props.path, props.content] as const,
  ([path, content]) => {
    if (!editor) return
    const model = editor.getModel()
    if (model && model.getValue() !== content) {
      const view = editor.saveViewState()
      model.setValue(content)
      if (view) editor.restoreViewState(view)
    }
    if (model) monaco.editor.setModelLanguage(model, languageFor(path))
  },
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
  <div ref="el" class="h-full w-full" data-test="editor" />
</template>
