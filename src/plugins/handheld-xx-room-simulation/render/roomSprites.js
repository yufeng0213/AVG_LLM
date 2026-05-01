// 房间精灵渲染 - Tile 和家具的 SVG 生成

import {
  SPRITE_PIXEL_SIZE,
  SPRITE_GRID_SIZE,
  ROOM_CELL_SIZE,
} from '../config/constants.js'

// ========== Z 轴层级规则 ==========

/**
 * Z 轴层级规则：
 *
 * 层级范围      | 元素类型        | 说明
 * ------------|----------------|------------------
 * 0-9         | floor 类家具    | 地毯、地板装饰
 * 10-49       | 低矮家具        | 椅子、植物、灯
 * 50-99       | 中等家具        | 床、桌子、沙发
 * 100-199     | 高大家具        | 柜子、书架
 * 200+        | 小人            | 动态 z = 200 + position.y
 *
 * 自动计算 z 值：
 * - floor 类 → z = 0
 * - decor 类 → z = 10 + y * 5（越靠下越高）
 * - sleep/utility 类 → z = 50 + y * 5
 * - storage/work 类 → z = 100 + y * 5
 * - 多格家具 → z = baseZ + (height - 1) * 10
 */

export const Z_LAYER_RULES = {
  FLOOR_BASE: 0,        // 地板类基础层
  DECOR_BASE: 10,       // 装饰类基础层
  FURNITURE_LOW: 30,    // 低矮家具（椅子等）
  FURNITURE_MID: 50,    // 中等家具（床、桌）
  FURNITURE_HIGH: 100,  // 高大家具（柜子）
  PAWN_BASE: 200,       // 小人基础层
  PAWN_Y_MULTIPLIER: 1, // 小人 y 坐标系数
}

/**
 * 根据家具类型和位置自动计算 z 值
 */
export const calculateFurnitureZ = (furniture) => {
  if (!furniture) return 10

  // 如果已有明确 z 值，直接返回
  if (typeof furniture.z === 'number' && furniture.z > 0) return furniture.z

  const kind = furniture.kind || 'decor'
  const y = furniture.y || 0
  const height = furniture.height || 1

  let baseZ
  switch (kind) {
    case 'floor':
      baseZ = Z_LAYER_RULES.FLOOR_BASE
      break
    case 'decor':
      baseZ = Z_LAYER_RULES.DECOR_BASE
      break
    case 'utility':
      baseZ = Z_LAYER_RULES.FURNITURE_LOW
      break
    case 'sleep':
    case 'food':
    case 'social':
      baseZ = Z_LAYER_RULES.FURNITURE_MID
      break
    case 'storage':
    case 'work':
      baseZ = Z_LAYER_RULES.FURNITURE_HIGH
      break
    default:
      baseZ = Z_LAYER_RULES.DECOR_BASE
  }

  // y 坐标影响：越靠下（y 值大），z 值越高（确保正确的遮挡关系）
  const yOffset = y * 5

  // 高度影响：多格家具（高家具）z 值更高
  const heightOffset = (height - 1) * 10

  return baseZ + yOffset + heightOffset
}

/**
 * 计算小人 z 值（动态，根据 y 坐标）
 */
export const calculatePawnZ = (pawn) => {
  const y = pawn?.position?.y || 0
  return Z_LAYER_RULES.PAWN_BASE + y * Z_LAYER_RULES.PAWN_Y_MULTIPLIER
}

// 家具调色板预设
const FURNITURE_PALETTES = {
  oak: { primary: '#7a5a3a', secondary: '#aa8a6a', accent: '#daa87a', detail: '#3a2a1a' },
  pine: { primary: '#8a6a4a', secondary: '#ba9a7a', accent: '#eac0a0', detail: '#4a3a2a' },
  walnut: { primary: '#5a4a3a', secondary: '#8a7a6a', accent: '#baa090', detail: '#2a1a0a' },
  mint: { primary: '#5a8a6a', secondary: '#8aba9a', accent: '#bae0c0', detail: '#3a5a4a' },
  sky: { primary: '#5a6a8a', secondary: '#8a9aba', accent: '#bac0e0', detail: '#3a4a6a' },
  rose: { primary: '#8a5a6a', secondary: '#ba8a9a', accent: '#eab0c0', detail: '#5a3a4a' },
  stone: { primary: '#5a5a5a', secondary: '#7a7a7a', accent: '#9a9a9a', detail: '#3a3a3a' },
  violet: { primary: '#6a4a8a', secondary: '#9a7aba', accent: '#caa0e0', detail: '#4a2a6a' },
}

