/**
 * 角色羁绊事件服务
 * 当两个角色之间的关系分数跨越阈值时，自动生成专属事件
 */
import { callChatCompletion, getValidatedActiveConfig } from '../llm/llmService.core.js'
import { resolvePrompt } from '../llm/promptRegistry.js'
import { addEvent } from '../memory/worldMemoryStore.js'
import { acquireLlmSlot } from './llmThrottle.js'

const STORAGE_KEY = 'avg_llm_bond_event_config'

// 关系阈值档位：每 100 分一档
const BOND_THRESHOLDS = [
  { min: 0, max: 100, label: '敌对', desc: '彼此敌视' },
  { min: 101, max: 200, label: '疏远', desc: '关系冷淡' },
  { min: 201, max: 300, label: '普通', desc: '一般认识' },
  { min: 301, max: 400, label: '熟识', desc: '有一定了解' },
  { min: 401, max: 500, label: '友好', desc: '关系不错' },
  { min: 501, max: 600, label: '亲近', desc: '互相信任' },
  { min: 601, max: 700, label: '亲密', desc: '关系深厚' },
  { min: 701, max: 800, label: '挚友', desc: '生死之交' },
  { min: 801, max: 900, label: '知己', desc: '灵魂伴侣' },
  { min: 901, max: 1000, label: '宿命', desc: '命运般的羁绊' },
]

let _config = null
let _lastCrossings = {} // "charA::charB" -> last threshold crossed

/**
 * 加载配置
 */
async function loadConfig() {
  const defaults = {
    enabled: true,
    minEmotionalImpact: 50, // 羁绊事件的 emotionalImpact 最小值
  }
  try {
    const { kvStorage } = await import('../storage/index.js')
    const stored = await kvStorage.get(STORAGE_KEY)
    if (stored && typeof stored === 'object') return { ...defaults, ...stored }
  } catch {}
  return defaults
}

/**
 * 获取关系阈值档位
 */
function getThreshold(score) {
  for (const t of BOND_THRESHOLDS) {
    if (score >= t.min && score <= t.max) return t
  }
  return BOND_THRESHOLDS[0]
}

/**
 * 检测关系跨越了阈值
 * @param {Object} existingRelationships
 * @param {Object} newRelationships
 * @returns {Array<{fromId, toId, fromName, toName, oldScore, newScore, oldThreshold, newThreshold}>}
 */
export function detectThresholdCrossings(existingRelationships, newRelationships, worldBook) {
  const crossings = []

  for (const [fromId, targets] of Object.entries(newRelationships)) {
    if (!targets || typeof targets !== 'object') continue

    for (const [toId, newRel] of Object.entries(targets)) {
      if (!newRel || typeof newRel !== 'object') continue
      if (fromId === '__player__' || toId === '__player__') continue // 不包含玩家

      const oldScore = existingRelationships?.[fromId]?.[toId]?.score ?? 500
      const newScore = newRel.score

      const oldThreshold = getThreshold(oldScore)
      const newThreshold = getThreshold(newScore)

      // 跨越了不同档位
      if (oldThreshold.label !== newThreshold.label) {
        const key = [fromId, toId].sort().join('::')
        // 避免重复触发同一档位
        if (_lastCrossings[key] === newThreshold.label) continue

        crossings.push({
          fromId, toId,
          fromName: resolveName(fromId, worldBook),
          toName: resolveName(toId, worldBook),
          oldScore, newScore,
          oldThreshold, newThreshold,
        })
      }
    }
  }

  return crossings
}

/**
 * 生成羁绊事件
 * @param {Object} params
 * @param {Object} params.worldBook
 * @param {Object} params.crossing
 * @param {Array} params.recentEvents
 * @returns {Promise<{success: boolean, event?: Object, error?: string}>}
 */
