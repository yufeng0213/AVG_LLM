import ScrapbookScreen from './ScrapbookScreen.vue'

const ScrapbookFeatureEntry = {
  id: 'scrapbook',
  route: 'scrapbook',
  mount() {
    return { type: 'route', route: 'scrapbook' }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: ScrapbookScreen,
      events: { back: context.onBackToStart },
    }
  },
}

export default ScrapbookFeatureEntry
