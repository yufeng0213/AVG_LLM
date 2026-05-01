<script setup>
import { computed } from 'vue'

const props = defineProps({
  state: { type: Object, required: true },
  visible: { type: Boolean, default: false },
  editMode: { type: Boolean, default: false },
  hasSelectedFurniture: { type: Boolean, default: false },
  ambientLight: { type: Number, default: 1.0 },  // 环境光强度 0-1
})

const emit = defineEmits([
  'close',
  'select-pawn',
  'add-pawn',
  'toggle-pause',
  'toggle-edit-mode',
  'show-import',
  'show-pawn-import',
  'show-mood-rules',
  'toggle-furniture-bar',
  'delete-furniture',
  'force-save',
  'close-panel',
  'back-to-select',
  'reset-room',
  'adjust-ambient-light',  // 调整环境光
])

// ========== 小人列表 ==========

const sortedPawns = computed(() => {
  return props.state.pawns.slice().sort((a, b) => {
    const moodA = a.mood?.value || 50
    const moodB = b.mood?.value || 50
    return moodB - moodA
  })
})

const handleSelectPawn = (pawn) => {
  emit('select-pawn', pawn.id)
}

const handleAddPawn = () => {
  emit('add-pawn')
}

// ========== 时间控制 ==========

const handleTogglePause = () => {
  emit('toggle-pause')
}

// ========== 编辑模式 ==========

const handleToggleEditMode = () => {
  emit('toggle-edit-mode')
}

// ========== 工具 ==========

const handleShowImport = () => {
  emit('show-import')
}

const handleShowPawnImport = () => {
  emit('show-pawn-import')
}

const handleShowMoodRules = () => {
  emit('show-mood-rules')
}

const handleToggleFurnitureBar = () => {
  emit('toggle-furniture-bar')
}

const handleDeleteFurniture = () => {
  emit('delete-furniture')
}

const handleForceSave = () => {
  emit('force-save')
}

const handleClosePanel = () => {
  emit('close-panel')
}

const handleBackToSelect = () => {
  emit('back-to-select')
}

const handleResetRoom = () => {
  emit('reset-room')
}

// ========== 环境光调整 ==========

const ambientLightPercent = computed(() => {
  return Math.round(props.ambientLight * 100)
})

// 环境光强度等级描述
const ambientLightLabel = computed(() => {
  const val = props.ambientLight
  if (val >= 1.0) return '☀️ 白天'
  if (val >= 0.7) return '🌤️ 明亮'
  if (val >= 0.5) return '⛅ 微暗'
  if (val >= 0.3) return '🌙 夜晚'
  return '🌑 深夜'
})

const handleAdjustAmbientLight = (event) => {
  const value = parseFloat(event.target.value) / 100
  emit('adjust-ambient-light', value)
}

// ========== 心情图标 ==========

const getMoodDotClass = (pawn) => {
  const mood = pawn.mood?.value || 50
  if (mood >= 80) return 'veryHappy'
  if (mood >= 60) return 'happy'
  if (mood >= 40) return 'normal'
  if (mood >= 20) return 'unhappy'
  return 'breakdown'
}
</script>

