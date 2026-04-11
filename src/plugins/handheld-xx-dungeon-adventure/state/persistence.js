export const buildPersistPayload = (options = {}) => {
  const {
    state = null,
    normalizeState = null,
    now = Date.now,
  } = options || {}

  const normalized = typeof normalizeState === 'function' ? normalizeState(state) : (state || {})
  return {
    ...normalized,
    updatedAt: typeof now === 'function' ? now() : Date.now(),
  }
}

export const persistStateSnapshot = async (options = {}) => {
  const {
    storage = null,
    key = '',
    state = null,
    normalizeState = null,
    now = Date.now,
  } = options || {}

  if (!storage || typeof storage.set !== 'function') {
    return { ok: false, error: new Error('invalid storage: set() is required') }
  }

  try {
    const payload = buildPersistPayload({
      state,
      normalizeState,
      now,
    })
    await storage.set(String(key || ''), payload)
    return { ok: true, error: null, payload }
  } catch (error) {
    return { ok: false, error }
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
    const fallback = typeof buildDefaultState === 'function' ? buildDefaultState() : {}
    return { state: fallback, error: new Error('invalid storage: get() is required') }
  }

  try {
    const raw = await storage.get(String(key || ''))
    const nextState = typeof normalizeState === 'function' ? normalizeState(raw) : raw
    return { state: nextState, error: null }
  } catch (error) {
    const fallback = typeof buildDefaultState === 'function' ? buildDefaultState() : {}
    return { state: fallback, error }
  }
}
