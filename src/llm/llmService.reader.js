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

  const { worldBook, brief = '', wordCount = 1200, narrator, genre, tags } = params

  const worldSummary = buildWorldSummary(worldBook)
  const charSummary = buildCharacterSummary(worldBook?.characters)
  const narratorSummary = buildNarratorSummary(narrator)

  const briefLine = brief
    ? `【故事简介】\n${brief}`
    : '【故事简介】\n（未指定简介，请根据世界观自行构思故事方向）'

  const genreLine = genre
    ? `【故事类型】${genre}${tags && tags.length > 0 ? ' | 标签：' + tags.join('、') : ''}`
    : ''

  const userPrompt = [
    `【叙事者风格】\n${narratorSummary}`,
    `【世界观】\n${worldSummary}`,
    charSummary ? `【角色信息】\n${charSummary}` : '',
    briefLine,
    genreLine ? `【风格定位】\n${genreLine}` : '',
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

  const comments = parseChapterComments(result.data)

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
    comments,
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
 * 生成章节大纲（10 个章节标题）
 * 只生成标题，不写内容，作为故事路标
 * @param {Object} params
 * @param {Object} params.worldBook - 世界书
 * @param {string} params.brief - 故事简介
 * @param {Array} params.existingChapters - 已有章节
 * @param {string} params.memories - 剧情记忆
 * @param {Object} params.narrator - 叙事者
 * @param {number} params.count - 生成数量，默认 10
 */
export async function generateChapterOutline(params = {}) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error }
  }

  const { worldBook, brief, book, mainCharacters, existingChapters = [], existingOutlines = [], memories, narrator, count = 10 } = params

  const worldSummary = buildWorldSummary(worldBook)
  const narratorSummary = buildNarratorSummary(narrator)
  const charSummary = buildCharacterSummary(worldBook?.characters)

  const recentText = existingChapters.length > 0
    ? existingChapters.map(ch => `【${ch.title}】\n${ch.content || ''}`).join('\n\n')
    : ''

  const existingOutlineText = existingOutlines.length > 0
    ? existingOutlines.map((t, i) => `第${i + 1}章: ${t}`).join('\n')
    : ''

  const userPrompt = `你是一个专业的小说编辑，擅长规划长篇故事的剧情走向。

${narratorSummary ? `【叙事者风格】\n${narratorSummary}\n\n` : ''}
${worldSummary ? `【故事世界观】\n这是一个基于以下世界观的全新故事：\n${worldSummary}\n\n` : ''}${!worldSummary && mainCharacters ? `【主要角色设定】\n以下是本书主要角色的设定，请以此为基础创作：\n${mainCharacters}\n\n` : ''}${book?.worldview ? `【本书世界观】\n以下是本书专属的世界观设定，请严格遵循：\n${book.worldview}\n\n` : ''}${brief ? `【故事简介】\n${brief}\n\n` : ''}${book?.genre ? `【小说类型】\n${book.genre}\n\n` : ''}${book?.tags && book.tags.length > 0 ? `【类型标签】\n${book.tags.join('、')}\n\n` : ''}${memories ? `【剧情记忆】\n${memories}\n\n` : ''}${recentText ? `【已有剧情】\n${recentText}\n\n` : ''}${existingOutlineText ? `【已有大纲标题】\n以下是已经规划好的大纲标题，请不要重复生成，接着继续往后规划新的章节：\n${existingOutlineText}\n\n` : ''}
请为接下来的剧情生成 ${count} 个章节标题，构成一个完整的故事弧。
${existingOutlineText ? '注意：已有大纲标题如上，请不要重复生成，接着继续往后规划新的章节。' : ''}

要求：
- 每个标题 4-8 个汉字，要有诗意或悬念感
- 章节之间要有递进关系，从铺垫到冲突到解决
- 符合当前已有的剧情走向和角色设定
- 不要输出任何解释，只输出标题

格式（必须严格遵守）：
|title=第一章标题|
|title=第二章标题|
|title=第三章标题|
...
|end|
`

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: '你是一个专业的小说编辑，擅长为长篇故事规划章节结构。请生成有吸引力、有悬念感的章节标题。',
    userPrompt,
    temperature: 0.7,
    maxTokens: 1500,
    timeout: 60000,
    label: 'Chapter Outline',
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  const titles = parseOutlineTitles(result.data, count)
  if (titles.length === 0) {
    return { success: false, error: '未能解析任何章节标题', rawData: result.data }
  }

  return {
    success: true,
    titles,
    count: titles.length,
  }
}

