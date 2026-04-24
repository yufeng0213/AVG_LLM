/**
 * LLM 服务模块（Phone 功能）
 */

import { getValidatedActiveConfig, callChatCompletion } from './llmService.core'
import { resolvePrompt } from './promptRegistry.js'

const splitSmsReplySegments = (text) => {
  const normalized = String(text || '').replace(/\r/g, '').trim()
  if (!normalized) return []

  const chunks = []
  normalized
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((line) => {
      const sentenceParts = line.match(/[^。！？!?；;]+[。！？!?；;]?/g)
      const parts = (sentenceParts || [line])
        .map((item) => item.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
      if (parts.length > 0) {
        chunks.push(...parts)
      } else {
        chunks.push(line)
      }
    })

  return chunks
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)
}

const tryParseSmsReplies = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return { replies: [], redPacket: null }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  const extractReplies = (value) => {
    if (!value) return []
    if (Array.isArray(value)) return value
    if (typeof value === 'string') return [value]
    if (typeof value !== 'object') return []

    if (Array.isArray(value.replies)) return value.replies
    if (Array.isArray(value.messages)) return value.messages
    if (typeof value.reply === 'string') return [value.reply]
    if (typeof value.text === 'string') return [value.text]
    return []
  }

  const normalizeReplyText = (value) => {
    if (typeof value === 'string') return value.trim()
    if (value && typeof value === 'object') {
      return String(value?.text || value?.reply || value?.content || '').trim()
    }
    return ''
  }

  // ---- Try file protocol: |file=文件名:类型|JSON数据| ----
  let fileData = null
  const fileMatch = candidate.match(/\|file=([^:]+):([^|]+)\|([\s\S]*?)\|/)
  if (fileMatch) {
    const fileName = fileMatch[1].trim()
    const fileType = fileMatch[2].trim()
    const fileContent = fileMatch[3].trim()
    if (fileName && fileType && fileContent) {
      try {
        const parsed = JSON.parse(fileContent)
        fileData = { fileName, fileType, variables: parsed }
      } catch {
        fileData = { fileName, fileType, variables: { content: fileContent } }
      }
    }
  }

  const sendFileIntent = /\|sendfile\|/i.test(candidate)

  // ---- Try delimiter-based protocol first: |r=...| ----
  const replyMatches = candidate.match(/\|r=([^|]+)\|/g)
  if (replyMatches && replyMatches.length > 0) {
    const replies = replyMatches
      .map(m => m.replace(/^\|r=/, '').replace(/\|$/, '').trim())
      .filter(Boolean)
      .flatMap(text => splitSmsReplySegments(text))
      .filter(Boolean)
      .slice(0, 6)

    // Extract redpacket
    let redPacket = null
    const rpMatch = candidate.match(/\|redpacket=(\d+):([^|]+)\|/)
    if (rpMatch) {
      const amount = Number(rpMatch[1])
      const blessing = rpMatch[2].trim().slice(0, 30)
      if (amount >= 1 && amount <= 100) {
        redPacket = { amount: Math.round(amount), blessing: blessing || '小小意思，不成敬意~' }
      }
    }

    // Extract redPacketAction
    let redPacketAction = null
    const rpaMatch = candidate.match(/\|redpacketaction=(accept|decline):([^|]*)\|/i)
    if (rpaMatch) {
      redPacketAction = {
        action: rpaMatch[1].toLowerCase(),
        remark: rpaMatch[2].trim().slice(0, 30),
      }
    }

    // Extract giftToPlayer
    let giftToPlayer = null
    const gtpMatch = candidate.match(/\|gift=([^|]+):([^|]+)\|/)
    if (gtpMatch) {
      const itemName = gtpMatch[1].trim()
      if (itemName) {
        giftToPlayer = {
          itemName,
          message: gtpMatch[2].trim().slice(0, 40),
          count: 1,
        }
      }
    }

    if (replies.length > 0) {
      // Extract voice messages
      let voiceMessages = []
      const voiceMatch = candidate.matchAll(/\|voice=([a-z]+):([^|]+)\|/gi)
      for (const m of voiceMatch) {
        const emotion = m[1].trim().toLowerCase()
        let text = m[2].trim()
        // 去掉首尾引号（"..." / '...' / 「...」 / 『...』）
        text = text.replace(/^[""'「『]+|[""'」』]+$/g, '')
        if (text && ['happy','sad','angry','shy','surprised','thinking','neutral','excited','worried'].includes(emotion)) {
          voiceMessages.push({ voiceText: text, voiceEmotion: emotion })
        }
      }

      // Extract calendar event
      let calendarEvent = null
      const calMatch = candidate.match(/\|calendar=(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?:([^|]+)\|([^|]*)\|/)
      if (calMatch) {
        calendarEvent = {
          date: calMatch[1],
          time: calMatch[2] || null,
          title: calMatch[3].trim().slice(0, 20),
          description: calMatch[4].trim().slice(0, 50),
        }
      }
      return { replies, redPacket, redPacketAction, giftToPlayer, calendarEvent, voiceMessages, fileData, sendFileIntent }
    }
  }

  // ---- Fallback: JSON parsing ----
  const parsed = parseJson(candidate)

  let parsedReplies = extractReplies(parsed)

  if (parsedReplies.length === 0) {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      const sliced = candidate.slice(start, end + 1)
      parsedReplies = extractReplies(parseJson(sliced))
    }
  }

  if (parsedReplies.length === 0) {
    const arrStart = candidate.indexOf('[')
    const arrEnd = candidate.lastIndexOf(']')
    if (arrStart >= 0 && arrEnd > arrStart) {
      const maybeArr = parseJson(candidate.slice(arrStart, arrEnd + 1))
      parsedReplies = Array.isArray(maybeArr) ? maybeArr : []
    }
  }

  const normalizedReplies = parsedReplies
    .map((item) => normalizeReplyText(item))
    .flatMap((text) => splitSmsReplySegments(text))
    .filter(Boolean)

  const replies = normalizedReplies.length > 0
    ? normalizedReplies.slice(0, 6)
    : splitSmsReplySegments(
        candidate
          .replace(/^["'`]+|["'`]+$/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )

  // Extract redPacket from JSON
  let redPacket = null
  if (parsed && parsed.redPacket && typeof parsed.redPacket === 'object') {
    const rp = parsed.redPacket
    const amount = Number(rp.amount)
    const blessing = String(rp.blessing || '').trim()
    if (amount >= 1 && amount <= 100) {
      redPacket = {
        amount: Math.round(amount),
        blessing: blessing || '小小意思，不成敬意~',
      }
    }
  }

  // Extract redPacketAction from JSON
  let redPacketAction = null
  if (parsed && parsed.redPacketAction && typeof parsed.redPacketAction === 'object') {
    const rpa = parsed.redPacketAction
    const action = String(rpa.action || '').toLowerCase().trim()
    if (action === 'accept' || action === 'decline') {
      redPacketAction = {
        action,
        remark: String(rpa.remark || '').trim().slice(0, 30),
      }
    }
  }

  // Extract giftToPlayer from JSON
  let giftToPlayer = null
  if (parsed && parsed.giftToPlayer && typeof parsed.giftToPlayer === 'object') {
    const gtp = parsed.giftToPlayer
    const itemName = String(gtp.itemName || gtp.name || '').trim()
    if (itemName) {
      giftToPlayer = {
        itemName,
        message: String(gtp.message || gtp.text || gtp.remark || '').trim().slice(0, 40),
        count: Number(gtp.count) >= 1 ? Math.round(Number(gtp.count)) : 1,
      }
    }
  }

  // Extract calendarEvent from JSON
  let calendarEvent = null
  if (parsed && parsed.calendarEvent && typeof parsed.calendarEvent === 'object') {
    const ce = parsed.calendarEvent
    const date = String(ce.date || '').trim()
    if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) {
      calendarEvent = {
        date: date.slice(0, 10),
        time: String(ce.time || '').trim() || null,
        title: String(ce.title || '').trim().slice(0, 20),
        description: String(ce.description || ce.desc || '').trim().slice(0, 50),
      }
    }
  }

  return { replies, redPacket, redPacketAction, giftToPlayer, calendarEvent, fileData: fileData || null, sendFileIntent: sendFileIntent || false }
}

/**
 * 将世界记忆数据格式化为短信 prompt 可读的文本
 */
function buildWorldMemoryContext(memories) {
  if (!memories) return ''
  const parts = []

  // 最近事件
  const events = (memories.events || []).filter(e => e.status === 'active').slice(-5)
  if (events.length > 0) {
    parts.push('【近期事件】')
    for (const evt of events) {
      parts.push(`- ${evt.summary || ''}`)
    }
  }

  return parts.join('\n')
}

/**
 * 将关系数据格式化为短信 prompt 可读的文本（当前角色对玩家的主观印象）
 */
function buildRelationshipContext(relationship, contact) {
  if (!relationship) return ''
  const entry = relationship[contact.id]
  if (!entry) return ''

  const parts = []
  if (entry.favor !== undefined) parts.push(`好感度: ${entry.favor}`)
  if (entry.trust !== undefined) parts.push(`信任度: ${entry.trust}`)
  if (entry.stance !== undefined) parts.push(`立场: ${entry.stance}`)
  if (entry.level !== undefined) parts.push(`关系等级: ${entry.level}`)
  if (entry.lastInteraction) parts.push(`最近互动: ${entry.lastInteraction}`)

  return parts.join('，')
}

/**
 * 将群成员关系数据格式化为 prompt 可读的文本
 */
function buildGroupMemberRelationshipsContext(relationships, members, playerName) {
  if (!relationships) return ''
  const parts = []
  for (const m of members) {
    const entry = relationships[m.contactId || m.id]
    if (!entry) continue
    const name = m.contactName || m.name || '未知角色'
    const bits = []
    if (entry.favor !== undefined) bits.push(`好感${entry.favor}`)
    if (entry.trust !== undefined) bits.push(`信任${entry.trust}`)
    if (entry.stance !== undefined) bits.push(`立场${entry.stance}`)
    if (entry.level !== undefined) bits.push(`等级${entry.level}`)
    if (bits.length > 0) {
      parts.push(`${name}对${playerName}: ${bits.join('，')}`)
    }
  }
  return parts.join('\n')
}

// ===== 可打印文件三阶段流程 =====

const FALLBACK_PRINTABLE_TYPES = ['letter-handwritten', 'exam-paper', 'invitation', 'sticky-note']

/**
 * 扫描可打印文件可用类型
 * 支持自定义 baseDir（native:// 或 web 路径），fallback 到 manifest.json
 */
async function scanPrintableTypes(customBaseDir) {
  // Custom baseDir (native:// or web URL)
  if (customBaseDir) {
    if (customBaseDir.startsWith('native://')) {
      return scanNativePrintableTypes(customBaseDir)
    }
    // Web URL: scan subdirectories
    return scanWebPrintableTypes(customBaseDir)
  }

  // Default: fetch manifest.json
  try {
    const res = await fetch('./data/printables/manifest.json')
    if (res.ok) {
      const typeIds = await res.json()
      if (Array.isArray(typeIds) && typeIds.length > 0) {
        return Promise.all(typeIds.map(id => loadPrintablePromptJson(id)))
      }
    }
  } catch { /* ignore */ }

  // Fallback: load hardcoded types
  return Promise.all(FALLBACK_PRINTABLE_TYPES.map(id => loadPrintablePromptJson(id)))
}

/**
 * 从 native:// 路径扫描子目录类型
 */
async function scanNativePrintableTypes(baseDir) {
  try {
    console.log('[printable] scanNative, baseDir:', baseDir)
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const nativeBase = baseDir.slice('native://'.length).replace(/^\/+/, '').replace(/\/+$/, '')
    console.log('[printable] nativeBase resolved:', nativeBase)
    const result = await Filesystem.readdir({ path: nativeBase, directory: Directory.Data })
    console.log('[printable] readdir result:', result.files?.map(f => `${f.name}(${f.type})`))
    const subdirs = result.files.filter(f => f.type === 'directory').map(f => f.name)
    const types = await Promise.all(subdirs.map(async (id) => {
      const t = await loadPrintablePromptJson(id, baseDir)
      console.log('[printable] loadPromptJson for', id, t ? 'OK' : 'NULL')
      return t
    }))
    return types.filter(Boolean)
  } catch (e) {
    console.warn('[printable] native scan failed:', e.message, e.stack)
    return []
  }
}

/**
 * 从 web URL 扫描子目录类型（列出子目录需要 manifest 或硬编码）
 */
async function scanWebPrintableTypes(baseDir) {
  // Try fetching a manifest first
  try {
    const url = baseDir.endsWith('/') ? `${baseDir}manifest.json` : `${baseDir}/manifest.json`
    const res = await fetch(url)
    if (res.ok) {
      const typeIds = await res.json()
      if (Array.isArray(typeIds) && typeIds.length > 0) {
        return Promise.all(typeIds.map(id => loadPrintablePromptJson(id, baseDir)))
      }
    }
  } catch { /* ignore */ }
  return []
}

/**
 * 加载单个 prompt.json
 * @param {string} typeId - 类型 ID（子目录名）
 * @param {string} [customBaseDir] - 自定义基础目录（可选）
 */
async function loadPrintablePromptJson(typeId, customBaseDir) {
  try {
    let json
    if (customBaseDir && customBaseDir.startsWith('native://')) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const nativeBase = customBaseDir.slice('native://'.length).replace(/^\/+/, '').replace(/\/+$/, '')
      const path = `${nativeBase}/${typeId}/prompt.json`
      const result = await Filesystem.readFile({ path, directory: Directory.Data, encoding: 'utf8' })
      json = JSON.parse(result.data)
    } else if (customBaseDir) {
      const url = customBaseDir.endsWith('/') ? `${customBaseDir}${typeId}/prompt.json` : `${customBaseDir}/${typeId}/prompt.json`
      const res = await fetch(url)
      if (!res.ok) return null
      json = await res.json()
    } else {
      const res = await fetch(`./data/printables/${typeId}/prompt.json`)
      if (!res.ok) return null
      json = await res.json()
    }
    return { ...json, variableKeys: Object.keys(json.variables || {}) }
  } catch { /* ignore */ }
  return null
}

/**
 * 阶段2：选文件类型
 */
async function selectPrintableType(printableTypes, contactName, contextMessages) {
  const available = (printableTypes || []).filter(Boolean)
  if (available.length === 0) return null

  const typeList = available
    .map(t => `- ${t.id}（${t.name}）：${t.description || ''}`)
    .join('\n')

  const systemPrompt = `你是一个文件类型选择器。根据对话上下文，从可用类型列表中选择最合适的一种。只返回类型 id，不要其他内容。`
  const userPrompt = [
    `可用文件类型：\n${typeList}`,
    `角色：${contactName}`,
    contextMessages ? `上下文（最近 ${contextMessages.length} 条消息）：\n${contextMessages.slice(-10).map(m => `${m.role === 'user' ? '玩家' : contactName}: ${m.text || ''}`).join('\n')}` : '',
    `请根据上下文选择最合适的文件类型，只返回类型 id。`,
  ].filter(Boolean).join('\n\n')

  const validated = await getValidatedActiveConfig()
  if (!validated.success) return null

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt,
    userPrompt,
    temperature: 0.5,
    maxTokens: 64,
  })

  if (!result.success) return null

  const selected = result.data.trim().toLowerCase()
  const matched = available.find(t => t.id === selected || t.id.includes(selected))
  return matched ? matched.id : null
}

/**
 * 阶段3：填充文件变量
 */
async function generateFileVariables(promptJson, contact, worldBook, contextMessages) {
  const variables = promptJson.variables || {}
  const varDef = JSON.stringify(variables, null, 2)

  const systemPrompt = `你是文件内容填充器。根据角色身份和对话上下文，填充文件模板所需的变量值。只输出 JSON 对象，不要 markdown，不要解释。`
  const userPrompt = [
    `文件类型：${promptJson.name}（${promptJson.id}）`,
    `角色：${contact.name}`,
    contact.identity ? `角色身份：${contact.identity}` : '',
    `变量定义：\n${varDef}`,
    contextMessages && contextMessages.length > 0 ? `最近上下文：\n${contextMessages.slice(-10).map(m => `${m.role === 'user' ? '玩家' : contact.name}: ${m.text || ''}`).join('\n')}` : '',
    `请根据角色和上下文，填充以上所有变量，返回 JSON 对象。`,
  ].filter(Boolean).join('\n\n')

  const validated = await getValidatedActiveConfig()
  if (!validated.success) return null

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt,
    userPrompt,
    temperature: 0.8,
    maxTokens: 1024,
  })

  if (!result.success) return null

  // 尝试提取 JSON
  const raw = result.data.trim()
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const jsonStr = fencedMatch?.[1]?.trim() || raw

  // 清理可能的多余内容
  const start = jsonStr.indexOf('{')
  const end = jsonStr.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(jsonStr.slice(start, end + 1))
    } catch { /* ignore */ }
  }
  return null
}

/**
 * 导出：三阶段文件生成流程
 */
export const generatePhoneSmsFile = async (params = {}) => {
  const contact = params.contact && typeof params.contact === 'object' ? params.contact : null
  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const contextMessages = Array.isArray(params.history) ? params.history : []
  const customBaseDir = params.customBaseDir || null
  console.log('[printable] generatePhoneSmsFile, customBaseDir:', customBaseDir)

  if (!contact?.name) {
    return { success: false, error: '角色参数不完整' }
  }

  // 阶段1+2：扫描类型 + 选类型
  const types = await scanPrintableTypes(customBaseDir)
  console.log('[printable] scanned types:', types.map(t => t?.name || t?.id))
  const typeId = await selectPrintableType(types, contact.name, contextMessages)
  console.log('[printable] selected typeId:', typeId)
  if (!typeId) {
    return { success: false, error: '未选择合适的文件类型' }
  }

  // 加载 prompt.json
  const promptJson = await loadPrintablePromptJson(typeId, customBaseDir)
  console.log('[printable] promptJson loaded:', promptJson ? 'OK' : 'NULL')
  if (!promptJson) {
    return { success: false, error: `未找到文件类型的 prompt.json: ${typeId}` }
  }

  // 阶段3：填变量
  const variables = await generateFileVariables(promptJson, contact, worldBook, contextMessages)
  console.log('[printable] variables generated:', variables ? 'OK' : 'NULL')
  if (!variables) {
    return { success: false, error: '文件内容生成失败' }
  }

  return {
    success: true,
    fileType: typeId,
    fileName: promptJson.name,
    variables,
  }
}

