/**
 * useCheckIn7.js - 七日连续签到逻辑
 */
import { ref, computed } from 'vue'
import {
  CHECKIN_ITEMS,
  PRIZE_POOL_7DAY,
  LEVEL_7DAY,
  drawFromPool,
  randomInt,
} from '../checkInItems.js'

const STORAGE_KEY = 'avg_llm_dormitory_checkin_7day_v1'

export function useCheckIn7() {
  const state = ref({
    streakDays: 0,
    lastSignInDate: null,
    todayChecked: false,
    todayReward: null,
    // 道具库存
    items: {
      energy_potion: 0,
      affection_boost: 0,
      theme_fragment: 0,
      free_ticket: 0,
      double_coin_card: 0,
      avatar_frame_exp: 0,
      avatar_frame_limited: 0,
    },
    themeFragments: 0, // 单独计数用于兑换
  })

  function load(worldBookId) {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      const bookState = all[worldBookId]
      if (bookState) {
        state.value = { ...state.value, ...bookState }
      }
    } catch (e) {
      console.warn('[useCheckIn7] load failed:', e)
    }
    checkTodayStatus()
  }

  function save(worldBookId) {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      all[worldBookId] = state.value
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    } catch (e) {
      console.warn('[useCheckIn7] save failed:', e)
    }
  }

  function checkTodayStatus() {
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)

    if (state.value.lastSignInDate !== todayStr) {
      // 检查是否断了连续
      if (state.value.lastSignInDate) {
        const last = new Date(state.value.lastSignInDate)
        const diff = Math.floor((today - last) / (1000 * 60 * 60 * 24))
        if (diff > 1) {
          // 断签，重置
          state.value.streakDays = 0
        }
      }
      state.value.todayChecked = false
      state.value.todayReward = null
    }
  }

  const currentLevel = computed(() => {
    const idx = Math.min(state.value.streakDays, LEVEL_7DAY.length - 1)
    return LEVEL_7DAY[idx]
  })

  const poolName = computed(() => currentLevel.value?.pool || 'copper')

  const progressDots = computed(() => {
    const dots = []
    for (let i = 0; i < LEVEL_7DAY.length; i++) {
      if (i < state.value.streakDays) {
        dots.push('done')
      } else if (i === state.value.streakDays && !state.value.todayChecked) {
        dots.push('current')
      } else if (i === state.value.streakDays && state.value.todayChecked) {
        dots.push('today-done')
      } else {
        dots.push('pending')
      }
    }
    return dots
  })

  const itemsList = computed(() => {
    const list = []
    for (const [id, count] of Object.entries(state.value.items)) {
      if (count > 0) {
        const info = CHECKIN_ITEMS[id]
        if (info) {
          list.push({ ...info, quantity: count })
        }
      }
    }
    // theme_fragment 特殊处理
    if (state.value.themeFragments > 0) {
      list.push({
        ...CHECKIN_ITEMS.theme_fragment,
        quantity: state.value.themeFragments,
      })
    }
    return list
  })

  function doSignIn() {
    if (state.value.todayChecked) return

    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)

    // 更新连续天数
    if (state.value.lastSignInDate) {
      const last = new Date(state.value.lastSignInDate)
      const diff = Math.floor((today - last) / (1000 * 60 * 60 * 24))
      if (diff === 1) {
        state.value.streakDays++
      } else if (diff > 1) {
        state.value.streakDays = 1
      }
    } else {
      state.value.streakDays = 1
    }

    state.value.streakDays = Math.min(state.value.streakDays, 7)

    const level = LEVEL_7DAY[state.value.streakDays - 1]
    const pool = PRIZE_POOL_7DAY[level.pool]

    // 基础金币
    const baseCoins = level.baseCoin

    // 抽奖
    const prize = drawFromPool(pool)
    let extraCoins = 0
    const newItems = []

    if (prize.type === 'coin') {
      extraCoins = randomInt(prize.min, prize.max)
    } else {
      state.value.items[prize.itemId] = (state.value.items[prize.itemId] || 0) + prize.quantity
      const item = CHECKIN_ITEMS[prize.itemId]
      newItems.push({
        id: prize.itemId,
        name: item.name,
        icon: item.icon,
        quantity: prize.quantity,
      })
    }

    state.value.lastSignInDate = todayStr
    state.value.todayChecked = true
    state.value.todayReward = {
      baseCoins,
      extraCoins,
      totalCoins: baseCoins + extraCoins,
      items: newItems,
      level: level.label,
      dayNum: state.value.streakDays,
    }

    save()
    return state.value.todayReward
  }

  function useItem(itemId, worldBookId) {
    if (!state.value.items[itemId] || state.value.items[itemId] <= 0) return false
    state.value.items[itemId]--
    save(worldBookId)
    return true
  }

  return {
    state,
    currentLevel,
    poolName,
    progressDots,
    itemsList,
    load,
    save,
    checkTodayStatus,
    doSignIn,
    useItem,
  }
}