/**
 * 解析 LLM 输出的章节标题列表
 */
function parseOutlineTitles(rawContent, maxCount = 10) {
  const raw = String(rawContent || '').trim()
  if (!raw) return []

  const titles = []
  const re = /\|title=(.+?)\|/g
  let match

  while ((match = re.exec(raw)) !== null) {
    const title = match[1].trim()
    if (title && titles.length < maxCount) {
      titles.push(title)
    }
  }

  return titles
}

/**
 * 根据已有大纲标题生成具体章节
 * @param {Object} params
 * @param {Object} params.worldBook - 世界书
 * @param {string} params.chapterTitle - 本章标题
 * @param {Array} params.recentChapters - 已有章节
 * @param {string} params.memories - 剧情记忆
 * @param {Object} params.narrator - 叙事者
 * @param {number} params.wordCount - 目标字数
 */
export async function generateChapterFromOutline(params = {}) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error }
  }

  const { worldBook, chapterTitle, book, mainCharacters, recentChapters = [], memories, narrator, wordCount = 1200 } = params

  const worldSummary = buildWorldSummary(worldBook)
  const narratorSummary = buildNarratorSummary(narrator)

  const recentText = recentChapters.length > 0
    ? recentChapters.map(ch => `【${ch.title}】\n${ch.content || ''}`).join('\n\n')
    : ''

  const userPrompt = `你是一个专业的小说作家。${narratorSummary ? `叙事风格：${narratorSummary}\n\n` : ''}

${worldSummary ? `【故事世界观】\n这是一个基于以下世界观的全新故事：\n${worldSummary}\n\n` : ''}${book?.worldview ? `【本书世界观】\n以下是本书专属的世界观设定，请严格遵循：\n${book.worldview}\n\n` : ''}${!worldSummary && mainCharacters ? `【主要角色设定】\n以下是本书主要角色的设定，请以此为基础创作：\n${mainCharacters}\n\n` : ''}${book?.summary ? `【故事简介】\n${book.summary}\n\n` : ''}${memories ? `【剧情记忆】\n${memories}\n\n` : ''}${recentText ? `【已有剧情】\n${recentText}\n\n` : ''}【本章标题】${chapterTitle}

请根据这个标题写一章。要求：
- 章节内容要呼应标题的意境或悬念
- 使用小说叙事体，不是对话剧本格式
- 字数约 ${wordCount} 字，内容要完整充实，不要草草结束
- 保持与已有剧情的一致性
- 每章有起承转合，结尾留有悬念或自然过渡

输出格式：
|title=${chapterTitle}|
章节正文...（完整内容，不可删减截断）
|end|
|suggestions=下一章方向A|下一章方向B|下一章方向C|
`

  const { prompt: cardPrompt, cardMeta } = await buildCardInstructions()
  const chapterPrompt = (await resolvePrompt('reader:chapter')) + cardPrompt

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: chapterPrompt,
    userPrompt,
    temperature: 0.8,
    maxTokens: 12000,
    timeout: 180000,
    label: 'Chapter From Outline',
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  const parsed = parseChapterOutput(result.data)
  if (!parsed) {
    return { success: false, error: '章节内容解析失败', rawData: result.data }
  }

  // 强制使用传入的大纲标题，不使用 LLM 自行生成的标题
  parsed.title = chapterTitle

  const comments = parseChapterComments(result.data)

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
    comments,
  }
}

/**
 * 生成随机新书（不限角色）
 * 每次生成 3-5 本，类型随机（角色书/同人/独立书）
 * @param {Object} params
 * @param {Array} params.worldBooks - 世界书列表（可选，用于关联书）
 * @param {Array} params.characters - 角色列表（可选，用于角色书）
 * @param {number} params.count - 生成数量，默认 3-5
 */
