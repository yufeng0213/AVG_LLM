<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useBookPage } from './composables/useBookPage.js'

const emit = defineEmits(['back'])

const containerRef = ref(null)
const bookPage = useBookPage()
const showHint = ref(true)
const hintMode = ref('idle') // 'idle' | 'turned'

onMounted(() => {
  if (containerRef.value) {
    bookPage.init(containerRef.value)
    bookPage.enableInteraction()

    bookPage.on('page-turned', () => {
      hintMode.value = 'turned'
      showHint.value = true
      setTimeout(() => { showHint.value = false }, 1500)
    })

    setTimeout(() => { showHint.value = false }, 4000)
  }
})

onBeforeUnmount(() => {
  if (containerRef.value) {
    bookPage.dispose(containerRef.value)
  }
})

const handleClose = () => {
  emit('back')
}
</script>

<template>
  <div ref="containerRef" class="book-scene">
    <button type="button" class="book-back-btn" @click="handleClose">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>

    <Transition name="hint-fade">
      <div v-if="showHint" class="book-hint" :key="hintMode">
        <p v-if="hintMode === 'idle'">点击屏幕右侧向右翻，点击左侧向左翻</p>
        <p v-else>继续翻页...</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.book-scene {
  position: fixed;
  inset: 0;
  z-index: 10000;
  overflow: hidden;
  background: #1a1510;
}

.book-back-btn {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26, 21, 16, 0.6);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s;
}
.book-back-btn:hover {
  background: rgba(26, 21, 16, 0.8);
  color: #fff;
}

.book-hint {
  position: fixed;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10001;
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
  pointer-events: none;
}

.book-hint p {
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

  .platform-android.android-portrait .book-back-btn {
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
