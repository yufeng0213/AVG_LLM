<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import {
  checkComfyUIAvailable,
  getComfyUIConfig,
  saveComfyUIConfig,
  getAvailableModels,
  getAvailableVAEs,
  getAvailableSamplers,
  getAvailableSchedulers,
} from '../comfyui/comfyuiService.js'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  worldBook: {
    type: Object,
    default: null,
  },
  dialogueHistory: {
    type: Array,
    default: () => [],
  },
  currentLine: {
    type: Object,
    default: null,
  },
  summaryLoading: {
    type: Boolean,
    default: false,
  },
  summaryError: {
    type: String,
    default: '',
  },
  summaryResult: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['close', 'generate-request', 'request-scene-summary'])

const error = ref('')

const positivePrompt = ref('')
const negativePrompt = ref('low quality, bad quality, blurry, ugly, distorted, deformed, watermark, text')
const configCollapsed = ref(true)

const config = ref({
  serverUrl: 'http://127.0.0.1:8188',
  timeout: 300000,
  workflowPath: '/data/comfyui/workflow_default.json',
  model: 'z-image-turbo-fp8-e4m3fn.safetensors',
  vae: 'ae.safetensors',
  clip: 'qwen_3_4b_fp8_mixed.safetensors',
  width: 1024,
  height: 1024,
  steps: 8,
  cfgScale: 1,
  sampler: 'res_multistep',
  scheduler: 'simple',
  seed: -1,
})
const serverUrl = ref(config.value.serverUrl)
const isServerAvailable = ref(false)
const showSettings = ref(false)

const availableModels = ref([])
const availableVAEs = ref([])
const availableSamplers = ref([])
const availableSchedulers = ref([])

const selectedModel = ref('')
const selectedVAE = ref('')
const imageWidth = ref(1024)
const imageHeight = ref(1024)
const steps = ref(8)
const cfgScale = ref(1)
const selectedSampler = ref('res_multistep')
const selectedScheduler = ref('simple')
const seed = ref(-1)

const MAX_RESOLUTION = 4096
const MIN_RESOLUTION = 256

const getNormalizedServerUrl = () => (serverUrl.value || '').trim()

const loadConfigToState = async () => {
  const loadedConfig = await getComfyUIConfig()
  config.value = loadedConfig
  serverUrl.value = loadedConfig.serverUrl
  selectedModel.value = loadedConfig.model
  selectedVAE.value = loadedConfig.vae
  imageWidth.value = loadedConfig.width
  imageHeight.value = loadedConfig.height
  steps.value = loadedConfig.steps
  cfgScale.value = loadedConfig.cfgScale
  selectedSampler.value = loadedConfig.sampler
  selectedScheduler.value = loadedConfig.scheduler
  seed.value = loadedConfig.seed ?? -1
}

const loadAvailableResources = async () => {
  if (!isServerAvailable.value) return

  try {
    const currentServerUrl = getNormalizedServerUrl()
    const [models, vaes, samplers, schedulers] = await Promise.all([
      getAvailableModels(currentServerUrl),
      getAvailableVAEs(currentServerUrl),
      getAvailableSamplers(currentServerUrl),
      getAvailableSchedulers(currentServerUrl),
    ])

    availableModels.value = models
    availableVAEs.value = vaes
    availableSamplers.value = samplers
    availableSchedulers.value = schedulers

    if (models.length > 0 && !models.includes(selectedModel.value)) {
      selectedModel.value = models[0]
    }
    if (vaes.length > 0 && !vaes.includes(selectedVAE.value)) {
      selectedVAE.value = vaes[0]
    }
    if (samplers.length > 0 && !samplers.includes(selectedSampler.value)) {
      selectedSampler.value = samplers[0]
    }
    if (schedulers.length > 0 && !schedulers.includes(selectedScheduler.value)) {
      selectedScheduler.value = schedulers[0]
    }
  } catch (err) {
    console.error('加载资源列表失败:', err)
  }
}

const checkServer = async () => {
  const currentServerUrl = getNormalizedServerUrl()
  isServerAvailable.value = await checkComfyUIAvailable(currentServerUrl)
  if (isServerAvailable.value) {
    await loadAvailableResources()
  }
}

watch(() => props.visible, async (newVal) => {
  if (!newVal) return
  error.value = ''
  configCollapsed.value = true
  await loadConfigToState()
  await checkServer()
})

