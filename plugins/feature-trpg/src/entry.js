import TRPGScreen from './TRPGScreen.vue'

const TRPGFeatureEntry = {
  id: 'trpg',
  route: 'trpg',
  mount() {
    return {
      type: 'route',
      route: 'trpg',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: TRPGScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
}

export default TRPGFeatureEntry
