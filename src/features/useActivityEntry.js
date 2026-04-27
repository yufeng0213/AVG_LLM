import { ref } from 'vue'
import { isSQLiteAvailable, getConfig, setConfig, query, exec } from '../db/db.js'
import { loadCoverFile } from './activityCover.js'

const ENABLED_KEY = 'avg_llm_enabled_activity_v1'
const IMPORTED_KEY = 'avg_llm_imported_activities_v1'
const ACTIVITIES_BASE = '/data/activities'

// 单例：当前启用的活动封面信息
const enabledCover = ref(null)
// { id, name, coverImage, coverGradient, bannerIcon }

// 待打开的活动 ID（用于 WorldHub → ActivityScreen 直接跳转）
const pendingActivityId = ref(null)

let loaded = false

function isHtmlResponse(res) {
  const ct = res.headers.get('content-type') || ''
  return ct.includes('text/html')
}

async function load() {
  if (loaded) return enabledCover.value

  let enabledId
  if (isSQLiteAvailable()) {
    const rows = await query('SELECT activity_id FROM activity_enabled LIMIT 1')
    enabledId = rows[0]?.activity_id || null
  } else {
    const { kvStorage } = await import('../storage/index.js')
    enabledId = await kvStorage.get(ENABLED_KEY)
  }
  if (!enabledId || typeof enabledId !== 'string') {
    enabledCover.value = null
    loaded = true
    return enabledCover.value
  }

  // 1. 检查是否是内置活动
  try {
    const res = await fetch(`${ACTIVITIES_BASE}/${enabledId}/activity.json`)
    if (res.ok && !isHtmlResponse(res)) {
      const meta = await res.json()
      enabledCover.value = {
        id: enabledId,
        name: meta.name || enabledId,
        coverImage: meta.coverImage || null,
        coverGradient: meta.coverGradient || null,
        bannerIcon: meta.bannerIcon || '🎮',
      }
      loaded = true
      return enabledCover.value
    }
  } catch { /* ignore */ }

  // 内置活动可能 fetch 被 Vite 拦截，用路径兜底
  if (enabledId === 'summer_festival' || enabledId === 'summer_festival_2026') {
    enabledCover.value = {
      id: enabledId,
      name: '夏日祭限定活动',
      coverImage: null,
      coverGradient: ['#ff6b6b', '#feca57', '#ff9ff3'],
      bannerIcon: '🎆',
    }
    loaded = true
    return enabledCover.value
  }

  // 2. 检查导入活动
  try {
    let imported
    if (isSQLiteAvailable()) {
      const rows = await query('SELECT activity_data FROM activity_imported')
      imported = rows.map(r => JSON.parse(r.activity_data))
    } else {
      const { kvStorage } = await import('../storage/index.js')
      imported = await kvStorage.get(IMPORTED_KEY)
    }
    if (Array.isArray(imported)) {
      const imp = imported.find(i => i.id === enabledId)
      if (imp && imp.json) {
        // 封面从文件系统加载
        const coverUrl = imp.json.coverImage || await loadCoverFile(enabledId)
        enabledCover.value = {
          id: enabledId,
          name: imp.json.name || enabledId,
          coverImage: coverUrl,
          coverGradient: imp.json.coverGradient || null,
          bannerIcon: imp.json.bannerIcon || '📦',
        }
        loaded = true
        return enabledCover.value
      }
    }
  } catch { /* ignore */ }

  enabledCover.value = null
  loaded = true
  return enabledCover.value
}

function reset() {
  loaded = false
  enabledCover.value = null
}

/**
 * 通知打开活动界面
 * @param {string} activityId - 已启用活动 ID，直接打开详情
 */
function requestOpenActivity(activityId = null) {
  pendingActivityId.value = activityId
}

/**
 * 消费待打开的活动 ID（ActivityScreen 挂载后调用）
 */
function consumePendingActivityId() {
  const id = pendingActivityId.value
  if (id) {
    pendingActivityId.value = null
  }
  return id
}

export function useActivityEntry() {
  return {
    enabledCover,
    load,
    reset,
    requestOpenActivity,
    consumePendingActivityId,
    pendingActivityId,
  }
}
