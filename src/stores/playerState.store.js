/**
 * 玩家全局状态：用户信息、经济、背包、邮箱
 * 替换原 useBackStorage + useGlobalUser
 */

import { defineStore } from 'pinia'
import { executeMigration } from './plugins/migrationPlugin.js'

export const usePlayerState = defineStore('playerState', {
  state: () => ({
    username: '玩家',
    avatar: null,
    avatarFrame: null,
    economy: { coins: 180, crystals: 0 },
    inventory: [],
    mailbox: [],
    createdAt: null,
  }),

  getters: {
    displayName: (s) => s.username || '玩家',
    hasAvatar: (s) => !!s.avatar,
  },

  actions: {
    /** 在 store 初始化时执行一次性数据迁移 */
    runMigration() {
      executeMigration(this)
    },

    updateUsername(name) {
      this.username = name.trim() || '玩家'
    },

    updateAvatar(dataUrl) {
      this.avatar = dataUrl
    },

    updateAvatarFrame(frameId) {
      this.avatarFrame = frameId
    },

    updateEconomy(updater) {
      const next = typeof updater === 'function' ? updater(this.economy) : updater
      this.economy = {
        coins: clampInt(next.coins ?? this.economy.coins, 0, 9999),
        crystals: clampInt(next.crystals ?? this.economy.crystals, 0, 9999),
      }
    },

    addItemToInventory(item) {
      if (!item || typeof item !== 'object') return
      const existing = this.inventory.find(i => i.id === item.id)
      if (existing) {
        existing.quantity = (existing.quantity || 1) + (item.quantity || 1)
      } else {
        this.inventory.push({ ...item, quantity: item.quantity || 1 })
      }
    },

    removeFromInventory(itemId, quantity = 1) {
      const idx = this.inventory.findIndex(i => i.id === itemId)
      if (idx === -1) return
      const item = this.inventory[idx]
      if ((item.quantity || 1) <= quantity) {
        this.inventory.splice(idx, 1)
      } else {
        item.quantity -= quantity
      }
    },

    addToMailbox(message) {
      this.mailbox.push({
        ...message,
        id: message.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sentAt: message.sentAt || Date.now(),
      })
      if (this.mailbox.length > 200) {
        this.mailbox = this.mailbox.slice(-200)
      }
    },

    removeFromMailbox(messageId) {
      this.mailbox = this.mailbox.filter(m => m.id !== messageId)
    },
  },

  persist: {
    key: 'avg_llm_global_user_v1',
    paths: ['username', 'avatar', 'avatarFrame', 'economy', 'inventory', 'mailbox', 'createdAt'],
  },
})

function clampInt(value, min, max) {
  const n = Math.floor(Number(value))
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}
