<script setup>
import { onBeforeUnmount, onMounted, watch, computed } from 'vue'
import GameScreen from './screens/GameScreen.vue'
import StartScreen from './screens/StartScreen.vue'
import WorldHubScreen from './screens/WorldHubScreen.vue'
import { isNative, isElectron } from './utils/platform'
import { useActivityEntry } from './stores/activityEntry.store.js'
import { useUiState } from './stores/uiState.store.js'
import { useGameSession } from './stores/gameSession.store.js'
import { usePlayerState } from './stores/playerState.store.js'
import { initGlobalApi } from './globalApi.js'
import { useCardCollection } from '../plugins/feature-character-card/src/composables/useCardCollection.js'
import { useCharacterSchedule } from '../plugins/feature-character-schedule/src/composables/useCharacterSchedule.js'
import {
  initAutoRefreshScheduler,
  startAutoRefreshScheduler,
  stopAutoRefreshScheduler,
} from '../plugins/feature-character-schedule/src/services/autoRefreshScheduler.js'
import { useBluetoothAudio } from '../plugins/feature-phone/src/phone/composables/useBluetoothAudio.js'
import { useSpotCheckPush } from '../plugins/feature-phone/src/phone/composables/useSpotCheckPush.js'
import { loadSmsThreads, saveSmsThreads } from '../plugins/feature-phone/src/phone/composables/usePhoneData.js'
import GlobalMailbox from '../plugins/feature-mail/src/components/GlobalMailbox.vue'
import CheckInScreen from '../plugins/feature-checkin/src/CheckInScreen.vue'
import CheckIn7Screen from '../plugins/feature-checkin/src/CheckIn7Screen.vue'
import AvatarFrameScreen from '../plugins/feature-dormitory/src/components/AvatarFrameScreen.vue'
import MusicPlayerScreen from '../plugins/feature-music-player/src/MusicPlayerScreen.vue'
import WorldMemoryScreen from '../plugins/feature-world-memory/src/WorldMemoryScreen.vue'
import BaseBuildingScreen from '../plugins/feature-base-building/src/BaseBuildingScreen.vue'
import GameCenterScreen from '../plugins/feature-game/src/GameCenterScreen.vue'
import ShopScreen from '../plugins/feature-shop/src/ShopScreen.vue'
import TaskBoardScreen from '../plugins/feature-task/src/TaskBoardScreen.vue'
import DormitoryScreen from '../plugins/feature-dormitory/src/DormitoryScreen.vue'
import PhoneScreen from '../plugins/feature-phone/src/PhoneScreen.vue'
import TRPGScreen from '../plugins/feature-trpg/src/TRPGScreen.vue'
import AdventureGameScreen from '../plugins/feature-adventure-game/src/AdventureGameScreen.vue'
import WorldBookScreen from '../plugins/feature-worldbook/src/WorldBookScreen.vue'
import WorldBookEditorScreen from '../plugins/feature-worldbook/src/WorldBookEditorScreen.vue'
import NarratorManagerScreen from '../plugins/feature-narrator-manager/src/NarratorManagerScreen.vue'
import PluginManagerScreen from '../plugins/feature-plugin-manager/src/PluginManagerScreen.vue'
import FaceToFaceScreen from '../plugins/feature-face-to-face/src/FaceToFaceScreen.vue'
import StarrySkyScreen from '../plugins/feature-test/src/StarrySkyScreen.vue'
import RoseScreen from '../plugins/feature-rose-particle/src/RoseScreen.vue'
import BookScreen from '../plugins/feature-book-particle/src/BookScreen.vue'
import HourglassScreen from '../plugins/feature-hourglass/src/HourglassScreen.vue'
import MobiusScreen from '../plugins/feature-mobius-particle/src/MobiusScreen.vue'
import CharacterCardScreen from '../plugins/feature-character-card/src/CharacterCardScreen.vue'
import MementoCardScreen from '../plugins/feature-memento-card/src/MementoCardScreen.vue'
import SettingsScreen from '../plugins/feature-settings/src/SettingsScreen.vue'
import WorldMapView from './screens/WorldMapView.vue'
import DreamScreen from './screens/DreamScreen.vue'
import TimelineViewScreen from './screens/TimelineViewScreen.vue'
import EvolutionLogScreen from './screens/EvolutionLogScreen.vue'
import Mascot from '../plugins/feature-mascot/src/Mascot.vue'

