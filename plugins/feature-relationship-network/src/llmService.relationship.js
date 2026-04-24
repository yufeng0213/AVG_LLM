import { callChatCompletion, getValidatedActiveConfig } from '../../../src/llm/llmService.core.js'
import { resolvePrompt } from '../../../src/llm/promptRegistry.js'

/**
 * 将LLM原始响应写入本地日志文件（调试用，每次覆盖上一次）
 */
async function logLLMResponse(context, rawResponse, parseSuccess) {
  const timestamp = new Date().toISOString()
  const separator = '='.repeat(60)
  const entry = [
    separator,
    `[${timestamp}] 关系分析 | ${context} | 解析${parseSuccess ? '成功' : '失败'}`,
    separator,
    rawResponse,
    '',
  ].join('\n')

  // Web 浏览器直接用 localStorage
  if (typeof window !== 'undefined' && !window.Capacitor) {
    try {
      localStorage.setItem('relationship_llm_debug_log', entry)
      return
    } catch (e) {
      console.warn('[Relationship] localStorage 写入失败:', e.message)
      return
    }
  }

  // 尝试 Capacitor Filesystem（Android 原生环境）
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    try {
      await Filesystem.mkdir({ path: 'debug', directory: Directory.Documents, recursive: true })
    } catch {}
    const result = await Filesystem.writeFile({
      path: 'debug/relationship-llm-responses.log',
      data: entry,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
    // Capacitor 5+ writeFile 在浏览器中可能返回 undefined 或空对象
    if (result && result.uri) return
    // 没有 uri 说明没真正写入，回退到 localStorage
  } catch {
    // Capacitor 不可用
  }

  // localStorage 回退
  try {
    localStorage.setItem('relationship_llm_debug_log', entry)
  } catch (e) {
    console.warn('[Relationship] 写入LLM响应日志失败:', e.message)
  }
}

/**
 * 剥离 <thinking>...</thinking> 标签及其内容
 */
function stripThinkingTags(content) {
  return content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim()
}

/**
 * 解析XML格式的关系输出
 * 格式：
 * <relationships>
 *   <from id="char_a">
 *     <to id="char_b">
 *       <score>650</score>
 *       <description>描述文本</description>
 *     </to>
 *   </from>
 * </relationships>
 */
function parseXmlFromLlm(rawContent) {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  // 提取 <from> 区块
  const fromRegex = /<from\s+id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/from>/gi
  const result = { relationships: {} }
  let fromMatch

  while ((fromMatch = fromRegex.exec(raw)) !== null) {
    const fromId = fromMatch[1].trim()
    const inner = fromMatch[2]

    // 提取 <to> 区块
    const toRegex = /<to\s+id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/to>/gi
    let toMatch

    while ((toMatch = toRegex.exec(inner)) !== null) {
      const toId = toMatch[1].trim()
      const toInner = toMatch[2]

      const scoreMatch = toInner.match(/<score[^>]*>([\d.]+)<\/score>/i)
      const descMatch = toInner.match(/<description[^>]*>([\s\S]*?)<\/description>/i)

      const score = scoreMatch ? parseFloat(scoreMatch[1]) : null
      const description = descMatch ? descMatch[1].trim() : ''

      if (score !== null) {
        if (!result.relationships[fromId]) result.relationships[fromId] = {}
        result.relationships[fromId][toId] = { score: Math.round(score), description }
      }
    }
  }

  // 如果没找到任何关系，尝试更宽松的正则
  if (Object.keys(result.relationships).length === 0) {
    const fallbackRegex = /<from\s+id=["']([^"']+)["'][^>]*>[\s\S]*?<to\s+id=["']([^"']+)["'][^>]*>[\s\S]*?<score[^>]*>([\d.]+)<\/score>[\s\S]*?<description[^>]*>([\s\S]*?)<\/description>/gi
    let fallbackMatch

    while ((fallbackMatch = fallbackRegex.exec(raw)) !== null) {
      const [, fromId, toId, score, description] = fallbackMatch
      const fId = fromId.trim()
      const tId = toId.trim()
      const s = Math.round(parseFloat(score))

      if (!result.relationships[fId]) result.relationships[fId] = {}
      result.relationships[fId][tId] = { score: s, description: description.trim() }
    }
  }

  return Object.keys(result.relationships).length > 0 ? result : null
}

function buildRelationshipAnalysisPrompt(worldBook, recentDialogue, existingRelationships) {
  const parts = []

  // Worldbook info
  parts.push(`【世界书标题】${worldBook?.title || '未知'}`)
  if (worldBook?.summary) parts.push(`【世界书概述】${worldBook.summary}`)
  if (worldBook?.entries?.overview) parts.push(`【世界观】${worldBook.entries.overview}`)

  // Characters
  const chars = worldBook?.characters || []
  parts.push(`【角色列表】`)
  chars.forEach((c, i) => {
    const mbti = c?.personalityProfile?.mbti || ''
    const tags = Array.isArray(c?.personalityProfile?.behaviorTags) ? c.personalityProfile.behaviorTags.join(',') : ''
    const info = [c.name].filter(Boolean).join(' | ')
    const details = [mbti, tags].filter(Boolean).join(' | ')
    parts.push(`${i + 1}. ${info}${details ? ' | ' + details : ''}`)
  })
  if (worldBook?.userProfile?.name) {
    parts.push(`玩家 (__player__) | 名称: ${worldBook.userProfile.name}${worldBook.userProfile.identity ? ' | 身份: ' + worldBook.userProfile.identity : ''}`)
  } else {
    parts.push('玩家 (__player__)')
  }

  // Recent dialogue
  if (recentDialogue.length > 0) {
    parts.push(`\n【近期对话】(最近${recentDialogue.length}条)`)
    recentDialogue.forEach((line) => {
      const speaker = line?.speaker || '旁白'
      const text = String(line?.text || '').slice(0, 150)
      const emotion = line?.emotion ? `[${line.emotion}]` : ''
      parts.push(`${speaker}${emotion}: ${text}`)
    })
  }

  // Existing relationships
  if (existingRelationships && Object.keys(existingRelationships).length > 0) {
    parts.push(`\n【当前关系】(供参考，请在此基础上增量调整)`)
    for (const [fromId, targets] of Object.entries(existingRelationships)) {
      for (const [toId, rel] of Object.entries(targets)) {
        const fromName = resolveName(fromId, worldBook)
        const toName = resolveName(toId, worldBook)
        parts.push(`${fromName} -> ${toName}: score=${rel.score}, 描述="${rel.description || '无'}"`)
      }
    }
  }

  return parts.join('\n')
}

function resolveName(id, worldBook) {
  if (id === '__player__') return '玩家'
  const char = worldBook?.characters?.find(c => c.id === id)
  return char?.name || id
}

function normalizeRelationshipOutput(parsed, worldBook) {
  if (!parsed || !parsed.relationships || typeof parsed.relationships !== 'object') return null

  const validIds = new Set(['__player__'])
  const nameToId = new Map()
  // Build name → ID mapping
  if (worldBook?.userProfile) {
    const pname = worldBook.userProfile.name || '玩家'
    nameToId.set(pname, '__player__')
  }
  worldBook?.characters?.forEach(c => {
    if (c?.id) {
      validIds.add(c.id)
      nameToId.set(c.name, c.id)
    }
  })

  // Resolve: if a key is not in validIds, try to resolve it by name
  function resolveId(raw) {
    if (validIds.has(raw)) return raw
    const mapped = nameToId.get(raw)
    if (mapped) return mapped
    return null // unknown
  }

  const result = {}
  for (const [fromId, targets] of Object.entries(parsed.relationships)) {
    const resolvedFrom = resolveId(fromId)
    if (!resolvedFrom) continue
    if (!targets || typeof targets !== 'object') continue

    const normalizedTargets = {}
    for (const [toId, rel] of Object.entries(targets)) {
      const resolvedTo = resolveId(toId)
      if (!resolvedTo) continue
      if (!rel || typeof rel !== 'object') continue

      const score = typeof rel.score === 'number'
        ? Math.max(0, Math.min(1000, Math.round(rel.score)))
        : 0
      normalizedTargets[resolvedTo] = {
        score,
        description: typeof rel.description === 'string' && rel.description ? rel.description : '',
        updatedAt: new Date().toISOString(),
      }
    }

    if (Object.keys(normalizedTargets).length > 0) {
      result[resolvedFrom] = normalizedTargets
    }
  }

  // Symmetrize: if A->B exists but B->A doesn't, copy it
  for (const [fromId, targets] of Object.entries(result)) {
    for (const toId of Object.keys(targets)) {
      if (!result[toId] || !result[toId][fromId]) {
        if (!result[toId]) result[toId] = {}
        result[toId][fromId] = { ...targets[toId] }
      }
    }
  }

  return result
}

export async function generateRelationshipAnalysis(params = {}) {
  const worldBook = params.worldBook
  const recentDialogue = Array.isArray(params.recentDialogue) ? params.recentDialogue : []
  const existingRelationships = params.existingRelationships || {}

  if (!worldBook) {
    console.error('[Relationship] 缺少世界书数据')
    return { success: false, error: '缺少世界书数据', relationships: null }
  }

  console.log('[Relationship] 开始分析，世界书:', worldBook.title, '角色数:', worldBook.characters?.length, '对话条数:', recentDialogue.length)

  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    console.error('[Relationship] API配置验证失败:', validated.error)
    return { success: false, error: validated.error, relationships: null }
  }

  const userPrompt = buildRelationshipAnalysisPrompt(worldBook, recentDialogue, existingRelationships)
  console.log('[Relationship] 已构建prompt，长度:', userPrompt.length)

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:relationship_analysis'),
    userPrompt,
    temperature: 0.3,
    maxTokens: 8000,
    timeout: 180000,
  })

  if (!result.success) {
    console.error('[Relationship] LLM调用失败:', result.error)
    return { success: false, error: result.error, relationships: null, data: result.data }
  }

  console.log('[Relationship] LLM返回成功，响应长度:', result.data?.length)

  // 剥离 <thinking>...</thinking> 标签后再解析
  const cleaned = stripThinkingTags(result.data)
  const parsed = parseXmlFromLlm(cleaned)
  console.log('[Relationship] parseXml结果:', parsed ? `找到 ${Object.keys(parsed.relationships).length} 个from角色` : '解析为null')
  if (parsed) {
    console.log('  parsed.relationships 内容:', JSON.stringify(parsed.relationships, null, 2))
    console.log('  有效角色IDs:', Array.from(new Set(['__player__', ...(worldBook.characters?.map(c => c.id) || [])])))
  }
  const normalized = normalizeRelationshipOutput(parsed, worldBook)
  console.log('[Relationship] normalize结果:', normalized ? `最终 ${Object.keys(normalized).length} 组关系` : '归一化为null')
  if (normalized) {
    for (const [k, v] of Object.entries(normalized)) {
      console.log(`  -> ${k}: ${Object.keys(v).length} 条关系`)
    }
  }
  const parseOk = !!normalized

  // 记录LLM原始响应到本地日志
  const worldTitle = worldBook?.title || '未知'
  logLLMResponse(worldTitle, result.data, parseOk)

  if (!parseOk) {
    return { success: false, error: '关系分析解析失败', relationships: null, data: result.data }
  }

  return { success: true, error: null, relationships: normalized, data: result.data }
}

