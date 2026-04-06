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

<style scoped>
.plugin-screen {
  position: relative;
  width: 100%;
  height: calc(100vh - clamp(40px, 8vw, 110px));
  max-height: calc(100vh - clamp(40px, 8vw, 110px));
  border: 8px solid var(--accent-purple);
  border-radius: 34px 20px 30px 18px;
  background: color-mix(in srgb, var(--muted) 86%, transparent);
  backdrop-filter: blur(9px);
  box-shadow:
    0 0 34px color-mix(in srgb, var(--accent-cyan) 45%, transparent),
    12px 12px 0 var(--accent-magenta), 24px 24px 0 var(--accent-cyan);
  padding: clamp(18px, 3vw, 32px);
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: clamp(14px, 2.5vw, 22px);
  overflow: hidden;
}

.plugin-screen::before,
.plugin-screen::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.plugin-screen::before {
  opacity: 0.15;
  background-image:
    radial-gradient(circle, var(--accent-purple) 1px, transparent 1px),
    repeating-linear-gradient(
      -45deg,
      transparent 0 12px,
      color-mix(in srgb, var(--accent-magenta) 35%, transparent) 12px 22px
    );
  background-size:
    24px 24px,
    100% 100%;
}

.plugin-screen::after {
  opacity: 0.12;
  background-image: conic-gradient(
    from 90deg at 1px 1px,
    transparent 90deg,
    color-mix(in srgb, var(--accent-cyan) 36%, transparent) 0
  );
  background-size: 44px 44px;
  mix-blend-mode: screen;
}

.plugin-bg-word {
  position: absolute;
  margin: 0;
  right: -2%;
  top: -5%;
  font-family: var(--font-heading);
  font-size: clamp(6rem, 21vw, 15rem);
  line-height: 0.8;
  letter-spacing: -0.07em;
  color: color-mix(in srgb, var(--accent-purple) 34%, transparent);
  opacity: 0.22;
  pointer-events: none;
  user-select: none;
}

/* 消息提示 */
.plugin-message {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: 4px solid;
  border-radius: 9999px;
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  box-shadow: 0 0 20px;
}

.plugin-message--success {
  border-color: var(--accent-cyan);
  background: color-mix(in srgb, var(--accent-cyan) 25%, var(--background));
  color: var(--accent-cyan);
  box-shadow-color: color-mix(in srgb, var(--accent-cyan) 45%, transparent);
}

.plugin-message--error {
  border-color: var(--accent-orange);
  background: color-mix(in srgb, var(--accent-orange) 25%, var(--background));
  color: var(--accent-orange);
  box-shadow-color: color-mix(in srgb, var(--accent-orange) 45%, transparent);
}

.message-icon {
  font-size: 1.1rem;
}

.message-fade-enter-active,
.message-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.message-fade-enter-from,
.message-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}

/* Header */
.plugin-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}

.back-button {
  appearance: none;
  border: 4px dashed var(--accent-cyan);
  border-radius: 9999px;
  padding: 10px 18px;
  font: 700 0.86rem/1 var(--font-body);
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--foreground);
  background: color-mix(in srgb, var(--accent-purple) 40%, transparent);
  cursor: pointer;
  box-shadow:
    0 0 14px color-mix(in srgb, var(--accent-cyan) 45%, transparent),
    6px 6px 0 var(--accent-yellow);
  transition: transform 240ms ease, box-shadow 240ms ease;
}

.back-button:hover {
  transform: translateY(-2px) scale(1.04);
  box-shadow:
    0 0 20px color-mix(in srgb, var(--accent-cyan) 60%, transparent),
    9px 9px 0 var(--accent-yellow), 14px 14px 0 var(--accent-magenta);
}

.back-button:focus-visible {
  outline: 3px dashed var(--accent-yellow);
  outline-offset: 4px;
}

.plugin-title-group {
  display: grid;
  gap: 8px;
}

