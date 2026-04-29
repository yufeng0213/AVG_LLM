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

  // 以下字段由 initGlobalApi() 填充
  economy: null,
  cardCollection: null,
  activity: null,
}

// Android/Capacitor 环境下的 activity 文件操作
async function importActivityToCapacitor(activityId, files) {
  console.log('[importActivityToCapacitor] 开始导入, activityId:', activityId, 'files:', files?.length)
  const { Filesystem, Directory } = await import('@capacitor/filesystem')

  // 使用 Directory.Data，这是应用内部数据目录，在 Android 上最可靠
  const BASE_DIR = Directory.Data
  console.log('[importActivityToCapacitor] 使用 Directory.Data')

  // 1. 先确保 activities 根目录存在
  try {
    await Filesystem.mkdir({ path: 'activities', directory: BASE_DIR, recursive: true })
    console.log('[importActivityToCapacitor] activities 根目录创建成功')
  } catch (e) {
    console.log('[importActivityToCapacitor] activities 根目录已存在:', e.message)
  }

  // 2. 创建活动目录
  const basePath = `activities/${activityId}`
  console.log('[importActivityToCapacitor] basePath:', basePath)
  try {
    await Filesystem.mkdir({ path: basePath, directory: BASE_DIR, recursive: true })
    console.log('[importActivityToCapacitor] 活动目录创建成功')
  } catch (e) {
    console.log('[importActivityToCapacitor] 活动目录创建失败或已存在:', e.message)
  }

  // 3. 先收集所有需要的目录，一次性创建
  const dirsNeeded = new Set()
  for (const f of files) {
    const filePath = `${basePath}/${f.relPath || f.path}`
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'))
    if (dirPath && dirPath !== basePath) {
      dirsNeeded.add(dirPath)
    }
  }

  console.log('[importActivityToCapacitor] 需要创建的子目录:', Array.from(dirsNeeded))

  // 4. 创建所有子目录
  for (const dirPath of dirsNeeded) {
    try {
      await Filesystem.mkdir({ path: dirPath, directory: BASE_DIR, recursive: true })
      console.log('[importActivityToCapacitor] 子目录创建成功:', dirPath)
    } catch (e) {
      console.log('[importActivityToCapacitor] 子目录已存在:', dirPath)
    }
  }

  // 5. 写入每个文件
  let successCount = 0
  let failCount = 0
  for (const f of files) {
    const filePath = `${basePath}/${f.relPath || f.path}`
    console.log('[importActivityToCapacitor] 写入文件:', filePath, 'encoding:', f.encoding)

    try {
      // Capacitor writeFile 只接受 base64 数据，文本需要转换
      let data = f.content
      let encoding = f.encoding

      // 如果是 utf-8 文本，转成 base64
      if (encoding === 'utf-8' || encoding === 'utf8') {
        // 先尝试用 TextEncoder
        try {
          const encoder = new TextEncoder()
          const uint8Array = encoder.encode(f.content)
          let binary = ''
          for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i])
          }
          data = btoa(binary)
          console.log('[importActivityToCapacitor] 文本转 base64 成功, 长度:', data.length)
        } catch (e) {
          // 备用方法：直接 btoa（可能有 Unicode 问题）
          data = btoa(unescape(encodeURIComponent(f.content)))
        }
      }

      await Filesystem.writeFile({
        path: filePath,
        data: data,
        directory: BASE_DIR,
      })
      successCount++
      console.log('[importActivityToCapacitor] 写入成功:', filePath)
    } catch (e) {
      failCount++
      console.log('[importActivityToCapacitor] 写入失败:', filePath, e.message)
    }
  }

  console.log('[importActivityToCapacitor] 完成, 成功:', successCount, '失败:', failCount)
  return { success: failCount === 0, error: failCount > 0 ? `${failCount} 个文件写入失败` : null }
}

async function removeActivityFromCapacitor(activityId) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')

  try {
    await Filesystem.rmdir({
      path: `activities/${activityId}`,
      directory: Directory.Data,
      recursive: true
    })
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// 获取活动文件的 WebView 可访问 URL
async function getActivityFileUrlCapacitor(activityId, relativePath) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const Capacitor = window.Capacitor

  try {
    const result = await Filesystem.getUri({
      path: `activities/${activityId}/${relativePath}`,
      directory: Directory.Data
    })

    console.log('[getActivityFileUrlCapacitor] getUri result:', result.uri)

    // 用 Capacitor.convertFileSrc 把 file:// URI 转成 WebView 可访问的 URL
    if (Capacitor?.convertFileSrc) {
      const url = Capacitor.convertFileSrc(result.uri)
      console.log('[getActivityFileUrlCapacitor] convertFileSrc result:', url)
      return url
    }
    // 如果没有 convertFileSrc，返回原始 URI
    return result.uri
  } catch (e) {
    console.error('[getActivityFileUrlCapacitor] failed:', e)
    return null
  }
}

/**
 * 在 Vue 应用初始化后调用，注入依赖 composables 的 API。
 * @param {Object} hooks - { usePlayerState, useCardCollection, worldBookIdRef }
 */
export function initGlobalApi(hooks) {
  const { usePlayerState, useCardCollection, worldBookIdRef } = hooks

  const playerState = usePlayerState()

  // ─── 经济系统 ────────────────────────────────────────────
  window.__avgLLM.economy = {
    economy: computed(() => playerState.economy),
    updateEconomy: playerState.updateEconomy,
    getCrystals: () => playerState.economy?.crystals ?? 0,
    getCoins: () => playerState.economy?.coins ?? 0,
    updateCrystals: (val) => {
      playerState.updateEconomy(prev => ({ ...prev, crystals: Math.max(0, val) }))
    },
    updateCoins: (val) => {
      playerState.updateEconomy(prev => ({ ...prev, coins: Math.max(0, val) }))
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
  // Capacitor/Android 环境下提供 import 和 remove
  const activityApi = {
    notifyEvent: (type, count = 1) => {
      const evt = new CustomEvent('avgllm:activity:event', { detail: { type, count } })
      window.dispatchEvent(evt)
    },
    getWorldBookId: () => worldBookIdRef?.value || 'default_world_book',
  }

  // 动态检测 Capacitor 环境（在 initGlobalApi 时检测，而不是模块加载时）
  const isCapacitorNow = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()
  console.log('[globalApi] initGlobalApi - isCapacitor:', isCapacitorNow)

  // 如果是 Capacitor 环境，添加文件操作
  if (isCapacitorNow) {
    activityApi.import = importActivityToCapacitor
    activityApi.remove = removeActivityFromCapacitor
    activityApi.getFileUrl = getActivityFileUrlCapacitor
    console.log('[globalApi] 已添加 Capacitor 文件操作 API')
  }

  window.__avgLLM.activity = activityApi

  // ─── iframe postMessage bridge ─────────────────────────
  initIframeBridge(playerState, worldBookIdRef, getCardCollectionByWorldBook)
}

/**
 * 监听来自 iframe 的 postMessage 请求，转发到真实的 __avgLLM API。
 */
function initIframeBridge(playerState, worldBookIdRef, getCardCollectionByWorldBook) {
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
          result = { coins: playerState.economy?.coins ?? 0, crystals: playerState.economy?.crystals ?? 0 }
        }
        else if (fn === 'update') {
          playerState.updateEconomy(prev => ({ ...prev, ...args[0] }))
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
