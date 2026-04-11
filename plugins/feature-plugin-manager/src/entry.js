import PluginManagerScreen from './PluginManagerScreen.vue'

const PluginManagerFeatureEntry = {
  id: 'plugin-manager',
  route: 'plugin-manager',
  mount() {
    return {
      type: 'route',
      route: 'plugin-manager',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: PluginManagerScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
}

export default PluginManagerFeatureEntry
