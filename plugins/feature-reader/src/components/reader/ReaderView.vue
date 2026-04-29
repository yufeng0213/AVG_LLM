<script setup>
/**
 * ReaderView.vue - 小说阅读器
 * 简单滚动渲染，卡片插入在正文中或末尾。
 */
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { marked } from 'marked'
import {
  loadStories,
  saveStories,
  addChapter,
  loadSettings,
  getChapter,
  loadStoryMemories,
  saveStoryMemories,
  loadStoryChapters,
  loadStoryChapter,
  updateStory,
  isSQLiteAvailable,
} from '../../composables/useReaderData.js'
import { generateNextChapter, extractStoryMemories } from '../../../../../src/llm/llmService.reader.js'
import { loadWorldBooks } from '../../../../../src/worldbook/worldBookStore.js'
import { loadBeautifyConfig, beautifyHtml, DEFAULT_STYLES } from '../../composables/readerBeautifier.js'

const props = defineProps({
  story: { type: Object, required: true },
})
const emit = defineEmits(['back', 'open-chapters'])

const currentStory = ref(null)
const chapterIndex = ref(0)
const renderedContent = ref('')
const generating = ref(false)
const error = ref('')
const userDirection = ref('')
const settings = ref({ fontSize: 16, lineHeight: 1.8, theme: 'dark', contextChapters: 1 })
const beautifyConfig = ref(null)

const contentEl = ref(null)
const scrollProgress = ref(0)

const currentChapter = computed(() =>
  currentStory.value ? getChapter(currentStory.value, chapterIndex.value) : null
)

const hasCard = computed(() => !!currentChapter.value?.cardHtml)

const isFirstChapter = computed(() => chapterIndex.value === 0)
const isLastChapter = computed(() =>
  currentStory.value ? chapterIndex.value >= (currentStory.value.chapters?.length || 1) - 1 : true
)
const chapterCount = computed(() => currentStory.value ? (currentStory.value.chapters?.length || 0) : 0)

// Markdown 渲染 + 美化
const htmlContent = computed(() => {
  if (!renderedContent.value) return ''
  let html = ''
  try { html = marked(renderedContent.value) } catch { html = renderedContent.value }
  return beautifyHtml(html, beautifyConfig.value)
})

// 滚动进度
function handleScroll() {
  const el = contentEl.value
  if (!el) return
  const { scrollTop, scrollHeight, clientHeight } = el
  const maxScroll = scrollHeight - clientHeight
  scrollProgress.value = maxScroll > 0 ? scrollTop / maxScroll : 0
}

/**
 * 注入美化样式到 document head
 */
function injectBeautifyStyles(css) {
  const existing = document.getElementById('reader-beautify-styles')
  if (!existing) {
    const style = document.createElement('style')
    style.id = 'reader-beautify-styles'
    style.textContent = css
    document.head.appendChild(style)
  }
}

onMounted(async () => {
  const storyData = await loadStories()
  const metaStory = storyData.find(s => s.id === props.story.id)
  if (!metaStory) return

  const chapters = await loadStoryChapters(metaStory.id)
  currentStory.value = { ...metaStory, chapters }
  settings.value = await loadSettings()
  // 加载美化配置
  beautifyConfig.value = loadBeautifyConfig(settings.value.beautifyConfig)

  if (props.story.chapterIndex != null) {
    chapterIndex.value = Math.min(props.story.chapterIndex, (chapters.length || 1) - 1)
  } else {
    chapterIndex.value = Math.min(metaStory.lastReadChapter ?? 0, (chapters.length || 1) - 1)
  }
  loadChapterContent()
  // 注入美化样式
  injectBeautifyStyles(beautifyConfig.value.styles || DEFAULT_STYLES)
})

watch(() => props.story?.chapterIndex, (newIdx) => {
  if (newIdx != null && currentStory.value) {
    chapterIndex.value = Math.min(newIdx, (currentStory.value.chapters?.length || 1) - 1)
    loadChapterContent()
  }
})

function loadChapterContent() {
  const ch = currentChapter.value
  if (ch) {
    renderedContent.value = ch.content || ''
    userDirection.value = ''
    error.value = ''
    nextTick(() => {
      if (contentEl.value) contentEl.value.scrollTop = 0
    })
  }
}

async function goPrevChapter() {
  if (!isFirstChapter.value) {
    chapterIndex.value--
    loadChapterContent()
  }
}

async function goNextChapter() {
  if (!isLastChapter.value) {
    chapterIndex.value++
    loadChapterContent()
  }
}

