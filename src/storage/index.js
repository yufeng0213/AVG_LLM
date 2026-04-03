/**
 * 存储抽象层
 * 统一处理 Electron、Android (Capacitor) 和 Web 环境的存储操作
 */

import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { isElectron, isAndroid, isNative, isWeb } from '../utils/platform'

// 存储键前缀
const STORAGE_PREFIX = 'avg_llm_'
const SAVES_DIR = 'saves'
const BACKUPS_DIR = 'backups'

/**
 * 检查 Capacitor Filesystem 是否可用
 */
const isFilesystemAvailable = () => {
  return isNative() && typeof Filesystem !== 'undefined'
}

/**
 * 键值存储操作
 */
export const kvStorage = {
  /**
   * 获取值
   * @param {string} key - 键名
   * @returns {Promise<any>} 值
   */
  async get(key) {
    const fullKey = STORAGE_PREFIX + key
    
    if (isElectron() && window.avgLLM?.storage?.get) {
      return await window.avgLLM.storage.get(fullKey)
    }
    
    if (isNative()) {
      const { value } = await Preferences.get({ key: fullKey })
      return value ? JSON.parse(value) : null
    }
    
    // Web 回退
    const value = localStorage.getItem(fullKey)
    return value ? JSON.parse(value) : null
  },

  /**
   * 设置值
   * @param {string} key - 键名
   * @param {any} value - 值
   */
  async set(key, value) {
    const fullKey = STORAGE_PREFIX + key
    const serialized = JSON.stringify(value)
    
    if (isElectron() && window.avgLLM?.storage?.set) {
      return await window.avgLLM.storage.set(fullKey, serialized)
    }
    
    if (isNative()) {
      await Preferences.set({ key: fullKey, value: serialized })
      return
    }
    
    // Web 回退
    localStorage.setItem(fullKey, serialized)
  },

  /**
   * 删除值
   * @param {string} key - 键名
   */
  async remove(key) {
    const fullKey = STORAGE_PREFIX + key
    
    if (isElectron() && window.avgLLM?.storage?.remove) {
      return await window.avgLLM.storage.remove(fullKey)
    }
    
    if (isNative()) {
      await Preferences.remove({ key: fullKey })
      return
    }
    
    // Web 回退
    localStorage.removeItem(fullKey)
  },

  /**
   * 获取所有键
   * @returns {Promise<string[]>} 键列表
   */
  async keys() {
    if (isElectron() && window.avgLLM?.storage?.keys) {
      return await window.avgLLM.storage.keys()
    }
    
    if (isNative()) {
      const { keys } = await Preferences.keys()
      return keys.filter(k => k.startsWith(STORAGE_PREFIX))
        .map(k => k.replace(STORAGE_PREFIX, ''))
    }
    
    // Web 回退
    return Object.keys(localStorage)
      .filter(k => k.startsWith(STORAGE_PREFIX))
      .map(k => k.replace(STORAGE_PREFIX, ''))
  },
}

/**
 * 文件存储操作（用于存档等大数据）
 */
