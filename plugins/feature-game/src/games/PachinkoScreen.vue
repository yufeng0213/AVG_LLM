<script setup>
/**
 * PachinkoScreen.vue - 弹珠机（柏青哥）
 * Canvas 物理渲染：重力 + 弹性碰撞 + 钉子弹跳
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import Toast from '../Toast.vue'
import GameSkinSelector from '../components/GameSkinSelector.vue'
import { useGameSkin } from '../composables/useGameSkin'

const emit = defineEmits(['back', 'pachinko-result', 'game-skin-buy'])
const props = defineProps({
  coins: { type: Number, default: 0 },
})

const GAME_KEY = 'pachinko'

// ====== 皮肤系统 ======
const {
  skins: pachinkoSkins,
  activeSkin: pachinkoActiveSkin,
  ownedSkinList: pachinkoOwnedSkins,
  selectSkin: pachinkoSelectSkin,
  buySkin: pachinkoBuySkin,
} = useGameSkin(GAME_KEY)

const showSkinSelector = ref(false)

function handlePachinkoSkinBuy({ skinId, price }) {
  const result = pachinkoBuySkin(skinId, props.coins)
  if (result.success) {
    emit('game-skin-buy', { gameKey: GAME_KEY, cost: price })
    toastMessage.value = `🎨 主题已解锁：${pachinkoSkins.find(s => s.id === skinId)?.name}`
    toastType.value = 'success'
    toastVisible.value = true
  } else if (result.notEnoughCoins) {
    toastMessage.value = '金币不足！'
    toastType.value = 'error'
    toastVisible.value = true
  }
}

// 皮肤主题样式（Canvas 颜色通过 watch 更新）
const pachinkoThemeStyle = computed(() => {
  const theme = pachinkoActiveSkin.value.theme || {}
  return {
    '--pachinko-screen-bg': theme.screenBg || 'linear-gradient(180deg, #0a0a2e 0%, #0f1a3e 50%, #0a0a1e 100%)',
    '--pachinko-canvas-bg': theme.canvasBg || '#0a0a1e',
    '--pachinko-canvas-border': theme.canvasBorder || 'rgba(255, 215, 0, 0.15)',
    '--pachinko-pin-color': theme.pinColor || '#4a4a6a',
    '--pachinko-pin-stroke': theme.pinStroke || 'rgba(255, 255, 255, 0.1)',
    '--pachinko-pin-glow': theme.pinGlowColor || '#ffffff',
    '--pachinko-ball-grad1': theme.ballGrad1 || '#ffffff',
    '--pachinko-ball-grad2': theme.ballGrad2 || '#64c8ff',
    '--pachinko-ball-grad3': theme.ballGrad3 || '#3b82f6',
    '--pachinko-ball-shadow': theme.ballShadow || '#64c8ff',
    '--pachinko-header-text': theme.headerText || '#ffd700',
    '--pachinko-header-border': theme.headerBorder || 'rgba(255, 215, 0, 0.1)',
  }
})

// 当皮肤变化时，更新 Canvas 渲染用的颜色
watch(pachinkoActiveSkin, (skin) => {
  if (!skin || !skin.theme) return
  // 更新全局颜色供 Canvas 使用
  _pachinkoTheme = skin.theme
  // 重新初始化格子颜色
  if (slots.length > 0 && ctx) {
    slots = buildSlots()
  }
}, { immediate: false })

let _pachinkoTheme = null

const SPIN_COST = 20
const DOUBLE_COST = 40
const CANVAS_WIDTH = 360
const CANVAS_HEIGHT = 560

// ====== 状态 ======
const canvasRef = ref(null)
const isRunning = ref(false)
const showHistory = ref(false)
const history = ref([])
const totalPulls = ref(0)
const totalEarned = ref(0)
const totalCost = ref(0)
const consecutiveCenter = ref(0)
const centerBonusActive = ref(false)
const goldenBallActive = ref(false)
const doubleMode = ref(false)

// Toast 结果提示
const toastMessage = ref('')
const toastType = ref('success')
const toastVisible = ref(false)

// 瞄准 & 蓄力
const mouseX = ref(0)
const mouseY = ref(0)
const isCharging = ref(false)
const chargePower = ref(0) // 0~100
let chargeInterval = null

// Canvas 上下文
let ctx = null
let animFrame = null
let ball = null
let trail = []
let pins = []
let slots = []
let particles = []
let pinGlows = []
let ballLanded = false
let animating = false

// ====== 底部格子定义 ======
function buildSlots() {
  const w = CANVAS_WIDTH
  const slotY = CANVAS_HEIGHT - 70
  const slotH = 50
  const margin = 10
  const usableWidth = w - margin * 2
  const slotW = usableWidth / 9

  const baseRewards = [10, 5, 20, 50, 100, 50, 20, 5, 10]
  const theme = _pachinkoTheme
  const baseColors = theme
    ? (theme.slotColors || ['#3b82f6', '#64748b', '#22c55e', '#a855f7', '#ffd700', '#a855f7', '#22c55e', '#64748b', '#3b82f6'])
    : ['#3b82f6', '#64748b', '#22c55e', '#a855f7', '#ffd700', '#a855f7', '#22c55e', '#64748b', '#3b82f6']

  // 中间加成：让中间3格变宽
  let widths = new Array(9).fill(slotW)
  if (centerBonusActive.value) {
    const bonus = slotW * 0.3
    widths[3] += bonus * 0.5
    widths[4] += bonus
    widths[5] += bonus * 0.5
    const reduce = bonus * 2 / 6
    for (let i = 0; i < 3; i++) { widths[i] = Math.max(15, widths[i] - reduce) }
    for (let i = 6; i < 9; i++) { widths[i] = Math.max(15, widths[i] - reduce) }
  } else {
    // 默认中间格略窄
    const narrow = slotW * 0.15
    widths[4] -= narrow
    widths[0] += narrow * 0.25
    widths[8] += narrow * 0.25
    widths[1] += narrow * 0.25
    widths[7] += narrow * 0.25
  }

  let x = margin
  const result = []
  for (let i = 0; i < 9; i++) {
    result.push({
      index: i,
      x,
      y: slotY,
      w: widths[i],
      h: slotH,
      reward: baseRewards[i],
      color: baseColors[i],
    })
    x += widths[i]
  }
  return result
}

// ====== 钉子定义 ======
function buildPins() {
  const result = []
  const startY = 80
  const rows = 9
  const pinsPerRow = [3, 4, 5, 6, 7, 6, 5, 4, 3]
  const rowGap = 38

  for (let r = 0; r < rows; r++) {
    const count = pinsPerRow[r]
    const y = startY + r * rowGap
    const spacing = (CANVAS_WIDTH - 60) / (count - 1 || 1)
    const startX = (CANVAS_WIDTH - (count - 1) * spacing) / 2

    for (let c = 0; c < count; c++) {
      result.push({
        x: count === 1 ? CANVAS_WIDTH / 2 : startX + c * spacing,
        y,
        radius: 5,
      })
    }
  }
  return result
}

// ====== 弹珠 ======
function createBall(angle, power) {
  return {
    x: CANVAS_WIDTH / 2 + Math.sin(angle) * power * 0.5,
    y: 40,
    vx: Math.sin(angle) * power * 0.8,
    vy: 2 + power * 0.3,
    radius: 7,
    golden: goldenBallActive.value,
  }
}

// ====== 物理 ======
const GRAVITY = 0.35
const BOUNCE_FACTOR = 0.7
const RANDOMNESS = 1.2
const FRICTION = 0.995

function updatePhysics() {
  if (!ball || ballLanded) return

  ball.vy += GRAVITY
  ball.vx *= FRICTION
  ball.vy *= FRICTION

  // 限制最大水平速度，避免球飞出屏幕
  ball.vx = Math.max(-8, Math.min(8, ball.vx))

  ball.x += ball.vx
  ball.y += ball.vy

  // 顶部墙壁（防止球飞出屏幕上方）
  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius
    ball.vy = Math.abs(ball.vy) * BOUNCE_FACTOR
  }

  // 左右墙壁碰撞
  if (ball.x - ball.radius < 0) {
    ball.x = ball.radius
    ball.vx = -ball.vx * BOUNCE_FACTOR
  }
  if (ball.x + ball.radius > CANVAS_WIDTH) {
    ball.x = CANVAS_WIDTH - ball.radius
    ball.vx = -ball.vx * BOUNCE_FACTOR
  }

  // 钉子碰撞
  for (const pin of pins) {
    const dx = ball.x - pin.x
    const dy = ball.y - pin.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const minDist = ball.radius + pin.radius

    if (dist < minDist) {
      // 碰撞角度
      const angle = Math.atan2(dy, dx)
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy)
      const newSpeed = Math.max(speed * BOUNCE_FACTOR, 2)

      ball.vx = Math.cos(angle) * newSpeed
      ball.vy = Math.sin(angle) * newSpeed
      // 随机扰动
      ball.vx += (Math.random() - 0.5) * RANDOMNESS
      ball.vy += (Math.random() - 0.5) * 0.5

      // 推出重叠
      ball.x = pin.x + Math.cos(angle) * (minDist + 1)
      ball.y = pin.y + Math.sin(angle) * (minDist + 1)

      // 钉子发光效果
      pinGlows.push({ x: pin.x, y: pin.y, radius: pin.radius * 3, alpha: 1, color: ball.golden ? '#ffd700' : '#ffffff' })
    }
  }

  // 拖尾
  trail.push({ x: ball.x, y: ball.y, alpha: 1 })
  if (trail.length > 15) trail.shift()

  // 检查是否落入格子（需要弹珠完全进入格子区域才判定）
  const slotTop = slots[0]?.y || (CANVAS_HEIGHT - 70)
  const slotBottom = slotTop + (slots[0]?.h || 50)
  if (ball.y + ball.radius >= slotBottom) {
    landBall()
  }
}

function landBall() {
  ballLanded = true
  let hitSlot = null
  for (const slot of slots) {
    if (ball.x >= slot.x && ball.x < slot.x + slot.w) {
      hitSlot = slot
      break
    }
  }
  if (!hitSlot) hitSlot = slots[4] // 默认中间

  let reward = hitSlot.reward
  let multiplier = 1

  // 金色弹珠
  if (ball.golden) {
    multiplier *= 3
  }
  // 双倍模式
  if (doubleMode.value) {
    multiplier *= 2
  }
  reward *= multiplier

  totalPulls.value++
  totalCost.value += doubleMode.value ? DOUBLE_COST : SPIN_COST
  totalEarned.value += reward

  // 连续中间判定
  if (hitSlot.index >= 3 && hitSlot.index <= 5) {
    consecutiveCenter.value++
    if (consecutiveCenter.value >= 3) {
      centerBonusActive.value = true
    }
  } else {
    consecutiveCenter.value = 0
    centerBonusActive.value = false
  }

  // 结果消息 - 通过 Toast 展示
  if (hitSlot.reward >= 100) {
    toastMessage.value = `🎆 大奖！落入 ${hitSlot.reward} 格！+${reward} 金币！${ball.golden ? '🌟金色弹珠x3！' : ''}`
    toastType.value = 'success'
    spawnParticles(ball.x, ball.y, '#ffd700', 30)
  } else if (hitSlot.reward >= 50) {
    toastMessage.value = `✨ 不错！+${reward} 金币！${ball.golden ? '🌟x3！' : ''}`
    toastType.value = 'info'
    spawnParticles(ball.x, ball.y, hitSlot.color, 15)
  } else if (reward > 0) {
    toastMessage.value = `+${reward} 金币${ball.golden ? ' 🌟' : ''}`
    toastType.value = 'warning'
  } else {
    toastMessage.value = '未中奖...'
    toastType.value = 'error'
  }
  toastVisible.value = true

  // 历史记录
  history.value.unshift({
    pullNumber: totalPulls.value,
    reward,
    slotReward: hitSlot.reward,
    golden: ball.golden,
    multiplier,
    timestamp: Date.now(),
  })
  if (history.value.length > 20) history.value.pop()

  emit('pachinko-result', { cost: doubleMode.value ? DOUBLE_COST : SPIN_COST, earned: reward })

  animating = false
  setTimeout(() => {
    toastVisible.value = false
    toastMessage.value = ''
  }, 4000)
}

// ====== 粒子 ======
function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8 - 2,
      alpha: 1,
      color,
      size: Math.random() * 4 + 1,
    })
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x += p.vx
    p.y += p.vy
    p.vy += 0.1
    p.alpha -= 0.02
    if (p.alpha <= 0) particles.splice(i, 1)
  }
  for (let i = pinGlows.length - 1; i >= 0; i--) {
    const g = pinGlows[i]
    g.alpha -= 0.05
    g.radius += 0.5
    if (g.alpha <= 0) pinGlows.splice(i, 1)
  }
  for (let i = trail.length - 1; i >= 0; i--) {
    trail[i].alpha -= 0.06
    if (trail[i].alpha <= 0) trail.splice(i, 1)
  }
}

// ====== 渲染 ======
function render() {
  if (!ctx) return

  // 清屏
  const theme = _pachinkoTheme
  ctx.fillStyle = theme ? theme.canvasBg : '#0a0a1e'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // 边框
  ctx.strokeStyle = theme ? theme.canvasBorder : 'rgba(255, 215, 0, 0.15)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, CANVAS_WIDTH - 2, CANVAS_HEIGHT - 2)

  // 发射器
  drawLauncher()

  // 钉子
  for (const pin of pins) {
    ctx.beginPath()
    ctx.arc(pin.x, pin.y, pin.radius, 0, Math.PI * 2)
    ctx.fillStyle = theme ? theme.pinColor : '#4a4a6a'
    ctx.fill()
    ctx.strokeStyle = theme ? theme.pinStroke : 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // 钉子发光
  for (const glow of pinGlows) {
    ctx.beginPath()
    ctx.arc(glow.x, glow.y, glow.radius, 0, Math.PI * 2)
    const grd = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, glow.radius)
    grd.addColorStop(0, glow.color + Math.floor(glow.alpha * 255).toString(16).padStart(2, '0'))
    grd.addColorStop(1, 'transparent')
    ctx.fillStyle = grd
    ctx.fill()
  }

  // 格子
  const slotColors = theme ? (theme.slotColors || ['#3b82f6', '#64748b', '#22c55e', '#a855f7', '#ffd700', '#a855f7', '#22c55e', '#64748b', '#3b82f6']) : ['#3b82f6', '#64748b', '#22c55e', '#a855f7', '#ffd700', '#a855f7', '#22c55e', '#64748b', '#3b82f6']
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    const slotColor = slotColors[i] || slot.color
    ctx.fillStyle = slotColor + '15'
    ctx.fillRect(slot.x + 1, slot.y, slot.w - 2, slot.h)
    ctx.strokeStyle = slotColor + '60'
    ctx.lineWidth = 1
    ctx.strokeRect(slot.x + 1, slot.y, slot.w - 2, slot.h)

    // 奖励文字
    ctx.fillStyle = slotColor
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const displayReward = doubleMode.value ? slot.reward * 2 : slot.reward
    ctx.fillText(displayReward, slot.x + slot.w / 2, slot.y + slot.h / 2 - 8)
    ctx.font = '9px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fillText('💰', slot.x + slot.w / 2, slot.y + slot.h / 2 + 12)
  }

  // 拖尾
  for (const t of trail) {
    ctx.beginPath()
    ctx.arc(t.x, t.y, ball.radius * t.alpha * 0.6, 0, Math.PI * 2)
    ctx.fillStyle = ball.golden
      ? `rgba(255, 215, 0, ${t.alpha * 0.5})`
      : `rgba(100, 200, 255, ${t.alpha * 0.4})`
    ctx.fill()
  }

  // 弹珠
  if (ball && !ballLanded) {
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2)
    if (ball.golden) {
      const grd = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 0, ball.x, ball.y, ball.radius)
      grd.addColorStop(0, '#fff8dc')
      grd.addColorStop(0.5, '#ffd700')
      grd.addColorStop(1, '#ff8c00')
      ctx.fillStyle = grd
    } else {
      const grd = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 0, ball.x, ball.y, ball.radius)
      grd.addColorStop(0, theme ? theme.ballGrad1 : '#ffffff')
      grd.addColorStop(0.5, theme ? theme.ballGrad2 : '#64c8ff')
      grd.addColorStop(1, theme ? theme.ballGrad3 : '#3b82f6')
      ctx.fillStyle = grd
    }
    ctx.fill()
    ctx.shadowColor = ball.golden ? '#ffd700' : (theme ? theme.ballShadow : '#64c8ff')
    ctx.shadowBlur = 12
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // 粒子
  for (const p of particles) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fillStyle = p.color + Math.floor(p.alpha * 255).toString(16).padStart(2, '0')
    ctx.fill()
  }
}

function drawLauncher() {
  const cx = CANVAS_WIDTH / 2
  const topY = 30

  // 发射口底座
  ctx.beginPath()
  ctx.moveTo(cx - 20, topY - 5)
  ctx.lineTo(cx + 20, topY - 5)
  ctx.lineTo(cx + 15, topY + 15)
  ctx.lineTo(cx - 15, topY + 15)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255, 215, 0, 0.12)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)'
  ctx.lineWidth = 1
  ctx.stroke()

  if (isCharging.value) {
    // 瞄准箭头
    const dx = mouseX.value - cx
    const dy = mouseY.value - topY
    const angle = Math.atan2(dy, dx)
    const arrowLen = 30 + chargePower.value * 0.4
    const endX = cx + Math.cos(angle) * arrowLen
    const endY = topY + Math.sin(angle) * arrowLen

    const powerRatio = chargePower.value / 100
    const r = Math.round(255 * powerRatio)
    const g = Math.round(255 * (1 - Math.abs(powerRatio - 0.5) * 2))
    const arrowColor = `rgb(${r}, ${g}, 0)`

    // 箭头线
    ctx.beginPath()
    ctx.moveTo(cx, topY)
    ctx.lineTo(endX, endY)
    ctx.strokeStyle = arrowColor
    ctx.lineWidth = 3
    ctx.stroke()

    // 箭头头部
    const headLen = 10
    const headAngle = 0.4
    ctx.beginPath()
    ctx.moveTo(endX, endY)
    ctx.lineTo(
      endX - headLen * Math.cos(angle - headAngle),
      endY - headLen * Math.sin(angle - headAngle),
    )
    ctx.lineTo(
      endX - headLen * Math.cos(angle + headAngle),
      endY - headLen * Math.sin(angle + headAngle),
    )
    ctx.closePath()
    ctx.fillStyle = arrowColor
    ctx.fill()

    // 蓄力光晕
    ctx.beginPath()
    ctx.arc(cx, topY, 8 + powerRatio * 8, 0, Math.PI * 2)
    const glowAlpha = 0.1 + powerRatio * 0.3
    ctx.fillStyle = `rgba(255, 215, 0, ${glowAlpha})`
    ctx.fill()

    // 蓄力进度条（顶部）
    const barW = 80
    const barH = 6
    const barX = cx - barW / 2
    const barY = topY - 18
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(barX, barY, barW, barH)
    const fillColor = powerRatio < 0.33 ? '#22c55e' : powerRatio < 0.66 ? '#eab308' : '#ef4444'
    ctx.fillStyle = fillColor
    ctx.fillRect(barX, barY, barW * powerRatio, barH)
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 0.5
    ctx.strokeRect(barX, barY, barW, barH)

    // 蓄力百分比
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${Math.round(powerRatio * 100)}%`, cx, barY - 10)
  } else {
    // 提示文字
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('长按瞄准发射', cx, topY + 30)
  }
}

// ====== 游戏循环 ======
function gameLoop() {
  updatePhysics()
  updateParticles()
  render()
  animFrame = requestAnimationFrame(gameLoop)
}

// ====== 发射 ======
function launch(angle, power) {
  if (animating) return
  animating = true
  isRunning.value = true
  ballLanded = false
  trail = []
  particles = []
  pinGlows = []
  toastVisible.value = false
  toastMessage.value = ''
  isCharging.value = false
  chargePower.value = 0
  if (chargeInterval) {
    clearInterval(chargeInterval)
    chargeInterval = null
  }

  // 随机金色弹珠
  goldenBallActive.value = Math.random() < 0.1

  ball = createBall(angle, power)

  // 超时保护：先让弹珠加速下落，再判定
  let timeoutPhase = 0
  const timeoutId = setInterval(() => {
    if (!ball || ballLanded) {
      clearInterval(timeoutId)
      return
    }
    timeoutPhase++
    if (timeoutPhase === 1) {
      // 6秒后：强制向下加速
      ball.vy = 3
      ball.vx = 0
    } else if (timeoutPhase === 2) {
      // 8秒后：继续检查，如果还没到底就再推一把
      if (ball.y < (slots[0]?.y || CANVAS_HEIGHT - 70)) {
        ball.vy = 5
        ball.vx = 0
      }
    } else if (timeoutPhase >= 3) {
      // 10秒后：强制落地
      clearInterval(timeoutId)
      if (!ballLanded) {
        landBall()
      }
    }
  }, 2000)
}

// ====== Canvas 交互事件 ======
const LAUNCHER_X = CANVAS_WIDTH / 2
const LAUNCHER_Y = 30
const LAUNCHER_RADIUS = 30

function getCanvasPos(e) {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  const scaleX = CANVAS_WIDTH / rect.width
  const scaleY = CANVAS_HEIGHT / rect.height
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  }
}

function isNearLauncher(x, y) {
  const dx = x - LAUNCHER_X
  const dy = y - LAUNCHER_Y
  return Math.sqrt(dx * dx + dy * dy) < LAUNCHER_RADIUS + 20
}

function onPointerDown(e) {
  if (animating) return
  const pos = getCanvasPos(e)
  if (!isNearLauncher(pos.x, pos.y)) return

  const cost = doubleMode.value ? DOUBLE_COST : SPIN_COST
  if (props.coins < cost) return

  isCharging.value = true
  chargePower.value = 0

  // 记录鼠标初始位置用于瞄准
  mouseX.value = pos.x
  mouseY.value = pos.y

  // 开始蓄力
  chargeInterval = setInterval(() => {
    chargePower.value = Math.min(100, chargePower.value + 2)
  }, 30)
}

function onPointerMove(e) {
  if (!isCharging.value) return
  e.preventDefault()
  const pos = getCanvasPos(e)
  mouseX.value = pos.x
  mouseY.value = pos.y
}

function onPointerUp(e) {
  if (!isCharging.value) return
  isCharging.value = false

  // 清除蓄力
  if (chargeInterval) {
    clearInterval(chargeInterval)
    chargeInterval = null
  }

  const power = 2 + (chargePower.value / 100) * 4
  const dx = mouseX.value - LAUNCHER_X
  const dy = mouseY.value - LAUNCHER_Y
  const angle = Math.atan2(dy, dx)

  // 限制角度范围，避免完全水平
  const clampedAngle = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, angle))

  launch(clampedAngle, power)
}

// ====== 初始化 ======
function initCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  ctx = canvas.getContext('2d')
  pins = buildPins()
  slots = buildSlots()
  if (!animFrame) gameLoop()
}

onMounted(() => {
  initCanvas()
})

onUnmounted(() => {
  if (animFrame) cancelAnimationFrame(animFrame)
})

function handleBack() {
  if (animFrame) cancelAnimationFrame(animFrame)
  emit('back')
}

// 重置状态
defineExpose({
  reset() {
    consecutiveCenter.value = 0
    centerBonusActive.value = false
    totalPulls.value = 0
    totalEarned.value = 0
    totalCost.value = 0
    history.value = []
  },
})
</script>

<template>
  <div class="pachinko-screen" :style="pachinkoThemeStyle">
    <!-- Header -->
    <header class="pachinko-header">
      <button type="button" class="pachinko-back-btn" @click="handleBack">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="pachinko-title">🎯 幸运弹珠</h2>
      <div class="pachinko-coin-box">
        <span class="pachinko-coin-icon">💰</span>
        <span class="pachinko-coin-value">{{ coins }}</span>
      </div>
      <button type="button" class="pachinko-theme-btn" @click="showSkinSelector = true">
        🎨 主题
      </button>
    </header>

    <!-- 主体 -->
    <main class="pachinko-body">
      <!-- 状态提示 -->
      <div v-if="centerBonusActive" class="pachinko-bonus-hint">
        🔥 连续中头！中间格子已加宽！
      </div>

      <!-- Canvas -->
      <div class="pachinko-canvas-wrapper">
        <canvas
          ref="canvasRef"
          :width="CANVAS_WIDTH"
          :height="CANVAS_HEIGHT"
          class="pachinko-canvas"
          @mousedown="onPointerDown"
          @mousemove="onPointerMove"
          @mouseup="onPointerUp"
          @mouseleave="onPointerUp"
          @touchstart.prevent="onPointerDown"
          @touchmove.prevent="onPointerMove"
          @touchend.prevent="onPointerUp"
        ></canvas>
      </div>

      <!-- 控制区 -->
      <div class="pachinko-controls">
        <div class="control-row">
          <label class="double-toggle">
            <input type="checkbox" v-model="doubleMode" :disabled="animating" />
            <span class="toggle-label">双倍模式 ({{ DOUBLE_COST }}💰)</span>
          </label>
        </div>
        <p class="launch-hint">
          <span v-if="animating" class="hint-animating">弹珠下落中...</span>
          <span v-else class="hint-ready">长按发射器瞄准，松手发射</span>
        </p>
        <p v-if="coins < SPIN_COST && !animating" class="no-coin-hint">
          金币不足，去完成任务赚金币吧！
        </p>
      </div>

      <!-- 赔率表 -->
      <section class="pachinko-paytable">
        <h3 class="paytable-title">🏆 底部奖励</h3>
        <div class="paytable-grid">
          <span class="paytable-slot"><span class="slot-color" style="background:#3b82f6"></span>10</span>
          <span class="paytable-slot"><span class="slot-color" style="background:#64748b"></span>5</span>
          <span class="paytable-slot"><span class="slot-color" style="background:#22c55e"></span>20</span>
          <span class="paytable-slot"><span class="slot-color" style="background:#a855f7"></span>50</span>
          <span class="paytable-slot"><span class="slot-color" style="background:#ffd700"></span>100</span>
        </div>
        <p class="paytable-note">长按发射器瞄准松手发射 | 10%概率金色弹珠奖励×3</p>
      </section>
    </main>

    <!-- 历史记录 -->
    <Transition name="slide-up">
      <div v-if="showHistory" class="pachinko-history" @click.self="showHistory = false">
        <div class="history-inner">
          <div class="history-header">
            <h3>📋 弹珠记录</h3>
            <button type="button" class="history-close" @click="showHistory = false">×</button>
          </div>
          <div class="history-stats">
            <div class="h-stat"><span class="h-stat-label">总次数</span><span class="h-stat-value">{{ totalPulls }}</span></div>
            <div class="h-stat"><span class="h-stat-label">总消耗</span><span class="h-stat-value cost">{{ totalCost }}</span></div>
            <div class="h-stat"><span class="h-stat-label">总获得</span><span class="h-stat-value earned">{{ totalEarned }}</span></div>
            <div class="h-stat"><span class="h-stat-label">净收益</span><span class="h-stat-value" :class="totalEarned - totalCost >= 0 ? 'profit' : 'loss'">{{ totalEarned - totalCost >= 0 ? '+' : '' }}{{ totalEarned - totalCost }}</span></div>
          </div>
          <div class="history-list">
            <div v-if="history.length === 0" class="history-empty">暂无记录</div>
            <div v-for="(rec, idx) in history" :key="idx" class="history-item" :class="rec.reward >= 50 ? 'hist-win' : 'hist-normal'">
              <span class="hist-num">#{{ rec.pullNumber }}</span>
              <span class="hist-icon">{{ rec.golden ? '🌟' : '🎯' }}</span>
              <span class="hist-reward">落入{{ rec.slotReward }}格 → +{{ rec.reward }}💰</span>
              <span v-if="rec.multiplier > 1" class="hist-multi">x{{ rec.multiplier }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 历史记录FAB -->
    <button type="button" class="pachinko-history-fab" @click="showHistory = !showHistory">记录</button>

    <!-- Toast -->
    <Teleport to="body">
      <Toast
        v-if="toastVisible"
        :message="toastMessage"
        :type="toastType"
        :duration="0"
        position="top"
        :on-close="() => { toastVisible.value = false; toastMessage.value = '' }"
      />
    </Teleport>

    <!-- 皮肤选择器 -->
    <Teleport to="body">
      <GameSkinSelector
        v-if="showSkinSelector"
        :skins="pachinkoSkins"
        :owned-ids="pachinkoOwnedSkins.map(s => s.id)"
        :active-id="pachinkoActiveSkin.id"
        :coins="coins"
        @select="pachinkoSelectSkin"
        @buy="handlePachinkoSkinBuy"
        @close="showSkinSelector = false"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.pachinko-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--pachinko-screen-bg, linear-gradient(180deg, #0a0a2e 0%, #0f1a3e 50%, #0a0a1e 100%));
  z-index: 10000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.pachinko-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--pachinko-header-border, rgba(255, 215, 0, 0.1));
  gap: 10px;
}

.pachinko-back-btn {
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
.pachinko-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

.pachinko-title {
  flex: 1;
  text-align: center;
  margin: 0;
  color: var(--pachinko-header-text, #ffd700);
  font-size: 17px;
  font-weight: 600;
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
}

.pachinko-coin-box {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 10px;
  padding: 6px 12px;
}
.pachinko-coin-value { color: var(--pachinko-header-text, #ffd700); font-size: 15px; font-weight: 700; min-width: 30px; text-align: right; }

/* 主题按钮 */
.pachinko-theme-btn {
  padding: 6px 12px;
  border: 1px solid var(--pachinko-header-border, rgba(255, 215, 0, 0.2));
  border-radius: 8px;
  background: rgba(255, 215, 0, 0.08);
  color: var(--pachinko-header-text, #ffd700);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.pachinko-theme-btn:hover { background: rgba(255, 215, 0, 0.15); }
  .platform-android.android-portrait .pachinko-theme-btn {
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
.pachinko-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 12px;
  gap: 10px;
  min-height: 0;
}

/* 加成提示 */
.pachinko-bonus-hint {
  padding: 8px 14px;
  background: rgba(255, 140, 0, 0.1);
  border: 1px solid rgba(255, 140, 0, 0.2);
  border-radius: 10px;
  text-align: center;
  font-size: 13px;
  color: #ff8c00;
  font-weight: 600;
}

/* Canvas */
.pachinko-canvas-wrapper {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  padding: 4px 0;
}

.pachinko-canvas {
  border: 2px solid var(--pachinko-canvas-border, rgba(255, 215, 0, 0.15));
  border-radius: 12px;
  background: var(--pachinko-canvas-bg, #0a0a1e);
  max-width: 100%;
  height: auto;
  touch-action: none;
  cursor: pointer;
  box-shadow: 0 0 30px rgba(255, 215, 0, 0.08), inset 0 0 40px rgba(0, 0, 0, 0.5);
}

/* 控制区 */
.pachinko-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.control-row {
  display: flex;
  justify-content: center;
}

.double-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(255, 215, 0, 0.06);
  border: 1px solid rgba(255, 215, 0, 0.15);
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.double-toggle input[type="checkbox"] {
  accent-color: #ffd700;
}

.launch-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
}

.hint-animating {
  color: rgba(255, 215, 0, 0.6);
}

.hint-ready {
  color: rgba(255, 255, 255, 0.5);
}

.no-coin-hint { font-size: 12px; color: rgba(255, 255, 255, 0.4); text-align: center; }

/* 赔率表 */
.pachinko-paytable {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px;
}
.paytable-title { margin: 0 0 10px; font-size: 14px; color: #ffd700; text-align: center; }
.paytable-grid { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
.paytable-slot {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}
.slot-color { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.paytable-note { margin: 8px 0 0; font-size: 11px; color: rgba(255, 255, 255, 0.35); text-align: center; }

/* 历史记录 */
.pachinko-history {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(20px);
  z-index: 10002;
  max-height: 70vh;
}
.history-inner { padding: 16px; max-width: 500px; margin: 0 auto; }
.history-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.history-header h3 { margin: 0; color: #ffd700; font-size: 16px; }
.history-close { background: none; border: none; font-size: 28px; color: rgba(255, 255, 255, 0.5); cursor: pointer; padding: 4px 8px; }
.history-close:hover { color: #fff; }

.history-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
.h-stat { display: flex; flex-direction: column; align-items: center; padding: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; }
.h-stat-label { font-size: 10px; color: rgba(255, 255, 255, 0.4); }
.h-stat-value { font-size: 15px; font-weight: 700; color: #fff; }
.h-stat-value.cost { color: #ffd700; }
.h-stat-value.earned { color: #22c55e; }
.h-stat-value.profit { color: #ffd700; }
.h-stat-value.loss { color: #e74c3c; }

.history-list { max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.history-item { display: grid; grid-template-columns: 35px 24px 1fr auto; align-items: center; gap: 8px; padding: 8px 10px; background: rgba(255, 255, 255, 0.03); border-radius: 8px; font-size: 12px; }
.hist-win { background: rgba(255, 215, 0, 0.05); border-left: 2px solid #ffd700; }
.hist-normal { border-left: 2px solid rgba(255, 255, 255, 0.1); }
.hist-num { font-weight: 700; color: rgba(255, 255, 255, 0.4); font-size: 10px; }
.hist-icon { font-size: 16px; }
.hist-reward { color: rgba(255, 255, 255, 0.7); }
.hist-multi { font-size: 10px; font-weight: 700; color: #ffd700; }
.history-empty { text-align: center; color: rgba(255, 255, 255, 0.3); padding: 24px; }

/* FAB */
.pachinko-history-fab {
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
.pachinko-history-fab:hover { background: rgba(255, 215, 0, 0.15); }

/* Transitions */
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%); opacity: 0; }

/* Android竖屏 */
.platform-android.android-portrait .pachinko-header { padding-top: calc(12px + env(safe-area-inset-top)) !important; }
.platform-android.android-portrait .pachinko-back-btn { width: 44px !important; height: 44px !important; min-width: 44px !important; min-height: 44px !important; }
.platform-android.android-portrait .pachinko-title { font-size: 15px !important; }
.platform-android.android-portrait .pachinko-history-fab { bottom: calc(20px + env(safe-area-inset-bottom)) !important; }
</style>
