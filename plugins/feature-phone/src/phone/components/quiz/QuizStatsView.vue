<script setup>
/**
 * QuizStatsView.vue - 成长统计
 * 展示每日答题数、正确率趋势等。
 */
import { computed, onMounted, ref } from 'vue'
import { loadStats, loadProfile } from '../../composables/useQuizData.js'

const emit = defineEmits(['back'])

const profile = ref(null)
const dailyStats = ref([])
const chartData = ref([])

onMounted(async () => {
  profile.value = await loadProfile()
  const stats = await loadStats()

  // 取最近 7 天的数据
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const label = `${d.getMonth() + 1}/${d.getDate()}`
    days.push({ key, label, ...(stats[key] || { questionCount: 0, correctCount: 0, xpGained: 0 }) })
  }

  chartData.value = days
  dailyStats.value = days
})

const maxQuestions = computed(() => {
  return Math.max(1, ...chartData.value.map(d => d.questionCount || 0))
})

const totalQuestions = computed(() => {
  return chartData.value.reduce((sum, d) => sum + (d.questionCount || 0), 0)
})

const totalCorrect = computed(() => {
  return chartData.value.reduce((sum, d) => sum + (d.correctCount || 0), 0)
})

const accuracyPercent = computed(() => {
  return totalQuestions.value > 0 ? Math.round((totalCorrect.value / totalQuestions.value) * 100) : 0
})

const totalXP = computed(() => {
  return chartData.value.reduce((sum, d) => sum + (d.xpGained || 0), 0)
})
</script>

<template>
  <div class="quiz-stats">
    <h2 class="stats-title">📊 成长统计</h2>

    <!-- 汇总数据 -->
    <div class="summary-cards">
      <div class="summary-card">
        <span class="summary-value">{{ profile?.level || 1 }}</span>
        <span class="summary-label">等级</span>
      </div>
      <div class="summary-card">
        <span class="summary-value">{{ profile?.rating || '-' }}</span>
        <span class="summary-label">评级</span>
      </div>
      <div class="summary-card">
        <span class="summary-value">{{ totalQuestions }}</span>
        <span class="summary-label">本周答题</span>
      </div>
      <div class="summary-card">
        <span class="summary-value">{{ accuracyPercent }}%</span>
        <span class="summary-label">正确率</span>
      </div>
    </div>

    <!-- 答题趋势图 -->
    <div class="chart-section">
      <h3 class="chart-title">📈 每日答题数（近 7 天）</h3>
      <div class="bar-chart">
        <div v-for="day in chartData" :key="day.key" class="bar-item">
          <div class="bar-container">
            <div
              class="bar-fill"
              :style="{ height: Math.max(4, ((day.questionCount || 0) / maxQuestions) * 120) + 'px' }"
            />
          </div>
          <span class="bar-count">{{ day.questionCount || 0 }}</span>
          <span class="bar-label">{{ day.label }}</span>
        </div>
      </div>
    </div>

    <!-- 正确率趋势 -->
    <div class="chart-section">
      <h3 class="chart-title">🎯 每日正确率</h3>
      <div class="accuracy-list">
        <div v-for="day in chartData" :key="day.key" class="accuracy-item">
          <span class="accuracy-date">{{ day.label }}</span>
          <div class="accuracy-bar-bg">
            <div
              class="accuracy-bar-fill"
              :style="{ width: (day.questionCount > 0 ? Math.round((day.correctCount / day.questionCount) * 100) : 0) + '%' }"
            />
          </div>
          <span class="accuracy-percent">
            {{ day.questionCount > 0 ? Math.round((day.correctCount / day.questionCount) * 100) : 0 }}%
          </span>
        </div>
      </div>
    </div>

    <!-- XP 统计 -->
    <div class="xp-section">
      <h3 class="xp-title">⭐ 本周 XP</h3>
      <div class="xp-list">
        <div v-for="day in chartData.filter(d => d.xpGained > 0)" :key="day.key" class="xp-item">
          <span>{{ day.label }}</span>
          <span class="xp-value">+{{ day.xpGained }} XP</span>
        </div>
        <div v-if="chartData.filter(d => d.xpGained > 0).length === 0" class="xp-empty">
          本周还没有获得 XP
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quiz-stats {
  padding: 16px;
  min-height: 100%;
}

.stats-title {
  font-size: 1.2rem;
  margin-bottom: 20px;
  text-align: center;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 24px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 8px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
}

.summary-value {
  font-size: 1.4rem;
  font-weight: 700;
}

.summary-label {
  font-size: 0.75rem;
  color: #888;
  margin-top: 4px;
}

.chart-section {
  margin-bottom: 24px;
}

.chart-title {
  font-size: 0.95rem;
  color: #8b9dc3;
  margin-bottom: 12px;
}

.bar-chart {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  height: 160px;
  padding: 0 4px;
  gap: 6px;
}

.bar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 4px;
}

.bar-container {
  width: 100%;
  height: 120px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.bar-fill {
  width: 80%;
  min-height: 4px;
  background: linear-gradient(180deg, #667eea, #764ba2);
  border-radius: 4px 4px 0 0;
  transition: height 0.3s ease;
}

.bar-count {
  font-size: 0.75rem;
  color: #ccc;
}

.bar-label {
  font-size: 0.7rem;
  color: #666;
}

.accuracy-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.accuracy-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
}

.accuracy-date {
  width: 40px;
  color: #888;
  flex-shrink: 0;
}

.accuracy-bar-bg {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
}

.accuracy-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #43e97b, #38f9d7);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.accuracy-percent {
  width: 36px;
  text-align: right;
  color: #ccc;
  flex-shrink: 0;
}

.xp-section {
  margin-bottom: 16px;
}

.xp-title {
  font-size: 0.95rem;
  color: #8b9dc3;
  margin-bottom: 12px;
}

.xp-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.xp-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  font-size: 0.85rem;
}

.xp-item span:first-child {
  color: #888;
}

.xp-value {
  color: #ffd700;
  font-weight: 600;
}

.xp-empty {
  text-align: center;
  color: #555;
  font-size: 0.85rem;
  padding: 16px;
}
</style>
