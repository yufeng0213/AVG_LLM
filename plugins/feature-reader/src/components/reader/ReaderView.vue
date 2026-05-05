<script setup>
/**
 * ReaderView.vue - 小说阅读器
 * 仿参考图4：白色阅读背景 + 紫色花饰 + 底栏导航
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
  insertChapter as _insertChapter,
} from '../../composables/useReaderData.js'
import { generateNextChapter, extractStoryMemories, generateBookChapterFromCharacter, generateChapterFromOutline } from '../../../../../src/llm/llmService.reader.js'
import { loadWorldBooks } from '../../../../../src/worldbook/worldBookStore.js'
import { loadBeautifyConfig, beautifyHtml, DEFAULT_STYLES } from '../../composables/readerBeautifier.js'
import { loadComments, mergeComments, getCommentedParagraphs } from '../../composables/useReaderComments.js'
import { isChapterUnlocked, unlockChapter, getChapterPrice, getChapterOutline } from '../../composables/useReaderUnlock.js'
import { getReaderCoins } from '../../composables/useReaderEconomy.js'
import ParaCommentPanel from './ParaCommentPanel.vue'

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

// 评论相关
const chapterComments = ref({ chapterComments: [], paragraphComments: {} })
const commentedParas = ref(new Set())
const commentPanelVisible = ref(false)
const activeParaIdx = ref('chapter')

// 章节解锁
const chapterUnlocked = ref(true)
const chapterLocked = ref(false)
const readerCoinsBalance = ref(0)

const contentEl = ref(null)
const scrollProgress = ref(0)

// 分享相关
const showShareBar = ref(false)
const selectedText = ref('')

const currentChapter = computed(() =>
  currentStory.value ? getChapter(currentStory.value, chapterIndex.value) : null
)

const hasCard = computed(() => !!currentChapter.value?.cardHtml)

const isFirstChapter = computed(() => chapterIndex.value === 0)
const isLastChapter = computed(() =>
  currentStory.value ? chapterIndex.value >= (currentStory.value.chapters?.length || 1) - 1 : true
)
const chapterCount = computed(() => currentStory.value ? (currentStory.value.chapters?.length || 0) : 0)

const chapterCommentCount = computed(() => chapterComments.value.chapterComments?.length || 0)

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
  beautifyConfig.value = loadBeautifyConfig(settings.value.beautifyConfig)

  if (props.story.chapterIndex != null) {
    const chapterCount = chapters.length || 0
    if (props.story.chapterIndex >= chapterCount) {
      // 大纲模式 - 打开不存在的章节
      chapterIndex.value = props.story.chapterIndex
      const outlineTitle = props.story.outlineTitle
      if (outlineTitle) {
        await generateFromOutline(outlineTitle, props.story.chapterIndex)
      } else {
        const outlines = await getChapterOutline(metaStory.id)
        const outlineIdx = props.story.chapterIndex - chapterCount
        if (outlines[outlineIdx]) {
          await generateFromOutline(outlines[outlineIdx], props.story.chapterIndex)
        } else {
          loadChapterContent()
        }
      }
    } else {
      chapterIndex.value = props.story.chapterIndex
      loadChapterContent()
    }
  } else {
    chapterIndex.value = Math.min(metaStory.lastReadChapter ?? 0, (chapters.length || 1) - 1)
    loadChapterContent()
  }
  injectBeautifyStyles(beautifyConfig.value.styles || DEFAULT_STYLES)
})

watch(() => props.story?.chapterIndex, async (newIdx) => {
  if (newIdx != null && currentStory.value) {
    const chapterCount = currentStory.value.chapters?.length || 0
    chapterIndex.value = newIdx
    if (newIdx >= chapterCount) {
      const outlineTitle = props.story.outlineTitle
      if (outlineTitle) {
        await generateFromOutline(outlineTitle, newIdx)
      } else {
        const outlines = await getChapterOutline(currentStory.value.id)
        const outlineIdx = newIdx - chapterCount
        if (outlines[outlineIdx]) {
          await generateFromOutline(outlines[outlineIdx], newIdx)
        }
      }
    } else {
      loadChapterContent()
    }
  }
})

async function loadChapterContent() {
  const ch = currentChapter.value
  if (!ch) {
    console.warn('[Reader] loadChapterContent: currentChapter is null!', {
      chapterIndex: chapterIndex.value,
      storyId: currentStory.value?.id,
      chapterCount: currentStory.value?.chapters?.length,
    })
    return
  }

  if (currentStory.value) {
    // 导入书籍：跳过付费检查
    if (currentStory.value.sourceType === 'imported') {
      renderedContent.value = ch.content || ''
      userDirection.value = ''
      error.value = ''
      chapterUnlocked.value = true
      chapterLocked.value = false

      chapterComments.value = await loadComments(currentStory.value.id, chapterIndex.value)
      commentedParas.value = getCommentedParagraphs(chapterComments.value)

      nextTick(() => {
        if (contentEl.value) contentEl.value.scrollTop = 0
        markCommentedParagraphs()
      })
      return
    }

    const unlocked = await isChapterUnlocked(currentStory.value.id, chapterIndex.value)
    chapterUnlocked.value = unlocked
    chapterLocked.value = !unlocked

    if (unlocked) {
      renderedContent.value = ch.content || ''
      userDirection.value = ''
      error.value = ''

      // 加载评论
      chapterComments.value = await loadComments(currentStory.value.id, chapterIndex.value)
      commentedParas.value = getCommentedParagraphs(chapterComments.value)

      nextTick(() => {
        if (contentEl.value) contentEl.value.scrollTop = 0
        markCommentedParagraphs()
      })
    } else {
      // 未解锁，显示付费墙
      renderedContent.value = ''
      readerCoinsBalance.value = await getReaderCoins()
    }
  }
}

function markCommentedParagraphs() {
  if (!contentEl.value) return
  const paras = contentEl.value.querySelectorAll('p[data-para-id]')
  for (const p of paras) {
    const idx = p.getAttribute('data-para-id')
    if (commentedParas.value.has(idx)) {
      p.setAttribute('data-has-comments', '')
    } else {
      p.removeAttribute('data-has-comments')
    }
  }
}

function handleContentClick(e) {
  const target = e.target.closest('[data-para-id]')
  if (!target) return
  const paraIdx = target.getAttribute('data-para-id')
  if (commentedParas.value.has(paraIdx)) {
    activeParaIdx.value = Number(paraIdx)
    commentPanelVisible.value = true
  }
}

function openChapterComment() {
  activeParaIdx.value = 'chapter'
  commentPanelVisible.value = true
}

function onContextMenu(e) {
  e.preventDefault()
  e.stopPropagation()
  // 系统长按菜单被阻止后，读取选中的文字
  const sel = window.getSelection()
  const text = sel?.toString().trim() || ''
  console.log('[ReaderView] contextmenu selection:', text.length, 'chars:', text.slice(0, 50))
  if (text.length > 2) {
    selectedText.value = text
    showShareBar.value = true
  }
}

function handleShareToSms() {
  showShareBar.value = false
  window.getSelection()?.removeAllRanges()
  window.dispatchEvent(new CustomEvent('avg:share-to-sms', {
    detail: {
      storyTitle: currentStory.value?.title || '未知',
      chapterTitle: currentChapter.value?.title || '',
      excerpt: selectedText.value,
      storyId: currentStory.value?.id || '',
      chapterIndex: chapterIndex.value,
    },
  }))
}

async function handleUnlockChapter() {
  if (!currentStory.value) return
  const result = await unlockChapter(currentStory.value.id, chapterIndex.value)
  if (result.success) {
    readerCoinsBalance.value = result.coinsRemaining
    chapterUnlocked.value = true
    chapterLocked.value = false
    // 重新加载内容
    loadChapterContent()
  } else {
    alert(result.message)
  }
}

function refreshComments() {
  if (currentStory.value) {
    loadComments(currentStory.value.id, chapterIndex.value).then(data => {
      chapterComments.value = data
      commentedParas.value = getCommentedParagraphs(data)
      nextTick(() => markCommentedParagraphs())
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

/**
 * 从大纲标题生成章节内容
 */
