<script setup>
/**
 * CheckIn7Screen.vue - 七日连续签到
 */

import { ref, computed, onMounted } from 'vue'
import { useCheckIn7 } from './composables/useCheckIn7.js'
import { CHECKIN_ITEMS, LEVEL_7DAY } from './checkInItems.js'

const emit = defineEmits(['back', 'checkin7-result'])
const props = defineProps({
  coins: { type: Number, default: 0 },
})

const {
  currentLevel,
  poolName,
  progressDots,
  itemsList,
  load,
  save,
  checkTodayStatus,
  doSignIn,
} = useCheckIn7()

// ====== 状态 ======
const worldBookId = ref('')
const isAnimating = ref(false)
const rewardResult = ref(null) // 当前获得的奖励

const poolColors = {
  copper: { bg: '#8B6914', glow: 'rgba(139,105,20,0.4)', label: '铜池' },
  silver: { bg: '#8899AA', glow: 'rgba(136,153,170,0.4)', label: '银池' },
  gold: { bg: '#DAA520', glow: 'rgba(218,165,32,0.4)', label: '金池' },
}

const currentPool = computed(() => poolColors[poolName.value] || poolColors.copper)

// ====== 签到 ======
function handleSignIn() {
  if (isAnimating.value) return
  isAnimating.value = true

  const reward = doSignIn()
  if (!reward) {
    isAnimating.value = false
    return
  }

  rewardResult.value = reward

  // 通知父组件加金币
  emit('checkin7-result', { cost: 0, earned: reward.totalCoins })

  // 延迟显示结果
  setTimeout(() => {
    isAnimating.value = false
    const itemNames = reward.items.length > 0
      ? reward.items.map(i => `${i.icon}${i.name}×${i.quantity}`).join(' + ')
      : ''
    const msg = `+${reward.totalCoins}金币${itemNames ? ' + ' + itemNames : ''}`
    alert(msg)
    save(worldBookId.value)
  }, 800)
}

// ====== 初始化 ======
onMounted(() => {
  // 从父组件获取 worldBookId（通过 props.coins 的 source 推断）
  // 实际由 DormitoryScreen 传入
  worldBookId.value = 'default'
  checkTodayStatus()
})
</script>

<template>
  <div class="checkin7-screen">
    <!-- Header -->
    <header class="checkin7-header">
      <button type="button" class="checkin7-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="checkin7-title">📅 七日签到</h2>
      <div class="checkin7-coin-box">
        <span class="checkin7-coin-icon">💰</span>
        <span class="checkin7-coin-value">{{ coins }}</span>
      </div>
    </header>

    <!-- 连续签到状态 -->
    <div class="checkin7-streak-section">
      <div class="streak-header">
        <span class="streak-text">
          <template v-if="currentLevel">
            🔥 连续签到第 {{ progressDots.filter(d => d === 'done' || d === 'today-done').length }} 天
          </template>
          <template v-else>
            📝 今天开始签到吧！
          </template>
        </span>
        <span class="pool-badge" :style="{ background: currentPool.bg }">
          {{ currentPool.label }}
        </span>
      </div>

      <!-- 进度点 -->
      <div class="progress-dots">
        <div
          v-for="(dot, i) in progressDots"
          :key="i"
          class="progress-dot"
          :class="`dot-${dot}`"
        >
          <span class="dot-day">D{{ i + 1 }}</span>
          <span class="dot-reward">{{ LEVEL_7DAY[i]?.baseCoin }}💰</span>
          <div class="dot-indicator">
            <template v-if="dot === 'done'">✓</template>
            <template v-else-if="dot === 'today-done'">✓</template>
            <template v-else-if="dot === 'current'">→</template>
            <template v-else>○</template>
          </div>
        </div>
      </div>
    </div>

    <!-- 签到主卡片 -->
    <main class="checkin7-main">
      <div class="sign-card" :class="{ 'is-animating': isAnimating, 'is-checked': currentLevel && currentLevel.day <= progressDots.filter(d => d === 'done' || d === 'today-done').length }">
        <div v-if="!isAnimating" class="card-content">
          <template v-if="currentLevel && currentLevel.day <= progressDots.filter(d => d === 'done' || d === 'today-done').length">
            <div class="card-done-icon">✨</div>
            <div class="card-done-text">今日已签到！</div>
            <div class="card-done-sub">明天继续加油 🔥</div>
          </template>
          <template v-else>
            <div class="card-gift-icon">🎁</div>
            <div class="card-gift-text">点击签到</div>
            <div class="card-gift-sub">
              <template v-if="currentLevel">
                {{ currentLevel.baseCoin }}💰 + {{ currentPool.label }}抽奖
              </template>
            </div>
          </template>
        </div>
        <div v-else class="card-anim-content">
          <div class="anim-gift">🎁</div>
        </div>
      </div>

      <!-- 奖励结果弹窗 -->
      <Transition name="reward-fade">
        <div v-if="rewardResult && !isAnimating" class="reward-result">
          <div class="reward-box">
            <div class="reward-title">🎉 签到奖励</div>
            <div class="reward-coins">+{{ rewardResult.totalCoins }} 💰</div>
            <div v-if="rewardResult.items.length > 0" class="reward-items">
              <div v-for="(item, i) in rewardResult.items" :key="i" class="reward-item">
                <span class="reward-item-icon">{{ item.icon }}</span>
                <span class="reward-item-name">{{ item.name }} ×{{ item.quantity }}</span>
              </div>
            </div>
            <div v-if="rewardResult.level" class="reward-label">{{ rewardResult.level }}</div>
          </div>
        </div>
      </Transition>

      <!-- 道具背包 -->
      <div v-if="itemsList.length > 0" class="backpack-section">
        <div class="backpack-title">🎒 我的道具</div>
        <div class="backpack-grid">
          <div v-for="item in itemsList" :key="item.id" class="backpack-item">
            <span class="backpack-item-icon">{{ item.icon }}</span>
            <span class="backpack-item-count">×{{ item.quantity }}</span>
            <span class="backpack-item-name">{{ item.name }}</span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.checkin7-screen {
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
.checkin7-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: var(--checkin-header-bg, rgba(0, 0, 0, 0.4));
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--checkin-gold-border, rgba(255, 215, 0, 0.1));
  gap: 10px;
}

