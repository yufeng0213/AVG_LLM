const getSlotLabel = (slot) => {
  if (slot === 'weapon') return '武器'
  if (slot === 'armor') return '护甲'
  return '饰品'
}

export const loadMerchantItemsFromStorage = async (options = {}) => {
  const {
    storage = null,
    storageKey = '',
    normalizeItems = null,
  } = options || {}

  if (!storage || typeof storage.get !== 'function') {
    return {
      items: [],
      error: new Error('invalid storage: get() is required'),
    }
  }

  try {
    const stored = await storage.get(String(storageKey || ''))
    if (!Array.isArray(stored) || stored.length === 0) {
      return { items: [], error: null }
    }

    const normalized = typeof normalizeItems === 'function'
      ? normalizeItems(stored)
      : stored

    const items = Array.isArray(normalized) ? normalized.filter(Boolean) : []
    return { items, error: null }
  } catch (error) {
    return { items: [], error }
  }
}

export const saveMerchantItemsToStorage = async (options = {}) => {
  const {
    storage = null,
    storageKey = '',
    items = [],
  } = options || {}

  if (!storage || typeof storage.set !== 'function') {
    return {
      ok: false,
      error: new Error('invalid storage: set() is required'),
    }
  }

  try {
    const payload = Array.isArray(items) ? items : []
    await storage.set(String(storageKey || ''), payload)
    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error }
  }
}

export const generateLocalMerchantItemsByPool = (options = {}) => {
  const {
    maxItems = 6,
    equipmentPity = 0,
    equipmentPool = {},
    rollEquipmentRarity = null,
    pickRandomItem = null,
    makeId = null,
    rarityValue = null,
    normalizeMerchantItem = null,
    randomFn = Math.random,
  } = options || {}

  const count = Math.max(0, Number.parseInt(String(maxItems), 10) || 0)
  const list = []

  for (let index = 0; index < count; index += 1) {
    const rarity = typeof rollEquipmentRarity === 'function'
      ? rollEquipmentRarity(equipmentPity, false)
      : 'R'
    const pool = equipmentPool?.[rarity] || equipmentPool?.R || []
    const base = typeof pickRandomItem === 'function'
      ? pickRandomItem(pool, null)
      : (Array.isArray(pool) && pool.length > 0
          ? pool[Math.floor((typeof randomFn === 'function' ? randomFn() : Math.random()) * pool.length)]
          : null)
    if (!base) continue

    const rarityRank = typeof rarityValue === 'function' ? rarityValue(rarity) : 1
    const item = {
      id: typeof makeId === 'function' ? makeId('mi') : `mi-${Date.now()}-${index}`,
      name: base.name,
      rarity,
      slot: base.slot,
      atk: base.atk,
      def: base.def,
      hp: base.hp,
      price: 50 + rarityRank * 30 + Math.floor((typeof randomFn === 'function' ? randomFn() : Math.random()) * 50),
      desc: `来自流浪商人的${getSlotLabel(base.slot)}`,
    }

    const normalized = typeof normalizeMerchantItem === 'function'
      ? normalizeMerchantItem(item, index)
      : item
    if (normalized) {
      list.push(normalized)
    }
  }

  return list
}
