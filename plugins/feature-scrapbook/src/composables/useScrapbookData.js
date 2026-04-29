/**
 * useScrapbookData.js - 手帐数据管理（CRUD）
 */
import { kvStorage } from '../../../../src/storage/index.js'

const STORAGE_KEY = 'scrapbook_collection'

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

export async function loadBooks() {
  const data = await kvStorage.get(STORAGE_KEY)
  if (!data) return []
  return data.books || []
}

export async function saveBook(book) {
  const books = await loadBooks()
  const idx = books.findIndex(b => b.id === book.id)
  book.updatedAt = Date.now()
  if (idx >= 0) {
    books[idx] = book
  } else {
    book.id = book.id || generateId()
    book.createdAt = book.createdAt || Date.now()
    books.unshift(book)
  }
  await kvStorage.set(STORAGE_KEY, { books })
  return book
}

export async function deleteBook(bookId) {
  const books = await loadBooks()
  const filtered = books.filter(b => b.id !== bookId)
  await kvStorage.set(STORAGE_KEY, { books: filtered })
}

export async function loadBook(bookId) {
  const books = await loadBooks()
  return books.find(b => b.id === bookId) || null
}
