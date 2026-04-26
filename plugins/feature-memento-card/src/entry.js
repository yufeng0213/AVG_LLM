import MementoCardScreen from './MementoCardScreen.vue'

const MementoCardFeatureEntry = {
  id: 'memento-card',
  route: 'memento-card',
  mount() {
    return {
      type: 'route',
      route: 'memento-card',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: MementoCardScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
}

export default MementoCardFeatureEntry