.plugin-tag {
  margin: 0;
  width: fit-content;
  padding: 8px 14px;
  border: 4px solid var(--accent-magenta);
  border-radius: 9999px;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-shadow: var(--text-shadow-single);
  background: color-mix(in srgb, var(--accent-cyan) 25%, transparent);
}

.plugin-title {
  margin: 0;
  display: grid;
  font-family: var(--font-heading);
  font-size: clamp(2.1rem, 5.7vw, 4.4rem);
  line-height: 0.92;
  letter-spacing: -0.03em;
  text-shadow: var(--text-shadow-triple);
}

.title-gradient {
  width: fit-content;
  font-family: var(--font-display);
  font-size: clamp(2rem, 5vw, 3.3rem);
  letter-spacing: 0.08em;
  background: linear-gradient(
    90deg,
    var(--accent-purple),
    var(--accent-cyan),
    var(--accent-magenta),
    var(--accent-purple)
  );
  background-size: 250% 250%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: avg-gradient-shift 4s linear infinite;
}

.plugin-actions {
  display: flex;
  gap: 10px;
}

.action-btn {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: 4px dashed;
  border-radius: 9999px;
  font: 700 0.82rem/1 var(--font-body);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--foreground);
  cursor: pointer;
  transition: transform 220ms ease, box-shadow 220ms ease;
}

.refresh-btn {
  border-color: var(--accent-cyan);
  background: color-mix(in srgb, var(--accent-cyan) 30%, transparent);
  box-shadow:
    0 0 12px color-mix(in srgb, var(--accent-cyan) 45%, transparent),
    4px 4px 0 var(--accent-magenta);
}

.refresh-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow:
    0 0 18px color-mix(in srgb, var(--accent-cyan) 60%, transparent),
    6px 6px 0 var(--accent-magenta), 10px 10px 0 var(--accent-yellow);
}

.install-btn {
  border-color: var(--accent-yellow);
  background: color-mix(in srgb, var(--accent-yellow) 30%, transparent);
  box-shadow:
    0 0 12px color-mix(in srgb, var(--accent-yellow) 45%, transparent),
    4px 4px 0 var(--accent-cyan);
}

.install-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow:
    0 0 18px color-mix(in srgb, var(--accent-yellow) 60%, transparent),
    6px 6px 0 var(--accent-cyan), 10px 10px 0 var(--accent-purple);
}

.import-btn {
  border-color: var(--accent-magenta);
  background: color-mix(in srgb, var(--accent-magenta) 30%, transparent);
  box-shadow:
    0 0 12px color-mix(in srgb, var(--accent-magenta) 45%, transparent),
    4px 4px 0 var(--accent-cyan);
}

.import-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow:
    0 0 18px color-mix(in srgb, var(--accent-magenta) 60%, transparent),
    6px 6px 0 var(--accent-cyan), 10px 10px 0 var(--accent-yellow);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-icon {
  font-size: 1rem;
}

/* Loading */
.plugin-loading-section {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  border: 4px dotted var(--accent-purple);
  border-radius: 20px;
  background: color-mix(in srgb, var(--background) 32%, transparent);
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid color-mix(in srgb, var(--accent-purple) 30%, transparent);
  border-top-color: var(--accent-purple);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--foreground);
  opacity: 0.8;
}

/* Content */
.plugin-content {
  position: relative;
  z-index: 2;
  border: 4px dotted var(--accent-orange);
  border-radius: 20px;
  padding: clamp(14px, 2vw, 22px);
  background: color-mix(in srgb, var(--background) 32%, transparent);
  box-shadow:
    0 0 24px color-mix(in srgb, var(--accent-orange) 45%, transparent),
    8px 8px 0 var(--accent-magenta), 16px 16px 0 var(--accent-cyan);
  min-height: 0;
  overflow-y: auto;
}

