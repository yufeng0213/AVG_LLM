<script setup>
/**
 * BookDetail.vue - 书籍详情页
 * 仿参考图2：封面+信息+评分+标签+目录预览+书评+操作按钮
 * 支持真实故事和 LLM 生成的角色小说
 */
import { ref, computed, onMounted } from 'vue'
import {
  loadStoryChapters,
  loadStories,
  saveStories,
  saveStoryMeta,
  updateStory,
  addChapter,
  insertChapter,
  isSQLiteAvailable,
} from './composables/useReaderData.js'
import { convertGeneratedBookToStory } from './composables/useGeneratedBooks.js'
import { loadWorldBooks } from '../../../src/worldbook/worldBookStore.js'
import { generateBookChapterFromCharacter } from '../../../src/llm/llmService.reader.js'
import { loadSettings } from './composables/useReaderData.js'

const props = defineProps({
  story: { type: Object, required: true },
})
const emit = defineEmits(['back', 'open-reader', 'open-chapters'])

const story = ref(null)
const chapters = ref([])
const isBookmarked = ref(false)
const showFullIntro = ref(false)
const isGenerated = ref(false)
const characterName = ref('')
const characterInfo = ref(null)
const worldBookId = ref('')

// LLM 生成状态
const generating = ref(false)
const genProgress = ref('')
const genError = ref('')

onMounted(async () => {
  // 判断是否是生成的书
  isGenerated.value = !!(props.story.characterId || props.story._fromGenerated || props.story.discoveredAt)

  if (isGenerated.value) {
    // 生成的角色小说：先加载角色信息
    story.value = { ...props.story }
    chapters.value = []

    const books = await loadWorldBooks()
    for (const wb of books) {
      const ch = (wb.characters || []).find(c => c.id === props.story.characterId)
      if (ch) {
        characterName.value = ch.name
        characterInfo.value = ch
        worldBookId.value = wb.id
        break
      }
    }

    // 非参考角色书：使用故事自带的 author 字段
    if (!characterName.value && props.story.author) {
      characterName.value = props.story.author
    }
  } else {
    const stories = await loadStories()
    const meta = stories.find(s => s.id === props.story.id)
    if (meta) {
      story.value = meta
      chapters.value = await loadStoryChapters(meta.id)
    } else {
      story.value = { ...props.story }
      chapters.value = []
    }
  }
})

const totalWords = computed(() => {
  return chapters.value.reduce((sum, ch) => sum + (ch.wordCount || 0), 0)
})

const formattedWords = computed(() => {
  const w = totalWords.value
  if (w >= 10000) return (w / 10000).toFixed(1) + '万字'
  return w + '字'
})

const latestChapter = computed(() => {
  if (chapters.value.length === 0) return null
  return chapters.value[chapters.value.length - 1]
})

const score = computed(() => {
  if (isGenerated.value) return story.value?.rating || '9.2'
  const len = chapters.value.length
  if (len === 0) return '9.7'
  if (len >= 10) return '9.8'
  return '9.' + (5 + Math.min(len, 5))
})

const popularity = computed(() => {
  if (isGenerated.value) {
    const base = Math.floor(Math.random() * 200000) + 50000
    return (base / 10000).toFixed(1) + '万'
  }
  return totalWords.value > 0 ? (totalWords.value / 1000).toFixed(1) + '万' : '0'
})

const favorites = computed(() => {
  if (isGenerated.value) {
    const base = Math.floor(Math.random() * 80000) + 10000
    return (base / 10000).toFixed(1) + '万'
  }
  const base = chapters.value.length * 500
  return base > 10000 ? (base / 10000).toFixed(1) + '万' : base.toString()
})

const tags = computed(() => {
  if (isGenerated.value) return story.value?.tags || ['热门', '新书']
  return ['热门', '独家', '连载', '慢热', '甜宠', '爽文']
})

const coverGradient = computed(() => {
  const id = story.value?.id || 'default'
  const colors = ['#a855f7', '#8b5cf6', '#6d28d9', '#7c3aed', '#5b21b6', '#4c1d95']
  const idx = id.charCodeAt(id.length - 1) % colors.length
  return `linear-gradient(135deg, ${colors[idx]}, ${colors[(idx + 1) % colors.length]})`
})

const coverEmoji = computed(() => {
  const emojis = ['', '', '', '', '']
  const id = story.value?.id || ''
  return emojis[id.charCodeAt(id.length - 1) % emojis.length] || ''
})

