import MascotScreen from './MascotScreen.vue'

console.log('[Mascot] entry.js loaded')

const MascotFeatureEntry = {
  id: 'feature-mascot',
  route: 'mascot',
  mount() {
    return {
      type: 'route',
      route: 'mascot',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: MascotScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
  resolveExtraRouteConfigs(context = {}) {
    return []
  },
}

export default MascotFeatureEntry
