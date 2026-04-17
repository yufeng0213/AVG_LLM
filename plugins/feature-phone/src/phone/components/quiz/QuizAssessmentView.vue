<script setup>
/**
 * QuizAssessmentView.vue - 测评流程
 * 输入主题 → LLM 生成多套题目 → 逐题作答 → 评级。
 */
import { computed, onMounted, ref } from 'vue'
import { generateAssessmentQuestions, gradeAnswer, calculateRating } from '../../../../../../src/llm/index.js'
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
} from '../../composables/useQuizData.js'
import QuizQuestionView from './QuizQuestionView.vue'

const emit = defineEmits(['back'])

const topic = ref('')
const step = ref('input') // input | generating | answering | rating | result

const questionSets = ref([])
const allQuestions = ref([])
const currentQuestionIndex = ref(0)
const answers = ref({})
const grading = ref(false)
const gradeResult = ref(null)
const showExplanation = ref(false)

const ratingResult = ref(null)
const ratingLoading = ref(false)

const profile = ref(null)
let history = []
let achievements = []

onMounted(async () => {
  profile.value = await loadProfile()
  history = await loadHistory()
  achievements = await loadAchievements()
})

const currentQuestion = computed(() => {
  return allQuestions.value[currentQuestionIndex.value] || null
})

const progressText = computed(() => {
  const total = allQuestions.value.length
  const current = currentQuestionIndex.value + 1
  return `第 ${current} / ${total} 题`
})

const progressPercent = computed(() => {
  if (allQuestions.value.length === 0) return 0
  return Math.round(((currentQuestionIndex.value) / allQuestions.value.length) * 100)
})

async function startAssessment() {
  if (!topic.value.trim()) return
  step.value = 'generating'

  try {
    const result = await generateAssessmentQuestions({
      topic: topic.value.trim(),
      setsCount: 3,
      questionsPerSet: 4,
    })

    if (!result.success) {
      alert('题目生成失败：' + result.error)
      step.value = 'input'
      return
    }

    questionSets.value = result.sets
    allQuestions.value = result.sets.flatMap(s => s.questions.map(q => ({ ...q, setDifficulty: s.difficulty })))
    currentQuestionIndex.value = 0
    answers.value = {}
    step.value = 'answering'
  } catch (e) {
    console.error('测评生成失败:', e)
    alert('生成失败，请重试')
    step.value = 'input'
  }
}

async function submitAnswer(userAnswer) {
  if (grading.value || !currentQuestion.value) return
  grading.value = true
  gradeResult.value = null
  showExplanation.value = false

  try {
    const result = await gradeAnswer({
      question: currentQuestion.value,
      userAnswer,
    })

    answers.value[currentQuestionIndex.value] = userAnswer
    gradeResult.value = result

    // 更新 XP 和统计数据
    const isCorrect = result.isCorrect
    const xpGain = isCorrect ? (currentQuestion.value.difficulty === 'hard' ? 20 : currentQuestion.value.difficulty === 'medium' ? 15 : 10) : 2

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
    }

    const leveledUp = addXP(profile.value, xpGain)
    await saveProfile(profile.value)

    // 记录历史
    history = addHistoryItem(history, {
      type: 'quiz_result',
      topic: topic.value,
      question: currentQuestion.value.question,
      isCorrect,
      xp: xpGain,
    })
    await saveHistory(history)

    // 每日统计
    const stats = await loadStats()
    recordDailyStat(stats, null, { questionCount: 1, correctCount: isCorrect ? 1 : 0, xpGained: xpGain })
    await saveStats(stats)

    // 更新主题
    const topics = await loadTopics()
    const updatedTopics = addTopic(topics, topic.value)
    await saveTopics(updatedTopics)

    // 检查成就
    const unlocks = checkAchievements(profile.value, achievements)
    if (unlocks.length > 0) {
      await saveAchievements(achievements)
      for (const u of unlocks) {
        history = addHistoryItem(history, { type: 'achievement', achievementName: u.name })
      }
      await saveHistory(history)
    }

    if (leveledUp) {
      history = addHistoryItem(history, { type: 'level_up', level: profile.value.level })
      await saveHistory(history)
    }

    showExplanation.value = true
  } catch (e) {
    console.error('判分失败:', e)
  } finally {
    grading.value = false
  }
}

