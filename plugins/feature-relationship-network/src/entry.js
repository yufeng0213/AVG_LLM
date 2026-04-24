import RelationshipScreen from './RelationshipScreen.vue'

const RelationshipFeatureEntry = {
  id: 'relationship',
  route: 'relationship',
  mount() {
    return {
      type: 'route',
      route: 'relationship',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: RelationshipScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
  resolveExtraRouteConfigs(context = {}) {
    return []
  },
}

export default RelationshipFeatureEntry
