import { ref, computed } from 'vue'
import { kvStorage } from '../../../../src/storage/index.js'
import { CHARACTER_CARD_DEFS } from '../services/cardData.js'

const POOL_STORAGE_KEY = 'avg_llm_character_card_pool_v1'
const HISTORY_STORAGE_KEY = 'avg_llm_character_card_pool_history_v1'

// 卡池基础概率
const BASE_RATES = { N: 40, R: 35, SR: 18, SSR: 5.5, UR: 1.5 }

// 抽卡消耗（钻石）
const PULL_COST = 160
const PULL_10_COST = 1440 // 10连9折

// 保底参数
const PITY_COUNTER_MAX = 60 // 60抽保底
const PITY_GUARANTEED_RARITY = 'SSR' // 保底给SSR及以上

export function useCardPool(options = {}) {
  const { getCrystals = () => 0, updateCrystals = () => {} } = options

  const poolCards = ref([])
  const pullCount = ref(0)
  const pityGuaranteed = ref(false)
  const loaded = ref(false)
  const pullHistory = ref([])

  async function load() {
    try {
      const saved = await kvStorage.get(POOL_STORAGE_KEY)
      if (saved && typeof saved === 'object') {
        pullCount.value = saved.pullCount || 0
        pityGuaranteed.value = saved.pityGuaranteed || false
      }
    } catch { /* ignore */ }

    try {
      const hist = await kvStorage.get(HISTORY_STORAGE_KEY)
      pullHistory.value = Array.isArray(hist) ? hist.slice(-100) : []
    } catch { /* ignore */ }

    poolCards.value = CHARACTER_CARD_DEFS.filter(c => c.obtainMethod === 'gacha')
    loaded.value = true
  }

  async function savePoolState() {
    await kvStorage.set(POOL_STORAGE_KEY, {
      pullCount: pullCount.value,
      pityGuaranteed: pityGuaranteed.value,
    })
  }

  async function saveHistory() {
    await kvStorage.set(HISTORY_STORAGE_KEY, pullHistory.value.slice(-100))
  }

  function weightedPull() {
    let rarity
    if (pityGuaranteed.value) {
      rarity = 'SSR'
    } else {
      rarity = rollRarity()
    }

    const candidates = poolCards.value.filter(c => c.rarity === rarity)
    if (candidates.length === 0) {
      return poolCards.value[Math.floor(Math.random() * poolCards.value.length)]
    }
    return candidates[Math.floor(Math.random() * candidates.length)]
  }

  function rollRarity() {
    const counter = pullCount.value

    if (counter >= PITY_COUNTER_MAX) {
      return PITY_GUARANTEED_RARITY
    }

    let ssrRate = BASE_RATES.SSR
    if (counter > 10) {
      ssrRate += Math.min(50, (counter - 10) * 2)
    }

    let urRate = BASE_RATES.UR
    if (counter > 30) {
      urRate += Math.min(10, (counter - 30) * 0.5)
    }

    const rates = {
      N: BASE_RATES.N,
      R: BASE_RATES.R,
      SR: BASE_RATES.SR,
      SSR: ssrRate,
      UR: urRate,
    }

    const total = Object.values(rates).reduce((a, b) => a + b, 0)
    let random = Math.random() * total

    for (const r of ['UR', 'SSR', 'SR', 'R', 'N']) {
      random -= rates[r]
      if (random <= 0) return r
    }

    return 'N'
  }

  /**
   * 单次抽卡
   * 返回 { success, results: [{ cardDef, isPity }], costDeducted }
   */
  async function pullSingle() {
    const crystals = getCrystals()
    if (crystals < PULL_COST) {
      return { success: false, error: `钻石不足（需要${PULL_COST}）` }
    }

    updateCrystals(crystals - PULL_COST)

    pullCount.value += 1
    const isPity = pullCount.value >= PITY_COUNTER_MAX

    const cardDef = weightedPull()

    if (isPity || (cardDef.rarity === 'SSR' || cardDef.rarity === 'UR')) {
      pityGuaranteed.value = false
      pullCount.value = 0
    }

    pullHistory.value.push({
      cardId: cardDef.id,
      rarity: cardDef.rarity,
      timestamp: Date.now(),
      isPity,
    })
    await Promise.all([savePoolState(), saveHistory()])

    return { success: true, results: [{ cardDef, isPity }], costDeducted: PULL_COST }
  }

  /**
   * 10连抽
   */
  async function pullTen() {
    const crystals = getCrystals()
    if (crystals < PULL_10_COST) {
      return { success: false, error: `钻石不足（需要${PULL_10_COST}）` }
    }

    updateCrystals(crystals - PULL_10_COST)

    const results = []
    for (let i = 0; i < 10; i++) {
      pullCount.value += 1
      const isPity = pullCount.value >= PITY_COUNTER_MAX

      const cardDef = weightedPull()

      if (isPity || (cardDef.rarity === 'SSR' || cardDef.rarity === 'UR')) {
        pityGuaranteed.value = false
        pullCount.value = 0
      }

      results.push({ cardDef, isPity })

      pullHistory.value.push({
        cardId: cardDef.id,
        rarity: cardDef.rarity,
        timestamp: Date.now(),
        isPity,
      })
    }

    await Promise.all([savePoolState(), saveHistory()])

    return { success: true, results, costDeducted: PULL_10_COST }
  }

  async function resetPity() {
    pullCount.value = 0
    pityGuaranteed.value = false
    await savePoolState()
  }

  async function clearHistory() {
    pullHistory.value = []
    await saveHistory()
  }

  const canAffordSingle = computed(() => getCrystals() >= PULL_COST)
  const canAffordTen = computed(() => getCrystals() >= PULL_10_COST)
  const pityProgress = computed(() => Math.min(100, (pullCount.value / PITY_COUNTER_MAX) * 100))
  const remainingToPity = computed(() => Math.max(0, PITY_COUNTER_MAX - pullCount.value))

  return {
    poolCards,
    pullCount,
    pityGuaranteed,
    pullHistory,
    loaded,
    load,
    pullSingle,
    pullTen,
    resetPity,
    clearHistory,
    canAffordSingle,
    canAffordTen,
    pityProgress,
    remainingToPity,
    PULL_COST,
    PULL_10_COST,
  }
}
