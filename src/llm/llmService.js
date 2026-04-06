/**
 * LLM 服务模块
 * 负责与 LLM API 通信，生成剧情内容
 */

import { kvStorage } from '../storage/index.js'

// 存储 key 常量
const CONFIG_STORAGE_KEY = 'api_configs'
const ACTIVE_CONFIG_KEY = 'active_api_id'
const DEFAULT_MINIMAX_TTS_API = 'https://api.minimaxi.com/v1/t2a_v2'

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

const TTS_EMOTION_MAP = {
  default: 'neutral',
  neutral: 'neutral',
  happy: 'happy',
  excited: 'happy',
  confident: 'happy',
  sad: 'sad',
  worried: 'sad',
  angry: 'angry',
  fear: 'fearful',
  surprised: 'surprised',
  shy: 'neutral',
  thinking: 'neutral',
  sleepy: 'neutral',
  disgust: 'neutral',
}

const TTS_FORMAT_MIME_MAP = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
}

const normalizeTtsFormat = (value) => {
  const format = String(value || '').trim().toLowerCase()
  if (format === 'wav' || format === 'flac' || format === 'mp3') {
    return format
  }
  return 'mp3'
}

const ttsClampNumber = (value, min, max, fallback) => {
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, parsed))
}

const ttsParseNumber = (value, fallback) => {
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return parsed
}

const ttsClampInteger = (value, min, max, fallback) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, parsed))
}

const decodeHexAudio = (rawHex) => {
  const normalized = String(rawHex || '')
    .replace(/^0x/i, '')
    .replace(/\s+/g, '')
    .trim()

  if (!normalized || normalized.length % 2 !== 0) {
    return null
  }

  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    return null
  }

  const byteLength = normalized.length / 2
  const bytes = new Uint8Array(byteLength)

  for (let index = 0; index < byteLength; index += 1) {
    const offset = index * 2
    bytes[index] = Number.parseInt(normalized.slice(offset, offset + 2), 16)
  }

  return bytes
}

const decodeBase64Audio = (rawBase64) => {
  const normalized = String(rawBase64 || '').trim()
  if (!normalized || typeof atob !== 'function') {
    return null
  }

  try {
    const base64Body = normalized.includes(',')
      ? normalized.slice(normalized.lastIndexOf(',') + 1).trim()
      : normalized
    const binary = atob(base64Body)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    return null
  }
}

const normalizeTtsEmotion = (rawEmotion) => {
  const token = String(rawEmotion || '').trim().toLowerCase()
  if (!token) return ''
  if (token === 'neutral' || token === 'happy' || token === 'sad' || token === 'angry' || token === 'fearful' || token === 'surprised') {
    return token
  }
  return TTS_EMOTION_MAP[token] || ''
}

const normalizeToneList = (rawValue) => {
  if (!Array.isArray(rawValue)) return []
  return rawValue
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 32)
}

const resolveCharacterVoiceConfig = (activeConfig, rawCharacterVoice = {}, currentEmotion = '') => {
  const voiceConfig = rawCharacterVoice && typeof rawCharacterVoice === 'object' ? rawCharacterVoice : {}
  const defaultVoice = activeConfig?.ttsDefaultVoice && typeof activeConfig.ttsDefaultVoice === 'object'
    ? activeConfig.ttsDefaultVoice
    : {}
  const defaultAudio = activeConfig?.ttsDefaultAudio && typeof activeConfig.ttsDefaultAudio === 'object'
    ? activeConfig.ttsDefaultAudio
    : {}

  const voiceId = String(voiceConfig.voiceId || defaultVoice.voiceId || '').trim()
  const emotion = normalizeTtsEmotion(
    voiceConfig.emotion ||
    defaultVoice.emotion ||
    currentEmotion,
  )

  const voiceSetting = {
    voice_id: voiceId,
    speed: ttsClampNumber(voiceConfig.speed, 0.5, 2, ttsClampNumber(defaultVoice.speed, 0.5, 2, 1)),
    vol: ttsParseNumber(voiceConfig.vol, ttsParseNumber(defaultVoice.vol, 1)),
    pitch: ttsClampNumber(voiceConfig.pitch, -12, 12, ttsClampNumber(defaultVoice.pitch, -12, 12, 0)),
  }
  if (emotion) {
    voiceSetting.emotion = emotion
  }

  const format = normalizeTtsFormat(voiceConfig.format || defaultAudio.format || 'mp3')
  const audioSetting = {
    sample_rate: ttsClampInteger(voiceConfig.sampleRate, 8000, 48000, ttsClampInteger(defaultAudio.sampleRate, 8000, 48000, 32000)),
    bitrate: ttsClampInteger(voiceConfig.bitrate, 32000, 320000, ttsClampInteger(defaultAudio.bitrate, 32000, 320000, 128000)),
    format,
    channel: ttsClampInteger(voiceConfig.channel, 1, 2, ttsClampInteger(defaultAudio.channel, 1, 2, 1)),
  }

  return {
    voiceId,
    voiceSetting,
    audioSetting,
    pronunciationTone: normalizeToneList(voiceConfig.pronunciationTone),
    subtitleEnable: Boolean(voiceConfig.subtitleEnable),
    mimeType: TTS_FORMAT_MIME_MAP[format] || 'audio/mpeg',
  }
}

/**
 * 调用 MiniMax TTS 生成角色语音
 * @param {Object} params
 * @param {string} params.text - 需要合成的文本
 * @param {string} params.emotion - 当前剧情表情（可选）
 * @param {Object} params.voiceConfig - 角色语音配置（来自世界书 char.voiceConfig）
 * @returns {Promise<Object>}
 */
