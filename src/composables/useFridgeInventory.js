/**
 * useFridgeInventory.js - 全局冰箱/库存管理
 * 记录日常购买物品，支持保质期提醒、LLM上下文生成
 */
import { computed, reactive, ref } from 'vue'
import { kvStorage } from '../storage/index.js'

const STORAGE_KEY_ITEMS = 'avg_llm_fridge_items_v1'
const STORAGE_KEY_PURCHASES = 'avg_llm_fridge_purchases_v1'

// 默认保质期天数（按分类）
const DEFAULT_EXPIRY_DAYS = {
  fridge: 7,
  pantry: 30,
  drinks: 90,
  snacks: 60,
  daily: 365,
  other: null,
}

// 分类元信息
const CATEGORY_META = {
  fridge: { label: '冷藏', emoji: '🧊' },
  pantry: { label: '常温', emoji: '📦' },
  drinks: { label: '饮品', emoji: '🥤' },
  snacks: { label: '零食', emoji: '🍿' },
  daily: { label: '日用', emoji: '🧴' },
  other: { label: '其他', emoji: '📋' },
}

// 分类顺序
const CATEGORY_ORDER = ['fridge', 'drinks', 'snacks', 'pantry', 'daily', 'other']

// 模块级状态
let _items = null
let _purchases = null
let _initialized = false

async function loadFromStorage() {
  const storedItems = await kvStorage.get(STORAGE_KEY_ITEMS)
  const storedPurchases = await kvStorage.get(STORAGE_KEY_PURCHASES)
  _items = Array.isArray(storedItems) ? storedItems : []
  _purchases = Array.isArray(storedPurchases) ? storedPurchases : []
  _initialized = true
}

async function saveItems() {
  await kvStorage.set(STORAGE_KEY_ITEMS, _items)
}

async function savePurchases() {
  await kvStorage.set(STORAGE_KEY_PURCHASES, _purchases)
}

// 计算保质期截止日期（基于分类）
function computeExpiryDate(category) {
  const days = DEFAULT_EXPIRY_DAYS[category]
  if (days === null || days === undefined) return null
  const now = new Date()
  now.setDate(now.getDate() + days)
  return now.toISOString()
}

// 判断物品状态：'expired' | 'expiring' | 'fresh'
function getItemStatus(item) {
  if (!item.expiryDate) return 'fresh'
  const now = new Date()
  const expiry = new Date(item.expiryDate)
  const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'expired'
  if (diffDays <= 3) return 'expiring'
  return 'fresh'
}

