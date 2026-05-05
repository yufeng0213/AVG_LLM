<script setup>
/**
 * ReaderSettingsView.vue - 阅读设置
 * 紫色主题
 */
import { ref, onMounted } from 'vue'
import { loadSettings, saveSettings } from '../../composables/useReaderData.js'
import { loadBeautifyConfig, validateConfig, exportBeautifyConfig, DEFAULT_RULES } from '../../composables/readerBeautifier.js'

const emit = defineEmits(['back'])

const fontSize = ref(16)
const lineHeight = ref(1.8)
const contextChapters = ref(1)
const memoryThreshold = ref(0)
const mainCharacters = ref('')
const preferredGenres = ref('')
const beautifyStatus = ref('')

onMounted(async () => {
  const s = await loadSettings()
  fontSize.value = s.fontSize
  lineHeight.value = s.lineHeight
  contextChapters.value = s.contextChapters ?? 1
  memoryThreshold.value = s.memoryThreshold ?? 0
  mainCharacters.value = s.mainCharacters || ''
  preferredGenres.value = s.preferredGenres || ''
  beautifyStatus.value = s.beautifyConfig ? '已加载' : '未配置（使用默认）'
})

async function handleSave() {
  await saveSettings({
    fontSize: fontSize.value,
    lineHeight: lineHeight.value,
    theme: 'dark',
    contextChapters: contextChapters.value,
    memoryThreshold: memoryThreshold.value,
    mainCharacters: mainCharacters.value,
    preferredGenres: preferredGenres.value,
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
    <!-- 标题栏 -->
    <div class="settings-header">
      <button class="settings-back-btn" @click="emit('back')"><</button>
      <span class="settings-title">阅读设置</span>
      <span class="settings-spacer" />
    </div>

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
      <p class="settings-hint">每累积 N 章后，自动调用 LLM 提取剧情记忆摘要</p>
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

    <!-- 主要角色设定 -->
    <div class="settings-group">
      <label class="settings-label">主要角色设定</label>
      <p class="settings-hint">当生成非参考角色的新书时，LLM 会以此作为主要角色背景。可设置女主/男主等核心角色的姓名、性格、身份等信息。</p>
      <textarea
        v-model="mainCharacters"
        class="settings-textarea"
        placeholder="例如：&#10;女主：林小雅，性格温柔但坚韧，是一名高中生&#10;男主：叶辰，性格冷静沉稳，真实身份是隐藏的修仙者"
        rows="4"
      ></textarea>
    </div>

    <!-- 偏好小说类型 -->
    <div class="settings-group">
      <label class="settings-label">偏好小说类型</label>
      <p class="settings-hint">新书发现时优先推荐这些类型，留空则随机推荐。多个类型用空格分隔。</p>
      <input
        v-model="preferredGenres"
        class="settings-textarea"
        type="text"
        placeholder="例如：悬疑 都市 轻小说 快穿"
      />
    </div>

    <!-- 文本美化配置 -->
    <div class="settings-group">
      <label class="settings-label">文本美化</label>
      <p class="settings-hint">导入 JSON 配置文件，自定义排版效果</p>
      <div class="beautify-actions">
        <button class="beautify-btn" @click="handleImport">导入配置</button>
        <button class="beautify-btn beautify-btn--secondary" @click="handleExport">导出配置</button>
        <button class="beautify-btn beautify-btn--danger" @click="handleReset">重置</button>
      </div>
      <p class="beautify-status" :class="{ error: beautifyStatus.startsWith('错误') }">{{ beautifyStatus }}</p>
    </div>

    <button class="settings-save-btn" @click="handleSave">
      保存设置
    </button>

    <div class="bottom-spacer" />
  </div>
</template>

<style scoped>
.reader-settings {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: linear-gradient(180deg, #f5f0ff 0%, #ede4ff 100%);
}

/* 标题栏 */
.settings-header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  padding-top: 10px;
}

.settings-back-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  color: #2d2040;
  cursor: pointer;
  padding: 4px 8px;
}

.settings-title {
  flex: 1;
  text-align: center;
  font-size: 1rem;
  font-weight: 700;
  color: #2d2040;
}

.settings-spacer {
  width: 40px;
}

/* 设置分组 */
.settings-group {
  background: #fff;
  margin: 0 16px 14px;
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}

.settings-label {
  display: block;
  font-size: 0.85rem;
  color: #2d2040;
  font-weight: 600;
  margin-bottom: 8px;
}

.settings-hint {
  font-size: 0.78rem;
  color: #8b7ea8;
  margin: 0 0 10px;
}

.settings-range {
  width: 100%;
  accent-color: #7c5cbf;
}

.settings-range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  color: #b0a8c0;
}

.settings-number {
  width: 100%;
  background: #f8f4ff;
  border: 1px solid #e8e0f0;
  border-radius: 10px;
  padding: 10px 12px;
  color: #2d2040;
  font-size: 0.88rem;
  outline: none;
  margin-top: 8px;
  box-sizing: border-box;
}

.settings-number:focus {
  border-color: #7c5cbf;
}

.settings-textarea {
  width: 100%;
  background: #f8f4ff;
  border: 1px solid #e8e0f0;
  border-radius: 10px;
  padding: 10px 12px;
  color: #2d2040;
  font-size: 0.82rem;
  outline: none;
  margin-top: 8px;
  box-sizing: border-box;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
}

.settings-textarea:focus {
  border-color: #7c5cbf;
}

.settings-number-value {
  margin-top: 6px;
  font-size: 0.78rem;
  color: #7c5cbf;
  font-weight: 600;
}

.settings-preview {
  margin-top: 8px;
  color: #8b7ea8;
  padding: 8px 12px;
  background: #f8f4ff;
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
  min-width: 70px;
  background: #f0e8ff;
  border: 1px solid #e0d4f5;
  border-radius: 10px;
  padding: 8px 12px;
  color: #7c5cbf;
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.2s;
}

.beautify-btn:hover {
  background: #e0d4f5;
}

.beautify-btn--secondary {
  border-color: #7c5cbf;
}

.beautify-btn--danger {
  border-color: #ff6b6b;
  color: #ff6b6b;
  background: rgba(255, 77, 77, 0.06);
}

.beautify-btn--danger:hover {
  background: rgba(255, 77, 77, 0.12);
}

.beautify-status {
  margin-top: 8px;
  font-size: 0.75rem;
  color: #7c5cbf;
}

.beautify-status.error {
  color: #ff6b6b;
}

/* 保存按钮 */
.settings-save-btn {
  width: calc(100% - 32px);
  margin: 0 16px 12px;
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  border: none;
  color: #fff;
  padding: 14px;
  border-radius: 24px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s;
}

.settings-save-btn:hover {
  transform: scale(1.02);
}

.bottom-spacer {
  height: 16px;
}

.platform-android.android-portrait .settings-back-btn,
.platform-android.android-portrait .beautify-btn,
.platform-android.android-portrait .settings-save-btn {
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
