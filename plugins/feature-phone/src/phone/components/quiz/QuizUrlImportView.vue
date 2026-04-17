<script setup>
/**
 * QuizUrlImportView.vue - URL 导入页面
 * 粘贴 URL → LLM 解析 → 展示结果 → 选择学习或直接做题。
 */
import { computed, onMounted, ref } from 'vue'
import { parseUrlContent } from '../../../../../../src/llm/index.js'
import {
  loadProfile,
  loadUrlCache,
  saveUrlCache,
  getCachedUrl,
  setCachedUrl,
  addHistoryItem,
  saveHistory,
  loadHistory,
} from '../../composables/useQuizData.js'
import QuizQuestionView from './QuizQuestionView.vue'

const emit = defineEmits(['back', 'start-teaching'])

const urlInput = ref('')
const step = ref('input') // input | parsing | result | quiz
const loading = ref(false)
const error = ref('')

const parsedContent = ref(null)
const currentQuestionIndex = ref(0)
const showResult = ref(false)
const gradeResult = ref(null)

const profile = ref(null)
let history = []
let urlCache = {}

onMounted(async () => {
  profile.value = await loadProfile()
  history = await loadHistory()
  urlCache = await loadUrlCache()
})

const currentQuestion = computed(() => {
  return parsedContent.value?.quizQuestions?.[currentQuestionIndex.value] || null
})

const progressText = computed(() => {
  const total = parsedContent.value?.quizQuestions?.length || 0
  const current = currentQuestionIndex.value + 1
  return `第 ${current} / ${total} 题`
})

const progressPercent = computed(() => {
  const total = parsedContent.value?.quizQuestions?.length || 0
  if (total === 0) return 0
  return Math.round((currentQuestionIndex.value / total) * 100)
})

async function startParse() {
  const url = urlInput.value.trim()
  if (!url) return

  // 检查缓存
  const cached = getCachedUrl(urlCache, url)
  if (cached) {
    parsedContent.value = cached
    step.value = 'result'
    return
  }

  step.value = 'parsing'
  loading.value = true
  error.value = ''

  try {
    const result = await parseUrlContent(url)
    if (!result.success) {
      error.value = result.error || '解析失败'
      step.value = 'input'
      return
    }

    parsedContent.value = result

    // 缓存结果
    urlCache = setCachedUrl(urlCache, url, result)
    await saveUrlCache(urlCache)

    // 记录历史
    history = addHistoryItem(history, {
      type: 'url_import',
      title: result.title,
      url,
    })
    await saveHistory(history)

    step.value = 'result'
  } catch (e) {
    console.error('URL 解析失败:', e)
    error.value = '解析失败，请重试'
    step.value = 'input'
  } finally {
    loading.value = false
  }
}

function startLearning() {
  emit('start-teaching', {
    type: 'url',
    urlContent: parsedContent.value,
    topic: parsedContent.value?.title || 'URL 内容',
  })
}

function startQuiz() {
  currentQuestionIndex.value = 0
  showResult.value = false
  gradeResult.value = null
  step.value = 'quiz'
}

function handleAnswer(userAnswer) {
  if (showResult.value) return
  const question = currentQuestion.value
  const isCorrect = userAnswer === question?.correctIndex

  gradeResult.value = {
    isCorrect,
    explanation: question?.explanation || '暂无解析',
  }
  showResult.value = true
}

function nextQuestion() {
  showResult.value = false
  gradeResult.value = null

  if (currentQuestionIndex.value < (parsedContent.value?.quizQuestions?.length || 0) - 1) {
    currentQuestionIndex.value += 1
  } else {
    // 所有题目答完，回到结果页
    step.value = 'result'
  }
}
</script>

