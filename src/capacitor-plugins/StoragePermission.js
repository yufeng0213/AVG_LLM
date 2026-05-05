import { registerPlugin } from '@capacitor/core'

const StoragePermission = registerPlugin('StoragePermission', {
  requestPermission: async () => {
    // Web 环境不需要存储权限
    return { granted: true, scopedStorage: false }
  },
  hasPermission: async () => {
    return { granted: true, scopedStorage: false }
  },
  getPublicDocumentsPath: async () => {
    // Web 环境没有公共 Documents 目录
    return { path: '' }
  },
  writeDebugLog: async (options) => {
    // Web 环境使用 localStorage
    try {
      localStorage.setItem('llm_debug_log', options.content || '')
      return { success: true, path: 'localStorage' }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
})

export const requestStoragePermission = async () => {
  try {
    const result = await StoragePermission.requestPermission()
    return result.granted
  } catch (e) {
    console.warn('[StoragePermission] requestPermission failed:', e.message)
    return false
  }
}

export const hasStoragePermission = async () => {
  try {
    const result = await StoragePermission.hasPermission()
    return result.granted
  } catch (e) {
    console.warn('[StoragePermission] hasPermission failed:', e.message)
    return false
  }
}

export const getPublicDocumentsPath = async () => {
  try {
    const result = await StoragePermission.getPublicDocumentsPath()
    return result.path || ''
  } catch (e) {
    console.warn('[StoragePermission] getPublicDocumentsPath failed:', e.message)
    return ''
  }
}

/**
 * 写入调试日志到公共 Documents/debug 目录（Android）或 localStorage（Web）
 * @param {string} content - 日志内容
 * @param {string} filename - 文件名（默认 llm-debug.log）
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export const writeDebugLog = async (content, filename = 'llm-debug.log') => {
  try {
    const result = await StoragePermission.writeDebugLog({ content, filename })
    return result
  } catch (e) {
    console.warn('[StoragePermission] writeDebugLog failed:', e.message)
    return { success: false, error: e.message }
  }
}

export default StoragePermission