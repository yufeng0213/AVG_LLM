/**
 * llmService.pronunciation.js - 口语发音学习 LLM 服务
 * 使用自定义协议格式（非 JSON），类似 reader 的 |key=value| 模式。
 */
import { callChatCompletion, getValidatedActiveConfig, generateCharacterSpeech } from './llmService.core.js'
import { resolvePrompt } from './promptRegistry.js'

// ===== 解析器 =====

/**
 * 解析自定义协议格式的输出。
 * @param {string} rawContent - LLM 返回的原始文本
 * @returns {{ intro: string, items: Array<{type:'word'|'sentence', text:string, phonetic:string, meaning:string}> } | null}
 */
export function parsePronunciationOutput(rawContent) {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  // 提取 intro
  let intro = ''
  const introStart = raw.indexOf('|intro|')
  const introEnd = raw.indexOf('|/intro|')
  if (introStart >= 0 && introEnd > introStart) {
    intro = raw.slice(introStart + 7, introEnd).trim()
  }

  // 提取单词: |word=text|phonetic|meaning|
  const items = []
  const wordRegex = /\|word=(.+?)\|(.+?)\|(.+?)\|/g
  let match
  while ((match = wordRegex.exec(raw)) !== null) {
    items.push({
      type: 'word',
      text: match[1].trim(),
      phonetic: match[2].trim(),
      meaning: match[3].trim(),
    })
  }

  // 提取句子: |sentence=text|phonetic|meaning|
  const sentenceRegex = /\|sentence=(.+?)\|(.+?)\|(.+?)\|/g
  while ((match = sentenceRegex.exec(raw)) !== null) {
    items.push({
      type: 'sentence',
      text: match[1].trim(),
      phonetic: match[2].trim(),
      meaning: match[3].trim(),
    })
  }

  if (items.length === 0) return null

  return { intro, items }
}

// ===== 信息构建 =====

function buildCharacterSummary(character = {}) {
  const parts = []
  const name = String(character?.name || character?.nickname || '讲师').trim() || '讲师'
  parts.push(`姓名: ${name}`)
  if (character?.nickname) parts.push(`昵称: ${String(character.nickname).trim()}`)
  if (character?.identity) parts.push(`身份: ${String(character.identity).trim()}`)
  if (character?.appearance) parts.push(`外貌: ${String(character.appearance).slice(0, 80)}`)
  if (character?.background) parts.push(`背景: ${String(character.background).slice(0, 80)}`)
  if (character?.notes) parts.push(`性格: ${String(character.notes).slice(0, 60)}`)

  const personality = character?.personalityProfile || {}
  if (personality?.mbti) parts.push(`MBTI: ${String(personality.mbti).trim()}`)
  const behaviorTags = Array.isArray(personality?.behaviorTags) ? personality.behaviorTags : []
  if (behaviorTags.length > 0) {
    parts.push(`行为标签: ${behaviorTags.slice(0, 6).join('、')}`)
  }
  return parts.join('\n')
}

function buildWorldSummary(worldBook = {}) {
  const parts = [`世界: ${String(worldBook?.title || '未命名').trim()}`]
  if (worldBook?.summary) parts.push(`摘要: ${worldBook.summary}`)
  const entries = worldBook?.entries || {}
  if (entries?.overview) parts.push(`概述: ${entries.overview}`)
  return parts.join('\n')
}

const LANGUAGE_NAMES = {
  zh: '中文',
  en: '英语',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  ru: '俄语',
}

// ===== LLM 函数 =====

/**
 * 生成口语发音课程内容。
 * @param {Object} params
 * @param {string} params.language - 语言代码 (zh/en/ja/...)
 * @param {string} params.topic - 学习主题
 * @param {number} params.wordCount - 单词数量
 * @param {number} params.sentenceCount - 句子数量
 * @param {Object} params.character - 世界书角色
 * @param {Object} params.worldBook - 世界书
 * @returns {Promise<Object>}
 */
export async function generatePronunciationLesson(params = {}) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error }
  }

  const {
    language = 'en',
    topic = '日常用语',
    wordCount = 4,
    sentenceCount = 2,
    character,
    worldBook,
  } = params

  const languageName = LANGUAGE_NAMES[language] || language
  const userPrompt = [
    `【任务】生成口语发音学习课程内容。`,
    character ? `【讲师信息】\n${buildCharacterSummary(character)}` : '',
    worldBook ? `【世界观信息】\n${buildWorldSummary(worldBook)}` : '',
    `【目标语言】${languageName} (${language})`,
    `【学习主题】${topic}`,
    `【词汇数量】${wordCount} 个`,
    `【句子数量】${sentenceCount} 个`,
    '',
    `请生成适合初中级学习者的 ${languageName} 内容。`,
  ].filter(Boolean).join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: await resolvePrompt('pronunciation:lesson'),
    userPrompt,
    temperature: 0.75,
    maxTokens: 3000,
    timeout: 180000,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  const parsed = parsePronunciationOutput(result.data)
  if (!parsed) {
    return { success: false, error: '课程内容解析失败', rawData: result.data }
  }

  return {
    success: true,
    error: null,
    intro: parsed.intro,
    items: parsed.items,
    rawData: result.data,
  }
}

// ===== TTS 调度 =====

/**
 * 生成口语发音 TTS 音频。
 * 优先使用自定义 TTS API，无则回退到 MiniMax generateCharacterSpeech。
 * @param {Object} params
 * @param {string} params.text - 要合成的文本
 * @param {string} params.language - 语言代码
 * @param {string} [params.customTtsApi] - 自定义 TTS API 端点
 * @param {string} [params.customTtsApiKey] - 自定义 TTS API Key
 * @param {Object} [params.voiceConfig] - 角色语音配置（用于 MiniMax）
 * @returns {Promise<Object>} { success, audioBytes, mimeType, format, error }
 */
export async function generatePronunciationTTS(params = {}) {
  const customApi = params.customTtsApi
  if (customApi) {
    return await callCustomTTS({
      endpoint: customApi,
      apiKey: params.customTtsApiKey || '',
      text: params.text,
      language: params.language,
    })
  }

  // 回退到 MiniMax
  return await generateCharacterSpeech({
    text: params.text,
    voiceConfig: params.voiceConfig,
  })
}

/**
 * 调用自定义 TTS API。
 */
async function callCustomTTS(params) {
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (params.apiKey) {
      headers['Authorization'] = `Bearer ${params.apiKey}`
    }

    const response = await fetch(params.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text: params.text,
        language: params.language || '',
      }),
    })

    if (!response.ok) {
      return { success: false, error: `TTS 请求失败: ${response.status}`, audioBytes: null }
    }

    const audioBlob = await response.blob()
    if (!audioBlob || audioBlob.size === 0) {
      return { success: false, error: 'TTS 返回音频为空', audioBytes: null }
    }

    const audioBytes = new Uint8Array(await audioBlob.arrayBuffer())
    const mimeType = audioBlob.type || 'audio/mpeg'
    const format = inferFormatFromMimeType(mimeType)

    return {
      success: true,
      error: null,
      audioBytes,
      mimeType,
      format,
    }
  } catch (err) {
    return { success: false, error: `TTS 网络错误: ${err.message}`, audioBytes: null }
  }
}

function inferFormatFromMimeType(mimeType) {
  if (!mimeType) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('flac')) return 'flac'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('webm')) return 'webm'
  return 'mp3'
}
