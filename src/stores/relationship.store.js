/**
 * 好感度数据状态 — Pinia Store
 * 替换原 src/relationship/relationshipStore.js
 * Android 端使用 SQLite，Web 开发端返回默认值
 */

import { defineStore } from 'pinia'
import { isSQLiteAvailable, exec, query, transaction } from '../db/connection.js'
import {
  RELATIONSHIP_NEUTRAL,
  clampRelationshipValue,
  getChangeMagnitude,
  getRelationshipDescription,
  getRelationshipLevel,
  getRelationshipInfluenceHint,
} from '../relationship/relationshipLevels.js'

// 同步到角色状态存储（延迟导入，避免循环依赖）
let _characterStateModule = null
async function syncToCharacterState(activeWorldBookId, characterId, deltas, reason) {
  if (!_characterStateModule) {
    _characterStateModule = await import('../../plugins/feature-character-state/src/services/characterStateStore.js')
  }
  try {
    if (activeWorldBookId) {
      await _characterStateModule.updateCharacterState(activeWorldBookId, characterId, {
        favor: deltas.favor || 0,
        trust: deltas.trust || 0,
        stance: deltas.stance || 0,
      })
    }
  } catch (e) {
    console.warn('[Relationship] syncToCharacterState failed:', e.message)
  }
}

// === SQLite 存储层 ===

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

// === Pinia Store ===

