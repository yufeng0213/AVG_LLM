<script setup>
import { ref, onMounted } from 'vue'
import { kvStorage } from '../../../src/storage/index.js'

const bgPath = ref('')
const saved = ref(false)
const clearing = ref(false)

onMounted(async () => {
  const stored = await kvStorage.get('avg_llm_todo_bg_path')
  if (stored) bgPath.value = stored
})

async function handleSave() {
  if (!bgPath.value.trim()) return
  await kvStorage.set('avg_llm_todo_bg_path', bgPath.value.trim())
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
  window.dispatchEvent(new CustomEvent('todo:settingsChanged'))
}

async function handleClear() {
  await kvStorage.set('avg_llm_todo_bg_path', null)
  bgPath.value = ''
  clearing.value = true
  setTimeout(() => { clearing.value = false }, 2000)
  window.dispatchEvent(new CustomEvent('todo:settingsChanged'))
}
</script>

<template>
  <div class="todo-settings-screen">
    <!-- 顶部 -->
    <div class="settings-header">
      <h2 class="settings-title">设置</h2>
    </div>

    <div class="settings-content">
      <!-- 背景图片 -->
      <div class="settings-section">
        <h3 class="section-title">背景图片</h3>
        <div class="bg-preview">
          <div class="preview-placeholder">
            <span v-if="!bgPath">纯色背景</span>
            <span v-else>已配置</span>
          </div>
        </div>
        <div class="input-row">
          <input
            v-model="bgPath"
            class="path-input"
            placeholder="输入 PNG 路径，如 /path/to/bg.png"
          />
        </div>
        <div class="btn-row">
          <button type="button" class="btn-clear" @click="handleClear">清除</button>
          <button type="button" class="btn-save" :class="{ disabled: !bgPath.trim() }" @click="handleSave">保存</button>
        </div>
        <div v-if="saved" class="toast saved-toast">已保存</div>
        <div v-if="clearing" class="toast cleared-toast">已清除</div>
        <p class="section-hint">你导入 PNG 后，在此填入路径即可。支持本地路径或网络 URL。</p>
      </div>

      <!-- 关于 -->
      <div class="settings-section">
        <h3 class="section-title">关于</h3>
        <div class="about-row">
          <span class="about-label">版本</span>
          <span class="about-value">0.2.0</span>
        </div>
        <div class="about-row">
          <span class="about-label">数据来源</span>
          <span class="about-value">本地存储</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.todo-settings-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  padding-top: max(16px, var(--safe-area-inset-top, 16px));
}

.settings-title {
  font-size: 20px;
  font-weight: 700;
  color: #2d2d3a;
  margin: 0;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 4px 16px 32px;
}

.settings-section {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #2d2d3a;
  margin: 0 0 16px;
}

.bg-preview {
  margin-bottom: 14px;
}

.preview-placeholder {
  width: 100%;
  height: 120px;
  background: linear-gradient(135deg, #f5f2ff, #fce4ec);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9b8ec4;
  font-size: 14px;
}

.input-row {
  margin-bottom: 12px;
}

.path-input {
  width: 100%;
  padding: 12px 14px;
  background: #f8f6ff;
  border: 2px solid #e8e6f0;
  border-radius: 12px;
  font-size: 14px;
  color: #2d2d3a;
  outline: none;
  transition: border-color 0.2s;
}

.path-input:focus {
  border-color: #9b8ec4;
}

.btn-row {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.btn-clear, .btn-save {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-clear {
  background: #f0eeff;
  color: #9b8ec4;
}

.btn-save {
  background: linear-gradient(135deg, #9b8ec4, #b8a9e0);
  color: #fff;
}

.btn-save.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toast {
  text-align: center;
  font-size: 13px;
  padding: 6px;
  border-radius: 8px;
  margin-bottom: 8px;
}

.saved-toast {
  background: #e8f8e8;
  color: #51cf66;
}

.cleared-toast {
  background: #fff0f0;
  color: #ff6b6b;
}

.section-hint {
  font-size: 12px;
  color: #8888a0;
  margin: 0;
  line-height: 1.5;
}

.about-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f0eeff;
}

.about-row:last-child {
  border-bottom: none;
}

.about-label {
  font-size: 14px;
  color: #8888a0;
}

.about-value {
  font-size: 14px;
  font-weight: 500;
  color: #2d2d3a;
}

  .platform-android.android-portrait .btn-clear,
  .platform-android.android-portrait .btn-save {
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
