<script setup>
/**
 * PronunciationScreen.vue - 口语发音学习主屏幕
 * 管理首页、课程、笔记本、设置的视图切换。
 */
import { ref } from 'vue'
import PronunciationHomeView from './components/PronunciationHomeView.vue'
import PronunciationLessonView from './components/PronunciationLessonView.vue'
import PronunciationNotebookView from './components/PronunciationNotebookView.vue'
import PronunciationSettingsView from './components/PronunciationSettingsView.vue'

const emit = defineEmits(['back'])

const currentView = ref('home') // home | lesson | notebook | settings
const activeLesson = ref(null)
const activeNotebookEntry = ref(null)
const lessonKey = ref(0) // 强制刷新课程视图

function goHome() {
  currentView.value = 'home'
  activeLesson.value = null
  activeNotebookEntry.value = null
}

function openLesson(lesson) {
  activeLesson.value = lesson
  lessonKey.value++
  currentView.value = 'lesson'
}

function openNotebook() {
  currentView.value = 'notebook'
}

function openSettings() {
  currentView.value = 'settings'
}

function openNotebookEntry(entry) {
  activeNotebookEntry.value = entry
  // 从笔记本加载课程
  activeLesson.value = {
    id: entry.id,
    language: entry.language,
    topic: entry.topic,
    character: entry.character,
    worldBook: entry.worldBook,
    intro: entry.intro || '',
    items: entry.items || [],
    fromNotebook: true,
  }
  lessonKey.value++
  currentView.value = 'lesson'
}

function onLessonSaved(entry) {
  // 课程保存后返回首页
  activeLesson.value = null
  goHome()
}
</script>

<template>
  <div class="pronunciation-app">
    <!-- 顶栏 -->
    <div class="pron-header">
      <button
        v-if="currentView !== 'home'"
        class="pron-back-btn"
        @click="goHome"
      >
        ← 返回
      </button>
      <span v-else class="pron-back-btn" @click="emit('back')">← 关闭</span>
      <span class="pron-title">🎙️ 发音</span>
      <div class="pron-header-actions">
        <button v-if="currentView === 'home'" class="pron-icon-btn" @click="openNotebook">📒</button>
        <button v-if="currentView === 'home'" class="pron-icon-btn" @click="openSettings">⚙️</button>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="pron-content">
      <PronunciationHomeView
        v-if="currentView === 'home'"
        @generate-lesson="openLesson"
        @open-notebook="openNotebook"
        @open-settings="openSettings"
      />

      <PronunciationLessonView
        v-if="currentView === 'lesson' && activeLesson"
        :key="lessonKey"
        :lesson="activeLesson"
        @back="goHome"
        @saved="onLessonSaved"
      />

      <PronunciationNotebookView
        v-if="currentView === 'notebook'"
        @back="goHome"
        @open-entry="openNotebookEntry"
      />

      <PronunciationSettingsView
        v-if="currentView === 'settings'"
        @back="goHome"
      />
    </div>
  </div>
</template>

<style scoped>
.pronunciation-app {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  flex-direction: column;
  background: #0f0f1a;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
}

.pron-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.pron-back-btn {
  background: none;
  border: none;
  color: #8b9dc3;
  font-size: 0.9rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.pron-back-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.pron-title {
  flex: 1;
  text-align: center;
  font-size: 1rem;
  font-weight: 600;
}

.pron-header-actions {
  display: flex;
  gap: 8px;
}

.pron-icon-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
}

.pron-icon-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.pron-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

  .platform-android.android-portrait .pron-back-btn,
  .platform-android.android-portrait .pron-icon-btn {
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
