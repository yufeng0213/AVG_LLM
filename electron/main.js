import { app, BrowserWindow, dialog, ipcMain, screen, protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promises as fsPromises } from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isDev = !app.isPackaged
const DEFAULT_WINDOW_SETTINGS = {
  resolution: '1280x720',
  windowMode: 'windowed',
}

// 存档和备份目录名称
const SAVES_DIR_NAME = 'saves'
const BACKUPS_DIR_NAME = 'backups'

// 获取存档目录路径
const getSavesDir = () => path.join(app.getPath('userData'), SAVES_DIR_NAME)

// 获取备份目录路径
const getBackupsDir = () => path.join(app.getPath('userData'), BACKUPS_DIR_NAME)

// 确保目录存在
const ensureDir = async (dirPath) => {
  try {
    await fsPromises.mkdir(dirPath, { recursive: true })
    return true
  } catch {
    return false
  }
}

// 获取存档列表
const getSaveList = async () => {
  const savesDir = getSavesDir()
  await ensureDir(savesDir)
  
  try {
    const files = await fsPromises.readdir(savesDir)
    const saveFiles = files.filter(f => f.endsWith('.json') && f.startsWith('save_'))
    
    const saves = []
    for (const file of saveFiles) {
      try {
        const filePath = path.join(savesDir, file)
        const content = await fsPromises.readFile(filePath, 'utf-8')
        const data = JSON.parse(content)
        saves.push({
          id: file.replace('.json', ''),
          timestamp: data.timestamp || 0,
          metadata: data.metadata || {},
        })
      } catch {
        // 忽略损坏的存档文件
      }
    }
    
    // 按时间戳降序排序
    return saves.sort((a, b) => b.timestamp - a.timestamp)
  } catch {
    return []
  }
}

