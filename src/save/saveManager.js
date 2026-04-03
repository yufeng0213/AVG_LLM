/**
 * 存档管理模块
 * 负责游戏存档的保存、加载、删除等操作
 */

// 存档数据结构
const SAVE_DATA_VERSION = 1

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
  if (window.avgLLM?.save?.getSaveDir) {
    return await window.avgLLM.save.getSaveDir()
  }
  // 浏览器环境回退
  return 'avg_llm_saves'
}

/**
 * 获取所有存档列表
 * @returns {Promise<Array>} 存档列表
 */
const getSaveList = async () => {
  if (window.avgLLM?.save?.getSaveList) {
    return await window.avgLLM.save.getSaveList()
  }
  // 浏览器环境回退：使用 localStorage
  try {
    const saves = localStorage.getItem('avg_llm_saves')
    return saves ? JSON.parse(saves) : []
  } catch {
    return []
  }
}

/**
 * 保存游戏进度
 * @param {Object} gameData - 游戏数据
 * @param {string} slotId - 存档槽位ID（可选，不提供则自动生成）
 * @returns {Promise<Object>} 保存结果
 */
const saveGame = async (gameData, slotId = null) => {
  // 确保数据可被 IPC 克隆（深拷贝并移除不可序列化的属性）
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

  if (window.avgLLM?.save?.saveGame) {
    return await window.avgLLM.save.saveGame(saveData, slotId)
  }
  
  // 浏览器环境回退：使用 localStorage
  try {
    const saves = await getSaveList()
    const existingIndex = slotId ? saves.findIndex(s => s.id === slotId) : -1
    
    const saveEntry = {
      id: slotId || `save_${Date.now()}`,
      timestamp: saveData.timestamp,
      metadata: saveData.metadata,
    }

    if (existingIndex >= 0) {
      saves[existingIndex] = saveEntry
    } else {
      saves.unshift(saveEntry)
    }

    // 最多保留 20 个存档
    const trimmedSaves = saves.slice(0, 20)
    localStorage.setItem('avg_llm_saves', JSON.stringify(trimmedSaves))
    localStorage.setItem(`avg_llm_save_${saveEntry.id}`, JSON.stringify(saveData))

    return { success: true, id: saveEntry.id }
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
  if (window.avgLLM?.save?.loadGame) {
    return await window.avgLLM.save.loadGame(slotId)
  }

  // 浏览器环境回退
  try {
    const saveData = localStorage.getItem(`avg_llm_save_${slotId}`)
    if (!saveData) {
      return { success: false, error: '存档不存在' }
    }
    return { success: true, data: JSON.parse(saveData) }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 删除存档
 * @param {string} slotId - 存档槽位ID
 * @returns {Promise<Object>} 删除结果
 */
const deleteSave = async (slotId) => {
  if (window.avgLLM?.save?.deleteSave) {
    return await window.avgLLM.save.deleteSave(slotId)
  }

  // 浏览器环境回退
  try {
    const saves = await getSaveList()
    const filteredSaves = saves.filter(s => s.id !== slotId)
    localStorage.setItem('avg_llm_saves', JSON.stringify(filteredSaves))
    localStorage.removeItem(`avg_llm_save_${slotId}`)
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
  // 确保数据可被 IPC 克隆（深拷贝）
  const clonedMessages = JSON.parse(JSON.stringify(messages))
  
  const backupData = {
    version: SAVE_DATA_VERSION,
    timestamp: Date.now(),
    type: 'history_backup',
    name: backupName || `历史备份_${new Date().toLocaleString('zh-CN')}`,
    messages: clonedMessages,
  }

  if (window.avgLLM?.backup?.createBackup) {
    return await window.avgLLM.backup.createBackup(backupData)
  }

  // 浏览器环境回退
  try {
    const backups = JSON.parse(localStorage.getItem('avg_llm_backups') || '[]')
    const backupEntry = {
      id: `backup_${Date.now()}`,
      timestamp: backupData.timestamp,
      name: backupData.name,
      messageCount: messages.length,
    }

    backups.unshift(backupEntry)
    // 最多保留 10 个备份
    const trimmedBackups = backups.slice(0, 10)
    localStorage.setItem('avg_llm_backups', JSON.stringify(trimmedBackups))
    localStorage.setItem(`avg_llm_backup_${backupEntry.id}`, JSON.stringify(backupData))

    return { success: true, id: backupEntry.id }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 获取所有历史备份列表
 * @returns {Promise<Array>} 备份列表
 */
const getBackupList = async () => {
  if (window.avgLLM?.backup?.getBackupList) {
    return await window.avgLLM.backup.getBackupList()
  }

  // 浏览器环境回退
  try {
    const backups = localStorage.getItem('avg_llm_backups')
    return backups ? JSON.parse(backups) : []
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
  if (window.avgLLM?.backup?.loadBackup) {
    return await window.avgLLM.backup.loadBackup(backupId)
  }

  // 浏览器环境回退
  try {
    const backupData = localStorage.getItem(`avg_llm_backup_${backupId}`)
    if (!backupData) {
      return { success: false, error: '备份不存在' }
    }
    return { success: true, data: JSON.parse(backupData) }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 删除历史备份
 * @param {string} backupId - 备份ID
 * @returns {Promise<Object>} 删除结果
 */
const deleteBackup = async (backupId) => {
  if (window.avgLLM?.backup?.deleteBackup) {
    return await window.avgLLM.backup.deleteBackup(backupId)
  }

  // 浏览器环境回退
  try {
    const backups = await getBackupList()
    const filteredBackups = backups.filter(b => b.id !== backupId)
    localStorage.setItem('avg_llm_backups', JSON.stringify(filteredBackups))
    localStorage.removeItem(`avg_llm_backup_${backupId}`)
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