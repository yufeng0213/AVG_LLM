<script setup>
/**
 * BookShelfView.vue - 书架
 * 淡紫色主题，卡片式展示
 */
import { onMounted, ref } from 'vue'
import { loadStories, saveStories, deleteStory } from '../../composables/useReaderData.js'
import { loadWorldBooks } from '../../../../../src/worldbook/worldBookStore.js'
import { formatReaderTime } from '../../composables/useReaderData.js'

const emit = defineEmits(['open-story', 'open-new-story', 'open-book-import', 'open-chapters', 'open-settings', 'story-deleted'])

const stories = ref([])
const worldBookMap = ref({})

onMounted(async () => {
  stories.value = await loadStories()
  const books = await loadWorldBooks()
  worldBookMap.value = Object.fromEntries(books.map(b => [b.id, b.title]))
})

function getWorldBookTitle(worldBookId) {
  return worldBookMap.value[worldBookId] || worldBookId?.slice(0, 12) || '—'
}

async function deleteStoryItem(storyId, storyTitle) {
  if (!confirm(`确定要删除「${storyTitle}」吗？此操作不可恢复。`)) return
  const stories = await loadStories()
  const updated = await deleteStory(stories, storyId)
  stories.value.length = 0
  stories.value.push(...updated)
  await saveStories(updated)
  emit('story-deleted')
}

const coverGradients = [
  'linear-gradient(135deg, #a855f7, #8b5cf6)',
  'linear-gradient(135deg, #8b5cf6, #7c3aed)',
  'linear-gradient(135deg, #6d28d9, #5b21b6)',
  'linear-gradient(135deg, #7c3aed, #6d28d9)',
  'linear-gradient(135deg, #9333ea, #7c3aed)',
]

function getCoverGradient(id) {
  const idx = id.charCodeAt(id.length - 1) % coverGradients.length
  return coverGradients[idx]
}

const coverEmojis = ['', '', '', '', '', '']
function getCoverEmoji(id) {
  const idx = id.charCodeAt(id.length - 1) % coverEmojis.length
  return coverEmojis[idx]
}

function getImportCoverGradient() {
  return 'linear-gradient(135deg, #2d8a4e, #3da35d)'
}
</script>

<template>
  <div class="book-shelf">
    <!-- 标题栏 -->
    <div class="shelf-header">
      <h2 class="shelf-title">书架</h2>
      <div class="shelf-header-actions">
        <button class="shelf-add-btn" @click="emit('open-new-story')">
          <span class="add-icon">＋</span>
          <span class="add-label">新建</span>
        </button>
        <button class="shelf-import-btn" @click="emit('open-book-import')">
          <span class="import-icon">📥</span>
          <span class="import-label">导入</span>
        </button>
        <button class="shelf-settings-btn" @click="emit('open-settings')">⚙️</button>
      </div>
    </div>

    <!-- 空书架 -->
    <div v-if="stories.length === 0" class="shelf-empty">
      <div class="shelf-empty-icon">📚</div>
      <p class="shelf-empty-text">书架上还没有书</p>
      <p class="shelf-empty-hint">选择一本世界书，开始你的故事</p>
      <button class="shelf-new-btn" @click="emit('open-new-story')">
        ＋ 新建故事
      </button>
    </div>

    <!-- 故事列表 -->
    <div v-else class="shelf-grid">
      <div
        v-for="story in stories"
        :key="story.id"
        class="shelf-book-card"
        @click="emit('open-story', story)"
      >
        <div class="book-cover" :style="{ background: story.sourceType === 'imported' ? getImportCoverGradient() : getCoverGradient(story.id) }">
          <span class="cover-emoji" v-if="story.sourceType === 'imported'">📖</span>
          <span class="cover-emoji" v-else-if="getCoverEmoji(story.id)">{{ getCoverEmoji(story.id) }}</span>
        </div>
        <div class="book-info">
          <h3 class="book-title">{{ story.title || '未命名' }}</h3>
          <p class="book-brief">{{ story.summary || story.brief || '暂无简介' }}</p>
          <div class="book-meta">
            <span class="book-chapters">{{ story.chapters?.length || 0 }} 章</span>
            <span v-if="story.sourceType === 'imported'" class="import-badge">{{ story.importFormat?.toUpperCase() || '导入' }}</span>
            <span v-else class="book-world">{{ getWorldBookTitle(story.worldBookId) }}</span>
          </div>
          <span class="book-time">{{ formatReaderTime(story.updatedAt) }}</span>
        </div>
        <div class="book-actions">
          <button
            class="book-chapters-btn"
            @click.stop="emit('open-chapters', story)"
          >
            目录
          </button>
          <button
            class="book-delete-btn"
            @click.stop="deleteStoryItem(story.id, story.title || '未命名')"
          >
            ×
          </button>
        </div>
      </div>
    </div>

    <!-- 底部间距 -->
    <div class="bottom-spacer" />
  </div>
