/**
 * 卡片导出服务
 * 提供卡片导出为PNG图片的功能
 */

import html2canvas from 'html2canvas'
import { isNative } from '../utils/platform'
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'

const DEFAULT_NATIVE_EXPORT_DIR = 'avg_llm_cards'
const DEFAULT_NATIVE_SHARE_DIR = 'avg_llm_share'

const sanitizePngFilename = (rawName) => {
  const fallback = `card_${Date.now()}.png`
  const name = String(rawName || fallback).trim() || fallback
  const safe = name
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  const normalized = safe || fallback
  return normalized.toLowerCase().endsWith('.png')
    ? normalized
    : `${normalized}.png`
}

const sanitizeShareFilename = (rawName) => {
  const fallback = `card_share_${Date.now()}.png`
  const safe = sanitizePngFilename(rawName)
  const withoutExt = safe.replace(/\.png$/i, '')
  const asciiBase = withoutExt
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)

  const normalizedBase = asciiBase || `card_share_${Date.now()}`
  return `${normalizedBase}.png`
}

const extractBase64Payload = (dataUrl) => {
  if (typeof dataUrl !== 'string' || !dataUrl.includes(',')) return ''
  return dataUrl.split(',')[1] || ''
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitForNativeFileReady = async ({
  path,
  directory,
  attempts = 8,
  delayMs = 90,
  minBytes = 64,
}) => {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const statResult = await Filesystem.stat({ path, directory })
      const size = Number(statResult?.size || 0)
      if (Number.isFinite(size) && size >= minBytes) {
        return true
      }
    } catch (_) {
      // ignore and retry
    }

    try {
      const readResult = await Filesystem.readFile({ path, directory })
      if (typeof readResult?.data === 'string' && readResult.data.length > minBytes) {
        return true
      }
    } catch (_) {
      // ignore and retry
    }

    if (i < attempts - 1) {
      await sleep(delayMs)
    }
  }

  return false
}

const createPngFileFromBase64 = (base64Data, filename) => {
  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return new File([bytes], filename, { type: 'image/png' })
}

/**
 * 将卡片HTML元素导出为PNG图片
 * @param {HTMLElement} element - 要导出的DOM元素
 * @param {Object} options - 导出选项
 * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
 */
export const exportCardToPng = async (element, options = {}) => {
  if (!element) {
    return { success: false, error: '未找到要导出的元素' }
  }

  const {
    filename = `card_${Date.now()}.png`,
    scale = 2, // 提高分辨率
    backgroundColor = '#0d0d1a',
    useCORS = true,
    allowTaint = true,
  } = options

  try {
    // 使用html2canvas生成图片
    const canvas = await html2canvas(element, {
      scale,
      backgroundColor,
      useCORS,
      allowTaint,
      logging: false,
      // 确保完整渲染
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    })

    // 转换为PNG数据URL
    const dataUrl = canvas.toDataURL('image/png', 1.0)

    return { success: true, dataUrl, filename }
  } catch (error) {
    console.error('导出卡片失败:', error)
    return { success: false, error: error.message || '导出失败' }
  }
}

/**
 * 下载PNG图片（Web端）
 * @param {string} dataUrl - 图片数据URL
 * @param {string} filename - 文件名
 */
