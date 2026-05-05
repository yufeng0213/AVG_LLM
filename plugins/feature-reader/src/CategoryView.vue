<script setup>
/**
 * CategoryView.vue - 分类浏览
 * 从所有书籍的标签中提取分类，点击标签筛选
 */
import { ref, computed, onMounted } from 'vue'
import { loadStories } from './composables/useReaderData.js'
import { loadGeneratedBooks } from './composables/useGeneratedBooks.js'
import { loadWorldBooks } from '../../../src/worldbook/worldBookStore.js'

const emit = defineEmits(['open-detail', 'back'])

const allBooks = ref([])
const activeTag = ref('全部')
const loading = ref(true)

let worldBooksCache = []

// 预定义的分类顺序
const TAG_ORDER = [
  '全部', '言情', '玄幻', '都市', '悬疑', '科幻', '奇幻', '历史', '武侠',
]

onMounted(async () => {
  try {
    const [stories, generated] = await Promise.all([
      loadStories(),
      loadGeneratedBooks(),
    ])
    worldBooksCache = await loadWorldBooks()
    allBooks.value = [...stories, ...generated]
  } finally {
    loading.value = false
  }
})

// 收集所有出现过的标签
const allTags = computed(() => {
  const tagSet = new Set()
  for (const book of allBooks.value) {
    if (book.genre) tagSet.add(book.genre)
    if (book.tags) {
      for (const t of book.tags) tagSet.add(t)
    }
  }
  // 按预定义顺序排序，不存在的标签跳过
  const ordered = TAG_ORDER.filter(t => t === '全部' || tagSet.has(t))
  // 补充未在预定义列表中的标签
  for (const t of tagSet) {
    if (!TAG_ORDER.includes(t)) ordered.push(t)
  }
  return ordered
})

const filteredBooks = computed(() => {
  if (activeTag.value === '全部') return allBooks.value

  return allBooks.value.filter((book) => {
    if (book.genre === activeTag.value) return true
    if (book.tags?.includes(activeTag.value)) return true
    return false
  })
})

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

function getCoverGradient(id) {
  const colors = ['#a855f7', '#8b5cf6', '#6d28d9', '#7c3aed', '#5b21b6', '#4c1d95']
  const idx = id.charCodeAt(id.length - 1) % colors.length
  return `linear-gradient(135deg, ${colors[idx]}, ${colors[(idx + 1) % colors.length]})`
}

function getCoverEmoji(id) {
  const emojis = ['📖', '', '📗', '', '📙', '📓']
  const idx = id.charCodeAt(id.length - 1) % emojis.length
  return emojis[idx]
}
</script>

<template>
  <div class="category-view">
    <div class="cat-header">
      <button class="back-btn" @click="emit('back')">&lt;</button>
      <h2 class="cat-title">分类</h2>
      <span class="cat-count">{{ filteredBooks.length }} 部</span>
    </div>

    <!-- 分类标签 -->
    <div class="tag-scroll">
      <button
        v-for="tag in allTags"
        :key="tag"
        :class="['tag-btn', { active: activeTag === tag }]"
        @click="activeTag = tag"
      >
        {{ tag }}
      </button>
    </div>

    <!-- 书籍列表 -->
    <div v-if="loading" class="loading">加载中...</div>

    <div v-else class="book-list">
      <div
        v-for="book in filteredBooks"
        :key="book.id"
        class="book-card"
        @click="emit('open-detail', book)"
      >
        <div class="book-cover" :style="{ background: getCoverGradient(book.id) }">
          <span>{{ getCoverEmoji(book.id) }}</span>
        </div>
        <div class="book-info">
          <p class="book-title">{{ book.title }}</p>
          <p v-if="getCharacterName(book)" class="book-author">
            {{ getCharacterName(book) }} 著
          </p>
          <p v-else-if="book.author" class="book-author">{{ book.author }}</p>
          <p class="book-summary">{{ book.summary || book.genre || '暂无简介' }}</p>
          <div class="book-tags">
            <span v-for="t in (book.tags || []).slice(0, 3)" :key="t" class="mini-tag">
              {{ t }}
            </span>
          </div>
        </div>
        <span v-if="isGeneratedBook(book)" class="new-badge">新书</span>
      </div>

      <div v-if="filteredBooks.length === 0" class="empty">
        <span class="empty-icon">📭</span>
        <p>该分类下暂无书籍</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.category-view {
  background: linear-gradient(180deg, #f5f0ff 0%, #ede4ff 100%);
  min-height: 100%;
}

.cat-header {
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

.cat-title {
  flex: 1;
  font-size: 1.1rem;
  font-weight: 700;
  color: #2d2040;
  margin: 0;
}

.cat-count {
  font-size: 0.78rem;
  color: #9b8ec4;
}

/* 标签滚动条 */
.tag-scroll {
  display: flex;
  gap: 8px;
  padding: 8px 16px 12px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  position: sticky;
  top: 52px;
  background: #f5f0ff;
  z-index: 9;
}

.tag-scroll::-webkit-scrollbar {
  display: none;
}

.tag-btn {
  flex-shrink: 0;
  background: #fff;
  border: 1px solid #e0d4f5;
  padding: 6px 14px;
  border-radius: 16px;
  font-size: 0.78rem;
  color: #5a3d8a;
  cursor: pointer;
  transition: all 0.15s;
  font-weight: 600;
}

.tag-btn.active {
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  color: #fff;
  border-color: #7c5cbf;
}

.tag-btn:active {
  transform: scale(0.95);
}

.loading {
  text-align: center;
  padding: 40px;
  color: #9b8ec4;
}

.book-list {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.book-card {
  display: flex;
  gap: 12px;
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: transform 0.15s;
  box-shadow: 0 1px 6px rgba(109, 40, 217, 0.06);
  position: relative;
}

.book-card:active {
  transform: scale(0.98);
}

.book-cover {
  width: 72px;
  height: 96px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  font-size: 1.8rem;
}

.book-info {
  flex: 1;
  min-width: 0;
}

.book-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #2d2040;
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.book-author {
  font-size: 0.72rem;
  color: #8b7ea8;
  margin: 0 0 4px;
}

.book-summary {
  font-size: 0.72rem;
  color: #b0a8c0;
  margin: 0 0 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.book-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.mini-tag {
  font-size: 0.65rem;
  color: #7c5cbf;
  background: #f0e8ff;
  padding: 2px 8px;
  border-radius: 8px;
  font-weight: 500;
}

.new-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: linear-gradient(135deg, #f59e0b, #f97316);
  color: #fff;
  font-size: 0.6rem;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
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
