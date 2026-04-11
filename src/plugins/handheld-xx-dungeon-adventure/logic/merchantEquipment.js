export const EQUIPMENT_SLOT_LABELS = Object.freeze({
  weapon: '武器',
  armor: '护甲',
  relic: '饰品',
})

export const EQUIPMENT_SLOT_KEYS = Object.freeze(['weapon', 'armor', 'relic'])

const clampInt = (value, min, max, fallback = min) => {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export const buildMerchantSellPriceRange = (
  rawBasePrice,
  options = {},
) => {
  const {
    discountMin = 18,
    discountMax = 45,
    min = 1,
    max = 99999,
  } = options || {}

  const basePrice = clampInt(rawBasePrice, min, max, min)
  const normalizedDiscountMin = clampInt(discountMin, 0, 99, 18)
  const normalizedDiscountMax = clampInt(discountMax, 0, 99, 45)

  const minPrice = clampInt(
    Math.floor((basePrice * (100 - normalizedDiscountMax)) / 100),
    min,
    max,
    min,
  )
  const maxPrice = clampInt(
    Math.floor((basePrice * (100 - normalizedDiscountMin)) / 100),
    min,
    max,
    minPrice,
  )

  return {
    min: Math.min(minPrice, maxPrice),
    max: Math.max(minPrice, maxPrice),
  }
}

export const calculateMerchantSellPrice = (
  rawBasePrice,
  discountPercent,
  options = {},
) => {
  const {
    min = 1,
    max = 99999,
    fallback = min,
  } = options || {}

  const basePrice = clampInt(rawBasePrice, min, max, fallback)
  const normalizedDiscountPercent = clampInt(discountPercent, 0, 99, 0)
  return clampInt(
    Math.floor((basePrice * (100 - normalizedDiscountPercent)) / 100),
    min,
    max,
    fallback,
  )
}

export const removeEquipmentFromAllSlots = (
  targetState,
  equipmentId,
  options = {},
) => {
  const {
    slotKeys = EQUIPMENT_SLOT_KEYS,
    slotLabels = EQUIPMENT_SLOT_LABELS,
  } = options || {}

  const unequippedTargets = []
  if (!targetState || !equipmentId) return unequippedTargets

  const equipped = targetState.equipped && typeof targetState.equipped === 'object'
    ? { ...targetState.equipped }
    : { weapon: null, armor: null, relic: null }
  const legacyRemoved = []
  slotKeys.forEach((slot) => {
    if (equipped?.[slot]?.id === equipmentId) {
      equipped[slot] = null
      legacyRemoved.push(slotLabels[slot] || slot)
    }
  })
  if (legacyRemoved.length > 0) {
    targetState.equipped = equipped
    unequippedTargets.push(`主角(${legacyRemoved.join('/')})`)
  }

  const sourceMap = targetState.memberEquippedMap && typeof targetState.memberEquippedMap === 'object'
    ? targetState.memberEquippedMap
    : {}
  const nextMap = { ...sourceMap }
  const teammateNameMap = new Map(
    (Array.isArray(targetState.teammates) ? targetState.teammates : []).map((member) => [
      String(member?.id || ''),
      String(member?.name || '队员').trim() || '队员',
    ]),
  )

  Object.entries(sourceMap).forEach(([memberId, rawLoadout]) => {
    if (!rawLoadout || typeof rawLoadout !== 'object') return
    const loadout = { ...rawLoadout }
    const removedSlots = []
    slotKeys.forEach((slot) => {
      if (loadout?.[slot]?.id === equipmentId) {
        loadout[slot] = null
        removedSlots.push(slotLabels[slot] || slot)
      }
    })
    if (removedSlots.length > 0) {
      nextMap[memberId] = loadout
      const memberName = teammateNameMap.get(String(memberId)) || '队员'
      unequippedTargets.push(`${memberName}(${removedSlots.join('/')})`)
    }
  })

  targetState.memberEquippedMap = nextMap
  return unequippedTargets
}
