/**
 * 事件链服务 — 基于世界记忆事件生成连锁反应
 * A 事件可能引发 B 事件（如：A和B吵架 → C听说后对A产生看法）
 */
import { callChatCompletion, getValidatedActiveConfig } from '../llm/llmService.core.js'
import { resolvePrompt } from '../llm/promptRegistry.js'
import { addEvents } from '../memory/worldMemoryStore.js'
import { acquireLlmSlot } from './llmThrottle.js'

const STORAGE_KEY = 'avg_llm_event_chain_config'
const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000
const DEFAULT_MAX_DEPTH = 2
const DEFAULT_MAX_CHAINS = 2

let _config = null
let _lastRunAt = 0
let _lastAnalyzedEventId = null

/**
 * 加载配置
 */
async function loadConfig() {
  const defaults = {
    enabled: true,
    cooldownMs: DEFAULT_COOLDOWN_MS,
    maxDepth: DEFAULT_MAX_DEPTH,
    maxChainsPerEvent: DEFAULT_MAX_CHAINS,
  }
  try {
    const { kvStorage } = await import('../storage/index.js')
    const stored = await kvStorage.get(STORAGE_KEY)
    if (stored && typeof stored === 'object') return { ...defaults, ...stored }
  } catch {}
  return defaults
}

/**
 * 获取未处理的新事件
 */
function getUnprocessedEvents(memory, lastAnalyzedId) {
  if (!memory?.events) return []
  if (!lastAnalyzedId) return memory.events

  const idx = memory.events.findIndex(e => e.id === lastAnalyzedId)
  if (idx < 0) return memory.events // 找不到则全部重新处理
  return memory.events.slice(idx + 1)
}

/**
 * 生成事件链
 * @param {Object} params
 * @param {Object} params.worldBook
 * @param {Array} params.newEvents
 * @param {number} params.currentDepth
 * @returns {Promise<{success: boolean, derivedEvents?: Array, error?: string}>}
 */
export async function generateEventChain(params) {
  const { worldBook, newEvents, currentDepth = 0 } = params

  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: 'API 配置不可用' }
  }

  if (!_config) _config = await loadConfig()
  if (currentDepth >= _config.maxDepth) {
    return { success: false, error: '深度超限' }
  }

  // 过滤：只有包含角色的事件才可能产生连锁
  const relevant = newEvents.filter(e =>
    Array.isArray(e.participants) && e.participants.length > 0 && !e.chainParent
  )
  if (relevant.length === 0) {
    return { success: true, derivedEvents: [] }
  }

  const eventsText = relevant.slice(0, 3).map(e => {
    const participants = (e.participants || []).map(id => resolveName(id, worldBook)).join('、')
    return `事件: ${participants} — ${e.summary}`
  }).join('\n')

  // 当前世界书中已有的角色
  const chars = (worldBook?.characters || []).map(c =>
    `${c.name}(${c.id}) — ${c.identity || ''}`
  ).join('\n')

  const userPrompt = [
    `【任务】判断以下事件是否可能引发连锁反应。`,
    `【世界书】${worldBook?.title || '未知'}`,
    `【可用角色】\n${chars}`,
    `【新发生的事件】\n${eventsText}`,
    ``,
    `如果这些事件可能引发其他角色的反应或连锁事件，请输出 JSON 数组：`,
    `[`,
    `  {"participants":["char_x","char_y"],"summary":"连锁事件的描述","emotionalImpact":20}`,
    `]`,
    ``,
    `规则：`,
    `- 最多生成 ${_config?.maxChainsPerEvent || DEFAULT_MAX_CHAINS} 个派生事件`,
    `- 参与者必须是有实际参与能力的角色（不能是已离开剧场的角色）`,
    `- 每个派生事件必须与原始事件有因果关联`,
    `- emotionalImpact: 0-100`,
    `- 如果没有合理的连锁反应，输出 []`,
    `- 严格输出 JSON 数组，不要解释`,
  ].join('\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('aliveness:event_chain'),
    userPrompt,
    temperature: 0.5,
    maxTokens: 1500,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  // 解析 JSON 数组
  const cleaned = result.data.trim()
  let derived
  try {
    const parsed = JSON.parse(cleaned.match(/\[[\s\S]*\]/)?.[0] || '[]')
    derived = Array.isArray(parsed) ? parsed : []
  } catch {
    return { success: false, error: '派生事件解析失败', data: result.data }
  }

  // 为每个派生事件附加链信息
  const derivedWithMeta = derived.slice(0, _config?.maxChainsPerEvent || DEFAULT_MAX_CHAINS).map(e => ({
    ...e,
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'event_chain',
    status: 'active',
    createdAt: new Date().toISOString(),
    chainParent: newEvents[0]?.id || null,
    chainDepth: currentDepth + 1,
  }))

  return { success: true, derivedEvents: derivedWithMeta }
}

/**
 * 运行一轮事件链检测
 * @param {Object} deps
 * @param {Object} deps.worldBook
 * @param {Object} deps.worldMemory
 * @returns {Promise<number>} 生成的派生事件数
 */
export async function runEventChainCheck(deps) {
  if (!_config) _config = await loadConfig()
  if (!_config.enabled) return 0

  const now = Date.now()
  if (now - _lastRunAt < _config.cooldownMs) return 0

  const throttle = acquireLlmSlot()
  if (!throttle.allowed) {
    console.log(`[EventChain] throttle blocked: ${throttle.reason}`)
    return 0
  }

  const newEvents = getUnprocessedEvents(deps.worldMemory, _lastAnalyzedEventId)
  if (newEvents.length === 0) return 0

  const result = await generateEventChain({
    worldBook: deps.worldBook,
    newEvents,
    currentDepth: 0,
  })

  _lastRunAt = Date.now()

  if (!result.success || !result.derivedEvents?.length) {
    // 更新锚点
    if (newEvents.length > 0) {
      _lastAnalyzedEventId = newEvents[newEvents.length - 1].id
    }
    return 0
  }

  try {
    await addEvents(deps.worldBook.id, result.derivedEvents)
    _lastAnalyzedEventId = result.derivedEvents[result.derivedEvents.length - 1].id
    console.log(`[EventChain] ${result.derivedEvents.length} derived events created`)
    return result.derivedEvents.length
  } catch (e) {
    console.warn('[EventChain] addEvents failed:', e.message)
    return 0
  }
}

function resolveName(id, worldBook) {
  if (id === '__player__') return '玩家'
  const char = worldBook?.characters?.find(c => c.id === id)
  return char?.name || id
}
