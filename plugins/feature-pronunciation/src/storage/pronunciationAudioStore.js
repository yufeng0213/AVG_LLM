/**
 * pronunciationAudioStore.js - IndexedDB 存储口语发音音频 Blob。
 * 参照 fontStorage.js 模式。
 */

const DB_NAME = 'avg_llm_pronunciation_audio'
const STORE_NAME = 'audio_blobs'
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
 * 存储音频 Blob 到 IndexedDB。
 * @param {string} key - 音频键
 * @param {ArrayBuffer|Blob|Uint8Array} arrayBuffer - 音频数据
 */
export async function storeAudioBlob(key, arrayBuffer) {
  const store = await getStore('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.put(arrayBuffer, key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/**
 * 从 IndexedDB 获取音频 Blob。
 * @param {string} key - 音频键
 * @returns {Promise<ArrayBuffer|Blob|null>}
 */
export async function getAudioBlob(key) {
  const store = await getStore('readonly')
  return new Promise((resolve, reject) => {
    const req = store.get(key)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

/**
 * 从 IndexedDB 删除音频 Blob。
 * @param {string} key - 音频键
 */
export async function deleteAudioBlob(key) {
  const store = await getStore('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/**
 * 列出匹配前缀的音频键。
 * @param {string} prefix - 键前缀
 * @returns {Promise<string[]>}
 */
export async function listAudioBlobs(prefix) {
  const store = await getStore('readonly')
  return new Promise((resolve, reject) => {
    const req = store.getAllKeys()
    req.onsuccess = () => {
      const keys = req.result || []
      resolve(keys.filter((k) => typeof k === 'string' && k.startsWith(prefix)))
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * 清理超过最大年龄的音频。
 * @param {number} maxAgeMs - 最大年龄（毫秒）
 */
export async function clearOldAudioBlobs(maxAgeMs) {
  const store = await getStore('readwrite')
  return new Promise((resolve, reject) => {
    const req = store.getAllKeys()
    req.onsuccess = () => {
      const keys = req.result || []
      const cutoff = Date.now() - maxAgeMs
      let deleted = 0
      let pending = 0
      const done = () => {
        if (--pending <= 0) resolve(deleted)
      }
      for (const key of keys) {
        // 解析 timestamp 部分: pron_user_itemId_timestamp
        const parts = key.split('_')
        const tsStr = parts[parts.length - 1]
        const ts = parseInt(tsStr, 10)
        if (!isNaN(ts) && ts < cutoff) {
          pending++
          const delReq = store.delete(key)
          delReq.onsuccess = () => { deleted++; done() }
          delReq.onerror = () => done()
        }
      }
      if (pending === 0) resolve(0)
    }
    req.onerror = () => reject(req.error)
  })
}
