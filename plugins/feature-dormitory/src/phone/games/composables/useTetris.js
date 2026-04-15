/**
 * useTetris.js - 俄罗斯方块游戏纯逻辑
 */
import { ref, computed } from 'vue'
import { kvStorage } from '../../../../../../src/storage/index.js'

const ROWS = 20
const COLS = 10
const DROP_INTERVAL_MS = 760
const MIN_DROP_INTERVAL_MS = 140
const DROP_STEP_MS = 58
const SCORE_PER_LINE = [0, 100, 300, 500, 800]

const PIECES = {
  I: { matrix: [[1,1,1,1]], color: 1 },
  O: { matrix: [[1,1],[1,1]], color: 2 },
  T: { matrix: [[0,1,0],[1,1,1]], color: 3 },
  S: { matrix: [[0,1,1],[1,1,0]], color: 4 },
  Z: { matrix: [[1,1,0],[0,1,1]], color: 5 },
  J: { matrix: [[1,0,0],[1,1,1]], color: 6 },
  L: { matrix: [[0,0,1],[1,1,1]], color: 7 },
}
const TYPES = Object.keys(PIECES)

const COLORS = {
  1: '#00f0f0', // I - cyan
  2: '#f0f000', // O - yellow
  3: '#a000f0', // T - purple
  4: '#00f000', // S - green
  5: '#f00000', // Z - red
  6: '#0000f0', // J - blue
  7: '#f0a000', // L - orange
}

function getMatrix(type, rotation = 0) {
  let matrix = PIECES[type].matrix.map(row => [...row])
  for (let i = 0; i < (rotation % 4); i++) {
    const rows = matrix.length
    const cols = matrix[0].length
    const rotated = Array.from({ length: cols }, () => Array(rows).fill(0))
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        rotated[c][rows - 1 - r] = matrix[r][c]
      }
    }
    matrix = rotated
  }
  return matrix
}

