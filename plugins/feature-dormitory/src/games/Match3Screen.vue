<script setup>
/**
 * Match3Screen.vue - 宝石三消小游戏
 * 8×8 网格，滑动交换，连锁消除，特殊宝石，关卡系统
 */

import { ref, computed, onMounted, nextTick } from 'vue'
import Toast from '../Toast.vue'

const emit = defineEmits(['back', 'match3-result'])
const props = defineProps({
  coins: { type: Number, default: 0 },
})

// ====== 常量 ======

const GRID_SIZE = 8
const GEM_TYPES = 6

const GEMS = [
  { emoji: '💎', name: '红宝石', baseScore: 10, color: '#ff4444',  glow: 'rgba(255,68,68,0.5)' },
  { emoji: '⭐', name: '星星',   baseScore: 15, color: '#ffd700',  glow: 'rgba(255,215,0,0.5)' },
  { emoji: '🍀', name: '四叶草', baseScore: 20, color: '#22c55e',  glow: 'rgba(34,197,94,0.5)' },
  { emoji: '🍒', name: '樱桃',   baseScore: 25, color: '#e74c3c',  glow: 'rgba(231,76,60,0.5)' },
  { emoji: '🔔', name: '铃铛',   baseScore: 30, color: '#ff8c00',  glow: 'rgba(255,140,0,0.5)' },
  { emoji: '🌙', name: '月亮',   baseScore: 35, color: '#6366f1',  glow: 'rgba(99,102,241,0.5)' },
]

const MAX_MOVES = 20
const MATCH_MIN = 3

const LEVELS = [
  { level: 1, target: 500,  reward: 30,  cost: 10 },
  { level: 2, target: 800,  reward: 40,  cost: 15 },
  { level: 3, target: 1200, reward: 55,  cost: 20 },
  { level: 4, target: 1800, reward: 75,  cost: 25 },
  { level: 5, target: 2500, reward: 100, cost: 30 },
]

// ====== 状态 ======

// grid[row][col] = { type: 0-5, special: null|'row'|'col'|'rainbow', id: string }
const grid = ref([])
const isProcessing = ref(false)
const movesLeft = ref(MAX_MOVES)
const score = ref(0)
const comboMultiplier = ref(1)
let gemIdCounter = 0

function makeGem(type, special = null) {
  return { type, special, id: `gem_${++gemIdCounter}` }
}

// ====== 关卡 ======

const currentLevel = ref(1)
const levelData = computed(() => LEVELS[Math.min(currentLevel.value - 1, LEVELS.length - 1)])
const progressPercent = computed(() => Math.min(score.value / levelData.value.target * 100, 100))

// ====== 提示 ======

const hintPair = ref(null) // { r1, c1, r2, c2 }
let hintTimer = null

function findHint() {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!grid.value[r][c]) continue
      // 尝试右交换
      if (c + 1 < GRID_SIZE && grid.value[r][c + 1]) {
        swapCells(r, c, r, c + 1)
        if (findMatches().size > 0) { swapCells(r, c, r, c + 1); return { r1: r, c1: c, r2: r, c2: c + 1 } }
        swapCells(r, c, r, c + 1)
      }
      // 尝试下交换
      if (r + 1 < GRID_SIZE && grid.value[r + 1][c]) {
        swapCells(r, c, r + 1, c)
        if (findMatches().size > 0) { swapCells(r, c, r + 1, c); return { r1: r, c1: c, r2: r + 1, c2: c } }
        swapCells(r, c, r + 1, c)
      }
    }
  }
  return null
}

function showHint() {
  hintPair.value = findHint()
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => { hintPair.value = null }, 2500)
}

// ====== 网格初始化 ======

function fillGrid() {
  const newGrid = []
  for (let r = 0; r < GRID_SIZE; r++) {
    newGrid[r] = []
    for (let c = 0; c < GRID_SIZE; c++) {
      let type
      do {
        type = Math.floor(Math.random() * GEM_TYPES)
      } while (
        (c >= 2 && newGrid[r][c - 1]?.type === type && newGrid[r][c - 2]?.type === type) ||
        (r >= 2 && newGrid[r - 1]?.[c]?.type === type && newGrid[r - 2]?.[c]?.type === type)
      )
      newGrid[r][c] = makeGem(type)
    }
  }
  // 确保有可用移动
  grid.value = newGrid
  if (!findHint()) {
    shuffleGrid()
  }
}

