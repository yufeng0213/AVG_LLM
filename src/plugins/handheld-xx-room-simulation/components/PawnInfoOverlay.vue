<script setup>
import { ref, computed } from 'vue'
import { NEED_DEFAULT_CONFIG } from '../config/constants.js'
import { createPawnSpriteResolver } from '../render/pawnSprites.js'

const props = defineProps({
  pawn: { type: Object, default: null },
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'expand'])

const expanded = ref(false)

const pawnSpriteResolver = createPawnSpriteResolver()

const handleToggleExpand = () => {
  expanded.value = !expanded.value
  emit('expand', expanded.value)
}

const handleClose = () => {
  expanded.value = false
  emit('close')
}

// ========== 心情显示 ==========

const getMoodClass = (pawn) => {
  const moodValue = pawn?.mood?.value || 50
  if (moodValue >= 80) return 'veryHappy'
  if (moodValue >= 60) return 'happy'
  if (moodValue >= 40) return 'normal'
  if (moodValue >= 20) return 'unhappy'
  return 'breakdown'
}

const getMoodLabel = (pawn) => {
  const moodValue = pawn?.mood?.value || 50
  if (moodValue >= 80) return '非常开心'
  if (moodValue >= 60) return '满意'
  if (moodValue >= 40) return '一般'
  if (moodValue >= 20) return '不开心'
  return '崩溃边缘'
}

const getNeedBarFillWidth = (pawn, needType) => {
  const value = pawn?.needs?.[needType]?.value || 0
  return `${value}%`
}

const getNeedBarClass = (pawn, needType) => {
  const need = pawn?.needs?.[needType]
  if (!need) return 'normal'
  if (need.value <= need.critical) return 'critical'
  if (need.value <= need.threshold) return 'warning'
  return 'normal'
}

const getSortedThoughts = (pawn) => {
  const thoughts = pawn?.moodThoughts || []
  return thoughts.slice().sort((a, b) => b.moodModifier - a.moodModifier)
}

const getPawnSpriteSrc = (pawn) => {
  return pawnSpriteResolver.getPawnSpriteSrc(pawn)
}
</script>

<template>
  <div class="pawn-info-overlay" :class="{ visible, expanded }">
    <!-- 收起状态 - 简要信息 -->
    <div class="pawn-info-compact" v-if="!expanded && pawn">
      <div class="pawn-avatar" @click="handleToggleExpand">
        <img :src="getPawnSpriteSrc(pawn)" alt="" />
      </div>
      <div class="pawn-quick-info" @click="handleToggleExpand">
        <span class="pawn-name">{{ pawn.name }}</span>
        <div class="pawn-mood-mini">
          <span class="mood-dot" :class="getMoodClass(pawn)"></span>
          <span class="mood-value">{{ pawn.mood?.value || 50 }}</span>
        </div>
      </div>
      <button class="expand-btn" @click="handleToggleExpand">展开</button>
      <button class="close-btn" @click="handleClose">✕</button>
    </div>

    <!-- 展开状态 - 详细信息 -->
    <div class="pawn-info-expanded" v-if="expanded && pawn">
      <div class="pawn-info-header">
        <div class="pawn-avatar-large">
          <img :src="getPawnSpriteSrc(pawn)" alt="" />
        </div>
        <div class="pawn-identity">
          <span class="pawn-name">{{ pawn.name }}</span>
          <span class="pawn-role">{{ pawn.role }} · {{ pawn.currentActivity }}</span>
        </div>
        <button class="collapse-btn" @click="handleToggleExpand">收起</button>
        <button class="close-btn" @click="handleClose">✕</button>
      </div>

      <!-- 心情条 -->
      <div class="pawn-mood-section">
        <div class="mood-bar-container">
          <span class="mood-label">心情</span>
          <div class="mood-track">
            <div class="mood-fill" :class="getMoodClass(pawn)" :style="{ width: `${pawn.mood?.value || 50}%` }"></div>
          </div>
          <span class="mood-value">{{ pawn.mood?.value || 50 }}</span>
          <span class="mood-label-text">{{ getMoodLabel(pawn) }}</span>
        </div>
      </div>

      <!-- 心情条目 -->
      <div class="pawn-thoughts-section" v-if="pawn.moodThoughts?.length">
        <div class="thoughts-breakdown">
          <span class="positive">+{{ pawn.mood?.breakdown?.positive || 0 }}</span>
          <span class="negative">-{{ pawn.mood?.breakdown?.negative || 0 }}</span>
        </div>
        <div class="thoughts-list">
          <div
            v-for="thought in getSortedThoughts(pawn)"
            :key="thought.id"
            class="thought-item"
            :class="{ positive: thought.moodModifier > 0, negative: thought.moodModifier < 0 }"
          >
            <span class="thought-mod">{{ thought.moodModifier > 0 ? '+' : '' }}{{ thought.moodModifier }}</span>
            <span class="thought-label">{{ thought.label }}</span>
          </div>
        </div>
      </div>

      <!-- 需求进度条 -->
      <div class="pawn-needs-section">
        <div class="needs-grid">
          <div v-for="[needKey, config] in Object.entries(NEED_DEFAULT_CONFIG)" :key="needKey" class="need-bar">
            <span class="need-label">{{ needKey.slice(0, 4) }}</span>
            <div class="need-track">
              <div class="need-fill" :class="getNeedBarClass(pawn, needKey)" :style="{ width: getNeedBarFillWidth(pawn, needKey) }"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pawn-info-overlay {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: #22222a;
  border-top: 1px solid #3a3a42;
  transform: translateY(100%);
  transition: transform 0.3s;
  z-index: 100;
}

