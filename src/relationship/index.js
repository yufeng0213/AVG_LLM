/**
 * 好感度系统模块入口
 * 导出所有好感度相关的功能
 */

// 等级定义和计算
export {
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
} from './relationshipLevels.js'

// 数据管理核心
export {
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
} from './relationshipStore.js'

// 默认导出
export default {
  // 从 relationshipLevels
  RELATIONSHIP_MIN: -100,
  RELATIONSHIP_MAX: 100,
  RELATIONSHIP_NEUTRAL: 0,
  
  // 从 relationshipStore
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