// 生成ID
function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function useFridgeInventory() {
  if (!_initialized) {
    // 同步初始化，返回空状态；实际加载在后台进行
    _items = []
    _purchases = []
    _initialized = true
    loadFromStorage()
  }

  const items = reactive(_items)
  const purchases = reactive(_purchases)
  const isLoading = ref(!_initialized)

  // 按分类分组
  const categorizedItems = computed(() => {
    const groups = {}
    for (const cat of CATEGORY_ORDER) {
      const catItems = items.filter(i => i.category === cat && i.remaining > 0)
      if (catItems.length > 0) {
        groups[cat] = catItems
      }
    }
    return groups
  })

  // 临期/过期物品
  const expiringItems = computed(() => {
    return items
      .filter(i => {
        const s = getItemStatus(i)
        return s === 'expired' || s === 'expiring'
      })
      .sort((a, b) => {
        const sa = getItemStatus(a)
        const sb = getItemStatus(b)
        // expired 排前面
        if (sa !== sb) return sa === 'expired' ? -1 : 1
        return new Date(a.expiryDate) - new Date(b.expiryDate)
      })
  })

  // 近7天采购
  const recentPurchases = computed(() => {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    return purchases
      .filter(p => new Date(p.date) >= weekAgo)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  })

  // 当月总支出
  const monthlyTotal = computed(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    return purchases
      .filter(p => new Date(p.date) >= monthStart)
      .reduce((sum, p) => sum + (p.total || 0), 0)
  })

  // 单件添加
  async function addItem(item) {
    const newItem = {
      id: genId('item'),
      name: item.name || '',
      category: item.category || 'other',
      quantity: item.quantity || 1,
      unit: item.unit || '个',
      purchaseDate: item.purchaseDate || new Date().toISOString(),
      expiryDate: item.expiryDate || computeExpiryDate(item.category),
      price: item.price || 0,
      source: item.source || '',
      remaining: item.quantity || 1,
      note: item.note || '',
    }
    items.push(newItem)
    await saveItems()
    dispatchFridgeEvent('ITEM_ADDED', { item: newItem })
    return newItem
  }

  // 删除物品
  async function removeItem(itemId) {
    const idx = items.findIndex(i => i.id === itemId)
    if (idx === -1) return
    const removed = items.splice(idx, 1)[0]
    await saveItems()
    dispatchFridgeEvent('ITEM_REMOVED', { item: removed })
  }

  // 更新剩余数量
  async function updateRemaining(itemId, remaining) {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    item.remaining = Math.max(0, remaining)
    await saveItems()
    dispatchFridgeEvent('ITEM_UPDATED', { item })
  }

  // 批量添加（采购单）
  async function addPurchaseRecord(record) {
    const newRecord = {
      id: genId('purchase'),
      date: record.date || new Date().toISOString(),
      source: record.source || '',
      items: (record.items || []).map(i => ({
        name: i.name || '',
        category: i.category || 'other',
        quantity: i.quantity || 1,
        unit: i.unit || '个',
        price: i.price || 0,
      })),
      total: record.items?.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0) || 0,
      note: record.note || '',
    }
    purchases.push(newRecord)
    await savePurchases()

    // 同时写入库存
    for (const i of newRecord.items) {
      await addItem({
        name: i.name,
        category: i.category,
        quantity: i.quantity,
        unit: i.unit,
        price: i.price,
        source: newRecord.source,
        purchaseDate: newRecord.date,
      })
    }

    dispatchFridgeEvent('PURCHASE_ADDED', { record: newRecord })
    return newRecord
  }

  // 删除采购记录（不删除已入库的物品）
  async function deletePurchaseRecord(purchaseId) {
    const idx = purchases.findIndex(p => p.id === purchaseId)
    if (idx === -1) return
    const removed = purchases.splice(idx, 1)[0]
    await savePurchases()
    dispatchFridgeEvent('PURCHASE_DELETED', { record: removed })
  }

  // LLM上下文生成
  function getContextForLLM(limit = 10) {
    const activeItems = items
      .filter(i => i.remaining > 0)
      .sort((a, b) => {
        // 刚买的排前面
        const da = new Date(a.purchaseDate).getTime()
        const db = new Date(b.purchaseDate).getTime()
        return db - da
      })
      .slice(0, limit)

    if (activeItems.length === 0) return null

    const parts = activeItems.map(i => {
      const qty = i.remaining > 1 ? `x${i.remaining}` : ''
      const when = isRecentlyBought(i) ? '(刚买)' : ''
      return `${i.name}${qty}${when}`
    })
    return `冰箱里有：${parts.join('、')}`
  }

  // 辅助：是否近期购买（24小时内）
  function isRecentlyBought(item) {
    const now = new Date()
    const bought = new Date(item.purchaseDate)
    return (now - bought) < 24 * 60 * 60 * 1000
  }

  // 重载数据
  async function reload() {
    isLoading.value = true
    await loadFromStorage()
    // 更新响应式引用
    items.splice(0, items.length, ..._items)
    purchases.splice(0, purchases.length, ..._purchases)
    isLoading.value = false
  }

  return {
    items,
    purchases,
    isLoading,
    categorizedItems,
    expiringItems,
    recentPurchases,
    monthlyTotal,
    addItem,
    removeItem,
    updateRemaining,
    addPurchaseRecord,
    deletePurchaseRecord,
    getContextForLLM,
    reload,
    CATEGORY_META,
    CATEGORY_ORDER,
    DEFAULT_EXPIRY_DAYS,
    getItemStatus,
  }
}

// ---- 事件系统（简易版，用于跨模块通知） ----

const fridgeEventListeners = new Map()

export const FRIDGE_EVENTS = {
  ITEM_ADDED: 'fridge:item_added',
  ITEM_REMOVED: 'fridge:item_removed',
  ITEM_UPDATED: 'fridge:item_updated',
  PURCHASE_ADDED: 'fridge:purchase_added',
  PURCHASE_DELETED: 'fridge:purchase_deleted',
}

function dispatchFridgeEvent(eventType, data) {
  const listeners = fridgeEventListeners.get(eventType)
  if (listeners) {
    listeners.forEach(cb => {
      try { cb(data) } catch (e) { console.warn('[FridgeEvent] callback error:', e) }
    })
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(eventType, { detail: data }))
  }
}

export function onFridgeEvent(eventType, callback) {
  if (!fridgeEventListeners.has(eventType)) {
    fridgeEventListeners.set(eventType, new Set())
  }
  fridgeEventListeners.get(eventType).add(callback)
}

export function offFridgeEvent(eventType, callback) {
  const listeners = fridgeEventListeners.get(eventType)
  if (listeners) listeners.delete(callback)
}
