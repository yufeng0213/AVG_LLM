import { resolveStorageScopeKey, resolveFurnitureLibraryKey, resolvePublicRoomKey, resolvePublicRoomRegistryKey } from './storageScope.js'
import {
  saveRoomState,
  loadRoomState,
  saveFurnitureLibrary,
  loadFurnitureLibrary,
  savePawnSprites,
  loadAllPawnSprites,
  isRoomSimSQLiteAvailable,
  saveWorldBookFurnitureLibrary,
  loadWorldBookFurnitureLibrary,
} from './roomSimRepo.js'

/**
 * 从 storage key 解析 worldBookId 和 characterId
 * key 格式: room-sim-${worldBookId}-${characterId}
 */
export const parseStorageKey = (key) => {
  const parts = key.split('-')
  if (parts.length >= 4 && parts[0] === 'room' && parts[1] === 'sim') {
    // worldBookId 可能包含 '-'，所以从 index 2 到倒数第二个
    // characterId 是最后一个部分
    const characterId = parts[parts.length - 1]
    const worldBookId = parts.slice(2, -1).join('-')
    return { worldBookId, characterId }
  }
  return { worldBookId: 'default_world_book', characterId: '__player__' }
}

const fallbackClampInt = (value, min, max, fallback = min) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

export const buildPersistPayload = (options = {}) => {
  const { state = null, normalizeState = null, now = Date.now() } = options || {}
  const normalized = typeof normalizeState === 'function' ? normalizeState(state) : state
  if (!normalized || typeof normalized !== 'object') return null
  return {
    ...normalized,
    updatedAt: Number.isFinite(now) ? now : Date.now(),
  }
}

/**
 * 持久化房间状态（SQLite 优先，kvStorage 回退）
 * 注意：保存时不调用 normalizeState，避免家具被过滤
 */
export const persistStateSnapshot = async (options = {}) => {
  const {
    storage = null,
    key = '',
    state = null,
    normalizeState = null, // 保存时不使用，仅用于加载
    now = Date.now(),
  } = options || {}

  const resolvedKey = typeof key === 'string' && key.length > 0
    ? key
    : resolveStorageScopeKey(options)

  // 直接保存原始状态，不调用 normalizeState
  // normalizeState 用于加载时规范化，保存时应保持原始数据
  if (!state || typeof state !== 'object') {
    return { ok: false, error: 'invalid_state', payload: null }
  }

  const payload = {
    ...state,
    updatedAt: Number.isFinite(now) ? now : Date.now(),
  }

  // 解析 key 获取 worldBookId 和 characterId
  const { worldBookId, characterId } = parseStorageKey(resolvedKey)

  // SQLite 优先
  if (isRoomSimSQLiteAvailable()) {
    try {
      // 保存房间状态
      await saveRoomState(worldBookId, characterId, payload)

      // 保存家具库到世界书级别（所有角色共享）
      if (payload.customFurnitureLibrary && payload.customFurnitureLibrary.length > 0) {
        await saveWorldBookFurnitureLibrary(worldBookId, payload.customFurnitureLibrary)
      }

      // 保存小人精灵（如果有）
      if (payload.pawns && payload.pawns.length > 0) {
        for (const pawn of payload.pawns) {
          if (pawn.customSprites) {
            await savePawnSprites(worldBookId, characterId, pawn.id, pawn.customSprites)
          }
        }
      }

      console.log('[roomSimPersistence] Saved to SQLite:', resolvedKey)
      return { ok: true, error: null, payload, storageType: 'sqlite' }
    } catch (e) {
      console.error('[roomSimPersistence] SQLite save error:', e)
      // 继续尝试 kvStorage 回退
    }
  }

  // kvStorage 回退
  if (!storage || typeof storage.set !== 'function') {
    return { ok: false, error: 'invalid_storage', payload: null }
  }

  try {
    // 保存房间状态
    await storage.set(resolvedKey, payload)

    // 保存家具库到世界书级别（单独 key）
    if (payload.customFurnitureLibrary && payload.customFurnitureLibrary.length > 0) {
      const furnitureKey = resolveFurnitureLibraryKey(worldBookId)
      await storage.set(furnitureKey, payload.customFurnitureLibrary)
    }

    console.log('[roomSimPersistence] Saved to kvStorage:', resolvedKey)
    return { ok: true, error: null, payload, storageType: 'kvstorage' }
  } catch (e) {
    return { ok: false, error: String(e?.message || e), payload: null }
  }
}

/**
 * 恢复房间状态（SQLite 优先，kvStorage 回退）
 */
