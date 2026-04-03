<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

const CONFIG_STORAGE_KEY = 'avg_llm_api_configs'
const ACTIVE_CONFIG_KEY = 'avg_llm_active_api_id'

const configs = ref([])
const selectedConfigId = ref('')
const activeConfigId = ref('')
const statusMessage = ref('请填写参数并保存配置。')

const form = reactive({
  id: '',
  name: '默认配置',
  customApi: '',
  apiKey: '',
  model: 'gpt-5.2',
})

const activeConfigName = computed(() => {
  if (!activeConfigId.value) return '未应用'
  const match = configs.value.find((item) => item.id === activeConfigId.value)
  return match ? match.name : '未应用'
})

const applyToForm = (config) => {
  form.id = config.id
  form.name = config.name
  form.customApi = config.customApi
  form.apiKey = config.apiKey
  form.model = config.model
}

const createEmptyDraft = () => {
  form.id = ''
  form.name = `新配置-${configs.value.length + 1}`
  form.customApi = ''
  form.apiKey = ''
  form.model = 'gpt-5.2'
}

const persistConfigs = () => {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configs.value))
}

const loadStorage = () => {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    configs.value = Array.isArray(parsed) ? parsed : []
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

  activeConfigId.value = localStorage.getItem(ACTIVE_CONFIG_KEY) || ''
}

const saveConfig = () => {
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
  }

  const index = configs.value.findIndex((item) => item.id === nextConfig.id)
  if (index === -1) {
    configs.value.push(nextConfig)
  } else {
    configs.value[index] = nextConfig
  }

  applyToForm(nextConfig)
  selectedConfigId.value = nextConfig.id
  persistConfigs()
  statusMessage.value = `已保存配置：${nextConfig.name}`
}

const applyConfig = () => {
  if (!form.id) {
    saveConfig()
  }

  if (!form.id) return

  activeConfigId.value = form.id
  localStorage.setItem(ACTIVE_CONFIG_KEY, form.id)
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

onMounted(loadStorage)
</script>

<template>
  <section class="settings-panel-content">
    <h2 class="panel-title">API设置</h2>
    <p class="panel-description">维护多个模型服务端点，并在本地保存可复用的 API 配置模板。</p>

    <div class="settings-grid two-column">
      <label class="setting-field">
        <span class="setting-label">配置名称</span>
        <input v-model="form.name" class="setting-input" type="text" placeholder="例如：主力线路" />
      </label>

      <label class="setting-field">
        <span class="setting-label">模型名称</span>
        <input v-model="form.model" class="setting-input" type="text" placeholder="例如：gpt-5.2" />
      </label>
    </div>

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
