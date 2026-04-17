/**
 * llmService.quiz.js - 陪学 APP LLM 服务
 * 提供出题、评分、URL 解析、角色教学等 LLM 调用。
 */
import { callChatCompletion, getValidatedActiveConfig } from './llmService.core.js'

// ===== System Prompts =====

const QUIZ_GENERATE_SYSTEM_PROMPT = `你是一个专业的题目生成器。你需要根据给定的主题和难度生成高质量的测试题。

硬性要求：
1. 只输出 JSON 对象，不要 markdown，不要解释
2. JSON 格式为: {"questions": [...]}
3. 每道题必须包含:
   - type: "multiple_choice" 或 "true_false"
   - question: 题目文本
   - options: 选项数组（判断题不需要）
   - correctIndex: 正确答案索引（从 0 开始，判断题 0=正确 1=错误）
   - explanation: 详细解析
   - difficulty: "easy"/"medium"/"hard"
   - topic: 所属知识点
4. 选项数量为 4 个
5. 题目要具有区分度，不能太简单也不能太偏`

const URL_PARSE_SYSTEM_PROMPT = `你是一个教学内容解析器。用户会给你一个 URL，你需要根据你对该 URL 主题的知识，提取核心知识点并生成教学材料。

硬性要求：
1. 只输出 JSON 对象，不要 markdown，不要解释
2. JSON 格式为:
{
  "title": "主题名称",
  "summary": "200字以内的内容摘要",
  "keyPoints": ["知识点1", "知识点2", "知识点3"],
  "difficulty": "beginner",
  "teachingContent": "800字以内的完整教学内容",
  "quizQuestions": [
    {
      "type": "multiple_choice",
      "question": "题目",
      "options": ["A选项", "B选项", "C选项", "D选项"],
      "correctIndex": 0,
      "explanation": "为什么这个答案正确",
      "difficulty": "easy",
      "topic": "所属知识点"
    }
  ]
}
3. quizQuestions 生成 3-5 道题
4. teachingContent 要覆盖核心知识点，便于用户理解`

const TEACHING_SYSTEM_PROMPT = `你是一个互动教学助手。你需要扮演指定角色来给玩家讲解知识。

重要规则：
1. 必须保持角色的一致性——用角色的语气、用词、态度来讲解
2. 知识点必须准确，不能因为角色风格而牺牲正确性
3. 如果角色的性格和教学内容有冲突，优先保证知识正确，但用角色的方式表达
4. 讲解要生动有趣，可以举角色世界观中的例子
5. 讲完后出 1-3 道随堂测试题
6. 鼓励玩家提问
7. 如果是深入学习模式，请在前一轮基础上继续推进，不要重复之前的内容，讲解更进阶的知识

输出格式：
{
  "teachingContent": "完整的教学内容（带角色风格）",
  "quizQuestions": [
    {
      "type": "multiple_choice",
      "question": "题目",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "解析",
      "difficulty": "easy",
      "topic": "知识点"
    }
  ]
}`

const TEACHING_REPLY_SYSTEM_PROMPT = `你是一个互动教学助手。你正在扮演指定角色回答玩家的追问。

重要规则：
1. 必须保持角色的一致性
2. 知识点必须准确
3. 回答要简洁但完整
4. 如果玩家的问题超出了当前主题，可以适度扩展但仍保持相关性

请直接回答玩家的问题，不要输出 JSON。`

const RATING_SYSTEM_PROMPT = `你是一个评级系统。根据用户的答题表现，给出综合评级和详细分析。

只输出 JSON:
{
  "rating": "D/C/B/A/S 中的一个",
  "accuracy": 0.85,
  "strengths": ["擅长的知识点1"],
  "weaknesses": ["薄弱的知识点1"],
  "suggestion": "学习建议"
}`

// ===== JSON 解析工具 =====

function parseQuizJson(rawContent) {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const tryParse = (text) => {
    try { return JSON.parse(text) } catch { return null }
  }

  // 1. 尝试提取 markdown 代码块
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    const parsed = tryParse(fencedMatch[1].trim())
    if (parsed) return parsed
  }

  // 2. 直接解析
  const direct = tryParse(raw)
  if (direct) return direct

  // 3. 提取 { } 范围
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return tryParse(raw.slice(start, end + 1))
  }

  return null
}

// ===== LLM 函数 =====

/**
 * 生成测验题目
 */
