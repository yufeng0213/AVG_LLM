import TaskBoardScreen from './TaskBoardScreen.vue'
import TaskExecutionScreen from './TaskExecutionScreen.vue'
import TeamSelectScreen from './TeamSelectScreen.vue'
import BattleRouteScreen from './BattleRouteScreen.vue'
import { ref } from 'vue'
import { useGlobalTaskBoard } from './composables/useGlobalTaskBoard.js'

// 战斗路由间传递 taskId 的桥梁
const pendingBattleTaskId = ref('')
const pendingBattleWorldBook = ref({})
const pendingBattleSelectedCharacters = ref([])

const TaskFeatureEntry = {
  id: 'task',
  route: 'task-board',
  mount() {
    return {
      type: 'route',
      route: 'task-board',
    }
  },
  resolveRouteConfig(context = {}) {
    const onBack = context.onBackToStart || (() => {})
    const navigate = context.onNavigate || (() => {})
    const globalTaskBoard = useGlobalTaskBoard()

    return {
      component: TaskBoardScreen,
      events: {
        back: onBack,
        'open-battle': (taskId) => {
          pendingBattleTaskId.value = taskId
          navigate('team-select')
        },
      },
    }
  },
  resolveExtraRouteConfigs(context = {}) {
    const onBack = context.onBackToStart || (() => {})
    const navigate = context.onNavigate || (() => {})
    const globalTaskBoard = useGlobalTaskBoard()

    return [
      {
        route: 'task-execution',
        component: TaskExecutionScreen,
        events: {
          back: () => navigate('task-board'),
          complete: (data) => {
            const taskId = data?.taskId
            if (taskId) globalTaskBoard.handleBattleVictory(taskId)
            navigate('task-board')
          },
        },
      },
      {
        route: 'team-select',
        component: TeamSelectScreen,
        props: () => ({
          taskId: pendingBattleTaskId.value || '',
        }),
        events: {
          back: () => navigate('task-board'),
          'start-battle': ({ worldBook, selectedCharacters }) => {
            pendingBattleWorldBook.value = worldBook
            pendingBattleSelectedCharacters.value = selectedCharacters
            navigate('battle')
          },
        },
      },
      {
        route: 'battle',
        component: BattleRouteScreen,
        props: () => ({
          taskId: pendingBattleTaskId.value || '',
          boardId: '',
          worldBook: pendingBattleWorldBook.value || {},
          selectedCharacters: pendingBattleSelectedCharacters.value || [],
          userProfile: {},
        }),
        events: {
          back: () => navigate('task-board'),
          'battle-victory': (data) => {
            const taskId = data?.taskId
            if (taskId) globalTaskBoard.handleBattleVictory(taskId)
            navigate('task-board')
          },
          'battle-defeat': (data) => {
            const taskId = data?.taskId
            if (taskId) globalTaskBoard.handleBattleDefeat(taskId)
            navigate('task-board')
          },
        },
      },
    ]
  },
}

export default TaskFeatureEntry
