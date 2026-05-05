<script setup>
/**
 * ChapterListView.vue - 章节目录
 * 仿参考图3：最新章节置顶 + 正序/倒序切换 + 锁图标
 */
import { ref, computed, onMounted } from 'vue'
import {
  loadStoryChapters,
  loadStories,
  saveStories,
  updateStory,
  deleteChapter as _deleteChapter,
  isSQLiteAvailable,
  loadSettings,
} from '../../composables/useReaderData.js'
import { isChapterUnlocked, getChapterOutline, saveChapterOutline, clearChapterOutline } from '../../composables/useReaderUnlock.js'
import { generateChapterOutline } from '../../../../../src/llm/llmService.reader.js'
import { loadWorldBooks } from '../../../../../src/worldbook/worldBookStore.js'
import { loadStoryMemories } from '../../../../../src/db/repos/reader.repo.js'
import { getReaderCoins, spendReaderCoins } from '../../composables/useReaderEconomy.js'

const props = defineProps({
  story: { type: Object, required: true },
})
const emit = defineEmits(['back', 'open-chapter', 'open-chapter-outline'])

const currentStory = ref(null)
const sortAsc = ref(false)
const unlockedSet = ref(new Set()) // 已解锁的章节索引集合
const outlineTitles = ref([]) // 大纲标题列表
const generatingOutline = ref(false)
const outlineCoinsCost = ref(0)
const OUTLINE_COST = 20 // 生成大纲消耗金币

onMounted(async () => {
  const chapters = await loadStoryChapters(props.story.id)
  const storyData = await loadStories()
  const meta = storyData.find(s => s.id === props.story.id)
  currentStory.value = { ...meta, chapters }

  // 加载每章解锁状态（导入书跳过）
  if (meta?.sourceType !== 'imported') {
    const set = new Set()
    for (let i = 0; i < chapters.length; i++) {
      if (await isChapterUnlocked(props.story.id, i)) {
        set.add(i)
      }
    }
    unlockedSet.value = set
  }

  // 加载大纲标题
  outlineTitles.value = await getChapterOutline(props.story.id)
})

const sortedChapters = computed(() => {
  const chs = currentStory.value?.chapters || []
  return sortAsc.value ? [...chs].reverse() : chs
})

const totalChapters = computed(() => currentStory.value?.chapters?.length || 0)

const latestChapter = computed(() => {
  const chs = currentStory.value?.chapters || []
  return chs.length > 0 ? chs[chs.length - 1] : null
})

function formatTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatFullTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function deleteChapter(index) {
  if (!currentStory.value) return
  if (!confirm(`确定要删除「${currentStory.value.chapters[index].title}」吗？`)) return

  if (isSQLiteAvailable()) {
    await _deleteChapter(currentStory.value.id, index)
    currentStory.value.chapters = await loadStoryChapters(currentStory.value.id)
  } else {
    const stories = await loadStories()
    const story = stories.find(s => s.id === currentStory.value.id)
    if (!story) return
    story.chapters.splice(index, 1)
    story.updatedAt = new Date().toISOString()
    const updated = updateStory(stories, story.id, { chapters: story.chapters })
    currentStory.value = updated.find(s => s.id === story.id)
    await saveStories(updated)
  }
}

async function handleGenerateOutline() {
  if (generatingOutline.value) return
  const canSpend = await spendReaderCoins(OUTLINE_COST)
  if (!canSpend) {
    alert(`金币不足！生成大纲需要 ${OUTLINE_COST} 金币`)
    return
  }

  generatingOutline.value = true
  try {
    const books = await loadWorldBooks()
    const worldBook = books.find(b => b.id === currentStory.value.worldBookId)
    const chapters = await loadStoryChapters(currentStory.value.id)
    const memData = await loadStoryMemories(currentStory.value.id)
    const settings = await loadSettings()

    // 取最近几章作为上下文
    const recentChapters = chapters.slice(-3)

    const existingOutlines = outlineTitles.value

    const result = await generateChapterOutline({
      worldBook,
      book: {
        title: currentStory.value.title,
        summary: currentStory.value.summary || currentStory.value.brief,
        genre: currentStory.value.genre || '',
        tags: currentStory.value.tags || [],
        worldview: currentStory.value.worldview || null,
      },
      mainCharacters: settings.mainCharacters || '',
      brief: currentStory.value.summary || currentStory.value.brief,
      existingChapters: recentChapters,
      existingOutlines,
      memories: memData?.memories || '',
      narrator: null,
      count: 10,
    })

    if (!result.success) {
      alert(`生成失败: ${result.error}`)
      return
    }

    // 追加到已有大纲，不覆盖
    outlineTitles.value = [...existingOutlines, ...result.titles]
    await saveChapterOutline(currentStory.value.id, outlineTitles.value)
  } catch (err) {
    alert(`生成时发生错误: ${err.message}`)
  } finally {
    generatingOutline.value = false
  }
}