async function generateFromOutline(title, chapterIdx) {
  if (generating.value) return
  generating.value = true
  error.value = ''
  try {
    const storyId = currentStory.value.id
    const chapters = await loadStoryChapters(storyId)

    const books = await loadWorldBooks()
    const worldBook = books.find(b => b.id === currentStory.value.worldBookId)

    // 查找角色所在的世界书（非参考角色书）
    let characterWorldBook = null
    let character = null
    if (!worldBook && currentStory.value.author) {
      for (const wb of books) {
        const ch = (wb.characters || []).find(c => c.id === currentStory.value.author)
        if (ch) {
          character = ch
          characterWorldBook = wb
          break
        }
      }
    }

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

    const result = await generateChapterFromOutline({
      worldBook: characterWorldBook || worldBook,
      chapterTitle: title,
      book: {
        title: currentStory.value.title,
        summary: currentStory.value.summary,
        genre: currentStory.value.genre,
        tags: currentStory.value.tags,
        worldview: currentStory.value.worldview || null,
      },
      mainCharacters: settings.value.mainCharacters || '',
      recentChapters,
      memories: memories || undefined,
      narrator: null,
      wordCount: 2000,
    })

    if (!result.success) { error.value = result.error || '生成失败'; return }

    if (isSQLiteAvailable()) {
      await _insertChapter(storyId, {
        title: result.title,
        content: result.content,
        cardHtml: result.cardHtml || null,
        suggestions: result.suggestions || [],
        wordCount: result.wordCount,
      })
      currentStory.value.chapters = await loadStoryChapters(storyId)
    }

    // 保存评论
    if (result.comments) {
      await mergeComments(currentStory.value.id, chapterIdx, result.comments)
    }

    chapterIndex.value = currentStory.value.chapters.length - 1
    console.log('[Reader] 从大纲生成完成', {
      chapterIndex: chapterIndex.value,
      chapterCount: currentStory.value.chapters.length,
    })
    loadChapterContent()
  } catch (e) {
    error.value = e.message || '生成时发生错误'
  } finally {
    generating.value = false
  }
}

