/**
 * WorldMemory — 每个世界书独立维护的剧情记忆数据库
 * 替换原 src/memory/worldMemoryStore.js
 * 存储：事件记录、角色个人记忆、世界状态标志
 * Android 端使用 SQLite，Web 开发端返回默认值
 */

import { defineStore } from 'pinia'
import { isSQLiteAvailable, exec, query, transaction } from '../db/connection.js'

const EVENT_MAX_COUNT = 500

function _capEvents(memory) {
  const events = memory.events
  if (events.length > EVENT_MAX_COUNT) {
    events.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    const keepCount = EVENT_MAX_COUNT
    for (let i = 0; i < events.length - keepCount; i++) {
      events[i].status = 'archived'
    }
    memory.events = events.slice(events.length - keepCount)
  }
}

function _createEmptyMemory(worldBookId) {
  return {
    worldBookId,
    events: [],
    characterMemories: {},
    worldFlags: {},
    milestones: [],
    lastExtractedAt: null,
    lastExtractedLineCount: 0,
  }
}

// === SQLite 存储层 ===

function _sqliteMemoryFromRows(events, charMemories, flags, milestones) {
  return {
    events: events.map(e => JSON.parse(e.event_data)),
    characterMemories: charMemories.reduce((acc, m) => {
      if (!acc[m.character_id]) acc[m.character_id] = []
      acc[m.character_id].push(JSON.parse(m.memory_data))
      return acc
    }, {}),
    worldFlags: flags.reduce((acc, f) => {
      acc[f.flag_name] = f.flag_value !== null ? JSON.parse(f.flag_value) : null
      return acc
    }, {}),
    milestones: milestones.map(m => m.milestone_name),
  }
}

async function _ensureMemorySQLite(worldBookId) {
  const [count] = await query(
    'SELECT COUNT(*) as cnt FROM memory_events WHERE world_book_id = ?', [worldBookId]
  )
  if (count.cnt === 0) {
    await exec(
      `INSERT OR REPLACE INTO memory_extraction_config (key, config_data)
       VALUES (?, ?)`,
      [`last_extracted_${worldBookId}`, JSON.stringify({
        lastExtractedAt: null,
        lastExtractedLineCount: 0,
      })]
    )
  }
}

async function _getWorldMemorySQLite(worldBookId) {
  await _ensureMemorySQLite(worldBookId)
  const events = await query('SELECT * FROM memory_events WHERE world_book_id = ?', [worldBookId])
  const charMemories = await query('SELECT * FROM memory_character_memories WHERE world_book_id = ?', [worldBookId])
  const flags = await query('SELECT * FROM memory_world_flags WHERE world_book_id = ?', [worldBookId])
  const milestones = await query('SELECT milestone_name FROM memory_milestones WHERE world_book_id = ?', [worldBookId])

  const memory = _sqliteMemoryFromRows(events, charMemories, flags, milestones)

  const [cfg] = await query(
    'SELECT config_data FROM memory_extraction_config WHERE key = ?',
    [`last_extracted_${worldBookId}`]
  )
  if (cfg) {
    const extractData = JSON.parse(cfg.config_data)
    memory.lastExtractedAt = extractData.lastExtractedAt || null
    memory.lastExtractedLineCount = extractData.lastExtractedLineCount || 0
  }
  memory.worldBookId = worldBookId
  return memory
}

// === Pinia Store ===

