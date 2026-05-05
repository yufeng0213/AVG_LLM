<script setup>
/**
 * BookImportView.vue - 本地书籍导入界面
 * 支持 TXT / EPUB / PDF 格式导入到书架
 */
import { ref } from 'vue'
import { pickBookFile, parseBookFile, saveImportedBook } from '../../composables/useBookImport.js'

const emit = defineEmits(['back', 'story-imported'])

const parsing = ref(false)
const progressMsg = ref('')
const error = ref('')
const parsedPreview = ref(null)
const previewTitle = ref('')
const previewAuthor = ref('')
const importing = ref(false)

async function handlePickFile() {
  error.value = ''
  parsedPreview.value = null

  const file = await pickBookFile()
  if (!file) return

  parsing.value = true
  progressMsg.value = '正在读取文件...'

  try {
    await new Promise(r => setTimeout(r, 50)) // 让 UI 更新
    progressMsg.value = `正在解析文件...`
    const parsed = await parseBookFile(file)

    parsedPreview.value = parsed
    previewTitle.value = parsed.title
    previewAuthor.value = parsed.author
    error.value = ''
  } catch (e) {
    error.value = e.message
    parsedPreview.value = null
  } finally {
    parsing.value = false
  }
}

async function handleConfirmImport() {
  if (!parsedPreview.value || importing.value) return
  importing.value = true
  progressMsg.value = '正在导入到书架...'

  try {
    const book = {
      ...parsedPreview.value,
      title: previewTitle.value.trim() || parsedPreview.value.title,
      author: previewAuthor.value.trim() || parsedPreview.value.author,
    }

    const story = await saveImportedBook(book)
    if (story) {
      emit('story-imported', story)
    } else {
      error.value = '导入失败，请重试'
    }
  } catch (e) {
    error.value = e.message || '导入失败'
  } finally {
    importing.value = false
  }
}

const formatLabels = { txt: 'TXT', epub: 'EPUB', pdf: 'PDF' }

function formatWordCount(chapters) {
  const total = chapters.reduce((sum, ch) => sum + (ch.content?.length || 0), 0)
  if (total >= 10000) return (total / 10000).toFixed(1) + '万'
  return total.toLocaleString()
}
</script>

<template>
  <div class="book-import">
    <!-- 头部 -->
    <div class="import-header">
      <button class="import-back-btn" @click="emit('back')">&lt;</button>
      <span class="import-title">导入本地书籍</span>
    </div>

    <div class="import-body">
      <!-- 格式说明 -->
      <div class="format-info">
        <div class="format-card">
          <span class="format-icon">📄</span>
          <span class="format-name">TXT</span>
          <span class="format-desc">纯文本文件</span>
        </div>
        <div class="format-card">
          <span class="format-icon">📚</span>
          <span class="format-name">EPUB</span>
          <span class="format-desc">电子书标准格式</span>
        </div>
        <div class="format-card">
          <span class="format-icon">📋</span>
          <span class="format-name">PDF</span>
          <span class="format-desc">便携式文档</span>
        </div>
      </div>

      <!-- 文件选择区 -->
      <div
        v-if="!parsedPreview"
        class="import-zone"
        :class="{ 'zone-active': parsing }"
        @click="!parsing && handlePickFile()"
      >
        <div class="import-icon-big">📖</div>
        <p class="import-text">{{ parsing ? '解析中，请稍候...' : '点击选择文件' }}</p>
        <p class="import-hint">支持 .txt / .epub / .pdf，最大 100MB</p>
      </div>

      <!-- 解析进度 -->
      <div v-if="parsing && !parsedPreview" class="import-progress">
        <span class="spinner">⟳</span>
        <span>{{ progressMsg }}</span>
      </div>

      <!-- 预览区 -->
      <div v-if="parsedPreview" class="import-preview">
        <div class="preview-header">
          <span class="preview-format-badge">{{ formatLabels[parsedPreview.format] }}</span>
          <span class="preview-format-label">已解析</span>
        </div>

        <div class="preview-group">
          <label class="preview-label">书名</label>
          <input
            v-model="previewTitle"
            type="text"
            maxlength="50"
            class="form-input"
            placeholder="输入书名"
          />
        </div>

        <div class="preview-group">
          <label class="preview-label">作者</label>
          <input
            v-model="previewAuthor"
            type="text"
            maxlength="30"
            class="form-input"
            placeholder="输入作者（可选）"
          />
        </div>

        <div class="preview-meta">
          <span class="meta-item">{{ parsedPreview.chapters.length }} 章</span>
          <span class="meta-item">{{ formatWordCount(parsedPreview.chapters) }} 字</span>
        </div>

        <button
          class="import-confirm-btn"
          :disabled="importing"
          @click="handleConfirmImport"
        >
          {{ importing ? '导入中...' : '确认导入书架' }}
        </button>

        <button class="import-repick-btn" :disabled="importing" @click="parsedPreview = null">
          重新选择文件
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="error" class="import-error">
        <span class="error-icon">⚠</span>
        <span>{{ error }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.book-import {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: linear-gradient(180deg, #f5f0ff 0%, #ede4ff 100%);
}

/* 头部 */
.import-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  padding-top: 12px;
  gap: 12px;
  flex-shrink: 0;
}

.import-back-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: #2d2040;
  cursor: pointer;
  padding: 4px 8px;
}

