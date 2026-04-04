/**
 * 插件管理器
 * 负责插件的扫描、加载、启用/禁用等管理功能
 */

import { kvStorage } from '../storage/index.js'

// 插件类型定义
export const PluginTypes = {
  MUSIC_PLAYER: 'music-player',
  COMPONENT: 'component',
  THEME: 'theme',
  PHONE: 'phone'
}

// 插件状态
export const PluginStatus = {
  DISABLED: 'disabled',
  ENABLED: 'enabled',
  ERROR: 'error'
}

// 已加载的插件缓存
const loadedPlugins = new Map()

// 当前启用的插件
const enabledPlugins = new Map()

// 插件配置存储键
const PLUGIN_CONFIG_KEY = 'plugin_config'
const NATIVE_PLUGIN_MANIFESTS_KEY = 'native_plugin_manifests'
const SCAN_TIMEOUT_MS = 8000
const BUILTIN_PLUGIN_INIT_FLAG = '__builtinDefaultsInitialized'

const BUILTIN_PLUGIN_IDS_BY_TYPE = {
  [PluginTypes.MUSIC_PLAYER]: 'builtin-music-player',
  [PluginTypes.PHONE]: 'builtin-phone',
}

const BUILTIN_PLUGIN_DEFINITIONS = [
  {
    id: BUILTIN_PLUGIN_IDS_BY_TYPE[PluginTypes.MUSIC_PLAYER],
    name: '默认音乐播放器',
    version: '1.0.0',
    author: 'AVG_LLM',
    description: '内置音乐播放器插件，可在插件管理中启用或禁用。',
    type: PluginTypes.MUSIC_PLAYER,
    entry: 'builtin://music-player',
    icon: '🎵',
    replaces: ['MusicPlayer'],
    config: {
      loop: true,
      defaultVolume: 0.7,
    },
    runtime: 'built-in',
    builtIn: true,
  },
  {
    id: BUILTIN_PLUGIN_IDS_BY_TYPE[PluginTypes.PHONE],
    name: '默认手机面板',
    version: '1.0.0',
    author: 'AVG_LLM',
    description: '内置手机插件，可在插件管理中启用或禁用。',
    type: PluginTypes.PHONE,
    entry: 'builtin://phone',
    icon: '📱',
    replaces: ['Phone'],
    config: {
      floating: true,
      shortcutCount: 4,
    },
    runtime: 'built-in',
    builtIn: true,
  },
]

let initPromise = null
let initialized = false

const normalizePluginConfig = (config) => {
  const enabled = Array.isArray(config?.enabled)
    ? [...new Set(config.enabled.filter((id) => typeof id === 'string' && id.trim()))]
    : []

  const settings = config?.settings && typeof config.settings === 'object'
    ? config.settings
    : {}

  return { enabled, settings }
}

const withTimeout = (promise, timeoutMs, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    reject(new Error(`${label}超时（${timeoutMs}ms）`))
  }, timeoutMs)

  Promise.resolve(promise)
    .then((result) => {
      clearTimeout(timer)
      resolve(result)
    })
    .catch((error) => {
      clearTimeout(timer)
      reject(error)
    })
})

const normalizePluginManifest = (manifest) => {
  if (!manifest || typeof manifest !== 'object') {
    return null
  }

  const id = typeof manifest.id === 'string' ? manifest.id.trim() : ''
  const name = typeof manifest.name === 'string' ? manifest.name.trim() : ''
  const type = typeof manifest.type === 'string' ? manifest.type.trim() : ''

  if (!id || !name || !type) {
    return null
  }

  const runtime = manifest.runtime === 'native-manifest'
    ? 'native-manifest'
    : manifest.runtime === 'built-in'
      ? 'built-in'
      : manifest.runtime

  return {
    id,
    name,
    version: typeof manifest.version === 'string' && manifest.version.trim()
      ? manifest.version.trim()
      : '1.0.0',
    author: typeof manifest.author === 'string' && manifest.author.trim()
      ? manifest.author.trim()
      : 'Unknown',
    description: typeof manifest.description === 'string' && manifest.description.trim()
      ? manifest.description.trim()
      : '',
    type,
    entry: typeof manifest.entry === 'string' && manifest.entry.trim()
      ? manifest.entry.trim()
      : 'index.vue',
    icon: typeof manifest.icon === 'string' && manifest.icon.trim()
      ? manifest.icon.trim()
      : '📦',
    replaces: Array.isArray(manifest.replaces)
      ? manifest.replaces.filter((item) => typeof item === 'string' && item.trim())
      : [],
    config: manifest.config && typeof manifest.config === 'object'
      ? manifest.config
      : {},
    // Android 导入与内置插件运行时标记
    runtime,
    builtIn: Boolean(manifest.builtIn) || runtime === 'built-in',
  }
}

