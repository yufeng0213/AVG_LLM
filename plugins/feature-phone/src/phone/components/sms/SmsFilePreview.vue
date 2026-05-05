/**
 * SmsFilePreview.vue — 文件预览 + 打印（浅色主题）
 */
<template>
  <div v-if="visible" class="file-preview-overlay" @click.self="close">
    <div class="file-preview-modal">
      <div class="file-preview-header">
        <span class="file-preview-title">{{ file?.fileName || '文件预览' }}</span>
        <button class="file-preview-close" @click="close">&#10005;</button>
      </div>

      <div class="file-preview-body">
        <iframe
          ref="previewFrame"
          class="file-preview-frame"
          :srcdoc="renderedHtml"
        />
      </div>

      <div class="file-preview-footer">
        <button class="file-print-btn" @click="printFile">
          &#x1F5A8;&#xFE0F; 打印
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  file: { type: Object, default: null },
})

const emit = defineEmits(['close'])
const previewFrame = ref(null)

const renderedHtml = computed(() => {
  if (!props.file?.templateHtml || !props.file?.variables) return ''
  let html = props.file.templateHtml
  for (const [key, value] of Object.entries(props.file.variables)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
    html = html.replace(placeholder, String(value || ''))
  }
  return html
})

function close() {
  emit('close')
}

function printFile() {
  const frame = previewFrame.value
  if (!frame) return
  try {
    const iframeDoc = frame.contentDocument
    if (iframeDoc) {
      const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">${iframeDoc.head.innerHTML}</head><body>${iframeDoc.body.innerHTML}</body></html>`
      import('../../../../../../src/native/cardImportPlugin.js').then(({ printHtmlNative }) => {
        printHtmlNative(fullHtml, props.file?.fileName || '打印文件').catch(e => {
          console.warn('[print] native print failed:', e)
          window.print()
        })
      }).catch(() => {
        window.print()
      })
    }
  } catch (e) {
    console.warn('[print] get iframe content failed:', e)
    window.print()
  }
}
</script>

<style scoped>
.file-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.file-preview-modal {
  background: #fff;
  border-radius: 16px;
  width: min(500px, 92vw);
  height: min(80vh, 700px);
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.file-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
}

.file-preview-title {
  font-size: 15px;
  font-weight: 600;
  color: #222;
}

.file-preview-close {
  background: none;
  border: none;
  color: #999;
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
}

.file-preview-close:hover {
  color: #555;
}

.file-preview-body {
  flex: 1;
  overflow: hidden;
  background: #f5f0e8;
}

.file-preview-frame {
  width: 100%;
  height: 100%;
  border: none;
}

.file-preview-footer {
  padding: 12px 16px;
  border-top: 0.5px solid rgba(0, 0, 0, 0.06);
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}

.file-print-btn {
  background: linear-gradient(135deg, #ff8fab, #fb6f92);
  border: none;
  border-radius: 12px;
  padding: 10px 32px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(255, 143, 171, 0.3);
}

.file-print-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 16px rgba(255, 143, 171, 0.4);
}

  .platform-android.android-portrait .file-preview-close {
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
