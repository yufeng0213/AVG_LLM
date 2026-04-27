/**
 * NPC 互动服务 — 日程重叠检测 & LLM 摘要生成
 * 当两个 NPC 在同一地点/同一时段活动时，生成他们之间的互动摘要
 */
import { callChatCompletion, getValidatedActiveConfig } from '../llm/llmService.core.js'
import { resolvePrompt } from '../llm/promptRegistry.js'
import { addEvent } from '../memory/worldMemoryStore.js'
import { acquireLlmSlot } from './llmThrottle.js'
import { isSQLiteAvailable, getConfig } from '../db/db.js'

const STORAGE_KEY = 'avg_llm_npc_dialogue_config'
const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000
const DEFAULT_MAX_PER_DAY = 3

let _config = null
let _lastRunAt = 0
let _todayCount = 0
let _todayDate = ''

/**
 * 加载配置
 */
async function loadConfig() {
  const defaults = {
    enabled: true,
    cooldownMs: DEFAULT_COOLDOWN_MS,
    maxInteractionsPerDay: DEFAULT_MAX_PER_DAY,
  }
  try {
    if (isSQLiteAvailable()) {
      const stored = await getConfig(STORAGE_KEY)
      if (stored && typeof stored === 'object') return { ...defaults, ...stored }
    } else {
      const { kvStorage } = await import('../storage/index.js')
      const stored = await kvStorage.get(STORAGE_KEY)
      if (stored && typeof stored === 'object') return { ...defaults, ...stored }
    }
  } catch {}
  return defaults
}

/**
 * 检测日程重叠的 NPC 对
 * @param {Object} worldBook
 * @param {Function} getScheduleFn - (bookId, charId) => schedule
 * @returns {Array<{charA, charB, location, hour}>}
 */
export function detectOverlappingNpcs(worldBook, getScheduleFn) {
  const chars = worldBook?.characters || []
  if (chars.length < 2) return []

  // 获取当前活跃 NPC 的日程
  const active = []
  for (const char of chars) {
    const schedule = getScheduleFn(worldBook.id, char.id)
    if (!schedule?.hourEntries) continue

    // 找到当前小时的条目
    const currentHour = new Date().getHours()
    const entry = schedule.hourEntries[currentHour]
    if (entry?.plannedActivity?.locationName) {
      active.push({
        char,
        schedule,
        hour: currentHour,
        location: entry.plannedActivity.locationName,
        activity: entry.plannedActivity.activityLabel,
      })
    }
  }

  // 检测同一地点的 NPC 对
  const pairs = []
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      if (active[i].location === active[j].location) {
        pairs.push({
          charA: active[i].char,
          charB: active[j].char,
          location: active[i].location,
          hour: active[i].hour,
          activityA: active[i].activity,
          activityB: active[j].activity,
        })
      }
    }
  }

  return pairs
}

/**
 * 生成 NPC 互动摘要
 * @param {Object} params
 * @param {Object} params.worldBook
 * @param {Object} params.charA
 * @param {Object} params.charB
 * @param {string} params.location
 * @param {string} params.activityA
 * @param {string} params.activityB
 * @param {Object} params.existingRelationships
 * @param {Array} params.recentEvents
 * @returns {Promise<{success: boolean, summary?: Object, error?: string}>}
 */
export async function generateNpcInteraction(params) {
  const { worldBook, charA, charB, location, activityA, activityB, existingRelationships, recentEvents } = params

  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: 'API 配置不可用' }
  }

  const parts = [
    `【任务】根据以下信息，生成两个 NPC 之间的互动摘要。`,
    `【场景】${location}`,
    `【角色 A】${charA.name} — ${charA.identity || ''}，当前在${activityA || '空闲'}`,
    `【角色 B】${charB.name} — ${charB.identity || ''}，当前在${activityB || '空闲'}`,
  ]

  // 关系上下文
  const relAtoB = existingRelationships?.[charA.id]?.[charB.id]
  const relBtoA = existingRelationships?.[charB.id]?.[charA.id]
  if (relAtoB) {
    parts.push(`【关系】${charA.name} 对 ${charB.name} 的态度: score=${relAtoB.score}, ${relAtoB.description || '无描述'}`)
  }
  if (relBtoA) {
    parts.push(`【关系】${charB.name} 对 ${charA.name} 的态度: score=${relBtoA.score}, ${relBtoA.description || '无描述'}`)
  }

  // 近期事件
  if (recentEvents?.length > 0) {
    const relevant = recentEvents.slice(0, 5).map(e =>
      `${e.type}: ${e.summary}`
    ).join('\n')
    parts.push(`【近期相关事件】\n${relevant}`)
  }

  parts.push(`\n请生成一段 100-200 字的互动摘要，描述两人在该场景中的简短交流。`)
  parts.push(`要求：`)
  parts.push(`- 对话感要强，有动作描写和情绪变化`)
  parts.push(`- 体现两人的关系状态和性格差异`)
  parts.push(`- 如果有近期事件的延续，请自然衔接`)
  parts.push(`- 不要写"玩家"或"__player__"`)

  const userPrompt = parts.join('\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('aliveness:npc_interaction'),
    userPrompt,
    temperature: 0.7,
    maxTokens: 800,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  return { success: true, summary: result.data.trim() }
}

/**
 * 运行一轮 NPC 互动检测 & 生成
 * @param {Object} deps
 * @param {Object} deps.worldBook
 * @param {Function} deps.getScheduleFn - (bookId, charId) => schedule
 * @param {Function} deps.getRelationships - () => existingRelationships
 * @param {Function} deps.getRecentEvents - () => recent events
 * @returns {Promise<Array>} 生成的互动事件列表
 */
export async function runNpcInteractionCheck(deps) {
  if (!_config) _config = await loadConfig()
  if (!_config.enabled) return []

  const now = Date.now()
  if (now - _lastRunAt < _config.cooldownMs) return []

  // 检查今天是否已超量
  const today = new Date().toDateString()
  if (today !== _todayDate) {
    _todayCount = 0
    _todayDate = today
  }
  if (_todayCount >= _config.maxInteractionsPerDay) return []

  // 检查节流
  const throttle = acquireLlmSlot()
  if (!throttle.allowed) {
    console.log(`[NpcDialogue] throttle blocked: ${throttle.reason}`)
    return []
  }

  const pairs = detectOverlappingNpcs(deps.worldBook, deps.getScheduleFn)
  if (pairs.length === 0) return []

  const createdEvents = []

  for (const pair of pairs.slice(0, 1)) { // 每次只处理一对，避免过多调用
    const result = await generateNpcInteraction({
      worldBook: deps.worldBook,
      charA: pair.charA,
      charB: pair.charB,
      location: pair.location,
      activityA: pair.activityA,
      activityB: pair.activityB,
      existingRelationships: deps.getRelationships?.(),
      recentEvents: deps.getRecentEvents?.() || [],
    })

    if (result.success && result.summary) {
      try {
        await addEvent(deps.worldBook.id, {
          type: 'npc_interaction',
          participants: [pair.charA.id, pair.charB.id],
          summary: result.summary,
          emotionalImpact: 15,
          scene: pair.location,
        })
        createdEvents.push(result.summary)
        _todayCount++
        console.log(`[NpcDialogue] interaction generated: ${pair.charA.name} <-> ${pair.charB.name} @ ${pair.location}`)
      } catch (e) {
        console.warn('[NpcDialogue] addEvent failed:', e.message)
      }
    }
  }

  _lastRunAt = Date.now()
  return createdEvents
}
