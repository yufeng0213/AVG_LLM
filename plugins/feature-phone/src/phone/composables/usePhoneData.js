/**
 * usePhoneData.js - 手机界面数据 composable
 * 提供联系人分组、短信线程、通话记录的加载与持久化。
 */
import { computed, ref } from 'vue'
import { loadWorldBooks, loadWorldBookSummaries } from '../../../../../src/worldbook/worldBookStore.js'
import { kvStorage } from '../../../../../src/storage/index.js'

const SMS_THREADS_KEY = 'phone_sms_threads_v1'
const SMS_SETTINGS_KEY = 'phone_sms_settings_v1'
const GROUPS_KEY = 'phone_group_chats_v1'
const GROUP_THREADS_KEY = 'phone_group_chat_threads_v1'
const CALL_LOGS_KEY = 'phone_call_logs_v1'
const CALENDAR_EVENTS_KEY = 'phone_calendar_events_v1'

const DEFAULT_SMS_SETTINGS = {
  contextMessages: 8, // 发送上下文消息数（双方完整记录）
}

// ===== 手机壁纸内存缓存 =====
// 组件重新挂载时直接从内存读取，不需要等 IndexedDB
// 格式: string (图片 dataUrl) | { dataUrl, isVideo: true } (视频) | null
let _phoneWallpaperCache = null

export function getPhoneWallpaperCache() {
  return _phoneWallpaperCache
}

export function setPhoneWallpaperCache(data) {
  _phoneWallpaperCache = data
}

/**
 * 获取缓存的壁纸数据 URL
 */
export function getPhoneWallpaperUrl() {
  const cached = _phoneWallpaperCache
  if (!cached) return null
  if (typeof cached === 'string') return cached
  if (cached.dataUrl) return cached.dataUrl
  return null
}

/**
 * 判断缓存的壁纸是否为视频
 */
export function isPhoneWallpaperVideo() {
  const cached = _phoneWallpaperCache
  if (!cached) return false
  if (typeof cached === 'string') return false
  return !!cached.isVideo
}

// ===== 世界壁纸内存缓存 =====
// 格式: { dataUrl, isVideo: true } | { dataUrl, isVideo: false } | null
let _worldWallpaperCache = null

export function getWorldWallpaperCache() {
  return _worldWallpaperCache
}

export function setWorldWallpaperCache(data) {
  _worldWallpaperCache = data
}

export function getWorldWallpaperUrl() {
  if (!_worldWallpaperCache || !_worldWallpaperCache.dataUrl) return null
  return _worldWallpaperCache.dataUrl
}

export function isWorldWallpaperVideo() {
  return !!_worldWallpaperCache?.isVideo
}

// =====

const _worldBooksCache = ref([])
let _loaded = false

const _worldBooksSummaryCache = ref([])
let _summaryLoaded = false

async function ensureWorldBooks() {
  if (_loaded) return _worldBooksCache.value
  try {
    _worldBooksCache.value = await loadWorldBooks()
    _loaded = true
  } catch (e) {
    console.warn('[usePhoneData] 加载世界书失败:', e)
    _worldBooksCache.value = []
  }
  return _worldBooksCache.value
}

async function ensureWorldBookSummaries() {
  if (_summaryLoaded) return _worldBooksSummaryCache.value
  try {
    _worldBooksSummaryCache.value = await loadWorldBookSummaries()
    _summaryLoaded = true
  } catch (e) {
    console.warn('[usePhoneData] 加载世界书摘要失败:', e)
    _worldBooksSummaryCache.value = []
  }
  return _worldBooksSummaryCache.value
}

/**
 * 清除世界书缓存，用于头像更新后重新加载
 */
export function clearWorldBookCache() {
  _loaded = false
  _summaryLoaded = false
  _worldBooksCache.value = []
  _worldBooksSummaryCache.value = []
}

/**
 * 获取按世界书分组的联系人列表
 * @returns {Promise<Array<{ worldBookId, worldBookTitle, characters: Array }>>}
 */
