/**
 * WebIcsCalendar.js - Web 端的日历导入降级处理
 * 在浏览器/开发环境中创建 Blob 下载
 */
export const WebIcsCalendar = {
  async openIcsFile({ filePath }) {
    // Web 端无法直接通过 filePath 打开文件，改为下载
    // 实际 Android 环境下不会走到这里
    console.warn('[IcsCalendar] Web 模式不支持打开 ICS 文件，已跳过')
  },
}
