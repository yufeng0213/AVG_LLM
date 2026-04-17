<script setup>
/**
 * QuizHistoryView.vue - 历史记录 + 错题本
 * 展示答题历史、错题列表，支持复习错题。
 */
import { computed, onMounted, ref } from 'vue'
import { loadHistory, loadWrongQuestions, saveWrongQuestions, formatQuizTime } from '../../composables/useQuizData.js'
import QuizQuestionView from './QuizQuestionView.vue'

const emit = defineEmits(['back', 'start-teaching'])

const activeTab = ref('history') // history | wrong

const historyList = ref([])
const wrongList = ref([])

// 复习模式
const reviewing = ref(false)
const reviewQuestion = ref(null)
const showResult = ref(false)
const gradeRes = ref(null)

onMounted(async () => {
  historyList.value = await loadHistory()
  wrongList.value = await loadWrongQuestions()
})

const visibleHistory = computed(() => {
  return historyList.value.slice(0, 50)
})

const historyIcons = {
  quiz_result: '📝',
  rating: '🧠',
  teaching: '🎓',
  url_import: '🔗',
  level_up: '🌟',
  achievement: '🏆',
}

function startReview(question) {
  reviewing.value = true
  reviewQuestion.value = { ...question }
  showResult.value = false
  gradeRes.value = null
}

function handleReviewAnswer(userAnswer) {
  if (showResult.value || !reviewQuestion.value) return
  const question = reviewQuestion.value
  const isCorrect = userAnswer === question.correctIndex

  gradeRes.value = {
    isCorrect,
    explanation: question.explanation || '暂无解析',
  }
  showResult.value = true
}

function nextReview() {
  reviewing.value = false
  reviewQuestion.value = null
  showResult.value = false
  gradeRes.value = null
}

async function removeFromWrong(questionId) {
  wrongList.value = wrongList.value.filter(q => q.id !== questionId)
  await saveWrongQuestions(wrongList.value)
}
</script>

<template>
  <div class="quiz-history">
    <!-- 标签切换 -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'history' }"
        @click="activeTab = 'history'"
      >
        📋 历史记录
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'wrong' }"
        @click="activeTab = 'wrong'"
      >
        ❌ 错题本 ({{ wrongList.length }})
      </button>
    </div>

    <!-- 历史记录 -->
    <div v-if="activeTab === 'history'" class="history-list">
      <div v-if="visibleHistory.length === 0" class="empty-state">
        还没有学习记录
      </div>
      <div v-for="item in visibleHistory" :key="item.id" class="history-item">
        <span class="history-icon">{{ historyIcons[item.type] || '📝' }}</span>
        <div class="history-info">
          <span class="history-text">
            <template v-if="item.type === 'quiz_result'">
              {{ item.isCorrect ? '✓' : '✗' }} {{ item.topic || '练习' }}
            </template>
            <template v-else-if="item.type === 'rating'">
              测评完成: 评级 {{ item.rating }}
            </template>
            <template v-else-if="item.type === 'teaching'">
              {{ item.characterName }}讲解了{{ item.topic }}
            </template>
            <template v-else-if="item.type === 'url_import'">
              解析了 {{ item.title || '一个 URL' }}
            </template>
            <template v-else-if="item.type === 'level_up'">
              升级到 Level {{ item.level }}!
            </template>
            <template v-else-if="item.type === 'achievement'">
              解锁成就「{{ item.achievementName }}」
            </template>
          </span>
          <span class="history-time">{{ formatQuizTime(item.timestamp) }}</span>
        </div>
        <span v-if="item.xp" class="history-xp">+{{ item.xp }}XP</span>
      </div>
    </div>

    <!-- 错题本 -->
    <div v-else class="wrong-list">
      <div v-if="wrongList.length === 0" class="empty-state">
        错题本是空的，真棒！
      </div>

      <div v-for="question in wrongList" :key="question.id" class="wrong-card">
        <div class="wrong-question">{{ question.question }}</div>
        <div class="wrong-options">
          <div
            v-for="(opt, idx) in question.options"
            :key="idx"
            class="wrong-option"
            :class="{
              correct: idx === question.correctIndex,
            }"
          >
            {{ String.fromCharCode(65 + idx) }}. {{ opt }}
            <span v-if="idx === question.correctIndex" class="correct-mark">✓</span>
          </div>
        </div>
        <div v-if="question.explanation" class="wrong-explanation">
          {{ question.explanation }}
        </div>
        <div class="wrong-actions">
          <button class="wrong-review-btn" @click="startReview(question)">
            🔄 复习
          </button>
          <button class="wrong-remove-btn" @click="removeFromWrong(question.id)">
            🗑️ 移除
          </button>
        </div>
      </div>

      <!-- 复习弹窗 -->
      <div v-if="reviewing && reviewQuestion" class="review-overlay">
        <div class="review-card">
          <div class="review-header">
            <h3>🔄 复习错题</h3>
            <button class="review-close-btn" @click="nextReview">✕</button>
          </div>
          <QuizQuestionView
            :question="reviewQuestion"
            :show-result="showResult"
            :grade-result="gradeRes"
            @submit="handleReviewAnswer"
            @next="nextReview"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quiz-history {
  padding: 16px;
  min-height: 100%;
}

.tab-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.tab-btn {
  flex: 1;
  padding: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #ccc;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.15);
  color: #fff;
}

.history-list,
.wrong-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-state {
  text-align: center;
  color: #555;
  padding: 40px 20px;
  font-size: 0.9rem;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
}

.history-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.history-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-text {
  font-size: 0.85rem;
  color: #ccc;
}

.history-time {
  font-size: 0.75rem;
  color: #666;
}

.history-xp {
  font-size: 0.8rem;
  color: #ffd700;
  font-weight: 600;
}

.wrong-card {
  background: rgba(255, 71, 87, 0.05);
  border: 1px solid rgba(255, 71, 87, 0.15);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 10px;
}

.wrong-question {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 10px;
  line-height: 1.5;
}

.wrong-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.wrong-option {
  font-size: 0.85rem;
  color: #999;
  padding: 6px 10px;
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
}

.wrong-option.correct {
  color: #43e97b;
  background: rgba(67, 233, 123, 0.1);
}

.correct-mark {
  font-weight: 700;
}

.wrong-explanation {
  font-size: 0.85rem;
  color: #888;
  line-height: 1.6;
  padding: 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  margin-bottom: 10px;
}

.wrong-actions {
  display: flex;
  gap: 8px;
}

.wrong-review-btn {
  flex: 1;
  padding: 10px;
  background: rgba(102, 126, 234, 0.15);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 8px;
  color: #667eea;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.wrong-remove-btn {
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #888;
  font-size: 0.85rem;
  cursor: pointer;
}

.review-overlay {
  position: fixed;
  inset: 0;
  z-index: 10002;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.review-card {
  background: #0a0a1a;
  border-radius: 16px;
  padding: 20px;
  max-width: 400px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.review-header h3 {
  margin: 0;
  font-size: 1.1rem;
}

.review-close-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px 8px;
}
</style>
