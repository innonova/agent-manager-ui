<script setup lang="ts">
import { computed } from 'vue'
import type { DirEntry } from '@/api/types'

const props = defineProps<{ entry: DirEntry; expanded?: boolean }>()

type Kind =
  | 'folder'
  | 'file'
  | 'ts'
  | 'js'
  | 'vue'
  | 'markdown'
  | 'data'
  | 'style'
  | 'markup'
  | 'image'
  | 'shell'
  | 'git'
  | 'lock'
  | 'config'
  | 'binary'
  | 'link'

const BY_EXT: Record<string, Kind> = {
  ts: 'ts',
  mts: 'ts',
  cts: 'ts',
  tsx: 'ts',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'js',
  vue: 'vue',
  md: 'markdown',
  mdx: 'markdown',
  json: 'data',
  yml: 'data',
  yaml: 'data',
  toml: 'data',
  xml: 'data',
  csv: 'data',
  css: 'style',
  scss: 'style',
  less: 'style',
  html: 'markup',
  htm: 'markup',
  svg: 'image',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  ico: 'image',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'shell',
  lock: 'lock',
  zip: 'binary',
  gz: 'binary',
  tar: 'binary',
  bin: 'binary',
  wasm: 'binary',
  node: 'binary',
}

const BY_NAME: Record<string, Kind> = {
  '.gitignore': 'git',
  '.gitattributes': 'git',
  '.gitmodules': 'git',
  '.git': 'git',
  'package-lock.json': 'lock',
  'yarn.lock': 'lock',
  'pnpm-lock.yaml': 'lock',
  'Cargo.lock': 'lock',
  '.env': 'config',
  '.editorconfig': 'config',
  '.prettierrc': 'config',
  '.npmrc': 'config',
  Dockerfile: 'config',
  Makefile: 'config',
  LICENSE: 'file',
}

const kind = computed<Kind>(() => {
  const e = props.entry
  if (e.type === 'dir') return e.name === '.git' ? 'git' : 'folder'
  if (e.type === 'symlink') return 'link'
  if (BY_NAME[e.name]) return BY_NAME[e.name]!
  const dot = e.name.lastIndexOf('.')
  const ext = dot > 0 ? e.name.slice(dot + 1).toLowerCase() : ''
  if (e.name.startsWith('.env.')) return 'config'
  if (/\.config\.[cm]?[jt]s$|rc\.(json|ya?ml|[cm]?js)$/.test(e.name)) return 'config'
  return BY_EXT[ext] ?? 'file'
})

/** Muted accents in the spirit of VS Code's icon themes; folders and plain files stay neutral. */
const COLOR: Record<Kind, string> = {
  folder: 'text-slate-400 dark:text-slate-400',
  file: 'text-slate-400 dark:text-slate-500',
  ts: 'text-sky-600 dark:text-sky-400',
  js: 'text-yellow-600 dark:text-yellow-400',
  vue: 'text-emerald-600 dark:text-emerald-400',
  markdown: 'text-blue-500 dark:text-blue-300',
  data: 'text-amber-600 dark:text-amber-400',
  style: 'text-violet-600 dark:text-violet-400',
  markup: 'text-orange-600 dark:text-orange-400',
  image: 'text-fuchsia-600 dark:text-fuchsia-400',
  shell: 'text-emerald-700 dark:text-emerald-300',
  git: 'text-orange-700 dark:text-orange-400',
  lock: 'text-slate-400 dark:text-slate-500',
  config: 'text-slate-500 dark:text-slate-400',
  binary: 'text-slate-400 dark:text-slate-500',
  link: 'text-slate-400 dark:text-slate-500',
}
const color = computed(() => COLOR[kind.value])
</script>

