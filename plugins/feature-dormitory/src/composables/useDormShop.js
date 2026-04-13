/**
 * 寝室商店 Composable
 * 管理商店商品、经济系统、背包系统的所有逻辑
 *
 * @param {import('vue').Ref} activeBook - 当前选中的世界书 ref
 * @param {import('vue').Ref} worldBookEconomyMap - 世界书经济映射 ref
 * @param {import('vue').Ref} worldBookInventoryMap - 世界书背包映射 ref
 */

import { computed, ref } from 'vue'
import { generateDormShopItems } from '../../../../src/llm'
import { DORM_SHOP_CATEGORIES, DORM_SHOP_ITEM_TEMPLATES, generateShopItems } from './shopConstants.js'

const DORM_WORLD_BOOK_ECONOMY_STORAGE_KEY = 'avg_llm_dormitory_world_book_economy_v1'
const DORM_WORLD_BOOK_INVENTORY_STORAGE_KEY = 'avg_llm_dormitory_world_book_inventory_v1'
const DORM_WORLD_BOOK_SHOP_STORAGE_KEY = 'avg_llm_dormitory_world_book_shop_v1'

const DORM_WORLD_BOOK_ECONOMY_DEFAULTS = {
  coins: 180,
  crystals: 0,
}

function clampInt(value, min, max, fallback = min) {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function normalizeWorldBookEconomy(value) {
  if (!value || typeof value !== 'object') return { ...DORM_WORLD_BOOK_ECONOMY_DEFAULTS }
  return {
    coins: clampInt(value.coins, 0, 9999, DORM_WORLD_BOOK_ECONOMY_DEFAULTS.coins),
    crystals: clampInt(value.crystals, 0, 9999, DORM_WORLD_BOOK_ECONOMY_DEFAULTS.crystals),
  }
}

function readWorldBookEconomy(bookId) {
  if (typeof window === 'undefined' || !window.localStorage) return { ...DORM_WORLD_BOOK_ECONOMY_DEFAULTS }
  try {
    const raw = window.localStorage.getItem(DORM_WORLD_BOOK_ECONOMY_STORAGE_KEY)
    if (!raw) return { ...DORM_WORLD_BOOK_ECONOMY_DEFAULTS }
    const allEconomies = JSON.parse(raw)
    const bookEconomy = allEconomies[bookId]
    return normalizeWorldBookEconomy(bookEconomy)
  } catch {
    return { ...DORM_WORLD_BOOK_ECONOMY_DEFAULTS }
  }
}

function persistWorldBookEconomy(bookId, economy) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const raw = window.localStorage.getItem(DORM_WORLD_BOOK_ECONOMY_STORAGE_KEY)
    const allEconomies = raw ? JSON.parse(raw) : {}
    allEconomies[bookId] = normalizeWorldBookEconomy(economy)
    window.localStorage.setItem(DORM_WORLD_BOOK_ECONOMY_STORAGE_KEY, JSON.stringify(allEconomies))
  } catch {
    // ignore
  }
}

function updateWorldBookEconomy(bookId, updater, economyMapRef) {
  const current = readWorldBookEconomy(bookId)
  const updated = typeof updater === 'function' ? updater({ ...current }) : current
  persistWorldBookEconomy(bookId, updated)
  economyMapRef.value[bookId] = normalizeWorldBookEconomy(updated)
  economyMapRef.value = { ...economyMapRef.value }
  return updated
}

function readWorldBookInventory(bookId) {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(DORM_WORLD_BOOK_INVENTORY_STORAGE_KEY)
    if (!raw) return []
    const allInventories = JSON.parse(raw)
    const bookInventory = allInventories[bookId]
    return Array.isArray(bookInventory) ? bookInventory : []
  } catch {
    return []
  }
}

function persistWorldBookInventory(bookId, items) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const raw = window.localStorage.getItem(DORM_WORLD_BOOK_INVENTORY_STORAGE_KEY)
    const allInventories = raw ? JSON.parse(raw) : {}
    allInventories[bookId] = Array.isArray(items) ? items : []
    window.localStorage.setItem(DORM_WORLD_BOOK_INVENTORY_STORAGE_KEY, JSON.stringify(allInventories))
  } catch {
    // ignore
  }
}