async function handleGenerateNext() {
  if (generating.value) return
  generating.value = true
  error.value = ''
  try {
    const storyId = currentStory.value.id
    const chapters = await loadStoryChapters(storyId)

    // 判断是否是角色生成的书
    const isCharacterBook = !!currentStory.value._fromGenerated

    let result = null

    if (isCharacterBook) {
      // 角色作者模式：用角色身份生成下一章
      const books = await loadWorldBooks()
      let character = null
      let characterWorldBook = null
      for (const wb of books) {
        const ch = (wb.characters || []).find(c => c.id === currentStory.value.author)
        if (ch) {
          character = ch
          characterWorldBook = wb
          break
        }
      }

      // 使用全局 contextChapters 设置
      const n = settings.value.contextChapters ?? 1
      const recentChapters = n > 0 ? (chapters.slice(-n) || []) : []

      // 使用全局 memoryThreshold 设置
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

      const chapterNum = chapters.length
      result = await generateBookChapterFromCharacter({
        character: character || { name: currentStory.value.author },
        book: {
          title: currentStory.value.title,
          summary: currentStory.value.summary,
          genre: currentStory.value.genre,
          tags: currentStory.value.tags,
          worldview: currentStory.value.worldview || null,
        },
        worldBook: characterWorldBook,
        mainCharacters: settings.value.mainCharacters || '',
        chapterIndex: chapterNum,
        existingChapters: recentChapters,
        wordCount: 1200,
        memories: memories || undefined,
      })

      if (!result.success) { error.value = result.error || '生成失败'; return }

      if (isSQLiteAvailable()) {
        const inserted = await _insertChapter(storyId, {
          title: result.title,
          content: result.content,
          cardHtml: result.cardHtml || null,
          suggestions: result.suggestions || [],
          wordCount: result.wordCount,
        })
        console.log('[Reader] insertChapter 返回值', { inserted: !!inserted, title: inserted?.title, index: inserted?.chapterIndex })
        currentStory.value.chapters = await loadStoryChapters(storyId)
        console.log('[Reader] 角色书 SQLite 插入完成', {
          chapterCount: currentStory.value.chapters.length,
          lastChapterTitle: currentStory.value.chapters[currentStory.value.chapters.length - 1]?.title,
          hasContent: !!currentStory.value.chapters[currentStory.value.chapters.length - 1]?.content,
        })
      } else {
        const stories = await loadStories()
        const story = stories.find(s => s.id === storyId)
        if (!story) return
        addChapter(story, { title: result.title, content: result.content, cardHtml: result.cardHtml || null, suggestions: result.suggestions || [], wordCount: result.wordCount })
        await saveStories(stories)
        currentStory.value = story
      }
    } else {
      // 世界书模式：用世界书上下文生成下一章
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

      result = await generateNextChapter({
        worldBook,
        recentChapters,
        userDirection: userDirection.value.trim() || '自由发展',
        wordCount: 1200,
        narrator: null,
        memories: memories || undefined,
        genre: currentStory.value.genre,
        tags: currentStory.value.tags,
      })
      if (!result.success) { error.value = result.error || '生成失败'; return }

      if (isSQLiteAvailable()) {
        await _insertChapter(storyId, {
          title: result.title,
          content: result.content,
          cardHtml: result.cardHtml || null,
          suggestions: result.suggestions || [],
          wordCount: result.wordCount,
        })
        currentStory.value.chapters = await loadStoryChapters(storyId)
        console.log('[Reader] 世界书 SQLite 插入完成', {
          chapterCount: currentStory.value.chapters.length,
          lastChapterTitle: currentStory.value.chapters[currentStory.value.chapters.length - 1]?.title,
          hasContent: !!currentStory.value.chapters[currentStory.value.chapters.length - 1]?.content,
        })
      } else {
        const stories = await loadStories()
        const story = stories.find(s => s.id === storyId)
        if (!story) return
        addChapter(story, { title: result.title, content: result.content, cardHtml: result.cardHtml || null, suggestions: result.suggestions || [], wordCount: result.wordCount })
        const updated = updateStory(stories, story.id, { chapters: story.chapters })
        await saveStories(updated)
        currentStory.value = updated.find(s => s.id === storyId)
      }
    }

    // 切换到新生成的章节
    chapterIndex.value = currentStory.value.chapters.length - 1

    // 保存 LLM 生成的评论（绑定到新章节）
    if (result.comments) {
      await mergeComments(currentStory.value.id, chapterIndex.value, result.comments)
    }

    console.log('[Reader] 生成完成, 更新UI', {
      chapterIndex: chapterIndex.value,
      chapterCount: currentStory.value.chapters.length,
      hasContent: !!currentStory.value.chapters[chapterIndex.value]?.content,
    })
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
      <span class="reader-chapter-title">{{ currentChapter?.title || '加载中...' }}</span>
      <span
        v-if="currentChapter"
        class="chapter-comment-btn"
        @click="openChapterComment"
      >
        💬 {{ chapterCommentCount }}
      </span>
    </div>

    <!-- 滚动内容区 -->
    <div
      ref="contentEl"
      class="reader-body"
      @scroll="handleScroll"
      :style="{ fontSize: settings.fontSize + 'px', lineHeight: settings.lineHeight }"
    >
      <!-- 正文 -->
      <div class="reader-content" v-html="htmlContent" @click="handleContentClick" @contextmenu="onContextMenu" />

      <!-- 付费墙 -->
      <div v-if="chapterLocked" class="paywall-overlay">
        <div class="paywall-card">
          <span class="paywall-icon">🔒</span>
          <p class="paywall-title">本章未解锁</p>
          <p class="paywall-desc">解锁本章继续阅读</p>
          <div class="paywall-info">
            <span class="paywall-price">💰 {{ getChapterPrice() }} 金币</span>
            <span class="paywall-balance">余额 {{ readerCoinsBalance }} 金币</span>
          </div>
          <button class="paywall-btn" @click="handleUnlockChapter">
            立即解锁
          </button>
        </div>
      </div>

      <!-- 卡片 -->
      <div v-if="hasCard" class="card-inline" v-html="currentChapter.cardHtml" />

      <!-- 章节结束分隔线 -->
      <div class="chapter-divider">— 本章完 —</div>

      <!-- 章节导航按钮 -->
      <div class="chapter-nav-inline">
        <button class="inline-nav-btn" :disabled="isFirstChapter" @click="goPrevChapter">
          < 上一章
        </button>
        <button class="inline-nav-btn" :disabled="isLastChapter" @click="goNextChapter">
          下一章 →
        </button>
      </div>

      <!-- 最后一章：生成下一章（仅 LLM 生成的书显示） -->
      <div v-if="isLastChapter && !generating && currentStory?.sourceType !== 'imported'" class="next-gen-form">
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

      <div v-if="isLastChapter && generating && currentStory?.sourceType !== 'imported'" class="chapter-loading">
        <span class="spinner">⟳</span>
        <span>正在生成下一章...</span>
      </div>

      <div class="bottom-spacer" />
    </div>

    <!-- 分享操作条 -->
    <Transition name="share-bar">
      <div v-if="showShareBar" class="share-action-bar">
        <span class="share-text">转发到短信</span>
        <button class="share-btn" @click="handleShareToSms">
          💬 发送给角色
        </button>
        <button class="share-close-btn" @click="showShareBar = false">✕</button>
      </div>
    </Transition>

    <!-- 底栏 -->
    <div class="reader-footer">
      <button class="footer-btn" @click="emit('open-chapters', currentStory)">
        <span class="footer-btn-icon">📑</span>
        <span>目录</span>
      </button>
      <button class="footer-btn" :disabled="isFirstChapter" @click="goPrevChapter">
        <span class="footer-btn-icon"><</span>
        <span>上一章</span>
      </button>
      <button class="footer-btn" @click="emit('back')">
        <span class="footer-btn-icon">⚙️</span>
        <span>设置</span>
      </button>
      <button class="footer-btn" @click="settings.fontSize = Math.min(22, settings.fontSize + 1)">
        <span class="footer-btn-icon">Aa</span>
        <span>{{ settings.fontSize }}</span>
      </button>
    </div>
  </div>

  <!-- 段评/章评面板 -->
  <ParaCommentPanel
    :visible="commentPanelVisible"
    :story-id="currentStory?.id || ''"
    :chapter-index="chapterIndex"
    :para-idx="activeParaIdx"
    :comments="chapterComments"
    @close="commentPanelVisible = false"
    @refresh="refreshComments"
  />
</template>

<style scoped>
.reader-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  color: #2d2040;
}

/* 顶栏 */
.reader-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  padding-top: 10px;
  background: #fff;
  border-bottom: 1px solid #ede4ff;
}

