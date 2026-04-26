/**
 * 世界地图视图 — 可视化展示角色位置、活动、事件
 * 数据来源：角色日程（当前位置）、世界记忆（地点事件）
 */
<template>
  <div class="world-map-container">
    <!-- 顶部栏 -->
    <div class="world-map-header">
      <button class="map-back-btn" @click="$emit('back')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <span class="map-title">
        <span class="map-title-glow"></span>
        世界地图
      </span>
      <button class="map-refresh-btn" @click="refresh" :disabled="loading">
        {{ loading ? '刷新中...' : '↻ 刷新' }}
      </button>
    </div>

    <!-- 地点节点画布 -->
    <div class="map-viewport"
         @mousedown="startDrag"
         @mousemove="onDrag"
         @mouseup="stopDrag"
         @mouseleave="stopDrag"
         @touchstart="onTouchStart"
         @touchmove.prevent="onTouchMove"
         @touchend="onTouchEnd"
         @wheel.prevent="onWheelZoom"
         :style="{ cursor: isDragging ? 'grabbing' : 'grab' }"
         v-if="layoutNodes.length > 0">
      <div
        class="map-canvas"
        :style="{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }"
      >
        <div
          v-for="node in layoutNodes"
          :key="node.name"
          class="map-node"
          :class="{ active: selectedLocation === node.name }"
          :style="{ left: node.x + 'px', top: node.y + 'px' }"
          @click="clickedDuringDrag(node.name)"
        >
          <div class="node-icon">{{ node.icon }}</div>
          <div class="node-name">{{ node.name }}</div>
          <div class="node-count">
            {{ node.chars.length }}人在此
          </div>
          <!-- 角色头像 -->
          <div class="node-avatars">
            <div
              v-for="c in node.chars.slice(0, 4)"
              :key="c.char.id"
              class="node-avatar"
              :title="c.char.name"
            >
              {{ c.char.name.charAt(0) }}
            </div>
            <div v-if="node.chars.length > 4" class="node-avatar more">
              +{{ node.chars.length - 4 }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="map-empty">
      <p>暂无地点数据</p>
      <p class="map-empty-hint">
        推进剧情后，地点会自动从对话中提取并显示在这里。
      </p>
    </div>

    <!-- 详情面板 -->
    <Transition name="slide-up">
      <div v-if="selectedLocation" class="location-detail-panel">
        <div class="detail-header">
          <h3>📍 {{ selectedLocation }}</h3>
          <button class="detail-close-btn" @click="selectedLocation = null">×</button>
        </div>

        <button
          class="travel-here-btn"
          @click="handleTravelHere"
        >
          🚶 前往此地，开始接下来的剧情
        </button>

        <div class="detail-section" v-if="selectedChars.length > 0">
          <h4>👥 当前在此 ({{ selectedChars.length }}人)</h4>
          <div class="char-card" v-for="c in selectedChars" :key="c.char.id">
            <div class="char-name">{{ c.char.name }}</div>
            <div class="char-activity">
              {{ c.activity?.activityLabel || c.activity?.activityType || '未知活动' }}
            </div>
            <button class="char-status-btn" @click="openCharacterDetail(c.char)">
              查看详情
            </button>
          </div>
        </div>

        <div class="detail-section" v-if="selectedEvents.length > 0">
          <h4>📜 近期事件 (最近{{ selectedEvents.length }}条)</h4>
          <div class="event-item" v-for="evt in selectedEvents" :key="evt.id">
            <div class="event-type-badge">{{ evt.type }}</div>
            <div class="event-summary">{{ evt.summary }}</div>
            <div class="event-time">{{ formatEventTime(evt) }}</div>
          </div>
        </div>

        <div class="detail-section" v-if="selectedChars.length === 0 && selectedEvents.length === 0">
          <p class="empty-section-hint">暂无角色在此，也没有近期事件</p>
        </div>

        <div class="detail-section">
          <h4>📊 统计</h4>
          <div class="stats-row">
            <span>今日到访角色: {{ todayVisitedChars.length }}人</span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 底部时间线 -->
    <div class="timeline-bar" v-if="timelineEvents.length > 0">
      <div class="timeline-title">📌 时间线</div>
      <div class="timeline-list">
        <div
          v-for="evt in timelineEvents"
          :key="evt.id"
          class="timeline-item"
        >
          <span class="timeline-time">{{ formatEventTime(evt) }}</span>
          <span class="timeline-scene" v-if="evt.scene">[{{ evt.scene }}]</span>
          <span class="timeline-text">{{ evt.summary }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useCharacterSchedule } from '../../plugins/feature-character-schedule/src/composables/useCharacterSchedule.js'
import { loadWorldBooks, getActiveWorldBookId } from '../worldbook/worldBookStore.js'

const props = defineProps({
  worldBookId: { type: String, default: '' },
})

const emit = defineEmits(['back', 'travel'])

const scheduleAPI = useCharacterSchedule()
const loading = ref(false)
const selectedLocation = ref(null)
const worldBook = ref(null)
const allLocations = ref(new Map())
const worldEvents = ref([])

// 画布拖拽与缩放
const panX = ref(0)
const panY = ref(0)
const zoom = ref(1)
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const panStart = ref({ x: 0, y: 0 })
const movedDuringDrag = ref(0)

function startDrag(e) {
  isDragging.value = true
  movedDuringDrag.value = 0
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  dragStart.value = { x: clientX, y: clientY }
  panStart.value = { x: panX.value, y: panY.value }
}

function onDrag(e) {
  if (!isDragging.value) return
  const dx = e.clientX - dragStart.value.x
  const dy = e.clientY - dragStart.value.y
  movedDuringDrag.value = Math.sqrt(dx * dx + dy * dy)
  panX.value = panStart.value.x + dx
  panY.value = panStart.value.y + dy
}

function stopDrag() { isDragging.value = false }

function clickedDuringDrag(name) {
  if (movedDuringDrag.value > 5) return  // 拖拽中不触发选中
  selectedLocation.value = selectedLocation.value === name ? null : name
}

function onWheelZoom(e) {
  const delta = e.deltaY > 0 ? -0.08 : 0.08
  zoom.value = Math.min(2, Math.max(0.3, zoom.value + delta))
}

// --- 触摸：单指拖拽 + 双指捏合缩放 ---
const pinchStart = ref({ dist: 0, midX: 0, midY: 0, zoom: 1 })

function getTouchDist(e) {
  const dx = e.touches[0].clientX - e.touches[1].clientX
  const dy = e.touches[0].clientY - e.touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

function getTouchMid(e) {
  return {
    x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
    y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
  }
}

function onTouchStart(e) {
  if (e.touches.length === 2) {
    // 双指：进入捏合模式
    isDragging.value = true
    movedDuringDrag.value = 0
    pinchStart.value = {
      dist: getTouchDist(e),
      midX: 0, midY: 0,
      zoom: zoom.value,
    }
  } else if (e.touches.length === 1) {
    // 单指：拖拽平移
    isDragging.value = true
    movedDuringDrag.value = 0
    const t = e.touches[0]
    dragStart.value = { x: t.clientX, y: t.clientY }
    panStart.value = { x: panX.value, y: panY.value }
  }
}

function onTouchMove(e) {
  if (!isDragging.value) return

  if (e.touches.length === 2) {
    // 捏合缩放
    const dist = getTouchDist(e)
    const ratio = dist / pinchStart.value.dist
    zoom.value = Math.min(2, Math.max(0.3, pinchStart.value.zoom * ratio))
    // 同时平移：以双指中点为参考
    const mid = getTouchMid(e)
    const dx = mid.x - dragStart.value.x
    const dy = mid.y - dragStart.value.y
    movedDuringDrag.value = Math.sqrt(dx * dx + dy * dy)
    panX.value = panStart.value.x + dx
    panY.value = panStart.value.y + dy
  } else if (e.touches.length === 1) {
    // 单指拖拽
    const t = e.touches[0]
    const dx = t.clientX - dragStart.value.x
    const dy = t.clientY - dragStart.value.y
    movedDuringDrag.value = Math.sqrt(dx * dx + dy * dy)
    panX.value = panStart.value.x + dx
    panY.value = panStart.value.y + dy
  }
}

function onTouchEnd(e) {
  if (e.touches.length < 2) {
    // 从双指变为单指或无指：记录当前平移起点，避免跳变
    isDragging.value = e.touches.length === 0 ? false : true
    if (e.touches.length === 1) {
      const t = e.touches[0]
      dragStart.value = { x: t.clientX, y: t.clientY }
      panStart.value = { x: panX.value, y: panY.value }
    }
  }
  if (e.touches.length === 0) {
    isDragging.value = false
  }
}

onMounted(async () => {
  await loadWorldBook()
  gatherLocations()
  await loadWorldEvents()
})

async function loadWorldBook() {
  try {
    const books = await loadWorldBooks()
    const activeId = await getActiveWorldBookId()
    worldBook.value = books.find(b => b.id === activeId) || books[0] || null
  } catch (e) {
    console.warn('[WorldMap] load worldBook failed:', e.message)
  }
}

async function refresh() {
  loading.value = true
  try {
    await loadWorldBook()
    gatherLocations()
    await loadWorldEvents()
  } finally {
    loading.value = false
  }
}

/**
 * 收集所有角色的当前位置
 */
function gatherLocations() {
  const chars = worldBook.value?.characters || []
  const locationMap = new Map()

  for (const char of chars) {
    const key = `${worldBook.value.id}::${char.id}`
    const schedule = scheduleAPI.scheduleState?.scheduleMap?.[key]
    if (!schedule?.hourEntries) continue

    const currentHour = new Date().getHours()
    const entry = schedule.hourEntries[currentHour]
    const loc = entry?.plannedActivity?.locationName
    if (loc) {
      if (!locationMap.has(loc)) locationMap.set(loc, [])
      locationMap.get(loc).push({
        char,
        activity: entry.plannedActivity,
      })
    }
  }

  // 合并世界书 scenes 中没有角色的地点
  for (const scene of (worldBook.value?.scenes || [])) {
    const name = scene.name?.trim()
    if (name && !locationMap.has(name)) {
      locationMap.set(name, [])
    }
  }

  allLocations.value = locationMap
}

/**
 * 加载世界记忆事件
 */
async function loadWorldEvents() {
  if (!worldBook.value) return
  try {
    const { getWorldMemory } = await import('../memory/worldMemoryStore.js')
    const memory = await getWorldMemory(worldBook.value.id)
    worldEvents.value = (memory.events || []).slice(-50).reverse()
  } catch (e) {
    console.warn('[WorldMap] load events failed:', e.message)
    worldEvents.value = []
  }
}

/**
 * 自动布局：Fibonacci 螺旋 + 绝对像素坐标
 */
const layoutNodes = computed(() => {
  const arr = Array.from(allLocations.value.entries())
  if (arr.length === 0) return []

  // 按人数排序
  arr.sort((a, b) => b[1].length - a[1].length)

  const SPACING = 200  // 节点间距（px）
  const GOLDEN_ANGLE = 2.399963  // ≈ 137.5°，自然分散

  return arr.map(([name, chars], i) => {
    if (i === 0) {
      return { name, chars, x: 0, y: 0, icon: getIcon(name) }
    }
    const angle = i * GOLDEN_ANGLE
    const radius = SPACING * Math.sqrt(i)
    return {
      name,
      chars,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      icon: getIcon(name),
    }
  })
})

/**
 * 根据地点名称推断图标
 */
function getIcon(name) {
  const keywords = [
    [/宿舍|寝室|dorm/, '🏠'],
    [/教室|学校|课堂|class|school/, '🏫'],
    [/图书|图书馆|library/, '📚'],
    [/餐厅|食堂|饭堂|meal/, '🍽️'],
    [/咖啡|cafe/, '☕'],
    [/公园|花园|garden|park/, '🌳'],
    [/操场|运动|体育|gym/, '⚽'],
    [/医院|诊所|hospital/, '🏥'],
    [/商店|超市|shop|store/, '🛒'],
    [/办公室|office|work/, '💼'],
  ]
  for (const [re, icon] of keywords) {
    if (re.test(name)) return icon
  }
  return '📍'
}

const selectedChars = computed(() => {
  if (!selectedLocation.value) return []
  return allLocations.value.get(selectedLocation.value) || []
})

const selectedEvents = computed(() => {
  if (!selectedLocation.value) return []
  return worldEvents.value.filter(e => e.scene === selectedLocation.value).slice(0, 5)
})

const todayVisitedChars = computed(() => {
  if (!selectedLocation.value) return []
  const chars = allLocations.value.get(selectedLocation.value) || []
  return chars.map(c => c.char.id)
})

const timelineEvents = computed(() => {
  return worldEvents.value
    .filter(e => e.scene || e.participants?.length > 0)
    .slice(0, 10)
})

function openCharacterDetail(char) {
  emit('open-character', char)
}

function formatEventTime(evt) {
  if (!evt.createdAt) return ''
  try {
    const d = new Date(evt.createdAt)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch {
    return ''
  }
}

/**
 * 前往此地：向父组件发送旅行事件
 */
function handleTravelHere() {
  if (!selectedLocation.value) return
  emit('travel', {
    locationName: selectedLocation.value,
    worldBookId: props.worldBookId || worldBook.value?.id || '',
  })
}
</script>

<style scoped>
.world-map-container {
  position: fixed;
  inset: 0;
  height: 100dvh;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #0a0e17 0%, #1a1f2e 100%);
  color: #e0e0e0;
  overflow: hidden;
  z-index: 9999;
}

/* Header */
.world-map-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: clamp(10px, 2vw, 16px) clamp(12px, 3vw, 20px);
  padding-top: max(clamp(10px, 2vw, 16px), var(--safe-area-inset-top, 16px));
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}

.map-back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
  padding: 6px 14px;
  border-radius: 9999px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.map-back-btn:hover {
  background: rgba(100, 150, 255, 0.2);
  border-color: rgba(100, 150, 255, 0.4);
}

.map-back-btn svg {
  width: 16px;
  height: 16px;
}

.map-title {
  font-size: clamp(16px, 3.5vw, 20px);
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.5px;
}

.map-title-glow {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6496ff;
  box-shadow: 0 0 8px rgba(100, 150, 255, 0.6);
  animation: map-glow-pulse 2s ease-in-out infinite;
}

@keyframes map-glow-pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}

.map-refresh-btn {
  background: rgba(100, 150, 255, 0.2);
  border: 1px solid rgba(100, 150, 255, 0.4);
  color: #c0d0ff;
  padding: 6px 16px;
  border-radius: 9999px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}
.map-refresh-btn:hover:not(:disabled) {
  background: rgba(100, 150, 255, 0.35);
  box-shadow: 0 0 16px rgba(100, 150, 255, 0.2);
}
.map-refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Map Viewport & Canvas */
.map-viewport {
  flex: 1;
  overflow: hidden;
  position: relative;
  cursor: grab;
  min-height: 0;
}

.map-canvas {
  position: absolute;
  top: 50%;
  left: 50%;
  transform-origin: center center;
  width: 0;
  height: 0;
}

.map-node {
  position: absolute;
  transform: translate(-50%, -50%);
  background: rgba(30, 35, 50, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  min-width: 100px;
  max-width: 160px;
  /* left/top 由 :style 动态设置，单位 px */
}
.map-node:hover {
  transform: translate(-50%, -50%) scale(1.08);
  border-color: rgba(100, 150, 255, 0.5);
  box-shadow: 0 0 20px rgba(100, 150, 255, 0.2);
}
.map-node.active {
  border-color: rgba(100, 150, 255, 0.8);
  box-shadow: 0 0 30px rgba(100, 150, 255, 0.3);
}

.node-icon {
  font-size: 28px;
  margin-bottom: 4px;
}

.node-name {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-count {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 6px;
}

.node-avatars {
  display: flex;
  justify-content: center;
  gap: 4px;
  flex-wrap: wrap;
}

.node-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(100, 150, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 500;
  color: #c0d0ff;
  border: 1px solid rgba(100, 150, 255, 0.4);
}
.node-avatar.more {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
}

/* Empty State */
.map-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  padding: 20px;
}
.map-empty p {
  margin: 8px 0;
  font-size: 16px;
}
.map-empty-hint {
  font-size: 13px !important;
  max-width: 260px;
}

/* Detail Panel */
.location-detail-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(20, 25, 40, 0.95);
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px 20px 0 0;
  padding: 20px;
  max-height: 60%;
  overflow-y: auto;
  z-index: 10;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.detail-header h3 {
  margin: 0;
  font-size: 18px;
}
.detail-close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 24px;
  cursor: pointer;
  padding: 0 4px;
}
.detail-close-btn:hover {
  color: #fff;
}

.detail-section {
  margin-bottom: 16px;
}
.detail-section h4 {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 10px 0;
}

.char-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.char-name {
  font-size: 14px;
  font-weight: 500;
  min-width: 60px;
}
.char-activity {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  flex: 1;
}
.char-status-btn {
  background: rgba(100, 150, 255, 0.2);
  border: 1px solid rgba(100, 150, 255, 0.3);
  color: #c0d0ff;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
}
.char-status-btn:hover {
  background: rgba(100, 150, 255, 0.3);
}

.event-item {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 6px;
}
.event-type-badge {
  display: inline-block;
  background: rgba(100, 150, 255, 0.15);
  color: #80a0ff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  margin-right: 8px;
}
.event-summary {
  font-size: 13px;
  display: inline;
}
.event-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 4px;
}

.empty-section-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
}

.stats-row {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

/* Timeline Bar */
.timeline-bar {
  background: rgba(0, 0, 0, 0.4);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 10px 16px;
  flex-shrink: 0;
  max-height: 160px;
  overflow-y: auto;
}
.timeline-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
  color: rgba(255, 255, 255, 0.7);
}
.timeline-item {
  font-size: 12px;
  padding: 3px 0;
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.timeline-time {
  color: rgba(255, 255, 255, 0.4);
  font-family: monospace;
  min-width: 44px;
}
.timeline-scene {
  color: #80a0ff;
  font-size: 11px;
}
.timeline-text {
  color: rgba(255, 255, 255, 0.7);
}

/* Slide-up transition */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}


  .platform-android.android-portrait .world-map-header {
    background: rgba(0, 0, 0, 0.85) !important;
  }

  .platform-android.android-portrait .map-back-btn,
  .platform-android.android-portrait .map-refresh-btn,
  .platform-android.android-portrait .char-status-btn,
  .platform-android.android-portrait .detail-close-btn {
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
