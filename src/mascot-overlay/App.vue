<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { isElectron, isAndroid } from '../../src/utils/platform.js'
import { useMascotStorage } from '../../plugins/feature-mascot/src/composables/useMascotStorage.js'
import { useMascotSpeech } from '../../plugins/feature-mascot/src/composables/useMascotSpeech.js'

const { mascotState, loadGifDataUrl, resetPosition, toggleVisibility, persist: persistStorage } = useMascotStorage()
const { currentMessage, forceSpeech, start: startSpeech, stop: stopSpeech } = useMascotSpeech()

const gifDataUrl = ref('')
const isPetAnimating = ref(false)
const isDragging = ref(false)
let dragTarget = null // store the original element being dragged

const isElectronPlatform = isElectron()
const isAndroidPlatform = isAndroid()
// The overlay WebView is a plain Android WebView (not managed by Capacitor),
// so isAndroid() returns false. Use AndroidOverlay JS interface as detection.
const isOverlayPlatform = isAndroidPlatform || typeof window.AndroidOverlay !== 'undefined'

console.log('[MascotOverlay] isAndroidPlatform:', isAndroidPlatform)
console.log('[MascotOverlay] window.AndroidOverlay:', typeof window.AndroidOverlay)
console.log('[MascotOverlay] isOverlayPlatform:', isOverlayPlatform)

// === Drag state ===
const dragStart = ref(null)
let longPressTimer = null
let isMouseOverMascot = false

watch(() => mascotState.value.gifData?.id, async (newId) => {
  console.log('[MascotOverlay] gifData.id changed:', newId)
  // On Android overlay platform, load GIF directly from native JS interface
  if (isOverlayPlatform && window.AndroidOverlay && window.AndroidOverlay.getGifDataUrl) {
    const dataUrl = window.AndroidOverlay.getGifDataUrl()
    gifDataUrl.value = dataUrl || ''
    console.log('[MascotOverlay] AndroidOverlay.getGifDataUrl returned, length:', gifDataUrl.value.length)
    if (window.AndroidOverlay.logWeb) {
      window.AndroidOverlay.logWeb('gifLoaded', 'dataUrl length=' + gifDataUrl.value.length)
    }
  } else if (mascotState.value.gifData?.dataUrl) {
    gifDataUrl.value = mascotState.value.gifData.dataUrl
    console.log('[MascotOverlay] Using embedded dataUrl, length:', gifDataUrl.value.length)
  } else {
    gifDataUrl.value = await loadGifDataUrl() || ''
    console.log('[MascotOverlay] gifDataUrl resolved:', gifDataUrl.value ? `data URL length=${gifDataUrl.value.length}` : 'null/empty')
  }
}, { immediate: true })

// === Platform-specific interaction ===

function setIgnoreMouse(ignore) {
  if (window.mascotIPC && window.mascotIPC.setIgnoreMouse) {
    window.mascotIPC.setIgnoreMouse(ignore)
  }
}

function onGifLoad() {
  console.log('[MascotOverlay] GIF loaded successfully')
  if (window.AndroidOverlay && window.AndroidOverlay.logWeb) {
    window.AndroidOverlay.logWeb('gifLoad', 'success')
  }
}

function onGifError() {
  console.log('[MascotOverlay] GIF failed to load, dataUrl length:', gifDataUrl.value.length)
  if (window.AndroidOverlay && window.AndroidOverlay.logWeb) {
    window.AndroidOverlay.logWeb('gifLoad', 'error, dataUrl length=' + gifDataUrl.value.length)
  }
}

function onMouseEnter() {
  isMouseOverMascot = true
  setIgnoreMouse(false)
}

function onMouseLeave() {
  isMouseOverMascot = false
  if (!isDragging.value) {
    setIgnoreMouse(true)
  }
}