function shuffleGrid() {
  // 重新生成一个无匹配且有可用移动的网格（不触发 cascade 计分）
  fillGrid()
}

// ====== 交换 ======

function swapCells(r1, c1, r2, c2) {
  const tmp = grid.value[r1][c1]
  grid.value[r1][c1] = grid.value[r2][c2]
  grid.value[r2][c2] = tmp
}

// ====== 匹配检测 ======

function findMatches() {
  const matched = new Map() // "r,c" -> { type, count }

  function addMatch(r, c, type, count) {
    const key = `${r},${c}`
    if (matched.has(key)) {
      matched.get(key).count += count
    } else {
      matched.set(key, { type, count })
    }
  }

  // 水平
  for (let r = 0; r < GRID_SIZE; r++) {
    let col = 0
    while (col < GRID_SIZE) {
      if (!grid.value[r][col]) { col++; continue }
      const type = grid.value[r][col].type
      let end = col
      while (end + 1 < GRID_SIZE && grid.value[r][end + 1]?.type === type) end++
      const len = end - col + 1
      if (len >= MATCH_MIN) {
        for (let c = col; c <= end; c++) addMatch(r, c, type, len)
      }
      col = end + 1
    }
  }

  // 垂直
  for (let c = 0; c < GRID_SIZE; c++) {
    let row = 0
    while (row < GRID_SIZE) {
      if (!grid.value[row][c]) { row++; continue }
      const type = grid.value[row][c].type
      let end = row
      while (end + 1 < GRID_SIZE && grid.value[end + 1]?.[c]?.type === type) end++
      const len = end - row + 1
      if (len >= MATCH_MIN) {
        for (let r = row; r <= end; r++) addMatch(r, c, type, len)
      }
      row = end + 1
    }
  }

  return matched
}

// 检测特殊宝石位置（4连/5连）
function findSpecialPositions(r, c, type, direction) {
  const positions = [{ r, c }]
  if (direction === 'h') {
    let left = c - 1
    while (left >= 0 && grid.value[r]?.[left]?.type === type) { positions.unshift({ r, c: left }); left-- }
    let right = c + 1
    while (right < GRID_SIZE && grid.value[r]?.[right]?.type === type) { positions.push({ r, c: right }); right++ }
  } else {
    let up = r - 1
    while (up >= 0 && grid.value[up]?.[c]?.type === type) { positions.unshift({ r: up, c }); up-- }
    let down = r + 1
    while (down < GRID_SIZE && grid.value[down]?.[c]?.type === type) { positions.push({ r: down, c }); down++ }
  }
  return positions
}

// ====== 消除 + 重力 + 填充 ======

