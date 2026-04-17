<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useStarField } from './composables/useStarField.js'

const emit = defineEmits(['back'])

const containerRef = ref(null)
const starField = useStarField()
const showHint = ref(true)

onMounted(() => {
  if (containerRef.value) {
    starField.init(containerRef.value)
    starField.enableInteraction()
    setTimeout(() => { showHint.value = false }, 4000)
  }
})

onBeforeUnmount(() => {
  if (containerRef.value) {
    starField.dispose(containerRef.value)
  }
})

const handleClose = () => {
  emit('back')
}
</script>

<template>
  <div ref="containerRef" class="starry-sky">
    <!-- 返回按钮 -->
    <button type="button" class="sky-back-btn" @click="handleClose">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>

    <!-- 提示 -->
    <Transition name="hint-fade">
      <div v-if="showHint" class="sky-hint">
        <p>点击星球，靠近探索</p>
        <p class="hint-sub">再次点击空白处返回</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.starry-sky {
  position: fixed;
  inset: 0;
  z-index: 10000;
  overflow: hidden;
  background: #0c0e22;
}

.sky-back-btn {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(12, 14, 34, 0.6);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s;
}
.sky-back-btn:hover {
  background: rgba(12, 14, 34, 0.8);
  color: #fff;
}

.sky-hint {
  position: fixed;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10001;
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
  pointer-events: none;
}

.sky-hint p {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.05em;
}

.hint-sub {
  font-size: 0.8rem !important;
  color: rgba(255, 255, 255, 0.4) !important;
  margin-top: 6px !important;
}

.hint-fade-enter-active,
.hint-fade-leave-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}
.hint-fade-enter-from,
.hint-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

  .platform-android.android-portrait .sky-back-btn {
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
