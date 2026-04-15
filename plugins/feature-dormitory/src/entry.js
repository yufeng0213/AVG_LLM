import DormitoryScreen from './DormitoryScreen.vue'
import GameCenterScreen from './GameCenterScreen.vue'
import ShopScreen from './ShopScreen.vue'
import TaskBoardScreen from './TaskBoardScreen.vue'
import TRPGScreen from './TRPGScreen.vue'
import TeamSelectScreen from './TeamSelectScreen.vue'
import BattleRouteScreen from './BattleRouteScreen.vue'
import PhoneScreen from './PhoneScreen.vue'
import { useGlobalUser } from './composables/useGlobalUser.js'
import { useGlobalTaskBoard } from './composables/useGlobalTaskBoard.js'

import { ref } from 'vue'

// 战斗路由间传递 taskId 的桥梁
const pendingBattleTaskId = ref('')
const pendingBattleWorldBook = ref({})
const pendingBattleSelectedCharacters = ref([])

function clampInt(value, min, max) {
  const n = Math.floor(Number(value))
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

const DormitoryFeatureEntry = {
  id: 'dormitory',
  route: 'dormitory',
  mount() {
    return {
      type: 'route',
      route: 'dormitory',
    }
  },
  resolveRouteConfig(context = {}) {
    return {
      component: DormitoryScreen,
      events: {
        back: context.onBackToStart,
      },
    }
  },
  resolveExtraRouteConfigs(context = {}) {
    const onBack = context.onBackToStart || (() => {})
    const globalUser = useGlobalUser()
    const globalTaskBoard = useGlobalTaskBoard()

    // 金币增减处理
    const updateCoins = (data) => {
      if (!data) return
      const net = (data.net != null) ? data.net : ((data.earned || 0) - (data.cost || 0))
      if (net !== 0) {
        globalUser.updateEconomy(prev => ({
          ...prev,
          coins: clampInt(prev.coins + net, 0, 9999, prev.coins),
        }))
      }
    }

    // 背包增减处理
    const addToInventory = (item) => {
      if (item) globalUser.addToInventory(item)
    }
    const removeFromInventory = (itemId) => {
      globalUser.removeFromInventory(itemId, 1)
    }

    // 游戏皮肤购买
    const handleSkinBuy = ({ cost }) => {
      globalUser.updateEconomy(prev => ({
        ...prev,
        coins: clampInt(prev.coins - cost, 0, 9999, prev.coins),
      }))
    }

    // task-board 需要 onNavigate 上下文，但 events 函数被无参调用
    // 所以在 resolveExtraRouteConfigs 阶段捕获 navigate 回调
    const navigate = context.onNavigate || (() => {})

    return [
      {
        route: 'game-center',
        component: GameCenterScreen,
        props: () => {
          const { economy, inventory } = useGlobalUser()
          return {
            coins: economy.value?.coins ?? 0,
            inventory: inventory.value ?? [],
          }
        },
        events: {
          back: onBack,
          // 金币结果事件
          'spin-result': updateCoins,
          'pachinko-result': updateCoins,
          'dograce-result': updateCoins,
          'farm-harvest': updateCoins,
          'kitchen-result': updateCoins,
          'xylophone-result': updateCoins,
          'harmonica-result': updateCoins,
          'match3-result': updateCoins,
          // 扭蛋结果（获得物品）
          'gacha-result': (data) => {
            if (!data) return
            if (data.type === 'pull' && data.prize) {
              addToInventory({
                id: `gacha_${Date.now()}`,
                ...data.prize,
              })
            } else if (data.type === 'synthesis' && data.item) {
              addToInventory(data.item)
            } else if (data.type === 'multi' && data.results) {
              data.results.forEach(r => {
                if (r.prize) {
                  addToInventory({
                    id: `gacha_multi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    ...r.prize,
                  })
                }
              })
            }
          },
          // 厨房产出/消耗
          'kitchen-produce': (data) => {
            if (data) addToInventory(data)
          },
          'kitchen-consume': (data) => {
            if (data?.materialKey) {
              // 从背包中移除对应的农场材料
              const inv = globalUser.inventory.value
              const item = inv.find(i => i.id && i.id.includes(data.materialKey))
              if (item) globalUser.removeFromInventory(item.id, 1)
            }
          },
          // 皮肤购买
          'game-skin-buy': handleSkinBuy,
        },
      },
      {
        route: 'shop',
        component: ShopScreen,
        props: () => {
          const { economy, inventory } = useGlobalUser()
          return {
            coins: economy.value?.coins ?? 0,
            crystals: economy.value?.crystals ?? 0,
            inventory: inventory.value ?? [],
          }
        },
        events: {
          back: onBack,
        },
      },
      {
        route: 'task-board',
        component: TaskBoardScreen,
        events: {
          back: onBack,
          'open-battle': (taskId) => {
            pendingBattleTaskId.value = taskId
            navigate('team-select')
          },
        },
      },
      {
        route: 'trpg',
        component: TRPGScreen,
        events: {
          back: onBack,
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
            // 将选好的世界书和队友存起来，供 battle 路由使用
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
        route: 'phone',
        component: PhoneScreen,
        events: {
          back: onBack,
        },
      },
    ]
  },
}

export default DormitoryFeatureEntry
