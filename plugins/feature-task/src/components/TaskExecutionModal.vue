<script setup>
/**
 * 任务执行模态框组件
 * 类似 TRPG 界面，用于任务执行中的对话和角色扮演
 */

import { computed, nextTick, ref, watch } from 'vue'
import { marked } from 'marked'
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
  // 玩家名称（从世界书 userProfile 传入）
  userName: {
    type: String,
    default: 'User'
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

  // 否则构建 玩家 + 目标角色
  const roles = [
    {
      characterId: 'user_player',
      characterName: props.userName,
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

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
})

function renderMessageContent(text) {
  if (!text) return ''
  return marked.parse(text)
}

const canSendAction = computed(() => {
  return inputDraft.value.trim() && !isProcessing.value
})

// 初始化或恢复 session
watch(() => props.isOpen, async (val) => {
  console.log('[TaskExecution] watch 触发, isOpen:', val, 'task:', props.task ? props.task.id : 'null')
  console.log('[TaskExecution] props.targetCharacterId:', props.targetCharacterId, 'props.targetCharacterName:', props.targetCharacterName)
  console.log('[TaskExecution] props.task.targetCharacterId:', props.task?.targetCharacterId, 'props.task.targetCharacterName:', props.task?.targetCharacterName)
  console.log('[TaskExecution] effectiveCharacterRoles:', JSON.stringify(effectiveCharacterRoles.value.map(r => ({ id: r.characterId, name: r.characterName }))))

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

  console.log('[TaskExecution] handleProcessAction, targetCharacterId:', props.targetCharacterId, 'targetCharacterName:', props.targetCharacterName)
  console.log('[TaskExecution] handleProcessAction, effectiveCharacterRoles:', JSON.stringify(effectiveCharacterRoles.value.map(r => ({ id: r.characterId, name: r.characterName }))))

  // 添加玩家消息
  messages.value.push({
    id: `player_${Date.now()}`,
    role: 'player',
    characterId: 'user_player',
    characterName: props.userName,
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
                      {{ msg.characterName || userName }}
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
                    <div v-html="renderMessageContent(msg.content)"></div>
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
                    {{ msg.characterName || userName }}
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
                  <div v-html="renderMessageContent(msg.content)"></div>
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
/* Fullscreen overlay */
.task-exec-overlay {
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

/* Transition */
.task-exec-modal-enter-active,
.task-exec-modal-leave-active {
  transition: opacity 0.3s ease;
}

.task-exec-modal-enter-from,
.task-exec-modal-leave-to {
  opacity: 0;
}

.task-exec-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* Header */
.task-exec-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.task-exec-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.task-exec-title {
  margin: 0;
  font-size: 18px;
  color: var(--foreground, #ffffff);
  white-space: nowrap;
}

.task-exec-type-badge {
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 600;
  flex-shrink: 0;
}

.task-exec-type-explore { background: rgba(52, 152, 219, 0.2); color: #3498db; border: 1px solid rgba(52, 152, 219, 0.25); }
.task-exec-type-collect { background: rgba(46, 204, 113, 0.2); color: #2ecc71; border: 1px solid rgba(46, 204, 113, 0.25); }
.task-exec-type-social { background: rgba(155, 89, 182, 0.2); color: #9b59b6; border: 1px solid rgba(155, 89, 182, 0.25); }
.task-exec-type-combat { background: rgba(231, 76, 60, 0.2); color: #e74c3c; border: 1px solid rgba(231, 76, 60, 0.25); }
.task-exec-type-daily { background: rgba(243, 156, 18, 0.2); color: #f39c12; border: 1px solid rgba(243, 156, 18, 0.25); }

.task-exec-task-name {
  margin: 0;
  font-size: 0.78rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 45%, transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
}

.task-exec-completed-badge {
  font-size: 0.72rem;
  color: #2ecc71;
  background: rgba(46, 204, 113, 0.12);
  border: 1px solid rgba(46, 204, 113, 0.2);
  padding: 2px 10px;
  border-radius: 10px;
  font-weight: 600;
  flex-shrink: 0;
}

.task-exec-close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: color-mix(in srgb, var(--foreground, #ffffff) 50%, transparent);
  padding: 4px 8px;
  flex-shrink: 0;
  border-radius: 8px;
  transition: all 0.15s;
}

  .platform-android.android-portrait .task-exec-close-btn {
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

.task-exec-close-btn:hover {
  color: var(--foreground, #ffffff);
  background: rgba(255, 255, 255, 0.06);
}

/* Character Bar */
.task-exec-char-bar {
  padding: 8px 16px;
  flex-shrink: 0;
}

.task-exec-char-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.task-exec-char-scroll::-webkit-scrollbar {
  display: none;
}

.task-exec-char-btn {
  flex-shrink: 0;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01));
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 80px;
  transition: all 0.2s;
}
  .platform-android.android-portrait .task-exec-char-btn {
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
.task-exec-char-btn:hover {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
  border-color: rgba(255, 255, 255, 0.18);
}

.task-exec-char-btn.active {
  border-color: var(--accent-cyan, #00d4ff);
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(0, 150, 255, 0.06));
}

.task-exec-char-btn.is-user {
  border-color: rgba(46, 204, 113, 0.25);
}

.task-exec-char-btn.is-user.active {
  border-color: var(--accent-cyan, #00d4ff);
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(0, 150, 255, 0.06));
}

.task-exec-char-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--foreground, #ffffff);
}

.task-exec-char-role {
  font-size: 0.68rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 45%, transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90px;
}

/* Messages */
.task-exec-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
  overscroll-behavior-y: contain;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-exec-empty {
  text-align: center;
  color: color-mix(in srgb, var(--foreground, #ffffff) 35%, transparent);
  padding: 24px;
  font-size: 0.9rem;
}

/* History divider */
.task-exec-history-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  flex-shrink: 0;
}

.task-exec-history-divider span {
  font-size: 0.7rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 25%, transparent);
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
.player-sender { color: var(--accent-cyan, #00d4ff); }
.character-sender { color: #9b59b6; }

.task-exec-msg-time {
  font-size: 0.7rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 30%, transparent);
  margin-left: auto;
}

.task-exec-msg-content {
  margin: 0;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 0.85rem;
  color: var(--foreground, #ffffff);
  white-space: normal;
  line-height: 1.6;
}

.task-exec-msg.gm .task-exec-msg-content {
  background: linear-gradient(135deg, rgba(243, 156, 18, 0.08), rgba(243, 156, 18, 0.02));
  border: 1px solid rgba(243, 156, 18, 0.12);
  align-self: flex-start;
}

.task-exec-msg.player .task-exec-msg-content {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.06), rgba(0, 150, 255, 0.02));
  border: 1px solid rgba(0, 212, 255, 0.1);
  align-self: flex-end;
}

.task-exec-msg.character .task-exec-msg-content {
  background: linear-gradient(135deg, rgba(46, 204, 113, 0.06), rgba(46, 204, 113, 0.02));
  border: 1px solid rgba(46, 204, 113, 0.1);
  align-self: flex-start;
}

/* Markdown 渲染样式 */
.task-exec-msg-content :deep(strong) {
  font-weight: 700;
  color: #ffffff;
}

.task-exec-msg-content :deep(em) {
  font-style: italic;
  color: color-mix(in srgb, var(--foreground, #ffffff) 75%, transparent);
}

.task-exec-msg-content :deep(code) {
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  font-size: 0.8rem;
  font-family: var(--font-mono, 'Courier New', monospace);
  color: #e0e0e0;
}

.task-exec-msg-content :deep(pre) {
  margin: 8px 0;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.8rem;
  line-height: 1.5;
}

.task-exec-msg-content :deep(pre code) {
  padding: 0;
  background: none;
  font-size: inherit;
}

.task-exec-msg-content :deep(hr) {
  margin: 12px 0;
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.task-exec-msg-content :deep(ul),
.task-exec-msg-content :deep(ol) {
  margin: 6px 0;
  padding-left: 20px;
}

.task-exec-msg-content :deep(li) {
  margin-bottom: 4px;
}

.task-exec-msg-content :deep(p) {
  margin: 6px 0;
}

.task-exec-msg-content :deep(p:first-child) {
  margin-top: 0;
}

.task-exec-msg-content :deep(p:last-child) {
  margin-bottom: 0;
}

.task-exec-msg-content :deep(a) {
  color: var(--accent-cyan, #00d4ff);
  text-decoration: none;
}

.task-exec-msg-content :deep(a:hover) {
  text-decoration: underline;
}

.task-exec-msg-content :deep(blockquote) {
  margin: 8px 0;
  padding: 6px 12px;
  border-left: 3px solid rgba(0, 212, 255, 0.3);
  background: rgba(0, 212, 255, 0.04);
  border-radius: 0 6px 6px 0;
  color: color-mix(in srgb, var(--foreground, #ffffff) 70%, transparent);
}

.task-exec-msg-content :deep(h1),
.task-exec-msg-content :deep(h2),
.task-exec-msg-content :deep(h3) {
  margin: 10px 0 4px;
  font-weight: 700;
  line-height: 1.3;
}

.task-exec-msg-content :deep(h1) { font-size: 1.1rem; }
.task-exec-msg-content :deep(h2) { font-size: 1rem; }
.task-exec-msg-content :deep(h3) { font-size: 0.95rem; }

.task-exec-msg-content :deep(div) {
  margin: 4px 0;
}

/* Input Area */
.task-exec-input-area {
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.task-exec-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.task-exec-input {
  flex: 1;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  font-size: 0.85rem;
  color: var(--foreground, #ffffff);
  outline: none;
  transition: border-color 0.2s;
}

.task-exec-input::placeholder {
  color: color-mix(in srgb, var(--foreground, #ffffff) 25%, transparent);
}

.task-exec-input:focus {
  outline: none;
  border-color: rgba(0, 212, 255, 0.4);
}

.task-exec-send-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.25), rgba(0, 150, 255, 0.12));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 212, 255, 0.3);
  color: var(--accent-cyan, #00d4ff);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
  .platform-android.android-portrait .task-exec-send-btn {
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
.task-exec-send-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.35), rgba(0, 150, 255, 0.2));
  border-color: rgba(0, 212, 255, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 212, 255, 0.2);
}

.task-exec-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Completion Confirm */
.task-exec-complete-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  padding: 20px;
}

.task-exec-complete-dialog {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  max-width: 340px;
  width: 100%;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
  animation: task-complete-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes task-complete-in {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.task-exec-complete-icon {
  font-size: 3rem;
  margin-bottom: 12px;
}

.task-exec-complete-title {
  margin: 0 0 8px;
  font-size: 1.15rem;
  color: #2ecc71;
}

.task-exec-complete-summary {
  margin: 0 0 8px;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
  padding: 10px 12px;
  background: rgba(46, 204, 113, 0.08);
  border: 1px solid rgba(46, 204, 113, 0.15);
  border-radius: 10px;
}

.task-exec-complete-hint {
  margin: 0 0 16px;
  font-size: 0.75rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 40%, transparent);
}

.task-exec-complete-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.task-exec-cancel-btn {
  padding: 10px 18px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.task-exec-cancel-btn:hover {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06));
  color: #ffffff;
}

.task-exec-confirm-btn {
  padding: 10px 18px;
  background: linear-gradient(135deg, rgba(46, 204, 113, 0.3), rgba(46, 204, 113, 0.15));
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(46, 204, 113, 0.3);
  border-radius: 10px;
  color: #2ecc71;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.task-exec-confirm-btn:hover {
  background: linear-gradient(135deg, rgba(46, 204, 113, 0.4), rgba(46, 204, 113, 0.25));
  border-color: rgba(46, 204, 113, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(46, 204, 113, 0.2);
}
</style>
