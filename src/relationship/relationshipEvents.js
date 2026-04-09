/**
 * 关系事件配置
 * 定义预设的关系里程碑事件和触发条件
 */

import { RELATIONSHIP_LEVELS } from './relationshipLevels.js'

/**
 * 预设的关系里程碑事件类型
 */
export const RELATIONSHIP_EVENT_TYPES = {
  LEVEL_UP: 'level_up',           // 好感度等级提升
  LEVEL_DOWN: 'level_down',       // 好感度等级下降
  THRESHOLD_REACH: 'threshold',   // 达到特定阈值
  TRUST_UNLOCK: 'trust_unlock',   // 信任解锁事件
  SPECIAL_EVENT: 'special',       // 特殊事件
}

/**
 * 预设的关系里程碑事件模板
 * 可在世界书中配置角色的 milestones 字段来使用这些模板
 */
export const RELATIONSHIP_MILESTONE_TEMPLATES = {
  // 好感度等级变化事件
  levelChanges: [
    {
      id: 'favor_to_hatred',
      type: RELATIONSHIP_EVENT_TYPES.LEVEL_DOWN,
      name: '好感转为仇恨',
      description: '角色对玩家的好感降至仇恨等级',
      favorThreshold: -60,
      favorDirection: 'down',
      effects: {
        promptHint: '角色对玩家产生了强烈的敌意，行为将变得充满攻击性。',
        relationshipDeltas: [], // 可配置额外的关系变化
      },
    },
    {
      id: 'favor_to_hostile',
      type: RELATIONSHIP_EVENT_TYPES.LEVEL_DOWN,
      name: '好感转为敌对',
      description: '角色对玩家表现出明显的敌意',
      favorThreshold: -30,
      favorDirection: 'down',
      effects: {
        promptHint: '角色开始对玩家表现出敌意，对话将变得冷淡甚至对抗。',
      },
    },
    {
      id: 'favor_to_distant',
      type: RELATIONSHIP_EVENT_TYPES.LEVEL_DOWN,
      name: '好感转为疏远',
      description: '角色开始疏远玩家',
      favorThreshold: -10,
      favorDirection: 'down',
      effects: {
        promptHint: '角色开始对玩家产生距离感，不再主动交流。',
      },
    },
    {
      id: 'favor_to_acquainted',
      type: RELATIONSHIP_EVENT_TYPES.LEVEL_UP,
      name: '好感转为初识',
      description: '角色开始认识玩家',
      favorThreshold: 10,
      favorDirection: 'up',
      effects: {
        promptHint: '角色开始对玩家产生好感，愿意进行更多交流。',
      },
    },
    {
      id: 'favor_to_familiar',
      type: RELATIONSHIP_EVENT_TYPES.LEVEL_UP,
      name: '好感转为熟识',
      description: '角色与玩家开始熟悉彼此',
      favorThreshold: 30,
      favorDirection: 'up',
      effects: {
        promptHint: '角色开始信任玩家，愿意分享更多信息。',
      },
    },
    {
      id: 'favor_to_friendly',
      type: RELATIONSHIP_EVENT_TYPES.LEVEL_UP,
      name: '好感转为友好',
      description: '角色与玩家成为朋友',
      favorThreshold: 50,
      favorDirection: 'up',
      effects: {
        promptHint: '角色视玩家为朋友，愿意提供帮助和支持。',
      },
    },
    {
      id: 'favor_to_close',
      type: RELATIONSHIP_EVENT_TYPES.LEVEL_UP,
      name: '好感转为亲密',
      description: '角色与玩家建立亲密关系',
      favorThreshold: 70,
      favorDirection: 'up',
      effects: {
        promptHint: '角色对玩家产生了深厚的感情，愿意托付重要的事情。',
      },
    },
    {
      id: 'favor_to_devoted',
      type: RELATIONSHIP_EVENT_TYPES.LEVEL_UP,
      name: '好感转为深爱',
      description: '角色对玩家产生无法分离的羁绊',
      favorThreshold: 90,
      favorDirection: 'up',
      effects: {
        promptHint: '角色对玩家产生了无法割舍的感情，愿意付出一切。',
      },
    },
  ],

  // 信任解锁事件
  trustUnlocks: [
    {
      id: 'trust_secret_share',
      type: RELATIONSHIP_EVENT_TYPES.TRUST_UNLOCK,
      name: '信任解锁：分享秘密',
      description: '角色愿意向玩家分享秘密',
      trustThreshold: 60,
      favorRequired: 30, // 需要同时达到一定好感度
      effects: {
        promptHint: '角色愿意向玩家透露一些秘密信息。',
      },
    },
    {
      id: 'trust_personal_story',
      type: RELATIONSHIP_EVENT_TYPES.TRUST_UNLOCK,
      name: '信任解锁：讲述往事',
      description: '角色愿意讲述自己的过去',
      trustThreshold: 40,
      favorRequired: 20,
      effects: {
        promptHint: '角色开始愿意分享自己的经历和背景故事。',
      },
    },
    {
      id: 'trust_request_help',
      type: RELATIONSHIP_EVENT_TYPES.TRUST_UNLOCK,
      name: '信任解锁：请求帮助',
      description: '角色主动请求玩家的帮助',
      trustThreshold: 50,
      favorRequired: 40,
      effects: {
        promptHint: '角色信任玩家，愿意请求帮助解决困难。',
      },
    },
  ],

  // 特殊事件
  specialEvents: [
    {
      id: 'first_meeting',
      type: RELATIONSHIP_EVENT_TYPES.SPECIAL_EVENT,
      name: '初次相遇',
      description: '角色与玩家的第一次见面',
      triggerCondition: 'first_interaction',
      effects: {
        promptHint: '这是角色与玩家的第一次见面，请表现出初次相遇的情景。',
      },
    },
    {
      id: 'confession_positive',
      type: RELATIONSHIP_EVENT_TYPES.SPECIAL_EVENT,
      name: '告白成功',
      description: '玩家向角色告白并获得积极回应',
      triggerCondition: 'player_confession',
      favorRequired: 70,
      trustRequired: 60,
      effects: {
        promptHint: '角色接受了玩家的告白，请表现出角色的喜悦和感动。',
        relationshipDeltas: [
          { favor: 15, trust: 10 },
        ],
      },
    },
    {
      id: 'confession_negative',
      type: RELATIONSHIP_EVENT_TYPES.SPECIAL_EVENT,
      name: '告白失败',
      description: '玩家向角色告白但被拒绝',
      triggerCondition: 'player_confession',
      favorMax: 50, // 好感度不够高时会被拒绝
      effects: {
        promptHint: '角色拒绝了玩家的告白，请表现出角色的态度和理由。',
        relationshipDeltas: [
          { favor: -5, trust: -3 },
        ],
      },
    },
    {
      id: 'betrayal_discovered',
      type: RELATIONSHIP_EVENT_TYPES.SPECIAL_EVENT,
      name: '背叛被发现',
      description: '角色发现玩家背叛了自己',
      triggerCondition: 'betrayal_action',
      effects: {
        promptHint: '角色发现了玩家的背叛行为，请表现出角色的愤怒和失望。',
        relationshipDeltas: [
          { favor: -30, trust: -40 },
        ],
      },
    },
    {
      id: 'reconciliation',
      type: RELATIONSHIP_EVENT_TYPES.SPECIAL_EVENT,
      name: '和解',
      description: '玩家与角色达成和解',
      triggerCondition: 'reconciliation_action',
      favorMin: -30, // 需要关系不是太差才能和解
      effects: {
        promptHint: '角色愿意与玩家和解，请表现出角色的态度转变。',
        relationshipDeltas: [
          { favor: 20, trust: 15 },
        ],
      },
    },
  ],
}

