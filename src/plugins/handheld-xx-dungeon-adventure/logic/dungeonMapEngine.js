export const DUNGEON_MAP_MIN_SIZE = 5
export const DUNGEON_MAP_MAX_SIZE = 9
export const DUNGEON_TILE_START = 'start'
export const DUNGEON_TILE_EMPTY = 'empty'
export const DUNGEON_TILE_MONSTER = 'monster'
export const DUNGEON_TILE_BOSS = 'boss'
export const DUNGEON_TILE_TREASURE = 'treasure'
export const DUNGEON_TILE_EXIT = 'exit'

const DUNGEON_TERRAIN_MATRIX_SIZE = 16
const DUNGEON_TERRAIN_HEX_COLOR_RE = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i
const DUNGEON_TERRAIN_ID_RE = /[^a-z0-9_-]/g
const DUNGEON_TERRAIN_FORCED_PASSABLE_TYPE_SET = new Set([
  DUNGEON_TILE_START,
  DUNGEON_TILE_EXIT,
  DUNGEON_TILE_MONSTER,
  DUNGEON_TILE_BOSS,
  DUNGEON_TILE_TREASURE,
])
const DUNGEON_OBJECT_TYPE_SET = new Set(['start', 'exit', 'monster', 'boss', 'treasure', 'empty', 'none'])

const createDungeonObjectMatrixFallback = (kind = 'empty', main = '2', accent = '3', detail = '4') => {
  const rows = []
  const mainChar = String(main || '2').slice(0, 1) || '2'
  const accentChar = String(accent || '3').slice(0, 1) || '3'
  const detailChar = String(detail || '4').slice(0, 1) || '4'
  for (let y = 0; y < DUNGEON_TERRAIN_MATRIX_SIZE; y += 1) {
    let line = ''
    for (let x = 0; x < DUNGEON_TERRAIN_MATRIX_SIZE; x += 1) {
      let char = '0'
      if (kind === 'start') {
        const inCore = x >= 5 && x <= 10 && y >= 5 && y <= 10
        if (inCore) char = (x + y) % 2 === 0 ? mainChar : accentChar
        if ((x === 7 || x === 8) && y >= 2 && y <= 13) char = detailChar
        if ((y === 7 || y === 8) && x >= 2 && x <= 13) char = detailChar
      } else if (kind === 'exit') {
        const dx = x - 7.5
        const dy = y - 7.5
        const dist = dx * dx + dy * dy
        if (dist >= 20 && dist <= 52) char = mainChar
        if (dist >= 30 && dist <= 36 && (x + y) % 2 === 0) char = accentChar
        if (dist < 8) char = detailChar
      } else if (kind === 'monster') {
        if (x >= 4 && x <= 11 && y >= 4 && y <= 11) char = mainChar
        if ((x === 6 || x === 9) && y >= 6 && y <= 7) char = '0'
        if ((x === 6 || x === 9) && y >= 9 && y <= 10) char = '0'
        if (y === 11 && x >= 6 && x <= 9) char = accentChar
        if (y === 12 && x >= 5 && x <= 10) char = accentChar
      } else if (kind === 'boss') {
        if (x >= 4 && x <= 11 && y >= 5 && y <= 12) char = mainChar
        if (y >= 2 && y <= 5 && (x === 5 || x === 7 || x === 9 || x === 11)) char = accentChar
        if (y === 6 && x >= 4 && x <= 11) char = detailChar
      } else if (kind === 'treasure') {
        if (x >= 4 && x <= 11 && y >= 8 && y <= 12) char = mainChar
        if (x >= 5 && x <= 10 && y >= 6 && y <= 8) char = accentChar
        if (y === 9 && (x === 7 || x === 8)) char = detailChar
      } else if (kind === 'empty') {
        if ((x * 3 + y * 5) % 17 === 0) char = mainChar
        if ((x + y) % 11 === 0) char = accentChar
      }
      line += char
    }
    rows.push(line)
  }
  return rows
}

const DUNGEON_OBJECT_DEFAULT_CATALOG = [
  {
    id: 'obj-start-rune',
    type: 'start',
    name: '启程符阵',
    weight: 46,
    palette: ['#00000000', '#1d2d3a', '#2f6f72', '#5bd0cf', '#cffff8'],
    pixels16: createDungeonObjectMatrixFallback('start', '2', '3', '4'),
  },
  {
    id: 'obj-exit-gate',
    type: 'exit',
    name: '传送门',
    weight: 44,
    palette: ['#00000000', '#1d1f39', '#4250a8', '#7f9dff', '#d3e1ff'],
    pixels16: createDungeonObjectMatrixFallback('exit', '2', '3', '4'),
  },
  {
    id: 'obj-monster-totem',
    type: 'monster',
    name: '魔物图腾',
    weight: 50,
    palette: ['#00000000', '#2b1d21', '#7b3a43', '#c85a63', '#ffd0b8'],
    pixels16: createDungeonObjectMatrixFallback('monster', '2', '3', '4'),
  },
  {
    id: 'obj-boss-crown',
    type: 'boss',
    name: '王冠祭坛',
    weight: 52,
    palette: ['#00000000', '#26170f', '#7c3f1a', '#d68f33', '#ffe08a'],
    pixels16: createDungeonObjectMatrixFallback('boss', '2', '3', '4'),
  },
  {
    id: 'obj-treasure-chest',
    type: 'treasure',
    name: '宝箱',
    weight: 48,
    palette: ['#00000000', '#2a2216', '#7d4f23', '#c58b3e', '#f6de9a'],
    pixels16: createDungeonObjectMatrixFallback('treasure', '2', '3', '4'),
  },
  {
    id: 'obj-empty-rubble',
    type: 'empty',
    name: '碎石堆',
    weight: 20,
    palette: ['#00000000', '#1f2530', '#384255', '#59667f', '#8b9ab4'],
    pixels16: createDungeonObjectMatrixFallback('empty', '2', '3', '4'),
  },
]

const fallbackClampInt = (value, min, max, fallback = min) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

const fallbackCreateId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const fallbackPickRandom = (list, fallback = null) => {
  if (!Array.isArray(list) || list.length === 0) return fallback
  return list[Math.floor(Math.random() * list.length)]
}

const fallbackRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const cloneDungeonTerrainTile = (tile) => {
  const source = tile && typeof tile === 'object' ? tile : {}
  return {
    id: String(source.id || 'terrain').trim().slice(0, 40) || 'terrain',
    name: String(source.name || '地形').trim().slice(0, 20) || '地形',
    passable: Boolean(source.passable),
    weight: fallbackClampInt(source.weight, 1, 100, 10),
    palette: Array.isArray(source.palette) ? source.palette.map((color) => String(color || '')) : [],
    pixels16: Array.isArray(source.pixels16) ? source.pixels16.map((line) => String(line || '')) : [],
  }
}

const cloneDungeonTerrainCatalog = (list) => {
  return (Array.isArray(list) ? list : []).map((tile) => cloneDungeonTerrainTile(tile))
}

