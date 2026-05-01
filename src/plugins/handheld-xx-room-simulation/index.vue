<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { kvStorage } from '../../storage/index.js'
import { getActiveWorldBookId, getNormalizedBook } from '../../worldbook/worldBookStore.js'
import { resolveStorageScopeKey, resolveFurnitureLibraryKey } from './state/storageScope.js'
import { persistStateSnapshot, restoreStateSnapshot, parseStorageKey } from './state/persistence.js'
import { clearRoomSimData, isRoomSimSQLiteAvailable } from './state/roomSimRepo.js'
import { buildDefaultState, buildDefaultStateForCharacter, createDefaultPawn, buildDefaultRoomState } from './state/initialState.js'
import FurnitureImportPanel from './components/FurnitureImportPanel.vue'
import PawnSpriteImportPanel from './components/PawnSpriteImportPanel.vue'
import HamburgerMenu from './components/HamburgerMenu.vue'
import PawnInfoOverlay from './components/PawnInfoOverlay.vue'
import {
  ROOM_DEFAULT_WIDTH,
  ROOM_DEFAULT_HEIGHT,
  ROOM_CELL_SIZE,
  SPRITE_PIXEL_SIZE,
  SPRITE_GRID_SIZE,
  PAWN_SPRITE_DISPLAY_SIZE,
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
import { createRoomSpriteResolver, calculateFurnitureZ } from './render/roomSprites.js'
import { createPawnSpriteResolver } from './render/pawnSprites.js'
import { createRoomEngine } from './logic/room/roomEngine.js'
import { createPawnNeedsEngine } from './logic/pawn/pawnNeedsEngine.js'
import { createPawnMoodEngine } from './logic/pawn/pawnMoodEngine.js'
import { createPawnPathfindEngine } from './logic/pawn/pawnPathfind.js'
import { createMoodTriggerEngine } from './logic/pawn/moodTriggerEngine.js'
import { createLightCalculator } from './logic/room/lightCalculator.js'
import { createLightRenderer } from './render/lightRenderer.js'
import MoodRuleEditor from './components/MoodRuleEditor.vue'
import { resolveRoomPointerCell, buildRoomDragState } from './logic/room/roomInput.js'
import { isAndroid } from '../../utils/platform.js'
import { LIGHT_UPDATE_INTERVAL_MS } from './config/lightConstants.js'

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
const showPawnSpriteImport = ref(false)
const showPawnOverlay = ref(false)
const showFurnitureBar = ref(false)
const showCharacterSelect = ref(true) // 默认显示角色选择面板
const showDirectionControls = ref(false) // 长按角色后显示方向控制
const showMoodRuleEditor = ref(false) // 心情规则编辑面板

// 光照系统状态
const lightCanvasRef = ref(null)  // 光照 Canvas DOM 引用
const ambientLightValue = ref(1.0) // 当前环境光强度
const lightSources = ref([])      // 当前光源列表
const manualAmbientLight = ref(null) // 手动设置的环境光（null表示使用自动值）

// 长按角色检测
let pawnLongPressTimer = null
const PAWN_LONG_PRESS_DELAY = 400 // 长按400ms后显示方向控制

// 当前世界书数据（自己加载）
const currentWorldBook = ref(null)

// 当前选中的角色（USER 或 CHAR）
const selectedCharacterId = ref(null) // '__player__' 或 character.id

// 角色列表（从 worldBook 提取）
const characterList = computed(() => {
  const book = currentWorldBook.value
  if (!book) return []

  const list = []

  // USER（玩家）
  if (book.userProfile) {
    list.push({
      id: '__player__',
      name: book.userProfile.name || book.userProfile.nickname || '玩家',
      type: 'user',
      avatar: book.userProfile.portraits?.[0]?.filePath || null,
    })
  }

  // CHAR（角色）
  if (Array.isArray(book.characters)) {
    for (const char of book.characters) {
      list.push({
        id: char.id,
        name: char.name || char.nickname || '未知角色',
        type: 'character',
        avatar: char.portraits?.[0]?.filePath || char.smsAvatar || null,
      })
    }
  }

  return list
})

// 当前选中角色的信息
const selectedCharacter = computed(() => {
  return characterList.value.find(c => c.id === selectedCharacterId.value) || null
})

// 放置预览模式
const placementPreview = ref(null) // 待放置的家具数据（新增或长按已有家具）
const placementPreviewPosition = ref({ x: 0, y: 0 }) // 预览位置（格子坐标）
const placementPreviewValid = ref(true) // 预览位置是否可放置

// 长按家具相关变量
let furnitureLongPressTimer = null // 长按计时器
let furniturePointerStarted = false
let furniturePointerMoved = false
let furniturePointerStartPos = { x: 0, y: 0 }
let furnitureOriginalData = null // 长按家具的原始数据（用于恢复）
const LONG_PRESS_DELAY = 350 // 长按判定时间（毫秒）

// 编辑模式（只有编辑模式下才能放置/选中/拖拽家具）
const editMode = ref(false)

// 长按移动动画帧ID
const moveAnimationId = ref(null)
// 当前移动方向
const currentMoveDirection = ref(null)
// 小人像素位置（用于平滑动画，不用响应式）
let pawnPixelX = 0
let pawnPixelY = 0
// 选中的小人 DOM 元素
const selectedPawnElRef = ref(null)

// 安全的 ref 设置函数（处理组件卸载时 Vue 传入 null 的情况）
const setSelectedPawnEl = (el) => {
  if (isUnmounted.value) return
  selectedPawnElRef.value = el
}

// 自定义家具库（每个角色独立）
const customFurnitureLibrary = ref([])

// 动态画布尺寸（用于计算格子数量）
// 默认值：假设全屏显示，大约可以显示 12x8 格（每格64px）
const canvasSize = ref({ width: 768, height: 512 })
const dynamicGridWidth = computed(() => Math.max(1, Math.floor(canvasSize.value.width / ROOM_CELL_SIZE)))
const dynamicGridHeight = computed(() => Math.max(1, Math.floor(canvasSize.value.height / ROOM_CELL_SIZE)))

const state = ref(buildDefaultState())
const isUnmounted = ref(false)

// ========== 存储键（包含角色ID） ==========

const storageScopeKey = computed(() => {
  const worldBookId = currentWorldBook.value?.id || 'default_world_book'
  const charId = selectedCharacterId.value || '__player__'
  return `room-sim-${worldBookId}-${charId}`
})

// 当前角色的房间（每个角色只有一个房间）
const activeRoom = computed(() => {
  return state.value.rooms?.[0] || buildDefaultRoomState()
})

// 获取或创建房间（用于写入操作）
const getOrCreateRoom = () => {
  if (!state.value.rooms || state.value.rooms.length === 0) {
    state.value.rooms = [buildDefaultRoomState()]
  }
  return state.value.rooms[0]
}

// ========== 引擎实例 ==========

const roomEngine = createRoomEngine()
const needsEngine = createPawnNeedsEngine()
const moodEngine = createPawnMoodEngine()
const pathfindEngine = createPawnPathfindEngine()
const roomSpriteResolver = createRoomSpriteResolver()

// 心情触发引擎（依赖 moodEngine）
const moodTriggerEngine = createMoodTriggerEngine({ moodEngine })

// 光照系统
const lightCalculator = createLightCalculator({ cellSize: ROOM_CELL_SIZE })
const lightRenderer = createLightRenderer({ cellSize: ROOM_CELL_SIZE })

// ========== 游戏循环变量（在引擎创建前定义） ==========

let simulationLoopId = null
let decayLoopId = null
let moodDecayLoopId = null
let lightUpdateLoopId = null  // 光照更新循环
const frameTick = ref(0)

const pawnSpriteResolver = createPawnSpriteResolver({
  getFrameTick: () => frameTick.value,
})

const startSimulationLoop = () => {
  if (simulationLoopId) return
  simulationLoopId = setInterval(() => {
    if (isUnmounted.value || state.value.time.isPaused) return
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
    if (isUnmounted.value || state.value.time.isPaused) return
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
    if (isUnmounted.value || state.value.time.isPaused) return
    runMoodUpdate()
  }, MOOD_DECAY_INTERVAL_MS)
}

const stopMoodDecayLoop = () => {
  if (moodDecayLoopId) {
    clearInterval(moodDecayLoopId)
    moodDecayLoopId = null
  }
}

const startLightUpdateLoop = () => {
  if (lightUpdateLoopId) return
  lightUpdateLoopId = setInterval(() => {
    if (isUnmounted.value) return
    updateLighting()
  }, LIGHT_UPDATE_INTERVAL_MS)
}

const stopLightUpdateLoop = () => {
  if (lightUpdateLoopId) {
    clearInterval(lightUpdateLoopId)
    lightUpdateLoopId = null
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

  // 更新帧计数前检查是否已卸载
  if (isUnmounted.value) return
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

    // 评估心情触发规则
    const context = {
      timePhase: s.time.dayPhase,
      lightLevel: pawnRoom?.lightLevel || 1,
    }
    moodTriggerEngine.evaluateRules(pawn, context)
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

  // 更新环境光强度（平滑过渡）
  ambientLightValue.value = lightCalculator.getAmbientLightForHour(hour)
}

// ========== 光照更新 ==========

const updateLighting = () => {
  if (isUnmounted.value) {
    console.log('[Lighting] updateLighting skipped: unmounted')
    return
  }

  const room = activeRoom.value
  if (!room) {
    console.log('[Lighting] updateLighting skipped: no room')
    return
  }

  // 使用手动值或自动计算值
  if (manualAmbientLight.value !== null) {
    ambientLightValue.value = manualAmbientLight.value
  } else {
    const hour = state.value.time.hourOfDay
    ambientLightValue.value = lightCalculator.getAmbientLightForHour(hour)
  }

  console.log('[Lighting] ambientLight:', ambientLightValue.value, 'manual:', manualAmbientLight.value)

  // 提取光源
  lightSources.value = lightCalculator.extractLightSources(room)
  console.log('[Lighting] lightSources count:', lightSources.value.length)
  if (lightSources.value.length > 0) {
    console.log('[Lighting] lightSources:', lightSources.value.map(s => ({ id: s.id, x: s.x, y: s.y, radius: s.radius, pixelX: s.pixelX, pixelY: s.pixelY })))
  }

  // 检查家具是否有 lightSource
  const furnitureWithLight = room.furniture?.filter(f => f.lightSource?.enabled) || []
  console.log('[Lighting] furniture with light:', furnitureWithLight.length, furnitureWithLight.map(f => ({ id: f.id, name: f.name, lightSource: f.lightSource })))

  // 使用实际画布尺寸（动态网格 * 格子大小）
  const canvasWidth = dynamicGridWidth.value * ROOM_CELL_SIZE
  const canvasHeight = dynamicGridHeight.value * ROOM_CELL_SIZE
  console.log('[Lighting] canvas size:', canvasWidth, 'x', canvasHeight, 'grid:', dynamicGridWidth.value, 'x', dynamicGridHeight.value)

  // 渲染光照遮罩
  const canvas = lightRenderer.renderLightMask(
    room,
    lightSources.value,
    ambientLightValue.value,
    Date.now(),
    { canvasWidth, canvasHeight }
  )

  console.log('[Lighting] canvas created:', canvas ? `${canvas.width}x${canvas.height}` : 'null')

  // 将 Canvas 添加到容器
  if (canvas && lightCanvasRef.value) {
    const container = lightCanvasRef.value
    console.log('[Lighting] container:', container ? `${container.clientWidth}x${container.clientHeight}` : 'null')
    // 如果容器中没有 Canvas 或者 Canvas 变了，重新添加
    if (container.children.length === 0 || container.children[0] !== canvas) {
      container.innerHTML = ''
      container.appendChild(canvas)
      console.log('[Lighting] canvas appended to container')
    }
  } else {
    console.log('[Lighting] canvas or container null - canvas:', !!canvas, 'container:', !!lightCanvasRef.value)
  }
}

// 手动调整环境光
const handleAdjustAmbientLight = (value) => {
  manualAmbientLight.value = value
  ambientLightValue.value = value
  updateLighting()
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

// ========== 对话气泡 ==========

// 预设的对话内容（根据心情/需求/活动）
const SPEECH_BUBBLE_TEMPLATES = {
  // 心情相关
  veryHappy: ['好开心！', '今天真棒！', '太好了！', '心情超好~'],
  happy: ['还不错', '挺满意的', '今天还行'],
  normal: ['嗯...', '没什么特别的', '还行吧'],
  unhappy: ['有点烦...', '不太开心', '唉...'],
  breakdown: ['我受不了了！', '太难了...', '崩溃了...'],

  // 需求相关
  hungry: ['肚子饿了...', '想吃东西', '好饿啊'],
  tired: ['困了...', '想睡觉', '好累'],
  bored: ['好无聊', '想玩点什么', '没事做...'],
  lonely: ['想找人聊天', '好孤单', '有人吗？'],

  // 活动相关
  working: ['努力工作中', '正在忙', '加油！'],
  sleeping: ['好困...', 'Zzz...', '正在休息'],
  eating: ['好吃！', '正在吃', '补充能量'],
  socializing: ['聊得开心~', '哈哈', '真有意思'],

  // 环境相关
  crowded: ['这里太挤了', '人好多', '有点拥挤'],
  beautiful: ['这里真漂亮！', '好喜欢这个房间', '布置得不错'],
  dark: ['有点暗...', '需要更多光', '看不清'],
}

// 显示对话气泡
const showSpeechBubble = (pawnId, text, duration = 3000) => {
  const pawn = state.value.pawns.find(p => p.id === pawnId)
  if (!pawn) return

  // 设置气泡
  pawn.speechBubble = {
    text,
    startTime: Date.now(),
    popAnimation: true, // 弹出动画
  }

  // 移除弹出动画标记（100ms后）
  setTimeout(() => {
    if (isUnmounted.value) return
    if (pawn.speechBubble) {
      pawn.speechBubble.popAnimation = false
    }
  }, 100)

  // 自动清除（duration后）
  setTimeout(() => {
    if (isUnmounted.value) return
    if (pawn.speechBubble && pawn.speechBubble.text === text) {
      pawn.speechBubble = null
    }
  }, duration)
}

// 根据状态自动显示对话
const showAutoSpeechBubble = (pawnId) => {
  const pawn = state.value.pawns.find(p => p.id === pawnId)
  if (!pawn) return

  // 如果已有气泡，不重复显示
  if (pawn.speechBubble) return

  // 根据心情选择对话
  const moodValue = pawn.mood?.value || 50
  let moodCategory = 'normal'
  if (moodValue >= 80) moodCategory = 'veryHappy'
  else if (moodValue >= 60) moodCategory = 'happy'
  else if (moodValue >= 40) moodCategory = 'normal'
  else if (moodValue >= 20) moodCategory = 'unhappy'
  else moodCategory = 'breakdown'

  // 根据活动选择对话（优先）
  let category = moodCategory
  if (pawn.currentActivity === 'working') category = 'working'
  else if (pawn.currentActivity === 'sleeping') category = 'sleeping'
  else if (pawn.currentActivity === 'eating') category = 'eating'
  else if (pawn.currentActivity === 'socializing') category = 'socializing'

  // 检查紧急需求
  const needs = pawn.needs || {}
  for (const [needType, need] of Object.entries(needs)) {
    if (need.value <= need.critical) {
      category = needType // hungry, tired, etc.
      break
    }
  }

  // 从模板中随机选择
  const templates = SPEECH_BUBBLE_TEMPLATES[category] || SPEECH_BUBBLE_TEMPLATES.normal
  const randomText = templates[Math.floor(Math.random() * templates.length)]

  showSpeechBubble(pawnId, randomText, 2000 + Math.random() * 2000)
}

// 定期触发随机对话
let speechBubbleTimer = null
const startSpeechBubbleLoop = () => {
  if (speechBubbleTimer) return

  // 编辑模式下立即让所有小人显示气泡
  if (editMode.value) {
    const pawns = state.value.pawns
    for (const pawn of pawns) {
      showAutoSpeechBubble(pawn.id)
    }
  }

  speechBubbleTimer = setInterval(() => {
    if (isUnmounted.value) return

    // 编辑模式下持续显示（暂停也显示）
    if (editMode.value) {
      const pawns = state.value.pawns
      if (pawns.length > 0) {
        // 随机选一个小人更新对话
        const randomPawn = pawns[Math.floor(Math.random() * pawns.length)]
        showAutoSpeechBubble(randomPawn.id)
      }
    } else if (!state.value.time.isPaused) {
      // 非编辑模式：正常逻辑
      const pawns = state.value.pawns
      if (pawns.length > 0 && Math.random() < 0.3) {
        const randomPawn = pawns[Math.floor(Math.random() * pawns.length)]
        showAutoSpeechBubble(randomPawn.id)
      }
    }
  }, 2000) // 缩短到2秒
}

const stopSpeechBubbleLoop = () => {
  if (speechBubbleTimer) {
    clearInterval(speechBubbleTimer)
    speechBubbleTimer = null
  }
}

// ========== 持久化 ==========

let persistTimer = null

const schedulePersist = () => {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    if (isUnmounted.value) return
    persistTimer = null
    void persistStateSnapshot({
      storage: kvStorage,
      key: storageScopeKey.value,
      state: state.value,
      normalizeState: normalizeState,
    })
  }, 200)
}

// 强制立即保存（手动保存按钮调用）
const forceSaveNow = async () => {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }

  // 合并家具库到 state（确保保存）
  state.value.customFurnitureLibrary = customFurnitureLibrary.value

  // 调试：显示已放置家具数量
  const placedFurniture = state.value.rooms?.[0]?.furniture || []
  console.log('[RoomSimulation] ForceSaveNow - placed furniture:', placedFurniture.length, 'library:', customFurnitureLibrary.value.length)

  const result = await persistStateSnapshot({
    storage: kvStorage,
    key: storageScopeKey.value,
    state: state.value,
    normalizeState: normalizeState,
  })
  if (isUnmounted.value) return
  if (result.ok) {
    addLog('✅ 已保存房间数据')
    console.log('[RoomSimulation] Force saved:', storageScopeKey.value, 'placed:', placedFurniture.length)
  } else {
    addLog('⚠️ 保存失败: ' + result.error)
    console.error('[RoomSimulation] Force save failed:', result.error)
  }
}

