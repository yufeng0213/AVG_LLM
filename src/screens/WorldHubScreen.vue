<script setup>
import './WorldHubScreen.css'
import { computed, nextTick, onActivated, onMounted, ref, watch } from 'vue'
import { isNative } from '../utils/platform.js'
import { useGlobalUser } from '../composables/useGlobalUser.js'
import { useAvatar } from '../../plugins/feature-dormitory/src/composables/useAvatar.js'
import { useAvatarFrame } from '../../plugins/feature-dormitory/src/composables/useAvatarFrame.js'
import { getWorldWallpaperCache, setWorldWallpaperCache, getWorldWallpaperUrl, isWorldWallpaperVideo } from '../../plugins/feature-phone/src/phone/composables/usePhoneData.js'
import { kvStorage } from '../storage/index.js'

defineOptions({ name: 'WorldHubScreen' })

const emit = defineEmits([
  'back',
  'open-main-story',
  'open-dormitory',
  'open-game-center',
  'open-trpg',
  'open-shop',
  'open-task',
  'open-checkin',
  'open-checkin7',
  'open-mailbox',
  'open-worldbook',
  'open-world-memory',
  'open-card-collection',
  'open-adventure',
  'open-narrator',
  'open-plugin',
  'open-world-map',
  'open-settings',
  'open-face-to-face',
  'open-phone',
  'open-avatar',
  'open-test',
  'open-rose',
  'open-book',
  'open-hourglass',
  'open-mobius',
  'open-dreams',
  'open-timeline',
  'open-evolution-log',
])

const { username, avatar: globalAvatar, economy } = useGlobalUser()
const { activeAvatarDataUrl } = useAvatar()
const { activeFrame, loadFrameDataUrl } = useAvatarFrame()

const showParticleMenu = ref(false)

function openParticleMenu() {
  showParticleMenu.value = true
}

function openParticle(key) {
  showParticleMenu.value = false
  emit(`open-${key}`)
}

// 使用全局头像（优先）或 fallback 到 avatar composable
const displayAvatar = computed(() => globalAvatar.value || activeAvatarDataUrl.value)

// 头像框：需要处理 Android 原生环境 dataUrl 为 null 的情况
const displayFrameUrl = ref(null)

async function loadActiveFrameUrl() {
  const frame = activeFrame.value
  if (!frame) {
    displayFrameUrl.value = null
    return
  }
  if (frame.dataUrl) {
    displayFrameUrl.value = frame.dataUrl
    return
  }
  // 原生环境：从文件系统加载
  if (isNative()) {
    const url = await loadFrameDataUrl(frame)
    displayFrameUrl.value = url
  }
}

watch(() => activeFrame.value?.id, () => {
  loadActiveFrameUrl()
})

// 显示用户名
const displayName = computed(() => username.value || '玩家')

// 金币
const displayCoins = computed(() => economy.value?.coins ?? 0)

// 钻石
const displayCrystals = computed(() => economy.value?.crystals ?? 0)

// 世界壁纸
const worldWallpaperUrl = ref(null)
const worldWallpaperIsVideo = ref(false)
const hasCustomWorldWallpaper = ref(false)
let worldWallpaperVideoRef = null

