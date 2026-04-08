/**
 * 剧情解析器
 * 解析 LLM 返回的 JSON 格式剧情，提取关键信息
 */

import { EMOTION_PRESETS, isValidEmotion } from '../worldbook/emotionPresets'

const MAX_JSON_CANDIDATES = 24

/**
 * 解析 LLM 返回的剧情内容
 * @param {string} content - LLM 返回的原始内容
 * @returns {Object} 解析结果
 */
export const parseStoryContent = (content) => {
  if (!content || typeof content !== 'string') {
    return {
      success: false,
      error: '内容为空或格式错误',
      dialogues: [],
    }
  }

  const payload = extractDialoguePayload(content)
  if (!payload) {
    return {
      success: false,
      error: '未能从返回内容中提取有效的剧情 JSON',
      dialogues: [],
      rawContent: content,
    }
  }

  const dialogues = normalizeDialogues(payload)
  if (dialogues.length === 0) {
    return {
      success: false,
      error: '剧情 JSON 中未包含可用对话条目',
      dialogues: [],
      rawContent: content,
    }
  }

  return {
    success: true,
    error: null,
    dialogues,
    rawContent: content,
  }
}

const extractDialoguePayload = (content) => {
  const candidates = collectJsonCandidates(content)

  for (const candidate of candidates) {
    const parsed = parseJsonWithRepairs(candidate)
    if (!parsed) continue

    const dialoguePayload = resolveDialoguePayload(parsed)
    if (dialoguePayload) {
      return dialoguePayload
    }
  }

  return null
}

const collectJsonCandidates = (content) => {
  const raw = String(content || '').trim()
  if (!raw) return []

  const candidates = []
  const seen = new Set()

  const pushCandidate = (value) => {
    const text = String(value || '').trim()
    if (!text) return
    if (!(text.startsWith('{') || text.startsWith('['))) return
    if (seen.has(text)) return
    seen.add(text)
    candidates.push(text)
  }

  pushCandidate(raw)

  const fencedRegex = /```(?:json)?\s*([\s\S]*?)```/gi
  let fencedMatch = fencedRegex.exec(raw)
  while (fencedMatch) {
    pushCandidate(fencedMatch[1])
    if (candidates.length >= MAX_JSON_CANDIDATES) break
    fencedMatch = fencedRegex.exec(raw)
  }

  const firstArrayStart = raw.indexOf('[')
  const lastArrayEnd = raw.lastIndexOf(']')
  if (firstArrayStart >= 0 && lastArrayEnd > firstArrayStart) {
    pushCandidate(raw.slice(firstArrayStart, lastArrayEnd + 1))
  }

  const firstObjectStart = raw.indexOf('{')
  const lastObjectEnd = raw.lastIndexOf('}')
  if (firstObjectStart >= 0 && lastObjectEnd > firstObjectStart) {
    pushCandidate(raw.slice(firstObjectStart, lastObjectEnd + 1))
  }

  for (const segment of extractBalancedJsonSegments(raw)) {
    pushCandidate(segment)
    if (candidates.length >= MAX_JSON_CANDIDATES) break
  }

  if (firstArrayStart >= 0) {
    pushCandidate(raw.slice(firstArrayStart))
  }
  if (firstObjectStart >= 0) {
    pushCandidate(raw.slice(firstObjectStart))
  }

  return candidates.slice(0, MAX_JSON_CANDIDATES)
}

const extractBalancedJsonSegments = (text) => {
  const segments = []
  const stack = []
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{' || char === '[') {
      stack.push({ char, index })
      continue
    }

    if (char !== '}' && char !== ']') continue

    if (stack.length === 0) continue

    const expected = char === '}' ? '{' : '['
    const top = stack[stack.length - 1]
    if (top.char !== expected) {
      continue
    }

    const open = stack.pop()
    const segment = text.slice(open.index, index + 1).trim()
    if (segment.startsWith('{') || segment.startsWith('[')) {
      segments.push(segment)
    }
  }

  return segments.sort((a, b) => b.length - a.length)
}

