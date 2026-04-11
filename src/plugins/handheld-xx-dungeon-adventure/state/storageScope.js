export const sanitizeScopeToken = (value, fallback = '') => {
  const token = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 96)
  return token || String(fallback || '')
}

export const resolveStorageScopeKey = (options = {}) => {
  const {
    storageKeyBase = 'handheld-xx-dungeon-adventure-state',
    worldBookId = 'default_world_book',
    saveSlotId = 'global',
  } = options || {}

  const safeWorldBookId = sanitizeScopeToken(worldBookId, 'default_world_book')
  const safeSaveSlotId = sanitizeScopeToken(saveSlotId, 'global')
  return `${storageKeyBase}:${safeWorldBookId}:${safeSaveSlotId}`
}
