<script setup>
/**
 * ReaderView.vue - 小说阅读器
 * 使用内容测量分页：渲染到隐藏容器测量，按元素分组到页面，
 * 只显示当前页的元素，不存在截断问题。
 */
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { marked } from 'marked'
import {
  loadStories,
  saveStories,
  updateStory,
  addChapter,
  loadSettings,
  getChapter,
} from '../../composables/useReaderData.js'
import { generateNextChapter } from '../../../../../src/llm/llmService.reader.js'
import { loadWorldBooks } from '../../../../../src/worldbook/worldBookStore.js'

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

// 分页相关
const totalPages = ref(1)
const currentPage = ref(0)
const pageGroups = ref([]) // [[el1, el2, ...], [el3, el4, ...], ...]
const showToolbar = ref(false)

// 隐藏测量容器
const measureEl = ref(null)
// 显示容器
const displayEl = ref(null)

const currentChapter = computed(() =>
  currentStory.value ? getChapter(currentStory.value, chapterIndex.value) : null
)

const htmlContent = computed(() => {
  if (!renderedContent.value) return ''
  try { return marked(renderedContent.value) } catch { return renderedContent.value }
})

const isFirstChapter = computed(() => chapterIndex.value === 0)
const isLastChapter = computed(() =>
  currentStory.value ? chapterIndex.value >= (currentStory.value.chapters?.length || 1) - 1 : true
)
const chapterCount = computed(() => currentStory.value ? (currentStory.value.chapters?.length || 0) : 0)

onMounted(async () => {
  const stories = await loadStories()
  const story = stories.find(s => s.id === props.story.id)
  if (!story) return
  currentStory.value = story
  settings.value = await loadSettings()

  // 优先使用目录传入的 chapterIndex（从目录跳转），否则恢复上次阅读进度
  if (props.story.chapterIndex != null) {
    chapterIndex.value = Math.min(props.story.chapterIndex, (story.chapters?.length || 1) - 1)
    loadChapterContent(true)
  } else {
    chapterIndex.value = Math.min(story.lastReadChapter ?? 0, (story.chapters?.length || 1) - 1)
    loadChapterContent()
  }
})

// 监听目录传入的 chapterIndex 变化（组件已挂载时再次从目录跳转）
watch(() => props.story?.chapterIndex, (newIdx) => {
  if (newIdx != null && currentStory.value) {
    chapterIndex.value = Math.min(newIdx, (currentStory.value.chapters?.length || 1) - 1)
    loadChapterContent(true)
  }
})

watch([htmlContent, () => settings.value.fontSize, () => settings.value.lineHeight], () => {
  nextTick(() => calcPages())
})

function loadChapterContent(startFromBeginning = false) {
  const ch = currentChapter.value
  if (ch) {
    renderedContent.value = ch.content || ''
    userDirection.value = ''
    error.value = ''
    nextTick(() => {
      calcPages()
      if (startFromBeginning || ch.lastReadPage <= 0) {
        currentPage.value = 0
      } else {
        currentPage.value = Math.min(ch.lastReadPage, totalPages.value - 1)
      }
    })
  }
}

/**
 * 核心分页算法：
 * 1. 把内容放入隐藏测量容器
 * 2. 从上到下测量每个子元素高度
 * 3. 累加高度，每到页面高度就分组
 * 4. 记录每组包含哪些子元素
 */
function calcPages() {
  if (!measureEl.value || !displayEl.value || !htmlContent.value) {
    totalPages.value = 1
    currentPage.value = 0
    pageGroups.value = [[]]
    return
  }

  const container = measureEl.value
  // 同步宽高与显示容器，确保文字换行和排版一致
  container.style.width = displayEl.value.clientWidth + 'px'
  container.style.height = displayEl.value.clientHeight + 'px'
  // 有效内容高度 = 显示容器高度 - 上下padding (20 + 4)
  const pageH = displayEl.value.clientHeight - 24

  // 放入完整 HTML 到测量容器
  container.innerHTML = htmlContent.value

  const children = Array.from(container.children)
  if (children.length === 0) {
    totalPages.value = 1
    currentPage.value = 0
    pageGroups.value = [[]]
    return
  }

  const groups = []
  let currentGroup = []
  let currentHeight = 0

  for (const child of children) {
    const h = child.offsetHeight || 0
    const margin = parseFloat(getComputedStyle(child).marginTop) || 0
    const marginBottom = parseFloat(getComputedStyle(child).marginBottom) || 0
    const totalH = margin + h + marginBottom

    if (currentGroup.length > 0 && currentHeight + totalH > pageH) {
      // 当前页满了，开新页
      groups.push([...currentGroup])
      currentGroup = [child.outerHTML]
      currentHeight = totalH
    } else {
      currentGroup.push(child.outerHTML)
      currentHeight += totalH
    }
  }

  // 最后一页
  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  // 生成下一章表单独占一页
  groups.push(['__chapter_end__'])

  pageGroups.value = groups
  totalPages.value = groups.length
  currentPage.value = Math.min(currentPage.value, totalPages.value - 1)
}

