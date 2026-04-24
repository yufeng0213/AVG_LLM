/**
 * 可打印文件目录配置管理
 * 参考 cardService.js 的模式，使用 kvStorage 持久化路径
 */

import { kvStorage } from '../storage/index.js'

const PRINTABLE_BASE_DIR_KEY = 'printable_base_dir'
const PRINTABLE_DISPLAY_PATH_KEY = 'printable_display_path'
const NATIVE_PREFIX = 'native://'

/**
 * 设置自定义 printables 目录
 * @param {string} baseDir - 基础目录路径
 * @param {string} displayPath - 显示路径（可选）
 */
export async function setPrintableDir(baseDir, displayPath) {
  try {
    await kvStorage.set(PRINTABLE_BASE_DIR_KEY, baseDir)
    if (displayPath) {
      await kvStorage.set(PRINTABLE_DISPLAY_PATH_KEY, displayPath)
    }
    return true
  } catch (error) {
    console.error('保存 printables 目录失败:', error)
    return false
  }
}

/**
 * 获取存储的 printables 基础目录
 * @returns {Promise<string|null>}
 */
export async function getPrintableDir() {
  try {
    return await kvStorage.get(PRINTABLE_BASE_DIR_KEY) || null
  } catch {
    return null
  }
}

/**
 * 获取显示路径
 */
export async function getPrintableDisplayPath() {
  try {
    return await kvStorage.get(PRINTABLE_DISPLAY_PATH_KEY) || null
  } catch {
    return null
  }
}

/**
 * 清除自定义 printables 目录
 */
export async function clearPrintableDir() {
  try {
    await kvStorage.remove(PRINTABLE_BASE_DIR_KEY)
    await kvStorage.remove(PRINTABLE_DISPLAY_PATH_KEY)
    return true
  } catch {
    return false
  }
}

function isNativeDir(baseDir) {
  return typeof baseDir === 'string' && baseDir.startsWith(NATIVE_PREFIX)
}

/**
 * 解析 native:// 路径为 Capacitor Filesystem 可用路径
 */
function resolveNativePath(baseDir, relativePath = '') {
  const nativeBase = baseDir.slice(NATIVE_PREFIX.length).replace(/^\/+/, '')
  const normalizedRelative = relativePath.replace(/^\/+/, '')
  return `${nativeBase}${normalizedRelative}`
}

/**
 * 读取文件内容（支持 native:// 和 web 路径）
 * native:// 路径使用 Capacitor Filesystem，其他路径用 fetch
 * @param {string} baseDir - 基础目录
 * @param {string} relativePath - 相对路径
 * @returns {Promise<string|null>}
 */
export async function readPrintableFile(baseDir, relativePath) {
  if (isNativeDir(baseDir)) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const path = resolveNativePath(baseDir, relativePath)
      const result = await Filesystem.readFile({
        path,
        directory: Directory.Data,
        encoding: 'utf8',
      })
      return result.data
    } catch (e) {
      console.warn(`[printableConfig] readNativeFile failed: ${relativePath}`, e.message)
      return null
    }
  } else {
    try {
      const url = baseDir.endsWith('/') ? `${baseDir}${relativePath}` : `${baseDir}/${relativePath}`
      const res = await fetch(url)
      if (res.ok) return await res.text()
      return null
    } catch {
      return null
    }
  }
}

/**
 * 列出 native 目录下的子目录名称
 * @param {string} baseDir - native:// 基础目录
 * @returns {Promise<string[]>}
 */
export async function listNativeSubdirs(baseDir) {
  if (!isNativeDir(baseDir)) return []
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const path = resolveNativePath(baseDir, '')
    const result = await Filesystem.readdir({ path, directory: Directory.Data })
    return result.files
      .filter(f => f.type === 'directory')
      .map(f => f.name)
  } catch (e) {
    console.warn('[printableConfig] listNativeSubdirs failed:', e.message)
    return []
  }
}