export async function generateNewBooks(params = {}) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error }
  }

  const { worldBooks = [], characters = [], count = 5, mainCharacters = '', preferredGenres = '' } = params

  // 计算参考角色数量：随机 1 到 count-1（至少留一个给非参考）
  const refCount = Math.min(characters.length, 1 + Math.floor(Math.random() * Math.max(1, count - 1)))
  const nonRefCount = count - refCount

  // 随机选择参考角色
  const shuffledChars = [...characters].sort(() => Math.random() - 0.5)
  const refChars = shuffledChars.slice(0, refCount)

  // 构建角色参考信息（附带ID）
  const charLines = refChars
    .map(c => `${c.name}（ID: ${c.id}，${c.identity || c.notes?.slice(0, 30) || '未知'}）`)
    .join('\n')

  // 构建世界观参考信息
  const worldLines = worldBooks.map(wb => {
    const parts = [wb.title]
    if (wb.summary) parts.push(wb.summary.slice(0, 100))
    return parts.join('：')
  }).join('\n').slice(0, 500)

  // 主要角色设定（用于非参考角色书）
  const mainCharLine = mainCharacters || '无特定设定，自由创作'

  // 偏好类型
  const genreLine = preferredGenres
    ? `优先类型：${preferredGenres}\n\n`
    : ''

  const userPrompt = `你是一个专业的网文平台编辑，负责策划新书推荐。

${worldLines ? `【参考世界观】\n${worldLines}\n\n` : ''}
${charLines ? `【参考角色】\n${charLines}\n\n` : ''}
${mainCharacters ? `【主要角色设定】\n${mainCharacters}\n\n` : ''}
${genreLine ? `【偏好类型】\n以下是用户偏好的小说类型，请优先从中选择，但也可以适当加入其他类型增加多样性：\n${preferredGenres}\n\n` : ''}请生成 ${count} 本新书推荐。要求：
- 书名要有创意，像真实网文平台上的书
- 类型可以选自：言情、玄幻、都市、悬疑、恐怖、科幻、奇幻、历史、武侠、仙侠、惊悚、军事、游戏、体育、种田、系统流、无限流、穿越、重生、末日、轻小说、同人、快穿、穿越时空、官场商战、青春校园、职场励志、美食、二次元、电竞、废土、西幻、蒸汽朋克、克苏鲁、赛博朋克、宫闱宅斗、女尊、玄幻仙侠、洪荒封神、古典仙侠、现代修真、异能、末世、虚拟网游、网游竞技、推理、治愈、日常、反套路、群像、冒险、童话、寓言、哲学、心理等
- 每本书的作者必须是真实存在的人名（角色名或笔名）
- 评分在 8.5-9.9 之间
- 书评要像真实读者的语气

输出格式（必须严格遵守）：

对于参考角色写的书（使用真实角色ID）：
|book=角色ID|
title=书名
summary=简介（100字以内）
genre=类型
rating=评分
review=读者昵称: 评论内容
reviewerAvatar=emoji（从🗣📖✨🌟💫中选）
reviewLikes=点赞数（数字）
|endbook|

对于非参考角色写的书（随机笔名，需要生成独立世界观）：
|book=free|
title=书名
author=作者名（随机笔名）
worldview=世界观设定（50-150字，描述这个独立故事的世界观背景、主要角色设定等）
summary=简介（100字以内）
genre=类型
rating=评分
review=读者昵称: 评论内容
reviewerAvatar=emoji（从🗣📖✨🌟💫中选）
reviewLikes=点赞数（数字）
|endbook|

每本之间空一行。不要输出任何其他内容。参考角色写的书必须使用上面提供的真实角色ID。非参考角色书的世界观要基于【主要角色设定】中的角色信息来构建。`

  const systemPrompt = '你是一个专业的网文平台编辑，擅长发现潜力新书和撰写吸引人的推荐文案。'

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt,
    userPrompt,
    temperature: 0.95,
    maxTokens: 8000,
    timeout: 180000,
    label: 'New Books Discovery',
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  const books = parseRandomBooks(result.data)

  return {
    success: true,
    books,
    count: books.length,
  }
}