export const generateCharacterSpeech = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      audioBytes: null,
    }
  }

  const config = validated.config
  const text = String(params.text || '').trim()
  if (!text) {
    return {
      success: false,
      error: '语音文本为空',
      audioBytes: null,
    }
  }

  const ttsApi = String(config.ttsApi || DEFAULT_MINIMAX_TTS_API).trim()
  if (!ttsApi) {
    return {
      success: false,
      error: '未配置 TTS API 地址，请在设置中补充语音模型配置',
      audioBytes: null,
    }
  }

  const ttsApiKey = String(config.ttsApiKey || config.apiKey || '').trim()
  if (!ttsApiKey) {
    return {
      success: false,
      error: '未配置 TTS API Key',
      audioBytes: null,
    }
  }

  const model = String(config.ttsModel || 'speech-2.8-hd').trim() || 'speech-2.8-hd'
  const voiceRuntime = resolveCharacterVoiceConfig(
    config,
    params.voiceConfig,
    params.emotion,
  )
  if (!voiceRuntime.voiceId) {
    return {
      success: false,
      error: '当前角色未配置 voice_id',
      audioBytes: null,
    }
  }

  const requestPayload = {
    model,
    text,
    stream: false,
    voice_setting: voiceRuntime.voiceSetting,
    audio_setting: voiceRuntime.audioSetting,
    subtitle_enable: voiceRuntime.subtitleEnable,
  }

  if (voiceRuntime.pronunciationTone.length > 0) {
    requestPayload.pronunciation_dict = {
      tone: voiceRuntime.pronunciationTone,
    }
  }

  try {
    const response = await fetch(ttsApi, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ttsApiKey}`,
      },
      body: JSON.stringify(requestPayload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: `TTS 请求失败: ${response.status} ${errorText}`,
        audioBytes: null,
      }
    }

    const data = await response.json()
    const statusCode = Number.parseInt(String(data?.base_resp?.status_code ?? 0), 10)
    if (Number.isFinite(statusCode) && statusCode !== 0) {
      return {
        success: false,
        error: `TTS 服务返回错误: ${String(data?.base_resp?.status_msg || statusCode)}`,
        audioBytes: null,
        rawResponse: data,
      }
    }

    const audioRaw = String(data?.data?.audio || data?.audio || '').trim()
    if (!audioRaw) {
      return {
        success: false,
        error: 'TTS 返回音频为空',
        audioBytes: null,
        rawResponse: data,
      }
    }

    const audioBytes = decodeHexAudio(audioRaw) || decodeBase64Audio(audioRaw)
    if (!audioBytes || audioBytes.length === 0) {
      return {
        success: false,
        error: 'TTS 音频解码失败',
        audioBytes: null,
        rawResponse: data,
      }
    }

    return {
      success: true,
      error: null,
      audioBytes,
      mimeType: voiceRuntime.mimeType,
      format: voiceRuntime.audioSetting.format,
      rawResponse: data,
    }
  } catch (error) {
    return {
      success: false,
      error: `TTS 网络请求失败: ${error?.message || '未知错误'}`,
      audioBytes: null,
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

const CG_PROMPT_SYSTEM_PROMPT = `你是“AVG 场景生图提示词生成器”。
你将读取世界书、角色外貌设定和近期剧情，然后输出可直接用于生图模型的提示词。

硬性要求：
1) 只输出 JSON 对象，不要 markdown，不要解释。
2) JSON 格式必须为：
{"positivePrompt":"...","positivePromptZh":"...","negativePrompt":"...","sceneSummary":"..."}
3) positivePrompt 用于直接生图，建议关键词表达清晰（中英皆可）。
4) positivePromptZh 必须是中文可读版提示词，方便用户手工修改，内容和 positivePrompt 对齐。
5) negativePrompt 必须包含避免低质/畸形/文字水印等关键词。
6) sceneSummary 用中文，30-120 字，总结当前画面瞬间。
7) 不要输出违法或露骨内容。`

const clampCgContextLineCount = (value, fallback = 24) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(400, parsed))
}

const clampCgMaxTokens = (value, fallback = 2000) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(128, Math.min(200000, parsed))
}

const DEFAULT_CG_NEGATIVE_PROMPT = 'low quality, bad quality, blurry, ugly, distorted, deformed, watermark, text'

const parseJsonObjectFromText = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const parseJson = (text) => {
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
    } catch {
      // no-op
    }
    return null
  }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const fencedCandidate = fencedMatch?.[1]?.trim()
  if (fencedCandidate) {
    const parsedFenced = parseJson(fencedCandidate)
    if (parsedFenced) return parsedFenced
  }

  const directParsed = parseJson(raw)
  if (directParsed) return directParsed

  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return parseJson(raw.slice(start, end + 1))
  }

  return null
}

const normalizeCgPromptOutput = (rawContent) => {
  const parsed = parseJsonObjectFromText(rawContent)
  if (!parsed) {
    const fallbackPositive = String(rawContent || '').trim()
    if (!fallbackPositive) return null
    return {
      positivePrompt: fallbackPositive,
      positivePromptZh: fallbackPositive,
      negativePrompt: DEFAULT_CG_NEGATIVE_PROMPT,
      sceneSummary: '',
    }
  }

  const positivePrompt = String(
    parsed.positivePrompt ||
    parsed.prompt ||
    parsed.positive ||
    parsed.mainPrompt ||
    '',
  ).trim()
  if (!positivePrompt) return null

  const positivePromptZh = String(
    parsed.positivePromptZh ||
    parsed.promptZh ||
    parsed.chinesePrompt ||
    parsed.prompt_cn ||
    parsed.promptCN ||
    positivePrompt,
  ).trim() || positivePrompt

  const negativePrompt = String(
    parsed.negativePrompt ||
    parsed.negative ||
    DEFAULT_CG_NEGATIVE_PROMPT,
  ).trim() || DEFAULT_CG_NEGATIVE_PROMPT

  const sceneSummary = String(
    parsed.sceneSummary ||
    parsed.summary ||
    parsed.scene ||
    '',
  ).trim()

  return {
    positivePrompt,
    positivePromptZh,
    negativePrompt,
    sceneSummary,
  }
}

export const generateCgPrompt = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      prompt: null,
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const narratorProfile = params.narratorProfile && typeof params.narratorProfile === 'object' ? params.narratorProfile : null
  const dialogueHistory = Array.isArray(params.dialogueHistory) ? params.dialogueHistory : []
  const currentLine = params.currentLine && typeof params.currentLine === 'object' ? params.currentLine : null
  const sceneName = String(
    params.sceneName ||
    currentLine?.scene?.name ||
    currentLine?.scene?.id ||
    currentLine?.scene ||
    '',
  ).trim()

  const contextLineCount = clampCgContextLineCount(params.contextLineCount, 24)
  const maxTokens = clampCgMaxTokens(params.maxTokens, 2000)
  const temperature = Number.isFinite(Number(params.temperature))
    ? Number(params.temperature)
    : 0.72

  const worldTitle = String(worldBook?.title || '默认世界书').trim()
  const worldSummary = String(
    worldBook?.summary ||
    worldBook?.entries?.overview ||
    '',
  ).trim()
  const worldEntries = worldBook?.entries && typeof worldBook.entries === 'object'
    ? worldBook.entries
    : {}

  const entryLabels = [
    ['overview', '世界概述'],
    ['era', '时代背景'],
    ['regions', '地理区域'],
    ['forces', '主要势力'],
    ['rules', '世界规则'],
    ['culture', '社会文化'],
    ['conflict', '核心冲突'],
    ['secrets', '秘密与禁忌'],
  ]

  const worldEntryText = entryLabels
    .map(([key, label]) => {
      const value = String(worldEntries?.[key] || '').trim()
      if (!value) return ''
      return `- ${label}: ${value}`
    })
    .filter(Boolean)
    .join('\n')

  const userProfile = worldBook?.userProfile && typeof worldBook.userProfile === 'object'
    ? worldBook.userProfile
    : {}
  const userLines = [
    `名称: ${String(userProfile.name || userProfile.nickname || '玩家').trim() || '玩家'}`,
    String(userProfile.nickname || '').trim() ? `昵称: ${String(userProfile.nickname).trim()}` : '',
    String(userProfile.appearance || '').trim() ? `外貌: ${String(userProfile.appearance).trim()}` : '',
    String(userProfile.identity || '').trim() ? `身份: ${String(userProfile.identity).trim()}` : '',
    String(userProfile.background || '').trim() ? `背景: ${String(userProfile.background).trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const characterText = (Array.isArray(worldBook?.characters) ? worldBook.characters : [])
    .map((char, index) => {
      const name = String(char?.name || char?.id || `角色${index + 1}`).trim() || `角色${index + 1}`
      const appearance = String(char?.appearance || '').trim()
      const identity = String(char?.identity || '').trim()
      const nickname = String(char?.nickname || '').trim()
      const notes = String(char?.notes || '').trim()
      const background = String(char?.background || '').trim()

      const parts = [`${index + 1}. ${name}`]
      if (nickname) parts.push(`昵称: ${nickname}`)
      if (appearance) parts.push(`外貌: ${appearance}`)
      if (identity) parts.push(`身份: ${identity}`)
      if (background) parts.push(`背景: ${background}`)
      if (notes) parts.push(`备注: ${notes}`)
      return parts.join(' | ')
    })
    .filter(Boolean)
    .slice(0, 24)
    .join('\n')

  const recentDialogue = (contextLineCount > 0 ? dialogueHistory.slice(-contextLineCount) : [])
    .map((line) => {
      const speaker = String(line?.speaker || '旁白').trim() || '旁白'
      const emotion = String(line?.emotion || '').trim()
      const text = String(line?.text || '').trim()
      if (!text) return ''
      return emotion ? `${speaker}[${emotion}]: ${text}` : `${speaker}: ${text}`
    })
    .filter(Boolean)
    .join('\n')

  const currentLineText = currentLine?.text
    ? `${String(currentLine?.speaker || '旁白').trim() || '旁白'}: ${String(currentLine.text || '').trim()}`
    : ''

  const narratorText = narratorProfile
    ? [
      String(narratorProfile.name || '').trim() ? `叙事者: ${String(narratorProfile.name || '').trim()}` : '',
      String(narratorProfile.summary || '').trim() ? `风格定位: ${String(narratorProfile.summary || '').trim()}` : '',
      String(narratorProfile.stylePrompt || '').trim() ? `文风要求: ${String(narratorProfile.stylePrompt || '').trim()}` : '',
      String(narratorProfile.instructionPrompt || '').trim() ? `叙事约束: ${String(narratorProfile.instructionPrompt || '').trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    : ''

  const userPrompt = [
    '【任务】基于以下世界书与剧情信息，生成“当前场景瞬间”的高质量生图提示词。',
    `【世界书标题】${worldTitle}`,
    worldSummary ? `【世界书概述】${worldSummary}` : '',
    worldEntryText ? `【世界书细节】\n${worldEntryText}` : '',
    narratorText ? `【叙事者风格】\n${narratorText}` : '',
    `【USER 角色信息】\n${userLines}`,
    characterText ? `【CHAR 角色信息】\n${characterText}` : '',
    sceneName ? `【当前场景名】${sceneName}` : '',
    currentLineText ? `【当前剧情句】${currentLineText}` : '',
    recentDialogue ? `【最近剧情上下文（${contextLineCount}条内）】\n${recentDialogue}` : '',
    '请聚焦“此刻画面”，包含镜头语言（远景/中景/特写）、构图、光线、材质细节、情绪氛围。',
    '只返回 JSON：{"positivePrompt":"...","positivePromptZh":"...","negativePrompt":"...","sceneSummary":"..."}。',
    '其中 positivePromptZh 必须是完整中文提示词，便于用户直接修改。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: CG_PROMPT_SYSTEM_PROMPT,
    userPrompt,
    temperature,
    maxTokens,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '场景生图提示词生成失败',
      prompt: null,
    }
  }

  const parsedPrompt = normalizeCgPromptOutput(result.data)
  if (!parsedPrompt) {
    return {
      success: false,
      error: '场景生图提示词解析失败',
      prompt: null,
      data: result.data,
      rawResponse: result.rawResponse,
    }
  }

  return {
    success: true,
    error: null,
    prompt: parsedPrompt,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

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

const BACKPACK_USE_SYSTEM_PROMPT = `你是“背包物品使用结果生成器”。
你的任务是根据物品信息、世界书与当前剧情，生成“使用该物品后的剧情反馈”。

硬性要求：
1) 只输出 JSON 对象，不要 markdown，不要解释。
2) JSON 格式优先：
{"resultText":"...", "consume":true, "quantityDelta":-1, "effectTag":"story", "followupHint":"..."}
3) 字段约束：
- resultText: 必填，中文 20-140 字，描述使用后的即时反馈。
- consume: 必填，布尔值，表示是否消耗一件该物品。
- quantityDelta: 可选，整数，范围 -99 到 99；负数表示减少，正数表示增加，0 表示不变。
- effectTag: 可选，只能是 "story"|"clue"|"unlock"|"heal"|"buff"|"debuff"|"none"。
- followupHint: 可选，中文 0-40 字，用于简短提示下一步。`

const tryParseBackpackUseResult = (rawContent) => {
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

  const resultText = String(
    parsed?.resultText ||
    parsed?.text ||
    parsed?.narration ||
    parsed?.result ||
    '',
  ).trim()

  if (!resultText) return null

  const normalizeBool = (value, fallback = false) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    const lower = String(value || '').trim().toLowerCase()
    if (['true', '1', 'yes', 'y', '是', '消耗', 'consume'].includes(lower)) return true
    if (['false', '0', 'no', 'n', '否', '不消耗', 'keep'].includes(lower)) return false
    return fallback
  }

  const normalizeInt = (value, fallback = 0, min = -99, max = 99) => {
    const parsedInt = Number.parseInt(String(value), 10)
    if (!Number.isFinite(parsedInt)) return fallback
    return Math.max(min, Math.min(max, parsedInt))
  }

  const effectAllowed = new Set(['story', 'clue', 'unlock', 'heal', 'buff', 'debuff', 'none'])
  const effectRaw = String(parsed?.effectTag || parsed?.effect || parsed?.tag || '').trim().toLowerCase()
  const effectTag = effectAllowed.has(effectRaw) ? effectRaw : 'story'

  const consume = normalizeBool(parsed?.consume, false)
  const quantityDelta = normalizeInt(
    parsed?.quantityDelta ?? parsed?.countDelta ?? parsed?.delta ?? (consume ? -1 : 0),
    consume ? -1 : 0,
    -99,
    99,
  )
  const followupHint = String(parsed?.followupHint || parsed?.hint || '').trim()

  return {
    resultText,
    consume,
    quantityDelta,
    effectTag,
    followupHint,
  }
}

export const generateBackpackUseResult = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      result: null,
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const item = params.item && typeof params.item === 'object' ? params.item : null
  const itemName = String(item?.name || '').trim()
  if (!itemName) {
    return {
      success: false,
      error: '物品参数不完整',
      result: null,
    }
  }

  const itemDescription = String(item?.description || item?.detail || item?.summary || '').trim()
  const itemCategory = String(item?.category || item?.type || '').trim()
  const itemTags = Array.isArray(item?.tags)
    ? item.tags
        .map((tag) => String(tag || '').trim())
        .filter(Boolean)
        .slice(0, 8)
    : []
  const itemCount = Math.max(0, Number.parseInt(String(item?.count ?? item?.quantity ?? 1), 10) || 1)

  const dialogueHistory = Array.isArray(params.dialogueHistory) ? params.dialogueHistory : []
  const currentLine = params.currentLine && typeof params.currentLine === 'object' ? params.currentLine : null

  const parseLineCount = (value, fallback) => {
    const parsed = Number.parseInt(String(value), 10)
    if (!Number.isFinite(parsed)) return fallback
    return Math.max(0, Math.min(320, parsed))
  }

  const parseMaxTokens = (value, fallback) => {
    const parsed = Number.parseInt(String(value), 10)
    if (!Number.isFinite(parsed)) return fallback
    return Math.max(128, Math.min(200000, parsed))
  }

  const historyLimit = parseLineCount(params.options?.dialogueLimit, 18)
  const maxTokens = parseMaxTokens(params.options?.maxTokens, 520)
  const recentDialogue = (historyLimit > 0 ? dialogueHistory.slice(-historyLimit) : [])
    .map((line) => `${String(line?.speaker || '旁白')}: ${String(line?.text || '').trim()}`)
    .filter(Boolean)
    .join('\n')

  const worldTitle = String(worldBook?.title || '默认世界书').trim()
  const worldSummary = String(
    worldBook?.summary ||
    worldBook?.entries?.overview ||
    '',
  ).trim()
  const currentLineText = currentLine?.text
    ? `${String(currentLine?.speaker || '旁白')}: ${String(currentLine.text || '').trim()}`
    : ''

  const userPrompt = [
    '【任务】玩家在剧情中使用了一个背包物品，请生成此次使用结果。',
    `【世界书标题】${worldTitle}`,
    worldSummary ? `【世界背景】${worldSummary}` : '',
    `【物品名】${itemName}`,
    itemCategory ? `【物品分类】${itemCategory}` : '',
    itemDescription ? `【物品说明】${itemDescription}` : '',
    itemTags.length > 0 ? `【物品标签】${itemTags.join('、')}` : '',
    `【当前持有数量】${itemCount}`,
    currentLineText ? `【当前剧情句】${currentLineText}` : '',
    recentDialogue ? `【最近剧情】\n${recentDialogue}` : '',
    '请返回 JSON，至少包含 resultText 与 consume。',
    '若物品确实被用掉，consume=true 且 quantityDelta 建议为 -1；若只是展示或无法使用，可 consume=false。',
    'effectTag 仅可选：story/clue/unlock/heal/buff/debuff/none。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: BACKPACK_USE_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.78,
    maxTokens,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '物品使用结果生成失败',
      result: null,
    }
  }

  const parsed = tryParseBackpackUseResult(result.data)
  if (!parsed) {
    return {
      success: false,
      error: '物品使用结果解析失败',
      result: null,
    }
  }

  return {
    success: true,
    error: null,
    result: parsed,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const BRICK_LEVEL_SYSTEM_PROMPT = `你是“打砖块关卡参数生成器”。
