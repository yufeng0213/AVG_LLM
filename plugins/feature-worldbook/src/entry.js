import WorldBookEditorScreen from './WorldBookEditorScreen.vue'
import WorldBookScreen from './WorldBookScreen.vue'

const WorldbookFeatureEntry = {
  id: 'worldbook',
  route: 'worldbook-shelf',
  mount() {
    return {
      type: 'route',
      route: 'worldbook-shelf',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: WorldBookScreen,
      events: {
        back: context.onBackToStart,
        'open-book': context.onOpenWorldBookEditor,
      },
    }
  },
  resolveExtraRouteConfigs(context = {}) {
    return [
      {
        route: 'worldbook-editor',
        component: WorldBookEditorScreen,
        props: () => ({
          bookId: typeof context.getActiveWorldBookId === 'function'
            ? context.getActiveWorldBookId()
            : 'default_world_book',
        }),
        events: {
          back: context.onBackToWorldBookShelf,
        },
      },
    ]
  },
}

export default WorldbookFeatureEntry
