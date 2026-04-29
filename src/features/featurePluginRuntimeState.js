/**
 * 功能插件运行时状态 — 纯工具函数
 *
 * 状态管理已迁移至 Pinia (useGameSession)。
 * 本文件保留 isFeaturePluginEnabled / filterEnabledFeaturePluginManifests
 * 作为无状态工具，供 App.vue 和 PluginManagerScreen 使用。
 */

const isPlainObject = (value) => {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export const isFeaturePluginEnabled = (manifest, runtimeState = {}, worldbookTags = []) => {
  const pluginId = String(manifest?.id || '').trim()
  if (!pluginId) return false

  const requiredTags = Array.isArray(manifest?.requiredWorldbookTags) ? manifest.requiredWorldbookTags : []
  if (requiredTags.length > 0) {
    const availableTags = Array.isArray(worldbookTags) ? worldbookTags.map(t => String(t).trim().toLowerCase()) : []
    const hasMatch = requiredTags.some(tag => availableTags.includes(String(tag).trim().toLowerCase()))
    if (!hasMatch) return false
  }

  const normalizedState = normalizeState(runtimeState)
  if (Object.prototype.hasOwnProperty.call(normalizedState, pluginId)) {
    return Boolean(normalizedState[pluginId])
  }
  return manifest?.enabledByDefault !== false
}

export const filterEnabledFeaturePluginManifests = (manifests, runtimeState = {}, worldbookTags = []) => {
  const source = Array.isArray(manifests) ? manifests : []
  return source.filter((manifest) => isFeaturePluginEnabled(manifest, runtimeState, worldbookTags))
}

function normalizeState(rawState) {
  if (!isPlainObject(rawState)) return {}
  const normalized = {}
  Object.keys(rawState).forEach((id) => {
    const key = String(id || '').trim()
    if (!key) return
    normalized[key] = Boolean(rawState[id])
  })
  return normalized
}
