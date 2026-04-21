<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { isElectron, isAndroid } from '../../src/utils/platform.js'
import { useMascotStorage } from '../../plugins/feature-mascot/src/composables/useMascotStorage.js'
import { useMascotSpeech } from '../../plugins/feature-mascot/src/composables/useMascotSpeech.js'

const { mascotState, loadGifDataUrl, resetPosition, toggleVisibility, persist: persistStorage } = useMascotStorage()
const { currentMessage, forceSpeech, addMessage, start: startSpeech, stop: stopSpeech } = useMascotSpeech()

// GIF 相关
const gifDataUrl = ref('')
const gifImageRef = ref(null)

const isPetAnimating = ref(false)
const isDragging = ref(false)
const isMenuOpen = ref(false)
const showCustomText = ref(false)
const customText = ref('')
let dragTarget = null // store the original element being dragged

const isElectronPlatform = isElectron()
const isAndroidPlatform = isAndroid()
// The overlay WebView is a plain Android WebView (not managed by Capacitor),
// so isAndroid() returns false. Use AndroidOverlay JS interface as detection.
const isOverlayPlatform = isAndroidPlatform || typeof window.AndroidOverlay !== 'undefined'

console.log('[MascotOverlay] isAndroidPlatform:', isAndroidPlatform)
console.log('[MascotOverlay] window.AndroidOverlay:', typeof window.AndroidOverlay)
console.log('[MascotOverlay] isOverlayPlatform:', isOverlayPlatform)

// === 气泡高度动态计算 ===
const bubbleHeight = ref(0)
const bubbleWidth = ref(0)

// 计算气泡实际尺寸
function measureBubbleHeight() {
  console.log('[MascotOverlay] measureBubbleHeight called, isMenuOpen=', isMenuOpen.value)
  if (!isOverlayPlatform) return
  // 如果菜单打开，测量菜单尺寸
  if (isMenuOpen.value) {
    console.log('[MascotOverlay] menu is open, calling measureMenuSize instead')
    measureMenuSize()
    return
  }
  const bubbleEl = document.querySelector('.speech-bubble')
  console.log('[MascotOverlay] bubbleEl found:', bubbleEl ? 'yes' : 'no')
  if (bubbleEl) {
    const rect = bubbleEl.getBoundingClientRect()
    const height = Math.ceil(rect.height)
    const width = Math.ceil(rect.width)
    // 加上额外的安全边距
    const safeHeight = height + 10
    const safeWidth = width + 20

    console.log('[MascotOverlay] Bubble rect: height=' + height + ', width=' + width + ' (safe: ' + safeHeight + 'x' + safeWidth + ')')
    if (safeHeight !== bubbleHeight.value || safeWidth !== bubbleWidth.value) {
      bubbleHeight.value = safeHeight
      bubbleWidth.value = safeWidth
      // 通知 native 更新窗口大小
      if (window.AndroidOverlay && window.AndroidOverlay.updateBubbleSize) {
        const dpr = window.devicePixelRatio || 1
        const physicalHeight = Math.round(safeHeight * dpr)
        const physicalWidth = Math.round(safeWidth * dpr)
        console.log('[MascotOverlay] Calling updateBubbleSize(' + physicalWidth + ', ' + physicalHeight + ')')
        window.AndroidOverlay.updateBubbleSize(physicalWidth, physicalHeight)
        if (window.AndroidOverlay.logWeb) {
          window.AndroidOverlay.logWeb('bubbleSize', 'physical=' + physicalWidth + 'x' + physicalHeight)
        }
      }
    } else {
      console.log('[MascotOverlay] Bubble size unchanged, skipping update')
    }
  } else {
    // 没有气泡时，窗口只覆盖 mascot 区域（高度为0表示只有 mascot）
    console.log('[MascotOverlay] No bubble, resetting to mascot-only size (0, 0)')
    bubbleHeight.value = 0
    bubbleWidth.value = 80
    if (window.AndroidOverlay && window.AndroidOverlay.updateBubbleSize) {
      console.log('[MascotOverlay] Calling updateBubbleSize(0, 0)')
      window.AndroidOverlay.updateBubbleSize(0, 0)
      if (window.AndroidOverlay.logWeb) {
        window.AndroidOverlay.logWeb('bubbleSize', 'physical=0x0 (mascot only)')
      }
    }
  }
}

// 监听气泡内容变化，重新测量高度
watch(currentMessage, async (msg) => {
  if (!isOverlayPlatform) return
  // 等待 Vue DOM 更新
  await nextTick()
  // 立即测量（无动画）
  measureBubbleHeight()
}, { immediate: true })

