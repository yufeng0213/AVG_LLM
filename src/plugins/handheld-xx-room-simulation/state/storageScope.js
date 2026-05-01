import { STORAGE_KEY_BASE } from '../config/constants.js'

const sanitizeScopeToken = (value, fallback = '') => {
  const token = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 96)
  return token || String(fallback || '')
}

export const resolveStorageScopeKey = (options = {}) => {
  const {
    storageKeyBase = STORAGE_KEY_BASE,
    worldBookId = 'default_world_book',
    saveSlotId = 'global',
  } = options || {}

  const safeWorldBookId = sanitizeScopeToken(worldBookId, 'default_world_book')
  const safeSaveSlotId = sanitizeScopeToken(saveSlotId, 'global')
  return `${storageKeyBase}:${safeWorldBookId}:${safeSaveSlotId}`
}

// 世界书级别家具库的存储 key
export const resolveFurnitureLibraryKey = (worldBookId) => {
  const safeWorldBookId = sanitizeScopeToken(worldBookId, 'default_world_book')
  return `${STORAGE_KEY_BASE}:${safeWorldBookId}:__furniture_library__`
}