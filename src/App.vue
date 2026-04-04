<script setup>
import { onBeforeUnmount, onMounted, ref, computed, watch } from 'vue'
import GameScreen from './screens/GameScreen.vue'
import SettingsScreen from './screens/SettingsScreen.vue'
import StartScreen from './screens/StartScreen.vue'
import WorldBookEditorScreen from './screens/WorldBookEditorScreen.vue'
import WorldBookScreen from './screens/WorldBookScreen.vue'
import SaveLoadScreen from './screens/SaveLoadScreen.vue'
import PluginManagerScreen from './screens/PluginManagerScreen.vue'
import NarratorManagerScreen from './screens/NarratorManagerScreen.vue'
import { getPlatform, isMobileDevice, isNative, isAndroid } from './utils/platform'
import { StatusBar, Style } from '@capacitor/status-bar'

// PC 端设计基准分辨率（16:9 横屏比例）
const DESIGN_WIDTH = 1920
const DESIGN_HEIGHT = 1080

// Android 端设计基准分辨率（9:16 竖屏比例）
const ANDROID_DESIGN_WIDTH = 1080
const ANDROID_DESIGN_HEIGHT = 1920

const currentScreen = ref('start')
const activeWorldBookId = ref('default_world_book')
const activeNarratorId = ref(null)
const uiScale = ref(1)
const containerStyle = ref({})

// 平台检测
const platform = computed(() => getPlatform())
const isMobile = computed(() => isMobileDevice())
const isNativeApp = computed(() => isNative())
const isAndroidPlatform = computed(() => isAndroid())
const logAndroidLayoutSnapshot = async (source = 'unknown') => {
  if (!isAndroidPlatform.value) return

  const gameScreen = document.querySelector('.game-screen')
  const gameTopbar = document.querySelector('.game-topbar')
  const appShell = document.querySelector('.app-shell')
  const bodyStyle = getComputedStyle(document.body)
  const shellStyle = appShell ? getComputedStyle(appShell) : null
  const topbarStyle = gameTopbar ? getComputedStyle(gameTopbar) : null
  const viewport = window.visualViewport

  let statusInfo = null
  try {
    statusInfo = await StatusBar.getInfo()
  } catch {
    statusInfo = null
  }

  const payload = {
    source,
    screen: currentScreen.value,
    windowInner: { w: window.innerWidth, h: window.innerHeight },
    visualViewport: viewport
      ? {
          w: Math.round(viewport.width),
          h: Math.round(viewport.height),
          offsetTop: Math.round(viewport.offsetTop),
          offsetLeft: Math.round(viewport.offsetLeft),
          scale: viewport.scale,
        }
      : null,
    statusBar: statusInfo,
    bodyClass: document.body.className,
    bodyPaddingTop: bodyStyle.paddingTop,
    bodyPaddingBottom: bodyStyle.paddingBottom,
    appShellPaddingTop: shellStyle?.paddingTop || null,
    gameScreenRect: gameScreen ? gameScreen.getBoundingClientRect() : null,
    gameTopbarRect: gameTopbar ? gameTopbar.getBoundingClientRect() : null,
    gameTopbarPaddingTop: topbarStyle?.paddingTop || null,
    gameTopbarMarginTop: topbarStyle?.marginTop || null,
  }

  console.log('[LayoutDebug][Web]', payload)
  return payload
}

const scheduleAndroidLayoutDebug = (source = 'unknown') => {
  if (!isAndroidPlatform.value) return

  requestAnimationFrame(() => {
    void logAndroidLayoutSnapshot(`${source}:raf`)
    window.setTimeout(() => {
      void logAndroidLayoutSnapshot(`${source}:t300`)
    }, 300)
  })
}

const applyAndroidStatusBarStyle = async () => {
  if (!isAndroidPlatform.value) return

  try {
    await StatusBar.setOverlaysWebView({ overlay: false })
    await StatusBar.setStyle({ style: Style.Light })
    await StatusBar.setBackgroundColor({ color: '#0d0d1a' })
    await StatusBar.show()
  } catch {
    // 非原生环境或插件不可用时忽略
  }
}

const handleAndroidVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    void applyAndroidStatusBarStyle()
    scheduleAndroidLayoutDebug('visibilitychange-visible')
  }
}

const handleAndroidFocus = () => {
  void applyAndroidStatusBarStyle()
  scheduleAndroidLayoutDebug('window-focus')
}

const handleAndroidResize = () => {
  scheduleAndroidLayoutDebug('window-resize')
}

// 存档数据（用于加载存档后传递给游戏界面）
const loadedSaveData = ref(null)

const openSettings = () => {
  currentScreen.value = 'settings'
}

