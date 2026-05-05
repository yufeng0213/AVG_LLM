<script setup>
import { ref, computed } from 'vue'
import { NEED_DEFAULT_CONFIG } from '../config/constants.js'
import { createPawnSpriteResolver } from '../render/pawnSprites.js'

const props = defineProps({
  pawn: { type: Object, default: null },
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'expand', 'update-need', 'show-outfit'])

const expanded = ref(false)
const activeTab = ref('status')  // 'status' 或 'log'
const godMode = ref(false)  // 上帝模式开关

const pawnSpriteResolver = createPawnSpriteResolver()

const handleToggleExpand = () => {
  expanded.value = !expanded.value
  emit('expand', expanded.value)
}

const handleClose = () => {
  expanded.value = false
  activeTab.value = 'status'
  godMode.value = false
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

// ========== 日志显示 ==========

const getSortedEvents = (pawn) => {
  const events = pawn?.eventLog || []
  return events.slice().sort((a, b) => b.time - a.time)  // 最新的在前
}

// ========== 上帝模式 ==========

const NEED_LABELS = {
  hunger: '饥饿',
  rest: '休息',
  comfort: '舒适',
  joy: '快乐',
  social: '社交',
  work_satisfaction: '工作',
}

const getNeedLabel = (needKey) => NEED_LABELS[needKey] || needKey.slice(0, 4)

const handleUpdateNeed = (needType, value) => {
  emit('update-need', { pawnId: props.pawn?.id, needType, value: Number(value) })
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

      <!-- 标签页切换 -->
      <div class="pawn-tabs">
        <button :class="{ active: activeTab === 'status' }" @click="activeTab = 'status'">状态</button>
        <button :class="{ active: activeTab === 'log' }" @click="activeTab = 'log'">日志</button>
        <button :class="{ active: activeTab === 'outfit' }" @click="activeTab = 'outfit'">换装</button>
      </div>

      <!-- 换装标签页 -->
      <div v-if="activeTab === 'outfit'" class="pawn-outfit-tab">
        <div class="outfit-preview-row">
          <div class="outfit-preview-frame">
            <img :src="getPawnSpriteSrc(pawn)" alt="" />
          </div>
          <button class="open-outfit-btn" @click="emit('show-outfit')">
            打开换装面板
          </button>
        </div>
        <div v-if="pawn.sprite?.outfit" class="outfit-info-grid">
          <div class="outfit-info-item">
            <span class="info-label">发型</span>
            <span class="info-value">{{ pawn.sprite.outfit.hair }}</span>
          </div>
          <div class="outfit-info-item">
            <span class="info-label">眼睛</span>
            <span class="info-value">{{ pawn.sprite.outfit.eyes }}</span>
          </div>
          <div class="outfit-info-item">
            <span class="info-label">上衣</span>
            <span class="info-value">{{ pawn.sprite.outfit.top }}</span>
          </div>
          <div class="outfit-info-item">
            <span class="info-label">下装</span>
            <span class="info-value">{{ pawn.sprite.outfit.bottom }}</span>
          </div>
          <div class="outfit-info-item">
            <span class="info-label">配饰</span>
            <span class="info-value">{{ pawn.sprite.outfit.accessory }}</span>
          </div>
          <div class="outfit-info-item">
            <span class="info-label">调色板</span>
            <span class="info-value">{{ pawn.sprite.palette }}</span>
          </div>
        </div>
        <div v-else class="outfit-legacy-hint">
          <span>当前使用职业样式（{{ pawn.sprite.style || 'knight' }}），打开换装面板可切换到部件搭配</span>
        </div>
      </div>

      <!-- 状态标签页 -->
      <div v-if="activeTab === 'status'">
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
        <!-- 上帝模式开关 -->
        <div class="god-mode-toggle">
          <button :class="{ active: godMode }" @click="godMode = !godMode">
            🛠️ 上帝模式
          </button>
        </div>

        <div class="pawn-needs-section">
          <div class="needs-grid">
            <div v-for="[needKey, config] in Object.entries(NEED_DEFAULT_CONFIG)" :key="needKey" class="need-bar">
              <span class="need-label">{{ getNeedLabel(needKey) }}</span>
              <div class="need-track">
                <div class="need-fill" :class="getNeedBarClass(pawn, needKey)" :style="{ width: getNeedBarFillWidth(pawn, needKey) }"></div>
              </div>
              <!-- 上帝模式滑块 -->
              <input v-if="godMode" type="range" min="0" max="100"
                     :value="pawn.needs?.[needKey]?.value || 100"
                     @input="handleUpdateNeed(needKey, $event.target.value)"
                     class="need-slider" />
            </div>
          </div>
        </div>
      </div>

      <!-- 日志标签页 -->
      <div v-if="activeTab === 'log'" class="pawn-log-section">
        <div class="log-list" v-if="pawn.eventLog?.length">
          <div v-for="event in getSortedEvents(pawn)" :key="event.time" class="log-item">
            <span class="log-time">{{ event.gameTime }}</span>
            <span class="log-text">{{ event.text }}</span>
            <span class="log-mood" :class="{ positive: event.moodImpact > 0, negative: event.moodImpact < 0 }">
              {{ event.moodImpact > 0 ? '+' : '' }}{{ event.moodImpact }}
            </span>
          </div>
        </div>
        <div v-else class="log-empty">暂无活动记录</div>
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

/* 标签页 */
.pawn-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.pawn-tabs button {
  padding: 8px 16px;
  background: #3a3a42;
  border: none;
  border-radius: 4px;
  color: #aaa;
  cursor: pointer;
  font-size: 13px;
}

.pawn-tabs button.active {
  background: #5a5a62;
  color: #eaeaea;
}

/* 上帝模式 */
.god-mode-toggle {
  margin-bottom: 8px;
}

.god-mode-toggle button {
  padding: 6px 12px;
  background: #4a4a52;
  border: none;
  border-radius: 4px;
  color: #aaa;
  font-size: 12px;
  cursor: pointer;
}

.god-mode-toggle button.active {
  background: #6a5a4a;
  color: #eaeaea;
}

.need-slider {
  width: 60px;
  height: 4px;
  margin-left: 4px;
  cursor: pointer;
  accent-color: #6a8a6a;
}

/* 日志区域 */
.pawn-log-section {
  max-height: 200px;
  overflow-y: auto;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.log-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #1a1a22;
  border-radius: 4px;
  font-size: 12px;
}

.log-time {
  color: #888;
  min-width: 70px;
}

.log-text {
  flex: 1;
  color: #eaeaea;
}

.log-mood {
  min-width: 20px;
  font-weight: 600;
}

.log-mood.positive { color: #80c080; }
.log-mood.negative { color: #c08080; }

.log-empty {
  text-align: center;
  color: #888;
  padding: 20px;
}

/* 换装标签页 */
.pawn-outfit-tab {
  padding: 8px 0;
}

.outfit-preview-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.outfit-preview-frame {
  width: 64px;
  height: 64px;
  background: #2a2a32;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.outfit-preview-frame img {
  width: 64px;
  height: 64px;
  object-fit: contain;
  image-rendering: pixelated;
}

.open-outfit-btn {
  flex: 1;
  padding: 14px;
  background: #4a5a4a;
  border: none;
  border-radius: 6px;
  color: #eaeaea;
  font-size: 14px;
  cursor: pointer;
}

.open-outfit-btn:hover {
  background: #5a7a5a;
}

.outfit-info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.outfit-info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  background: #1a1a22;
  border-radius: 4px;
}

.info-label {
  font-size: 10px;
  color: #888;
}

.info-value {
  font-size: 12px;
  color: #eaeaea;
  text-transform: capitalize;
}

.outfit-legacy-hint {
  padding: 12px;
  background: #2a2a22;
  border-radius: 4px;
  font-size: 12px;
  color: #aaa;
  text-align: center;
}

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
  

  .platform-android.android-portrait .expand-btn,
   .platform-android.android-portrait .close-btn,
   .platform-android.android-portrait .collapse-btn,
   .platform-android.android-portrait .pawn-tabs button{
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 6px 10px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
  }
</style>