/**
 * 解析随机新书
 */
function parseRandomBooks(rawOutput) {
  const raw = String(rawOutput || '').trim()
  if (!raw) return []

  const books = []
  const blocks = raw.split('|endbook|')

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed || !trimmed.startsWith('|book=')) continue

    const book = parseSingleBook(trimmed)
    if (book) {
      // 随机生成 id（不去重）
      book.id = `gen_book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      book.discoveredAt = new Date().toISOString()
      books.push(book)
    }
  }

  return books
}

/**
 * 生成角色小说元数据（书名、简介、书评等）
 * 为多个角色批量生成，每个角色 1 部小说
 */
export async function generateCharacterBooks(params = {}) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error }
  }

  const { worldBooks = [], characters = [] } = params

  // 构建角色信息
  const charLines = characters.map(c => {
    const parts = [`角色ID: ${c.id}`, `姓名: ${c.name}`]
    if (c.nickname) parts.push(`昵称: ${c.nickname}`)
    if (c.identity) parts.push(`身份: ${c.identity}`)
    if (c.notes) parts.push(`性格: ${c.notes.slice(0, 100)}`)
    if (c.background) parts.push(`背景: ${c.background.slice(0, 150)}`)
    if (c.appearance) parts.push(`外貌: ${c.appearance.slice(0, 80)}`)
    return parts.join(' | ')
  }).join('\n')

  // 构建世界观信息
  const worldLines = worldBooks.map(wb => {
    const parts = [`世界书: ${wb.title}`]
    if (wb.summary) parts.push(`简介: ${wb.summary.slice(0, 150)}`)
    if (wb.entries?.overview) parts.push(`概述: ${wb.entries.overview.slice(0, 150)}`)
    return parts.join(' | ')
  }).join('\n')

  const userPrompt = `你是一个专业的小说编辑，现在需要为以下角色生成他们各自创作的小说信息。

每个角色都会以自己的身份、性格和背景为基础，独立创作一部小说。
你需要根据角色信息和世界观背景，为每个角色生成一部小说的元数据。

【世界观背景】
${worldLines}

【角色列表】
${charLines}

请为每个角色生成 1 部小说的信息。要求：
- 书名要有创意，符合角色的性格和背景
- 简介要能概括小说的主线和核心冲突，200字以内
- 类型可选：言情、玄幻、都市、悬疑、科幻、奇幻、历史、武侠
- 评分在 8.5-9.9 之间
- 书评要有特色，符合读者的语气

输出格式（必须严格遵守，每个角色一个 block）：

|book=角色ID|
title=书名
summary=简介
genre=类型
rating=评分
review=评论者: 评论内容
reviewerAvatar=读者头像emoji（从🗣📖✨🌟💫中选一个）
reviewLikes=点赞数（数字）
|endbook|

每个 block 之间空一行。不要添加任何额外的解释。`

  const systemPrompt = '你是一个专业的小说编辑和书评人，擅长分析小说潜力和撰写引人入胜的书评。请根据提供的角色信息，为每个角色生成一部小说的元数据。'

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt,
    userPrompt,
    temperature: 0.9,
    maxTokens: 8000,
    timeout: 180000,
    label: 'Character Book Generation',
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  // 解析输出
  const books = parseGeneratedBooks(result.data, characters)

  return {
    success: true,
    books,
    count: books.length,
  }
}

/**
 * 解析 LLM 输出的角色小说元数据
 */
function parseGeneratedBooks(rawOutput, characters) {
  const raw = String(rawOutput || '').trim()
  if (!raw) return []

  const books = []
  // 按 |endbook| 分割
  const blocks = raw.split('|endbook|')

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed || !trimmed.startsWith('|book=')) continue

    const book = parseSingleBook(trimmed)
    if (book) books.push(book)
  }

  // 验证角色ID
  const charIds = new Set(characters.map(c => c.id))
  return books.filter(b => charIds.has(b.characterId))
}

/**
 * 解析单个 book block
 */
function parseSingleBook(block) {
  // 提取角色ID
  const idMatch = block.match(/^\|book=(.+?)\|/)
  if (!idMatch) return null

  const rawCharId = idMatch[1].trim()
  const rest = block.slice(idMatch[0].length)

  const getField = (name) => {
    const regex = new RegExp(`^${name}=(.+?)$`, 'm')
    const match = rest.match(regex)
    return match ? match[1].trim() : null
  }

  const title = getField('title') || '未命名'
  const summary = getField('summary') || '暂无简介'
  const genre = getField('genre') || '都市'
  const rating = getField('rating')
  const review = getField('review')
  const author = getField('author')
  const worldview = getField('worldview')
  const reviewerAvatar = getField('reviewerAvatar') || '🗣'
  const reviewLikes = getField('reviewLikes')

  // 解析书评（格式：评论者: 评论内容）
  let reviewerName = '书友'
  let reviewText = review || '这书真好看！'
  if (review && review.includes(':')) {
    const colonIdx = review.indexOf(':')
    reviewerName = review.slice(0, colonIdx).trim()
    reviewText = review.slice(colonIdx + 1).trim()
  }

  // 判断是否为参考角色书
  const isFreeBook = rawCharId === 'free'
  const characterId = isFreeBook ? null : rawCharId

  return {
    id: isFreeBook
      ? `gen_book_free_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      : `gen_book_${characterId}_${Date.now()}`,
    characterId,
    author: author || null, // 非参考角色书有作者名
    worldview: worldview || null, // 非参考角色书的世界观
    title,
    summary,
    genre,
    rating: rating || '9.2',
    review: {
      reviewerName,
      reviewText,
      reviewerAvatar,
      likes: reviewLikes ? parseInt(reviewLikes, 10) || 0 : Math.floor(Math.random() * 2000) + 100,
    },
    tags: parseGenreTags(genre),
    chapters: [], // 元数据阶段没有章节
    wordCount: 0,
  }
}

