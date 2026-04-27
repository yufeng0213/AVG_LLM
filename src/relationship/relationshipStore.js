/**
 * 好感度数据管理核心
 * 负责好感度数据的存储、更新、查询和事件触发
 * Android 端使用 SQLite（无需 debounce），Web 端回退到 kvStorage
 */

import { reactive, ref, computed, watch } from 'vue'
import { kvStorage } from '../storage/index.js'
import { isSQLiteAvailable, exec, query, transaction } from '../db/db.js'
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

// 同步到角色状态存储（延迟导入，避免循环依赖）
let _characterStateModule = null
async function syncToCharacterState(characterId, deltas, reason) {
  if (!_characterStateModule) {
    _characterStateModule = await import('../../plugins/feature-character-state/src/services/characterStateStore.js')
  }
  try {
    if (activeWorldBookId.value) {
      await _characterStateModule.updateCharacterState(activeWorldBookId.value, characterId, {
        favor: deltas.favor || 0,
        trust: deltas.trust || 0,
        stance: deltas.stance || 0,
      })
    }
  } catch (e) {
    console.warn('[Relationship] syncToCharacterState failed:', e.message)
  }
}

// 存储键（Web fallback 用）
const RELATIONSHIP_STORAGE_KEY = 'game_relationships'
const RELATIONSHIP_HISTORY_KEY = 'relationship_history'
const TRIGGERED_EVENTS_KEY = 'triggered_relationship_events'

// 默认关系数据结构
export const createDefaultRelationshipBase = () => ({
  favor: RELATIONSHIP_NEUTRAL,
  trust: RELATIONSHIP_NEUTRAL,
  stance: 0,
})

export const createDefaultRelationshipData = () => ({
  runtime: {},
  history: [],
  triggeredEvents: [],
})

// 响应式状态
const relationshipState = reactive({
  runtime: {},
  history: [],
  triggeredEvents: [],
  isLoaded: false,
})

const activeWorldBookId = ref(null)

// ============================================================
// SQLite 存储层
// ============================================================

async function _loadRuntimeSQLite(worldBookId) {
  const rows = await query(
    'SELECT character_id, favor, trust, stance, last_updated FROM relationship_runtime WHERE world_book_id = ?',
    [worldBookId]
  )
  const runtime = {}
  for (const r of rows) {
    runtime[r.character_id] = {
      favor: r.favor,
      trust: r.trust,
      stance: r.stance,
      lastUpdated: r.last_updated,
    }
  }
  return runtime
}

async function _loadHistorySQLite(worldBookId) {
  const rows = await query(
    'SELECT history_data FROM relationship_history WHERE world_book_id = ? ORDER BY id DESC LIMIT 200',
    [worldBookId]
  )
  return rows.map(r => JSON.parse(r.history_data))
}

async function _loadTriggeredEventsSQLite(worldBookId) {
  const rows = await query(
    'SELECT event_id FROM relationship_triggered_events WHERE world_book_id = ?',
    [worldBookId]
  )
  return rows.map(r => r.event_id)
}

