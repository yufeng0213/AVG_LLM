/**
 * 采集任务生成服务
 * LLM 生成采集区域配置，本地生成网格布局
 */

import { callChatCompletion, getValidatedActiveConfig } from '../../../../../src/llm/llmService.core.js'
import { resolvePrompt } from '../../../../../src/llm/promptRegistry.js'

/**
 * 将 LLM 请求和响应写入本地调试
 */
async function saveCollectLlmDebug(userPrompt, systemPrompt, rawResponse, parseSuccess) {
  const timestamp = new Date().toISOString()
  const separator = '='.repeat(60)
  const entry = [
    separator,
    `[${timestamp}] 采集生成 | 解析${parseSuccess ? '成功' : '失败'}`,
    separator,
    '',
    '--- SYSTEM PROMPT ---',
    systemPrompt,
    '',
    '--- USER PROMPT ---',
    userPrompt,
    '',
    '--- LLM RESPONSE ---',
    rawResponse,
    '',
  ].join('\n')

  if (typeof window !== 'undefined' && !window.Capacitor) {
    try {
      localStorage.setItem('collect_llm_debug_log', entry)
      return
    } catch {}
  }

  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    try { await Filesystem.mkdir({ path: 'debug', directory: Directory.Documents, recursive: true }) } catch {}
    const result = await Filesystem.writeFile({
      path: 'debug/collect-llm-responses.log',
      data: entry,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
    if (result && result.uri) return
  } catch {}

  try { localStorage.setItem('collect_llm_debug_log', entry) } catch {}
}

/**
 * 本地生成 5×5 探索网格
 */
function generateExploreGrid(resources, traps, evacuationPenalty) {
  const GRID_SIZE = 25
  const grid = new Array(GRID_SIZE).fill(null)

  // 资源格子
  const resourceCells = []
  for (const res of resources) {
    for (let i = 0; i < res.count; i++) {
      resourceCells.push({ type: 'resource', name: res.name, icon: res.icon, points: res.points, rarity: res.rarity })
    }
  }

  // 陷阱格子
  const trapCells = []
  for (const trap of traps) {
    trapCells.push({ type: 'trap', name: trap.name, icon: trap.icon, effect: trap.effect, value: trap.value, desc: trap.desc })
  }

  // 障碍格子
  const obstacleCount = Math.floor(GRID_SIZE * 0.15)
  const obstacleCells = Array.from({ length: obstacleCount }, () => ({ type: 'obstacle', name: '障碍', icon: ['🪨', '🌫️', '🕸️'][Math.floor(Math.random() * 3)] }))

  // 特殊事件格子
  const eventCells = [{ type: 'event', name: '特殊事件', icon: '⭐' }]

  // 打散所有格子
  const allItems = [...resourceCells, ...trapCells, ...obstacleCells, ...eventCells]
  const shuffled = allItems.sort(() => Math.random() - 0.5)

  // 填充网格
  for (let i = 0; i < GRID_SIZE; i++) {
    grid[i] = shuffled[i] || { type: 'empty', name: '空地', icon: '·' }
  }

  return grid
}

/**
 * 生成本地 fallback 数据
 */
function createDefaultCollectData() {
  const resources = [
    { name: '古老手稿', icon: '📜', points: 100, rarity: 'common', count: 4 },
    { name: '封印卷轴', icon: '🔮', points: 250, rarity: 'rare', count: 1 },
  ]
  const traps = [
    { name: '毒蘑菇', icon: '🍄', effect: 'explore_loss', value: 1, desc: '失去1次探索机会' },
    { name: '警报符文', icon: '⚡', effect: 'evacuation_penalty', value: 1, desc: '撤离时增加危险' },
  ]
  const evacuationStory = '撤离通道中布满了暗影生物，你需要找到最安全的路径。'

  return {
    story: '在一座废弃古堡的地下室里，散落着珍贵的魔法材料和古籍。但这里也充满了陷阱和危险...',
    resources,
    traps,
    eventTypes: ['reflex', 'memory', 'precision'],
    evacuationStory: evacuationStory,
    evacuationDangerCount: 3,
    evacuationTreasureCount: 1,
    grid: generateExploreGrid(resources, traps, 0),
  }
}

/**
 * 调用 LLM 生成采集任务数据
 */
export const generateCollectData = async ({ task, worldBook, userProfile }) => {
  const validation = await getValidatedActiveConfig()
  if (!validation.success) {
    throw new Error(validation.error || 'API配置无效')
  }

  const systemPrompt = await resolvePrompt('task:collect')

  const userPrompt = `世界书标题：${worldBook?.title || '未命名'}
世界书概述：${worldBook?.summary || worldBook?.entries?.overview || '无'}

任务名称：${task?.name || '未知任务'}
任务描述：${task?.description || '无'}

玩家信息：
名称：${userProfile?.name || '玩家'}
身份：${userProfile?.identity || '冒险者'}

请按紧凑 XML 格式生成采集任务数据。`

  try {
    console.log('[CollectGen] 开始调用 LLM, maxTokens=20000')
    const result = await callChatCompletion({
      config: validation.config,
      systemPrompt,
      userPrompt,
      temperature: 0.85,
      maxTokens: 20000,
      timeout: 120000,
    })
    console.log('[CollectGen] LLM 返回, success:', result.success, 'data长度:', result.data?.length || 0)

    if (!result.success) {
      throw new Error(result.error || 'LLM调用失败')
    }

    const content = result.data || ''
    console.log('[CollectGen] LLM 返回内容(前300字):', content.substring(0, 300))

    const parsed = parseCollectXml(content)
    console.log('[CollectGen] 解析结果:', parsed ? '成功' : '失败')

    if (!parsed) {
      console.warn('[CollectGen] 解析失败，使用 fallback 数据')
      const fallback = createDefaultCollectData()
      await saveCollectLlmDebug(userPrompt, systemPrompt, content, false)
      return { success: true, data: fallback, rawResponse: content, isFallback: true }
    }

    // 生成本地网格
    parsed.grid = generateExploreGrid(parsed.resources, parsed.traps, parsed.evacuationPenalty || 0)

    await saveCollectLlmDebug(userPrompt, systemPrompt, content, true)
    return { success: true, data: parsed, rawResponse: content }
  } catch (error) {
    console.error('[CollectGen] 异常:', error.message)
    const fallback = createDefaultCollectData()
    return { success: true, data: fallback, rawResponse: '(fallback)', isFallback: true }
  }
}

/**
 * 解析采集任务 XML
 */
function parseCollectXml(rawContent) {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const withoutThinking = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
  const fencedMatch = withoutThinking.match(/```(?:xml)?\s*([\s\S]*?)```/i)
  const content = fencedMatch?.[1]?.trim() || withoutThinking

  if (!content.trim()) return null

  const parseAttrs = (str) => {
    const result = {}
    const regex = /([\w-]+)="([^"]*)"/g
    let match
    while ((match = regex.exec(str)) !== null) {
      result[match[1]] = match[2]
    }
    return result
  }

  const data = {
    story: '',
    resources: [],
    traps: [],
    eventTypes: [],
    evacuationStory: '',
    evacuationDangerCount: 3,
    evacuationTreasureCount: 1,
  }

  // 故事
  const storyMatch = content.match(/<story>([\s\S]*?)<\/story>/i)
  if (storyMatch) data.story = storyMatch[1].trim()

  // 资源
  const resRegex = /<resource([\s\S]*?)\/?>/gi
  let resMatch
  while ((resMatch = resRegex.exec(content)) !== null) {
    const attrs = parseAttrs(resMatch[1])
    data.resources.push({
      name: attrs.name || '未知资源',
      icon: attrs.icon || '📦',
      points: parseInt(attrs.points) || 100,
      rarity: attrs.rarity || 'common',
      count: parseInt(attrs.count) || 1,
    })
  }

  // 陷阱
  const trapRegex = /<trap([\s\S]*?)\/?>/gi
  let trapMatch
  while ((trapMatch = trapRegex.exec(content)) !== null) {
    const attrs = parseAttrs(trapMatch[1])
    data.traps.push({
      name: attrs.name || '陷阱',
      icon: attrs.icon || '⚠️',
      effect: attrs.effect || 'explore_loss',
      value: parseInt(attrs.value) || 1,
      desc: attrs.desc || '',
    })
  }

  // 事件类型
  const eventRegex = /<event([\s\S]*?)\/?>/gi
  let eventMatch
  while ((eventMatch = eventRegex.exec(content)) !== null) {
    const attrs = parseAttrs(eventMatch[1])
    if (attrs.type) data.eventTypes.push(attrs.type)
  }

  // 撤离
  const evacMatch = content.match(/<evacuation([\s\S]*?)(?:\/>|>([\s\S]*?)<\/evacuation>)/i)
  if (evacMatch) {
    const attrs = parseAttrs(evacMatch[1])
    data.evacuationStory = attrs.story || ''
    data.evacuationDangerCount = parseInt(attrs['danger-count']) || 3
    data.evacuationTreasureCount = parseInt(attrs['treasure-count']) || 1
  }

  if (data.resources.length === 0) return null

  return data
}