export const fileStorage = {
  /**
   * 确保目录存在（仅原生环境）
   * @param {string} dirPath - 目录路径
   */
  async ensureDir(dirPath) {
    if (!isFilesystemAvailable()) return
    
    try {
      await Filesystem.mkdir({
        path: dirPath,
        directory: Directory.Documents,
        recursive: true,
      })
    } catch (error) {
      // 目录可能已存在，忽略错误
      if (!error.message?.includes('exists')) {
        console.warn('创建目录失败:', error)
      }
    }
  },

  /**
   * 保存文件
   * @param {string} filename - 文件名
   * @param {any} data - 数据
   * @param {string} category - 分类（saves/backups）
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async saveFile(filename, data, category = SAVES_DIR) {
    const serialized = JSON.stringify(data, null, 2)
    
    // Electron 环境
    if (isElectron() && window.avgLLM?.file?.saveFile) {
      return await window.avgLLM.file.saveFile(filename, serialized, category)
    }
    
    // Android/iOS 原生环境
    if (isFilesystemAvailable()) {
      try {
        const dirPath = `${STORAGE_PREFIX}${category}`
        await this.ensureDir(dirPath)
        
        await Filesystem.writeFile({
          path: `${dirPath}/${filename}`,
          data: serialized,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        })
        
        return { success: true }
      } catch (error) {
        return { success: false, error: error.message }
      }
    }
    
    // Web 回退：使用 localStorage
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${category}_${filename}`, serialized)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  /**
   * 读取文件
   * @param {string} filename - 文件名
   * @param {string} category - 分类（saves/backups）
   * @returns {Promise<{success: boolean, data?: any, error?: string}>}
   */
  async readFile(filename, category = SAVES_DIR) {
    // Electron 环境
    if (isElectron() && window.avgLLM?.file?.readFile) {
      return await window.avgLLM.file.readFile(filename, category)
    }
    
    // Android/iOS 原生环境
    if (isFilesystemAvailable()) {
      try {
        const dirPath = `${STORAGE_PREFIX}${category}`
        const result = await Filesystem.readFile({
          path: `${dirPath}/${filename}`,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        })
        
        return { success: true, data: JSON.parse(result.data) }
      } catch (error) {
        return { success: false, error: error.message }
      }
    }
    
    // Web 回退
    try {
      const data = localStorage.getItem(`${STORAGE_PREFIX}${category}_${filename}`)
      if (!data) {
        return { success: false, error: '文件不存在' }
      }
      return { success: true, data: JSON.parse(data) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  /**
   * 删除文件
   * @param {string} filename - 文件名
   * @param {string} category - 分类（saves/backups）
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteFile(filename, category = SAVES_DIR) {
    // Electron 环境
    if (isElectron() && window.avgLLM?.file?.deleteFile) {
      return await window.avgLLM.file.deleteFile(filename, category)
    }
    
    // Android/iOS 原生环境
    if (isFilesystemAvailable()) {
      try {
        const dirPath = `${STORAGE_PREFIX}${category}`
        await Filesystem.deleteFile({
          path: `${dirPath}/${filename}`,
          directory: Directory.Documents,
        })
        return { success: true }
      } catch (error) {
        return { success: false, error: error.message }
      }
    }
    
    // Web 回退
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${category}_${filename}`)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  },

  /**
   * 列出目录中的文件
   * @param {string} category - 分类（saves/backups）
   * @returns {Promise<string[]>} 文件名列表
   */
  async listFiles(category = SAVES_DIR) {
    // Electron 环境
    if (isElectron() && window.avgLLM?.file?.listFiles) {
      return await window.avgLLM.file.listFiles(category)
    }
    
    // Android/iOS 原生环境
    if (isFilesystemAvailable()) {
      try {
        const dirPath = `${STORAGE_PREFIX}${category}`
        const result = await Filesystem.readdir({
          path: dirPath,
          directory: Directory.Documents,
        })
        return result.files.map(f => f.name)
      } catch (error) {
        return []
      }
    }
    
    // Web 回退
    const prefix = `${STORAGE_PREFIX}${category}_`
    return Object.keys(localStorage)
      .filter(k => k.startsWith(prefix))
      .map(k => k.replace(prefix, ''))
  },
}

/**
 * 存档专用操作
 */
export const saveStorage = {
  /**
   * 保存存档
   * @param {string} slotId - 存档ID
   * @param {any} saveData - 存档数据
   */
  async save(slotId, saveData) {
    const filename = `${slotId}.json`
    return await fileStorage.saveFile(filename, saveData, SAVES_DIR)
  },

  /**
   * 加载存档
   * @param {string} slotId - 存档ID
   */
  async load(slotId) {
    const filename = `${slotId}.json`
    return await fileStorage.readFile(filename, SAVES_DIR)
  },

  /**
   * 删除存档
   * @param {string} slotId - 存档ID
   */
  async delete(slotId) {
    const filename = `${slotId}.json`
    return await fileStorage.deleteFile(filename, SAVES_DIR)
  },

  /**
   * 获取存档列表
   */
  async list() {
    const files = await fileStorage.listFiles(SAVES_DIR)
    return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
  },
}

/**
 * 备份专用操作
 */
export const backupStorage = {
  /**
   * 保存备份
   * @param {string} backupId - 备份ID
   * @param {any} backupData - 备份数据
   */
  async save(backupId, backupData) {
    const filename = `${backupId}.json`
    return await fileStorage.saveFile(filename, backupData, BACKUPS_DIR)
  },

  /**
   * 加载备份
   * @param {string} backupId - 备份ID
   */
  async load(backupId) {
    const filename = `${backupId}.json`
    return await fileStorage.readFile(filename, BACKUPS_DIR)
  },

  /**
   * 删除备份
   * @param {string} backupId - 备份ID
   */
  async delete(backupId) {
    const filename = `${backupId}.json`
    return await fileStorage.deleteFile(filename, BACKUPS_DIR)
  },

  /**
   * 获取备份列表
   */
  async list() {
    const files = await fileStorage.listFiles(BACKUPS_DIR)
    return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
  },
}

// 默认导出
export default {
  kvStorage,
  fileStorage,
  saveStorage,
  backupStorage,
}