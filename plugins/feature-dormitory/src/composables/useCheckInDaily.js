/**
 * useCheckInDaily.js - 日历签到逻辑
 */
import { ref, computed } from 'vue'
import {
  CHECKIN_ITEMS,
  MONTHLY_REWARDS,
  generateDailyReward,
  calcMonthStats,
} from '../checkInItems.js'

const STORAGE_KEY = 'avg_llm_dormitory_checkin_daily_v1'

export function useCheckInDaily() {
  const records = ref({}) // { "YYYY-MM-DD": { checked, baseCoins, items: [], surpriseItems: [], checkedAt } }
  const monthStats = ref({}) // { "YYYY-MM": { checkedDays, monthBonusClaimed } }
  const selectedDate = ref(null) // { year, month, day }

  // 当前显示的年月
  const currentYear = ref(new Date().getFullYear())
  const currentMonth = ref(new Date().getMonth()) // 0-based

  const todayInfo = computed(() => {
    const now = new Date()
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      dateStr: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    }
  })

  const calendarDays = computed(() => {
    const year = currentYear.value
    const month = currentMonth.value
    const firstDay = new Date(year, month, 1).getDay() // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const days = []
    // 填充上月空白
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: null, isPadding: true })
    }
    // 填充本月日期
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const record = records.value[dateStr]
      const isToday = d === todayInfo.value.day && month === todayInfo.value.month && year === todayInfo.value.year
      const dateObj = new Date(year, month, d)
      days.push({
        day: d,
        dateStr,
        isToday,
        isPast: dateObj < new Date(todayInfo.value.year, todayInfo.value.month, todayInfo.value.day),
        isFuture: dateObj > new Date(todayInfo.value.year, todayInfo.value.month, todayInfo.value.day),
        checked: !!record?.checked,
        record,
        dayOfWeek: dateObj.getDay(),
      })
    }
    return days
  })

  const monthKey = computed(() => `${currentYear.value}-${String(currentMonth.value + 1).padStart(2, '0')}`)

  const currentMonthStats = computed(() => {
    const year = currentYear.value
    const month = currentMonth.value
    return calcMonthStats(records.value, year, month)
  })

  const monthBonusInfo = computed(() => {
    const key = monthKey.value
    const stats = monthStats.value[key]
    if (!stats) return { claimed: false, eligible: false, reward: null }
    const { rate } = currentMonthStats.value
    for (const mr of MONTHLY_REWARDS) {
      if (rate >= mr.threshold) {
        return {
          claimed: stats.monthBonusClaimed,
          eligible: true,
          reward: mr,
        }
      }
    }
    return { claimed: false, eligible: false, reward: null }
  })

  const todayChecked = computed(() => {
    return !!records.value[todayInfo.value.dateStr]?.checked
  })

  const selectedDateInfo = computed(() => {
    if (!selectedDate.value) return null
    const { year, month, day } = selectedDate.value
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const record = records.value[dateStr]
    const dayOfWeek = new Date(year, month, day).getDay()
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return {
      dateStr,
      label: `${month + 1}月${day}日 (${weekdays[dayOfWeek]})`,
      checked: !!record?.checked,
      record,
      isToday: day === todayInfo.value.day && month === todayInfo.value.month && year === todayInfo.value.year,
    }
  })

  function load(worldBookId) {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      const bookState = all[worldBookId]
      if (bookState) {
        records.value = bookState.records || {}
        monthStats.value = bookState.monthStats || {}
      }
    } catch (e) {
      console.warn('[useCheckInDaily] load failed:', e)
    }
  }

  function save(worldBookId) {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      all[worldBookId] = {
        records: records.value,
        monthStats: monthStats.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    } catch (e) {
      console.warn('[useCheckInDaily] save failed:', e)
    }
  }

  function doSignIn() {
    const today = todayInfo.value
    if (records.value[today.dateStr]?.checked) return null

    const reward = generateDailyReward()
    records.value[today.dateStr] = {
      checked: true,
      baseCoins: reward.baseCoins,
      items: reward.items,
      label: reward.label,
      isWeekend: reward.isWeekend,
      checkedAt: Date.now(),
    }

    // 更新月统计
    const key = monthKey.value
    if (!monthStats.value[key]) {
      monthStats.value[key] = { checkedDays: 0, monthBonusClaimed: false }
    }
    monthStats.value[key].checkedDays++

    save()

    return {
      baseCoins: reward.baseCoins,
      items: reward.items,
      label: reward.label,
      isWeekend: reward.isWeekend,
    }
  }

  function claimMonthBonus(worldBookId) {
    if (!monthBonusInfo.value.eligible || monthBonusInfo.value.claimed) return null

    const key = monthKey.value
    monthStats.value[key].monthBonusClaimed = true

    const rewards = monthBonusInfo.value.reward.rewards
    const result = { coins: 0, items: [] }
    for (const r of rewards) {
      if (r.type === 'coin') {
        result.coins += r.amount
      } else if (r.type === 'item') {
        result.items.push({
          ...CHECKIN_ITEMS[r.itemId],
          quantity: r.quantity,
        })
      }
    }

    save(worldBookId)
    return result
  }

  function prevMonth() {
    if (currentMonth.value === 0) {
      currentMonth.value = 11
      currentYear.value--
    } else {
      currentMonth.value--
    }
    selectedDate.value = null
  }

  function nextMonth() {
    if (currentMonth.value === 11) {
      currentMonth.value = 0
      currentYear.value++
    } else {
      currentMonth.value++
    }
    selectedDate.value = null
  }

  function selectDay(day) {
    selectedDate.value = {
      year: currentYear.value,
      month: currentMonth.value,
      day,
    }
  }

  function resetToToday() {
    currentYear.value = todayInfo.value.year
    currentMonth.value = todayInfo.value.month
    selectedDate.value = {
      year: todayInfo.value.year,
      month: todayInfo.value.month,
      day: todayInfo.value.day,
    }
  }

  return {
    records,
    monthStats,
    selectedDate,
    currentYear,
    currentMonth,
    todayInfo,
    calendarDays,
    currentMonthStats,
    monthBonusInfo,
    todayChecked,
    selectedDateInfo,
    load,
    save,
    doSignIn,
    claimMonthBonus,
    prevMonth,
    nextMonth,
    selectDay,
    resetToToday,
  }
}
