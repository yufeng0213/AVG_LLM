/**
 * 任务执行服务
 * 负责任务执行的 LLM 调用：开场生成、行动处理、完成判定
 */

import { callChatCompletion, getValidatedActiveConfig } from '../../../src/llm/llmService.core.js'

/**
 * 调用LLM生成任务执行开场
 * @param {Object} params
 * @param {Object} params.task - 任务对象
 * @param {Array} params.characterRoles - 参与角色列表
 * @param {Object} params.worldBook - 世界书对象（可选）
 * @returns {Promise<string>} 开场描述
 */
export const generateTaskExecutionOpening = async ({ task, characterRoles, worldBook }) => {
  const validation = await getValidatedActiveConfig()
  if (!validation.success) {
    throw new Error(validation.error || 'API配置无效')
  }

  const roleSummary = characterRoles.map((r) => `${r.characterName}（${r.trpgRole}）${r.roleDescription ? ` - ${r.roleDescription}` : ''}`).join('\n')

  const worldContext = worldBook ? `
【世界书标题】${worldBook.title || ''}
【世界背景】${worldBook.summary || worldBook.entries?.overview || ''}` : ''

  const systemPrompt = `你是一位任务执行主持人（Game Master）。玩家需要通过角色扮演的方式完成一个任务。
你负责创建沉浸式的任务开场场景，引导参与者进入情境。
要求：
1. 根据任务描述创造一个引人入胜的开场
2. 让所有参与角色自然地出现在场景中
3. 暗示完成任务的关键步骤或挑战
4. 结尾留出玩家行动的空间
5. 回复控制在150-200字`

  const userPrompt = `任务名称：${task.name}
任务类型：${task.type}
任务描述：${task.description}
${worldContext}

参与角色：
${roleSummary || '暂无'}

请生成任务开场场景：`

  try {
    const result = await callChatCompletion({
      config: validation.config,
      systemPrompt,
      userPrompt,
      temperature: 0.85,
      maxTokens: 600,
    })

    if (!result.success) {
      throw new Error(result.error || 'LLM调用失败')
    }

    return result.data || result.rawResponse?.choices?.[0]?.message?.content || '任务开始了...'
  } catch (error) {
    console.error('任务开场生成失败:', error)
    return '你们开始执行任务...'
  }
}

/**
 * 调用LLM处理任务执行中的行动
 * 三步流程：用户行动 → 目标角色回应 → GM故事发展
 * @param {Object} params
 * @param {Object} params.task - 任务对象
 * @param {Array} params.characterRoles - 参与角色列表
 * @param {Array} params.messageHistory - 消息历史
 * @param {string} params.playerAction - 玩家行动
 * @param {string} params.selectedCharacterId - 当前选择的角色ID（固定为 user_player）
 * @param {string} params.targetCharacterId - 任务目标角色ID
 * @returns {Promise<Array<{role: string, characterId: string, characterName: string, content: string}>>}
 */
