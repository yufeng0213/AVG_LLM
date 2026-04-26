/**
 * LLM 服务模块
 * 负责与 LLM API 通信，生成剧情内容
 */

import { kvStorage } from '../storage/index.js'
import { resolvePrompt } from './promptRegistry.js'
import { getNarratorFullPrompt } from '../narrator/narratorStore.js'

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
  timeout = 120000, // 默认 120 秒超时
}) => {
  const { customApi, apiKey, model } = config

  const controller = new AbortController()
  const timer = setTimeout(() => {
    console.warn('[LLM] fetch 超时，中止请求')
    controller.abort()
  }, timeout)

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
      signal: controller.signal,
    })
    clearTimeout(timer)

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
    systemPrompt: await getSystemPrompt(),
    userPrompt: prompt,
    temperature: options.temperature || 0.8,
    maxTokens: options.maxTokens || 2000,
    extraParams: options.extraParams,
  })
}

const FACE_TO_FACE_DEFAULT_JOINT_IDS = [
  'nose',
  'left_eye_inner',
  'left_eye',
  'left_eye_outer',
  'right_eye_inner',
  'right_eye',
  'right_eye_outer',
  'left_ear',
  'right_ear',
  'mouth_left',
  'mouth_right',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_pinky',
  'right_pinky',
  'left_index',
  'right_index',
  'left_thumb',
  'right_thumb',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
  'left_heel',
  'right_heel',
  'left_foot_index',
  'right_foot_index',
]

const clampFaceToFaceMaxTokens = (value, fallback = 1400) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(256, Math.min(200000, parsed))
}

const clampFaceToFaceLineLength = (value, fallback = 48) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(16, Math.min(120, parsed))
}

const normalizeFaceToFaceJointKey = (value) => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

const createFaceToFaceJointAliasMap = (jointIds) => {
  const aliasMap = new Map()
  for (const jointId of jointIds) {
    const normalized = normalizeFaceToFaceJointKey(jointId)
    if (!normalized) continue
    aliasMap.set(normalized, jointId)
  }
  return aliasMap
}

const normalizeFaceToFaceJointDialogues = (
  rawObject,
  jointIds = FACE_TO_FACE_DEFAULT_JOINT_IDS,
  lineMaxLength = 48,
) => {
  if (!rawObject || typeof rawObject !== 'object') return null

  const normalizedJointIds = Array.isArray(jointIds)
    ? jointIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []
  if (normalizedJointIds.length === 0) return null

  const aliasMap = createFaceToFaceJointAliasMap(normalizedJointIds)
  const dialogues = {}

  const readLine = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, lineMaxLength)
  const assignLine = (jointKey, lineValue) => {
    const canonicalJoint = aliasMap.get(normalizeFaceToFaceJointKey(jointKey))
    if (!canonicalJoint) return
    if (dialogues[canonicalJoint]) return
    const line = readLine(lineValue)
    if (!line) return
    dialogues[canonicalJoint] = line
  }

  let sourceObject = rawObject
  if (rawObject?.jointDialogues && typeof rawObject.jointDialogues === 'object') {
    sourceObject = rawObject.jointDialogues
  } else if (rawObject?.dialogues && typeof rawObject.dialogues === 'object') {
    sourceObject = rawObject.dialogues
  } else if (rawObject?.lines && typeof rawObject.lines === 'object') {
    sourceObject = rawObject.lines
  }

  if (sourceObject && typeof sourceObject === 'object' && !Array.isArray(sourceObject)) {
    for (const [key, value] of Object.entries(sourceObject)) {
      assignLine(key, value)
    }
  }

  const arrayCandidates = []
  if (Array.isArray(sourceObject)) {
    arrayCandidates.push(sourceObject)
  }
  if (Array.isArray(rawObject?.jointDialogues)) {
    arrayCandidates.push(rawObject.jointDialogues)
  }
  if (Array.isArray(rawObject?.dialogues)) {
    arrayCandidates.push(rawObject.dialogues)
  }
  if (Array.isArray(rawObject?.lines)) {
    arrayCandidates.push(rawObject.lines)
  }

  for (const items of arrayCandidates) {
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      assignLine(
        item.jointId || item.joint || item.id || item.name,
        item.line || item.text || item.dialogue || item.content,
      )
    }
  }

  if (Object.keys(dialogues).length === 0) return null
  return dialogues
}

