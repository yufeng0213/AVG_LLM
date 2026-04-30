<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { kvStorage } from '../../storage/index.js'
import { resolveStorageScopeKey } from './state/storageScope.js'
import { persistStateSnapshot, restoreStateSnapshot } from './state/persistence.js'
import { buildDefaultState, createDefaultPawn, buildDefaultRoomState, createDefaultRoom } from './state/initialState.js'
import FurnitureImportPanel from './components/FurnitureImportPanel.vue'
import HamburgerMenu from './components/HamburgerMenu.vue'
import PawnInfoOverlay from './components/PawnInfoOverlay.vue'
import {
  ROOM_DEFAULT_WIDTH,
  ROOM_DEFAULT_HEIGHT,
  ROOM_CELL_SIZE,
  SPRITE_PIXEL_SIZE,
  SPRITE_GRID_SIZE,
  NEED_MAX_VALUE,
  NEED_DEFAULT_CONFIG,
  MAX_LOG_COUNT,
  MAX_PAWN_COUNT,
  MAX_ROOM_FURNITURE_ITEMS,
  TIME_TICK_INTERVAL_MS,
  NEED_DECAY_INTERVAL_MS,
  MOOD_DECAY_INTERVAL_MS,
  MOOD_THRESHOLD_VERY_HAPPY,
  MOOD_THRESHOLD_HAPPY,
  MOOD_THRESHOLD_NORMAL,
  MOOD_THRESHOLD_UNHAPPY,
} from './config/constants.js'
import { createRoomSpriteResolver } from './render/roomSprites.js'
import { createPawnSpriteResolver } from './render/pawnSprites.js'
import { createRoomEngine } from './logic/room/roomEngine.js'
import { createPawnNeedsEngine } from './logic/pawn/pawnNeedsEngine.js'
import { createPawnMoodEngine } from './logic/pawn/pawnMoodEngine.js'
import { createPawnPathfindEngine } from './logic/pawn/pawnPathfind.js'
import { resolveRoomPointerCell, buildRoomDragState } from './logic/room/roomInput.js'
import { isAndroid } from '../../utils/platform.js'

const props = defineProps({
  worldBook: { type: Object, default: null },
  saveSlotId: { type: [String, Number], default: '' },
  autoOpen: { type: Boolean, default: false },
})

// ========== 基础状态 ==========

const panelOpen = ref(false)
const loading = ref(false)
const errorText = ref('')
const android = ref(false)
const showHamburger = ref(false)
const showImportPanel = ref(false)
const showPawnOverlay = ref(false)

const state = ref(buildDefaultState())

// ========== 多房间状态 ==========

const activeRoomId = ref('room-common')

const activeRoom = computed(() => {
  const rooms = state.value.rooms || []
  return rooms.find(r => r.id === activeRoomId.value) || rooms[0] || buildDefaultRoomState()
})

const storageScopeKey = computed(() =>
  resolveStorageScopeKey({
    worldBookId: props.worldBook?.id || 'default_world_book',
    saveSlotId: props.saveSlotId || 'global',
  })
)

// ========== 引擎实例 ==========

const roomEngine = createRoomEngine()
const needsEngine = createPawnNeedsEngine()
const moodEngine = createPawnMoodEngine()
const pathfindEngine = createPawnPathfindEngine()
const roomSpriteResolver = createRoomSpriteResolver()
const pawnSpriteResolver = createPawnSpriteResolver({
  getFrameTick: () => frameTick.value,
})

// ========== 游戏循环 ==========

let simulationLoopId = null
let decayLoopId = null
let moodDecayLoopId = null
const frameTick = ref(0)

const startSimulationLoop = () => {
  if (simulationLoopId) return
  simulationLoopId = setInterval(() => {
    if (state.value.time.isPaused) return
    runSimulationTick()
  }, TIME_TICK_INTERVAL_MS)
}

const stopSimulationLoop = () => {
  if (simulationLoopId) {
    clearInterval(simulationLoopId)
    simulationLoopId = null
  }
}

const startDecayLoop = () => {
  if (decayLoopId) return
  decayLoopId = setInterval(() => {
    if (state.value.time.isPaused) return
    runNeedsDecay()
  }, NEED_DECAY_INTERVAL_MS)
}

const stopDecayLoop = () => {
  if (decayLoopId) {
    clearInterval(decayLoopId)
    decayLoopId = null
  }
}

const startMoodDecayLoop = () => {
  if (moodDecayLoopId) return
  moodDecayLoopId = setInterval(() => {
    if (state.value.time.isPaused) return
    runMoodUpdate()
  }, MOOD_DECAY_INTERVAL_MS)
}

