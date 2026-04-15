<script setup>
/**
 * Toast.vue - 全局复用 Toast 提示框
 * 通过 Teleport 渲染到 body，z-index 最高
 *
 * Props:
 *   message:  提示文字
 *   type:     success | error | warning | info
 *   duration: 自动消失毫秒数（0=不自动消失）
 *   position: top | center | bottom
 */

const props = defineProps({
  message: { type: String, default: '' },
  type: { type: String, default: 'success' },
  duration: { type: Number, default: 3000 },
  position: { type: String, default: 'top' },
  onClose: { type: Function, default: null },
})

const TYPE_CONFIG = {
  success: { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e', color: '#4ade80', icon: '✅' },
  error:   { bg: 'rgba(239, 68, 68, 0.15)',  border: '#ef4444', color: '#f87171', icon: '❌' },
  warning: { bg: 'rgba(234, 179, 8, 0.15)',  border: '#eab308', color: '#facc15', icon: '⚠️' },
  info:    { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', color: '#60a5fa', icon: 'ℹ️' },
}

const config = TYPE_CONFIG[props.type] || TYPE_CONFIG.info

let timer = null

function close() {
  if (timer) clearTimeout(timer)
  props.onClose?.()
}

function startTimer() {
  if (props.duration > 0) {
    timer = setTimeout(close, props.duration)
  }
}

startTimer()
</script>

<template>
  <Teleport to="body">
    <Transition name="toast-fade">
      <div v-if="message" class="toast-overlay" :class="`toast-position-${position}`" @click="close">
        <div
          class="toast-box"
          :style="{ background: config.bg, borderColor: config.border, color: config.color }"
          @click.stop
        >
          <span class="toast-icon">{{ config.icon }}</span>
          <span class="toast-text">{{ message }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast-overlay {
  position: fixed;
  z-index: 99999;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.toast-position-top { top: 60px; }
.toast-position-center { top: 50%; transform: translateY(-50%); }
.toast-position-bottom { bottom: 80px; }

.toast-box {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border: 1px solid;
  border-radius: 12px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  max-width: 340px;
  min-width: 180px;
  animation: toast-slide-in 0.3s ease;
}

.toast-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.toast-text {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

.toast-close {
  background: none;
  border: none;
  font-size: 22px;
  color: inherit;
  opacity: 0.5;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  flex-shrink: 0;
  transition: opacity 0.2s;
}
.toast-close:hover { opacity: 1; }

@keyframes toast-slide-in {
  0% { transform: translateY(-20px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}

/* Transition */
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.3s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 移动端适配 */
@media (max-width: 480px) {
  .toast-box {
    max-width: calc(100vw - 32px);
    padding: 10px 16px;
  }
  .toast-text { font-size: 13px; }
}
</style>
