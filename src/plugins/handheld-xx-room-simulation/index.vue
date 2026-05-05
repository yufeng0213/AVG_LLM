<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { kvStorage } from '../../storage/index.js'
import { getActiveWorldBookId, getNormalizedBook } from '../../worldbook/worldBookStore.js'
import { resolveStorageScopeKey, resolveFurnitureLibraryKey, resolvePublicRoomKey } from './state/storageScope.js'
import { persistStateSnapshot, restoreStateSnapshot, parseStorageKey,
         loadPublicRoomRegistry, savePublicRoomRegistry,
         loadPublicRoomState, savePublicRoomState, deletePublicRoom } from './state/persistence.js'
import { clearRoomSimData, isRoomSimSQLiteAvailable } from './state/roomSimRepo.js'
import { buildDefaultState, buildDefaultStateForCharacter, createDefaultPawn, buildDefaultRoomState, buildDefaultPublicRoomState } from './state/initialState.js'
import { usePlayerState } from '../../stores/playerState.store.js'
import FurnitureImportPanel from './components/FurnitureImportPanel.vue'
import PawnSpriteImportPanel from './components/PawnSpriteImportPanel.vue'
import PawnOutfitPanel from './components/PawnOutfitPanel.vue'
import HamburgerMenu from './components/HamburgerMenu.vue'
import PawnInfoOverlay from './components/PawnInfoOverlay.vue'
import FurnitureInfoOverlay from './components/FurnitureInfoOverlay.vue'
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
  TIME_SPEED_SETTINGS,
  TIME_SPEED_ORDER,
} from './config/constants.js'
import { createRoomSpriteResolver, calculateFurnitureZ } from './render/roomSprites.js'
import { createPawnSpriteResolver } from './render/pawnSprites.js'
import { createRoomEngine } from './logic/room/roomEngine.js'
import { createPawnNeedsEngine } from './logic/pawn/pawnNeedsEngine.js'
import { createPawnMoodEngine } from './logic/pawn/pawnMoodEngine.js'
import { createPawnPathfindEngine } from './logic/pawn/pawnPathfind.js'
import { createMoodTriggerEngine } from './logic/pawn/moodTriggerEngine.js'
import { createFreeActivityEngine } from './logic/pawn/freeActivityEngine.js'
import { createLightCalculator } from './logic/room/lightCalculator.js'
import { createLightRenderer } from './render/lightRenderer.js'
import { createItemEngine } from './logic/world/itemEngine.js'
import MoodRuleEditor from './components/MoodRuleEditor.vue'
import { resolveRoomPointerCell, buildRoomDragState } from './logic/room/roomInput.js'
import { isAndroid } from '../../utils/platform.js'
import { LIGHT_UPDATE_INTERVAL_MS } from './config/lightConstants.js'
import {
  IDLE_ACTION_INTERVAL_MS,
  FURNITURE_MOOD_BOOST,
  ADVENTURE_ZONES,
} from './config/constants.js'

const props = defineProps({
  worldBook: { type: Object, default: null },
  saveSlotId: { type: [String, Number], default: '' },
  autoOpen: { type: Boolean, default: false },
})

// ========== 基础状态 ==========

const playerState = usePlayerState()  // 全局经济系统
const panelOpen = ref(false)
const loading = ref(false)
const errorText = ref('')
const android = ref(false)
const showHamburger = ref(false)
const showImportPanel = ref(false)
const showPawnSpriteImport = ref(false)
const showPawnOverlay = ref(false)
const showFurnitureOverlay = ref(false)
const showFurnitureBar = ref(false)
const showCharacterSelect = ref(true) // 房间导航面板
const expandedRoomGroups = ref(new Set(['bedroom', 'public', 'adventure']))
const publicRoomRegistry = ref([])
const currentPublicRoomId = ref(null)
const currentRoomMode = ref(null)     // 'bedroom' | 'public' | null
const addRoomModalOpen = ref(false)
const newRoomName = ref('')
const comingSoonMsg = ref('')
const showDirectionControls = ref(false) // 长按角色后显示方向控制
const showMoodRuleEditor = ref(false) // 心情规则编辑面板
const showPawnOutfitPanel = ref(false) // 换装面板
const showDebugPanel = ref(true) // 调试信息面板（默认开启）

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

// 房间导航 - 寝室列表
const bedroomRooms = computed(() => {
  return characterList.value.map(char => ({
    id: char.id,
    name: `${char.name}的房间`,
    icon: '🛏️',
    avatar: char.avatar,
    charInfo: char,
  }))
})

// 房间导航 - 公共区域列表
const publicRooms = computed(() => {
  return publicRoomRegistry.value.map(room => ({
    id: room.id,
    name: room.name,
    icon: '🏠',
  }))
})

// 房间导航 - 探险区域
const adventureZones = computed(() => ADVENTURE_ZONES)

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
const itemEngine = createItemEngine()

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
    if (isUnmounted.value) return
    if (state.value.time.isPaused) return  // 暂停时不执行tick
    runSimulationTick()
  }, TIME_TICK_INTERVAL_MS)
  console.log(`[SimLoop] 启动模拟循环 interval=${TIME_TICK_INTERVAL_MS}ms`)
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

// ========== 空闲活动循环 ==========

let idleActionLoopId = null

const startIdleActionLoop = () => {
  if (idleActionLoopId) return
  idleActionLoopId = setInterval(() => {
    if (isUnmounted.value || state.value.time.isPaused) return
    runIdleActions()
  }, IDLE_ACTION_INTERVAL_MS)
}

const stopIdleActionLoop = () => {
  if (idleActionLoopId) {
    clearInterval(idleActionLoopId)
    idleActionLoopId = null
  }
}

const runIdleActions = () => {
  const room = getOrCreateRoom()
  const pawns = state.value.pawns

  for (const pawn of pawns) {
    // 只对空闲的小人检查
    if (pawn.currentActivity === 'idle' && !pawn.moving) {
      freeActivityEngine.checkIdleAction(pawn, room, pawns)
    }
  }
}