export async function getGroupedContacts() {
  const books = await ensureWorldBookSummaries()
  const groups = []
  for (const book of books) {
    const chars = Array.isArray(book?.characters) ? book.characters.filter(Boolean) : []
    if (chars.length > 0) {
      groups.push({
        worldBookId: book.id,
        worldBookTitle: book.title || '未命名世界书',
        characters: chars.map(c => ({
          id: c.id,
          name: c.name || c.nickname || '未知角色',
          nickname: c.nickname || '',
          identity: c.identity || '',
          portraits: c.portraits || [],
          smsAvatar: c.smsAvatar || null,
          smsBg: c.smsBg || null,
          smsStickers: c.smsStickers || {},
          voiceConfig: c.voiceConfig || { enabled: false, voiceId: '' },
          worldBookId: book.id,
          worldBookTitle: book.title || '未命名世界书',
        })),
      })
    }
  }
  return groups
}

/**
 * 获取某个世界书的完整对象（用于 LLM 调用）
 */
export async function getWorldBookById(bookId) {
  const books = await ensureWorldBooks()
  return books.find(b => b.id === bookId) || null
}

// ===== 短信线程 =====

export async function loadSmsThreads() {
  try {
    const data = await kvStorage.get(SMS_THREADS_KEY)
    return data || {}
  } catch {
    return {}
  }
}

export async function saveSmsThreads(threads) {
  try {
    await kvStorage.set(SMS_THREADS_KEY, threads)
  } catch (e) {
    console.warn('[usePhoneData] 保存短信失败:', e)
  }
}

export function getSmsThread(threads, contactId) {
  return threads[contactId] || []
}

export function addSmsMessage(threads, contactId, role, text) {
  const thread = threads[contactId] || []
  thread.push({
    id: `sms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role,
    text,
    timestamp: new Date().toISOString(),
  })
  threads[contactId] = thread
  return thread
}

// ===== 短信设置 =====

export async function loadSmsSettings() {
  try {
    const data = await kvStorage.get(SMS_SETTINGS_KEY)
    return { ...DEFAULT_SMS_SETTINGS, ...(data || {}) }
  } catch {
    return { ...DEFAULT_SMS_SETTINGS }
  }
}

export async function saveSmsSettings(settings) {
  try {
    await kvStorage.set(SMS_SETTINGS_KEY, settings)
  } catch (e) {
    console.warn('[usePhoneData] 保存短信设置失败:', e)
  }
}

// ===== 群聊 =====

/**
 * 获取所有群聊列表
 */
export async function loadGroupChats() {
  try {
    const data = await kvStorage.get(GROUPS_KEY)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/**
 * 保存群聊列表
 */
export async function saveGroupChats(groups) {
  try {
    await kvStorage.set(GROUPS_KEY, groups)
  } catch (e) {
    console.warn('[usePhoneData] 保存群聊失败:', e)
  }
}

/**
 * 加载群聊消息线程
 */
export async function loadGroupThreads() {
  try {
    const data = await kvStorage.get(GROUP_THREADS_KEY)
    return data || {}
  } catch {
    return {}
  }
}

/**
 * 保存群聊消息线程
 */
export async function saveGroupThreads(threads) {
  try {
    await kvStorage.set(GROUP_THREADS_KEY, threads)
  } catch (e) {
    console.warn('[usePhoneData] 保存群聊线程失败:', e)
  }
}

/**
 * 获取某个群的消息线程
 */
export function getGroupThread(threads, groupId) {
  return threads[groupId] || []
}

/**
 * 添加群聊消息
 * @param {string} role - 'user' | 'assistant'
 * @param {string} senderName - 发送者名字（assistant 时必填）
 * @param {string} senderId - 发送者 ID（assistant 时必填）
 * @param {Array} mentionedNames - @ 提及的角色名列表
 */
export function addGroupChatMessage(threads, groupId, role, text, senderName = '', senderId = '', mentionedNames = []) {
  const thread = threads[groupId] || []
  thread.push({
    id: `gcmsg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role,
    text,
    senderName,
    senderId,
    mentionedNames,
    timestamp: new Date().toISOString(),
  })
  threads[groupId] = thread
  return thread
}