export const restoreStateSnapshot = async (options = {}) => {
  const {
    storage = null,
    key = '',
    normalizeState = null,
    buildDefaultState = null,
  } = options || {}

  const resolvedKey = typeof key === 'string' && key.length > 0
    ? key
    : resolveStorageScopeKey(options)

  // 解析 key 获取 worldBookId 和 characterId
  const { worldBookId, characterId } = parseStorageKey(resolvedKey)

  // SQLite 优先
  if (isRoomSimSQLiteAvailable()) {
    try {
      const stateData = await loadRoomState(worldBookId, characterId)
      // 加载世界书级别家具库（所有角色共享）
      let furnitureLibrary = await loadWorldBookFurnitureLibrary(worldBookId)

      // 兼容迁移：如果世界书级别为空，但角色状态中有家具库，迁移到世界书级别
      if (furnitureLibrary.length === 0 && stateData?.customFurnitureLibrary?.length > 0) {
        console.log('[roomSimPersistence] Migrating furniture library from character to world book level')
        await saveWorldBookFurnitureLibrary(worldBookId, stateData.customFurnitureLibrary)
        furnitureLibrary = stateData.customFurnitureLibrary
        // 清除角色级别的家具库（可选）
        delete stateData.customFurnitureLibrary
      }

      if (stateData) {
        // 设置家具库
        if (furnitureLibrary.length > 0) {
          stateData.customFurnitureLibrary = furnitureLibrary
        }

        // 加载小人精灵
        const pawnSprites = await loadAllPawnSprites(worldBookId, characterId)
        if (stateData.pawns && stateData.pawns.length > 0) {
          for (const pawn of stateData.pawns) {
            if (pawnSprites[pawn.id]) {
              pawn.customSprites = pawnSprites[pawn.id]
            }
          }
        }

        const normalized = typeof normalizeState === 'function' ? normalizeState(stateData) : stateData
        console.log('[roomSimPersistence] Loaded from SQLite:', resolvedKey, 'furniture library:', furnitureLibrary.length)
        return { state: normalized, error: null, fromStorage: true, isNew: false }
      }

      // SQLite 无房间数据，但可能有世界书家具库
      const fallback = typeof buildDefaultState === 'function' ? buildDefaultState() : null
      if (fallback && furnitureLibrary.length > 0) {
        fallback.customFurnitureLibrary = furnitureLibrary
      }
      console.log('[roomSimPersistence] No SQLite room data, using default state with world book furniture library:', furnitureLibrary.length)
      return { state: fallback, error: null, fromStorage: false, isNew: true }
    } catch (e) {
      console.error('[roomSimPersistence] SQLite load error:', e)
      // 继续尝试 kvStorage 回退
    }
  }

  // kvStorage 回退
  if (!storage || typeof storage.get !== 'function') {
    const fallback = typeof buildDefaultState === 'function' ? buildDefaultState() : null
    return { state: fallback, error: 'invalid_storage', fromStorage: false, isNew: true }
  }

  try {
    const raw = await storage.get(resolvedKey)
    // 加载世界书级别家具库
    const furnitureKey = resolveFurnitureLibraryKey(worldBookId)
    let furnitureLibrary = await storage.get(furnitureKey)

    // 兼容迁移：如果世界书级别为空，但角色状态中有家具库，迁移到世界书级别
    if (!Array.isArray(furnitureLibrary) || furnitureLibrary.length === 0) {
      if (raw?.customFurnitureLibrary?.length > 0) {
        console.log('[roomSimPersistence] Migrating furniture library from character to world book level (kvStorage)')
        await storage.set(furnitureKey, raw.customFurnitureLibrary)
        furnitureLibrary = raw.customFurnitureLibrary
        delete raw.customFurnitureLibrary
      }
    }

    if (!raw || typeof raw !== 'object') {
      const fallback = typeof buildDefaultState === 'function' ? buildDefaultState() : null
      if (fallback && Array.isArray(furnitureLibrary) && furnitureLibrary.length > 0) {
        fallback.customFurnitureLibrary = furnitureLibrary
      }
      return { state: fallback, error: null, fromStorage: false, isNew: true }
    }

    // 合并家具库到状态
    if (Array.isArray(furnitureLibrary) && furnitureLibrary.length > 0) {
      raw.customFurnitureLibrary = furnitureLibrary
    }

    const normalized = typeof normalizeState === 'function' ? normalizeState(raw) : raw
    console.log('[roomSimPersistence] Loaded from kvStorage:', resolvedKey, 'furniture library:', furnitureLibrary?.length || 0)
    return { state: normalized, error: null, fromStorage: true, isNew: false }
  } catch (e) {
    const fallback = typeof buildDefaultState === 'function' ? buildDefaultState() : null
    return { state: fallback, error: String(e?.message || e), fromStorage: false, isNew: true }
  }
}

// ========== 公共区域房间持久化 ==========

export const loadPublicRoomRegistry = async (storage, worldBookId) => {
  const key = resolvePublicRoomRegistryKey(worldBookId)
  try {
    const raw = await storage.get(key)
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

export const savePublicRoomRegistry = async (storage, worldBookId, registry) => {
  const key = resolvePublicRoomRegistryKey(worldBookId)
  await storage.set(key, registry)
}

export const loadPublicRoomState = async (storage, worldBookId, roomId) => {
  const key = resolvePublicRoomKey(worldBookId, roomId)
  try {
    const raw = await storage.get(key)
    return raw && typeof raw === 'object' ? raw : null
  } catch {
    return null
  }
}

export const savePublicRoomState = async (storage, worldBookId, roomId, stateData) => {
  const key = resolvePublicRoomKey(worldBookId, roomId)
  await storage.set(key, { ...stateData, updatedAt: Date.now() })
}

export const deletePublicRoom = async (storage, worldBookId, roomId) => {
  const key = resolvePublicRoomKey(worldBookId, roomId)
  try { await storage.remove(key) } catch {}
  const registry = await loadPublicRoomRegistry(storage, worldBookId)
  const filtered = registry.filter(r => r.id !== roomId)
  await savePublicRoomRegistry(storage, worldBookId, filtered)
}