const parseJsonWithRepairs = (rawCandidate) => {
  const raw = String(rawCandidate || '').trim()
  if (!raw) return null

  const variants = []
  const seen = new Set()
  const pushVariant = (value) => {
    const text = String(value || '').trim()
    if (!text) return
    if (seen.has(text)) return
    seen.add(text)
    variants.push(text)
  }

  pushVariant(raw)

  const normalized = normalizeJsonPunctuation(raw)
  pushVariant(normalized)

  const noTrailingCommas = removeTrailingCommas(normalized)
  pushVariant(noTrailingCommas)

  const completed = completeJsonTail(noTrailingCommas)
  pushVariant(completed)

  for (const variant of variants) {
    const parsed = tryParseJson(variant)
    if (parsed !== null) {
      return parsed
    }
  }

  return null
}

const normalizeJsonPunctuation = (text) => {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00A0/g, ' ')
}

const removeTrailingCommas = (text) => String(text || '').replace(/,(\s*[}\]])/g, '$1')

const completeJsonTail = (text) => {
  const raw = String(text || '').trim()
  if (!raw) return raw

  const closers = []
  let inString = false
  let escaped = false

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      closers.push('}')
      continue
    }

    if (char === '[') {
      closers.push(']')
      continue
    }

    if (char === '}' || char === ']') {
      const expected = char
      if (closers.length === 0 || closers[closers.length - 1] !== expected) {
        return raw
      }
      closers.pop()
    }
  }

  if (closers.length === 0) return raw

  return `${raw}${closers.slice().reverse().join('')}`
}

const tryParseJson = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const resolveDialoguePayload = (parsed) => {
  if (Array.isArray(parsed)) {
    return parsed
  }

  if (!parsed || typeof parsed !== 'object') {
    return null
  }

  const object = parsed

  if (Array.isArray(object.dialogues)) return object.dialogues
  if (Array.isArray(object.lines)) return object.lines
  if (Array.isArray(object.script)) return object.script
  if (Array.isArray(object.story)) return object.story
  if (Array.isArray(object.data)) return object.data
  if (Array.isArray(object.items)) return object.items

  if (object.speaker || object.s || object.text || object.t || object.content || object.line) {
    return [object]
  }

  return null
}

/**
 * 规范化对话数据
 * @param {Array|Object} data - 解析后的数据
 * @returns {Array} 规范化的对话数组
 */
const normalizeDialogues = (data) => {
  const items = Array.isArray(data) ? data : [data]

  return items
    .map((item, index) => normalizeDialogueItem(item, index))
    .filter(Boolean)
}

/**
 * 规范化单条对话数据
 * @param {Object} item - 原始对话数据
 * @param {number} index - 索引
 * @returns {Object|null} 规范化的对话对象
 */
const normalizeDialogueItem = (item, index) => {
  if (!item) return null

  if (typeof item === 'string') {
    const text = normalizeText(item)
    if (!text) return null
    return {
      id: `dialogue_${Date.now()}_${index}`,
      speaker: '旁白',
      emotion: 'default',
      text,
      highlight: false,
      storyTime: '',
      choices: null,
      scene: null,
      metadata: {
        rawSpeaker: '',
        rawEmotion: '',
        rawStoryTime: '',
        rawScene: null,
      },
    }
  }

  if (typeof item !== 'object') return null

  const storyTime = normalizeStoryTime(
    item.storyTime ??
    item.time ??
    item.date ??
    item.d ??
    item.st,
  )

  const text = normalizeText(
    item.text ??
    item.t ??
    item.content ??
    item.line ??
    item.dialogue,
  )
  if (!text) return null

  return {
    id: `dialogue_${Date.now()}_${index}`,
    speaker: normalizeSpeaker(item.speaker ?? item.s ?? item.name ?? item.role),
    emotion: normalizeEmotion(item.emotion ?? item.e ?? item.mood),
    text,
    highlight: normalizeHighlight(item.highlight ?? item.h ?? item.focus),
    storyTime,
    choices: normalizeChoices(item.choices ?? item.c),
    scene: normalizeScene(item.scene ?? item.sc), // 场景切换指令
    metadata: {
      rawSpeaker: item.speaker ?? item.s ?? item.name ?? item.role,
      rawEmotion: item.emotion ?? item.e ?? item.mood,
      rawStoryTime: item.storyTime ?? item.time ?? item.date ?? item.d ?? item.st,
      rawScene: item.scene ?? item.sc,
    },
  }
}