/**
 * 根据世界书自动创建默认群聊
 * 返回所有群聊列表（含自动创建的和用户自定义的）
 */
export async function ensureWorldBookGroups(existingGroups = []) {
  const books = await ensureWorldBookSummaries()
  const existingWbIds = new Set()
  for (const g of existingGroups) {
    if (g.type === 'worldbook' && g.worldBookId) {
      existingWbIds.add(g.worldBookId)
    }
  }

  const newGroups = [...existingGroups]

  for (const book of books) {
    if (existingWbIds.has(book.id)) continue
    const chars = Array.isArray(book?.characters) ? book.characters.filter(Boolean) : []
    if (chars.length === 0) continue

    newGroups.unshift({
      id: `group_wb_${book.id}`,
      name: `${book.title || '未命名世界书'} 的群聊`,
      type: 'worldbook',
      worldBookId: book.id,
      worldBookTitle: book.title || '未命名世界书',
      members: chars.map(c => ({
        contactId: c.id,
        contactName: c.name || c.nickname || '未知角色',
        worldBookId: book.id,
        worldBookTitle: book.title || '未命名世界书',
      })),
      createdAt: new Date().toISOString(),
    })
  }

  return newGroups
}

/**
 * 创建自定义群聊
 */
export function createCustomGroup(groupData) {
  return {
    id: `group_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: groupData.name || '新群聊',
    type: 'custom',
    members: groupData.members || [], // [{contactId, contactName, worldBookId, worldBookTitle}]
    createdAt: new Date().toISOString(),
  }
}

export async function loadCallLogs() {
  try {
    const data = await kvStorage.get(CALL_LOGS_KEY)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export async function saveCallLogs(logs) {
  try {
    await kvStorage.set(CALL_LOGS_KEY, logs)
  } catch (e) {
    console.warn('[usePhoneData] 保存通话记录失败:', e)
  }
}

export function addCallLog(logs, log) {
  return [
    {
      id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...log,
      timestamp: new Date().toISOString(),
    },
    ...logs,
  ]
}

// ===== 日历事件 =====

/**
 * 加载所有日历事件
 * @returns {Promise<Array>} [{ id, date, time, title, description, contactName, status, createdAt }]
 */
export async function loadCalendarEvents() {
  try {
    const data = await kvStorage.get(CALENDAR_EVENTS_KEY)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/**
 * 保存所有日历事件
 */
export async function saveCalendarEvents(events) {
  try {
    await kvStorage.set(CALENDAR_EVENTS_KEY, events)
  } catch (e) {
    console.warn('[usePhoneData] 保存日历事件失败:', e)
  }
}

/**
 * 添加一个日历事件
 */
export async function addCalendarEvent(event) {
  const events = await loadCalendarEvents()
  const newEvent = {
    id: `cal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    date: event.date,
    time: event.time || null,
    title: event.title,
    description: event.description || '',
    contactName: event.contactName || '',
    status: event.status || 'pending', // 'pending' | 'imported' | 'dismissed'
    createdAt: new Date().toISOString(),
  }
  events.push(newEvent)
  await saveCalendarEvents(events)
  return newEvent
}

/**
 * 更新日历事件状态
 */
export async function updateCalendarEventStatus(id, status) {
  const events = await loadCalendarEvents()
  const event = events.find(e => e.id === id)
  if (event) {
    event.status = status
    await saveCalendarEvents(events)
  }
  return event
}

// ===== 时间格式化 =====

export function formatSmsTime(isoStr) {
  if (!isoStr) return ''
  const date = new Date(isoStr)
  const now = new Date()
  const diff = now - date
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 24 * 60 * 60 * 1000) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  }
  if (diff < 2 * 24 * 60 * 60 * 1000) return '昨天'
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function formatCallDuration(seconds) {
  if (!seconds || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
