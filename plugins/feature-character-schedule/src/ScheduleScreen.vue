<script setup>
/**
 * ScheduleScreen.vue - 角色日程全屏界面
 * 支持世界书切换、角色选择、日程生成、时段编辑
 */
import { computed, onMounted, ref } from 'vue'
import { loadWorldBooks } from '../../../src/worldbook/worldBookStore.js'
import { useCharacterSchedule, SCHEDULE_EVENTS, SCHEDULE_ACTIVITY_TYPES } from './composables/useCharacterSchedule.js'
import ScheduleTimeline from './components/ScheduleTimeline.vue'
import AutoRefreshSettings from './components/AutoRefreshSettings.vue'
import ScheduleEditHour from './components/ScheduleEditHour.vue'
import ScheduleAddEvent from './components/ScheduleAddEvent.vue'

const emit = defineEmits(['back'])

const {
  scheduleState,
  selectedSchedule,
  currentStatus,
  isGenerating,
  loadScheduleMap,
  selectCharacter,
  generateScheduleForCharacter,
  executePassedHours,
  updateActivity,
} = useCharacterSchedule()

// 世界书和角色列表
const worldBooks = ref([])
const selectedBookId = ref('')
const selectedCharId = ref('')

// 视图状态
const currentView = ref('books') // 'books' | 'chars' | 'schedule'

// 自动刷新设置
const showAutoRefreshSettings = ref(false)

// 编辑日程
const showEditHour = ref(false)
const editHour = ref(0)
const editEntry = ref(null)
const isEditMode = ref(false)
const showAddEvent = ref(false)

function openAddEvent() {
  showAddEvent.value = true
}

function closeAddEvent() {
  showAddEvent.value = false
}

async function onSaveAddEvent({ hour, activityType, description, locationName }) {
  await updateActivity(hour, {
    plannedActivity: {
      activityType,
      activityLabel: SCHEDULE_ACTIVITY_TYPES.find(t => t.type === activityType)?.label || activityType,
      description,
      locationId: '',
      locationName,
      blockId: '',
      isLocked: false,
      isCustom: true,
    },
  })
  closeAddEvent()
}

function openEditHour(hour, entry) {
  editHour.value = hour
  editEntry.value = entry
  showEditHour.value = true
}

function closeEditHour() {
  showEditHour.value = false
  editEntry.value = null
}

async function onSaveEditHour({ hour, activityType, description, locationName, isLocked }) {
  await updateActivity(hour, {
    plannedActivity: {
      activityType,
      activityLabel: SCHEDULE_ACTIVITY_TYPES.find(t => t.type === activityType)?.label || activityType,
      description,
      locationId: '',
      locationName,
      blockId: '',
      isLocked,
      isCustom: true,
    },
  })
  closeEditHour()
}

onMounted(async () => {
  await loadScheduleMap()
  worldBooks.value = await loadWorldBooks()
})

// 计算属性
const selectedBook = computed(() => {
  return worldBooks.value.find(b => b.id === selectedBookId.value) || null
})

const characters = computed(() => {
  if (!selectedBook.value) return []
  return (selectedBook.value.characters || []).map((char, index) => ({
    id: String(char.id || `char_${index + 1}`),
    name: String(char.name || char.nickname || `角色 ${index + 1}`).trim(),
    identity: String(char.identity || '').trim(),
    portraits: char.portraits || [],
  }))
})

const selectedCharacter = computed(() => {
  return characters.value.find(c => c.id === selectedCharId.value) || null
})

// 选择世界书
function selectBook(book) {
  selectedBookId.value = book.id
  selectedCharId.value = ''
  currentView.value = 'chars'
}

// 选择角色
function selectChar(char) {
  selectedCharId.value = char.id
  selectCharacter(selectedBookId.value, char.id)
  currentView.value = 'schedule'
  // 自动结算过去小时
  setTimeout(() => {
    executePassedHours(selectedBookId.value, char.id)
  }, 100)
}

// 返回上一级
function goBack() {
  if (currentView.value === 'schedule') {
    currentView.value = 'chars'
    selectedCharId.value = ''
  } else if (currentView.value === 'chars') {
    currentView.value = 'books'
    selectedBookId.value = ''
  } else {
    emit('back')
  }
}

// 刷新/生成日程
async function refreshSchedule() {
  if (!selectedBook.value || !selectedCharacter.value || isGenerating.value) return

  await generateScheduleForCharacter({
    worldBook: selectedBook.value,
    character: selectedBook.value.characters?.find(c => c.id === selectedCharId.value),
    scheduleDate: new Date().toISOString().slice(0, 10),
  })
}

