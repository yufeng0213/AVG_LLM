/**
 * useGeneratedBooks.js - 书城生成书籍元数据管理
 * 存储 LLM 生成的书籍元数据（书名、简介、书评等），不含章节内容。
 * 每本书独立，不覆盖、不去重。
 */
import { kvStorage } from '../../../../src/storage/index.js'

const GENERATED_BOOKS_KEY = 'reader_generated_books'

/**
 * 加载所有已生成的书籍元数据
 */
export async function loadGeneratedBooks() {
  try {
    const data = await kvStorage.get(GENERATED_BOOKS_KEY)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/**
 * 追加保存新书（不去重，每本独立）
 */
export async function appendGeneratedBooks(newBooks) {
  const existing = await loadGeneratedBooks()
  const merged = [...existing, ...newBooks]
  await kvStorage.set(GENERATED_BOOKS_KEY, merged)
  return merged
}

/**
 * 覆盖保存（用于清空后重新生成）
 */
export async function overwriteGeneratedBooks(books) {
  await kvStorage.set(GENERATED_BOOKS_KEY, books)
  return books
}

/**
 * 将生成的书籍转换为真实故事（加入书架时调用）
 * 返回一个可直接插入 stories 的故事对象
 */
export function convertGeneratedBookToStory(generatedBook) {
  return {
    id: generatedBook._fromGenerated
      ? `story_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      : generatedBook.id, // 发现的书用原 id，避免重复转换
    title: generatedBook.title,
    summary: generatedBook.summary,
    brief: generatedBook.summary,
    author: generatedBook.author || generatedBook.characterId || '匿名作者',
    worldBookId: generatedBook.worldBookId || null,
    worldview: generatedBook.worldview || null, // 非参考角色书的世界观
    chapters: [],
    lastReadChapter: 0,
    settings: {
      fontSize: 16,
      lineHeight: 1.8,
      theme: 'dark',
    },
    genre: generatedBook.genre,
    tags: generatedBook.tags,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _fromGenerated: generatedBook.id || generatedBook._fromGenerated,
  }
}

/**
 * 清除所有已生成的书籍元数据
 */
export async function clearGeneratedBooks() {
  await kvStorage.set(GENERATED_BOOKS_KEY, [])
}

/**
 * 新书发现记录
 */
const DISCOVERY_KEY = 'reader_discoveries'

export async function loadDiscoveries() {
  try {
    const data = await kvStorage.get(DISCOVERY_KEY)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export async function saveDiscoveries(discoveries) {
  await kvStorage.set(DISCOVERY_KEY, discoveries)
}

export async function appendDiscoveries(newItems) {
  const existing = await loadDiscoveries()
  const merged = [...existing, ...newItems]
  await kvStorage.set(DISCOVERY_KEY, merged)
  return merged
}
