<script setup>
/**
 * 状态面板组件
 * 显示角色状态信息（心情、体力、好感度等）
 */

const props = defineProps({
  characterData: {
    type: Object,
    default: null
  },
  statusData: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['close'])

function handleClose() {
  emit('close')
}

function getStatusLabel(statusKey) {
  const labels = {
    mood: '心情',
    energy: '体力',
    affection: '好感度',
    stress: '压力'
  }
  return labels[statusKey] || statusKey
}

function getStatusColor(value, key) {
  if (key === 'mood') {
    if (value >= 80) return '#4caf50'
    if (value >= 50) return '#ff9800'
    return '#f44336'
  }
  if (key === 'energy') {
    if (value >= 60) return '#2196f3'
    if (value >= 30) return '#ff9800'
    return '#f44336'
  }
  if (key === 'affection') {
    if (value >= 80) return '#e91e63'
    if (value >= 50) return '#ff5722'
    return '#9e9e9e'
  }
  return '#666'
}
</script>

<template>
  <section class="status-panel">
    <header class="panel-header">
      <h3>状态</h3>
      <button class="close-btn" @click="handleClose">✕</button>
    </header>

    <div class="status-content" v-if="characterData || statusData">
      <div class="character-summary" v-if="characterData">
        <div class="character-avatar">
          <img :src="characterData.portrait || ''" alt="角色头像" v-if="characterData.portrait" />
          <span v-else>👤</span>
        </div>
        <div class="character-name">{{ characterData.name || '未知角色' }}</div>
      </div>

      <div class="status-list">
        <div
          v-for="(value, key) in statusData"
          :key="key"
          class="status-item"
        >
          <div class="status-label">{{ getStatusLabel(key) }}</div>
          <div class="status-bar-container">
            <div class="status-bar">
              <div
                class="status-bar-fill"
                :style="{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: getStatusColor(value, key) }"
              ></div>
            </div>
            <span class="status-value">{{ value }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty-status">
      <p>暂无状态信息</p>
    </div>
  </section>
</template>

<style scoped>
.status-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e0e0e0;
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #666;
  padding: 4px 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 28px;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:hover {
  color: #333;
  background: rgba(0, 0, 0, 0.06);
}

.status-content {
  flex: 1;
  overflow-y: auto;
}

.character-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
}

.character-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e0e0e0;
  font-size: 24px;
}

.character-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.character-name {
  font-size: 16px;
  font-weight: 500;
  color: #333;
}

.status-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-label {
  font-size: 14px;
  color: #666;
}

.status-bar-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-bar {
  flex: 1;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.status-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease, background-color 0.3s ease;
}

.status-value {
  font-size: 12px;
  color: #666;
  min-width: 30px;
  text-align: right;
}

.empty-status {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
}

/* Android竖屏适配 */
.platform-android.android-portrait .close-btn {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  font-size: 1.2rem !important;
  padding: 0 !important;
  flex-shrink: 0 !important;
  box-sizing: border-box !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 50% !important;
}
</style>
