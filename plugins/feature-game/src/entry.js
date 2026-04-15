import GameCenterScreen from './GameCenterScreen.vue'
import { useGlobalUser } from '../../../src/composables/useGlobalUser.js'

import { ref } from 'vue'

function clampInt(value, min, max) {
  const n = Math.floor(Number(value))
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

const GameFeatureEntry = {
  id: 'game',
  route: 'game-center',
  mount() {
    return {
      type: 'route',
      route: 'game-center',
    }
  },
  resolveRouteConfig(context = {}) {
    const onBack = context.onBackToStart || (() => {})
    const globalUser = useGlobalUser()

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

    // 游戏皮肤购买
    const handleSkinBuy = ({ cost }) => {
      globalUser.updateEconomy(prev => ({
        ...prev,
        coins: clampInt(prev.coins - cost, 0, 9999, prev.coins),
      }))
    }

    return {
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
    }
  },
  resolveExtraRouteConfigs() {
    return []
  },
}

export default GameFeatureEntry
