<script setup>
import { ref, onMounted, computed } from 'vue'
import { isAndroid } from '../utils/platform.js'
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
} from '../plugins/pluginManager.js'

const emit = defineEmits(['back'])

// 插件列表
const plugins = ref([])
const loading = ref(true)
const installing = ref(false)
const importing = ref(false)
const message = ref({ type: '', text: '' })
const pluginStatusVersion = ref(0)

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

// 返回主菜单
const goBack = () => {
  emit('back')
}

onMounted(async () => {
  try {
    await initPluginSystem()
  } catch (e) {
    console.error('Failed to init plugin system:', e)
    showMessage('error', '插件系统初始化失败，已切换到安全模式')
  } finally {
    await refreshPlugins()
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
      <div v-if="plugins.length === 0" class="plugin-empty">
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

