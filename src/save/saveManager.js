/**
 * 存档管理模块
 * 负责游戏存档的保存、加载、删除等操作
 * 支持跨平台：Electron、Android (Capacitor)、Web
 */

import { kvStorage, saveStorage, backupStorage } from '../storage/index.js'
import { isElectron, isNative } from '../utils/platform.js'

// 存档数据结构版本
const SAVE_DATA_VERSION = 1

// 存档元数据存储键
const SAVE_LIST_KEY = 'saves'
const BACKUP_LIST_KEY = 'backups'

// 最大存档/备份数量
const MAX_SAVES = 20
const MAX_BACKUPS = 10

/**
 * 创建空的存档数据结构
 * @returns {Object} 空存档数据
 */
const createEmptySaveData = () => ({
  version: SAVE_DATA_VERSION,
  timestamp: Date.now(),
  metadata: {
    chapter: '第一章',
    scene: '开场',
    playTime: 0, // 游戏时长（秒）
    preview: '', // 最后一条对话的预览文本
  },
  game: {
    worldBookId: 'default_world_book',
    currentLineIndex: 0,
    dialogueScript: [],
    sceneCharacters: [],
  },
})

/**
 * 获取存档目录路径
 * @returns {Promise<string>} 存档目录路径
 */
const getSaveDir = async () => {
  if (isElectron() && window.avgLLM?.save?.getSaveDir) {
    return await window.avgLLM.save.getSaveDir()
  }
  return 'avg_llm_saves'
}

/**
 * 获取所有存档列表
 * @returns {Promise<Array>} 存档列表
 */
const getSaveList = async () => {
  // Electron 环境优先使用 IPC
  if (isElectron() && window.avgLLM?.save?.getSaveList) {
    return await window.avgLLM.save.getSaveList()
  }
  
  // 使用存储抽象层
  try {
    const list = await kvStorage.get(SAVE_LIST_KEY)
    return list || []
  } catch {
    return []
  }
}

/**
 * 更新存档列表
 * @param {Array} saves - 存档列表
 */
const updateSaveList = async (saves) => {
  await kvStorage.set(SAVE_LIST_KEY, saves)
}

/**
 * 保存游戏进度
 * @param {Object} gameData - 游戏数据
 * @param {string} slotId - 存档槽位ID（可选，不提供则自动生成）
 * @returns {Promise<Object>} 保存结果
 */
