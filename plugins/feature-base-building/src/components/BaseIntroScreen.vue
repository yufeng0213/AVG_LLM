<script setup>
defineProps({
  worldBook: { type: Object, default: () => ({}) },
})
</script>

<template>
  <div class="base-intro">
    <div class="intro-animation">
      <div class="intro-icon">🏗️</div>
      <div class="intro-title">基地正在生成中...</div>
      <div class="intro-subtitle">LLM 正在根据世界书背景设计您的基地</div>
      <div v-if="worldBook?.title" class="intro-world">
        世界: {{ worldBook.title }}
      </div>
    </div>
    <div class="intro-dots">
      <span class="dot" />
      <span class="dot" />
      <span class="dot" />
    </div>
  </div>
</template>

<style scoped>
.base-intro {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.intro-animation {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.intro-icon {
  font-size: 64px;
  animation: bounce 2s ease-in-out infinite;
}

.intro-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.intro-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
}

.intro-world {
  font-size: 12px;
  color: #4a9eff;
  margin-top: 4px;
}

.intro-dots {
  display: flex;
  gap: 8px;
}

.dot {
  width: 8px;
  height: 8px;
  background: #4a9eff;
  border-radius: 50%;
  animation: dotPulse 1.5s ease-in-out infinite;
}

.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1.2); }
}
</style>
