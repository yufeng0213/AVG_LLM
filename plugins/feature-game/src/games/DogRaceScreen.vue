<script setup>
/**
 * DogRaceScreen.vue - 赛小狗
 * 4只小狗赛跑，赛前下注猜冠军，猜中赢金币
 * Canvas 动画 + 随机跑姿 + 随机事件
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import Toast from '../Toast.vue'
import GameSkinSelector from '../components/GameSkinSelector.vue'
import { useGameSkin } from '../composables/useGameSkin'
import { useGameAudio } from '../composables/useGameAudio.js'

const emit = defineEmits(['back', 'dograce-result', 'game-skin-buy'])
const props = defineProps({
  coins: { type: Number, default: 0 },
})

const GAME_KEY = 'dogRace'

// ====== 皮肤系统 ======
const {
  skins: dogSkins,
  activeSkin: dogActiveSkin,
  ownedSkinList: dogOwnedSkins,
  selectSkin: dogSelectSkin,
  buySkin: dogBuySkin,
} = useGameSkin(GAME_KEY)

const showSkinSelector = ref(false)
const audio = useGameAudio()

function handleDogSkinBuy({ skinId, price }) {
  const result = dogBuySkin(skinId, props.coins)
  if (result.success) {
    emit('game-skin-buy', { gameKey: GAME_KEY, cost: price })
    showToast(`🎨 主题已解锁：${dogSkins.find(s => s.id === skinId)?.name}`, 'success')
  } else if (result.notEnoughCoins) {
    showToast('金币不足！', 'warning')
  }
}

// 皮肤主题样式
const dogThemeStyle = computed(() => {
  const theme = dogActiveSkin.value.theme || {}
  return {
    '--dog-screen-bg': theme.screenBg || 'linear-gradient(180deg, #1a2e0a 0%, #0a1e0a 50%, #0a1a1e 100%)',
    '--dog-track-bg': theme.trackBg || '#2d5a1e',
    '--dog-lane-alt': theme.laneAlt || 'rgba(55, 110, 40, 0.3)',
    '--dog-lane-base': theme.laneBase || 'rgba(45, 90, 30, 0.3)',
    '--dog-finish-line': theme.finishLine || '#ffffff',
    '--dog-start-line': theme.startLine || '#ffffff',
    '--dog-flag': theme.flagColor || '#ff4444',
    '--dog-header-text': theme.headerText || '#8bc34a',
    '--dog-header-border': theme.headerBorder || 'rgba(139, 195, 74, 0.15)',
  }
})

// Canvas 颜色
let _dogTheme = null
watch(dogActiveSkin, (skin) => {
  if (!skin || !skin.theme) return
  _dogTheme = skin.theme
  // 重新渲染空闲画面
  if (ctx && raceState.value === 'betting') renderIdle()
}, { immediate: false })

// ====== 常量 ======
const CANVAS_WIDTH = 400
const CANVAS_HEIGHT = 340
const LANE_COUNT = 4
const LANE_HEIGHT = CANVAS_HEIGHT / LANE_COUNT
const FINISH_X = CANVAS_WIDTH - 50
const START_X = 40

const BET_OPTIONS = [10, 20, 50, 100]
const STORAGE_KEY = 'avg_llm_dog_race_state_v1'

const DOG_NAMES = ['小白', '小黑', '小黄', '小花', '小红', '小灰', '小棕', '小橘']
const DOG_EMOJIS = ['🐕', '🐕‍🦺', '🦮', '🐩']

const RUNNING_STYLES = [
  { id: 'steady',    name: '匀速型',     emoji: '🏃', baseSpeed: 1.0, variance: 0.15, dashChance: 0.02, slipChance: 0.06, lazyChance: 0.04, burstChance: 0.03 },
  { id: 'sprinter',  name: '冲刺型',     emoji: '💨', baseSpeed: 0.8, variance: 0.3,  dashChance: 0.10, slipChance: 0.05, lazyChance: 0.06, burstChance: 0.04 },
  { id: 'erratic',   name: '忽快忽慢型', emoji: '🎢', baseSpeed: 1.0, variance: 0.6,  dashChance: 0.08, slipChance: 0.08, lazyChance: 0.08, burstChance: 0.03 },
  { id: 'burst',     name: '爆发型',     emoji: '⚡', baseSpeed: 0.85,variance: 0.2,  dashChance: 0.04, slipChance: 0.06, lazyChance: 0.05, burstChance: 0.10 },
  { id: 'lazy',      name: '懒惰型',     emoji: '💤', baseSpeed: 0.9, variance: 0.25, dashChance: 0.03, slipChance: 0.07, lazyChance: 0.12, burstChance: 0.06 },
  { id: 'turtle',    name: '龟速型',     emoji: '🐢', baseSpeed: 0.85,variance: 0.08, dashChance: 0.02, slipChance: 0.03, lazyChance: 0.03, burstChance: 0.02 },
  { id: 'nervous',   name: '神经质型',   emoji: '😵', baseSpeed: 1.0, variance: 0.5,  dashChance: 0.12, slipChance: 0.12, lazyChance: 0.10, burstChance: 0.06 },
]

const EVENT_EMOJIS = { dash: '⚡', slip: '🎲', lazy: '💤', burst: '🌟' }

const FREE_WIN_AMOUNT = 50

// ====== 状态 ======
const canvasRef = ref(null)
let ctx = null
let animFrame = null

// 比赛状态
const raceState = ref('betting') // betting | countdown | racing | finished
const countdownValue = ref(3)

// 投注状态
const selectedBetAmount = ref(10)
const selectedDogIndex = ref(-1)

// Toast
const toastMessage = ref('')
const toastType = ref('success')
const toastVisible = ref(false)

// 4只狗
const dogs = ref([])

// 统计
const stats = ref({
  totalRaces: 0,
  totalWins: 0,
  totalEarned: 0,
  consecutiveWins: 0,
  consecutiveLosses: 0,
  dogRecords: {},
  lastFreeRaceDate: null,
  achievements: [],
})

// 比赛事件气泡
let eventBubbles = [] // { dogIndex, emoji, x, y, alpha, life }

// ====== 计算属性 ======
const winRate = computed(() => {
  if (stats.value.totalRaces === 0) return '-'
  return Math.round(stats.value.totalWins / stats.value.totalRaces * 100) + '%'
})

const canUseFreeRace = computed(() => {
  const today = new Date().toDateString()
  return stats.value.lastFreeRaceDate !== today
})

const currentMultiplier = computed(() => {
  let mult = dogs.value[selectedDogIndex.value]?.odds || 1
  // 连胜奖励
  if (stats.value.consecutiveWins >= 3) mult *= 1.5
  // 连败保护
  if (stats.value.consecutiveLosses >= 5) mult *= 2
  return Math.round(mult * 10) / 10
})

// ====== 狗初始化 ======
function initDogs() {
  // 随机选4个名字
  const shuffled = [...DOG_NAMES].sort(() => Math.random() - 0.5)
  const names = shuffled.slice(0, LANE_COUNT)
  // 随机分配跑姿（可重复）
  const styles = names.map(() => RUNNING_STYLES[Math.floor(Math.random() * RUNNING_STYLES.length)])

  dogs.value = names.map((name, i) => ({
    name,
    emoji: DOG_EMOJIS[i],
    color: ['#ffffff', '#333333', '#fbbf24', '#f97316'][i],
    x: START_X,
    y: i * LANE_HEIGHT + LANE_HEIGHT / 2,
    style: styles[i],
    speed: 0,
    progress: 0,
    finished: false,
    finishTime: 0,
    rank: 0,
    currentEffect: null, // 'dash' | 'slip' | 'lazy' | 'burst'
    effectTimer: 0,
    bobPhase: Math.random() * Math.PI * 2,
    bobSpeed: 3 + Math.random() * 2,
    scale: 1,
    odds: 1.5 + Math.random() * 3, // 初始赔率 1.5~4.5
  }))

  // 调整赔率使总和接近 4（庄家优势）
  normalizeOdds()
}

function normalizeOdds() {
  // 根据历史记录调整赔率
  const records = stats.value.dogRecords
  for (const dog of dogs.value) {
    const rec = records[dog.name]
    if (rec && rec.races > 3) {
      const winRate = rec.wins / rec.races
      // 胜率高的狗赔率降低
      if (winRate > 0.4) dog.odds = Math.max(1.2, dog.odds * 0.8)
      // 胜率低的狗赔率升高
      if (winRate < 0.15) dog.odds = Math.min(8.0, dog.odds * 1.3)
    }
  }
  // 归一化确保庄家优势
  const sum = dogs.value.reduce((s, d) => s + 1 / d.odds, 0)
  const target = 1.08 // 8% 庄家优势
  if (sum !== target) {
    const factor = sum / target
    for (const dog of dogs.value) {
      dog.odds = Math.max(1.2, Math.min(10, dog.odds * factor))
    }
  }
  // 取整
  for (const dog of dogs.value) {
    dog.odds = Math.round(dog.odds * 10) / 10
  }
}

// ====== 持久化 ======
function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      stats.value = { ...stats.value, ...parsed }
    }
  } catch (e) {
    console.warn('Dog race stats load failed:', e)
  }
}

function saveStats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats.value))
  } catch (e) {
    console.warn('Dog race stats save failed:', e)
  }
}

// ====== 投注 ======
function selectDog(index) {
  if (raceState.value !== 'betting') return
  selectedDogIndex.value = index
}

function selectBet(amount) {
  if (raceState.value !== 'betting') return
  selectedBetAmount.value = amount
}

// ====== 比赛 ======
function startRace() {
  if (raceState.value !== 'betting') return

  const isFree = canUseFreeRace.value && selectedBetAmount.value === 0
  const cost = isFree ? 0 : selectedBetAmount.value

  if (selectedDogIndex.value < 0) {
    showToast('请先选择一只小狗！', 'warning')
    return
  }
  if (!isFree && props.coins < cost) {
    showToast('金币不足！', 'error')
    return
  }

  // 扣费
  if (cost > 0) {
    emit('dograce-result', { cost, earned: 0 })
  }

  // 初始化狗
  initDogs()
  // 重新设置选中的狗（因为initDogs重置了数组）
  // selectedDogIndex 指向索引，不需要改

  eventBubbles = []
  raceState.value = 'countdown'
  countdownValue.value = 3

  // 倒计时
  setTimeout(() => { countdownValue.value = 2 }, 800)
  setTimeout(() => { countdownValue.value = 1 }, 1600)
  setTimeout(() => { countdownValue.value = 0; beginRunning() }, 2400)
}

function beginRunning() {
  raceState.value = 'racing'
  let raceStartTime = Date.now()
  let finishOrder = 0
  audio.playSFX('race_start')

  function gameLoop() {
    const now = Date.now()
    const dt = Math.min((now - raceStartTime) / 16.67, 3) // 帧数归一化
    raceStartTime = now

    let allFinished = true

    for (let i = 0; i < LANE_COUNT; i++) {
      const dog = dogs.value[i]
      if (dog.finished) continue
      allFinished = false

      // 跑姿基础速度
      let speed = dog.style.baseSpeed

      // 随机波动
      speed += (Math.random() - 0.5) * 2 * dog.style.variance

      // 事件判定
      if (dog.effectTimer > 0) {
        dog.effectTimer -= dt
        if (dog.currentEffect === 'dash') speed *= 1.8
        else if (dog.currentEffect === 'slip') speed *= 0
        else if (dog.currentEffect === 'lazy') speed *= 0.5
        else if (dog.currentEffect === 'burst') speed *= 2.5
      } else {
        dog.currentEffect = null
        // 检查随机事件
        const r = Math.random()
        if (r < dog.style.burstChance) {
          dog.currentEffect = 'burst'
          dog.effectTimer = 90 // ~1.5s
          addEventBubble(i, 'burst')
        } else if (r < dog.style.burstChance + dog.style.dashChance) {
          dog.currentEffect = 'dash'
          dog.effectTimer = 60 // ~1s
          addEventBubble(i, 'dash')
        } else if (r < dog.style.burstChance + dog.style.dashChance + dog.style.slipChance) {
          dog.currentEffect = 'slip'
          dog.effectTimer = 30 // ~0.5s
          addEventBubble(i, 'slip')
        } else if (r < dog.style.burstChance + dog.style.dashChance + dog.style.slipChance + dog.style.lazyChance) {
          dog.currentEffect = 'lazy'
          dog.effectTimer = 60
          addEventBubble(i, 'lazy')
        }
      }

      // 后半程冲刺型加成
      if (dog.style.id === 'sprinter' && dog.progress > 0.5) {
        speed *= 1.3
      }

      speed = Math.max(0.1, speed)
      dog.speed = speed

      // 更新位置
      const distance = (CANVAS_WIDTH - START_X - 60) * 0.008 * speed * dt
      dog.progress += distance
      dog.x = START_X + dog.progress

      // 弹跳动画
      dog.bobPhase += dog.bobSpeed * dt * 0.05
      dog.scale = 1 + Math.sin(dog.bobPhase) * 0.08

      // 检查到达终点
      if (dog.x >= FINISH_X) {
        dog.finished = true
        dog.finishTime = Date.now()
        dog.rank = ++finishOrder
        dog.x = FINISH_X
      }
    }

    // 更新气泡
    updateEventBubbles(dt)

    // 渲染
    render()

    if (!allFinished) {
      animFrame = requestAnimationFrame(gameLoop)
    } else {
      finishRace()
    }
  }

  animFrame = requestAnimationFrame(gameLoop)
}

function finishRace() {
  raceState.value = 'finished'
  audio.playSFX('race_finish')

  // 排序
  const sorted = [...dogs.value].sort((a, b) => a.finishTime - b.finishTime)
  for (let i = 0; i < LANE_COUNT; i++) {
    sorted[i].rank = i + 1
  }

  const winner = sorted[0]
  const winnerIndex = dogs.value.indexOf(winner)
  const won = selectedDogIndex.value === winnerIndex
  const isFree = canUseFreeRace.value && selectedBetAmount.value === 0

  // 更新记录
  for (const dog of dogs.value) {
    if (!stats.value.dogRecords[dog.name]) {
      stats.value.dogRecords[dog.name] = { wins: 0, races: 0 }
    }
    stats.value.dogRecords[dog.name].races++
    if (dog.rank === 1) stats.value.dogRecords[dog.name].wins++
  }

  stats.value.totalRaces++

  let earned = 0
  if (won) {
    if (isFree) {
      earned = FREE_WIN_AMOUNT
    } else {
      earned = Math.round(selectedBetAmount.value * currentMultiplier.value)
    }
    stats.value.totalWins++
    stats.value.consecutiveWins++
    stats.value.consecutiveLosses = 0
  } else {
    stats.value.consecutiveLosses++
    stats.value.consecutiveWins = 0
  }
  stats.value.totalEarned += earned

  // 成就检查
  const achievements = [
    { id: 'guess_20', count: 20, label: '狗语者·初' },
    { id: 'guess_50', count: 50, label: '狗语者·熟' },
    { id: 'guess_100', count: 100, label: '狗语者·精' },
  ]
  for (const ach of achievements) {
    if (stats.value.totalWins >= ach.count && !stats.value.achievements.includes(ach.id)) {
      stats.value.achievements.push(ach.id)
      setTimeout(() => showToast(`🏆 成就解锁：${ach.label}！`, 'success'), 1500)
    }
  }

  if (isFree) {
    stats.value.lastFreeRaceDate = new Date().toDateString()
  }

  saveStats()

  // 结果反馈
  const winText = won ? `🎉 猜中了！${winner.emoji} ${winner.name} 夺冠！` : `😢 猜错了...冠军是 ${winner.emoji} ${winner.name}`
  const earnedText = earned > 0 ? ` +${earned} 💰` : ''
  const streakText = stats.value.consecutiveWins >= 3 ? ` 🔥连胜×${stats.value.consecutiveWins}` : ''
  showToast(`${winText}${earnedText}${streakText}`, won ? 'success' : 'warning')

  if (earned > 0) {
    emit('dograce-result', { cost: 0, earned })
  }
}

// ====== 事件气泡 ======
function addEventBubble(dogIndex, type) {
  const dog = dogs.value[dogIndex]
  eventBubbles.push({
    dogIndex,
    emoji: EVENT_EMOJIS[type],
    x: dog.x,
    y: dog.y - 20,
    alpha: 1,
    life: 60,
  })
}

function updateEventBubbles(dt) {
  for (let i = eventBubbles.length - 1; i >= 0; i--) {
    const b = eventBubbles[i]
    b.life -= dt
    b.y -= 0.5 * dt
    b.alpha = Math.max(0, b.life / 60)
    if (b.life <= 0) eventBubbles.splice(i, 1)
  }
}

// ====== 渲染 ======
function render() {
  if (!ctx) return

  // 草坪背景
  const theme = _dogTheme
  ctx.fillStyle = theme ? theme.trackBg : '#2d5a1e'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // 跑道线
  for (let i = 1; i < LANE_COUNT; i++) {
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([8, 6])
    ctx.beginPath()
    ctx.moveTo(0, i * LANE_HEIGHT)
    ctx.lineTo(CANVAS_WIDTH, i * LANE_HEIGHT)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 起跑线
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(START_X, 0)
  ctx.lineTo(START_X, CANVAS_HEIGHT)
  ctx.stroke()

  // 终点线
  ctx.fillStyle = theme ? theme.finishLine : '#ffffff'
  ctx.fillRect(FINISH_X - 2, 0, 4, CANVAS_HEIGHT)
  // 终点旗
  ctx.fillStyle = theme ? theme.flagColor : '#ff4444'
  ctx.beginPath()
  ctx.moveTo(FINISH_X, 2)
  ctx.lineTo(FINISH_X + 18, 8)
  ctx.lineTo(FINISH_X, 14)
  ctx.fill()
  ctx.strokeStyle = '#888'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(FINISH_X, 2)
  ctx.lineTo(FINISH_X, 20)
  ctx.stroke()

  // FINISH 文字
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.font = 'bold 10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('FINISH', FINISH_X, CANVAS_HEIGHT - 2)

  // 渲染每只狗
  for (let i = 0; i < LANE_COUNT; i++) {
    const dog = dogs.value[i]
    const laneY = i * LANE_HEIGHT + LANE_HEIGHT / 2

    // 跑道底色
    const laneColor = i % 2 === 0
      ? (theme ? theme.laneBase : 'rgba(45, 90, 30, 0.3)')
      : (theme ? theme.laneAlt : 'rgba(55, 110, 40, 0.3)')
    ctx.fillStyle = laneColor
    ctx.fillRect(0, i * LANE_HEIGHT, CANVAS_WIDTH, LANE_HEIGHT)

    // 进度条（赛道上的轨迹）
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(START_X, laneY - 2, dog.x - START_X, 4)

    // 小狗 emoji
    ctx.save()
    ctx.translate(dog.x, laneY)
    ctx.scale(dog.scale, dog.scale)

    // 效果发光
    if (dog.currentEffect === 'burst') {
      ctx.shadowColor = '#ffd700'
      ctx.shadowBlur = 20
    } else if (dog.currentEffect === 'dash') {
      ctx.shadowColor = '#00ffff'
      ctx.shadowBlur = 12
    }

    ctx.font = '24px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(dog.emoji, 0, 0)
    ctx.shadowBlur = 0

    // 名字标签
    ctx.font = 'bold 9px sans-serif'
    ctx.fillStyle = dog.color === '#333333' ? '#cccccc' : dog.color
    ctx.textBaseline = 'bottom'
    ctx.fillText(dog.name, 0, -14)

    // 跑姿标签（仅在投注阶段）
    if (raceState.value === 'betting') {
      ctx.font = '8px sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.textBaseline = 'top'
      ctx.fillText(dog.style.emoji + dog.style.name, 0, 12)
    }

    // 排名（完成时）
    if (dog.finished) {
      ctx.font = 'bold 12px sans-serif'
      ctx.fillStyle = dog.rank === 1 ? '#ffd700' : dog.rank === 2 ? '#c0c0c0' : dog.rank === 3 ? '#cd7f32' : '#888'
      ctx.textBaseline = 'top'
      ctx.fillText(`#${dog.rank}`, 0, 14)
    }

    ctx.restore()

    // 选中高亮
    if (selectedDogIndex.value === i && raceState.value === 'betting') {
      ctx.strokeStyle = theme ? theme.headerText : '#ffd700'
      ctx.lineWidth = 2
      ctx.strokeRect(4, i * LANE_HEIGHT + 2, CANVAS_WIDTH - 8, LANE_HEIGHT - 4)
    }
  }

  // 事件气泡
  for (const b of eventBubbles) {
    ctx.globalAlpha = b.alpha
    ctx.font = '16px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(b.emoji, b.x, b.y)
    ctx.globalAlpha = 1
  }
}

// ====== 空闲渲染 ======
function renderIdle() {
  if (!ctx) return
  const theme = _dogTheme
  ctx.fillStyle = theme ? theme.trackBg : '#2d5a1e'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  for (let i = 0; i < LANE_COUNT; i++) {
    const laneColor = i % 2 === 0
      ? (theme ? theme.laneBase : 'rgba(45, 90, 30, 0.3)')
      : (theme ? theme.laneAlt : 'rgba(55, 110, 40, 0.3)')
    ctx.fillStyle = laneColor
    ctx.fillRect(0, i * LANE_HEIGHT, CANVAS_WIDTH, LANE_HEIGHT)

    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([8, 6])
    ctx.beginPath()
    ctx.moveTo(0, (i + 1) * LANE_HEIGHT)
    ctx.lineTo(CANVAS_WIDTH, (i + 1) * LANE_HEIGHT)
    ctx.stroke()
    ctx.setLineDash([])

    // 起跑线
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(START_X, i * LANE_HEIGHT)
    ctx.lineTo(START_X, (i + 1) * LANE_HEIGHT)
    ctx.stroke()

    // 终点
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(FINISH_X - 2, i * LANE_HEIGHT, 4, LANE_HEIGHT)

    // 待机小狗
    ctx.font = '24px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(DOG_EMOJIS[i], START_X + 20, i * LANE_HEIGHT + LANE_HEIGHT / 2)
  }

  // 终点旗
  ctx.fillStyle = theme ? theme.flagColor : '#ff4444'
  ctx.beginPath()
  ctx.moveTo(FINISH_X, 2)
  ctx.lineTo(FINISH_X + 18, 8)
  ctx.lineTo(FINISH_X, 14)
  ctx.fill()

  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.font = 'bold 10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('FINISH', FINISH_X, CANVAS_HEIGHT - 2)

  // 提示文字
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '12px sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText('选择小狗并下注，然后点击开始！', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2)
}

// ====== Canvas 事件 ======
function handleCanvasClick(e) {
  if (raceState.value !== 'betting') return
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const scaleY = CANVAS_HEIGHT / rect.height
  const y = (e.clientY - rect.top) * scaleY
  const laneIndex = Math.floor(y / LANE_HEIGHT)
  if (laneIndex >= 0 && laneIndex < LANE_COUNT) {
    selectDog(laneIndex)
  }
}

// ====== 工具 ======
function showToast(msg, type = 'success') {
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
}

// ====== 初始化 ======
onMounted(() => {
  const canvas = canvasRef.value
  if (canvas) {
    ctx = canvas.getContext('2d')
  }
  loadStats()
  initDogs()
  renderIdle()
})

onUnmounted(() => {
  if (animFrame) cancelAnimationFrame(animFrame)
})

defineExpose({ saveStats })
</script>

<template>
  <div class="dograce-screen" :style="dogThemeStyle">
    <!-- Header -->
    <header class="dograce-header">
      <button type="button" class="dograce-back-btn" @click="audio.playSFX('back'); emit('back')">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="dograce-title">🐕 赛小狗</h2>
      <div class="dograce-coin-box">
        <span class="dograce-coin-icon">💰</span>
        <span class="dograce-coin-value">{{ coins }}</span>
      </div>
      <button type="button" class="dograce-theme-btn" @click="showSkinSelector = true">
        🎨 主题
      </button>
    </header>

    <!-- 统计栏 -->
    <div class="dograce-stats-bar">
      <span class="stat-text">📊 胜率: {{ winRate }}</span>
      <span class="stat-divider">|</span>
      <span class="streak-text" :class="{ hot: stats.consecutiveWins >= 3 }">
        {{ stats.consecutiveWins > 0 ? `🔥连胜: ${stats.consecutiveWins}` : stats.consecutiveLosses > 0 ? `连败: ${stats.consecutiveLosses}` : '暂无记录' }}
      </span>
      <span class="stat-divider">|</span>
      <span class="stat-text">总场次: {{ stats.totalRaces }}</span>
    </div>

    <!-- 主体 -->
    <main class="dograce-body">
      <!-- 跑道 Canvas -->
      <div class="dograce-canvas-wrapper" :class="{ 'canvas-clickable': raceState === 'betting' }">
        <canvas
          ref="canvasRef"
          :width="CANVAS_WIDTH"
          :height="CANVAS_HEIGHT"
          class="dograce-canvas"
          @click="handleCanvasClick"
        ></canvas>
      </div>

      <!-- 投注区 -->
      <section v-if="raceState === 'betting'" class="dograce-bet-section">
        <!-- 赔率 -->
        <div class="odds-row">
          <span class="odds-label">赔率:</span>
          <div
            v-for="(dog, i) in dogs"
            :key="dog.name"
            class="odds-item"
            :class="{ 'odds-selected': selectedDogIndex === i }"
            @click="selectDog(i)"
          >
            <span class="odds-emoji">{{ dog.emoji }}</span>
            <span class="odds-name">{{ dog.name }}</span>
            <span class="odds-value">{{ dog.odds }}x</span>
            <span class="odds-style">{{ dog.style.emoji }}</span>
          </div>
        </div>

        <!-- 投注金额 -->
        <div class="bet-amount-row">
          <span class="bet-label">下注:</span>
          <button
            v-if="canUseFreeRace"
            type="button"
            class="bet-btn free-bet"
            :class="{ active: selectedBetAmount === 0 }"
            @click="selectedBetAmount = 0"
          >
            免费
          </button>
          <button
            v-for="amount in BET_OPTIONS"
            :key="amount"
            type="button"
            class="bet-btn"
            :class="{ active: selectedBetAmount === amount }"
            @click="selectBet(amount)"
          >
            {{ amount }} 💰
          </button>
        </div>

        <!-- 选中提示 -->
        <div v-if="selectedDogIndex >= 0" class="bet-selected">
          已选: {{ dogs[selectedDogIndex]?.emoji }} {{ dogs[selectedDogIndex]?.name }}
          <span class="bet-potential"> → 预计赢得 {{ Math.round(selectedBetAmount * currentMultiplier) }} 💰</span>
        </div>
      </section>

      <!-- 开始按钮 -->
      <div class="dograce-start-row">
        <button
          type="button"
          class="dograce-start-btn"
          :class="{
            disabled: raceState !== 'betting' || selectedDogIndex < 0,
            racing: raceState === 'countdown' || raceState === 'racing',
          }"
          :disabled="raceState !== 'betting' || selectedDogIndex < 0"
          @click="startRace"
        >
          <span v-if="raceState === 'betting'">🏃 开始比赛！</span>
          <span v-else-if="raceState === 'countdown'">{{ countdownValue }}...</span>
          <span v-else-if="raceState === 'racing'">比赛中...</span>
          <span v-else>比赛结束</span>
        </button>
        <button
          v-if="raceState === 'finished'"
          type="button"
          class="dograce-restart-btn"
          @click="() => { raceState = 'betting'; selectedDogIndex = -1; initDogs() }"
        >
          🔄 再来一局
        </button>
      </div>
    </main>

    <!-- Toast -->
    <Teleport to="body">
      <Toast
        v-if="toastVisible"
        :message="toastMessage"
        :type="toastType"
        :duration="5000"
        position="top"
        :on-close="() => { toastVisible.value = false; toastMessage.value = '' }"
      />
    </Teleport>

    <!-- 皮肤选择器 -->
    <Teleport to="body">
      <GameSkinSelector
        v-if="showSkinSelector"
        :skins="dogSkins"
        :owned-ids="dogOwnedSkins.map(s => s.id)"
        :active-id="dogActiveSkin.id"
        :coins="coins"
        @select="dogSelectSkin"
        @buy="handleDogSkinBuy"
        @close="showSkinSelector = false"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.dograce-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--dog-screen-bg, linear-gradient(180deg, #1a2e0a 0%, #0a1e0a 40%, #0a1a1e 100%));
  z-index: 10000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.dograce-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--dog-header-border, rgba(255, 140, 0, 0.2));
  gap: 10px;
}

.dograce-back-btn {
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
.dograce-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

.dograce-title {
  flex: 1;
  text-align: center;
  margin: 0;
  color: var(--dog-header-text, #ff8c00);
  font-size: 17px;
  font-weight: 600;
  text-shadow: 0 0 15px rgba(255, 140, 0, 0.3);
}

.dograce-coin-box {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 10px;
  padding: 6px 12px;
}
.dograce-coin-value { color: var(--dog-header-text, #ffd700); font-size: 15px; font-weight: 700; min-width: 30px; text-align: right; }

/* 主题按钮 */
.dograce-theme-btn {
  padding: 6px 12px;
  border: 1px solid var(--dog-header-border, rgba(255, 215, 0, 0.2));
  border-radius: 8px;
  background: rgba(255, 215, 0, 0.08);
  color: var(--dog-header-text, #ffd700);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.dograce-theme-btn:hover { background: rgba(255, 215, 0, 0.15); }
  .platform-android.android-portrait .dograce-theme-btn {
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
/* 统计栏 */
.dograce-stats-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}
.stat-divider { color: rgba(255, 255, 255, 0.2); }
.streak-text.hot { color: #ff8c00; font-weight: 700; }

/* Body */
.dograce-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Canvas */
.dograce-canvas-wrapper {
  display: flex;
  justify-content: center;
}

.dograce-canvas {
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  background: var(--dog-track-bg, #2d5a1e);
  max-width: 100%;
  height: auto;
  box-shadow: 0 0 30px rgba(45, 90, 30, 0.3), inset 0 0 40px rgba(0, 0, 0, 0.3);
}

.canvas-clickable { cursor: pointer; }
.canvas-clickable .dograce-canvas:hover { border-color: rgba(255, 215, 0, 0.4); }

/* 投注区 */
.dograce-bet-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.odds-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.odds-label {
  display: none;
}

.odds-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.2s;
}
.odds-item:hover { background: rgba(255, 255, 255, 0.08); }
.odds-selected {
  background: rgba(255, 215, 0, 0.12);
  border-color: #ffd700;
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.2);
}

.odds-emoji { font-size: 22px; }
.odds-name { font-size: 11px; font-weight: 600; color: #fff; }
.odds-value { font-size: 12px; font-weight: 700; color: #ffd700; }
.odds-style { font-size: 10px; color: rgba(255, 255, 255, 0.4); }

/* 投注金额 */
.bet-amount-row {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.bet-label { font-size: 12px; color: rgba(255, 255, 255, 0.5); }

.bet-btn {
  padding: 8px 14px;
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 8px;
  background: rgba(255, 215, 0, 0.06);
  color: #ffd700;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.bet-btn:hover { background: rgba(255, 215, 0, 0.12); }
.bet-btn.active {
  background: rgba(255, 215, 0, 0.2);
  border-color: #ffd700;
  box-shadow: 0 0 8px rgba(255, 215, 0, 0.3);
}
  .platform-android.android-portrait .bet-btn {
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
.free-bet {
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.1);
  color: #4ade80;
}
.free-bet.active {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.2);
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.3);
}

/* 选中提示 */
.bet-selected {
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  padding: 6px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}
.bet-potential { color: #ffd700; font-weight: 600; }

/* 开始按钮 */
.dograce-start-row {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.dograce-start-btn, .dograce-restart-btn {
  padding: 14px 32px;
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 160px;
  text-align: center;
}

.dograce-start-btn {
  background: linear-gradient(135deg, rgba(255, 140, 0, 0.4), rgba(255, 68, 0, 0.2));
  border: 1px solid rgba(255, 140, 0, 0.4);
  color: #ff8c00;
}
.dograce-start-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(255, 140, 0, 0.3); }
.dograce-start-btn:active:not(:disabled) { transform: scale(0.97); }
.dograce-start-btn.disabled { opacity: 0.4; cursor: not-allowed; }
.dograce-start-btn.racing {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(34, 197, 94, 0.1));
  border-color: rgba(34, 197, 94, 0.3);
  color: #4ade80;
}

.dograce-restart-btn {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(59, 130, 246, 0.1));
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #60a5fa;
}
.dograce-restart-btn:hover { transform: translateY(-2px); }

/* Android竖屏适配 */
.platform-android.android-portrait .dograce-header {
  padding-top: calc(12px + env(safe-area-inset-top)) !important;
}
.platform-android.android-portrait .dograce-back-btn {
  width: 44px !important; height: 44px !important; min-width: 44px !important; min-height: 44px !important;
}
.platform-android.android-portrait .dograce-title { font-size: 15px !important; }
</style>