.checkin7-back-btn {
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
.checkin7-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: var(--checkin-text-primary, #fff); }

.checkin7-title {
  flex: 1;
  text-align: center;
  margin: 0;
  color: var(--checkin-gold, #ffd700);
  font-size: 17px;
  font-weight: 600;
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
}

.checkin7-coin-box {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--checkin-gold-dim, rgba(255, 215, 0, 0.1));
  border: 1px solid var(--checkin-gold-border, rgba(255, 215, 0, 0.2));
  border-radius: 10px;
  padding: 6px 12px;
}
.checkin7-coin-value { color: var(--checkin-gold, #ffd700); font-size: 15px; font-weight: 700; min-width: 30px; text-align: right; }

/* Streak Section */
.checkin7-streak-section {
  padding: 12px 16px;
  background: var(--checkin-header-bg, rgba(0, 0, 0, 0.2));
}

.streak-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.streak-text {
  color: var(--checkin-text-primary, #fff);
  font-size: 14px;
  font-weight: 600;
}

.pool-badge {
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  padding: 3px 8px;
  border-radius: 6px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.progress-dots {
  display: flex;
  justify-content: space-between;
  gap: 4px;
}

.progress-dot {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 2px;
  border-radius: 8px;
  background: var(--checkin-card-bg, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--checkin-border, rgba(255, 255, 255, 0.06));
  transition: all 0.3s;
}

.dot-day {
  font-size: 9px;
  color: var(--checkin-text-secondary, rgba(255, 255, 255, 0.4));
}

.dot-reward {
  font-size: 10px;
  color: var(--checkin-gold-dim, rgba(255, 215, 0, 0.6));
  font-weight: 600;
}

.dot-indicator {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  transition: all 0.3s;
}

.dot-done .dot-indicator,
.dot-today-done .dot-indicator {
  background: linear-gradient(135deg, var(--checkin-green, #22c55e), #16a34a);
  color: var(--checkin-text-primary, #fff);
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
}

.dot-current .dot-indicator {
  background: linear-gradient(135deg, var(--checkin-gold, #ffd700), var(--checkin-orange, #ff8c00));
  color: var(--checkin-text-primary, #fff);
  box-shadow: 0 0 12px rgba(255, 215, 0, 0.5);
  animation: pulse-glow 1s ease infinite;
}

.dot-pending .dot-indicator {
  background: var(--checkin-card-bg, rgba(255, 255, 255, 0.05));
  color: var(--checkin-text-secondary, rgba(255, 255, 255, 0.2));
  border: 1px solid var(--checkin-border, rgba(255, 255, 255, 0.1));
}

@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 8px rgba(255, 215, 0, 0.3); }
  50% { box-shadow: 0 0 16px rgba(255, 215, 0, 0.6); }
}

/* Main */
.checkin7-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  position: relative;
  overflow-y: auto;
}

.sign-card {
  width: min(85vw, 320px);
  aspect-ratio: 1;
  max-height: 320px;
  border-radius: 20px;
  background: var(--checkin-card-bg, rgba(255, 215, 0, 0.08));
  border: 2px solid var(--checkin-gold-border, rgba(255, 215, 0, 0.2));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
}

.sign-card:not(.is-checked):hover {
  border-color: var(--checkin-gold-border, rgba(255, 215, 0, 0.4));
  box-shadow: 0 0 30px rgba(255, 215, 0, 0.15);
  transform: scale(1.02);
}

.sign-card.is-checked {
  cursor: default;
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.08);
}

.sign-card.is-animating {
  animation: card-bounce 0.6s ease;
}

@keyframes card-bounce {
  0% { transform: scale(1); }
  30% { transform: scale(1.1) rotate(3deg); }
  60% { transform: scale(0.95) rotate(-2deg); }
  100% { transform: scale(1) rotate(0); }
}

.card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.card-gift-icon {
  font-size: 64px;
  animation: gift-bounce 2s ease infinite;
}

@keyframes gift-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.card-gift-text {
  font-size: 20px;
  font-weight: 700;
  color: var(--checkin-gold, #ffd700);
}

.card-gift-sub {
  font-size: 13px;
  color: var(--checkin-text-secondary, rgba(255, 255, 255, 0.5));
}

.card-done-icon {
  font-size: 56px;
}

.card-done-text {
  font-size: 18px;
  font-weight: 700;
  color: var(--checkin-green, #22c55e);
}

.card-done-sub {
  font-size: 13px;
  color: var(--checkin-text-secondary, rgba(255, 255, 255, 0.4));
}

.card-anim-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.anim-gift {
  font-size: 80px;
  animation: gift-spin 0.8s ease;
}

@keyframes gift-spin {
  0% { transform: scale(0.5) rotate(0deg); opacity: 0; }
  50% { transform: scale(1.3) rotate(180deg); opacity: 1; }
  100% { transform: scale(1) rotate(360deg); opacity: 1; }
}

/* Reward Result */
.reward-result {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 100;
  pointer-events: none;
}

.reward-box {
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  border: 2px solid var(--checkin-gold-border, rgba(255, 215, 0, 0.3));
  border-radius: 16px;
  padding: 20px 24px;
  text-align: center;
  box-shadow: 0 0 40px rgba(255, 215, 0, 0.2);
}

.reward-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--checkin-gold, #ffd700);
  margin-bottom: 8px;
}

.reward-coins {
  font-size: 32px;
  font-weight: 900;
  color: var(--checkin-gold, #ffd700);
  text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
  margin-bottom: 8px;
}

.reward-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-bottom: 8px;
}

.reward-item {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 4px 8px;
}

.reward-item-icon {
  font-size: 20px;
}

.reward-item-name {
  font-size: 12px;
  color: var(--checkin-text-primary, #fff);
  font-weight: 600;
}

.reward-label {
  font-size: 12px;
  color: var(--checkin-text-secondary, rgba(255, 255, 255, 0.5));
  margin-top: 4px;
}

/* Backpack */
.backpack-section {
  width: 100%;
  max-width: 400px;
  background: var(--checkin-card-bg, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--checkin-border, rgba(255, 255, 255, 0.06));
  border-radius: 12px;
  padding: 12px;
}

.backpack-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--checkin-text-secondary, rgba(255, 255, 255, 0.6));
  margin-bottom: 8px;
}

.backpack-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.backpack-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: var(--checkin-card-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--checkin-border, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
  padding: 8px 12px;
  min-width: 70px;
}

.backpack-item-icon {
  font-size: 24px;
}

.backpack-item-count {
  font-size: 10px;
  color: var(--checkin-gold, #ffd700);
  font-weight: 700;
}

.backpack-item-name {
  font-size: 9px;
  color: var(--checkin-text-secondary, rgba(255, 255, 255, 0.5));
  text-align: center;
  white-space: nowrap;
}

/* Transitions */
.reward-fade-enter-active,
.reward-fade-leave-active {
  transition: all 0.4s ease;
}
.reward-fade-enter-from,
.reward-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.8);
}
</style>
