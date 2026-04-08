/**
 * 好感度等级定义
 * 将数值映射为可视化的等级和状态
 */

// 好感度数值范围
export const RELATIONSHIP_MIN = -100
export const RELATIONSHIP_MAX = 100
export const RELATIONSHIP_NEUTRAL = 0

// 好感度等级定义表
export const RELATIONSHIP_LEVELS = [
  {
    level: 0,
    name: '仇恨',
    nameEn: 'hatred',
    range: [-100, -60],
    color: '#2d0000',
    textColor: '#ffffff',
    icon: '💀',
    description: '不死不休的敌意',
    shortDesc: '仇恨',
  },
  {
    level: 1,
    name: '敌对',
    nameEn: 'hostile',
    range: [-59, -30],
    color: '#8b0000',
    textColor: '#ffffff',
    icon: '⚡',
    description: '明显的敌意和对抗',
    shortDesc: '敌对',
  },
  {
    level: 2,
    name: '疏远',
    nameEn: 'distant',
    range: [-29, -10],
    color: '#4a4a4a',
    textColor: '#ffffff',
    icon: '🌫️',
    description: '有些距离感，不愿接近',
    shortDesc: '疏远',
  },
  {
    level: 3,
    name: '中立',
    nameEn: 'neutral',
    range: [-9, 9],
    color: '#808080',
    textColor: '#ffffff',
    icon: '➖',
    description: '没有特别印象，保持距离',
    shortDesc: '中立',
  },
  {
    level: 4,
    name: '初识',
    nameEn: 'acquainted',
    range: [10, 29],
    color: '#c0c0c0',
    textColor: '#333333',
    icon: '👋',
    description: '刚刚认识，开始了解',
    shortDesc: '初识',
  },
  {
    level: 5,
    name: '熟识',
    nameEn: 'familiar',
    range: [30, 49],
    color: '#87ceeb',
    textColor: '#333333',
    icon: '🙂',
    description: '开始了解彼此',
    shortDesc: '熟识',
  },
  {
    level: 6,
    name: '友好',
    nameEn: 'friendly',
    range: [50, 69],
    color: '#ffa500',
    textColor: '#333333',
    icon: '😊',
    description: '互相信任的朋友',
    shortDesc: '友好',
  },
  {
    level: 7,
    name: '亲密',
    nameEn: 'close',
    range: [70, 89],
    color: '#ff6b6b',
    textColor: '#ffffff',
    icon: '💕',
    description: '可以托付生命',
    shortDesc: '亲密',
  },
  {
    level: 8,
    name: '深爱',
    nameEn: 'devoted',
    range: [90, 100],
    color: '#ff4d4d',
    textColor: '#ffffff',
    icon: '❤️',
    description: '无法分离的羁绊',
    shortDesc: '深爱',
  },
]

// 关系类型定义（用于角色间关系）
export const RELATIONSHIP_TYPES = {
  family: { label: '家人', color: '#ff6b6b', icon: '👨‍👩‍👧' },
  lover: { label: '恋人', color: '#ff4d4d', icon: '💕' },
  friend: { label: '朋友', color: '#4a90d9', icon: '🤝' },
  colleague: { label: '同事', color: '#87ceeb', icon: '💼' },
  ally: { label: '盟友', color: '#2ecc71', icon: '⚔️' },
  neutral: { label: '中立', color: '#808080', icon: '➖' },
  rival: { label: '对手', color: '#e74c3c', icon: '🎯' },
  hostile: { label: '敌对', color: '#8b0000', icon: '⚡' },
  unknown: { label: '未知', color: '#c0c0c0', icon: '❓' },
}

// 变化幅度提示等级
export const CHANGE_MAGNITUDE_LEVELS = {
  small: {
    threshold: 5,
    name: '小幅变化',
    animationIntensity: 0.3,
    soundVolume: 0.2,
  },
  medium: {
    threshold: 15,
    name: '中幅变化',
    animationIntensity: 0.6,
    soundVolume: 0.5,
  },
  large: {
    threshold: 16,
    name: '大幅变化',
    animationIntensity: 1.0,
    soundVolume: 0.8,
  },
}

