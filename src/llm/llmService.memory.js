/**
 * LLM 服务模块 — 从对话中提取世界记忆事件
 */

import { callChatCompletion, getValidatedActiveConfig } from './llmService.core.js'
import { resolvePrompt } from './promptRegistry.js'

/**
 * 从 LLM 原始响应中提取 JSON
 */
function extractJson(rawContent) {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const parseJson = (text) => {
    try { return JSON.parse(text) } catch { return null }
  }

  // 1. markdown code block
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]?.trim()) {
    const parsed = parseJson(fencedMatch[1].trim())
    if (parsed) return parsed
  }

  // 2. direct parse
  const direct = parseJson(raw)
  if (direct) return direct

  // 3. extract { ... }
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return parseJson(raw.slice(start, end + 1))
  }
  return null
}

/**
 * 构建事件提取 prompt
 */
function buildExtractionPrompt(worldBook, newDialogue, lastLineCount) {
  const parts = []

  parts.push('【任务】从以下新增对话中提取有意义的剧情事件和角色情感交互。')
  parts.push('只提取"新发生的"内容（最后几条对话），不要重复已记录的事件。')

  parts.push(`\n【世界书】${worldBook?.title || '未知'}`)
  if (worldBook?.summary) parts.push(`概述: ${worldBook.summary}`)

  // Characters
  const chars = worldBook?.characters || []
  if (chars.length > 0) {
    parts.push('\n【角色】')
    chars.forEach(c => {
      parts.push(`- ${c.name} (id: ${c.id})${c.identity ? ', ' + c.identity : ''}`)
    })
  }
  if (worldBook?.userProfile?.name) {
    parts.push(`- 玩家 (__player__): ${worldBook.userProfile.name}`)
  }

  // Dialogue
  if (newDialogue.length > 0) {
    parts.push(`\n【新增对话】(${newDialogue.length}条)`)
    newDialogue.forEach((line, i) => {
      const speaker = line?.speaker || '旁白'
      const text = String(line?.text || '').slice(0, 200)
      const emotion = line?.emotion ? `[${line.emotion}]` : ''
      const charId = line?.characterId ? `(id:${line.characterId})` : ''
      parts.push(`${i + 1}. ${speaker}${charId}${emotion}: ${text}`)
    })
  }

  parts.push(`\n【已记录事件数】${lastLineCount} 条之前已提取过`)

  parts.push('\n【输出格式】严格输出 JSON：')
  parts.push(`{
  "events": [
    {
      "type": "事件类型(conversation|conflict|agreement|discovery|departure|romance|gift|betrayal|milestone|other)",
      "participants": ["参与者角色id数组"],
      "summary": "一句话中文摘要（20-50字）",
      "emotionalImpact": 情感强度1-100,
      "scene": "场景/地点（可选）"
    }
  ],
  "characterMemories": {
    "角色id": [
      {
        "about": "被记忆的角色id",
        "content": "记忆内容（角色主观感受，20-80字）",
        "sentiment": -100到100的数值,
        "relatedEvent": "关联事件摘要（可选）"
      }
    ]
  }
}`)

  parts.push('\n【提取规则】')
  parts.push('- 只有有意义的交互才提取（闲聊跳过）')
  parts.push('- emotionalImpact: 日常对话 10-30, 情感交流 40-60, 冲突/重要事件 70-100')
  parts.push('- characterMemories: 只记录角色对他人产生的主观印象变化')
  parts.push('- participants 必须使用角色 id（UUID），不是名字')
  parts.push('- 如果没有新事件，events 返回空数组')
  parts.push('- 不要输出解释，只输出 JSON')

  return parts.join('\n')
}

/**
 * 标准化提取结果
 */
