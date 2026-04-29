/**
 * useSmsEventPool.js - SMS 事件池加载与管理
 * 从文件目录加载事件索引和详情，支持随机抽取和 JSON 导入导出。
 */
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { kvStorage } from '../storage/index.js'

const SMS_EVENT_POOL_PATH_KEY = 'sms_event_pool_path'
const DEFAULT_EVENT_POOL_DIR = './data/sms-events'

let cachedEventIndex = null
let cachedEventPoolPath = null

/**
 * 获取当前事件池目录路径
 */
export async function getSmsEventPoolPath() {
  if (cachedEventPoolPath) return cachedEventPoolPath
  const saved = await kvStorage.get(SMS_EVENT_POOL_PATH_KEY)
  cachedEventPoolPath = saved || DEFAULT_EVENT_POOL_DIR
  return cachedEventPoolPath
}

/**
 * 设置事件池目录路径
 */
export async function setSmsEventPoolPath(path) {
  cachedEventPoolPath = path
  cachedEventIndex = null
  await kvStorage.set(SMS_EVENT_POOL_PATH_KEY, path)
}

/**
 * 从路径读取 JSON 文件（Capacitor Filesystem 或 fetch）
 */
async function readJsonFile(path) {
  const isNative = Capacitor.isNativePlatform()
  if (isNative) {
    const result = await Filesystem.readFile({
      path,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    })
    return JSON.parse(result.data)
  }
  // Web fallback
  const resp = await fetch(path.startsWith('./') ? path : `./${path}`)
  if (!resp.ok) return null
  return resp.json()
}

/**
 * 列出目录下所有 .json 文件名
 */
async function listJsonFiles(dirPath) {
  const isNative = Capacitor.isNativePlatform()
  if (isNative) {
    const result = await Filesystem.readdir({
      path: dirPath,
      directory: Directory.Data,
    })
    return result.files.filter(f => f.name.endsWith('.json')).map(f => f.name)
  }
  // Web: 无法列出目录，依赖 index.json
  return []
}

/**
 * 加载事件索引
 */
export async function loadSmsEventPool() {
  const baseDir = await getSmsEventPoolPath()
  try {
    const index = await readJsonFile(`${baseDir}/index.json`)
    if (index && Array.isArray(index.events)) {
      cachedEventIndex = index
      return index
    }
  } catch (e) {
    console.warn('[sms-event-pool] Failed to load index.json:', e.message)
  }
  return { events: [], categories: {} }
}

/**
 * 加载单个事件详情
 */
export async function loadSmsEventDetail(eventId) {
  const baseDir = await getSmsEventPoolPath()
  try {
    return await readJsonFile(`${baseDir}/${eventId}.json`)
  } catch (e) {
    console.warn(`[sms-event-pool] Failed to load event ${eventId}:`, e.message)
    return null
  }
}

/**
 * 随机抽取 1 个事件（含完整详情）
 */
export async function drawRandomSmsEvent() {
  const index = await loadSmsEventPool()
  if (!index.events?.length) return null

  const randomEntry = index.events[Math.floor(Math.random() * index.events.length)]
  if (!randomEntry?.id) return null

  const detail = await loadSmsEventDetail(randomEntry.id)
  if (!detail) return null

  return {
    id: detail.id || randomEntry.id,
    category: detail.category || randomEntry.category || '',
    tags: detail.tags || randomEntry.tags || [],
    time: detail.time || '',
    location: detail.location || '',
    event: detail.event || '',
    emotion: detail.emotion || '',
    entryStyle: detail.entryStyle || '',
    socialLine: detail.socialLine || '',
  }
}

/**
 * 获取当前已加载的事件数量
 */
export async function getSmsEventCount() {
  const index = await loadSmsEventPool()
  return index.events?.length || 0
}

/**
 * 验证事件池配置
 */
export function validateSmsEventPool(pool) {
  if (!pool || typeof pool !== 'object') return { valid: false, error: '配置无效' }
  if (!Array.isArray(pool.events)) return { valid: false, error: '缺少 events 数组' }
  for (let i = 0; i < pool.events.length; i++) {
    const evt = pool.events[i]
    if (!evt.id) return { valid: false, error: `事件 #${i + 1} 缺少 id` }
  }
  return { valid: true }
}

/**
 * 从 JSON 文本导入事件池
 * 将事件写入默认目录的 index.json 和各事件文件
 */
export async function importSmsEventPoolJson(text) {
  const pool = JSON.parse(text)
  const validation = validateSmsEventPool(pool)
  if (!validation.valid) throw new Error(validation.error)

  const baseDir = await getSmsEventPoolPath()
  const isNative = Capacitor.isNativePlatform()

  // 确保目录存在
  if (isNative) {
    try {
      await Filesystem.mkdir({ path: baseDir, directory: Directory.Data, recursive: true })
    } catch { /* 目录已存在 */ }
  }

  // 写入 index.json
  const indexData = {
    events: pool.events.map(e => ({
      id: e.id,
      category: e.category || '',
      tags: e.tags || [],
    })),
    categories: pool.categories || {},
  }

  if (isNative) {
    await Filesystem.writeFile({
      path: `${baseDir}/index.json`,
      data: JSON.stringify(indexData, null, 2),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    })

    // 写入各事件详情
    for (const evt of pool.events) {
      if (evt.time !== undefined || evt.event !== undefined) {
        await Filesystem.writeFile({
          path: `${baseDir}/${evt.id}.json`,
          data: JSON.stringify(evt, null, 2),
          directory: Directory.Data,
          encoding: Encoding.UTF8,
        })
      }
    }
  } else {
    // Web: 无法写文件，保存到 kvStorage 作为回退
    await kvStorage.set('sms_event_pool_data', pool)
  }

  cachedEventIndex = null // 清除缓存
  return { success: true, count: pool.events.length }
}

/**
 * 导出当前事件池为 JSON
 */
export async function exportSmsEventPoolJson() {
  const index = await loadSmsEventPool()
  const events = []

  for (const evtRef of index.events || []) {
    const detail = await loadSmsEventDetail(evtRef.id)
    if (detail) {
      events.push(detail)
    } else {
      events.push(evtRef)
    }
  }

  return JSON.stringify({
    events,
    categories: index.categories || {},
  }, null, 2)
}

/**
 * 清除缓存（供外部强制刷新用）
 */
export function clearSmsEventPoolCache() {
  cachedEventIndex = null
  cachedEventPoolPath = null
}

export default {
  getSmsEventPoolPath,
  setSmsEventPoolPath,
  loadSmsEventPool,
  loadSmsEventDetail,
  drawRandomSmsEvent,
  getSmsEventCount,
  validateSmsEventPool,
  importSmsEventPoolJson,
  exportSmsEventPoolJson,
  clearSmsEventPoolCache,
}
