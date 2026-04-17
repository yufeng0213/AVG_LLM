<script setup>
/**
 * QuizPracticeView.vue - 自由练习
 * 根据评级出题，用户答题 + 解析。
 */
import { computed, onMounted, ref } from 'vue'
import { generateQuizQuestions, gradeAnswer } from '../../../../../../src/llm/index.js'
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
  loadTopics,
  saveTopics,
  addTopic,
  loadWrongQuestions,
  saveWrongQuestions,
  addWrongQuestion,
} from '../../composables/useQuizData.js'
import QuizQuestionView from './QuizQuestionView.vue'

const emit = defineEmits(['back'])

const topic = ref('')
const step = ref('input') // input | generating | answering

const questions = ref([])
const currentQuestionIndex = ref(0)
const showResult = ref(false)
const gradeRes = ref(null)

const profile = ref(null)
let history = []
let achievements = []

onMounted(async () => {
  profile.value = await loadProfile()
  history = await loadHistory()
  achievements = await loadAchievements()
})

const currentQuestion = computed(() => {
  return questions.value[currentQuestionIndex.value] || null
})

const progressText = computed(() => {
  const total = questions.value.length
  const current = currentQuestionIndex.value + 1
  return `第 ${current} / ${total} 题`
})

const progressPercent = computed(() => {
  if (questions.value.length === 0) return 0
  return Math.round((currentQuestionIndex.value / questions.value.length) * 100)
})

function difficultyForRating() {
  const r = profile.value?.rating
  if (r === 'S') return 'hard'
  if (r === 'A') return 'medium'
  return 'easy'
}

async function startPractice() {
  if (!topic.value.trim()) return
  step.value = 'generating'

  try {
    const difficulty = difficultyForRating()
    const result = await generateQuizQuestions({
      topic: topic.value.trim(),
      difficulty,
      count: 8,
    })

    if (!result.success) {
      alert('题目生成失败：' + result.error)
      step.value = 'input'
      return
    }

    questions.value = result.questions
    currentQuestionIndex.value = 0
    showResult.value = false
    gradeRes.value = null
    step.value = 'answering'
  } catch (e) {
    console.error('练习题目生成失败:', e)
    alert('生成失败，请重试')
    step.value = 'input'
  }
}

async function handleAnswer(userAnswer) {
  if (showResult.value || !currentQuestion.value) return
  showResult.value = false
  gradeRes.value = null

  const question = currentQuestion.value
  const result = await gradeAnswer({ question, userAnswer })
  gradeRes.value = result

  const isCorrect = result.isCorrect
  const xpGain = isCorrect ? (question.difficulty === 'hard' ? 20 : question.difficulty === 'medium' ? 15 : 10) : 2

  profile.value.totalQuestions += 1
  if (isCorrect) {
    profile.value.totalCorrect += 1
    profile.value.streak += 1
    if (profile.value.streak > profile.value.bestStreak) {
      profile.value.bestStreak = profile.value.streak
    }
  } else {
    profile.value.totalWrong += 1
    profile.value.streak = 0

    // 加入错题本
    const wrong = await loadWrongQuestions()
    const updated = addWrongQuestion(wrong, {
      ...question,
      userAnswer,
      topic: topic.value,
    })
    await saveWrongQuestions(updated)
  }

  addXP(profile.value, xpGain)
  await saveProfile(profile.value)

  history = addHistoryItem(history, {
    type: 'quiz_result',
    topic: topic.value,
    question: question.question,
    isCorrect,
    xp: xpGain,
  })
  await saveHistory(history)

  const stats = await loadStats()
  recordDailyStat(stats, null, { questionCount: 1, correctCount: isCorrect ? 1 : 0, xpGained: xpGain })
  await saveStats(stats)

  const topics = await loadTopics()
  const updatedTopics = addTopic(topics, topic.value)
  await saveTopics(updatedTopics)

  const unlocks = checkAchievements(profile.value, achievements)
  if (unlocks.length > 0) {
    await saveAchievements(achievements)
    for (const u of unlocks) {
      history = addHistoryItem(history, { type: 'achievement', achievementName: u.name })
    }
    await saveHistory(history)
  }

  showResult.value = true
}