async function handleRegenerateOutline() {
  if (!confirm('确定要重新生成大纲吗？将覆盖已有标题。')) return
  await clearChapterOutline(currentStory.value.id)
  outlineTitles.value = []
  await handleGenerateOutline()
}

// 过滤大纲：只显示尚未生成对应章节的大纲条目，保留原始索引
// 大纲标题的第 idx 条对应章节列表中的第 idx 章
const visibleOutlineTitles = computed(() => {
  const chapters = currentStory.value?.chapters || []
  return outlineTitles.value
    .map((title, idx) => ({ title, idx }))
    .filter(({ idx }) => idx >= chapters.length)
})

async function handleUnlockOutlineTitle(outlineIdx) {
  if (!currentStory.value) return
  const title = outlineTitles.value[outlineIdx]
  if (!title) return

  const result = await spendReaderCoins(50)
  if (!result) {
    alert(`金币不足！解锁本章需要 50 金币`)
    return
  }

  emit('open-chapter-outline', outlineIdx, title)
}

// 删除大纲中的某一条
async function deleteOutlineItem(outlineIdx) {
  if (!currentStory.value) return
  if (!confirm(`确定要删除大纲「${outlineTitles.value[outlineIdx]}」吗？`)) return

  outlineTitles.value.splice(outlineIdx, 1)
  await saveChapterOutline(currentStory.value.id, outlineTitles.value)
}
</script>

<template>
  <div class="chapter-list">
    <!-- 标题栏 -->
    <div class="chapter-header">
      <button class="chapter-back-btn" @click="emit('back')"><</button>
      <span class="chapter-header-title">章节目录</span>
      <button class="chapter-sort-btn" @click="sortAsc = !sortAsc">
        {{ sortAsc ? '倒序' : '正序' }} ›
      </button>
    </div>

    <!-- 章节总数 -->
    <div class="chapter-count-bar">
      共{{ totalChapters }}章
      <!-- 仅 LLM 生成的书显示生成大纲按钮 -->
      <button
        v-if="currentStory?.sourceType !== 'imported'"
        class="outline-gen-btn"
        :disabled="generatingOutline"
        @click="handleGenerateOutline"
      >
        {{ generatingOutline ? '生成中...' : (outlineTitles.length === 0 ? '📝 生成大纲' : '➕ 继续生成') }}
      </button>
      <button
        v-if="currentStory?.sourceType !== 'imported' && outlineTitles.length > 0"
        class="outline-gen-btn outline-regen-btn"
        @click="handleRegenerateOutline"
      >
        🔄 重新生成
      </button>
    </div>

    <!-- 大纲标题（仅 LLM 书显示，隐藏已生成的章节） -->
    <div v-if="currentStory?.sourceType !== 'imported' && visibleOutlineTitles.length > 0" class="outline-section">
      <div class="outline-header">
        <span class="outline-label">故事大纲</span>
        <span class="outline-count">{{ visibleOutlineTitles.length }} 章</span>
      </div>
      <div class="outline-items">
        <div
          v-for="({ title, idx }) in visibleOutlineTitles"
          :key="idx"
          class="outline-item"
          @click="handleUnlockOutlineTitle(idx)"
        >
          <span class="outline-item-num">{{ idx + 1 }}</span>
          <span class="outline-item-title">{{ title }}</span>
          <span class="outline-item-price">🔒 50</span>
          <button class="outline-delete-btn" @click.stop="deleteOutlineItem(idx)">
            ×
          </button>
        </div>
      </div>
    </div>

    <!-- 最新章节（置顶） -->
    <div
      v-if="latestChapter"
      class="chapter-latest"
      @click="emit('open-chapter', currentStory.chapters.length - 1)"
    >
      <div class="chapter-latest-header">
        <span class="chapter-latest-label">最新章节</span>
        <span class="chapter-latest-new">NEW</span>
      </div>
      <span class="chapter-latest-title">{{ latestChapter.title }}</span>
      <span class="chapter-latest-time">{{ formatFullTime(latestChapter.createdAt) }}</span>
    </div>

    <!-- 章节列表 -->
    <div class="chapter-items">
      <div
        v-for="(chapter, idx) in sortedChapters"
        :key="chapter.id"
        :class="['chapter-item', { locked: currentStory?.sourceType !== 'imported' && !unlockedSet.has(chapter.chapterIndex ?? idx) }]"
        @click="emit('open-chapter', chapter.chapterIndex ?? idx)"
      >
        <div class="chapter-info">
          <span class="chapter-title">{{ chapter.title || `第 ${idx + 1} 章` }}</span>
          <span class="chapter-meta">{{ formatTime(chapter.createdAt) }}</span>
        </div>
        <div class="chapter-actions">
          <!-- 导入书不显示锁图标 -->
          <span v-if="currentStory?.sourceType !== 'imported'" class="chapter-lock" :class="{ locked: !unlockedSet.has(chapter.chapterIndex ?? idx) }">
            {{ unlockedSet.has(chapter.chapterIndex ?? idx) ? '✅' : '🔒' }}
          </span>
          <!-- 导入书不显示删除按钮 -->
          <button
            v-if="currentStory?.sourceType !== 'imported'"
            class="chapter-delete-btn"
            @click.stop="deleteChapter(chapter.chapterIndex ?? idx)"
          >
            ×
          </button>
        </div>
      </div>
    </div>

    <div v-if="!currentStory?.chapters?.length && !latestChapter" class="chapter-empty">
      还没有章节
    </div>
  </div>
