import PhoneScreen from './PhoneScreen.vue'

const PhoneFeatureEntry = {
  id: 'phone',
  route: 'phone',
  mount() {
    return {
      type: 'route',
      route: 'phone',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: PhoneScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
}

export default PhoneFeatureEntry
