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

/**
 * Android 原生导入可打印文件目录（SAF content://）
 * @returns {Promise<{
 *   success: boolean,
 *   canceled: boolean,
 *   baseDir?: string,
 *   sourceUri?: string,
 *   filesCopied?: number,
 *   directoriesCopied?: number,
 *   message?: string
 * }>}
 */
export const importPrintableDirectoryNative = async () => {
  return await CardImportPlugin.importPrintableDirectory()
}

/**
 * Android 原生打印 HTML（调起系统打印对话框）
 */
export const printHtmlNative = async (html, title) => {
  return await CardImportPlugin.printHtml({ html, title })
}

export default {
  importCardDirectoryNative,
  importPrintableDirectoryNative,
  printHtmlNative,
}
