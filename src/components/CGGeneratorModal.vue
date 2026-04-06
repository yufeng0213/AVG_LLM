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

<style scoped>
.cg-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.cg-modal {
  width: 90%;
  max-width: 900px;
  max-height: 90vh;
  background: var(--bg, #1a1a2e);
  border: 2px solid var(--accent-cyan, #00d4ff);
  border-radius: 12px;
  box-shadow: 0 0 40px rgba(0, 212, 255, 0.3);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.cg-modal-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "title close"
    "status status";
  align-items: center;
  gap: 8px 10px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, #333);
  background: color-mix(in srgb, var(--accent-cyan, #00d4ff) 10%, transparent);
}

.cg-title {
  grid-area: title;
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--accent-cyan, #00d4ff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.server-status {
  grid-area: status;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--muted-foreground, #888);
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent-orange, #ff6b35);
  transition: all 0.3s;
}

.status-indicator.available {
  background: #4ade80;
  box-shadow: 0 0 8px #4ade80;
}

.settings-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--accent-cyan, #00d4ff);
  cursor: pointer;
  font-size: 1rem;
  padding: 4px 8px;
}

.close-btn {
  grid-area: close;
  appearance: none;
  border: none;
  background: transparent;
  color: var(--muted-foreground, #888);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 4px 8px;
  justify-self: end;
  transition: color 0.2s;
}

.close-btn:hover {
  color: var(--accent-orange, #ff6b35);
}

.cg-modal-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prompt-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prompt-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prompt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.prompt-editor label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text, #ccc);
}

.summary-btn {
  appearance: none;
  border: 1px solid var(--accent-yellow, #f6c945);
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--accent-yellow, #f6c945);
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
}

.summary-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-yellow, #f6c945) 14%, transparent);
}

.summary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.summary-caption {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--accent-cyan, #00d4ff) 40%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-cyan, #00d4ff) 10%, transparent);
  color: var(--text, #ddd);
  font-size: 0.82rem;
  line-height: 1.5;
}

textarea {
  background: var(--surface-panel, #252540);
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  padding: 12px;
  font-size: 0.9rem;
  color: var(--foreground, #fff);
  font-family: inherit;
  resize: vertical;
  width: 100%;
}

textarea:focus {
  outline: none;
  border-color: var(--accent-cyan, #00d4ff);
}

textarea::placeholder {
  color: var(--muted-foreground, #666);
}

.config-section {
  padding: 16px;
  background: color-mix(in srgb, var(--surface-panel, #252540) 30%, transparent);
  border-radius: 8px;
  border: 1px solid var(--border, #333);
}

.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.config-title {
  margin: 0;
  font-size: 0.95rem;
  color: var(--accent-magenta, #ff00ff);
}

.config-toggle-btn {
  appearance: none;
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  background: transparent;
  color: var(--text, #ccc);
  font-size: 0.8rem;
  line-height: 1.2;
  padding: 5px 10px;
  cursor: pointer;
}

.config-toggle-btn:hover:not(:disabled) {
  border-color: var(--accent-cyan, #00d4ff);
  color: var(--accent-cyan, #00d4ff);
}

.config-content {
  margin-top: 12px;
}

.section-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text, #ccc);
  margin-bottom: 8px;
  display: block;
}

.config-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.config-row:last-child {
  margin-bottom: 0;
}

.config-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.config-group label {
  font-size: 0.8rem;
  color: var(--muted-foreground, #888);
}

select,
input[type="number"] {
  background: var(--surface-panel, #252540);
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.85rem;
  color: var(--foreground, #fff);
  font-family: inherit;
}

select:focus,
input:focus {
  outline: none;
  border-color: var(--accent-cyan, #00d4ff);
}

.empty-hint {
  font-size: 0.75rem;
  color: var(--accent-orange, #ff6b35);
}

.resolution-section {
  margin-bottom: 12px;
}

.resolution-presets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.preset-btn {
  appearance: none;
  border: 1px solid var(--border, #333);
  border-radius: 4px;
  padding: 7px 8px;
  font-size: 0.8rem;
  color: var(--muted-foreground, #888);
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}

.preset-btn:hover:not(:disabled) {
  border-color: var(--accent-cyan, #00d4ff);
  color: var(--accent-cyan, #00d4ff);
}

.preset-btn.active {
  border-color: var(--accent-cyan, #00d4ff);
  background: color-mix(in srgb, var(--accent-cyan, #00d4ff) 20%, transparent);
  color: var(--accent-cyan, #00d4ff);
}

.preset-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.resolution-control {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.slider-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.slider-group label {
  font-size: 0.8rem;
  color: var(--muted-foreground, #888);
}

.slider-row,
.param-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.slider-row input[type="range"],
.param-row input[type="range"] {
  flex: 1;
  height: 6px;
  background: var(--surface-panel, #252540);
  border-radius: 3px;
  appearance: none;
  cursor: pointer;
}

.slider-row input[type="range"]::-webkit-slider-thumb,
.param-row input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent-cyan, #00d4ff);
  cursor: pointer;
  transition: transform 0.2s;
}

.slider-row input[type="range"]::-webkit-slider-thumb:hover,
.param-row input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.2);
}

.number-input {
  width: 80px;
  padding: 6px 8px;
  text-align: center;
}

.resolution-preview {
  margin: 8px 0 0;
  font-size: 0.85rem;
  color: var(--accent-cyan, #00d4ff);
  text-align: center;
}

.seed-hint {
  font-size: 0.75rem;
  color: var(--muted-foreground, #888);
}

.error-message {
  padding: 12px;
  background: color-mix(in srgb, var(--accent-orange, #ff6b35) 20%, transparent);
  border-radius: 6px;
  color: var(--accent-orange, #ff6b35);
  font-size: 0.85rem;
}

.action-buttons {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 8px;
}

.primary-btn,
.secondary-btn {
  appearance: none;
  border: 2px solid var(--accent-cyan, #00d4ff);
  border-radius: 8px;
  padding: 9px 14px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.primary-btn {
  background: var(--accent-cyan, #00d4ff);
  color: var(--bg, #1a1a2e);
}

.primary-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-cyan, #00d4ff) 80%, var(--accent-magenta, #ff00ff));
  transform: translateY(-1px);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.secondary-btn {
  background: transparent;
  color: var(--accent-cyan, #00d4ff);
}

.secondary-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-cyan, #00d4ff) 15%, transparent);
}

.generate-btn {
  min-width: 108px;
}

.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.settings-panel {
  background: var(--bg, #1a1a2e);
  border: 2px solid var(--accent-magenta, #ff00ff);
  border-radius: 12px;
  padding: 20px;
  width: 90%;
  max-width: 400px;
}

.settings-panel h3 {
  margin: 0 0 16px;
  color: var(--accent-magenta, #ff00ff);
  font-size: 1.1rem;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.setting-item label {
  font-size: 0.85rem;
  color: var(--text, #ccc);
}

.setting-item input {
  background: var(--surface-panel, #252540);
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 0.9rem;
  color: var(--foreground, #fff);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.test-btn {
  appearance: none;
  border: 1px solid var(--accent-cyan, #00d4ff);
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 0.8rem;
  color: var(--accent-cyan, #00d4ff);
  background: transparent;
  cursor: pointer;
  margin-left: auto;
}

.test-btn:hover {
  background: color-mix(in srgb, var(--accent-cyan, #00d4ff) 15%, transparent);
}

.settings-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .cg-modal,
.modal-leave-active .cg-modal {
  transition: transform 0.3s ease;
}

.modal-enter-from .cg-modal,
.modal-leave-to .cg-modal {
  transform: scale(0.95);
}

@media (max-width: 600px) {
  .cg-modal {
    width: 96vw;
    max-height: 92dvh;
    border-radius: 10px;
  }

  .cg-modal-header {
    padding: 10px 12px;
    gap: 6px 8px;
  }

  .cg-title {
    font-size: 1rem;
  }

  .server-status {
    font-size: 0.75rem;
    gap: 6px;
  }

  .cg-modal-body {
    padding: 10px;
    gap: 10px;
  }

  .config-section {
    padding: 10px;
  }

  .config-header {
    align-items: center;
  }

  .prompt-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .summary-btn {
    width: 100%;
    text-align: center;
  }

  .config-row {
    grid-template-columns: 1fr;
    gap: 8px;
    margin-bottom: 8px;
  }

  .resolution-control {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .resolution-presets {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .number-input {
    width: 70px;
  }

  .action-buttons,
  .settings-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .primary-btn,
  .secondary-btn {
    width: 100%;
    padding: 8px 10px;
    font-size: 0.84rem;
  }

  .test-btn {
    margin-left: 0;
  }
}
</style>