const buildFaceToFaceCharacterSummary = (character = {}, fallbackName = '角色') => {
  const personality = character?.personalityProfile && typeof character.personalityProfile === 'object'
    ? character.personalityProfile
    : {}
  const dimensions = personality?.cognitiveDimensions && typeof personality.cognitiveDimensions === 'object'
    ? personality.cognitiveDimensions
    : {}
  const behaviorTags = Array.isArray(personality?.behaviorTags)
    ? personality.behaviorTags
    : []

  const dimensionText = Object.entries(dimensions)
    .map(([key, value]) => `${key}:${Number.isFinite(Number(value)) ? Number(value) : value}`)
    .filter((entry) => String(entry || '').trim())
    .slice(0, 8)
    .join(' | ')

  return [
    `姓名: ${String(character?.name || character?.nickname || fallbackName).trim() || fallbackName}`,
    String(character?.nickname || '').trim() ? `昵称: ${String(character.nickname).trim()}` : '',
    String(character?.identity || '').trim() ? `身份: ${String(character.identity).trim()}` : '',
    String(character?.appearance || '').trim() ? `外表: ${String(character.appearance).trim()}` : '',
    String(character?.background || '').trim() ? `背景: ${String(character.background).trim()}` : '',
    String(character?.notes || '').trim() ? `备注: ${String(character.notes).trim()}` : '',
    String(personality?.mbti || '').trim() ? `MBTI: ${String(personality.mbti).trim()}` : '',
    behaviorTags.length > 0 ? `行为标签: ${behaviorTags.map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 10).join('、')}` : '',
    dimensionText ? `认知维度: ${dimensionText}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

const buildFaceToFaceWorldSummary = (worldBook = {}) => {
  const entries = worldBook?.entries && typeof worldBook.entries === 'object'
    ? worldBook.entries
    : {}
  const entryMap = [
    ['overview', '世界概述'],
    ['era', '时代背景'],
    ['regions', '地理区域'],
    ['forces', '主要势力'],
    ['rules', '世界规则'],
    ['culture', '社会文化'],
    ['conflict', '核心冲突'],
    ['secrets', '秘密与禁忌'],
  ]

  const entryText = entryMap
    .map(([key, label]) => {
      const value = String(entries?.[key] || '').trim()
      return value ? `${label}: ${value}` : ''
    })
    .filter(Boolean)
    .join('\n')

  return [
    `世界书: ${String(worldBook?.title || '未命名世界书').trim() || '未命名世界书'}`,
    String(worldBook?.summary || '').trim() ? `摘要: ${String(worldBook.summary).trim()}` : '',
    entryText ? `条目:\n${entryText}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const generateFaceToFaceJointDialogues = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      jointDialogues: null,
      data: null,
    }
  }

  const worldBook = params.worldBook && typeof params.worldBook === 'object'
    ? params.worldBook
    : {}
  const character = params.character && typeof params.character === 'object'
    ? params.character
    : null
  if (!character) {
    return {
      success: false,
      error: '角色信息缺失，无法生成关节台词',
      jointDialogues: null,
      data: null,
    }
  }

  const requestedJointIds = Array.isArray(params.jointIds)
    ? params.jointIds.map((item) => String(item || '').trim()).filter(Boolean)
    : []
  const jointIds = requestedJointIds.length > 0
    ? requestedJointIds
    : FACE_TO_FACE_DEFAULT_JOINT_IDS
  const lineMaxLength = clampFaceToFaceLineLength(params.options?.lineMaxLength, 48)
  const maxTokens = clampFaceToFaceMaxTokens(params.options?.maxTokens, 1400)
  const temperature = Number.isFinite(Number(params.options?.temperature))
    ? Number(params.options.temperature)
    : 0.82
  const characterName = String(
    params.characterName ||
    character?.name ||
    character?.nickname ||
    '角色',
  ).trim() || '角色'

  const worldSummary = buildFaceToFaceWorldSummary(worldBook)
  const characterSummary = buildFaceToFaceCharacterSummary(character, characterName)
  const jointTemplate = jointIds
    .map((jointId) => `  "${jointId}": "${characterName}被点击该部位时说的话"`)
    .join(',\n')
  const requiredJointList = jointIds.join(', ')

  const userPrompt = [
    '【任务】请为“面对面互动”生成关节点点击台词映射。',
    `【角色名】${characterName}`,
    worldSummary ? `【世界书信息】\n${worldSummary}` : '',
    `【角色信息】\n${characterSummary}`,
    `【目标关节ID】${requiredJointList}`,
    `【台词长度】每句建议 6-${Math.max(16, lineMaxLength)} 字`,
    '要求：同一角色不同部位的台词要有差异，但整体语气统一。',
    '请尽量覆盖全部关节；至少覆盖 12 个关节。',
    '严格输出 JSON 对象，不要解释。',
    `输出示例：\n{"jointDialogues":{\n${jointTemplate}\n}}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('core:face_to_face_joint'),
    userPrompt,
    temperature,
    maxTokens,
    extraParams: params.options?.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '关节点台词生成失败',
      jointDialogues: null,
      data: null,
    }
  }

  const parsed = parseJsonObjectFromText(result.data)
  const normalized = normalizeFaceToFaceJointDialogues(parsed, jointIds, lineMaxLength)
  if (!normalized) {
    return {
      success: false,
      error: '关节点台词解析失败',
      jointDialogues: null,
      data: result.data,
      rawResponse: result.rawResponse,
    }
  }

  return {
    success: true,
    error: null,
    jointDialogues: normalized,
    data: result.data,
    rawResponse: result.rawResponse,
  }
}

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
    } catch (e) {
      console.log('[CardDebug] JSON解析失败:', e.message, '文本片段:', text.substring(0, 100))
    }
    return null
  }

  // 1. 尝试提取 markdown 代码块中的 JSON
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const fencedCandidate = fencedMatch?.[1]?.trim()
  if (fencedCandidate) {
    const parsedFenced = parseJson(fencedCandidate)
    if (parsedFenced) return parsedFenced
  }

  // 2. 直接解析
  const directParsed = parseJson(raw)
  if (directParsed) return directParsed

  // 3. 提取第一个 { 到最后一个 } 之间的内容
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const extracted = raw.slice(start, end + 1)
    const parsedExtracted = parseJson(extracted)
    if (parsedExtracted) return parsedExtracted
    
    // 4. 尝试修复常见的 JSON 格式问题
    // 移除可能的尾部逗号
    const fixedComma = extracted.replace(/,(\s*[}\]])/g, '$1')
    const parsedFixed = parseJson(fixedComma)
    if (parsedFixed) return parsedFixed
    
    // 5. 尝试逐步截取有效的 JSON（处理被截断的情况）
    // 从最后一个 } 开始向前尝试
    let lastBrace = extracted.lastIndexOf('}')
    while (lastBrace > start) {
      const partial = extracted.substring(0, lastBrace + 1)
      // 尝试补全不完整的 JSON
      const openBraces = (partial.match(/{/g) || []).length
      const closeBraces = (partial.match(/}/g) || []).length
      const openBrackets = (partial.match(/\[/g) || []).length
      const closeBrackets = (partial.match(/]/g) || []).length
      
      let completed = partial
      // 补全缺失的括号
      for (let i = closeBraces; i < openBraces; i++) {
        completed += '}'
      }
      for (let i = closeBrackets; i < openBrackets; i++) {
        completed += ']'
      }
      
      const parsedCompleted = parseJson(completed)
      if (parsedCompleted) {
        console.log('[CardDebug] 通过补全括号成功解析')
        return parsedCompleted
      }
      
      lastBrace = extracted.lastIndexOf('}', lastBrace - 1)
    }
  }

  console.log('[CardDebug] 所有JSON解析尝试都失败了')
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
    ? (() => {
        // 新结构：使用items条目
        if (narratorProfile.items && narratorProfile.items.length > 0) {
          const itemsPrompt = getNarratorFullPrompt(narratorProfile)
          if (itemsPrompt && itemsPrompt.trim()) {
            return itemsPrompt.trim()
          }
        }
        // 兼容旧数据
        return [
          String(narratorProfile.name || '').trim() ? `叙事者: ${String(narratorProfile.name || '').trim()}` : '',
          String(narratorProfile.summary || '').trim() ? `风格定位: ${String(narratorProfile.summary || '').trim()}` : '',
          String(narratorProfile.stylePrompt || '').trim() ? `文风要求: ${String(narratorProfile.stylePrompt || '').trim()}` : '',
          String(narratorProfile.instructionPrompt || '').trim() ? `叙事约束: ${String(narratorProfile.instructionPrompt || '').trim()}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      })()
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
    systemPrompt: await resolvePrompt('core:cg_prompt'),
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

  // 新结构：使用items条目，兼容旧数据
  let narratorStyle = ''
  if (narratorProfile?.items && narratorProfile.items.length > 0) {
    narratorStyle = getNarratorFullPrompt(narratorProfile).trim()
  } else {
    narratorStyle = String(
      narratorProfile?.stylePrompt ||
      narratorProfile?.instructionPrompt ||
      narratorProfile?.summary ||
      '',
    ).trim()
  }
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
    systemPrompt: await resolvePrompt('core:mini_theater'),
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
 * @returns {Promise<string>} 系统提示词
 */
