<script setup>
/**
 * PhoneHomeScreen.vue - iOS 风格手机主屏
 * 显示状态栏、大时钟、应用网格和 Dock 栏。
 */
import { computed, inject, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { kvStorage } from '../../../../src/storage/index.js'
import { getPhoneWallpaperCache, setPhoneWallpaperCache, getPhoneWallpaperUrl, isPhoneWallpaperVideo } from './composables/usePhoneData.js'
import { useCustomAppIcons } from './composables/useCustomAppIcons.js'

const emit = defineEmits(['open-app', 'close'])

const isBluetoothConnected = inject('isBluetoothConnected', ref(false))
const bluetoothDeviceName = inject('bluetoothDeviceName', ref(''))

const now = ref(new Date())
let timer = null

const daysOfWeek = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

const timeStr = computed(() => {
  return `${now.value.getHours().toString().padStart(2, '0')}:${now.value.getMinutes().toString().padStart(2, '0')}`
})

const dateStr = computed(() => {
  const m = now.value.getMonth() + 1
  const d = now.value.getDate()
  const w = daysOfWeek[now.value.getDay()]
  return `${m}月${d}日 ${w}`
})

const calendarDay = computed(() => now.value.getDate())
const calendarMonth = computed(() => now.value.getMonth())

const phoneWallpaperUrl = ref(getPhoneWallpaperUrl())
const phoneWallpaperIsVideo = ref(isPhoneWallpaperVideo())
const phoneWallpaperVideoRef = ref(null)

const homeBackground = computed(() => {
  if (phoneWallpaperUrl.value && !phoneWallpaperIsVideo.value) {
    return {
      backgroundImage: `url(${phoneWallpaperUrl.value})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return {}
})

// 视频壁纸加载完成后自动播放
function onPhoneVideoLoaded() {
  if (phoneWallpaperVideoRef.value) {
    phoneWallpaperVideoRef.value.play().catch(() => {})
  }
}

onMounted(() => {
  if (phoneWallpaperIsVideo.value) {
    nextTick(() => {
      if (phoneWallpaperVideoRef.value) {
        phoneWallpaperVideoRef.value.play().catch(() => {})
      }
    })
  }
})

onMounted(async () => {
  timer = setInterval(() => { now.value = new Date() }, 30000)
  // 已有内存缓存则直接显示，后台异步刷新
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

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

// 自定义图标
const { icons: customIcons, getCustomIcon, triggerFilePicker, handleFileSelect, removeCustomIcon } = useCustomAppIcons({ filePickerId: 'app-icon-file-input' })

// 长按相关
const longPressApp = ref(null)
const longPressMenu = ref(null)
let longPressTimer = null

function onPointerDown(app) {
  longPressTimer = setTimeout(() => {
    longPressApp.value = app
    nextTick(() => {
      if (longPressMenu.value) {
        // 定位菜单在图标附近
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
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function closeLongPressMenu() {
  longPressApp.value = null
}

function onChangeIcon() {
  if (!longPressApp.value) return
  const appId = longPressApp.value.id
  closeLongPressMenu()
  triggerFilePicker('app-icon-file-input')
  // 存储当前正在编辑的 app id
  window.__currentIconAppId = appId
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
  // 重置 input 以便下次能选择同一文件
  event.target.value = ''
}

// 点击其他地方关闭菜单
function onBackgroundClick(e) {
  if (longPressApp.value && !e.target.closest('.icon-context-menu')) {
    closeLongPressMenu()
  }
}

// 应用定义
const apps = [
  { id: 'xiaohongshu', name: '小红书', icon: '📕', color: 'linear-gradient(135deg, #ff2442, #ff6b6b)' },
  { id: 'sms', name: '短信', icon: '💬', color: 'linear-gradient(135deg, #34c759, #30d158)' },
  { id: 'calls', name: '电话', icon: '📞', color: 'linear-gradient(135deg, #34c759, #28a745)' },
  { id: 'photos', name: '照片', icon: '🌈', color: 'linear-gradient(135deg, #ff6b6b, #ffd93d, #6bcb77, #4d96ff, #9b59b6)' },
  { id: 'game2048', name: '2048', icon: '🔢', color: 'linear-gradient(135deg, #edcf72, #edc22e)' },
  { id: 'minesweeper', name: '扫雷', icon: '💣', color: 'linear-gradient(135deg, #636e72, #2d3436)' },
  { id: 'tetris', name: '俄罗斯方块', icon: '🧱', color: 'linear-gradient(135deg, #00f0f0, #a000f0)' },
  { id: 'reddit', name: 'Reddit', icon: '🟠', color: 'linear-gradient(135deg, #ff4500, #ff6a00)' },
  { id: 'news', name: '今日X条', icon: '📰', color: 'linear-gradient(135deg, #4169e1, #1e90ff)' },
  { id: 'notes', name: '备忘录', icon: '📝', color: 'linear-gradient(135deg, #ffd60a, #ffb800)' },
  { id: 'calendar', name: '日历', icon: '📅', color: 'linear-gradient(135deg, #fff, #f0f0f0)', isCalendar: true },
  { id: 'brick', name: '打砖块', icon: '🏓', color: 'linear-gradient(135deg, #ff6b6b, #ee5a24)' },
  { id: 'klotski', name: '华容道', icon: '🧩', color: 'linear-gradient(135deg, #5856d6, #af52de)' },
  { id: 'quiz', name: '陪学', icon: '📖', color: 'linear-gradient(135deg, #667eea, #764ba2)' },
  { id: 'reader', name: '书城', icon: '📜', color: 'linear-gradient(135deg, #f5af19, #f12711)' },
  { id: 'pronunciation', name: '发音', icon: '🎙️', color: 'linear-gradient(135deg, #f093fb, #f5576c)' },
  { id: 'schedule', name: '日程', icon: '🗓️', color: 'linear-gradient(135deg, #ffd60a, #f5a623)' },
  { id: 'fridge', name: '小冰箱', icon: '🧊', color: 'linear-gradient(135deg, #00d2ff, #3a7bd5)' },
  { id: 'todo', name: '待办', icon: '📋', color: 'linear-gradient(135deg, #ff6b6b, #ee5a24)' },
  { id: 'moments', name: '朋友圈', icon: '🌍', color: 'linear-gradient(135deg, #00b4db, #0083b0)' },
  { id: 'relationship', name: '关系网', icon: '🔗', color: 'linear-gradient(135deg, #5856d6, #af52de)' },
  { id: 'scrapbook', name: '手帐', icon: '📓', color: 'linear-gradient(135deg, #f5af19, #f12711)' },
]

// Dock 栏
const dockApps = [
  { id: 'xiaohongshu', icon: '📕', color: 'linear-gradient(135deg, #ff2442, #ff6b6b)' },
  { id: 'sms', icon: '💬', color: 'linear-gradient(135deg, #34c759, #30d158)' },
  { id: 'calls', icon: '📞', color: 'linear-gradient(135deg, #34c759, #28a745)' },
  { id: 'notes', icon: '📝', color: 'linear-gradient(135deg, #ffd60a, #ffb800)' },
]

const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
</script>

<template>
  <div class="phone-home" :style="homeBackground" @click="onBackgroundClick">
    <!-- 视频壁纸背景 -->
    <video
      v-if="phoneWallpaperUrl && phoneWallpaperIsVideo"
      ref="phoneWallpaperVideoRef"
      class="phone-home-video-wallpaper"
      :src="phoneWallpaperUrl"
      :key="phoneWallpaperUrl"
      autoplay
      muted
      loop
      playsinline
      preload="auto"
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

    <div class="phone-home-content">
      <!-- 大时钟 -->
      <div class="phone-clock">
        <div class="clock-time">{{ timeStr }}</div>
        <div class="clock-date">{{ dateStr }}</div>
      </div>

      <!-- 应用网格 -->
      <div class="app-grid">
        <div v-for="app in apps" :key="app.id" :data-app-id="app.id" class="app-icon" @click="emit('open-app', app.id)" @pointerdown="onPointerDown(app)" @pointerup="onPointerUp" @pointercancel="onPointerUp">
          <button
            type="button"
            class="app-icon-btn"
            :style="getCustomIcon(app.id) ? { backgroundImage: `url(${getCustomIcon(app.id)})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : {}"
          >
            <template v-if="getCustomIcon(app.id)">
            </template>
            <template v-else-if="app.isCalendar">
              <span style="font-size:0.6rem;color:rgba(255,255,255,0.9);font-weight:700;position:absolute;top:4px;">{{ months[calendarMonth].slice(0, 1) }}</span>
              <span style="font-size:1.4rem;font-weight:300;color:rgba(255,255,255,0.95);margin-top:6px;">{{ calendarDay }}</span>
            </template>
            <template v-else>
              {{ app.icon }}
            </template>
          </button>
          <span class="app-icon-label">{{ app.name }}</span>
        </div>
      </div>
    </div>

    <!-- Dock 栏 -->
    <div class="phone-dock">
      <div class="app-icon" @click="emit('close')" @pointerdown="onPointerDown(dockApps[0])" @pointerup="onPointerUp" @pointercancel="onPointerUp">
        <button type="button" class="app-icon-btn dock-close-btn">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="4" ry="4"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
          </svg>
        </button>
      </div>
      <div v-for="app in dockApps.slice(1)" :key="app.id" :data-app-id="app.id" class="app-icon" @click="emit('open-app', app.id)" @pointerdown="onPointerDown(app)" @pointerup="onPointerUp" @pointercancel="onPointerUp">
        <button
          type="button"
          class="app-icon-btn"
          :style="getCustomIcon(app.id) ? { backgroundImage: `url(${getCustomIcon(app.id)})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : {}"
        >
          <template v-if="getCustomIcon(app.id)">
          </template>
          <template v-else>
            {{ app.icon }}
          </template>
        </button>
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
    <input
      id="app-icon-file-input"
      type="file"
      accept="image/*"
      style="display:none"
      @change="onFileChange"
    />
  </div>
</template>

<style scoped>
/* 长按弹出上下文菜单 */
.icon-context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 160px;
  background: rgba(44, 44, 46, 0.97);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  transform: translate(-50%, 0);
}

.icon-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
}

.icon-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.icon-menu-item:active {
  background: rgba(255, 255, 255, 0.15);
}

.icon-menu-item--danger {
  color: #ff453a;
}

.icon-menu-item--danger:hover {
  background: rgba(255, 69, 58, 0.1);
}
</style>