async function cascade() {
  let combo = 0
  const maxCombo = 10 // 防止无限连锁

  while (true) {
    const matches = findMatches()
    if (matches.size === 0 || combo >= maxCombo) break

    combo++
    comboMultiplier.value = 1 + (combo - 1) * 0.5

    // === 检测特殊宝石生成 ===
    const specialsToCreate = [] // { r, c, type, special }
    const processedForSpecial = new Set()

    // 水平扫描
    for (let r = 0; r < GRID_SIZE; r++) {
      let col = 0
      while (col < GRID_SIZE) {
        if (!grid.value[r][col]) { col++; continue }
        const type = grid.value[r][col].type
        let end = col
        while (end + 1 < GRID_SIZE && grid.value[r][end + 1]?.type === type) end++
        const len = end - col + 1
        if (len >= 4) {
          const pos = Math.floor((col + end) / 2)
          const key = `${r},${pos}`
          if (!processedForSpecial.has(key)) {
            specialsToCreate.push({ r, c: pos, type: null, special: len >= 5 ? 'rainbow' : 'row' })
            processedForSpecial.add(key)
          }
        }
        col = end + 1
      }
    }

    // 垂直扫描
    for (let c = 0; c < GRID_SIZE; c++) {
      let row = 0
      while (row < GRID_SIZE) {
        if (!grid.value[row][c]) { row++; continue }
        const type = grid.value[row][c].type
        let end = row
        while (end + 1 < GRID_SIZE && grid.value[end + 1]?.[c]?.type === type) end++
        const len = end - row + 1
        if (len >= 4) {
          const pos = Math.floor((row + end) / 2)
          const key = `${pos},${c}`
          if (!processedForSpecial.has(key)) {
            specialsToCreate.push({ r: pos, c, type: null, special: len >= 5 ? 'rainbow' : 'col' })
            processedForSpecial.add(key)
          }
        }
        row = end + 1
      }
    }

    // === 激活特殊宝石效果 ===
    const extraClear = new Set()

    for (const [key] of matches) {
      const [r, c] = key.split(',').map(Number)
      const gem = grid.value[r]?.[c]
      if (gem?.special === 'row') {
        for (let cc = 0; cc < GRID_SIZE; cc++) extraClear.add(`${r},${cc}`)
      } else if (gem?.special === 'col') {
        for (let rr = 0; rr < GRID_SIZE; rr++) extraClear.add(`${rr},${c}`)
      } else if (gem?.special === 'rainbow') {
        // 消除所有同色
        const targetType = gem.type
        for (let rr = 0; rr < GRID_SIZE; rr++)
          for (let cc = 0; cc < GRID_SIZE; cc++)
            if (grid.value[rr]?.[cc]?.type === targetType) extraClear.add(`${rr},${cc}`)
      }
    }

    extraClear.forEach(key => matches.set(key, { type: -1, count: 3 })) // -1 = special clear

    // === 计分 ===
    let stepScore = 0
    for (const [, data] of matches) {
      if (data.type >= 0) {
        stepScore += GEMS[data.type].baseScore * data.count
      } else {
        stepScore += 15 * data.count // special clear bonus
      }
    }
    stepScore = Math.floor(stepScore * comboMultiplier.value)
    score.value += stepScore

    // === 消除动画 ===
    const matchKeys = [...matches.keys()]
    activeGems.value = new Set(matchKeys)

    await delay(200)

    // === 清除 ===
    for (const key of matchKeys) {
      const [r, c] = key.split(',').map(Number)
      grid.value[r][c] = null
    }

    // === 重力下落 ===
    for (let c = 0; c < GRID_SIZE; c++) {
      let writeRow = GRID_SIZE - 1
      for (let r = GRID_SIZE - 1; r >= 0; r--) {
        if (grid.value[r][c] !== null) {
          grid.value[writeRow][c] = grid.value[r][c]
          if (writeRow !== r) grid.value[r][c] = null
          writeRow--
        }
      }
      // 填充空位
      for (let r = writeRow; r >= 0; r--) {
        grid.value[r][c] = makeGem(Math.floor(Math.random() * GEM_TYPES))
      }
    }

    // === 创建特殊宝石 ===
    for (const sp of specialsToCreate) {
      if (grid.value[sp.r]?.[sp.c]) {
        grid.value[sp.r][sp.c] = makeGem(
          grid.value[sp.r][sp.c].type,
          sp.special
        )
      }
    }

    activeGems.value = new Set()
    await delay(150)
  }

  comboMultiplier.value = 1
}

// ====== 玩家操作 ======

const activeGems = ref(new Set())
let pointerStart = null // { r, c, x, y }

function getCellFromEvent(event) {
  const el = event.currentTarget
  const rect = el.getBoundingClientRect()
  if (!rect) return null
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  // 动态计算格子大小（包含 padding 和 gap）
  const padding = 6
  const gap = 3
  const totalSize = rect.width - padding * 2
  const cellSize = (totalSize - gap * (GRID_SIZE - 1)) / GRID_SIZE
  const col = Math.floor((x - padding) / (cellSize + gap))
  const row = Math.floor((y - padding) / (cellSize + gap))
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null
  return { row, col }
}

function handlePointerDown(event) {
  if (isProcessing.value) return
  const cell = getCellFromEvent(event)
  if (!cell) return
  pointerStart = { ...cell, x: event.clientX, y: event.clientY }
}

