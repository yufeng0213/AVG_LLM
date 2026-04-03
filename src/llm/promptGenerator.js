/**
 * Prompt 生成器
 * 根据世界书、角色信息和当前剧情生成完整的 Prompt
 */

import { EMOTION_PRESETS } from '../worldbook/emotionPresets'

/**
 * 生成完整的剧情生成 Prompt
 * @param {Object} params - 参数对象
 * @param {Object} params.worldBook - 世界书数据
 * @param {Array} params.dialogueHistory - 对话历史
 * @param {Object} params.currentLine - 当前对话行
 * @param {Array} params.sceneCharacters - 场景角色列表
 * @param {string} params.userInput - 用户输入（可选）
 * @param {number} params.messageCount - 生成消息条数（默认3）
 * @returns {string} 完整的 prompt
 */
export const buildStoryPrompt = (params) => {
  const { worldBook, dialogueHistory, currentLine, sceneCharacters, userInput, messageCount = 3, selectedChoice } = params

  const sections = []

  // 1. 世界设定部分
  if (worldBook) {
    sections.push(buildWorldSettingSection(worldBook))
  }

  // 2. 角色信息部分
  if (sceneCharacters && sceneCharacters.length > 0) {
    sections.push(buildCharactersSection(worldBook, sceneCharacters))
  }

  // 3. 当前剧情上下文
  if (dialogueHistory && dialogueHistory.length > 0) {
    sections.push(buildDialogueHistorySection(dialogueHistory, currentLine))
  }

  // 4. 用户指令（包含消息条数和选择的选项）
  sections.push(buildInstructionSection(userInput, messageCount, selectedChoice, worldBook))

  return sections.filter(Boolean).join('\n\n---\n\n')
}

/**
 * 构建世界设定部分
 * @param {Object} worldBook - 世界书数据
 * @returns {string} 世界设定文本
 */
const buildWorldSettingSection = (worldBook) => {
  const lines = ['## 世界设定']

  if (worldBook.title) {
    lines.push(`**世界名称**: ${worldBook.title}`)
  }

  if (worldBook.summary) {
    lines.push(`**简介**: ${worldBook.summary}`)
  }

  const entries = worldBook.entries || {}
  const entryLabels = {
    overview: '世界概述',
    era: '时代背景',
    regions: '地理与区域',
    forces: '主要势力',
    rules: '世界规则',
    culture: '社会文化',
    conflict: '核心冲突',
    secrets: '秘密与禁忌',
    storyHook: '开局前提',
  }

  for (const [key, label] of Object.entries(entryLabels)) {
    if (entries[key] && entries[key].trim()) {
      lines.push(`**${label}**: ${entries[key].trim()}`)
    }
  }

  return lines.join('\n')
}

/**
 * 构建角色信息部分
 * @param {Object} worldBook - 世界书数据
 * @param {Array} sceneCharacters - 场景角色列表
 * @returns {string} 角色信息文本
 */
const buildCharactersSection = (worldBook, sceneCharacters) => {
  const lines = ['## 角色信息']
  lines.push('')
  lines.push('### 可用表情列表')
  
  // 列出所有可用表情
  const emotionList = EMOTION_PRESETS
    .filter(e => e.id !== 'custom')
    .map(e => `${e.id}(${e.label})`)
    .join('、')
  lines.push(emotionList)
  lines.push('')

  // 用户角色
  if (worldBook?.userProfile) {
    const user = worldBook.userProfile
    lines.push('### 玩家角色')
    lines.push(`**名称**: ${user.name || '你'}`)
    if (user.nickname) lines.push(`**昵称**: ${user.nickname}`)
    if (user.appearance) lines.push(`**外貌**: ${user.appearance}`)
    if (user.identity) lines.push(`**身份**: ${user.identity}`)
    if (user.background) lines.push(`**背景**: ${user.background}`)
    lines.push('')
  }

  // 其他角色
  if (worldBook?.characters && worldBook.characters.length > 0) {
    lines.push('### 其他角色')
    
    for (const char of worldBook.characters) {
      const charInfo = []
      charInfo.push(`**${char.name || '未命名角色'}**`)
      if (char.nickname) charInfo.push(`  - 昵称: ${char.nickname}`)
      if (char.appearance) charInfo.push(`  - 外貌: ${char.appearance}`)
      if (char.identity) charInfo.push(`  - 身份: ${char.identity}`)
      if (char.background) charInfo.push(`  - 背景: ${char.background}`)
      if (char.notes) charInfo.push(`  - 备注: ${char.notes}`)
      
      lines.push(charInfo.join('\n'))
      lines.push('')
    }
  }

  // 场景角色映射
  lines.push('### 当前场景角色')
  for (const char of sceneCharacters) {
    lines.push(`- ${char.name} (${char.role})`)
  }

  return lines.join('\n')
}

/**
 * 构建对话历史部分
 * @param {Array} history - 对话历史
 * @param {Object} currentLine - 当前对话
 * @returns {string} 对话历史文本
 */
