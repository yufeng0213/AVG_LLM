<script setup>
/**
 * 好感度变化提示组件
 * 当好感度发生变化时显示动态反馈
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  getRelationshipLevel,
  getChangeMagnitude,
  isPositiveChange,
} from '../relationship/relationshipLevels.js'

const props = defineProps({
  // 变化数据
  change: {
    type: Object,
    required: true,
    // { characterId, characterName, characterPortrait, metric, delta, reason }
  },
  // 显示持续时间（毫秒）
  duration: {
    type: Number,
    default: 3000,
  },
  // 是否显示动画
  showAnimation: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['dismiss'])

// 状态
const visible = ref(true)
const animationPhase = ref('enter') // 'enter' | 'stable' | 'exit'

// 计算属性
const isPositive = computed(() => isPositiveChange(props.change.delta))

const magnitude = computed(() => getChangeMagnitude(props.change.delta))

const levelInfo = computed(() => {
  // 如果有新值，计算新等级
  if (props.change.newValue !== undefined) {
    return getRelationshipLevel(props.change.newValue)
  }
  return null
})

const changeType = computed(() => {
  if (isPositive.value) return 'positive'
  return 'negative'
})

const formattedDelta = computed(() => {
  const delta = props.change.delta
  if (delta > 0) return `+${delta}`
  return `${delta}`
})

const metricLabel = computed(() => {
  const metricMap = {
    favor: '好感度',
    trust: '信任度',
    stance: '立场',
  }
  return metricMap[props.change.metric] || props.change.metric
})

const characterPortrait = computed(() => {
  return props.change.characterPortrait || ''
})

const characterName = computed(() => {
  return props.change.characterName || '角色'
})

// 动画类名
const animationClass = computed(() => {
  return {
    'toast-enter': animationPhase.value === 'enter',
    'toast-stable': animationPhase.value === 'stable',
    'toast-exit': animationPhase.value === 'exit',
    'positive-change': isPositive.value,
    'negative-change': !isPositive.value,
    'small-change': magnitude.delta <= 5,
    'medium-change': magnitude.delta > 5 && magnitude.delta <= 15,
    'large-change': magnitude.delta > 15,
  }
})

// 心形动画元素
const hearts = ref([])

// 生成心形动画
const generateHearts = () => {
  if (!props.showAnimation) return
  
  const count = Math.min(Math.abs(props.change.delta), 10)
  hearts.value = []
  
  for (let i = 0; i < count; i++) {
    hearts.value.push({
      id: i,
      delay: i * 100,
      x: Math.random() * 60 + 20, // 20-80%
      duration: 1000 + Math.random() * 500,
    })
  }
}

// 定时器
let dismissTimer = null
let animationTimer = null

// 开始自动消失
const startDismissTimer = () => {
  dismissTimer = setTimeout(() => {
    animationPhase.value = 'exit'
    animationTimer = setTimeout(() => {
      visible.value = false
      emit('dismiss')
    }, 300)
  }, props.duration)
}

// 手动关闭
const handleDismiss = () => {
  if (dismissTimer) clearTimeout(dismissTimer)
  if (animationTimer) clearTimeout(animationTimer)
  animationPhase.value = 'exit'
  animationTimer = setTimeout(() => {
    visible.value = false
    emit('dismiss')
  }, 300)
}

// 生命周期
onMounted(() => {
  generateHearts()
  animationPhase.value = 'enter'
  
  // 进入动画完成后进入稳定状态
  animationTimer = setTimeout(() => {
    animationPhase.value = 'stable'
    startDismissTimer()
  }, 300)
})

onUnmounted(() => {
  if (dismissTimer) clearTimeout(dismissTimer)
  if (animationTimer) clearTimeout(animationTimer)
})
</script>

<template>
  <Transition name="toast-fade">
    <div 
      v-if="visible" 
      class="relationship-change-toast"
      :class="animationClass"
      @click="handleDismiss"
    >
      <!-- 动画层 -->
      <div v-if="showAnimation" class="animation-layer">
        <!-- 心形上升动画（正向变化） -->
        <div 
          v-for="heart in hearts" 
          :key="heart.id"
          v-if="isPositive"
          class="floating-heart"
          :style="{
            left: `${heart.x}%`,
            animationDelay: `${heart.delay}ms`,
            animationDuration: `${heart.duration}ms`,
          }"
        >
          ❤️
        </div>
        
        <!-- 心形破碎动画（负向变化） -->
        <div 
          v-for="heart in hearts" 
          :key="heart.id"
          v-if="!isPositive"
          class="breaking-heart"
          :style="{
            left: `${heart.x}%`,
            animationDelay: `${heart.delay}ms`,
            animationDuration: `${heart.duration}ms`,
          }"
        >
          💔
        </div>
      </div>
      
      <!-- 内容层 -->
      <div class="toast-content">
        <!-- 角色头像 -->
        <div class="character-mini">
          <img 
            v-if="characterPortrait" 
            :src="characterPortrait" 
            :alt="characterName"
            class="mini-avatar"
          />
          <div v-else class="mini-avatar-placeholder">
            👤
          </div>
        </div>
        
        <!-- 变化信息 -->
        <div class="change-info">
          <span class="character-name">{{ characterName }}</span>
          <div class="change-value">
            <span class="metric-label">{{ metricLabel }}</span>
            <span class="delta-value" :class="changeType">
              {{ formattedDelta }}
            </span>
          </div>
          <span v-if="change.reason" class="change-reason">{{ change.reason }}</span>
          
          <!-- 等级变化提示 -->
          <div v-if="levelInfo" class="level-change">
            <span class="level-icon">{{ levelInfo.icon }}</span>
            <span class="level-name">{{ levelInfo.name }}</span>
          </div>
        </div>
        
        <!-- 变化幅度指示 -->
        <div class="magnitude-indicator">
          <div 
            class="magnitude-bar"
            :class="changeType"
            :style="{ width: `${Math.min(Math.abs(change.delta), 20) * 5}%` }"
          />
        </div>
      </div>
      
      <!-- 光效层 -->
      <div v-if="showAnimation && magnitude.delta > 15" class="glow-layer" :class="changeType" />
    </div>
  </Transition>
</template>

<style scoped>
.relationship-change-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  min-width: 200px;
  max-width: 300px;
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(26, 26, 46, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  cursor: pointer;
  overflow: hidden;
}

/* 进入/退出动画 */
.toast-enter {
  animation: slideInRight 0.3s ease-out;
}

