/**
 * Prompt 生成器
 * 根据世界书、角色信息和当前剧情生成完整的 Prompt
 */

import { EMOTION_PRESETS } from '../worldbook/emotionPresets'
import {
  CHARACTER_PERSONALITY_DIMENSION_DEFS,
  normalizePersonalityProfile,
} from '../worldbook/worldBookStore'
import {
  getRelationshipLevel,
  getRelationshipDescription,
  getRelationshipInfluenceHint,
  RELATIONSHIP_LEVELS,
} from '../relationship/relationshipLevels.js'
import {
  getCharacterRelationship,
  getAllRelationships,
} from '../relationship/relationshipStore.js'

const personalityDimensionDefs = CHARACTER_PERSONALITY_DIMENSION_DEFS

const parsePersonalityDimensionValue = (value) => {
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) {
    return 50
  }
  return Math.min(100, Math.max(0, Math.round(parsed)))
}

const getCharacterPersonalityProfile = (char) => {
  return normalizePersonalityProfile(
    char?.personalityProfile ||
    char?.personality_profile ||
    char?.personality ||
    char,
  )
}

const getCustomPersonalityDimensions = (cognitiveDimensions) => {
  return personalityDimensionDefs
    .map((dimension) => {
      const value = parsePersonalityDimensionValue(cognitiveDimensions?.[dimension.key])
      return {
        key: dimension.key,
        value,
      }
    })
    .filter((item) => item.value !== 50)
}

const normalizeStoryTimeText = (value) => String(value || '').trim()

const resolveLineStoryTime = (line) => {
  if (!line || typeof line !== 'object') {
    return ''
  }
  return normalizeStoryTimeText(line.storyTime || line.time || line.date)
}

/**
 * 生成完整的剧情生成 Prompt
 * @param {Object} params - 参数对象
 * @param {Object} params.worldBook - 世界书数据
 * @param {Object} params.narratorProfile - 叙事者配置（可选）
 * @param {Array} params.dialogueHistory - 对话历史
 * @param {Object} params.currentLine - 当前对话行
 * @param {Array} params.sceneCharacters - 场景角色列表
 * @param {Array} params.relationshipSnapshot - 角色关系快照（可选）
 * @param {Array} params.relationshipLedger - 关系变更数据表（可选）
 * @param {Array} params.directorDirectives - 导演器指令列表（可选）
 * @param {string} params.userInput - 用户输入（可选）
 * @param {string} params.currentStoryTime - 当前剧情时间（可选）
 * @param {number} params.messageCount - 生成消息条数（默认3）
 * @param {number} params.contextLineCount - 发送给 LLM 的剧情上下文条数（默认10）
 * @returns {string} 完整的 prompt
 */
