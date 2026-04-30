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

/**
 * 解析剧情券返回的自定义协议内容（|s=|e=|t=|d=|h=|sc=|）
 * @param {string} content - LLM 返回的原始内容
 * @returns {Object} 解析结果
 */
export const parseStoryTicketContent = (content) => {
  if (!content || typeof content !== 'string') {
    return {
      success: false,
      error: '内容为空或格式错误',
      dialogues: [],
      rawContent: content,
    }
  }

  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  const dialogues = []
  let sceneBuffer = null

  for (const line of lines) {
    // 结束标记
    if (line === '|END|' || line === '|end|') break

    // 场景切换标记 |sc=场景ID|场景名称|
    const scMatch = line.match(/^\|sc=([^|]*)\|([^|]*)\|$/)
    if (scMatch) {
      sceneBuffer = {
        id: scMatch[1].trim(),
        name: scMatch[2].trim(),
      }
      continue
    }

    // 对话行 |s=说话者|e=情绪|t=内容|d=时间|h=高光|
    if (line.startsWith('|s=')) {
      const parsed = parseTicketLine(line, dialogues.length)
      if (parsed) {
        if (sceneBuffer) {
          parsed.scene = sceneBuffer
          sceneBuffer = null
        }
        dialogues.push(parsed)
      }
    }
  }

  if (dialogues.length === 0) {
    return {
      success: false,
      error: '未能解析到任何对话条目',
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

/**
 * 解析单行剧情券协议
 */
const parseTicketLine = (line, index) => {
  // 使用正则逐字段提取
  const fields = {}
  // 移除首尾 |
  const inner = line.replace(/^\|/, '').replace(/\|$/, '')
  const segments = inner.split('|')

  for (const seg of segments) {
    const eqIdx = seg.indexOf('=')
    if (eqIdx === -1) continue
    const key = seg.substring(0, eqIdx).trim()
    const val = seg.substring(eqIdx + 1).trim()
    if (key && val) fields[key] = val
  }

  const text = fields.t || fields.text
  if (!text) return null

  const storyTime = fields.d || fields.storyTime || ''
  const speaker = normalizeSpeaker(fields.s || fields.speaker)
  const emotion = normalizeEmotion(fields.e || fields.emotion)
  const highlight = normalizeHighlight(fields.h || fields.highlight)

  return {
    id: `ticket_dialogue_${Date.now()}_${index}`,
    speaker,
    emotion,
    text,
    highlight,
    storyTime,
    choices: null,
    scene: null,
    metadata: {
      rawSpeaker: fields.s || '',
      rawEmotion: fields.e || '',
      rawStoryTime: fields.d || '',
      rawScene: null,
    },
  }
}

/**
 * 计算剧情内容中的中文字数（不含标记符号）
 * @param {string} content - 原始内容
 * @returns {number} 中文字数
 */
/**
 * 解析 LLM 返回的 XML + 思维链格式剧情
 * @param {string} content - LLM 返回的原始内容
 * @returns {Object|null} 解析结果，若不是 XML 格式则返回 null
 */
export const parseXmlStoryContent = (content) => {
  if (!content || typeof content !== 'string') return null

  const raw = String(content).trim()
  if (!raw) return null

  // 移除 thinking 块
  const withoutThinking = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim()
  if (!withoutThinking) return null

  // 移除 markdown 代码块包裹
  const cleaned = withoutThinking
    .replace(/^```(?:xml)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const dialogues = []
  let pendingScene = null
  let lastDialogueIndex = null
  let chapterInfo = null

  // 解析章节标签 <chapter major="1" minor="1" name="初遇" s="本章主线概要"/>
  const chRegex = /<chapter\s+major=["'](\d+)["']\s+minor=["'](\d+)["']\s+name=["']([^"']*)["']\s+s=["']([^"']*)["']\s*\/>/gi
  const chMatch = chRegex.exec(cleaned)
  if (chMatch) {
    chapterInfo = {
      major: Number(chMatch[1]),
      minor: Number(chMatch[2]),
      name: chMatch[3].trim(),
      storyline: chMatch[4].trim(),
    }
  }

  // 全局正则匹配，支持标签跨行
  // 匹配场景切换
  const scRegex = /<sc\s+id=["']([^"']*)["'](?:\s+n=["']([^"']*)["'])?\s*\/>/gi
  let scMatch
  while ((scMatch = scRegex.exec(cleaned)) !== null) {
    const sceneId = (scMatch[1] || '').trim()
    const sceneName = (scMatch[2] || '').trim() || sceneId
    if (sceneId || sceneName) {
      pendingScene = { id: sceneId || sceneName, name: sceneName || sceneId, background: '' }
    }
  }

  // 匹配对话 <d ...>text</d>
  const dRegex = /<d(\s+[^>]*)>([\s\S]*?)<\/d>/gi
  let dMatch
  while ((dMatch = dRegex.exec(cleaned)) !== null) {
    const attrs = dMatch[1] || ''
    const text = (dMatch[2] || '').trim()
    if (!text) continue

    const sMatch = attrs.match(/\bs=["']([^"']*)["']/i)
    const eMatch = attrs.match(/\be=["']([^"']*)["']/i)
    const dAttrMatch = attrs.match(/\bd=["']([^"']*)["']/i)
    const hMatch = attrs.match(/\bh=["']([^"']*)["']/i)

    const speaker = normalizeSpeaker(sMatch?.[1])
    const emotion = normalizeEmotion(eMatch?.[1])
    const storyTime = dAttrMatch?.[1]?.trim() || ''
    const highlight = normalizeHighlight(hMatch?.[1])

    const entry = {
      id: `xml_dialogue_${Date.now()}_${dialogues.length}`,
      speaker,
      emotion,
      text,
      highlight,
      storyTime,
      choices: null,
      scene: pendingScene ? { ...pendingScene } : null,
      metadata: {
        rawSpeaker: sMatch?.[1] || '',
        rawEmotion: eMatch?.[1] || '',
        rawStoryTime: dAttrMatch?.[1] || '',
        rawScene: pendingScene ? { ...pendingScene } : null,
      },
    }
    dialogues.push(entry)
    lastDialogueIndex = dialogues.length - 1
    pendingScene = null
  }

  // 匹配选项 <choices ...>...</choices>
  const cRegex = /<choices(\s+[^>]*)>([\s\S]*?)<\/choices>/gi
  let cMatch
  while ((cMatch = cRegex.exec(cleaned)) !== null) {
    if (lastDialogueIndex === null) continue
    const cAttrs = cMatch[1] || ''
    const cBody = cMatch[2] || ''

    const pMatch = cAttrs.match(/\bp=["']([^"']*)["']/i)
    const iMatch = cAttrs.match(/\bi=["']([^"']*)["']/i)
    const prompt = pMatch?.[1]?.trim() || '你要怎么做？'
    const allowCustom = normalizeHighlight(iMatch?.[1])

    const options = []
    const oRegex = /<o(\s+[^>]*)\s*\/>/gi
    let oMatch
    while ((oMatch = oRegex.exec(cBody)) !== null) {
      const oAttrs = oMatch[1] || ''
      const tMatch = oAttrs.match(/\bt=["']([^"']*)["']/i)
      const aMatch = oAttrs.match(/\ba=["']([^"']*)["']/i)
      const optText = tMatch?.[1]?.trim()
      if (optText) {
        options.push({
          id: `xml_choice_${Date.now()}_${options.length}`,
          text: optText,
          action: aMatch?.[1]?.trim() || `choice_${options.length + 1}`,
        })
      }
    }

    if (options.length >= 2) {
      dialogues[lastDialogueIndex].choices = {
        prompt,
        options,
        allowCustomInput: allowCustom,
      }
    }
  }

  if (dialogues.length === 0) return null

  return { success: true, error: null, dialogues, rawContent: content, chapter: chapterInfo }
}

/**
 * 解析主线剧情返回的分隔符格式内容
 * @param {string} content - LLM 返回的原始内容
 * @returns {Object} 解析结果
 */
export const parseMainStoryContent = (content) => {
  if (!content || typeof content !== 'string') {
    return { success: false, error: '内容为空或格式错误', dialogues: [], rawContent: content }
  }
  const blocks = content.split('\n---\n').map(b => b.trim()).filter(Boolean)
  const dialogues = []
  let pendingScene = null
  let chapterInfo = null
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) continue
    const header = lines[0]
    // 章节标记 [chapter|大章-小节|名称|主线概要]
    const chapterMatch = header.match(/^\[chapter\|(\d+)-(\d+)\|([^\]]*)\]$/)
    if (chapterMatch) {
      const major = Number(chapterMatch[1])
      const minor = Number(chapterMatch[2])
      const rest = (chapterMatch[3] || '').trim()
      const pipeIdx = rest.indexOf('|')
      const name = pipeIdx >= 0 ? rest.substring(0, pipeIdx).trim() : rest
      const storyline = pipeIdx >= 0 ? rest.substring(pipeIdx + 1).trim() : ''
      if (major && minor) {
        chapterInfo = { major, minor, name, storyline }
      }
      continue
    }
    const narratorMatch = header.match(/^\[narrator\|([^\]]*)\]$/)
    if (narratorMatch) {
      const storyTime = narratorMatch[1].trim()
      const body = lines.slice(1).join('\n').trim()
      if (!body) continue
      dialogues.push({
        id: `story_${Date.now()}_${dialogues.length}`,
        speaker: '旁白', emotion: 'default', text: body, highlight: false,
        storyTime, choices: null,
        scene: pendingScene ? { ...pendingScene } : null,
        metadata: { rawSpeaker: '', rawEmotion: '', rawStoryTime: storyTime, rawScene: null },
      })
      pendingScene = null
      continue
    }
    const speakerMatch = header.match(/^\[s:([^|]*)\|e:([^|]*)\|d:([^\]]*)\]$/)
    if (speakerMatch) {
      const speaker = speakerMatch[1].trim() || '旁白'
      const emotion = normalizeEmotion(speakerMatch[2].trim())
      const storyTime = speakerMatch[3].trim()
      const body = lines.slice(1).join('\n').trim()
      if (!body) continue
      dialogues.push({
        id: `story_${Date.now()}_${dialogues.length}`,
        speaker: normalizeSpeaker(speaker), emotion, text: body, highlight: false,
        storyTime, choices: null,
        scene: pendingScene ? { ...pendingScene } : null,
        metadata: { rawSpeaker: speaker, rawEmotion: speakerMatch[2].trim(), rawStoryTime: storyTime, rawScene: null },
      })
      pendingScene = null
      continue
    }
    const sceneMatch = header.match(/^\[scene\|([^|]*)\|([^\]]*)\]$/)
    if (sceneMatch) {
      const sceneId = sceneMatch[1].trim()
      const sceneName = sceneMatch[2].trim()
      if (sceneId || sceneName) {
        pendingScene = { id: sceneId || sceneName, name: sceneName || sceneId, background: '' }
      }
      continue
    }
    const choicesMatch = header.match(/^\[choices\|([^\]]*)\]$/)
    if (choicesMatch) {
      const prompt = choicesMatch[1].trim() || '你要怎么做？'
      const optionLines = lines.slice(1)
      const cleanOptions = optionLines.filter(l => !l.match(/^\[i:/))
      const options = cleanOptions.map((optLine, idx) => {
        const gtIdx = optLine.indexOf('>')
        if (gtIdx === -1) return null
        const text = optLine.substring(0, gtIdx).trim()
        const action = optLine.substring(gtIdx + 1).trim()
        if (!text) return null
        return { id: `choice_${Date.now()}_${idx}`, text, action: action || `choice_${idx + 1}` }
      }).filter(Boolean)
      if (options.length > 0 && dialogues.length > 0) {
        dialogues[dialogues.length - 1].choices = {
          prompt, options,
          allowCustomInput: optionLines.some(l => l.match(/^\[i:[^]]*[1Yy]/)),
        }
      }
      continue
    }
  }
  if (dialogues.length === 0) { return parseStoryContent(content) }
  return { success: true, error: null, dialogues, rawContent: content, chapter: chapterInfo }
}

export const countChineseChars = (content) => {
  if (!content) return 0
  const matches = content.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)
  return matches ? matches.length : 0
}

/**
 * 解析短信 XML 格式内容（带思维链）
 * @param {string} content - LLM 返回的原始内容
 * @returns {Object} 解析结果
 */
export const parseSmsXmlContent = (content) => {
  if (!content || typeof content !== 'string') {
    return { success: false, error: '内容为空', replies: [], rawContent: content }
  }

  const raw = String(content).trim()
  if (!raw) return { success: false, error: '内容为空', replies: [], rawContent: content }

  // 提取思维链（正常闭合的情况）
  let thinking = ''
  const thinkMatch = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i)
  if (thinkMatch) {
    thinking = thinkMatch[1].trim()
  }

  // 移除 thinking 块（先尝试完整闭合的，再尝试不闭合的）
  let withoutThinking = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim()

  // 处理不闭合的 thinking 标签（被截断的情况）
  if (withoutThinking === raw) {
    // 检查是否有未闭合的 <thinking> 开头
    const openThinkMatch = raw.match(/<thinking>([\s\S]*)/i)
    if (openThinkMatch) {
      thinking = openThinkMatch[1].trim()
      // 移除从 <thinking> 到结尾的所有内容（因为没有闭合，后面可能是截断的thinking内容）
      withoutThinking = raw.replace(/<thinking>[\s\S]*$/gi, '').trim()
    }
  }

  if (!withoutThinking) {
    return { success: false, error: '只有思维链，无回复内容', replies: [], thinking, rawContent: content }
  }

  // 移除 markdown 代码块包裹
  const cleaned = withoutThinking
    .replace(/^```(?:xml)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const replies = []
  let redPacket = null
  let redPacketAction = null
  let giftToPlayer = null
  let calendarEvent = null
  const voiceMessages = []
  let sendFileIntent = false

  // 解析短信 <m e="表情">内容</m>
  const mRegex = /<m(\s+[^>]*)>([\s\S]*?)<\/m>/gi
  let mMatch
  while ((mMatch = mRegex.exec(cleaned)) !== null) {
    const attrs = mMatch[1] || ''
    const text = (mMatch[2] || '').trim()
    if (!text) continue

    // 提取表情属性
    const eMatch = attrs.match(/\be=["']([^"']*)["']/i)
    const emotion = eMatch?.[1]?.trim()?.toLowerCase() || 'neutral'

    // 验证表情是否有效
    const validEmotions = ['happy', 'sad', 'angry', 'shy', 'surprised', 'thinking', 'neutral', 'excited', 'worried']
    const finalEmotion = validEmotions.includes(emotion) ? emotion : 'neutral'

    replies.push({ text, emotion: finalEmotion })
  }

  // 解析红包 <rp a="金额" b="祝福语"/>
  const rpRegex = /<rp\s+a=["'](\d+)["']\s+b=["']([^"']*)["']\s*\/>/gi
  const rpMatch = rpRegex.exec(cleaned)
  if (rpMatch) {
    const amount = Number(rpMatch[1])
    const blessing = rpMatch[2].trim().slice(0, 30)
    if (amount >= 1 && amount <= 100) {
      redPacket = { amount: Math.round(amount), blessing: blessing || '小小意思，不成敬意~' }
    }
  }

  // 解析红包回应 <rpa a="accept|decline" r="反应"/>
  const rpaRegex = /<rpa\s+a=["'](accept|decline)["']\s+r=["']([^"']*)["']\s*\/>/gi
  const rpaMatch = rpaRegex.exec(cleaned)
  if (rpaMatch) {
    redPacketAction = {
      action: rpaMatch[1].toLowerCase(),
      remark: rpaMatch[2].trim().slice(0, 30),
    }
  }

  // 解析礼物 <gift n="物品名" m="赠送语"/>
  const giftRegex = /<gift\s+n=["']([^"']*)["']\s+m=["']([^"']*)["']\s*\/>/gi
  const giftMatch = giftRegex.exec(cleaned)
  if (giftMatch) {
    const itemName = giftMatch[1].trim()
    if (itemName) {
      giftToPlayer = {
        itemName,
        message: giftMatch[2].trim().slice(0, 40),
        count: 1,
      }
    }
  }

  // 解析日历提醒 <cal d="日期时间" t="标题">描述</cal>
  const calRegex = /<cal\s+d=["']([^"']*)["']\s+t=["']([^"']*)["']>([\s\S]*?)<\/cal>/gi
  const calMatch = calRegex.exec(cleaned)
  if (calMatch) {
    const dateStr = calMatch[1].trim()
    const title = calMatch[2].trim().slice(0, 20)
    const desc = calMatch[3].trim().slice(0, 50)
    if (dateStr && title) {
      calendarEvent = { date: dateStr, title, description: desc }
    }
  }

  // 解析语音 <v e="情绪">内容</v>
  const vRegex = /<v\s+e=["']([^"']*)["']>([\s\S]*?)<\/v>/gi
  let vMatch
  while ((vMatch = vRegex.exec(cleaned)) !== null) {
    const emotion = vMatch[1].trim().toLowerCase()
    const text = vMatch[2].trim()
    const validEmotions = ['happy', 'sad', 'angry', 'shy', 'surprised', 'thinking', 'neutral', 'excited', 'worried']
    if (text && validEmotions.includes(emotion)) {
      voiceMessages.push({ voiceText: text, voiceEmotion: emotion })
    }
  }

  // 解析文件发送意图 <sendfile/>
  sendFileIntent = /<sendfile\s*\/>/i.test(cleaned)

  if (replies.length === 0) {
    return { success: false, error: '未解析到短信内容', replies: [], thinking, rawContent: content }
  }

  return {
    success: true,
    error: null,
    replies,
    redPacket,
    redPacketAction,
    giftToPlayer,
    calendarEvent,
    voiceMessages,
    sendFileIntent,
    thinking,
    rawContent: content,
  }
}

/**
 * 解析辅助输出区块 <aux>
 * @param {string} content - LLM 返回的原始内容
 * @returns {Object|null} 解析结果，若无 aux 区块则返回 null
 */
export const parseAuxSection = (content) => {
  if (!content || typeof content !== 'string') return null

  const raw = String(content).trim()
  if (!raw) return null

  // 匹配 <aux> 区块
  const auxMatch = raw.match(/<aux>([\s\S]*?)<\/aux>/i)
  if (!auxMatch) {
    // 尝试匹配不完整闭合的 aux（可能被截断）
    const openMatch = raw.match(/<aux>([\s\S]*?)$/i)
    if (openMatch) {
      console.log('[Aux] 检测到未闭合的 <aux> 区块')
      return _parseAuxBody(openMatch[1] || '')
    }
    // 检查是否有 aux 标签但无内容
    if (raw.includes('<aux>') || raw.includes('<aux ')) {
      console.log('[Aux] 存在 aux 标签但无法解析完整区块')
    }
    return null
  }

  console.log('[Aux] 检测到完整的 <aux> 区块')
  return _parseAuxBody(auxMatch[1] || '')
}

/**
 * 解析 aux 区块内容
 */
function _parseAuxBody(auxBody) {
  if (!auxBody || !auxBody.trim()) return null

  const result = {
    events: [],
    memories: [],
    locations: [],
    npcInteractions: [],
    newCharacters: [],
  }

  // 解析事件 <event .../> - 支持任意属性顺序
  const eventMatches = auxBody.matchAll(/<event\s+([^>]+)\/>/gi)
  for (const match of eventMatches) {
    const attrs = match[1] || ''
    const parsed = _parseXmlAttrs(attrs)
    const type = parsed.t || parsed.type || 'other'
    const participantsRaw = parsed.p || parsed.participants || ''
    const participants = participantsRaw.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
    const summary = parsed.s || parsed.summary || ''
    if (participants.length > 0 && summary) {
      result.events.push({
        type: type.trim(),
        participants,
        summary: summary.trim().slice(0, 200),
        emotionalImpact: Math.max(1, Math.min(100, Number(parsed.i || parsed.impact || 20))),
      })
    }
  }

  // 解析角色记忆 <mem .../> - 支持新旧两种格式
  const memMatches = auxBody.matchAll(/<mem\s+([^>]+)\/>/gi)
  for (const match of memMatches) {
    const attrs = match[1] || ''
    const parsed = _parseXmlAttrs(attrs)
    // 新格式: c="角色名" txt="内容"，旧格式: c a t s
    const charId = parsed.c || parsed.char || parsed.characterId || ''
    const aboutId = parsed.a || parsed.about || '__player__' // 默认对玩家的印象
    const text = parsed.txt || parsed.t || parsed.text || parsed.content || ''
    const sentiment = Number(parsed.s || parsed.sentiment || 0)
    if (charId && text) {
      result.memories.push({
        characterId: charId.trim(),
        about: aboutId.trim(),
        content: text.trim().slice(0, 300),
        sentiment: Math.max(-100, Math.min(100, sentiment)),
      })
    }
  }

  // 解析新地点 <loc .../>
  const locMatches = auxBody.matchAll(/<loc\s+([^>]+)\/>/gi)
  for (const match of locMatches) {
    const attrs = match[1] || ''
    const parsed = _parseXmlAttrs(attrs)
    const name = parsed.n || parsed.name || ''
    const desc = parsed.d || parsed.desc || parsed.description || ''
    if (name) {
      result.locations.push({
        name: name.trim(),
        description: desc.trim().slice(0, 200),
      })
    }
  }

  // 解析NPC互动 <npc .../>
  const npcMatches = auxBody.matchAll(/<npc\s+([^>]+)\/>/gi)
  for (const match of npcMatches) {
    const attrs = match[1] || ''
    const parsed = _parseXmlAttrs(attrs)
    const charA = parsed.a || ''
    const charB = parsed.b || ''
    const location = parsed.l || parsed.loc || ''
    const summary = parsed.s || parsed.summary || ''
    if (charA && charB && summary) {
      result.npcInteractions.push({
        charA: charA.trim(),
        charB: charB.trim(),
        location: location.trim(),
        summary: summary.trim().slice(0, 200),
      })
    }
  }

  // 解析新角色 <new .../>
  const newMatches = auxBody.matchAll(/<new\s+([^>]+)\/>/gi)
  for (const match of newMatches) {
    const attrs = match[1] || ''
    const parsed = _parseXmlAttrs(attrs)
    const name = parsed.n || parsed.name || ''
    const desc = parsed.d || parsed.desc || ''
    if (name) {
      result.newCharacters.push({
        name: name.trim(),
        description: desc.trim().slice(0, 100),
      })
    }
  }

  // 检查是否有有效内容
  const hasContent = result.events.length > 0 ||
    result.memories.length > 0 ||
    result.locations.length > 0 ||
    result.npcInteractions.length > 0 ||
    result.newCharacters.length > 0

  if (!hasContent) {
    console.log('[Aux] 解析结果为空')
    return null
  }

  console.log('[Aux] 解析成功: events=' + result.events.length + ', memories=' + result.memories.length + ', locations=' + result.locations.length)
  return result
}

/**
 * 解析XML属性字符串，返回属性名到值的映射
 * 支持：name="value" 或 name='value'
 */
function _parseXmlAttrs(attrsStr) {
  const result = {}
  // 匹配 key="value" 或 key='value'
  const regex = /(\w+)=["']([^"']*)["']/g
  let match
  while ((match = regex.exec(attrsStr)) !== null) {
    result[match[1]] = match[2] || ''
  }
  return result
}

export default {
  parseStoryContent,
  parseXmlStoryContent,
  parseMainStoryContent,
  parseStoryTicketContent,
  parseSmsXmlContent,
  parseAuxSection,
  validateDialogue,
  toGameScript,
  extractHighlightCharacters,
  getEmotionDisplayLabel,
  createDialogueSummary,
  hasChoices,
  extractChoices,
  countChineseChars,
}
