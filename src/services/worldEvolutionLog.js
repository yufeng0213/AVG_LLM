/**
 * 世界演化日志服务
 * 基于一段时间内的世界记忆事件，LLM 生成"世界年鉴"式叙事总结
 */
import { callChatCompletion, getValidatedActiveConfig } from '../llm/llmService.core.js'
import { resolvePrompt } from '../llm/promptRegistry.js'
import { queryEvents, addCharacterMemory } from '../memory/worldMemoryStore.js'
import { acquireLlmSlot } from './llmThrottle.js'

const STORAGE_KEY = 'avg_llm_evolution_logs_v1'

/**
 * 生成世界演化日志
 * @param {Object} deps
 * @param {Object} deps.worldBook
 * @param {Object} deps.worldMemory
 * @param {number} deps.periodDays — 默认 30 天
 * @returns {Promise<{success: boolean, log?: {text, periodStart, periodEnd, stats}, error?: string}>}
 */
export async function generateEvolutionLog(deps) {
  const { worldBook, worldMemory, periodDays = 30 } = deps

  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: 'API 配置不可用' }
  }

  const throttle = acquireLlmSlot()
  if (!throttle.allowed) {
    return { success: false, error: throttle.reason }
  }

  // 查询最近 N 天的事件
  const now = new Date()
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000).toISOString()
  const periodEnd = now.toISOString()

  const events = (worldMemory?.events || []).filter(e => e.createdAt >= periodStart)

  if (events.length === 0) {
    return { success: false, error: '这段时间没有发生任何事件' }
  }

  // 统计
  const stats = computeStats(events, worldBook)

  // 构建 LLM prompt
  const userPrompt = buildEvolutionPrompt(worldBook, events, stats, periodStart, periodEnd)

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('world:evolution_log'),
    userPrompt,
    temperature: 0.4,
    maxTokens: 800,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  const logText = result.data.trim()

  // 存入世界记忆
  try {
    await addCharacterMemory(worldBook.id, '__world__', {
      about: '__world__',
      content: logText,
      sentiment: 0,
      type: 'evolution_log',
      metadata: {
        periodStart,
        periodEnd,
        eventCount: events.length,
        stats,
      },
    })

    // 本地持久化备份
    const { kvStorage } = await import('../storage/index.js')
    const logs = (await kvStorage.get(STORAGE_KEY)) || []
    logs.push({
      text: logText,
      periodStart,
      periodEnd,
      eventCount: events.length,
      stats,
      createdAt: new Date().toISOString(),
    })
    await kvStorage.set(STORAGE_KEY, logs.slice(-50)) // 最多保留 50 条
  } catch (e) {
    console.warn('[EvolutionLog] save failed:', e.message)
  }

  return {
    success: true,
    log: {
      text: logText,
      periodStart,
      periodEnd,
      stats,
    },
  }
}

/**
 * 加载历史日志
 */
export async function loadEvolutionLogs() {
  try {
    const { kvStorage } = await import('../storage/index.js')
    return (await kvStorage.get(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

function computeStats(events, worldBook) {
  const byType = {}
  const participantCount = {}

  for (const evt of events) {
    byType[evt.type] = (byType[evt.type] || 0) + 1
    for (const p of (evt.participants || [])) {
      participantCount[p] = (participantCount[p] || 0) + 1
    }
  }

  const topParticipants = Object.entries(participantCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({
      name: resolveName(id, worldBook),
      count,
    }))

  const totalImpact = events.reduce((sum, e) => sum + (e.emotionalImpact || 0), 0)
  const avgImpact = events.length > 0 ? Math.round(totalImpact / events.length) : 0

  return {
    eventCount: events.length,
    byType,
    topParticipants,
    totalImpact,
    avgImpact,
  }
}

function resolveName(id, worldBook) {
  if (id === '__player__') return '玩家'
  const char = worldBook?.characters?.find(c => c.id === id)
  return char?.name || id
}

function buildEvolutionPrompt(worldBook, events, stats, periodStart, periodEnd) {
  const parts = [
    `【任务】基于这段时间内发生的事件，生成一段"世界年鉴"式的叙事总结。`,
    `【世界书】${worldBook.title}`,
    `【概述】${worldBook.summary || '无'}`,
    `【时间范围】${periodStart.slice(0, 10)} 至 ${periodEnd.slice(0, 10)}`,
    '',
    `【统计】`,
    `- 总事件数: ${stats.eventCount}`,
    `- 平均情感影响: ${stats.avgImpact}`,
    `- 最活跃角色: ${stats.topParticipants.map(p => `${p.name}(${p.count})`).join('、')}`,
    `- 事件类型分布: ${Object.entries(stats.byType).map(([t, c]) => `${t}:${c}`).join(', ')}`,
    '',
  ]

  // 列出最近的重要事件
  const importantEvents = events
    .filter(e => e.emotionalImpact >= 50 || e.type === 'milestone' || e.type === 'bond_event')
    .sort((a, b) => (b.emotionalImpact || 0) - (a.emotionalImpact || 0))
    .slice(0, 10)

  if (importantEvents.length > 0) {
    parts.push(`【重要事件】`)
    for (const evt of importantEvents) {
      const participants = (evt.participants || []).map(id => resolveName(id, worldBook)).join('、')
      parts.push(`- ${evt.summary} (${participants}, 影响: ${evt.emotionalImpact})`)
    }
    parts.push('')
  }

  parts.push(`请用 300-500 字的中文，以第三人称叙事风格，总结这段时间里这个世界的变化。`)
  parts.push(`要求:`)
  parts.push(`- 有叙事感，像一篇编年史或年鉴`)
  parts.push(`- 涵盖主要角色的变化和关系变化`)
  parts.push(`- 语气可以带有史诗感或感慨`)
  parts.push(`- 不要罗列统计数字，而是将其融入叙事中`)

  return parts.join('\n')
}
