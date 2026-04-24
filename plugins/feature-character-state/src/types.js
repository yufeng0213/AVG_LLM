/**
 * 角色状态类型定义与常量
 */

// 存储 key
export const CHARACTER_STATE_STORAGE_KEY = 'avg_llm_character_state_v1'

/**
 * 角色运行时状态
 * 存储结构: { "bookId::charId": CharacterState }
 */
export function createDefaultCharacterState() {
  return {
    // 基础属性
    id: '',
    bookId: '',
    name: '',

    // 情感状态
    affection: 0,           // 0-100
    energy: 50,             // 0-100
    mood: '平静',           // 心情标签
    moodExpiresAt: null,    // 心情过期时间 ISO

    // 关系状态
    relationshipStage: 'stranger', // 关系阶段
    favor: 0,               // -100~100
    trust: 0,               // -100~100
    stance: 0,              // -100~100

    // 行为统计
    visitCount: 0,
    chatCount: 0,
    giftCount: 0,
    lastInteractedAt: null,  // ISO
    lastScheduleDate: null,  // ISO

    // 日程关联
    currentActivity: '',
    currentLocation: '',
    scheduleAffectionDelta: 0,

    // 元数据
    createdAt: null,
    updatedAt: null,
  }
}

/**
 * 关系阶段定义
 */
export const RELATIONSHIP_STAGES = [
  { id: 'stranger', label: '陌生', minAffection: 0 },
  { id: 'familiar', label: '熟悉', minAffection: 30 },
  { id: 'intimate', label: '亲密', minAffection: 60 },
  { id: 'bond', label: '羁绊', minAffection: 82 },
]

/**
 * 心情标签库
 */
export const MOOD_LABELS = [
  '平静', '开心', '专注', '疲惫', '兴奋',
  '忧伤', '焦虑', '满足', '愤怒', '好奇',
  '害羞', '困倦', '放松', '紧张', '自信',
]

/**
 * 从 affection 值解析关系阶段
 */
export function resolveStageFromAffection(affection) {
  let stage = RELATIONSHIP_STAGES[0]
  for (const s of RELATIONSHIP_STAGES) {
    if (affection >= s.minAffection) stage = s
  }
  return stage
}

/**
 * 归一化角色状态（确保所有字段有默认值，数值在合法范围内）
 */
export function normalizeCharacterState(state) {
  const defaults = createDefaultCharacterState()
  return {
    ...defaults,
    ...state,
    affection: clampInt(state.affection ?? defaults.affection, 0, 100),
    energy: clampInt(state.energy ?? defaults.energy, 0, 100),
    favor: clampInt(state.favor ?? defaults.favor, -100, 100),
    trust: clampInt(state.trust ?? defaults.trust, -100, 100),
    stance: clampInt(state.stance ?? defaults.stance, -100, 100),
    mood: state.mood || defaults.mood,
    relationshipStage: state.relationshipStage || defaults.relationshipStage,
  }
}

function clampInt(value, min, max) {
  const n = Math.round(Number(value) || 0)
  return Math.max(min, Math.min(max, n))
}