export async function generateBondEvent(params) {
  const { worldBook, crossing, recentEvents } = params

  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: 'API 配置不可用' }
  }

  const parts = [
    `【任务】为两个角色之间的羁绊变化生成一段专属事件描述。`,
    `【角色】${crossing.fromName} 和 ${crossing.toName}`,
    `【关系变化】从「${crossing.oldThreshold.label}」（${crossing.oldScore}分）→「${crossing.newThreshold.label}」（${crossing.newScore}分）`,
    `【关系性质】${crossing.newThreshold.desc}`,
  ]

  if (recentEvents?.length > 0) {
    const eventsText = recentEvents.slice(0, 5).map(e =>
      `- ${e.type}: ${e.summary}`
    ).join('\n')
    parts.push(`\n【近期相关事件】\n${eventsText}`)
  }

  const charA = findChar(crossing.fromId, worldBook)
  const charB = findChar(crossing.toId, worldBook)

  if (charA) {
    parts.push(`\n【${crossing.fromName}】身份: ${charA.identity || '未知'} | 性格: ${charA.personalityProfile?.mbti || '未知'}`)
  }
  if (charB) {
    parts.push(`【${crossing.toName}】身份: ${charB.identity || '未知'} | 性格: ${charB.personalityProfile?.mbti || '未知'}`)
  }

  parts.push(`\n请生成一段 100-200 字的羁绊事件描述。`)
  parts.push(`要求：`)
  parts.push(`- 以旁观者叙事视角，描写两人之间发生的一件事`)
  parts.push(`- 体现他们关系的变化（从 ${crossing.oldThreshold.label} 到 ${crossing.newThreshold.label}）`)
  parts.push(`- 融入两人的性格特点`)
  parts.push(`- 有情感张力，让人感受到羁绊的重量`)
  parts.push(`- 不要出现"玩家"或"__player__"`)

  const userPrompt = parts.join('\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('aliveness:bond_event'),
    userPrompt,
    temperature: 0.7,
    maxTokens: 800,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  return { success: true, event: result.data.trim() }
}

/**
 * 运行一轮羁绊事件检测
 * @param {Object} deps
 * @param {Object} deps.worldBook
 * @param {Object} deps.existingRelationships — 分析前的关系数据
 * @param {Object} deps.newRelationships — 分析后的关系数据
 * @returns {Promise<Array>} 生成的羁绊事件列表
 */
export async function runBondEventCheck(deps) {
  if (!_config) _config = await loadConfig()
  if (!_config.enabled) return []

  const throttle = acquireLlmSlot()
  if (!throttle.allowed) {
    console.log(`[BondEvents] throttle blocked: ${throttle.reason}`)
    return []
  }

  const crossings = detectThresholdCrossings(
    deps.existingRelationships,
    deps.newRelationships,
    deps.worldBook
  )

  if (crossings.length === 0) return []

  const events = []

  for (const crossing of crossings) {
    const recentEvents = await getRecentEventsForPair(deps.worldBook.id, crossing.fromId, crossing.toId)

    const result = await generateBondEvent({
      worldBook: deps.worldBook,
      crossing,
      recentEvents,
    })

    if (result.success && result.event) {
      try {
        await addEvent(deps.worldBook.id, {
          type: 'bond_event',
          participants: [crossing.fromId, crossing.toId],
          summary: result.event,
          emotionalImpact: Math.max(_config.minEmotionalImpact, Math.abs(crossing.newScore - crossing.oldScore) / 5),
          bondType: crossing.newThreshold.label,
          oldScore: crossing.oldScore,
          newScore: crossing.newScore,
        })
        events.push({ crossing, summary: result.event })
        const key = [crossing.fromId, crossing.toId].sort().join('::')
        _lastCrossings[key] = crossing.newThreshold.label

        console.log(`[BondEvents] ${crossing.fromName} <-> ${crossing.toName}: ${crossing.oldThreshold.label} → ${crossing.newThreshold.label}`)
      } catch (e) {
        console.warn('[BondEvents] addEvent failed:', e.message)
      }
    }
  }

  return events
}

async function getRecentEventsForPair(worldBookId, charA, charB) {
  try {
    const { getWorldMemory } = await import('../memory/worldMemoryStore.js')
    const memory = await getWorldMemory(worldBookId)
    return (memory.events || []).filter(e => {
      const p = e.participants || []
      return p.includes(charA) || p.includes(charB)
    }).slice(-10)
  } catch {
    return []
  }
}

function findChar(id, worldBook) {
  return (worldBook?.characters || []).find(c => c.id === id)
}

function resolveName(id, worldBook) {
  const char = findChar(id, worldBook)
  return char?.name || id
}

/**
 * 重置羁绊事件追踪状态（用于新游戏）
 */
export function resetBondEventTracking() {
  _lastCrossings = {}
}
