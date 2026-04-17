<script setup>
/**
 * CheckInScreen.vue - 日历签到
 */

import { ref, computed, onMounted } from 'vue'
import { useCheckInDaily } from './composables/useCheckInDaily.js'
import { MONTHLY_REWARDS } from './checkInItems.js'

const emit = defineEmits(['back', 'checkin-daily-result'])
const props = defineProps({
  coins: { type: Number, default: 0 },
})

const {
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
} = useCheckInDaily()

// ====== 状态 ======
const worldBookId = ref('default')
const isAnimating = ref(false)
const rewardResult = ref(null)
const isClaimingBonus = ref(false)

const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const weekDays = ['日', '一', '二', '三', '四', '五', '六']

const currentMonthLabel = computed(() => `${currentYear.value}年${monthNames[currentMonth.value]}`)

const bonusProgress = computed(() => {
  const { rate } = currentMonthStats.value
  for (const mr of MONTHLY_REWARDS) {
    if (rate >= mr.threshold) return { label: mr.label, threshold: mr.threshold, rate }
  }
  return { label: '未达标', threshold: 0.5, rate }
})

// ====== 签到 ======
function handleSignIn() {
  if (isAnimating.value || todayChecked.value) return
  isAnimating.value = true

  const reward = doSignIn()
  if (!reward) {
    isAnimating.value = false
    return
  }

  rewardResult.value = reward
  emit('checkin-daily-result', { cost: 0, earned: reward.baseCoins })

  setTimeout(() => {
    isAnimating.value = false
    const itemNames = reward.items.length > 0
      ? reward.items.map(i => `${i.icon}${i.name}×${i.quantity}`).join(' + ')
      : ''
    const msg = `+${reward.baseCoins}金币${reward.label ? ' (' + reward.label + ')' : ''}${itemNames ? ' + ' + itemNames : ''}`
    alert(msg)
    save(worldBookId.value)
    rewardResult.value = null
  }, 1200)
}

// ====== 领取月度奖励 ======
function handleClaimBonus() {
  if (isClaimingBonus.value) return
  isClaimingBonus.value = true

  const result = claimMonthBonus(worldBookId.value)
  if (result) {
    emit('checkin-daily-result', { cost: 0, earned: result.coins })
    const itemNames = result.items.length > 0
      ? result.items.map(i => `${i.icon}${i.name}×${i.quantity}`).join(' + ')
      : ''
    const msg = `月度奖励: +${result.coins}金币${itemNames ? ' + ' + itemNames : ''}`
    alert(msg)
  } else {
    alert('暂无可领取的月度奖励')
  }
  isClaimingBonus.value = false
}

// ====== 选择日期 ======
function handleSelectDay(day) {
  if (day === null) return
  selectDay(day)
}

// ====== 初始化 ======
onMounted(() => {
  load(worldBookId.value)
})
</script>

