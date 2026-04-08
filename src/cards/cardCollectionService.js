/**
 * 卡片收藏服务
 * 管理卡片收藏的保存、加载、删除和导出功能
 */

import { kvStorage } from '../storage/index'

// 存储键
const COLLECTION_KEY = 'card_collection'

/**
 * 生成唯一的收藏ID
 * @returns {string} 收藏ID
 */
const generateCollectionId = () => {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '')
  const random = Math.random().toString(36).substring(2, 6)
  return `card_${timestamp}_${random}`
}

/**
 * 保存卡片到收藏
 * @param {Object} cardData - 卡片数据（来自 drawRandomCard）
 * @param {Object} cardContent - 卡片内容（来自 LLM 生成）
 * @param {Object} metadata - 可选的元数据
 * @returns {Promise<{success: boolean, collectionId?: string, error?: string}>}
 */
export const saveCardToCollection = async (cardData, cardContent, metadata = {}) => {
  try {
    if (!cardData || !cardContent) {
      return { success: false, error: '卡片数据缺失' }
    }
    
    // 获取现有收藏
    const collection = await getCollection()
    
    // 创建收藏记录
    const collectionItem = {
      collectionId: generateCollectionId(),
      cardTemplateId: cardData.id || '',
      cardName: cardData.name || '未知卡片',
      category: cardData.category || '',
      categoryName: cardData.categoryName || '',
      categoryIcon: cardData.categoryIcon || '📄',
      rarity: cardData.rarity || 'common',
      rarityName: cardData.rarityName || '普通',
      rarityColor: cardData.rarityColor || '#95a5a6',
      content: cardContent,
      templateHtml: cardData.templateHtml || '',
      createdAt: new Date().toISOString(),
      gameTime: metadata.gameTime || '',
      sceneName: metadata.sceneName || '',
      tags: metadata.tags || [],
      isFavorite: false,
      notes: '',
    }
    
    // 添加到收藏列表
    collection.items.push(collectionItem)
    collection.totalCount = collection.items.length
    collection.updatedAt = new Date().toISOString()
    
    // 更新统计
    updateCollectionStats(collection)
    
    // 保存
    await kvStorage.set(COLLECTION_KEY, collection)
    
    return { success: true, collectionId: collectionItem.collectionId }
  } catch (error) {
    console.error('保存卡片失败:', error)
    return { success: false, error: error.message || '保存失败' }
  }
}

/**
 * 获取所有收藏卡片
 * @returns {Promise<Object>} 收藏数据
 */
export const getCollection = async () => {
  try {
    const collection = await kvStorage.get(COLLECTION_KEY)
    if (!collection) {
      return {
        items: [],
        totalCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stats: {
          byRarity: {},
          byCategory: {},
        },
      }
    }
    return collection
  } catch (error) {
    console.error('获取收藏失败:', error)
    return {
      items: [],
      totalCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stats: {},
    }
  }
}

/**
 * 获取单个收藏卡片
 * @param {string} collectionId - 收藏ID
 * @returns {Promise<Object|null>} 卡片数据
 */
export const getCardFromCollection = async (collectionId) => {
  try {
    const collection = await getCollection()
    return collection.items.find(item => item.collectionId === collectionId) || null
  } catch (error) {
    console.error('获取卡片失败:', error)
    return null
  }
}

/**
 * 删除收藏卡片
 * @param {string} collectionId - 收藏ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const deleteCardFromCollection = async (collectionId) => {
  try {
    const collection = await getCollection()
    const index = collection.items.findIndex(item => item.collectionId === collectionId)
    
    if (index === -1) {
      return { success: false, error: '卡片不存在' }
    }
    
    collection.items.splice(index, 1)
    collection.totalCount = collection.items.length
    collection.updatedAt = new Date().toISOString()
    
    // 更新统计
    updateCollectionStats(collection)
    
    await kvStorage.set(COLLECTION_KEY, collection)
    
    return { success: true }
  } catch (error) {
    console.error('删除卡片失败:', error)
    return { success: false, error: error.message || '删除失败' }
  }
}

/**
 * 更新收藏卡片（添加标签、备注等）
 * @param {string} collectionId - 收藏ID
 * @param {Object} updates - 更新内容
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const updateCardInCollection = async (collectionId, updates) => {
  try {
    const collection = await getCollection()
    const item = collection.items.find(item => item.collectionId === collectionId)
    
    if (!item) {
      return { success: false, error: '卡片不存在' }
    }
    
    // 允许更新的字段
    const allowedFields = ['tags', 'notes', 'isFavorite']
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        item[field] = updates[field]
      }
    }
    
    collection.updatedAt = new Date().toISOString()
    
    await kvStorage.set(COLLECTION_KEY, collection)
    
    return { success: true }
  } catch (error) {
    console.error('更新卡片失败:', error)
    return { success: false, error: error.message || '更新失败' }
  }
}

/**
 * 筛选卡片
 * @param {Object} filters - 筛选条件
 * @returns {Promise<Array>} 筛选结果
 */
