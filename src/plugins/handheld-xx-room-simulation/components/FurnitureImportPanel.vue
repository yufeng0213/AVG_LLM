<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { createPngImportService } from '../render/pngImportService.js'
import { createFurnitureImportManager } from '../logic/room/furnitureImportManager.js'
import { Z_LAYER_RULES } from '../render/roomSprites.js'
import { FURNITURE_KIND_LIST, INTERACTION_TYPE_LIST } from '../config/constants.js'
import { FURNITURE_MOOD_EFFECT_TEMPLATES } from '../config/moodRules.js'
import {
  LIGHT_RADIUS_MIN,
  LIGHT_RADIUS_MAX,
  LIGHT_RADIUS_DEFAULT,
  LIGHT_INTENSITY_MIN,
  LIGHT_INTENSITY_MAX,
  LIGHT_INTENSITY_DEFAULT,
  LIGHT_COLOR_PRESETS,
  LIGHT_COLOR_DEFAULT,
} from '../config/lightConstants.js'
import { isAndroid } from '../../../utils/platform.js'

const props = defineProps({
  room: { type: Object, required: true },
  onAddFurniture: { type: Function, default: null },
})

const emit = defineEmits(['add-furniture', 'close', 'enter-placement-mode', 'save-to-library'])

// ========== 服务初始化 ==========

const pngService = createPngImportService()
const importManager = createFurnitureImportManager()

// ========== 移动端检测 ==========

const isMobile = ref(false)
onMounted(() => {
  isMobile.value = isAndroid() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
})

// ========== 状态 ==========

const isDragging = ref(false)
const isImporting = ref(false)
const importError = ref('')
const importedData = ref(null)
const previewImage = ref('')

// 家具配置
const furnitureConfig = ref({
  name: '自定义家具',
  kind: 'decor',
  walkable: false,
  interactable: false,
  interactionType: 'none',
  zMode: 'auto', // 'auto' | 'manual'
  manualZ: 50,
})

// 心情效果配置
const moodConfig = ref({
  enabled: false,
  label: '',
  description: '',
  modifier: 0,
  duration: 200,
  icon: '',
  effectType: 'onInteract',  // 'onInteract' | 'onPlace'
})

// 光源配置
const lightConfig = ref({
  enabled: false,
  radius: LIGHT_RADIUS_DEFAULT,
  intensity: LIGHT_INTENSITY_DEFAULT,
  color: LIGHT_COLOR_DEFAULT,
  flicker: false,
  flickerSpeed: 2,
})

// 光源颜色选项
const lightColorOptions = Object.entries(LIGHT_COLOR_PRESETS).map(([key, value]) => ({
  value: key,
  label: value.name,
  color: value.color,
}))

// 心情效果模板选择
const selectedMoodTemplate = ref('')
const moodTemplateOptions = computed(() => {
  const kind = furnitureConfig.value.kind
  const templates = FURNITURE_MOOD_EFFECT_TEMPLATES[kind] || {}
  return Object.entries(templates).map(([key, value]) => ({
    value: key,
    label: `${value.icon || ''} ${value.label} (${value.modifier > 0 ? '+' : ''}${value.modifier})`
  }))
})

// 应用心情模板
const applyMoodTemplate = () => {
  if (!selectedMoodTemplate.value) return
  const kind = furnitureConfig.value.kind
  const templates = FURNITURE_MOOD_EFFECT_TEMPLATES[kind] || {}
  const template = templates[selectedMoodTemplate.value]
  if (template) {
    moodConfig.value = {
      enabled: true,
      label: template.label,
      description: template.description || '',
      modifier: template.modifier,
      duration: template.duration,
      icon: template.icon || '',
      effectType: template.effectType || 'onInteract',
    }
  }
}

// 预设列表
const kindOptions = [
  { value: 'floor', label: '地板/地毯', zRange: '0-9' },
  { value: 'decor', label: '装饰', zRange: '10-29' },
  { value: 'utility', label: '功能设施', zRange: '30-49' },
  { value: 'sleep', label: '休息', zRange: '50-99' },
  { value: 'food', label: '食物相关', zRange: '50-99' },
  { value: 'social', label: '社交', zRange: '50-99' },
  { value: 'storage', label: '收纳', zRange: '100-199' },
  { value: 'work', label: '工作', zRange: '100-199' },
]

