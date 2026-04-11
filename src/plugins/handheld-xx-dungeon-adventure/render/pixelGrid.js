export const SPRITE_PIXEL_SIZE = 2
export const SPRITE_GRID_SIZE = 16

const resolveBounds = (grid) => {
  const height = Array.isArray(grid) ? grid.length : 0
  const width = height > 0 && Array.isArray(grid[0]) ? grid[0].length : 0
  return { width, height }
}

export const createSpriteGrid = (size = SPRITE_GRID_SIZE, fillToken = '.') => {
  const edge = Math.max(1, Number(size) || SPRITE_GRID_SIZE)
  return Array.from({ length: edge }, () => Array(edge).fill(fillToken))
}

export const paintPixel = (grid, x, y, token) => {
  const { width, height } = resolveBounds(grid)
  if (width <= 0 || height <= 0) return
  if (x < 0 || y < 0 || x >= width || y >= height) return
  grid[y][x] = token
}

export const paintPoint = (grid, x, y, token) => {
  paintPixel(grid, x, y, token)
}

export const paintRect = (grid, x, y, width, height, token) => {
  const w = Math.max(0, Number(width) || 0)
  const h = Math.max(0, Number(height) || 0)
  for (let yy = 0; yy < h; yy += 1) {
    for (let xx = 0; xx < w; xx += 1) {
      paintPixel(grid, x + xx, y + yy, token)
    }
  }
}

export const paintPoints = (grid, points = [], token) => {
  for (const [x, y] of Array.isArray(points) ? points : []) {
    paintPixel(grid, x, y, token)
  }
}