<template>
  <div class="checkin-screen">
    <!-- Header -->
    <header class="checkin-header">
      <button type="button" class="checkin-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="checkin-title">📅 日历签到</h2>
      <div class="checkin-coin-box">
        <span class="checkin-coin-icon">💰</span>
        <span class="checkin-coin-value">{{ coins }}</span>
      </div>
    </header>

    <!-- 月份导航 -->
    <div class="month-nav">
      <button type="button" class="month-btn" @click="prevMonth">◀</button>
      <span class="month-label">{{ currentMonthLabel }}</span>
      <button type="button" class="month-btn" @click="nextMonth">▶</button>
    </div>

    <!-- 日历网格 -->
    <div class="calendar-grid">
      <!-- 星期头 -->
      <div v-for="wd in weekDays" :key="wd" class="cal-weekday">{{ wd }}</div>
      <!-- 日期格子 -->
      <div
        v-for="(day, idx) in calendarDays"
        :key="idx"
        class="cal-day"
        :class="{
          'cal-padding': day.isPadding,
          'cal-today': day.isToday,
          'cal-checked': day.checked,
          'cal-future': day.isFuture,
          'cal-selected': selectedDateInfo && selectedDateInfo.dateStr === day.dateStr,
        }"
        @click="handleSelectDay(day.day)"
      >
        <template v-if="!day.isPadding">
          <span class="cal-day-num">{{ day.day }}</span>
          <span v-if="day.checked" class="cal-check">✓</span>
          <span v-else-if="day.isToday" class="cal-today-dot">●</span>
        </template>
      </div>
    </div>

    <!-- 统计栏 -->
    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-label">📊 签到率</span>
        <span class="stat-value">{{ Math.round(currentMonthStats.rate * 100) }}% ({{ currentMonthStats.checkedDays }}/{{ currentMonthStats.totalDays }})</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">🎁 月度奖励</span>
        <span class="stat-value">{{ bonusProgress.label }}</span>
      </div>
      <!-- 进度条 -->
      <div class="bonus-progress">
        <div
          class="bonus-progress-fill"
          :style="{ width: Math.min(100, (bonusProgress.rate / bonusProgress.threshold) * 100) + '%' }"
        ></div>
        <span class="bonus-progress-label">{{ Math.round(bonusProgress.rate * 100) }}% / {{ Math.round(bonusProgress.threshold * 100) }}%</span>
      </div>
      <!-- 领取按钮 -->
      <button
        v-if="monthBonusInfo.eligible && !monthBonusInfo.claimed"
        type="button"
        class="claim-bonus-btn"
        @click="handleClaimBonus"
      >
        🎁 领取月度奖励
      </button>
      <span v-else-if="monthBonusInfo.claimed" class="claim-claimed">✓ 已领取</span>
    </div>

    <!-- 日期详情 + 签到 -->
    <div class="day-detail">
      <template v-if="selectedDateInfo">
        <div class="detail-label">{{ selectedDateInfo.label }}</div>
        <div class="detail-status">
          <template v-if="selectedDateInfo.checked">
            <span class="detail-checked">✓ 已签到</span>
            <template v-if="selectedDateInfo.record">
              <div class="detail-rewards">
                <span class="detail-coin">+{{ selectedDateInfo.record.baseCoins }}💰</span>
                <template v-for="(item, i) in selectedDateInfo.record.items" :key="i">
                  <span class="detail-item">{{ item.icon }}{{ item.name }}×{{ item.quantity }}</span>
                </template>
              </div>
            </template>
          </template>
          <template v-else-if="selectedDateInfo.isToday">
            <span class="detail-today">今天 - 可以签到！</span>
          </template>
          <template v-else>
            <span class="detail-past">未签到</span>
          </template>
        </div>
      </template>
      <template v-else>
        <div class="detail-label">选择一个日期查看详情</div>
      </template>

      <!-- 签到按钮 -->
      <button
        v-if="!todayChecked && selectedDateInfo?.isToday"
        type="button"
        class="sign-in-btn"
        :class="{ 'is-animating': isAnimating }"
        @click="handleSignIn"
      >
        <template v-if="!isAnimating">
          📝 点击签到
        </template>
        <template v-else>
          🎁 签到中...
        </template>
      </button>
      <button
        v-else-if="todayChecked"
        type="button"
        class="sign-in-btn sign-in-done"
        disabled
      >
        ✓ 今日已签到
      </button>
    </div>

    <!-- 签到动画弹窗 -->
    <Transition name="reward-fade">
      <div v-if="rewardResult && isAnimating" class="reward-overlay">
        <div class="reward-card">
          <div class="reward-icon">🎉</div>
          <div class="reward-coin">+{{ rewardResult.baseCoins }} 💰</div>
          <div v-if="rewardResult.label" class="reward-label">{{ rewardResult.label }}</div>
          <div v-if="rewardResult.items.length > 0" class="reward-items">
            <div v-for="(item, i) in rewardResult.items" :key="i" class="reward-item">
              <span class="reward-item-icon">{{ item.icon }}</span>
              <span class="reward-item-name">{{ item.name }} ×{{ item.quantity }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.checkin-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--checkin-bg, #0a1628);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.checkin-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: var(--checkin-header-bg, rgba(0, 0, 0, 0.4));
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--checkin-gold-border, rgba(255, 215, 0, 0.1));
  gap: 10px;
}

