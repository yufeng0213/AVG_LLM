<script setup>
import { onMounted, ref, computed } from 'vue'
import {
  loadFontFromFile,
  restoreFontFromBuffer,
  storeFontBinary,
  getFontBinary,
  getImportedFonts,
  addImportedFont,
  removeImportedFont,
  deleteFontBinary,
  getFontAssignments,
  setFontAssignments,
  removeFontFromDocument,
} from '../fonts/index.js'

const statusMessage = ref('请选择字体文件并导入。')
const importedFonts = ref([])
const assignments = ref({ fontHeading: '', fontBody: '', fontDisplay: '' })
const fileInputRef = ref(null)
const isImporting = ref(false)

const BUILTIN_FONTS = [
  { value: '', label: '使用默认' },
  { value: "'Outfit', 'Segoe UI', sans-serif", label: 'Outfit（默认标题）' },
  { value: "'DM Sans', 'Segoe UI', sans-serif", label: 'DM Sans（默认正文）' },
  { value: "'Bangers', 'Impact', sans-serif", label: 'Bangers（默认展示）' },
  { value: "'Manrope', 'Segoe UI', sans-serif", label: 'Manrope' },
  { value: "'Nunito', 'Segoe UI', sans-serif", label: 'Nunito' },
  { value: "'Orbitron', 'Segoe UI', sans-serif", label: 'Orbitron' },
  { value: "'Righteous', 'Segoe UI', sans-serif", label: 'Righteous' },
  { value: "'Space Grotesk', 'Segoe UI', sans-serif", label: 'Space Grotesk' },
  { value: "'Anton', 'Segoe UI', sans-serif", label: 'Anton' },
]

const importedFontOptions = computed(() =>
  importedFonts.value.map((f) => ({
    value: `'${f.familyName}'`,
    label: `${f.familyName}（${f.fileName}）`,
  }))
)

const allFontOptions = computed(() => [...BUILTIN_FONTS, ...importedFontOptions.value])

const refreshFonts = async () => {
  importedFonts.value = await getImportedFonts()
  assignments.value = await getFontAssignments()
}

const triggerFileImport = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

const handleFileImport = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!['ttf', 'woff', 'woff2', 'otf'].includes(ext)) {
    statusMessage.value = '请选择字体文件（.ttf / .woff / .woff2 / .otf）。'
    return
  }

  // 大小提示：超过 5MB 给出警告
  const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
  if (file.size > 5 * 1024 * 1024) {
    statusMessage.value = `字体文件 ${sizeMB}MB，可能影响加载速度，确定要继续吗？`
    // 不阻止，只是提示
  }

  isImporting.value = true
  try {
    const result = await loadFontFromFile(file)

    // 存储到 IndexedDB
    await Promise.all([
      storeFontBinary(result.id, result.buffer),
      addImportedFont({
        id: result.id,
        familyName: result.familyName,
        fileName: result.fileName,
        fileType: result.fileType,
        fileSize: result.fileSize,
        createdAt: Date.now(),
      }),
    ])

    await refreshFonts()
    statusMessage.value = `已导入字体：${result.familyName}（${result.fileName}，${sizeMB}MB）`
  } catch (e) {
    statusMessage.value = `导入失败：${e.message}`
  } finally {
    isImporting.value = false
    event.target.value = ''
  }
}

const handleDeleteFont = async (font) => {
  try {
    // 从 document.fonts 移除
    removeFontFromDocument(font.familyName)

    // 从存储删除
    await Promise.all([
      deleteFontBinary(font.id),
      removeImportedFont(font.id),
    ])

    // 如果该字体当前被分配到某个槽位，重置为默认
    const keys = ['fontHeading', 'fontBody', 'fontDisplay']
    let needsReset = false
    for (const key of keys) {
      if (assignments.value[key] === `'${font.familyName}'`) {
        assignments.value[key] = ''
        needsReset = true
      }
    }

    if (needsReset) {
      await setFontAssignments(assignments.value)
      applyAssignments()
    }

    await refreshFonts()
    statusMessage.value = `已删除字体：${font.familyName}`
  } catch (e) {
    statusMessage.value = `删除失败：${e.message}`
  }
}

const handleAssignmentChange = async () => {
  await setFontAssignments(assignments.value)
  applyAssignments()
}