// 重置房间（清除存储数据，恢复默认状态，但保留世界书家具库）
const handleResetRoom = async () => {
  if (isUnmounted.value) return

  // 解析 key 获取 worldBookId 和 characterId
  const { worldBookId, characterId } = parseStorageKey(storageScopeKey.value)

  // 清除 SQLite 房间数据（只清除该角色的房间，保留家具库）
  if (isRoomSimSQLiteAvailable()) {
    try {
      await clearRoomSimData(worldBookId, characterId)
      console.log('[RoomSimulation] Cleared SQLite room data:', worldBookId, characterId)
    } catch (e) {
      console.error('[RoomSimulation] Clear SQLite error:', e)
    }
  }

  // 清除 kvStorage 房间数据（不清除家具库）
  try {
    await kvStorage.remove(storageScopeKey.value)
    console.log('[RoomSimulation] Removed room storage key:', storageScopeKey.value)
  } catch (e) {
    console.error('[RoomSimulation] Remove storage error:', e)
  }

  // 恢复默认状态
  const newState = buildDefaultState()

  // 保留家具库（从当前状态或重新加载）
  newState.customFurnitureLibrary = customFurnitureLibrary.value

  state.value = newState

  addLog('🔄 房间已重置（家具库已保留）')
  console.log('[RoomSimulation] Room reset to default state, furniture library preserved')
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
    customFurnitureLibrary: Array.isArray(raw.customFurnitureLibrary) ? raw.customFurnitureLibrary : [],
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
  const normalized = roomEngine.normalizeRoomMap(raw)
  // 保留所有已保存的家具，不再过滤
  return normalized
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
    customSprites: raw.customSprites || null,
    pixelX: raw.pixelX !== undefined ? raw.pixelX : undefined,
    pixelY: raw.pixelY !== undefined ? raw.pixelY : undefined,
    speechBubble: null, // 对话气泡（运行时数据，不持久化）
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
  const cellSize = ROOM_CELL_SIZE
  const gridW = dynamicGridWidth.value
  const gridH = dynamicGridHeight.value
  return {
    width: '100%',
    height: '100%',
    gridTemplateColumns: `repeat(${gridW}, ${cellSize}px)`,
    gridTemplateRows: `repeat(${gridH}, ${cellSize}px)`,
  }
})