.import-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #2d2040;
}

/* 主体 */
.import-body {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

/* 格式信息 */
.format-info {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.format-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #fff;
  border-radius: 12px;
  padding: 14px 8px;
  box-shadow: 0 2px 8px rgba(124, 92, 191, 0.06);
}

.format-icon {
  font-size: 1.5rem;
  margin-bottom: 4px;
}

.format-name {
  font-size: 0.85rem;
  font-weight: 700;
  color: #2d2040;
}

.format-desc {
  font-size: 0.68rem;
  color: #b0a8c0;
  margin-top: 2px;
}

/* 文件选择区 */
.import-zone {
  border: 2px dashed #d4c4f0;
  border-radius: 16px;
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
}

.import-zone:hover {
  border-color: #7c5cbf;
  background: #faf5ff;
}

.import-zone:active {
  transform: scale(0.98);
}

.import-icon-big {
  font-size: 3rem;
  margin-bottom: 12px;
}

.import-text {
  font-size: 1rem;
  font-weight: 600;
  color: #2d2040;
  margin: 0 0 6px;
}

.import-hint {
  font-size: 0.78rem;
  color: #b0a8c0;
  margin: 0;
}

/* 进度 */
.import-progress {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  background: #fff;
  border-radius: 12px;
  color: #7c5cbf;
  font-size: 0.9rem;
  font-weight: 500;
}

/* 预览区 */
.import-preview {
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 2px 12px rgba(124, 92, 191, 0.08);
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.preview-format-badge {
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  color: #fff;
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 700;
}

.preview-format-label {
  font-size: 0.82rem;
  color: #2d8a4e;
  font-weight: 600;
}

.preview-group {
  margin-bottom: 12px;
}

.preview-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: #8b7ea8;
  margin-bottom: 4px;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e8e0f0;
  border-radius: 10px;
  font-size: 0.9rem;
  color: #2d2040;
  outline: none;
  box-sizing: border-box;
  background: #f8f4ff;
}

.form-input:focus {
  border-color: #7c5cbf;
  background: #fff;
}

.preview-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.meta-item {
  font-size: 0.82rem;
  color: #b0a8c0;
  background: #f0e8ff;
  padding: 4px 12px;
  border-radius: 12px;
}

.import-confirm-btn {
  width: 100%;
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  border: none;
  color: #fff;
  padding: 14px;
  border-radius: 24px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.2s;
}

.import-confirm-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.import-confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.import-repick-btn {
  width: 100%;
  background: none;
  border: 1px solid #e0d4f5;
  color: #7c5cbf;
  padding: 10px;
  border-radius: 20px;
  font-size: 0.85rem;
  cursor: pointer;
  margin-top: 10px;
  transition: background 0.2s;
}

.import-repick-btn:hover {
  background: #f0e8ff;
}

.import-repick-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 错误提示 */
.import-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  background: #fff5f5;
  border: 1px solid #fecaca;
  border-radius: 12px;
  color: #dc2626;
  font-size: 0.85rem;
  margin-top: 12px;
}

.error-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

/* 动画 */
.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.platform-android.android-portrait .import-back-btn,
.platform-android.android-portrait .import-confirm-btn,
.platform-android.android-portrait .import-repick-btn {
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  flex: none !important;
  font-size: 1.1rem !important;
  padding: 6px 14px !important;
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 8px !important;
  white-space: nowrap !important;
}
</style>
