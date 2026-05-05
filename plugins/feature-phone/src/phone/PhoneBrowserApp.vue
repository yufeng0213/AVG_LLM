<script setup>
/**
 * PhoneBrowserApp.vue - 浏览器 + 角色百科档案馆入口
 * Phase 1: iframe浏览 + URL导航 + 书签
 * Phase 2+: 分享、档案生成、成就系统
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { kvStorage } from '../../../../src/storage/index.js'
import ArchiveView from './components/browser/ArchiveView.vue'
import AchievementPanel from './components/browser/AchievementPanel.vue'

const emit = defineEmits(['back'])

const BROWSER_URL_KEY = 'browser_url_history_v1'
const BOOKMARKS_KEY = 'browser_bookmarks_v1'

const DEFAULT_URL = 'https://cn.bing.com'

const currentUrl = ref(DEFAULT_URL)
const urlBar = ref(DEFAULT_URL)
const isLoading = ref(false)
const iframeRef = ref(null)

const history = ref([])
const historyIndex = ref(-1)
const bookmarks = ref([])
const currentView = ref('browser') // 'browser' | 'bookmarks' | 'archive'

onMounted(async () => {
  const saved = await kvStorage.get(BOOKMARKS_KEY)
  bookmarks.value = saved || []
  navigate(DEFAULT_URL)
})

onBeforeUnmount(() => {
  // 保存书签
  kvStorage.set(BOOKMARKS_KEY, bookmarks.value)
})

// 导航历史
function navigate(url) {
  if (!url) return
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
  }
  currentUrl.value = url
  urlBar.value = url
  isLoading.value = true

  // 前进时截断历史
  if (historyIndex.value < history.value.length - 1) {
    history.value = history.value.slice(0, historyIndex.value + 1)
  }
  history.value.push({ url, title: '', visitedAt: new Date().toISOString() })
  historyIndex.value = history.value.length - 1
}

function goBack() {
  if (historyIndex.value > 0) {
    historyIndex.value--
    const entry = history.value[historyIndex.value]
    currentUrl.value = entry.url
    urlBar.value = entry.url
    isLoading.value = true
  }
}

function goForward() {
  if (historyIndex.value < history.value.length - 1) {
    historyIndex.value++
    const entry = history.value[historyIndex.value]
    currentUrl.value = entry.url
    urlBar.value = entry.url
    isLoading.value = true
  }
}

function refresh() {
  isLoading.value = true
  if (iframeRef.value) {
    iframeRef.value.src = currentUrl.value
  }
}

function onUrlBarKeydown(e) {
  if (e.key === 'Enter') {
    navigate(urlBar.value.trim())
    e.target.blur()
  }
}

function onIframeLoad() {
  isLoading.value = false
  // 尝试获取页面标题
  try {
    const iframe = iframeRef.value
    if (iframe && iframe.contentDocument) {
      const title = iframe.contentDocument.title
      if (title && historyIndex.value >= 0) {
        history.value[historyIndex.value].title = title
      }
    }
  } catch {
    // 跨域，忽略
  }
}

// 书签
const isBookmarked = computed(() => {
  return bookmarks.value.some(b => b.url === currentUrl.value)
})

function toggleBookmark() {
  if (isBookmarked.value) {
    bookmarks.value = bookmarks.value.filter(b => b.url !== currentUrl.value)
  } else {
    bookmarks.value.unshift({
      id: `bm_${Date.now()}`,
      url: currentUrl.value,
      title: getCurrentTitle(),
      createdAt: new Date().toISOString(),
    })
  }
  kvStorage.set(BOOKMARKS_KEY, bookmarks.value)
}

function getCurrentTitle() {
  const entry = history.value[historyIndex.value]
  return entry?.title || currentUrl.value
}

function openBookmark(url) {
  navigate(url)
  currentView.value = 'browser'
}

function deleteBookmark(id) {
  bookmarks.value = bookmarks.value.filter(b => b.id !== id)
  kvStorage.set(BOOKMARKS_KEY, bookmarks.value)
}

// 分享给角色
function shareToSms() {
  const title = getCurrentTitle()
  const excerpt = `[浏览器分享] ${title} - ${currentUrl.value}`
  window.dispatchEvent(new CustomEvent('avg:share-to-sms', {
    detail: {
      type: 'browser_share',
      title,
      url: currentUrl.value,
      excerpt,
    },
  }))
}
</script>

<template>
  <div class="browser-app">
    <!-- 书签视图 -->
    <div v-if="currentView === 'bookmarks'" class="bookmarks-view">
      <div class="browser-sub-header">
        <button class="browser-back-btn" @click="currentView = 'browser'">&#8592; 返回浏览器</button>
      </div>
      <div class="bookmarks-list">
        <div v-if="bookmarks.length === 0" class="bookmarks-empty">
          <p>还没有书签</p>
          <p class="bookmarks-empty-hint">浏览网页时点击 ☆ 添加书签</p>
        </div>
        <div
          v-for="bm in bookmarks"
          :key="bm.id"
          class="bookmark-item"
          @click="openBookmark(bm.url)"
        >
          <div class="bookmark-item-body">
            <div class="bookmark-item-title">{{ bm.title || bm.url }}</div>
            <div class="bookmark-item-url">{{ bm.url }}</div>
          </div>
          <button class="bookmark-delete-btn" @click.stop="deleteBookmark(bm.id)">&times;</button>
        </div>
      </div>
    </div>

    <!-- 档案馆视图 -->
    <div v-else-if="currentView === 'archive'" class="archive-view-container">
      <ArchiveView @back="currentView = 'browser'" />
    </div>

    <!-- 成就面板 -->
    <div v-else-if="currentView === 'achievements'">
      <AchievementPanel @back="currentView = 'browser'" />
    </div>

    <!-- 浏览器视图 -->
    <template v-else>
      <!-- 工具栏 -->
      <div class="browser-toolbar">
        <button class="browser-nav-btn" :disabled="historyIndex <= 0" @click="goBack">&#8592;</button>
        <button class="browser-nav-btn" :disabled="historyIndex >= history.length - 1" @click="goForward">&#8594;</button>
        <button class="browser-nav-btn browser-refresh-btn" @click="refresh">&#x21bb;</button>
        <input
          class="browser-url-input"
          :value="urlBar"
          @input="urlBar = $event.target.value"
          @keydown="onUrlBarKeydown"
          placeholder="输入网址..."
        />
      </div>

      <!-- 操作栏 -->
      <div class="browser-action-bar">
        <button class="browser-action-btn browser-share-btn" @click="shareToSms">
          &#x1F4E4; 分享
        </button>
        <button class="browser-action-btn" :class="{ bookmarked: isBookmarked }" @click="toggleBookmark">
          {{ isBookmarked ? '&#x2605;' : '&#x2606;' }}
        </button>
        <button class="browser-action-btn browser-archive-btn" @click="currentView = 'archive'">
          &#x1F4DA; 档案馆
        </button>
        <button class="browser-action-btn" @click="currentView = 'achievements'">
          &#x1F3C6; 成就
        </button>
      </div>

      <!-- iframe -->
      <div class="browser-iframe-container">
        <div v-if="isLoading" class="browser-loading-overlay">
          <div class="browser-loading-spinner"></div>
          <span>加载中...</span>
        </div>
        <iframe
          ref="iframeRef"
          class="browser-iframe"
          :src="currentUrl"
          @load="onIframeLoad"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </template>
  </div>
</template>
