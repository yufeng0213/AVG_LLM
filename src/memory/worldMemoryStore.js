/**
 * WorldMemory — 每个世界书独立维护的剧情记忆数据库
 * 存储：事件记录、角色个人记忆、世界状态标志
 * Android 端使用 SQLite，Web 端回退到 kvStorage
 */
import { isSQLiteAvailable, exec, query, transaction } from '../db/db.js'
import { kvStorage } from '../storage/index.js'

const STORAGE_KEY = 'world_memories'

// ============================================================
// Web fallback: 使用现有 kvStorage 逻辑
// ============================================================

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

let _cache = null
let _loaded = false

async function _loadAllWeb() {
  if (!_loaded) {
    try {
      const data = await kvStorage.get(STORAGE_KEY)
      _cache = data && typeof data === 'object' ? data : {}
      _loaded = true
    } catch {
      _cache = {}
      _loaded = true
    }
  }
  return _cache
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

// ============================================================
// SQLite 存储层
// ============================================================

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
  // 检查是否已有事件（代表存在）
  const [count] = await query(
    'SELECT COUNT(*) as cnt FROM memory_events WHERE world_book_id = ?', [worldBookId]
  )
  if (count.cnt === 0) {
    // 初始化提取配置字段
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

  // 提取配置
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

function _safeJsonValue(str, fallback) {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

// ============================================================
// 公共 API（保持原有签名）
// ============================================================

export async function loadAllWorldMemories() {
  if (typeof window === 'undefined') return {}
  if (isSQLiteAvailable()) {
    try {
      const bookIds = await query('SELECT id FROM world_books')
      const result = {}
      for (const row of bookIds) {
        result[row.id] = await _getWorldMemorySQLite(row.id)
      }
      return result
    } catch (e) {
      console.error('[worldMemory] SQLite loadAllWorldMemories failed:', e.message)
    }
  }
  return _loadAllWeb()
}

export async function getWorldMemory(worldBookId) {
  if (typeof window === 'undefined') return _createEmptyMemory(worldBookId)

  if (isSQLiteAvailable()) {
    try {
      return await _getWorldMemorySQLite(worldBookId)
    } catch (e) {
      console.error('[worldMemory] SQLite getWorldMemory failed:', e.message)
    }
  }

  // Web fallback
  const all = await _loadAllWeb()
  if (!all[worldBookId]) {
    all[worldBookId] = _createEmptyMemory(worldBookId)
  }
  return all[worldBookId]
}

export async function saveWorldMemory(memory) {
  if (typeof window === 'undefined') return

  if (isSQLiteAvailable()) {
    try {
      // 保存提取配置
      await exec(
        `INSERT OR REPLACE INTO memory_extraction_config (key, config_data) VALUES (?, ?)`,
        [`last_extracted_${memory.worldBookId}`, JSON.stringify({
          lastExtractedAt: memory.lastExtractedAt,
          lastExtractedLineCount: memory.lastExtractedLineCount || 0,
        })]
      )
      window.dispatchEvent(new CustomEvent('worldMemory:updated', {
        detail: { worldBookId: memory.worldBookId, updateType: 'save', count: 1 }
      }))
      return
    } catch (e) {
      console.error('[worldMemory] SQLite saveWorldMemory failed:', e.message)
    }
  }

  // Web fallback
  const all = await _loadAllWeb()
  all[memory.worldBookId] = memory
  try {
    await kvStorage.set(STORAGE_KEY, all)
  } catch (e) {
    console.warn('[worldMemory] save failed:', e.message)
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('worldMemory:updated', {
      detail: { worldBookId: memory.worldBookId, updateType: 'save', count: 1 }
    }))
  }
}

export async function flushDirty() {
  // SQLite 不需要 flush，每次写入都是事务性的
  if (!isSQLiteAvailable() && typeof window !== 'undefined') {
    try {
      await kvStorage.set(STORAGE_KEY, _cache)
    } catch (e) {
      console.warn('[worldMemory] flush failed:', e.message)
    }
  }
}

export async function deleteWorldMemory(worldBookId) {
  if (typeof window === 'undefined') return

  if (isSQLiteAvailable()) {
    try {
      await exec('DELETE FROM memory_events WHERE world_book_id = ?', [worldBookId])
      await exec('DELETE FROM memory_character_memories WHERE world_book_id = ?', [worldBookId])
      await exec('DELETE FROM memory_world_flags WHERE world_book_id = ?', [worldBookId])
      await exec('DELETE FROM memory_milestones WHERE world_book_id = ?', [worldBookId])
      await exec('DELETE FROM memory_extraction_config WHERE key = ?', [`last_extracted_${worldBookId}`])
      return
    } catch (e) {
      console.error('[worldMemory] SQLite deleteWorldMemory failed:', e.message)
    }
  }

  // Web fallback
  if (_loaded && _cache) {
    delete _cache[worldBookId]
  }
  await kvStorage.set(STORAGE_KEY, _cache)
}

export function clearWorldMemoryCache(worldBookId) {
  if (_cache && worldBookId) {
    delete _cache[worldBookId]
  }
}

// ===== 事件操作 =====

export async function addEvent(worldBookId, event) {
  const newEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    status: 'active',
    createdAt: new Date().toISOString(),
    ...event,
  }

  if (isSQLiteAvailable()) {
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
      // 事件数量限制
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
      window.dispatchEvent(new CustomEvent('worldMemory:updated', {
        detail: { worldBookId, updateType: 'event', count: 1 }
      }))
      return newEvent
    } catch (e) {
      console.error('[worldMemory] SQLite addEvent failed:', e.message)
    }
  }

  // Web fallback
  const memory = await getWorldMemory(worldBookId)
  memory.events.push(newEvent)
  _capEvents(memory)
  return newEvent
}

