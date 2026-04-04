/**
 * CG 提示词生成服务
 * 调用 LLM 总结当前场景并生成生图提示词
 */

import { generateStory, getActiveApiConfig } from './llmService.js'

/**
 * 获取场景总结和生图提示词的系统提示
 * @returns {string} 系统提示词
 */
const getCGPromptSystemPrompt = () => {
  return `你是一个专业的AI绘画提示词生成助手。你的任务是根据游戏剧情场景，生成用于AI绘画（如Stable Diffusion）的英文提示词。

## 输出要求

你必须严格按照以下 JSON 格式输出，不要输出任何其他内容：

\`\`\`json
{
  "sceneSummary": "场景的中文简短描述（50字以内）",
  "positivePrompt": "英文正向提示词，用于AI生图",
  "negativePrompt": "英文负向提示词，用于排除不想要的元素"
}
\`\`\`

## 提示词编写规则

### 正向提示词规则：
1. 使用英文，逗号分隔
2. 描述画面主体、场景、氛围、光影、风格
3. 包含画质相关词汇：masterpiece, best quality, high resolution, detailed
4. 包含风格词汇：anime style, illustration, digital art 等
5. 描述角色外观：hair color, eye color, clothing, expression, pose
6. 描述场景细节：background, lighting, atmosphere
7. 按重要性排序，重要的词放前面
8. 总长度控制在 200-400 个字符

### 负向提示词规则：
1. 使用英文，逗号分隔
2. 排除低质量元素：low quality, bad quality, blurry, pixelated
3. 排除不想要的元素：ugly, deformed, disfigured, bad anatomy
4. 排除多余元素：watermark, signature, text, logo
5. 总长度控制在 100-200 个字符

## 示例

输入场景：
"雨夜的图书馆只剩你与断续的电流声，窗外的霓虹正把地面切成碎片。伊芙站在书架旁，紫色的长发在微光中闪烁。"

输出：
\`\`\`json
{
  "sceneSummary": "雨夜图书馆，伊芙站在书架旁，霓虹灯光透过窗户",
  "positivePrompt": "masterpiece, best quality, high resolution, detailed, anime style, illustration, 1girl, purple hair, long hair, standing, library, bookshelves, night, rain, neon lights, through window, atmospheric, cinematic lighting, purple glow, mysterious atmosphere, indoor scene",
  "negativePrompt": "low quality, bad quality, blurry, pixelated, ugly, deformed, disfigured, bad anatomy, bad hands, missing fingers, extra limbs, watermark, signature, text, logo, username"
}
\`\`\`

请严格按照以上格式输出，确保 JSON 格式正确。`
}

/**
 * 根据剧情生成 CG 提示词
 * @param {Object} params - 参数对象
 * @param {Object} params.worldBook - 世界书数据
 * @param {Array} params.dialogueHistory - 对话历史
 * @param {Object} params.currentLine - 当前对话
 * @param {string} params.userInstruction - 用户额外指示（可选）
 * @returns {Promise<Object>} 生成结果
 */
export const generateCGPrompt = async (params) => {
  const { worldBook, dialogueHistory, currentLine, userInstruction } = params

  // 构建场景描述
  const sceneContext = buildSceneContext(worldBook, dialogueHistory, currentLine)

  // 构建用户提示
  const userPrompt = buildUserPrompt(sceneContext, userInstruction)

  // 获取 API 配置
  const config = await getActiveApiConfig()
  if (!config) {
    return {
      success: false,
      error: '未配置 API，请先在设置中配置并应用 API',
      data: null,
    }
  }

  try {
    // 调用 LLM API
    const response = await fetch(config.customApi, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: getCGPromptSystemPrompt(),
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    })

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

    // 解析 JSON
    const parsed = parseCGPromptResponse(content)

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error,
        data: null,
      }
    }

    return {
      success: true,
      error: null,
      data: parsed.data,
    }
  } catch (err) {
    return {
      success: false,
      error: `网络请求失败: ${err.message}`,
      data: null,
    }
  }
}

/**
 * 构建场景上下文
 * @param {Object} worldBook - 世界书数据
 * @param {Array} dialogueHistory - 对话历史
 * @param {Object} currentLine - 当前对话
 * @returns {string} 场景上下文描述
 */
const buildSceneContext = (worldBook, dialogueHistory, currentLine) => {
  const parts = []

  // 添加世界书背景信息
  if (worldBook) {
    if (worldBook.worldSetting?.background) {
      parts.push(`【世界背景】${worldBook.worldSetting.background}`)
    }

    // 添加角色信息
    if (worldBook.characters?.length > 0) {
      const charInfos = worldBook.characters.map(char => {
        const info = []
        if (char.name) info.push(`姓名: ${char.name}`)
        if (char.description) info.push(`描述: ${char.description}`)
        if (char.appearance) info.push(`外貌: ${char.appearance}`)
        return info.join('，')
      })
      parts.push(`【角色信息】${charInfos.join('；')}`)
    }
  }

  // 添加最近的对话历史（最多取最后5条）
  if (dialogueHistory?.length > 0) {
    const recentDialogues = dialogueHistory.slice(-5)
    const dialogueText = recentDialogues.map(d => {
      const speaker = d.speaker || '旁白'
      const emotion = d.emotion ? `（${d.emotion}）` : ''
      return `${speaker}${emotion}: ${d.text}`
    }).join('\n')
    parts.push(`【最近对话】\n${dialogueText}`)
  }

  // 添加当前对话
  if (currentLine) {
    const speaker = currentLine.speaker || '旁白'
    const emotion = currentLine.emotion ? `（${currentLine.emotion}）` : ''
    parts.push(`【当前场景】${speaker}${emotion}: ${currentLine.text}`)
  }

  return parts.join('\n\n')
}

/**
 * 构建用户提示
 * @param {string} sceneContext - 场景上下文
 * @param {string} userInstruction - 用户额外指示
 * @returns {string} 用户提示
 */
const buildUserPrompt = (sceneContext, userInstruction) => {
  let prompt = `请根据以下游戏场景，生成用于AI绘画的提示词：\n\n${sceneContext}`

  if (userInstruction) {
    prompt += `\n\n【额外要求】${userInstruction}`
  }

  return prompt
}

/**
 * 解析 CG 提示词响应
 * @param {string} content - LLM 返回的内容
 * @returns {Object} 解析结果
 */
const parseCGPromptResponse = (content) => {
  try {
    // 尝试提取 JSON 块
    let jsonStr = content

    // 检查是否有 ```json 包裹
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    } else {
      // 尝试直接匹配 JSON 对象
      const objectMatch = content.match(/\{[\s\S]*\}/)
      if (objectMatch) {
        jsonStr = objectMatch[0]
      }
    }

    const data = JSON.parse(jsonStr)

    // 验证必需字段
    if (!data.positivePrompt) {
      return {
        success: false,
        error: '缺少正向提示词',
        data: null,
      }
    }

    // 设置默认值
    return {
      success: true,
      data: {
        sceneSummary: data.sceneSummary || '',
        positivePrompt: data.positivePrompt,
        negativePrompt: data.negativePrompt || 'low quality, bad quality, blurry, ugly, distorted, deformed',
      },
    }
  } catch (err) {
    return {
      success: false,
      error: `解析响应失败: ${err.message}`,
      data: null,
    }
  }
}

export default {
  generateCGPrompt,
}
