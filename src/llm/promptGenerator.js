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
import { useRelationshipStore } from '../stores/relationship.store.js'
import { getNarratorFullPrompt } from '../narrator/narratorStore.js'

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
    currentChapter = null,
    messageCount = 3,
    selectedChoice,
    contextLineCount = 10,
    activityStoryContext,
    memoryContext,
  } = params

  const sections = []

  // 0. 活动故事背景（最优先）
  if (activityStoryContext) {
    sections.push(buildActivityStorySection(activityStoryContext))
  }

  // 0.5. 世界记忆（近期事件 + 过往回忆）
  if (memoryContext && memoryContext.trim()) {
    sections.push(memoryContext)
  }

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
  sections.push(buildInstructionSection(userInput, messageCount, selectedChoice, worldBook, currentStoryTime, currentChapter))

  return sections.filter(Boolean).join('\n\n---\n\n')
}

/**
 * 构建活动故事背景部分
 * @param {Object} context - 活动故事配置
 * @returns {string} 活动故事背景文本
 */
const buildActivityStorySection = (context) => {
  const lines = ['## ⚠️ 重要：这是活动剧情，不是主线剧情']

  lines.push('')
  lines.push('**当前正在进行的不是游戏主线剧情，而是限时活动专属剧情。**')
  lines.push('请完全依据本活动的设定开展故事，不要涉及主线剧情内容。')
  lines.push('')

  if (context.title) {
    lines.push(`**活动名称**: ${context.title}`)
  }

  if (context.openingPrompt) {
    lines.push('')
    lines.push('### 活动开场设定（请以此为起点开展剧情）')
    lines.push(context.openingPrompt)
    lines.push('')
    lines.push('**重要**：以上是本活动的开场设定，请以此为起点展开故事，不要偏离这个设定。')
  }

  if (context.mood) {
    lines.push('')
    lines.push(`**整体氛围**: ${context.mood}`)
  }

  if (context.sceneCharacters && context.sceneCharacters.length > 0) {
    lines.push('')
    lines.push(`**出场角色**: ${context.sceneCharacters.join('、')}`)
  }

  lines.push('')
  lines.push('---')
  lines.push('请在生成内容时时刻记住：这是活动剧情，请紧扣活动主题和氛围。')

  return lines.join('\n')
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
  currentChapter = null,
) => {
  const lines = ['## 生成指令']
  lines.push('')
  lines.push('请根据以上世界设定、角色信息和剧情上下文，生成接下来的剧情发展。')
  lines.push('')
  lines.push('### 叙事视角')
  lines.push('- 旁白描写中使用第二人称"你"来指代玩家，增强代入感')
  lines.push('- 玩家尽量少说话，多通过旁白描写和角色对玩家的回应来体现玩家的存在')
  lines.push('- 交互决策通过选项（choices）由玩家做出')
  const normalizedCurrentStoryTime = normalizeStoryTimeText(currentStoryTime)
  if (normalizedCurrentStoryTime) {
    lines.push(`当前剧情时间：${normalizedCurrentStoryTime}`)
  }

  // 章节上下文
  if (currentChapter) {
    lines.push(`当前章节：${currentChapter.major}-${currentChapter.minor} ${currentChapter.name}`)
    if (currentChapter.storyline) {
      lines.push(`本章主线：${currentChapter.storyline}`)
    }
    lines.push('请围绕本章主线推进剧情，当剧情发展到重要转折或阶段性完成时可开启新章节。')
    lines.push('新章节用 <chapter major="大章" minor="小节" name="名称" s="主线概要"/> 标签。')
  }

  lines.push('')
  lines.push('### 思考步骤（输出 XML 前）')
  lines.push('注意：<thinking> 中必须用编剧/叙事者的内心独白方式思考，像在脑海中构思剧情。禁止出现"我应该"、"我需要生成"、"用户要求"、"作为AI"等元话术。')
  lines.push('1. 当前剧情进展到哪里？角色的情绪和处境如何？')
  lines.push('2. 接下来发生什么比较合理又有意外的张力？')
  lines.push('3. 哪些角色会参与？各自的情感/态度/潜台词是什么？')
  lines.push(`4. 建议生成 ${messageCount} 条对话，剧情时间应该如何推进？`)
  lines.push('5. 是否需要场景切换？')
  lines.push('')
  lines.push('### 每轮自检（在 <thinking> 中回答）')
  lines.push('1. 这轮推动了什么价值变化？（好感/信任/局势/角色成长，至少一项）')
  lines.push('2. 内心独白够不够？（角色需要有内在反应，不只外部动作）')
  lines.push('3. 信息是螺旋式释放的吗？（别一次性全抖出来，保留悬念和未揭部分）')
  lines.push('4. 有没有意外感？（哪怕日常场景也要有一点小转折或出人意料之处）')
  lines.push('5. 下一轮的钩子埋好了吗？（留一个让读者想知道后续的点）')
  lines.push('')
  lines.push('### 输出格式（紧凑 XML）')
  lines.push('在 <thinking> 之后，用以下 XML 标签输出，不要 markdown、不要 JSON、不要解释：')
  lines.push('')
  lines.push('- 对话：<d s="说话者" e="表情" d="剧情时间">内容</d>')
  lines.push('  - s: 说话者名称或"旁白"')
  lines.push('  - e: 表情标识，旁白可省略')
  lines.push('  - d: 剧情时间（必填）')
  lines.push('')
  lines.push('- 场景切换：<sc id="场景ID" n="名称"/>')
  lines.push('')
  lines.push('- 选项（必须出现在最后）：')
  lines.push('  <choices p="提示语" i="1">')
  lines.push('    <o t="选项1" a="action_id"/>')
  lines.push('    <o t="选项2" a="action_id2"/>')
  lines.push('  </choices>')
  lines.push('  - p: 提示语，i: 是否允许自定义输入(0或1)')
  lines.push('  - o: t=选项文案, a=action ID，至少 2 项')
  lines.push('')
  lines.push('### 示例')
  lines.push('<thinking>')
  lines.push('当前是傍晚，两人在回家路上。接下来可以推进到夜晚，场景切换到家中...')
  lines.push('林夏表现出担忧，玩家应该回应关心...')
  lines.push('</thinking>')
  lines.push('<d s="旁白" d="傍晚">林夏走在回家的路上，夕阳把她的影子拉得很长。</d>')
  lines.push('<d s="林夏" e="worried" d="傍晚">你最近还好吗？感觉你心事重重的...</d>')
  lines.push('<d s="旁白" d="夜深">两人回到了家中，客厅里只开了一盏小灯。</d>')
  lines.push('<sc id="home_living" n="家中客厅"/>')
  lines.push('<d s="旁白" d="夜深">安静的房间里，时钟滴答作响。</d>')
  lines.push('<choices p="接下来怎么做？" i="1">')
  lines.push('  <o t="陪她聊聊心事" a="chat"/>')
  lines.push('  <o t="各自回房休息" a="rest"/>')
  lines.push('</choices>')
  
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

  // 新结构：使用items条目
  if (narratorProfile.items && narratorProfile.items.length > 0) {
    const itemsPrompt = getNarratorFullPrompt(narratorProfile)
    if (itemsPrompt && itemsPrompt.trim()) {
      lines.push('')
      lines.push(itemsPrompt.trim())
    }
  } else {
    // 兼容旧数据：使用stylePrompt和instructionPrompt
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
