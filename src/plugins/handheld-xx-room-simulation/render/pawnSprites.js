// 小人精灵渲染 - 扩展 campfireSprites 模式

import {
  SPRITE_PIXEL_SIZE,
  SPRITE_GRID_SIZE,
} from '../../config/constants.js'

// 复用 campfireSprites 的调色板
const PAWN_PIXEL_PALETTES = {
  ember: { robe: '#b35943', trim: '#ffd4a8', accent: '#ff9f5f', hair: '#5f3728' },
  forest: { robe: '#477e50', trim: '#c6f1bf', accent: '#84cf7f', hair: '#2f4d33' },
  sky: { robe: '#507ebf', trim: '#c9e5ff', accent: '#8dc9ff', hair: '#3e5982' },
  violet: { robe: '#7653ba', trim: '#dccbff', accent: '#b99dff', hair: '#4d3b74' },
  sand: { robe: '#9d7d55', trim: '#f5dfbf', accent: '#e5bc84', hair: '#6b5234' },
  iron: { robe: '#6b7688', trim: '#dce5f5', accent: '#9faec5', hair: '#424c62' },
  copper: { robe: '#b87333', trim: '#ffd9a0', accent: '#ffab5f', hair: '#5a3a28' },
  silver: { robe: '#9a9aa0', trim: '#dadae0', accent: '#babac0', hair: '#5a5a60' },
}

// 扩展的职业样式
const PAWN_STYLE_LIST = ['knight', 'mage', 'ranger', 'rogue', 'priest', 'alchemist', 'worker', 'cook', 'scholar', 'nurse']

// 扩展的动作列表
const PAWN_ACTION_LIST = ['idle', 'walk', 'work', 'sleep', 'eat', 'talk', 'read', 'carry']

// 创建基础精灵网格
const createSpriteGrid = (size = SPRITE_GRID_SIZE, fillToken = '.') => {
  return Array.from({ length: size }, () => Array(size).fill(fillToken))
}

// 绘制矩形
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

// 绘制点
const paintPoints = (grid, points, token) => {
  for (const [x, y] of points) {
    if (x >= 0 && x < SPRITE_GRID_SIZE && y >= 0 && y < SPRITE_GRID_SIZE) {
      grid[y][x] = token
    }
  }
}

// 基础身体绘制
const applyPawnBaseBody = (grid) => {
  // 头部
  paintRect(grid, 6, 1, 4, 4, 's')
  // 眼睛
  paintPoints(grid, [[7, 2], [8, 2]], 'e')
  // 身体
  paintRect(grid, 5, 5, 6, 6, 'r')
  // 腿部基础
  paintRect(grid, 6, 11, 1, 3, 'b')
  paintRect(grid, 9, 11, 1, 3, 'b')
}

// 应用动作姿势
const applyPawnPose = (grid, action, frame) => {
  const variant = frame % 2
  const legOffset = variant === 0 ? 0 : 1

  switch (action) {
    case 'walk':
      // 走路：腿部交替移动
      paintRect(grid, 4 + legOffset, 11, 2, 3, 'b')
      paintRect(grid, 10 - legOffset, 11, 2, 3, 'b')
      paintRect(grid, 5, 7, 1, 3, 't')
      paintRect(grid, 10, 7, 1, 3, 't')
      break
    case 'work':
      // 工作：手臂操作姿势
      paintRect(grid, 4, 5, 2, 4, 't')
      paintRect(grid, 10, 5, 2, 4, 't')
      paintRect(grid, 6 + legOffset, 11, 1, 3, 'b')
      paintRect(grid, 9 - legOffset, 11, 1, 3, 'b')
      break
    case 'sleep':
      // 睡眠：躺卧姿势（简化显示）
      paintRect(grid, 3, 8, 10, 4, 'r')
      paintRect(grid, 2, 8, 4, 4, 's')
      paintPoints(grid, [[3, 9], [4, 9]], 'e')
      break
    case 'eat':
      // 进食：手持食物
      paintRect(grid, 4, 6, 1, 3, 't')
      paintRect(grid, 10, 7, 1, 3, 't')
      paintRect(grid, 9, 5, 2, 2, 'a')
      break
    case 'talk':
      // 对话：手臂指向
      paintRect(grid, 3, 5, 2, 3, 't')
      paintRect(grid, 11, 6, 1, 3, 't')
      break
    case 'read':
      // 阅读：手持书本
      paintRect(grid, 5, 6, 6, 3, 't')
      paintRect(grid, 6, 5, 4, 2, 'a')
      break
    case 'carry':
      // 携带：双手持物
      paintRect(grid, 5, 4, 1, 5, 't')
      paintRect(grid, 10, 4, 1, 5, 't')
      paintRect(grid, 6, 3, 4, 3, 'a')
      break
    default: // idle
      // 默认：手臂自然下垂
      paintRect(grid, 4, 6, 1, 3, 't')
      paintRect(grid, 11, 6, 1, 3, 't')
      paintRect(grid, 6 + legOffset, 11, 1, 3, 'b')
      paintRect(grid, 8 - legOffset, 11, 1, 3, 'b')
  }
}

