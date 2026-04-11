<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { isAndroid } from '../../../src/utils/platform.js'
import {
  scanPlugins,
  enablePlugin,
  disablePlugin,
  isPluginEnabled,
  getAllPlugins,
  installPlugin,
  uninstallPlugin,
  initPluginSystem,
  PluginTypes,
  PluginStatus
} from '../../../src/plugins/pluginManager.js'
import { getLocalFeaturePluginManifests } from '../../../src/features/localFeaturePluginManifests.js'
import {
  getFeaturePluginRuntimeState,
  isFeaturePluginEnabled,
  setFeaturePluginEnabled,
  replaceFeaturePluginRuntimeState,
  resetFeaturePluginEnabledOverride,
  resetFeaturePluginRuntimeState,
  subscribeFeaturePluginRuntimeState,
} from '../../../src/features/featurePluginRuntimeState.js'

const emit = defineEmits(['back'])

// 插件列表
const plugins = ref([])
const loading = ref(true)
const installing = ref(false)
const importing = ref(false)
const message = ref({ type: '', text: '' })
const pluginStatusVersion = ref(0)
const featurePluginStatusVersion = ref(0)
const localFeaturePlugins = getLocalFeaturePluginManifests()
const featurePluginRuntimeState = ref(getFeaturePluginRuntimeState())
const featurePluginManifestById = new Map(
  localFeaturePlugins.map((plugin) => [plugin.id, plugin]),
)

// 插件类型标签
const typeLabels = {
  [PluginTypes.MUSIC_PLAYER]: '音乐播放器',
  [PluginTypes.COMPONENT]: '组件',
  [PluginTypes.THEME]: '主题',
  [PluginTypes.PHONE]: '手机',
  [PluginTypes.HANDHELD]: '掌机',
  [PluginTypes.BACKPACK]: '背包',
}

const isAndroidPlatform = computed(() => isAndroid())

const featurePlugins = computed(() => {
  return localFeaturePlugins.map((plugin) => ({
    ...plugin,
    enabled: isFeaturePluginEnabled(plugin, featurePluginRuntimeState.value),
  }))
})

const canInstallPlugin = computed(() => {
  if (typeof window === 'undefined') {
    return false
  }
  if (window.avgLLM?.plugins?.selectFolder) {
    return true
  }
  return isAndroidPlatform.value
})

const isBuiltInPlugin = (plugin) => {
  return Boolean(plugin?.builtIn) || plugin?.runtime === 'built-in'
}

const getGroupIcon = (type) => {
  if (type === PluginTypes.MUSIC_PLAYER) return '🎵'
  if (type === PluginTypes.THEME) return '🎨'
  if (type === PluginTypes.PHONE) return '📱'
  if (type === PluginTypes.HANDHELD) return '🎮'
  if (type === PluginTypes.BACKPACK) return '🎒'
  return '🧩'
}

const canTogglePlugin = (plugin) => {
  if (!plugin) return false
  if (isBuiltInPlugin(plugin)) return true
  return plugin.runtime !== 'native-manifest'
}

const getToggleTitle = (plugin) => {
  if (isBuiltInPlugin(plugin)) {
    return '切换内置插件启用状态'
  }
  if (plugin.runtime === 'native-manifest') {
    return 'Android 导入的 manifest 插件暂不支持直接启用'
  }
  return '切换启用状态'
}

const getToggleStatusText = (plugin) => {
  if (!canTogglePlugin(plugin)) {
    return '仅导入'
  }
  return getPluginStatus(plugin.id) === PluginStatus.ENABLED ? '已启用' : '已禁用'
}

const getToggleIndicator = (plugin) => {
  if (!canTogglePlugin(plugin)) {
    return '—'
  }
  return getPluginStatus(plugin.id) === PluginStatus.ENABLED ? '●' : '○'
}

const canUninstallPlugin = (plugin) => {
  if (!plugin) return false
  return !isBuiltInPlugin(plugin)
}

const getUninstallTitle = (plugin) => {
  return canUninstallPlugin(plugin) ? '卸载插件' : '内置插件不可卸载'
}

const bumpPluginStatusVersion = () => {
  pluginStatusVersion.value += 1
}