const applyAssignments = () => {
  const root = document.documentElement
  const mapping = {
    fontHeading: '--font-heading',
    fontBody: '--font-body',
    fontDisplay: '--font-display',
  }
  const defaults = {
    fontHeading: "'Outfit', 'Segoe UI', sans-serif",
    fontBody: "'DM Sans', 'Segoe UI', sans-serif",
    fontDisplay: "'Bangers', 'Impact', sans-serif",
  }

  for (const [key, cssVar] of Object.entries(mapping)) {
    const value = assignments.value[key] || defaults[key]
    root.style.setProperty(cssVar, value)
  }
}

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

onMounted(async () => {
  await refreshFonts()
})
</script>

<template>
  <section class="settings-panel-content">
    <h2 class="panel-title">字体设置</h2>
    <p class="panel-description">
      导入本地字体文件（.ttf / .woff / .woff2 / .otf），并分配到标题、正文、展示三个字体槽位。
    </p>

    <!-- 导入字体 -->
    <div class="setting-field">
      <span class="setting-label">导入字体文件</span>
      <div class="import-file-row">
        <input
          ref="fileInputRef"
          type="file"
          accept=".ttf,.woff,.woff2,.otf"
          class="file-input-hidden"
          @change="handleFileImport"
          :disabled="isImporting"
        />
        <button
          type="button"
          class="action-button action-outline import-file-btn"
          @click="triggerFileImport"
          :disabled="isImporting"
        >
          <span class="import-icon">📁</span>
          {{ isImporting ? '加载中…' : '选择字体文件' }}
        </button>
        <span class="import-hint">支持 .ttf / .woff / .woff2 / .otf 格式</span>
      </div>
    </div>

    <!-- 已导入字体列表 -->
    <div v-if="importedFonts.length > 0" class="setting-field">
      <span class="setting-label">已导入字体（{{ importedFonts.length }}）</span>
      <div class="font-list">
        <div v-for="font in importedFonts" :key="font.id" class="font-item">
          <div class="font-info">
            <span class="font-name">{{ font.familyName }}</span>
            <span class="font-meta">{{ font.fileName }} · {{ formatFileSize(font.fileSize) }}</span>
          </div>
          <button
            type="button"
            class="font-delete-btn"
            @click="handleDeleteFont(font)"
          >
            删除
          </button>
        </div>
      </div>
    </div>

    <div v-else class="setting-field">
      <span class="setting-label">已导入字体</span>
      <p class="font-empty">尚未导入任何字体，点击上方按钮选择字体文件。</p>
    </div>

    <!-- 字体分配 -->
    <div class="setting-field">
      <span class="setting-label">字体分配</span>
      <p class="panel-description" style="margin-bottom: 12px;">
        为标题（Heading）、正文（Body）、展示（Display）三个槽位选择字体。
      </p>
      <div class="font-assignments">
        <label class="assignment-item">
          <span class="assignment-label">标题字体</span>
          <select
            v-model="assignments.fontHeading"
            class="setting-select"
            @change="handleAssignmentChange"
          >
            <option v-for="opt in allFontOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>

        <label class="assignment-item">
          <span class="assignment-label">正文字体</span>
          <select
            v-model="assignments.fontBody"
            class="setting-select"
            @change="handleAssignmentChange"
          >
            <option v-for="opt in allFontOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>

        <label class="assignment-item">
          <span class="assignment-label">展示字体</span>
          <select
            v-model="assignments.fontDisplay"
            class="setting-select"
            @change="handleAssignmentChange"
          >
            <option v-for="opt in allFontOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <p class="status-message">{{ statusMessage }}</p>
  </section>
</template>

<style scoped src="./SettingsPanel.css"></style>

<style scoped>
.font-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.font-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--surface-field, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--border-field, rgba(255, 255, 255, 0.1));
}

.font-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.font-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--foreground, #ffffff);
}

.font-meta {
  font-size: 0.75rem;
  color: var(--muted, rgba(255, 255, 255, 0.4));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-delete-btn {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 80, 80, 0.3);
  background: rgba(255, 80, 80, 0.1);
  color: rgba(255, 80, 80, 0.9);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 150ms ease;
}

.font-delete-btn:hover {
  background: rgba(255, 80, 80, 0.2);
  border-color: rgba(255, 80, 80, 0.5);
}

.font-empty {
  margin: 8px 0 0;
  padding: 16px;
  text-align: center;
  color: var(--muted, rgba(255, 255, 255, 0.4));
  font-size: 0.85rem;
  border-radius: 12px;
  border: 1px dashed var(--border-field, rgba(255, 255, 255, 0.1));
}

.font-assignments {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.assignment-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.assignment-label {
  font-size: 0.8rem;
  color: var(--muted, rgba(255, 255, 255, 0.5));
}
</style>