function normalizeExtractionOutput(parsed, worldBook) {
  if (!parsed || typeof parsed !== 'object') return null

  const validIds = new Set(['__player__'])
  const nameToId = new Map()

  if (worldBook?.userProfile) {
    nameToId.set(worldBook.userProfile.name, '__player__')
  }
  worldBook?.characters?.forEach(c => {
    if (c?.id) {
      validIds.add(c.id)
      if (c.name) nameToId.set(c.name, c.id)
    }
  })

  function resolveId(raw) {
    if (!raw) return null
    if (validIds.has(raw)) return raw
    const mapped = nameToId.get(raw)
    if (mapped) return mapped
    // 尝试按名字模糊匹配
    for (const char of worldBook?.characters || []) {
      if (char.name && raw.includes(char.name)) return char.id
    }
    return null
  }

  const events = []
  if (Array.isArray(parsed.events)) {
    for (const evt of parsed.events) {
      if (!evt || typeof evt !== 'object') continue
      const participants = (Array.isArray(evt.participants) ? evt.participants : [])
        .map(resolveId)
        .filter(Boolean)
      if (participants.length === 0) continue

      const summary = String(evt.summary || '').trim()
      if (!summary) continue

      events.push({
        type: String(evt.type || 'other').trim().slice(0, 30) || 'other',
        participants,
        summary: summary.slice(0, 200),
        emotionalImpact: Math.max(1, Math.min(100, Number(evt.emotionalImpact) || 20)),
        scene: String(evt.scene || '').trim().slice(0, 50) || undefined,
      })
    }
  }

  const characterMemories = {}
  const mem = parsed.characterMemories
  if (mem && typeof mem === 'object') {
    for (const [charId, memories] of Object.entries(mem)) {
      const resolvedChar = resolveId(charId)
      if (!resolvedChar) continue
      if (!Array.isArray(memories) || memories.length === 0) continue

      const normalized = []
      for (const m of memories) {
        if (!m || typeof m !== 'object') continue
        const about = resolveId(m.about)
        if (!about) continue
        const content = String(m.content || '').trim()
        if (!content) continue

        normalized.push({
          about,
          content: content.slice(0, 300),
          sentiment: Math.max(-100, Math.min(100, Number(m.sentiment) || 0)),
          relatedEvent: String(m.relatedEvent || '').trim().slice(0, 200) || undefined,
        })
      }
      if (normalized.length > 0) {
        characterMemories[resolvedChar] = normalized
      }
    }
  }

  // 地点发现：直接透传，不解析角色ID
  const discoveredLocations = []
  if (Array.isArray(parsed.discoveredLocations)) {
    for (const loc of parsed.discoveredLocations) {
      if (loc?.name && String(loc.name).trim()) {
        discoveredLocations.push({
          name: String(loc.name).trim(),
          description: String(loc.description || '').trim().slice(0, 200),
        })
      }
    }
  }

  return { events, characterMemories, discoveredLocations }
}

/**
 * 从新增对话中提取世界记忆事件
 * @param {Object} params
 * @param {Object} params.worldBook - 世界书数据
 * @param {Array} params.newDialogue - 新增的对话条目
 * @param {number} params.lastLineCount - 上次提取时的对话条数（用于跳过已处理的部分）
 * @returns {Promise<{success: boolean, events: Array, characterMemories: Object, error?: string}>}
 */
export async function extractWorldMemory(params = {}) {
  const worldBook = params.worldBook
  const newDialogue = Array.isArray(params.newDialogue) ? params.newDialogue : []
  const lastLineCount = params.lastLineCount || 0

  if (!worldBook || newDialogue.length === 0) {
    return { success: false, error: '缺少世界书数据或无新对话', events: [], characterMemories: {} }
  }

  // 只取最后的新增条目（避免重复处理）
  const slice = lastLineCount > 0 ? newDialogue.slice(-Math.min(newDialogue.length, 30)) : newDialogue

  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error, events: [], characterMemories: {} }
  }

  const userPrompt = buildExtractionPrompt(worldBook, slice, lastLineCount)

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('memory:event_extraction'),
    userPrompt,
    temperature: 0.2,
    maxTokens: 4000,
    timeout: 90000,
  })

  if (!result.success) {
    return { success: false, error: result.error, events: [], characterMemories: {} }
  }

  const parsed = extractJson(result.data)
  if (!parsed) {
    return { success: false, error: '提取结果解析失败', events: [], characterMemories: {} }
  }

  const normalized = normalizeExtractionOutput(parsed, worldBook)
  if (!normalized) {
    return { success: false, error: '提取结果标准化失败', events: [], characterMemories: {}, discoveredLocations: [] }
  }

  return {
    success: true,
    error: null,
    events: normalized.events,
    characterMemories: normalized.characterMemories,
    discoveredLocations: normalized.discoveredLocations || [],
    data: result.data,
  }
}
