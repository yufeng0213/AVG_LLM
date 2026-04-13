<script setup>
/**
 * 日记面板组件
 * 显示日记列表和详情
 */
import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

const props = defineProps({
  diaryEntries: {
    type: Array,
    default: () => []
  },
  selectedDiary: {
    type: Object,
    default: null
  },
  mode: {
    type: String,
    default: 'list', // 'list' | 'detail'
  }
})

const emit = defineEmits([
  'close',
  'back',
  'select-diary'
])

function renderContent(text) {
  if (!text) return ''
  return marked.parse(text)
}

function handleClose() {
  emit('close')
}

function handleBack() {
  emit('back')
}

function handleSelectDiary(entry) {
  emit('select-diary', entry)
}

function formatDate(dateStr) {
  if (!dateStr) return '未知日期'
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24))
    if (diff === 0) return '今天'
    if (diff === 1) return '昨天'
    if (diff < 7) return `${diff} 天前`
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

function formatDetailDate(dateStr) {
  if (!dateStr) return '未知日期'
  try {
    return new Date(dateStr).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
  } catch {
    return dateStr
  }
}
</script>

<template>
  <section class="diary-panel">
    <header class="panel-header">
      <div class="header-left">
        <button v-if="mode === 'detail'" class="back-btn" @click="handleBack">←</button>
        <h3>{{ mode === 'detail' ? '日记详情' : '📔 日记' }}</h3>
      </div>
      <button class="close-btn" @click="handleClose">✕</button>
    </header>

    <!-- 列表模式 -->
    <div v-if="mode === 'list'" class="diary-content">
      <template v-if="diaryEntries.length > 0">
        <TransitionGroup name="diary-list">
          <div
            v-for="entry in diaryEntries"
            :key="entry.id"
            class="diary-item"
            @click="handleSelectDiary(entry)"
          >
            <div class="diary-item-left">
              <div class="diary-date">{{ formatDate(entry.date) }}</div>
              <div class="diary-title">{{ entry.title || '无标题' }}</div>
              <div class="diary-preview">{{ entry.content?.substring(0, 60) || '...' }}</div>
            </div>
            <div class="diary-arrow">›</div>
          </div>
        </TransitionGroup>
      </template>
      <div v-else class="empty-diary">
        <div class="empty-icon">📝</div>
        <p>还没有日记</p>
        <span class="empty-hint">和角色互动来写下回忆吧</span>
      </div>
    </div>

    <!-- 详情模式 -->
    <div v-else class="diary-detail">
      <template v-if="selectedDiary">
        <div class="diary-detail-header">
          <time class="diary-detail-date">{{ formatDetailDate(selectedDiary.date) }}</time>
          <h3 class="diary-detail-title">{{ selectedDiary.title || '无题' }}</h3>
        </div>
        <div class="diary-detail-body">
          <div class="diary-detail-text" v-html="renderContent(selectedDiary.content || selectedDiary.text || '暂无内容')"></div>
        </div>
      </template>
      <div v-else class="empty-diary">
        <p>请选择一篇日记</p>
      </div>
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
  background: linear-gradient(180deg, rgba(30, 30, 35, 0.92) 0%, rgba(20, 20, 25, 0.96) 100%);
  backdrop-filter: blur(40px) saturate(1.8);
  -webkit-backdrop-filter: blur(40px) saturate(1.8);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* Header */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
}

.back-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 18px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.7);
  width: 30px;
  height: 30px;
  min-width: 30px;
  min-height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s ease;
  flex-shrink: 0;
  line-height: 1;
}

.back-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.12);
}

.close-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 18px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.6);
  width: 30px;
  height: 30px;
  min-width: 30px;
  min-height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.close-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.12);
}

/* Content */
.diary-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.diary-content::-webkit-scrollbar {
  width: 4px;
}

.diary-content::-webkit-scrollbar-track {
  background: transparent;
}

.diary-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

/* Diary item */
.diary-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px;
  margin-bottom: 8px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.diary-item:hover {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
  border-color: rgba(255, 255, 255, 0.12);
  transform: translateY(-1px);
}

.diary-item:active {
  transform: translateY(0);
}

.diary-item-left {
  flex: 1;
  min-width: 0;
}

.diary-date {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  margin-bottom: 4px;
  font-weight: 500;
}

.diary-title {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.diary-preview {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.diary-arrow {
  font-size: 22px;
  color: rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
  line-height: 1;
  transition: all 0.2s ease;
}

.diary-item:hover .diary-arrow {
  color: rgba(255, 255, 255, 0.4);
  transform: translateX(2px);
}

/* Transitions */
.diary-list-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.diary-list-leave-active {
  transition: all 0.2s ease;
}

.diary-list-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.diary-list-leave-to {
  opacity: 0;
}

/* Empty state */
.empty-diary {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 200px;
  color: rgba(255, 255, 255, 0.3);
}

.empty-icon {
  font-size: 48px;
  opacity: 0.4;
  filter: grayscale(0.5);
}

.empty-diary p {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.4);
}

.empty-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.2);
}

/* Detail mode */
.diary-detail {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.diary-detail::-webkit-scrollbar {
  width: 4px;
}

.diary-detail::-webkit-scrollbar-track {
  background: transparent;
}

.diary-detail::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.diary-detail-header {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.diary-detail-date {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
  margin-bottom: 8px;
  font-weight: 500;
}

.diary-detail-title {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.4;
}

.diary-detail-body {
  padding: 4px 0;
}

.diary-detail-text {
  font-size: 15px;
  line-height: 1.9;
  color: rgba(255, 255, 255, 0.75);
  white-space: normal;
  word-break: break-word;
  margin: 0;
}

.diary-detail-text :deep(p) {
  margin: 10px 0;
}

.diary-detail-text :deep(p:first-child) {
  margin-top: 0;
}

.diary-detail-text :deep(p:last-child) {
  margin-bottom: 0;
}

.diary-detail-text :deep(strong) {
  font-weight: 700;
  color: rgba(255, 255, 255, 0.95);
}

.diary-detail-text :deep(em) {
  font-style: italic;
  color: rgba(255, 255, 255, 0.6);
}

.diary-detail-text :deep(code) {
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  font-size: 0.85em;
  font-family: var(--font-mono, 'Courier New', monospace);
}

.diary-detail-text :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 14px;
  border-left: 3px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0 6px 6px 0;
  color: rgba(255, 255, 255, 0.6);
}

.diary-detail-text :deep(h1),
.diary-detail-text :deep(h2),
.diary-detail-text :deep(h3) {
  margin: 14px 0 6px;
  font-weight: 700;
  line-height: 1.3;
}

.diary-detail-text :deep(h1) { font-size: 1.2em; }
.diary-detail-text :deep(h2) { font-size: 1.1em; }
.diary-detail-text :deep(h3) { font-size: 1.05em; }

.diary-detail-text :deep(hr) {
  margin: 14px 0;
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.diary-detail-text :deep(ul),
.diary-detail-text :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

/* Android竖屏适配 */
.platform-android.android-portrait .close-btn,
.platform-android.android-portrait .back-btn {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  font-size: 20px !important;
}
</style>
