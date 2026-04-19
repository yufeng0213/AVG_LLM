<template>
  <div class="mobius-scene" ref="containerRef">
    <!-- Back button -->
    <button class="mobius-back-btn" @click="goBack">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>

    <!-- Hint overlay -->
    <Transition name="hint-fade">
      <div v-if="showHint" class="mobius-hint">
        {{ hintText }}
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import useMobiusField from './composables/useMobiusField.js'

const emit = defineEmits(['back'])

const containerRef = ref(null)
const showHint = ref(true)
const hintText = ref('拖拽旋转 · 滚轮缩放')
const mobiusField = useMobiusField()

function goBack() {
  emit('back')
}

onMounted(() => {
  if (containerRef.value) {
    mobiusField.init(containerRef.value)
    mobiusField.enableInteraction()

    setTimeout(() => {
      showHint.value = false
    }, 4000)
  }
})

onBeforeUnmount(() => {
  if (containerRef.value) {
    mobiusField.dispose(containerRef.value)
  }
})
</script>

<style scoped>
.mobius-scene {
  position: fixed;
  inset: 0;
  padding-top: var(--safe-area-inset-top, 0px);
  padding-bottom: var(--safe-area-inset-bottom, 0px);
  z-index: 10000;
  overflow: hidden;
  background: #0a0c14;
}

.mobius-back-btn {
  position: fixed;
  top: max(16px, var(--safe-area-inset-top, 16px));
  left: 16px;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 12, 20, 0.6);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s;
}
.mobius-back-btn:hover {
  background: rgba(10, 12, 20, 0.8);
  color: #fff;
}

.mobius-hint {
  position: fixed;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10001;
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
  pointer-events: none;
}

.mobius-hint {
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

  .platform-android.android-portrait .mobius-back-btn {
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
