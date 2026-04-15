<script setup>
/**
 * FarmScreen.vue - 我的农场
 * 种地、浇水、收获、天气、成就系统
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import Toast from './Toast.vue'

const emit = defineEmits(['back', 'farm-harvest'])
const props = defineProps({
  coins: { type: Number, default: 0 },
  inventory: { type: Array, default: () => [] },
})

// ====== 常量 ======
const TOTAL_PLOTS = 9
const INITIAL_UNLOCKED = 3
const UNLOCK_COSTS = [50, 80, 120, 170, 230, 300] // 第4~9格

const CROPS = {
  succulent: {
    name: '多肉', icon: '🌵', seedCost: 15, growTime: 10 * 60 * 1000, // 10min
    baseReward: 80, rareName: '大株多肉', rareReward: 200, rareChance: 0.10,
  },
  mint: {
    name: '薄荷', icon: '🌿', seedCost: 20, growTime: 20 * 60 * 1000, // 20min
    baseReward: 160, rareName: '薄荷精油', rareReward: 350, rareChance: 0.10,
  },
  sunflower: {
    name: '向日葵', icon: '🌻', seedCost: 25, growTime: 40 * 60 * 1000, // 40min
    baseReward: 300, rareName: '向日葵种子×3', rareReward: 0, rareChance: 0.15, rareIsSeeds: true,
  },
  rose: {
    name: '玫瑰', icon: '🌹', seedCost: 30, growTime: 90 * 60 * 1000, // 1.5h
    baseReward: 500, rareName: '稀有玫瑰', rareReward: 800, rareChance: 0.20,
  },
  clover: {
    name: '幸运草', icon: '🍀', seedCost: 35, growTime: 180 * 60 * 1000, // 3h
    baseReward: 800, rareName: '四叶草', rareReward: 1500, rareChance: 0.05,
  },
  goldenApple: {
    name: '金苹果', icon: '🍎', seedCost: 50, growTime: 300 * 60 * 1000, // 5h
    baseReward: 1500, rareName: '金苹果×3', rareReward: 5000, rareChance: 0.10,
  },
}

const CROP_KEYS = Object.keys(CROPS)

const WEATHER_TYPES = {
  sunny:   { icon: '☀️', label: '晴天',   growMultiplier: 1.0 },
  rainy:   { icon: '🌧️', label: '雨天',   growMultiplier: 0.67 }, // 速度+50% = 时间×0.67
  drought: { icon: '🔥', label: '干旱',   growMultiplier: 1.43 }, // 速度-30% = 时间×1.43
}

const ACHIEVEMENTS = [
  { id: 'harvest_10', label: '小农', count: 10 },
  { id: 'harvest_50', label: '农夫', count: 50 },
  { id: 'harvest_100', label: '农场主', count: 100 },
  { id: 'harvest_500', label: '农业大亨', count: 500 },
]

const GROWTH_STAGES = [
  { threshold: 0,   icon: '🌰', label: '种子' },
  { threshold: 0.25, icon: '🌱', label: '发芽' },
  { threshold: 0.5,  icon: '🌿', label: '小苗' },
  { threshold: 0.75, icon: '🌾', label: '成熟' },
]

const STORAGE_KEY = 'avg_llm_farm_state_v1'

// ====== 默认状态 ======
function createDefaultPlot() {
  return { state: 'idle', crop: null, plantedAt: null, fertility: 1.0 }
}

function getDefaultState() {
  return {
    plots: Array.from({ length: TOTAL_PLOTS }, () => createDefaultPlot()),
    unlockedCount: INITIAL_UNLOCKED,
    totalHarvests: 0,
    consecutiveDays: 0,
    lastVisitDate: null,
    weather: 'sunny',
    achievements: [],
    totalEarned: 0,
    lastWeatherChange: Date.now(),
  }
}

// ====== 状态 ======
const state = ref(getDefaultState())
const tick = ref(0) // 每秒刷新用
let tickInterval = null

// 天气定时器
let weatherTimer = null

// Toast
const toastMessage = ref('')
const toastType = ref('success')
const toastVisible = ref(false)

// 种植模式
const isPlantingMode = ref(false)
const selectedSeed = ref(null) // { cropKey, fromInventory: true/false }

// 种子选择面板
const showSeedPicker = ref(false)

// 收获动画
const harvestingPlot = ref(null)

// 阳台温室联动 Buff
const balconyBuffActive = computed(() => {
  try {
    const watered = localStorage.getItem('avg_llm_farm_watered_today')
    return watered === new Date().toDateString()
  } catch {
    return false
  }
})

// 综合生长倍率（天气 + 阳台 Buff）
const totalGrowMultiplier = computed(() => {
  let mult = currentWeather.value.growMultiplier
  if (balconyBuffActive.value) mult *= 0.9 // +10% = 时间×0.9
  return mult
})

// ====== 计算属性 ======
const currentWeather = computed(() => WEATHER_TYPES[state.value.weather] || WEATHER_TYPES.sunny)

const currentTitle = computed(() => {
  const maxAchievement = [...ACHIEVEMENTS].reverse().find(a => state.value.achievements.includes(a.id))
  return maxAchievement ? maxAchievement.label : '新手'
})

// 背包中的种子
const inventorySeeds = computed(() => {
  return props.inventory.filter(item =>
    item.type === 'seed' || item.category === 'plant' || CROP_KEYS.some(k => item.id?.includes(k) || item.name?.includes(CROPS[k]?.name))
  )
})

// 连种加成检查
const adjacencyBonus = computed(() => {
  const plots = state.value.plots
  const bonus = {}
  const checked = new Set()

  for (let i = 0; i < TOTAL_PLOTS; i++) {
    if (plots[i].state !== 'growing' && plots[i].state !== 'ready') continue
    if (!plots[i].crop) continue
    const key = `${plots[i].crop}`
    if (checked.has(`${i}-${key}`)) continue

    // BFS 找相邻同种
    const group = []
    const queue = [i]
    const visited = new Set()
    while (queue.length > 0) {
      const cur = queue.shift()
      if (visited.has(cur)) continue
      visited.add(cur)
      if (plots[cur].crop !== plots[i].crop) continue
      if (plots[cur].state !== 'growing' && plots[cur].state !== 'ready') continue
      group.push(cur)

      // 上下左右
      const row = Math.floor(cur / 3)
      const col = cur % 3
      const neighbors = []
      if (row > 0) neighbors.push(cur - 3)
      if (row < 2) neighbors.push(cur + 3)
      if (col > 0) neighbors.push(cur - 1)
      if (col < 2) neighbors.push(cur + 1)
      for (const n of neighbors) {
        if (!visited.has(n)) queue.push(n)
      }
    }

    if (group.length >= 3) {
      for (const idx of group) {
        bonus[idx] = 1.2 // +20%
        checked.add(`${idx}-${plots[idx].crop}`)
      }
    }
  }
  return bonus
})

// 连续种植加成
const consecutiveBonus = computed(() => {
  return Math.min(1 + state.value.consecutiveDays * 0.02, 1.5) // 最多 +50%
})

// ====== 持久化 ======
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // 合并默认值，防止新增字段缺失
      const def = getDefaultState()
      state.value = { ...def, ...parsed }
      // 确保 plots 数量正确
      while (state.value.plots.length < TOTAL_PLOTS) {
        state.value.plots.push(createDefaultPlot())
      }
    }
  } catch (e) {
    console.warn('Farm state load failed:', e)
  }
}

function saveState() {
  try {
    state.value.lastVisitDate = new Date().toDateString()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
  } catch (e) {
    console.warn('Farm state save failed:', e)
  }
}

// ====== 离线进度 ======
function applyOfflineProgress() {
  const now = Date.now()
  const lastVisit = state.value.lastVisitDate
    ? new Date(state.value.lastVisitDate).getTime()
    : now

  // 检查连续天数
  if (state.value.lastVisitDate) {
    const lastDate = new Date(state.value.lastVisitDate)
    const today = new Date()
    const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24))
    if (diffDays === 1) {
      state.value.consecutiveDays++
    } else if (diffDays > 1) {
      state.value.consecutiveDays = 1
    }
  } else {
    state.value.consecutiveDays = 1
  }

  // 推进作物生长（基于实际经过时间）
  const weatherMult = totalGrowMultiplier.value
  for (let i = 0; i < TOTAL_PLOTS; i++) {
    const plot = state.value.plots[i]
    if (plot.state === 'growing' && plot.plantedAt) {
      const crop = CROPS[plot.crop]
      if (!crop) continue
      const adjustedGrowTime = crop.growTime * weatherMult / (plot.fertility || 1.0)
      const elapsed = now - plot.plantedAt
      if (elapsed >= adjustedGrowTime) {
        plot.state = 'ready'
      }
      // 注意：不更新 plantedAt，保持原始播种时间用于UI进度条
    }
  }

  // 离线期间天气不变（冻结）
}

// ====== 天气系统 ======
function startWeatherCycle() {
  function scheduleNext() {
    const delay = (120 + Math.random() * 180) * 1000 // 2~5 分钟
    weatherTimer = setTimeout(() => {
      changeWeather()
      scheduleNext()
    }, delay)
  }
  scheduleNext()
}

function stopWeatherCycle() {
  if (weatherTimer) {
    clearTimeout(weatherTimer)
    weatherTimer = null
  }
}

function changeWeather() {
  const weathers = ['sunny', 'rainy', 'drought']
  const old = state.value.weather
  let next
  do {
    next = weathers[Math.floor(Math.random() * weathers.length)]
  } while (next === old)

  state.value.weather = next
  const w = WEATHER_TYPES[next]
  showToast(`${w.icon} 天气变化：${w.label}`, next === 'rainy' ? 'info' : next === 'drought' ? 'warning' : 'warning')
  saveState()
}

// ====== 工具函数 ======
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function showToast(msg, type = 'success') {
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
}

function hideToast() {
  toastVisible.value = false
  toastMessage.value = ''
}

// ====== 土地解锁 ======
function getUnlockCost(index) {
  const unlockIndex = index - INITIAL_UNLOCKED // 0-based into UNLOCK_COSTS
  if (unlockIndex < 0 || unlockIndex >= UNLOCK_COSTS.length) return 9999
  return UNLOCK_COSTS[unlockIndex]
}

function handleUnlockPlot(index) {
  const cost = getUnlockCost(index)
  if (props.coins < cost) {
    showToast('金币不足，去完成任务赚金币吧！', 'error')
    return
  }
  emit('farm-harvest', { cost, earned: 0 })
  state.value.plots[index].state = 'idle'
  state.value.unlockedCount++
  showToast(`🔓 解锁了新土地！花费 ${cost} 💰`, 'info')
  saveState()
}

// ====== 种植 ======
function handlePlotClick(index) {
  const plot = state.value.plots[index]

  // 锁定的土地 → 解锁
  if (index >= state.value.unlockedCount) {
    handleUnlockPlot(index)
    return
  }

  // 空闲土地 + 种植模式 → 种下
  if (plot.state === 'idle' && isPlantingMode.value && selectedSeed.value) {
    plantSeed(index)
    return
  }

  // 生长中土地 → 浇水
  if (plot.state === 'growing') {
    waterPlant(index)
    return
  }

  // 成熟土地 → 收获
  if (plot.state === 'ready') {
    harvestPlot(index)
    return
  }
}

function plantSeed(index) {
  const seed = selectedSeed.value
  if (!seed) return

  const crop = CROPS[seed.cropKey]
  if (!crop) return

  // 扣除金币
  emit('farm-harvest', { cost: crop.seedCost, earned: 0 })

  state.value.plots[index] = {
    state: 'growing',
    crop: seed.cropKey,
    plantedAt: Date.now(),
    fertility: state.value.plots[index].fertility || 1.0,
  }

  showToast(`🌱 种下了 ${crop.icon} ${crop.name}`, 'info')
  isPlantingMode.value = false
  selectedSeed.value = null
  saveState()
}

// ====== 浇水 ======
function waterPlant(index) {
  const plot = state.value.plots[index]
  if (plot.state !== 'growing' || !plot.plantedAt) return

  // 减少 20% 剩余时间 → 等效于提前 plantedAt
  const crop = CROPS[plot.crop]
  if (!crop) return

  const now = Date.now()
  const weatherMult = totalGrowMultiplier.value
  const fertilityMult = plot.fertility || 1.0
  const adjustedGrowTime = crop.growTime * weatherMult / fertilityMult
  const elapsed = now - plot.plantedAt
  const remaining = adjustedGrowTime - elapsed

  if (remaining <= 0) {
    plot.state = 'ready'
    return
  }

  // plantedAt 提前 20% 剩余时间
  const advance = remaining * 0.2
  plot.plantedAt = plot.plantedAt + advance

  // 提升肥沃度
  plot.fertility = Math.min(1.5, (plot.fertility || 1.0) + 0.02)

  showToast(`💧 浇水成功！${crop.icon} 生长加速`, 'info')
  saveState()
}

// ====== 收获 ======
function getPlotProgress(index) {
  const plot = state.value.plots[index]
  if (plot.state === 'idle' || plot.state === 'locked') return 0
  if (plot.state === 'ready') return 1
  if (!plot.plantedAt || !plot.crop) return 0

  const crop = CROPS[plot.crop]
  if (!crop) return 0

  const now = Date.now()
  const weatherMult = totalGrowMultiplier.value
  const fertilityMult = plot.fertility || 1.0
  const adjustedGrowTime = crop.growTime * weatherMult / fertilityMult
  const elapsed = now - plot.plantedAt
  return Math.min(elapsed / adjustedGrowTime, 1.0)
}

function getGrowthStage(index) {
  const progress = getPlotProgress(index)
  let stage = GROWTH_STAGES[0]
  for (const s of GROWTH_STAGES) {
    if (progress >= s.threshold) stage = s
  }
  return stage
}

function getRemainingTime(index) {
  const plot = state.value.plots[index]
  if (plot.state === 'ready') return '可收获'
  if (!plot.plantedAt || !plot.crop) return ''

  const crop = CROPS[plot.crop]
  if (!crop) return ''

  const now = Date.now()
  const weatherMult = totalGrowMultiplier.value
  const fertilityMult = plot.fertility || 1.0
  const adjustedGrowTime = crop.growTime * weatherMult / fertilityMult
  const elapsed = now - plot.plantedAt
  const remaining = Math.max(0, adjustedGrowTime - elapsed)

  const minutes = Math.floor(remaining / 60000)
  const seconds = Math.floor((remaining % 60000) / 1000)
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h${mins}m`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

async function harvestPlot(index) {
  const plot = state.value.plots[index]
  if (plot.state !== 'ready') return

  const crop = CROPS[plot.crop]
  if (!crop) return

  harvestingPlot.value = index

  let reward = crop.baseReward
  let bonusText = ''

  // 连种加成
  const adjBonus = adjacencyBonus.value[index]
  if (adjBonus) {
    reward = Math.round(reward * adjBonus)
    bonusText += ' 连种+20%！'
  }

  // 连续种植加成
  reward = Math.round(reward * consecutiveBonus.value)

  // 金色作物 5%
  const isGolden = Math.random() < 0.05
  if (isGolden) {
    reward *= 5
    bonusText += ' 🌟 金色作物×5！'
  }

  // 稀有产物
  let gotRare = false
  if (Math.random() < crop.rareChance) {
    gotRare = true
    if (crop.rareIsSeeds) {
      // 额外种子直接发放
      bonusText += ` 获得 ${crop.rareName}！`
    } else {
      reward = crop.rareReward
      bonusText += ` 稀有 ${crop.rareName}！`
    }
  }

  // 发放金币
  emit('farm-harvest', { cost: 0, earned: reward })
  state.value.totalHarvests++
  state.value.totalEarned += reward

  // 检查成就
  const newAchievement = [...ACHIEVEMENTS].reverse().find(a =>
    state.value.totalHarvests >= a.count && !state.value.achievements.includes(a.id)
  )
  if (newAchievement) {
    state.value.achievements.push(newAchievement.id)
    await delay(500)
    showToast(`🏆 成就解锁：${newAchievement.label}！`, 'success')
  }

  // Toast 结果
  const goldenIcon = isGolden ? '🌟' : ''
  showToast(
    `${crop.icon} 收获 ${crop.name}！+${reward} 💰${goldenIcon}${bonusText}`,
    isGolden ? 'success' : gotRare ? 'success' : 'info'
  )

  // 重置土地
  await delay(300)
  state.value.plots[index] = {
    state: 'idle',
    crop: null,
    plantedAt: null,
    fertility: plot.fertility || 1.0,
  }
  harvestingPlot.value = null
  saveState()
}

// 一键收获
async function harvestAll() {
  const readyIndices = []
  for (let i = 0; i < TOTAL_PLOTS; i++) {
    if (state.value.plots[i].state === 'ready') readyIndices.push(i)
  }
  if (readyIndices.length === 0) {
    showToast('没有成熟的作物，再等等吧~', 'warning')
    return
  }

  let totalReward = 0
  let summaryParts = []
  for (const i of readyIndices) {
    const plot = state.value.plots[i]
    const crop = CROPS[plot.crop]
    if (!crop) continue

    let reward = crop.baseReward
    const adjBonus = adjacencyBonus.value[i]
    if (adjBonus) reward = Math.round(reward * adjBonus)
    reward = Math.round(reward * consecutiveBonus.value)

    const isGolden = Math.random() < 0.05
    if (isGolden) reward *= 5

    let gotRare = false
    if (Math.random() < crop.rareChance && !crop.rareIsSeeds) {
      reward = crop.rareReward
      gotRare = true
    }

    totalReward += reward
    state.value.totalHarvests++
    state.value.totalEarned += reward

    summaryParts.push(`${crop.icon}${isGolden ? '🌟' : ''}${reward}`)

    state.value.plots[i] = {
      state: 'idle', crop: null, plantedAt: null,
      fertility: plot.fertility || 1.0,
    }
  }

  emit('farm-harvest', { cost: 0, earned: totalReward })

  // 成就检查
  const newAchievement = [...ACHIEVEMENTS].reverse().find(a =>
    state.value.totalHarvests >= a.count && !state.value.achievements.includes(a.id)
  )
  if (newAchievement) {
    state.value.achievements.push(newAchievement.id)
    showToast(`🏆 成就解锁：${newAchievement.label}！`, 'success')
  }

  showToast(`🌾 一键收获：${summaryParts.join(' | ')}\n总计 +${totalReward} 💰`, 'success')
  saveState()
}

// ====== 种植模式 ======
function openSeedPicker() {
  showSeedPicker.value = true
}

function selectSeedFromPicker(cropKey) {
  selectedSeed.value = { cropKey }
  isPlantingMode.value = true
  showSeedPicker.value = false
  const crop = CROPS[cropKey]
  showToast(`🌱 选择种植：${crop.icon} ${crop.name}（${crop.seedCost}💰），点击空地种下`, 'info')
}

// ====== Tick 循环 ======
function startTick() {
  tickInterval = setInterval(() => {
    // 检查是否有 ready 的作物
    for (let i = 0; i < TOTAL_PLOTS; i++) {
      const plot = state.value.plots[i]
      if (plot.state === 'growing' && plot.plantedAt) {
        const progress = getPlotProgress(i)
        if (progress >= 1.0) {
          plot.state = 'ready'
        }
      }
    }
    tick.value++
  }, 1000)
}

function stopTick() {
  if (tickInterval) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}

// ====== 生命周期 ======
onMounted(() => {
  loadState()
  applyOfflineProgress()
  saveState()
  startTick()
  startWeatherCycle()
})

onUnmounted(() => {
  stopTick()
  stopWeatherCycle()
  saveState()
})

defineExpose({ saveState })
</script>

<template>
  <div class="farm-screen">
    <!-- Header -->
    <header class="farm-header">
      <button type="button" class="farm-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="farm-title">🌾 我的农场</h2>
      <div class="farm-coin-box">
        <span class="farm-coin-icon">💰</span>
        <span class="farm-coin-value">{{ coins }}</span>
      </div>
    </header>

    <!-- 天气栏 -->
    <div class="farm-weather-bar">
      <span class="weather-icon">{{ currentWeather.icon }}</span>
      <span class="weather-label">{{ currentWeather.label }}</span>
      <span class="weather-divider">|</span>
      <span class="streak-info">连续种植: {{ state.consecutiveDays }}天 🔥</span>
      <span class="weather-divider">|</span>
      <span class="title-badge">称号: {{ currentTitle }}</span>
      <span v-if="balconyBuffActive" class="balcony-buff">🌿 温室加成</span>
    </div>

    <!-- 主体 -->
    <main class="farm-body">
      <!-- 土地网格 -->
      <section class="farm-grid">
        <div
          v-for="(plot, index) in state.plots"
          :key="index"
          class="farm-plot-cell"
          :class="{
            'plot-locked': index >= state.unlockedCount,
            'plot-idle': plot.state === 'idle',
            'plot-growing': plot.state === 'growing',
            'plot-ready': plot.state === 'ready',
            'plot-harvesting': harvestingPlot === index,
          }"
          @click="handlePlotClick(index)"
        >
          <!-- 锁定状态 -->
          <template v-if="index >= state.unlockedCount">
            <span class="plot-icon">🔒</span>
            <span class="plot-unlock-cost">{{ getUnlockCost(index) }} 💰</span>
          </template>

          <!-- 空闲状态 -->
          <template v-else-if="plot.state === 'idle'">
            <span class="plot-icon">🟫</span>
            <span class="plot-label">空闲</span>
          </template>

          <!-- 生长中状态 -->
          <template v-else-if="plot.state === 'growing'">
            <span class="plot-icon">{{ getGrowthStage(index).icon }}</span>
            <span class="plot-label">{{ CROPS[plot.crop]?.icon }} {{ getRemainingTime(index) }}</span>
            <div class="plot-progress-bar">
              <div class="plot-progress-fill" :style="{ width: Math.min(getPlotProgress(index) * 100, 100) + '%' }"></div>
            </div>
          </template>

          <!-- 成熟状态 -->
          <template v-else-if="plot.state === 'ready'">
            <span class="plot-icon plot-ready-icon">{{ CROPS[plot.crop]?.icon }}</span>
            <span class="plot-label plot-ready-label">可收获</span>
          </template>
        </div>
      </section>

      <!-- 操作按钮 -->
      <div class="farm-actions">
        <button
          type="button"
          class="farm-btn farm-btn-plant"
          :class="{ active: isPlantingMode }"
          @click="isPlantingMode ? (isPlantingMode = false, selectedSeed = null) : openSeedPicker()"
        >
          <span class="btn-icon">🌱</span>
          <span class="btn-label">{{ isPlantingMode ? '取消种植' : '种植' }}</span>
        </button>
        <button type="button" class="farm-btn farm-btn-harvest" @click="harvestAll">
          <span class="btn-icon">🌾</span>
          <span class="btn-label">一键收获</span>
        </button>
      </div>

      <!-- 种子选择面板 -->
      <section v-if="showSeedPicker" class="farm-seed-picker" @click.self="showSeedPicker = false">
        <div class="seed-picker-inner">
          <h3 class="seed-picker-title">选择要种植的种子</h3>
          <div class="seed-grid">
            <button
              v-for="key in CROP_KEYS"
              :key="key"
              type="button"
              class="seed-option"
              @click="selectSeedFromPicker(key)"
            >
              <span class="seed-icon">{{ CROPS[key].icon }}</span>
              <span class="seed-name">{{ CROPS[key].name }}</span>
              <span class="seed-cost">{{ CROPS[key].seedCost }} 💰</span>
              <span class="seed-time">{{ Math.round(CROPS[key].growTime / 60000) }}min</span>
            </button>
          </div>
        </div>
      </section>

      <!-- 统计栏 -->
      <section class="farm-stats">
        <div class="stat-item">
          <span class="stat-label">累计收获</span>
          <span class="stat-value">{{ state.totalHarvests }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">总收入</span>
          <span class="stat-value gold">{{ state.totalEarned }} 💰</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">连续加成</span>
          <span class="stat-value">×{{ consecutiveBonus.toFixed(2) }}</span>
        </div>
      </section>

      <!-- 成就列表 -->
      <section class="farm-achievements">
        <h3 class="achievements-title">🏆 成就</h3>
        <div class="achievements-grid">
          <div
            v-for="ach in ACHIEVEMENTS"
            :key="ach.id"
            class="achievement-item"
            :class="{ 'achievement-unlocked': state.achievements.includes(ach.id) }"
          >
            <span class="achievement-icon">{{ state.achievements.includes(ach.id) ? '🏅' : '🔒' }}</span>
            <span class="achievement-name">{{ ach.label }}</span>
            <span class="achievement-require">收获 {{ ach.count }} 次</span>
          </div>
        </div>
      </section>
    </main>

    <!-- 种植模式提示 -->
    <div v-if="isPlantingMode && selectedSeed" class="farm-planting-hint">
      🌱 种植模式：点击空闲土地种下 {{ CROPS[selectedSeed.cropKey]?.icon }} {{ CROPS[selectedSeed.cropKey]?.name }}
      <button type="button" class="hint-cancel" @click="isPlantingMode = false; selectedSeed = null">取消</button>
    </div>

    <!-- Toast -->
    <Teleport to="body">
      <Toast
        v-if="toastVisible"
        :message="toastMessage"
        :type="toastType"
        :duration="4000"
        position="top"
        :on-close="() => { toastVisible.value = false; toastMessage.value = '' }"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.farm-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, #1a2e0a 0%, #0a1e0a 40%, #0a1a1e 100%);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.farm-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(34, 197, 94, 0.2);
  gap: 10px;
}

.farm-back-btn {
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
.farm-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

.farm-title {
  flex: 1;
  text-align: center;
  margin: 0;
  color: #4ade80;
  font-size: 17px;
  font-weight: 600;
  text-shadow: 0 0 15px rgba(74, 222, 128, 0.3);
}

.farm-coin-box {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 10px;
  padding: 6px 12px;
}
.farm-coin-value { color: #ffd700; font-size: 15px; font-weight: 700; min-width: 30px; text-align: right; }

/* 天气栏 */
.farm-weather-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
}
.weather-icon { font-size: 18px; }
.weather-label { color: #fff; font-weight: 600; }
.weather-divider { color: rgba(255, 255, 255, 0.3); }
.streak-info { color: #ff8c00; font-weight: 600; }
.title-badge { color: #ffd700; font-weight: 600; }
.balcony-buff { color: #4ade80; font-weight: 600; animation: buff-pulse 2s ease-in-out infinite; }

@keyframes buff-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* Body */
.farm-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 土地网格 */
.farm-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  max-width: 360px;
  margin: 0 auto;
  width: 100%;
}

.farm-plot-cell {
  aspect-ratio: 1;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  overflow: hidden;
}

.farm-plot-cell:hover { transform: scale(1.03); }
.farm-plot-cell:active { transform: scale(0.97); }

/* 锁定 */
.plot-locked {
  background: rgba(50, 50, 50, 0.4);
  border: 2px dashed rgba(255, 255, 255, 0.15);
}
.plot-locked .plot-icon { font-size: 28px; opacity: 0.5; }
.plot-unlock-cost { font-size: 12px; color: #ffd700; font-weight: 600; }

/* 空闲 */
.plot-idle {
  background: linear-gradient(180deg, rgba(139, 90, 43, 0.3), rgba(101, 67, 33, 0.3));
  border: 2px solid rgba(139, 90, 43, 0.3);
}
.plot-idle .plot-icon { font-size: 28px; opacity: 0.6; }
.plot-idle .plot-label { font-size: 11px; color: rgba(255, 255, 255, 0.4); }

/* 生长中 */
.plot-growing {
  background: linear-gradient(180deg, rgba(34, 197, 94, 0.1), rgba(22, 101, 52, 0.2));
  border: 2px solid rgba(34, 197, 94, 0.3);
}
.plot-growing .plot-icon { font-size: 32px; animation: plant-sway 2s ease-in-out infinite; }
.plot-growing .plot-label { font-size: 11px; color: rgba(255, 255, 255, 0.6); }

@keyframes plant-sway {
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
}

/* 成熟 */
.plot-ready {
  background: linear-gradient(180deg, rgba(255, 215, 0, 0.15), rgba(255, 140, 0, 0.2));
  border: 2px solid rgba(255, 215, 0, 0.5);
  animation: ready-glow 1.5s ease-in-out infinite alternate;
}
.plot-ready-icon { font-size: 36px; animation: ready-bounce 0.8s ease-in-out infinite; }
.plot-ready-label { font-size: 12px; color: #ffd700; font-weight: 700; }

@keyframes ready-glow {
  0% { box-shadow: 0 0 8px rgba(255, 215, 0, 0.3); }
  100% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.6), 0 0 40px rgba(255, 215, 0, 0.2); }
}

@keyframes ready-bounce {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

/* 收获动画 */
.plot-harvesting {
  animation: harvest-pop 0.3s ease;
}

@keyframes harvest-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

/* 进度条 */
.plot-progress-bar {
  width: 80%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
  position: absolute;
  bottom: 8px;
}

.plot-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #4ade80);
  border-radius: 2px;
  transition: width 1s linear;
}

/* 操作按钮 */
.farm-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  max-width: 360px;
  margin: 0 auto;
  width: 100%;
}

.farm-btn {
  padding: 14px 12px;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
  min-height: 60px;
}
.farm-btn:hover:not(:disabled) { transform: translateY(-2px); }
.farm-btn:active { transform: scale(0.98); }

.farm-btn-plant {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(34, 197, 94, 0.1));
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #4ade80;
}
.farm-btn-plant.active {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.5), rgba(34, 197, 94, 0.2));
  border-color: #22c55e;
  box-shadow: 0 0 15px rgba(34, 197, 94, 0.3);
}

