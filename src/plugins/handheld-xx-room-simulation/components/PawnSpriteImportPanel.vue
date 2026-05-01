<script setup>
import { ref } from 'vue'

const props = defineProps({
  characterName: { type: String, default: '角色' }
})

const emit = defineEmits(['save-pawn-sprites', 'close'])

// 读取文件为 base64
const readFileAsDataURL = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// 四个方向的精灵数据
const sprites = ref({
  front: null,
  back: null,
  left: null,
  right: null,
})

// 预览图
const previews = ref({
  front: '',
  back: '',
  left: '',
  right: '',
})

// 方向标签
const directionLabels = {
  front: '前向（下）',
  back: '背向（上）',
  left: '左向',
  right: '右向',
}

// 处理文件上传
const handleFileUpload = async (direction, event) => {
  const files = event.target.files
  if (!files || files.length === 0) return

  const file = files[0]
  if (!file.type.includes('image/png') && !file.name.toLowerCase().endsWith('.png')) {
    return
  }

  try {
    const base64 = await readFileAsDataURL(file)
    previews.value[direction] = base64
    sprites.value[direction] = base64
  } catch (e) {
    console.error('上传失败:', e)
  }

  // 清空 input
  event.target.value = ''
}

// 清除某个方向
const clearDirection = (direction, event) => {
  event.stopPropagation()
  previews.value[direction] = ''
  sprites.value[direction] = null
}

// 保存小人精灵
const handleSave = () => {
  // 至少需要一个方向
  const hasAny = Object.values(sprites.value).some(s => s)
  if (!hasAny) {
    return
  }

  emit('save-pawn-sprites', {
    front: sprites.value.front || sprites.value.left || sprites.value.right || sprites.value.back,
    back: sprites.value.back || sprites.value.front,
    left: sprites.value.left || sprites.value.front,
    right: sprites.value.right || sprites.value.front,
  })
  emit('close')
}

// 全部清除
const clearAll = () => {
  sprites.value = { front: null, back: null, left: null, right: null }
  previews.value = { front: '', back: '', left: '', right: '' }
}
</script>

<template>
  <div class="pawn-import-panel">
    <!-- 头部 -->
    <div class="import-header">
      <h3>导入小人精灵 - {{ characterName }}</h3>
      <button class="close-btn" @click="$emit('close')">✕</button>
    </div>

    <!-- 说明 -->
    <div class="import-note">
      <p>上传4个方向的PNG图片（高度建议128px）</p>
      <p>缺少的方向会用已有方向替代</p>
    </div>

    <!-- 四个方向上传区域 -->
    <div class="sprite-grid">
      <!-- 前向 -->
      <div class="sprite-item">
        <div class="sprite-label">前向（下）</div>
        <label class="sprite-upload" :class="{ hasImage: previews.front }">
          <input type="file" accept=".png" hidden @change="handleFileUpload('front', $event)" />
          <img v-if="previews.front" :src="previews.front" class="sprite-preview" />
          <div v-else class="sprite-placeholder"><span>点击上传</span></div>
          <button v-if="previews.front" class="sprite-clear" @click="clearDirection('front', $event)">✕</button>
        </label>
      </div>
      <!-- 背向 -->
      <div class="sprite-item">
        <div class="sprite-label">背向（上）</div>
        <label class="sprite-upload" :class="{ hasImage: previews.back }">
          <input type="file" accept=".png" hidden @change="handleFileUpload('back', $event)" />
          <img v-if="previews.back" :src="previews.back" class="sprite-preview" />
          <div v-else class="sprite-placeholder"><span>点击上传</span></div>
          <button v-if="previews.back" class="sprite-clear" @click="clearDirection('back', $event)">✕</button>
        </label>
      </div>
      <!-- 左向 -->
      <div class="sprite-item">
        <div class="sprite-label">左向</div>
        <label class="sprite-upload" :class="{ hasImage: previews.left }">
          <input type="file" accept=".png" hidden @change="handleFileUpload('left', $event)" />
          <img v-if="previews.left" :src="previews.left" class="sprite-preview" />
          <div v-else class="sprite-placeholder"><span>点击上传</span></div>
          <button v-if="previews.left" class="sprite-clear" @click="clearDirection('left', $event)">✕</button>
        </label>
      </div>
      <!-- 右向 -->
      <div class="sprite-item">
        <div class="sprite-label">右向</div>
        <label class="sprite-upload" :class="{ hasImage: previews.right }">
          <input type="file" accept=".png" hidden @change="handleFileUpload('right', $event)" />
          <img v-if="previews.right" :src="previews.right" class="sprite-preview" />
          <div v-else class="sprite-placeholder"><span>点击上传</span></div>
          <button v-if="previews.right" class="sprite-clear" @click="clearDirection('right', $event)">✕</button>
        </label>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="import-actions">
      <button class="btn-secondary" @click="clearAll">全部清除</button>
      <button
        class="btn-primary"
        :disabled="!Object.values(sprites).some(s => s)"
        @click="handleSave"
      >保存</button>
    </div>
  </div>
</template>

<style scoped>
.pawn-import-panel {
  background: #22222a;
  border: 1px solid #3a3a42;
  border-radius: 8px;
  width: 400px;
  max-height: 500px;
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

.import-note {
  padding: 8px 16px;
  color: #888;
  font-size: 12px;
}

.import-note p {
  margin: 4px 0;
}

.sprite-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 12px 16px;
}

.sprite-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sprite-label {
  font-size: 12px;
  color: #aaa;
}

.sprite-upload {
  position: relative;
  width: 100%;
  height: 120px;
  background: #3a3a42;
  border: 1px solid #4a4a52;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.sprite-upload.hasImage {
  background: #2a2a32;
}

.sprite-preview {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.sprite-placeholder {
  color: #888;
  font-size: 14px;
}

.sprite-clear {
  position: absolute;
  top: 4px;
  right: 4px;
  background: #4a4a52;
  border: none;
  color: #aaa;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
}

.sprite-clear:hover {
  background: #5a5a62;
}

.import-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #3a3a42;
}

.btn-primary,
.btn-secondary {
  padding: 8px 16px;
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

.btn-primary:disabled {
  background: #4a4a52;
  color: #888;
  cursor: not-allowed;
}

.btn-primary:not(:disabled):hover {
  background: #7a9a7a;
}

.btn-secondary {
  background: #4a4a52;
  color: #eaeaea;
}

.btn-secondary:hover {
  background: #5a5a62;
}

/* Android 按钮样式修复 */
.platform-android.android-portrait .close-btn,
.platform-android.android-portrait .sprite-clear,
.platform-android.android-portrait .btn-primary,
.platform-android.android-portrait .btn-secondary {
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
</style>