import { ref, computed } from 'vue'
import { kvStorage } from '../../../../src/storage/index.js'
import { getCardDef, getRarityConfig, CHARACTER_CARD_DEFS } from '../services/cardData.js'
import { getActiveWorldBookId } from '../../../../src/worldbook/worldBookStore.js'

function generateInstanceId() {
  return `card_instance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function createPlayerCard(cardId) {
  const def = getCardDef(cardId)
  if (!def) return null

  return {
    cardId,
    instanceId: generateInstanceId(),
    level: 1,
    exp: 0,
    stars: 1,
    affinity: 0,
    storiesUnlocked: [],
    obtainedAt: Date.now(),
  }
}

/**
 * 卡牌收藏管理
 * 自动使用全局世界书 ID
 */
export function useCardCollection(worldBookIdOverride = null) {
  const cards = ref([])
  const loaded = ref(false)
  const currentWorldBookId = ref('default_world_book')

  // 获取实际的 worldBookId
  async function resolveWorldBookId() {
    if (worldBookIdOverride) {
      currentWorldBookId.value = worldBookIdOverride
      return worldBookIdOverride
    }

    // 尝试从全局状态获取
    try {
      const id = await getActiveWorldBookId()
      console.log('[useCardCollection] getActiveWorldBookId:', id)
      if (id) {
        currentWorldBookId.value = id
        return id
      }
    } catch (e) {
      console.log('[useCardCollection] getActiveWorldBookId 失败:', e.message)
    }

    // 尝试从全局 API 获取
    const apiId = window.__avgLLM?.activity?.getWorldBookId?.()
    if (apiId) {
      currentWorldBookId.value = apiId
      return apiId
    }

    return 'default_world_book'
  }

  async function load() {
    // 先获取正确的 worldBookId
    await resolveWorldBookId()

    const STORAGE_KEY = `character_card_collection_v1_${currentWorldBookId.value}`
    console.log('[useCardCollection] load() - STORAGE_KEY:', STORAGE_KEY)

    try {
      const saved = await kvStorage.get(STORAGE_KEY)
      console.log(`[useCardCollection] saved:`, saved)
      cards.value = Array.isArray(saved) ? saved : []
      console.log(`[useCardCollection] 加载卡牌收藏 (worldBookId: ${currentWorldBookId.value}):`, cards.value.length, '张')
    } catch (e) {
      console.error('[useCardCollection] load() error:', e)
      cards.value = []
    }
    loaded.value = true
  }

  async function save() {
    const STORAGE_KEY = `character_card_collection_v1_${currentWorldBookId.value}`
    try {
      await kvStorage.set(STORAGE_KEY, JSON.parse(JSON.stringify(cards.value)))
    } catch (e) {
      console.error('[useCardCollection] Failed to save collection:', e)
    }
  }

  /**
   * 添加卡牌（抽卡/获得）
   */
  async function addCard(cardId) {
    const def = getCardDef(cardId)
    if (!def) return { success: false, error: '卡牌定义不存在' }

    const playerCard = createPlayerCard(cardId)
    if (!playerCard) return { success: false, error: '创建卡牌实例失败' }

    cards.value.push(playerCard)
    await save()

    return { success: true, card: playerCard, def }
  }

  /**
   * 删除卡牌
   */
  async function removeCard(instanceId) {
    const index = cards.value.findIndex(c => c.instanceId === instanceId)
    if (index < 0) return { success: false, error: '卡牌不存在' }

    cards.value.splice(index, 1)
    await save()
    return { success: true }
  }

  /**
   * 升级卡牌
   */
  async function levelUp(instanceId, expAmount) {
    const card = cards.value.find(c => c.instanceId === instanceId)
    if (!card) return { success: false, error: '卡牌不存在' }

    const def = getCardDef(card.cardId)
    const rarityCfg = getRarityConfig(def?.rarity)
    if (!def || !rarityCfg) return { success: false, error: '卡牌数据异常' }

    card.exp += expAmount
    // 简单升级逻辑：每100exp升1级
    const neededPerLevel = 100
    while (card.exp >= neededPerLevel && card.level < rarityCfg.maxLevel) {
      card.exp -= neededPerLevel
      card.level += 1
    }

    await save()
    return { success: true, card, leveledUp: card.level > 1 }
  }

  /**
   * 增加好感度
   */
  async function addAffinity(instanceId, amount) {
    const card = cards.value.find(c => c.instanceId === instanceId)
    if (!card) return { success: false, error: '卡牌不存在' }

    card.affinity = Math.min(200, card.affinity + amount)

    // 检查是否有新剧情解锁
    const def = getCardDef(card.cardId)
    if (def) {
      def.cardStories.forEach(story => {
        if (card.affinity >= (story.unlockCondition?.affinity || 0)) {
          if (!card.storiesUnlocked.includes(story.id)) {
            card.storiesUnlocked.push(story.id)
          }
        }
      })
    }

    await save()
    return { success: true, card }
  }

  /**
   * 进阶（升星）- 需要消耗相同卡牌
   */
  async function evolve(instanceId) {
    const card = cards.value.find(c => c.instanceId === instanceId)
    if (!card) return { success: false, error: '卡牌不存在' }

    const def = getCardDef(card.cardId)
    const rarityCfg = getRarityConfig(def?.rarity)
    if (!def || !rarityCfg) return { success: false, error: '卡牌数据异常' }

    if (card.stars >= rarityCfg.maxStar) {
      return { success: false, error: '已达最高星级' }
    }

    // 计算需要的相同卡牌数量（当前星级 * 3）
    const requiredCount = card.stars * 3

    // 查找所有相同卡牌（相同 cardId）
    const sameCards = cards.value.filter(c => c.cardId === card.cardId)
    if (sameCards.length < requiredCount + 1) { // +1 因为升阶的这张也要保留
      return { success: false, error: `需要${requiredCount}张相同卡牌进行升阶（当前拥有${sameCards.length}张）` }
    }

    // 移除被消耗的卡牌（排除正在升阶的那张）
    const toRemove = sameCards
      .filter(c => c.instanceId !== instanceId)
      .slice(0, requiredCount)

    toRemove.forEach(c => {
      const idx = cards.value.findIndex(card => card.instanceId === c.instanceId)
      if (idx >= 0) cards.value.splice(idx, 1)
    })

    // 升阶
    card.stars += 1
    await save()

    return { success: true, card, consumed: toRemove.length }
  }

  // ===== 计算属性 =====

  /**
   * 总卡牌数
   */
  const totalCards = computed(() => cards.value.length)

  /**
   * 按稀有度分组
   */
  const cardsByRarity = computed(() => {
    const groups = {}
    cards.value.forEach(card => {
      const def = getCardDef(card.cardId)
      if (!def) return
      const rarity = def.rarity
      if (!groups[rarity]) groups[rarity] = []
      groups[rarity].push({ ...card, def })
    })
    // 按稀有度排序
    return Object.entries(groups)
      .sort((a, b) => getRarityConfig(b[0]).order - getRarityConfig(a[0]).order)
      .reduce((acc, [rarity, list]) => {
        acc[rarity] = list.sort((a, b) => b.def.baseStats.attack - a.def.baseStats.attack)
        return acc
      }, {})
  })

  /**
   * 按角色分组
   */
  const cardsByCharacter = computed(() => {
    const groups = {}
    cards.value.forEach(card => {
      const def = getCardDef(card.cardId)
      if (!def) return
      const charName = def.characterName
      if (!groups[charName]) groups[charName] = { name: charName, characterId: def.characterId, cards: [] }
      groups[charName].cards.push({ ...card, def })
    })
    return Object.values(groups).map(g => ({
      ...g,
      cards: g.cards.sort((a, b) => getRarityConfig(b.def.rarity).order - getRarityConfig(a.def.rarity).order),
    }))
  })

  /**
   * 卡牌详情
   */
  function getCardDetail(instanceId) {
    const card = cards.value.find(c => c.instanceId === instanceId)
    if (!card) return null
    const def = getCardDef(card.cardId)
    if (!def) return null

    const rarityCfg = getRarityConfig(def.rarity)
    const levelBonus = (card.level - 1) * 0.05 // 每级+5%
    const starBonus = (card.stars - 1) * 0.1   // 每星+10%
    const totalBonus = 1 + levelBonus + starBonus

    const stats = {
      attack: Math.round(def.baseStats.attack * totalBonus),
      defense: Math.round(def.baseStats.defense * totalBonus),
      charm: Math.round(def.baseStats.charm * totalBonus),
      luck: Math.round(def.baseStats.luck * totalBonus),
    }

    return { card, def, rarityCfg, stats }
  }

  /**
   * 测试：获取所有未拥有的卡牌
   */
  function getUnownedCards() {
    const ownedIds = new Set(cards.value.map(c => c.cardId))
    return CHARACTER_CARD_DEFS.filter(d => !ownedIds.has(d.id))
  }

  return {
    cards,
    loaded,
    load,
    save,
    addCard,
    removeCard,
    levelUp,
    addAffinity,
    evolve,
    totalCards,
    cardsByRarity,
    cardsByCharacter,
    getCardDetail,
    getUnownedCards,
  }
}
