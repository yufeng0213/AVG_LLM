<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  state: { type: Object, required: true },
  activeRoomId: { type: String, default: '' },
  rooms: { type: Array, default: () => [] },
  pawns: { type: Array, default: () => [] },
  visible: { type: Boolean, default: false },
})

const emit = defineEmits([
  'close',
  'select-room',
  'add-room',
  'delete-room',
  'rename-room',
  'select-pawn',
  'add-pawn',
  'toggle-pause',
  'show-import',
  'close-panel',
])

// ========== 房间列表 ==========

const sortedRooms = computed(() => {
  const commonRooms = props.rooms.filter(r => r.type === 'common')
  const bedrooms = props.rooms.filter(r => r.type === 'bedroom')
  const others = props.rooms.filter(r => r.type !== 'common' && r.type !== 'bedroom')
  return [...commonRooms, ...bedrooms, ...others]
})

const handleSelectRoom = (room) => {
  emit('select-room', room.id)
}

const handleAddRoom = () => {
  emit('add-room')
}

const handleDeleteRoom = (room) => {
  if (props.rooms.length <= 1) return
  emit('delete-room', room.id)
}

// ========== 小人列表 ==========

const sortedPawns = computed(() => {
  return props.pawns.slice().sort((a, b) => {
    const moodA = a.mood?.value || 50
    const moodB = b.mood?.value || 50
    return moodB - moodA
  })
})

const handleSelectPawn = (pawn) => {
  emit('select-pawn', pawn.id)
  // 如果小人有自己的寝室，跳转到那个房间
  if (pawn.ownedRoomId) {
    emit('select-room', pawn.ownedRoomId)
  }
}

const handleAddPawn = () => {
  emit('add-pawn')
}

// ========== 时间控制 ==========

const handleTogglePause = () => {
  emit('toggle-pause')
}

// ========== 工具 ==========

const handleShowImport = () => {
  emit('show-import')
}

const handleClosePanel = () => {
  emit('close-panel')
}

// ========== 房间类型图标 ==========

const getRoomIcon = (room) => {
  if (room.type === 'common') return '🌐'
  if (room.type === 'bedroom') return '🛏️'
  if (room.type === 'storage') return '📦'
  return '🏠'
}

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

      <!-- 房间列表 -->
      <div class="hamburger-section">
        <div class="hamburger-section-header">
          <span>📍 房间列表</span>
          <button class="hamburger-add-btn" @click="handleAddRoom">+ 新建</button>
        </div>
        <div class="hamburger-room-list">
          <div
            v-for="room in sortedRooms"
            :key="room.id"
            class="hamburger-room-item"
            :class="{ active: activeRoomId === room.id }"
            @click="handleSelectRoom(room)"
          >
            <span class="room-icon">{{ getRoomIcon(room) }}</span>
            <span class="room-name">{{ room.name }}</span>
            <button
              v-if="rooms.length > 1"
              class="room-delete-btn"
              @click.stop="handleDeleteRoom(room)"
            >🗑️</button>
          </div>
        </div>
      </div>

      <!-- 小人列表 -->
      <div class="hamburger-section">
        <div class="hamburger-section-header">
          <span>👥 小人列表</span>
          <button class="hamburger-add-btn" @click="handleAddPawn">+ 添加</button>
        </div>
        <div class="hamburger-pawn-list">
          <div
            v-for="pawn in sortedPawns"
            :key="pawn.id"
            class="hamburger-pawn-item"
            @click="handleSelectPawn(pawn)"
          >
            <span class="pawn-mood-dot" :class="getMoodDotClass(pawn)"></span>
            <span class="pawn-name">{{ pawn.name }}</span>
            <span class="pawn-role">{{ pawn.role }}</span>
            <span class="pawn-mood">{{ pawn.mood?.value || 50 }}</span>
          </div>
        </div>
      </div>

      <!-- 工具 -->
      <div class="hamburger-section">
        <div class="hamburger-section-header">
          <span>🔧 工具</span>
        </div>
        <div class="hamburger-tools">
          <button class="hamburger-tool-btn" @click="handleShowImport">
            📦 导入家具/背景
          </button>
        </div>
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

.hamburger-add-btn {
  background: #4a4a52;
  border: none;
  color: #eaeaea;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
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

/* 房间列表 */
.hamburger-room-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hamburger-room-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #2a2a32;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.hamburger-room-item:hover {
  background: #3a3a42;
}

.hamburger-room-item.active {
  background: #4a5a4a;
  border-left: 3px solid #6a8a6a;
}

.room-icon {
  font-size: 16px;
}

.room-name {
  flex: 1;
  font-size: 14px;
}

.room-delete-btn {
  background: transparent;
  border: none;
  color: #666;
  font-size: 12px;
  padding: 2px 4px;
  cursor: pointer;
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

  .hamburger-room-item,
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
</style>