const interactionOptions = [
  { value: 'none', label: '无交互' },
  { value: 'sleep', label: '休息' },
  { value: 'eat', label: '进食' },
  { value: 'work', label: '工作' },
  { value: 'social', label: '社交' },
  { value: 'storage', label: '收纳' },
]

// ========== 拖拽处理 ==========

const handleDragEnter = (e) => {
  e.preventDefault()
  isDragging.value = true
}

const handleDragLeave = (e) => {
  e.preventDefault()
  isDragging.value = false
}

const handleDragOver = (e) => {
  e.preventDefault()
}

const handleDrop = async (e) => {
  e.preventDefault()
  isDragging.value = false
  isImporting.value = true
  importError.value = ''

  const files = e.dataTransfer?.files
  if (!files || files.length === 0) {
    importError.value = '没有检测到文件'
    isImporting.value = false
    return
  }

  const file = files[0]
  if (!file.type.includes('image/png') && !file.name.toLowerCase().endsWith('.png')) {
    importError.value = '请上传 PNG 格式图片'
    isImporting.value = false
    return
  }

  try {
    // 解析 PNG
    const result = await pngService.parsePngFile(file)

    if (result.error) {
      importError.value = `解析失败: ${result.error}`
      isImporting.value = false
      return
    }

    // 验证是否适合导入
    const validation = await pngService.validatePngForImport(file)

    if (!validation.valid) {
      importError.value = `不适合导入: ${validation.reason}`
      isImporting.value = false
      return
    }

    // 生成预览图
    previewImage.value = await readFileAsDataURL(file)

    // 存储导入数据
    importedData.value = {
      ...result,
      cellWidth: validation.cellWidth,
      cellHeight: validation.cellHeight,
      width: result.width,
      height: result.height,
      palette: result.palette,
      rawPixels: result.pixels,
      originalWidth: result.width,
      originalHeight: result.height,
      base64: result.base64, // 原始 PNG base64
    }

    // 自动命名
    furnitureConfig.value.name = `自定义家具_${validation.cellWidth}x${validation.cellHeight}`

  } catch (e) {
    importError.value = `导入出错: ${e.message || e}`
  }

  isImporting.value = false
}

const readFileAsDataURL = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ========== 添加家具 ==========

const calculatedZ = computed(() => {
  if (!importedData.value) return 0

  const kind = furnitureConfig.value.kind
  const baseZ = kind === 'floor' ? 0
    : kind === 'decor' ? 10
    : kind === 'utility' ? 30
    : ['sleep', 'food', 'social'].includes(kind) ? 50
    : 100

  // 加上高度和默认 y=0
  return baseZ + (importedData.value.cellHeight - 1) * 10
})

const displayZ = computed(() => {
  return furnitureConfig.value.zMode === 'auto'
    ? calculatedZ.value
    : furnitureConfig.value.manualZ
})