const getSystemPrompt = () => {
  return resolvePrompt('core:story_generation')
}

/**
 * 生成小卡片内容
 * @param {Object} params
 * @param {Object} params.cardConfig - 卡片配置（来自 prompt.json）
 * @param {Object} params.worldBook - 世界书数据
 * @param {Array} params.recentDialogue - 近期对话历史
 * @param {string} params.currentScene - 当前场景名称
 * @param {Object} params.options - 可选配置
 * @returns {Promise<Object>} 生成结果
 */
export const generateCardContent = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      data: null,
    }
  }

  const { cardConfig, worldBook, recentDialogue = [], currentScene = '', options = {} } = params
  
  if (!cardConfig) {
    return {
      success: false,
      error: '卡片配置缺失',
      data: null,
    }
  }

  // 构建世界书摘要
  const worldBookSummary = buildWorldBookSummary(worldBook)
  
  // 构建近期剧情摘要
  const dialogueSummary = buildDialogueSummary(recentDialogue)
  
  // 构建用户提示词
  const userPrompt = buildCardUserPrompt(cardConfig, worldBookSummary, dialogueSummary, currentScene)

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('core:card_generation'),
    userPrompt,
    temperature: options.temperature || 0.9, // 卡片生成需要更多创意
    maxTokens: options.maxTokens || 1500,
    extraParams: options.extraParams,
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '生成失败',
      data: null,
    }
  }

  // 解析生成的 JSON 内容
  const cardData = parseCardData(result.data, cardConfig)
  
  return {
    success: true,
    error: null,
    data: cardData,
    rawResponse: result.rawResponse,
  }
}

