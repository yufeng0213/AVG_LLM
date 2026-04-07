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

export const getValidatedActiveConfig = async () => {
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

export const callChatCompletion = async ({
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

const MINI_THEATER_SYSTEM_PROMPT = `你是“AVG 小剧场生成器”。
你的任务是生成一段与主线无直接推进关系的短篇小剧场。

硬性要求：
1) 只输出 JSON，不要 markdown，不要解释。
2) JSON 结构必须为：
{"title":"小剧场标题","theme":"本次主题","dialogues":[{"speaker":"说话者","emotion":"default","text":"台词"}]}
3) dialogues 至少 3 条，建议 4-8 条。
4) 小剧场应与主线“解耦”，可写旁支人物、街谈巷议、回忆片段、背景插曲等，但世界观要兼容。
5) 不要输出 choices 字段，不要要求玩家交互。`

const clampMiniTheaterLineCount = (value, fallback = 6) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(3, Math.min(12, parsed))
}

const clampMiniTheaterMaxTokens = (value, fallback = 1200) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(256, Math.min(200000, parsed))
}

const parseMiniTheaterFlexibleJson = (rawContent) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const parseJson = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const fencedCandidate = fencedMatch?.[1]?.trim()
  if (fencedCandidate) {
    const parsedFenced = parseJson(fencedCandidate)
    if (parsedFenced !== null) return parsedFenced
  }

  const directParsed = parseJson(raw)
  if (directParsed !== null) return directParsed

  const objectStart = raw.indexOf('{')
  const objectEnd = raw.lastIndexOf('}')
  if (objectStart >= 0 && objectEnd > objectStart) {
    const parsedObject = parseJson(raw.slice(objectStart, objectEnd + 1))
    if (parsedObject !== null) return parsedObject
  }

  const arrayStart = raw.indexOf('[')
  const arrayEnd = raw.lastIndexOf(']')
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    const parsedArray = parseJson(raw.slice(arrayStart, arrayEnd + 1))
    if (parsedArray !== null) return parsedArray
  }

  return null
}

const normalizeMiniTheaterDialogueLine = (rawLine) => {
  const line = rawLine && typeof rawLine === 'object' ? rawLine : {}
  const speaker = String(line.speaker || line.name || line.character || '旁白').trim() || '旁白'
  const text = String(line.text || line.content || line.line || '').trim()
  if (!text) return null

  const emotion = String(line.emotion || line.mood || 'default').trim() || 'default'

  return {
    speaker,
    emotion,
    text,
    highlight: Boolean(line.highlight),
  }
}

const normalizeMiniTheaterDialogues = (rawDialogues, maxLines = 6) => {
  const source = Array.isArray(rawDialogues) ? rawDialogues : []
  return source
    .map((line) => normalizeMiniTheaterDialogueLine(line))
    .filter(Boolean)
    .slice(0, maxLines)
}

const parseMiniTheaterOutput = (rawContent, maxLines = 6) => {
  const parsed = parseMiniTheaterFlexibleJson(rawContent)

  let title = ''
  let theme = ''
  let dialogueCandidates = []

  if (Array.isArray(parsed)) {
    dialogueCandidates = parsed
  } else if (parsed && typeof parsed === 'object') {
    title = String(parsed.title || parsed.name || parsed.episodeTitle || '').trim()
    theme = String(parsed.theme || parsed.topic || '').trim()
    if (Array.isArray(parsed.dialogues)) {
      dialogueCandidates = parsed.dialogues
    } else if (Array.isArray(parsed.lines)) {
      dialogueCandidates = parsed.lines
    } else if (Array.isArray(parsed.script)) {
      dialogueCandidates = parsed.script
    } else if (parsed.speaker || parsed.text || parsed.content) {
      dialogueCandidates = [parsed]
    }
  }

  let dialogues = normalizeMiniTheaterDialogues(dialogueCandidates, maxLines)

  if (dialogues.length === 0) {
    dialogues = String(rawContent || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => String(line || '').trim())
      .filter(Boolean)
      .slice(0, maxLines)
      .map((text) => ({
        speaker: '旁白',
        emotion: 'default',
        text,
        highlight: false,
      }))
  }

  if (dialogues.length === 0) {
    return null
  }

  const finalTitle = title || theme || '无题小剧场'
  return {
    title: finalTitle,
    theme,
    dialogues,
  }
}

