/**
 * WorldMemory — 每个世界书独立维护的剧情记忆数据库
 * 存储：事件记录、角色个人记忆、世界状态标志
 */
import { kvStorage } from '../storage/index.js'

const STORAGE_KEY = 'world_memories'

// --- 内存缓存层 ---
let _cache = null
let _dirty = false
let _loaded = false
const EVENT_MAX_COUNT = 500

function markDirty() { _dirty = true }

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

/**
 * 创建空记忆结构
 */
function createEmptyMemory(worldBookId) {
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

/**
 * 加载所有世界书的记忆（带缓存）
 */
export async function loadAllWorldMemories() {
  if (typeof window === 'undefined') return {}
  if (!_loaded) {
    try {
      const data = await kvStorage.get(STORAGE_KEY)
      _cache = data && typeof data === 'object' ? data : {}
      _loaded = true
      _dirty = false
    } catch {
      _cache = {}
      _loaded = true
    }
  }
  return _cache
}

/**
 * 获取指定世界书的记忆
 */
export async function getWorldMemory(worldBookId) {
  const all = await loadAllWorldMemories()
  if (!all[worldBookId]) {
    all[worldBookId] = createEmptyMemory(worldBookId)
    markDirty()
  }
  return all[worldBookId]
}

/**
 * 保存指定世界书的记忆
 */
export async function saveWorldMemory(memory) {
  if (typeof window === 'undefined') return
  _cache[memory.worldBookId] = memory
  try {
    await kvStorage.set(STORAGE_KEY, _cache)
    _dirty = false
  } catch (e) {
    console.warn('[worldMemory] save failed:', e.message)
    _dirty = true
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('worldMemory:updated', {
      detail: { worldBookId: memory.worldBookId, updateType: 'save', count: 1 }
    }))
  }
}

/**
 * 将脏数据回写到存储
 */
export async function flushDirty() {
  if (_dirty && _loaded && typeof window !== 'undefined') {
    try {
      await kvStorage.set(STORAGE_KEY, _cache)
      _dirty = false
    } catch (e) {
      console.warn('[worldMemory] flush failed:', e.message)
    }
  }
}

/**
 * 删除指定世界书的记忆（世界书删除时调用）
 */
export async function deleteWorldMemory(worldBookId) {
  if (typeof window === 'undefined') return
  if (_loaded && _cache) {
    delete _cache[worldBookId]
    markDirty()
  }
  await kvStorage.set(STORAGE_KEY, _cache)
  _dirty = false
}

/**
 * 清除指定世界书的缓存条目
 */
export function clearWorldMemoryCache(worldBookId) {
  if (_cache && worldBookId) {
    delete _cache[worldBookId]
    markDirty()
  }
}

// ===== 事件操作 =====

/**
 * 添加事件
 */
export async function addEvent(worldBookId, event) {
  const memory = await getWorldMemory(worldBookId)
  const newEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    status: 'active',
    createdAt: new Date().toISOString(),
    ...event,
  }
  memory.events.push(newEvent)
  _capEvents(memory)
  markDirty()

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('worldMemory:updated', {
      detail: { worldBookId, updateType: 'event', count: 1 }
    }))
  }
  return newEvent
}

/**
 * 批量添加事件
 */
export async function addEvents(worldBookId, events) {
  const memory = await getWorldMemory(worldBookId)
  for (const event of events) {
    const newEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      status: 'active',
      createdAt: new Date().toISOString(),
      ...event,
    }
    memory.events.push(newEvent)
  }
  _capEvents(memory)
  markDirty()

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('worldMemory:updated', {
      detail: { worldBookId, updateType: 'events', count: events.length }
    }))
  }
}

/**
 * 查询事件
 */
export async function queryEvents(worldBookId, filters = {}) {
  const memory = await getWorldMemory(worldBookId)
  let results = memory.events

  if (filters.participants?.length > 0) {
    const ids = new Set(filters.participants)
    results = results.filter(e =>
      Array.isArray(e.participants) && e.participants.some(p => ids.has(p))
    )
  }
  if (filters.type) {
    results = results.filter(e => e.type === filters.type)
  }
  if (filters.status) {
    results = results.filter(e => e.status === filters.status)
  }
  if (filters.minImpact) {
    results = results.filter(e => (e.emotionalImpact || 0) >= filters.minImpact)
  }
  if (filters.excludeFading) {
    results = results.filter(e => e.status !== 'fading' && e.status !== 'resolved')
  }

  // 按时间倒序
  results = [...results].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  // 限制数量
  if (filters.limit) {
    results = results.slice(0, filters.limit)
  }

  return results
}

/**
 * 更新事件状态
 */
export async function updateEventStatus(worldBookId, eventId, status) {
  const memory = await getWorldMemory(worldBookId)
  const event = memory.events.find(e => e.id === eventId)
  if (event) {
    event.status = status
    markDirty()
  }
}

/**
 * 衰减标记：将超过天数且情感强度低的事件标记为 fading
 */
export async function decayEvents(worldBookId, options = {}) {
  const { daysThreshold = 30, impactThreshold = 40 } = options
  const memory = await getWorldMemory(worldBookId)
  const cutoff = Date.now() - daysThreshold * 24 * 60 * 60 * 1000
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

  if (changed) markDirty()
}

