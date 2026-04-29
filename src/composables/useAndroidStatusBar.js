/**
 * Android 状态栏与布局调试
 * 从 App.vue 提取（原 lines 86-187 + onMounted/onBeforeUnmount 中的 Android 部分）
 */
import { computed } from 'vue'
import { StatusBar, Style } from '@capacitor/status-bar'
import { useUiState } from '../stores/uiState.store.js'

export function useAndroidStatusBar() {
  const ui = useUiState()
  const isAndroidPlatform = computed(() => ui.isAndroidPlatform)

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
      screen: ui.currentScreen,
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

  const setupAndroidEvents = () => {
    document.addEventListener('visibilitychange', handleAndroidVisibilityChange)
    window.addEventListener('focus', handleAndroidFocus)
    window.addEventListener('resize', handleAndroidResize)
    window.addEventListener('orientationchange', handleAndroidResize)

    window.__avgLayoutDebug = async () => {
      const immediate = await logAndroidLayoutSnapshot('manual-trigger:direct')
      scheduleAndroidLayoutDebug('manual-trigger')
      return immediate
    }
  }

  const teardownAndroidEvents = () => {
    document.removeEventListener('visibilitychange', handleAndroidVisibilityChange)
    window.removeEventListener('focus', handleAndroidFocus)
    window.removeEventListener('resize', handleAndroidResize)
    window.removeEventListener('orientationchange', handleAndroidResize)
    delete window.__avgLayoutDebug
  }

  return {
    applyAndroidStatusBarStyle,
    scheduleAndroidLayoutDebug,
    logAndroidLayoutSnapshot,
    handleAndroidVisibilityChange,
    handleAndroidFocus,
    handleAndroidResize,
    setupAndroidEvents,
    teardownAndroidEvents,
  }
}