export async function addEvents(worldBookId, events) {
  const newEvents = events.map(event => ({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    status: 'active',
    createdAt: new Date().toISOString(),
    ...event,
  }))

  if (isSQLiteAvailable()) {
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
        // 事件数量限制
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
      window.dispatchEvent(new CustomEvent('worldMemory:updated', {
        detail: { worldBookId, updateType: 'events', count: events.length }
      }))
      return
    } catch (e) {
      console.error('[worldMemory] SQLite addEvents failed:', e.message)
    }
  }

  // Web fallback
  const memory = await getWorldMemory(worldBookId)
  for (const event of newEvents) { memory.events.push(event) }
  _capEvents(memory)
}

export async function queryEvents(worldBookId, filters = {}) {
  if (isSQLiteAvailable()) {
    try {
      let sql = 'SELECT * FROM memory_events WHERE world_book_id = ?'
      const params = [worldBookId]

      if (filters.participants?.length > 0) {
        sql = 'SELECT * FROM memory_events WHERE world_book_id = ?'
        // SQLite JSON 过滤：event_data.participants 包含任意指定 ID
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
    }
  }

  // Web fallback
  const memory = await getWorldMemory(worldBookId)
  let results = memory.events
  if (filters.participants?.length > 0) {
    const ids = new Set(filters.participants)
    results = results.filter(e =>
      Array.isArray(e.participants) && e.participants.some(p => ids.has(p))
    )
  }
  if (filters.type) results = results.filter(e => e.type === filters.type)
  if (filters.status) results = results.filter(e => e.status === filters.status)
  if (filters.minImpact) results = results.filter(e => (e.emotionalImpact || 0) >= filters.minImpact)
  if (filters.excludeFading) results = results.filter(e => e.status !== 'fading' && e.status !== 'resolved')
  results = [...results].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  if (filters.limit) results = results.slice(0, filters.limit)
  return results
}

export async function updateEventStatus(worldBookId, eventId, status) {
  if (isSQLiteAvailable()) {
    try {
      await exec(
        `UPDATE memory_events SET status = ?, event_data = json_set(event_data, '$.status', ?)
         WHERE world_book_id = ? AND id = ?`,
        [status, status, worldBookId, eventId]
      )
      return
    } catch (e) {
      console.error('[worldMemory] SQLite updateEventStatus failed:', e.message)
    }
  }

  // Web fallback
  const memory = await getWorldMemory(worldBookId)
  const event = memory.events.find(e => e.id === eventId)
  if (event) event.status = status
}

export async function decayEvents(worldBookId, options = {}) {
  const { daysThreshold = 30, impactThreshold = 40 } = options
  const cutoff = Date.now() - daysThreshold * 24 * 60 * 60 * 1000

  if (isSQLiteAvailable()) {
    try {
      await exec(
        `UPDATE memory_events SET status = 'fading', event_data = json_set(event_data, '$.status', 'fading')
         WHERE world_book_id = ? AND status = 'active'
         AND emotional_impact < ?
         AND CAST(json_extract(event_data, '$.createdAt') AS INTEGER) < ?`,
        [worldBookId, impactThreshold, new Date(cutoff).toISOString()]
      )
      return
    } catch (e) {
      console.error('[worldMemory] SQLite decayEvents failed:', e.message)
    }
  }

  // Web fallback
  const memory = await getWorldMemory(worldBookId)
  let changed = false
  for (const event of memory.events) {
    if (event.status === 'active') {
      const eventTime = new Date(event.createdAt).getTime()
      if (eventTime < cutoff && (event.emotionalImpact || 0) < impactThreshold) {
        event.status = 'fading'
        changed = true
      }
    }
  }
}

// ===== 角色记忆操作 =====

export async function getCharacterMemories(worldBookId, characterId) {
  if (isSQLiteAvailable()) {
    try {
      const rows = await query(
        'SELECT * FROM memory_character_memories WHERE world_book_id = ? AND character_id = ?',
        [worldBookId, characterId]
      )
      return rows.map(r => JSON.parse(r.memory_data))
    } catch (e) {
      console.error('[worldMemory] SQLite getCharacterMemories failed:', e.message)
    }
  }

  // Web fallback
  const memory = await getWorldMemory(worldBookId)
  return memory.characterMemories[characterId] || []
}

export async function addCharacterMemory(worldBookId, characterId, memoryEntry) {
  const entry = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    ...memoryEntry,
  }

  if (isSQLiteAvailable()) {
    try {
      await exec(
        `INSERT INTO memory_character_memories (id, world_book_id, character_id, memory_data, about, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id, worldBookId, characterId, JSON.stringify(entry),
          entry.about || '', entry.status || 'active', entry.createdAt,
        ]
      )
      window.dispatchEvent(new CustomEvent('worldMemory:updated', {
        detail: { worldBookId, updateType: 'characterMemory', count: 1 }
      }))
      return entry
    } catch (e) {
      console.error('[worldMemory] SQLite addCharacterMemory failed:', e.message)
    }
  }

  // Web fallback
  const memory = await getWorldMemory(worldBookId)
  if (!memory.characterMemories[characterId]) memory.characterMemories[characterId] = []
  memory.characterMemories[characterId].push(entry)
  return entry
}

export async function addCharacterMemoriesBatch(worldBookId, items) {
  const entries = items.map(({ characterId, memoryEntry }) => ({
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    ...memoryEntry,
    characterId,
  }))

  if (isSQLiteAvailable()) {
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
      if (items.length > 0) {
        window.dispatchEvent(new CustomEvent('worldMemory:updated', {
          detail: { worldBookId, updateType: 'characterMemory', count: items.length }
        }))
      }
      return entries
    } catch (e) {
      console.error('[worldMemory] SQLite addCharacterMemoriesBatch failed:', e.message)
    }
  }

  // Web fallback
  const memory = await getWorldMemory(worldBookId)
  const resultEntries = []
  for (const { characterId, memoryEntry } of items) {
    if (!memory.characterMemories[characterId]) memory.characterMemories[characterId] = []
    const entry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      ...memoryEntry,
    }
    memory.characterMemories[characterId].push(entry)
    resultEntries.push(entry)
  }
  return resultEntries
}

export async function getSharedContext(worldBookId, charA, charB) {
  if (isSQLiteAvailable()) {
    try {
      // 共享事件
      const eventRows = await query(
        `SELECT * FROM memory_events WHERE world_book_id = ? AND status = 'active'
         ORDER BY created_at DESC LIMIT 8`,
        [worldBookId]
      )
      // 在 JS 层过滤双方参与的
      const sharedEvents = eventRows
        .map(r => JSON.parse(r.event_data))
        .filter(e =>
          Array.isArray(e.participants) &&
          e.participants.includes(charA) &&
          e.participants.includes(charB)
        )

      // A 关于 B 的记忆
      const aRows = await query(
        `SELECT * FROM memory_character_memories
         WHERE world_book_id = ? AND character_id = ? AND status != 'resolved'
         ORDER BY created_at DESC LIMIT 5`,
        [worldBookId, charA]
      )
      const aAboutB = aRows
        .map(r => JSON.parse(r.memory_data))
        .filter(m => m.about === charB)

      // B 关于 A 的记忆
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
    }
  }

  // Web fallback
  const memory = await getWorldMemory(worldBookId)
  const sharedEvents = memory.events.filter(e =>
    Array.isArray(e.participants) &&
    e.participants.includes(charA) &&
    e.participants.includes(charB) &&
    e.status === 'active'
  )
  const aAboutB = (memory.characterMemories[charA] || [])
    .filter(m => m.about === charB && m.status !== 'resolved')
  const bAboutA = (memory.characterMemories[charB] || [])
    .filter(m => m.about === charA && m.status !== 'resolved')
  return {
    sharedEvents: sharedEvents.slice(-8),
    aAboutB: aAboutB.slice(-5),
    bAboutA: bAboutA.slice(-5),
  }
}

// ===== 世界标志操作 =====

export async function setWorldFlag(worldBookId, flagName, value) {
  if (isSQLiteAvailable()) {
    try {
      await exec(
        `INSERT OR REPLACE INTO memory_world_flags (world_book_id, flag_name, flag_value)
         VALUES (?, ?, ?)`,
        [worldBookId, flagName, JSON.stringify(value)]
      )
      window.dispatchEvent(new CustomEvent('worldMemory:updated', {
        detail: { worldBookId, updateType: 'flag', count: 1 }
      }))
      return
    } catch (e) {
      console.error('[worldMemory] SQLite setWorldFlag failed:', e.message)
    }
  }

  // Web fallback
  const memory = await getWorldMemory(worldBookId)
  memory.worldFlags[flagName] = value
}

export async function getWorldFlag(worldBookId, flagName, defaultValue = null) {
  if (isSQLiteAvailable()) {
    try {
      const [row] = await query(
        'SELECT flag_value FROM memory_world_flags WHERE world_book_id = ? AND flag_name = ?',
        [worldBookId, flagName]
      )
      if (!row) return defaultValue
      return row.flag_value !== null ? JSON.parse(row.flag_value) : null
    } catch (e) {
      console.error('[worldMemory] SQLite getWorldFlag failed:', e.message)
    }
  }

  // Web fallback
  const memory = await getWorldMemory(worldBookId)
  return memory.worldFlags[flagName] !== undefined ? memory.worldFlags[flagName] : defaultValue
}

export async function addMilestone(worldBookId, name) {
  if (isSQLiteAvailable()) {
    try {
      await exec(
        `INSERT OR IGNORE INTO memory_milestones (world_book_id, milestone_name) VALUES (?, ?)`,
        [worldBookId, name]
      )
      window.dispatchEvent(new CustomEvent('worldMemory:updated', {
        detail: { worldBookId, updateType: 'milestone', count: 1 }
      }))
      return
    } catch (e) {
      console.error('[worldMemory] SQLite addMilestone failed:', e.message)
    }
  }

  // Web fallback
  const memory = await getWorldMemory(worldBookId)
  if (!memory.milestones.includes(name)) {
    memory.milestones.push(name)
  }
}

// ===== 提取配置 =====

const EXTRACTION_CONFIG_KEY = 'world_memories_config'

export async function getExtractionConfig() {
  const defaults = { batchSize: 5 }
  if (typeof window === 'undefined') return defaults

  if (isSQLiteAvailable()) {
    try {
      const [row] = await query(
        'SELECT config_data FROM memory_extraction_config WHERE key = ?',
        [EXTRACTION_CONFIG_KEY]
      )
      if (!row) return defaults
      const cfg = JSON.parse(row.config_data)
      return { ...defaults, ...cfg }
    } catch (e) {
      console.error('[worldMemory] SQLite getExtractionConfig failed:', e.message)
    }
  }

  // Web fallback
  try {
    const cfg = await kvStorage.get(EXTRACTION_CONFIG_KEY)
    return cfg && typeof cfg === 'object' ? { ...defaults, ...cfg } : defaults
  } catch {
    return defaults
  }
}

export async function saveExtractionConfig(config) {
  const current = await getExtractionConfig()

  if (isSQLiteAvailable()) {
    try {
      await exec(
        `INSERT OR REPLACE INTO memory_extraction_config (key, config_data) VALUES (?, ?)`,
        [EXTRACTION_CONFIG_KEY, JSON.stringify({ ...current, ...config })]
      )
      return
    } catch (e) {
      console.error('[worldMemory] SQLite saveExtractionConfig failed:', e.message)
    }
  }

  // Web fallback
  await kvStorage.set(EXTRACTION_CONFIG_KEY, { ...current, ...config })
}

export async function recordExtraction(worldBookId, lineCount) {
  if (isSQLiteAvailable()) {
    try {
      await exec(
        `INSERT OR REPLACE INTO memory_extraction_config (key, config_data) VALUES (?, ?)`,
        [`last_extracted_${worldBookId}`, JSON.stringify({
          lastExtractedAt: new Date().toISOString(),
          lastExtractedLineCount: lineCount,
        })]
      )
      return
    } catch (e) {
      console.error('[worldMemory] SQLite recordExtraction failed:', e.message)
    }
  }

  // Web fallback
  const memory = await getWorldMemory(worldBookId)
  memory.lastExtractedAt = new Date().toISOString()
  memory.lastExtractedLineCount = lineCount
}

// --- 跨页签同步 ---
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === `avg_llm_${STORAGE_KEY}`) {
      _cache = null
      _loaded = false
    }
  })
}