你只负责输出一组可被前端直接使用的关卡参数，不要输出解释。

硬性要求：
1) 只输出 JSON 对象，不要 markdown。
2) JSON 格式必须是：
{"rows":6,"cols":10,"density":0.72,"durabilityBias":"normal","pattern":"pyramid","palette":"neon","paddleWidthRatio":0.18,"ballSpeed":340,"lives":3}
3) 字段约束：
- rows: 4-9
- cols: 7-12
- density: 0.35-0.95
- durabilityBias: "soft"|"normal"|"hard"
- pattern: "solid"|"pyramid"|"diamond"|"corridor"|"waves"|"checker"|"stairs"
- palette: "neon"|"sunset"|"ice"|"forest"|"mono"|"retro"
- paddleWidthRatio: 0.12-0.26
- ballSpeed: 240-430
- lives: 2-5
4) 难度需要随关卡序号提升，但不要陡增。`

const clampNumber = (value, min, max, fallback) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

const clampInt = (value, min, max, fallback) =>
  Math.round(clampNumber(value, min, max, fallback))

const tryParseBrickLevelConfig = (rawContent) => {
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

  let parsed = parseJson(candidate)
  if (!parsed || typeof parsed !== 'object') {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      parsed = parseJson(candidate.slice(start, end + 1))
    }
  }
  if (!parsed || typeof parsed !== 'object') return null

  const durabilityAllowed = new Set(['soft', 'normal', 'hard'])
  const patternAllowed = new Set(['solid', 'pyramid', 'diamond', 'corridor', 'waves', 'checker', 'stairs'])
  const paletteAllowed = new Set(['neon', 'sunset', 'ice', 'forest', 'mono', 'retro'])

  const durabilityBias = durabilityAllowed.has(String(parsed.durabilityBias || '').trim())
    ? String(parsed.durabilityBias).trim()
    : 'normal'
  const pattern = patternAllowed.has(String(parsed.pattern || '').trim())
    ? String(parsed.pattern).trim()
    : 'solid'
  const palette = paletteAllowed.has(String(parsed.palette || '').trim())
    ? String(parsed.palette).trim()
    : 'neon'

  return {
    rows: clampInt(parsed.rows, 4, 9, 6),
    cols: clampInt(parsed.cols, 7, 12, 10),
    density: clampNumber(parsed.density, 0.35, 0.95, 0.72),
    durabilityBias,
    pattern,
    palette,
    paddleWidthRatio: clampNumber(parsed.paddleWidthRatio, 0.12, 0.26, 0.18),
    ballSpeed: clampInt(parsed.ballSpeed, 240, 430, 340),
    lives: clampInt(parsed.lives, 2, 5, 3),
  }
}

export const generateHandheldBrickLevel = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      config: null,
    }
  }

  const stage = clampInt(params.stage, 1, 999, 1)
  const difficultyHint = String(params.difficultyHint || '').trim()
  const worldTitle = String(params.worldTitle || '').trim()
  const worldSummary = String(params.worldSummary || '').trim()
  const sceneName = String(params.sceneName || '').trim()

  const userPrompt = [
    `【目标】生成掌机“打砖块”第 ${stage} 关参数 JSON。`,
    difficultyHint ? `【难度倾向】${difficultyHint}` : '',
    worldTitle ? `【世界书标题】${worldTitle}` : '',
    worldSummary ? `【世界背景】${worldSummary}` : '',
    sceneName ? `【当前场景】${sceneName}` : '',
    '要求：节奏逐关提升，可玩性优先，避免极端参数。',
    '只返回 JSON 对象，不要解释。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: BRICK_LEVEL_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.78,
    maxTokens: params.options?.maxTokens ?? 260,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '打砖块关卡参数生成失败',
      config: null,
    }
  }

  const parsed = tryParseBrickLevelConfig(result.data)
  if (!parsed) {
    return {
      success: false,
      error: '打砖块关卡参数解析失败',
      config: null,
    }
  }

  return {
    success: true,
    error: null,
    config: parsed,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const HANDHELD_PET_PROFILE_SYSTEM_PROMPT = `你是“掌机像素宠物领养生成器”。
