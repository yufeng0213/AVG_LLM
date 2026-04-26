import { ref, reactive } from 'vue'

/**
 * 运行时活动任务进度追踪。
 * 监听 avgllm:activity:event 自定义事件，更新所有进行中活动的任务进度。
 */

// 所有进行中活动的任务进度（跨活动共享）
const missionProgress = reactive({})
// { [activityId]: { [missionId]: { progress, target, completed } } }

const listeners = new Set()

function notifyListeners() {
  for (const fn of listeners) fn()
}

/**
 * 注册任务类型处理器
 * key: 事件类型（如 'pull_cards'）
 * value: (currentProgress, eventCount) => newProgress
 */
const handlers = {
  pull_cards: (cur, count) => (cur || 0) + count,
  level_up_card: (cur, count) => (cur || 0) + count,
  evolve_card: (cur, count) => (cur || 0) + count,
  interact_character: (cur, count) => (cur || 0) + count,
  date_character: (cur, count) => (cur || 0) + count,
  complete_story: (cur, count) => (cur || 0) + count,
  spend_crystals: (cur, count) => (cur || 0) + count,
  spend_coins: (cur, count) => (cur || 0) + count,
  visit_page: (cur) => (cur || 0) + 1,
}

function handleEvent(eventType, count = 1) {
  for (const [activityId, missions] of Object.entries(missionProgress)) {
    for (const [missionId, state] of Object.entries(missions)) {
      if (state.completed || state.target == null) continue
      const handler = handlers[state.type]
      if (!handler || state.type !== eventType) continue
      state.progress = Math.min(state.target, handler(state.progress, count))
      if (state.progress >= state.target) {
        state.completed = true
      }
    }
  }
  notifyListeners()
}

// 监听来自 window.__avgLLM.activity.notifyEvent 的广播
if (typeof window !== 'undefined') {
  window.addEventListener('avgllm:activity:event', (e) => {
    const { type, count } = e.detail || {}
    if (type) handleEvent(type, count)
  })
}

/**
 * 为活动注册任务进度
 */
export function registerMissions(activityId, missions) {
  if (!missionProgress[activityId]) {
    missionProgress[activityId] = {}
  }
  for (const m of missions) {
    missionProgress[activityId][m.id] = {
      type: m.type,
      progress: missionProgress[activityId][m.id]?.progress || 0,
      target: m.target,
      completed: missionProgress[activityId][m.id]?.completed || false,
    }
  }
  notifyListeners()
}

/**
 * 查询单个任务进度
 */
export function getProgress(activityId, missionId) {
  return missionProgress[activityId]?.[missionId] || { progress: 0, target: 0, completed: false }
}

/**
 * 获取活动所有任务进度
 */
export function getAllProgress(activityId) {
  return missionProgress[activityId] || {}
}

/**
 * 领取任务奖励后标记
 */
export function claimMission(activityId, missionId) {
  const m = missionProgress[activityId]?.[missionId]
  if (!m) return false
  m.claimed = true
  notifyListeners()
  return true
}

/**
 * 监听进度变化
 */
export function onProgressChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * 移除活动进度
 */
export function removeActivity(activityId) {
  delete missionProgress[activityId]
  notifyListeners()
}

export default {
  registerMissions,
  getProgress,
  getAllProgress,
  claimMission,
  onProgressChange,
  removeActivity,
  handleEvent,
}