const saveGame = async (gameData, slotId = null) => {
  // 确保数据可被序列化（深拷贝并移除不可序列化的属性）
  const clonedData = JSON.parse(JSON.stringify(gameData))
  
  const saveData = {
    ...createEmptySaveData(),
    ...clonedData,
    timestamp: Date.now(),
  }

  // 生成预览文本
  if (clonedData.game?.dialogueScript && clonedData.game.dialogueScript.length > 0) {
    const lastDialogue = clonedData.game.dialogueScript[clonedData.game.dialogueScript.length - 1]
    saveData.metadata.preview = lastDialogue.text
      ? lastDialogue.text.substring(0, 50) + (lastDialogue.text.length > 50 ? '...' : '')
      : ''
  }

  const id = slotId || `save_${Date.now()}`
  
  // Electron 环境优先使用 IPC
  if (isElectron() && window.avgLLM?.save?.saveGame) {
    return await window.avgLLM.save.saveGame(saveData, id)
  }
  
  // 使用存储抽象层
  try {
    // 保存存档数据
    const result = await saveStorage.save(id, saveData)
    if (!result.success) {
      return result
    }
    
    // 更新存档列表
    const saves = await getSaveList()
    const existingIndex = saves.findIndex(s => s.id === id)
    
    const saveEntry = {
      id,
      timestamp: saveData.timestamp,
      metadata: saveData.metadata,
    }

    if (existingIndex >= 0) {
      saves[existingIndex] = saveEntry
    } else {
      saves.unshift(saveEntry)
    }

    // 限制存档数量
    const trimmedSaves = saves.slice(0, MAX_SAVES)
    
    // 删除超出限制的存档文件
    if (saves.length > MAX_SAVES) {
      for (const oldSave of saves.slice(MAX_SAVES)) {
        await saveStorage.delete(oldSave.id)
      }
    }
    
    await updateSaveList(trimmedSaves)
    
    return { success: true, id }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 加载游戏存档
 * @param {string} slotId - 存档槽位ID
 * @returns {Promise<Object>} 存档数据
 */
const loadGame = async (slotId) => {
  // Electron 环境优先使用 IPC
  if (isElectron() && window.avgLLM?.save?.loadGame) {
    return await window.avgLLM.save.loadGame(slotId)
  }
  
  // 使用存储抽象层
  const result = await saveStorage.load(slotId)
  return result
}

/**
 * 删除存档
 * @param {string} slotId - 存档槽位ID
 * @returns {Promise<Object>} 删除结果
 */
const deleteSave = async (slotId) => {
  // Electron 环境优先使用 IPC
  if (isElectron() && window.avgLLM?.save?.deleteSave) {
    return await window.avgLLM.save.deleteSave(slotId)
  }
  
  // 使用存储抽象层
  try {
    // 删除存档文件
    const result = await saveStorage.delete(slotId)
    if (!result.success) {
      return result
    }
    
    // 更新存档列表
    const saves = await getSaveList()
    const filteredSaves = saves.filter(s => s.id !== slotId)
    await updateSaveList(filteredSaves)
    
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 创建历史消息备份
 * @param {Array} messages - 历史消息列表
 * @param {string} backupName - 备份名称（可选）
 * @returns {Promise<Object>} 备份结果
 */
const createHistoryBackup = async (messages, backupName = null) => {
  // 确保数据可被序列化（深拷贝）
  const clonedMessages = JSON.parse(JSON.stringify(messages))
  
  const backupData = {
    version: SAVE_DATA_VERSION,
    timestamp: Date.now(),
    type: 'history_backup',
    name: backupName || `历史备份_${new Date().toLocaleString('zh-CN')}`,
    messages: clonedMessages,
  }

  const id = `backup_${Date.now()}`
  
  // Electron 环境优先使用 IPC
  if (isElectron() && window.avgLLM?.backup?.createBackup) {
    return await window.avgLLM.backup.createBackup(backupData)
  }
  
  // 使用存储抽象层
  try {
    // 保存备份数据
    const result = await backupStorage.save(id, backupData)
    if (!result.success) {
      return result
    }
    
    // 更新备份列表
    const backups = await getBackupList()
    
    const backupEntry = {
      id,
      timestamp: backupData.timestamp,
      name: backupData.name,
      messageCount: messages.length,
    }

    backups.unshift(backupEntry)
    
    // 限制备份数量
    const trimmedBackups = backups.slice(0, MAX_BACKUPS)
    
    // 删除超出限制的备份文件
    if (backups.length > MAX_BACKUPS) {
      for (const oldBackup of backups.slice(MAX_BACKUPS)) {
        await backupStorage.delete(oldBackup.id)
      }
    }
    
    await kvStorage.set(BACKUP_LIST_KEY, trimmedBackups)
    
    return { success: true, id }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 获取所有历史备份列表
 * @returns {Promise<Array>} 备份列表
 */
const getBackupList = async () => {
  // Electron 环境优先使用 IPC
  if (isElectron() && window.avgLLM?.backup?.getBackupList) {
    return await window.avgLLM.backup.getBackupList()
  }
  
  // 使用存储抽象层
  try {
    const list = await kvStorage.get(BACKUP_LIST_KEY)
    return list || []
  } catch {
    return []
  }
}

/**
 * 加载历史备份
 * @param {string} backupId - 备份ID
 * @returns {Promise<Object>} 备份数据
 */
const loadBackup = async (backupId) => {
  // Electron 环境优先使用 IPC
  if (isElectron() && window.avgLLM?.backup?.loadBackup) {
    return await window.avgLLM.backup.loadBackup(backupId)
  }
  
  // 使用存储抽象层
  const result = await backupStorage.load(backupId)
  return result
}

/**
 * 删除历史备份
 * @param {string} backupId - 备份ID
 * @returns {Promise<Object>} 删除结果
 */
const deleteBackup = async (backupId) => {
  // Electron 环境优先使用 IPC
  if (isElectron() && window.avgLLM?.backup?.deleteBackup) {
    return await window.avgLLM.backup.deleteBackup(backupId)
  }
  
  // 使用存储抽象层
  try {
    // 删除备份文件
    const result = await backupStorage.delete(backupId)
    if (!result.success) {
      return result
    }
    
    // 更新备份列表
    const backups = await getBackupList()
    const filteredBackups = backups.filter(b => b.id !== backupId)
    await kvStorage.set(BACKUP_LIST_KEY, filteredBackups)
    
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 格式化时间戳为可读字符串
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化的时间字符串
 */
const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 格式化游戏时长
 * @param {number} seconds - 秒数
 * @returns {string} 格式化的时长字符串
 */
const formatPlayTime = (seconds) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}时${minutes}分`
  }
  if (minutes > 0) {
    return `${minutes}分${secs}秒`
  }
  return `${secs}秒`
}

export {
  createEmptySaveData,
  getSaveDir,
  getSaveList,
  saveGame,
  loadGame,
  deleteSave,
  createHistoryBackup,
  getBackupList,
  loadBackup,
  deleteBackup,
  formatTimestamp,
  formatPlayTime,
  SAVE_DATA_VERSION,
}