/**
 * 根据类型生成标签
 */
function parseGenreTags(genre) {
  const tagMap = {
    '言情': ['热门', '甜宠', '追妻火葬场', '虐恋'],
    '玄幻': ['热血', '升级流', '爽文', '奇幻'],
    '都市': ['都市', '现代', '职场', '现实'],
    '悬疑': ['悬疑', '推理', '烧脑', '惊悚'],
    '科幻': ['科幻', '未来', '赛博朋克', '太空歌剧'],
    '奇幻': ['奇幻', '魔法', '冒险', '史诗'],
    '历史': ['历史', '穿越', '权谋', '古风'],
    '武侠': ['武侠', '江湖', '侠义', '古典'],
  }
  const base = tagMap[genre] || ['热门', '连载']
  // 随机选 3-4 个
  const shuffled = [...base].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, 3 + Math.floor(Math.random() * 2))
}

/**
 * 以角色身份生成小说章节
 * 角色作为独立作家，不受自身世界书背景限制
 * @param {Object} params
 * @param {Object} params.character - 角色信息（name, identity, notes, background, appearance等）
 * @param {Object} params.book - 生成的书籍元数据（title, summary, genre等）
 * @param {number} params.chapterIndex - 当前章节索引（从0开始）
 * @param {Array} params.existingChapters - 已有章节（用于上下文连贯，按全局 contextChapters 截取）
 * @param {number} params.wordCount - 目标字数
 * @param {string} params.memories - 剧情记忆摘要（可选）
 * @returns {Promise<{success, title, content, suggestions, wordCount}>}
 */