const handleAddFurniture = () => {
  if (!importedData.value || !props.room) return

  const result = importManager.createFurnitureFromPng(importedData.value, {
    name: furnitureConfig.value.name,
    kind: furnitureConfig.value.kind,
    x: 0,
    y: 0,
    walkable: furnitureConfig.value.walkable,
    interactable: furnitureConfig.value.interactable,
    interactionType: furnitureConfig.value.interactionType,
    z: furnitureConfig.value.zMode === 'manual' ? furnitureConfig.value.manualZ : null,
  })

  if (result.error) {
    importError.value = result.error
    return
  }

  // 创建家具实例（用于放置）
  const furnitureToPlace = {
    ...result.furniture,
    id: `furn-${Date.now().toString(36)}`,
  }

  // 添加心情效果配置到放置的家具
  if (moodConfig.value.enabled && moodConfig.value.label) {
    furnitureToPlace.moodEffects = {
      onInteract: moodConfig.value.effectType === 'onInteract' ? {
        interactionType: furnitureConfig.value.interactionType,
        label: moodConfig.value.label,
        description: moodConfig.value.description,
        modifier: moodConfig.value.modifier,
        duration: moodConfig.value.duration,
        icon: moodConfig.value.icon,
      } : null,
      onPlace: moodConfig.value.effectType === 'onPlace' ? {
        label: moodConfig.value.label,
        description: moodConfig.value.description,
        modifier: moodConfig.value.modifier,
        duration: moodConfig.value.duration,
        icon: moodConfig.value.icon,
      } : null,
    }
  }

  // 添加光源配置到放置的家具
  if (lightConfig.value.enabled) {
    const colorPreset = LIGHT_COLOR_PRESETS[lightConfig.value.color] || LIGHT_COLOR_PRESETS[LIGHT_COLOR_DEFAULT]
    furnitureToPlace.lightSource = {
      enabled: true,
      radius: lightConfig.value.radius,
      intensity: lightConfig.value.intensity,
      color: colorPreset.color,
      flicker: lightConfig.value.flicker,
      flickerSpeed: lightConfig.value.flickerSpeed,
    }
    console.log('[FurnitureImport] lightSource added to furnitureToPlace:', furnitureToPlace.lightSource)
  }

  console.log('[FurnitureImport] furnitureToPlace:', furnitureToPlace.id, furnitureToPlace.name, 'lightSource:', furnitureToPlace.lightSource)

  // 保存模板到家具库（用于后续重复选取）
  const furnitureTemplate = {
    ...furnitureToPlace,
    id: `template-${Date.now().toString(36)}`,
    x: 0,
    y: 0,
  }
  console.log('[FurnitureImport] furnitureTemplate saved to library:', furnitureTemplate.id, 'lightSource:', furnitureTemplate.lightSource)

  emit('save-to-library', furnitureTemplate)

  // 进入放置预览模式（使用带光源配置的家具）
  emit('enter-placement-mode', furnitureToPlace)

  // 关闭导入面板
  emit('close')
}

const handleAddAtPosition = (x, y) => {
  if (!importedData.value || !props.room) return

  const result = importManager.createFurnitureFromPng(importedData.value, {
    name: furnitureConfig.value.name,
    kind: furnitureConfig.value.kind,
    x,
    y,
    walkable: furnitureConfig.value.walkable,
    interactable: furnitureConfig.value.interactable,
    interactionType: furnitureConfig.value.interactionType,
    z: furnitureConfig.value.zMode === 'manual' ? furnitureConfig.value.manualZ : null,
  })

  if (result.error) {
    importError.value = result.error
    return
  }

  const addResult = importManager.addImportedFurnitureToRoom(props.room, result.furniture)

  if (!addResult.success) {
    importError.value = `放置失败: ${addResult.reason}`
    return
  }

  emit('add-furniture', addResult.furniture)
  resetImport()
}

const resetImport = () => {
  importedData.value = null
  previewImage.value = ''
  importError.value = ''
  furnitureConfig.value = {
    name: '自定义家具',
    kind: 'decor',
    walkable: false,
    interactable: false,
    interactionType: 'none',
    zMode: 'auto',
    manualZ: 50,
  }
  moodConfig.value = {
    enabled: false,
    label: '',
    description: '',
    modifier: 0,
    duration: 200,
    icon: '',
    effectType: 'onInteract',
  }
  lightConfig.value = {
    enabled: false,
    radius: LIGHT_RADIUS_DEFAULT,
    intensity: LIGHT_INTENSITY_DEFAULT,
    color: LIGHT_COLOR_DEFAULT,
    flicker: false,
    flickerSpeed: 2,
  }
  selectedMoodTemplate.value = ''
}

const handleClose = () => {
  emit('close')
}

// ========== 文件选择（备用）==========

const fileInputRef = ref(null)

const handleFileSelect = async (e) => {
  const files = e.target.files
  if (!files || files.length === 0) return

  // 模拟拖拽处理（添加 preventDefault 避免报错）
  const mockEvent = {
    dataTransfer: { files },
    preventDefault: () => {},
  }
  await handleDrop(mockEvent)

  // 清空 input
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

const triggerFileSelect = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}
</script>

