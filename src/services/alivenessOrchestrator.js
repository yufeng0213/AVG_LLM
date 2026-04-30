/**
 * 活人感服务统一编排器
 * 初始化并管理所有活人感功能的生命周期
 */
import { initLlmThrottleWithConfig } from './llmThrottle.js'
import { runNpcInteractionCheck } from './npcDialogueService.js'
import { runEventChainCheck } from './eventChainService.js'
import { runCharacterGrowthCheck } from './characterGrowthService.js'
import { runPlayerImpactCheck, recordPlayerChoice, checkRelationshipDelta, clearPendingImpacts } from './playerImpactService.js'
import { runDreamGeneration, triggerSingleDream } from './characterDreamService.js'
import { triggerTodayBirthdays } from './birthdayService.js'
import { runNpcSmsCheck } from './npcSmsService.js'

let _state = null
let _growthIntervalId = null

/**
 * 初始化所有活人感服务
 * @param {Object} deps — 依赖注入
 * @param {Function} deps.isGenerating — () => boolean, 是否正在生成主剧情
 * @param {Function} deps.getWorldBook — () => worldBook
 * @param {Function} deps.getWorldMemory — async (bookId) => worldMemory
 * @param {Function} deps.getScheduleFn — (bookId, charId) => schedule
 * @param {Function} deps.getRelationships — () => existingRelationships
 * @param {Function} deps.getRecentEvents — () => recent events
 * @param {Function} deps.markScheduleDirty — (bookId, charId, hint) => void
 */
export function initAlivenessServices(deps) {
  if (_state) {
    console.log('[Aliveness] already initialized, skipping')
    return
  }

  console.log('[Aliveness] initializing services...')

  // 初始化 LLM 节流器
  initLlmThrottleWithConfig({
    isGenerating: deps.isGenerating,
  })

  _state = {
    deps,
    running: false,
    lastInteractionCheck: 0,
    lastEventChainCheck: 0,
    lastGrowthCheck: 0,
    lastImpactCheck: 0,
  }

  console.log('[Aliveness] services initialized')
}

/**
 * 启动所有周期性检查
 */
export function startAlivenessServices() {
  if (!_state) {
    console.warn('[Aliveness] not initialized, call initAlivenessServices first')
    return
  }
  if (_state.running) return

  _state.running = true

  // 角色成长检查：每 6 小时一次
  const growthInterval = 6 * 60 * 60 * 1000
  _growthIntervalId = setInterval(() => {
    if (document.visibilityState === 'visible') {
      _runGrowthCheck()
    }
  }, growthInterval)

  console.log('[Aliveness] services started, growth check every 6h')
}

/**
 * 停止所有服务
 */
export function stopAlivenessServices() {
  if (!_state) return
  _state.running = false

  if (_growthIntervalId) {
    clearInterval(_growthIntervalId)
    _growthIntervalId = null
  }

  console.log('[Aliveness] services stopped')
}

/**
 * 手动触发角色梦境生成
 */
export async function triggerDreamGeneration() {
  if (!_state?.running) return
  console.log('[Aliveness] manual dream generation')
  await _runDreamCheck()
}

/**
 * 手动触发角色生日检查
 */
export async function triggerBirthdayCheck() {
  if (!_state) return
  console.log('[Aliveness] birthday check')
  await _runBirthdayCheck()
}

/**
 * 手动触发 NPC 短信检测
 */
export async function triggerNpcSmsCheck() {
  if (!_state?.running) return
  console.log('[Aliveness] NPC SMS check')
  await _runNpcSmsCheck()
}

/**
 * 手动触发所有检查（用于调试或玩家回归时）
 */
export async function triggerAllAlivenessChecks() {
  if (!_state) return
  console.log('[Aliveness] manual trigger all checks')

  await _runNpcDialogueCheck()
  await _runEventChainCheck()
  await _runImpactCheck()
  await _runBirthdayCheck()
  await _runNpcSmsCheck()
}

/**
 * 在对话生成后调用 — 触发 NPC 短信检测等
 * 注意：NPC短信和玩家影响已整合到主线剧情的 <aux> 区块中，不再独立调用 LLM
 */
