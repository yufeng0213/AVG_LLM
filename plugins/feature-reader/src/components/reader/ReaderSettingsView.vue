<script setup>
/**
 * ReaderSettingsView.vue - 阅读设置
 * 字体大小、行高、美化配置导入。
 */
import { ref, onMounted } from 'vue'
import { loadSettings, saveSettings } from '../../composables/useReaderData.js'
import { loadBeautifyConfig, validateConfig, exportBeautifyConfig, DEFAULT_RULES } from '../../composables/readerBeautifier.js'

const emit = defineEmits(['back'])

const fontSize = ref(16)
const lineHeight = ref(1.8)
const contextChapters = ref(1)
const memoryThreshold = ref(0)
const beautifyStatus = ref('') // '' | '已加载' | '导入成功' | '错误: xxx'

onMounted(async () => {
  const s = await loadSettings()
  fontSize.value = s.fontSize
  lineHeight.value = s.lineHeight
  contextChapters.value = s.contextChapters ?? 1
  memoryThreshold.value = s.memoryThreshold ?? 0
  beautifyStatus.value = s.beautifyConfig ? '已加载' : '未配置（使用默认）'
})

async function handleSave() {
  await saveSettings({
    fontSize: fontSize.value,
    lineHeight: lineHeight.value,
    theme: 'dark',
    contextChapters: contextChapters.value,
    memoryThreshold: memoryThreshold.value,
  })
  emit('back')
}

async function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const text = await file.text()
      const config = JSON.parse(text)
      const validation = validateConfig(config)
      if (!validation.valid) {
        beautifyStatus.value = `错误: ${validation.error}`
        return
      }
      const settings = await loadSettings()
      settings.beautifyConfig = config
      await saveSettings(settings)
      beautifyStatus.value = `导入成功: ${config.rules?.length || 0} 条规则`
    } catch (err) {
      beautifyStatus.value = `错误: ${err.message}`
    }
  }
  input.click()
}

async function handleExport() {
  try {
    const settings = await loadSettings()
    const config = settings.beautifyConfig || loadBeautifyConfig(null)
    const json = exportBeautifyConfig(config)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'reader-beautify-config.json'
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    beautifyStatus.value = `导出失败: ${err.message}`
  }
}

async function handleReset() {
  const settings = await loadSettings()
  delete settings.beautifyConfig
  await saveSettings(settings)
  beautifyStatus.value = '已重置为默认'
}
</script>

<template>
  <div class="reader-settings">
    <h2 class="settings-title">阅读设置</h2>

    <!-- 字体大小 -->
    <div class="settings-group">
      <label class="settings-label">字体大小: {{ fontSize }}px</label>
      <input
        v-model="fontSize"
        class="settings-range"
        type="range"
        min="12"
        max="24"
        step="1"
      />
      <div class="settings-range-labels">
        <span>12</span>
        <span>24</span>
      </div>
      <p class="settings-preview" :style="{ fontSize: fontSize + 'px' }">
        预览文字的大小
      </p>
    </div>

    <!-- 行高 -->
    <div class="settings-group">
      <label class="settings-label">行间距: {{ lineHeight }}</label>
      <input
        v-model="lineHeight"
        class="settings-range"
        type="range"
        min="1.4"
        max="2.4"
        step="0.1"
      />
      <div class="settings-range-labels">
        <span>1.4</span>
        <span>2.4</span>
      </div>
    </div>

    <!-- LLM 上下文章节数 -->
    <div class="settings-group">
      <label class="settings-label">生成上下文参考章节数</label>
      <p class="settings-hint">生成下一章时，会发送最近 N 章的完整内容给 LLM 作为上下文。填 0 表示不参考</p>
      <input
        v-model.number="contextChapters"
        class="settings-number"
        type="number"
        min="0"
        max="50"
        step="1"
        placeholder="输入章节数"
      />
      <p class="settings-number-value">当前: {{ contextChapters }} 章</p>
    </div>

    <!-- 记忆提取阈值 -->
    <div class="settings-group">
      <label class="settings-label">记忆提取阈值（章节数）</label>
      <p class="settings-hint">每累积 N 章后，自动调用 LLM 提取剧情记忆摘要。下次生成时会注入这些记忆</p>
      <input
        v-model.number="memoryThreshold"
        class="settings-number"
        type="number"
        min="0"
        max="30"
        step="1"
        placeholder="输入章节数，0 为关闭"
      />
      <p class="settings-number-value">当前: {{ memoryThreshold === 0 ? '关闭' : '每 ' + memoryThreshold + ' 章提取' }}</p>
    </div>

    <!-- 主题跟随系统提示 -->
    <div class="settings-group">
      <label class="settings-label">主题</label>
      <p class="settings-hint">跟随系统主题，在设置中切换主题即可</p>
    </div>

    <!-- 文本美化配置 -->
    <div class="settings-group">
      <label class="settings-label">文本美化</label>
      <p class="settings-hint">导入 JSON 配置文件，自定义首字下沉、引号变色、省略号等排版效果</p>
      <div class="beautify-actions">
        <button class="beautify-btn" @click="handleImport">导入配置</button>
        <button class="beautify-btn beautify-btn--secondary" @click="handleExport">导出配置</button>
        <button class="beautify-btn beautify-btn--danger" @click="handleReset">重置默认</button>
      </div>
      <p class="beautify-status" :class="{ error: beautifyStatus.startsWith('错误') }">{{ beautifyStatus }}</p>
    </div>

    <button class="settings-save-btn" @click="handleSave">
      保存设置
    </button>
  </div>
