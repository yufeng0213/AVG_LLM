<template>
  <div class="world-memory-app">
    <!-- Header -->
    <div v-if="!selectedBookId" class="wm-header">
      <button class="wm-back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <span class="wm-title">
        <span class="wm-title-glow"></span>
        世界记忆
      </span>
      <div class="wm-header-spacer"></div>
    </div>

    <!-- Worldbook Selector -->
    <div v-if="!selectedBookId" class="wm-book-list">
      <div v-if="books.length === 0" class="empty">暂无世界书</div>
      <div
        v-for="book in books"
        :key="book.id"
        class="wm-book-card"
        @click="selectBook(book.id)"
      >
        <div class="book-name">{{ book.title }}</div>
        <div class="book-meta">{{ book.summary?.slice(0, 40) || '无概述' }}</div>
        <div class="book-meta" style="margin-top: 4px;">
          {{ getBookEventCount(book.id) }} 事件 · {{ getBookMemoryCount(book.id) }} 角色记忆
        </div>
      </div>

      <!-- 提取设置 -->
      <div class="wm-config-card">
        <div class="config-title">记忆提取设置</div>
        <div class="config-row">
          <label class="config-label">批量提取阈值（对话段数）</label>
          <div class="config-input-wrap">
            <input type="number" v-model.number="batchSize" min="1" max="30" class="config-input" />
            <button class="config-save-btn" @click="saveBatchSize">保存</button>
          </div>
          <div class="config-desc">攒够指定段数的新对话后自动触发记忆提取</div>
        </div>
      </div>
    </div>

    <!-- Memory Viewer -->
    <MemoryViewer
      v-if="selectedBookId && selectedBook && worldMemory"
      :world-book="selectedBook"
      :world-memory="worldMemory"
      @back="selectedBookId = null; selectedBook = null; worldMemory = null"
      @refresh="loadMemory"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { loadWorldBooks } from '../../../src/worldbook/worldBookStore.js'
import { getWorldMemory, getExtractionConfig, saveExtractionConfig } from '../../../src/memory/worldMemoryStore.js'
import MemoryViewer from './components/MemoryViewer.vue'

defineProps({
  icon: String,
  name: String,
})

const emit = defineEmits(['back'])

const books = ref([])
const selectedBookId = ref(null)
const selectedBook = ref(null)
const worldMemory = ref(null)
const bookStats = ref({})

// 提取配置
const batchSize = ref(5)

onMounted(async () => {
  const cfg = await getExtractionConfig()
  batchSize.value = cfg.batchSize ?? 5

  books.value = await loadWorldBooks()
  // Load stats for each book
  for (const book of books.value) {
    const mem = await getWorldMemory(book.id)
    bookStats.value[book.id] = {
      events: (mem.events || []).length,
      memories: Object.values(mem.characterMemories || {}).reduce((s, a) => s + a.length, 0),
    }
  }
})

async function saveBatchSize() {
  const v = Math.max(1, Math.min(30, batchSize.value))
  batchSize.value = v
  await saveExtractionConfig({ batchSize: v })
}

function goBack() {
  if (selectedBookId.value) {
    selectedBookId.value = null
    selectedBook.value = null
    worldMemory.value = null
  } else {
    emit('back')
  }
}

async function selectBook(bookId) {
  selectedBookId.value = bookId
  selectedBook.value = books.value.find(b => b.id === bookId)
  worldMemory.value = await getWorldMemory(bookId)
}

async function loadMemory() {
  if (!selectedBookId.value) return
  worldMemory.value = await getWorldMemory(selectedBookId.value)
  // Update stats too
  const mem = worldMemory.value
  bookStats.value[selectedBookId.value] = {
    events: (mem.events || []).length,
    memories: Object.values(mem.characterMemories || {}).reduce((s, a) => s + a.length, 0),
  }
}

function getBookEventCount(id) {
  return bookStats.value[id]?.events || 0
}

function getBookMemoryCount(id) {
  return bookStats.value[id]?.memories || 0
}
</script>

<style scoped>
.world-memory-app {
  position: fixed;
  inset: 0;
  height: 100dvh;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1a2e;
  color: #fff;
  z-index: 9999;
}

.wm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: clamp(10px, 2vw, 16px) clamp(12px, 3vw, 20px);
  padding-top: max(clamp(10px, 2vw, 16px), var(--safe-area-inset-top, 16px));
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}

.wm-back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
  padding: 6px 14px;
  border-radius: 9999px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.wm-back-btn:hover {
  background: rgba(139, 133, 242, 0.2);
  border-color: rgba(139, 133, 242, 0.4);
}

.wm-back-btn svg {
  width: 16px;
  height: 16px;
}

.wm-title {
  font-size: clamp(16px, 3.5vw, 20px);
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.5px;
}

.wm-title-glow {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8b85f2;
  box-shadow: 0 0 8px rgba(139, 133, 242, 0.6);
  animation: wm-glow-pulse 2s ease-in-out infinite;
}

@keyframes wm-glow-pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}

.wm-header-spacer {
  width: 60px;
  flex-shrink: 0;
}

.wm-book-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wm-book-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.wm-book-card:hover {
  background: rgba(255, 255, 255, 0.1);
}

.wm-book-card:active {
  background: rgba(255, 255, 255, 0.15);
}

.book-name {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}

.book-meta {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.3;
}

.empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
  padding: 40px 0;
}

.wm-config-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
  margin-top: 8px;
}

.config-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}

.config-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.config-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.config-input-wrap {
  display: flex;
  gap: 8px;
  align-items: center;
}

.config-input {
  width: 64px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.3);
  color: #fff;
  font-size: 14px;
  text-align: center;
}

.config-save-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: rgba(99, 102, 241, 0.6);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.config-save-btn:active {
  background: rgba(99, 102, 241, 0.9);
}

.config-desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
}




  .platform-android.android-portrait .wm-header {
    background: rgba(0, 0, 0, 0.85) !important;
  }

  .platform-android.android-portrait .config-save-btn,
  .platform-android.android-portrait .wm-back-btn {
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