// Extracted composables
import { useAndroidStatusBar } from './composables/useAndroidStatusBar.js'
import { useMascotOverlay } from './composables/useMascotOverlay.js'
import { usePluginRouting } from './composables/usePluginRouting.js'

// ===== Pinia stores =====
const ui = useUiState()
const gameSession = useGameSession()
const playerState = usePlayerState()
const activityEntry = useActivityEntry()

// 执行一次性数据迁移
playerState.runMigration()

// ===== Extracted: Android 状态栏 =====
const android = useAndroidStatusBar()

// ===== Extracted: 桌宠覆盖层 =====
useMascotOverlay()

// ===== Extracted: 插件路由 =====
const routing = usePluginRouting()

// ===== 游戏厅金币结算 =====
const handleGameEconomyResult = (data) => {
  if (!data) return
  const net = (data.net != null) ? data.net : ((data.earned || 0) - (data.cost || 0))
  if (net === 0) return
  playerState.updateEconomy(prev => ({
    ...prev,
    coins: Math.max(0, Math.min(9999, prev.coins + net)),
  }))
}

// ===== Widget 事件处理 =====
const handleWidgetOpenDormitory = async (data) => {
  console.log('[App] Widget event received:', data)
  if (data?.characterId && data?.worldBookId) {
    await ui.setActiveWorldBook(data.worldBookId)
    ui.currentScreen = 'dormitory'
    window.__avgDormitoryTargetCharacter = data.characterId
  }
}

if (typeof window !== 'undefined') {
  window.__avgWidgetHandler = handleWidgetOpenDormitory
}

// ===== 平台检测 =====
const platform = ui.platform
const isMobile = ui.isMobile
const isNativeApp = computed(() => isNative())
const isElectronPlatform = computed(() => isElectron())

// ===== 桌宠启用判断（供模板使用，实际逻辑在 useMascotOverlay 中） =====
import { getLocalFeaturePluginManifests } from './features/localFeaturePluginManifests.js'
const _mascotManifestById = computed(() => {
  const map = new Map()
  getLocalFeaturePluginManifests().forEach((p) => map.set(p.id, p))
  return map
})
const isMascotEnabled = computed(() => {
  const manifest = _mascotManifestById.value.get('feature-mascot')
  if (!manifest) return false
  const state = gameSession.pluginEnabled
  if (Object.prototype.hasOwnProperty.call(state, 'feature-mascot')) return !!state['feature-mascot']
  return manifest.enabledByDefault !== false
})

// ===== 全局蓝牙 + 查岗推送 =====
const { isBluetoothConnected } = useBluetoothAudio()

let _spotCheckAudio = null
async function handleSpotCheckVoice({ contact, voiceMsg, audioUrl }) {
  console.log('[App] SpotCheck voice received:', contact.name)

  try {
    const threads = await loadSmsThreads()
    const thread = threads[contact.id] || []
    thread.push(voiceMsg)
    threads[contact.id] = thread
    await saveSmsThreads(threads)
  } catch (e) {
    console.warn('[App] Failed to save spot check SMS:', e)
  }

  if (isBluetoothConnected.value && audioUrl) {
    if (_spotCheckAudio) { _spotCheckAudio.pause() }
    const audio = new Audio(audioUrl)
    _spotCheckAudio = audio
    audio.onended = () => { _spotCheckAudio = null }
    audio.onerror = () => { _spotCheckAudio = null }
    audio.play().catch(() => { _spotCheckAudio = null })
  }

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display === 'granted' || (await LocalNotifications.requestPermissions()).display === 'granted') {
      const notifId = Date.now() % 100000 + Math.floor(Math.random() * 90000)
      await LocalNotifications.schedule({
        notifications: [{
          title: `${contact.name} 查岗`,
          body: (voiceMsg.voiceText || '').slice(0, 200),
          id: notifId,
          schedule: { at: new Date(Date.now() + 1000), allowsWhileIdle: true },
          extra: { type: 'spot_check', contactId: contact.id },
          sound: null,
          attachments: null,
        }],
      })
      return
    }
  } catch (e) { /* not on Android, fallback below */ }

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`${contact.name} 查岗`, {
      body: (voiceMsg.voiceText || '').slice(0, 100),
      icon: '/favicon.svg',
      tag: 'spot-check',
    })
  }
}