// 家具像素图案生成
const buildFurniturePixels = (motif, silhouette, seed) => {
  const grid = Array.from({ length: SPRITE_GRID_SIZE }, () => Array(SPRITE_GRID_SIZE).fill('.'))

  // 根据类型绘制不同图案
  switch (motif) {
    case 'bed':
      paintRect(grid, 2, 4, 12, 8, 'p')
      paintRect(grid, 2, 4, 12, 2, 's')
      paintRect(grid, 4, 6, 8, 4, 'a')
      break
    case 'sofa':
      paintRect(grid, 1, 5, 14, 6, 'p')
      paintRect(grid, 1, 5, 3, 6, 's')
      paintRect(grid, 12, 5, 3, 6, 's')
      paintRect(grid, 3, 7, 10, 3, 'a')
      break
    case 'cabinet':
      paintRect(grid, 2, 2, 12, 12, 'p')
      paintRect(grid, 4, 4, 8, 8, 's')
      paintPoints(grid, [[6, 6], [10, 6], [6, 10], [10, 10]], 'd')
      break
    case 'shelf':
      paintRect(grid, 2, 1, 12, 14, 'p')
      paintRect(grid, 3, 4, 10, 2, 's')
      paintRect(grid, 3, 8, 10, 2, 's')
      paintRect(grid, 3, 12, 10, 2, 's')
      break
    case 'chest':
      paintRect(grid, 3, 6, 10, 8, 'p')
      paintRect(grid, 3, 5, 10, 3, 's')
      paintRect(grid, 7, 7, 2, 4, 'd')
      break
    case 'desk':
      paintRect(grid, 2, 6, 12, 6, 'p')
      paintRect(grid, 2, 3, 12, 4, 's')
      paintRect(grid, 4, 8, 8, 3, 'a')
      break
    case 'table':
      paintRect(grid, 4, 6, 8, 8, 'p')
      paintRect(grid, 4, 5, 8, 3, 's')
      break
    case 'chair':
      paintRect(grid, 5, 8, 6, 6, 'p')
      paintRect(grid, 5, 3, 6, 6, 's')
      paintRect(grid, 6, 9, 4, 4, 'a')
      break
    case 'plant':
      paintRect(grid, 6, 10, 4, 4, 'd')
      paintPoints(grid, [[4, 4], [8, 2], [12, 4], [6, 6], [10, 6]], 'p')
      paintPoints(grid, [[5, 3], [9, 1], [11, 3]], 'a')
      break
    case 'lamp':
      paintRect(grid, 7, 10, 2, 4, 'd')
      paintRect(grid, 5, 4, 6, 6, 's')
      paintPoints(grid, [[7, 5], [9, 5], [7, 7], [9, 7]], 'a')
      break
    case 'stove':
      paintRect(grid, 2, 4, 12, 10, 'p')
      paintRect(grid, 4, 6, 8, 6, 's')
      paintPoints(grid, [[5, 7], [9, 7], [5, 10], [9, 10]], 'a')
      break
    default:
      paintRect(grid, 4, 4, 8, 8, 'p')
      paintRect(grid, 6, 6, 4, 4, 's')
  }

  return grid
}

// 绘制辅助函数
const paintRect = (grid, x, y, w, h, token) => {
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const gx = x + xx
      const gy = y + yy
      if (gx >= 0 && gx < SPRITE_GRID_SIZE && gy >= 0 && gy < SPRITE_GRID_SIZE) {
        grid[gy][gx] = token
      }
    }
  }
}

const paintPoints = (grid, points, token) => {
  for (const [x, y] of points) {
    if (x >= 0 && x < SPRITE_GRID_SIZE && y >= 0 && y < SPRITE_GRID_SIZE) {
      grid[y][x] = token
    }
  }
}

// 解析家具像素颜色
const resolveFurnitureColor = (token, paletteKey) => {
  const palette = FURNITURE_PALETTES[paletteKey] || FURNITURE_PALETTES.oak
  switch (token) {
    case 'p': return palette.primary
    case 's': return palette.secondary
    case 'a': return palette.accent
    case 'd': return palette.detail
    default: return ''
  }
}

