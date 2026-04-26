<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { usePuzzleGame } from './composables/usePuzzleGame.js'
import { generatePuzzleData } from './services/puzzleGenerationService.js'

const props = defineProps({
  taskId: { type: String, default: '' },
  worldBook: { type: Object, default: () => ({}) },
  task: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['back', 'puzzle-success', 'puzzle-fail'])

const puzzle = usePuzzleGame()
const generating = ref(false)
const loadingText = ref('')
const answerInput = ref('')
const answerFeedback = ref('')
const answerFeedbackCorrect = ref(false)
const showStory = ref(true)
const inputRef = ref(null)

const progressPercent = computed(() => {
  if (!puzzle.session.value) return 0
  const total = puzzle.session.value.puzzles.length
  const done = puzzle.session.value.currentPuzzleIndex
  return total > 0 ? (done / total) * 100 : 0
})

const puzzleTypeLabel = (type) => {
  const map = { riddle: '谜语', cipher: '密码', logic: '逻辑', pattern: '图案' }
  return map[type] || type
}

onMounted(async () => {
  generating.value = true
  loadingText.value = '正在生成谜题...'
  try {
    const result = await generatePuzzleData({
      task: props.task,
      worldBook: props.worldBook,
      userProfile: {},
    })
    if (!result.success) {
      loadingText.value = '谜题生成失败，请返回重试'
      return
    }
    puzzle.createPuzzleSession(result.data, props.taskId)
  } catch {
    loadingText.value = '谜题生成异常，请返回重试'
  } finally {
    generating.value = false
  }
})

const handleStoryDismiss = () => {
  showStory.value = false
  puzzle.startPuzzles()
  nextTick(() => inputRef.value?.focus())
}

const handleSubmitAnswer = () => {
  if (!answerInput.value.trim()) return
  const result = puzzle.submitAnswer(answerInput.value)
  if (result.correct) {
    answerFeedback.value = '正确！'
    answerFeedbackCorrect.value = true
  } else {
    answerFeedback.value = `错误！正确答案是：${puzzle.currentPuzzle.value?.answer}`
    answerFeedbackCorrect.value = false
  }
  answerInput.value = ''
  setTimeout(() => {
    answerFeedback.value = ''
    // 如果还在 playing 状态（还有下一题），自动聚焦输入框
    if (puzzle.session.value?.status === 'playing') {
      nextTick(() => inputRef.value?.focus())
    }
    // solved 状态不再自动跳转，留给用户看结果页并点击按钮
  }, 1500)
}

const handleUseHint = () => {
  const hint = puzzle.useHint()
  if (hint) {
    // hint is shown in the UI
  }
}

const handleSolved = () => {
  puzzle.completeFinalAnswer()
  emit('puzzle-success', { taskId: props.taskId, reasoningPoints: puzzle.session.value?.reasoningPoints || 0 })
}

const handleFail = () => {
  puzzle.failPuzzle()
  emit('puzzle-fail', { taskId: props.taskId })
}

const handleBack = () => {
  emit('back')
}
</script>

<template>
  <div class="puzzle-screen">
    <!-- Loading -->
    <div v-if="generating || !puzzle.session.value" class="puzzle-loading">
      <div class="puzzle-loading-spinner">🔮</div>
      <p>{{ loadingText || '加载中...' }}</p>
    </div>

    <!-- Intro Story -->
    <Teleport v-if="puzzle.session.value?.status === 'intro' && showStory" to="body">
      <div class="puzzle-story-overlay" @click="handleStoryDismiss">
        <Transition name="story-fade">
          <div v-if="showStory" class="puzzle-story-card">
            <div class="puzzle-story-text">{{ puzzle.session.value.story }}</div>
            <div class="puzzle-story-hint">点击任意处开始解谜</div>
          </div>
        </Transition>
      </div>
    </Teleport>

    <!-- Playing -->
    <template v-if="puzzle.session.value?.status === 'playing'">
      <header class="puzzle-header">
        <button type="button" class="puzzle-back-btn" @click="handleBack">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 class="puzzle-title">🔮 解谜</h2>
        <div class="puzzle-progress-wrap">
          <div class="puzzle-progress-bar">
            <div class="puzzle-progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <span class="puzzle-progress-text">
            {{ puzzle.session.value.currentPuzzleIndex + 1 }}/{{ puzzle.session.value.puzzles.length }}
          </span>
        </div>
      </header>

      <div class="puzzle-body">
        <div class="puzzle-card">
          <div class="puzzle-card-header">
            <span class="puzzle-type-tag">{{ puzzleTypeLabel(puzzle.currentPuzzle.value?.type) }}</span>
            <span v-if="puzzle.isLastPuzzle.value" class="puzzle-last-tag">最终谜题</span>
          </div>

          <div class="puzzle-clue">
            <p>{{ puzzle.currentPuzzle.value?.clue }}</p>
          </div>

          <!-- Options for choice-type puzzles -->
          <div v-if="puzzle.currentPuzzle.value?.options?.length > 0" class="puzzle-options">
            <button
              v-for="(opt, i) in puzzle.currentPuzzle.value.options"
              :key="i"
              type="button"
              class="puzzle-option-btn"
              @click="answerInput = opt; handleSubmitAnswer()"
            >
              {{ opt }}
            </button>
          </div>

          <!-- Text input for open-answer puzzles -->
          <div v-else class="puzzle-input-area">
            <input
              ref="inputRef"
              v-model="answerInput"
              type="text"
              class="puzzle-input"
              placeholder="输入你的答案..."
              @keyup.enter="handleSubmitAnswer"
              :disabled="!!answerFeedback"
            />
            <button type="button" class="puzzle-submit-btn" @click="handleSubmitAnswer" :disabled="!answerInput.trim() || !!answerFeedback">
              提交
            </button>
          </div>

          <!-- Hints -->
          <div v-if="puzzle.availableHints.value > 0" class="puzzle-hints">
            <button type="button" class="puzzle-hint-btn" @click="handleUseHint">
              💡 提示 ({{ puzzle.availableHints.value }} 剩余)
            </button>
          </div>

          <!-- Revealed hints -->
          <div v-if="puzzle.session.value?.hintsUsed.length > 0" class="puzzle-hints-revealed">
            <div v-for="hintIdx in puzzle.session.value.hintsUsed" :key="hintIdx" class="puzzle-hint-text">
              💡 {{ puzzle.currentPuzzle.value?.hints[hintIdx] }}
            </div>
          </div>

          <!-- Answer feedback -->
          <Transition name="feedback-fade">
            <div v-if="answerFeedback" class="puzzle-feedback" :class="answerFeedbackCorrect ? 'correct' : 'wrong'">
              {{ answerFeedback }}
            </div>
          </Transition>
        </div>

        <div class="puzzle-reasoning">
          <span>🧠 推理点数：{{ puzzle.session.value?.reasoningPoints || 0 }}</span>
        </div>
      </div>
    </template>

    <!-- Solved / Results -->
    <div v-if="puzzle.session.value?.status === 'solved'" class="puzzle-results">
      <div class="puzzle-results-icon">✨</div>
      <h2 class="puzzle-results-title">谜题全部解开！</h2>

      <div class="puzzle-results-stats">
        <div class="puzzle-stat">
          <span>🧠 推理点数</span>
          <span class="puzzle-stat-value">{{ puzzle.session.value.reasoningPoints }}</span>
        </div>
        <div class="puzzle-stat">
          <span>✅ 正确数</span>
          <span class="puzzle-stat-value">{{ puzzle.session.value.answers.filter(a => a.correct).length }}/{{ puzzle.session.value.answers.length }}</span>
        </div>
      </div>

      <div class="puzzle-results-answers">
        <h3>答案回顾</h3>
        <div v-for="(ans, i) in puzzle.session.value.answers" :key="i" class="puzzle-answer-row" :class="ans.correct ? 'correct' : 'wrong'">
          <span class="puzzle-answer-num">{{ i + 1 }}</span>
          <span class="puzzle-answer-text">{{ ans.answer }}</span>
          <span class="puzzle-answer-icon">{{ ans.correct ? '✅' : '❌' }}</span>
        </div>
      </div>

      <div class="puzzle-final-prompt" v-if="puzzle.session.value.finalAnswerPrompt">
        <p>{{ puzzle.session.value.finalAnswerPrompt }}</p>
      </div>

      <div class="puzzle-results-actions">
        <button type="button" class="puzzle-continue-btn" @click="handleSolved">
          完成任务
        </button>
      </div>
    </div>

    <!-- Failed -->
    <div v-if="puzzle.session.value?.status === 'failed'" class="puzzle-results">
      <div class="puzzle-results-icon">💔</div>
      <h2 class="puzzle-results-title">解谜失败</h2>
      <p class="puzzle-results-desc">未能解开谜题，请返回任务板重新开始</p>
      <div class="puzzle-results-actions">
        <button type="button" class="puzzle-continue-btn" @click="handleFail">
          返回任务板
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.puzzle-screen {
  position: fixed;
  inset: 0;
  padding-top: var(--safe-area-inset-top, 0px);
  padding-bottom: var(--safe-area-inset-bottom, 0px);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  background: var(--task-bg, #0a0a1a);
  color: var(--task-text-primary, #ffffff);
  overflow: hidden;
}

/* Loading */
.puzzle-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex: 1;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.5));
}
.puzzle-loading-spinner {
  font-size: 3rem;
  animation: pulse-glow 2s ease-in-out infinite;
}
@keyframes pulse-glow {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* Story overlay */
.puzzle-story-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  cursor: pointer;
}
.puzzle-story-card {
  max-width: 500px;
  padding: 32px 24px;
  background: var(--task-card-bg, rgba(255, 215, 0, 0.05));
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.15));
  border-radius: 16px;
  text-align: center;
  cursor: pointer;
  margin: 0 20px;
}
.puzzle-story-text {
  font-size: 1rem;
  line-height: 1.7;
  color: var(--task-text-primary, #fff);
}
.puzzle-story-hint {
  margin-top: 24px;
  font-size: 0.82rem;
  color: var(--task-gold, #ffd700);
  opacity: 0.7;
}
.story-fade-enter-active { transition: opacity 0.8s ease; }
.story-fade-enter-from { opacity: 0; }

/* Header */
.puzzle-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--task-header-bg, rgba(0,0,0,0.3));
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.1));
}
.puzzle-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.7));
  width: 40px;
  height: 40px;
  border-radius: 8px;
  cursor: pointer;
}
.puzzle-back-btn:hover { background: rgba(255, 255, 255, 0.1); }
.puzzle-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--task-gold, #ffd700);
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
  flex: 1;
  text-align: center;
}
.puzzle-progress-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.puzzle-progress-bar {
  width: 80px;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}
