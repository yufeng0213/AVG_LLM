<script setup>
import { onBeforeUnmount } from 'vue'
import Mascot from './Mascot.vue'

const emit = defineEmits(['back'])

function goBack() {
  emit('back')
}

onBeforeUnmount(() => {
  console.log('[MascotScreen] Leaving page')
})
</script>

<template>
  <div class="mascot-screen">
    <button class="mascot-back-btn" @click="goBack">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>

    <Mascot />
  </div>
</template>

<style scoped>
.mascot-screen {
  position: fixed;
  inset: 0;
  padding-bottom: var(--safe-area-inset-bottom, 0px);
  z-index: 10000;
  overflow: hidden;
  background: transparent;
  pointer-events: none;
}

.mascot-back-btn {
  position: fixed;
  top: max(16px, var(--safe-area-inset-top, 16px));
  left: 16px;
  z-index: 10002;
  pointer-events: auto;
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

.mascot-back-btn:hover {
  background: rgba(10, 12, 20, 0.8);
  color: #fff;
}

.platform-android.android-portrait .mascot-back-btn {
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
