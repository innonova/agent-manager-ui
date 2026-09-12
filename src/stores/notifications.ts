import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Toast {
  id: number
  level: 'info' | 'error'
  text: string
}

export const useNotificationsStore = defineStore('notifications', () => {
  const toasts = ref<Toast[]>([])
  let next = 1

  function push(level: Toast['level'], text: string, ttlMs = 8000): void {
    const id = next++
    toasts.value.push({ id, level, text })
    setTimeout(() => dismiss(id), ttlMs)
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, push, dismiss }
})