function nextPage() {
  if (currentPage.value < totalPages.value - 1) {
    currentPage.value++
    savePageProgress()
  }
}

function prevPage() {
  if (currentPage.value > 0) {
    currentPage.value--
    savePageProgress()
  }
}

function handleBodyClick(e) {
  const target = e.target
  if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.tagName === 'TEXTAREA') return
  if (target.closest('.chapter-end-page')) return
  const x = e.offsetX
  const width = displayEl.value?.clientWidth || 0
  if (x < width / 3) {
    prevPage()
  } else if (x > width * 2 / 3) {
    nextPage()
  } else {
    showToolbar.value = !showToolbar.value
  }
}

async function savePageProgress() {
  if (!currentStory.value) return
  const stories = await loadStories()
  const story = stories.find(s => s.id === currentStory.value.id)
  if (!story) return
  const ch = story.chapters[chapterIndex.value]
  if (ch) ch.lastReadPage = currentPage.value
  const updated = updateStory(stories, story.id, { chapters: story.chapters, lastReadChapter: chapterIndex.value })
  currentStory.value = updated.find(s => s.id === currentStory.value.id)
  await saveStories(updated)
}

async function goPrevChapter() {
  if (!isFirstChapter.value) {
    await savePageProgress()
    chapterIndex.value--
    loadChapterContent(true)
  }
}

async function goNextChapter() {
  if (!isLastChapter.value) {
    await savePageProgress()
    chapterIndex.value++
    loadChapterContent(true)
  }
}

async function handleGenerateNext() {
  if (generating.value) return
  generating.value = true
  error.value = ''
  try {
    const stories = await loadStories()
    const story = stories.find(s => s.id === currentStory.value.id)
    if (!story) return
    const books = await loadWorldBooks()
    const worldBook = books.find(b => b.id === story.worldBookId)
    const n = settings.value.contextChapters ?? 1
    const recentChapters = n > 0 ? (story.chapters?.slice(-n) || []) : []
    const result = await generateNextChapter({
      worldBook,
      recentChapters,
      userDirection: userDirection.value.trim() || '自由发展',
      wordCount: 1200,
      narrator: null,
    })
    if (!result.success) { error.value = result.error || '生成失败'; return }
    addChapter(story, { title: result.title, content: result.content, suggestions: result.suggestions || [], wordCount: result.wordCount })
    const updated = updateStory(stories, story.id, { chapters: story.chapters })
    await saveStories(updated)
    currentStory.value = updated.find(s => s.id === story.id)
    chapterIndex.value = currentStory.value.chapters.length - 1
    loadChapterContent()
  } catch (e) {
    error.value = e.message || '生成时发生错误'
  } finally {
    generating.value = false
  }
}

// 当前页渲染内容
const pageContent = computed(() => {
  const idx = currentPage.value
  if (!pageGroups.value[idx]) return ''
  const items = pageGroups.value[idx]
  if (items[0] === '__chapter_end__') return '__CHAPTER_END__'
  return items.join('')
})

const isChapterEndPage = computed(() => pageContent.value === '__CHAPTER_END__')
</script>