// 动态生成 tiles（根据画布尺寸）
const dynamicTiles = computed(() => {
  const gridW = dynamicGridWidth.value
  const gridH = dynamicGridHeight.value
  const tiles = []

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      // 所有格子都是地板，墙由玩家导入的家具决定
      tiles.push({
        id: `tile-${x}-${y}`,
        x,
        y,
        type: 'floor',
      })
    }
  }

  return tiles
})

const roomCellsSorted = computed(() => {
  return dynamicTiles.value.slice().sort((a, b) => a.y - b.y || a.x - b.x)
})

const furnitureSortedByZ = computed(() => {
  const room = activeRoom.value
  return room.furniture.slice().sort((a, b) => a.z - b.z)
})

const pawnsInActiveRoom = computed(() => {
  // 每个角色只有一个房间，返回所有小人
  return state.value.pawns || []
})

const pawnsSortedByY = computed(() => {
  return pawnsInActiveRoom.value.slice().sort((a, b) => a.position.y - b.position.y)
})

// ========== 旋转后尺寸计算（RimWorld风格） ==========

// 根据旋转角度获取实际占用的宽高（旋转后宽高互换）
const getEffectiveSize = (furniture) => {
  const rotation = furniture.rotation || 0
  // 90度或270度时宽高互换
  if (rotation === 90 || rotation === 270) {
    return { width: furniture.height, height: furniture.width }
  }
  return { width: furniture.width, height: furniture.height }
}

const getTileSpriteSrc = (tile) => {
  return roomSpriteResolver.getTileSpriteSrc(tile)
}

const getFurnitureSpriteSrc = (furniture) => {
  return roomSpriteResolver.getFurnitureSpriteSrc(furniture)
}

const getPawnSpriteSrc = (pawn) => {
  return pawnSpriteResolver.getPawnSpriteSrc(pawn)
}

// 家具样式（RimWorld风格：旋转改变实际占用格子）
const getFurnitureStyle = (furniture) => {
  const cellSize = ROOM_CELL_SIZE
  const effective = getEffectiveSize(furniture)

  return {
    left: `${furniture.x * cellSize}px`,
    top: `${furniture.y * cellSize}px`,
    width: `${effective.width * cellSize}px`,
    height: `${effective.height * cellSize}px`,
    zIndex: furniture.z || 10,
  }
}

// 家具精灵的旋转（仅图片旋转，不影响占用格子）
const getFurnitureSpriteTransform = (furniture) => {
  const rotation = furniture.rotation || 0
  return rotation === 0 ? '' : `rotate(${rotation}deg)`
}

const getPawnStyle = (pawn) => {
  const cellSize = ROOM_CELL_SIZE
  const spriteSize = PAWN_SPRITE_DISPLAY_SIZE
  const offset = (cellSize - spriteSize) / 2

  // 优先使用保存的像素位置（实现自由移动，不对齐格子）
  const pixelX = pawn.pixelX !== undefined ? pawn.pixelX : pawn.position.x * cellSize
  const pixelY = pawn.pixelY !== undefined ? pawn.pixelY : pawn.position.y * cellSize

  return {
    left: `${pixelX + offset}px`,
    top: `${pixelY + offset}px`,
    zIndex: 200 + Math.floor(pixelY / cellSize),
    // 不再翻转整个容器，只翻转图片
  }
}

// 小人图片的翻转样式（只翻转图片，不影响气泡）
// facing 有专门的 sprite，不需要翻转

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

// ========== 房间管理（已简化，每个角色只有一个房间） ==========

// 清除选择
const clearSelection = () => {
  state.value.selectedFurnitureId = ''
  state.value.selectedPawnId = ''
  showPawnOverlay.value = false
}

const handleSelectPawnFromMenu = (pawnId) => {
  const pawn = state.value.pawns.find(p => p.id === pawnId)
  if (!pawn) return

  state.value.selectedPawnId = pawnId
  showPawnOverlay.value = true
  showHamburger.value = false
}

// ========== 家具长按重新放置（RimWorld风格） ==========

const roomBoardRef = ref(null)

// 家具指针按下
const handleFurniturePointerDown = (event, furniture) => {
  if (!editMode.value) return
  event.stopPropagation()

  furniturePointerStarted = true
  furniturePointerMoved = false
  furniturePointerStartPos = { x: event.clientX, y: event.clientY }

  // 设置长按计时器
  furnitureLongPressTimer = setTimeout(() => {
    if (!furniturePointerMoved && furniturePointerStarted) {
      // 长按触发：转为重新放置模式（像从家具栏选中一样）
      enterFurnitureRelocateMode(furniture, event)
    }
  }, LONG_PRESS_DELAY)
}

// 家具指针移动
const handleFurniturePointerMove = (event, furniture) => {
  if (!furniturePointerStarted) return

  // 检测是否移动了足够距离（取消长按）
  const distance = Math.sqrt(
    Math.pow(event.clientX - furniturePointerStartPos.x, 2) +
    Math.pow(event.clientY - furniturePointerStartPos.y, 2)
  )

  if (distance > 10) {
    furniturePointerMoved = true
    if (furnitureLongPressTimer) {
      clearTimeout(furnitureLongPressTimer)
      furnitureLongPressTimer = null
    }
  }

  // 如果在重新放置模式，更新预览位置
  if (placementPreview.value && furnitureOriginalData?.id === furniture.id) {
    updatePlacementPreviewPosition(event)
  }
}

// 家具指针抬起
const handleFurniturePointerUp = (event, furniture) => {
  furniturePointerStarted = false

  if (furnitureLongPressTimer) {
    clearTimeout(furnitureLongPressTimer)
    furnitureLongPressTimer = null
  }

  // 如果在重新放置模式，确认放置
  if (placementPreview.value && furnitureOriginalData?.id === furniture.id) {
    confirmFurnitureRelocate()
  }
}

// 家具指针取消
const handleFurniturePointerCancel = (event, furniture) => {
  furniturePointerStarted = false
  if (furnitureLongPressTimer) {
    clearTimeout(furnitureLongPressTimer)
    furnitureLongPressTimer = null
  }

  // 取消重新放置，恢复原位置
  if (placementPreview.value && furnitureOriginalData?.id === furniture.id) {
    cancelFurnitureRelocate()
  }
}

// 进入家具重新放置模式（长按触发，相当于从家具栏选中）
const enterFurnitureRelocateMode = (furniture, event) => {
  // 保存原始数据（用于恢复）
  furnitureOriginalData = {
    id: furniture.id,
    name: furniture.name,
    x: furniture.x,
    y: furniture.y,
    rotation: furniture.rotation || 0,
    width: furniture.width,
    height: furniture.height,
    z: furniture.z,
    customSprite: furniture.customSprite,
    spriteSpec: furniture.spriteSpec,
    kind: furniture.kind,
    interactable: furniture.interactable,
    interactionType: furniture.interactionType,
    needsSatisfied: furniture.needsSatisfied,
  }

  // 从房间中移除该家具（临时）
  const room = getOrCreateRoom()
  const index = room.furniture.findIndex(f => f.id === furniture.id)
  if (index >= 0) {
    room.furniture.splice(index, 1)
  }

  // 转为放置预览模式（就像从家具栏选中）
  placementPreview.value = {
    ...furniture,
    // 不保留 id，放置时会生成新 id
  }

  // 立即更新预览位置
  updatePlacementPreviewPosition(event)
  addLog(`移动家具: ${furniture.name}`)
}

