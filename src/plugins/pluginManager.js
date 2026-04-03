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

// 插件目录路径
const PLUGINS_DIR = 'plugins'

// 已加载的插件缓存
const loadedPlugins = new Map()

// 当前启用的插件
const enabledPlugins = new Map()

// 插件配置存储键
const PLUGIN_CONFIG_KEY = 'plugin_config'

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
    return config || { enabled: [], settings: {} }
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
    await kvStorage.set(PLUGIN_CONFIG_KEY, config)
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
  
  try {
    // 通过 Electron API 扫描插件目录
    if (window.avgLLM?.plugins?.scan) {
      const result = await window.avgLLM.plugins.scan()
      if (result.success && result.plugins) {
        plugins.push(...result.plugins)
      }
    } else {
      // 开发环境：从预定义路径加载示例插件
      console.log('Plugin scan API not available, using fallback')
    }
  } catch (e) {
    console.error('Failed to scan plugins:', e)
  }
  
  // 缓存扫描结果
  plugins.forEach(plugin => {
    loadedPlugins.set(plugin.id, plugin)
  })
  
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
  
  try {
    // 加载组件
    const component = await loadPluginComponent(plugin)
    if (!component) {
      console.error(`Failed to load component for plugin: ${pluginId}`)
      return false
    }
    
    // 存储已启用的插件
    enabledPlugins.set(pluginId, {
      ...plugin,
      component,
      status: PluginStatus.ENABLED
    })
    
    // 更新配置
    const config = getPluginConfig()
    if (!config.enabled.includes(pluginId)) {
      config.enabled.push(pluginId)
      savePluginConfig(config)
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
export function disablePlugin(pluginId) {
  if (!enabledPlugins.has(pluginId)) {
    return false
  }
  
  enabledPlugins.delete(pluginId)
  
  // 更新配置
  const config = getPluginConfig()
  config.enabled = config.enabled.filter(id => id !== pluginId)
  savePluginConfig(config)
  
  // 触发插件禁用事件
  window.dispatchEvent(new CustomEvent('plugin-disabled', { 
    detail: { pluginId } 
  }))
  
  return true
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
    if (plugin.type === type) {
      return plugin.component
    }
  }
  return null
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
  // 扫描插件
  await scanPlugins()
  
  // 恢复已启用的插件
  const config = getPluginConfig()
  for (const pluginId of config.enabled) {
    await enablePlugin(pluginId)
  }
  
  console.log('Plugin system initialized')
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
    // 先禁用
    disablePlugin(pluginId)
    
    if (window.avgLLM?.plugins?.uninstall) {
      const result = await window.avgLLM.plugins.uninstall(pluginId)
      if (result.success) {
        loadedPlugins.delete(pluginId)
      }
      return result
    }
    return { success: false, message: 'Plugin uninstall API not available' }
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
  isPluginEnabled,
  getAllPlugins,
  initPluginSystem,
  installPlugin,
  uninstallPlugin,
  getPluginConfig,
  savePluginConfig
}