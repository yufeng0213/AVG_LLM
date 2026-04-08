import { registerPlugin } from '@capacitor/core'

const CardImportPlugin = registerPlugin('CardImport')

/**
 * Android 原生导入卡片目录（SAF content://）
 * @returns {Promise<{
 *   success: boolean,
 *   canceled: boolean,
 *   baseDir?: string,
 *   indexPath?: string,
 *   sourceUri?: string,
 *   filesCopied?: number,
 *   directoriesCopied?: number,
 *   message?: string
 * }>}
 */
export const importCardDirectoryNative = async () => {
  return await CardImportPlugin.importCardDirectory()
}

export default {
  importCardDirectoryNative,
}