const runSimulationTick = () => {
  const s = state.value

  // 暂停时不执行
  if (s.time.speedMode === 'pause' || s.time.isPaused) return

  const speedConfig = TIME_SPEED_SETTINGS[s.time.speedMode] || TIME_SPEED_SETTINGS.normal
  const gameSecondsPerTick = speedConfig.gameSecondsPerTick

  // 累积游戏秒数
  s.time.gameSeconds += gameSecondsPerTick
  s.time.tick += 1

  // 计算当前小时和天数（3600秒=1小时）
  const totalGameSeconds = s.time.gameSeconds
  const totalHours = Math.floor(totalGameSeconds / 3600)
  s.time.hourOfDay = totalHours % 24
  s.time.dayCount = Math.floor(totalHours / 24) + 1

  // 更新时间段
  updateTimePhase()

  // 调试：每60个tick打印时间
  if (s.time.tick % 60 === 0) {
    const minutes = Math.floor((s.time.gameSeconds % 3600) / 60)
    console.log(`[Time] 第${s.time.dayCount}天 ${String(s.time.hourOfDay).padStart(2, '0')}:${String(minutes).padStart(2, '0')} 模式=${speedConfig.label}`)
  }

  for (const pawn of s.pawns) {
    updatePawn(pawn)
  }

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
    return
  }

  const room = activeRoom.value
  if (!room) {
    return
  }

  // 使用手动值或自动计算值
  if (manualAmbientLight.value !== null) {
    ambientLightValue.value = manualAmbientLight.value
  } else {
    const hour = state.value.time.hourOfDay
    ambientLightValue.value = lightCalculator.getAmbientLightForHour(hour)
  }

  // 提取光源
  lightSources.value = lightCalculator.extractLightSources(room)

  // 使用实际画布尺寸（动态网格 * 格子大小）
  const canvasWidth = dynamicGridWidth.value * ROOM_CELL_SIZE
  const canvasHeight = dynamicGridHeight.value * ROOM_CELL_SIZE

  // 渲染光照遮罩
  const canvas = lightRenderer.renderLightMask(
    room,
    lightSources.value,
    ambientLightValue.value,
    Date.now(),
    { canvasWidth, canvasHeight }
  )

  // 将 Canvas 添加到容器
  if (canvas && lightCanvasRef.value) {
    const container = lightCanvasRef.value
    // 如果容器中没有 Canvas 或者 Canvas 变了，重新添加
    if (container.children.length === 0 || container.children[0] !== canvas) {
      container.innerHTML = ''
      container.appendChild(canvas)
    }
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

  // 调试：显示移动状态
  if (pawn.moving) {
    console.log(`[updatePawn] ${pawn.name} moving=${pawn.moving} path=${pawn.path?.length || 0} pathIndex=${pawn.pathIndex} currentActivity=${pawn.currentActivity}`)
  }

  if (pawn.moving && pawn.path.length > 0) {
    if (pawn.pathIndex < pawn.path.length) {
      const nextPos = pawn.path[pawn.pathIndex]
      const prevPos = pawn.position

      pawn.position = { x: nextPos.x, y: nextPos.y }
      // 清除像素位置，让渲染使用格子坐标
      pawn.pixelX = undefined
      pawn.pixelY = undefined
      pawn.pathIndex += 1
      pawn.sprite.action = 'walk'

      // 设置朝向方向
      if (nextPos.x > prevPos.x) pawn.sprite.facing = 'right'
      else if (nextPos.x < prevPos.x) pawn.sprite.facing = 'left'

      if (pawn.pathIndex >= pawn.path.length) {
        pawn.moving = false
        pawn.path = []
        pawn.pathIndex = 0

        // 根据当前活动类型决定下一步
        if (pawn.currentActivity === 'walking') {
          // 随机漫步完成
          pawn.currentActivity = 'idle'
          pawn.sprite.action = 'idle'
          recordPawnEvent(pawn, '四处闲逛', +1, 'walking')
        } else if (pawn.currentActivity === 'idle_interaction') {
          // 家具互动：设置开始时间等待完成
          pawn.sprite.action = 'interact'
          pawn.activityStartTime = Date.now()
        } else if (pawn.currentActivity === 'approaching_social') {
          // 接近目标小人后开始社交
          pawn.currentActivity = 'socializing'
          pawn.sprite.action = 'talk'
          pawn.activityStartTime = Date.now()
        } else if (pawn.targetFurniture) {
          // 普通交互：调用startInteraction
          startInteraction(pawn)
        } else {
          pawn.sprite.action = 'idle'
        }
      }
    }
  } else if (pawn.currentActivity === 'working') {
    const elapsed = Date.now() - pawn.activityStartTime
    if (elapsed > 5000) {
      completeInteraction(pawn)
    }
  } else if (pawn.currentActivity === 'playing') {
    // 玩耍：每tick恢复 comfort 和 joy
    // 正常模式：1tick=60游戏秒，恢复速率按游戏时间计算
    needsEngine.recoverNeed(pawn, 'comfort', 0.25)   // 每tick恢复0.25，约400tick(6.67游戏小时)填满
    needsEngine.recoverNeed(pawn, 'joy', 0.5)        // 每tick恢复0.5，约200tick(3.33游戏小时)填满

    pawn.sprite.action = 'idle'

    pawn.sprite.action = 'idle'  // 玩耍动作（暂用 idle）

    // 获取更新后的值
    const comfortValue = pawn.needs?.comfort?.value || 0
    const joyValue = pawn.needs?.joy?.value || 0

    // 当 comfort 和 joy 都满了，结束玩耍
    if (comfortValue >= 99 && joyValue >= 99) {  // 使用99避免浮点数精度问题
      pawn.currentActivity = 'idle'
      pawn.targetFurniture = null
      pawn.sprite.action = 'idle'
      addLog(`${pawn.name} 玩得很开心`)
      recordPawnEvent(pawn, '玩得很开心', +8, 'playing')
      moodEngine.addEventMoodThought(pawn, 'social_chat')  // 使用类似社交的心情提升
    }
  } else if (pawn.currentActivity === 'sleeping') {
    // 睡觉：每tick恢复 rest
    // 正常模式：约200tick(3.33游戏小时)填满
    needsEngine.recoverNeed(pawn, 'rest', 0.5)
    pawn.sprite.action = 'sleep'

    // 获取更新后的值
    const restValue = pawn.needs?.rest?.value || 0

    // 当 rest 满了，结束睡觉
    if (restValue >= 99) {
      pawn.currentActivity = 'idle'
      pawn.targetFurniture = null
      pawn.sprite.action = 'idle'
      addLog(`${pawn.name} 睡醒了`)
      recordPawnEvent(pawn, '睡得很好', +10, 'sleeping')
      moodEngine.addEventMoodThought(pawn, 'good_sleep')
    }
  } else if (pawn.currentActivity === 'eating') {
    // 吃东西：每tick恢复 hunger
    // 正常模式：约100tick(1.67游戏小时)填满
    needsEngine.recoverNeed(pawn, 'hunger', 1.0)
    pawn.sprite.action = 'eat'

    // 获取更新后的值
    const hungerValue = pawn.needs?.hunger?.value || 0

    // 当 hunger 满了，结束吃东西
    if (hungerValue >= 99) {
      pawn.currentActivity = 'idle'
      pawn.targetFurniture = null
      pawn.sprite.action = 'idle'
      addLog(`${pawn.name} 吃饱了`)
      recordPawnEvent(pawn, '吃饱了', +5, 'eating')
      moodEngine.addEventMoodThought(pawn, 'ate_good')
    }
  } else if (pawn.currentActivity === 'retrieving') {
    // 从存储家具取物品
    pawn.sprite.action = 'interact'
    const elapsed = Date.now() - pawn.activityStartTime
    if (elapsed > 1500) {
      completeInteraction(pawn)
    }
  } else if (pawn.currentActivity === 'shopping') {
    // 从售货机购买
    pawn.sprite.action = 'interact'
    const elapsed = Date.now() - pawn.activityStartTime
    if (elapsed > 2000) {
      completeInteraction(pawn)
    }
  } else if (pawn.currentActivity === 'idle_interaction') {
    // 家具互动完成检测
    const elapsed = Date.now() - pawn.activityStartTime
    if (elapsed > 3000) {
      const furniture = currentRoom?.furniture?.find(f => f.id === pawn.targetFurniture)
      if (furniture) {
        const boost = FURNITURE_MOOD_BOOST[furniture.kind] || 1
        moodEngine.addEventMoodThought(pawn, 'relaxed')
        recordPawnEvent(pawn, `在${furniture.name}休息了一会儿`, +boost, 'interact')
      }
      pawn.currentActivity = 'idle'
      pawn.targetFurniture = null
      pawn.sprite.action = 'idle'
    }
  } else if (pawn.currentActivity === 'socializing') {
    // 社交完成检测
    pawn.sprite.action = 'talk'
    const elapsed = Date.now() - pawn.activityStartTime
    if (elapsed > 5000) {
      moodEngine.addEventMoodThought(pawn, 'social_chat')
      recordPawnEvent(pawn, '和朋友聊了天', +5, 'socializing')

      // 同时给目标小人加心情
      if (pawn.targetPawn) {
        const targetPawn = state.value.pawns.find(p => p.id === pawn.targetPawn)
        if (targetPawn) {
          moodEngine.addEventMoodThought(targetPawn, 'social_chat')
          recordPawnEvent(targetPawn, `和${pawn.name}聊了天`, +5, 'socializing')
        }
      }

      pawn.currentActivity = 'idle'
      pawn.targetPawn = null
      pawn.sprite.action = 'idle'
    }
  } else {
    runPawnAI(pawn, currentRoom)
  }
}

