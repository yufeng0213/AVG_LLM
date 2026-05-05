/**
 * useContactStatus.js - 角色在线状态
 * 在线状态从日程系统实时推导
 */

// 状态映射：日程活动类型 → 在线状态
const STATUS_MAP = {
  sleep: { label: '睡觉中', emoji: '😴', color: '#636e72', dotClass: 'dot-sleep' },
  work: { label: '工作中', emoji: '💼', color: '#e17055', dotClass: 'dot-busy' },
  study: { label: '学习中', emoji: '📖', color: '#e17055', dotClass: 'dot-busy' },
  class: { label: '上课中', emoji: '📚', color: '#e17055', dotClass: 'dot-busy' },
  training: { label: '训练中', emoji: '🏃', color: '#e17055', dotClass: 'dot-busy' },
  mission: { label: '执行任务', emoji: '🎯', color: '#e17055', dotClass: 'dot-busy' },
  meal: { label: '用餐中', emoji: '🍽️', color: '#fdcb6e', dotClass: 'dot-away' },
  social: { label: '外出社交', emoji: '👥', color: '#fdcb6e', dotClass: 'dot-away' },
  appointment: { label: '约会中', emoji: '❤️', color: '#fdcb6e', dotClass: 'dot-away' },
  hygiene: { label: '忙碌中', emoji: '🚿', color: '#636e72', dotClass: 'dot-busy' },
  leisure: { label: '在线', emoji: '😊', color: '#00b894', dotClass: 'dot-online' },
  hobby: { label: '在线', emoji: '🎨', color: '#00b894', dotClass: 'dot-online' },
  dorm_visit: { label: '在线', emoji: '🏠', color: '#00b894', dotClass: 'dot-online' },
}

const DEFAULT_STATUS = { label: '在线', emoji: '😊', color: '#00b894', dotClass: 'dot-online' }

function getStatusFromSchedule(activityType) {
  return STATUS_MAP[activityType] || DEFAULT_STATUS
}

export function useContactStatus() {
  // 获取角色在线状态
  function getOnlineStatus(activityType, canContact) {
    if (!canContact && activityType !== 'sleep') {
      const s = getStatusFromSchedule(activityType)
      return { label: '忙碌', emoji: '⛔', color: '#636e72', dotClass: 'dot-busy' }
    }
    return getStatusFromSchedule(activityType)
  }

  return {
    getOnlineStatus,
  }
}
