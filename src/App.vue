<script setup>
import { onBeforeUnmount, onMounted, ref, computed } from 'vue'
import GameScreen from './screens/GameScreen.vue'
import SettingsScreen from './screens/SettingsScreen.vue'
import StartScreen from './screens/StartScreen.vue'
import WorldBookEditorScreen from './screens/WorldBookEditorScreen.vue'
import WorldBookScreen from './screens/WorldBookScreen.vue'
import SaveLoadScreen from './screens/SaveLoadScreen.vue'
import PluginManagerScreen from './screens/PluginManagerScreen.vue'
import { getPlatform, isMobileDevice, isNative, isAndroid } from './utils/platform'

// 设计基准分辨率（16:9 横屏比例）
const DESIGN_WIDTH = 1920
const DESIGN_HEIGHT = 1080
const DESIGN_ASPECT_RATIO = DESIGN_WIDTH / DESIGN_HEIGHT // 16:9

const currentScreen = ref('start')
const activeWorldBookId = ref('default_world_book')
const uiScale = ref(1)
const containerStyle = ref({})

// 平台检测
const platform = computed(() => getPlatform())
const isMobile = computed(() => isMobileDevice())
const isNativeApp = computed(() => isNative())
const isAndroidPlatform = computed(() => isAndroid())

// 存档数据（用于加载存档后传递给游戏界面）
const loadedSaveData = ref(null)

const openSettings = () => {
  currentScreen.value = 'settings'
}

const openNewGame = (worldBookId = 'default_world_book') => {
  loadedSaveData.value = null // 新游戏清空存档数据
  activeWorldBookId.value = worldBookId // 设置新游戏使用的世界书
  currentScreen.value = 'game'
}

const openWorldBook = () => {
  currentScreen.value = 'worldbook-shelf'
}

const openWorldBookEditor = (bookId) => {
  activeWorldBookId.value = bookId || 'default_world_book'
  currentScreen.value = 'worldbook-editor'
}

const openSaveLoad = () => {
  currentScreen.value = 'save-load'
}

const openPluginManager = () => {
  currentScreen.value = 'plugin-manager'
}

const backToWorldBookShelf = () => {
  currentScreen.value = 'worldbook-shelf'
}

const backToStart = () => {
  currentScreen.value = 'start'
}

// 加载存档后进入游戏
const handleLoadSave = (saveData) => {
  loadedSaveData.value = saveData
  currentScreen.value = 'game'
}

// 加载备份后进入游戏
const handleLoadBackup = (backupData) => {
  // 将备份数据转换为存档格式
  loadedSaveData.value = {
    version: backupData.version,
    timestamp: backupData.timestamp,
    metadata: {
      chapter: '历史备份',
      scene: backupData.name,
      playTime: 0,
      preview: '',
    },
    game: {
      worldBookId: 'default_world_book',
      currentLineIndex: 0,
      dialogueScript: backupData.messages || [],
      sceneCharacters: [],
    },
  }
  currentScreen.value = 'game'
}

/**
 * 计算 UI 缩放比例
 * Android 横屏模式下，保持 16:9 设计比例，按实际屏幕尺寸缩放
 */
const updateUiScale = () => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const currentAspectRatio = windowWidth / windowHeight
  
  // Android 原生平台特殊处理
  if (isAndroidPlatform.value) {
    // 横屏模式下，保持设计比例缩放
    // 计算基于宽度的缩放（确保内容宽度适配屏幕）
    const widthBasedScale = windowWidth / DESIGN_WIDTH
    // 计算基于高度的缩放（确保内容高度适配屏幕）
    const heightBasedScale = windowHeight / DESIGN_HEIGHT
    
    // 使用较小的缩放值，确保内容完全可见
    let nextScale = Math.min(widthBasedScale, heightBasedScale)
    
    // Android 上限制缩放范围，避免过小或过大
    // 横屏平板可能缩放接近 1，手机横屏可能缩放 0.5-0.8
    uiScale.value = Math.max(0.4, Math.min(1.2, Number(nextScale.toFixed(3))))
    
    // 计算容器尺寸，保持设计比例
    const scaledWidth = DESIGN_WIDTH * uiScale.value
    const scaledHeight = DESIGN_HEIGHT * uiScale.value
    
    containerStyle.value = {
      width: `${scaledWidth}px`,
      height: `${scaledHeight}px`,
      maxWidth: '100vw',
      maxHeight: '100vh',
    }
  } else {
    // PC/Web 端：原有逻辑
    const widthScale = windowWidth / DESIGN_WIDTH
    const heightScale = windowHeight / DESIGN_HEIGHT
    const nextScale = Math.min(widthScale, heightScale)
    
    // Keep the UI in a practical range to avoid over-shrinking or over-blowing.
    uiScale.value = Math.max(0.67, Math.min(1.5, Number(nextScale.toFixed(3))))
    
    containerStyle.value = {}
  }
}