const normalizeHighlight = (value) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value || '').trim().toLowerCase()
  if (!text) return false
  return text === '1' || text === 'true' || text === 'yes' || text === 'y'
}

/**
 * 规范化场景数据
 * @param {any} scene - 原始场景数据
 * @returns {Object|null} 规范化的场景对象或 null
 */
const normalizeScene = (scene) => {
  if (!scene) return null

  if (typeof scene === 'string') {
    const str = String(scene).trim()
    if (!str) return null
    return {
      id: str,
      name: str,
      background: '',
    }
  }

  if (typeof scene === 'object') {
    const id = String(scene.id ?? scene.sceneId ?? scene.i ?? '').trim()
    const name = String(scene.name ?? scene.sceneName ?? scene.n ?? '').trim()
    const background = String(scene.background ?? scene.bg ?? scene.b ?? '').trim()

    if (!id && !name) return null

    return {
      id: id || name,
      name: name || id,
      background,
    }
  }

  return null
}

/**
 * 规范化选项数据
 * @param {Object} choices - 原始选项数据
 * @returns {Object|null} 规范化的选项对象或 null
 */
const normalizeChoices = (choices) => {
  if (!choices) {
    return null
  }

  let optionsSource = []
  let promptSource = '你要怎么做？'
  let allowCustomSource = true

  if (Array.isArray(choices)) {
    optionsSource = choices
  } else if (typeof choices === 'object') {
    optionsSource = Array.isArray(choices.options)
      ? choices.options
      : (Array.isArray(choices.o)
        ? choices.o
        : (Array.isArray(choices.items) ? choices.items : []))
    promptSource = choices.prompt ?? choices.p ?? choices.question ?? promptSource
    allowCustomSource = choices.allowCustomInput ?? choices.i ?? choices.allowInput ?? true
  } else {
    return null
  }

  const options = optionsSource
    .map((opt, optIndex) => {
      if (typeof opt === 'string') {
        const text = String(opt).trim()
        if (!text) return null
        return {
          id: `choice_${Date.now()}_${optIndex}`,
          text,
          action: `choice_${optIndex + 1}`,
        }
      }

      if (!opt || typeof opt !== 'object') return null

      const text = String(opt.text ?? opt.t ?? opt.label ?? '').trim()
      if (!text) return null

      const actionRaw = String(opt.action ?? opt.a ?? opt.id ?? '').trim()
      return {
        id: `choice_${Date.now()}_${optIndex}`,
        text,
        action: actionRaw || `choice_${optIndex + 1}`,
      }
    })
    .filter(Boolean)

  if (options.length === 0) {
    return null
  }

  const prompt = String(promptSource).trim() || '你要怎么做？'

  return {
    prompt,
    options,
    allowCustomInput: normalizeHighlight(allowCustomSource),
  }
}

/**
 * 规范化说话者名称
 * @param {any} speaker - 原始说话者
 * @returns {string} 规范化的说话者名称
 */
const normalizeSpeaker = (speaker) => {
  if (!speaker) return '旁白'
  const str = String(speaker).trim()
  return str || '旁白'
}

/**
 * 规范化表情标识
 * @param {any} emotion - 原始表情
 * @returns {string} 规范化的表情标识
 */
