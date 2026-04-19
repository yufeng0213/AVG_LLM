import HourglassScreen from './HourglassScreen.vue'

const HourglassFeatureEntry = {
  id: 'hourglass',
  route: 'hourglass',
  mount() {
    return {
      type: 'route',
      route: 'hourglass',
    }
  },
  resolveRouteConfig(context = {}) {
    const onBack = context.onBackToStart || (() => {})

    return {
      component: HourglassScreen,
      events: {
        back: onBack,
      },
    }
  },
  resolveExtraRouteConfigs() {
    return []
  },
}

export default HourglassFeatureEntry
