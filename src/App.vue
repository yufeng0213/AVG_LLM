<script setup>
import { onBeforeUnmount, onMounted, ref, computed, watch, nextTick } from 'vue'
import GameScreen from './screens/GameScreen.vue'
import StartScreen from './screens/StartScreen.vue'
import WorldHubScreen from './screens/WorldHubScreen.vue'
import { getPlatform, isMobileDevice, isNative, isAndroid, isElectron } from './utils/platform'
import { buildStartMenuRegistry, resolveStartMenuAction } from './features/startMenuRegistry'
import { getLocalFeaturePluginManifests } from './features/localFeaturePluginManifests'
import { getLocalFeaturePluginEntries } from './features/localFeaturePluginEntries'
import { buildPluginScreenRegistry, resolvePluginScreenByRoute } from './features/pluginScreenRegistry'
import {
  getFeaturePluginRuntimeState,
  filterEnabledFeaturePluginManifests,
  subscribeFeaturePluginRuntimeState,
} from './features/featurePluginRuntimeState'
import { StatusBar, Style } from '@capacitor/status-bar'
import GlobalMailbox from '../plugins/feature-mail/src/components/GlobalMailbox.vue'
import CheckInScreen from '../plugins/feature-checkin/src/CheckInScreen.vue'
import CheckIn7Screen from '../plugins/feature-checkin/src/CheckIn7Screen.vue'
import AvatarFrameScreen from '../plugins/feature-dormitory/src/components/AvatarFrameScreen.vue'
import MusicPlayerScreen from '../plugins/feature-music-player/src/MusicPlayerScreen.vue'
import Mascot from '../plugins/feature-mascot/src/Mascot.vue'
import { useMascotStorage } from '../plugins/feature-mascot/src/composables/useMascotStorage.js'
import {
  createOverlay,
  loadOverlayUrl,
  setOverlayMascotData,
} from '../plugins/feature-mascot/src/composables/useMascotOverlayAndroid.js'

// PC 端设计基准分辨率（16:9 横屏比例）
const DESIGN_WIDTH = 1920
const DESIGN_HEIGHT = 1080

// Android 端设计基准分辨率（9:16 竖屏比例）
const ANDROID_DESIGN_WIDTH = 1080
const ANDROID_DESIGN_HEIGHT = 1920

const currentScreen = ref('world-hub')
const activeWorldBookId = ref('default_world_book')
const activeNarratorId = ref(null)
const uiScale = ref(1)
const containerStyle = ref({})

// 平台检测
const platform = computed(() => getPlatform())
const isMobile = computed(() => isMobileDevice())
const isNativeApp = computed(() => isNative())
const isAndroidPlatform = computed(() => isAndroid())
const isElectronPlatform = computed(() => isElectron())
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

/**
 * 获取 Android 状态栏高度并注入 CSS 变量 --safe-area-inset-top
 * 使 WebView 内容能正确避开刘海/相机区域
 * （主要靠 MainActivity.java 原生注入，此函数为备用）
 */
const injectAndroidSafeAreaInsets = async () => {
  if (!isAndroidPlatform.value) return

  try {
    const info = await StatusBar.getInfo()
    if (info?.height) {
      document.documentElement.style.setProperty('--safe-area-inset-top', `${info.height}px`)
      document.documentElement.style.setProperty('--safe-area-inset-bottom', '0px')
      document.documentElement.style.setProperty('--safe-area-inset-left', '0px')
      document.documentElement.style.setProperty('--safe-area-inset-right', '0px')
    }
  } catch {
    // 非原生环境或插件不可用时忽略
  }
}

