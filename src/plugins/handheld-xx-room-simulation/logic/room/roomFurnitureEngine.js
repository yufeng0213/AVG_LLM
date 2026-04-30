// 家具引擎 - 家具数据结构、放置、碰撞检测

import {
  MAX_ROOM_FURNITURE_ITEMS,
} from '../../config/constants.js'

import {
  isRoomRectOverlap,
  checkFurnitureCollision,
  checkFurnitureInWall,
  validateFurniturePlacement,
} from './roomInput.js'

// 家具类型定义
export const FURNITURE_CATALOG = [
  {
    id: 'bed-single',
    name: '单人床',
    kind: 'sleep',
    width: 2,
    height: 1,
    walkable: false,
    interactable: true,
    interactionType: 'sleep',
    needsSatisfied: { rest: 0.8 },
    spriteSpec: { motif: 'bed', palette: 'oak', silhouette: 'compact', ornament: 'cushion', glow: 0, seed: 100 },
  },
  {
    id: 'bed-double',
    name: '双人床',
    kind: 'sleep',
    width: 3,
    height: 2,
    walkable: false,
    interactable: true,
    interactionType: 'sleep',
    needsSatisfied: { rest: 0.85, comfort: 0.2 },
    spriteSpec: { motif: 'bed', palette: 'walnut', silhouette: 'wide', ornament: 'cushion', glow: 0, seed: 200 },
  },
  {
    id: 'desk-work',
    name: '工作台',
    kind: 'work',
    width: 2,
    height: 1,
    walkable: false,
    interactable: true,
    interactionType: 'work',
    workType: 'crafting',
    workDuration: 120,
    needsSatisfied: { work_satisfaction: 0.3 },
    spriteSpec: { motif: 'desk', palette: 'oak', silhouette: 'compact', ornament: 'rune', glow: 0, seed: 300 },
  },
  {
    id: 'stove-cooking',
    name: '炉灶',
    kind: 'food',
    width: 2,
    height: 1,
    walkable: false,
    interactable: true,
    interactionType: 'work',
    workType: 'cooking',
    workDuration: 180,
    needsSatisfied: { work_satisfaction: 0.25 },
    spriteSpec: { motif: 'stove', palette: 'iron', silhouette: 'compact', ornament: 'rune', glow: 1, seed: 400 },
  },
  {
    id: 'table-dining',
    name: '餐桌',
    kind: 'social',
    width: 2,
    height: 2,
    walkable: false,
    interactable: true,
    interactionType: 'eat',
    needsSatisfied: { hunger: 0.3, social: 0.2 },
    spriteSpec: { motif: 'table', palette: 'pine', silhouette: 'wide', ornament: 'border', glow: 0, seed: 500 },
  },
  {
    id: 'chair-simple',
    name: '椅子',
    kind: 'utility',
    width: 1,
    height: 1,
    walkable: false,
    interactable: true,
    interactionType: 'none',
    needsSatisfied: { comfort: 0.15 },
    spriteSpec: { motif: 'chair', palette: 'oak', silhouette: 'compact', ornament: 'none', glow: 0, seed: 600 },
  },
  {
    id: 'cabinet-storage',
    name: '收纳柜',
    kind: 'storage',
    width: 2,
    height: 2,
    walkable: false,
    interactable: true,
    interactionType: 'storage',
    needsSatisfied: {},
    spriteSpec: { motif: 'cabinet', palette: 'walnut', silhouette: 'tall', ornament: 'drawer', glow: 0, seed: 700 },
  },
  {
    id: 'shelf-book',
    name: '书架',
    kind: 'storage',
    width: 2,
    height: 1,
    walkable: false,
    interactable: true,
    interactionType: 'work',
    workType: 'research',
    workDuration: 240,
    needsSatisfied: { work_satisfaction: 0.2, joy: 0.1 },
    spriteSpec: { motif: 'shelf', palette: 'oak', silhouette: 'tall', ornament: 'rune', glow: 0, seed: 800 },
  },
  {
    id: 'plant-decor',
    name: '盆栽',
    kind: 'decor',
    width: 1,
    height: 1,
    walkable: true,
    interactable: false,
    interactionType: 'none',
    needsSatisfied: { comfort: 0.1, joy: 0.05 },
    spriteSpec: { motif: 'plant', palette: 'mint', silhouette: 'compact', ornament: 'leaf', glow: 0, seed: 900 },
  },
  {
    id: 'lamp-floor',
    name: '落地灯',
    kind: 'decor',
    width: 1,
    height: 1,
    walkable: true,
    interactable: false,
    interactionType: 'none',
    needsSatisfied: { comfort: 0.08 },
    spriteSpec: { motif: 'lamp', palette: 'iron', silhouette: 'tall', ornament: 'rune', glow: 1, seed: 1000 },
  },
  {
    id: 'rug-floor',
    name: '地毯',
    kind: 'floor',
    width: 3,
    height: 2,
    walkable: true,
    interactable: false,
    interactionType: 'none',
    needsSatisfied: { comfort: 0.12 },
    spriteSpec: { motif: 'rug', palette: 'rose', silhouette: 'wide', ornament: 'border', glow: 0, seed: 1100 },
  },
  {
    id: 'sofa-relax',
    name: '沙发',
    kind: 'sleep',
    width: 3,
    height: 1,
    walkable: false,
    interactable: true,
    interactionType: 'sleep',
    needsSatisfied: { rest: 0.5, comfort: 0.4 },
    spriteSpec: { motif: 'sofa', palette: 'violet', silhouette: 'wide', ornament: 'cushion', glow: 0, seed: 1200 },
  },
]