<template>
  <svg
    class="h-4 w-4 shrink-0"
    :class="color"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    :data-icon="kind"
  >
    <!-- folder, open when expanded -->
    <template v-if="kind === 'folder'">
      <path v-if="expanded" d="M1.5 4.5v8h11l2-5H4l-1.5 5" />
      <path v-if="expanded" d="M1.5 4.5V3h4l1.5 1.5h5v2" />
      <path v-else d="M1.5 3.5h4l1.5 1.5h7.5v7.5h-13z" />
    </template>
    <!-- git: a branch -->
    <template v-else-if="kind === 'git'">
      <circle cx="4.5" cy="3.5" r="1.5" />
      <circle cx="4.5" cy="12.5" r="1.5" />
      <circle cx="11.5" cy="5.5" r="1.5" />
      <path d="M4.5 5v6M11.5 7c0 2.5-7 1.5-7 4" />
    </template>
    <!-- symlink: a document with an arrow out -->
    <template v-else-if="kind === 'link'">
      <path d="M4 1.5h5l3 3v10H4z" />
      <path d="M6.5 11.5l3-3M7 8.5h2.5V11" />
    </template>
    <!-- image: mountains in a frame -->
    <template v-else-if="kind === 'image'">
      <rect x="2" y="2.5" width="12" height="11" rx="1" />
      <circle cx="5.5" cy="6" r="1.2" />
      <path d="M2.5 12.5l3.5-4 2.5 2.5 2-2 3.5 3.5" />
    </template>
    <!-- lock -->
    <template v-else-if="kind === 'lock'">
      <rect x="3.5" y="7" width="9" height="7" rx="1" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </template>
    <!-- config: a gear -->
    <template v-else-if="kind === 'config'">
      <circle cx="8" cy="8" r="2" />
      <path
        d="M8 2v1.6M8 12.4V14M2 8h1.6M12.4 8H14M3.8 3.8l1.1 1.1M11.1 11.1l1.1 1.1M3.8 12.2l1.1-1.1M11.1 4.9l1.1-1.1"
      />
    </template>
    <!-- shell: a prompt -->
    <template v-else-if="kind === 'shell'">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M4.5 6l2 2-2 2M8.5 10h3" />
    </template>
    <!-- everything else: a document, with a glyph for the kind -->
    <template v-else>
      <path d="M4 1.5h5l3 3v10H4z" />
      <path d="M9 1.5v3h3" />
      <template v-if="kind === 'ts'">
        <text
          x="8"
          y="12.6"
          text-anchor="middle"
          font-size="5.5"
          font-weight="700"
          font-family="ui-sans-serif, system-ui, sans-serif"
          stroke="none"
          fill="currentColor"
        >
          TS
        </text>
      </template>
      <template v-else-if="kind === 'js'">
        <text
          x="8"
          y="12.6"
          text-anchor="middle"
          font-size="5.5"
          font-weight="700"
          font-family="ui-sans-serif, system-ui, sans-serif"
          stroke="none"
          fill="currentColor"
        >
          JS
        </text>
      </template>
      <template v-else-if="kind === 'vue'">
        <path d="M5.5 7.5L8 12l2.5-4.5M6.8 7.5L8 9.7l1.2-2.2" />
      </template>
      <template v-else-if="kind === 'markdown'">
        <path d="M5.5 12V8l1.5 2 1.5-2v4M10.5 8v4M9.5 11l1 1 1-1" stroke-width="1" />
      </template>
      <template v-else-if="kind === 'data'">
        <path
          d="M6.5 7.5c-1 0-1 .8-1 1.5s0 1.5-1 1.5c1 0 1 .8 1 1.5M9.5 7.5c1 0 1 .8 1 1.5s0 1.5 1 1.5c-1 0-1 .8-1 1.5"
        />
      </template>
      <template v-else-if="kind === 'style'">
        <path d="M6 8h4M6 10.5h4M7 7v5M9 7v5" stroke-width="1" />
      </template>
      <template v-else-if="kind === 'markup'">
        <path d="M6.5 8l-1.5 2 1.5 2M9.5 8l1.5 2-1.5 2" />
      </template>
      <template v-else-if="kind === 'binary'">
        <path d="M6 8v4M8 8v4M10 8v4M6 10h4" stroke-width="1" />
      </template>
    </template>
  </svg>
</template>