<template>
  <div class="furniture-import-panel">
    <!-- 头部 -->
    <div class="import-header">

      <h3>导入自定义家具</h3>
      <button class="close-btn" @click="handleClose">✕</button>
    </div>

    <!-- 拖拽区域 -->
    <div
      class="drop-zone"
      :class="{ dragging: isDragging, hasData: importedData }"
      @dragenter="handleDragEnter"
      @dragleave="handleDragLeave"
      @dragover="handleDragOver"
      @drop="handleDrop"
      @click="triggerFileSelect"
    >
      <input
        ref="fileInputRef"
        type="file"
        accept=".png"
        style="display: none"
        @change="handleFileSelect"
      />

      <template v-if="!importedData">
        <div class="drop-hint">
          <div class="drop-icon">📁</div>
          <p v-if="isMobile">点击选择 PNG 图片</p>
          <p v-else>拖拽 PNG 图片到这里</p>
          <p class="drop-sub" v-if="!isMobile">或点击选择文件</p>
          <p class="drop-spec">推荐尺寸: 32-128px (1-4格)</p>
        </div>
      </template>

      <template v-else>
        <div class="preview-area">
          <img :src="previewImage" class="preview-image" />
          <div class="preview-info">
            <p>尺寸: {{ importedData.width }}x{{ importedData.height }}px</p>
            <p>占用: {{ importedData.cellWidth }}x{{ importedData.cellHeight }} 格</p>
            <p>颜色: {{ importedData.uniqueColors?.length || 0 }} 种</p>
          </div>
        </div>
      </template>
    </div>

    <!-- 错误提示 -->
    <div v-if="importError" class="error-message">
      ⚠️ {{ importError }}
    </div>

    <!-- 配置面板 -->
    <div v-if="importedData" class="config-panel">
      <div class="config-row">
        <label>名称</label>
        <input
          v-model="furnitureConfig.name"
          type="text"
          class="config-input"
          maxlength="24"
        />
      </div>

      <div class="config-row">
        <label>类型</label>
        <select v-model="furnitureConfig.kind" class="config-select">
          <option v-for="opt in kindOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }} (z: {{ opt.zRange }})
          </option>
        </select>
      </div>

      <div class="config-row">
        <label>交互类型</label>
        <select v-model="furnitureConfig.interactionType" class="config-select">
          <option v-for="opt in interactionOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div class="config-row checkbox-row">
        <label>
          <input type="checkbox" v-model="furnitureConfig.walkable" />
          可通行
        </label>
        <label>
          <input type="checkbox" v-model="furnitureConfig.interactable" />
          可交互
        </label>
      </div>

      <div class="config-row">
        <label>Z 轴层级</label>
        <div class="z-config">
          <select v-model="furnitureConfig.zMode" class="config-select small">
            <option value="auto">自动计算</option>
            <option value="manual">手动设置</option>
          </select>
          <input
            v-if="furnitureConfig.zMode === 'manual'"
            v-model.number="furnitureConfig.manualZ"
            type="number"
            class="config-input small"
            min="0"
            max="199"
          />
          <span v-else class="z-value">= {{ displayZ }}</span>
        </div>
      </div>

      <!-- Z 层级说明 -->
      <div class="z-legend">
        <span class="z-item floor">0-9 地板/地毯</span>
        <span class="z-item decor">10-29 装饰</span>
        <span class="z-item utility">30-49 设施</span>
        <span class="z-item furniture">50-99 家具</span>
        <span class="z-item tall">100-199 高家具</span>
        <span class="z-item pawn">200+ 小人</span>
      </div>

      <!-- 心情效果配置 -->
      <div class="mood-config-section">
        <div class="mood-config-header">
          <label>
            <input type="checkbox" v-model="moodConfig.enabled" />
            启用心情效果
          </label>
        </div>

        <div v-if="moodConfig.enabled" class="mood-config-body">
          <!-- 快速模板 -->
          <div class="config-row" v-if="moodTemplateOptions.length > 0">
            <label>快速选择模板</label>
            <div class="template-select-row">
              <select v-model="selectedMoodTemplate" class="config-select small" @change="applyMoodTemplate">
                <option value="">-- 选择模板 --</option>
                <option v-for="opt in moodTemplateOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
          </div>

          <!-- 自定义心情效果 -->
          <div class="config-row">
            <label>效果类型</label>
            <select v-model="moodConfig.effectType" class="config-select small">
              <option value="onInteract">交互时触发</option>
              <option value="onPlace">放置时持续</option>
            </select>
          </div>

          <div class="config-row">
            <label>心情标签</label>
            <input v-model="moodConfig.label" type="text" class="config-input" placeholder="例如：吃了苹果，开心" />
          </div>

          <div class="config-row">
            <label>心情值变化</label>
            <input v-model.number="moodConfig.modifier" type="number" class="config-input small" min="-50" max="50" />
            <span class="modifier-hint">{{ moodConfig.modifier > 0 ? '正面' : moodConfig.modifier < 0 ? '负面' : '无影响' }}</span>
          </div>

          <div class="config-row">
            <label>持续时间(秒)</label>
            <input v-model.number="moodConfig.duration" type="number" class="config-input small" min="-1" max="1000" />
            <span class="duration-hint">-1=永久</span>
          </div>

          <div class="config-row">
            <label>图标</label>
            <input v-model="moodConfig.icon" type="text" class="config-input small" placeholder="🍎" />
          </div>

          <div class="config-row">
            <label>描述</label>
            <input v-model="moodConfig.description" type="text" class="config-input" placeholder="可选描述文字" />
          </div>
        </div>
      </div>

      <!-- 光源配置 -->
      <div class="light-config-section">
        <div class="light-config-header">
          <label>
            <input type="checkbox" v-model="lightConfig.enabled" />
            启用光源效果
          </label>
        </div>

        <div v-if="lightConfig.enabled" class="light-config-body">
          <div class="config-row">
            <label>光照半径</label>
            <input v-model.number="lightConfig.radius" type="range" class="config-range" min="1" max="5" step="1" />
            <span class="range-value">{{ lightConfig.radius }} 格</span>
          </div>

          <div class="config-row">
            <label>光照强度</label>
            <input v-model.number="lightConfig.intensity" type="range" class="config-range" min="0.3" max="1" step="0.1" />
            <span class="range-value">{{ (lightConfig.intensity * 100).toFixed(0) }}%</span>
          </div>

          <div class="config-row">
            <label>光照颜色</label>
            <div class="color-options">
              <button
                v-for="opt in lightColorOptions"
                :key="opt.value"
                class="color-btn"
                :class="{ active: lightConfig.color === opt.value }"
                :style="{ background: opt.color }"
                @click="lightConfig.color = opt.value"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <div class="config-row checkbox-row">
            <label>
              <input type="checkbox" v-model="lightConfig.flicker" />
              闪烁效果
            </label>
          </div>

          <div v-if="lightConfig.flicker" class="config-row">
            <label>闪烁速度</label>
            <input v-model.number="lightConfig.flickerSpeed" type="range" class="config-range" min="1" max="5" step="1" />
            <span class="range-value">{{ lightConfig.flickerSpeed }}</span>
          </div>
        </div>
      </div>
    </div>
    <!-- 操作按钮 -->
    <div v-if="importedData" class="action-buttons">
      <button class="btn-secondary" @click="resetImport">重新导入</button>
      <button class="btn-primary" @click="handleAddFurniture">
        开始放置
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="isImporting" class="loading-overlay">
      <span>正在解析...</span>
    </div>
  </div>