function addToWorldBookInventory(bookId, item, inventoryMapRef) {
  if (!bookId || !item) return
  const current = readWorldBookInventory(bookId)
  const newItem = {
    ...item,
    purchasedAt: Date.now(),
    quantity: (item.quantity || 0) + 1,
  }
  const existingIndex = current.findIndex(i => i.id === item.id)
  if (existingIndex >= 0) {
    current[existingIndex].quantity = (current[existingIndex].quantity || 0) + 1
  } else {
    current.push(newItem)
  }
  persistWorldBookInventory(bookId, current)
  inventoryMapRef.value[bookId] = [...current]
  inventoryMapRef.value = { ...inventoryMapRef.value }
  return current
}

function removeFromWorldBookInventory(bookId, itemId, inventoryMapRef) {
  if (!bookId || !itemId) return
  const current = readWorldBookInventory(bookId)
  const filtered = current.filter(i => i.id !== itemId)
  persistWorldBookInventory(bookId, filtered)
  inventoryMapRef.value[bookId] = [...filtered]
  inventoryMapRef.value = { ...inventoryMapRef.value }
  return filtered
}

function readWorldBookShopItems(bookId) {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(DORM_WORLD_BOOK_SHOP_STORAGE_KEY)
    if (!raw) return []
    const allShopItems = JSON.parse(raw)
    const bookItems = allShopItems[bookId]
    return Array.isArray(bookItems) ? bookItems : []
  } catch {
    return []
  }
}

function persistWorldBookShopItems(bookId, items) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const raw = window.localStorage.getItem(DORM_WORLD_BOOK_SHOP_STORAGE_KEY)
    const allShopItems = raw ? JSON.parse(raw) : {}
    allShopItems[bookId] = items
    window.localStorage.setItem(DORM_WORLD_BOOK_SHOP_STORAGE_KEY, JSON.stringify(allShopItems))
  } catch {
    // ignore
  }
}

function removeShopItem(bookId, itemId, shopItemsMapRef) {
  if (!bookId || !itemId) return
  const current = readWorldBookShopItems(bookId)
  const filtered = current.filter(i => i.id !== itemId)
  persistWorldBookShopItems(bookId, filtered)
  shopItemsMapRef.value[bookId] = [...filtered]
  shopItemsMapRef.value = { ...shopItemsMapRef.value }
  return filtered
}