</template>

<style scoped>
.book-shelf {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: linear-gradient(180deg, #f5f0ff 0%, #ede4ff 100%);
}

/* 标题栏 */
.shelf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 10px;
  padding-top: 12px;
}

.shelf-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #2d2040;
  margin: 0;
}

.shelf-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shelf-add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #7c5cbf;
  color: #fff;
  border: none;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.shelf-import-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #2d8a4e;
  color: #fff;
  border: none;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.add-icon {
  font-size: 1rem;
}

.shelf-settings-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px;
  color: #7c5cbf;
}

/* 空书架 */
.shelf-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.shelf-empty-icon {
  font-size: 3rem;
  margin-bottom: 16px;
}

.shelf-empty-text {
  font-size: 1.1rem;
  font-weight: 600;
  color: #2d2040;
  margin-bottom: 6px;
}

.shelf-empty-hint {
  font-size: 0.85rem;
  color: #8b7ea8;
  margin-bottom: 24px;
}

.shelf-new-btn {
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  border: none;
  color: #fff;
  padding: 12px 28px;
  border-radius: 24px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s;
}

.shelf-new-btn:hover {
  transform: scale(1.03);
}

/* 故事列表 */
.shelf-grid {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shelf-book-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  cursor: pointer;
  transition: transform 0.15s;
  box-shadow: 0 2px 8px rgba(124, 92, 191, 0.06);
}

.shelf-book-card:active {
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
  box-shadow: 0 2px 6px rgba(0,0,0,0.1);
}

.cover-emoji {
  font-size: 1.3rem;
}

.book-info {
  flex: 1;
  min-width: 0;
}

.book-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #2d2040;
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.book-brief {
  font-size: 0.75rem;
  color: #8b7ea8;
  margin: 0 0 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.book-meta {
  display: flex;
  gap: 10px;
  font-size: 0.7rem;
  color: #b0a8c0;
  margin-bottom: 2px;
}

.book-time {
  font-size: 0.68rem;
  color: #c0b8d0;
}

.import-badge {
  font-size: 0.65rem;
  color: #2d8a4e;
  background: #e8f5ee;
  padding: 1px 6px;
  border-radius: 6px;
  font-weight: 600;
}

.book-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.book-chapters-btn {
  background: #f0e8ff;
  border: 1px solid #e0d4f5;
  color: #7c5cbf;
  padding: 5px 10px;
  border-radius: 16px;
  font-size: 0.72rem;
  cursor: pointer;
  white-space: nowrap;
}

.book-delete-btn {
  background: none;
  border: none;
  color: #c0b8d0;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: color 0.2s;
}

.book-delete-btn:hover {
  color: #ff6b6b;
}

.bottom-spacer {
  height: 16px;
}

.platform-android.android-portrait .shelf-add-btn,
.platform-android.android-portrait .shelf-import-btn,
.platform-android.android-portrait .shelf-new-btn,
.platform-android.android-portrait .book-chapters-btn,
.platform-android.android-portrait .shelf-settings-btn {
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