// 获取角色头像
function getCharPortrait(char) {
  if (!char.portraits || char.portraits.length === 0) return ''
  const defaultPortrait = char.portraits.find(p => p.emotion === 'default')
  return defaultPortrait?.filePath || char.portraits[0]?.filePath || ''
}

function formatTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function onAutoRefreshSaved() {
  showAutoRefreshSettings.value = false
  // 通知调度器配置已变更（通过 window 事件）
  window.dispatchEvent(new CustomEvent('schedule:auto-refresh-config-changed'))
}
</script>

<template>
  <div class="schedule-screen">
    <!-- 世界书选择 -->
    <template v-if="currentView === 'books'">
      <div class="schedule-header">
        <button type="button" class="back-btn" @click="emit('back')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="title">角色日程</h2>
        <button type="button" class="settings-btn" @click="showAutoRefreshSettings = true" title="自动刷新设置">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4m-9-9h4m14 0h4m-3.3-6.7l-2.8 2.8M6.1 17.9l-2.8 2.8m0-13.4l2.8 2.8m11.8 7.8l2.8 2.8"/></svg>
        </button>
      </div>

      <div class="schedule-list">
        <p class="list-hint">选择世界书查看角色日程</p>
        <div
          v-for="book in worldBooks"
          :key="book.id"
          class="schedule-item"
          @click="selectBook(book)"
        >
          <div class="item-icon">&#x1F4D6;</div>
          <div class="item-info">
            <div class="item-name">{{ book.title || '未命名世界书' }}</div>
            <div class="item-meta">{{ (book.characters || []).length }} 个角色</div>
          </div>
          <svg class="item-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>

        <p v-if="worldBooks.length === 0" class="empty-text">暂无世界书</p>
      </div>
    </template>

    <!-- 角色选择 -->
    <template v-else-if="currentView === 'chars'">
      <div class="schedule-header">
        <button type="button" class="back-btn" @click="goBack">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="title">{{ selectedBook?.title || '选择角色' }}</h2>
        <button type="button" class="settings-btn" @click="showAutoRefreshSettings = true" title="自动刷新设置">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4m-9-9h4m14 0h4m-3.3-6.7l-2.8 2.8M6.1 17.9l-2.8 2.8m0-13.4l2.8 2.8m11.8 7.8l2.8 2.8"/></svg>
        </button>
      </div>

      <div class="schedule-list">
        <p class="list-hint">选择角色查看日程</p>
        <div
          v-for="char in characters"
          :key="char.id"
          class="schedule-item char-item"
          @click="selectChar(char)"
        >
          <div class="char-avatar">
            <img v-if="getCharPortrait(char)" :src="getCharPortrait(char)" class="avatar-img" />
            <span v-else class="avatar-text">{{ char.name.slice(0, 1) }}</span>
          </div>
          <div class="item-info">
            <div class="item-name">{{ char.name }}</div>
            <div class="item-meta">{{ char.identity || '无身份' }}</div>
          </div>
          <svg class="item-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>

        <p v-if="characters.length === 0" class="empty-text">该世界书暂无角色</p>
      </div>
    </template>

    <!-- 日程详情 -->
    <template v-else-if="currentView === 'schedule'">
      <div class="schedule-header">
        <button type="button" class="back-btn" @click="goBack">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="title">{{ selectedCharacter?.name || '日程' }}</h2>
        <div class="schedule-header-actions">
          <button
            type="button"
            class="settings-btn"
            @click="showAutoRefreshSettings = true"
            title="自动刷新设置"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4m-9-9h4m14 0h4m-3.3-6.7l-2.8 2.8M6.1 17.9l-2.8 2.8m0-13.4l2.8 2.8m11.8 7.8l2.8 2.8"/></svg>
          </button>
          <button
            type="button"
            class="edit-toggle-btn"
            :class="{ active: isEditMode }"
            @click="isEditMode = !isEditMode"
            title="编辑模式"
          >
            {{ isEditMode ? '编辑中' : '编辑' }}
          </button>
          <button
            type="button"
            class="add-btn"
            @click="openAddEvent"
            title="添加日程"
          >
            + 添加
          </button>
          <button
            type="button"
            class="refresh-btn"
            :disabled="isGenerating"
            @click="refreshSchedule"
          >
            {{ isGenerating ? '生成中...' : '刷新' }}
          </button>
        </div>
      </div>

      <div class="schedule-scroll">
        <!-- 当前状态卡片 -->
        <div class="current-status-card" v-if="currentStatus">
          <div class="status-emoji">{{ currentStatus.statusEmoji }}</div>
          <div class="status-info">
            <div class="status-text">{{ currentStatus.statusText }}</div>
            <div class="status-location" v-if="currentStatus.locationName">{{ currentStatus.locationName }}</div>
            <div class="status-hint" v-if="!currentStatus.canContact">{{ currentStatus.contactHint }}</div>
          </div>
          <div class="status-badge" :class="{ available: currentStatus.canContact }">
            {{ currentStatus.canContact ? '可联络' : '勿打扰' }}
          </div>
        </div>

        <!-- 日程时间线 -->
        <ScheduleTimeline
          v-if="selectedSchedule"
          :hour-entries="selectedSchedule.hourEntries"
          :generated-at="selectedSchedule.generatedAt"
        />

        <div v-else class="empty-schedule">
          <p class="empty-text">{{ isGenerating ? '正在生成日程...' : '点击"刷新"生成日程' }}</p>
        </div>

        <!-- 生成时间 -->
        <div class="schedule-footer" v-if="selectedSchedule?.generatedAt">
          <span class="footer-text">生成于 {{ formatTime(selectedSchedule.generatedAt) }}</span>
        </div>
      </div>
    </template>

    <!-- 自动刷新设置 -->
    <AutoRefreshSettings
      :visible="showAutoRefreshSettings"
      @close="showAutoRefreshSettings = false"
      @saved="onAutoRefreshSaved"
    />

    <!-- 编辑时段 -->
    <ScheduleEditHour
      :visible="showEditHour"
      :hour="editHour"
      :existing="editEntry"
      @close="closeEditHour"
      @save="onSaveEditHour"
    />

    <!-- 添加日程 -->
    <ScheduleAddEvent
      :visible="showAddEvent"
      @close="closeAddEvent"
      @save="onSaveAddEvent"
    />
  </div>
