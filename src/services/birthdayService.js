/**
 * 角色生日服务
 * 检测今天过生日的角色，触发生日事件（世界记忆、短信等）
 */
import { useWorldMemoryStore } from '../stores/worldMemory.store.js'
import { acquireLlmSlot } from './llmThrottle.js'

const STORAGE_KEY = 'avg_llm_birthday_tracker_v1'

let _lastBirthdayDate = null // 记录上次触发日期，避免重复

function _randomBirthday() {
  const month = Math.floor(Math.random() * 12) + 1
  const day = Math.floor(Math.random() * 28) + 1 // 简化为 1-28 天
  return `${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function _getTodayStr() {
  const now = new Date()
  return `${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
}

function _getDateKey() {
  const now = new Date()
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}

/**
 * 检查今天是否有角色过生日
 * @param {Object} worldBook
 * @returns {Array<{charId: string, name: string, birthday: string}>}
 */
export function checkTodayBirthdays(worldBook) {
  const chars = worldBook?.characters || []
  const today = _getTodayStr()

  return chars
    .filter(c => c.birthday === today)
    .map(c => ({ charId: c.id, name: c.name, birthday: c.birthday }))
}

/**
 * 触发单个角色的生日事件
 * @param {Object} deps
 * @param {Object} deps.worldBook
 * @param {string} deps.charId
 * @param {string} deps.charName
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
export async function triggerBirthdayEvent(deps) {
  const { worldBook, charId, charName } = deps

  // 写入世界记忆事件
  try {
    const mem = useWorldMemoryStore()
    await mem.addEvent(worldBook.id, {
      type: 'birthday',
      participants: [charId],
      summary: `今天是 ${charName} 的生日！🎂`,
      emotionalImpact: 50,
    })
    console.log(`[Birthday] ${charName} 的生日事件已写入世界记忆`)
    return { success: true, message: `${charName} 的生日事件已记录` }
  } catch (e) {
    console.warn('[Birthday] save event failed:', e.message)
    return { success: false, error: e.message }
  }
}

/**
 * 批量触发今天的所有生日事件
 * @param {Object} deps
 * @param {Object} deps.worldBook
 * @returns {Promise<Array<{success: boolean, charName?: string, error?: string}>>}
 */
export async function triggerTodayBirthdays(deps) {
  const results = []
  const todayBirthdays = checkTodayBirthdays(deps.worldBook)

  if (todayBirthdays.length === 0) return results

  const throttle = acquireLlmSlot()
  if (!throttle.allowed) {
    console.log('[Birthday] throttle blocked:', throttle.reason)
    return results
  }

  for (const bday of todayBirthdays) {
    const result = await triggerBirthdayEvent({
      worldBook: deps.worldBook,
      charId: bday.charId,
      charName: bday.name,
    })
    results.push({ ...result, charName: bday.name })
  }

  return results
}

/**
 * 重置生日追踪（用于新游戏）
 */
export function resetBirthdayTracking() {
  _lastBirthdayDate = null
}

/**
 * 为角色生成随机生日（用于新角色或无生日的角色）
 * @returns {string} "MM-DD" 格式
 */
export function generateRandomBirthday() {
  return _randomBirthday()
}