const runPawnAI = (pawn, room) => {
  console.log(`[AI-runPawnAI] 入口: ${pawn.name} activity=${pawn.currentActivity}`)
  const needsEval = needsEngine.evaluateNeedsState(pawn)

  const urgentNeeds = Object.entries(needsEval)
    .filter(([_, e]) => e.isCritical || e.isWarning)
    .sort((a, b) => b[1].urgency - a[1].urgency)

  console.log(`[AI-runPawnAI] 紧急需求数量=${urgentNeeds.length}`)

  if (urgentNeeds.length > 0) {
    const [needType, evalData] = urgentNeeds[0]
    const targetFurniture = findFurnitureForNeed(needType, room)

    if (targetFurniture) {
      // 将小人位置取整为格子坐标
      const startGridX = Math.floor(pawn.position.x)
      const startGridY = Math.floor(pawn.position.y)

      // 调试：显示路径计算参数
      console.log(`[AI-runPawnAI] ${pawn.name} 像素位置=${pawn.position.x.toFixed(2)},${pawn.position.y.toFixed(2)} 格子位置=${startGridX},${startGridY} 目标家具=${targetFurniture.name} 位置=${targetFurniture.x},${targetFurniture.y}`)
      console.log(`[AI-runPawnAI] dynamicTiles=${dynamicTiles.value?.length || 0} grid=${dynamicGridWidth.value}x${dynamicGridHeight.value}`)

      // 使用 dynamicTiles 和动态网格尺寸来寻路
      const path = pathfindEngine.findPath(
        { x: startGridX, y: startGridY },
        { x: targetFurniture.x, y: targetFurniture.y },
        dynamicTiles.value,
        dynamicGridWidth.value,
        dynamicGridHeight.value
      )

      console.log(`[AI-runPawnAI] 路径结果=${path ? path.length + '步' : 'null/undefined'}`)

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
    } else {
      // 没有可用的家具满足需求
      addLog(`${pawn.name} 需要${needType}但找不到可用家具`)
    }
  }
}

const findFurnitureForNeed = (needType, room) => {
  const furniture = room?.furniture || []

  // 调试：显示家具搜索信息
  console.log(`[AI-findFurniture] 需求=${needType} 家具总数=${furniture.length} 金币=${playerState.economy?.coins || 0}`)

  // 优先级1：有满足需求物品的存储家具
  const storageFurniture = furniture.filter(f => f.kind === 'storage' && f.interactable)
  console.log(`[AI-findFurniture] 存储家具候选=${storageFurniture.length}个`)
  storageFurniture.forEach(f => {
    // inventory 可能是数组，也可能是 { items: [] } 对象
    const invArray = Array.isArray(f.inventory) ? f.inventory : (f.inventory?.items || [])
    console.log(`  - ${f.name} inventory=${invArray.length}个`, invArray.slice(0, 3))
  })

  const storageWithItem = furniture.filter(f => {
    if (f.kind !== 'storage' || !f.interactable) return false
    // inventory 可能是数组，也可能是 { items: [] } 对象
    const invArray = Array.isArray(f.inventory) ? f.inventory : (f.inventory?.items || [])
    return invArray.length > 0 && itemEngine.hasItemForNeed(invArray, needType)
  })
  console.log(`[AI-findFurniture] 存储家具(有物品)=${storageWithItem.length}个`)
  if (storageWithItem.length > 0) {
    console.log(`[AI-findFurniture] 选择存储家具: ${storageWithItem[0].name}`)
    return storageWithItem[0]
  }

  // 优先级2：有满足需求商品的售货机（且有钱）
  const vendingFurniture = furniture.filter(f => f.kind === 'vending' && f.interactable)
  console.log(`[AI-findFurniture] 售货机候选=${vendingFurniture.length}个`)
  vendingFurniture.forEach(f => {
    const products = f.shopInventory || []
    console.log(`  - ${f.name} shopInventory=${products.length}个`, products.slice(0, 3).map(p => ({ name: p.name, effect: p.effect, stock: p.stock, price: p.price })))
  })

  const vendingWithProduct = furniture.filter(f => {
    if (f.kind !== 'vending' || !f.interactable) return false
    const products = f.shopInventory || []
    return products.some(p =>
      p.effect?.[needType] > 0 &&
      p.stock > 0 &&
      p.price <= (playerState.economy?.coins || 0)
    )
  })
  console.log(`[AI-findFurniture] 售货机(有商品)=${vendingWithProduct.length}个`)
  if (vendingWithProduct.length > 0) {
    console.log(`[AI-findFurniture] 选择售货机: ${vendingWithProduct[0].name}`)
    return vendingWithProduct[0]
  }

  // 优先级3：普通家具直接满足需求
  const utilityFurniture = furniture.filter(f => f.kind === 'utility' || f.kind === 'sleep' || f.kind === 'social' || f.kind === 'food' || f.kind === 'work' || f.kind === 'toy')
  console.log(`[AI-findFurniture] 功能家具候选=${utilityFurniture.length}个`)
  utilityFurniture.slice(0, 5).forEach(f => {
    console.log(`  - ${f.name} needsSatisfied=${JSON.stringify(f.needsSatisfied || {})} interactionType=${f.interactionType}`)
  })

  const normalFurniture = furniture.find(f => f.needsSatisfied && f.needsSatisfied[needType] > 0)

  // 优先级4：根据交互类型自动匹配需求
  if (!normalFurniture) {
    // 交互类型到需求类型的映射
    const interactionToNeedMap = {
      'sleep': 'rest',
      'eat': 'hunger',
      'work': 'work_satisfaction',
      'social': 'social',
      'play': 'comfort',  // play 同时满足 comfort 和 joy
    }

    // 查找交互类型匹配需求的家具
    for (const [interactionType, satisfiedNeed] of Object.entries(interactionToNeedMap)) {
      if (needType === satisfiedNeed || (interactionType === 'play' && (needType === 'comfort' || needType === 'joy'))) {
        const matchedFurniture = furniture.find(f =>
          f.interactionType === interactionType && f.interactable
        )
        if (matchedFurniture) {
          console.log(`[AI-findFurniture] 根据交互类型${interactionType}选择家具: ${matchedFurniture.name}`)
          return matchedFurniture
        }
      }
    }
  }

  console.log(`[AI-findFurniture] 功能家具(满足需求)=${normalFurniture ? normalFurniture.name : '无'}`)

  return normalFurniture
}

const startInteraction = (pawn) => {
  const room = getRoomForPawn(pawn)
  const furniture = room?.furniture?.find(f => f.id === pawn.targetFurniture)
  if (!furniture) return

  pawn.activityStartTime = Date.now()

  if (furniture.interactionType === 'sleep') {
    pawn.currentActivity = 'sleeping'
    pawn.sprite.action = 'sleep'
    recordPawnEvent(pawn, `开始睡觉`, +2, 'sleeping')
    addLog(`${pawn.name} 开始在${furniture.name}上睡觉`)
  } else if (furniture.interactionType === 'eat') {
    pawn.currentActivity = 'eating'
    pawn.sprite.action = 'eat'
    recordPawnEvent(pawn, `开始吃东西`, +2, 'eating')
    addLog(`${pawn.name} 开始在${furniture.name}吃东西`)
  } else if (furniture.interactionType === 'work') {
    pawn.currentActivity = 'working'
    pawn.sprite.action = 'work'
    recordPawnEvent(pawn, `开始工作`, +2, 'working')
    addLog(`${pawn.name} 开始在${furniture.name}工作`)
  } else if (furniture.interactionType === 'social') {
    pawn.currentActivity = 'socializing'
    pawn.sprite.action = 'talk'
    recordPawnEvent(pawn, `开始社交`, +2, 'socializing')
    addLog(`${pawn.name} 开始在${furniture.name}社交`)
  } else if (furniture.interactionType === 'storage') {
    pawn.currentActivity = 'retrieving'
    pawn.sprite.action = 'interact'
  } else if (furniture.interactionType === 'shop') {
    pawn.currentActivity = 'shopping'
    pawn.sprite.action = 'interact'
  } else if (furniture.interactionType === 'play') {
    pawn.currentActivity = 'playing'
    pawn.sprite.action = 'idle'  // 玩耍时使用 idle 动作（或可以添加专门的 play 动作）
    recordPawnEvent(pawn, `开始玩${furniture.name}`, +2, 'playing')
    addLog(`${pawn.name} 开始玩${furniture.name}`)
  }
}