function nextQuestion() {
  showResult.value = false
  gradeRes.value = null

  if (currentQuestionIndex.value < questions.value.length - 1) {
    currentQuestionIndex.value += 1
  } else {
    step.value = 'input'
  }
}
</script>

<template>
  <div class="quiz-practice">
    <!-- 输入主题 -->
    <div v-if="step === 'input'" class="practice-input">
      <h2 class="input-title">📝 自由练习</h2>
      <p class="input-desc">
        输入你想练习的主题，系统会根据你的评级生成对应难度的题目。
      </p>

      <div v-if="profile?.rating" class="current-rating">
        当前评级：<strong :style="{ color: profile.rating === 'S' ? '#ffd700' : profile.rating === 'A' ? '#ff6b6b' : profile.rating === 'B' ? '#4d96ff' : profile.rating === 'C' ? '#6bcb77' : '#636e72' }">{{ profile.rating }}</strong>
        · 出题难度：{{ difficultyForRating() === 'hard' ? '困难' : difficultyForRating() === 'medium' ? '中等' : '简单' }}
      </div>

      <div class="input-group">
        <input
          v-model="topic"
          type="text"
          class="topic-input"
          placeholder="例如：Python函数、英语时态、线性代数..."
          @keyup.enter="startPractice"
        />
      </div>
      <button class="start-btn" :disabled="!topic.trim()" @click="startPractice">
        开始练习
      </button>
    </div>

    <!-- 生成中 -->
    <div v-else-if="step === 'generating'" class="loading-section">
      <div class="loading-spinner" />
      <p>正在生成题目...</p>
    </div>

    <!-- 答题中 -->
    <div v-else-if="step === 'answering' && currentQuestion" class="practice-answering">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }" />
      </div>
      <div class="progress-info">
        <span>{{ progressText }}</span>
        <span class="difficulty-tag" :class="currentQuestion.difficulty">
          {{ currentQuestion.difficulty === 'easy' ? '简单' : currentQuestion.difficulty === 'medium' ? '中等' : '困难' }}
        </span>
      </div>

      <QuizQuestionView
        :question="currentQuestion"
        :show-result="showResult"
        :grade-result="gradeRes"
        @submit="handleAnswer"
        @next="nextQuestion"
      />
    </div>
  </div>
</template>

<style scoped>
.quiz-practice {
  padding: 16px;
  min-height: 100%;
}

.practice-input {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 20px;
}

.input-title {
  font-size: 1.3rem;
  margin-bottom: 8px;
}

.input-desc {
  font-size: 0.9rem;
  color: #8b9dc3;
  text-align: center;
  margin-bottom: 20px;
}

.current-rating {
  font-size: 0.9rem;
  color: #8b9dc3;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  margin-bottom: 16px;
}

.input-group {
  width: 100%;
  max-width: 300px;
  margin-bottom: 16px;
}

.topic-input {
  width: 100%;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  color: #fff;
  font-size: 1rem;
  outline: none;
  box-sizing: border-box;
}

.topic-input:focus {
  border-color: #f093fb;
}

.topic-input::placeholder {
  color: #555;
}

.start-btn {
  padding: 14px 48px;
  background: linear-gradient(135deg, #f093fb, #f5576c);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.start-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.start-btn:not(:disabled):hover {
  opacity: 0.9;
}

.loading-section {
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
  border-top-color: #f093fb;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-section p {
  color: #8b9dc3;
}

.practice-answering {
  padding: 0;
}

.progress-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
  margin: 0 16px 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #f093fb, #f5576c);
  transition: width 0.3s ease;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px 12px;
  font-size: 0.85rem;
  color: #8b9dc3;
}

.difficulty-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.difficulty-tag.easy {
  background: rgba(67, 233, 123, 0.2);
  color: #43e97b;
}

.difficulty-tag.medium {
  background: rgba(255, 165, 0, 0.2);
  color: #ffa500;
}

.difficulty-tag.hard {
  background: rgba(255, 71, 87, 0.2);
  color: #ff4757;
}
</style>