const clampPromptLineCount = (value, fallback, max = 200) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(max, parsed))
}

const clampMaxTokens = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(128, Math.min(200000, parsed))
}

export const generatePhoneSmsReply = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      reply: '',
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const contact = params.contact && typeof params.contact === 'object' ? params.contact : null
  const userMessage = String(params.userMessage || '').trim()

  // 世界记忆上下文
  const worldMemories = params.worldMemories && typeof params.worldMemories === 'object' ? params.worldMemories : null
  // 关系数据上下文
  const relationshipSnapshot = params.relationshipSnapshot && typeof params.relationshipSnapshot === 'object'
    ? params.relationshipSnapshot : null

  if (!contact?.name || !userMessage) {
    return {
      success: false,
      error: '短信参数不完整',
      reply: '',
    }
  }

  const history = Array.isArray(params.history) ? params.history : []
  const dialogueHistory = Array.isArray(params.dialogueHistory) ? params.dialogueHistory : []
  const currentLine = params.currentLine && typeof params.currentLine === 'object' ? params.currentLine : null
  const smsHistoryLimit = clampPromptLineCount(params.options?.historyLimit, 8, 300)
  const dialogueHistoryLimit = clampPromptLineCount(params.options?.dialogueLimit, 4, 180)
  const smsMaxTokens = clampMaxTokens(params.options?.maxTokens, 420)
  const forwardedClues = Array.isArray(params.forwardedClues)
    ? params.forwardedClues
        .map((item) => ({
          sourceType: String(item?.sourceType || '').trim(),
          title: String(item?.title || '').trim(),
          summary: String(item?.summary || '').trim(),
          tags: Array.isArray(item?.tags)
            ? item.tags
                .map((tag) => String(tag || '').trim())
                .filter(Boolean)
                .slice(0, 4)
            : [],
        }))
        .filter((item) => item.title || item.summary)
        .slice(0, 6)
    : []

  const recentSms = (smsHistoryLimit > 0 ? history.slice(-smsHistoryLimit) : [])
    .map((item) => `${item?.role === 'assistant' ? contact.name : '玩家'}: ${String(item?.text || '').trim()}`)
    .filter(Boolean)
    .join('\n')

  const stickerList = Array.isArray(params.options?.stickerList) ? params.options.stickerList : []
  const stickerText = stickerList.length > 0
    ? `【可用表情包】${stickerList.join('、')}（想发表情时用 [sticker:描述] 格式）`
    : ''

  const recentDialogue = (dialogueHistoryLimit > 0 ? dialogueHistory.slice(-dialogueHistoryLimit) : [])
    .map((line) => `${String(line?.speaker || '旁白')}: ${String(line?.text || '').trim()}`)
    .filter(Boolean)
    .join('\n')

  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const roleSummary = String(contact?.identity || contact?.subtitle || '').trim()
  const styleHint = String(worldBook?.defaultNarratorId || '').trim()

  // 使用有效用户身份（全局用户 + 世界书覆写），由调用方传入
  const smsEffectiveUser = params.effectiveUser && typeof params.effectiveUser === 'object' ? params.effectiveUser : null
  const smsPlayerName = smsEffectiveUser
    ? String(smsEffectiveUser.name || '玩家').trim()
    : String(worldBook?.userProfile?.name || worldBook?.userProfile?.nickname || '玩家').trim()

  const currentLineText = currentLine?.text
    ? `${String(currentLine?.speaker || '旁白')}: ${String(currentLine.text || '').trim()}`
    : ''
  const forwardedClueText = forwardedClues
    .map((item, index) => {
      const sourceText = String(item.sourceType || '').trim() || '线索'
      const title = item.title || '(无标题)'
      const summary = item.summary || ''
      const tags = item.tags.length > 0 ? ` | 标签: ${item.tags.join('、')}` : ''
      return `${index + 1}. [${sourceText}] ${title}${summary ? `\n摘要: ${summary}` : ''}${tags}`
    })
    .join('\n')

  const now = new Date()
  const currentTimeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  // 世界记忆文本
  const worldMemoryText = buildWorldMemoryContext(worldMemories)
  // 关系数据文本
  const relationshipText = buildRelationshipContext(relationshipSnapshot, contact)

  const userPrompt = [
    `【世界书标题】${String(worldBook?.title || '默认世界书').trim()}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    `【角色名】${contact.name}`,
    roleSummary ? `【角色信息】${roleSummary}` : '',
    styleHint ? `【叙事风格ID参考】${styleHint}` : '',
    `【当前发信人】${smsPlayerName}`,
    `【当前时间】${currentTimeStr}`,
    currentLineText ? `【当前剧情句】${currentLineText}` : '',
    recentDialogue ? `【最近剧情上下文】\n${recentDialogue}` : '',
    recentSms ? `【最近短信记录】\n${recentSms}` : '',
    worldMemoryText ? `【共享记忆】\n${worldMemoryText}` : '',
    relationshipText ? `【你对玩家的印象】\n${relationshipText}` : '',
    forwardedClueText ? `【本次转发线索】\n${forwardedClueText}` : '',
    stickerText ? stickerText : '',
    `【玩家刚发送】${userMessage}`,
    forwardedClueText
      ? '请结合线索逐条给出判断与态度，建议输出 2-4 条连续短信回复。'
      : '可输出 1-4 条连续短信回复，不要只回一句敷衍话。你可以像恋爱中的人一样主动关心对方、安排约定、分享心里话或秘密。',
    '请按格式返回：|r=回复1|\n|r=回复2|\n（可选）|redpacket=50:祝福语|',
    '如果你觉得应该提醒玩家未来的某件事、约定一个计划、或者想在未来某个时间告诉 ta 一个秘密/心里话，请额外加 |calendar=日期T时间:标题|描述|，日期时间请根据当前时间推断。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:sms_reply'),
    userPrompt,
    temperature: params.options?.temperature ?? 0.85,
    maxTokens: smsMaxTokens,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '短信生成失败',
      reply: '',
      replies: [],
      redPacket: null,
      calendarEvent: null,
      voiceMessages: [],
    }
  }

  const parsed = tryParseSmsReplies(result.data)
  const replies = parsed.replies
  if (replies.length === 0) {
    return {
      success: false,
      error: '短信回复解析失败',
      reply: '',
      replies: [],
      redPacket: null,
      calendarEvent: null,
      voiceMessages: [],
    }
  }

  return {
    success: true,
    error: null,
    reply: replies[0],
    replies,
    redPacket: parsed.redPacket,
    redPacketAction: parsed.redPacketAction,
    giftToPlayer: parsed.giftToPlayer,
    calendarEvent: parsed.calendarEvent || null,
    voiceMessages: parsed.voiceMessages || [],
    sendFileIntent: parsed.sendFileIntent || false,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

/**
 * 寝室当面聊天
 * 和 generatePhoneSmsReply 的区别：
 * - 使用 DORM_CHAT_SYSTEM_PROMPT（面对面感，不是短信）
 * - 用户提示词里不强调"短信记录"，改为"最近聊天"
 * - 不传线索、剧情线等额外字段
 */
export const generateDormChatReply = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      reply: '',
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const contact = params.contact && typeof params.contact === 'object' ? params.contact : null
  const userMessage = String(params.userMessage || '').trim()
  const hasPendingRedPacket = !!params.hasPendingRedPacket

  // 世界记忆上下文
  const worldMemories = params.worldMemories && typeof params.worldMemories === 'object' ? params.worldMemories : null
  // 关系数据上下文
  const relationshipSnapshot = params.relationshipSnapshot && typeof params.relationshipSnapshot === 'object'
    ? params.relationshipSnapshot : null

  if (!contact?.name || !userMessage) {
    return {
      success: false,
      error: '聊天参数不完整',
      reply: '',
    }
  }

  const history = Array.isArray(params.history) ? params.history : []
  const historyLimit = clampPromptLineCount(params.options?.historyLimit, 10, 300)
  const maxTokens = clampMaxTokens(params.options?.maxTokens, 420)
  const inventoryContext = typeof params.inventoryContext === 'string' ? params.inventoryContext : null
  const todoContext = typeof params.todoContext === 'string' ? params.todoContext : null

  const recentChat = (historyLimit > 0 ? history.slice(-historyLimit) : [])
    .map((item) => {
      if (item.role === 'assistant') return `${contact.name}: ${String(item.text || '').trim()}`
      if (item.type === 'redPacket') return `${item.senderName || '玩家'}: 🧧 发了一个红包`
      return `玩家: ${String(item.text || '').trim()}`
    })
    .filter(Boolean)
    .join('\n')

  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const roleSummary = String(contact?.identity || contact?.subtitle || '').trim()

  // 使用有效用户身份（全局用户 + 世界书覆写），由调用方传入
  const effectiveUser = params.effectiveUser && typeof params.effectiveUser === 'object' ? params.effectiveUser : null
  const playerDisplayName = effectiveUser
    ? String(effectiveUser.name || '玩家').trim()
    : String(worldBook?.userProfile?.name || worldBook?.userProfile?.nickname || '玩家').trim()
  const playerDescription = effectiveUser ? String(effectiveUser.description || '').trim() : ''

  // 世界记忆上下文
  const worldMemoryText = buildWorldMemoryContext(worldMemories)
  // 关系数据上下文
  const relationshipText = buildRelationshipContext(relationshipSnapshot, contact)

  const userPrompt = [
    `【世界书标题】${String(worldBook?.title || '默认世界书').trim()}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    `【角色名】${contact.name}`,
    roleSummary ? `【角色信息】${roleSummary}` : '',
    `【玩家名】${playerDisplayName}`,
    playerDescription ? `【玩家简介】${playerDescription}` : '',
    recentChat ? `【最近聊天】\n${recentChat}` : '',
    worldMemoryText ? `【共享记忆】\n${worldMemoryText}` : '',
    relationshipText ? `【你对玩家的印象】\n${relationshipText}` : '',
    `【玩家刚发送】${userMessage}`,
    hasPendingRedPacket ? '【特别提示】玩家刚刚给你发了一个红包，请决定领取或退回，并在回复中体现你的反应。' : '',
    inventoryContext ? `【玩家冰箱】${inventoryContext}` : '',
    todoContext ? `【玩家待办】${todoContext}` : '',
    '请面对面自然回应，可以描写动作、神态或环境。建议输出 1-4 条连续回复。',
    '请按格式返回：|r=回复1|\n|r=回复2|\n（可选）|redpacket=50:祝福语|',
    '如果对话中提到了未来的约定或计划，请加 |calendar=日期T时间:标题|描述|。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:dorm_chat'),
    userPrompt,
    temperature: params.options?.temperature ?? 0.85,
    maxTokens,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '聊天生成失败',
      reply: '',
      replies: [],
      redPacket: null,
      redPacketAction: null,
      giftToPlayer: null,
    }
  }

  const parsed = tryParseSmsReplies(result.data)
  const replies = parsed.replies
  if (replies.length === 0) {
    return {
      success: false,
      error: '聊天回复解析失败',
      reply: '',
      replies: [],
      redPacket: null,
      redPacketAction: null,
      giftToPlayer: null,
    }
  }

  return {
    success: true,
    error: null,
    reply: replies[0],
    replies,
    redPacket: parsed.redPacket,
    redPacketAction: parsed.redPacketAction,
    giftToPlayer: parsed.giftToPlayer,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const CALL_SYSTEM_PROMPT = `你是"电话通话角色回应生成器"。
你负责代入指定角色，模拟和玩家的电话通话。
电话中只能通过声音感知对方，看不到动作、表情或环境。

输出格式：
- 你说的话直接写，不要用引号包裹对话内容
- 声音相关的描写放在()括号里，例如：（叹气）（轻笑）（拉开椅子的声音）（沉默了几秒）（喝了一口水）（纸张翻动声）
- 可以描写：语气变化、叹气、轻笑、呼吸声、喝水声、咳嗽、沉默、纸张翻动声等
- 不要描写：点头、摇头、歪头、眨眼、环顾四周等纯视觉动作
- 多条回复之间用 |R| 分隔，总条数 1-4 条

硬性要求：
1) 不要输出 JSON，不要 markdown，不要解释，只输出用 |R| 分隔的回复内容
2) 每条回复必须是中文，建议 8-60 字
3) 语气与角色身份、世界观和最近上下文一致，不要跳戏
4) 不要把用户原话逐句重复，不要写"作为AI""我无法"等元话术
5) 电话中只能听到声音，所以描写要围绕听觉感知展开`

/**
 * 电话通话回复生成
 * 和 generateDormChatReply 的区别：
 * - 使用 CALL_SYSTEM_PROMPT（电话听觉视角，不是面对面）
 * - 输出格式用 |R| 分隔，不是 JSON
 * - 不传红包、礼物等字段（电话场景不涉及）
 */
export const generatePhoneCallReply = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      reply: '',
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const contact = params.contact && typeof params.contact === 'object' ? params.contact : null
  const userMessage = String(params.userMessage || '').trim()

  if (!contact?.name || !userMessage) {
    return {
      success: false,
      error: '通话参数不完整',
      reply: '',
    }
  }

  const history = Array.isArray(params.history) ? params.history : []
  const historyLimit = clampPromptLineCount(params.options?.historyLimit, 10, 300)
  const maxTokens = clampMaxTokens(params.options?.maxTokens, 420)

  const recentChat = (historyLimit > 0 ? history.slice(-historyLimit) : [])
    .map((item) => {
      if (item.role === 'assistant') return `${contact.name}: ${String(item.text || '').trim()}`
      return `玩家: ${String(item.text || '').trim()}`
    })
    .filter(Boolean)
    .join('\n')

  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const roleSummary = String(contact?.identity || contact?.subtitle || '').trim()

  const effectiveUser = params.effectiveUser && typeof params.effectiveUser === 'object' ? params.effectiveUser : null
  const playerDisplayName = effectiveUser
    ? String(effectiveUser.name || '玩家').trim()
    : String(worldBook?.userProfile?.name || worldBook?.userProfile?.nickname || '玩家').trim()
  const playerDescription = effectiveUser ? String(effectiveUser.description || '').trim() : ''

  const userPrompt = [
    `【世界书标题】${String(worldBook?.title || '默认世界书').trim()}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    `【角色名】${contact.name}`,
    roleSummary ? `【角色信息】${roleSummary}` : '',
    `【玩家名】${playerDisplayName}`,
    playerDescription ? `【玩家简介】${playerDescription}` : '',
    recentChat ? `【最近通话记录】\n${recentChat}` : '',
    `【玩家刚说的话】${userMessage}`,
    '请在电话中自然回应，可以夹杂声音描写。建议输出 1-4 条连续回复。',
    '请只返回用 |R| 分隔的回复内容，不要输出 JSON 或 markdown。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:call'),
    userPrompt,
    temperature: params.options?.temperature ?? 0.85,
    maxTokens,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '通话回复生成失败',
      reply: '',
      replies: [],
    }
  }

  const replies = tryParseCallReplies(result.data)
  if (replies.length === 0) {
    return {
      success: false,
      error: '通话回复解析失败',
      reply: '',
      replies: [],
    }
  }

  return {
    success: true,
    error: null,
    reply: replies[0],
    replies,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const tryParseCallReplies = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return []

  // 尝试去掉可能的 markdown fence
  const fencedMatch = raw.match(/```\w*\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const replies = candidate
    .split(/\s*\|R\|\s*/)
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 6)

  return replies
}

const MOMENTS_SYSTEM_PROMPT = `你是”朋友圈评论生成器”。
你要根据动态内容、世界观和角色设定，生成 1-3 条自然的中文评论。

硬性要求：
1) 不要 markdown，不要解释，只输出分隔符格式。
2) 分隔符格式：|c=角色名:评论内容|
   每条评论一行，用 |c= 开头，以 | 结尾。
3) 角色名必须从提供的”可用评论角色列表”中选择，且不要重复。
4) 评论内容必须是中文，口语化，建议 8-40 字，不要出现”作为AI”等元话术。`

const tryParseMomentsComments = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return []

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  const extractComments = (value) => {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object' && Array.isArray(value.comments)) return value.comments
    return []
  }

  // ---- Try delimiter-based protocol first: |c=角色名:评论内容| ----
  const commentMatches = candidate.match(/\|c=([^|]+)\|/g)
  if (commentMatches && commentMatches.length > 0) {
    const comments = commentMatches
      .map(m => m.replace(/^\|c=/, '').replace(/\|$/, '').trim())
      .map(item => {
        const colonIdx = item.indexOf(':')
        if (colonIdx < 0) return null
        const authorName = item.slice(0, colonIdx).trim()
        const text = item.slice(colonIdx + 1).trim()
        if (!text || !authorName) return null
        return { authorName, text }
      })
      .filter(Boolean)
    if (comments.length > 0) return comments
  }

  // ---- Fallback: JSON parsing ----
  let parsedComments = extractComments(parseJson(candidate))

  if (parsedComments.length === 0) {
    const objStart = candidate.indexOf('{')
    const objEnd = candidate.lastIndexOf('}')
    if (objStart >= 0 && objEnd > objStart) {
      parsedComments = extractComments(parseJson(candidate.slice(objStart, objEnd + 1)))
    }
  }

  if (parsedComments.length === 0) {
    const arrStart = candidate.indexOf('[')
    const arrEnd = candidate.lastIndexOf(']')
    if (arrStart >= 0 && arrEnd > arrStart) {
      const maybeArr = parseJson(candidate.slice(arrStart, arrEnd + 1))
      parsedComments = Array.isArray(maybeArr) ? maybeArr : []
    }
  }

  return parsedComments
    .map((item) => {
      if (typeof item === 'string') {
        return {
          authorName: '',
          text: item.trim(),
        }
      }

      const authorName = String(item?.authorName || item?.author || item?.name || '').trim()
      const text = String(item?.text || item?.reply || item?.content || '').trim()
      if (!text) return null

      return { authorName, text }
    })
    .filter(Boolean)
}