async function handleGenerateNext() {
  if (generating.value) return
  generating.value = true
  error.value = ''
  try {
    const storyId = currentStory.value.id
    const chapters = await loadStoryChapters(storyId)
    const books = await loadWorldBooks()
    const worldBook = books.find(b => b.id === currentStory.value.worldBookId)
    const n = settings.value.contextChapters ?? 1
    const recentChapters = n > 0 ? (chapters.slice(-n) || []) : []

    const threshold = settings.value.memoryThreshold ?? 0
    let memories = ''
    if (threshold > 0) {
      const memData = await loadStoryMemories(storyId)
      const chaptersSinceExtract = (memData.lastExtractedAt === 0)
        ? chapters.length || 0
        : chapters.filter(ch => new Date(ch.createdAt) > new Date(memData.lastExtractedAt)).length || 0

      if (chaptersSinceExtract >= threshold) {
        const chaptersToExtract = chaptersSinceExtract >= threshold * 2
          ? chapters.slice(-threshold) || []
          : chapters.filter(ch => memData.lastExtractedAt === 0 || new Date(ch.createdAt) > new Date(memData.lastExtractedAt)) || []

        const extractResult = await extractStoryMemories({ chapters: chaptersToExtract })
        if (extractResult.success) {
          memories = extractResult.content
          await saveStoryMemories(storyId, {
            memories: extractResult.content,
            lastExtractedAt: extractResult.extractedAt,
            chapterCount: chaptersToExtract.length,
          })
        }
      } else if (memData.memories) {
        memories = memData.memories
      }
    }

    const result = await generateNextChapter({
      worldBook,
      recentChapters,
      userDirection: userDirection.value.trim() || '自由发展',
      wordCount: 1200,
      narrator: null,
      memories: memories || undefined,
    })
    if (!result.success) { error.value = result.error || '生成失败'; return }

    if (isSQLiteAvailable()) {
      const newChapter = addChapter({ chapters }, {
        title: result.title,
        content: result.content,
        cardHtml: result.cardHtml || null,
        suggestions: result.suggestions || [],
        wordCount: result.wordCount,
      })
      currentStory.value.chapters = chapters
      currentStory.value.chapters = await loadStoryChapters(storyId)
    } else {
      const stories = await loadStories()
      const story = stories.find(s => s.id === storyId)
      if (!story) return
      addChapter(story, { title: result.title, content: result.content, cardHtml: result.cardHtml || null, suggestions: result.suggestions || [], wordCount: result.wordCount })
      const updated = updateStory(stories, story.id, { chapters: story.chapters })
      await saveStories(updated)
      currentStory.value = updated.find(s => s.id === storyId)
    }

    chapterIndex.value = currentStory.value.chapters.length - 1
    loadChapterContent()
  } catch (e) {
    error.value = e.message || '生成时发生错误'
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="reader-view">
    <!-- 顶栏 -->
    <div class="reader-header">
      <span class="reader-chapter-num">第 {{ chapterIndex + 1 }}/{{ chapterCount }} 章</span>
      <span class="reader-chapter-title">{{ currentChapter?.title || '加载中...' }}</span>
      <button class="reader-header-btn" @click="emit('open-chapters', currentStory)">☰</button>
    </div>

    <!-- 滚动内容区 -->
    <div
      ref="contentEl"
      class="reader-body"
      @scroll="handleScroll"
      :style="{ fontSize: settings.fontSize + 'px', lineHeight: settings.lineHeight }"
    >
      <!-- 正文 -->
      <div class="reader-content" v-html="htmlContent" />

      <!-- 卡片（有则渲染在正文下方） -->
      <div v-if="hasCard" class="card-inline" v-html="currentChapter.cardHtml" />

      <!-- 章节结束分隔线 -->
      <div class="chapter-divider">— 本章完 —</div>

      <!-- 最后一章：生成下一章表单 -->
      <div v-if="isLastChapter && !generating" class="next-gen-form">
        <p class="next-gen-label">继续阅读下一章</p>
        <input
          v-model="userDirection"
          class="next-gen-input"
          type="text"
          placeholder="输入你期望的剧情方向（可选）..."
          maxlength="100"
        />
        <button class="next-gen-btn" @click="handleGenerateNext">生成下一章</button>
      </div>

      <!-- 生成中 -->
      <div v-if="isLastChapter && generating" class="chapter-loading">
        <span class="spinner">⟳</span>
        <span>正在生成下一章...</span>
      </div>

      <!-- 非最后一章：跳转到下一章 -->
      <div v-if="!isLastChapter && !generating" class="next-chapter-link" @click="goNextChapter">
        下一章 →
      </div>

      <!-- 底部间距，给底栏留出空间 -->
      <div class="bottom-spacer" />
    </div>

    <!-- 底栏 -->
    <div class="reader-footer">
      <div class="footer-info">
        <span class="footer-wordcount">{{ currentChapter?.wordCount || currentChapter?.content?.length || 0 }} 字</span>
        <span class="footer-scroll">{{ Math.round(scrollProgress * 100) }}%</span>
      </div>
      <div class="footer-progress">
        <div class="progress-fill" :style="{ width: (scrollProgress * 100) + '%' }" />
      </div>
      <div class="footer-chapter-nav">
        <button class="footer-btn" :disabled="isFirstChapter" @click="goPrevChapter">← 上一章</button>
        <button class="footer-btn" :disabled="isLastChapter" @click="goNextChapter">下一章 →</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reader-view {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--reader-bg);
  color: var(--reader-text);
}

/* 顶栏 */
.reader-header {
  flex-shrink: 0;
  display: flex; align-items: center; padding: 8px 16px;
  background: var(--reader-header-bg);
  border-bottom: 1px solid var(--reader-border);
}
.reader-chapter-num { font-size: 0.72rem; color: var(--reader-accent-start); font-weight: 600; }
.reader-chapter-title {
  flex: 1; text-align: center; font-size: 0.85rem; font-weight: 600;
  color: var(--reader-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.reader-header-btn {
  background: none; border: none; color: var(--reader-secondary); font-size: 1.1rem;
  cursor: pointer; padding: 4px 8px;
}

/* 滚动内容区 */
.reader-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 22px 4px;
  -webkit-overflow-scrolling: touch;
}

/* 正文 */
.reader-content { width: 100%; }

/* Markdown 样式 */
.reader-body :deep(h1),
.reader-body :deep(h2),
.reader-body :deep(h3) { margin: 0.8em 0 0.4em; font-weight: 700; }

.reader-body :deep(p) { margin: 0.5em 0; text-indent: 2em; text-align: justify; }

.reader-body :deep(strong) { color: var(--reader-strong); }
.reader-body :deep(em) { font-style: italic; }

.reader-body :deep(blockquote) {
  border-left: 3px solid var(--reader-accent-start); padding-left: 12px;
  margin: 0.8em 0; opacity: 0.8;
}

.reader-body :deep(hr) { border: none; text-align: center; margin: 1em 0; opacity: 0.3; }
.reader-body :deep(ul),
.reader-body :deep(ol) { padding-left: 1.5em; }

/* 卡片 */
.card-inline {
  margin: 20px 0;
  border-radius: 12px;
  overflow: hidden;
}
.card-inline :deep(img) {
  max-width: 100%;
}

/* 章节分隔线 */
.chapter-divider {
  text-align: center;
  color: var(--reader-secondary);
  font-size: 0.95rem;
  margin: 40px 0 24px;
  letter-spacing: 4px;
}

/* 生成下一章表单 */
.next-gen-form {
  width: 100%;
  max-width: 320px;
  margin: 0 auto;
  background: var(--reader-panel-bg);
  border: 1px solid var(--reader-border);
  border-radius: 12px;
  padding: 16px;
}

.next-gen-label {
  font-size: 0.85rem;
  color: var(--reader-secondary);
  margin: 0 0 10px;
  font-weight: 600;
  text-align: center;
}

.next-gen-input {
  width: 100%;
  background: var(--reader-panel-bg);
  border: 1px solid var(--reader-border);
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--reader-text);
  font-size: 0.82rem;
  outline: none;
  margin-bottom: 10px;
  box-sizing: border-box;
}

.next-gen-input:focus { border-color: var(--reader-accent-start); }

.next-gen-btn {
  width: 100%;
  background: linear-gradient(135deg, var(--reader-accent-start), var(--reader-accent-end));
  border: none;
  color: var(--reader-text);
  padding: 12px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s;
}

.next-gen-btn:hover { transform: scale(1.02); }
.next-gen-btn:active { transform: scale(0.98); }

.next-gen-error {
  margin-top: 10px;
  background: rgba(255, 77, 77, 0.1);
  border: 1px solid rgba(255, 77, 77, 0.3);
  border-radius: 8px;
  padding: 10px 12px;
  color: #ff6b6b;
  font-size: 0.82rem;
}

.chapter-loading {
  text-align: center;
  color: var(--reader-secondary);
  font-size: 0.85rem;
  margin: 20px 0;
}

.next-chapter-link {
  text-align: center;
  color: var(--reader-accent-start);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  padding: 16px;
  margin: 16px 0;
  border: 1px solid var(--reader-accent-start);
  border-radius: 8px;
  transition: background 0.2s;
}

.next-chapter-link:hover { background: var(--reader-border); }

.bottom-spacer {
  height: 20px;
}

/* 底栏 */
.reader-footer {
  flex-shrink: 0;
  background: var(--reader-footer-bg);
  padding: 6px 16px 8px;
  border-top: 1px solid var(--reader-border);
}
.footer-info { display: flex; justify-content: space-between; align-items: center; }
.footer-wordcount { font-size: 0.72rem; color: var(--reader-secondary); }
.footer-scroll { font-size: 0.68rem; color: var(--reader-secondary); opacity: 0.6; }
.footer-progress { height: 2px; background: var(--reader-border); border-radius: 1px; overflow: hidden; margin-top: 4px; }
.progress-fill { height: 100%; background: linear-gradient(90deg, var(--reader-accent-start), var(--reader-accent-end)); transition: width 0.3s ease; }
.footer-chapter-nav { display: flex; gap: 10px; margin-top: 6px; }
.footer-btn {
  flex: 1; background: var(--reader-panel-bg);
  border: 1px solid var(--reader-border); border-radius: 6px;
  padding: 6px; color: var(--reader-secondary); font-size: 0.75rem;
  cursor: pointer; transition: background 0.2s;
}
.footer-btn:hover:not(:disabled) { background: var(--reader-border); }
.footer-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* 动画 */
.spinner { display: inline-block; animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.platform-android.android-portrait .reader-header-btn {
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
