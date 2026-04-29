<script setup>
/**
 * ScrapbookScreen.vue - 手帐 APP 入口
 * 管理书架、新建、编辑器的视图切换。
 */
import { ref } from 'vue'
import ScrapbookListView from './components/ScrapbookListView.vue'
import ScrapbookNewView from './components/ScrapbookNewView.vue'
import ScrapbookEditorView from './components/ScrapbookEditorView.vue'

const emit = defineEmits(['back'])

const currentView = ref('shelf') // shelf | new | editor
const activeBook = ref(null)
const listKey = ref(0)

function goHome() {
  currentView.value = 'shelf'
  activeBook.value = null
  listKey.value++
}

function openBook(book) {
  activeBook.value = book
  currentView.value = 'editor'
}

function onBookCreated(book) {
  activeBook.value = book
  currentView.value = 'editor'
}
</script>

<template>
  <div class="scrapbook-app">
    <div class="scrapbook-header">
      <button
        v-if="currentView !== 'shelf'"
        class="scrapbook-back-btn"
        @click="goHome"
      >
        ← 返回
      </button>
      <span v-else class="scrapbook-back-btn" @click="emit('back')">← 关闭</span>
      <span class="scrapbook-title">📓 手帐</span>
    </div>

    <div class="scrapbook-content">
      <ScrapbookListView
        v-if="currentView === 'shelf'"
        :key="listKey"
        @open-book="openBook"
        @new-book="() => (currentView = 'new')"
      />

      <ScrapbookNewView
        v-if="currentView === 'new'"
        @back="goHome"
        @save="onBookCreated"
      />

      <ScrapbookEditorView
        v-if="currentView === 'editor' && activeBook?.id"
        :book="activeBook"
        @back="goHome"
        @saved="goHome"
      />
    </div>
  </div>
</template>

<style scoped>
.scrapbook-app {
  position: fixed;
  inset: 0;
  padding-top: var(--safe-area-inset-top, 0px);
  padding-bottom: var(--safe-area-inset-bottom, 0px);
  z-index: 10001;
  display: flex;
  flex-direction: column;
  background: var(--reader-bg, #0a0a1a);
  color: var(--reader-text, #fff);
  font-family: var(--font-body, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  overflow: hidden;
}

.scrapbook-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: var(--reader-header-bg, rgba(255, 255, 255, 0.05));
  border-bottom: 1px solid var(--reader-border, rgba(255, 255, 255, 0.08));
  flex-shrink: 0;
}

.scrapbook-back-btn {
  background: none;
  border: none;
  color: var(--reader-secondary, #8b9dc3);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.scrapbook-back-btn:hover {
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.1));
}

.scrapbook-title {
  flex: 1;
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
  color: var(--reader-text, #fff);
}

.scrapbook-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.platform-android.android-portrait .scrapbook-back-btn {
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