const stopMoodDecayLoop = () => {
  if (moodDecayLoopId) {
    clearInterval(moodDecayLoopId)
    moodDecayLoopId = null
  }
}

const runSimulationTick = () => {
  const s = state.value
  s.time.tick += 1

  const ticksPerHour = 60
  if (s.time.tick % ticksPerHour === 0) {
    s.time.hourOfDay = (s.time.hourOfDay + 1) % 24
    if (s.time.hourOfDay === 0) {
      s.time.dayCount += 1
    }
    updateTimePhase()
  }

  for (const pawn of s.pawns) {
    updatePawn(pawn)
  }

  frameTick.value = (frameTick.value + 1) % 60
}

const runNeedsDecay = () => {
  for (const pawn of state.value.pawns) {
    needsEngine.decayNeeds(pawn, NEED_DECAY_INTERVAL_MS)
  }
}

const runMoodUpdate = () => {
  const s = state.value
  for (const pawn of s.pawns) {
    const pawnRoom = getRoomForPawn(pawn)
    moodEngine.updateAllMood(pawn, pawnRoom || s.rooms[0], MOOD_DECAY_INTERVAL_MS)
  }
}

const updateTimePhase = () => {
  const hour = state.value.time.hourOfDay
  if (hour >= 6 && hour < 12) {
    state.value.time.dayPhase = 'morning'
    state.value.time.lightModifier = 1.0
  } else if (hour >= 12 && hour < 18) {
    state.value.time.dayPhase = 'afternoon'
    state.value.time.lightModifier = 0.9
  } else if (hour >= 18 && hour < 22) {
    state.value.time.dayPhase = 'evening'
    state.value.time.lightModifier = 0.7
  } else {
    state.value.time.dayPhase = 'night'
    state.value.time.lightModifier = 0.5
  }
}

// ========== 房间辅助 ==========

const getRoomForPawn = (pawn) => {
  const rooms = state.value.rooms || []
  return rooms.find(r => r.id === pawn.currentRoomId) || rooms[0]
}

// ========== 小人更新 ==========

const updatePawn = (pawn) => {
  const currentRoom = getRoomForPawn(pawn)

  if (pawn.moving && pawn.path.length > 0) {
    if (pawn.pathIndex < pawn.path.length) {
      const nextPos = pawn.path[pawn.pathIndex]
      pawn.position = { x: nextPos.x, y: nextPos.y }
      pawn.pathIndex += 1
      pawn.sprite.action = 'walk'

      if (pawn.pathIndex >= pawn.path.length) {
        pawn.moving = false
        pawn.path = []
        pawn.pathIndex = 0
        pawn.sprite.action = 'idle'

        if (pawn.targetFurniture) {
          startInteraction(pawn)
        }
      }
    }
  } else if (pawn.currentActivity === 'working') {
    const elapsed = Date.now() - pawn.activityStartTime
    if (elapsed > 5000) {
      completeInteraction(pawn)
    }
  } else if (pawn.currentActivity === 'sleeping') {
    needsEngine.recoverNeed(pawn, 'rest', NEED_DEFAULT_CONFIG.rest.recoveryRate)
    pawn.sprite.action = 'sleep'
  } else if (pawn.currentActivity === 'eating') {
    needsEngine.recoverNeed(pawn, 'hunger', NEED_DEFAULT_CONFIG.hunger.recoveryRate)
    pawn.sprite.action = 'eat'
    const elapsed = Date.now() - pawn.activityStartTime
    if (elapsed > 3000) {
      completeInteraction(pawn)
    }
  } else {
    runPawnAI(pawn, currentRoom)
  }
}

const runPawnAI = (pawn, room) => {
  const needsEval = needsEngine.evaluateNeedsState(pawn)

  const urgentNeeds = Object.entries(needsEval)
    .filter(([_, e]) => e.isCritical || e.isWarning)
    .sort((a, b) => b[1].urgency - a[1].urgency)

  if (urgentNeeds.length > 0) {
    const [needType, evalData] = urgentNeeds[0]
    const targetFurniture = findFurnitureForNeed(needType, room)
    if (targetFurniture) {
      const path = pathfindEngine.findPath(
        pawn.position,
        { x: targetFurniture.x, y: targetFurniture.y },
        room.tiles,
        room.width,
        room.height
      )
      if (path && path.length > 0) {
        pawn.path = path
        pawn.pathIndex = 0
        pawn.moving = true
        pawn.targetFurniture = targetFurniture.id
        pawn.currentActivity = 'moving'

        if (path[0].x > pawn.position.x) pawn.sprite.facing = 'right'
        else if (path[0].x < pawn.position.x) pawn.sprite.facing = 'left'

        addLog(`${pawn.name} 开始前往${targetFurniture.name}满足${needType}需求`)
      }
    }
  }
}

