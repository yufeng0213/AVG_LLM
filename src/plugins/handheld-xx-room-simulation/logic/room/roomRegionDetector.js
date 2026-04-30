// 房间区域检测 - flood-fill 算法检测封闭区域

// 检测封闭区域
export const detectRoomRegions = (tiles, width, height) => {
  if (!tiles || width <= 0 || height <= 0) return []

  const visited = new Set()
  const regions = []

  // 从每个可通行且未访问的格子开始 flood-fill
  for (const tile of tiles) {
    if (!tile.passable) continue
    const key = `${tile.x}:${tile.y}`
    if (visited.has(key)) continue

    // 开始新的区域检测
    const region = floodFill(tile.x, tile.y, tiles, width, height, visited)
    if (region.cells.length > 0) {
      regions.push(region)
    }
  }

  return regions
}

// Flood-fill 算法
const floodFill = (startX, startY, tiles, width, height, visited) => {
  const cells = []
  const queue = [{ x: startX, y: startY }]
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]]

  let minX = startX
  let maxX = startX
  let minY = startY
  let maxY = startY

  while (queue.length > 0) {
    const { x, y } = queue.shift()
    const key = `${x}:${y}`

    if (visited.has(key)) continue
    visited.add(key)

    // 检查是否可通行
    const tile = tiles.find(t => t.x === x && t.y === y)
    if (!tile || !tile.passable) continue

    cells.push({ x, y })

    // 更新边界
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)

    // 添加邻居
    for (const [dx, dy] of directions) {
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const neighborKey = `${nx}:${ny}`
        if (!visited.has(neighborKey)) {
          queue.push({ x: nx, y: ny })
        }
      }
    }
  }

  return {
    id: `region-${minX}-${minY}-${maxX}-${maxY}`,
    cells,
    bounds: { minX, maxX, minY, maxY },
    area: cells.length,
  }
}

// 检测是否有封闭的房间（有墙包围的区域）
export const detectEnclosedRooms = (tiles, width, height) => {
  const regions = detectRoomRegions(tiles, width, height)

  // 检查每个区域是否被墙包围
  const enclosedRooms = regions.filter(region => {
    return isRegionEnclosed(region, tiles, width, height)
  })

  return enclosedRooms
}

// 检查区域是否封闭
const isRegionEnclosed = (region, tiles, width, height) => {
  const { bounds, cells } = region

  // 检查边界是否有墙或门
  for (const cell of cells) {
    // 检查四个方向是否有出口
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    for (const [dx, dy] of directions) {
      const nx = cell.x + dx
      const ny = cell.y + dy

      // 如果超出边界，说明区域不封闭
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
        continue // 边界外不算出口
      }

      // 检查邻居格子
      const neighbor = tiles.find(t => t.x === nx && t.y === ny)
      if (!neighbor) continue

      // 如果是可通行但不在区域内的格子，说明有出口
      if (neighbor.passable && !cells.some(c => c.x === nx && c.y === ny)) {
        // 检查是否是门（门不算出口）
        if (neighbor.type !== 'door') {
          return false
        }
      }
    }
  }

  // 区域必须有一定大小才算房间
  return cells.length >= 4
}

// 检测房间是否有出口（门）
export const detectRoomDoors = (tiles, width, height) => {
  return tiles.filter(t => t.type === 'door' && t.passable)
}

// 计算房间面积（可通行格子数）
export const calculateRoomArea = (tiles) => {
  return tiles.filter(t => t.passable).length
}

// 检测小人是否在有效区域内
export const isPawnInValidRegion = (pawn, tiles, width, height) => {
  const regions = detectRoomRegions(tiles, width, height)
  const pawnKey = `${pawn?.position?.x}:${pawn?.position?.y}`

  return regions.some(region =>
    region.cells.some(c => `${c.x}:${c.y}` === pawnKey)
  )
}

// 获取指定位置的房间区域
export const getRegionAtPosition = (x, y, tiles, width, height) => {
  const regions = detectRoomRegions(tiles, width, height)
  return regions.find(region =>
    region.cells.some(c => c.x === x && c.y === y)
  ) || null
}

// 检测区域连接性（是否有路径从一个区域到另一个）
export const areRegionsConnected = (regionA, regionB, tiles, width, height) => {
  // 检查是否有门连接两个区域
  const doors = detectRoomDoors(tiles, width, height)

  for (const door of doors) {
    // 检查门的两侧是否分别在两个区域
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    for (const [dx, dy] of directions) {
      const nx = door.x + dx
      const ny = door.y + dy

      const inA = regionA.cells.some(c => c.x === nx && c.y === ny)
      const inB = regionB.cells.some(c => c.x === nx && c.y === ny)

      if (inA && inB) return true
    }
  }

  return false
}

export default {
  detectRoomRegions,
  detectEnclosedRooms,
  detectRoomDoors,
  calculateRoomArea,
  isPawnInValidRegion,
  getRegionAtPosition,
  areRegionsConnected,
}