<script setup>
/**
 * NewBooksScreen.vue - 新书发现界面
 * 点击"发现新书"随机生成 3-5 本，免费看标题/简介
 */
import { ref, onMounted, computed } from 'vue'
import { loadWorldBooks } from '../../../src/worldbook/worldBookStore.js'
import { generateNewBooks } from '../../../src/llm/llmService.reader.js'
import { loadDiscoveries, saveDiscoveries, appendDiscoveries } from './composables/useGeneratedBooks.js'
import { loadSettings } from './composables/useReaderData.js'

const emit = defineEmits(['back', 'open-detail'])

const discovering = ref(false)
const discoveries = ref([])
const todayBooks = ref([])

onMounted(async () => {
  const all = await loadDiscoveries()
  // 按日期分组，取今天的
  const today = new Date().toISOString().slice(0, 10)
  todayBooks.value = all.filter(b => b.discoveredAt?.startsWith(today)).reverse()
  // 历史书也保留展示
  discoveries.value = all.reverse()
})

async function handleDiscover() {
  if (discovering.value) return
  discovering.value = true
  try {
    const worldBooks = await loadWorldBooks()
    const allCharacters = []
    for (const wb of worldBooks) {
      for (const ch of (wb.characters || [])) {
        allCharacters.push({
          ...ch,
          worldBookId: wb.id,
          worldBookTitle: wb.title,
        })
      }
    }

    // 随机数量 3-5
    const count = 3 + Math.floor(Math.random() * 3)

    // 加载主要角色设定
    const settings = await loadSettings()

    const result = await generateNewBooks({
      worldBooks,
      characters: allCharacters,
      count,
      mainCharacters: settings.mainCharacters || '',
      preferredGenres: settings.preferredGenres || '',
    })

    if (!result.success) {
      alert(`生成失败: ${result.error}`)
      return
    }

    if (result.books.length === 0) {
      alert('没有生成任何书籍，请重试。')
      return
    }

    // 清除旧的发现记录，只保留最新一批
    const newItems = result.books.map(b => ({
      ...b,
      discoveredAt: new Date().toISOString(),
    }))
    await saveDiscoveries(newItems)

    todayBooks.value = [...newItems.reverse()]
    discoveries.value = todayBooks.value
  } catch (err) {
    alert(`生成时发生错误: ${err.message}`)
  } finally {
    discovering.value = false
  }
}

async function removeBook(book) {
  const ok = confirm(`确定要从发现列表中移除「${book.title}」吗？`)
  if (!ok) return

  todayBooks.value = todayBooks.value.filter(b => b.id !== book.id)
  await saveDiscoveries(todayBooks.value)
}

function formatTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function todayCount() {
  return todayBooks.value.length
}

const hotCovers = ['#a855f7', '#8b5cf6', '#6d28d9', '#7c3aed', '#5b21b6', '#4c1d95']
function getCoverGradient(id) {
  const idx = (id?.charCodeAt(id.length - 1) || 0) % hotCovers.length
  return `linear-gradient(135deg, ${hotCovers[idx]}, ${hotCovers[(idx + 1) % hotCovers.length]})`
}

const coverEmojis = ['📖', '📗', '📘', '📙', '📓', '📕']
function getCoverEmoji(id) {
  const idx = (id?.charCodeAt(id.length - 1) || 0) % coverEmojis.length
  return coverEmojis[idx]
}
</script>

