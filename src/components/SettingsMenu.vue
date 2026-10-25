<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { api, ApiError } from '@/api/client'
import { disable as pushDisable, enable as pushEnable, state as pushState } from '@/push'
import { useNotificationsStore } from '@/stores/notifications'
import { FONT_SIZES, usePreferencesStore, type Theme } from '@/stores/preferences'

const prefs = usePreferencesStore()
const notifications = useNotificationsStore()
const open = ref(false)
const el = ref<HTMLElement | null>(null)
const themes: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** Tracked as state: the browser's permission can change under us when the user answers its prompt. */
const permission = ref(prefs.notificationPermission())
/** Web push for this browser; read when the menu opens, since a subscription lives outside our store. */
const push = ref<'unsupported' | 'off' | 'on' | 'blocked'>('unsupported')
const pushBusy = ref(false)
watch(open, (o) => {
  if (o) void pushState().then((s) => (push.value = s))
})
async function togglePush(e: Event) {
  const box = e.target as HTMLInputElement
  pushBusy.value = true
  try {
    if (box.checked) {
      const ok = await pushEnable()
      push.value = ok ? 'on' : await pushState()
    } else {
      await pushDisable()
      push.value = 'off'
    }
  } catch (err) {
    notifications.push('error', err instanceof ApiError ? err.message : String(err))
    push.value = await pushState()
  } finally {
    pushBusy.value = false
    box.checked = push.value === 'on'
  }
}
async function testPush() {
  try {
    const { sent } = await api.pushTest()
    notifications.push(
      'info',
      sent ? `sent to ${sent} device${sent === 1 ? '' : 's'}` : 'no device is subscribed',
    )
  } catch (err) {
    notifications.push('error', err instanceof ApiError ? err.message : String(err))
  }
}
async function toggleNotifications(e: Event) {
  const box = e.target as HTMLInputElement
  await prefs.setDesktopNotifications(box.checked)
  permission.value = prefs.notificationPermission()
  box.checked = prefs.desktopNotifications // refused: the box goes back
}

function onDocClick(e: MouseEvent) {
  if (open.value && el.value && !el.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="el" class="relative">
    <button
      class="rounded px-2 py-1 text-base text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      title="Display settings"
      aria-label="Display settings"
      data-test="settings"
      @click="open = !open"
    >
      ⚙
    </button>
    <div
      v-if="open"
      class="absolute right-0 z-30 mt-1 w-56 rounded-md border border-slate-200 bg-white p-3 text-base shadow-lg dark:border-slate-700 dark:bg-slate-900"
      data-test="settings-menu"
    >
      <div
        class="mb-1 text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
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
        class="mb-1 text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
      >
        Font size
      </div>
      <div class="mb-3 flex items-center gap-2">
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
      <div
        class="mt-3 mb-1 text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
      >
        Notifications
      </div>
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="prefs.desktopNotifications"
          :disabled="permission === 'unsupported'"
          data-test="notify-toggle"
          @change="toggleNotifications($event)"
        />
        <span>Desktop notifications</span>
      </label>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400" data-test="notify-hint">
        {{
          permission === 'denied'
            ? 'Blocked by the browser; allow notifications for this site first.'
            : 'When an agent is ready or needs input and this page is not in front.'
        }}
      </p>
      <label class="mt-2 flex items-center gap-2">
        <input
          type="checkbox"
          :checked="push === 'on'"
          :disabled="push === 'unsupported' || push === 'blocked' || pushBusy"
          data-test="push-toggle"
          @change="togglePush($event)"
        />
        <span>Push to this device</span>
        <button
          v-if="push === 'on'"
          class="ml-auto text-sm text-blue-700 hover:underline dark:text-blue-300"
          data-test="push-test"
          @click="testPush"
        >
          send a test
        </button>
      </label>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400" data-test="push-hint">
        {{
          push === 'unsupported'
            ? 'Not available in this browser; on an iPhone, add the site to the home screen first.'
            : push === 'blocked'
              ? 'Blocked by the browser; allow notifications for this site first.'
              : 'The same, with the tab closed and the phone in a pocket: an agent needs your input, failed, or finished a turn you sent.'
        }}
      </p>
      <RouterLink
        :to="{ name: 'machine' }"
        class="mt-3 block text-sm text-blue-700 hover:underline dark:text-blue-300"
        title="account usage, the harness note, the models file, the method and framing, the learnings log"
        data-test="machine-link"
        @click="open = false"
        >This machine…</RouterLink
      >
      <RouterLink
        :to="{ name: 'users' }"
        class="mt-1 block text-sm text-blue-700 hover:underline dark:text-blue-300"
        data-test="users-link"
        @click="open = false"
        >Users…</RouterLink
      >
    </div>
  </div>
</template>
