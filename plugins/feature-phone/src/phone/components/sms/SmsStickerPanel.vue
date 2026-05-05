<script setup>
/**
 * SmsStickerPanel.vue — 表情包面板（浅色主题）
 */
const props = defineProps({
  stickers: { type: Array, required: true },
  showImport: { type: Boolean, default: false },
  importText: { type: String, default: '' },
})

const emit = defineEmits(['close', 'toggle-import', 'update:importText', 'import', 'insert'])
</script>

<template>
  <div class="sticker-panel-overlay" @click.self="emit('close')">
    <div class="sticker-panel">
      <div class="sticker-panel-header">
        <span>表情包</span>
        <button class="sticker-import-toggle" @click="emit('toggle-import')">
          {{ showImport ? '关闭' : '+ 导入' }}
        </button>
      </div>
      <div v-if="showImport" class="sticker-import-body">
        <textarea
          :value="importText"
          @input="emit('update:importText', $event.target.value)"
          class="sticker-import-textarea"
          placeholder='{"开心": "https://xxx/happy.png", "难过": "https://xxx/sad.png"}'
          rows="4"
        />
        <div class="sticker-import-actions">
          <button class="sticker-import-apply" @click="emit('import')">导入</button>
        </div>
      </div>
      <div class="sticker-grid">
        <div v-if="stickers.length === 0" class="sticker-empty">
          暂无表情，点击右上角导入添加
        </div>
        <div
          v-for="[desc, url] in stickers"
          :key="desc"
          class="sticker-item"
          @click="emit('insert', desc)"
        >
          <img :src="url" :alt="desc" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sticker-panel-overlay {
  position: absolute;
  bottom: 52px;
  left: 8px;
  right: 8px;
  z-index: 15;
}

.sticker-panel {
  background: #fff;
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  max-height: 280px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
}

.sticker-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.06);
  font-size: 0.85rem;
  font-weight: 600;
  color: #333;
}

.sticker-import-toggle {
  background: none;
  border: none;
  color: #fb6f92;
  font-size: 0.8rem;
  cursor: pointer;
}

.sticker-import-body {
  padding: 10px 14px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.06);
}

.sticker-import-textarea {
  width: 100%;
  background: #f8f8f8;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  padding: 8px 10px;
  color: #333;
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}

.sticker-import-textarea:focus {
  border-color: #ff8fab;
  background: #fff;
}

.sticker-import-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}

.sticker-import-apply {
  padding: 6px 16px;
  background: rgba(251, 111, 146, 0.15);
  border: 1px solid rgba(251, 111, 146, 0.3);
  border-radius: 10px;
  color: #fb6f92;
  font-size: 0.8rem;
  cursor: pointer;
}

.sticker-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  padding: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.sticker-item {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  border-radius: 12px;
  width: 60px;
  height: 60px;
  cursor: pointer;
  transition: background 0.15s;
  overflow: hidden;
  flex-shrink: 0;
}

.sticker-item:hover {
  background: #f0f0f0;
}

.sticker-item img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.sticker-empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 20px;
  font-size: 0.78rem;
  color: #bbb;
}

.platform-android.android-portrait .sticker-panel {
  background: #fff !important;
}

.platform-android.android-portrait .sticker-import-toggle {
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

.platform-android.android-portrait .sticker-item {
  background: #f5f5f5 !important;
}

.platform-android.android-portrait .sticker-import-textarea {
  background: #f8f8f8 !important;
  color: #333 !important;
}

.platform-android.android-portrait .sticker-import-apply {
  background: rgba(251, 111, 146, 0.2) !important;
}
</style>
