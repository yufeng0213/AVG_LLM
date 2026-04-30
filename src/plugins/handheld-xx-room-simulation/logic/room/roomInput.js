// 房间交互输入处理 - 指针事件、拖拽状态

import { ROOM_CELL_SIZE } from '../../config/constants.js'

// 解析指针位置到网格坐标
export const resolveRoomPointerCell = (clientX, clientY, boardElement, cellSize = ROOM_CELL_SIZE) => {
  if (!boardElement) return { x: 0, y: 0 }

  const rect = boardElement.getBoundingClientRect()
  const x = (clientX - rect.left) / cellSize
  const y = (clientY - rect.top) / cellSize

  return {
    x: Math.floor(x),
    y: Math.floor(y),
    exactX: x,
    exactY: y,
  }
}

// 构建拖拽状态
export const buildRoomDragState = (options = {}) => {
  const {
    event = null,
    furniture = null,
    point = { x: 0, y: 0 },
    cellSize = ROOM_CELL_SIZE,
  } = options || {}

  if (!event || !furniture) return null

  const offsetX = point.exactX - furniture.x
  const offsetY = point.exactY - furniture.y

  return {
    pointerId: event.pointerId || 0,
    furnitureId: furniture.id,
    width: furniture.width || 1,
    height: furniture.height || 1,
    startX: furniture.x || 0,
    startY: furniture.y || 0,
    offsetX: Math.max(0, Math.min(furniture.width - 1, offsetX)),
    offsetY: Math.max(0, Math.min(furniture.height - 1, offsetY)),
    startTime: Date.now(),
  }
}

// 解析拖拽位置（带边界限制）
export const resolveRoomDragPosition = (point, room, dragState, clampInt) => {
  if (!point || !room || !dragState) return null

  const maxX = room.width - dragState.width
  const maxY = room.height - dragState.height

  const fallbackClampInt = (value, min, max, fallback) => {
    const parsed = Number.parseInt(String(value), 10)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(max, Math.max(min, parsed))
  }

  const clamp = typeof clampInt === 'function' ? clampInt : fallbackClampInt

  return {
    x: clamp(Math.round(point.exactX - dragState.offsetX), 0, maxX, dragState.startX),
    y: clamp(Math.round(point.exactY - dragState.offsetY), 0, maxY, dragState.startY),
  }
}

// 检测矩形碰撞
export const isRoomRectOverlap = (rectA, rectB) => {
  if (!rectA || !rectB) return false
  return !(
    rectA.x + rectA.width <= rectB.x ||
    rectB.x + rectB.width <= rectA.x ||
    rectA.y + rectA.height <= rectB.y ||
    rectB.y + rectB.height <= rectA.y
  )
}

// 检测家具是否与现有家具碰撞
export const checkFurnitureCollision = (newFurniture, existingFurniture, excludeId = '') => {
  for (const existing of existingFurniture) {
    if (existing.id === excludeId) continue
    if (isRoomRectOverlap(newFurniture, existing)) {
      return true
    }
  }
  return false
}

// 检测家具是否在墙内
export const checkFurnitureInWall = (furniture, tiles, roomWidth, roomHeight) => {
  for (let dx = 0; dx < furniture.width; dx++) {
    for (let dy = 0; dy < furniture.height; dy++) {
      const x = furniture.x + dx
      const y = furniture.y + dy
      const tile = tiles.find(t => t.x === x && t.y === y)
      if (tile?.type === 'wall') {
        return true
      }
    }
  }
  return false
}

// 验证家具放置位置
export const validateFurniturePlacement = (furniture, room, excludeId = '') => {
  const newRect = {
    x: furniture.x,
    y: furniture.y,
    width: furniture.width,
    height: furniture.height,
  }

  // 检查边界
  if (newRect.x < 0 || newRect.y < 0 ||
      newRect.x + newRect.width > room.width ||
      newRect.y + newRect.height > room.height) {
    return { valid: false, reason: 'out_of_bounds' }
  }

  // 检查墙内
  if (checkFurnitureInWall(newRect, room.tiles, room.width, room.height)) {
    return { valid: false, reason: 'in_wall' }
  }

  // 检查碰撞
  if (checkFurnitureCollision(newRect, room.furniture, excludeId)) {
    return { valid: false, reason: 'collision' }
  }

  return { valid: true, reason: '' }
}

export default {
  resolveRoomPointerCell,
  buildRoomDragState,
  resolveRoomDragPosition,
  isRoomRectOverlap,
  checkFurnitureCollision,
  checkFurnitureInWall,
  validateFurniturePlacement,
}