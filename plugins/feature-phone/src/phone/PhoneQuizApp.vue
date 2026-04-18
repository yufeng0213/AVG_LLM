<script setup>
/**
 * PhoneQuizApp.vue - 陪学 APP 入口
 * 管理各子 view 的切换：首页、测评、URL导入、角色陪学、练习、统计、历史。
 */
import { ref } from 'vue'
import QuizHomeView from './components/quiz/QuizHomeView.vue'
import QuizAssessmentView from './components/quiz/QuizAssessmentView.vue'
import QuizUrlImportView from './components/quiz/QuizUrlImportView.vue'
import QuizTeachingSetupView from './components/quiz/QuizTeachingSetupView.vue'
import QuizTeachingView from './components/quiz/QuizTeachingView.vue'
import QuizPracticeView from './components/quiz/QuizPracticeView.vue'
import QuizStatsView from './components/quiz/QuizStatsView.vue'
import QuizHistoryView from './components/quiz/QuizHistoryView.vue'
import QuizAchievementsView from './components/quiz/QuizAchievementsView.vue'

const emit = defineEmits(['back'])

const props = defineProps({
  icon: { type: String, default: '📖' },
  name: { type: String, default: '陪学' },
})

// 当前 view 状态
const currentView = ref('home') // home | assessment | url-import | teaching-setup | teaching | practice | stats | history | achievements

// 传递数据
const teachingParams = ref(null)
const teachingKey = ref(0) // 用于强制重新渲染 QuizTeachingView

function goHome() {
  currentView.value = 'home'
  teachingParams.value = null
}

function openAssessment() {
  currentView.value = 'assessment'
}

function openUrlImport() {
  currentView.value = 'url-import'
}

function openTeachingSetup() {
  currentView.value = 'teaching-setup'
}

function openPractice() {
  currentView.value = 'practice'
}

function openStats() {
  currentView.value = 'stats'
}

function openHistory() {
  currentView.value = 'history'
}

function openAchievements() {
  currentView.value = 'achievements'
}

function startTeaching(params) {
  teachingKey.value++
  teachingParams.value = params
  currentView.value = 'teaching'
}

function handleDeepen(params) {
  // 基于前一个教学内容继续深入，复用角色和来源，但标记为深入模式
  const prevParams = teachingParams.value
  teachingKey.value++
  teachingParams.value = {
    ...params,
    character: prevParams?.character,
    useDefault: prevParams?.useDefault ?? true,
    deepLevel: (prevParams?.deepLevel || 0) + 1,
  }
  currentView.value = 'teaching'
}
</script>

<template>
  <div class="quiz-app">
    <!-- 顶栏 -->
    <div class="quiz-header">
      <button v-if="currentView !== 'home'" class="quiz-back-btn" @click="goHome">← 返回</button>
      <span v-else class="quiz-back-btn" @click="emit('back')">← 关闭</span>
      <span class="quiz-title">{{ icon }} {{ name }}</span>
      <div class="quiz-header-actions">
        <button v-if="currentView === 'home'" class="quiz-icon-btn" @click="openAchievements">🏆</button>
        <button v-if="currentView === 'home'" class="quiz-icon-btn" @click="openStats">📊</button>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="quiz-content">
      <QuizHomeView
        v-if="currentView === 'home'"
        @open-assessment="openAssessment"
        @open-url-import="openUrlImport"
        @open-teaching="openTeachingSetup"
        @open-practice="openPractice"
        @open-history="openHistory"
      />

      <QuizAssessmentView
        v-if="currentView === 'assessment'"
        @back="goHome"
      />

      <QuizUrlImportView
        v-if="currentView === 'url-import'"
        @back="goHome"
        @start-teaching="startTeaching"
      />

      <QuizTeachingSetupView
        v-if="currentView === 'teaching-setup'"
        @back="goHome"
        @start-teaching="startTeaching"
      />

      <QuizTeachingView
        v-if="currentView === 'teaching' && teachingParams"
        :key="teachingKey"
        :params="teachingParams"
        @back="goHome"
        @start-teaching="startTeaching"
        @deepen="handleDeepen"
      />

      <QuizPracticeView
        v-if="currentView === 'practice'"
        @back="goHome"
      />

      <QuizStatsView
        v-if="currentView === 'stats'"
        @back="goHome"
      />

      <QuizHistoryView
        v-if="currentView === 'history'"
        @back="goHome"
        @start-teaching="startTeaching"
      />

      <QuizAchievementsView
        v-if="currentView === 'achievements'"
        @back="goHome"
      />
    </div>
  </div>
</template>

<style scoped>
.quiz-app {
  position: fixed;
  inset: 0;
  padding-top: var(--safe-area-inset-top, 0px);
  padding-bottom: var(--safe-area-inset-bottom, 0px);
  z-index: 10001;
  display: flex;
  flex-direction: column;
  background: var(--quiz-bg, #0a0a1a);
  color: var(--quiz-text-primary, #fff);
  font-family: var(--font-body, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  overflow: hidden;
}

.quiz-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: var(--quiz-card-bg, rgba(255, 255, 255, 0.05));
  border-bottom: 1px solid var(--quiz-border, rgba(255, 255, 255, 0.08));
  flex-shrink: 0;
}

.quiz-back-btn {
  background: none;
  border: none;
  color: var(--quiz-text-secondary, #8b9dc3);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
}

.quiz-back-btn:hover {
  background: var(--quiz-border, rgba(255, 255, 255, 0.1));
}

.quiz-title {
  flex: 1;
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
  color: var(--quiz-text-primary, #fff);
}

.quiz-header-actions {
  display: flex;
  gap: 8px;
}

.quiz-icon-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: background 0.2s;
  color: var(--quiz-text-primary, #fff);
}

.quiz-icon-btn:hover {
  background: var(--quiz-border, rgba(255, 255, 255, 0.1));
}

.quiz-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
