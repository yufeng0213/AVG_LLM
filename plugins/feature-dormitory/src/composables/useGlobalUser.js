import { computed, reactive } from 'vue'

const STORAGE_KEY = 'avg_llm_global_user_v1'
const DEFAULT_USER = {
  username: '玩家',
  avatar: null,
  avatarFrame: null,
  economy: { coins: 180, crystals: 0 },
  inventory: [],
  mailbox: [],
  createdAt: null,
}

// 全局单例状态
let state = reactive({ ...DEFAULT_USER })
let initialized = false

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      Object.assign(state, {
        username: data.username ?? DEFAULT_USER.username,
        avatar: data.avatar ?? null,
        avatarFrame: data.avatarFrame ?? null,
        economy: { ...DEFAULT_USER.economy, ...data.economy },
        inventory: Array.isArray(data.inventory) ? data.inventory : [],
        mailbox: Array.isArray(data.mailbox) ? data.mailbox : [],
        createdAt: data.createdAt ?? Date.now(),
      })
    } else {
      // 首次创建
      state.createdAt = Date.now()
      persist()
    }
  } catch (e) {
    console.warn('[GlobalUser] Failed to load global user:', e)
  }
  initialized = true
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      username: state.username,
      avatar: state.avatar,
      avatarFrame: state.avatarFrame,
      economy: state.economy,
      inventory: state.inventory,
      mailbox: state.mailbox,
      createdAt: state.createdAt,
    }))
  } catch (e) {
    console.error('[GlobalUser] Failed to persist global user:', e)
  }
}

function updateUsername(name) {
  state.username = name.trim() || DEFAULT_USER.username
  persist()
}

function updateAvatar(dataUrl) {
  state.avatar = dataUrl
  persist()
}

function updateAvatarFrame(frameId) {
  state.avatarFrame = frameId
  persist()
}

function updateEconomy(updater) {
  const next = typeof updater === 'function' ? updater(state.economy) : updater
  state.economy = {
    coins: clampInt(next.coins ?? state.economy.coins, 0, 9999),
    crystals: clampInt(next.crystals ?? state.economy.crystals, 0, 9999),
  }
  persist()
}

function addToInventory(item) {
  const existing = state.inventory.find(i => i.id === item.id)
  if (existing) {
    existing.quantity = (existing.quantity || 1) + (item.quantity || 1)
  } else {
    state.inventory.push({ ...item, quantity: item.quantity || 1 })
  }
  persist()
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
  persist()
}

function addToMailbox(message) {
  state.mailbox.push({
    ...message,
    id: message.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    sentAt: message.sentAt || Date.now(),
  })
  // 限制数量，防止溢出
  if (state.mailbox.length > 200) {
    state.mailbox = state.mailbox.slice(-200)
  }
  persist()
}

function removeFromMailbox(messageId) {
  state.mailbox = state.mailbox.filter(m => m.id !== messageId)
  persist()
}

function clampInt(value, min, max) {
  const n = Math.floor(Number(value))
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

// 模块加载时自动读取
load()

export function useGlobalUser() {
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
    addToInventory,
    removeFromInventory,
    addToMailbox,
    removeFromMailbox,
  }
}
