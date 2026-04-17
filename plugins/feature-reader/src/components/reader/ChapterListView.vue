<script setup>
/**
 * ChapterListView.vue - 章节目录
 * 显示所有章节列表，支持跳转和删除。
 */
import { ref, onMounted } from 'vue'
import {
  loadStories,
  saveStories,
  updateStory,
  formatReaderTime,
} from '../../composables/useReaderData.js'

const props = defineProps({
  story: { type: Object, required: true },
})
const emit = defineEmits(['back', 'open-chapter'])

const currentStory = ref(null)

onMounted(async () => {
  const stories = await loadStories()
  currentStory.value = stories.find(s => s.id === props.story.id)
})

function getChapterWordCount(chapter) {
  return chapter?.wordCount || chapter?.content?.length || 0
}

async function deleteChapter(index) {
  if (!currentStory.value) return
  if (!confirm(`确定要删除「${currentStory.value.chapters[index].title}」吗？`)) return

  const stories = await loadStories()
  const story = stories.find(s => s.id === currentStory.value.id)
  if (!story) return

  story.chapters.splice(index, 1)
  story.updatedAt = new Date().toISOString()

  const updated = updateStory(stories, story.id, { chapters: story.chapters })
  currentStory.value = updated.find(s => s.id === story.id)
  await saveStories(updated)
}
</script>

<template>
  <div class="chapter-list">
    <div class="chapter-header">
      <span class="chapter-header-title">{{ currentStory?.title || '目录' }}</span>
      <span class="chapter-count">共 {{ currentStory?.chapters?.length || 0 }} 章</span>
    </div>

    <div class="chapter-items">
      <div
        v-for="(chapter, idx) in currentStory?.chapters || []"
        :key="chapter.id"
        class="chapter-item"
        @click="emit('open-chapter', idx)"
      >
        <span class="chapter-num">{{ idx + 1 }}</span>
        <div class="chapter-info">
          <span class="chapter-title">{{ chapter.title || `第 ${idx + 1} 章` }}</span>
          <span class="chapter-meta">
            {{ getChapterWordCount(chapter) }} 字 · {{ formatReaderTime(chapter.createdAt) }}
          </span>
        </div>
        <button
          class="chapter-delete-btn"
          @click.stop="deleteChapter(idx)"
        >
          ×
        </button>
      </div>
    </div>

    <div v-if="!currentStory?.chapters?.length" class="chapter-empty">
      还没有章节
    </div>
  </div>
</template>

<style scoped>
.chapter-list {
  padding: 16px;
  min-height: 100%;
}

.chapter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.chapter-header-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--reader-text, #fff);
}

.chapter-count {
  font-size: 0.8rem;
  color: var(--reader-secondary, #666);
}

.chapter-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.06));
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s;
}

.chapter-item:hover {
  background: var(--reader-border, rgba(255, 255, 255, 0.08));
}

.chapter-item:active {
  transform: scale(0.98);
}

.chapter-num {
  width: 28px;
  height: 28px;
  background: color-mix(in srgb, var(--reader-accent-start, #667eea) 20%, transparent);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  color: var(--reader-accent-start, #667eea);
  font-weight: 700;
  flex-shrink: 0;
}

.chapter-info {
  flex: 1;
  min-width: 0;
}

.chapter-title {
  display: block;
  font-size: 0.9rem;
  color: var(--reader-text, #fff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chapter-meta {
  font-size: 0.72rem;
  color: var(--reader-secondary, #555);
  opacity: 0.6;
}

.chapter-delete-btn {
  background: none;
  border: none;
  color: var(--reader-secondary, #555);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: color 0.2s, background 0.2s;
}

.chapter-delete-btn:hover {
  color: #ff6b6b;
  background: rgba(255, 77, 77, 0.1);
}

.chapter-empty {
  text-align: center;
  color: var(--reader-secondary, #555);
  font-size: 0.9rem;
  padding: 40px 0;
}


  .platform-android.android-portrait .chapter-delete-btn {
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
