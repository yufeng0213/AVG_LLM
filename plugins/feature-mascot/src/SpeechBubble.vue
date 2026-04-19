<script setup>
defineProps({ message: { type: String, default: '' } })
</script>

<template>
  <Transition name="bubble-fade">
    <div v-if="message" class="speech-bubble">
      <div class="bubble-content">{{ message }}</div>
      <div class="bubble-tail"></div>
    </div>
  </Transition>
</template>

<style scoped>
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
</style>
