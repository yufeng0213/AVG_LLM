import { kvStorage } from '../storage/index.js'

const IMPORTED_FONTS_KEY = 'avg_llm_imported_fonts'
const FONT_ASSIGNMENTS_KEY = 'avg_llm_font_assignments'

// ========== IndexedDB 管理（存字体二进制） ==========

const DB_NAME = 'avg_llm_fonts'
const STORE_NAME = 'font_binaries'
const DB_VERSION = 1

let _dbPromise = null

function openDB() {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return _dbPromise
}

async function getStore(mode = 'readonly') {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, mode)
  return tx.objectStore(STORE_NAME)
}

/**
 * 存储字体二进制到 IndexedDB。
 * @param {string} id - 字体 ID
 * @param {ArrayBuffer} arrayBuffer - 字体二进制数据
 */
export async function storeFontBinary(id, arrayBuffer) {
  const store = await getStore('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.put(arrayBuffer, id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/**
 * 从 IndexedDB 获取字体二进制。
 * @param {string} id - 字体 ID
 * @returns {Promise<ArrayBuffer|null>}
 */
export async function getFontBinary(id) {
  const store = await getStore('readonly')
  return new Promise((resolve, reject) => {
    const req = store.get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

/**
 * 从 IndexedDB 删除字体二进制。
 * @param {string} id - 字体 ID
 */
export async function deleteFontBinary(id) {
  const store = await getStore('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// ========== kvStorage 管理（存元数据和分配） ==========

/**
 * 获取已导入字体元数据列表。
 * @returns {Promise<Array<{ id: string, familyName: string, fileName: string, fileType: string, fileSize: number, createdAt: number }>>}
 */
export async function getImportedFonts() {
  try {
    const raw = await kvStorage.get(IMPORTED_FONTS_KEY)
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

/**
 * 添加已导入字体的元数据。
 * @param {{ id: string, familyName: string, fileName: string, fileType: string, fileSize: number, createdAt: number }} metadata
 */
export async function addImportedFont(metadata) {
  const fonts = await getImportedFonts()
  fonts.push(metadata)
  await kvStorage.set(IMPORTED_FONTS_KEY, fonts)
}

/**
 * 删除已导入字体的元数据。
 * @param {string} id - 字体 ID
 */
export async function removeImportedFont(id) {
  const fonts = await getImportedFonts()
  const filtered = fonts.filter((f) => f.id !== id)
  await kvStorage.set(IMPORTED_FONTS_KEY, filtered)
}

/**
 * 获取字体分配映射。
 * @returns {Promise<{ fontHeading?: string, fontBody?: string, fontDisplay?: string }>}
 */
export async function getFontAssignments() {
  try {
    const raw = await kvStorage.get(FONT_ASSIGNMENTS_KEY)
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

/**
 * 设置字体分配映射。
 * @param {{ fontHeading?: string, fontBody?: string, fontDisplay?: string }} assignments
 */
export async function setFontAssignments(assignments) {
  await kvStorage.set(FONT_ASSIGNMENTS_KEY, assignments)
}