function nextQuestion() {
  gradeResult.value = null
  showExplanation.value = false

  if (currentQuestionIndex.value < allQuestions.value.length - 1) {
    currentQuestionIndex.value += 1
  } else {
    // 所有题目答完，进入评级
    calculateFinalRating()
  }
}

async function calculateFinalRating() {
  step.value = 'rating'
  ratingLoading.value = true

  try {
    const answerArray = allQuestions.value.map((_, i) => answers.value[i] ?? -1)
    const result = await calculateRating({
      questions: allQuestions.value,
      answers: answerArray,
      topic: topic.value,
    })

    ratingResult.value = result

    // 更新评级
    if (result.rating) {
      profile.value.rating = result.rating
      await saveProfile(profile.value)

      // 记录评级历史
      history = addHistoryItem(history, {
        type: 'rating',
        topic: topic.value,
        rating: result.rating,
      })
      await saveHistory(history)

      // 检查评级相关成就
      checkAchievements(profile.value, achievements)
      await saveAchievements(achievements)
    }
  } catch (e) {
    console.error('评级计算失败:', e)
  } finally {
    ratingLoading.value = false
    step.value = 'result'
  }
}

function goHome() {
  emit('back')
}
</script>

<template>
  <div class="quiz-assessment">
    <!-- 输入主题 -->
    <div v-if="step === 'input'" class="assessment-input">
      <h2 class="assessment-title">📋 能力测评</h2>
      <p class="assessment-desc">
        输入你想测评的主题，系统将生成不同难度的题目来评估你的水平。
      </p>
      <div class="input-group">
        <input
          v-model="topic"
          type="text"
          class="topic-input"
          placeholder="例如：Python基础、高等数学、英语语法..."
          @keyup.enter="startAssessment"
        />
      </div>
      <div class="assessment-tips">
        <h4>💡 提示</h4>
        <ul>
          <li>将生成 3 套题目，难度从低到高</li>
          <li>每套 4 题，共 12 题</li>
          <li>完成后将给出评级和详细分析</li>
        </ul>
      </div>
      <button class="start-btn" :disabled="!topic.trim()" @click="startAssessment">
        开始测评
      </button>
    </div>

    <!-- 生成中 -->
    <div v-else-if="step === 'generating'" class="assessment-loading">
      <div class="loading-spinner" />
      <p>正在生成题目...</p>
      <p class="loading-hint">这可能需要一些时间，请耐心等待</p>
    </div>

    <!-- 答题中 -->
    <div v-else-if="step === 'answering' && currentQuestion" class="assessment-answering">
      <!-- 进度条 -->
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }" />
      </div>
      <div class="progress-info">
        <span>{{ progressText }}</span>
        <span class="difficulty-tag" :class="currentQuestion.difficulty">
          {{ currentQuestion.difficulty === 'easy' ? '简单' : currentQuestion.difficulty === 'medium' ? '中等' : '困难' }}
        </span>
      </div>

      <!-- 题目 -->
      <QuizQuestionView
        :question="currentQuestion"
        :show-result="showExplanation"
        :grade-result="gradeResult"
        @submit="submitAnswer"
        @next="nextQuestion"
      />
    </div>

    <!-- 评级计算中 -->
    <div v-else-if="step === 'rating'" class="assessment-loading">
      <div class="loading-spinner" />
      <p>正在计算评级...</p>
    </div>

    <!-- 结果 -->
    <div v-else-if="step === 'result'" class="assessment-result">
      <h2 class="result-title">📊 测评结果</h2>

      <div class="result-rating">
        <div class="rating-circle" :style="{ borderColor: ratingResult?.rating === 'S' ? '#ffd700' : ratingResult?.rating === 'A' ? '#ff6b6b' : ratingResult?.rating === 'B' ? '#4d96ff' : ratingResult?.rating === 'C' ? '#6bcb77' : '#636e72' }">
          <span class="rating-letter">{{ ratingResult?.rating || '-' }}</span>
        </div>
        <p class="rating-text">综合评级</p>
      </div>

      <div class="result-stats">
        <div class="stat-item">
          <span class="stat-value">{{ ratingResult?.accuracy ? Math.round(ratingResult.accuracy * 100) : 0 }}%</span>
          <span class="stat-label">正确率</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ allQuestions.filter((_, i) => answers[i] === allQuestions[i]?.correctIndex).length }}/{{ allQuestions.length }}</span>
          <span class="stat-label">答对</span>
        </div>
      </div>

      <div v-if="ratingResult?.suggestion" class="result-suggestion">
        <h4>💡 建议</h4>
        <p>{{ ratingResult.suggestion }}</p>
      </div>

      <div v-if="ratingResult?.strengths?.length > 0" class="result-strengths">
        <h4>✅ 擅长</h4>
        <p>{{ ratingResult.strengths.join('、') }}</p>
      </div>

      <div v-if="ratingResult?.weaknesses?.length > 0" class="result-weaknesses">
        <h4>📌 需要加强</h4>
        <p>{{ ratingResult.weaknesses.join('、') }}</p>
      </div>

      <div class="result-actions">
        <button class="result-btn primary" @click="goHome">返回首页</button>
        <button class="result-btn secondary" @click="goHome">再来一次</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quiz-assessment {
  padding: 16px;
  min-height: 100%;
}

