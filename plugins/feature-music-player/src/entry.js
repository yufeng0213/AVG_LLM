import MusicPlayerScreen from './MusicPlayerScreen.vue'

const MusicPlayerFeatureEntry = {
  id: 'music-player',
  route: 'music-player',
  mount() {
    return { type: 'route', route: 'music-player' }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: MusicPlayerScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
}

export default MusicPlayerFeatureEntry
