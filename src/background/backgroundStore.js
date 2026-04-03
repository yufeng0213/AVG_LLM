/**
 * 背景状态管理
 * 管理背景文件夹、场景配置和背景图片加载
 */

import { ref, computed } from 'vue'

// 背景文件夹路径
export const backgroundFolderPath = ref(null)

// 可用背景图片列表
export const backgroundList = ref([])

// 当前场景
export const currentScene = ref(null)

// 当前背景图片 URL（Base64）
export const currentBackgroundUrl = ref(null)

// 背景图片缓存
const backgroundCache = new Map()

// 默认背景路径
const DEFAULT_BACKGROUND = null

/**
 * 检查是否在 Electron 环境中
 */
const isElectronEnv = () => {
  return window.avgLLM?.background?.scanFolder && window.avgLLM?.background?.readImage
}

/**
 * 加载背景文件夹
 * @param {string} folderPath - 文件夹路径（可选，不传则使用默认路径）
 * @returns {Promise<Object>} 加载结果
 */
export const loadBackgroundFolder = async (folderPath = null) => {
  if (!isElectronEnv()) {
    console.warn('背景 API 不可用，请在 Electron 环境中运行')
    return { success: false, error: 'NOT_ELECTRON_ENV' }
  }

  try {
    console.log('正在扫描背景文件夹...', folderPath || '(使用默认目录)')
    const result = await window.avgLLM.background.scanFolder(folderPath)
    console.log('扫描结果:', result)
    
    if (result.success) {
      backgroundFolderPath.value = result.path
      backgroundList.value = result.files.map(file => ({
        id: generateBackgroundId(file.name),
        name: file.name,
        path: file.path,
        label: generateBackgroundLabel(file.name),
      }))
      
      console.log(`已加载 ${backgroundList.value.length} 个背景图片:`, backgroundList.value.map(bg => bg.name).join(', '))
      
      // 加载成功后自动加载默认背景
      await loadDefaultBackground()
    }
    
    return result
  } catch (error) {
    console.error('加载背景文件夹失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 根据场景切换背景
 * @param {Object} scene - 场景配置
 * @param {string} scene.id - 场景ID
 * @param {string} scene.name - 场景名称
 * @param {string} scene.background - 背景文件名或路径
 */
export const switchBackground = async (scene) => {
  // 没有场景配置，尝试加载默认背景
  if (!scene?.background) {
    await loadDefaultBackground()
    currentScene.value = null
    return { success: true }
  }

  // 查找背景文件
  const backgroundFile = findBackgroundFile(scene.background)
  if (!backgroundFile) {
    console.warn(`背景文件未找到: ${scene.background}，尝试使用默认背景`)
    await loadDefaultBackground()
    currentScene.value = scene
    return { success: false, error: 'BACKGROUND_NOT_FOUND' }
  }

  // 检查缓存
  if (backgroundCache.has(backgroundFile.path)) {
    currentBackgroundUrl.value = backgroundCache.get(backgroundFile.path)
    currentScene.value = scene
    return { success: true }
  }

  // 读取图片
  try {
    const result = await readBackgroundImage(backgroundFile.path)
    if (result.success) {
      const url = `data:${result.mimeType};base64,${result.base64}`
      backgroundCache.set(backgroundFile.path, url)
      currentBackgroundUrl.value = url
      currentScene.value = scene
      return { success: true }
    }
    // 读取失败，尝试默认背景
    await loadDefaultBackground()
    return { success: false, error: result.error }
  } catch (error) {
    console.error('读取背景图片失败:', error)
    await loadDefaultBackground()
    return { success: false, error: error.message }
  }
}

/**
 * 加载默认背景（名为 default 的背景图片）
 */
const loadDefaultBackground = async () => {
  // 如果背景列表为空，无法加载
  if (!backgroundList.value || backgroundList.value.length === 0) {
    console.log('背景列表为空，无法加载默认背景')
    currentBackgroundUrl.value = DEFAULT_BACKGROUND
    return
  }
  
  // 查找名为 default 的背景（按多种方式匹配）
  let defaultFile = null
  
  // 1. 按文件名精确匹配（default.png, default.jpg 等）
  defaultFile = backgroundList.value.find(bg => {
    const nameWithoutExt = bg.name.replace(/\.[^.]+$/, '').toLowerCase()
    return nameWithoutExt === 'default'
  })
  
  // 2. 按 ID 匹配（bg_default）
  if (!defaultFile) {
    defaultFile = backgroundList.value.find(bg => bg.id === 'bg_default')
  }
  
  // 3. 按文件名包含 default
  if (!defaultFile) {
    defaultFile = backgroundList.value.find(bg =>
      bg.name.toLowerCase().includes('default')
    )
  }
  
  // 4. 按 ID 包含 default
  if (!defaultFile) {
    defaultFile = backgroundList.value.find(bg =>
      bg.id.includes('default')
    )
  }
  
  if (!defaultFile) {
    console.log('未找到默认背景文件，可用背景:', backgroundList.value.map(bg => bg.name).join(', '))
    currentBackgroundUrl.value = DEFAULT_BACKGROUND
    return
  }
  
  console.log('找到默认背景:', defaultFile.name)
  
  // 检查缓存
  if (backgroundCache.has(defaultFile.path)) {
    currentBackgroundUrl.value = backgroundCache.get(defaultFile.path)
    return
  }
  
  // 读取默认背景图片
  try {
    const result = await readBackgroundImage(defaultFile.path)
    if (result.success) {
      const url = `data:${result.mimeType};base64,${result.base64}`
      backgroundCache.set(defaultFile.path, url)
      currentBackgroundUrl.value = url
      console.log('默认背景加载成功')
    }
  } catch (error) {
    console.warn('加载默认背景失败:', error)
    currentBackgroundUrl.value = DEFAULT_BACKGROUND
  }
}

/**
 * 根据背景ID或文件名查找背景文件
 * @param {string} backgroundIdOrName - 背景ID或文件名
 * @returns {Object|null} 背景文件信息
 */
const findBackgroundFile = (backgroundIdOrName) => {
  if (!backgroundIdOrName) return null
  
  // 先按ID精确匹配
  let found = backgroundList.value.find(bg => bg.id === backgroundIdOrName)
  if (found) return found
  
  // 再按文件名匹配
  found = backgroundList.value.find(bg => bg.name === backgroundIdOrName)
  if (found) return found
  
  // 按文件名模糊匹配（不含扩展名）
  const nameWithoutExt = backgroundIdOrName.replace(/\.[^.]+$/, '')
  found = backgroundList.value.find(bg => {
    const bgNameWithoutExt = bg.name.replace(/\.[^.]+$/, '')
    return bgNameWithoutExt === nameWithoutExt
  })
  
  return found || null
}

/**
 * 读取背景图片
 * @param {string} filePath - 文件路径
 * @returns {Promise<Object>} 读取结果
 */
const readBackgroundImage = async (filePath) => {
  if (!isElectronEnv()) {
    return { success: false, error: 'NOT_ELECTRON_ENV' }
  }
  
  return await window.avgLLM.background.readImage(filePath)
}

/**
 * 生成背景ID
 * @param {string} fileName - 文件名
 * @returns {string} 背景ID
 */
const generateBackgroundId = (fileName) => {
  return `bg_${fileName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
}

/**
 * 生成背景标签（从文件名提取）
 * @param {string} fileName - 文件名
 * @returns {string} 标签
 */
const generateBackgroundLabel = (fileName) => {
  // 移除扩展名
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, '')
  // 替换下划线和连字符为空格
  return nameWithoutExt.replace(/[_-]/g, ' ')
}

/**
 * 清除背景缓存
 */
export const clearBackgroundCache = () => {
  backgroundCache.clear()
}

/**
 * 获取背景样式
 */
export const backgroundStyle = computed(() => {
  if (!currentBackgroundUrl.value) {
    return {}
  }
  return {
    backgroundImage: `url(${currentBackgroundUrl.value})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
})

/**
 * 创建空场景配置
 */
export const createEmptyScene = () => ({
  id: `scene_${Date.now()}`,
  name: '',
  background: '',
  description: '',
})

/**
 * 规范化场景数据
 */
export const normalizeScene = (rawScene) => {
  if (!rawScene || typeof rawScene !== 'object') {
    return null
  }
  
  return {
    id: String(rawScene.id || `scene_${Date.now()}`),
    name: String(rawScene.name || ''),
    background: String(rawScene.background || ''),
    description: String(rawScene.description || ''),
  }
}

/**
 * 规范化场景数组
 */
export const normalizeScenes = (rawScenes) => {
  if (!Array.isArray(rawScenes)) {
    return []
  }
  return rawScenes.map(normalizeScene).filter(Boolean)
}