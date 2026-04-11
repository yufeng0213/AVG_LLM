<script setup>
/**
 * 任务执行模态框组件
 * 类似 TRPG 界面，用于任务执行中的对话和角色扮演
 */

import { computed, nextTick, ref, watch } from 'vue'
import {
  loadTaskExecutionSession,
  saveTaskExecutionSession,
  loadTaskExecutionHistory,
} from '../taskBoardService.js'
import {
  generateTaskExecutionOpening,
  processTaskAction,
  checkTaskCompletable,
} from '../taskExecutionService.js'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  task: {
    type: Object,
    default: null
  },
  characterRoles: {
    type: Array,
    default: () => []
  },
  worldBook: {
    type: Object,
    default: null
  },
  // 任务目标角色信息（从聊天上下文传入）
  targetCharacterId: {
    type: String,
    default: ''
  },
  targetCharacterName: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'complete'])

const messages = ref([])
const inputDraft = ref('')
const isProcessing = ref(false)
const isCompletable = ref(false)
const completableSummary = ref('')
const showCompleteConfirm = ref(false)
const messageContainerRef = ref(null)
const executionHistory = ref([]) // 历史执行记录
const isCompleted = ref(false) // 当前 session 是否已完成

// 构建角色列表：User + 目标角色
const effectiveCharacterRoles = computed(() => {
  // 优先使用传入的 characterRoles（如果有 TRPG 角色）
  if (props.characterRoles.length > 0) return props.characterRoles

  // 否则构建 User + 目标角色
  const roles = [
    {
      characterId: 'user_player',
      characterName: 'User',
      trpgRole: '玩家',
      roleDescription: '玩家控制的角色',
    }
  ]

  if (props.targetCharacterId && props.targetCharacterName) {
    // 从 characterRoles 中查找详细角色描述
    const targetRole = props.characterRoles.find((r) => r.characterId === props.targetCharacterId)
    roles.push({
      characterId: props.targetCharacterId,
      characterName: props.targetCharacterName,
      trpgRole: targetRole?.trpgRole || '参与角色',
      roleDescription: targetRole?.roleDescription || '',
    })
  }

  return roles
})

const selectedCharacterId = ref('user_player') // 固定为 User

const TASK_TYPE_LABELS = {
  explore: '探索',
  collect: '收集',
  social: '社交',
  combat: '战斗',
  daily: '日常',
}

const canSendAction = computed(() => {
  return inputDraft.value.trim() && !isProcessing.value
})

// 初始化或恢复 session
watch(() => props.isOpen, async (val) => {
  console.log('[TaskExecution] watch 触发, isOpen:', val, 'task:', props.task ? props.task.id : 'null', 'task.type:', typeof props.task?.id)

  if (val && props.task) {
    console.log('[TaskExecution] 打开任务执行, taskId:', props.task.id, 'taskName:', props.task.name)
    console.log('[TaskExecution] targetCharacterId:', props.targetCharacterId, 'targetCharacterName:', props.targetCharacterName)

    // 加载历史执行记录
    executionHistory.value = loadTaskExecutionHistory(props.task.id)
    console.log('[TaskExecution] 历史记录数:', executionHistory.value.length)

    const session = loadTaskExecutionSession(props.task.id)
    console.log('[TaskExecution] 加载 session:', session ? '找到' : '未找到', session ? { msgCount: session.messages?.length, isCompleted: session.isCompleted } : 'null')

    if (session && session.messages && session.messages.length > 0) {
      // 恢复当前 session
      messages.value = session.messages
      isCompletable.value = session.isCompletable || false
      completableSummary.value = session.completableSummary || ''
      isCompleted.value = session.isCompleted || false
      console.log('[TaskExecution] 恢复消息数:', messages.value.length, 'isCompleted:', isCompleted.value)
    } else {
      // 生成新开场
      messages.value = []
      isProcessing.value = true
      isCompleted.value = false
      try {
        const opening = await generateTaskExecutionOpening({
          task: props.task,
          characterRoles: effectiveCharacterRoles.value,
          worldBook: props.worldBook,
        })
        messages.value = [
          {
            id: `task_gm_${Date.now()}`,
            role: 'gm',
            content: `📋 任务执行：${props.task.name}\n\n${opening}`,
            timestamp: Date.now(),
          }
        ]
      } catch (e) {
        messages.value = [
          {
            id: `task_gm_${Date.now()}`,
            role: 'gm',
            content: `📋 任务执行：${props.task.name}\n\n任务开始了...`,
            timestamp: Date.now(),
          }
        ]
      } finally {
        isProcessing.value = false
      }
    }
    saveCurrentSession()
  }
}, { immediate: true })

