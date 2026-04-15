<script setup>
/**
 * SlotMachineScreen.vue - 老虎机游戏
 * 3x3 经典老虎机，消耗金币，带惩罚和加成机制
 */

import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import Toast from '../Toast.vue'
import GameSkinSelector from '../components/GameSkinSelector.vue'
import { useGameSkin } from '../composables/useGameSkin'

const emit = defineEmits(['back', 'spin-result', 'game-skin-buy'])
const props = defineProps({
  coins: {
    type: Number,
    default: 0,
  },
})

const GAME_KEY = 'slotMachine'

// ====== 皮肤系统 ======
const {
  skins: slotSkins,
  activeSkin: slotActiveSkin,
  ownedSkinList: slotOwnedSkins,
  selectSkin: slotSelectSkin,
  buySkin: slotBuySkin,
} = useGameSkin(GAME_KEY)

const showSkinSelector = ref(false)

function handleSlotSkinBuy({ skinId, price }) {
  const result = slotBuySkin(skinId, props.coins)
  if (result.success) {
    emit('game-skin-buy', { gameKey: GAME_KEY, cost: price })
    toastMessage.value = `🎨 主题已解锁：${slotSkins.find(s => s.id === skinId)?.name}`
    toastType.value = 'success'
    toastVisible.value = true
  } else if (result.notEnoughCoins) {
    toastMessage.value = '金币不足！'
    toastType.value = 'error'
    toastVisible.value = true
  }
}

// 皮肤主题样式
const slotThemeStyle = computed(() => {
  const theme = slotActiveSkin.value.theme || {}
  return {
    '--slot-body-bg': theme.bodyBg || 'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 30%, #1a1a2e 70%, #0f0f23 100%)',
    '--slot-border': theme.borderColor || 'rgba(255, 215, 0, 0.3)',
    '--slot-light': theme.lightColor || '#ffd700',
    '--slot-cell-bg': theme.cellBg || 'linear-gradient(180deg, rgba(40, 20, 60, 0.8), rgba(20, 10, 40, 0.9))',
    '--slot-cell-middle-bg': theme.cellMiddleBg || 'linear-gradient(180deg, rgba(60, 30, 90, 0.8), rgba(40, 20, 60, 0.9))',
    '--slot-button-bg': theme.buttonBg || 'linear-gradient(135deg, #ffd700, #ff8c00)',
    '--slot-glow': theme.glowColor || 'rgba(255, 215, 0, 0.15)',
  }
})

// ====== 常量 ======
const SPIN_COST = 30
const PENALTY_THRESHOLD = 3       // 连续未中奖次数后开始惩罚
const PENALTY_PER_EXTRA = 10     // 每次惩罚额外扣除
const JUDGMENT_THRESHOLD = 7     // 命运审判触发阈值
const MAX_PENALTY_PER_SPIN = 20  // 单次惩罚上限
const GUARANTEE_SPINS = 20       // 保底旋转次数
const HISTORY_MAX = 20           // 历史记录上限

const SYMBOLS = [
  { id: 'diamond', emoji: '💎', label: '钻石', weight: 2,  multiplier: 50 },
  { id: 'star',    emoji: '⭐', label: '星星', weight: 4,  multiplier: 20 },
  { id: 'clover',  emoji: '🍀', label: '四叶草', weight: 8, multiplier: 10 },
  { id: 'cherry',  emoji: '🍒', label: '樱桃', weight: 12, multiplier: 5 },
  { id: 'bell',    emoji: '🔔', label: '铃铛', weight: 24, multiplier: 3 },
  { id: 'lemon',   emoji: '🍋', label: '柠檬', weight: 50, multiplier: 2 },
]

const TOTAL_WEIGHT = SYMBOLS.reduce((sum, s) => sum + s.weight, 0)

// ====== 状态 ======
const isSpinning = ref(false)
const isAnimating = ref(false) // 控制动画状态
const reels = ref([
  ['🍋', '🍋', '🍋'],
  ['🍋', '🍋', '🍋'],
  ['🍋', '🍋', '🍋'],
])

// 旋转历史动画状态
const reelAnimating = ref([false, false, false])
const reelResults = ref([
  ['🍋', '🍋', '🍋'],
  ['🍋', '🍋', '🍋'],
  ['🍋', '🍋', '🍋'],
])

