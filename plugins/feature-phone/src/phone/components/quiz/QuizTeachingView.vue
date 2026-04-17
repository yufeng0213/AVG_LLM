<script setup>
/**
 * QuizTeachingView.vue - 陪学进行中
 * 显示角色教学内容 + 随堂测试 + 追问对话框。
 */
import { computed, onMounted, ref } from 'vue'
import { generateTeachingContent, generateTeachingReply, parseUrlContent, gradeAnswer } from '../../../../../../src/llm/index.js'
import { getWorldBookById } from '../../composables/usePhoneData.js'
import {
  loadProfile,
  saveProfile,
  addXP,
  addHistoryItem,
  saveHistory,
  loadHistory,
  loadAchievements,
  saveAchievements,
  checkAchievements,
  recordDailyStat,
  saveStats,
  loadStats,
  addTeachingSession,
  saveTeachingSessions,
  loadTeachingSessions,
} from '../../composables/useQuizData.js'
import QuizQuestionView from './QuizQuestionView.vue'

const props = defineProps({
  params: { type: Object, required: true },
})

const emit = defineEmits(['back', 'start-teaching', 'deepen'])

const step = ref('loading') // loading | teaching | quiz | chatting | done

const teachingContent = ref('')
const quizQuestions = ref([])
const currentQuestionIndex = ref(0)
const showResult = ref(false)
const gradeRes = ref(null)

// 追问模式
const chatMessages = ref([])
const chatInput = ref('')
const chatLoading = ref(false)

// 深入模式
const deepLevel = computed(() => props.params?.deepLevel || 0)

const profile = ref(null)
let history = []
let achievements = []

const teacherName = computed(() => {
  if (props.params?.useDefault) return 'AI 讲师'
  return props.params?.character?.name || 'AI 讲师'
})

const teacherIdentity = computed(() => {
  return props.params?.character?.identity || ''
})

const topicText = computed(() => {
  if (props.params?.type === 'topic') return props.params.topic
  if (props.params?.type === 'url') return props.params.url || 'URL 内容'
  return ''
})

onMounted(async () => {
  profile.value = await loadProfile()
  history = await loadHistory()
  achievements = await loadAchievements()
  await generateContent()
})

const currentQuestion = computed(() => {
  return quizQuestions.value[currentQuestionIndex.value] || null
})

const progressText = computed(() => {
  const total = quizQuestions.value.length
  const current = currentQuestionIndex.value + 1
  return total > 0 ? `第 ${current} / ${total} 题` : ''
})

async function generateContent() {
  step.value = 'loading'

  try {
    let worldBook = null
    if (props.params?.character?.worldBookId) {
      worldBook = await getWorldBookById(props.params.character.worldBookId)
    }

    let result
    if (props.params?.type === 'url' && props.params?.url) {
      // 先解析 URL
      const urlResult = await parseUrlContent(props.params.url)
      if (!urlResult.success) {
        alert('URL 解析失败：' + urlResult.error)
        step.value = 'done'
        return
      }

      // 再用角色风格生成教学
      result = await generateTeachingContent({
        urlContent: urlResult,
        character: props.params.useDefault ? null : props.params.character,
        worldBook,
        playerName: profile.value?.name || '玩家',
        deepLevel: deepLevel.value,
        previousContent: deepLevel.value > 0 ? teachingContent.value.slice(0, 300) : '',
      })
    } else {
      result = await generateTeachingContent({
        topic: props.params?.topic,
        character: props.params.useDefault ? null : props.params.character,
        worldBook,
        playerName: profile.value?.name || '玩家',
        deepLevel: deepLevel.value,
        previousContent: deepLevel.value > 0 ? teachingContent.value.slice(0, 300) : '',
      })
    }

    if (!result.success) {
      alert('内容生成失败：' + result.error)
      step.value = 'done'
      return
    }

    teachingContent.value = result.teachingContent || ''
    quizQuestions.value = result.quizQuestions || []

    // 记录会话
    const sessions = await loadTeachingSessions()
    const updatedSessions = addTeachingSession(sessions, {
      characterName: teacherName.value,
      topic: topicText.value,
      contentLength: teachingContent.value.length,
      questionCount: quizQuestions.value.length,
      deepLevel: deepLevel.value,
    })
    await saveTeachingSessions(updatedSessions)

    // 记录历史
    history = addHistoryItem(history, {
      type: 'teaching',
      characterName: teacherName.value,
      topic: topicText.value,
    })
    await saveHistory(history)

    // 成就检查
    const unlocks = checkAchievements(profile.value, achievements, ['teacher_student'])
    if (unlocks.length > 0) {
      await saveAchievements(achievements)
    }

    if (quizQuestions.value.length > 0) {
      currentQuestionIndex.value = 0
      step.value = 'teaching'
    } else {
      step.value = 'teaching'
    }
  } catch (e) {
    console.error('教学内容生成失败:', e)
    alert('生成失败，请重试')
    step.value = 'done'
  }
}

