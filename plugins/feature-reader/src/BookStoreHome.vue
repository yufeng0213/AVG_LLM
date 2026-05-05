<script setup>
/**
 * BookStoreHome.vue - 书城首页
 * 淡紫色主题，搜索栏+大横幅+功能按钮+本周推荐+人气榜
 * 角色小说：点击刷新，LLM 为每个角色生成书名、简介、书评
 */
import { ref, onMounted, watch, computed, onActivated } from 'vue'
import {
  loadStories,
  loadStoryChapters,
} from './composables/useReaderData.js'
import { loadWorldBooks } from '../../../src/worldbook/worldBookStore.js'
import { loadGeneratedBooks, overwriteGeneratedBooks, loadDiscoveries } from './composables/useGeneratedBooks.js'
import { generateCharacterBooks } from '../../../src/llm/llmService.reader.js'
import { usePlayerState } from '../../../src/stores/playerState.store.js'
import {
  getReaderCoins,
  setReaderCoins,
  rechargeReaderCoins,
  dailyCheckIn,
  getCheckInStatus,
} from './composables/useReaderEconomy.js'
import RechargePanel from './RechargePanel.vue'

const emit = defineEmits(['open-detail', 'open-shelf', 'open-settings', 'open-ranking', 'open-category', 'open-new-books'])

const stories = ref([])
const generatedBooks = ref([])
const discoveredBooks = ref([])
const searchQuery = ref('')
const readerCoins = ref(500)
const worldCoins = ref(0)
const refreshing = ref(false)
const rechargeVisible = ref(false)

const playerState = usePlayerState()

onMounted(async () => {
  stories.value = await loadStories()
  generatedBooks.value = await loadGeneratedBooks()
  discoveredBooks.value = await loadDiscoveries()
  readerCoins.value = await getReaderCoins()
  worldCoins.value = playerState.economy?.coins ?? 0
})

watch(() => playerState.economy?.coins, (val) => {
  if (val != null) worldCoins.value = val
})

async function refreshDiscoveries() {
  discoveredBooks.value = await loadDiscoveries()
}

onActivated(refreshDiscoveries)

// 合并所有书籍（真实故事 + 生成的书 + 发现的书）
const allBooks = computed(() => {
  return [...stories.value, ...generatedBooks.value, ...discoveredBooks.value]
})

// 大横幅：取最新的故事
const featuredStory = computed(() => {
  if (stories.value.length > 0) return stories.value[0]
  if (generatedBooks.value.length > 0) return generatedBooks.value[0]
  return {
    id: 'demo',
    title: '她在深渊里眷恋星光',
    summary: '语墨凡桃',
    chapters: [],
    author: '西溪',
    genre: ''
  }
})

// 本周推荐：优先真实故事，不足时用生成的书填充
const weeklyPicks = computed(() => {
  const picks = stories.value.slice(0, 4)
  if (picks.length < 4) {
    const needed = 4 - picks.length
    picks.push(...generatedBooks.value.slice(0, needed))
  }
  if (picks.length === 0) {
    return [
      { id: 'p1', title: '望月归来未有期', summary: '言溪 · 32.4万字', wordCount: 324000 },
      { id: 'p2', title: '玫瑰藏于盛夏', summary: '鱼小 · 35.1万字', wordCount: 351000 },
      { id: 'p3', title: '她坠入怀', summary: '言溪 · 33.1万字', wordCount: 331000 },
      { id: 'p4', title: '深渊时分', summary: '鱼小 · 5.6万字', wordCount: 56000 }
    ]
  }
  return picks
})

// 人气榜：合并真实故事和生成的书
const rankingList = computed(() => {
  if (allBooks.value.length > 0) {
    return allBooks.value.map(s => ({
      ...s,
      hot: (s.chapters?.length || 1) * 42000 + Math.floor(Math.random() * 10000)
    })).sort((a, b) => b.hot - a.hot).slice(0, 6)
  }
  return [
    { id: 'r1', title: '她与白月光问归于尽', hot: 284000 },
    { id: 'r2', title: '迟来的深情比草贱', hot: 362000 },
    { id: 'r3', title: '予你微笑', hot: 285000 },
    { id: 'r4', title: '偏执狂', hot: 502000 },
    { id: 'r5', title: '惨吻', hot: 35000 },
    { id: 'r6', title: '深渊时分', hot: 56000 }
  ]
})

