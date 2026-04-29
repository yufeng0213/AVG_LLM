/**
 * 桌宠覆盖层管理（Electron + Android 系统级悬浮窗）
 * 从 App.vue 提取（原 lines 379-661）
 */
import { computed, watch } from 'vue'
import { nextTick } from 'vue'
import { isElectron, isAndroid } from '../utils/platform.js'
import { getLocalFeaturePluginManifests } from '../features/localFeaturePluginManifests.js'
import { useMascotStorage } from '../../plugins/feature-mascot/src/composables/useMascotStorage.js'
import {
  createOverlay,
  loadOverlayUrl,
  setOverlayMascotData,
} from '../../plugins/feature-mascot/src/composables/useMascotOverlayAndroid.js'
import { useGameSession } from '../stores/gameSession.store.js'

export function useMascotOverlay() {
  const gameSession = useGameSession()
  const { mascotState: mascotStorageState, loadGifDataUrl } = useMascotStorage()

  const featurePluginManifestById = computed(() => {
    const map = new Map()
    getLocalFeaturePluginManifests().forEach((p) => map.set(p.id, p))
    return map
  })

  const isMascotEnabled = computed(() => {
    const manifest = featurePluginManifestById.value.get('feature-mascot')
    if (!manifest) return false
    const runtimeState = gameSession.pluginEnabled
    const hasOverride = Object.prototype.hasOwnProperty.call(runtimeState, 'feature-mascot')
    if (hasOverride) return Boolean(runtimeState['feature-mascot'])
    return manifest.enabledByDefault !== false
  })

  // === Electron 覆盖层 ===
  let mascotOverlayReady = false

  const ensureMascotOverlay = async () => {
    if (!isElectron() || !window.avgLLM?.mascot) return
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

  // === Android 系统级悬浮窗 ===
  let androidOverlayReady = false

  const getMascotScreenRect = () => {
    const dpr = window.devicePixelRatio || 1
    const cssWidth = 80
    const cssHeight = 80

    const cssX = mascotStorageState.value.x
    const cssY = mascotStorageState.value.y

    const screenX = Math.round(cssX * dpr)
    const screenY = Math.round(cssY * dpr)
    const screenW = Math.round(cssWidth * dpr)
    const screenH = Math.round(cssHeight * dpr)

    console.log('[App] Mascot rect: cssPos=(' + cssX + ',' + cssY + ') cssSize=' + cssWidth + 'x' + cssHeight
      + ' dpr=' + dpr + ' => physical=(' + screenX + ',' + screenY + ') size=' + screenW + 'x' + screenH)

    return { x: screenX, y: screenY, width: screenW, height: screenH }
  }

  const ensureAndroidMascotOverlay = async () => {
    if (!isAndroid()) return
    console.log('[App] Starting Android system overlay...')

    try {
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 1000))

      if (androidOverlayReady) {
        console.log('[App] Android overlay already ready, restarting...')
        await createOverlay()
      }

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
    if (!isAndroid()) return
    console.log('[App] Hiding Android system overlay...')
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
  watch(() => ({ gifData: mascotStorageState.value.gifData, visible: mascotStorageState.value.visible }), async (state) => {
    if (isElectron() && window.avgLLM?.mascot && mascotOverlayReady) {
      window.avgLLM.mascot.updateState({
        x: mascotStorageState.value.x,
        y: mascotStorageState.value.y,
        visible: state.visible,
        gifData: state.gifData,
      })
    }
    if (isAndroid() && androidOverlayReady && state.gifData) {
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
}
