<script setup>
defineProps({ modelValue: String })
defineEmits(['update:modelValue'])

const tabs = [
  {
    key: 'store',
    label: '书城',
    icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>'
  },
  {
    key: 'shelf',
    label: '书架',
    icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="9" y1="6" x2="9" y2="15"/><line x1="14" y1="6" x2="14" y2="15"/></svg>'
  },
  {
    key: 'discover',
    label: '发现',
    icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>'
  },
  {
    key: 'mine',
    label: '我的',
    icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
  }
]
</script>

<template>
  <nav class="reader-tab-bar">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      :class="['tab-btn', { active: modelValue === tab.key }]"
      @click="$emit('update:modelValue', tab.key)"
    >
      <span class="tab-icon" v-html="tab.icon" />
      <span class="tab-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.reader-tab-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 6px 0;
  padding-bottom: max(6px, env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid #e8e0f0;
  flex-shrink: 0;
  z-index: 10;
}

.tab-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px 0;
  background: none;
  border: none;
  color: #b0a8c0;
  cursor: pointer;
  transition: color 0.2s;
  flex: 1;
}

.tab-btn .tab-icon {
  display: flex;
  line-height: 1;
}

.tab-btn .tab-icon :deep(svg) {
  width: 22px;
  height: 22px;
}

.tab-label {
  font-size: 10px;
  font-weight: 500;
}

.tab-btn.active {
  color: #7c5cbf;
}

.tab-btn.active .tab-icon :deep(svg) {
  stroke-width: 2.5;
}

.platform-android.android-portrait .tab-btn {
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  flex: 1 !important;
  font-size: 1.1rem !important;
  padding: 4px 0 !important;
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 8px !important;
  white-space: nowrap !important;
}
</style>
