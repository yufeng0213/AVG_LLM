/**
 * LLM 服务模块
 * 负责与 LLM API 通信，生成剧情内容
 */

// 存储 key 常量
const CONFIG_STORAGE_KEY = 'avg_llm_api_configs'
const ACTIVE_CONFIG_KEY = 'avg_llm_active_api_id'

/**
 * 获取当前激活的 API 配置
 * @returns {Object|null} API 配置对象
 */
export const getActiveApiConfig = () => {
  if (typeof window === 'undefined') return null

  try {
    const activeId = localStorage.getItem(ACTIVE_CONFIG_KEY)
    if (!activeId) return null

    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    const configs = raw ? JSON.parse(raw) : []
    return configs.find((c) => c.id === activeId) || null
  } catch {
    return null
  }
}

/**
 * 调用 LLM API 生成剧情
 * @param {string} prompt - 完整的 prompt 字符串
 * @param {Object} options - 可选配置
 * @returns {Promise<Object>} 生成结果
 */
export const generateStory = async (prompt, options = {}) => {
  const config = getActiveApiConfig()
  
  if (!config) {
    return {
      success: false,
      error: '未配置 API，请先在设置中配置并应用 API',
      data: null,
    }
  }

  const { customApi, apiKey, model } = config

  if (!customApi || !apiKey) {
    return {
      success: false,
      error: 'API 配置不完整，请检查 API 地址和 Key',
      data: null,
    }
  }

  try {
    const response = await fetch(customApi, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: getSystemPrompt(),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: options.temperature || 0.8,
        max_tokens: options.maxTokens || 2000,
        ...options.extraParams,
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

    return {
      success: true,
      error: null,
      data: content,
      rawResponse: data,
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
 * 获取系统提示词
 * @returns {string} 系统提示词
 */
const getSystemPrompt = () => {
  return `你是一个专业的视觉小说/AVG游戏剧情生成助手。你的任务是根据提供的世界设定、角色信息和当前剧情，生成接下来的剧情内容。

## 输出格式要求

你必须严格按照以下 JSON 格式输出，每条对话为一个 JSON 对象，多段对话放在 JSON 数组中：

\`\`\`json
[
  {
    "speaker": "说话者名称",
    "emotion": "表情标识",
    "text": "对话内容",
    "highlight": true
  }
]
\`\`\`

### 字段说明：
- **speaker**: 说话者名称，必须是已定义的角色名称或"旁白"
- **emotion**: 表情标识，可选值如下：
  - default: 默认/平静
  - happy: 开心/高兴
  - angry: 生气/愤怒
  - sad: 悲伤/难过
  - surprised: 惊讶/吃惊
  - fear: 恐惧/害怕
  - disgust: 厌恶/反感
  - neutral: 平静/淡然
  - shy: 害羞/腼腆
  - thinking: 思考/沉思
  - sleepy: 困倦/疲惫
  - excited: 兴奋/激动
  - worried: 担心/忧虑
  - confident: 自信/坚定
- **text**: 对话内容，描述性文字或角色台词
- **highlight**: 布尔值，true 表示该角色立绘需要高亮显示

## 选项生成要求（重要！）

**每次生成都必须在最后一条对话中添加 \`choices\` 字段，为玩家提供选择分支！** 这是强制要求，用于测试交互式剧情功能。

\`\`\`json
[
  {
    "speaker": "旁白",
    "emotion": "default",
    "text": "你面前有一扇紧闭的门，门缝中透出微弱的光芒。",
    "highlight": false,
    "choices": {
      "prompt": "你要怎么做？",
      "options": [
        { "text": "打开门", "action": "open_door" },
        { "text": "不打开", "action": "ignore_door" },
        { "text": "交给伊芙处理", "action": "ask_eve" }
      ],
      "allowCustomInput": true
    }
  }
]
\`\`\`

### choices 字段说明：
- **prompt**: 选择提示语，向玩家说明当前情境
- **options**: 选项数组，每个选项包含：
  - text: 选项显示文本
  - action: 选项动作标识（用于后续处理）
- **allowCustomInput**: 布尔值，必须设置为 true，允许玩家自定义输入内容

## 创作要求

1. 保持角色性格一致性
2. 剧情发展要符合世界观设定
3. 合理使用表情标识来增强表现力
4. 每次生成 1-3 条对话为宜
5. 确保输出是合法的 JSON 格式
6. 不要输出任何 JSON 之外的内容
7. **【强制】每次生成的最后一条对话必须包含 choices 字段**
8. 选项应该符合剧情逻辑，提供有意义的分支
9. 每次提供 2-4 个选项，allowCustomInput 必须为 true`
}

export default {
  generateStory,
  getActiveApiConfig,
}