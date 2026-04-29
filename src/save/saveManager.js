/**
 * 存档管理模块
 * 负责游戏存档的保存、加载、删除等操作
 * 支持跨平台：Electron、Android (Capacitor)、Web
 */

import { isSQLiteAvailable, query, exec } from '../db/connection.js'
import { appConfigRepo } from '../db/repos/appConfig.repo.js'
import { isElectron } from '../utils/platform.js'

// 存档数据结构版本
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
    narratorId: null,
    currentLineIndex: 0,
    dialogueScript: [],
    sceneCharacters: [],
  },
  // 新增：好感度系统数据
  relationships: {
    runtime: {}, // 运行时关系状态（覆盖世界书默认值）
    history: [], // 关系变化历史
    triggeredEvents: [], // 已触发的关系事件
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
 * 直接从 save_slots 表读取元数据，不回退到 kvStorage
 */
const getSaveList = async () => {
  // Electron 环境优先使用 IPC
  if (isElectron() && window.avgLLM?.save?.getSaveList) {
    return await window.avgLLM.save.getSaveList()
  }

  // Android 端：直接从 save_slots 表读取
  try {
    if (!isSQLiteAvailable()) {
      console.warn('[saveManager] SQLite not available, save list will be empty')
      return []
    }
    const rows = await query(`
      SELECT id, timestamp, chapter, scene, play_time, preview
      FROM save_slots
      ORDER BY timestamp DESC
    `)
    return rows.map(row => ({
      id: row.id,
      timestamp: parseInt(row.timestamp) || 0,
      metadata: {
        chapter: row.chapter || '第一章',
        scene: row.scene || '开场',
        playTime: parseInt(row.play_time) || 0,
        preview: row.preview || '',
      },
    }))
  } catch (e) {
    console.error('[saveManager] Failed to get save list:', e.message)
    return []
  }
}

/**
 * 保存游戏进度
 * 直接写入 save_slots 表，同时更新 main_story_saves 映射
 */
const saveGame = async (gameData, slotId = null) => {
  // 确保数据可被序列化（深拷贝并移除不可序列化的属性）
  const clonedData = typeof structuredClone === 'function'
    ? structuredClone(gameData)
    : JSON.parse(JSON.stringify(gameData))

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

  // Android 端：直接写入 save_slots 表
  try {
    if (!isSQLiteAvailable()) {
      console.warn('[saveManager] SQLite not available, cannot save game')
      return { success: false, error: 'SQLite not available' }
    }

    const worldBookId = saveData.game?.worldBookId || 'default_world_book'

    // 写入 save_slots 表
    await exec(`
      INSERT OR REPLACE INTO save_slots
      (id, save_data, timestamp, chapter, scene, play_time, preview)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      JSON.stringify(saveData),
      String(saveData.timestamp),
      saveData.metadata.chapter || '第一章',
      saveData.metadata.scene || '开场',
      String(saveData.metadata.playTime || 0),
      saveData.metadata.preview || '',
    ])

    console.log('[saveManager] Saved to save_slots:', id, 'worldBookId:', worldBookId)

    // 更新主线存档映射
    await setMainStorySaveSlot(worldBookId, id)

    // 同时写入 app_config 作为备份（兼容旧代码）
    try {
      await appConfigRepo.set(`save_data:${id}`, saveData)
    } catch { /* 忽略 */ }

    return { success: true, id }
  } catch (error) {
    console.error('[saveManager] Failed to save game:', error.message)
    // 异常情况下也尝试写入 app_config
    try {
      if (isSQLiteAvailable()) {
        await appConfigRepo.set(`save_data:${id}`, JSON.parse(JSON.stringify(gameData)))
      }
    } catch { /* 忽略 */ }
    return { success: false, error: error.message }
  }
}

/**
 * 加载游戏存档
 * 直接从 save_slots 表读取，不回退到文件系统
 */
const loadGame = async (slotId) => {
  const attachSlotId = (result) => {
    if (!result?.success || !result.data || typeof result.data !== 'object') {
      return result
    }
    return {
      ...result,
      data: {
        ...result.data,
        __slotId: slotId,
      },
    }
  }

  // Electron 环境优先使用 IPC
  if (isElectron() && window.avgLLM?.save?.loadGame) {
    const result = await window.avgLLM.save.loadGame(slotId)
    return attachSlotId(result)
  }

  // Android 端：直接从 save_slots 表读取
  try {
    if (!isSQLiteAvailable()) {
      console.warn('[saveManager] SQLite not available, cannot load game')
      return { success: false, error: 'SQLite not available' }
    }

    const rows = await query('SELECT save_data FROM save_slots WHERE id = ?', [slotId])
    if (rows.length === 0) {
      // 尝试从 app_config 备份读取
      const backupData = await appConfigRepo.get(`save_data:${slotId}`)
      if (backupData && typeof backupData === 'object') {
        console.log('[saveManager] Loaded from app_config backup:', slotId)
        return attachSlotId({ success: true, data: backupData })
      }
      return { success: false, error: '存档不存在' }
    }

    const saveData = JSON.parse(rows[0].save_data)
    console.log('[saveManager] Loaded from save_slots:', slotId)
    return attachSlotId({ success: true, data: saveData })
  } catch (e) {
    console.error('[saveManager] Failed to load game:', e.message)
    // 尝试从 app_config 备份读取
    try {
      const backupData = await appConfigRepo.get(`save_data:${slotId}`)
      if (backupData && typeof backupData === 'object') {
        return attachSlotId({ success: true, data: backupData })
      }
    } catch { /* 忽略 */ }
    return { success: false, error: e.message }
  }
}

/**
 * 获取主线存档映射 { worldBookId: saveSlotId }
 * 直接从 main_story_saves 表读取，不回退到 kvStorage（避免被 App.vue 清除）
 */
const getMainStorySaves = async () => {
  try {
    if (!isSQLiteAvailable()) {
      console.warn('[saveManager] SQLite not available, main_story_saves will be empty')
      return {}
    }
    const rows = await query('SELECT world_book_id, save_slot_id FROM main_story_saves')
    const map = {}
    for (const row of rows) {
      map[row.world_book_id] = row.save_slot_id
    }
    return map
  } catch (e) {
    console.error('[saveManager] Failed to get main_story_saves:', e.message)
    return {}
  }
}

/**
 * 获取某个世界书的主线存档槽位ID（不存在则返回 null）
 */
const getMainStorySaveSlot = async (worldBookId) => {
  try {
    if (!isSQLiteAvailable()) {
      console.warn('[saveManager] SQLite not available, cannot get save slot')
      return null
    }
    const rows = await query(
      'SELECT save_slot_id FROM main_story_saves WHERE world_book_id = ?',
      [worldBookId]
    )
    return rows.length > 0 ? rows[0].save_slot_id : null
  } catch (e) {
    console.error('[saveManager] Failed to get main_story_save_slot:', e.message)
    return null
  }
}

/**
 * 设置某个世界书的主线存档槽位ID
 * 直接写入 main_story_saves 表，不回退到 kvStorage（避免被 App.vue 清除）
 */
const setMainStorySaveSlot = async (worldBookId, slotId) => {
  try {
    if (!isSQLiteAvailable()) {
      console.warn('[saveManager] SQLite not available, cannot save main_story_saves')
      return
    }
    await exec(
      'INSERT OR REPLACE INTO main_story_saves (world_book_id, save_slot_id) VALUES (?, ?)',
      [worldBookId, slotId]
    )
    console.log('[saveManager] Saved main_story_saves:', worldBookId, '→', slotId)
  } catch (e) {
    console.error('[saveManager] Failed to set main_story_save_slot:', e.message)
  }
}

/**
 * 删除存档
 * 直接从 save_slots 和 main_story_saves 表删除
 */
const deleteSave = async (slotId) => {
  // Electron 环境优先使用 IPC
  if (isElectron() && window.avgLLM?.save?.deleteSave) {
    return await window.avgLLM.save.deleteSave(slotId)
  }

  try {
    if (!isSQLiteAvailable()) {
      return { success: false, error: 'SQLite not available' }
    }

    // 从 save_slots 表删除
    await exec('DELETE FROM save_slots WHERE id = ?', [slotId])

    // 从 app_config 备份删除
    try {
      await appConfigRepo.remove(`save_data:${slotId}`)
    } catch { /* 忽略 */ }

    // 从 main_story_saves 映射中删除（找到对应的 world_book_id）
    const rows = await query('SELECT world_book_id FROM main_story_saves WHERE save_slot_id = ?', [slotId])
    for (const row of rows) {
      await exec('DELETE FROM main_story_saves WHERE save_slot_id = ?', [slotId])
    }

    console.log('[saveManager] Deleted save:', slotId)
    return { success: true }
  } catch (error) {
    console.error('[saveManager] Failed to delete save:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * 创建历史消息备份
 * 直接写入 backup_slots 表
 */
const createHistoryBackup = async (messages, backupName = null) => {
  const clonedMessages = typeof structuredClone === 'function'
    ? structuredClone(messages)
    : JSON.parse(JSON.stringify(messages))

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

  try {
    if (!isSQLiteAvailable()) {
      return { success: false, error: 'SQLite not available' }
    }

    // 写入 backup_slots 表
    await exec(`
      INSERT INTO backup_slots (id, backup_data, timestamp, name, message_count)
      VALUES (?, ?, ?, ?, ?)
    `, [
      id,
      JSON.stringify(backupData),
      String(backupData.timestamp),
      backupData.name,
      messages.length,
    ])

    console.log('[saveManager] Created backup:', id)
    return { success: true, id }
  } catch (error) {
    console.error('[saveManager] Failed to create backup:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * 获取所有历史备份列表
 * 直接从 backup_slots 表读取
 */
const getBackupList = async () => {
  // Electron 环境优先使用 IPC
  if (isElectron() && window.avgLLM?.backup?.getBackupList) {
    return await window.avgLLM.backup.getBackupList()
  }

  try {
    if (!isSQLiteAvailable()) {
      return []
    }
    const rows = await query(`
      SELECT id, timestamp, name, message_count
      FROM backup_slots
      ORDER BY timestamp DESC
    `)
    return rows.map(row => ({
      id: row.id,
      timestamp: parseInt(row.timestamp) || 0,
      name: row.name || '',
      messageCount: row.message_count || 0,
    }))
  } catch (e) {
    console.error('[saveManager] Failed to get backup list:', e.message)
    return []
  }
}

/**
 * 加载历史备份
 * 直接从 backup_slots 表读取
 */
const loadBackup = async (backupId) => {
  // Electron 环境优先使用 IPC
  if (isElectron() && window.avgLLM?.backup?.loadBackup) {
    return await window.avgLLM.backup.loadBackup(backupId)
  }

  try {
    if (!isSQLiteAvailable()) {
      return { success: false, error: 'SQLite not available' }
    }
    const rows = await query('SELECT backup_data FROM backup_slots WHERE id = ?', [backupId])
    if (rows.length === 0) {
      return { success: false, error: '备份不存在' }
    }
    const backupData = JSON.parse(rows[0].backup_data)
    return { success: true, data: backupData }
  } catch (e) {
    console.error('[saveManager] Failed to load backup:', e.message)
    return { success: false, error: e.message }
  }
}

/**
 * 删除历史备份
 * 直接从 backup_slots 表删除
 */
const deleteBackup = async (backupId) => {
  // Electron 环境优先使用 IPC
  if (isElectron() && window.avgLLM?.backup?.deleteBackup) {
    return await window.avgLLM.backup.deleteBackup(backupId)
  }

  try {
    if (!isSQLiteAvailable()) {
      return { success: false, error: 'SQLite not available' }
    }
    await exec('DELETE FROM backup_slots WHERE id = ?', [backupId])
    console.log('[saveManager] Deleted backup:', backupId)
    return { success: true }
  } catch (error) {
    console.error('[saveManager] Failed to delete backup:', error.message)
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
  getMainStorySaveSlot,
  createHistoryBackup,
  getBackupList,
  loadBackup,
  deleteBackup,
  formatTimestamp,
  formatPlayTime,
  SAVE_DATA_VERSION,
}
