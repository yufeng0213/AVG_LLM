<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { createPngImportService } from '../render/pngImportService.js'
import { createFurnitureImportManager } from '../logic/room/furnitureImportManager.js'
import { Z_LAYER_RULES } from '../render/roomSprites.js'
import { FURNITURE_KIND_LIST, INTERACTION_TYPE_LIST } from '../config/constants.js'
import { isAndroid } from '../../../../utils/platform.js'

const props = defineProps({
  room: { type: Object, required: true },
  onAddFurniture: { type: Function, default: null },
})

const emit = defineEmits(['add-furniture', 'close'])

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
      pixels: result.pixels,
      indexedPixels: pngService.convertToIndexedPixels(result.pixels, result.palette),
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

  // 添加到房间
  const addResult = importManager.addImportedFurnitureToRoom(props.room, result.furniture, {
    autoPlace: true,
  })

  if (!addResult.success) {
    importError.value = `放置失败: ${addResult.reason}`
    return
  }

  // 通知父组件
  emit('add-furniture', addResult.furniture)

  if (props.onAddFurniture) {
    props.onAddFurniture(addResult.furniture)
  }

  // 重置
  resetImport()
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
}

const handleClose = () => {
  emit('close')
}

// ========== 文件选择（备用）==========

const fileInputRef = ref(null)

const handleFileSelect = async (e) => {
  const files = e.target.files
  if (!files || files.length === 0) return

  // 模拟拖拽处理
  const mockEvent = { dataTransfer: { files } }
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
    </div>

    <!-- 操作按钮 -->
    <div v-if="importedData" class="action-buttons">
      <button class="btn-secondary" @click="resetImport">重新导入</button>
      <button class="btn-primary" @click="handleAddFurniture">
        自动放置
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
</style>