const normalizeBy = (fn, value, index = 0) => {
  if (typeof fn === 'function') return fn(value, index)
  return value
}

export const buildFallbackCampfireCompanions = (snapshot = null, teammateList = [], options = {}) => {
  const {
    normalizeCampfireCompanion = null,
    resolveClassicRole = null,
    pickCampfireActionByHint = null,
    defaultCampfireNames = ['艾诺', '米拉', '托比', '莎米'],
    roleFallbackList = ['knight', 'mage', 'ranger', 'rogue'],
    styleList = ['knight', 'mage', 'ranger', 'rogue'],
    paletteList = ['ember', 'forest', 'sky', 'sand'],
    actionList = ['idle', 'warm_hands', 'lookout', 'cheer'],
    maxCampfireCompanions = 240,
  } = options || {}

  const characters = Array.isArray(snapshot?.characters) ? snapshot.characters : []
  const teammates = Array.isArray(teammateList) ? teammateList : []
  const source = characters.length > 0
    ? characters
    : teammates.map((item, index) => ({
      id: item?.worldCharacterId || item?.id || `tm-${index + 1}`,
      name: item?.name,
      role: item?.role,
      hint: item?.role,
    }))

  if (source.length === 0) {
    return defaultCampfireNames.map((name, index) => normalizeBy(normalizeCampfireCompanion, {
      id: `camp-fallback-${index + 1}`,
      worldCharacterId: `fallback-${index + 1}`,
      name,
      role: roleFallbackList[index % roleFallbackList.length],
      style: styleList[index % styleList.length],
      palette: paletteList[index % paletteList.length],
      action: actionList[index % actionList.length],
      line: `${name}在篝火旁整理装备。`,
    }, index))
  }

  return source
    .slice(0, maxCampfireCompanions)
    .map((item, index) => {
      const role = typeof resolveClassicRole === 'function'
        ? resolveClassicRole(item?.role, index, item?.hint)
        : (item?.role || '冒险者')
      const action = typeof pickCampfireActionByHint === 'function'
        ? pickCampfireActionByHint(item?.hint || item?.role, index)
        : actionList[index % actionList.length]
      return normalizeBy(normalizeCampfireCompanion, {
        id: `camp-fallback-${item?.id || index + 1}`,
        worldCharacterId: item?.id,
        name: item?.name,
        role,
        style: styleList[index % styleList.length],
        palette: paletteList[index % paletteList.length],
        action,
        line: `${item?.name || '队员'}在篝火旁整理装备。`,
      }, index)
    })
}

export const calcTargetCampfireCompanionCount = (worldCharacters, fallbackList = [], options = {}) => {
  const {
    maxCampfireCompanions = 240,
    defaultCampfireNames = ['艾诺', '米拉', '托比', '莎米'],
  } = options || {}
  const worldCount = Array.isArray(worldCharacters) ? worldCharacters.length : 0
  if (worldCount > 0) {
    return Math.min(maxCampfireCompanions, Math.max(1, worldCount))
  }
  const fallbackCount = Array.isArray(fallbackList) ? fallbackList.length : 0
  return Math.max(1, Math.min(maxCampfireCompanions, fallbackCount || defaultCampfireNames.length))
}

export const mergeGeneratedCompanions = (generatedList, characters, fallbackList, options = {}) => {
  const {
    normalizeCampfireCompanionList = null,
    normalizeCampfireCompanion = null,
    resolveClassicRole = null,
    pickCampfireActionByHint = null,
    styleList = ['knight', 'mage', 'ranger', 'rogue'],
    paletteList = ['ember', 'forest', 'sky', 'sand'],
  } = options || {}

  const normalizeList = (list) => {
    if (typeof normalizeCampfireCompanionList === 'function') {
      return normalizeCampfireCompanionList(list)
    }
    return Array.isArray(list) ? list.filter(Boolean) : []
  }

  const generated = normalizeList(generatedList)
  if (generated.length === 0) return normalizeList(fallbackList)

  const source = Array.isArray(characters) ? characters : []
  if (source.length === 0) {
    const fallback = normalizeList(fallbackList)
    if (fallback.length === 0) return generated
    return normalizeList(fallback.map((item, index) => ({
      ...item,
      role: typeof resolveClassicRole === 'function'
        ? resolveClassicRole(generated[index]?.role || item?.role, index, generated[index]?.line || item?.line)
        : (generated[index]?.role || item?.role),
      style: generated[index]?.style || item?.style,
      palette: generated[index]?.palette || item?.palette,
      action: generated[index]?.action || item?.action,
      line: generated[index]?.line || item?.line,
    })))
  }

  const fallbackSource = Array.isArray(fallbackList) ? fallbackList : []
  const result = source.map((character, index) => {
    const matched = generated[index] || generated.find((item) => item?.name === character?.name) || null
    const fallback = fallbackSource[index] || fallbackSource[index % fallbackSource.length] || null
    const role = typeof resolveClassicRole === 'function'
      ? resolveClassicRole(matched?.role || character?.role || fallback?.role, index, character?.hint)
      : (matched?.role || character?.role || fallback?.role || '冒险者')
    const action = matched?.action ||
      fallback?.action ||
      (typeof pickCampfireActionByHint === 'function'
        ? pickCampfireActionByHint(character?.hint || character?.role, index)
        : 'idle')
    return normalizeBy(normalizeCampfireCompanion, {
      id: matched?.id || fallback?.id || `camp-${character?.id || index + 1}`,
      worldCharacterId: character?.id,
      name: character?.name,
      role,
      style: matched?.style || fallback?.style || styleList[index % styleList.length],
      palette: matched?.palette || fallback?.palette || paletteList[index % paletteList.length],
      action,
      line: matched?.line || fallback?.line || `${character?.name || '队员'}在篝火旁等待出发。`,
    }, index)
  })

  return normalizeList(result)
}

export const applyCompanionRolesToTeammates = (teammateList, companionList, options = {}) => {
  const {
    normalizeTeammate = null,
    normalizeCampfireCompanionList = null,
    resolveClassicRole = null,
    maxTeammateCount = 240,
  } = options || {}

  const teammates = (Array.isArray(teammateList) ? teammateList : [])
    .map((item, index) => normalizeBy(normalizeTeammate, item, index))
    .filter(Boolean)
  const companions = typeof normalizeCampfireCompanionList === 'function'
    ? normalizeCampfireCompanionList(companionList)
    : (Array.isArray(companionList) ? companionList.filter(Boolean) : [])

  if (teammates.length === 0 || companions.length === 0) return teammates

  return teammates
    .map((teammate, index) => {
      const matched = companions.find((companion) => {
        if (companion?.worldCharacterId && teammate?.worldCharacterId) {
          return companion.worldCharacterId === teammate.worldCharacterId
        }
        return companion?.name === teammate?.name
      })
      if (!matched) return teammate
      return normalizeBy(normalizeTeammate, {
        ...teammate,
        role: typeof resolveClassicRole === 'function'
          ? resolveClassicRole(matched?.role || teammate?.role, index, matched?.line)
          : (matched?.role || teammate?.role),
        rarity: 'R',
      }, index)
    })
    .slice(0, maxTeammateCount)
}
