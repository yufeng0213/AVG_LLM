import StarrySkyScreen from './StarrySkyScreen.vue'

const TestFeatureEntry = {
  id: 'test',
  route: 'starry-sky',
  mount() {
    return {
      type: 'route',
      route: 'starry-sky',
    }
  },
  resolveRouteConfig(context = {}) {
    const onBack = context.onBackToStart || (() => {})

    return {
      component: StarrySkyScreen,
      events: {
        back: onBack,
      },
    }
  },
  resolveExtraRouteConfigs() {
    return []
  },
}

export default TestFeatureEntry
