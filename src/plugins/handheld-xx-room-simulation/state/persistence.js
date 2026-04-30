import { resolveStorageScopeKey } from './storageScope.js'

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

export const persistStateSnapshot = async (options = {}) => {
  const {
    storage = null,
    key = '',
    state = null,
    normalizeState = null,
    now = Date.now(),
  } = options || {}

  if (!storage || typeof storage.set !== 'function') {
    return { ok: false, error: 'invalid_storage', payload: null }
  }

  const resolvedKey = typeof key === 'string' && key.length > 0
    ? key
    : resolveStorageScopeKey(options)

  const payload = buildPersistPayload({ state, normalizeState, now })
  if (!payload) {
    return { ok: false, error: 'invalid_state', payload: null }
  }

  try {
    await storage.set(resolvedKey, payload)
    return { ok: true, error: null, payload }
  } catch (e) {
    return { ok: false, error: String(e?.message || e), payload: null }
  }
}

export const restoreStateSnapshot = async (options = {}) => {
  const {
    storage = null,
    key = '',
    normalizeState = null,
    buildDefaultState = null,
  } = options || {}

  if (!storage || typeof storage.get !== 'function') {
    const fallback = typeof buildDefaultState === 'function' ? buildDefaultState() : null
    return { state: fallback, error: 'invalid_storage', fromStorage: false }
  }

  const resolvedKey = typeof key === 'string' && key.length > 0
    ? key
    : resolveStorageScopeKey(options)

  try {
    const raw = await storage.get(resolvedKey)
    if (!raw || typeof raw !== 'object') {
      const fallback = typeof buildDefaultState === 'function' ? buildDefaultState() : null
      return { state: fallback, error: null, fromStorage: false }
    }
    const normalized = typeof normalizeState === 'function' ? normalizeState(raw) : raw
    return { state: normalized, error: null, fromStorage: true }
  } catch (e) {
    const fallback = typeof buildDefaultState === 'function' ? buildDefaultState() : null
    return { state: fallback, error: String(e?.message || e), fromStorage: false }
  }
}