// 需求类型到家具类型的映射
export const NEED_TO_INTERACTION_MAP = {
  hunger: ['eat', 'food'],
  rest: ['sleep', 'sleep'],
  comfort: ['none', 'decor', 'utility'],
  joy: ['social', 'decor'],
  social: ['social'],
  work_satisfaction: ['work'],
}

const fallbackMakeId = (prefix = 'furn') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const fallbackRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

export const createRoomFurnitureEngine = (deps = {}) => {
  const makeId = typeof deps.makeId === 'function' ? deps.makeId : fallbackMakeId
  const randomInt = typeof deps.randomInt === 'function' ? deps.randomInt : fallbackRandomInt

  // 创建家具实例
  const createFurnitureInstance = (catalogItem, x, y, customSpec = null) => {
    const base = catalogItem && typeof catalogItem === 'object' ? catalogItem : FURNITURE_CATALOG[0]
    return {
      ...base,
      id: makeId('furn'),
      x: Math.max(0, Number(x) || 0),
      y: Math.max(0, Number(y) || 0),
      z: base.kind === 'floor' ? 0 : 10 + randomInt(0, 50),
      spriteSpec: customSpec || { ...base.spriteSpec },
    }
  }

  // 找到能满足指定需求的家具
  const findFurnitureForNeed = (needType, room, pawnPosition) => {
    const furniture = room?.furniture || []
    const candidates = furniture.filter(f =>
      f.needsSatisfied && f.needsSatisfied[needType] > 0 && f.interactable
    )

    if (candidates.length === 0) return null

    // 选择最近的家具
    let nearest = null
    let minDist = Infinity

    for (const f of candidates) {
      const dist = Math.abs(f.x - pawnPosition.x) + Math.abs(f.y - pawnPosition.y)
      if (dist < minDist) {
        minDist = dist
        nearest = f
      }
    }

    return nearest
  }

  // 找到能执行指定工作类型的家具
  const findFurnitureForWork = (workType, room) => {
    const furniture = room?.furniture || []
    return furniture.find(f =>
      f.workType === workType && f.interactable
    ) || null
  }

  // 自动放置家具
  const autoPlaceFurniture = (room, catalogItem, maxAttempts = 20) => {
    if (!room || !catalogItem) return null

    const maxX = room.width - catalogItem.width
    const maxY = room.height - catalogItem.height

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = randomInt(1, maxX - 1) // 避开墙
      const y = randomInt(1, maxY - 1)

      const candidate = createFurnitureInstance(catalogItem, x, y)
      const validation = validateFurniturePlacement(candidate, room)

      if (validation.valid) {
        return candidate
      }
    }

    // 如果随机失败，尝试从角落开始
    for (let x = 1; x <= maxX; x++) {
      for (let y = 1; y <= maxY; y++) {
        const candidate = createFurnitureInstance(catalogItem, x, y)
        const validation = validateFurniturePlacement(candidate, room)
        if (validation.valid) {
          return candidate
        }
      }
    }

    return null
  }

  // 批量添加家具
  const addFurnitureBatch = (room, furnitureList, validate = true) => {
    const result = []
    for (const item of furnitureList) {
      if (room.furniture.length >= MAX_ROOM_FURNITURE_ITEMS) break

      const instance = createFurnitureInstance(item, item.x || 0, item.y || 0)
      if (validate) {
        const validation = validateFurniturePlacement(instance, room)
        if (!validation.valid) continue
      }
      result.push(instance)
      room.furniture.push(instance)
    }
    return result
  }

  // 移除家具
  const removeFurniture = (room, furnitureId) => {
    const index = room?.furniture?.findIndex(f => f.id === furnitureId)
    if (index >= 0) {
      room.furniture.splice(index, 1)
      return true
    }
    return false
  }

  // 获取家具占用的所有格子
  const getFurnitureCells = (furniture) => {
    const cells = []
    for (let dx = 0; dx < furniture.width; dx++) {
      for (let dy = 0; dy < furniture.height; dy++) {
        cells.push({
          x: furniture.x + dx,
          y: furniture.y + dy,
        })
      }
    }
    return cells
  }

  // 获取家具中心位置（用于寻路目标）
  const getFurnitureCenter = (furniture) => {
    return {
      x: furniture.x + Math.floor(furniture.width / 2),
      y: furniture.y + Math.floor(furniture.height / 2),
    }
  }

  return {
    createFurnitureInstance,
    findFurnitureForNeed,
    findFurnitureForWork,
    autoPlaceFurniture,
    addFurnitureBatch,
    removeFurniture,
    getFurnitureCells,
    getFurnitureCenter,
    validateFurniturePlacement,
    isRoomRectOverlap,
    checkFurnitureCollision,
    checkFurnitureInWall,
  }
}

export default createRoomFurnitureEngine