/**
 * 将好感度数值限制在有效范围内
 * @param {number} value - 原始数值
 * @param {number} fallback - 无效时的默认值
 * @returns {number} 限制后的数值
 */
export const clampRelationshipValue = (value, fallback = RELATIONSHIP_NEUTRAL) => {
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(RELATIONSHIP_MAX, Math.max(RELATIONSHIP_MIN, Math.round(parsed)))
}

/**
 * 根据好感度数值获取等级信息
 * @param {number} favorValue - 好感度数值
 * @returns {Object} 等级信息对象
 */
export const getRelationshipLevel = (favorValue) => {
  const clampedValue = clampRelationshipValue(favorValue)
  
  for (const level of RELATIONSHIP_LEVELS) {
    if (clampedValue >= level.range[0] && clampedValue <= level.range[1]) {
      return {
        ...level,
        currentValue: clampedValue,
        progress: calculateLevelProgress(clampedValue, level.range),
      }
    }
  }
  
  // 默认返回中立等级
  const neutralLevel = RELATIONSHIP_LEVELS[3]
  return {
    ...neutralLevel,
    currentValue: clampedValue,
    progress: 0,
  }
}

/**
 * 计算在当前等级内的进度百分比
 * @param {number} value - 当前数值
 * @param {Array} range - 等级范围 [min, max]
 * @returns {number} 进度百分比 (0-100)
 */
const calculateLevelProgress = (value, range) => {
  const [min, max] = range
  const rangeSize = max - min
  if (rangeSize === 0) return 100
  return Math.round(((value - min) / rangeSize) * 100)
}

/**
 * 获取变化幅度等级
 * @param {number} delta - 变化量（绝对值）
 * @returns {Object} 变化幅度信息
 */
export const getChangeMagnitude = (delta) => {
  const absDelta = Math.abs(delta)
  
  if (absDelta <= CHANGE_MAGNITUDE_LEVELS.small.threshold) {
    return { ...CHANGE_MAGNITUDE_LEVELS.small, delta }
  }
  if (absDelta <= CHANGE_MAGNITUDE_LEVELS.medium.threshold) {
    return { ...CHANGE_MAGNITUDE_LEVELS.medium, delta }
  }
  return { ...CHANGE_MAGNITUDE_LEVELS.large, delta }
}

/**
 * 判断是否为正向变化
 * @param {number} delta - 变化量
 * @returns {boolean} 是否正向
 */
export const isPositiveChange = (delta) => delta > 0

/**
 * 根据好感度数值自动判断关系类型
 * @param {number} favorValue - 好感度数值
 * @returns {string} 关系类型key
 */
export const determineRelationshipType = (favorValue) => {
  const clampedValue = clampRelationshipValue(favorValue)
  
  if (clampedValue >= 80) return 'lover'
  if (clampedValue >= 60) return 'friend'
  if (clampedValue >= 30) return 'colleague'
  if (clampedValue >= 10) return 'neutral'
  if (clampedValue >= -20) return 'rival'
  return 'hostile'
}

/**
 * 获取关系类型信息
 * @param {string} typeKey - 关系类型key
 * @returns {Object} 关系类型信息
 */
export const getRelationshipTypeInfo = (typeKey) => {
  return RELATIONSHIP_TYPES[typeKey] || RELATIONSHIP_TYPES.unknown
}

/**
 * 获取好感度等级的CSS类名
 * @param {number} favorValue - 好感度数值
 * @returns {string} CSS类名
 */
export const getRelationshipLevelClass = (favorValue) => {
  const level = getRelationshipLevel(favorValue)
  return `relationship-level-${level.level}`
}

/**
 * 获取好感度描述文本（用于Prompt）
 * @param {Object} relationship - 关系对象 { favor, trust, stance }
 * @param {Object} character - 角色信息
 * @returns {string} 描述文本
 */