你的任务是输出一个可爱的宠物设定，用于游戏内领养。

硬性要求：
1) 只输出 JSON 对象，不要 markdown，不要解释。
2) JSON 格式必须是：
{"name":"宠物名","species":"slime","title":"称号","personality":"性格描述","colorTheme":"mint","favoriteFood":"最爱食物","openingLine":"初次见面台词"}
3) 字段约束：
- name: 2-8 字中文昵称，避免生僻字。
- species: 只能是 "cat"|"dog"|"fox"|"rabbit"|"slime"|"dragon"。
- title: 4-14 字，像宠物卡片称号。
- personality: 8-24 字，简洁自然。
- colorTheme: 只能是 "mint"|"peach"|"sky"|"violet"|"lime"。
- favoriteFood: 2-10 字。
- openingLine: 10-40 字，像宠物开口说的话。`

const HANDHELD_PET_REPLY_SYSTEM_PROMPT = `你是“掌机像素宠物互动回复生成器”。
你只负责生成宠物的一句中文互动台词。

硬性要求：
1) 只输出 JSON 对象，不要 markdown，不要解释。
2) JSON 格式优先：{"line":"..."}。
3) line 要口语化、可爱、符合宠物设定，长度 8-36 字。
4) 不要出现“作为AI”等元话术。`

const parseFirstJsonObject = (rawContent) => {
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

  let parsed = parseJson(candidate)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed

  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) {
    parsed = parseJson(candidate.slice(start, end + 1))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed
    }
  }

  return null
}

const PET_SPECIES_SET = new Set(['cat', 'dog', 'fox', 'rabbit', 'slime', 'dragon'])
const PET_COLOR_THEME_SET = new Set(['mint', 'peach', 'sky', 'violet', 'lime'])

const normalizeHandheldPetProfile = (rawValue) => {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null

  const normalizeText = (value, fallback, maxLen = 40) => {
    const text = String(value || '').trim().slice(0, maxLen)
    return text || fallback
  }

  const name = normalizeText(rawValue.name, '小团子', 10)
  const speciesRaw = String(rawValue.species || '').trim().toLowerCase()
  const colorRaw = String(rawValue.colorTheme || rawValue.color || '').trim().toLowerCase()

  return {
    name,
    species: PET_SPECIES_SET.has(speciesRaw) ? speciesRaw : 'slime',
    title: normalizeText(rawValue.title, '口袋小伙伴', 20),
    personality: normalizeText(rawValue.personality, '黏人、好奇、爱冒险', 36),
    colorTheme: PET_COLOR_THEME_SET.has(colorRaw) ? colorRaw : 'mint',
    favoriteFood: normalizeText(rawValue.favoriteFood, '宠物饼干', 14),
    openingLine: normalizeText(rawValue.openingLine, `${name} 来啦，今天也要一起冒险吗？`, 48),
  }
}

const normalizeHandheldPetReplyLine = (rawContent) => {
  const parsed = parseFirstJsonObject(rawContent)
  const lineFromJson = String(parsed?.line || parsed?.text || parsed?.reply || parsed?.content || '').trim()
  if (lineFromJson) return lineFromJson.slice(0, 64)

  const plain = String(rawContent || '')
    .replace(/\r/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!plain) return ''
  return plain.slice(0, 64)
}

export const generateHandheldPetProfile = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      profile: null,
    }
  }

  const worldTitle = String(params.worldTitle || '').trim()
  const worldSummary = String(params.worldSummary || '').trim()
  const sceneName = String(params.sceneName || '').trim()
  const preferredSpecies = String(params.preferredSpecies || '').trim().toLowerCase()
  const adoptionHint = String(params.adoptionHint || '').trim()

  const userPrompt = [
    '【任务】请生成一只可领养的掌机像素宠物设定。',
    worldTitle ? `【世界书标题】${worldTitle}` : '',
    worldSummary ? `【世界背景】${worldSummary}` : '',
    sceneName ? `【当前场景】${sceneName}` : '',
    preferredSpecies && PET_SPECIES_SET.has(preferredSpecies) ? `【偏好物种】${preferredSpecies}` : '',
    adoptionHint ? `【玩家期望】${adoptionHint}` : '',
    '要求：风格可爱，适配口袋掌机。',
    '只返回 JSON 对象。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: HANDHELD_PET_PROFILE_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.9,
    maxTokens: params.options?.maxTokens ?? 280,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '宠物领养生成失败',
      profile: null,
    }
  }

  const parsed = normalizeHandheldPetProfile(parseFirstJsonObject(result.data))
  if (!parsed) {
    return {
      success: false,
      error: '宠物设定解析失败',
      profile: null,
    }
  }

  return {
    success: true,
    error: null,
    profile: parsed,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

export const generateHandheldPetReply = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      line: '',
    }
  }

  const petProfile = params.petProfile && typeof params.petProfile === 'object' ? params.petProfile : null
  const petName = String(petProfile?.name || '小团子').trim()
  const action = String(params.action || 'idle').trim()
  const actionTextMap = {
    feed: '喂食',
    pet: '摸摸',
    buy_food: '购买食物',
    idle: '闲聊',
  }
  const actionText = actionTextMap[action] || action

  const stats = params.stats && typeof params.stats === 'object' ? params.stats : {}
  const mood = clampInt(stats.mood, 0, 100, 60)
  const hunger = clampInt(stats.hunger, 0, 100, 58)
  const affection = clampInt(stats.affection, 0, 100, 55)
  const energy = clampInt(stats.energy, 0, 100, 68)
  const food = Math.max(0, clampInt(stats.food, 0, 999, 0))
  const coins = Math.max(0, clampInt(stats.coins, 0, 999999, 0))

  const userPrompt = [
    '【任务】请生成宠物的一句互动台词。',
    `【宠物名】${petName}`,
    petProfile?.species ? `【物种】${String(petProfile.species).trim()}` : '',
    petProfile?.title ? `【称号】${String(petProfile.title).trim()}` : '',
    petProfile?.personality ? `【性格】${String(petProfile.personality).trim()}` : '',
    petProfile?.favoriteFood ? `【最爱食物】${String(petProfile.favoriteFood).trim()}` : '',
    `【本次互动】${actionText}`,
    `【状态】心情${mood} 饱腹${hunger} 好感${affection} 体力${energy} 食物${food} 金币${coins}`,
    '请只输出 JSON：{"line":"宠物台词"}',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: HANDHELD_PET_REPLY_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.88,
    maxTokens: params.options?.maxTokens ?? 140,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '宠物回复生成失败',
      line: '',
    }
  }

  const line = normalizeHandheldPetReplyLine(result.data)
  if (!line) {
    return {
      success: false,
      error: '宠物回复解析失败',
      line: '',
    }
  }

  return {
    success: true,
    error: null,
    line,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const HANDHELD_DUNGEON_SCENE_SYSTEM_PROMPT = `你是“掌机RPG地下城内容生成器”。
