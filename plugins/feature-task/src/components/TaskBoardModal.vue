<script setup>
/**
 * 任务板模态框组件
 * 显示任务列表、筛选、领取、提交、完成等功能
 */

import { computed, ref, watch, nextTick } from 'vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  tasks: {
    type: Array,
    default: () => []
  },
  isLoading: {
    type: Boolean,
    default: false
  },
  feedback: {
    type: String,
    default: ''
  },
  coins: {
    type: Number,
    default: 0
  },
  crystals: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits([
  'close',
  'generate-tasks',
  'accept-task',
  'submit-task',
  'complete-task',
  'delete-task',
  'team-battle',
])

const activeFilter = ref('all')
const submitText = ref({})
const expandedTaskId = ref(null)

// 确认接任务弹窗
const confirmTask = ref(null)

// 气泡提示
const feedbackToast = ref({ visible: false, message: '' })
let feedbackTimer = null

function showFeedbackToast(message) {
  if (!message) return
  feedbackToast.value = { visible: true, message }
  clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => {
    feedbackToast.value.visible = false
  }, 3000)
}

watch(() => props.feedback, (val) => {
  if (val) showFeedbackToast(val)
})

// 下拉刷新 — 用 Vue 模板 ref 代替 inline handler
const PULL_DEADZONE = 5
const PULL_THRESHOLD = 60
const MAX_PULL = 120

const pullState = ref({ pulling: false, pulled: false, distance: 0 })
const pullContainerEl = ref(null)
let pullStartY = 0
let touchId = null
let listenersAttached = false

function onTouchStart(e) {
  if (props.isLoading) return
  const container = pullContainerEl.value
  if (!container) return
  if (container.scrollTop > 0) return
  pullStartY = e.touches[0].clientY
  touchId = e.touches[0].identifier
  pullState.value = { pulling: true, pulled: false, distance: 0 }
}

function onTouchMove(e) {
  if (!pullState.value.pulling) return

  let touch = null
  for (let i = 0; i < e.touches.length; i++) {
    if (e.touches[i].identifier === touchId) {
      touch = e.touches[i]
      break
    }
  }
  if (!touch) return

  const deltaY = touch.clientY - pullStartY
  if (deltaY < PULL_DEADZONE) return
  e.preventDefault()

  const clamped = Math.min(deltaY, MAX_PULL)
  pullState.value.distance = clamped
  pullState.value.pulled = clamped >= PULL_THRESHOLD
}

function onTouchEnd(e) {
  if (!pullState.value.pulling) return
  pullState.value.pulling = false

  if (pullState.value.distance >= PULL_DEADZONE) {
    e.preventDefault()
    if (pullState.value.pulled) {
      handleGenerate()
    }
  }
  pullState.value.distance = 0
  pullState.value.pulled = false
  touchId = null
}

function attachPullListeners() {
  const el = pullContainerEl.value
  if (!el) {
    console.warn('[TaskBoard] attachPullListeners: container ref is null')
    return
  }
  if (listenersAttached) return

  el.addEventListener('touchstart', onTouchStart, { passive: true })
  el.addEventListener('touchmove', onTouchMove, { passive: false })
  el.addEventListener('touchend', onTouchEnd, { passive: false })
  listenersAttached = true
  console.log('[TaskBoard] pull listeners attached')
}

function removePullListeners() {
  const el = pullContainerEl.value
  if (!el) return
  el.removeEventListener('touchstart', onTouchStart)
  el.removeEventListener('touchmove', onTouchMove)
  el.removeEventListener('touchend', onTouchEnd)
  listenersAttached = false
  console.log('[TaskBoard] pull listeners removed')
}

function onRefreshComplete() {
  pullState.value = { pulling: false, pulled: false, distance: 0 }
}

watch(() => props.isLoading, (val) => {
  if (!val) onRefreshComplete()
})

watch(() => props.isOpen, (val) => {
  if (val) {
    nextTick(() => {
      attachPullListeners()
    })
  } else {
    removePullListeners()
    onRefreshComplete()
  }
})

const TASK_TYPES = [
  { id: 'all', label: '全部', icon: '📋' },
  { id: 'explore', label: '探索', icon: '🗺️' },
  { id: 'collect', label: '收集', icon: '🎒' },
  { id: 'social', label: '社交', icon: '🤝' },
  { id: 'combat', label: '战斗', icon: '⚔️' },
  { id: 'daily', label: '日常', icon: '📝' },
]

