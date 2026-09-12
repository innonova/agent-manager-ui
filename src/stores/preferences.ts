import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type Theme = 'system' | 'light' | 'dark'
/** What a bare Enter does in the turn input; `auto` sends unless the primary pointer is touch. */
export type EnterKey = 'auto' | 'send' | 'newline'
export const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20] as const
const KEY = 'agent-manager-ui.preferences'

/**
 * Per-browser display preferences: colour theme (with a manual override of
 * the system setting) and base font size. Everything in the UI is sized in
 * rem, so the root font size scales the whole page. Persisted in
 * localStorage; applied to <html> so there is no flash after load.
 */
export const usePreferencesStore = defineStore('preferences', () => {
  const theme = ref<Theme>('system')
  const fontSize = ref<number>(14)
  const enterKey = ref<EnterKey>('auto')

  function load(): void {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Partial<{
        theme: Theme
        fontSize: number
        enterKey: EnterKey
      }>
      if (saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'system')
        theme.value = saved.theme
      if (saved.enterKey === 'auto' || saved.enterKey === 'send' || saved.enterKey === 'newline')
        enterKey.value = saved.enterKey
      if (
        typeof saved.fontSize === 'number' &&
        (FONT_SIZES as readonly number[]).includes(saved.fontSize)
      )
        fontSize.value = saved.fontSize
    } catch {
      /* no storage, or garbage: defaults */
    }
  }

  function save(): void {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ theme: theme.value, fontSize: fontSize.value, enterKey: enterKey.value }),
      )
    } catch {
      /* ignore */
    }
  }

  const media =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null

  function isDark(): boolean {
    return theme.value === 'dark' || (theme.value === 'system' && Boolean(media?.matches))
  }

  // Touch-first devices (a tablet, a Surface without its keyboard) have no
  // reliable Shift+Enter on the on-screen keyboard, so there Enter inserts a
  // newline and the send button (or Ctrl+Enter) sends. Tracked live: a
  // detachable keyboard flips the primary pointer.
  const coarse =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(pointer: coarse)')
      : null
  const coarsePointer = ref(Boolean(coarse?.matches))
  coarse?.addEventListener('change', () => (coarsePointer.value = coarse.matches))

  function enterSends(): boolean {
    if (enterKey.value === 'auto') return !coarsePointer.value
    return enterKey.value === 'send'
  }

  function apply(): void {
    const root = document.documentElement
    root.classList.toggle('dark', isDark())
    root.style.colorScheme = isDark() ? 'dark' : 'light'
    root.style.fontSize = `${fontSize.value}px`
    root.dataset.theme = theme.value
  }

  function setTheme(t: Theme): void {
    theme.value = t
  }

  function setEnterKey(k: EnterKey): void {
    enterKey.value = k
  }

  function stepFontSize(delta: 1 | -1): void {
    const i = FONT_SIZES.indexOf(fontSize.value as (typeof FONT_SIZES)[number])
    const next = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, (i < 0 ? 2 : i) + delta))]
    if (next !== undefined) fontSize.value = next
  }

  load()
  apply()
  watch([theme, fontSize, enterKey], () => {
    apply()
    save()
  })
  media?.addEventListener('change', apply)

  return { theme, fontSize, enterKey, isDark, enterSends, setTheme, setEnterKey, stepFontSize }
})
