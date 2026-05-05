/**
 * useReaderData.js - 书城数据层
 * SQLite 优先，Web 端回退到 kvStorage。
 */
import { isSQLiteAvailable as _isSQLiteAvailable, query } from '../../../../src/db/connection.js'

// 重新导出给组件用
export const isSQLiteAvailable = _isSQLiteAvailable
export {
  _deleteChapter as deleteChapter,
  _rewriteChapters as rewriteChapters,
  _insertStory as insertStory,
  _insertChapter as insertChapter,
}
import {
  loadStories as _loadStories,
  insertStory as _insertStory,
  updateStory as _updateStoryDb,
  deleteStory as _deleteStory,
  loadChapters,
  loadChapter as _loadChapter,
  loadChapterCount,
  insertChapter as _insertChapter,
  deleteChapter as _deleteChapter,
  rewriteChapters as _rewriteChapters,
  saveSettings as _saveSettings,
  loadSettings as _loadSettings,
  saveStoryMemories as _saveStoryMemories,
  loadStoryMemories as _loadStoryMemories,
} from '../../../../src/db/repos/reader.repo.js'
import { kvStorage } from '../../../../src/storage/index.js'

const STORIES_KEY = 'reader_stories'
const SETTINGS_KEY = 'reader_settings'

const DEFAULT_SETTINGS = {
  fontSize: 16,
  lineHeight: 1.8,
  theme: 'dark',
  contextChapters: 1,
  memoryThreshold: 0,
  mainCharacters: '', // 主要角色设定（非参考角色新书生成时使用）
  preferredGenres: '', // 偏好类型（新书发现时优先使用这些类型）
}

// ===== 故事管理 =====

export async function loadStories() {
  if (!isSQLiteAvailable()) {
    return await kvStorage.get(STORIES_KEY) || []
  }
  const stories = await _loadStories()
  // 加载每个故事的章节数量（不加载内容）
  for (const story of stories) {
    const count = await loadChapterCount(story.id)
    story.chapters = new Array(count) // 占位，用 length 表示数量
    story.lastReadChapter = story.lastReadChapter ?? 0
    story.settings = story.settings || { fontSize: 16, lineHeight: 1.8, theme: 'dark' }
  }
  return stories
}

export async function saveStories(stories) {
  if (!isSQLiteAvailable()) {
    await kvStorage.set(STORIES_KEY, stories)
    return
  }
  // SQLite 模式下：这个函数通常用于保存新建故事后的完整数据
  for (const story of stories) {
    if (story.chapters && story.chapters.length > 0) {
      // 检查是否已存在（通过 chapter count 判断）
      const count = await loadChapterCount(story.id)
      if (count === 0) {
        // 新故事，插入故事和所有章节
        await _insertStory(story)
        for (const ch of story.chapters) {
          await _insertChapter(story.id, ch)
        }
      }
    }
  }
}

/**
 * 保存单个故事元数据（不含章节，用于加入书架但无章节的情况）
 */
export async function saveStoryMeta(story) {
  if (!isSQLiteAvailable()) {
    const stories = await kvStorage.get(STORIES_KEY) || []
    const idx = stories.findIndex(s => s.id === story.id)
    if (idx >= 0) {
      stories[idx] = { ...stories[idx], ...story }
    } else {
      stories.unshift(story)
    }
    await kvStorage.set(STORIES_KEY, stories)
    return
  }
  // 检查是否已存在
  const rows = await query('SELECT id FROM reader_stories WHERE id = ?', [story.id])
  if (rows.length === 0) {
    await _insertStory(story)
  } else {
    const { exec } = await import('../../../../src/db/connection.js')
    await exec(
      `UPDATE reader_stories SET title = ?, author = ?, genre = ?, summary = ?, worldview = ?, world_book_id = ?, source_type = ?, updated_at = ? WHERE id = ?`,
      [story.title || '', story.author || '', story.genre || '', story.summary || '', story.worldview || '', story.worldBookId || '', story.sourceType || 'llm', story.updatedAt || new Date().toISOString(), story.id]
    )
  }
}

export function addStory(stories, story) {
  const newStory = {
    id: `story_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    chapters: [],
    lastReadChapter: 0,
    settings: {
      fontSize: 16,
      lineHeight: 1.8,
      theme: 'dark',
    },
    sourceType: 'llm',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...story,
  }
  return [newStory, ...stories]
}

export function updateStory(stories, storyId, updates) {
  return stories.map(s =>
    s.id === storyId ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
  )
}

export async function deleteStory(stories, storyId) {
  if (isSQLiteAvailable()) {
    await _deleteStory(storyId)
  }
  return stories.filter(s => s.id !== storyId)
}

export function getStoryById(stories, storyId) {
  return stories.find(s => s.id === storyId) || null
}

// ===== 章节管理 =====

export function addChapter(story, chapter) {
  const newChapter = {
    id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    ...chapter,
  }
  story.chapters.push(newChapter)
  story.updatedAt = new Date().toISOString()
  return newChapter
}

export async function loadStoryChapters(storyId) {
  if (isSQLiteAvailable()) {
    return await loadChapters(storyId)
  }
  // Web fallback: load from kvStorage
  const stories = await kvStorage.get(STORIES_KEY) || []
  const story = stories.find(s => s.id === storyId)
  return story?.chapters || []
}

export async function loadStoryChapter(storyId, index) {
  if (isSQLiteAvailable()) {
    return await _loadChapter(storyId, index)
  }
  const stories = await kvStorage.get(STORIES_KEY) || []
  const story = stories.find(s => s.id === storyId)
  return story?.chapters?.[index] || null
}

export function getChapter(story, index) {
  return story.chapters?.[index] || null
}

export function getChapterWordCount(story, index) {
  const chapter = getChapter(story, index)
  if (!chapter) return 0
  return chapter.wordCount || chapter.content?.length || 0
}

// ===== 设置 =====

export async function loadSettings() {
  const raw = isSQLiteAvailable()
    ? await _loadSettings()
    : await kvStorage.get(SETTINGS_KEY) || {}
  return { ...DEFAULT_SETTINGS, ...raw }
}

export async function saveSettings(settings) {
  await _saveSettings(settings)
}

// ===== 故事级剧情记忆 =====

export async function loadStoryMemories(storyId) {
  return await _loadStoryMemories(storyId)
}

export async function saveStoryMemories(storyId, memories) {
  await _saveStoryMemories(storyId, memories)
}

// ===== 时间格式化 =====

export function formatReaderTime(isoStr) {
  if (!isoStr) return ''
  const date = new Date(isoStr)
  const now = new Date()
  const diff = now - date
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 24 * 60 * 60 * 1000) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  }
  if (diff < 2 * 24 * 60 * 60 * 1000) return '昨天'
  return `${date.getMonth() + 1}/${date.getDate()}`
}
