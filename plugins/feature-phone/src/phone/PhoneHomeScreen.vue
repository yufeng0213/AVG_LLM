<script setup>
/**
 * PhoneHomeScreen.vue - 仿真实手机主屏
 * 布局：时间卡片 + 角色对话卡片 → 应用网格 → 今日行程 → 常用应用 → Dock
 */
import { computed, inject, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { kvStorage } from '../../../../src/storage/index.js'
import { getPhoneWallpaperCache, setPhoneWallpaperCache, getPhoneWallpaperUrl, isPhoneWallpaperVideo } from './composables/usePhoneData.js'
import { useCustomAppIcons } from './composables/useCustomAppIcons.js'

const emit = defineEmits(['open-app', 'close'])

// ===== 注入主屏数据 =====
const phoneCharacter = inject('phoneCharacter', { character: ref(null), signature: ref(''), favor: ref(50), favorLevel: ref({ name: '中立', icon: '' }) })
const phoneWeather = inject('phoneWeather', { weatherData: ref({ weather: '晴', temperature: '24' }), weatherStyle: ref({ emoji: '☀️' }) })
const phoneCalendarEvents = inject('phoneCalendarEvents', ref([]))

const isBluetoothConnected = inject('isBluetoothConnected', ref(false))
const bluetoothDeviceName = inject('bluetoothDeviceName', ref(''))

const now = ref(new Date())
let timer = null

const daysOfWeek = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

const timeStr = computed(() => `${now.value.getHours().toString().padStart(2, '0')}:${now.value.getMinutes().toString().padStart(2, '0')}`)
const dateStr = computed(() => {
  const m = now.value.getMonth() + 1
  const d = now.value.getDate()
  const w = daysOfWeek[now.value.getDay()]
  return `${m}月${d}日 ${w}`
})

// 日历小图标用
const calendarDay = computed(() => now.value.getDate())
const calendarMonth = computed(() => now.value.getMonth())

// ===== 壁纸 =====
const phoneWallpaperUrl = ref(getPhoneWallpaperUrl())
const phoneWallpaperIsVideo = ref(isPhoneWallpaperVideo())
const phoneWallpaperVideoRef = ref(null)

const homeBackground = computed(() => {
  if (phoneWallpaperUrl.value && !phoneWallpaperIsVideo.value) {
    return { backgroundImage: `url(${phoneWallpaperUrl.value})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  return {}
})

function onPhoneVideoLoaded() {
  if (phoneWallpaperVideoRef.value) phoneWallpaperVideoRef.value.play().catch(() => {})
}

onMounted(() => {
  if (phoneWallpaperIsVideo.value) {
    nextTick(() => { if (phoneWallpaperVideoRef.value) phoneWallpaperVideoRef.value.play().catch(() => {}) })
  }
})

onMounted(async () => {
  timer = setInterval(() => { now.value = new Date() }, 30000)
  if (getPhoneWallpaperCache()) return
  const wpId = await kvStorage.get('phone_wallpaper_photo_id')
  if (wpId) {
    const photos = await kvStorage.get('phone_photos')
    if (photos) {
      const photo = photos.find(p => p.id === wpId)
      if (photo) {
        setPhoneWallpaperCache({ dataUrl: photo.dataUrl, isVideo: !!photo.isVideo })
        phoneWallpaperUrl.value = photo.dataUrl
        phoneWallpaperIsVideo.value = !!photo.isVideo
      }
    }
  }
})

onUnmounted(() => { if (timer) clearInterval(timer) })

// ===== 自定义图标 =====
const { getCustomIcon, triggerFilePicker, handleFileSelect, removeCustomIcon } = useCustomAppIcons({ filePickerId: 'app-icon-file-input' })

// ===== 长按菜单 =====
const longPressApp = ref(null)
const longPressMenu = ref(null)
let longPressTimer = null

function onPointerDown(app) {
  longPressTimer = setTimeout(() => {
    longPressApp.value = app
    nextTick(() => {
      if (longPressMenu.value) {
        const btn = document.querySelector(`[data-app-id="${app.id}"] .app-icon-btn`)
        if (btn) {
          const rect = btn.getBoundingClientRect()
          longPressMenu.value.style.left = `${rect.left + rect.width / 2}px`
          longPressMenu.value.style.top = `${rect.top + rect.height + 8}px`
        }
      }
    })
  }, 500)
}

function onPointerUp() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
}

function closeLongPressMenu() { longPressApp.value = null }

function onChangeIcon() {
  if (!longPressApp.value) return
  closeLongPressMenu()
  triggerFilePicker('app-icon-file-input')
  window.__currentIconAppId = longPressApp.value.id
}

function onResetIcon() {
  if (!longPressApp.value) return
  removeCustomIcon(longPressApp.value.id)
  closeLongPressMenu()
}

async function onFileChange(event) {
  const appId = window.__currentIconAppId
  if (appId) {
    await handleFileSelect(event, appId, 60)
    window.__currentIconAppId = null
  }
  event.target.value = ''
}

function onBackgroundClick(e) {
  if (longPressApp.value && !e.target.closest('.icon-context-menu')) closeLongPressMenu()
}

// ===== 应用定义（每页8个，4×2） =====
const apps = [
  { id: 'xiaohongshu', name: '小红书', icon: '📕', color: 'linear-gradient(135deg, #ff2442, #ff6b6b)' },
  { id: 'photos', name: '照片', icon: '🌈', color: 'linear-gradient(135deg, #ff6b6b, #ffd93d, #6bcb77, #4d96ff, #9b59b6)' },
  { id: 'game2048', name: '2048', icon: '🔢', color: 'linear-gradient(135deg, #edcf72, #edc22e)' },
  { id: 'tetris', name: '俄罗斯方块', icon: '🧱', color: 'linear-gradient(135deg, #00f0f0, #a000f0)' },
  { id: 'reddit', name: 'Reddit', icon: '🟠', color: 'linear-gradient(135deg, #ff4500, #ff6a00)' },
  { id: 'news', name: '今日X条', icon: '📰', color: 'linear-gradient(135deg, #4169e1, #1e90ff)' },
  { id: 'brick', name: '打砖块', icon: '', color: 'linear-gradient(135deg, #ff6b6b, #ee5a24)' },
  { id: 'klotski', name: '华容道', icon: '🧩', color: 'linear-gradient(135deg, #5856d6, #af52de)' },
  { id: 'quiz', name: '陪学', icon: '📖', color: 'linear-gradient(135deg, #667eea, #764ba2)' },
  { id: 'reader', name: '书城', icon: '📜', color: 'linear-gradient(135deg, #f5af19, #f12711)' },
  { id: 'pronunciation', name: '发音', icon: '🎙️', color: 'linear-gradient(135deg, #f093fb, #f5576c)' },
  { id: 'minesweeper', name: '扫雷', icon: '💣', color: 'linear-gradient(135deg, #636e72, #2d3436)' },
  { id: 'moments', name: '朋友圈', icon: '🌍', color: 'linear-gradient(135deg, #00b4db, #0083b0)' },
  { id: 'relationship', name: '关系网', icon: '🔗', color: 'linear-gradient(135deg, #5856d6, #af52de)' },
  { id: 'scrapbook', name: '手帐', icon: '📓', color: 'linear-gradient(135deg, #f5af19, #f12711)' },
  { id: 'fridge', name: '小冰箱', icon: '', color: 'linear-gradient(135deg, #00d2ff, #3a7bd5)' },
]

// 分页：每页8个
const APPS_PER_PAGE = 8
const appPages = computed(() => {
  const pages = []
  for (let i = 0; i < apps.length; i += APPS_PER_PAGE) pages.push(apps.slice(i, i + APPS_PER_PAGE))
  return pages
})

const currentPage = ref(0)
const totalPages = computed(() => appPages.value.length)
const pagesContainer = ref(null)

function onPagesScroll() {
  if (!pagesContainer.value) return
  const newPage = Math.round(pagesContainer.value.scrollLeft / pagesContainer.value.clientWidth)
  if (newPage !== currentPage.value) currentPage.value = Math.min(Math.max(newPage, 0), totalPages.value - 1)
}

// Dock
const dockApps = [
  { id: 'close', name: '退出', icon: '✕', color: 'rgba(255,255,255,0.15)', isClose: true },
  { id: 'sms', name: '短信', icon: '💬', color: 'linear-gradient(135deg, #5ac8fa, #007aff)' },
  { id: 'browser', name: '浏览器', icon: '🧭', color: 'linear-gradient(135deg, #007aff, #5856d6)' },
  { id: 'contacts', name: '联系人', icon: '👤', color: 'linear-gradient(135deg, #af52de, #5856d6)' },
  { id: 'weixin', name: '微信', icon: '💚', color: 'linear-gradient(135deg, #07c160, #06ad56)' },
]

// 日程过滤（今日）
const todayEvents = computed(() => {
  const today = `${now.value.getFullYear()}-${String(now.value.getMonth() + 1).padStart(2, '0')}-${String(now.value.getDate()).padStart(2, '0')}`
  return (phoneCalendarEvents.value || []).filter(e => e.date === today && e.status !== 'dismissed').slice(0, 4)
})
</script>

<template>
  <div class="phone-home" :style="homeBackground" @click="onBackgroundClick">
    <!-- 视频壁纸 -->
    <video
      v-if="phoneWallpaperUrl && phoneWallpaperIsVideo"
      ref="phoneWallpaperVideoRef"
      class="phone-home-video-wallpaper"
      :src="phoneWallpaperUrl" :key="phoneWallpaperUrl"
      autoplay muted loop playsinline preload="auto"
      @loadeddata="onPhoneVideoLoaded"
    />

    <!-- 状态栏 -->
    <div class="phone-status-bar">
      <span class="status-bar-time">{{ timeStr }}</span>
      <div class="status-bar-icons">
        <span v-if="isBluetoothConnected" class="bluetooth-icon" :title="bluetoothDeviceName">&#x1F50A;</span>
        <div class="signal-bars">
          <span class="signal-bar" /><span class="signal-bar" /><span class="signal-bar" /><span class="signal-bar" />
        </div>
        <span class="network-type">5G</span>
        <div class="battery-icon">
          <div class="battery-body"><div class="battery-level" style="width:80%" /></div>
          <span class="battery-tip" />
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="phone-home-content">

      <!-- ====== 顶部卡片区：时间卡片 + 角色对话 ====== -->
      <div class="top-cards">
        <!-- 时间卡片 -->
        <div class="time-card">
          <div class="time-card-time">{{ timeStr }}</div>
          <div class="time-card-date">{{ dateStr }}</div>
          <div class="time-card-weather">
            <span class="weather-emoji">{{ phoneWeather.weatherStyle.emoji }}</span>
            <span>{{ phoneWeather.weatherData.weather }} {{ phoneWeather.weatherData.temperature }}°C</span>
          </div>
          <div class="time-card-quote">每一天的温柔<br>都是命中注定的相遇</div>
        </div>

        <!-- 角色对话卡片 -->
        <div class="character-card">
          <div class="character-avatar-wrapper">
            <div class="character-avatar" :style="phoneCharacter.character?.portraits?.length ? { backgroundImage: `url(${phoneCharacter.character.portraits[0].filePath})` } : {}">
              <span v-if="!phoneCharacter.character?.portraits?.length" class="avatar-placeholder">👤</span>
            </div>
          </div>
          <div class="character-bubble">
            <p class="character-quote">{{ phoneCharacter.signature || '你今天很阳光，这连阳光都觉得让人心动' }}</p>
            <span class="character-name">— {{ phoneCharacter.character?.name || '黎深' }}</span>
          </div>
          <div class="character-affinity">
            <span class="heart-icon">&#x2764;</span>
            <span class="affinity-value">{{ phoneCharacter.favor }}</span>
          </div>
        </div>
      </div>

      <!-- ====== 应用网格（可滑动分页） ====== -->
      <div ref="pagesContainer" class="pages-swipe-container" @scroll="onPagesScroll">
        <div v-for="(page, pageIndex) in appPages" :key="pageIndex" class="app-page">
          <div class="app-grid">
            <div v-for="app in page" :key="app.id" :data-app-id="app.id" class="app-icon" @click="emit('open-app', app.id)" @pointerdown="onPointerDown(app)" @pointerup="onPointerUp" @pointercancel="onPointerUp">
              <button type="button" class="app-icon-btn" :style="getCustomIcon(app.id) ? { backgroundImage: `url(${getCustomIcon(app.id)})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : {}">
                <template v-if="getCustomIcon(app.id)"></template>
                <template v-else-if="app.isCalendar">
                  <span class="calendar-month">{{ months[calendarMonth].slice(0, 1) }}</span>
                  <span class="calendar-day">{{ calendarDay }}</span>
                </template>
                <template v-else>{{ app.icon }}</template>
              </button>
              <span class="app-icon-label">{{ app.name }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ====== 待办事项卡片 ====== -->
      <div class="todo-card">
        <div class="todo-card-header">
          <span class="todo-card-title">&#x1F4CB; 待办事项</span>
        </div>
        <div class="todo-card-body">
          <span class="todo-placeholder">暂无待办事项</span>
        </div>
      </div>

      <!-- 页面指示点 -->
      <div v-if="totalPages > 1" class="page-indicator">
        <span v-for="(_, i) in appPages" :key="i" class="page-dot" :class="{ active: i === currentPage }" />
      </div>

      <!-- ====== 今日行程卡片 ====== -->
      <div class="schedule-card" v-if="todayEvents.length">
        <div class="schedule-card-header">
          <span class="schedule-card-title">&#x1F4C5; 今日行程</span>
          <span class="schedule-card-more" @click="emit('open-app', 'schedule')">查看更多 &#x203A;</span>
        </div>
        <div class="schedule-card-list">
          <div v-for="ev in todayEvents" :key="ev.id" class="schedule-item">
            <span class="schedule-item-time">{{ ev.time || '全天' }}</span>
            <span class="schedule-item-title">{{ ev.title }}</span>
          </div>
          <div v-if="!todayEvents.length" class="schedule-item schedule-item-empty">
            今日暂无行程安排
          </div>
        </div>
      </div>

    </div>

    <!-- ====== Dock 栏 ====== -->
    <div class="phone-dock">
      <div v-for="app in dockApps" :key="app.id" :data-app-id="app.id" class="dock-icon" @click="app.isClose ? emit('close') : emit('open-app', app.id)">
        <div class="dock-icon-btn" :class="{ 'dock-close-btn': app.isClose }" :style="{ background: app.color }">
          {{ app.icon }}
        </div>
        <span class="dock-icon-label">{{ app.name }}</span>
      </div>
    </div>

    <!-- 长按弹出菜单 -->
    <Teleport to="body">
      <div v-if="longPressApp" ref="longPressMenu" class="icon-context-menu" @click.stop>
        <button type="button" class="icon-menu-item" @click="onChangeIcon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          更换图标
        </button>
        <button v-if="getCustomIcon(longPressApp.id)" type="button" class="icon-menu-item icon-menu-item--danger" @click="onResetIcon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
          恢复默认
        </button>
      </div>
    </Teleport>

    <!-- 隐藏的文件输入 -->
    <input id="app-icon-file-input" type="file" accept="image/*" style="display:none" @change="onFileChange" />
  </div>
</template>

<style scoped>
/* 长按菜单 */
.icon-context-menu {
  position: fixed; z-index: 9999; min-width: 160px;
  background: rgba(44, 44, 46, 0.97); backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px); border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.4); overflow: hidden; transform: translate(-50%, 0);
}
.icon-menu-item {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 12px 16px;
  background: transparent; border: none; color: #fff; font-size: 14px; cursor: pointer; text-align: left;
}
.icon-menu-item:hover { background: rgba(255,255,255,0.1); }
.icon-menu-item:active { background: rgba(255,255,255,0.15); }
.icon-menu-item--danger { color: #ff453a; }
.icon-menu-item--danger:hover { background: rgba(255,69,58,0.1); }
</style>