</template>

<style scoped>
.furniture-import-panel {
  background: #22222a;
  border: 1px solid #3a3a42;
  border-radius: 8px;
  width: 320px;
  max-height: 480px;
  overflow: auto;
  color: #eaeaea;
  font-size: 14px;
}

.import-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #3a3a42;
}

.import-header h3 {
  font-size: 16px;
  margin: 0;
}

.close-btn {
  background: transparent;
  border: none;
  color: #aaa;
  cursor: pointer;
  font-size: 18px;
  padding: 4px 8px;
}

.close-btn:hover {
  color: #eaeaea;
}

.drop-zone {
  margin: 16px;
  padding: 32px;
  border: 2px dashed #4a4a52;
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drop-zone:hover {
  border-color: #6a6a72;
  background: #2a2a32;
}

.drop-zone.dragging {
  border-color: #8a8a92;
  background: #3a3a42;
}

.drop-zone.hasData {
  padding: 16px;
  min-height: 80px;
}

.drop-hint {
  color: #aaa;
}

.drop-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.drop-sub {
  font-size: 12px;
  margin-top: 4px;
}

.drop-spec {
  font-size: 11px;
  color: #888;
  margin-top: 8px;
}

.preview-area {
  display: flex;
  align-items: center;
  gap: 16px;
}

.preview-image {
  max-width: 64px;
  max-height: 64px;
  border: 1px solid #4a4a52;
  background: #1a1a22;
}

.preview-info {
  text-align: left;
  font-size: 12px;
  color: #aaa;
}

.preview-info p {
  margin: 2px 0;
}

.error-message {
  margin: 8px 16px;
  padding: 8px 12px;
  background: #4a2a2a;
  border-radius: 4px;
  color: #e8a8a8;
  font-size: 13px;
}

.config-panel {
  padding: 16px;
}

.config-row {
  margin-bottom: 12px;
}

.config-row label {
  display: block;
  font-size: 12px;
  color: #aaa;
  margin-bottom: 4px;
}

.config-input {
  width: 100%;
  padding: 8px 12px;
  background: #3a3a42;
  border: 1px solid #4a4a52;
  border-radius: 4px;
  color: #eaeaea;
  font-size: 14px;
}

.config-input:focus {
  outline: none;
  border-color: #6a8a6a;
}

.config-select {
  width: 100%;
  padding: 8px 12px;
  background: #3a3a42;
  border: 1px solid #4a4a52;
  border-radius: 4px;
  color: #eaeaea;
  font-size: 14px;
}

.config-select.small {
  width: 120px;
}

.config-input.small {
  width: 60px;
  padding: 6px 8px;
}

.checkbox-row {
  display: flex;
  gap: 16px;
}

.checkbox-row label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.z-config {
  display: flex;
  align-items: center;
  gap: 8px;
}

.z-value {
  color: #8aa;
  font-size: 14px;
}

.z-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  padding: 8px;
  background: #1a1a22;
  border-radius: 4px;
}