// 监听菜单打开状态，调整窗口大小
watch(isMenuOpen, async (open) => {
  if (!isOverlayPlatform) return
  await nextTick()

  setTimeout(() => {
    if (open) {
      measureMenuSize()
    } else {
      // 菜单关闭时，恢复为气泡/mascot尺寸
      const bubbleEl = document.querySelector('.speech-bubble')
      if (bubbleEl) {
        const rect = bubbleEl.getBoundingClientRect()
        const height = Math.ceil(rect.height) + 10
        const width = Math.ceil(rect.width) + 20
        bubbleHeight.value = height
        bubbleWidth.value = width
        const dpr = window.devicePixelRatio || 1
        if (window.AndroidOverlay && window.AndroidOverlay.updateBubbleSize) {
          window.AndroidOverlay.updateBubbleSize(Math.round(width * dpr), Math.round(height * dpr))
        }
      } else {
        bubbleHeight.value = 0
        bubbleWidth.value = 80
        if (window.AndroidOverlay && window.AndroidOverlay.updateBubbleSize) {
          window.AndroidOverlay.updateBubbleSize(0, 0)
        }
      }
    }

    // 等布局稳定后再显示窗口
    setTimeout(() => {
      if (window.AndroidOverlay && window.AndroidOverlay.setAlpha) {
        window.AndroidOverlay.setAlpha(1)
      }
      // 菜单关闭后恢复为非焦点状态
      if (!isMenuOpen.value && window.AndroidOverlay && window.AndroidOverlay.setFocusable) {
        window.AndroidOverlay.setFocusable(false)
      }
    }, 50)
  }, 100)
})

// 测量菜单尺寸并通知 native
function measureMenuSize() {
  if (!isOverlayPlatform) return
  console.log('[MascotOverlay] measureMenuSize called, timestamp=' + Date.now())
  const menuEl = document.querySelector('.mascot-menu')
  console.log('[MascotOverlay] menuEl found:', menuEl ? 'yes' : 'no')
  if (menuEl) {
    const rect = menuEl.getBoundingClientRect()
    console.log('[MascotOverlay] menuEl rect: top=' + rect.top + ', bottom=' + rect.bottom + ', left=' + rect.left + ', right=' + rect.right)
    const width = Math.ceil(rect.width) + 40
    const height = Math.ceil(rect.height) + 80 // 加上 mascot 高度

    console.log('[MascotOverlay] Menu measured: ' + width + 'x' + height + ', timestamp=' + Date.now())
    if (window.AndroidOverlay && window.AndroidOverlay.updateBubbleSize) {
      const dpr = window.devicePixelRatio || 1
      const physicalWidth = Math.round(width * dpr)
      const physicalHeight = Math.round(height * dpr)
      console.log('[MascotOverlay] Calling updateBubbleSize(' + physicalWidth + ', ' + physicalHeight + ') for menu')
      window.AndroidOverlay.updateBubbleSize(Math.round(width * dpr), Math.round(height * dpr))
    }
  }
}

// === Drag state ===
const dragStart = ref(null)
let longPressTimer = null
let isMouseOverMascot = false

// === GIF 管理 ===
// 加载 GIF 数据
watch(() => mascotState.value.gifData?.id, async (newId) => {
  console.log('[MascotOverlay] gifData.id changed:', newId)
  // On Android overlay platform, load GIF data from native JS interface
  if (isOverlayPlatform && window.AndroidOverlay && window.AndroidOverlay.getGifData) {
    const base64Data = window.AndroidOverlay.getGifData()
    if (base64Data) {
      gifDataUrl.value = `data:image/gif;base64,${base64Data}`
      console.log('[MascotOverlay] GIF data loaded from native, size:', base64Data.length)
    }
  } else {
    gifDataUrl.value = await loadGifDataUrl() || ''
    console.log('[MascotOverlay] GIF loaded from storage:', gifDataUrl.value ? 'success' : 'empty')
  }
}, { immediate: true })

// === Platform-specific interaction ===

function setIgnoreMouse(ignore) {
  if (window.mascotIPC && window.mascotIPC.setIgnoreMouse) {
    window.mascotIPC.setIgnoreMouse(ignore)
  }
}

