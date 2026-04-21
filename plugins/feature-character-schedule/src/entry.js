/**
 * feature-character-schedule 入口
 * 提供日程管理界面和全局数据服务
 */
import ScheduleScreen from './ScheduleScreen.vue'

const CharacterScheduleEntry = {
  id: 'character-schedule',
  route: 'schedule',

  mount() {
    return { type: 'route', route: 'schedule' }
  },

  resolveRouteConfig(context = {}) {
    return {
      component: ScheduleScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
}

export default CharacterScheduleEntry