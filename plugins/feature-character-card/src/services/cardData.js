/**
 * 角色卡牌定义数据
 * 包含所有可用卡牌的静态定义（稀有度、属性、技能等）
 */

const RARITY_CONFIG = {
  N: { color: '#9ca3af', label: 'N', maxLevel: 40, maxStar: 1, order: 1 },
  R: { color: '#ffffff', label: 'R', maxLevel: 60, maxStar: 2, order: 2 },
  SR: { color: '#3b82f6', label: 'SR', maxLevel: 80, maxStar: 4, order: 3 },
  SSR: { color: '#f59e0b', label: 'SSR', maxLevel: 90, maxStar: 5, order: 4 },
  UR: { color: '#a855f7', label: 'UR', maxLevel: 100, maxStar: 6, order: 5 },
}

/**
 * 测试卡牌定义（后续会移到 LLM 生成或远程配置）
 */
export const CHARACTER_CARD_DEFS = [
  // === 陆野 ===
  {
    id: 'card_ly_summer_sr',
    characterId: 'char_ly',
    characterName: '陆野',
    name: '夏日祭',
    rarity: 'SR',
    theme: 'summer',
    activityId: 'wasteland_pet_summer',
    tags: ['夏日', '祭典', '限定'],
    baseStats: { attack: 110, defense: 90, charm: 160, luck: 70 },
    skills: [
      { id: 'skill_ly_summer', name: '祭典之约', type: 'passive', effect: 'charm_boost', value: 15 },
    ],
    cardStories: [
      { id: 'story_ly_1', title: '祭典的相遇', unlockCondition: { affinity: 50 }, seed: '陆野带你穿梭在夏日祭的摊位间，烟火在他身后绽放。' },
    ],
    obtainMethod: 'event',
    obtainSource: '废土娇宠·夏日祭',
  },

  // === 祁朔 ===
  {
    id: 'card_qs_summer_sr',
    characterId: 'char_qs',
    characterName: '祁朔',
    name: '夏日祭',
    rarity: 'SR',
    theme: 'summer',
    activityId: 'wasteland_pet_summer',
    tags: ['夏日', '祭典', '限定'],
    baseStats: { attack: 120, defense: 100, charm: 150, luck: 80 },
    skills: [
      { id: 'skill_qs_summer', name: '海风守护', type: 'passive', effect: 'defense_boost', value: 12 },
    ],
    cardStories: [
      { id: 'story_qs_1', title: '海边的誓言', unlockCondition: { affinity: 50 }, seed: '祁朔站在海边，风吹起他的头发。他说会一直守护你。' },
    ],
    obtainMethod: 'event',
    obtainSource: '废土娇宠·夏日祭',
  },

  // === 阿诺 ===
  {
    id: 'card_an_summer_ssr',
    characterId: 'char_an',
    characterName: '阿诺',
    name: '夏日祭',
    rarity: 'SSR',
    theme: 'summer',
    activityId: 'wasteland_pet_summer',
    tags: ['夏日', '祭典', '限定', '烟火'],
    baseStats: { attack: 200, defense: 150, charm: 250, luck: 100 },
    skills: [
      { id: 'skill_an_summer', name: '烟火之约', type: 'active', effect: 'all_stats_boost', value: 20, cooldown: 4 },
    ],
    cardStories: [
      { id: 'story_an_1', title: '烟火下的告白', unlockCondition: { affinity: 80 }, seed: '阿诺在烟火绽放时握住了你的手，他说这是他最想记住的瞬间。' },
      { id: 'story_an_2', title: '星空下的约定', unlockCondition: { affinity: 150 }, seed: '阿诺指着天空中的星星，说每一颗都代表他想和你分享的故事。' },
    ],
    obtainMethod: 'event',
    obtainSource: '废土娇宠·夏日祭',
  },

  // === 白屿 ===
  {
    id: 'card_by_summer_ssr',
    characterId: 'char_by',
    characterName: '白屿',
    name: '夏日祭',
    rarity: 'SSR',
    theme: 'summer',
    activityId: 'wasteland_pet_summer',
    tags: ['夏日', '祭典', '限定', '阳光'],
    baseStats: { attack: 180, defense: 180, charm: 220, luck: 120 },
    skills: [
      { id: 'skill_by_summer', name: '阳光之约', type: 'active', effect: 'luck_boost', value: 50, cooldown: 3 },
    ],
    cardStories: [
      { id: 'story_by_1', title: '阳光下的笑容', unlockCondition: { affinity: 80 }, seed: '白屿的笑容比夏日的阳光还要灿烂，他说有你在身边就是最好的夏天。' },
      { id: 'story_by_2', title: '祭典的记忆', unlockCondition: { affinity: 150 }, seed: '白屿带你品尝每一个祭典的美食，他说想把所有美好的记忆都和你分享。' },
    ],
    obtainMethod: 'event',
    obtainSource: '废土娇宠·夏日祭',
  },
]

/**
 * 稀有度配置
 */
export const getRarityConfig = (rarity) => {
  return RARITY_CONFIG[rarity] || RARITY_CONFIG.N
}

/**
 * 根据ID查找卡牌定义
 */
export const getCardDef = (cardId) => {
  return CHARACTER_CARD_DEFS.find(c => c.id === cardId) || null
}

/**
 * 根据角色ID获取该角色的所有卡牌
 */
export const getCardsByCharacter = (characterId) => {
  return CHARACTER_CARD_DEFS.filter(c => c.characterId === characterId)
}

/**
 * 获取所有角色列表
 */
export const getAllCharacters = () => {
  const seen = new Map()
  CHARACTER_CARD_DEFS.forEach(card => {
    if (!seen.has(card.characterId)) {
      seen.set(card.characterId, {
        id: card.characterId,
        name: card.characterName,
      })
    }
  })
  return Array.from(seen.values())
}