export const useWorldMemoryStore = defineStore('worldMemory', {
  state: () => ({
    // per-worldBook data: { 'book-1': { events, characterMemories, worldFlags, milestones, ... } }
    books: {},
    // 用于替代 CustomEvent 的计数器
    pendingUpdateCount: 0,
  }),

  actions: {
    /**
     * 加载所有世界记忆
     */
    async loadAll() {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, returning empty')
        return {}
      }

      try {
        const bookIds = await query('SELECT id FROM world_books')
        const result = {}
        for (const row of bookIds) {
          result[row.id] = await _getWorldMemorySQLite(row.id)
        }
        return result
      } catch (e) {
        console.error('[worldMemory] SQLite loadAllWorldMemories failed:', e.message)
        return {}
      }
    },

    /**
     * 获取单个世界记忆
     */
    async get(worldBookId) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, returning empty memory')
        return _createEmptyMemory(worldBookId)
      }

      try {
        return await _getWorldMemorySQLite(worldBookId)
      } catch (e) {
        console.error('[worldMemory] SQLite getWorldMemory failed:', e.message)
        return _createEmptyMemory(worldBookId)
      }
    },

    /**
     * 保存世界记忆
     */
    async save(memory) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, cannot save memory')
        return
      }

      try {
        await exec(
          `INSERT OR REPLACE INTO memory_extraction_config (key, config_data) VALUES (?, ?)`,
          [`last_extracted_${memory.worldBookId}`, JSON.stringify({
            lastExtractedAt: memory.lastExtractedAt,
            lastExtractedLineCount: memory.lastExtractedLineCount || 0,
          })]
        )
        this.pendingUpdateCount += 1
        console.log('[worldMemory] Saved memory config for', memory.worldBookId)
      } catch (e) {
        console.error('[worldMemory] SQLite saveWorldMemory failed:', e.message)
      }
    },

    /**
     * 删除单个世界记忆
     */
    async delete(worldBookId) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, cannot delete memory')
        return
      }

      try {
        await exec('DELETE FROM memory_events WHERE world_book_id = ?', [worldBookId])
        await exec('DELETE FROM memory_character_memories WHERE world_book_id = ?', [worldBookId])
        await exec('DELETE FROM memory_world_flags WHERE world_book_id = ?', [worldBookId])
        await exec('DELETE FROM memory_milestones WHERE world_book_id = ?', [worldBookId])
        await exec('DELETE FROM memory_extraction_config WHERE key = ?', [`last_extracted_${worldBookId}`])
        console.log('[worldMemory] Deleted memory for', worldBookId)
      } catch (e) {
        console.error('[worldMemory] SQLite deleteWorldMemory failed:', e.message)
      }
    },

    /**
     * 清除缓存（用于测试或手动刷新）
     */
    clearCache(worldBookId) {
      if (this.books && worldBookId) {
        delete this.books[worldBookId]
      }
    },

    /**
     * 添加事件
     */
    async addEvent(worldBookId, event) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, cannot add event')
        return null
      }

      const newEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        status: 'active',
        createdAt: new Date().toISOString(),
        ...event,
      }

      try {
        await exec(
          `INSERT INTO memory_events (id, world_book_id, event_data, status, event_type, emotional_impact, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            newEvent.id, worldBookId, JSON.stringify(newEvent),
            newEvent.status, newEvent.type || '', newEvent.emotionalImpact || 0,
            newEvent.createdAt,
          ]
        )
        const [count] = await query(
          'SELECT COUNT(*) as cnt FROM memory_events WHERE world_book_id = ?', [worldBookId]
        )
        if (count.cnt > EVENT_MAX_COUNT) {
          await exec(
            `DELETE FROM memory_events WHERE id IN (
              SELECT id FROM memory_events WHERE world_book_id = ?
              ORDER BY created_at ASC LIMIT ?
            )`,
            [worldBookId, count.cnt - EVENT_MAX_COUNT]
          )
        }
        this.pendingUpdateCount += 1
        console.log('[worldMemory] Added event', newEvent.id)
        return newEvent
      } catch (e) {
        console.error('[worldMemory] SQLite addEvent failed:', e.message)
        return null
      }
    },

    /**
     * 批量添加事件
     */
    async addEvents(worldBookId, events) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, cannot add events')
        return
      }

      const newEvents = events.map(event => ({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        status: 'active',
        createdAt: new Date().toISOString(),
        ...event,
      }))

      try {
        await transaction(async () => {
          for (const e of newEvents) {
            await exec(
              `INSERT INTO memory_events (id, world_book_id, event_data, status, event_type, emotional_impact, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                e.id, worldBookId, JSON.stringify(e),
                e.status, e.type || '', e.emotionalImpact || 0, e.createdAt,
              ]
            )
          }
          const [count] = await query(
            'SELECT COUNT(*) as cnt FROM memory_events WHERE world_book_id = ?', [worldBookId]
          )
          if (count.cnt > EVENT_MAX_COUNT) {
            await exec(
              `DELETE FROM memory_events WHERE id IN (
                SELECT id FROM memory_events WHERE world_book_id = ?
                ORDER BY created_at ASC LIMIT ?
              )`,
              [worldBookId, count.cnt - EVENT_MAX_COUNT]
            )
          }
        })
        this.pendingUpdateCount += events.length
        console.log('[worldMemory] Added', events.length, 'events')
      } catch (e) {
        console.error('[worldMemory] SQLite addEvents failed:', e.message)
      }
    },

    /**
     * 查询事件
     */
    async queryEvents(worldBookId, filters = {}) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, returning empty events')
        return []
      }

      try {
        let sql = 'SELECT * FROM memory_events WHERE world_book_id = ?'
        const params = [worldBookId]

        if (filters.participants?.length > 0) {
          const conditions = filters.participants.map(() => `json_extract(event_data, '$.participants') LIKE ?`).join(' OR ')
          sql = `SELECT * FROM memory_events WHERE world_book_id = ? AND (${conditions})`
          for (const p of filters.participants) {
            params.push(`%"${p}"%`)
          }
        }
        if (filters.type) {
          sql += ` AND event_type = ?`
          params.push(filters.type)
        }
        if (filters.status) {
          sql += ` AND status = ?`
          params.push(filters.status)
        }
        if (filters.minImpact) {
          sql += ` AND emotional_impact >= ?`
          params.push(filters.minImpact)
        }
        if (filters.excludeFading) {
          sql += ` AND status NOT IN ('fading', 'resolved')`
        }
        sql += ' ORDER BY created_at DESC'
        if (filters.limit) {
          sql += ` LIMIT ?`
          params.push(filters.limit)
        }

        const rows = await query(sql, params)
        return rows.map(r => JSON.parse(r.event_data))
      } catch (e) {
        console.error('[worldMemory] SQLite queryEvents failed:', e.message)
        return []
      }
    },

    /**
     * 更新事件状态
     */
    async updateEventStatus(worldBookId, eventId, status) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, cannot update event status')
        return
      }

      try {
        await exec(
          `UPDATE memory_events SET status = ?, event_data = json_set(event_data, '$.status', ?)
           WHERE world_book_id = ? AND id = ?`,
          [status, status, worldBookId, eventId]
        )
      } catch (e) {
        console.error('[worldMemory] SQLite updateEventStatus failed:', e.message)
      }
    },

    /**
     * 事件衰减：清理过期低强度事件
     */
    async decayEvents(worldBookId, options = {}) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, cannot decay events')
        return
      }

      const { daysThreshold = 30, impactThreshold = 40 } = options
      const cutoff = Date.now() - daysThreshold * 24 * 60 * 60 * 1000

      try {
        await exec(
          `UPDATE memory_events SET status = 'fading', event_data = json_set(event_data, '$.status', 'fading')
           WHERE world_book_id = ? AND status = 'active'
           AND emotional_impact < ?
           AND CAST(json_extract(event_data, '$.createdAt') AS INTEGER) < ?`,
          [worldBookId, impactThreshold, new Date(cutoff).toISOString()]
        )
      } catch (e) {
        console.error('[worldMemory] SQLite decayEvents failed:', e.message)
      }
    },

    /**
     * 获取角色记忆
     */
    async getCharacterMemories(worldBookId, characterId) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, returning empty character memories')
        return []
      }

      try {
        const rows = await query(
          'SELECT * FROM memory_character_memories WHERE world_book_id = ? AND character_id = ?',
          [worldBookId, characterId]
        )
        return rows.map(r => JSON.parse(r.memory_data))
      } catch (e) {
        console.error('[worldMemory] SQLite getCharacterMemories failed:', e.message)
        return []
      }
    },

    /**
     * 添加角色记忆
     */
    async addCharacterMemory(worldBookId, characterId, memoryEntry) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, cannot add character memory')
        return null
      }

      const entry = {
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        ...memoryEntry,
      }

      try {
        await exec(
          `INSERT INTO memory_character_memories (id, world_book_id, character_id, memory_data, about, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            entry.id, worldBookId, characterId, JSON.stringify(entry),
            entry.about || '', entry.status || 'active', entry.createdAt,
          ]
        )
        this.pendingUpdateCount += 1
        console.log('[worldMemory] Added character memory', entry.id)
        return entry
      } catch (e) {
        console.error('[worldMemory] SQLite addCharacterMemory failed:', e.message)
        return null
      }
    },

    /**
     * 批量添加角色记忆
     */
    async addCharacterMemoriesBatch(worldBookId, items) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, cannot add character memories batch')
        return []
      }

      const entries = items.map(({ characterId, memoryEntry }) => ({
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        ...memoryEntry,
        characterId,
      }))

      try {
        await transaction(async () => {
          for (const e of entries) {
            await exec(
              `INSERT INTO memory_character_memories (id, world_book_id, character_id, memory_data, about, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                e.id, worldBookId, e.characterId, JSON.stringify(e),
                e.about || '', e.status || 'active', e.createdAt,
              ]
            )
          }
        })
        if (items.length > 0) this.pendingUpdateCount += items.length
        console.log('[worldMemory] Added', items.length, 'character memories')
        return entries
      } catch (e) {
        console.error('[worldMemory] SQLite addCharacterMemoriesBatch failed:', e.message)
        return []
      }
    },

    /**
     * 获取共享上下文（两个角色之间的共同记忆）
     */
    async getSharedContext(worldBookId, charA, charB) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, returning empty shared context')
        return { sharedEvents: [], aAboutB: [], bAboutA: [] }
      }

      try {
        const eventRows = await query(
          `SELECT * FROM memory_events WHERE world_book_id = ? AND status = 'active'
           ORDER BY created_at DESC LIMIT 8`,
          [worldBookId]
        )
        const sharedEvents = eventRows
          .map(r => JSON.parse(r.event_data))
          .filter(e =>
            Array.isArray(e.participants) &&
            e.participants.includes(charA) &&
            e.participants.includes(charB)
          )

        const aRows = await query(
          `SELECT * FROM memory_character_memories
           WHERE world_book_id = ? AND character_id = ? AND status != 'resolved'
           ORDER BY created_at DESC LIMIT 5`,
          [worldBookId, charA]
        )
        const aAboutB = aRows
          .map(r => JSON.parse(r.memory_data))
          .filter(m => m.about === charB)

        const bRows = await query(
          `SELECT * FROM memory_character_memories
           WHERE world_book_id = ? AND character_id = ? AND status != 'resolved'
           ORDER BY created_at DESC LIMIT 5`,
          [worldBookId, charB]
        )
        const bAboutA = bRows
          .map(r => JSON.parse(r.memory_data))
          .filter(m => m.about === charA)

        return { sharedEvents: sharedEvents.slice(-8), aAboutB: aAboutB.slice(-5), bAboutA: bAboutA.slice(-5) }
      } catch (e) {
        console.error('[worldMemory] SQLite getSharedContext failed:', e.message)
        return { sharedEvents: [], aAboutB: [], bAboutA: [] }
      }
    },

    /**
     * 设置世界标志
     */
    async setWorldFlag(worldBookId, flagName, value) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, cannot set world flag')
        return
      }

      try {
        await exec(
          `INSERT OR REPLACE INTO memory_world_flags (world_book_id, flag_name, flag_value)
           VALUES (?, ?, ?)`,
          [worldBookId, flagName, JSON.stringify(value)]
        )
        this.pendingUpdateCount += 1
      } catch (e) {
        console.error('[worldMemory] SQLite setWorldFlag failed:', e.message)
      }
    },

    /**
     * 获取世界标志
     */
    async getWorldFlag(worldBookId, flagName, defaultValue = null) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, returning default world flag')
        return defaultValue
      }

      try {
        const [row] = await query(
          'SELECT flag_value FROM memory_world_flags WHERE world_book_id = ? AND flag_name = ?',
          [worldBookId, flagName]
        )
        if (!row) return defaultValue
        return row.flag_value !== null ? JSON.parse(row.flag_value) : null
      } catch (e) {
        console.error('[worldMemory] SQLite getWorldFlag failed:', e.message)
        return defaultValue
      }
    },

    /**
     * 添加里程碑
     */
    async addMilestone(worldBookId, name) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, cannot add milestone')
        return
      }

      try {
        await exec(
          `INSERT OR IGNORE INTO memory_milestones (world_book_id, milestone_name) VALUES (?, ?)`,
          [worldBookId, name]
        )
        this.pendingUpdateCount += 1
      } catch (e) {
        console.error('[worldMemory] SQLite addMilestone failed:', e.message)
      }
    },

    /**
     * 获取提取配置
     */
    async getExtractionConfig() {
      const defaults = { batchSize: 5 }
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, returning default extraction config')
        return defaults
      }

      try {
        const [row] = await query(
          'SELECT config_data FROM memory_extraction_config WHERE key = ?',
          ['world_memories_config']
        )
        if (!row) return defaults
        const cfg = JSON.parse(row.config_data)
        return { ...defaults, ...cfg }
      } catch (e) {
        console.error('[worldMemory] SQLite getExtractionConfig failed:', e.message)
        return defaults
      }
    },

    /**
     * 保存提取配置
     */
    async saveExtractionConfig(config) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, cannot save extraction config')
        return
      }

      const current = await this.getExtractionConfig()
      try {
        await exec(
          `INSERT OR REPLACE INTO memory_extraction_config (key, config_data) VALUES (?, ?)`,
          ['world_memories_config', JSON.stringify({ ...current, ...config })]
        )
      } catch (e) {
        console.error('[worldMemory] SQLite saveExtractionConfig failed:', e.message)
      }
    },

    /**
     * 记录提取
     */
    async recordExtraction(worldBookId, lineCount) {
      if (!isSQLiteAvailable()) {
        console.warn('[worldMemory] SQLite not available, cannot record extraction')
        return
      }

      try {
        await exec(
          `INSERT OR REPLACE INTO memory_extraction_config (key, config_data) VALUES (?, ?)`,
          [`last_extracted_${worldBookId}`, JSON.stringify({
            lastExtractedAt: new Date().toISOString(),
            lastExtractedLineCount: lineCount,
          })]
        )
      } catch (e) {
        console.error('[worldMemory] SQLite recordExtraction failed:', e.message)
      }
    },

    /**
     * 读取并消费待更新计数（替代 CustomEvent）
     */
    consumePendingUpdates() {
      const count = this.pendingUpdateCount
      this.pendingUpdateCount = 0
      return count
    },
  },
})
