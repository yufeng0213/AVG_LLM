<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { kvStorage } from '../storage/index.js'

const CONFIG_STORAGE_KEY = 'api_configs'
const ACTIVE_CONFIG_KEY = 'active_api_id'
const DEFAULT_TTS_API = 'https://api.minimaxi.com/v1/t2a_v2'
const DEFAULT_TTS_MODEL = 'speech-2.8-hd'

// 折叠状态
const llmSectionExpanded = ref(true)
const ttsSectionExpanded = ref(false)

const toggleLlmSection = () => {
  llmSectionExpanded.value = !llmSectionExpanded.value
}

const toggleTtsSection = () => {
  ttsSectionExpanded.value = !ttsSectionExpanded.value
}

const clampNumber = (value, min, max, fallback) => {
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

const parseNumber = (value, fallback) => {
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

const clampInteger = (value, min, max, fallback) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

const normalizeTtsFormat = (value) => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'wav' || raw === 'flac' || raw === 'mp3') {
    return raw
  }
  return 'mp3'
}

const createDefaultTtsVoiceSetting = () => ({
  voiceId: '',
  speed: 1,
  vol: 1,
  pitch: 0,
  emotion: '',
})

const createDefaultTtsAudioSetting = () => ({
  sampleRate: 32000,
  bitrate: 128000,
  format: 'mp3',
  channel: 1,
})

const normalizeConfig = (rawConfig = {}) => {
  const fallbackVoice = createDefaultTtsVoiceSetting()
  const fallbackAudio = createDefaultTtsAudioSetting()
  const voiceSetting = rawConfig.ttsDefaultVoice && typeof rawConfig.ttsDefaultVoice === 'object'
    ? rawConfig.ttsDefaultVoice
    : {}
  const audioSetting = rawConfig.ttsDefaultAudio && typeof rawConfig.ttsDefaultAudio === 'object'
    ? rawConfig.ttsDefaultAudio
    : {}

  return {
    id: String(rawConfig.id || '').trim(),
    name: String(rawConfig.name || '').trim() || '未命名配置',
    customApi: String(rawConfig.customApi || '').trim(),
    apiKey: String(rawConfig.apiKey || '').trim(),
    model: String(rawConfig.model || '').trim() || 'gpt-5.2',
    ttsApi: String(rawConfig.ttsApi || DEFAULT_TTS_API).trim(),
    ttsApiKey: String(rawConfig.ttsApiKey || '').trim(),
    ttsModel: String(rawConfig.ttsModel || DEFAULT_TTS_MODEL).trim() || DEFAULT_TTS_MODEL,
    ttsDefaultVoice: {
      voiceId: String(voiceSetting.voiceId || '').trim(),
      speed: clampNumber(voiceSetting.speed, 0.5, 2, fallbackVoice.speed),
      vol: parseNumber(voiceSetting.vol, fallbackVoice.vol),
      pitch: clampNumber(voiceSetting.pitch, -12, 12, fallbackVoice.pitch),
      emotion: String(voiceSetting.emotion || '').trim(),
    },
    ttsDefaultAudio: {
      sampleRate: clampInteger(audioSetting.sampleRate, 8000, 48000, fallbackAudio.sampleRate),
      bitrate: clampInteger(audioSetting.bitrate, 32000, 320000, fallbackAudio.bitrate),
      format: normalizeTtsFormat(audioSetting.format),
      channel: clampInteger(audioSetting.channel, 1, 2, fallbackAudio.channel),
    },
  }
}

const configs = ref([])
const selectedConfigId = ref('')
const activeConfigId = ref('')
const statusMessage = ref('请填写参数并保存配置。')

// 模型列表
const availableModels = ref([])
const isFetchingModels = ref(false)

const form = reactive({
  id: '',
  name: '默认配置',
  customApi: '',
  apiKey: '',
  model: 'gpt-5.2',
  ttsApi: DEFAULT_TTS_API,
  ttsApiKey: '',
  ttsModel: DEFAULT_TTS_MODEL,
  ttsDefaultVoice: createDefaultTtsVoiceSetting(),
  ttsDefaultAudio: createDefaultTtsAudioSetting(),
})

const activeConfigName = computed(() => {
  if (!activeConfigId.value) return '未应用'
  const match = configs.value.find((item) => item.id === activeConfigId.value)
  return match ? match.name : '未应用'
})

