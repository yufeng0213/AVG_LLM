import { pickBedroomPlacement } from './bedroomPlacement.js'

const fallbackClampInt = (value, min, max, fallback = min) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

const fallbackMakeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const applyBedroomFurnitureDraftsToState = (options = {}) => {
  const {
    targetState = null,
    drafts = [],
    normalizeState = null,
    normalizeBedroomState = null,
    normalizeBedroomFurnitureItem = null,
    maxFurnitureItems = 48,
    makeId = fallbackMakeId,
    clampInt = fallbackClampInt,
    randomInt = null,
  } = options || {}

  const source = Array.isArray(drafts) ? drafts : []
  if (source.length <= 0) {
    return { ok: false, error: 'empty_drafts', appended: [] }
  }
  if (
    typeof normalizeState !== 'function' ||
    typeof normalizeBedroomState !== 'function' ||
    typeof normalizeBedroomFurnitureItem !== 'function'
  ) {
    return { ok: false, error: 'invalid_normalizers', appended: [] }
  }

  const next = normalizeState(targetState)
  const bedroom = normalizeBedroomState(next.bedroom)
  const roomWidth = bedroom.width
  const roomHeight = bedroom.height
  const existing = [...bedroom.items]
  const appended = []

  source.forEach((rawItem, index) => {
    const normalized = normalizeBedroomFurnitureItem({
      ...rawItem,
      id: String(rawItem?.id || makeId('br')),
    }, bedroom.items.length + index, roomWidth, roomHeight)
    if (!normalized) return

    const placement = pickBedroomPlacement(
      existing,
      normalized.width,
      normalized.height,
      roomWidth,
      roomHeight,
      normalized.kind,
      { randomInt },
    )
    const item = normalizeBedroomFurnitureItem({
      ...normalized,
      x: placement.x,
      y: placement.y,
      z: normalized.kind === 'floor'
        ? 0
        : Math.max(
            normalized.z,
            existing.reduce((max, entry) => Math.max(max, clampInt(entry?.z, 0, 200, 0)), 0) + 1,
          ),
    }, bedroom.items.length + index, roomWidth, roomHeight)
    if (!item) return
    existing.push(item)
    appended.push(item)
  })

  if (appended.length < 1) {
    return { ok: false, error: 'no_valid_items', appended: [] }
  }

  bedroom.items = existing.slice(-Math.max(1, Number(maxFurnitureItems) || 1))
  next.bedroom = normalizeBedroomState(bedroom)
  return {
    ok: true,
    error: null,
    nextState: next,
    appended,
  }
}
