/**
 * useReaderData.js - 书城数据层
 * 提供故事、章节、设置的 kvStorage 读写。
 */
import { kvStorage } from '../../../../src/storage/index.js'

const STORIES_KEY = 'reader_stories'
const SETTINGS_KEY = 'reader_settings'

// ===== 故事管理 =====

export async function loadStories() {
  return await kvStorage.get(STORIES_KEY) || []
}

export async function saveStories(stories) {
  await kvStorage.set(STORIES_KEY, stories)
}

export function addStory(stories, story) {
  return [
    {
      id: `story_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      chapters: [],
      lastReadChapter: 0,
      settings: {
        fontSize: 16,
        lineHeight: 1.8,
        theme: 'dark',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...story,
    },
    ...stories,
  ]
}

export function updateStory(stories, storyId, updates) {
  return stories.map(s =>
    s.id === storyId ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
  )
}

export function deleteStory(stories, storyId) {
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

export function getChapter(story, index) {
  return story.chapters[index] || null
}

export function getChapterWordCount(story, index) {
  const chapter = getChapter(story, index)
  if (!chapter) return 0
  return chapter.wordCount || chapter.content?.length || 0
}

// ===== 设置 =====

const DEFAULT_SETTINGS = {
  fontSize: 16,
  lineHeight: 1.8,
  theme: 'dark',
  contextChapters: 1, // 生成下一章时参考的前文章节数
}

export async function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(await kvStorage.get(SETTINGS_KEY) || {}) }
}

export async function saveSettings(settings) {
  await kvStorage.set(SETTINGS_KEY, settings)
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
