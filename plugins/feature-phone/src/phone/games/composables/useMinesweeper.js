/**
 * useMinesweeper.js - 扫雷游戏纯逻辑
 */
import { ref, computed } from 'vue'
import { kvStorage } from '../../../../../../src/storage/index.js'

const DIFFICULTIES = [
  { id: 'beginner', name: '初级', rows: 9, cols: 9, mines: 10 },
  { id: 'medium', name: '中级', rows: 11, cols: 11, mines: 20 },
  { id: 'hard', name: '高级', rows: 13, cols: 13, mines: 32 },
]

export function useMinesweeper(storageKey = 'phone_minesweeper') {
  const difficulty = ref('beginner')
  const rows = computed(() => DIFFICULTIES.find(d => d.id === difficulty.value)?.rows || 9)
  const cols = computed(() => DIFFICULTIES.find(d => d.id === difficulty.value)?.cols || 9)
  const mineCount = computed(() => DIFFICULTIES.find(d => d.id === difficulty.value)?.mines || 10)

  const board = ref([])
  const started = ref(false)
  const won = ref(false)
  const lost = ref(false)
  const flagCount = ref(0)
  const elapsed = ref(0)
  const bestTimes = ref({})
  let timerId = null

  const bestTimesKey = storageKey + '_best_times'

  async function loadBestTimes() {
    try {
      const saved = await kvStorage.get(bestTimesKey)
      if (saved) bestTimes.value = saved
    } catch { /* no-op */ }
  }

  async function saveBestTimes() {
    try {
      await kvStorage.set(bestTimesKey, bestTimes.value)
    } catch { /* no-op */ }
  }

  function createEmptyBoard() {
    return Array.from({ length: rows.value }, () =>
      Array.from({ length: cols.value }, () => ({
        mine: false,
        revealed: false,
        flagged: false,
        adjacent: 0,
      }))
    )
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  function startTimer() {
    if (timerId) return
    timerId = setInterval(() => { elapsed.value++ }, 1000)
  }

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null }
  }

  function placeMines(excludeRow, excludeCol) {
    // First click is always safe
    const safeCells = new Set()
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = excludeRow + dr
        const c = excludeCol + dc
        if (r >= 0 && r < rows.value && c >= 0 && c < cols.value) {
          safeCells.add(`${r},${c}`)
        }
      }
    }

    let placed = 0
    while (placed < mineCount.value) {
      const r = Math.floor(Math.random() * rows.value)
      const c = Math.floor(Math.random() * cols.value)
      if (safeCells.has(`${r},${c}`)) continue
      if (board.value[r][c].mine) continue
      board.value[r][c].mine = true
      placed++
    }

    // Calculate adjacent counts
    for (let r = 0; r < rows.value; r++) {
      for (let c = 0; c < cols.value; c++) {
        if (board.value[r][c].mine) continue
        let count = 0
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc
            if (nr >= 0 && nr < rows.value && nc >= 0 && nc < cols.value && board.value[nr][nc].mine) {
              count++
            }
          }
        }
        board.value[r][c].adjacent = count
      }
    }
  }

  function revealCell(r, c) {
    const cell = board.value[r][c]
    if (cell.revealed || cell.flagged) return false

    if (!started.value) {
      started.value = true
      placeMines(r, c)
      startTimer()
    }

    if (board.value[r][c].mine) {
      // Game over - reveal all mines
      for (let rr = 0; rr < rows.value; rr++) {
        for (let cc = 0; cc < cols.value; cc++) {
          if (board.value[rr][cc].mine) board.value[rr][cc].revealed = true
        }
      }
      lost.value = true
      stopTimer()
      return true
    }

    // Flood fill for empty cells
    function flood(r, c) {
      if (r < 0 || r >= rows.value || c < 0 || c >= cols.value) return
      const cell = board.value[r][c]
      if (cell.revealed || cell.flagged || cell.mine) return
      cell.revealed = true
      if (cell.adjacent === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue
            flood(r + dr, c + dc)
          }
        }
      }
    }

    flood(r, c)

    // Check win
    checkWin()
    return true
  }

  function toggleFlag(r, c) {
    const cell = board.value[r][c]
    if (cell.revealed) return
    cell.flagged = !cell.flagged
    flagCount.value = board.value.flat().filter(c => c.flagged).length
  }

  function checkWin() {
    for (let r = 0; r < rows.value; r++) {
      for (let c = 0; c < cols.value; c++) {
        if (!board.value[r][c].mine && !board.value[r][c].revealed) return
      }
    }
    won.value = true
    stopTimer()

    // Check best time
    const current = bestTimes.value[difficulty.value]
    if (!current || elapsed.value < current) {
      bestTimes.value[difficulty.value] = elapsed.value
      saveBestTimes()
    }
  }

  function newGame() {
    stopTimer()
    board.value = createEmptyBoard()
    started.value = false
    won.value = false
    lost.value = false
    flagCount.value = 0
    elapsed.value = 0
  }

  function getNumberColor(n) {
    const colors = ['', '#4d96ff', '#34c759', '#ff3b30', '#9b59b6', '#ff9500', '#00bcd4', '#333', '#888']
    return colors[n] || '#fff'
  }

  loadBestTimes()
  newGame()

  return {
    difficulty,
    difficulties: DIFFICULTIES,
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
  }
}
