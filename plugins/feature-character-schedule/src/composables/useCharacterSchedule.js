/**
 * useCharacterSchedule.js - 角色日程状态管理核心
 * 模块级单例，提供全局日程数据服务和查询接口
 */
import { computed, reactive } from 'vue'
import { kvStorage } from '../../../../src/storage/index.js'
import {
  getCurrentHour,
  getNextHour,
  getScheduleDate,
  findCurrentHourEntry,
  computeCurrentStatus,
  createDefaultHourEntries,
  computeExecutionForHour,
  SCHEDULE_ACTIVITY_TYPES,
} from './useScheduleTime.js'
import { generateCharacterSchedule } from '../../../../src/llm/llmService.schedule.js'

// 存储Key（v2 = 24小时制）
export const SCHEDULE_STORAGE_KEY = 'avg_llm_character_schedule_v2'
export const SCHEDULE_CONFIG_KEY = 'avg_llm_schedule_config_v2'

// 模块级单例状态
let _scheduleState = null

/**
 * 获取日程状态管理
 */
export function useCharacterSchedule() {
  // 单例初始化
  if (!_scheduleState) {
    _scheduleState = reactive({
      // 日程数据映射 { bookId::charId: ScheduleData }
      scheduleMap: {},

      // 当前选中
      selectedScheduleKey: '',

      // 生成状态
      isGenerating: false,
      generationError: '',

      // 配置
      config: {
        autoGenerateEnabled: true,
        respectDormitoryState: true,
        syncWithRealTime: true,
        autoRefresh: {
          enabled: false,
          mode: 'specificTimes',
          triggerHours: [0, 2],
          refreshIntervalHours: 2,
          scope: 'all',
          scopeBookId: '',
          scopeCharIds: [],
          lastRefreshTimestamp: null,
        },
      },

      // 缓存时间戳
      lastLoaded: null,
    })
  }

  // 计算属性
  const selectedSchedule = computed(() => {
    const key = _scheduleState.selectedScheduleKey
    return _scheduleState.scheduleMap[key] || null
  })

  const currentHourEntry = computed(() => {
    if (!selectedSchedule.value) return null
    return findCurrentHourEntry(selectedSchedule.value.hourEntries)
  })

  const currentStatus = computed(() => {
    if (!selectedSchedule.value) return null
    return computeCurrentStatus(selectedSchedule.value.hourEntries)
  })

  const isGenerating = computed(() => _scheduleState.isGenerating)

  // 核心方法

  /**
   * 加载所有日程数据（v2格式，旧v1数据已废弃）
   */
  async function loadScheduleMap() {
    const stored = await kvStorage.get(SCHEDULE_STORAGE_KEY)
    if (stored && typeof stored === 'object') {
      _scheduleState.scheduleMap = stored
      _scheduleState.lastLoaded = Date.now()
    }
  }

  /**
   * 保存日程数据
   */
  async function saveScheduleMap() {
    await kvStorage.set(SCHEDULE_STORAGE_KEY, _scheduleState.scheduleMap)
  }

  /**
   * 选择角色
   */
  function selectCharacter(bookId, charId) {
    _scheduleState.selectedScheduleKey = `${bookId}::${charId}`
  }

  /**
   * 为角色生成24小时日程
   */
  async function generateScheduleForCharacter(params) {
    const { worldBook, character, scheduleDate, dormState } = params
    const key = `${worldBook.id}::${character.id}`

    _scheduleState.isGenerating = true
    _scheduleState.generationError = ''

    try {
      const result = await generateCharacterSchedule({
        worldBook,
        character,
        scheduleDate: scheduleDate || getScheduleDate(),
        dormState,
        options: { temperature: 0.75, maxTokens: 1200 },
      })

      if (result.success && result.schedule) {
        const scheduleData = {
          ...result.schedule,
          characterId: character.id,
          bookId: worldBook.id,
          scheduleDate: scheduleDate || getScheduleDate(),
          currentStatus: computeCurrentStatus(result.schedule.hourEntries),
        }

        _scheduleState.scheduleMap[key] = scheduleData
        await saveScheduleMap()

        // 分发事件
        dispatchScheduleEvent('schedule:updated', { key, schedule: scheduleData })

        return { success: true, schedule: scheduleData }
      }

      return { success: false, error: result.error }
    } catch (err) {
      _scheduleState.generationError = err.message
      return { success: false, error: err.message }
    } finally {
      _scheduleState.isGenerating = false
    }
  }

  /**
   * 更新指定小时的活动
   */
  function updateActivity(hour, activityUpdate) {
    const schedule = selectedSchedule.value
    if (!schedule) return false

    const entry = schedule.hourEntries.find(e => e.hour === hour)
    if (!entry || entry.plannedActivity.isLocked) return false

    entry.plannedActivity = { ...entry.plannedActivity, ...activityUpdate, isCustom: true }
    schedule.hasCustomOverride = true
    schedule.currentStatus = computeCurrentStatus(schedule.hourEntries)

    saveScheduleMap()
    dispatchScheduleEvent('activity:updated', { key: _scheduleState.selectedScheduleKey, hour })

    return true
  }

  /**
   * 执行过去小时的结算（批量）
   * @param {string} bookId
   * @param {string} charId
   * @returns {Array} 已执行的小时列表
   */
  function executePassedHours(bookId, charId) {
    const key = `${bookId}::${charId}`
    const schedule = _scheduleState.scheduleMap[key]
    if (!schedule) return []

    const currentHour = getCurrentHour()
    const executed = []

    for (let hour = 0; hour < currentHour; hour++) {
      const entry = schedule.hourEntries[hour]
      if (!entry || entry.executed) continue

      const execData = computeExecutionForHour(entry)
      if (!execData) continue

      entry.executed = execData
      entry.isCompleted = true
      executed.push(hour)
    }

    if (executed.length > 0) {
      // 更新当前小时标记
      schedule.hourEntries.forEach(e => {
        e.isCurrent = e.hour === currentHour
      })

      schedule.currentStatus = computeCurrentStatus(schedule.hourEntries)
      saveScheduleMap()

      dispatchScheduleEvent('hour:executed', {
        key,
        executedHours: executed,
      })
    }

    return executed
  }

  /**
   * 加载日程配置
   */
  async function loadScheduleConfig() {
    const stored = await kvStorage.get(SCHEDULE_CONFIG_KEY)
    if (stored && typeof stored === 'object' && stored.autoRefresh) {
      _scheduleState.config.autoRefresh = stored.autoRefresh
    }
    return _scheduleState.config
  }

  /**
   * 保存日程配置
   */
  async function saveScheduleConfig(config) {
    if (config) {
      _scheduleState.config = { ..._scheduleState.config, ...config }
    }
    await kvStorage.set(SCHEDULE_CONFIG_KEY, _scheduleState.config)
  }

  /**
   * 获取所有日程 key
   */
  function getAllScheduleKeys() {
    return Object.keys(_scheduleState.scheduleMap)
  }

  /**
   * 根据 scope 配置过滤需要刷新的 key 列表
   */
  function getScheduleKeysForScope(autoRefreshConfig) {
    if (!autoRefreshConfig) {
      autoRefreshConfig = _scheduleState.config.autoRefresh
    }
    if (!autoRefreshConfig || autoRefreshConfig.scope === 'all') {
      return getAllScheduleKeys()
    }
    if (autoRefreshConfig.scope === 'book' && autoRefreshConfig.scopeBookId) {
      const prefix = `${autoRefreshConfig.scopeBookId}::`
      return getAllScheduleKeys().filter(k => k.startsWith(prefix))
    }
    if (autoRefreshConfig.scope === 'characters' && autoRefreshConfig.scopeCharIds) {
      const allKeys = getAllScheduleKeys()
      return autoRefreshConfig.scopeCharIds.filter(id => allKeys.includes(id))
    }
    return getAllScheduleKeys()
  }

  /**
   * 初始化角色24小时日程（如果没有）
   */
  async function ensureCharacterSchedule(bookId, charId, defaultData = null) {
    const key = `${bookId}::${charId}`
    if (_scheduleState.scheduleMap[key]) return _scheduleState.scheduleMap[key]

    const defaultEntries = createDefaultHourEntries()
    const defaultSchedule = {
      version: 2,
      characterId: charId,
      bookId,
      scheduleDate: getScheduleDate(),
      generatedAt: new Date().toISOString(),
      hourEntries: defaultEntries,
      currentStatus: computeCurrentStatus(defaultEntries),
      hasCustomOverride: false,
      ...defaultData,
    }

    _scheduleState.scheduleMap[key] = defaultSchedule
    await saveScheduleMap()

    return defaultSchedule
  }

  // 查询接口（供其他模块调用）

  /**
   * 获取角色当前状态
   */
  function getCharacterStatus(bookId, charId) {
    const key = `${bookId}::${charId}`
    const schedule = _scheduleState.scheduleMap[key]
    if (!schedule) return null
    return computeCurrentStatus(schedule.hourEntries)
  }

  /**
   * 判断角色是否可联络
   */
  function isCharacterAvailable(bookId, charId) {
    const status = getCharacterStatus(bookId, charId)
    return status?.canContact ?? true
  }

  /**
   * 获取角色当前位置
   */
  function getCharacterLocation(bookId, charId) {
    const status = getCharacterStatus(bookId, charId)
    if (!status || !status.locationId) return null
    return { locationId: status.locationId, locationName: status.locationName }
  }

  /**
   * 获取指定世界书所有角色的日程状态（供地图使用）
   */
  function getScheduleForWorldBook(bookId) {
    const result = {}
    for (const [key, schedule] of Object.entries(_scheduleState.scheduleMap)) {
      if (key.startsWith(`${bookId}::`)) {
        const charId = key.split('::')[1]
        result[charId] = computeCurrentStatus(schedule.hourEntries)
      }
    }
    return result
  }

  return {
    // 状态
    scheduleState: _scheduleState,
    selectedSchedule,
    currentHourEntry,
    currentStatus,
    isGenerating,

    // 方法
    loadScheduleMap,
    saveScheduleMap,
    selectCharacter,
    generateScheduleForCharacter,
    updateActivity,
    executePassedHours,
    ensureCharacterSchedule,
    loadScheduleConfig,
    saveScheduleConfig,
    getAllScheduleKeys,
    getScheduleKeysForScope,

    // 查询接口
    getCharacterStatus,
    isCharacterAvailable,
    getCharacterLocation,
    getScheduleForWorldBook,

    // 常量导出
    SCHEDULE_ACTIVITY_TYPES,
  }
}

// 事件系统
const scheduleEventListeners = new Map()

export function onScheduleEvent(eventType, callback) {
  if (!scheduleEventListeners.has(eventType)) {
    scheduleEventListeners.set(eventType, new Set())
  }
  scheduleEventListeners.get(eventType).add(callback)
}

export function offScheduleEvent(eventType, callback) {
  const listeners = scheduleEventListeners.get(eventType)
  if (listeners) {
    listeners.delete(callback)
  }
}

export function dispatchScheduleEvent(eventType, data) {
  const listeners = scheduleEventListeners.get(eventType)
  if (listeners) {
    listeners.forEach(callback => {
      try {
        callback(data)
      } catch (e) {
        console.warn('[ScheduleEvent] callback error:', e)
      }
    })
  }

  // 同时发送window事件
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(eventType, { detail: data }))
  }
}

// 事件类型常量
export const SCHEDULE_EVENTS = {
  UPDATED: 'schedule:updated',
  ACTIVITY_UPDATED: 'activity:updated',
  HOUR_EXECUTED: 'hour:executed',
  STATUS_CHANGED: 'status:changed',
}
