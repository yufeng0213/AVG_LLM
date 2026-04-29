/**
 * 游戏会话状态：全局标志位 + 插件运行时启用状态
 * 合并原 sharedGameState.js + featurePluginRuntimeState.js
 */

import { defineStore } from 'pinia'

export const useGameSession = defineStore('gameSession', {
  state: () => ({
    flags: {},
    currentChapter: null,
    baseBuilding: null,
    pluginEnabled: {},
  }),

  getters: {
    isBaseBuildingUnlocked: (s) => !!s.flags.base_building_unlocked,

    /** 返回一个函数：(pluginId) => boolean，供组件按 ID 查询 */
    checkPluginEnabled: (s) => (pluginId) => {
      if (pluginId in s.pluginEnabled) return Boolean(s.pluginEnabled[pluginId])
      return null // 未覆盖，需参考 manifest 的 enabledByDefault
    },
  },

  actions: {
    setFlag(key, value) {
      this.flags[key] = value
    },

    clearFlag(key) {
      delete this.flags[key]
    },

    resetFlags() {
      this.flags = {}
      this.currentChapter = null
      this.baseBuilding = null
    },

    setPluginEnabled(pluginId, enabled) {
      this.pluginEnabled[pluginId] = Boolean(enabled)
    },

    resetPluginOverride(pluginId) {
      delete this.pluginEnabled[pluginId]
    },

    resetAllPlugins() {
      this.pluginEnabled = {}
    },

    /** 批量设置插件状态（用于初始化） */
    syncPluginState(rawState) {
      if (!rawState || typeof rawState !== 'object') return
      const normalized = {}
      for (const [id, val] of Object.entries(rawState)) {
        const key = String(id || '').trim()
        if (!key) continue
        normalized[key] = Boolean(val)
      }
      this.pluginEnabled = normalized
    },
  },

  persist: {
    key: 'avg_llm_game_session_v1',
    paths: ['flags', 'currentChapter', 'baseBuilding', 'pluginEnabled'],
  },
})