</template>

<style scoped>
.chapter-list {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: #f8f4ff;
}

/* 标题栏 */
.chapter-header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  padding-top: 10px;
  background: #fff;
  border-bottom: 1px solid #ede4ff;
}

.chapter-back-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  color: #2d2040;
  cursor: pointer;
  padding: 4px 8px;
}

.chapter-header-title {
  flex: 1;
  text-align: center;
  font-size: 1rem;
  font-weight: 700;
  color: #2d2040;
}

.chapter-sort-btn {
  background: none;
  border: none;
  font-size: 0.82rem;
  color: #7c5cbf;
  cursor: pointer;
  padding: 4px 8px;
}

/* 章节总数 */
.chapter-count-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  font-size: 0.82rem;
  color: #8b7ea8;
  background: #f8f4ff;
}

.outline-gen-btn {
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  color: #fff;
  border: none;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s;
}

.outline-gen-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.outline-gen-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 大纲标题 */
.outline-section {
  padding: 0 16px 12px;
}

.outline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed #d4c4f0;
}

.outline-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #7c5cbf;
}

.outline-count {
  font-size: 0.72rem;
  color: #9b8ec4;
}

.outline-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.outline-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid #e8e0f0;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.outline-item:active {
  transform: scale(0.98);
  border-color: #7c5cbf;
}

.outline-item-num {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  border-radius: 6px;
  flex-shrink: 0;
}

.outline-item-title {
  flex: 1;
  font-size: 0.85rem;
  color: #2d2040;
  font-weight: 500;
}

.outline-item-price {
  font-size: 0.72rem;
  color: #f59e0b;
  flex-shrink: 0;
}

.outline-delete-btn {
  background: none;
  border: none;
  color: #b0a8c0;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  flex-shrink: 0;
  transition: color 0.2s, background 0.2s;
}

.outline-delete-btn:hover {
  color: #ff6b6b;
  background: rgba(255, 77, 77, 0.1);
}

/* 最新章节 */
.chapter-latest {
  margin: 0 16px 10px;
  background: linear-gradient(135deg, #f0e8ff, #e8d8ff);
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chapter-latest-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chapter-latest-label {
  font-size: 0.75rem;
  color: #7c5cbf;
  font-weight: 600;
}

.chapter-latest-new {
  font-size: 0.65rem;
  background: #7c5cbf;
  color: #fff;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 600;
}

.chapter-latest-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #2d2040;
}

.chapter-latest-time {
  font-size: 0.72rem;
  color: #b0a8c0;
}

/* 章节列表 */
.chapter-items {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.chapter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid #ede4ff;
  cursor: pointer;
  transition: background 0.15s;
}

.chapter-item.locked {
  opacity: 0.5;
}

.chapter-item:active {
  background: rgba(124, 92, 191, 0.04);
}

.chapter-info {
  flex: 1;
  min-width: 0;
}

.chapter-title {
  display: block;
  font-size: 0.88rem;
  color: #2d2040;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chapter-meta {
  font-size: 0.72rem;
  color: #b0a8c0;
  margin-top: 2px;
}

.chapter-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.chapter-lock {
  font-size: 0.85rem;
}

.chapter-lock.locked {
  opacity: 0.6;
}

.chapter-delete-btn {
  background: none;
  border: none;
  color: #b0a8c0;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  transition: color 0.2s, background 0.2s;
}

.chapter-delete-btn:hover {
  color: #ff6b6b;
  background: rgba(255, 77, 77, 0.1);
}

.chapter-empty {
  text-align: center;
  color: #b0a8c0;
  font-size: 0.9rem;
  padding: 40px 0;
}

.platform-android.android-portrait .chapter-back-btn,
.platform-android.android-portrait .chapter-sort-btn,
.platform-android.android-portrait .chapter-delete-btn,
.platform-android.android-portrait .outline-gen-btn,
.platform-android.android-portrait .outline-delete-btn {
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
