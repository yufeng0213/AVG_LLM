/**
 * 关系自动分析调度器
 * 基于世界记忆数据库的更新次数自动触发关系分析，区分 NPC-NPC 和 NPC-Player
 */
import { isSQLiteAvailable, getConfig, setConfig } from '../db/db.js'
import { decayEvents } from '../memory/worldMemoryStore.js'
export { flushRelationshipSave } from '../relationship/index.js'

const STORAGE_KEY = 'avg_llm_relationship_auto_config'
const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 每 5 分钟检查一次

let _state = null

/**
 * 初始化调度器
 * @param {Object} api - 依赖注入
 * @param {Function} api.getWorldBook - 获取当前世界书
 * @param {Function} api.getWorldMemory - 获取世界记忆
 * @param {Function} api.runRelationshipAnalysis - NPC-Player 关系分析
 * @param {Function} api.runNpcNpcAnalysis - NPC-NPC 关系分析
 * @param {Function} api.saveRelationships - 保存关系数据
 * @param {Function} api.addWorldMemoryEvent - 添加世界记忆事件
 * @param {Function} api.syncToRuntime - 同步到 relationship runtime
 * @param {Function} api.notifyPlayer - 通知玩家
 * @param {Function} api.isGenerating - 是否正在生成（返回 boolean）
 */
export function initRelationshipScheduler(api) {
  if (_state) return
  _state = { api, intervalId: null, running: false, pendingUpdates: 0 }

  // 监听世界记忆更新事件
  if (typeof window !== 'undefined') {
    window.addEventListener('worldMemory:updated', (e) => {
      const count = e.detail?.count || 1
      _state.pendingUpdates += count
    })
  }
}

/**
 * 启动调度器
 */
export function startRelationshipScheduler() {
  if (!_state || _state.running) return
  _state.running = true
  _check()
  _state.intervalId = setInterval(_check, CHECK_INTERVAL_MS)
  console.log('[RelationshipScheduler] started')
}

/**
 * 停止调度器
 */
export function stopRelationshipScheduler() {
  if (!_state) return
  if (_state.intervalId) {
    clearInterval(_state.intervalId)
    _state.intervalId = null
  }
  _state.running = false
  console.log('[RelationshipScheduler] stopped')
}

async function loadConfig() {
  const defaults = {
    enabled: true,
    triggerThreshold: 10,
    updateCount: 0,
    lastAnalyzedAt: null,
    lastAnalyzedEventCount: 0,
    npcNpc: { enabled: true, maxTokens: 3000, temperature: 0.3 },
    npcPlayer: { enabled: true, maxTokens: 5000, temperature: 0.3 },
    significanceThreshold: 50,
  }
  try {
    let stored
    if (isSQLiteAvailable()) {
      stored = await getConfig(STORAGE_KEY)
    } else {
      const { kvStorage } = await import('../storage/index.js')
      stored = await kvStorage.get(STORAGE_KEY)
    }
    if (stored && typeof stored === 'object') {
      return { ...defaults, ...stored }
    }
  } catch {
    // ignore
  }
  return defaults
}

async function saveConfig(config) {
  try {
    if (isSQLiteAvailable()) {
      await setConfig(STORAGE_KEY, config)
    } else {
      const { kvStorage } = await import('../storage/index.js')
      await kvStorage.set(STORAGE_KEY, config)
    }
  } catch (e) {
    console.warn('[RelationshipScheduler] save config failed:', e.message)
  }
}

async function _check() {
  if (!_state?.running) return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

  // 运行事件衰减：清理过期低强度事件
  const worldBook = _state.api.getWorldBook()
  if (worldBook) {
    try {
      await decayEvents(worldBook.id)
    } catch (e) {
      console.warn('[RelationshipScheduler] event decay failed:', e.message)
    }
  }

  const config = await loadConfig()
  if (!config.enabled) return
  if (_state.pendingUpdates < config.triggerThreshold) return
  if (_state.api.isGenerating?.()) return

  await _runAnalysis(config)
}

