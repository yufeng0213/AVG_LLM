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

const refreshThemes = () => {
  themes.value = getThemeCatalog()
  selectedThemeId.value = getActiveThemeId()
}

const applySelectedTheme = () => {
  const applied = applyThemeById(selectedThemeId.value)
  if (!applied) {
    statusMessage.value = '主题应用失败。'
    return
  }

  statusMessage.value = `已应用主题：${applied.name}`
}

const importThemeFromJson = () => {
  try {
    const parsed = JSON.parse(customThemeJson.value)
    const savedTheme = upsertCustomTheme(parsed)
    refreshThemes()
    selectedThemeId.value = savedTheme.id
    applyThemeById(savedTheme.id)
    statusMessage.value = `已注入并应用主题：${savedTheme.name}`
  } catch {
    statusMessage.value = 'JSON 格式错误，请检查后重试。'
  }
}

onMounted(refreshThemes)
</script>

<template>
  <section class="settings-panel-content">
    <h2 class="panel-title">主题设置</h2>
    <p class="panel-description">
      主题由 JSON 驱动，支持预设风格配置（如 dopamine-max / clay-hifi）与自定义 token 注入。
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
    </div>

    <label class="setting-field">
      <span class="setting-label">注入主题 JSON</span>
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

<style scoped>
.theme-summary {
  margin: 0;
  font-size: 0.9rem;
  color: color-mix(in srgb, var(--foreground) 88%, var(--accent-cyan));
}

</style>
