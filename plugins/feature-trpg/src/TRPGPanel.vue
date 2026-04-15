<script setup>
/**
 * TRPG 跑团面板组件
 * 完整的跑团功能，包括角色分配、开场生成、剧情交互
 */

import { computed, nextTick, ref, watch } from 'vue'
import { marked } from 'marked'
import {
  loadTRPGSession,
  saveTRPGSession,
  clearTRPGSession,
  createDefaultTRPGSession,
  generateRandomTopic,
  getWorldBookCharacters,
  assignCharacterRoles,
  generateOpening,
  processPlayerAction,
  generateRandomTopicByLLM,
} from './trpgService.js'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  activeBook: {
    type: Object,
    default: null,
  },
  userName: {
    type: String,
    default: 'User',
  },
  // 外部传入的已选角色列表（跨世界书），最多 3 个（+ User = 4）
  selectedCharacters: {
    type: Array,
    default: () => [],
  },
  // 当为 true 时不使用 Teleport，直接内联渲染（用于全屏路由容器）
  noTeleport: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['close', 'remove-character'])

// 跑团状态
const isTRPGLoading = ref(false)
const isTRPGRolesLoading = ref(false)
const isTRPGGeneratingOpening = ref(false)
const isTRPGProcessingAction = ref(false)
const isTRPGGeneratingTopic = ref(false)
const trpgTopicInput = ref('')
const trpgCharacters = ref([])
const trpgCharacterRoles = ref([])
const trpgMessages = ref([])
const isTRPGRunning = ref(false)
const trpgPlayerActionInput = ref('')
const trpgSelectedCharacterId = ref('user_player')
const trpgError = ref('')
const trpgMessageContainerRef = ref(null)

// 计算属性
const canStartTRPG = computed(() => {
  return trpgCharacters.value.length > 0 && (trpgTopicInput.value.trim() || trpgCharacterRoles.value.length > 0)
})

const canTRPGSendAction = computed(() => {
  if (!isTRPGRunning.value || isTRPGProcessingAction.value) return false
  const isUserSelected = trpgSelectedCharacterId.value === 'user_player'
  if (isUserSelected) {
    return !!trpgPlayerActionInput.value.trim()
  }
  return true
})

const trpgInputPlaceholder = computed(() => {
  if (trpgSelectedCharacterId.value === 'user_player') return '描述你的行动...'
  return '可选：给个方向提示...'
})

const trpgButtonLabel = computed(() => {
  if (isTRPGProcessingAction.value) return '处理中...'
  if (trpgSelectedCharacterId.value === 'user_player') return '发送'
  return '生成剧情'
})

const currentTRPGTopic = computed(() => {
  return trpgTopicInput.value.trim() || '未知冒险'
})

// 配置 marked
marked.setOptions({
  breaks: true,        // 换行符转为 <br>
  gfm: true,           // GitHub Flavored Markdown
})

function renderMessageContent(text) {
  if (!text) return ''
  return marked.parse(text)
}

// 工具函数
function getTRPGCharacterNameById(id) {
  const role = trpgCharacterRoles.value.find((r) => r.characterId === id)
  if (role) return role.characterName
  const char = trpgCharacters.value.find((c) => c.id === id)
  return char?.label || '未知角色'
}

function getTRPGCharacterRoleById(id) {
  return trpgCharacterRoles.value.find((r) => r.characterId === id)?.trpgRole || ''
}

function scrollToTRPGBottom() {
  if (trpgMessageContainerRef.value) {
    trpgMessageContainerRef.value.scrollTop = trpgMessageContainerRef.value.scrollHeight
  }
}

