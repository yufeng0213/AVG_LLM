/**
 * autoRefreshScheduler.js - 角色日程自动刷新调度器
 * 根据配置定时刷新角色日程，支持具体时间点/固定间隔触发，支持 scope 过滤。
 */
import { loadWorldBooks } from '../../../../src/worldbook/worldBookStore.js'

// 调度器单例状态
let _schedulerState = null

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 分钟

/**
 * 初始化调度器
 * @param {{ loadScheduleConfig: Function, saveScheduleConfig: Function, getScheduleKeysForScope: Function, generateScheduleForCharacter: Function }} scheduleAPI
 */
export function initAutoRefreshScheduler(scheduleAPI) {
  if (_schedulerState) return

  _schedulerState = {
    scheduleAPI,
    intervalId: null,
    running: false,
  }
}

/**
 * 启动调度器
 */
export function startAutoRefreshScheduler() {
  if (!_schedulerState || _schedulerState.running) return

  _schedulerState.running = true
  _checkAndRefresh()

  _schedulerState.intervalId = setInterval(_checkAndRefresh, CHECK_INTERVAL_MS)

  // 监听 visibilitychange，app 恢复前台时立即检查
  if (typeof document !== 'undefined') {
    _schedulerState._visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        _checkAndRefresh()
      }
    }
    document.addEventListener('visibilitychange', _schedulerState._visibilityHandler)
  }

  console.log('[AutoRefreshScheduler] started')
}

/**
 * 停止调度器
 */
export function stopAutoRefreshScheduler() {
  if (!_schedulerState || !_schedulerState.running) return

  if (_schedulerState.intervalId) {
    clearInterval(_schedulerState.intervalId)
    _schedulerState.intervalId = null
  }

  if (_schedulerState._visibilityHandler) {
    document.removeEventListener('visibilitychange', _schedulerState._visibilityHandler)
    _schedulerState._visibilityHandler = null
  }

  _schedulerState.running = false
  console.log('[AutoRefreshScheduler] stopped')
}

/**
 * 手动触发一次检查
 */
export function triggerAutoRefreshCheck() {
  if (_schedulerState) {
    _checkAndRefresh()
  }
}

// ---- 内部逻辑 ----

async function _checkAndRefresh() {
  if (!_schedulerState?.running) return
  if (document?.visibilityState === 'hidden') return

  try {
    const config = await _schedulerState.scheduleAPI.loadScheduleConfig()
    const autoRefresh = config?.autoRefresh
    if (!autoRefresh || !autoRefresh.enabled) return

    const shouldRefresh = _shouldTrigger(autoRefresh)
    if (!shouldRefresh) return

    console.log('[AutoRefreshScheduler] triggering auto refresh...')
    await _refreshBatch(autoRefresh)
  } catch (e) {
    console.warn('[AutoRefreshScheduler] check error:', e)
  }
}

function _shouldTrigger(autoRefresh) {
  const now = new Date()

  if (autoRefresh.mode === 'specificTimes') {
    const currentHour = now.getHours()
    if (!autoRefresh.triggerHours?.includes(currentHour)) return false

    // 当日去重
    if (autoRefresh.lastRefreshTimestamp) {
      const lastDate = new Date(autoRefresh.lastRefreshTimestamp)
      if (
        lastDate.getFullYear() === now.getFullYear()
        && lastDate.getMonth() === now.getMonth()
        && lastDate.getDate() === now.getDate()
      ) {
        return false
      }
    }
    return true
  }

  if (autoRefresh.mode === 'interval') {
    const intervalHours = autoRefresh.refreshIntervalHours || 2
    if (!autoRefresh.lastRefreshTimestamp) return true

    const elapsed = (now.getTime() - new Date(autoRefresh.lastRefreshTimestamp).getTime()) / (1000 * 60 * 60)
    return elapsed >= intervalHours
  }

  return false
}

async function _refreshBatch(autoRefresh) {
  const keys = _schedulerState.scheduleAPI.getScheduleKeysForScope(autoRefresh)
  if (!keys || keys.length === 0) {
    console.log('[AutoRefreshScheduler] no keys to refresh')
    return
  }

  console.log(`[AutoRefreshScheduler] refreshing ${keys.length} schedule(s):`, keys)

  const worldBooks = await loadWorldBooks()

  for (const key of keys) {
    const [bookId, charId] = key.split('::')
    const book = worldBooks.find(b => b.id === bookId)
    if (!book) {
      console.warn(`[AutoRefreshScheduler] worldBook not found for key: ${key}`)
      continue
    }

    const charList = book.characters || []
    const char = charList.find(c => String(c.id) === charId)
    if (!char) {
      console.warn(`[AutoRefreshScheduler] character not found for key: ${key}`)
      continue
    }

    const characterObj = {
      id: String(char.id),
      name: String(char.name || char.nickname || '').trim(),
      identity: String(char.identity || '').trim(),
      background: String(char.background || '').trim(),
      personalityProfile: char.personalityProfile,
      portraits: char.portraits || [],
    }

    console.log(`[AutoRefreshScheduler] refreshing schedule for ${characterObj.name}...`)
    try {
      await _schedulerState.scheduleAPI.generateScheduleForCharacter({
        worldBook: book,
        character: characterObj,
        scheduleDate: new Date().toISOString().slice(0, 10),
      })
    } catch (e) {
      console.warn(`[AutoRefreshScheduler] failed to refresh ${characterObj.name}:`, e)
    }
  }

  // 更新最后刷新时间
  const updated = {
    ...autoRefresh,
    lastRefreshTimestamp: new Date().toISOString(),
  }
  await _schedulerState.scheduleAPI.saveScheduleConfig({ autoRefresh: updated })
  console.log('[AutoRefreshScheduler] auto refresh complete')
}
