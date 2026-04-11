import { calculateMerchantSellPrice, removeEquipmentFromAllSlots } from './merchantEquipment.js'

const clampInt = (value, min, max, fallback = min) => {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

const fallbackRandomInt = (min, max) => {
  const nMin = Math.min(min, max)
  const nMax = Math.max(min, max)
  return Math.floor(Math.random() * (nMax - nMin + 1)) + nMin
}

export const applyMerchantPurchase = (options = {}) => {
  const {
    targetState = null,
    item = null,
    price = 0,
    normalizeState = null,
    normalizeEquipment = null,
    makeId = null,
    maxEquipmentCount = 360,
  } = options || {}

  if (typeof normalizeState !== 'function') {
    return { ok: false, error: 'invalid_normalize_state' }
  }
  if (!item || typeof item !== 'object') {
    return { ok: false, error: 'invalid_item' }
  }

  const resolvedPrice = clampInt(price, 1, 99999, 50)
  const next = normalizeState(targetState)
  const currentCoins = clampInt(next.coins, 0, 9999999, 0)
  if (currentCoins < resolvedPrice) {
    return { ok: false, error: 'insufficient_coins', requiredCoins: resolvedPrice }
  }

  next.coins = currentCoins - resolvedPrice
  if (typeof normalizeEquipment === 'function') {
    const purchasedEquipment = normalizeEquipment({
      id: typeof makeId === 'function' ? makeId('eq') : `eq-${Date.now()}`,
      name: item.name,
      rarity: item.rarity,
      slot: item.slot,
      atk: item.atk,
      def: item.def,
      hp: item.hp,
      basePrice: resolvedPrice,
      desc: item.desc,
    }, 0)
    if (purchasedEquipment) {
      const list = Array.isArray(next.equipments) ? next.equipments : []
      next.equipments = [...list, purchasedEquipment].slice(-Math.max(1, Number(maxEquipmentCount) || 1))
      return {
        ok: true,
        nextState: next,
        purchasedEquipment,
        price: resolvedPrice,
      }
    }
  }

  return {
    ok: true,
    nextState: next,
    purchasedEquipment: null,
    price: resolvedPrice,
  }
}

export const applyMerchantSell = (options = {}) => {
  const {
    targetState = null,
    itemId = '',
    normalizeState = null,
    estimateEquipmentBasePrice = null,
    discountMin = 18,
    discountMax = 45,
    randomInt = fallbackRandomInt,
  } = options || {}

  if (typeof normalizeState !== 'function') {
    return { ok: false, error: 'invalid_normalize_state' }
  }

  const next = normalizeState(targetState)
  const equipments = Array.isArray(next.equipments) ? next.equipments : []
  const target = equipments.find((equipment) => equipment?.id === itemId)
  if (!target) {
    return { ok: false, error: 'equipment_not_found' }
  }

  const fallbackPrice = typeof estimateEquipmentBasePrice === 'function'
    ? estimateEquipmentBasePrice(target)
    : 50
  const originalPrice = clampInt(target.basePrice, 1, 99999, fallbackPrice)
  const rawDiscount = typeof randomInt === 'function'
    ? randomInt(discountMin, discountMax)
    : fallbackRandomInt(discountMin, discountMax)
  const discountPercent = clampInt(rawDiscount, 0, 99, discountMin)
  const sellPrice = calculateMerchantSellPrice(originalPrice, discountPercent)

  next.equipments = equipments.filter((equipment) => equipment?.id !== target.id)
  const unequippedTargets = removeEquipmentFromAllSlots(next, target.id)
  const currentCoins = clampInt(next.coins, 0, 9999999, 0)
  next.coins = clampInt(currentCoins + sellPrice, 0, 9999999, currentCoins)

  return {
    ok: true,
    nextState: next,
    target,
    originalPrice,
    discountPercent,
    sellPrice,
    unequippedTargets,
  }
}
