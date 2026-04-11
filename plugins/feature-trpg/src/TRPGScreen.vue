<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { getActiveWorldBookId, loadWorldBooks as fetchWorldBooks } from '../../../src/worldbook/worldBookStore.js'
import { isAndroid } from '../../../src/utils/platform.js'
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

const emit = defineEmits(['back'])

const isAndroidPlatform = computed(() => isAndroid)

// 状态
const isLoading = ref(false)
const isLoadingRoles = ref(false)
const isGeneratingOpening = ref(false)
const isProcessingAction = ref(false)
const isGeneratingTopic = ref(false)

const worldBooks = ref([])
const activeBook = ref(null)
const characters = ref([])

const topicInput = ref('')
const characterRoles = ref([])
const messages = ref([])
const isRunning = ref(false)

const playerActionInput = ref('')
const selectedCharacterId = ref('')

const error = ref('')
const messageContainerRef = ref(null)

// 计算属性
const canStartTRPG = computed(() => {
  return characters.value.length > 0 && (topicInput.value.trim() || characterRoles.value.length > 0)
})

const canSendAction = computed(() => {
  return playerActionInput.value.trim() && !isProcessingAction.value && isRunning.value
})

const currentTopic = computed(() => {
  return topicInput.value.trim() || '未知冒险'
})

// 方法
const loadWorldBooks = async () => {
  try {
    const books = await fetchWorldBooks()
    worldBooks.value = books
    const activeId = getActiveWorldBookId()
    activeBook.value = books.find((b) => b.id === activeId) || books[0] || null
  } catch (e) {
    error.value = '加载世界书失败'
  }
}

const loadCharacters = () => {
  if (!activeBook.value) {
    characters.value = []
    return
  }
  characters.value = getWorldBookCharacters(activeBook.value)
}

const handleRandomTopic = () => {
  topicInput.value = generateRandomTopic()
}

const handleGenerateTopicByLLM = async () => {
  if (isGeneratingTopic.value) return
  isGeneratingTopic.value = true
  try {
    topicInput.value = await generateRandomTopicByLLM()
  } catch (e) {
    error.value = '生成主题失败'
  } finally {
    isGeneratingTopic.value = false
  }
}

const handleStartTRPG = async () => {
  if (!canStartTRPG.value || isLoadingRoles.value) return
  
  isLoadingRoles.value = true
  error.value = ''
  
  try {
    const topic = topicInput.value.trim() || generateRandomTopic()
    topicInput.value = topic
    
    // 分配角色身份
    characterRoles.value = await assignCharacterRoles(characters.value, topic)
    
    // 生成开场
    isGeneratingOpening.value = true
    const opening = await generateOpening(topic, characterRoles.value)
    
    // 初始化会话
    const session = createDefaultTRPGSession()
    session.topic = topic
    session.characters = characters.value
    session.characterRoles = characterRoles.value
    session.messages = [
      {
        id: 'opening',
        role: 'gm',
        content: opening,
        timestamp: Date.now(),
      }
    ]
    session.isRunning = true
    session.createdAt = Date.now()
    
    messages.value = session.messages
    isRunning.value = true
    
    saveTRPGSession(session)
  } catch (e) {
    error.value = e.message || '启动跑团失败'
  } finally {
    isLoadingRoles.value = false
    isGeneratingOpening.value = false
  }
}