const findFurnitureForNeed = (needType, room) => {
  return room?.furniture?.find(f => f.needsSatisfied && f.needsSatisfied[needType] > 0)
}

const startInteraction = (pawn) => {
  const room = getRoomForPawn(pawn)
  const furniture = room?.furniture?.find(f => f.id === pawn.targetFurniture)
  if (!furniture) return

  pawn.activityStartTime = Date.now()

  if (furniture.interactionType === 'sleep') {
    pawn.currentActivity = 'sleeping'
    pawn.sprite.action = 'sleep'
  } else if (furniture.interactionType === 'eat') {
    pawn.currentActivity = 'eating'
    pawn.sprite.action = 'eat'
  } else if (furniture.interactionType === 'work') {
    pawn.currentActivity = 'working'
    pawn.sprite.action = 'work'
  } else if (furniture.interactionType === 'social') {
    pawn.currentActivity = 'socializing'
    pawn.sprite.action = 'talk'
  }
}

const completeInteraction = (pawn) => {
  const room = getRoomForPawn(pawn)
  const furniture = room?.furniture?.find(f => f.id === pawn.targetFurniture)
  if (furniture && furniture.needsSatisfied) {
    for (const [need, rate] of Object.entries(furniture.needsSatisfied)) {
      needsEngine.recoverNeed(pawn, need, rate * 10)
    }
  }

  if (furniture) {
    if (furniture.interactionType === 'sleep') {
      const restValue = pawn.needs?.rest?.value || 50
      if (restValue >= 80) {
        moodEngine.addEventMoodThought(pawn, 'good_sleep')
      } else if (restValue < 40) {
        moodEngine.addEventMoodThought(pawn, 'bad_sleep')
      }
    } else if (furniture.interactionType === 'work') {
      moodEngine.addEventMoodThought(pawn, 'work_complete')
    } else if (furniture.interactionType === 'eat') {
      moodEngine.addEventMoodThought(pawn, 'ate_good')
    } else if (furniture.interactionType === 'social') {
      moodEngine.addEventMoodThought(pawn, 'social_chat')
    }
  }

  pawn.currentActivity = 'idle'
  pawn.targetFurniture = null
  pawn.sprite.action = 'idle'
}

// ========== 时间控制 ==========

const togglePause = () => {
  state.value.time.isPaused = !state.value.time.isPaused
}

// ========== 日志 ==========

const addLog = (text) => {
  const s = state.value
  s.logs.push({ text, time: Date.now(), highlight: false })
  if (s.logs.length > MAX_LOG_COUNT) {
    s.logs = s.logs.slice(-MAX_LOG_COUNT)
  }
}

// ========== 持久化 ==========

let persistTimer = null

const schedulePersist = () => {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    void persistStateSnapshot({
      storage: kvStorage,
      key: storageScopeKey.value,
      state: state.value,
      normalizeState: normalizeState,
    })
  }, 200)
}

// ========== 状态规范化 ==========

const normalizeState = (raw) => {
  if (!raw || typeof raw !== 'object') return buildDefaultState()

  // 兼容旧版本：如果只有 single room，转换为 rooms 数组
  let rooms = raw.rooms
  if (!Array.isArray(rooms) && raw.room) {
    const oldRoom = normalizeRoomState(raw.room)
    oldRoom.id = 'room-common'
    oldRoom.name = '公共区域'
    oldRoom.type = 'common'
    rooms = [oldRoom]
  }

  return {
    time: normalizeTimeState(raw.time),
    rooms: normalizeRoomsList(rooms),
    room: null, // 保持兼容但不再使用
    pawns: normalizePawnList(raw.pawns),
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    items: normalizeItemsState(raw.items),
    stats: normalizeStatsState(raw.stats),
    worldBookId: String(raw.worldBookId || ''),
    worldBookCharacterSignature: String(raw.worldBookCharacterSignature || ''),
    selectedPawnId: String(raw.selectedPawnId || ''),
    selectedFurnitureId: String(raw.selectedFurnitureId || ''),
    currentView: String(raw.currentView || 'room'),
    logs: normalizeLogList(raw.logs),
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
  }
}

