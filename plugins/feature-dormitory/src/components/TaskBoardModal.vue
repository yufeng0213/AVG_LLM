<script setup>
/**
 * 任务板模态框组件
 * 显示任务列表、筛选、领取、提交、完成等功能
 */

import { computed, ref } from 'vue'

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
  'delete-task'
])

const activeFilter = ref('all')
const submitText = ref({})
const expandedTaskId = ref(null)

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

const filteredTasks = computed(() => {
  if (activeFilter.value === 'all') return props.tasks
  return props.tasks.filter((t) => t.type === activeFilter.value)
})

const availableTaskCount = computed(() => {
  return props.tasks.filter((t) => t.status === 'available').length
})

function handleClose() {
  emit('close')
}

function handleGenerate() {
  emit('generate-tasks')
}

function handleAccept(taskId) {
  emit('accept-task', taskId)
}

function handleToggleSubmit(taskId) {
  if (expandedTaskId.value === taskId) {
    expandedTaskId.value = null
    submitText.value[taskId] = ''
    return
  }
  expandedTaskId.value = taskId
  // 自动填入证据描述
  const task = props.tasks.find((t) => t.id === taskId)
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

function formatReward(task) {
  if (task.rewardType === 'coins') return `💰 ${task.rewardAmount} 金币`
  if (task.rewardType === 'crystals') return `💎 ${task.rewardAmount} 晶石`
  if (task.rewardType === 'item') return '🎁 物品奖励'
  return ''
}

function getDifficultyStars(difficulty) {
  return '⭐'.repeat(difficulty)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="task-board-modal">
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

          <div class="task-board-body">
            <!-- Feedback -->
            <div v-if="feedback" class="task-board-feedback">
              {{ feedback }}
            </div>

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

            <!-- Generate Button -->
            <button
              type="button"
              class="task-generate-btn"
              :disabled="isLoading"
              @click="handleGenerate"
            >
              {{ isLoading ? '生成中...' : '✨ 刷新任务 (LLM)' }}
            </button>

            <!-- Task List -->
            <div class="task-board-tasks">
              <div v-if="filteredTasks.length === 0" class="task-board-empty">
                {{ isLoading ? '正在生成任务...' : '暂无任务，点击下方按钮生成' }}
              </div>

              <div
                v-for="task in filteredTasks"
                :key="task.id"
                class="task-card"
                :class="`task-status-${task.status}`"
              >
                <!-- Task Header -->
                <div class="task-card-header">
                  <span class="task-type-badge" :class="`task-type-${task.type}`">
                    {{ TASK_TYPE_LABELS[task.type] }}
                  </span>
                  <span class="task-difficulty">{{ getDifficultyStars(task.difficulty) }}</span>
                </div>

                <!-- Task Name -->
                <h3 class="task-card-name">{{ task.name }}</h3>

                <!-- Task Description -->
                <p class="task-card-desc">{{ task.description }}</p>

                <!-- Reward -->
                <div class="task-card-reward">
                  🎯 奖励：{{ formatReward(task) }}
                </div>

                <!-- Actions -->
                <div class="task-card-actions">
                  <!-- Available -->
                  <template v-if="task.status === 'available'">
                    <button type="button" class="task-action-btn task-accept-btn" @click="handleAccept(task.id)">
                      📌 领取任务
                    </button>
                    <button type="button" class="task-action-btn task-delete-btn" @click="handleDelete(task.id)">
                      ✕
                    </button>
                  </template>

                  <!-- Accepted -->
                  <template v-if="task.status === 'accepted'">
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
  </Teleport>
</template>

<style scoped>
/* Task Board Modal */
.task-board-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}

.task-board-panel {
  width: 100%;
  max-width: 520px;
  max-height: 85vh;
  background: linear-gradient(145deg, #1a1a2e, #16213e);
  border-radius: 16px;
  border: 1px solid rgba(243, 156, 18, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.task-board-header {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
}

.task-board-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.task-board-title {
  margin: 0;
  font-size: 1.2rem;
  color: #ffffff;
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
  gap: 8px;
}

.task-coin-item {
  font-size: 0.8rem;
  color: #f39c12;
}

.task-board-close-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  font-size: 1.2rem;
  color: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.task-board-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-board-feedback {
  padding: 8px 12px;
  background: rgba(46, 204, 113, 0.15);
  border: 1px solid rgba(46, 204, 113, 0.3);
  border-radius: 8px;
  color: #2ecc71;
  font-size: 0.85rem;
}

/* Filters - Tab style */
.task-board-filters {
  display: flex;
  flex-wrap: nowrap;
  gap: 0;
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
  align-items: flex-end;
  overflow-x: auto;
}

.task-filter-btn {
  padding: 10px 14px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  flex: 0 0 auto;
}

.task-filter-btn.active {
  color: #f39c12;
  background: transparent;
  border-bottom: 2px solid #f39c12;
  font-weight: 600;
}

.task-filter-btn:hover:not(.active) {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.05);
}

/* Generate Button */
.task-generate-btn {
  padding: 10px;
  background: linear-gradient(135deg, #f39c12, #e67e22);
  border: none;
  border-radius: 10px;
  color: #ffffff;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.task-generate-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #e67e22, #d35400);
  transform: translateY(-1px);
}

.task-generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Task List */
.task-board-tasks {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-board-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  padding: 24px;
  font-size: 0.9rem;
}

/* Task Card */
.task-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 14px;
  transition: all 0.2s;
}

.task-card.task-status-available {
  border-left: 3px solid #3498db;
}

.task-card.task-status-accepted {
  border-left: 3px solid #f1c40f;
}

.task-card.task-status-submitted {
  border-left: 3px solid #9b59b6;
}

.task-card.task-status-completed {
  border-left: 3px solid #2ecc71;
  opacity: 0.7;
}

.task-card.task-status-in-progress {
  border-left: 3px solid #e67e22;
}

.task-card.task-status-completable {
  border-left: 3px solid #2ecc71;
}

.task-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.task-type-badge {
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 600;
}

.task-type-explore { background: rgba(52, 152, 219, 0.2); color: #3498db; }
.task-type-collect { background: rgba(46, 204, 113, 0.2); color: #2ecc71; }
.task-type-social { background: rgba(155, 89, 182, 0.2); color: #9b59b6; }
.task-type-combat { background: rgba(231, 76, 60, 0.2); color: #e74c3c; }
.task-type-daily { background: rgba(243, 156, 18, 0.2); color: #f39c12; }

.task-difficulty {
  font-size: 0.7rem;
}

.task-card-name {
  margin: 0 0 4px;
  font-size: 0.95rem;
  color: #ffffff;
  font-weight: 600;
}

.task-card-desc {
  margin: 0 0 8px;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.4;
}

.task-card-reward {
  font-size: 0.8rem;
  color: #f39c12;
  margin-bottom: 10px;
}

/* Task Actions */
.task-card-actions {
  display: flex;
  gap: 8px;
}

.task-action-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.task-accept-btn {
  background: rgba(52, 152, 219, 0.2);
  color: #3498db;
  border: 1px solid rgba(52, 152, 219, 0.3);
  flex: 1;
}

.task-accept-btn:hover {
  background: rgba(52, 152, 219, 0.3);
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
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.8rem;
  cursor: pointer;
}

.task-submit-confirm {
  padding: 6px 14px;
  background: rgba(243, 156, 18, 0.2);
  border: 1px solid rgba(243, 156, 18, 0.4);
  border-radius: 8px;
  color: #f39c12;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

/* Android竖屏适配 */
.platform-android.android-portrait .task-board-panel {
  max-width: 100% !important;
  max-height: 95vh !important;
  border-radius: 12px !important;
}

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
  border-bottom: 2px solid #f39c12 !important;
  background: transparent !important;
  color: #f39c12 !important;
  font-weight: 600 !important;
}

.platform-android.android-portrait .task-generate-btn {
  min-height: 40px !important;
  height: auto !important;
  padding: 8px 16px !important;
  font-size: 0.85rem !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  white-space: nowrap !important;
  box-sizing: border-box !important;
  border-radius: 10px !important;
}

.platform-android.android-portrait .task-action-btn {
  min-height: 36px !important;
  height: auto !important;
  padding: 6px 12px !important;
  font-size: 0.8rem !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  white-space: nowrap !important;
  box-sizing: border-box !important;
}

.platform-android.android-portrait .task-accept-btn,
.platform-android.android-portrait .task-submit-toggle-btn,
.platform-android.android-portrait .task-complete-btn {
  flex: 1 1 0 !important;
  min-width: 0 !important;
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
