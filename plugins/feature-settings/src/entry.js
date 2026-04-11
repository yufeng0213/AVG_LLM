import SettingsScreen from './SettingsScreen.vue'

const SettingsFeatureEntry = {
  id: 'settings',
  route: 'settings',
  mount() {
    return {
      type: 'route',
      route: 'settings',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: SettingsScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
}

export default SettingsFeatureEntry
