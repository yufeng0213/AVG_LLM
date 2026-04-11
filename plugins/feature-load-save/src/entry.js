import SaveLoadScreen from './SaveLoadScreen.vue'

const LoadSaveFeatureEntry = {
  id: 'load-save',
  route: 'save-load',
  mount() {
    return {
      type: 'route',
      route: 'save-load',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: SaveLoadScreen,
      events: {
        back: context.onBackToStart,
        'load-save': context.onLoadSave,
        'load-backup': context.onLoadBackup,
      },
    }
  },
}

export default LoadSaveFeatureEntry