function onGifReady() {
  console.log('[MascotOverlay] GIF loaded')
  if (window.AndroidOverlay && window.AndroidOverlay.logWeb) {
    window.AndroidOverlay.logWeb('gifReady', 'success')
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
  // Android overlay 使用屏幕坐标，其他平台使用窗口坐标
  const startX = isOverlayPlatform ? e.screenX : e.clientX
  const startY = isOverlayPlatform ? e.screenY : e.clientY
  dragStart.value = {
    startX: startX,
    startY: startY,
    mascotX: mascotState.value.x,
    mascotY: mascotState.value.y,
  }
  longPressTimer = setTimeout(() => {
    // 长按触发时，先隐藏窗口避免闪烁
    if (isOverlayPlatform && window.AndroidOverlay && window.AndroidOverlay.setAlpha) {
      window.AndroidOverlay.setAlpha(0)
    }
    isMenuOpen.value = true
    longPressTimer = null
  }, 500)
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(e) {
  if (!dragStart.value) return
  // Android overlay 使用屏幕坐标，其他平台使用窗口坐标
  const currentX = isOverlayPlatform ? e.screenX : e.clientX
  const currentY = isOverlayPlatform ? e.screenY : e.clientY
  // CSS 像素单位的位移
  const cssDx = currentX - dragStart.value.startX
  const cssDy = currentY - dragStart.value.startY
  if (Math.abs(cssDx) > 5 || Math.abs(cssDy) > 5) {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
    isDragging.value = true
    // mascotState 使用 CSS 像素
    const newCssX = Math.round(dragStart.value.mascotX + cssDx)
    const newCssY = Math.round(dragStart.value.mascotY + cssDy)
    mascotState.value.x = newCssX
    mascotState.value.y = newCssY
    persistStorage()
    // Android overlay: 通知 native 更新窗口位置
    if (isOverlayPlatform && window.AndroidOverlay) {
      const dpr = window.devicePixelRatio || 1
      const physicalX = Math.round(newCssX * dpr)
      const physicalY = Math.round(newCssY * dpr)
      console.log('[MascotOverlay] updatePosition: physical(' + physicalX + ', ' + physicalY + ')')
      window.AndroidOverlay.updatePosition(physicalX, physicalY)
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

// === Menu actions ===
function closeMenu() {
  // 先隐藏窗口避免闪烁
  if (isOverlayPlatform && window.AndroidOverlay && window.AndroidOverlay.setAlpha) {
    window.AndroidOverlay.setAlpha(0)
  }
  isMenuOpen.value = false
  showCustomText.value = false
  // 菜单关闭后恢复窗口为非焦点状态（在 watch 里延迟显示后调用）
}

function handlePet() {
  isPetAnimating.value = true
  forceSpeech('嘻嘻，好舒服~')
  setTimeout(() => { isPetAnimating.value = false }, 1000)
  closeMenu()
}

function handleForceSpeech() {
  forceSpeech()
  closeMenu()
}

function handleCustomText() {
  if (customText.value.trim()) {
    addMessage(customText.value.trim())
    forceSpeech(customText.value.trim())
    customText.value = ''
  }
  showCustomText.value = false
}

function handleResetPosition() {
  resetPosition()
  // 通知 native 更新位置
  if (isOverlayPlatform && window.AndroidOverlay) {
    const dpr = window.devicePixelRatio || 1
    window.AndroidOverlay.updatePosition(0, 0)
  }
  closeMenu()
}

function handleToggleVisibility() {
  toggleVisibility()
  closeMenu()
}

const menuItems = [
  { icon: '🤚', label: '抚摸', action: 'pet' },
  { icon: '💬', label: '说话', action: 'force-speech' },
  { icon: '🖼️', label: '更换 GIF', action: 'change-gif' },
  { icon: '📍', label: '重置位置', action: 'reset-position' },
  { icon: '👁️', label: '显示/隐藏', action: 'toggle-visibility' },
]

// 文件选择器引用
const gifFileInputRef = ref(null)

function handleMenuClick(action) {
  if (action === 'custom-text') {
    showCustomText.value = !showCustomText.value
    // 显示/隐藏自定义输入框时重新测量菜单尺寸
    if (isOverlayPlatform) {
      setTimeout(measureMenuSize, 100)
    }
    // 如果显示输入框，通知 native 窗口需要接收键盘输入
    if (showCustomText.value && window.AndroidOverlay && window.AndroidOverlay.setFocusable) {
      window.AndroidOverlay.setFocusable(true)
    }
  } else if (action === 'pet') {
    handlePet()
  } else if (action === 'force-speech') {
    handleForceSpeech()
  } else if (action === 'reset-position') {
    handleResetPosition()
  } else if (action === 'toggle-visibility') {
    handleToggleVisibility()
  } else if (action === 'change-gif') {
    handleChangeGif()
  }
}

// 触发 GIF 文件选择
function handleChangeGif() {
  console.log('[MascotOverlay] handleChangeGif called')
  // Android overlay 平台使用 native 文件选择器
  if (isOverlayPlatform && window.AndroidOverlay && window.AndroidOverlay.openGifFileChooser) {
    window.AndroidOverlay.openGifFileChooser()
  } else if (gifFileInputRef.value) {
    // 其他平台使用 HTML input
    gifFileInputRef.value.click()
  }
}

// 处理 GIF 文件选择（用于非 Android overlay 平台）
async function handleGifFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return

  const fileName = file.name.toLowerCase()
  if (!fileName.endsWith('.gif')) {
    alert('仅支持 GIF 格式')
    e.target.value = ''
    return
  }

  console.log('[MascotOverlay] Importing GIF:', file.name, 'size:', file.size)

  try {
    // 读取 GIF 文件为 base64 data URL
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    })

    gifDataUrl.value = dataUrl

    // 更新 mascotState
    mascotState.value.gifData = {
      id: 'gif_' + Date.now(),
      name: file.name.replace(/\.gif$/i, ''),
      data: dataUrl,
      createdAt: Date.now(),
    }
    persistStorage()

    console.log('[MascotOverlay] GIF imported successfully')
    closeMenu()
  } catch (err) {
    console.error('[MascotOverlay] Failed to import GIF:', err)
    alert(err.message || '导入失败')
  }

  e.target.value = ''
}

// 输入框失焦时恢复窗口为非焦点状态
function onCustomInputBlur() {
  if (isOverlayPlatform && window.AndroidOverlay && window.AndroidOverlay.setFocusable) {
    window.AndroidOverlay.setFocusable(false)
  }
}

// 输入框聚焦时确保窗口可接收键盘输入
function onCustomInputFocus() {
  if (isOverlayPlatform && window.AndroidOverlay && window.AndroidOverlay.setFocusable) {
    window.AndroidOverlay.setFocusable(true)
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
      // 只更新 visible 和 gifData，位置由 native 窗口管理
      if (state.visible !== undefined) mascotState.value.visible = state.visible
      if (state.gifData) mascotState.value.gifData = state.gifData
    }

    // Fetch state from native on mount
    if (window.AndroidOverlay && window.AndroidOverlay.getDataFile) {
      try {
        const dataStr = window.AndroidOverlay.getDataFile()
        console.log('[MascotOverlay] getDataFile returned, length:', dataStr.length)
        if (window.AndroidOverlay.logWeb) {
          window.AndroidOverlay.logWeb('getDataFile', 'length=' + dataStr.length)
        }
        const data = JSON.parse(dataStr)
        // 只加载 visible 和 gifData，位置由 native 窗口管理
        const dpr = window.devicePixelRatio || 1
        if (data.x !== undefined) mascotState.value.x = Math.round(data.x / dpr)
        if (data.y !== undefined) mascotState.value.y = Math.round(data.y / dpr)
        if (data.visible !== undefined) mascotState.value.visible = data.visible
        if (data.gifData) mascotState.value.gifData = data.gifData
        console.log('[MascotOverlay] State loaded from native: gifId=' + mascotState.value.gifData?.id)
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

    // 接收 native 端传来的 GIF 动画更新
    window.__mascotUpdated__ = (data) => {
      console.log('[MascotOverlay] __mascotUpdated__ received:', data?.fileName)
      if (window.AndroidOverlay && window.AndroidOverlay.logWeb) {
        window.AndroidOverlay.logWeb('mascotUpdated', 'fileName=' + data?.fileName)
      }
      if (data && data.gifBase64) {
        try {
          const dataUrl = `data:image/gif;base64,${data.gifBase64}`
          gifDataUrl.value = dataUrl

          // 更新 mascotState
          mascotState.value.gifData = {
            id: 'gif_' + Date.now(),
            name: data.fileName || 'mascot',
            data: dataUrl,
            createdAt: Date.now(),
          }
          persistStorage()
          console.log('[MascotOverlay] GIF animation updated successfully')
          closeMenu()
        } catch (e) {
          console.error('[MascotOverlay] Failed to process GIF data:', e)
        }
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
        <div v-if="currentMessage && !isMenuOpen" class="speech-bubble">
          <div class="bubble-content">{{ currentMessage }}</div>
          <div class="bubble-tail"></div>
        </div>
      </Transition>

      <!-- GIF 图片 -->
      <img
        v-if="gifDataUrl"
        ref="gifImageRef"
        :src="gifDataUrl"
        class="mascot-gif"
        alt="mascot"
        draggable="false"
        @load="onGifReady"
      />

      <!-- 无 GIF 时的占位符 -->
      <div v-if="!gifDataUrl" class="mascot-placeholder">
        <span>?</span>
        <p>点击导入 GIF</p>
      </div>
    </div>

    <!-- 交互菜单（在 overlay-container 层级，独立的 pointer-events） -->
    <Transition name="menu-fade">
      <div v-if="isMenuOpen" class="mascot-menu-overlay">
        <div class="mascot-menu" @click.stop>
          <button
            v-for="item in menuItems"
            :key="item.action"
            class="menu-item"
            @click="handleMenuClick(item.action)"
          >
            <span class="menu-item-icon">{{ item.icon }}</span>
            <span class="menu-item-label">{{ item.label }}</span>
          </button>

          <button class="menu-item" @click="handleMenuClick('custom-text')">
            <span class="menu-item-icon">✏️</span>
            <span class="menu-item-label">自定义</span>
          </button>

          <div v-if="showCustomText" class="custom-text-row">
            <input
              v-model="customText"
              class="custom-text-input"
              placeholder="输入想说的话..."
              @focus="onCustomInputFocus"
              @blur="onCustomInputBlur"
              @keyup.enter="handleCustomText"
            />
            <button class="custom-text-send" @click="handleCustomText">发送</button>
          </div>

          <!-- 隐藏的 GIF 文件选择器 -->
          <input
            ref="gifFileInputRef"
            type="file"
            accept=".gif,image/gif"
            class="file-input-hidden"
            @change="handleGifFileChange"
          />

          <button class="menu-close" @click="closeMenu">关闭</button>
        </div>
      </div>
    </Transition>
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
  /* 不裁剪内容，让气泡完整显示 */
  overflow: visible;
  /* 让透明区域穿透触摸事件 */
  pointer-events: none;
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

/* Android: mascot 在窗口底部 */
.mascot.platform-android {
  position: absolute;
  bottom: 0;
  left: 50%;
  top: auto;
  width: 80px;
  height: 80px;
  transform: translateX(-50%);
  touch-action: none;
  pointer-events: auto;
  /* 优化 WebView resize 时的渲染 */
  will-change: transform;
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
  padding: 6px 16px;
  font-size: 13px;
  color: #333;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  min-width: 120px;
  max-width: 600px;
  white-space: normal;
  text-align: center;
  line-height: 1.3;
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

/* === 交互菜单样式 === */
.mascot-menu-overlay {
  position: absolute;
  /* 默认定位：相对于 overlay-container 的顶部 */
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  background: transparent;
  z-index: 20000;
  pointer-events: auto;
}

/* Android 平台：菜单定位在 mascot 上方 */
.overlay-container.platform-android .mascot-menu-overlay {
  top: auto;
  bottom: 88px; /* mascot height (80px) + margin (8px) */
  margin-top: 0;
}

.mascot-menu {
  background: #fff;
  border-radius: 16px;
  padding: 12px 0;
  min-width: 200px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  pointer-events: auto;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 20px;
  border: none;
  background: transparent;
  font-size: 15px;
  color: #333;
  cursor: pointer;
  transition: background 0.15s;
  pointer-events: auto;
}

.menu-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.menu-item:active {
  background: rgba(0, 0, 0, 0.08);
}

.menu-item-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
}

.menu-item-label {
  flex: 1;
}

.custom-text-row {
  display: flex;
  gap: 8px;
  padding: 8px 20px 12px;
  pointer-events: auto;
}

.custom-text-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  pointer-events: auto;
}

.custom-text-input:focus {
  border-color: #4a9eff;
}

.custom-text-send {
  padding: 8px 16px;
  background: #4a9eff;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  pointer-events: auto;
}

.custom-text-send:hover {
  background: #3a8eef;
}

.menu-close {
  display: block;
  width: 100%;
  padding: 10px 20px;
  border: none;
  border-top: 1px solid #eee;
  background: transparent;
  font-size: 14px;
  color: #999;
  cursor: pointer;
  pointer-events: auto;
}

.menu-close:hover {
  color: #666;
  background: rgba(0, 0, 0, 0.02);
}

.menu-fade-enter-active,
.menu-fade-leave-active {
  /* 去掉动画，让菜单立即显示/隐藏 */
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  /* 不需要过渡状态 */
}
.file-input-hidden {
  display: none;
}
</style>
