<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import {
  generateCG,
  checkComfyUIAvailable,
  getComfyUIConfig,
  saveComfyUIConfig,
  getImageBase64,
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
})

const emit = defineEmits(['close', 'generated'])

// 状态
const isGenerating = ref(false)
const error = ref(null)
const progressMessage = ref('')

// 提示词（直接输入，不需要LLM生成）
const positivePrompt = ref('')
const negativePrompt = ref('low quality, bad quality, blurry, ugly, distorted, deformed, watermark, text')

// ComfyUI 配置
const config = ref(getComfyUIConfig())
const serverUrl = ref(config.value.serverUrl)
const isServerAvailable = ref(false)
const showSettings = ref(false)

// 可用资源列表（从ComfyUI获取）
// 注意：CLIP 不再需要单独加载，CheckpointLoaderSimple 会自动提供匹配的 CLIP
const availableModels = ref([])
const availableVAEs = ref([])
const availableSamplers = ref([])
const availableSchedulers = ref([])

// 生成参数
const selectedModel = ref('')
const selectedVAE = ref('')
const imageWidth = ref(512)
const imageHeight = ref(768)
const steps = ref(20)
const cfgScale = ref(7)
const selectedSampler = ref('euler')
const selectedScheduler = ref('normal')
const seed = ref(-1) // -1 表示随机

// 生成的图片
const generatedImageUrl = ref(null)
const generatedImageBase64 = ref(null)