const introText = computed(() => {
  return story.value?.summary || '暂无简介'
})

// 书评数据
const reviewData = computed(() => {
  if (isGenerated.value && story.value?.review) {
    return story.value.review
  }
  return {
    reviewerName: '言夏晴',
    reviewText: '救命!这故事也太绝了吧!太上头了!',
    reviewerAvatar: '🗣',
    likes: 1256,
  }
})

function formatTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function handleAddToShelf() {
  if (isGenerated.value && !isBookmarked.value) {
    // 将生成的书转换为真实故事并直接保存元数据
    const converted = convertGeneratedBookToStory(story.value, worldBookId.value || story.value.worldBookId || '')
    await saveStoryMeta(converted)
    isBookmarked.value = true
    story.value = converted
    chapters.value = []
  } else {
    isBookmarked.value = !isBookmarked.value
  }
}

async function handleRead() {
  if (isGenerated.value && !isBookmarked.value) {
    // 首次阅读：加入书架 → LLM 生成第一章 → 打开阅读器
    await handleAddToShelf()
    await generateFirstChapter()
  } else {
    emit('open-reader', story.value)
  }
}

async function generateFirstChapter() {
  if (generating.value) return
  generating.value = true
  genError.value = ''

  try {
    genProgress.value = '正在生成第一章...'

    // 查找故事在 stories 中的真实引用
    const stories = await loadStories()
    const realStory = stories.find(s => s.id === story.value.id)
    if (!realStory) {
      genError.value = '找不到故事，请重试'
      return
    }

    // 加载世界书上下文
    const worldBooks = await loadWorldBooks()
    const worldBook = worldBooks.find(b => b.id === worldBookId.value) || null

    // 加载主要角色设定（用于非参考角色书）
    const settings = await loadSettings()
    const mainCharSetting = settings.mainCharacters || ''

    const result = await generateBookChapterFromCharacter({
      character: characterInfo.value || { name: characterName.value },
      book: {
        title: story.value.title,
        summary: story.value.summary,
        genre: story.value.genre,
        tags: story.value.tags,
        worldview: story.value.worldview || null,
      },
      worldBook,
      mainCharacters: mainCharSetting,
      chapterIndex: 0,
      existingChapters: [],
      wordCount: 1200,
    })

    if (!result.success) {
      genError.value = result.error || '生成失败'
      return
    }

    // 保存章节
    if (isSQLiteAvailable()) {
      await insertChapter(realStory.id, {
        title: result.title,
        content: result.content,
        cardHtml: result.cardHtml || null,
        suggestions: result.suggestions || [],
        wordCount: result.wordCount,
      })
      chapters.value = await loadStoryChapters(realStory.id)
      story.value = realStory
      story.value.chapters = chapters.value
    } else {
      addChapter(realStory, {
        title: result.title,
        content: result.content,
        cardHtml: result.cardHtml || null,
        suggestions: result.suggestions || [],
        wordCount: result.wordCount,
      })
      await saveStories(realStory)
      chapters.value = realStory.chapters
      story.value = realStory
    }

    // 生成成功，打开阅读器
    emit('open-reader', story.value)
  } catch (err) {
    genError.value = `生成时发生错误: ${err.message}`
  } finally {
    generating.value = false
    genProgress.value = ''
  }
}
</script>

