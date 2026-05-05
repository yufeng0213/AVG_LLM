<script setup>
import { ref, computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import {
  ArcElement, Tooltip, Legend,
  DoughnutController,
} from 'chart.js'
import { useTodoInventory } from './composables/useTodoInventory.js'

const todo = useTodoInventory()

const timeRange = ref('week')

const QUOTES = [
  '今天的事，今天完成。',
  '每一次完成，都是向更好的自己靠近。',
  '不急不躁，按自己的节奏来。',
  '小步前进，也能抵达远方。',
  '你已经很棒了，继续加油。',
]

const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)]

const chartColors = ['#9b8ec4', '#51cf66', '#ffa94d', '#ffd43b', '#ff6b6b', '#74c0fc', '#e599f7']

// Flat computed values — avoid accessing nested props of computed objects
const doneCount = computed(() => {
  const list = todo.todos || []
  return list.filter(t => t.status === 'done').length
})
const pendingCount = computed(() => {
  const list = todo.todos || []
  return list.filter(t => t.status === 'pending').length
})
const totalCount = computed(() => (todo.todos || []).length)
const dueTodayCount = computed(() => {
  const list = todo.todos || []
  return list.filter(t => t.status === 'pending' && todo.getDueStatus(t) === 'due_today').length
})
const overdueCount = computed(() => {
  const list = todo.todos || []
  return list.filter(t => t.status === 'pending' && todo.getDueStatus(t) === 'overdue').length
})
const rateVal = computed(() => {
  const total = totalCount.value
  return total ? Math.round(doneCount.value / total * 100) : 0
})

const donutData = computed(() => ({
  labels: ['已完成', '未完成'],
  datasets: [{
    data: [doneCount.value || 1, pendingCount.value || 0],
    backgroundColor: ['#9b8ec4', '#e8e6f0'],
    borderWidth: 0,
    cutout: '70%',
  }],
}))

const donutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { enabled: true },
  },
}

const completionDesc = computed(() => `已解决 ${doneCount.value} 个，共 ${totalCount.value} 项`)

const overviewCells = [
  { label: '已完成', value: doneCount, color: '#51cf66' },
  { label: '待完成', value: pendingCount, color: '#9b8ec4' },
  { label: '即将到期', value: dueTodayCount, color: '#ffa94d' },
  { label: '已逾期', value: overdueCount, color: '#ff6b6b' },
]
</script>

<template>
  <div class="todo-stats-screen">
    <!-- 顶部 -->
    <div class="stats-header">
      <h2 class="stats-title">数据统计</h2>
      <div class="time-range">
        <button
          v-for="r in [{ key: 'week', label: '本周' }, { key: 'month', label: '本月' }, { key: 'all', label: '全部' }]"
          :key="r.key"
          type="button"
          :class="['range-btn', { active: timeRange === r.key }]"
          @click="timeRange = r.key"
        >{{ r.label }}</button>
      </div>
    </div>

    <div class="stats-content">
      <!-- 概览 -->
      <div class="overview-card">
        <div class="section-label">概览</div>
        <div class="overview-grid">
          <div v-for="cell in overviewCells" :key="cell.label" class="ov-cell">
            <span class="ov-num" :style="{ color: cell.color }">{{ cell.value }}</span>
            <span class="ov-label">{{ cell.label }}</span>
          </div>
        </div>
      </div>

      <!-- 完成率 -->
      <div class="chart-card">
        <div class="section-label">完成率</div>
        <div class="donut-area">
          <div class="donut-wrap">
            <Doughnut :data="donutData" :options="donutOptions" />
          </div>
          <div class="donut-center">{{ rateVal }}%</div>
        </div>
        <p class="chart-desc">{{ completionDesc }}</p>
      </div>

      <!-- 分类占比 -->
      <div class="chart-card">
        <div class="section-label">分类占比</div>
        <div class="category-chart-area">
          <div class="pie-legend">
            <div
              v-for="(cat, i) in todo.CATEGORY_ORDER"
              :key="cat"
              class="legend-item"
              v-show="((todo.statsByCategory && todo.statsByCategory[cat]) || 0) > 0"
            >
              <span class="legend-dot" :style="{ background: chartColors[i % chartColors.length] }" />
              <span class="legend-label">{{ todo.CATEGORY_META[cat].label }}</span>
              <span class="legend-value">{{ (todo.statsByCategory && todo.statsByCategory[cat]) || 0 }} 项</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部语录 -->
      <div class="quote-card">
        <p class="quote-text">{{ quote }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.todo-stats-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 顶部 */
.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  padding-top: max(16px, var(--safe-area-inset-top, 16px));
}

.stats-title {
  font-size: 20px;
  font-weight: 700;
  color: #2d2d3a;
  margin: 0;
}

.time-range {
  display: flex;
  gap: 0;
  background: #fff;
  border-radius: 20px;
  padding: 3px;
  border: 1.5px solid #e8e4f5;
}

.range-btn {
  padding: 5px 14px;
  border: none;
  border-radius: 16px;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: #8888a0;
  cursor: pointer;
  transition: all 0.2s;
}

.range-btn.active {
  background: #9b8ec4;
  color: #fff;
}

.stats-content {
  flex: 1;
  overflow-y: auto;
  padding: 4px 16px 32px;
}

/* 卡片通用 */
.overview-card, .chart-card {
  background: #fff;
  border-radius: 16px;
  padding: 18px;
  margin-bottom: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.section-label {
  font-size: 14px;
  font-weight: 600;
  color: #2d2d3a;
  margin-bottom: 12px;
}

/* 概览 2x2 */
.overview-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.ov-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 14px 8px;
  background: #f5f2ff;
  border-radius: 12px;
  text-align: center;
}

.ov-num {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}

.ov-label {
  font-size: 12px;
  color: #8888a0;
  margin-top: 2px;
}

/* 完成率 */
.donut-area {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 8px;
}

.donut-wrap {
  width: 140px;
  height: 140px;
}

.donut-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 26px;
  font-weight: 700;
  color: #9b8ec4;
  pointer-events: none;
}

.chart-desc {
  text-align: center;
  font-size: 12px;
  color: #8888a0;
  margin: 0;
}

/* 分类占比 */
.category-chart-area {
  display: flex;
  justify-content: center;
}

.pie-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-label {
  color: #2d2d3a;
}

.legend-value {
  color: #8888a0;
  font-size: 12px;
}

/* 语录 */
.quote-card {
  background: linear-gradient(135deg, #f5f2ff, #fce4ec);
  border-radius: 16px;
  padding: 20px;
  text-align: center;
}

.quote-text {
  font-size: 14px;
  color: #6b5b8a;
  margin: 0;
  line-height: 1.6;
  font-style: italic;
}

  .platform-android.android-portrait .range-btn {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 5px 14px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 16px !important;
    white-space: nowrap !important;
  }

</style>