watch(
  () => props.summaryResult,
  (newValue) => {
    if (!newValue || typeof newValue !== 'object') return

    const nextPositive = String(newValue.positivePromptZh || '').trim() || String(newValue.positivePrompt || '').trim()
    if (nextPositive) {
      positivePrompt.value = nextPositive
    }

    const nextNegative = String(newValue.negativePrompt || '').trim()
    if (nextNegative) {
      negativePrompt.value = nextNegative
    }
  },
  { deep: true },
)

const clampResolution = (value) => {
  const num = parseInt(value, 10) || MIN_RESOLUTION
  return Math.max(MIN_RESOLUTION, Math.min(MAX_RESOLUTION, num))
}

const updateWidth = (value) => {
  imageWidth.value = clampResolution(value)
}

const updateHeight = (value) => {
  imageHeight.value = clampResolution(value)
}

const resolutionPresets = [
  { width: 512, height: 512, label: '512×512' },
  { width: 512, height: 768, label: '512×768' },
  { width: 768, height: 512, label: '768×512' },
  { width: 1024, height: 1024, label: '1024×1024' },
  { width: 1024, height: 1536, label: '1024×1536' },
  { width: 1536, height: 1024, label: '1536×1024' },
]

const selectResolutionPreset = (preset) => {
  imageWidth.value = preset.width
  imageHeight.value = preset.height
}

const canGenerate = computed(() => {
  return Boolean(
    isServerAvailable.value &&
    positivePrompt.value.trim() &&
    selectedModel.value &&
    selectedVAE.value &&
    !props.summaryLoading,
  )
})

const handleRequestSceneSummary = () => {
  if (props.summaryLoading) return
  error.value = ''
  emit('request-scene-summary')
}

const handleGenerate = async () => {
  const finalPositivePrompt = String(positivePrompt.value || '').trim()
  if (!finalPositivePrompt) {
    error.value = '请输入正向提示词'
    return
  }

  if (!isServerAvailable.value) {
    error.value = 'ComfyUI 未连接，请检查服务器地址'
    return
  }

  error.value = ''

  const nextConfig = {
    ...config.value,
    serverUrl: getNormalizedServerUrl(),
    model: selectedModel.value,
    vae: selectedVAE.value,
    width: imageWidth.value,
    height: imageHeight.value,
    steps: steps.value,
    cfgScale: cfgScale.value,
    sampler: selectedSampler.value,
    scheduler: selectedScheduler.value,
    seed: seed.value,
  }
  config.value = nextConfig
  await saveComfyUIConfig(nextConfig)

  const actualSeed = seed.value === -1 ? Math.floor(Math.random() * 1000000000000) : seed.value

  emit('generate-request', {
    serverUrl: getNormalizedServerUrl(),
    workflowPath: config.value.workflowPath,
    positivePrompt: finalPositivePrompt,
    negativePrompt: negativePrompt.value.trim(),
    model: selectedModel.value,
    vae: selectedVAE.value,
    width: imageWidth.value,
    height: imageHeight.value,
    steps: steps.value,
    cfgScale: cfgScale.value,
    seed: actualSeed,
    sampler: selectedSampler.value,
    scheduler: selectedScheduler.value,
    sceneSummary: String(props.summaryResult?.sceneSummary || '').trim(),
  })
}

const handleClose = () => {
  emit('close')
}

const handleSaveSettings = async () => {
  config.value = {
    ...config.value,
    serverUrl: getNormalizedServerUrl(),
  }
  serverUrl.value = config.value.serverUrl
  await saveComfyUIConfig(config.value)
  showSettings.value = false
  await checkServer()
}