function saveCurrentSession() {
  if (!props.task) return
  saveTaskExecutionSession(props.task.id, {
    taskId: props.task.id,
    taskName: props.task.name,
    messages: messages.value,
    exchangeCount: messages.value.filter((m) => m.role !== 'gm').length,
    isCompletable: isCompletable.value,
    completableSummary: completableSummary.value,
    isCompleted: false,
    targetCharacterId: props.targetCharacterId,
    targetCharacterName: props.targetCharacterName,
    updatedAt: Date.now(),
  })
}

function saveCurrentSessionCompleted() {
  if (!props.task) return
  const data = {
    taskId: props.task.id,
    taskName: props.task.name,
    messages: messages.value,
    exchangeCount: messages.value.filter((m) => m.role !== 'gm').length,
    isCompletable: true,
    completableSummary: completableSummary.value,
    isCompleted: true,
    targetCharacterId: props.targetCharacterId,
    targetCharacterName: props.targetCharacterName,
    updatedAt: Date.now(),
  }
  console.log('[TaskExecution] 保存已完成 session, taskId:', props.task.id, '消息数:', messages.value.length)
  saveTaskExecutionSession(props.task.id, data)
}

function handleSendAction() {
  if (!canSendAction.value) return
  const action = inputDraft.value.trim()
  inputDraft.value = ''
  handleProcessAction(action)
}

