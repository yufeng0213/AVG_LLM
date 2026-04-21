/**
 * Widget 数据同步工具
 * 用于将角色立绘同步到 Widget 可访问的文件系统存储
 */

import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { isAndroid, isElectron } from '../utils/platform.js'

const WIDGET_PORTRAIT_DIR = 'widget_portraits'

/**
 * 从 dataUrl 提取纯 base64 数据
 */
function extractBase64(dataUrl) {
  if (!dataUrl) return ''
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex >= 0) {
    return dataUrl.substring(commaIndex + 1)
  }
  return dataUrl
}

/**
 * 同步角色立绘到 Widget 文件存储
 * 将立绘图片保存到文件系统，Widget 可以直接读取
 *
 * @param {Object} character - 角色数据
 * @param {string} worldBookId - 世界书ID
 * @returns {Promise<{success: boolean, error?: string, filePath?: string}>}
 */
export async function syncCharacterPortraitForWidget(character, worldBookId) {
  if (!character || !character.id) {
    return { success: false, error: 'Invalid character data' }
  }

  try {
    // 获取立绘 base64
    const portraitResult = await getCharacterPortraitBase64(character)

    if (!portraitResult.success || !portraitResult.dataUrl) {
      return { success: false, error: portraitResult.error || 'Failed to get portrait' }
    }

    // Android 使用文件系统存储
    if (isAndroid()) {
      // 确保目录存在
      try {
        await Filesystem.mkdir({
          path: WIDGET_PORTRAIT_DIR,
          directory: Directory.Files,
          recursive: true
        })
      } catch (e) {
        // 目录可能已存在
      }

      // 保存到文件系统
      const fileName = `${worldBookId}_${character.id}.png`
      const filePath = `${WIDGET_PORTRAIT_DIR}/${fileName}`

      // 提取 base64 数据
      const base64Data = extractBase64(portraitResult.dataUrl)

      await Filesystem.writeFile({
        path: filePath,
        data: base64Data,
        directory: Directory.Files
      })

      console.log(`[WidgetSync] Portrait saved to file: ${filePath}`)

      // 保存文件路径引用（这个小数据可以放 Preferences）
      await Preferences.set({
        key: `widget_portrait_path_${worldBookId}_${character.id}`,
        value: filePath
      })

      return {
        success: true,
        filePath,
        source: portraitResult.source
      }
    }

    // Electron/Web 环境返回 dataUrl
    return {
      success: true,
      dataUrl: portraitResult.dataUrl,
      source: portraitResult.source
    }
  } catch (e) {
    console.error('[WidgetSync] Error syncing portrait:', e)
    return { success: false, error: e.message }
  }
}

/**
 * 获取角色立绘的 base64
 * 支持 smsAvatar、portraits 文件路径、dataUrl
 */
async function getCharacterPortraitBase64(character) {
  // 优先使用 smsAvatar (已经是 base64)
  const smsAvatar = character?.smsAvatar
  if (smsAvatar && smsAvatar.startsWith('data:image')) {
    return {
      success: true,
      dataUrl: smsAvatar,
      source: 'smsAvatar'
    }
  }

  // 从 portraits 数组加载
  const portraits = character?.portraits
  if (!Array.isArray(portraits) || portraits.length === 0) {
    return { success: false, error: 'No portraits available' }
  }

  // 查找 default 情感的立绘
  const portrait = portraits.find(p => String(p?.emotion || '').trim() === 'default') || portraits[0]
  const filePath = portrait?.filePath

  if (!filePath) {
    return { success: false, error: 'Portrait filePath is empty' }
  }

  // 如果已经是 dataUrl
  if (filePath.startsWith('data:image')) {
    return {
      success: true,
      dataUrl: filePath,
      source: 'portraits'
    }
  }

  // 如果是 http URL，尝试 fetch
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    try {
      const response = await fetch(filePath)
      const blob = await response.blob()
      const base64 = await blobToBase64(blob)
      return {
        success: true,
        dataUrl: base64,
        source: 'url'
      }
    } catch (e) {
      console.warn('[WidgetSync] Failed to fetch URL portrait:', e)
      return { success: false, error: 'Cannot fetch URL portrait' }
    }
  }

  // 文件路径：使用平台特定 API 读取
  if (isElectron() && window.avgLLM?.file?.readImage) {
    try {
      const result = await window.avgLLM.file.readImage(filePath)
      if (result?.base64) {
        return {
          success: true,
          dataUrl: `data:${result.mimeType || 'image/png'};base64,${result.base64}`,
          source: 'electron'
        }
      }
    } catch (e) {
      console.warn('[WidgetSync] Electron file read failed:', e)
    }
  }

  if (isAndroid()) {
    try {
      const { ImageReader } = await import('../capacitor-plugins/ImageReader.js')
      const result = await ImageReader.readImage({
        filePath,
        maxWidth: 800,
        maxHeight: 600
      })

      if (result?.success && result?.dataUrl) {
        return {
          success: true,
          dataUrl: result.dataUrl,
          source: 'android'
        }
      }
    } catch (e) {
      console.warn('[WidgetSync] Android ImageReader failed:', e)
    }
  }

  return { success: false, error: 'Failed to read portrait file' }
}

/**
 * Blob 转 Base64
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * 批量同步所有角色的立绘
 * @param {Array} characters - 角色数组
 * @param {string} worldBookId - 世界书ID
 * @returns {Promise<{synced: number, failed: number}>}
 */
export async function syncAllCharacterPortraits(characters, worldBookId) {
  if (!Array.isArray(characters)) {
    return { synced: 0, failed: 0 }
  }

  let synced = 0
  let failed = 0

  for (const character of characters) {
    const result = await syncCharacterPortraitForWidget(character, worldBookId)
    if (result.success) {
      synced++
    } else {
      failed++
      console.warn(`[WidgetSync] Failed to sync ${character.name}:`, result.error)
    }
  }

  console.log(`[WidgetSync] Synced ${synced} portraits, ${failed} failed`)
  return { synced, failed }
}

/**
 * 获取已同步的角色立绘文件路径
 * @param {string} worldBookId - 世界书ID
 * @param {string} characterId - 角色ID
 * @returns {Promise<string|null>} - 文件路径或 null
 */
export async function getSyncedPortraitPath(worldBookId, characterId) {
  try {
    const { value } = await Preferences.get({ key: `widget_portrait_path_${worldBookId}_${characterId}` })
    return value || null
  } catch (e) {
    console.error('[WidgetSync] Error getting synced portrait path:', e)
    return null
  }
}

/**
 * 清理已同步的立绘文件
 */
export async function clearSyncedPortraits() {
  try {
    // 删除 Preferences 中的路径引用
    const { keys } = await Preferences.keys()
    for (const key of keys) {
      if (key.startsWith('widget_portrait_path_')) {
        await Preferences.remove({ key })
      }
    }

    // 尝试删除文件目录
    if (isAndroid()) {
      try {
        await Filesystem.rmdir({
          path: WIDGET_PORTRAIT_DIR,
          directory: Directory.Files,
          recursive: true
        })
      } catch (e) {
        // 目录可能不存在
      }
    }

    console.log('[WidgetSync] All synced portraits cleared')
  } catch (e) {
    console.error('[WidgetSync] Error clearing portraits:', e)
  }
}