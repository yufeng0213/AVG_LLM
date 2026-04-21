/**
 * useScheduleTime.js - 24小时时段计算工具
 * 提供小时级时段定义、当前小时判断、状态计算等
 */

// 24小时映射
export const HOURS_IN_DAY = 24

export const HOUR_LABEL_MAP = Object.fromEntries(
  Array.from({ length: 24 }, (_, i) => [i, `${String(i).padStart(2, '0')}:00`])
)

export const HOUR_TIME_MAP = Object.fromEntries(
  Array.from({ length: 24 }, (_, i) => [i, {
    start: `${String(i).padStart(2, '0')}:00`,
    end: `${String((i + 1) % 24).padStart(2, '0')}:00`,
  }])
)

// 活动类型定义
export const SCHEDULE_ACTIVITY_TYPES = {
  sleep: { label: '休息', emoji: '😴', locationType: 'home', interactable: false, energy: 15 },
  meal: { label: '用餐', emoji: '🍽️', locationType: 'home', interactable: true, energy: 5 },
  hygiene: { label: '个人卫生', emoji: '🚿', locationType: 'home', interactable: false, energy: -5 },
  work: { label: '工作', emoji: '💼', locationType: 'work', interactable: false, energy: -15 },
  study: { label: '学习', emoji: '📖', locationType: 'school', interactable: false, energy: -12 },
  class: { label: '上课', emoji: '📚', locationType: 'school', interactable: false, energy: -10 },
  training: { label: '训练', emoji: '🏃', locationType: 'work', interactable: true, energy: -18 },
  social: { label: '社交', emoji: '👥', locationType: 'outdoor', interactable: true, energy: -8 },
  leisure: { label: '休闲', emoji: '🎮', locationType: 'outdoor', interactable: true, energy: -3 },
  hobby: { label: '爱好活动', emoji: '🎨', locationType: 'home', interactable: true, energy: -5 },
  mission: { label: '任务', emoji: '🎯', locationType: 'outdoor', interactable: false, energy: -20 },
  appointment: { label: '约会', emoji: '❤️', locationType: 'outdoor', interactable: true, energy: -10 },
  dorm_visit: { label: '寝室来访', emoji: '🏠', locationType: 'home', interactable: true, energy: -5 },
}

/**
 * 获取当前小时 (0-23)
 */
export function getCurrentHour() {
  return new Date().getHours()
}

/**
 * 获取下一小时
 */
export function getNextHour(hour) {
  return (hour + 1) % 24
}

/**
 * 判断小时是否为当前小时
 */
export function isHourCurrent(hour) {
  return getCurrentHour() === hour
}

/**
 * 获取当前日期字符串
 * @returns {string} YYYY-MM-DD
 */
export function getScheduleDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 根据活动类型获取状态文本
 */
export function buildStatusText(activityType) {
  const def = SCHEDULE_ACTIVITY_TYPES[activityType]
  if (!def) return '未知活动'
  return `正在${def.label}`
}

/**
 * 根据活动类型获取emoji
 */
export function getActivityEmoji(activityType) {
  return SCHEDULE_ACTIVITY_TYPES[activityType]?.emoji || '📍'
}

/**
 * 从小时列表中找出当前小时条目
 */
export function findCurrentHourEntry(hourEntries) {
  if (!Array.isArray(hourEntries)) return null
  const currentHour = getCurrentHour()
  return hourEntries.find(e => e.hour === currentHour) || hourEntries[0]
}

/**
 * 计算当前状态快照
 */
export function computeCurrentStatus(hourEntries) {
  const currentHour = getCurrentHour()
  const entry = Array.isArray(hourEntries) ? hourEntries.find(e => e.hour === currentHour) : null

  if (!entry || !entry.plannedActivity) {
    return {
      hour: currentHour,
      activityType: 'leisure',
      activityLabel: '空闲',
      locationId: '',
      locationName: '',
      statusText: '空闲中',
      statusEmoji: '😊',
      canContact: true,
      contactHint: '',
      currentMood: 'neutral',
    }
  }

  const plan = entry.plannedActivity
  const actDef = SCHEDULE_ACTIVITY_TYPES[plan.activityType]
  const canContact = plan.isLocked ? false : (actDef?.interactable ?? true)

  return {
    hour: currentHour,
    activityType: plan.activityType,
    activityLabel: plan.activityLabel,
    locationId: plan.locationId || '',
    locationName: plan.locationName || '',
    statusText: buildStatusText(plan.activityType),
    statusEmoji: getActivityEmoji(plan.activityType),
    canContact,
    contactHint: canContact ? '' : (plan.isLocked ? '当前不方便被打扰' : ''),
    currentMood: entry.executed?.actualMood || 'neutral',
  }
}

/**
 * 创建默认24小时数据
 */
export function createDefaultHourEntries() {
  const currentHour = getCurrentHour()
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    plannedActivity: {
      activityType: 'leisure',
      activityLabel: '空闲',
      description: '暂无安排',
      locationId: '',
      locationName: '',
      blockId: `block_default_${hour}`,
      isLocked: false,
    },
    executed: null,
    isCompleted: hour < currentHour,
    isCurrent: hour === currentHour,
  }))
}

/**
 * 执行小时结算：计算实际能量、心情、好感度变化
 */
export function computeExecutionForHour(hourEntry) {
  const plan = hourEntry?.plannedActivity
  if (!plan) return null

  const actDef = SCHEDULE_ACTIVITY_TYPES[plan.activityType]

  // 心情映射
  const moodMap = {
    sleep: '放松', meal: '满足', hygiene: '清爽',
    work: '专注', study: '充实', class: '认真',
    training: '疲惫', social: '开心', leisure: '愉快',
    hobby: '投入', mission: '紧张', appointment: '期待',
    dorm_visit: '温馨',
  }

  // 基础好感度变化（基于活动类型）
  const baseAffectionMap = {
    sleep: 0, meal: 0, hygiene: 0,
    work: 0, study: 1, class: 1,
    training: -1, social: 2, leisure: 1,
    hobby: 0, mission: -1, appointment: 3,
    dorm_visit: 2,
  }

  return {
    executedAt: new Date().toISOString(),
    actualEnergyChange: actDef?.energy ?? 0,
    actualMood: moodMap[plan.activityType] || '平静',
    actualAffectionChange: baseAffectionMap[plan.activityType] ?? 0,
    actualIsInteractable: plan.isLocked ? false : (actDef?.interactable ?? true),
  }
}