你只负责输出一个可被前端直接解析的 JSON 对象，不要输出解释，不要输出 markdown。

输出格式：
{
  "eventType":"battle",
  "title":"...",
  "description":"...",
  "enemy":{
    "name":"...",
    "rarity":"R",
    "hp":120,
    "attack":28,
    "rewardCoins":120,
    "rewardGems":24
  },
  "loot":{
    "name":"...",
    "rarity":"SR",
    "slot":"weapon",
    "atk":18,
    "def":0,
    "hp":6,
    "desc":"..."
  },
  "banterHint":"..."
}

约束：
1) eventType 只能是 "battle"|"boss"|"rest"|"treasure"
2) 当 eventType 为 "battle" 或 "boss" 时必须给出 enemy；其余可置空
3) rarity 只能是 "R"|"SR"|"SSR"
4) slot 只能是 "weapon"|"armor"|"relic"
5) 文案简短，适合掌机屏幕阅读`

const HANDHELD_DUNGEON_BANTER_SYSTEM_PROMPT = `你是“掌机RPG队友吐槽台词生成器”。
你只输出一条短台词 JSON，不要解释，不要 markdown。
格式：{"line":"..."}
要求：
1) line 长度 8-36 字
2) 口语化，有轻度吐槽感
3) 不要出现“作为AI”等元话术`

const HANDHELD_CAMPFIRE_COMPANION_MAX = 60

const HANDHELD_CAMPFIRE_COMPANION_SYSTEM_PROMPT = `你是“掌机RPG篝火角色像素风设定生成器”。
你只输出 JSON 对象，不要解释，不要 markdown。

输出格式：
{
  "companions":[
    {
      "name":"角色名",
      "role":"骑士",
      "style":"knight",
      "palette":"ember",
      "action":"warm_hands",
      "line":"简短动作说明"
    }
  ]
}

硬性约束：
1) companions 数组长度必须与请求人数一致（至少 1，最多 60）。
2) role 必填，2-12 字；不要局限固定职业名，要依据角色背景、身份、性格自动命名（例如“遗迹译码师”“夜巡斥候”“灰烬祝祷者”）。
3) style 只能是 "knight"|"mage"|"ranger"|"rogue"|"priest"|"alchemist"。
4) palette 只能是 "ember"|"forest"|"sky"|"violet"|"sand"|"iron"。
5) action 只能是 "idle"|"warm_hands"|"sharpen_blade"|"lookout"|"stretch"|"cheer"。
6) line 6-24 字，描述此角色在篝火旁的小动作与状态。
7) 角色之间不要风格重复过多，整体有队伍感。
8) 输入候选含“外观与设定”描述时，必须据此映射 role/style/palette/action（例如职业装束、配色、武器习惯、气质动作）。
9) name 优先使用候选原名，不要擅自改名。`

const DUNGEON_EVENT_TYPE_SET = new Set(['battle', 'boss', 'rest', 'treasure'])
const DUNGEON_RARITY_SET = new Set(['R', 'SR', 'SSR'])
const DUNGEON_SLOT_SET = new Set(['weapon', 'armor', 'relic'])
const CAMPFIRE_STYLE_SET = new Set(['knight', 'mage', 'ranger', 'rogue', 'priest', 'alchemist'])
const CAMPFIRE_PALETTE_SET = new Set(['ember', 'forest', 'sky', 'violet', 'sand', 'iron'])
const CAMPFIRE_ACTION_SET = new Set(['idle', 'warm_hands', 'sharpen_blade', 'lookout', 'stretch', 'cheer'])
const CAMPFIRE_ROLE_FALLBACK_LIST = ['守护者', '侦察员', '施法者', '炼金师', '机关师', '驯兽师']
const DUNGEON_MAP_TILE_TYPE_SET = new Set(['monster', 'boss', 'treasure', 'empty'])

const normalizeDungeonSceneEventType = (value, fallback = 'battle') => {
  const eventType = String(value || '').trim().toLowerCase()
  return DUNGEON_EVENT_TYPE_SET.has(eventType) ? eventType : fallback
}

const normalizeDungeonSceneRarity = (value, fallback = 'R') => {
  const rarity = String(value || '').trim().toUpperCase()
  return DUNGEON_RARITY_SET.has(rarity) ? rarity : fallback
}

const normalizeDungeonSceneSlot = (value, fallback = 'weapon') => {
  const slot = String(value || '').trim().toLowerCase()
  return DUNGEON_SLOT_SET.has(slot) ? slot : fallback
}

const normalizeClassicClassRole = (value, index = 0, hintText = '') => {
  const raw = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 24)
  if (raw) return raw
  const hint = String(hintText || '').replace(/\s+/g, ' ').trim().slice(0, 180)
  if (hint) {
    const picked = hint
      .split(/[|；;，,。]/)
      .map((item) => String(item || '').trim().slice(0, 12))
      .find((item) => item.length >= 2)
    if (picked) return picked
  }
  return CAMPFIRE_ROLE_FALLBACK_LIST[index % CAMPFIRE_ROLE_FALLBACK_LIST.length]
}

const normalizeHandheldDungeonScene = (rawValue, options = {}) => {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null

  const floor = clampInt(options.floor, 1, 999, 1)
  const eventTypeHint = normalizeDungeonSceneEventType(options.eventTypeHint, floor % 5 === 0 ? 'boss' : 'battle')
  const eventType = normalizeDungeonSceneEventType(rawValue.eventType, eventTypeHint)

  const title = String(rawValue.title || '').trim().slice(0, 36) || `地下城第 ${floor} 层`
  const description = String(rawValue.description || '').trim().slice(0, 96) || `${title}，继续推进。`
  const banterHint = String(rawValue.banterHint || '').trim().slice(0, 60)

  let enemy = null
  if (eventType === 'battle' || eventType === 'boss') {
    const enemyRaw = rawValue.enemy && typeof rawValue.enemy === 'object' ? rawValue.enemy : {}
    const isBoss = eventType === 'boss'
    enemy = {
      name: String(enemyRaw.name || (isBoss ? '深渊守门者' : '地窟魔物')).trim().slice(0, 20) || (isBoss ? '深渊守门者' : '地窟魔物'),
      rarity: normalizeDungeonSceneRarity(enemyRaw.rarity, isBoss ? 'SSR' : floor >= 9 ? 'SR' : 'R'),
      hp: clampInt(enemyRaw.hp, 20, 4000, (isBoss ? 180 : 90) + floor * (isBoss ? 16 : 9)),
      attack: clampInt(enemyRaw.attack, 8, 600, (isBoss ? 36 : 18) + floor * (isBoss ? 3 : 2)),
      rewardCoins: clampInt(enemyRaw.rewardCoins, 1, 99999, floor * (isBoss ? 62 : 24)),
      rewardGems: clampInt(enemyRaw.rewardGems, 1, 99999, floor * (isBoss ? 20 : 6)),
    }
  }

  let loot = null
  if (rawValue.loot && typeof rawValue.loot === 'object' && !Array.isArray(rawValue.loot)) {
    const lootName = String(rawValue.loot.name || '').trim().slice(0, 18)
    if (lootName) {
      loot = {
        name: lootName,
        rarity: normalizeDungeonSceneRarity(rawValue.loot.rarity, 'R'),
        slot: normalizeDungeonSceneSlot(rawValue.loot.slot, 'weapon'),
        atk: clampInt(rawValue.loot.atk, 0, 160, 0),
        def: clampInt(rawValue.loot.def, 0, 160, 0),
        hp: clampInt(rawValue.loot.hp, 0, 320, 0),
        desc: String(rawValue.loot.desc || '').trim().slice(0, 36),
      }
    }
  }

  return {
    eventType,
    title,
    description,
    enemy,
    loot,
    banterHint,
  }
}

const normalizeHandheldDungeonBanterLine = (rawContent) => {
  const parsed = parseFirstJsonObject(rawContent)
  const fromJson = String(parsed?.line || parsed?.text || parsed?.reply || '').trim()
  if (fromJson) return fromJson.slice(0, 64)

  const plain = String(rawContent || '')
    .replace(/\r/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!plain) return ''
  return plain.slice(0, 64)
}

const normalizeHandheldCampfireCompanions = (rawValue, fallbackNames = [], fallbackRoles = []) => {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null
  const rawList = Array.isArray(rawValue.companions) ? rawValue.companions : null
  if (!rawList || rawList.length === 0) return null

  const styleFallback = ['knight', 'mage', 'ranger', 'rogue', 'priest', 'alchemist']
  const paletteFallback = ['ember', 'forest', 'sky', 'violet', 'sand', 'iron']
  const actionFallback = ['warm_hands', 'idle', 'lookout', 'stretch', 'sharpen_blade', 'cheer']

  const list = rawList
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null
      const fallbackName = String(fallbackNames[index] || `营地伙伴${index + 1}`).trim().slice(0, 12) || `营地伙伴${index + 1}`
      const name = String(item.name || fallbackName).trim().slice(0, 12) || fallbackName
      const styleRaw = String(item.style || '').trim().toLowerCase()
      const paletteRaw = String(item.palette || item.color || '').trim().toLowerCase()
      const actionRaw = String(item.action || '').trim().toLowerCase()
      const line = String(item.line || item.pose || item.note || '').trim().slice(0, 32)
      const roleHint = fallbackRoles[index] || item.hint || line
      return {
        id: `camp-${index + 1}`,
        name,
        role: normalizeClassicClassRole(item.role, index, roleHint),
        style: CAMPFIRE_STYLE_SET.has(styleRaw) ? styleRaw : styleFallback[index % styleFallback.length],
        palette: CAMPFIRE_PALETTE_SET.has(paletteRaw) ? paletteRaw : paletteFallback[index % paletteFallback.length],
        action: CAMPFIRE_ACTION_SET.has(actionRaw) ? actionRaw : actionFallback[index % actionFallback.length],
        line,
      }
    })
    .filter(Boolean)
    .slice(0, HANDHELD_CAMPFIRE_COMPANION_MAX)

  if (list.length < 1) return null
  return list
}

const HANDHELD_DUNGEON_MAP_SYSTEM_PROMPT = `你是“掌机RPG地下城网格生成器”。
你只输出 JSON 对象，不要解释，不要 markdown。

