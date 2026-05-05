/**
 * 背景文件操作工具 — 纯函数，不含 Vue/Pinia 响应式
 * 封装 Capacitor Filesystem、Electron 背景 API、Data URL 读取
 */

const BACKGROUND_DIR = 'avg_llm_backgrounds'

const isNative = () => {
  const platform = typeof navigator !== 'undefined' ? navigator.platform || '' : ''
  return /android|win32/.test(platform) && typeof window !== 'undefined' && window.Capacitor
}

const isElectronEnv = () => {
  return window.avgLLM?.background?.scanFolder && window.avgLLM?.background?.readImage
}

const isDataImageUrl = (value) => typeof value === 'string' && value.startsWith('data:image')
const isHttpImageUrl = (value) => typeof value === 'string' && (/^https?:\/\//i).test(value)

const isImageFile = (file) => {
  if (!file) return false
  const type = String(file.type || '').toLowerCase()
  if (type.startsWith('image/')) return true
  const name = String(file.name || '').toLowerCase()
  return /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/.test(name)
}

const readFileAsDataUrl = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

const generateBackgroundId = (fileName) => {
  return `bg_${fileName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
}

const generateBackgroundLabel = (fileName) => {
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, '')
  return nameWithoutExt.replace(/[_-]/g, ' ')
}

const normalizeBackgroundEntry = (raw, index = 0) => {
  const name = String(raw?.name || `背景_${index + 1}.png`)
  const path = String(raw?.path || '')
  if (!path) return null
  const id = String(raw?.id || generateBackgroundId(name))
  const label = String(raw?.label || generateBackgroundLabel(name))
  return { id, name, path, label }
}

const normalizeWorldBookBackgroundAsset = (raw, index = 0) => {
  const path = String(raw?.path || '').trim()
  if (!path) return null
  const name = String(raw?.name || `背景_${index + 1}`)
  const id = String(raw?.id || generateBackgroundId(name))
  const label = String(raw?.label || generateBackgroundLabel(name))
  return { id, name, path, label }
}

/**
 * 从 Capacitor Filesystem 读取背景文件为 Data URL
 * 尝试多种扩展名（png, jpg, jpeg, webp, gif, bmp）
 */
async function loadBackgroundAsDataUrl(bgEntry) {
  if (!isNative()) return null
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const extensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
    for (const ext of extensions) {
      try {
        const path = `${BACKGROUND_DIR}/${bgEntry.id}.${ext}`
        const result = await Filesystem.readFile({
          path, directory: Directory.Documents, encoding: Encoding.Base64,
        })
        const mimeMap = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
        }
        const mime = mimeMap[ext] || 'image/png'
        return `data:${mime};base64,${result.data}`
      } catch { continue }
    }
    return null
  } catch { return null }
}

/**
 * 读取背景图片（支持 Data URL、Electron API）
 */
async function readBackgroundImage(filePath) {
  if (isDataImageUrl(filePath)) {
    const match = String(filePath).match(/^data:(image\/[^;]+);base64,(.+)$/)
    if (match) return { success: true, mimeType: match[1], base64: match[2] }
    return { success: false, error: 'INVALID_DATA_URL' }
  }
  if (!isElectronEnv()) return { success: false, error: 'NOT_ELECTRON_ENV' }
  return await window.avgLLM.background.readImage(filePath)
}

/**
 * 查找背景文件（按 ID、名称、去扩展名匹配）
 */
function findBackgroundFile(backgroundList, backgroundIdOrName) {
  if (!backgroundIdOrName) return null
  let found = backgroundList.find(bg => bg.id === backgroundIdOrName)
  if (found) return found
  found = backgroundList.find(bg => bg.name === backgroundIdOrName)
  if (found) return found
  // 按路径匹配（用于 defaultBackgroundPath 场景）
  found = backgroundList.find(bg => bg.path === backgroundIdOrName)
  if (found) return found
  const nameWithoutExt = backgroundIdOrName.replace(/\.[^.]+$/, '')
  return backgroundList.find(bg => {
    const bgNameWithoutExt = bg.name.replace(/\.[^.]+$/, '')
    return bgNameWithoutExt === nameWithoutExt
  }) || null
}

/**
 * 在背景列表中查找默认背景
 */
function findDefaultBackground(backgroundList, defaultBgPath) {
  if (!backgroundList || backgroundList.length === 0) return null

  // 优先：使用用户配置的默认背景路径
  if (defaultBgPath) {
    let found = backgroundList.find(bg => bg.path === defaultBgPath)
    if (found) return found
    // 也尝试按路径的文件名匹配
    const pathFileName = defaultBgPath.split('/').pop().split('\\').pop()
    if (pathFileName) {
      found = backgroundList.find(bg => bg.name === pathFileName)
      if (found) return found
      const nameWithoutExt = pathFileName.replace(/\.[^.]+$/, '')
      found = backgroundList.find(bg => bg.name.replace(/\.[^.]+$/, '') === nameWithoutExt)
      if (found) return found
    }
  }

  // 兜底：按名称搜索 "default"
  let found = backgroundList.find(bg => {
    const nameWithoutExt = bg.name.replace(/\.[^.]+$/, '').toLowerCase()
    return nameWithoutExt === 'default'
  })
  if (found) return found

  found = backgroundList.find(bg => bg.id === 'bg_default')
  if (found) return found

  found = backgroundList.find(bg => bg.name.toLowerCase().includes('default'))
  if (found) return found

  found = backgroundList.find(bg => bg.id.includes('default'))
  return found || null
}

/**
 * 加载背景文件到缓存
 * 尝试 Data URL、HTTP URL、Capacitor Filesystem、Electron API
 */
async function loadBackgroundFileUrl(bgFile, cache) {
  const cacheKey = bgFile.id || bgFile.path

  if (cache.has(cacheKey)) return cache.get(cacheKey)

  if (isHttpImageUrl(bgFile.path)) {
    cache.set(cacheKey, bgFile.path)
    return bgFile.path
  }

  if (isNative() && bgFile.path.startsWith('file:')) {
    const url = await loadBackgroundAsDataUrl(bgFile)
    if (url) {
      cache.set(bgFile.id, url)
      return url
    }
    return null
  }

  try {
    const result = await readBackgroundImage(bgFile.path)
    if (result.success) {
      const url = `data:${result.mimeType};base64,${result.base64}`
      cache.set(cacheKey, url)
      return url
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * 将文件列表导入到 Capacitor Documents 目录
 */
async function importFilesToNative(imageFiles, idCounter) {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  try {
    await Filesystem.mkdir({ path: BACKGROUND_DIR, directory: Directory.Documents, recursive: true })
  } catch { /* 目录可能已存在 */ }

  const loadedFiles = []
  for (const file of imageFiles) {
    const name = String(file?.name || `背景_${loadedFiles.length + 1}.png`)
    const baseId = generateBackgroundId(name)
    const seenCount = idCounter.get(baseId) || 0
    idCounter.set(baseId, seenCount + 1)
    const id = seenCount === 0 ? baseId : `${baseId}_${seenCount + 1}`

    const dataUrl = await readFileAsDataUrl(file)
    const base64 = dataUrl.split(',')[1] || ''
    const ext = name.split('.').pop().toLowerCase() || 'png'

    try {
      await Filesystem.writeFile({
        path: `${BACKGROUND_DIR}/${id}.${ext}`,
        data: base64,
        directory: Directory.Documents,
        encoding: Encoding.Base64,
      })
    } catch (err) {
      console.warn(`[Background] 保存文件 ${id}.${ext} 失败:`, err)
      continue
    }

    loadedFiles.push({
      id, name,
      path: `file:${id}`,
      label: generateBackgroundLabel(name),
    })
  }
  return loadedFiles
}

/**
 * 将文件列表转为 Web Data URL 列表
 */
async function importFilesAsDataUrls(imageFiles, idCounter) {
  const loadedFiles = []
  for (const file of imageFiles) {
    const name = String(file?.name || `背景_${loadedFiles.length + 1}.png`)
    const dataUrl = await readFileAsDataUrl(file)
    const baseId = generateBackgroundId(name)
    const seenCount = idCounter.get(baseId) || 0
    idCounter.set(baseId, seenCount + 1)
    const id = seenCount === 0 ? baseId : `${baseId}_${seenCount + 1}`

    loadedFiles.push({ id, name, path: dataUrl, label: generateBackgroundLabel(name) })
  }
  return loadedFiles
}

export {
  isNative,
  isElectronEnv,
  isDataImageUrl,
  isHttpImageUrl,
  isImageFile,
  readFileAsDataUrl,
  generateBackgroundId,
  generateBackgroundLabel,
  normalizeBackgroundEntry,
  normalizeWorldBookBackgroundAsset,
  loadBackgroundAsDataUrl,
  readBackgroundImage,
  findBackgroundFile,
  findDefaultBackground,
  loadBackgroundFileUrl,
  importFilesToNative,
  importFilesAsDataUrls,
}