const bumpFeaturePluginStatusVersion = () => {
  featurePluginStatusVersion.value += 1
}

const refreshFeaturePluginRuntimeState = (nextState = null) => {
  featurePluginRuntimeState.value = nextState || getFeaturePluginRuntimeState()
  bumpFeaturePluginStatusVersion()
}

const pickFiles = ({ accept = '', directory = false } = {}) => {
  if (typeof document === 'undefined') {
    return Promise.resolve({ files: [], canceled: true })
  }

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.style.position = 'fixed'
    input.style.left = '-9999px'

    if (accept) {
      input.accept = accept
    }

    if (directory) {
      input.multiple = true
      input.setAttribute('webkitdirectory', '')
      input.setAttribute('directory', '')
    }

    let settled = false

    const finish = (files, canceled = false) => {
      if (settled) {
        return
      }
      settled = true
      window.removeEventListener('focus', handleFocus)
      input.remove()
      resolve({ files, canceled })
    }

    const handleFocus = () => {
      window.setTimeout(() => {
        if (!settled) {
          const files = Array.from(input.files || [])
          finish(files, files.length === 0)
        }
      }, 320)
    }

    input.addEventListener('change', () => {
      finish(Array.from(input.files || []), false)
    }, { once: true })

    input.addEventListener('cancel', () => {
      finish([], true)
    }, { once: true })

    window.addEventListener('focus', handleFocus, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

const extractManifestFromFiles = async (files) => {
  if (!Array.isArray(files) || files.length === 0) {
    return { success: false, message: '未选择文件', canceled: true }
  }

  const manifestFile = files.find((file) => {
    const relative = (file.webkitRelativePath || '').toLowerCase()
    const filename = (file.name || '').toLowerCase()
    return filename === 'plugin.json' || relative.endsWith('/plugin.json')
  })

  if (!manifestFile) {
    return { success: false, message: '未找到 plugin.json 文件' }
  }

  try {
    const text = await manifestFile.text()
    const manifest = JSON.parse(text)
    return { success: true, manifest }
  } catch (error) {
    console.error('Failed to parse plugin manifest:', error)
    return { success: false, message: 'plugin.json 解析失败' }
  }
}

const pickAndroidPluginManifest = async () => {
  const result = await pickFiles({
    accept: '.json,application/json',
    directory: true,
  })

  if (result.canceled || result.files.length === 0) {
    return { success: false, canceled: true, message: '已取消导入' }
  }

  return await extractManifestFromFiles(result.files)
}

// 按类型分组的插件
const pluginsByType = computed(() => {
  const grouped = {}
  Object.values(PluginTypes).forEach(type => {
    grouped[type] = plugins.value.filter(p => p.type === type)
  })
  return grouped
})

const hasAnyPlugin = computed(() => {
  return plugins.value.length > 0 || featurePlugins.value.length > 0
})

const featurePluginOverrideCount = computed(() => {
  return Object.keys(featurePluginRuntimeState.value || {}).length
})

const featurePluginOverrideJson = computed(() => {
  return JSON.stringify(featurePluginRuntimeState.value || {}, null, 2)
})

const copyingFeatureOverrides = ref(false)
const applyingFeatureOverrides = ref(false)
const importingFeatureOverrides = ref(false)
const exportingFeatureOverrides = ref(false)
const featurePluginOverrideInput = ref(featurePluginOverrideJson.value)

// 刷新插件列表
const refreshPlugins = async () => {
  loading.value = true
  try {
    await scanPlugins()
    plugins.value = getAllPlugins()
    bumpPluginStatusVersion()
  } catch (e) {
    console.error('Failed to refresh plugins:', e)
    showMessage('error', '刷新插件列表失败')
  } finally {
    loading.value = false
  }
}

// 切换插件状态
const togglePlugin = async (pluginId) => {
  const enabled = isPluginEnabled(pluginId)
  
  if (enabled) {
    const success = await disablePlugin(pluginId)
    if (success) {
      bumpPluginStatusVersion()
      showMessage('success', '插件已禁用')
    } else {
      showMessage('error', '禁用插件失败')
    }
  } else {
    const success = await enablePlugin(pluginId)
    if (success) {
      bumpPluginStatusVersion()
      showMessage('success', '插件已启用')
    } else {
      showMessage('error', '启用插件失败')
    }
  }
}

const pickAndInstallPlugin = async (mode = 'install') => {
  if (!canInstallPlugin.value) {
    showMessage('error', '当前平台暂不支持安装本地插件')
    return
  }

  const isImportMode = mode === 'import'
  try {
    if (isImportMode) {
      importing.value = true
    } else {
      installing.value = true
    }
    
    let installResult = null

    // Electron: 选择插件目录并安装
    if (window.avgLLM?.plugins?.selectFolder) {
      const result = await window.avgLLM.plugins.selectFolder()
      if (result.success && result.path) {
        installResult = await installPlugin(result.path)
      } else if (result?.canceled) {
        return
      }
    } else if (isAndroidPlatform.value) {
      // Android: 选择包含 plugin.json 的目录并导入 manifest
      const picked = await pickAndroidPluginManifest()
      if (!picked.success) {
        if (!picked.canceled) {
          showMessage('error', picked.message || '导入失败')
        }
        return
      }

      installResult = await installPlugin({
        manifest: picked.manifest,
      })
    } else {
      showMessage('error', '插件安装功能不可用')
      return
    }

    if (installResult?.success) {
      const actionText = isImportMode ? '导入' : '安装'
      showMessage('success', `插件 "${installResult.plugin?.name || '未知'}" ${actionText}成功`)
      await refreshPlugins()
    } else if (installResult) {
      const actionText = isImportMode ? '导入' : '安装'
      showMessage('error', installResult.message || `${actionText}失败`)
    }
  } catch (e) {
    console.error('Plugin import/install error:', e)
    showMessage('error', isImportMode ? '导入插件时发生错误' : '安装插件时发生错误')
  } finally {
    if (isImportMode) {
      importing.value = false
    } else {
      installing.value = false
    }
  }
}

// 安装新插件
const handleInstallPlugin = async () => {
  await pickAndInstallPlugin('install')
}

// 导入插件
const handleImportPlugin = async () => {
  await pickAndInstallPlugin('import')
}

// 卸载插件
const handleUninstallPlugin = async (pluginId) => {
  const plugin = plugins.value.find(p => p.id === pluginId)
  if (!plugin) return

  if (!canUninstallPlugin(plugin)) {
    showMessage('error', '内置插件不可卸载')
    return
  }
  
  if (!confirm(`确定要卸载插件 "${plugin.name}" 吗？`)) {
    return
  }
  
  const result = await uninstallPlugin(pluginId)
  if (result.success) {
    showMessage('success', '插件已卸载')
    await refreshPlugins()
  } else {
    showMessage('error', result.message || '卸载失败')
  }
}

// 显示消息
const showMessage = (type, text) => {
  message.value = { type, text }
  setTimeout(() => {
    message.value = { type: '', text: '' }
  }, 3000)
}

// 获取插件状态
const getPluginStatus = (pluginId) => {
  pluginStatusVersion.value
  return isPluginEnabled(pluginId) ? PluginStatus.ENABLED : PluginStatus.DISABLED
}

const getFeaturePluginStatus = (pluginId) => {
  featurePluginStatusVersion.value
  const plugin = featurePluginManifestById.get(pluginId)
  if (!plugin) return PluginStatus.DISABLED
  return isFeaturePluginEnabled(plugin, featurePluginRuntimeState.value)
    ? PluginStatus.ENABLED
    : PluginStatus.DISABLED
}

const hasFeaturePluginOverride = (pluginId) => {
  const normalizedPluginId = String(pluginId || '').trim()
  if (!normalizedPluginId) return false
  return Object.prototype.hasOwnProperty.call(
    featurePluginRuntimeState.value || {},
    normalizedPluginId,
  )
}

const getFeaturePluginToggleStatusText = (pluginId) => {
  return getFeaturePluginStatus(pluginId) === PluginStatus.ENABLED ? '已启用' : '已禁用'
}

const getFeaturePluginToggleIndicator = (pluginId) => {
  return getFeaturePluginStatus(pluginId) === PluginStatus.ENABLED ? '●' : '○'
}

const toggleFeaturePlugin = (pluginId) => {
  const plugin = featurePluginManifestById.get(pluginId)
  if (!plugin) {
    showMessage('error', '未找到功能插件配置')
    return
  }

  const currentlyEnabled = isFeaturePluginEnabled(plugin, featurePluginRuntimeState.value)
  const nextState = setFeaturePluginEnabled(pluginId, !currentlyEnabled)
  refreshFeaturePluginRuntimeState(nextState)
  showMessage('success', `${plugin.name}已${currentlyEnabled ? '禁用' : '启用'}`)
}

const handleResetSingleFeaturePluginDefault = (pluginId) => {
  const plugin = featurePluginManifestById.get(pluginId)
  if (!plugin) {
    showMessage('error', '未找到功能插件配置')
    return
  }
  if (!hasFeaturePluginOverride(pluginId)) {
    showMessage('error', `${plugin.name}当前已使用默认状态`)
    return
  }

  const nextState = resetFeaturePluginEnabledOverride(pluginId)
  refreshFeaturePluginRuntimeState(nextState)
  const defaultEnabled = plugin.enabledByDefault !== false
  showMessage('success', `${plugin.name}已恢复默认（默认${defaultEnabled ? '启用' : '禁用'}）`)
}

const handleResetFeaturePluginDefaults = () => {
  if (featurePluginOverrideCount.value === 0) {
    showMessage('error', '当前没有可恢复的功能插件覆盖配置')
    return
  }
  const nextState = resetFeaturePluginRuntimeState()
  refreshFeaturePluginRuntimeState(nextState)
  showMessage('success', '功能插件已恢复默认启用状态')
}

const copyTextToClipboard = async (text) => {
  const content = String(text ?? '')
  if (!content) {
    return false
  }

  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(content)
    return true
  }

  if (typeof document === 'undefined') {
    return false
  }

  const textarea = document.createElement('textarea')
  textarea.value = content
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()

  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  } finally {
    textarea.remove()
  }
  return ok
}

