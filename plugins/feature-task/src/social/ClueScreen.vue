<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useClueGame } from './composables/useClueGame.js'
import { generateClueData } from './services/clueGenerationService.js'
import NPCDialog from './components/NPCDialog.vue'
import ClueBoard from './components/ClueBoard.vue'

const props = defineProps({
  taskId: { type: String, default: '' },
  worldBook: { type: Object, default: () => ({}) },
  task: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['back', 'clue-success', 'clue-fail'])

const clue = useClueGame()
const generating = ref(false)
const loadingText = ref('')
const showStory = ref(true)
const conclusionSelected = ref(null)
const recentTrustChange = ref(null)
const clueUnlockedFlash = ref(null)

const progressPercent = computed(() => {
  if (!clue.session.value) return 0
  const total = clue.session.value.npcs.length
  const done = clue.session.value.answeredNpcs?.size || 0
  return total > 0 ? (done / total) * 100 : 0
})

const rating = computed(() => {
  if (clue.session.value?.status === 'result') return clue.getRating()
  return null
})

onMounted(async () => {
  generating.value = true
  loadingText.value = '正在生成案件...'
  try {
    const result = await generateClueData({
      task: props.task,
      worldBook: props.worldBook,
      userProfile: {},
    })
    if (!result.success) {
      loadingText.value = '案件生成失败，请返回重试'
      return
    }
    clue.createSession(result.data, props.taskId)
  } catch {
    loadingText.value = '案件生成异常，请返回重试'
  } finally {
    generating.value = false
  }
})

const handleStoryDismiss = () => {
  showStory.value = false
  clue.startInvestigation()
}

const handleDialogueSelect = (option) => {
  const npcName = clue.currentNpc.value?.name
  if (!npcName) return

  const result = clue.selectDialogueOption(npcName, option)
  if (!result) return

  // Show trust change feedback
  recentTrustChange.value = {
    npcName,
    trustChange: result.trustChange,
    trust: result.trust,
  }
  setTimeout(() => { recentTrustChange.value = null }, 1500)

  // Show clue unlocked
  if (result.clueUnlocked) {
    clueUnlockedFlash.value = result.clueUnlocked
    setTimeout(() => { clueUnlockedFlash.value = null }, 2000)
  }

  // If NPC dialogue complete, auto advance after delay
  if (result.dialogueComplete) {
    setTimeout(() => {
      clue.nextNpc()
      if (clue.session.value?.status === 'concluding') {
        nextTick(() => {
          // scroll to conclusion area
        })
      }
    }, 1200)
  }
}

const handleSelectConclusion = (index) => {
  if (conclusionSelected.value !== null) return
  conclusionSelected.value = index
  clue.submitConclusion(index)
}

const handleComplete = () => {
  const r = clue.getRating()
  if (r.score > 0) {
    emit('clue-success', { taskId: props.taskId, score: r.score, rating: r.label })
  } else {
    emit('clue-fail', { taskId: props.taskId })
  }
}

const handleBack = () => emit('back')
</script>

<template>
  <div class="clue-screen">
    <!-- Loading -->
    <div v-if="generating || !clue.session.value" class="clue-loading">
      <div class="clue-loading-icon">🔍</div>
      <p>{{ loadingText || '加载中...' }}</p>
    </div>

    <!-- Intro Story -->
    <Teleport v-if="clue.session.value?.status === 'intro' && showStory" to="body">
      <div class="clue-story-overlay" @click="handleStoryDismiss">
        <Transition name="story-fade">
          <div v-if="showStory" class="clue-story-card">
            <div class="clue-story-title">🔍 案件调查</div>
            <div class="clue-story-text">{{ clue.session.value.story }}</div>
            <div class="clue-story-npcs">
              调查对象：
              <span v-for="npc in clue.session.value.npcs" :key="npc.name" class="npc-tag">
                {{ npc.name }}（{{ npc.role }}）
              </span>
            </div>
            <div class="clue-story-hint">点击任意处开始调查</div>
          </div>
        </Transition>
      </div>
    </Teleport>

    <!-- Investigating -->
    <template v-if="clue.session.value?.status === 'investigating'">
      <header class="clue-header">
        <button type="button" class="clue-back-btn" @click="handleBack">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 class="clue-title">🔍 线索收集</h2>
        <div class="clue-progress-wrap">
          <div class="clue-progress-bar">
            <div class="clue-progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <span class="clue-progress-text">{{ clue.unlockedClueCount }}/{{ clue.totalClueCount }}</span>
        </div>
      </header>

      <div class="clue-body">
        <!-- NPC Selector -->
        <div class="npc-selector">
          <button
            v-for="(npc, i) in clue.session.value.npcs"
            :key="npc.name"
            type="button"
            class="npc-selector-btn"
            :class="{
              active: clue.session.value.currentNpcIndex === i,
              done: clue.session.value.answeredNpcs.has(npc.name),
            }"
            @click="clue.selectNpc(i)"
          >
            <span class="npc-selector-name">{{ npc.name }}</span>
            <span v-if="clue.session.value.answeredNpcs.has(npc.name)" class="npc-selector-done">✅</span>
          </button>
        </div>

        <!-- Trust Change Feedback -->
        <Transition name="feedback-fade">
          <div v-if="recentTrustChange" class="trust-feedback" :class="recentTrustChange.trustChange > 0 ? 'positive' : 'negative'">
            {{ recentTrustChange.trustChange > 0 ? '+' : '' }}{{ recentTrustChange.trustChange }}
          </div>
        </Transition>

        <!-- Clue Unlocked Flash -->
        <Transition name="feedback-fade">
          <div v-if="clueUnlockedFlash" class="clue-unlocked-flash">
            🔓 新线索解锁：{{ clueUnlockedFlash.name }}
          </div>
        </Transition>

        <!-- Current NPC Dialogue -->
        <NPCDialog
          v-if="clue.currentDialogue.value"
          :npc="clue.currentNpc.value"
          :dialogue="clue.currentDialogue.value"
          :trust="clue.session.value.npcTrust[clue.currentNpc.value?.name] || 0"
          @select="handleDialogueSelect"
        />

        <!-- NPC Dialogue Complete -->
        <div v-if="!clue.currentDialogue.value && clue.session.value.currentNpcIndex < clue.session.value.npcs.length" class="npc-complete">
          <p>{{ clue.currentNpc.value?.name }} 的线索已收集完毕</p>
          <button type="button" class="next-npc-btn" @click="clue.nextNpc()">
            {{ clue.session.value.currentNpcIndex < clue.session.value.npcs.length - 1 ? '→ 下一个调查对象' : '📋 整合线索' }}
          </button>
        </div>

        <!-- Clue Board (always visible during investigation) -->
        <ClueBoard :clues="clue.allClues" />
      </div>
    </template>

    <!-- Concluding -->
    <template v-if="clue.session.value?.status === 'concluding'">
      <header class="clue-header">
        <button type="button" class="clue-back-btn" @click="handleBack">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 class="clue-title">📋 整合线索</h2>
      </header>

      <div class="clue-body conclude-body">
        <ClueBoard :clues="clue.allClues" />

        <div class="conclude-section">
          <h3 class="conclude-question">综合以上线索，你的结论是什么？</h3>

          <div v-if="clue.session.value.conclusion?.hint" class="conclude-hint">
            {{ clue.session.value.conclusion.hint }}
          </div>

          <div v-if="clue.session.value.conclusion?.options?.length > 0" class="conclude-options">
            <button
              v-for="(opt, i) in clue.session.value.conclusion.options"
              :key="i"
              type="button"
              class="conclude-option-btn"
              :class="{
                correct: conclusionSelected !== null && opt === clue.session.value.conclusion.answer,
                wrong: conclusionSelected === i && !clue.session.value.conclusionCorrect,
              }"
              @click="handleSelectConclusion(i)"
            >
              {{ opt }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Result -->
    <div v-if="clue.session.value?.status === 'result'" class="clue-results">
      <div class="clue-results-icon">{{ rating?.emoji }}</div>
      <h2 class="clue-results-title">{{ rating?.label }}</h2>

      <div class="clue-results-stats">
        <div class="clue-stat">
          <span>🔍 线索收集</span>
          <span class="clue-stat-value">{{ clue.unlockedClueCount }}/{{ clue.totalClueCount }}</span>
        </div>
        <div class="clue-stat">
          <span>{{ clue.session.value.conclusionCorrect ? '✅ 结论' : '❌ 结论' }}</span>
          <span class="clue-stat-value">{{ clue.session.value.conclusionCorrect ? '正确' : '错误' }}</span>
        </div>
      </div>

      <ClueBoard :clues="clue.allClues" />

      <div v-if="clue.session.value.conclusion" class="clue-answer-reveal">
        <p>正确答案：<strong>{{ clue.session.value.conclusion.answer }}</strong></p>
      </div>

      <div class="clue-results-actions">
        <button type="button" class="clue-continue-btn" @click="handleComplete">
          {{ rating?.score > 0 ? '完成任务' : '返回任务板' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clue-screen {
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
.clue-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex: 1;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.5));
}
.clue-loading-icon {
  font-size: 3rem;
  animation: pulse-glow 2s ease-in-out infinite;
}
@keyframes pulse-glow {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* Story overlay */
.clue-story-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  cursor: pointer;
}
.clue-story-card {
  max-width: 500px;
  padding: 32px 24px;
  background: var(--task-card-bg, rgba(255, 215, 0, 0.05));
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.15));
  border-radius: 16px;
  text-align: center;
  cursor: pointer;
  margin: 0 20px;
}
.clue-story-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--task-gold, #ffd700);
  margin-bottom: 16px;
}
.clue-story-text {
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--task-text-primary, #fff);
  text-align: left;
}
.clue-story-npcs {
  margin-top: 16px;
  font-size: 0.85rem;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.6));
}
.npc-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 215, 0, 0.08);
  color: var(--task-gold, #ffd700);
  margin: 4px 4px 4px 0;
  font-size: 0.78rem;
}
.clue-story-hint {
  margin-top: 24px;
  font-size: 0.82rem;
  color: var(--task-gold, #ffd700);
  opacity: 0.7;
}
.story-fade-enter-active { transition: opacity 0.8s ease; }
.story-fade-enter-from { opacity: 0; }

/* Header */
.clue-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--task-header-bg, rgba(0,0,0,0.3));
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.1));
}
.clue-back-btn {
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
.clue-back-btn:hover { background: rgba(255, 255, 255, 0.1); }
.clue-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--task-gold, #ffd700);
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
  flex: 1;
  text-align: center;
}
.clue-progress-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.clue-progress-bar {
  width: 60px;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}
