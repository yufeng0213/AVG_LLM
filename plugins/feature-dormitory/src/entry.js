import DormitoryScreen from './DormitoryScreen.vue'

const DormitoryFeatureEntry = {
  id: 'dormitory',
  route: 'dormitory',
  mount() {
    return {
      type: 'route',
      route: 'dormitory',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: DormitoryScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
}

export default DormitoryFeatureEntry
