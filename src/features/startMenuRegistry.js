import { sortFeaturePluginMenus } from '../../packages/plugin-sdk/src/index.js'

const BUILTIN_START_MENU_ENTRIES = []

const normalizeExtraEntries = (entries) => {
  const source = Array.isArray(entries) ? entries : []
  return source
    .map((entry, index) => {
      const id = String(entry?.id || `extra-${index + 1}`).trim()
      const title = String(entry?.menu?.title || entry?.label || '').trim()
      if (!id || !title) return null
      return {
        id,
        menu: {
          key: String(entry?.menu?.key || id).trim() || id,
          title,
          icon: String(entry?.menu?.icon || '🧩').trim() || '🧩',
          order: Number.isFinite(Number(entry?.menu?.order))
            ? Math.max(0, Math.min(9999, Math.round(Number(entry.menu.order))))
            : 1000 + index,
        },
        description: String(entry?.description || '').trim(),
        variant: String(entry?.variant || 'tone-cyan border-dashed tilt-left').trim(),
        action: entry?.action && typeof entry.action === 'object'
          ? { ...entry.action }
          : { type: 'screen', screen: String(entry?.entry?.route || '').trim() || null },
      }
    })
    .filter(Boolean)
}

const mapPluginManifestToMenuEntry = (manifest, index = 0) => {
  if (!manifest || typeof manifest !== 'object') return null
  const id = String(manifest.id || '').trim()
  const title = String(manifest?.menu?.title || manifest.name || '').trim()
  const route = String(manifest?.entry?.route || '').trim()
  const manifestAction = manifest?.action && typeof manifest.action === 'object'
    ? { ...manifest.action }
    : null

  let action = manifestAction && String(manifestAction.type || '').trim()
    ? manifestAction
    : (route ? { type: 'screen', screen: route } : { type: 'noop' })

  if (action.type === 'screen' && !String(action.screen || '').trim()) {
    if (!route) return null
    action = { ...action, screen: route }
  }

  if (!id || !title) return null
  return {
    id,
    menu: {
      key: String(manifest?.menu?.key || id).trim() || id,
      title,
      icon: String(manifest?.menu?.icon || '🧩').trim() || '🧩',
      order: Number.isFinite(Number(manifest?.menu?.order))
        ? Math.max(0, Math.min(9999, Math.round(Number(manifest.menu.order))))
        : 2000 + index,
    },
    description: String(manifest.description || '').trim(),
    variant: String(
      manifest?.menu?.variant ||
      manifest?.ui?.menuVariant ||
      'tone-cyan border-dashed tilt-left',
    ).trim() || 'tone-cyan border-dashed tilt-left',
    action,
  }
}

export const buildStartMenuRegistry = (options = {}) => {
  const pluginManifests = Array.isArray(options.pluginManifests) ? options.pluginManifests : []
  const extraEntries = normalizeExtraEntries(options.extraEntries)
  const pluginEntries = pluginManifests
    .map((item, index) => mapPluginManifestToMenuEntry(item, index))
    .filter(Boolean)

  const merged = [...BUILTIN_START_MENU_ENTRIES, ...pluginEntries, ...extraEntries]
  const deduped = []
  const seen = new Set()
  merged.forEach((item) => {
    if (!item?.id || seen.has(item.id)) return
    seen.add(item.id)
    deduped.push(item)
  })

  const sorted = sortFeaturePluginMenus(
    deduped.map((item) => ({
      id: item.id,
      menu: item.menu,
    })),
  )
  const byId = new Map(deduped.map((item) => [item.id, item]))
  const orderedEntries = sorted
    .map((item) => byId.get(item.id))
    .filter(Boolean)

  return {
    entries: orderedEntries,
    items: orderedEntries.map((item) => ({
      id: item.id,
      label: item.menu.title,
      description: item.description,
      icon: item.menu.icon,
      variant: item.variant,
    })),
    actionMap: orderedEntries.reduce((acc, item) => {
      acc[item.id] = item.action || { type: 'noop' }
      return acc
    }, {}),
  }
}

export const resolveStartMenuAction = (actionMap, itemId) => {
  if (!actionMap || typeof actionMap !== 'object') {
    return { type: 'noop' }
  }
  return actionMap[itemId] || { type: 'noop' }
}
