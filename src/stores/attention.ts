import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useProjectsStore } from '@/stores/projects'

/**
 * What the tab shows when it is not being looked at: a count in the title
 * and a badge on the favicon. Counted: agents in error or waiting for
 * input or a permission, in every project, plus agents that finished a
 * turn while this tab was hidden ("ready", until the tab is looked at).
 */
export const useAttentionStore = defineStore('attention', () => {
  const projects = useProjectsStore()
  /** Agents that went idle after working while the tab was hidden. */
  const finishedAway = ref(new Set<string>())

  const needing = computed(() => {
    let n = 0
    for (const row of projects.rows) {
      const c = row.agentCounts
      n += (c.error ?? 0) + (c['waiting-input'] ?? 0) + (c['waiting-permission'] ?? 0)
    }
    return n
  })
  const count = computed(() => needing.value + finishedAway.value.size)

  function finished(agentId: string): void {
    if (!document.hidden) return
    finishedAway.value.add(agentId)
    finishedAway.value = new Set(finishedAway.value)
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && finishedAway.value.size) finishedAway.value = new Set()
  })

  // ---- rendering: title and favicon ----------------------------------------

  const BASE_TITLE = 'agent-manager'
  let baseIcon: HTMLImageElement | null = null
  function link(): HTMLLinkElement {
    let el = document.querySelector<HTMLLinkElement>('link#favicon-badge')
    if (!el) {
      el = document.createElement('link')
      el.id = 'favicon-badge'
      el.rel = 'icon'
      document.head.appendChild(el)
    }
    return el
  }

  function draw(n: number): void {
    document.title = n ? `(${n}) ${BASE_TITLE}` : BASE_TITLE
    if (!n) {
      document.querySelector('link#favicon-badge')?.remove()
      return
    }
    const render = () => {
      const size = 64
      const c = document.createElement('canvas')
      c.width = c.height = size
      const g = c.getContext('2d')
      if (!g || !baseIcon) return
      g.drawImage(baseIcon, 0, 0, size, size)
      const r = 20
      g.fillStyle = '#e4676b'
      g.beginPath()
      g.arc(size - r, r, r, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#fff'
      g.font = 'bold 26px ui-sans-serif, system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(n > 9 ? '9+' : String(n), size - r, r + 1)
      const el = link()
      el.type = 'image/png'
      el.href = c.toDataURL('image/png')
    }
    if (baseIcon?.complete) render()
    else {
      baseIcon = new Image()
      baseIcon.onload = render
      baseIcon.src = '/favicon.svg'
    }
  }

  watch(count, draw, { immediate: true })

  return { count, needing, finished, finishedAway }
})