// 更新放置预览位置（跟随指针）
const updatePlacementPreviewPosition = (event) => {
  if (!placementPreview.value) return

  const boardEl = roomBoardRef.value
  if (!boardEl) return

  const rect = boardEl.getBoundingClientRect()
  const relX = event.clientX - rect.left
  const relY = event.clientY - rect.top

  const x = Math.floor(relX / ROOM_CELL_SIZE)
  const y = Math.floor(relY / ROOM_CELL_SIZE)

  const effective = getEffectiveSize(placementPreview.value)
  const maxX = dynamicGridWidth.value - effective.width
  const maxY = dynamicGridHeight.value - effective.height
  const validX = Math.max(0, Math.min(maxX, x))
  const validY = Math.max(0, Math.min(maxY, y))

  placementPreviewPosition.value = { x: validX, y: validY }

  // 检查位置是否有效
  const room = getOrCreateRoom()
  const previewZ = placementPreview.value.z ?? calculateFurnitureZ(placementPreview.value)
  const hasOverlap = room.furniture.some(f => {
    const existingZ = f.z ?? calculateFurnitureZ(f)
    const existingEffective = getEffectiveSize(f)
    // z值差距大于20时允许重叠
    if (Math.abs(previewZ - existingZ) >= 20) return false
    return (
      validX < f.x + existingEffective.width &&
      validX + effective.width > f.x &&
      validY < f.y + existingEffective.height &&
      validY + effective.height > f.y
    )
  })

  placementPreviewValid.value = !hasOverlap
}

// 确认家具重新放置（松手）
const confirmFurnitureRelocate = () => {
  if (!placementPreview.value || !furnitureOriginalData) return

  if (placementPreviewValid.value) {
    // 位置有效，放置到新位置
    const room = getOrCreateRoom()
    const effective = getEffectiveSize(placementPreview.value)

    // 创建新家具实例
    const newFurniture = {
      ...placementPreview.value,
      id: furnitureOriginalData.id, // 保持原 id
      x: placementPreviewPosition.value.x,
      y: placementPreviewPosition.value.y,
    }

    // 确保 z 值已计算
    if (newFurniture.z === null || newFurniture.z === undefined) {
      newFurniture.z = calculateFurnitureZ(newFurniture)
    }

    room.furniture.push(newFurniture)
    addLog(`已移动: ${newFurniture.name}`)
    schedulePersist()
  } else {
    // 位置无效，恢复原位置
    restoreFurnitureOriginalPosition()
    addLog('位置有冲突，恢复原位置')
  }

  // 清除预览模式和原始数据
  placementPreview.value = null
  furnitureOriginalData = null
}

// 取消家具重新放置（恢复原位置）
const cancelFurnitureRelocate = () => {
  restoreFurnitureOriginalPosition()
  placementPreview.value = null
  furnitureOriginalData = null
}

// 恢复家具原位置
const restoreFurnitureOriginalPosition = () => {
  if (!furnitureOriginalData) return

  const room = getOrCreateRoom()
  // 恢复原家具
  room.furniture.push({
    id: furnitureOriginalData.id,
    name: furnitureOriginalData.name,
    x: furnitureOriginalData.x,
    y: furnitureOriginalData.y,
    rotation: furnitureOriginalData.rotation,
    width: furnitureOriginalData.width,
    height: furnitureOriginalData.height,
    z: furnitureOriginalData.z,
    customSprite: furnitureOriginalData.customSprite,
    spriteSpec: furnitureOriginalData.spriteSpec,
    kind: furnitureOriginalData.kind,
    interactable: furnitureOriginalData.interactable,
    interactionType: furnitureOriginalData.interactionType,
    needsSatisfied: furnitureOriginalData.needsSatisfied,
  })
}

// 选中的家具
const selectedFurniture = computed(() => {
  const id = state.value.selectedFurnitureId
  if (!id) return null
  const room = state.value.rooms?.[0]
  return room?.furniture?.find(f => f.id === id) || null
})

// 旋转选中的家具（每次旋转90度）
const rotateSelectedFurniture = () => {
  const furnitureId = state.value.selectedFurnitureId
  if (!furnitureId) return

  const room = getOrCreateRoom()
  const furniture = room.furniture.find(f => f.id === furnitureId)
  if (!furniture) return

  // 旋转：0 -> 90 -> 180 -> 270 -> 0
  const currentRotation = furniture.rotation || 0
  furniture.rotation = (currentRotation + 90) % 360

  addLog(`旋转家具: ${furniture.name} (${furniture.rotation}°)`)
  schedulePersist()
}

// 旋转放置预览的家具
const rotatePreviewFurniture = () => {
  if (!placementPreview.value) return

  const currentRotation = placementPreview.value.rotation || 0
  placementPreview.value.rotation = (currentRotation + 90) % 360
}

const deleteSelectedFurniture = () => {
  const furnitureId = state.value.selectedFurnitureId
  if (!furnitureId) return

  const room = getOrCreateRoom()
  const index = room.furniture.findIndex(f => f.id === furnitureId)
  if (index < 0) return

  const deleted = room.furniture[index]
  room.furniture.splice(index, 1)
  state.value.selectedFurnitureId = ''

  addLog(`已删除家具: ${deleted.name}`)
  schedulePersist()
}

// ========== 导入家具 ==========

const handleAddImportedFurniture = (furniture) => {
  const room = getOrCreateRoom()
  if (room.furniture.length >= MAX_ROOM_FURNITURE_ITEMS) {
    addLog('家具数量已达上限')
    return
  }
  room.furniture.push(furniture)
  addLog(`已导入家具: ${furniture.name} (${furniture.width}x${furniture.height})`)
  schedulePersist()
}

// ========== 放置预览模式 ==========

const enterPlacementMode = (furniture) => {
  placementPreview.value = furniture
  editMode.value = true // 自动进入编辑模式
  showFurnitureBar.value = false
}

const cancelPlacementMode = () => {
  placementPreview.value = null
}

const handleCellClickForPlacement = (cellX, cellY) => {
  if (!placementPreview.value) return

  const room = getOrCreateRoom()
  const furniture = placementPreview.value

  // 使用旋转后的实际尺寸（RimWorld风格）
  const effective = getEffectiveSize(furniture)

  // 使用动态格子边界
  const maxX = dynamicGridWidth.value - effective.width
  const maxY = dynamicGridHeight.value - effective.height
  const validX = Math.max(0, Math.min(maxX, cellX))
  const validY = Math.max(0, Math.min(maxY, cellY))

  // 检查是否与其他家具重叠（使用旋转后的尺寸）
  const newZ = furniture.z ?? calculateFurnitureZ(furniture)
  const hasOverlap = room.furniture.some(f => {
    const existingZ = f.z ?? calculateFurnitureZ(f)
    const existingEffective = getEffectiveSize(f)
    // z值差距大于20时允许重叠（比如地毯上放椅子）
    if (Math.abs(newZ - existingZ) >= 20) return false
    // 同层级或相近层级检查碰撞（使用实际占用尺寸）
    return (
      validX < f.x + existingEffective.width &&
      validX + effective.width > f.x &&
      validY < f.y + existingEffective.height &&
      validY + effective.height > f.y
    )
  })

  if (hasOverlap) {
    addLog('该位置已有家具')
    return
  }

  // 创建家具实例并放置
  const newFurniture = {
    ...furniture,
    id: `furn-${Date.now().toString(36)}`,
    x: validX,
    y: validY,
  }

  // 确保 z 值已计算
  if (newFurniture.z === null || newFurniture.z === undefined) {
    newFurniture.z = calculateFurnitureZ(newFurniture)
  }

  room.furniture.push(newFurniture)
  addLog(`已放置家具: ${newFurniture.name} (${effective.width}x${effective.height})`)
  schedulePersist()

  // 保持放置预览，允许连续放置（只有ESC或切换家具才取消）
}

const handleCanvasClick = (event) => {
  // 只在编辑模式+有待放置家具时生效
  if (!editMode.value || !placementPreview.value) return

  const boardEl = roomBoardRef.value
  if (!boardEl) return

  const rect = boardEl.getBoundingClientRect()

  // 计算相对于画布的坐标
  const relX = event.clientX - rect.left
  const relY = event.clientY - rect.top

  const x = Math.floor(relX / ROOM_CELL_SIZE)
  const y = Math.floor(relY / ROOM_CELL_SIZE)

  handleCellClickForPlacement(x, y)
}