const hotCovers = ['#a855f7', '#8b5cf6', '#6d28d9', '#7c3aed', '#5b21b6', '#4c1d95']
function getCoverGradient(id) {
  const idx = id.charCodeAt(id.length - 1) % hotCovers.length
  return `linear-gradient(135deg, ${hotCovers[idx]}, ${hotCovers[(idx + 1) % hotCovers.length]})`
}

const funcButtons = [
  { icon: '📊', label: '排行' },
  { icon: '📑', label: '分类' },
  { icon: '📕', label: '新书' },
  { icon: '', label: '免费' },
  { icon: '📖', label: '书架' }
]

const coverEmojis = ['📖', '', '📗', '', '📙', '📓']
function getCoverEmoji(id) {
  const idx = id.charCodeAt(id.length - 1) % coverEmojis.length
  return coverEmojis[idx]
}

function onFuncClick(label) {
  switch (label) {
    case '书架':
      emit('open-shelf')
      break
    case '排行':
      emit('open-ranking')
      break
    case '分类':
      emit('open-category')
      break
    case '新书':
      emit('open-new-books')
      break
  }
}

async function handleRecharge(amount) {
  const result = await rechargeReaderCoins(amount)
  if (result.success) {
    readerCoins.value = result.readerCoins
    worldCoins.value = result.playerCoins
    alert(result.message)
    rechargeVisible.value = false
  } else {
    alert(result.message)
  }
}

async function handleDailyCheckIn() {
  const result = await dailyCheckIn()
  if (result.success) {
    readerCoins.value = result.readerCoins
    alert(`签到成功！获得 ${result.reward} 金币`)
  } else {
    alert(result.message)
  }
}

async function loadCheckInStatus() {
  const status = await getCheckInStatus()
  return status.isCheckedIn
}

function formatHot(num) {
  if (num >= 10000) return (num / 10000).toFixed(1) + '万'
  return num.toString()
}

// 判断是否是生成的书
function isGeneratedBook(book) {
  return !!book._fromGenerated || !!book.characterId
}

// 获取角色名称（生成的书）
function getCharacterName(book) {
  if (!book.characterId) return ''
  // 从世界书角色中查找
  for (const wb of _worldBooksCache) {
    const ch = (wb.characters || []).find(c => c.id === book.characterId)
    if (ch) return ch.name
  }
  return ''
}

let _worldBooksCache = []

