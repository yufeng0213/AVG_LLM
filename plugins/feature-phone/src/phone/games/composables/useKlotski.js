/**
 * useKlotski.js - 华容道游戏纯逻辑
 */
import { ref, computed } from 'vue'
import { kvStorage } from '../../../../../../src/storage/index.js'

const ROWS = 5
const COLS = 4

const TEMPLATES = [
  { id: 'cao', label: '曹操', width: 2, height: 2, kind: 'cao' },
  { id: 'v1', label: '关', width: 1, height: 2, kind: 'general' },
  { id: 'v2', label: '张', width: 1, height: 2, kind: 'general' },
  { id: 'v3', label: '赵', width: 1, height: 2, kind: 'general' },
  { id: 'v4', label: '马', width: 1, height: 2, kind: 'general' },
  { id: 'h1', label: '黄忠', width: 2, height: 1, kind: 'general' },
  { id: 's1', label: '兵', width: 1, height: 1, kind: 'soldier' },
  { id: 's2', label: '兵', width: 1, height: 1, kind: 'soldier' },
  { id: 's3', label: '兵', width: 1, height: 1, kind: 'soldier' },
  { id: 's4', label: '兵', width: 1, height: 1, kind: 'soldier' },
]

const DIRECTIONS = [
  { key: 'up', dx: 0, dy: -1 },
  { key: 'down', dx: 0, dy: 1 },
  { key: 'left', dx: -1, dy: 0 },
  { key: 'right', dx: 1, dy: 0 },
]

// Classic starting positions (横刀立马 layout)
const CLASSIC_START = {
  cao: [1, 0],
  v1: [0, 0],
  v2: [3, 0],
  v3: [0, 2],
  v4: [3, 2],
  h1: [1, 2],
  s1: [1, 3],
  s2: [2, 3],
  s3: [0, 4],
  s4: [3, 4],
}

// Solved: 曹操 at bottom center
const SOLVED_CHECK = { col: 1, row: 3 } // 曹操's top-left should be at (1, 3)

export function useKlotski(storageKey = 'phone_klotski') {
  const pieces = ref([])
  const moves = ref(0)
  const bestSteps = ref(0)
  const solved = ref(false)
  const selectedPieceId = ref('cao')

  const bestStepsKey = storageKey + '_best'

  async function loadBest() {
    try {
      const saved = await kvStorage.get(bestStepsKey)
      if (saved) bestSteps.value = saved
    } catch { /* no-op */ }
  }

  async function saveBest() {
    try {
      await kvStorage.set(bestStepsKey, bestSteps.value)
    } catch { /* no-op */ }
  }

  function createPieces(positionsMap) {
    return TEMPLATES.map(t => ({
      ...t,
      x: positionsMap[t.id][0],
      y: positionsMap[t.id][1],
    }))
  }

  function createOccupancy() {
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(''))
    for (const p of pieces.value) {
      for (let dy = 0; dy < p.height; dy++) {
        for (let dx = 0; dx < p.width; dx++) {
          const gx = p.x + dx
          const gy = p.y + dy
          if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) {
            grid[gy][gx] = p.id
          }
        }
      }
    }
    return grid
  }

  function canMove(piece, dx, dy, occupancy) {
    for (let dy2 = 0; dy2 < piece.height; dy2++) {
      for (let dx2 = 0; dx2 < piece.width; dx2++) {
        const tx = piece.x + dx2 + dx
        const ty = piece.y + dy2 + dy
        if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return false
        const cell = occupancy[ty][tx]
        if (cell !== '' && cell !== piece.id) return false
      }
    }
    return true
  }

  function getAvailableMoves(pieceId) {
    const occupancy = createOccupancy()
    const piece = pieces.value.find(p => p.id === pieceId)
    if (!piece) return []

    const result = []
    for (const dir of DIRECTIONS) {
      if (canMove(piece, dir.dx, dir.dy, occupancy)) {
        result.push({ key: dir.key, dx: dir.dx, dy: dir.dy, pieceId })
      }
    }
    return result
  }

  function applyMove(move) {
    const piece = pieces.value.find(p => p.id === move.pieceId)
    if (!piece) return false

    const occupancy = createOccupancy()
    if (!canMove(piece, move.dx, move.dy, occupancy)) return false

    piece.x += move.dx
    piece.y += move.dy
    moves.value++

    // Check if 曹操 reached the exit
    const cao = pieces.value.find(p => p.id === 'cao')
    if (cao && cao.x === SOLVED_CHECK.col && cao.y === SOLVED_CHECK.row) {
      solved.value = true
      if (bestSteps.value === 0 || moves.value < bestSteps.value) {
        bestSteps.value = moves.value
        saveBest()
      }
    }

    return true
  }

  function moveDirection(pieceId, directionKey) {
    if (solved.value) return false
    const dir = DIRECTIONS.find(d => d.key === directionKey)
    if (!dir) return false
    return applyMove({ pieceId, dx: dir.dx, dy: dir.dy })
  }

  function selectPiece(pieceId) {
    selectedPieceId.value = pieceId
    // Auto-move if only one direction available
    const availMoves = getAvailableMoves(pieceId)
    if (availMoves.length === 1) {
      applyMove(availMoves[0])
    }
  }

  function newGame() {
    pieces.value = createPieces(CLASSIC_START)
    moves.value = 0
    solved.value = false
    selectedPieceId.value = 'cao'
  }

  // Build a grid for rendering occupied cells
  const boardCells = computed(() => {
    const cells = {}
    for (const p of pieces.value) {
      for (let dy = 0; dy < p.height; dy++) {
        for (let dx = 0; dx < p.width; dx++) {
          const key = `${p.x + dx},${p.y + dy}`
          cells[key] = p.id
        }
      }
    }
    return cells
  })

  // Available moves for selected piece
  const selectedPieceMoves = computed(() => {
    return getAvailableMoves(selectedPieceId.value)
  })

  const caoPiece = computed(() => pieces.value.find(p => p.id === 'cao'))

  loadBest()
  newGame()

  return {
    pieces,
    moves,
    bestSteps,
    solved,
    selectedPieceId,
    boardCells,
    selectedPieceMoves,
    caoPiece,
    ROWS,
    COLS,
    newGame,
    moveDirection,
    selectPiece,
    getAvailableMoves,
    applyMove,
  }
}
