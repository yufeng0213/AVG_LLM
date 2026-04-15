/**
 * 数据迁移：从 per-book 结构迁移到全局 + 分书混合结构。
 * 一次性执行，标记完成后不再重复。
 */

const MIGRATION_FLAG_KEY = 'avg_llm_migration_v1_done'
const OLD_ECONOMY_KEY = 'avg_llm_dormitory_world_book_economy_v1'
const OLD_INVENTORY_KEY = 'avg_llm_dormitory_world_book_inventory_v1'
const GLOBAL_USER_KEY = 'avg_llm_global_user_v1'
const WORLD_BOOK_DATA_KEY = 'avg_llm_world_book_data_v1'

function clampInt(value, min, max) {
  const n = Math.floor(Number(value))
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

export function runMigration() {
  try {
    if (localStorage.getItem(MIGRATION_FLAG_KEY) === 'done') {
      console.log('[Migration] Already migrated, skipping.')
      return { ok: true, skipped: true }
    }

    const results = {
      ok: true,
      economy: false,
      inventory: false,
    }

    // 1. 经济合并
    results.economy = migrateEconomy()

    // 2. 背包合并
    results.inventory = migrateInventory()

    if (results.economy || results.inventory) {
      localStorage.setItem(MIGRATION_FLAG_KEY, 'done')
      console.log('[Migration] Migration complete:', results)
    } else {
      // 没有旧数据，直接标记完成
      localStorage.setItem(MIGRATION_FLAG_KEY, 'done')
      console.log('[Migration] No legacy data found, marked as done.')
    }

    return results
  } catch (e) {
    console.error('[Migration] Migration failed:', e)
    return { ok: false, error: e }
  }
}

function migrateEconomy() {
  try {
    const raw = localStorage.getItem(OLD_ECONOMY_KEY)
    if (!raw) return false

    const allEconomies = JSON.parse(raw)
    if (!allEconomies || typeof allEconomies !== 'object') return false

    let totalCoins = 0
    let totalCrystals = 0

    for (const bookId of Object.keys(allEconomies)) {
      const book = allEconomies[bookId]
      if (book && typeof book === 'object') {
        totalCoins += book.coins || 0
        totalCrystals += book.crystals || 0
      }
    }

    // 读取或创建全局用户
    const globalUserRaw = localStorage.getItem(GLOBAL_USER_KEY)
    const globalUser = globalUserRaw ? JSON.parse(globalUserRaw) : {}

    globalUser.economy = {
      coins: clampInt(totalCoins, 0, 9999),
      crystals: clampInt(totalCrystals, 0, 9999),
    }

    if (!globalUser.username) globalUser.username = '玩家'
    if (!globalUser.inventory) globalUser.inventory = []
    if (!globalUser.mailbox) globalUser.mailbox = []
    if (!globalUser.createdAt) globalUser.createdAt = Date.now()

    localStorage.setItem(GLOBAL_USER_KEY, JSON.stringify(globalUser))
    console.log(`[Migration] Economy merged: ${totalCoins} coins, ${totalCrystals} crystals`)
    return true
  } catch (e) {
    console.error('[Migration] Economy migration failed:', e)
    return false
  }
}

function migrateInventory() {
  try {
    const raw = localStorage.getItem(OLD_INVENTORY_KEY)
    if (!raw) return false

    const allInventories = JSON.parse(raw)
    if (!allInventories || typeof allInventories !== 'object') return false

    const globalInventory = []
    const perBookPlotItems = {}

    for (const bookId of Object.keys(allInventories)) {
      const items = allInventories[bookId]
      if (!Array.isArray(items)) continue

      for (const item of items) {
        if (!item || typeof item !== 'object') continue

        // 剧情道具保留分书
        if (item.category === 'plot_item' || item.bookId) {
          if (!perBookPlotItems[bookId]) perBookPlotItems[bookId] = []
          perBookPlotItems[bookId].push({ ...item, scope: 'book' })
        } else {
          // 其他物品合并到全局，去重
          const existing = globalInventory.find(i => i.id === item.id)
          if (existing) {
            existing.quantity = (existing.quantity || 1) + (item.quantity || 1)
          } else {
            globalInventory.push({ ...item, scope: 'global' })
          }
        }
      }
    }

    // 更新全局用户的背包
    const globalUserRaw = localStorage.getItem(GLOBAL_USER_KEY)
    const globalUser = globalUserRaw ? JSON.parse(globalUserRaw) : {}

    // 合并到现有背包（不覆盖）
    const existingInventory = globalUser.inventory || []
    for (const newItem of globalInventory) {
      const existing = existingInventory.find(i => i.id === newItem.id)
      if (existing) {
        existing.quantity = (existing.quantity || 1) + (newItem.quantity || 1)
      } else {
        existingInventory.push(newItem)
      }
    }
    globalUser.inventory = existingInventory

    if (!globalUser.username) globalUser.username = '玩家'
    if (!globalUser.economy) globalUser.economy = { coins: 180, crystals: 0 }
    if (!globalUser.mailbox) globalUser.mailbox = []
    if (!globalUser.createdAt) globalUser.createdAt = Date.now()

    localStorage.setItem(GLOBAL_USER_KEY, JSON.stringify(globalUser))

    // 保存分书剧情道具
    if (Object.keys(perBookPlotItems).length > 0) {
      const bookDataRaw = localStorage.getItem(WORLD_BOOK_DATA_KEY)
      const bookData = bookDataRaw ? JSON.parse(bookDataRaw) : {}

      for (const bookId of Object.keys(perBookPlotItems)) {
        if (!bookData[bookId]) bookData[bookId] = {}
        bookData[bookId].plotItems = perBookPlotItems[bookId]
      }

      localStorage.setItem(WORLD_BOOK_DATA_KEY, JSON.stringify(bookData))
    }

    console.log(`[Migration] Inventory merged: ${globalInventory.length} global items, ${Object.keys(perBookPlotItems).length} book item sets`)
    return true
  } catch (e) {
    console.error('[Migration] Inventory migration failed:', e)
    return false
  }
}