async function handlePointerUp(event) {
  if (isProcessing.value || !pointerStart) return

  const dx = event.clientX - pointerStart.x
  const dy = event.clientY - pointerStart.y
  const dist = Math.sqrt(dx * dx + dy * dy)

  // 点击（距离太短）
  if (dist < 15) {
    pointerStart = null
    return
  }

  const { row: r1, col: c1 } = pointerStart
  let r2 = r1, c2 = c1

  if (Math.abs(dx) > Math.abs(dy)) {
    c2 += dx > 0 ? 1 : -1
  } else {
    r2 += dy > 0 ? 1 : -1
  }

  pointerStart = null

  // 边界检查
  if (r2 < 0 || r2 >= GRID_SIZE || c2 < 0 || c2 >= GRID_SIZE) return
  if (!grid.value[r1][c1] || !grid.value[r2][c2]) return

  // === 执行交换 ===
  isProcessing.value = true

  // 彩虹球特殊交换
  const gem1 = grid.value[r1][c1]
  const gem2 = grid.value[r2][c2]

  if (gem1.special === 'rainbow' || gem2.special === 'rainbow') {
    // 彩虹球交换：消除所有同色
    const rainbowGem = gem1.special === 'rainbow' ? gem1 : gem2
    const otherGem = gem1.special === 'rainbow' ? gem2 : gem1

    if (otherGem.special === 'rainbow') {
      // 彩虹+彩虹 → 全场清除
      isProcessing.value = false
      // 简单处理：清掉所有
      for (let r = 0; r < GRID_SIZE; r++)
        for (let c = 0; c < GRID_SIZE; c++)
          activeGems.value.add(`${r},${c}`)
      await delay(300)
      for (let r = 0; r < GRID_SIZE; r++)
        for (let c = 0; c < GRID_SIZE; c++)
          grid.value[r][c] = null
      score.value += 500
      await delay(200)
      for (let r = 0; r < GRID_SIZE; r++)
        for (let c = 0; c < GRID_SIZE; c++)
          grid.value[r][c] = makeGem(Math.floor(Math.random() * GEM_TYPES))
      activeGems.value = new Set()
      isProcessing.value = false
      return
    }

    const targetType = otherGem.type
    const cleared = new Set()
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++)
        if (grid.value[r]?.[c]?.type === targetType) cleared.add(`${r},${c}`)
    cleared.add(`${r1},${c1}`)
    cleared.add(`${r2},${c2}`)

    isProcessing.value = false
    activeGems.value = cleared
    await delay(250)
    score.value += cleared.size * 20
    for (const key of cleared) {
      const [r, c] = key.split(',').map(Number)
      grid.value[r][c] = null
    }
    // 重力
    for (let c = 0; c < GRID_SIZE; c++) {
      let writeRow = GRID_SIZE - 1
      for (let r = GRID_SIZE - 1; r >= 0; r--) {
        if (grid.value[r][c] !== null) {
          grid.value[writeRow][c] = grid.value[r][c]
          if (writeRow !== r) grid.value[r][c] = null
          writeRow--
        }
      }
      for (let r = writeRow; r >= 0; r--) {
        grid.value[r][c] = makeGem(Math.floor(Math.random() * GEM_TYPES))
      }
    }
    activeGems.value = new Set()
    isProcessing.value = false
    return
  }

  // 普通交换
  swapCells(r1, c1, r2, c2)
  activeGems.value = new Set([`${r1},${c1}`, `${r2},${c2}`])
  await delay(150)

  const matches = findMatches()
  if (matches.size === 0) {
    // 交换回去
    swapCells(r1, c1, r2, c2)
    activeGems.value = new Set([`${r1},${c1}`, `${r2},${c2}`])
    await delay(150)
    activeGems.value = new Set()
    isProcessing.value = false
    return
  }

  // 有效交换
  movesLeft.value--
  activeGems.value = new Set()
  await cascade()
  activeGems.value = new Set()
  isProcessing.value = false

  // 检查关卡
  if (score.value >= levelData.value.target) {
    handleLevelComplete()
    return
  }

  // 检查步数
  if (movesLeft.value <= 0) {
    handleGameOver()
    return
  }

  // 检查死局
  if (!findHint()) {
    showToast('无可用交换，自动重排！', 'warning')
    await delay(500)
    shuffleGrid()
  }
}

// ====== 关卡结算 ======

function handleLevelComplete() {
  const reward = levelData.value.reward
  emit('match3-result', { cost: 0, earned: reward })
  showToast(`过关！+${reward}💰`, 'success')
  currentLevel.value = Math.min(currentLevel.value + 1, LEVELS.length)
  movesLeft.value = MAX_MOVES
  score.value = 0
  setTimeout(() => {
    fillGrid()
  }, 1000)
}

function handleGameOver() {
  showToast(`步数用完！目标 ${levelData.value.target}，得分 ${score.value}`, 'error')
  // 重新开始当前关卡
  movesLeft.value = MAX_MOVES
  score.value = 0
  setTimeout(() => {
    fillGrid()
  }, 1500)
}

// ====== 工具 ======

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ====== Toast ======

const toastMessage = ref('')
const toastType = ref('success')
const toastVisible = ref(false)
let toastKey = 0

function showToast(msg, type = 'success') {
  toastKey++
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
  setTimeout(() => { toastVisible.value = false }, 3500)
}

// ====== 辅助操作 ======