<template>
  <div class="hamburger-menu" :class="{ visible }" @click.self="emit('close')">
    <div class="hamburger-panel">
      <!-- 头部 -->
      <div class="hamburger-header">
        <span class="hamburger-title">🏠 房间模拟</span>
        <button class="hamburger-close" @click="emit('close')">✕</button>
      </div>

      <!-- 时间控制 -->
      <div class="hamburger-section">
        <div class="hamburger-time">
          <span>第 {{ state.time.dayCount }} 天</span>
          <span>{{ state.time.hourOfDay }}:00</span>
          <span class="time-phase" :class="state.time.dayPhase">{{ state.time.dayPhase }}</span>
        </div>
        <button class="hamburger-pause-btn" :class="{ paused: state.time.isPaused }" @click="handleTogglePause">
          {{ state.time.isPaused ? '▶️ 开始' : '⏸️ 暂停' }}
        </button>
      </div>

      <!-- 环境光调整 -->
      <div class="hamburger-section">
        <div class="hamburger-section-header">
          <span>💡 环境亮度</span>
          <span class="ambient-label">{{ ambientLightLabel }}</span>
        </div>
        <div class="ambient-light-control">
          <input
            type="range"
            class="ambient-slider"
            min="10"
            max="100"
            step="10"
            :value="ambientLightPercent"
            @input="handleAdjustAmbientLight"
          />
          <span class="ambient-value">{{ ambientLightPercent }}%</span>
        </div>
        <p class="ambient-hint">调整整体房间亮度，光源会在暗处更明显</p>
      </div>

      <!-- 编辑模式 -->
      <div class="hamburger-section">
        <button class="hamburger-tool-btn" :class="{ active: editMode }" @click="handleToggleEditMode">
          {{ editMode ? '📝 编辑模式' : '👁️ 观看模式' }}
        </button>
      </div>

      <!-- 工具（仅在编辑模式下显示） -->
      <div v-if="editMode" class="hamburger-section">
        <div class="hamburger-section-header">
          <span>🔧 编辑工具</span>
        </div>
        <div class="hamburger-tools">
          <button class="hamburger-tool-btn" @click="handleToggleFurnitureBar">
            🪑 家具栏
          </button>
          <button class="hamburger-tool-btn" @click="handleShowImport">
            📦 导入家具
          </button>
          <button class="hamburger-tool-btn" @click="handleShowPawnImport">
            👤 导入精灵
          </button>
          <button class="hamburger-tool-btn" @click="handleShowMoodRules">
            💭 心情规则
          </button>
          <button v-if="hasSelectedFurniture" class="hamburger-tool-btn danger" @click="handleDeleteFurniture">
            🗑️ 删除家具
          </button>
        </div>
      </div>

      <!-- 小人列表 -->
      <div class="hamburger-section">
        <div class="hamburger-section-header">
          <span>👥 小人列表</span>
        </div>
        <div class="hamburger-pawn-list">
          <div
            v-for="pawn in sortedPawns"
            :key="pawn.id"
            class="hamburger-pawn-item"
            :class="{ active: state.selectedPawnId === pawn.id }"
            @click="handleSelectPawn(pawn)"
          >
            <span class="pawn-mood-dot" :class="getMoodDotClass(pawn)"></span>
            <span class="pawn-name">{{ pawn.name }}</span>
            <span class="pawn-role">{{ pawn.role }}</span>
            <span class="pawn-mood">{{ pawn.mood?.value || 50 }}</span>
          </div>
        </div>
      </div>

      <!-- 切换角色 -->
      <div class="hamburger-section">
        <button class="hamburger-tool-btn save" @click="handleForceSave">
          💾 保存编辑
        </button>
        <button class="hamburger-tool-btn" @click="handleBackToSelect">
          ← 切换角色房间
        </button>
        <button class="hamburger-tool-btn danger" @click="handleResetRoom">
          🔄 重置房间
        </button>
      </div>

      <!-- 关闭面板 -->
      <div class="hamburger-footer">
        <button class="hamburger-exit-btn" @click="handleClosePanel">
          ✖️ 关闭房间模拟
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hamburger-menu {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s, visibility 0.2s;
}

.hamburger-menu.visible {
  opacity: 1;
  visibility: visible;
}

.hamburger-panel {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 280px;
  max-width: 85vw;
  background: #1a1a22;
  color: #eaeaea;
  display: flex;
  flex-direction: column;
  transform: translateX(-100%);
  transition: transform 0.3s;
  overflow-y: auto;
}

.hamburger-menu.visible .hamburger-panel {
  transform: translateX(0);
}

.hamburger-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #2a2a32;
  border-bottom: 1px solid #3a3a42;
}

.hamburger-title {
  font-size: 18px;
  font-weight: 600;
}