const getBuiltInPluginManifests = () => BUILTIN_PLUGIN_DEFINITIONS
  .map((manifest) => normalizePluginManifest(manifest))
  .filter(Boolean)

const readNativePluginManifests = async () => {
  try {
    const stored = await kvStorage.get(NATIVE_PLUGIN_MANIFESTS_KEY)
    if (!Array.isArray(stored)) {
      return []
    }

    return stored
      .map((item) => normalizePluginManifest(item))
      .filter(Boolean)
      .map((item) => ({
        ...item,
        runtime: 'native-manifest',
        builtIn: false,
      }))
  } catch (e) {
    console.error('Failed to read native plugin manifests:', e)
    return []
  }
}

const writeNativePluginManifests = async (manifests) => {
  const normalized = Array.isArray(manifests)
    ? manifests.map((item) => normalizePluginManifest(item)).filter(Boolean)
    : []

  const payload = normalized.map((item) => ({
    ...item,
    runtime: 'native-manifest',
    builtIn: false,
  }))

  await kvStorage.set(NATIVE_PLUGIN_MANIFESTS_KEY, payload)
}

/**
 * 插件元数据结构
 * @typedef {Object} PluginManifest
 * @property {string} id - 插件唯一标识
 * @property {string} name - 插件名称
 * @property {string} version - 插件版本
 * @property {string} author - 插件作者
 * @property {string} description - 插件描述
 * @property {string} type - 插件类型 (music-player, component, theme)
 * @property {string} entry - 入口组件文件路径
 * @property {string} icon - 插件图标 (emoji或图片路径)
 * @property {string[]} replaces - 要替换的组件列表
 * @property {Object} config - 插件配置项定义
 */

/**
 * 获取插件配置
 * @returns {Promise<Object>} 插件配置对象
 */
export async function getPluginConfig() {
  try {
    const config = await kvStorage.get(PLUGIN_CONFIG_KEY)
    return normalizePluginConfig(config)
  } catch (e) {
    console.error('Failed to load plugin config:', e)
    return { enabled: [], settings: {} }
  }
}

/**
 * 保存插件配置
 * @param {Object} config - 插件配置对象
 */
export async function savePluginConfig(config) {
  try {
    await kvStorage.set(PLUGIN_CONFIG_KEY, normalizePluginConfig(config))
  } catch (e) {
    console.error('Failed to save plugin config:', e)
  }
}

/**
 * 扫描插件目录
 * @returns {Promise<PluginManifest[]>} 插件列表
 */
export async function scanPlugins() {
  const plugins = []
  const candidates = []
  
  try {
    candidates.push(...getBuiltInPluginManifests())

    // 通过 Electron API 扫描插件目录
    if (window.avgLLM?.plugins?.scan) {
      const result = await withTimeout(window.avgLLM.plugins.scan(), SCAN_TIMEOUT_MS, '插件扫描')
      if (result?.success && Array.isArray(result.plugins)) {
        candidates.push(
          ...result.plugins
            .map((plugin) => normalizePluginManifest(plugin))
            .filter(Boolean)
        )
      }
    } else {
      console.log('Plugin scan API not available, using native/web fallback')
    }

    const nativePlugins = await readNativePluginManifests()
    candidates.push(...nativePlugins)
  } catch (e) {
    console.error('Failed to scan plugins:', e)
  }

  // 同 ID 去重，按添加顺序优先（内置 > 扫描到的外部 > Android 导入 manifest）
  const seen = new Set()
  candidates.forEach((plugin) => {
    if (!plugin?.id || seen.has(plugin.id)) {
      return
    }
    seen.add(plugin.id)
    plugins.push(plugin)
  })
  
  // 缓存扫描结果
  loadedPlugins.clear()
  plugins.forEach((plugin) => {
    loadedPlugins.set(plugin.id, plugin)
  })

  // 清理失效的启用缓存
  for (const pluginId of enabledPlugins.keys()) {
    if (!loadedPlugins.has(pluginId)) {
      enabledPlugins.delete(pluginId)
    }
  }
  
  return plugins
}

/**
 * 加载单个插件元数据
 * @param {string} pluginId - 插件ID
 * @returns {Promise<PluginManifest|null>} 插件元数据
 */
