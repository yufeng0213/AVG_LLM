// 光照计算器 - 计算光源分布和叠加效果

import {
  MAX_LIGHT_SOURCES,
  LIGHT_RADIUS_MIN,
  LIGHT_RADIUS_MAX,
  TIME_AMBIENT_LIGHT_MAP,
} from '../../config/lightConstants.js'

export const createLightCalculator = (deps = {}) => {
  const { cellSize = 64 } = deps

  /**
   * 从房间提取所有光源
   * @param {Object} room - 房间数据
   * @returns {Array} 光源列表
   */
  const extractLightSources = (room) => {
    if (!room || !Array.isArray(room.furniture)) {
      return []
    }

    const sources = []
    for (const furniture of room.furniture) {
      if (!furniture.lightSource?.enabled) continue
      if (sources.length >= MAX_LIGHT_SOURCES) break

      // 获取家具有效尺寸（考虑旋转）
      const effectiveSize = getEffectiveSize(furniture)

      // 光源位置为家具中心
      const centerX = furniture.x + effectiveSize.width / 2
      const centerY = furniture.y + effectiveSize.height / 2

      sources.push({
        id: furniture.id,
        x: centerX,
        y: centerY,
        pixelX: centerX * cellSize,
        pixelY: centerY * cellSize,
        radius: clampRadius(furniture.lightSource.radius),
        intensity: clampIntensity(furniture.lightSource.intensity),
        color: furniture.lightSource.color || '#ffaa44',
        flicker: furniture.lightSource.flicker || false,
        flickerPhase: Math.random() * Math.PI * 2,  // 随机相位
      })
    }

    return sources
  }

  /**
   * 获取家具有效尺寸（考虑旋转）
   */
  const getEffectiveSize = (furniture) => {
    const rotation = furniture.rotation || 0
    if (rotation === 90 || rotation === 270) {
      return { width: furniture.height || 1, height: furniture.width || 1 }
    }
    return { width: furniture.width || 1, height: furniture.height || 1 }
  }

  /**
   * 限制光照半径
   */
  const clampRadius = (radius) => {
    const r = Number(radius) || LIGHT_RADIUS_DEFAULT
    return Math.max(LIGHT_RADIUS_MIN, Math.min(LIGHT_RADIUS_MAX, r))
  }

  /**
   * 限制光照强度
   */
  const clampIntensity = (intensity) => {
    const i = Number(intensity) || 0.8
    return Math.max(0.3, Math.min(1.0, i))
  }

  /**
   * 根据时间段获取环境光强度
   * @param {string} dayPhase - 时间段
   * @returns {number} 环境光强度 (0-1)
   */
  const getAmbientLightForTime = (dayPhase) => {
    return TIME_AMBIENT_LIGHT_MAP[dayPhase] || 1.0
  }

  /**
   * 根据小时获取环境光强度（平滑过渡）
   * @param {number} hour - 小时 (0-23)
   * @returns {number} 环境光强度 (0-1)
   */
  const getAmbientLightForHour = (hour) => {
    // 6-12: 早晨 (1.0 → 1.0)
    // 12-18: 下午 (1.0 → 0.6)
    // 18-22: 傍晚 (0.6 → 0.3)
    // 22-6: 夜晚 (0.3 → 0.3 → 1.0)

    const h = Math.max(0, Math.min(23, hour))

    if (h >= 6 && h < 12) return 1.0
    if (h >= 12 && h < 18) {
      // 下午渐暗
      const t = (h - 12) / 6  // 0 → 1
      return 1.0 - t * 0.4    // 1.0 → 0.6
    }
    if (h >= 18 && h < 22) {
      // 傍晚渐暗
      const t = (h - 18) / 4  // 0 → 1
      return 0.6 - t * 0.3    // 0.6 → 0.3
    }
    if (h >= 22) {
      // 深夜
      return 0.3
    }
    // 0-6: 黎明渐亮
    const t = h / 6  // 0 → 1
    return 0.3 + t * 0.7  // 0.3 → 1.0
  }

  /**
   * 计算指定点的光照值
   * @param {Array} sources - 光源列表
   * @param {number} x - 点的格子 x
   * @param {number} y - 点的格子 y
   * @returns {number} 光照值 (0-1)
   */
  const calculateLightAtPoint = (sources, x, y) => {
    let totalLight = 0

    for (const source of sources) {
      const dx = x - source.x
      const dy = y - source.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance <= source.radius) {
        // 距离越近，光照越强
        const falloff = 1 - (distance / source.radius)
        totalLight += source.intensity * falloff * falloff  // 平方衰减更自然
      }
    }

    // 限制最大值为 1
    return Math.min(1, totalLight)
  }

  /**
   * 计算光源闪烁时的当前强度
   * @param {Object} source - 光源
   * @param {number} time - 当前时间（毫秒）
   * @returns {number} 闪烁后的强度
   */
  const calculateFlickerIntensity = (source, time) => {
    if (!source.flicker) return source.intensity

    // 使用正弦函数产生闪烁效果
    const flickerSpeed = source.flickerSpeed || 2  // 每秒闪烁次数
    const flickerAmount = source.flickerAmount || 0.2  // 闪烁幅度
    const phase = source.flickerPhase || 0

    const t = (time / 1000) * flickerSpeed + phase
    const flicker = Math.sin(t * Math.PI * 2) * flickerAmount + flickerAmount

    return source.intensity * (1 - flicker)
  }

  /**
   * 生成光照分布图（每个格子的光照值）
   * @param {Object} room - 房间
   * @param {Array} sources - 光源列表
   * @returns {Map} 光照分布图 key: "x:y", value: 光照值
   */
  const generateLightMap = (room, sources) => {
    if (!room) return new Map()

    const lightMap = new Map()
    const width = room.width || 24
    const height = room.height || 16

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const light = calculateLightAtPoint(sources, x, y)
        lightMap.set(`${x}:${y}`, light)
      }
    }

    return lightMap
  }

  return {
    extractLightSources,
    getAmbientLightForTime,
    getAmbientLightForHour,
    calculateLightAtPoint,
    calculateFlickerIntensity,
    generateLightMap,
    clampRadius,
    clampIntensity,
  }
}

// 默认常量
const LIGHT_RADIUS_DEFAULT = 3

export default createLightCalculator