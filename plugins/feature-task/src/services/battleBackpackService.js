/**
 * 战斗背包服务
 * 管理战斗中获得的掉落道具，跨世界书通用
 */

const BATTLE_BACKPACK_STORAGE_KEY = 'avg_llm_battle_backpack_v1'

/**
 * 加载战斗背包
 * @returns {Array} 道具列表
 */
export const loadBattleBackpack = () => {
  try {
    const raw = window.localStorage.getItem(BATTLE_BACKPACK_STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw)
    }
  } catch {
    // ignore
  }
  return []
}

/**
 * 保存战斗背包
 * @param {Array} items - 道具列表
 */
export const saveBattleBackpack = (items) => {
  try {
    window.localStorage.setItem(BATTLE_BACKPACK_STORAGE_KEY, JSON.stringify(items || []))
  } catch {
    // ignore
  }
}

/**
 * 向战斗背包添加道具
 * @param {Array} newItems - 新道具列表
 * @returns {Array} 更新后的道具列表
 */
export const addToBattleBackpack = (newItems) => {
  const items = loadBattleBackpack()
  const updated = [...items, ...newItems]
  saveBattleBackpack(updated)
  return updated
}

/**
 * 从战斗背包移除道具
 * @param {string} itemId - 道具ID
 * @returns {Array} 更新后的道具列表
 */
export const removeFromBattleBackpack = (itemId) => {
  const items = loadBattleBackpack()
  const updated = items.filter(item => item.id !== itemId)
  saveBattleBackpack(updated)
  return updated
}

/**
 * 使用道具（减少 usageCount，归零时移除）
 * @param {string} itemId - 道具ID
 * @returns {Object} { success, items, removed }
 */
export const useBattleItem = (itemId) => {
  const items = loadBattleBackpack()
  const item = items.find(i => i.id === itemId)
  if (!item) return { success: false, items, removed: false }

  item.usageCount = (item.usageCount || 1) - 1
  let removed = false
  if (item.usageCount <= 0) {
    const updated = items.filter(i => i.id !== itemId)
    saveBattleBackpack(updated)
    removed = true
    return { success: true, items: updated, removed: true }
  }

  saveBattleBackpack(items)
  return { success: true, items, removed: false }
}

/**
 * 清空战斗背包
 */
export const clearBattleBackpack = () => {
  saveBattleBackpack([])
}
