/**
 * 全局商店 Composable
 * 使用全局经济/背包，商品包含通用物品 + 随机世界书剧情道具。
 */

import { computed, ref } from 'vue'
import { usePlayerState } from '../../../../src/stores/playerState.store.js'
import { loadWorldBooks } from '../../../../src/worldbook/worldBookStore.js'
import { generateDormShopItems } from '../../../../src/llm'
import { DORM_SHOP_CATEGORIES, DORM_SHOP_ITEM_TEMPLATES, generateShopItems } from './shopConstants.js'

const GLOBAL_SHOP_STORAGE_KEY = 'avg_llm_global_shop_v1'

function readGlobalShopItems() {
  try {
    const raw = localStorage.getItem(GLOBAL_SHOP_STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) {
      console.warn('[useGlobalShop] localStorage data is not an array, clearing corrupted data')
      localStorage.removeItem(GLOBAL_SHOP_STORAGE_KEY)
      return []
    }
    const valid = data.filter(item => item && typeof item === 'object' && item.name && item.price != null)
    if (valid.length === 0 && data.length > 0) {
      console.warn('[useGlobalShop] localStorage data is corrupted, clearing. Raw items:', data.length)
      localStorage.removeItem(GLOBAL_SHOP_STORAGE_KEY)
      return []
    }
    return valid
  } catch {
    console.warn('[useGlobalShop] failed to parse localStorage data, clearing')
    localStorage.removeItem(GLOBAL_SHOP_STORAGE_KEY)
    return []
  }
}

function persistGlobalShopItems(items) {
  try {
    localStorage.setItem(GLOBAL_SHOP_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // ignore
  }
}

export function useGlobalShop() {
  const playerState = usePlayerState()

  const shopSelectedCategory = ref('all')
  const isShopRefreshing = ref(false)
  const shopPurchaseFeedback = ref('')
  const isWorldBookShopOpen = ref(false)

  // 全局经济
  const activeBookEconomyCoins = computed(() => playerState.economy?.coins ?? 0)
  const activeBookEconomyCrystals = computed(() => playerState.economy?.crystals ?? 0)

  // 全局背包
  const activeBookInventory = computed(() => playerState.inventory || [])

  // 商店商品（全局）
  const shopItems = ref(readGlobalShopItems())

  // 调试：检查 localStorage 数据

  // 过滤商品
  const shopFilteredItems = computed(() => {
    const items = Array.isArray(shopItems.value) ? shopItems.value : []
    const valid = items.filter(item => item && typeof item === 'object' && item.name && item.price != null)
    if (shopSelectedCategory.value === 'all') return valid
    return valid.filter(item => item.category === shopSelectedCategory.value)
  })

  function canAffordShopItem(item) {
    if (!item || typeof item !== 'object') {
      console.warn('[useGlobalShop] canAffordShopItem called with invalid item:', item)
      return false
    }
    return activeBookEconomyCoins.value >= (item.price ?? Infinity)
  }

  function syncShopItems(items) {
    shopItems.value = items
    persistGlobalShopItems(items)
  }

  async function handleRefreshShopItems() {
    isShopRefreshing.value = true
    shopPurchaseFeedback.value = ''

    // 清理无效数据
    const validExistingItems = shopItems.value.filter(i => i && typeof i === 'object' && i.name)
    if (validExistingItems.length !== shopItems.value.length) {
      syncShopItems(validExistingItems)
    }

    try {
      // 随机选一个世界书用于 LLM 生成剧情道具
      const allBooks = await loadWorldBooks()
      const randomBook = allBooks.length > 0 ? allBooks[Math.floor(Math.random() * allBooks.length)] : null

      const result = await generateDormShopItems({
        worldBook: randomBook,
        resultCount: 6,
      })

      if (result.success && result.items && result.items.length > 0) {
        const existingNames = new Set(shopItems.value.map(i => i.name))
        const newItems = result.items
          .filter(item => !existingNames.has(item.name))
          .map(item => ({
            ...item,
            scope: item.bookId ? 'book' : 'global',
          }))
        const merged = [...shopItems.value, ...newItems]
        syncShopItems(merged)
        shopPurchaseFeedback.value = newItems.length > 0
          ? `商店商品已刷新！新增 ${newItems.length} 件商品。`
          : '当前商品已是最新的，暂无新增。'
      } else {
        shopPurchaseFeedback.value = result.error || '刷新失败，使用本地商品'
        const localItems = generateShopItems('all', 6).map(item => ({
          ...item,
          scope: item.bookId ? 'book' : 'global',
        }))
        const existingNames = new Set(shopItems.value.map(i => i.name))
        const newItems = localItems.filter(item => !existingNames.has(item.name))
        syncShopItems([...shopItems.value, ...newItems])
      }
    } catch (error) {
      console.error('[handleRefreshShopItems] LLM error, falling back to local:', error.message)
      shopPurchaseFeedback.value = '刷新失败，使用本地商品'
      const localItems = generateShopItems('all', 6).map(item => ({
        ...item,
        scope: item.bookId ? 'book' : 'global',
      }))
      const existingNames = new Set(shopItems.value.map(i => i.name))
      const newItems = localItems.filter(item => !existingNames.has(item.name))
      syncShopItems([...shopItems.value, ...newItems])
    } finally {
      isShopRefreshing.value = false
    }
  }

  function handleSelectShopCategory(categoryId) {
    shopSelectedCategory.value = categoryId
    shopPurchaseFeedback.value = ''
  }

  function handleBuyShopItem(item) {
    if (!item || typeof item !== 'object') return

    if (!canAffordShopItem(item)) {
      shopPurchaseFeedback.value = `金币不足，购买「${item.name}」需要 ${item.price} 金币。`
      return
    }

    // 扣金币（全局经济）
    playerState.updateEconomy(prev => ({
      ...prev,
      coins: Math.max(0, (prev.coins || 0) - item.price),
    }))

    // 加入购物车（全局背包）
    // 剧情道具需要标记 scope 和 bookId
    const purchasedItem = {
      ...item,
      scope: item.bookId ? 'book' : 'global',
    }
    playerState.addItemToInventory(purchasedItem)

    // 从商店移除
    const filtered = shopItems.value.filter(i => i.id !== item.id)
    syncShopItems(filtered)

    const scopeLabel = purchasedItem.scope === 'book' ? `（${item.bookTitle || '某世界书'}专属）` : ''
    shopPurchaseFeedback.value = `购买成功：${item.icon} ${item.name}${scopeLabel}（-${item.price} 金币），已放入背包。`
  }

  function openWorldBookShop() {
    isWorldBookShopOpen.value = true
    shopPurchaseFeedback.value = ''
    if (shopItems.value.length === 0) {
      const newItems = generateShopItems('all', 6).map(item => ({
        ...item,
        scope: item.bookId ? 'book' : 'global',
      }))
      syncShopItems(newItems)
    }
  }

  function closeWorldBookShop() {
    isWorldBookShopOpen.value = false
    shopPurchaseFeedback.value = ''
  }

  function initShopItems() {
    if (!shopItems.value || shopItems.value.length === 0) {
      const newItems = generateShopItems('all', 6).map(item => ({
        ...item,
        scope: item.bookId ? 'book' : 'global',
      }))
      syncShopItems(newItems)
    }
  }

  return {
    // 状态
    shopSelectedCategory,
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
  }
}
