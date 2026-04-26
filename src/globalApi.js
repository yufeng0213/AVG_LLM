import { h, ref, computed, reactive, onMounted, watch, nextTick, Teleport, Transition } from 'vue'

const STORAGE_PREFIX = 'avg_llm_'

/**
 * 暴露 window.__avgLLM 供运行时加载的活动 JS 调用。
 * 静态部分（Vue API、kvStorage）直接暴露；
 * 需要 composables 的部分通过 initBridge() 注入。
 */

// ─── 静态 API ──────────────────────────────────────────────
window.__avgLLM = {
  vue: { h, ref, computed, reactive, onMounted, watch, nextTick, Teleport, Transition },

  storage: {
    get: async (key) => {
      const fullKey = STORAGE_PREFIX + key
      const raw = localStorage.getItem(fullKey)
      if (!raw) return null
      try { return JSON.parse(raw) } catch { return raw }
    },
    set: async (key, value) => {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
    },
    remove: async (key) => {
      localStorage.removeItem(STORAGE_PREFIX + key)
    },
  },

  // 以下字段由 initBridge() 填充
  economy: null,
  cardCollection: null,
  activity: null,
}

/**
 * 在 Vue 应用初始化后调用，注入依赖 composables 的 API。
 * @param {Object} hooks - { useGlobalUser, useCardCollection, worldBookIdRef }
 */
export function initGlobalApi(hooks) {
  const { useGlobalUser, useCardCollection, worldBookIdRef } = hooks

  const globalUser = useGlobalUser()

  // ─── 经济系统 ────────────────────────────────────────────
  window.__avgLLM.economy = {
    economy: globalUser.economy,
    updateEconomy: globalUser.updateEconomy,
    getCrystals: () => globalUser.economy.value?.crystals ?? 0,
    getCoins: () => globalUser.economy.value?.coins ?? 0,
    updateCrystals: (val) => {
      globalUser.updateEconomy(prev => ({ ...prev, crystals: Math.max(0, val) }))
    },
    updateCoins: (val) => {
      globalUser.updateEconomy(prev => ({ ...prev, coins: Math.max(0, val) }))
    },
  }

  // ─── 卡牌收藏 ────────────────────────────────────────────
  // 动态获取指定世界书的卡牌收藏实例（活动卡牌绑定到活动所属的世界书）
  const cardCollectionInstances = new Map()
  const getCardCollectionByWorldBook = (wbId) => {
    if (!cardCollectionInstances.has(wbId)) {
      cardCollectionInstances.set(wbId, useCardCollection(wbId))
    }
    return cardCollectionInstances.get(wbId)
  }

  // 默认 API 使用用户当前激活的世界书
  const getCardCollection = () => {
    const wbId = worldBookIdRef?.value || 'default_world_book'
    return getCardCollectionByWorldBook(wbId)
  }

  window.__avgLLM.cardCollection = {
    addCard: (...args) => getCardCollection().addCard(...args),
    getCardDetail: (...args) => getCardCollection().getCardDetail(...args),
    load: () => getCardCollection().load(),
    notifyPull: (count) => {
      window.__avgLLM.activity?.notifyEvent?.('pull_cards', count)
    },
    notifyLevelUp: () => {
      window.__avgLLM.activity?.notifyEvent?.('level_up_card', 1)
    },
    notifyEvolve: () => {
      window.__avgLLM.activity?.notifyEvent?.('evolve_card', 1)
    },
  }

  // ─── 活动专用 ────────────────────────────────────────────
  window.__avgLLM.activity = {
    notifyEvent: (type, count = 1) => {
      const evt = new CustomEvent('avgllm:activity:event', { detail: { type, count } })
      window.dispatchEvent(evt)
    },
    getWorldBookId: () => worldBookIdRef?.value || 'default_world_book',
  }

  // ─── iframe postMessage bridge ─────────────────────────
  initIframeBridge(globalUser, worldBookIdRef, getCardCollectionByWorldBook)
}

/**
 * 监听来自 iframe 的 postMessage 请求，转发到真实的 __avgLLM API。
 * 让 blob URL / 同域 iframe 中的活动代码可以访问 storage、economy 等。
 */
function initIframeBridge(globalUser, worldBookIdRef, getCardCollectionByWorldBook) {
  window.addEventListener('message', async (e) => {
    if (!e.data || !e.data.__avgLLM || e.data.type === 'bridge-ready') return

    const { id, mod, fn, args, worldBookId } = e.data
    const source = e.source

    try {
      let result

      if (mod === 'storage') {
        const s = window.__avgLLM.storage
        if (fn === 'get') result = await s.get(...args)
        else if (fn === 'set') result = await s.set(...args)
        else if (fn === 'remove') result = await s.remove(...args)
      }
      else if (mod === 'economy') {
        if (fn === 'get') {
          result = { coins: globalUser.economy.value?.coins ?? 0, crystals: globalUser.economy.value?.crystals ?? 0 }
        }
        else if (fn === 'update') {
          globalUser.updateEconomy(prev => ({ ...prev, ...args[0] }))
          result = true
        }
      }
      else if (mod === 'activity') {
        const act = window.__avgLLM.activity
        if (fn === 'notifyEvent') { act.notifyEvent(...args); result = true }
        else if (fn === 'getWorldBookId') result = worldBookIdRef?.value || 'default_world_book'
      }
      else if (mod === 'cardCollection') {
        // 使用活动指定的 worldBookId，如果没有指定则使用用户当前激活的世界书
        const targetWorldBookId = worldBookId || worldBookIdRef?.value || 'default_world_book'
        const cc = getCardCollectionByWorldBook(targetWorldBookId)
        if (fn === 'addCard') result = await cc.addCard(...args)
        else if (fn === 'getCardDetail') result = cc.getCardDetail(...args)
        else if (fn === 'load') { await cc.load(); result = true }
      }

      source?.postMessage({ __avgLLM: true, type: 'result', id, value: result }, '*')
    } catch (err) {
      source?.postMessage({ __avgLLM: true, type: 'result', id, error: err.message }, '*')
    }
  })
}
