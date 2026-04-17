<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoseField } from './composables/useRoseField.js'

const emit = defineEmits(['back'])

const containerRef = ref(null)
const roseField = useRoseField()
const showHint = ref(true)
const hintMode = ref('idle') // 'idle' | 'petal_fly'

onMounted(() => {
  if (containerRef.value) {
    roseField.init(containerRef.value)
    roseField.enableInteraction()

    roseField.on('petal-flew', () => {
      hintMode.value = 'petal_fly'
      showHint.value = true
    })
    roseField.on('petal-returned', () => {
      hintMode.value = 'idle'
      showHint.value = true
    })

    setTimeout(() => { showHint.value = false }, 4000)
  }
})

onBeforeUnmount(() => {
  if (containerRef.value) {
    roseField.dispose(containerRef.value)
  }
})

const handleClose = () => {
  emit('back')
}
</script>

<template>
  <div ref="containerRef" class="rose-scene">
    <button type="button" class="rose-back-btn" @click="handleClose">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>

    <Transition name="hint-fade">
      <div v-if="showHint" class="rose-hint" :key="hintMode">
        <p v-if="hintMode === 'idle'">点击玫瑰，让花瓣飞到面前</p>
        <p v-else>点击空白处，花瓣将回到玫瑰</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.rose-scene {
  position: fixed;
  inset: 0;
  z-index: 10000;
  overflow: hidden;
  background: #0c0e12;
}

.rose-back-btn {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(12, 14, 18, 0.6);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s;
}
.rose-back-btn:hover {
  background: rgba(12, 14, 18, 0.8);
  color: #fff;
}

.rose-hint {
  position: fixed;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10001;
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
  pointer-events: none;
}

.rose-hint p {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.05em;
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

  .platform-android.android-portrait .rose-back-btn {
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