export const buildStoryPrompt = (params) => {
  const {
    worldBook,
    narratorProfile,
    dialogueHistory,
    currentLine,
    sceneCharacters,
    relationshipSnapshot,
    relationshipLedger,
    directorDirectives,
    userInput,
    currentStoryTime,
    messageCount = 3,
    selectedChoice,
    contextLineCount = 10,
  } = params

  const sections = []

  // 1. 世界设定部分
  if (worldBook) {
    sections.push(buildWorldSettingSection(worldBook))
  }

  // 2. 叙事者风格部分
  if (narratorProfile) {
    sections.push(buildNarratorSection(narratorProfile))
  }

  // 3. 角色信息部分
  if (sceneCharacters && sceneCharacters.length > 0) {
    sections.push(buildCharactersSection(worldBook, sceneCharacters))
  }

  // 4. 角色关系状态
  if (Array.isArray(relationshipSnapshot) && relationshipSnapshot.length > 0) {
    sections.push(buildRelationshipSection(relationshipSnapshot))
  }

  // 5. 关系推进数据表（历史趋势）
  if (Array.isArray(relationshipLedger) && relationshipLedger.length > 0) {
    sections.push(buildRelationshipLedgerSection(relationshipLedger))
  }

  // 6. 导演器约束
  if (Array.isArray(directorDirectives) && directorDirectives.length > 0) {
    sections.push(buildDirectorDirectiveSection(directorDirectives))
  }

  // 7. 当前剧情上下文
  if (dialogueHistory && dialogueHistory.length > 0) {
    sections.push(buildDialogueHistorySection(dialogueHistory, currentLine, contextLineCount, currentStoryTime))
  }

  // 8. 用户指令（包含消息条数和选择的选项）
  sections.push(buildInstructionSection(userInput, messageCount, selectedChoice, worldBook, currentStoryTime))

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
  lines.push('当角色提供“人格结构化设定”时，优先按该设定生成角色行为与语气。')
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

      const personalityProfile = getCharacterPersonalityProfile(char)
      const hasMbti = Boolean(personalityProfile.mbti)
      const hasBehaviorTags = Array.isArray(personalityProfile.behaviorTags) && personalityProfile.behaviorTags.length > 0
      const customDimensions = getCustomPersonalityDimensions(personalityProfile.cognitiveDimensions)
      const hasStructuredPersonality = hasMbti || hasBehaviorTags || customDimensions.length > 0
      if (hasStructuredPersonality) {
        charInfo.push('  - 人格结构化设定:')
        if (hasMbti) {
          charInfo.push(`    - MBTI: ${personalityProfile.mbti}`)
        }
        if (hasBehaviorTags) {
          charInfo.push(`    - 行为倾向标签: ${personalityProfile.behaviorTags.join('、')}`)
        }
        if (customDimensions.length > 0) {
          const dimensionsText = customDimensions
            .map((item) => `${item.key}=${item.value}`)
            .join(', ')
          charInfo.push(`    - 认知八维(0-100, 仅列出偏离50的维度): ${dimensionsText}`)
        }
        charInfo.push('    - 解释规则: 以上结构化设定优先，背景和备注用于补充细节。')
      }

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
const buildDialogueHistorySection = (history, currentLine, contextLineCount = 10, currentStoryTime = '') => {
  const lines = ['## 剧情上下文']
  lines.push('')
  const normalizedCurrentStoryTime = normalizeStoryTimeText(currentStoryTime)
  if (normalizedCurrentStoryTime) {
    lines.push(`### 当前剧情时间`)
    lines.push(normalizedCurrentStoryTime)
    lines.push('')
  }
  lines.push('### 已发生的对话')
  
  // 只取最近的对话，避免 prompt 过长
  const parsedCount = Number.parseInt(String(contextLineCount), 10)
  const safeCount = Number.isFinite(parsedCount) ? Math.max(0, Math.min(400, parsedCount)) : 10
  const recentHistory = safeCount > 0 ? history.slice(-safeCount) : []
  
  for (const line of recentHistory) {
    const emotionLabel = getEmotionDisplay(line.emotion)
    const storyTime = resolveLineStoryTime(line)
    const storyTimePrefix = storyTime ? `[${storyTime}] ` : ''
    if (line.speaker === '旁白') {
      lines.push(`${storyTimePrefix}[旁白] ${line.text}`)
    } else {
      lines.push(`${storyTimePrefix}**${line.speaker}**${emotionLabel}: ${line.text}`)
    }
  }

  if (currentLine) {
    lines.push('')
    lines.push('### 当前对话')
    const emotionLabel = getEmotionDisplay(currentLine.emotion)
    const currentLineStoryTime = resolveLineStoryTime(currentLine)
    const currentLineStoryTimePrefix = currentLineStoryTime ? `[${currentLineStoryTime}] ` : ''
    if (currentLine.speaker === '旁白') {
      lines.push(`${currentLineStoryTimePrefix}[旁白] ${currentLine.text}`)
    } else {
      lines.push(`${currentLineStoryTimePrefix}**${currentLine.speaker}**${emotionLabel}: ${currentLine.text}`)
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
const buildInstructionSection = (
  userInput,
  messageCount = 3,
  selectedChoice = null,
  worldBook = null,
  currentStoryTime = '',
) => {
  const lines = ['## 生成指令']
  lines.push('')
  lines.push('请根据以上世界设定、角色信息和剧情上下文，生成接下来的剧情发展。')
  const normalizedCurrentStoryTime = normalizeStoryTimeText(currentStoryTime)
  if (normalizedCurrentStoryTime) {
    lines.push(`当前剧情时间：${normalizedCurrentStoryTime}`)
  }
  lines.push('')
  lines.push('### 输出要求')
  lines.push('1. 只输出 JSON 数组，不要 markdown，不要解释')
  lines.push('2. 每条对话使用紧凑键: s(说话者)、e(表情)、t(内容)、h(高亮0/1)、d(剧情时间)')
  lines.push(`3. 必须生成 ${messageCount} 条对话`)
  lines.push('4. 说话者必须是已定义角色名称或"旁白"')
  lines.push('5. 表情必须使用指定的表情标识')
  lines.push('6. 所有对话都必须包含 d，并在同一世界内保持纪年体系与写法一致')
  lines.push('7. 本次推进后，最后一条 d 必须相对当前剧情时间前进（不能不变、不能回退）')
  lines.push('8. 每次生成的最后一条都必须添加 c 选项: c={p,o,i}，其中 o=[{t,a}]，i=1')
  lines.push('9. 可选场景切换使用 sc={id,name}')
  lines.push('10. 若角色存在“人格结构化设定”，角色行为与语气必须优先符合该设定')
  lines.push('11. 输出尽量紧凑，减少无意义空格与换行')
  
  // 添加场景指令说明
  lines.push('')
  lines.push('### 场景切换指令')
  lines.push('如需切换背景场景，在对应对话添加 sc 字段，例如: {"s":"旁白","t":"...","sc":{"id":"street_night","name":"夜街"}}')
  
  // 如果世界书有场景配置，列出可用场景
  if (worldBook?.scenes && worldBook.scenes.length > 0) {
    lines.push('')
    lines.push('### 可用场景列表')
    const sceneList = worldBook.scenes.slice(0, 20)
    for (const scene of sceneList) {
      lines.push(`- ${scene.id}: ${scene.name}${scene.description ? ` (${scene.description})` : ''}`)
    }
    if (worldBook.scenes.length > sceneList.length) {
      lines.push(`- 其余 ${worldBook.scenes.length - sceneList.length} 个场景省略`)
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

  const personalityBriefs = Array.isArray(worldBook?.characters)
    ? worldBook.characters
      .map((char) => {
        const profile = getCharacterPersonalityProfile(char)
        const customDimensions = getCustomPersonalityDimensions(profile.cognitiveDimensions)
        const chunks = []
        if (profile.mbti) {
          chunks.push(`MBTI=${profile.mbti}`)
        }
        if (Array.isArray(profile.behaviorTags) && profile.behaviorTags.length > 0) {
          chunks.push(`标签=${profile.behaviorTags.slice(0, 3).join('/')}`)
        }
        if (customDimensions.length > 0) {
          const topDimension = customDimensions[0]
          chunks.push(`${topDimension.key}=${topDimension.value}`)
        }
        if (chunks.length === 0) {
          return ''
        }
        return `${char.name || '角色'}(${chunks.join(', ')})`
      })
      .filter(Boolean)
    : []
  if (personalityBriefs.length > 0) {
    lines.push(`角色人格: ${personalityBriefs.join('；')}`)
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
  lines.push('请生成接下来的剧情（JSON数组，优先使用紧凑键 s/e/t/h/d）:')
  
  return lines.join('\n')
}

export default {
  buildStoryPrompt,
  buildQuickPrompt,
}

const buildNarratorSection = (narratorProfile) => {
  const lines = ['## 叙事者风格']

  if (narratorProfile.name) {
    lines.push(`**叙事者**: ${narratorProfile.name}`)
  }

  if (narratorProfile.summary) {
    lines.push(`**风格定位**: ${narratorProfile.summary}`)
  }

  if (narratorProfile.stylePrompt && narratorProfile.stylePrompt.trim()) {
    lines.push('')
    lines.push('### 文风要求')
    lines.push(narratorProfile.stylePrompt.trim())
  }

  if (narratorProfile.instructionPrompt && narratorProfile.instructionPrompt.trim()) {
    lines.push('')
    lines.push('### 叙事约束')
    lines.push(narratorProfile.instructionPrompt.trim())
  }

  return lines.join('\n')
}

const buildRelationshipSection = (relationshipSnapshot) => {
  const lines = ['## 角色关系状态']
  lines.push('以下数值范围为 -100 ~ 100，越高表示越正向。')
  lines.push('')
  lines.push('### 好感度等级说明')
  
  // 添加等级说明表
  const levelDescriptions = RELATIONSHIP_LEVELS.map(level =>
    `${level.icon} ${level.name}(${level.range[0]}~${level.range[1]}): ${level.description}`
  ).join('、')
  lines.push(levelDescriptions)
  lines.push('')

  for (const item of relationshipSnapshot) {
    const name = String(item?.name || item?.characterName || item?.id || '未命名角色').trim()
    const nickname = String(item?.nickname || '').trim()
    const favor = Number.isFinite(item?.favor) ? item.favor : 0
    const trust = Number.isFinite(item?.trust) ? item.trust : 0
    const stance = Number.isFinite(item?.stance) ? item.stance : 0
    const aliasText = nickname ? `（${nickname}）` : ''
    
    // 使用新的等级系统
    const level = getRelationshipLevel(favor)
    const levelIcon = level.icon || ''
    const levelName = level.name || '中立'
    
    // 构建更详细的关系描述
    const relationshipDesc = getRelationshipDescription({ favor, trust, stance }, { name })
    
    lines.push(`- ${name}${aliasText}: ${levelIcon}${levelName}(favor=${favor}), trust=${trust}, stance=${stance}`)
    lines.push(`  - 状态描述: ${relationshipDesc}`)
  }

  lines.push('')
  lines.push('### 关系影响提示')
  
  // 添加关系影响提示
  const characters = relationshipSnapshot.map(item => ({
    id: item?.id || item?.characterId,
    name: item?.name || item?.characterName,
  }))
  const influenceHint = getRelationshipInfluenceHint(characters, relationshipSnapshot)
  lines.push(influenceHint)
  
  lines.push('')
  lines.push('请保持角色行为、语气、信息披露程度与上述关系状态一致。')
  return lines.join('\n')
}

const RELATIONSHIP_LEDGER_PROMPT_WINDOW = 40
const RELATIONSHIP_LEDGER_TIMELINE_LIMIT = 12
const RELATIONSHIP_LEDGER_CHARACTER_LIMIT = 8

const parsePromptNumber = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const formatPromptDelta = (value) => {
  const normalized = parsePromptNumber(value, 0)
  if (normalized > 0) return `+${normalized}`
  if (normalized < 0) return `${normalized}`
  return '0'
}

const truncatePromptText = (value, maxLength = 20) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const safeMaxLength = Number.isFinite(maxLength) ? Math.max(4, Math.floor(maxLength)) : 20
  if (text.length <= safeMaxLength) return text
  return `${text.slice(0, safeMaxLength - 1)}…`
}

const normalizeRelationshipLedgerRowsForPrompt = (relationshipLedger) => {
  if (!Array.isArray(relationshipLedger) || relationshipLedger.length === 0) {
    return []
  }

  const normalizedRows = relationshipLedger
    .map((row) => {
      if (!row || typeof row !== 'object') return null

      const delta = row.delta && typeof row.delta === 'object' ? row.delta : {}
      const deltaFavor = parsePromptNumber(delta.favor ?? row.deltaFavor, 0)
      const deltaTrust = parsePromptNumber(delta.trust ?? row.deltaTrust, 0)
      const deltaStance = parsePromptNumber(delta.stance ?? row.deltaStance, 0)
      if (deltaFavor === 0 && deltaTrust === 0 && deltaStance === 0) {
        return null
      }

      const after = row.after && typeof row.after === 'object' ? row.after : {}
      const createdAt = parsePromptNumber(row.createdAt, 0)
      const characterName = String(
        row.characterName ||
        row.name ||
        row.characterId ||
        '未知角色',
      ).trim()

      if (!characterName) {
        return null
      }

      const triggeredEvents = Array.isArray(row.triggeredEvents)
        ? row.triggeredEvents.map((item) => truncatePromptText(item, 18)).filter(Boolean).slice(0, 2)
        : []

      return {
        createdAt,
        storyTime: String(row.storyTime || '').trim(),
        characterName,
        deltaFavor,
        deltaTrust,
        deltaStance,
        afterFavor: parsePromptNumber(after.favor, null),
        afterTrust: parsePromptNumber(after.trust, null),
        afterStance: parsePromptNumber(after.stance, null),
        triggeredEvents,
        choiceText: truncatePromptText(row.choiceText, 24),
      }
    })
    .filter(Boolean)

  if (normalizedRows.length === 0) {
    return []
  }

  normalizedRows.sort((a, b) => a.createdAt - b.createdAt)
  return normalizedRows.slice(-RELATIONSHIP_LEDGER_PROMPT_WINDOW)
}

const buildRelationshipLedgerSection = (relationshipLedger) => {
  const rows = normalizeRelationshipLedgerRowsForPrompt(relationshipLedger)
  if (rows.length === 0) {
    return ''
  }

  const lines = ['## 关系推进数据表摘要']
  lines.push('以下为真实历史关系变更记录，请据此推进人物关系发展。')
  lines.push('')
  lines.push('### 角色关系趋势（近期累计）')

  const summaryByCharacter = new Map()
  for (const row of rows) {
    if (!summaryByCharacter.has(row.characterName)) {
      summaryByCharacter.set(row.characterName, {
        deltaFavor: 0,
        deltaTrust: 0,
        deltaStance: 0,
        lastAfterFavor: null,
        lastAfterTrust: null,
        lastAfterStance: null,
      })
    }
    const summary = summaryByCharacter.get(row.characterName)
    summary.deltaFavor += row.deltaFavor
    summary.deltaTrust += row.deltaTrust
    summary.deltaStance += row.deltaStance
    summary.lastAfterFavor = row.afterFavor
    summary.lastAfterTrust = row.afterTrust
    summary.lastAfterStance = row.afterStance
  }

  const characterSummaries = [...summaryByCharacter.entries()]
    .map(([characterName, summary]) => {
      const activity = Math.abs(summary.deltaFavor) + Math.abs(summary.deltaTrust) + Math.abs(summary.deltaStance)
      return {
        characterName,
        summary,
        activity,
      }
    })
    .sort((a, b) => b.activity - a.activity)
    .slice(0, RELATIONSHIP_LEDGER_CHARACTER_LIMIT)

  for (const item of characterSummaries) {
    const { characterName, summary } = item
    const hasEndState = Number.isFinite(summary.lastAfterFavor) && Number.isFinite(summary.lastAfterTrust) && Number.isFinite(summary.lastAfterStance)
    const endStateText = hasEndState
      ? `，当前≈favor=${summary.lastAfterFavor}, trust=${summary.lastAfterTrust}, stance=${summary.lastAfterStance}`
      : ''
    lines.push(
      `- ${characterName}: Δfavor ${formatPromptDelta(summary.deltaFavor)}, Δtrust ${formatPromptDelta(summary.deltaTrust)}, Δstance ${formatPromptDelta(summary.deltaStance)}${endStateText}`,
    )
  }

  lines.push('')
  lines.push('### 最近关键变化（时间线）')
  const timelineRows = rows.slice(-RELATIONSHIP_LEDGER_TIMELINE_LIMIT)
  for (const row of timelineRows) {
    const storyTimeText = row.storyTime || '时间未标注'
    const eventText = row.triggeredEvents.length > 0 ? `，事件:${row.triggeredEvents.join('、')}` : ''
    const choiceText = row.choiceText ? `，输入:${row.choiceText}` : ''
    lines.push(
      `- [${storyTimeText}] ${row.characterName} Δ(${formatPromptDelta(row.deltaFavor)}/${formatPromptDelta(row.deltaTrust)}/${formatPromptDelta(row.deltaStance)})${eventText}${choiceText}`,
    )
  }

  lines.push('')
  lines.push('推进要求：延续上述关系轨迹；若出现明显反转，必须在剧情中给出触发原因。')
  return lines.join('\n')
}

const buildDirectorDirectiveSection = (directorDirectives) => {
  const lines = ['## 导演器约束']
  lines.push('以下约束来自剧情导演器，请优先遵守：')

  for (const directive of directorDirectives) {
    const text = String(directive || '').trim()
    if (text) {
      lines.push(`- ${text}`)
    }
  }

  return lines.join('\n')
}
