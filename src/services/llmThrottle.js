/**
 * LLM 调用节流器 — 所有活人感功能共享
 * 防止短时间内过多 LLM 调用导致 token 消耗失控
 */
import { isSQLiteAvailable } from '../db/connection.js'
import { appConfigRepo } from '../db/repos/appConfig.repo.js'

const STORAGE_KEY = 'avg_llm_throttle_config'

let _state = null

/**
 * 初始化节流器
 * @param {Object} opts
 * @param {Function} opts.isGenerating - 返回当前是否正在生成主剧情
 * @param {number} opts.maxCallsPerWindow - 每窗口最多调用次数（默认 5）
 * @param {number} opts.windowMs - 时间窗口长度（默认 10 分钟）
 */
export function initLlmThrottle(opts = {}) {
  if (_state) return
  _state = {
    isGeneratingFn: opts.isGenerating || (() => false),
    maxCallsPerWindow: opts.maxCallsPerWindow || 5,
    windowMs: opts.windowMs || 10 * 60 * 1000,
    callLog: [], // ISO 时间戳列表
    paused: false,
  }
}

/**
 * 尝试获取一次 LLM 调用许可
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function acquireLlmSlot() {
  if (!_state) return { allowed: true } // 未初始化则放行

  const now = Date.now()

  if (_state.paused) {
    return { allowed: false, reason: '节流器已暂停' }
  }

  if (_state.isGeneratingFn()) {
    return { allowed: false, reason: '主剧情正在生成' }
  }

  // 清除窗口外的记录
  _state.callLog = _state.callLog.filter(t => now - t < _state.windowMs)

  if (_state.callLog.length >= _state.maxCallsPerWindow) {
    const oldest = _state.callLog[0]
    const waitMs = _state.windowMs - (now - oldest)
    const waitSec = Math.ceil(waitMs / 1000)
    return { allowed: false, reason: `窗口内调用次数已满，等待 ${waitSec}s` }
  }

  _state.callLog.push(now)
  return { allowed: true }
}

/**
 * 检查当前状态
 */
export function getThrottleStatus() {
  if (!_state) return { enabled: false }
  return {
    enabled: true,
    paused: _state.paused,
    callsInWindow: _state.callLog.length,
    maxCalls: _state.maxCallsPerWindow,
    windowMs: _state.windowMs,
  }
}

/**
 * 暂停/恢复节流
 */
export function setThrottlePaused(paused) {
  if (_state) _state.paused = !!paused
}

/**
 * 从存储加载配置并初始化
 * @param {Object} opts - 同 initLlmThrottle
 */
export async function initLlmThrottleWithConfig(opts = {}) {
  try {
    let stored
    if (isSQLiteAvailable()) {
      stored = await appConfigRepo.get(STORAGE_KEY)
    } else {
      const { kvStorage } = await import('../storage/index.js')
      stored = await kvStorage.get(STORAGE_KEY)
    }
    if (stored && typeof stored === 'object') {
      opts = { ...opts, ...stored }
    }
  } catch {
    // ignore
  }
  initLlmThrottle(opts)
}

/**
 * 保存节流配置
 */
export async function saveThrottleConfig(config = {}) {
  try {
    const current = _state ? {
      maxCallsPerWindow: _state.maxCallsPerWindow,
      windowMs: _state.windowMs,
    } : {}
    const value = { ...current, ...config }
    if (isSQLiteAvailable()) {
      await appConfigRepo.set(STORAGE_KEY, value)
    } else {
      const { kvStorage } = await import('../storage/index.js')
      await kvStorage.set(STORAGE_KEY, value)
    }
  } catch (e) {
    console.warn('[LlmThrottle] save config failed:', e.message)
  }
}
