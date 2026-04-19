/**
 * promptRegistry.js - Prompt 注册与管理服务
 *
 * 集中管理所有 LLM Prompt，支持用户自定义覆盖。
 * 默认值来自 promptDefaults.js，用户覆盖存储在 kvStorage('prompt_overrides')。
 */
import { kvStorage } from '../storage/index.js'
import { PROMPT_DEFAULTS } from './promptDefaults.js'

const STORAGE_KEY = 'prompt_overrides'

// 内存缓存，避免每次调用都读 kvStorage
let _overridesCache = null
let _defaultsMap = null

/** 初始化默认值 Map */
function _initDefaultsMap() {
  if (_defaultsMap) return _defaultsMap
  _defaultsMap = new Map()
  for (const def of PROMPT_DEFAULTS) {
    _defaultsMap.set(def.id, def)
  }
  return _defaultsMap
}

/** 加载用户覆盖 */
async function _loadOverrides() {
  if (_overridesCache !== null) return _overridesCache
  try {
    _overridesCache = await kvStorage.get(STORAGE_KEY) || {}
  } catch {
    _overridesCache = {}
  }
  return _overridesCache
}

/** 重置缓存（用于测试或数据变更后） */
function _resetCache() {
  _overridesCache = null
  _defaultsMap = null
}

/**
 * 解析指定 prompt：返回用户自定义值或内置默认值
 * @param {string} id - prompt ID，如 'core:story_generation'
 * @returns {string}
 */
export async function resolvePrompt(id) {
  const overrides = await _loadOverrides()
  if (overrides[id] !== undefined && overrides[id] !== null) {
    return String(overrides[id])
  }
  const def = _initDefaultsMap().get(id)
  return def ? def.defaultValue : ''
}

/**
 * 同步版本的 resolvePrompt（使用当前缓存，不触发 kvStorage 读取）
 * 适用于已经 _loadOverrides 之后的场景。
 * @param {string} id
 * @returns {string}
 */
export function resolvePromptSync(id) {
  if (_overridesCache && _overridesCache[id] !== undefined && _overridesCache[id] !== null) {
    return String(_overridesCache[id])
  }
  const def = _initDefaultsMap().get(id)
  return def ? def.defaultValue : ''
}

/**
 * 设置用户自定义 prompt
 * @param {string} id - prompt ID
 * @param {string} value - 自定义内容
 */
export async function setOverride(id, value) {
  const overrides = await _loadOverrides()
  overrides[id] = String(value)
  overrides._updatedAt = new Date().toISOString()
  await kvStorage.set(STORAGE_KEY, overrides)
  _overridesCache = overrides // 保持缓存同步
}

/**
 * 重置单个 prompt 为默认值
 * @param {string} id - prompt ID
 */
export async function resetToDefault(id) {
  const overrides = await _loadOverrides()
  delete overrides[id]
  await kvStorage.set(STORAGE_KEY, overrides)
  _overridesCache = overrides
}

/**
 * 获取单个 prompt 的完整信息（默认值 + 用户值 + 元数据）
 * @param {string} id - prompt ID
 * @returns {Promise<{id, category, name, description, defaultValue, userValue, protocol, isCustomized, updatedAt}>}
 */
export async function getPromptInfo(id) {
  const def = _initDefaultsMap().get(id)
  if (!def) {
    return null
  }
  const overrides = await _loadOverrides()
  const userValue = (overrides[id] !== undefined && overrides[id] !== null) ? String(overrides[id]) : null
  return {
    id: def.id,
    category: def.category,
    name: def.name,
    description: def.description,
    defaultValue: def.defaultValue,
    userValue,
    protocol: def.protocol,
    isCustomized: userValue !== null,
    updatedAt: def.updatedAt || null,
  }
}

/**
 * 获取所有 prompt 摘要列表
 * @returns {Promise<Array<{id, category, name, description, protocol, isCustomized}>>}
 */
export async function listAllPrompts() {
  const overrides = await _loadOverrides()
  const defaults = _initDefaultsMap()
  const result = []
  for (const def of PROMPT_DEFAULTS) {
    result.push({
      id: def.id,
      category: def.category,
      name: def.name,
      description: def.description,
      protocol: def.protocol,
      isCustomized: (overrides[def.id] !== undefined && overrides[def.id] !== null),
    })
  }
  return result
}

/**
 * 获取某个分类下的所有 prompt 摘要
 * @param {string} category
 * @returns {Promise<Array>}
 */
export async function listPromptsByCategory(category) {
  const all = await listAllPrompts()
  return all.filter((p) => p.category === category)
}

/**
 * 导出全部 prompt（含自定义值）
 * @returns {Promise<Object>}
 */
export async function exportAll() {
  const overrides = await _loadOverrides()
  const defaults = _initDefaultsMap()
  const exportData = {}
  for (const def of PROMPT_DEFAULTS) {
    const userValue = overrides[def.id]
    exportData[def.id] = {
      category: def.category,
      name: def.name,
      description: def.description,
      protocol: def.protocol,
      defaultValue: def.defaultValue,
      userValue: userValue !== undefined && userValue !== null ? String(userValue) : null,
    }
  }
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    prompts: exportData,
  }
}

/**
 * 导入 prompt 配置
 * @param {Object|string} data - 导入数据（对象或 JSON 字符串）
 * @returns {{success: boolean, message: string, importedCount: number}}
 */
export async function importAll(data) {
  let parsed
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data)
    } catch {
      return { success: false, message: 'JSON 解析失败', importedCount: 0 }
    }
  } else {
    parsed = data
  }

  if (!parsed || !parsed.prompts || typeof parsed.prompts !== 'object') {
    return { success: false, message: '导入数据格式无效', importedCount: 0 }
  }

  const defaults = _initDefaultsMap()
  const overrides = await _loadOverrides()
  let importedCount = 0

  for (const [id, promptData] of Object.entries(parsed.prompts)) {
    if (!defaults.has(id)) continue // 跳过未知的 prompt ID
    if (promptData.userValue !== undefined && promptData.userValue !== null) {
      overrides[id] = String(promptData.userValue)
      importedCount++
    } else {
      delete overrides[id] // 导入的数据没有自定义值，清除覆盖
    }
  }

  overrides._updatedAt = new Date().toISOString()
  await kvStorage.set(STORAGE_KEY, overrides)
  _overridesCache = overrides

  return {
    success: true,
    message: `成功导入 ${importedCount} 个自定义 prompt`,
    importedCount,
  }
}

/**
 * 重置全部 prompt 为默认值
 * @returns {{success: boolean, message: string}}
 */
export async function resetAll() {
  await kvStorage.set(STORAGE_KEY, {})
  _overridesCache = {}
  return { success: true, message: '已重置所有 prompt 为默认值' }
}

/**
 * 获取所有分类列表
 */
export { PROMPT_CATEGORIES } from './promptDefaults.js'

/**
 * 获取所有默认 prompt 定义（供 UI 使用）
 */
export { PROMPT_DEFAULTS } from './promptDefaults.js'

/**
 * 工具：清除模块缓存（用于测试）
 */
export function __resetRegistryCache() {
  _resetCache()
}
