/**
 * 采集背包服务
 * 管理采集中获得的资源，跨世界书通用
 */

const COLLECT_BACKPACK_STORAGE_KEY = 'avg_llm_collect_backpack_v1'

export const loadCollectBackpack = () => {
  try {
    const raw = window.localStorage.getItem(COLLECT_BACKPACK_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

export const saveCollectBackpack = (items) => {
  try {
    window.localStorage.setItem(COLLECT_BACKPACK_STORAGE_KEY, JSON.stringify(items || []))
  } catch {}
}

export const addToCollectBackpack = (newItems) => {
  const items = loadCollectBackpack()
  const updated = [...items, ...newItems]
  saveCollectBackpack(updated)
  return updated
}

export const removeFromCollectBackpack = (itemId) => {
  const items = loadCollectBackpack()
  const updated = items.filter(item => item.id !== itemId)
  saveCollectBackpack(updated)
  return updated
}

export const clearCollectBackpack = () => {
  saveCollectBackpack([])
}