export const getRelationshipDescription = (relationship, character) => {
  const favorLevel = getRelationshipLevel(relationship.favor)
  const trustLevel = getRelationshipLevel(relationship.trust)
  
  const parts = []
  
  // 好感度描述
  parts.push(`好感度: ${relationship.favor} (${favorLevel.name})`)
  
  // 信任度描述
  if (relationship.trust !== 50) {
    parts.push(`信任度: ${relationship.trust} (${trustLevel.name})`)
  }
  
  // 立场描述
  if (relationship.stance !== 0) {
    const stanceDesc = relationship.stance > 0 ? '倾向支持' : '倾向反对'
    parts.push(`立场: ${relationship.stance} (${stanceDesc})`)
  }
  
  // 综合描述
  const overallDesc = generateOverallDescription(relationship, character)
  if (overallDesc) {
    parts.push(overallDesc)
  }
  
  return parts.join(', ')
}

/**
 * 生成综合关系描述
 * @param {Object} relationship - 关系对象
 * @param {Object} character - 角色信息
 * @returns {string} 综合描述
 */
const generateOverallDescription = (relationship, character) => {
  const favorLevel = getRelationshipLevel(relationship.favor)
  const charName = character?.name || '对方'
  
  // 根据等级生成不同的描述
  const descriptions = {
    0: `${charName}对你怀有深深的仇恨`,
    1: `${charName}对你表现出明显的敌意`,
    2: `${charName}对你保持距离，不愿接近`,
    3: `${charName}对你没有特别的印象`,
    4: `${charName}刚刚认识你，开始了解`,
    5: `${charName}开始了解你，关系逐渐熟悉`,
    6: `${charName}把你当作可以信任的朋友`,
    7: `${charName}与你关系亲密，可以托付重要的事`,
    8: `${charName}对你有着无法分离的深厚感情`,
  }
  
  return descriptions[favorLevel.level] || ''
}

/**
 * 获取关系影响提示（用于LLM Prompt）
 * @param {Array} characters - 角色列表
 * @param {Object} runtimeRelationships - 运行时关系状态
 * @returns {string} 关系影响提示文本
 */
export const getRelationshipInfluenceHint = (characters, runtimeRelationships) => {
  if (!characters || characters.length === 0) {
    return ''
  }
  
  const hints = []
  
  for (const char of characters) {
    const relationship = runtimeRelationships?.[char.id] || char.relationshipBase
    if (!relationship) continue
    
    const favorLevel = getRelationshipLevel(relationship.favor)
    
    // 只对有显著关系的角色生成提示
    if (favorLevel.level <= 2 || favorLevel.level >= 6) {
      const hint = generateDialogueStyleHint(char, relationship, favorLevel)
      hints.push(hint)
    }
  }
  
  if (hints.length === 0) {
    return '所有角色对玩家保持中立态度，对话风格正常。'
  }
  
  return `根据当前好感度，角色的对话应该表现出以下特点：\n${hints.join('\n')}`
}

/**
 * 生成对话风格提示
 * @param {Object} char - 角色信息
 * @param {Object} relationship - 关系状态
 * @param {Object} favorLevel - 好感度等级
 * @returns {string} 对话风格提示
 */
const generateDialogueStyleHint = (char, relationship, favorLevel) => {
  const charName = char.name
  
  // 低好感度提示
  if (favorLevel.level <= 2) {
    return `- ${charName}：语气冷淡或敌对，避免主动交流，回答简短，可能带有讽刺或威胁`
  }
  
  // 高好感度提示
  if (favorLevel.level >= 7) {
    return `- ${charName}：语气温柔关切，主动提供帮助，愿意分享秘密，在关键时刻会优先考虑你的安全`
  }
  
  // 友好提示
  if (favorLevel.level === 6) {
    return `- ${charName}：态度友好真诚，愿意合作，会主动提供建议，但仍有个人边界`
  }
  
  return ''
}

export default {
  RELATIONSHIP_MIN,
  RELATIONSHIP_MAX,
  RELATIONSHIP_NEUTRAL,
  RELATIONSHIP_LEVELS,
  RELATIONSHIP_TYPES,
  CHANGE_MAGNITUDE_LEVELS,
  clampRelationshipValue,
  getRelationshipLevel,
  getChangeMagnitude,
  isPositiveChange,
  determineRelationshipType,
  getRelationshipTypeInfo,
  getRelationshipLevelClass,
  getRelationshipDescription,
  getRelationshipInfluenceHint,
}