async function handleRefresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    // 加载所有世界书和角色
    _worldBooksCache = await loadWorldBooks()
    const allCharacters = []
    for (const wb of _worldBooksCache) {
      for (const ch of (wb.characters || [])) {
        allCharacters.push({
          ...ch,
          worldBookId: wb.id,
          worldBookTitle: wb.title,
        })
      }
    }

    if (allCharacters.length === 0) {
      alert('还没有世界书或角色，请先创建世界书并添加角色。')
      return
    }

    const result = await generateCharacterBooks({
      worldBooks: _worldBooksCache,
      characters: allCharacters,
    })

    if (!result.success) {
      alert(`生成失败: ${result.error}`)
      return
    }

    if (result.books.length === 0) {
      alert('没有生成任何书籍，请重试。')
      return
    }

    // 保存生成的书籍
    const merged = await overwriteGeneratedBooks(result.books)
    generatedBooks.value = merged
  } catch (err) {
    alert(`生成时发生错误: ${err.message}`)
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <div class="book-store-home">
    <!-- 标题栏 -->
    <div class="store-header">
      <button class="store-back-btn" @click="emit('back')">&lt;</button>
      <span class="store-title">书城</span>
      <div class="store-header-right">
        <div class="store-coins" @click="rechargeVisible = true">
          <span class="coin-icon">💰</span>
          <span class="coin-amount">{{ readerCoins }}</span>
          <span class="recharge-hint">+ 充值</span>
        </div>
        <button
          class="store-refresh-btn"
          :class="{ refreshing: refreshing }"
          @click="handleRefresh"
        >
          <span class="refresh-icon" :class="{ spin: refreshing }">⟳</span>
          <span class="refresh-label">{{ refreshing ? '生成中' : '刷新' }}</span>
        </button>
        <button class="store-settings-btn" @click="emit('open-settings')">⚙️</button>
      </div>
    </div>

    <!-- 搜索栏 -->
    <div class="search-bar">
      <span class="search-icon">🔍</span>
      <input
        v-model="searchQuery"
        class="search-input"
        type="text"
        placeholder="搜索书名/作者"
      />
      <button class="search-btn">查找</button>
    </div>

    <!-- 大横幅 -->
    <div class="featured-banner" @click="emit('open-detail', featuredStory)">
      <div class="banner-cover" :style="{ background: getCoverGradient(featuredStory.id) }">
        <span class="cover-emoji">{{ getCoverEmoji(featuredStory.id) }}</span>
      </div>
      <div class="banner-info">
        <h2 class="banner-title">{{ featuredStory.title }}</h2>
        <p class="banner-author">{{ featuredStory.summary || featuredStory.author || '语墨凡桃' }}</p>
      </div>
    </div>

    <!-- 功能按钮 -->
    <div class="func-buttons">
      <button
        v-for="btn in funcButtons"
        :key="btn.label"
        class="func-btn"
        @click="onFuncClick(btn.label)"
      >
        <span class="func-icon">{{ btn.icon }}</span>
        <span class="func-label">{{ btn.label }}</span>
      </button>
    </div>

    <!-- 本周推荐 -->
    <div class="section">
      <div class="section-header">
        <h3 class="section-title">本周推荐</h3>
        <span class="section-more">更多 ›</span>
      </div>
      <div class="recommend-scroll">
        <div
          v-for="book in weeklyPicks"
          :key="book.id"
          class="recommend-card"
          @click="emit('open-detail', book)"
        >
          <div class="rec-cover" :style="{ background: getCoverGradient(book.id) }">
            <span class="rec-cover-emoji">{{ getCoverEmoji(book.id) }}</span>
          </div>
          <p class="rec-title">{{ book.title }}</p>
          <p class="rec-author">{{ book.summary || '暂无简介' }}</p>
          <p class="rec-hot" v-if="book.hot">{{ formatHot(book.hot) }}</p>
          <span v-if="isGeneratedBook(book)" class="rec-new-badge">新书</span>
        </div>
      </div>
    </div>

    <!-- 人气榜 -->
    <div class="section">
      <div class="section-header">
        <h3 class="section-title">人气榜</h3>
        <span class="section-more">更多 ›</span>
      </div>
      <div class="ranking-list">
        <div
          v-for="(book, idx) in rankingList"
          :key="book.id"
          class="ranking-item"
          @click="emit('open-detail', book)"
        >
          <span :class="['rank-num', { 'rank-top': idx < 3 }]">{{ idx + 1 }}</span>
          <div class="rank-info">
            <p class="rank-title">{{ book.title }}</p>
            <p v-if="getCharacterName(book)" class="rank-author">
              {{ getCharacterName(book) }} 著
            </p>
          </div>
          <span class="rank-hot">{{ formatHot(book.hot) }}</span>
          <span v-if="isGeneratedBook(book)" class="rank-new-badge">新书</span>
        </div>
      </div>
    </div>

    <!-- 底部间距 -->
    <div class="bottom-spacer" />

    <!-- 充值面板 -->
    <RechargePanel
      :visible="rechargeVisible"
      :player-coins="worldCoins"
      @close="rechargeVisible = false"
      @recharge="handleRecharge"
    />
  </div>
</template>

<style scoped>
.book-store-home {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: linear-gradient(180deg, #f5f0ff 0%, #ede4ff 100%);
}

/* 标题栏 */
.store-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px 8px;
  padding-top: 12px;
}

.store-back-btn {
  background: none;
  border: none;
  font-size: 1.3rem;
  color: #7c5cbf;
  cursor: pointer;
  padding: 4px 8px;
  flex-shrink: 0;
}

.store-title {
  flex: 1;
  font-size: 1.3rem;
  font-weight: 700;
  color: #2d2040;
}

.store-coins {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #fff;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.8rem;
  color: #f59e0b;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  cursor: pointer;
  transition: transform 0.15s;
}
.store-coins:active {
  transform: scale(0.95);
}

.recharge-hint {
  font-size: 0.68rem;
  color: #7c5cbf;
  margin-left: 2px;
  padding-left: 6px;
  border-left: 1px solid #e0d4f5;
}

.store-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 刷新按钮 */
.store-refresh-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  color: #fff;
  border: none;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.2s;
}

.store-refresh-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.store-refresh-btn.refreshing {
  opacity: 0.7;
  cursor: not-allowed;
}

