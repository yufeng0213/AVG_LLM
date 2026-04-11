import CardCollectionScreen from './CardCollectionScreen.vue'

const CardCollectionFeatureEntry = {
  id: 'card-collection',
  route: 'card-collection',
  mount() {
    return {
      type: 'route',
      route: 'card-collection',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: CardCollectionScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
}

export default CardCollectionFeatureEntry