const buildDialogueHistorySection = (history, currentLine) => {
  const lines = ['## 剧情上下文']
  lines.push('')
  lines.push('### 已发生的对话')
  
  // 只取最近的对话，避免 prompt 过长
  const recentHistory = history.slice(-10)
  
  for (const line of recentHistory) {
    const emotionLabel = getEmotionDisplay(line.emotion)
    if (line.speaker === '旁白') {
      lines.push(`[旁白] ${line.text}`)
    } else {
      lines.push(`**${line.speaker}**${emotionLabel}: ${line.text}`)
    }
  }

  if (currentLine) {
    lines.push('')
    lines.push('### 当前对话')
    const emotionLabel = getEmotionDisplay(currentLine.emotion)
    if (currentLine.speaker === '旁白') {
      lines.push(`[旁白] ${currentLine.text}`)
    } else {
      lines.push(`**${currentLine.speaker}**${emotionLabel}: ${currentLine.text}`)
    }
  }

  return lines.join('\n')
}

/**
 * 构建指令部分
 * @param {string} userInput - 用户输入
 * @param {number} messageCount - 生成消息条数
 * @param {Object} selectedChoice - 用户选择的选项（可选）
 * @returns {string} 指令文本
 */
const buildInstructionSection = (userInput, messageCount = 3, selectedChoice = null, worldBook = null) => {
  const lines = ['## 生成指令']
  lines.push('')
  lines.push('请根据以上世界设定、角色信息和剧情上下文，生成接下来的剧情发展。')
  lines.push('')
  lines.push('### 输出要求')
  lines.push('1. 严格按照 JSON 数组格式输出')
  lines.push('2. 每条对话包含: speaker(说话者)、emotion(表情)、text(内容)、highlight(是否高亮)')
  lines.push('3. 说话者必须是已定义的角色名称或"旁白"')
  lines.push('4. 表情必须使用指定的表情标识')
  lines.push('5. highlight 为 true 时表示该角色立绘需要高亮')
  lines.push(`6. 必须生成 ${messageCount} 条对话`)
  lines.push('7. 在剧情关键节点，为最后一条对话添加 choices 字段提供选项')
  lines.push('8. 可选: 使用 scene 字段切换场景背景')
  
  // 添加场景指令说明
  lines.push('')
  lines.push('### 场景切换指令')
  lines.push('当需要切换背景场景时，在对话中添加 scene 字段:')
  lines.push('```json')
  lines.push('{')
  lines.push('  "speaker": "旁白",')
  lines.push('  "text": "场景描述...",')
  lines.push('  "scene": {')
  lines.push('    "id": "场景ID",')
  lines.push('    "name": "场景名称"')
  lines.push('  }')
  lines.push('}')
  lines.push('```')
  
  // 如果世界书有场景配置，列出可用场景
  if (worldBook?.scenes && worldBook.scenes.length > 0) {
    lines.push('')
    lines.push('### 可用场景列表')
    for (const scene of worldBook.scenes) {
      lines.push(`- ${scene.id}: ${scene.name}${scene.description ? ` (${scene.description})` : ''}`)
    }
  }
  
  // 如果用户选择了某个选项，添加到指令中
  if (selectedChoice) {
    lines.push('')
    lines.push('### 玩家选择')
    lines.push(`玩家选择了: "${selectedChoice.text}"`)
    if (selectedChoice.isCustomInput) {
      lines.push('(这是玩家自定义输入的内容)')
    }
    lines.push('请根据这个选择继续发展剧情。')
  }
  
  if (userInput && userInput.trim()) {
    lines.push('')
    lines.push('### 用户指定方向')
    lines.push(userInput.trim())
  }

  return lines.join('\n')
}

/**
 * 获取表情显示文本
 * @param {string} emotion - 表情标识
 * @returns {string} 表情显示文本
 */
const getEmotionDisplay = (emotion) => {
  if (!emotion || emotion === 'default') return ''
  const preset = EMOTION_PRESETS.find(e => e.id === emotion)
  return preset ? ` [${preset.label}]` : ''
}

/**
 * 构建简单的剧情生成 Prompt（用于快速生成）
 * @param {Object} worldBook - 世界书数据
 * @param {Array} recentLines - 最近的对话
 * @returns {string} 简化的 prompt
 */
export const buildQuickPrompt = (worldBook, recentLines) => {
  const lines = []
  
  // 简化的世界信息
  if (worldBook?.title) {
    lines.push(`世界: ${worldBook.title}`)
  }
  if (worldBook?.entries?.overview) {
    lines.push(`概述: ${worldBook.entries.overview}`)
  }
  
  // 角色名称列表
  const charNames = []
  if (worldBook?.userProfile?.name) {
    charNames.push(worldBook.userProfile.name)
  }
  if (worldBook?.characters) {
    charNames.push(...worldBook.characters.map(c => c.name).filter(Boolean))
  }
  if (charNames.length > 0) {
    lines.push(`角色: ${charNames.join('、')}`)
  }
  
  // 最近对话
  if (recentLines && recentLines.length > 0) {
    lines.push('')
    lines.push('最近对话:')
    for (const line of recentLines.slice(-5)) {
      if (line.speaker === '旁白') {
        lines.push(`[旁白] ${line.text}`)
      } else {
        lines.push(`${line.speaker}: ${line.text}`)
      }
    }
  }
  
  lines.push('')
  lines.push('请生成接下来的剧情（JSON格式，包含speaker、emotion、text、highlight字段）:')
  
  return lines.join('\n')
}

export default {
  buildStoryPrompt,
  buildQuickPrompt,
}