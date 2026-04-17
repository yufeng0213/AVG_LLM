<script setup>
/**
 * PhoneCalendarApp.vue - 日历应用
 * 显示当月日历，高亮今日，可翻页，显示日程事件。
 */
import { computed, ref, onMounted } from 'vue'
import { loadCalendarEvents, updateCalendarEventStatus } from './composables/usePhoneData.js'
import { generateIcsContent } from './utils/generateIcsContent.js'
import { openCalendarImport } from './services/calendarBridge.js'

const emit = defineEmits(['back'])

const now = new Date()
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth())

const todayDay = now.getDate()
const todayMonth = now.getMonth()
const todayYear = now.getFullYear()

const weekdays = ['日', '一', '二', '三', '四', '五', '六']

// 日历事件
const calendarEvents = ref([])
const selectedDayEvents = ref([])
const showDayEvents = ref(false)
const importingEventId = ref(null)

const monthLabel = computed(() => `${viewYear.value}年${viewMonth.value + 1}月`)

const calendarDays = computed(() => {
  const days = []
  const firstDay = new Date(viewYear.value, viewMonth.value, 1).getDay()
  const daysInMonth = new Date(viewYear.value, viewMonth.value + 1, 0).getDate()
  const daysInPrevMonth = new Date(viewYear.value, viewMonth.value, 0).getDate()

  // 上月末尾
  for (let i = firstDay - 1; i >= 0; i--) {
    days.push({ day: daysInPrevMonth - i, otherMonth: true })
  }
  // 当月
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear.value}-${String(viewMonth.value + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const events = calendarEvents.value.filter(e => e.date === dateStr && e.status !== 'imported')
    days.push({
      day: d,
      otherMonth: false,
      isToday: d === todayDay && viewMonth.value === todayMonth && viewYear.value === todayYear,
      events,
      dateStr,
    })
  }
  // 下月开头
  const remaining = 42 - days.length
  for (let d = 1; d <= remaining; d++) {
    days.push({ day: d, otherMonth: true })
  }
  return days
})

async function loadEvents() {
  calendarEvents.value = await loadCalendarEvents()
}

function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11
    viewYear.value--
  } else {
    viewMonth.value--
  }
}

function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0
    viewYear.value++
  } else {
    viewMonth.value++
  }
}

function showEventsForDay(dayData) {
  if (dayData.otherMonth || !dayData.events) return
  if (dayData.events.length === 0) return
  selectedDayEvents.value = dayData.events
  showDayEvents.value = true
}

async function importEvent(event) {
  importingEventId.value = event.id
  try {
    const icsContent = generateIcsContent(event)
    await openCalendarImport(icsContent, `event_${event.id}.ics`)
    await updateCalendarEventStatus(event.id, 'imported')
    await loadEvents()
    // 刷新当前显示的事件列表
    selectedDayEvents.value = calendarEvents.value.filter(e =>
      e.date === event.date && e.status !== 'imported'
    )
  } catch (e) {
    console.error('[PhoneCalendarApp] 导入日历失败:', e)
  } finally {
    importingEventId.value = null
  }
}

async function dismissEvent(event) {
  await updateCalendarEventStatus(event.id, 'dismissed')
  await loadEvents()
  selectedDayEvents.value = calendarEvents.value.filter(e =>
    e.date === event.date && e.status !== 'imported'
  )
  if (selectedDayEvents.value.length === 0) {
    showDayEvents.value = false
  }
}

function closeDayEvents() {
  showDayEvents.value = false
  selectedDayEvents.value = []
}

onMounted(loadEvents)
</script>

<template>
  <div class="phone-app">
    <div class="phone-app-header">
      <button type="button" class="phone-app-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <h2 class="phone-app-title">日历</h2>
      <div class="phone-app-header-spacer" />
    </div>
    <div class="calendar-grid">
      <div class="calendar-month-nav">
        <button type="button" class="calendar-nav-btn" @click="prevMonth">&lt;</button>
        <span class="calendar-month-label">{{ monthLabel }}</span>
        <button type="button" class="calendar-nav-btn" @click="nextMonth">&gt;</button>
      </div>
      <div class="calendar-weekdays">
        <div v-for="wd in weekdays" :key="wd" class="calendar-weekday">{{ wd }}</div>
      </div>
      <div class="calendar-days">
        <div
          v-for="(d, idx) in calendarDays"
          :key="idx"
          class="calendar-day"
          :class="{
            today: d.isToday,
            'other-month': d.otherMonth,
            'has-events': d.events && d.events.length > 0,
          }"
          @click="showEventsForDay(d)"
        >
          <span class="calendar-day-num">{{ d.day }}</span>
          <div v-if="d.events && d.events.length > 0" class="calendar-event-dots">
            <span
              v-for="evt in d.events.slice(0, 3)"
              :key="evt.id"
              class="calendar-event-dot"
              :class="{ dismissed: evt.status === 'dismissed' }"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 日期事件弹窗 -->
    <div v-if="showDayEvents" class="day-events-overlay" @click.self="closeDayEvents">
      <div class="day-events-modal">
        <div class="day-events-header">
          <h3 class="day-events-title">{{ selectedDayEvents[0]?.date }}</h3>
          <button class="day-events-close" @click="closeDayEvents">&times;</button>
        </div>
        <div class="day-events-list">
          <div v-for="evt in selectedDayEvents" :key="evt.id" class="day-event-item">
            <div class="day-event-info">
              <span class="day-event-time">{{ evt.time || '全天' }}</span>
              <span class="day-event-name">{{ evt.title }}</span>
              <span v-if="evt.contactName" class="day-event-source">来自 {{ evt.contactName }}</span>
            </div>
            <div class="day-event-actions">
              <button
                v-if="evt.status === 'pending'"
                class="day-event-btn import"
                :disabled="importingEventId === evt.id"
                @click="importEvent(evt)"
              >
                {{ importingEventId === evt.id ? '导入中...' : '导入' }}
              </button>
              <button
                v-if="evt.status === 'dismissed'"
                class="day-event-btn retry"
                @click="importEvent(evt)"
              >
                导入
              </button>
              <button
                v-if="evt.status === 'pending'"
                class="day-event-btn dismiss"
                @click="dismissEvent(evt)"
              >
                忽略
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.day-events-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.day-events-modal {
  width: 90%;
  max-width: 360px;
  background: var(--phone-bg, #1a1a2e);
  border-radius: 14px;
  overflow: hidden;
}

.day-events-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--phone-border, rgba(255, 255, 255, 0.08));
}

.day-events-title {
  margin: 0;
  font-size: 1rem;
  color: var(--phone-text-primary, #fff);
}

.day-events-close {
  background: none;
  border: none;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.5));
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0 4px;
}

.day-events-list {
  padding: 8px 0;
  max-height: 300px;
  overflow-y: auto;
}

.day-event-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  gap: 8px;
}

.day-event-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.day-event-time {
  font-size: 0.8rem;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.4));
}

.day-event-name {
  font-size: 0.95rem;
  color: var(--phone-text-primary, #fff);
}

.day-event-source {
  font-size: 0.8rem;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.35));
}

.day-event-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.day-event-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 8px;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
}

.day-event-btn.import {
  background: var(--phone-accent, #4a90d9);
  color: #fff;
}

.day-event-btn.import:disabled {
  opacity: 0.5;
}

.day-event-btn.retry {
  background: var(--phone-accent, #4a90d9);
  color: #fff;
}

.day-event-btn.dismiss {
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.08));
  color: var(--phone-text-primary, #fff);
}
</style>