<template>
  <div class="book-detail">
    <!-- 标题栏 -->
    <div class="detail-header">
      <button class="detail-back-btn" @click="emit('back')"><</button>
      <div class="detail-header-actions">
        <button class="detail-action-btn">⇪</button>
        <button class="detail-action-btn">···</button>
      </div>
    </div>

    <!-- 书籍信息区 -->
    <div class="book-info-section">
      <div class="book-cover-wrapper">
        <div class="book-cover" :style="{ background: coverGradient }">
          <span class="cover-big-emoji" v-if="coverEmoji">{{ coverEmoji }}</span>
        </div>
      </div>
      <div class="book-meta">
        <h1 class="book-title">{{ story?.title || '未命名' }}</h1>
        <p class="book-author">
          作者: {{ characterName || story?.author || '西溪' }}
        </p>
        <p class="book-status">
          {{ chapters.length > 0 ? '连载中' : (isGenerated ? '新书上市' : '连载中') }} · {{ formattedWords }}
        </p>
        <span class="book-badge">{{ isGenerated ? '新书上市' : 'TOP3 热门榜' }}</span>
      </div>
    </div>

    <!-- 评分区 -->
    <div class="score-section">
      <span class="score-value">{{ score }}</span>
      <div class="score-stars">
        <span v-for="i in 5" :key="i" class="star">⭐</span>
      </div>
    </div>

    <!-- 数据区 -->
    <div class="stats-section">
      <div class="stat-item">
        <span class="stat-value">{{ popularity }}</span>
        <span class="stat-label">人气</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ favorites }}</span>
        <span class="stat-label">收藏</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">99+</span>
        <span class="stat-label">月票</span>
      </div>
    </div>

    <!-- 标签 -->
    <div class="tags-section">
      <span v-for="tag in tags" :key="tag" class="tag">{{ tag }}</span>
    </div>

    <!-- 简介 -->
    <div class="intro-section">
      <h3 class="intro-title">简介</h3>
      <p class="intro-text" :class="{ 'intro-full': showFullIntro }">
        {{ introText }}
      </p>
      <span class="intro-toggle" @click="showFullIntro = !showFullIntro">
        {{ showFullIntro ? '收起' : '展开' }}
      </span>
    </div>

    <!-- 目录预览 -->
    <div class="toc-preview-section" @click="emit('open-chapters', story)">
      <div class="toc-preview-header">
        <h3 class="toc-preview-title">目录</h3>
        <span class="toc-count">共{{ chapters.length }}章</span>
      </div>
      <div v-if="latestChapter" class="toc-latest">
        <span class="toc-label">最新:</span>
        <span class="toc-chapter-name">{{ latestChapter.title }}</span>
        <span class="toc-time">{{ formatTime(latestChapter.createdAt) }}</span>
      </div>
      <div v-else class="toc-empty">暂无章节</div>
    </div>

    <!-- 书评 -->
    <div class="review-section">
      <div class="review-header">
        <h3 class="review-title">书评</h3>
        <span class="review-write">写书评</span>
      </div>
      <div class="review-item">
        <span class="review-avatar">{{ reviewData.reviewerAvatar }}</span>
        <div class="review-content">
          <span class="review-name">{{ reviewData.reviewerName }}:</span>
          <span class="review-text"> {{ reviewData.reviewText }}</span>
        </div>
        <span class="review-likes">👍 {{ reviewData.likes }}</span>
      </div>
    </div>

    <!-- 底部间距 -->
    <div class="bottom-spacer" />

    <!-- 生成提示 -->
    <div v-if="isGenerated && !isBookmarked" class="gen-notice">
      <p class="gen-notice-text">
        <span class="gen-icon">{{ generating ? '⟳' : '✍️' }}</span>
        {{ generating ? genProgress : `${characterName || '作者'} 还没有开始写书，点击阅读让TA开始创作` }}
      </p>
      <p v-if="genError" class="gen-error">{{ genError }}</p>
    </div>

    <!-- 底部操作栏 -->
    <div class="bottom-actions">
      <button
        class="action-btn bookmark-btn"
        :class="{ bookmarked: isBookmarked }"
        @click="handleAddToShelf"
      >
        {{ isBookmarked ? '已加入书架' : '加入书架' }}
      </button>
      <button
        class="action-btn read-btn"
        :class="{ generating: generating }"
        :disabled="generating"
        @click="handleRead"
      >
        <span v-if="generating" class="gen-spinner">⟳</span>
        {{ generating ? genProgress : (isGenerated && !isBookmarked ? '加入书架并阅读' : '立即阅读') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.book-detail {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: linear-gradient(180deg, #f5f0ff 0%, #ede4ff 100%);
}

/* 标题栏 */
.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  padding-top: 8px;
}

.detail-back-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: #2d2040;
  cursor: pointer;
  padding: 4px 8px;
}

.detail-header-actions {
  display: flex;
  gap: 8px;
}

.detail-action-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  color: #2d2040;
  cursor: pointer;
  padding: 4px 8px;
}

/* 书籍信息区 */
.book-info-section {
  display: flex;
  gap: 14px;
  padding: 12px 16px 16px;
}

.book-cover-wrapper {
  flex-shrink: 0;
}

.book-cover {
  width: 110px;
  height: 148px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(109, 40, 217, 0.15);
}

.cover-big-emoji {
  font-size: 2.8rem;
}

.book-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.book-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #2d2040;
  margin: 0 0 6px;
  line-height: 1.3;
}

.book-author {
  font-size: 0.8rem;
  color: #8b7ea8;
  margin: 0 0 4px;
}

.book-status {
  font-size: 0.78rem;
  color: #8b7ea8;
  margin: 0 0 8px;
}

