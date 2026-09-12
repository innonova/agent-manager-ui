// Monaco needs its web workers wired up once; Vite bundles them via ?worker.
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import cssWorker from 'monaco-editor/language/css/css.worker.js?worker'
import htmlWorker from 'monaco-editor/language/html/html.worker.js?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

/** Monaco language id for a file name, by extension, falling back to plain text. */
export function languageFor(path: string): string {
  const name = path.split('/').pop() ?? ''
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const byExt: Record<string, string> = {
    ts: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    html: 'html',
    vue: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'shell',
    bash: 'shell',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    kt: 'kotlin',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    rb: 'ruby',
    php: 'php',
    sql: 'sql',
    xml: 'xml',
    toml: 'ini',
    ini: 'ini',
    dockerfile: 'dockerfile',
    ps1: 'powershell',
  }
  if (name.toLowerCase() === 'dockerfile') return 'dockerfile'
  const lang = byExt[ext]
  if (lang && monaco.languages.getLanguages().some((l) => l.id === lang)) return lang
  return 'plaintext'
}

export { monaco }