const applyToForm = (config) => {
  const normalized = normalizeConfig(config)
  form.id = normalized.id
  form.name = normalized.name
  form.customApi = normalized.customApi
  form.apiKey = normalized.apiKey
  form.model = normalized.model
  form.ttsApi = normalized.ttsApi
  form.ttsApiKey = normalized.ttsApiKey
  form.ttsModel = normalized.ttsModel
  form.ttsDefaultVoice = { ...normalized.ttsDefaultVoice }
  form.ttsDefaultAudio = { ...normalized.ttsDefaultAudio }
}

const createEmptyDraft = () => {
  form.id = ''
  form.name = `新配置-${configs.value.length + 1}`
  form.customApi = ''
  form.apiKey = ''
  form.model = 'gpt-5.2'
  form.ttsApi = DEFAULT_TTS_API
  form.ttsApiKey = ''
  form.ttsModel = DEFAULT_TTS_MODEL
  form.ttsDefaultVoice = createDefaultTtsVoiceSetting()
  form.ttsDefaultAudio = createDefaultTtsAudioSetting()
}

const persistConfigs = async () => {
  await kvStorage.set(CONFIG_STORAGE_KEY, configs.value)
}

const loadStorage = async () => {
  try {
    const parsed = await kvStorage.get(CONFIG_STORAGE_KEY)
    configs.value = Array.isArray(parsed) ? parsed.map((item) => normalizeConfig(item)) : []
  } catch {
    configs.value = []
  }

  if (configs.value.length > 0) {
    selectedConfigId.value = configs.value[0].id
    applyToForm(configs.value[0])
    statusMessage.value = '已载入本地配置。'
  } else {
    createEmptyDraft()
  }

  activeConfigId.value = (await kvStorage.get(ACTIVE_CONFIG_KEY)) || ''
}

const saveConfig = async () => {
  if (!form.customApi.trim()) {
    statusMessage.value = 'LLM的自定义API 不能为空。'
    return
  }

  if (!form.apiKey.trim()) {
    statusMessage.value = 'API Key 不能为空。'
    return
  }

  const nextConfig = {
    id: form.id || `cfg_${Date.now()}`,
    name: form.name.trim() || `配置-${configs.value.length + 1}`,
    customApi: form.customApi.trim(),
    apiKey: form.apiKey.trim(),
    model: form.model.trim() || 'gpt-5.2',
    ttsApi: form.ttsApi.trim() || DEFAULT_TTS_API,
    ttsApiKey: form.ttsApiKey.trim(),
    ttsModel: form.ttsModel.trim() || DEFAULT_TTS_MODEL,
    ttsDefaultVoice: {
      voiceId: String(form.ttsDefaultVoice?.voiceId || '').trim(),
      speed: clampNumber(form.ttsDefaultVoice?.speed, 0.5, 2, 1),
      vol: parseNumber(form.ttsDefaultVoice?.vol, 1),
      pitch: clampNumber(form.ttsDefaultVoice?.pitch, -12, 12, 0),
      emotion: String(form.ttsDefaultVoice?.emotion || '').trim(),
    },
    ttsDefaultAudio: {
      sampleRate: clampInteger(form.ttsDefaultAudio?.sampleRate, 8000, 48000, 32000),
      bitrate: clampInteger(form.ttsDefaultAudio?.bitrate, 32000, 320000, 128000),
      format: normalizeTtsFormat(form.ttsDefaultAudio?.format),
      channel: clampInteger(form.ttsDefaultAudio?.channel, 1, 2, 1),
    },
  }

  const normalizedNextConfig = normalizeConfig(nextConfig)
  const index = configs.value.findIndex((item) => item.id === normalizedNextConfig.id)
  if (index === -1) {
    configs.value.push(normalizedNextConfig)
  } else {
    configs.value[index] = normalizedNextConfig
  }

  applyToForm(normalizedNextConfig)
  selectedConfigId.value = normalizedNextConfig.id
  await persistConfigs()
  statusMessage.value = `已保存配置：${normalizedNextConfig.name}`
}

const applyConfig = async () => {
  if (!form.id) {
    await saveConfig()
  }

  if (!form.id) return

  activeConfigId.value = form.id
  await kvStorage.set(ACTIVE_CONFIG_KEY, form.id)
  statusMessage.value = `已应用配置：${form.name}`
}