.checkin-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--checkin-text-secondary, rgba(255, 255, 255, 0.7));
  width: 40px;
  height: 40px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.checkin-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: var(--checkin-text-primary, #fff); }

.checkin-title {
  flex: 1;
  text-align: center;
  margin: 0;
  color: var(--checkin-gold, #ffd700);
  font-size: 17px;
  font-weight: 600;
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
}

.checkin-coin-box {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--checkin-gold-dim, rgba(255, 215, 0, 0.1));
  border: 1px solid var(--checkin-gold-border, rgba(255, 215, 0, 0.2));
  border-radius: 10px;
  padding: 6px 12px;
}
.checkin-coin-value { color: var(--checkin-gold, #ffd700); font-size: 15px; font-weight: 700; min-width: 30px; text-align: right; }

/* Month Nav */
.month-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  gap: 16px;
  background: var(--checkin-header-bg, rgba(0, 0, 0, 0.2));
}

.month-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--checkin-card-bg, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--checkin-border, rgba(255, 255, 255, 0.1));
  color: var(--checkin-text-secondary, rgba(255, 255, 255, 0.7));
  width: 36px;
  height: 36px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;
}
.month-btn:hover { background: rgba(255, 255, 255, 0.1); color: var(--checkin-text-primary, #fff); }

.month-label {
  color: var(--checkin-text-primary, #fff);
  font-size: 16px;
  font-weight: 700;
  min-width: 120px;
  text-align: center;
}

/* Calendar Grid */
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
  padding: 8px 12px;
  background: var(--checkin-header-bg, rgba(0, 0, 0, 0.15));
}

.cal-weekday {
  text-align: center;
  font-size: 11px;
  color: var(--checkin-text-secondary, rgba(255, 255, 255, 0.4));
  font-weight: 600;
  padding: 4px 0;
}

.cal-day {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--checkin-card-bg, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--checkin-border, rgba(255, 255, 255, 0.06));
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  gap: 1px;
}
.cal-day:not(.cal-padding):not(.cal-future):hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--checkin-gold-border, rgba(255, 215, 0, 0.3));
}

.cal-padding {
  background: transparent;
  border-color: transparent;
  cursor: default;
}

.cal-today {
  border-color: var(--checkin-gold, #ffd700) !important;
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
}

.cal-checked {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.3);
}

.cal-future {
  opacity: 0.3;
  cursor: default;
}

