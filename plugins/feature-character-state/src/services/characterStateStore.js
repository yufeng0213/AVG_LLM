/**
 * 角色状态存储层 — 纯 JS 模块，不依赖 Vue
 * 所有角色运行时状态的单一数据源
 */
import { kvStorage } from '../../../../src/storage/index.js'
import {
  CHARACTER_STATE_STORAGE_KEY,
  normalizeCharacterState,
  createDefaultCharacterState,
} from '../types.js'

/**
 * 加载完整的角色状态映射
 * @returns {Promise<Object>} { "bookId::charId": CharacterState }
 */
export async function loadAllStates() {
  try {
    const data = await kvStorage.get(CHARACTER_STATE_STORAGE_KEY)
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

/**
 * 保存完整的角色状态映射
 */
export async function saveAllStates(states) {
  await kvStorage.set(CHARACTER_STATE_STORAGE_KEY, states)
}

/**
 * 构建运行时 key
 */
export function runtimeKey(bookId, charId) {
  return `${bookId}::${charId}`
}

/**
 * 获取单个角色状态
 * @param {string} bookId
 * @param {string} charId
 * @returns {Promise<CharacterState|null>}
 */
export async function getCharacterState(bookId, charId) {
  const states = await loadAllStates()
  const key = runtimeKey(bookId, charId)
  const raw = states[key]
  if (!raw) return null
  return normalizeCharacterState(raw)
}

/**
 * 设置单个角色状态（全量写入）
 * @param {string} bookId
 * @param {string} charId
 * @param {Object} state
 */
export async function setCharacterState(bookId, charId, state) {
  const states = await loadAllStates()
  const key = runtimeKey(bookId, charId)
  const normalized = normalizeCharacterState({
    ...state,
    id: charId,
    bookId,
    updatedAt: new Date().toISOString(),
  })
  if (!normalized.createdAt) {
    normalized.createdAt = new Date().toISOString()
  }
  states[key] = normalized
  await saveAllStates(states)
  return normalized
}

/**
 * 增量更新角色状态
 * @param {string} bookId
 * @param {string} charId
 * @param {Object} partial - 部分状态字段
 * @returns {Promise<CharacterState>}
 */
export async function updateCharacterState(bookId, charId, partial) {
  const states = await loadAllStates()
  const key = runtimeKey(bookId, charId)
  const existing = states[key] || createDefaultCharacterState()
  const merged = {
    ...existing,
    ...partial,
    id: existing.id || charId,
    bookId: existing.bookId || bookId,
    updatedAt: new Date().toISOString(),
  }
  const normalized = normalizeCharacterState(merged)
  if (!normalized.createdAt) {
    normalized.createdAt = new Date().toISOString()
  }
  states[key] = normalized
  await saveAllStates(states)
  return normalized
}

/**
 * 应用增量变化到角色状态
 * 对数值型字段执行增量操作（+=），对其他字段执行覆盖
 * @param {string} bookId
 * @param {string} charId
 * @param {Object} deltas - 增量字段，如 { affection: 5, mood: '开心' }
 * @param {string} reason - 变化原因（记录用）
 * @returns {Promise<{oldState: CharacterState, newState: CharacterState, reason: string}>}
 */
export async function applyDelta(bookId, charId, deltas, reason = '') {
  const states = await loadAllStates()
  const key = runtimeKey(bookId, charId)
  const existing = states[key] || createDefaultCharacterState()
  const oldState = normalizeCharacterState(existing)

  const merged = { ...existing }

  // 数值型增量字段
  const deltaFields = ['affection', 'energy', 'favor', 'trust', 'stance', 'scheduleAffectionDelta']
  for (const field of deltaFields) {
    if (deltas[field] !== undefined) {
      merged[field] = (merged[field] || 0) + deltas[field]
    }
  }

  // 覆盖型字段
  const overwriteFields = ['mood', 'moodExpiresAt', 'currentActivity', 'currentLocation', 'relationshipStage', 'lastInteractedAt', 'lastScheduleDate']
  for (const field of overwriteFields) {
    if (deltas[field] !== undefined) {
      merged[field] = deltas[field]
    }
  }

  // 计数器增量
  const counterFields = ['visitCount', 'chatCount', 'giftCount']
  for (const field of counterFields) {
    if (deltas[field] !== undefined) {
      merged[field] = (merged[field] || 0) + deltas[field]
    }
  }

  merged.updatedAt = new Date().toISOString()

  const normalized = normalizeCharacterState(merged)
  if (!normalized.createdAt) {
    normalized.createdAt = new Date().toISOString()
  }
  states[key] = normalized
  await saveAllStates(states)

  return { oldState, newState: normalized, reason }
}

/**
 * 获取某世界书的所有角色状态
 * @param {string} bookId
 * @returns {Promise<Array<{charId: string, state: CharacterState}>>}
 */
export async function getAllCharacterStates(bookId) {
  const states = await loadAllStates()
  const prefix = `${bookId}::`
  const result = []

  for (const [key, state] of Object.entries(states)) {
    if (key.startsWith(prefix)) {
      const charId = key.slice(prefix.length)
      result.push({ charId, state: normalizeCharacterState(state) })
    }
  }

  return result
}

/**
 * 删除角色状态
 * @param {string} bookId
 * @param {string} charId
 */
export async function removeCharacterState(bookId, charId) {
  const states = await loadAllStates()
  const key = runtimeKey(bookId, charId)
  delete states[key]
  await saveAllStates(states)
}
