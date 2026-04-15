<script setup>
/**
 * 通用占位 App - 显示 "Coming Soon"
 */
const props = defineProps({
  icon: { type: String, default: '📱' },
  name: { type: String, default: '应用' },
})

const emit = defineEmits(['back'])
</script>

<template>
  <div class="phone-app">
    <div class="phone-app-header">
      <button type="button" class="phone-app-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <h2 class="phone-app-title">{{ name }}</h2>
      <div class="phone-app-header-spacer" />
    </div>
    <div class="phone-placeholder">
      <span class="placeholder-icon">{{ icon }}</span>
      <span class="placeholder-text">{{ name }}</span>
      <span class="placeholder-sub">Coming Soon</span>
    </div>
  </div>
</template>
