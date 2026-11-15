import { onUnmounted, ref } from 'vue'

/**
 * A pane's width, dragged by a handle and remembered per pane in
 * localStorage. `start(e)` goes on the handle's pointerdown; the width
 * follows the pointer until it is released, within [min, max]. A pane
 * whose handle is on its left edge (`edge: 'left'`) grows as the pointer
 * moves left.
 */
export function useResizable(
  key: string,
  initial: number,
  min = 180,
  max = 720,
  edge: 'right' | 'left' = 'right',
) {
  const stored = Number(localStorage.getItem(`pane-width:${key}`))
  const width = ref(Number.isFinite(stored) && stored >= min && stored <= max ? stored : initial)
  let from = 0
  let startX = 0
  let dragging = false
  function onMove(e: PointerEvent) {
    if (!dragging) return
    const moved = e.clientX - startX
    width.value = Math.min(max, Math.max(min, from + (edge === 'left' ? -moved : moved)))
  }
  function onUp() {
    if (!dragging) return
    dragging = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    localStorage.setItem(`pane-width:${key}`, String(width.value))
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  function start(e: PointerEvent) {
    dragging = true
    from = width.value
    startX = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    e.preventDefault()
  }
  onUnmounted(onUp)
  return { width, start }
}