const TASK_TYPE_LABELS = TASK_TYPES.reduce((acc, t) => {
  acc[t.id] = t.label
  return acc
}, {})

const safeTasks = computed(() => {
  const tasks = props.tasks
  return Array.isArray(tasks) ? tasks.filter(Boolean) : []
})

const filteredTasks = computed(() => {
  if (activeFilter.value === 'all') return safeTasks.value
  return safeTasks.value.filter((t) => t.type === activeFilter.value)
})

const availableTaskCount = computed(() => {
  return safeTasks.value.filter((t) => t.status === 'available').length
})

function handleClose() {
  emit('close')
}

function handleGenerate() {
  emit('generate-tasks')
}

function handleAccept(taskId) {
  const task = safeTasks.value.find((t) => t.id === taskId)
  if (!task) return
  confirmTask.value = task
}

function handleConfirmAccept() {
  if (confirmTask.value) {
    emit('accept-task', confirmTask.value.id)
    confirmTask.value = null
  }
}

function handleCancelAccept() {
  confirmTask.value = null
}

function handleToggleSubmit(taskId) {
  if (expandedTaskId.value === taskId) {
    expandedTaskId.value = null
    submitText.value[taskId] = ''
    return
  }
  expandedTaskId.value = taskId
  // 自动填入证据描述
  const task = safeTasks.value.find((t) => t.id === taskId)
  if (task?.status === 'completable' && task.evidence?.summary) {
    submitText.value[taskId] = task.evidence.summary
  } else {
    submitText.value[taskId] = ''
  }
}

function handleSubmit(taskId) {
  const text = submitText.value[taskId]?.trim() || ''
  emit('submit-task', taskId, text)
  expandedTaskId.value = null
  submitText.value[taskId] = ''
}

function handleComplete(taskId) {
  emit('complete-task', taskId)
}

function handleDelete(taskId) {
  emit('delete-task', taskId)
}

function handleTeamBattle(task) {
  emit('team-battle', task)
}

function formatReward(task) {
  if (task.rewardType === 'coins') return `💰 ${task.rewardAmount} 金币`
  if (task.rewardType === 'crystals') return `💎 ${task.rewardAmount} 晶石`
  if (task.rewardType === 'item') return '🎁 物品奖励'
  return ''
}

function getDifficultyStars(difficulty) {
  return '⭐'.repeat(difficulty)
}

function getTypeIcon(typeId) {
  const type = TASK_TYPES.find((t) => t.id === typeId)
  return type?.icon || '📋'
}
</script>

