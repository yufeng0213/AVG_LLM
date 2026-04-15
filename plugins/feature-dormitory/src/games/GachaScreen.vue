<script setup>
/**
 * GachaScreen.vue - 扭蛋机
 * 消耗金币抽 SSR/SR/R/N 奖品，含碎片合成与保底系统
 */

import { ref, computed, onMounted, watch } from 'vue'
import Toast from '../Toast.vue'
import GameSkinSelector from '../components/GameSkinSelector.vue'
import { useGameSkin } from '../composables/useGameSkin'

const emit = defineEmits(['back', 'gacha-result', 'game-skin-buy'])
const props = defineProps({
  coins: { type: Number, default: 0 },
  inventory: { type: Array, default: () => [] },
})

// ====== 常量 ======
const SINGLE_COST = 50
const MULTI_COST = 450
const MULTI_COUNT = 10
const SR_PITY = 10
const SSR_PITY = 50
const LUCK_SOFT_PITY = 30
const SR_BOOST_THRESHOLD = 3

const RARITY_COLORS = {
  SSR: { hex: '#ffd700', glow: 'rgba(255, 215, 0, 0.6)', label: 'SSR' },
  SR:  { hex: '#a855f7', glow: 'rgba(168, 85, 247, 0.5)', label: 'SR' },
  R:   { hex: '#3b82f6', glow: 'rgba(59, 130, 246, 0.4)', label: 'R' },
  N:   { hex: '#9ca3af', glow: 'rgba(156, 163, 175, 0.3)', label: 'N' },
}

const PRIZE_TEMPLATES = {
  SSR: [
    { name: 'CG券', icon: '🎨', type: 'cg_ticket' },
    { name: '剧情券', icon: '📜', type: 'story_ticket' },
    { name: '稀有衣服券', icon: '👗', type: 'rare_clothes_ticket' },
  ],
  SR: [
    { name: '衣服券', icon: '🎫', type: 'clothes_ticket' },
    { name: 'CG碎片×3', icon: '🧩', type: 'cg_fragment', count: 3 },
    { name: '剧情碎片×3', icon: '📋', type: 'story_fragment', count: 3 },
  ],
  R: [
    { name: '衣服碎片', icon: '🧵', type: 'clothes_fragment', count: 1 },
    { name: 'CG碎片', icon: '🧩', type: 'cg_fragment', count: 1 },
    { name: '剧情碎片', icon: '📋', type: 'story_fragment', count: 1 },
    { name: '🍬 小糖果', icon: '🍬', type: 'misc', count: 1 },
    { name: '🔑 钥匙扣', icon: '🔑', type: 'misc', count: 1 },
  ],
  N: [
    { name: '衣服碎片', icon: '🧵', type: 'clothes_fragment', count: 1 },
    { name: 'CG碎片', icon: '🧩', type: 'cg_fragment', count: 1 },
    { name: '剧情碎片', icon: '📋', type: 'story_fragment', count: 1 },
    { name: '🍬 小糖果', icon: '🍬', type: 'misc', count: 1 },
    { name: '📎 回形针', icon: '📎', type: 'misc', count: 1 },
    { name: '🪙 旧硬币', icon: '🪙', type: 'misc', count: 1 },
  ],
}

const SYNTHESIS_RULES = [
  { fragmentType: 'story_fragment', need: 10, resultName: '剧情券', resultIcon: '📜', resultType: 'story_ticket' },
  { fragmentType: 'cg_fragment', need: 10, resultName: 'CG券', resultIcon: '🎨', resultType: 'cg_ticket' },
  { fragmentType: 'clothes_fragment', need: 5, resultName: '衣服券', resultIcon: '🎫', resultType: 'clothes_ticket' },
]

const GAME_KEY = 'gacha'

// ====== 皮肤系统 ======
const {
  skins: gachaSkins,
  activeSkin: gachaActiveSkin,
  ownedSkinList: gachaOwnedSkins,
  selectSkin: gachaSelectSkin,
  buySkin: gachaBuySkin,
} = useGameSkin(GAME_KEY)

const showSkinSelector = ref(false)

function handleGachaSkinBuy({ skinId, price }) {
  const result = gachaBuySkin(skinId, props.coins)
  if (result.success) {
    emit('game-skin-buy', { gameKey: GAME_KEY, cost: price })
    showToast(`🎨 主题已解锁：${gachaSkins.find(s => s.id === skinId)?.name}`, 'success')
  } else if (result.notEnoughCoins) {
    showToast('金币不足！', 'error')
  }
}

// ====== 状态 ======
const isAnimating = ref(false)
const isMultiAnimating = ref(false)
const machineState = ref('idle') // idle | shaking | dropping | revealing
const capsuleGlow = ref('')
const currentPrize = ref(null)
const currentRarity = ref('')
const showPrize = ref(false)
const multiResults = ref([])
const showMultiResult = ref(false)
const showHistory = ref(false)

// Toast 结果提示
const toastMessage = ref('')
const toastType = ref('success')
const toastVisible = ref(false)
let toastKey = 0

function showToast(msg, type = 'success') {
  toastKey++
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
}

function hideToast() {
  toastVisible.value = false
  toastMessage.value = ''
}

// 统计
const totalPulls = ref(0)
const pullsSinceSR = ref(0)
const pullsSinceSSR = ref(0)
const luckValue = ref(0)
const srBoostActive = ref(false)
const isFirstMulti = ref(true)
const totalCost = ref(0)

// 碎片计数
const fragmentCounts = ref({
  story_fragment: 0,
  cg_fragment: 0,
  clothes_fragment: 0,
})

// 历史记录
const history = ref([])