function handleHint() {
  showHint()
}

async function handleReshuffle() {
  if (isProcessing.value) return
  isProcessing.value = true
  showToast('重排中...', 'info')
  await delay(300)
  // 动画：全部缩小
  for (let r = 0; r < GRID_SIZE; r++)
    for (let c = 0; c < GRID_SIZE; c++)
      activeGems.value.add(`${r},${c}`)
  await delay(200)
  shuffleGrid()
  await delay(400)
  activeGems.value = new Set()
  isProcessing.value = false
}

// ====== 初始化 ======

onMounted(async () => {
  fillGrid()
})
</script>

<template>
  <div class="match3-screen">
    <!-- Header -->
    <header class="match3-header">
      <button type="button" class="match3-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="match3-title">💎 宝石消除</h2>
      <div class="match3-coin-box">
        <span class="match3-coin-icon">💰</span>
        <span class="match3-coin-value">{{ coins }}</span>
      </div>
    </header>

    <!-- 状态栏 -->
    <div class="match3-status">
      <div class="status-item status-level">
        <span class="status-label">关卡</span>
        <span class="status-value">Lv.{{ currentLevel }}</span>
      </div>
      <div class="status-item status-target">
        <span class="status-label">目标</span>
        <span class="status-value">{{ levelData.target }}</span>
      </div>
      <div class="status-item status-score">
        <span class="status-label">得分</span>
        <span class="status-value score-glow">{{ score }}</span>
      </div>
      <div class="status-item status-moves">
        <span class="status-label">步数</span>
        <span class="status-value" :class="{ 'moves-danger': movesLeft <= 5 }">{{ movesLeft }}</span>
      </div>
    </div>

    <!-- 进度条 -->
    <div class="match3-progress">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>
      <span class="progress-label">{{ score }} / {{ levelData.target }}</span>
    </div>

    <!-- 连锁提示 -->
    <Transition name="combo-fade">
      <div v-if="comboMultiplier > 1" class="combo-display">
        <span class="combo-text">{{ comboMultiplier.toFixed(1) }}x Combo!</span>
      </div>
    </Transition>

    <!-- 主体 -->
    <main class="match3-body">
      <!-- 网格 -->
      <section class="match3-grid" @pointerdown="handlePointerDown" @pointerup="handlePointerUp">
        <template v-for="row in GRID_SIZE" :key="'row-' + row">
          <template v-for="col in GRID_SIZE" :key="'cell-' + row + '-' + col">
            <div
              class="gem-cell"
              :class="{
                'gem-active': activeGems.has(`${row-1},${col-1}`),
                'gem-hint': hintPair && ((hintPair.r1 === row-1 && hintPair.c1 === col-1) || (hintPair.r2 === row-1 && hintPair.c2 === col-1)),
                'gem-special': grid[row-1]?.[col-1]?.special,
              }"
              :style="{
                '--gem-color': grid[row-1]?.[col-1] ? GEMS[grid[row-1][col-1].type]?.color : 'transparent',
                '--gem-glow': grid[row-1]?.[col-1] ? GEMS[grid[row-1][col-1].type]?.glow : 'transparent',
              }"
            >
              <span v-if="grid[row-1]?.[col-1]" class="gem-emoji">
                {{ GEMS[grid[row-1][col-1].type].emoji }}
              </span>
              <span v-if="grid[row-1]?.[col-1]?.special === 'row'" class="gem-special-badge">↔</span>
              <span v-if="grid[row-1]?.[col-1]?.special === 'col'" class="gem-special-badge">↕</span>
              <span v-if="grid[row-1]?.[col-1]?.special === 'rainbow'" class="gem-special-badge rainbow-badge">🌈</span>
            </div>
          </template>
        </template>
      </section>

      <!-- 辅助按钮 -->
      <div class="match3-actions">
        <button type="button" class="action-btn" @click="handleHint" :disabled="isProcessing">
          💡 提示
        </button>
        <button type="button" class="action-btn" @click="handleReshuffle" :disabled="isProcessing">
          🔀 重排
        </button>
      </div>
    </main>

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
          :on-close="() => { toastVisible.value = false }"
        />
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.match3-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, #0f0a1e 0%, #1a0a2e 40%, #0f1a2e 100%);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.match3-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 215, 0, 0.1);
  gap: 10px;
}