.clue-progress-fill {
  height: 100%;
  background: var(--task-gold, #ffd700);
  transition: width 0.4s ease;
}
.clue-progress-text {
  font-size: 0.72rem;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.5));
  min-width: 24px;
}

/* Body */
.clue-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  flex: 1;
  overflow-y: auto;
}

/* NPC Selector */
.npc-selector {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0;
}
.npc-selector-btn {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.2));
  background: var(--task-gold-dim, rgba(255, 215, 0, 0.04));
  color: var(--task-text-primary, #fff);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 150ms ease;
}
.npc-selector-btn.active {
  background: var(--task-gold, #ffd700);
  color: #000;
}
.npc-selector-btn.done {
  opacity: 0.5;
}
.npc-selector-done { font-size: 0.75rem; }

/* Trust Feedback */
.trust-feedback {
  text-align: center;
  font-size: 1.5rem;
  font-weight: 800;
  padding: 8px;
}
.trust-feedback.positive { color: #22c55e; }
.trust-feedback.negative { color: #ef4444; }

/* Clue Unlocked Flash */
.clue-unlocked-flash {
  text-align: center;
  padding: 10px 16px;
  background: rgba(255, 215, 0, 0.08);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 10px;
  font-size: 0.9rem;
  color: var(--task-gold, #ffd700);
  font-weight: 600;
}

/* NPC Complete */
.npc-complete {
  text-align: center;
  padding: 16px;
}
.npc-complete p {
  margin: 0 0 12px;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.5));
  font-size: 0.85rem;
}
.next-npc-btn {
  padding: 10px 24px;
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.3));
  border-radius: 10px;
  background: var(--task-gold, #ffd700);
  color: #000;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
}

/* Conclude */
.conclude-body { padding-bottom: 24px; }
.conclude-section {
  padding: 16px;
  background: var(--task-card-bg, rgba(255, 215, 0, 0.04));
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.12));
  border-radius: 14px;
}
.conclude-question {
  margin: 0 0 12px;
  font-size: 0.95rem;
  color: var(--task-gold, #ffd700);
}
.conclude-hint {
  margin-bottom: 12px;
  padding: 10px 14px;
  background: rgba(255, 215, 0, 0.04);
  border-left: 3px solid var(--task-gold, #ffd700);
  border-radius: 4px;
  font-size: 0.82rem;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.6));
}
.conclude-options { display: flex; flex-direction: column; gap: 8px; }
.conclude-option-btn {
  padding: 12px 16px;
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.2));
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.2);
  color: var(--task-text-primary, #fff);
  font-size: 0.88rem;
  cursor: pointer;
  text-align: left;
  transition: all 150ms ease;
  line-height: 1.4;
}
.conclude-option-btn:hover {
  background: rgba(255, 215, 0, 0.08);
  border-color: var(--task-gold, #ffd700);
}
.conclude-option-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.conclude-option-btn.correct {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
}
.conclude-option-btn.wrong {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
}

/* Results */
.clue-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  flex: 1;
  overflow-y: auto;
}
.clue-results-icon { font-size: 3rem; margin-bottom: 12px; }
.clue-results-title {
  margin: 0 0 20px;
  font-size: 1.2rem;
  color: var(--task-gold, #ffd700);
}
.clue-results-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
}
.clue-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 0.82rem;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.5));
}
.clue-stat-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--task-text-primary, #fff);
}
.clue-answer-reveal {
  width: 100%;
  max-width: 400px;
  padding: 14px 16px;
  background: var(--task-gold-dim, rgba(255, 215, 0, 0.06));
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.15));
  border-radius: 10px;
  margin: 16px 0;
  text-align: center;
  font-size: 0.9rem;
  color: var(--task-gold, #ffd700);
}
.clue-results-actions { margin-top: 8px; }
.clue-continue-btn {
  padding: 12px 32px;
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.3));
  border-radius: 12px;
  background: var(--task-gold, #ffd700);
  color: #000;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
}
.clue-continue-btn:hover { background: rgba(255, 215, 0, 0.85); }

.feedback-fade-enter-active { transition: opacity 0.3s ease; }
.feedback-fade-enter-from { opacity: 0; }
</style>