const downloadPngWeb = (dataUrl, filename) => {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * 保存PNG图片到原生文件系统（Android/iOS）
 * @param {string} dataUrl - 图片数据URL
 * @param {string} filename - 文件名
 * @param {Object} options - 保存选项
 * @returns {Promise<{success: boolean, filename?: string, savedPath?: string, uri?: string, error?: string}>}
 */
const savePngNative = async (dataUrl, filename, options = {}) => {
  try {
    const base64Data = extractBase64Payload(dataUrl)
    if (!base64Data) {
      return { success: false, error: '无效图片数据' }
    }

    const safeFilename = sanitizePngFilename(filename)
    const exportDir = String(options.nativeDir || DEFAULT_NATIVE_EXPORT_DIR)
      .trim()
      .replace(/^\/+|\/+$/g, '')
    const relativePath = exportDir ? `${exportDir}/${safeFilename}` : safeFilename

    const saveResult = await Filesystem.writeFile({
      path: relativePath,
      data: base64Data,
      directory: Directory.Documents,
      recursive: true,
    })

    return {
      success: true,
      filename: safeFilename,
      savedPath: `Documents/${relativePath}`,
      uri: saveResult?.uri,
    }
  } catch (error) {
    console.error('原生保存失败:', error)
    return { success: false, error: error?.message || '原生保存失败' }
  }
}

/**
 * 将PNG写入原生缓存目录，供系统分享使用
 * @param {string} dataUrl - 图片数据URL
 * @param {string} filename - 文件名
 */
const savePngNativeForShare = async (dataUrl, filename, options = {}) => {
  try {
    const base64Data = extractBase64Payload(dataUrl)
    if (!base64Data) {
      return { success: false, error: '无效图片数据' }
    }

    const safeFilename = sanitizePngFilename(filename)
    const shareDir = String(options.nativeShareDir || DEFAULT_NATIVE_SHARE_DIR)
      .trim()
      .replace(/^\/+|\/+$/g, '')
    const relativePath = shareDir ? `${shareDir}/${safeFilename}` : safeFilename

    const saveResult = await Filesystem.writeFile({
      path: relativePath,
      data: base64Data,
      directory: Directory.Cache,
      recursive: true,
    })

    const fileReady = await waitForNativeFileReady({
      path: relativePath,
      directory: Directory.Cache,
      attempts: Number(options.shareReadyAttempts || 8),
      delayMs: Number(options.shareReadyDelayMs || 90),
      minBytes: Number(options.shareReadyMinBytes || 64),
    })

    if (!fileReady) {
      return { success: false, error: '分享文件未就绪，请稍后重试' }
    }

    // 额外给部分 App 一点时间完成 URI/索引准备，避免“找不到图片”
    await sleep(Number(options.shareReadyPostDelayMs || 60))

    return {
      success: true,
      filename: safeFilename,
      uri: saveResult?.uri,
    }
  } catch (error) {
    console.error('原生分享缓存写入失败:', error)
    return { success: false, error: error?.message || '缓存写入失败' }
  }
}

/**
 * 通过系统分享面板分享PNG
 * @param {string} dataUrl - 图片数据URL
 * @param {string} filename - 文件名
 * @param {Object} options - 分享选项
 * @returns {Promise<{success: boolean, filename?: string, uri?: string, error?: string}>}
 */
export const sharePngByPlatform = async (dataUrl, filename, options = {}) => {
  const safeFilename = sanitizeShareFilename(filename)

  if (isNative()) {
    const cacheResult = await savePngNativeForShare(dataUrl, safeFilename, options)
    if (!cacheResult.success) {
      return cacheResult
    }

    const sharePayload = {
      title: options.shareTitle || '分享卡片',
      text: options.shareText || '来自AVG_LLM的小卡片',
      dialogTitle: options.shareDialogTitle || '分享到社交应用',
    }

    try {
      // 优先用 files 附件模式，兼容更多社交 App（如小红书）
      await Share.share({
        ...sharePayload,
        files: [cacheResult.uri],
      })
      return { success: true, filename: safeFilename, uri: cacheResult.uri }
    } catch (filesError) {
      const errorMessage = filesError?.message || '分享失败'
      const canFallbackToUrl = options.nativeShareFallbackToUrl === true

      // 默认不做二次弹窗回退，避免出现“连续两次分享面板”问题
      if (!canFallbackToUrl) {
        return { success: false, error: errorMessage }
      }

      try {
        await Share.share({
          ...sharePayload,
          url: cacheResult.uri,
        })
        return { success: true, filename: safeFilename, uri: cacheResult.uri }
      } catch (urlError) {
        return { success: false, error: urlError?.message || errorMessage }
      }
    }
  }

  const nav = typeof navigator !== 'undefined' ? navigator : null
  if (nav?.share) {
    try {
      const base64Data = extractBase64Payload(dataUrl)
      const pngFile = base64Data ? createPngFileFromBase64(base64Data, safeFilename) : null

      if (pngFile && typeof nav.canShare === 'function' && nav.canShare({ files: [pngFile] })) {
        await nav.share({
          title: options.shareTitle || '分享卡片',
          text: options.shareText || '来自AVG_LLM的小卡片',
          files: [pngFile],
        })
        return { success: true, filename: safeFilename }
      }

      await nav.share({
        title: options.shareTitle || '分享卡片',
        text: options.shareText || '来自AVG_LLM的小卡片',
      })
      return { success: true, filename: safeFilename }
    } catch (error) {
      return { success: false, error: error?.message || '分享失败' }
    }
  }

  return { success: false, error: '当前平台不支持系统分享' }
}

/**
 * 按平台处理PNG导出
 * - Web: 直接下载
 * - Android/iOS 原生: 默认保存到 Documents/avg_llm_cards
 * @param {string} dataUrl - 图片数据URL
 * @param {string} filename - 文件名
 * @param {Object} options - 处理选项
 * @returns {Promise<{success: boolean, filename?: string, savedPath?: string, uri?: string, error?: string}>}
 */
export const savePngByPlatform = async (dataUrl, filename, options = {}) => {
  if (isNative()) {
    const saveResult = await savePngNative(dataUrl, filename, options)
    if (saveResult.success || options.nativeShareFallback !== true) {
      return saveResult
    }
    return await sharePngByPlatform(dataUrl, filename, options)
  }

  const safeFilename = sanitizePngFilename(filename)
  downloadPngWeb(dataUrl, safeFilename)
  return { success: true, filename: safeFilename }
}

/**
 * 导出并下载/分享卡片PNG
 * @param {HTMLElement} element - 要导出的DOM元素
 * @param {Object} options - 导出选项
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const exportAndDownloadCard = async (element, options = {}) => {
  const result = await exportCardToPng(element, options)
  
  if (!result.success) {
    return result
  }

  return await savePngByPlatform(result.dataUrl, result.filename, options)
}

/**
 * 从卡片数据创建临时DOM元素并导出
 * @param {Object} cardData - 卡片数据（包含templateHtml和content）
 * @param {Object} options - 导出选项
 * @returns {Promise<{success: boolean, dataUrl?: string, error?: string}>}
 */
export const exportCardFromData = async (cardData, options = {}) => {
  if (!cardData || !cardData.templateHtml) {
    return { success: false, error: '卡片数据不完整' }
  }

  // 创建临时容器
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 400px;
    background: ${options.backgroundColor || '#0d0d1a'};
    padding: 20px;
    z-index: -1;
  `

  // 渲染卡片HTML
  let html = cardData.templateHtml
  const content = cardData.content || {}
  
  for (const [key, value] of Object.entries(content)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value || ''))
    html = html.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value || ''))
    html = html.replace(new RegExp(`%${key}%`, 'g'), String(value || ''))
  }

  container.innerHTML = html
  document.body.appendChild(container)

  // 等待渲染完成
  await new Promise(resolve => setTimeout(resolve, 100))

  try {
    const result = await exportCardToPng(container, options)
    
    // 清理临时容器
    document.body.removeChild(container)
    
    return result
  } catch (error) {
    // 确保清理临时容器
    document.body.removeChild(container)
    return { success: false, error: error.message }
  }
}

/**
 * 从卡片数据导出并按平台保存
 * @param {Object} cardData - 卡片数据
 * @param {Object} options - 导出选项
 * @returns {Promise<{success: boolean, filename?: string, savedPath?: string, uri?: string, error?: string}>}
 */
export const exportCardFromDataAndSave = async (cardData, options = {}) => {
  const exportResult = await exportCardFromData(cardData, options)
  if (!exportResult.success) {
    return exportResult
  }

  return await savePngByPlatform(exportResult.dataUrl, exportResult.filename, options)
}

/**
 * 从卡片数据导出并拉起系统分享面板
 * @param {Object} cardData - 卡片数据
 * @param {Object} options - 导出/分享选项
 * @returns {Promise<{success: boolean, filename?: string, uri?: string, error?: string}>}
 */
export const exportCardFromDataAndShare = async (cardData, options = {}) => {
  const exportResult = await exportCardFromData(cardData, options)
  if (!exportResult.success) {
    return exportResult
  }

  return await sharePngByPlatform(exportResult.dataUrl, exportResult.filename, options)
}

export default {
  exportCardToPng,
  exportAndDownloadCard,
  exportCardFromData,
  exportCardFromDataAndSave,
  exportCardFromDataAndShare,
  savePngByPlatform,
  sharePngByPlatform,
}