.reader-chapter-title {
  flex: 1;
  min-width: 0;
  font-size: 0.88rem;
  font-weight: 600;
  color: #2d2040;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 滚动内容区 */
.reader-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 22px 4px;
  -webkit-overflow-scrolling: touch;
  position: relative;
  user-select: text !important;
  -webkit-user-select: text !important;
}

/* 紫色花饰装饰 */
.reader-body::before {
  content: '✿';
  position: absolute;
  top: 20px;
  right: 20px;
  font-size: 4rem;
  color: rgba(124, 92, 191, 0.06);
  pointer-events: none;
  line-height: 1;
}

.reader-body::after {
  content: '';
  position: absolute;
  bottom: 80px;
  left: 16px;
  font-size: 3rem;
  color: rgba(124, 92, 191, 0.05);
  pointer-events: none;
  line-height: 1;
}

/* 正文 */
.reader-content {
  width: 100%;
  user-select: text !important;
  -webkit-user-select: text !important;
}

.reader-content * {
  user-select: text !important;
  -webkit-user-select: text !important;
}

.reader-body :deep(h1),
.reader-body :deep(h2),
.reader-body :deep(h3) {
  margin: 0.8em 0 0.4em;
  font-weight: 700;
  color: #2d2040;
}

.reader-body :deep(p) {
  margin: 0.6em 0;
  text-indent: 2em;
  text-align: justify;
  color: #2d2040;
  line-height: inherit;
}

