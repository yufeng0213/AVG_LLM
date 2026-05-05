/**
 * Reader 书城数据访问层
 * SQLite 优先，Web 端回退到 kvStorage
 */
import { isSQLiteAvailable, query, exec } from '../connection.js'
import { kvStorage } from '../../storage/index.js'

const STORIES_KEY = 'reader_stories'
const SETTINGS_KEY = 'reader_settings'

// ============================================================
// 辅助函数
// ============================================================

function safeJsonParse(str, fallback) {
  if (!str) return fallback
  try { return JSON.parse(str) } catch { return fallback }
}

// ============================================================
// 故事管理
// ============================================================

export async function loadStories() {
  if (!isSQLiteAvailable()) {
    return await kvStorage.get(STORIES_KEY) || []
  }
  const rows = await query('SELECT * FROM reader_stories ORDER BY created_at DESC')
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    author: r.author,
    genre: r.genre,
    summary: r.summary,
    worldview: r.worldview || null,
    worldBookId: r.world_book_id,
    sourceType: r.source_type || 'llm',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    chapters: [],
    lastReadChapter: 0,
    settings: { fontSize: 16, lineHeight: 1.8, theme: 'dark' },
  }))
}

export async function insertStory(story) {
  if (!isSQLiteAvailable()) return null
  const now = new Date().toISOString()
  await exec(
    `INSERT INTO reader_stories (id, title, author, genre, summary, worldview, world_book_id, source_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [story.id, story.title || '', story.author || '', story.genre || '',
     story.summary || '', story.worldview || '', story.worldBookId || '', story.sourceType || 'llm', now, now]
  )
}

export async function updateStory(storyId, updates) {
  if (!isSQLiteAvailable()) return
  const fields = []
  const values = []
  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
  if (updates.author !== undefined) { fields.push('author = ?'); values.push(updates.author) }
  if (updates.genre !== undefined) { fields.push('genre = ?'); values.push(updates.genre) }
  if (updates.summary !== undefined) { fields.push('summary = ?'); values.push(updates.summary) }
  if (updates.worldview !== undefined) { fields.push('worldview = ?'); values.push(updates.worldview) }
  fields.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(storyId)
  await exec(`UPDATE reader_stories SET ${fields.join(', ')} WHERE id = ?`, values)
}

export async function deleteStory(storyId) {
  if (!isSQLiteAvailable()) return
  await exec('DELETE FROM reader_stories WHERE id = ?', [storyId])
}

// ============================================================
// 章节管理
// ============================================================

export async function loadChapters(storyId) {
  if (!isSQLiteAvailable()) return []
  const rows = await query(
    'SELECT * FROM reader_chapters WHERE story_id = ? ORDER BY chapter_index',
    [storyId]
  )
  console.log('[DB] loadChapters', { storyId, count: rows.length, titles: rows.map(r => r.title) })
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    content: r.content,
    cardHtml: r.card_html || null,
    wordCount: r.word_count,
    lastReadPage: r.last_read_page,
    createdAt: r.created_at,
  }))
}

export async function loadChapter(storyId, index) {
  if (!isSQLiteAvailable()) return null
  const rows = await query(
    'SELECT * FROM reader_chapters WHERE story_id = ? AND chapter_index = ?',
    [storyId, index]
  )
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    cardHtml: r.card_html || null,
    wordCount: r.word_count,
    lastReadPage: r.last_read_page,
    createdAt: r.created_at,
  }
}

export async function loadChapterCount(storyId) {
  if (!isSQLiteAvailable()) return 0
  const rows = await query(
    'SELECT COUNT(*) as cnt FROM reader_chapters WHERE story_id = ?',
    [storyId]
  )
  return rows[0]?.cnt || 0
}

export async function insertChapter(storyId, chapter) {
  if (!isSQLiteAvailable()) return null
  const index = await loadChapterCount(storyId)
  const now = new Date().toISOString()
  const id = chapter.id || `ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const wordCount = chapter.wordCount || 0
  console.log('[DB] insertChapter', { storyId, chapterIndex: index, title: chapter.title, wordCount, contentLen: chapter.content?.length || 0 })
  await exec(
    `INSERT INTO reader_chapters (id, story_id, chapter_index, title, content, card_html, word_count, last_read_page, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, storyId, index, chapter.title || '', chapter.content || '',
     chapter.cardHtml || null, wordCount, 0, now]
  )
  return { ...chapter, id, chapterIndex: index }
}

export async function updateChapterPage(storyId, chapterIndex, page) {
  if (!isSQLiteAvailable()) return
  await exec(
    'UPDATE reader_chapters SET last_read_page = ? WHERE story_id = ? AND chapter_index = ?',
    [page, storyId, chapterIndex]
  )
}

export async function deleteChapter(storyId, chapterIndex) {
  if (!isSQLiteAvailable()) return
  await exec(
    'DELETE FROM reader_chapters WHERE story_id = ? AND chapter_index = ?',
    [storyId, chapterIndex]
  )
  // 重新编号后面的章节
  await exec(
    'UPDATE reader_chapters SET chapter_index = chapter_index - 1 WHERE story_id = ? AND chapter_index > ?',
    [storyId, chapterIndex]
  )
}

export async function rewriteChapters(storyId, chapters) {
  if (!isSQLiteAvailable()) return
  await exec('DELETE FROM reader_chapters WHERE story_id = ?', [storyId])
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]
    await exec(
      `INSERT INTO reader_chapters (id, story_id, chapter_index, title, content, card_html, word_count, last_read_page, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ch.id, storyId, i, ch.title || '', ch.content || '',
       ch.cardHtml || null, ch.wordCount || 0, ch.lastReadPage || 0, ch.createdAt]
    )
  }
}

// ============================================================
// 设置（全局）
// ============================================================

export async function loadSettings() {
  if (!isSQLiteAvailable()) {
    return await kvStorage.get(SETTINGS_KEY) || {}
  }
  const rows = await query('SELECT key, value FROM reader_settings')
  const result = {}
  for (const r of rows) {
    try { result[r.key] = JSON.parse(r.value) } catch { result[r.key] = r.value }
  }
  return result
}

export async function saveSettings(settings) {
  if (!isSQLiteAvailable()) {
    await kvStorage.set(SETTINGS_KEY, settings)
    return
  }
  for (const [key, value] of Object.entries(settings)) {
    await exec(
      'INSERT OR REPLACE INTO reader_settings (key, value) VALUES (?, ?)',
      [key, JSON.stringify(value)]
    )
  }
}

// ============================================================
// 故事级剧情记忆
// ============================================================

export async function loadStoryMemories(storyId) {
  if (!isSQLiteAvailable()) {
    return { memories: '', lastExtractedAt: '', chapterCount: 0 }
  }
  const rows = await query(
    'SELECT * FROM reader_story_memories WHERE story_id = ?',
    [storyId]
  )
  if (rows.length === 0) return { memories: '', lastExtractedAt: '', chapterCount: 0 }
  const r = rows[0]
  return {
    memories: r.memories || '',
    lastExtractedAt: r.last_extracted_at || '',
    chapterCount: r.chapter_count || 0,
  }
}

export async function saveStoryMemories(storyId, data) {
  if (!isSQLiteAvailable()) return
  await exec(
    `INSERT OR REPLACE INTO reader_story_memories (story_id, memories, last_extracted_at, chapter_count)
     VALUES (?, ?, ?, ?)`,
    [storyId, data.memories || '', data.lastExtractedAt || '', data.chapterCount || 0]
  )
}
