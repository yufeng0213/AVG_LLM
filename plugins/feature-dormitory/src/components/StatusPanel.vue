<script setup>
/**
 * 状态面板组件
 * 显示角色状态信息（好感度、体力、心情等）
 * 数据来源于世界书角色数据库（characterData.raw.relationshipBase）
 */
import { computed } from 'vue'

const props = defineProps({
  characterData: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close'])

function handleClose() {
  emit('close')
}

// 从角色数据库读取状态
const statusMetrics = computed(() => {
  const raw = props.characterData?.raw || props.characterData
  const rel = raw?.relationshipBase || {}
  const favor = Number.parseFloat(String(rel.favor ?? 0))
  const trust = Number.parseFloat(String(rel.trust ?? 50))
  const stance = Number.parseFloat(String(rel.stance ?? 0))

  // favor: -100~100 → 映射为 0~100
  const affinity = Math.round((favor + 100) / 2)
  // trust: 0~100 直接使用
  const energy = Math.round(Math.min(100, Math.max(0, trust)))
  // stance: -100~100 → 映射为 0~100（压力/对立程度）
  const stress = Math.round((stance + 100) / 2)

  return [
    {
      key: 'affection',
      label: '好感度',
      value: Math.min(100, Math.max(0, affinity)),
    },
    {
      key: 'energy',
      label: '体力',
      value: energy,
    },
    {
      key: 'stress',
      label: '压力',
      value: Math.min(100, Math.max(0, stress)),
    },
  ]
})

function getStatusEmoji(metric) {
  const { key, value } = metric
  if (key === 'affection') {
    if (value >= 80) return '💕'
    if (value >= 50) return '💛'
    return '🤍'
  }
  if (key === 'energy') {
    if (value >= 60) return '⚡'
    if (value >= 30) return '🔋'
    return '💤'
  }
  if (key === 'stress') {
    if (value >= 80) return '💥'
    if (value >= 50) return '😰'
    return '😌'
  }
  return '📊'
}

function getMetricColor(metric) {
  const { key, value } = metric
  if (key === 'affection') {
    if (value >= 80) return '#ff375f'
    if (value >= 50) return '#ff6b35'
    return '#8e8e93'
  }
  if (key === 'energy') {
    if (value >= 60) return '#5ac8fa'
    if (value >= 30) return '#ff9f0a'
    return '#ff453a'
  }
  if (key === 'stress') {
    if (value >= 80) return '#ff453a'
    if (value >= 50) return '#ff9f0a'
    return '#30d158'
  }
  return '#8e8e93'
}
</script>

<template>
  <section class="status-panel">
    <header class="panel-header">
      <div class="header-left">
        <h3>状态</h3>
      </div>
      <button class="close-btn" @click="handleClose">✕</button>
    </header>

    <div class="status-content" v-if="characterData">
      <!-- 角色摘要 -->
      <div class="character-card" v-if="characterData">
        <div class="character-avatar">
          <img :src="characterData.raw?.portraits?.[0]?.filePath || ''" alt="角色头像" v-if="characterData.raw?.portraits?.[0]?.filePath" />
          <span v-else class="avatar-placeholder">👤</span>
        </div>
        <div class="character-info">
          <div class="character-name">{{ characterData.label || characterData.raw?.name || '未知角色' }}</div>
          <div class="character-subtitle">角色状态概览</div>
        </div>
      </div>

      <!-- 状态条目 -->
      <div class="status-grid">
        <div
          v-for="metric in statusMetrics"
          :key="metric.key"
          class="status-card"
        >
          <div class="status-header">
            <div class="status-icon-emoji">{{ getStatusEmoji(metric) }}</div>
            <div class="status-label">{{ metric.label }}</div>
            <span class="status-value">{{ metric.value }}</span>
          </div>
          <div class="status-bar-track">
            <div
              class="status-bar-fill"
              :style="{ width: `${metric.value}%`, background: `linear-gradient(90deg, ${getMetricColor(metric)}, ${getMetricColor(metric)}dd)` }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">📊</div>
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
  background: linear-gradient(180deg, rgba(30, 30, 35, 0.92) 0%, rgba(20, 20, 25, 0.96) 100%);
  backdrop-filter: blur(40px) saturate(1.8);
  -webkit-backdrop-filter: blur(40px) saturate(1.8);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* Header */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
}

.close-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 18px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.6);
  width: 30px;
  height: 30px;
  min-width: 30px;
  min-height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.close-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.15);
}

/* Content */
.status-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.status-content::-webkit-scrollbar {
  width: 4px;
}

.status-content::-webkit-scrollbar-track {
  background: transparent;
}

.status-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

/* Character card */
.character-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  margin-bottom: 18px;
}

.character-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04));
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.character-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  font-size: 24px;
  opacity: 0.6;
}

.character-info {
  flex: 1;
  min-width: 0;
}

.character-name {
  font-size: 16px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 2px;
}

.character-subtitle {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  font-weight: 400;
}

/* Status grid */
.status-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-card {
  padding: 14px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.status-card:hover {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.03));
  border-color: rgba(255, 255, 255, 0.1);
}

.status-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.status-icon-emoji {
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
}

.status-label {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.55);
}

.status-value {
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
  min-width: 32px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.status-bar-track {
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
}

.status-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1), background 0.3s ease;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.06);
}

/* Empty state */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 200px;
  color: rgba(255, 255, 255, 0.3);
}

.empty-icon {
  font-size: 48px;
  opacity: 0.4;
  filter: grayscale(0.5);
}

.empty-state p {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.4);
}

/* Android竖屏适配 */
.platform-android.android-portrait .close-btn {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  font-size: 20px !important;
}
</style>