// 保存游戏
const saveGame = async (saveData, slotId = null) => {
  const savesDir = getSavesDir()
  await ensureDir(savesDir)
  
  const id = slotId || `save_${Date.now()}`
  const filePath = path.join(savesDir, `${id}.json`)
  
  try {
    await fsPromises.writeFile(filePath, JSON.stringify(saveData, null, 2), 'utf-8')
    return { success: true, id }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 加载存档
const loadGame = async (slotId) => {
  const savesDir = getSavesDir()
  const filePath = path.join(savesDir, `${slotId}.json`)
  
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8')
    const data = JSON.parse(content)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 删除存档
const deleteSave = async (slotId) => {
  const savesDir = getSavesDir()
  const filePath = path.join(savesDir, `${slotId}.json`)
  
  try {
    await fsPromises.unlink(filePath)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 获取备份列表
const getBackupList = async () => {
  const backupsDir = getBackupsDir()
  await ensureDir(backupsDir)
  
  try {
    const files = await fsPromises.readdir(backupsDir)
    const backupFiles = files.filter(f => f.endsWith('.json') && f.startsWith('backup_'))
    
    const backups = []
    for (const file of backupFiles) {
      try {
        const filePath = path.join(backupsDir, file)
        const content = await fsPromises.readFile(filePath, 'utf-8')
        const data = JSON.parse(content)
        backups.push({
          id: file.replace('.json', ''),
          timestamp: data.timestamp || 0,
          name: data.name || '未命名备份',
          messageCount: data.messages?.length || 0,
        })
      } catch {
        // 忽略损坏的备份文件
      }
    }
    
    // 按时间戳降序排序
    return backups.sort((a, b) => b.timestamp - a.timestamp)
  } catch {
    return []
  }
}

// 创建备份
const createBackup = async (backupData) => {
  const backupsDir = getBackupsDir()
  await ensureDir(backupsDir)
  
  const id = `backup_${Date.now()}`
  const filePath = path.join(backupsDir, `${id}.json`)
  
  try {
    await fsPromises.writeFile(filePath, JSON.stringify(backupData, null, 2), 'utf-8')
    return { success: true, id }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 加载备份
const loadBackup = async (backupId) => {
  const backupsDir = getBackupsDir()
  const filePath = path.join(backupsDir, `${backupId}.json`)
  
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8')
    const data = JSON.parse(content)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 删除备份
const deleteBackup = async (backupId) => {
  const backupsDir = getBackupsDir()
  const filePath = path.join(backupsDir, `${backupId}.json`)
  
  try {
    await fsPromises.unlink(filePath)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

let mainWindow = null
let windowSettings = { ...DEFAULT_WINDOW_SETTINGS }

const getWindowSettingsFile = () =>
  path.join(app.getPath('userData'), 'window-settings.json')

const toDipSize = (display, width, height) => {
  const scaleFactor =
    Number.isFinite(display?.scaleFactor) && display.scaleFactor > 0
      ? display.scaleFactor
      : 1

  return {
    width: Math.max(960, Math.round(width / scaleFactor)),
    height: Math.max(540, Math.round(height / scaleFactor)),
  }
}

const toPhysicalSize = (display, width, height) => {
  const scaleFactor =
    Number.isFinite(display?.scaleFactor) && display.scaleFactor > 0
      ? display.scaleFactor
      : 1

  return {
    width: Math.round(width * scaleFactor),
    height: Math.round(height * scaleFactor),
  }
}

const parseResolution = (value) => {
  const match = /^(\d{3,5})x(\d{3,5})$/i.exec(String(value || ''))
  if (!match) return null

  const width = Number(match[1])
  const height = Number(match[2])

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 960 ||
    height < 540 ||
    width > 7680 ||
    height > 4320
  ) {
    return null
  }

  return { width, height }
}

const sanitizeWindowMode = (value) => {
  return ['windowed', 'borderless', 'fullscreen'].includes(value)
    ? value
    : DEFAULT_WINDOW_SETTINGS.windowMode
}

const sanitizeWindowSettings = (rawSettings) => {
  const parsed = parseResolution(rawSettings?.resolution)
  return {
    resolution: parsed
      ? `${parsed.width}x${parsed.height}`
      : DEFAULT_WINDOW_SETTINGS.resolution,
    windowMode: sanitizeWindowMode(rawSettings?.windowMode),
  }
}

const loadWindowSettings = () => {
  const settingsFile = getWindowSettingsFile()

  if (!fs.existsSync(settingsFile)) {
    return { ...DEFAULT_WINDOW_SETTINGS }
  }

  try {
    const raw = fs.readFileSync(settingsFile, 'utf-8')
    return sanitizeWindowSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_WINDOW_SETTINGS }
  }
}

const saveWindowSettings = async () => {
  const settingsFile = getWindowSettingsFile()

  try {
    await fsPromises.mkdir(path.dirname(settingsFile), { recursive: true })
    await fsPromises.writeFile(
      settingsFile,
      JSON.stringify(windowSettings, null, 2),
      'utf-8',
    )
  } catch {
    // Non-fatal: settings persistence failure should not block gameplay.
  }
}

const getCenteredBounds = (targetWidth, targetHeight, workArea) => {
  const boundedWidth = Math.min(targetWidth, workArea.width)
  const boundedHeight = Math.min(targetHeight, workArea.height)
  const x = workArea.x + Math.round((workArea.width - boundedWidth) / 2)
  const y = workArea.y + Math.round((workArea.height - boundedHeight) / 2)

  return {
    x,
    y,
    width: boundedWidth,
    height: boundedHeight,
  }
}

const getResolutionListForDisplay = (display) => {
  const baseWidth = display?.bounds?.width || display?.workArea?.width || 1920
  const baseHeight = display?.bounds?.height || display?.workArea?.height || 1080
  const maxPhysical = toPhysicalSize(display, baseWidth, baseHeight)

  const presets = [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1600, height: 900 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
    { width: 3840, height: 2160 },
  ]

  const available = presets.filter(
    (item) => item.width <= maxPhysical.width && item.height <= maxPhysical.height,
  )

  if (available.length === 0) {
    available.push({
      width: maxPhysical.width,
      height: maxPhysical.height,
    })
  }

  const keySet = new Set()
  const uniqueList = []
  for (const item of available) {
    const key = `${item.width}x${item.height}`
    if (!keySet.has(key)) {
      keySet.add(key)
      uniqueList.push(item)
    }
  }

  return uniqueList.sort((a, b) => a.width * a.height - b.width * b.height)
}

const getWindowRuntimeState = (window) => {
  if (!window || window.isDestroyed()) {
    return {
      isFullScreen: false,
      isKiosk: false,
      scaleFactor: 1,
      bounds: null,
      displayBounds: null,
    }
  }

  const currentDisplay = screen.getDisplayMatching(window.getBounds())
  return {
    isFullScreen: window.isFullScreen(),
    isKiosk: window.isKiosk(),
    scaleFactor: currentDisplay.scaleFactor,
    bounds: window.getBounds(),
    displayBounds: currentDisplay.bounds,
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const applyWindowMode = async (window, settings) => {
  if (!window || window.isDestroyed()) return

  const parsedResolution = parseResolution(settings.resolution)
  if (!parsedResolution) return

  const currentDisplay = screen.getDisplayMatching(window.getBounds())
  const workArea = currentDisplay.workArea
  const displayBounds = currentDisplay.bounds

  window.setMinimumSize(960, 640)
  window.setMenuBarVisibility(false)

  if (settings.windowMode === 'fullscreen') {
    if (window.isMinimized()) {
      window.restore()
    }

    window.setBounds({
      x: displayBounds.x,
      y: displayBounds.y,
      width: displayBounds.width,
      height: displayBounds.height,
    })

    window.focus()
    window.setKiosk(true)
    window.setResizable(true)
    window.setMaximizable(true)
    window.setFullScreenable(true)
    window.setFullScreen(true)
    await sleep(80)

    if (!window.isFullScreen()) {
      window.setKiosk(false)
      window.setFullScreen(true)
      window.maximize()
      await sleep(80)
    }
    return
  }

  if (window.isKiosk()) {
    window.setKiosk(false)
  }

  if (window.isFullScreen()) {
    window.setFullScreen(false)
  }

  if (settings.windowMode === 'borderless') {
    window.setResizable(false)
    window.setMaximizable(false)
    window.setFullScreenable(false)
    window.setBounds({
      x: displayBounds.x,
      y: displayBounds.y,
      width: displayBounds.width,
      height: displayBounds.height,
    })
    return
  }

  window.setResizable(true)
  window.setMaximizable(true)
  window.setFullScreenable(true)
  const dipResolution = toDipSize(
    currentDisplay,
    parsedResolution.width,
    parsedResolution.height,
  )
  window.setContentSize(dipResolution.width, dipResolution.height)
  const centeredBounds = getCenteredBounds(
    window.getBounds().width,
    window.getBounds().height,
    workArea,
  )
  window.setBounds(centeredBounds)
  await sleep(30)
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const initialResolution = parseResolution(windowSettings.resolution) || {
    width: 1280,
    height: 720,
  }
  const initialDipResolution = toDipSize(
    primaryDisplay,
    initialResolution.width,
    initialResolution.height,
  )

  mainWindow = new BrowserWindow({
    width: initialDipResolution.width,
    height: initialDipResolution.height,
    minWidth: 960,
    minHeight: 640,
    title: 'AVG_LLM',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  applyWindowMode(mainWindow, windowSettings)

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    return
  }

  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
}

// 注册自定义协议用于本地音频文件播放（必须在 app.whenReady() 之前调用）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-file',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

app.whenReady().then(() => {
  windowSettings = loadWindowSettings()

  ipcMain.handle('display:get-settings', () => ({
    ...windowSettings,
    runtime: getWindowRuntimeState(mainWindow),
  }))
  ipcMain.handle('display:get-supported-resolutions', () => {
    const baseBounds = mainWindow && !mainWindow.isDestroyed()
      ? mainWindow.getBounds()
      : screen.getPrimaryDisplay().bounds
    const display = screen.getDisplayMatching(baseBounds)
    const list = getResolutionListForDisplay(display).map(
      (item) => `${item.width}x${item.height}`,
    )
    const physicalWorkArea = toPhysicalSize(
      display,
      display.workArea.width,
      display.workArea.height,
    )
    const physicalBounds = toPhysicalSize(
      display,
      display.bounds.width,
      display.bounds.height,
    )

    return {
      list,
      max: `${physicalBounds.width}x${physicalBounds.height}`,
      workAreaMax: `${physicalWorkArea.width}x${physicalWorkArea.height}`,
      scaleFactor: display.scaleFactor,
    }
  })
  ipcMain.handle('display:apply-settings', async (_event, payload) => {
    windowSettings = sanitizeWindowSettings(payload)
    await applyWindowMode(mainWindow, windowSettings)
    await saveWindowSettings()

    return {
      ok: true,
      settings: windowSettings,
      runtime: getWindowRuntimeState(mainWindow),
    }
  })

  // 立绘文件选择对话框
  ipcMain.handle('dialog:select-portrait', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { canceled: true, filePaths: [] }
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }
      ],
      title: '选择立绘图片'
    })

    return result
  })

  // 读取图片文件为 Base64（用于预览）
  ipcMain.handle('file:read-image', async (_event, filePath) => {
    if (!filePath || typeof filePath !== 'string') {
      return null
    }

    // 验证路径安全性：只允许本地文件
    const normalizedPath = path.normalize(filePath)
    if (normalizedPath.includes('..') || !path.isAbsolute(normalizedPath)) {
      return null
    }

    // 验证文件扩展名
    const ext = path.extname(normalizedPath).toLowerCase()
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
    if (!allowedExtensions.includes(ext)) {
      return null
    }

    try {
      const fileBuffer = await fsPromises.readFile(normalizedPath)
      const base64 = fileBuffer.toString('base64')
      const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
        : ext === '.png' ? 'image/png'
        : ext === '.gif' ? 'image/gif'
        : ext === '.webp' ? 'image/webp'
        : ext === '.bmp' ? 'image/bmp'
        : 'image/png'

      return { base64, mimeType, path: normalizedPath }
    } catch {
      return null
    }
  })

  // ========== 存档系统 IPC 处理程序 ==========

  // 获取存档目录路径
  ipcMain.handle('save:get-dir', () => {
    return getSavesDir()
  })

  // 获取存档列表
  ipcMain.handle('save:get-list', async () => {
    return await getSaveList()
  })

  // 保存游戏
  ipcMain.handle('save:game', async (_event, saveData, slotId) => {
    return await saveGame(saveData, slotId)
  })

  // 加载存档
  ipcMain.handle('save:load', async (_event, slotId) => {
    return await loadGame(slotId)
  })

  // 删除存档
  ipcMain.handle('save:delete', async (_event, slotId) => {
    return await deleteSave(slotId)
  })

  // 获取备份列表
  ipcMain.handle('backup:get-list', async () => {
    return await getBackupList()
  })

  // 创建备份
  ipcMain.handle('backup:create', async (_event, backupData) => {
    return await createBackup(backupData)
  })

  // 加载备份
  ipcMain.handle('backup:load', async (_event, backupId) => {
    return await loadBackup(backupId)
  })

  // 删除备份
  ipcMain.handle('backup:delete', async (_event, backupId) => {
    return await deleteBackup(backupId)
  })

  // ========== BGM音乐播放器 IPC 处理程序 ==========

  // 支持的音频格式
  const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma']

  // 选择BGM文件夹
  ipcMain.handle('bgm:select-folder', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, error: 'Window not available' }
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择BGM文件夹'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    const folderPath = result.filePaths[0]
    
    try {
      const files = await fsPromises.readdir(folderPath)
      const audioFiles = files
        .filter(file => {
          const ext = path.extname(file).toLowerCase()
          return AUDIO_EXTENSIONS.includes(ext)
        })
        .map((file, index) => ({
          id: index,
          name: path.basename(file, path.extname(file)),
          fullName: file,
          path: path.join(folderPath, file)
        }))

      return {
        success: true,
        folderPath,
        files: audioFiles
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 加载指定文件夹中的音频文件
  ipcMain.handle('bgm:load-folder', async (_event, folderPath) => {
    if (!folderPath || typeof folderPath !== 'string') {
      return { success: false, error: 'Invalid folder path' }
    }

    // 验证路径安全性
    const normalizedPath = path.normalize(folderPath)
    if (normalizedPath.includes('..') || !path.isAbsolute(normalizedPath)) {
      return { success: false, error: 'Invalid folder path' }
    }

    try {
      const files = await fsPromises.readdir(normalizedPath)
      const audioFiles = files
        .filter(file => {
          const ext = path.extname(file).toLowerCase()
          return AUDIO_EXTENSIONS.includes(ext)
        })
        .map((file, index) => ({
          id: index,
          name: path.basename(file, path.extname(file)),
          fullName: file,
          path: path.join(normalizedPath, file)
        }))

      return {
        success: true,
        folderPath: normalizedPath,
        files: audioFiles
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 读取音频文件为Base64（用于播放）
  ipcMain.handle('bgm:read-audio', async (_event, filePath) => {
    if (!filePath || typeof filePath !== 'string') {
      return null
    }

    // 验证路径安全性
    const normalizedPath = path.normalize(filePath)
    if (normalizedPath.includes('..') || !path.isAbsolute(normalizedPath)) {
      return null
    }

    // 验证文件扩展名
    const ext = path.extname(normalizedPath).toLowerCase()
    if (!AUDIO_EXTENSIONS.includes(ext)) {
      return null
    }

    try {
      const fileBuffer = await fsPromises.readFile(normalizedPath)
      const base64 = fileBuffer.toString('base64')
      const mimeType = ext === '.mp3' ? 'audio/mpeg'
        : ext === '.wav' ? 'audio/wav'
        : ext === '.ogg' ? 'audio/ogg'
        : ext === '.flac' ? 'audio/flac'
        : ext === '.m4a' ? 'audio/mp4'
        : ext === '.aac' ? 'audio/aac'
        : ext === '.wma' ? 'audio/x-ms-wma'
        : 'audio/mpeg'

      return { base64, mimeType, path: normalizedPath }
    } catch {
      return null
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
