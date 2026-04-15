<script setup>
/**
 * GlobalTaskBoard.vue - 全局任务板面板
 * 任务随机刷新时选取一个世界书作为上下文，奖励存入全局经济。
 */
import { useGlobalTaskBoard } from '../composables/useGlobalTaskBoard.js'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const task = useGlobalTaskBoard()

const handleClose = () => {
  task.handleCloseTaskBoard()
  emit('close')
}

const statusLabel = (status) => {
  const map = {
    available: '可接受',
    accepted: '已接受',
    in_progress: '进行中',
    submitted: '待提交',
    completed: '已完成',
    completable: '可完成',
  }
  return map[status] || status
}

const rewardLabel = (t) => {
  if (!t) return ''
  if (t.rewardType === 'coins') return `💰 ${t.rewardAmount} 金币`
  if (t.rewardType === 'crystals') return `💎 ${t.rewardAmount} 晶石`
  if (t.rewardType === 'item') return `🎁 ${t.name}`
  return ''
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="isOpen" class="global-task-modal" @click.self="handleClose">
        <div class="global-task-panel">
          <!-- 顶部 -->
          <header class="task-header">
            <h2 class="task-title">📋 任务板</h2>
            <button type="button" class="task-close-btn" @click="handleClose">✕</button>
          </header>

          <!-- 操作栏 -->
          <div class="task-toolbar">
            <button
              type="button"
              class="task-generate-btn"
              :disabled="task.taskBoardGenerating"
              @click="task.handleGenerateTaskBoardTasks"
            >
              {{ task.taskBoardGenerating ? '生成中...' : '🎲 刷新任务' }}
            </button>
            <span v-if="task.taskBoardFeedback" class="task-feedback">{{ task.taskBoardFeedback }}</span>
          </div>

          <!-- 任务列表 -->
          <div class="task-list">
            <div
              v-for="t in task.taskBoardTasks"
              :key="t.id"
              class="task-card"
              :class="`task-status-${t.status}`"
            >
              <div class="task-card-header">
                <span class="task-type-tag">{{ t.type }}</span>
                <span v-if="t.sourceBookTitle" class="task-book-tag">《{{ t.sourceBookTitle }}》</span>
                <span class="task-status-label">{{ statusLabel(t.status) }}</span>
              </div>
              <h3 class="task-name">{{ t.name }}</h3>
              <p class="task-desc">{{ t.description || t.objective || '' }}</p>
              <div class="task-reward">
                <span class="task-reward-label">奖励：</span>
                <span class="task-reward-value">{{ rewardLabel(t) }}</span>
              </div>
              <div class="task-actions">
                <button
                  v-if="t.status === 'available'"
                  type="button"
                  class="task-accept-btn"
                  @click="task.handleAcceptTaskBoardTask(t.id)"
                >
                  接受
                </button>
                <button
                  v-if="t.status === 'accepted' || t.status === 'in_progress'"
                  type="button"
                  class="task-submit-btn"
                  @click="task.handleTaskInviteClick(t.id)"
                >
                  执行
                </button>
                <button
                  v-if="t.status === 'submitted'"
                  type="button"
                  class="task-claim-btn"
                  @click="task.handleCompleteTaskBoardTask(t.id)"
                >
                  领取奖励
                </button>
                <button
                  type="button"
                  class="task-delete-btn"
                  @click="task.handleDeleteTaskBoardTask(t.id)"
                >
                  删除
                </button>
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="task.taskBoardTasks.length === 0" class="task-empty">
            <p>暂无任务</p>
            <p class="task-empty-hint">点击"刷新任务"获取新任务</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.global-task-modal {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.global-task-panel {
  width: min(92vw, 560px);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--background, #0a0a0a);
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 12%, transparent);
  border-radius: 18px;
  overflow: hidden;
  color: var(--foreground, #ffffff);
}

.task-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 8%, transparent);
}

.task-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  flex: 1;
}

.task-close-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 15%, transparent);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--foreground, #ffffff);
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 150ms ease;
}

.task-close-btn:hover {
  background: color-mix(in srgb, var(--foreground, #ffffff) 10%, transparent);
}

.task-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 6%, transparent);
}

.task-generate-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--accent-cyan, #6872D9) 25%, transparent);
  border-radius: 10px;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--accent-cyan, #6872D9) 8%, transparent);
  color: var(--foreground, #ffffff);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.task-generate-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-cyan, #6872D9) 15%, transparent);
}

.task-generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.task-feedback {
  font-size: 0.78rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 55%, transparent);
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 20px;
  overflow-y: auto;
  min-height: 0;
  flex: 1;
}

.task-card {
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 8%, transparent);
  background: color-mix(in srgb, var(--foreground, #ffffff) 4%, transparent);
}

.task-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.task-type-tag {
  font-size: 0.68rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-cyan, #6872D9) 10%, transparent);
  color: color-mix(in srgb, var(--accent-cyan, #6872D9) 70%, transparent);
  text-transform: capitalize;
}

.task-book-tag {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-magenta, #5E6AD2) 8%, transparent);
  color: color-mix(in srgb, var(--accent-magenta, #5E6AD2) 60%, transparent);
}

.task-status-label {
  font-size: 0.68rem;
  margin-left: auto;
  color: color-mix(in srgb, var(--foreground, #ffffff) 40%, transparent);
}

.task-name {
  margin: 0 0 4px;
  font-size: 0.95rem;
  font-weight: 600;
}

.task-desc {
  margin: 0 0 8px;
  font-size: 0.8rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 50%, transparent);
  line-height: 1.4;
}

.task-reward {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.82rem;
  margin-bottom: 8px;
}

.task-reward-label {
  color: color-mix(in srgb, var(--foreground, #ffffff) 40%, transparent);
}

.task-reward-value {
  color: color-mix(in srgb, var(--accent-yellow, #F5C542) 70%, transparent);
  font-weight: 600;
}

.task-actions {
  display: flex;
  gap: 8px;
}

.task-accept-btn,
.task-submit-btn,
.task-claim-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--accent-cyan, #6872D9) 25%, transparent);
  border-radius: 8px;
  padding: 4px 14px;
  background: color-mix(in srgb, var(--accent-cyan, #6872D9) 8%, transparent);
  color: var(--foreground, #ffffff);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.task-accept-btn:hover,
.task-submit-btn:hover,
.task-claim-btn:hover {
  background: color-mix(in srgb, var(--accent-cyan, #6872D9) 15%, transparent);
}

.task-delete-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--accent-red, #D94040) 20%, transparent);
  border-radius: 8px;
  padding: 4px 14px;
  background: transparent;
  color: color-mix(in srgb, var(--accent-red, #D94040) 60%, transparent);
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
}

.task-delete-btn:hover {
  background: color-mix(in srgb, var(--accent-red, #D94040) 8%, transparent);
}

.task-empty {
  text-align: center;
  padding: 40px 20px;
  color: color-mix(in srgb, var(--foreground, #ffffff) 35%, transparent);
  font-size: 0.9rem;
}

.task-empty-hint {
  margin-top: 6px;
  font-size: 0.78rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 20%, transparent);
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 200ms ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
