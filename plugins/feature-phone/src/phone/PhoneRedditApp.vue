<script setup>
/**
 * PhoneRedditApp.vue - Reddit 应用
 * 每个世界书 = 一个 subreddit 频道，NPC 居民发帖评论。
 * 刷新替换模式，分隔符 LLM 输出。
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { loadWorldBooks } from '../../../../src/worldbook/worldBookStore.js'
import { generateRedditPosts, generateRedditCommentReplies } from '../../../../src/llm/index.js'
import { kvStorage } from '../../../../src/storage/index.js'

const emit = defineEmits(['back'])

const STORAGE_KEY = 'phone_reddit_data_v1'

// 视图状态: 'channels' | 'feed' | 'detail'
const currentView = ref('channels')
const selectedChannel = ref(null)
const selectedPost = ref(null)

// 数据
const channels = ref([])       // [{ worldBookId, worldBookTitle, postCount, lastRefreshedAt }]
const channelData = ref({})    // worldBookId -> { lastRefreshedAt, posts: [...] }
const userComments = ref({})   // postId -> [{ authorName: '玩家', content, createdAt }]

// 状态
const isRefreshing = ref(false)
const isCommenting = ref(false)
const commentDraft = ref('')
const commentsRef = ref(null)

onMounted(async () => {
  const [books, saved] = await Promise.all([
    loadWorldBooks(),
    kvStorage.get(STORAGE_KEY),
  ])

  // 初始化频道
  channels.value = books.map(b => ({
    worldBookId: b.id,
    worldBookTitle: b.title || '未命名世界书',
    postCount: 0,
    lastRefreshedAt: null,
  }))

  // 恢复缓存数据
  if (saved) {
    channelData.value = saved.channelData || {}
    userComments.value = saved.userComments || {}
    // 更新频道的帖子数量
    for (const ch of channels.value) {
      const data = channelData.value[ch.worldBookId]
      if (data && data.posts) {
        ch.postCount = data.posts.length
        ch.lastRefreshedAt = data.lastRefreshedAt
      }
    }
  }
})

function formatTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const now = new Date()
  const diff = now - d
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  if (diff < 2 * 24 * 60 * 60 * 1000) return '昨天'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatLastRefresh(isoStr) {
  if (!isoStr) return '未刷新'
  return formatTime(isoStr)
}

async function saveData() {
  await kvStorage.set(STORAGE_KEY, {
    channelData: channelData.value,
    userComments: userComments.value,
  })
}

function openChannel(channel) {
  selectedChannel.value = channel
  currentView.value = 'feed'
}

// 刷新频道帖子
async function refreshFeed() {
  if (!selectedChannel.value || isRefreshing.value) return
  isRefreshing.value = true

  try {
    const books = await loadWorldBooks()
    const book = books.find(b => b.id === selectedChannel.value.worldBookId)

    const result = await generateRedditPosts({
      worldBook: book || { id: selectedChannel.value.worldBookId, title: selectedChannel.value.worldBookTitle },
      postCount: 4,
    })

    if (result.success && result.posts.length > 0) {
      channelData.value[selectedChannel.value.worldBookId] = {
        lastRefreshedAt: new Date().toISOString(),
        posts: result.posts,
      }
      selectedChannel.value.postCount = result.posts.length
      selectedChannel.value.lastRefreshedAt = new Date().toISOString()
      await saveData()
    } else {
      alert('帖子生成失败，请重试')
    }
  } catch (e) {
    console.warn('[PhoneRedditApp] 刷新失败:', e)
    alert('刷新失败: ' + (e.message || '未知错误'))
  } finally {
    isRefreshing.value = false
  }
}

// 全部刷新
async function refreshAll() {
  if (isRefreshing.value) return
  isRefreshing.value = true

  try {
    const books = await loadWorldBooks()
    let total = 0
    for (const book of books) {
      const ch = channels.value.find(c => c.worldBookId === book.id)
      if (!ch) continue

      const result = await generateRedditPosts({
        worldBook: book,
        postCount: 3,
      })

      if (result.success && result.posts.length > 0) {
        channelData.value[book.id] = {
          lastRefreshedAt: new Date().toISOString(),
          posts: result.posts,
        }
        ch.postCount = result.posts.length
        ch.lastRefreshedAt = new Date().toISOString()
        total += result.posts.length
      }
    }
    await saveData()
    if (total === 0) alert('全部刷新失败')
  } catch (e) {
    console.warn('[PhoneRedditApp] 全部刷新失败:', e)
    alert('刷新失败: ' + (e.message || '未知错误'))
  } finally {
    isRefreshing.value = false
  }
}

// 查看帖子详情
function openPost(post) {
  selectedPost.value = post
  currentView.value = 'detail'
}

// 发表评论
async function sendComment() {
  const text = commentDraft.value.trim()
  if (!text || !selectedPost.value || isCommenting.value) return

  // 添加玩家评论
  if (!userComments.value[selectedPost.value.id]) {
    userComments.value[selectedPost.value.id] = []
  }
  userComments.value[selectedPost.value.id].push({
    id: `uc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    authorName: '玩家',
    content: text,
    createdAt: new Date().toISOString(),
  })
  commentDraft.value = ''
  await saveData()
  nextTick(() => scrollToComments())

  // 触发 NPC 回复
  isCommenting.value = true
  try {
    const books = await loadWorldBooks()
    const book = books.find(b => b.id === selectedChannel.value?.worldBookId)

    const result = await generateRedditCommentReplies({
      worldBook: book || { id: selectedChannel.value?.worldBookId, title: selectedChannel.value?.worldBookTitle },
      postTitle: selectedPost.value.title,
      postContent: selectedPost.value.content,
      userComment: text,
    })

    if (result.success && result.comments.length > 0) {
      for (const comment of result.comments) {
        selectedPost.value.comments.push(comment)
      }
      // 也保存到 channelData
      if (selectedChannel.value) {
        const chData = channelData.value[selectedChannel.value.worldBookId]
        if (chData && chData.posts) {
          const postIdx = chData.posts.findIndex(p => p.id === selectedPost.value.id)
          if (postIdx >= 0) {
            chData.posts[postIdx] = { ...selectedPost.value }
          }
        }
      }
      await saveData()
      nextTick(() => scrollToComments())
    }
  } catch (e) {
    console.warn('[PhoneRedditApp] NPC 回复失败:', e)
  } finally {
    isCommenting.value = false
  }
}

function scrollToComments() {
  if (commentsRef.value) {
    commentsRef.value.scrollTop = commentsRef.value.scrollHeight
  }
}

// 获取当前频道的帖子
const feedPosts = computed(() => {
  if (!selectedChannel.value) return []
  const data = channelData.value[selectedChannel.value.worldBookId]
  if (!data || !data.posts) return []

  // hot 优先
  const posts = [...data.posts]
  posts.sort((a, b) => {
    if (a.isHot && !b.isHot) return -1
    if (!a.isHot && b.isHot) return 1
    return 0
  })
  return posts
})

// 获取帖子的所有评论（NPC + 玩家）
const postAllComments = computed(() => {
  if (!selectedPost.value) return []
  const npc = selectedPost.value.comments || []
  const uc = userComments.value[selectedPost.value.id] || []
  return [...npc, ...uc].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
})

// 帖子评论数
function commentCount(post) {
  const npc = post.comments?.length || 0
  const uc = userComments.value[post.id]?.length || 0
  return npc + uc
}

// flair 颜色
function flairStyle(flair) {
  const colors = {
    '讨论': { bg: 'rgba(0,122,255,0.2)', text: '#64b5f6' },
    '吐槽': { bg: 'rgba(255,59,48,0.2)', text: '#ef9a9a' },
    '分享': { bg: 'rgba(52,199,89,0.2)', text: '#a5d6a7' },
    '求助': { bg: 'rgba(255,204,0,0.2)', text: '#fff59d' },
    '攻略': { bg: 'rgba(175,82,222,0.2)', text: '#ce93d8' },
  }
  return colors[flair] || colors['讨论']
}

function goBack() {
  if (currentView.value === 'detail') {
    currentView.value = 'feed'
    selectedPost.value = null
  } else if (currentView.value === 'feed') {
    currentView.value = 'channels'
    selectedChannel.value = null
  } else {
    emit('back')
  }
}
</script>

<template>
  <div class="reddit-app">
    <!-- 频道列表 -->
    <template v-if="currentView === 'channels'">
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="emit('back')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="phone-app-title">Reddit</h2>
        <button type="button" class="phone-app-back-btn reddit-refresh-btn" @click="refreshAll" :disabled="isRefreshing">
          {{ isRefreshing ? '刷新中...' : '全部刷新' }}
        </button>
      </div>

      <div class="reddit-channels">
        <div
          v-for="ch in channels"
          :key="ch.worldBookId"
          class="reddit-channel-item"
          @click="openChannel(ch)"
        >
          <div class="reddit-channel-icon">
            <span class="reddit-channel-emoji">&#x1F4DA;</span>
          </div>
          <div class="reddit-channel-info">
            <div class="reddit-channel-name">r/{{ ch.worldBookTitle }}</div>
            <div class="reddit-channel-meta">
              {{ ch.postCount > 0 ? `${ch.postCount} 条帖子` : '暂无帖子' }}
              <span v-if="ch.lastRefreshedAt"> &middot; {{ formatLastRefresh(ch.lastRefreshedAt) }}</span>
            </div>
          </div>
          <svg class="reddit-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>

        <div v-if="channels.length === 0" class="phone-loading">
          暂无世界书
        </div>
      </div>
    </template>

    <!-- 帖子流 -->
    <template v-else-if="currentView === 'feed'">
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="goBack">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="phone-app-title">r/{{ selectedChannel?.worldBookTitle }}</h2>
        <button type="button" class="phone-app-back-btn reddit-refresh-btn" @click="refreshFeed" :disabled="isRefreshing">
          {{ isRefreshing ? '刷新中...' : '刷新' }}
        </button>
      </div>

      <div class="reddit-feed">
        <template v-if="feedPosts.length > 0">
          <div
            v-for="post in feedPosts"
            :key="post.id"
            class="reddit-post-card"
            @click="openPost(post)"
          >
            <div class="reddit-post-header">
              <div class="reddit-post-flair" :style="flairStyle(post.flair)">{{ post.flair }}</div>
              <span v-if="post.isHot" class="reddit-hot-badge">&#x1F525;</span>
              <span class="reddit-post-author">u/{{ post.authorName }}</span>
              <span class="reddit-post-time">{{ formatTime(post.createdAt) }}</span>
            </div>
            <div class="reddit-post-title">{{ post.title }}</div>
            <div class="reddit-post-preview">{{ post.content.slice(0, 100) }}{{ post.content.length > 100 ? '...' : '' }}</div>
            <div class="reddit-post-footer">
              <span class="reddit-post-stats">&#x1F4AC; {{ commentCount(post) }}</span>
            </div>
          </div>
        </template>

        <div v-else class="phone-loading" style="padding-top:60px">
          {{ isRefreshing ? '生成帖子中...' : '点击"刷新"生成帖子' }}
        </div>
      </div>
    </template>

    <!-- 帖子详情 -->
    <template v-else-if="currentView === 'detail'">
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="goBack">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="phone-app-title">帖子详情</h2>
        <div class="phone-app-header-spacer" />
      </div>

      <div class="reddit-detail">
        <!-- 原帖 -->
        <div class="reddit-detail-post">
          <div class="reddit-post-header">
            <div class="reddit-post-flair" :style="flairStyle(selectedPost.flair)">{{ selectedPost.flair }}</div>
            <span class="reddit-post-author">u/{{ selectedPost.authorName }}</span>
            <span class="reddit-post-time">{{ formatTime(selectedPost.createdAt) }}</span>
          </div>
          <div class="reddit-detail-title">{{ selectedPost.title }}</div>
          <div class="reddit-detail-content">{{ selectedPost.content }}</div>
        </div>

        <!-- 评论区 -->
        <div class="reddit-comments" ref="commentsRef">
          <div class="reddit-comments-header">&#x1F4AC; 评论 ({{ postAllComments.length }})</div>

          <div v-for="comment in postAllComments" :key="comment.id" class="reddit-comment-item">
            <div class="reddit-comment-author" :class="{ isPlayer: comment.authorName === '玩家' }">
              u/{{ comment.authorName }}
            </div>
            <div class="reddit-comment-content">{{ comment.content }}</div>
            <div class="reddit-comment-time">{{ formatTime(comment.createdAt) }}</div>
          </div>

          <div v-if="isCommenting" class="phone-loading" style="padding:12px 0">
            <div class="loading-spinner" />NPC 正在回复...
          </div>
        </div>

        <!-- 评论输入框 -->
        <div class="reddit-comment-bar">
          <input
            v-model="commentDraft"
            class="reddit-comment-input"
            placeholder="写评论..."
            maxlength="500"
            :disabled="isCommenting"
            @keydown.enter="sendComment"
          />
          <button
            type="button"
            class="reddit-comment-send"
            :disabled="!commentDraft.trim() || isCommenting"
            @click="sendComment"
          >
            &#x27A4;
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
