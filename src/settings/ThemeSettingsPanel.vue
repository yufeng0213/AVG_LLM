<script setup>
import { onMounted, ref } from 'vue'
import {
  applyThemeById,
  getActiveThemeId,
  getThemeCatalog,
  getThemeTemplate,
  upsertCustomTheme,
} from '../theme/themeManager'

const themes = ref([])
const selectedThemeId = ref('')
const statusMessage = ref('请选择一个主题并应用。')
const customThemeJson = ref(getThemeTemplate())
const fileInputRef = ref(null)

const refreshThemes = async () => {
  themes.value = await getThemeCatalog()
  selectedThemeId.value = await getActiveThemeId()
}

const applySelectedTheme = async () => {
  const applied = await applyThemeById(selectedThemeId.value)
  if (!applied) {
    statusMessage.value = '主题应用失败。'
    return
  }

  statusMessage.value = `已应用主题：${applied.name}`
}

const importThemeFromJson = async () => {
  try {
    const parsed = JSON.parse(customThemeJson.value)
    const savedTheme = await upsertCustomTheme(parsed)
    await refreshThemes()
    selectedThemeId.value = savedTheme.id
    await applyThemeById(savedTheme.id)
    statusMessage.value = `已注入并应用主题：${savedTheme.name}`
  } catch {
    statusMessage.value = 'JSON 格式错误，请检查后重试。'
  }
}

const triggerFileImport = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

const handleFileImport = (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  // 检查文件类型
  if (!file.name.endsWith('.json')) {
    statusMessage.value = '请选择 JSON 文件（.json 格式）。'
    return
  }

  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const content = e.target?.result
      if (typeof content !== 'string') {
        statusMessage.value = '文件读取失败。'
        return
      }

      const parsed = JSON.parse(content)
      const savedTheme = await upsertCustomTheme(parsed)
      await refreshThemes()
      selectedThemeId.value = savedTheme.id
      await applyThemeById(savedTheme.id)
      statusMessage.value = `已导入并应用主题：${savedTheme.name}`

      // 更新 textarea 内容
      customThemeJson.value = content
    } catch (err) {
      console.error('Theme import error:', err)
      statusMessage.value = 'JSON 格式错误，请检查文件内容。'
    }
  }

  reader.onerror = () => {
    statusMessage.value = '文件读取失败，请重试。'
  }

  reader.readAsText(file)

  // 清空 input 以便再次选择同一文件
  event.target.value = ''
}

const exportCurrentTheme = () => {
  const currentTheme = themes.value.find((item) => item.id === selectedThemeId.value)
  if (!currentTheme) {
    statusMessage.value = '未找到当前主题。'
    return
  }

  const exportData = {
    id: currentTheme.id,
    name: currentTheme.name,
    description: currentTheme.description,
    styleProfile: currentTheme.styleProfile,
    tokens: currentTheme.tokens,
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${currentTheme.styleProfile || currentTheme.id}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  statusMessage.value = `已导出主题文件：${link.download}`
}

onMounted(async () => {
  await refreshThemes()
})
</script>

<template>
  <section class="settings-panel-content">
    <h2 class="panel-title">主题设置</h2>
    <p class="panel-description">
      主题由 JSON 驱动，支持预设风格配置与自定义 token 注入。可导入外部分享的主题文件。
    </p>

    <div class="settings-grid two-column">
      <label class="setting-field">
        <span class="setting-label">主题列表</span>
        <select v-model="selectedThemeId" class="setting-select">
          <option v-for="theme in themes" :key="theme.id" :value="theme.id">
            {{ theme.name }} ({{ theme.source }} / {{ theme.styleProfile }})
          </option>
        </select>
      </label>

      <div class="setting-field">
        <span class="setting-label">当前主题信息</span>
        <p class="theme-summary">
          {{ themes.find((item) => item.id === selectedThemeId)?.description || '无描述' }}
        </p>
        <p class="theme-summary">
          风格配置：{{ themes.find((item) => item.id === selectedThemeId)?.styleProfile || '未定义' }}
        </p>
      </div>
    </div>

    <div class="setting-actions">
      <button type="button" class="action-button action-strong" @click="applySelectedTheme">
        应用主题
      </button>
      <button type="button" class="action-button action-outline" @click="exportCurrentTheme">
        导出当前主题
      </button>
    </div>

    <!-- 文件导入区域 -->
    <div class="import-section">
      <div class="setting-field import-file-area">
        <span class="setting-label">导入主题文件</span>
        <div class="import-file-row">
          <input
            ref="fileInputRef"
            type="file"
            accept=".json"
            class="file-input-hidden"
            @change="handleFileImport"
          />
          <button type="button" class="action-button action-outline import-file-btn" @click="triggerFileImport">
            <span class="import-icon">📁</span>
            选择 JSON 文件
          </button>
          <span class="import-hint">支持导入 .json 格式的主题文件</span>
        </div>
      </div>
    </div>

    <label class="setting-field">
      <span class="setting-label">手动注入主题 JSON</span>
      <textarea
        v-model="customThemeJson"
        class="setting-textarea"
        rows="12"
        spellcheck="false"
      ></textarea>
    </label>

    <div class="setting-actions">
      <button type="button" class="action-button action-outline" @click="importThemeFromJson">
        注入并应用 JSON
      </button>
      <button type="button" class="action-button action-ghost" @click="customThemeJson = getThemeTemplate()">
        重置模板
      </button>
    </div>

    <p class="status-message">{{ statusMessage }}</p>
  </section>
</template>

<style scoped src="./ThemeSettingsPanel.css"></style>

