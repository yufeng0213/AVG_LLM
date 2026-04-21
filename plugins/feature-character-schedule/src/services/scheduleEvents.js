/**
 * scheduleEvents.js - 日程事件系统
 * 提供事件监听和分发机制，支持多模块联动
 */

// 事件类型定义
export const SCHEDULE_EVENTS = {
  UPDATED: 'schedule:updated',
  ACTIVITY_UPDATED: 'activity:updated',
  HOUR_EXECUTED: 'hour:executed',
  STATUS_CHANGED: 'status:changed',
  GENERATION_STARTED: 'schedule:generation_started',
  GENERATION_COMPLETED: 'schedule:generation_completed',
}

// 事件监听器存储
const scheduleEventListeners = new Map()

/**
 * 注册日程事件监听
 * @param {string} eventType - 事件类型
 * @param {Function} callback - 回调函数
 */
export function onScheduleEvent(eventType, callback) {
  if (!scheduleEventListeners.has(eventType)) {
    scheduleEventListeners.set(eventType, new Set())
  }
  scheduleEventListeners.get(eventType).add(callback)
}

/**
 * 取消日程事件监听
 * @param {string} eventType - 事件类型
 * @param {Function} callback - 回调函数
 */
export function offScheduleEvent(eventType, callback) {
  const listeners = scheduleEventListeners.get(eventType)
  if (listeners) {
    listeners.delete(callback)
  }
}

/**
 * 分发日程事件
 * @param {string} eventType - 事件类型
 * @param {Object} data - 事件数据
 */
export function dispatchScheduleEvent(eventType, data) {
  // 触发模块内监听器
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

  // 同时发送window事件（供跨模块使用）
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(eventType, { detail: data }))
  }
}

/**
 * 创建事件监听器管理器（用于组件）
 * @returns {Object} { on, off, cleanup }
 */
export function createScheduleEventListener() {
  const registeredCallbacks = new Map()

  function on(eventType, callback) {
    onScheduleEvent(eventType, callback)
    registeredCallbacks.set(callback, eventType)
  }

  function off(callback) {
    const eventType = registeredCallbacks.get(callback)
    if (eventType) {
      offScheduleEvent(eventType, callback)
      registeredCallbacks.delete(callback)
    }
  }

  function cleanup() {
    registeredCallbacks.forEach((eventType, callback) => {
      offScheduleEvent(eventType, callback)
    })
    registeredCallbacks.clear()
  }

  return { on, off, cleanup }
}
