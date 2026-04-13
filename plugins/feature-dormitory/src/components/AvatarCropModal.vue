<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close', 'confirm'])

const CROP_SIZE = 512 // 裁剪输出尺寸

const canvasRef = ref(null)
const imageRef = ref(null) // 原始 Image 对象
const imageSrc = ref('')

// 图片变换状态
const imageX = ref(0)
const imageY = ref(0)
const imageScale = ref(1)

// 触摸状态
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const lastPinchDist = ref(0)

// Canvas 视口尺寸
let canvasSize = 300 // 实际渲染的 canvas 区域大小（CSS px）

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      imageSrc.value = e.target.result
      const img = new Image()
      img.onload = () => {
        imageRef.value = img
        resetImagePosition()
        resolve()
      }
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

function resetImagePosition() {
  const img = imageRef.value
  if (!img) return

  // 计算初始缩放，让图片至少覆盖蒙版区域
  const minSide = Math.min(img.width, img.height)
  imageScale.value = CROP_SIZE / minSide

  // 居中
  imageX.value = (canvasSize - img.width * imageScale.value) / 2
  imageY.value = (canvasSize - img.height * imageScale.value) / 2
}

function drawCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const img = imageRef.value
  if (!img) return

  ctx.clearRect(0, 0, canvasSize, canvasSize)

  // 绘制图片
  ctx.drawImage(
    img,
    imageX.value,
    imageY.value,
    img.width * imageScale.value,
    img.height * imageScale.value,
  )

  // 绘制蒙版（蒙版外半透明遮罩）
  const centerX = canvasSize / 2
  const centerY = canvasSize / 2
  const radius = canvasSize / 2

  ctx.save()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  // 用 evenodd 规则：整个矩形减去圆形
  ctx.beginPath()
  ctx.rect(0, 0, canvasSize, canvasSize)
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true)
  ctx.fill('evenodd')

  // 圆形边框
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
}

function constrainPosition() {
  const img = imageRef.value
  if (!img) return

  const scaledW = img.width * imageScale.value
  const scaledH = img.height * imageScale.value
  const halfCrop = canvasSize / 2

  // 确保图片至少覆盖整个蒙版区域
  const minX = halfCrop - scaledW
  const maxX = halfCrop
  const minY = halfCrop - scaledH
  const maxY = halfCrop

  imageX.value = Math.max(minX, Math.min(maxX, imageX.value))
  imageY.value = Math.max(minY, Math.min(maxY, imageY.value))
}

function getPinchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

// ── 鼠标事件 ──

function onMouseDown(e) {
  isDragging.value = true
  dragStartX.value = e.clientX - imageX.value
  dragStartY.value = e.clientY - imageY.value
}

function onMouseMove(e) {
  if (!isDragging.value) return
  imageX.value = e.clientX - dragStartX.value
  imageY.value = e.clientY - dragStartY.value
  constrainPosition()
  drawCanvas()
}

function onMouseUp() {
  isDragging.value = false
}

function onWheel(e) {
  e.preventDefault()
  const img = imageRef.value
  if (!img) return

  const delta = e.deltaY > 0 ? 0.95 : 1.05
  const newScale = Math.max(0.1, Math.min(10, imageScale.value * delta))
  const scaleRatio = newScale / imageScale.value

  // 以鼠标位置为中心缩放
  const rect = canvasRef.value.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top

  imageX.value = mouseX - (mouseX - imageX.value) * scaleRatio
  imageY.value = mouseY - (mouseY - imageY.value) * scaleRatio
  imageScale.value = newScale

  constrainPosition()
  drawCanvas()
}

// ── 触摸事件 ──

function onTouchStart(e) {
  if (e.touches.length === 1) {
    isDragging.value = true
    dragStartX.value = e.touches[0].clientX - imageX.value
    dragStartY.value = e.touches[0].clientY - imageY.value
  } else if (e.touches.length === 2) {
    isDragging.value = false
    lastPinchDist.value = getPinchDistance(e.touches)
  }
}

