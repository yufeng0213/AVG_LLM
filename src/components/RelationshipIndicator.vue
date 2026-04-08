<script setup>
/**
 * 单角色好感度指示器组件
 * 显示单个角色的好感度状态
 */
import { computed } from 'vue'
import {
  getRelationshipLevel,
  getRelationshipLevelClass,
  RELATIONSHIP_MIN,
  RELATIONSHIP_MAX,
} from '../relationship/relationshipLevels.js'

const props = defineProps({
  // 角色信息
  character: {
    type: Object,
    required: true,
  },
  // 关系状态
  relationship: {
    type: Object,
    required: true,
  },
  // 是否显示详细数值
  showValues: {
    type: Boolean,
    default: false,
  },
  // 是否显示信任度
  showTrust: {
    type: Boolean,
    default: true,
  },
  // 是否显示立场
  showStance: {
    type: Boolean,
    default: false,
  },
  // 尺寸
  size: {
    type: String,
    default: 'normal', // 'small' | 'normal' | 'large'
    validator: (value) => ['small', 'normal', 'large'].includes(value),
  },
})

const emit = defineEmits(['click'])

// 计算好感度等级信息
const favorLevel = computed(() => getRelationshipLevel(props.relationship.favor))
const trustLevel = computed(() => getRelationshipLevel(props.relationship.trust))

// 计算CSS类名
const levelClass = computed(() => getRelationshipLevelClass(props.relationship.favor))
const sizeClass = computed(() => `indicator-size-${props.size}`)

// 计算好感度进度条（从-100到100映射为0-100%）
const favorProgress = computed(() => {
  const range = RELATIONSHIP_MAX - RELATIONSHIP_MIN
  return Math.round(((props.relationship.favor - RELATIONSHIP_MIN) / range) * 100)
})

const trustProgress = computed(() => {
  const range = RELATIONSHIP_MAX - RELATIONSHIP_MIN
  return Math.round(((props.relationship.trust - RELATIONSHIP_MIN) / range) * 100)
})

// 立场进度（-100到100映射，0为中间）
const stanceProgress = computed(() => {
  // 立场：0在中间，负值偏左，正值偏右
  return Math.round((props.relationship.stance / RELATIONSHIP_MAX) * 50)
})

// 获取角色头像
const characterAvatar = computed(() => {
  const portraits = props.character?.portraits || []
  const defaultPortrait = portraits.find(p => p.emotion === 'default') || portraits[0]
  return defaultPortrait?.filePath || ''
})

// 获取角色名称
const characterName = computed(() => props.character?.name || '未知角色')

// 点击事件
const handleClick = () => {
  emit('click', {
    characterId: props.character?.id,
    character: props.character,
    relationship: props.relationship,
  })
}
</script>

<template>
  <div 
    class="relationship-indicator" 
    :class="[levelClass, sizeClass]"
    @click="handleClick"
  >
    <!-- 角色头像区域 -->
    <div class="character-avatar-section">
      <div class="avatar-wrapper">
        <img 
          v-if="characterAvatar" 
          :src="characterAvatar" 
          :alt="characterName"
          class="character-avatar"
        />
        <div v-else class="avatar-placeholder">
          <span class="placeholder-icon">👤</span>
        </div>
        
        <!-- 等级徽章 -->
        <div 
          class="level-badge"
          :style="{ backgroundColor: favorLevel.color }"
        >
          <span class="level-icon">{{ favorLevel.icon }}</span>
        </div>
      </div>
    </div>
    
    <!-- 角色信息区域 -->
    <div class="character-info-section">
      <div class="character-name">{{ characterName }}</div>
      <div class="level-name" :style="{ color: favorLevel.color }">
        {{ favorLevel.name }}
      </div>
    </div>
    
    <!-- 数值区域（可选显示） -->
    <div v-if="showValues" class="values-section">
      <!-- 好感度进度条 -->
      <div class="metric-row">
        <span class="metric-label">好感</span>
        <div class="progress-bar-container">
          <div class="progress-bar favor-bar">
            <div 
              class="progress-fill favor-fill"
              :style="{ 
                width: `${favorProgress}%`,
                backgroundColor: favorLevel.color 
              }"
            />
            <div class="progress-center-line" />
          </div>
          <span class="metric-value">{{ relationship.favor }}</span>
        </div>
      </div>
      
      <!-- 信任度进度条 -->
      <div v-if="showTrust" class="metric-row">
        <span class="metric-label">信任</span>
        <div class="progress-bar-container">
          <div class="progress-bar trust-bar">
            <div 
              class="progress-fill trust-fill"
              :style="{ 
                width: `${trustProgress}%`,
                backgroundColor: trustLevel.color 
              }"
            />
            <div class="progress-center-line" />
          </div>
          <span class="metric-value">{{ relationship.trust }}</span>
        </div>
      </div>
      
      <!-- 立场进度条 -->
      <div v-if="showStance" class="metric-row">
        <span class="metric-label">立场</span>
        <div class="stance-bar-container">
          <div class="stance-bar">
            <div 
              class="stance-indicator"
              :style="{ left: `${50 + stanceProgress}%` }"
            />
            <div class="stance-labels">
              <span class="stance-left">敌</span>
              <span class="stance-center">中</span>
              <span class="stance-right">友</span>
            </div>
          </div>
          <span class="metric-value">{{ relationship.stance }}</span>
        </div>
      </div>
    </div>
    
    <!-- 简化数值（非详细模式） -->
    <div v-if="!showValues" class="simple-values">
      <span class="favor-value" :style="{ color: favorLevel.color }">
        {{ relationship.favor }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.relationship-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.relationship-indicator:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.2);
}