const cloneDungeonObjectTile = (item) => {
  const source = item && typeof item === 'object' ? item : {}
  return {
    id: String(source.id || 'object').trim().slice(0, 40) || 'object',
    type: String(source.type || 'empty').trim().toLowerCase(),
    name: String(source.name || '场景物体').trim().slice(0, 20) || '场景物体',
    weight: fallbackClampInt(source.weight, 1, 100, 20),
    palette: Array.isArray(source.palette) ? source.palette.map((color) => String(color || '')) : [],
    pixels16: Array.isArray(source.pixels16) ? source.pixels16.map((line) => String(line || '')) : [],
  }
}

const cloneDungeonObjectCatalog = (list) => {
  return (Array.isArray(list) ? list : []).map((item) => cloneDungeonObjectTile(item))
}

const normalizeDungeonCellType = (rawType, fallback = DUNGEON_TILE_EMPTY) => {
  const type = String(rawType || '').trim().toLowerCase()
  if (
    type === DUNGEON_TILE_START ||
    type === DUNGEON_TILE_EMPTY ||
    type === DUNGEON_TILE_MONSTER ||
    type === DUNGEON_TILE_BOSS ||
    type === DUNGEON_TILE_TREASURE ||
    type === DUNGEON_TILE_EXIT
  ) {
    return type
  }
  return fallback
}

const normalizeDungeonObjectType = (rawType, fallback = 'empty') => {
  const type = String(rawType || '').trim().toLowerCase()
  return DUNGEON_OBJECT_TYPE_SET.has(type) ? type : fallback
}

const mapDungeonCellTypeToObjectType = (cellType) => {
  const type = normalizeDungeonCellType(cellType, DUNGEON_TILE_EMPTY)
  if (type === DUNGEON_TILE_START) return 'start'
  if (type === DUNGEON_TILE_EXIT) return 'exit'
  if (type === DUNGEON_TILE_MONSTER) return 'monster'
  if (type === DUNGEON_TILE_BOSS) return 'boss'
  if (type === DUNGEON_TILE_TREASURE) return 'treasure'
  return 'empty'
}

const createEmptyDungeonMap = () => null

const createEnemyFallback = (floor, isBoss = false, index = 0) => {
  return {
    name: `${isBoss ? '首领' : '怪物'}${index + 1}`,
    hp: Math.round((isBoss ? 190 : 108) + floor * (isBoss ? 34 : 18)),
    attack: Math.round((isBoss ? 30 : 17) + floor * (isBoss ? 3.2 : 1.8)),
  }
}

const createDropFallback = (floor, isBoss = false, index = 0) => {
  const healValue = isBoss ? Math.round(42 + floor * 3) : Math.round(18 + floor * 2)
  const bossNames = ['王者回复药', '神圣绷带', '战场急救包', '炽焰药剂']
  const mobNames = ['小型回复瓶', '应急绷带', '止痛药剂', '草本药水']
  const name = isBoss ? bossNames[index % bossNames.length] : mobNames[index % mobNames.length]
  return {
    name,
    effectType: 'heal_hp',
    target: 'ally',
    value: healValue,
    amount: 1,
    desc: `恢复 ${healValue} 点生命`,
  }
}

