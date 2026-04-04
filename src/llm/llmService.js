/**
 * LLM 服务模块
 * 负责与 LLM API 通信，生成剧情内容
 */

import { kvStorage } from '../storage/index.js'

// 存储 key 常量
const CONFIG_STORAGE_KEY = 'api_configs'
const ACTIVE_CONFIG_KEY = 'active_api_id'

/**
 * 获取当前激活的 API 配置
 * @returns {Promise<Object|null>} API 配置对象
 */
export const getActiveApiConfig = async () => {
  if (typeof window === 'undefined') return null

  try {
    const activeId = await kvStorage.get(ACTIVE_CONFIG_KEY)
    if (!activeId) return null

    const configs = await kvStorage.get(CONFIG_STORAGE_KEY) || []
    return configs.find((c) => c.id === activeId) || null
  } catch {
    return null
  }
}

const getValidatedActiveConfig = async () => {
  const config = await getActiveApiConfig()

  if (!config) {
    return {
      success: false,
      error: '未配置 API，请先在设置中配置并应用 API',
      config: null,
    }
  }

  const { customApi, apiKey } = config
  if (!customApi || !apiKey) {
    return {
      success: false,
      error: 'API 配置不完整，请检查 API 地址和 Key',
      config: null,
    }
  }

  return {
    success: true,
    error: null,
    config,
  }
}

const callChatCompletion = async ({
  config,
  systemPrompt,
  userPrompt,
  temperature = 0.8,
  maxTokens = 2000,
  extraParams = {},
}) => {
  const { customApi, apiKey, model } = config

  try {
    const response = await fetch(customApi, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: String(systemPrompt || ''),
          },
          {
            role: 'user',
            content: String(userPrompt || ''),
          },
        ],
        temperature,
        max_tokens: maxTokens,
        ...extraParams,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: `API 请求失败: ${response.status} ${errorText}`,
        data: null,
      }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      return {
        success: false,
        error: 'API 返回内容为空',
        data: null,
      }
    }

    return {
      success: true,
      error: null,
      data: content,
      rawResponse: data,
    }
  } catch (err) {
    return {
      success: false,
      error: `网络请求失败: ${err.message}`,
      data: null,
    }
  }
}

/**
 * 调用 LLM API 生成剧情
 * @param {string} prompt - 完整的 prompt 字符串
 * @param {Object} options - 可选配置
 * @returns {Promise<Object>} 生成结果
 */
export const generateStory = async (prompt, options = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      data: null,
    }
  }

  return callChatCompletion({
    config: validated.config,
    systemPrompt: getSystemPrompt(),
    userPrompt: prompt,
    temperature: options.temperature || 0.8,
    maxTokens: options.maxTokens || 2000,
    extraParams: options.extraParams,
  })
}

const SMS_SYSTEM_PROMPT = `你是“短信角色回复生成器”。
你只负责代入指定角色，生成一条简短、自然、口语化的短信回复。

硬性要求：
1) 只输出 JSON 对象，不要输出 markdown，不要解释。
2) JSON 格式必须是：{"reply":"..."}
3) reply 必须是中文，长度建议 10-60 字，可带 1 个 emoji（可选）。
4) 语气与角色身份、世界观和最近上下文一致，不要跳戏。
5) 不要把用户原话重复一遍，不要写“作为AI”“我无法”等元话术。`