// 应用职业样式
const applyPawnStyle = (grid, style, frame) => {
  switch (style) {
    case 'knight':
      paintRect(grid, 5, 0, 6, 1, 'h')
      paintRect(grid, 5, 1, 1, 4, 'h')
      paintRect(grid, 10, 1, 1, 4, 'h')
      paintPoints(grid, [[7, 6], [8, 6]], 'a')
      break
    case 'mage':
      paintRect(grid, 7, 0, 2, 1, 'a')
      paintRect(grid, 6, 1, 4, 1, 'h')
      paintRect(grid, 5, 2, 6, 1, 'h')
      paintPoints(grid, [[8, 7], [8, 8]], 'a')
      break
    case 'ranger':
      paintRect(grid, 5, 1, 1, 4, 'h')
      paintRect(grid, 10, 1, 1, 4, 'h')
      paintRect(grid, 11, 8, 1, 4, 'a')
      break
    case 'rogue':
      paintRect(grid, 6, 2, 4, 1, 'h')
      paintRect(grid, 5, 6, 6, 1, 'a')
      if (frame % 2 === 1) {
        paintPoints(grid, [[4, 9], [11, 9]], 'a')
      }
      break
    case 'priest':
      paintRect(grid, 4, 6, 1, 5, 't')
      paintRect(grid, 11, 6, 1, 5, 't')
      paintRect(grid, 6, 0, 4, 1, 'a')
      paintPoints(grid, [[8, 8]], 'a')
      break
    case 'alchemist':
      paintRect(grid, 6, 1, 4, 1, 'a')
      paintRect(grid, 10, 8, 1, 2, 'a')
      paintPoints(grid, [[10, 7]], 't')
      break
    case 'worker':
      paintRect(grid, 5, 0, 6, 1, 'h')
      paintRect(grid, 6, 3, 4, 1, 'a')
      break
    case 'cook':
      paintRect(grid, 4, 0, 8, 1, 'h')
      paintRect(grid, 7, 6, 2, 2, 'a')
      break
    case 'scholar':
      paintRect(grid, 6, 0, 4, 2, 'h')
      paintRect(grid, 5, 2, 6, 1, 'a')
      break
    case 'nurse':
      paintRect(grid, 5, 0, 6, 1, 'h')
      paintRect(grid, 7, 6, 2, 3, 'a')
      paintRect(grid, 4, 7, 1, 4, 't')
      paintRect(grid, 11, 7, 1, 4, 't')
      break
  }
}

// 解析像素颜色
const resolvePawnPixelColor = (token, paletteKey) => {
  const palette = PAWN_PIXEL_PALETTES[paletteKey] || PAWN_PIXEL_PALETTES.ember
  switch (token) {
    case 's': return '#f0caa4'  // 皮肤
    case 'e': return '#1c120d'  // 眼睛
    case 'r': return palette.robe  // 衣服
    case 't': return palette.trim  // 装饰
    case 'a': return palette.accent  // 强调色
    case 'h': return palette.hair  // 头发/帽子
    case 'b': return '#2b3145'  // 鞋子
    default: return ''
  }
}

// 构建小人精灵 SVG URI
const buildPawnSpriteUri = (style, palette, action, frame) => {
  const grid = createSpriteGrid(SPRITE_GRID_SIZE)
  applyPawnBaseBody(grid)
  applyPawnPose(grid, action, frame)
  applyPawnStyle(grid, style, frame)

  const spriteSize = SPRITE_GRID_SIZE * SPRITE_PIXEL_SIZE
  let rects = ''

  for (let y = 0; y < SPRITE_GRID_SIZE; y++) {
    for (let x = 0; x < SPRITE_GRID_SIZE; x++) {
      const token = grid[y][x]
      if (token === '.') continue
      const color = resolvePawnPixelColor(token, palette)
      if (!color) continue
      rects += `<rect x="${x * SPRITE_PIXEL_SIZE}" y="${y * SPRITE_PIXEL_SIZE}" width="${SPRITE_PIXEL_SIZE}" height="${SPRITE_PIXEL_SIZE}" fill="${color}"/>`
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spriteSize}" height="${spriteSize}" viewBox="0 0 ${spriteSize} ${spriteSize}" shape-rendering="crispEdges">${rects}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// 创建小人精灵解析器
export const createPawnSpriteResolver = (options = {}) => {
  const styleList = Array.isArray(options?.styleList) ? options.styleList : PAWN_STYLE_LIST
  const paletteList = Array.isArray(options?.paletteList) ? options.paletteList : Object.keys(PAWN_PIXEL_PALETTES)
  const actionList = Array.isArray(options?.actionList) ? options.actionList : PAWN_ACTION_LIST
  const getFrameTick = typeof options?.getFrameTick === 'function' ? options.getFrameTick : (() => 0)
  const cache = new Map()
  const maxCacheSize = options.maxCacheSize || 128

  const getPawnSpriteSrc = (pawn, index = 0) => {
    const style = styleList.includes(pawn?.sprite?.style) ? pawn.sprite.style : styleList[index % styleList.length]
    const palette = paletteList.includes(pawn?.sprite?.palette) ? pawn.sprite.palette : paletteList[index % paletteList.length]
    const action = actionList.includes(pawn?.sprite?.action) ? pawn.sprite.action : 'idle'
    const frame = (Number(getFrameTick()) + index) % 2

    const cacheKey = `${style}|${palette}|${action}|${frame}`
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)
    }

    const uri = buildPawnSpriteUri(style, palette, action, frame)
    if (cache.size < maxCacheSize) {
      cache.set(cacheKey, uri)
    }
    return uri
  }

  const getTeammateSpriteSrc = (member, index = 0) => {
    return getPawnSpriteSrc(member, index)
  }

  return {
    getPawnSpriteSrc,
    getTeammateSpriteSrc,
    clearCache: () => cache.clear(),
  }
}

export default createPawnSpriteResolver