export function useTetris(storageKey = 'phone_tetris') {
  const board = ref(Array.from({ length: ROWS }, () => Array(COLS).fill(0)))
  const current = ref(null)   // { type, row, col, rotation }
  const nextType = ref('T')
  const score = ref(0)
  const lines = ref(0)
  const level = ref(1)
  const over = ref(false)
  const bestScore = ref(0)
  const bestScoreKey = storageKey + '_best'

  let timerId = null

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

  function randomType() {
    return TYPES[Math.floor(Math.random() * TYPES.length)]
  }

  function isValidPlacement(piece, row, col, rotation = piece.rotation) {
    const matrix = getMatrix(piece.type, rotation)
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue
        const nr = row + r, nc = col + c
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return false
        if (board.value[nr][nc] !== 0) return false
      }
    }
    return true
  }

  function spawnPiece() {
    const type = nextType.value
    nextType.value = randomType()
    const matrix = getMatrix(type, 0)
    const col = Math.floor((COLS - matrix[0].length) / 2)
    const piece = { type, row: 0, col, rotation: 0 }

    if (!isValidPlacement(piece, 0, col, 0)) {
      over.value = true
      stopTimer()
      if (score.value > bestScore.value) {
        bestScore.value = score.value
        saveBest()
      }
      return
    }
    current.value = piece
  }

  function lockPiece() {
    const piece = current.value
    if (!piece) return

    const matrix = getMatrix(piece.type, piece.rotation)
    const color = PIECES[piece.type].color

    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue
        const nr = piece.row + r, nc = piece.col + c
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
          board.value[nr][nc] = color
        }
      }
    }

    // Clear lines
    let cleared = 0
    const nextRows = []
    for (let r = 0; r < ROWS; r++) {
      if (board.value[r].every(v => v !== 0)) {
        cleared++
        continue
      }
      nextRows.push([...board.value[r]])
    }
    while (nextRows.length < ROWS) nextRows.unshift(Array(COLS).fill(0))

    if (cleared > 0) {
      board.value = nextRows
      lines.value += cleared
      score.value += (SCORE_PER_LINE[cleared] || 0) * level.value
      const nextLevel = Math.floor(lines.value / 10) + 1
      if (nextLevel !== level.value) {
        level.value = nextLevel
        restartTimer()
      }
    }

    if (score.value > bestScore.value) {
      bestScore.value = score.value
      saveBest()
    }

    spawnPiece()
  }

  function moveDown() {
    if (!current.value || over.value) return false
    const { row, col } = current.value
    if (!isValidPlacement(current.value, row + 1, col)) {
      lockPiece()
      return false
    }
    current.value = { ...current.value, row: row + 1 }
    return true
  }

  function moveLeft() {
    if (!current.value || over.value) return
    if (isValidPlacement(current.value, current.value.row, current.value.col - 1)) {
      current.value = { ...current.value, col: current.value.col - 1 }
    }
  }

  function moveRight() {
    if (!current.value || over.value) return
    if (isValidPlacement(current.value, current.value.row, current.value.col + 1)) {
      current.value = { ...current.value, col: current.value.col + 1 }
    }
  }

  function rotate() {
    if (!current.value || over.value) return
    const nextRotation = (current.value.rotation + 1) % 4
    const kicks = [0, -1, 1, -2, 2]
    for (const offset of kicks) {
      if (isValidPlacement(current.value, current.value.row, current.value.col + offset, nextRotation)) {
        current.value = { ...current.value, rotation: nextRotation, col: current.value.col + offset }
        return
      }
    }
  }

  function hardDrop() {
    if (!current.value || over.value) return
    let dropDistance = 0
    while (isValidPlacement(current.value, current.value.row + 1, current.value.col)) {
      current.value = { ...current.value, row: current.value.row + 1 }
      dropDistance++
    }
    score.value += dropDistance * 2
    lockPiece()
  }

  function getDropInterval() {
    return Math.max(MIN_DROP_INTERVAL_MS, DROP_INTERVAL_MS - (level.value - 1) * DROP_STEP_MS)
  }

  function startTimer() {
    if (timerId || over.value || !current.value) return
    timerId = setInterval(() => {
      moveDown()
    }, getDropInterval())
  }

  function restartTimer() {
    stopTimer()
    startTimer()
  }

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null }
  }

  function newGame() {
    stopTimer()
    board.value = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
    score.value = 0
    lines.value = 0
    level.value = 1
    over.value = false
    nextType.value = randomType()
    current.value = null
    spawnPiece()
    startTimer()
  }

  // Build display cells for rendering - flat array like original
  const displayCells = computed(() => {
    const display = board.value.map(row => [...row])
    if (current.value && !over.value) {
      const matrix = getMatrix(current.value.type, current.value.rotation)
      const color = PIECES[current.value.type].color
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue
          const nr = current.value.row + r, nc = current.value.col + c
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
            display[nr][nc] = color
          }
        }
      }
    }
    // Flatten to {key, value} like original HandheldConsole
    const result = []
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        result.push({ key: `b_${r}_${c}`, value: display[r][c], row: r, col: c })
      }
    }
    return result
  })

  const nextPieceCells = computed(() => {
    const size = 4
    const preview = Array.from({ length: size }, () => Array(size).fill(0))
    const matrix = getMatrix(nextType.value, 0)
    const color = PIECES[nextType.value].color
    const offsetRow = Math.floor((size - matrix.length) / 2)
    const offsetCol = Math.floor((size - matrix[0].length) / 2)
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue
        preview[r + offsetRow][c + offsetCol] = color
      }
    }
    // Flatten to {key, value} like original
    const result = []
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        result.push({ key: `n_${r}_${c}`, value: preview[r][c] })
      }
    }
    return result
  })

  loadBest()

  return {
    board: displayCells,
    current,
    nextType,
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
    getDropInterval,
    COLORS,
    PIECES,
    ROWS,
    COLS,
  }
}