/* Empty State */
.plugin-empty {
  text-align: center;
  padding: 60px 20px;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty-title {
  margin: 0 0 8px;
  font-family: var(--font-heading);
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: var(--foreground);
}

.empty-desc {
  margin: 0 0 12px;
  font-size: 0.9rem;
  color: var(--foreground);
  opacity: 0.7;
}

.empty-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--foreground);
  opacity: 0.5;
}

/* Plugin Groups */
.plugin-groups {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.plugin-group {
  border: 4px solid var(--accent-cyan);
  border-radius: 18px;
  padding: 16px;
  background: color-mix(in srgb, var(--background) 36%, transparent);
  box-shadow:
    0 0 18px color-mix(in srgb, var(--accent-cyan) 35%, transparent),
    6px 6px 0 var(--accent-magenta);
}

.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 4px dashed var(--accent-magenta);
}

.group-icon {
  font-size: 1.4rem;
}

.group-title {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--foreground);
}

.group-count {
  padding: 4px 10px;
  border: 2px solid var(--accent-yellow);
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--accent-yellow);
  background: color-mix(in srgb, var(--accent-yellow) 20%, transparent);
}

/* Plugin List */
.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.plugin-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border: 4px dashed var(--accent-purple);
  border-radius: 16px;
  background: color-mix(in srgb, var(--accent-purple) 15%, transparent);
  transition: transform 220ms ease, box-shadow 220ms ease, border-style 220ms ease;
}

.plugin-card:hover {
  transform: translateX(4px);
  box-shadow:
    0 0 14px color-mix(in srgb, var(--accent-purple) 45%, transparent),
    4px 4px 0 var(--accent-cyan);
}

.plugin-card--enabled {
  border-style: solid;
  border-color: var(--accent-cyan);
  background: linear-gradient(
    110deg,
    color-mix(in srgb, var(--accent-cyan) 25%, var(--background)),
    color-mix(in srgb, var(--accent-purple) 20%, var(--background))
  );
  box-shadow:
    0 0 18px color-mix(in srgb, var(--accent-cyan) 45%, transparent),
    6px 6px 0 var(--accent-yellow);
}

.plugin-icon-area {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 4px solid var(--accent-magenta);
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent-magenta) 25%, transparent);
}

.plugin-icon {
  font-size: 1.8rem;
}

.plugin-info {
  flex: 1;
  min-width: 0;
}

.plugin-header-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.plugin-name {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--foreground);
}

.plugin-version {
  padding: 3px 8px;
  border: 2px solid var(--accent-orange);
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--accent-orange);
  background: color-mix(in srgb, var(--accent-orange) 15%, transparent);
}

.plugin-desc {
  margin: 0 0 8px;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--foreground);
  opacity: 0.85;
}

.plugin-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 0.75rem;
  color: var(--foreground);
  opacity: 0.6;
}

.plugin-builtin-tag,
.plugin-native-tag {
  padding: 2px 6px;
  border-radius: 999px;
  opacity: 0.9;
}

.plugin-builtin-tag {
  border: 1px solid var(--accent-cyan);
  color: var(--accent-cyan);
  background: color-mix(in srgb, var(--accent-cyan) 14%, transparent);
}

.plugin-native-tag {
  border: 1px solid var(--accent-yellow);
  color: var(--accent-yellow);
  background: color-mix(in srgb, var(--accent-yellow) 14%, transparent);
}

.plugin-actions-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.toggle-btn {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 4px dashed var(--accent-magenta);
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--foreground);
  background: color-mix(in srgb, var(--accent-magenta) 25%, transparent);
  cursor: pointer;
  transition: all 220ms ease;
  box-shadow: 4px 4px 0 var(--accent-orange);
}

.toggle-btn:hover {
  transform: translateY(-2px);
  box-shadow: 6px 6px 0 var(--accent-orange);
}

.toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.toggle-btn--on {
  border-style: solid;
  border-color: var(--accent-cyan);
  background: linear-gradient(
    110deg,
    color-mix(in srgb, var(--accent-cyan) 50%, var(--background)),
    color-mix(in srgb, var(--accent-purple) 40%, var(--background))
  );
  box-shadow:
    0 0 12px color-mix(in srgb, var(--accent-cyan) 45%, transparent),
    6px 6px 0 var(--accent-yellow);
}

.toggle-indicator {
  font-size: 0.9rem;
}

.uninstall-btn {
  appearance: none;
  padding: 8px;
  border: 4px dashed var(--accent-orange);
  border-radius: 10px;
  font-size: 1rem;
  background: color-mix(in srgb, var(--accent-orange) 20%, transparent);
  cursor: pointer;
  transition: all 220ms ease;
  opacity: 0.6;
}

.uninstall-btn:hover:not(:disabled) {
  opacity: 1;
  transform: scale(1.1);
  box-shadow: 0 0 10px color-mix(in srgb, var(--accent-orange) 45%, transparent);
}

.uninstall-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Footer */
.plugin-footer {
  position: relative;
  z-index: 2;
}

.dev-guide {
  border: 4px dotted var(--accent-cyan);
  border-radius: 16px;
  background: color-mix(in srgb, var(--background) 36%, transparent);
  box-shadow: 6px 6px 0 var(--accent-magenta);
}

.dev-guide-summary {
  padding: 12px 16px;
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--accent-cyan);
  cursor: pointer;
  transition: color 220ms ease;
}

.dev-guide-summary:hover {
  color: var(--accent-yellow);
}

.dev-guide-summary::marker {
  color: var(--accent-cyan);
}

.dev-guide-content {
  padding: 16px;
  border-top: 4px dashed var(--accent-magenta);
}

.guide-section {
  margin-bottom: 16px;
}

.guide-section:last-of-type {
  margin-bottom: 8px;
}

.guide-title {
  margin: 0 0 8px;
  font-family: var(--font-heading);
  font-size: 0.9rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: var(--foreground);
}

.guide-code {
  margin: 0;
  padding: 12px;
  border: 4px solid var(--accent-purple);
  border-radius: 10px;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--accent-cyan);
  background: color-mix(in srgb, var(--background) 60%, transparent);
  overflow-x: auto;
}

.guide-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--foreground);
  opacity: 0.6;
}

.guide-hint code {
  padding: 2px 6px;
  border: 2px solid var(--accent-yellow);
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--accent-yellow);
  background: color-mix(in srgb, var(--accent-yellow) 15%, transparent);
}

/* Responsive */
@media (max-width: 900px) {
  .plugin-screen {
    border-width: 6px;
    min-height: calc(100vh - 30px);
  }

  .plugin-header {
    flex-direction: column;
    align-items: stretch;
  }

  .plugin-title-group {
    order: -1;
  }

  .plugin-actions {
    justify-content: flex-end;
  }

  .plugin-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .plugin-actions-row {
    width: 100%;
    justify-content: flex-end;
    margin-top: 8px;
  }
}

@media (max-width: 680px) {
  .plugin-bg-word {
    font-size: clamp(4.5rem, 24vw, 8rem);
    right: -7%;
  }

  .action-btn {
    padding: 8px 12px;
    font-size: 0.75rem;
  }

  .btn-text {
    display: none;
  }

  .btn-icon {
    font-size: 1.2rem;
  }
}

