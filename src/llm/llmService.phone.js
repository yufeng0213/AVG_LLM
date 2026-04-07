/**
 * LLM 服务模块（Phone 功能）
 */

import { getValidatedActiveConfig, callChatCompletion } from './llmService.core'
const SMS_SYSTEM_PROMPT = `你是“短信角色回复生成器”。
你只负责代入指定角色，生成自然、口语化的短信回复，支持分成多条连续短信。

硬性要求：
1) 只输出 JSON 对象，不要输出 markdown，不要解释。
2) JSON 格式优先：{"replies":["...","..."]}；兼容格式：{"reply":"..."}。
3) 每条回复必须是中文，建议 8-60 字，总条数 1-4 条。
4) 语气与角色身份、世界观和最近上下文一致，不要跳戏。
5) 不要把用户原话逐句重复，不要写“作为AI”“我无法”等元话术。`

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

  let parsedReplies = extractReplies(parseJson(candidate))

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

  if (normalizedReplies.length > 0) {
    return normalizedReplies.slice(0, 6)
  }

  return splitSmsReplySegments(
    candidate
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
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

  const recentDialogue = (dialogueHistoryLimit > 0 ? dialogueHistory.slice(-dialogueHistoryLimit) : [])
    .map((line) => `${String(line?.speaker || '旁白')}: ${String(line?.text || '').trim()}`)
    .filter(Boolean)
    .join('\n')

  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const roleSummary = String(contact?.identity || contact?.subtitle || '').trim()
  const styleHint = String(worldBook?.defaultNarratorId || '').trim()
  const userProfileName = String(worldBook?.userProfile?.name || worldBook?.userProfile?.nickname || '玩家').trim()
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

  const userPrompt = [
    `【世界书标题】${String(worldBook?.title || '默认世界书').trim()}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    `【角色名】${contact.name}`,
    roleSummary ? `【角色信息】${roleSummary}` : '',
    styleHint ? `【叙事风格ID参考】${styleHint}` : '',
    `【当前发信人】${userProfileName}`,
    currentLineText ? `【当前剧情句】${currentLineText}` : '',
    recentDialogue ? `【最近剧情上下文】\n${recentDialogue}` : '',
    recentSms ? `【最近短信记录】\n${recentSms}` : '',
    forwardedClueText ? `【本次转发线索】\n${forwardedClueText}` : '',
    `【玩家刚发送】${userMessage}`,
    forwardedClueText
      ? '请结合线索逐条给出判断与态度，建议输出 2-4 条连续短信回复。'
      : '可输出 1-4 条连续短信回复，不要只回一句敷衍话。',
    '请只返回 JSON：{"replies":["回复1","回复2"]}（兼容单条：{"reply":"回复"}）。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: SMS_SYSTEM_PROMPT,
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
    }
  }

  const replies = tryParseSmsReplies(result.data)
  if (replies.length === 0) {
    return {
      success: false,
      error: '短信回复解析失败',
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

const MOMENTS_SYSTEM_PROMPT = `你是“朋友圈评论生成器”。
你要根据动态内容、世界观和角色设定，生成 1-3 条自然的中文评论。

硬性要求：
1) 只输出 JSON，不要 markdown，不要解释。
2) JSON 格式必须是：{"comments":[{"authorName":"角色名","text":"评论内容"}]}
3) authorName 必须从提供的“可用评论角色列表”中选择，且不要重复。
4) text 必须是中文，口语化，建议 8-40 字，不要出现“作为AI”等元话术。`

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
    '请生成 1-3 条评论并只返回 JSON：{"comments":[{"authorName":"角色名","text":"评论"}]}',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: MOMENTS_SYSTEM_PROMPT,
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

const MOMENTS_BATCH_REPLY_SYSTEM_PROMPT = `你是“朋友圈续聊生成器”。
你要根据玩家对评论区角色的回复，生成这些角色的后续评论回复。

硬性要求：
1) 只输出 JSON，不要 markdown，不要解释。
2) JSON 格式必须是：{"replies":[{"pendingId":"待回复ID","authorName":"角色名","text":"回复内容"}]}
3) pendingId 必须从输入的待回复列表中选择，并且一条 pendingId 最多回复一次。
4) authorName 优先与该 pendingId 的目标角色一致。
5) text 必须是中文，口语化，建议 8-40 字，不要出现“作为AI”等元话术。`

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
    '请为每条待续聊生成一条角色回复，并只返回 JSON：{"replies":[{"pendingId":"待回复ID","authorName":"角色名","text":"回复"}]}',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: MOMENTS_BATCH_REPLY_SYSTEM_PROMPT,
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

const FORUM_SYSTEM_PROMPT = `你是“世界观论坛帖子生成器”。
你的任务是根据世界书设定与最新剧情，生成旁观者视角的论坛帖子。

