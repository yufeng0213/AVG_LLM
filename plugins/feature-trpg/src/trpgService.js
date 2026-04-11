/**
 * TRPG 跑团服务
 * 负责跑团逻辑、LLM调用、角色分配等
 */

import { callChatCompletion, getValidatedActiveConfig } from '../../../src/llm/llmService.core.js'

const TRPG_STORAGE_KEY = 'avg_llm_trpg_session_v1'
const TRPG_DEFAULT_TOPICS = [
  '神秘古宅探险',
  '校园灵异事件',
  '星际迷航',
  '末日生存',
  '魔法学院',
  '海盗寻宝',
  '侦探破案',
  '时空穿越',
]

/**
 * 从localStorage读取跑团会话
 */
export const loadTRPGSession = () => {
  try {
    const raw = window.localStorage.getItem(TRPG_STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw)
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * 保存跑团会话到localStorage
 */
export const saveTRPGSession = (session) => {
  try {
    window.localStorage.setItem(TRPG_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // ignore
  }
}

/**
 * 清除跑团会话
 */
export const clearTRPGSession = () => {
  try {
    window.localStorage.removeItem(TRPG_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * 创建默认跑团会话
 */
export const createDefaultTRPGSession = () => ({
  topic: '',
  characters: [],
  characterRoles: [],
  messages: [],
  isRunning: false,
  createdAt: Date.now(),
})

/**
 * 生成随机跑团主题
 */
export const generateRandomTopic = () => {
  const index = Math.floor(Math.random() * TRPG_DEFAULT_TOPICS.length)
  return TRPG_DEFAULT_TOPICS[index]
}

/**
 * 从世界书获取所有角色，并在前面添加 User 角色
 */
export const getWorldBookCharacters = (worldBook) => {
  const userCharacter = {
    id: 'user_player',
    label: 'User',
    description: '玩家自身角色，由玩家直接控制。',
    isUser: true,
    raw: { id: 'user_player', label: 'User' },
  }

  if (!worldBook || !Array.isArray(worldBook.characters)) {
    return [userCharacter]
  }

  const worldCharacters = worldBook.characters.map((char, index) => ({
    id: char.id || `char_${index + 1}`,
    label: char.label || char.name || `角色${index + 1}`,
    description: char.description || char.personality || '',
    isUser: false,
    raw: char,
  }))

  return [userCharacter, ...worldCharacters]
}

/**
 * 调用LLM为角色分配跑团身份（排除User角色）
 * @param {Array} characters - 角色列表（包含User）
 * @param {string} topic - 跑团主题
 * @returns {Promise<Array>} 角色身份分配结果
 */
export const assignCharacterRoles = async (characters, topic) => {
  const validation = await getValidatedActiveConfig()
  if (!validation.success) {
    throw new Error(validation.error || 'API配置无效')
  }

  // 分离 User 和世界书角色
  const userChar = characters.find((c) => c.isUser)
  const worldChars = characters.filter((c) => !c.isUser)

  // 如果没有世界书角色，直接返回 User 角色
  if (worldChars.length === 0) {
    return [
      {
        characterId: 'user_player',
        characterName: 'User',
        trpgRole: '玩家',
        roleDescription: '冒险的参与者，由玩家直接控制。',
        specialAbility: '自由意志',
        startingItem: '冒险手册',
      },
    ]
  }

  const characterList = worldChars.map((c, i) => `${i + 1}. ${c.label}${c.description ? ` - ${c.description}` : ''}`).join('\n')

  const systemPrompt = `你是一位专业的TRPG（桌上角色扮演游戏）主持人。你擅长为各种主题的跑团游戏分配角色身份。
请根据提供的跑团主题和角色列表，为每个角色分配一个适合的跑团身份/职业/角色。
注意：有一个名为 "User" 的角色是玩家自身，不需要你分配身份，你只需要为其他角色分配。
要求：
1. 每个角色都要有独特的身份
2. 身份要符合跑团主题的氛围
3. 给每个角色一个简短的背景描述
4. 返回JSON格式的结果`

  const userPrompt = `跑团主题：${topic || generateRandomTopic()}

角色列表（不包含User，User由玩家直接控制）：
${characterList}

请为每个角色分配一个跑团身份，返回以下JSON格式（不要添加其他内容）：
[
  {
    "characterId": "角色ID",
    "characterName": "角色名称",
    "trpgRole": "跑团身份/职业",
    "roleDescription": "该身份的背景描述（50字以内）",
    "specialAbility": "特殊能力或技能",
    "startingItem": "初始物品"
  }
]`

  try {
    const result = await callChatCompletion({
      config: validation.config,
      systemPrompt,
      userPrompt,
      temperature: 0.9,
      maxTokens: 2000,
    })

    if (!result.success) {
      throw new Error(result.error || 'LLM调用失败')
    }

    const content = result.data || result.rawResponse?.choices?.[0]?.message?.content || ''

    // 尝试解析JSON
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      const worldRoles = parsed.map((item) => ({
        characterId: item.characterId || '',
        characterName: item.characterName || '',
        trpgRole: item.trpgRole || '冒险者',
        roleDescription: item.roleDescription || '',
        specialAbility: item.specialAbility || '',
        startingItem: item.startingItem || '',
      }))

      // 添加 User 角色
      const userRole = {
        characterId: 'user_player',
        characterName: 'User',
        trpgRole: '玩家',
        roleDescription: '冒险的参与者，由玩家直接控制。',
        specialAbility: '自由意志',
        startingItem: '冒险手册',
      }

      return [userRole, ...worldRoles]
    }

    // 如果解析失败，返回默认分配
    const defaultRoles = worldChars.map((char) => ({
      characterId: char.id,
      characterName: char.label,
      trpgRole: '冒险者',
      roleDescription: '一位勇敢的冒险者',
      specialAbility: '观察',
      startingItem: '手电筒',
    }))

    const userRole = {
      characterId: 'user_player',
      characterName: 'User',
      trpgRole: '玩家',
      roleDescription: '冒险的参与者，由玩家直接控制。',
      specialAbility: '自由意志',
      startingItem: '冒险手册',
    }

    return [userRole, ...defaultRoles]
  } catch (error) {
    console.error('角色身份分配失败:', error)
    // 返回默认分配
    const defaultRoles = worldChars.map((char) => ({
      characterId: char.id,
      characterName: char.label,
      trpgRole: '冒险者',
      roleDescription: '一位勇敢的冒险者',
      specialAbility: '观察',
      startingItem: '手电筒',
    }))

    const userRole = {
      characterId: 'user_player',
      characterName: 'User',
      trpgRole: '玩家',
      roleDescription: '冒险的参与者，由玩家直接控制。',
      specialAbility: '自由意志',
      startingItem: '冒险手册',
    }

    return [userRole, ...defaultRoles]
  }
}

/**
 * 调用LLM生成跑团开场
 * @param {string} topic - 跑团主题
 * @param {Array} characterRoles - 角色身份列表
 * @returns {Promise<string>} 开场描述
 */
export const generateOpening = async (topic, characterRoles) => {
  const validation = await getValidatedActiveConfig()
  if (!validation.success) {
    throw new Error(validation.error || 'API配置无效')
  }

  const roleSummary = characterRoles.map((r) => `${r.characterName}（${r.trpgRole}）- ${r.roleDescription}`).join('\n')

  const systemPrompt = `你是一位经验丰富的TRPG主持人（Game Master）。你擅长创造沉浸式的游戏开场，能够迅速将玩家带入情境。
请用生动但简洁的语言描述跑团的开场场景，让所有角色都进入情境中。
要求：
1. 营造氛围
2. 让所有角色自然地出现在场景中
3. 暗示即将发生的事件
4. 结尾留下一个让玩家行动的钩子`

  const userPrompt = `跑团主题：${topic}

参与角色：
${roleSummary}

请生成一段开场描述（200-300字），让所有角色都进入情境，并暗示接下来会发生什么。`

  try {
    const result = await callChatCompletion({
      config: validation.config,
      systemPrompt,
      userPrompt,
      temperature: 0.85,
      maxTokens: 800,
    })

    if (!result.success) {
      throw new Error(result.error || 'LLM调用失败')
    }

    return result.data || result.rawResponse?.choices?.[0]?.message?.content || '冒险开始了...'
  } catch (error) {
    console.error('开场生成失败:', error)
    return '冒险开始了，你们聚集在一起，准备迎接未知的挑战...'
  }
}

/**
 * 调用LLM处理玩家行动并生成回应
 * @param {string} topic - 跑团主题
 * @param {Array} characterRoles - 角色身份列表
 * @param {Array} messageHistory - 消息历史
 * @param {string} playerAction - 玩家行动
 * @param {string} selectedCharacterId - 当前选择的角色ID
 * @returns {Promise<string>} GM回应
 */
export const processPlayerAction = async (topic, characterRoles, messageHistory, playerAction, selectedCharacterId) => {
  const validation = await getValidatedActiveConfig()
  if (!validation.success) {
    throw new Error(validation.error || 'API配置无效')
  }

  const isSelectedUser = selectedCharacterId === 'user_player'

  // 获取非User角色的信息
  const worldRoles = characterRoles.filter((r) => r.characterId !== 'user_player')
  const userRole = characterRoles.find((r) => r.characterId === 'user_player')
  const worldRoleSummary = worldRoles.map((r) => `${r.characterName}（${r.trpgRole}）- ${r.roleDescription}`).join('\n')

  // 构建对话历史上下文
  const historyContext = messageHistory.slice(-10).map((msg) => {
    if (msg.role === 'gm') {
      return `GM：${msg.content}`
    }
    return `${msg.characterName}：${msg.content}`
  }).join('\n')

  let systemPrompt, userPrompt

  if (isSelectedUser) {
    // 玩家选择 User：只描述 User 自己的行动结果和其他角色的反应
    systemPrompt = `你是一位TRPG主持人（Game Master）。玩家选择了"User"角色行动。
你需要：
1. 描述 User 行动的直接结果和环境变化
2. 根据其他角色的性格、背景和世界书设定，描述他们对此的反应和行动
3. 保持故事的连贯性和趣味性
4. 适当制造紧张感和悬念
5. 给玩家继续行动的机会

注意：User 的行动由玩家直接控制，你只需要描述行动结果和其他世界书角色的反应。世界书角色会根据各自的人格和背景独立行动。回复控制在200字以内。`

    userPrompt = `跑团主题：${topic}

User角色：${userRole ? `${userRole.characterName}（${userRole.trpgRole}）` : '玩家'}

世界书角色（会根据自身性格和背景独立行动）：
${worldRoleSummary || '（无）'}

对话历史：
${historyContext || '（暂无）'}

User的行动：${playerAction}

请描述行动结果，以及其他角色的反应：`
  } else {
    // 玩家选择了某个世界书角色：由 LLM 以该角色的口吻第一人称描述行动
    const selectedRole = characterRoles.find((r) => r.characterId === selectedCharacterId)
    const selectedCharName = selectedRole ? `${selectedRole.characterName}（${selectedRole.trpgRole}）` : '未知角色'

    systemPrompt = `你是一位TRPG主持人（Game Master）。玩家选择了一个世界书角色来行动。
你需要以该角色的口吻，用第一人称（"我"）来描述TA的行动和话语。
要求：
1. 严格按照该角色的性格、背景和跑团身份来描述
2. 用第一人称表达，如"我观察了一下周围..."、"我觉得我们应该..."
3. 保持角色一致性，让角色的言行符合其设定
4. 回复控制在150字以内`

    userPrompt = `跑团主题：${topic}

当前行动角色：${selectedCharName}
角色描述：${selectedRole ? selectedRole.roleDescription : ''}

所有角色：
${characterRoles.map((r) => `${r.characterName}（${r.trpgRole}）- ${r.roleDescription}`).join('\n')}

对话历史：
${historyContext || '（暂无）'}

玩家给的方向提示：${playerAction}

请以${selectedCharName.split('（')[0]}的第一人称口吻，描述TA会说什么、做什么：`
  }

  try {
    const result = await callChatCompletion({
      config: validation.config,
      systemPrompt,
      userPrompt,
      temperature: 0.8,
      maxTokens: 500,
    })

    if (!result.success) {
      throw new Error(result.error || 'LLM调用失败')
    }

    return result.data || result.rawResponse?.choices?.[0]?.message?.content || '行动产生了意想不到的结果...'
  } catch (error) {
    console.error('行动处理失败:', error)
    return '你的行动似乎触发了某种未知的力量...'
  }
}

/**
 * 调用LLM生成随机跑团主题
 * @returns {Promise<string>} 随机主题
 */
export const generateRandomTopicByLLM = async () => {
  const validation = await getValidatedActiveConfig()
  if (!validation.success) {
    return generateRandomTopic()
  }

  const systemPrompt = `你是一个创意助手，请生成一些有趣的TRPG跑团主题。
要求：
1. 主题要有冒险性和探索性
2. 适合多人参与
3. 有神秘元素或未知事件
4. 返回一个简短的主题名称（10字以内）`

  const userPrompt = '请生成一个有趣的TRPG跑团主题，只需要主题名称，不要解释。'

  try {
    const result = await callChatCompletion({
      config: validation.config,
      systemPrompt,
      userPrompt,
      temperature: 1.0,
      maxTokens: 100,
    })

    if (result.success) {
      const content = result.data || result.rawResponse?.choices?.[0]?.message?.content || ''
      const cleaned = content.replace(/["'"。.!！\n]/g, '').trim()
      if (cleaned && cleaned.length > 0 && cleaned.length <= 20) {
        return cleaned
      }
    }
  } catch {
    // ignore
  }

  return generateRandomTopic()
}