// 鼠标移动时更新预览位置
const handleCanvasMouseMove = (event) => {
  if (!editMode.value || !placementPreview.value) return

  const boardEl = roomBoardRef.value
  if (!boardEl) return

  const rect = boardEl.getBoundingClientRect()
  const relX = event.clientX - rect.left
  const relY = event.clientY - rect.top

  const x = Math.floor(relX / ROOM_CELL_SIZE)
  const y = Math.floor(relY / ROOM_CELL_SIZE)

  // 计算预览位置和有效性
  const effective = getEffectiveSize(placementPreview.value)
  const maxX = dynamicGridWidth.value - effective.width
  const maxY = dynamicGridHeight.value - effective.height
  const validX = Math.max(0, Math.min(maxX, x))
  const validY = Math.max(0, Math.min(maxY, y))

  placementPreviewPosition.value = { x: validX, y: validY }

  // 检查是否可放置
  const room = getOrCreateRoom()
  const newZ = placementPreview.value.z ?? calculateFurnitureZ(placementPreview.value)
  const hasOverlap = room.furniture.some(f => {
    const existingZ = f.z ?? calculateFurnitureZ(f)
    const existingEffective = getEffectiveSize(f)
    if (Math.abs(newZ - existingZ) >= 20) return false
    return (
      validX < f.x + existingEffective.width &&
      validX + effective.width > f.x &&
      validY < f.y + existingEffective.height &&
      validY + effective.height > f.y
    )
  })

  placementPreviewValid.value = !hasOverlap
}

// 鼠标松开时放置（PC端）
const handleCanvasMouseUp = (event) => {
  if (!editMode.value || !placementPreview.value) return

  // 如果预览有效（全绿色），自动放置
  if (placementPreviewValid.value) {
    const { x, y } = placementPreviewPosition.value
    placeFurnitureAt(x, y)
  } else {
    addLog('位置有冲突，无法放置')
  }
}

// 触摸事件处理（Android端 - 拖动松手放置）
let touchStartPos = { x: 0, y: 0 }
let hasTouchMoved = false

const handleCanvasTouchStart = (event) => {
  if (!editMode.value || !placementPreview.value) return

  const touch = event.touches[0]
  const boardEl = roomBoardRef.value
  if (!boardEl) return

  const rect = boardEl.getBoundingClientRect()
  touchStartPos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
  hasTouchMoved = false

  // 立即更新预览位置
  updatePreviewFromTouch(touch, boardEl)
}

const handleCanvasTouchMove = (event) => {
  if (!editMode.value || !placementPreview.value) return

  const touch = event.touches[0]
  const boardEl = roomBoardRef.value
  if (!boardEl) return

  // 判断是否移动了足够距离
  const rect = boardEl.getBoundingClientRect()
  const currentX = touch.clientX - rect.left
  const currentY = touch.clientY - rect.top
  const distance = Math.sqrt(
    Math.pow(currentX - touchStartPos.x, 2) +
    Math.pow(currentY - touchStartPos.y, 2)
  )

  // 移动超过半个格子才算真正移动
  if (distance > ROOM_CELL_SIZE / 2) {
    hasTouchMoved = true
  }

  updatePreviewFromTouch(touch, boardEl)
}

const updatePreviewFromTouch = (touch, boardEl) => {
  const rect = boardEl.getBoundingClientRect()
  const relX = touch.clientX - rect.left
  const relY = touch.clientY - rect.top

  const x = Math.floor(relX / ROOM_CELL_SIZE)
  const y = Math.floor(relY / ROOM_CELL_SIZE)

  const effective = getEffectiveSize(placementPreview.value)
  const maxX = dynamicGridWidth.value - effective.width
  const maxY = dynamicGridHeight.value - effective.height
  const validX = Math.max(0, Math.min(maxX, x))
  const validY = Math.max(0, Math.min(maxY, y))

  placementPreviewPosition.value = { x: validX, y: validY }

  // 检查是否可放置
  const room = getOrCreateRoom()
  const newZ = placementPreview.value.z ?? calculateFurnitureZ(placementPreview.value)
  const hasOverlap = room.furniture.some(f => {
    const existingZ = f.z ?? calculateFurnitureZ(f)
    const existingEffective = getEffectiveSize(f)
    if (Math.abs(newZ - existingZ) >= 20) return false
    return (
      validX < f.x + existingEffective.width &&
      validX + effective.width > f.x &&
      validY < f.y + existingEffective.height &&
      validY + effective.height > f.y
    )
  })

  placementPreviewValid.value = !hasOverlap
}

const handleCanvasTouchEnd = (event) => {
  if (!editMode.value || !placementPreview.value) return

  // 松手时：如果预览有效（全绿色），自动放置
  if (placementPreviewValid.value) {
    const { x, y } = placementPreviewPosition.value
    placeFurnitureAt(x, y)
  } else {
    // 位置无效，提示用户
    addLog('位置有冲突，无法放置')
  }
}

// 实际放置家具
const placeFurnitureAt = (x, y) => {
  if (!placementPreview.value) return

  const room = getOrCreateRoom()
  const effective = getEffectiveSize(placementPreview.value)

  // 创建家具实例
  const newFurniture = {
    ...placementPreview.value,
    id: `furn-${Date.now().toString(36)}`,
    x,
    y,
  }

  // 确保 z 值已计算
  if (newFurniture.z === null || newFurniture.z === undefined) {
    newFurniture.z = calculateFurnitureZ(newFurniture)
  }

  console.log('[placeFurnitureAt] placing furniture:', newFurniture.id, newFurniture.name, 'lightSource:', newFurniture.lightSource)

  room.furniture.push(newFurniture)
  addLog(`已放置: ${newFurniture.name} (${effective.width}x${effective.height})`)
  schedulePersist()
}

// 计算预览占用的格子列表（用于渲染预览框）
const previewOccupiedCells = computed(() => {
  if (!placementPreview.value) return []

  const effective = getEffectiveSize(placementPreview.value)
  const { x, y } = placementPreviewPosition.value
  const cells = []

  for (let dy = 0; dy < effective.height; dy++) {
    for (let dx = 0; dx < effective.width; dx++) {
      cells.push({ x: x + dx, y: y + dy })
    }
  }

  return cells
})

// ========== 自定义家具库 ==========

const saveFurnitureToLibrary = (template) => {
  // 避免重复保存相同模板
  const exists = customFurnitureLibrary.value.some(t => t.name === template.name)
  if (!exists) {
    customFurnitureLibrary.value.push(template)
    addLog(`家具模板已保存: ${template.name}`)
  }
}

// ========== 小人精灵导入 ==========

const savePawnSprites = (sprites) => {
  const s = state.value
  const charId = selectedCharacterId.value || '__player__'

  // 查找当前角色对应的小人
  let pawn = s.pawns.find(p => p.worldCharacterId === charId)

  // 如果没有当前角色的小人，创建一个
  if (!pawn) {
    // 获取角色名称
    const charInfo = characterList.value.find(c => c.id === charId)
    const name = charInfo?.name || '角色'

    // 创建新小人（使用默认模板，然后覆盖名字）
    pawn = createDefaultPawn(0, '')
    pawn.id = `pawn-${charId}`
    pawn.name = name  // 使用角色名作为小人名
    pawn.role = ''    // 职业清空
    pawn.worldCharacterId = charId
    pawn.position = { x: Math.floor(ROOM_DEFAULT_WIDTH / 2), y: Math.floor(ROOM_DEFAULT_HEIGHT / 2) }

    // 添加到状态
    s.pawns.push(pawn)
    addLog(`创建了 ${name} 的小人`)
  }

  // 设置自定义精灵
  pawn.customSprites = sprites
  addLog(`已为 ${pawn.name} 设置自定义精灵`)
  schedulePersist()
}

// ========== 长按角色显示方向控制 ==========

const handlePawnTouchStart = (e, pawn) => {
  if (!editMode.value || placementPreview.value) return

  // 选中角色
  selectPawn(pawn)

  // 开始长按计时
  if (pawnLongPressTimer) clearTimeout(pawnLongPressTimer)
  pawnLongPressTimer = setTimeout(() => {
    showDirectionControls.value = true
  }, PAWN_LONG_PRESS_DELAY)
}

const handlePawnTouchEnd = () => {
  if (pawnLongPressTimer) {
    clearTimeout(pawnLongPressTimer)
    pawnLongPressTimer = null
  }
}

const handlePawnMouseDown = (e, pawn) => {
  if (!editMode.value || placementPreview.value) return
  if (e.button !== 0) return // 只响应左键

  // 选中角色
  selectPawn(pawn)

  // 开始长按计时
  if (pawnLongPressTimer) clearTimeout(pawnLongPressTimer)
  pawnLongPressTimer = setTimeout(() => {
    showDirectionControls.value = true
  }, PAWN_LONG_PRESS_DELAY)
}

const handlePawnMouseUp = () => {
  if (pawnLongPressTimer) {
    clearTimeout(pawnLongPressTimer)
    pawnLongPressTimer = null
  }
}

const handlePawnMouseLeave = () => {
  if (pawnLongPressTimer) {
    clearTimeout(pawnLongPressTimer)
    pawnLongPressTimer = null
  }
}

// ========== 方向控制（长按平滑移动） ==========

const MOVE_SPEED = 4 // 每帧移动像素数（约60fps时每秒240像素，即约3.75格/秒）

