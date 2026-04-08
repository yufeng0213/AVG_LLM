/**
 * 卡片服务模块
 * 负责加载卡片配置、随机抽取卡片模板
 */

import { kvStorage } from '../storage/index.js'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'

// 默认卡片配置路径
const DEFAULT_CARD_CONFIG_PATH = './data/cards/index.json'
const DEFAULT_CARD_BASE_DIR = './data/cards/'
const CARD_CONFIG_STORAGE_KEY = 'card_config_path'
const CARD_BASE_DIR_KEY = 'card_base_dir'  // 存储卡片基础目录路径
const NATIVE_CARD_BASE_PREFIX = 'native://'

// 内存中的卡片配置缓存
let cachedCardIndex = null
let cachedBaseDir = null

const normalizeBaseDir = (baseDir) => {
  const normalized = String(baseDir || '').trim()
  if (!normalized) {
    return ''
  }
  return normalized.endsWith('/') ? normalized : `${normalized}/`
}

const isNativeCardBaseDir = (baseDir) => {
  return typeof baseDir === 'string' && baseDir.startsWith(NATIVE_CARD_BASE_PREFIX)
}

const resolveNativeDataPath = (baseDir, relativePath = '') => {
  const normalizedBase = normalizeBaseDir(baseDir)
  const nativeBase = normalizedBase.slice(NATIVE_CARD_BASE_PREFIX.length).replace(/^\/+/, '')
  const normalizedRelative = String(relativePath || '').replace(/^\/+/, '')
  return `${nativeBase}${normalizedRelative}`
}

const readNativeTextFile = async (baseDir, relativePath) => {
  const path = resolveNativeDataPath(baseDir, relativePath)
  const result = await Filesystem.readFile({
    path,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
  })
  return String(result?.data || '')
}

/**
 * 获取卡片配置路径（用于显示）
 * @returns {Promise<string>} 卡片配置路径
 */
export const getCardConfigPath = async () => {
  try {
    const customPath = await kvStorage.get(CARD_CONFIG_STORAGE_KEY)
    return customPath || DEFAULT_CARD_CONFIG_PATH
  } catch {
    return DEFAULT_CARD_CONFIG_PATH
  }
}

/**
 * 获取卡片基础目录路径
 * @returns {Promise<string>} 卡片基础目录路径
 */
export const getCardBaseDir = async () => {
  try {
    const customDir = await kvStorage.get(CARD_BASE_DIR_KEY)
    return customDir || DEFAULT_CARD_BASE_DIR
  } catch {
    return DEFAULT_CARD_BASE_DIR
  }
}

/**
 * 设置卡片配置路径和基础目录
 * @param {string} configPath - 配置文件完整路径（如 ./data/cards/index.json）
 * @param {string} baseDir - 基础目录路径（如 ./data/cards/）
 */
export const setCardConfigPath = async (configPath, baseDir = null) => {
  await kvStorage.set(CARD_CONFIG_STORAGE_KEY, configPath)
  if (baseDir) {
    await kvStorage.set(CARD_BASE_DIR_KEY, baseDir)
    cachedBaseDir = baseDir
    cachedCardIndex = null
  }
}

/**
 * 设置自定义卡片配置（用于用户选择的本地文件）
 * @param {string} baseDir - 卡片基础目录路径（index.json所在目录）
 * @param {string} sourceName - 来源名称（用于显示）
 */
export const setCustomCardConfig = async (baseDir, sourceName = '自定义') => {
  try {
    await kvStorage.set(CARD_BASE_DIR_KEY, baseDir)
    await kvStorage.set(CARD_CONFIG_STORAGE_KEY, sourceName)
    cachedBaseDir = baseDir
    // 清除缓存的索引数据，下次加载时会从新路径读取
    cachedCardIndex = null
    return true
  } catch (error) {
    console.error('保存自定义卡片配置失败:', error)
    return false
  }
}

/**
 * 清除自定义卡片配置，恢复默认
 */
export const clearCustomCardConfig = async () => {
  try {
    await kvStorage.remove(CARD_BASE_DIR_KEY)
    await kvStorage.remove(CARD_CONFIG_STORAGE_KEY)
    cachedCardIndex = null
    cachedBaseDir = null
  } catch (error) {
    console.error('清除自定义卡片配置失败:', error)
  }
}

/**
 * 加载卡片索引配置
 * @returns {Promise<Object|null>} 卡片配置对象
 */
export const loadCardIndex = async () => {
  // 如果有内存缓存，直接返回
  if (cachedCardIndex) {
    return cachedCardIndex
  }
  
  // 获取基础目录，构建index.json路径
  const rawBaseDir = await getCardBaseDir()
  const baseDir = normalizeBaseDir(rawBaseDir)
  const configPath = `${baseDir}index.json`
  
  try {
    if (isNativeCardBaseDir(baseDir)) {
      const text = await readNativeTextFile(baseDir, 'index.json')
      const config = JSON.parse(text)
      cachedCardIndex = config
      return config
    }

    const response = await fetch(configPath)
    if (!response.ok) {
      console.error(`加载卡片配置失败: ${response.status}，路径: ${configPath}`)
      return null
    }
    
    const config = await response.json()
    cachedCardIndex = config
    return config
  } catch (error) {
    console.error(`加载卡片配置失败: ${error.message}，路径: ${configPath}`)
    return null
  }
}