useSpotCheckPush({
  isBtConnected: isBluetoothConnected,
  onNewVoiceMessage: handleSpotCheckVoice,
})

// ===== UI 缩放 =====
const updateUiScale = () => {
  ui.updateUiScale()
}

// ===== 加载世界书 ID =====
const loadActiveWorldBookId = async () => {
  await ui.loadActiveWorldBookId()
}

// ===== Lifecycle =====
onMounted(() => {
  // 注意：不再清除 localStorage，因为玩家数据、存档等需要持久化
  // SQLite 存储的数据不受 localStorage 影响

  console.log('[App] initial currentScreen:', ui.currentScreen, 'showDebugBaseBuilding:', ui.showDebugBaseBuilding)

  // 强制重置到世界中心
  ui.showDebugBaseBuilding = false
  ui.currentScreen = 'world-hub'

  console.log('[App] after reset, currentScreen:', ui.currentScreen, 'showDebugBaseBuilding:', ui.showDebugBaseBuilding)
  void loadActiveWorldBookId()
  void ui.loadActiveNarratorId()

  initGlobalApi({
    usePlayerState,
    useCardCollection,
    worldBookIdRef: { get value() { return ui.activeWorldBookId }, set value(v) { void ui.setActiveWorldBook(v) } },
  })

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
  if (ui.isAndroidPlatform) {
    body.classList.add('android-portrait')
    document.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }, { passive: false })

    void android.applyAndroidStatusBarStyle()
    android.setupAndroidEvents()
    android.scheduleAndroidLayoutDebug('mounted-android')
  }

  // 初始化并启动角色日程自动刷新调度器
  const scheduleAPI = useCharacterSchedule()
  initAutoRefreshScheduler(scheduleAPI)
  startAutoRefreshScheduler()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateUiScale)

  if (ui.isAndroidPlatform) {
    android.teardownAndroidEvents()
  }

  stopAutoRefreshScheduler()
})

watch(() => ui.currentScreen, (screen) => {
  console.log('[App] currentScreen changed to:', screen)
  console.log('[App] routing.activePluginScreen.value:', routing.activePluginScreen?.value)
  console.log('[App] routing.pluginScreenRegistry keys:', Object.keys(routing.pluginScreenRegistry?.value || {}))
  if (screen === 'game') {
    android.scheduleAndroidLayoutDebug('screen-to-game')
  }
})

watch(() => routing.showDebugBaseBuilding, (v) => {
  console.log('[App] showDebugBaseBuilding changed to:', v)
})

// Temporarily disabled: activePluginScreen watch caused infinite loop
// watch(() => routing.activePluginScreen, (pluginScreen) => { ... })
</script>

