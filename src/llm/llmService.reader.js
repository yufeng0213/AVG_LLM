/**
 * llmService.reader.js - 书城 LLM 服务
 * 生成小说章节，使用分隔符协议（非 JSON）。
 * 集成模板卡片系统：随机抽取 1 张卡片，注入 prompt，LLM 决定是否使用。
 */
import { callChatCompletion, getValidatedActiveConfig } from './llmService.core.js'
import { resolvePrompt } from './promptRegistry.js'
import { getNarratorFullPrompt } from '../narrator/narratorStore.js'
import { drawRandomCardTemplate, renderCardHtml, extractCardDataFromOutput } from '../../plugins/feature-reader/src/composables/readerCardTemplate.js'

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
      if (c.speechStyle) parts.push(`说话风格：${c.speechStyle.slice(0, 60)}`)
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

  // 新结构：使用items条目
  if (narrator.items && narrator.items.length > 0) {
    const itemsPrompt = getNarratorFullPrompt(narrator)
    if (itemsPrompt && itemsPrompt.trim()) {
      return itemsPrompt.trim()
    }
  }

  // 兼容旧数据
  const parts = []
  if (narrator.name) parts.push(`叙事者：${narrator.name}`)
  if (narrator.summary) parts.push(`风格定位：${narrator.summary}`)
  if (narrator.stylePrompt) parts.push(`文风：${narrator.stylePrompt}`)
  if (narrator.instructionPrompt) parts.push(`约束：${narrator.instructionPrompt}`)
  return parts.join('\n') || '默认叙事者风格'
}

/**
 * 构建卡片使用说明（注入到 systemPrompt 中）
 * 随机抽取 1 张卡片模板，将卡片信息注入 prompt，LLM 决定是否使用。
 */
async function buildCardInstructions() {
  const card = await drawRandomCardTemplate()
  if (!card) return { prompt: '', cardMeta: null }

  // 构建变量说明
  const varLines = Object.entries(card.variables).map(([key, info]) => {
    const desc = info.description || key
    return `  - \`${key}\`: ${desc}`
  }).join('\n')

  const prompt = `
【可选插入卡片】
本章可以插入 1 张「${card.name}」卡片，用于增强剧情沉浸感。

卡片描述：${card.description}
可用字段：
${varLines}

使用方法：
如果你认为当前章节内容适合使用这张卡片，请在章节正文的合适位置插入以下 JSON 格式标记（独占一行）：
\`\`\`json
{"cardType": "${card.id}", "content": {"字段1": "值1", "字段2": "值2"}}
\`\`\`

注意事项：
- 标记独占一行，前后各空一行
- 每章最多 1 张卡片
- 如果当前内容不适合使用此卡片，可以不生成任何卡片标记，直接写正文即可`

  return { prompt, cardMeta: card }
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

  const { prompt: cardPrompt, cardMeta } = await buildCardInstructions()
  const systemPrompt = (await resolvePrompt('reader:chapter')) + cardPrompt

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt,
    userPrompt,
    temperature: 0.8,
    maxTokens: 6000,
    timeout: 180000,
    label: 'Book First Chapter',
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  const parsed = parseChapterOutput(result.data)
  if (!parsed) {
    return { success: false, error: '章节内容解析失败', rawData: result.data }
  }

  // 尝试从章节内容中提取并渲染卡片
  const cardData = extractCardDataFromOutput(parsed.content)
  let finalContent = parsed.content
  let renderedCardHtml = null

  if (cardData && cardMeta) {
    // 从原始内容中移除卡片标记（只保留纯文本部分）
    finalContent = stripCardMarkers(parsed.content)
    // 渲染卡片 HTML
    renderedCardHtml = renderCardHtml({
      templateHtml: cardMeta.templateHtml,
      content: cardData.content,
    })
  }

  return {
    success: true,
    error: null,
    title: parsed.title,
    content: finalContent,
    cardHtml: renderedCardHtml,
    suggestions: parsed.suggestions,
    wordCount: finalContent.length,
  }
}

/**
 * 从已有章节提取剧情记忆摘要
 */
export async function extractStoryMemories(params = {}) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error }
  }

  const { chapters = [] } = params

  const chaptersText = chapters
    .map((ch) => `【${ch.title}】\n${ch.content}`)
    .join('\n\n')

  const userPrompt = `以下是一系列章节的完整内容。请提取剧情记忆摘要，包括：
- 已发生的主要事件和剧情转折
- 角色之间的关系变化
- 重要的伏笔和未解之谜
- 角色当前的处境和心理状态

【章节内容】
${chaptersText}

请以简洁的结构化格式输出，每个条目一行，便于后续生成新章节时作为上下文参考。`

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: '你是一个专业的小说编辑，擅长从长篇文本中提取关键剧情和人物关系变化。请输出简洁、结构化的剧情记忆摘要。',
    userPrompt,
    temperature: 0.3,
    maxTokens: 2000,
    timeout: 120000,
    label: 'Reader Memory Extraction',
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  return {
    success: true,
    content: result.data.trim(),
    extractedAt: new Date().toISOString(),
    chapterCount: chapters.length,
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

  const { worldBook, recentChapters = [], userDirection, wordCount = 1200, narrator, memories } = params

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
    memories ? `【剧情记忆】\n${memories}` : '',
    recentText ? `【已有剧情】\n${recentText}` : '【已有剧情】\n（这是全新的一章，请根据世界观和角色信息自行构思）',
    `【读者期望的方向】\n${userDirection || '自由发展'}`,
    '',
    `请继续生成下一章，保持与之前剧情的一致性。字数约 ${wordCount} 字。`,
  ].filter(Boolean).join('\n\n')

  const { prompt: cardPrompt, cardMeta } = await buildCardInstructions()
  const systemPromptNext = (await resolvePrompt('reader:chapter')) + cardPrompt

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: systemPromptNext,
    userPrompt,
    temperature: 0.8,
    maxTokens: 6000,
    timeout: 180000,
    label: 'Book Next Chapter',
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  const parsed = parseChapterOutput(result.data)
  if (!parsed) {
    return { success: false, error: '章节内容解析失败', rawData: result.data }
  }

  // 尝试从章节内容中提取并渲染卡片
  const cardData = extractCardDataFromOutput(parsed.content)
  let finalContent = parsed.content
  let renderedCardHtml = null

  if (cardData && cardMeta) {
    finalContent = stripCardMarkers(parsed.content)
    renderedCardHtml = renderCardHtml({
      templateHtml: cardMeta.templateHtml,
      content: cardData.content,
    })
  }

  return {
    success: true,
    error: null,
    title: parsed.title,
    content: finalContent,
    cardHtml: renderedCardHtml,
    suggestions: parsed.suggestions,
    wordCount: finalContent.length,
  }
}

/**
 * 从内容中移除卡片标记，保留纯文本
 */
function stripCardMarkers(text) {
  // 移除 JSON 代码块标记
  text = text.replace(/```json\s*\{[\s\S]*?\}\s*```/g, '').trim()
  // 移除单独的 JSON 对象
  text = text.replace(/\{\s*"cardType"\s*:[\s\S]*?\}/g, '').trim()
  // 移除旧标记格式
  text = text.replace(/\{\{card:[^}]+\}\}/g, '').trim()
  // 清理多余空行
  text = text.replace(/\n{3,}/g, '\n\n').trim()
  return text
}