<template>
  <div class="quiz-url-import">
    <!-- 输入 URL -->
    <div v-if="step === 'input'" class="url-input-section">
      <h2 class="section-title">🔗 导入链接</h2>
      <p class="section-desc">
        粘贴你想学习的页面链接，AI 会自动提取知识点并生成教学内容。
      </p>
      <div class="input-group">
        <input
          v-model="urlInput"
          type="text"
          class="url-input"
          placeholder="https://..."
          @keyup.enter="startParse"
        />
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
      <button class="parse-btn" :disabled="!urlInput.trim()" @click="startParse">
        开始解析
      </button>

      <!-- 最近导入 -->
      <div class="recent-section">
        <h4>最近导入</h4>
        <div class="recent-list">
          <div
            v-for="(data, url) in urlCache"
            :key="url"
            class="recent-item"
            @click="urlInput = url"
          >
            <span class="recent-icon">📄</span>
            <span class="recent-title">{{ data.title || '未命名' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 解析中 -->
    <div v-else-if="step === 'parsing'" class="loading-section">
      <div class="loading-spinner" />
      <p>正在解析 URL 内容...</p>
      <p class="loading-hint">AI 正在提取知识点并生成教学材料</p>
    </div>

    <!-- 解析结果 -->
    <div v-else-if="step === 'result'" class="result-section">
      <h2 class="result-title">{{ parsedContent?.title || '解析结果' }}</h2>

      <div v-if="parsedContent?.summary" class="result-summary">
        {{ parsedContent.summary }}
      </div>

      <div v-if="parsedContent?.keyPoints?.length > 0" class="key-points">
        <h4>📌 核心知识点</h4>
        <ul>
          <li v-for="(point, idx) in parsedContent.keyPoints" :key="idx">{{ point }}</li>
        </ul>
      </div>

      <div v-if="parsedContent?.teachingContent" class="teaching-preview">
        <h4>📖 教学内容摘要</h4>
        <p>{{ parsedContent.teachingContent.slice(0, 200) }}...</p>
      </div>

      <div class="result-actions">
        <button class="action-btn primary" @click="startLearning">
          🎓 开始学习（可选讲师）
        </button>
        <button
          v-if="parsedContent?.quizQuestions?.length > 0"
          class="action-btn secondary"
          @click="startQuiz"
        >
          📝 直接做题（{{ parsedContent.quizQuestions.length }} 题）
        </button>
      </div>
    </div>

    <!-- 答题中 -->
    <div v-else-if="step === 'quiz' && currentQuestion" class="quiz-section">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }" />
      </div>
      <div class="progress-info">
        <span>{{ progressText }}</span>
      </div>

      <QuizQuestionView
        :question="currentQuestion"
        :show-result="showResult"
        :grade-result="gradeResult"
        @submit="handleAnswer"
        @next="nextQuestion"
      />
    </div>
  </div>
</template>

<style scoped>
.quiz-url-import {
  padding: 16px;
  min-height: 100%;
}

.section-title {
  font-size: 1.3rem;
  margin-bottom: 8px;
}

.section-desc {
  font-size: 0.9rem;
  color: #8b9dc3;
  margin-bottom: 20px;
}

.input-group {
  margin-bottom: 16px;
}

.url-input {
  width: 100%;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  color: #fff;
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
}

.url-input:focus {
  border-color: #4facfe;
}

.url-input::placeholder {
  color: #555;
}

.error-text {
  color: #ff4757;
  font-size: 0.85rem;
  margin-bottom: 12px;
}

.parse-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #4facfe, #00f2fe);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.parse-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.parse-btn:not(:disabled):hover {
  opacity: 0.9;
}

.recent-section {
  margin-top: 32px;
}

.recent-section h4 {
  font-size: 0.9rem;
  color: #8b9dc3;
  margin-bottom: 10px;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s;
}

.recent-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.recent-icon {
  font-size: 1rem;
}

.recent-title {
  flex: 1;
  font-size: 0.85rem;
  color: #ccc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  border-top-color: #4facfe;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-section p {
  margin: 4px 0;
  color: #8b9dc3;
}

.loading-hint {
  font-size: 0.8rem;
  color: #555;
}

.result-section {
  padding-top: 8px;
}

.result-title {
  font-size: 1.2rem;
  margin-bottom: 12px;
}

.result-summary {
  font-size: 0.9rem;
  line-height: 1.6;
  color: #ccc;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  margin-bottom: 16px;
}

.key-points {
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  margin-bottom: 16px;
}

.key-points h4 {
  margin: 0 0 8px;
  font-size: 0.9rem;
  color: #8b9dc3;
}

.key-points ul {
  margin: 0;
  padding-left: 18px;
  font-size: 0.85rem;
  color: #ccc;
}

.key-points li {
  margin-bottom: 4px;
}

.teaching-preview {
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  margin-bottom: 16px;
}

.teaching-preview h4 {
  margin: 0 0 8px;
  font-size: 0.9rem;
  color: #8b9dc3;
}

.teaching-preview p {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.6;
  color: #999;
}

.result-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
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

.quiz-section {
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
  background: linear-gradient(90deg, #4facfe, #00f2fe);
  transition: width 0.3s ease;
}

.progress-info {
  padding: 0 16px 12px;
  font-size: 0.85rem;
  color: #8b9dc3;
}



  .platform-android.android-portrait .section-title {
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