function onPointerDown(e) {
  if (e.button !== 0 && e.pointerType === 'mouse') return
  e.preventDefault()
  dragStart.value = {
    clientX: e.clientX,
    clientY: e.clientY,
    mascotX: mascotState.value.x,
    mascotY: mascotState.value.y,
  }
  longPressTimer = setTimeout(() => {
    console.log('[MascotOverlay] long press')
    longPressTimer = null
  }, 500)
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(e) {
  if (!dragStart.value) return
  const dpr = window.devicePixelRatio || 1
  const dx = (e.clientX - dragStart.value.clientX) * dpr
  const dy = (e.clientY - dragStart.value.clientY) * dpr
  if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
    isDragging.value = true
    const newX = Math.round(dragStart.value.mascotX + dx)
    const newY = Math.round(dragStart.value.mascotY + dy)
    mascotState.value.x = newX
    mascotState.value.y = newY
    persistStorage()
    // Android overlay: update native overlay position in real-time
    if (isOverlayPlatform && window.AndroidOverlay) {
      window.AndroidOverlay.updatePosition(newX, newY)
    }
  }
}

function onPointerUp() {
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
  const wasDragging = isDragging.value
  dragStart.value = null
  isDragging.value = false
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
  persistStorage()
  if (!wasDragging) {
    console.log('[MascotOverlay] click')
  }
  if (!isMouseOverMascot) {
    setIgnoreMouse(true)
  }
}

onMounted(() => {
  startSpeech()

  // Android overlay: expose global functions for native service to call
  if (isOverlayPlatform) {
    // Send diagnostic info to native
    if (window.AndroidOverlay && window.AndroidOverlay.logWeb) {
      window.AndroidOverlay.logWeb('mounted', 'overlay platform detected')
      window.AndroidOverlay.logWeb('dpr', String(window.devicePixelRatio))
      window.AndroidOverlay.logWeb('windowSize', window.innerWidth + 'x' + window.innerHeight)
    }

    window.__mascotStateUpdate__ = (state) => {
      console.log('[MascotOverlay] __mascotStateUpdate__ called with:', JSON.stringify(state))
      if (window.AndroidOverlay && window.AndroidOverlay.logWeb) {
        window.AndroidOverlay.logWeb('stateUpdate', JSON.stringify(state))
      }
      if (typeof state === 'string') state = JSON.parse(state)
      if (state.x !== undefined) mascotState.value.x = state.x
      if (state.y !== undefined) mascotState.value.y = state.y
      if (state.visible !== undefined) mascotState.value.visible = state.visible
      if (state.gifData) mascotState.value.gifData = state.gifData
      console.log('[MascotOverlay] mascotState after update:', mascotState.value.gifData?.id, mascotState.value.gifData?.name)
    }

    // Fetch state from native on mount (instead of waiting for injection)
    if (window.AndroidOverlay && window.AndroidOverlay.getDataFile) {
      try {
        const dataStr = window.AndroidOverlay.getDataFile()
        console.log('[MascotOverlay] getDataFile returned, length:', dataStr.length)
        if (window.AndroidOverlay.logWeb) {
          window.AndroidOverlay.logWeb('getDataFile', 'length=' + dataStr.length)
        }
        const data = JSON.parse(dataStr)
        if (data.x !== undefined) mascotState.value.x = data.x
        if (data.y !== undefined) mascotState.value.y = data.y
        if (data.visible !== undefined) mascotState.value.visible = data.visible
        if (data.gifData) mascotState.value.gifData = data.gifData
        console.log('[MascotOverlay] State loaded from native:', mascotState.value.gifData?.id)
      } catch (e) {
        console.warn('[MascotOverlay] Failed to parse native data:', e)
        if (window.AndroidOverlay && window.AndroidOverlay.logWeb) {
          window.AndroidOverlay.logWeb('getDataFile', 'error: ' + e.message)
        }
      }
    }

    window.__mascotCommand__ = (command, payload) => {
      if (typeof payload === 'string') payload = JSON.parse(payload)
      if (command === 'reset-position') resetPosition()
      else if (command === 'toggle-visibility') toggleVisibility()
      else if (command === 'force-speech') forceSpeech(payload?.text)
      else if (command === 'pet') {
        isPetAnimating.value = true
        forceSpeech('嘻嘻，好舒服~')
        setTimeout(() => { isPetAnimating.value = false }, 1000)
      }
    }
  }

  // Electron: listen for IPC messages
  if (isElectronPlatform && window.mascotIPC) {
    window.mascotIPC.onState((state) => {
      if (state.x !== undefined) mascotState.value.x = state.x
      if (state.y !== undefined) mascotState.value.y = state.y
      if (state.visible !== undefined) mascotState.value.visible = state.visible
      if (state.gifData) mascotState.value.gifData = state.gifData
    })

    window.mascotIPC.onCommand(({ command, payload }) => {
      if (command === 'reset-position') resetPosition()
      else if (command === 'toggle-visibility') toggleVisibility()
      else if (command === 'force-speech') forceSpeech(payload?.text)
      else if (command === 'pet') {
        isPetAnimating.value = true
        forceSpeech('嘻嘻，好舒服~')
        setTimeout(() => { isPetAnimating.value = false }, 1000)
      }
    })
  }
})