/* 尺寸变体 */
.indicator-size-small {
  padding: 4px 8px;
  gap: 8px;
}

.indicator-size-small .avatar-wrapper {
  width: 32px;
  height: 32px;
}

.indicator-size-small .character-name {
  font-size: 12px;
}

.indicator-size-large {
  padding: 12px 16px;
  gap: 16px;
}

.indicator-size-large .avatar-wrapper {
  width: 64px;
  height: 64px;
}

.indicator-size-large .character-name {
  font-size: 16px;
}

/* 头像区域 */
.character-avatar-section {
  flex-shrink: 0;
}

.avatar-wrapper {
  position: relative;
  width: 48px;
  height: 48px;
}

.character-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.avatar-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(128, 128, 128, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-icon {
  font-size: 24px;
  color: rgba(255, 255, 255, 0.5);
}

/* 等级徽章 */
.level-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.level-icon {
  font-size: 10px;
}

/* 角色信息 */
.character-info-section {
  flex: 1;
  min-width: 0;
}

.character-name {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.level-name {
  font-size: 12px;
  font-weight: 500;
  margin-top: 2px;
}

/* 数值区域 */
.values-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.metric-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.metric-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  width: 32px;
}

.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 6px;
}

.progress-bar {
  width: 60px;
  height: 6px;
  border-radius: 3px;
  background: rgba(128, 128, 128, 0.3);
  position: relative;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-center-line {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.3);
  transform: translateX(-50%);
}

.metric-value {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  width: 28px;
  text-align: right;
}

/* 立场条 */
.stance-bar-container {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stance-bar {
  width: 60px;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(to right, #e74c3c, #808080, #2ecc71);
  position: relative;
}

.stance-indicator {
  position: absolute;
  top: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid rgba(0, 0, 0, 0.2);
  transform: translateX(-50%);
  transition: left 0.3s ease;
}

.stance-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 2px;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
}

/* 简化数值 */
.simple-values {
  flex-shrink: 0;
}

.favor-value {
  font-size: 14px;
  font-weight: 600;
}

/* 等级颜色类 */
.relationship-level-0 {
  background: rgba(45, 0, 0, 0.3);
}

.relationship-level-1 {
  background: rgba(139, 0, 0, 0.2);
}

.relationship-level-2 {
  background: rgba(74, 74, 74, 0.2);
}

.relationship-level-3 {
  background: rgba(128, 128, 128, 0.1);
}

.relationship-level-4 {
  background: rgba(192, 192, 192, 0.1);
}

.relationship-level-5 {
  background: rgba(135, 206, 235, 0.15);
}

.relationship-level-6 {
  background: rgba(255, 165, 0, 0.15);
}

.relationship-level-7 {
  background: rgba(255, 107, 107, 0.2);
}

.relationship-level-8 {
  background: rgba(255, 77, 77, 0.25);
}
</style>