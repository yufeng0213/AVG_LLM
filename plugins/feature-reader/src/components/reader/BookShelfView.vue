<script setup>
/**
 * BookShelfView.vue - 书架首页
 * 显示所有故事卡片，支持新建故事。
 */
import { onMounted, ref } from 'vue'
import { loadStories, saveStories, deleteStory } from '../../composables/useReaderData.js'
import { loadWorldBooks } from '../../../../../src/worldbook/worldBookStore.js'
import { formatReaderTime } from '../../composables/useReaderData.js'

const emit = defineEmits(['open-story', 'open-new-story', 'open-chapters', 'story-deleted'])

const stories = ref([])

onMounted(async () => {
  stories.value = await loadStories()
})

function getWorldBookTitle(worldBookId) {
  // 简化处理：显示世界书 ID，实际可缓存名称
  return worldBookId ? worldBookId.slice(0, 12) : '—'
}

async function deleteStoryItem(storyId, storyTitle) {
  if (!confirm(`确定要删除「${storyTitle}」吗？此操作不可恢复。`)) return

  const stories = await loadStories()
  const updated = deleteStory(stories, storyId)
  stories.length = 0
  stories.push(...updated)
  await saveStories(updated)
  emit('story-deleted')
}
</script>

<template>
  <div class="book-shelf">
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
    <div v-else class="shelf-list">
      <div
        v-for="story in stories"
        :key="story.id"
        class="shelf-book-card"
        @click="emit('open-story', story)"
      >
        <div class="book-cover">
          <span class="book-cover-icon">📖</span>
        </div>
        <div class="book-info">
          <h3 class="book-title">{{ story.title || '未命名' }}</h3>
          <p class="book-brief">{{ story.brief || '暂无简介' }}</p>
          <div class="book-meta">
            <span class="book-chapters">{{ story.chapters?.length || 0 }} 章</span>
            <span class="book-world">来自: {{ getWorldBookTitle(story.worldBookId) }}</span>
          </div>
          <span class="book-time">{{ formatReaderTime(story.updatedAt) }}</span>
        </div>
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

      <button class="shelf-new-float" @click="emit('open-new-story')">
        ＋
      </button>
    </div>
  </div>
</template>

<style scoped>
.book-shelf {
  padding: 16px;
  min-height: 100%;
}

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
  color: var(--reader-text, #ccc);
  margin-bottom: 6px;
}

.shelf-empty-hint {
  font-size: 0.85rem;
  color: var(--reader-secondary, #666);
  margin-bottom: 24px;
}

.shelf-new-btn {
  background: linear-gradient(135deg, var(--reader-accent-start, #667eea), var(--reader-accent-end, #764ba2));
  border: none;
  color: var(--reader-text, #fff);
  padding: 12px 28px;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s;
}

.shelf-new-btn:hover {
  transform: scale(1.03);
}

.shelf-new-btn:active {
  transform: scale(0.97);
}

.shelf-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 60px;
}

.shelf-book-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.08));
  border-radius: 14px;
  padding: 12px;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s;
}

.shelf-book-card:hover {
  background: var(--reader-border, rgba(255, 255, 255, 0.08));
  transform: translateY(-1px);
}

.shelf-book-card:active {
  transform: scale(0.98);
}

.book-cover {
  width: 56px;
  height: 72px;
  background: linear-gradient(135deg, var(--reader-bg, #1a1a3e), color-mix(in srgb, var(--reader-bg, #2d2d5e) 80%, var(--reader-accent-end, #5e5e)));
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
}

.book-cover-icon {
  font-size: 1.5rem;
}

.book-info {
  flex: 1;
  min-width: 0;
}

.book-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--reader-text, #fff);
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.book-brief {
  font-size: 0.78rem;
  color: var(--reader-secondary, #8b9dc3);
  margin: 0 0 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.book-meta {
  display: flex;
  gap: 12px;
  font-size: 0.72rem;
  color: var(--reader-secondary, #555);
  opacity: 0.6;
  margin-bottom: 2px;
}

.book-time {
  font-size: 0.7rem;
  color: var(--reader-secondary, #444);
  opacity: 0.5;
}

.book-chapters-btn {
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  color: var(--reader-secondary, #8b9dc3);
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 0.75rem;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s;
}

.book-chapters-btn:hover {
  background: var(--reader-border, rgba(255, 255, 255, 0.12));
}

.book-delete-btn {
  background: none;
  border: none;
  color: var(--reader-secondary, #555);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: color 0.2s, background 0.2s;
  flex-shrink: 0;
}

.book-delete-btn:hover {
  color: #ff6b6b;
  background: rgba(255, 77, 77, 0.1);
}

.shelf-new-float {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--reader-accent-start, #667eea), var(--reader-accent-end, #764ba2));
  border: none;
  color: var(--reader-text, #fff);
  font-size: 1.5rem;
  cursor: pointer;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--reader-accent-start, #667eea) 40%, transparent);
  transition: transform 0.15s;
  z-index: 100;
}

.shelf-new-float:hover {
  transform: scale(1.08);
}

.shelf-new-float:active {
  transform: scale(0.95);
}
  .platform-android.android-portrait .book-chapters-btn,
  .platform-android.android-portrait .book-delete-btn,
  .platform-android.android-portrait .shelf-new-btn,
  .platform-android.android-portrait .shelf-new-float {
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