/**
 * 构建世界书摘要
 * @param {Object} worldBook - 世界书数据
 * @returns {string} 摘要文本
 */
const buildWorldBookSummary = (worldBook) => {
  if (!worldBook) return '无世界书信息'
  
  const parts = []
  
  // 世界观背景
  if (worldBook.background) {
    parts.push(`【世界观】`)
    parts.push(`- 名称：${worldBook.background.name || '未知'}`)
    if (worldBook.background.description) {
      parts.push(`- 描述：${worldBook.background.description}`)
    }
    if (worldBook.background.setting) {
      parts.push(`- 设定：${worldBook.background.setting}`)
    }
  }
  
  // 人物信息
  if (worldBook.characters && worldBook.characters.length > 0) {
    parts.push(`【主要人物】`)
    for (const char of worldBook.characters.slice(0, 5)) {
      const charInfo = `- ${char.name || '未知'}`
      const role = char.role ? `（${char.role}）` : ''
      const desc = char.description ? `：${char.description.substring(0, 100)}` : ''
      parts.push(`${charInfo}${role}${desc}`)
    }
  }
  
  // 用户角色
  if (worldBook.userProfile) {
    parts.push(`【玩家角色】`)
    parts.push(`- 名称：${worldBook.userProfile.name || '你'}`)
    if (worldBook.userProfile.role) {
      parts.push(`- 身份：${worldBook.userProfile.role}`)
    }
  }
  
  // 关系设定
  if (worldBook.relationships && worldBook.relationships.length > 0) {
    parts.push(`【人物关系】`)
    for (const rel of worldBook.relationships.slice(0, 3)) {
      parts.push(`- ${rel.from || '某人'} 与 ${rel.to || '某人'}：${rel.type || '未知关系'}`)
    }
  }
  
  return parts.join('\n')
}

/**
 * 构建对话摘要
 * @param {Array} dialogue - 对话历史
 * @returns {string} 摘要文本
 */
