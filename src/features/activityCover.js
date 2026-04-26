import { isNative } from '../utils/platform.js'

const COVERS_DIR = 'avg_llm_activity_covers'
const COVER_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

/**
 * 保存封面文件，返回 base64 data URL
 * @param {string} activityId
 * @param {string} base64Data - data:image/xxx;base64,xxx
 */
export async function saveCoverFile(activityId, base64Data) {
  try {
    const commaIdx = base64Data.indexOf(',')
    const mimeMatch = base64Data.slice(5, commaIdx).match(/image\/(\w+)/)
    const ext = mimeMatch ? COVER_EXT[`image/${mimeMatch[1]}`] || 'png' : 'png'
    const filename = `${activityId}.${ext}`
    const rawData = base64Data.slice(commaIdx + 1)

    if (isNative()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      try { await Filesystem.rmdir({ path: COVERS_DIR, directory: Directory.Documents, recursive: true }) } catch {}
      await Filesystem.mkdir({ path: COVERS_DIR, directory: Directory.Documents, recursive: true })
      await Filesystem.writeFile({
        path: `${COVERS_DIR}/${filename}`,
        data: rawData,
        directory: Directory.Documents,
      })
      const readResult = await Filesystem.readFile({
        path: `${COVERS_DIR}/${filename}`,
        directory: Directory.Documents,
      })
      return `data:image/${ext};base64,${readResult.data}`
    }

    localStorage.setItem(`avg_llm_activity_cover_${filename}`, base64Data)
    return base64Data
  } catch (e) {
    console.warn('[activityCover] 保存封面失败:', e)
    return null
  }
}

/**
 * 读取封面文件，返回 base64 data URL 或 null
 */
export async function loadCoverFile(activityId) {
  try {
    if (isNative()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      for (const ext of ['png', 'jpg', 'webp', 'gif']) {
        try {
          const filename = `${activityId}.${ext}`
          const result = await Filesystem.readFile({
            path: `${COVERS_DIR}/${filename}`,
            directory: Directory.Documents,
          })
          const mime = ext === 'jpg' ? 'jpeg' : ext
          return `data:image/${mime};base64,${result.data}`
        } catch { /* 不存在，试下一个 */ }
      }
      return null
    }

    for (const ext of ['png', 'jpg', 'webp', 'gif']) {
      const val = localStorage.getItem(`avg_llm_activity_cover_${activityId}.${ext}`)
      if (val) return val
    }
    return null
  } catch (e) {
    console.warn('[activityCover] 读取封面失败:', e)
    return null
  }
}

/**
 * 删除封面文件
 */
export async function deleteCoverFile(activityId) {
  try {
    if (isNative()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      for (const ext of ['png', 'jpg', 'webp', 'gif']) {
        try {
          await Filesystem.deleteFile({
            path: `${COVERS_DIR}/${activityId}.${ext}`,
            directory: Directory.Documents,
          })
        } catch { /* 不存在 */ }
      }
    } else {
      for (const ext of ['png', 'jpg', 'webp', 'gif']) {
        localStorage.removeItem(`avg_llm_activity_cover_${activityId}.${ext}`)
      }
    }
  } catch (e) {
    console.warn('[activityCover] 删除封面失败:', e)
  }
}
