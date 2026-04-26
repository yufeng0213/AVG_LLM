import CharacterCardScreen from './CharacterCardScreen.vue'

const CharacterCardFeatureEntry = {
  id: 'character-card',
  route: 'character-card',
  mount() {
    return {
      type: 'route',
      route: 'character-card',
    }
  },
  resolveRouteConfig(context = {}) {
    const worldBookId = context.getActiveWorldBookId?.() || 'default_world_book'
    console.log('[CharacterCardEntry] resolveRouteConfig - worldBookId:', worldBookId, 'context:', context)
    return {
      component: CharacterCardScreen,
      props: {
        worldBookId: worldBookId,
      },
      events: {
        back: context.onBackToStart,
      },
    }
  },
}

export default CharacterCardFeatureEntry