async function handleProcessAction(action) {
  isProcessing.value = true

  // 添加玩家消息
  messages.value.push({
    id: `player_${Date.now()}`,
    role: 'player',
    characterId: 'user_player',
    characterName: 'User',
    content: action,
    timestamp: Date.now(),
  })

  await nextTick()
  scrollToBottom()

  try {
    const responses = await processTaskAction({
      task: props.task,
      characterRoles: effectiveCharacterRoles.value,
      messageHistory: messages.value,
      playerAction: action,
      selectedCharacterId: 'user_player',
      targetCharacterId: props.targetCharacterId || effectiveCharacterRoles.value.find((r) => r.characterId !== 'user_player')?.characterId,
    })

    // 依次添加角色回应和 GM 故事
    for (const resp of responses) {
      messages.value.push({
        id: `resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ...resp,
      })
      await nextTick()
      scrollToBottom()
    }

    saveCurrentSession()

    // 检查是否可完成（3+ 回合后）
    const nonGmCount = messages.value.filter((m) => m.role !== 'gm').length
    if (nonGmCount >= 3 && !isCompletable.value) {
      await checkCompletable()
    }
  } catch (e) {
    messages.value.push({
      id: `err_${Date.now()}`,
      role: 'gm',
      content: '处理行动时出错：' + (e.message || '未知错误'),
      timestamp: Date.now(),
    })
  } finally {
    isProcessing.value = false
  }
}

async function checkCompletable() {
  try {
    const result = await checkTaskCompletable({
      task: props.task,
      characterRoles: effectiveCharacterRoles.value,
      messageHistory: messages.value,
    })

    if (result.completable) {
      isCompletable.value = true
      completableSummary.value = result.summary
      showCompleteConfirm.value = true
      saveCurrentSession()
    }
  } catch {
    // ignore
  }
}

function handleConfirmComplete() {
  showCompleteConfirm.value = false

  const evidence = {
    summary: completableSummary.value || '任务已执行完成',
    messages: messages.value.slice(-6).map((m) => ({
      role: m.role,
      characterName: m.characterName || 'GM',
      content: m.content?.slice(0, 200),
    })),
    timestamp: Date.now(),
  }

  // 标记为已完成并保存（不清除 session，保留执行记录）
  saveCurrentSessionCompleted()

  emit('complete', props.task.id, evidence)
}

function handleCancelComplete() {
  showCompleteConfirm.value = false
}

function handleClose() {
  saveCurrentSession()
  emit('close')
}

function scrollToBottom() {
  if (messageContainerRef.value) {
    messageContainerRef.value.scrollTop = messageContainerRef.value.scrollHeight
  }
}

function formatTime(timestamp) {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSendAction()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="task-exec-modal">
      <div v-if="isOpen" class="task-exec-overlay" @click.self="handleClose">
        <div class="task-exec-container">
          <!-- Header -->
          <header class="task-exec-header">
            <div class="task-exec-title-group">
              <h2 class="task-exec-title">📋 任务执行</h2>
              <span v-if="task" class="task-exec-type-badge" :class="`task-type-${task.type}`">
                {{ TASK_TYPE_LABELS[task.type] || task.type }}
              </span>
              <span v-if="isCompleted" class="task-exec-completed-badge">✅ 已完成</span>
            </div>
            <p v-if="task" class="task-exec-task-name">{{ task.name }}</p>
            <button type="button" class="task-exec-close-btn" @click="handleClose">×</button>
          </header>

          <!-- Character Bar -->
          <div v-if="effectiveCharacterRoles.length > 1" class="task-exec-char-bar">
            <div class="task-exec-char-scroll">
              <button
                v-for="role in effectiveCharacterRoles"
                :key="role.characterId"
                type="button"
                class="task-exec-char-btn"
                :class="{ active: selectedCharacterId === role.characterId, 'is-user': role.characterId === 'user_player' }"
              >
                <span class="task-exec-char-name">{{ role.characterId === 'user_player' ? '👤 ' : '' }}{{ role.characterName }}</span>
                <span class="task-exec-char-role">{{ role.trpgRole }}</span>
              </button>
            </div>
          </div>

          <!-- Messages -->
          <div ref="messageContainerRef" class="task-exec-messages">
            <div v-if="messages.length === 0 && executionHistory.length === 0" class="task-exec-empty">
              {{ isProcessing ? '生成开场中...' : '暂无消息' }}
            </div>
            <template v-else>
              <!-- 历史执行记录 -->
              <template v-for="(round, rIdx) in executionHistory" :key="'history_' + rIdx">
                <div class="task-exec-history-divider">
                  <span>── 第 {{ rIdx + 1 }} 次执行 ──</span>
                </div>
                <div
                  v-for="msg in (round.messages || [])"
                  :key="'hmsg_' + rIdx + '_' + (msg.id || msg.timestamp)"
                  class="task-exec-msg task-exec-history-msg"
                  :class="msg.role"
                >
                  <div class="task-exec-msg-header">
                    <span v-if="msg.role === 'gm'" class="task-exec-msg-sender gm-sender">🎲 GM（主持人）</span>
                    <span v-else-if="msg.role === 'player'" class="task-exec-msg-sender player-sender">
                      {{ msg.characterName || 'User' }}
                    </span>
                    <span v-else-if="msg.role === 'character'" class="task-exec-msg-sender character-sender">
                      {{ msg.characterName || '未知角色' }}
                    </span>
                    <span v-else class="task-exec-msg-sender player-sender">
                      {{ msg.characterName || '未知' }}
                    </span>
                    <span class="task-exec-msg-time">{{ formatTime(msg.timestamp) }}</span>
                  </div>
                  <div class="task-exec-msg-content">
                    <p class="task-exec-msg-text">{{ msg.content }}</p>
                  </div>
                </div>
              </template>

              <!-- 当前执行消息 -->
              <template v-if="messages.length > 0 && executionHistory.length > 0">
                <div class="task-exec-history-divider">
                  <span>── 当前执行中 ──</span>
                </div>
              </template>

              <div v-for="msg in messages" :key="msg.id" class="task-exec-msg" :class="msg.role">
                <div class="task-exec-msg-header">
                  <span v-if="msg.role === 'gm'" class="task-exec-msg-sender gm-sender">🎲 GM（主持人）</span>
                  <span v-else-if="msg.role === 'player'" class="task-exec-msg-sender player-sender">
                    {{ msg.characterName || 'User' }}
                  </span>
                  <span v-else-if="msg.role === 'character'" class="task-exec-msg-sender character-sender">
                    {{ msg.characterName || '未知角色' }}
                  </span>
                  <span v-else class="task-exec-msg-sender player-sender">
                    {{ msg.characterName || '未知' }}
                  </span>
                  <span class="task-exec-msg-time">{{ formatTime(msg.timestamp) }}</span>
                </div>
                <div class="task-exec-msg-content">
                  <p class="task-exec-msg-text">{{ msg.content }}</p>
                </div>
              </div>
            </template>
          </div>

          <!-- Input Area (completed 时隐藏) -->
          <div v-if="!isCompleted" class="task-exec-input-area">
            <div class="task-exec-input-row">
              <input
                type="text"
                v-model="inputDraft"
                class="task-exec-input"
                placeholder="描述你的行动..."
                maxlength="500"
                :disabled="isProcessing"
                @keydown="handleKeydown"
              />
              <button
                type="button"
                class="task-exec-send-btn"
                :disabled="!canSendAction"
                @click="handleSendAction"
              >
                {{ isProcessing ? '处理中...' : '发送' }}
              </button>
            </div>
          </div>

          <!-- Completion Confirm Overlay (completed 时隐藏) -->
          <div v-if="showCompleteConfirm && !isCompleted" class="task-exec-complete-overlay" @click.self="handleCancelComplete">
            <div class="task-exec-complete-dialog">
              <div class="task-exec-complete-icon">✅</div>
              <h3 class="task-exec-complete-title">任务可以提交了</h3>
              <p class="task-exec-complete-summary" v-if="completableSummary">{{ completableSummary }}</p>
              <p class="task-exec-complete-hint">确认后可以在任务板提交任务并领取奖励</p>
              <div class="task-exec-complete-actions">
                <button type="button" class="task-exec-cancel-btn" @click="handleCancelComplete">继续执行</button>
                <button type="button" class="task-exec-confirm-btn" @click="handleConfirmComplete">确认完成</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Task Execution Modal */
.task-exec-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 16px;
}

.task-exec-container {
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  background: linear-gradient(145deg, #1a1a2e, #16213e);
  border-radius: 16px;
  border: 1px solid rgba(155, 89, 182, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* Header */
.task-exec-header {
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  position: relative;
}

.task-exec-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.task-exec-title {
  margin: 0;
  font-size: 1.1rem;
  color: #ffffff;
}

.task-exec-type-badge {
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 600;
}

.task-exec-type-explore { background: rgba(52, 152, 219, 0.2); color: #3498db; }
.task-exec-type-collect { background: rgba(46, 204, 113, 0.2); color: #2ecc71; }
.task-exec-type-social { background: rgba(155, 89, 182, 0.2); color: #9b59b6; }
.task-exec-type-combat { background: rgba(231, 76, 60, 0.2); color: #e74c3c; }
.task-exec-type-daily { background: rgba(243, 156, 18, 0.2); color: #f39c12; }

.task-exec-task-name {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
}

.task-exec-completed-badge {
  font-size: 0.75rem;
  color: #2ecc71;
  background: rgba(46, 204, 113, 0.15);
  padding: 2px 10px;
  border-radius: 10px;
  font-weight: 600;
}

.task-exec-close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
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

/* Character Bar */
.task-exec-char-bar {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.task-exec-char-scroll {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.task-exec-char-btn {
  flex-shrink: 0;
  padding: 6px 10px;
  border: 1px solid rgba(155, 89, 182, 0.3);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: #ffffff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 70px;
  transition: all 0.2s;
}

.task-exec-char-btn.active {
  background: linear-gradient(135deg, #9b59b6, #8e44ad);
  border-color: #9b59b6;
}

.task-exec-char-btn.is-user {
  border-color: rgba(52, 152, 219, 0.5);
  background: rgba(52, 152, 219, 0.1);
}

.task-exec-char-btn.is-user.active {
  background: linear-gradient(135deg, #3498db, #2980b9);
  border-color: #3498db;
}

.task-exec-char-name {
  font-size: 0.75rem;
  font-weight: 600;
}

.task-exec-char-role {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.6);
}

/* Messages */
.task-exec-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-exec-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  padding: 24px;
}

/* History divider */
.task-exec-history-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
}

.task-exec-history-divider span {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.3);
  white-space: nowrap;
}

.task-exec-history-msg {
  opacity: 0.55;
}

.task-exec-history-msg .task-exec-msg-content {
  filter: grayscale(20%);
}

.task-exec-msg {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-exec-msg-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-exec-msg-sender {
  font-size: 0.8rem;
  font-weight: 600;
}

.gm-sender { color: #f39c12; }
.player-sender { color: #3498db; }
.character-sender { color: #9b59b6; }

.task-exec-msg-time {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.3);
  margin-left: auto;
}

.task-exec-msg-content {
  padding: 10px 14px;
  border-radius: 12px;
  max-width: 85%;
}

.task-exec-msg.gm .task-exec-msg-content {
  background: rgba(243, 156, 18, 0.15);
  border: 1px solid rgba(243, 156, 18, 0.2);
  align-self: flex-start;
}

.task-exec-msg.player .task-exec-msg-content {
  background: rgba(52, 152, 219, 0.15);
  border: 1px solid rgba(52, 152, 219, 0.2);
  align-self: flex-end;
}

.task-exec-msg.character .task-exec-msg-content {
  background: rgba(155, 89, 182, 0.15);
  border: 1px solid rgba(155, 89, 182, 0.2);
  align-self: flex-start;
}

.task-exec-msg-text {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.5;
  white-space: pre-wrap;
}

/* Input Area */
.task-exec-input-area {
  padding: 10px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.task-exec-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
  overflow: hidden;
}

.task-exec-input {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  color: #ffffff;
  font-size: 0.85rem;
  outline: none;
  box-sizing: border-box;
}

.task-exec-input:focus {
  border-color: rgba(155, 89, 182, 0.5);
}

.task-exec-send-btn {
  padding: 10px 18px;
  background: linear-gradient(135deg, #9b59b6, #8e44ad);
  border: none;
  border-radius: 10px;
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s;
}

.task-exec-send-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #8e44ad, #7d3c98);
  transform: translateY(-1px);
}

.task-exec-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Completion Confirm */
.task-exec-complete-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  padding: 20px;
}

.task-exec-complete-dialog {
  background: linear-gradient(145deg, #1a1a2e, #16213e);
  border: 1px solid rgba(46, 204, 113, 0.4);
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  max-width: 360px;
  width: 100%;
}

.task-exec-complete-icon {
  font-size: 3rem;
  margin-bottom: 12px;
}

.task-exec-complete-title {
  margin: 0 0 8px;
  font-size: 1.2rem;
  color: #2ecc71;
}

.task-exec-complete-summary {
  margin: 0 0 8px;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
  padding: 8px 12px;
  background: rgba(46, 204, 113, 0.1);
  border-radius: 8px;
}

.task-exec-complete-hint {
  margin: 0 0 16px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
}

.task-exec-complete-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.task-exec-cancel-btn {
  padding: 8px 20px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  cursor: pointer;
}

.task-exec-confirm-btn {
  padding: 8px 20px;
  background: linear-gradient(135deg, #2ecc71, #27ae60);
  border: none;
  border-radius: 8px;
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

/* Android竖屏适配 */
.platform-android.android-portrait .task-exec-container {
  max-width: 100% !important;
  max-height: 95vh !important;
  border-radius: 12px !important;
}

.platform-android.android-portrait .task-exec-header {
  padding: 12px 14px !important;
}

.platform-android.android-portrait .task-exec-title-group {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  flex-wrap: wrap !important;
  overflow: hidden !important;
  padding-right: 40px !important;
}

.platform-android.android-portrait .task-exec-title {
  font-size: 1rem !important;
  min-width: 0 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.platform-android.android-portrait .task-exec-task-name {
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  max-width: calc(100% - 40px) !important;
}

.platform-android.android-portrait .task-exec-close-btn {
  width: 32px !important;
  height: 32px !important;
  min-width: 32px !important;
  min-height: 32px !important;
  flex-shrink: 0 !important;
}

.platform-android.android-portrait .task-exec-completed-badge {
  font-size: 0.7rem !important;
  padding: 2px 8px !important;
}

.platform-android.android-portrait .task-exec-char-btn {
  min-height: 40px !important;
  min-width: 60px !important;
}

.platform-android.android-portrait .task-exec-send-btn {
  height: 36px !important;
  min-height: 36px !important;
  max-height: 36px !important;
  padding: 0 8px !important;
  font-size: 0.8rem !important;
  line-height: 1 !important;
  white-space: nowrap !important;
  box-sizing: border-box !important;
  flex: 0 0 auto !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 8px !important;
  width: auto !important;
  min-width: 0 !important;
}

.platform-android.android-portrait .task-exec-input {
  height: 36px !important;
  min-height: 36px !important;
  max-height: 36px !important;
  padding: 0 10px !important;
  font-size: 0.85rem !important;
  line-height: 1.2 !important;
  box-sizing: border-box !important;
  min-width: 0 !important;
  flex: 1 1 0 !important;
}

.platform-android.android-portrait .task-exec-input-area {
  padding: 8px 10px !important;
  box-sizing: border-box !important;
  width: 100% !important;
  overflow: hidden !important;
}

.platform-android.android-portrait .task-exec-input-row {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 0 !important;
  margin: 0 !important;
  overflow: hidden !important;
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}

.platform-android.android-portrait .task-exec-cancel-btn,
.platform-android.android-portrait .task-exec-confirm-btn {
  min-height: 36px !important;
  height: 36px !important;
  padding: 0 14px !important;
  font-size: 0.8rem !important;
  white-space: nowrap !important;
  box-sizing: border-box !important;
}
</style>
