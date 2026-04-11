<script setup>
import { onMounted, ref } from 'vue'
import { loadWorldBooks, getActiveWorldBookId } from '../worldbook/worldBookStore'
import { getEnabledNarratorProfiles, loadNarratorProfiles } from '../narrator/narratorStore'
import { resolveStartMenuAction } from '../features/startMenuRegistry'

const props = defineProps({
  menuItems: {
    type: Array,
    default: () => [],
  },
  menuActionMap: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['open-new-game', 'menu-action'])

// 世界书选择相关
const showWorldBookSelect = ref(false)
const worldBooks = ref([])
const selectedWorldBookId = ref('default_world_book')
const narratorProfiles = ref([])
const selectedNarratorId = ref('')

// 加载世界书列表
const loadWorldBookList = async () => {
  worldBooks.value = await loadWorldBooks()
  selectedWorldBookId.value = await getActiveWorldBookId()
}

const loadNarratorList = async () => {
  const profiles = await loadNarratorProfiles()
  narratorProfiles.value = getEnabledNarratorProfiles(profiles)
}

// 打开世界书选择弹窗
const openWorldBookSelectDialog = async () => {
  await loadWorldBookList()
  await loadNarratorList()
  selectedNarratorId.value = ''
  showWorldBookSelect.value = true
}

// 关闭世界书选择弹窗
const closeWorldBookSelectDialog = () => {
  showWorldBookSelect.value = false
}

// 确认选择并开始新游戏
const confirmNewGame = () => {
  showWorldBookSelect.value = false
  emit('open-new-game', {
    worldBookId: selectedWorldBookId.value,
    narratorId: selectedNarratorId.value || null,
  })
}

const handleMenuClick = (itemId) => {
  const action = resolveStartMenuAction(props.menuActionMap, itemId)
  if (action.type === 'new-game-dialog') {
    openWorldBookSelectDialog()
    return
  }
  emit('menu-action', { itemId, action })
}

onMounted(async () => {
  await loadWorldBookList()
  await loadNarratorList()
})
</script>

<template>
  <main class="launch-screen" role="main">
    <!-- 顶部标题区域 -->
    <header class="hero-block">
      <h1 class="hero-title">
        <span class="hero-title-main">AVG_LLM</span>
      </h1>
      <p class="hero-subtitle">Interactive Drama Engine</p>
    </header>

    <!-- 菜单列表区域 -->
    <section class="menu-section" aria-label="启动菜单">
      <nav class="menu-list">
        <button
          v-for="item in props.menuItems"
          :key="item.id"
          type="button"
          class="menu-list-item"
          @click="handleMenuClick(item.id)"
        >
          <span class="menu-item-icon" aria-hidden="true">{{ item.icon }}</span>
          <span class="menu-item-label">{{ item.label }}</span>
          <span class="menu-item-arrow" aria-hidden="true">›</span>
        </button>
      </nav>
    </section>

    <!-- 底部状态栏 -->
    <footer class="status-bar">
      <span class="status-dot"></span>
      <span class="status-text">系统就绪</span>
      <span class="status-version">v0.1</span>
    </footer>

    <!-- 世界书选择弹窗 -->
    <div v-if="showWorldBookSelect" class="worldbook-select-overlay" @click.self="closeWorldBookSelectDialog">
      <div class="worldbook-select-dialog">
        <div class="dialog-header">
          <h3 class="dialog-title">选择世界书</h3>
          <button type="button" class="dialog-close" @click="closeWorldBookSelectDialog">×</button>
        </div>
        <p class="dialog-desc">选择一本世界书作为新游戏的背景设定</p>

        <div class="worldbook-list">
          <button
            v-for="book in worldBooks"
            :key="book.id"
            type="button"
            class="worldbook-item"
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

        <label class="dialog-select-field">
          <span class="dialog-select-label">本局叙事者（可选）</span>
          <select v-model="selectedNarratorId" class="dialog-select-control">
            <option value="">使用世界书默认</option>
            <option v-for="profile in narratorProfiles" :key="profile.id" :value="profile.id">
              {{ profile.name }}
            </option>
          </select>
        </label>

        <div class="dialog-actions">
          <button type="button" class="dialog-btn cancel" @click="closeWorldBookSelectDialog">取消</button>
          <button type="button" class="dialog-btn confirm" @click="confirmNewGame">开始新游戏</button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped src="./StartScreen.css"></style>
