<script setup>
import './WorldHubScreen.css'
import { computed, onMounted, ref } from 'vue'
import { useGlobalUser } from '../composables/useGlobalUser.js'
import { useAvatar } from '../../plugins/feature-dormitory/src/composables/useAvatar.js'
import { useAvatarFrame } from '../../plugins/feature-dormitory/src/composables/useAvatarFrame.js'
import { loadWorldBooks, getActiveWorldBookId } from '../worldbook/worldBookStore'
import { getEnabledNarratorProfiles, loadNarratorProfiles } from '../narrator/narratorStore'
import { kvStorage } from '../storage/index.js'

defineOptions({ name: 'WorldHubScreen' })

const emit = defineEmits([
  'back',
  'open-new-game',
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
  'open-card-collection',
  'open-adventure',
  'open-narrator',
  'open-plugin',
  'open-settings',
  'open-face-to-face',
  'open-load-save',
  'open-phone',
  'open-avatar',
  'open-test',
  'open-rose',
  'open-book',
])

const { username, avatar: globalAvatar, avatarFrame: globalAvatarFrame, economy } = useGlobalUser()
const { activeAvatarDataUrl } = useAvatar()
const { activeFrame } = useAvatarFrame()

// 使用全局头像（优先）或 fallback 到 avatar composable
const displayAvatar = computed(() => globalAvatar.value || activeAvatarDataUrl.value)
const displayAvatarFrame = computed(() => globalAvatarFrame.value || activeFrame.value?.dataUrl || null)

// 显示用户名
const displayName = computed(() => username.value || '玩家')

// 金币
const displayCoins = computed(() => economy.value?.coins ?? 0)

// 钻石
const displayCrystals = computed(() => economy.value?.crystals ?? 0)

// 世界壁纸
const worldWallpaperUrl = ref(null)
const hasCustomWorldWallpaper = ref(false)

