const fallbackClampInt = (value, min, max, fallback = min) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

const fallbackPickRandomItem = (list, fallback = null) => {
  if (!Array.isArray(list) || list.length === 0) return fallback
  return list[Math.floor(Math.random() * list.length)]
}

const fallbackRandomInt = (min, max) => {
  const nMin = Math.min(min, max)
  const nMax = Math.max(min, max)
  return Math.floor(Math.random() * (nMax - nMin + 1)) + nMin
}

const fallbackMakeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const normalizeSceneEnemy = (enemy, options = {}) => {
  const {
    clampInt = fallbackClampInt,
  } = options || {}
  return {
    name: String(enemy?.name || '地下城魔物').trim().slice(0, 24),
    hp: clampInt(enemy?.hp, 20, 99999, 120),
    attack: clampInt(enemy?.attack, 6, 9999, 20),
    rewardCoins: clampInt(enemy?.rewardCoins, 1, 999999, 90),
    rewardGems: clampInt(enemy?.rewardGems, 1, 999999, 26),
  }
}

export const createLocalScene = (targetState, eventTypeHint, options = {}) => {
  const {
    sceneLibrary = {},
    pickRandomItem = fallbackPickRandomItem,
    createEnemyByFloor = null,
    randomFn = Math.random,
  } = options || {}

  const floor = Math.max(1, Number(targetState?.floor) || 1)
  let eventType = floor % 5 === 0 ? 'boss' : eventTypeHint
  if (eventType !== 'boss') {
    const roll = randomFn()
    if (roll < 0.58) eventType = 'battle'
    else if (roll < 0.72) eventType = 'treasure'
    else if (roll < 0.88) eventType = 'rest'
    else eventType = 'trap'
  }

  const battleList = Array.isArray(sceneLibrary?.battle) ? sceneLibrary.battle : []
  const eventList = Array.isArray(sceneLibrary?.[eventType]) ? sceneLibrary[eventType] : []
  const sceneDef = pickRandomItem(eventList, battleList[0] || {})
  const isBattleLike = eventType === 'battle' || eventType === 'boss'

  return {
    eventType,
    title: sceneDef?.title || '未知区间',
    description: sceneDef?.description || '你在黑暗中继续前进。',
    banterHint: sceneDef?.banterHint || '别松懈，继续推进。',
    enemy: isBattleLike && typeof createEnemyByFloor === 'function'
      ? createEnemyByFloor(floor, eventType === 'boss')
      : null,
    loot: null,
  }
}

export const tryBuildLootAsEquipment = (lootRaw, options = {}) => {
  const {
    normalizeSlot = null,
    normalizeRarity = null,
    normalizeEquipment = null,
    makeId = fallbackMakeId,
    pickRandomItem = fallbackPickRandomItem,
    clampInt = fallbackClampInt,
    randomInt = fallbackRandomInt,
  } = options || {}

  if (!lootRaw || typeof lootRaw !== 'object') return null
  const name = String(lootRaw.name || '').trim().slice(0, 18)
  if (!name) return null

  const slot = typeof normalizeSlot === 'function'
    ? normalizeSlot(lootRaw.slot, pickRandomItem(['weapon', 'armor', 'relic'], 'weapon'))
    : pickRandomItem(['weapon', 'armor', 'relic'], 'weapon')
  const rarity = typeof normalizeRarity === 'function'
    ? normalizeRarity(lootRaw.rarity, 'SR')
    : String(lootRaw.rarity || 'SR').toUpperCase()
  const base = {
    id: makeId('eq'),
    name,
    rarity,
    slot,
    atk: clampInt(lootRaw.atk, 0, 500, randomInt(8, 26)),
    def: clampInt(lootRaw.def, 0, 500, randomInt(8, 26)),
    hp: clampInt(lootRaw.hp, 0, 900, randomInt(18, 56)),
    desc: String(lootRaw.desc || '').trim().slice(0, 40),
  }
  return typeof normalizeEquipment === 'function'
    ? normalizeEquipment(base)
    : base
}

export const loadDungeonSceneWithFallback = async (options = {}) => {
  const {
    targetState = null,
    activeParty = [],
    requestDungeonScene = null,
    createLocalScene = null,
    tryBuildLootAsEquipment = null,
    clampInt = fallbackClampInt,
    logger = console,
  } = options || {}

  const floor = Math.max(1, Number(targetState?.floor) || 1)
  const eventTypeHint = floor % 5 === 0 ? 'boss' : 'battle'
  const partySummary = (Array.isArray(activeParty) ? activeParty : [])
    .map((item) => `${item?.name || '队员'}(${item?.rarity || 'R'})`)
    .join('、')

  try {
    const result = typeof requestDungeonScene === 'function'
      ? await requestDungeonScene({
        floor,
        eventTypeHint,
        sceneName: targetState?.lastScene,
        partySummary,
      })
      : null

    if (!result?.success || !result?.scene) {
      const fallbackScene = typeof createLocalScene === 'function'
        ? createLocalScene(targetState, eventTypeHint)
        : null
      return {
        scene: fallbackScene,
        errorMessage: result?.error ? `${result.error}，已切换本地地下城模板` : '',
      }
    }

    const scene = result.scene
    return {
      scene: {
        eventType: String(scene?.eventType || eventTypeHint).trim().toLowerCase(),
        title: String(scene?.title || '地下城').trim().slice(0, 36),
        description: String(scene?.description || '前方传来未知动静。').trim().slice(0, 120),
        banterHint: String(scene?.banterHint || '保持警戒，继续推进。').trim().slice(0, 40),
        enemy: scene?.enemy && typeof scene.enemy === 'object'
          ? normalizeSceneEnemy(scene.enemy, { clampInt })
          : null,
        loot: typeof tryBuildLootAsEquipment === 'function'
          ? tryBuildLootAsEquipment(scene?.loot)
          : null,
      },
      errorMessage: '',
    }
  } catch (error) {
    if (logger && typeof logger.error === 'function') {
      logger.error('[xx-dungeon] scene generation failed:', error)
    }
    const fallbackScene = typeof createLocalScene === 'function'
      ? createLocalScene(targetState, eventTypeHint)
      : null
    return {
      scene: fallbackScene,
      errorMessage: '场景生成失败，已切换本地地下城模板',
    }
  }
}
