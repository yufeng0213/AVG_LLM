<script setup>
defineProps({ modelValue: String })
defineEmits(['update:modelValue'])

const tabs = [
  { key: 'list', label: '主页', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
  { key: 'stats', label: '统计', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' },
  { key: 'settings', label: '我的', icon: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' },
]
</script>

<template>
  <nav class="todo-tab-bar">
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
.todo-tab-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 8px 0;
  padding-bottom: max(8px, env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid #e8e6f0;
  flex-shrink: 0;
}

.tab-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 4px 0;
  background: none;
  border: none;
  color: #c8c4d8;
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
  font-size: 11px;
  font-weight: 500;
}

.tab-btn.active {
  color: #9b8ec4;
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