const startMovePawn = (direction) => {
  if (isUnmounted.value) return
  const s = state.value
  const pawn = s.pawns.find(p => p.id === s.selectedPawnId) || s.pawns[0]
  if (!pawn) return

  // 初始化像素位置：如果已有保存的像素位置则使用，否则从格子中心开始
  if (pawn.pixelX !== undefined && pawn.pixelY !== undefined) {
    pawnPixelX = pawn.pixelX
    pawnPixelY = pawn.pixelY
  } else {
    pawnPixelX = pawn.position.x * ROOM_CELL_SIZE
    pawnPixelY = pawn.position.y * ROOM_CELL_SIZE
  }

  // 设置方向和朝向
  currentMoveDirection.value = direction
  switch (direction) {
    case 'up': pawn.sprite.facing = 'back'; break
    case 'down': pawn.sprite.facing = 'front'; break
    case 'left': pawn.sprite.facing = 'left'; break
    case 'right': pawn.sprite.facing = 'right'; break
  }

  // 停止之前的动画
  if (moveAnimationId.value) {
    cancelAnimationFrame(moveAnimationId.value)
  }

  // 开始平滑移动动画（直接操作 DOM）
  const animate = () => {
    if (isUnmounted.value) return
    const pawn = s.pawns.find(p => p.id === s.selectedPawnId) || s.pawns[0]
    if (!pawn || !currentMoveDirection.value) return

    const el = selectedPawnElRef.value
    const dir = currentMoveDirection.value

    // 计算移动
    switch (dir) {
      case 'up': pawnPixelY -= MOVE_SPEED; break
      case 'down': pawnPixelY += MOVE_SPEED; break
      case 'left': pawnPixelX -= MOVE_SPEED; break
      case 'right': pawnPixelX += MOVE_SPEED; break
    }

    // 边界限制
    const maxX = (dynamicGridWidth.value - 1) * ROOM_CELL_SIZE
    const maxY = (dynamicGridHeight.value - 1) * ROOM_CELL_SIZE
    pawnPixelX = Math.max(0, Math.min(maxX, pawnPixelX))
    pawnPixelY = Math.max(0, Math.min(maxY, pawnPixelY))

    // 更新响应式像素位置（让 Vue 渲染时用正确位置）
    pawn.pixelX = pawnPixelX
    pawn.pixelY = pawnPixelY

    // 直接更新 DOM（绕过 Vue 响应式，实现平滑）
    if (el) {
      const spriteSize = PAWN_SPRITE_DISPLAY_SIZE
      const offsetX = (ROOM_CELL_SIZE - spriteSize) / 2
      el.style.left = `${pawnPixelX + offsetX}px`
      el.style.top = `${pawnPixelY + offsetX}px`
      el.style.zIndex = 200 + Math.floor(pawnPixelY / ROOM_CELL_SIZE)
      // facing 有专门的 sprite，不需要翻转
    }

    // 注意：不更新 pawn.position（响应式），避免触发 Vue 重新渲染覆盖 DOM
    // position 在 stopMovePawn 时更新

    // 继续动画（先检查是否已卸载）
    if (isUnmounted.value) return
    moveAnimationId.value = requestAnimationFrame(animate)
  }

  // 启动动画前检查是否已卸载
  if (isUnmounted.value) return
  moveAnimationId.value = requestAnimationFrame(animate)
}

const stopMovePawn = () => {
  if (isUnmounted.value) return
  currentMoveDirection.value = null
  if (moveAnimationId.value) {
    cancelAnimationFrame(moveAnimationId.value)
    moveAnimationId.value = null
  }
  // 保存当前像素位置到状态（不对齐格子，保持任意位置）
  const s = state.value
  const pawn = s.pawns.find(p => p.id === s.selectedPawnId) || s.pawns[0]
  if (pawn) {
    // 保存精确的像素位置（浮点数，不四舍五入）
    pawn.pixelX = pawnPixelX
    pawn.pixelY = pawnPixelY
    // 格子位置也更新（用于碰撞检测等，但角色可以停在格子边缘）
    pawn.position.x = pawnPixelX / ROOM_CELL_SIZE
    pawn.position.y = pawnPixelY / ROOM_CELL_SIZE
    schedulePersist()
  }
}

// 隐藏方向控制（停止移动并隐藏按钮）
const hideDirectionControls = () => {
  showDirectionControls.value = false
  stopMovePawn()
}

const selectFurnitureFromLibrary = (template) => {
  // 从模板创建新的家具实例用于放置
  const furniture = {
    ...template,
    id: `furn-preview-${Date.now().toString(36)}`,
    x: 0,
    y: 0,
  }
  enterPlacementMode(furniture)
}

// ========== 预设家具 ==========

// 预设家具列表已移除，只使用自定义导入的家具
const presetFurnitureList = []

const selectPresetFurniture = (preset) => {
  const furniture = {
    ...preset,
    id: `furn-preview-${Date.now().toString(36)}`,
    x: 0,
    y: 0,
    z: null,
  }
  enterPlacementMode(furniture)
}

// ========== 画布尺寸监听 ==========

let canvasSizeIntervalId = null
let resizeObserver = null

const updateCanvasSize = () => {
  if (isUnmounted.value) return
  const boardEl = roomBoardRef.value
  if (boardEl) {
    canvasSize.value = {
      width: boardEl.clientWidth,
      height: boardEl.clientHeight,
    }
  }
}

// ========== 键盘事件 ==========

const handleKeyDown = (event) => {
  if (event.key === 'Escape' && placementPreview.value) {
    cancelPlacementMode()
  }
}

// ========== 角色选择 ==========

const selectCharacter = async (characterId) => {
  selectedCharacterId.value = characterId
  showCharacterSelect.value = false
  loading.value = true

  try {
    // 加载该角色的房间数据
    const result = await restoreStateSnapshot({
      storage: kvStorage,
      key: storageScopeKey.value,
      normalizeState,
      buildDefaultState,
    })

    // 组件销毁后不再更新状态
    if (isUnmounted.value) return

    // 如果是新房间，使用角色特定的默认状态（确保 selectedPawnId 正确）
    if (result.isNew) {
      state.value = buildDefaultStateForCharacter(selectedCharacter.value)
    } else {
      state.value = result.state
    }

    // 如果没有家具库，初始化空库
    if (!state.value.customFurnitureLibrary) {
      state.value.customFurnitureLibrary = []
    }
    customFurnitureLibrary.value = state.value.customFurnitureLibrary || []

    // 初始化小人心情
    for (const pawn of state.value.pawns) {
      if (!pawn.mood) {
        moodEngine.initializeMood(pawn)
      }
      const pawnRoom = state.value.rooms?.[0] || buildDefaultRoomState()
      moodEngine.updateAllMood(pawn, pawnRoom, 0)
    }

    // 确保 selectedPawnId 有效
    if (!state.value.selectedPawnId && state.value.pawns.length > 0) {
      state.value.selectedPawnId = state.value.pawns[0].id
    }

    // 调试：显示加载后的家具数量
    const loadedFurniture = state.value.rooms?.[0]?.furniture || []
    console.log('[RoomSimulation] Loaded room for character:', characterId, 'isNew:', result.isNew, 'placed:', loadedFurniture.length, 'library:', customFurnitureLibrary.value.length)
  } catch (e) {
    console.error('[RoomSimulation] Load character room error:', e)
    if (isUnmounted.value) return
    // 创建默认状态
    state.value = buildDefaultStateForCharacter(selectedCharacter.value)
  }

  if (isUnmounted.value) return
  loading.value = false

  // 等待 DOM 渲染完成后更新画布尺寸
  await nextTick()
  requestAnimationFrame(updateCanvasSize)
}

const backToCharacterSelect = async () => {
  // 先合并家具库到 state
  state.value.customFurnitureLibrary = customFurnitureLibrary.value

  // 然后保存当前角色房间（等待完成）
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  await persistStateSnapshot({
    storage: kvStorage,
    key: storageScopeKey.value,
    state: state.value,
    normalizeState: normalizeState,
  })
  console.log('[RoomSimulation] Saved before switching:', storageScopeKey.value)

  if (isUnmounted.value) return
  showCharacterSelect.value = true
  selectedCharacterId.value = null
}

// ========== 生命周期 ==========

const restoreState = async (key) => {
  if (isUnmounted.value) return
  loading.value = true
  const result = await restoreStateSnapshot({
    storage: kvStorage,
    key,
    normalizeState,
    buildDefaultState,
  })
  if (isUnmounted.value) return
  state.value = result.state
  // 调试：显示加载后的家具数量
  const loadedFurniture = state.value.rooms?.[0]?.furniture || []
  console.log('[RoomSimulation] Restored state - placed furniture:', loadedFurniture.length)
  if (isUnmounted.value) return
  loading.value = false
}

