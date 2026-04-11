export const FEATURE_PLUGIN_API_VERSION = 1

export const FEATURE_PLUGIN_RUNTIME = {
  LOCAL: 'local',
  BUNDLED: 'bundled',
  FEDERATED: 'federated',
}

export const FEATURE_PLUGIN_CAPABILITIES = [
  'storage',
  'llm',
  'electron-ipc',
  'background',
  'audio',
  'save-system',
  'worldbook',
  'narrator',
  'battle-system',
]

export const FEATURE_PLUGIN_ACTION_TYPES = [
  'screen',
  'new-game-dialog',
  'noop',
]

const RUNTIME_SET = new Set(Object.values(FEATURE_PLUGIN_RUNTIME))
const CAPABILITY_SET = new Set(FEATURE_PLUGIN_CAPABILITIES)
const ACTION_TYPE_SET = new Set(FEATURE_PLUGIN_ACTION_TYPES)

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value)

const asString = (value, fallback = '') => {
  const text = String(value ?? '').trim()
  return text || fallback
}

const asInt = (value, min, max, fallback) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

/**
 * 功能按钮插件契约（用于主界面按钮 -> 功能模块）
 * 必填:
 * - id/name/version/apiVersion/runtime
 * - menu.key/menu.title
 * - entry.type/entry.module
 */
export const validateFeaturePluginManifest = (input) => {
  const errors = []
  const warnings = []

  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: ['manifest 必须是对象'],
      warnings,
      normalized: null,
    }
  }

  const id = asString(input.id)
  if (!id) errors.push('id 不能为空')

  const name = asString(input.name)
  if (!name) errors.push('name 不能为空')

  const version = asString(input.version, '0.1.0')
  const apiVersion = asInt(input.apiVersion, 1, 999, FEATURE_PLUGIN_API_VERSION)

  if (apiVersion !== FEATURE_PLUGIN_API_VERSION) {
    warnings.push(`apiVersion=${apiVersion}，当前 host 目标版本为 ${FEATURE_PLUGIN_API_VERSION}`)
  }

  const runtime = asString(input.runtime, FEATURE_PLUGIN_RUNTIME.LOCAL)
  if (!RUNTIME_SET.has(runtime)) {
    errors.push(`runtime 不合法: ${runtime}`)
  }

  const menu = isPlainObject(input.menu) ? input.menu : {}
  const menuKey = asString(menu.key)
  const menuTitle = asString(menu.title)
  const menuIcon = asString(menu.icon, '🧩')
  const menuOrder = asInt(menu.order, 0, 9999, 1000)

  if (!menuKey) errors.push('menu.key 不能为空')
  if (!menuTitle) errors.push('menu.title 不能为空')

  const entry = isPlainObject(input.entry) ? input.entry : {}
  const entryType = asString(entry.type, 'vue-component')
  const entryModule = asString(entry.module)
  const entryRoute = asString(entry.route)

  if (!entryModule) {
    errors.push('entry.module 不能为空')
  }

  if (!['vue-component', 'route', 'service'].includes(entryType)) {
    errors.push(`entry.type 不合法: ${entryType}`)
  }

  if (entryType === 'route' && !entryRoute) {
    errors.push('entry.type=route 时，entry.route 必填')
  }

  const inputAction = isPlainObject(input.action) ? input.action : null
  let actionType = asString(inputAction?.type)
  let actionScreen = asString(inputAction?.screen)

  if (!actionType) {
    actionType = entryType === 'route' ? 'screen' : 'noop'
  }

  if (!ACTION_TYPE_SET.has(actionType)) {
    errors.push(`action.type 不合法: ${actionType}`)
  }

  if (actionType === 'screen') {
    if (!actionScreen && entryType === 'route') {
      actionScreen = entryRoute
    }
    if (!actionScreen) {
      errors.push('action.type=screen 时，action.screen 必填')
    }
  }

  const storage = isPlainObject(input.storage) ? input.storage : {}
  const storageNamespace = asString(storage.namespace, id || 'plugin-unknown')

  const rawCapabilities = Array.isArray(input.capabilities) ? input.capabilities : []
  const capabilities = Array.from(
    new Set(
      rawCapabilities
        .map((item) => asString(item))
        .filter(Boolean),
    ),
  )

  capabilities.forEach((item) => {
    if (!CAPABILITY_SET.has(item)) {
      warnings.push(`capability 未登记: ${item}`)
    }
  })

  const normalized = {
    id,
    name,
    description: asString(input.description),
    version,
    apiVersion,
    runtime,
    menu: {
      key: menuKey,
      title: menuTitle,
      icon: menuIcon,
      order: menuOrder,
    },
    entry: {
      type: entryType,
      module: entryModule,
      route: entryRoute || null,
    },
    storage: {
      namespace: storageNamespace,
    },
    action: {
      type: actionType,
      ...(actionType === 'screen' ? { screen: actionScreen } : {}),
    },
    capabilities,
    enabledByDefault: Boolean(input.enabledByDefault),
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
  }
}

export const assertFeaturePluginManifest = (input) => {
  const result = validateFeaturePluginManifest(input)
  if (!result.ok) {
    throw new Error(`invalid feature plugin manifest: ${result.errors.join('; ')}`)
  }
  return result.normalized
}

export const sortFeaturePluginMenus = (pluginList) => {
  const source = Array.isArray(pluginList) ? pluginList : []
  return [...source].sort((a, b) => {
    const orderA = asInt(a?.menu?.order, 0, 9999, 1000)
    const orderB = asInt(b?.menu?.order, 0, 9999, 1000)
    if (orderA !== orderB) return orderA - orderB
    const keyA = asString(a?.menu?.key)
    const keyB = asString(b?.menu?.key)
    return keyA.localeCompare(keyB)
  })
}
