<script setup>
/**
 * PhoneMinesweeperApp.vue - 扫雷游戏应用
 */
import { ref } from 'vue'
import { useMinesweeper } from './composables/useMinesweeper.js'

const emit = defineEmits(['back'])

const {
  difficulty,
  difficulties,
  board,
  started,
  won,
  lost,
  flagCount,
  mineCount,
  elapsed,
  bestTimes,
  formatTime,
  newGame,
  revealCell,
  toggleFlag,
  getNumberColor,
  rows,
  cols,
} = useMinesweeper()

const flagMode = ref(false)

function handleCellClick(r, c) {
  if (won.value || lost.value) return
  if (flagMode.value) {
    toggleFlag(r, c)
  } else {
    revealCell(r, c)
  }
}

function handleCellContextMenu(e, r, c) {
  e.preventDefault()
  if (won.value || lost.value) return
  toggleFlag(r, c)
}
</script>

<template>
  <div class="phone-game-app game-minesweeper">
    <div class="phone-app-header">
      <button type="button" class="phone-app-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <h2 class="phone-app-title">扫雷</h2>
      <button type="button" class="phone-app-back-btn" @click="newGame">重来</button>
    </div>

    <div class="game-mines-content">
      <!-- 难度选择 -->
      <div class="game-difficulty-bar">
        <button
          v-for="d in difficulties"
          :key="d.id"
          type="button"
          class="difficulty-btn"
          :class="{ active: difficulty === d.id }"
          @click="difficulty = d.id; newGame()"
        >
          {{ d.name }}
        </button>
      </div>

      <!-- 状态栏 -->
      <div class="game-status-bar">
        <div class="game-status-item">
          <span class="status-icon">&#x1F6A9;</span>
          <span>{{ flagCount }}/{{ mineCount }}</span>
        </div>
        <div class="game-status-item">
          <span class="status-icon">&#x23F1;</span>
          <span>{{ formatTime(elapsed) }}</span>
        </div>
        <button type="button" class="flag-mode-btn" :class="{ active: flagMode }" @click="flagMode = !flagMode">
          {{ flagMode ? '&#x1F6A9; 插旗' : '&#x26CF; 挖掘' }}
        </button>
      </div>

      <!-- 棋盘 -->
      <div class="game-mines-board">
        <div
          v-for="(row, ri) in board"
          :key="ri"
          class="game-mines-row"
        >
          <div
            v-for="(cell, ci) in row"
            :key="ci"
            class="game-mines-cell"
            :class="{
              revealed: cell.revealed,
              flagged: cell.flagged,
              mine: cell.revealed && cell.mine,
            }"
            @click="handleCellClick(ri, ci)"
            @contextmenu="handleCellContextMenu($event, ri, ci)"
          >
            <template v-if="cell.flagged && !cell.revealed">&#x1F6A9;</template>
            <template v-else-if="cell.revealed && cell.mine">&#x1F4A3;</template>
            <template v-else-if="cell.revealed && cell.adjacent > 0">
              <span :style="{ color: getNumberColor(cell.adjacent) }">{{ cell.adjacent }}</span>
            </template>
          </div>
        </div>
      </div>

      <!-- 结果覆盖 -->
      <div v-if="won" class="game-overlay game-overlay-win">
        <div class="game-overlay-text">&#x1F389; 恭喜通关!</div>
        <div class="game-overlay-info">用时 {{ formatTime(elapsed) }}</div>
        <button type="button" class="game-overlay-btn" @click="newGame">再来一局</button>
      </div>
      <div v-else-if="lost" class="game-overlay">
        <div class="game-overlay-text">&#x1F4A5; 踩到雷了!</div>
        <button type="button" class="game-overlay-btn" @click="newGame">再来一局</button>
      </div>
    </div>
  </div>
</template>