/* Android 竖屏重设计 */
@media (max-width: 768px) and (orientation: portrait) {
  .platform-android.android-portrait .plugin-screen {
    min-height: 100vh !important;
    height: auto !important;
    max-height: none !important;
    border: none !important;
    border-radius: 0 !important;
    padding: 0 !important;
    gap: 0 !important;
    overflow: visible !important;
    box-shadow: none !important;
    background: var(--background) !important;
    display: block !important;
  }

  .platform-android.android-portrait .plugin-screen::before,
  .platform-android.android-portrait .plugin-screen::after,
  .platform-android.android-portrait .plugin-bg-word {
    display: none !important;
  }

  .platform-android.android-portrait .plugin-message {
    top: 10px !important;
    width: calc(100% - 24px) !important;
    max-width: 420px !important;
    padding: 10px 14px !important;
    border-width: 1px !important;
    border-radius: 12px !important;
    font-size: 0.82rem !important;
    letter-spacing: 0.02em !important;
    box-shadow: none !important;
  }

  .platform-android.android-portrait .plugin-header {
    position: sticky !important;
    top: 0 !important;
    z-index: 8 !important;
    display: grid !important;
    gap: 10px !important;
    padding: 14px 16px !important;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--accent-purple) 16%, var(--background)),
      var(--background)
    ) !important;
    border-bottom: 1px solid color-mix(in srgb, var(--accent-cyan) 35%, transparent) !important;
  }

  .platform-android.android-portrait .back-button {
    align-self: flex-start !important;
    min-width: auto !important;
    width: auto !important;
    min-height: 34px !important;
    padding: 7px 12px !important;
    border-width: 1px !important;
    border-radius: 16px !important;
    letter-spacing: 0.04em !important;
    box-shadow: none !important;
    font-size: 0.75rem !important;
  }

  .platform-android.android-portrait .plugin-title-group {
    gap: 4px !important;
  }

  .platform-android.android-portrait .plugin-tag {
    display: none !important;
  }

  .platform-android.android-portrait .plugin-title {
    font-size: 1.5rem !important;
    line-height: 1.05 !important;
    letter-spacing: -0.01em !important;
  }

  .platform-android.android-portrait .title-gradient {
    font-size: 0.86rem !important;
    letter-spacing: 0.12em !important;
    background: none !important;
    -webkit-text-fill-color: var(--accent-cyan) !important;
    animation: none !important;
  }

  .platform-android.android-portrait .plugin-actions {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 8px !important;
    width: 100% !important;
  }

  .platform-android.android-portrait .action-btn {
    min-width: 0 !important;
    width: 100% !important;
    min-height: 38px !important;
    padding: 8px 10px !important;
    border-width: 1px !important;
    border-radius: 12px !important;
    justify-content: center !important;
    letter-spacing: 0.03em !important;
    font-size: 0.8rem !important;
    box-shadow: none !important;
  }

  .platform-android.android-portrait .btn-text {
    display: inline !important;
  }

  .platform-android.android-portrait .plugin-loading-section {
    margin: 16px !important;
    padding: 28px 14px !important;
    border-width: 1px !important;
    border-radius: 14px !important;
    box-shadow: none !important;
  }

  .platform-android.android-portrait .loading-spinner {
    width: 32px !important;
    height: 32px !important;
    border-width: 3px !important;
    margin-bottom: 12px !important;
  }

  .platform-android.android-portrait .loading-text {
    font-size: 0.9rem !important;
    letter-spacing: 0.04em !important;
  }

  .platform-android.android-portrait .plugin-content {
    border: none !important;
    border-radius: 0 !important;
    padding: 16px !important;
    background: transparent !important;
    box-shadow: none !important;
    overflow: visible !important;
  }

  .platform-android.android-portrait .plugin-empty {
    padding: 36px 8px !important;
  }

  .platform-android.android-portrait .empty-icon {
    font-size: 2.8rem !important;
    margin-bottom: 10px !important;
  }

  .platform-android.android-portrait .plugin-groups {
    gap: 12px !important;
  }

  .platform-android.android-portrait .plugin-group {
    border-width: 1px !important;
    border-radius: 12px !important;
    padding: 12px !important;
    box-shadow: none !important;
  }

  .platform-android.android-portrait .group-header {
    margin-bottom: 10px !important;
    padding-bottom: 8px !important;
    border-bottom-width: 1px !important;
  }

  .platform-android.android-portrait .group-title {
    font-size: 0.95rem !important;
  }

  .platform-android.android-portrait .group-count {
    margin-left: auto !important;
    padding: 2px 7px !important;
    border-width: 1px !important;
  }

  .platform-android.android-portrait .plugin-list {
    gap: 10px !important;
  }

  .platform-android.android-portrait .plugin-card {
    display: grid !important;
    grid-template-columns: 40px minmax(0, 1fr) !important;
    grid-template-areas:
      'icon info'
      'actions actions' !important;
    align-items: start !important;
    gap: 10px !important;
    padding: 12px !important;
    border-width: 1px !important;
    border-radius: 12px !important;
  }

  .platform-android.android-portrait .plugin-card:hover {
    transform: none !important;
    box-shadow: none !important;
  }

  .platform-android.android-portrait .plugin-card--enabled {
    box-shadow: none !important;
  }

  .platform-android.android-portrait .plugin-icon-area {
    grid-area: icon !important;
    width: 40px !important;
    height: 40px !important;
    border-width: 1px !important;
    border-radius: 10px !important;
  }

  .platform-android.android-portrait .plugin-icon {
    font-size: 1.15rem !important;
  }

  .platform-android.android-portrait .plugin-info {
    grid-area: info !important;
  }

  .platform-android.android-portrait .plugin-header-row {
    flex-wrap: wrap !important;
    gap: 6px !important;
    margin-bottom: 4px !important;
  }

  .platform-android.android-portrait .plugin-name {
    font-size: 0.95rem !important;
    letter-spacing: 0.01em !important;
  }

  .platform-android.android-portrait .plugin-version {
    padding: 2px 6px !important;
    border-width: 1px !important;
    font-size: 0.65rem !important;
  }

  .platform-android.android-portrait .plugin-desc {
    margin-bottom: 6px !important;
    font-size: 0.8rem !important;
    line-height: 1.35 !important;
  }

  .platform-android.android-portrait .plugin-meta {
    flex-wrap: wrap !important;
    gap: 6px 10px !important;
    font-size: 0.72rem !important;
  }

  .platform-android.android-portrait .plugin-actions-row {
    grid-area: actions !important;
    justify-content: flex-end !important;
    gap: 8px !important;
    width: 100% !important;
  }

  .platform-android.android-portrait .toggle-btn {
    min-width: auto !important;
    width: auto !important;
    min-height: 32px !important;
    padding: 6px 12px !important;
    border-width: 1px !important;
    border-radius: 999px !important;
    font-size: 0.75rem !important;
    box-shadow: none !important;
  }

  .platform-android.android-portrait .toggle-btn:hover {
    transform: none !important;
    box-shadow: none !important;
  }

  .platform-android.android-portrait .toggle-btn--on {
    box-shadow: none !important;
  }

  .platform-android.android-portrait .uninstall-btn {
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    min-height: 32px !important;
    padding: 0 !important;
    border-width: 1px !important;
    border-radius: 8px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    box-shadow: none !important;
    opacity: 0.9 !important;
  }

  .platform-android.android-portrait .uninstall-btn:hover {
    transform: none !important;
    box-shadow: none !important;
    opacity: 1 !important;
  }

  .platform-android.android-portrait .plugin-footer {
    padding: 0 16px 16px !important;
  }

  .platform-android.android-portrait .dev-guide {
    border-width: 1px !important;
    border-radius: 12px !important;
    box-shadow: none !important;
  }

  .platform-android.android-portrait .dev-guide-summary {
    padding: 10px 12px !important;
    font-size: 0.82rem !important;
    letter-spacing: 0.03em !important;
  }

  .platform-android.android-portrait .dev-guide-content {
    padding: 12px !important;
    border-top-width: 1px !important;
  }

  .platform-android.android-portrait .guide-code {
    border-width: 1px !important;
    font-size: 0.72rem !important;
  }
}
</style>
