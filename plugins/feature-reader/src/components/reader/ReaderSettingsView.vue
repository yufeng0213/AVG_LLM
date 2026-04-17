<script setup>
/**
 * ReaderSettingsView.vue - 阅读设置
 * 字体大小、行高。主题跟随系统。
 */
import { ref, onMounted } from 'vue'
import { loadSettings, saveSettings } from '../../composables/useReaderData.js'

const emit = defineEmits(['back'])

const fontSize = ref(16)
const lineHeight = ref(1.8)
const contextChapters = ref(1)

onMounted(async () => {
  const s = await loadSettings()
  fontSize.value = s.fontSize
  lineHeight.value = s.lineHeight
  contextChapters.value = s.contextChapters ?? 1
})

async function handleSave() {
  await saveSettings({
    fontSize: fontSize.value,
    lineHeight: lineHeight.value,
    theme: 'dark',
    contextChapters: contextChapters.value,
  })
  emit('back')
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
      <label class="settings-label">生成上下文参考章节数: {{ contextChapters }}</label>
      <p class="settings-hint">生成下一章时，会发送最近 N 章的完整内容给 LLM 作为上下文</p>
      <input
        v-model="contextChapters"
        class="settings-range"
        type="range"
        min="0"
        max="5"
        step="1"
      />
      <div class="settings-range-labels">
        <span>0（不参考）</span>
        <span>5</span>
      </div>
    </div>

    <!-- 主题跟随系统提示 -->
    <div class="settings-group">
      <label class="settings-label">主题</label>
      <p class="settings-hint">跟随系统主题，在设置中切换主题即可</p>
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

.settings-preview {
  margin-top: 8px;
  color: var(--reader-secondary, #aaa);
  padding: 8px 12px;
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.04));
  border-radius: 8px;
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
