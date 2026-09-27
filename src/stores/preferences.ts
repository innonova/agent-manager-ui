import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type Theme = 'system' | 'light' | 'dark'
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
  /** Browser notifications when an agent is ready or needs input and the page is not focused. */
  const desktopNotifications = ref(false)

  function load(): void {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Partial<{
        theme: Theme
        fontSize: number
        desktopNotifications: boolean
      }>
      if (saved.desktopNotifications === true) desktopNotifications.value = true
      if (saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'system')
        theme.value = saved.theme
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
        JSON.stringify({
          theme: theme.value,
          fontSize: fontSize.value,
          desktopNotifications: desktopNotifications.value,
        }),
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

  /** The browser's permission state, or 'unsupported'. */
  function notificationPermission(): NotificationPermission | 'unsupported' {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  }

  /** Turning it on asks the browser for permission (must run from a click); stays off if refused. */
  async function setDesktopNotifications(on: boolean): Promise<void> {
    if (!on) {
      desktopNotifications.value = false
      return
    }
    if (typeof Notification === 'undefined') return
    const p =
      Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    desktopNotifications.value = p === 'granted'
  }

  function stepFontSize(delta: 1 | -1): void {
    const i = FONT_SIZES.indexOf(fontSize.value as (typeof FONT_SIZES)[number])
    const next = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, (i < 0 ? 2 : i) + delta))]
    if (next !== undefined) fontSize.value = next
  }

  load()
  apply()
  watch([theme, fontSize, desktopNotifications], () => {
    apply()
    save()
  })
  media?.addEventListener('change', apply)

  return {
    theme,
    fontSize,
    desktopNotifications,
    isDark,
    setTheme,
    stepFontSize,
    notificationPermission,
    setDesktopNotifications,
  }
})