function onTouchMove(e) {
  e.preventDefault()
  if (e.touches.length === 1 && isDragging.value) {
    imageX.value = e.touches[0].clientX - dragStartX.value
    imageY.value = e.touches[0].clientY - dragStartY.value
    constrainPosition()
    drawCanvas()
  } else if (e.touches.length === 2) {
    const dist = getPinchDistance(e.touches)
    if (lastPinchDist.value === 0) {
      lastPinchDist.value = dist
      return
    }
    const ratio = dist / lastPinchDist.value
    const newScale = Math.max(0.1, Math.min(10, imageScale.value * ratio))
    const scaleRatio = newScale / imageScale.value

    const rect = canvasRef.value.getBoundingClientRect()
    const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
    const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top

    imageX.value = centerX - (centerX - imageX.value) * scaleRatio
    imageY.value = centerY - (centerY - imageY.value) * scaleRatio
    imageScale.value = newScale

    lastPinchDist.value = dist
    constrainPosition()
    drawCanvas()
  }
}

function onTouchEnd() {
  isDragging.value = false
}

// ── 裁剪 ──

function handleConfirm() {
  const img = imageRef.value
  if (!img) return

  // 创建输出 canvas
  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = CROP_SIZE
  outputCanvas.height = CROP_SIZE
  const ctx = outputCanvas.getContext('2d')

  // 计算蒙版在原图上的对应区域
  // canvas 上蒙版区域是 (0,0) 到 (canvasSize, canvasSize)，即整个 canvas
  // 但实际蒙版是圆形的，我们先裁正方形，后续由 CSS 做圆形裁剪

  // 计算 canvas 坐标到原图坐标的映射
  const scaleToOriginal = 1 / imageScale.value
  const cropX = -imageX.value * scaleToOriginal
  const cropY = -imageY.value * scaleToOriginal
  const cropSize = canvasSize * scaleToOriginal

  ctx.drawImage(img, cropX, cropY, cropSize, cropSize, 0, 0, CROP_SIZE, CROP_SIZE)

  const dataUrl = outputCanvas.toDataURL('image/png')
  emit('confirm', dataUrl)
}

function handleClose() {
  emit('close')
}

// ── 生命周期 ──

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('resize', handleResize)
})

watch(() => props.isOpen, (val) => {
  if (val) {
    // 等待 DOM 渲染后获取 canvas 尺寸
    requestAnimationFrame(() => {
      const canvas = canvasRef.value
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        canvasSize = Math.round(rect.width)
        canvas.width = canvasSize
        canvas.height = canvasSize
        if (imageRef.value) {
          resetImagePosition()
          drawCanvas()
        }
      }
    })
  }
})

function handleResize() {
  const canvas = canvasRef.value
  if (canvas) {
    canvasSize = Math.round(canvas.getBoundingClientRect().width)
    canvas.width = canvasSize
    canvas.height = canvasSize
    drawCanvas()
  }
}

// 暴露方法供外部调用
defineExpose({ loadImage })
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="avatar-crop-overlay" @click.self="handleClose">
      <div class="avatar-crop-modal">
        <header class="avatar-crop-header">
          <button type="button" class="avatar-crop-cancel-btn" @click="handleClose">
            取消
          </button>
          <h3 class="avatar-crop-title">裁剪头像</h3>
          <button type="button" class="avatar-crop-confirm-btn" @click="handleConfirm">
            确认
          </button>
        </header>

        <div class="avatar-crop-body">
          <canvas
            ref="canvasRef"
            class="avatar-crop-canvas"
            @mousedown="onMouseDown"
            @wheel="onWheel"
            @touchstart.passive="onTouchStart"
            @touchmove.prevent="onTouchMove"
            @touchend="onTouchEnd"
          />
        </div>

        <p class="avatar-crop-hint">拖拽移动图片，双指/滚轮缩放</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.avatar-crop-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: 10002;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.avatar-crop-modal {
  background: #1a1a2e;
  border-radius: 16px;
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.avatar-crop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.avatar-crop-cancel-btn,
.avatar-crop-confirm-btn {
  padding: 6px 16px;
  border-radius: 16px;
  font-size: 14px;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
}

.avatar-crop-cancel-btn {
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
}

.avatar-crop-cancel-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.avatar-crop-confirm-btn {
  background: rgba(0, 212, 255, 0.15);
  color: rgba(0, 212, 255, 0.9);
  border: 1px solid rgba(0, 212, 255, 0.4);
}

.avatar-crop-confirm-btn:hover {
  background: rgba(0, 212, 255, 0.25);
}

.avatar-crop-title {
  color: #fff;
  font-size: 16px;
  font-weight: 500;
  margin: 0;
}

.avatar-crop-body {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.avatar-crop-canvas {
  width: min(300px, 80vw);
  height: min(300px, 80vw);
  border-radius: 50%;
  touch-action: none;
  cursor: move;
}

.avatar-crop-hint {
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  margin: 0;
  padding: 0 16px 14px;
}
</style>
