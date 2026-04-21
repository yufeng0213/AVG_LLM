/**
 * feature-character-schedule 公共接口导出
 * 其他插件/模块通过此路径导入日程功能
 */

// 核心composable
export {
  useCharacterSchedule,
  onScheduleEvent,
  offScheduleEvent,
  dispatchScheduleEvent,
  SCHEDULE_EVENTS,
} from './composables/useCharacterSchedule.js'

// 时间工具
export {
  getCurrentHour,
  getNextHour,
  getScheduleDate,
  getActivityEmoji,
  buildStatusText,
  computeCurrentStatus,
  computeExecutionForHour,
  HOUR_LABEL_MAP,
  HOUR_TIME_MAP,
  SCHEDULE_ACTIVITY_TYPES,
} from './composables/useScheduleTime.js'

// 事件系统
export {
  createScheduleEventListener,
} from './services/scheduleEvents.js'

// 组件（按需导入）
export { default as ScheduleMiniCard } from './components/ScheduleMiniCard.vue'
export { default as ScheduleStatusBadge } from './components/ScheduleStatusBadge.vue'
export { default as ScheduleTimeline } from './components/ScheduleTimeline.vue'

// 自动刷新调度器
export {
  initAutoRefreshScheduler,
  startAutoRefreshScheduler,
  stopAutoRefreshScheduler,
  triggerAutoRefreshCheck,
} from './services/autoRefreshScheduler.js'

// 配置常量
export { SCHEDULE_STORAGE_KEY, SCHEDULE_CONFIG_KEY } from './composables/useCharacterSchedule.js'
