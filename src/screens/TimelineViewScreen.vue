<script setup>
/**
 * 今天的时间线视图
 * 按小时展示所有角色的日程执行、事件、互动、梦境等
 */
import './TimelineViewScreen.css'
import { computed, onMounted, ref } from 'vue'
import { loadWorldBooks, getActiveWorldBookId } from '../worldbook/worldBookStore.js'
import { getWorldMemory } from '../memory/worldMemoryStore.js'
import { aggregateTodayTimeline } from '../services/timelineAggregator.js'
import { useCharacterSchedule } from '../../plugins/feature-character-schedule/src/composables/useCharacterSchedule.js'

const emit = defineEmits(['back'])

const loading = ref(false)
const worldBook = ref(null)
const worldMemory = ref(null)
const timeline = ref([])

const todayLabel = computed(() => {
  const now = new Date()
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
})

const currentHour = computed(() => new Date().getHours())

onMounted(async () => {
  await loadData()
})

async function loadData() {
  loading.value = true
  try {
    const books = await loadWorldBooks()
    const activeId = await getActiveWorldBookId()
    worldBook.value = books.find(b => b.id === activeId) || books[0] || null

    if (worldBook.value) {
      worldMemory.value = await getWorldMemory(worldBook.value.id)

      const scheduleAPI = useCharacterSchedule()
      timeline.value = await aggregateTodayTimeline({
        worldBook: worldBook.value,
        worldMemory: worldMemory.value,
        getScheduleForWorldBook: () => scheduleAPI.getScheduleForWorldBook(worldBook.value.id),
      })
    }
  } catch (e) {
    console.warn('[Timeline] load data failed:', e.message)
  } finally {
    loading.value = false
  }
}

function padHour(h) {
  return h.toString().padStart(2, '0')
}

const ENTRY_EMOJI_MAP = {
  schedule: '📅',
  event: '📜',
  npc_interaction: '💬',
  bond_event: '💫',
  character_dream: '🌙',
  birthday: '🎂',
  daily_activity: '☀️',
  relationship_shift: '❤️',
}

function getEntryEmoji(type) {
  return ENTRY_EMOJI_MAP[type] || '📌'
}
</script>

<template>
  <div class="timeline-screen">
    <div class="timeline-header">
      <button class="timeline-back-btn" @click="$emit('back')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <span class="timeline-title">
        <span class="timeline-title-dot"></span>
        {{ todayLabel }}
      </span>
      <button class="timeline-refresh-btn" @click="loadData" :disabled="loading">
        {{ loading ? '加载中...' : '↻ 刷新' }}
      </button>
    </div>

    <div class="timeline-content">
      <div v-if="timeline.length > 0" class="timeline-list">
        <div
          v-for="slot in timeline"
          :key="slot.hour"
          class="timeline-hour-block"
        >
          <div class="timeline-hour-label">
            <div class="timeline-hour-dot" :class="{ past: slot.hour < currentHour, current: slot.hour === currentHour }"></div>
            <span class="timeline-hour-text">{{ padHour(slot.hour) }}:00</span>
          </div>
          <div class="timeline-hour-entries">
            <div
              v-for="(entry, idx) in slot.entries"
              :key="idx"
              class="timeline-entry"
              :class="entry.type"
            >
              <span class="timeline-entry-emoji">{{ getEntryEmoji(entry.type) }}</span>
              <div class="timeline-entry-body">
                <div class="timeline-entry-text">
                  <template v-if="entry.type === 'schedule'">
                    <strong>{{ entry.charName }}</strong> {{ entry.activity }}
                    <span v-if="entry.location" class="timeline-entry-location">@ {{ entry.location }}</span>
                    <span v-if="entry.mood" class="timeline-entry-mood">{{ entry.mood }}</span>
                  </template>
                  <template v-else>
                    {{ entry.summary }}
                  </template>
                </div>
                <div class="timeline-entry-meta">
                  <span v-if="entry.participants" class="timeline-entry-participants">
                    {{ entry.participants }}
                  </span>
                  <span v-if="entry.time" class="timeline-entry-time">{{ entry.time }}</span>
                  <span v-if="entry.isPlanned" class="timeline-entry-planned">计划中</span>
                  <span v-if="entry.impact >= 70" class="timeline-entry-impact">高影响 {{ entry.impact }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="timeline-empty">
        <p>今天还没有发生任何事件</p>
        <p class="timeline-empty-hint">
          生成一段故事，或等待角色们自动互动。
        </p>
      </div>
    </div>
  </div>
</template>