const handleCopyFeaturePluginOverrides = async () => {
  if (featurePluginOverrideCount.value === 0) {
    showMessage('error', '当前没有覆盖配置可复制')
    return
  }
  if (copyingFeatureOverrides.value) {
    return
  }

  try {
    copyingFeatureOverrides.value = true
    const ok = await copyTextToClipboard(featurePluginOverrideJson.value)
    if (ok) {
      showMessage('success', '已复制功能插件覆盖 JSON')
    } else {
      showMessage('error', '复制失败，请手动展开并复制')
    }
  } catch (error) {
    console.error('Failed to copy feature plugin overrides:', error)
    showMessage('error', '复制失败，请检查剪贴板权限')
  } finally {
    copyingFeatureOverrides.value = false
  }
}

const isPlainObject = (value) => {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

const normalizeOverrideFlag = (value) => {
  if (typeof value === 'boolean') {
    return value
  }
  if (value === 1 || value === 0) {
    return Boolean(value)
  }
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') {
    return true
  }
  if (normalized === 'false' || normalized === '0') {
    return false
  }
  return null
}

const handleLoadFeaturePluginOverrideInput = () => {
  featurePluginOverrideInput.value = featurePluginOverrideJson.value
}

const applyFeaturePluginOverridesSource = (source, options = {}) => {
  const successPrefix = String(options.successPrefix || '').trim()

  if (applyingFeatureOverrides.value) {
    return false
  }

  const inputText = String(source ?? '')
  const trimmedSource = inputText.trim()
  if (!trimmedSource) {
    showMessage('error', '请输入覆盖 JSON 后再应用')
    return false
  }

  let parsed = null
  try {
    parsed = JSON.parse(trimmedSource)
  } catch (error) {
    console.error('Failed to parse feature plugin override input:', error)
    showMessage('error', 'JSON 格式错误，请检查后重试')
    return false
  }

  if (!isPlainObject(parsed)) {
    showMessage('error', '覆盖 JSON 必须是对象，例如 {"feature-settings": false}')
    return false
  }

  const validIds = new Set(localFeaturePlugins.map((plugin) => plugin.id))
  const nextState = {}
  const invalidValueKeys = []
  const unknownPluginKeys = []

  Object.entries(parsed).forEach(([rawKey, rawValue]) => {
    const pluginId = String(rawKey || '').trim()
    if (!pluginId) {
      return
    }

    const normalizedValue = normalizeOverrideFlag(rawValue)
    if (normalizedValue == null) {
      invalidValueKeys.push(pluginId)
      return
    }

    if (!validIds.has(pluginId)) {
      unknownPluginKeys.push(pluginId)
      return
    }

    nextState[pluginId] = normalizedValue
  })

  if (invalidValueKeys.length > 0) {
    showMessage('error', `以下插件值不是布尔值: ${invalidValueKeys.join(', ')}`)
    return false
  }

  if (Object.keys(nextState).length === 0 && Object.keys(parsed).length > 0) {
    if (unknownPluginKeys.length > 0) {
      showMessage('error', '输入中没有可识别的功能插件 ID，未应用')
      return false
    }
  }

  applyingFeatureOverrides.value = true
  let runtimeState = {}
  try {
    runtimeState = replaceFeaturePluginRuntimeState(nextState)
    refreshFeaturePluginRuntimeState(runtimeState)
  } finally {
    applyingFeatureOverrides.value = false
  }
  featurePluginOverrideInput.value = JSON.stringify(runtimeState, null, 2)

  const appliedCount = Object.keys(nextState).length
  let successText = `覆盖配置已应用（${appliedCount} 项）`
  if (unknownPluginKeys.length > 0) {
    successText = `已应用 ${appliedCount} 项，忽略未知插件 ${unknownPluginKeys.length} 项`
  }
  showMessage('success', successPrefix ? `${successPrefix}，${successText}` : successText)
  return true
}

