/**
 * 剧情解析器
 * 解析 LLM 返回的 JSON 格式剧情，提取关键信息
 */

import { EMOTION_PRESETS, isValidEmotion } from '../worldbook/emotionPresets'

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

  // 尝试提取 JSON 内容
  const jsonMatch = extractJson(content)
  
  if (!jsonMatch) {
    return {
      success: false,
      error: '未能从返回内容中提取有效的 JSON 格式',
      dialogues: [],
      rawContent: content,
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch)
    const dialogues = normalizeDialogues(parsed)

    return {
      success: true,
      error: null,
      dialogues,
      rawContent: content,
    }
  } catch (err) {
    return {
      success: false,
      error: `JSON 解析失败: ${err.message}`,
      dialogues: [],
      rawContent: content,
    }
  }
}

/**
 * 从内容中提取 JSON 字符串
 * @param {string} content - 原始内容
 * @returns {string|null} JSON 字符串或 null
 */
const extractJson = (content) => {
  // 尝试匹配 ```json ... ``` 格式
  const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim()
  }

  // 尝试匹配 ``` ... ``` 格式
  const codeBlockMatch = content.match(/```\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch) {
    const inner = codeBlockMatch[1].trim()
    if (inner.startsWith('[') || inner.startsWith('{')) {
      return inner
    }
  }

  // 尝试直接匹配 JSON 数组
  const arrayMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/)
  if (arrayMatch) {
    return arrayMatch[0]
  }

  // 尝试匹配单个 JSON 对象
  const objectMatch = content.match(/\{\s*"speaker"[\s\S]*\}/)
  if (objectMatch) {
    // 包装成数组
    return `[${objectMatch[0]}]`
  }

  return null
}

/**
 * 规范化对话数据
 * @param {Array|Object} data - 解析后的数据
 * @returns {Array} 规范化的对话数组
 */
const normalizeDialogues = (data) => {
  // 如果是单个对象，转换为数组
  const items = Array.isArray(data) ? data : [data]

  return items.map((item, index) => normalizeDialogueItem(item, index))
}

/**
 * 规范化单条对话数据
 * @param {Object} item - 原始对话数据
 * @param {number} index - 索引
 * @returns {Object} 规范化的对话对象
 */
const normalizeDialogueItem = (item, index) => {
  return {
    id: `dialogue_${Date.now()}_${index}`,
    speaker: normalizeSpeaker(item.speaker),
    emotion: normalizeEmotion(item.emotion),
    text: normalizeText(item.text),
    highlight: Boolean(item.highlight),
    choices: normalizeChoices(item.choices),
    scene: normalizeScene(item.scene),  // 新增：场景切换指令
    metadata: {
      rawSpeaker: item.speaker,
      rawEmotion: item.emotion,
      rawScene: item.scene,
    },
  }
}

/**
 * 规范化场景数据
 * @param {any} scene - 原始场景数据
 * @returns {Object|null} 规范化的场景对象或 null
 */
const normalizeScene = (scene) => {
  // 没有场景数据
  if (!scene) return null
  
  // 如果是字符串，作为场景ID处理
  if (typeof scene === 'string') {
    const str = String(scene).trim()
    if (!str) return null
    return {
      id: str,
      name: str,
      background: '',
    }
  }
  
  // 如果是对象，规范化各字段
  if (typeof scene === 'object') {
    const id = String(scene.id || scene.sceneId || '').trim()
    const name = String(scene.name || scene.sceneName || '').trim()
    const background = String(scene.background || scene.bg || '').trim()
    
    // 至少需要有 id 或 name
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
  if (!choices || typeof choices !== 'object') {
    return null
  }

  // 验证必要字段
  if (!choices.prompt || !Array.isArray(choices.options) || choices.options.length === 0) {
    return null
  }

  return {
    prompt: String(choices.prompt).trim(),
    options: choices.options.map((opt, optIndex) => ({
      id: `choice_${Date.now()}_${optIndex}`,
      text: String(opt.text || '未知选项').trim(),
      action: opt.action || `custom_${optIndex}`,
    })),
    allowCustomInput: Boolean(choices.allowCustomInput),
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
  
  // 检查是否为有效表情
  if (isValidEmotion(str)) {
    return str
  }

  // 尝试匹配表情标签
  const preset = EMOTION_PRESETS.find(p => 
    p.label === str || 
    p.id === str ||
    p.label.includes(str) ||
    str.includes(p.label)
  )

  return preset ? preset.id : 'default'
}

/**
 * 规范化对话文本
 * @param {any} text - 原始文本
 * @returns {string} 规范化的文本
 */
const normalizeText = (text) => {
  if (!text) return '...'
  return String(text).trim() || '...'
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
  return dialogues.map(d => ({
    speaker: d.speaker,
    emotion: d.emotion,
    text: d.text,
    highlight: d.highlight,
    choices: d.choices, // 保留选项数据
  }))
}

/**
 * 从对话中提取高亮角色
 * @param {Array} dialogues - 对话数组
 * @returns {Array} 需要高亮的角色名称列表
 */
export const extractHighlightCharacters = (dialogues) => {
  return dialogues
    .filter(d => d.highlight)
    .map(d => d.speaker)
    .filter((v, i, a) => a.indexOf(v) === i) // 去重
}

/**
 * 获取表情的显示标签
 * @param {string} emotionId - 表情ID
 * @returns {string} 显示标签
 */
export const getEmotionDisplayLabel = (emotionId) => {
  const preset = EMOTION_PRESETS.find(p => p.id === emotionId)
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

  return dialogues.map(d => {
    const emotion = d.emotion !== 'default' ? `[${getEmotionDisplayLabel(d.emotion)}]` : ''
    const highlight = d.highlight ? '★' : ''
    return `${highlight}${d.speaker}${emotion}: ${d.text.slice(0, 30)}...`
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