const applyAndroidStatusBarStyle = async () => {
  if (!isAndroidPlatform.value) return

  try {
    await StatusBar.setOverlaysWebView({ overlay: false })
    await StatusBar.setStyle({ style: Style.Light })
    await StatusBar.setBackgroundColor({ color: '#0d0d1a' })
    await StatusBar.show()
    // 状态栏显示后注入高度
    await injectAndroidSafeAreaInsets()
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
const localFeaturePluginManifests = getLocalFeaturePluginManifests()
const localFeaturePluginEntries = getLocalFeaturePluginEntries()
const featurePluginRuntimeState = ref(getFeaturePluginRuntimeState())
const enabledFeaturePluginManifests = computed(() => {
  return filterEnabledFeaturePluginManifests(
    localFeaturePluginManifests,
    featurePluginRuntimeState.value,
  )
})
const startMenuRegistry = computed(() => buildStartMenuRegistry({
  pluginManifests: enabledFeaturePluginManifests.value,
}))
const startMenuItems = computed(() => {
  return startMenuRegistry.value.items
})
const startMenuActionMap = computed(() => {
  return startMenuRegistry.value.actionMap
})

const openScreenByKey = (screenKey) => {
  const next = String(screenKey || '').trim()
  if (!next) return
  // 桌宠不是路由页面，是悬浮层，不导航到
  if (next === 'mascot') return
  currentScreen.value = next
}

const handleStartMenuAction = (payload) => {
  const itemId = typeof payload === 'string'
    ? payload
    : payload?.itemId
  const action = payload?.action && typeof payload.action === 'object'
    ? payload.action
    : resolveStartMenuAction(startMenuActionMap.value, itemId)
  // 桌宠点击菜单时：没有GIF则弹出导入，有GIF则不做操作（已悬浮显示）
  if (itemId === 'feature-mascot') {
    const { openImporter } = useMascotStorage()
    if (!mascotHasGif.value) {
      openImporter()
    }
    return
  }
  if (action.type === 'screen') {
    openScreenByKey(action.screen)
    return
  }
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

const openWorldBookEditor = (bookId) => {
  activeWorldBookId.value = bookId || 'default_world_book'
  currentScreen.value = 'worldbook-editor'
}

const backToWorldBookShelf = () => {
  currentScreen.value = 'worldbook-shelf'
}

const backToStart = () => {
  currentScreen.value = 'start'
}

const backToWorldHub = () => {
  currentScreen.value = 'world-hub'
}

// WorldHubScreen 按钮处理
const isMailboxOpen = ref(false)
const isCheckInOpen = ref(false)
const isCheckIn7Open = ref(false)
const isAvatarSettingsOpen = ref(false)
const isMusicPlayerOpen = ref(true)

const isMascotEnabled = computed(() => {
  const manifest = featurePluginManifestById.value.get('feature-mascot')
  if (!manifest) return false
  const runtimeState = featurePluginRuntimeState.value
  const hasOverride = Object.prototype.hasOwnProperty.call(runtimeState, 'feature-mascot')
  if (hasOverride) return Boolean(runtimeState['feature-mascot'])
  return manifest.enabledByDefault !== false
})

const { mascotState: mascotStorageState, loadGifDataUrl } = useMascotStorage()
const mascotHasGif = computed(() => !!mascotStorageState.value?.gifData)

const featurePluginManifestById = computed(() => {
  const map = new Map()
  localFeaturePluginManifests.forEach((p) => map.set(p.id, p))
  return map
})

const openMainStory = () => {
  // TODO: 打开主线入口界面（MainStoryEntry）
  // 临时：直接打开世界书选择（复用新游戏逻辑）
  openNewGame()
}

const openShop = () => { currentScreen.value = 'shop' }
const openTask = () => { currentScreen.value = 'task-board' }
const openTest = () => { currentScreen.value = 'starry-sky' }
const openCheckIn = () => { isCheckInOpen.value = true }
const openCheckIn7 = () => { isCheckIn7Open.value = true }
const openMailbox = () => { isMailboxOpen.value = true }

const openPhone = () => { currentScreen.value = 'phone' }

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

const pluginScreenRegistry = computed(() => buildPluginScreenRegistry({
  pluginManifests: enabledFeaturePluginManifests.value,
  pluginEntries: localFeaturePluginEntries,
  activeWorldBookIdRef: activeWorldBookId,
  onBackToStart: backToWorldHub,
  onBackToWorldBookShelf: backToWorldBookShelf,
  onLoadSave: handleLoadSave,
  onLoadBackup: handleLoadBackup,
  onOpenWorldBookEditor: openWorldBookEditor,
  onNavigate: (screen) => { currentScreen.value = screen },
}))

const activePluginScreen = computed(() => {
  return resolvePluginScreenByRoute(pluginScreenRegistry.value, currentScreen.value)
})

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

let unsubscribeFeaturePluginRuntime = null

const handleFeaturePluginRuntimeStateChange = (nextState) => {
  featurePluginRuntimeState.value = nextState
}

onMounted(() => {
  // 数据迁移已在 feature-back-storage 模块加载时自动执行

  updateUiScale()
  window.addEventListener('resize', updateUiScale)
  unsubscribeFeaturePluginRuntime = subscribeFeaturePluginRuntimeState(
    handleFeaturePluginRuntimeStateChange,
  )
  
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
  if (unsubscribeFeaturePluginRuntime) {
    unsubscribeFeaturePluginRuntime()
    unsubscribeFeaturePluginRuntime = null
  }

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

watch(activePluginScreen, (pluginScreen) => {
  const screen = currentScreen.value
  if (screen === 'start' || screen === 'game' || screen === 'world-hub') {
    return
  }
  if (!pluginScreen) {
    currentScreen.value = 'world-hub'
  }
})

// Electron 下通过独立窗口实现系统级桌宠覆盖层
let mascotOverlayReady = false

const ensureMascotOverlay = async () => {
  if (!isElectron() || !window.avgLLM?.mascot) return
  // 不检查 GIF 是否存在，启用时就创建窗口（没 GIF 时显示占位符）
  if (!mascotOverlayReady) {
    await window.avgLLM.mascot.create()
    mascotOverlayReady = true
  }
  window.avgLLM.mascot.show()
}

const hideMascotOverlay = () => {
  if (!isElectron() || !window.avgLLM?.mascot || !mascotOverlayReady) return
  window.avgLLM.mascot.hide()
}

// Android 系统级悬浮窗
let androidOverlayReady = false

const getMascotScreenRect = () => {
  // mascot uses Teleport to body with position: fixed + translate3d(x,y,0)
  // Query the actual DOM element to get its real rendered size and position
  const mascotEls = document.querySelectorAll('body > .mascot')
  let mascotEl = null
  for (let i = 0; i < mascotEls.length; i++) {
    const el = mascotEls[i]
    if (el.offsetWidth > 0 || el.offsetHeight > 0) {
      mascotEl = el
      break
    }
  }
  if (mascotEl) {
    const rect = mascotEl.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const screenX = Math.round(rect.left * dpr)
    const screenY = Math.round(rect.top * dpr)
    const screenW = Math.round(rect.width * dpr)
    const screenH = Math.round(rect.height * dpr)
    console.log('[App] Mascot rect: css=', rect.left, rect.top, rect.width, rect.height,
      'dpr=', dpr, '=> screenX=', screenX, 'screenY=', screenY, 'size=', screenW, screenH)
    return { x: screenX, y: screenY, width: screenW, height: screenH }
  }

  // Fallback
  const cssX = mascotStorageState.value.x
  const cssY = mascotStorageState.value.y
  const dpr = window.devicePixelRatio || 1
  return { x: Math.round(cssX * dpr), y: Math.round(cssY * dpr), width: 80, height: 80 }
}

const ensureAndroidMascotOverlay = async () => {
  if (!isAndroidPlatform.value) return
  console.log('[App] Starting Android system overlay...')

  try {
    // Wait longer for DOM and mascot element to settle at correct position
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 1000))

    if (androidOverlayReady) {
      console.log('[App] Android overlay already ready, restarting...')
      await createOverlay()
    }

    // 获取 mascot 元素的实际屏幕位置
    const rect = getMascotScreenRect()

    mascotStorageState.value.visible = true

    let gifDataUrl = ''
    if (mascotStorageState.value.gifData) {
      gifDataUrl = mascotStorageState.value.gifData.dataUrl || await loadGifDataUrl() || ''
      console.log('[App] GIF dataUrl loaded:', gifDataUrl ? `length=${gifDataUrl.length}` : 'empty')
    } else {
      console.log('[App] No GIF data in storage')
    }

    const overlayData = {
      x: rect.x,
      y: rect.y,
      overlayWidth: rect.width,
      overlayHeight: rect.height,
      visible: true,
      gifData: mascotStorageState.value.gifData
        ? { ...mascotStorageState.value.gifData, dataUrl: gifDataUrl }
        : null,
    }
    await setOverlayMascotData(overlayData)

    await createOverlay()

    const url = import.meta.env.DEV
      ? 'http://10.0.2.2:5173/src/mascot-overlay/index.html'
      : 'file:///android_asset/public/src/mascot-overlay/index.html'

    console.log('[App] Loading overlay URL:', url)
    await loadOverlayUrl(url)
    androidOverlayReady = true
    console.log('[App] Android system overlay started')
  } catch (e) {
    console.error('[App] Failed to start Android system overlay:', e)
  }
}

const hideAndroidMascotOverlay = () => {
  if (!isAndroidPlatform.value) return
  console.log('[App] Hiding Android system overlay...')
  // Android 下不做 destroy，服务保持运行
}

// 启用状态变化
watch(isMascotEnabled, (enabled) => {
  if (enabled) {
    ensureMascotOverlay()
    ensureAndroidMascotOverlay()
  } else {
    hideMascotOverlay()
    hideAndroidMascotOverlay()
  }
}, { immediate: true })

// 通知 mascot 窗口状态变化（Electron + Android）
// Only watch gifData and visible, not x/y position changes from dragging.
// x/y is handled by the overlay itself via AndroidOverlay.updatePosition().
watch(() => ({ gifData: mascotStorageState.value.gifData, visible: mascotStorageState.value.visible }), async (state) => {
  if (isElectron() && window.avgLLM?.mascot && mascotOverlayReady) {
    window.avgLLM.mascot.updateState({
      x: mascotStorageState.value.x,
      y: mascotStorageState.value.y,
      visible: state.visible,
      gifData: state.gifData,
    })
  }
  if (isAndroidPlatform.value && androidOverlayReady && state.gifData) {
    try {
      const dpr = window.devicePixelRatio || 1
      await setOverlayMascotData({
        x: Math.round(mascotStorageState.value.x * dpr),
        y: Math.round(mascotStorageState.value.y * dpr),
        visible: state.visible,
        gifData: state.gifData
          ? { ...state.gifData, dataUrl: state.gifData.dataUrl || await loadGifDataUrl() || '' }
          : null,
      })
    } catch (e) {
      console.warn('[App] Failed to update Android overlay mascot data:', e)
    }
  }
}, { deep: true })
</script>

<template>
  <div class="app-stage" :class="[`platform-${platform}`, { 'android-portrait': isAndroidPlatform }]">
    <div
      class="app-shell"
      :class="{ 'game-fullscreen': currentScreen === 'game' || currentScreen === 'face-to-face' || currentScreen === 'trpg' }"
      :style="{ '--ui-scale': uiScale, ...containerStyle }"
    >
      <keep-alive>
        <WorldHubScreen
          v-if="currentScreen === 'world-hub'"
          @open-new-game="openNewGame"
          @open-main-story="openMainStory"
          @open-dormitory="() => currentScreen = 'dormitory'"
          @open-game-center="() => currentScreen = 'game-center'"
          @open-trpg="() => currentScreen = 'trpg'"
          @open-shop="openShop"
          @open-task="openTask"
          @open-checkin="openCheckIn"
          @open-checkin7="openCheckIn7"
          @open-mailbox="openMailbox"
          @open-worldbook="() => currentScreen = 'worldbook-shelf'"
          @open-card-collection="() => currentScreen = 'card-collection'"
          @open-adventure="() => currentScreen = 'adventure-game'"
          @open-narrator="() => currentScreen = 'narrator-manager'"
          @open-plugin="() => currentScreen = 'plugin-manager'"
          @open-settings="() => currentScreen = 'settings'"
          @open-face-to-face="() => currentScreen = 'face-to-face'"
          @open-load-save="() => currentScreen = 'load-save'"
          @open-phone="openPhone"
          @open-avatar="isAvatarSettingsOpen = true"
          @open-test="openTest"
          @open-rose="() => currentScreen = 'rose'"
          @open-book="() => currentScreen = 'book'"
          @open-hourglass="() => currentScreen = 'hourglass'"
          @open-mobius="() => currentScreen = 'mobius'"
        />
      </keep-alive>
      <StartScreen
        v-if="currentScreen === 'start'"
        :menu-items="startMenuItems"
        :menu-action-map="startMenuActionMap"
        @open-new-game="openNewGame"
        @menu-action="handleStartMenuAction"
      />
      <GameScreen
        v-else-if="currentScreen === 'game'"
        :save-data="loadedSaveData"
        :world-book-id="activeWorldBookId"
        :session-narrator-id="activeNarratorId"
        @back="backToWorldHub"
      />
      <component
        v-else-if="activePluginScreen"
        :is="activePluginScreen.component"
        v-bind="activePluginScreen.props"
        v-on="activePluginScreen.events"
      />

      <!-- 签到（全屏，从 WorldHub 直接打开） -->
      <CheckInScreen
        v-if="isCheckInOpen"
        :coins="0"
        @back="isCheckInOpen = false"
        @checkin-daily-result="() => {}"
      />
      <CheckIn7Screen
        v-if="isCheckIn7Open"
        :coins="0"
        @back="isCheckIn7Open = false"
        @checkin7-result="() => {}"
      />
    </div>

    <!-- 全局 Modal（Teleport 到 body，放在 app 外层） -->
    <GlobalMailbox
      :is-open="isMailboxOpen"
      @close="isMailboxOpen = false"
      @mail-affection-change="() => {}"
    />
    <AvatarFrameScreen
      v-if="isAvatarSettingsOpen"
      @close="isAvatarSettingsOpen = false"
    />

    <!-- 音乐播放器（全局悬浮，始终挂载） -->
    <MusicPlayerScreen
      v-show="isMusicPlayerOpen"
      @close="isMusicPlayerOpen = false"
    />

    <!-- 桌宠：Electron 下用独立覆盖层窗口，非 Electron 下用内嵌组件 -->
    <Mascot v-if="isMascotEnabled && !isElectronPlatform" />
  </div>
</template>

<style scoped src="./App.css"></style>
<style src="./theme/themeProfiles.css"></style>
