// 家具导入管理 - 处理 PNG 导入、z轴计算、添加到房间

import { createRoomFurnitureEngine, FURNITURE_CATALOG } from './roomFurnitureEngine.js'
import { calculateFurnitureZ, Z_LAYER_RULES } from '../../render/roomSprites.js'
import { ROOM_CELL_SIZE, SPRITE_GRID_SIZE, SPRITE_PIXEL_SIZE } from '../../config/constants.js'

export const createFurnitureImportManager = (deps = {}) => {
  const furnitureEngine = deps.furnitureEngine || createRoomFurnitureEngine()

  // ========== PNG 导入家具 ==========

  /**
   * 从 PNG 数据创建家具实例
   * @param {Object} pngData - PNG 解析后的数据
   * @param {Object} options - 配置选项
   * @returns {Object} 家具实例
   */
  const createFurnitureFromPng = (pngData, options = {}) => {
    if (!pngData || pngData.error) {
      return { error: pngData?.error || 'invalid_png_data', furniture: null }
    }

    const {
      name = '自定义家具',
      kind = 'decor',
      x = 0,
      y = 0,
      walkable = false,
      interactable = false,
      interactionType = 'none',
      needsSatisfied = {},
      workType = '',
      workDuration = 120,
    } = options

    // 计算格子占用
    const cellWidth = pngData.cellWidth || Math.ceil(pngData.width / ROOM_CELL_SIZE)
    const cellHeight = pngData.cellHeight || Math.ceil(pngData.height / ROOM_CELL_SIZE)

    // 创建家具实例
    const furniture = {
      id: options.id || `furn-png-${Date.now().toString(36)}`,
      name,
      kind,
      width: cellWidth,
      height: cellHeight,
      x,
      y,
      z: options.z ?? null, // 使用 null 表示需要自动计算
      walkable,
      interactable,
      interactionType,
      workType,
      workDuration,
      needsSatisfied,
      // PNG 自定义精灵数据
      customSprite: {
        base64: pngData.base64 || null, // 直接使用原始 PNG
        originalWidth: pngData.originalWidth || pngData.width,
        originalHeight: pngData.originalHeight || pngData.height,
      },
      spriteSpec: null, // 不使用预设精灵
      spriteTemplate: null,
    }

    // 自动计算 z 值
    furniture.z = calculateFurnitureZ(furniture)

    return { error: null, furniture }
  }

  /**
   * 添加导入的家具到房间
   * @param {Object} room - 房间状态
   * @param {Object} furniture - 家具实例
   * @param {Object} options - 放置选项
   */
  const addImportedFurnitureToRoom = (room, furniture, options = {}) => {
    if (!room || !furniture) return { success: false, reason: 'invalid_input' }

    // 验证放置位置
    const validation = furnitureEngine.validateFurniturePlacement(furniture, room)
    if (!validation.valid) {
      return { success: false, reason: validation.reason }
    }

    // 如果指定了自动寻找位置
    if (options.autoPlace) {
      const placed = furnitureEngine.autoPlaceFurniture(room, furniture)
      if (!placed) {
        return { success: false, reason: 'no_valid_position' }
      }
      furniture.x = placed.x
      furniture.y = placed.y
    }

    // 确保 z 值已计算
    if (furniture.z === null || furniture.z === undefined) {
      furniture.z = calculateFurnitureZ(furniture)
    }

    // 添加到房间
    room.furniture.push(furniture)

    return { success: true, furniture }
  }

  // ========== z 轴管理 ==========

  /**
   * 调整家具 z 值（手动）
   * @param {Object} furniture - 家具实例
   * @param {number} newZ - 新的 z 值
   */
  const setFurnitureZ = (furniture, newZ) => {
    if (!furniture) return furniture
    furniture.z = Math.max(0, Math.min(199, Number(newZ) || 0))
    return furniture
  }

  /**
   * 相对调整 z 值（上移/下移一层）
   * @param {Object} furniture - 家具实例
   * @param {string} direction - 'up' | 'down'
   */
  const adjustFurnitureZRelative = (furniture, direction = 'up') => {
    if (!furniture) return furniture
    const delta = direction === 'up' ? 10 : -10
    furniture.z = Math.max(0, Math.min(199, furniture.z + delta))
    return furniture
  }

  /**
   * 重置家具 z 值（自动计算）
   * @param {Object} furniture - 家具实例
   */
  const resetFurnitureZ = (furniture) => {
    if (!furniture) return furniture
    furniture.z = calculateFurnitureZ(furniture)
    return furniture
  }

  /**
   * 重新计算所有家具的 z 值（用于位置变化后）
   * @param {Object[]} furnitureList - 家具列表
   */
  const recalculateAllZ = (furnitureList) => {
    if (!Array.isArray(furnitureList)) return furnitureList
    furnitureList.forEach(f => {
      f.z = calculateFurnitureZ(f)
    })
    return furnitureList
  }

  /**
   * 按渲染顺序排序家具（z轴 + y坐标）
   * @param {Object[]} furnitureList - 家具列表
   * @returns {Object[]} 排序后的列表
   */
  const sortFurnitureForRender = (furnitureList) => {
    if (!Array.isArray(furnitureList)) return []
    return furnitureList.slice().sort((a, b) => {
      // 先按 z 值排序
      const zA = a.z ?? calculateFurnitureZ(a)
      const zB = b.z ?? calculateFurnitureZ(b)
      if (zA !== zB) return zA - zB
      // z 值相同时按 y 坐标排序（y 大的渲染在上层）
      return (a.y || 0) - (b.y || 0)
    })
  }

  // ========== 预设家具选择 ==========

  /**
   * 获取预设家具列表（用于UI选择）
   */
  const getPresetsList = () => {
    return FURNITURE_CATALOG.map(f => ({
      id: f.id,
      name: f.name,
      kind: f.kind,
      width: f.width,
      height: f.height,
      defaultZ: calculateFurnitureZ(f),
      needsSatisfied: f.needsSatisfied,
      interactionType: f.interactionType,
    }))
  }

  /**
   * 从预设创建家具实例
   * @param {string} presetId - 预设ID
   * @param {Object} options - 配置选项
   */
  const createFurnitureFromPreset = (presetId, options = {}) => {
    const preset = FURNITURE_CATALOG.find(f => f.id === presetId)
    if (!preset) {
      return { error: 'preset_not_found', furniture: null }
    }

    const furniture = furnitureEngine.createFurnitureInstance(preset, options.x || 0, options.y || 0)

    // 应用自定义配置
    if (options.name) furniture.name = options.name
    if (options.z !== undefined) furniture.z = options.z
    else furniture.z = calculateFurnitureZ(furniture)

    return { error: null, furniture }
  }

  // ========== 多格子家具处理 ==========

  /**
   * 获取家具占用的所有格子坐标
   * @param {Object} furniture - 家具实例
   * @returns {Object[]} 格子坐标列表 [{x, y}, ...]
   */
  const getOccupiedCells = (furniture) => {
    const cells = []
    const startX = furniture?.x || 0
    const startY = furniture?.y || 0
    const width = furniture?.width || 1
    const height = furniture?.height || 1

    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        cells.push({
          x: startX + dx,
          y: startY + dy,
        })
      }
    }
    return cells
  }

  /**
   * 计算家具渲染尺寸（CSS像素）
   * @param {Object} furniture - 家具实例
   * @returns {Object} {width, height} CSS像素尺寸
   */
  const calculateRenderSize = (furniture) => {
    const cellWidth = furniture?.width || 1
    const cellHeight = furniture?.height || 1
    return {
      width: cellWidth * ROOM_CELL_SIZE,
      height: cellHeight * ROOM_CELL_SIZE,
    }
  }

  /**
   * 计算家具渲染位置（CSS像素）
   * @param {Object} furniture - 家具实例
   * @returns {Object} {left, top} CSS像素位置
   */
  const calculateRenderPosition = (furniture) => {
    return {
      left: (furniture?.x || 0) * ROOM_CELL_SIZE,
      top: (furniture?.y || 0) * ROOM_CELL_SIZE,
    }
  }

  // ========== 导出 ==========

  return {
    // PNG 导入
    createFurnitureFromPng,
    addImportedFurnitureToRoom,

    // z轴管理
    setFurnitureZ,
    adjustFurnitureZRelative,
    resetFurnitureZ,
    recalculateAllZ,
    sortFurnitureForRender,
    calculateFurnitureZ,

    // 预设
    getPresetsList,
    createFurnitureFromPreset,

    // 多格子处理
    getOccupiedCells,
    calculateRenderSize,
    calculateRenderPosition,

    // 常量
    Z_LAYER_RULES,
  }
}

export default createFurnitureImportManager