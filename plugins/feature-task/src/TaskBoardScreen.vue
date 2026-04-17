<script setup>
/**
 * TaskBoardScreen.vue - 全屏任务板界面
 * 任务随机刷新时选取一个世界书作为上下文，奖励存入全局经济。
 */
import { onMounted } from 'vue'
import { useGlobalTaskBoard } from './composables/useGlobalTaskBoard.js'

const emit = defineEmits(['back', 'open-battle'])

const task = useGlobalTaskBoard()

onMounted(() => {
  task.handleOpenTaskBoard()
})

const handleClose = () => {
  task.handleCloseTaskBoard()
  emit('back')
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
  <div class="task-screen">
    <!-- 顶部 -->
    <header class="task-header">
      <button type="button" class="task-back-btn" @click="handleClose">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="task-title">📋 任务板</h2>
    </header>

    <!-- 操作栏 -->
    <div class="task-toolbar">
      <button
        type="button"
        class="task-generate-btn"
        :disabled="task.taskBoardGenerating.value"
        @click="task.handleGenerateTaskBoardTasks"
      >
        {{ task.taskBoardGenerating.value ? '生成中...' : '🎲 刷新任务' }}
      </button>
      <span v-if="task.taskBoardFeedback.value" class="task-feedback">{{ task.taskBoardFeedback.value }}</span>
    </div>

    <!-- 任务列表 -->
    <div class="task-list">
      <div
        v-for="t in task.taskBoardTasks.value"
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
            class="task-battle-btn"
            @click="emit('open-battle', t.id)"
          >
            战斗模式
          </button>
          <button
            v-if="t.status === 'completable'"
            type="button"
            class="task-claim-btn"
            @click="task.handleCompleteTaskBoardTask(t.id)"
          >
            领取奖励
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
    <div v-if="task.taskBoardTasks.value.length === 0" class="task-empty">
      <p>暂无任务</p>
      <p class="task-empty-hint">点击"刷新任务"获取新任务</p>
    </div>
  </div>
</template>

<style scoped>
.task-screen {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  background: var(--task-bg, #0a0a1a);
  color: var(--task-text-primary, #ffffff);
  overflow: hidden;
}

/* Header */
.task-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--task-header-bg, rgba(0,0,0,0.3));
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.1));
}

.task-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.7));
  width: 40px;
  height: 40px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.task-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: var(--task-text-primary, #fff); }

.task-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--task-gold, #ffd700);
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
  flex: 1;
  text-align: center;
}

/* Toolbar */
.task-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--task-header-bg, rgba(26, 10, 46, 0.95));
  border-bottom: 1px solid var(--task-border, rgba(255, 255, 255, 0.06));
}

.task-generate-btn {
  appearance: none;
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.25));
  border-radius: 10px;
  padding: 8px 16px;
  background: var(--task-gold-dim, rgba(255, 215, 0, 0.08));
  color: var(--task-gold, #ffd700);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.task-generate-btn:hover:not(:disabled) {
  background: rgba(255, 215, 0, 0.15);
}

.task-generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.task-feedback {
  font-size: 0.78rem;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.55));
}

/* List */
.task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  overflow-y: auto;
  min-height: 0;
  flex: 1;
  background: var(--task-bg, #0a1628);
}

.task-card {
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.12));
  background: var(--task-card-bg, rgba(255,215,0,0.05));
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
  background: var(--task-gold-dim, rgba(255, 215, 0, 0.1));
  color: var(--task-gold, #ffd700);
  text-transform: capitalize;
}

.task-book-tag {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 140, 0, 0.08);
  color: rgba(255, 140, 0, 0.7);
}

.task-status-label {
  font-size: 0.68rem;
  margin-left: auto;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.4));
}

.task-name {
  margin: 0 0 4px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--task-text-primary, rgba(255, 255, 255, 0.9));
}

.task-desc {
  margin: 0 0 8px;
  font-size: 0.8rem;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.5));
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
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.4));
}

.task-reward-value {
  color: var(--task-gold, #ffd700);
  font-weight: 600;
}

.task-actions {
  display: flex;
  gap: 8px;
}

.task-accept-btn,
.task-battle-btn,
.task-claim-btn {
  appearance: none;
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.25));
  border-radius: 8px;
  padding: 4px 14px;
  background: var(--task-gold-dim, rgba(255, 215, 0, 0.08));
  color: var(--task-gold, #ffd700);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.task-accept-btn:hover,
.task-battle-btn:hover,
.task-claim-btn:hover {
  background: rgba(255, 215, 0, 0.15);
}

.task-delete-btn {
  appearance: none;
  border: 1px solid rgba(217, 64, 64, 0.2);
  border-radius: 8px;
  padding: 4px 14px;
  background: transparent;
  color: rgba(217, 64, 64, 0.6);
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
}

.task-delete-btn:hover {
  background: rgba(217, 64, 64, 0.08);
}

/* Empty */
.task-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.35));
  font-size: 0.9rem;
  background: var(--task-bg, #0a1628);
}

.task-empty-hint {
  margin-top: 6px;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.2);
}

  .platform-android.android-portrait .task-back-btn,
  .platform-android.android-portrait .task-generate-btn {
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