const worldHubBackground = computed(() => {
  if (worldWallpaperUrl.value) {
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
  const wp = await kvStorage.get('worldhub_wallpaper')
  if (wp && wp.dataUrl) {
    worldWallpaperUrl.value = wp.dataUrl
    hasCustomWorldWallpaper.value = true
  } else {
    worldWallpaperUrl.value = null
    hasCustomWorldWallpaper.value = false
  }
}

async function restoreWorldWallpaperDefault() {
  await kvStorage.set('worldhub_wallpaper', null)
  worldWallpaperUrl.value = null
  hasCustomWorldWallpaper.value = false
}

// 新游戏弹窗
const showNewGameDialog = ref(false)
const worldBooks = ref([])
const selectedWorldBookId = ref('default_world_book')
const narratorProfiles = ref([])
const selectedNarratorId = ref('')

const loadWorldBookList = async () => {
  worldBooks.value = await loadWorldBooks()
  selectedWorldBookId.value = await getActiveWorldBookId()
}

const loadNarratorList = async () => {
  const profiles = await loadNarratorProfiles()
  narratorProfiles.value = getEnabledNarratorProfiles(profiles)
}

const openNewGameDialog = async () => {
  await loadWorldBookList()
  await loadNarratorList()
  selectedNarratorId.value = ''
  showNewGameDialog.value = true
}

const closeNewGameDialog = () => {
  showNewGameDialog.value = false
}

const confirmNewGame = () => {
  showNewGameDialog.value = false
  emit('open-new-game', {
    worldBookId: selectedWorldBookId.value,
    narratorId: selectedNarratorId.value || null,
  })
}

onMounted(async () => {
  await loadWorldBookList()
  await loadNarratorList()
  await loadWorldWallpaper()
})
</script>

<template>
  <main class="world-hub-screen">
    <!-- 全屏背景 -->
    <div class="world-hub-bg" :style="worldHubBackground" aria-hidden="true"></div>
    <div class="world-hub-overlay" aria-hidden="true"></div>

    <!-- 顶部状态栏 -->
    <header class="world-hub-header">
      <div class="world-hub-user">
        <div class="world-hub-avatar-wrap" @click="emit('open-avatar')">
          <div class="world-hub-avatar">
            <img v-if="displayAvatar" :src="displayAvatar" alt="头像" class="world-hub-avatar-img" />
            <span v-else class="world-hub-avatar-placeholder">👤</span>
            <img
              v-if="displayAvatarFrame"
              :src="displayAvatarFrame"
              alt=""
              class="world-hub-avatar-frame-img"
            />
          </div>
        </div>
        <span class="world-hub-username">{{ displayName }}</span>
      </div>

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
    </header>

    <!-- 按钮区域 -->
    <section class="world-hub-buttons">
      <!-- 左侧按钮 -->
      <div class="hub-button-column hub-column-left">
        <button type="button" class="hub-scatter-btn" @click="emit('open-phone')">
          <span class="hub-btn-icon">📱</span>
          <span class="hub-btn-label">手机</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-dormitory')">
          <span class="hub-btn-icon">🛏️</span>
          <span class="hub-btn-label">寝室</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-trpg')">
          <span class="hub-btn-icon">🎲</span>
          <span class="hub-btn-label">TRPG</span>
        </button>
      </div>

      <!-- 右侧按钮 -->
      <div class="hub-button-column hub-column-right">
        <button type="button" class="hub-scatter-btn" @click="emit('open-game-center')">
          <span class="hub-btn-icon">🎮</span>
          <span class="hub-btn-label">游戏厅</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-shop')">
          <span class="hub-btn-icon">🛒</span>
          <span class="hub-btn-label">商店</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-task')">
          <span class="hub-btn-icon">📋</span>
          <span class="hub-btn-label">任务</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-checkin')">
          <span class="hub-btn-icon">📅</span>
          <span class="hub-btn-label">签到</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-mailbox')">
          <span class="hub-btn-icon">📮</span>
          <span class="hub-btn-label">信箱</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-test')">
          <span class="hub-btn-icon">🌌</span>
          <span class="hub-btn-label">星空</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-rose')">
          <span class="hub-btn-icon">🌹</span>
          <span class="hub-btn-label">玫瑰</span>
        </button>
        <button type="button" class="hub-scatter-btn" @click="emit('open-book')">
          <span class="hub-btn-icon">📜</span>
          <span class="hub-btn-label">魔法书</span>
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
        <button type="button" class="hub-secondary-btn hub-secondary-btn--accent" @click="openNewGameDialog">
          <span class="hub-sec-icon">✨</span>
          <span class="hub-sec-label">新游戏</span>
        </button>
        <button type="button" class="hub-secondary-btn" @click="emit('open-load-save')">
          <span class="hub-sec-icon">💾</span>
          <span class="hub-sec-label">读档</span>
        </button>
        <button type="button" class="hub-secondary-btn" @click="emit('open-worldbook')">
          <span class="hub-sec-icon">🌐</span>
          <span class="hub-sec-label">世界书</span>
        </button>
        <button type="button" class="hub-secondary-btn" @click="emit('open-card-collection')">
          <span class="hub-sec-icon">🃏</span>
          <span class="hub-sec-label">卡牌</span>
        </button>
        <button type="button" class="hub-secondary-btn" @click="emit('open-adventure')">
          <span class="hub-sec-icon">🗡️</span>
          <span class="hub-sec-label">冒险</span>
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

    <!-- 新游戏弹窗 -->
    <div v-if="showNewGameDialog" class="new-game-overlay" @click.self="closeNewGameDialog">
      <div class="new-game-dialog">
        <div class="dialog-header">
          <h3 class="dialog-title">选择世界书</h3>
          <button type="button" class="dialog-close" @click="closeNewGameDialog">×</button>
        </div>
        <p class="dialog-desc">选择一本世界书作为新游戏的背景设定</p>

        <div class="worldbook-list">
          <button
            v-for="book in worldBooks"
            :key="book.id"
            type="button"
            class="worldbook-item"
            :class="{ selected: selectedWorldBookId === book.id }"
            @click="selectedWorldBookId = book.id"
          >
            <span class="book-indicator">{{ selectedWorldBookId === book.id ? '✓' : '' }}</span>
            <div class="book-info">
              <span class="book-title">{{ book.title }}</span>
              <span v-if="book.isDefault" class="book-badge">默认</span>
              <span class="book-summary">{{ book.summary || '暂无简介' }}</span>
            </div>
          </button>
        </div>

        <label class="dialog-select-field">
          <span class="dialog-select-label">本局叙事者（可选）</span>
          <select v-model="selectedNarratorId" class="dialog-select-control">
            <option value="">使用世界书默认</option>
            <option v-for="profile in narratorProfiles" :key="profile.id" :value="profile.id">
              {{ profile.name }}
            </option>
          </select>
        </label>

        <div class="dialog-actions">
          <button type="button" class="dialog-btn cancel" @click="closeNewGameDialog">取消</button>
          <button type="button" class="dialog-btn confirm" @click="confirmNewGame">开始新游戏</button>
        </div>
      </div>
    </div>
  </main>
</template>