const handleSendAction = async () => {
  if (!canSendAction.value) return
  
  const action = playerActionInput.value.trim()
  playerActionInput.value = ''
  isProcessingAction.value = true
  error.value = ''
  
  // 添加玩家消息
  const playerMessage = {
    id: `player_${Date.now()}`,
    role: 'player',
    characterId: selectedCharacterId.value || characters.value[0]?.id || 'all',
    characterName: getCharacterNameById(selectedCharacterId.value) || '全体',
    content: action,
    timestamp: Date.now(),
  }
  
  messages.value.push(playerMessage)
  
  try {
    const response = await processPlayerAction(
      currentTopic.value,
      characterRoles.value,
      messages.value,
      action
    )
    
    const gmMessage = {
      id: `gm_${Date.now()}`,
      role: 'gm',
      content: response,
      timestamp: Date.now(),
    }
    
    messages.value.push(gmMessage)
    
    // 保存会话
    saveTRPGSession({
      topic: currentTopic.value,
      characters: characters.value,
      characterRoles: characterRoles.value,
      messages: messages.value,
      isRunning: isRunning.value,
      createdAt: messages.value[0]?.timestamp || Date.now(),
    })
    
    await nextTick()
    scrollToBottom()
  } catch (e) {
    error.value = e.message || '处理行动失败'
  } finally {
    isProcessingAction.value = false
  }
}

const handleEndTRPG = () => {
  isRunning.value = false
  clearTRPGSession()
  
  messages.value.push({
    id: `end_${Date.now()}`,
    role: 'gm',
    content: '🎲 本次跑团已结束。感谢参与！',
    timestamp: Date.now(),
  })
}

const handleNewTRPG = () => {
  clearTRPGSession()
  topicInput.value = ''
  characterRoles.value = []
  messages.value = []
  isRunning.value = false
  selectedCharacterId.value = ''
  playerActionInput.value = ''
  error.value = ''
}

const handleBack = () => {
  emit('back')
}

const getCharacterNameById = (id) => {
  const role = characterRoles.value.find((r) => r.characterId === id)
  if (role) return role.characterName
  const char = characters.value.find((c) => c.id === id)
  return char?.label || null
}

const getCharacterRoleById = (id) => {
  return characterRoles.value.find((r) => r.characterId === id)?.trpgRole || ''
}