const normalizeTimeState = (raw) => {
  const defaultTime = { tick: 0, dayCount: 1, hourOfDay: 6, timeSpeed: 1.0, isPaused: true, dayPhase: 'morning', lightModifier: 1.0 }
  if (!raw || typeof raw !== 'object') return defaultTime
  return {
    tick: Math.max(0, Number(raw.tick) || 0),
    dayCount: Math.max(1, Number(raw.dayCount) || 1),
    hourOfDay: Math.max(0, Math.min(23, Number(raw.hourOfDay) || 6)),
    timeSpeed: Math.max(0.5, Math.min(3, Number(raw.timeSpeed) || 1)),
    isPaused: Boolean(raw.isPaused),
    dayPhase: ['morning', 'afternoon', 'evening', 'night'].includes(raw.dayPhase) ? raw.dayPhase : 'morning',
    lightModifier: Math.max(0.1, Math.min(1, Number(raw.lightModifier) || 1)),
  }
}

const normalizeRoomsList = (raw) => {
  if (!Array.isArray(raw) || raw.length < 1) {
    return [buildDefaultRoomState()]
  }
  return raw.slice(0, 10).map(r => normalizeRoomState(r))
}

const normalizeRoomState = (raw) => {
  if (!raw || typeof raw !== 'object') return buildDefaultRoomState()
  return roomEngine.normalizeRoomMap(raw)
}

const normalizePawnList = (raw) => {
  const defaultList = [createDefaultPawn(0, '工匠')]
  if (!Array.isArray(raw) || raw.length < 1) return defaultList
  return raw.slice(0, MAX_PAWN_COUNT).map((p, i) => normalizePawn(p, i))
}

const normalizePawn = (raw, index = 0) => {
  if (!raw || typeof raw !== 'object') return createDefaultPawn(index)
  const defaultPawn = createDefaultPawn(index)
  return {
    ...defaultPawn,
    id: String(raw.id || defaultPawn.id),
    name: String(raw.name || defaultPawn.name).slice(0, 20),
    role: String(raw.role || defaultPawn.role).slice(0, 16),
    position: normalizePosition(raw.position) || defaultPawn.position,
    currentRoomId: String(raw.currentRoomId || defaultPawn.currentRoomId || 'room-common'),
    ownedRoomId: raw.ownedRoomId ? String(raw.ownedRoomId) : null,
    needs: normalizeNeeds(raw.needs) || defaultPawn.needs,
    skills: normalizeSkills(raw.skills) || defaultPawn.skills,
    mood: normalizeMood(raw.mood) || defaultPawn.mood,
    moodThoughts: normalizeMoodThoughts(raw.moodThoughts) || [],
    currentActivity: ['idle', 'moving', 'working', 'sleeping', 'eating', 'socializing'].includes(raw.currentActivity)
      ? raw.currentActivity : 'idle',
    sprite: normalizeSprite(raw.sprite) || defaultPawn.sprite,
  }
}

const normalizePosition = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  const x = Number(raw.x)
  const y = Number(raw.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x: Math.max(0, Math.min(ROOM_DEFAULT_WIDTH - 1, x)), y: Math.max(0, Math.min(ROOM_DEFAULT_HEIGHT - 1, y)) }
}

const normalizeNeeds = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  const needs = {}
  for (const [key, config] of Object.entries(NEED_DEFAULT_CONFIG)) {
    const rawNeed = raw[key]
    needs[key] = {
      value: Number.isFinite(rawNeed?.value) ? Math.max(0, Math.min(100, rawNeed.value)) : NEED_MAX_VALUE,
      decayRate: Number(rawNeed?.decayRate) || config.decayRate,
      threshold: Number(rawNeed?.threshold) || config.threshold,
      critical: Number(rawNeed?.critical) || config.critical,
    }
  }
  return needs
}

const normalizeSkills = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  return {
    crafting: normalizeSkill(raw.crafting),
    cooking: normalizeSkill(raw.cooking),
    social: normalizeSkill(raw.social),
    cleaning: normalizeSkill(raw.cleaning),
  }
}

const normalizeSkill = (raw) => {
  return {
    level: Math.max(1, Math.min(20, Number(raw?.level) || 1)),
    exp: Math.max(0, Number(raw?.exp) || 0),
    maxLevel: 20,
  }
}

const normalizeMood = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  return {
    value: Math.max(0, Math.min(100, Number(raw.value) || 50)),
    breakdown: {
      positive: Number(raw.breakdown?.positive) || 0,
      negative: Number(raw.breakdown?.negative) || 0,
      total: Number(raw.breakdown?.total) || 0,
    },
    state: ['veryHappy', 'happy', 'normal', 'unhappy', 'breakdown'].includes(raw.state)
      ? raw.state : 'normal',
  }
}