// ====== 计算属性 ======
const canSinglePull = computed(() => !isAnimating.value && props.coins >= SINGLE_COST)
const canMultiPull = computed(() => !isAnimating.value && props.coins >= MULTI_COST)

// 皮肤主题样式
const gachaThemeStyle = computed(() => {
  const theme = gachaActiveSkin.value.theme || {}
  return {
    '--gacha-screen-bg': theme.screenBg || 'linear-gradient(180deg, #0f0a1e 0%, #1a0a2e 40%, #0f1a2e 100%)',
    '--gacha-machine-bg': theme.machineBaseBg || 'linear-gradient(180deg, #3a1a4a, #2a0a3a)',
    '--gacha-dome-border': theme.domeBorder || 'rgba(255, 215, 0, 0.2)',
    '--gacha-dome-glow': theme.domeGlow || 'rgba(255, 215, 0, 0.1)',
    '--gacha-header-border': theme.headerBorder || 'rgba(255, 215, 0, 0.1)',
    '--gacha-header-text': theme.headerText || '#ffd700',
    '--gacha-capsule-top': theme.capsuleTop || 'linear-gradient(180deg, #e74c3c, #c0392b)',
    '--gacha-capsule-bottom': theme.capsuleBottom || 'linear-gradient(180deg, #f39c12, #e67e22)',
    '--gacha-knob': theme.knobColor || 'radial-gradient(circle, #ffd700, #ff8c00)',
    '--gacha-deco-light': theme.decoLight || 'rgba(255, 215, 0, 0.3)',
    '--gacha-deco-light-blink': theme.decoLightBlink || '#ffd700',
    '--gacha-single-btn-bg': theme.singleBtnBg || 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(59, 130, 246, 0.1))',
    '--gacha-single-btn-border': theme.singleBtnBorder || 'rgba(59, 130, 246, 0.3)',
    '--gacha-single-btn-text': theme.singleBtnText || '#60a5fa',
    '--gacha-multi-btn-bg': theme.multiBtnBg || 'linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(255, 140, 0, 0.1))',
    '--gacha-multi-btn-border': theme.multiBtnBorder || 'rgba(255, 215, 0, 0.3)',
    '--gacha-multi-btn-text': theme.multiBtnText || '#ffd700',
  }
})

const ssrPityProgress = computed(() => Math.min(pullsSinceSSR.value / SSR_PITY * 100, 100))
const srPityProgress = computed(() => Math.min(pullsSinceSR.value / SR_PITY * 100, 100))

// ====== 核心逻辑 ======

function pickRarity() {
  // 保底检查
  if (pullsSinceSSR.value >= SSR_PITY) return 'SSR'
  if (pullsSinceSR.value >= SR_PITY) {
    return Math.random() < 0.3 ? 'SSR' : 'SR'
  }

  // 软保底
  if (luckValue.value >= LUCK_SOFT_PITY) return 'SSR'

  // SR概率翻倍
  let srRate = 0.10
  let ssrRate = 0.03
  if (srBoostActive.value) srRate = 0.20

  const rand = Math.random()
  if (rand < ssrRate) return 'SSR'
  if (rand < ssrRate + srRate) return 'SR'
  if (rand < ssrRate + srRate + 0.30) return 'R'
  return 'N'
}