const addNewConfig = () => {
  createEmptyDraft()
  selectedConfigId.value = ''
  statusMessage.value = '已创建新的 API 配置草稿。'
}

const loadSavedConfig = () => {
  if (!selectedConfigId.value) {
    statusMessage.value = '请先选择要加载的配置。'
    return
  }

  const target = configs.value.find((item) => item.id === selectedConfigId.value)
  if (!target) {
    statusMessage.value = '未找到对应配置。'
    return
  }

  applyToForm(target)
  statusMessage.value = `已加载配置：${target.name}`
}

const fetchModels = async () => {
  const baseUrl = form.customApi.trim()
  if (!baseUrl) {
    statusMessage.value = '请先填写 LLM API 地址。'
    return
  }

  // 构建 models 端点 URL
  let modelsUrl
  try {
    const url = new URL(baseUrl)
    // 如果 URL包含 /chat/completions，替换为 /models
    if (url.pathname.endsWith('/chat/completions')) {
      url.pathname = url.pathname.replace('/chat/completions', '/models')
    } else if (!url.pathname.endsWith('/models')) {
      // 如果路径不以 /models 结尾，追加 /models
      if (url.pathname.endsWith('/')) {
        url.pathname += 'models'
      } else {
        url.pathname += '/models'
      }
    }
    modelsUrl = url.toString()
  } catch {
    // 如果 URL 解析失败，尝试字符串拼接
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    modelsUrl = base + '/models'
  }

  statusMessage.value = '正在拉取模型列表...'

  try {
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${form.apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    const models = data.data || data.models || []

    if (models.length === 0) {
      statusMessage.value = '未找到可用模型。'
      return
    }

    // 提取模型 ID 列表
    const modelIds = models.map((m) => typeof m === 'string' ? m : m.id).filter(Boolean)

    if (modelIds.length > 0) {
      availableModels.value = modelIds
      // 如果当前模型不在列表中，设置为第一个
      if (!modelIds.includes(form.model)) {
        form.model = modelIds[0]
      }
      statusMessage.value = `拉取成功！共找到 ${modelIds.length} 个可用模型。`
    } else {
      availableModels.value = []
      statusMessage.value = '模型列表为空。'
    }
  } catch (error) {
    statusMessage.value = `拉取模型失败：${error.message}`
    availableModels.value = []
  } finally {
    isFetchingModels.value = false
  }
}

onMounted(loadStorage)
</script>

<template>
  <section class="settings-panel-content">
    <h2 class="panel-title">API设置</h2>
    <p class="panel-description">维护多个模型服务端点，并在本地保存可复用的 API 配置模板。</p>

    <!-- 基础配置 -->
    <div class="settings-grid single-column">
      <label class="setting-field">
        <span class="setting-label">配置名称</span>
        <input v-model="form.name" class="setting-input" type="text" placeholder="例如：主力线路" />
      </label>
    </div>

    <!-- LLM API 设置 - 可折叠 -->
    <div class="api-section">
      <button type="button" class="api-section-header" @click="toggleLlmSection">
        <span class="api-section-title">LLM API 设置</span>
        <span class="api-section-arrow" :class="{ expanded: llmSectionExpanded }">›</span>
      </button>
      <div v-show="llmSectionExpanded" class="api-section-content">
        <div class="settings-grid single-column">
          <label class="setting-field">
            <span class="setting-label">LLM的自定义API</span>
            <input
              v-model="form.customApi"
              class="setting-input"
              type="url"
              placeholder="https://your-api-endpoint/v1/chat/completions"
            />
          </label>

          <label class="setting-field">
            <span class="setting-label">API Key</span>
            <input v-model="form.apiKey" class="setting-input" type="password" placeholder="输入你的 API Key" />
          </label>

          <div class="setting-field setting-field-row">
            <label class="setting-label-inline">模型名称</label>
            <select v-model="form.model" class="setting-select setting-select-flex" :disabled="availableModels.length === 0">
              <option value="" disabled v-if="availableModels.length === 0">请先拉取模型列表</option>
              <option v-for="modelId in availableModels" :key="modelId" :value="modelId">
                {{ modelId }}
              </option>
            </select>
            <button type="button" class="action-button action-button-fetch" @click="fetchModels" :disabled="!form.customApi.trim() || isFetchingModels">
              {{ isFetchingModels ? '...' : '拉取' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- TTS API 设置 - 可折叠 -->
    <div class="api-section">
      <button type="button" class="api-section-header" @click="toggleTtsSection">
        <span class="api-section-title">TTS API 设置（MiniMax）</span>
        <span class="api-section-arrow" :class="{ expanded: ttsSectionExpanded }">›</span>
      </button>
      <div v-show="ttsSectionExpanded" class="api-section-content">
        <div class="settings-grid two-column">
          <label class="setting-field">
            <span class="setting-label">TTS API 地址</span>
            <input
              v-model="form.ttsApi"
              class="setting-input"
              type="url"
              placeholder="https://api.minimaxi.com/v1/t2a_v2"
            />
          </label>
          <label class="setting-field">
            <span class="setting-label">TTS 模型名</span>
            <input
              v-model="form.ttsModel"
              class="setting-input"
              type="text"
              placeholder="speech-2.8-hd"
            />
          </label>
        </div>

        <div class="settings-grid single-column">
          <label class="setting-field">
            <span class="setting-label">TTS API Key（可选，留空则复用上方 API Key）</span>
            <input
              v-model="form.ttsApiKey"
              class="setting-input"
              type="password"
              placeholder="可留空"
            />
          </label>
        </div>

        <div class="settings-grid three-column">
          <label class="setting-field">
            <span class="setting-label">默认 speed</span>
            <input
              v-model.number="form.ttsDefaultVoice.speed"
              class="setting-input"
              type="number"
              inputmode="decimal"
              min="0.5"
              max="2"
              step="0.05"
            />
          </label>
          <label class="setting-field">
            <span class="setting-label">默认 vol</span>
            <input
              v-model.number="form.ttsDefaultVoice.vol"
              class="setting-input"
              type="number"
              inputmode="decimal"
              step="0.01"
            />
          </label>
          <label class="setting-field">
            <span class="setting-label">默认 pitch</span>
            <input
              v-model.number="form.ttsDefaultVoice.pitch"
              class="setting-input"
              type="number"
              inputmode="decimal"
              min="-12"
              max="12"
              step="0.5"
            />
          </label>
        </div>

        <div class="settings-grid four-column">
          <label class="setting-field">
            <span class="setting-label">默认 sample_rate</span>
            <input
              v-model.number="form.ttsDefaultAudio.sampleRate"
              class="setting-input"
              type="number"
              inputmode="numeric"
              min="8000"
              max="48000"
              step="1000"
            />
          </label>
          <label class="setting-field">
            <span class="setting-label">默认 bitrate</span>
            <input
              v-model.number="form.ttsDefaultAudio.bitrate"
              class="setting-input"
              type="number"
              inputmode="numeric"
              min="32000"
              max="320000"
              step="1000"
            />
          </label>
          <label class="setting-field">
            <span class="setting-label">默认 format</span>
            <select v-model="form.ttsDefaultAudio.format" class="setting-select">
              <option value="mp3">mp3</option>
              <option value="wav">wav</option>
              <option value="flac">flac</option>
            </select>
          </label>
          <label class="setting-field">
            <span class="setting-label">默认 channel</span>
            <select v-model.number="form.ttsDefaultAudio.channel" class="setting-select">
              <option :value="1">1</option>
              <option :value="2">2</option>
            </select>
          </label>
        </div>
      </div>
    </div>

    <div class="settings-grid two-column">
      <label class="setting-field">
        <span class="setting-label">已保存配置</span>
        <select v-model="selectedConfigId" class="setting-select">
          <option value="" disabled>请选择配置</option>
          <option v-for="item in configs" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
      </label>

      <p class="setting-status-chip">当前应用：{{ activeConfigName }}</p>
    </div>

    <div class="setting-actions">
      <button type="button" class="action-button" @click="saveConfig">保存</button>
      <button type="button" class="action-button action-strong" @click="applyConfig">应用</button>
      <button type="button" class="action-button action-outline" @click="addNewConfig">
        新增新的API配置
      </button>
      <button type="button" class="action-button action-ghost" @click="loadSavedConfig">
        加载之前保存的API配置
      </button>
    </div>

    <p class="status-message">{{ statusMessage }}</p>
  </section>
</template>

<style scoped src="./SettingsPanel.css"></style>