export const generatePhoneMomentsReplies = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      comments: [],
    }
  }

  const postContent = String(params.postContent || '').trim()
  if (!postContent) {
    return {
      success: false,
      error: '朋友圈内容为空',
      comments: [],
    }
  }

  const rawContacts = Array.isArray(params.contacts) ? params.contacts : []
  const availableContacts = rawContacts
    .map((item, index) => ({
      id: String(item?.id || `contact_${index}`).trim(),
      name: String(item?.name || '').trim(),
      identity: String(item?.identity || item?.subtitle || '').trim(),
    }))
    .filter((item) => item.id && item.name)

  if (availableContacts.length === 0) {
    return {
      success: false,
      error: '没有可用的角色用于评论',
      comments: [],
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const dialogueHistory = Array.isArray(params.dialogueHistory) ? params.dialogueHistory : []
  const momentsHistory = Array.isArray(params.momentsHistory) ? params.momentsHistory : []

  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const recentDialogue = dialogueHistory
    .slice(-4)
    .map((line) => `${String(line?.speaker || '旁白')}: ${String(line?.text || '').trim()}`)
    .filter(Boolean)
    .join('\n')

  const recentMoments = momentsHistory
    .slice(0, 4)
    .map((post) => {
      const content = String(post?.content || '').trim()
      if (!content) return ''
      const comments = Array.isArray(post?.comments)
        ? post.comments
            .slice(0, 3)
            .map((comment) => `${String(comment?.authorName || '好友')}: ${String(comment?.text || '').trim()}`)
            .filter(Boolean)
            .join(' | ')
        : ''
      return comments ? `动态: ${content}\n评论: ${comments}` : `动态: ${content}`
    })
    .filter(Boolean)
    .join('\n\n')

  const contactListText = availableContacts
    .map((item, index) => `${index + 1}. ${item.name}${item.identity ? `（${item.identity}）` : ''}`)
    .join('\n')

  const userPrompt = [
    `【世界书标题】${String(worldBook?.title || '默认世界书').trim()}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    recentDialogue ? `【最近剧情上下文】\n${recentDialogue}` : '',
    recentMoments ? `【最近朋友圈参考】\n${recentMoments}` : '',
    `【玩家刚发布的动态】${postContent}`,
    `【可用评论角色（必须从此列表选择）】\n${contactListText}`,
    '请生成 1-3 条评论并只返回分隔符格式：|c=角色名:评论内容|',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:moments_comment'),
    userPrompt,
    temperature: params.options?.temperature ?? 0.9,
    maxTokens: params.options?.maxTokens ?? 380,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '朋友圈评论生成失败',
      comments: [],
    }
  }

  const parsed = tryParseMomentsComments(result.data)
  if (parsed.length === 0) {
    return {
      success: false,
      error: '朋友圈评论解析失败',
      comments: [],
    }
  }

  const usedContactIds = new Set()
  const comments = []

  for (const item of parsed) {
    const authorHint = String(item.authorName || '').trim()
    const text = String(item.text || '').trim()
    if (!text) continue

    let matchedContact = null
    if (authorHint) {
      matchedContact = availableContacts.find((contact) => contact.name === authorHint) || null
      if (!matchedContact) {
        matchedContact = availableContacts.find(
          (contact) => contact.name.includes(authorHint) || authorHint.includes(contact.name),
        ) || null
      }
    }

    if (!matchedContact) {
      matchedContact = availableContacts.find((contact) => !usedContactIds.has(contact.id)) || null
    }

    if (!matchedContact || usedContactIds.has(matchedContact.id)) continue

    comments.push({
      authorId: matchedContact.id,
      authorName: matchedContact.name,
      text,
    })
    usedContactIds.add(matchedContact.id)

    if (comments.length >= 3) break
  }

  if (comments.length === 0) {
    return {
      success: false,
      error: '朋友圈评论为空',
      comments: [],
    }
  }

  return {
    success: true,
    error: null,
    comments,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

/**
 * 单条朋友圈互动回复
 */
export const generatePhoneMomentsReply = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      reply: '',
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const contact = params.contact && typeof params.contact === 'object' ? params.contact : null
  const momentText = String(params.momentText || '').trim()
  const playerAction = String(params.playerAction || '').trim()

  if (!contact?.name || !momentText || !playerAction) {
    return {
      success: false,
      error: '朋友圈互动参数不完整',
      reply: '',
    }
  }

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:moments_reply'),
    userPrompt: [
      `【角色名】${contact.name}`,
      contact.identity ? `【角色信息】${contact.identity}` : '',
      worldBook?.title ? `【世界背景】${worldBook.title}` : '',
      `【你的动态】${momentText}`,
      `【玩家互动】${playerAction}`,
      '请回复一条自然的回应，1-20字。',
    ].filter(Boolean).join('\n'),
    temperature: params.options?.temperature ?? 0.85,
    maxTokens: params.options?.maxTokens ?? 60,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '朋友圈互动回复生成失败',
      reply: '',
    }
  }

  const reply = String(result.data || '').trim().slice(0, 50)
  return {
    success: true,
    error: null,
    reply,
    rawResponse: result.rawResponse,
  }
}

/**
 * 角色个性签名生成（用于联系人列表状态栏）
 */
export const generatePhoneContactSignature = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      signature: '',
    }
  }

  const contact = params.contact && typeof params.contact === 'object' ? params.contact : null
  if (!contact?.name) {
    return {
      success: false,
      error: '角色信息不完整',
      signature: '',
    }
  }

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:contact_signature'),
    userPrompt: [
      `【角色名】${contact.name}`,
      contact.identity ? `【角色身份】${contact.identity}` : '',
      contact.personalityProfile ? `【性格特点】${contact.personalityProfile}` : '',
    ].filter(Boolean).join('\n'),
    temperature: params.options?.temperature ?? 0.9,
    maxTokens: params.options?.maxTokens ?? 80,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '签名生成失败',
      signature: '',
    }
  }

  const sig = String(result.data || '').trim().replace(/^[“”'']+|[“”'']+$/g, '').slice(0, 60)
  return {
    success: true,
    error: null,
    signature: sig,
    rawResponse: result.rawResponse,
  }
}

const MOMENTS_BATCH_REPLY_SYSTEM_PROMPT = `你是”朋友圈续聊生成器”。
你要根据玩家对评论区角色的回复，生成这些角色的后续评论回复。

硬性要求：
1) 不要 markdown，不要解释，只输出分隔符格式。
2) 分隔符格式：|r=待回复ID:角色名:回复内容|
   每条回复一行，用 |r= 开头，以 | 结尾。
3) 待回复ID 必须从输入的待回复列表中选择，并且一条 ID 最多回复一次。
4) 角色名优先与该待回复ID 的目标角色一致。
5) 回复内容必须是中文，口语化，建议 8-40 字，不要出现”作为AI”等元话术。`

const tryParseMomentsBatchReplies = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return []

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  const extractReplies = (value) => {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object' && Array.isArray(value.replies)) return value.replies
    return []
  }

  // ---- Try delimiter-based protocol first: |r=pendingId:角色名:回复内容| ----
  const replyMatches = candidate.match(/\|r=([^|]+)\|/g)
  if (replyMatches && replyMatches.length > 0) {
    const replies = replyMatches
      .map(m => m.replace(/^\|r=/, '').replace(/\|$/, '').trim())
      .map(item => {
        const firstColon = item.indexOf(':')
        if (firstColon < 0) return null
        const pendingId = item.slice(0, firstColon).trim()
        const rest = item.slice(firstColon + 1)
        const secondColon = rest.indexOf(':')
        if (secondColon < 0) return null
        const authorName = rest.slice(0, secondColon).trim()
        const text = rest.slice(secondColon + 1).trim()
        if (!pendingId || !text) return null
        return { pendingId, authorName, text }
      })
      .filter(Boolean)
    if (replies.length > 0) return replies
  }

  // ---- Fallback: JSON parsing ----
  let parsedReplies = extractReplies(parseJson(candidate))

  if (parsedReplies.length === 0) {
    const objStart = candidate.indexOf('{')
    const objEnd = candidate.lastIndexOf('}')
    if (objStart >= 0 && objEnd > objStart) {
      parsedReplies = extractReplies(parseJson(candidate.slice(objStart, objEnd + 1)))
    }
  }

  if (parsedReplies.length === 0) {
    const arrStart = candidate.indexOf('[')
    const arrEnd = candidate.lastIndexOf(']')
    if (arrStart >= 0 && arrEnd > arrStart) {
      const maybeArr = parseJson(candidate.slice(arrStart, arrEnd + 1))
      parsedReplies = Array.isArray(maybeArr) ? maybeArr : []
    }
  }

  return parsedReplies
    .map((item) => {
      const pendingId = String(item?.pendingId || item?.id || item?.commentId || '').trim()
      const authorName = String(item?.authorName || item?.author || item?.name || '').trim()
      const text = String(item?.text || item?.reply || item?.content || '').trim()
      if (!text) return null

      return { pendingId, authorName, text }
    })
    .filter(Boolean)
}

export const generatePhoneMomentsBatchReplies = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      replies: [],
    }
  }

  const rawPending = Array.isArray(params.pendingReplies) ? params.pendingReplies : []
  const pendingReplies = rawPending
    .map((item, index) => ({
      pendingId: String(item?.pendingId || `pending_${index}`).trim(),
      postId: String(item?.postId || '').trim(),
      postContent: String(item?.postContent || '').trim(),
      targetAuthorId: String(item?.targetAuthorId || '').trim(),
      targetAuthorName: String(item?.targetAuthorName || '').trim(),
      userReplyText: String(item?.userReplyText || '').trim(),
    }))
    .filter((item) => item.pendingId && item.userReplyText && (item.targetAuthorId || item.targetAuthorName))

  if (pendingReplies.length === 0) {
    return {
      success: false,
      error: '没有待续聊的评论',
      replies: [],
    }
  }

  const rawContacts = Array.isArray(params.contacts) ? params.contacts : []
  const availableContacts = rawContacts
    .map((item, index) => ({
      id: String(item?.id || `contact_${index}`).trim(),
      name: String(item?.name || '').trim(),
      identity: String(item?.identity || item?.subtitle || '').trim(),
    }))
    .filter((item) => item.id && item.name)

  const pendingById = new Map(pendingReplies.map((item) => [item.pendingId, item]))
  const pendingIdsInOrder = pendingReplies.map((item) => item.pendingId)

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const dialogueHistory = Array.isArray(params.dialogueHistory) ? params.dialogueHistory : []
  const momentsHistory = Array.isArray(params.momentsHistory) ? params.momentsHistory : []

  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const recentDialogue = dialogueHistory
    .slice(-4)
    .map((line) => `${String(line?.speaker || '旁白')}: ${String(line?.text || '').trim()}`)
    .filter(Boolean)
    .join('\n')

  const recentMoments = momentsHistory
    .slice(0, 3)
    .map((post) => {
      const content = String(post?.content || '').trim()
      if (!content) return ''
      const comments = Array.isArray(post?.comments)
        ? post.comments
            .slice(-4)
            .map((comment) => `${String(comment?.authorName || '好友')}: ${String(comment?.text || '').trim()}`)
            .filter(Boolean)
            .join(' | ')
        : ''
      return comments ? `动态: ${content}\n评论: ${comments}` : `动态: ${content}`
    })
    .filter(Boolean)
    .join('\n\n')

  const pendingListText = pendingReplies
    .map((item, index) => [
      `${index + 1}. pendingId=${item.pendingId}`,
      `动态: ${item.postContent || '(无动态文本)'}`,
      `目标角色: ${item.targetAuthorName || item.targetAuthorId || '未知角色'}`,
      `玩家回复: ${item.userReplyText}`,
    ].join('\n'))
    .join('\n\n')

  const contactListText = availableContacts
    .map((item, index) => `${index + 1}. ${item.name}${item.identity ? `（${item.identity}）` : ''}`)
    .join('\n')

  const userPrompt = [
    `【世界书标题】${String(worldBook?.title || '默认世界书').trim()}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    recentDialogue ? `【最近剧情上下文】\n${recentDialogue}` : '',
    recentMoments ? `【最近朋友圈参考】\n${recentMoments}` : '',
    contactListText ? `【可用角色名单】\n${contactListText}` : '',
    `【待续聊列表】\n${pendingListText}`,
    '请为每条待续聊生成一条角色回复，并只返回分隔符格式：|r=待回复ID:角色名:回复|',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:moments_batch_reply'),
    userPrompt,
    temperature: params.options?.temperature ?? 0.9,
    maxTokens: params.options?.maxTokens ?? Math.min(980, 260 + pendingReplies.length * 120),
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '朋友圈续聊生成失败',
      replies: [],
    }
  }

  const parsed = tryParseMomentsBatchReplies(result.data)
  if (parsed.length === 0) {
    return {
      success: false,
      error: '朋友圈续聊解析失败',
      replies: [],
    }
  }

  const unusedPendingIds = [...pendingIdsInOrder]
  const usedPendingIds = new Set()
  const replies = []

  for (const item of parsed) {
    let pendingId = String(item.pendingId || '').trim()
    if (!pendingById.has(pendingId)) {
      const fallbackId = unusedPendingIds.find((id) => !usedPendingIds.has(id))
      pendingId = fallbackId || ''
    }

    if (!pendingId || usedPendingIds.has(pendingId)) continue
    const pending = pendingById.get(pendingId)
    if (!pending) continue

    const replyText = String(item.text || '').trim()
    if (!replyText) continue

    const authorHint = String(item.authorName || '').trim()
    let matchedContact = null

    if (pending.targetAuthorId) {
      matchedContact = availableContacts.find((contact) => contact.id === pending.targetAuthorId) || null
    }

    if (!matchedContact && pending.targetAuthorName) {
      matchedContact = availableContacts.find((contact) => contact.name === pending.targetAuthorName) || null
      if (!matchedContact) {
        matchedContact = availableContacts.find(
          (contact) =>
            contact.name.includes(pending.targetAuthorName) || pending.targetAuthorName.includes(contact.name),
        ) || null
      }
    }

    if (!matchedContact && authorHint) {
      matchedContact = availableContacts.find((contact) => contact.name === authorHint) || null
      if (!matchedContact) {
        matchedContact = availableContacts.find(
          (contact) => contact.name.includes(authorHint) || authorHint.includes(contact.name),
        ) || null
      }
    }

    const authorName = matchedContact?.name || pending.targetAuthorName || authorHint || '好友'
    const authorId = matchedContact?.id || pending.targetAuthorId || ''

    replies.push({
      pendingId,
      authorId,
      authorName,
      text: replyText,
    })
    usedPendingIds.add(pendingId)

    if (replies.length >= pendingReplies.length) break
  }

  if (replies.length === 0) {
    return {
      success: false,
      error: '朋友圈续聊为空',
      replies: [],
    }
  }

  return {
    success: true,
    error: null,
    replies,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const FORUM_SYSTEM_PROMPT = `你是”世界观论坛帖子生成器”。
你的任务是根据世界书设定与最新剧情，生成旁观者视角的论坛帖子。

输出格式（严格遵守）：
- 每个帖子区块用 || 分隔（独占一行）
- 帖子格式：
|post=标题|
|author=发帖人|
|content=正文|
|hot=1|    （可选，热门帖加此行）
|c=回帖人1:回帖内容1|
|c=回帖人2:回帖内容2|

硬性要求：
1) 不要 JSON，不要 markdown，不要解释，只输出上述分隔符格式。
2) 发帖人和回帖人必须是”旁观者/路人/媒体/群众”等，不要直接让主角团当第一发帖人。
3) 内容要贴合世界观与近期剧情推进，语气像真实论坛，避免”作为AI”这类元话术。
4) 标题 12-36 字，正文 40-180 字，每帖 1-4 条回帖。
5) 标签尽量从提供的标签列表中选，作为帖子的第一行：|tag=标签|
6) 帖子时间线必须承接”当前剧情句”和”最近剧情推进”，不要跳回旧进度，不要剧透未发生剧情。
7) 信息不足时可写成”目击/传闻/分析帖”，不要编造主角已确认的内心独白。
8) 生成 4-10 条帖子。`

const tryParseForumPosts = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return []

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  const extractPosts = (value) => {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object' && Array.isArray(value.posts)) return value.posts
    return []
  }

  // ---- Try delimiter-based protocol ----
  // Split by || on its own line
  const blocks = candidate.split(/^\s*\|\|\s*$/m)
  const delimPosts = []

  for (const block of blocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    const fields = {}
    const comments = []

    for (const line of lines) {
      if (line.startsWith('|post=')) {
        fields.title = line.slice(6).replace(/\|$/, '').trim()
      } else if (line.startsWith('|author=')) {
        fields.authorName = line.slice(8).replace(/\|$/, '').trim()
      } else if (line.startsWith('|content=')) {
        fields.content = line.slice(9).replace(/\|$/, '').trim()
      } else if (line.startsWith('|tag=')) {
        fields.tag = line.slice(5).replace(/\|$/, '').trim()
      } else if (line.startsWith('|hot=1') || line === '|hot=1|') {
        fields.isHot = true
      } else if (line.startsWith('|c=')) {
        const inner = line.slice(3).replace(/\|$/, '').trim()
        const colonIdx = inner.indexOf(':')
        if (colonIdx >= 0) {
          const cAuthor = inner.slice(0, colonIdx).trim()
          const cText = inner.slice(colonIdx + 1).trim()
          if (cText) comments.push({ authorName: cAuthor, text: cText })
        }
      }
    }

    if (fields.title && fields.content) {
      delimPosts.push({
        tag: fields.tag || '',
        title: fields.title,
        authorName: fields.authorName || '',
        content: fields.content,
        isHot: !!fields.isHot,
        comments,
      })
    }
  }

  if (delimPosts.length > 0) return delimPosts

  // ---- Fallback: JSON parsing ----
  let parsedPosts = extractPosts(parseJson(candidate))

  if (parsedPosts.length === 0) {
    const objStart = candidate.indexOf('{')
    const objEnd = candidate.lastIndexOf('}')
    if (objStart >= 0 && objEnd > objStart) {
      parsedPosts = extractPosts(parseJson(candidate.slice(objStart, objEnd + 1)))
    }
  }

  if (parsedPosts.length === 0) {
    const arrStart = candidate.indexOf('[')
    const arrEnd = candidate.lastIndexOf(']')
    if (arrStart >= 0 && arrEnd > arrStart) {
      const maybeArr = parseJson(candidate.slice(arrStart, arrEnd + 1))
      parsedPosts = Array.isArray(maybeArr) ? maybeArr : []
    }
  }

  return parsedPosts
    .map((item) => {
      const tag = String(item?.tag || item?.topic || item?.category || '').trim()
      const title = String(item?.title || item?.subject || '').trim()
      const authorName = String(item?.authorName || item?.author || item?.user || '').trim()
      const content = String(item?.content || item?.text || item?.body || '').trim()
      const isHot = Boolean(item?.isHot || item?.hot)

      const comments = Array.isArray(item?.comments)
        ? item.comments
            .map((comment) => {
              const commentAuthor = String(comment?.authorName || comment?.author || '').trim()
              const commentText = String(comment?.text || comment?.content || comment?.reply || '').trim()
              if (!commentText) return null
              return {
                authorName: commentAuthor,
                text: commentText,
              }
            })
            .filter(Boolean)
        : []

      const viewsRaw = Number(item?.views)
      const repliesRaw = Number(item?.replies)
      const likesRaw = Number(item?.likes)

      return {
        tag,
        title,
        authorName,
        content,
        isHot,
        comments,
        views: Number.isFinite(viewsRaw) ? Math.max(0, Math.floor(viewsRaw)) : 0,
        replies: Number.isFinite(repliesRaw) ? Math.max(0, Math.floor(repliesRaw)) : 0,
        likes: Number.isFinite(likesRaw) ? Math.max(0, Math.floor(likesRaw)) : 0,
      }
    })
    .filter((item) => item.title && item.content)
}

