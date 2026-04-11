<script setup>
/**
 * 日记面板组件
 * 显示日记列表和预览
 */

const props = defineProps({
  diaryEntries: {
    type: Array,
    default: () => []
  },
  selectedDiaryId: {
    type: [String, Number],
    default: null
  }
})

const emit = defineEmits([
  'close',
  'select-diary',
  'view-diary'
])

function handleClose() {
  emit('close')
}

function handleSelectDiary(entry) {
  emit('select-diary', entry)
}

function handleViewDiary(entry) {
  emit('view-diary', entry)
}

function formatDate(dateStr) {
  if (!dateStr) return '未知日期'
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN')
  } catch {
    return dateStr
  }
}
</script>

<template>
  <section class="diary-panel">
    <header class="panel-header">
      <h3>日记</h3>
      <button class="close-btn" @click="handleClose">✕</button>
    </header>

    <div class="diary-content" v-if="diaryEntries.length > 0">
      <div
        v-for="entry in diaryEntries"
        :key="entry.id"
        class="diary-item"
        :class="{ selected: selectedDiaryId === entry.id }"
        @click="handleSelectDiary(entry)"
      >
        <div class="diary-date">{{ formatDate(entry.date) }}</div>
        <div class="diary-title">{{ entry.title || '无标题' }}</div>
        <div class="diary-preview">{{ entry.preview || entry.content?.substring(0, 50) || '...' }}</div>
        <button class="view-btn" @click.stop="handleViewDiary(entry)">查看</button>
      </div>
    </div>

    <div v-else class="empty-diary">
      <p>还没有日记</p>
    </div>
  </section>
</template>

<style scoped>
.diary-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e0e0e0;
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #666;
  padding: 4px 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 28px;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:hover {
  color: #333;
  background: rgba(0, 0, 0, 0.06);
}

/* Android竖屏适配 */
.platform-android.android-portrait .close-btn {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  font-size: 1.2rem !important;
  padding: 0 !important;
  flex-shrink: 0 !important;
  box-sizing: border-box !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 50% !important;
}

.diary-content {
  flex: 1;
  overflow-y: auto;
}

.diary-item {
  padding: 12px;
  margin-bottom: 8px;
  background: #f8f9fa;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.diary-item:hover {
  background: #e9ecef;
}

.diary-item.selected {
  background: #e3f2fd;
  border: 1px solid #2196f3;
}

.diary-date {
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

.diary-title {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
}

.diary-preview {
  font-size: 12px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 8px;
}

.view-btn {
  padding: 6px 12px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.view-btn:hover {
  background: #388e3c;
}

.empty-diary {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
}
</style>