.pawn-info-overlay.visible {
  transform: translateY(0);
}

.pawn-info-overlay.expanded {
  max-height: 60vh;
  overflow-y: auto;
}

/* 收起状态 */
.pawn-info-compact {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}

.pawn-avatar {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  background: #3a3a42;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pawn-avatar img {
  width: 32px;
  height: 32px;
}

.pawn-quick-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pawn-name {
  font-size: 16px;
  font-weight: 600;
}

.pawn-mood-mini {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mood-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.mood-dot.veryHappy { background: #40c040; }
.mood-dot.happy { background: #80a040; }
.mood-dot.normal { background: #a0a040; }
.mood-dot.unhappy { background: #c08040; }
.mood-dot.breakdown { background: #c04040; }

.mood-value {
  font-size: 14px;
  color: #aaa;
}

.expand-btn,
.collapse-btn,
.close-btn {
  background: #4a4a52;
  border: none;
  color: #eaeaea;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.close-btn {
  background: transparent;
  color: #aaa;
  padding: 4px 8px;
}

/* 展开状态 */
.pawn-info-expanded {
  padding: 16px;
}

.pawn-info-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.pawn-avatar-large {
  width: 64px;
  height: 64px;
  border-radius: 4px;
  background: #3a3a42;
}

.pawn-avatar-large img {
  width: 48px;
  height: 48px;
}

.pawn-identity {
  flex: 1;
}

.pawn-role {
  font-size: 12px;
  color: #aaa;
}

/* 心情 */
.pawn-mood-section {
  margin-bottom: 12px;
}

.mood-bar-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mood-label {
  font-size: 12px;
  color: #aaa;
}

.mood-track {
  height: 10px;
  width: 100px;
  background: #3a3a42;
  border-radius: 3px;
  overflow: hidden;
}

.mood-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}

.mood-fill.veryHappy { background: #40c040; }
.mood-fill.happy { background: #80a040; }
.mood-fill.normal { background: #a0a040; }
.mood-fill.unhappy { background: #c08040; }
.mood-fill.breakdown { background: #c04040; }

.mood-label-text {
  font-size: 12px;
  color: #888;
}

/* 心情条目 */
.pawn-thoughts-section {
  margin-bottom: 12px;
  padding: 8px;
  background: #1a1a22;
  border-radius: 4px;
}

.thoughts-breakdown {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 12px;
}

.thoughts-breakdown .positive { color: #80c080; }
.thoughts-breakdown .negative { color: #c08080; }

.thoughts-list {
  max-height: 80px;
  overflow-y: auto;
}

.thought-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  font-size: 12px;
}

.thought-item.positive .thought-mod { color: #80c080; }
.thought-item.negative .thought-mod { color: #c08080; }

.thought-mod {
  min-width: 24px;
  font-weight: 600;
}

.thought-label {
  color: #aaa;
}

/* 需求 */
.pawn-needs-section {
  padding: 8px 0;
}

.needs-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.need-bar {
  display: flex;
  align-items: center;
  gap: 4px;
}

.need-label {
  font-size: 11px;
  color: #aaa;
  width: 20px;
}

.need-track {
  height: 6px;
  width: 50px;
  background: #3a3a42;
  border-radius: 2px;
  overflow: hidden;
}

.need-fill {
  height: 100%;
  border-radius: 2px;
}

.need-fill.critical { background: #e04040; }
.need-fill.warning { background: #e0a040; }
.need-fill.normal { background: #40a040; }

/* 移动端优化 */
@media (pointer: coarse) {
  .pawn-info-compact {
    padding: 14px 20px;
  }

  .pawn-name {
    font-size: 18px;
  }

  .expand-btn {
    padding: 10px 16px;
    font-size: 15px;
  }
}
</style>