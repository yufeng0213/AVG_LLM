<script setup>
/**
 * PhoneTetrisApp.vue - 俄罗斯方块游戏应用
 */
import { onMounted, onUnmounted, watch } from 'vue'
import { useTetris } from './composables/useTetris.js'

const emit = defineEmits(['back'])

const {
  board,
  nextPieceCells,
  score,
  lines,
  level,
  over,
  bestScore,
  newGame,
  moveLeft,
  moveRight,
  moveDown,
  rotate,
  hardDrop,
  restartTimer,
  stopTimer,
  COLORS,
  ROWS,
  COLS,
} = useTetris()

function onKeydown(e) {
  if (over.value) return
  switch (e.key) {
    case 'ArrowLeft': case 'a': e.preventDefault(); moveLeft(); break
    case 'ArrowRight': case 'd': e.preventDefault(); moveRight(); break
    case 'ArrowDown': case 's': e.preventDefault(); moveDown(); break
    case 'ArrowUp': case 'w': e.preventDefault(); rotate(); break
    case ' ': e.preventDefault(); hardDrop(); break
  }
}

// Touch controls
let touchStartX = 0
let touchStartY = 0
let touchStartTime = 0
let touchMoved = false

function onTouchStart(e) {
  const t = e.touches[0]
  touchStartX = t.clientX
  touchStartY = t.clientY
  touchStartTime = Date.now()
  touchMoved = false
}

function onTouchMove(e) {
  const t = e.touches[0]
  const dx = t.clientX - touchStartX
  const dy = t.clientY - touchStartY
  if (Math.abs(dx) > 30) {
    if (dx > 0) moveRight(); else moveLeft()
    touchStartX = t.clientX
    touchMoved = true
  }
  if (dy > 30) {
    moveDown()
    touchStartY = t.clientY
    touchMoved = true
  }
}

function onTouchEnd(e) {
  const dt = Date.now() - touchStartTime
  if (!touchMoved && dt < 200) {
    rotate()
  }
}

watch(level, () => { restartTimer() })

onMounted(() => { newGame() })
onUnmounted(() => { stopTimer() })
</script>

<template>
  <div class="phone-game-app game-tetris" @keydown="onKeydown" tabindex="0">
    <div class="phone-app-header">
      <button type="button" class="phone-app-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <h2 class="phone-app-title">俄罗斯方块</h2>
      <button type="button" class="phone-app-back-btn" @click="newGame">重来</button>
    </div>

    <div class="game-tetris-content" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd">
      <!-- 分数 -->
      <div class="tetris-stats">
        <div class="score-chip">
          <span class="chip-label">分数</span>
          <span class="chip-value">{{ score }}</span>
        </div>
        <div class="score-chip">
          <span class="chip-label">最高</span>
          <span class="chip-value">{{ bestScore }}</span>
        </div>
        <div class="score-chip">
          <span class="chip-label">行数</span>
          <span class="chip-value">{{ lines }}</span>
        </div>
        <div class="score-chip">
          <span class="chip-label">等级</span>
          <span class="chip-value">{{ level }}</span>
        </div>
      </div>

      <!-- 棋盘 + 下一个 -->
      <div class="tetris-stage">
        <div class="tetris-board">
          <div
            v-for="item in board"
            :key="item.key"
            class="tetris-cell"
            :class="`is-c${item.value || 0}`"
          />
        </div>

        <div class="tetris-side">
          <p class="tetris-next-title">下一个</p>
          <div class="tetris-next">
            <div
              v-for="item in nextPieceCells"
              :key="item.key"
              class="tetris-next-cell"
              :class="`is-c${item.value || 0}`"
            />
          </div>
        </div>
      </div>

      <!-- 控制按钮 -->
      <div class="tetris-controls">
        <button type="button" class="tetris-ctrl-btn tetris-ctrl-wide" @click="rotate">旋转</button>
        <button type="button" class="tetris-ctrl-btn tetris-ctrl-wide" @click="hardDrop">速降</button>
        <button type="button" class="tetris-ctrl-btn" @click="moveLeft">&#x2190;</button>
        <button type="button" class="tetris-ctrl-btn" @click="moveDown">&#x2193;</button>
        <button type="button" class="tetris-ctrl-btn" @click="moveRight">&#x2192;</button>
      </div>

      <!-- 游戏结束覆盖 -->
      <div v-if="over" class="mini-modal-mask">
        <div class="mini-modal">
          <p class="mini-title">游戏结束</p>
          <p class="mini-desc">分数 {{ score }}，消除 {{ lines }} 行</p>
          <div class="mini-actions">
            <button type="button" class="mini-btn mini-btn-primary" @click="newGame">再来一局</button>
            <button type="button" class="mini-btn" @click="emit('back')">返回</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
