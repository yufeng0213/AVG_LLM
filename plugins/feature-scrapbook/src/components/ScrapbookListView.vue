<script setup>
/**
 * ScrapbookListView.vue - 手帐列表（书架视图）
 */
import { ref, onMounted } from 'vue'
import { loadBooks, deleteBook } from '../composables/useScrapbookData.js'

const emit = defineEmits(['open-book', 'new-book'])

const books = ref([])
const loading = ref(true)

onMounted(async () => {
  books.value = await loadBooks()
  loading.value = false
})

function handleOpen(book) {
  emit('open-book', book)
}

async function handleDelete(book) {
  if (confirm(`确定要删除手帐「${book.title}」吗？`)) {
    await deleteBook(book.id)
    books.value = books.value.filter(b => b.id !== book.id)
  }
}
</script>

<template>
  <div class="scrapbook-list">
    <div class="scrapbook-list-header">
      <span>我的手帐</span>
      <button class="new-book-btn" @click="emit('new-book')">+ 新建</button>
    </div>

    <div v-if="loading" class="scrapbook-loading">加载中...</div>

    <div v-else-if="books.length === 0" class="scrapbook-empty">
      <div class="empty-icon">📓</div>
      <p>还没有手帐</p>
      <button class="empty-new-btn" @click="emit('new-book')">创建第一本手帐</button>
    </div>

    <div v-else class="book-grid">
      <!-- 新建卡片 -->
      <div class="book-card book-card-new" @click="emit('new-book')">
        <div class="book-card-inner">
          <div class="book-add-icon">+</div>
          <span>新建手帐</span>
        </div>
      </div>

      <!-- 已有手帐 -->
      <div
        v-for="book in books"
        :key="book.id"
        class="book-card"
        @click="handleOpen(book)"
      >
        <div class="book-card-cover">
          <img
            v-if="book.coverImage"
            :src="book.coverImage"
            :alt="book.title"
            class="book-cover-img"
          />
          <div v-else class="book-cover-placeholder">📓</div>
        </div>
        <div class="book-card-info">
          <span class="book-card-title">{{ book.title || '未命名' }}</span>
          <span v-if="book.characterName" class="book-card-char">
            与 {{ book.characterName }}
          </span>
          <span class="book-card-date">
            {{ new Date(book.updatedAt || book.createdAt).toLocaleDateString() }}
          </span>
        </div>
        <button
          class="book-delete-btn"
          @click.stop="handleDelete(book)"
        >
          ×
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrapbook-list {
  padding: 16px;
  min-height: 100%;
}

.scrapbook-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.scrapbook-list-header span {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--reader-text, #fff);
}

.new-book-btn {
  background: linear-gradient(135deg, var(--reader-accent-start, #667eea), var(--reader-accent-end, #764ba2));
  border: none;
  color: #fff;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.scrapbook-loading {
  text-align: center;
  padding: 40px;
  color: var(--reader-secondary, #8b9dc3);
}

.scrapbook-empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--reader-secondary, #8b9dc3);
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 16px;
}

.scrapbook-empty p {
  font-size: 1rem;
  margin-bottom: 20px;
}

.empty-new-btn {
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  color: #fff;
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}

.book-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.book-card {
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.2s;
  position: relative;
}

.book-card:hover {
  transform: translateY(-2px);
  border-color: var(--reader-accent-start, #667eea);
}

.book-card-new {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.book-card-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--reader-secondary, #8b9dc3);
}

.book-add-icon {
  font-size: 2.5rem;
  font-weight: 300;
}

.book-card-cover {
  aspect-ratio: 3 / 4;
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.book-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.book-cover-placeholder {
  font-size: 3rem;
  opacity: 0.4;
}

.book-card-info {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.book-card-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--reader-text, #fff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.book-card-char {
  font-size: 0.72rem;
  color: var(--reader-accent-start, #667eea);
  opacity: 0.8;
}

.book-card-date {
  font-size: 0.68rem;
  color: var(--reader-secondary, #666);
  opacity: 0.5;
}

.book-delete-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  color: #ff6b6b;
  font-size: 1.2rem;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.book-card:hover .book-delete-btn {
  display: inline-flex;
}

.platform-android.android-portrait .book-delete-btn,
.platform-android.android-portrait .book-add-icon,
.platform-android.android-portrait .new-book-btn {
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
