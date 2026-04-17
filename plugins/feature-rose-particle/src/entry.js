import RoseScreen from './RoseScreen.vue'

const RoseFeatureEntry = {
  id: 'rose-particle',
  route: 'rose',
  mount() {
    return {
      type: 'route',
      route: 'rose',
    }
  },
  resolveRouteConfig(context = {}) {
    const onBack = context.onBackToStart || (() => {})

    return {
      component: RoseScreen,
      events: {
        back: onBack,
      },
    }
  },
  resolveExtraRouteConfigs() {
    return []
  },
}

export default RoseFeatureEntry
