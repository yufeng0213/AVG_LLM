<script setup>
import './MainStoryEntry.css'
import { ref } from 'vue'
import { loadWorldBooks, getActiveWorldBookId, setActiveWorldBookId } from '../../../src/worldbook/worldBookStore.js'
import { getEnabledNarratorProfiles, loadNarratorProfiles } from '../../../plugins/narrator/narratorStore.js'

const emit = defineEmits(['back', 'start-game', 'load-save'])

// 状态：'menu' | 'worldbook-select' | 'save-list'
const currentView = ref('menu')

// 世界书选择
const worldBooks = ref([])
const selectedWorldBookId = ref('default_world_book')
const narratorProfiles = ref([])
const selectedNarratorId = ref('')

// 存档列表
const saveList = ref([])

const loadWorldBookList = async () => {
  worldBooks.value = await loadWorldBooks()
  selectedWorldBookId.value = await getActiveWorldBookId()
}

const loadNarratorList = async () => {
  const profiles = await loadNarratorProfiles()
  narratorProfiles.value = getEnabledNarratorProfiles(profiles)
}

const loadSaveList = () => {
  // 复用现有存档服务
  try {
    const raw = localStorage.getItem('avg_llm_save_list_v1')
    if (raw) {
      saveList.value = JSON.parse(raw)
    } else {
      saveList.value = []
    }
  } catch {
    saveList.value = []
  }
}

const handleNewGame = async () => {
  await loadWorldBookList()
  await loadNarratorList()
  selectedNarratorId.value = ''
  currentView.value = 'worldbook-select'
}

const handleSaveList = async () => {
  loadSaveList()
  currentView.value = 'save-list'
}

const confirmNewGame = () => {
  emit('start-game', {
    worldBookId: selectedWorldBookId.value,
    narratorId: selectedNarratorId.value || null,
  })
}

const handleLoadSave = (saveData) => {
  emit('load-save', saveData)
}
</script>

<template>
  <main class="main-story-entry">
    <!-- 返回按钮 -->
    <header class="story-entry-header">
      <button type="button" class="story-entry-back" @click="currentView === 'menu' ? emit('back') : currentView = 'menu'">
        <span class="back-icon">‹</span>
        <span class="back-label">返回</span>
      </button>
    </header>

    <!-- 主菜单视图 -->
    <section v-if="currentView === 'menu'" class="story-entry-menu">
      <h2 class="story-entry-title">📖 主线剧情</h2>
      <p class="story-entry-desc">选择开始新游戏或继续上次的旅程</p>

      <button type="button" class="story-primary-btn" @click="handleNewGame">
        <span class="primary-icon">🆕</span>
        <span class="primary-text">
          <span class="primary-main">新游戏</span>
          <span class="primary-sub">选择世界书，开始新的故事</span>
        </span>
      </button>

      <button type="button" class="story-secondary-btn" @click="handleSaveList">
        <span class="secondary-icon">💾</span>
        <span class="secondary-text">
          <span class="secondary-main">存档 / 读档</span>
          <span class="secondary-sub">继续上次的旅程</span>
        </span>
      </button>
    </section>

    <!-- 世界书选择视图 -->
    <section v-else-if="currentView === 'worldbook-select'" class="story-entry-worldbook">
      <h3 class="worldbook-select-title">选择世界书</h3>
      <p class="worldbook-select-desc">选择一本世界书作为新游戏的背景设定</p>

      <div class="worldbook-select-list">
        <button
          v-for="book in worldBooks"
          :key="book.id"
          type="button"
          class="worldbook-select-item"
          :class="{ selected: selectedWorldBookId === book.id }"
          @click="selectedWorldBookId = book.id"
        >
          <span class="book-indicator">{{ selectedWorldBookId === book.id ? '✓' : '' }}</span>
          <div class="book-info">
            <span class="book-title">{{ book.title }}</span>
            <span v-if="book.isDefault" class="book-badge">默认</span>
            <span class="book-summary">{{ book.summary || '暂无简介' }}</span>
          </div>
        </button>
      </div>

      <label class="worldbook-select-field">
        <span class="worldbook-select-label">本局叙事者（可选）</span>
        <select v-model="selectedNarratorId" class="worldbook-select-control">
          <option value="">使用世界书默认</option>
          <option v-for="profile in narratorProfiles" :key="profile.id" :value="profile.id">
            {{ profile.name }}
          </option>
        </select>
      </label>

      <div class="worldbook-select-actions">
        <button type="button" class="worldbook-action-btn cancel" @click="currentView = 'menu'">取消</button>
        <button type="button" class="worldbook-action-btn confirm" @click="confirmNewGame">开始新游戏</button>
      </div>
    </section>

    <!-- 存档列表视图 -->
    <section v-else-if="currentView === 'save-list'" class="story-entry-savelist">
      <h3 class="savelist-title">存档列表</h3>

      <div v-if="saveList.length === 0" class="savelist-empty">
        <p>暂无存档</p>
      </div>

      <div v-else class="savelist-list">
        <div
          v-for="save in saveList"
          :key="save.id || save.timestamp"
          class="savelist-item"
          @click="handleLoadSave(save)"
        >
          <div class="save-info">
            <span class="save-worldbook">{{ save.worldBookTitle || save.worldBookId || '未知世界书' }}</span>
            <span class="save-chapter">{{ save.chapter || '存档' }}</span>
            <span class="save-time">{{ new Date(save.timestamp).toLocaleString('zh-CN') }}</span>
          </div>
          <span class="save-arrow">›</span>
        </div>
      </div>
    </section>
  </main>
</template>
