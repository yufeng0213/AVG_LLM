/**
 * useGame2048.js - 2048 游戏纯逻辑
 */
import { ref, computed } from 'vue'
import { kvStorage } from '../../../../../../src/storage/index.js'

const BOARD_SIZE = 4

export function useGame2048(storageKey = 'phone_2048') {
  const grid = ref(Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0)))
  const score = ref(0)
  const bestScore = ref(0)
  const gameOver = ref(false)
  const won = ref(false)
  const mergedCells = ref([]) // 用于动画
  const newCells = ref([])   // 用于动画

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

  function getEmptyCells() {
    const cells = []
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (grid.value[r][c] === 0) cells.push({ r, c })
      }
    }
    return cells
  }

  function spawnRandomTile() {
    const empty = getEmptyCells()
    if (empty.length === 0) return null
    const pick = empty[Math.floor(Math.random() * empty.length)]
    const value = Math.random() < 0.9 ? 2 : 4
    grid.value[pick.r][pick.c] = value
    return { r: pick.r, c: pick.c, value }
  }

  function newGame() {
    grid.value = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0))
    score.value = 0
    gameOver.value = false
    won.value = false
    mergedCells.value = []
    newCells.value = []
    spawnRandomTile()
    const tile2 = spawnRandomTile()
    if (tile2) newCells.value.push({ r: tile2.r, c: tile2.c })
  }

  function hasAvailableMoves() {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (grid.value[r][c] === 0) return true
        if (r + 1 < BOARD_SIZE && grid.value[r + 1][c] === grid.value[r][c]) return true
        if (c + 1 < BOARD_SIZE && grid.value[r][c + 1] === grid.value[r][c]) return true
      }
    }
    return false
  }

  function collapseLine(line) {
    const compact = line.filter(v => v !== 0)
    const nextLine = []
    let gained = 0
    const mergedIndices = [] // 记录合并位置

    for (let i = 0; i < compact.length; i++) {
      const current = compact[i]
      const next = compact[i + 1]
      if (next !== undefined && next === current) {
        const merged = current * 2
        nextLine.push(merged)
        gained += merged
        mergedIndices.push(nextLine.length - 1)
        i++
      } else {
        nextLine.push(current)
      }
    }

    while (nextLine.length < BOARD_SIZE) {
      nextLine.push(0)
    }

    return { line: nextLine, gained, mergedIndices }
  }

  function move(direction) {
    if (gameOver.value) return false

    const current = grid.value.map(row => [...row])
    const next = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0))
    let moved = false
    let gained = 0
    const newMerged = []
    const newNew = []

    if (direction === 'left' || direction === 'right') {
      for (let row = 0; row < BOARD_SIZE; row++) {
        const original = [...current[row]]
        const working = direction === 'right' ? [...original].reverse() : [...original]
        const result = collapseLine(working)
        const restored = direction === 'right' ? [...result.line].reverse() : [...result.line]
        next[row] = restored

        for (const idx of result.mergedIndices) {
          const actualCol = direction === 'right' ? BOARD_SIZE - 1 - idx : idx
          newMerged.push({ r: row, c: actualCol })
        }

        if (!moved && restored.some((v, i) => v !== original[i])) moved = true
        gained += result.gained
      }
    } else if (direction === 'up' || direction === 'down') {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const original = []
        for (let row = 0; row < BOARD_SIZE; row++) original.push(current[row][col])

        const working = direction === 'down' ? [...original].reverse() : [...original]
        const result = collapseLine(working)
        const restored = direction === 'down' ? [...result.line].reverse() : [...result.line]

        for (let row = 0; row < BOARD_SIZE; row++) next[row][col] = restored[row]

        for (const idx of result.mergedIndices) {
          const actualRow = direction === 'down' ? BOARD_SIZE - 1 - idx : idx
          newMerged.push({ r: actualRow, c: col })
        }

        if (!moved && restored.some((v, i) => v !== original[i])) moved = true
        gained += result.gained
      }
    }

    if (!moved) return false

    // Spawn new tile
    grid.value = next
    score.value += gained
    mergedCells.value = newMerged
    const tile = spawnRandomTile()
    if (tile) newNew.push({ r: tile.r, c: tile.c })
    newCells.value = newNew

    // Check win
    const maxTile = grid.value.flat().reduce((max, v) => Math.max(max, v), 0)
    if (maxTile >= 2048) won.value = true

    // Update best
    if (score.value > bestScore.value) {
      bestScore.value = score.value
      saveBest()
    }

    // Check game over
    if (!hasAvailableMoves()) gameOver.value = true

    return true
  }

  // Tile color helper
  function tileStyle(value) {
    const colors = {
      0:   { bg: 'rgba(255,255,255,0.08)', color: 'transparent' },
      2:   { bg: '#eee4da', color: '#776e65' },
      4:   { bg: '#ede0c8', color: '#776e65' },
      8:   { bg: '#f2b179', color: '#f9f6f2' },
      16:  { bg: '#f59563', color: '#f9f6f2' },
      32:  { bg: '#f67c5f', color: '#f9f6f2' },
      64:  { bg: '#f65e3b', color: '#f9f6f2' },
      128: { bg: '#edcf72', color: '#f9f6f2' },
      256: { bg: '#edcc61', color: '#f9f6f2' },
      512: { bg: '#edc850', color: '#f9f6f2' },
      1024:{ bg: '#edc53f', color: '#f9f6f2' },
      2048:{ bg: '#edc22e', color: '#f9f6f2' },
    }
    return colors[value] || { bg: '#3c3a32', color: '#f9f6f2' }
  }

  loadBest()

  return {
    grid,
    score,
    bestScore,
    gameOver,
    won,
    mergedCells,
    newCells,
    newGame,
    move,
    tileStyle,
  }
}