const handleApplyFeaturePluginOverrides = () => {
  applyFeaturePluginOverridesSource(featurePluginOverrideInput.value)
}

const createFeaturePluginOverrideExportFileName = () => {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `feature-plugin-overrides-${datePart}-${timePart}.json`
}

const triggerTextFileDownload = (filename, textContent) => {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return false
  }

  const blob = new Blob([String(textContent ?? '')], {
    type: 'application/json;charset=utf-8',
  })
  const objectUrl = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = String(filename || 'feature-plugin-overrides.json')
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
  return true
}

const handleExportFeaturePluginOverridesFile = () => {
  if (exportingFeatureOverrides.value) {
    return
  }

  try {
    exportingFeatureOverrides.value = true
    const fileName = createFeaturePluginOverrideExportFileName()
    const ok = triggerTextFileDownload(fileName, `${featurePluginOverrideJson.value}\n`)
    if (!ok) {
      showMessage('error', '当前环境不支持文件导出，请改用复制 JSON')
      return
    }
    showMessage('success', `覆盖 JSON 已导出为 ${fileName}`)
  } catch (error) {
    console.error('Failed to export feature plugin override file:', error)
    showMessage('error', '导出失败，请稍后重试')
  } finally {
    exportingFeatureOverrides.value = false
  }
}

