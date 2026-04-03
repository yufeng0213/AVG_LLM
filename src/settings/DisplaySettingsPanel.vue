<script setup>
import { onMounted, reactive, ref, computed } from 'vue'
import { kvStorage } from '../storage/index.js'
import { isAndroid, isElectron, isWeb } from '../utils/platform.js'

const DISPLAY_STORAGE_KEY = 'display_settings'

const displayState = reactive({
  resolution: '1280x720',
  windowMode: 'windowed',
  quality: 'high',
  textSpeed: 72,
  dynamicEffects: true,
  // Android 特有设置
  fullscreen: true,
  landscapeMode: true,
})

const defaultResolutionOptions = ['1280x720', '1366x768', '1600x900', '1920x1080', '2560x1440']
const resolutionOptions = ref(defaultResolutionOptions)
const isApplying = ref(false)
const statusMessage = ref('画面参数待应用。')

// 平台检测
const isAndroidPlatform = computed(() => isAndroid())
const isElectronPlatform = computed(() => isElectron())
const isWebPlatform = computed(() => isWeb())

const readLocalSettings = async () => {
  try {
    const parsed = await kvStorage.get(DISPLAY_STORAGE_KEY)
    if (parsed?.resolution) displayState.resolution = parsed.resolution
    if (parsed?.windowMode) displayState.windowMode = parsed.windowMode
    if (parsed?.fullscreen !== undefined) displayState.fullscreen = parsed.fullscreen
    if (parsed?.landscapeMode !== undefined) displayState.landscapeMode = parsed.landscapeMode
  } catch {
    // Ignore invalid local snapshot.
  }
}

const loadCurrentDisplaySettings = async () => {
  await readLocalSettings()

  // Android 平台显示特定消息
  if (isAndroidPlatform.value) {
    statusMessage.value = 'Android 平台：全屏和横屏模式已默认启用。'
    return
  }

  const isElectronRuntime = navigator.userAgent.includes('Electron')

  if (!window.avgLLM?.display?.getSettings) {
    if (isElectronRuntime) {
      statusMessage.value = '检测到 Electron，但 preload bridge 未注入（请完整重启 Electron 进程）。'
    } else {
      statusMessage.value = '当前为浏览器预览模式，设置将仅保存在本地。'
    }
    return
  }

  try {
    const supported = await window.avgLLM.display.getSupportedResolutions?.()
    if (supported?.list?.length) {
      resolutionOptions.value = supported.list
    }

    const settings = await window.avgLLM.display.getSettings()
    if (settings?.resolution) displayState.resolution = settings.resolution
    if (settings?.windowMode) displayState.windowMode = settings.windowMode
    if (
      settings?.resolution &&
      !resolutionOptions.value.includes(settings.resolution)
    ) {
      resolutionOptions.value = [...resolutionOptions.value, settings.resolution]
    }
    statusMessage.value = '已读取当前窗口设置。'
  } catch {
    statusMessage.value = '读取窗口设置失败，可先使用本地默认值。'
  }
}

const applyDisplaySettings = async () => {
  const payload = {
    resolution: displayState.resolution,
    windowMode: displayState.windowMode,
    fullscreen: displayState.fullscreen,
    landscapeMode: displayState.landscapeMode,
  }

  await kvStorage.set(DISPLAY_STORAGE_KEY, payload)

  // Android 平台提示
  if (isAndroidPlatform.value) {
    statusMessage.value = 'Android 平台：全屏和横屏由系统控制，设置已保存。'
    return
  }

  if (!window.avgLLM?.display?.applySettings) {
    statusMessage.value = '已保存本地设置；在 Electron 中点击将直接调整窗口。'
    return
  }

  isApplying.value = true

  try {
    const result = await window.avgLLM.display.applySettings(payload)
    if (result?.ok) {
      statusMessage.value = `已应用：${displayState.resolution} / ${displayState.windowMode}`
    } else {
      statusMessage.value = '应用失败，请重试。'
    }
  } catch {
    statusMessage.value = '应用失败，请检查主进程状态。'
  } finally {
    isApplying.value = false
  }
}

onMounted(loadCurrentDisplaySettings)
</script>

<template>
  <section class="settings-panel-content">
    <h2 class="panel-title">画面设置</h2>
    <p class="panel-description">控制窗口模式、分辨率、渲染质量与文本播放速度。</p>

    <!-- Android 特有设置 -->
    <div v-if="isAndroidPlatform" class="android-settings-section">
      <h3 class="subsection-title">Android 显示设置</h3>
      <div class="settings-grid two-column">
        <label class="setting-checkbox-row">
          <input v-model="displayState.fullscreen" class="setting-checkbox" type="checkbox" />
          <span>全屏模式（隐藏状态栏和导航栏）</span>
        </label>
        
        <label class="setting-checkbox-row">
          <input v-model="displayState.landscapeMode" class="setting-checkbox" type="checkbox" />
          <span>横屏模式（自动旋转锁定横屏）</span>
        </label>
      </div>
      <p class="android-note">提示：全屏和横屏设置在应用启动时自动生效。</p>
    </div>

    <!-- 通用设置 -->
    <div class="settings-grid two-column">
      <label class="setting-field">
        <span class="setting-label">分辨率</span>
        <select v-model="displayState.resolution" class="setting-select">
          <option
            v-for="resolution in resolutionOptions"
            :key="resolution"
            :value="resolution"
          >
            {{ resolution }}
          </option>
        </select>
      </label>

      <label class="setting-field" v-if="!isAndroidPlatform">
        <span class="setting-label">窗口模式</span>
        <select v-model="displayState.windowMode" class="setting-select">
          <option value="windowed">窗口</option>
          <option value="borderless">无边框窗口</option>
          <option value="fullscreen">全屏</option>
        </select>
      </label>

      <label class="setting-field">
        <span class="setting-label">画质预设</span>
        <select v-model="displayState.quality" class="setting-select">
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
          <option value="ultra">超高</option>
        </select>
      </label>

      <label class="setting-field">
        <span class="setting-label">文本速度 {{ displayState.textSpeed }}%</span>
        <input v-model="displayState.textSpeed" class="setting-range" type="range" min="0" max="100" />
      </label>
    </div>

    <label class="setting-checkbox-row">
      <input v-model="displayState.dynamicEffects" class="setting-checkbox" type="checkbox" />
      <span>启用动态特效（粒子、抖动、过渡）</span>
    </label>

    <div class="setting-actions">
      <button type="button" class="action-button action-strong" :disabled="isApplying" @click="applyDisplaySettings">
        {{ isApplying ? '应用中...' : '应用画面设置' }}
      </button>
    </div>

    <p class="status-message">{{ statusMessage }}</p>
  </section>
</template>

<style scoped>
.android-settings-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: linear-gradient(135deg, rgba(0, 245, 212, 0.1), rgba(255, 58, 242, 0.1));
  border-radius: 12px;
  border: 1px solid var(--accent-cyan, #00f5d4);
}

.subsection-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--accent-cyan, #00f5d4);
  margin-bottom: 0.75rem;
}

.android-note {
  font-size: 0.85rem;
  color: var(--muted, #888);
  margin-top: 0.5rem;
  opacity: 0.8;
}
</style>
