import BaseBuildingScreen from './BaseBuildingScreen.vue'

export default {
  id: 'base-building',
  route: 'base-building',
  resolveRouteConfig(context = {}) {
    const onBack = context.onBackToWorldBookShelf || context.onBackToStart || (() => {})
    const getWorldBookId = context.getActiveWorldBookId || (() => 'default_world_book')

    return {
      component: BaseBuildingScreen,
      props: {
        worldBookId: getWorldBookId(),
        onBack: onBack,
      },
      events: {
        back: onBack,
      },
    }
  },
}