const normalizeEmotion = (emotion) => {
  if (!emotion) return 'default'

  const str = String(emotion).trim().toLowerCase()
  if (isValidEmotion(str)) {
    return str
  }

  const preset = EMOTION_PRESETS.find((item) => (
    item.label === str ||
    item.id === str ||
    item.label.includes(str) ||
    str.includes(item.label)
  ))

  return preset ? preset.id : 'default'
}

/**
 * 规范化对话文本
 * @param {any} text - 原始文本
 * @returns {string} 规范化的文本
 */
const normalizeText = (text) => {
  if (!text) return ''
  return String(text).trim()
}

/**
 * 规范化剧情时间文本
 * @param {any} storyTime - 原始剧情时间
 * @returns {string} 规范化后的时间文本
 */
const normalizeStoryTime = (storyTime) => {
  if (!storyTime) return ''
  return String(storyTime).trim()
}

/**
 * 验证对话数据是否有效
 * @param {Object} dialogue - 对话对象
 * @returns {boolean} 是否有效
 */
export const validateDialogue = (dialogue) => {
  if (!dialogue || typeof dialogue !== 'object') return false
  if (!dialogue.speaker || typeof dialogue.speaker !== 'string') return false
  if (!dialogue.text || typeof dialogue.text !== 'string') return false
  return true
}

/**
 * 将对话数据转换为游戏脚本格式
 * @param {Array} dialogues - 对话数组
 * @returns {Array} 游戏脚本格式的对话数组
 */
export const toGameScript = (dialogues) => {
  return dialogues.map((dialogue) => ({
    speaker: dialogue.speaker,
    emotion: dialogue.emotion,
    text: dialogue.text,
    highlight: dialogue.highlight,
    storyTime: dialogue.storyTime,
    choices: dialogue.choices,
    scene: dialogue.scene,
  }))
}

/**
 * 从对话中提取高亮角色
 * @param {Array} dialogues - 对话数组
 * @returns {Array} 需要高亮的角色名称列表
 */
export const extractHighlightCharacters = (dialogues) => {
  return dialogues
    .filter((dialogue) => dialogue.highlight)
    .map((dialogue) => dialogue.speaker)
    .filter((value, index, array) => array.indexOf(value) === index)
}

/**
 * 获取表情的显示标签
 * @param {string} emotionId - 表情ID
 * @returns {string} 显示标签
 */
export const getEmotionDisplayLabel = (emotionId) => {
  const preset = EMOTION_PRESETS.find((item) => item.id === emotionId)
  return preset ? preset.label : '默认'
}

/**
 * 创建对话摘要（用于调试和日志）
 * @param {Array} dialogues - 对话数组
 * @returns {string} 摘要文本
 */
export const createDialogueSummary = (dialogues) => {
  if (!dialogues || dialogues.length === 0) {
    return '无对话'
  }

  return dialogues.map((dialogue) => {
    const emotion = dialogue.emotion !== 'default' ? `[${getEmotionDisplayLabel(dialogue.emotion)}]` : ''
    const highlight = dialogue.highlight ? '★' : ''
    return `${highlight}${dialogue.speaker}${emotion}: ${dialogue.text.slice(0, 30)}...`
  }).join('\n')
}

/**
 * 检查对话是否包含选项
 * @param {Object} dialogue - 对话对象
 * @returns {boolean} 是否包含选项
 */
export const hasChoices = (dialogue) => {
  return dialogue && dialogue.choices && dialogue.choices.options && dialogue.choices.options.length > 0
}

/**
 * 从对话中提取选项
 * @param {Object} dialogue - 对话对象
 * @returns {Object|null} 选项对象或 null
 */
export const extractChoices = (dialogue) => {
  if (!hasChoices(dialogue)) {
    return null
  }
  return dialogue.choices
}

export default {
  parseStoryContent,
  validateDialogue,
  toGameScript,
  extractHighlightCharacters,
  getEmotionDisplayLabel,
  createDialogueSummary,
  hasChoices,
  extractChoices,
}
