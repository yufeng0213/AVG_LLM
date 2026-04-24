<script setup>
/**
 * 世界演化日志浏览界面
 * 查看 LLM 生成的世界叙事总结和历史日志
 */
import './EvolutionLogScreen.css'
import { onMounted, ref } from 'vue'
import { loadWorldBooks, getActiveWorldBookId } from '../worldbook/worldBookStore.js'
import { getWorldMemory } from '../memory/worldMemoryStore.js'
import { generateEvolutionLog, loadEvolutionLogs } from '../services/worldEvolutionLog.js'

const emit = defineEmits(['back'])

const loading = ref(false)
const worldBook = ref(null)
const worldMemory = ref(null)
const latestLog = ref(null)
const historyLogs = ref([])

onMounted(async () => {
  await loadData()
})

async function loadData() {
  try {
    const books = await loadWorldBooks()
    const activeId = await getActiveWorldBookId()
    worldBook.value = books.find(b => b.id === activeId) || books[0] || null

    if (worldBook.value) {
      worldMemory.value = await getWorldMemory(worldBook.value.id)
    }

    // 加载历史日志
    const logs = await loadEvolutionLogs()
    if (logs.length > 0) {
      latestLog.value = logs[logs.length - 1]
      historyLogs.value = logs.slice(0, -1).reverse()
    }
  } catch (e) {
    console.warn('[EvolutionLog] load data failed:', e.message)
  }
}

async function generateLog() {
  if (loading.value || !worldBook.value) return
  loading.value = true
  try {
    const result = await generateEvolutionLog({
      worldBook: worldBook.value,
      worldMemory: worldMemory.value,
      periodDays: 30,
    })
    if (result.success) {
      latestLog.value = result.log
      // 刷新历史日志
      const logs = await loadEvolutionLogs()
      historyLogs.value = logs.slice(0, -1).reverse()
    } else {
      console.warn('[EvolutionLog] generation failed:', result.error)
    }
  } catch (e) {
    console.warn('[EvolutionLog] generation error:', e.message)
  } finally {
    loading.value = false
  }
}

function formatPeriod(start, end) {
  if (!start || !end) return ''
  return `${start.slice(0, 10)} ~ ${end.slice(0, 10)}`
}
</script>

<template>
  <div class="evolution-log-screen">
    <div class="evolution-header">
      <button class="evolution-back-btn" @click="$emit('back')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <span class="evolution-title">
        <svg class="evolution-title-scroll" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
          <path d="M14 2v5h5" fill="none" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        世界演化编年史
      </span>
      <button class="evolution-gen-btn" @click="generateLog" :disabled="loading">
        {{ loading ? '生成中...' : '📜 生成' }}
      </button>
    </div>

    <div class="evolution-content">
      <!-- 最新生成的日志 -->
      <div v-if="latestLog" class="evolution-latest">
        <div class="evolution-latest-card">
          <div class="evolution-card-header">
            <span class="evolution-period">{{ formatPeriod(latestLog.periodStart, latestLog.periodEnd) }}</span>
            <span class="evolution-event-count">{{ latestLog.eventCount }} 事件</span>
          </div>
          <div class="evolution-card-body">
            {{ latestLog.text }}
          </div>
          <div v-if="latestLog.stats" class="evolution-card-stats">
            <span v-for="(count, type) in latestLog.stats.byType" :key="type" class="evolution-stat-tag">
              {{ type }}: {{ count }}
            </span>
          </div>
        </div>
      </div>

      <!-- 历史日志 -->
      <div v-if="historyLogs.length > 0" class="evolution-history">
        <h3 class="evolution-history-title">历史日志</h3>
        <div
          v-for="(log, idx) in historyLogs"
          :key="idx"
          class="evolution-card"
        >
          <div class="evolution-card-header">
            <span class="evolution-period">{{ formatPeriod(log.periodStart, log.periodEnd) }}</span>
            <span class="evolution-event-count">{{ log.eventCount }} 事件</span>
          </div>
          <div class="evolution-card-body collapsed" @click="log._expanded = !log._expanded">
            {{ log._expanded ? log.text : log.text.slice(0, 120) + (log.text.length > 120 ? '...' : '') }}
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!latestLog && historyLogs.length === 0" class="evolution-empty">
        <p>📜</p>
        <p>暂无演化日志</p>
        <p class="evolution-empty-hint">点击「生成」为这个世界生成一段演化日志</p>
      </div>
    </div>
  </div>
</template>
