<script setup>
/**
 * ScrapbookStickerItem.vue - 可拖拽、缩放、旋转的贴纸组件
 */
import { ref, computed } from 'vue'

const props = defineProps({
  sticker: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'remove'])

const isDragging = ref(false)
const isResizing = ref(false)
const isRotating = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const startPos = ref({ x: 0, y: 0 })
const startSize = ref({ w: 0, h: 0 })
const startRotation = ref(0)

const style = computed(() => ({
  left: props.sticker.x + 'px',
  top: props.sticker.y + 'px',
  width: props.sticker.width + 'px',
  height: props.sticker.height + 'px',
  transform: `rotate(${props.sticker.rotation}deg)`,
  zIndex: props.sticker.zIndex,
}))

function startDrag(e) {
  e.preventDefault()
  emit('select')
  isDragging.value = true
  const pos = getEventPos(e)
  const parent = document.querySelector('.a4-canvas')
  if (!parent) return
  const rect = parent.getBoundingClientRect()
  // Store the initial canvas-relative position of the sticker
  dragOffset.value = { x: pos.x - rect.left - props.sticker.x, y: pos.y - rect.top - props.sticker.y }

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  document.addEventListener('touchmove', onDrag, { passive: false })
  document.addEventListener('touchend', stopDrag)
}

function onDrag(e) {
  if (!isDragging.value) return
  e.preventDefault()
  const pos = getEventPos(e)
  const parent = document.querySelector('.a4-canvas')
  if (!parent) return
  const rect = parent.getBoundingClientRect()
  const x = pos.x - rect.left - dragOffset.value.x
  const y = pos.y - rect.top - dragOffset.value.y
  props.sticker.x = Math.max(0, Math.round(x))
  props.sticker.y = Math.max(0, Math.round(y))
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('touchmove', onDrag)
  document.removeEventListener('touchend', stopDrag)
}

function startResize(e) {
  e.preventDefault()
  e.stopPropagation()
  isResizing.value = true
  startPos.value = getEventPos(e)
  startSize.value = { w: props.sticker.width, h: props.sticker.height }

  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  document.addEventListener('touchmove', onResize, { passive: false })
  document.addEventListener('touchend', stopResize)
}

function onResize(e) {
  if (!isResizing.value) return
  e.preventDefault()
  const pos = getEventPos(e)
  const dx = pos.x - startPos.value.x
  const dy = pos.y - startPos.value.y
  const size = Math.max(30, Math.round(startSize.value.w + dx))
  props.sticker.width = size
  props.sticker.height = size
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  document.removeEventListener('touchmove', onResize)
  document.removeEventListener('touchend', stopResize)
}

function startRotate(e) {
  e.preventDefault()
  e.stopPropagation()
  isRotating.value = true
  startPos.value = getEventPos(e)
  startRotation.value = props.sticker.rotation

  document.addEventListener('mousemove', onRotate)
  document.addEventListener('mouseup', stopRotate)
  document.addEventListener('touchmove', onRotate, { passive: false })
  document.addEventListener('touchend', stopRotate)
}

function onRotate(e) {
  if (!isRotating.value) return
  e.preventDefault()
  const pos = getEventPos(e)
  const stickerEl = e.target.closest('.sticker-item')
  if (!stickerEl) return
  const rect = stickerEl.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const angle = Math.atan2(pos.y - cy, pos.x - cx) * (180 / Math.PI) + 90
  props.sticker.rotation = Math.round(angle)
}

function stopRotate() {
  isRotating.value = false
  document.removeEventListener('mousemove', onRotate)
  document.removeEventListener('mouseup', stopRotate)
  document.removeEventListener('touchmove', onRotate)
  document.removeEventListener('touchend', stopRotate)
}

function getEventPos(e) {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  if (e.changedTouches && e.changedTouches.length > 0) {
    return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
  }
  return { x: e.clientX, y: e.clientY }
}
</script>

<template>
  <div
    :class="['sticker-item', { selected }]"
    :style="style"
    @mousedown.stop="startDrag"
    @touchstart.stop="startDrag"
    @click.stop="emit('select')"
  >
    <img :src="sticker.src" class="sticker-img" draggable="false" alt="" />

    <!-- 控制手柄 -->
    <template v-if="selected">
      <div class="resize-handle" @mousedown.stop="startResize" @touchstart.stop="startResize"></div>
      <div class="rotate-handle" @mousedown.stop="startRotate" @touchstart.stop="startRotate">↻</div>
      <button class="sticker-remove-btn" @mousedown.stop @touchstart.stop @click.stop="emit('remove')">×</button>
    </template>
  </div>
</template>

<style scoped>
.sticker-item {
  position: absolute;
  cursor: move;
  user-select: none;
  touch-action: none;
  border: 2px solid transparent;
  border-radius: 4px;
  transition: border-color 0.15s;
}

.sticker-item.selected {
  border-color: #667eea;
}

.sticker-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.resize-handle {
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 14px;
  height: 14px;
  background: #667eea;
  border-radius: 50%;
  cursor: nwse-resize;
  border: 2px solid #fff;
}

.rotate-handle {
  position: absolute;
  top: -20px;
  right: -6px;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #667eea;
  cursor: grab;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  user-select: none;
}

.sticker-remove-btn {
  position: absolute;
  top: -10px;
  left: -10px;
  width: 20px;
  height: 20px;
  background: #ff4d4d;
  border: 2px solid #fff;
  border-radius: 50%;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;
}

.platform-android.android-portrait .sticker-remove-btn {
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  flex: none !important;
  font-size: 1.1rem !important;
  padding: 6px 10px !important;
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 8px !important;
  white-space: nowrap !important;
}
</style>
