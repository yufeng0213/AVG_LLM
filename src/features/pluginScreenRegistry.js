const EMPTY_FN = () => {}
const EMPTY_ARR = []

const normalizeObject = (value) => {
  return value && typeof value === 'object' ? value : {}
}

const normalizeEventMap = (events) => {
  const source = normalizeObject(events)
  const normalized = {}
  Object.keys(source).forEach((eventName) => {
    if (typeof source[eventName] === 'function') {
      normalized[eventName] = source[eventName]
    }
  })
  return normalized
}

const normalizeRouteConfig = (config) => {
  if (!config || typeof config !== 'object' || !config.component) return null
  return {
    component: config.component,
    props: config.props,
    events: config.events,
  }
}

const buildHostContext = (options = {}) => {
  const activeWorldBookIdRef = options.activeWorldBookIdRef || null
  return {
    onBackToStart: typeof options.onBackToStart === 'function' ? options.onBackToStart : EMPTY_FN,
    onBackToWorldBookShelf: typeof options.onBackToWorldBookShelf === 'function' ? options.onBackToWorldBookShelf : EMPTY_FN,
    onLoadSave: typeof options.onLoadSave === 'function' ? options.onLoadSave : EMPTY_FN,
    onLoadBackup: typeof options.onLoadBackup === 'function' ? options.onLoadBackup : EMPTY_FN,
    onOpenWorldBookEditor: typeof options.onOpenWorldBookEditor === 'function' ? options.onOpenWorldBookEditor : EMPTY_FN,
    getActiveWorldBookId: () => {
      const value = String(activeWorldBookIdRef?.value || '').trim()
      return value || 'default_world_book'
    },
  }
}

const resolveEntryPrimaryRouteConfig = (entry, context, route, manifest) => {
  if (!entry || typeof entry !== 'object') return null
  const resolver = entry.resolveRouteConfig
  if (typeof resolver !== 'function') return null
  const raw = resolver({
    ...context,
    route,
    manifest,
  })
  return normalizeRouteConfig(raw)
}

const resolveEntryExtraRouteConfigs = (entry, context) => {
  if (!entry || typeof entry !== 'object') return EMPTY_ARR
  const resolver = entry.resolveExtraRouteConfigs
  if (typeof resolver !== 'function') return EMPTY_ARR

  const list = resolver({ ...context })
  return Array.isArray(list) ? list : EMPTY_ARR
}

export const buildPluginScreenRegistry = (options = {}) => {
  const pluginManifests = Array.isArray(options.pluginManifests) ? options.pluginManifests : EMPTY_ARR
  const pluginEntries = Array.isArray(options.pluginEntries) ? options.pluginEntries : EMPTY_ARR
  const context = buildHostContext(options)

  const entryById = new Map()
  pluginEntries.forEach((entry, index) => {
    const id = String(entry?.id || '').trim()
    if (!id || entryById.has(id)) {
      if (!id || entry != null) {
        console.warn('[feature-plugin] skip duplicated/invalid entry for screen registry', { index, id })
      }
      return
    }
    entryById.set(id, entry)
  })

  const registry = {}

  pluginManifests.forEach((manifest) => {
    const pluginId = String(manifest?.id || '').trim()
    const route = String(manifest?.entry?.route || '').trim()
    if (!pluginId || !route || registry[route]) return

    const entry = entryById.get(pluginId)
    const routeConfig = resolveEntryPrimaryRouteConfig(entry, context, route, manifest)
    if (routeConfig) {
      registry[route] = routeConfig
    }
  })

  pluginEntries.forEach((entry) => {
    const list = resolveEntryExtraRouteConfigs(entry, context)
    list.forEach((item) => {
      const route = String(item?.route || '').trim()
      if (!route || registry[route]) return
      const routeConfig = normalizeRouteConfig(item)
      if (routeConfig) {
        registry[route] = routeConfig
      }
    })
  })

  return registry
}

export const resolvePluginScreenByRoute = (registry, route) => {
  if (!registry || typeof registry !== 'object') return null
  const routeKey = String(route || '').trim()
  if (!routeKey) return null

  const entry = registry[routeKey]
  if (!entry || typeof entry !== 'object' || !entry.component) return null

  const props = typeof entry.props === 'function' ? entry.props() : entry.props
  const events = typeof entry.events === 'function' ? entry.events() : entry.events
  return {
    component: entry.component,
    props: normalizeObject(props),
    events: normalizeEventMap(events),
  }
}