export const generatePhoneForumPosts = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      posts: [],
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const dialogueHistory = Array.isArray(params.dialogueHistory) ? params.dialogueHistory : []
  const recentForumPosts = Array.isArray(params.recentForumPosts) ? params.recentForumPosts : []
  const topicSeeds = Array.isArray(params.topicSeeds) ? params.topicSeeds : []
  const observerCandidates = Array.isArray(params.observerCandidates) ? params.observerCandidates : []
  const tags = Array.isArray(params.tags) ? params.tags : []
  const currentLine = params.currentLine && typeof params.currentLine === 'object' ? params.currentLine : null

  const requestedCount = Number(params.postCount)
  const postCount = Number.isFinite(requestedCount)
    ? Math.max(4, Math.min(10, Math.floor(requestedCount)))
    : 6

  const clampPromptText = (value, max = 180) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim()
    if (!text) return ''
    return text.length > max ? `${text.slice(0, max)}...` : text
  }

  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const entriesObject = worldBook?.entries && typeof worldBook.entries === 'object' ? worldBook.entries : {}
  const entryLabels = {
    overview: '世界概述',
    worldbuilding: '世界观细节',
    factions: '势力',
    timeline: '时间线',
    locations: '地点',
    geography: '地理',
    politics: '政治',
    economy: '经济',
    religion: '宗教',
    technology: '科技',
    culture: '文化',
    language: '语言',
    powerSystem: '力量体系',
    conflict: '核心冲突',
    themes: '主题',
    taboo: '禁忌',
  }
  const worldEntriesText = Object.entries(entriesObject)
    .map(([key, value]) => [String(key || '').trim(), clampPromptText(value, 200)])
    .filter(([key, value]) => key && value)
    .slice(0, 10)
    .map(([key, value]) => `${entryLabels[key] || key}: ${value}`)
    .join('\n')

  const charSummary = Array.isArray(worldBook?.characters)
    ? worldBook.characters
        .slice(0, 10)
        .map((char) => {
          const name = String(char?.name || '').trim()
          const identity = String(char?.identity || char?.nickname || '').trim()
          if (!name) return ''
          return identity ? `${name}（${identity}）` : name
        })
        .filter(Boolean)
        .join('、')
    : ''

  const sceneSummary = Array.isArray(worldBook?.scenes)
    ? worldBook.scenes
        .slice(0, 8)
        .map((scene) => {
          const name = String(scene?.name || '').trim()
          const description = String(scene?.description || '').trim()
          if (!name) return ''
          return description ? `${name}（${description}）` : name
        })
        .filter(Boolean)
        .join('；')
    : ''

  const recentDialogue = dialogueHistory
    .slice(-10)
    .map((line) => `${String(line?.speaker || '旁白')}: ${String(line?.text || '').trim()}`)
    .filter(Boolean)
    .join('\n')

  const currentLineText = currentLine?.text
    ? `${String(currentLine?.speaker || '旁白')}: ${String(currentLine.text || '').trim()}`
    : ''
  const currentSceneName = String(
    currentLine?.sceneName || worldBook?.currentSceneName || worldBook?.activeSceneName || '',
  ).trim()

  const forumHistoryText = recentForumPosts
    .slice(0, 4)
    .map((post) => {
      const title = String(post?.title || '').trim()
      const content = String(post?.content || '').trim()
      if (!title || !content) return ''
      return `${title}\n${content.slice(0, 60)}`
    })
    .filter(Boolean)
    .join('\n\n')

  const seedList = topicSeeds
    .map((topic) => String(topic || '').trim())
    .filter(Boolean)
    .slice(0, 20)
  const seedText = seedList.map((topic, index) => `${index + 1}. ${topic}`).join('\n')

  const observerList = observerCandidates
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .slice(0, 20)
  const observerText = observerList.map((name, index) => `${index + 1}. ${name}`).join('\n')

  const tagList = tags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 16)
  const tagText = tagList.map((tag, index) => `${index + 1}. ${tag}`).join('\n')

  const userPrompt = [
    `【目标】生成 ${postCount} 条论坛帖子，服务于“手机-论坛”页面刷新。`,
    `【世界书标题】${String(worldBook?.title || '默认世界书').trim()}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    worldEntriesText ? `【世界书关键条目】\n${worldEntriesText}` : '',
    charSummary ? `【关键角色】${charSummary}` : '',
    sceneSummary ? `【关键场景】${sceneSummary}` : '',
    currentSceneName ? `【当前场景】${currentSceneName}` : '',
    currentLineText ? `【当前剧情句】${currentLineText}` : '',
    recentDialogue ? `【最近剧情推进】\n${recentDialogue}` : '',
    forumHistoryText ? `【历史论坛参考】\n${forumHistoryText}` : '',
    seedText ? `【建议话题种子】\n${seedText}` : '',
    observerText ? `【可用旁观者身份】\n${observerText}` : '',
    tagText ? `【可用标签】\n${tagText}` : '',
    `请严格使用分隔符格式输出，字段为 post/author/content/tag/hot/comments，数量尽量接近 ${postCount}，并确保能体现当前剧情的新增信息。`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:forum'),
    userPrompt,
    temperature: params.options?.temperature ?? 0.92,
    maxTokens: params.options?.maxTokens ?? Math.min(2200, 500 + postCount * 250),
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '论坛帖子生成失败',
      posts: [],
    }
  }

  const parsed = tryParseForumPosts(result.data)
  if (parsed.length === 0) {
    return {
      success: false,
      error: '论坛帖子解析失败',
      posts: [],
    }
  }

  const usedTitles = new Set()
  const posts = []

  for (const item of parsed) {
    const title = String(item.title || '').trim()
    const content = String(item.content || '').trim()
    if (!title || !content || usedTitles.has(title)) continue

    const comments = Array.isArray(item.comments)
      ? item.comments
          .slice(0, 4)
          .map((comment, index) => ({
            authorName: String(comment?.authorName || `匿名回帖者${index + 1}`).trim() || `匿名回帖者${index + 1}`,
            text: String(comment?.text || '').trim(),
          }))
          .filter((comment) => comment.text)
      : []

    const defaultViews = 220 + posts.length * 97 + Math.min(920, content.length * 4)
    const views = item.views > 0 ? item.views : defaultViews
    const replies = item.replies > 0 ? item.replies : Math.max(comments.length + 2, Math.round(views * 0.06))
    const likes = item.likes > 0 ? item.likes : Math.max(6, Math.round(views * 0.12))

    posts.push({
      tag: String(item.tag || tags[posts.length % Math.max(1, tags.length)] || '讨论').trim() || '讨论',
      title,
      authorName: String(item.authorName || `匿名观察者${posts.length + 1}`).trim() || `匿名观察者${posts.length + 1}`,
      content,
      isHot: Boolean(item.isHot) || views >= 980 || replies >= 36,
      comments,
      views,
      replies,
      likes,
    })
    usedTitles.add(title)

    if (posts.length >= postCount) break
  }

  if (posts.length === 0) {
    return {
      success: false,
      error: '论坛帖子为空',
      posts: [],
    }
  }

  return {
    success: true,
    error: null,
    posts,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const NEWS_FEED_SYSTEM_PROMPT = `你是”世界观新闻聚合生成器”。
你的任务是根据世界书和当前剧情，生成”今日X条”新闻流。

输出格式（严格遵守）：
- 每个事件区块用 || 分隔（独占一行）
- 事件格式：
|event=事件主题|
|importance=high|   （high/medium/low）
|v=媒体名|标题|导语|可信度|
|v=媒体名2|标题2|导语2|可信度2|

硬性要求：
1) 不要 JSON，不要 markdown，不要解释，只输出上述分隔符格式。
2) events 数量 4-10 条；每条事件 versions 2-4 条。
3) 每个 version 必须模拟不同媒体写法（官媒、地方小报、财经媒体、自媒体、调查记者等可混合）。
4) 时间线必须承接当前剧情，不要跳回旧进度，不要剧透未来剧情。
5) 可信度明确标记：
   - confirmed: 已确认
   - rumor: 传闻未证实
   - analysis: 评论分析
