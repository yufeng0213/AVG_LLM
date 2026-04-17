import ReaderScreen from './ReaderScreen.vue'

const ReaderFeatureEntry = {
  id: 'reader',
  route: 'reader',
  mount() {
    return {
      type: 'route',
      route: 'reader',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: ReaderScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
}

export default ReaderFeatureEntry
