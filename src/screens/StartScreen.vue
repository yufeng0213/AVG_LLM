<script setup>
import { onMounted, ref } from 'vue'
import { loadWorldBooks, getActiveWorldBookId } from '../worldbook/worldBookStore'
import { getEnabledNarratorProfiles, loadNarratorProfiles } from '../narrator/narratorStore'

const emit = defineEmits([
  'open-settings',
  'open-worldbook',
  'open-new-game',
  'open-save-load',
  'open-plugin-manager',
  'open-narrator-manager',
  'menu-click',
])

// 世界书选择相关
const showWorldBookSelect = ref(false)
const worldBooks = ref([])
const selectedWorldBookId = ref('default_world_book')
const narratorProfiles = ref([])
const selectedNarratorId = ref('')

const menuItems = [
  {
    id: 'continue',
    label: '继续游戏',
    description: '从最近一次存档继续推进剧情',
    icon: '▶',
    variant: 'tone-magenta border-solid tilt-left',
  },
  {
    id: 'load-save',
    label: '载入存档',
    description: '选择存档或历史备份继续游戏',
    icon: '💾',
    variant: 'tone-cyan border-solid tilt-right',
  },
  {
    id: 'new-game',
    label: '新游戏',
    description: '开启新的主线并重置选择分支',
    icon: '★',
    variant: 'tone-cyan border-dashed tilt-left',
  },
  {
    id: 'settings',
    label: '设置',
    description: '调整音量、显示与 API 配置',
    icon: '⚙',
    variant: 'tone-orange border-double tilt-right',
  },
  {
    id: 'worldbook',
    label: '世界书',
    description: '维护世界观与剧情背景条目',
    icon: '📘',
    variant: 'tone-magenta border-dashed tilt-left',
  },
  {
    id: 'plugins',
    label: '插件管理',
    description: '加载和管理扩展插件',
    icon: '🔌',
    variant: 'tone-cyan border-dashed tilt-right',
  },
  {
    id: 'narrators',
    label: '叙事者',
    description: '管理不同主笔风格与叙事模板',
    icon: '🧠',
    variant: 'tone-orange border-dashed tilt-left',
  },
]

const floatingShapes = [
  {
    id: 'spark-a',
    symbol: '✨',
    top: '6%',
    left: '4%',
    size: '2.4rem',
    color: 'var(--accent-cyan)',
    motion: 'motion-float',
    duration: '6s',
    delay: '0s',
  },
  {
    id: 'spark-b',
    symbol: '⚡',
    top: '17%',
    left: '86%',
    size: '2.6rem',
    color: 'var(--accent-yellow)',
    motion: 'motion-wiggle',
    duration: '1.4s',
    delay: '0.2s',
  },
  {
    id: 'spark-c',
    symbol: '✦',
    top: '72%',
    left: '8%',
    size: '2rem',
    color: 'var(--accent-magenta)',
    motion: 'motion-float-reverse',
    duration: '5s',
    delay: '0.5s',
  },
  {
    id: 'spark-d',
    symbol: '❖',
    top: '80%',
    left: '87%',
    size: '1.8rem',
    color: 'var(--accent-purple)',
    motion: 'motion-bounce',
    duration: '2.2s',
    delay: '0.1s',
  },
  {
    id: 'spark-e',
    symbol: '⬢',
    top: '38%',
    left: '92%',
    size: '1.6rem',
    color: 'var(--accent-orange)',
    motion: 'motion-float',
    duration: '7s',
    delay: '0.4s',
  },
]

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
  emit('menu-click', itemId)
  if (itemId === 'settings') {
    emit('open-settings')
    return
  }

  if (itemId === 'new-game') {
    // 新游戏：先选择世界书
    openWorldBookSelectDialog()
    return
  }

  if (itemId === 'worldbook') {
    emit('open-worldbook')
    return
  }

  if (itemId === 'load-save') {
    emit('open-save-load')
    return
  }

  if (itemId === 'plugins') {
    emit('open-plugin-manager')
    return
  }

  if (itemId === 'narrators') {
    emit('open-narrator-manager')
    return
  }

  if (itemId === 'continue') {
    // 继续游戏：直接打开存档界面
    emit('open-save-load')
  }
}

onMounted(async () => {
  await loadWorldBookList()
  await loadNarratorList()
})
</script>

<template>
  <main class="launch-screen" role="main">
    <p class="massive-word" aria-hidden="true">AVG</p>

    <div class="floating-layer" aria-hidden="true">
      <span
        v-for="shape in floatingShapes"
        :key="shape.id"
        class="floating-shape"
        :class="shape.motion"
        :style="{
          '--shape-top': shape.top,
          '--shape-left': shape.left,
          '--shape-size': shape.size,
          '--shape-color': shape.color,
          '--shape-duration': shape.duration,
          '--shape-delay': shape.delay,
        }"
      >
        {{ shape.symbol }}
      </span>
    </div>

    <header class="hero-block">
      <p class="hero-tag">Interactive Drama Engine</p>
      <h1 class="hero-title">
        <span class="hero-title-main">AVG_LLM</span>
        <span class="hero-title-gradient">START MENU</span>
      </h1>
      <p class="hero-subtitle">
        多彩图层与霓虹噪点已经就位，选择你的下一段叙事分支。
      </p>
    </header>

    <section class="menu-panel" aria-label="启动菜单">
      <div class="menu-heading-row">
        <p class="menu-heading">主菜单</p>
        <p class="menu-heading-emoji" aria-hidden="true">⚡✨</p>
      </div>

      <div class="menu-grid">
        <button
          v-for="item in menuItems"
          :key="item.id"
          type="button"
          class="menu-button"
          :class="item.variant"
          @click="handleMenuClick(item.id)"
        >
          <span class="menu-button-icon" aria-hidden="true">{{ item.icon }}</span>
          <span class="menu-button-text">{{ item.label }}</span>
          <span class="menu-button-desc">{{ item.description }}</span>
        </button>
      </div>

      <div class="menu-meta">
        <p class="meta-chip chip-yellow">章节 00</p>
        <p class="meta-chip chip-cyan">系统待机</p>
        <p class="meta-chip chip-orange">v0.1 Prelude</p>
      </div>
    </section>

    <!-- 世界书选择弹窗 -->
    <div v-if="showWorldBookSelect" class="worldbook-select-overlay" @click.self="closeWorldBookSelectDialog">
      <div class="worldbook-select-dialog">
        <h3 class="dialog-title">选择开局世界书</h3>
        <p class="dialog-desc">选择一本世界书作为新游戏的背景设定，后续剧情将基于此世界书生成。</p>
        
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
          <span class="dialog-select-label">本局叙事者（可覆盖）</span>
          <select v-model="selectedNarratorId" class="dialog-select-control">
            <option value="">跟随世界书默认</option>
            <option v-for="profile in narratorProfiles" :key="profile.id" :value="profile.id">
              {{ profile.name }}{{ profile.isDefault ? '（系统默认）' : '' }}
            </option>
          </select>
          <span class="dialog-select-hint">留空时按世界书默认叙事者运行。</span>
        </label>

        <div class="dialog-actions">
          <button type="button" class="dialog-btn cancel small-btn" @click="closeWorldBookSelectDialog">取消</button>
          <button type="button" class="dialog-btn confirm small-btn" @click="confirmNewGame">开始新游戏</button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped src="./StartScreen.css"></style>

