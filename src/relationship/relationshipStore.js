/**
 * 好感度数据管理核心
 * 负责好感度数据的存储、更新、查询和事件触发
 */

import { reactive, ref, computed, watch } from 'vue'
import { kvStorage } from '../storage/index.js'
import {
  RELATIONSHIP_MIN,
  RELATIONSHIP_MAX,
  RELATIONSHIP_NEUTRAL,
  clampRelationshipValue,
  getRelationshipLevel,
  getChangeMagnitude,
  isPositiveChange,
  determineRelationshipType,
  getRelationshipDescription,
  getRelationshipInfluenceHint,
} from './relationshipLevels.js'

// 存储键
const RELATIONSHIP_STORAGE_KEY = 'game_relationships'
const RELATIONSHIP_HISTORY_KEY = 'relationship_history'
const TRIGGERED_EVENTS_KEY = 'triggered_relationship_events'

// 默认关系数据结构
const createDefaultRelationshipBase = () => ({
  favor: RELATIONSHIP_NEUTRAL,
  trust: RELATIONSHIP_NEUTRAL,
  stance: 0,
})

// 默认关系数据
const createDefaultRelationshipData = () => ({
  runtime: {}, // 运行时关系状态（覆盖世界书默认值）
  history: [], // 关系变化历史
  triggeredEvents: [], // 已触发的关系事件
})

// 响应式状态
const relationshipState = reactive({
  runtime: {},
  history: [],
  triggeredEvents: [],
  isLoaded: false,
})

// 当前活跃的世界书ID（用于区分不同世界书的关系）
const activeWorldBookId = ref(null)

/**
 * 初始化好感度系统
 * @param {string} worldBookId - 世界书ID
 * @param {Object} initialRelationships - 初始关系数据（来自存档）
 */
export const initRelationshipSystem = async (worldBookId, initialRelationships = null) => {
  activeWorldBookId.value = worldBookId
  
  if (initialRelationships) {
    // 从存档加载
    relationshipState.runtime = initialRelationships.runtime || {}
    relationshipState.history = initialRelationships.history || []
    relationshipState.triggeredEvents = initialRelationships.triggeredEvents || []
  } else {
    // 从存储加载或创建默认
    const storedData = await loadRelationshipFromStorage(worldBookId)
    if (storedData) {
      relationshipState.runtime = storedData.runtime || {}
      relationshipState.history = storedData.history || []
      relationshipState.triggeredEvents = storedData.triggeredEvents || []
    } else {
      relationshipState.runtime = {}
      relationshipState.history = []
      relationshipState.triggeredEvents = []
    }
  }
  
  relationshipState.isLoaded = true
}

/**
 * 从存储加载关系数据
 * @param {string} worldBookId - 世界书ID
 * @returns {Promise<Object|null>} 关系数据
 */
const loadRelationshipFromStorage = async (worldBookId) => {
  try {
    const key = `${RELATIONSHIP_STORAGE_KEY}_${worldBookId}`
    const data = await kvStorage.get(key)
    return data || null
  } catch {
    return null
  }
}

/**
 * 保存关系数据到存储
 */
const saveRelationshipToStorage = async () => {
  if (!activeWorldBookId.value) return
  
  try {
    const key = `${RELATIONSHIP_STORAGE_KEY}_${activeWorldBookId.value}`
    await kvStorage.set(key, {
      runtime: relationshipState.runtime,
      history: relationshipState.history.slice(-100), // 只保留最近100条
      triggeredEvents: relationshipState.triggeredEvents,
    })
  } catch (error) {
    console.error('Failed to save relationship data:', error)
  }
}

/**
 * 获取角色的当前好感度状态
 * 合合世界书默认值 + 运行时变更
 * @param {string} characterId - 角色ID
 * @param {Object} characterBase - 角色的基础关系数据（来自世界书）
 * @returns {Object} 合合后的关系状态
 */
export const getCharacterRelationship = (characterId, characterBase = null) => {
  // 运行时值优先
  const runtimeValue = relationshipState.runtime[characterId]
  
  if (runtimeValue) {
    return {
      favor: runtimeValue.favor,
      trust: runtimeValue.trust,
      stance: runtimeValue.stance,
      lastUpdated: runtimeValue.lastUpdated,
    }
  }
  
  // 使用世界书默认值
  if (characterBase && characterBase.relationshipBase) {
    return {
      favor: characterBase.relationshipBase.favor || RELATIONSHIP_NEUTRAL,
      trust: characterBase.relationshipBase.trust || RELATIONSHIP_NEUTRAL,
      stance: characterBase.relationshipBase.stance || 0,
      lastUpdated: null,
    }
  }
  
  // 返回默认值
  return createDefaultRelationshipBase()
}