onBeforeUnmount(() => {
  stopSpeech()
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
})
</script>

<template>
  <div class="overlay-container" :class="{ 'platform-android': isOverlayPlatform }">
    <div
      v-show="mascotState.visible"
      class="mascot"
      :class="{
        'is-dragging': isDragging,
        'is-pet-animating': isPetAnimating,
        'platform-android': isOverlayPlatform,
      }"
      :style="isOverlayPlatform
        ? {}
        : { transform: `translate3d(${mascotState.x}px, ${mascotState.y}px, 0)` }"
      @pointerdown="onPointerDown"
      @mouseenter="onMouseEnter"
      @mouseleave="onMouseLeave"
    >
      <Transition name="bubble-fade">
        <div v-if="currentMessage" class="speech-bubble">
          <div class="bubble-content">{{ currentMessage }}</div>
          <div class="bubble-tail"></div>
        </div>
      </Transition>
      <img v-if="gifDataUrl" :src="gifDataUrl" class="mascot-gif" alt="mascot" draggable="false" @error="onGifError" @load="onGifLoad" />
      <div v-else class="mascot-placeholder">
        <span>?</span>
        <p>等待导入 GIF</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
}

/* Android: fill the overlay WebView (sized by native service) */
.overlay-container.platform-android {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.mascot {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10001;
  will-change: transform;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}

/* Android 竖屏下的安全区域 */
.mascot.platform-android {
  touch-action: none;
}

.mascot.is-dragging {
  cursor: grabbing;
  filter: brightness(1.05);
}

.mascot.is-pet-animating {
  animation: pet-bounce 0.3s ease 3;
}

.mascot-gif {
  display: block;
  width: 80px;
  height: 80px;
  object-fit: contain;
  pointer-events: none;
  -webkit-user-drag: none;
  user-select: none;
  -webkit-user-select: none;
}

.mascot-placeholder {
  width: 80px;
  height: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(4px);
  border: 2px dashed rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 24px;
  cursor: pointer;
}

.mascot-placeholder p {
  font-size: 11px;
  margin: 4px 0 0;
}

.speech-bubble {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 8px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 1;
}

.bubble-content {
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  padding: 8px 14px;
  font-size: 13px;
  color: #333;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  max-width: 200px;
  white-space: normal;
  text-align: center;
  line-height: 1.4;
}

.bubble-tail {
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid rgba(255, 255, 255, 0.92);
  margin: 0 auto;
}

.bubble-fade-enter-active,
.bubble-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.bubble-fade-enter-from,
.bubble-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(4px);
}

@keyframes pet-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
</style>