export async function generateQuizQuestions(params = {}) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error, questions: [] }
  }

  const { topic = '', difficulty = 'mixed', count = 5, questions = [] } = params

  const difficultyText = difficulty === 'mixed' ? '混合难度' : difficulty === 'easy' ? '简单' : difficulty === 'medium' ? '中等' : '困难'

  const userPrompt = [
    `请生成 ${count} 道关于「${topic}」的${difficultyText}测试题。`,
    '要求：',
    '- 题目要有区分度，不能太简单',
    '- 选项要有迷惑性',
    '- 解析要详细',
    '- 只返回 JSON 格式',
  ].join('\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: QUIZ_GENERATE_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.7,
    maxTokens: 4000,
    timeout: 180000,
  })

  if (!result.success) {
    return { success: false, error: result.error, questions: [] }
  }

  const parsed = parseQuizJson(result.data)
  if (!parsed?.questions || !Array.isArray(parsed.questions)) {
    return { success: false, error: '题目生成格式错误', questions: [], rawData: result.data }
  }

  return { success: true, error: null, questions: parsed.questions, rawData: result.data }
}

/**
 * 生成测评题目（多套不同难度）
 */
export async function generateAssessmentQuestions(params = {}) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error, sets: [] }
  }

  const { topic = '', setsCount = 3, questionsPerSet = 4 } = params
  const allSets = []

  const difficulties = ['easy', 'medium', 'hard']

  for (let i = 0; i < Math.min(setsCount, difficulties.length); i++) {
    const difficulty = difficulties[i]
    const userPrompt = [
      `请生成 ${questionsPerSet} 道关于「${topic}」的测试题。`,
      `这是第 ${i + 1} 套，难度为 ${difficulty}。`,
      '请只返回 JSON 格式。',
    ].join('\n')

    const result = await callChatCompletion({
      config: validated.config,
      systemPrompt: QUIZ_GENERATE_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.7 + i * 0.1,
      maxTokens: 4000,
      timeout: 180000,
    })

    if (result.success) {
      const parsed = parseQuizJson(result.data)
      if (parsed?.questions) {
        allSets.push({ difficulty, questions: parsed.questions })
      }
    }
  }

  if (allSets.length === 0) {
    return { success: false, error: '测评题目生成失败', sets: [] }
  }

  return { success: true, error: null, sets: allSets }
}

/**
 * 解析 URL 内容
 */
export async function parseUrlContent(url) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error }
  }

  const userPrompt = `请分析以下 URL 的内容并生成教学和测评材料：\nURL: ${url}\n\n请根据你对该 URL 主题的了解，生成教学内容。`

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: URL_PARSE_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.6,
    maxTokens: 5000,
    timeout: 180000,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  const parsed = parseQuizJson(result.data)
  if (!parsed) {
    return { success: false, error: 'URL 解析格式错误', rawData: result.data }
  }

  return {
    success: true,
    error: null,
    title: parsed.title || '未命名',
    summary: parsed.summary || '',
    keyPoints: parsed.keyPoints || [],
    difficulty: parsed.difficulty || 'beginner',
    teachingContent: parsed.teachingContent || '',
    quizQuestions: Array.isArray(parsed.quizQuestions) ? parsed.quizQuestions : [],
  }
}

/**
 * 角色风格教学
 */
export async function generateTeachingContent(params = {}) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error }
  }

  const { topic, urlContent, character, worldBook, playerName = '玩家', deepLevel = 0, previousContent = '' } = params

  const characterText = buildTeachingCharacterInfo(character)
  const worldText = worldBook ? `【世界观】${worldBook.title || ''}\n${worldBook.summary || ''}` : ''
  const contentSource = urlContent
    ? `【学习内容】\n标题：${urlContent.title}\n摘要：${urlContent.summary}\n知识点：${(urlContent.keyPoints || []).join('、')}`
    : `【学习主题】${topic}`

  const deepPrompt = deepLevel > 0
    ? `\n【重要】这是第 ${deepLevel + 1} 轮深入学习。请在之前内容的基础上，继续往前推进，讲解更深入、更进阶的知识点。不要重复之前已经讲过的内容。\n${previousContent ? `【之前讲解的内容摘要】\n${previousContent}` : ''}`
    : ''

  const userPrompt = [
    characterText ? `【讲师信息】\n${characterText}` : '',
    worldText ? `【世界观信息】\n${worldText}` : '',
    `【玩家名】${playerName}`,
    contentSource,
    deepPrompt,
    '',
    '请以讲师的身份，给玩家讲解以上内容。讲完后出 1-3 道随堂测试题。',
    '只返回 JSON 格式。',
  ].filter(Boolean).join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: TEACHING_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.75 + deepLevel * 0.05,
    maxTokens: 5000 + deepLevel * 500,
    timeout: 180000,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  const parsed = parseQuizJson(result.data)
  if (!parsed) {
    return { success: false, error: '教学内容格式错误', rawData: result.data }
  }

  return {
    success: true,
    error: null,
    teachingContent: parsed.teachingContent || '',
    quizQuestions: Array.isArray(parsed.quizQuestions) ? parsed.quizQuestions : [],
  }
}