/**
 * 获取角色的默认里程碑配置
 * @param {Object} character - 角色信息
 * @returns {Array} 里程碑事件列表
 */
export const getDefaultMilestones = (character) => {
  // 根据角色类型返回不同的里程碑配置
  const baseMilestones = [...RELATIONSHIP_MILESTONE_TEMPLATES.levelChanges]
  
  // 如果角色有特殊配置，可以在这里添加
  if (character?.relationshipMilestones) {
    const customMilestones = normalizeMilestones(character.relationshipMilestones)
    return [...baseMilestones, ...customMilestones]
  }
  
  return baseMilestones
}

/**
 * 规范化里程碑配置
 * @param {Array} rawMilestones - 原始里程碑配置
 * @returns {Array} 规范化后的里程碑列表
 */
export const normalizeMilestones = (rawMilestones) => {
  if (!Array.isArray(rawMilestones)) return []
  
  return rawMilestones.map((milestone, index) => ({
    id: milestone.id || `milestone_${index}`,
    type: milestone.type || RELATIONSHIP_EVENT_TYPES.THRESHOLD_REACH,
    name: milestone.name || `里程碑事件 ${index + 1}`,
    description: milestone.description || '',
    favorThreshold: milestone.favorThreshold,
    trustThreshold: milestone.trustThreshold,
    favorRequired: milestone.favorRequired,
    trustRequired: milestone.trustRequired,
    favorMin: milestone.favorMin,
    favorMax: milestone.favorMax,
    favorDirection: milestone.favorDirection || 'up',
    triggerCondition: milestone.triggerCondition,
    effects: normalizeMilestoneEffects(milestone.effects),
  }))
}