const openNewGame = (payload = 'default_world_book') => {
  const worldBookId = typeof payload === 'object' && payload
    ? payload.worldBookId
    : payload
  const narratorId = typeof payload === 'object' && payload
    ? payload.narratorId
    : null

  loadedSaveData.value = null // 新游戏清空存档数据
  activeWorldBookId.value = worldBookId || 'default_world_book' // 设置新游戏使用的世界书
  activeNarratorId.value = narratorId || null // 新游戏可选叙事者覆盖
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

const openNarratorManager = () => {
  currentScreen.value = 'narrator-manager'
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
  activeNarratorId.value = saveData?.game?.narratorId || null
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
      narratorId: null,
      currentLineIndex: 0,
      dialogueScript: backupData.messages || [],
      sceneCharacters: [],
    },
  }
  currentScreen.value = 'game'
}

/**
 * 计算 UI 缩放比例
 * Android 竖屏模式下，使用 9:16 设计比例
 * PC/Web 端使用 16:9 横屏比例
 */
const updateUiScale = () => {
  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  
  // Android 原生平台特殊处理（竖屏）
  if (isAndroidPlatform.value) {
    // 竖屏模式：基于宽度缩放，高度自适应
    // 设计基准：1080x1920 (9:16)
    const widthBasedScale = windowWidth / ANDROID_DESIGN_WIDTH
    
    // Android 上限制缩放范围
    // 典型手机：360-420px 宽度，缩放约 0.33-0.39
    // 高端手机：480px+ 宽度，缩放约 0.44+
    uiScale.value = Math.max(0.3, Math.min(0.6, Number(widthBasedScale.toFixed(3))))
    
    // 竖屏模式：宽度撑满，高度自适应
    containerStyle.value = {
      width: '100vw',
      minHeight: '100vh',
    }
  } else {
    // PC/Web 端：横屏逻辑
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
    body.classList.add('android-portrait')
    // 阻止默认触摸行为（如双击缩放）
    document.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }, { passive: false })

    void applyAndroidStatusBarStyle()
    document.addEventListener('visibilitychange', handleAndroidVisibilityChange)
    window.addEventListener('focus', handleAndroidFocus)
    window.addEventListener('resize', handleAndroidResize)
    window.addEventListener('orientationchange', handleAndroidResize)

    // 便于在远程调试控制台手动触发
    window.__avgLayoutDebug = async () => {
      const immediate = await logAndroidLayoutSnapshot('manual-trigger:direct')
      scheduleAndroidLayoutDebug('manual-trigger')
      return immediate
    }

    scheduleAndroidLayoutDebug('mounted-android')
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateUiScale)

  if (isAndroidPlatform.value) {
    document.removeEventListener('visibilitychange', handleAndroidVisibilityChange)
    window.removeEventListener('focus', handleAndroidFocus)
    window.removeEventListener('resize', handleAndroidResize)
    window.removeEventListener('orientationchange', handleAndroidResize)
    delete window.__avgLayoutDebug
  }
})

watch(currentScreen, (screen) => {
  if (screen === 'game') {
    scheduleAndroidLayoutDebug('screen-to-game')
  }
})
</script>

<template>
  <div class="app-stage" :class="[`platform-${platform}`, { 'android-portrait': isAndroidPlatform }]">
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
        @open-narrator-manager="openNarratorManager"
      />
      <GameScreen
        v-else-if="currentScreen === 'game'"
        :save-data="loadedSaveData"
        :world-book-id="activeWorldBookId"
        :session-narrator-id="activeNarratorId"
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
      <NarratorManagerScreen
        v-else-if="currentScreen === 'narrator-manager'"
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
    min-height: 100vh;
    height: auto;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  
  .app-shell {
    width: 100%;
    min-height: 100vh;
    padding: 8px;
    transform: none;
  }
  
  .app-shell.game-fullscreen {
    padding: 0;
    height: 100vh;
    overflow: hidden;
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

/* ========== Android 竖屏分辨率适配 ========== */
/*
 * 设计基准：1080x1920 (9:16 竖屏)
 * Android 竖屏：宽度撑满，高度自适应
 */
.platform-android.android-portrait .app-stage {
  width: 100vw;
  min-height: 100vh;
  height: auto;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  background: var(--background);
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.platform-android.android-portrait .app-shell {
  /* 竖屏模式：宽度 100%，高度自适应 */
  width: 100%;
  min-height: 100vh;
  padding: 0;
  transform: none;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.platform-android.android-portrait .app-shell.game-fullscreen {
  /* 游戏界面全屏 */
  width: 100vw;
  height: 100vh;
  min-height: 100vh;
  transform: none;
  position: fixed;
  inset: 0;
}

/* Android 竖屏下的游戏界面内部缩放 */
.platform-android.android-portrait .app-shell.game-fullscreen :deep(.game-container) {
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