const tryParseSmsReply = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return ''

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fencedMatch?.[1]?.trim() || raw

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  const directJson = parseJson(candidate)
  if (directJson && typeof directJson.reply === 'string') {
    return directJson.reply.trim()
  }

  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const sliced = candidate.slice(start, end + 1)
    const slicedJson = parseJson(sliced)
    if (slicedJson && typeof slicedJson.reply === 'string') {
      return slicedJson.reply.trim()
    }
  }

  return candidate
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
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

  const recentSms = history
    .slice(-8)
    .map((item) => `${item?.role === 'assistant' ? contact.name : '玩家'}: ${String(item?.text || '').trim()}`)
    .filter(Boolean)
    .join('\n')

  const recentDialogue = dialogueHistory
    .slice(-4)
    .map((line) => `${String(line?.speaker || '旁白')}: ${String(line?.text || '').trim()}`)
    .filter(Boolean)
    .join('\n')

  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const roleSummary = String(contact?.identity || contact?.subtitle || '').trim()
  const styleHint = String(worldBook?.defaultNarratorId || '').trim()
  const userProfileName = String(worldBook?.userProfile?.name || worldBook?.userProfile?.nickname || '玩家').trim()

  const userPrompt = [
    `【世界书标题】${String(worldBook?.title || '默认世界书').trim()}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    `【角色名】${contact.name}`,
    roleSummary ? `【角色信息】${roleSummary}` : '',
    styleHint ? `【叙事风格ID参考】${styleHint}` : '',
    `【当前发信人】${userProfileName}`,
    recentDialogue ? `【最近剧情上下文】\n${recentDialogue}` : '',
    recentSms ? `【最近短信记录】\n${recentSms}` : '',
    `【玩家刚发送】${userMessage}`,
    '请只返回 JSON：{"reply":"角色回复"}',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: SMS_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.85,
    maxTokens: params.options?.maxTokens ?? 220,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '短信生成失败',
      reply: '',
    }
  }

  const reply = tryParseSmsReply(result.data)
  if (!reply) {
    return {
      success: false,
      error: '短信回复解析失败',
      reply: '',
    }
  }

  return {
    success: true,
    error: null,
    reply,
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

/**
 * 获取系统提示词
 * @returns {string} 系统提示词
 */
const getSystemPrompt = () => {
  return `你是一个专业的视觉小说/AVG游戏剧情生成助手。你的任务是根据提供的世界设定、角色信息和当前剧情，生成接下来的剧情内容。

## 输出格式要求

你必须严格按照以下 JSON 格式输出，每条对话为一个 JSON 对象，多段对话放在 JSON 数组中：

\`\`\`json
[
  {
    "speaker": "说话者名称",
    "emotion": "表情标识",
    "text": "对话内容",
    "highlight": true
  }
]
\`\`\`

### 字段说明：
- **speaker**: 说话者名称，必须是已定义的角色名称或"旁白"
- **emotion**: 表情标识，可选值如下：
  - default: 默认/平静
  - happy: 开心/高兴
  - angry: 生气/愤怒
  - sad: 悲伤/难过
  - surprised: 惊讶/吃惊
  - fear: 恐惧/害怕
  - disgust: 厌恶/反感
  - neutral: 平静/淡然
  - shy: 害羞/腼腆
  - thinking: 思考/沉思
  - sleepy: 困倦/疲惫
  - excited: 兴奋/激动
  - worried: 担心/忧虑
  - confident: 自信/坚定
- **text**: 对话内容，描述性文字或角色台词
- **highlight**: 布尔值，true 表示该角色立绘需要高亮显示

## 选项生成要求（重要！）

**每次生成都必须在最后一条对话中添加 \`choices\` 字段，为玩家提供选择分支！** 这是强制要求，用于测试交互式剧情功能。

\`\`\`json
[
  {
    "speaker": "旁白",
    "emotion": "default",
    "text": "你面前有一扇紧闭的门，门缝中透出微弱的光芒。",
    "highlight": false,
    "choices": {
      "prompt": "你要怎么做？",
      "options": [
        { "text": "打开门", "action": "open_door" },
        { "text": "不打开", "action": "ignore_door" },
        { "text": "交给伊芙处理", "action": "ask_eve" }
      ],
      "allowCustomInput": true
    }
  }
]
\`\`\`

### choices 字段说明：
- **prompt**: 选择提示语，向玩家说明当前情境
- **options**: 选项数组，每个选项包含：
  - text: 选项显示文本
  - action: 选项动作标识（用于后续处理）
- **allowCustomInput**: 布尔值，必须设置为 true，允许玩家自定义输入内容

## 创作要求

1. 保持角色性格一致性
2. 剧情发展要符合世界观设定
3. 合理使用表情标识来增强表现力
4. 每次生成 1-3 条对话为宜
5. 确保输出是合法的 JSON 格式
6. 不要输出任何 JSON 之外的内容
7. **【强制】每次生成的最后一条对话必须包含 choices 字段**
8. 选项应该符合剧情逻辑，提供有意义的分支
9. 每次提供 2-4 个选项，allowCustomInput 必须为 true`
}

export default {
  generateStory,
  generatePhoneSmsReply,
  generatePhoneMomentsReplies,
  generatePhoneMomentsBatchReplies,
  getActiveApiConfig,
}