const completeInteraction = (pawn) => {
  const room = getRoomForPawn(pawn)
  const furniture = room?.furniture?.find(f => f.id === pawn.targetFurniture)

  // 处理存储家具：从库存取出物品消耗
  if (furniture?.kind === 'storage' && furniture.inventory) {
    // inventory 可能是数组，也可能是 { items: [] } 对象
    const invArray = Array.isArray(furniture.inventory) ? furniture.inventory : (furniture.inventory?.items || [])
    const urgentNeed = getMostUrgentNeed(pawn)
    if (urgentNeed && invArray.length > 0) {
      const item = itemEngine.getBestItemForNeed(invArray, urgentNeed.name)
      if (item) {
        const result = itemEngine.consumeItemForPawn(pawn, invArray, item.id, 1)
        if (result.success) {
          addLog(`${pawn.name} 从 ${furniture.name} 取出 ${result.itemName} 并消耗`)
          recordPawnEvent(pawn, `从${furniture.name}取出${result.itemName}并吃掉`, +5, 'eating')
          moodEngine.addEventMoodThought(pawn, 'ate_good')
        }
      }
    }
  }

  // 处理售货机：购买商品并消费
  if (furniture?.kind === 'vending' && furniture.shopInventory) {
    const urgentNeed = getMostUrgentNeed(pawn)
    if (urgentNeed) {
      const product = furniture.shopInventory.find(p =>
        p.effect?.[urgentNeed.name] > 0 &&
        p.stock > 0 &&
        p.price <= (playerState.economy?.coins || 0)
      )
      if (product) {
        const result = itemEngine.purchaseFromShop(playerState.economy, furniture.shopInventory, product.templateId, 1)
        if (result.success) {
          // 应用效果
          for (const [needType, value] of Object.entries(result.item.effect)) {
            if (pawn.needs?.[needType]) {
              pawn.needs[needType].value = Math.min(100, pawn.needs[needType].value + value)
            }
          }
          addLog(`${pawn.name} 从售货机购买 ${result.item.name}，花费 ${result.cost} 金币`)
          recordPawnEvent(pawn, `从售货机购买${result.item.name}，花费${result.cost}金币`, +3, 'shopping')
          moodEngine.addEventMoodThought(pawn, 'ate_good')
        }
      }
    }
  }

  // 恢复需求（普通家具）
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
        recordPawnEvent(pawn, '睡了一觉，感觉很舒服', +10, 'sleeping')
      } else if (restValue < 40) {
        moodEngine.addEventMoodThought(pawn, 'bad_sleep')
        recordPawnEvent(pawn, '睡了一觉，但不太舒服', -5, 'sleeping')
      } else {
        recordPawnEvent(pawn, '睡了一觉', +3, 'sleeping')
      }
    } else if (furniture.interactionType === 'work') {
      moodEngine.addEventMoodThought(pawn, 'work_complete')
      recordPawnEvent(pawn, `完成了${furniture.workType || '工作'}`, +5, 'working')
    } else if (furniture.interactionType === 'eat') {
      moodEngine.addEventMoodThought(pawn, 'ate_good')
      recordPawnEvent(pawn, '享用了一顿美餐', +5, 'eating')
    } else if (furniture.interactionType === 'social') {
      moodEngine.addEventMoodThought(pawn, 'social_chat')
      recordPawnEvent(pawn, '和朋友聊了天', +8, 'socializing')
    }
  }

  pawn.currentActivity = 'idle'
  pawn.targetFurniture = null
  pawn.sprite.action = 'idle'
}

// 辅助：获取最紧急的需求
const getMostUrgentNeed = (pawn) => {
  const needs = pawn?.needs || {}
  let urgentNeed = null
  let lowestValue = 100

  for (const [name, data] of Object.entries(needs)) {
    if (data.value < lowestValue) {
      lowestValue = data.value
      urgentNeed = { name, value: data.value }
    }
  }

  return urgentNeed
}

// ========== 时间控制 ==========

const togglePause = () => {
  const s = state.value.time
  if (s.speedMode === 'pause') {
    // 从暂停恢复到上一个非暂停档位
    s.speedMode = s.previousSpeedMode || 'normal'
    s.isPaused = false
  } else {
    // 暂停当前档位
    s.previousSpeedMode = s.speedMode
    s.speedMode = 'pause'
    s.isPaused = true
  }
}

const setTimeSpeedMode = (mode) => {
  if (!TIME_SPEED_SETTINGS[mode]) return
  const s = state.value.time
  s.speedMode = mode
  s.isPaused = mode === 'pause'
}

const cycleTimeSpeed = () => {
  const currentIndex = TIME_SPEED_ORDER.indexOf(state.value.time.speedMode)
  const nextIndex = (currentIndex + 1) % TIME_SPEED_ORDER.length
  setTimeSpeedMode(TIME_SPEED_ORDER[nextIndex])
}

// ========== 日志 ==========

const addLog = (text) => {
  const s = state.value
  s.logs.push({ text, time: Date.now(), highlight: false })
  if (s.logs.length > MAX_LOG_COUNT) {
    s.logs = s.logs.slice(-MAX_LOG_COUNT)
  }
}

// 记录小人活动事件
const recordPawnEvent = (pawn, text, moodImpact = 0, activity = pawn.currentActivity) => {
  if (!pawn.eventLog) pawn.eventLog = []

  const gameTime = state.value.time
  const hour = String(gameTime.hourOfDay).padStart(2, '0')
  const day = gameTime.dayCount

  pawn.eventLog.push({
    time: Date.now(),
    gameTime: `第${day}天 ${hour}:00`,
    text,
    moodImpact,
    activity,
  })

  // 保留最近100条
  if (pawn.eventLog.length > 100) {
    pawn.eventLog = pawn.eventLog.slice(-100)
  }
}

// ========== 自由活动引擎 ==========