.reader-body :deep(strong) {
  color: #5a3d8a;
}

.reader-body :deep(em) {
  font-style: italic;
  color: #5a3d8a;
}

.reader-body :deep(blockquote) {
  border-left: 3px solid #7c5cbf;
  padding-left: 12px;
  margin: 0.8em 0;
  color: #5a3d8a;
}

.reader-body :deep(hr) {
  border: none;
  text-align: center;
  margin: 1em 0;
  color: #e8e0f0;
}

.reader-body :deep(ul),
.reader-body :deep(ol) {
  padding-left: 1.5em;
}

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
  color: #b0a8c0;
  font-size: 0.85rem;
  margin: 40px 0 20px;
  letter-spacing: 4px;
}

/* 章节内导航 */
.chapter-nav-inline {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin: 20px 0 24px;
}

.inline-nav-btn {
  background: #f0e8ff;
  color: #7c5cbf;
  border: 1px solid #e0d4f5;
  padding: 10px 24px;
  border-radius: 24px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.inline-nav-btn:hover:not(:disabled) {
  background: #e0d4f5;
}

.inline-nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 生成下一章 */

/* 付费墙 */
.paywall-overlay {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: center;
  padding: 20px;
  background: linear-gradient(transparent, #fff 30%);
  margin-top: 20px;
}

.paywall-card {
  background: #fff;
  border: 2px solid #e0d4f5;
  border-radius: 16px;
  padding: 24px 20px;
  text-align: center;
  box-shadow: 0 4px 20px rgba(124, 92, 191, 0.15);
  max-width: 280px;
}

.paywall-icon {
  font-size: 2.5rem;
  display: block;
  margin-bottom: 12px;
}

.paywall-title {
  font-size: 1rem;
  font-weight: 700;
  color: #2d2040;
  margin: 0 0 6px;
}

.paywall-desc {
  font-size: 0.82rem;
  color: #8b7ea8;
  margin: 0 0 14px;
}

.paywall-info {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 16px;
}

.paywall-price {
  font-size: 0.88rem;
  font-weight: 700;
  color: #f59e0b;
}

.paywall-balance {
  font-size: 0.82rem;
  color: #7c5cbf;
}

.paywall-btn {
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  color: #fff;
  border: none;
  padding: 10px 32px;
  border-radius: 24px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s;
}

.paywall-btn:active {
  transform: scale(0.95);
}

/* 生成下一章 */
.next-gen-form {
  width: 100%;
  max-width: 320px;
  margin: 0 auto 20px;
  background: #fff;
  border: 1px solid #e8e0f0;
  border-radius: 14px;
  padding: 16px;
}

.next-gen-label {
  font-size: 0.85rem;
  color: #8b7ea8;
  margin: 0 0 10px;
  font-weight: 600;
  text-align: center;
}

.next-gen-input {
  width: 100%;
  background: #f8f4ff;
  border: 1px solid #e8e0f0;
  border-radius: 10px;
  padding: 10px 12px;
  color: #2d2040;
  font-size: 0.82rem;
  outline: none;
  margin-bottom: 10px;
  box-sizing: border-box;
}

.next-gen-input:focus {
  border-color: #7c5cbf;
}

.next-gen-btn {
  width: 100%;
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  border: none;
  color: #fff;
  padding: 12px;
  border-radius: 24px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s;
}

.next-gen-btn:hover {
  transform: scale(1.02);
}

.chapter-loading {
  text-align: center;
  color: #8b7ea8;
  font-size: 0.85rem;
  margin: 20px 0;
}

.bottom-spacer {
  height: 16px;
}

/* 底栏 */
.reader-footer {
  flex-shrink: 0;
  background: #fff;
  padding: 6px 8px;
  padding-bottom: max(6px, env(safe-area-inset-bottom));
  border-top: 1px solid #ede4ff;
  display: flex;
  justify-content: space-around;
}

.footer-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: none;
  border: none;
  color: #7c5cbf;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 8px;
  transition: background 0.15s;
  flex: 1;
}

.footer-btn:active {
  background: #f0e8ff;
}

.footer-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.footer-btn-icon {
  font-size: 1.1rem;
  line-height: 1;
}

.footer-btn span:last-child {
  font-size: 0.68rem;
  font-weight: 500;
}

/* 动画 */
.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 分享操作条 */
.share-action-bar {
  position: absolute;
  bottom: 70px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(45, 32, 64, 0.92);
  backdrop-filter: blur(8px);
  padding: 10px 18px;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
  z-index: 100;
}

.share-text {
  font-size: 0.82rem;
  color: #b0a8c0;
  white-space: nowrap;
}

.share-btn {
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 12px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.share-btn:active {
  transform: scale(0.95);
}

.share-close-btn {
  background: transparent;
  color: #b0a8c0;
  border: none;
  padding: 6px 8px;
  font-size: 1rem;
  cursor: pointer;
  border-radius: 8px;
}

.share-close-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

/* 分享条动画 */
.share-bar-enter-active,
.share-bar-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.share-bar-enter-from,
.share-bar-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}

.platform-android.android-portrait .inline-nav-btn,
.platform-android.android-portrait .footer-btn,
.platform-android.android-portrait .next-gen-btn,
.platform-android.android-portrait .share-btn,
.platform-android.android-portrait .share-close-btn {
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