export async function generateBookChapterFromCharacter(params = {}) {
  const validated = await getValidatedActiveConfig()
  if (!validated.success) {
    return { success: false, error: validated.error }
  }

  const { character, book, worldBook, mainCharacters, chapterIndex = 0, existingChapters = [], wordCount = 1200, memories } = params

  // 构建角色（作者）信息
  const authorParts = [
    character?.name ? `姓名: ${character.name}` : '',
    character?.nickname ? `昵称: ${character.nickname}` : '',
    character?.identity ? `身份: ${character.identity}` : '',
    character?.notes ? `性格特点: ${character.notes}` : '',
    character?.background ? `个人经历: ${character.background}` : '',
    character?.appearance ? `外貌: ${character.appearance}` : '',
  ].filter(Boolean)

  const authorInfo = authorParts.join(' | ') || '未知角色'

  // 构建世界观上下文（参考角色书）或主要角色设定（非参考角色书）
  const worldSummary = buildWorldSummary(worldBook)
  const charSummary = buildCharacterSummary(worldBook?.characters)

  // 构建用户/玩家角色信息
  const userProfile = worldBook?.userProfile
  const userInfoParts = []
  if (userProfile?.name) userInfoParts.push(`姓名: ${userProfile.name}`)
  if (userProfile?.identity) userInfoParts.push(`身份: ${userProfile.identity}`)
  if (userProfile?.appearance) userInfoParts.push(`外貌: ${userProfile.appearance}`)
  if (userProfile?.notes) userInfoParts.push(`性格: ${userProfile.notes}`)
  if (userProfile?.background) userInfoParts.push(`背景: ${userProfile.background}`)
  const userInfo = userInfoParts.length > 0 ? userInfoParts.join(' | ') : ''

  // 构建已有章节的简要上下文
  const contextText = existingChapters.length > 0
    ? existingChapters.map(ch =>
      `【第${ch.chapterIndex + 1}章 ${ch.title}】\n${(ch.content || '').slice(0, 500)}`
    ).join('\n\n')
    : ''

  const chapterNum = chapterIndex + 1
  const isNewChapter = chapterIndex === 0

  // 判断是否有世界书（参考角色书）还是只有主要角色设定（非参考角色书）
  const hasWorldBook = !!worldSummary

  const userPrompt = `你现在是一个专业的网络小说作家，正在以你的身份和性格创作一本小说。

【你的作者信息】
${authorInfo}

【你的书籍信息】
书名: ${book?.title || '未命名'}
类型: ${book?.genre || '都市'}
${book?.tags && book.tags.length > 0 ? '标签: ' + book.tags.join('、') + '\n' : ''}简介: ${book?.summary || '暂无'}

${hasWorldBook ? `【故事世界观】\n这是一个基于以下世界观的全新故事：\n${worldSummary}\n\n` : ''}
${charSummary ? `【世界角色】\n${charSummary}\n\n` : ''}
${book?.worldview ? `【本书世界观】\n以下是本书专属的世界观设定，请严格遵循：\n${book.worldview}\n\n` : ''}
${!hasWorldBook && mainCharacters ? `【主要角色设定】\n以下是本书主要角色的设定，请以此为基础创作：\n${mainCharacters}\n\n` : ''}
${userInfo ? `【你的身份（读者/互动者）】\n${userInfo}\n\n` : ''}
${memories ? `【剧情记忆】\n${memories}\n\n` : ''}
${contextText ? `【已有章节内容参考】\n${contextText}\n\n` : ''}
【写作要求】
- 你是以作者的身份来写这本小说，你的写作风格受到你的个人经历和性格的影响
${hasWorldBook
    ? '- **这是一个基于上述世界观的全新故事**，角色们的性格保持不变，但故事发生在该世界观设定的背景下\n- 请遵循世界观中的规则、设定和氛围来创作'
    : book?.worldview
      ? '- 请严格遵循【本书世界观】中的设定来构建剧情和角色互动，保持世界观的一致性'
      : '- 请根据【主要角色设定】中的角色信息来构建剧情，保持角色性格的一致性'
}
${book?.tags && book.tags.length > 0 ? `- 保持「${book.tags.join('、')}」的类型风格和写作氛围\n` : ''}- 保持你书中已设定的风格和人物关系（如果有已有章节的话）
${memories ? '- 请考虑剧情记忆摘要，保持与之前事件的一致性\n' : ''}
${isNewChapter
    ? `请写这本书的**第${chapterNum}章**（第一章）。`
    : `这是这本书的**第${chapterNum}章**，请承接已有章节的剧情，继续写下去。`
}

请开始写作。注意：
- 使用小说叙事体，不是对话剧本格式
- 保持与书籍简介、世界观/主要角色设定一致的剧情方向
- 字数约 ${wordCount} 字
- 保持角色性格的一致性
- 每章有起承转合，结尾留有悬念或自然过渡`

  const systemPrompt = '你是一个专业的网络小说作家，擅长根据角色设定和人物性格创作引人入胜的小说。你正在写一本自己构思的小说，请以作者的身份认真写好每一章。'

  const { prompt: cardPrompt, cardMeta } = await buildCardInstructions()
  const chapterPrompt = (await resolvePrompt('reader:chapter')) + cardPrompt

  const result = await callChatCompletion({
    config: validated.config,
    systemPrompt: chapterPrompt,
    userPrompt,
    temperature: 0.85,
    maxTokens: 6000,
    timeout: 180000,
    label: `Character Author Ch${chapterNum}`,
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  const parsed = parseChapterOutput(result.data)
  if (!parsed) {
    return { success: false, error: '章节内容解析失败', rawData: result.data }
  }

  const comments = parseChapterComments(result.data)

  // 提取并渲染卡片
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
    title: parsed.title,
    content: finalContent,
    cardHtml: renderedCardHtml,
    suggestions: parsed.suggestions,
    wordCount: finalContent.length,
    comments,
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

  const { worldBook, recentChapters = [], userDirection, wordCount = 1200, narrator, memories, genre, tags } = params

  const worldSummary = buildWorldSummary(worldBook)
  const charSummary = buildCharacterSummary(worldBook?.characters)
  const narratorSummary = buildNarratorSummary(narrator)
  const genreLine = genre
    ? `【故事类型】${genre}${tags && tags.length > 0 ? ' | 标签：' + tags.join('、') : ''}`
    : ''

  // 使用传入的完整章节内容，不再截断
  const recentText = recentChapters
    .map((ch) => `【${ch.title}】\n${ch.content}`)
    .join('\n\n')

  const userPrompt = [
    `【叙事者风格】\n${narratorSummary}`,
    `【世界观】\n${worldSummary}`,
    charSummary ? `【角色信息】\n${charSummary}` : '',
    genreLine ? `【风格定位】\n${genreLine}` : '',
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

  const comments = parseChapterComments(result.data)

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
    comments,
  }
}

/**
 * 解析 LLM 输出的段评/章评（XML 格式）
 * 格式:
 *   <comments type="chapter">...</comments>  — 章评
 *   <comments para="0">...</comments>        — 段评（para 为段落索引）
 *   <comment author="..." avatar="..." likes="...">内容</comment>
 */
export function parseChapterComments(rawContent) {
  const raw = String(rawContent || '').trim()
  if (!raw) return { chapterComments: [], paragraphComments: {} }

  const comments = { chapterComments: [], paragraphComments: {} }
  // 匹配 <comments type="chapter"> 或 <comments para="N"> 区块
  const re = /<comments\s+(?:type="chapter"|para="(\d+)")\s*>([\s\S]*?)<\/comments>/g
  let match

  while ((match = re.exec(raw)) !== null) {
    const paraIdx = match[1] // undefined = chapter, otherwise = para number
    const block = match[2].trim()
    if (!block) continue

    // 提取每条评论
    const commentRe = /<comment\s+author="([^"]*)"\s+avatar="([^"]*)"(?:\s+likes="(\d+)")?\s*>([\s\S]*?)<\/comment>/g
    let cMatch

    while ((cMatch = commentRe.exec(block)) !== null) {
      const comment = {
        id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        author: cMatch[1].trim() || '书友',
        avatar: cMatch[2].trim() || '🗣',
        content: cMatch[4].trim(),
        likes: parseInt(cMatch[3], 10) || 0,
        replies: [],
        createdAt: new Date().toISOString(),
      }

      if (paraIdx === undefined) {
        comments.chapterComments.push(comment)
      } else {
        const key = String(paraIdx)
        if (!comments.paragraphComments[key]) comments.paragraphComments[key] = []
        comments.paragraphComments[key].push(comment)
      }
    }
  }

  return comments
}

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