const normalizeMoodThoughts = (raw) => {
  if (!Array.isArray(raw)) return []
  return raw.filter(t => t && typeof t === 'object').map(t => ({
    id: String(t.id || `thought-${Date.now()}`),
    type: String(t.type || 'event'),
    label: String(t.label || '未知'),
    moodModifier: Number(t.moodModifier) || 0,
    source: String(t.source || 'unknown'),
    decayRate: Number(t.decayRate) || 0,
    duration: t.duration ? Number(t.duration) : null,
    addedAt: t.addedAt ? Number(t.addedAt) : null,
  }))
}

const normalizeSprite = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  return {
    style: String(raw.style || 'knight'),
    palette: String(raw.palette || 'ember'),
    action: String(raw.action || 'idle'),
    facing: ['left', 'right'].includes(raw.facing) ? raw.facing : 'right',
  }
}

const normalizeItemsState = (raw) => {
  return { foods: [], materials: [], products: [] }
}

const normalizeStatsState = (raw) => {
  return { totalWorkCompleted: 0, totalFoodConsumed: 0, totalSocialInteractions: 0 }
}

const normalizeLogList = (raw) => {
  if (!Array.isArray(raw)) return ['房间模拟系统已启动']
  return raw.slice(-MAX_LOG_COUNT).map(l => typeof l === 'string' ? l : String(l?.text || l || ''))
}

// ========== 渲染计算 ==========

const roomBoardStyle = computed(() => {
  const room = activeRoom.value
  const cellSize = ROOM_CELL_SIZE
  return {
    width: `${room.width * cellSize}px`,
    height: `${room.height * cellSize}px`,
    gridTemplateColumns: `repeat(${room.width}, ${cellSize}px)`,
    gridTemplateRows: `repeat(${room.height}, ${cellSize}px)`,
  }
})

const roomCellsSorted = computed(() => {
  const room = activeRoom.value
  return room.tiles.slice().sort((a, b) => a.y - b.y || a.x - b.x)
})

const furnitureSortedByZ = computed(() => {
  const room = activeRoom.value
  return room.furniture.slice().sort((a, b) => a.z - b.z)
})

const pawnsInActiveRoom = computed(() => {
  const s = state.value
  return s.pawns.filter(p => p.currentRoomId === activeRoomId.value || (!p.currentRoomId && activeRoomId.value === 'room-common'))
})

const pawnsSortedByY = computed(() => {
  return pawnsInActiveRoom.value.slice().sort((a, b) => a.position.y - b.position.y)
})

const getTileSpriteSrc = (tile) => {
  return roomSpriteResolver.getTileSpriteSrc(tile)
}

const getFurnitureSpriteSrc = (furniture) => {
  return roomSpriteResolver.getFurnitureSpriteSrc(furniture)
}

const getPawnSpriteSrc = (pawn) => {
  return pawnSpriteResolver.getPawnSpriteSrc(pawn)
}

const getFurnitureStyle = (furniture) => {
  const cellSize = ROOM_CELL_SIZE
  return {
    left: `${furniture.x * cellSize}px`,
    top: `${furniture.y * cellSize}px`,
    width: `${furniture.width * cellSize}px`,
    height: `${furniture.height * cellSize}px`,
    zIndex: furniture.z || 10,
  }
}

const getPawnStyle = (pawn) => {
  const cellSize = ROOM_CELL_SIZE
  const spriteSize = SPRITE_GRID_SIZE * SPRITE_PIXEL_SIZE
  return {
    left: `${pawn.position.x * cellSize + (cellSize - spriteSize) / 2}px`,
    top: `${pawn.position.y * cellSize + (cellSize - spriteSize) / 2}px`,
    zIndex: 200 + Math.floor(pawn.position.y),
    transform: pawn.sprite.facing === 'left' ? 'scaleX(-1)' : 'scaleX(1)',
  }
}

// ========== 心情显示辅助 ==========

const getMoodClass = (pawn) => {
  const moodValue = pawn?.mood?.value || 50
  if (moodValue >= MOOD_THRESHOLD_VERY_HAPPY) return 'veryHappy'
  if (moodValue >= MOOD_THRESHOLD_HAPPY) return 'happy'
  if (moodValue >= MOOD_THRESHOLD_NORMAL) return 'normal'
  if (moodValue >= MOOD_THRESHOLD_UNHAPPY) return 'unhappy'
  return 'breakdown'
}

const getNeedBarClass = (pawn, needType) => {
  const need = pawn?.needs?.[needType]
  if (!need) return 'normal'
  if (need.value <= need.critical) return 'critical'
  if (need.value <= need.threshold) return 'warning'
  return 'normal'
}

// ========== 交互 ==========

