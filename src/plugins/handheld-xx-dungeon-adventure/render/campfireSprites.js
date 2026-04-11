import {
  SPRITE_PIXEL_SIZE,
  SPRITE_GRID_SIZE,
  createSpriteGrid,
  paintPoint,
  paintPoints,
  paintRect,
} from './pixelGrid.js'

const DEFAULT_STYLE_LIST = ['knight', 'mage', 'ranger', 'rogue', 'priest', 'alchemist']
const DEFAULT_PALETTE_LIST = ['ember', 'forest', 'sky', 'violet', 'sand', 'iron']
const DEFAULT_ACTION_LIST = ['idle', 'warm_hands', 'sharpen_blade', 'lookout', 'stretch', 'cheer']

const CAMPFIRE_PIXEL_PALETTES = {
  ember: { robe: '#b35943', trim: '#ffd4a8', accent: '#ff9f5f', hair: '#5f3728' },
  forest: { robe: '#477e50', trim: '#c6f1bf', accent: '#84cf7f', hair: '#2f4d33' },
  sky: { robe: '#507ebf', trim: '#c9e5ff', accent: '#8dc9ff', hair: '#3e5982' },
  violet: { robe: '#7653ba', trim: '#dccbff', accent: '#b99dff', hair: '#4d3b74' },
  sand: { robe: '#9d7d55', trim: '#f5dfbf', accent: '#e5bc84', hair: '#6b5234' },
  iron: { robe: '#6b7688', trim: '#dce5f5', accent: '#9faec5', hair: '#424c62' },
}

const applyCampfirePose = (grid, action, frame) => {
  const variant = frame % 2
  const legOffset = variant === 0 ? 0 : 1

  if (action === 'warm_hands') {
    paintRect(grid, 6, 7, 1, 3, 't')
    paintRect(grid, 9, 7, 1, 3, 't')
  } else if (action === 'sharpen_blade') {
    paintRect(grid, 4, 7, 1, 3, 't')
    paintRect(grid, 10, 7, 1, 3, 't')
    paintPoints(grid, [[11, 8], [12, 8], [13, 8]], 'a')
  } else if (action === 'lookout') {
    paintRect(grid, 4, 7, 1, 3, 't')
    paintRect(grid, 11, 6, 1, 3, 't')
  } else if (action === 'stretch') {
    paintRect(grid, 4, 5, 1, 3, 't')
    paintRect(grid, 11, 5, 1, 3, 't')
  } else if (action === 'cheer') {
    paintRect(grid, 5, 4, 1, 3, 't')
    paintRect(grid, 10, 4, 1, 3, 't')
  } else {
    paintRect(grid, 4, 6, 1, 3, 't')
    paintRect(grid, 11, 6, 1, 3, 't')
  }

  paintRect(grid, 6 + legOffset, 11, 1, 3, 'b')
  paintRect(grid, 8 - legOffset, 11, 1, 3, 'b')
  paintPoints(grid, [[6 + legOffset, 14], [7 + legOffset, 14], [8 - legOffset, 14], [9 - legOffset, 14]], 'b')
}

const applyCampfireStyle = (grid, style, frame) => {
  if (style === 'knight') {
    paintRect(grid, 5, 0, 6, 1, 'h')
    paintRect(grid, 5, 1, 1, 4, 'h')
    paintRect(grid, 10, 1, 1, 4, 'h')
    paintPoints(grid, [[7, 6], [8, 6]], 'a')
    return
  }
  if (style === 'mage') {
    paintRect(grid, 7, 0, 2, 1, 'a')
    paintRect(grid, 6, 1, 4, 1, 'h')
    paintRect(grid, 5, 2, 6, 1, 'h')
    paintPoints(grid, [[8, 7], [8, 8]], 'a')
    return
  }
  if (style === 'ranger') {
    paintRect(grid, 5, 1, 1, 4, 'h')
    paintRect(grid, 10, 1, 1, 4, 'h')
    paintRect(grid, 11, 8, 1, 4, 'a')
    return
  }
  if (style === 'rogue') {
    paintRect(grid, 6, 2, 4, 1, 'h')
    paintRect(grid, 5, 6, 6, 1, 'a')
    if (frame % 2 === 1) {
      paintPoint(grid, 4, 9, 'a')
      paintPoint(grid, 11, 9, 'a')
    }
    return
  }
  if (style === 'priest') {
    paintRect(grid, 4, 6, 1, 5, 't')
    paintRect(grid, 11, 6, 1, 5, 't')
    paintRect(grid, 6, 0, 4, 1, 'a')
    paintPoint(grid, 8, 8, 'a')
    return
  }
  if (style === 'alchemist') {
    paintRect(grid, 6, 1, 4, 1, 'a')
    paintRect(grid, 10, 8, 1, 2, 'a')
    paintPoint(grid, 10, 7, 't')
  }
}

const buildCampfireSpriteGrid = (style, action, frame) => {
  const grid = createSpriteGrid(SPRITE_GRID_SIZE)
  paintRect(grid, 6, 1, 4, 4, 's')
  paintRect(grid, 5, 5, 6, 6, 'r')
  paintPoints(grid, [[7, 2], [8, 2]], 'e')
  paintPoints(grid, [[6, 3], [9, 3]], 'h')
  paintPoints(grid, [[5, 5], [10, 5], [5, 10], [10, 10]], 't')
  applyCampfirePose(grid, action, frame)
  applyCampfireStyle(grid, style, frame)
  return grid
}