export const processTaskAction = async ({ task, characterRoles, messageHistory, playerAction, selectedCharacterId, targetCharacterId }) => {
  const validation = await getValidatedActiveConfig()
  if (!validation.success) {
    throw new Error(validation.error || 'API配置无效')
  }

  const targetRole = characterRoles.find((r) => r.characterId === targetCharacterId)
  const targetCharName = targetRole?.characterName || '未知角色'
  const targetCharDesc = targetRole?.roleDescription || ''

  const historyContext = messageHistory.slice(-10).map((msg) => {
    if (msg.role === 'gm') return `GM：${msg.content}`
    return `${msg.characterName}：${msg.content}`
  }).join('\n')

  const results = []

  // 第一步：生成目标角色的第一人称回应
  const characterSystemPrompt = `你是任务执行中的角色回应者。你需要以${targetCharName}的身份，用第一人称（"我"）来回应玩家（User）的行动。
严格按该角色的性格、背景和任务身份来表现。
你的回应应该包含：
1. 对玩家行动的反应和感受
2. 你自己采取的行动或说出的话
3. 保持角色一致性
回复控制在150字以内。只输出角色视角的内容，不要写GM叙事。`

  const characterUserPrompt = `任务：${task.name} - ${task.description}

目标角色：${targetCharName}
角色描述：${targetCharDesc}

对话历史：
${historyContext || '（暂无）'}

玩家（User）的行动：${playerAction}

请以${targetCharName}的第一人称口吻回应玩家的行动：`

  try {
    const characterResult = await callChatCompletion({
      config: validation.config,
      systemPrompt: characterSystemPrompt,
      userPrompt: characterUserPrompt,
      temperature: 0.8,
      maxTokens: 500,
    })

    const characterContent = characterResult.success
      ? (characterResult.data || characterResult.rawResponse?.choices?.[0]?.message?.content || '……')
      : `${targetCharName}沉默了一会儿...`

    results.push({
      role: 'character',
      characterId: targetCharacterId,
      characterName: targetCharName,
      content: characterContent,
      timestamp: Date.now(),
    })
  } catch {
    results.push({
      role: 'character',
      characterId: targetCharacterId,
      characterName: targetCharName,
      content: `${targetCharName}没有回应...`,
      timestamp: Date.now(),
    })
  }

  // 第二步：生成GM的故事发展
  // 把刚生成的角色回应加入历史上下文
  const updatedHistory = `${historyContext}\n${targetCharName}：${results[0].content}`

  const gmSystemPrompt = `你是任务执行主持人（Game Master）。根据玩家和目标角色的行动，描述故事的发展和任务进度的变化。
你需要：
1. 描述双方行动交织后产生的结果
2. 推动任务情境向前发展
3. 适当制造挑战、意外或转折
4. 暗示下一步可能的方向
5. 回复控制在200字以内
用第三人称叙事，不要代替玩家或角色说话。`

  const gmUserPrompt = `任务：${task.name} - ${task.description}

参与角色：User、${targetCharName}

之前的对话：
${historyContext || '（暂无）'}

玩家（User）的行动：${playerAction}

${targetCharName}的回应：
${results[0].content}

请描述故事的发展和任务的变化：`

  try {
    const gmResult = await callChatCompletion({
      config: validation.config,
      systemPrompt: gmSystemPrompt,
      userPrompt: gmUserPrompt,
      temperature: 0.75,
      maxTokens: 500,
    })

    const gmContent = gmResult.success
      ? (gmResult.data || gmResult.rawResponse?.choices?.[0]?.message?.content || '故事继续发展...')
      : '故事继续发展...'

    results.push({
      role: 'gm',
      content: gmContent,
      timestamp: Date.now() + 1,
    })
  } catch {
    results.push({
      role: 'gm',
      content: '故事继续发展...',
      timestamp: Date.now() + 1,
    })
  }

  return results
}

/**
 * 调用LLM判定任务是否可以完成
 * @param {Object} params
 * @param {Object} params.task - 任务对象
 * @param {Array} params.characterRoles - 参与角色列表
 * @param {Array} params.messageHistory - 消息历史
 * @returns {Promise<{completable: boolean, summary: string}>}
 */
export const checkTaskCompletable = async ({ task, characterRoles, messageHistory }) => {
  const validation = await getValidatedActiveConfig()
  if (!validation.success) {
    // 如果 API 不可用，默认返回不可完成
    return { completable: false, summary: '' }
  }

  const historyContext = messageHistory.slice(-8).map((msg) => {
    if (msg.role === 'gm') return `GM：${msg.content}`
    return `${msg.characterName}：${msg.content}`
  }).join('\n')

  const systemPrompt = `你是一位任务评审主持人。根据任务描述和对话历史，判断玩家是否已经完成了足够的行动来提交这个任务。
只返回JSON格式，不要其他内容：
{"completable": true或false, "summary": "任务完成情况摘要（50字以内）"}`

  const userPrompt = `任务名称：${task.name}
任务描述：${task.description}

参与角色：${characterRoles.map((r) => r.characterName).join('、')}

对话历史（最近8条）：
${historyContext || '（暂无）'}

请判断任务是否可以提交：`

  try {
    const result = await callChatCompletion({
      config: validation.config,
      systemPrompt,
      userPrompt,
      temperature: 0.5,
      maxTokens: 200,
    })

    if (!result.success) {
      return { completable: false, summary: '' }
    }

    const content = result.data || result.rawResponse?.choices?.[0]?.message?.content || ''

    // 尝试解析JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        completable: !!parsed.completable,
        summary: String(parsed.summary || '').slice(0, 100),
      }
    }

    // 如果无法解析，根据内容长度判断
    return {
      completable: content.length > 50,
      summary: content.slice(0, 100),
    }
  } catch {
    return { completable: false, summary: '' }
  }
}