.book-badge {
  display: inline-block;
  background: linear-gradient(135deg, #f59e0b, #f97316);
  color: #fff;
  font-size: 0.68rem;
  padding: 3px 10px;
  border-radius: 12px;
  font-weight: 600;
  width: fit-content;
}

/* 评分区 */
.score-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px 14px;
}

.score-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: #7c5cbf;
}

.score-stars {
  display: flex;
  gap: 2px;
}

.star {
  font-size: 0.85rem;
}

/* 数据区 */
.stats-section {
  display: flex;
  justify-content: space-around;
  padding: 12px 16px;
  background: #fff;
  margin: 0 16px 14px;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-value {
  font-size: 1rem;
  font-weight: 700;
  color: #2d2040;
}

.stat-label {
  font-size: 0.72rem;
  color: #8b7ea8;
}

/* 标签 */
.tags-section {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 14px;
}

.tag {
  background: #f0e8ff;
  color: #7c5cbf;
  font-size: 0.72rem;
  padding: 4px 12px;
  border-radius: 14px;
  font-weight: 500;
}

/* 简介 */
.intro-section {
  background: #fff;
  margin: 0 16px 14px;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}

.intro-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #2d2040;
  margin: 0 0 8px;
}

.intro-text {
  font-size: 0.82rem;
  color: #5a3d8a;
  line-height: 1.6;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.intro-full {
  -webkit-line-clamp: unset;
}

.intro-toggle {
  display: inline-block;
  margin-top: 8px;
  font-size: 0.78rem;
  color: #7c5cbf;
  cursor: pointer;
}

/* 目录预览 */
.toc-preview-section {
  background: #fff;
  margin: 0 16px 14px;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  cursor: pointer;
}

.toc-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.toc-preview-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #2d2040;
  margin: 0;
}

.toc-count {
  font-size: 0.75rem;
  color: #8b7ea8;
}

.toc-latest {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toc-label {
  font-size: 0.78rem;
  color: #8b7ea8;
}

.toc-chapter-name {
  font-size: 0.82rem;
  color: #7c5cbf;
  font-weight: 600;
}

.toc-time {
  font-size: 0.72rem;
  color: #b0a8c0;
  margin-left: auto;
}

.toc-empty {
  font-size: 0.82rem;
  color: #b0a8c0;
  text-align: center;
  padding: 8px 0;
}

/* 书评 */
.review-section {
  background: #fff;
  margin: 0 16px 14px;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.review-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #2d2040;
  margin: 0;
}

.review-write {
  font-size: 0.78rem;
  color: #7c5cbf;
  cursor: pointer;
}

.review-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.review-avatar {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.review-content {
  flex: 1;
}

.review-name {
  font-size: 0.8rem;
  color: #7c5cbf;
  font-weight: 600;
}

.review-text {
  font-size: 0.8rem;
  color: #5a3d8a;
  line-height: 1.5;
}

.review-likes {
  font-size: 0.72rem;
  color: #b0a8c0;
  flex-shrink: 0;
}

/* 生成提示 */
.gen-notice {
  background: rgba(124, 92, 191, 0.06);
  margin: 0 16px 14px;
  border-radius: 12px;
  padding: 12px 16px;
  text-align: center;
}

.gen-notice-text {
  font-size: 0.82rem;
  color: #7c5cbf;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
}

.gen-icon {
  font-size: 1rem;
}

.gen-spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
  font-size: 1rem;
}

.gen-error {
  font-size: 0.78rem;
  color: #ff6b6b;
  margin: 8px 0 0;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.bottom-spacer {
  height: 70px;
}

/* 底部操作栏 */
.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 10px;
  padding: 10px 16px;
  padding-bottom: max(10px, env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid #e8e0f0;
  z-index: 10;
}

.action-btn {
  flex: 1;
  padding: 12px;
  border-radius: 24px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: transform 0.15s;
}

.action-btn:active {
  transform: scale(0.97);
}

.bookmark-btn {
  background: #f0e8ff;
  color: #7c5cbf;
  border: 1px solid #e0d4f5;
}

.bookmark-btn.bookmarked {
  background: #7c5cbf;
  color: #fff;
}

.read-btn {
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  color: #fff;
}

.read-btn.generating {
  opacity: 0.7;
}

.platform-android.android-portrait .action-btn,
.platform-android.android-portrait .detail-back-btn,
.platform-android.android-portrait .detail-action-btn {
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