<template>
  <div class="reader-view">
    <!-- 顶栏 -->
    <div class="reader-header">
      <span class="reader-chapter-num">第 {{ chapterIndex + 1 }}/{{ chapterCount }} 章</span>
      <span class="reader-chapter-title">{{ currentChapter?.title || '加载中...' }}</span>
      <button class="reader-header-btn" @click="emit('open-chapters', currentStory)">☰</button>
    </div>

    <!-- 隐藏测量容器 -->
    <div
      ref="measureEl"
      class="measure-container"
      :style="{ fontSize: settings.fontSize + 'px', lineHeight: settings.lineHeight }"
    />

    <!-- 显示容器 -->
    <div
      ref="displayEl"
      class="reader-body"
      @click="handleBodyClick"
      :style="{ fontSize: settings.fontSize + 'px', lineHeight: settings.lineHeight }"
    >
      <!-- 章节内容页 -->
      <div
        v-if="!isChapterEndPage"
        class="reader-content"
        v-html="pageContent"
      />

      <!-- 章节结束页（独占一整页） -->
      <!-- 最后一章：显示生成下一章表单 -->
      <div v-if="isChapterEndPage && isLastChapter && !generating" class="chapter-end-page">
        <div class="chapter-end-divider">— 本章完 —</div>
        <div class="next-gen-form">
          <p class="next-gen-label">继续阅读下一章</p>
          <input
            v-model="userDirection"
            class="next-gen-input"
            type="text"
            placeholder="输入你期望的剧情方向（可选）..."
            maxlength="100"
            @click.stop
          />
          <button class="next-gen-btn" @click.stop="handleGenerateNext">生成下一章</button>
        </div>
        <div v-if="error" class="next-gen-error">{{ error }}</div>
      </div>

      <!-- 非最后一章的结束页：点击跳转到下一章开头 -->
      <div
        v-if="isChapterEndPage && !isLastChapter && !generating"
        class="chapter-end-page"
        @click.stop="goNextChapter"
      >
        <div class="chapter-end-divider">— 本章完 —</div>
      </div>

      <!-- 加载中 -->
      <div v-if="isChapterEndPage && generating" class="chapter-loading">
        <span class="spinner">⟳</span>
        <span>正在生成下一章...</span>
      </div>
    </div>

    <!-- 底栏（常驻页码 + 进度条） -->
    <div class="reader-footer">
      <div class="footer-info">
        <span class="footer-page">第 {{ currentPage + 1 }} / {{ totalPages }} 页</span>
        <span class="footer-wordcount">{{ currentChapter?.wordCount || currentChapter?.content?.length || 0 }} 字</span>
      </div>
      <div class="footer-progress">
        <div class="progress-fill" :style="{ width: ((currentPage + 1) / totalPages * 100) + '%' }" />
      </div>
      <transition name="fade">
        <div v-if="showToolbar" class="footer-expanded">
          <div class="footer-chapter-nav">
            <button class="footer-btn" :disabled="isFirstChapter" @click.stop="goPrevChapter">← 上一章</button>
            <button class="footer-btn" :disabled="isLastChapter" @click.stop="goNextChapter">下一章 →</button>
          </div>
        </div>
      </transition>
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

/* 隐藏测量容器 — 必须与显示容器相同尺寸，确保文字换行一致 */
.measure-container {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
  overflow: hidden;
  padding: 20px 22px 4px;
  left: -9999px;
  top: 0;
}

/* 显示容器 — 固定高度，不滚动 */
.reader-body {
  flex: 1;
  padding: 20px 22px 4px;
  overflow: hidden;
  cursor: pointer;
  user-select: text;
  -webkit-user-select: text;
}

/* 章节内容 */
.reader-content { width: 100%; }

/* Markdown 样式 */
.reader-body :deep(h1),
.reader-body :deep(h2),
.reader-body :deep(h3) { margin: 0.8em 0 0.4em; font-weight: 700; }

.reader-content :deep(p) { margin: 0.5em 0; text-indent: 2em; text-align: justify; }

.reader-content :deep(strong) { color: var(--reader-strong); }
.reader-content :deep(em) { font-style: italic; }

.reader-content :deep(blockquote) {
  border-left: 3px solid var(--reader-accent-start); padding-left: 12px;
  margin: 0.8em 0; opacity: 0.8;
}

.reader-content :deep(hr) { border: none; text-align: center; margin: 1em 0; opacity: 0.3; }
.reader-content :deep(ul),
.reader-content :deep(ol) { padding-left: 1.5em; }

/* 章节结束页 */
.chapter-end-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.chapter-end-divider {
  text-align: center;
  color: var(--reader-secondary);
  font-size: 0.95rem;
  margin-bottom: 24px;
  letter-spacing: 4px;
}

.next-gen-form {
  width: 100%;
  max-width: 320px;
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
}

/* 底栏 */
.reader-footer {
  flex-shrink: 0;
  background: var(--reader-footer-bg);
  padding: 6px 16px 8px;
  border-top: 1px solid var(--reader-border);
}
.footer-info { display: flex; justify-content: space-between; align-items: center; }
.footer-page { font-size: 0.72rem; color: var(--reader-secondary); }
.footer-wordcount { font-size: 0.68rem; color: var(--reader-secondary); opacity: 0.6; }
.footer-progress { height: 2px; background: var(--reader-border); border-radius: 1px; overflow: hidden; margin-top: 4px; }
.progress-fill { height: 100%; background: linear-gradient(90deg, var(--reader-accent-start), var(--reader-accent-end)); transition: width 0.3s ease; }
.footer-expanded { margin-top: 6px; }
.footer-chapter-nav { display: flex; gap: 10px; }
.footer-btn {
  flex: 1; background: var(--reader-panel-bg);
  border: 1px solid var(--reader-border); border-radius: 6px;
  padding: 6px; color: var(--reader-secondary); font-size: 0.75rem;
  cursor: pointer; transition: background 0.2s;
}
.footer-btn:hover:not(:disabled) { background: var(--reader-border); }
.footer-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* 动画 */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
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