onMounted(async () => {
  console.log('[RoomSimulation] onMounted, props.autoOpen:', props.autoOpen)
  android.value = isAndroid()
  loading.value = true

  // 加载当前世界书数据
  try {
    const activeWorldBookId = await getActiveWorldBookId()
    if (isUnmounted.value) return
    console.log('[RoomSimulation] Active world book ID:', activeWorldBookId)
    currentWorldBook.value = await getNormalizedBook(activeWorldBookId)
    if (isUnmounted.value) return
    console.log('[RoomSimulation] Loaded world book:', currentWorldBook.value?.title, 'characters:', currentWorldBook.value?.characters?.length)
  } catch (e) {
    console.error('[RoomSimulation] Failed to load world book:', e)
    if (isUnmounted.value) return
    currentWorldBook.value = null
  }

  if (isUnmounted.value) return
  loading.value = false

  // 显示角色选择面板
  showCharacterSelect.value = true

  startSimulationLoop()
  startDecayLoop()
  startMoodDecayLoop()
  startSpeechBubbleLoop()
  startLightUpdateLoop()
  updateLighting()  // 立即更新一次

  // 监听键盘事件
  window.addEventListener('keydown', handleKeyDown)

  // 监听画布尺寸变化（使用 ResizeObserver）
  resizeObserver = new ResizeObserver(() => {
    if (isUnmounted.value) return
    updateCanvasSize()
  })
  // 监听整个面板的尺寸变化
  if (roomBoardRef.value) {
    resizeObserver.observe(roomBoardRef.value)
  }

  // 定期检查并更新尺寸（直到画布可用）
  canvasSizeIntervalId = setInterval(() => {
    if (isUnmounted.value) return
    if (!showCharacterSelect.value && roomBoardRef.value) {
      updateCanvasSize()
    }
  }, 500)

  if (props.autoOpen) {
    panelOpen.value = true
    console.log('[RoomSimulation] panelOpen set to true')
  }
})

onUnmounted(() => {
  isUnmounted.value = true
  stopSimulationLoop()
  stopDecayLoop()
  stopMoodDecayLoop()
  stopSpeechBubbleLoop()
  stopLightUpdateLoop()
  stopMovePawn()
  lightRenderer.destroy()  // 销毁光照渲染器
  // 清理长按计时器
  if (furnitureLongPressTimer) clearTimeout(furnitureLongPressTimer)
  if (canvasSizeIntervalId) clearInterval(canvasSizeIntervalId)
  if (resizeObserver) resizeObserver.disconnect()
  if (persistTimer) clearTimeout(persistTimer)

  // 移除键盘事件监听
  window.removeEventListener('keydown', handleKeyDown)

  void persistStateSnapshot({
    storage: kvStorage,
    key: storageScopeKey.value,
    state: state.value,
    normalizeState,
  })
})

watch(storageScopeKey, async (newKey, oldKey) => {
  if (isUnmounted.value) return
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

// 监听编辑模式切换，立即显示气泡
watch(editMode, (isEdit) => {
  if (isEdit) {
    // 进入编辑模式，立即让所有小人显示气泡
    const pawns = state.value.pawns
    for (const pawn of pawns) {
      showAutoSpeechBubble(pawn.id)
    }
  }
})
</script>

<template>
  <!-- 全屏房间模拟面板 -->
  <div class="room-sim-fullscreen" v-if="panelOpen">
    <!-- 角色选择面板 -->
    <div v-if="showCharacterSelect" class="character-select-overlay">
      <div class="character-select-panel">
        <h2>选择角色房间</h2>
        <p class="select-hint">选择要编辑的角色</p>
        <div class="character-grid">
          <div
            v-for="char in characterList"
            :key="char.id"
            class="character-card"
            @click="selectCharacter(char.id)"
          >
            <div class="character-avatar">
              <img v-if="char.avatar" :src="char.avatar" alt="" />
              <div v-else class="avatar-placeholder">{{ char.name.charAt(0) }}</div>
            </div>
            <div class="character-info">
              <span class="character-name">{{ char.name }}</span>
              <span class="character-type">{{ char.type === 'user' ? '玩家' : '角色' }}</span>
            </div>
          </div>
        </div>
        <button class="close-select-btn" @click="panelOpen = false">关闭</button>
      </div>
    </div>

    <!-- 角色房间内容（选择角色后显示） -->
    <template v-if="!showCharacterSelect && selectedCharacter">
      <!-- 悬浮汉堡按钮 -->
      <button class="floating-hamburger" @click="showHamburger = true">≡</button>

      <!-- 房间渲染区（全屏） -->
      <div
        class="room-sim-canvas"
        ref="roomBoardRef"
        :style="roomBoardStyle"
        @mousemove="handleCanvasMouseMove"
        @mouseup="handleCanvasMouseUp"
        @touchstart.passive="handleCanvasTouchStart"
        @touchmove.passive="handleCanvasTouchMove"
        @touchend="handleCanvasTouchEnd"
      >
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

      <!-- 放置预览格子层（新增家具） -->
      <div
        v-if="placementPreview && editMode"
        v-for="cell in previewOccupiedCells"
        :key="`preview-${cell.x}-${cell.y}`"
        class="room-sim-preview-cell"
        :class="{ valid: placementPreviewValid, invalid: !placementPreviewValid }"
        :style="{
          left: `${cell.x * ROOM_CELL_SIZE}px`,
          top: `${cell.y * ROOM_CELL_SIZE}px`,
          width: `${ROOM_CELL_SIZE}px`,
          height: `${ROOM_CELL_SIZE}px`,
        }"
      ></div>

      <!-- 家具层 -->
      <div
        v-for="furniture in furnitureSortedByZ"
        :key="furniture.id"
        class="room-sim-furniture"
        :style="getFurnitureStyle(furniture)"
        :class="{ selected: state.selectedFurnitureId === furniture.id }"
        @pointerdown="(e) => handleFurniturePointerDown(e, furniture)"
        @pointermove="(e) => handleFurniturePointerMove(e, furniture)"
        @pointerup="(e) => handleFurniturePointerUp(e, furniture)"
        @pointercancel="(e) => handleFurniturePointerCancel(e, furniture)"
      >
        <img
          :src="getFurnitureSpriteSrc(furniture)"
          alt=""
          :style="{ transform: getFurnitureSpriteTransform(furniture) }"
        />
      </div>

      <!-- 小人层 -->
      <div
        v-for="pawn in pawnsSortedByY"
        :key="pawn.id"
        :ref="el => { if (pawn.id === state.selectedPawnId) setSelectedPawnEl(el) }"
        class="room-sim-pawn"
        :class="{ selected: state.selectedPawnId === pawn.id, moving: pawn.moving }"
        :style="getPawnStyle(pawn)"
        @click="(e) => { if (editMode && !placementPreview) { e.stopPropagation(); selectPawn(pawn); } }"
        @touchstart="(e) => handlePawnTouchStart(e, pawn)"
        @touchend="handlePawnTouchEnd"
        @mousedown="(e) => handlePawnMouseDown(e, pawn)"
        @mouseup="handlePawnMouseUp"
        @mouseleave="handlePawnMouseLeave"
      >
        <!-- 对话气泡 -->
        <div
          v-if="pawn.speechBubble && pawn.speechBubble.text"
          class="room-sim-speech-bubble"
          :class="{ 'bubble-pop': pawn.speechBubble.popAnimation }"
        >
          <div class="bubble-content">{{ pawn.speechBubble.text }}</div>
          <div class="bubble-tail"></div>
        </div>
        <!-- 小人图片（facing 有专门的 sprite，不需要翻转） -->
        <img
          :src="getPawnSpriteSrc(pawn)"
          alt=""
        />
        <div class="room-sim-pawn-indicator">
          <span class="room-sim-mood-dot" :class="getMoodClass(pawn)"></span>
        </div>
      </div>

    <!-- 光照遮罩层容器 -->
    <div
      ref="lightCanvasRef"
      class="room-sim-light-mask-container"
      :style="{
        width: `${dynamicGridWidth.value * ROOM_CELL_SIZE}px`,
        height: `${dynamicGridHeight.value * ROOM_CELL_SIZE}px`,
      }"
    ></div>
      </div>  <!-- 关闭 room-sim-canvas -->

    <!-- 放置预览控制按钮 -->
    <div v-if="placementPreview" class="placement-controls">
      <button class="rotate-btn" @click="rotatePreviewFurniture">🔄 旋转 {{ placementPreview.rotation || 0 }}°</button>
      <button class="cancel-btn" @click="cancelPlacementMode">✕ 取消</button>
    </div>

    <!-- 家具栏 -->
    <div v-if="showFurnitureBar && !placementPreview" class="furniture-bar">
      <div class="furniture-bar-header">
        <span>家具栏</span>
        <button class="furniture-bar-close" @click="showFurnitureBar = false">✕</button>
      </div>
      <div class="furniture-bar-content">
        <!-- 自定义家具 -->
        <div v-if="customFurnitureLibrary.length > 0" class="furniture-bar-section">
          <div class="furniture-bar-section-title">自定义家具</div>
          <div class="furniture-bar-grid">
            <div
              v-for="template in customFurnitureLibrary"
              :key="template.id"
              class="furniture-bar-item custom"
              @click="selectFurnitureFromLibrary(template)"
            >
              <img :src="getFurnitureSpriteSrc(template)" alt="" />
              <span class="furniture-bar-item-name">{{ template.name }}</span>
              <span class="furniture-bar-item-size">{{ template.width }}x{{ template.height }}</span>
            </div>
          </div>
        </div>
        <!-- 无家具提示 -->
        <div v-if="customFurnitureLibrary.length === 0" class="furniture-bar-empty">
          <p>还没有自定义家具</p>
          <p>点击 📦 导入 PNG 图片</p>
        </div>
      </div>
    </div>

    <!-- 汉堡菜单 -->
    <HamburgerMenu
      :visible="showHamburger"
      :state="state"
      :edit-mode="editMode"
      :has-selected-furniture="!!state.selectedFurnitureId"
      :ambient-light="ambientLightValue"
      @close="showHamburger = false"
      @select-pawn="handleSelectPawnFromMenu"
      @toggle-pause="togglePause"
      @toggle-edit-mode="editMode = !editMode"
      @show-import="showImportPanel = true"
      @show-pawn-import="showPawnSpriteImport = true"
      @show-mood-rules="showMoodRuleEditor = true"
      @toggle-furniture-bar="showFurnitureBar = !showFurnitureBar"
      @delete-furniture="deleteSelectedFurniture"
      @force-save="forceSaveNow"
      @close-panel="panelOpen = false"
      @back-to-select="backToCharacterSelect"
      @reset-room="handleResetRoom"
      @adjust-ambient-light="handleAdjustAmbientLight"
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
      @enter-placement-mode="enterPlacementMode"
      @save-to-library="saveFurnitureToLibrary"
      @close="showImportPanel = false"
    />

    <!-- 小人精灵导入面板 -->
    <PawnSpriteImportPanel
      v-if="showPawnSpriteImport"
      :character-name="selectedCharacter?.name || '角色'"
      @save-pawn-sprites="savePawnSprites"
      @close="showPawnSpriteImport = false"
    />

    <!-- 心情规则编辑面板 -->
    <MoodRuleEditor
      v-if="showMoodRuleEditor"
      :trigger-engine="moodTriggerEngine"
      :visible="showMoodRuleEditor"
      @close="showMoodRuleEditor = false"
      @save="schedulePersist"
    />

    <!-- 方向控制（长按角色后显示） -->
    <div v-if="editMode && showDirectionControls" class="direction-controls">
      <button class="direction-close" @click="hideDirectionControls">✕</button>
      <button class="direction-btn"
        @touchstart.prevent="startMovePawn('up')"
        @touchend="stopMovePawn"
        @mousedown="startMovePawn('up')"
        @mouseup="stopMovePawn"
        @mouseleave="stopMovePawn">↑</button>
      <div class="direction-row">
        <button class="direction-btn"
          @touchstart.prevent="startMovePawn('left')"
          @touchend="stopMovePawn"
          @mousedown="startMovePawn('left')"
          @mouseup="stopMovePawn"
          @mouseleave="stopMovePawn">←</button>
        <button class="direction-btn"
          @touchstart.prevent="startMovePawn('down')"
          @touchend="stopMovePawn"
          @mousedown="startMovePawn('down')"
          @mouseup="stopMovePawn"
          @mouseleave="stopMovePawn">↓</button>
        <button class="direction-btn"
          @touchstart.prevent="startMovePawn('right')"
          @touchend="stopMovePawn"
          @mousedown="startMovePawn('right')"
          @mouseup="stopMovePawn"
          @mouseleave="stopMovePawn">→</button>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="room-sim-loading">
      <span>加载中...</span>
    </div>
    </template>
  </div>

  <!-- 未打开时的入口按钮 -->
  <div v-else class="room-sim-entry" @click="panelOpen = true">
    <span class="room-sim-entry-icon">🏠</span>
    <span class="room-sim-entry-text">房间模拟</span>
  </div>