// 构建家具精灵 SVG URI（支持自定义精灵和多格子）
const buildFurnitureSpriteUri = (furniture) => {
  // 检查是否有自定义精灵数据（从 PNG 导入）
  if (furniture?.customSprite?.base64) {
    return buildCustomFurnitureSpriteUri(furniture)
  }

  const spec = furniture?.spriteSpec || {}
  const motif = spec.motif || 'desk'
  const palette = spec.palette || 'oak'
  const silhouette = spec.silhouette || 'compact'
  const seed = spec.seed || 0

  const grid = buildFurniturePixels(motif, silhouette, seed)
  const spriteSize = SPRITE_GRID_SIZE * SPRITE_PIXEL_SIZE
  let rects = ''

  for (let y = 0; y < SPRITE_GRID_SIZE; y++) {
    for (let x = 0; x < SPRITE_GRID_SIZE; x++) {
      const token = grid[y][x]
      if (token === '.') continue
      const color = resolveFurnitureColor(token, palette)
      if (!color) continue
      rects += `<rect x="${x * SPRITE_PIXEL_SIZE}" y="${y * SPRITE_PIXEL_SIZE}" width="${SPRITE_PIXEL_SIZE}" height="${SPRITE_PIXEL_SIZE}" fill="${color}"/>`
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spriteSize}" height="${spriteSize}" viewBox="0 0 ${spriteSize} ${spriteSize}" shape-rendering="crispEdges">${rects}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// 构建自定义精灵（从 PNG 导入）- 直接使用原始 PNG base64
const buildCustomFurnitureSpriteUri = (furniture) => {
  const custom = furniture?.customSprite || {}

  // 直接返回原始 PNG base64
  if (custom.base64) {
    return custom.base64
  }

  // 没有 base64 时返回空 SVG
  const cellWidth = furniture?.width || 1
  const cellHeight = furniture?.height || 1
  const spriteWidth = cellWidth * ROOM_CELL_SIZE
  const spriteHeight = cellHeight * ROOM_CELL_SIZE
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="${spriteWidth}" height="${spriteHeight}"/>`
}

// 构建 Tile 精灵 SVG URI
const buildTileSpriteUri = (tile) => {
  const palette = tile?.terrainPalette || ['#00000000', '#5a4a3a', '#8a7a6a', '#baaa9a']
  const pixels = tile?.terrainPixels16 || []
  const type = tile?.type || 'floor'

  // 如果没有像素数据，生成默认图案
  const grid = pixels.length >= 16
    ? pixels.map(row => row.split(''))
    : generateDefaultTilePixels(type)

  const spriteSize = SPRITE_GRID_SIZE * SPRITE_PIXEL_SIZE
  let rects = ''

  for (let y = 0; y < SPRITE_GRID_SIZE; y++) {
    for (let x = 0; x < SPRITE_GRID_SIZE; x++) {
      const char = grid[y]?.[x] || '0'
      const index = parseInt(char, 16) || 0
      const color = palette[index] || palette[0] || '#00000000'
      if (color === '#00000000') continue
      rects += `<rect x="${x * SPRITE_PIXEL_SIZE}" y="${y * SPRITE_PIXEL_SIZE}" width="${SPRITE_PIXEL_SIZE}" height="${SPRITE_PIXEL_SIZE}" fill="${color}"/>`
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spriteSize}" height="${spriteSize}" viewBox="0 0 ${spriteSize} ${spriteSize}" shape-rendering="crispEdges">${rects}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// 生成默认 Tile 像素图案
const generateDefaultTilePixels = (type) => {
  const grid = Array.from({ length: SPRITE_GRID_SIZE }, () => Array(SPRITE_GRID_SIZE).fill('1'))

  switch (type) {
    case 'wall':
      for (let y = 0; y < SPRITE_GRID_SIZE; y++) {
        for (let x = 0; x < SPRITE_GRID_SIZE; x++) {
          if ((x + y) % 4 === 0) grid[y][x] = '2'
          if ((x + y) % 8 === 0) grid[y][x] = '3'
        }
      }
      break
    case 'door':
      for (let y = 0; y < SPRITE_GRID_SIZE; y++) {
        grid[y][2] = '2'
        grid[y][13] = '2'
        for (let x = 3; x < 13; x++) {
          if (y < 4 || y > 12) grid[y][x] = '1'
          else grid[y][x] = '.'
        }
      }
      grid[7][6] = '3'
      grid[7][9] = '3'
      break
    case 'window':
      for (let y = 2; y < 14; y++) {
        for (let x = 2; x < 14; x++) {
          grid[y][x] = '2'
        }
      }
      for (let y = 4; y < 12; y++) {
        for (let x = 4; x < 12; x++) {
          grid[y][x] = '3'
        }
      }
      break
    case 'floor':
      for (let y = 0; y < SPRITE_GRID_SIZE; y++) {
        for (let x = 0; x < SPRITE_GRID_SIZE; x++) {
          if ((x * 3 + y * 5) % 11 === 0) grid[y][x] = '2'
          if ((x + y) % 7 === 0) grid[y][x] = '3'
        }
      }
      break
  }

  return grid
}

// 创建精灵解析器
export const createRoomSpriteResolver = (options = {}) => {
  const cache = new Map()
  const maxCacheSize = options.maxCacheSize || 256

  const getTileSpriteSrc = (tile) => {
    const cacheKey = `${tile?.id || 'tile'}|${tile?.type}|${tile?.terrainPalette?.join('|')}`
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)
    }
    const uri = buildTileSpriteUri(tile)
    if (cache.size < maxCacheSize) {
      cache.set(cacheKey, uri)
    }
    return uri
  }

  const getFurnitureSpriteSrc = (furniture) => {
    // 自定义精灵（PNG 导入）直接返回 base64
    if (furniture?.customSprite?.base64) {
      return buildCustomFurnitureSpriteUri(furniture)
    }

    const spec = furniture?.spriteSpec || {}
    const cacheKey = `${furniture?.id || 'furn'}|${spec.motif}|${spec.palette}|${spec.silhouette}|${spec.seed}`
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)
    }
    const uri = buildFurnitureSpriteUri(furniture)
    if (cache.size < maxCacheSize) {
      cache.set(cacheKey, uri)
    }
    return uri
  }

  return {
    getTileSpriteSrc,
    getFurnitureSpriteSrc,
    clearCache: () => cache.clear(),
  }
}

export default createRoomSpriteResolver