export async function loadPluginManifest(pluginId) {
  try {
    if (window.avgLLM?.plugins?.loadManifest) {
      const result = await window.avgLLM.plugins.loadManifest(pluginId)
      if (result.success) {
        return result.manifest
      }
    }
    return null
  } catch (e) {
    console.error(`Failed to load plugin manifest: ${pluginId}`, e)
    return null
  }
}

/**
 * 加载插件组件
 * @param {PluginManifest} plugin - 插件元数据
 * @returns {Promise<Object|null>} Vue组件对象
 */
export async function loadPluginComponent(plugin) {
  try {
    // 通过 Electron API 加载组件
    if (window.avgLLM?.plugins?.loadComponent) {
      const result = await window.avgLLM.plugins.loadComponent(plugin.id)
      if (result.success && result.component) {
        return result.component
      }
    }
    
    // 开发环境回退：尝试动态导入
    // 注意：这需要 Vite 的特殊配置支持
    const componentPath = `/src/plugins/${plugin.id}/${plugin.entry}`
    const module = await import(/* @vite-ignore */ componentPath)
    return module.default || module
  } catch (e) {
    console.error(`Failed to load plugin component: ${plugin.id}`, e)
    return null
  }
}

/**
 * 启用插件
 * @param {string} pluginId - 插件ID
 * @returns {Promise<boolean>} 是否成功
 */
export async function enablePlugin(pluginId) {
  const plugin = loadedPlugins.get(pluginId)
  if (!plugin) {
    console.error(`Plugin not found: ${pluginId}`)
    return false
  }

  if (enabledPlugins.has(pluginId)) {
    return true
  }
  
  try {
    let component = null
    const isBuiltIn = Boolean(plugin.builtIn) || plugin.runtime === 'built-in'

    // 内置插件不需要加载外部组件，渲染层使用默认组件
    if (!isBuiltIn) {
      component = await loadPluginComponent(plugin)
      if (!component) {
        console.error(`Failed to load component for plugin: ${pluginId}`)
        return false
      }
    }
    
    // 存储已启用的插件
    enabledPlugins.set(pluginId, {
      ...plugin,
      component,
      status: PluginStatus.ENABLED
    })
    
    // 更新配置
    const config = await getPluginConfig()
    if (!config.enabled.includes(pluginId)) {
      config.enabled.push(pluginId)
      await savePluginConfig(config)
    }
    
    // 触发插件启用事件
    window.dispatchEvent(new CustomEvent('plugin-enabled', { 
      detail: { pluginId, plugin } 
    }))
    
    return true
  } catch (e) {
    console.error(`Failed to enable plugin: ${pluginId}`, e)
    return false
  }
}

/**
 * 禁用插件
 * @param {string} pluginId - 插件ID
 * @returns {boolean} 是否成功
 */
export async function disablePlugin(pluginId) {
  if (!enabledPlugins.has(pluginId)) {
    return false
  }
  
  try {
    const plugin = enabledPlugins.get(pluginId)
    enabledPlugins.delete(pluginId)
    
    // 更新配置
    const config = await getPluginConfig()
    config.enabled = config.enabled.filter((id) => id !== pluginId)
    await savePluginConfig(config)
    
    // 触发插件禁用事件
    window.dispatchEvent(new CustomEvent('plugin-disabled', { 
      detail: { pluginId, plugin } 
    }))
    
    return true
  } catch (e) {
    console.error(`Failed to disable plugin: ${pluginId}`, e)
    return false
  }
}

/**
 * 获取已启用的插件
 * @param {string} type - 插件类型（可选）
 * @returns {Map<string, Object>} 已启用的插件Map
 */
export function getEnabledPlugins(type = null) {
  if (!type) {
    return new Map(enabledPlugins)
  }
  
  const filtered = new Map()
  enabledPlugins.forEach((plugin, id) => {
    if (plugin.type === type) {
      filtered.set(id, plugin)
    }
  })
  return filtered
}

/**
 * 获取指定类型的启用插件组件
 * @param {string} type - 插件类型
 * @returns {Object|null} Vue组件或null
 */
export function getPluginComponent(type) {
  for (const plugin of enabledPlugins.values()) {
    if (plugin.type === type && plugin.component) {
      return plugin.component
    }
  }
  return null
}

export function getBuiltinPluginIdByType(type) {
  return BUILTIN_PLUGIN_IDS_BY_TYPE[type] || null
}

/**
 * 检查插件是否已启用
 * @param {string} pluginId - 插件ID
 * @returns {boolean}
 */
export function isPluginEnabled(pluginId) {
  return enabledPlugins.has(pluginId)
}

/**
 * 获取所有已扫描的插件
 * @returns {PluginManifest[]}
 */