/**
 * NPC-NPC 关系分析（轻量版）
 * 输入是结构化事件列表，不需要理解原始对话
 * @param {Object} params
 * @param {Object} params.worldBook
 * @param {Array} params.events - 世界记忆事件列表
 * @param {Object} params.existingRelationships
 * @returns {Promise<{success: boolean, relationships?: Object, error?: string}>}
 */
export async function generateNpcNpcAnalysis(params = {}) {
  const worldBook = params.worldBook
  const events = Array.isArray(params.events) ? params.events : []
  const existingRelationships = params.existingRelationships || {}

  if (!worldBook || events.length === 0) {
    return { success: false, error: '缺少世界书或事件数据', relationships: null }
  }

  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error, relationships: null }
  }

  const eventsText = events.map(e => {
    const participants = (e.participants || []).map(id => resolveName(id, worldBook)).join('、')
    return `事件: ${participants} 参与了「${e.type || 'unknown'}」— ${e.summary || ''}`
  }).join('\n')

  const existingText = []
  for (const [fromId, targets] of Object.entries(existingRelationships)) {
    for (const [toId, rel] of Object.entries(targets)) {
      if (fromId === '__player__' || toId === '__player__') continue
      const fromName = resolveName(fromId, worldBook)
      const toName = resolveName(toId, worldBook)
      existingText.push(`${fromName} -> ${toName}: score=${rel.score}, 描述="${rel.description || '无'}"`)
    }
  }

  const userPrompt = [
    `【任务】根据以下事件，分析 NPC 之间的关系变化。`,
    `【世界书】${worldBook.title}`,
    `【事件列表】`,
    eventsText,
    existingText.length > 0 ? `【当前关系】(供参考)\n${existingText.join('\n')}` : '',
    `请输出 XML 格式的关系数据。只分析事件中出现的 NPC 之间的关系。`,
    `格式：`,
    `<relationships>`,
    `  <from id="角色A_id">`,
    `    <to id="角色B_id">`,
    `      <score>650</score>`,
    `      <description>关系变化描述</description>`,
    `    </to>`,
    `  </from>`,
    `</relationships>`,
  ].join('\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('relationship:npc_npc_analysis'),
    userPrompt,
    temperature: 0.3,
    maxTokens: 3000,
    timeout: 120000,
  })

  if (!result.success) {
    return { success: false, error: result.error, relationships: null }
  }

  const cleaned = stripThinkingTags(result.data)
  const parsed = parseXmlFromLlm(cleaned)
  const normalized = normalizeRelationshipOutput(parsed, worldBook)
  const parseOk = !!normalized

  if (!parseOk) {
    return { success: false, error: 'NPC-NPC 关系分析解析失败', relationships: null, data: result.data }
  }

  return { success: true, error: null, relationships: normalized, data: result.data }
}