export function useDormShop(activeBook, worldBookEconomyMap, worldBookInventoryMap) {
  // 商店状态
  const shopSelectedCategory = ref('all')
  const shopItemsMap = ref({})
  const isShopRefreshing = ref(false)
  const shopPurchaseFeedback = ref('')
  const isWorldBookShopOpen = ref(false)

  const currentBookItems = computed(() => {
    const bookId = String(activeBook.value?.id || '').trim()
    if (!bookId) return []
    const fromRef = shopItemsMap.value[bookId]
    if (fromRef && Array.isArray(fromRef)) return fromRef
    return readWorldBookShopItems(bookId)
  })

  // 计算属性
  const activeBookInventory = computed(() => {
    const bookId = String(activeBook.value?.id || '').trim()
    if (!bookId) return []
    const fromRef = worldBookInventoryMap.value[bookId]
    if (fromRef && Array.isArray(fromRef)) return fromRef
    return readWorldBookInventory(bookId)
  })

  const activeBookEconomy = computed(() => {
    const bookId = String(activeBook.value?.id || '').trim()
    if (!bookId) return { ...DORM_WORLD_BOOK_ECONOMY_DEFAULTS }
    const fromRef = worldBookEconomyMap.value[bookId]
    if (fromRef && typeof fromRef === 'object') return normalizeWorldBookEconomy(fromRef)
    return readWorldBookEconomy(bookId)
  })

  const activeBookEconomyCoins = computed(() => activeBookEconomy.value.coins)
  const activeBookEconomyCrystals = computed(() => activeBookEconomy.value.crystals)

  const shopFilteredItems = computed(() => {
    const items = currentBookItems.value
    if (shopSelectedCategory.value === 'all') return items
    return items.filter(item => item.category === shopSelectedCategory.value)
  })

  function canAffordShopItem(item) {
    return activeBookEconomyCoins.value >= item.price
  }

  function getActiveBookId() {
    return String(activeBook.value?.id || '').trim()
  }

  function syncShopItemsToRef(newItems) {
    const bookId = getActiveBookId()
    if (!bookId) return
    persistWorldBookShopItems(bookId, newItems)
    shopItemsMap.value[bookId] = [...newItems]
    shopItemsMap.value = { ...shopItemsMap.value }
  }

  // 商店方法
  async function handleRefreshShopItems() {
    isShopRefreshing.value = true
    shopPurchaseFeedback.value = ''

    try {
      const result = await generateDormShopItems({
        worldBook: activeBook.value,
        resultCount: 6,
      })

      if (result.success && result.items && result.items.length > 0) {
        const existing = currentBookItems.value
        const existingNames = new Set(existing.map(i => i.name))
        const newItems = result.items.filter(item => !existingNames.has(item.name))
        const merged = [...existing, ...newItems]
        syncShopItemsToRef(merged)
        shopPurchaseFeedback.value = newItems.length > 0 ? `商店商品已刷新！新增 ${newItems.length} 件商品。` : '当前商品已是最新的，暂无新增。'
      } else {
        shopPurchaseFeedback.value = result.error || '刷新失败，使用本地商品'
        const localItems = generateShopItems('all', 6)
        const existing = currentBookItems.value
        const existingNames = new Set(existing.map(i => i.name))
        const newItems = localItems.filter(item => !existingNames.has(item.name))
        syncShopItemsToRef([...existing, ...newItems])
      }
    } catch (error) {
      console.error('LLM商店商品刷新失败:', error)
      shopPurchaseFeedback.value = '刷新失败，使用本地商品'
      const localItems = generateShopItems('all', 6)
      const existing = currentBookItems.value
      const existingNames = new Set(existing.map(i => i.name))
      const newItems = localItems.filter(item => !existingNames.has(item.name))
      syncShopItemsToRef([...existing, ...newItems])
    } finally {
      isShopRefreshing.value = false
    }
  }

  function handleSelectShopCategory(categoryId) {
    shopSelectedCategory.value = categoryId
    shopPurchaseFeedback.value = ''
  }

  function handleBuyShopItem(item) {
    if (!item) return

    const bookId = getActiveBookId()
    if (!bookId) {
      shopPurchaseFeedback.value = '请先选择世界书。'
      return
    }

    if (!canAffordShopItem(item)) {
      shopPurchaseFeedback.value = `金币不足，购买「${item.name}」需要 ${item.price} 金币。`
      return
    }

    updateWorldBookEconomy(bookId, (previous) => ({
      ...previous,
      coins: clampInt(previous.coins - item.price, 0, 9999, previous.coins),
    }), worldBookEconomyMap)

    addToWorldBookInventory(bookId, item, worldBookInventoryMap)

    removeShopItem(bookId, item.id, shopItemsMap)

    shopPurchaseFeedback.value = `购买成功：${item.icon} ${item.name}（-${item.price} 金币），已放入背包。`
  }

  function openWorldBookShop() {
    isWorldBookShopOpen.value = true
    shopPurchaseFeedback.value = ''
    const bookId = getActiveBookId()
    if (!bookId || currentBookItems.value.length === 0) {
      const newItems = generateShopItems('all', 6)
      syncShopItemsToRef(newItems)
    }
  }

  function closeWorldBookShop() {
    isWorldBookShopOpen.value = false
    shopPurchaseFeedback.value = ''
  }

  function initShopItems() {
    const bookId = getActiveBookId()
    if (!bookId) return
    if (currentBookItems.value.length === 0) {
      const newItems = generateShopItems('all', 6)
      syncShopItemsToRef(newItems)
    }
  }

  return {
    // 状态
    shopSelectedCategory,
    shopItemsMap,
    isShopRefreshing,
    shopPurchaseFeedback,
    isWorldBookShopOpen,
    // 计算属性
    activeBookInventory,
    activeBookEconomyCoins,
    activeBookEconomyCrystals,
    shopFilteredItems,
    // 常量
    DORM_SHOP_CATEGORIES,
    // 方法
    canAffordShopItem,
    handleRefreshShopItems,
    handleSelectShopCategory,
    handleBuyShopItem,
    openWorldBookShop,
    closeWorldBookShop,
    initShopItems,
    // 经济/背包管理（供外部如赠送功能使用）
    updateWorldBookEconomy: (bookId, updater) => updateWorldBookEconomy(bookId, updater, worldBookEconomyMap),
    addToWorldBookInventory: (bookId, item) => addToWorldBookInventory(bookId, item, worldBookInventoryMap),
    removeFromWorldBookInventory: (bookId, itemId) => removeFromWorldBookInventory(bookId, itemId, worldBookInventoryMap),
    readWorldBookInventory: (bookId) => readWorldBookInventory(bookId),
    persistWorldBookInventory: (bookId, items) => persistWorldBookInventory(bookId, items),
    readWorldBookShopItems: (bookId) => readWorldBookShopItems(bookId),
    persistWorldBookShopItems: (bookId, items) => persistWorldBookShopItems(bookId, items),
  }
}
