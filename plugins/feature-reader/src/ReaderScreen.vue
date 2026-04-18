<script setup>
/**
 * ReaderScreen.vue - 书城 APP 入口
 * 管理书架、新建、阅读、目录、设置的视图切换。
 */
import { ref } from 'vue'
import BookShelfView from './components/reader/BookShelfView.vue'
import NewStoryView from './components/reader/NewStoryView.vue'
import ReaderView from './components/reader/ReaderView.vue'
import ChapterListView from './components/reader/ChapterListView.vue'
import ReaderSettingsView from './components/reader/ReaderSettingsView.vue'

const emit = defineEmits(['back'])

const currentView = ref('shelf') // shelf | new | reader | chapters | settings
const activeStory = ref(null)
const settingsKey = ref(0) // 强制刷新设置
const shelfKey = ref(0) // 强制刷新书架

function goHome() {
  currentView.value = 'shelf'
  activeStory.value = null
}

function openStory(story) {
  activeStory.value = story
  currentView.value = 'reader'
}

function openNewStory(worldBookId) {
  activeStory.value = { worldBookId }
  currentView.value = 'new'
}

function openChapters(story) {
  activeStory.value = story
  currentView.value = 'chapters'
}

function openSettings() {
  settingsKey.value++
  currentView.value = 'settings'
}

function openChapterWithIndex(idx) {
  activeStory.value = { ...activeStory.value, chapterIndex: idx }
  currentView.value = 'reader'
}

function onStorySaved(story) {
  // 新建故事完成后进入阅读
  activeStory.value = story
  currentView.value = 'reader'
}

function onStoryDeleted() {
  // 删除故事后刷新书架
  shelfKey.value++
}
</script>

<template>
  <div class="reader-app">
    <!-- 顶栏 -->
    <div class="reader-header">
      <button
        v-if="currentView !== 'shelf'"
        class="reader-back-btn"
        @click="goHome"
      >
        ← 返回
      </button>
      <span v-else class="reader-back-btn" @click="emit('back')">← 关闭</span>
      <span class="reader-title">📜 书城</span>
      <div class="reader-header-actions">
        <button v-if="currentView === 'shelf'" class="reader-icon-btn" @click="openSettings">⚙️</button>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="reader-content">
      <BookShelfView
        v-if="currentView === 'shelf'"
        :key="shelfKey"
        @open-story="openStory"
        @open-new-story="openNewStory"
        @open-chapters="openChapters"
        @story-deleted="onStoryDeleted"
      />

      <NewStoryView
        v-if="currentView === 'new'"
        :world-book-id="activeStory?.worldBookId"
        @back="goHome"
        @story-created="onStorySaved"
      />

      <ReaderView
        v-if="currentView === 'reader' && activeStory?.id"
        :story="activeStory"
        @back="goHome"
        @open-chapters="openChapters"
      />

      <ChapterListView
        v-if="currentView === 'chapters' && activeStory?.id"
        :story="activeStory"
        @back="goHome"
        @open-chapter="openChapterWithIndex"
      />

      <ReaderSettingsView
        v-if="currentView === 'settings'"
        :key="settingsKey"
        @back="goHome"
      />
    </div>
  </div>
</template>

<style scoped>
.reader-app {
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

.reader-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: var(--reader-header-bg, rgba(255, 255, 255, 0.05));
  border-bottom: 1px solid var(--reader-border, rgba(255, 255, 255, 0.08));
  flex-shrink: 0;
}

.reader-back-btn {
  background: none;
  border: none;
  color: var(--reader-secondary, #8b9dc3);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.reader-back-btn:hover {
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.1));
}

.reader-title {
  flex: 1;
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
  color: var(--reader-text, #fff);
}

.reader-header-actions {
  display: flex;
  gap: 8px;
}

.reader-icon-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  color: var(--reader-secondary, #8b9dc3);
}

.reader-icon-btn:hover {
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.1));
}

.reader-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

  .platform-android.android-portrait .reader-back-btn {
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
