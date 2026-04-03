<script setup>
import { onMounted, reactive, ref } from 'vue'

const DISPLAY_STORAGE_KEY = 'avg_llm_display_settings'

const displayState = reactive({
  resolution: '1280x720',
  windowMode: 'windowed',
  quality: 'high',
  textSpeed: 72,
  dynamicEffects: true,
})

const defaultResolutionOptions = ['1280x720', '1366x768', '1600x900', '1920x1080', '2560x1440']
const resolutionOptions = ref(defaultResolutionOptions)
const isApplying = ref(false)
const statusMessage = ref('画面参数待应用。')

const readLocalSettings = () => {
  try {
    const raw = localStorage.getItem(DISPLAY_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed?.resolution) displayState.resolution = parsed.resolution
    if (parsed?.windowMode) displayState.windowMode = parsed.windowMode
  } catch {
    // Ignore invalid local snapshot.
  }
}

const loadCurrentDisplaySettings = async () => {
  readLocalSettings()

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
  }

  localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(payload))

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

      <label class="setting-field">
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