onMounted(async () => {
  await loadConfigToState()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="cg-modal-overlay" @click.self="handleClose">
        <div class="cg-modal">
          <header class="cg-modal-header">
            <h2 class="cg-title">🎨 生成 CG 图片</h2>
            <div class="server-status">
              <span class="status-indicator" :class="{ available: isServerAvailable }"></span>
              <span>{{ isServerAvailable ? 'ComfyUI 已连接' : 'ComfyUI 未连接' }}</span>
              <button type="button" class="settings-btn cg-btn" @click="showSettings = true">⚙️</button>
            </div>
            <button type="button" class="close-btn cg-btn" @click="handleClose">✕</button>
          </header>

          <div class="cg-modal-body">
            <div class="prompt-section">
              <div class="prompt-editor">
                <div class="prompt-header">
                  <label for="positive-prompt">正向提示词</label>
                  <button
                    type="button"
                    class="summary-btn cg-btn"
                    :disabled="summaryLoading"
                    @click="handleRequestSceneSummary"
                  >
                    {{ summaryLoading ? '总结中...' : '总结当前场景' }}
                  </button>
                </div>
                <textarea
                  id="positive-prompt"
                  v-model="positivePrompt"
                  class="cg-textarea"
                  rows="4"
                  placeholder="可以先点“总结当前场景”自动生成，再手动微调。"
                  :disabled="summaryLoading"
                ></textarea>
              </div>

              <div class="prompt-editor">
                <label for="negative-prompt">负向提示词</label>
                <textarea
                  id="negative-prompt"
                  v-model="negativePrompt"
                  class="cg-textarea"
                  rows="2"
                  placeholder="描述你不想要的元素..."
                  :disabled="summaryLoading"
                ></textarea>
              </div>

              <p v-if="summaryResult?.sceneSummary" class="summary-caption">
                场景摘要：{{ summaryResult.sceneSummary }}
              </p>
              <div v-if="summaryError" class="error-message">
                {{ summaryError }}
              </div>
              <div v-if="error" class="error-message">
                {{ error }}
              </div>
            </div>

            <div class="config-section">
              <div class="config-header">
                <h4 class="config-title">🛠️ 生成配置</h4>
                <button type="button" class="config-toggle-btn cg-btn" @click="configCollapsed = !configCollapsed">
                  {{ configCollapsed ? '展开' : '收起' }}
                </button>
              </div>

              <div v-show="!configCollapsed" class="config-content">
                <div class="config-row">
                  <div class="config-group">
                    <label for="model-select">模型 (UNET)</label>
                    <select id="model-select" v-model="selectedModel" class="cg-select" :disabled="summaryLoading">
                      <option value="" disabled>请选择模型</option>
                      <option v-for="model in availableModels" :key="model" :value="model">{{ model }}</option>
                    </select>
                    <span v-if="availableModels.length === 0 && isServerAvailable" class="empty-hint">暂无可用模型</span>
                  </div>
                  <div class="config-group">
                    <label for="vae-select">VAE</label>
                    <select id="vae-select" v-model="selectedVAE" class="cg-select" :disabled="summaryLoading">
                      <option value="" disabled>请选择VAE</option>
                      <option v-for="vae in availableVAEs" :key="vae" :value="vae">{{ vae }}</option>
                    </select>
                    <span v-if="availableVAEs.length === 0 && isServerAvailable" class="empty-hint">暂无可用VAE</span>
                  </div>
                </div>

                <div class="config-row">
                  <div class="config-group">
                    <label for="sampler-select">采样器</label>
                    <select id="sampler-select" v-model="selectedSampler" class="cg-select" :disabled="summaryLoading">
                      <option v-for="sampler in availableSamplers" :key="sampler" :value="sampler">{{ sampler }}</option>
                    </select>
                  </div>
                  <div class="config-group">
                    <label for="scheduler-select">调度器</label>
                    <select id="scheduler-select" v-model="selectedScheduler" class="cg-select" :disabled="summaryLoading">
                      <option v-for="scheduler in availableSchedulers" :key="scheduler" :value="scheduler">{{ scheduler }}</option>
                    </select>
                  </div>
                </div>

                <div class="resolution-section">
                  <label class="section-label">分辨率 (最大 4096)</label>

                  <div class="resolution-presets">
                    <button
                      v-for="preset in resolutionPresets"
                      :key="preset.label"
                      type="button"
                      class="preset-btn cg-btn"
                      :class="{ active: imageWidth === preset.width && imageHeight === preset.height }"
                      :disabled="summaryLoading"
                      @click="selectResolutionPreset(preset)"
                    >
                      {{ preset.label }}
                    </button>
                  </div>

                  <div class="resolution-control">
                    <div class="slider-group">
                      <label for="width-slider">宽度</label>
                      <div class="slider-row">
                        <input
                          id="width-slider"
                          type="range"
                          :min="MIN_RESOLUTION"
                          :max="MAX_RESOLUTION"
                          step="64"
                          :value="imageWidth"
                          :disabled="summaryLoading"
                          @input="updateWidth($event.target.value)"
                        />
                        <input
                          type="number"
                          class="number-input cg-input"
                          :min="MIN_RESOLUTION"
                          :max="MAX_RESOLUTION"
                          step="64"
                          :value="imageWidth"
                          :disabled="summaryLoading"
                          @change="updateWidth($event.target.value)"
                        />
                      </div>
                    </div>

                    <div class="slider-group">
                      <label for="height-slider">高度</label>
                      <div class="slider-row">
                        <input
                          id="height-slider"
                          type="range"
                          :min="MIN_RESOLUTION"
                          :max="MAX_RESOLUTION"
                          step="64"
                          :value="imageHeight"
                          :disabled="summaryLoading"
                          @input="updateHeight($event.target.value)"
                        />
                        <input
                          type="number"
                          class="number-input cg-input"
                          :min="MIN_RESOLUTION"
                          :max="MAX_RESOLUTION"
                          step="64"
                          :value="imageHeight"
                          :disabled="summaryLoading"
                          @change="updateHeight($event.target.value)"
                        />
                      </div>
                    </div>
                  </div>

                  <p class="resolution-preview">当前: {{ imageWidth }} × {{ imageHeight }}</p>
                </div>

                <div class="config-row">
                  <div class="config-group">
                    <label for="steps-input">采样步数</label>
                    <div class="param-row">
                      <input
                        id="steps-slider"
                        type="range"
                        min="1"
                        max="60"
                        :value="steps"
                        :disabled="summaryLoading"
                        @input="steps = parseInt($event.target.value, 10)"
                      />
                      <input
                        id="steps-input"
                        type="number"
                        class="number-input cg-input"
                        min="1"
                        max="60"
                        :value="steps"
                        :disabled="summaryLoading"
                        @change="steps = parseInt($event.target.value, 10) || 8"
                      />
                    </div>
                  </div>
                  <div class="config-group">
                    <label for="cfg-input">CFG Scale</label>
                    <div class="param-row">
                      <input
                        id="cfg-slider"
                        type="range"
                        min="1"
                        max="20"
                        step="0.5"
                        :value="cfgScale"
                        :disabled="summaryLoading"
                        @input="cfgScale = parseFloat($event.target.value)"
                      />
                      <input
                        id="cfg-input"
                        type="number"
                        class="number-input cg-input"
                        min="1"
                        max="20"
                        step="0.5"
                        :value="cfgScale"
                        :disabled="summaryLoading"
                        @change="cfgScale = parseFloat($event.target.value) || 1"
                      />
                    </div>
                  </div>
                  <div class="config-group">
                    <label for="seed-input">种子</label>
                    <input
                      id="seed-input"
                      type="number"
                      class="cg-input"
                      :value="seed"
                      :disabled="summaryLoading"
                      @change="seed = parseInt($event.target.value, 10) || -1"
                      placeholder="-1 = 随机"
                    />
                    <span class="seed-hint">-1 = 随机</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="action-buttons">
              <button type="button" class="secondary-btn cg-btn" @click="handleClose">取消</button>
              <button
                type="button"
                class="primary-btn generate-btn cg-btn"
                :disabled="!canGenerate"
                @click="handleGenerate"
              >
                生图
              </button>
            </div>
          </div>
        </div>

        <div v-if="showSettings" class="settings-overlay" @click.self="showSettings = false">
          <div class="settings-panel">
            <h3>ComfyUI 设置</h3>
            <div class="setting-item">
              <label for="server-url">服务器地址</label>
              <input
                id="server-url"
                type="text"
                class="cg-input"
                v-model="serverUrl"
                placeholder="http://127.0.0.1:8188"
              />
            </div>
            <div class="setting-item">
              <label>连接状态</label>
              <div class="connection-status">
                <span class="status-indicator" :class="{ available: isServerAvailable }"></span>
                <span>{{ isServerAvailable ? '已连接' : '未连接' }}</span>
                <button type="button" class="test-btn cg-btn" @click="checkServer">测试连接</button>
              </div>
            </div>
            <div class="settings-actions">
              <button type="button" class="secondary-btn cg-btn" @click="showSettings = false">取消</button>
              <button type="button" class="primary-btn cg-btn" @click="handleSaveSettings">保存</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped src="./CGGeneratorModal.css"></style>