const selectedPawn = computed(() => {
  const id = state.value.selectedPawnId
  return state.value.pawns.find(p => p.id === id) || null
})

const selectPawn = (pawn) => {
  state.value.selectedPawnId = pawn?.id || ''
  showPawnOverlay.value = !!pawn
}

// ========== 房间管理 ==========

const handleSelectRoom = (roomId) => {
  activeRoomId.value = roomId
  showHamburger.value = false
  state.value.selectedFurnitureId = ''
  state.value.selectedPawnId = ''
  showPawnOverlay.value = false
}

const handleAddRoom = () => {
  const s = state.value
  const newRoom = createDefaultRoom(s.rooms.length)
  s.rooms.push(newRoom)
  addLog(`新建房间: ${newRoom.name}`)
  schedulePersist()
}

const handleDeleteRoom = (roomId) => {
  const s = state.value
  if (s.rooms.length <= 1) return

  const index = s.rooms.findIndex(r => r.id === roomId)
  if (index < 0) return

  const deletedRoom = s.rooms[index]
  s.rooms.splice(index, 1)

  // 如果删除的是当前房间，切换到第一个
  if (activeRoomId.value === roomId) {
    activeRoomId.value = s.rooms[0].id
  }

  // 更新小人所属房间引用
  for (const pawn of s.pawns) {
    if (pawn.ownedRoomId === roomId) {
      pawn.ownedRoomId = null
    }
    if (pawn.currentRoomId === roomId) {
      pawn.currentRoomId = s.rooms[0].id
    }
  }

  addLog(`删除房间: ${deletedRoom.name}`)
  schedulePersist()
}

const handleSelectPawnFromMenu = (pawnId) => {
  const pawn = state.value.pawns.find(p => p.id === pawnId)
  if (!pawn) return

  state.value.selectedPawnId = pawnId
  showPawnOverlay.value = true
  showHamburger.value = false

  // 如果小人有寝室，跳转到那个房间
  if (pawn.ownedRoomId && activeRoomId.value !== pawn.ownedRoomId) {
    activeRoomId.value = pawn.ownedRoomId
  } else if (pawn.currentRoomId && activeRoomId.value !== pawn.currentRoomId) {
    activeRoomId.value = pawn.currentRoomId
  }
}

const handleAddPawn = () => {
  const s = state.value
  if (s.pawns.length >= MAX_PAWN_COUNT) return
  const newPawn = createDefaultPawn(s.pawns.length)

  moodEngine.initializeMood(newPawn)
  moodEngine.updateAllMood(newPawn, s.rooms[0], 0)

  s.pawns.push(newPawn)
  addLog(`新小人 ${newPawn.name} 已入住`)

  for (const otherPawn of s.pawns) {
    if (otherPawn.id !== newPawn.id) {
      moodEngine.addEventMoodThought(otherPawn, 'new_pawn')
    }
  }

  schedulePersist()
  showHamburger.value = false
}

// ========== 家具拖拽 ==========

let roomDragState = null
const roomBoardRef = ref(null)

const startFurnitureDrag = (event, furniture) => {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()

  const boardEl = roomBoardRef.value
  if (!boardEl) return

  const point = resolveRoomPointerCell(event.clientX, event.clientY, boardEl, ROOM_CELL_SIZE)
  roomDragState = buildRoomDragState({
    event,
    furniture,
    point,
    cellSize: ROOM_CELL_SIZE,
  })

  window.addEventListener('pointermove', onRoomDragMove, { passive: false })
  window.addEventListener('pointerup', onRoomDragEnd, { passive: false })
  window.addEventListener('pointercancel', onRoomDragCancel, { passive: false })
}

const onRoomDragMove = (event) => {
  if (!roomDragState) return
  event.preventDefault()

  const boardEl = roomBoardRef.value
  if (!boardEl) return

  const room = activeRoom.value
  const point = resolveRoomPointerCell(event.clientX, event.clientY, boardEl, ROOM_CELL_SIZE)
  const maxX = room.width - roomDragState.width
  const maxY = room.height - roomDragState.height

  const newX = Math.max(0, Math.min(maxX, Math.round(point.x - roomDragState.offsetX)))
  const newY = Math.max(0, Math.min(maxY, Math.round(point.y - roomDragState.offsetY)))

  updateFurniturePosition(roomDragState.furnitureId, newX, newY, false)
}

