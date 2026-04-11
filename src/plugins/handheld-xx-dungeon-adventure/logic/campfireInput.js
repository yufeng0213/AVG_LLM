const fallbackClampInt = (value, min, max, fallback) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

const clampBy = (clampInt, value, min, max, fallback) => {
  if (typeof clampInt === 'function') return clampInt(value, min, max, fallback)
  return fallbackClampInt(value, min, max, fallback)
}

const getLayoutMap = (layoutMap) => {
  if (!layoutMap || typeof layoutMap !== 'object') return {}
  return layoutMap
}

export const getCampfireLayoutKey = (companion, index = 0) => {
  const worldCharacterId = String(companion?.worldCharacterId || '').trim()
  if (worldCharacterId) return `w:${worldCharacterId.slice(0, 80)}`
  const companionId = String(companion?.id || '').trim()
  if (companionId) return `c:${companionId.slice(0, 80)}`
  const name = String(companion?.name || '').replace(/\s+/g, ' ').trim().slice(0, 24)
  if (name) return `n:${name}`
  return `slot:${index + 1}`
}

export const getDefaultCampfireLayout = (index = 0, defaultLayout = []) => {
  const layoutList = Array.isArray(defaultLayout) && defaultLayout.length > 0
    ? defaultLayout
    : [{ x: 50, y: 50 }]
  const base = layoutList[index % layoutList.length] || layoutList[0]
  return {
    x: Number(base?.x) || 50,
    y: Number(base?.y) || 50,
  }
}

export const getCampfireCompanionLayout = (options = {}) => {
  const {
    companion = null,
    index = 0,
    layoutMap = null,
    defaultLayout = [],
    clampInt = null,
    xMin = 0,
    xMax = 100,
    yMin = 0,
    yMax = 100,
  } = options || {}

  const key = getCampfireLayoutKey(companion, index)
  const map = getLayoutMap(layoutMap)
  const saved = map[key]

  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    return {
      x: clampBy(clampInt, saved.x, xMin, xMax, xMin),
      y: clampBy(clampInt, saved.y, yMin, yMax, yMin),
    }
  }

  return getDefaultCampfireLayout(index, defaultLayout)
}

export const pruneCampfireLayoutMap = (layoutMap, companions = [], options = {}) => {
  const map = getLayoutMap(layoutMap)
  const keys = Object.keys(map)
  if (keys.length <= 0) {
    return { changed: false, nextMap: map }
  }

  const keyResolver = typeof options?.getLayoutKey === 'function'
    ? options.getLayoutKey
    : getCampfireLayoutKey
  const list = Array.isArray(companions) ? companions : []
  const keep = new Set(list.map((item, index) => keyResolver(item, index)))

  let changed = false
  const nextMap = {}
  for (const key of keys) {
    if (!keep.has(key)) {
      changed = true
      continue
    }
    nextMap[key] = map[key]
  }

  return {
    changed,
    nextMap: changed ? nextMap : map,
  }
}

export const resolveCampfirePointerPercent = (clientX, clientY, rootElement = null) => {
  const rect = rootElement?.getBoundingClientRect?.()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  return {
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100,
  }
}

export const resolveCampfireDragLayoutPoint = (point, dragState) => {
  if (!point || !dragState) return null
  return {
    x: (Number(point.x) || 0) + (Number(dragState.offsetX) || 0),
    y: (Number(point.y) || 0) + (Number(dragState.offsetY) || 0),
  }
}

export const createCampfireDragState = (event, layoutKey, current, pointerPoint) => {
  const key = String(layoutKey || '').trim()
  if (!event || !key || !current || !pointerPoint) return null
  const currentX = Number(current.x)
  const currentY = Number(current.y)
  const pointerX = Number(pointerPoint.x)
  const pointerY = Number(pointerPoint.y)
  if (
    !Number.isFinite(currentX) ||
    !Number.isFinite(currentY) ||
    !Number.isFinite(pointerX) ||
    !Number.isFinite(pointerY)
  ) {
    return null
  }
  return {
    pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
    layoutKey: key,
    offsetX: currentX - pointerX,
    offsetY: currentY - pointerY,
    startX: currentX,
    startY: currentY,
  }
}
