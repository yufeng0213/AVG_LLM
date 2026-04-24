import WorldMemoryScreen from './WorldMemoryScreen.vue'

const WorldMemoryFeatureEntry = {
  id: 'world-memory',
  route: 'world-memory',
  mount() {
    return {
      type: 'route',
      route: 'world_memory',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: WorldMemoryScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
  resolveExtraRouteConfigs(context = {}) {
    return []
  },
}

export default WorldMemoryFeatureEntry