/**
 * 更新角色好感度
 * @param {string} characterId - 角色ID
 * @param {Object} deltas - 变化量 { favor, trust, stance }
 * @param {string} reason - 变化原因
 * @param {number} dialogueIndex - 对话索引（可选）
 * @returns {Object} 更新结果
 */
export const updateRelationship = (characterId, deltas, reason, dialogueIndex = null) => {
  const oldValues = getCharacterRelationship(characterId)
  
  // 计算新值
  const newFavor = clampRelationshipValue(oldValues.favor + (deltas.favor || 0))
  const newTrust = clampRelationshipValue(oldValues.trust + (deltas.trust || 0))
  const newStance = clampRelationshipValue(oldValues.stance + (deltas.stance || 0))
  
  const newValues = {
    favor: newFavor,
    trust: newTrust,
    stance: newStance,
    lastUpdated: new Date().toISOString(),
  }
  
  // 更新运行时状态
  relationshipState.runtime[characterId] = newValues
  
  // 记录历史
  const historyEntry = {
    timestamp: new Date().toISOString(),
    characterId,
    oldValues: { ...oldValues },
    newValues: { ...newValues },
    deltas: {
      favor: deltas.favor || 0,
      trust: deltas.trust || 0,
      stance: deltas.stance || 0,
    },
    reason,
    dialogueIndex,
  }
  relationshipState.history.push(historyEntry)
  
  // 保存到存储
  saveRelationshipToStorage()
  
  // 返回更新结果（包含变化幅度信息）
  const favorChange = getChangeMagnitude(deltas.favor || 0)
  const trustChange = getChangeMagnitude(deltas.trust || 0)
  
  return {
    characterId,
    oldValues,
    newValues,
    changes: {
      favor: favorChange,
      trust: trustChange,
    },
    historyEntry,
  }
}

/**
 * 批量更新多个角色的好感度
 * @param {Array} updates - 更新列表 [{ characterId, deltas, reason }]
 * @returns {Array} 更新结果列表
 */
export const batchUpdateRelationships = (updates) => {
  if (!Array.isArray(updates)) return []
  
  const results = []
  for (const update of updates) {
    const result = updateRelationship(
      update.characterId,
      update.deltas,
      update.reason,
      update.dialogueIndex
    )
    results.push(result)
  }
  
  return results
}

/**
 * 获取所有角色的关系状态
 * @param {Array} characters - 角色列表（来自世界书）
 * @returns {Object} 角色ID到关系状态的映射
 */
export const getAllRelationships = (characters) => {
  const result = {}
  
  if (Array.isArray(characters)) {
    for (const char of characters) {
      result[char.id] = getCharacterRelationship(char.id, char)
    }
  }
  
  return result
}

/**
 * 获取关系变化历史
 * @param {string} characterId - 角色ID（可选，不提供则返回全部）
 * @param {number} limit - 返回条数限制
 * @returns {Array} 历史记录列表
 */
export const getRelationshipHistory = (characterId = null, limit = 20) => {
  let history = relationshipState.history
  
  if (characterId) {
    history = history.filter(entry => entry.characterId === characterId)
  }
  
  // 按时间倒序
  history = [...history].reverse()
  
  return history.slice(0, limit)
}

/**
 * 获取最近的关系变化
 * @returns {Object|null} 最近的变化记录
 */
export const getLatestRelationshipChange = () => {
  if (relationshipState.history.length === 0) return null
  return relationshipState.history[relationshipState.history.length - 1]
}

/**
 * 检查是否已触发某关系事件
 * @param {string} eventId - 事件ID
 * @returns {boolean} 是否已触发
 */
export const hasTriggeredRelationshipEvent = (eventId) => {
  return relationshipState.triggeredEvents.includes(eventId)
}

/**
 * 标记关系事件已触发
 * @param {string} eventId - 事件ID
 */
export const markRelationshipEventTriggered = (eventId) => {
  if (!relationshipState.triggeredEvents.includes(eventId)) {
    relationshipState.triggeredEvents.push(eventId)
    saveRelationshipToStorage()
  }
}