/**
 * 角色回复追问（对话模式）
 */
export async function generateTeachingReply(params = {}) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error }
  }

  const { character, topic, question, teachingContext = '' } = params

  const characterText = buildTeachingCharacterInfo(character)

  const userPrompt = [
    `【讲师信息】\n${characterText}`,
    teachingContext ? `【之前讲解的内容】\n${teachingContext}` : '',
    `【学习主题/来源】${topic}`,
    `【玩家的追问】${question}`,
    '',
    '请以讲师的身份，用你的风格回答玩家的问题。',
  ].join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: TEACHING_REPLY_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.8,
    maxTokens: 2000,
    timeout: 120000,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  return {
    success: true,
    error: null,
    reply: result.data,
  }
}

/**
 * 判分 + 生成解析
 */
export async function gradeAnswer(params = {}) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error }
  }

  const { question, userAnswer } = params
  const isCorrect = userAnswer === question.correctIndex

  // 如果题目已有 explanation，直接返回
  if (question.explanation) {
    return {
      success: true,
      error: null,
      isCorrect,
      explanation: question.explanation,
    }
  }

  // 否则让 LLM 生成解析
  const userPrompt = `题目：${question.question}\n选项：${(question.options || []).map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}\n正确答案：${String.fromCharCode(65 + question.correctIndex)}\n用户答案：${String.fromCharCode(65 + userAnswer)}\n\n请详细解析这道题。`

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: '你是一个耐心的老师，会详细解答题目，解释为什么某个选项正确、其他选项为什么错误。',
    userPrompt,
    temperature: 0.6,
    maxTokens: 1500,
    timeout: 120000,
  })

  return {
    success: true,
    error: null,
    isCorrect,
    explanation: result.success ? result.data : '暂无解析',
  }
}

/**
 * 计算评级
 */
export async function calculateRating(params = {}) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error }
  }

  const { questions, answers, topic } = params
  const total = questions.length
  const correct = answers.filter((a, i) => a === questions[i]?.correctIndex).length
  const accuracy = total > 0 ? correct / total : 0

  const questionText = questions.map((q, i) => {
    const isCorrect = answers[i] === q.correctIndex
    return `Q${i + 1}: ${q.question} - ${isCorrect ? '✓' : '✗'} (知识点: ${q.topic || '未知'})`
  }).join('\n')

  const userPrompt = [
    `主题：${topic}`,
    `答题情况（共 ${total} 题，答对 ${correct} 题，正确率 ${Math.round(accuracy * 100)}%）：`,
    questionText,
    '',
    '请给出综合评级和详细分析。',
    '只返回 JSON。',
  ].join('\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: RATING_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.5,
    maxTokens: 1000,
    timeout: 120000,
  })

  if (!result.success) {
    // 降级：根据正确率直接计算
    return {
      success: true,
      error: null,
      rating: accuracyToRating(accuracy),
      accuracy,
      strengths: [],
      weaknesses: [],
      suggestion: '继续加油！',
    }
  }

  const parsed = parseQuizJson(result.data)
  return {
    success: true,
    error: null,
    rating: parsed?.rating || accuracyToRating(accuracy),
    accuracy: parsed?.accuracy || accuracy,
    strengths: parsed?.strengths || [],
    weaknesses: parsed?.weaknesses || [],
    suggestion: parsed?.suggestion || '继续加油！',
  }
}

function accuracyToRating(accuracy) {
  if (accuracy >= 0.9) return 'S'
  if (accuracy >= 0.75) return 'A'
  if (accuracy >= 0.55) return 'B'
  if (accuracy >= 0.35) return 'C'
  return 'D'
}

function buildTeachingCharacterInfo(character) {
  if (!character) return ''
  const parts = []
  if (character.name) parts.push(`角色名：${character.name}`)
  if (character.nickname) parts.push(`昵称：${character.nickname}`)
  if (character.identity) parts.push(`身份：${character.identity}`)
  if (character.appearance) parts.push(`外表：${character.appearance}`)
  if (character.background) parts.push(`背景：${character.background}`)
  if (character.notes) parts.push(`性格备注：${character.notes}`)
  if (character.personalityProfile) {
    const p = character.personalityProfile
    if (p.mbti) parts.push(`MBTI：${p.mbti}`)
    if (Array.isArray(p.behaviorTags) && p.behaviorTags.length > 0) {
      parts.push(`行为标签：${p.behaviorTags.join('、')}`)
    }
  }
  return parts.join('\n')
}
