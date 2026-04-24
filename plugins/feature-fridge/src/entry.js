import FridgeScreen from './FridgeScreen.vue'

const FridgeFeatureEntry = {
  id: 'fridge',
  route: 'fridge',
  mount() {
    return {
      type: 'route',
      route: 'fridge',
    }
  },
  resolveRouteConfig(context = {}) {
    const onBack = context.onBackToStart || (() => {})

    return {
      component: FridgeScreen,
      events: {
        back: onBack,
      },
    }
  },
}

export default FridgeFeatureEntry
