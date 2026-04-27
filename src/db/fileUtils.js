/**
 * Android 内部存储文件工具
 * 图片/立绘/背景等资源文件管理
 */
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'

const BASE_DIR = 'avg_llm_files'

async function isNative() {
  return Capacitor.isNativePlatform()
}

/**
 * 确保子目录存在
 * @param {string} subDir — 相对路径，如 'portraits/char_123'
 */
export async function ensureDir(subDir = '') {
  if (!await isNative()) return
  try {
    await Filesystem.mkdir({
      path: `${BASE_DIR}/${subDir}`,
      directory: Directory.Data,
      recursive: true,
    })
  } catch {
    // 目录可能已存在，忽略
  }
}

/**
 * 保存文件
 * @param {string} relativePath — 相对于 BASE_DIR 的路径
 * @param {string} data — base64 编码的数据
 * @returns {Promise<string>} 相对路径
 */
export async function saveFile(relativePath, data) {
  if (!await isNative()) {
    throw new Error('[fileUtils] saveFile only available on native')
  }
  const dir = relativePath.substring(0, relativePath.lastIndexOf('/'))
  if (dir) await ensureDir(dir)

  await Filesystem.writeFile({
    path: `${BASE_DIR}/${relativePath}`,
    data,
    directory: Directory.Data,
  })
  return relativePath
}

/**
 * 读取文件（返回 base64 字符串）
 * @param {string} relativePath
 * @returns {Promise<string|null>}
 */
export async function readFile(relativePath) {
  if (!await isNative()) return null
  try {
    const result = await Filesystem.readFile({
      path: `${BASE_DIR}/${relativePath}`,
      directory: Directory.Data,
    })
    return result.data
  } catch {
    return null
  }
}

/**
 * 删除文件
 * @param {string} relativePath
 */
export async function deleteFile(relativePath) {
  if (!await isNative()) return
  try {
    await Filesystem.deleteFile({
      path: `${BASE_DIR}/${relativePath}`,
      directory: Directory.Data,
    })
  } catch {
    // 文件可能不存在，忽略
  }
}

/**
 * 列出子目录下的所有文件
 * @param {string} subDir — 相对路径，如 'portraits/char_123'
 * @returns {Promise<string[]>} 文件名列表
 */
export async function listFiles(subDir = '') {
  if (!await isNative()) return []
  try {
    const result = await Filesystem.readdir({
      path: `${BASE_DIR}/${subDir}`,
      directory: Directory.Data,
    })
    return result.files
      .filter(f => !f.isDirectory)
      .map(f => f.name)
  } catch {
    return []
  }
}

/**
 * 目录常量
 */
export const DIRS = {
  portraits: (charId) => `portraits/${charId}`,
  userPortraits: (bookId) => `user_portraits/${bookId}`,
  smsAvatars: (charId) => `sms_avatars/${charId}`,
  smsBgs: (bookId) => `sms_bgs/${bookId}`,
  smsStickers: (bookId) => `sms_stickers/${bookId}`,
  backgrounds: (bookId) => `backgrounds/${bookId}`,
  cardBorders: (bookId) => `card_borders/${bookId}`,
}