// 加载可用资源
const loadAvailableResources = async () => {
  if (!isServerAvailable.value) return

  try {
    // 并行获取所有资源（不再需要单独获取CLIP）
    const [models, vaes, samplers, schedulers] = await Promise.all([
      getAvailableModels(serverUrl.value),
      getAvailableVAEs(serverUrl.value),
      getAvailableSamplers(serverUrl.value),
      getAvailableSchedulers(serverUrl.value),
    ])

    availableModels.value = models
    availableVAEs.value = vaes
    availableSamplers.value = samplers
    availableSchedulers.value = schedulers

    // 如果列表不为空且当前选择不在列表中，自动选择第一个
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

// 检查服务器状态
const checkServer = async () => {
  isServerAvailable.value = await checkComfyUIAvailable(serverUrl.value)
  if (isServerAvailable.value) {
    await loadAvailableResources()
  }
}

// 监听显示状态
watch(() => props.visible, async (newVal) => {
  if (newVal) {
    // 重置状态
    error.value = null
    progressMessage.value = ''
    generatedImageUrl.value = null
    generatedImageBase64.value = null
    
    // 重新加载配置
    config.value = getComfyUIConfig()
    serverUrl.value = config.value.serverUrl
    selectedModel.value = config.value.model
    selectedVAE.value = config.value.vae
    imageWidth.value = config.value.width
    imageHeight.value = config.value.height
    steps.value = config.value.steps
    cfgScale.value = config.value.cfgScale
    selectedSampler.value = config.value.sampler
    selectedScheduler.value = config.value.scheduler
    
    // 检查服务器并加载资源
    await checkServer()
  }
})

// 生成图片
const handleGenerate = async () => {
  if (isGenerating.value) return
  if (!positivePrompt.value.trim()) {
    error.value = '请输入正向提示词'
    return
  }
  if (!isServerAvailable.value) {
    error.value = 'ComfyUI 未连接，请检查服务器地址'
    return
  }

  isGenerating.value = true
  error.value = null
  progressMessage.value = '正在连接 ComfyUI...'

  try {
    // 保存配置（不再保存clip，因为Checkpoint会自动提供）
    saveComfyUIConfig({
      ...config.value,
      serverUrl: serverUrl.value,
      model: selectedModel.value,
      vae: selectedVAE.value,
      width: imageWidth.value,
      height: imageHeight.value,
      steps: steps.value,
      cfgScale: cfgScale.value,
      sampler: selectedSampler.value,
      scheduler: selectedScheduler.value,
    })

    // 生成随机种子（如果 seed 为 -1）
    const actualSeed = seed.value === -1 ? Math.floor(Math.random() * 1000000000000) : seed.value

    const result = await generateCG(
      {
        positivePrompt: positivePrompt.value,
        negativePrompt: negativePrompt.value,
        model: selectedModel.value,
        vae: selectedVAE.value,
        width: imageWidth.value,
        height: imageHeight.value,
        steps: steps.value,
        cfgScale: cfgScale.value,
        seed: actualSeed,
        sampler: selectedSampler.value,
        scheduler: selectedScheduler.value,
      },
      (progress) => {
        if (progress.status === 'connecting') {
          progressMessage.value = '正在连接 ComfyUI...'
        } else if (progress.status === 'loading_workflow') {
          progressMessage.value = '正在加载工作流...'
        } else if (progress.status === 'preparing') {
          progressMessage.value = '正在准备生成任务...'
        } else if (progress.status === 'generating') {
          progressMessage.value = `正在生成图片... (${Math.floor(progress.elapsed / 1000)}秒)`
        }
      }
    )

    if (!result.success) {
      error.value = result.error
      return
    }

    // 获取图片
    generatedImageUrl.value = result.image.url

    // 获取 Base64 数据
    try {
      generatedImageBase64.value = await getImageBase64(result.image.url)
    } catch {
      // Base64 获取失败不影响显示
    }

    progressMessage.value = ''
  } catch (err) {
    error.value = `生成图片失败: ${err.message}`
  } finally {
    isGenerating.value = false
  }
}

// 重新生成（使用新随机种子）
const handleRegenerate = () => {
  seed.value = -1
  handleGenerate()
}

// 使用图片
const handleUseImage = () => {
  emit('generated', {
    url: generatedImageUrl.value,
    base64: generatedImageBase64.value,
    positivePrompt: positivePrompt.value,
    negativePrompt: negativePrompt.value,
  })
  emit('close')
}

// 关闭弹窗
const handleClose = () => {
  emit('close')
}

// 保存设置
const handleSaveSettings = async () => {
  config.value.serverUrl = serverUrl.value
  saveComfyUIConfig(config.value)
  showSettings.value = false
  await checkServer()
}

// 分辨率滑块最大值
const MAX_RESOLUTION = 4096
const MIN_RESOLUTION = 256

// 确保分辨率在范围内
const clampResolution = (value) => {
  const num = parseInt(value) || MIN_RESOLUTION
  return Math.max(MIN_RESOLUTION, Math.min(MAX_RESOLUTION, num))
}

// 更新宽度
const updateWidth = (value) => {
  imageWidth.value = clampResolution(value)
}

// 更新高度
const updateHeight = (value) => {
  imageHeight.value = clampResolution(value)
}

// 分辨率预设
const resolutionPresets = [
  { width: 512, height: 512, label: '512×512' },
  { width: 512, height: 768, label: '512×768' },
  { width: 768, height: 512, label: '768×512' },
  { width: 1024, height: 1024, label: '1024×1024' },
  { width: 1024, height: 1536, label: '1024×1536' },
  { width: 1536, height: 1024, label: '1536×1024' },
]

// 选择分辨率预设
const selectResolutionPreset = (preset) => {
  imageWidth.value = preset.width
  imageHeight.value = preset.height
}

// 计算是否可以生成
const canGenerate = computed(() => {
  return isServerAvailable.value &&
         positivePrompt.value.trim() &&
         !isGenerating.value &&
         selectedModel.value &&
         selectedVAE.value
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="cg-modal-overlay" @click.self="handleClose">
        <div class="cg-modal">
          <!-- 头部 -->
          <header class="cg-modal-header">
            <h2 class="cg-title">🎨 生成 CG 图片</h2>
            <div class="server-status">
              <span class="status-indicator" :class="{ available: isServerAvailable }"></span>
              <span>{{ isServerAvailable ? 'ComfyUI 已连接' : 'ComfyUI 未连接' }}</span>
              <button type="button" class="settings-btn" @click="showSettings = true">⚙️</button>
            </div>
            <button type="button" class="close-btn" @click="handleClose">✕</button>
          </header>

          <!-- 内容区 -->
          <div class="cg-modal-body">
            <!-- 提示词输入 -->
            <div class="prompt-section">
              <div class="prompt-editor">
                <label for="positive-prompt">正向提示词</label>
                <textarea
                  id="positive-prompt"
                  v-model="positivePrompt"
                  rows="4"
                  placeholder="描述你想要生成的画面，例如：masterpiece, best quality, 1girl, long hair, standing in library..."
                  :disabled="isGenerating"
                ></textarea>
              </div>

              <div class="prompt-editor">
                <label for="negative-prompt">负向提示词</label>
                <textarea
                  id="negative-prompt"
                  v-model="negativePrompt"
                  rows="2"
                  placeholder="描述你不想要的元素..."
                  :disabled="isGenerating"
                ></textarea>
              </div>
            </div>

            <!-- 模型配置区 -->
            <div class="config-section">
              <h4 class="config-title">🛠️ 生成配置</h4>
              
              <!-- 模型选择 -->
              <div class="config-row">
                <div class="config-group">
                  <label for="model-select">模型 (Checkpoint)</label>
                  <select id="model-select" v-model="selectedModel" :disabled="isGenerating">
                    <option value="" disabled>请选择模型</option>
                    <option v-for="model in availableModels" :key="model" :value="model">{{ model }}</option>
                  </select>
                  <span v-if="availableModels.length === 0 && isServerAvailable" class="empty-hint">暂无可用模型</span>
                </div>
                <div class="config-group">
                  <label for="vae-select">VAE</label>
                  <select id="vae-select" v-model="selectedVAE" :disabled="isGenerating">
                    <option value="" disabled>请选择VAE</option>
                    <option v-for="vae in availableVAEs" :key="vae" :value="vae">{{ vae }}</option>
                  </select>
                  <span v-if="availableVAEs.length === 0 && isServerAvailable" class="empty-hint">暂无可用VAE</span>
                </div>
              </div>

              <!-- 采样器选择 -->
              <div class="config-row">
                <div class="config-group">
                  <label for="sampler-select">采样器</label>
                  <select id="sampler-select" v-model="selectedSampler" :disabled="isGenerating">
                    <option v-for="sampler in availableSamplers" :key="sampler" :value="sampler">{{ sampler }}</option>
                  </select>
                </div>
                <div class="config-group">
                  <label for="scheduler-select">调度器</label>
                  <select id="scheduler-select" v-model="selectedScheduler" :disabled="isGenerating">
                    <option v-for="scheduler in availableSchedulers" :key="scheduler" :value="scheduler">{{ scheduler }}</option>
                  </select>
                </div>
              </div>

              <!-- 分辨率设置 -->
              <div class="resolution-section">
                <label class="section-label">分辨率 (最大 4096)</label>
                
                <!-- 分辨率预设 -->
                <div class="resolution-presets">
                  <button
                    v-for="preset in resolutionPresets"
                    :key="preset.label"
                    type="button"
                    class="preset-btn"
                    :class="{ active: imageWidth === preset.width && imageHeight === preset.height }"
                    :disabled="isGenerating"
                    @click="selectResolutionPreset(preset)"
                  >
                    {{ preset.label }}
                  </button>
                </div>

                <!-- 宽度滑块+输入 -->
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
                        :disabled="isGenerating"
                        @input="updateWidth($event.target.value)"
                      />
                      <input
                        type="number"
                        class="number-input"
                        :min="MIN_RESOLUTION"
                        :max="MAX_RESOLUTION"
                        step="64"
                        :value="imageWidth"
                        :disabled="isGenerating"
                        @change="updateWidth($event.target.value)"
                      />
                    </div>
                  </div>

                  <!-- 高度滑块+输入 -->
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
                        :disabled="isGenerating"
                        @input="updateHeight($event.target.value)"
                      />
                      <input
                        type="number"
                        class="number-input"
                        :min="MIN_RESOLUTION"
                        :max="MAX_RESOLUTION"
                        step="64"
                        :value="imageHeight"
                        :disabled="isGenerating"
                        @change="updateHeight($event.target.value)"
                      />
                    </div>
                  </div>
                </div>

                <p class="resolution-preview">当前: {{ imageWidth }} × {{ imageHeight }}</p>
              </div>

              <!-- 其他参数 -->
              <div class="config-row">
                <div class="config-group">
                  <label for="steps-input">采样步数</label>
                  <div class="param-row">
                    <input
                      id="steps-slider"
                      type="range"
                      min="10"
                      max="50"
                      :value="steps"
                      :disabled="isGenerating"
                      @input="steps = parseInt($event.target.value)"
                    />
                    <input
                      id="steps-input"
                      type="number"
                      class="number-input"
                      min="10"
                      max="50"
                      :value="steps"
                      :disabled="isGenerating"
                      @change="steps = parseInt($event.target.value) || 20"
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
                      :disabled="isGenerating"
                      @input="cfgScale = parseFloat($event.target.value)"
                    />
                    <input
                      id="cfg-input"
                      type="number"
                      class="number-input"
                      min="1"
                      max="20"
                      step="0.5"
                      :value="cfgScale"
                      :disabled="isGenerating"
                      @change="cfgScale = parseFloat($event.target.value) || 7"
                    />
                  </div>
                </div>
                <div class="config-group">
                  <label for="seed-input">种子</label>
                  <input
                    id="seed-input"
                    type="number"
                    :value="seed"
                    :disabled="isGenerating"
                    @change="seed = parseInt($event.target.value) || -1"
                    placeholder="-1 = 随机"
                  />
                  <span class="seed-hint">-1 = 随机</span>
                </div>
              </div>
            </div>

            <!-- 错误提示 -->
            <div v-if="error" class="error-message">
              {{ error }}
            </div>

            <!-- 进度提示 -->
            <div v-if="isGenerating && progressMessage" class="progress-message">
              <div class="spinner-small"></div>
              <span>{{ progressMessage }}</span>
            </div>

            <!-- 生成的图片 -->
            <div v-if="generatedImageUrl" class="image-preview">
              <img
                :src="generatedImageUrl"
                alt="Generated CG"
                class="generated-image"
              />
              <div class="image-actions">
                <button type="button" class="secondary-btn" @click="handleRegenerate" :disabled="isGenerating">
                  🔄 重新生成
                </button>
                <button type="button" class="primary-btn" @click="handleUseImage" :disabled="isGenerating">
                  ✓ 使用此图片
                </button>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="action-buttons">
              <button type="button" class="secondary-btn" @click="handleClose">取消</button>
              <button
                type="button"
                class="primary-btn generate-btn"
                :disabled="!canGenerate"
                @click="handleGenerate"
              >
                {{ isGenerating ? '生成中...' : '生成图片' }}
              </button>
            </div>
          </div>
        </div>

        <!-- 设置弹窗 -->
        <div v-if="showSettings" class="settings-overlay" @click.self="showSettings = false">
          <div class="settings-panel">
            <h3>ComfyUI 设置</h3>
            <div class="setting-item">
              <label for="server-url">服务器地址</label>
              <input
                id="server-url"
                type="text"
                v-model="serverUrl"
                placeholder="http://127.0.0.1:8188"
              />
            </div>
            <div class="setting-item">
              <label>连接状态</label>
              <div class="connection-status">
                <span class="status-indicator" :class="{ available: isServerAvailable }"></span>
                <span>{{ isServerAvailable ? '已连接' : '未连接' }}</span>
                <button type="button" class="test-btn" @click="checkServer">测试连接</button>
              </div>
            </div>
            <div class="settings-actions">
              <button type="button" class="secondary-btn" @click="showSettings = false">取消</button>
              <button type="button" class="primary-btn" @click="handleSaveSettings">保存</button>
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
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
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
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border, #333);
  background: color-mix(in srgb, var(--accent-cyan, #00d4ff) 10%, transparent);
}

.cg-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--accent-cyan, #00d4ff);
}

.server-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 20px;
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
  margin-left: 8px;
}

.close-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--muted-foreground, #888);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 4px 8px;
  margin-left: auto;
  transition: color 0.2s;
}

.close-btn:hover {
  color: var(--accent-orange, #ff6b35);
}

.cg-modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 提示词区域 */
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

.prompt-editor label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text, #ccc);
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

/* 配置区样式 */
.config-section {
  padding: 16px;
  background: color-mix(in srgb, var(--surface-panel, #252540) 30%, transparent);
  border-radius: 8px;
  border: 1px solid var(--border, #333);
}

.config-title {
  margin: 0 0 12px;
  font-size: 0.95rem;
  color: var(--accent-magenta, #ff00ff);
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

/* 分辨率设置 */
.resolution-section {
  margin-bottom: 12px;
}

.resolution-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.preset-btn {
  appearance: none;
  border: 1px solid var(--border, #333);
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 0.8rem;
  color: var(--muted-foreground, #888);
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
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

/* 错误和进度提示 */
.error-message {
  padding: 12px;
  background: color-mix(in srgb, var(--accent-orange, #ff6b35) 20%, transparent);
  border-radius: 6px;
  color: var(--accent-orange, #ff6b35);
  font-size: 0.85rem;
}

.progress-message {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--accent-cyan, #00d4ff) 10%, transparent);
  border-radius: 6px;
  color: var(--accent-cyan, #00d4ff);
  font-size: 0.9rem;
}

.spinner-small {
  width: 20px;
  height: 20px;
  border: 2px solid color-mix(in srgb, var(--accent-cyan, #00d4ff) 30%, transparent);
  border-top-color: var(--accent-cyan, #00d4ff);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 图片预览 */
.image-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--surface-panel, #252540);
  border-radius: 8px;
  border: 1px solid var(--border, #333);
}

.generated-image {
  max-width: 100%;
  max-height: 300px;
  object-fit: contain;
  border-radius: 4px;
  margin: 0 auto;
}

.image-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

/* 操作按钮 */
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
  border-radius: 6px;
  padding: 12px 24px;
  font-size: 0.95rem;
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
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 212, 255, 0.3);
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
  min-width: 120px;
}

/* 设置弹窗 */
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
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

/* 过渡动画 */
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
  transform: scale(0.9);
}

@media (max-width: 600px) {
  .cg-modal {
    width: 95%;
    max-height: 95vh;
  }

  .cg-modal-header {
    flex-wrap: wrap;
    gap: 8px;
  }

  .server-status {
    order: 3;
    width: 100%;
    margin-left: 0;
    justify-content: center;
  }

  .config-row {
    grid-template-columns: 1fr;
  }

  .resolution-control {
    grid-template-columns: 1fr;
  }

  .resolution-presets {
    flex-direction: column;
  }

  .action-buttons {
    flex-direction: column;
  }

  .primary-btn,
  .secondary-btn {
    width: 100%;
  }
}
</style>