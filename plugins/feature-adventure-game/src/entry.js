import AdventureGameScreen from './AdventureGameScreen.vue'

const AdventureGameFeatureEntry = {
  id: 'adventure-game',
  route: 'adventure-game',
  mount() {
    return {
      type: 'route',
      route: 'adventure-game',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: AdventureGameScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
}

export default AdventureGameFeatureEntry