/**
 * 获取所有可用卡片ID列表
 * @param {Object} cardIndex - 卡片索引配置
 * @returns {Array<string>} 卡片ID列表
 */
export const getAllCardIds = (cardIndex) => {
  if (!cardIndex || !cardIndex.cards) {
    return []
  }
  return Object.keys(cardIndex.cards)
}

/**
 * 根据稀有度权重随机选择卡片
 * @param {Object} cardIndex - 卡片索引配置
 * @returns {string|null} 选中的卡片ID
 */
export const getRandomCardId = (cardIndex) => {
  const cardIds = getAllCardIds(cardIndex)
  if (cardIds.length === 0) {
    return null
  }

  // 构建权重列表
  const weightedCards = []
  const rarityLevels = cardIndex.rarityLevels || {}
  const defaultProbability = cardIndex.settings?.defaultProbability || 0.03

  for (const cardId of cardIds) {
    const card = cardIndex.cards[cardId]
    const rarity = card.rarity || 'common'
    const probability = rarityLevels[rarity]?.probability || defaultProbability
    
    // 将概率转换为权重（概率越高，权重越大）
    // 使用概率值乘以100作为权重基数
    const weight = Math.max(1, Math.round(probability * 100))
    weightedCards.push({ cardId, weight })
  }

  // 计算总权重
  const totalWeight = weightedCards.reduce((sum, item) => sum + item.weight, 0)
  
  // 随机选择
  let randomValue = Math.random() * totalWeight
  for (const item of weightedCards) {
    randomValue -= item.weight
    if (randomValue <= 0) {
      return item.cardId
    }
  }

  // 如果权重计算失败，简单随机返回一个
  return cardIds[Math.floor(Math.random() * cardIds.length)]
}

/**
 * 加载单个卡片的prompt配置
 * @param {string} cardId - 卡片ID
 * @returns {Promise<Object|null>} 卡片prompt配置
 */
export const loadCardPromptConfig = async (cardId) => {
  const rawBaseDir = await getCardBaseDir()
  const baseDir = normalizeBaseDir(rawBaseDir)
  const promptPath = `${baseDir}${cardId}/prompt.json`
  
  try {
    if (isNativeCardBaseDir(baseDir)) {
      const text = await readNativeTextFile(baseDir, `${cardId}/prompt.json`)
      return JSON.parse(text)
    }

    const response = await fetch(promptPath)
    if (!response.ok) {
      console.error(`加载卡片prompt失败: ${response.status}，路径: ${promptPath}`)
      return null
    }
    
    const config = await response.json()
    return config
  } catch (error) {
    console.error(`加载卡片prompt失败: ${error.message}，路径: ${promptPath}`)
    return null
  }
}

/**
 * 加载卡片HTML模板
 * @param {string} cardId - 卡片ID
 * @returns {Promise<string|null>} HTML模板内容
 */
export const loadCardTemplate = async (cardId) => {
  const rawBaseDir = await getCardBaseDir()
  const baseDir = normalizeBaseDir(rawBaseDir)
  const templatePath = `${baseDir}${cardId}/index.html`
  
  try {
    if (isNativeCardBaseDir(baseDir)) {
      return await readNativeTextFile(baseDir, `${cardId}/index.html`)
    }

    const response = await fetch(templatePath)
    if (!response.ok) {
      console.error(`加载卡片模板失败: ${response.status}，路径: ${templatePath}`)
      return null
    }
    
    const html = await response.text()
    return html
  } catch (error) {
    console.error(`加载卡片模板失败: ${error.message}，路径: ${templatePath}`)
    return null
  }
}

/**
 * 获取卡片基本信息
 * @param {Object} cardIndex - 卡片索引配置
 * @param {string} cardId - 卡片ID
 * @returns {Object|null} 卡片基本信息
 */
export const getCardInfo = (cardIndex, cardId) => {
  if (!cardIndex || !cardIndex.cards || !cardIndex.cards[cardId]) {
    return null
  }
  
  const card = cardIndex.cards[cardId]
  const category = cardIndex.categories?.[card.category]
  const rarity = cardIndex.rarityLevels?.[card.rarity]
  
  return {
    id: cardId,
    name: card.name,
    category: card.category,
    categoryName: category?.name || card.category,
    categoryIcon: category?.icon || '📄',
    rarity: card.rarity,
    rarityName: rarity?.name || card.rarity,
    rarityColor: rarity?.color || '#95a5a6',
    preview: card.preview,
    collectible: card.collectible !== false,
  }
}

/**
 * 随机抽取一张卡片并加载其完整配置
 * @returns {Promise<Object|null>} 完整卡片配置
 */
export const drawRandomCard = async () => {
  const cardIndex = await loadCardIndex()
  if (!cardIndex) {
    return null
  }
  
  const cardId = getRandomCardId(cardIndex)
  if (!cardId) {
    return null
  }
  
  const cardInfo = getCardInfo(cardIndex, cardId)
  const promptConfig = await loadCardPromptConfig(cardId)
  const templateHtml = await loadCardTemplate(cardId)
  
  return {
    ...cardInfo,
    promptConfig,
    templateHtml,
  }
}

export default {
  getCardConfigPath,
  setCardConfigPath,
  loadCardIndex,
  getAllCardIds,
  getRandomCardId,
  loadCardPromptConfig,
  loadCardTemplate,
  getCardInfo,
  drawRandomCard,
}