function pickPrize(rarity) {
  const templates = PRIZE_TEMPLATES[rarity]
  const template = templates[Math.floor(Math.random() * templates.length)]
  return {
    ...template,
    rarity,
    id: `gacha_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  }
}

function singlePull() {
  const rarity = pickRarity()
  const prize = pickPrize(rarity)

  // 更新统计
  totalPulls.value++
  totalCost.value += SINGLE_COST
  pullsSinceSR.value++
  pullsSinceSSR.value++

  if (rarity === 'SR' || rarity === 'SSR') {
    pullsSinceSR.value = 0
    srBoostActive.value = false
  } else if (pullsSinceSR.value >= SR_BOOST_THRESHOLD) {
    srBoostActive.value = true
  }

  if (rarity === 'SSR') {
    luckValue.value = 0
    pullsSinceSSR.value = 0
  } else {
    luckValue.value++
  }

  return { prize, rarity, cost: SINGLE_COST }
}

function multiPull() {
  const results = []
  let cost = MULTI_COST

  // 确保至少一个SR+
  const guaranteeIndex = Math.floor(Math.random() * MULTI_COUNT)

  for (let i = 0; i < MULTI_COUNT; i++) {
    let rarity
    if (i === guaranteeIndex) {
      // 保底SR+
      const forcedRarity = Math.random() < 0.15 ? 'SSR' : 'SR'
      rarity = forcedRarity
    } else {
      rarity = pickRarity()
    }

    const prize = pickPrize(rarity)

    totalPulls.value++
    pullsSinceSR.value++
    pullsSinceSSR.value++

    if (rarity === 'SR' || rarity === 'SSR') {
      pullsSinceSR.value = 0
      srBoostActive.value = false
    } else if (pullsSinceSR.value >= SR_BOOST_THRESHOLD) {
      srBoostActive.value = true
    }

    if (rarity === 'SSR') {
      luckValue.value = 0
      pullsSinceSSR.value = 0
    } else {
      luckValue.value++
    }

    results.push({ prize, rarity })
  }

  isFirstMulti.value = false
  return { results, cost }
}

// ====== 碎片合成 ======

function updateFragmentCounts(prizes) {
  for (const p of prizes) {
    if (p.type === 'story_fragment') fragmentCounts.value.story_fragment += p.count || 1
    if (p.type === 'cg_fragment') fragmentCounts.value.cg_fragment += p.count || 1
    if (p.type === 'clothes_fragment') fragmentCounts.value.clothes_fragment += p.count || 1
  }
}

function checkSynthesis() {
  for (const rule of SYNTHESIS_RULES) {
    const current = fragmentCounts.value[rule.fragmentType] || 0
    if (current >= rule.need) {
      fragmentCounts.value[rule.fragmentType] -= rule.need
      return {
        fragmentType: rule.fragmentType,
        fragmentName: rule.fragmentType === 'story_fragment' ? '剧情碎片' : rule.fragmentType === 'cg_fragment' ? 'CG碎片' : '衣服碎片',
        fragmentIcon: rule.fragmentType === 'story_fragment' ? '📋' : rule.fragmentType === 'cg_fragment' ? '🧩' : '🧵',
        resultName: rule.resultName,
        resultIcon: rule.resultIcon,
        resultType: rule.resultType,
      }
    }
  }
  return null
}

// ====== 动画 ======

async function animatePull(rarity, prize) {
  isAnimating.value = true
  showPrize.value = false
  toastVisible.value = false
  toastMessage.value = ''

  // 阶段1: 机器摇晃
  machineState.value = 'shaking'
  await delay(600)

  // 阶段2: 掉落
  machineState.value = 'dropping'
  capsuleGlow.value = RARITY_COLORS[rarity].hex
  await delay(400)

  // 阶段3: 展示
  machineState.value = 'revealing'
  currentPrize.value = prize
  currentRarity.value = rarity
  showPrize.value = true

  await delay(300)

  // 显示 Toast 结果
  const rarityLabels = { SSR: '🎆 SSR!', SR: '✨ SR!', R: '🔵 R', N: '⚪ N' }
  showToast(`${rarityLabels[rarity]} ${prize.icon} ${prize.name}`, rarity === 'SSR' ? 'success' : rarity === 'SR' ? 'info' : 'warning')

  // 检查碎片合成
  updateFragmentCounts([prize])
  const synth = checkSynthesis()
  if (synth) {
    await delay(800)
    showToast(`🧩 合成成功！${synth.fragmentIcon}×${SYNTHESIS_RULES.find(r => r.resultType === synth.resultType)?.need} → ${synth.resultIcon} ${synth.resultName}`, 'success')
    emit('gacha-result', {
      type: 'synthesis',
      item: {
        id: `synth_${Date.now()}`,
        name: synth.resultName,
        icon: synth.resultIcon,
        type: synth.resultType,
        rarity: rarity === 'SSR' ? 'SSR' : 'SR',
        quantity: 1,
      },
      cost: 0,
    })
  }

  // 记录历史
  history.value.unshift({
    pullNumber: totalPulls.value,
    rarity,
    prizeName: prize.name,
    prizeIcon: prize.icon,
    timestamp: Date.now(),
  })
  if (history.value.length > 30) history.value.pop()

  // 发送结果给父组件
  emit('gacha-result', {
    type: 'pull',
    rarity,
    prize,
    cost: SINGLE_COST,
  })
}

async function handleSinglePull() {
  if (!canSinglePull.value) return
  const result = singlePull()
  await animatePull(result.rarity, result.prize)
  isAnimating.value = false
}

async function handleMultiPull() {
  if (!canMultiPull.value) return
  const result = multiPull()

  isAnimating.value = true
  isMultiAnimating.value = true
  showPrize.value = false
  multiResults.value = []
  machineState.value = 'idle'

  // 批量动画
  machineState.value = 'shaking'
  await delay(800)
  machineState.value = 'dropping'
  capsuleGlow.value = RARITY_COLORS.SR.hex
  await delay(500)

  // 逐条处理结果，每条 SSR/SR 都弹 Toast
  multiResults.value = result.results
  const allPrizes = result.results.map(r => r.prize)
  updateFragmentCounts(allPrizes)

  // 统计稀有度分布
  const counts = { SSR: 0, SR: 0, R: 0, N: 0 }
  for (const r of result.results) counts[r.rarity]++

  // 显示十连总结 Toast
  const summaryParts = []
  if (counts.SSR) summaryParts.push(`🎆 ${counts.SSR}×SSR`)
  if (counts.SR) summaryParts.push(`✨ ${counts.SR}×SR`)
  if (counts.R) summaryParts.push(`${counts.R}×R`)
  if (counts.N) summaryParts.push(`${counts.N}×N`)

  showToast(`🎪 十连结果：${summaryParts.join(' | ')}\n消耗 ${MULTI_COST} 💰`, counts.SSR ? 'success' : counts.SR ? 'info' : 'warning')

  // 检查合成
  const synth = checkSynthesis()
  if (synth) {
    await delay(1500)
    showToast(`🧩 合成成功！${synth.fragmentIcon}×${SYNTHESIS_RULES.find(r => r.resultType === synth.resultType)?.need} → ${synth.resultIcon} ${synth.resultName}`, 'success')
    emit('gacha-result', {
      type: 'synthesis',
      item: {
        id: `synth_${Date.now()}`,
        name: synth.resultName,
        icon: synth.resultIcon,
        type: synth.resultType,
        rarity: 'SR',
        quantity: 1,
      },
      cost: 0,
    })
  }

  // 记录历史
  for (const r of result.results) {
    history.value.unshift({
      pullNumber: totalPulls.value,
      rarity: r.rarity,
      prizeName: r.prize.name,
      prizeIcon: r.prize.icon,
      timestamp: Date.now(),
    })
  }
  if (history.value.length > 30) history.value.splice(30)

  // 发送结果（一次发送所有奖品）
  emit('gacha-result', {
    type: 'multi',
    results: result.results.map(r => ({
      rarity: r.rarity,
      prize: r.prize,
    })),
    cost: MULTI_COST,
  })

  // 结束动画
  machineState.value = 'revealing'
  await delay(300)
  machineState.value = 'idle'

  // 显示十连结果弹窗
  showMultiResult.value = true
  isMultiAnimating.value = false
  isAnimating.value = false
}

function closeMultiResult() {
  showMultiResult.value = false
  isMultiAnimating.value = false
  isAnimating.value = false
  multiResults.value = []
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ====== 初始化 ======

onMounted(() => {
  // 从localStorage读取碎片计数
  try {
    const saved = localStorage.getItem('avg_llm_gacha_fragments')
    if (saved) {
      const parsed = JSON.parse(saved)
      Object.assign(fragmentCounts.value, parsed)
    }
    const stats = localStorage.getItem('avg_llm_gacha_stats')
    if (stats) {
      const parsed = JSON.parse(stats)
      if (parsed.totalPulls) totalPulls.value = parsed.totalPulls
      if (parsed.pullsSinceSR !== undefined) pullsSinceSR.value = parsed.pullsSinceSR
      if (parsed.pullsSinceSSR !== undefined) pullsSinceSSR.value = parsed.pullsSinceSSR
      if (parsed.luckValue !== undefined) luckValue.value = parsed.luckValue
      if (parsed.totalCost !== undefined) totalCost.value = parsed.totalCost
    }
  } catch (e) {
    console.warn('Gacha state load failed:', e)
  }
})

// 保存状态
function saveState() {
  try {
    localStorage.setItem('avg_llm_gacha_fragments', JSON.stringify(fragmentCounts.value))
    localStorage.setItem('avg_llm_gacha_stats', JSON.stringify({
      totalPulls: totalPulls.value,
      pullsSinceSR: pullsSinceSR.value,
      pullsSinceSSR: pullsSinceSSR.value,
      luckValue: luckValue.value,
      totalCost: totalCost.value,
    }))
  } catch (e) {
    console.warn('Gacha state save failed:', e)
  }
}

defineExpose({ saveState })
</script>

<template>
  <div class="gacha-screen" :class="{ 'ssr-flash': showPrize && currentRarity === 'SSR' }" :style="gachaThemeStyle">
    <!-- Header -->
    <header class="gacha-header">
      <button type="button" class="gacha-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="gacha-title">🎪 幸运扭蛋机</h2>
      <div class="gacha-coin-box">
        <span class="gacha-coin-icon">💰</span>
        <span class="gacha-coin-value">{{ coins }}</span>
      </div>
      <button type="button" class="gacha-theme-btn" @click="showSkinSelector = true">
        🎨 主题
      </button>
    </header>

    <!-- 主体 -->
    <main class="gacha-body">
      <!-- 保底进度 -->
      <div class="gacha-pity-bar">
        <div class="pity-item">
          <span class="pity-label">SSR保底</span>
          <div class="pity-track">
            <div class="pity-fill pity-ssr" :style="{ width: ssrPityProgress + '%' }"></div>
            <span class="pity-text">{{ pullsSinceSSR }}/{{ SSR_PITY }}</span>
          </div>
        </div>
        <div class="pity-item">
          <span class="pity-label">SR保底</span>
          <div class="pity-track">
            <div class="pity-fill pity-sr" :style="{ width: srPityProgress + '%' }"></div>
            <span class="pity-text">{{ pullsSinceSR }}/{{ SR_PITY }}</span>
          </div>
        </div>
        <div v-if="luckValue > 0" class="pity-item pity-luck">
          <span class="pity-label">🍀 幸运值</span>
          <span class="pity-luck-value">{{ luckValue }}/{{ LUCK_SOFT_PITY }}</span>
        </div>
      </div>

      <!-- 扭蛋机 -->
      <section class="gacha-machine-section">
        <div class="gacha-machine" :class="'state-' + machineState">
          <!-- 顶部圆顶 -->
          <div class="machine-dome">
            <div class="dome-glass">
              <!-- 内部胶囊 -->
              <div class="capsule-container" :class="{ 'shake-active': machineState === 'shaking' }">
                <div
                  v-for="i in 5"
                  :key="i"
                  class="capsule-ball"
                  :class="{
                    'capsule-glow': machineState === 'dropping' && i === 3,
                    'capsule-drop': machineState === 'dropping' && i === 3,
                  }"
                  :style="{
                    '--glow-color': machineState === 'dropping' && i === 3 ? capsuleGlow : 'transparent',
                    'animation-delay': `${i * 0.15}s`,
                  }"
                >
                  <div class="capsule-top"></div>
                  <div class="capsule-bottom"></div>
                </div>
              </div>
            </div>
            <!-- 底座 -->
            <div class="machine-base">
              <div class="base-front">
                <div class="coin-slot">
                  <span class="slot-text">💰</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 出蛋口 -->
          <div class="machine-dispenser">
            <div class="dispenser-door" :class="{ 'door-open': machineState === 'revealing' }"></div>
          </div>

          <!-- 旋钮 -->
          <div class="machine-knob" :class="{ 'knob-turning': machineState === 'shaking' }">
            <div class="knob-handle"></div>
          </div>

          <!-- 装饰灯 -->
          <div class="machine-lights">
            <span v-for="i in 8" :key="i" class="deco-light" :class="{ blink: isAnimating }" :style="{ animationDelay: i * 0.1 + 's' }"></span>
          </div>
        </div>
      </section>

      <!-- 碎片计数 -->
      <section class="gacha-fragments">
        <h3 class="fragments-title">🧩 碎片收集</h3>
        <div class="fragments-grid">
          <div class="fragment-item">
            <span class="fragment-icon">📋</span>
            <span class="fragment-name">剧情碎片</span>
            <span class="fragment-count">{{ fragmentCounts.story_fragment }} / 10</span>
            <div class="fragment-bar">
              <div class="fragment-fill" :style="{ width: Math.min(fragmentCounts.story_fragment / 10 * 100, 100) + '%' }"></div>
            </div>
          </div>
          <div class="fragment-item">
            <span class="fragment-icon">🧩</span>
            <span class="fragment-name">CG碎片</span>
            <span class="fragment-count">{{ fragmentCounts.cg_fragment }} / 10</span>
            <div class="fragment-bar">
              <div class="fragment-fill" :style="{ width: Math.min(fragmentCounts.cg_fragment / 10 * 100, 100) + '%' }"></div>
            </div>
          </div>
          <div class="fragment-item">
            <span class="fragment-icon">🧵</span>
            <span class="fragment-name">衣服碎片</span>
            <span class="fragment-count">{{ fragmentCounts.clothes_fragment }} / 5</span>
            <div class="fragment-bar">
              <div class="fragment-fill" :style="{ width: Math.min(fragmentCounts.clothes_fragment / 5 * 100, 100) + '%' }"></div>
            </div>
          </div>
        </div>
      </section>

      <!-- 操作按钮 -->
      <div class="gacha-actions">
        <button
          type="button"
          class="gacha-btn gacha-single"
          :class="{ disabled: !canSinglePull, shaking: machineState === 'shaking' }"
          :disabled="!canSinglePull"
          @click="handleSinglePull"
        >
          <span class="btn-label">单抽</span>
          <span class="btn-cost">{{ SINGLE_COST }} 💰</span>
        </button>
        <button
          type="button"
          class="gacha-btn gacha-multi"
          :class="{ disabled: !canMultiPull, shaking: machineState === 'shaking', 'first-bonus': isFirstMulti }"
          :disabled="!canMultiPull"
          @click="handleMultiPull"
        >
          <span class="btn-label">十连抽</span>
          <span class="btn-cost">{{ MULTI_COST }} 💰</span>
          <span v-if="isFirstMulti" class="bonus-badge">必出SR+</span>
        </button>
      </div>

      <!-- 奖品表 -->
      <section class="gacha-prizetable">
        <h3 class="prizetable-title">🏆 奖品概率</h3>
        <div class="prizetable-grid">
          <div class="prize-row prize-ssr">
            <span class="prize-rarity">SSR</span>
            <span class="prize-rate">3%</span>
            <span class="prize-items">CG券 · 剧情券 · 稀有衣服券</span>
          </div>
          <div class="prize-row prize-sr">
            <span class="prize-rarity">SR</span>
            <span class="prize-rate">10%</span>
            <span class="prize-items">衣服券 · CG碎片×3 · 剧情碎片×3</span>
          </div>
          <div class="prize-row prize-r">
            <span class="prize-rarity">R</span>
            <span class="prize-rate">30%</span>
            <span class="prize-items">碎片×1 · 小糖果 · 钥匙扣</span>
          </div>
          <div class="prize-row prize-n">
            <span class="prize-rarity">N</span>
            <span class="prize-rate">57%</span>
            <span class="prize-items">碎片×1 · 小糖果 · 旧硬币</span>
          </div>
        </div>
      </section>
    </main>

    <!-- 单抽奖品展示 -->
    <Transition name="prize-reveal">
      <div v-if="showPrize" class="gacha-prize-overlay" @click="showPrize = false">
        <div class="prize-card" :class="'rarity-' + currentRarity">
          <div class="prize-card-bg" :style="{ background: RARITY_COLORS[currentRarity]?.glow }"></div>
          <div class="prize-rarity-badge" :class="'badge-' + currentRarity">{{ currentRarity }}</div>
          <span class="prize-icon-large">{{ currentPrize?.icon }}</span>
          <p class="prize-name-large">{{ currentPrize?.name }}</p>
          <p class="prize-hint">点击任意处关闭</p>
        </div>
      </div>
    </Transition>

    <!-- 十连结果弹窗 -->
    <Transition name="prize-reveal">
      <div v-if="showMultiResult" class="gacha-prize-overlay" @click="closeMultiResult">
        <div class="multi-prize-card">
          <h3 class="multi-prize-title">🎪 十连结果</h3>
          <div class="multi-prize-grid">
            <div
              v-for="(r, idx) in multiResults"
              :key="idx"
              class="multi-prize-item"
              :class="'rarity-' + r.rarity"
            >
              <span class="multi-prize-rarity-badge" :class="'badge-' + r.rarity">{{ r.rarity }}</span>
              <span class="multi-prize-icon">{{ r.prize.icon }}</span>
              <span class="multi-prize-name">{{ r.prize.name }}</span>
            </div>
          </div>
          <p class="multi-prize-hint">点击任意处关闭</p>
        </div>
      </div>
    </Transition>

    <!-- 历史记录 -->
    <Transition name="slide-up">
      <div v-if="showHistory" class="gacha-history" @click.self="showHistory = false">
        <div class="history-inner">
          <div class="history-header">
            <h3>📋 抽卡记录</h3>
            <button type="button" class="history-close" @click="showHistory = false">×</button>
          </div>
          <div class="history-stats">
            <div class="h-stat"><span class="h-stat-label">总抽数</span><span class="h-stat-value">{{ totalPulls }}</span></div>
            <div class="h-stat"><span class="h-stat-label">总消耗</span><span class="h-stat-value cost">{{ totalCost }}</span></div>
          </div>
          <div class="history-list">
            <div v-if="history.length === 0" class="history-empty">暂无记录</div>
            <div v-for="(rec, idx) in history" :key="idx" class="history-item" :class="'hist-' + rec.rarity">
              <span class="hist-rarity" :class="'badge-' + rec.rarity">{{ rec.rarity }}</span>
              <span class="hist-icon">{{ rec.prizeIcon }}</span>
              <span class="hist-name">{{ rec.prizeName }}</span>
              <span class="hist-num">#{{ rec.pullNumber }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 历史记录按钮 -->
    <button type="button" class="gacha-history-fab" @click="showHistory = !showHistory">
      记录
    </button>

    <!-- Toast -->
    <Teleport to="body">
      <Transition name="toast-fade">
        <Toast
          v-if="toastVisible"
          :key="toastKey"
          :message="toastMessage"
          :type="toastType"
          :duration="3500"
          position="top"
          :on-close="hideToast"
        />
      </Transition>
    </Teleport>

    <!-- 皮肤选择器 -->
    <Teleport to="body">
      <GameSkinSelector
        v-if="showSkinSelector"
        :skins="gachaSkins"
        :owned-ids="gachaOwnedSkins.map(s => s.id)"
        :active-id="gachaActiveSkin.id"
        :coins="coins"
        @select="gachaSelectSkin"
        @buy="handleGachaSkinBuy"
        @close="showSkinSelector = false"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.gacha-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--gacha-screen-bg, linear-gradient(180deg, #0f0a1e 0%, #1a0a2e 40%, #0f1a2e 100%));
  z-index: 10000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* SSR闪烁 */
@keyframes ssr-screen-flash {
  0% { background: #ffd700; }
  100% { background: transparent; }
}
.ssr-flash::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 215, 0, 0.3);
  animation: ssr-screen-flash 0.8s ease 3;
  pointer-events: none;
  z-index: 10001;
}

/* Header */
.gacha-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--gacha-header-border, rgba(255, 215, 0, 0.1));
  gap: 10px;
}

.gacha-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.gacha-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

.gacha-title {
  flex: 1;
  text-align: center;
  margin: 0;
  color: var(--gacha-header-text, #ffd700);
  font-size: 17px;
  font-weight: 600;
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
}

.gacha-coin-box {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 10px;
  padding: 6px 12px;
}
.gacha-coin-value { color: var(--gacha-header-text, #ffd700); font-size: 15px; font-weight: 700; min-width: 30px; text-align: right; }

/* 主题按钮 */
.gacha-theme-btn {
  padding: 6px 12px;
  border: 1px solid var(--gacha-header-border, rgba(255, 215, 0, 0.2));
  border-radius: 8px;
  background: rgba(255, 215, 0, 0.08);
  color: var(--gacha-header-text, #ffd700);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.gacha-theme-btn:hover {
  background: rgba(255, 215, 0, 0.15);
}
  .platform-android.android-portrait .gacha-theme-btn {
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
/* Body */
.gacha-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 保底进度 */
.gacha-pity-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pity-item {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pity-luck {
  justify-content: center;
}

.pity-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  min-width: 60px;
}

.pity-luck-value {
  font-size: 13px;
  font-weight: 700;
  color: #2ecc71;
}

.pity-track {
  flex: 1;
  height: 18px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 9px;
  position: relative;
  overflow: hidden;
}

.pity-fill {
  height: 100%;
  border-radius: 9px;
  transition: width 0.5s ease;
}
.pity-ssr { background: linear-gradient(90deg, rgba(255, 215, 0, 0.3), #ffd700); }
.pity-sr { background: linear-gradient(90deg, rgba(168, 85, 247, 0.3), #a855f7); }

.pity-text {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
}

/* 扭蛋机 */
.gacha-machine-section {
  display: flex;
  justify-content: center;
  padding: 4px 0;
}

.gacha-machine {
  position: relative;
  width: 220px;
}

/* 圆顶 */
.machine-dome {
  position: relative;
}

.dome-glass {
  width: 200px;
  height: 200px;
  margin: 0 auto;
  background: radial-gradient(ellipse at 30% 30%, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 100px 100px 20px 20px;
  position: relative;
  overflow: hidden;
  box-shadow: inset 0 0 30px rgba(255, 255, 255, 0.05), 0 0 20px rgba(255, 215, 0, 0.1);
}

.capsule-container {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  padding: 20px;
  gap: 8px;
}

@keyframes capsule-float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-8px) rotate(5deg); }
}

.capsule-ball {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  position: relative;
  animation: capsule-float 2s ease-in-out infinite;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.capsule-top {
  width: 100%;
  height: 50%;
  background: var(--gacha-capsule-top, linear-gradient(180deg, #e74c3c, #c0392b));
  border-radius: 50% 50% 0 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
}

.capsule-bottom {
  width: 100%;
  height: 50%;
  background: var(--gacha-capsule-bottom, linear-gradient(180deg, #f39c12, #e67e22));
  border-radius: 0 0 50% 50%;
}

.capsule-ball.capsule-glow {
  animation: capsule-glow-pulse 0.5s ease infinite alternate;
}

@keyframes capsule-glow-pulse {
  0% { box-shadow: 0 0 10px var(--glow-color); }
  100% { box-shadow: 0 0 25px var(--glow-color), 0 0 40px var(--glow-color); }
}

.capsule-ball.capsule-drop {
  animation: capsule-drop-anim 0.5s ease forwards;
}

@keyframes capsule-drop-anim {
  0% { transform: translateY(0) scale(1); }
  60% { transform: translateY(40px) scale(1.1); }
  100% { transform: translateY(60px) scale(0.9); }
}

.capsule-container.shake-active .capsule-ball {
  animation: capsule-shake 0.1s ease infinite alternate;
}

@keyframes capsule-shake {
  0% { transform: translateX(-3px) rotate(-3deg); }
  100% { transform: translateX(3px) rotate(3deg); }
}

/* 底座 */
.machine-base {
  width: 180px;
  height: 60px;
  margin: 0 auto;
  background: var(--gacha-machine-bg, linear-gradient(180deg, #3a1a4a, #2a0a3a));
  border: 2px solid var(--gacha-dome-border, rgba(255, 215, 0, 0.2));
  border-radius: 0 0 16px 16px;
  position: relative;
}

.base-front {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.coin-slot {
  width: 40px;
  height: 30px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot-text { font-size: 16px; }

/* 出蛋口 */
.machine-dispenser {
  width: 100px;
  height: 30px;
  margin: 8px auto 0;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 215, 0, 0.15);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
}

.dispenser-door {
  width: 100%;
  height: 100%;
  background: rgba(50, 30, 70, 0.8);
  transition: all 0.3s ease;
}

.dispenser-door.door-open {
  background: var(--door-glow, rgba(255, 215, 0, 0.3));
  box-shadow: 0 0 15px rgba(255, 215, 0, 0.2);
}

/* 旋钮 */
.machine-knob {
  position: absolute;
  right: -30px;
  top: 80px;
  width: 24px;
  height: 40px;
  transition: transform 0.6s ease;
}

.machine-knob.knob-turning {
  animation: knob-spin 0.6s ease;
}

@keyframes knob-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.knob-handle {
  width: 24px;
  height: 24px;
  background: var(--gacha-knob, radial-gradient(circle, #ffd700, #ff8c00));
  border-radius: 50%;
  box-shadow: 0 2px 10px rgba(255, 215, 0, 0.3);
}

/* 装饰灯 */
.machine-lights {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.deco-light {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--gacha-deco-light, rgba(255, 215, 0, 0.3));
  transition: all 0.3s;
}

.deco-light.blink {
  animation: deco-blink 0.4s ease infinite alternate;
}

@keyframes deco-blink {
  0% { background: var(--gacha-deco-light-blink, #ffd700); box-shadow: 0 0 6px var(--gacha-deco-light-blink, #ffd700); }
  100% { background: rgba(255, 215, 0, 0.2); }
}

/* 碎片收集 */
.gacha-fragments {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px;
}

.fragments-title {
  margin: 0 0 10px;
  font-size: 14px;
  color: #ffd700;
  text-align: center;
}

.fragments-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.fragment-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
}

.fragment-icon { font-size: 20px; }
.fragment-name { font-size: 10px; color: rgba(255, 255, 255, 0.5); }
.fragment-count { font-size: 11px; font-weight: 700; color: rgba(255, 255, 255, 0.7); }

.fragment-bar {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.fragment-fill {
  height: 100%;
  background: linear-gradient(90deg, #ffd700, #ff8c00);
  border-radius: 2px;
  transition: width 0.3s ease;
}

/* 操作按钮 */
.gacha-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.gacha-btn {
  padding: 14px 12px;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
  position: relative;
  min-height: 70px;
}

.gacha-single {
  background: var(--gacha-single-btn-bg, linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(59, 130, 246, 0.1)));
  border: 1px solid var(--gacha-single-btn-border, rgba(59, 130, 246, 0.3));
  color: var(--gacha-single-btn-text, #60a5fa);
}

.gacha-multi {
  background: var(--gacha-multi-btn-bg, linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(255, 140, 0, 0.1)));
  border: 1px solid var(--gacha-multi-btn-border, rgba(255, 215, 0, 0.3));
  color: var(--gacha-multi-btn-text, #ffd700);
}

.gacha-btn:hover:not(:disabled) { transform: translateY(-2px); }
.gacha-btn:active:not(:disabled) { transform: scale(0.98); }

.gacha-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-label { font-size: 16px; font-weight: 700; }
.btn-cost { font-size: 13px; opacity: 0.7; }

.bonus-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 10px;
  white-space: nowrap;
}

/* 奖品表 */
.gacha-prizetable {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px;
}

.prizetable-title {
  margin: 0 0 10px;
  font-size: 14px;
  color: #ffd700;
  text-align: center;
}

.prizetable-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prize-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  font-size: 12px;
}

.prize-ssr { border-left: 3px solid #ffd700; }
.prize-sr { border-left: 3px solid #a855f7; }
.prize-r { border-left: 3px solid #3b82f6; }
.prize-n { border-left: 3px solid #9ca3af; }

.prize-rarity {
  font-weight: 700;
  min-width: 35px;
}
.prize-ssr .prize-rarity { color: #ffd700; }
.prize-sr .prize-rarity { color: #a855f7; }
.prize-r .prize-rarity { color: #3b82f6; }
.prize-n .prize-rarity { color: #9ca3af; }

.prize-rate {
  min-width: 35px;
  color: rgba(255, 255, 255, 0.5);
}

.prize-items {
  flex: 1;
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
}

/* 单抽奖品展示 */
.gacha-prize-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 10002;
  display: flex;
  align-items: center;
  justify-content: center;
}

.prize-card {
  position: relative;
  padding: 40px 50px;
  border-radius: 20px;
  text-align: center;
  overflow: hidden;
  min-width: 250px;
}

.prize-card-bg {
  position: absolute;
  inset: 0;
  opacity: 0.15;
  border-radius: 20px;
}

.prize-card.rarity-SSR {
  border: 2px solid #ffd700;
  box-shadow: 0 0 40px rgba(255, 215, 0, 0.4), 0 0 80px rgba(255, 215, 0, 0.2);
}
.prize-card.rarity-SR {
  border: 2px solid #a855f7;
  box-shadow: 0 0 30px rgba(168, 85, 247, 0.3);
}
.prize-card.rarity-R {
  border: 2px solid #3b82f6;
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.2);
}
.prize-card.rarity-N {
  border: 2px solid #9ca3af;
}

.prize-rarity-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
}
.badge-SSR { background: #ffd700; color: #1a0a2e; }
.badge-SR { background: #a855f7; color: #fff; }
.badge-R { background: #3b82f6; color: #fff; }
.badge-N { background: #9ca3af; color: #fff; }

.prize-icon-large {
  font-size: 64px;
  display: block;
  margin: 16px 0;
  animation: prize-bounce 0.6s ease;
}

@keyframes prize-bounce {
  0% { transform: scale(0); }
  60% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.prize-name-large {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin: 0;
}

.prize-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 16px;
}

/* 十连结果弹窗 */
.multi-prize-card {
  position: relative;
  padding: 30px 24px 24px;
  border-radius: 20px;
  max-width: 520px;
  width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  text-align: center;
  background: rgba(15, 10, 30, 0.95);
  border: 2px solid rgba(255, 215, 0, 0.3);
  box-shadow: 0 0 60px rgba(0, 0, 0, 0.6);
}

.multi-prize-title {
  margin: 0 0 16px;
  font-size: 20px;
  color: #ffd700;
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
}

.multi-prize-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.multi-prize-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  position: relative;
  animation: multi-prize-appear 0.4s ease backwards;
}
.multi-prize-item:nth-child(1) { animation-delay: 0.05s; }
.multi-prize-item:nth-child(2) { animation-delay: 0.1s; }
.multi-prize-item:nth-child(3) { animation-delay: 0.15s; }
.multi-prize-item:nth-child(4) { animation-delay: 0.2s; }
.multi-prize-item:nth-child(5) { animation-delay: 0.25s; }
.multi-prize-item:nth-child(6) { animation-delay: 0.3s; }
.multi-prize-item:nth-child(7) { animation-delay: 0.35s; }
.multi-prize-item:nth-child(8) { animation-delay: 0.4s; }
.multi-prize-item:nth-child(9) { animation-delay: 0.45s; }
.multi-prize-item:nth-child(10) { animation-delay: 0.5s; }

@keyframes multi-prize-appear {
  0% { transform: scale(0.5) translateY(10px); opacity: 0; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}

.multi-prize-item.rarity-SSR { border: 1px solid rgba(255, 215, 0, 0.4); background: rgba(255, 215, 0, 0.05); }
.multi-prize-item.rarity-SR { border: 1px solid rgba(168, 85, 247, 0.3); background: rgba(168, 85, 247, 0.05); }
.multi-prize-item.rarity-R { border: 1px solid rgba(59, 130, 246, 0.2); background: rgba(59, 130, 246, 0.03); }
.multi-prize-item.rarity-N { border: 1px solid rgba(156, 163, 175, 0.15); }

.multi-prize-rarity-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}
.badge-SSR { background: #ffd700; color: #1a0a2e; }
.badge-SR { background: #a855f7; color: #fff; }
.badge-R { background: #3b82f6; color: #fff; }
.badge-N { background: #9ca3af; color: #fff; }

.multi-prize-icon { font-size: 28px; }
.multi-prize-name { font-size: 10px; font-weight: 600; color: #fff; text-align: center; line-height: 1.3; }

.multi-prize-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  margin: 0;
}

/* 历史记录 */
.gacha-history {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(20px);
  z-index: 10002;
  max-height: 70vh;
}

.history-inner {
  padding: 16px;
  max-width: 500px;
  margin: 0 auto;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.history-header h3 { margin: 0; color: #ffd700; font-size: 16px; }

.history-close {
  background: none;
  border: none;
  font-size: 28px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  padding: 4px 8px;
}
.history-close:hover { color: #fff; }

.history-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.h-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.h-stat-label { font-size: 10px; color: rgba(255, 255, 255, 0.4); }
.h-stat-value { font-size: 15px; font-weight: 700; color: #fff; }
.h-stat-value.cost { color: #ffd700; }

.history-list {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-item {
  display: grid;
  grid-template-columns: 40px 28px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  font-size: 12px;
}
.hist-SSR { background: rgba(255, 215, 0, 0.06); border-left: 2px solid #ffd700; }
.hist-SR { background: rgba(168, 85, 247, 0.05); border-left: 2px solid #a855f7; }
.hist-R { background: rgba(59, 130, 246, 0.04); border-left: 2px solid #3b82f6; }

.hist-rarity { font-weight: 700; font-size: 11px; }
.hist-rarity.badge-SSR { color: #ffd700; }
.hist-rarity.badge-SR { color: #a855f7; }
.hist-rarity.badge-R { color: #3b82f6; }
.hist-rarity.badge-N { color: #9ca3af; }

.hist-icon { font-size: 18px; }
.hist-name { color: rgba(255, 255, 255, 0.7); }
.hist-num { font-size: 10px; color: rgba(255, 255, 255, 0.3); }

.history-empty { text-align: center; color: rgba(255, 255, 255, 0.3); padding: 24px; }

/* FAB */
.gacha-history-fab {
  position: fixed;
  bottom: 20px;
  right: 20px;
  padding: 10px 16px;
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(10px);
  color: #ffd700;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  z-index: 10001;
  transition: all 0.2s;
}
.gacha-history-fab:hover { background: rgba(255, 215, 0, 0.15); }

/* Transitions */
.prize-reveal-enter-active, .prize-reveal-leave-active { transition: all 0.3s ease; }
.prize-reveal-enter-from, .prize-reveal-leave-to { opacity: 0; }

.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%); opacity: 0; }

/* Android竖屏适配 */
.platform-android.android-portrait .gacha-header {
  padding-top: calc(12px + env(safe-area-inset-top)) !important;
}
.platform-android.android-portrait .gacha-back-btn {
  width: 44px !important; height: 44px !important; min-width: 44px !important; min-height: 44px !important;
}
.platform-android.android-portrait .gacha-title { font-size: 15px !important; }
.platform-android.android-portrait .gacha-history-fab { bottom: calc(20px + env(safe-area-inset-bottom)) !important; }
</style>