6) headline 建议 12-34 字，summary 建议 24-120 字；保持像真实新闻客户端文风。`

const tryParseNewsFeedEvents = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return []

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  const extractEvents = (value) => {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object' && Array.isArray(value.events)) return value.events
    return []
  }

  // ---- Try delimiter-based protocol ----
  const blocks = candidate.split(/^\s*\|\|\s*$/m)
  const delimEvents = []

  for (const block of blocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    let topic = ''
    let importance = 'medium'
    const versions = []

    for (const line of lines) {
      if (line.startsWith('|event=')) {
        topic = line.slice(7).replace(/\|$/, '').trim()
      } else if (line.startsWith('|importance=')) {
        importance = line.slice(12).replace(/\|$/, '').trim() || 'medium'
      } else if (line.startsWith('|v=')) {
        const inner = line.slice(3).replace(/\|$/, '').trim()
        const parts = inner.split('|').map(p => p.trim())
        if (parts.length >= 4) {
          versions.push({
            outlet: parts[0],
            headline: parts[1],
            summary: parts[2],
            credibility: parts[3],
          })
        } else if (parts.length >= 3) {
          versions.push({
            outlet: parts[0],
            headline: parts[1],
            summary: parts[2],
            credibility: 'analysis',
          })
        }
      }
    }

    if (topic && versions.length > 0) {
      delimEvents.push({ topic, importance, versions })
    }
  }

  if (delimEvents.length > 0) {
    const normalizeImportance = (value) => {
      const raw = String(value || '').trim().toLowerCase()
      if (raw === 'high' || raw === 'low' || raw === 'medium') return raw
      return 'medium'
    }
    const normalizeCredibility = (value) => {
      const raw = String(value || '').trim().toLowerCase()
      if (raw === 'confirmed' || raw === 'rumor' || raw === 'analysis') return raw
      if (raw === 'verified') return 'confirmed'
      return 'analysis'
    }
    return delimEvents.map(item => ({
      topic: item.topic,
      importance: normalizeImportance(item.importance),
      versions: item.versions.map(v => ({
        outlet: v.outlet,
        style: '',
        headline: v.headline,
        summary: v.summary,
        angle: '',
        credibility: normalizeCredibility(v.credibility),
      })),
    })).filter(item => item.topic && item.versions.length > 0)
  }

  // ---- Fallback: JSON parsing ----
  let parsedEvents = extractEvents(parseJson(candidate))

  if (parsedEvents.length === 0) {
    const objStart = candidate.indexOf('{')
    const objEnd = candidate.lastIndexOf('}')
    if (objStart >= 0 && objEnd > objStart) {
      parsedEvents = extractEvents(parseJson(candidate.slice(objStart, objEnd + 1)))
    }
  }

  if (parsedEvents.length === 0) {
    const arrStart = candidate.indexOf('[')
    const arrEnd = candidate.lastIndexOf(']')
    if (arrStart >= 0 && arrEnd > arrStart) {
      const maybeArr = parseJson(candidate.slice(arrStart, arrEnd + 1))
      parsedEvents = Array.isArray(maybeArr) ? maybeArr : []
    }
  }

  const normalizeImportance = (value) => {
    const rawImportance = String(value || '').trim().toLowerCase()
    if (rawImportance === 'high' || rawImportance === 'low' || rawImportance === 'medium') {
      return rawImportance
    }
    return 'medium'
  }

  const normalizeCredibility = (value) => {
    const rawCredibility = String(value || '').trim().toLowerCase()
    if (rawCredibility === 'confirmed' || rawCredibility === 'rumor' || rawCredibility === 'analysis') {
      return rawCredibility
    }
    if (rawCredibility === 'verified') return 'confirmed'
    return 'analysis'
  }

  return parsedEvents
    .map((item) => {
      const topic = String(item?.topic || item?.event || item?.eventTitle || '').trim()
      const importance = normalizeImportance(item?.importance)

      const versions = Array.isArray(item?.versions)
        ? item.versions
            .map((version) => {
              const outlet = String(version?.outlet || version?.media || version?.source || '').trim()
              const style = String(version?.style || version?.tone || '').trim()
              const headline = String(version?.headline || version?.title || '').trim()
              const summary = String(version?.summary || version?.lead || version?.content || '').trim()
              const angle = String(version?.angle || version?.stance || '').trim()
              const credibility = normalizeCredibility(version?.credibility || version?.status)
              if (!headline || !summary) return null
              return {
                outlet,
                style,
                headline,
                summary,
                angle,
                credibility,
              }
            })
            .filter(Boolean)
        : []

      return {
        topic,
        importance,
        versions,
      }
    })
    .filter((item) => item.topic && Array.isArray(item.versions) && item.versions.length > 0)
}

export const generatePhoneNewsFeed = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      events: [],
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const dialogueHistory = Array.isArray(params.dialogueHistory) ? params.dialogueHistory : []
  const currentLine = params.currentLine && typeof params.currentLine === 'object' ? params.currentLine : null
  const recentNewsEvents = Array.isArray(params.recentNewsEvents) ? params.recentNewsEvents : []
  const topicSeeds = Array.isArray(params.topicSeeds) ? params.topicSeeds : []
  const mediaProfiles = Array.isArray(params.mediaProfiles) ? params.mediaProfiles : []

  const requestedEventCount = Number(params.eventCount)
  const eventCount = Number.isFinite(requestedEventCount)
    ? Math.max(4, Math.min(10, Math.floor(requestedEventCount)))
    : 6
  const requestedVersionsCount = Number(params.versionsPerEvent)
  const versionsPerEvent = Number.isFinite(requestedVersionsCount)
    ? Math.max(2, Math.min(4, Math.floor(requestedVersionsCount)))
    : 3

  const clampPromptText = (value, max = 180) => {
    const text = String(value || '').replace(/\s+/g, ' ').trim()
    if (!text) return ''
    return text.length > max ? `${text.slice(0, max)}...` : text
  }

  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const worldEntries = worldBook?.entries && typeof worldBook.entries === 'object' ? worldBook.entries : {}
  const worldEntryText = Object.entries(worldEntries)
    .map(([key, value]) => {
      const entryKey = String(key || '').trim()
      const entryValue = clampPromptText(value, 180)
      if (!entryKey || !entryValue) return ''
      return `${entryKey}: ${entryValue}`
    })
    .filter(Boolean)
    .slice(0, 10)
    .join('\n')

  const charactersText = Array.isArray(worldBook?.characters)
    ? worldBook.characters
        .slice(0, 10)
        .map((char) => {
          const name = String(char?.name || '').trim()
          const identity = String(char?.identity || char?.nickname || '').trim()
          if (!name) return ''
          return identity ? `${name}（${identity}）` : name
        })
        .filter(Boolean)
        .join('、')
    : ''

  const sceneText = Array.isArray(worldBook?.scenes)
    ? worldBook.scenes
        .slice(0, 8)
        .map((scene) => {
          const name = String(scene?.name || '').trim()
          const description = String(scene?.description || '').trim()
          if (!name) return ''
          return description ? `${name}（${description}）` : name
        })
        .filter(Boolean)
        .join('；')
    : ''

  const recentDialogueText = dialogueHistory
    .slice(-12)
    .map((line) => `${String(line?.speaker || '旁白')}: ${String(line?.text || '').trim()}`)
    .filter(Boolean)
    .join('\n')

  const currentLineText = currentLine?.text
    ? `${String(currentLine?.speaker || '旁白')}: ${String(currentLine.text || '').trim()}`
    : ''
  const currentSceneName = String(
    currentLine?.sceneName || worldBook?.currentSceneName || worldBook?.activeSceneName || '',
  ).trim()

  const recentNewsText = recentNewsEvents
    .slice(0, 4)
    .map((event) => {
      const topic = String(event?.topic || '').trim()
      const firstVersion = Array.isArray(event?.versions) ? event.versions[0] : null
      const headline = String(firstVersion?.headline || '').trim()
      if (!topic && !headline) return ''
      return `${topic || headline} | ${headline || topic}`
    })
    .filter(Boolean)
    .join('\n')

  const topicSeedText = topicSeeds
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n')

  const mediaProfileText = mediaProfiles
    .map((item) => {
      const name = String(item?.name || item?.outlet || '').trim()
      const style = String(item?.style || item?.tone || '').trim()
      if (!name) return ''
      return style ? `${name}: ${style}` : name
    })
    .filter(Boolean)
    .slice(0, 20)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n')

  const userPrompt = [
    `【目标】生成“今日X条”新闻流，事件数 ${eventCount}，每个事件生成 ${versionsPerEvent} 个媒体版本。`,
    `【世界书标题】${String(worldBook?.title || '默认世界书').trim()}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    worldEntryText ? `【世界条目摘要】\n${worldEntryText}` : '',
    charactersText ? `【关键角色】${charactersText}` : '',
    sceneText ? `【关键场景】${sceneText}` : '',
    currentSceneName ? `【当前场景】${currentSceneName}` : '',
    currentLineText ? `【当前剧情句】${currentLineText}` : '',
    recentDialogueText ? `【最近剧情推进】\n${recentDialogueText}` : '',
    recentNewsText ? `【历史新闻参考】\n${recentNewsText}` : '',
    topicSeedText ? `【建议选题】\n${topicSeedText}` : '',
    mediaProfileText ? `【可用媒体风格】\n${mediaProfileText}` : '',
    `请严格使用分隔符格式输出，每个事件都要有 versions，且 versions 数量尽量达到 ${versionsPerEvent}。`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:news_feed'),
    userPrompt,
    temperature: params.options?.temperature ?? 0.9,
    maxTokens: params.options?.maxTokens ?? Math.min(2600, 620 + eventCount * versionsPerEvent * 180),
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '新闻流生成失败',
      events: [],
    }
  }

  const parsed = tryParseNewsFeedEvents(result.data)
  if (parsed.length === 0) {
    return {
      success: false,
      error: '新闻流解析失败',
      events: [],
    }
  }

  const usedTopics = new Set()
  const fallbackMediaNames = mediaProfiles
    .map((item) => String(item?.name || item?.outlet || '').trim())
    .filter(Boolean)
  const events = []

  for (const item of parsed) {
    const topic = String(item.topic || '').trim()
    if (!topic || usedTopics.has(topic)) continue

    const versions = []
    const usedOutlets = new Set()
    for (let index = 0; index < item.versions.length; index += 1) {
      const version = item.versions[index]
      const headline = String(version?.headline || '').trim()
      const summary = String(version?.summary || '').trim()
      if (!headline || !summary) continue
      const outlet = String(version?.outlet || fallbackMediaNames[index] || `媒体${index + 1}`).trim() || `媒体${index + 1}`
      if (usedOutlets.has(outlet)) continue
      versions.push({
        outlet,
        style: String(version?.style || '').trim(),
        headline,
        summary,
        angle: String(version?.angle || '').trim(),
        credibility: String(version?.credibility || 'analysis').trim() || 'analysis',
      })
      usedOutlets.add(outlet)
      if (versions.length >= Math.max(2, versionsPerEvent)) break
    }

    if (versions.length === 0) continue

    events.push({
      topic,
      importance: String(item.importance || 'medium').trim() || 'medium',
      versions,
    })
    usedTopics.add(topic)
    if (events.length >= eventCount) break
  }

  if (events.length === 0) {
    return {
      success: false,
      error: '新闻流为空',
      events: [],
    }
  }

  return {
    success: true,
    error: null,
    events,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const PHONE_MAP_SYSTEM_PROMPT = `你是”剧情地图生成器”。
你的任务是根据世界书与当前剧情，生成可点击的地点地图数据。

输出格式（严格遵守）：
|map=地图标题:当前位置ID|
|loc=地点ID|
|name=地点名称|
|pos=x:y|
|risk=low|    （low/medium/high）
|desc=地点说明|
|tags=标签1,标签2|
|connections=连接ID1,连接ID2|
||
|loc=地点ID2|
...

硬性要求：
1) 不要 JSON，不要 markdown，不要解释，只输出上述分隔符格式。
2) locations 数量建议 4-12。
3) x/y 必须是 0-100 区间数字。
4) risk 仅允许 low/medium/high。
5) 地图时间线必须承接当前剧情；不要剧透未来未发生剧情。
6) connections 中的 ID 必须是其他 loc 的 ID。`

const tryParsePhoneMapData = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  const extractMapData = (value) => {
    if (!value) return null
    if (Array.isArray(value)) {
      return {
        title: '剧情地图',
        currentLocation: '',
        locations: value,
      }
    }

    if (typeof value !== 'object') return null

    if (value.map && typeof value.map === 'object') {
      const mapped = value.map
      if (Array.isArray(mapped.locations) || Array.isArray(mapped.nodes) || Array.isArray(mapped.points)) {
        return mapped
      }
    }

    if (Array.isArray(value.locations) || Array.isArray(value.nodes) || Array.isArray(value.points)) {
      return value
    }

    return null
  }

  // ---- Try delimiter-based protocol ----
  const mapMatch = candidate.match(/\|map=([^|]+)\|/)
  const locBlocks = candidate.split(/\|\|/)

  let mapTitle = '剧情地图'
  let currentLocId = ''

  if (mapMatch) {
    const mapVal = mapMatch[1].trim()
    const parts = mapVal.split(':')
    mapTitle = parts[0]?.trim() || mapTitle
    currentLocId = parts[1]?.trim() || ''
  }

  const delimLocations = []
  const usedIds = new Set()

  for (const block of locBlocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    const fields = {}
    for (const line of lines) {
      if (line.startsWith('|loc=')) {
        fields.id = line.slice(5).replace(/\|$/, '').trim()
      } else if (line.startsWith('|name=')) {
        fields.name = line.slice(6).replace(/\|$/, '').trim()
      } else if (line.startsWith('|pos=')) {
        const posVal = line.slice(5).replace(/\|$/, '').trim()
        const posParts = posVal.split(':')
        fields.x = posParts[0]?.trim()
        fields.y = posParts[1]?.trim()
      } else if (line.startsWith('|risk=')) {
        fields.risk = line.slice(6).replace(/\|$/, '').trim()
      } else if (line.startsWith('|desc=')) {
        fields.desc = line.slice(6).replace(/\|$/, '').trim()
      } else if (line.startsWith('|tags=')) {
        fields.tags = line.slice(6).replace(/\|$/, '').trim()
      } else if (line.startsWith('|connections=')) {
        fields.connections = line.slice(13).replace(/\|$/, '').trim()
      }
    }

    if (fields.id && fields.name) {
      if (!usedIds.has(fields.id)) {
        usedIds.add(fields.id)
        delimLocations.push(fields)
      }
    }
  }

  if (delimLocations.length > 0) {
    const clampPercent = (value, fallback = 50) => {
      const num = Number(value)
      if (!Number.isFinite(num)) return fallback
      const maybePercent = num >= 0 && num <= 1 ? num * 100 : num
      return Math.max(0, Math.min(100, Math.round(maybePercent)))
    }

    const toTagArray = (value) => {
      const text = String(value || '').trim()
      if (!text) return []
      return text
        .split(/[、,，/|]/)
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 6)
    }

    const toConnectionArray = (value) => {
      const text = String(value || '').trim()
      if (!text) return []
      return text
        .split(/[、,，/|]/)
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 12)
    }

    const normalizeRisk = (value) => {
      const rawRisk = String(value || '').trim().toLowerCase()
      if (rawRisk === 'low' || rawRisk === 'safe') return 'low'
      if (rawRisk === 'high' || rawRisk === 'danger' || rawRisk === 'dangerous') return 'high'
      return 'medium'
    }

    const locations = delimLocations.map((item, index) => {
      const xFallback = 16 + (index % 4) * 22
      const yFallback = 20 + Math.floor(index / 4) * 24

      return {
        id: item.id,
        name: item.name,
        x: clampPercent(item.x, xFallback),
        y: clampPercent(item.y, yFallback),
        desc: item.desc || '',
        risk: normalizeRisk(item.risk),
        tags: toTagArray(item.tags),
        connections: toConnectionArray(item.connections),
      }
    }).slice(0, 20)

    let currentLocationId = ''
    let currentLocationName = ''

    if (currentLocId) {
      const byId = locations.find(loc => loc.id === currentLocId)
      if (byId) {
        currentLocationId = byId.id
        currentLocationName = byId.name
      }
    }

    if (!currentLocationId) {
      currentLocationId = locations[0].id
      currentLocationName = locations[0].name
    }

    const locationIdSet = new Set(locations.map(item => item.id))
    const normalizedLocations = locations.map(item => ({
      ...item,
      connections: item.connections.filter(targetId => locationIdSet.has(targetId) && targetId !== item.id),
    }))

    return {
      title: mapTitle,
      currentLocationId,
      currentLocationName,
      locations: normalizedLocations,
    }
  }

  // ---- Fallback: JSON parsing ----
  let parsed = extractMapData(parseJson(candidate))
  if (!parsed) {
    const objStart = candidate.indexOf('{')
    const objEnd = candidate.lastIndexOf('}')
    if (objStart >= 0 && objEnd > objStart) {
      parsed = extractMapData(parseJson(candidate.slice(objStart, objEnd + 1)))
    }
  }

  if (!parsed) return null

  const sourceLocations = Array.isArray(parsed.locations)
    ? parsed.locations
    : (Array.isArray(parsed.nodes) ? parsed.nodes : (Array.isArray(parsed.points) ? parsed.points : []))

  const clampPercent = (value, fallback = 50) => {
    const num = Number(value)
    if (!Number.isFinite(num)) return fallback
    const maybePercent = num >= 0 && num <= 1 ? num * 100 : num
    return Math.max(0, Math.min(100, Math.round(maybePercent)))
  }

  const toTagArray = (value) => {
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 6)
    }

    const text = String(value || '').trim()
    if (!text) return []
    return text
      .split(/[、,，/|]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6)
  }

  const toConnectionArray = (value) => {
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 12)
    }

    const text = String(value || '').trim()
    if (!text) return []
    return text
      .split(/[、,，/|]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12)
  }

  const normalizeRisk = (value) => {
    const rawRisk = String(value || '').trim().toLowerCase()
    if (rawRisk === 'low' || rawRisk === 'safe') return 'low'
    if (rawRisk === 'high' || rawRisk === 'danger' || rawRisk === 'dangerous') return 'high'
    return 'medium'
  }

  const usedIds2 = new Set()
  const locations = sourceLocations
    .map((item, index) => {
      const name = String(item?.name || item?.title || item?.label || '').trim()
      if (!name) return null

      const rawId = String(item?.id || item?.key || '').trim()
      const nameToken = name.replace(/[^\w\u4e00-\u9fa5]+/g, '_').slice(0, 24) || `loc_${index + 1}`
      let id = (rawId || `loc_${nameToken}`).replace(/\s+/g, '_')
      if (!id) id = `loc_${index + 1}`
      if (usedIds2.has(id)) {
        id = `${id}_${index + 1}`
      }
      usedIds2.add(id)

      const xFallback = 16 + (index % 4) * 22
      const yFallback = 20 + Math.floor(index / 4) * 24

      return {
        id,
        name,
        x: clampPercent(item?.x ?? item?.positionX ?? item?.left, xFallback),
        y: clampPercent(item?.y ?? item?.positionY ?? item?.top, yFallback),
        desc: String(item?.desc || item?.description || item?.summary || '').trim(),
        risk: normalizeRisk(item?.risk || item?.danger || item?.threat),
        tags: toTagArray(item?.tags || item?.labels || item?.category),
        connections: toConnectionArray(item?.connections || item?.links || item?.neighbors),
      }
    })
    .filter(Boolean)
    .slice(0, 20)

  if (locations.length === 0) return null

  const title = String(parsed.title || parsed.name || parsed.mapName || '剧情地图').trim() || '剧情地图'
  const rawCurrent = String(
    parsed.currentLocationId ||
    parsed.currentLocation ||
    parsed.currentLocationName ||
    '',
  ).trim()

  let currentLocationId = ''
  let currentLocationName = ''

  if (rawCurrent) {
    const byId = locations.find((loc) => loc.id === rawCurrent)
    if (byId) {
      currentLocationId = byId.id
      currentLocationName = byId.name
    } else {
      const byName = locations.find(
        (loc) =>
          loc.name === rawCurrent ||
          loc.name.includes(rawCurrent) ||
          rawCurrent.includes(loc.name),
      )
      if (byName) {
        currentLocationId = byName.id
        currentLocationName = byName.name
      }
    }
  }

  if (!currentLocationId) {
    currentLocationId = locations[0].id
    currentLocationName = locations[0].name
  }

  const locationIdSet = new Set(locations.map((item) => item.id))
  const normalizedLocations = locations.map((item) => ({
    ...item,
    connections: item.connections.filter((targetId) => locationIdSet.has(targetId) && targetId !== item.id),
  }))

  return {
    title,
    currentLocationId,
    currentLocationName,
    locations: normalizedLocations,
  }
}

export const generatePhoneMapData = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      map: null,
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const dialogueHistory = Array.isArray(params.dialogueHistory) ? params.dialogueHistory : []
  const currentLine = params.currentLine && typeof params.currentLine === 'object' ? params.currentLine : null
  const previousMapData = params.previousMapData && typeof params.previousMapData === 'object' ? params.previousMapData : null

  const requestedCount = Number(params.locationCount)
  const locationCount = Number.isFinite(requestedCount)
    ? Math.max(4, Math.min(12, Math.floor(requestedCount)))
    : 7

  const worldTitle = String(worldBook?.title || '默认世界书').trim()
  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const sceneSummary = Array.isArray(worldBook?.scenes)
    ? worldBook.scenes
      .slice(0, 12)
      .map((scene) => {
        const name = String(scene?.name || '').trim()
        const description = String(scene?.description || '').trim()
        if (!name) return ''
        return description ? `${name}（${description}）` : name
      })
      .filter(Boolean)
      .join('；')
    : ''

  const currentSceneName = String(
    currentLine?.sceneName ||
    currentLine?.scene?.name ||
    (typeof currentLine?.scene === 'string' ? currentLine.scene : '') ||
    worldBook?.currentSceneName ||
    worldBook?.activeSceneName ||
    '',
  ).trim()

  const currentLineText = currentLine?.text
    ? `${String(currentLine?.speaker || '旁白')}: ${String(currentLine.text || '').trim()}`
    : ''

  const recentDialogue = dialogueHistory
    .slice(-12)
    .map((line) => `${String(line?.speaker || '旁白')}: ${String(line?.text || '').trim()}`)
    .filter(Boolean)
    .join('\n')

  const previousMapText = Array.isArray(previousMapData?.locations)
    ? previousMapData.locations
      .slice(0, 10)
      .map((item) => {
        const id = String(item?.id || '').trim()
        const name = String(item?.name || '').trim()
        if (!id || !name) return ''
        return `${id}: ${name}`
      })
      .filter(Boolean)
      .join('\n')
    : ''

  const userPrompt = [
    `【目标】生成“手机-地图”数据，地点数量约 ${locationCount} 个。`,
    `【世界书标题】${worldTitle || '默认世界书'}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    sceneSummary ? `【关键场景参考】${sceneSummary}` : '',
    currentSceneName ? `【当前所在场景】${currentSceneName}` : '',
    currentLineText ? `【当前剧情句】${currentLineText}` : '',
    recentDialogue ? `【最近剧情推进】\n${recentDialogue}` : '',
    previousMapText ? `【已有地图地点ID参考】\n${previousMapText}` : '',
    `请严格使用分隔符格式输出，字段至少包含 map/loc/name/pos/risk/desc/tags/connections。`,
    `locations 中每个地点必须包含 id/name/x/y/desc/risk/tags/connections。`,
    `x 与 y 使用 0-100 区间数字；risk 仅允许 low/medium/high。`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:map'),
    userPrompt,
    temperature: params.options?.temperature ?? 0.84,
    maxTokens: params.options?.maxTokens ?? Math.min(2400, 900 + locationCount * 160),
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '地图生成失败',
      map: null,
    }
  }

  const parsed = tryParsePhoneMapData(result.data)
  if (!parsed || !Array.isArray(parsed.locations) || parsed.locations.length === 0) {
    return {
      success: false,
      error: '地图解析失败',
      map: null,
    }
  }

  return {
    success: true,
    error: null,
    map: parsed,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const REDDIT_SYSTEM_PROMPT = `你是”世界书Reddit帖子生成器”。
你要模拟这个世界书中的普通居民（非CHAR角色）在Reddit上发帖和评论。
内容要像真实用户的生活分享、吐槽、讨论，贴合世界观设定。

输出格式（不要使用JSON）：
- 帖子区块以 [P] 开头，字段格式：
  [P]
  title=帖子标题
  author=作者昵称
  content=正文内容
  flair=讨论|吐槽|分享|求助|攻略
  hot=是
- 评论紧跟在所属帖子下方，格式：
  [C]author=评论作者
  text=评论内容
- 帖子之间用 || 分隔（独占一行）
- 每个帖子配 1-3 条评论
- 热度字段：hot=是 表示热门，否则省略该行
- 帖子正文 30-150 字，评论 8-60 字
- 作者名要像真实网名，不要直接用角色名

硬性要求：
1) 不要用 JSON，不要 markdown，只输出上述格式
2) 内容贴合世界书设定
3) 语气像真实论坛用户，不要出现”作为AI”等话术
4) 生成 3-5 条帖子`

const tryParseRedditPosts = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return []

  // Remove possible code fence
  const fencedMatch = raw.match(/```\w*\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  // Split by || on its own line as post block separator
  const blocks = candidate.split(/^\s*\|\|\s*$/m)
  const posts = []

  for (const block of blocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    // Extract post fields from lines after [P]
    const postLineIdx = lines.findIndex(l => l === '[P]' || l.startsWith('[P]') && l.length <= 2)
    if (postLineIdx < 0) continue

    const fields = {}
    for (let i = postLineIdx + 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('[C]')) break // hit a comment
      const eqIdx = line.indexOf('=')
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim()
        const val = line.slice(eqIdx + 1).trim()
        if (key && val) fields[key] = val
      }
    }

    if (!fields.title || !fields.author || !fields.content) continue

    // Parse comments
    const comments = []
    let inComment = false
    let currentComment = {}
    for (let i = postLineIdx + 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('[C]author=')) {
        if (currentComment.authorName && currentComment.content) {
          comments.push(currentComment)
        }
        currentComment = {
          id: `rc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          authorName: line.slice('[C]author='.length).trim(),
          content: '',
          createdAt: new Date().toISOString(),
        }
        inComment = true
      } else if (line === '[C]' || line.startsWith('[C] ')) {
        inComment = true
      } else if (line.startsWith('text=')) {
        if (!currentComment.id) {
          currentComment = {
            id: `rc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            authorName: '',
            content: '',
            createdAt: new Date().toISOString(),
          }
        }
        currentComment.content = line.slice(5).trim()
        if (currentComment.authorName && currentComment.content) {
          comments.push(currentComment)
          currentComment = {}
          inComment = false
        }
      } else if (inComment && !line.startsWith('title=') && !line.startsWith('author=') && !line.startsWith('flair=') && !line.startsWith('hot=') && !line.startsWith('content=')) {
        // continuation of comment content
        if (currentComment.content) {
          currentComment.content += '\n' + line
        }
      }
    }
    // Flush last comment
    if (currentComment.authorName && currentComment.content) {
      comments.push(currentComment)
    }

    posts.push({
      id: `reddit_post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: fields.title,
      authorName: fields.author,
      content: fields.content,
      flair: ['讨论', '吐槽', '分享', '求助', '攻略'].includes(fields.flair) ? fields.flair : '讨论',
      isHot: fields.hot === '是' || fields.hot === 'yes' || fields.hot === 'hot',
      comments,
      createdAt: new Date().toISOString(),
    })
  }

  return posts.slice(0, 8)
}

export const generateRedditPosts = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      posts: [],
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const postCountRaw = Number(params.postCount)
  const postCount = Number.isFinite(postCountRaw)
    ? Math.max(3, Math.min(6, Math.floor(postCountRaw)))
    : 4

  const worldTitle = String(worldBook?.title || '默认世界书').trim()
  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const worldEntries = worldBook?.entries && typeof worldBook.entries === 'object'
    ? Object.entries(worldBook.entries)
        .filter(([key]) => key !== 'overview')
        .map(([key, value]) => `【${key}】${String(value || '').trim().slice(0, 150)}`)
        .filter(([, v]) => v)
        .slice(0, 8)
        .join('\n')
    : ''

  const userPrompt = [
    `【目标】生成约 ${postCount} 条Reddit风格帖子。`,
    `【世界书标题】${worldTitle}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    worldEntries ? `【世界设定详情】\n${worldEntries}` : '',
    '请严格按照分隔符格式输出，不要用JSON。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:reddit'),
    userPrompt,
    temperature: params.options?.temperature ?? 0.9,
    maxTokens: params.options?.maxTokens ?? Math.min(2000, 400 + postCount * 300),
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Reddit帖子生成失败',
      posts: [],
    }
  }

  const posts = tryParseRedditPosts(result.data)
  if (posts.length === 0) {
    return {
      success: false,
      error: 'Reddit帖子解析失败',
      posts: [],
    }
  }

  return {
    success: true,
    error: null,
    posts,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const REDDIT_REPLY_SYSTEM_PROMPT = `你是”Reddit评论生成器”。
你要模拟世界书中的普通居民在Reddit帖子下发表评论。
评论内容要自然口语化，贴合世界观。

输出格式（不要使用JSON）：
- 每条评论两行：
  [C]author=评论作者
  text=评论内容
- 生成 1-3 条评论
- 评论 8-60 字
- 作者名要像真实网名

硬性要求：
1) 不要用JSON，不要markdown，只输出上述格式
2) 内容贴合世界书设定和帖子内容
3) 不要出现”作为AI”等话术`

const tryParseRedditComments = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return []

  const fencedMatch = raw.match(/```\w*\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const comments = []
  let currentComment = {}

  for (const line of candidate.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (line.startsWith('[C]author=')) {
      // flush previous
      if (currentComment.authorName && currentComment.content) {
        comments.push(currentComment)
      }
      currentComment = {
        id: `rr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        authorName: line.slice('[C]author='.length).trim(),
        content: '',
        createdAt: new Date().toISOString(),
      }
    } else if (line.startsWith('text=')) {
      currentComment.content = line.slice(5).trim()
      if (currentComment.authorName && currentComment.content) {
        comments.push(currentComment)
        currentComment = {}
      }
    }
  }
  // flush last
  if (currentComment.authorName && currentComment.content) {
    comments.push(currentComment)
  }

  return comments.slice(0, 3)
}