// 游戏统计
const consecutiveLosses = ref(0)
const totalSpins = ref(0)
const spinsSinceLastWin = ref(0)
const consecutiveWins = ref(0)
const lastPlayDate = ref('')
const todayFreeUsed = ref(false)
const freeSpinActive = ref(false)

// 历史记录
const showHistory = ref(false)
const history = ref([])
const totalCost = ref(0)
const totalEarned = ref(0)

// 结果反馈
const toastMessage = ref('')
const toastType = ref('success')
const toastVisible = ref(false)
const lastResultType = ref('') // 用于头奖闪烁

// ====== 计算属性 ======
const netProfit = computed(() => totalEarned.value - totalCost.value)

const canSpin = computed(() => {
  if (isSpinning.value) return false
  if (freeSpinActive.value) return true
  return props.coins >= SPIN_COST
})

const currentSpinCost = computed(() => {
  if (freeSpinActive.value) return 0
  let cost = SPIN_COST
  if (consecutiveLosses.value > PENALTY_THRESHOLD) {
    const extra = Math.min(
      (consecutiveLosses.value - PENALTY_THRESHOLD) * PENALTY_PER_EXTRA,
      MAX_PENALTY_PER_SPIN
    )
    cost += extra
  }
  return cost
})

const spinButtonLabel = computed(() => {
  if (isSpinning.value) return '旋转中...'
  if (freeSpinActive.value) return '🍀 免费旋转！'
  if (consecutiveLosses.value >= JUDGMENT_THRESHOLD) return '⚡ 命运审判！'
  return `🎰 旋转 (${currentSpinCost.value}💰)`
})

// ====== 核心逻辑 ======

function getWeightedSymbol() {
  let rand = Math.random() * TOTAL_WEIGHT
  for (const sym of SYMBOLS) {
    rand -= sym.weight
    if (rand <= 0) return sym
  }
  return SYMBOLS[SYMBOLS.length - 1]
}

function generateReelResult() {
  return [getWeightedSymbol(), getWeightedSymbol(), getWeightedSymbol()]
}

function generateGuaranteedResult() {
  // 保底：至少 x3 以上
  const guaranteedSymbols = [SYMBOLS[4], SYMBOLS[3], SYMBOLS[2], SYMBOLS[1], SYMBOLS[0]] // bell, cherry, clover, star, diamond
  const weights = [40, 30, 15, 10, 5] // probability weights for guarantee
  const total = weights.reduce((a, b) => a + b, 0)
  let rand = Math.random() * total
  let chosen = guaranteedSymbols[0]
  for (let i = 0; i < weights.length; i++) {
    rand -= weights[i]
    if (rand <= 0) { chosen = guaranteedSymbols[i]; break }
  }
  return [getWeightedSymbol(), { ...chosen }, getWeightedSymbol()]
}

function checkWin(results) {
  const middleRow = [results[0][1], results[1][1], results[2][1]] // 中行

  // 3 个相同
  if (middleRow[0].id === middleRow[1].id && middleRow[1].id === middleRow[2].id) {
    return {
      type: middleRow[0].id === 'diamond' ? 'jackpot'
        : middleRow[0].id === 'star' ? 'big'
        : middleRow[0].id === 'clover' ? 'lucky'
        : middleRow[0].id === 'cherry' ? 'win'
        : middleRow[0].id === 'bell' ? 'small' : 'consolation',
      multiplier: middleRow[0].multiplier,
      symbol: middleRow[0],
      line: 'middle',
    }
  }

  // 2 个相同（中线）
  if (middleRow[0].id === middleRow[1].id || middleRow[1].id === middleRow[2].id || middleRow[0].id === middleRow[2].id) {
    return { type: 'break_even', multiplier: 1, symbol: middleRow[1], line: 'middle' }
  }

  return null
}

