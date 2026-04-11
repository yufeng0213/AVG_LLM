const STORAGE_KEY = 'avg_llm_feature_plugin_runtime_state_v1'
const EVENT_NAME = 'feature-plugin-state-changed'

const isPlainObject = (value) => {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

const normalizeState = (rawState) => {
  if (!isPlainObject(rawState)) return {}
  const normalized = {}
  Object.keys(rawState).forEach((id) => {
    const key = String(id || '').trim()
    if (!key) return
    normalized[key] = Boolean(rawState[id])
  })
  return normalized
}

const readStateFromLocalStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {}
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return normalizeState(JSON.parse(raw))
  } catch (error) {
    console.error('[feature-plugin] failed to read runtime state', error)
    return {}
  }
}

const writeStateToLocalStorage = (state) => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  try {
    const normalized = normalizeState(state)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  } catch (error) {
    console.error('[feature-plugin] failed to save runtime state', error)
  }
}

const clearStateFromLocalStorage = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('[feature-plugin] failed to clear runtime state', error)
  }
}

const dispatchStateChangeEvent = (state, pluginId = '', enabled = null) => {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, {
    detail: {
      pluginId: String(pluginId || '').trim(),
      enabled: typeof enabled === 'boolean' ? enabled : null,
      state: normalizeState(state),
    },
  }))
}

const persistAndDispatch = (state, pluginId = '', enabled = null) => {
  const normalized = normalizeState(state)
  writeStateToLocalStorage(normalized)
  dispatchStateChangeEvent(normalized, pluginId, enabled)
  return normalized
}

export const getFeaturePluginRuntimeState = () => {
  return readStateFromLocalStorage()
}

export const isFeaturePluginEnabled = (manifest, runtimeState = {}) => {
  const pluginId = String(manifest?.id || '').trim()
  if (!pluginId) return false
  const normalizedState = normalizeState(runtimeState)
  if (Object.prototype.hasOwnProperty.call(normalizedState, pluginId)) {
    return Boolean(normalizedState[pluginId])
  }
  return manifest?.enabledByDefault !== false
}

export const filterEnabledFeaturePluginManifests = (manifests, runtimeState = {}) => {
  const source = Array.isArray(manifests) ? manifests : []
  return source.filter((manifest) => isFeaturePluginEnabled(manifest, runtimeState))
}

export const setFeaturePluginEnabled = (pluginId, enabled) => {
  const normalizedPluginId = String(pluginId || '').trim()
  if (!normalizedPluginId) {
    return readStateFromLocalStorage()
  }

  const current = readStateFromLocalStorage()
  const next = {
    ...current,
    [normalizedPluginId]: Boolean(enabled),
  }

  return persistAndDispatch(next, normalizedPluginId, Boolean(enabled))
}

export const replaceFeaturePluginRuntimeState = (nextState) => {
  return persistAndDispatch(nextState, '', null)
}

export const resetFeaturePluginEnabledOverride = (pluginId) => {
  const normalizedPluginId = String(pluginId || '').trim()
  if (!normalizedPluginId) {
    return readStateFromLocalStorage()
  }

  const current = readStateFromLocalStorage()
  if (!Object.prototype.hasOwnProperty.call(current, normalizedPluginId)) {
    return normalizeState(current)
  }

  const next = { ...current }
  delete next[normalizedPluginId]

  return persistAndDispatch(next, normalizedPluginId, null)
}

export const resetFeaturePluginRuntimeState = () => {
  const next = {}
  clearStateFromLocalStorage()
  dispatchStateChangeEvent(next, '', null)
  return next
}

export const subscribeFeaturePluginRuntimeState = (listener) => {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {}
  }
  if (typeof listener !== 'function') {
    return () => {}
  }

  const handler = (event) => {
    listener(event?.detail?.state || readStateFromLocalStorage(), event)
  }

  window.addEventListener(EVENT_NAME, handler)
  return () => {
    window.removeEventListener(EVENT_NAME, handler)
  }
}
