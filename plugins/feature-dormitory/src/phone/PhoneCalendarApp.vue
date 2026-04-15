<script setup>
/**
 * PhoneCalendarApp.vue - 日历应用
 * 显示当月日历，高亮今日，可翻页。
 */
import { computed, ref } from 'vue'

const emit = defineEmits(['back'])

const now = new Date()
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth())

const todayDay = now.getDate()
const todayMonth = now.getMonth()
const todayYear = now.getFullYear()

const weekdays = ['日', '一', '二', '三', '四', '五', '六']

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
    days.push({
      day: d,
      otherMonth: false,
      isToday: d === todayDay && viewMonth.value === todayMonth && viewYear.value === todayYear,
    })
  }
  // 下月开头
  const remaining = 42 - days.length
  for (let d = 1; d <= remaining; d++) {
    days.push({ day: d, otherMonth: true })
  }
  return days
})

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
          :class="{ today: d.isToday, 'other-month': d.otherMonth }"
        >
          {{ d.day }}
        </div>
      </div>
    </div>
  </div>
</template>