.toast-stable {
  /* 稳定状态 */
}

.toast-exit {
  animation: slideOutRight 0.3s ease-in forwards;
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOutRight {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}

/* 正向/负向变化样式 */
.positive-change {
  border-color: rgba(255, 107, 107, 0.3);
}

.positive-change::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #ff6b6b, transparent);
}

.negative-change {
  border-color: rgba(139, 0, 0, 0.3);
}

.negative-change::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #8b0000, transparent);
}

/* 变化幅度样式 */
.large-change {
  animation: pulse 0.5s ease-in-out;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

/* 动画层 */
.animation-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  pointer-events: none;
}

.floating-heart {
  position: absolute;
  bottom: -20px;
  font-size: 16px;
  animation: floatUp ease-out forwards;
  opacity: 0;
}

@keyframes floatUp {
  0% {
    transform: translateY(0) scale(0.5);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    transform: translateY(-100px) scale(1);
    opacity: 0;
  }
}

.breaking-heart {
  position: absolute;
  bottom: 20px;
  font-size: 16px;
  animation: breakDown ease-out forwards;
  opacity: 0;
}

@keyframes breakDown {
  0% {
    transform: translateY(0) scale(1);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    transform: translateY(30px) scale(0.5) rotate(15deg);
    opacity: 0;
  }
}

/* 内容层 */
.toast-content {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  z-index: 1;
}

.character-mini {
  flex-shrink: 0;
}

.mini-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.mini-avatar-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(128, 128, 128, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.change-info {
  flex: 1;
  min-width: 0;
}

.character-name {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  display: block;
}

.change-value {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.metric-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.delta-value {
  font-size: 16px;
  font-weight: 700;
}

.delta-value.positive {
  color: #ff6b6b;
}

.delta-value.negative {
  color: #8b0000;
}

.change-reason {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  display: block;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.level-change {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
}

.level-icon {
  font-size: 12px;
}

.level-name {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
}

/* 变化幅度指示器 */
.magnitude-indicator {
  flex-shrink: 0;
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: rgba(128, 128, 128, 0.3);
  overflow: hidden;
}

.magnitude-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.magnitude-bar.positive {
  background: linear-gradient(90deg, #ff6b6b, #ff4d4d);
}

.magnitude-bar.negative {
  background: linear-gradient(90deg, #8b0000, #2d0000);
}

/* 光效层 */
.glow-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  animation: glowPulse 1s ease-in-out;
}

.glow-layer.positive {
  background: radial-gradient(circle at center, rgba(255, 107, 107, 0.2) 0%, transparent 70%);
}

.glow-layer.negative {
  background: radial-gradient(circle at center, rgba(139, 0, 0, 0.2) 0%, transparent 70%);
}

@keyframes glowPulse {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}

/* Vue Transition */
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.3s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
}
</style>