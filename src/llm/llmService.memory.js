/**
 * LLM 服务模块 — 从对话中提取世界记忆事件（Markdown + 思维链格式）
 */

import { callChatCompletion, getValidatedActiveConfig } from './llmService.core.js'
import { resolvePrompt } from './promptRegistry.js'

/**
 * 从 LLM 原始响应中提取 thinking + markdown 结构化数据
 */
function extractStructured(rawContent) {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const result = { thinking: '', events: [], characterMemories: {}, discoveredLocations: [] }

  // 提取 thinking
  const thinkingMatch = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i)
  if (thinkingMatch?.[1]) {
    result.thinking = thinkingMatch[1].trim()
  }

  // 提取 events — 匹配 ### 事件 N 区块
  const eventBlocks = raw.match(/###\s*事件\s*\d*\s*\n([\s\S]*?)(?=###\s*事件|###\s*角色记忆|###\s*地点发现|####|$)/g)
  if (eventBlocks) {
    for (const block of eventBlocks) {
      const evt = {}
      const typeM = block.match(/-\s*类型[：:]\s*(.+)/i)
      const partM = block.match(/-\s*参与者[：:]\s*(.+)/i)
      const sumM = block.match(/-\s*摘要[：:]\s*(.+)/i)
      const impM = block.match(/-\s*情感强度[：:]\s*(\d+)/i)
      const scenM = block.match(/-\s*场景[：:]\s*(.+)/i)
      if (sumM?.[1]?.trim()) evt.summary = sumM[1].trim()
      if (typeM?.[1]?.trim()) evt.type = typeM[1].trim()
      if (partM?.[1]?.trim()) evt.participants = partM[1].trim().split(/[,，、]\s*/).map(s => s.trim()).filter(Boolean)
      if (impM?.[1]) evt.emotionalImpact = parseInt(impM[1], 10)
      if (scenM?.[1]?.trim()) evt.scene = scenM[1].trim()
      if (evt.summary) result.events.push(evt)
    }
  }

  // 提取 characterMemories
  const memSection = raw.match(/###\s*角色记忆[\s\S]*?\n([\s\S]*?)(?=###\s*地点发现|$)/i)
  if (memSection?.[1]) {
    const charBlocks = memSection[1].split(/####\s+/).filter(Boolean)
    for (const block of charBlocks) {
      const charNameM = block.match(/^([^\n]+)/)
      if (!charNameM) continue
      const charName = charNameM[1].trim()
      if (!charName) continue

      const memItems = []
      // 逐行扫描：遇到 "- 内容:" 开始新记忆
      const lines = block.split('\n')
      let currentMem = null
      for (const line of lines) {
        const contentM = line.match(/-\s*内容[：:]\s*(.+)/i)
        const sentM = line.match(/-\s*情感[：:]\s*(-?\d+)/i)
        const relatedM = line.match(/-\s*关联事件[：:]\s*(.+)/i)
        if (contentM?.[1]?.trim()) {
          if (currentMem) memItems.push(currentMem)
          currentMem = { content: contentM[1].trim().slice(0, 300) }
        } else if (currentMem) {
          if (sentM?.[1]) currentMem.sentiment = parseInt(sentM[1], 10)
          if (relatedM?.[1]?.trim()) currentMem.relatedEvent = relatedM[1].trim().slice(0, 200)
        }
      }
      if (currentMem) memItems.push(currentMem)

      if (memItems.length > 0) {
        result.characterMemories[charName] = memItems
      }
    }
  }

  // 提取 discoveredLocations
  const locSection = raw.match(/###\s*地点发现[\s\S]*?\n([\s\S]*?)$/i)
  if (locSection?.[1]) {
    const locBlocks = locSection[1].split(/-{3,}/).filter(Boolean)
    for (const block of locBlocks) {
      const loc = {}
      const nameM = block.match(/-\s*名称[：:]\s*(.+)/i)
      const descM = block.match(/-\s*描述[：:]\s*(.+)/i)
      if (nameM?.[1]?.trim()) loc.name = nameM[1].trim()
      if (descM?.[1]?.trim()) loc.description = descM[1].trim()
      if (loc.name) result.discoveredLocations.push(loc)
    }
  }

  return result
}

/**
 * 构建事件提取 prompt（Markdown + 思维链格式）
 */
function buildExtractionPrompt(worldBook, newDialogue, lastLineCount) {
  const parts = []

  parts.push('【任务】从以下新增对话中提取有意义的剧情事件和角色情感记忆。')
  parts.push('只提取"新发生的"内容，不要重复已记录的事件。')

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

  // 思维链引导
  parts.push('\n【输出格式】分两步输出：')
  parts.push('\n第一步：<thinking> 标签内逐步分析')
  parts.push('1. 这几条对话中，哪些交互是有意义的？（闲聊跳过）')
  parts.push('2. 每个事件的参与者是谁？类型是什么？')
  parts.push('3. 角色之间是否有主观印象变化？谁对谁有什么印象？')
  parts.push('4. 是否有新地点出现？')
  parts.push('\n第二步：</thinking> 之后，用 Markdown 格式输出提取结果')

  parts.push(`\n\`\`\`markdown
### 事件 1
- 类型: conversation/conflict/agreement/discovery/departure/romance/gift/betrayal/milestone/other
- 参与者: 角色id，用逗号分隔（必须使用id，不是名字）
- 摘要: 一句话中文摘要（20-50字）
- 情感强度: 1-100（日常对话10-30，情感交流40-60，冲突/重要事件70-100）
- 场景: 场景/地点名称（可选）

### 事件 2
...

### 角色记忆
#### 角色id
- 内容: 角色主观感受，20-80字
- 情感: -100到100的数值
- 关联事件: 关联事件摘要（可选）

#### 另一个角色id
...

---
### 地点发现
- 名称: 地点名称
- 描述: 环境、氛围、功能描述（30-80字）
---
...
\`\`\``)

  parts.push('\n【提取规则】')
  parts.push('- 只有有意义的交互才提取')
  parts.push('- participants 必须使用角色 id（UUID），不是名字')
  parts.push('- 如果没有新事件，事件部分留空')
  parts.push('- 角色记忆只记录角色对他人产生的主观印象变化')
  parts.push('- 地点只列出之前世界书中没有的新地点')
  parts.push('- 思维链要逐步分析，不要跳过')

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

  // 发送所有新增的对话，不做截断
  const slice = newDialogue

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
    label: 'World Memory Extract',
  })

  if (!result.success) {
    return { success: false, error: result.error, events: [], characterMemories: {} }
  }

  const parsed = extractStructured(result.data)
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
