<script setup>
/**
 * PhoneNewsApp.vue - 今日X条 新闻应用
 * 每个世界书 = 一个新闻频道，不同媒体视角报道同一事件。
 * 刷新替换模式，分隔符 LLM 输出。
 */
import { computed, onMounted, ref } from 'vue'
import { loadWorldBooks } from '../../../../src/worldbook/worldBookStore.js'
import { generatePhoneNewsFeed } from '../../../../src/llm/index.js'
import { kvStorage } from '../../../../src/storage/index.js'

const emit = defineEmits(['back'])

const STORAGE_KEY = 'phone_news_data_v1'

// 视图状态: 'channels' | 'feed' | 'detail'
const currentView = ref('channels')
const selectedChannel = ref(null)
const selectedEvent = ref(null)
const selectedVersionIndex = ref(0)

// 数据
const channels = ref([])       // [{ worldBookId, worldBookTitle, eventCount, lastRefreshedAt }]
const channelData = ref({})    // worldBookId -> { lastRefreshedAt, events: [...] }

// 状态
const isRefreshing = ref(false)

// 新闻频道分类标签
const NEWS_TAGS = ['热点', '传闻', '深度', '最新']

onMounted(async () => {
  const [books, saved] = await Promise.all([
    loadWorldBooks(),
    kvStorage.get(STORAGE_KEY),
  ])

  // 初始化频道
  channels.value = books.map(b => ({
    worldBookId: b.id,
    worldBookTitle: b.title || '未命名世界书',
    eventCount: 0,
    lastRefreshedAt: null,
  }))

  // 恢复缓存数据
  if (saved) {
    channelData.value = saved.channelData || {}
    // 更新频道的事件数量
    for (const ch of channels.value) {
      const data = channelData.value[ch.worldBookId]
      if (data && data.events) {
        ch.eventCount = data.events.length
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
  })
}

function openChannel(channel) {
  selectedChannel.value = channel
  currentView.value = 'feed'
}

// 刷新频道新闻
async function refreshFeed() {
  if (!selectedChannel.value || isRefreshing.value) return
  isRefreshing.value = true

  try {
    const books = await loadWorldBooks()
    const book = books.find(b => b.id === selectedChannel.value.worldBookId)

    // 收集话题种子和媒体风格（从世界书中提取）
    const topicSeeds = collectTopicSeeds(book)
    const mediaProfiles = buildMediaProfiles(book)

    const result = await generatePhoneNewsFeed({
      worldBook: book || { id: selectedChannel.value.worldBookId, title: selectedChannel.value.worldBookTitle },
      dialogueHistory: [], // 暂不支持剧情上下文
      currentLine: null,
      topicSeeds,
      mediaProfiles,
      eventCount: 5,
      versionsPerEvent: 3,
    })

    if (result.success && result.events.length > 0) {
      channelData.value[selectedChannel.value.worldBookId] = {
        lastRefreshedAt: new Date().toISOString(),
        events: result.events,
      }
      selectedChannel.value.eventCount = result.events.length
      selectedChannel.value.lastRefreshedAt = new Date().toISOString()
      await saveData()
    } else {
      alert('新闻生成失败，请重试')
    }
  } catch (e) {
    console.warn('[PhoneNewsApp] 刷新失败:', e)
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

      const topicSeeds = collectTopicSeeds(book)
      const mediaProfiles = buildMediaProfiles(book)

      const result = await generatePhoneNewsFeed({
        worldBook: book,
        dialogueHistory: [],
        currentLine: null,
        topicSeeds,
        mediaProfiles,
        eventCount: 4,
        versionsPerEvent: 3,
      })

      if (result.success && result.events.length > 0) {
        channelData.value[book.id] = {
          lastRefreshedAt: new Date().toISOString(),
          events: result.events,
        }
        ch.eventCount = result.events.length
        ch.lastRefreshedAt = new Date().toISOString()
        total += result.events.length
      }
    }
    await saveData()
    if (total === 0) alert('全部刷新失败')
  } catch (e) {
    console.warn('[PhoneNewsApp] 全部刷新失败:', e)
    alert('刷新失败: ' + (e.message || '未知错误'))
  } finally {
    isRefreshing.value = false
  }
}

// 从世界书收集话题种子
function collectTopicSeeds(book) {
  const seeds = []
  if (book?.summary) seeds.push(book.summary)
  if (book?.entries?.overview) seeds.push(book.entries.overview)
  if (book?.entries?.conflict) seeds.push(book.entries.conflict)

  const chars = book?.characters || []
  chars.slice(0, 6).forEach(c => {
    if (c?.name) seeds.push(`${c.name}相关消息`)
    if (c?.identity) seeds.push(c.identity)
  })

  const scenes = book?.scenes || []
  scenes.slice(0, 6).forEach(s => {
    if (s?.name) seeds.push(s.name)
  })

  // 添加一些通用话题
  seeds.push('突发事件', '重要人物动向', '市场波动')

  return seeds.slice(0, 16)
}

// 根据世界书风格构建媒体列表
function buildMediaProfiles(book) {
  const worldTitle = book?.title || '本地'
  const baseProfiles = [
    { name: '晨星快报', style: '都市快讯，信息密度高，标题直接' },
    { name: '观察者报', style: '深度调查，重证据与线索串联' },
    { name: '财经日报', style: '财经视角，关注资源与价格波动' },
    { name: '晚潮评论', style: '评论社论，强调观点冲突' },
    { name: '街角小报', style: '市井八卦，语气活泼但夹杂传闻' },
    { name: `${worldTitle}晨报`, style: '区域纸媒，重本地民生' },
    { name: `${worldTitle}速览`, style: '移动端短讯，标题更抓眼球' },
  ]

  // 根据世界书风格调整（如果有设定）
  const era = book?.entries?.era || ''
  if (era.includes('古代') || era.includes('中世纪')) {
    baseProfiles.push({ name: '城邦公告', style: '官方口吻，庄重典雅' })
    baseProfiles.push({ name: '酒馆传闻', style: '民间口耳相传，真假难辨' })
  }
  if (era.includes('现代') || era.includes('都市')) {
    baseProfiles.push({ name: '网络热搜', style: '网文风格，情绪化标题' })
  }
  if (era.includes('未来') || era.includes('科幻')) {
    baseProfiles.push({ name: '数据流', style: '数字播报，简洁精确' })
  }

  return baseProfiles.slice(0, 8)
}

// 查看新闻详情
function openEvent(event) {
  selectedEvent.value = event
  selectedVersionIndex.value = 0
  currentView.value = 'detail'
}

// 选择版本
function selectVersion(index) {
  if (!selectedEvent.value) return
  const total = selectedEvent.value.versions?.length || 0
  selectedVersionIndex.value = Math.max(0, Math.min(index, total - 1))
}

// 获取当前频道的新闻事件
const feedEvents = computed(() => {
  if (!selectedChannel.value) return []
  const data = channelData.value[selectedChannel.value.worldBookId]
  if (!data || !data.events) return []

  // 按重要性排序
  const events = [...data.events]
  events.sort((a, b) => {
    const rankA = getImportanceRank(a?.importance)
    const rankB = getImportanceRank(b?.importance)
    return rankB - rankA
  })
  return events
})

// 获取当前选中版本
const selectedVersion = computed(() => {
  if (!selectedEvent.value || !selectedEvent.value.versions) return null
  return selectedEvent.value.versions[selectedVersionIndex.value] || null
})

function getImportanceRank(importance) {
  if (importance === 'high') return 3
  if (importance === 'medium') return 2
  return 1
}

function getImportanceLabel(importance) {
  if (importance === 'high') return '热点'
  if (importance === 'low') return '次要'
  return '关注'
}

function getCredibilityLabel(credibility) {
  if (credibility === 'confirmed') return '已证实'
  if (credibility === 'rumor') return '传闻'
  return '分析'
}

// 可信度标签样式
function credibilityStyle(credibility) {
  const colors = {
    confirmed: { bg: 'rgba(52,199,89,0.2)', text: '#a5d6a7' },
    rumor: { bg: 'rgba(255,149,0,0.2)', text: '#ffcc80' },
    analysis: { bg: 'rgba(90,200,250,0.2)', text: '#81d4fa' },
  }
  return colors[credibility] || colors.analysis
}

// 重要性标签样式
function importanceStyle(importance) {
  const colors = {
    high: { bg: 'rgba(255,59,48,0.2)', text: '#ef9a9a' },
    medium: { bg: 'rgba(255,204,0,0.2)', text: '#fff59d' },
    low: { bg: 'rgba(142,142,147,0.2)', text: '#bdbdbd' },
  }
  return colors[importance] || colors.medium
}

function goBack() {
  if (currentView.value === 'detail') {
    currentView.value = 'feed'
    selectedEvent.value = null
    selectedVersionIndex.value = 0
  } else if (currentView.value === 'feed') {
    currentView.value = 'channels'
    selectedChannel.value = null
  } else {
    emit('back')
  }
}
</script>

<template>
  <div class="news-app">
    <!-- 频道列表 -->
    <template v-if="currentView === 'channels'">
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="emit('back')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="phone-app-title">今日X条</h2>
        <button type="button" class="phone-app-back-btn news-refresh-btn" @click="refreshAll" :disabled="isRefreshing">
          {{ isRefreshing ? '刷新中...' : '全部刷新' }}
        </button>
      </div>

      <div class="news-channels">
        <div
          v-for="ch in channels"
          :key="ch.worldBookId"
          class="news-channel-item"
          @click="openChannel(ch)"
        >
          <div class="news-channel-icon">
            <span class="news-channel-emoji">&#x1F4F0;</span>
          </div>
          <div class="news-channel-info">
            <div class="news-channel-name">{{ ch.worldBookTitle }} 新闻</div>
            <div class="news-channel-meta">
              {{ ch.eventCount > 0 ? `${ch.eventCount} 条新闻` : '暂无新闻' }}
              <span v-if="ch.lastRefreshedAt"> &middot; {{ formatLastRefresh(ch.lastRefreshedAt) }}</span>
            </div>
          </div>
          <svg class="news-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>

        <div v-if="channels.length === 0" class="phone-loading">
          暂无世界书
        </div>
      </div>
    </template>

    <!-- 新闻列表 -->
    <template v-else-if="currentView === 'feed'">
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="goBack">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="phone-app-title">{{ selectedChannel?.worldBookTitle }}</h2>
        <button type="button" class="phone-app-back-btn news-refresh-btn" @click="refreshFeed" :disabled="isRefreshing">
          {{ isRefreshing ? '刷新中...' : '刷新' }}
        </button>
      </div>

      <div class="news-feed">
        <template v-if="feedEvents.length > 0">
          <div
            v-for="event in feedEvents"
            :key="event.topic"
            class="news-event-card"
            @click="openEvent(event)"
          >
            <div class="news-event-header">
              <div class="news-importance-badge" :style="importanceStyle(event.importance)">
                {{ getImportanceLabel(event.importance) }}
              </div>
              <span class="news-event-versions">&#x1F4F0; {{ event.versions?.length || 0 }} 版</span>
            </div>
            <div class="news-event-topic">{{ event.topic }}</div>
            <div class="news-event-preview">
              {{ event.versions?.[0]?.headline || '点击查看详情' }}
            </div>
            <div class="news-event-footer">
              <span class="news-event-outlet">{{ event.versions?.[0]?.outlet || '' }}</span>
              <span class="news-event-credibility" :style="credibilityStyle(event.versions?.[0]?.credibility)">
                {{ getCredibilityLabel(event.versions?.[0]?.credibility) }}
              </span>
            </div>
          </div>
        </template>

        <div v-else class="phone-loading" style="padding-top:60px">
          {{ isRefreshing ? '生成新闻中...' : '点击"刷新"生成新闻' }}
        </div>
      </div>
    </template>

    <!-- 新闻详情 -->
    <template v-else-if="currentView === 'detail'">
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="goBack">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="phone-app-title">新闻详情</h2>
        <div class="phone-app-header-spacer" />
      </div>

      <div class="news-detail">
        <!-- 事件主题 -->
        <div class="news-detail-topic">
          <div class="news-importance-badge" :style="importanceStyle(selectedEvent?.importance)">
            {{ getImportanceLabel(selectedEvent?.importance) }}
          </div>
          <div class="news-topic-text">{{ selectedEvent?.topic }}</div>
        </div>

        <!-- 版本切换 -->
        <div class="news-version-tabs" v-if="selectedEvent?.versions?.length > 1">
          <button
            v-for="(version, index) in selectedEvent?.versions"
            :key="index"
            type="button"
            class="news-version-tab"
            :class="{ active: index === selectedVersionIndex }"
            @click="selectVersion(index)"
          >
            {{ version.outlet }}
          </button>
        </div>

        <!-- 当前版本内容 -->
        <div class="news-version-content" v-if="selectedVersion">
          <div class="news-version-header">
            <span class="news-version-outlet">{{ selectedVersion.outlet }}</span>
            <span class="news-version-credibility" :style="credibilityStyle(selectedVersion.credibility)">
              {{ getCredibilityLabel(selectedVersion.credibility) }}
            </span>
          </div>
          <div class="news-version-headline">{{ selectedVersion.headline }}</div>
          <div class="news-version-summary">{{ selectedVersion.summary }}</div>
          <div class="news-version-meta">
            <span v-if="selectedVersion.style">{{ selectedVersion.style }}</span>
          </div>
        </div>

        <!-- 其他版本摘要 -->
        <div class="news-other-versions" v-if="selectedEvent?.versions?.length > 1">
          <div class="news-other-header">其他媒体报道</div>
          <div
            v-for="(version, index) in selectedEvent?.versions"
            :key="index"
            class="news-other-item"
            :class="{ current: index === selectedVersionIndex }"
            @click="selectVersion(index)"
          >
            <span class="news-other-outlet">{{ version.outlet }}</span>
            <span class="news-other-headline">{{ version.headline }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.news-app {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1c1c1e;
  color: #fff;
}

.phone-app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(28, 28, 30, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.phone-app-back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.phone-app-back-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.phone-app-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.phone-app-header-spacer {
  width: 60px;
}

/* 频道列表 */
.news-channels {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.news-channel-item {
  display: flex;
  align-items: center;
  padding: 14px 12px;
  background: rgba(44, 44, 46, 0.8);
  border-radius: 12px;
  margin-bottom: 8px;
  cursor: pointer;
}

.news-channel-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #4169e1, #1e90ff);
  border-radius: 10px;
}

.news-channel-emoji {
  font-size: 20px;
}

.news-channel-info {
  flex: 1;
  margin-left: 12px;
}

.news-channel-name {
  font-size: 15px;
  font-weight: 500;
  color: #fff;
}

.news-channel-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}

.news-chevron {
  color: rgba(255, 255, 255, 0.4);
}

/* 新闻列表 */
.news-feed {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.news-event-card {
  padding: 14px 12px;
  background: rgba(44, 44, 46, 0.8);
  border-radius: 12px;
  margin-bottom: 8px;
  cursor: pointer;
}

.news-event-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.news-importance-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.news-event-versions {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.news-event-topic {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  margin-bottom: 4px;
}

.news-event-preview {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.4;
  margin-bottom: 8px;
}

.news-event-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.news-event-outlet {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.news-event-credibility {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}

/* 新闻详情 */
.news-detail {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.news-detail-topic {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(44, 44, 46, 0.8);
  border-radius: 12px;
  margin-bottom: 12px;
}

.news-topic-text {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.news-version-tabs {
  display: flex;
  gap: 6px;
  padding: 8px 0;
  overflow-x: auto;
}

.news-version-tab {
  padding: 8px 16px;
  background: rgba(44, 44, 46, 0.6);
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.news-version-tab.active {
  background: rgba(65, 105, 225, 0.3);
  color: #fff;
}

.news-version-content {
  padding: 16px 12px;
  background: rgba(44, 44, 46, 0.8);
  border-radius: 12px;
  margin-bottom: 12px;
}

.news-version-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.news-version-outlet {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
}

.news-version-credibility {
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.news-version-headline {
  font-size: 17px;
  font-weight: 600;
  color: #fff;
  line-height: 1.4;
  margin-bottom: 12px;
}

.news-version-summary {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.6;
}

.news-version-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 12px;
}

.news-other-versions {
  padding: 12px;
  background: rgba(44, 44, 46, 0.6);
  border-radius: 12px;
}

.news-other-header {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 10px;
}

.news-other-item {
  display: flex;
  align-items: center;
  padding: 10px 8px;
  border-radius: 8px;
  cursor: pointer;
  gap: 8px;
}

.news-other-item.current {
  background: rgba(65, 105, 225, 0.2);
}

.news-other-item:not(.current):hover {
  background: rgba(255, 255, 255, 0.05);
}

.news-other-outlet {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  min-width: 60px;
}

.news-other-headline {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  flex: 1;
}

.phone-loading {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  padding: 40px 20px;
}

/* 刷新按钮 */
.news-refresh-btn {
  background: rgba(65, 105, 225, 0.2);
}
</style>