.puzzle-progress-fill {
  height: 100%;
  background: var(--task-gold, #ffd700);
  transition: width 0.4s ease;
}
.puzzle-progress-text {
  font-size: 0.72rem;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.5));
}

/* Body */
.puzzle-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  flex: 1;
  overflow-y: auto;
}
.puzzle-card {
  padding: 20px;
  border-radius: 14px;
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.12));
  background: var(--task-card-bg, rgba(255, 215, 0, 0.05));
}
.puzzle-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.puzzle-type-tag {
  font-size: 0.72rem;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--task-gold-dim, rgba(255, 215, 0, 0.1));
  color: var(--task-gold, #ffd700);
}
.puzzle-last-tag {
  font-size: 0.68rem;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 60, 60, 0.1);
  color: rgba(255, 100, 100, 0.8);
}
.puzzle-clue {
  margin-bottom: 16px;
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--task-text-primary, #fff);
}

/* Options */
.puzzle-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.puzzle-option-btn {
  text-align: left;
  padding: 12px 16px;
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.2));
  border-radius: 10px;
  background: var(--task-gold-dim, rgba(255, 215, 0, 0.04));
  color: var(--task-text-primary, #fff);
  font-size: 0.88rem;
  cursor: pointer;
  transition: all 150ms ease;
}
.puzzle-option-btn:hover {
  background: rgba(255, 215, 0, 0.12);
  border-color: var(--task-gold, #ffd700);
}

/* Input */
.puzzle-input-area {
  display: flex;
  gap: 8px;
}
.puzzle-input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.2));
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.3);
  color: var(--task-text-primary, #fff);
  font-size: 0.9rem;
  outline: none;
}
.puzzle-input:focus { border-color: var(--task-gold, #ffd700); }
.puzzle-submit-btn {
  padding: 10px 20px;
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.3));
  border-radius: 10px;
  background: var(--task-gold, #ffd700);
  color: #000;
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
}
.puzzle-submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Hints */
.puzzle-hints { margin-top: 12px; }
.puzzle-hint-btn {
  background: transparent;
  border: 1px dashed rgba(255, 215, 0, 0.2);
  border-radius: 8px;
  padding: 6px 12px;
  color: var(--task-gold, #ffd700);
  font-size: 0.78rem;
  cursor: pointer;
  opacity: 0.7;
}
.puzzle-hint-btn:hover { opacity: 1; }
.puzzle-hints-revealed { margin-top: 8px; }
.puzzle-hint-text {
  font-size: 0.82rem;
  padding: 8px 12px;
  background: rgba(255, 215, 0, 0.04);
  border-left: 3px solid var(--task-gold, #ffd700);
  border-radius: 4px;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.7));
  margin-bottom: 4px;
}

/* Feedback */
.puzzle-feedback {
  margin-top: 16px;
  padding: 12px 16px;
  border-radius: 10px;
  text-align: center;
  font-weight: 600;
  font-size: 0.95rem;
}
.puzzle-feedback.correct {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #22c55e;
}
.puzzle-feedback.wrong {
  background: rgba(217, 64, 64, 0.1);
  border: 1px solid rgba(217, 64, 64, 0.3);
  color: #d94040;
}
.feedback-fade-enter-active { transition: opacity 0.3s ease; }
.feedback-fade-enter-from { opacity: 0; }

/* Reasoning points */
.puzzle-reasoning {
  text-align: center;
  font-size: 0.85rem;
  color: var(--task-gold, #ffd700);
  padding: 8px;
}

/* Results */
.puzzle-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  flex: 1;
  overflow-y: auto;
}
.puzzle-results-icon { font-size: 3rem; margin-bottom: 12px; }
.puzzle-results-title {
  margin: 0 0 20px;
  font-size: 1.2rem;
  color: var(--task-gold, #ffd700);
}
.puzzle-results-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
}
.puzzle-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 0.82rem;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.5));
}
.puzzle-stat-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--task-text-primary, #fff);
}
.puzzle-results-answers {
  width: 100%;
  max-width: 400px;
  margin-bottom: 20px;
}
.puzzle-results-answers h3 {
  margin: 0 0 12px;
  font-size: 0.95rem;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.6));
}
.puzzle-answer-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 6px;
  font-size: 0.85rem;
}
.puzzle-answer-row.correct { background: rgba(34, 197, 94, 0.06); }
.puzzle-answer-row.wrong { background: rgba(217, 64, 64, 0.06); }
.puzzle-answer-num {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  flex-shrink: 0;
}
.puzzle-answer-text { flex: 1; color: var(--task-text-primary, #fff); }
.puzzle-answer-icon { font-size: 0.9rem; }
.puzzle-final-prompt {
  width: 100%;
  max-width: 400px;
  padding: 14px 16px;
  background: var(--task-gold-dim, rgba(255, 215, 0, 0.06));
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.15));
  border-radius: 10px;
  margin-bottom: 20px;
  text-align: center;
  font-size: 0.9rem;
  color: var(--task-gold, #ffd700);
}
.puzzle-results-actions { margin-top: 8px; }
.puzzle-continue-btn {
  padding: 12px 32px;
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.3));
  border-radius: 12px;
  background: var(--task-gold, #ffd700);
  color: #000;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
}
.puzzle-continue-btn:hover { background: rgba(255, 215, 0, 0.85); }

.puzzle-results-desc {
  text-align: center;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.5));
  margin-bottom: 24px;
}
</style>
