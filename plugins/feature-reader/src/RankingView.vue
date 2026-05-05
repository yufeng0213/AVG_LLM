<script setup>
/**
 * RankingView.vue - 人气排行榜
 * 显示数据库里所有书籍，按章节数 × 人气系数 + 随机波动排序
 */
import { ref, computed, onMounted } from 'vue'
import { loadStories } from './composables/useReaderData.js'
import { loadGeneratedBooks } from './composables/useGeneratedBooks.js'
import { loadWorldBooks } from '../../../src/worldbook/worldBookStore.js'

const emit = defineEmits(['open-detail', 'back'])

const allBooks = ref([])
const loading = ref(true)

// 缓存世界书，用于查角色名
let worldBooksCache = []

onMounted(async () => {
  try {
    const [stories, generated] = await Promise.all([
      loadStories(),
      loadGeneratedBooks(),
    ])
    worldBooksCache = await loadWorldBooks()

    // 合并，每本书带章节数
    allBooks.value = [...stories, ...generated]
  } finally {
    loading.value = false
  }
})

// 计算人气 = 章节数 × 系数 + 基于 id 的伪随机
const rankingList = computed(() => {
  return allBooks.value
    .map((book) => {
      const chCount = book.chapters?.length || 0
      // 用 id 的 hash 做确定性随机，避免每次排序不同
      const seed = hashStr(book.id)
      const rand = (seed % 10000)
      const hot = chCount * 42000 + rand
      return { ...book, hot, chCount }
    })
    .sort((a, b) => b.hot - a.hot)
})

function hashStr(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function isGeneratedBook(book) {
  return !!book._fromGenerated || !!book.characterId
}

function getCharacterName(book) {
  if (!book.characterId) return ''
  for (const wb of worldBooksCache) {
    const ch = (wb.characters || []).find(c => c.id === book.characterId)
    if (ch) return ch.name
  }
  return ''
}

function formatHot(num) {
  if (num >= 10000) return (num / 10000).toFixed(1) + '万'
  return num.toString()
}

const hotCovers = ['#a855f7', '#8b5cf6', '#6d28d9', '#7c3aed', '#5b21b6', '#4c1d95']
function getCoverGradient(id) {
  const idx = id.charCodeAt(id.length - 1) % hotCovers.length
  return `linear-gradient(135deg, ${hotCovers[idx]}, ${hotCovers[(idx + 1) % hotCovers.length]})`
}

function getCoverEmoji(id) {
  const coverEmojis = ['📖', '', '📗', '', '📙', '📓']
  const idx = id.charCodeAt(id.length - 1) % coverEmojis.length
  return coverEmojis[idx]
}
</script>

<template>
  <div class="ranking-view">
    <div class="ranking-header">
      <button class="back-btn" @click="emit('back')">&lt;</button>
      <h2 class="ranking-title">人气榜</h2>
      <span class="ranking-count">{{ rankingList.length }} 部</span>
    </div>

    <div v-if="loading" class="loading">加载中...</div>

    <div v-else class="ranking-list">
      <div
        v-for="(book, idx) in rankingList"
        :key="book.id"
        class="ranking-item"
        @click="emit('open-detail', book)"
      >
        <!-- 序号 -->
        <span :class="['rank-badge', { 'rank-top': idx < 3 }]">{{ idx + 1 }}</span>

        <!-- 封面 -->
        <div class="book-cover" :style="{ background: getCoverGradient(book.id) }">
          <span>{{ getCoverEmoji(book.id) }}</span>
        </div>

        <!-- 信息 -->
        <div class="book-info">
          <p class="book-title">{{ book.title }}</p>
          <p v-if="getCharacterName(book)" class="book-author">
            {{ getCharacterName(book) }} 著
          </p>
          <p v-else-if="book.author" class="book-author">{{ book.author }}</p>
          <p class="book-meta">
            <span v-if="book.chapters?.length">{{ book.chapters.length }} 章</span>
            <span v-if="book.wordCount" class="sep">·</span>
            <span v-if="book.wordCount">{{ (book.wordCount / 1000).toFixed(1) }} 千字</span>
          </p>
        </div>

        <!-- 热度 -->
        <span class="hot-value">{{ formatHot(book.hot) }}</span>
        <span v-if="isGeneratedBook(book)" class="new-badge">新书</span>
      </div>

      <div v-if="rankingList.length === 0" class="empty">
        <span class="empty-icon">📚</span>
        <p>还没有书籍</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ranking-view {
  background: linear-gradient(180deg, #f5f0ff 0%, #ede4ff 100%);
  min-height: 100%;
}

.ranking-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px 10px;
  position: sticky;
  top: 0;
  background: #f5f0ff;
  z-index: 10;
}

.back-btn {
  background: none;
  border: none;
  font-size: 1.3rem;
  color: #7c5cbf;
  cursor: pointer;
  padding: 4px 8px;
}

.ranking-title {
  flex: 1;
  font-size: 1.1rem;
  font-weight: 700;
  color: #2d2040;
  margin: 0;
}

.ranking-count {
  font-size: 0.78rem;
  color: #9b8ec4;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #9b8ec4;
  font-size: 0.9rem;
}

.ranking-list {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: transform 0.15s;
  box-shadow: 0 1px 6px rgba(109, 40, 217, 0.06);
}

.ranking-item:active {
  transform: scale(0.98);
}

.book-cover {
  width: 56px;
  height: 76px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  font-size: 1.5rem;
}

.book-info {
  flex: 1;
  min-width: 0;
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  font-size: 0.82rem;
  font-weight: 700;
  color: #b0a8c0;
  border-radius: 8px;
  flex-shrink: 0;
}

.rank-top {
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  color: #fff;
}

.book-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: #2d2040;
  margin: 0 0 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.book-author {
  font-size: 0.72rem;
  color: #8b7ea8;
  margin: 0 0 2px;
}

.book-meta {
  font-size: 0.68rem;
  color: #b0a8c0;
  margin: 0;
}

.book-meta .sep {
  margin: 0 4px;
}

.hot-value {
  font-size: 0.78rem;
  color: #9b8ec4;
  flex-shrink: 0;
}

.new-badge {
  background: linear-gradient(135deg, #f59e0b, #f97316);
  color: #fff;
  font-size: 0.6rem;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
  flex-shrink: 0;
}

.empty {
  text-align: center;
  padding: 60px 0;
}

.empty-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: 12px;
}
</style>