/**
 * 检查并获取可触发的阈值事件
 * @param {string} characterId - 角色ID
 * @param {Array} milestones - 角色的关系里程碑配置
 * @returns {Array} 可触发的事件列表
 */
export const checkThresholdEvents = (characterId, milestones) => {
  if (!Array.isArray(milestones)) return []
  
  const currentRel = getCharacterRelationship(characterId)
  const triggerableEvents = []
  
  for (const milestone of milestones) {
    // 已触发过则跳过
    if (hasTriggeredRelationshipEvent(milestone.id)) continue
    
    // 检查阈值条件
    if (milestone.favorThreshold !== undefined) {
      if (currentRel.favor >= milestone.favorThreshold) {
        triggerableEvents.push({
          ...milestone,
          characterId,
          currentValues: currentRel,
        })
      }
    }
    
    if (milestone.trustThreshold !== undefined) {
      if (currentRel.trust >= milestone.trustThreshold) {
        triggerableEvents.push({
          ...milestone,
          characterId,
          currentValues: currentRel,
        })
      }
    }
  }
  
  return triggerableEvents
}

/**
 * 获取关系状态描述（用于Prompt）
 * @param {Array} characters - 场景角色列表
 * @returns {string} 关系状态描述文本
 */
export const getRelationshipPromptContext = (characters) => {
  if (!Array.isArray(characters) || characters.length === 0) {
    return ''
  }
  
  const lines = []
  lines.push('【角色关系状态】')
  
  for (const char of characters) {
    const relationship = getCharacterRelationship(char.id, char)
    const level = getRelationshipLevel(relationship.favor)
    const desc = getRelationshipDescription(relationship, char)
    
    lines.push(`- ${char.name} (好感度: ${relationship.favor}/${level.name}): ${desc}`)
  }
  
  lines.push('')
  lines.push('【关系影响提示】')
  lines.push(getRelationshipInfluenceHint(characters, relationshipState.runtime))
  
  return lines.join('\n')
}

/**
 * 获取关系快照（用于存档）
 * @returns {Object} 关系数据快照
 */
export const getRelationshipSnapshot = () => {
  return {
    runtime: { ...relationshipState.runtime },
    history: [...relationshipState.history],
    triggeredEvents: [...relationshipState.triggeredEvents],
  }
}

/**
 * 重置关系系统（用于新游戏）
 * @param {string} worldBookId - 新的世界书ID
 */
export const resetRelationshipSystem = async (worldBookId) => {
  activeWorldBookId.value = worldBookId
  relationshipState.runtime = {}
  relationshipState.history = []
  relationshipState.triggeredEvents = []
  relationshipState.isLoaded = true
  
  // 清除存储
  try {
    const key = `${RELATIONSHIP_STORAGE_KEY}_${worldBookId}`
    await kvStorage.remove(key)
  } catch {
    // 忽略错误
  }
}

/**
 * 应用关系变更数据（来自导演器）
 * @param {Array} deltas - 关系变更列表
 * @param {string} reason - 变更原因
 * @returns {Array} 更新结果
 */
export const applyDirectorRelationshipDeltas = (deltas, reason = '导演器事件') => {
  if (!Array.isArray(deltas)) return []
  
  const updates = deltas.map(delta => ({
    characterId: delta.characterId || delta.target,
    deltas: {
      favor: delta.favor || 0,
      trust: delta.trust || 0,
      stance: delta.stance || 0,
    },
    reason,
  }))
  
  return batchUpdateRelationships(updates)
}

// 导出响应式状态（用于组件直接访问）
export const useRelationshipState = () => {
  return {
    runtime: computed(() => relationshipState.runtime),
    history: computed(() => relationshipState.history),
    triggeredEvents: computed(() => relationshipState.triggeredEvents),
    isLoaded: computed(() => relationshipState.isLoaded),
    activeWorldBookId: computed(() => activeWorldBookId.value),
  }
}

// 导出所有函数
export default {
  initRelationshipSystem,
  getCharacterRelationship,
  updateRelationship,
  batchUpdateRelationships,
  getAllRelationships,
  getRelationshipHistory,
  getLatestRelationshipChange,
  hasTriggeredRelationshipEvent,
  markRelationshipEventTriggered,
  checkThresholdEvents,
  getRelationshipPromptContext,
  getRelationshipSnapshot,
  resetRelationshipSystem,
  applyDirectorRelationshipDeltas,
  useRelationshipState,
  createDefaultRelationshipBase,
  createDefaultRelationshipData,
}