import MobiusScreen from './MobiusScreen.vue'

export default {
  id: 'mobius-particle',
  route: 'mobius',
  mount() {
    return { type: 'route', route: 'mobius' }
  },
  resolveRouteConfig(context) {
    return {
      component: MobiusScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
  resolveExtraRouteConfigs() {
    return []
  },
}