async function handleSpin() {
  if (!canSpin.value) return

  isSpinning.value = true
  isAnimating.value = true
  toastVisible.value = false
  toastMessage.value = ''

  const cost = currentSpinCost.value

  // 消耗免费旋转
  if (freeSpinActive.value) {
    freeSpinActive.value = false
  }

  // 判断是否触发保底
  let finalResults
  if (spinsSinceLastWin.value >= GUARANTEE_SPINS - 1) {
    // 保底旋转
    const guaranteedCol = generateGuaranteedResult()
    finalResults = [
      generateReelResult(),
      guaranteedCol,
      generateReelResult(),
    ]
    // 确保中间行是保底结果
    finalResults[0][1] = guaranteedCol[1]
    finalResults[2][1] = guaranteedCol[1]
  } else if (consecutiveLosses.value >= JUDGMENT_THRESHOLD) {
    // 命运审判：50% 概率中大奖，50% 全随机
    if (Math.random() < 0.5) {
      // 大奖
      const winSymbol = Math.random() < 0.3 ? SYMBOLS[1] : SYMBOLS[2] // star or clover
      finalResults = [
        generateReelResult(),
        [getWeightedSymbol(), { ...winSymbol }, getWeightedSymbol()],
        generateReelResult(),
      ]
      finalResults[0][1] = winSymbol
      finalResults[2][1] = winSymbol
    } else {
      finalResults = [generateReelResult(), generateReelResult(), generateReelResult()]
    }
  } else {
    finalResults = [generateReelResult(), generateReelResult(), generateReelResult()]
  }

  // 开始旋转动画
  reelAnimating.value = [true, true, true]

  // 启动"假"旋转动画（随机切换符号）
  const spinIntervals = [
    setInterval(() => {
      reels.value[0] = [getWeightedSymbol().emoji, getWeightedSymbol().emoji, getWeightedSymbol().emoji]
    }, 80),
    setInterval(() => {
      reels.value[1] = [getWeightedSymbol().emoji, getWeightedSymbol().emoji, getWeightedSymbol().emoji]
    }, 80),
    setInterval(() => {
      reels.value[2] = [getWeightedSymbol().emoji, getWeightedSymbol().emoji, getWeightedSymbol().emoji]
    }, 80),
  ]

  // 逐列停止：第1列 600ms，第2列 1000ms，第3列 1400ms
  const stopDelays = [600, 1000, 1400]

  for (let i = 0; i < 3; i++) {
    await new Promise(resolve => {
      setTimeout(() => {
        clearInterval(spinIntervals[i])
        reels.value[i] = [finalResults[i][0].emoji, finalResults[i][1].emoji, finalResults[i][2].emoji]
        reelAnimating.value[i] = false
        resolve()
      }, stopDelays[i])
    })
  }

  await new Promise(r => setTimeout(r, 200)) // 等待动画结束

  // 结算
  const win = checkWin(finalResults)
  const isJudgment = consecutiveLosses.value >= JUDGMENT_THRESHOLD
  let winAmount = 0
  let resultType = 'loss'
  let resultMessage = ''

  if (win) {
    winAmount = SPIN_COST * win.multiplier

    // 命运审判中奖翻倍
    if (isJudgment) {
      winAmount *= 2
      resultMessage = `⚡ 命运审判通过！${win.symbol.emoji}${win.symbol.emoji}${win.symbol.emoji} 奖励翻倍！+${winAmount} 金币！`
      resultType = isJudgment ? 'judgment' : win.type
    } else {
      const messages = {
        jackpot: `🎆 头奖！！！${win.symbol.emoji}${win.symbol.emoji}${win.symbol.emoji} +${winAmount} 金币！`,
        big: `🌟 大奖！${win.symbol.emoji}${win.symbol.emoji}${win.symbol.emoji} +${winAmount} 金币！`,
        lucky: `🍀 幸运！${win.symbol.emoji}${win.symbol.emoji}${win.symbol.emoji} +${winAmount} 金币！`,
        win: `${win.symbol.emoji}${win.symbol.emoji}${win.symbol.emoji} +${winAmount} 金币！`,
        small: `${win.symbol.emoji}${win.symbol.emoji}${win.symbol.emoji} +${winAmount} 金币`,
        consolation: `${win.symbol.emoji}${win.symbol.emoji}${win.symbol.emoji} +${winAmount} 金币`,
        break_even: `保本，拿回 ${winAmount} 金币`,
      }
      resultMessage = messages[win.type] || `${win.symbol.emoji} +${winAmount} 金币`
      resultType = win.type
    }

    consecutiveLosses.value = 0
    spinsSinceLastWin.value = 0
    consecutiveWins.value++

    // 连续中奖检测
    if (consecutiveWins.value >= 2) {
      freeSpinActive.value = true
      resultMessage += ' | 🍀 幸运时刻！下次免费！'
    }
  } else {
    consecutiveLosses.value++
    spinsSinceLastWin.value++
    consecutiveWins.value = 0

    let penaltyExtra = 0
    if (consecutiveLosses.value > PENALTY_THRESHOLD) {
      penaltyExtra = Math.min(
        (consecutiveLosses.value - PENALTY_THRESHOLD) * PENALTY_PER_EXTRA,
        MAX_PENALTY_PER_EXTRA
      )
    }

    if (isJudgment) {
      // 命运审判失败：金币减半
      const halfLoss = Math.floor(cost / 2)
      resultMessage = `💀 命运审判失败...额外扣除金币`
      resultType = 'judgment_loss'
    } else if (penaltyExtra > 0) {
      resultMessage = `未中奖... 不甘心税 -${penaltyExtra} 金币`
    } else {
      resultMessage = '未中奖，再接再厉！'
    }
  }

  totalSpins.value++
  totalCost.value += cost
  totalEarned.value += winAmount

  // 记录历史
  const record = {
    spinNumber: totalSpins.value,
    cost,
    winAmount,
    result: resultType,
    message: resultMessage,
    timestamp: Date.now(),
    reels: reels.value.map(col => [...col]),
  }
  history.value.unshift(record)
  if (history.value.length > HISTORY_MAX) history.value.pop()

  // 显示结果
  lastResultType.value = resultType
  toastMessage.value = resultMessage
  toastType.value = resultType === 'loss' || resultType === 'judgment_loss' ? 'error' : 'success'
  toastVisible.value = true

  // 触发结果事件（供父组件更新金币）
  emit('spin-result', { cost, winAmount, net: winAmount - cost })

  isSpinning.value = false

  // 结果展示3秒后消失
  setTimeout(() => {
    toastVisible.value = false
  }, 3000)
}