硬性要求：
1) 只输出 JSON，不要 markdown，不要解释。
2) JSON 格式必须是：
{"posts":[{"tag":"标签","title":"标题","authorName":"发帖人","content":"正文","isHot":false,"comments":[{"authorName":"回帖人","text":"回帖内容"}]}]}
3) 发帖人和回帖人必须是“旁观者/路人/媒体/群众”等，不要直接让主角团当第一发帖人。
4) 内容要贴合世界观与近期剧情推进，语气像真实论坛，避免“作为AI”这类元话术。
5) 标题 12-36 字，正文 40-180 字，每帖 1-4 条回帖。
6) 标签尽量从提供的标签列表中选。
7) 帖子时间线必须承接“当前剧情句”和“最近剧情推进”，不要跳回旧进度，不要剧透未发生剧情。
8) 信息不足时可写成“目击/传闻/分析帖”，不要编造主角已确认的内心独白。`

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
    `请严格返回 JSON，字段为 posts，数量尽量接近 ${postCount}，并确保能体现当前剧情的新增信息。`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: FORUM_SYSTEM_PROMPT,
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

const NEWS_FEED_SYSTEM_PROMPT = `你是“世界观新闻聚合生成器”。
你的任务是根据世界书和当前剧情，生成“今日X条”新闻流。

硬性要求：
1) 只输出 JSON，不要 markdown，不要解释。
2) JSON 必须为：
{"events":[{"topic":"事件主题","importance":"high","versions":[{"outlet":"媒体名","style":"媒体风格","headline":"标题","summary":"导语","angle":"立场角度","credibility":"confirmed"}]}]}
3) events 数量 4-10 条；每条事件 versions 2-4 条。
4) 每个 versions 必须模拟不同媒体写法（官媒、地方小报、财经媒体、自媒体、调查记者等可混合）。
5) 时间线必须承接当前剧情，不要跳回旧进度，不要剧透未来剧情。
6) 可写“传闻/分析/快讯”，但必须在 credibility 明确标记：
   - confirmed: 已确认
   - rumor: 传闻未证实
   - analysis: 评论分析
7) headline 建议 12-34 字，summary 建议 24-120 字；保持像真实新闻客户端文风。`

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
    `请严格输出 JSON，字段为 events；每个事件都要有 versions，且 versions 数量尽量达到 ${versionsPerEvent}。`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: NEWS_FEED_SYSTEM_PROMPT,
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

const PHONE_MAP_SYSTEM_PROMPT = `你是“剧情地图生成器”。
你的任务是根据世界书与当前剧情，生成可点击的地点地图数据。

硬性要求：
1) 只输出 JSON，不要 markdown，不要解释。
2) JSON 推荐格式：
{
  "title":"地图标题",
  "currentLocation":"当前位置名或ID",
  "locations":[
    {
      "id":"old_library",
      "name":"旧图书馆",
      "x":42,
      "y":63,
      "desc":"地点说明",
      "risk":"medium",
      "tags":["调查","夜间"],
      "connections":["harbor","market"]
    }
  ]
}
3) locations 数量建议 4-12。
4) x/y 必须是 0-100 区间数字，用于前端定位。
5) risk 仅允许 low/medium/high。
6) 地图时间线必须承接当前剧情；不要剧透未来未发生剧情。`

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

  const usedIds = new Set()
  const locations = sourceLocations
    .map((item, index) => {
      const name = String(item?.name || item?.title || item?.label || '').trim()
      if (!name) return null

      const rawId = String(item?.id || item?.key || '').trim()
      const nameToken = name.replace(/[^\w\u4e00-\u9fa5]+/g, '_').slice(0, 24) || `loc_${index + 1}`
      let id = (rawId || `loc_${nameToken}`).replace(/\s+/g, '_')
      if (!id) id = `loc_${index + 1}`
      if (usedIds.has(id)) {
        id = `${id}_${index + 1}`
      }
      usedIds.add(id)

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
    `请严格返回 JSON，字段至少包含 title/currentLocation/locations。`,
    `locations 中每个地点必须包含 id/name/x/y/desc/risk/tags/connections。`,
    `x 与 y 使用 0-100 区间数字；risk 仅允许 low/medium/high。`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: PHONE_MAP_SYSTEM_PROMPT,
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

const PHONE_SHOP_SYSTEM_PROMPT = `你是“点购网商品生成器”。
你要根据世界书、当前剧情和用户搜索词，生成可购买的商品列表。

硬性要求：
1) 只输出 JSON，不要 markdown，不要解释。
2) JSON 格式必须是：
{"items":[{"name":"商品名","description":"商品描述","tags":["标签1","标签2"],"price":"39.90"}]}
3) items 数量 4-12 条。
4) 每个商品必须包含 name/description/price 字段；tags 可为空数组但必须存在。
5) price 可以是数字或字符串，但必须表示可解析的价格（例如 12.5 / "29.90" / "¥49"）。
6) 商品需要贴合当前世界观和剧情推进，不要脱离设定。`

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
    '请输出 JSON：{"items":[...]}，每条都包含 name/description/tags/price。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: PHONE_SHOP_SYSTEM_PROMPT,
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

