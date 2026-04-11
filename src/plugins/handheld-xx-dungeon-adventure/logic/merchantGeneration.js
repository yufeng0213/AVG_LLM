import { generateLocalMerchantItemsByPool } from './merchantItems.js'

const getSlotLabel = (slot) => {
  if (slot === 'weapon') return '武器'
  if (slot === 'armor') return '护甲'
  return '饰品'
}

const resolvePlayerLevelByTeammates = (teammates) => {
  const list = Array.isArray(teammates) ? teammates : []
  const teammateLevels = list
    .filter((item) => item && item.hp > 0)
    .map((item) => Math.max(1, Number(item.level) || 1))
  if (teammateLevels.length <= 0) return 1
  const sum = teammateLevels.reduce((acc, value) => acc + value, 0)
  return Math.max(1, Math.floor(sum / teammateLevels.length))
}

const normalizeLlmMerchantItems = (rawList, options = {}) => {
  const {
    makeId = null,
    normalizeMerchantItem = null,
  } = options || {}

  if (!Array.isArray(rawList) || rawList.length === 0) return []
  if (typeof normalizeMerchantItem !== 'function') return []

  return rawList
    .map((item, index) => normalizeMerchantItem({
      id: typeof makeId === 'function' ? makeId('mi') : `mi-${Date.now()}-${index}`,
      name: item?.name,
      rarity: item?.rarity,
      slot: item?.slot,
      atk: item?.atk,
      def: item?.def,
      hp: item?.hp,
      price: item?.price,
      desc: item?.desc || `来自流浪商人的${getSlotLabel(item?.slot)}`,
      spriteSpec: item?.spriteSpec,
    }, index))
    .filter(Boolean)
}

export const generateMerchantItemsWithFallback = async (options = {}) => {
  const {
    floor = 1,
    teammates = [],
    equipmentPity = 0,
    maxItems = 6,
    equipmentPool = {},
    rollEquipmentRarity = null,
    pickRandomItem = null,
    makeId = null,
    rarityValue = null,
    normalizeMerchantItem = null,
    loadWorldSnapshot = null,
    requestLlmMerchantItems = null,
    logger = console,
  } = options || {}

  let usedLLM = false
  let items = []

  try {
    if (typeof requestLlmMerchantItems === 'function') {
      logger.log('[xx-dungeon] 开始调用LLM生成商人商品...')
      const worldSnapshot = typeof loadWorldSnapshot === 'function'
        ? await loadWorldSnapshot()
        : { worldTitle: '', worldSummary: '' }
      const playerLevel = resolvePlayerLevelByTeammates(teammates)

      logger.log('[xx-dungeon] LLM参数:', {
        worldTitle: worldSnapshot.worldTitle,
        worldSummary: worldSnapshot.worldSummary?.slice(0, 50),
        floor,
        playerLevel,
      })

      const llmResult = await requestLlmMerchantItems({
        worldTitle: worldSnapshot.worldTitle,
        worldSummary: worldSnapshot.worldSummary,
        floor,
        playerLevel,
      })

      logger.log('[xx-dungeon] LLM返回结果:', llmResult)
      if (llmResult?.success && Array.isArray(llmResult.items) && llmResult.items.length > 0) {
        items = normalizeLlmMerchantItems(llmResult.items, {
          makeId,
          normalizeMerchantItem,
        })
        usedLLM = items.length > 0
      } else {
        logger.warn('[xx-dungeon] LLM merchant generation failed, falling back to local:', llmResult?.error)
      }
    }
  } catch (llmError) {
    logger.warn('[xx-dungeon] LLM merchant generation error, falling back to local:', llmError)
  }

  if (!usedLLM || items.length <= 0) {
    items = generateLocalMerchantItemsByPool({
      maxItems,
      equipmentPity,
      equipmentPool,
      rollEquipmentRarity,
      pickRandomItem,
      makeId,
      rarityValue,
      normalizeMerchantItem,
    })
  }

  return {
    usedLLM,
    items: Array.isArray(items) ? items : [],
  }
}