export const useRelationshipStore = defineStore('relationship', {
  state: () => ({
    runtime: {},
    history: [],
    triggeredEvents: [],
    isLoaded: false,
    activeWorldBookId: null,
  }),

  actions: {
    /**
     * 初始化好感度系统
     */
    async init(worldBookId, initialRelationships = null) {
      this.activeWorldBookId = worldBookId

      if (initialRelationships) {
        this.runtime = initialRelationships.runtime || {}
        this.history = initialRelationships.history || []
        this.triggeredEvents = initialRelationships.triggeredEvents || []
      } else {
        if (!isSQLiteAvailable()) {
          console.warn('[Relationship] SQLite not available, using empty relationships')
          this.runtime = {}
          this.history = []
          this.triggeredEvents = []
        } else {
          try {
            const [runtime, history, triggeredEvents] = await Promise.all([
              _loadRuntimeSQLite(worldBookId),
              _loadHistorySQLite(worldBookId),
              _loadTriggeredEventsSQLite(worldBookId),
            ])
            this.runtime = runtime
            this.history = history
            this.triggeredEvents = triggeredEvents
            console.log('[Relationship] Loaded from SQLite:', Object.keys(runtime).length, 'characters')
          } catch (e) {
            console.error('[Relationship] SQLite init failed:', e.message)
            this.runtime = {}
            this.history = []
            this.triggeredEvents = []
          }
        }
      }

      this.isLoaded = true
    },

    /**
     * 获取角色的当前好感度状态
     */
    getCharacter(characterId, characterBase = null) {
      const runtimeValue = this.runtime[characterId]

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

      return {
        favor: RELATIONSHIP_NEUTRAL,
        trust: RELATIONSHIP_NEUTRAL,
        stance: 0,
      }
    },

    /**
     * 更新角色好感度
     */
    update(characterId, deltas, reason, dialogueIndex = null) {
      const oldValues = this.getCharacter(characterId)

      const newFavor = clampRelationshipValue(oldValues.favor + (deltas.favor || 0))
      const newTrust = clampRelationshipValue(oldValues.trust + (deltas.trust || 0))
      const newStance = clampRelationshipValue(oldValues.stance + (deltas.stance || 0))

      const newValues = {
        favor: newFavor,
        trust: newTrust,
        stance: newStance,
        lastUpdated: new Date().toISOString(),
      }

      this.runtime[characterId] = newValues

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
      this.history.push(historyEntry)

      if (isSQLiteAvailable()) {
        _saveRuntimeSQLite(characterId, this.activeWorldBookId, newFavor, newTrust, newStance)
          .catch(e => console.error('[Relationship] SQLite save failed:', e.message))
        _addHistorySQLite(this.activeWorldBookId, historyEntry)
          .catch(e => console.error('[Relationship] SQLite history save failed:', e.message))
      } else {
        console.warn('[Relationship] SQLite not available, relationship update not persisted')
      }

      syncToCharacterState(this.activeWorldBookId, characterId, deltas, reason)

      return {
        characterId,
        oldValues,
        newValues,
        changes: {
          favor: getChangeMagnitude(deltas.favor || 0),
          trust: getChangeMagnitude(deltas.trust || 0),
        },
        historyEntry,
      }
    },

    /**
     * 批量更新多个角色的好感度
     */
    batchUpdate(updates) {
      if (!Array.isArray(updates)) return []
      return updates.map(u => this.update(u.characterId, u.deltas, u.reason, u.dialogueIndex))
    },

    /**
     * 获取所有角色的关系状态
     */
    getAll(characters) {
      const result = {}
      if (Array.isArray(characters)) {
        for (const char of characters) {
          result[char.id] = this.getCharacter(char.id, char)
        }
      }
      return result
    },

    /**
     * 获取关系变化历史
     */
    getHistory(characterId = null, limit = 20) {
      let history = characterId
        ? this.history.filter(entry => entry.characterId === characterId)
        : [...this.history]
      history.reverse()
      return history.slice(0, limit)
    },

    /**
     * 获取最近的关系变化
     */
    getLatest() {
      if (this.history.length === 0) return null
      return this.history[this.history.length - 1]
    },

    /**
     * 检查是否已触发某关系事件
     */
    hasTriggeredEvent(eventId) {
      return this.triggeredEvents.includes(eventId)
    },

    /**
     * 标记关系事件已触发
     */
    markEventTriggered(eventId) {
      if (!this.triggeredEvents.includes(eventId)) {
        this.triggeredEvents.push(eventId)
        if (isSQLiteAvailable()) {
          _addTriggeredEventSQLite(this.activeWorldBookId, eventId)
            .catch(e => console.error('[Relationship] SQLite triggered event save failed:', e.message))
        } else {
          console.warn('[Relationship] SQLite not available, triggered event not persisted')
        }
      }
    },

    /**
     * 检查并获取可触发的阈值事件
     */
    checkThresholdEvents(characterId, milestones) {
      if (!Array.isArray(milestones)) return []
      const currentRel = this.getCharacter(characterId)
      return milestones.filter(milestone => {
        if (this.hasTriggeredEvent(milestone.id)) return false
        if (milestone.favorThreshold !== undefined && currentRel.favor >= milestone.favorThreshold) return true
        if (milestone.trustThreshold !== undefined && currentRel.trust >= milestone.trustThreshold) return true
        return false
      }).map(milestone => ({ ...milestone, characterId, currentValues: currentRel }))
    },

    /**
     * 获取关系状态描述（用于 Prompt）
     */
    getPromptContext(characters) {
      if (!Array.isArray(characters) || characters.length === 0) return ''

      const lines = ['【角色关系状态】']
      for (const char of characters) {
        const relationship = this.getCharacter(char.id, char)
        const level = getRelationshipLevel(relationship.favor)
        const desc = getRelationshipDescription(relationship, char)
        lines.push(`- ${char.name} (好感度: ${relationship.favor}/${level.name}): ${desc}`)
      }
      lines.push('')
      lines.push('【关系影响提示】')
      lines.push(getRelationshipInfluenceHint(characters, this.runtime))
      return lines.join('\n')
    },

    /**
     * 获取关系快照（用于存档）
     */
    getSnapshot() {
      return {
        runtime: { ...this.runtime },
        history: [...this.history],
        triggeredEvents: [...this.triggeredEvents],
      }
    },

    /**
     * 重置关系系统（用于新游戏）
     */
    async reset(worldBookId) {
      this.activeWorldBookId = worldBookId
      this.runtime = {}
      this.history = []
      this.triggeredEvents = []
      this.isLoaded = true

      if (!isSQLiteAvailable()) {
        console.warn('[Relationship] SQLite not available, reset not persisted')
        return
      }

      try {
        await exec('DELETE FROM relationship_runtime WHERE world_book_id = ?', [worldBookId])
        await exec('DELETE FROM relationship_history WHERE world_book_id = ?', [worldBookId])
        await exec('DELETE FROM relationship_triggered_events WHERE world_book_id = ?', [worldBookId])
        console.log('[Relationship] Reset relationship data for', worldBookId)
      } catch (e) {
        console.error('[Relationship] SQLite reset failed:', e.message)
      }
    },

    /**
     * 应用关系变更数据（来自导演器）
     */
    applyDirectorDeltas(deltas, reason = '导演器事件') {
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
      return this.batchUpdate(updates)
    },
  },
})
