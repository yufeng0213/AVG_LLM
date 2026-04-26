import TaskBoardScreen from './TaskBoardScreen.vue'
import TaskExecutionScreen from './TaskExecutionScreen.vue'
import TeamSelectScreen from './battle/TeamSelectScreen.vue'
import BattleRouteScreen from './battle/BattleRouteScreen.vue'
import CollectRouteScreen from './collect/CollectRouteScreen.vue'
import PuzzleRouteScreen from './puzzle/PuzzleRouteScreen.vue'
import ClueRouteScreen from './social/ClueRouteScreen.vue'
import { ref } from 'vue'
import { useGlobalTaskBoard } from './composables/useGlobalTaskBoard.js'

// 战斗路由间传递 taskId 的桥梁
const pendingBattleTaskId = ref('')
const pendingBattleWorldBook = ref({})
const pendingBattleSelectedCharacters = ref([])

// 采集路由间传递 taskId 的桥梁
const pendingCollectTaskId = ref('')
const pendingCollectWorldBook = ref({})

// 解谜路由间传递 taskId 的桥梁
const pendingPuzzleTaskId = ref('')
const pendingPuzzleWorldBook = ref({})
const pendingPuzzleTask = ref({})

// 线索收集路由间传递 taskId 的桥梁
const pendingClueTaskId = ref('')
const pendingClueWorldBook = ref({})
const pendingClueTask = ref({})

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
        'open-collect': (taskId) => {
          pendingCollectTaskId.value = taskId
          navigate('collect')
        },
        'open-puzzle': (taskData) => {
          pendingPuzzleTaskId.value = taskData?.taskId || ''
          pendingPuzzleWorldBook.value = taskData?.worldBook || {}
          pendingPuzzleTask.value = taskData?.task || {}
          navigate('puzzle')
        },
        'open-clue': (taskData) => {
          pendingClueTaskId.value = taskData?.taskId || ''
          pendingClueWorldBook.value = taskData?.worldBook || {}
          pendingClueTask.value = taskData?.task || {}
          navigate('clue')
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
      {
        route: 'collect',
        component: CollectRouteScreen,
        props: () => ({
          taskId: pendingCollectTaskId.value || '',
          worldBook: pendingCollectWorldBook.value || {},
          userProfile: {},
        }),
        events: {
          back: () => navigate('task-board'),
          'collect-success': (data) => {
            const taskId = data?.taskId
            if (taskId) globalTaskBoard.handleCollectSuccess(taskId)
            navigate('task-board')
          },
          'collect-fail': (data) => {
            const taskId = data?.taskId
            if (taskId) globalTaskBoard.handleCollectFail(taskId)
            navigate('task-board')
          },
        },
      },
      {
        route: 'puzzle',
        component: PuzzleRouteScreen,
        props: () => ({
          taskId: pendingPuzzleTaskId.value || '',
          worldBook: pendingPuzzleWorldBook.value || {},
          task: pendingPuzzleTask.value || {},
        }),
        events: {
          back: () => navigate('task-board'),
          'puzzle-success': (data) => {
            const taskId = data?.taskId
            if (taskId) globalTaskBoard.handlePuzzleSuccess(taskId, data?.reasoningPoints || 0)
            navigate('task-board')
          },
          'puzzle-fail': (data) => {
            const taskId = data?.taskId
            if (taskId) globalTaskBoard.handlePuzzleFail(taskId)
            navigate('task-board')
          },
        },
      },
      {
        route: 'clue',
        component: ClueRouteScreen,
        props: () => ({
          taskId: pendingClueTaskId.value || '',
          worldBook: pendingClueWorldBook.value || {},
          task: pendingClueTask.value || {},
        }),
        events: {
          back: () => navigate('task-board'),
          'clue-success': (data) => {
            const taskId = data?.taskId
            if (taskId) globalTaskBoard.handleClueSuccess(taskId, data?.score || 0)
            navigate('task-board')
          },
          'clue-fail': (data) => {
            const taskId = data?.taskId
            if (taskId) globalTaskBoard.handleClueFail(taskId)
            navigate('task-board')
          },
        },
      },
    ]
  },
}

export default TaskFeatureEntry
