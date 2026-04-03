<script setup>
import { ref, onMounted, computed } from 'vue'
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
const message = ref({ type: '', text: '' })

// 插件类型标签
const typeLabels = {
  [PluginTypes.MUSIC_PLAYER]: '音乐播放器',
  [PluginTypes.COMPONENT]: '组件',
  [PluginTypes.THEME]: '主题'
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
    const success = disablePlugin(pluginId)
    if (success) {
      showMessage('success', '插件已禁用')
    } else {
      showMessage('error', '禁用插件失败')
    }
  } else {
    const success = await enablePlugin(pluginId)
    if (success) {
      showMessage('success', '插件已启用')
    } else {
      showMessage('error', '启用插件失败')
    }
  }
}

// 安装新插件
const handleInstallPlugin = async () => {
  try {
    installing.value = true
    
    // 调用 Electron API 选择插件目录
    if (window.avgLLM?.plugins?.selectFolder) {
      const result = await window.avgLLM.plugins.selectFolder()
      if (result.success && result.path) {
        const installResult = await installPlugin(result.path)
        if (installResult.success) {
          showMessage('success', `插件 "${installResult.plugin?.name || '未知'}" 安装成功`)
          await refreshPlugins()
        } else {
          showMessage('error', installResult.message || '安装失败')
        }
      }
    } else {
      showMessage('error', '插件安装功能不可用')
    }
  } catch (e) {
    console.error('Install plugin error:', e)
    showMessage('error', '安装插件时发生错误')
  } finally {
    installing.value = false
  }
}

// 卸载插件
const handleUninstallPlugin = async (pluginId) => {
  const plugin = plugins.value.find(p => p.id === pluginId)
  if (!plugin) return
  
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
  return isPluginEnabled(pluginId) ? PluginStatus.ENABLED : PluginStatus.DISABLED
}

// 返回主菜单
const goBack = () => {
  emit('back')
}

onMounted(async () => {
  await initPluginSystem()
  await refreshPlugins()
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
      <button type="button" class="back-button" @click="goBack">
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
          class="action-btn refresh-btn" 
          @click="refreshPlugins" 
          :disabled="loading"
          title="刷新插件列表"
        >
          <span class="btn-icon">🔄</span>
          <span class="btn-text">刷新</span>
        </button>
        <button 
          class="action-btn install-btn" 
          @click="handleInstallPlugin"
          :disabled="installing"
        >
          <span class="btn-icon">📦</span>
          <span class="btn-text">{{ installing ? '安装中...' : '安装插件' }}</span>
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
        <p class="empty-desc">点击"安装插件"按钮添加新插件</p>
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
              {{ type === PluginTypes.MUSIC_PLAYER ? '🎵' : 
                 type === PluginTypes.THEME ? '🎨' : '🧩' }}
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
                </div>
              </div>
              
              <div class="plugin-actions-row">
                <button 
                  class="toggle-btn"
                  :class="{
                    'toggle-btn--on': getPluginStatus(plugin.id) === PluginStatus.ENABLED
                  }"
                  @click="togglePlugin(plugin.id)"
                >
                  <span class="toggle-status">
                    {{ getPluginStatus(plugin.id) === PluginStatus.ENABLED ? '已启用' : '已禁用' }}
                  </span>
                  <span class="toggle-indicator">
                    {{ getPluginStatus(plugin.id) === PluginStatus.ENABLED ? '●' : '○' }}
                  </span>
                </button>
                <button 
                  class="uninstall-btn"
                  @click="handleUninstallPlugin(plugin.id)"
                  title="卸载插件"
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
  font-size: 0.75rem;
  color: var(--foreground);
  opacity: 0.6;
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

.uninstall-btn:hover {
  opacity: 1;
  transform: scale(1.1);
  box-shadow: 0 0 10px color-mix(in srgb, var(--accent-orange) 45%, transparent);
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
</style>