const resolveCampfirePixelColor = (token, paletteKey) => {
  const palette = CAMPFIRE_PIXEL_PALETTES[paletteKey] || CAMPFIRE_PIXEL_PALETTES.ember
  if (token === 's') return '#f0caa4'
  if (token === 'e') return '#1c120d'
  if (token === 'r') return palette.robe
  if (token === 't') return palette.trim
  if (token === 'a') return palette.accent
  if (token === 'h') return palette.hair
  if (token === 'b') return '#2b3145'
  return ''
}

const buildCampfireSpriteUri = (style, palette, action, frame) => {
  const grid = buildCampfireSpriteGrid(style, action, frame)
  const spriteSize = SPRITE_GRID_SIZE * SPRITE_PIXEL_SIZE
  let rects = ''
  for (let y = 0; y < SPRITE_GRID_SIZE; y += 1) {
    for (let x = 0; x < SPRITE_GRID_SIZE; x += 1) {
      const token = grid[y][x]
      if (token === '.') continue
      const color = resolveCampfirePixelColor(token, palette)
      if (!color) continue
      rects += `<rect x="${x * SPRITE_PIXEL_SIZE}" y="${y * SPRITE_PIXEL_SIZE}" width="${SPRITE_PIXEL_SIZE}" height="${SPRITE_PIXEL_SIZE}" fill="${color}"/>`
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spriteSize}" height="${spriteSize}" viewBox="0 0 ${spriteSize} ${spriteSize}" shape-rendering="crispEdges">${rects}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const resolveCampfireSpriteFrame = (action, index = 0, frameTick = 0) => {
  const base = (frameTick + index) % 2
  if (action === 'idle' || action === 'lookout') return base
  if (action === 'warm_hands' || action === 'sharpen_blade' || action === 'stretch' || action === 'cheer') return base
  return base
}

export const createCampfireSpriteResolver = (options = {}) => {
  const styleList = Array.isArray(options?.styleList) && options.styleList.length > 0
    ? options.styleList
    : DEFAULT_STYLE_LIST
  const paletteList = Array.isArray(options?.paletteList) && options.paletteList.length > 0
    ? options.paletteList
    : DEFAULT_PALETTE_LIST
  const actionList = Array.isArray(options?.actionList) && options.actionList.length > 0
    ? options.actionList
    : DEFAULT_ACTION_LIST
  const styleSet = options?.styleSet instanceof Set ? options.styleSet : new Set(styleList)
  const paletteSet = options?.paletteSet instanceof Set ? options.paletteSet : new Set(paletteList)
  const actionSet = options?.actionSet instanceof Set ? options.actionSet : new Set(actionList)
  const getFrameTick = typeof options?.getFrameTick === 'function' ? options.getFrameTick : (() => 0)
  const cache = new Map()

  const getCampfireSpriteSrc = (camper, index = 0) => {
    const style = styleSet.has(camper?.style) ? camper.style : styleList[index % styleList.length]
    const palette = paletteSet.has(camper?.palette) ? camper.palette : paletteList[index % paletteList.length]
    const action = actionSet.has(camper?.action) ? camper.action : actionList[index % actionList.length]
    const frame = resolveCampfireSpriteFrame(action, index, Number(getFrameTick()) || 0)
    const cacheKey = `${style}|${palette}|${action}|${frame}`
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)
    }
    const uri = buildCampfireSpriteUri(style, palette, action, frame)
    cache.set(cacheKey, uri)
    return uri
  }

  const getTeammateSpriteStyle = (role, index = 0) => {
    const roleLower = String(role || '').toLowerCase()
    if (roleLower.includes('骑士') || roleLower.includes('knight')) return 'knight'
    if (roleLower.includes('法师') || roleLower.includes('mage') || roleLower.includes('魔法')) return 'mage'
    if (roleLower.includes('游侠') || roleLower.includes('ranger') || roleLower.includes('弓')) return 'ranger'
    if (roleLower.includes('盗贼') || roleLower.includes('rogue') || roleLower.includes('刺客')) return 'rogue'
    if (roleLower.includes('牧师') || roleLower.includes('priest') || roleLower.includes('治疗')) return 'priest'
    if (roleLower.includes('炼金') || roleLower.includes('alchemist')) return 'alchemist'
    return styleList[index % styleList.length]
  }

  const getTeammateSpritePalette = (rarity, index = 0) => {
    const rarityUpper = String(rarity || 'R').toUpperCase()
    if (rarityUpper === 'SSR') return 'violet'
    if (rarityUpper === 'SR') return 'sky'
    return paletteList[index % paletteList.length]
  }

  const getTeammateSpriteSrc = (member, index = 0) => {
    const style = getTeammateSpriteStyle(member?.role, index)
    const palette = getTeammateSpritePalette(member?.rarity, index)
    return getCampfireSpriteSrc({ style, palette, action: 'idle' }, index)
  }

  return {
    getCampfireSpriteSrc,
    getTeammateSpriteStyle,
    getTeammateSpritePalette,
    getTeammateSpriteSrc,
  }
}
