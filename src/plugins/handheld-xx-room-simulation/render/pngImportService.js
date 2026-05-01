// PNG 导入服务 - 读取PNG并转换为像素数据

import {
  SPRITE_GRID_SIZE,
  SPRITE_PIXEL_SIZE,
  ROOM_CELL_SIZE,
} from '../config/constants.js'

// PNG 尺寸限制（放宽上限，允许更大图片）
const PNG_MAX_WIDTH = 512  // 最大8格宽
const PNG_MAX_HEIGHT = 512 // 最大8格高
const PNG_MIN_WIDTH = 16
const PNG_MIN_HEIGHT = 16

export const createPngImportService = (deps = {}) => {
  const {
    maxWidth = PNG_MAX_WIDTH,
    maxHeight = PNG_MAX_HEIGHT,
    cellSize = ROOM_CELL_SIZE,
    spriteGridSize = SPRITE_GRID_SIZE,
    spritePixelSize = SPRITE_PIXEL_SIZE,
  } = deps

  // ========== 核心解析函数 ==========

  /**
   * 从 File/Blob 解析 PNG
   * @param {File|Blob} file - PNG 文件
   * @returns {Promise<{pixels, width, height, palette}>}
   */
  const parsePngFile = async (file) => {
    if (!file) {
      return { error: 'no_file', pixels: null, width: 0, height: 0 }
    }

    // 验证文件类型
    const type = file.type || ''
    if (!type.includes('image/png') && !file.name?.toLowerCase().endsWith('.png')) {
      return { error: 'invalid_type', pixels: null, width: 0, height: 0 }
    }

    try {
      const imageData = await loadImageData(file)
      return processImageData(imageData)
    } catch (e) {
      return { error: String(e.message || e), pixels: null, width: 0, height: 0 }
    }
  }

  /**
   * 从 URL 解析 PNG
   * @param {string} url - PNG 图片 URL
   * @returns {Promise<{pixels, width, height, palette}>}
   */
  const parsePngUrl = async (url) => {
    if (!url) {
      return { error: 'no_url', pixels: null, width: 0, height: 0 }
    }

    try {
      const imageData = await loadImageDataFromUrl(url)
      return processImageData(imageData)
    } catch (e) {
      return { error: String(e.message || e), pixels: null, width: 0, height: 0 }
    }
  }

  /**
   * 从 Base64 解析 PNG
   * @param {string} base64 - Base64 编码的 PNG 数据
   * @returns {Promise<{pixels, width, height, palette}>}
   */
  const parsePngBase64 = async (base64) => {
    if (!base64) {
      return { error: 'no_data', pixels: null, width: 0, height: 0 }
    }

    try {
      // 移除 data:image/png;base64, 前缀
      const dataUrl = base64.includes('data:image')
        ? base64
        : `data:image/png;base64,${base64}`

      const imageData = await loadImageDataFromUrl(dataUrl)
      return processImageData(imageData)
    } catch (e) {
      return { error: String(e.message || e), pixels: null, width: 0, height: 0 }
    }
  }

  // ========== 图像加载 ==========

  /**
   * 从 File 加载 ImageData 和 base64
   */
  const loadImageData = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const dataUrl = e.target.result
        try {
          const imageData = await loadImageDataFromUrl(dataUrl)
          resolve({
            ...imageData,
            base64: dataUrl, // 保存原始 base64
          })
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  /**
   * 从 URL 加载 ImageData
   */
  const loadImageDataFromUrl = async (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0)
          const imageData = ctx.getImageData(0, 0, img.width, img.height)
          resolve({
            data: imageData.data,
            width: img.width,
            height: img.height,
          })
        } catch (err) {
          reject(err)
        }
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = url
    })
  }

  // ========== 图像处理 ==========

  /**
   * 处理 ImageData，提取像素网格和调色板
   */
  const processImageData = (imageData) => {
    const { data, width, height } = imageData

    // 验证尺寸
    if (width < PNG_MIN_WIDTH || height < PNG_MIN_HEIGHT) {
      return { error: 'too_small', pixels: null, width, height }
    }
    if (width > maxWidth || height > maxHeight) {
      return { error: 'too_large', pixels: null, width, height }
    }

    // 收集所有颜色
    const colorMap = new Map()
    const pixels = []

    for (let y = 0; y < height; y++) {
      let row = ''
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]
        const a = data[idx + 3]

        const color = rgbaToHex(r, g, b, a)
        row += color
      }
      pixels.push(row)
    }

    // 生成调色板（提取唯一颜色）
    const uniqueColors = extractUniqueColors(data, width, height)
    const palette = buildPalette(uniqueColors)

    return {
      pixels,
      width,
      height,
      palette,
      uniqueColors,
      base64: imageData.base64 || null, // 原始 PNG base64
      error: null,
    }
  }

  /**
   * RGBA 转 Hex
   */
  const rgbaToHex = (r, g, b, a) => {
    if (a === 0) return '0' // 透明
    let hex = '#' +
      r.toString(16).padStart(2, '0') +
      g.toString(16).padStart(2, '0') +
      b.toString(16).padStart(2, '0')
    if (a < 255) {
      hex += a.toString(16).padStart(2, '0')
    }
    return hex
  }

  /**
   * 提取唯一颜色列表
   */
  const extractUniqueColors = (data, width, height) => {
    const colors = new Map()

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]

      if (a === 0) {
        colors.set('transparent', { r: 0, g: 0, b: 0, a: 0, count: (colors.get('transparent')?.count || 0) + 1 })
      } else {
        const key = `${r},${g},${b},${a}`
        if (!colors.has(key)) {
          colors.set(key, { r, g, b, a, count: 1 })
        } else {
          colors.get(key).count += 1
        }
      }
    }

    return Array.from(colors.values())
  }

  /**
   * 构建调色板数组
   */
  const buildPalette = (uniqueColors, maxColors = 16) => {
    // 按出现次数排序
    const sorted = uniqueColors.sort((a, b) => b.count - a.count)

    // 最多16色（索引 0-f）
    const palette = []

    // 透明色总是第一位
    palette.push('#00000000')

    // 添加其他颜色
    for (let i = 0; i < Math.min(sorted.length - 1, maxColors - 1); i++) {
      const c = sorted.find(c => c.a > 0) || sorted[i + 1]
      if (c && c.a > 0) {
        const hex = rgbaToHex(c.r, c.g, c.b, c.a)
        if (!palette.includes(hex)) {
          palette.push(hex)
        }
      }
    }

    // 确保至少有3色
    while (palette.length < 3) {
      palette.push('#808080')
    }

    return palette.slice(0, maxColors)
  }

  // ========== 格子计算 ==========

  /**
   * 计算 PNG 占用的格子数
   * @param {number} pngWidth - PNG 宽度（像素）
   * @param {number} pngHeight - PNG 高度（像素）
   * @returns {{width: number, height: number}} 格子数
   */
  const calculateCellOccupancy = (pngWidth, pngHeight) => {
    const cellW = Math.ceil(pngWidth / cellSize)
    const cellH = Math.ceil(pngHeight / cellSize)

    return {
      width: Math.max(1, Math.min(8, cellW)),
      height: Math.max(1, Math.min(8, cellH)),
    }
  }

  /**
   * 计算适合的 PNG 尺寸（基于格子数）
   * @param {number} cellWidth - 占用格子宽
   * @param {number} cellHeight - 占用格子高
   * @returns {{width: number, height: number}} 推荐PNG尺寸
   */
  const calculateRecommendedPngSize = (cellWidth, cellHeight) => {
    return {
      width: cellWidth * cellSize,
      height: cellHeight * cellSize,
    }
  }

  // ========== 像素缩放/转换 ==========

  /**
   * 将 PNG 像素转换为索引格式（匹配现有系统）
   * @param {string[]} rawPixels - 原始像素行（每行是颜色hex字符串）
   * @param {string[]} palette - 调色板
   * @returns {string[]} 索引像素行（十六进制字符）
   */
  const convertToIndexedPixels = (rawPixels, palette) => {
    if (!Array.isArray(rawPixels) || !Array.isArray(palette)) return []

    // 建立颜色到索引的映射
    const colorToIndex = new Map()
    palette.forEach((color, idx) => {
      colorToIndex.set(color, idx.toString(16))
    })

    // 添加透明映射
    colorToIndex.set('0', '0')
    colorToIndex.set('transparent', '0')

    return rawPixels.map(row => {
      // 每行的颜色可能是连续的hex字符串，需要分割
      // 假设原始格式：每个像素是7或9字符的hex
      let indexedRow = ''
      for (let i = 0; i < row.length; i += 7) {
        const color = row.slice(i, i + 7)
        const index = colorToIndex.get(color) || '1'
        indexedRow += index
      }
      return indexedRow
    })
  }

  /**
   * 缩放 PNG 像素到标准格子尺寸
   * @param {string[]} rawPixels - 原始像素
   * @param {number} targetWidth - 目标宽度
   * @param {number} targetHeight - 目标高度
   * @returns {string[]} 缩放后的像素
   */
  const scalePixels = (rawPixels, targetWidth, targetHeight) => {
    if (!Array.isArray(rawPixels)) return []

    const srcWidth = rawPixels[0]?.length || 0
    const srcHeight = rawPixels.length

    if (srcWidth === 0 || srcHeight === 0) return []

    // 简单的最近邻缩放
    const scaled = []
    for (let y = 0; y < targetHeight; y++) {
      let row = ''
      const srcY = Math.floor(y * srcHeight / targetHeight)
      const srcRow = rawPixels[srcY] || ''
      for (let x = 0; x < targetWidth; x++) {
        const srcX = Math.floor(x * srcWidth / targetWidth)
        row += srcRow[srcX] || '0'
      }
      scaled.push(row)
    }

    return scaled
  }

  /**
   * 缩放像素到 16x16 标准精灵尺寸
   */
  const scaleToSpriteGrid = (rawPixels) => {
    return scalePixels(rawPixels, spriteGridSize, spriteGridSize)
  }

  // ========== Tile/Furniture 数据构建 ==========

  /**
   * 从 PNG 构建 Tile 数据
   */
  const buildTileFromPng = async (pngInput, tileType = 'floor', options = {}) => {
    const result = await parsePngInput(pngInput)
    if (result.error) return { error: result.error, tile: null }

    const { pixels, palette, width, height } = result

    // 缩放到标准尺寸
    const scaledPixels = scaleToSpriteGrid(pixels.map(row => {
      // 需要将颜色hex转换为索引
      return row
    }))

    const indexedPixels = convertToIndexedPixels(pixels, palette)

    return {
      error: null,
      tile: {
        id: options.id || `tile-png-${Date.now().toString(36)}`,
        type: tileType,
        terrainId: options.terrainId || 'custom-png',
        terrainPalette: palette,
        terrainPixels16: scalePixels(indexedPixels, spriteGridSize, spriteGridSize),
        passable: tileType !== 'wall',
        speedModifier: options.speedModifier || 1.0,
      },
      cellOccupancy: calculateCellOccupancy(width, height),
    }
  }

  /**
   * 从 PNG 构建家具数据
   */
  const buildFurnitureFromPng = async (pngInput, options = {}) => {
    const result = await parsePngInput(pngInput)
    if (result.error) return { error: result.error, furniture: null }

    const { pixels, palette, width, height } = result
    const occupancy = calculateCellOccupancy(width, height)

    const indexedPixels = convertToIndexedPixels(pixels, palette)
    const scaledPixels = scalePixels(indexedPixels, spriteGridSize, spriteGridSize)

    return {
      error: null,
      furniture: {
        id: options.id || `furn-png-${Date.now().toString(36)}`,
        name: options.name || '自定义家具',
        kind: options.kind || 'decor',
        width: occupancy.width,
        height: occupancy.height,
        x: options.x || 0,
        y: options.y || 0,
        z: options.z || 10,
        walkable: options.walkable !== false,
        interactable: options.interactable !== false,
        interactionType: options.interactionType || 'none',
        needsSatisfied: options.needsSatisfied || {},
        // 自定义精灵数据
        customSprite: {
          palette,
          pixels16: scaledPixels,
          originalWidth: width,
          originalHeight: height,
        },
      },
      cellOccupancy: occupancy,
    }
  }

  /**
   * 统一的 PNG 输入解析
   */
  const parsePngInput = async (input) => {
    if (!input) return { error: 'no_input', pixels: null, width: 0, height: 0 }

    // File 对象
    if (input instanceof File || input instanceof Blob) {
      return parsePngFile(input)
    }

    // URL 字符串
    if (typeof input === 'string') {
      if (input.startsWith('http') || input.startsWith('data:image')) {
        return parsePngUrl(input)
      }
      // Base64
      return parsePngBase64(input)
    }

    return { error: 'invalid_input', pixels: null, width: 0, height: 0 }
  }

  // ========== 验证 ==========

  /**
   * 验证 PNG 是否适合导入
   */
  const validatePngForImport = async (pngInput) => {
    const result = await parsePngInput(pngInput)

    if (result.error) {
      return { valid: false, reason: result.error }
    }

    const occupancy = calculateCellOccupancy(result.width, result.height)

    return {
      valid: true,
      reason: null,
      width: result.width,
      height: result.height,
      cellWidth: occupancy.width,
      cellHeight: occupancy.height,
      colorCount: result.uniqueColors?.length || 0,
      paletteSize: result.palette?.length || 0,
    }
  }

  return {
    // 核心解析
    parsePngFile,
    parsePngUrl,
    parsePngBase64,
    parsePngInput,

    // 格子计算
    calculateCellOccupancy,
    calculateRecommendedPngSize,

    // 像素处理
    convertToIndexedPixels,
    scalePixels,
    scaleToSpriteGrid,

    // 数据构建
    buildTileFromPng,
    buildFurnitureFromPng,

    // 验证
    validatePngForImport,

    // 常量
    CELL_SIZE: cellSize,
    MAX_WIDTH: maxWidth,
    MAX_HEIGHT: maxHeight,
    SPRITE_GRID_SIZE: spriteGridSize,
  }
}

// ========== 单例导出 ==========

export const pngImportService = createPngImportService()

export default createPngImportService