/**
 * 规范化里程碑效果配置
 * @param {Object} rawEffects - 原始效果配置
 * @returns {Object} 规范化后的效果
 */
const normalizeMilestoneEffects = (rawEffects) => {
  if (!rawEffects || typeof rawEffects !== 'object') {
    return {
      promptHint: '',
      relationshipDeltas: [],
    }
  }
  
  return {
    promptHint: String(rawEffects.promptHint || '').trim(),
    relationshipDeltas: Array.isArray(rawEffects.relationshipDeltas)
      ? rawEffects.relationshipDeltas.map(delta => ({
          favor: Number.isFinite(delta.favor) ? delta.favor : 0,
          trust: Number.isFinite(delta.trust) ? delta.trust : 0,
          stance: Number.isFinite(delta.stance) ? delta.stance : 0,
        }))
      : [],
    setFlags: Array.isArray(rawEffects.setFlags) ? rawEffects.setFlags : [],
    clearFlags: Array.isArray(rawEffects.clearFlags) ? rawEffects.clearFlags : [],
  }
}

/**
 * 检查里程碑事件是否应该触发
 * @param {Object} milestone - 里程碑配置
 * @param {Object} currentRelationship - 当前关系状态
 * @param {Object} previousRelationship - 之前的关系状态（用于检测变化）
 * @returns {boolean} 是否应该触发
 */
export const shouldTriggerMilestone = (milestone, currentRelationship, previousRelationship = null) => {
  const currentFavor = currentRelationship?.favor || 0
  const currentTrust = currentRelationship?.trust || 0
  const previousFavor = previousRelationship?.favor || currentFavor
  
  // 检查好感度阈值
  if (milestone.favorThreshold !== undefined) {
    const threshold = milestone.favorThreshold
    
    // 检查方向
    if (milestone.favorDirection === 'up') {
      // 从低于阈值变为达到或超过阈值
      if (previousFavor < threshold && currentFavor >= threshold) {
        return checkAdditionalConditions(milestone, currentRelationship)
      }
    } else if (milestone.favorDirection === 'down') {
      // 从高于阈值变为低于阈值
      if (previousFavor > threshold && currentFavor <= threshold) {
        return checkAdditionalConditions(milestone, currentRelationship)
      }
    } else {
      // 无方向要求，只需达到阈值
      if (currentFavor >= threshold) {
        return checkAdditionalConditions(milestone, currentRelationship)
      }
    }
  }
  
  // 检查信任度阈值
  if (milestone.trustThreshold !== undefined) {
    if (currentTrust >= milestone.trustThreshold) {
      return checkAdditionalConditions(milestone, currentRelationship)
    }
  }
  
  return false
}