async function _runAnalysis(config) {
  const { api } = _state
  const worldBook = api.getWorldBook()
  if (!worldBook) {
    _state.pendingUpdates = 0
    return
  }

  const memory = await api.getWorldMemory(worldBook.id)
  if (!memory || !memory.events) {
    _state.pendingUpdates = 0
    return
  }

  const newEvents = memory.events.slice(config.lastAnalyzedEventCount || 0)
  if (newEvents.length === 0) {
    _state.pendingUpdates = 0
    config.updateCount = 0
    await saveConfig(config)
    return
  }

  // 分类事件
  const playerEvents = newEvents.filter(e =>
    Array.isArray(e.participants) && e.participants.includes('__player__')
  )
  const npcOnlyEvents = newEvents.filter(e =>
    Array.isArray(e.participants) && !e.participants.includes('__player__') && e.participants.length >= 2
  )

  let allChanges = []

  // --- NPC-Player 分析 ---
  if (config.npcPlayer.enabled && playerEvents.length > 0) {
    try {
      const result = await api.runRelationshipAnalysis({
        worldBook,
        recentDialogue: eventsToDialogueLike(playerEvents, worldBook),
        existingRelationships: worldBook.relationships || {},
      })
      if (result.success && result.relationships) {
        const changes = mergeAndDetect(worldBook.relationships || {}, result.relationships, config)
        allChanges.push(...changes)
        Object.assign(worldBook.relationships || (worldBook.relationships = {}), result.relationships)
      }
    } catch (e) {
      console.warn('[RelationshipScheduler] NPC-Player analysis failed:', e.message)
    }
  }

  // --- NPC-NPC 分析 ---
  if (config.npcNpc.enabled && npcOnlyEvents.length > 0) {
    try {
      const result = await api.runNpcNpcAnalysis({
        worldBook,
        events: npcOnlyEvents,
        existingRelationships: worldBook.relationships || {},
      })
      if (result.success && result.relationships) {
        const changes = mergeAndDetect(worldBook.relationships || {}, result.relationships, config)
        for (const c of changes) c.isNpcNpc = true
        allChanges.push(...changes)
        Object.assign(worldBook.relationships || (worldBook.relationships = {}), result.relationships)
      }
    } catch (e) {
      console.warn('[RelationshipScheduler] NPC-NPC analysis failed:', e.message)
    }
  }

  // 保存关系数据
  if (allChanges.length > 0) {
    try {
      await api.saveRelationships(worldBook)
    } catch (e) {
      console.warn('[RelationshipScheduler] save relationships failed:', e.message)
    }
  }

  // 处理显著变化
  for (const change of allChanges) {
    // 写入世界记忆
    try {
      await api.addWorldMemoryEvent(worldBook.id, {
        type: 'relationship_shift',
        participants: [change.fromId, change.toId],
        summary: change.summary,
        emotionalImpact: Math.abs(change.delta) / 10,
      })
    } catch (e) {
      console.warn('[RelationshipScheduler] memory event write failed:', e.message)
    }

    // 同步到 runtime
    const favorDelta = scoreToFavorDelta(change.delta)
    if (favorDelta !== 0) {
      try {
        await api.syncToRuntime(change.fromId, { favor: favorDelta }, change.summary)
        if (change.isNpcNpc && change.toId !== '__player__') {
          await api.syncToRuntime(change.toId,
            { favor: Math.round(favorDelta * 0.3) },
            `受 ${change.fromName} 的影响`)
        }
      } catch (e) {
        console.warn('[RelationshipScheduler] runtime sync failed:', e.message)
      }
    }

    // 通知玩家
    if (shouldNotify(change, config)) {
      try {
        api.notifyPlayer(buildNotificationText(change))
      } catch (e) {
        console.warn('[RelationshipScheduler] notify failed:', e.message)
      }
    }
  }

  // 羁绊事件检测：关系跨越阈值时自动生成
  if (allChanges.length > 0) {
    try {
      const { runBondEventCheck } = await import('./bondEventService.js')
      await runBondEventCheck({
        worldBook,
        existingRelationships: worldBook.relationships || {},
        newRelationships: worldBook.relationships || {}, // 已在上方更新
      })
    } catch (e) {
      console.warn('[RelationshipScheduler] bond event check failed:', e.message)
    }
  }

  // 重置计数器
  _state.pendingUpdates = 0
  config.updateCount = 0
  config.lastAnalyzedAt = new Date().toISOString()
  config.lastAnalyzedEventCount = memory.events.length
  await saveConfig(config)

  // 回写世界记忆脏数据
  try {
    const { flushDirty } = await import('../memory/worldMemoryStore.js')
    await flushDirty()
  } catch (e) {
    // ignore
  }

  console.log(`[RelationshipScheduler] analysis complete, ${allChanges.length} changes detected`)
}

/**
 * 将事件转换为类似对话的格式（供 generateRelationshipAnalysis 使用）
 */
function eventsToDialogueLike(events, worldBook) {
  return events.map(e => {
    const participants = (e.participants || []).map(id => resolveName(id, worldBook)).join('、')
    return {
      speaker: e.type === 'conversation' ? (e.participants?.[0] === '__player__' ? '玩家' : resolveName(e.participants?.[0], worldBook)) : '旁白',
      text: e.summary || e.type,
      emotion: '',
    }
  })
}

/**
 * 合并新旧关系，检测显著变化
 */
function mergeAndDetect(existing, newRels, config) {
  const changes = []
  const threshold = config.significanceThreshold || 50

  for (const [fromId, targets] of Object.entries(newRels)) {
    if (!existing[fromId]) existing[fromId] = {}

    for (const [toId, newRel] of Object.entries(targets)) {
      const oldScore = existing[fromId]?.[toId]?.score ?? 500
      const delta = newRel.score - oldScore

      if (Math.abs(delta) >= threshold) {
        changes.push({
          fromId, toId, delta,
          fromName: resolveNameShort(fromId),
          toName: resolveNameShort(toId),
          oldScore,
          newScore: newRel.score,
          summary: `${resolveNameShort(fromId)} 对 ${resolveNameShort(toId)} 的态度从 ${scoreToLabel(oldScore)} 变为 ${scoreToLabel(newRel.score)}`,
        })
      }

      existing[fromId][toId] = { ...newRel, updatedAt: new Date().toISOString() }
    }
  }

  return changes
}

function scoreToFavorDelta(scoreDelta) {
  return Math.round(scoreDelta / 5)
}

function resolveName(id, worldBook) {
  if (id === '__player__') return '玩家'
  const char = worldBook?.characters?.find(c => c.id === id)
  return char?.name || id
}

function resolveNameShort(id) {
  if (id === '__player__') return '你'
  return id
}

function scoreToLabel(score) {
  if (score <= 200) return '敌对'
  if (score <= 400) return '疏远'
  if (score <= 600) return '普通'
  if (score <= 800) return '亲近'
  return '挚友'
}

function shouldNotify(change, config) {
  if (change.fromId === '__player__' || change.toId === '__player__') return true
  if (change.isNpcNpc && Math.abs(change.delta) > config.significanceThreshold * 4) return true
  return false
}

function buildNotificationText(change) {
  if (change.fromId === '__player__') {
    return `你对 ${change.toName} 的感觉发生了变化……`
  }
  if (change.toId === '__player__') {
    return `${change.fromName} 对你的态度似乎有所改变……`
  }
  return `你注意到 ${change.fromName} 和 ${change.toName} 之间的关系发生了变化……`
}