function startQuiz() {
  currentQuestionIndex.value = 0
  showResult.value = false
  gradeRes.value = null
  step.value = 'quiz'
}

async function handleAnswer(userAnswer) {
  if (showResult.value) return
  const question = currentQuestion.value
  if (!question) return

  gradeRes.value = null
  showResult.value = false

  const result = await gradeAnswer({ question, userAnswer })
  gradeRes.value = result

  const xpGain = result.isCorrect ? 15 : 2
  profile.value.totalQuestions += 1
  if (result.isCorrect) {
    profile.value.totalCorrect += 1
    profile.value.streak += 1
    if (profile.value.streak > profile.value.bestStreak) {
      profile.value.bestStreak = profile.value.streak
    }
  } else {
    profile.value.totalWrong += 1
    profile.value.streak = 0
  }

  addXP(profile.value, xpGain)
  await saveProfile(profile.value)

  history = addHistoryItem(history, {
    type: 'quiz_result',
    topic: topicText.value,
    question: question.question,
    isCorrect: result.isCorrect,
    xp: xpGain,
  })
  await saveHistory(history)

  const stats = await loadStats()
  recordDailyStat(stats, null, { questionCount: 1, correctCount: result.isCorrect ? 1 : 0, xpGained: xpGain })
  await saveStats(stats)

  showResult.value = true
}

function nextQuestion() {
  showResult.value = false
  gradeRes.value = null

  if (currentQuestionIndex.value < quizQuestions.value.length - 1) {
    currentQuestionIndex.value += 1
  } else {
    step.value = 'done'
  }
}

function startChat() {
  step.value = 'chatting'
}

async function sendChat() {
  const question = chatInput.value.trim()
  if (!question || chatLoading.value) return

  chatMessages.value.push({ role: 'user', text: question })
  chatInput.value = ''
  chatLoading.value = true

  try {
    const result = await generateTeachingReply({
      character: props.params.useDefault ? null : props.params.character,
      topic: topicText.value,
      question,
      teachingContext: teachingContent.value.slice(0, 500),
    })

    if (result.success) {
      chatMessages.value.push({ role: 'teacher', text: result.reply })
    } else {
      chatMessages.value.push({ role: 'teacher', text: '抱歉，我暂时无法回答这个问题。' })
    }
  } catch (e) {
    console.error('追问回复失败:', e)
    chatMessages.value.push({ role: 'teacher', text: '回复失败，请重试。' })
  } finally {
    chatLoading.value = false
  }
}

function goHome() {
  emit('back')
}

function restart() {
  emit('start-teaching', { ...props.params })
}

function continueDeep() {
  emit('deepen', { ...props.params })
}
</script>

<template>
  <div class="quiz-teaching">
    <!-- 加载中 -->
    <div v-if="step === 'loading'" class="teaching-loading">
      <div class="loading-spinner" />
      <p>{{ teacherName }} 正在准备教学内容...</p>
    </div>

    <!-- 教学内容展示 -->
    <div v-else-if="step === 'teaching'" class="teaching-content-view">
      <!-- 讲师信息 -->
      <div class="teacher-header">
        <div class="teacher-avatar">
          {{ teacherName.charAt(0) }}
        </div>
        <div class="teacher-info">
          <span class="teacher-name">{{ teacherName }}</span>
          <span v-if="teacherIdentity" class="teacher-identity">{{ teacherIdentity }}</span>
          <span v-if="deepLevel > 0" class="deep-level">🚀 第 {{ deepLevel + 1 }} 轮深入</span>
        </div>
      </div>

      <!-- 教学内容 -->
      <div class="content-body">
        <pre class="content-text">{{ teachingContent }}</pre>
      </div>

      <!-- 操作按钮（固定在底部） -->
      <div class="teaching-actions">
        <button
          v-if="quizQuestions.length > 0"
          class="action-btn primary"
          @click="startQuiz"
        >
          📝 随堂小测（{{ quizQuestions.length }} 题）
        </button>
        <button class="action-btn secondary" @click="startChat">
          💬 有疑问？问问讲师
        </button>
      </div>
    </div>

    <!-- 答题中 -->
    <div v-else-if="step === 'quiz' && currentQuestion" class="quiz-view">
      <div class="quiz-header-info">
        <span class="quiz-label">📝 随堂小测</span>
        <span v-if="progressText" class="quiz-progress">{{ progressText }}</span>
      </div>

      <QuizQuestionView
        :question="currentQuestion"
        :show-result="showResult"
        :grade-result="gradeRes"
        @submit="handleAnswer"
        @next="nextQuestion"
      />
    </div>

    <!-- 追问对话框 -->
    <div v-else-if="step === 'chatting'" class="chat-view">
      <div class="chat-header">
        <button class="chat-back-btn" @click="step = quizQuestions.length > 0 ? 'teaching' : 'done'">← 返回</button>
        <span>和 {{ teacherName }} 对话</span>
      </div>

      <div class="chat-messages">
        <div
          v-for="(msg, idx) in chatMessages"
          :key="idx"
          class="chat-message"
          :class="msg.role"
        >
          <div v-if="msg.role === 'teacher'" class="chat-avatar">
            {{ teacherName.charAt(0) }}
          </div>
          <div class="chat-bubble">
            {{ msg.text }}
          </div>
        </div>
        <div v-if="chatLoading" class="chat-message teacher">
          <div class="chat-avatar">{{ teacherName.charAt(0) }}</div>
          <div class="chat-bubble loading">正在思考...</div>
        </div>
      </div>

      <div class="chat-input-area">
        <input
          v-model="chatInput"
          type="text"
          class="chat-input"
          placeholder="有什么疑问？可以问我..."
          @keyup.enter="sendChat"
        />
        <button class="chat-send-btn" :disabled="!chatInput.trim()" @click="sendChat">
          发送
        </button>
      </div>
    </div>

    <!-- 完成 -->
    <div v-else-if="step === 'done'" class="teaching-done">
      <div class="done-content">
        <h2 class="done-title">✅ 学习完成！</h2>
        <p class="done-text">
          你完成了「{{ topicText }}」的学习。
          <br />继续加油！
        </p>
        <div class="done-actions">
          <button class="done-btn primary" @click="goHome">返回首页</button>
          <button class="done-btn accent" @click="continueDeep">🚀 继续深入</button>
          <button class="done-btn secondary" @click="restart">再来一次</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quiz-teaching {
  min-height: 100%;
}