</template>

<style scoped src="./styles/index.css"></style>

<style scoped>
/* 角色选择面板 */
.character-select-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.character-select-panel {
  background: #2a2a32;
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 400px;
  color: #eaeaea;
}

.character-select-panel h2 {
  margin: 0 0 8px 0;
  font-size: 20px;
  text-align: center;
}

.select-hint {
  text-align: center;
  color: #888;
  font-size: 14px;
  margin-bottom: 20px;
}

.character-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.character-card {
  background: #3a3a42;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transition: background 0.15s;
}

.character-card:hover {
  background: #4a4a52;
}

.character-avatar {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  background: #4a4a52;
  display: flex;
  align-items: center;
  justify-content: center;
}

.character-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  font-size: 28px;
  color: #aaa;
}

.character-info {
  text-align: center;
}

.character-name {
  font-size: 14px;
  font-weight: 600;
}

.character-type {
  font-size: 12px;
  color: #888;
}

.close-select-btn {
  width: 100%;
  padding: 12px;
  background: #4a4a52;
  border: none;
  border-radius: 6px;
  color: #eaeaea;
  cursor: pointer;
  font-size: 14px;
}

.close-select-btn:hover {
  background: #5a5a62;
}

.back-btn {
  background: #4a4a52;
}

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
  padding-top: var(--safe-area-inset-top, 0px);
  padding-bottom: var(--safe-area-inset-bottom, 0px);
  background: #18181e;
  color: #eaeaea;
  overflow: hidden;
}

/* 悬浮汉堡按钮 */
.floating-hamburger {
  position: fixed;
  top: calc(8px + var(--safe-area-inset-top, 0px));
  left: 8px;
  width: 44px;
  height: 44px;
  background: #2a2a32;
  border: 1px solid #3a3a42;
  border-radius: 8px;
  color: #eaeaea;
  font-size: 24px;
  cursor: pointer;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.floating-hamburger:hover {
  background: #3a3a42;
}

/* 房间渲染区全屏 */
.room-sim-canvas {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  background: #0a0a0e;
  overflow: hidden;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
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

.room-sim-fullscreen .pawn-import-panel {
  position: absolute;
  top: 50px;
  right: 10px;
  z-index: 1000;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

/* 方向控制（长按角色后显示，右上角悬浮） */
.direction-controls {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 600;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: rgba(42, 42, 52, 0.9);
  padding: 8px;
  border-radius: 12px;
  border: 1px solid #4a4a52;
}

.direction-close {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 24px;
  height: 24px;
  background: #4a4a52;
  border: 1px solid #5a5a62;
  border-radius: 12px;
  color: #aaa;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.direction-close:hover {
  background: #5a5a62;
  color: #eaeaea;
}

.direction-row {
  display: flex;
  gap: 4px;
}

.direction-btn {
  width: 44px;
  height: 44px;
  background: #3a3a42;
  border: 1px solid #4a4a52;
  border-radius: 8px;
  color: #eaeaea;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.direction-btn:hover {
  background: #4a4a52;
  border-color: #5a5a62;
}

.direction-btn:active {
  background: #5a5a62;
}

/* 放置预览控制按钮 */
.placement-controls {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: #5a6a7a;
  color: #fff;
  padding: 10px 14px;
  border-radius: 12px;
  z-index: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.placement-controls .rotate-btn,
.placement-controls .cancel-btn {
  background: rgba(0, 0, 0, 0.25);
  border: none;
  color: #fff;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s;
}

.placement-controls .rotate-btn:hover {
  background: rgba(100, 140, 100, 0.5);
}

.placement-controls .cancel-btn:hover {
  background: rgba(80, 80, 80, 0.5);
}

/* Android 样式修复 */
.platform-android.android-portrait .placement-controls .rotate-btn,
.platform-android.android-portrait .placement-controls .cancel-btn {
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

/* 家具栏 */
.furniture-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 40vh;
  background: #22222a;
  border-top: 1px solid #3a3a42;
  z-index: 600;
  display: flex;
  flex-direction: column;
}

.furniture-bar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #3a3a42;
}

.furniture-bar-header span {
  font-size: 16px;
  font-weight: 600;
}

.furniture-bar-close {
  background: transparent;
  border: none;
  color: #aaa;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
}

.furniture-bar-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.furniture-bar-section {
  margin-bottom: 12px;
}

.furniture-bar-section-title {
  font-size: 13px;
  color: #888;
  margin-bottom: 8px;
}

.furniture-bar-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.furniture-bar-item {
  width: 64px;
  height: 80px;
  background: #3a3a42;
  border: 1px solid #4a4a52;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.furniture-bar-item:hover {
  background: #4a4a52;
  border-color: #6a6a72;
}

.furniture-bar-item.custom {
  border-color: #6a8a6a;
}

.furniture-bar-item img {
  width: 32px;
  height: 32px;
  object-fit: contain;
  margin: 0;
  padding: 0;
  display: block;
}

.furniture-bar-item-name {
  font-size: 11px;
  color: #eaeaea;
  margin-top: 4px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60px;
}

.furniture-bar-item-size {
  font-size: 10px;
  color: #888;
}

.furniture-bar-empty {
  padding: 20px;
  text-align: center;
  color: #888;
}

.furniture-bar-empty p {
  margin: 8px 0;
}

/* 移动端优化 */
@media (pointer: coarse) {
  .floating-hamburger {
    width: 52px;
    height: 52px;
    font-size: 28px;
  }
}

/* Android 下的按钮样式修复 */
.platform-android.android-portrait .floating-hamburger,
.platform-android.android-portrait .furniture-bar-close,
.platform-android.android-portrait .furniture-bar-item,
.platform-android.android-portrait .direction-btn,
.platform-android.android-portrait .direction-close,
.platform-android.android-portrait .close-select-btn,
.platform-android.android-portrait .character-card {
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

.platform-android.android-portrait .floating-hamburger {
  width: 44px !important;
  height: 44px !important;
}
</style>