.z-item {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
}

.z-item.floor { background: #3a3a32; }
.z-item.decor { background: #3a4a32; }
.z-item.utility { background: #3a3a42; }
.z-item.furniture { background: #4a3a3a; }
.z-item.tall { background: #4a4a3a; }
.z-item.pawn { background: #5a5a3a; }

.action-buttons {
  display: flex;
  gap: 8px;
  padding: 16px;
  padding-top: 0;
}

.btn-primary,
.btn-secondary {
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary {
  background: #6a8a6a;
  color: #fff;
  flex: 1;
}

.btn-primary:hover {
  background: #7a9a7a;
}

.btn-secondary {
  background: #4a4a52;
  color: #eaeaea;
}

.btn-secondary:hover {
  background: #5a5a62;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(22, 22, 26, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #aaa;
}

/* 移动端优化 */
@media (pointer: coarse) {
  .drop-zone {
    min-height: 140px;
    padding: 24px 16px;
  }

  .drop-icon {
    font-size: 40px;
  }

  .drop-hint p {
    font-size: 16px;
  }

  .btn-primary,
  .btn-secondary {
    padding: 12px 20px;
    font-size: 16px;
  }

  .config-input,
  .config-select {
    font-size: 16px;
    padding: 12px;
  }

  .close-btn {
    font-size: 22px;
    padding: 8px 12px;
  }
}
 
   .platform-android.android-portrait .close-btn,
   .platform-android.android-portrait .action-buttons,
   .platform-android.android-portrait .btn-primary,
   .platform-android.android-portrait .btn-secondary{
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 6px 10px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
  }

  /* 心情效果配置 */
  .mood-config-section {
    margin-top: 12px;
    padding: 12px;
    background: #2a2a32;
    border-radius: 6px;
  }

  .mood-config-header {
    font-size: 14px;
    color: #aaa;
  }

  .mood-config-header label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .mood-config-body {
    margin-top: 12px;
  }

  .template-select-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .modifier-hint, .duration-hint {
    font-size: 12px;
    color: #888;
  }

  /* 光源效果配置 */
  .light-config-section {
    margin-top: 12px;
    padding: 12px;
    background: #2a2a32;
    border-radius: 6px;
  }

  .light-config-header {
    font-size: 14px;
    color: #aaa;
  }

  .light-config-header label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .light-config-body {
    margin-top: 12px;
  }

  .config-range {
    flex: 1;
    height: 6px;
    background: #3a3a42;
    border-radius: 3px;
    appearance: none;
    cursor: pointer;
  }

  .config-range::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    background: #6a8a6a;
    border-radius: 7px;
    cursor: pointer;
  }

  .range-value {
    font-size: 12px;
    color: #8aa;
    min-width: 40px;
  }

  .color-options {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .color-btn {
    padding: 6px 10px;
    border: 2px solid transparent;
    border-radius: 6px;
    color: #fff;
    font-size: 12px;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .color-btn.active {
    border-color: #fff;
  }

  .color-btn:hover {
    border-color: #aaa;
  }
</style>