export function getAllPlugins() {
  return Array.from(loadedPlugins.values())
}

/**
 * 初始化插件系统
 * @returns {Promise<void>}
 */
export async function initPluginSystem() {
  if (initialized) {
    return
  }

  if (initPromise) {
    await initPromise
    return
  }

  initPromise = (async () => {
    // 扫描插件
    await scanPlugins()
    
    // 首次初始化时默认启用内置插件，仅执行一次，后续尊重用户手动禁用状态
    const config = await getPluginConfig()
    if (!config.settings[BUILTIN_PLUGIN_INIT_FLAG]) {
      const enabledSet = new Set(config.enabled)
      Object.values(BUILTIN_PLUGIN_IDS_BY_TYPE).forEach((pluginId) => {
        if (loadedPlugins.has(pluginId)) {
          enabledSet.add(pluginId)
        }
      })
      config.enabled = Array.from(enabledSet)
      config.settings = {
        ...config.settings,
        [BUILTIN_PLUGIN_INIT_FLAG]: true,
      }
      await savePluginConfig(config)
    }

    // 恢复已启用的插件
    for (const pluginId of config.enabled) {
      if (!loadedPlugins.has(pluginId)) {
        continue
      }
      await enablePlugin(pluginId)
    }
    
    initialized = true
    console.log('Plugin system initialized')
  })()

  try {
    await initPromise
  } finally {
    initPromise = null
  }
}

/**
 * 安装插件（从文件夹或压缩包）
 * @param {string} sourcePath - 插件源路径
 * @returns {Promise<{success: boolean, message: string, plugin?: PluginManifest}>}
 */
export async function installPlugin(sourcePath) {
  try {
    if (window.avgLLM?.plugins?.install) {
      const result = await window.avgLLM.plugins.install(sourcePath)
      if (result.success) {
        // 重新扫描插件
        await scanPlugins()
      }
      return result
    }

    // Android/Web fallback: 允许传入 manifest 对象做导入
    const manifest = normalizePluginManifest(sourcePath?.manifest || sourcePath)
    if (manifest) {
      if (Object.values(BUILTIN_PLUGIN_IDS_BY_TYPE).includes(manifest.id)) {
        return { success: false, message: '该插件ID为内置保留ID，请修改后重试' }
      }

      const current = await readNativePluginManifests()
      const next = current.filter((item) => item.id !== manifest.id)
      next.push({
        ...manifest,
        runtime: 'native-manifest',
        builtIn: false,
      })

      await writeNativePluginManifests(next)
      await scanPlugins()

      return {
        success: true,
        message: '插件导入成功',
        plugin: {
          ...manifest,
          runtime: 'native-manifest',
          builtIn: false,
        },
      }
    }

    return { success: false, message: 'Plugin install API not available' }
  } catch (e) {
    console.error('Failed to install plugin:', e)
    return { success: false, message: e.message }
  }
}

/**
 * 卸载插件
 * @param {string} pluginId - 插件ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function uninstallPlugin(pluginId) {
  try {
    const plugin = loadedPlugins.get(pluginId)
    if (!plugin) {
      return { success: false, message: 'Plugin not found' }
    }

    if (plugin.builtIn || plugin.runtime === 'built-in') {
      return { success: false, message: '内置插件不可卸载' }
    }

    // 先禁用
    await disablePlugin(pluginId)
    
    if (window.avgLLM?.plugins?.uninstall && plugin.runtime !== 'native-manifest') {
      const result = await window.avgLLM.plugins.uninstall(pluginId)
      if (result.success) {
        loadedPlugins.delete(pluginId)
      }
      return result
    }

    const nativePlugins = await readNativePluginManifests()
    const next = nativePlugins.filter((item) => item.id !== pluginId)
    if (next.length === nativePlugins.length) {
      return { success: false, message: 'Plugin not found' }
    }

    await writeNativePluginManifests(next)
    loadedPlugins.delete(pluginId)

    return { success: true, message: '插件已卸载' }
  } catch (e) {
    console.error('Failed to uninstall plugin:', e)
    return { success: false, message: e.message }
  }
}

// 导出单例式的管理器
export default {
  PluginTypes,
  PluginStatus,
  scanPlugins,
  loadPluginManifest,
  loadPluginComponent,
  enablePlugin,
  disablePlugin,
  getEnabledPlugins,
  getPluginComponent,
  getBuiltinPluginIdByType,
  isPluginEnabled,
  getAllPlugins,
  initPluginSystem,
  installPlugin,
  uninstallPlugin,
  getPluginConfig,
  savePluginConfig
}