const handleImportFeaturePluginOverridesFile = async () => {
  if (importingFeatureOverrides.value) {
    return
  }

  try {
    importingFeatureOverrides.value = true
    const picked = await pickFiles({
      accept: '.json,application/json',
    })

    if (picked.canceled || !Array.isArray(picked.files) || picked.files.length === 0) {
      return
    }

    const [file] = picked.files
    if (!file) {
      showMessage('error', '未选择可用文件')
      return
    }

    const text = await file.text()
    featurePluginOverrideInput.value = text
    applyFeaturePluginOverridesSource(text, {
      successPrefix: `已导入 ${file.name}`,
    })
  } catch (error) {
    console.error('Failed to import feature plugin override file:', error)
    showMessage('error', '导入失败，请确认文件内容为有效 JSON')
  } finally {
    importingFeatureOverrides.value = false
  }
}

// 返回主菜单
const goBack = () => {
  emit('back')
}

let unsubscribeFeaturePluginRuntime = null

onMounted(async () => {
  unsubscribeFeaturePluginRuntime = subscribeFeaturePluginRuntimeState((nextState) => {
    refreshFeaturePluginRuntimeState(nextState)
  })

  try {
    await initPluginSystem()
  } catch (e) {
    console.error('Failed to init plugin system:', e)
    showMessage('error', '插件系统初始化失败，已切换到安全模式')
  } finally {
    refreshFeaturePluginRuntimeState()
    await refreshPlugins()
  }
})

