const fallbackRandomInt = (min, max) => {
  const nMin = Math.min(min, max)
  const nMax = Math.max(min, max)
  return Math.floor(Math.random() * (nMax - nMin + 1)) + nMin
}

const fallbackPickRandomItem = (list, fallback = null) => {
  if (!Array.isArray(list) || list.length <= 0) return fallback
  return list[Math.floor(Math.random() * list.length)]
}

const fallbackMakeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const rollEquipmentRarity = (pity, ensureSr = false, options = {}) => {
  const {
    pityLimit = 70,
    randomFn = Math.random,
    ssrChance = 0.026,
    srChance = 0.225,
  } = options || {}

  if (pity + 1 >= pityLimit) return 'SSR'
  const roll = randomFn()
  let rarity = roll < ssrChance ? 'SSR' : roll < srChance ? 'SR' : 'R'
  if (ensureSr && rarity === 'R') {
    rarity = 'SR'
  }
  return rarity
}

export const drawEquipmentOne = (pity, ensureSr = false, options = {}) => {
  const {
    pityLimit = 70,
    equipmentPool = {},
    pickRandomItem = fallbackPickRandomItem,
    normalizeEquipment = null,
    makeId = fallbackMakeId,
    randomInt = fallbackRandomInt,
    rollRarity = rollEquipmentRarity,
  } = options || {}

  const rarity = rollRarity(pity, ensureSr, {
    pityLimit,
  })
  const pool = equipmentPool?.[rarity] || equipmentPool?.R || []
  const template = pickRandomItem(pool, pool[0] || null)
  if (!template) {
    return {
      equipment: null,
      nextPity: rarity === 'SSR' ? 0 : Math.min(pityLimit - 1, pity + 1),
    }
  }

  const variance = rarity === 'SSR' ? 12 : rarity === 'SR' ? 7 : 4
  const baseEquipment = {
    id: makeId('eq'),
    name: template.name,
    rarity,
    slot: template.slot,
    atk: Number(template.atk || 0) + randomInt(0, variance),
    def: Number(template.def || 0) + randomInt(0, variance),
    hp: Number(template.hp || 0) + randomInt(0, variance * 3),
    desc: rarity === 'SSR' ? '闪耀着高阶符文的传奇装备。' : '',
  }
  const equipment = typeof normalizeEquipment === 'function'
    ? normalizeEquipment(baseEquipment)
    : baseEquipment

  return {
    equipment,
    nextPity: rarity === 'SSR' ? 0 : Math.min(pityLimit - 1, pity + 1),
  }
}

export const promoteByExp = (targetState, options = {}) => {
  const {
    needExpByLevel = null,
  } = options || {}

  if (!targetState || typeof needExpByLevel !== 'function') return 0

  let levelUps = 0
  while (targetState.exp >= needExpByLevel(targetState.level)) {
    targetState.exp -= needExpByLevel(targetState.level)
    targetState.level += 1
    targetState.maxHp += 16 + Math.floor(targetState.level * 0.4)
    targetState.hp = Math.min(targetState.maxHp, targetState.hp + 24)
    levelUps += 1
  }
  return levelUps
}

export const createEnemyByFloor = (floor, isBoss = false) => {
  return {
    name: isBoss ? `深层首领 Lv.${floor}` : `地下城魔物 Lv.${floor}`,
    hp: Math.round((isBoss ? 190 : 108) + floor * (isBoss ? 34 : 18)),
    attack: Math.round((isBoss ? 30 : 17) + floor * (isBoss ? 3.2 : 1.8)),
    rewardCoins: Math.round((isBoss ? 240 : 90) + floor * (isBoss ? 38 : 16)),
    rewardGems: Math.round((isBoss ? 86 : 26) + floor * (isBoss ? 8 : 3)),
  }
}
