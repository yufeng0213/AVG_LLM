import { ref } from 'vue'

const DRAG_THRESHOLD = 5
const LONG_PRESS_DELAY = 500

export function useMascotDrag() {
  const isDragging = ref(false)
  const isMenuOpen = ref(false)

  let startX = 0
  let startY = 0
  let offsetX = 0
  let offsetY = 0
  let longPressTimer = null
  let hasDragged = false
  let onLongPressCallback = null
  let onPositionChange = null

  function onPointerDown(e, el, position) {
    if (e.button !== 0 && e.button !== undefined) return
    e.preventDefault()
    e.stopPropagation()

    startX = e.clientX
    startY = e.clientY
    offsetX = position.x
    offsetY = position.y
    hasDragged = false
    isDragging.value = false

    longPressTimer = setTimeout(() => {
      if (!hasDragged && onLongPressCallback) {
        isMenuOpen.value = true
        onLongPressCallback()
      }
    }, LONG_PRESS_DELAY)

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
  }

  function onPointerMove(e) {
    const dx = e.clientX - startX
    const dy = e.clientY - startY

    if (!hasDragged && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      hasDragged = true
      isDragging.value = true
      clearTimeout(longPressTimer)
      longPressTimer = null
    }

    if (hasDragged && onPositionChange) {
      e.preventDefault()
      onPositionChange({ x: offsetX + dx, y: offsetY + dy })
    }
  }

  function onPointerUp() {
    clearTimeout(longPressTimer)
    longPressTimer = null
    isDragging.value = false
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerup', onPointerUp)
  }

  function closeMenu() {
    isMenuOpen.value = false
  }

  function setCallbacks({ onLongPress, onPositionChanged }) {
    onLongPressCallback = onLongPress
    onPositionChange = onPositionChanged
  }

  function cleanup() {
    clearTimeout(longPressTimer)
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerup', onPointerUp)
  }

  return { isDragging, isMenuOpen, onPointerDown, closeMenu, setCallbacks, cleanup }
}