// ===== 角色记忆操作 =====

/**
 * 获取角色的个人记忆
 */
export async function getCharacterMemories(worldBookId, characterId) {
  const memory = await getWorldMemory(worldBookId)
  return memory.characterMemories[characterId] || []
}

/**
 * 添加角色记忆
 */
export async function addCharacterMemory(worldBookId, characterId, memoryEntry) {
  const memory = await getWorldMemory(worldBookId)
  if (!memory.characterMemories[characterId]) {
    memory.characterMemories[characterId] = []
  }
  const entry = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    ...memoryEntry,
  }
  memory.characterMemories[characterId].push(entry)
  markDirty()

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('worldMemory:updated', {
      detail: { worldBookId, updateType: 'characterMemory', count: 1 }
    }))
  }
  return entry
}

/**
 * 批量添加角色记忆（一次 getWorldMemory + 一次 markDirty）
 * @param {string} worldBookId
 * @param {{characterId: string, memoryEntry: Object}[]} items
 */
export async function addCharacterMemoriesBatch(worldBookId, items) {
  const memory = await getWorldMemory(worldBookId)
  const entries = []
  for (const { characterId, memoryEntry } of items) {
    if (!memory.characterMemories[characterId]) {
      memory.characterMemories[characterId] = []
    }
    const entry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      ...memoryEntry,
    }
    memory.characterMemories[characterId].push(entry)
    entries.push(entry)
  }
  markDirty()

  if (typeof window !== 'undefined' && items.length > 0) {
    window.dispatchEvent(new CustomEvent('worldMemory:updated', {
      detail: { worldBookId, updateType: 'characterMemory', count: items.length }
    }))
  }
  return entries
}

/**
 * 查询两个角色之间的共享记忆（用于注入 LLM 上下文）
 */
export async function getSharedContext(worldBookId, charA, charB) {
  const memory = await getWorldMemory(worldBookId)

  // 事件中找到双方都参与的
  const sharedEvents = memory.events.filter(e =>
    Array.isArray(e.participants) &&
    e.participants.includes(charA) &&
    e.participants.includes(charB) &&
    e.status === 'active'
  )

  // 角色 A 对 B 的记忆
  const aAboutB = (memory.characterMemories[charA] || [])
    .filter(m => m.about === charB && m.status !== 'resolved')

  // 角色 B 对 A 的记忆
  const bAboutA = (memory.characterMemories[charB] || [])
    .filter(m => m.about === charA && m.status !== 'resolved')

  return {
    sharedEvents: sharedEvents.slice(-8),  // 最近 8 条
    aAboutB: aAboutB.slice(-5),
    bAboutA: bAboutA.slice(-5),
  }
}

// ===== 世界标志操作 =====

/**
 * 设置世界标志
 */
export async function setWorldFlag(worldBookId, flagName, value) {
  const memory = await getWorldMemory(worldBookId)
  memory.worldFlags[flagName] = value
  markDirty()

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('worldMemory:updated', {
      detail: { worldBookId, updateType: 'flag', count: 1 }
    }))
  }
}

/**
 * 获取世界标志
 */
export async function getWorldFlag(worldBookId, flagName, defaultValue = null) {
  const memory = await getWorldMemory(worldBookId)
  return memory.worldFlags[flagName] !== undefined ? memory.worldFlags[flagName] : defaultValue
}

/**
 * 添加里程碑
 */
export async function addMilestone(worldBookId, name) {
  const memory = await getWorldMemory(worldBookId)
  if (!memory.milestones.includes(name)) {
    memory.milestones.push(name)
    markDirty()

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('worldMemory:updated', {
        detail: { worldBookId, updateType: 'milestone', count: 1 }
      }))
    }
  }
}

// ===== 提取配置 =====

const EXTRACTION_CONFIG_KEY = 'world_memories_config'

/**
 * 获取记忆提取配置
 */
export async function getExtractionConfig() {
  const defaults = { batchSize: 5 }
  if (typeof window === 'undefined') return defaults
  try {
    const cfg = await kvStorage.get(EXTRACTION_CONFIG_KEY)
    return cfg && typeof cfg === 'object' ? { ...defaults, ...cfg } : defaults
  } catch {
    return defaults
  }
}

/**
 * 保存记忆提取配置
 */
export async function saveExtractionConfig(config) {
  const current = await getExtractionConfig()
  await kvStorage.set(EXTRACTION_CONFIG_KEY, { ...current, ...config })
}

// ===== 提取记录 =====

/**
 * 更新最后提取的记录
 */
export async function recordExtraction(worldBookId, lineCount) {
  const memory = await getWorldMemory(worldBookId)
  memory.lastExtractedAt = new Date().toISOString()
  memory.lastExtractedLineCount = lineCount
  markDirty()
}

// --- 跨页签同步：当其他页签修改 world_memories 时失效缓存 ---
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === `avg_llm_${STORAGE_KEY}`) {
      _cache = null
      _dirty = false
      _loaded = false
    }
  })
}