</template>

<style scoped>
.schedule-screen {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1c1c1e;
  color: #fff;
}

.schedule-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: max(12px, var(--safe-area-inset-top, 12px));
  background: rgba(28, 28, 30, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.header-spacer {
  width: 60px;
}

.schedule-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-toggle-btn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.5);
  padding: 4px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
}
.edit-toggle-btn.active {
  background: rgba(100, 180, 255, 0.2);
  border-color: rgba(100, 180, 255, 0.5);
  color: #fff;
}

.add-btn {
  background: none;
  border: 1px solid rgba(100, 255, 180, 0.3);
  color: rgba(100, 255, 180, 0.7);
  padding: 4px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
}
.add-btn:hover {
  background: rgba(100, 255, 180, 0.1);
}

.settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
}

.settings-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.refresh-btn {
  padding: 6px 16px;
  background: rgba(255, 204, 0, 0.2);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.schedule-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.schedule-scroll {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 12px;
}

.list-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 12px;
}

.schedule-item {
  display: flex;
  align-items: center;
  padding: 14px 12px;
  background: rgba(44, 44, 46, 0.8);
  border-radius: 12px;
  margin-bottom: 8px;
  cursor: pointer;
}

.item-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #ffd60a, #ffb800);
  border-radius: 10px;
  font-size: 20px;
}

.char-avatar {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-radius: 10px;
  overflow: hidden;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-text {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.item-info {
  flex: 1;
  margin-left: 12px;
}

.item-name {
  font-size: 15px;
  font-weight: 500;
}

.item-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}

.item-chevron {
  color: rgba(255, 255, 255, 0.4);
}

.empty-text {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  padding: 40px 20px;
}

/* 当前状态卡片 */
.current-status-card {
  display: flex;
  align-items: center;
  padding: 16px;
  margin: 12px;
  background: rgba(44, 44, 46, 0.8);
  border-radius: 12px;
}

.status-emoji {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
}

.status-info {
  flex: 1;
  margin-left: 12px;
}

.status-text {
  font-size: 16px;
  font-weight: 600;
}

.status-location {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
}

.status-hint {
  font-size: 12px;
  color: #ff6b6b;
  margin-top: 4px;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  background: rgba(255, 59, 48, 0.2);
  color: #ef9a9a;
}

.status-badge.available {
  background: rgba(52, 199, 89, 0.2);
  color: #a5d6a7;
}

.empty-schedule {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.schedule-footer {
  padding: 12px;
  text-align: center;
}

.footer-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}



  .platform-android.android-portrait .schedule-header {
    background: rgba(28, 28, 30, 0.98) !important;
  }

  .platform-android.android-portrait .settings-btn,
  .platform-android.android-portrait .refresh-btn,
  .platform-android.android-portrait .edit-toggle-btn,
  .platform-android.android-portrait .add-btn {
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