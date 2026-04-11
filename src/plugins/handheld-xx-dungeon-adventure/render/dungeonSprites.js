const DUNGEON_TILE_PIXEL_SIZE = 2
const DUNGEON_TILE_MATRIX_SIZE = 16
const DUNGEON_TILE_COLOR_RE = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i
const DUNGEON_OBJECT_PALETTE_FALLBACK = ['#00000000', '#2b3947', '#5d788f', '#93b6d1', '#e4f4ff']

const createDungeonTileFallbackPixels = (main = '1', accent = '2', accentStep = 7) => {
  const rows = []
  const mainChar = String(main || '1').slice(0, 1) || '1'
  const accentChar = String(accent || '2').slice(0, 1) || '2'
  const step = Math.max(2, Math.min(15, Number.parseInt(String(accentStep), 10) || 7))
  for (let y = 0; y < DUNGEON_TILE_MATRIX_SIZE; y += 1) {
    let line = ''
    for (let x = 0; x < DUNGEON_TILE_MATRIX_SIZE; x += 1) {
      line += ((x * 3 + y * 5) % step) === 0 ? accentChar : mainChar
    }
    rows.push(line)
  }
  return rows
}

const DUNGEON_OBJECT_PIXELS_FALLBACK = createDungeonTileFallbackPixels('2', '3', 5)

