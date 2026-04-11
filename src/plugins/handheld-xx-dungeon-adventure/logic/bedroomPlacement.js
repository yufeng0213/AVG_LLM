const fallbackRandomInt = (min, max) => {
  const nMin = Math.min(min, max)
  const nMax = Math.max(min, max)
  return Math.floor(Math.random() * (nMax - nMin + 1)) + nMin
}

const fallbackPickRandomItem = (list, fallback = null) => {
  if (!Array.isArray(list) || list.length <= 0) return fallback
  return list[Math.floor(Math.random() * list.length)]
}

const fallbackMakeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const BEDROOM_LOCAL_MOTIF_DRAFTS = Object.freeze([
  { name: '木纹地毯', kind: 'floor', width: 3, height: 2, walkable: true, motif: 'rug' },
  { name: '拼花地板', kind: 'floor', width: 3, height: 2, walkable: true, motif: 'tile' },
  { name: '冒险者床铺', kind: 'sleep', width: 3, height: 2, walkable: false, motif: 'bed' },
  { name: '休憩长椅', kind: 'sleep', width: 3, height: 2, walkable: true, motif: 'sofa' },
  { name: '收纳柜', kind: 'storage', width: 2, height: 2, walkable: false, motif: 'cabinet' },
  { name: '补给箱', kind: 'storage', width: 2, height: 1, walkable: false, motif: 'chest' },
  { name: '陈列架', kind: 'storage', width: 2, height: 2, walkable: false, motif: 'shelf' },
  { name: '写字桌', kind: 'utility', width: 2, height: 1, walkable: false, motif: 'desk' },
  { name: '矮桌', kind: 'utility', width: 2, height: 1, walkable: true, motif: 'table' },
  { name: '木椅', kind: 'utility', width: 1, height: 1, walkable: false, motif: 'chair' },
  { name: '室内盆栽', kind: 'decor', width: 1, height: 1, walkable: true, motif: 'plant' },
  { name: '台灯', kind: 'decor', width: 1, height: 1, walkable: true, motif: 'lamp' },
  { name: '观景窗', kind: 'decor', width: 2, height: 1, walkable: true, motif: 'window' },
  { name: '折叠屏风', kind: 'decor', width: 2, height: 2, walkable: false, motif: 'screen' },
])

export const isBedroomRectOverlap = (rectA, rectB) => {
  if (!rectA || !rectB) return false
  return !(
    rectA.x + rectA.width <= rectB.x ||
    rectB.x + rectB.width <= rectA.x ||
    rectA.y + rectA.height <= rectB.y ||
    rectB.y + rectB.height <= rectA.y
  )
}

export const pickBedroomPlacement = (
  existingItems,
  width,
  height,
  roomWidth,
  roomHeight,
  kind = 'decor',
  options = {},
) => {
  const {
    randomInt = fallbackRandomInt,
    maxAttempts = 28,
  } = options || {}

  const maxX = Math.max(0, roomWidth - width)
  const maxY = Math.max(0, roomHeight - height)
  const candidates = []
  const source = Array.isArray(existingItems) ? existingItems : []
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const x = randomInt(0, maxX)
    const y = randomInt(0, maxY)
    const candidate = { x, y, width, height }
    const hasCollision = source.some((item) => {
      if (!item) return false
      if (kind === 'floor' || item.kind === 'floor') return false
      return isBedroomRectOverlap(candidate, item)
    })
    if (!hasCollision) return { x, y }
    candidates.push({ x, y })
  }
  return candidates[0] || { x: 0, y: 0 }
}

export const buildLocalBedroomFurnitureDrafts = (options = {}) => {
  const {
    itemCount = 4,
    makeId = fallbackMakeId,
    pickRandomItem = fallbackPickRandomItem,
    randomInt = fallbackRandomInt,
    paletteList = ['oak'],
    silhouetteList = ['compact'],
    ornamentList = ['none'],
    randomFn = Math.random,
  } = options || {}

  const palettePick = () => pickRandomItem(paletteList, 'oak')
  const shuffled = [...BEDROOM_LOCAL_MOTIF_DRAFTS].sort(() => randomFn() - 0.5)
  const picks = shuffled.slice(0, Math.max(1, Number(itemCount) || 1))
  return picks.map((draft, index) => ({
    id: makeId('br'),
    name: draft.name,
    kind: draft.kind,
    width: draft.width,
    height: draft.height,
    walkable: draft.walkable,
    z: draft.kind === 'floor' ? 0 : 14 + index * 2,
    desc: `本地生成的${draft.name}`,
    spriteSpec: {
      motif: draft.motif,
      palette: palettePick(),
      silhouette: pickRandomItem(silhouetteList, 'compact'),
      ornament: pickRandomItem(ornamentList, 'none'),
      glow: draft.kind === 'decor' ? randomInt(0, 1) : 0,
      seed: randomInt(0, 999999),
    },
  }))
}