export const filterCards = async (filters = {}) => {
  try {
    const collection = await getCollection()
    let items = collection.items
    
    // 按稀有度筛选
    if (filters.rarity && filters.rarity !== 'all') {
      items = items.filter(item => item.rarity === filters.rarity)
    }
    
    // 按类型筛选
    if (filters.category && filters.category !== 'all') {
      items = items.filter(item => item.category === filters.category)
    }
    
    // 按收藏筛选
    if (filters.isFavorite) {
      items = items.filter(item => item.isFavorite)
    }
    
    // 搜索关键词
    if (filters.search) {
      const keyword = filters.search.toLowerCase()
      items = items.filter(item => {
        const nameMatch = item.cardName.toLowerCase().includes(keyword)
        const contentMatch = JSON.stringify(item.content).toLowerCase().includes(keyword)
        const notesMatch = item.notes.toLowerCase().includes(keyword)
        return nameMatch || contentMatch || notesMatch
      })
    }
    
    // 排序
    if (filters.sortBy) {
      const sortField = filters.sortBy
      const sortOrder = filters.sortOrder === 'asc' ? 1 : -1
      
      items.sort((a, b) => {
        if (sortField === 'createdAt') {
          return sortOrder * (new Date(a.createdAt) - new Date(b.createdAt))
        }
        if (sortField === 'rarity') {
          // 按稀有度等级排序
          const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'special', 'seasonal']
          const aIndex = rarityOrder.indexOf(a.rarity)
          const bIndex = rarityOrder.indexOf(b.rarity)
          return sortOrder * (aIndex - bIndex)
        }
        return 0
      })
    }
    
    return items
  } catch (error) {
    console.error('筛选卡片失败:', error)
    return []
  }
}

/**
 * 获取收藏统计信息
 * @returns {Promise<Object>} 统计数据
 */
export const getCollectionStats = async () => {
  try {
    const collection = await getCollection()
    return {
      totalCount: collection.totalCount,
      byRarity: collection.stats?.byRarity || {},
      byCategory: collection.stats?.byCategory || {},
      favoriteCount: collection.items.filter(item => item.isFavorite).length,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    }
  } catch (error) {
    console.error('获取统计失败:', error)
    return { totalCount: 0 }
  }
}

/**
 * 检查卡片是否已收藏（基于模板ID和内容）
 * @param {string} cardTemplateId - 卡片模板ID
 * @param {Object} cardContent - 卡片内容
 * @returns {Promise<boolean>} 是否已收藏
 */
export const isCardCollected = async (cardTemplateId, cardContent) => {
  try {
    const collection = await getCollection()
    // 简单检查：同类型卡片是否已存在
    return collection.items.some(item => 
      item.cardTemplateId === cardTemplateId && 
      JSON.stringify(item.content) === JSON.stringify(cardContent)
    )
  } catch (error) {
    return false
  }
}

/**
 * 清空所有收藏
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const clearCollection = async () => {
  try {
    await kvStorage.remove(COLLECTION_KEY)
    return { success: true }
  } catch (error) {
    console.error('清空收藏失败:', error)
    return { success: false, error: error.message || '清空失败' }
  }
}

/**
 * 更新收藏统计
 * @param {Object} collection - 收藏数据
 */
const updateCollectionStats = (collection) => {
  const byRarity = {}
  const byCategory = {}
  
  for (const item of collection.items) {
    // 按稀有度统计
    if (!byRarity[item.rarity]) {
      byRarity[item.rarity] = 0
    }
    byRarity[item.rarity]++
    
    // 按类型统计
    if (!byCategory[item.category]) {
      byCategory[item.category] = 0
    }
    byCategory[item.category]++
  }
  
  collection.stats = { byRarity, byCategory }
}

/**
 * 导出收藏数据为JSON文件
 * @returns {Promise<{success: boolean, data?: string, error?: string}>}
 */
export const exportCollectionAsJSON = async () => {
  try {
    const collection = await getCollection()
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      collection: collection,
    }
    return { success: true, data: JSON.stringify(exportData, null, 2) }
  } catch (error) {
    console.error('导出失败:', error)
    return { success: false, error: error.message || '导出失败' }
  }
}

/**
 * 从JSON导入收藏数据
 * @param {string} jsonData - JSON数据
 * @param {boolean} merge - 是否合并现有收藏
 * @returns {Promise<{success: boolean, importedCount?: number, error?: string}>}
 */
export const importCollectionFromJSON = async (jsonData, merge = false) => {
  try {
    const importData = JSON.parse(jsonData)
    
    if (!importData.collection || !importData.collection.items) {
      return { success: false, error: '无效的导入数据格式' }
    }
    
    if (merge) {
      // 合并模式：添加到现有收藏
      const existingCollection = await getCollection()
      for (const item of importData.collection.items) {
        // 重新生成ID避免冲突
        item.collectionId = generateCollectionId()
        existingCollection.items.push(item)
      }
      existingCollection.totalCount = existingCollection.items.length
      existingCollection.updatedAt = new Date().toISOString()
      updateCollectionStats(existingCollection)
      await kvStorage.set(COLLECTION_KEY, existingCollection)
    } else {
      // 替换模式：直接替换现有收藏
      const newCollection = importData.collection
      newCollection.updatedAt = new Date().toISOString()
      updateCollectionStats(newCollection)
      await kvStorage.set(COLLECTION_KEY, newCollection)
    }
    
    return { success: true, importedCount: importData.collection.items.length }
  } catch (error) {
    console.error('导入失败:', error)
    return { success: false, error: error.message || '导入失败' }
  }
}

export default {
  saveCardToCollection,
  getCollection,
  getCardFromCollection,
  deleteCardFromCollection,
  updateCardInCollection,
  filterCards,
  getCollectionStats,
  isCardCollected,
  clearCollection,
  exportCollectionAsJSON,
  importCollectionFromJSON,
}