/**
 * 检查里程碑的附加条件
 * @param {Object} milestone - 里程碑配置
 * @param {Object} relationship - 当前关系状态
 * @returns {boolean} 是否满足附加条件
 */
const checkAdditionalConditions = (milestone, relationship) => {
  const favor = relationship?.favor || 0
  const trust = relationship?.trust || 0
  
  // 检查好感度最低要求
  if (milestone.favorRequired !== undefined && favor < milestone.favorRequired) {
    return false
  }
  
  // 检查信任度最低要求
  if (milestone.trustRequired !== undefined && trust < milestone.trustRequired) {
    return false
  }
  
  // 检查好感度上限
  if (milestone.favorMax !== undefined && favor > milestone.favorMax) {
    return false
  }
  
  // 检查好感度下限
  if (milestone.favorMin !== undefined && favor < milestone.favorMin) {
    return false
  }
  
  return true
}

/**
 * 获取等级变化事件
 * @param {number} previousFavor - 之前的好感度
 * @param {number} currentFavor - 当前的好感度
 * @returns {Object|null} 等级变化事件信息
 */
export const getLevelChangeEvent = (previousFavor, currentFavor) => {
  const previousLevel = RELATIONSHIP_LEVELS.find(
    level => previousFavor >= level.range[0] && previousFavor <= level.range[1]
  )
  const currentLevel = RELATIONSHIP_LEVELS.find(
    level => currentFavor >= level.range[0] && currentFavor <= level.range[1]
  )
  
  if (!previousLevel || !currentLevel) return null
  if (previousLevel.level === currentLevel.level) return null
  
  const isUp = currentLevel.level > previousLevel.level
  const direction = isUp ? 'up' : 'down'
  
  // 查找对应的里程碑模板
  const template = RELATIONSHIP_MILESTONE_TEMPLATES.levelChanges.find(
    t => t.favorThreshold === (isUp ? currentLevel.range[0] : currentLevel.range[1]) && t.favorDirection === direction
  )
  
  return {
    previousLevel,
    currentLevel,
    direction,
    template,
    eventName: isUp ? `好感度提升至${currentLevel.name}` : `好感度降至${currentLevel.name}`,
  }
}

/**
 * 创建自定义里程碑事件
 * @param {Object} config - 里程碑配置
 * @returns {Object} 规范化的里程碑事件
 */
export const createCustomMilestone = (config) => {
  return {
    id: config.id || `custom_${Date.now()}`,
    type: config.type || RELATIONSHIP_EVENT_TYPES.SPECIAL_EVENT,
    name: config.name || '自定义事件',
    description: config.description || '',
    favorThreshold: config.favorThreshold,
    trustThreshold: config.trustThreshold,
    favorRequired: config.favorRequired,
    trustRequired: config.trustRequired,
    favorMin: config.favorMin,
    favorMax: config.favorMax,
    favorDirection: config.favorDirection || 'up',
    triggerCondition: config.triggerCondition,
    effects: normalizeMilestoneEffects(config.effects),
  }
}

// 导出所有
export default {
  RELATIONSHIP_EVENT_TYPES,
  RELATIONSHIP_MILESTONE_TEMPLATES,
  getDefaultMilestones,
  normalizeMilestones,
  shouldTriggerMilestone,
  getLevelChangeEvent,
  createCustomMilestone,
}