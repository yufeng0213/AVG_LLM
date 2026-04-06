export const DUNGEON_MAP_MIN_SIZE = 5
export const DUNGEON_MAP_MAX_SIZE = 9
export const DUNGEON_TILE_START = 'start'
export const DUNGEON_TILE_EMPTY = 'empty'
export const DUNGEON_TILE_MONSTER = 'monster'
export const DUNGEON_TILE_BOSS = 'boss'
export const DUNGEON_TILE_TREASURE = 'treasure'
export const DUNGEON_TILE_EXIT = 'exit'

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

const createEmptyDungeonMap = () => null

const createEnemyFallback = (floor, isBoss = false, index = 0) => {
  return {
    name: `${isBoss ? '首领' : '怪物'}${index + 1}`,
    hp: Math.round((isBoss ? 190 : 108) + floor * (isBoss ? 34 : 18)),
    attack: Math.round((isBoss ? 30 : 17) + floor * (isBoss ? 3.2 : 1.8)),
  }
}

export const createDungeonMapRuntime = (deps = {}) => {
  const clampInt = typeof deps.clampInt === 'function' ? deps.clampInt : fallbackClampInt
  const makeId = typeof deps.makeId === 'function' ? deps.makeId : fallbackCreateId
  const pickRandomItem = typeof deps.pickRandomItem === 'function' ? deps.pickRandomItem : fallbackPickRandom
  const randomInt = typeof deps.randomInt === 'function' ? deps.randomInt : fallbackRandomInt

  const createDungeonCellId = (x, y) => `${x}:${y}`

  const normalizeDungeonEnemy = (rawValue, floor = 1, isBoss = false, index = 0) => {
    const fallback = createEnemyFallback(floor, isBoss, index)
    return {
      name: String(rawValue?.name || fallback.name || `${isBoss ? '首领' : '怪物'}${index + 1}`).trim().slice(0, 24) || `${isBoss ? '首领' : '怪物'}${index + 1}`,
      hp: clampInt(rawValue?.hp, 20, 999999, fallback.hp),
      attack: clampInt(rawValue?.attack, 6, 99999, fallback.attack),
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

    const tiles = Array.isArray(rawMap.tiles) ? rawMap.tiles : []
    let monsterIndex = 0
    let bossIndex = 0
    for (const tile of tiles) {
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
        })
        continue
      }
      if (type === DUNGEON_TILE_EMPTY) {
        applyCell(x, y, {
          type,
          cleared: Boolean(tile?.cleared),
          discovered: Boolean(tile?.discovered),
        })
      }
    }

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
      cells: (Array.isArray(map.cells) ? map.cells : []).map((cell) => ({
        ...cell,
        enemy: cell?.enemy ? { ...cell.enemy } : null,
        reward: cell?.reward ? { ...cell.reward } : null,
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

    return {
      id: makeId('map'),
      floor,
      theme: pickRandomItem(themes, '灰烬地宫'),
      width,
      height,
      start,
      exit,
      player: start,
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

