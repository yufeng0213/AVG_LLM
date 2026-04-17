/**
 * calendarBridge.js - 调起 Android 日历导入
 */
import { registerPlugin } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'

const IcsCalendar = registerPlugin('IcsCalendar', {
  web: () => import('./WebIcsCalendar.js').then(m => m.WebIcsCalendar),
})

/**
 * 打开日历导入：写 ICS 文件 → 调起系统日历
 * @param {string} icsContent - ICS 文件内容
 * @param {string} fileName - 文件名（默认 event.ics）
 */
export async function openCalendarImport(icsContent, fileName = 'event.ics') {
  try {
    await Filesystem.mkdir({
      path: 'calendar',
      directory: Directory.Cache,
      recursive: true,
    })
  } catch {
    // 目录已存在，忽略
  }

  const result = await Filesystem.writeFile({
    path: `calendar/${fileName}`,
    data: icsContent,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })

  await IcsCalendar.openIcsFile({ filePath: result.uri })
}