const buildDialogueSummary = (dialogue) => {
  if (!dialogue || dialogue.length === 0) return '无近期剧情'
  
  const recentLines = dialogue.slice(-10)
  const parts = ['【近期剧情】']
  
  for (const line of recentLines) {
    const speaker = line.speaker || '旁白'
    const text = (line.text || '').substring(0, 80)
    parts.push(`${speaker}：${text}${text.length >= 80 ? '...' : ''}`)
  }
  
  return parts.join('\n')
}

/**
 * 构建卡片生成用户提示词
 * @param {Object} cardConfig - 卡片配置
 * @param {string} worldBookSummary - 世界书摘要
 * @param {string} dialogueSummary - 对话摘要
 * @param {string} currentScene - 当前场景
 * @returns {string} 用户提示词
 */
const buildCardUserPrompt = (cardConfig, worldBookSummary, dialogueSummary, currentScene) => {
  const cardName = cardConfig.name || '未知卡片'
  const cardDesc = cardConfig.description || ''
  const cardStyle = cardConfig.style || {}
  
  // 获取模板并替换占位符
  let promptTemplate = cardConfig.promptTemplate || ''
  
  // 替换基本占位符
  promptTemplate = promptTemplate.replace(/\{\{scene\}\}/g, currentScene || '当前场景')
  
  const parts = [
    `请生成一张"${cardName}"卡片的内容。`,
    '',
    `卡片类型：${cardName}`,
    `卡片描述：${cardDesc}`,
    `风格主题：${cardStyle.theme || '默认'}`,
    `情感基调：${cardStyle.mood || '中性'}`,
    '',
    worldBookSummary,
    '',
    dialogueSummary,
    '',
    `当前场景：${currentScene || '未知'}`,
    '',
  ]
  
  // 添加变量说明
  if (cardConfig.variables) {
    parts.push('【需要生成的变量】')
    for (const [key, varConfig] of Object.entries(cardConfig.variables)) {
      const varDesc = varConfig.description || ''
      const varType = varConfig.type || 'string'
      const varMaxLen = varConfig.maxLength ? `（最多${varConfig.maxLength}字）` : ''
      const varDefault = varConfig.default ? `，默认值：${varConfig.default}` : ''
      const varOptions = varConfig.options ? `，可选值：${varConfig.options.join('/')}` : ''
      parts.push(`- ${key}（${varType}）：${varDesc}${varMaxLen}${varDefault}${varOptions}`)
    }
    parts.push('')
    parts.push('请按以上变量结构输出 JSON 对象。')
  }
  
  // 如果有原始模板，添加模板内容
  if (promptTemplate) {
    parts.push('')
    parts.push('【生成模板参考】')
    parts.push(promptTemplate)
  }
  
  return parts.join('\n')
}

/**
 * 解析卡片数据
 * @param {string} rawContent - LLM 返回的原始内容
 * @param {Object} cardConfig - 卡片配置
 * @returns {Object} 解析后的卡片数据
 */
const parseCardData = (rawContent, cardConfig) => {
  const raw = String(rawContent || '').trim()
  if (!raw) return {}
  
  console.log('[CardDebug] 原始LLM返回内容:', raw.substring(0, 500))
  
  // 尝试解析 JSON
  const parsed = parseJsonObjectFromText(raw)
  console.log('[CardDebug] 解析后的JSON对象:', parsed)
  
  if (parsed) {
    // 验证并补充缺失的变量
    const variables = cardConfig.variables || {}
    const result = {}
    
    for (const [key, varConfig] of Object.entries(variables)) {
      // 使用解析的值或默认值
      let value = parsed[key]
      
      // 如果值是对象或数组，尝试进一步解析或转换为字符串
      if (value !== undefined) {
        if (typeof value === 'object' && value !== null) {
          // 如果是嵌套的 JSON 对象，尝试提取主要内容
          // 对于 content 类型的字段，尝试提取 text 或 content 子字段
          if (varConfig.type === 'text' && value.text) {
            value = value.text
          } else if (varConfig.type === 'text' && value.content) {
            value = value.content
          } else {
            // 否则转换为 JSON 字符串
            value = JSON.stringify(value)
          }
        }
        result[key] = String(value)
      } else if (varConfig.default !== undefined) {
        result[key] = String(varConfig.default)
      } else {
        result[key] = ''
      }
      
      // 处理 maxLength 限制
      if (varConfig.maxLength && typeof result[key] === 'string') {
        result[key] = result[key].substring(0, varConfig.maxLength)
      }
    }
    
    // 保留其他可能有用的字段（转换为字符串）
    for (const [key, value] of Object.entries(parsed)) {
      if (!result[key]) {
        if (typeof value === 'object' && value !== null) {
          result[key] = JSON.stringify(value)
        } else {
          result[key] = String(value || '')
        }
      }
    }
    
    console.log('[CardDebug] 最终解析结果:', result)
    return result
  }
  
  // 如果无法解析 JSON，尝试将文本作为主要内容
  const mainContentKey = Object.keys(cardConfig.variables || {}).find(
    k => cardConfig.variables[k].type === 'text'
  ) || 'content'
  
  return {
    [mainContentKey]: raw,
    _raw: raw,
  }
}

