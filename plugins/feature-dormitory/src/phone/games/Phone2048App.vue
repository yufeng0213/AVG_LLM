<script setup>
/**
 * Phone2048App.vue - 2048 游戏应用
 */
import { useGame2048 } from './composables/useGame2048.js'

const emit = defineEmits(['back'])

const {
  grid,
  score,
  bestScore,
  gameOver,
  won,
  mergedCells,
  newCells,
  newGame,
  move,
} = useGame2048()

function tileColor(value) {
  const map = {
    0:   { bg: 'rgba(124, 139, 171, 0.16)', color: 'transparent' },
    2:   { bg: '#e3edf9', color: '#2c3a53' },
    4:   { bg: '#d6e7fb', color: '#273652' },
    8:   { bg: '#b2d6ff', color: '#1d2f4d' },
    16:  { bg: '#8ec9ff', color: '#173155' },
    32:  { bg: '#69bbff', color: '#102a4e' },
    64:  { bg: '#4dacff', color: '#0b2446' },
    128: { bg: '#7cb8ff', color: '#0f2440' },
    256: { bg: '#67a8ff', color: '#0f2140' },
    512: { bg: '#4d95ff', color: '#f5fbff' },
    1024:{ bg: '#3a7fff', color: '#f7fbff' },
    2048:{ bg: '#ffcf5b', color: '#3f2a00' },
  }
  return map[value] || { bg: 'linear-gradient(140deg, #ffd982, #ffb74a)', color: '#3c2500' }
}

// Touch handling
let startX = 0
let startY = 0

function onTouchStart(e) {
  const t = e.touches[0]
  startX = t.clientX
  startY = t.clientY
}

function onTouchEnd(e) {
  const t = e.changedTouches[0]
  const dx = t.clientX - startX
  const dy = t.clientY - startY
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  if (Math.max(absDx, absDy) < 20) return

  if (absDx > absDy) {
    move(dx > 0 ? 'right' : 'left')
  } else {
    move(dy > 0 ? 'down' : 'up')
  }
}

function onKeydown(e) {
  const map = {
    ArrowLeft: 'left', ArrowRight: 'right',
    ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down',
  }
  if (map[e.key]) {
    e.preventDefault()
    move(map[e.key])
  }
}
</script>

<template>
  <div class="phone-game-app game-2048" @keydown="onKeydown" tabindex="0">
    <div class="phone-app-header">
      <button type="button" class="phone-app-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <h2 class="phone-app-title">2048</h2>
      <button type="button" class="phone-app-back-btn game-new-btn" @click="newGame">重来</button>
    </div>

    <div class="game-2048-content" @touchstart="onTouchStart" @touchend="onTouchEnd">
      <div class="game-2048-body">
        <!-- 分数栏 -->
        <div class="game-2048-score-bar">
          <div class="score-card">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <div class="score-card-num">{{ score }}</div>
          </div>
          <div class="score-card score-best">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 9 7 12 7s5-3 7.5-3a2.5 2.5 0 0 1 0 5H18"/>
              <path d="M18 9v5.5a6 6 0 0 1-3 5.2V21h-6v-1.3a6 6 0 0 1-3-5.2V9"/>
              <line x1="12" y1="7" x2="12" y2="10"/>
            </svg>
            <div class="score-card-num">{{ bestScore }}</div>
          </div>
        </div>

        <!-- 棋盘 -->
        <div class="game-2048-board">
          <div
            v-for="(row, ri) in grid"
            :key="ri"
            class="game-2048-row"
          >
            <div
              v-for="(cell, ci) in row"
              :key="ci"
              class="game-2048-cell"
              :style="cell ? {
                backgroundColor: tileColor(cell).bg,
                color: tileColor(cell).color,
              } : {}"
              :class="{
                merged: mergedCells.some(m => m.r === ri && m.c === ci),
                new: newCells.some(m => m.r === ri && m.c === ci),
              }"
            >
              {{ cell > 0 ? cell : '' }}
            </div>
          </div>

          <!-- 游戏结束/胜利覆盖层 -->
          <div v-if="gameOver" class="game-2048-overlay">
            <div class="game-2048-overlay-title">游戏结束!</div>
            <div class="game-2048-overlay-info">得分: {{ score }}</div>
            <button type="button" class="game-2048-overlay-btn" @click="newGame">再来一局</button>
          </div>
          <div v-else-if="won" class="game-2048-overlay game-2048-overlay-win">
            <div class="game-2048-overlay-title">&#x1F389; 你赢了!</div>
            <button type="button" class="game-2048-overlay-btn" @click="newGame">继续挑战</button>
          </div>
        </div>
      </div>

      <div class="game-hint">滑动或方向键控制</div>
    </div>
  </div>
</template>
