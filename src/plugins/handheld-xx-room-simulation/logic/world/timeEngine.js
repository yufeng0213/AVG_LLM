// 时间系统 - 日夜循环、速度控制

import {
  TIME_HOURS_PER_DAY,
  TIME_DAY_START_HOUR,
  TIME_NIGHT_START_HOUR,
} from '../../config/constants.js'

// 时间阶段常量
export const TIME_PHASE_MORNING = 'morning'
export const TIME_PHASE_AFTERNOON = 'afternoon'
export const TIME_PHASE_EVENING = 'evening'
export const TIME_PHASE_NIGHT = 'night'

// 时间阶段的光照值
const TIME_PHASE_LIGHT_MAP = {
  morning: 1.0,
  afternoon: 0.9,
  evening: 0.6,
  night: 0.4,
}

export const createTimeEngine = (deps = {}) => {
  // 创建默认时间状态
  const createDefaultTimeState = () => ({
    tick: 0,
    dayCount: 1,
    hourOfDay: TIME_DAY_START_HOUR,
    timeSpeed: 1.0,
    isPaused: true,
    dayPhase: TIME_PHASE_MORNING,
    lightModifier: 1.0,
  })

  // 规范化时间状态
  const normalizeTimeState = (raw) => {
    const defaultState = createDefaultTimeState()
    if (!raw || typeof raw !== 'object') return defaultState

    return {
      tick: Math.max(0, Number(raw.tick) || 0),
      dayCount: Math.max(1, Number(raw.dayCount) || 1),
      hourOfDay: Math.max(0, Math.min(TIME_HOURS_PER_DAY - 1, Number(raw.hourOfDay) || TIME_DAY_START_HOUR)),
      timeSpeed: Math.max(0.5, Math.min(3, Number(raw.timeSpeed) || 1)),
      isPaused: Boolean(raw.isPaused !== false),
      dayPhase: normalizeDayPhase(raw.dayPhase),
      lightModifier: Math.max(0.1, Math.min(1, Number(raw.lightModifier) || 1)),
    }
  }

  // 规范化时间阶段
  const normalizeDayPhase = (raw) => {
    const validPhases = [TIME_PHASE_MORNING, TIME_PHASE_AFTERNOON, TIME_PHASE_EVENING, TIME_PHASE_NIGHT]
    const phase = String(raw || '').toLowerCase()
    return validPhases.includes(phase) ? phase : TIME_PHASE_MORNING
  }

  // 根据小时计算时间阶段
  const calculateDayPhase = (hour) => {
    const h = Math.max(0, Math.min(TIME_HOURS_PER_DAY - 1, Number(hour) || 0))

    if (h >= TIME_DAY_START_HOUR && h < 12) return TIME_PHASE_MORNING
    if (h >= 12 && h < TIME_NIGHT_START_HOUR) return TIME_PHASE_AFTERNOON
    if (h >= TIME_NIGHT_START_HOUR && h < 22) return TIME_PHASE_EVENING
    return TIME_PHASE_NIGHT
  }

  // 计算光照值
  const calculateLightModifier = (hour) => {
    const phase = calculateDayPhase(hour)
    return TIME_PHASE_LIGHT_MAP[phase] || 1.0
  }

  // 推进时间
  const advanceTime = (timeState, ticks = 1, speed = 1) => {
    const effectiveTicks = ticks * speed
    timeState.tick += effectiveTicks

    // 每小时检查
    const ticksPerHour = 60
    const hoursElapsed = Math.floor(timeState.tick / ticksPerHour)

    if (hoursElapsed > 0) {
      timeState.tick = timeState.tick % ticksPerHour
      timeState.hourOfDay = (timeState.hourOfDay + hoursElapsed) % TIME_HOURS_PER_DAY

      // 检测新的一天
      if (timeState.hourOfDay === 0 && hoursElapsed >= TIME_HOURS_PER_DAY) {
        timeState.dayCount += 1
      }

      // 更新阶段和光照
      timeState.dayPhase = calculateDayPhase(timeState.hourOfDay)
      timeState.lightModifier = calculateLightModifier(timeState.hourOfDay)
    }

    return timeState
  }

  // 设置时间速度
  const setTimeSpeed = (timeState, speed) => {
    timeState.timeSpeed = Math.max(0.5, Math.min(3, Number(speed) || 1))
    return timeState
  }

  // 暂停/恢复
  const togglePause = (timeState) => {
    timeState.isPaused = !timeState.isPaused
    return timeState
  }

  // 设置暂停状态
  const setPaused = (timeState, paused) => {
    timeState.isPaused = Boolean(paused)
    return timeState
  }

  // 检查是否是工作时间（白天）
  const isWorkTime = (hour) => {
    const h = Number(hour) || 0
    return h >= TIME_DAY_START_HOUR && h < TIME_NIGHT_START_HOUR
  }

  // 检查是否是休息时间（夜晚）
  const isRestTime = (hour) => {
    const h = Number(hour) || 0
    return h >= TIME_NIGHT_START_HOUR || h < TIME_DAY_START_HOUR
  }

  // 获取时间格式化字符串
  const formatTime = (hour) => {
    const h = Math.max(0, Math.min(TIME_HOURS_PER_DAY - 1, Number(hour) || 0))
    return `${h.toString().padStart(2, '0')}:00`
  }

  // 获取时间阶段显示名称
  const getDayPhaseName = (phase) => {
    const names = {
      morning: '清晨',
      afternoon: '下午',
      evening: '傍晚',
      night: '夜晚',
    }
    return names[phase] || '清晨'
  }

  return {
    createDefaultTimeState,
    normalizeTimeState,
    normalizeDayPhase,
    calculateDayPhase,
    calculateLightModifier,
    advanceTime,
    setTimeSpeed,
    togglePause,
    setPaused,
    isWorkTime,
    isRestTime,
    formatTime,
    getDayPhaseName,
  }
}

export default createTimeEngine