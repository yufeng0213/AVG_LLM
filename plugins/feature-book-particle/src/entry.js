import BookScreen from './BookScreen.vue'

const BookFeatureEntry = {
  id: 'book-particle',
  route: 'book',
  mount() {
    return {
      type: 'route',
      route: 'book',
    }
  },
  resolveRouteConfig(context = {}) {
    const onBack = context.onBackToStart || (() => {})

    return {
      component: BookScreen,
      events: {
        back: onBack,
      },
    }
  },
  resolveExtraRouteConfigs() {
    return []
  },
}

export default BookFeatureEntry
