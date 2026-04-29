/**
 * Pinia 数据迁移插件
 * 在 store 初始化时将旧版 localStorage 数据迁移到 Pinia 状态
 */

const MIGRATION_FLAG_KEY = 'avg_llm_migration_v1_done'
const OLD_ECONOMY_KEY = 'avg_llm_dormitory_world_book_economy_v1'
const OLD_INVENTORY_KEY = 'avg_llm_dormitory_world_book_inventory_v1'

function clampInt(value, min, max) {
  const n = Math.floor(Number(value))
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

function runEconomyMigration(state) {
  try {
    const raw = localStorage.getItem(OLD_ECONOMY_KEY)
    if (raw) {
      const allEconomies = JSON.parse(raw)
      if (allEconomies && typeof allEconomies === 'object') {
        let totalCoins = 0
        let totalCrystals = 0
        for (const bookId of Object.keys(allEconomies)) {
          const book = allEconomies[bookId]
          if (book && typeof book === 'object') {
            totalCoins += book.coins || 0
            totalCrystals += book.crystals || 0
          }
        }
        state.economy = {
          coins: clampInt(totalCoins, 0, 9999),
          crystals: clampInt(totalCrystals, 0, 9999),
        }
        console.log(`[Migration] Economy merged: ${totalCoins} coins, ${totalCrystals} crystals`)
      }
    }
  } catch (e) {
    console.error('[Migration] Economy migration failed:', e)
  }
}

function runInventoryMigration(state) {
  try {
    const raw = localStorage.getItem(OLD_INVENTORY_KEY)
    if (raw) {
      const allInventories = JSON.parse(raw)
      if (allInventories && typeof allInventories === 'object') {
        const mergedInventory = []
        for (const bookId of Object.keys(allInventories)) {
          const items = allInventories[bookId]
          if (!Array.isArray(items)) continue
          for (const item of items) {
            if (!item || typeof item !== 'object') continue
            const existing = mergedInventory.find(i => i.id === item.id)
            if (existing) {
              existing.quantity = (existing.quantity || 1) + (item.quantity || 1)
            } else {
              mergedInventory.push({ ...item, scope: item.bookId ? 'book' : 'global' })
            }
          }
        }
        for (const newItem of mergedInventory) {
          const existing = state.inventory.find(i => i.id === newItem.id)
          if (existing) {
            existing.quantity = (existing.quantity || 1) + (newItem.quantity || 1)
          } else {
            state.inventory.push(newItem)
          }
        }
        console.log(`[Migration] Inventory merged: ${mergedInventory.length} items`)
      }
    }
  } catch (e) {
    console.error('[Migration] Inventory migration failed:', e)
  }
}

export function createMigrationPlugin() {
  return ({ store, options }) => {
    if (options.id !== 'playerState') return
    if (typeof localStorage === 'undefined') return
    if (localStorage.getItem(MIGRATION_FLAG_KEY) === 'done') return

    store.$onAction(({ name, after }) => {
      if (name !== '_runMigration') return
      after(() => {
        localStorage.setItem(MIGRATION_FLAG_KEY, 'done')
      })
    })
  }
}

/**
 * 手动执行迁移（在 playerState store 初始化时调用）
 */
export function executeMigration(store) {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(MIGRATION_FLAG_KEY) === 'done') return

  runEconomyMigration(store)
  runInventoryMigration(store)
  localStorage.setItem(MIGRATION_FLAG_KEY, 'done')
}