const onRoomDragEnd = (event) => {
  if (!roomDragState) return
  event.preventDefault()

  const boardEl = roomBoardRef.value
  if (!boardEl) return

  const room = activeRoom.value
  const point = resolveRoomPointerCell(event.clientX, event.clientY, boardEl, ROOM_CELL_SIZE)
  const maxX = room.width - roomDragState.width
  const maxY = room.height - roomDragState.height

  const newX = Math.max(0, Math.min(maxX, Math.round(point.x - roomDragState.offsetX)))
  const newY = Math.max(0, Math.min(maxY, Math.round(point.y - roomDragState.offsetY)))

  updateFurniturePosition(roomDragState.furnitureId, newX, newY, true)
  stopRoomDrag()
}

const onRoomDragCancel = () => {
  if (!roomDragState) return
  updateFurniturePosition(roomDragState.furnitureId, roomDragState.startX, roomDragState.startY, true)
  stopRoomDrag()
}

const stopRoomDrag = () => {
  roomDragState = null
  window.removeEventListener('pointermove', onRoomDragMove)
  window.removeEventListener('pointerup', onRoomDragEnd)
  window.removeEventListener('pointercancel', onRoomDragCancel)
}

const updateFurniturePosition = (furnitureId, newX, newY, persist = false) => {
  const room = activeRoom.value
  const furniture = room.furniture.find(f => f.id === furnitureId)
  if (furniture) {
    furniture.x = newX
    furniture.y = newY
    if (persist) {
      schedulePersist()
    }
  }
}

const selectFurniture = (furniture) => {
  state.value.selectedFurnitureId = furniture?.id || ''
}

// ========== 导入家具 ==========

const handleAddImportedFurniture = (furniture) => {
  const room = activeRoom.value
  if (room.furniture.length >= MAX_ROOM_FURNITURE_ITEMS) {
    addLog('家具数量已达上限')
    return
  }
  room.furniture.push(furniture)
  addLog(`已导入家具: ${furniture.name} (${furniture.width}x${furniture.height})`)
  schedulePersist()
}

// ========== 生命周期 ==========

const restoreState = async (key) => {
  loading.value = true
  const result = await restoreStateSnapshot({
    storage: kvStorage,
    key,
    normalizeState,
    buildDefaultState,
  })
  state.value = result.state
  loading.value = false

  // 设置默认activeRoomId
  if (state.value.rooms?.length > 0) {
    activeRoomId.value = state.value.rooms[0].id
  }
}

onMounted(async () => {
  android.value = isAndroid()
  await restoreState(storageScopeKey.value)

  for (const pawn of state.value.pawns) {
    if (!pawn.mood) {
      moodEngine.initializeMood(pawn)
    }
    const pawnRoom = getRoomForPawn(pawn)
    moodEngine.updateAllMood(pawn, pawnRoom || state.value.rooms[0], 0)
  }

  startSimulationLoop()
  startDecayLoop()
  startMoodDecayLoop()
  if (props.autoOpen) panelOpen.value = true
})

onUnmounted(() => {
  stopSimulationLoop()
  stopDecayLoop()
  stopMoodDecayLoop()
  stopRoomDrag()
  if (persistTimer) clearTimeout(persistTimer)
  void persistStateSnapshot({
    storage: kvStorage,
    key: storageScopeKey.value,
    state: state.value,
    normalizeState,
  })
})

watch(storageScopeKey, async (newKey, oldKey) => {
  if (oldKey && persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
    await persistStateSnapshot({
      storage: kvStorage,
      key: oldKey,
      state: state.value,
      normalizeState,
    })
  }
  await restoreState(newKey)
})

watch(panelOpen, (open) => {
  if (open) {
    startSimulationLoop()
    startDecayLoop()
    startMoodDecayLoop()
  }
})
</script>

