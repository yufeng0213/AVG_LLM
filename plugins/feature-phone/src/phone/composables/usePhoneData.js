/**
 * usePhoneData.js - 手机界面数据 composable
 * 提供联系人分组、短信线程、通话记录的加载与持久化。
 */
import { computed, ref } from 'vue'
import { loadWorldBooks } from '../../../../../src/worldbook/worldBookStore.js'
import { kvStorage } from '../../../../../src/storage/index.js'

const SMS_THREADS_KEY = 'phone_sms_threads_v1'
const CALL_LOGS_KEY = 'phone_call_logs_v1'

const _worldBooksCache = ref([])
let _loaded = false

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

/**
 * 获取按世界书分组的联系人列表
 * @returns {Promise<Array<{ worldBookId, worldBookTitle, characters: Array }>>}
 */
export async function getGroupedContacts() {
  const books = await ensureWorldBooks()
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

// ===== 通话记录 =====

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
