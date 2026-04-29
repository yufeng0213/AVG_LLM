/**
 * 插件路由与动作分发
 * 从 App.vue 提取（原 lines 190-377 + 相关的 startMenu/插件动作处理）
 */
import { computed } from 'vue'
import {
  buildStartMenuRegistry,
  resolveStartMenuAction,
} from '../features/startMenuRegistry.js'
import { getLocalFeaturePluginManifests } from '../features/localFeaturePluginManifests.js'
import { getLocalFeaturePluginEntries } from '../features/localFeaturePluginEntries.js'
import { buildPluginScreenRegistry, resolvePluginScreenByRoute } from '../features/pluginScreenRegistry.js'
import {
  filterEnabledFeaturePluginManifests,
} from '../features/featurePluginRuntimeState.js'
import { useUiState } from '../stores/uiState.store.js'
import { useGameSession } from '../stores/gameSession.store.js'
import { useActivityEntry } from '../stores/activityEntry.store.js'
import { useMascotStorage } from '../../plugins/feature-mascot/src/composables/useMascotStorage.js'

const FULLSCREEN_SCREENS = new Set(['world-memory', 'world-map', 'dreams', 'timeline', 'evolution-log'])

export function usePluginRouting() {
  const ui = useUiState()
  const gameSession = useGameSession()
  const activityEntry = useActivityEntry()

  const localFeaturePluginManifests = getLocalFeaturePluginManifests()
  const localFeaturePluginEntries = getLocalFeaturePluginEntries()

  const enabledFeaturePluginManifests = computed(() => {
    return filterEnabledFeaturePluginManifests(
      localFeaturePluginManifests,
      gameSession.pluginEnabled,
      [], // worldbook tags are loaded async
    )
  })

  const startMenuItems = computed(() => {
    const registry = buildStartMenuRegistry({ pluginManifests: enabledFeaturePluginManifests.value })
    return registry.items
  })

  const startMenuActionMap = computed(() => {
    const registry = buildStartMenuRegistry({ pluginManifests: enabledFeaturePluginManifests.value })
    return registry.actionMap
  })

  const featurePluginManifestById = computed(() => {
    const map = new Map()
    localFeaturePluginManifests.forEach((p) => map.set(p.id, p))
    return map
  })

  const mascotHasGif = computed(() => {
    const { mascotState } = useMascotStorage()
    return !!mascotState.value?.gifData
  })

  const openScreenByKey = (screenKey) => {
    ui.navigateTo(screenKey)
  }

  const handleStartMenuAction = (payload) => {
    const itemId = typeof payload === 'string' ? payload : payload?.itemId
    const action = payload?.action && typeof payload.action === 'object'
      ? payload.action
      : resolveStartMenuAction(startMenuActionMap.value, itemId)
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

  const openNewGame = (payload) => {
    ui.loadedSaveData = null
    ui.openNewGame(payload)
  }

  const openWorldBookEditor = (bookId) => {
    ui.openWorldBookEditor(bookId)
  }

  const backToWorldBookShelf = () => { ui.backToWorldBookShelf() }
  const backToStart = () => { ui.backToStart() }
  const backToWorldHub = () => { ui.backToWorldHub() }

  const openShop = () => { ui.navigateTo('shop') }
  const openTask = () => { ui.navigateTo('task-board') }
  const openTest = () => { ui.navigateTo('starry-sky') }
  const openCheckIn = () => { ui.openCheckIn() }
  const openCheckIn7 = () => { ui.openCheckIn7() }
  const openMailbox = () => { ui.openMailbox() }
  const openPhone = () => { ui.navigateTo('phone') }

  const openActivity = (activityId) => {
    ui.navigateTo('character-card')
    activityEntry.requestOpenActivity(activityId)
  }

  const openDebugBaseBuilding = () => {
    gameSession.setFlag('base_building_unlocked', true)
    ui.openDebugBaseBuilding()
  }

  const showDebugBaseBuilding = computed({
    get: () => {
      const v = ui.showDebugBaseBuilding
      console.log('[PluginRouting] showDebugBaseBuilding getter:', v)
      return v
    },
    set: (v) => { ui.showDebugBaseBuilding = v },
  })

  const handleLoadSave = (saveData) => {
    ui.loadedSaveData = saveData
    const saveNarratorId = saveData?.game?.narratorId
    if (saveNarratorId) {
      ui.setActiveNarrator(saveNarratorId)
    }
    ui.currentScreen = 'game'
  }

  const handleLoadBackup = (backupData) => {
    ui.loadedSaveData = {
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
    ui.currentScreen = 'game'
  }

  const pluginScreenRegistry = computed(() => {
    try {
      console.log('[PluginRouting] building registry, manifests count:', enabledFeaturePluginManifests.value.length)
      const registry = buildPluginScreenRegistry({
        pluginManifests: enabledFeaturePluginManifests.value,
        pluginEntries: localFeaturePluginEntries,
        activeWorldBookIdRef: { get value() { return ui.activeWorldBookId }, set value(v) { void ui.setActiveWorldBook(v) } },
        onBackToStart: backToWorldHub,
        onBackToWorldBookShelf: backToWorldBookShelf,
        onLoadSave: handleLoadSave,
        onLoadBackup: handleLoadBackup,
        onOpenWorldBookEditor: openWorldBookEditor,
        onNavigate: (screen) => { ui.navigateTo(screen) },
      })
      const routes = Object.keys(registry)
      console.log('[PluginRouting] registry built, routes:', routes)
      return registry
    } catch (e) {
      console.error('[PluginRouting] registry build error:', e)
      return {}
    }
  })

  const activePluginScreen = computed(() => {
    console.log('[PluginRouting] activePluginScreen computed RUNNING, currentScreen:', ui.currentScreen)
    try {
      if (FULLSCREEN_SCREENS.has(ui.currentScreen)) {
        console.log('[PluginRouting] fullscreen screen, returning null')
        return null
      }
      console.log('[PluginRouting] calling resolvePluginScreenByRoute with registry keys:', Object.keys(pluginScreenRegistry.value))
      const result = resolvePluginScreenByRoute(pluginScreenRegistry.value, ui.currentScreen)
      console.log('[PluginRouting] activePluginScreen: currentScreen =', ui.currentScreen, ', result =', result ? (result.component?.__name || 'has-component') : 'null', ', events =', result?.events)
      return result
    } catch (e) {
      console.error('[PluginRouting] activePluginScreen error:', e)
      return null
    }
  })

  const isMusicPlayerEnabled = computed(() => {
    const manifest = featurePluginManifestById.value.get('music-player')
    if (!manifest) return false
    const runtimeState = gameSession.pluginEnabled
    const hasOverride = Object.prototype.hasOwnProperty.call(runtimeState, 'music-player')
    if (hasOverride) return Boolean(runtimeState['music-player'])
    return manifest.enabledByDefault !== false
  })

  return {
    startMenuItems,
    startMenuActionMap,
    enabledFeaturePluginManifests,
    activePluginScreen,
    showDebugBaseBuilding,
    isMusicPlayerEnabled,
    handleStartMenuAction,
    openNewGame,
    openWorldBookEditor,
    backToWorldBookShelf,
    backToStart,
    backToWorldHub,
    openShop,
    openTask,
    openTest,
    openCheckIn,
    openCheckIn7,
    openMailbox,
    openPhone,
    openActivity,
    openDebugBaseBuilding,
    handleLoadSave,
    handleLoadBackup,
    openScreenByKey,
  }
}