const wrapHue = (value) => {
  const raw = Number(value) || 0
  const wrapped = raw % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

const toHexByte = (value) => {
  const clipped = Math.max(0, Math.min(255, Math.round(Number(value) || 0)))
  return clipped.toString(16).padStart(2, '0')
}

const hslToHex = (h, s, l, alpha = 1) => {
  const hue = wrapHue(h) / 360
  const sat = Math.max(0, Math.min(1, (Number(s) || 0) / 100))
  const lig = Math.max(0, Math.min(1, (Number(l) || 0) / 100))
  const a = Math.max(0, Math.min(1, Number(alpha)))
  if (sat <= 0) {
    const v = Math.round(lig * 255)
    if (a >= 0.999) return `#${toHexByte(v)}${toHexByte(v)}${toHexByte(v)}`
    return `#${toHexByte(v)}${toHexByte(v)}${toHexByte(v)}${toHexByte(a * 255)}`
  }
  const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat
  const p = 2 * lig - q
  const hueToRgb = (t) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const r = Math.round(hueToRgb(hue + 1 / 3) * 255)
  const g = Math.round(hueToRgb(hue) * 255)
  const b = Math.round(hueToRgb(hue - 1 / 3) * 255)
  if (a >= 0.999) return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}${toHexByte(a * 255)}`
}

const hashSeed32 = (seedSource) => {
  const text = String(seedSource || 'seed')
  let seed = 2166136261 >>> 0
  for (let index = 0; index < text.length; index += 1) {
    seed ^= text.charCodeAt(index)
    seed = Math.imul(seed, 16777619)
    seed >>>= 0
  }
  return seed >>> 0
}

const createTerrainSpriteFallbackPalette = (seedHint, passable = true) => {
  const seed = hashSeed32(`terrain-palette|${seedHint}|${passable ? 'p' : 'b'}`)
  const baseHue = seed % 360
  if (passable) {
    return [
      '#00000000',
      hslToHex(baseHue, 38, 22),
      hslToHex(baseHue + 10, 46, 30),
      hslToHex(baseHue + 22, 52, 42),
      hslToHex(baseHue + 34, 44, 56),
    ]
  }
  return [
    '#00000000',
    hslToHex(baseHue, 20, 12),
    hslToHex(baseHue + 8, 24, 18),
    hslToHex(baseHue + 16, 28, 25),
    hslToHex(baseHue + 28, 30, 34),
  ]
}

const createTerrainSpriteFallbackPixels = (seedHint, passable = true) => {
  const seed = hashSeed32(`terrain-pixels|${seedHint}|${passable ? 'p' : 'b'}`)
  const stepA = 4 + (seed % 7)
  const stepB = 5 + ((seed >>> 3) % 6)
  const stepC = 6 + ((seed >>> 6) % 5)
  const offsetA = (seed >>> 8) % 29
  const offsetB = (seed >>> 13) % 31
  const offsetC = (seed >>> 17) % 37
  const baseChar = passable ? '1' : '2'
  const accentA = passable ? '2' : '3'
  const accentB = passable ? '3' : '4'
  const ridge = passable ? '4' : '1'
  const rows = []
  for (let y = 0; y < DUNGEON_TILE_MATRIX_SIZE; y += 1) {
    let line = ''
    for (let x = 0; x < DUNGEON_TILE_MATRIX_SIZE; x += 1) {
      let char = baseChar
      if (((x * 3 + y * 5 + offsetA) % stepA) === 0) char = accentA
      if (((x * 7 + y * 2 + offsetB) % stepB) === 0) char = accentB
      if (((x - y + offsetC) % stepC) === 0) char = ridge
      line += char
    }
    rows.push(line)
  }
  return rows
}

const normalizeDungeonTileColor = (value, fallback = '#00000000') => {
  const text = String(value || '').trim()
  if (DUNGEON_TILE_COLOR_RE.test(text)) return text
  return fallback
}

const normalizeDungeonTilePalette = (rawPalette, passable = true, seedHint = 'terrain') => {
  const source = Array.isArray(rawPalette) ? rawPalette : []
  const fallback = createTerrainSpriteFallbackPalette(seedHint, passable)
  const palette = source
    .map((item, index) => normalizeDungeonTileColor(item, fallback[index] || fallback[fallback.length - 1]))
    .slice(0, 8)
  if (palette.length < 2) {
    return [...fallback]
  }
  return palette
}

const normalizeDungeonTilePixels = (rawPixels, paletteSize, passable = true, seedHint = 'terrain') => {
  const fallback = createTerrainSpriteFallbackPixels(seedHint, passable)
  const source = Array.isArray(rawPixels) ? rawPixels : null
  if (!source || source.length < DUNGEON_TILE_MATRIX_SIZE) return fallback
  const maxIndex = Math.max(0, Math.min(15, (Number.parseInt(String(paletteSize), 10) || 1) - 1))
  const rows = []
  for (let y = 0; y < DUNGEON_TILE_MATRIX_SIZE; y += 1) {
    const rawLine = String(source[y] || '')
    const fallbackLine = String(fallback[y] || fallback[0] || '0'.repeat(DUNGEON_TILE_MATRIX_SIZE))
    if (!rawLine) {
      rows.push(fallbackLine)
      continue
    }
    let line = ''
    for (let x = 0; x < DUNGEON_TILE_MATRIX_SIZE; x += 1) {
      const char = rawLine[x] || fallbackLine[x] || '0'
      const value = Number.parseInt(char, 16)
      if (!Number.isFinite(value)) {
        line += fallbackLine[x] || '0'
        continue
      }
      line += Math.max(0, Math.min(maxIndex, Math.round(value))).toString(16)
    }
    rows.push(line)
  }
  return rows
}

const normalizeDungeonObjectPalette = (rawPalette) => {
  const source = Array.isArray(rawPalette) ? rawPalette : []
  const palette = source
    .map((item, index) => normalizeDungeonTileColor(
      item,
      DUNGEON_OBJECT_PALETTE_FALLBACK[index] || DUNGEON_OBJECT_PALETTE_FALLBACK[DUNGEON_OBJECT_PALETTE_FALLBACK.length - 1],
    ))
    .slice(0, 8)
  if (palette.length < 2) return [...DUNGEON_OBJECT_PALETTE_FALLBACK]
  return palette
}

const normalizeDungeonObjectPixels = (rawPixels, paletteSize) => {
  const source = Array.isArray(rawPixels) ? rawPixels : null
  if (!source || source.length < DUNGEON_TILE_MATRIX_SIZE) return DUNGEON_OBJECT_PIXELS_FALLBACK
  const maxIndex = Math.max(0, Math.min(15, (Number.parseInt(String(paletteSize), 10) || 1) - 1))
  const rows = []
  for (let y = 0; y < DUNGEON_TILE_MATRIX_SIZE; y += 1) {
    const rawLine = String(source[y] || '')
    const fallbackLine = String(DUNGEON_OBJECT_PIXELS_FALLBACK[y] || DUNGEON_OBJECT_PIXELS_FALLBACK[0] || '0'.repeat(DUNGEON_TILE_MATRIX_SIZE))
    if (!rawLine) {
      rows.push(fallbackLine)
      continue
    }
    let line = ''
    for (let x = 0; x < DUNGEON_TILE_MATRIX_SIZE; x += 1) {
      const char = rawLine[x] || fallbackLine[x] || '0'
      const value = Number.parseInt(char, 16)
      if (!Number.isFinite(value)) {
        line += fallbackLine[x] || '0'
        continue
      }
      line += Math.max(0, Math.min(maxIndex, Math.round(value))).toString(16)
    }
    rows.push(line)
  }
  return rows
}

export const createDungeonSpriteRuntime = (options = {}) => {
  const hiddenObjectTypesWhenCleared = new Set(
    (Array.isArray(options?.hiddenObjectTypesWhenCleared) ? options.hiddenObjectTypesWhenCleared : [])
      .map((item) => String(item || '')),
  )
  const emptyTileType = String(options?.emptyTileType || 'empty')
  const tileSpriteCache = new Map()
  const objectSpriteCache = new Map()

  const shouldRenderDungeonObjectSprite = (cell) => {
    if (!cell) return false
    if (cell?.cleared && hiddenObjectTypesWhenCleared.has(String(cell?.type || emptyTileType))) return false
    const objectType = String(cell?.objectType || '').trim().toLowerCase()
    if (objectType === 'none') return false
    const hasPixels = Array.isArray(cell?.objectPixels16) && cell.objectPixels16.length >= DUNGEON_TILE_MATRIX_SIZE
    const hasPalette = Array.isArray(cell?.objectPalette) && cell.objectPalette.length >= 2
    if (!objectType && !hasPixels) return false
    if (objectType === 'empty' && !hasPixels) return false
    return hasPixels || hasPalette || Boolean(cell?.objectId)
  }

  const getDungeonTerrainSpriteSrc = (cell, index = 0) => {
    const passable = Boolean(cell?.terrainPassable)
    const terrainId = String(cell?.terrainId || (passable ? 'path' : 'wall')).trim()
    const palette = normalizeDungeonTilePalette(cell?.terrainPalette, passable, terrainId)
    const pixels16 = normalizeDungeonTilePixels(cell?.terrainPixels16, palette.length, passable, terrainId)
    const cacheKey = `${terrainId}|${passable ? 'p' : 'b'}|${palette.join(',')}|${pixels16.join('|')}|${index % 4}`
    const cached = tileSpriteCache.get(cacheKey)
    if (cached) return cached

    const size = DUNGEON_TILE_MATRIX_SIZE * DUNGEON_TILE_PIXEL_SIZE
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`
    for (let y = 0; y < DUNGEON_TILE_MATRIX_SIZE; y += 1) {
      const line = String(pixels16[y] || '')
      for (let x = 0; x < DUNGEON_TILE_MATRIX_SIZE; x += 1) {
        const value = Number.parseInt(line[x] || '0', 16)
        if (!Number.isFinite(value)) continue
        const paletteIndex = Math.max(0, Math.min(palette.length - 1, Math.round(value)))
        const color = palette[paletteIndex]
        if (!color || color.toLowerCase() === '#00000000') continue
        svg += `<rect x="${x * DUNGEON_TILE_PIXEL_SIZE}" y="${y * DUNGEON_TILE_PIXEL_SIZE}" width="${DUNGEON_TILE_PIXEL_SIZE}" height="${DUNGEON_TILE_PIXEL_SIZE}" fill="${color}"/>`
      }
    }
    svg += '</svg>'
    const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`
    tileSpriteCache.set(cacheKey, uri)
    if (tileSpriteCache.size > 480) {
      const oldestKey = tileSpriteCache.keys().next().value
      tileSpriteCache.delete(oldestKey)
    }
    return uri
  }

  const getDungeonObjectSpriteSrc = (cell, index = 0) => {
    if (!shouldRenderDungeonObjectSprite(cell)) return ''
    const objectType = String(cell?.objectType || '').trim().toLowerCase() || 'object'
    const objectId = String(cell?.objectId || `${objectType}-${cell?.x ?? 0}-${cell?.y ?? 0}`).trim() || 'object'
    const palette = normalizeDungeonObjectPalette(cell?.objectPalette)
    const pixels16 = normalizeDungeonObjectPixels(cell?.objectPixels16, palette.length)
    const cacheKey = `${objectId}|${objectType}|${palette.join(',')}|${pixels16.join('|')}|${index % 4}`
    const cached = objectSpriteCache.get(cacheKey)
    if (cached) return cached

    const size = DUNGEON_TILE_MATRIX_SIZE * DUNGEON_TILE_PIXEL_SIZE
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`
    for (let y = 0; y < DUNGEON_TILE_MATRIX_SIZE; y += 1) {
      const line = String(pixels16[y] || '')
      for (let x = 0; x < DUNGEON_TILE_MATRIX_SIZE; x += 1) {
        const value = Number.parseInt(line[x] || '0', 16)
        if (!Number.isFinite(value)) continue
        const paletteIndex = Math.max(0, Math.min(palette.length - 1, Math.round(value)))
        const color = palette[paletteIndex]
        if (!color || color.toLowerCase() === '#00000000') continue
        svg += `<rect x="${x * DUNGEON_TILE_PIXEL_SIZE}" y="${y * DUNGEON_TILE_PIXEL_SIZE}" width="${DUNGEON_TILE_PIXEL_SIZE}" height="${DUNGEON_TILE_PIXEL_SIZE}" fill="${color}"/>`
      }
    }
    svg += '</svg>'
    const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`
    objectSpriteCache.set(cacheKey, uri)
    if (objectSpriteCache.size > 720) {
      const oldestKey = objectSpriteCache.keys().next().value
      objectSpriteCache.delete(oldestKey)
    }
    return uri
  }

  return {
    shouldRenderDungeonObjectSprite,
    getDungeonTerrainSpriteSrc,
    getDungeonObjectSpriteSrc,
  }
}