.farm-btn-harvest {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(255, 140, 0, 0.1));
  border: 1px solid rgba(255, 215, 0, 0.3);
  color: #ffd700;
}

.btn-icon { font-size: 22px; }
.btn-label { font-size: 14px; font-weight: 700; }

/* 种子选择面板 */
.farm-seed-picker {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 10003;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.seed-picker-inner {
  background: linear-gradient(180deg, #1a2e0a, #0a1e0a);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 16px;
  padding: 20px;
  max-width: 400px;
  width: 100%;
  max-height: 70vh;
  overflow-y: auto;
}

.seed-picker-title {
  margin: 0 0 16px;
  text-align: center;
  color: #4ade80;
  font-size: 16px;
}

.seed-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.seed-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  border-radius: 12px;
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.2);
  cursor: pointer;
  transition: all 0.2s;
  color: #fff;
}
.seed-option:hover { background: rgba(34, 197, 94, 0.15); border-color: rgba(34, 197, 94, 0.4); transform: scale(1.05); }

.seed-icon { font-size: 28px; }
.seed-name { font-size: 13px; font-weight: 600; color: #4ade80; }
.seed-cost { font-size: 11px; color: #ffd700; }
.seed-time { font-size: 10px; color: rgba(255, 255, 255, 0.4); }

/* 统计栏 */
.farm-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  max-width: 360px;
  margin: 0 auto;
  width: 100%;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.stat-label { font-size: 10px; color: rgba(255, 255, 255, 0.4); }
.stat-value { font-size: 15px; font-weight: 700; color: #fff; }
.stat-value.gold { color: #ffd700; }

/* 成就列表 */
.farm-achievements {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px;
}

.achievements-title {
  margin: 0 0 10px;
  font-size: 14px;
  color: #ffd700;
  text-align: center;
}

.achievements-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.achievement-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  text-align: center;
}

.achievement-unlocked {
  background: rgba(255, 215, 0, 0.08);
  border-color: rgba(255, 215, 0, 0.3);
}

.achievement-icon { font-size: 22px; }
.achievement-name { font-size: 11px; font-weight: 600; color: #fff; }
.achievement-require { font-size: 9px; color: rgba(255, 255, 255, 0.3); }

/* 种植模式提示 */
.farm-planting-hint {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  backdrop-filter: blur(10px);
  padding: 10px 20px;
  border-radius: 12px;
  color: #4ade80;
  font-size: 13px;
  font-weight: 600;
  z-index: 10002;
  display: flex;
  align-items: center;
  gap: 12px;
  animation: hint-slide-up 0.3s ease;
}

.hint-cancel {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  padding: 4px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

@keyframes hint-slide-up {
  0% { transform: translateX(-50%) translateY(20px); opacity: 0; }
  100% { transform: translateX(-50%) translateY(0); opacity: 1; }
}

/* Android竖屏适配 */
.platform-android.android-portrait .farm-header {
  padding-top: calc(12px + env(safe-area-inset-top)) !important;
}
.platform-android.android-portrait .farm-back-btn {
  width: 44px !important; height: 44px !important; min-width: 44px !important; min-height: 44px !important;
}
.platform-android.android-portrait .farm-title { font-size: 15px !important; }
.platform-android.android-portrait .farm-grid { max-width: 320px !important; }
.platform-android.android-portrait .farm-planting-hint {
  bottom: calc(80px + env(safe-area-inset-bottom)) !important;
  font-size: 12px !important;
}
</style>
