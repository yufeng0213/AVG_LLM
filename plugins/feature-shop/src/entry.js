import ShopScreen from './ShopScreen.vue'

const ShopFeatureEntry = {
  id: 'shop',
  route: 'shop',
  mount() {
    return {
      type: 'route',
      route: 'shop',
    }
  },
  resolveRouteConfig(context = {}) {
    const onBack = context.onBackToStart || (() => {})

    return {
      component: ShopScreen,
      events: {
        back: onBack,
      },
    }
  },
  resolveExtraRouteConfigs() {
    return []
  },
}

export default ShopFeatureEntry
