<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { loadWorldBooks } from '../../../src/worldbook/worldBookStore.js'
import { useGameSession } from '../../../src/stores/gameSession.store.js'
import { useBaseBuilding } from './composables/useBaseBuilding.js'
import ResourceBar from './components/ResourceBar.vue'
import BuildingGrid from './components/BuildingGrid.vue'
import BuildingDetail from './components/BuildingDetail.vue'
import EventPanel from './components/EventPanel.vue'
import BaseIntroScreen from './components/BaseIntroScreen.vue'

console.log('[BaseBuildingScreen] 组件被创建了!')

const props = defineProps({
  worldBookId: { type: String, default: 'default_world_book' },
  onBack: { type: Function, default: () => {} },
})

const gameSession = useGameSession()

const worldBookIdRef = computed(() => props.worldBookId)
const worldBook = ref({})
const userProfile = ref({})

const {
  config,
  state: baseState,
  isInitializing,
  isProcessing,
  isUnlocked,
  resourceInventory,
  facilityInstances,
  initialize,
  upgradeFacility,
  assignWorker,
  removeWorker,
  resolveEvent,
  startAutoTick,
  stopAutoTick,
} = useBaseBuilding({
  worldBookId: worldBookIdRef,
  worldBook,
  userProfile,
  sharedGameState: { flags: gameSession.flags },
})

const activeTab = ref('resources') // resources | buildings | events
const selectedFacility = ref(null)
const showBuildingDetail = ref(false)

const tabs = [
  { key: 'resources', label: '资源', icon: '📦' },
  { key: 'buildings', label: '设施', icon: '🏗️' },
  { key: 'events', label: '事件', icon: '⚡' },
]

function handleFacilityClick(facility) {
  selectedFacility.value = facility
  showBuildingDetail.value = true
}

function handleUpgrade(facilityId) {
  const result = upgradeFacility(facilityId)
  if (result.ok) {
    // Success feedback handled in detail component
  }
}

function handleResolveEvent(eventId, optionId) {
  resolveEvent(eventId, optionId)
}

function handleRemoveWorker(charId) {
  removeWorker(charId)
}

onMounted(async () => {
  console.log('[BaseBuildingScreen] onMounted - isUnlocked:', isUnlocked.value, 'flags:', JSON.stringify(gameSession.flags))
  console.log('[BaseBuildingScreen] onMounted - props:', props)
  // Load world book data
  try {
    const books = await loadWorldBooks()
    const book = books.find(b => b.id === props.worldBookId)
    if (book) worldBook.value = book
  } catch (e) {
    console.warn('[base-building] Failed to load world book:', e)
  }

  await initialize()
  startAutoTick()
})

onUnmounted(() => {
  stopAutoTick()
})
</script>

<template>
  <div class="base-building-screen">
    <!-- Intro animation on first load -->
    <BaseIntroScreen
      v-if="isUnlocked && isInitializing"
      :world-book="worldBook"
    />

    <!-- Main content -->
    <div v-else-if="isUnlocked" class="base-content">
      <!-- Header -->
      <div class="base-header">
        <div class="base-title">
          <span class="base-icon">🏗️</span>
          <span>基地建设</span>
        </div>
        <div class="base-day">第 {{ baseState.day }} 天</div>
        <button class="base-back-btn" @click="onBack">✕</button>
      </div>

      <!-- Resource bar always visible -->
      <ResourceBar :resources="resourceInventory" />

      <!-- Tabs -->
      <div class="base-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="base-tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          <span class="tab-icon">{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <!-- Tab content -->
      <div class="base-tab-content">
        <BuildingGrid
          v-if="activeTab === 'buildings'"
          :facilities="facilityInstances"
          @facility-click="handleFacilityClick"
        />
        <EventPanel
          v-else-if="activeTab === 'events'"
          :events="baseState.activeEvents"
          :event-log="baseState.eventLog"
          @resolve="handleResolveEvent"
          @close="activeTab = 'buildings'"
        />
        <div v-else class="empty-tab">
          <p>资源产出由设施自动进行</p>
          <p>派遣角色到设施可提高产出效率</p>
        </div>
      </div>

      <!-- Building detail modal -->
      <BuildingDetail
        v-if="showBuildingDetail && selectedFacility"
        :facility="selectedFacility"
        :resources="resourceInventory"
        @upgrade="handleUpgrade"
        @close="showBuildingDetail = false"
      />
    </div>

    <!-- Not unlocked -->
    <div v-else class="base-locked">
      <span class="lock-icon">🔒</span>
      <p>基地建设尚未解锁</p>
      <p class="lock-hint">请继续推进主线剧情</p>
      <button class="base-back-btn-standalone" @click="() => { console.log('[BaseBuilding] 返回按钮被点击!'); onBack(); }">返回</button>
    </div>
  </div>
</template>

<style scoped>
.base-building-screen {
  position: fixed;
  inset: 0;
  background: linear-gradient(180deg, #0d0d1a 0%, #1a1a2e 100%);
  display: flex;
  flex-direction: column;
  z-index: 200;
  overflow: hidden;
}

.base-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.base-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.base-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.base-icon {
  font-size: 20px;
}

.base-day {
  flex: 1;
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.base-back-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
}

.base-tabs {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.base-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 0;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.base-tab.active {
  color: #fff;
  border-bottom-color: #4a9eff;
}

.tab-icon {
  font-size: 16px;
}

.base-tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.empty-tab {
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
  padding: 40px 0;
  line-height: 1.8;
}

.base-locked {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
}

.lock-icon {
  font-size: 48px;
}

.lock-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
}

.base-back-btn-standalone {
  margin-top: 20px;
  padding: 8px 24px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  cursor: pointer;
}


  .platform-android.android-portrait .base-back-btn {
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
