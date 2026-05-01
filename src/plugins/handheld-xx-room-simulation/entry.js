import RoomSimulationScreen from './index.vue'

const RoomSimulationFeatureEntry = {
  id: 'handheld-xx-room-simulation',
  route: 'room-simulation',
  mount() {
    return {
      type: 'route',
      route: 'room-simulation',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: RoomSimulationScreen,
      props: {
        autoOpen: true,
      },
      events: {
        back: context.onBackToStart,
      },
    }
  },
  resolveExtraRouteConfigs(context = {}) {
    return []
  },
}

export default RoomSimulationFeatureEntry