const buildMiniTheaterPrompt = (params = {}) => {
  const worldBook = params.worldBook && typeof params.worldBook === 'object' ? params.worldBook : null
  const narratorProfile = params.narratorProfile && typeof params.narratorProfile === 'object' ? params.narratorProfile : null
  const customTheme = String(params.customTheme || '').trim()
  const currentStoryTime = String(params.currentStoryTime || '').trim()
  const maxLines = clampMiniTheaterLineCount(params.maxLines, 6)
  const dialogueHistory = Array.isArray(params.dialogueHistory) ? params.dialogueHistory : []
  const currentLine = params.currentLine && typeof params.currentLine === 'object' ? params.currentLine : null

  const worldTitle = String(worldBook?.title || '默认世界书').trim() || '默认世界书'
  const worldSummary = String(worldBook?.summary || worldBook?.entries?.overview || '').trim()
  const narratorStyle = String(
    narratorProfile?.stylePrompt ||
    narratorProfile?.instructionPrompt ||
    narratorProfile?.summary ||
    '',
  ).trim()
  const characterNames = (Array.isArray(worldBook?.characters) ? worldBook.characters : [])
    .map((char) => String(char?.name || char?.nickname || char?.id || '').trim())
    .filter(Boolean)
    .slice(0, 12)
    .join('、')
  const recentMainline = dialogueHistory
    .slice(-6)
    .map((line) => {
      const speaker = String(line?.speaker || '旁白').trim() || '旁白'
      const text = String(line?.text || '').trim()
      if (!text) return ''
      return `${speaker}: ${text}`
    })
    .filter(Boolean)
    .join('\n')
  const currentLineText = currentLine?.text
    ? `${String(currentLine?.speaker || '旁白').trim() || '旁白'}: ${String(currentLine.text || '').trim()}`
    : ''

  return [
    '【任务】请生成一段“与主线无直接推进关系”的小剧场剧情。',
    customTheme
      ? `【主题】${customTheme}`
      : '【主题】请随机设计一个有趣的小剧场主题（不要直接延续主线冲突）。',
    `【输出条数】dialogues 控制在 3-${maxLines} 条`,
    `【世界书】${worldTitle}`,
    worldSummary ? `【世界观概述】${worldSummary}` : '',
    characterNames ? `【可用角色】${characterNames}` : '',
    narratorStyle ? `【文风要求】${narratorStyle}` : '',
    currentStoryTime ? `【主线当前剧情时间】${currentStoryTime}` : '',
    currentLineText ? `【主线当前句】${currentLineText}` : '',
    recentMainline ? `【主线最近对话（参考，不要直推主线）】\n${recentMainline}` : '',
    '要求：',
    '- 小剧场可以讲别人、支线趣闻、同世界观中的插曲。',
    '- 不要在小剧场里给出 choices。',
    '- 标题要具体，不要“小剧场1”这种命名。',
    '- 只输出 JSON：{"title":"...","theme":"...","dialogues":[{"speaker":"...","emotion":"default","text":"..."}]}',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const generateMiniTheater = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      title: '',
      dialogues: [],
      data: null,
    }
  }

  const maxLines = clampMiniTheaterLineCount(params.maxLines, 6)
  const maxTokens = clampMiniTheaterMaxTokens(params.maxTokens, 1200)
  const temperature = Number.isFinite(Number(params.temperature))
    ? Number(params.temperature)
    : 0.92

  const userPrompt = buildMiniTheaterPrompt({
    ...params,
    maxLines,
  })

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: MINI_THEATER_SYSTEM_PROMPT,
    userPrompt,
    temperature,
    maxTokens,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '小剧场生成失败',
      title: '',
      dialogues: [],
      data: null,
    }
  }

  const parsed = parseMiniTheaterOutput(result.data, maxLines)
  if (!parsed || !Array.isArray(parsed.dialogues) || parsed.dialogues.length === 0) {
    return {
      success: false,
      error: '小剧场内容解析失败',
      title: '',
      dialogues: [],
      data: result.data,
      rawResponse: result.rawResponse,
    }
  }

  return {
    success: true,
    error: null,
    title: parsed.title,
    theme: parsed.theme,
    dialogues: parsed.dialogues,
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
    "highlight": true,
    "storyTime": "星历2501年04月07日"
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
- **storyTime**: 剧情时间，由你按世界观决定纪年格式（例如星历、王朝年号、公历日期等）

## 选项生成要求（重要！）

**每次生成都必须在最后一条对话中添加 \`choices\` 字段，为玩家提供选择分支！** 这是强制要求，用于测试交互式剧情功能。

\`\`\`json
[
  {
    "speaker": "旁白",
    "emotion": "default",
    "text": "你面前有一扇紧闭的门，门缝中透出微弱的光芒。",
    "highlight": false,
    "storyTime": "星历2501年04月08日",
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
9. 每次提供 2-4 个选项，allowCustomInput 必须为 true
10. 每条对话都必须包含 storyTime 字段，同一世界内纪年体系与写法保持一致
11. 本次生成应体现剧情推进，最后一条对话的 storyTime 必须相对当前剧情时间前进（不能不变、不能回退）`
}