const worldHubBackground = computed(() => {
  if (worldWallpaperUrl.value && !worldWallpaperIsVideo.value) {
    return {
      backgroundImage: `url(${worldWallpaperUrl.value})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }
  }
  return {}
})

async function loadWorldWallpaper() {
  console.log('[WorldHub] loadWorldWallpaper 开始')
  const cached = getWorldWallpaperCache()
  console.log('[WorldHub] 内存缓存:', cached ? `存在 isVideo=${cached.isVideo} len=${cached.dataUrl?.length}` : 'null')
  if (cached && cached.dataUrl) {
    worldWallpaperUrl.value = cached.dataUrl
    worldWallpaperIsVideo.value = !!cached.isVideo
    hasCustomWorldWallpaper.value = true
    console.log('[WorldHub] 从内存缓存加载')
    return
  }
  const wp = await kvStorage.get('worldhub_wallpaper')
  console.log('[WorldHub] kvStorage:', wp ? `存在 isVideo=${wp.isVideo} len=${wp.dataUrl?.length}` : 'null')
  if (wp && wp.dataUrl) {
    worldWallpaperUrl.value = wp.dataUrl
    worldWallpaperIsVideo.value = !!wp.isVideo
    hasCustomWorldWallpaper.value = true
    setWorldWallpaperCache({ dataUrl: wp.dataUrl, isVideo: !!wp.isVideo })
  } else {
    worldWallpaperUrl.value = null
    worldWallpaperIsVideo.value = false
    hasCustomWorldWallpaper.value = false
    setWorldWallpaperCache(null)
  }
}

// 视频壁纸加载后自动播放
async function ensureWorldVideoPlays() {
  await nextTick()
  const el = worldWallpaperVideoRef?.value
  if (el && worldWallpaperIsVideo.value && worldWallpaperUrl.value) {
    try { await el.play() } catch { /* 忽略自动播放限制 */ }
  }
}

watch(() => worldWallpaperUrl.value, () => {
  ensureWorldVideoPlays()
})

async function restoreWorldWallpaperDefault() {
  await kvStorage.set('worldhub_wallpaper', null)
  worldWallpaperUrl.value = null
  worldWallpaperIsVideo.value = false
  hasCustomWorldWallpaper.value = false
}

onMounted(async () => {
  await loadWorldWallpaper()
  await loadActiveFrameUrl()
})

// keep-alive 激活时恢复视频播放
onActivated(() => {
  if (!worldWallpaperIsVideo.value) return

  let attempts = 0
  const playWorldVideo = () => {
    attempts++
    const el = document.querySelector('.world-hub-video-bg')
    if (el) {
      el.currentTime = 0
      el.play().catch(() => {})
    } else if (attempts < 30) {
      setTimeout(playWorldVideo, 100)
    }
  }

  setTimeout(playWorldVideo, 100)
})
</script>

<template>
  <main class="world-hub-screen">
    <!-- 全屏背景 -->
    <div v-if="!worldWallpaperIsVideo" class="world-hub-bg" :style="worldHubBackground" aria-hidden="true"></div>
    <video
      v-else
      ref="worldWallpaperVideoRef"
      class="world-hub-video-bg"
      :src="worldWallpaperUrl"
      :key="worldWallpaperUrl"
      autoplay
      muted
      loop
      playsinline
      preload="auto"
      aria-hidden="true"
    ></video>
    <div class="world-hub-overlay" aria-hidden="true"></div>

    <!-- 顶部状态栏 -->
    <header class="world-hub-header">
      <div class="world-hub-avatar-wrap" @click="emit('open-avatar')">
        <div class="world-hub-avatar">
          <img v-if="displayAvatar" :src="displayAvatar" alt="头像" class="world-hub-avatar-img" />
          <span v-else class="world-hub-avatar-placeholder">👤</span>
          <img
            v-if="displayFrameUrl"
            :src="displayFrameUrl"
            alt=""
            class="world-hub-avatar-frame-img"
          />
        </div>
      </div>

      <div class="world-hub-top-bar">
        <span class="world-hub-username">{{ displayName }}</span>
        <span class="top-bar-sep"></span>
        <div class="world-hub-economy">
          <span class="economy-item">
            <span class="economy-icon">💰</span>
            <span class="economy-value">{{ displayCoins }}</span>
          </span>
          <span class="economy-item">
            <span class="economy-icon">💎</span>
            <span class="economy-value">{{ displayCrystals }}</span>
          </span>
        </div>

        <button v-if="hasCustomWorldWallpaper" type="button" class="world-hub-wp-reset-btn" @click="restoreWorldWallpaperDefault" aria-label="恢复默认壁纸">
          <span class="settings-icon">🖼️</span>
        </button>
        <button type="button" class="world-hub-settings-btn" @click="emit('open-settings')" aria-label="设置">
          <span class="settings-icon">⚙️</span>
        </button>
      </div>
    </header>

    <!-- 按钮区域 -->
    <section class="world-hub-buttons">
      <!-- 左侧按钮 -->
      <div class="hub-button-column hub-column-left">
        <button type="button" class="hub-scatter-btn" @click="emit('open-phone')">
          <img src="/data/icon/worldhub_phone_icon.png" alt="手机" class="hub-png-icon" />
          <span class="hub-btn-label">手机</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-dormitory')">
          <span class="hub-btn-icon">🛏️</span>
          <span class="hub-btn-label">寝室</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-trpg')">
          <img src="/data/icon/worldhub_trpg_icon.png" alt="TRPG" class="hub-png-icon" />
          <span class="hub-btn-label">TRPG</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="openParticleMenu">
          <span class="hub-btn-icon">✨</span>
          <span class="hub-btn-label">粒子</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-adventure')">
          <span class="hub-btn-icon">🗡️</span>
          <span class="hub-btn-label">冒险</span>
        </button>
      </div>

      <!-- 右侧按钮 -->
      <div class="hub-button-column hub-column-right">
        <button type="button" class="hub-scatter-btn" @click="emit('open-game-center')">
          <img src="/data/icon/worldhub_games_icon.png" alt="游戏厅" class="hub-png-icon" />
          <span class="hub-btn-label">游戏厅</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-shop')">
          <img src="/data/icon/worldhub_shop_icon.png" alt="商店" class="hub-png-icon" />
          <span class="hub-btn-label">商店</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-task')">
          <img src="/data/icon/worldhub_task_icon.png" alt="任务" class="hub-png-icon" />
          <span class="hub-btn-label">任务</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-checkin')">
          <img src="/data/icon/worldhub_checkin_icon.png" alt="签到" class="hub-png-icon" />
          <span class="hub-btn-label">签到</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-mailbox')">
          <img src="/data/icon/worldhub_email_box_icon.png" alt="信箱" class="hub-png-icon" />
          <span class="hub-btn-label">信箱</span>
        </button>
      </div>
    </section>

    <!-- 底部主按钮 -->
    <footer class="world-hub-footer">
      <button type="button" class="hub-primary-btn" @click="emit('open-main-story')">
        <span class="hub-primary-icon">📖</span>
        <span class="hub-primary-label">主线</span>
      </button>

      <div class="hub-secondary-bar">
        <button type="button" class="hub-secondary-btn" @click="emit('open-worldbook')">
          <span class="hub-sec-icon">🌐</span>
          <span class="hub-sec-label">世界书</span>
        </button>
        <button type="button" class="hub-secondary-btn" @click="emit('open-world-map')">
          <span class="hub-sec-icon">🗺️</span>
          <span class="hub-sec-label">地图</span>
        </button>
        <button type="button" class="hub-secondary-btn" @click="emit('open-dreams')">
          <span class="hub-sec-icon">🌙</span>
          <span class="hub-sec-label">梦境</span>
        </button>
        <button type="button" class="hub-secondary-btn" @click="emit('open-timeline')">
          <span class="hub-sec-icon">📅</span>
          <span class="hub-sec-label">时间线</span>
        </button>
        <button type="button" class="hub-secondary-btn" @click="emit('open-world-memory')">
          <span class="hub-sec-icon">🧠</span>
          <span class="hub-sec-label">记忆</span>
        </button>
        <button type="button" class="hub-secondary-btn" @click="emit('open-evolution-log')">
          <span class="hub-sec-icon">📜</span>
          <span class="hub-sec-label">演化</span>
        </button>
        <button type="button" class="hub-secondary-btn" @click="emit('open-card-collection')">
          <span class="hub-sec-icon">🃏</span>
          <span class="hub-sec-label">卡牌</span>
        </button>
        <button type="button" class="hub-secondary-btn" @click="emit('open-narrator')">
          <span class="hub-sec-icon">🎙️</span>
          <span class="hub-sec-label">叙事者</span>
        </button>
        <button type="button" class="hub-secondary-btn" @click="emit('open-plugin')">
          <span class="hub-sec-icon">🔌</span>
          <span class="hub-sec-label">插件</span>
        </button>
      </div>
    </footer>

    <!-- 粒子菜单 -->
    <div v-if="showParticleMenu" class="particle-overlay" @click.self="showParticleMenu = false">
      <div class="particle-dialog">
        <div class="dialog-header">
          <h3 class="dialog-title">✨ 粒子效果</h3>
          <button type="button" class="dialog-close" @click="showParticleMenu = false">×</button>
        </div>
        <p class="dialog-desc">选择一个粒子效果</p>
        <div class="particle-list">
          <button type="button" class="particle-item" @click="openParticle('mobius')">
            <span class="particle-icon">🔃</span>
            <div class="particle-info">
              <span class="particle-name">莫比乌斯环</span>
              <span class="particle-desc">无限循环的粒子流</span>
            </div>
          </button>
          <button type="button" class="particle-item" @click="openParticle('rose')">
            <span class="particle-icon">🌹</span>
            <div class="particle-info">
              <span class="particle-name">粒子玫瑰</span>
              <span class="particle-desc">由粒子组成的玫瑰</span>
            </div>
          </button>
          <button type="button" class="particle-item" @click="openParticle('book')">
            <span class="particle-icon">📜</span>
            <div class="particle-info">
              <span class="particle-name">魔法书</span>
              <span class="particle-desc">神秘的魔法粒子</span>
            </div>
          </button>
          <button type="button" class="particle-item" @click="openParticle('hourglass')">
            <span class="particle-icon">⏳</span>
            <div class="particle-info">
              <span class="particle-name">沙漏</span>
              <span class="particle-desc">流逝的沙粒时光</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </main>
</template>