<template>
  <div class="new-books-screen">
    <!-- 标题栏 -->
    <div class="screen-header">
      <button class="back-btn" @click="emit('back')">&lt;</button>
      <h2 class="screen-title">🆕 发现新书</h2>
      <span class="screen-subtitle">
        <span v-if="todayCount() > 0">今日已发现 {{ todayCount() }} 本</span>
        <span v-else>点击上方按钮发现新书</span>
      </span>
    </div>

    <!-- 发现按钮 -->
    <div class="discover-area">
      <button
        class="discover-btn"
        :disabled="discovering"
        @click="handleDiscover"
      >
        <span v-if="discovering" class="spin-icon">🎲</span>
        <span v-else>🎲</span>
        {{ discovering ? '发现中...' : '发现新书' }}
      </button>
    </div>

    <!-- 今日新书 -->
    <div v-if="todayBooks.length > 0" class="section">
      <h3 class="section-title">今日新书</h3>
      <div class="book-grid">
        <div
          v-for="book in todayBooks"
          :key="book.id"
          class="book-card"
        >
          <button class="book-remove-btn" @click.stop="removeBook(book)">×</button>
          <div @click="emit('open-detail', book)">
            <div class="book-cover" :style="{ background: getCoverGradient(book.id) }">
              <span>{{ getCoverEmoji(book.id) }}</span>
            </div>
            <p class="book-title">{{ book.title }}</p>
            <p class="book-author">{{ book.author || '未知作者' }}</p>
            <p class="book-summary">{{ book.summary?.slice(0, 60) }}...</p>
            <div class="book-footer">
              <span class="book-genre">{{ book.genre || '都市' }}</span>
              <span class="book-rating">⭐ {{ book.rating || '9.0' }}</span>
              <span class="book-time">{{ formatTime(book.discoveredAt) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!discovering && todayBooks.length === 0" class="empty-state">
      <span class="empty-icon">📚</span>
      <p class="empty-text">还没有发现新书</p>
      <p class="empty-hint">点击上方按钮，开始探索新故事吧！</p>
    </div>
  </div>
</template>

<style scoped>
.new-books-screen {
  background: linear-gradient(180deg, #f5f0ff 0%, #ede4ff 100%);
  min-height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* 标题栏 */
.screen-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px 10px;
}

.back-btn {
  background: none;
  border: none;
  font-size: 1.3rem;
  color: #7c5cbf;
  cursor: pointer;
  padding: 4px 8px;
  flex-shrink: 0;
}

.screen-title {
  flex: 1;
  font-size: 1.1rem;
  font-weight: 700;
  color: #2d2040;
  margin: 0;
}

.screen-subtitle {
  font-size: 0.75rem;
  color: #9b8ec4;
  flex-shrink: 0;
}

/* 发现按钮 */
.discover-area {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.discover-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  color: #fff;
  border: none;
  padding: 12px 32px;
  border-radius: 24px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(124, 92, 191, 0.3);
  transition: transform 0.15s;
}

.discover-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.discover-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spin-icon {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Section */
.section {
  padding: 0 16px 16px;
}

.section-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #2d2040;
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e0d4f5;
}

/* 书籍网格 */
.book-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.book-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: transform 0.15s;
  box-shadow: 0 1px 6px rgba(109, 40, 217, 0.06);
  display: flex;
  flex-direction: column;
  position: relative;
}

.book-card:active {
  transform: scale(0.98);
}

.book-remove-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.35);
  border: none;
  color: #fff;
  font-size: 0.95rem;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  z-index: 2;
  transition: background 0.2s;
}

.book-remove-btn:hover {
  background: rgba(255, 77, 77, 0.7);
}

.book-cover {
  width: 100%;
  height: 120px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  font-size: 2rem;
}

.book-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: #2d2040;
  margin: 0 0 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.book-author {
  font-size: 0.68rem;
  color: #8b7ea8;
  margin: 0 0 4px;
}

.book-summary {
  font-size: 0.68rem;
  color: #b0a8c0;
  margin: 0 0 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

.book-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.book-genre {
  font-size: 0.62rem;
  color: #7c5cbf;
  background: #f0e8ff;
  padding: 2px 6px;
  border-radius: 6px;
}

.book-rating {
  font-size: 0.62rem;
  color: #f59e0b;
}

.book-time {
  font-size: 0.6rem;
  color: #b0a8c0;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 0;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 1rem;
  font-weight: 600;
  color: #2d2040;
  margin: 0 0 4px;
}

.empty-hint {
  font-size: 0.82rem;
  color: #8b7ea8;
  margin: 0;
}

.platform-android.android-portrait .back-btn,
.platform-android.android-portrait .discover-btn,
.platform-android.android-portrait .book-remove-btn {
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