输出格式：
{
  "theme":"地下城主题名",
  "width":7,
  "height":6,
  "start":{"x":0,"y":5},
  "exit":{"x":6,"y":0},
  "tiles":[
    {
      "x":2,
      "y":4,
      "type":"monster",
      "enemy":{
        "name":"腐骨战兵",
        "hp":180,
        "attack":26,
        "drops":[
          {"name":"小型回复瓶","effectType":"heal_hp","target":"ally","value":20,"amount":1,"desc":"恢复20点生命"}
        ]
      },
      "reward":{"coins":120,"gems":28,"exp":64,"equipmentChance":0.22}
    },
    {
      "x":4,
      "y":1,
      "type":"boss",
      "enemy":{
        "name":"断刃督军",
        "hp":560,
        "attack":52,
        "drops":[
          {"name":"王者回复药","effectType":"heal_hp","target":"ally","value":48,"amount":1,"desc":"恢复48点生命"}
        ]
      },
      "reward":{"coins":420,"gems":120,"exp":220,"equipmentChance":0.58}
    },
    {
      "x":1,
      "y":2,
      "type":"treasure",
      "reward":{"coins":150,"gems":36,"exp":50,"equipmentChance":0.2}
    }
  ]
}

硬性约束：
1) width/height 均为 5-9 的整数。
2) start/exit 必须在地图内，且不能重叠。
3) tiles 只能包含 type: "monster"|"boss"|"treasure"|"empty"。
4) 每层必须同时有 boss 与 monster，且至少 2 个 boss、6 个 monster。
5) 同一坐标最多 1 个 tile；不要占用 start/exit。
6) monster/boss 必须包含 enemy + reward；treasure 至少包含 reward。
7) enemy 必须包含 drops 数组，至少 1 条掉落；每条掉落含 name/effectType/target/value/amount/desc。
8) effectType 仅使用 "heal_hp"，target 仅使用 "ally"。
9) reward 的 equipmentChance 为 0-1 浮点数。
10) 数值要与楼层递增相关，但不要夸张。`

const normalizeDungeonMapTileType = (value, fallback = 'empty') => {
  const type = String(value || '').trim().toLowerCase()
  return DUNGEON_MAP_TILE_TYPE_SET.has(type) ? type : fallback
}

const parseDungeonMapSizeHint = (value) => {
  const text = String(value || '').trim()
  const matched = text.match(/(\d+)\s*[-~xX]\s*(\d+)/)
  if (!matched) {
    return { minSize: 5, maxSize: 9 }
  }
  const first = clampInt(matched[1], 5, 9, 5)
  const second = clampInt(matched[2], 5, 9, 9)
  return {
    minSize: Math.min(first, second),
    maxSize: Math.max(first, second),
  }
}

const normalizeHandheldDungeonMap = (rawValue, options = {}) => {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null

  const floor = clampInt(options.floor, 1, 999, 1)
  const sizeHint = parseDungeonMapSizeHint(options.sizeHint)
  const width = clampInt(
    rawValue.width ?? rawValue.cols ?? rawValue.size,
    sizeHint.minSize,
    sizeHint.maxSize,
    Math.min(sizeHint.maxSize, Math.max(sizeHint.minSize, 6)),
  )
  const height = clampInt(
    rawValue.height ?? rawValue.rows ?? rawValue.size,
    sizeHint.minSize,
    sizeHint.maxSize,
    Math.min(sizeHint.maxSize, Math.max(sizeHint.minSize, 6)),
  )

  const theme = String(rawValue.theme || rawValue.style || '迷宫遗迹').trim().slice(0, 28) || '迷宫遗迹'
  const startX = clampInt(rawValue?.start?.x, 0, width - 1, 0)
  const startY = clampInt(rawValue?.start?.y, 0, height - 1, height - 1)
  const exitX = clampInt(rawValue?.exit?.x, 0, width - 1, width - 1)
  const exitY = clampInt(rawValue?.exit?.y, 0, height - 1, 0)
  const fallbackExitX = startX === width - 1 && startY === 0 ? 0 : width - 1
  const fallbackExitY = startX === width - 1 && startY === 0 ? height - 1 : 0
  const exit = startX === exitX && startY === exitY
    ? { x: fallbackExitX, y: fallbackExitY }
    : { x: exitX, y: exitY }

  const used = new Set([`${startX}:${startY}`, `${exit.x}:${exit.y}`])
  const tiles = []
  const monsterNames = ['洞窟狼', '骸骨兵', '腐沼蜥', '巡逻石像', '暗影潜伏者', '裂隙蠕虫']
  const bossNames = ['灰烬领主', '深井守门者', '幽冥主教', '巨械监工', '碎星骑士', '虚影女王']
  const monsterDropNames = ['小型回复瓶', '应急绷带', '草本药剂', '止痛药水']
  const bossDropNames = ['王者回复药', '圣愈药剂', '战地急救包', '炽焰回生药']

  const normalizeDrop = (rawDrop, isBoss = false, index = 0) => {
    const drop = rawDrop && typeof rawDrop === 'object' ? rawDrop : {}
    const fallbackValue = isBoss ? Math.round(42 + floor * 3) : Math.round(18 + floor * 2)
    const fallbackName = isBoss ? bossDropNames[index % bossDropNames.length] : monsterDropNames[index % monsterDropNames.length]
    const effectTypeRaw = String(drop.effectType || drop.type || drop.effect || '').trim().toLowerCase()
    const effectType = effectTypeRaw === 'heal_hp' ? 'heal_hp' : 'heal_hp'
    const targetRaw = String(drop.target || drop.targetType || '').trim().toLowerCase()
    const target = targetRaw === 'ally' ? 'ally' : 'ally'
    const value = clampInt(drop.value ?? drop.effectValue ?? drop.hp, 1, 9999, fallbackValue)
    const amount = clampInt(drop.amount ?? drop.count ?? drop.quantity, 1, 99, 1)
    const name = String(drop.name || fallbackName).trim().slice(0, 24) || fallbackName
    const desc = String(drop.desc || drop.description || `恢复${value}点生命`).trim().slice(0, 40) || `恢复${value}点生命`
    return {
      name,
      effectType,
      target,
      value,
      amount,
      desc,
    }
  }

  const normalizeEnemy = (rawEnemy, isBoss = false, index = 0) => {
    const enemy = rawEnemy && typeof rawEnemy === 'object' ? rawEnemy : {}
    const fallbackName = isBoss
      ? `${bossNames[index % bossNames.length]}`
      : `${monsterNames[index % monsterNames.length]}`
    const rawDrops = Array.isArray(enemy.drops)
      ? enemy.drops
      : (Array.isArray(enemy.dropItems) ? enemy.dropItems : [])
    const drops = (rawDrops.length > 0 ? rawDrops : [null])
      .map((item, dropIndex) => normalizeDrop(item, isBoss, index + dropIndex))
      .slice(0, 3)
    return {
      name: String(enemy.name || fallbackName).trim().slice(0, 24) || fallbackName,
      hp: clampInt(enemy.hp, 20, 999999, Math.round((isBoss ? 230 : 108) + floor * (isBoss ? 40 : 20))),
      attack: clampInt(enemy.attack, 6, 99999, Math.round((isBoss ? 34 : 17) + floor * (isBoss ? 4 : 2))),
      drops,
    }
  }

  const normalizeReward = (rawReward, isBoss = false) => {
    const reward = rawReward && typeof rawReward === 'object' ? rawReward : {}
    const chanceRaw = Number.parseFloat(String(reward.equipmentChance))
    return {
      coins: clampInt(reward.coins, 0, 999999, Math.round((isBoss ? 280 : 86) + floor * (isBoss ? 54 : 16))),
      gems: clampInt(reward.gems, 0, 999999, Math.round((isBoss ? 90 : 24) + floor * (isBoss ? 10 : 4))),
      exp: clampInt(reward.exp, 0, 999999, Math.round((isBoss ? 136 : 42) + floor * (isBoss ? 30 : 10))),
      equipmentChance: Number.isFinite(chanceRaw)
        ? Math.max(0, Math.min(1, chanceRaw))
        : (isBoss ? 0.56 : 0.2),
    }
  }

  const pushTile = (x, y, type, payload = {}) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    if (x < 0 || y < 0 || x >= width || y >= height) return false
    const key = `${x}:${y}`
    if (used.has(key)) return false
    used.add(key)
    tiles.push({
      x,
      y,
      type,
      ...payload,
    })
    return true
  }

  const rawTiles = Array.isArray(rawValue.tiles) ? rawValue.tiles : []
  let monsterCount = 0
  let bossCount = 0
  let treasureCount = 0

  for (const item of rawTiles) {
    const x = clampInt(item?.x, 0, width - 1, Number.NaN)
    const y = clampInt(item?.y, 0, height - 1, Number.NaN)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const type = normalizeDungeonMapTileType(item?.type, 'empty')
    if (type === 'boss') {
      const added = pushTile(x, y, type, {
        enemy: normalizeEnemy(item?.enemy, true, bossCount),
        reward: normalizeReward(item?.reward, true),
      })
      if (added) bossCount += 1
      continue
    }
    if (type === 'monster') {
      const added = pushTile(x, y, type, {
        enemy: normalizeEnemy(item?.enemy, false, monsterCount),
        reward: normalizeReward(item?.reward, false),
      })
      if (added) monsterCount += 1
      continue
    }
    if (type === 'treasure') {
      const added = pushTile(x, y, type, {
        reward: normalizeReward(item?.reward, false),
      })
      if (added) treasureCount += 1
      continue
    }
  }

  const pickFreePos = () => {
    const maxTry = width * height * 3
    for (let index = 0; index < maxTry; index += 1) {
      const x = clampInt(Math.random() * width, 0, width - 1, 0)
      const y = clampInt(Math.random() * height, 0, height - 1, 0)
      const key = `${x}:${y}`
      if (used.has(key)) continue
      return { x, y }
    }
    return null
  }

  const minBoss = Math.max(2, Math.min(3, Math.round(width * height * 0.08)))
  const minMonster = Math.max(6, Math.min(18, Math.round(width * height * 0.3)))
  const targetTreasure = Math.max(2, Math.min(7, Math.round(width * height * 0.1)))

  while (bossCount < minBoss) {
    const pos = pickFreePos()
    if (!pos) break
    const added = pushTile(pos.x, pos.y, 'boss', {
      enemy: normalizeEnemy(null, true, bossCount),
      reward: normalizeReward(null, true),
    })
    if (!added) break
    bossCount += 1
  }

  while (monsterCount < minMonster) {
    const pos = pickFreePos()
    if (!pos) break
    const added = pushTile(pos.x, pos.y, 'monster', {
      enemy: normalizeEnemy(null, false, monsterCount),
      reward: normalizeReward(null, false),
    })
    if (!added) break
    monsterCount += 1
  }

  while (treasureCount < targetTreasure) {
    const pos = pickFreePos()
    if (!pos) break
    const added = pushTile(pos.x, pos.y, 'treasure', {
      reward: normalizeReward(null, false),
    })
    if (!added) break
    treasureCount += 1
  }

  return {
    id: String(rawValue.id || `dungeon-map-f${floor}`).trim().slice(0, 80) || `dungeon-map-f${floor}`,
    floor,
    theme,
    width,
    height,
    start: { x: startX, y: startY },
    exit,
    player: { x: startX, y: startY },
    tiles,
  }
}

export const generateHandheldDungeonMap = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      map: null,
    }
  }

  const floor = clampInt(params.floor, 1, 999, 1)
  const worldTitle = String(params.worldTitle || '').trim()
  const worldSummary = String(params.worldSummary || '').trim()
  const partySummary = String(params.partySummary || '').trim()
  const sizeHint = String(params.sizeHint || '5-9').trim()

  const userPrompt = [
    '【任务】生成掌机 RPG 地下城网格地图 JSON。',
    `【楼层】${floor}`,
    `【地图尺寸范围】${sizeHint}`,
    worldTitle ? `【世界书标题】${worldTitle}` : '',
    worldSummary ? `【世界背景】${worldSummary}` : '',
    partySummary ? `【队伍】${partySummary}` : '',
    '要求：给出随机主题、地图尺寸、小怪/Boss、血量、奖励配置；每层必须同时有 Boss 和小怪；每个怪都必须给 drops（至少1项，可直接用于背包消耗品）；可玩性优先，数值随楼层递增。',
    '只返回 JSON 对象。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: HANDHELD_DUNGEON_MAP_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.9,
    maxTokens: params.options?.maxTokens ?? 980,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '地下城地图生成失败',
      map: null,
    }
  }

  const parsed = normalizeHandheldDungeonMap(parseFirstJsonObject(result.data), {
    floor,
    sizeHint,
  })
  if (!parsed) {
    return {
      success: false,
      error: '地下城地图解析失败',
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

export const generateHandheldDungeonScene = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      scene: null,
    }
  }

  const floor = clampInt(params.floor, 1, 999, 1)
  const eventTypeHint = normalizeDungeonSceneEventType(params.eventTypeHint, floor % 5 === 0 ? 'boss' : 'battle')
  const worldTitle = String(params.worldTitle || '').trim()
  const worldSummary = String(params.worldSummary || '').trim()
  const sceneName = String(params.sceneName || '').trim()
  const partySummary = String(params.partySummary || '').trim()

  const userPrompt = [
    '【任务】生成掌机 RPG 地下城的单次事件 JSON。',
    `【楼层】${floor}`,
    `【事件倾向】${eventTypeHint}`,
    worldTitle ? `【世界书标题】${worldTitle}` : '',
    worldSummary ? `【世界背景】${worldSummary}` : '',
    sceneName ? `【当前场景】${sceneName}` : '',
    partySummary ? `【队伍】${partySummary}` : '',
    '要求：短文本，可玩性优先，数值不要离谱。',
    '只返回 JSON 对象。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: HANDHELD_DUNGEON_SCENE_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.84,
    maxTokens: params.options?.maxTokens ?? 360,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '地下城事件生成失败',
      scene: null,
    }
  }

  const parsed = normalizeHandheldDungeonScene(parseFirstJsonObject(result.data), { floor, eventTypeHint })
  if (!parsed) {
    return {
      success: false,
      error: '地下城事件解析失败',
      scene: null,
    }
  }

  return {
    success: true,
    error: null,
    scene: parsed,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

export const generateHandheldDungeonBanter = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      line: '',
    }
  }

  const teammateName = String(params.teammateName || '队友').trim() || '队友'
  const teammateRole = String(params.teammateRole || '冒险者').trim()
  const teammateRarity = normalizeDungeonSceneRarity(params.teammateRarity, 'R')
  const floor = clampInt(params.floor, 1, 999, 1)
  const scene = String(params.scene || '').trim().slice(0, 40)
  const moodHint = String(params.moodHint || '').trim().slice(0, 36)

  const userPrompt = [
    '【任务】生成一条队友吐槽台词。',
    `【队友】${teammateName}`,
    `【职业】${teammateRole || '冒险者'}`,
    `【稀有度】${teammateRarity}`,
    `【楼层】${floor}`,
    scene ? `【当前场景】${scene}` : '',
    moodHint ? `【语气提示】${moodHint}` : '',
    '请只输出 JSON：{"line":"..."}',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: HANDHELD_DUNGEON_BANTER_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.9,
    maxTokens: params.options?.maxTokens ?? 120,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '队友吐槽生成失败',
      line: '',
    }
  }

  const line = normalizeHandheldDungeonBanterLine(result.data)
  if (!line) {
    return {
      success: false,
      error: '队友吐槽解析失败',
      line: '',
    }
  }

  return {
    success: true,
    error: null,
    line,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

export const generateHandheldCampfireCompanions = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      companions: [],
    }
  }

  const worldTitle = String(params.worldTitle || '').trim()
  const worldSummary = String(params.worldSummary || '').trim()
  const hints = Array.isArray(params.characterHints)
    ? params.characterHints
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, HANDHELD_CAMPFIRE_COMPANION_MAX)
    : []
  const companionCount = clampInt(
    params.companionCount,
    1,
    HANDHELD_CAMPFIRE_COMPANION_MAX,
    Math.min(HANDHELD_CAMPFIRE_COMPANION_MAX, Math.max(1, hints.length || 4)),
  )

  const userPrompt = [
    '【任务】为掌机 RPG 的篝火首页生成像素风角色小队设定 JSON。',
    worldTitle ? `【世界书标题】${worldTitle}` : '',
    worldSummary ? `【世界背景】${worldSummary}` : '',
    hints.length > 0 ? `【角色候选】${hints.join('；')}` : '',
    hints.length > 0 ? '【候选格式】名字|身份|外观与设定提示（请强依赖外观描述映射风格与动作）' : '',
    `【人数】${companionCount}`,
    '每名角色必须返回 role，且要根据角色背景/身份/性格自动命名职业，不要套固定职业列表。',
    'companions 数组长度必须严格等于人数。',
    '请直接输出 JSON 对象，不要补充解释。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: HANDHELD_CAMPFIRE_COMPANION_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.82,
    maxTokens: params.options?.maxTokens ?? 380,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '篝火角色设定生成失败',
      companions: [],
    }
  }

  const fallbackNames = hints
    .map((item) => {
      const name = String(item.split('|')[0] || '').trim()
      return name.slice(0, 12)
    })
    .filter(Boolean)
    .slice(0, companionCount)

  const fallbackRoles = hints
    .map((item, index) => {
      const rawRole = String(item.split('|')[1] || '').trim()
      return normalizeClassicClassRole(rawRole, index, item)
    })
    .slice(0, companionCount)

  const parsed = normalizeHandheldCampfireCompanions(parseFirstJsonObject(result.data), fallbackNames, fallbackRoles)
  if (!parsed) {
    return {
      success: false,
      error: '篝火角色设定解析失败',
      companions: [],
    }
  }

  return {
    success: true,
    error: null,
    companions: parsed,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

const WORLDBOOK_OPENING_SYSTEM_PROMPT = `你是“AVG世界书开场对白生成器”。
你只输出 JSON，不要输出 markdown，不要解释。

