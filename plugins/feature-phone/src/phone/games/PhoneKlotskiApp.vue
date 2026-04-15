<script setup>
/**
 * PhoneKlotskiApp.vue - 华容道游戏应用
 */
import { computed, ref } from 'vue'
import { useKlotski } from './composables/useKlotski.js'

const emit = defineEmits(['back'])

const {
  pieces,
  moves,
  bestSteps,
  solved,
  selectedPieceId,
  selectedPieceMoves,
  ROWS,
  COLS,
  newGame,
  moveDirection,
  selectPiece,
} = useKlotski()

// Piece color mapping
const PIECE_COLORS = {
  cao: '#ff3b30',
  general: '#5856d6',
  soldier: '#8e8e93',
}

function pieceColor(piece) {
  return PIECE_COLORS[piece.kind] || PIECE_COLORS.soldier
}

function pieceStyle(piece) {
  return {
    left: `${(piece.x / COLS) * 100}%`,
    top: `${(piece.y / ROWS) * 100}%`,
    width: `${(piece.width / COLS) * 100}%`,
    height: `${(piece.height / ROWS) * 100}%`,
    backgroundColor: pieceColor(piece),
    border: selectedPieceId === piece.id ? '2px solid #ffd60a' : '1px solid rgba(255,255,255,0.2)',
  }
}

function handlePieceClick(pieceId) {
  if (solved.value) return
  selectPiece(pieceId)
}

function handleDirectionMove(dir) {
  if (solved.value) return
  if (selectedPieceMoves.value.some(m => m.key === dir)) {
    moveDirection(selectedPieceId, dir)
  }
}
</script>

<template>
  <div class="phone-game-app game-klotski">
    <div class="phone-app-header">
      <button type="button" class="phone-app-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <h2 class="phone-app-title">华容道</h2>
      <button type="button" class="phone-app-back-btn" @click="newGame">重来</button>
    </div>

    <div class="game-klotski-content">
      <!-- 步数 -->
      <div class="game-stats-row">
        <div class="game-stat">
          <div class="game-stat-label">步数</div>
          <div class="game-stat-value">{{ moves }}</div>
        </div>
        <div class="game-stat">
          <div class="game-stat-label">最佳</div>
          <div class="game-stat-value">{{ bestSteps > 0 ? bestSteps : '--' }}</div>
        </div>
      </div>

      <!-- 棋盘 -->
      <div class="game-klotski-board">
        <!-- 出口标记 -->
        <div class="klotski-exit-marker" />

        <!-- 棋子 -->
        <div
          v-for="piece in pieces"
          :key="piece.id"
          class="game-klotski-piece"
          :style="pieceStyle(piece)"
          :class="{
            selected: selectedPieceId === piece.id,
            cao: piece.kind === 'cao',
            'can-move': selectedPieceId === piece.id && selectedPieceMoves.length > 0,
          }"
          @click="handlePieceClick(piece.id)"
        >
          <span class="klotski-piece-label">{{ piece.label }}</span>
        </div>
      </div>

      <!-- 方向控制 -->
      <div class="klotski-dpad">
        <button
          type="button"
          class="dpad-btn"
          :class="{ active: selectedPieceMoves.some(m => m.key === 'up') }"
          @click="handleDirectionMove('up')"
        >
          &#x2B06;
        </button>
        <button
          type="button"
          class="dpad-btn"
          :class="{ active: selectedPieceMoves.some(m => m.key === 'left') }"
          @click="handleDirectionMove('left')"
        >
          &#x2B05;
        </button>
        <button
          type="button"
          class="dpad-btn"
          :class="{ active: selectedPieceMoves.some(m => m.key === 'down') }"
          @click="handleDirectionMove('down')"
        >
          &#x2B07;
        </button>
        <button
          type="button"
          class="dpad-btn"
          :class="{ active: selectedPieceMoves.some(m => m.key === 'right') }"
          @click="handleDirectionMove('right')"
        >
          &#x27A1;
        </button>
      </div>

      <div class="game-hint">点击棋子选中，再用方向键移动</div>

      <!-- 胜利覆盖 -->
      <div v-if="solved" class="game-overlay game-overlay-win">
        <div class="game-overlay-text">&#x1F389; 通关成功!</div>
        <div class="game-overlay-info">用了 {{ moves }} 步{{ bestSteps === moves ? ' · 新纪录!' : '' }}</div>
        <button type="button" class="game-overlay-btn" @click="newGame">再来一局</button>
      </div>
    </div>
  </div>
</template>