.assessment-input {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 20px;
}

.assessment-title {
  font-size: 1.4rem;
  margin-bottom: 8px;
}

.assessment-desc {
  font-size: 0.9rem;
  color: #8b9dc3;
  text-align: center;
  margin-bottom: 24px;
  max-width: 300px;
}

.input-group {
  width: 100%;
  max-width: 300px;
  margin-bottom: 20px;
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
  border-color: #667eea;
}

.topic-input::placeholder {
  color: #555;
}

.assessment-tips {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
  width: 100%;
  max-width: 300px;
}

.assessment-tips h4 {
  margin: 0 0 8px;
  font-size: 0.9rem;
  color: #8b9dc3;
}

.assessment-tips ul {
  margin: 0;
  padding-left: 18px;
  font-size: 0.85rem;
  color: #666;
}

.assessment-tips li {
  margin-bottom: 4px;
}

.start-btn {
  padding: 14px 48px;
  background: linear-gradient(135deg, #667eea, #764ba2);
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

.assessment-loading {
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

.assessment-loading p {
  margin: 4px 0;
  color: #8b9dc3;
}

.loading-hint {
  font-size: 0.8rem;
  color: #555;
}

.assessment-answering {
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
  background: linear-gradient(90deg, #667eea, #764ba2);
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

.assessment-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 20px;
}

.result-title {
  font-size: 1.3rem;
  margin-bottom: 24px;
}

.result-rating {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 24px;
}

.rating-circle {
  width: 100px;
  height: 100px;
  border: 4px solid;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.rating-letter {
  font-size: 3rem;
  font-weight: 800;
}

.rating-text {
  color: #8b9dc3;
  font-size: 0.9rem;
}

.result-stats {
  display: flex;
  gap: 32px;
  margin-bottom: 24px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
}

.stat-label {
  font-size: 0.8rem;
  color: #666;
}

.result-suggestion,
.result-strengths,
.result-weaknesses {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 12px;
  width: 100%;
  max-width: 320px;
}

.result-suggestion h4,
.result-strengths h4,
.result-weaknesses h4 {
  margin: 0 0 6px;
  font-size: 0.9rem;
  color: #8b9dc3;
}

.result-suggestion p,
.result-strengths p,
.result-weaknesses p {
  margin: 0;
  font-size: 0.85rem;
  color: #ccc;
}

.result-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.result-btn {
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.result-btn.primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
}

.result-btn.secondary {
  background: rgba(255, 255, 255, 0.08);
  color: #8b9dc3;
  border: 1px solid rgba(255, 255, 255, 0.15);
}
</style>
