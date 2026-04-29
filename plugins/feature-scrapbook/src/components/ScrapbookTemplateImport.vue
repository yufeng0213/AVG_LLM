<script setup>
/**
 * ScrapbookTemplateImport.vue - 模板文件夹导入
 * 通过 input.webkitdirectory 批量导入图片文件到贴纸库。
 */
import { ref } from 'vue'
import { importFolderFiles } from '../composables/useStickerData.js'

const emit = defineEmits(['close', 'templates-imported'])

const importing = ref(false)
const importMsg = ref('')

async function triggerFolderImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.webkitdirectory = true
  input.multiple = true
  input.accept = '.png,.jpg,.jpeg,.webp,.gif,.svg'

  input.onchange = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    importing.value = true
    importMsg.value = `正在导入 ${files.length} 个文件...`

    try {
      const templates = await importFolderFiles(files)
      importMsg.value = `成功导入 ${templates.length} 个贴纸`
      emit('templates-imported', templates)
      setTimeout(() => { emit('close') }, 1500)
    } catch (e) {
      importMsg.value = '导入失败: ' + (e.message || '未知错误')
    } finally {
      importing.value = false
    }
  }

  input.click()
}
</script>

<template>
  <div class="import-overlay" @click.self="emit('close')">
    <div class="import-panel">
      <div class="import-header">
        <span>导入贴纸</span>
        <button class="import-close" @click="emit('close')">×</button>
      </div>

      <div class="import-body">
        <div class="import-zone" @click="triggerFolderImport">
          <div class="import-icon">📁</div>
          <p class="import-text">选择文件夹</p>
          <p class="import-hint">支持 PNG、JPG、WebP、GIF、SVG</p>
        </div>

        <div v-if="importMsg" :class="['import-msg', { importing }]">
          {{ importMsg }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.import-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10002;
  display: flex;
  align-items: center;
  justify-content: center;
}

.import-panel {
  background: var(--reader-bg, #0a0a1a);
  border-radius: 16px;
  width: 90%;
  max-width: 400px;
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  overflow: hidden;
}

.import-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--reader-border, rgba(255, 255, 255, 0.08));
  font-weight: 600;
}

.import-close {
  background: none;
  border: none;
  color: var(--reader-text, #fff);
  font-size: 1.4rem;
  cursor: pointer;
  padding: 0 4px;
}

.import-body {
  padding: 20px 16px;
}

.import-zone {
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.04));
  border: 2px dashed var(--reader-border, rgba(255, 255, 255, 0.15));
  border-radius: 12px;
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.import-zone:hover {
  border-color: var(--reader-accent-start, #667eea);
  background: rgba(255, 255, 255, 0.06);
}

.import-icon {
  font-size: 3rem;
  margin-bottom: 12px;
}

.import-text {
  font-size: 1rem;
  font-weight: 600;
  color: var(--reader-text, #fff);
  margin: 0 0 4px;
}

.import-hint {
  font-size: 0.75rem;
  color: var(--reader-secondary, #8b9dc3);
  margin: 0;
}

.import-msg {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.85rem;
  text-align: center;
}

.import-msg:not(.importing) {
  background: rgba(74, 222, 128, 0.1);
  color: #4ade80;
  border: 1px solid rgba(74, 222, 128, 0.3);
}

.import-msg.importing {
  background: rgba(102, 126, 234, 0.1);
  color: #667eea;
  border: 1px solid rgba(102, 126, 234, 0.3);
}
</style>