.hamburger-close {
  background: transparent;
  border: none;
  color: #aaa;
  font-size: 20px;
  padding: 4px 8px;
  cursor: pointer;
}

.hamburger-section {
  padding: 12px 16px;
  border-bottom: 1px solid #2a2a32;
}

.hamburger-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  color: #aaa;
}

/* 时间控制 */
.hamburger-time {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 14px;
}

.time-phase {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}

.time-phase.morning { background: #6a8a6a; }
.time-phase.afternoon { background: #8a8a6a; }
.time-phase.evening { background: #6a6a8a; }
.time-phase.night { background: #3a3a5a; }

.hamburger-pause-btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 4px;
  background: #4a6a4a;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.hamburger-pause-btn.paused {
  background: #6a4a4a;
}

/* 环境光控制 */
.ambient-light-control {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.ambient-slider {
  flex: 1;
  height: 8px;
  background: #3a3a42;
  border-radius: 4px;
  appearance: none;
  cursor: pointer;
}

.ambient-slider::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  background: #6a8a6a;
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.15s;
}

.ambient-slider::-webkit-slider-thumb:hover {
  background: #8aaa8a;
}

.ambient-value {
  font-size: 14px;
  color: #8aa;
  min-width: 36px;
  text-align: right;
}

.ambient-label {
  font-size: 14px;
}

.ambient-hint {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

/* 小人列表 */
.hamburger-pawn-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hamburger-pawn-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #2a2a32;
  border-radius: 4px;
  cursor: pointer;
}

.hamburger-pawn-item:hover {
  background: #3a3a42;
}

.hamburger-pawn-item.active {
  background: #4a5a4a;
  border-left: 3px solid #6a8a6a;
}

.pawn-mood-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.pawn-mood-dot.veryHappy { background: #40c040; }
.pawn-mood-dot.happy { background: #80a040; }
.pawn-mood-dot.normal { background: #a0a040; }
.pawn-mood-dot.unhappy { background: #c08040; }
.pawn-mood-dot.breakdown { background: #c04040; }

.pawn-name {
  font-size: 14px;
}

.pawn-role {
  font-size: 12px;
  color: #888;
}

.pawn-mood {
  font-size: 12px;
  color: #aaa;
  margin-left: auto;
}

/* 工具 */
.hamburger-tools {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hamburger-tool-btn {
  padding: 12px;
  border: none;
  border-radius: 4px;
  background: #3a3a42;
  color: #eaeaea;
  font-size: 14px;
  cursor: pointer;
}

.hamburger-tool-btn:hover {
  background: #4a4a52;
}

.hamburger-tool-btn.active {
  background: #6a8a6a;
}

.hamburger-tool-btn.save {
  background: #5a7a5a;
}

.hamburger-tool-btn.save:hover {
  background: #6a8a6a;
}

.hamburger-tool-btn.danger {
  background: #6a4a4a;
}

.hamburger-tool-btn.danger:hover {
  background: #8a4a4a;
}

/* 底部 */
.hamburger-footer {
  padding: 16px;
}

.hamburger-exit-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 4px;
  background: #4a4a52;
  color: #eaeaea;
  font-size: 14px;
  cursor: pointer;
}

.hamburger-exit-btn:hover {
  background: #5a5a62;
}

/* 移动端优化 */
@media (pointer: coarse) {
  .hamburger-panel {
    width: 260px;
  }

  .hamburger-pawn-item {
    padding: 12px 14px;
  }

  .hamburger-tool-btn,
  .hamburger-pause-btn,
  .hamburger-exit-btn {
    padding: 14px;
    font-size: 16px;
  }
}

/* Android 下的按钮样式修复 */
.platform-android.android-portrait .hamburger-close,
.platform-android.android-portrait .hamburger-pause-btn,
.platform-android.android-portrait .hamburger-tool-btn,
.platform-android.android-portrait .hamburger-exit-btn {
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