function formatTime(ts) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function getReelsDisplay(rec) {
  return rec.reels.map(c => c[1]).join(' ')
}

// 每日首次检测
function checkDailyFree() {
  const today = new Date().toDateString()
  if (lastPlayDate.value !== today) {
    todayFreeUsed.value = false
  }
}

onMounted(() => {
  checkDailyFree()
})

// 暴露方法供父组件调用（首次免费等）
defineExpose({
  useDailyFree() {
    if (todayFreeUsed.value) return false
    const today = new Date().toDateString()
    lastPlayDate.value = today
    todayFreeUsed.value = true
    freeSpinActive.value = true
    return true
  },
  clearFreeSpin() {
    freeSpinActive.value = false
  },
  resetStats() {
    consecutiveLosses.value = 0
    totalSpins.value = 0
    spinsSinceLastWin.value = 0
    consecutiveWins.value = 0
    totalCost.value = 0
    totalEarned.value = 0
    history.value = []
  },
})
</script>

<template>
  <div class="slot-machine-screen" :class="{ 'jackpot-flash': toastVisible && lastResultType === 'jackpot' }" :style="slotThemeStyle">
    <!-- Header -->
    <header class="slot-header">
      <button type="button" class="slot-back-btn" @click="emit('back')" aria-label="返回">
        <svg class="slot-back-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="slot-title">🎰 幸运老虎机</h2>
      <div class="slot-coin-display">
        <span class="slot-coin-icon">💰</span>
        <span class="slot-coin-value">{{ coins }}</span>
      </div>
      <button type="button" class="slot-theme-btn" @click="showSkinSelector = true">
        🎨 主题
      </button>
      <button type="button" class="slot-history-btn" @click="showHistory = !showHistory">
        {{ showHistory ? '关闭' : '记录' }}
      </button>
    </header>

    <!-- 主体 -->
    <main class="slot-body">
      <!-- Toast 结果提示 -->
      <Toast
        :message="toastMessage"
        :type="toastType"
        :duration="3000"
        :on-close="() => { toastVisible.value = false }"
        v-if="toastVisible"
      />

      <!-- 惩罚警告 -->
      <Transition name="result-fade">
        <div v-if="consecutiveLosses >= PENALTY_THRESHOLD && !toastVisible" class="slot-penalty-warning">
          <span class="penalty-icon">⚠️</span>
          <span class="penalty-text">
            连续 {{ consecutiveLosses }} 次未中奖
            <span v-if="consecutiveLosses >= JUDGMENT_THRESHOLD" class="penalty-judgment">| 命运审判已触发！</span>
            <span v-else> | 不甘心税 +{{ Math.min((consecutiveLosses - PENALTY_THRESHOLD) * PENALTY_PER_EXTRA, MAX_PENALTY_PER_SPIN) }}💰</span>
          </span>
        </div>
      </Transition>

      <!-- 免费旋转提示 -->
      <Transition name="result-fade">
        <div v-if="freeSpinActive && !isSpinning" class="slot-free-hint">
          🍀 幸运时刻激活！本次旋转免费！
        </div>
      </Transition>

      <!-- 老虎机主体 -->
      <section class="slot-machine">
        <div class="slot-frame">
          <!-- 顶部装饰 -->
          <div class="slot-top-deco">
            <span class="deco-light" :class="{ blink: isSpinning }"></span>
            <span class="deco-light" :class="{ blink: isSpinning }"></span>
            <span class="deco-light" :class="{ blink: isSpinning }"></span>
            <span class="deco-light" :class="{ blink: isSpinning }"></span>
            <span class="deco-light" :class="{ blink: isSpinning }"></span>
          </div>

          <!-- 3x3 网格 -->
          <div class="slot-grid">
            <div
              v-for="(col, ci) in reels"
              :key="ci"
              class="slot-reel"
              :class="{ 'reel-spinning': reelAnimating[ci] }"
            >
              <div
                v-for="(sym, si) in col"
                :key="si"
                class="slot-cell"
                :class="{
                  'cell-middle': si === 1,
                  'cell-win': toastVisible && toastType === 'success' && si === 1,
                }"
              >
                <span class="cell-symbol">{{ sym }}</span>
              </div>
            </div>
          </div>

          <!-- 中线指示器 -->
          <div class="slot-payline">
            <span class="payline-arrow payline-left">◀</span>
            <span class="payline-arrow payline-right">▶</span>
          </div>

          <!-- 底部装饰 -->
          <div class="slot-bottom-deco">
            <span class="deco-light" :class="{ blink: isSpinning }"></span>
            <span class="deco-light" :class="{ blink: isSpinning }"></span>
            <span class="deco-light" :class="{ blink: isSpinning }"></span>
            <span class="deco-light" :class="{ blink: isSpinning }"></span>
            <span class="deco-light" :class="{ blink: isSpinning }"></span>
          </div>
        </div>
      </section>

      <!-- 赔率表 -->
      <section class="slot-paytable">
        <div class="paytable-title">💰 赔率表</div>
        <div class="paytable-grid">
          <div v-for="sym in SYMBOLS" :key="sym.id" class="paytable-item">
            <span class="paytable-emoji">{{ sym.emoji }}{{ sym.emoji }}{{ sym.emoji }}</span>
            <span class="paytable-mult">x{{ sym.multiplier }}</span>
          </div>
          <div class="paytable-item paytable-note">
            <span>2个相同 中线回本</span>
          </div>
        </div>
      </section>

      <!-- 旋转按钮 -->
      <div class="slot-spin-area">
        <button
          type="button"
          class="slot-spin-btn"
          :class="{
            spinning: isSpinning,
            disabled: !canSpin,
            'free-active': freeSpinActive,
            'judgment-active': consecutiveLosses >= JUDGMENT_THRESHOLD && !isSpinning,
          }"
          :disabled="!canSpin"
          @click="handleSpin"
        >
          {{ spinButtonLabel }}
        </button>
        <p v-if="!canSpin && !isSpinning" class="slot-no-coin-hint">
          金币不足，去完成任务赚金币吧！
        </p>
      </div>
    </main>

    <!-- 历史记录面板 -->
    <Transition name="slide-up">
      <div v-if="showHistory" class="slot-history-panel" @click.self="showHistory = false">
        <div class="history-content">
          <div class="history-header">
            <h3 class="history-title">📋 旋转记录</h3>
            <button type="button" class="history-close" @click="showHistory = false">×</button>
          </div>

          <div class="history-stats">
            <div class="stat-item">
              <span class="stat-label">总旋转</span>
              <span class="stat-value">{{ totalSpins }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">总消耗</span>
              <span class="stat-value stat-cost">-{{ totalCost }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">总获得</span>
              <span class="stat-value stat-earned">+{{ totalEarned }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">净收益</span>
              <span class="stat-value" :class="netProfit >= 0 ? 'stat-profit' : 'stat-loss'">{{ netProfit >= 0 ? '+' : ''}}{{ netProfit }}</span>
            </div>
          </div>

          <div class="history-list">
            <div v-if="history.length === 0" class="history-empty">暂无记录</div>
            <div
              v-for="rec in history"
              :key="rec.spinNumber"
              class="history-item"
              :class="'hist-' + rec.result"
            >
              <span class="hist-number">#{{ rec.spinNumber }}</span>
              <span class="hist-reels">{{ getReelsDisplay(rec) }}</span>
              <span class="hist-result">{{ rec.message }}</span>
              <span class="hist-time">{{ formatTime(rec.timestamp) }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 皮肤选择器 -->
    <Teleport to="body">
      <GameSkinSelector
        v-if="showSkinSelector"
        :skins="slotSkins"
        :owned-ids="slotOwnedSkins.map(s => s.id)"
        :active-id="slotActiveSkin.id"
        :coins="coins"
        @select="slotSelectSkin"
        @buy="handleSlotSkinBuy"
        @close="showSkinSelector = false"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.slot-machine-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--slot-body-bg, linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 30%, #1a1a2e 70%, #0f0f23 100%));
  z-index: 10000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 头奖闪烁 */
@keyframes jackpot-flash-anim {
  0%, 100% { background: linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 30%, #1a1a2e 70%, #0f0f23 100%); }
  25% { background: linear-gradient(135deg, #2a1a0e 0%, #4d3b1e 30%, #3a2a1e 70%, #2f1f13 100%); }
  50% { background: linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 30%, #1a1a2e 70%, #0f0f23 100%); }
  75% { background: linear-gradient(135deg, #0e1a2e 0%, #1b2d4e 30%, #1e2a3a 70%, #131f2f 100%); }
}
.jackpot-flash {
  animation: jackpot-flash-anim 0.5s ease 6;
}

/* Header */
.slot-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--slot-glow, rgba(255, 215, 0, 0.15));
  gap: 10px;
}

.slot-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
}

.slot-back-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.slot-title {
  flex: 1;
  text-align: center;
  color: var(--slot-light, #ffd700);
  font-size: 17px;
  font-weight: 600;
  margin: 0;
  text-shadow: 0 0 20px var(--slot-glow, rgba(255, 215, 0, 0.3));
}

.slot-coin-display {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 10px;
  padding: 6px 12px;
  flex-shrink: 0;
}

.slot-coin-icon {
  font-size: 16px;
}

.slot-coin-value {
  color: var(--slot-light, #ffd700);
  font-size: 15px;
  font-weight: 700;
  min-width: 30px;
  text-align: right;
}

/* 主题按钮 */
.slot-theme-btn {
  padding: 6px 12px;
  border: 1px solid var(--slot-border, rgba(255, 215, 0, 0.2));
  border-radius: 8px;
  background: rgba(255, 215, 0, 0.08);
  color: var(--slot-light, #ffd700);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.slot-theme-btn:hover {
  background: rgba(255, 215, 0, 0.15);
}
.slot-history-btn {
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
  .platform-android.android-portrait .slot-theme-btn,
  .platform-android.android-portrait .slot-history-btn  {
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
.slot-history-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* Body */
.slot-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 12px;
  gap: 12px;
}

/* 结果反馈 */
.slot-result-banner {
  padding: 10px 16px;
  border-radius: 12px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  animation: result-pop 0.3s ease;
}

.result-jackpot, .result-big, .result-lucky, .result-win, .result-small, .result-consolation, .result-break_even, .result-judgment {
  background: rgba(255, 215, 0, 0.15);
  border: 1px solid rgba(255, 215, 0, 0.3);
  color: #ffd700;
}

.result-loss, .result-judgment_loss {
  background: rgba(231, 76, 60, 0.1);
  border: 1px solid rgba(231, 76, 60, 0.2);
  color: #e74c3c;
}

@keyframes result-pop {
  0% { transform: scale(0.9); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

/* 惩罚警告 */
.slot-penalty-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(231, 76, 60, 0.08);
  border: 1px solid rgba(231, 76, 60, 0.15);
  border-radius: 10px;
  font-size: 12px;
  color: #e74c3c;
  animation: penalty-pulse 2s ease infinite;
}

.penalty-icon {
  font-size: 16px;
}

.penalty-text {
  flex: 1;
}

.penalty-judgment {
  color: #ff4444;
  font-weight: 700;
  text-shadow: 0 0 10px rgba(255, 68, 68, 0.3);
}

@keyframes penalty-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* 免费旋转提示 */
.slot-free-hint {
  padding: 8px 14px;
  background: rgba(46, 204, 113, 0.1);
  border: 1px solid rgba(46, 204, 113, 0.2);
  border-radius: 10px;
  text-align: center;
  font-size: 13px;
  color: #2ecc71;
  font-weight: 600;
}

/* 老虎机主体 */
.slot-machine {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.slot-frame {
  background: var(--slot-body-bg, linear-gradient(180deg, #2a1a3a 0%, #1a0a2a 100%));
  border: 2px solid var(--slot-border, rgba(255, 215, 0, 0.3));
  border-radius: 16px;
  padding: 8px;
  position: relative;
  box-shadow: 0 0 30px var(--slot-glow, rgba(255, 215, 0, 0.1)), inset 0 0 20px rgba(0, 0, 0, 0.5);
  max-width: 320px;
  width: 100%;
}

/* 装饰灯 */
.slot-top-deco,
.slot-bottom-deco {
  display: flex;
  justify-content: space-around;
  padding: 4px 12px;
}

.deco-light {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 215, 0, 0.4);
  transition: all 0.3s;
}

.deco-light.blink {
  animation: deco-blink 0.3s ease infinite alternate;
}

@keyframes deco-blink {
  0% { background: #ffd700; box-shadow: 0 0 8px #ffd700; }
  100% { background: rgba(255, 215, 0, 0.2); box-shadow: none; }
}

/* 3x3 网格 */
.slot-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  background: rgba(0, 0, 0, 0.4);
  border: 2px solid rgba(255, 215, 0, 0.2);
  border-radius: 12px;
  padding: 8px;
}

.slot-reel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.reel-spinning .slot-cell {
  animation: reel-blur 0.1s ease infinite;
}

@keyframes reel-blur {
  0% { transform: translateY(-3px); opacity: 0.7; }
  100% { transform: translateY(3px); opacity: 0.7; }
}

.slot-cell {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--slot-cell-bg, linear-gradient(180deg, rgba(40, 20, 60, 0.8), rgba(20, 10, 40, 0.9)));
  border: 1px solid var(--slot-border, rgba(255, 215, 0, 0.15));
  border-radius: 8px;
  transition: all 0.3s ease;
  min-height: 50px;
}

.cell-middle {
  border-color: var(--slot-border, rgba(255, 215, 0, 0.4));
  background: var(--slot-cell-middle-bg, linear-gradient(180deg, rgba(60, 30, 90, 0.8), rgba(40, 20, 60, 0.9)));
}

.cell-win {
  background: linear-gradient(180deg, rgba(255, 215, 0, 0.3), rgba(255, 165, 0, 0.2));
  border-color: #ffd700;
  animation: win-glow 0.5s ease infinite alternate;
}

@keyframes win-glow {
  0% { box-shadow: 0 0 10px rgba(255, 215, 0, 0.3); }
  100% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.6); }
}

.cell-symbol {
  font-size: 32px;
  line-height: 1;
}

/* 中线指示器 */
.slot-payline {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  pointer-events: none;
  display: flex;
  justify-content: space-between;
  padding: 0 4px;
  z-index: 5;
}

.payline-arrow {
  color: rgba(255, 215, 0, 0.5);
  font-size: 14px;
  font-weight: 700;
}

/* 赔率表 */
.slot-paytable {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 10px 14px;
}

.paytable-title {
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: #ffd700;
  margin-bottom: 8px;
}

.paytable-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px 12px;
}

.paytable-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
}

.paytable-emoji {
  font-size: 16px;
}

.paytable-mult {
  font-size: 12px;
  font-weight: 700;
  color: #ffd700;
}

.paytable-note {
  grid-column: span 3;
  justify-content: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

/* 旋转按钮 */
.slot-spin-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.slot-spin-btn {
  padding: 14px 36px;
  border: none;
  border-radius: 28px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--slot-button-bg, linear-gradient(135deg, #ffd700, #ff8c00));
  color: var(--slot-body-bg, #1a0a2e);
  box-shadow: 0 4px 20px rgba(255, 215, 0, 0.3);
  letter-spacing: 1px;
  min-width: 200px;
}

.slot-spin-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 30px rgba(255, 215, 0, 0.4);
}

.slot-spin-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}

.slot-spin-btn.spinning {
  opacity: 0.7;
  cursor: not-allowed;
  animation: btn-pulse 0.5s ease infinite;
}

.slot-spin-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: linear-gradient(135deg, #555, #333);
  color: #888;
  box-shadow: none;
}

.slot-spin-btn.free-active {
  background: linear-gradient(135deg, #2ecc71, #27ae60);
  box-shadow: 0 4px 20px rgba(46, 204, 113, 0.3);
}

.slot-spin-btn.judgment-active {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  box-shadow: 0 4px 20px rgba(231, 76, 60, 0.4);
  animation: judgment-flash 1s ease infinite;
}

@keyframes btn-pulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 0.9; }
}

@keyframes judgment-flash {
  0%, 100% { box-shadow: 0 4px 20px rgba(231, 76, 60, 0.4); }
  50% { box-shadow: 0 4px 30px rgba(231, 76, 60, 0.7); }
}

.slot-no-coin-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
}

/* 历史记录面板 */
.slot-history-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(20px);
  z-index: 10001;
  max-height: 70vh;
  display: flex;
  justify-content: center;
}

.history-content {
  width: 100%;
  max-width: 500px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-title {
  margin: 0;
  font-size: 16px;
  color: #ffd700;
}

.history-close {
  background: none;
  border: none;
  font-size: 28px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
}

.history-close:hover {
  color: #fff;
}

.history-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
}

.stat-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}

.stat-cost { color: #e74c3c; }
.stat-earned { color: #2ecc71; }
.stat-profit { color: #ffd700; }
.stat-loss { color: #e74c3c; }

.history-list {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-item {
  display: grid;
  grid-template-columns: 40px 60px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  font-size: 12px;
}

.hist-jackpot, .hist-big, .hist-lucky, .hist-win, .hist-small, .hist-consolation, .hist-break_even, .hist-judgment {
  background: rgba(255, 215, 0, 0.05);
  border-left: 2px solid #ffd700;
}

.hist-loss, .hist-judgment_loss {
  background: rgba(231, 76, 60, 0.03);
  border-left: 2px solid rgba(231, 76, 60, 0.3);
}

.hist-number {
  font-weight: 700;
  color: rgba(255, 255, 255, 0.5);
}

.hist-reels {
  font-size: 16px;
}

.hist-result {
  color: rgba(255, 255, 255, 0.7);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hist-time {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

.history-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  padding: 24px;
}

/* Transition */
.result-fade-enter-active,
.result-fade-leave-active {
  transition: all 0.3s ease;
}

.result-fade-enter-from,
.result-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

/* Android 竖屏适配 */
.platform-android.android-portrait .slot-header {
  padding: 12px !important;
  padding-top: calc(12px + env(safe-area-inset-top)) !important;
}

.platform-android.android-portrait .slot-back-btn {
  width: 44px !important;
  height: 44px !important;
  min-width: 44px !important;
  min-height: 44px !important;
}

.platform-android.android-portrait .slot-title {
  font-size: 15px !important;
}

.platform-android.android-portrait .cell-symbol {
  font-size: 28px !important;
}

.platform-android.android-portrait .slot-cell {
  min-height: 44px !important;
}

.platform-android.android-portrait .slot-history-panel {
  max-height: 60dvh !important;
}

.platform-android.android-portrait .slot-spin-btn {
  min-height: 50px !important;
  font-size: 15px !important;
  padding: 12px 30px !important;
}
</style>