const freeActivityEngine = createFreeActivityEngine({
  pathfindEngine,
  moodEngine,
  addLog,
  recordPawnEvent,
})

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
    pawns: normalizePawnList(raw.pawns, raw.worldBookCharacterSignature === '__public__'),
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
  const defaultTime = {
    tick: 0,
    gameSeconds: 21600,  // 游戏开始时间：第1天 6:00（6*3600秒）
    dayCount: 1,
    hourOfDay: 6,
    speedMode: 'normal',  // 时间流速档位：pause, companion, normal, fast, ultra
    isPaused: true,
    dayPhase: 'morning',
    lightModifier: 1.0,
  }
  if (!raw || typeof raw !== 'object') return defaultTime

  // 计算游戏秒数（如果没有则根据 hourOfDay 计算）
  let gameSeconds = raw.gameSeconds
  if (!Number.isFinite(gameSeconds)) {
    const dayCount = Math.max(1, Number(raw.dayCount) || 1)
    const hourOfDay = Math.max(0, Math.min(23, Number(raw.hourOfDay) || 6))
    gameSeconds = (dayCount - 1) * 86400 + hourOfDay * 3600
  }

  // 兼容旧版本的 speedMode
  let speedMode = raw.speedMode || 'normal'
  if (!TIME_SPEED_SETTINGS[speedMode]) {
    speedMode = 'normal'
  }

  return {
    tick: Math.max(0, Number(raw.tick) || 0),
    gameSeconds: Math.max(0, gameSeconds),
    dayCount: Math.max(1, Number(raw.dayCount) || 1),
    hourOfDay: Math.max(0, Math.min(23, Number(raw.hourOfDay) || 6)),
    speedMode,
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

const normalizePawnList = (raw, allowEmpty = false) => {
  const defaultList = [createDefaultPawn(0, '工匠')]
  if (!Array.isArray(raw) || raw.length < 1) return allowEmpty ? [] : defaultList
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
    eventLog: normalizeEventLog(raw.eventLog) || [],
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

const normalizeEventLog = (raw) => {
  if (!Array.isArray(raw)) return []
  return raw.slice(-100).map(e => ({
    time: Number(e.time) || Date.now(),
    gameTime: String(e.gameTime || ''),
    text: String(e.text || ''),
    moodImpact: Number(e.moodImpact) || 0,
    activity: String(e.activity || 'unknown'),
  }))
}

const normalizeSprite = (raw) => {
  if (!raw || typeof raw !== 'object') return null

  let outfit = null
  if (raw.outfit && typeof raw.outfit === 'object') {
    outfit = {
      hair: String(raw.outfit.hair || 'short').slice(0, 20),
      eyes: String(raw.outfit.eyes || 'normal').slice(0, 20),
      top: String(raw.outfit.top || 'robe').slice(0, 20),
      bottom: String(raw.outfit.bottom || 'boots').slice(0, 20),
      accessory: String(raw.outfit.accessory || 'none').slice(0, 20),
    }
  }

  return {
    style: String(raw.style || 'knight'),
    palette: String(raw.palette || 'ember'),
    action: String(raw.action || 'idle'),
    facing: ['left', 'right', 'front', 'back'].includes(raw.facing) ? raw.facing : 'right',
    outfit,
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
        passable: true,  // 默认可通行
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

// 有路径的小人（用于可视化）
const pawnsWithPath = computed(() => {
  return pawnsInActiveRoom.value.filter(p => p.path && p.path.length > 0)
})

// 获取可交互家具列表（用于调试）
const getInteractableFurniture = () => {
  const furniture = activeRoom.value?.furniture || []
  return furniture.filter(f => f.interactable).slice(0, 10)
}

// 生成路径点字符串（用于SVG polyline）
const getPathPoints = (pawn) => {
  if (!pawn.path || pawn.path.length === 0) return ''
  const points = []
  // 从当前位置开始
  points.push(`${pawn.position.x * ROOM_CELL_SIZE + ROOM_CELL_SIZE / 2},${pawn.position.y * ROOM_CELL_SIZE + ROOM_CELL_SIZE / 2}`)
  // 添加路径上的每个点
  for (const point of pawn.path) {
    points.push(`${point.x * ROOM_CELL_SIZE + ROOM_CELL_SIZE / 2},${point.y * ROOM_CELL_SIZE + ROOM_CELL_SIZE / 2}`)
  }
  return points.join(' ')
}

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
    return
  }

  // 存储家具或售货机：任何模式下都可以点击查看（观看模式和编辑模式）
  if (!furniturePointerMoved) {
    if (furniture.kind === 'storage' || furniture.kind === 'vending') {
      state.value.selectedFurnitureId = furniture.id
      showFurnitureOverlay.value = true
    }
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

// ========== 家具库存操作 ==========

// 处理从存储家具取出物品
const handleRetrieveItem = ({ furnitureId, itemId, amount }) => {
  const room = getOrCreateRoom()
  const furniture = room.furniture.find(f => f.id === furnitureId)
  if (!furniture) return

  // inventory 可能是数组，也可能是 { items: [] } 对象
  const invArray = Array.isArray(furniture.inventory) ? furniture.inventory : (furniture.inventory?.items || [])
  if (invArray.length === 0) return

  const item = invArray.find(i => i.id === itemId)
  if (!item || item.amount < amount) {
    addLog('物品数量不足')
    return
  }

  // 取出物品（简化处理：直接消耗掉）
  item.amount -= amount
  if (item.amount <= 0) {
    const index = invArray.indexOf(item)
    invArray.splice(index, 1)
  }

  addLog(`从 ${furniture.name} 取出 ${item.name} x${amount}`)
  schedulePersist()
}

// 处理从售货机购买商品（存入最近的存储家具）
const handlePurchaseItem = ({ furnitureId, templateId, amount }) => {
  const room = getOrCreateRoom()
  const furniture = room.furniture.find(f => f.id === furnitureId)
  if (!furniture || furniture.kind !== 'vending' || !furniture.shopInventory) return

  // 使用全局经济系统
  const result = itemEngine.purchaseFromShop(playerState.economy, furniture.shopInventory, templateId, amount)
  if (result.success) {
    // 找最近的存储家具（有容量的）
    const storageFurniture = findNearestStorageFurniture(furniture, room)
    if (storageFurniture) {
      // 创建物品实例并存入存储家具
      const newItem = {
        id: `item-${Date.now().toString(36)}`,
        name: result.item.name,
        type: result.item.type,
        effect: { ...result.item.effect },
        amount: amount,
        price: result.item.price,
      }
      storageFurniture.inventory.push(newItem)
      addLog(`购买了 ${result.item.name}，花费 ${result.cost} 金币，存入 ${storageFurniture.name}`)
    } else {
      // 没有存储家具，提示用户
      addLog(`购买了 ${result.item.name}，花费 ${result.cost} 金币（无处存放，请添加存储家具）`)
    }
    schedulePersist()
  } else if (result.error === 'not_enough_money') {
    addLog('金币不足，无法购买')
  } else if (result.error === 'out_of_stock') {
    addLog('商品已售罄')
  }
}

// 找最近的存储家具（有容量的）
const findNearestStorageFurniture = (sourceFurniture, room) => {
  const storageList = room.furniture.filter(f =>
    f.kind === 'storage' &&
    f.inventory &&
    f.inventory.length < f.inventoryCapacity
  )

  if (storageList.length === 0) return null

  // 计算距离，找最近的
  let nearest = null
  let minDist = Infinity
  for (const storage of storageList) {
    const dist = Math.abs(storage.x - sourceFurniture.x) + Math.abs(storage.y - sourceFurniture.y)
    if (dist < minDist) {
      minDist = dist
      nearest = storage
    }
  }

  return nearest
}

// 处理向存储家具添加物品
const handleAddItemToStorage = ({ furnitureId }) => {
  // 简化处理：添加一个默认食物
  const room = getOrCreateRoom()
  const furniture = room.furniture.find(f => f.id === furnitureId)
  if (!furniture) return

  // inventory 可能是数组，也可能是 { items: [] } 对象
  // 统一转换为数组结构
  if (!furniture.inventory) {
    furniture.inventory = []  // 初始化为数组
  }
  const invArray = Array.isArray(furniture.inventory) ? furniture.inventory : (furniture.inventory.items || [])
  if (!Array.isArray(furniture.inventory) && furniture.inventory.items) {
    // 如果是对象结构，使用 items 数组
    furniture.inventory.items = invArray
  }

  if (invArray.length >= (furniture.inventoryCapacity || 50)) {
    addLog('库存已满')
    return
  }

  // 创建默认食物
  const newItem = itemEngine.createItem('food-simple', 'food', 3)
  invArray.push(newItem)
  // 确保数组引用正确
  if (!Array.isArray(furniture.inventory)) {
    furniture.inventory.items = invArray
  }

  addLog(`向 ${furniture.name} 存入 ${newItem.name} x${newItem.amount}`)
  schedulePersist()
}

// 处理上帝模式调节需求值
const handleUpdateNeed = ({ pawnId, needType, value }) => {
  const pawn = state.value.pawns.find(p => p.id === pawnId)
  if (pawn && pawn.needs?.[needType]) {
    pawn.needs[needType].value = Math.max(0, Math.min(100, Number(value)))
    schedulePersist()

    // 立即触发AI检查（即使暂停状态）
    if (!pawn.moving && pawn.currentActivity === 'idle') {
      const room = getOrCreateRoom()
      runPawnAI(pawn, room)
    }
  }
}

// 处理换装保存
const handleSaveOutfit = ({ outfit, palette }) => {
  const pawn = selectedPawn.value
  if (!pawn || !pawn.sprite) return

  pawn.sprite.outfit = { ...outfit }
  // 清除旧版 style 以切换到部件化系统
  delete pawn.sprite.style

  if (palette) {
    pawn.sprite.palette = palette
  }

  pawnSpriteResolver.clearCache()
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
  if (placementPreview.value) return

  // 选中角色（观看模式和编辑模式都可以）
  selectPawn(pawn)

  // 只有编辑模式下长按才显示方向控制
  if (!editMode.value) return

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
  if (placementPreview.value) return
  if (e.button !== 0) return // 只响应左键

  // 选中角色（观看模式和编辑模式都可以）
  selectPawn(pawn)

  // 只有编辑模式下长按才显示方向控制
  if (!editMode.value) return

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

// ========== 房间导航 ==========

const toggleRoomGroup = (groupId) => {
  const set = expandedRoomGroups.value
  if (set.has(groupId)) set.delete(groupId)
  else set.add(groupId)
  expandedRoomGroups.value = new Set(set)
}

const isGroupExpanded = (groupId) => expandedRoomGroups.value.has(groupId)

const enterBedroom = async (characterId) => {
  currentRoomMode.value = 'bedroom'
  currentPublicRoomId.value = null
  await selectCharacter(characterId)
}

const enterPublicRoom = async (roomId) => {
  currentRoomMode.value = 'public'
  currentPublicRoomId.value = roomId
  showCharacterSelect.value = false
  loading.value = true

  try {
    const worldBookId = currentWorldBook.value?.id || 'default_world_book'
    const savedState = await loadPublicRoomState(kvStorage, worldBookId, roomId)

    if (isUnmounted.value) return

    if (savedState) {
      // 合并世界书级别家具库
      const furnitureKey = resolveFurnitureLibraryKey(worldBookId)
      const furnitureLib = await kvStorage.get(furnitureKey)
      if (Array.isArray(furnitureLib) && furnitureLib.length > 0) {
        savedState.customFurnitureLibrary = furnitureLib
      }
      state.value = normalizeState(savedState)
    } else {
      const registryRoom = publicRoomRegistry.value.find(r => r.id === roomId)
      state.value = buildDefaultPublicRoomState(registryRoom?.name || '公共区域')
    }

    if (!state.value.customFurnitureLibrary) state.value.customFurnitureLibrary = []
    customFurnitureLibrary.value = state.value.customFurnitureLibrary
  } catch (e) {
    console.error('[RoomSimulation] Load public room error:', e)
    if (isUnmounted.value) return
    state.value = buildDefaultPublicRoomState('公共区域')
  }

  if (isUnmounted.value) return
  loading.value = false
  await nextTick()
  requestAnimationFrame(updateCanvasSize)
}

const backToRoomNav = async () => {
  if (currentRoomMode.value === 'public' && currentPublicRoomId.value) {
    state.value.customFurnitureLibrary = customFurnitureLibrary.value
    const worldBookId = currentWorldBook.value?.id || 'default_world_book'
    await savePublicRoomState(kvStorage, worldBookId, currentPublicRoomId.value, state.value)
  } else if (currentRoomMode.value === 'bedroom') {
    state.value.customFurnitureLibrary = customFurnitureLibrary.value
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    await persistStateSnapshot({
      storage: kvStorage, key: storageScopeKey.value,
      state: state.value, normalizeState,
    })
  }

  if (isUnmounted.value) return
  showCharacterSelect.value = true
  selectedCharacterId.value = null
  currentRoomMode.value = null
  currentPublicRoomId.value = null
}

const loadPublicRooms = async () => {
  const worldBookId = currentWorldBook.value?.id || 'default_world_book'
  const registry = await loadPublicRoomRegistry(kvStorage, worldBookId)
  if (isUnmounted.value) return
  publicRoomRegistry.value = registry
}

const openAddRoomModal = () => { newRoomName.value = ''; addRoomModalOpen.value = true }
const closeAddRoomModal = () => { addRoomModalOpen.value = false; newRoomName.value = '' }

const confirmAddRoom = async () => {
  const name = newRoomName.value.trim()
  if (!name) return

  const room = { id: `public-room-${Date.now().toString(36)}`, name, createdAt: Date.now() }
  publicRoomRegistry.value = [...publicRoomRegistry.value, room]

  const worldBookId = currentWorldBook.value?.id || 'default_world_book'
  await savePublicRoomRegistry(kvStorage, worldBookId, publicRoomRegistry.value)

  closeAddRoomModal()
  await enterPublicRoom(room.id)
}

const handleDeletePublicRoom = async (roomId) => {
  const worldBookId = currentWorldBook.value?.id || 'default_world_book'
  await deletePublicRoom(kvStorage, worldBookId, roomId)
  publicRoomRegistry.value = publicRoomRegistry.value.filter(r => r.id !== roomId)
}

const showComingSoon = (text) => {
  comingSoonMsg.value = text || '即将开放'
  setTimeout(() => { comingSoonMsg.value = '' }, 2000)
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

  // 显示房间导航面板
  showCharacterSelect.value = true
  await loadPublicRooms()

  startSimulationLoop()
  startDecayLoop()
  startMoodDecayLoop()
  startSpeechBubbleLoop()
  startLightUpdateLoop()
  startIdleActionLoop()
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
  stopIdleActionLoop()
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
    <!-- 房间导航面板 -->
    <div v-if="showCharacterSelect" class="room-nav-overlay">
      <div class="room-nav-panel">
        <div class="room-nav-header">
          <h2>房间模拟</h2>
          <button class="room-nav-close" @click="panelOpen = false">✕</button>
        </div>

        <!-- 寝室分组 -->
        <div class="room-nav-group">
          <div class="room-nav-group-header" @click="toggleRoomGroup('bedroom')">
            <span class="group-toggle" :class="{ expanded: isGroupExpanded('bedroom') }">▶</span>
            <span class="group-icon">🛏️</span>
            <span class="group-title">寝室</span>
            <span class="group-count">{{ bedroomRooms.length }}</span>
          </div>
          <div v-show="isGroupExpanded('bedroom')" class="room-nav-group-items">
            <div
              v-for="room in bedroomRooms"
              :key="room.id"
              class="room-nav-item"
              @click="enterBedroom(room.id)"
            >
              <div v-if="room.avatar" class="room-nav-avatar">
                <img :src="room.avatar" alt="" />
              </div>
              <div v-else class="room-nav-item-icon">{{ room.icon }}</div>
              <span class="room-nav-item-name">{{ room.name }}</span>
            </div>
          </div>
        </div>

        <!-- 公共区域分组 -->
        <div class="room-nav-group">
          <div class="room-nav-group-header" @click="toggleRoomGroup('public')">
            <span class="group-toggle" :class="{ expanded: isGroupExpanded('public') }">▶</span>
            <span class="group-icon">🏠</span>
            <span class="group-title">公共区域</span>
            <span class="group-count">{{ publicRooms.length }}</span>
          </div>
          <div v-show="isGroupExpanded('public')" class="room-nav-group-items">
            <div
              v-for="room in publicRooms"
              :key="room.id"
              class="room-nav-item"
              @click="enterPublicRoom(room.id)"
            >
              <span class="room-nav-item-icon">{{ room.icon }}</span>
              <span class="room-nav-item-name">{{ room.name }}</span>
              <button class="room-nav-item-delete" @click.stop="handleDeletePublicRoom(room.id)" title="删除">✕</button>
            </div>
            <div class="room-nav-item room-nav-item-add" @click="openAddRoomModal">
              <span class="room-nav-item-icon">＋</span>
              <span class="room-nav-item-name">新增房间</span>
            </div>
          </div>
        </div>

        <!-- 探险区域分组 -->
        <div class="room-nav-group">
          <div class="room-nav-group-header" @click="toggleRoomGroup('adventure')">
            <span class="group-toggle" :class="{ expanded: isGroupExpanded('adventure') }">▶</span>
            <span class="group-icon">⚔️</span>
            <span class="group-title">探险区域</span>
          </div>
          <div v-show="isGroupExpanded('adventure')" class="room-nav-group-items">
            <div
              v-for="zone in adventureZones"
              :key="zone.id"
              class="room-nav-item room-nav-item-placeholder"
              @click="showComingSoon(zone.name + ' 即将开放')"
            >
              <span class="room-nav-item-icon">{{ zone.icon }}</span>
              <span class="room-nav-item-name">{{ zone.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增房间弹窗 -->
    <div v-if="addRoomModalOpen" class="room-nav-modal-overlay" @click.self="closeAddRoomModal">
      <div class="room-nav-modal">
        <h3>新增公共区域</h3>
        <input
          v-model="newRoomName"
          class="room-nav-modal-input"
          placeholder="输入房间名字"
          @keyup.enter="confirmAddRoom"
        />
        <div class="room-nav-modal-actions">
          <button class="modal-btn cancel" @click="closeAddRoomModal">取消</button>
          <button class="modal-btn confirm" @click="confirmAddRoom">确定</button>
        </div>
      </div>
    </div>

    <!-- 即将开放提示 -->
    <div v-if="comingSoonMsg" class="room-nav-coming-soon">
      {{ comingSoonMsg }}
    </div>

    <!-- 房间内容（选择寝室或公共区域后显示） -->
    <template v-if="!showCharacterSelect && (selectedCharacter || currentPublicRoomId)">
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

      <!-- 路径可视化层 -->
      <svg
        class="room-sim-path-layer"
        :style="{
          width: `${dynamicGridWidth.value * ROOM_CELL_SIZE}px`,
          height: `${dynamicGridHeight.value * ROOM_CELL_SIZE}px`,
        }"
      >
        <g v-for="pawn in pawnsWithPath" :key="pawn.id">
          <!-- 路径线条 -->
          <polyline
            :points="getPathPoints(pawn)"
            fill="none"
            stroke="#ff6b6b"
            stroke-width="3"
            stroke-opacity="0.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <!-- 目标点标记 -->
          <circle
            v-if="pawn.path && pawn.path.length > 0"
            :cx="pawn.path[pawn.path.length - 1].x * ROOM_CELL_SIZE + ROOM_CELL_SIZE / 2"
            :cy="pawn.path[pawn.path.length - 1].y * ROOM_CELL_SIZE + ROOM_CELL_SIZE / 2"
            r="8"
            fill="#ff6b6b"
            fill-opacity="0.6"
          />
          <!-- 当前位置标记 -->
          <circle
            :cx="pawn.position.x * ROOM_CELL_SIZE + ROOM_CELL_SIZE / 2"
            :cy="pawn.position.y * ROOM_CELL_SIZE + ROOM_CELL_SIZE / 2"
            r="6"
            fill="#4ecdc4"
            fill-opacity="0.8"
          />
          <!-- 路径节点 -->
          <circle
            v-for="(point, idx) in pawn.path"
            :key="idx"
            :cx="point.x * ROOM_CELL_SIZE + ROOM_CELL_SIZE / 2"
            :cy="point.y * ROOM_CELL_SIZE + ROOM_CELL_SIZE / 2"
            r="4"
            fill="#ffd93d"
            fill-opacity="0.6"
          />
        </g>
      </svg>

      <!-- 小人层 -->
      <div
        v-for="pawn in pawnsSortedByY"
        :key="pawn.id"
        :ref="el => { if (pawn.id === state.selectedPawnId) setSelectedPawnEl(el) }"
        class="room-sim-pawn"
        :class="{ selected: state.selectedPawnId === pawn.id, moving: pawn.moving }"
        :style="getPawnStyle(pawn)"
        @click="(e) => { if (!placementPreview) { e.stopPropagation(); selectPawn(pawn); } }"
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
      @back-to-select="backToRoomNav"
      @reset-room="handleResetRoom"
      @adjust-ambient-light="handleAdjustAmbientLight"
    />

    <!-- 小人信息浮层 -->
    <PawnInfoOverlay
      :pawn="selectedPawn"
      :visible="showPawnOverlay"
      @close="showPawnOverlay = false; state.selectedPawnId = ''"
      @update-need="handleUpdateNeed"
      @show-outfit="showPawnOutfitPanel = true"
    />

    <!-- 换装面板 -->
    <PawnOutfitPanel
      :pawn="selectedPawn"
      :visible="showPawnOutfitPanel"
      @close="showPawnOutfitPanel = false"
      @save="handleSaveOutfit"
    />

    <!-- 调试信息面板 -->
    <div v-if="showDebugPanel" class="debug-panel">
      <div class="debug-header">
        <span>调试信息</span>
        <button @click="showDebugPanel = false">✕</button>
      </div>
      <div class="debug-content">
        <div v-for="pawn in state.pawns" :key="pawn.id" class="debug-pawn">
          <div class="debug-pawn-name">{{ pawn.name }}</div>
          <div class="debug-row">
            <span>活动:</span>
            <span>{{ pawn.currentActivity }}</span>
          </div>
          <div class="debug-row">
            <span>移动:</span>
            <span>{{ pawn.moving ? '是' : '否' }}</span>
          </div>
          <div class="debug-row">
            <span>位置:</span>
            <span>{{ pawn.position?.x?.toFixed(1) || 0 }}, {{ pawn.position?.y?.toFixed(1) || 0 }}</span>
          </div>
          <div class="debug-row">
            <span>路径:</span>
            <span>{{ pawn.path?.length || 0 }}步</span>
          </div>
          <div class="debug-row">
            <span>路径索引:</span>
            <span>{{ pawn.pathIndex }}</span>
          </div>
          <div class="debug-row">
            <span>目标家具:</span>
            <span>{{ pawn.targetFurniture || '无' }}</span>
          </div>
          <div class="debug-needs">
            <span>需求:</span>
            <div v-for="[key, need] in Object.entries(pawn.needs || {})" :key="key" class="debug-need">
              <span>{{ key }}:</span>
              <span :class="{ critical: need?.value <= need?.threshold }">{{ need?.value?.toFixed(1) || 0 }}</span>
            </div>
          </div>
        </div>
        <div class="debug-room">
          <div class="debug-row">
            <span>网格:</span>
            <span>{{ dynamicGridWidth?.value || 0 }}x{{ dynamicGridHeight?.value || 0 }}</span>
          </div>
          <div class="debug-row">
            <span>动态tiles:</span>
            <span>{{ dynamicTiles?.value?.length || 0 }}</span>
          </div>
          <div class="debug-row">
            <span>游戏时间:</span>
            <span>第{{ state?.time?.dayCount || 1 }}天 {{ String(state?.time?.hourOfDay || 6).padStart(2, '0') }}:{{ String(Math.floor((state?.time?.gameSeconds % 3600) / 60)).padStart(2, '0') }}</span>
          </div>
          <div class="debug-time-controls">
            <span>时间流速:</span>
            <div class="time-speed-buttons">
              <button
                v-for="mode in ['companion', 'normal', 'fast', 'ultra']"
                :key="mode"
                :class="{ active: state?.time?.speedMode === mode }"
                @click="setTimeSpeedMode(mode)"
              >
                {{ TIME_SPEED_SETTINGS[mode]?.label || mode }}
              </button>
              <button
                :class="{ active: state?.time?.speedMode === 'pause' }"
                @click="togglePause"
              >
                {{ state?.time?.speedMode === 'pause' ? '继续' : '暂停' }}
              </button>
            </div>
          </div>
          <div class="debug-row">
            <span>家具总数:</span>
            <span>{{ activeRoom?.furniture?.length || 0 }}</span>
          </div>
          <div class="debug-furniture">
            <span>可交互家具:</span>
            <div v-for="f in getInteractableFurniture()" :key="f.id" class="debug-furn-item">
              <span>{{ f.name }}</span>
              <span>k={{ f.kind }} int={{ f.interactable }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 家具库存信息浮层 -->
    <FurnitureInfoOverlay
      :furniture="selectedFurniture"
      :visible="showFurnitureOverlay"
      :currency="playerState.economy"
      @close="showFurnitureOverlay = false; state.selectedFurnitureId = ''"
      @retrieve-item="handleRetrieveItem"
      @purchase-item="handlePurchaseItem"
      @add-item="handleAddItemToStorage"
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
/* 房间导航面板 */
.room-nav-overlay {
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

.room-nav-panel {
  background: #2a2a32;
  border-radius: 12px;
  width: 90%;
  max-width: 420px;
  max-height: 80vh;
  overflow-y: auto;
  color: #eaeaea;
  display: flex;
  flex-direction: column;
}

.room-nav-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #3a3a42;
  position: sticky;
  top: 0;
  background: #2a2a32;
  z-index: 1;
}

.room-nav-header h2 {
  margin: 0;
  font-size: 18px;
}

.room-nav-close {
  background: transparent;
  border: none;
  color: #aaa;
  font-size: 18px;
  padding: 4px 8px;
  cursor: pointer;
}

/* 分组 */
.room-nav-group {
  border-bottom: 1px solid #1a1a22;
}

.room-nav-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  cursor: pointer;
  background: #2a2a32;
  transition: background 0.15s;
}

.room-nav-group-header:hover {
  background: #3a3a42;
}

.group-toggle {
  font-size: 10px;
  transition: transform 0.2s;
  color: #aaa;
}

.group-toggle.expanded {
  transform: rotate(90deg);
}

.group-icon {
  font-size: 16px;
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  flex: 1;
}

.group-count {
  font-size: 12px;
  color: #aaa;
  background: #3a3a42;
  padding: 2px 8px;
  border-radius: 10px;
}

.room-nav-group-items {
  padding: 4px 12px 8px;
}

/* 房间条目 */
.room-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.room-nav-item:hover {
  background: #3a3a42;
}

.room-nav-item-icon {
  font-size: 18px;
  min-width: 24px;
  text-align: center;
}

.room-nav-item-name {
  font-size: 13px;
  flex: 1;
}

.room-nav-item-delete {
  background: transparent;
  border: none;
  color: #666;
  font-size: 12px;
  padding: 2px 6px;
  cursor: pointer;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}

.room-nav-item:hover .room-nav-item-delete {
  opacity: 1;
}

.room-nav-item-delete:hover {
  color: #e04040;
}

/* 新增按钮 */
.room-nav-item-add {
  color: #6a8a6a;
}

.room-nav-item-add:hover {
  background: #2a3a2a;
}

.room-nav-item-add .room-nav-item-icon {
  color: #8aaa8a;
}

/* 占位条目 */
.room-nav-item-placeholder {
  opacity: 0.6;
  cursor: pointer;
}

.room-nav-item-placeholder:hover {
  background: #3a3a3a;
  opacity: 0.8;
}

/* 头像 */
.room-nav-avatar {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  overflow: hidden;
  background: #4a4a52;
  display: flex;
  align-items: center;
  justify-content: center;
}

.room-nav-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 弹窗 */
.room-nav-modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.room-nav-modal {
  background: #2a2a32;
  border-radius: 12px;
  padding: 24px;
  width: 80%;
  max-width: 320px;
  color: #eaeaea;
}

.room-nav-modal h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  text-align: center;
}

.room-nav-modal-input {
  width: 100%;
  padding: 10px 12px;
  background: #1a1a22;
  border: 1px solid #3a3a42;
  border-radius: 6px;
  color: #eaeaea;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  margin-bottom: 16px;
}

.room-nav-modal-input:focus {
  border-color: #6a8a6a;
}

.room-nav-modal-actions {
  display: flex;
  gap: 8px;
}

.modal-btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.modal-btn.cancel {
  background: #4a4a52;
  color: #eaeaea;
}

.modal-btn.confirm {
  background: #5a7a5a;
  color: #eaeaea;
}

.modal-btn.confirm:hover {
  background: #6a8a6a;
}

/* 即将开放提示 */
.room-nav-coming-soon {
  position: absolute;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: #3a3a42;
  color: #eaeaea;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 3000;
  animation: fadeInOut 2s ease-in-out;
}

@keyframes fadeInOut {
  0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
  20% { opacity: 1; transform: translateX(-50%) translateY(0); }
  80% { opacity: 1; }
  100% { opacity: 0; }
}

/* 原有角色选择样式（保留兼容） */
.character-select-overlay {
  display: none;
}

.character-select-panel {
  display: none;
}

.character-grid {
  display: none;
}

.character-card {
  display: none;
}

.character-avatar {
  display: none;
}

.character-avatar img {
  display: none;
}

.avatar-placeholder {
  display: none;
}

.character-info {
  display: none;
}

.character-name {
  display: none;
}

.character-type {
  display: none;
}

.close-select-btn {
  display: none;
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

/* 路径可视化层 */
.room-sim-path-layer {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 50;
  pointer-events: none;
}

/* 调试面板 */
.debug-panel {
  position: fixed;
  top: 60px;
  right: 10px;
  width: 280px;
  max-height: 400px;
  background: rgba(30, 30, 40, 0.95);
  border: 1px solid #4a4a5a;
  border-radius: 8px;
  z-index: 200;
  overflow-y: auto;
  font-size: 12px;
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #3a3a4a;
  border-radius: 8px 8px 0 0;
}

.debug-header span {
  font-weight: 600;
}

.debug-header button {
  background: transparent;
  border: none;
  color: #aaa;
  cursor: pointer;
  font-size: 14px;
}

.debug-content {
  padding: 8px 12px;
}

.debug-pawn {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #3a3a4a;
}

.debug-pawn-name {
  font-weight: 600;
  color: #8a8aff;
  margin-bottom: 4px;
}

.debug-row {
  display: flex;
  justify-content: space-between;
  margin: 2px 0;
}

.debug-row span:first-child {
  color: #888;
}

.debug-needs {
  margin-top: 4px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
}

.debug-need {
  display: flex;
  justify-content: space-between;
}

.debug-need span:first-child {
  color: #666;
  font-size: 10px;
}

.debug-need .critical {
  color: #ff6b6b;
  font-weight: 600;
}

.debug-room {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #3a3a4a;
}

.debug-time-controls {
  margin: 6px 0;
}

.debug-time-controls span {
  color: #888;
  font-size: 11px;
  display: block;
  margin-bottom: 4px;
}

.time-speed-buttons {
  display: flex;
  gap: 4px;
}

.time-speed-buttons button {
  padding: 4px 8px;
  background: #4a4a5a;
  border: none;
  border-radius: 4px;
  color: #aaa;
  font-size: 11px;
  cursor: pointer;
}

.time-speed-buttons button.active {
  background: #6a8a6a;
  color: #eaeaea;
}

.debug-furniture {
  margin-top: 6px;
}

.debug-furniture span:first-child {
  color: #888;
  font-size: 11px;
}

.debug-furn-item {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #aaa;
  margin: 2px 0;
}

.debug-furn-item span:first-child {
  color: #6a8a6a;
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