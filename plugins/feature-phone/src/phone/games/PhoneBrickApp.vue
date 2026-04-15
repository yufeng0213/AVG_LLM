<script setup>
/**
 * PhoneBrickApp.vue - 打砖块游戏应用
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useBrick } from './composables/useBrick.js'

const emit = defineEmits(['back'])

const fieldRef = ref(null)

const {
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
  nextStage,
  launchBall,
  setControlDir,
  clearControlDir,
  setPaddleCenterX,
} = useBrick()

function onStart() {
  if (ball.value.stuck && !over.value && !levelCleared.value) {
    launchBall()
  }
}

// Pointer handling for paddle
function onPointerMove(e) {
  if (!fieldRef.value) return
  const rect = fieldRef.value.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * WORLD_WIDTH
  setPaddleCenterX(Math.max(0, Math.min(WORLD_WIDTH, x)))
}

// Keyboard
function onKeydown(e) {
  switch (e.key) {
    case 'ArrowLeft': case 'a': e.preventDefault(); setControlDir(-1); break
    case 'ArrowRight': case 'd': e.preventDefault(); setControlDir(1); break
    case ' ': e.preventDefault(); onStart(); break
  }
}
function onKeyup(e) {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'ArrowRight' || e.key === 'd') {
    clearControlDir()
  }
}

// Style helpers
function brickStyle(brick) {
  return {
    left: `${(brick.x / WORLD_WIDTH) * 100}%`,
    top: `${(brick.y / WORLD_HEIGHT) * 100}%`,
    width: `${(brick.width / WORLD_WIDTH) * 100}%`,
    height: `${(brick.height / WORLD_HEIGHT) * 100}%`,
    backgroundColor: brick.color,
    opacity: brick.hp > 0 ? 1 : 0,
  }
}

function paddleStyle() {
  return {
    left: `${(paddle.value.x / WORLD_WIDTH) * 100}%`,
    top: `${(paddle.value.y / WORLD_HEIGHT) * 100}%`,
    width: `${(paddle.value.width / WORLD_WIDTH) * 100}%`,
    height: `${(paddle.value.height / WORLD_HEIGHT) * 100}%`,
  }
}

function ballStyle() {
  return {
    left: `${((ball.value.x - ball.value.radius) / WORLD_WIDTH) * 100}%`,
    top: `${((ball.value.y - ball.value.radius) / WORLD_HEIGHT) * 100}%`,
    width: `${(ball.value.radius * 2 / WORLD_WIDTH) * 100}%`,
    height: `${(ball.value.radius * 2 / WORLD_HEIGHT) * 100}%`,
  }
}

onMounted(() => {
  newGame()
})
</script>

<template>
  <div class="phone-game-app game-brick" @keydown="onKeydown" @keyup="onKeyup" tabindex="0">
    <div class="phone-app-header">
      <button type="button" class="phone-app-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <h2 class="phone-app-title">打砖块</h2>
      <button type="button" class="phone-app-back-btn" @click="newGame">重来</button>
    </div>

    <div class="game-brick-content">
      <!-- 状态栏 -->
      <div class="game-stats-row">
        <div class="game-stat">
          <div class="game-stat-label">分数</div>
          <div class="game-stat-value">{{ score }}</div>
        </div>
        <div class="game-stat">
          <div class="game-stat-label">最高</div>
          <div class="game-stat-value">{{ bestScore }}</div>
        </div>
        <div class="game-stat">
          <div class="game-stat-label">生命</div>
          <div class="game-stat-value">&#x2764; {{ lives }}</div>
        </div>
        <div class="game-stat">
          <div class="game-stat-label">关卡</div>
          <div class="game-stat-value">{{ stage }}</div>
        </div>
      </div>

      <!-- 游戏区域 -->
      <div
        ref="fieldRef"
        class="game-brick-field"
        @click="onStart"
        @pointermove="onPointerMove"
      >
        <!-- 砖块 -->
        <div
          v-for="brick in bricks"
          :key="brick.id"
          class="game-brick-item"
          :style="brickStyle(brick)"
          :class="{ 'brick-hit': brick.hp < brick.maxHp && brick.hp > 0 }"
        />

        <!-- 挡板 -->
        <div class="game-brick-paddle" :style="paddleStyle()" />

        <!-- 球 -->
        <div class="game-brick-ball" :style="ballStyle()" />

        <!-- 覆盖层 -->
        <div v-if="over" class="game-overlay">
          <div class="game-overlay-text">游戏结束!</div>
          <div class="game-overlay-info">得分: {{ score }}</div>
          <button type="button" class="game-overlay-btn" @click.stop="newGame">再来一局</button>
        </div>
        <div v-else-if="levelCleared" class="game-overlay game-overlay-win">
          <div class="game-overlay-text">&#x1F389; 关卡通过!</div>
          <button type="button" class="game-overlay-btn" @click.stop="nextStage">下一关</button>
        </div>
        <div v-else-if="ball.stuck" class="game-tap-hint">
          点击发射
        </div>
      </div>

      <div class="game-hint">点击/滑动控制挡板，点击发射球</div>
    </div>
  </div>
</template>
