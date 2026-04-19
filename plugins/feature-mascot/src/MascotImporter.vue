<script setup>
import { ref } from 'vue'

const emit = defineEmits(['import', 'close'])
const fileInputRef = ref(null)
const isImporting = ref(false)

function triggerFilePicker() {
  fileInputRef.value?.click()
}

async function handleFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return

  const sizeKB = Math.round(file.size / 1024)
  const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
  if (file.size > 2 * 1024 * 1024) {
    if (!confirm(`GIF 文件 ${sizeMB}MB 超过推荐值 2MB，可能导致内存问题，是否继续？`)) {
      e.target.value = ''
      return
    }
  }

  isImporting.value = true
  try {
    emit('import', file)
    emit('close')
  } catch (err) {
    alert(err.message || '导入失败')
  } finally {
    isImporting.value = false
    e.target.value = ''
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="importer-fade">
      <div class="mascot-importer-overlay" @click="emit('close')">
        <div class="mascot-importer-panel" @click.stop>
          <h3>选择 GIF 文件</h3>
          <p class="hint">推荐大小不超过 2MB</p>
          <input
            ref="fileInputRef"
            type="file"
            accept=".gif,image/gif"
            class="file-input-hidden"
            @change="handleFileChange"
          />
          <button :disabled="isImporting" class="btn-primary" @click="triggerFilePicker">
            {{ isImporting ? '导入中...' : '选择文件' }}
          </button>
          <button class="btn-cancel" @click="emit('close')">取消</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mascot-importer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 20000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mascot-importer-panel {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  width: 280px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.mascot-importer-panel h3 {
  margin: 0 0 8px;
  font-size: 16px;
  color: #333;
}

.hint {
  margin: 0 0 20px;
  font-size: 13px;
  color: #999;
}

.file-input-hidden {
  display: none;
}

.btn-primary {
  display: block;
  width: 100%;
  padding: 10px;
  background: #4a9eff;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  cursor: pointer;
  margin-bottom: 8px;
}

.btn-primary:hover {
  background: #3a8eef;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-cancel {
  display: block;
  width: 100%;
  padding: 10px;
  background: transparent;
  color: #999;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 15px;
  cursor: pointer;
}

.btn-cancel:hover {
  background: rgba(0, 0, 0, 0.02);
  color: #666;
}

.importer-fade-enter-active,
.importer-fade-leave-active {
  transition: opacity 0.2s ease;
}

.importer-fade-enter-from,
.importer-fade-leave-to {
  opacity: 0;
}
</style>