.match3-back-btn {
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
.match3-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

.match3-title {
  flex: 1;
  text-align: center;
  margin: 0;
  color: #ffd700;
  font-size: 17px;
  font-weight: 600;
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
}

.match3-coin-box {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 10px;
  padding: 6px 12px;
}
.match3-coin-value { color: #ffd700; font-size: 15px; font-weight: 700; min-width: 30px; text-align: right; }

/* Status bar */
.match3-status {
  display: flex;
  justify-content: space-around;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
}

.status-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.status-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}

.status-value {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.score-glow {
  color: #ffd700;
  text-shadow: 0 0 8px rgba(255, 215, 0, 0.4);
}

.moves-danger {
  color: #ef4444 !important;
  animation: danger-pulse 0.8s ease infinite;
}

@keyframes danger-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Progress */
.match3-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ffd700, #ff8c00);
  border-radius: 4px;
  transition: width 0.4s ease;
}

.progress-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 600;
  min-width: 80px;
  text-align: right;
}

/* Combo */
.combo-display {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  pointer-events: none;
}

.combo-text {
  font-size: 36px;
  font-weight: 900;
  color: #ffd700;
  text-shadow:
    0 0 20px rgba(255, 215, 0, 0.6),
    0 0 40px rgba(255, 215, 0, 0.3),
    2px 2px 0 #ff8c00;
  animation: combo-pop 0.4s ease;
}

@keyframes combo-pop {
  0% { transform: scale(0.5); opacity: 0; }
  60% { transform: scale(1.3); }
  100% { transform: scale(1); opacity: 1; }
}

/* Body */
.match3-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px;
  position: relative;
  overflow: hidden;
}

/* Grid */
.match3-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 3px;
  background: rgba(0, 0, 0, 0.3);
  border: 2px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 6px;
  touch-action: none;
  user-select: none;
  width: min(calc(100vw - 32px), 400px);
  height: min(calc(100vw - 32px), 400px);
}

.gem-cell {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  position: relative;
  transition: all 0.15s ease;
  overflow: visible;
}

.gem-emoji {
  font-size: clamp(16px, 5vw, 24px);
  line-height: 1;
  transition: all 0.2s ease;
}

/* 消除动画 */
.gem-cell.gem-active {
  animation: gem-pop 0.2s ease forwards;
}

@keyframes gem-pop {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.8; }
  100% { transform: scale(0); opacity: 0; }
}

/* 提示高亮 */
.gem-cell.gem-hint {
  background: rgba(255, 215, 0, 0.12);
  border: 2px solid rgba(255, 215, 0, 0.4);
  animation: hint-blink 0.6s ease 3;
}

@keyframes hint-blink {
  0%, 100% { box-shadow: none; }
  50% { box-shadow: 0 0 12px rgba(255, 215, 0, 0.4); }
}

/* 特殊宝石 */
.gem-cell.gem-special::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 10px;
  border: 2px solid var(--gem-color);
  box-shadow: 0 0 8px var(--gem-glow);
  animation: special-glow 1.5s ease infinite;
}

@keyframes special-glow {
  0%, 100% { box-shadow: 0 0 6px var(--gem-glow); }
  50% { box-shadow: 0 0 16px var(--gem-glow), 0 0 24px var(--gem-glow); }
}

.gem-special-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  font-size: 10px;
  font-weight: 900;
  color: #ffd700;
  text-shadow: 0 0 4px rgba(255, 215, 0, 0.6);
  z-index: 2;
}

.rainbow-badge {
  font-size: 12px;
  top: -6px;
  right: -6px;
}

/* Actions */
.match3-actions {
  display: flex;
  gap: 10px;
}

.action-btn {
  padding: 8px 20px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.action-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08); color: #fff; }
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .platform-android.android-portrait .action-btn {
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
/* Transitions */
.combo-fade-enter-active,
.combo-fade-leave-active {
  transition: all 0.3s ease;
}
.combo-fade-enter-from,
.combo-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.8);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.3s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Android竖屏适配 */
.platform-android.android-portrait .match3-header {
  padding-top: calc(12px + env(safe-area-inset-top)) !important;
}
.platform-android.android-portrait .match3-back-btn {
  width: 44px !important; height: 44px !important; min-width: 44px !important; min-height: 44px !important;
}
.platform-android.android-portrait .match3-title { font-size: 15px !important; }
.platform-android.android-portrait .match3-grid {
  width: calc(100vw - 24px) !important;
  height: calc(100vw - 24px) !important;
}
.platform-android.android-portrait .gem-emoji {
  font-size: clamp(14px, 5.5vw, 22px) !important;
}
</style>
