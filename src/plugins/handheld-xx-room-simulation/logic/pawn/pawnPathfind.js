// A* 路径寻路算法

import {
  MAX_PATH_LENGTH,
} from '../../config/constants.js'

export const createPawnPathfindEngine = (deps = {}) => {
  const maxIterations = deps.maxIterations || 500

  // A* 寻路算法
  const findPath = (start, goal, tiles, width, height) => {
    if (!start || !goal || !tiles || width <= 0 || height <= 0) return null

    // 检查起点和终点
    const startTile = getTileAt(tiles, start.x, start.y)
    const goalTile = getTileAt(tiles, goal.x, goal.y)

    if (!startTile?.passable) return null
    if (!goalTile?.passable) return null

    const startKey = `${start.x}:${start.y}`
    const goalKey = `${goal.x}:${goal.y}`

    if (startKey === goalKey) return []

    // A* 数据结构
    const openSet = new Set([startKey])
    const cameFrom = new Map()
    const gScore = new Map([[startKey, 0]])
    const fScore = new Map([[startKey, heuristic(start, goal)]])

    let iterations = 0
    while (openSet.size > 0 && iterations < maxIterations) {
      iterations++

      // 取 fScore 最小的节点
      const current = getLowestFScoreNode(openSet, fScore)
      if (current === goalKey) {
        return reconstructPath(cameFrom, current)
      }

      openSet.delete(current)
      const [cx, cy] = parseCoord(current)

      // 遍历邻居
      const neighbors = getNeighbors(cx, cy, width, height, tiles)
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x}:${neighbor.y}`
        const tentativeG = gScore.get(current) + getDistance(cx, cy, neighbor.x, neighbor.y)

        if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
          cameFrom.set(neighborKey, current)
          gScore.set(neighborKey, tentativeG)
          fScore.set(neighborKey, tentativeG + heuristic(neighbor, goal))

          if (!openSet.has(neighborKey)) {
            openSet.add(neighborKey)
          }
        }
      }
    }

    return null // 未找到路径
  }

  // 启发函数（曼哈顿距离）
  const heuristic = (a, b) => {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  }

  // 获取指定位置的 Tile
  const getTileAt = (tiles, x, y) => {
    return tiles.find(t => t.x === x && t.y === y)
  }

  // 获取可通行邻居
  const getNeighbors = (x, y, width, height, tiles) => {
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    const neighbors = []

    for (const [dx, dy] of directions) {
      const nx = x + dx
      const ny = y + dy

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const tile = getTileAt(tiles, nx, ny)
        if (tile?.passable) {
          neighbors.push({ x: nx, y: ny })
        }
      }
    }

    return neighbors
  }

  // 获取 fScore 最小的节点
  const getLowestFScoreNode = (openSet, fScore) => {
    let lowestKey = null
    let lowestValue = Infinity

    for (const key of openSet) {
      const value = fScore.get(key) || Infinity
      if (value < lowestValue) {
        lowestValue = value
        lowestKey = key
      }
    }

    return lowestKey
  }

  // 解析坐标
  const parseCoord = (key) => {
    const [x, y] = key.split(':').map(Number)
    return [x, y]
  }

  // 重构路径
  const reconstructPath = (cameFrom, current) => {
    const path = []
    let node = current

    while (cameFrom.has(node)) {
      const [x, y] = parseCoord(node)
      path.unshift({ x, y })
      node = cameFrom.get(node)
    }

    // 限制路径长度
    if (path.length > MAX_PATH_LENGTH) {
      return path.slice(0, MAX_PATH_LENGTH)
    }

    return path
  }

  // 计算两点距离
  const getDistance = (x1, y1, x2, y2) => {
    // 曼哈顿距离，考虑斜向移动时可以用欧几里得
    return Math.abs(x1 - x2) + Math.abs(y1 - y2)
  }

  // 检查是否可达
  const isReachable = (start, goal, tiles, width, height) => {
    const path = findPath(start, goal, tiles, width, height)
    return path !== null
  }

  // 找到最近的可达点
  const findNearestReachable = (start, targets, tiles, width, height) => {
    let nearest = null
    let shortestPath = null
    let shortestLength = Infinity

    for (const target of targets) {
      const path = findPath(start, target, tiles, width, height)
      if (path && path.length < shortestLength) {
        shortestPath = path
        shortestLength = path.length
        nearest = target
      }
    }

    return { nearest, path: shortestPath }
  }

  // 简化路径（去除冗余点）
  const simplifyPath = (path) => {
    if (!path || path.length < 2) return path

    const simplified = [path[0]]
    for (let i = 1; i < path.length - 1; i++) {
      const prev = simplified[simplified.length - 1]
      const curr = path[i]
      const next = path[i + 1]

      // 如果方向相同，跳过当前点
      const dirX1 = curr.x - prev.x
      const dirY1 = curr.y - prev.y
      const dirX2 = next.x - curr.x
      const dirY2 = next.y - curr.y

      if (dirX1 !== dirX2 || dirY1 !== dirY2) {
        simplified.push(curr)
      }
    }
    simplified.push(path[path.length - 1])

    return simplified
  }

  return {
    findPath,
    heuristic,
    getNeighbors,
    isReachable,
    findNearestReachable,
    simplifyPath,
  }
}

export default createPawnPathfindEngine