.teaching-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.teaching-loading p {
  color: #8b9dc3;
}

.teaching-content-view {
  padding: 16px;
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 60px);
  gap: 16px;
}

.teaching-actions {
  margin-top: auto;
  padding-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.teacher-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
}

.teacher-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  font-weight: 700;
  flex-shrink: 0;
}

.teacher-info {
  display: flex;
  flex-direction: column;
}

.teacher-name {
  font-size: 1rem;
  font-weight: 600;
}

.teacher-identity {
  font-size: 0.8rem;
  color: #888;
}

.deep-level {
  font-size: 0.75rem;
  color: #43e97b;
  font-weight: 600;
}

.content-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 16px;
}

.content-text {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.8;
  color: #ccc;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: inherit;
}

.action-btn {
  width: 100%;
  padding: 14px;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.action-btn.primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
}

.action-btn.secondary {
  background: rgba(255, 255, 255, 0.08);
  color: #8b9dc3;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.quiz-view {
  padding: 0;
}

.quiz-header-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  font-size: 0.9rem;
}

.quiz-label {
  font-weight: 600;
}

.quiz-progress {
  color: #8b9dc3;
}

.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: calc(100vh - 60px);
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.95rem;
  font-weight: 600;
}

.chat-back-btn {
  background: none;
  border: none;
  color: #8b9dc3;
  font-size: 0.9rem;
  cursor: pointer;
  padding: 4px 8px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-message {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.chat-message.user {
  flex-direction: row-reverse;
}

.chat-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
  flex-shrink: 0;
}

.chat-bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 0.9rem;
  line-height: 1.5;
}

.teacher .chat-bubble {
  background: rgba(255, 255, 255, 0.08);
  color: #ccc;
  border-bottom-left-radius: 4px;
}

.user .chat-bubble {
  background: rgba(102, 126, 234, 0.2);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.chat-bubble.loading {
  color: #888;
  font-style: italic;
}

.chat-input-area {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.chat-input {
  flex: 1;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  color: #fff;
  font-size: 0.9rem;
  outline: none;
}

.chat-input::placeholder {
  color: #555;
}

.chat-send-btn {
  padding: 10px 18px;
  background: #667eea;
  border: none;
  border-radius: 20px;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.chat-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.teaching-done {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.done-content {
  text-align: center;
}

.done-title {
  font-size: 1.3rem;
  margin-bottom: 12px;
}

.done-text {
  font-size: 0.95rem;
  color: #8b9dc3;
  line-height: 1.6;
  margin-bottom: 24px;
}

.done-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.done-btn {
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  min-width: 180px;
}

.done-btn.primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
}

.done-btn.accent {
  background: linear-gradient(135deg, #43e97b, #38f9d7);
  color: #0a0a1a;
}

.done-btn.secondary {
  background: rgba(255, 255, 255, 0.08);
  color: #8b9dc3;
  border: 1px solid rgba(255, 255, 255, 0.15);
}
</style>
