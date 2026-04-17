import PronunciationScreen from './PronunciationScreen.vue'

const PronunciationFeatureEntry = {
  id: 'pronunciation',
  route: 'pronunciation',
  mount() {
    return {
      type: 'route',
      route: 'pronunciation',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: PronunciationScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
}

export default PronunciationFeatureEntry
