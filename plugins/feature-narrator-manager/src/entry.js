import NarratorManagerScreen from './NarratorManagerScreen.vue'

const NarratorManagerFeatureEntry = {
  id: 'narrator-manager',
  route: 'narrator-manager',
  mount() {
    return {
      type: 'route',
      route: 'narrator-manager',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: NarratorManagerScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
}

export default NarratorManagerFeatureEntry
