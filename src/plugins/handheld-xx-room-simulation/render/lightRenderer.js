// 光照渲染器 - Canvas 绘制光照遮罩层

import {
  LIGHT_MASK_COLOR,
  LIGHT_MASK_COLOR_DAY,
  LIGHT_COLOR_PRESETS,
} from '../config/lightConstants.js'
import { ROOM_CELL_SIZE } from '../config/constants.js'

export const createLightRenderer = (deps = {}) => {
  const { cellSize = ROOM_CELL_SIZE } = deps

  let canvas = null
  let ctx = null
  let lastWidth = 0
  let lastHeight = 0

  /**
   * 创建或获取 Canvas
   * @param {number} width - 宽度（像素）
   * @param {number} height - 高度（像素）
   * @returns {HTMLCanvasElement}
   */
  const createCanvas = (width, height) => {
    if (!canvas || lastWidth !== width || lastHeight !== height) {
      canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.style.position = 'absolute'
      canvas.style.top = '0'
      canvas.style.left = '0'
      canvas.style.pointerEvents = 'none'  // 不阻挡交互
      // z-index 由容器控制，Canvas 在容器内部
      ctx = canvas.getContext('2d')
      lastWidth = width
      lastHeight = height
    }
    return canvas
  }

  /**
   * 渲染光照遮罩
   * @param {Object} room - 房间数据
   * @param {Array} lightSources - 光源列表
   * @param {number} ambientLight - 环境光强度 (0-1)
   * @param {number} time - 当前时间（毫秒，用于闪烁效果）
   * @param {Object} options - 可选参数 { canvasWidth, canvasHeight }
   * @returns {HTMLCanvasElement}
   */
  const renderLightMask = (room, lightSources, ambientLight, time = 0, options = {}) => {
    // 使用传入的画布尺寸，或从房间数据计算
    const width = options.canvasWidth || (room.width || 24) * cellSize
    const height = options.canvasHeight || (room.height || 16) * cellSize

    createCanvas(width, height)

    // 清空
    ctx.clearRect(0, 0, width, height)

    // 如果是白天（环境光 >= 1），不需要遮罩
    if (ambientLight >= 1) {
      return canvas
    }

    // 计算遮罩透明度（环境光越低，遮罩越暗）
    // ambientLight = 1 → maskOpacity = 0 (全亮)
    // ambientLight = 0.3 → maskOpacity = 0.7 (很暗)
    const maskOpacity = Math.max(0, Math.min(1, 1 - ambientLight))

    // 填充半透明黑色遮罩
    ctx.fillStyle = `rgba(10, 10, 30, ${maskOpacity})`
    ctx.fillRect(0, 0, width, height)

    // 如果没有光源，直接返回
    if (!lightSources || lightSources.length === 0) {
      return canvas
    }

    // 为每个光源"挖洞"（渐变透明）
    ctx.globalCompositeOperation = 'destination-out'

    for (const source of lightSources) {
      renderLightSource(ctx, source, ambientLight, time)
    }

    // 如果有颜色，添加光晕效果
    ctx.globalCompositeOperation = 'source-over'
    for (const source of lightSources) {
      renderLightGlow(ctx, source, ambientLight, time)
    }

    return canvas
  }

  /**
   * 渲染单个光源（挖洞效果）
   */
  const renderLightSource = (ctx, source, ambientLight, time) => {
    const x = source.pixelX || source.x * cellSize + cellSize / 2
    const y = source.pixelY || source.y * cellSize + cellSize / 2
    const radius = source.radius * cellSize

    // 计算当前强度（考虑闪烁）
    let intensity = source.intensity
    if (source.flicker) {
      const flickerSpeed = source.flickerSpeed || 2
      const flickerAmount = source.flickerAmount || 0.15
      const phase = source.flickerPhase || 0
      const t = (time / 1000) * flickerSpeed + phase
      const flicker = Math.sin(t * Math.PI * 2) * flickerAmount + flickerAmount
      intensity = source.intensity * (1 - flicker * 0.5)
    }

    // 光源强度决定"挖洞"深度
    // intensity = 1 → 中心完全透明（100%挖掉）
    // intensity = 0.3 → 中心部分透明（30%挖掉）
    const holeIntensity = intensity * (1 - ambientLight)  // 环境光越暗，光源效果越明显

    // 渐变半径
    const innerRadius = radius * 0.3
    const outerRadius = radius

    // 创建渐变
    const gradient = ctx.createRadialGradient(x, y, innerRadius, x, y, outerRadius)
    gradient.addColorStop(0, `rgba(0, 0, 0, ${holeIntensity})`)  // 中心透明
    gradient.addColorStop(0.5, `rgba(0, 0, 0, ${holeIntensity * 0.4})`)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')  // 边缘不透明

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, outerRadius, 0, Math.PI * 2)
    ctx.fill()
  }

  /**
   * 渲染光晕效果（添加颜色）
   */
  const renderLightGlow = (ctx, source, ambientLight, time) => {
    // 只有在环境光较低时才显示光晕
    if (ambientLight > 0.7) return

    const x = source.pixelX || source.x * cellSize + cellSize / 2
    const y = source.pixelY || source.y * cellSize + cellSize / 2
    const radius = source.radius * cellSize * 0.8

    // 解析颜色
    const colorHex = source.color || '#ffaa44'
    const color = parseColor(colorHex)

    // 光晕透明度
    const glowIntensity = Math.max(0, 0.05 * (1 - ambientLight) * source.intensity)

    // 渐变光晕
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${glowIntensity})`)
    gradient.addColorStop(0.5, `rgba(${color.r}, ${color.g}, ${color.b}, ${glowIntensity * 0.3})`)
    gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`)

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  /**
   * 解析颜色为 RGB
   */
  const parseColor = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (result) {
      return {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    }
    // 默认暖黄色
    return { r: 255, g: 170, b: 68 }
  }

  /**
   * 获取 Canvas 元素
   */
  const getCanvas = () => canvas

  /**
   * 销毁 Canvas
   */
  const destroy = () => {
    canvas = null
    ctx = null
    lastWidth = 0
    lastHeight = 0
  }

  return {
    createCanvas,
    renderLightMask,
    getCanvas,
    destroy,
    parseColor,
  }
}

export default createLightRenderer