</template>

<style scoped>
.reader-settings {
  padding: 16px;
  min-height: 100%;
}

.settings-title {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 20px;
  color: var(--reader-text, #fff);
}

.settings-group {
  margin-bottom: 24px;
}

.settings-label {
  display: block;
  font-size: 0.85rem;
  color: var(--reader-secondary, #8b9dc3);
  font-weight: 600;
  margin-bottom: 8px;
}

.settings-hint {
  font-size: 0.82rem;
  color: var(--reader-secondary, #8b9dc3);
  opacity: 0.7;
  margin: 0;
  padding: 8px 12px;
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.04));
  border-radius: 8px;
}

.settings-range {
  width: 100%;
  accent-color: var(--reader-accent-start, #667eea);
}

.settings-range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #555;
}

.settings-number {
  width: 100%;
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--reader-text, #fff);
  font-size: 0.9rem;
  outline: none;
  margin-top: 8px;
  box-sizing: border-box;
}

.settings-number:focus {
  border-color: var(--reader-accent-start, #667eea);
}

.settings-number-value {
  margin-top: 6px;
  font-size: 0.8rem;
  color: var(--reader-accent-start, #667eea);
  font-weight: 600;
}

.settings-preview {
  margin-top: 8px;
  color: var(--reader-secondary, #aaa);
  padding: 8px 12px;
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.04));
  border-radius: 8px;
}

/* 美化配置操作区 */
.beautify-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.beautify-btn {
  flex: 1;
  min-width: 80px;
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--reader-text, #fff);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.beautify-btn:hover {
  background: var(--reader-border, rgba(255, 255, 255, 0.15));
}

.beautify-btn--secondary {
  border-color: var(--reader-accent-start, #667eea);
  color: var(--reader-accent-start, #667eea);
}

.beautify-btn--danger {
  border-color: rgba(255, 77, 77, 0.3);
  color: #ff6b6b;
}

.beautify-btn--danger:hover {
  background: rgba(255, 77, 77, 0.1);
}

.beautify-status {
  margin-top: 8px;
  font-size: 0.78rem;
  color: var(--reader-accent-start, #667eea);
}

.beautify-status.error {
  color: #ff6b6b;
}

.settings-save-btn {
  width: 100%;
  background: linear-gradient(135deg, var(--reader-accent-start, #667eea), var(--reader-accent-end, #764ba2));
  border: none;
  color: var(--reader-text, #fff);
  padding: 14px;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s;
  margin-top: 12px;
}

.settings-save-btn:hover {
  transform: scale(1.02);
}

.settings-save-btn:active {
  transform: scale(0.98);
}
</style>
