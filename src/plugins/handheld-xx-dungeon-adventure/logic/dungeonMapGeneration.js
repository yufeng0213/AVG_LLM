const buildDungeonPartySummary = (partyMembers = []) => {
  const list = Array.isArray(partyMembers) ? partyMembers : []
  return list
    .map((item) => {
      const name = String(item?.name || '').trim()
      if (!name) return ''
      const role = String(item?.role || '冒险者').trim() || '冒险者'
      return `${name}(${role})`
    })
    .filter(Boolean)
    .join('、')
}

export const buildDungeonMapForFloorWithFallback = async (options = {}) => {
  const {
    targetState = null,
    normalizeState = null,
    buildFallbackMap = null,
    loadWorldSnapshot = null,
    partyMembers = [],
    requestDungeonMap = null,
    normalizeDungeonMap = null,
    isDungeonMapUsable = null,
    mapSizeHintMin = 5,
    mapSizeHintMax = 9,
    logger = console,
  } = options || {}

  const baseState = typeof normalizeState === 'function'
    ? normalizeState(targetState)
    : (targetState || {})
  const fallbackMap = typeof buildFallbackMap === 'function'
    ? buildFallbackMap(baseState)
    : null
  const worldSnapshot = typeof loadWorldSnapshot === 'function'
    ? await loadWorldSnapshot()
    : { worldTitle: '', worldSummary: '' }
  const partySummary = buildDungeonPartySummary(partyMembers)

  try {
    if (typeof requestDungeonMap !== 'function') return fallbackMap
    const result = await requestDungeonMap({
      floor: Math.max(1, Number(baseState?.floor) || 1),
      worldTitle: worldSnapshot.worldTitle,
      worldSummary: worldSnapshot.worldSummary,
      partySummary,
      sizeHint: `${mapSizeHintMin}-${mapSizeHintMax}`,
    })
    if (!result?.success || !result.map) {
      return fallbackMap
    }
    if (typeof normalizeDungeonMap !== 'function' || typeof isDungeonMapUsable !== 'function') {
      return result.map || fallbackMap
    }
    const normalized = normalizeDungeonMap(result.map, baseState.floor)
    return isDungeonMapUsable(normalized) ? normalized : fallbackMap
  } catch (e) {
    if (logger && typeof logger.error === 'function') {
      logger.error('[xx-dungeon] map generation failed:', e)
    }
    return fallbackMap
  }
}