async function _saveRuntimeSQLite(characterId, worldBookId, favor, trust, stance) {
  const now = new Date().toISOString()
  await exec(
    `INSERT OR REPLACE INTO relationship_runtime (character_id, world_book_id, favor, trust, stance, last_updated)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [characterId, worldBookId, favor, trust, stance, now]
  )
}

async function _addHistorySQLite(worldBookId, entry) {
  await exec(
    `INSERT INTO relationship_history (world_book_id, history_data) VALUES (?, ?)`,
    [worldBookId, JSON.stringify(entry)]
  )
  // 保留最近 200 条
  const [count] = await query(
    'SELECT COUNT(*) as cnt FROM relationship_history WHERE world_book_id = ?',
    [worldBookId]
  )
  if (count.cnt > 200) {
    await exec(
      `DELETE FROM relationship_history WHERE world_book_id = ? AND id IN (
        SELECT id FROM relationship_history WHERE world_book_id = ?
        ORDER BY id ASC LIMIT ?
      )`,
      [worldBookId, worldBookId, count.cnt - 200]
    )
  }
}

async function _addTriggeredEventSQLite(worldBookId, eventId) {
  await exec(
    `INSERT OR IGNORE INTO relationship_triggered_events (world_book_id, event_id) VALUES (?, ?)`,
    [worldBookId, eventId]
  )
}

// ============================================================
// Web fallback: kvStorage
// ============================================================

async function _loadRelationshipFromWeb(worldBookId) {
  try {
    const key = `${RELATIONSHIP_STORAGE_KEY}_${worldBookId}`
    const data = await kvStorage.get(key)
    return data || null
  } catch {
    return null
  }
}

async function _saveRelationshipToWeb() {
  if (!activeWorldBookId.value) return
  try {
    const key = `${RELATIONSHIP_STORAGE_KEY}_${activeWorldBookId.value}`
    await kvStorage.set(key, {
      runtime: relationshipState.runtime,
      history: relationshipState.history.slice(-100),
      triggeredEvents: relationshipState.triggeredEvents,
    })
  } catch (error) {
    console.error('Failed to save relationship data:', error)
  }
}

// ============================================================
// 公共 API（保持原有签名）
// ============================================================

/**
 * 初始化好感度系统
 */
export const initRelationshipSystem = async (worldBookId, initialRelationships = null) => {
  activeWorldBookId.value = worldBookId

  if (initialRelationships) {
    // 从存档加载
    relationshipState.runtime = initialRelationships.runtime || {}
    relationshipState.history = initialRelationships.history || []
    relationshipState.triggeredEvents = initialRelationships.triggeredEvents || []
  } else {
    // 从存储加载
    if (isSQLiteAvailable()) {
      try {
        const [runtime, history, triggeredEvents] = await Promise.all([
          _loadRuntimeSQLite(worldBookId),
          _loadHistorySQLite(worldBookId),
          _loadTriggeredEventsSQLite(worldBookId),
        ])
        relationshipState.runtime = runtime
        relationshipState.history = history
        relationshipState.triggeredEvents = triggeredEvents
      } catch (e) {
        console.error('[Relationship] SQLite init failed:', e.message)
        // 回退到 Web 加载
        const storedData = await _loadRelationshipFromWeb(worldBookId)
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
    } else {
      const storedData = await _loadRelationshipFromWeb(worldBookId)
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
  }

  relationshipState.isLoaded = true
}

/**
 * 获取角色的当前好感度状态
 */
export const getCharacterRelationship = (characterId, characterBase = null) => {
  const runtimeValue = relationshipState.runtime[characterId]

  if (runtimeValue) {
    return {
      favor: runtimeValue.favor,
      trust: runtimeValue.trust,
      stance: runtimeValue.stance,
      lastUpdated: runtimeValue.lastUpdated,
    }
  }

  if (characterBase && characterBase.relationshipBase) {
    return {
      favor: characterBase.relationshipBase.favor || RELATIONSHIP_NEUTRAL,
      trust: characterBase.relationshipBase.trust || RELATIONSHIP_NEUTRAL,
      stance: characterBase.relationshipBase.stance || 0,
      lastUpdated: null,
    }
  }

  return createDefaultRelationshipBase()
}

/**
 * 更新角色好感度
 */
export const updateRelationship = (characterId, deltas, reason, dialogueIndex = null) => {
  const oldValues = getCharacterRelationship(characterId)

  const newFavor = clampRelationshipValue(oldValues.favor + (deltas.favor || 0))
  const newTrust = clampRelationshipValue(oldValues.trust + (deltas.trust || 0))
  const newStance = clampRelationshipValue(oldValues.stance + (deltas.stance || 0))

  const newValues = {
    favor: newFavor,
    trust: newTrust,
    stance: newStance,
    lastUpdated: new Date().toISOString(),
  }

  relationshipState.runtime[characterId] = newValues

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

  // SQLite 立即写入（不需要 debounce）
  if (isSQLiteAvailable()) {
    _saveRuntimeSQLite(characterId, activeWorldBookId.value, newFavor, newTrust, newStance)
      .catch(e => console.error('[Relationship] SQLite save failed:', e.message))
    _addHistorySQLite(activeWorldBookId.value, historyEntry)
      .catch(e => console.error('[Relationship] SQLite history save failed:', e.message))
  } else {
    // Web: 使用原有 debounce 逻辑
    scheduleWebSave()
  }

  syncToCharacterState(characterId, deltas, reason)

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

// --- Web debounce 保存（SQLite 不需要） ---
let _saveTimer = null
const SAVE_DEBOUNCE_MS = 2000

function scheduleWebSave() {
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    _saveTimer = null
    _saveRelationshipToWeb()
  }, SAVE_DEBOUNCE_MS)
}

export function flushRelationshipSave() {
  if (isSQLiteAvailable()) return // SQLite 不需要 flush
  if (_saveTimer) {
    clearTimeout(_saveTimer)
    _saveTimer = null
    _saveRelationshipToWeb()
  }
}

/**
 * 批量更新多个角色的好感度
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
 */
export const getRelationshipHistory = (characterId = null, limit = 20) => {
  let history = relationshipState.history

  if (characterId) {
    history = history.filter(entry => entry.characterId === characterId)
  }

  history = [...history].reverse()

  return history.slice(0, limit)
}

/**
 * 获取最近的关系变化
 */
export const getLatestRelationshipChange = () => {
  if (relationshipState.history.length === 0) return null
  return relationshipState.history[relationshipState.history.length - 1]
}

/**
 * 检查是否已触发某关系事件
 */
export const hasTriggeredRelationshipEvent = (eventId) => {
  return relationshipState.triggeredEvents.includes(eventId)
}

/**
 * 标记关系事件已触发
 */
export const markRelationshipEventTriggered = (eventId) => {
  if (!relationshipState.triggeredEvents.includes(eventId)) {
    relationshipState.triggeredEvents.push(eventId)
    // SQLite 立即写入
    if (isSQLiteAvailable()) {
      _addTriggeredEventSQLite(activeWorldBookId.value, eventId)
        .catch(e => console.error('[Relationship] SQLite triggered event save failed:', e.message))
    } else {
      _saveRelationshipToWeb()
    }
  }
}

/**
 * 检查并获取可触发的阈值事件
 */
export const checkThresholdEvents = (characterId, milestones) => {
  if (!Array.isArray(milestones)) return []

  const currentRel = getCharacterRelationship(characterId)
  const triggerableEvents = []

  for (const milestone of milestones) {
    if (hasTriggeredRelationshipEvent(milestone.id)) continue

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
 */
export const resetRelationshipSystem = async (worldBookId) => {
  activeWorldBookId.value = worldBookId
  relationshipState.runtime = {}
  relationshipState.history = []
  relationshipState.triggeredEvents = []
  relationshipState.isLoaded = true

  // 清除存储
  if (isSQLiteAvailable()) {
    try {
      await exec('DELETE FROM relationship_runtime WHERE world_book_id = ?', [worldBookId])
      await exec('DELETE FROM relationship_history WHERE world_book_id = ?', [worldBookId])
      await exec('DELETE FROM relationship_triggered_events WHERE world_book_id = ?', [worldBookId])
    } catch (e) {
      console.error('[Relationship] SQLite reset failed:', e.message)
    }
  } else {
    try {
      const key = `${RELATIONSHIP_STORAGE_KEY}_${worldBookId}`
      await kvStorage.remove(key)
    } catch {
      // 忽略
    }
  }
}

/**
 * 应用关系变更数据（来自导演器）
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