<template>
  <!-- 全屏房间模拟面板 -->
  <div class="room-sim-fullscreen" v-if="panelOpen">
    <!-- 顶部工具栏 -->
    <header class="room-sim-toolbar">
      <button class="toolbar-hamburger" @click="showHamburger = true">≡</button>
      <span class="toolbar-room-name">{{ activeRoom.name }}</span>
      <div class="toolbar-actions">
        <button class="toolbar-btn" :class="{ paused: state.time.isPaused }" @click="togglePause">
          {{ state.time.isPaused ? '▶️' : '⏸️' }}
        </button>
        <button class="toolbar-btn" @click="showImportPanel = true">📦</button>
      </div>
    </header>

    <!-- 房间渲染区（全屏） -->
    <div class="room-sim-canvas" ref="roomBoardRef" :style="roomBoardStyle">
      <!-- 背景图（如果有） -->
      <img
        v-if="activeRoom.backgroundImage"
        class="room-background"
        :src="activeRoom.backgroundImage"
        alt=""
      />

      <!-- Tile 层 -->
      <div
        v-for="cell in roomCellsSorted"
        :key="cell.id"
        class="room-sim-cell"
        :class="cell.type"
        :style="{ backgroundImage: `url(${getTileSpriteSrc(cell)})` }"
      ></div>

      <!-- 家具层 -->
      <div
        v-for="furniture in furnitureSortedByZ"
        :key="furniture.id"
        class="room-sim-furniture"
        :style="getFurnitureStyle(furniture)"
        :class="{ selected: state.selectedFurnitureId === furniture.id }"
        @pointerdown="startFurnitureDrag($event, furniture)"
        @click="selectFurniture(furniture)"
      >
        <img :src="getFurnitureSpriteSrc(furniture)" alt="" />
      </div>

      <!-- 小人层 -->
      <div
        v-for="pawn in pawnsSortedByY"
        :key="pawn.id"
        class="room-sim-pawn"
        :class="{ selected: state.selectedPawnId === pawn.id, moving: pawn.moving }"
        :style="getPawnStyle(pawn)"
        @click="selectPawn(pawn)"
      >
        <img :src="getPawnSpriteSrc(pawn)" alt="" />
        <div class="room-sim-pawn-indicator">
          <span class="room-sim-mood-dot" :class="getMoodClass(pawn)"></span>
        </div>
      </div>
    </div>

    <!-- 汉堡菜单 -->
    <HamburgerMenu
      :visible="showHamburger"
      :state="state"
      :activeRoomId="activeRoomId"
      :rooms="state.rooms"
      :pawns="state.pawns"
      @close="showHamburger = false"
      @select-room="handleSelectRoom"
      @add-room="handleAddRoom"
      @delete-room="handleDeleteRoom"
      @select-pawn="handleSelectPawnFromMenu"
      @add-pawn="handleAddPawn"
      @toggle-pause="togglePause"
      @show-import="showImportPanel = true"
      @close-panel="panelOpen = false"
    />

    <!-- 小人信息浮层 -->
    <PawnInfoOverlay
      :pawn="selectedPawn"
      :visible="showPawnOverlay"
      @close="showPawnOverlay = false; state.selectedPawnId = ''"
    />

    <!-- 导入家具面板 -->
    <FurnitureImportPanel
      v-if="showImportPanel"
      :room="activeRoom"
      @add-furniture="handleAddImportedFurniture"
      @close="showImportPanel = false"
    />

    <!-- 加载状态 -->
    <div v-if="loading" class="room-sim-loading">
      <span>加载中...</span>
    </div>
  </div>

  <!-- 未打开时的入口按钮 -->
  <div v-else class="room-sim-entry" @click="panelOpen = true">
    <span class="room-sim-entry-icon">🏠</span>
    <span class="room-sim-entry-text">房间模拟</span>
  </div>
</template>

<style scoped src="./styles/index.css"></style>

<style scoped>
/* 入口按钮 */
.room-sim-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  background: #2a2a32;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.room-sim-entry:hover {
  background: #3a3a42;
}

.room-sim-entry-icon {
  font-size: 24px;
}

.room-sim-entry-text {
  font-size: 12px;
  color: #aaa;
  margin-top: 4px;
}

/* 全屏布局 */
.room-sim-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #18181e;
  color: #eaeaea;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 顶部工具栏 */
.room-sim-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #2a2a32;
  border-bottom: 1px solid #3a3a42;
  flex-shrink: 0;
}

.toolbar-hamburger {
  background: transparent;
  border: none;
  color: #eaeaea;
  font-size: 24px;
  padding: 4px 8px;
  cursor: pointer;
}

.toolbar-room-name {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.toolbar-btn {
  background: #4a4a52;
  border: none;
  color: #eaeaea;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
}

.toolbar-btn.paused {
  background: #6a4a4a;
}

/* 房间渲染区全屏 */
.room-sim-canvas {
  flex: 1;
  display: grid;
  position: relative;
  background: #0a0a0e;
  overflow: auto;
  padding: 16px;
  margin: auto;
}

.room-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.7;
  z-index: 0;
}

/* 加载状态 */
.room-sim-loading {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(22, 22, 26, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #aaa;
  z-index: 2000;
}

/* 导入面板定位 */
.room-sim-fullscreen .furniture-import-panel {
  position: absolute;
  top: 50px;
  right: 10px;
  z-index: 1000;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

/* 移动端优化 */
@media (pointer: coarse) {
  .toolbar-hamburger {
    font-size: 28px;
    padding: 8px 12px;
  }

  .toolbar-btn {
    padding: 8px 16px;
    font-size: 18px;
  }

  .toolbar-room-name {
    font-size: 18px;
  }
}
</style>