import TodoScreen from './TodoScreen.vue'

const TodoFeatureEntry = {
  id: 'todo',
  route: 'todo',
  mount() {
    return {
      type: 'route',
      route: 'todo',
    }
  },
  resolveRouteConfig(context = {}) {
    const onBack = context.onBackToStart || (() => {})

    return {
      component: TodoScreen,
      events: {
        back: onBack,
      },
    }
  },
}

export default TodoFeatureEntry