.cal-selected {
  border-color: var(--checkin-blue, #60a5fa) !important;
  background: rgba(96, 165, 250, 0.15);
}

.cal-day-num {
  font-size: 13px;
  color: var(--checkin-text-primary, rgba(255, 255, 255, 0.7));
  font-weight: 600;
}

.cal-check {
  font-size: 12px;
  color: var(--checkin-green, #22c55e);
  font-weight: 700;
}

.cal-today-dot {
  font-size: 10px;
  color: var(--checkin-gold, #ffd700);
  animation: pulse-glow 1s ease infinite;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* Stats Bar */
.stats-bar {
  padding: 10px 16px;
  background: var(--checkin-header-bg, rgba(0, 0, 0, 0.2));
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  font-size: 12px;
  color: var(--checkin-text-secondary, rgba(255, 255, 255, 0.5));
}

.stat-value {
  font-size: 12px;
  color: var(--checkin-gold, #ffd700);
  font-weight: 600;
}

.bonus-progress {
  position: relative;
  height: 16px;
  background: var(--checkin-card-bg, rgba(255, 255, 255, 0.05));
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--checkin-border, rgba(255, 255, 255, 0.1));
}

.bonus-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--checkin-gold, #ffd700), var(--checkin-orange, #ff8c00));
  border-radius: 8px;
  transition: width 0.5s ease;
}

.bonus-progress-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 9px;
  color: var(--checkin-text-primary, #fff);
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.claim-bonus-btn {
  align-self: center;
  background: linear-gradient(135deg, var(--checkin-gold, #ffd700), var(--checkin-orange, #ff8c00));
  border: none;
  color: var(--checkin-bg, #1a0a2e);
  font-size: 13px;
  font-weight: 700;
  padding: 6px 16px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.claim-bonus-btn:hover { transform: scale(1.05); box-shadow: 0 0 15px rgba(255, 215, 0, 0.4); }

.claim-claimed {
  align-self: center;
  font-size: 12px;
  color: var(--checkin-green, #22c55e);
  font-weight: 600;
}

/* Day Detail */
.day-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  gap: 12px;
}

.detail-label {
  font-size: 15px;
  color: var(--checkin-text-secondary, rgba(255, 255, 255, 0.6));
  font-weight: 600;
}

.detail-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.detail-checked {
  font-size: 14px;
  color: var(--checkin-green, #22c55e);
  font-weight: 700;
}

.detail-today {
  font-size: 14px;
  color: var(--checkin-gold, #ffd700);
  font-weight: 600;
}

.detail-past {
  font-size: 13px;
  color: var(--checkin-text-secondary, rgba(255, 255, 255, 0.3));
}

.detail-rewards {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-top: 4px;
}

.detail-coin {
  font-size: 13px;
  color: var(--checkin-gold, #ffd700);
  font-weight: 700;
}

.detail-item {
  font-size: 12px;
  color: var(--checkin-text-primary, rgba(255, 255, 255, 0.7));
}

/* Sign In Button */
.sign-in-btn {
  margin-top: 8px;
  background: linear-gradient(135deg, var(--checkin-gold, #ffd700), var(--checkin-orange, #ff8c00));
  border: none;
  color: var(--checkin-bg, #1a0a2e);
  font-size: 18px;
  font-weight: 800;
  padding: 12px 40px;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);
}
.sign-in-btn:hover:not(:disabled) { transform: scale(1.05); box-shadow: 0 6px 25px rgba(255, 215, 0, 0.5); }
.sign-in-btn:active:not(:disabled) { transform: scale(0.95); }
.sign-in-btn:disabled { opacity: 0.5; cursor: default; }

.sign-in-btn.is-animating {
  animation: card-bounce 0.6s ease;
}

@keyframes card-bounce {
  0% { transform: scale(1); }
  30% { transform: scale(1.1) rotate(3deg); }
  60% { transform: scale(0.95) rotate(-2deg); }
  100% { transform: scale(1) rotate(0); }
}

.sign-in-done {
  background: linear-gradient(135deg, var(--checkin-green, #22c55e), #16a34a) !important;
  color: var(--checkin-text-primary, #fff) !important;
  box-shadow: 0 4px 15px rgba(34, 197, 94, 0.3) !important;
}

/* Reward Overlay */
.reward-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.reward-card {
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  border: 2px solid var(--checkin-gold-border, rgba(255, 215, 0, 0.3));
  border-radius: 20px;
  padding: 30px 36px;
  text-align: center;
  box-shadow: 0 0 60px rgba(255, 215, 0, 0.3);
  animation: reward-pop 0.4s ease;
}

@keyframes reward-pop {
  0% { transform: scale(0.5); opacity: 0; }
  70% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.reward-icon {
  font-size: 56px;
  margin-bottom: 12px;
}

.reward-coin {
  font-size: 36px;
  font-weight: 900;
  color: var(--checkin-gold, #ffd700);
  text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
  margin-bottom: 8px;
}

.reward-label {
  font-size: 14px;
  color: var(--checkin-text-secondary, rgba(255, 255, 255, 0.6));
  margin-bottom: 12px;
}

.reward-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.reward-item {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 6px 10px;
}

.reward-item-icon {
  font-size: 22px;
}

.reward-item-name {
  font-size: 13px;
  color: var(--checkin-text-primary, #fff);
  font-weight: 600;
}

/* Transitions */
.reward-fade-enter-active,
.reward-fade-leave-active {
  transition: all 0.4s ease;
}
.reward-fade-enter-from,
.reward-fade-leave-to {
  opacity: 0;
}

  .platform-android.android-portrait .checkin-back-btn,
  .platform-android.android-portrait .month-btn {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 6px 10px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
  }
</style>