const scrollToBottom = () => {
  if (messageContainerRef.value) {
    messageContainerRef.value.scrollTop = messageContainerRef.value.scrollHeight
  }
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// 生命周期
onMounted(async () => {
  await loadWorldBooks()
  loadCharacters()
  
  // 尝试加载已保存的会话
  const savedSession = loadTRPGSession()
  if (savedSession && savedSession.isRunning) {
    topicInput.value = savedSession.topic || ''
    characterRoles.value = savedSession.characterRoles || []
    messages.value = savedSession.messages || []
    isRunning.value = true
    characters.value = savedSession.characters || getWorldBookCharacters(activeBook.value)
  }
})

onBeforeUnmount(() => {
  // 保存当前状态
  if (isRunning.value && messages.value.length > 0) {
    saveTRPGSession({
      topic: currentTopic.value,
      characters: characters.value,
      characterRoles: characterRoles.value,
      messages: messages.value,
      isRunning: isRunning.value,
      createdAt: messages.value[0]?.timestamp || Date.now(),
    })
  }
})

// 监听世界书变化
watch(activeBook, () => {
  if (!isRunning.value) {
    loadCharacters()
  }
})
</script>

<template>
  <main class="trpg-screen" :class="{ 'platform-android': isAndroidPlatform }" role="main">
    <header class="trpg-header">
      <button type="button" class="trpg-back-button" @click="handleBack">
        <span class="trpg-back-icon">‹</span>
      </button>
      <div class="trpg-title-group">
        <h1 class="trpg-title">
          <span>🎲 TRPG 跑团</span>
        </h1>
        <p v-if="currentTopic" class="trpg-subtitle">{{ currentTopic }}</p>
      </div>
      <div class="trpg-header-actions">
        <button v-if="isRunning" type="button" class="trpg-end-btn" @click="handleEndTRPG">
          结束跑团
        </button>
        <button v-if="!isRunning && messages.length > 0" type="button" class="trpg-new-btn" @click="handleNewTRPG">
          新跑团
        </button>
      </div>
    </header>

    <div v-if="error" class="trpg-error-box">
      <p>{{ error }}</p>
      <button type="button" class="error-dismiss" @click="error = ''">关闭</button>
    </div>

    <section class="trpg-body">
      <!-- 设置阶段 -->
      <div v-if="!isRunning" class="trpg-setup-panel">
        <div class="setup-section">
          <h2 class="setup-section-title">📖 跑团主题</h2>
          <div class="topic-input-group">
            <input
              v-model="topicInput"
              type="text"
              class="topic-input"
              placeholder="输入跑团主题，或点击下方按钮生成..."
              maxlength="50"
            />
            <div class="topic-actions">
              <button type="button" class="topic-btn" @click="handleRandomTopic">
                🎲 随机主题
              </button>
              <button type="button" class="topic-btn topic-btn-llm" :disabled="isGeneratingTopic" @click="handleGenerateTopicByLLM">
                {{ isGeneratingTopic ? '生成中...' : '✨ LLM生成' }}
              </button>
            </div>
          </div>
        </div>

        <div class="setup-section">
          <h2 class="setup-section-title">👥 参与角色</h2>
          <p v-if="characters.length === 0" class="no-characters-hint">
            当前世界书暂无角色，请先在世界书中创建角色。
          </p>
          <div v-else class="character-list">
            <div
              v-for="char in characters"
              :key="char.id"
              class="character-item"
            >
              <span class="character-name">{{ char.label }}</span>
              <span v-if="char.description" class="character-desc">{{ char.description }}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="start-trpg-btn"
          :disabled="!canStartTRPG || isLoadingRoles"
          @click="handleStartTRPG"
        >
          {{ isLoadingRoles ? '分配角色中...' : '🎲 开始跑团！' }}
        </button>
      </div>

      <!-- 跑团进行中 -->
      <div v-else class="trpg-game-panel">
        <!-- 角色信息栏 -->
        <div class="trpg-character-info">
          <div class="char-info-scroll">
            <button
              v-for="role in characterRoles"
              :key="role.characterId"
              type="button"
              class="char-info-card"
              :class="{ active: selectedCharacterId === role.characterId }"
              @click="selectedCharacterId = role.characterId"
            >
              <span class="char-info-name">{{ role.characterName }}</span>
              <span class="char-info-role">{{ role.trpgRole }}</span>
            </button>
          </div>
        </div>

        <!-- 消息区域 -->
        <div ref="messageContainerRef" class="trpg-messages">
          <div v-if="messages.length === 0" class="no-messages">
            暂无消息
          </div>
          <template v-else>
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="message-item"
              :class="msg.role"
            >
              <div class="message-header">
                <span v-if="msg.role === 'gm'" class="message-sender gm-sender">🎲 GM（主持人）</span>
                <span v-else class="message-sender player-sender">
                  {{ msg.characterName }}
                  <span v-if="getCharacterRoleById(msg.characterId)" class="sender-role">（{{ getCharacterRoleById(msg.characterId) }}）</span>
                </span>
                <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
              </div>
              <div class="message-content">
                <p class="message-text">{{ msg.content }}</p>
              </div>
            </div>
          </template>
        </div>

        <!-- 输入区域 -->
        <div class="trpg-input-area">
          <div class="input-character-select">
            <select v-model="selectedCharacterId" class="input-character-dropdown">
              <option value="">全体角色</option>
              <option v-for="role in characterRoles" :key="role.characterId" :value="role.characterId">
                {{ role.characterName }}（{{ role.trpgRole }}）
              </option>
            </select>
          </div>
          <div class="input-row">
            <input
              v-model="playerActionInput"
              type="text"
              class="action-input"
              placeholder="描述你的行动..."
              maxlength="500"
              :disabled="isProcessingAction"
              @keydown.enter="handleSendAction"
            />
            <button
              type="button"
              class="action-send-btn"
              :disabled="!canSendAction"
              @click="handleSendAction"
            >
              {{ isProcessingAction ? '处理中...' : '发送' }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped src="./TRPGScreen.css"></style>
