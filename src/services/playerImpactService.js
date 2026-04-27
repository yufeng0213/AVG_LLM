/**
 * 玩家选择影响服务 — 玩家的对话选择影响 NPC 日程和行为模式
 * 关键选择不仅改变关系数值，还会实质性地改变 NPC 的行为
 */
import { callChatCompletion, getValidatedActiveConfig } from '../llm/llmService.core.js'
import { resolvePrompt } from '../llm/promptRegistry.js'
import { addEvent } from '../memory/worldMemoryStore.js'
import { acquireLlmSlot } from './llmThrottle.js'

import { isSQLiteAvailable, getConfig, setConfig } from '../db/db.js'

const STORAGE_KEY = 'avg_llm_player_impact_config'
const DEFAULT_FAVOR_THRESHOLD = 20

let _config = null
let _pendingImpacts = [] // 待处理的影响评估

/**
 * 加载配置
 */
async function loadConfig() {
  const defaults = {
    enabled: true,
    favorThreshold: DEFAULT_FAVOR_THRESHOLD,
    scheduleInfluencePrompt: true,
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
 * 记录玩家的选择
 * @param {Object} params
 * @param {Object} params.choice — 对话选择对象
 * @param {Object} params.worldBook
 * @param {string} params.context — 对话上下文摘要
 * @returns {void}
 */
export function recordPlayerChoice(params) {
  if (!_config) _pendingImpacts.push(params)

  const choice = params.choice
  if (!choice) return

  // 检查选择是否标记为 impactful
  if (choice.impactful || choice.impactTargets) {
    _pendingImpacts.push({
      choice,
      context: params.context,
      worldBook: params.worldBook,
      timestamp: Date.now(),
    })
  }
}

/**
 * 检查关系剧变是否需要影响评估
 * @param {Object} params
 * @param {string} params.charId
 * @param {Object} params.delta — { favor, trust, stance }
 * @param {string} params.reason
 * @param {Object} params.worldBook
 */
export function checkRelationshipDelta(params) {
  if (!_config) return

  const favorChange = Math.abs(params.delta?.favor || 0)
  if (favorChange >= _config.favorThreshold) {
    _pendingImpacts.push({
      type: 'relationship_delta',
      charId: params.charId,
      delta: params.delta,
      reason: params.reason,
      worldBook: params.worldBook,
      timestamp: Date.now(),
    })
  }
}

/**
 * 评估影响 — LLM 判断哪些 NPC 的行为模式需要调整
 * @param {Object} params
 * @param {Array} params.impacts — 待评估的影响列表
 * @param {Object} params.worldBook
 * @param {Array} params.recentChoices — 最近的玩家选择
 * @returns {Promise<{success: boolean, impactResults?: Array, error?: string}>}
 */
export async function assessPlayerImpact(params) {
  const { impacts, worldBook } = params

  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: 'API 配置不可用' }
  }

  const chars = (worldBook?.characters || []).map(c =>
    `${c.name}(${c.id}) — ${c.identity || ''} | ${c.background?.slice(0, 80) || ''}`
  ).join('\n')

  const impactsText = impacts.slice(0, 5).map((imp, i) => {
    if (imp.choice) {
      return `${i + 1}. 玩家选择了: "${imp.choice.text || imp.choice.nextStep || '未知选择'}" — ${imp.context || ''}`
    } else if (imp.type === 'relationship_delta') {
      return `${i + 1}. 角色关系剧变: ${imp.charId} 好感变化 ${imp.delta.favor}, 原因: ${imp.reason}`
    }
    return `${i + 1}. ${JSON.stringify(imp)}`
  }).join('\n')

  const userPrompt = [
    `【任务】评估玩家的选择对 NPC 行为模式的影响。`,
    `【可用角色】\n${chars}`,
    `\n【玩家的选择】\n${impactsText}`,
    ``,
    `请分析这些选择对哪些 NPC 产生了影响，输出 JSON 数组：`,
    `[`,
    `  {`,
    `    "charId": "受影响角色的ID",`,
    `    "impactType": "schedule_change|attitude_change|goal_change",`,
    `    "summary": "影响描述（50字以内）",`,
    `    "scheduleHint": "下次生成日程时应考虑的提示（可选，100字以内）"`,
    `  }`,
    `]`,
    ``,
    `规则：`,
    `- 只有真正受影响的 NPC 才需要列出`,
    `- impactType: schedule_change=日程变化, attitude_change=态度变化, goal_change=目标变化`,
    `- scheduleHint 用于在下次日程生成时注入到 prompt 中`,
    `- 如果没有影响，输出 []`,
    `- 严格输出 JSON，不要解释`,
  ].join('\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('aliveness:player_impact'),
    userPrompt,
    temperature: 0.5,
    maxTokens: 1500,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  // 解析 JSON
  const cleaned = result.data.trim()
  let impactResults
  try {
    const start = cleaned.indexOf('[')
    const end = cleaned.lastIndexOf(']')
    if (start < 0 || end <= start) return { success: false, error: 'JSON 解析失败' }
    impactResults = JSON.parse(cleaned.slice(start, end + 1))
    if (!Array.isArray(impactResults)) return { success: false, error: '非数组格式' }
  } catch {
    return { success: false, error: '影响评估解析失败', data: result.data }
  }

  // 附加元数据
  impactResults = impactResults.map(r => ({
    ...r,
    id: `impact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  }))

  return { success: true, impactResults }
}

/**
 * 应用影响结果到日程系统
 * @param {Object} params
 * @param {Object} params.worldBook
 * @param {Array} params.impactResults — assessPlayerImpact 返回的结果
 * @param {Function} params.markScheduleDirty — (bookId, charId, hint) => void
 */
export async function applyImpactToSchedules(params) {
  const { worldBook, impactResults, markScheduleDirty } = params

  for (const impact of impactResults) {
    if (impact.scheduleHint && markScheduleDirty) {
      markScheduleDirty(worldBook.id, impact.charId, impact.scheduleHint)
      console.log(`[PlayerImpact] schedule marked dirty for ${impact.charId}: ${impact.scheduleHint}`)
    }

    // 记录影响事件
    try {
      await addEvent(worldBook.id, {
        type: 'player_impact',
        participants: [impact.charId],
        summary: impact.summary || `玩家的选择影响了 ${impact.charId}`,
        emotionalImpact: 25,
        impactType: impact.impactType,
        impactId: impact.id,
      })
    } catch (e) {
      console.warn('[PlayerImpact] addEvent failed:', e.message)
    }
  }
}

/**
 * 运行一轮影响评估
 * @param {Object} deps
 * @param {Object} deps.worldBook
 * @param {Function} deps.markScheduleDirty — (bookId, charId, hint) => void
 * @returns {Promise<number>} 处理的影响数
 */
export async function runPlayerImpactCheck(deps) {
  if (!_config) _config = await loadConfig()
  if (!_config.enabled) return 0

  if (_pendingImpacts.length === 0) return 0

  const throttle = acquireLlmSlot()
  if (!throttle.allowed) {
    console.log(`[PlayerImpact] throttle blocked: ${throttle.reason}`)
    return 0
  }

  const impacts = _pendingImpacts.splice(0, 5) // 最多处理 5 个

  const result = await assessPlayerImpact({
    impacts,
    worldBook: deps.worldBook,
  })

  if (!result.success || !result.impactResults?.length) return 0

  await applyImpactToSchedules({
    worldBook: deps.worldBook,
    impactResults: result.impactResults,
    markScheduleDirty: deps.markScheduleDirty,
  })

  console.log(`[PlayerImpact] ${result.impactResults.length} impacts applied`)
  return result.impactResults.length
}

/**
 * 清空待处理的影响列表（用于手动重置）
 */
export function clearPendingImpacts() {
  _pendingImpacts = []
}