<template>
  <!-- DEBUG: 实时显示状态 -->
  <div style="position:fixed;top:0;right:0;z-index:9999;background:rgba(0,0,0,0.8);color:#0f0;padding:4px 8px;font-size:12px;font-family:monospace;">
    screen:{{ ui.currentScreen }} debugBase:{{ routing.showDebugBaseBuilding }}
  </div>
  <div class="app-stage" :class="[`platform-${platform}`, { 'android-portrait': ui.isAndroidPlatform }]">
    <div
      class="app-shell"
      :class="{ 'game-fullscreen': ui.currentScreen === 'game' || ui.currentScreen === 'face-to-face' || ui.currentScreen === 'trpg' || ui.currentScreen === 'world-memory' || ui.currentScreen === 'world-map' }"
      :style="{ '--ui-scale': ui.uiScale, ...ui.containerStyle }"
    >
      <keep-alive>
        <WorldHubScreen
          v-if="ui.currentScreen === 'world-hub'"
          @open-main-story="(payload) => ui.openMainStory({ ...payload, narratorId: ui.activeNarratorId })"
          @open-dormitory="() => ui.currentScreen = 'dormitory'"
          @open-game-center="() => { console.log('[App] 处理 open-game-center, 当前 screen:', ui.currentScreen); ui.currentScreen = 'game-center'; console.log('[App] screen 已改为:', ui.currentScreen); }"
          @open-trpg="() => ui.currentScreen = 'trpg'"
          @open-shop="routing.openShop"
          @open-task="routing.openTask"
          @open-checkin="routing.openCheckIn"
          @open-checkin7="routing.openCheckIn7"
          @open-mailbox="routing.openMailbox"
          @open-worldbook="() => ui.currentScreen = 'worldbook-shelf'"
          @open-world-map="() => ui.currentScreen = 'world-map'"
          @open-world-memory="() => ui.currentScreen = 'world-memory'"
          @open-dreams="() => ui.currentScreen = 'dreams'"
          @open-timeline="() => ui.currentScreen = 'timeline'"
          @open-evolution-log="() => ui.currentScreen = 'evolution-log'"
          @open-card-collection="() => ui.currentScreen = 'memento-card'"
          @open-character-card="() => ui.currentScreen = 'character-card'"
          @world-book-changed="(bookId) => void ui.setActiveWorldBook(bookId)"
          @open-activity="routing.openActivity"
          @open-adventure="() => ui.currentScreen = 'adventure-game'"
          @open-narrator="() => ui.currentScreen = 'narrator-manager'"
          @open-plugin="() => ui.currentScreen = 'plugin-manager'"
          @open-settings="() => ui.currentScreen = 'settings'"
          @open-face-to-face="() => ui.currentScreen = 'face-to-face'"
          @open-phone="routing.openPhone"
          @open-avatar="ui.isAvatarSettingsOpen = true"
          @open-test="routing.openTest"
          @open-rose="() => ui.currentScreen = 'rose'"
          @open-book="() => ui.currentScreen = 'book'"
          @open-hourglass="() => ui.currentScreen = 'hourglass'"
          @open-mobius="() => ui.currentScreen = 'mobius'"
          @open-debug-base="routing.openDebugBaseBuilding"
          @open-room-simulation="() => ui.currentScreen = 'room-simulation'"
        />
      </keep-alive>
      <StartScreen
        v-if="ui.currentScreen === 'start'"
        :menu-items="routing.startMenuItems"
        :menu-action-map="routing.startMenuActionMap"
        @open-new-game="routing.openNewGame"
        @menu-action="routing.handleStartMenuAction"
      />
      <GameScreen
        v-else-if="ui.currentScreen === 'game'"
        :save-data="ui.loadedSaveData"
        :world-book-id="ui.activeWorldBookId"
        :session-narrator-id="ui.activeNarratorId"
        @back="routing.backToWorldHub"
      />
      <!-- Plugin screen routing (direct v-else-if chain) -->
      <GameCenterScreen
        v-else-if="ui.currentScreen === 'game-center'"
        :coins="playerState.economy?.coins ?? 0"
        :inventory="playerState.inventory ?? []"
        @spin-result="handleGameEconomyResult($event)"
        @pachinko-result="handleGameEconomyResult($event)"
        @dograce-result="handleGameEconomyResult($event)"
        @farm-harvest="handleGameEconomyResult($event)"
        @kitchen-result="handleGameEconomyResult($event)"
        @xylophone-result="handleGameEconomyResult($event)"
        @harmonica-result="handleGameEconomyResult($event)"
        @match3-result="handleGameEconomyResult($event)"
        @gacha-result="handleGameEconomyResult($event)"
        @game-skin-buy="handleGameEconomyResult($event)"
        @kitchen-consume="handleGameEconomyResult($event)"
        @kitchen-produce="handleGameEconomyResult($event)"
        @back="routing.backToWorldHub"
      />
      <ShopScreen
        v-else-if="ui.currentScreen === 'shop'"
        @back="routing.backToWorldHub"
      />
      <TaskBoardScreen
        v-else-if="ui.currentScreen === 'task-board'"
        @back="routing.backToWorldHub"
      />
      <DormitoryScreen
        v-else-if="ui.currentScreen === 'dormitory'"
        @back="routing.backToWorldHub"
      />
      <PhoneScreen
        v-else-if="ui.currentScreen === 'phone'"
        @back="routing.backToWorldHub"
      />
      <TRPGScreen
        v-else-if="ui.currentScreen === 'trpg'"
        @back="routing.backToWorldHub"
      />
      <AdventureGameScreen
        v-else-if="ui.currentScreen === 'adventure-game'"
        @back="routing.backToWorldHub"
      />
      <WorldBookScreen
        v-else-if="ui.currentScreen === 'worldbook-shelf'"
        @back="routing.backToWorldHub"
        @open-book="ui.openWorldBookEditor"
      />
      <WorldBookEditorScreen
        v-else-if="ui.currentScreen === 'worldbook-editor'"
        :book-id="ui.editingWorldBookId"
        @back="ui.currentScreen = 'worldbook-shelf'"
      />
      <NarratorManagerScreen
        v-else-if="ui.currentScreen === 'narrator-manager'"
        @back="routing.backToWorldHub"
      />
      <PluginManagerScreen
        v-else-if="ui.currentScreen === 'plugin-manager'"
        @back="routing.backToWorldHub"
      />
      <FaceToFaceScreen
        v-else-if="ui.currentScreen === 'face-to-face'"
        @back="routing.backToWorldHub"
      />
      <StarrySkyScreen
        v-else-if="ui.currentScreen === 'starry-sky'"
        @back="routing.backToWorldHub"
      />
      <RoseScreen
        v-else-if="ui.currentScreen === 'rose'"
        @back="routing.backToWorldHub"
      />
      <BookScreen
        v-else-if="ui.currentScreen === 'book'"
        @back="routing.backToWorldHub"
      />
      <HourglassScreen
        v-else-if="ui.currentScreen === 'hourglass'"
        @back="routing.backToWorldHub"
      />
      <MobiusScreen
        v-else-if="ui.currentScreen === 'mobius'"
        @back="routing.backToWorldHub"
      />
      <CharacterCardScreen
        v-else-if="ui.currentScreen === 'character-card'"
        @back="routing.backToWorldHub"
      />
      <MementoCardScreen
        v-else-if="ui.currentScreen === 'memento-card'"
        @back="routing.backToWorldHub"
      />
      <SettingsScreen
        v-else-if="ui.currentScreen === 'settings'"
        @back="routing.backToWorldHub"
      />
      <!-- Fallback: other plugin screens via dynamic routing -->
      <div v-else-if="routing.activePluginScreen?.value" class="plugin-screen-wrapper">
        DEBUG: activePluginScreen has value, component={{ routing.activePluginScreen?.value?.component?.__name }}
        <component
          :is="routing.activePluginScreen.value.component"
          v-bind="routing.activePluginScreen.value.props"
          v-on="routing.activePluginScreen.value.events"
        />
      </div>

      <!-- 签到（全屏，从 WorldHub 直接打开） -->
      <CheckInScreen
        v-if="ui.isCheckInOpen"
        :coins="playerState.economy?.coins ?? 0"
        @back="ui.closeCheckIn"
        @checkin-daily-result="(data) => { if (data?.earned) { playerState.updateEconomy(prev => ({ ...prev, coins: Math.min(9999, (prev.coins || 0) + data.earned) })) } }"
      />
      <CheckIn7Screen
        v-if="ui.isCheckIn7Open"
        :coins="playerState.economy?.coins ?? 0"
        @back="ui.closeCheckIn7"
        @checkin7-result="(data) => { if (data?.earned) { playerState.updateEconomy(prev => ({ ...prev, coins: Math.min(9999, (prev.coins || 0) + data.earned) })) } }"
      />

      <!-- 基建调试（临时禁用） -->
      <!-- <BaseBuildingScreen
        v-if="routing.showDebugBaseBuilding"
        :world-book-id="ui.activeWorldBookId"
        @back="() => { console.log('[App] BaseBuildingScreen @back fired, closing'); ui.closeDebugBaseBuilding() }"
      /> -->

      <!-- 世界记忆（全屏） -->
      <WorldMemoryScreen
        v-else-if="ui.currentScreen === 'world-memory'"
        @back="ui.backToWorldHub"
      />

      <!-- 世界地图（全屏） -->
      <WorldMapView
        v-else-if="ui.currentScreen === 'world-map'"
        @back="ui.backToWorldHub"
      />

      <!-- 梦境（全屏） -->
      <DreamScreen
        v-else-if="ui.currentScreen === 'dreams'"
        @back="ui.backToWorldHub"
      />

      <!-- 时间线（全屏） -->
      <TimelineViewScreen
        v-else-if="ui.currentScreen === 'timeline'"
        @back="ui.backToWorldHub"
      />

      <!-- 世界演化日志（全屏） -->
      <EvolutionLogScreen
        v-else-if="ui.currentScreen === 'evolution-log'"
        @back="ui.backToWorldHub"
      />
    </div>

    <!-- 全局 Modal（Teleport 到 body，放在 app 外层） -->
    <GlobalMailbox
      :is-open="ui.isMailboxOpen"
      @close="ui.closeMailbox"
      @mail-affection-change="() => {}"
    />
    <AvatarFrameScreen
      v-if="ui.isAvatarSettingsOpen"
      @close="ui.closeAvatarSettings"
    />

    <!-- 音乐播放器（全局悬浮） -->
    <MusicPlayerScreen
      v-if="routing.isMusicPlayerEnabled"
      v-show="ui.isMusicPlayerOpen"
      @close="ui.isMusicPlayerOpen = false"
    />

    <!-- 桌宠：Electron 下用独立覆盖层窗口，Android 下用系统级悬浮窗，其他平台用内嵌组件 -->
    <Mascot v-if="isMascotEnabled && !isElectronPlatform && !ui.isAndroidPlatform" />

    <!-- 主线世界书选择器 -->
    <div v-if="ui.showMainStorySelector" class="main-story-overlay" @click.self="ui.closeMainStorySelector">
      <div class="main-story-dialog">
        <div class="main-story-header">
          <h2 class="main-story-title">选择主线世界书</h2>
          <button class="main-story-close" @click="ui.closeMainStorySelector">✕</button>
        </div>
        <div class="main-story-body">
          <p v-if="ui.mainStoryLoading" class="main-story-loading">加载中...</p>
          <p v-else-if="ui.mainStoryBooks.length === 0" class="main-story-empty">暂无世界书</p>
          <div v-else class="main-story-book-list">
            <div
              v-for="book in ui.mainStoryBooks"
              :key="book.id"
              class="main-story-book-card"
              @click="ui.selectMainStoryBook(book)"
            >
              <div class="book-card-title">{{ book.title }}</div>
              <div class="book-card-summary">{{ book.summary?.slice(0, 60) || '无概述' }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./App.css"></style>
<style src="./theme/themeProfiles.css"></style>

<style scoped>
.main-story-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.main-story-dialog {
  background: #1a1a2e;
  border-radius: 16px;
  width: min(500px, 90vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.main-story-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.main-story-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.main-story-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
}

.main-story-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.main-story-loading,
.main-story-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
  padding: 40px 0;
}

.main-story-book-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.main-story-book-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.main-story-book-card:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.book-card-title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
}

.book-card-summary {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.4;
}


  .platform-android.android-portrait .main-story-close {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 6px 10px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
  }
</style>
