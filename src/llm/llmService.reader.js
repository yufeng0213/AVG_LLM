/**
 * llmService.reader.js - 书城 LLM 服务
 * 生成小说章节，使用分隔符协议（非 JSON）。
 */
import { callChatCompletion, getValidatedActiveConfig } from './llmService.core.js'

// ===== System Prompt =====

const READER_SYSTEM_PROMPT = `你是一个专业的小说作家，以叙事者的视角讲述故事。

写作要求：
1. 使用小说叙事体，不是对话剧本格式
2. 包含环境描写、人物描写、心理活动
3. 对话自然融入叙述中
4. 每章有起承转合，结尾留有悬念或自然过渡
5. 支持 Markdown 格式（可以用 **加粗**、*斜体* 等）
6. 叙事风格要统一，保持角色的性格一致性

输出格式（必须严格遵守）：

|title=章节标题|
章节正文内容...

|end|
|suggestions=下一章方向A|下一章方向B|下一章方向C|

说明：
- |title=...| 之间是章节标题
- |end| 标记正文结束
- |suggestions=A|B|C| 是 3 个下一章建议方向，用 | 分隔
- 不要输出任何其他内容，不要输出 JSON`

// ===== 解析函数 =====

function parseChapterOutput(rawContent) {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  // 提取标题
  const titleMatch = raw.match(/\|title=(.+?)\|/)
  const title = titleMatch ? titleMatch[1].trim() : '未命名章节'

  // 提取正文（在 |title=...| 和 |end| 之间）
  let content = ''
  const endMatch = raw.indexOf('|end|')
  if (endMatch > 0 && titleMatch) {
    const startIdx = titleMatch.index + titleMatch[0].length
    content = raw.slice(startIdx, endMatch).trim()
  }

  // 提取建议（在 |suggestions= 之后）
  const suggestions = []
  const sugMatch = raw.match(/\|suggestions=(.+?)(?:\||$)/)
  if (sugMatch) {
    const sugText = sugMatch[1].trim()
    if (sugText.includes('|')) {
      sugText.split('|').forEach(s => {
        const trimmed = s.trim()
        if (trimmed) suggestions.push(trimmed)
      })
    } else if (sugText) {
      suggestions.push(sugText)
    }
  }

  if (!content) return null

  return {
    title,
    content,
    suggestions: suggestions.slice(0, 4),
  }
}

// ===== LLM 函数 =====

function buildCharacterSummary(characters) {
  if (!Array.isArray(characters)) return ''
  return characters
    .slice(0, 8)
    .map(c => {
      const parts = [`${c.name || '未知'}`]
      if (c.identity) parts.push(`身份：${c.identity}`)
      if (c.appearance) parts.push(`外貌：${c.appearance.slice(0, 80)}`)
      if (c.notes) parts.push(`性格：${c.notes.slice(0, 60)}`)
      if (c.background) parts.push(`背景：${c.background.slice(0, 80)}`)
      return parts.join(' | ')
    })
    .join('\n')
}

function buildWorldSummary(worldBook) {
  if (!worldBook) return ''
  const parts = [`世界：${worldBook.title || '未命名'}`]
  if (worldBook.summary) parts.push(`摘要：${worldBook.summary}`)
  if (worldBook.entries?.overview) parts.push(`概述：${worldBook.entries.overview}`)
  return parts.join('\n')
}

function buildNarratorSummary(narrator) {
  if (!narrator) return '默认叙事者风格'
  const parts = []
  if (narrator.name) parts.push(`叙事者：${narrator.name}`)
  if (narrator.summary) parts.push(`风格定位：${narrator.summary}`)
  if (narrator.stylePrompt) parts.push(`文风：${narrator.stylePrompt}`)
  if (narrator.instructionPrompt) parts.push(`约束：${narrator.instructionPrompt}`)
  return parts.join('\n') || '默认叙事者风格'
}

/**
 * 生成第一章
 */
export async function generateFirstChapter(params = {}) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error }
  }

  const { worldBook, brief = '', wordCount = 1200, narrator } = params

  const worldSummary = buildWorldSummary(worldBook)
  const charSummary = buildCharacterSummary(worldBook?.characters)
  const narratorSummary = buildNarratorSummary(narrator)

  const briefLine = brief
    ? `【故事简介】\n${brief}`
    : '【故事简介】\n（未指定简介，请根据世界观自行构思故事方向）'

  const userPrompt = [
    `【叙事者风格】\n${narratorSummary}`,
    `【世界观】\n${worldSummary}`,
    charSummary ? `【角色信息】\n${charSummary}` : '',
    briefLine,
    '',
    `请生成第一章，自拟标题，字数约 ${wordCount} 字。`,
  ].filter(Boolean).join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: READER_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.8,
    maxTokens: 6000,
    timeout: 180000,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  const parsed = parseChapterOutput(result.data)
  if (!parsed) {
    return { success: false, error: '章节内容解析失败', rawData: result.data }
  }

  return {
    success: true,
    error: null,
    title: parsed.title,
    content: parsed.content,
    suggestions: parsed.suggestions,
    wordCount: parsed.content.length,
  }
}

/**
 * 生成下一章
 */
export async function generateNextChapter(params = {}) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error }
  }

  const { worldBook, recentChapters = [], userDirection, wordCount = 1200, narrator } = params

  const worldSummary = buildWorldSummary(worldBook)
  const charSummary = buildCharacterSummary(worldBook?.characters)
  const narratorSummary = buildNarratorSummary(narrator)

  // 使用传入的完整章节内容，不再截断
  const recentText = recentChapters
    .map((ch) => `【${ch.title}】\n${ch.content}`)
    .join('\n\n')

  const userPrompt = [
    `【叙事者风格】\n${narratorSummary}`,
    `【世界观】\n${worldSummary}`,
    charSummary ? `【角色信息】\n${charSummary}` : '',
    recentText ? `【已有剧情】\n${recentText}` : '【已有剧情】\n（这是全新的一章，请根据世界观和角色信息自行构思）',
    `【读者期望的方向】\n${userDirection || '自由发展'}`,
    '',
    `请继续生成下一章，保持与之前剧情的一致性。字数约 ${wordCount} 字。`,
  ].filter(Boolean).join('\n\n')

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: READER_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.8,
    maxTokens: 6000,
    timeout: 180000,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  const parsed = parseChapterOutput(result.data)
  if (!parsed) {
    return { success: false, error: '章节内容解析失败', rawData: result.data }
  }

  return {
    success: true,
    error: null,
    title: parsed.title,
    content: parsed.content,
    suggestions: parsed.suggestions,
    wordCount: parsed.content.length,
  }
}
