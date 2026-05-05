<script setup>
/**
 * ReaderScreen.vue - 书城 APP 入口
 * 底部 tab 导航容器：书城/书架/发现/我的
 */
import { ref } from 'vue'
import ReaderTabBar from './ReaderTabBar.vue'
import BookStoreHome from './BookStoreHome.vue'
import BookShelfView from './components/reader/BookShelfView.vue'
import NewStoryView from './components/reader/NewStoryView.vue'
import BookImportView from './components/reader/BookImportView.vue'
import BookDetail from './BookDetail.vue'
import ReaderView from './components/reader/ReaderView.vue'
import ChapterListView from './components/reader/ChapterListView.vue'
import ReaderSettingsView from './components/reader/ReaderSettingsView.vue'
import RankingView from './RankingView.vue'
import CategoryView from './CategoryView.vue'
import NewBooksScreen from './NewBooksScreen.vue'

const emit = defineEmits(['back'])

const currentTab = ref('store')
const subView = ref(null)
const activeStory = ref(null)
const settingsKey = ref(0)
const shelfKey = ref(0)
const newStoryKey = ref(0)
const importKey = ref(0)

function goHome() {
  subView.value = null
  activeStory.value = null
}

function openStory(story) {
  activeStory.value = story
  subView.value = 'reader'
}

function openDetail(story) {
  activeStory.value = story
  subView.value = 'detail'
}

function openNewStory(worldBookId) {
  activeStory.value = { worldBookId }
  newStoryKey.value++
  subView.value = 'new'
}

function openChapters(story) {
  activeStory.value = story
  subView.value = 'chapters'
}

function openSettings() {
  settingsKey.value++
  subView.value = 'settings'
}

function openRanking() {
  subView.value = 'ranking'
}

function openCategory() {
  subView.value = 'category'
}

function openNewBooks() {
  subView.value = 'newBooks'
}

function openChapterWithIndex(idx) {
  activeStory.value = { ...activeStory.value, chapterIndex: idx }
  subView.value = 'reader'
}

function openChapterWithOutline(idx, outlineTitle) {
  activeStory.value = { ...activeStory.value, chapterIndex: idx, outlineTitle: outlineTitle }
  subView.value = 'reader'
}

function onStorySaved(story) {
  activeStory.value = story
  subView.value = 'reader'
}

function onStoryDeleted() {
  shelfKey.value++
}

function openBookImport() {
  importKey.value++
  subView.value = 'import'
}

function onStoryImported(story) {
  shelfKey.value++
  activeStory.value = story
  subView.value = 'reader'
}

function showSubView() {
  return subView.value !== null
}

function onTabChange(tab) {
  if (tab === 'mine') {
    settingsKey.value++
    subView.value = 'settings'
  } else {
    currentTab.value = tab
  }
}
</script>

<template>
  <div class="reader-app">
    <!-- 子视图（绝对定位覆盖整个内容区） -->
    <RankingView
      v-if="subView === 'ranking'"
      class="sub-view"
      @back="goHome"
      @open-detail="openDetail"
    />

    <CategoryView
      v-if="subView === 'category'"
      class="sub-view"
      @back="goHome"
      @open-detail="openDetail"
    />

    <NewBooksScreen
      v-if="subView === 'newBooks'"
      class="sub-view"
      @back="goHome"
      @open-detail="openDetail"
    />

    <BookDetail
      v-if="subView === 'detail'"
      class="sub-view"
      :story="activeStory"
      @back="goHome"
      @open-reader="openStory"
      @open-chapters="openChapters"
    />

    <ReaderView
      v-if="subView === 'reader' && activeStory?.id"
      class="sub-view"
      :story="activeStory"
      @back="goHome"
      @open-chapters="openChapters"
    />

    <ChapterListView
      v-if="subView === 'chapters' && activeStory?.id"
      class="sub-view"
      :story="activeStory"
      @back="goHome"
      @open-chapter="openChapterWithIndex"
      @open-chapter-outline="openChapterWithOutline"
    />

    <NewStoryView
      v-if="subView === 'new'"
      class="sub-view"
      :key="newStoryKey"
      :world-book-id="activeStory?.worldBookId"
      @back="goHome"
      @story-created="onStorySaved"
    />

    <BookImportView
      v-if="subView === 'import'"
      class="sub-view"
      :key="importKey"
      @back="goHome"
      @story-imported="onStoryImported"
    />

    <ReaderSettingsView
      v-if="subView === 'settings'"
      class="sub-view"
      :key="settingsKey"
      @back="goHome"
    />

    <!-- Tab 内容 -->
    <KeepAlive>
      <BookStoreHome
        v-if="currentTab === 'store' && !showSubView()"
        class="sub-view"
        @back="emit('back')"
        @open-detail="openDetail"
        @open-shelf="currentTab = 'shelf'"
        @open-settings="openSettings"
        @open-ranking="openRanking"
        @open-category="openCategory"
        @open-new-books="openNewBooks"
      />
    </KeepAlive>

    <BookShelfView
      v-if="currentTab === 'shelf' && !showSubView()"
      class="sub-view"
      :key="shelfKey"
      @open-story="openStory"
      @open-new-story="openNewStory"
      @open-book-import="openBookImport"
      @open-chapters="openChapters"
      @open-settings="openSettings"
      @story-deleted="onStoryDeleted"
    />

    <div v-if="currentTab === 'discover' && !showSubView()" class="placeholder-page">
      <div class="placeholder-icon">✨</div>
      <p class="placeholder-text">发现</p>
      <p class="placeholder-hint">功能开发中...</p>
    </div>

    <!-- 底部导航（子视图时隐藏） -->
    <ReaderTabBar v-if="!showSubView()" v-model="currentTab" @update:model-value="onTabChange" />
  </div>
</template>

<style scoped>
.reader-app {
  position: fixed;
  inset: 0;
  padding-top: var(--safe-area-inset-top, 0px);
  z-index: 10001;
  display: flex;
  flex-direction: column;
  background: #f5f0ff;
  color: #2d2040;
  font-family: var(--font-body, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  user-select: text !important;
  -webkit-user-select: text !important;
}

.reader-app :deep(.reader-content),
.reader-app :deep(.reader-content *) {
  user-select: text !important;
  -webkit-user-select: text !important;
}

/* 子视图容器：flex 1 占满 tab bar 上方的空间 */
.reader-app > .sub-view {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  user-select: text !important;
  -webkit-user-select: text !important;
}

.placeholder-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #f5f0ff, #ede4ff);
}

.placeholder-icon {
  font-size: 3rem;
  margin-bottom: 12px;
}

.placeholder-text {
  font-size: 1.1rem;
  font-weight: 600;
  color: #2d2040;
  margin-bottom: 6px;
}

.placeholder-hint {
  font-size: 0.85rem;
  color: #8b7ea8;
}
</style>
