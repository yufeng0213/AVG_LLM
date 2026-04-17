/**
 * useBackStorage - 全局背包与经济存储系统
 *
 * 统一各 feature 的库存、经济、邮箱等持久化能力。
 * 合并了原 useGlobalUser.js 的全局库存和 runMigration.js 的迁移逻辑。
 *
 * 存储 key: avg_llm_global_user_v1
 */

import { computed, reactive } from 'vue'

const STORAGE_KEY = 'avg_llm_global_user_v1'
const MIGRATION_FLAG_KEY = 'avg_llm_migration_v1_done'
const OLD_ECONOMY_KEY = 'avg_llm_dormitory_world_book_economy_v1'
const OLD_INVENTORY_KEY = 'avg_llm_dormitory_world_book_inventory_v1'

const DEFAULT_USER = {
  username: '玩家',
  avatar: null,
  avatarFrame: null,
  economy: { coins: 180, crystals: 0 },
  inventory: [],
  mailbox: [],
  createdAt: null,
}

function clampInt(value, min, max) {
  const n = Math.floor(Number(value))
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      return {
        username: data.username ?? DEFAULT_USER.username,
        avatar: data.avatar ?? null,
        avatarFrame: data.avatarFrame ?? null,
        economy: { ...DEFAULT_USER.economy, ...data.economy },
        inventory: Array.isArray(data.inventory) ? data.inventory : [],
        mailbox: Array.isArray(data.mailbox) ? data.mailbox : [],
        createdAt: data.createdAt ?? Date.now(),
      }
    }
  } catch (e) {
    console.warn('[BackStorage] Failed to load global user:', e)
  }
  return null
}

function persistRaw(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      username: s.username,
      avatar: s.avatar,
      avatarFrame: s.avatarFrame,
      economy: s.economy,
      inventory: s.inventory,
      mailbox: s.mailbox,
      createdAt: s.createdAt,
    }))
  } catch (e) {
    console.error('[BackStorage] Failed to persist global user:', e)
  }
}

// --- 一次性迁移 ---

function runMigration() {
  if (typeof localStorage === 'undefined') return { ok: false, skipped: true }
  if (localStorage.getItem(MIGRATION_FLAG_KEY) === 'done') {
    return { ok: true, skipped: true }
  }

  const results = { ok: true, economy: false, inventory: false }

  // 1. 经济合并
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
        const s = loadRaw() || { ...DEFAULT_USER, economy: { ...DEFAULT_USER.economy }, createdAt: Date.now() }
        s.economy = {
          coins: clampInt(totalCoins, 0, 9999),
          crystals: clampInt(totalCrystals, 0, 9999),
        }
        persistRaw(s)
        console.log(`[BackStorage Migration] Economy merged: ${totalCoins} coins, ${totalCrystals} crystals`)
        results.economy = true
      }
    }
  } catch (e) {
    console.error('[BackStorage Migration] Economy migration failed:', e)
  }

  // 2. 背包合并
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

        const s = loadRaw() || { ...DEFAULT_USER, economy: { ...DEFAULT_USER.economy }, createdAt: Date.now() }
        for (const newItem of mergedInventory) {
          const existing = s.inventory.find(i => i.id === newItem.id)
          if (existing) {
            existing.quantity = (existing.quantity || 1) + (newItem.quantity || 1)
          } else {
            s.inventory.push(newItem)
          }
        }
        persistRaw(s)
        console.log(`[BackStorage Migration] Inventory merged: ${mergedInventory.length} items`)
        results.inventory = true
      }
    }
  } catch (e) {
    console.error('[BackStorage Migration] Inventory migration failed:', e)
  }

  localStorage.setItem(MIGRATION_FLAG_KEY, 'done')
  return results
}

// --- 初始化全局单例状态 ---

const rawState = loadRaw()
const _state = rawState || {
  ...DEFAULT_USER,
  createdAt: Date.now(),
}
if (!rawState) {
  persistRaw(_state)
}

let initialized = false

// --- 模块加载时执行迁移 ---
try {
  runMigration()
} catch {
  // ignore migration errors
}

// --- 将 state 转为 reactive（在模块加载完成后）---
const state = reactive(_state)
initialized = true

// --- API 函数 ---

function updateUsername(name) {
  state.username = name.trim() || DEFAULT_USER.username
  persistRaw(state)
}

function updateAvatar(dataUrl) {
  state.avatar = dataUrl
  persistRaw(state)
}

function updateAvatarFrame(frameId) {
  state.avatarFrame = frameId
  persistRaw(state)
}

function updateEconomy(updater) {
  const next = typeof updater === 'function' ? updater(state.economy) : updater
  state.economy = {
    coins: clampInt(next.coins ?? state.economy.coins, 0, 9999),
    crystals: clampInt(next.crystals ?? state.economy.crystals, 0, 9999),
  }
  persistRaw(state)
}

function addItemToInventory(item) {
  if (!item || typeof item !== 'object') return
  const existing = state.inventory.find(i => i.id === item.id)
  if (existing) {
    existing.quantity = (existing.quantity || 1) + (item.quantity || 1)
  } else {
    state.inventory.push({ ...item, quantity: item.quantity || 1 })
  }
  persistRaw(state)
}

function removeFromInventory(itemId, quantity = 1) {
  const idx = state.inventory.findIndex(i => i.id === itemId)
  if (idx === -1) return
  const item = state.inventory[idx]
  if ((item.quantity || 1) <= quantity) {
    state.inventory.splice(idx, 1)
  } else {
    item.quantity -= quantity
  }
  persistRaw(state)
}

function addToMailbox(message) {
  state.mailbox.push({
    ...message,
    id: message.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    sentAt: message.sentAt || Date.now(),
  })
  if (state.mailbox.length > 200) {
    state.mailbox = state.mailbox.slice(-200)
  }
  persistRaw(state)
}

function removeFromMailbox(messageId) {
  state.mailbox = state.mailbox.filter(m => m.id !== messageId)
  persistRaw(state)
}

export function useBackStorage() {
  return {
    state,
    initialized,
    username: computed(() => state.username),
    avatar: computed(() => state.avatar),
    avatarFrame: computed(() => state.avatarFrame),
    economy: computed(() => state.economy),
    inventory: computed(() => state.inventory),
    mailbox: computed(() => state.mailbox),
    updateUsername,
    updateAvatar,
    updateAvatarFrame,
    updateEconomy,
    addItemToInventory,
    removeFromInventory,
    addToMailbox,
    removeFromMailbox,
  }
}