const normalizeTerrainId = (value, fallback = 'terrain') => {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(DUNGEON_TERRAIN_ID_RE, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return cleaned || fallback
}

const normalizeTerrainName = (value, fallback = '地形') => {
  return String(value || '').trim().slice(0, 20) || fallback
}

const normalizeTerrainColor = (value, fallback = '#00000000') => {
  const text = String(value || '').trim()
  if (DUNGEON_TERRAIN_HEX_COLOR_RE.test(text)) return text
  return fallback
}

const createSeededRandom = (seedSource) => {
  const source = String(seedSource || 'seed')
  let seed = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    seed ^= source.charCodeAt(index)
    seed = Math.imul(seed, 16777619)
  }
  seed >>>= 0
  if (seed === 0) seed = 0x9e3779b9
  return () => {
    seed += 0x6d2b79f5
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const shuffleDirectionList = (directions, random) => {
  const list = Array.isArray(directions) ? [...directions] : []
  for (let index = list.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    const temp = list[index]
    list[index] = list[target]
    list[target] = temp
  }
  return list
}

export const createDungeonMapRuntime = (deps = {}) => {
  const clampInt = typeof deps.clampInt === 'function' ? deps.clampInt : fallbackClampInt
  const makeId = typeof deps.makeId === 'function' ? deps.makeId : fallbackCreateId
  const pickRandomItem = typeof deps.pickRandomItem === 'function' ? deps.pickRandomItem : fallbackPickRandom
  const randomInt = typeof deps.randomInt === 'function' ? deps.randomInt : fallbackRandomInt

  const createDungeonCellId = (x, y) => `${x}:${y}`

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

  const createTerrainPaletteBySeed = (seedHint, passable = true) => {
    const random = createSeededRandom(`terrain-palette|${seedHint}|${passable ? 'p' : 'b'}`)
    const baseHue = Math.floor(random() * 360)
    if (passable) {
      const sat = 32 + Math.floor(random() * 30)
      const light = 24 + Math.floor(random() * 10)
      return [
        '#00000000',
        hslToHex(baseHue, sat, light),
        hslToHex(baseHue + 9 + random() * 18, sat + 8, light + 8),
        hslToHex(baseHue + 20 + random() * 24, sat + 10, light + 18),
        hslToHex(baseHue + 32 + random() * 26, sat + 5, light + 30),
      ]
    }
    const sat = 18 + Math.floor(random() * 22)
    const light = 13 + Math.floor(random() * 7)
    return [
      '#00000000',
      hslToHex(baseHue, sat, light),
      hslToHex(baseHue + 8 + random() * 14, sat + 5, light + 5),
      hslToHex(baseHue + 18 + random() * 18, sat + 7, light + 11),
      hslToHex(baseHue + 30 + random() * 18, sat + 6, light + 18),
    ]
  }

  const createTerrainPixelsBySeed = (seedHint, passable = true) => {
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
    for (let y = 0; y < DUNGEON_TERRAIN_MATRIX_SIZE; y += 1) {
      let line = ''
      for (let x = 0; x < DUNGEON_TERRAIN_MATRIX_SIZE; x += 1) {
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

  const buildDungeonTerrainFallbackCatalog = (seedHint = 'fallback-seed', themeHint = '迷宫遗迹') => {
    const random = createSeededRandom(`terrain-catalog|${seedHint}|${themeHint}`)
    const pathNames = ['碎石步道', '苔纹地砖', '雾影小径', '古阶回廊', '藤蔓走道', '青石甬道']
    const blockNames = ['断壁残垣', '深渊裂缝', '荆棘岩墙', '塌陷石堆', '毒雾泥潭', '黑曜障壁']
    const pickName = (list, fallback, index) => {
      if (!Array.isArray(list) || list.length < 1) return `${fallback}${index + 1}`
      const picked = list[Math.floor(random() * list.length)]
      return String(picked || `${fallback}${index + 1}`).trim().slice(0, 20) || `${fallback}${index + 1}`
    }
    const makeTile = (passable, slot) => {
      const suffix = hashSeed32(`${seedHint}|${themeHint}|${passable ? 'p' : 'b'}|${slot}`).toString(16).slice(-4)
      const id = passable ? `llm-path-${slot + 1}-${suffix}` : `llm-block-${slot + 1}-${suffix}`
      return {
        id,
        name: passable ? pickName(pathNames, '可通行地形', slot) : pickName(blockNames, '阻塞地形', slot),
        passable,
        weight: clampInt(28 + Math.round(random() * 52), 1, 100, 40),
        palette: createTerrainPaletteBySeed(`${seedHint}|${themeHint}|${id}`, passable),
        pixels16: createTerrainPixelsBySeed(`${seedHint}|${themeHint}|${id}`, passable),
      }
    }
    return [
      makeTile(true, 0),
      makeTile(true, 1),
      makeTile(false, 0),
      makeTile(false, 1),
    ]
  }

  const normalizeTerrainPalette = (rawPalette, fallbackPalette = ['#00000000', '#506f45', '#7ea463']) => {
    const source = Array.isArray(rawPalette) ? rawPalette : []
    const fallback = Array.isArray(fallbackPalette) ? fallbackPalette : ['#00000000', '#506f45', '#7ea463']
    const palette = source
      .map((item, index) => normalizeTerrainColor(item, fallback[index] || fallback[fallback.length - 1] || '#00000000'))
      .slice(0, 8)
    if (palette.length < 2) {
      return fallback
        .map((item) => normalizeTerrainColor(item, '#00000000'))
        .slice(0, 8)
    }
    return palette
  }

  const normalizeTerrainPixels16 = (rawPixels, paletteSize, fallbackPixels) => {
    const fallback = Array.isArray(fallbackPixels) ? fallbackPixels : []
    const fallbackRows = []
    for (let rowIndex = 0; rowIndex < DUNGEON_TERRAIN_MATRIX_SIZE; rowIndex += 1) {
      const fallbackRowText = String(fallback[rowIndex] || '').trim()
      const fallbackChar = fallbackRowText[0] || '0'
      const fallbackRow = (fallbackRowText.padEnd(DUNGEON_TERRAIN_MATRIX_SIZE, fallbackChar)).slice(0, DUNGEON_TERRAIN_MATRIX_SIZE)
      fallbackRows.push(fallbackRow)
    }

    const sourceRows = Array.isArray(rawPixels) ? rawPixels : null
    if (!sourceRows || sourceRows.length < DUNGEON_TERRAIN_MATRIX_SIZE) {
      return fallbackRows
    }

    const maxPaletteIndex = Math.max(0, Math.min(15, Number.isFinite(paletteSize) ? Math.round(paletteSize) - 1 : 0))
    const normalized = []
    for (let y = 0; y < DUNGEON_TERRAIN_MATRIX_SIZE; y += 1) {
      const sourceRow = String(sourceRows[y] || '').trim()
      const baseFallback = fallbackRows[y] || fallbackRows[0] || '0'.repeat(DUNGEON_TERRAIN_MATRIX_SIZE)
      if (!sourceRow) {
        normalized.push(baseFallback)
        continue
      }
      let rowText = ''
      for (let x = 0; x < DUNGEON_TERRAIN_MATRIX_SIZE; x += 1) {
        const char = sourceRow[x] || baseFallback[x] || '0'
        const parsed = Number.parseInt(char, 16)
        if (!Number.isFinite(parsed)) {
          rowText += baseFallback[x] || '0'
          continue
        }
        const clipped = Math.max(0, Math.min(maxPaletteIndex, Math.round(parsed)))
        rowText += clipped.toString(16)
      }
      normalized.push(rowText)
    }
    return normalized
  }

  const normalizeDungeonTileCatalog = (rawCatalog, options = {}) => {
    const fallbackCatalog = cloneDungeonTerrainCatalog(
      buildDungeonTerrainFallbackCatalog(
        String(options.seedHint || 'fallback-seed'),
        String(options.themeHint || '迷宫遗迹'),
      ),
    )
    const source = Array.isArray(rawCatalog) ? rawCatalog : []
    const takenIds = new Set()
    const result = []

    for (let index = 0; index < source.length; index += 1) {
      const item = source[index]
      if (!item || typeof item !== 'object') continue
      const fallbackTile = fallbackCatalog[index % fallbackCatalog.length]
      const id = normalizeTerrainId(item.id, `${fallbackTile.id}-${index + 1}`)
      if (takenIds.has(id)) continue
      const passable = typeof item.passable === 'boolean' ? item.passable : Boolean(fallbackTile.passable)
      const palette = normalizeTerrainPalette(item.palette, fallbackTile.palette)
      const pixels16 = normalizeTerrainPixels16(
        item.pixels16 || item.matrix16 || item.pixels || item.pattern,
        palette.length,
        fallbackTile.pixels16,
      )
      result.push({
        id,
        name: normalizeTerrainName(item.name, fallbackTile.name),
        passable,
        weight: clampInt(item.weight, 1, 100, fallbackTile.weight),
        palette,
        pixels16,
      })
      takenIds.add(id)
      if (result.length >= 8) break
    }

    const ensureFallbackTile = (tile) => {
      if (!tile || typeof tile !== 'object') return
      const id = normalizeTerrainId(tile.id, makeId('terrain'))
      if (takenIds.has(id)) return
      result.push({
        id,
        name: normalizeTerrainName(tile.name, '地形'),
        passable: Boolean(tile.passable),
        weight: clampInt(tile.weight, 1, 100, 10),
        palette: normalizeTerrainPalette(tile.palette, ['#00000000', '#506f45', '#7ea463']),
        pixels16: normalizeTerrainPixels16(tile.pixels16, Array.isArray(tile.palette) ? tile.palette.length : 4, tile.pixels16),
      })
      takenIds.add(id)
    }

    if (result.length < 3) {
      fallbackCatalog.forEach((tile) => {
        if (result.length >= 4) return
        ensureFallbackTile(tile)
      })
    }

    const hasPassable = result.some((item) => item.passable)
    const hasBlocked = result.some((item) => !item.passable)
    if (!hasPassable) {
      const fallbackPassable = fallbackCatalog.find((item) => item.passable) || fallbackCatalog[0]
      ensureFallbackTile(fallbackPassable)
    }
    if (!hasBlocked) {
      const fallbackBlocked = fallbackCatalog.find((item) => !item.passable) || fallbackCatalog[fallbackCatalog.length - 1]
      ensureFallbackTile(fallbackBlocked)
    }

    return result.slice(0, 8)
  }

  const normalizeDungeonObjectCatalog = (rawCatalog) => {
    const fallbackCatalog = cloneDungeonObjectCatalog(DUNGEON_OBJECT_DEFAULT_CATALOG)
    const source = Array.isArray(rawCatalog) ? rawCatalog : []
    const takenIds = new Set()
    const result = []

    for (let index = 0; index < source.length; index += 1) {
      const item = source[index]
      if (!item || typeof item !== 'object') continue
      const fallbackObject = fallbackCatalog[index % fallbackCatalog.length]
      const id = normalizeTerrainId(item.id, `${fallbackObject.id}-${index + 1}`)
      if (takenIds.has(id)) continue
      const type = normalizeDungeonObjectType(item.type || item.kind || item.cellType, fallbackObject.type)
      const palette = normalizeTerrainPalette(item.palette, fallbackObject.palette)
      const pixels16 = normalizeTerrainPixels16(
        item.pixels16 || item.matrix16 || item.pixels || item.pattern,
        palette.length,
        fallbackObject.pixels16,
      )
      result.push({
        id,
        type,
        name: normalizeTerrainName(item.name, fallbackObject.name),
        weight: clampInt(item.weight, 1, 100, fallbackObject.weight),
        palette,
        pixels16,
      })
      takenIds.add(id)
      if (result.length >= 12) break
    }

    const ensureFallbackObject = (item) => {
      if (!item || typeof item !== 'object') return
      const id = normalizeTerrainId(item.id, makeId('object'))
      if (takenIds.has(id)) return
      result.push({
        id,
        type: normalizeDungeonObjectType(item.type, 'empty'),
        name: normalizeTerrainName(item.name, '场景物体'),
        weight: clampInt(item.weight, 1, 100, 20),
        palette: normalizeTerrainPalette(item.palette, ['#00000000', '#2b3947', '#4a7f9a']),
        pixels16: normalizeTerrainPixels16(item.pixels16, Array.isArray(item.palette) ? item.palette.length : 4, item.pixels16),
      })
      takenIds.add(id)
    }

    const requiredTypes = ['start', 'exit', 'monster', 'boss', 'treasure']
    requiredTypes.forEach((type) => {
      if (result.some((item) => item.type === type)) return
      const fallbackObject = fallbackCatalog.find((item) => item.type === type)
      ensureFallbackObject(fallbackObject)
    })

    if (result.length < 4) {
      fallbackCatalog.forEach((item) => {
        if (result.length >= 6) return
        ensureFallbackObject(item)
      })
    }

    return result.slice(0, 12)
  }

  const pickTerrainTileByPassable = (tileCatalog, passable, random, fallbackCatalog = []) => {
    const source = (Array.isArray(tileCatalog) ? tileCatalog : []).filter((item) => Boolean(item?.passable) === Boolean(passable))
    const list = source.length > 0 ? source : (Array.isArray(tileCatalog) ? tileCatalog : [])
    const fallbackList = Array.isArray(fallbackCatalog) && fallbackCatalog.length > 0
      ? fallbackCatalog
      : buildDungeonTerrainFallbackCatalog('pick-terrain-fallback', '地牢')
    if (list.length < 1) {
      const tile = fallbackList.find((item) => Boolean(item?.passable) === Boolean(passable)) || fallbackList[0]
      return cloneDungeonTerrainTile(tile)
    }
    let totalWeight = 0
    list.forEach((item) => {
      totalWeight += clampInt(item?.weight, 1, 100, 10)
    })
    if (totalWeight <= 0) return cloneDungeonTerrainTile(list[0])
    let roll = random() * totalWeight
    for (const item of list) {
      roll -= clampInt(item?.weight, 1, 100, 10)
      if (roll <= 0) return cloneDungeonTerrainTile(item)
    }
    return cloneDungeonTerrainTile(list[list.length - 1])
  }

  const pickDungeonObjectByType = (objectCatalog, type, random) => {
    const source = (Array.isArray(objectCatalog) ? objectCatalog : [])
      .filter((item) => normalizeDungeonObjectType(item?.type, '') === type)
    if (source.length < 1) return null
    let totalWeight = 0
    source.forEach((item) => {
      totalWeight += clampInt(item?.weight, 1, 100, 20)
    })
    if (totalWeight <= 0) return cloneDungeonObjectTile(source[0])
    let roll = random() * totalWeight
    for (const item of source) {
      roll -= clampInt(item?.weight, 1, 100, 20)
      if (roll <= 0) return cloneDungeonObjectTile(item)
    }
    return cloneDungeonObjectTile(source[source.length - 1])
  }

  const pickDungeonObjectForCell = (cell, objectCatalog, random) => {
    const sourceCatalog = Array.isArray(objectCatalog) ? objectCatalog : []
    if (sourceCatalog.length < 1) return null

    const explicitId = normalizeTerrainId(cell?.objectId, '')
    if (explicitId) {
      const matched = sourceCatalog.find((item) => normalizeTerrainId(item?.id, '') === explicitId)
      if (matched) return cloneDungeonObjectTile(matched)
    }

    const explicitType = normalizeDungeonObjectType(cell?.objectType, '')
    if (explicitType === 'none') return null
    const objectType = explicitType || mapDungeonCellTypeToObjectType(cell?.type)
    if (!objectType) return null

    if (objectType === 'empty' && !explicitType) {
      if (random() > 0.28) return null
    }
    return pickDungeonObjectByType(sourceCatalog, objectType, random)
  }

  const buildGuaranteedRouteSet = (width, height, start, exit, random) => {
    const route = []
    const visited = new Set()
    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]

    const dfs = (x, y) => {
      const key = createDungeonCellId(x, y)
      if (visited.has(key)) return false
      visited.add(key)
      route.push(key)
      if (x === exit.x && y === exit.y) return true
      const orderedDirections = shuffleDirectionList(directions, random)
      for (const [dx, dy] of orderedDirections) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        if (dfs(nx, ny)) return true
      }
      route.pop()
      return false
    }

    if (dfs(start.x, start.y)) {
      return new Set(route)
    }
    return new Set([createDungeonCellId(start.x, start.y), createDungeonCellId(exit.x, exit.y)])
  }

  const expandRouteBranches = (routeSet, width, height, random) => {
    const maxExtra = Math.max(1, Math.round(width * height * 0.2))
    const sourceKeys = Array.from(routeSet)
    let added = 0
    for (const key of sourceKeys) {
      if (added >= maxExtra) break
      if (random() > 0.72) continue
      const parts = key.split(':')
      const x = Number.parseInt(parts[0], 10)
      const y = Number.parseInt(parts[1], 10)
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      const directions = shuffleDirectionList([
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ], random)
      for (const [dx, dy] of directions) {
        if (added >= maxExtra) break
        if (random() > 0.45) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const nextKey = createDungeonCellId(nx, ny)
        if (routeSet.has(nextKey)) continue
        routeSet.add(nextKey)
        added += 1
        if (added >= maxExtra) break
        if (random() > 0.32) continue
        const sx = nx + dx
        const sy = ny + dy
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
        const secondKey = createDungeonCellId(sx, sy)
        if (routeSet.has(secondKey)) continue
        routeSet.add(secondKey)
        added += 1
      }
    }
  }

  const normalizeDungeonDrop = (rawValue, floor = 1, isBoss = false, index = 0) => {
    const fallback = createDropFallback(floor, isBoss, index)
    const raw = rawValue && typeof rawValue === 'object' ? rawValue : {}
    const effectTypeRaw = String(raw.effectType || raw.type || raw.effect || '').trim().toLowerCase()
    const effectType = effectTypeRaw === 'heal_hp' ? 'heal_hp' : 'heal_hp'
    const targetRaw = String(raw.target || raw.targetType || '').trim().toLowerCase()
    const target = targetRaw === 'ally' ? 'ally' : 'ally'
    const value = clampInt(raw.value ?? raw.effectValue ?? raw.hp, 1, 9999, fallback.value)
    const amount = clampInt(raw.amount ?? raw.count ?? raw.quantity, 1, 99, fallback.amount)
    const name = String(raw.name || fallback.name).trim().slice(0, 24) || fallback.name
    const desc = String(raw.desc || raw.description || fallback.desc || '').trim().slice(0, 40) || fallback.desc
    return {
      name,
      effectType,
      target,
      value,
      amount,
      desc,
    }
  }

  const normalizeDungeonEnemy = (rawValue, floor = 1, isBoss = false, index = 0) => {
    const fallback = createEnemyFallback(floor, isBoss, index)
    const rawDrops = Array.isArray(rawValue?.drops)
      ? rawValue.drops
      : (Array.isArray(rawValue?.dropItems) ? rawValue.dropItems : [])
    const drops = (rawDrops.length > 0 ? rawDrops : [null])
      .map((item, dropIndex) => normalizeDungeonDrop(item, floor, isBoss, index + dropIndex))
      .slice(0, 3)
    return {
      name: String(rawValue?.name || fallback.name || `${isBoss ? '首领' : '怪物'}${index + 1}`).trim().slice(0, 24) || `${isBoss ? '首领' : '怪物'}${index + 1}`,
      hp: clampInt(rawValue?.hp, 20, 999999, fallback.hp),
      attack: clampInt(rawValue?.attack, 6, 99999, fallback.attack),
      drops,
    }
  }

  const normalizeDungeonReward = (rawValue, floor = 1, isBoss = false) => {
    const fallbackCoins = Math.round((isBoss ? 240 : 80) + floor * (isBoss ? 42 : 14))
    const fallbackGems = Math.round((isBoss ? 88 : 24) + floor * (isBoss ? 7 : 3))
    const fallbackExp = Math.round((isBoss ? 120 : 42) + floor * (isBoss ? 24 : 9))
    const fallbackDrop = isBoss ? 0.52 : 0.18
    const rawDrop = Number.parseFloat(String(rawValue?.equipmentChance))
    return {
      coins: clampInt(rawValue?.coins, 0, 999999, fallbackCoins),
      gems: clampInt(rawValue?.gems, 0, 999999, fallbackGems),
      exp: clampInt(rawValue?.exp, 0, 999999, fallbackExp),
      equipmentChance: Number.isFinite(rawDrop) ? Math.min(1, Math.max(0, rawDrop)) : fallbackDrop,
    }
  }

  const normalizeDungeonMap = (rawMap, floor = 1) => {
    if (!rawMap || typeof rawMap !== 'object') return createEmptyDungeonMap()
    const width = clampInt(rawMap.width, DUNGEON_MAP_MIN_SIZE, DUNGEON_MAP_MAX_SIZE, 6)
    const height = clampInt(rawMap.height, DUNGEON_MAP_MIN_SIZE, DUNGEON_MAP_MAX_SIZE, 6)
    const theme = String(rawMap.theme || rawMap.style || '迷宫遗迹').trim().slice(0, 28) || '迷宫遗迹'
    const startX = clampInt(rawMap?.start?.x, 0, width - 1, 0)
    const startY = clampInt(rawMap?.start?.y, 0, height - 1, height - 1)
    const exitX = clampInt(rawMap?.exit?.x, 0, width - 1, width - 1)
    const exitY = clampInt(rawMap?.exit?.y, 0, height - 1, 0)
    const terrainSeed = String(
      rawMap.terrainSeed ||
      rawMap.seed ||
      `${rawMap.id || 'map'}|${floor}|${theme}|${width}x${height}|${startX},${startY}|${exitX},${exitY}`,
    ).trim().slice(0, 120)
    const tileCatalog = normalizeDungeonTileCatalog(
      rawMap.tileCatalog || rawMap.terrainTiles || rawMap.tileset,
      { seedHint: terrainSeed, themeHint: theme },
    )
    const objectCatalog = normalizeDungeonObjectCatalog(
      rawMap.objectCatalog ||
      rawMap.sceneObjectCatalog ||
      rawMap.objectTiles ||
      rawMap.objectSet,
    )

    const baseCells = []
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        baseCells.push({
          id: createDungeonCellId(x, y),
          x,
          y,
          type: DUNGEON_TILE_EMPTY,
          cleared: false,
          discovered: false,
          enemy: null,
          reward: null,
          terrainId: '',
          terrainName: '',
          terrainPassable: false,
          terrainPalette: [],
          terrainPixels16: [],
          objectId: '',
          objectType: '',
          objectName: '',
          objectPalette: [],
          objectPixels16: [],
        })
      }
    }
    const indexByCoord = new Map(baseCells.map((cell, idx) => [createDungeonCellId(cell.x, cell.y), idx]))

    const applyCell = (x, y, patch) => {
      const key = createDungeonCellId(x, y)
      const idx = indexByCoord.get(key)
      if (typeof idx !== 'number') return
      baseCells[idx] = {
        ...baseCells[idx],
        ...patch,
        id: key,
        x,
        y,
      }
    }

    applyCell(startX, startY, {
      type: DUNGEON_TILE_START,
      discovered: true,
      cleared: true,
    })
    applyCell(exitX, exitY, {
      type: DUNGEON_TILE_EXIT,
      discovered: false,
      cleared: false,
    })

    const tilesFromCells = Array.isArray(rawMap.cells)
      ? rawMap.cells.map((cell) => ({
          x: cell?.x,
          y: cell?.y,
          type: cell?.type,
          enemy: cell?.enemy || null,
          reward: cell?.reward || null,
          cleared: Boolean(cell?.cleared),
          discovered: Boolean(cell?.discovered),
          objectId: cell?.objectId,
          objectType: cell?.objectType,
        }))
      : []
    const hasCellStateInput = tilesFromCells.length > 0
    const templateTiles = Array.isArray(rawMap.tiles) ? rawMap.tiles : []
    const terrainRandom = createSeededRandom(terrainSeed || `seed-${floor}-${width}-${height}`)
    const routeSet = buildGuaranteedRouteSet(
      width,
      height,
      { x: startX, y: startY },
      { x: exitX, y: exitY },
      terrainRandom,
    )
    expandRouteBranches(routeSet, width, height, terrainRandom)

    if (hasCellStateInput) {
      let monsterIndex = 0
      let bossIndex = 0
      for (const tile of tilesFromCells) {
        const x = clampInt(tile?.x, 0, width - 1, Number.NaN)
        const y = clampInt(tile?.y, 0, height - 1, Number.NaN)
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue
        if ((x === startX && y === startY) || (x === exitX && y === exitY)) continue
        const type = normalizeDungeonCellType(tile?.type, DUNGEON_TILE_EMPTY)
        if (type === DUNGEON_TILE_MONSTER) {
          const enemy = normalizeDungeonEnemy(tile?.enemy || tile, floor, false, monsterIndex)
          const reward = normalizeDungeonReward(tile?.reward || tile, floor, false)
          applyCell(x, y, {
            type,
            enemy,
            reward,
            cleared: Boolean(tile?.cleared),
            discovered: Boolean(tile?.discovered),
            objectId: normalizeTerrainId(tile?.objectId, ''),
            objectType: normalizeDungeonObjectType(tile?.objectType, ''),
          })
          monsterIndex += 1
          continue
        }
        if (type === DUNGEON_TILE_BOSS) {
          const enemy = normalizeDungeonEnemy(tile?.enemy || tile, floor, true, bossIndex)
          const reward = normalizeDungeonReward(tile?.reward || tile, floor, true)
          applyCell(x, y, {
            type,
            enemy,
            reward,
            cleared: Boolean(tile?.cleared),
            discovered: Boolean(tile?.discovered),
            objectId: normalizeTerrainId(tile?.objectId, ''),
            objectType: normalizeDungeonObjectType(tile?.objectType, ''),
          })
          bossIndex += 1
          continue
        }
        if (type === DUNGEON_TILE_TREASURE) {
          const reward = normalizeDungeonReward(tile?.reward || tile, floor, false)
          applyCell(x, y, {
            type,
            reward,
            cleared: Boolean(tile?.cleared),
            discovered: Boolean(tile?.discovered),
            objectId: normalizeTerrainId(tile?.objectId, ''),
            objectType: normalizeDungeonObjectType(tile?.objectType, ''),
          })
          continue
        }
        if (type === DUNGEON_TILE_EMPTY) {
          applyCell(x, y, {
            type,
            cleared: Boolean(tile?.cleared),
            discovered: Boolean(tile?.discovered),
            objectId: normalizeTerrainId(tile?.objectId, ''),
            objectType: normalizeDungeonObjectType(tile?.objectType, ''),
          })
        }
      }
    } else {
      const startKey = createDungeonCellId(startX, startY)
      const exitKey = createDungeonCellId(exitX, exitY)
      let routeKeys = Array.from(routeSet).filter((key) => key !== startKey && key !== exitKey)
      if (routeKeys.length < 2) {
        const neighbors = [
          { x: startX + 1, y: startY },
          { x: startX - 1, y: startY },
          { x: startX, y: startY + 1 },
          { x: startX, y: startY - 1 },
          { x: exitX + 1, y: exitY },
          { x: exitX - 1, y: exitY },
          { x: exitX, y: exitY + 1 },
          { x: exitX, y: exitY - 1 },
        ]
        for (const pos of neighbors) {
          if (pos.x < 0 || pos.y < 0 || pos.x >= width || pos.y >= height) continue
          const key = createDungeonCellId(pos.x, pos.y)
          if (key === startKey || key === exitKey) continue
          routeSet.add(key)
          routeKeys = Array.from(routeSet).filter((nextKey) => nextKey !== startKey && nextKey !== exitKey)
          if (routeKeys.length >= 2) break
        }
      }
      const routeCandidates = routeKeys
      const availableRouteSet = new Set(routeCandidates)

      const parseRouteKey = (key) => {
        const [xText, yText] = String(key || '').split(':')
        const x = Number.parseInt(xText, 10)
        const y = Number.parseInt(yText, 10)
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null
        return { x, y }
      }

      const routeDistanceFromStart = new Map()
      const bfsQueue = [startKey]
      routeDistanceFromStart.set(startKey, 0)
      for (let cursor = 0; cursor < bfsQueue.length; cursor += 1) {
        const currentKey = bfsQueue[cursor]
        const current = parseRouteKey(currentKey)
        if (!current) continue
        const currentDist = routeDistanceFromStart.get(currentKey) || 0
        const neighbors = [
          createDungeonCellId(current.x + 1, current.y),
          createDungeonCellId(current.x - 1, current.y),
          createDungeonCellId(current.x, current.y + 1),
          createDungeonCellId(current.x, current.y - 1),
        ]
        neighbors.forEach((nextKey) => {
          if (!routeSet.has(nextKey)) return
          if (routeDistanceFromStart.has(nextKey)) return
          routeDistanceFromStart.set(nextKey, currentDist + 1)
          bfsQueue.push(nextKey)
        })
      }

      const tileTemplateMap = {
        monster: [],
        boss: [],
        treasure: [],
      }
      templateTiles.forEach((tile) => {
        const type = normalizeDungeonCellType(tile?.type, DUNGEON_TILE_EMPTY)
        if (type === DUNGEON_TILE_MONSTER) {
          tileTemplateMap.monster.push(tile)
        } else if (type === DUNGEON_TILE_BOSS) {
          tileTemplateMap.boss.push(tile)
        } else if (type === DUNGEON_TILE_TREASURE) {
          tileTemplateMap.treasure.push(tile)
        }
      })

      const pickTemplateByType = (type, index = 0) => {
        const list = tileTemplateMap[type]
        if (!Array.isArray(list) || list.length < 1) return null
        const base = Math.floor(terrainRandom() * list.length)
        return list[(base + index) % list.length] || list[0]
      }

      const takeRandomAvailableKey = () => {
        const list = Array.from(availableRouteSet)
        if (list.length < 1) return ''
        const index = Math.floor(terrainRandom() * list.length)
        const key = list[index]
        availableRouteSet.delete(key)
        return key
      }

      const bossPriority = [...routeCandidates].sort((a, b) => {
        const distA = routeDistanceFromStart.get(a) || 0
        const distB = routeDistanceFromStart.get(b) || 0
        return distB - distA
      })

      const takeBossKey = () => {
        for (const key of bossPriority) {
          if (!availableRouteSet.has(key)) continue
          availableRouteSet.delete(key)
          return key
        }
        return takeRandomAvailableKey()
      }

      const area = width * height
      const desiredBoss = floor >= 15 ? 3 : 2
      const desiredMonster = Math.max(6, Math.min(18, Math.round(area * 0.3)))
      const desiredTreasure = Math.max(2, Math.min(7, Math.round(area * 0.1)))
      const maxSlots = availableRouteSet.size

      let bossTarget = Math.min(desiredBoss, maxSlots)
      let monsterTarget = Math.min(desiredMonster, Math.max(0, maxSlots - bossTarget))
      let treasureTarget = Math.min(desiredTreasure, Math.max(0, maxSlots - bossTarget - monsterTarget))

      if (maxSlots >= 2) {
        if (bossTarget < 1) bossTarget = 1
        if (monsterTarget < 1) {
          if (treasureTarget > 0) {
            treasureTarget -= 1
          } else if (bossTarget > 1) {
            bossTarget -= 1
          }
          monsterTarget = 1
        }
      }

      for (let bossIndex = 0; bossIndex < bossTarget; bossIndex += 1) {
        const key = takeBossKey()
        const pos = parseRouteKey(key)
        if (!pos) continue
        const template = pickTemplateByType('boss', bossIndex)
        applyCell(pos.x, pos.y, {
          type: DUNGEON_TILE_BOSS,
          enemy: normalizeDungeonEnemy(template?.enemy || template, floor, true, bossIndex),
          reward: normalizeDungeonReward(template?.reward || template, floor, true),
          cleared: Boolean(template?.cleared),
          discovered: Boolean(template?.discovered),
          objectId: normalizeTerrainId(template?.objectId, ''),
          objectType: normalizeDungeonObjectType(template?.objectType, ''),
        })
      }

      for (let monsterIndex = 0; monsterIndex < monsterTarget; monsterIndex += 1) {
        const key = takeRandomAvailableKey()
        const pos = parseRouteKey(key)
        if (!pos) continue
        const template = pickTemplateByType('monster', monsterIndex)
        applyCell(pos.x, pos.y, {
          type: DUNGEON_TILE_MONSTER,
          enemy: normalizeDungeonEnemy(template?.enemy || template, floor, false, monsterIndex),
          reward: normalizeDungeonReward(template?.reward || template, floor, false),
          cleared: Boolean(template?.cleared),
          discovered: Boolean(template?.discovered),
          objectId: normalizeTerrainId(template?.objectId, ''),
          objectType: normalizeDungeonObjectType(template?.objectType, ''),
        })
      }

      for (let treasureIndex = 0; treasureIndex < treasureTarget; treasureIndex += 1) {
        const key = takeRandomAvailableKey()
        const pos = parseRouteKey(key)
        if (!pos) continue
        const template = pickTemplateByType('treasure', treasureIndex)
        applyCell(pos.x, pos.y, {
          type: DUNGEON_TILE_TREASURE,
          reward: normalizeDungeonReward(template?.reward || template, floor, false),
          cleared: Boolean(template?.cleared),
          discovered: Boolean(template?.discovered),
          objectId: normalizeTerrainId(template?.objectId, ''),
          objectType: normalizeDungeonObjectType(template?.objectType, ''),
        })
      }
    }

    const parseCellId = (key) => {
      const [xText, yText] = String(key || '').split(':')
      const x = Number.parseInt(xText, 10)
      const y = Number.parseInt(yText, 10)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      return { x, y }
    }

    const routeCoreSet = new Set(routeSet)
    const connectCellToRouteCore = (cellId) => {
      if (routeCoreSet.has(cellId)) return
      const from = parseCellId(cellId)
      if (!from) return
      let nearest = null
      let nearestDistance = Number.POSITIVE_INFINITY
      routeCoreSet.forEach((coreKey) => {
        const target = parseCellId(coreKey)
        if (!target) return
        const dist = Math.abs(target.x - from.x) + Math.abs(target.y - from.y)
        if (dist < nearestDistance) {
          nearest = target
          nearestDistance = dist
        }
      })
      if (!nearest) {
        routeSet.add(cellId)
        routeCoreSet.add(cellId)
        return
      }

      let x = from.x
      let y = from.y
      routeSet.add(createDungeonCellId(x, y))
      routeCoreSet.add(createDungeonCellId(x, y))
      while (x !== nearest.x || y !== nearest.y) {
        if (x !== nearest.x) {
          x += x < nearest.x ? 1 : -1
        } else if (y !== nearest.y) {
          y += y < nearest.y ? 1 : -1
        }
        const key = createDungeonCellId(x, y)
        routeSet.add(key)
        routeCoreSet.add(key)
      }
    }

    baseCells.forEach((cell) => {
      if (!DUNGEON_TERRAIN_FORCED_PASSABLE_TYPE_SET.has(cell.type)) return
      connectCellToRouteCore(cell.id)
    })

    baseCells.forEach((cell) => {
      const passable = routeSet.has(cell.id)
      const terrainTile = pickTerrainTileByPassable(tileCatalog, passable, terrainRandom, tileCatalog)
      applyCell(cell.x, cell.y, {
        terrainId: terrainTile.id,
        terrainName: terrainTile.name,
        terrainPassable: passable,
        terrainPalette: Array.isArray(terrainTile.palette) ? [...terrainTile.palette] : [],
        terrainPixels16: Array.isArray(terrainTile.pixels16) ? [...terrainTile.pixels16] : [],
      })
    })

    baseCells.forEach((cell) => {
      const objectTile = pickDungeonObjectForCell(cell, objectCatalog, terrainRandom)
      if (!objectTile) {
        applyCell(cell.x, cell.y, {
          objectId: '',
          objectType: 'none',
          objectName: '',
          objectPalette: [],
          objectPixels16: [],
        })
        return
      }
      applyCell(cell.x, cell.y, {
        objectId: objectTile.id,
        objectType: normalizeDungeonObjectType(objectTile.type, mapDungeonCellTypeToObjectType(cell.type)),
        objectName: normalizeTerrainName(objectTile.name, '场景物体'),
        objectPalette: Array.isArray(objectTile.palette) ? [...objectTile.palette] : [],
        objectPixels16: Array.isArray(objectTile.pixels16) ? [...objectTile.pixels16] : [],
      })
    })

    const playerX = clampInt(rawMap?.player?.x, 0, width - 1, startX)
    const playerY = clampInt(rawMap?.player?.y, 0, height - 1, startY)
    const playerKey = createDungeonCellId(playerX, playerY)
    const playerIndex = indexByCoord.get(playerKey)
    if (typeof playerIndex === 'number') {
      baseCells[playerIndex] = {
        ...baseCells[playerIndex],
        discovered: true,
      }
    }

    const bossTotal = baseCells.filter((cell) => cell.type === DUNGEON_TILE_BOSS).length
    const bossCleared = baseCells.filter((cell) => cell.type === DUNGEON_TILE_BOSS && cell.cleared).length

    return {
      id: String(rawMap.id || makeId('map')).trim().slice(0, 80),
      floor: clampInt(rawMap.floor, 1, 999, floor),
      theme,
      width,
      height,
      start: { x: startX, y: startY },
      exit: { x: exitX, y: exitY },
      player: { x: playerX, y: playerY },
      terrainSeed,
      tileCatalog: cloneDungeonTerrainCatalog(tileCatalog),
      objectCatalog: cloneDungeonObjectCatalog(objectCatalog),
      bossTotal,
      bossCleared,
      cells: baseCells,
    }
  }

  const countDungeonBossRemainingByMap = (map) => {
    if (!map || !Array.isArray(map.cells)) return 0
    const total = map.cells.filter((cell) => cell.type === DUNGEON_TILE_BOSS).length
    const cleared = map.cells.filter((cell) => cell.type === DUNGEON_TILE_BOSS && cell.cleared).length
    return Math.max(0, total - cleared)
  }

  const cloneDungeonMapState = (map) => {
    if (!map || typeof map !== 'object') return null
    return {
      ...map,
      start: { ...(map.start || { x: 0, y: 0 }) },
      exit: { ...(map.exit || { x: 0, y: 0 }) },
      player: { ...(map.player || map.start || { x: 0, y: 0 }) },
      tileCatalog: cloneDungeonTerrainCatalog(map.tileCatalog),
      objectCatalog: cloneDungeonObjectCatalog(map.objectCatalog),
      cells: (Array.isArray(map.cells) ? map.cells : []).map((cell) => ({
        ...cell,
        enemy: cell?.enemy
          ? {
              ...cell.enemy,
              drops: Array.isArray(cell?.enemy?.drops)
                ? cell.enemy.drops.map((item) => ({ ...item }))
                : [],
            }
          : null,
        reward: cell?.reward ? { ...cell.reward } : null,
        terrainPalette: Array.isArray(cell?.terrainPalette) ? [...cell.terrainPalette] : [],
        terrainPixels16: Array.isArray(cell?.terrainPixels16) ? [...cell.terrainPixels16] : [],
        objectPalette: Array.isArray(cell?.objectPalette) ? [...cell.objectPalette] : [],
        objectPixels16: Array.isArray(cell?.objectPixels16) ? [...cell.objectPixels16] : [],
      })),
    }
  }

  const findDungeonCellIndex = (map, x, y) => {
    if (!map || !Array.isArray(map.cells)) return -1
    return map.cells.findIndex((cell) => cell.x === x && cell.y === y)
  }

  const isDungeonMapUsable = (map) => {
    if (!map || !Array.isArray(map.cells)) return false
    const hasBoss = map.cells.some((cell) => cell.type === DUNGEON_TILE_BOSS)
    const hasMonster = map.cells.some((cell) => cell.type === DUNGEON_TILE_MONSTER)
    return hasBoss && hasMonster
  }

  const createLocalDungeonMapDraft = (targetState) => {
    const floor = clampInt(targetState?.floor, 1, 999, 1)
    const width = randomInt(5, 8)
    const height = randomInt(5, 8)
    const start = { x: 0, y: height - 1 }
    const exit = { x: width - 1, y: 0 }
    const used = new Set([createDungeonCellId(start.x, start.y), createDungeonCellId(exit.x, exit.y)])
    const tiles = []
    const themes = ['灰烬地宫', '风蚀古塔', '潮湿墓窟', '黑曜回廊', '失落矿坑', '月蚀神殿']
    const monsterNames = ['洞窟狼', '骸骨兵', '腐沼蜥', '巡逻石像', '暗影潜伏者', '裂隙蠕虫']
    const bossNames = ['灰烬领主', '深井守门者', '幽冥主教', '巨械监工', '碎星骑士', '虚影女王']

    const takeRandomPos = () => {
      for (let turn = 0; turn < 200; turn += 1) {
        const x = randomInt(0, width - 1)
        const y = randomInt(0, height - 1)
        const key = createDungeonCellId(x, y)
        if (used.has(key)) continue
        used.add(key)
        return { x, y }
      }
      return null
    }

    const bossCount = floor >= 15 ? 3 : 2
    const monsterCount = Math.max(6, Math.min(18, Math.round(width * height * 0.3)))
    const treasureCount = Math.max(2, Math.min(6, Math.round(width * height * 0.12)))

    for (let index = 0; index < bossCount; index += 1) {
      const pos = takeRandomPos()
      if (!pos) break
      tiles.push({
        ...pos,
        type: DUNGEON_TILE_BOSS,
        enemy: {
          name: pickRandomItem(bossNames, `首领${index + 1}`),
          hp: Math.round(220 + floor * 46 + randomInt(0, 90)),
          attack: Math.round(30 + floor * 4.8 + randomInt(0, 10)),
          drops: [createDropFallback(floor, true, index)],
        },
        reward: {
          coins: Math.round(280 + floor * 56 + randomInt(0, 120)),
          gems: Math.round(88 + floor * 12 + randomInt(0, 36)),
          exp: Math.round(140 + floor * 32 + randomInt(0, 52)),
          equipmentChance: 0.58,
        },
      })
    }

    for (let index = 0; index < monsterCount; index += 1) {
      const pos = takeRandomPos()
      if (!pos) break
      tiles.push({
        ...pos,
        type: DUNGEON_TILE_MONSTER,
        enemy: {
          name: pickRandomItem(monsterNames, `魔物${index + 1}`),
          hp: Math.round(106 + floor * 22 + randomInt(0, 44)),
          attack: Math.round(15 + floor * 2.3 + randomInt(0, 6)),
          drops: [createDropFallback(floor, false, index)],
        },
        reward: {
          coins: Math.round(74 + floor * 16 + randomInt(0, 26)),
          gems: Math.round(20 + floor * 4 + randomInt(0, 8)),
          exp: Math.round(36 + floor * 10 + randomInt(0, 18)),
          equipmentChance: 0.2,
        },
      })
    }

    for (let index = 0; index < treasureCount; index += 1) {
      const pos = takeRandomPos()
      if (!pos) break
      tiles.push({
        ...pos,
        type: DUNGEON_TILE_TREASURE,
        reward: {
          coins: Math.round(96 + floor * 14 + randomInt(0, 42)),
          gems: Math.round(26 + floor * 4 + randomInt(0, 12)),
          exp: Math.round(30 + floor * 8 + randomInt(0, 16)),
          equipmentChance: 0.22,
        },
      })
    }

    const terrainSeed = makeId('terrain')
    const localTheme = pickRandomItem(themes, '灰烬地宫')

    return {
      id: makeId('map'),
      floor,
      theme: localTheme,
      width,
      height,
      start,
      exit,
      player: start,
      terrainSeed,
      tileCatalog: cloneDungeonTerrainCatalog(buildDungeonTerrainFallbackCatalog(terrainSeed, localTheme)),
      objectCatalog: cloneDungeonObjectCatalog(DUNGEON_OBJECT_DEFAULT_CATALOG),
      tiles,
    }
  }

  return {
    createDungeonCellId,
    normalizeDungeonEnemy,
    normalizeDungeonReward,
    normalizeDungeonMap,
    countDungeonBossRemainingByMap,
    cloneDungeonMapState,
    findDungeonCellIndex,
    isDungeonMapUsable,
    createLocalDungeonMapDraft,
  }
}