输出格式必须是：
{
  "openingDialogue": [
    { "speaker": "旁白", "text": "......", "emotion": null },
    { "speaker": "角色名", "text": "......", "emotion": "neutral" }
  ]
}

硬性要求：
1) openingDialogue 必须是 10-15 条。
2) 每条必须包含 speaker 与 text；emotion 可为 null 或常见情绪英文词（如 neutral/happy/worried/angry/sad/excited/confident）。
3) 文本为中文自然叙事，单条建议 12-80 字。
4) 对白必须显著依赖给定世界书（世界观、角色、user设定），不能写成通用模板。
5) 不要包含多余字段，不要输出 JSON 以外的任何内容。`

const parseFirstJsonArray = (rawContent) => {
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

  let parsed = parseJson(candidate)
  if (Array.isArray(parsed)) return parsed

  const start = candidate.indexOf('[')
  const end = candidate.lastIndexOf(']')
  if (start >= 0 && end > start) {
    parsed = parseJson(candidate.slice(start, end + 1))
    if (Array.isArray(parsed)) {
      return parsed
    }
  }

  return null
}

const normalizeWorldBookOpeningDialogue = (rawValue, options = {}) => {
  const minLines = clampInt(options.minLines, 1, 50, 10)
  const maxLines = clampInt(options.maxLines, minLines, 80, 15)
  const sourceList = Array.isArray(rawValue)
    ? rawValue
    : (Array.isArray(rawValue?.openingDialogue) ? rawValue.openingDialogue : [])
  const normalized = sourceList
    .map((line) => ({
      speaker: String(line?.speaker || '旁白').trim() || '旁白',
      text: String(line?.text || '').trim(),
      emotion: line?.emotion || null,
    }))
    .filter((line) => line.text)
    .slice(0, maxLines)

  if (normalized.length < minLines) {
    return null
  }

  return normalized
}

export const generateWorldBookOpeningDialogue = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      openingDialogue: [],
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : {}
  const minLines = clampInt(params.minLines, 10, 15, 10)
  const maxLines = clampInt(params.maxLines, minLines, 15, 15)
  const worldTitle = String(worldBook?.title || params.worldTitle || '未命名世界书').trim()
  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const worldEntries = worldBook?.entries && typeof worldBook.entries === 'object' ? worldBook.entries : {}
  const entryLines = Object.entries(worldEntries)
    .map(([key, value]) => {
      const text = String(value || '').trim()
      if (!text) return ''
      return `- ${String(key)}: ${text}`
    })
    .filter(Boolean)
    .slice(0, 12)

  const userProfile = worldBook?.userProfile && typeof worldBook.userProfile === 'object'
    ? worldBook.userProfile
    : {}
  const userProfileLines = [
    `名字: ${String(userProfile.name || userProfile.nickname || '你').trim() || '你'}`,
    String(userProfile.identity || '').trim() ? `身份: ${String(userProfile.identity).trim()}` : '',
    String(userProfile.appearance || '').trim() ? `外表: ${String(userProfile.appearance).trim()}` : '',
    String(userProfile.background || '').trim() ? `背景: ${String(userProfile.background).trim()}` : '',
  ]
    .filter(Boolean)
    .slice(0, 6)

  const characterLines = (Array.isArray(worldBook?.characters) ? worldBook.characters : [])
    .map((char, index) => {
      const name = String(char?.name || char?.nickname || `角色${index + 1}`).trim() || `角色${index + 1}`
      const identity = String(char?.identity || '').trim()
      const appearance = String(char?.appearance || '').trim()
      const background = String(char?.background || '').trim()
      return [
        `角色${index + 1}: ${name}`,
        identity ? `身份=${identity}` : '',
        appearance ? `外表=${appearance}` : '',
        background ? `背景=${background}` : '',
      ].filter(Boolean).join(' | ')
    })
    .filter(Boolean)
    .slice(0, 16)

  const userPrompt = [
    '【任务】根据下面世界书信息生成游戏开场对白。',
    `【条数要求】${minLines}-${maxLines} 条`,
    worldTitle ? `【世界书标题】${worldTitle}` : '',
    worldSummary ? `【世界书摘要】${worldSummary}` : '',
    entryLines.length > 0 ? `【世界条目】\n${entryLines.join('\n')}` : '',
    userProfileLines.length > 0 ? `【User设定】\n${userProfileLines.join('\n')}` : '',
    characterLines.length > 0 ? `【角色设定】\n${characterLines.join('\n')}` : '',
    '要求：开场应有叙述推进与人物互动，逻辑自然，可直接作为新游戏前 10-15 句台词。',
    '请严格返回 JSON 对象，字段仅为 openingDialogue。',
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: WORLDBOOK_OPENING_SYSTEM_PROMPT,
    userPrompt,
    temperature: params.options?.temperature ?? 0.84,
    maxTokens: params.options?.maxTokens ?? 1500,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '开场白生成失败',
      openingDialogue: [],
    }
  }

  const parsedObject = parseFirstJsonObject(result.data)
  const parsedArray = parseFirstJsonArray(result.data)
  const normalized = normalizeWorldBookOpeningDialogue(
    parsedObject?.openingDialogue ? parsedObject : parsedArray,
    { minLines, maxLines },
  )

  if (!normalized) {
    return {
      success: false,
      error: '开场白解析失败（返回结果不符合 10-15 句格式）',
      openingDialogue: [],
      data: result.data,
      rawResponse: result.rawResponse,
    }
  }

  return {
    success: true,
    error: null,
    openingDialogue: normalized,
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
  generateCgPrompt,
  generateCharacterSpeech,
  generatePhoneSmsReply,
  generatePhoneMomentsReplies,
  generatePhoneMomentsBatchReplies,
  generatePhoneForumPosts,
  generatePhoneNewsFeed,
  generatePhoneMapData,
  generatePhoneShopItems,
  generateHandheldBrickLevel,
  generateHandheldPetProfile,
  generateHandheldPetReply,
  generateHandheldDungeonMap,
  generateHandheldDungeonScene,
  generateHandheldDungeonBanter,
  generateHandheldCampfireCompanions,
  generateWorldBookOpeningDialogue,
  getActiveApiConfig,
}