function formatTRPGTime(timestamp) {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

// 当外部传入的已选角色变化时，自动同步到 trpgCharacters
watch(
  () => props.selectedCharacters,
  (chars) => {
    if (chars && chars.length > 0) {
      trpgCharacters.value = getWorldBookCharacters(
        { characters: chars },
        props.userName,
      )
    } else if (props.activeBook && (!chars || chars.length === 0)) {
      trpgCharacters.value = getWorldBookCharacters(props.activeBook, props.userName)
    }
  },
  { deep: true },
)

// 跑团方法
function open() {
  trpgError.value = ''

  if (props.selectedCharacters && props.selectedCharacters.length > 0) {
    // 使用外部传入的跨世界书角色
    trpgCharacters.value = getWorldBookCharacters(
      { characters: props.selectedCharacters },
      props.userName,
    )
  } else if (props.activeBook) {
    trpgCharacters.value = getWorldBookCharacters(props.activeBook, props.userName)
  }

  const savedSession = loadTRPGSession()
  if (savedSession && savedSession.isRunning) {
    trpgTopicInput.value = savedSession.topic || ''
    trpgCharacterRoles.value = savedSession.characterRoles || []
    trpgMessages.value = savedSession.messages || []
    isTRPGRunning.value = true
    trpgCharacters.value = savedSession.characters || trpgCharacters.value
  }
}

function handleTRPGRandomTopic() {
  trpgTopicInput.value = generateRandomTopic()
}

async function handleTRPGGenerateTopicByLLM() {
  if (isTRPGGeneratingTopic.value) return
  isTRPGGeneratingTopic.value = true
  trpgError.value = ''
  try {
    trpgTopicInput.value = await generateRandomTopicByLLM()
  } catch (e) {
    trpgError.value = '生成主题失败'
  } finally {
    isTRPGGeneratingTopic.value = false
  }
}

async function handleStartTRPG() {
  if (!canStartTRPG.value || isTRPGRolesLoading.value) return

  isTRPGRolesLoading.value = true
  trpgError.value = ''

  try {
    const topic = trpgTopicInput.value.trim() || generateRandomTopic()
    trpgTopicInput.value = topic

    trpgCharacterRoles.value = await assignCharacterRoles(trpgCharacters.value, topic, props.userName)

    isTRPGGeneratingOpening.value = true
    const opening = await generateOpening(topic, trpgCharacterRoles.value)

    const session = createDefaultTRPGSession()
    session.topic = topic
    session.characters = trpgCharacters.value
    session.characterRoles = trpgCharacterRoles.value
    session.messages = [
      {
        id: 'opening',
        role: 'gm',
        content: opening,
        timestamp: Date.now(),
      },
    ]
    session.isRunning = true
    session.createdAt = Date.now()

    trpgMessages.value = session.messages
    isTRPGRunning.value = true

    saveTRPGSession(session)
  } catch (e) {
    trpgError.value = e.message || '启动跑团失败'
  } finally {
    isTRPGRolesLoading.value = false
    isTRPGGeneratingOpening.value = false
  }
}

async function handleTRPGSendAction() {
  if (!canTRPGSendAction.value) return

  const action = trpgPlayerActionInput.value.trim()
  const isUserSelected = trpgSelectedCharacterId.value === 'user_player'

  isTRPGProcessingAction.value = true
  trpgError.value = ''

  if (isUserSelected) {
    trpgPlayerActionInput.value = ''
    const playerMessage = {
      id: `player_${Date.now()}`,
      role: 'player',
      characterId: 'user_player',
      characterName: props.userName,
      content: action,
      timestamp: Date.now(),
    }
    trpgMessages.value.push(playerMessage)

    try {
      const response = await processPlayerAction(
        currentTRPGTopic.value,
        trpgCharacterRoles.value,
        trpgMessages.value,
        action,
        'user_player',
      )
      trpgMessages.value.push({
        id: `gm_${Date.now()}`,
        role: 'gm',
        content: response,
        timestamp: Date.now(),
      })
    } catch (e) {
      trpgError.value = e.message || '处理行动失败'
    }
  } else {
    const selectedRole = trpgCharacterRoles.value.find((r) => r.characterId === trpgSelectedCharacterId.value)
    const characterName = selectedRole ? selectedRole.characterName : '未知角色'

    try {
      const direction = action || `请根据${characterName}的性格和背景，生成一段合理的剧情发展。`
      const response = await processPlayerAction(
        currentTRPGTopic.value,
        trpgCharacterRoles.value,
        trpgMessages.value,
        direction,
        trpgSelectedCharacterId.value,
      )
      trpgMessages.value.push({
        id: `story_${Date.now()}`,
        role: 'character',
        characterId: trpgSelectedCharacterId.value,
        characterName,
        content: response,
        timestamp: Date.now(),
      })
    } catch (e) {
      trpgError.value = e.message || '生成剧情失败'
    }
  }

  saveTRPGSession({
    topic: currentTRPGTopic.value,
    characters: trpgCharacters.value,
    characterRoles: trpgCharacterRoles.value,
    messages: trpgMessages.value,
    isRunning: isTRPGRunning.value,
    createdAt: trpgMessages.value[0]?.timestamp || Date.now(),
  })

  await nextTick()
  scrollToTRPGBottom()

  isTRPGProcessingAction.value = false
}

function handleEndTRPG() {
  isTRPGRunning.value = false
  clearTRPGSession()

  trpgMessages.value.push({
    id: `end_${Date.now()}`,
    role: 'gm',
    content: '🎲 本次跑团已结束。感谢参与！',
    timestamp: Date.now(),
  })
}

function handleNewTRPG() {
  clearTRPGSession()
  trpgTopicInput.value = ''
  trpgCharacterRoles.value = []
  trpgMessages.value = []
  isTRPGRunning.value = false
  trpgSelectedCharacterId.value = 'user_player'
  trpgPlayerActionInput.value = ''
  trpgError.value = ''
}

function handleClose() {
  if (isTRPGRunning.value && trpgMessages.value.length > 0) {
    saveTRPGSession({
      topic: currentTRPGTopic.value,
      characters: trpgCharacters.value,
      characterRoles: trpgCharacterRoles.value,
      messages: trpgMessages.value,
      isRunning: isTRPGRunning.value,
      createdAt: trpgMessages.value[0]?.timestamp || Date.now(),
    })
  }
  emit('close')
}

// 暴露 open 方法供父组件调用
defineExpose({ open })
</script>

<template>
  <div v-if="noTeleport">
    <div v-if="isOpen" class="trpg-overlay trpg-inline-mode" @click.self="handleClose">
      <section class="trpg-panel">
        <!-- Header -->
        <header class="trpg-header">
          <div class="trpg-title-group">
            <h2 class="trpg-title">🎲 TRPG 跑团</h2>
            <p v-if="currentTRPGTopic" class="trpg-subtitle">{{ currentTRPGTopic }}</p>
          </div>
          <div class="trpg-header-actions">
            <button v-if="isTRPGRunning" type="button" class="trpg-header-btn trpg-end-btn" @click="handleEndTRPG">结束</button>
            <button v-if="!isTRPGRunning && trpgMessages.length > 0" type="button" class="trpg-header-btn trpg-new-btn" @click="handleNewTRPG">新跑团</button>
            <button type="button" class="trpg-close-btn" @click="handleClose">×</button>
          </div>
        </header>

        <!-- Error -->
        <div v-if="trpgError" class="trpg-error-box">
          <p>{{ trpgError }}</p>
          <button type="button" class="error-dismiss" @click="trpgError = ''">关闭</button>
        </div>

        <!-- Body -->
        <div class="trpg-body">
          <!-- 设置阶段 -->
          <div v-if="!isTRPGRunning" class="trpg-setup-panel">
            <div class="setup-section">
              <h2 class="setup-section-title">📖 跑团主题</h2>
              <div class="topic-input-group">
                <input
                  v-model="trpgTopicInput"
                  type="text"
                  class="topic-input"
                  placeholder="输入跑团主题，或点击下方按钮生成..."
                  maxlength="50"
                />
                <div class="topic-actions">
                  <button type="button" class="topic-btn" @click="handleTRPGRandomTopic">🎲 随机主题</button>
                  <button type="button" class="topic-btn topic-btn-llm" :disabled="isTRPGGeneratingTopic" @click="handleTRPGGenerateTopicByLLM">
                    {{ isTRPGGeneratingTopic ? '生成中...' : '✨ LLM生成' }}
                  </button>
                </div>
              </div>
            </div>

            <div class="setup-section">
              <h2 class="setup-section-title">👥 参与角色</h2>
              <p v-if="trpgCharacters.length === 0" class="no-characters-hint">
                暂无参与角色。
              </p>
              <div v-else class="character-list">
                <div v-for="char in trpgCharacters" :key="char.id" class="character-item character-item-with-remove">
                  <div class="character-item-info">
                    <span class="character-name">{{ char.label }}</span>
                    <span v-if="char.description" class="character-desc">{{ char.description }}</span>
                    <span v-if="char._sourceBookTitle" class="character-book-tag">《{{ char._sourceBookTitle }}》</span>
                  </div>
                  <button
                    v-if="!char.isUser"
                    type="button"
                    class="char-remove-btn"
                    @click="emit('remove-character', char.raw?.id ?? char.id)"
                  >×</button>
                </div>
              </div>
            </div>

            <button
              type="button"
              class="start-trpg-btn"
              :disabled="!canStartTRPG || isTRPGRolesLoading"
              @click="handleStartTRPG"
            >
              {{ isTRPGRolesLoading ? '分配角色中...' : '🎲 开始跑团！' }}
            </button>
          </div>

          <!-- 跑团进行中 -->
          <div v-else class="trpg-game-panel">
            <!-- 角色信息栏 -->
            <div class="trpg-character-info">
              <div class="char-info-scroll">
                <button
                  v-for="role in trpgCharacterRoles"
                  :key="role.characterId"
                  type="button"
                  class="char-info-card"
                  :class="{ active: trpgSelectedCharacterId === role.characterId, 'is-user': role.characterId === 'user_player' }"
                  @click="trpgSelectedCharacterId = role.characterId"
                >
                  <span class="char-info-name">{{ role.characterId === 'user_player' ? '👤 ' : '' }}{{ role.characterName }}</span>
                  <span class="char-info-role">{{ role.trpgRole }}</span>
                </button>
              </div>
            </div>

            <!-- 消息区域 -->
            <div ref="trpgMessageContainerRef" class="trpg-messages">
              <div v-if="trpgMessages.length === 0" class="no-messages">暂无消息</div>
              <template v-else>
                <div v-for="msg in trpgMessages" :key="msg.id" class="message-item" :class="msg.role">
                  <div class="message-header">
                    <span v-if="msg.role === 'gm'" class="message-sender gm-sender">🎲 GM（主持人）</span>
                    <span v-else class="message-sender player-sender">
                      {{ msg.characterName }}
                      <span v-if="getTRPGCharacterRoleById(msg.characterId)" class="sender-role">（{{ getTRPGCharacterRoleById(msg.characterId) }}）</span>
                    </span>
                    <span class="message-time">{{ formatTRPGTime(msg.timestamp) }}</span>
                  </div>
                  <div class="message-content" v-html="renderMessageContent(msg.content)"></div>
                </div>
              </template>
            </div>

            <!-- 输入区域 -->
            <div class="trpg-input-area">
              <div class="input-character-select">
                <select v-model="trpgSelectedCharacterId" class="input-character-dropdown">
                  <option v-for="role in trpgCharacterRoles" :key="role.characterId" :value="role.characterId">
                    {{ role.characterName }}（{{ role.trpgRole }}）
                  </option>
                </select>
              </div>
              <div class="input-row">
                <input
                  v-model="trpgPlayerActionInput"
                  type="text"
                  class="action-input"
                  :placeholder="trpgInputPlaceholder"
                  maxlength="500"
                  :disabled="isTRPGProcessingAction"
                  @keydown.enter="handleTRPGSendAction"
                />
                <button
                  type="button"
                  class="send-action-btn"
                  :disabled="!canTRPGSendAction"
                  @click="handleTRPGSendAction"
                >
                  {{ trpgButtonLabel }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
  <Teleport v-else to="body">
    <Transition name="trpg-modal">
      <div v-if="isOpen" class="trpg-overlay" @click.self="handleClose">
        <section class="trpg-panel">
          <!-- Header -->
          <header class="trpg-header">
            <div class="trpg-title-group">
              <h2 class="trpg-title">🎲 TRPG 跑团</h2>
              <p v-if="currentTRPGTopic" class="trpg-subtitle">{{ currentTRPGTopic }}</p>
            </div>
            <div class="trpg-header-actions">
              <button v-if="isTRPGRunning" type="button" class="trpg-header-btn trpg-end-btn" @click="handleEndTRPG">结束</button>
              <button v-if="!isTRPGRunning && trpgMessages.length > 0" type="button" class="trpg-header-btn trpg-new-btn" @click="handleNewTRPG">新跑团</button>
              <button type="button" class="trpg-close-btn" @click="handleClose">×</button>
            </div>
          </header>

          <!-- Error -->
          <div v-if="trpgError" class="trpg-error-box">
            <p>{{ trpgError }}</p>
            <button type="button" class="error-dismiss" @click="trpgError = ''">关闭</button>
          </div>

          <!-- Body -->
          <div class="trpg-body">
            <!-- 设置阶段 -->
            <div v-if="!isTRPGRunning" class="trpg-setup-panel">
              <div class="setup-section">
                <h2 class="setup-section-title">📖 跑团主题</h2>
                <div class="topic-input-group">
                  <input
                    v-model="trpgTopicInput"
                    type="text"
                    class="topic-input"
                    placeholder="输入跑团主题，或点击下方按钮生成..."
                    maxlength="50"
                  />
                  <div class="topic-actions">
                    <button type="button" class="topic-btn" @click="handleTRPGRandomTopic">🎲 随机主题</button>
                    <button type="button" class="topic-btn topic-btn-llm" :disabled="isTRPGGeneratingTopic" @click="handleTRPGGenerateTopicByLLM">
                      {{ isTRPGGeneratingTopic ? '生成中...' : '✨ LLM生成' }}
                    </button>
                  </div>
                </div>
              </div>

              <div class="setup-section">
                <h2 class="setup-section-title">👥 参与角色</h2>
                <p v-if="trpgCharacters.length === 0" class="no-characters-hint">
                  当前世界书暂无角色，请先在世界书中创建角色。
                </p>
                <div v-else class="character-list">
                  <div v-for="char in trpgCharacters" :key="char.id" class="character-item character-item-with-remove">
                    <div class="character-item-info">
                      <span class="character-name">{{ char.label }}</span>
                      <span v-if="char.description" class="character-desc">{{ char.description }}</span>
                      <span v-if="char._sourceBookTitle" class="character-book-tag">《{{ char._sourceBookTitle }}》</span>
                    </div>
                    <button
                      v-if="!char.isUser"
                      type="button"
                      class="char-remove-btn"
                      @click="emit('remove-character', char.raw?.id ?? char.id)"
                    >×</button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                class="start-trpg-btn"
                :disabled="!canStartTRPG || isTRPGRolesLoading"
                @click="handleStartTRPG"
              >
                {{ isTRPGRolesLoading ? '分配角色中...' : '🎲 开始跑团！' }}
              </button>
            </div>

            <!-- 跑团进行中 -->
            <div v-else class="trpg-game-panel">
              <!-- 角色信息栏 -->
              <div class="trpg-character-info">
                <div class="char-info-scroll">
                  <button
                    v-for="role in trpgCharacterRoles"
                    :key="role.characterId"
                    type="button"
                    class="char-info-card"
                    :class="{ active: trpgSelectedCharacterId === role.characterId, 'is-user': role.characterId === 'user_player' }"
                    @click="trpgSelectedCharacterId = role.characterId"
                  >
                    <span class="char-info-name">{{ role.characterId === 'user_player' ? '👤 ' : '' }}{{ role.characterName }}</span>
                    <span class="char-info-role">{{ role.trpgRole }}</span>
                  </button>
                </div>
              </div>

              <!-- 消息区域 -->
              <div ref="trpgMessageContainerRef" class="trpg-messages">
                <div v-if="trpgMessages.length === 0" class="no-messages">暂无消息</div>
                <template v-else>
                  <div v-for="msg in trpgMessages" :key="msg.id" class="message-item" :class="msg.role">
                    <div class="message-header">
                      <span v-if="msg.role === 'gm'" class="message-sender gm-sender">🎲 GM（主持人）</span>
                      <span v-else class="message-sender player-sender">
                        {{ msg.characterName }}
                        <span v-if="getTRPGCharacterRoleById(msg.characterId)" class="sender-role">（{{ getTRPGCharacterRoleById(msg.characterId) }}）</span>
                      </span>
                      <span class="message-time">{{ formatTRPGTime(msg.timestamp) }}</span>
                    </div>
                    <div class="message-content" v-html="renderMessageContent(msg.content)"></div>
                  </div>
                </template>
              </div>

              <!-- 输入区域 -->
              <div class="trpg-input-area">
                <div class="input-character-select">
                  <select v-model="trpgSelectedCharacterId" class="input-character-dropdown">
                    <option v-for="role in trpgCharacterRoles" :key="role.characterId" :value="role.characterId">
                      {{ role.characterName }}（{{ role.trpgRole }}）
                    </option>
                  </select>
                </div>
                <div class="input-row">
                  <input
                    v-model="trpgPlayerActionInput"
                    type="text"
                    class="action-input"
                    :placeholder="trpgInputPlaceholder"
                    maxlength="500"
                    :disabled="isTRPGProcessingAction"
                    @keydown.enter="handleTRPGSendAction"
                  />
                  <button
                    type="button"
                    class="send-action-btn"
                    :disabled="!canTRPGSendAction"
                    @click="handleTRPGSendAction"
                  >
                    {{ trpgButtonLabel }}
                  </button>
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
/* Transition */
.trpg-modal-enter-active,
.trpg-modal-leave-active {
  transition: opacity 0.3s ease;
}

.trpg-modal-enter-from,
.trpg-modal-leave-to {
  opacity: 0;
}

/* 全屏容器 */
.trpg-overlay {
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

/* 内联模式（在全屏路由容器内，不设 fixed 和背景） */
.trpg-overlay.trpg-inline-mode {
  position: relative;
  top: auto;
  left: auto;
  right: auto;
  bottom: auto;
  background: transparent;
  z-index: auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.trpg-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.trpg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.trpg-title-group {
  flex: 1;
  min-width: 0;
}

.trpg-title {
  margin: 0;
  font-size: 18px;
  color: var(--foreground, #ffffff);
}

.trpg-subtitle {
  margin: 4px 0 0;
  font-size: 0.78rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 45%, transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.trpg-header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.trpg-header-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
  .platform-android.android-portrait .trpg-header-btn {
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
.trpg-end-btn {
  background: linear-gradient(135deg, rgba(231, 76, 60, 0.25), rgba(231, 76, 60, 0.1));
  color: #e74c3c;
  border: 1px solid rgba(231, 76, 60, 0.3);
}

.trpg-end-btn:hover {
  background: linear-gradient(135deg, rgba(231, 76, 60, 0.35), rgba(231, 76, 60, 0.18));
  border-color: rgba(231, 76, 60, 0.5);
}

.trpg-new-btn {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.25), rgba(0, 150, 255, 0.12));
  color: var(--accent-cyan, #00d4ff);
  border: 1px solid rgba(0, 212, 255, 0.3);
}

.trpg-new-btn:hover {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.35), rgba(0, 150, 255, 0.2));
  border-color: rgba(0, 212, 255, 0.5);
}

.trpg-close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: color-mix(in srgb, var(--foreground, #ffffff) 50%, transparent);
  padding: 4px 8px;
}
  .platform-android.android-portrait .trpg-close-btn {
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
.trpg-close-btn:hover {
  color: var(--foreground, #ffffff);
}

/* Error */
.trpg-error-box {
  margin: 8px 16px;
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(231, 76, 60, 0.12), rgba(231, 76, 60, 0.04));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(231, 76, 60, 0.2);
  border-radius: 10px;
  color: #e74c3c;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.error-dismiss {
  background: none;
  border: none;
  color: #e74c3c;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 2px 8px;
}

.error-dismiss:hover {
  text-decoration: underline;
}

/* Body */
.trpg-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  overscroll-behavior-y: contain;
}

/* 设置面板 */
.trpg-setup-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.setup-section-title {
  margin: 0 0 12px;
  font-size: 16px;
  color: var(--foreground, #ffffff);
}

.topic-input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.topic-input {
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  font-size: 0.9rem;
  color: var(--foreground, #ffffff);
  transition: border-color 0.2s;
}

.topic-input::placeholder {
  color: color-mix(in srgb, var(--foreground, #ffffff) 30%, transparent);
}

.topic-input:focus {
  outline: none;
  border-color: rgba(0, 212, 255, 0.4);
}

.topic-actions {
  display: flex;
  gap: 8px;
}

.topic-btn {
  padding: 8px 14px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--foreground, #ffffff);
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  transition: all 0.2s;
}  
.platform-android.android-portrait .topic-btn {
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

.topic-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
  border-color: rgba(255, 255, 255, 0.15);
}

.topic-btn-llm {
  background: linear-gradient(135deg, rgba(46, 204, 113, 0.2), rgba(46, 204, 113, 0.08));
  border-color: rgba(46, 204, 113, 0.25);
  color: #2ecc71;
}
.platform-android.android-portrait .topic-btn-llm{
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
.topic-btn-llm:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(46, 204, 113, 0.3), rgba(46, 204, 113, 0.15));
  border-color: rgba(46, 204, 113, 0.4);
}

.character-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.character-item {
  padding: 10px 14px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  font-size: 0.85rem;
}

/* 带移除按钮的角色项 */
.character-item-with-remove {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.character-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}

.character-book-tag {
  font-size: 0.7rem;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(255, 140, 0, 0.1);
  color: rgba(255, 140, 0, 0.7);
}

.char-remove-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid rgba(217, 64, 64, 0.3);
  color: rgba(217, 64, 64, 0.7);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
  line-height: 1;
}
.char-remove-btn:hover {
  background: rgba(217, 64, 64, 0.15);
  border-color: rgba(217, 64, 64, 0.5);
  color: #e74c3c;
}

.character-name {
  font-weight: 600;
  color: var(--foreground, #ffffff);
}

.character-desc {
  margin-left: 8px;
  color: color-mix(in srgb, var(--foreground, #ffffff) 50%, transparent);
  font-size: 0.8rem;
}

.no-characters-hint {
  color: color-mix(in srgb, var(--foreground, #ffffff) 35%, transparent);
  font-size: 0.9rem;
  text-align: center;
  padding: 16px;
}

/* 开始按钮 */
.start-trpg-btn {
  padding: 12px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.25), rgba(0, 150, 255, 0.15));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 212, 255, 0.3);
  color: var(--accent-cyan, #00d4ff);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.start-trpg-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.35), rgba(0, 150, 255, 0.22));
  border-color: rgba(0, 212, 255, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(0, 212, 255, 0.2);
}

.start-trpg-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 游戏面板 */
.trpg-game-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.trpg-character-info {
  display: flex;
  overflow-x: auto;
  gap: 8px;
  padding-bottom: 4px;
  flex-shrink: 0;
}

.trpg-character-info::-webkit-scrollbar {
  display: none;
}

.char-info-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0;
}

.char-info-scroll::-webkit-scrollbar {
  display: none;
}

.char-info-card {
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
  .platform-android.android-portrait .char-info-card {
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
.char-info-card:hover {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
  border-color: rgba(255, 255, 255, 0.18);
}

.char-info-card.active {
  border-color: var(--accent-cyan, #00d4ff);
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(0, 150, 255, 0.06));
}

.char-info-card.is-user {
  border-color: rgba(46, 204, 113, 0.25);
}

.char-info-card.is-user.active {
  border-color: var(--accent-cyan, #00d4ff);
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(0, 150, 255, 0.06));
}

.char-info-name {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--foreground, #ffffff);
}

.char-info-role {
  display: block;
  font-size: 0.72rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 45%, transparent);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

.trpg-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  min-height: 0;
}

.no-messages {
  text-align: center;
  color: color-mix(in srgb, var(--foreground, #ffffff) 35%, transparent);
  padding: 24px;
}

.message-item {
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.message-item.gm {
  background: linear-gradient(135deg, rgba(243, 156, 18, 0.08), rgba(243, 156, 18, 0.02));
  border-color: rgba(243, 156, 18, 0.12);
}

.message-item.player {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.06), rgba(0, 150, 255, 0.02));
  border-color: rgba(0, 212, 255, 0.1);
}

.message-item.character {
  background: linear-gradient(135deg, rgba(46, 204, 113, 0.06), rgba(46, 204, 113, 0.02));
  border-color: rgba(46, 204, 113, 0.1);
}

.message-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.message-sender {
  font-size: 0.8rem;
  font-weight: 600;
}

.gm-sender {
  color: #f39c12;
}

.player-sender {
  color: var(--accent-cyan, #00d4ff);
}

.sender-role {
  font-weight: 400;
  color: color-mix(in srgb, var(--foreground, #ffffff) 40%, transparent);
}

.message-time {
  font-size: 0.7rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 30%, transparent);
}

.message-content {
  margin: 0;
  font-size: 0.85rem;
  color: var(--foreground, #ffffff);
  white-space: normal;
  line-height: 1.6;
}

.message-content :deep(strong) {
  font-weight: 700;
  color: #ffffff;
}

.message-content :deep(em) {
  font-style: italic;
  color: color-mix(in srgb, var(--foreground, #ffffff) 75%, transparent);
}

.message-content :deep(code) {
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  font-size: 0.8rem;
  font-family: var(--font-mono, 'Courier New', monospace);
  color: #e0e0e0;
}

.message-content :deep(pre) {
  margin: 8px 0;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.8rem;
  line-height: 1.5;
}

.message-content :deep(pre code) {
  padding: 0;
  background: none;
  font-size: inherit;
}

.message-content :deep(hr) {
  margin: 12px 0;
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.message-content :deep(ul),
.message-content :deep(ol) {
  margin: 6px 0;
  padding-left: 20px;
}

.message-content :deep(li) {
  margin-bottom: 4px;
}

.message-content :deep(p) {
  margin: 6px 0;
}

.message-content :deep(p:first-child) {
  margin-top: 0;
}

.message-content :deep(p:last-child) {
  margin-bottom: 0;
}

.message-content :deep(a) {
  color: var(--accent-cyan, #00d4ff);
  text-decoration: none;
}

.message-content :deep(a:hover) {
  text-decoration: underline;
}

.message-content :deep(blockquote) {
  margin: 8px 0;
  padding: 6px 12px;
  border-left: 3px solid rgba(0, 212, 255, 0.3);
  background: rgba(0, 212, 255, 0.04);
  border-radius: 0 6px 6px 0;
  color: color-mix(in srgb, var(--foreground, #ffffff) 70%, transparent);
}

.message-content :deep(h1),
.message-content :deep(h2),
.message-content :deep(h3),
.message-content :deep(h4),
.message-content :deep(h5),
.message-content :deep(h6) {
  margin: 10px 0 4px;
  font-weight: 700;
  line-height: 1.3;
}

.message-content :deep(h1) { font-size: 1.1rem; }
.message-content :deep(h2) { font-size: 1rem; }
.message-content :deep(h3) { font-size: 0.95rem; }
.message-content :deep(h4),
.message-content :deep(h5),
.message-content :deep(h6) { font-size: 0.9rem; }

/* 让 HTML 块级元素（如自定义卡片）在消息内容中正常显示 */
.message-content :deep(div) {
  margin: 4px 0;
}

.message-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 0.8rem;
}

.message-content :deep(th),
.message-content :deep(td) {
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  text-align: left;
}

.message-content :deep(th) {
  background: rgba(255, 255, 255, 0.06);
  font-weight: 600;
}

/* 输入区域 */
.trpg-input-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.input-character-select {
  display: flex;
}

.input-character-dropdown {
  flex: 1;
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  font-size: 0.85rem;
  color: var(--foreground, #ffffff);
  cursor: pointer;
}

.input-character-dropdown option {
  background: #1a1a2e;
  color: #ffffff;
}

.input-row {
  display: flex;
  gap: 8px;
}

.action-input {
  flex: 1;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  font-size: 0.85rem;
  color: var(--foreground, #ffffff);
  transition: border-color 0.2s;
}

.action-input::placeholder {
  color: color-mix(in srgb, var(--foreground, #ffffff) 25%, transparent);
}

.action-input:focus {
  outline: none;
  border-color: rgba(0, 212, 255, 0.4);
}

.send-action-btn {
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
  .platform-android.android-portrait .send-action-btn {
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
.send-action-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.35), rgba(0, 150, 255, 0.2));
  border-color: rgba(0, 212, 255, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 212, 255, 0.2);
}

.send-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
