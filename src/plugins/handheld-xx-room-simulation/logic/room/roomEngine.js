// 房间核心引擎 - 创建、规范化、克隆

import {
  ROOM_DEFAULT_WIDTH,
  ROOM_DEFAULT_HEIGHT,
  ROOM_GRID_MIN_WIDTH,
  ROOM_GRID_MAX_WIDTH,
  ROOM_GRID_MIN_HEIGHT,
  ROOM_GRID_MAX_HEIGHT,
  MAX_ROOM_FURNITURE_ITEMS,
} from '../../config/constants.js'

const fallbackClampInt = (value, min, max, fallback = min) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

const fallbackMakeId = (prefix = 'room') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const createRoomEngine = (deps = {}) => {
  const clampInt = typeof deps.clampInt === 'function' ? deps.clampInt : fallbackClampInt
  const makeId = typeof deps.makeId === 'function' ? deps.makeId : fallbackMakeId

  const createRoomCellId = (x, y) => `${x}:${y}`

  // 规范化单个 Tile
  const normalizeRoomTile = (rawTile, x, y, defaultPalette = null) => {
    const tile = rawTile && typeof rawTile === 'object' ? rawTile : {}
    const isWall = tile.type === 'wall' || (x === 0 || y === 0)
    const type = normalizeTileType(tile.type, isWall ? 'wall' : 'floor')

    return {
      id: tile.id || createRoomCellId(x, y),
      x,
      y,
      type,
      terrainId: String(tile.terrainId || `${type}-default`).slice(0, 32),
      terrainPalette: normalizePalette(tile.terrainPalette, getDefaultPaletteForType(type)),
      terrainPixels16: normalizePixels16(tile.terrainPixels16),
      passable: type !== 'wall' && Boolean(tile.passable !== false),
      speedModifier: Math.max(0.1, Math.min(2, Number(tile.speedModifier) || 1)),
    }
  }

  // 规范化 Tile 类型
  const normalizeTileType = (rawType, fallback = 'floor') => {
    const validTypes = ['floor', 'wall', 'door', 'window']
    const type = String(rawType || '').toLowerCase().trim()
    return validTypes.includes(type) ? type : fallback
  }

  // 规范化调色板
  const normalizePalette = (rawPalette, fallbackPalette) => {
    const fallback = Array.isArray(fallbackPalette) ? fallbackPalette : ['#00000000', '#5a4a3a', '#8a7a6a']
    const source = Array.isArray(rawPalette) ? rawPalette : []
    if (source.length < 2) return fallback.slice(0, 4)
    return source.slice(0, 4).map(c => normalizeColor(c))
  }

  // 规范化颜色值
  const normalizeColor = (rawColor, fallback = '#00000000') => {
    const color = String(rawColor || '').trim()
    if (/^#[0-9a-fA-F]{6,8}$/.test(color)) return color
    return fallback
  }

  // 规范化像素矩阵
  const normalizePixels16 = (rawPixels) => {
    if (!Array.isArray(rawPixels) || rawPixels.length < 16) return []
    return rawPixels.slice(0, 16).map(row => {
      const str = String(row || '')
      if (str.length < 16) return str.padEnd(16, '0').slice(0, 16)
      return str.slice(0, 16)
    })
  }

  // 获取类型默认调色板
  const getDefaultPaletteForType = (type) => {
    switch (type) {
      case 'wall':
        return ['#00000000', '#3a3a42', '#5a5a62', '#7a7a82']
      case 'door':
        return ['#00000000', '#6a5a4a', '#9a8a7a', '#cacaca']
      case 'window':
        return ['#00000000', '#4a6a8a', '#6a8aaa', '#8aaaca']
      default:
        return ['#00000000', '#5a4a3a', '#8a7a6a', '#baaa9a']
    }
  }

  // 规范化房间地图
  const normalizeRoomMap = (rawMap) => {
    if (!rawMap || typeof rawMap !== 'object') {
      return createDefaultRoomMap()
    }

    const width = clampInt(rawMap.width, ROOM_GRID_MIN_WIDTH, ROOM_GRID_MAX_WIDTH, ROOM_DEFAULT_WIDTH)
    const height = clampInt(rawMap.height, ROOM_GRID_MIN_HEIGHT, ROOM_GRID_MAX_HEIGHT, ROOM_DEFAULT_HEIGHT)

    const tiles = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const existingTile = Array.isArray(rawMap.tiles)
          ? rawMap.tiles.find(t => t.x === x && t.y === y)
          : null
        tiles.push(normalizeRoomTile(existingTile, x, y))
      }
    }

    const furniture = normalizeFurnitureList(rawMap.furniture, width, height)

    const doors = normalizeDoorList(rawMap.doors || rawMap.doorPositions, width, height)

    return {
      id: String(rawMap.id || makeId('room')).slice(0, 48),
      width,
      height,
      tiles,
      furniture,
      doors,
      regions: [],
      temperature: clampInt(rawMap.temperature, -20, 50, 20),
      lightLevel: Math.max(0.1, Math.min(1, Number(rawMap.lightLevel) || 1)),
      updatedAt: Number.isFinite(rawMap.updatedAt) ? rawMap.updatedAt : Date.now(),
    }
  }

  // 规范化家具列表
  const normalizeFurnitureList = (rawList, roomWidth, roomHeight) => {
    if (!Array.isArray(rawList)) return []
    return rawList.slice(0, MAX_ROOM_FURNITURE_ITEMS).map((f, i) => normalizeFurniture(f, i, roomWidth, roomHeight))
  }

  // 规范化单个家具
  const normalizeFurniture = (rawFurniture, index, roomWidth, roomHeight) => {
    const f = rawFurniture && typeof rawFurniture === 'object' ? rawFurniture : {}
    const width = clampInt(f.width, 1, 4, 1)
    const height = clampInt(f.height, 1, 4, 1)
    const maxX = roomWidth - width
    const maxY = roomHeight - height

    return {
      id: String(f.id || makeId('furn')).slice(0, 48),
      name: String(f.name || `家具${index + 1}`).slice(0, 24),
      kind: normalizeFurnitureKind(f.kind),
      width,
      height,
      x: clampInt(f.x, 0, maxX, clampInt(index % roomWidth, 0, maxX, 0)),
      y: clampInt(f.y, 0, maxY, clampInt(Math.floor(index / roomWidth), 0, maxY, 0)),
      z: clampInt(f.z, 0, 200, 10 + index * 2),
      walkable: Boolean(f.walkable),
      interactable: Boolean(f.interactable !== false),
      interactionType: normalizeInteractionType(f.interactionType),
      workType: String(f.workType || '').slice(0, 16),
      workDuration: clampInt(f.workDuration, 10, 600, 120),
      needsSatisfied: normalizeNeedsSatisfied(f.needsSatisfied),
      spriteSpec: normalizeSpriteSpec(f.spriteSpec, index),
      spriteTemplate: f.spriteTemplate || null,
    }
  }

  // 规范化家具类型
  const normalizeFurnitureKind = (rawKind) => {
    const validKinds = ['floor', 'sleep', 'food', 'work', 'social', 'storage', 'decor', 'utility']
    const kind = String(rawKind || '').toLowerCase().trim()
    return validKinds.includes(kind) ? kind : 'decor'
  }

  // 规范化交互类型
  const normalizeInteractionType = (rawType) => {
    const validTypes = ['work', 'sleep', 'eat', 'storage', 'social', 'none']
    const type = String(rawType || '').toLowerCase().trim()
    return validTypes.includes(type) ? type : 'none'
  }

  // 规范化需求满足
  const normalizeNeedsSatisfied = (raw) => {
    if (!raw || typeof raw !== 'object') return {}
    const result = {}
    const validNeeds = ['hunger', 'rest', 'comfort', 'joy', 'social', 'work_satisfaction']
    for (const need of validNeeds) {
      if (typeof raw[need] === 'number') {
        result[need] = Math.max(0, Math.min(1, raw[need]))
      }
    }
    return result
  }

  // 规范化精灵规格
  const normalizeSpriteSpec = (rawSpec, index = 0) => {
    const motifs = ['bed', 'sofa', 'cabinet', 'shelf', 'chest', 'desk', 'table', 'chair', 'plant', 'lamp', 'stove']
    const palettes = ['oak', 'pine', 'walnut', 'mint', 'sky', 'rose', 'stone', 'violet']
    const silhouettes = ['compact', 'wide', 'tall', 'low']

    const s = rawSpec && typeof rawSpec === 'object' ? rawSpec : {}
    return {
      motif: motifs.includes(s.motif) ? s.motif : motifs[index % motifs.length],
      palette: palettes.includes(s.palette) ? s.palette : palettes[index % palettes.length],
      silhouette: silhouettes.includes(s.silhouette) ? s.silhouette : 'compact',
      ornament: String(s.ornament || 'none').slice(0, 12),
      glow: Number(s.glow) || 0,
      seed: Number.isFinite(s.seed) ? s.seed : index * 1000 + Date.now() % 10000,
    }
  }

  // 规范化门列表
  const normalizeDoorList = (rawList, width, height) => {
    if (!Array.isArray(rawList)) return []
    return rawList.slice(0, 8).map(d => ({
      x: clampInt(d?.x, 0, width - 1, Math.floor(width / 2)),
      y: clampInt(d?.y, 0, height - 1, 0),
    }))
  }

  // 创建默认房间地图
  const createDefaultRoomMap = () => {
    const width = ROOM_DEFAULT_WIDTH
    const height = ROOM_DEFAULT_HEIGHT
    const tiles = []

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isWall = x === 0 || x === width - 1 || y === 0 || y === height - 1
        tiles.push(normalizeRoomTile(null, x, y))
      }
    }

    // 添加门
    const doorX = Math.floor(width / 2)
    const doorIndex = tiles.findIndex(t => t.x === doorX && t.y === 0)
    if (doorIndex >= 0) {
      tiles[doorIndex] = {
        ...tiles[doorIndex],
        type: 'door',
        terrainId: 'door-wood',
        terrainPalette: ['#00000000', '#6a5a4a', '#9a8a7a', '#cacaca'],
        passable: true,
      }
    }

    return {
      id: makeId('room'),
      width,
      height,
      tiles,
      furniture: [],
      doors: [{ x: doorX, y: 0 }],
      regions: [],
      temperature: 20,
      lightLevel: 1.0,
      updatedAt: Date.now(),
    }
  }

  // 克隆房间状态
  const cloneRoomMapState = (map) => {
    if (!map || typeof map !== 'object') return createDefaultRoomMap()
    return {
      ...map,
      tiles: (Array.isArray(map.tiles) ? map.tiles : []).map(t => ({ ...t })),
      furniture: (Array.isArray(map.furniture) ? map.furniture : []).map(f => ({
        ...f,
        needsSatisfied: { ...f.needsSatisfied },
        spriteSpec: { ...f.spriteSpec },
      })),
      doors: (Array.isArray(map.doors) ? map.doors : []).map(d => ({ ...d })),
      regions: [],
    }
  }

  // 验证房间是否有效
  const isRoomMapValid = (map) => {
    if (!map || !Array.isArray(map.tiles) || map.tiles.length < 1) return false
    const hasFloor = map.tiles.some(t => t.type === 'floor')
    const hasWall = map.tiles.some(t => t.type === 'wall')
    return hasFloor && hasWall
  }

  return {
    createRoomCellId,
    normalizeRoomTile,
    normalizeRoomMap,
    normalizeFurniture,
    createDefaultRoomMap,
    cloneRoomMapState,
    isRoomMapValid,
  }
}

export default createRoomEngine