export const generateRedditCommentReplies = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      comments: [],
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const postTitle = String(params.postTitle || '').trim()
  const postContent = String(params.postContent || '').trim()
  const userComment = String(params.userComment || '').trim()

  if (!postContent) {
    return {
      success: false,
      error: '帖子内容为空',
      comments: [],
    }
  }

  const worldTitle = String(worldBook?.title || '默认世界书').trim()
  const worldSummary = String(worldBook?.summary || '').trim()

  const userPrompt = [
    `【世界书标题】${worldTitle}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    `【帖子标题】${postTitle}`,
    `【帖子正文】${postContent}`,
    userComment ? `【玩家评论】${userComment}` : '',
    userComment ? '请生成NPC对玩家评论的回复' : '请生成NPC对这篇帖子的评论',
    '请按格式输出评论行（不要JSON）。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:reddit_reply'),
    userPrompt,
    temperature: params.options?.temperature ?? 0.9,
    maxTokens: params.options?.maxTokens ?? 500,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Reddit评论生成失败',
      comments: [],
    }
  }

  const comments = tryParseRedditComments(result.data)
  if (comments.length === 0) {
    return {
      success: false,
      error: 'Reddit评论解析失败',
      comments: [],
    }
  }

  return {
    success: true,
    error: null,
    comments,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const PHONE_SHOP_SYSTEM_PROMPT = `你是”点购网商品生成器”。
你要根据世界书、当前剧情和用户搜索词，生成可购买的商品列表。

输出格式（严格遵守）：
|item=商品名|
|desc=商品描述|
|tags=标签1,标签2|
|price=39.90|
||
|item=商品名2|
...

硬性要求：
1) 不要 JSON，不要 markdown，不要解释，只输出上述分隔符格式。
2) items 数量 4-12 条。
3) 每个商品必须包含 item(名)/desc(描述)/price(价格) 字段；tags 可为空但必须有此行。
4) price 必须是数字或价格格式（例如 12.5 / 29.90 / ¥49）。
5) 商品需要贴合当前世界观和剧情推进，不要脱离设定。`

const tryParsePhoneShopItems = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return []

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  const extractItems = (value) => {
    if (Array.isArray(value)) return value
    if (!value || typeof value !== 'object') return []
    if (Array.isArray(value.items)) return value.items
    if (Array.isArray(value.products)) return value.products
    if (Array.isArray(value.list)) return value.list
    return []
  }

  const toTagArray = (value) => {
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 6)
    }

    const text = String(value || '').trim()
    if (!text) return []
    return text
      .split(/[、,，/|]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6)
  }

  // ---- Try delimiter-based protocol ----
  const itemBlocks = candidate.split(/^\s*\|\|\s*$/m)
  const delimItems = []

  for (const block of itemBlocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    const fields = {}
    for (const line of lines) {
      if (line.startsWith('|item=')) {
        fields.name = line.slice(6).replace(/\|$/, '').trim()
      } else if (line.startsWith('|desc=')) {
        fields.description = line.slice(6).replace(/\|$/, '').trim()
      } else if (line.startsWith('|tags=')) {
        fields.tags = line.slice(6).replace(/\|$/, '').trim()
      } else if (line.startsWith('|price=')) {
        fields.price = line.slice(7).replace(/\|$/, '').trim()
      }
    }

    if (fields.name && fields.price) {
      delimItems.push(fields)
    }
  }

  if (delimItems.length > 0) {
    return delimItems.map((item, index) => {
      return {
        id: String(`shop_item_${Date.now()}_${index}`).trim(),
        name: item.name,
        description: item.description || '',
        tags: toTagArray(item.tags),
        price: item.price,
      }
    }).filter(Boolean).slice(0, 20)
  }

  // ---- Fallback: JSON parsing ----
  let parsedItems = extractItems(parseJson(candidate))
  if (parsedItems.length === 0) {
    const objStart = candidate.indexOf('{')
    const objEnd = candidate.lastIndexOf('}')
    if (objStart >= 0 && objEnd > objStart) {
      parsedItems = extractItems(parseJson(candidate.slice(objStart, objEnd + 1)))
    }
  }

  if (parsedItems.length === 0) {
    const arrStart = candidate.indexOf('[')
    const arrEnd = candidate.lastIndexOf(']')
    if (arrStart >= 0 && arrEnd > arrStart) {
      const maybeArr = parseJson(candidate.slice(arrStart, arrEnd + 1))
      parsedItems = Array.isArray(maybeArr) ? maybeArr : []
    }
  }

  return parsedItems
    .map((item, index) => {
      const name = String(
        item?.name ||
        item?.title ||
        item?.productName ||
        '',
      ).trim()
      if (!name) return null

      const description = String(
        item?.description ||
        item?.summary ||
        item?.detail ||
        item?.content ||
        '',
      ).trim()
      const tags = toTagArray(item?.tags || item?.labels || item?.category)
      const price = String(item?.price ?? item?.amount ?? item?.cost ?? '').trim()
      if (!price) return null

      return {
        id: String(item?.id || `shop_item_${Date.now()}_${index}`).trim() || `shop_item_${Date.now()}_${index}`,
        name,
        description,
        tags,
        price,
      }
    })
    .filter(Boolean)
    .slice(0, 20)
}

export const generatePhoneShopItems = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      items: [],
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const dialogueHistory = Array.isArray(params.dialogueHistory) ? params.dialogueHistory : []
  const currentLine = params.currentLine && typeof params.currentLine === 'object' ? params.currentLine : null
  const query = String(params.query || '').trim()
  const tags = Array.isArray(params.tags)
    ? params.tags.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
    : []
  const recentOrders = Array.isArray(params.recentOrders) ? params.recentOrders : []
  const resultCountRaw = Number(params.resultCount)
  const resultCount = Number.isFinite(resultCountRaw)
    ? Math.max(4, Math.min(12, Math.floor(resultCountRaw)))
    : 8

  const worldTitle = String(worldBook?.title || '默认世界书').trim()
  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const currentLineText = currentLine?.text
    ? `${String(currentLine?.speaker || '旁白')}: ${String(currentLine.text || '').trim()}`
    : ''

  const recentDialogueText = dialogueHistory
    .slice(-10)
    .map((line) => `${String(line?.speaker || '旁白')}: ${String(line?.text || '').trim()}`)
    .filter(Boolean)
    .join('\n')

  const recentOrderText = recentOrders
    .slice(0, 8)
    .map((order) => {
      const name = String(order?.name || '').trim()
      const price = String(order?.price || '').trim()
      if (!name) return ''
      return price ? `${name}（${price}）` : name
    })
    .filter(Boolean)
    .join('、')

  const userPrompt = [
    `【任务】请生成点购网商品搜索结果，共 ${resultCount} 条左右。`,
    `【世界书标题】${worldTitle || '默认世界书'}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    query ? `【搜索关键词】${query}` : '',
    tags.length > 0 ? `【筛选标签】${tags.join('、')}` : '',
    currentLineText ? `【当前剧情句】${currentLineText}` : '',
    recentDialogueText ? `【最近剧情】\n${recentDialogueText}` : '',
    recentOrderText ? `【近期购买偏好】${recentOrderText}` : '',
    '请使用分隔符格式输出，每条包含 item/desc/tags/price 字段。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:shop_items'),
    userPrompt,
    temperature: params.options?.temperature ?? 0.85,
    maxTokens: params.options?.maxTokens ?? Math.min(3000, 700 + resultCount * 170),
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '点购网商品生成失败',
      items: [],
    }
  }

  const items = tryParsePhoneShopItems(result.data)
  if (items.length === 0) {
    return {
      success: false,
      error: '商品解析失败',
      items: [],
    }
  }

  return {
    success: true,
    error: null,
    items,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

// 世界书商店商品生成
const DORM_SHOP_SYSTEM_PROMPT = `你是"世界书商店商品生成器"。
你要根据世界书的背景设定，生成符合世界观的可购买的商品列表。

输出格式（严格遵守）：
|item=商品名|
|desc=商品描述|
|cat=分类|      （misc/gift/clothes/plant/food/decoration）
|price=50|       （整数，范围 10-200）
|icon=图标emoji|
||
|item=商品名2|
...

硬性要求：
1) 不要 JSON，不要 markdown，不要解释，只输出上述分隔符格式。
2) items 数量 6 条。
3) 每个商品必须包含 item/desc/cat/price/icon 字段。
4) price 必须是整数，范围 10-200。
5) icon 必须是相关的 emoji 图标。
6) category 必须是以下之一：misc(杂物)、gift(礼品)、clothes(衣服)、plant(花草)、food(食物)、decoration(装饰)。
7) 商品需要贴合世界书的世界观和背景设定，不要脱离设定。
8) 商品描述要简洁但有吸引力，符合世界书的风格。`

const tryParseDormShopItems = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return []

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  const extractItems = (value) => {
    if (Array.isArray(value)) return value
    if (!value || typeof value !== 'object') return []
    if (Array.isArray(value.items)) return value.items
    if (Array.isArray(value.products)) return value.products
    if (Array.isArray(value.list)) return value.list
    return []
  }

  const validCategories = ['misc', 'gift', 'clothes', 'plant', 'food', 'decoration']
  const defaultIcons = { misc: '📦', gift: '🎁', clothes: '👔', plant: '🌿', food: '🍔', decoration: '✨' }

  // ---- Try delimiter-based protocol ----
  const itemBlocks = candidate.split(/^\s*\|\|\s*$/m)
  const delimItems = []

  for (const block of itemBlocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    const fields = {}
    for (const line of lines) {
      if (line.startsWith('|item=')) {
        fields.name = line.slice(6).replace(/\|$/, '').trim()
      } else if (line.startsWith('|desc=')) {
        fields.description = line.slice(6).replace(/\|$/, '').trim()
      } else if (line.startsWith('|cat=')) {
        fields.category = line.slice(5).replace(/\|$/, '').trim()
      } else if (line.startsWith('|price=')) {
        fields.price = line.slice(7).replace(/\|$/, '').trim()
      } else if (line.startsWith('|icon=')) {
        fields.icon = line.slice(6).replace(/\|$/, '').trim()
      }
    }

    if (fields.name) {
      delimItems.push(fields)
    }
  }

  if (delimItems.length > 0) {
    return delimItems.map((item, index) => {
      const name = item.name
      if (!name) return null

      const description = item.description || ''
      let category = String(item.category || 'misc').trim().toLowerCase()
      if (!validCategories.includes(category)) category = 'misc'

      const priceRaw = Number(item.price ?? 50)
      const price = Math.max(10, Math.min(200, Math.floor(priceRaw) || 50))

      const icon = String(item.icon || defaultIcons[category] || '📦').trim()

      return {
        id: `dorm_shop_${Date.now()}_${index}`,
        name,
        description,
        category,
        price,
        icon,
      }
    }).filter(Boolean).slice(0, 12)
  }

  // ---- Fallback: JSON parsing ----
  let parsedItems = extractItems(parseJson(candidate))
  if (parsedItems.length === 0) {
    const objStart = candidate.indexOf('{')
    const objEnd = candidate.lastIndexOf('}')
    if (objStart >= 0 && objEnd > objStart) {
      parsedItems = extractItems(parseJson(candidate.slice(objStart, objEnd + 1)))
    }
  }

  if (parsedItems.length === 0) {
    const arrStart = candidate.indexOf('[')
    const arrEnd = candidate.lastIndexOf(']')
    if (arrStart >= 0 && arrEnd > arrStart) {
      const maybeArr = parseJson(candidate.slice(arrStart, arrEnd + 1))
      parsedItems = Array.isArray(maybeArr) ? maybeArr : []
    }
  }

  return parsedItems
    .map((item, index) => {
      const name = String(item?.name || item?.title || '').trim()
      if (!name) return null

      const description = String(item?.description || item?.summary || item?.detail || '').trim()
      let category = String(item?.category || 'misc').trim().toLowerCase()
      if (!validCategories.includes(category)) category = 'misc'

      const priceRaw = Number(item?.price ?? item?.amount ?? item?.cost ?? 50)
      const price = Math.max(10, Math.min(200, Math.floor(priceRaw) || 50))

      const icon = String(item?.icon || defaultIcons[category] || '📦').trim()

      return {
        id: `dorm_shop_${Date.now()}_${index}`,
        name,
        description,
        category,
        price,
        icon,
      }
    })
    .filter(Boolean)
    .slice(0, 12)
}

/**
 * 生成世界书商店商品
 * @param {Object} params
 * @param {Object} params.worldBook - 世界书对象
 * @param {number} [params.resultCount=6] - 生成商品数量
 * @returns {Promise<{success: boolean, error: string|null, items: Array}>}
 */
