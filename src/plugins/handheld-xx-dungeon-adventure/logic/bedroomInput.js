const fallbackClampInt = (value, min, max, fallback) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

const clampBy = (clampInt, value, min, max, fallback) => {
  if (typeof clampInt === 'function') return clampInt(value, min, max, fallback)
  return fallbackClampInt(value, min, max, fallback)
}

export const resolveBedroomPointerCell = (clientX, clientY, boardElement = null, cellSize = 0) => {
  const rect = boardElement?.getBoundingClientRect?.()
  const cell = Number(cellSize) || 0
  if (!rect || rect.width <= 0 || rect.height <= 0 || cell <= 0) return null
  return {
    x: (clientX - rect.left) / cell,
    y: (clientY - rect.top) / cell,
  }
}

export const resolveBedroomDragPosition = (point, room, dragState, clampInt = null) => {
  if (!point || !room || !dragState) return null
  const maxX = Math.max(0, (Number(room.width) || 0) - (Number(dragState.width) || 0))
  const maxY = Math.max(0, (Number(room.height) || 0) - (Number(dragState.height) || 0))
  return {
    x: clampBy(
      clampInt,
      Math.round((Number(point.x) || 0) - (Number(dragState.offsetX) || 0)),
      0,
      maxX,
      Number(dragState.startX) || 0,
    ),
    y: clampBy(
      clampInt,
      Math.round((Number(point.y) || 0) - (Number(dragState.offsetY) || 0)),
      0,
      maxY,
      Number(dragState.startY) || 0,
    ),
  }
}

export const buildBedroomDragState = (options = {}) => {
  const {
    event = null,
    item = null,
    point = null,
    clampInt = null,
    gridWidth = 12,
    gridHeight = 8,
  } = options || {}

  const itemId = String(item?.id || '').trim()
  if (!event || !item || !point || !itemId) return null

  return {
    pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
    itemId,
    offsetX: (Number(point.x) || 0) - clampBy(clampInt, item?.x, 0, gridWidth, 0),
    offsetY: (Number(point.y) || 0) - clampBy(clampInt, item?.y, 0, gridHeight, 0),
    width: clampBy(clampInt, item?.width, 1, 4, 1),
    height: clampBy(clampInt, item?.height, 1, 4, 1),
    startX: clampBy(clampInt, item?.x, 0, gridWidth, 0),
    startY: clampBy(clampInt, item?.y, 0, gridHeight, 0),
  }
}
