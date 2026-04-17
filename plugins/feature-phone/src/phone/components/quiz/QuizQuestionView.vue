<script setup>
/**
 * QuizQuestionView.vue - 答题界面（可复用组件）
 * 支持选择题和判断题，支持展示对错结果和解析。
 */
import { computed, ref } from 'vue'

const props = defineProps({
  question: { type: Object, required: true },
  showResult: { type: Boolean, default: false },
  gradeResult: { type: Object, default: null },
})

const emit = defineEmits(['submit', 'next'])

const selectedAnswer = ref(null)

const questionText = computed(() => props.question?.question || '')

const options = computed(() => {
  if (props.question?.type === 'true_false') {
    return ['正确', '错误']
  }
  return props.question?.options || []
})

const correctIndex = computed(() => props.question?.correctIndex ?? -1)

const isCorrect = computed(() => {
  if (!props.gradeResult) return null
  return props.gradeResult.isCorrect
})

function selectOption(index) {
  if (props.showResult) return
  selectedAnswer.value = index
}

function handleSubmit() {
  if (selectedAnswer.value === null) return
  emit('submit', selectedAnswer.value)
}

function handleNext() {
  selectedAnswer.value = null
  emit('next')
}
</script>

<template>
  <div class="quiz-question">
    <!-- 题目 -->
    <div class="question-text">
      {{ questionText }}
    </div>

    <!-- 选项 -->
    <div class="options-list">
      <button
        v-for="(option, idx) in options"
        :key="idx"
        class="option-btn"
        :class="{
          selected: selectedAnswer === idx && !showResult,
          correct: showResult && idx === correctIndex,
          wrong: showResult && selectedAnswer === idx && idx !== correctIndex,
        }"
        @click="selectOption(idx)"
      >
        <span class="option-label">{{ String.fromCharCode(65 + idx) }}</span>
        <span class="option-text">{{ option }}</span>
      </button>
    </div>

    <!-- 提交按钮 -->
    <button
      v-if="!showResult"
      class="submit-btn"
      :disabled="selectedAnswer === null"
      @click="handleSubmit"
    >
      确认答案
    </button>

    <!-- 结果 + 解析 -->
    <div v-if="showResult" class="result-section">
      <div class="result-header" :class="isCorrect ? 'correct' : 'wrong'">
        <span class="result-icon">{{ isCorrect ? '✅' : '❌' }}</span>
        <span class="result-text">
          {{ isCorrect ? '回答正确!' : '回答错误' }}
        </span>
        <span v-if="isCorrect" class="result-xp">+{{ gradeResult?.xp || 10 }}XP</span>
      </div>

      <div class="explanation">
        <h4>📝 解析</h4>
        <p>{{ gradeResult?.explanation || question?.explanation || '暂无解析' }}</p>
      </div>

      <button class="next-btn" @click="handleNext">
        {{ $parent?.allQuestions?.[($parent?.currentQuestionIndex || 0) + 1] ? '下一题' : '查看结果' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.quiz-question {
  padding: 16px;
}

.question-text {
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.6;
  margin-bottom: 20px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.option-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #fff;
  font-size: 0.95rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
}

.option-btn:hover:not(.correct):not(.wrong) {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.option-btn.selected {
  background: rgba(102, 126, 234, 0.15);
  border-color: #667eea;
}

.option-btn.correct {
  background: rgba(67, 233, 123, 0.15);
  border-color: #43e97b;
}

.option-btn.wrong {
  background: rgba(255, 71, 87, 0.15);
  border-color: #ff4757;
}

.option-label {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.option-btn.selected .option-label {
  background: #667eea;
}

.option-btn.correct .option-label {
  background: #43e97b;
  color: #000;
}

.option-btn.wrong .option-label {
  background: #ff4757;
}

.option-text {
  flex: 1;
  line-height: 1.4;
}

.submit-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.submit-btn:not(:disabled):hover {
  opacity: 0.9;
}

.result-section {
  margin-top: 16px;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  margin-bottom: 16px;
}

.result-header.correct {
  background: rgba(67, 233, 123, 0.15);
}

.result-header.wrong {
  background: rgba(255, 71, 87, 0.15);
}

.result-icon {
  font-size: 1.3rem;
}

.result-text {
  flex: 1;
  font-weight: 600;
  font-size: 1rem;
}

.result-xp {
  font-size: 0.85rem;
  color: #ffd700;
  font-weight: 600;
}

.explanation {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
}

.explanation h4 {
  margin: 0 0 8px;
  font-size: 0.9rem;
  color: #8b9dc3;
}

.explanation p {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.6;
  color: #ccc;
}

.next-btn {
  width: 100%;
  padding: 14px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.next-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}
</style>