export const generateDormShopItems = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      items: [],
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const resultCountRaw = Number(params.resultCount)
  const resultCount = Number.isFinite(resultCountRaw)
    ? Math.max(4, Math.min(12, Math.floor(resultCountRaw)))
    : 6

  const worldTitle = String(worldBook?.title || '默认世界书').trim()
  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const worldEntries = worldBook?.entries && typeof worldBook.entries === 'object'
    ? Object.entries(worldBook.entries)
        .filter(([key]) => key !== 'overview')
        .map(([key, value]) => `【${key}】${String(value || '').trim()}`)
        .filter(Boolean)
        .join('\n')
    : ''

  const userPrompt = [
    `【任务】请生成世界书商店商品，共 ${resultCount} 条左右。`,
    `【世界书标题】${worldTitle || '默认世界书'}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    worldEntries ? `【世界设定详情】\n${worldEntries}` : '',
    '请使用分隔符格式输出，每条包含 item/desc/cat/price/icon 字段。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:dorm_shop'),
    userPrompt,
    temperature: params.options?.temperature ?? 0.85,
    maxTokens: params.options?.maxTokens ?? Math.min(2500, 500 + resultCount * 150),
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '世界书商店商品生成失败',
      items: [],
    }
  }

  const items = tryParseDormShopItems(result.data)
  if (items.length === 0) {
    return {
      success: false,
      error: '商品解析失败',
      items: [],
    }
  }

  return {
    success: true,
    error: null,
    items,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const TASK_BOARD_SYSTEM_PROMPT = `你是"世界书任务板生成器"。
你的任务是根据世界书的背景设定，生成符合世界观的任务列表。

输出格式（严格遵守）：
|task=任务名|
|desc=任务描述|
|type=explore|      （explore/collect/social/combat/daily）
|diff=3|            （1-5 整数）
|reward=coins:50|   （coins/crystals/item:数量）
||
|task=任务名2|
...

硬性要求：
1) 不要 JSON，不要 markdown，不要解释，只输出上述分隔符格式。
2) tasks 数量 5 条。
3) type 必须是以下之一：explore(探索)、collect(收集)、social(社交)、combat(战斗)、daily(日常)。
4) difficulty 必须是 1-5 的整数。
5) rewardType 必须是以下之一：coins(金币)、crystals(晶石)、item(物品)。
6) rewardAmount: coins 范围 20-200，crystals 范围 1-5，item 时为 1。
7) 任务描述要具体可执行，包含目标、地点、涉及角色或物品等细节。
8) 任务要贴合世界书的世界观和背景设定。`

const tryParseTaskBoardTasks = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return []

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  const extractTasks = (value) => {
    if (Array.isArray(value)) return value
    if (!value || typeof value !== 'object') return []
    if (Array.isArray(value.tasks)) return value.tasks
    if (Array.isArray(value.missions)) return value.missions
    if (Array.isArray(value.quests)) return value.quests
    return []
  }

  const validTypes = ['explore', 'collect', 'social', 'combat', 'daily']
  const validRewardTypes = ['coins', 'crystals', 'item']

  // ---- Try delimiter-based protocol ----
  const taskBlocks = candidate.split(/^\s*\|\|\s*$/m)
  const delimTasks = []

  for (const block of taskBlocks) {
    const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    const fields = {}
    for (const line of lines) {
      if (line.startsWith('|task=')) {
        fields.name = line.slice(6).replace(/\|$/, '').trim()
      } else if (line.startsWith('|desc=')) {
        fields.description = line.slice(6).replace(/\|$/, '').trim()
      } else if (line.startsWith('|type=')) {
        fields.type = line.slice(6).replace(/\|$/, '').trim()
      } else if (line.startsWith('|diff=')) {
        fields.difficulty = line.slice(6).replace(/\|$/, '').trim()
      } else if (line.startsWith('|reward=')) {
        const rewardVal = line.slice(9).replace(/\|$/, '').trim()
        const colonIdx = rewardVal.indexOf(':')
        if (colonIdx >= 0) {
          fields.rewardType = rewardVal.slice(0, colonIdx).trim()
          fields.rewardAmount = rewardVal.slice(colonIdx + 1).trim()
        }
      }
    }

    if (fields.name) {
      delimTasks.push(fields)
    }
  }

  if (delimTasks.length > 0) {
    return delimTasks
      .filter((t) => t.name)
      .map((t) => ({
        name: String(t.name || '').trim().slice(0, 50),
        description: String(t.description || '').trim().slice(0, 500),
        type: validTypes.includes(t.type) ? t.type : 'daily',
        difficulty: Math.max(1, Math.min(5, Number(t.difficulty) || 1)),
        rewardType: validRewardTypes.includes(t.rewardType) ? t.rewardType : 'coins',
        rewardAmount: Math.max(1, Math.min(200, Number(t.rewardAmount) || 20)),
      }))
  }

  // ---- Fallback: JSON parsing ----
  let parsedTasks = extractTasks(parseJson(candidate))
  if (parsedTasks.length === 0) {
    const objStart = candidate.indexOf('{')
    const objEnd = candidate.lastIndexOf('}')
    if (objStart >= 0 && objEnd > objStart) {
      parsedTasks = extractTasks(parseJson(candidate.slice(objStart, objEnd + 1)))
    }
  }

  if (parsedTasks.length === 0) {
    const arrStart = candidate.indexOf('[')
    const arrEnd = candidate.lastIndexOf(']')
    if (arrStart >= 0 && arrEnd > arrStart) {
      const maybeArr = parseJson(candidate.slice(arrStart, arrEnd + 1))
      if (maybeArr) parsedTasks = extractTasks(maybeArr)
    }
  }

  if (!Array.isArray(parsedTasks)) return []

  return parsedTasks
    .filter((t) => t && typeof t === 'object' && t.name && t.description && t.type)
    .map((t) => ({
      name: String(t.name || '').trim().slice(0, 50),
      description: String(t.description || '').trim().slice(0, 500),
      type: validTypes.includes(t.type) ? t.type : 'daily',
      difficulty: Math.max(1, Math.min(5, Number(t.difficulty) || 1)),
      rewardType: validRewardTypes.includes(t.rewardType) ? t.rewardType : 'coins',
      rewardAmount: Math.max(1, Math.min(200, Number(t.rewardAmount) || 20)),
    }))
}

/**
 * 调用LLM生成任务板任务
 * @param {Object} params
 * @param {Object} params.worldBook - 世界书对象
 * @param {number} params.count - 任务数量，默认 5
 * @returns {Promise<{success: boolean, error: string|null, tasks: Array}>}
 */
export const generateTaskBoardTasks = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      tasks: [],
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const count = Math.max(3, Math.min(10, Number(params.count) || 5))

  const worldTitle = String(worldBook?.title || '默认世界书').trim()
  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const worldEntries = worldBook?.entries && typeof worldBook.entries === 'object'
    ? Object.entries(worldBook.entries)
        .filter(([key]) => key !== 'overview')
        .map(([key, value]) => `【${key}】${String(value || '').trim()}`)
        .filter(Boolean)
        .join('\n')
    : ''

  const userPrompt = [
    `【任务】请生成 ${count} 条任务板任务。`,
    `【世界书标题】${worldTitle || '默认世界书'}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    worldEntries ? `【世界设定详情】\n${worldEntries}` : '',
    '请使用分隔符格式输出，每条包含 task/desc/type/diff/reward 字段。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:task_board'),
    userPrompt,
    temperature: 0.9,
    maxTokens: 1500,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '任务生成失败',
      tasks: [],
    }
  }

  const tasks = tryParseTaskBoardTasks(result.data)
  if (tasks.length === 0) {
    return {
      success: false,
      error: '任务解析失败',
      tasks: [],
    }
  }

  return {
    success: true,
    error: null,
    tasks,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const DORM_ITEM_GIFT_SYSTEM_PROMPT = `你是"寝室物品赠送剧情生成器"。
你的任务是根据物品信息、角色信息和当前关系，生成"角色收到礼物后的对话回复和剧情反馈"。

输出格式（严格遵守）：
|reply=对话回复|
|journal=日记剧情记录|
|mood=心情:好感度变化|

硬性要求：
1) 不要 JSON，不要 markdown，不要解释，只输出上述分隔符格式。
2) 字段约束：
- reply: 必填，中文 10-80 字，角色收到礼物后的直接对话回复，口语化、自然。
- journal: 必填，中文 20-100 字，描述整个送礼过程的剧情记录，用于写入角色日记。
- mood: 必填，中文 2-8 字的心情，后接冒号分隔的好感度变化整数，范围 3-15。
  例如：|mood=开心:8|
3) 回复必须符合角色性格和世界观设定，不要跳戏。
4) 不要写"作为AI""我无法"等元话术。`

const tryParseDormItemGiftReply = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  // ---- Try delimiter-based protocol ----
  const replyMatch = candidate.match(/\|reply=([^|]+)\|/)
  const journalMatch = candidate.match(/\|journal=([^|]+)\|/)
  const moodMatch = candidate.match(/\|mood=([^|]+)\|/)

  if (replyMatch && journalMatch) {
    const replyText = replyMatch[1].trim()
    const journalText = journalMatch[1].trim()
    if (replyText && journalText) {
      let mood = '开心'
      let affectionDelta = 5

      if (moodMatch) {
        const moodVal = moodMatch[1].trim()
        const colonIdx = moodVal.lastIndexOf(':')
        if (colonIdx >= 0) {
          mood = moodVal.slice(0, colonIdx).trim() || '开心'
          const delta = Number.parseInt(moodVal.slice(colonIdx + 1).trim(), 10)
          if (Number.isFinite(delta)) affectionDelta = Math.max(3, Math.min(15, delta))
        } else {
          mood = moodVal || '开心'
        }
      }

      return { replyText, journalText, mood, affectionDelta }
    }
  }

  // ---- Fallback: JSON parsing ----
  let parsed = parseJson(candidate)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      parsed = parseJson(candidate.slice(start, end + 1))
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

  const replyText = String(
    parsed?.replyText ||
    parsed?.reply ||
    parsed?.text ||
    '',
  ).trim()

  const journalText = String(
    parsed?.journalText ||
    parsed?.journal ||
    parsed?.diary ||
    parsed?.story ||
    '',
  ).trim()

  if (!replyText || !journalText) return null

  const mood = String(parsed?.mood || parsed?.emotion || '开心').trim() || '开心'

  const normalizeInt = (value, fallback = 0, min = 3, max = 15) => {
    const parsedInt = Number.parseInt(String(value), 10)
    if (!Number.isFinite(parsedInt)) return fallback
    return Math.max(min, Math.min(max, parsedInt))
  }

  const affectionDelta = normalizeInt(parsed?.affectionDelta ?? parsed?.delta ?? parsed?.affection, 5, 3, 15)

  return {
    replyText,
    journalText,
    mood,
    affectionDelta,
  }
}

/**
 * 生成寝室物品赠送后的剧情回复
 * @param {Object} params
 * @param {Object} params.worldBook - 世界书对象
 * @param {Object} params.character - 角色对象
 * @param {Object} params.item - 物品对象
 * @param {number} params.currentAffection - 当前好感度
 * @param {string} params.relationshipStage - 当前关系阶段
 * @returns {Promise<{success: boolean, error: string|null, reply: Object|null}>}
 */
export const generateDormItemGiftReply = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      reply: null,
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const character = params.character && typeof params.character === 'object' ? params.character : null
  const item = params.item && typeof params.item === 'object' ? params.item : null

  const characterName = String(character?.name || character?.label || '角色').trim()
  const itemName = String(item?.name || '').trim()

  if (!characterName || !itemName) {
    return {
      success: false,
      error: '参数不完整：需要角色和物品信息',
      reply: null,
    }
  }

  const itemDescription = String(item?.description || item?.detail || '').trim()
  const itemCategory = String(item?.category || item?.categoryLabel || item?.type || '').trim()
  const itemIcon = String(item?.icon || '').trim()
  const currentAffection = Math.max(0, Math.min(100, Number(params.currentAffection) || 0))
  const relationshipStage = String(params.relationshipStage || '').trim()

  const characterIdentity = String(character?.identity || character?.subtitle || character?.background || '').trim()
  const characterTags = Array.isArray(character?.tags)
    ? character.tags
        .map((tag) => String(tag || '').trim())
        .filter(Boolean)
        .slice(0, 8)
    : []

  const worldTitle = String(worldBook?.title || '默认世界书').trim()
  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()

  const recentChat = Array.isArray(params.recentChat)
    ? params.recentChat
        .map((msg) => `${msg?.role === 'assistant' ? characterName : '玩家'}: ${String(msg?.text || msg?.content || '').trim()}`)
        .filter(Boolean)
        .join('\n')
    : ''

  const userPrompt = [
    `【任务】玩家把背包里的物品送给了寝室角色，请生成角色收到礼物后的回复和剧情。`,
    `【世界书标题】${worldTitle}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    `【角色名】${characterName}`,
    characterIdentity ? `【角色身份】${characterIdentity}` : '',
    characterTags.length > 0 ? `【角色标签】${characterTags.join('、')}` : '',
    relationshipStage ? `【关系阶段】${relationshipStage}` : '',
    `【当前好感度】${currentAffection}/100`,
    `【物品名】${itemIcon ? itemIcon + ' ' : ''}${itemName}`,
    itemCategory ? `【物品分类】${itemCategory}` : '',
    itemDescription ? `【物品说明】${itemDescription}` : '',
    recentChat ? `【最近聊天】\n${recentChat}` : '',
    '请结合最近聊天内容和角色性格，生成自然的回复。',
    '请使用分隔符格式返回，包含 reply/journal/mood 字段。',
    'replyText 应该是角色收到礼物后说的第一句话，要自然、符合性格。',
    'journalText 应该描述整个送礼过程的剧情，用"你"和角色名来叙述。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:dorm_gift'),
    userPrompt,
    temperature: params.options?.temperature ?? 0.82,
    maxTokens: params.options?.maxTokens ?? 600,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '物品赠送剧情生成失败',
      reply: null,
    }
  }

  const parsed = tryParseDormItemGiftReply(result.data)
  if (!parsed) {
    return {
      success: false,
      error: '物品赠送剧情解析失败',
      reply: null,
    }
  }

  return {
    success: true,
    error: null,
    reply: parsed,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

/**
 * 生成角色来访内容（约定触发 / 随机来访）
 * 角色来到玩家寝室发现人不在，会留下一些内容
 * @param {Object} params - 参数
 * @param {Object} params.worldBook - 世界书信息
 * @param {Object} params.character - 角色信息 {name, identity, subtitle, background, tags}
 * @param {number} params.currentAffection - 当前好感度 (0-100)
 * @param {string} params.relationshipStage - 关系阶段标签
 * @param {Array} params.recentChat - 最近聊天记录 [{role, text}]
 * @param {string} params.visitReason - 来访原因 'appointment' | 'random'
 * @param {string} params.triggerTime - 触发时间（人类可读）
 * @param {Object} params.options - 额外选项
 * @returns {Promise<Object>} 生成的来访内容
 */
export const generateCharacterVisit = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      visit: null,
    }
  }

  const character = params.character && typeof params.character === 'object' ? params.character : {}
  const charName = String(character.name || character.label || '角色').trim()
  const charIdentity = String(character.identity || '').trim()
  const charSubtitle = String(character.subtitle || '').trim()
  const charBackground = String(character.background || '').trim()
  const charTags = Array.isArray(character.tags) ? character.tags : []

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const worldTitle = String(worldBook?.title || '默认世界书').trim()
  const worldSummary = String(worldBook?.summary || '').trim()
  const worldOverview = String(worldBook?.entries?.overview || '').trim()

  const currentAffection = Number(params.currentAffection) || 0
  const relationshipStage = String(params.relationshipStage || '陌生').trim()

  const recentChat = Array.isArray(params.recentChat) ? params.recentChat : []
  const recentChatText = recentChat
    .slice(-8)
    .map((msg) => {
      const roleText = msg.role === 'user' ? '你' : charName
      return `${roleText}：${String(msg.text || '').trim()}`
    })
    .join('\n')

  const visitReason = String(params.visitReason || 'random').trim()
  const reasonText = visitReason === 'appointment' ? '约定来访（之前约定好了在这个时间来）' : '随机来访（临时起意来看看）'
  const triggerTime = String(params.triggerTime || '现在').trim()

  const temperature = params.options?.temperature || 0.85
  const maxTokens = params.options?.maxTokens || 600
  const extraParams = params.options?.extraParams

  const baseSystemPrompt = await resolvePrompt('phone:character_visit')
  const systemPrompt = baseSystemPrompt.replace(/\{\{charName\}\}/g, charName)

  const userPromptSections = []
  userPromptSections.push(`【世界书标题】${worldTitle}`)
  if (worldSummary) userPromptSections.push(`【世界背景】${worldSummary}`)
  if (worldOverview) userPromptSections.push(`【世界概述】${worldOverview}`)
  userPromptSections.push(`【角色名】${charName}`)
  if (charSubtitle) userPromptSections.push(`【角色副标题】${charSubtitle}`)
  if (charIdentity) userPromptSections.push(`【角色身份】${charIdentity}`)
  if (charBackground) userPromptSections.push(`【角色背景】${charBackground}`)
  if (charTags.length > 0) userPromptSections.push(`【角色标签】${charTags.join('、')}`)
  userPromptSections.push(`【当前好感度】${currentAffection} / 100`)
  userPromptSections.push(`【关系阶段】${relationshipStage}`)
  if (recentChatText) userPromptSections.push(`【最近聊天】\n${recentChatText}`)
  userPromptSections.push(`【来访原因】${reasonText}`)
  userPromptSections.push(`【触发时间】${triggerTime}`)
  userPromptSections.push(`
请使用分隔符格式返回。
格式：|visit=类型|
      |content=正文|
      |mood=心情|
根据来访类型可额外加上 |redpacket=...| 或 |gift=...|。`)

  const userPrompt = userPromptSections.join('\n\n')

  try {
    const result = await callChatCompletion({
      config: validated.config,
      systemPrompt,
      userPrompt,
      temperature,
      maxTokens,
      extraParams,
    })

    const parsed = tryParseCharacterVisit(result.data)
    if (!parsed) {
      return {
        success: false,
        error: '来访内容解析失败',
        visit: null,
        data: result.data,
        rawResponse: result.rawResponse,
      }
    }

    return {
      success: true,
      error: null,
      visit: parsed,
      data: result.data,
      rawResponse: result.rawResponse,
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || '生成来访内容时发生错误',
      visit: null,
    }
  }
}

const tryParseCharacterVisit = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try { return JSON.parse(text) } catch { return null }
  }

  // ---- Try delimiter-based protocol ----
  const visitMatch = candidate.match(/\|visit=([^|]+)\|/)
  const contentMatch = candidate.match(/\|content=([^|]+)\|/)
  const moodMatch = candidate.match(/\|mood=([^|]+)\|/)

  if (contentMatch) {
    const validTypes = ['note', 'message', 'redPacket', 'gift']
    let visitType = visitMatch ? visitMatch[1].trim().toLowerCase() : 'note'
    if (!validTypes.includes(visitType)) visitType = 'note'

    const content = contentMatch[1].trim()
    if (content) {
      const mood = moodMatch ? moodMatch[1].trim() : '平静'

      // Extract redpacket
      let redPacket = null
      const rpMatch = candidate.match(/\|redpacket=(\d+):([^|]+)\|/)
      if (rpMatch) {
        const amount = Number(rpMatch[1])
        const blessing = rpMatch[2].trim().slice(0, 30)
        if (amount >= 1 && amount <= 100) {
          redPacket = { amount: Math.round(amount), blessing: blessing || '小小意思，不成敬意~' }
        }
      }

      // Extract gift
      let giftItem = null
      const giftMatch = candidate.match(/\|gift=([^|]+):([^|]+)\|/)
      if (giftMatch) {
        const name = giftMatch[1].trim()
        if (name) {
          giftItem = { name, icon: giftMatch[2].trim().slice(0, 4) || '🎁' }
        }
      }

      return { visitType, content, mood: mood || '平静', redPacket, giftItem }
    }
  }

  // ---- Fallback: JSON parsing ----
  let parsed = parseJson(candidate)
  if (!parsed) {
    const jsonMatch = candidate.match(/\{[\s\S]*\}/)
    if (jsonMatch) parsed = parseJson(jsonMatch[0])
  }

  if (!parsed || typeof parsed !== 'object') return null

  const validTypes = ['note', 'message', 'redPacket', 'gift']
  let visitType = String(parsed.visitType || parsed.type || 'note').trim().toLowerCase()
  if (!validTypes.includes(visitType)) visitType = 'note'

  const content = String(parsed.content || parsed.noteContent || parsed.text || parsed.message || '').trim()
  if (!content) return null

  const mood = String(parsed.mood || parsed.emotion || '').trim()

  // 提取红包信息
  let redPacket = null
  if (parsed.redPacket && typeof parsed.redPacket === 'object') {
    const rp = parsed.redPacket
    const amount = Number(rp.amount)
    const blessing = String(rp.blessing || '').trim()
    if (amount >= 1 && amount <= 100) {
      redPacket = {
        amount: Math.round(amount),
        blessing: blessing || '小小意思，不成敬意~',
      }
    }
  }

  // 提取礼物信息
  let giftItem = null
  if (parsed.giftItem && typeof parsed.giftItem === 'object') {
    const gi = parsed.giftItem
    const name = String(gi.name || gi.itemName || '').trim()
    if (name) {
      giftItem = {
        name,
        icon: String(gi.icon || gi.emoji || '🎁').trim(),
      }
    }
  }

  return {
    visitType,
    content,
    mood: mood || '平静',
    redPacket,
    giftItem,
  }
}

/**
 * 生成CHAR的日记
 * @param {Object} params - 参数
 * @param {Object} params.character - 角色信息 {name, personality, traits}
 * @param {Object} params.worldBook - 世界书信息
 * @param {Array} params.recentEvents - 最近发生的事件列表
 * @param {string} params.currentDate - 当前日期
 * @param {Object} params.options - 额外选项
 * @returns {Promise<Object>} 生成的日记
 */
export const generateCharacterDiary = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      diary: null,
    }
  }

  const character = params.character && typeof params.character === 'object' ? params.character : {}
  const charName = String(character.name || character.label || '角色').trim()
  const charPersonality = String(character.personality || character.traits || character.description || '').trim()
  
  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const worldTitle = String(worldBook?.title || '默认世界书').trim()
  const worldSummary = String(worldBook?.summary || '').trim()
  
  const recentEvents = Array.isArray(params.recentEvents) ? params.recentEvents : []
  const eventsText = recentEvents
    .slice(0, 10)
    .map((e, i) => `${i + 1}. ${String(e.text || e.content || e.title || '').trim()}`)
    .join('\n') || '暂无特别事件'
  
  const currentDate = String(params.currentDate || new Date().toISOString().split('T')[0]).trim()

  // 根据角色性格决定日记长度
  const isVerbose = charPersonality.includes('话多') ||
                    charPersonality.includes('详细') ||
                    charPersonality.includes('感性') ||
                    charPersonality.includes('文艺')
  const minWords = isVerbose ? 300 : 100
  const maxWords = isVerbose ? 1000 : 500

  const userPrompt = [
    `【任务】请以${charName}的身份写一篇今天的日记。`,
    `【日期】${currentDate}`,
    `【角色名】${charName}`,
    charPersonality ? `【角色性格】${charPersonality}` : '',
    `【世界背景】${worldTitle}${worldSummary ? ' - ' + worldSummary : ''}`,
    `【最近发生的事】\n${eventsText}`,
    '',
    `【要求】`,
    `1. 以第一人称"${charName}"的视角写日记`,
    `2. 字数在${minWords}-${maxWords}字之间`,
    `3. 必须符合${charName}的性格特点`,
    `4. 记录今天发生的事情和感受`,
    `5. 给日记起一个标题`,
    `6. 用口语化但略带文学性的语言`,
    `7. 不要出现"作为AI"等元话术`,
    '',
    `请用分隔符格式输出：|title=标题| |content=正文| |mood=心情| |wordCount=字数|`,
  ]
    .filter(Boolean)
    .join('\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:character_diary'),
    userPrompt,
    temperature: params.options?.temperature ?? 0.85,
    maxTokens: params.options?.maxTokens ?? maxWords + 200,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '日记生成失败',
      diary: null,
    }
  }

  const diary = tryParseDiary(result.data)
  if (!diary) {
    return {
      success: false,
      error: '日记解析失败',
      diary: null,
    }
  }

  return {
    success: true,
    error: null,
    diary,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const DIARY_GENERATION_SYSTEM_PROMPT = `你是"角色日记生成器"。
你的任务是根据角色信息、世界背景和最近发生的事件，以角色的第一人称视角写一篇日记。

输出格式（严格遵守）：
|title=日记标题|
|content=日记正文|
|mood=心情|
|wordCount=正文字数|

硬性要求：
1) 不要 JSON，不要 markdown，不要解释，只输出上述分隔符格式。
2) 字段约束：
- title: 必填，日记标题，5-20字
- content: 必填，日记正文，100-1000字，根据角色性格决定长度
- mood: 必填，角色当天的心情，2-8字
- wordCount: 必填，正文字数（整数）
3) 必须以角色第一人称"我"来写
4) 内容必须符合角色性格和世界观设定
5) 不要写"作为AI""我无法"等元话术
6) 日记内容要自然流畅，像真人写的`

const tryParseDiary = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  // ---- Try delimiter-based protocol ----
  const titleMatch = candidate.match(/\|title=([^|]+)\|/)
  const contentMatch = candidate.match(/\|content=([^|]+)\|/)
  const moodMatch = candidate.match(/\|mood=([^|]+)\|/)
  const wcMatch = candidate.match(/\|wordCount=(\d+)\|/)

  if (contentMatch) {
    const content = contentMatch[1].trim()
    if (content) {
      const title = titleMatch ? titleMatch[1].trim() : '无题'
      const mood = moodMatch ? moodMatch[1].trim() : '平静'
      const wordCount = wcMatch ? Number.parseInt(wcMatch[1], 10) : content.length
      return {
        title: title || '无题',
        content,
        mood,
        wordCount: Number.isFinite(wordCount) ? wordCount : content.length,
      }
    }
  }

  // ---- Fallback: JSON parsing ----
  let parsed = parseJson(candidate)
  if (!parsed) {
    const jsonMatch = candidate.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      parsed = parseJson(jsonMatch[0])
    }
  }

  if (!parsed || typeof parsed !== 'object') return null

  const title = String(parsed.title || '').trim()
  const content = String(parsed.content || '').trim()
  const mood = String(parsed.mood || '').trim()
  const wordCount = Number(parsed.wordCount) || content.length

  if (!content) return null

  return {
    title: title || '无题',
    content,
    mood: mood || '平静',
    wordCount,
  }
}

// ============================================================
// 群聊回复生成
// ============================================================

const GROUP_CHAT_SYSTEM_PROMPT = `你是"群聊角色发言生成器"。
你要模拟一群角色在世界书群聊中的自然对话。

