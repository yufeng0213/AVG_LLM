// 房间生成 - LLM + 本地 fallback

import { createRoomEngine } from './roomEngine.js'
import { createRoomFurnitureEngine, FURNITURE_CATALOG } from './roomFurnitureEngine.js'
import { ROOM_DEFAULT_WIDTH, ROOM_DEFAULT_HEIGHT } from '../../config/constants.js'

const ROOM_THEME_NAMES = ['温馨小屋', '工坊', '实验室', '休息室', '厨房', '图书馆', '花园']

export const createRoomGeneration = (deps = {}) => {
  const roomEngine = deps.roomEngine || createRoomEngine()
  const furnitureEngine = deps.furnitureEngine || createRoomFurnitureEngine()

  // 生成默认房间
  const generateDefaultRoom = (width = ROOM_DEFAULT_WIDTH, height = ROOM_DEFAULT_HEIGHT) => {
    return roomEngine.createDefaultRoomMap()
  }

  // 生成带家具的房间
  const generateRoomWithFurniture = (options = {}) => {
    const {
      width = ROOM_DEFAULT_WIDTH,
      height = ROOM_DEFAULT_HEIGHT,
      furnitureCount = 6,
      theme = '温馨小屋',
    } = options

    const room = roomEngine.createDefaultRoomMap()

    // 根据主题选择家具
    const furnitureForTheme = selectFurnitureForTheme(theme)

    // 自动放置家具
    for (let i = 0; i < Math.min(furnitureCount, furnitureForTheme.length); i++) {
      const catalogItem = furnitureForTheme[i]
      const instance = furnitureEngine.autoPlaceFurniture(room, catalogItem)
      if (instance) {
        room.furniture.push(instance)
      }
    }

    return room
  }

  // 根据主题选择家具
  const selectFurnitureForTheme = (theme) => {
    const themeLower = String(theme || '').toLowerCase()

    if (themeLower.includes('工坊') || themeLower.includes('workshop')) {
      return FURNITURE_CATALOG.filter(f =>
        f.kind === 'work' || f.kind === 'storage'
      ).slice(0, 6)
    }

    if (themeLower.includes('实验室') || themeLower.includes('lab')) {
      return FURNITURE_CATALOG.filter(f =>
        f.kind === 'work' || f.kind === 'storage' || f.id === 'shelf-book'
      ).slice(0, 6)
    }

    if (themeLower.includes('休息') || themeLower.includes('rest')) {
      return FURNITURE_CATALOG.filter(f =>
        f.kind === 'sleep' || f.kind === 'decor'
      ).slice(0, 6)
    }

    if (themeLower.includes('厨房') || themeLower.includes('kitchen')) {
      return FURNITURE_CATALOG.filter(f =>
        f.kind === 'food' || f.kind === 'work' && f.workType === 'cooking'
      ).slice(0, 6)
    }

    if (themeLower.includes('图书馆') || themeLower.includes('library')) {
      return FURNITURE_CATALOG.filter(f =>
        f.id === 'shelf-book' || f.kind === 'work' || f.kind === 'decor'
      ).slice(0, 6)
    }

    if (themeLower.includes('花园') || themeLower.includes('garden')) {
      return FURNITURE_CATALOG.filter(f =>
        f.kind === 'decor' || f.id === 'plant-decor'
      ).slice(0, 6)
    }

    // 默认温馨小屋
    return [
      FURNITURE_CATALOG.find(f => f.id === 'bed-single') || FURNITURE_CATALOG[0],
      FURNITURE_CATALOG.find(f => f.id === 'table-dining') || FURNITURE_CATALOG[5],
      FURNITURE_CATALOG.find(f => f.id === 'chair-simple') || FURNITURE_CATALOG[6],
      FURNITURE_CATALOG.find(f => f.id === 'desk-work') || FURNITURE_CATALOG[2],
      FURNITURE_CATALOG.find(f => f.id === 'plant-decor') || FURNITURE_CATALOG[8],
      FURNITURE_CATALOG.find(f => f.id === 'lamp-floor') || FURNITURE_CATALOG[9],
    ].filter(Boolean)
  }

  // LLM 生成房间布局（带 fallback）
  const generateRoomWithFallback = async (options = {}) => {
    const {
      requestRoom = null,
      width = ROOM_DEFAULT_WIDTH,
      height = ROOM_DEFAULT_HEIGHT,
      theme = '温馨小屋',
      logger = console,
    } = options

    let room = null
    let usedLLM = false

    // 尝试 LLM 生成
    if (typeof requestRoom === 'function') {
      try {
        const llmResult = await requestRoom({
          width,
          height,
          theme,
        })

        if (llmResult?.success && llmResult?.room) {
          room = roomEngine.normalizeRoomMap(llmResult.room)
          usedLLM = true
        }
      } catch (e) {
        logger.warn('[room-sim] LLM room generation failed, fallback to local:', e)
      }
    }

    // Fallback 到本地生成
    if (!usedLLM) {
      room = generateRoomWithFurniture({ width, height, theme })
    }

    return { room, usedLLM }
  }

  // 从 WorldBook 提取房间主题
  const inferThemeFromWorldBook = (worldBook) => {
    const summary = String(worldBook?.summary || worldBook?.title || '').toLowerCase()

    if (summary.includes('工坊') || summary.includes('workshop')) return '工坊'
    if (summary.includes('实验室') || summary.includes('lab')) return '实验室'
    if (summary.includes('厨房') || summary.includes('kitchen')) return '厨房'
    if (summary.includes('图书馆') || summary.includes('library')) return '图书馆'
    if (summary.includes('花园') || summary.includes('garden')) return '花园'
    if (summary.includes('休息') || summary.includes('rest')) return '休息室'

    return '温馨小屋'
  }

  return {
    generateDefaultRoom,
    generateRoomWithFurniture,
    selectFurnitureForTheme,
    generateRoomWithFallback,
    inferThemeFromWorldBook,
    ROOM_THEME_NAMES,
  }
}

export default createRoomGeneration