onBeforeUnmount(() => {
  if (unsubscribeFeaturePluginRuntime) {
    unsubscribeFeaturePluginRuntime()
    unsubscribeFeaturePluginRuntime = null
  }
})
</script>

<template>
  <main class="plugin-screen" role="main">
    <p class="plugin-bg-word" aria-hidden="true">PLUG</p>

    <!-- 消息提示 -->
    <Transition name="message-fade">
      <div 
        v-if="message.text" 
        class="plugin-message"
        :class="`plugin-message--${message.type}`"
      >
        <span class="message-icon">
          {{ message.type === 'success' ? '✓' : '⚠' }}
        </span>
        {{ message.text }}
      </div>
    </Transition>

    <header class="plugin-header">
      <button type="button" class="back-button small-btn" @click="goBack">
        返回主菜单
      </button>
      <div class="plugin-title-group">
        <p class="plugin-tag">Extension System</p>
        <h1 class="plugin-title">
          <span>AVG_LLM</span>
          <span class="title-gradient">插件管理</span>
        </h1>
      </div>
      <div class="plugin-actions">
        <button 
          class="action-btn refresh-btn small-btn" 
          @click="refreshPlugins" 
          :disabled="loading"
          title="刷新插件列表"
        >
          <span class="btn-icon">🔄</span>
          <span class="btn-text">刷新</span>
        </button>
        <button 
          class="action-btn install-btn small-btn" 
          @click="handleInstallPlugin"
          :disabled="installing || importing || !canInstallPlugin"
          :title="canInstallPlugin ? (isAndroidPlatform ? 'Android: 选择包含 plugin.json 的目录' : '安装插件') : '当前平台不支持安装插件'"
        >
          <span class="btn-icon">📦</span>
          <span class="btn-text">{{ installing ? '安装中...' : (canInstallPlugin ? '安装插件' : '不可用') }}</span>
        </button>
        <button 
          class="action-btn import-btn small-btn" 
          @click="handleImportPlugin"
          :disabled="importing || installing || !canInstallPlugin"
          :title="canInstallPlugin ? (isAndroidPlatform ? 'Android: 选择包含 plugin.json 的目录' : '导入插件') : '当前平台不支持导入插件'"
        >
          <span class="btn-icon">📥</span>
          <span class="btn-text">{{ importing ? '导入中...' : (canInstallPlugin ? '导入插件' : '不可用') }}</span>
        </button>
        <button
          class="action-btn reset-btn small-btn"
          @click="handleResetFeaturePluginDefaults"
          :disabled="featurePluginOverrideCount === 0"
          title="恢复功能按钮插件默认启用状态"
        >
          <span class="btn-icon">↺</span>
          <span class="btn-text">恢复默认</span>
        </button>
      </div>
    </header>

    <!-- 加载状态 -->
    <section v-if="loading" class="plugin-loading-section">
      <div class="loading-spinner"></div>
      <p class="loading-text">正在扫描插件...</p>
    </section>

    <!-- 插件列表 -->
    <section v-else class="plugin-content">
      <!-- 空状态 -->
      <div v-if="!hasAnyPlugin" class="plugin-empty">
        <div class="empty-icon">📦</div>
        <h2 class="empty-title">暂无插件</h2>
        <p class="empty-desc">点击"安装插件"或"导入插件"按钮添加新插件</p>
        <p class="empty-hint">
          插件可以替换或扩展程序功能，例如替换音乐播放器
        </p>
      </div>

      <!-- 插件分组列表 -->
      <div v-else class="plugin-groups">
        <section 
          v-for="(typePlugins, type) in pluginsByType" 
          :key="type"
          v-show="typePlugins.length > 0"
          class="plugin-group"
        >
          <header class="group-header">
            <span class="group-icon">
              {{ getGroupIcon(type) }}
            </span>
            <h2 class="group-title">{{ typeLabels[type] || type }}</h2>
            <span class="group-count">{{ typePlugins.length }}</span>
          </header>
          
          <div class="plugin-list">
            <article 
              v-for="plugin in typePlugins" 
              :key="plugin.id"
              class="plugin-card"
              :class="{
                'plugin-card--enabled': getPluginStatus(plugin.id) === PluginStatus.ENABLED
              }"
            >
              <div class="plugin-icon-area">
                <span class="plugin-icon">{{ plugin.icon || '📦' }}</span>
              </div>
              
              <div class="plugin-info">
                <div class="plugin-header-row">
                  <h3 class="plugin-name">{{ plugin.name }}</h3>
                  <span class="plugin-version">v{{ plugin.version }}</span>
                </div>
                <p class="plugin-desc">{{ plugin.description }}</p>
                <div class="plugin-meta">
                  <span class="plugin-author">👤 {{ plugin.author }}</span>
                  <span v-if="plugin.replaces?.length" class="plugin-replaces">
                    替换: {{ plugin.replaces.join(', ') }}
                  </span>
                  <span v-if="isBuiltInPlugin(plugin)" class="plugin-builtin-tag">
                    内置
                  </span>
                  <span v-else-if="plugin.runtime === 'native-manifest'" class="plugin-native-tag">
                    Android导入
                  </span>
                </div>
              </div>
               
              <div class="plugin-actions-row">
                <button 
                  class="toggle-btn small-btn"
                  :class="{
                    'toggle-btn--on': getPluginStatus(plugin.id) === PluginStatus.ENABLED
                  }"
                  @click="togglePlugin(plugin.id)"
                  :disabled="!canTogglePlugin(plugin)"
                  :title="getToggleTitle(plugin)"
                >
                  <span class="toggle-status">
                    {{ getToggleStatusText(plugin) }}
                  </span>
                  <span class="toggle-indicator">
                    {{ getToggleIndicator(plugin) }}
                  </span>
                </button>
                <button 
                  class="uninstall-btn icon-btn small-btn"
                  @click="handleUninstallPlugin(plugin.id)"
                  :title="getUninstallTitle(plugin)"
                  :disabled="!canUninstallPlugin(plugin)"
                >
                  🗑️
                </button>
              </div>
            </article>
          </div>
        </section>

        <section
          v-if="featurePlugins.length > 0"
          class="plugin-group"
        >
          <header class="group-header">
            <span class="group-icon">🧭</span>
            <h2 class="group-title">功能按钮插件</h2>
            <span class="group-count">{{ featurePlugins.length }}</span>
          </header>

          <div class="feature-runtime-toolbar">
            <p class="feature-runtime-count">
              覆盖项: {{ featurePluginOverrideCount }}
            </p>
            <button
              class="toggle-btn feature-runtime-btn small-btn"
              title="将当前运行时覆盖 JSON 填充到输入框"
              @click="handleLoadFeaturePluginOverrideInput"
            >
              <span class="toggle-status">载入当前JSON</span>
            </button>
            <button
              class="toggle-btn feature-runtime-btn small-btn"
              :disabled="applyingFeatureOverrides"
              title="应用输入框中的覆盖 JSON"
              @click="handleApplyFeaturePluginOverrides"
            >
              <span class="toggle-status">
                {{ applyingFeatureOverrides ? '应用中...' : '应用覆盖JSON' }}
              </span>
            </button>
            <button
              class="toggle-btn feature-runtime-btn small-btn"
              :disabled="importingFeatureOverrides"
              title="从 JSON 文件导入并应用覆盖配置"
              @click="handleImportFeaturePluginOverridesFile"
            >
              <span class="toggle-status">
                {{ importingFeatureOverrides ? '导入中...' : '导入JSON文件' }}
              </span>
            </button>
            <button
              class="toggle-btn feature-runtime-btn small-btn"
              :disabled="exportingFeatureOverrides"
              title="导出当前覆盖配置为 JSON 文件"
              @click="handleExportFeaturePluginOverridesFile"
            >
              <span class="toggle-status">
                {{ exportingFeatureOverrides ? '导出中...' : '导出JSON文件' }}
              </span>
            </button>
            <button
              class="toggle-btn feature-runtime-btn small-btn"
              :disabled="copyingFeatureOverrides || featurePluginOverrideCount === 0"
              title="复制功能插件覆盖 JSON"
              @click="handleCopyFeaturePluginOverrides"
            >
              <span class="toggle-status">
                {{ copyingFeatureOverrides ? '复制中...' : '复制覆盖JSON' }}
              </span>
            </button>
          </div>

          <details class="feature-runtime-details">
            <summary class="feature-runtime-summary">
              运行时覆盖诊断（JSON）
            </summary>
            <pre class="feature-runtime-json">{{ featurePluginOverrideJson }}</pre>
          </details>

          <div class="feature-runtime-editor">
            <label class="feature-runtime-editor-label">
              粘贴并应用覆盖 JSON（仅支持 id -> boolean）
            </label>
            <textarea
              v-model="featurePluginOverrideInput"
              class="feature-runtime-editor-input"
              spellcheck="false"
              rows="5"
              placeholder='例如: {"feature-settings": false, "feature-worldbook": true}'
            ></textarea>
          </div>

          <div class="plugin-list">
            <article
              v-for="plugin in featurePlugins"
              :key="plugin.id"
              class="plugin-card"
              :class="{
                'plugin-card--enabled': getFeaturePluginStatus(plugin.id) === PluginStatus.ENABLED
              }"
            >
              <div class="plugin-icon-area">
                <span class="plugin-icon">{{ plugin.menu?.icon || '🧩' }}</span>
              </div>

              <div class="plugin-info">
                <div class="plugin-header-row">
                  <h3 class="plugin-name">{{ plugin.name }}</h3>
                  <span class="plugin-version">feature</span>
                </div>
                <p class="plugin-desc">{{ plugin.description }}</p>
                <div class="plugin-meta">
                  <span class="plugin-author">🆔 {{ plugin.id }}</span>
                  <span class="plugin-builtin-tag">
                    菜单: {{ plugin.menu?.title || plugin.id }}
                  </span>
                  <span
                    v-if="hasFeaturePluginOverride(plugin.id)"
                    class="plugin-native-tag"
                  >
                    已覆盖
                  </span>
                </div>
              </div>

              <div class="plugin-actions-row">
                <button
                  class="toggle-btn small-btn"
                  :class="{
                    'toggle-btn--on': getFeaturePluginStatus(plugin.id) === PluginStatus.ENABLED
                  }"
                  @click="toggleFeaturePlugin(plugin.id)"
                  title="切换功能插件启用状态"
                >
                  <span class="toggle-status">
                    {{ getFeaturePluginToggleStatusText(plugin.id) }}
                  </span>
                  <span class="toggle-indicator">
                    {{ getFeaturePluginToggleIndicator(plugin.id) }}
                  </span>
                </button>
                <button
                  class="uninstall-btn reset-single-btn icon-btn small-btn"
                  :disabled="!hasFeaturePluginOverride(plugin.id)"
                  title="清除该功能插件覆盖，恢复默认状态"
                  @click="handleResetSingleFeaturePluginDefault(plugin.id)"
                >
                  ↺
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </section>

    <!-- 插件开发提示 -->
    <footer class="plugin-footer">
      <details class="dev-guide">
        <summary class="dev-guide-summary">🔧 插件开发指南</summary>
        <div class="dev-guide-content">
          <div class="guide-section">
            <h4 class="guide-title">插件结构</h4>
            <pre class="guide-code">
plugins/
└── my-plugin/
    ├── plugin.json    # 插件元数据
    └── index.vue      # 插件组件</pre>
          </div>
          <div class="guide-section">
            <h4 class="guide-title">plugin.json 示例</h4>
            <pre class="guide-code">{
  "id": "my-music-player",
  "name": "我的音乐播放器",
  "version": "1.0.0",
  "author": "开发者",
  "description": "自定义音乐播放器",
  "type": "music-player",
  "entry": "index.vue",
  "icon": "🎵",
  "replaces": ["MusicPlayer"]
}</pre>
          </div>
          <p class="guide-hint">
            详细开发文档请查看 <code>docs/PLUGIN_DEVELOPMENT.md</code>
          </p>
        </div>
      </details>
    </footer>
  </main>
</template>

<style scoped src="./PluginManagerScreen.css"></style>