硬性要求：
1) 不要输出任何解释、不要写"作为AI""我无法"等元话术。
2) 输出格式（严格遵守）：
   |m=角色名:回复内容|
   |m=角色名2:回复内容2|
   每条发言一行，用 |m= 开头，以 | 结尾。
3) 根据上下文和角色人设，决定哪些角色（0-3个）主动发言，不要所有角色都说话。
4) 每条发言必须是中文，建议 8-60 字。
5) 语气与角色身份、世界观和上下文一致，不要跳戏。
6) 不要把用户原话逐句重复。
7) 角色可以回应用户的消息，也可以互相聊天、回应彼此的发言。
8) 如果不想让任何角色发言，返回空内容即可。
9) 如果玩家 @ 了某个角色，被 @ 的角色应该优先做出回应。
10) 如果角色 A 在发言中 @ 了角色 B，角色 B 应该做出回应。`

const tryParseGroupChatReplies = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return []

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  // ---- Try delimiter-based protocol first: |m=角色名:回复内容| ----
  const replyMatches = candidate.match(/\|m=([^|]+)\|/g)
  if (replyMatches && replyMatches.length > 0) {
    const replies = replyMatches
      .map(m => m.replace(/^\|m=/, '').replace(/\|$/, '').trim())
      .map(item => {
        const colonIdx = item.indexOf(':')
        if (colonIdx < 0) return null
        const authorName = item.slice(0, colonIdx).trim()
        const text = item.slice(colonIdx + 1).trim()
        if (!authorName || !text) return null
        return { authorName, text }
      })
      .filter(Boolean)
    if (replies.length > 0) return replies
  }

  // ---- Fallback: JSON parsing ----
  const parsed = parseJson(candidate)
  const extract = (value) => {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object' && Array.isArray(value.replies)) return value.replies
    if (value && typeof value === 'object' && Array.isArray(value.messages)) return value.messages
    return []
  }

  let items = extract(parsed)
  if (items.length === 0) {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      items = extract(parseJson(candidate.slice(start, end + 1)))
    }
  }

  if (items.length === 0) {
    const arrStart = candidate.indexOf('[')
    const arrEnd = candidate.lastIndexOf(']')
    if (arrStart >= 0 && arrEnd > arrStart) {
      const maybeArr = parseJson(candidate.slice(arrStart, arrEnd + 1))
      items = Array.isArray(maybeArr) ? maybeArr : []
    }
  }

  return items
    .map(item => {
      const authorName = String(item?.authorName || item?.name || item?.sender || '').trim()
      const text = String(item?.text || item?.reply || item?.content || item?.message || '').trim()
      if (!authorName || !text) return null
      return { authorName, text }
    })
    .filter(Boolean)
}

/**
 * 生成群聊回复
 * @param {Object} params
 * @param {Object} params.worldBook - 世界书对象（worldbook 类型群聊时发送完整世界书）
 * @param {Array} params.members - 群成员列表 [{contactId, contactName, identity?, worldBookId, worldBookTitle}]
 * @param {string} params.groupType - 'worldbook' | 'custom'
 * @param {string} params.userMessage - 用户刚发送的消息
 * @param {Array} params.history - 最近群聊消息 [{role, text, senderName?}]
 * @param {number} [params.contextMessages=15] - 上下文消息数
 * @param {Object} [params.options] - 额外选项
 * @returns {Promise<{success: boolean, error: string|null, replies: Array<{authorName, text}>}>}
 */
export const generateGroupChatReply = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      replies: [],
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const members = Array.isArray(params.members) ? params.members : []
  const groupType = params.groupType === 'custom' ? 'custom' : 'worldbook'
  const userMessage = String(params.userMessage || '').trim()
  const history = Array.isArray(params.history) ? params.history : []
  const contextMessages = Math.max(0, Math.min(50, Number(params.contextMessages) || 15))

  // 世界记忆上下文（群聊共享）
  const worldMemories = params.worldMemories && typeof params.worldMemories === 'object' ? params.worldMemories : null
  // 群成员关系数据：{ contactId: { favor, trust, stance, level } }
  const memberRelationships = params.memberRelationships && typeof params.memberRelationships === 'object'
    ? params.memberRelationships : null

  // 玩家身份信息
  const effectiveUser = params.effectiveUser && typeof params.effectiveUser === 'object' ? params.effectiveUser : null
  const playerName = effectiveUser?.name || '玩家'

  // 每个成员的私聊历史
  const memberPrivateChats = params.memberPrivateChats && typeof params.memberPrivateChats === 'object' ? params.memberPrivateChats : {}

  if (members.length === 0) {
    return {
      success: false,
      error: '群成员列表为空',
      replies: [],
    }
  }

  const memberNameMap = members.map(m => m.contactName || m.name || '').filter(Boolean)

  // 提取 @ 提及
  const extractMentions = (text) => {
    const mentions = []
    const regex = /@([^\s@]+)/g
    let match
    while ((match = regex.exec(text)) !== null) {
      const name = match[1].trim()
      if (name) mentions.push(name)
    }
    return mentions
  }

  // 构建群聊历史（保留 @ 原文，并标注提及）
  const recentChat = (contextMessages > 0 ? history.slice(-contextMessages) : [])
    .map(item => {
      const text = String(item.text || '').trim()
      const mentions = extractMentions(text)
      if (item.role === 'user') {
        if (mentions.length > 0) {
          return `玩家 @${mentions.join(', @')}: ${text}`
        }
        return `玩家: ${text}`
      }
      return `${item.senderName || '角色'}: ${text}`
    })
    .filter(Boolean)
    .join('\n')

  // 提取玩家当前消息中的 @ 提及
  const userMentions = extractMentions(userMessage)
  const mentionedText = userMentions.length > 0
    ? `【${playerName}提及的角色】${userMentions.join('、')}。${playerName}正在对他们说话，请优先让这些角色做出回应。`
    : ''

  let worldContext = ''
  let memberListText = ''

  if (groupType === 'worldbook') {
    // 世界书群聊：发送完整世界书上下文（所有角色来自同一世界）
    const wbTitle = String(worldBook?.title || '').trim()
    const wbSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
    const worldParts = [`世界书：${wbTitle || '默认世界书'}`]
    if (wbSummary) worldParts.push(`背景：${wbSummary}`)

    const charInfo = Array.isArray(worldBook?.characters)
      ? worldBook.characters
          .slice(0, 20)
          .map(c => {
            const n = String(c?.name || '').trim()
            if (!n) return ''
            const id = String(c?.identity || '').trim()
            const bg = String(c?.background || c?.notes || '').trim().slice(0, 100)
            return [n, id, bg].filter(Boolean).join(' | ')
          })
          .filter(Boolean)
          .join('\n')
      : ''
    if (charInfo) worldParts.push(`角色设定：\n${charInfo}`)

    worldContext = worldParts.join('\n')
    memberListText = members.map((m, i) => {
      const name = m.contactName || m.name || '未知角色'
      return `${i + 1}. ${name}`
    }).join('\n')
  } else {
    // 自定义群聊：每个角色带自己世界书背景（角色可能来自不同世界）
    const memberInfo = members.map((m, i) => {
      const name = String(m.contactName || m.name || '').trim()
      const identity = String(m.identity || m.subtitle || '').trim()
      const wbTitle = String(m.worldBookTitle || '').trim()
      const wbSummary = String(m.worldBookSummary || '').trim()
      const lines = [`${i + 1}. ${name}`]
      if (identity) lines.push(`身份：${identity}`)
      if (wbTitle) lines.push(`所属世界：${wbTitle}`)
      if (wbSummary) lines.push(`世界背景：${wbSummary}`)
      return lines.join(' | ')
    }).join('\n')
    worldContext = `【角色及其所属世界背景】\n${memberInfo}`
    memberListText = members.map((m, i) => {
      const name = m.contactName || m.name || '未知角色'
      return `${i + 1}. ${name}`
    }).join('\n')
  }

  // 构建玩家身份信息
  const playerIdentityText = `【玩家身份】${playerName}是群聊的发起者，是真实用户，不是任何角色。`

  // 构建私聊记忆
  const privateChatsParts = []
  for (const [memberName, privateHistory] of Object.entries(memberPrivateChats)) {
    if (privateHistory.length > 0) {
      const formattedHistory = privateHistory
        .map(msg => `${msg.role === 'user' ? playerName : memberName}: ${msg.text}`)
        .join('\n')
      privateChatsParts.push(`【${memberName}与${playerName}的私聊记忆（最近${privateHistory.length}条）】\n${formattedHistory}`)
    }
  }
  const privateChatsText = privateChatsParts.length > 0 ? privateChatsParts.join('\n\n') : ''

  // 世界记忆上下文
  const worldMemoryText = buildWorldMemoryContext(worldMemories)

  // 群成员关系上下文
  const memberRelationshipsText = buildGroupMemberRelationshipsContext(memberRelationships, members, playerName)

  const userPrompt = [
    `【群聊类型】${groupType === 'worldbook' ? '世界书群聊（所有角色来自同一世界）' : '自定义群聊（角色可能来自不同世界书）'}`,
    `【说明】你是群聊角色发言生成器。群里的"${playerName}"是用户本人，不是任何角色。请根据每个角色的人设和世界背景，决定哪些角色（0-3个）对${playerName}的消息做出回应。如果${playerName} @ 了某个角色，该角色应该优先做出回应。群内角色之间也可以互相 @ 对话，此时被 @ 的角色应该回应。`,
    worldContext,
    playerIdentityText,
    `【可用发言角色】\n${memberListText}`,
    privateChatsText,
    worldMemoryText ? `【共享记忆】\n${worldMemoryText}` : '',
    memberRelationshipsText ? `【角色对玩家的印象】\n${memberRelationshipsText}` : '',
    mentionedText,
    recentChat ? `【最近群聊记录】\n${recentChat}` : '【最近群聊记录】\n（这是群聊的第一条消息）',
    userMessage ? `【${playerName}刚发送】${userMessage}` : '',
    '请按格式返回：|m=角色名:回复内容|，每条一行。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('phone:group_chat'),
    userPrompt,
    temperature: params.options?.temperature ?? 0.88,
    maxTokens: params.options?.maxTokens ?? Math.min(1500, 300 + members.length * 180),
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '群聊回复生成失败',
      replies: [],
    }
  }

  const parsed = tryParseGroupChatReplies(result.data)
  if (parsed.length === 0) {
    return {
      success: false,
      error: '群聊回复解析失败',
      replies: [],
    }
  }

  // 匹配角色名到群成员
  const usedMemberIds = new Set()
  const replies = []

  for (const item of parsed) {
    const authorHint = String(item.authorName || '').trim()
    const text = String(item.text || '').trim()
    if (!text) continue

    // 匹配群成员
    let matched = null
    if (authorHint) {
      matched = members.find(m => (m.contactName || m.name) === authorHint)
      if (!matched) {
        matched = members.find(m =>
          (m.contactName || m.name).includes(authorHint) || authorHint.includes(m.contactName || m.name || '')
        )
      }
    }

    if (!matched) {
      // 自动选择一个未发言的成员
      matched = members.find(m => !usedMemberIds.has(m.contactId || m.name)) || members[0]
    }

    if (!matched) continue

    replies.push({
      authorName: matched.contactName || matched.name || authorHint,
      authorId: matched.contactId || '',
      text,
    })
    usedMemberIds.add(matched.contactId || matched.name)
  }

  if (replies.length === 0) {
    return {
      success: false,
      error: '群聊回复为空',
      replies: [],
    }
  }

  return {
    success: true,
    error: null,
    replies,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}