<template>
  <Teleport to="body">
    <Transition name="task-panel-modal">
      <div v-if="isOpen" class="task-board-overlay" @click.self="handleClose">
        <section class="task-board-panel">
          <!-- Header -->
          <header class="task-board-header">
            <div class="task-board-title-group">
              <h2 class="task-board-title">📋 任务板</h2>
              <span class="task-board-count" v-if="availableTaskCount > 0">{{ availableTaskCount }} 个可接取</span>
            </div>
            <div class="task-board-coins">
              <span class="task-coin-item">💰 {{ coins }}</span>
              <span class="task-coin-item">💎 {{ crystals }}</span>
            </div>
            <button type="button" class="task-board-close-btn" @click="handleClose">×</button>
          </header>

          <div
            ref="pullContainerEl"
            class="task-board-body"
          >
            <!-- Filters -->
            <div class="task-board-filters">
              <button
                v-for="type in TASK_TYPES"
                :key="type.id"
                type="button"
                class="task-filter-btn"
                :class="{ active: activeFilter === type.id }"
                @click="activeFilter = type.id"
              >
                {{ type.icon }} {{ type.label }}
              </button>
            </div>

            <!-- 下拉刷新中转圈提示 -->
            <div v-if="isLoading" class="task-refresh-spinner">
              <span class="spinner-icon"></span>
              <span class="spinner-text">正在生成新任务…</span>
            </div>

            <!-- Task List -->
            <div class="task-board-tasks">
              <div v-if="filteredTasks.length === 0" class="task-board-empty">
                {{ isLoading ? '正在生成任务…' : '暂无任务，请下拉刷新。' }}
              </div>

              <div
                v-for="task in filteredTasks"
                :key="task.id"
                class="task-card"
                :class="`task-status-${task.status}`"
              >
                <!-- 左侧类型图标 -->
                <div class="task-icon-area">
                  <span class="task-icon-emoji">{{ getTypeIcon(task.type) }}</span>
                </div>

                <!-- 右侧信息 -->
                <div class="task-info-area">
                  <div class="task-info-header">
                    <h3 class="task-card-name">{{ task.name }}</h3>
                    <span class="task-difficulty">{{ getDifficultyStars(task.difficulty) }}</span>
                  </div>
                  <p class="task-card-desc">{{ task.description }}</p>
                </div>

                <!-- 底部奖励+操作 -->
                <div class="task-card-footer">
                  <div class="task-reward-info">
                    {{ formatReward(task) }}
                  </div>
                  <div class="task-card-actions">
                    <!-- Available -->
                    <template v-if="task.status === 'available'">
                      <button type="button" class="task-action-btn task-accept-btn" @click="handleAccept(task.id)">
                        领取
                      </button>
                      <button type="button" class="task-action-btn task-delete-btn" @click="handleDelete(task.id)">
                        删除
                      </button>
                    </template>

                    <!-- Accepted -->
                    <template v-if="task.status === 'accepted'">
                      <button type="button" class="task-action-btn task-battle-btn" @click="handleTeamBattle(task)">
                        ⚔️ 组队战斗
                      </button>
                      <button type="button" class="task-action-btn task-submit-toggle-btn" @click="handleToggleSubmit(task.id)">
                        📤 提交完成报告
                      </button>
                    </template>

                    <!-- In Progress -->
                    <template v-if="task.status === 'in_progress'">
                      <span class="task-in-progress-label">🎮 执行中</span>
                    </template>

                    <!-- Completable -->
                    <template v-if="task.status === 'completable'">
                      <button type="button" class="task-action-btn task-battle-btn" @click="handleTeamBattle(task)">
                        ⚔️ 组队战斗
                      </button>
                      <button type="button" class="task-action-btn task-complete-btn" @click="handleToggleSubmit(task.id)">
                        📤 提交任务（有证据）
                      </button>
                    </template>

                    <!-- Submitted -->
                    <template v-if="task.status === 'submitted'">
                      <button type="button" class="task-action-btn task-complete-btn" @click="handleComplete(task.id)">
                        ✅ 领取奖励
                      </button>
                    </template>

                    <!-- Completed -->
                    <template v-if="task.status === 'completed'">
                      <span class="task-completed-label">✅ 已完成</span>
                      <button type="button" class="task-action-btn task-delete-btn" @click="handleDelete(task.id)">
                        ✕
                      </button>
                    </template>
                  </div>
                </div>

                <!-- Submit Textarea -->
                <div v-if="(task.status === 'accepted' || task.status === 'completable') && expandedTaskId === task.id" class="task-submit-area">
                  <textarea
                    v-model="submitText[task.id]"
                    class="task-submit-textarea"
                    :placeholder="task.status === 'completable' ? '任务证据已自动填入，可补充说明...' : '描述你是如何完成这个任务的...'"
                    rows="3"
                    maxlength="500"
                  ></textarea>
                  <div class="task-submit-actions">
                    <button type="button" class="task-submit-cancel" @click="expandedTaskId = null; submitText[task.id] = ''">取消</button>
                    <button type="button" class="task-submit-confirm" @click="handleSubmit(task.id)">提交</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Transition>

    <!-- 确认接任务弹窗 -->
    <Transition name="task-confirm">
      <div v-if="confirmTask" class="task-confirm-overlay" @click.self="handleCancelAccept">
        <div class="task-confirm-dialog">
          <!-- 类型大图标居中 -->
          <div class="confirm-task-icon">
            <span class="confirm-task-emoji">{{ getTypeIcon(confirmTask.type) }}</span>
          </div>

          <!-- 任务名称 -->
          <h3 class="confirm-task-name">{{ confirmTask.name }}</h3>

          <!-- 任务描述 -->
          <p class="confirm-task-desc">{{ confirmTask.description }}</p>

          <!-- 难度+奖励 徽章 -->
          <div class="confirm-task-badge">
            <span class="badge-difficulty">{{ getDifficultyStars(confirmTask.difficulty) }}</span>
            <span class="badge-separator">·</span>
            <span class="badge-reward">{{ formatReward(confirmTask) }}</span>
          </div>

          <!-- 确认提示 -->
          <p class="confirm-task-hint">确认接取此任务吗？</p>

          <!-- 按钮 -->
          <div class="confirm-task-actions">
            <button type="button" class="confirm-btn cancel" @click="handleCancelAccept">取消</button>
            <button type="button" class="confirm-btn accept" @click="handleConfirmAccept">确认领取</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 反馈 Toast -->
    <Transition name="task-toast">
      <div v-if="feedbackToast.visible" class="task-toast-overlay">
        <div class="task-toast-bubble">
          {{ feedbackToast.message }}
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Task Board Modal */
.task-panel-modal-enter-active,
.task-panel-modal-leave-active {
  transition: opacity 0.3s ease;
}