onMounted(() => {
  updateUiScale()
  window.addEventListener('resize', updateUiScale)
  
  // 添加平台类名到 body
  const body = document.body
  body.classList.add(`platform-${platform.value}`)
  if (isMobile.value) {
    body.classList.add('mobile-device')
  }
  if (isNativeApp.value) {
    body.classList.add('native-app')
  }
  
  // Android 平台额外处理
  if (isAndroidPlatform.value) {
    body.classList.add('android-landscape')
    // 阻止默认触摸行为（如双击缩放）
    document.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }, { passive: false })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateUiScale)
})
</script>

<template>
  <div class="app-stage" :class="[`platform-${platform}`, { 'android-landscape': isAndroidPlatform }]">
    <div
      class="app-shell"
      :class="{ 'game-fullscreen': currentScreen === 'game' }"
      :style="{ '--ui-scale': uiScale, ...containerStyle }"
    >
      <StartScreen
        v-if="currentScreen === 'start'"
        @open-settings="openSettings"
        @open-new-game="openNewGame"
        @open-worldbook="openWorldBook"
        @open-save-load="openSaveLoad"
        @open-plugin-manager="openPluginManager"
      />
      <GameScreen
        v-else-if="currentScreen === 'game'"
        :save-data="loadedSaveData"
        :world-book-id="activeWorldBookId"
        @back="backToStart"
      />
      <SettingsScreen v-else-if="currentScreen === 'settings'" @back="backToStart" />
      <SaveLoadScreen
        v-else-if="currentScreen === 'save-load'"
        @back="backToStart"
        @load-save="handleLoadSave"
        @load-backup="handleLoadBackup"
      />
      <WorldBookScreen
        v-else-if="currentScreen === 'worldbook-shelf'"
        @back="backToStart"
        @open-book="openWorldBookEditor"
      />
      <PluginManagerScreen
        v-else-if="currentScreen === 'plugin-manager'"
        @back="backToStart"
      />
      <WorldBookEditorScreen
        v-else
        :book-id="activeWorldBookId"
        @back="backToWorldBookShelf"
      />
    </div>
  </div>
</template>

<style scoped>
.app-stage {
  width: 100vw;
  min-height: 100vh;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  border-radius: 0;
}

.app-shell {
  --ui-scale: 1;
  width: calc(100% / var(--ui-scale));
  min-height: calc(100vh / var(--ui-scale));
  padding: calc(clamp(20px, 3vw, 48px) / var(--ui-scale));
  display: flex;
  align-items: center;
  justify-content: center;
  transform: scale(var(--ui-scale));
  transform-origin: top center;
  border-radius: 0;
}

/* 游戏界面全屏模式 - 不受缩放影响 */
.app-shell.game-fullscreen {
  width: 100vw;
  height: 100vh;
  min-height: 100vh;
  padding: 0;
  margin: 0;
  transform: none;
  position: fixed;
  inset: 0;
  border: none;
  border-radius: 0;
  overflow: hidden;
}

@media (max-width: 980px) {
  .app-shell {
    padding: calc(14px / var(--ui-scale));
  }
  
  .app-shell.game-fullscreen {
    padding: 0;
  }
}

/* 移动端适配 */
@media (max-width: 768px) {
  .app-stage {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
  
  .app-shell {
    width: 100%;
    min-height: 100vh;
    padding: 8px;
    transform: none;
  }
  
  .app-shell.game-fullscreen {
    padding: 0;
  }
}

/* 原生平台适配 */
.platform-android .app-shell,
.platform-ios .app-shell {
  padding-top: env(safe-area-inset-top, 8px);
  padding-bottom: env(safe-area-inset-bottom, 8px);
  padding-left: env(safe-area-inset-left, 8px);
  padding-right: env(safe-area-inset-right, 8px);
}

.platform-android .app-shell.game-fullscreen,
.platform-ios .app-shell.game-fullscreen {
  padding: 0;
}

/* ========== Android 横屏分辨率适配 ========== */
/*
 * 设计基准：1920x1080 (16:9)
 * Android 横屏保持相同比例，按实际屏幕缩放
 */
.platform-android.android-landscape .app-stage {
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--background);
}

.platform-android.android-landscape .app-shell {
  /* Android 上使用固定尺寸容器 + transform 缩放 */
  width: 1920px;
  height: 1080px;
  min-height: 1080px;
  padding: 0;
  transform: scale(var(--ui-scale));
  transform-origin: center center;
  flex-shrink: 0;
  /* 保持设计比例的容器 */
  aspect-ratio: 16 / 9;
}

.platform-android.android-landscape .app-shell.game-fullscreen {
  /* 游戏界面全屏，但保持比例 */
  width: 100vw;
  height: 100vh;
  min-height: 100vh;
  transform: none;
  position: fixed;
  inset: 0;
}

/* Android 横屏下的游戏界面内部缩放 */
.platform-android.android-landscape .app-shell.game-fullscreen :deep(.game-container) {
  /* 游戏内容按设计比例缩放 */
  --design-scale: var(--ui-scale, 1);
}

/* Android 平台字体和交互优化 */
.platform-android .app-shell {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

/* 禁用 Android 上的双击缩放和长按菜单 */
.platform-android .app-shell * {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

/* 允许输入框选择文本 */
.platform-android .app-shell input,
.platform-android .app-shell textarea {
  -webkit-user-select: text;
  user-select: text;
}
</style>