/**
 * 生成剧情券完整剧情（一次性生成，不少于 10000 字）
 * @param {Object} params
 * @param {Object} params.worldBook - 世界书数据
 * @param {string} params.targetCharacter - 目标角色名（寝室主人）
 * @param {string} params.customTheme - 自定义主题（可选，不提供则由LLM决定）
 * @param {Array} params.characters - 可用角色列表
 * @param {Object} params.options - 可选配置
 * @returns {Promise<Object>} 生成结果，包含 dialogues 数组和 rawResponse
 */
export const generateStoryTicket = async (params = {}) => {
  const validated = await getValidatedActiveConfig()
  if (!validated.success || !validated.config) {
    return {
      success: false,
      error: validated.error || 'API 配置不可用',
      dialogues: [],
      rawResponse: null,
    }
  }

  const { worldBook, targetCharacter, customTheme, characters = [], options = {} } = params

  if (!targetCharacter) {
    return {
      success: false,
      error: '未指定目标角色',
      dialogues: [],
      rawResponse: null,
    }
  }

  // 构建用户提示词
  const worldBookSummary = buildWorldBookSummary(worldBook)
  const charList = characters.length > 0
    ? characters.map(c => typeof c === 'string' ? c : c.name).join('、')
    : '无额外角色信息'

  const themeDirective = customTheme
    ? `\n【剧情主题】${customTheme}`
    : '\n【剧情主题】由你自由决定，但需与角色性格和世界观契合'

  const userPrompt = `现在开始生成一段寝室专属剧情。

${worldBookSummary}

【目标角色】${targetCharacter}（剧情发生在该角色的寝室）
【可用角色】${charList}
${themeDirective}

重要：请输出不少于 1000 字的完整剧情（纯中文内容，不含标记符号）。
使用剧情券自定义协议格式输出，详见系统提示词。`

  const systemPrompt = await resolvePrompt('core:story_ticket')
  const maxTokens = options.maxTokens || 8000
  const minWordCount = options.minWordCount || 1000

  // 第一次生成
  let allContent = ''
  let attempts = 0
  const maxAttempts = 3

  do {
    attempts++
    const result = await callChatCompletion({
      config: validated.config,
      systemPrompt,
      userPrompt: attempts === 1
        ? userPrompt
        : `${userPrompt}\n\n上次生成的内容字数不足，请在上次的基础上继续生成更多剧情，确保总字数达到 ${minWordCount} 字。`,
      temperature: options.temperature || 0.8,
      maxTokens,
      extraParams: options.extraParams,
      timeout: 300000, // 5分钟超时
    })

    if (!result.success) {
      return {
        success: false,
        error: result.error || '剧情生成失败',
        dialogues: [],
        rawResponse: result.rawResponse,
      }
    }

    const rawText = typeof result.data === 'string' ? result.data : String(result.data || '')
    allContent = rawText

    const { countChineseChars } = await import('./storyParser.js')
    const charCount = countChineseChars(rawText)
    console.log(`[StoryTicket] 第 ${attempts} 次生成完成，中文字数：${charCount} / ${minWordCount}`)

    if (charCount >= minWordCount) {
      break
    }

    // 字数不够，继续循环生成
  } while (attempts < maxAttempts)

  // 解析自定义协议
  const { parseStoryTicketContent } = await import('./storyParser.js')
  const parsed = parseStoryTicketContent(allContent)

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error || '剧情内容解析失败',
      dialogues: [],
      rawResponse: allContent,
    }
  }

  return {
    success: true,
    error: null,
    dialogues: parsed.dialogues,
    rawResponse: allContent,
  }
}