.task-panel-modal-enter-from,
.task-panel-modal-leave-to {
  opacity: 0;
}

.task-board-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--background, #0a0a0a);
  color: var(--foreground, #ffffff);
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.task-board-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.task-board-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.task-board-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.task-board-title {
  margin: 0;
  font-size: 18px;
  color: var(--foreground, #ffffff);
}

.task-board-count {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
}

.task-board-coins {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.task-coin-item {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
}

.task-board-close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: color-mix(in srgb, var(--foreground, #ffffff) 50%, transparent);
  padding: 4px 8px;
}
  .platform-android.android-portrait .task-board-close-btn  {
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
.task-board-close-btn:hover {
  color: var(--foreground, #ffffff);
}

.task-board-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  overscroll-behavior-y: none;
}

.task-refresh-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 0;
  color: var(--accent-cyan, #00d4ff);
  font-size: 0.85rem;
}

.spinner-icon {
  width: 18px;
  height: 18px;
  border: 2px solid color-mix(in srgb, var(--accent-cyan, #00d4ff) 25%, transparent);
  border-top-color: var(--accent-cyan, #00d4ff);
  border-radius: 50%;
  animation: task-spinner-spin 0.8s linear infinite;
}

@keyframes task-spinner-spin {
  to { transform: rotate(360deg); }
}

/* Filters - Tab style */
.task-board-filters {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  overflow-x: auto;
  flex-shrink: 0;
  align-items: flex-end;
}

.task-board-filters::-webkit-scrollbar {
  display: none;
}

.task-filter-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: color-mix(in srgb, var(--foreground, #ffffff) 50%, transparent);
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.2s;
  flex: 0 0 auto;
  position: relative;
}
  .platform-android.android-portrait .task-filter-btn {
    flex: 0 0 auto !important;  /* 不伸缩，按内容宽度显示 */
    min-width: auto !important;
    max-width: none !important;
    width: auto !important;
    box-sizing: border-box !important;
    padding: 16px !important;
  }



/* Toast */
.task-toast-overlay {
  position: fixed;
  top: 60px;
  left: 0;
  right: 0;
  z-index: 2000;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.task-toast-bubble {
  padding: 12px 24px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.08) 0%,
    rgba(255, 255, 255, 0.02) 100%
  );
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  color: var(--accent-cyan, #ffffff);
  font-size: 0.85rem;
  font-weight: 500;
  text-align: center;
  max-width: 85%;
  pointer-events: none;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.task-toast-enter-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.task-toast-leave-active {
  transition: all 0.3s ease-in;
}

.task-toast-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}

.task-toast-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

/* Task List */
.task-board-tasks {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.task-board-empty {
  text-align: center;
  color: color-mix(in srgb, var(--foreground, #ffffff) 40%, transparent);
  padding: 24px;
  font-size: 0.9rem;
}

/* Task Card - 磨砂玻璃 iOS16 风格 */
.task-card {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.07) 0%,
    rgba(255, 255, 255, 0.02) 100%
  );
  backdrop-filter: blur(20px) saturate(1.3);
  -webkit-backdrop-filter: blur(20px) saturate(1.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 16px;
  transition: all 0.25s ease;
  position: relative;
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
  .platform-android.android-portrait .task-card {
    flex: 0 0 auto !important;  /* 不伸缩，按内容宽度显示 */
    min-width: auto !important;
    max-width: none !important;
    width: auto !important;
    box-sizing: border-box !important;
    padding: 16px !important;
  }
.task-card:hover {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.09) 0%,
    rgba(255, 255, 255, 0.03) 100%
  );
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

/* 状态通过顶部小标签体现，不通过左边框 */
.task-card::before {
  content: '';
  position: absolute;
  top: 12px;
  right: 12px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.task-card.task-status-available::before {
  background: #3498db;
  box-shadow: 0 0 8px rgba(52, 152, 219, 0.5);
}

.task-card.task-status-accepted::before {
  background: #f1c40f;
  box-shadow: 0 0 8px rgba(241, 196, 15, 0.5);
}

.task-card.task-status-submitted::before {
  background: #9b59b6;
  box-shadow: 0 0 8px rgba(155, 89, 182, 0.5);
}

.task-card.task-status-completed {
  opacity: 0.55;
}

.task-card.task-status-completed::before {
  background: #2ecc71;
  box-shadow: 0 0 8px rgba(46, 204, 113, 0.4);
}

.task-card.task-status-in-progress::before {
  background: #e67e22;
  box-shadow: 0 0 8px rgba(230, 126, 34, 0.5);
}

.task-card.task-status-completable::before {
  background: #2ecc71;
  box-shadow: 0 0 8px rgba(46, 204, 113, 0.5);
  animation: status-pulse 2s ease-in-out infinite;
}

@keyframes status-pulse {
  0%, 100% { box-shadow: 0 0 6px rgba(46, 204, 113, 0.4); }
  50% { box-shadow: 0 0 14px rgba(46, 204, 113, 0.7); }
}

/* 左侧类型图标区 - 无背景 */
.task-icon-area {
  position: absolute;
  top: 16px;
  left: 16px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.task-icon-emoji {
  font-size: 2rem;
  line-height: 1;
}

/* 右侧信息区 */
.task-info-area {
  margin-left: 58px;
  margin-bottom: 12px;
}

.task-info-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.task-card-name {
  margin: 0;
  font-size: 0.95rem;
  color: var(--foreground, #ffffff);
  font-weight: 600;
  line-height: 1.3;
}

.task-difficulty {
  font-size: 0.6rem;
  flex-shrink: 0;
  line-height: 1.3;
}

.task-card-desc {
  margin: 5px 0 0;
  font-size: 0.78rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 45%, transparent);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 底部奖励+操作 */
.task-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.task-reward-info {
  font-size: 0.82rem;
  color: #f39c12;
  font-weight: 600;
  white-space: nowrap;
}

/* Task Actions */
.task-card-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}

.task-action-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 12px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  backdrop-filter: blur(10px) saturate(1.2);
  -webkit-backdrop-filter: blur(10px) saturate(1.2);
}
  .platform-android.android-portrait .task-action-btn{
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
.task-accept-btn {
  background: linear-gradient(
    135deg,
    rgba(0, 212, 255, 0.25) 0%,
    rgba(0, 150, 255, 0.15) 100%
  );
  color: var(--accent-cyan, #00d4ff);
  border: 1px solid rgba(0, 212, 255, 0.3);
}

.task-accept-btn:hover {
  background: linear-gradient(
    135deg,
    rgba(0, 212, 255, 0.35) 0%,
    rgba(0, 150, 255, 0.2) 100%
  );
  border-color: rgba(0, 212, 255, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 212, 255, 0.2);
}

.task-accept-btn:active {
  transform: translateY(0);
  box-shadow: none;
}

.task-battle-btn {
  background: linear-gradient(
    135deg,
    rgba(231, 76, 60, 0.25) 0%,
    rgba(231, 76, 60, 0.1) 100%
  );
  color: #e74c3c;
  border: 1px solid rgba(231, 76, 60, 0.3);
}

.task-battle-btn:hover {
  background: linear-gradient(
    135deg,
    rgba(231, 76, 60, 0.35) 0%,
    rgba(231, 76, 60, 0.18) 100%
  );
  border-color: rgba(231, 76, 60, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(231, 76, 60, 0.2);
}

.task-battle-btn:active {
  transform: translateY(0);
  box-shadow: none;
}

.task-submit-toggle-btn {
  background: linear-gradient(
    135deg,
    rgba(241, 196, 15, 0.2) 0%,
    rgba(241, 196, 15, 0.08) 100%
  );
  color: #f1c40f;
  border: 1px solid rgba(241, 196, 15, 0.25);
}

.task-submit-toggle-btn:hover {
  background: linear-gradient(
    135deg,
    rgba(241, 196, 15, 0.3) 0%,
    rgba(241, 196, 15, 0.15) 100%
  );
  border-color: rgba(241, 196, 15, 0.4);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(241, 196, 15, 0.15);
}

.task-complete-btn {
  background: linear-gradient(
    135deg,
    rgba(46, 204, 113, 0.2) 0%,
    rgba(46, 204, 113, 0.08) 100%
  );
  color: #2ecc71;
  border: 1px solid rgba(46, 204, 113, 0.25);
}

.task-complete-btn:hover {
  background: linear-gradient(
    135deg,
    rgba(46, 204, 113, 0.3) 0%,
    rgba(46, 204, 113, 0.15) 100%
  );
  border-color: rgba(46, 204, 113, 0.4);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(46, 204, 113, 0.15);
}

.task-delete-btn {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.06) 0%,
    rgba(255, 255, 255, 0.02) 100%
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: rgba(255, 255, 255, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.task-delete-btn:hover {
  background: linear-gradient(
    135deg,
    rgba(231, 76, 60, 0.15) 0%,
    rgba(231, 76, 60, 0.05) 100%
  );
  color: #e74c3c;
  border-color: rgba(231, 76, 60, 0.25);
}

.task-submit-toggle-btn {
  background: rgba(241, 196, 15, 0.2);
  color: #f1c40f;
  border: 1px solid rgba(241, 196, 15, 0.3);
  flex: 1;
}

.task-submit-toggle-btn:hover {
  background: rgba(241, 196, 15, 0.3);
}

.task-complete-btn {
  background: rgba(46, 204, 113, 0.2);
  color: #2ecc71;
  border: 1px solid rgba(46, 204, 113, 0.3);
  flex: 1;
}

.task-complete-btn:hover {
  background: rgba(46, 204, 113, 0.3);
}

.task-delete-btn {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.task-delete-btn:hover {
  background: rgba(231, 76, 60, 0.2);
  color: #e74c3c;
}

.task-completed-label {
  font-size: 0.8rem;
  color: #2ecc71;
  padding: 6px 14px;
}

.task-in-progress-label {
  font-size: 0.8rem;
  color: #e67e22;
  padding: 6px 14px;
}

/* Submit Area */
.task-submit-area {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.task-submit-textarea {
  width: 100%;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #ffffff;
  font-size: 0.85rem;
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
}

.task-submit-textarea:focus {
  outline: none;
  border-color: rgba(243, 156, 18, 0.5);
}

.task-submit-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  justify-content: flex-end;
}

.task-submit-cancel {
  padding: 8px 16px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.06) 0%,
    rgba(255, 255, 255, 0.02) 100%
  );
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: none;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}
  .platform-android.android-portrait .task-submit-cancel {
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
.task-submit-cancel:hover {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.1) 0%,
    rgba(255, 255, 255, 0.04) 100%
  );
  color: rgba(255, 255, 255, 0.7);
}

.task-submit-confirm {
  padding: 8px 16px;
  background: linear-gradient(
    135deg,
    rgba(243, 156, 18, 0.25) 0%,
    rgba(243, 156, 18, 0.1) 100%
  );
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(243, 156, 18, 0.35);
  border-radius: 10px;
  color: #f39c12;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.task-submit-confirm:hover {
  background: linear-gradient(
    135deg,
    rgba(243, 156, 18, 0.35) 0%,
    rgba(243, 156, 18, 0.18) 100%
  );
  border-color: rgba(243, 156, 18, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(243, 156, 18, 0.2);
}

.task-submit-confirm:active {
  transform: translateY(0);
  box-shadow: none;
}

/* 确认接任务弹窗（方案B：居中RPG风格） */
.task-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 24px;
}

.task-confirm-dialog {
  width: 100%;
  max-width: 360px;
  background: linear-gradient(145deg, #1a1a2e, #16213e);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 28px 24px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.confirm-task-icon {
  width: 72px;
  height: 72px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  background: none;
}

.confirm-task-emoji {
  font-size: 2.4rem;
  line-height: 1;
}

.confirm-task-name {
  margin: 0 0 6px;
  font-size: 1.1rem;
  color: #ffffff;
  font-weight: 600;
  text-align: center;
}

.confirm-task-desc {
  margin: 0 0 16px;
  font-size: 0.82rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 55%, transparent);
  line-height: 1.45;
  text-align: center;
  max-width: 90%;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.confirm-task-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 10px;
  font-size: 0.8rem;
  color: #f39c12;
  margin-bottom: 14px;
}

.badge-separator {
  color: rgba(255, 255, 255, 0.25);
}

.badge-reward {
  font-weight: 600;
}

.confirm-task-hint {
  margin: 0 0 16px;
  font-size: 0.82rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 45%, transparent);
}

.confirm-task-actions {
  display: flex;
  gap: 10px;
  width: 100%;
}

.confirm-btn {
  flex: 1;
  padding: 12px 16px;
  border: none;
  border-radius: 14px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
}
  .platform-android.android-portrait .confirm-btn {
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
.confirm-btn.cancel {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.08) 0%,
    rgba(255, 255, 255, 0.02) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
}

.confirm-btn.cancel:hover {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.12) 0%,
    rgba(255, 255, 255, 0.05) 100%
  );
  border-color: rgba(255, 255, 255, 0.18);
  color: var(--foreground, #ffffff);
}

.confirm-btn.accept {
  background: linear-gradient(
    135deg,
    rgba(0, 212, 255, 0.3) 0%,
    rgba(0, 150, 255, 0.18) 100%
  );
  border: 1px solid rgba(0, 212, 255, 0.35);
  color: var(--accent-cyan, #00d4ff);
}

.confirm-btn.accept:hover {
  background: linear-gradient(
    135deg,
    rgba(0, 212, 255, 0.4) 0%,
    rgba(0, 150, 255, 0.25) 100%
  );
  border-color: rgba(0, 212, 255, 0.55);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(0, 212, 255, 0.25);
}

.confirm-btn.accept:active {
  transform: translateY(0);
  box-shadow: none;
}

.task-confirm-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.task-confirm-leave-active {
  transition: all 0.2s ease-in;
}

.task-confirm-enter-from {
  opacity: 0;
  transform: scale(0.9);
}

.task-confirm-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* Android竖屏适配 */
.platform-android.android-portrait .task-board-header {
  padding: 12px 16px !important;
  padding-right: 48px !important;
  overflow: hidden !important;
}

.platform-android.android-portrait .task-board-title-group {
  min-width: 0 !important;
  overflow: hidden !important;
}

.platform-android.android-portrait .task-board-title {
  font-size: 1.1rem !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.platform-android.android-portrait .task-board-coins {
  flex-shrink: 0 !important;
}

.platform-android.android-portrait .task-board-close-btn {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  flex-shrink: 0 !important;
  box-sizing: border-box !important;
}

.platform-android.android-portrait .task-board-filters {
  flex-wrap: nowrap !important;
  border-bottom: 2px solid rgba(255, 255, 255, 0.15) !important;
  overflow-x: auto !important;
}

.platform-android.android-portrait .task-filter-btn {
  padding: 10px 14px !important;
  font-size: 0.8rem !important;
  white-space: nowrap !important;
  box-sizing: border-box !important;
  border-radius: 0 !important;
  border: none !important;
  background: transparent !important;
  flex-grow: 0 !important;
  flex-shrink: 0 !important;
  height: auto !important;
  min-height: 36px !important;
}

.platform-android.android-portrait .task-filter-btn.active {
  border-bottom: 2px solid var(--accent-cyan, #00d4ff) !important;
  background: transparent !important;
  color: var(--accent-cyan, #00d4ff) !important;
  font-weight: 600 !important;
}

.platform-android.android-portrait .task-action-btn {
  min-height: 40px !important;
  height: auto !important;
  padding: 8px 16px !important;
  font-size: 0.82rem !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  white-space: nowrap !important;
  box-sizing: border-box !important;
}


.platform-android.android-portrait .task-delete-btn {
  width: 36px !important;
  height: 36px !important;
  min-height: 36px !important;
  max-height: 36px !important;
  min-width: 36px !important;
  max-width: 36px !important;
  flex: 0 0 36px !important;
  font-size: 1rem !important;
  line-height: 1 !important;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-sizing: border-box !important;
  border-radius: 8px !important;
}

.platform-android.android-portrait .task-submit-textarea {
  min-height: 60px !important;
  padding: 8px 10px !important;
  font-size: 0.8rem !important;
  box-sizing: border-box !important;
}

.platform-android.android-portrait .task-submit-cancel,
.platform-android.android-portrait .task-submit-confirm {
  min-height: 36px !important;
  height: auto !important;
  padding: 6px 14px !important;
  font-size: 0.8rem !important;
  white-space: nowrap !important;
  box-sizing: border-box !important;
}
</style>
