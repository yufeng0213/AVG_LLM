<script setup>
/**
 * 日记生成中模态框组件
 * 显示日记生成进度和动画
 */

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  characterName: {
    type: String,
    default: '角色'
  },
  message: {
    type: String,
    default: '正在生成日记，请稍候...'
  }
})

const emit = defineEmits(['close'])

function handleClose() {
  emit('close')
}
</script>

<template>
  <Transition name="diary-generating-modal">
    <div v-if="isOpen" class="diary-generating-overlay" @click.self="handleClose">
      <div class="diary-generating-dialog">
        <div class="diary-generating-content">
          <!-- 动画图标 -->
          <div class="diary-generating-animation">
            <div class="writing-icon">
              <span class="pen">✍️</span>
              <span class="paper">📝</span>
            </div>
            <div class="loading-dots">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>

          <!-- 生成消息 -->
          <p class="diary-generating-message">{{ message || `正在为${characterName}生成今天的日记，请稍候...` }}</p>

          <!-- 进度条 -->
          <div class="diary-generating-progress">
            <div class="progress-bar">
              <div class="progress-fill"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.diary-generating-modal-enter-active {
  animation: modal-fade-in 0.3s ease;
}

.diary-generating-modal-leave-active {
  animation: modal-fade-out 0.3s ease;
}

@keyframes modal-fade-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes modal-fade-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.9);
  }
}

.diary-generating-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.diary-generating-dialog {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 16px;
  width: 90%;
  max-width: 360px;
  padding: 32px 24px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.diary-generating-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.diary-generating-animation {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.writing-icon {
  position: relative;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pen {
  font-size: 32px;
  position: absolute;
  animation: pen-writing 1.5s ease-in-out infinite;
  transform-origin: bottom right;
}

.paper {
  font-size: 40px;
  opacity: 0.8;
}

@keyframes pen-writing {
  0%, 100% {
    transform: rotate(-10deg) translate(0, 0);
  }
  25% {
    transform: rotate(5deg) translate(4px, -2px);
  }
  50% {
    transform: rotate(-5deg) translate(-2px, 2px);
  }
  75% {
    transform: rotate(8deg) translate(3px, -1px);
  }
}

.loading-dots {
  display: flex;
  gap: 8px;
}

.dot {
  width: 8px;
  height: 8px;
  background: #4fc3f7;
  border-radius: 50%;
  animation: dot-bounce 1.4s ease-in-out infinite;
}

.dot:nth-child(1) {
  animation-delay: 0s;
}

.dot:nth-child(2) {
  animation-delay: 0.2s;
}

.dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dot-bounce {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.diary-generating-message {
  color: #e0e0e0;
  font-size: 14px;
  text-align: center;
  margin: 0;
  line-height: 1.6;
}

.diary-generating-progress {
  width: 100%;
}

.progress-bar {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  width: 30%;
  background: linear-gradient(90deg, #4fc3f7, #29b6f6);
  border-radius: 2px;
  animation: progress-indeterminate 1.5s ease-in-out infinite;
}

@keyframes progress-indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
}
</style>
