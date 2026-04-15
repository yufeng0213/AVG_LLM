/**
 * useBrick.js - 打砖块游戏纯逻辑
 */
import { ref, computed } from 'vue'
import { kvStorage } from '../../../../../../src/storage/index.js'

const WORLD_WIDTH = 320
const WORLD_HEIGHT = 220
const PADDLE_HEIGHT = 8
const BALL_RADIUS = 4
const PADDLE_SPEED = 290
const MAX_SPEED = 520
const MIN_SPEED = 240
const ROWS = 6
const COLS = 9
const GAP = 4
const HORIZONTAL_PADDING = 20
const BOARD_TOP = 20

export function useBrick(storageKey = 'phone_brick') {
  const bricks = ref([])
  const paddle = ref({
    x: WORLD_WIDTH * 0.5 - 50,
    y: WORLD_HEIGHT - 18,
    width: 100,
    height: PADDLE_HEIGHT,
  })
  const ball = ref({
    x: WORLD_WIDTH * 0.5,
    y: WORLD_HEIGHT - 24,
    vx: 0,
    vy: 0,
    radius: BALL_RADIUS,
    stuck: true,
  })
  const score = ref(0)
  const bestScore = ref(0)
  const lives = ref(3)
  const stage = ref(1)
  const over = ref(false)
  const levelCleared = ref(false)
  const loading = ref(false)

  let rafId = null
  let lastFrameTs = 0
  let controlDir = 0

  const bestScoreKey = storageKey + '_best'

  async function loadBest() {
    try {
      const saved = await kvStorage.get(bestScoreKey)
      if (saved) bestScore.value = saved
    } catch { /* no-op */ }
  }

  async function saveBest() {
    try {
      await kvStorage.set(bestScoreKey, bestScore.value)
    } catch { /* no-op */ }
  }

  function maybeUpdateBest() {
    if (score.value > bestScore.value) {
      bestScore.value = score.value
      saveBest()
    }
  }

  function placeBallOnPaddle() {
    ball.value = {
      ...ball.value,
      x: paddle.value.x + paddle.value.width * 0.5,
      y: paddle.value.y - ball.value.radius - 0.8,
      vx: 0,
      vy: 0,
      stuck: true,
    }
  }

  function normalizeVelocity() {
    const speed = Math.hypot(ball.value.vx, ball.value.vy) || MIN_SPEED
    const clamped = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed))
    const ratio = clamped / speed
    ball.value = {
      ...ball.value,
      vx: ball.value.vx * ratio,
      vy: ball.value.vy * ratio,
    }
  }

  function setPaddleCenterX(centerX) {
    const width = paddle.value.width
    const clampedLeft = Math.max(0, Math.min(WORLD_WIDTH - width, centerX - width * 0.5))
    paddle.value = { ...paddle.value, x: clampedLeft }
    if (ball.value.stuck) placeBallOnPaddle()
  }

  function movePaddle(direction, delta = 16) {
    const next = paddle.value.x + direction * delta
    setPaddleCenterX(next + paddle.value.width * 0.5)
  }

  function createBricks() {
    const availableWidth = WORLD_WIDTH - HORIZONTAL_PADDING * 2 - GAP * (COLS - 1)
    const brickWidth = availableWidth / COLS
    const brickHeight = 10

    const palette = [
      { color: '#ff3b30', hp: 2 },
      { color: '#ff9500', hp: 1 },
      { color: '#f0f000', hp: 1 },
      { color: '#34c759', hp: 1 },
      { color: '#00f0f0', hp: 1 },
      { color: '#5856d6', hp: 1 },
      { color: '#af52de', hp: 2 },
    ]

    const result = []
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        // Random placement with higher density for later stages
        const density = Math.min(0.9, 0.5 + stage.value * 0.05)
        if (Math.random() > density) continue

        const p = palette[row % palette.length]
        // Higher stages have more multi-hit bricks
        const hp = stage.value >= 3 && Math.random() < 0.2 ? 2 : p.hp

        result.push({
          id: `b_${row}_${col}`,
          x: HORIZONTAL_PADDING + col * (brickWidth + GAP),
          y: BOARD_TOP + row * (brickHeight + GAP),
          width: brickWidth,
          height: brickHeight,
          hp,
          maxHp: hp,
          color: p.color,
        })
      }
    }

    // Fallback: ensure at least some bricks exist
    if (result.length === 0) {
      for (let col = 0; col < 5; col++) {
        const p = palette[col % palette.length]
        result.push({
          id: `fb_${col}`,
          x: HORIZONTAL_PADDING + col * (brickWidth + GAP),
          y: BOARD_TOP,
          width: brickWidth,
          height: brickHeight,
          hp: 1,
          maxHp: 1,
          color: p.color,
        })
      }
    }

    return result
  }

  function launchBall() {
    if (over.value || levelCleared.value || !ball.value.stuck) return
    const speed = Math.min(MAX_SPEED, 300 + stage.value * 10)
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3)
    ball.value = {
      ...ball.value,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      stuck: false,
    }
  }

  function loseLife() {
    lives.value--
    if (lives.value <= 0) {
      lives.value = 0
      over.value = true
      maybeUpdateBest()
      stopLoop()
      return
    }
    placeBallOnPaddle()
  }

  function onLevelCleared() {
    if (levelCleared.value || over.value) return
    levelCleared.value = true
    score.value += 120 + stage.value * 40
    maybeUpdateBest()
    stopLoop()
  }

  function nextStage() {
    stage.value++
    startStage()
  }

  function startStage() {
    over.value = false
    levelCleared.value = false
    bricks.value = createBricks()
    const paddleWidth = Math.max(50, 100 - stage.value * 4)
    paddle.value = {
      x: WORLD_WIDTH * 0.5 - paddleWidth * 0.5,
      y: WORLD_HEIGHT - 18,
      width: paddleWidth,
      height: PADDLE_HEIGHT,
    }
    ball.value = {
      x: WORLD_WIDTH * 0.5,
      y: WORLD_HEIGHT - 24,
      vx: 0,
      vy: 0,
      radius: BALL_RADIUS,
      stuck: true,
    }
    placeBallOnPaddle()
  }

  function newGame() {
    stopLoop()
    score.value = 0
    lives.value = 3
    stage.value = 1
    startStage()
  }

  function updatePhysics(dtSeconds) {
    if (over.value || levelCleared.value || loading.value) return

    if (controlDir !== 0) {
      movePaddle(controlDir, PADDLE_SPEED * dtSeconds)
    }

    if (ball.value.stuck) {
      placeBallOnPaddle()
      return
    }

    const prevX = ball.value.x
    const prevY = ball.value.y

    let nextX = ball.value.x + ball.value.vx * dtSeconds
    let nextY = ball.value.y + ball.value.vy * dtSeconds
    let nextVx = ball.value.vx
    let nextVy = ball.value.vy
    const r = ball.value.radius

    // Wall collisions
    if (nextX - r <= 0) {
      nextX = r
      nextVx = Math.abs(nextVx)
    } else if (nextX + r >= WORLD_WIDTH) {
      nextX = WORLD_WIDTH - r
      nextVx = -Math.abs(nextVx)
    }
    if (nextY - r <= 0) {
      nextY = r
      nextVy = Math.abs(nextVy)
    }

    // Paddle collision
    const pTop = paddle.value.y
    const pBottom = pTop + paddle.value.height
    const pLeft = paddle.value.x
    const pRight = pLeft + paddle.value.width

    if (
      nextVy > 0 &&
      nextY + r >= pTop &&
      nextY - r <= pBottom &&
      nextX >= pLeft - r &&
      nextX <= pRight + r
    ) {
      nextY = pTop - r
      const center = pLeft + paddle.value.width * 0.5
      const hit = Math.max(-1, Math.min(1, (nextX - center) / (paddle.value.width * 0.5)))
      const speed = Math.min(MAX_SPEED, Math.hypot(nextVx, nextVy) * 1.02)
      const angle = hit * (Math.PI / 3)
      nextVx = Math.sin(angle) * speed
      nextVy = -Math.cos(angle) * speed
    }

    // Brick collision
    let hitBrick = null
    for (const brick of bricks.value) {
      if (brick.hp <= 0) continue

      const closestX = Math.max(brick.x, Math.min(nextX, brick.x + brick.width))
      const closestY = Math.max(brick.y, Math.min(nextY, brick.y + brick.height))
      const distX = nextX - closestX
      const distY = nextY - closestY

      if (Math.hypot(distX, distY) < r) {
        const fromLeft = prevX + r <= brick.x
        const fromRight = prevX - r >= brick.x + brick.width
        const fromTop = prevY + r <= brick.y
        const fromBottom = prevY - r >= brick.y + brick.height

        if (fromLeft) { nextX = brick.x - r; nextVx = -Math.abs(nextVx) }
        else if (fromRight) { nextX = brick.x + brick.width + r; nextVx = Math.abs(nextVx) }
        else if (fromTop) { nextY = brick.y - r; nextVy = -Math.abs(nextVy) }
        else if (fromBottom) { nextY = brick.y + brick.height + r; nextVy = Math.abs(nextVy) }

        brick.hp--
        score.value += brick.hp === 0 ? 24 + stage.value * 4 : 8 + stage.value
        hitBrick = brick
        break
      }
    }

    if (hitBrick) {
      maybeUpdateBest()
      if (bricks.value.every(b => b.hp <= 0)) {
        onLevelCleared()
        return
      }
    }

    // Ball lost
    if (nextY - r > WORLD_HEIGHT) {
      loseLife()
      return
    }

    ball.value = { ...ball.value, x: nextX, y: nextY, vx: nextVx, vy: nextVy }
    normalizeVelocity()
  }

  function gameLoop(ts) {
    if (!lastFrameTs) lastFrameTs = ts
    const dt = Math.min((ts - lastFrameTs) / 1000, 0.05)
    lastFrameTs = ts
    updatePhysics(dt)
    rafId = requestAnimationFrame(gameLoop)
  }

  function startLoop() {
    if (rafId) return
    lastFrameTs = 0
    rafId = requestAnimationFrame(gameLoop)
  }

  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    lastFrameTs = 0
  }

  // Control
  function setControlDir(dir) { controlDir = dir; startLoop() }
  function clearControlDir() { controlDir = 0 }

  // Remaining bricks count
  const remainingBricks = computed(() => bricks.value.filter(b => b.hp > 0).length)

  loadBest()

  return {
    bricks,
    paddle,
    ball,
    score,
    bestScore,
    lives,
    stage,
    over,
    levelCleared,
    loading,
    remainingBricks,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    newGame,
    startStage,
    nextStage,
    launchBall,
    setControlDir,
    clearControlDir,
    setPaddleCenterX,
    startLoop,
    stopLoop,
  }
}