export async function onDialogueGenerated() {
  if (!_state?.running) return

  // 已禁用：NPC短信和玩家影响现在由主线 LLM 的 <aux> 区块处理
  // await _runNpcSmsCheck()
  // await _runImpactCheck()
}

/**
 * 记录玩家选择（由 GameScreen handleSelectChoice 调用）
 */
export function onPlayerChoice(choice, context) {
  if (!_state) return
  recordPlayerChoice({
    choice,
    context,
    worldBook: _state.deps.getWorldBook(),
  })
}

/**
 * 关系剧变检查（由关系系统调用）
 */
export function onRelationshipDelta(charId, delta, reason) {
  if (!_state) return
  checkRelationshipDelta({
    charId,
    delta,
    reason,
    worldBook: _state.deps.getWorldBook(),
  })
}

// --- 内部方法 ---

async function _runNpcDialogueCheck() {
  const { deps } = _state
  const worldBook = deps.getWorldBook()
  if (!worldBook) return

  try {
    await runNpcInteractionCheck({
      worldBook,
      getScheduleFn: deps.getScheduleFn,
      getRelationships: deps.getRelationships,
      getRecentEvents: deps.getRecentEvents,
    })
  } catch (e) {
    console.warn('[Aliveness] npc dialogue check failed:', e.message)
  }
}

async function _runEventChainCheck() {
  const { deps } = _state
  const worldBook = deps.getWorldBook()
  if (!worldBook) return

  try {
    const memory = await deps.getWorldMemory(worldBook.id)
    await runEventChainCheck({
      worldBook,
      worldMemory: memory,
    })
  } catch (e) {
    console.warn('[Aliveness] event chain check failed:', e.message)
  }
}

async function _runGrowthCheck() {
  const { deps } = _state
  const worldBook = deps.getWorldBook()
  if (!worldBook) return

  try {
    const memory = await deps.getWorldMemory(worldBook.id)
    const grown = await runCharacterGrowthCheck({
      worldBook,
      worldMemory: memory,
    })
    if (grown.length > 0) {
      console.log(`[Aliveness] ${grown.length} characters evolved`)
    }
  } catch (e) {
    console.warn('[Aliveness] growth check failed:', e.message)
  }
}

async function _runImpactCheck() {
  const { deps } = _state
  const worldBook = deps.getWorldBook()
  if (!worldBook) return

  try {
    await runPlayerImpactCheck({
      worldBook,
      markScheduleDirty: async (bookId, charId, hint) => {
      try {
        const { kvStorage } = await import('../storage/index.js')
        const key = `avg_llm_schedule_dirty_${bookId}::${charId}`
        await kvStorage.set(key, { hint, timestamp: Date.now() })
      } catch (e) {
        console.warn('[Aliveness] markScheduleDirty failed:', e.message)
      }
    },
    })
  } catch (e) {
    console.warn('[Aliveness] impact check failed:', e.message)
  }
}

async function _runDreamCheck() {
  const { deps } = _state
  const worldBook = deps.getWorldBook()
  if (!worldBook) return

  try {
    const memory = await deps.getWorldMemory(worldBook.id)
    await runDreamGeneration({
      worldBook,
      worldMemory: memory,
      relationships: worldBook.relationships,
    })
  } catch (e) {
    console.warn('[Aliveness] dream check failed:', e.message)
  }
}

async function _runBirthdayCheck() {
  const { deps } = _state
  const worldBook = deps.getWorldBook()
  if (!worldBook) return

  try {
    await triggerTodayBirthdays({ worldBook })
  } catch (e) {
    console.warn('[Aliveness] birthday check failed:', e.message)
  }
}

async function _runNpcSmsCheck() {
  const { deps } = _state
  const worldBook = deps.getWorldBook()
  if (!worldBook) return

  try {
    const memory = await deps.getWorldMemory(worldBook.id)
    await runNpcSmsCheck({
      worldBook,
      getScheduleFn: deps.getScheduleFn,
      relationships: worldBook.relationships,
    })
  } catch (e) {
    console.warn('[Aliveness] npc sms check failed:', e.message)
  }
}