.refresh-icon {
  font-size: 0.9rem;
  display: inline-block;
}

.refresh-icon.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.store-settings-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px;
  color: #7c5cbf;
}

/* 搜索栏 */
.search-bar {
  display: flex;
  align-items: center;
  margin: 8px 16px 12px;
  background: #fff;
  border-radius: 24px;
  padding: 8px 16px;
  box-shadow: 0 2px 8px rgba(124, 92, 191, 0.08);
}

.search-icon {
  font-size: 0.9rem;
  margin-right: 8px;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 0.85rem;
  color: #2d2040;
  background: transparent;
}

.search-input::placeholder {
  color: #b0a8c0;
}

.search-btn {
  background: #7c5cbf;
  color: #fff;
  border: none;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
}

/* 大横幅 */
.featured-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 16px 14px;
  background: linear-gradient(135deg, #6d28d9, #9b59b6);
  border-radius: 14px;
  padding: 16px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(109, 40, 217, 0.2);
}

.banner-cover {
  width: 80px;
  height: 108px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

.cover-emoji {
  font-size: 2.2rem;
}

.banner-info {
  flex: 1;
  min-width: 0;
}

.banner-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 6px;
  line-height: 1.3;
}

.banner-author {
  font-size: 0.8rem;
  color: rgba(255,255,255,0.75);
  margin: 0;
}

/* 功能按钮 */
.func-buttons {
  display: flex;
  justify-content: space-around;
  padding: 0 12px 14px;
}

.func-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: #fff;
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  transition: transform 0.15s;
}

.func-btn:active {
  transform: scale(0.95);
}

.func-icon {
  font-size: 1.3rem;
}

.func-label {
  font-size: 0.72rem;
  color: #5a3d8a;
  font-weight: 600;
}

/* Section 通用 */
.section {
  padding: 0 16px 14px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-title {
  font-size: 1rem;
  font-weight: 700;
  color: #2d2040;
  margin: 0;
}

.section-more {
  font-size: 0.78rem;
  color: #9b8ec4;
  cursor: pointer;
}

/* 本周推荐 - 横滑 */
.recommend-scroll {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
  position: relative;
}

.recommend-scroll::-webkit-scrollbar {
  display: none;
}

.recommend-card {
  scroll-snap-align: start;
  width: 110px;
  flex-shrink: 0;
  cursor: pointer;
  position: relative;
}

.rec-cover {
  width: 110px;
  height: 148px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.rec-cover-emoji {
  font-size: 2rem;
}

.rec-title {
  font-size: 0.78rem;
  font-weight: 600;
  color: #2d2040;
  margin: 0 0 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rec-author {
  font-size: 0.68rem;
  color: #8b7ea8;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rec-hot {
  font-size: 0.65rem;
  color: #9b8ec4;
  margin: 2px 0 0;
}

.rec-new-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: linear-gradient(135deg, #f59e0b, #f97316);
  color: #fff;
  font-size: 0.58rem;
  padding: 2px 6px;
  border-radius: 8px;
  font-weight: 600;
}

/* 人气榜 */
.ranking-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: transform 0.15s;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  position: relative;
}

.ranking-item:active {
  transform: scale(0.98);
}

.rank-num {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
  color: #b0a8c0;
  flex-shrink: 0;
}

.rank-top {
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  color: #fff;
  border-radius: 6px;
}

.rank-info {
  flex: 1;
  min-width: 0;
}

.rank-title {
  font-size: 0.85rem;
  color: #2d2040;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rank-author {
  font-size: 0.7rem;
  color: #b0a8c0;
  margin: 2px 0 0;
}

.rank-hot {
  font-size: 0.75rem;
  color: #9b8ec4;
  flex-shrink: 0;
}

.rank-new-badge {
  background: linear-gradient(135deg, #f59e0b, #f97316);
  color: #fff;
  font-size: 0.6rem;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
  flex-shrink: 0;
}

.bottom-spacer {
  height: 16px;
}

.platform-android.android-portrait .search-btn,
.platform-android.android-portrait .func-btn,
.platform-android.android-portrait .store-settings-btn,
.platform-android.android-portrait .store-refresh-btn,
.platform-android.android-portrait .store-back-btn {
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  flex: none !important;
  font-size: 1.1rem !important;
  padding: 6px 14px !important;
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 8px !important;
  white-space: nowrap !important;
}
</style>
