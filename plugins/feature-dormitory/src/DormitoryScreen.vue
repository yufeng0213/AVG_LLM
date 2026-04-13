
<script setup>
import './DormitoryScreen.css'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  getActiveWorldBookId,
  loadWorldBooks,
  setActiveWorldBookId,
} from '../../../src/worldbook/worldBookStore.js'
import { generatePhoneSmsReply, generateDormChatReply } from '../../../src/llm'
import { getValidatedActiveConfig, callChatCompletion } from '../../../src/llm/llmService.core.js'
import { isAndroid } from '../../../src/utils/platform.js'
import RedPacket from './components/RedPacket.vue'
import TRPGPanel from './components/TRPGPanel.vue'
import { createRedPacket, addRedPacket, recordSentRedPacket } from './redPacketService.js'
import { useDormShop } from './composables/useDormShop.js'
import { useDormGift } from './composables/useDormGift.js'
import { useDormTask } from './composables/useDormTask.js'
import { useDormDiary } from './composables/useDormDiary.js'
import { useDormRedPacket } from './composables/useDormRedPacket.js'
import { useDormAppointment } from './composables/useDormAppointment.js'
import { useDormSubScene } from './composables/useDormSubScene.js'
import AvatarFrameScreen from './components/AvatarFrameScreen.vue'
import { useAvatarFrame } from './composables/useAvatarFrame.js'
import { useAvatar } from './composables/useAvatar.js'

// 子组件导入
import WorldBookCardView from './components/WorldBookCardView.vue'
import CharacterGridView from './components/CharacterGridView.vue'
import CharacterRoomView from './components/CharacterRoomView.vue'
import DriftBottlePanel from './components/DriftBottlePanel.vue'
import WorldBookShopModal from './components/WorldBookShopModal.vue'
import TaskBoardModal from './components/TaskBoardModal.vue'
import TaskExecutionModal from './components/TaskExecutionModal.vue'
import AppointmentModal from './components/AppointmentModal.vue'
import TeamSelectModal from './components/TeamSelectModal.vue'
import BattleScreen from './components/BattleScreen.vue'
import { markTaskCompletable, saveTaskBoard } from './taskBoardService.js'

const emit = defineEmits(['back'])

const VIEW_BOOK_CARD = 'book-card'
const VIEW_CHARACTER_GRID = 'character-grid'
const VIEW_CHARACTER_ROOM = 'character-room'

const DEFAULT_PORTRAIT_PATH = './data/lihui/default.png'
const DORM_RUNTIME_STORAGE_KEY = 'avg_llm_dormitory_runtime_v1'
const DORM_DRIFT_BOTTLE_POOL_STORAGE_KEY = 'avg_llm_dormitory_drift_bottle_pool_v1'
const DORM_WORLD_BOOK_ECONOMY_STORAGE_KEY = 'avg_llm_dormitory_world_book_economy_v1'
const DORM_WORLD_BOOK_INVENTORY_STORAGE_KEY = 'avg_llm_dormitory_world_book_inventory_v1'
const DORM_AFFECTION_MIN = 0
const DORM_AFFECTION_MAX = 100
const DORM_ENERGY_MIN = 0
const DORM_ENERGY_MAX = 100
const DORM_JOURNAL_LIMIT = 18
const DORM_CHAT_HISTORY_LIMIT = 24
const CARD_SWIPE_TRIGGER_PX = 52
const DORM_SCENE_FACILITY_MIN_LEVEL = 1
const DORM_SCENE_FACILITY_MAX_LEVEL = 5
const DORM_SCENE_FACILITY_BONUS_STEP = 0.12
const DORM_SCENE_FACILITY_UPGRADE_ENERGY_COST = 12
const DORM_TIME_SLOT_LABELS = ['早晨', '午后', '夜晚']
const DORM_TIME_SLOT_IDS = ['morning', 'afternoon', 'night']
const DORM_TIME_SLOT_COUNT = DORM_TIME_SLOT_LABELS.length
const DORM_DAILY_WISH_COUNT = 2
const DORM_DRIFT_BOTTLE_POOL_LIMIT = 200
const DORM_DRIFT_BOTTLE_INBOX_LIMIT = 24
const DORM_DRIFT_BOTTLE_SEEN_LIMIT = 360
const DORM_DRIFT_BOTTLE_TEXT_LIMIT = 140
const DORM_DRIFT_BOTTLE_REPLY_TEXT_LIMIT = 180
const DORM_DRIFT_BOTTLE_FEEDBACK_TEXT_LIMIT = 30
const DORM_DRIFT_BOTTLE_FOLLOW_UP_LIMIT = 3
const DORM_DRIFT_BOTTLE_DAILY_THROW_LIMIT = 1
const DORM_DRIFT_BOTTLE_DAILY_PICK_LIMIT = 3
const DORM_RELATIONSHIP_STAGE_LIBRARY = [
  { id: 'stranger', label: '陌生', minAffection: 0 },
  { id: 'familiar', label: '熟悉', minAffection: 30 },
  { id: 'intimate', label: '亲密', minAffection: 60 },
  { id: 'bond', label: '羁绊', minAffection: 82 },
]
const DORM_RELATIONSHIP_STAGE_ID_SET = new Set(DORM_RELATIONSHIP_STAGE_LIBRARY.map((stage) => stage.id))
const DORM_RELATIONSHIP_STAGE_INDEX_MAP = DORM_RELATIONSHIP_STAGE_LIBRARY.reduce((accumulator, stage, index) => {
  accumulator[stage.id] = index
  return accumulator
}, {})

const DORM_DAILY_WISH_TYPE_LABELS = {
  chat: '聊天',
  gift: '送礼',
  rest: '休息',
  event: '事件',
  scene: '场景',
  upgrade: '升级',
}

const DORM_QUICK_ACTION_OPTIONS = [
  { id: 'chat', label: '聊天' },
  { id: 'gift', label: '送礼' },
  { id: 'rest', label: '休息' },
  { id: 'event', label: '触发事件' },
  { id: 'outing', label: '邀请出去玩' },
]

const DORM_QUICK_ACTION_LABEL_MAP = DORM_QUICK_ACTION_OPTIONS.reduce((accumulator, option) => {
  accumulator[option.id] = option.label
  return accumulator
}, {})

const currentView = ref(VIEW_BOOK_CARD)
const worldBooks = ref([])
const activeCardIndex = ref(0)
const cardTransitionName = ref('card-slide-next')
const activeCharacterIndex = ref(0)
const characterTransitionName = ref('card-slide-next')
const selectedCharacterId = ref('')
const portraitUrlMap = ref({})
const defaultPortraitUrl = ref(DEFAULT_PORTRAIT_PATH)
const isLoadingBooks = ref(false)
const isLoadingCharacters = ref(false)
const dormRuntimeMap = ref({})
const worldBookEconomyMap = ref({})
const worldBookInventoryMap = ref({})
const actionFeedback = ref('')
const activeDormEvent = ref(null)
const selectedSubSceneId = ref('')
const stageUpgradeToast = ref(null)
const selectedSubSceneActivityId = ref('')
const dormQuickActionType = ref('chat')
const activeDormOverlayPanelId = ref('interaction')
const isDormOverlayPanelExpanded = ref(false)
const isDormMenuOpen = ref(false)
const isDormNavMenuOpen = ref(false)
const dormChatDraft = ref('')
const isDormChatSending = ref(false)
const dormChatError = ref('')
const dormChatHistoryRef = ref(null)
const characterRoomViewRef = ref(null)
const scrollDormChatToBottom = async () => {
  await nextTick()
  const container = characterRoomViewRef.value?.dormChatHistoryRef || dormChatHistoryRef.value
  if (!container) return
  container.scrollTop = container.scrollHeight
}
const driftBottlePool = ref([])

// 对话框拖动调整高度
const dormChatOverlayHeight = ref(300) // 默认高度300px
const DORM_CHAT_OVERLAY_MIN_HEIGHT = 150 // 最小高度
const DORM_CHAT_OVERLAY_MAX_HEIGHT = 9999 // 最大高度（不限制）
let isDraggingResize = false
let dragStartY = 0
let dragStartHeight = 0

const startDragResize = (event) => {
  event.preventDefault()
  isDraggingResize = true
  dragStartY = event.clientY
  dragStartHeight = dormChatOverlayHeight.value
  document.addEventListener('mousemove', handleDragResize)
  document.addEventListener('mouseup', stopDragResize)
}

const startDragResizeTouch = (event) => {
  const touch = event.touches?.[0]
  if (!touch) return
  event.preventDefault()
  isDraggingResize = true
  dragStartY = touch.clientY
  dragStartHeight = dormChatOverlayHeight.value
  document.addEventListener('touchmove', handleDragResizeTouch, { passive: false })
  document.addEventListener('touchend', stopDragResizeTouch)
}

const handleDragResize = (event) => {
  if (!isDraggingResize) return
  const deltaY = dragStartY - event.clientY
  const newHeight = Math.max(DORM_CHAT_OVERLAY_MIN_HEIGHT, Math.min(DORM_CHAT_OVERLAY_MAX_HEIGHT, dragStartHeight + deltaY))
  dormChatOverlayHeight.value = newHeight
}

const handleDragResizeTouch = (event) => {
  if (!isDraggingResize) return
  event.preventDefault()
  const touch = event.touches?.[0]
  if (!touch) return
  const deltaY = dragStartY - touch.clientY
  const newHeight = Math.max(DORM_CHAT_OVERLAY_MIN_HEIGHT, Math.min(DORM_CHAT_OVERLAY_MAX_HEIGHT, dragStartHeight + deltaY))
  dormChatOverlayHeight.value = newHeight
}

const stopDragResize = () => {
  if (!isDraggingResize) return
  isDraggingResize = false
  document.removeEventListener('mousemove', handleDragResize)
  document.removeEventListener('mouseup', stopDragResize)
}

const stopDragResizeTouch = () => {
  if (!isDraggingResize) return
  isDraggingResize = false
  document.removeEventListener('touchmove', handleDragResizeTouch)
  document.removeEventListener('touchend', stopDragResizeTouch)
}
const driftBottleDraft = ref('')
const isDormDriftPicking = ref(false)
const driftFollowupPendingEntryId = ref('')

// 跑团面板 ref
const trpgPanelRef = ref(null)
const isTRPGPanelOpen = ref(false)

const handleLaunchTRPG = () => {
  isTRPGPanelOpen.value = true
  trpgPanelRef.value?.open()
}

const portraitImageCache = ref(new Map())
let characterPreloadToken = 0
let dormNotificationListener = null
let cardTouchStartX = 0
let cardTouchStartY = 0
let cardTouchTracking = false
let stageUpgradeToastTimer = null
let dormChatRequestToken = 0
let dormDriftPickRequestToken = 0
let dormDriftFollowupRequestToken = 0

const clampInt = (value, min, max, fallback = min) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

const randomInt = (min, max) => {
  const nextMin = Math.min(min, max)
  const nextMax = Math.max(min, max)
  return Math.floor(Math.random() * (nextMax - nextMin + 1)) + nextMin
}

const renderTemplate = (template, characterLabel) => {
  const safeTemplate = String(template || '').trim()
  const safeLabel = String(characterLabel || '角色').trim() || '角色'
  return safeTemplate.replaceAll('{char}', safeLabel)
}

const getDormRelationshipStageIndex = (stageId) => {
  const key = String(stageId || '').trim()
  if (!key) return 0
  return clampInt(
    DORM_RELATIONSHIP_STAGE_INDEX_MAP[key],
    0,
    DORM_RELATIONSHIP_STAGE_LIBRARY.length - 1,
    0,
  )
}

const getDormRelationshipStageLabel = (stageId) => {
  const key = String(stageId || '').trim()
  const matched = DORM_RELATIONSHIP_STAGE_LIBRARY.find((stage) => stage.id === key)
  return matched?.label || DORM_RELATIONSHIP_STAGE_LIBRARY[0].label
}

const resolveDormRelationshipStageByAffection = (affectionValue) => {
  const affection = clampInt(affectionValue, DORM_AFFECTION_MIN, DORM_AFFECTION_MAX, DORM_AFFECTION_MIN)
  let current = DORM_RELATIONSHIP_STAGE_LIBRARY[0]
  DORM_RELATIONSHIP_STAGE_LIBRARY.forEach((stage) => {
    if (affection >= stage.minAffection) current = stage
  })
  return current.id
}

const normalizeDormRelationshipStage = (stageId, affectionValue = DORM_AFFECTION_MIN) => {
  const key = String(stageId || '').trim()
  if (!DORM_RELATIONSHIP_STAGE_ID_SET.has(key)) {
    return resolveDormRelationshipStageByAffection(affectionValue)
  }
  return key
}

const clearStageUpgradeToast = () => {
  if (stageUpgradeToastTimer) {
    clearTimeout(stageUpgradeToastTimer)
    stageUpgradeToastTimer = null
  }
  stageUpgradeToast.value = null
}

const showStageUpgradeToast = ({
  previousStage = '',
  nextStage = '',
} = {}) => {
  const fromStage = normalizeDormRelationshipStage(previousStage, DORM_AFFECTION_MIN)
  const toStage = normalizeDormRelationshipStage(nextStage, DORM_AFFECTION_MIN)
  if (fromStage === toStage) return

  clearStageUpgradeToast()
  stageUpgradeToast.value = {
    id: `stage_toast_${Date.now()}`,
    fromLabel: getDormRelationshipStageLabel(fromStage),
    toLabel: getDormRelationshipStageLabel(toStage),
  }
  stageUpgradeToastTimer = setTimeout(() => {
    stageUpgradeToast.value = null
    stageUpgradeToastTimer = null
  }, 4200)
}

const normalizeCounterMap = (rawMap, limit = 24) => {
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return {}
  const next = {}
  Object.keys(rawMap)
    .slice(0, Math.max(1, limit))
    .forEach((key) => {
      const safeKey = String(key || '').trim()
      if (!safeKey) return
      next[safeKey] = clampInt(rawMap[key], 0, 9999, 0)
    })
  return next
}

const normalizeFacilityLevelMap = (rawMap, limit = 24) => {
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return {}
  const next = {}
  Object.keys(rawMap)
    .slice(0, Math.max(1, limit))
    .forEach((key) => {
      const safeKey = String(key || '').trim()
      if (!safeKey) return
      next[safeKey] = clampInt(
        rawMap[key],
        DORM_SCENE_FACILITY_MIN_LEVEL,
        DORM_SCENE_FACILITY_MAX_LEVEL,
        DORM_SCENE_FACILITY_MIN_LEVEL,
      )
    })
  return next
}

const normalizeStringArray = (rawList, limit = 8) => {
  if (!Array.isArray(rawList)) return []
  return rawList
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, Math.max(1, limit))
}

const getDormTimeSlotIdByIndex = (slotIndex) => {
  const safeIndex = clampInt(slotIndex, 0, DORM_TIME_SLOT_COUNT - 1, 0)
  return DORM_TIME_SLOT_IDS[safeIndex] || DORM_TIME_SLOT_IDS[0]
}

const pickWeightedItem = (items, getWeight) => {
  const source = Array.isArray(items) ? items : []
  if (source.length <= 0) return null

  const weighted = source
    .map((item, index) => {
      const weight = Number(getWeight?.(item, index)) || 0
      return { item, weight: Math.max(0, weight) }
    })
    .filter((entry) => entry.weight > 0)

  if (weighted.length <= 0) return source[randomInt(0, source.length - 1)] || null

  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0)
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return weighted[0].item || null

  let cursor = Math.random() * totalWeight
  for (const entry of weighted) {
    cursor -= entry.weight
    if (cursor <= 0) return entry.item
  }
  return weighted[weighted.length - 1]?.item || null
}

const normalizeDormEventOption = (rawOption, index = 0) => {
  const source = rawOption && typeof rawOption === 'object' ? rawOption : {}
  const affectionDelta = Number(source.affectionDelta) || 0
  const energyDelta = Number(source.energyDelta) || 0
  const previewAffection = Number(source.previewAffectionDelta)
  const previewEnergy = Number(source.previewEnergyDelta)
  return {
    id: String(source.id || `event_option_${index + 1}`).trim() || `event_option_${index + 1}`,
    label: String(source.label || `选项 ${index + 1}`).trim() || `选项 ${index + 1}`,
    affectionDelta,
    energyDelta,
    previewAffectionDelta: Number.isFinite(previewAffection) ? previewAffection : affectionDelta,
    previewEnergyDelta: Number.isFinite(previewEnergy) ? previewEnergy : energyDelta,
    mood: String(source.mood || '').trim(),
    message: String(source.message || '').trim(),
  }
}

const normalizeActiveDormEventState = (rawEvent) => {
  if (!rawEvent || typeof rawEvent !== 'object') return null
  const source = rawEvent
  const options = Array.isArray(source.options)
    ? source.options.map((option, index) => normalizeDormEventOption(option, index))
    : []
  if (options.length <= 0) return null

  return {
    id: String(source.id || 'dorm_event').trim() || 'dorm_event',
    title: String(source.title || '寝室事件').trim() || '寝室事件',
    description: String(source.description || '').trim(),
    source: String(source.source || '').trim() === 'scene' ? 'scene' : 'global',
    sourceSceneId: String(source.sourceSceneId || '').trim(),
    sourceSceneName: String(source.sourceSceneName || '').trim(),
    facilityLevel: clampInt(
      source.facilityLevel,
      DORM_SCENE_FACILITY_MIN_LEVEL,
      DORM_SCENE_FACILITY_MAX_LEVEL,
      DORM_SCENE_FACILITY_MIN_LEVEL,
    ),
    facilityBonusPercent: clampInt(source.facilityBonusPercent, 0, 400, 0),
    options,
  }
}

const buildDormEventOptionsWithPreview = (
  rawOptions,
  { facilityLevel = DORM_SCENE_FACILITY_MIN_LEVEL, enableFacilityBoost = false, charLabel = '角色' } = {},
) => {
  const source = Array.isArray(rawOptions) ? rawOptions : []
  return source.map((rawOption, index) => {
    const baseAffection = Number(rawOption?.affectionDelta) || 0
    const baseEnergy = Number(rawOption?.energyDelta) || 0
    const boosted = buildFacilityBoostedAction(
      { affectionDelta: baseAffection, energyDelta: baseEnergy },
      facilityLevel,
      enableFacilityBoost,
    )
    return normalizeDormEventOption(
      {
        ...rawOption,
        label: renderTemplate(rawOption?.label, charLabel),
        message: renderTemplate(rawOption?.message, charLabel),
        affectionDelta: baseAffection,
        energyDelta: baseEnergy,
        previewAffectionDelta: boosted.affectionDelta,
        previewEnergyDelta: boosted.energyDelta,
      },
      index,
    )
  })
}

const buildSingleDormEventState = (
  eventTemplate,
  {
    charLabel = '角色',
    source = 'global',
    sourceSceneId = '',
    sourceSceneName = '',
    facilityLevel = DORM_SCENE_FACILITY_MIN_LEVEL,
    facilityBonusPercent = 0,
  } = {},
) => {
  if (!eventTemplate) return null
  const state = {
    id: String(eventTemplate.id || 'dorm_event').trim() || 'dorm_event',
    title: String(eventTemplate.title || '寝室事件').trim() || '寝室事件',
    description: renderTemplate(eventTemplate.description, charLabel),
    source: source === 'scene' ? 'scene' : 'global',
    sourceSceneId: String(sourceSceneId || '').trim(),
    sourceSceneName: String(sourceSceneName || '').trim(),
    facilityLevel,
    facilityBonusPercent,
    options: buildDormEventOptionsWithPreview(eventTemplate.options, {
      facilityLevel,
      enableFacilityBoost: source === 'scene',
      charLabel,
    }),
  }
  return normalizeActiveDormEventState(state)
}

const formatSignedDormDelta = (value) => {
  const numeric = Number(value) || 0
  return numeric >= 0 ? `+${numeric}` : String(numeric)
}

const formatDormEventOptionPreview = (option) => {
  return `好感 ${formatSignedDormDelta(option?.previewAffectionDelta)} · 体力 ${formatSignedDormDelta(option?.previewEnergyDelta)}`
}

const hashString = (value) => {
  const source = String(value || '')
  let hash = 0
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

const createSeededRandom = (seedValue) => {
  let seed = hashString(seedValue) || 1
  return () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    const normalized = (seed >>> 0) / 4294967296
    return Number.isFinite(normalized) ? normalized : Math.random()
  }
}

const randomBySeed = (rng, min, max) => {
  const safeMin = Math.min(min, max)
  const safeMax = Math.max(min, max)
  const ratio = typeof rng === 'function' ? rng() : Math.random()
  return Math.floor(ratio * (safeMax - safeMin + 1)) + safeMin
}

const formatDailyWishTypeLabel = (wishType) => {
  const key = String(wishType || '').trim()
  return DORM_DAILY_WISH_TYPE_LABELS[key] || key || '心愿'
}

const pickDailyWishTypes = (rng) => {
  const weighted = ['chat', 'gift', 'rest', 'event', 'scene', 'upgrade']

  const selected = []
  let guard = 0
  while (selected.length < DORM_DAILY_WISH_COUNT && guard < 120) {
    guard += 1
    const picked = weighted[randomBySeed(rng, 0, weighted.length - 1)]
    if (!selected.includes(picked)) selected.push(picked)
  }

  for (const fallback of ['chat', 'rest', 'scene', 'event', 'gift', 'upgrade']) {
    if (selected.length >= DORM_DAILY_WISH_COUNT) break
    if (!selected.includes(fallback)) selected.push(fallback)
  }
  return selected.slice(0, DORM_DAILY_WISH_COUNT)
}

const createDailyWishEntry = (wishType, dayIndex, order, rng, characterLabel = '角色') => {
  const type = String(wishType || '').trim() || 'chat'
  const target = type === 'chat'
    ? randomBySeed(rng, 1, 2)
    : 1

  const definitions = {
    chat: {
      label: `与{char}聊天 ${target} 次`,
      rewardAffection: randomBySeed(rng, 6, 10),
      rewardEnergy: randomBySeed(rng, 1, 4),
    },
    gift: {
      label: `给{char}送礼 ${target} 次`,
      rewardAffection: randomBySeed(rng, 9, 14),
      rewardEnergy: randomBySeed(rng, 0, 3),
    },
    rest: {
      label: `与{char}休息 ${target} 次`,
      rewardAffection: randomBySeed(rng, 2, 5),
      rewardEnergy: randomBySeed(rng, 10, 16),
    },
    event: {
      label: `完成事件选项 ${target} 次`,
      rewardAffection: randomBySeed(rng, 7, 12),
      rewardEnergy: randomBySeed(rng, 3, 7),
    },
    scene: {
      label: `完成二级场景互动 ${target} 次`,
      rewardAffection: randomBySeed(rng, 5, 10),
      rewardEnergy: randomBySeed(rng, 5, 10),
    },
    upgrade: {
      label: `升级任意场景设施 ${target} 次`,
      rewardAffection: randomBySeed(rng, 5, 9),
      rewardEnergy: randomBySeed(rng, 4, 8),
    },
  }

  const matched = definitions[type] || definitions.chat
  return {
    id: `wish_day_${dayIndex}_${type}_${order + 1}`,
    type,
    label: renderTemplate(matched.label, characterLabel),
    target,
    progress: 0,
    rewardAffection: matched.rewardAffection,
    rewardEnergy: matched.rewardEnergy,
    completed: false,
  }
}

const createDailyWishesForCharacter = (character, label = '', dayIndex = 1) => {
  const seed = `${String(character?.id || '')}:${String(label || '')}:day_${dayIndex}`
  const rng = createSeededRandom(seed)
  const selectedTypes = pickDailyWishTypes(rng)

  const charName = String(label || character?.name || '角色').trim() || '角色'
  return selectedTypes.map((wishType, index) => createDailyWishEntry(wishType, dayIndex, index, rng, charName))
}

const normalizeDailyWish = (rawWish, fallbackDayIndex = 1, fallbackOrder = 0) => {
  const type = String(rawWish?.type || 'chat').trim() || 'chat'
  const target = clampInt(rawWish?.target, 1, 9, 1)
  const progress = clampInt(rawWish?.progress, 0, target, 0)
  return {
    id: String(rawWish?.id || `wish_day_${fallbackDayIndex}_${type}_${fallbackOrder + 1}`),
    type,
    label: String(rawWish?.label || `${formatDailyWishTypeLabel(type)}心愿`),
    target,
    progress,
    rewardAffection: clampInt(rawWish?.rewardAffection, 0, 100, 0),
    rewardEnergy: clampInt(rawWish?.rewardEnergy, 0, 100, 0),
    completed: Boolean(rawWish?.completed) || progress >= target,
  }
}

const normalizeDailyWishList = (rawWishes, fallbackList = []) => {
  const normalized = Array.isArray(rawWishes)
    ? rawWishes.map((wish, index) => normalizeDailyWish(wish, 1, index))
    : []

  const cleaned = normalized
    .filter((wish) => wish.id && wish.type)
    .slice(0, DORM_DAILY_WISH_COUNT)

  if (cleaned.length > 0) return cleaned
  return Array.isArray(fallbackList) ? fallbackList.map((wish, index) => normalizeDailyWish(wish, 1, index)) : []
}

const resolveDailyWishesByAction = (wishList, wishType) => {
  const safeType = String(wishType || '').trim()
  const source = normalizeDailyWishList(wishList, [])
  if (!safeType || source.length <= 0) {
    return {
      wishes: source,
      rewardAffection: 0,
      rewardEnergy: 0,
      completedLabels: [],
    }
  }

  let rewardAffection = 0
  let rewardEnergy = 0
  const completedLabels = []

  const wishes = source.map((wish) => {
    if (wish.type !== safeType || wish.completed) return wish
    const nextProgress = clampInt(wish.progress + 1, 0, wish.target, wish.progress)
    const completed = nextProgress >= wish.target
    if (completed) {
      rewardAffection += wish.rewardAffection
      rewardEnergy += wish.rewardEnergy
      completedLabels.push(wish.label)
    }
    return {
      ...wish,
      progress: nextProgress,
      completed,
    }
  })

  return {
    wishes,
    rewardAffection,
    rewardEnergy,
    completedLabels,
  }
}




const createJournalEntry = (text, type = 'system') => ({
  id: `journal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  text: String(text || '').trim() || '记录',
  type: String(type || 'system').trim() || 'system',
  time: new Date().toISOString(),
})

const appendJournal = (list, text, type = 'system') => {
  const source = Array.isArray(list) ? list : []
  return [createJournalEntry(text, type), ...source].slice(0, DORM_JOURNAL_LIMIT)
}

const normalizeDormChatRole = (value) => {
  const role = String(value || '').trim().toLowerCase()
  if (role === 'assistant') return 'assistant'
  return 'user'
}

const createDormChatMessage = (role, text) => ({
  id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  role: normalizeDormChatRole(role),
  text: String(text || '').replace(/\s+/g, ' ').trim().slice(0, 280),
  time: new Date().toISOString(),
})

const normalizeDormChatHistory = (rawValue) => {
  if (!Array.isArray(rawValue)) return []
  return rawValue
    .map((item) => {
      const isRedPacket = item?.type === 'redPacket'
      const isTaskInvite = item?.type === 'taskInvite'
      const isGift = item?.type === 'gift'
      return {
        id: String(item?.id || `chat_${Date.now()}`),
        role: normalizeDormChatRole(item?.role),
        text: String(item?.text || '').replace(/\s+/g, ' ').trim().slice(0, 280),
        time: String(item?.time || new Date().toISOString()),
        // 保留红包相关字段
        type: isRedPacket ? 'redPacket' : isTaskInvite ? 'taskInvite' : isGift ? 'gift' : undefined,
        redPacket: isRedPacket ? item?.redPacket : undefined,
        gift: isGift ? item?.gift : undefined,
        // 保留任务邀请相关字段
        taskId: isTaskInvite ? item?.taskId : undefined,
        taskName: isTaskInvite ? item?.taskName : undefined,
        taskType: isTaskInvite ? item?.taskType : undefined,
        targetCharacterId: isTaskInvite ? item?.targetCharacterId : undefined,
        targetCharacterName: isTaskInvite ? item?.targetCharacterName : undefined,
      }
    })
    .filter((item) => item.text || item.type === 'redPacket' || item.type === 'taskInvite' || item.type === 'gift')
    .slice(-DORM_CHAT_HISTORY_LIMIT)
}

const appendDormChatMessage = (list, role, text) => {
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 280)
  if (!normalizedText) return normalizeDormChatHistory(list)
  const source = normalizeDormChatHistory(list)
  return [...source, createDormChatMessage(role, normalizedText)].slice(-DORM_CHAT_HISTORY_LIMIT)
}

const normalizeDormDriftBottleText = (value) => {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DORM_DRIFT_BOTTLE_TEXT_LIMIT)
}

const normalizeDormDriftBottleReplyText = (value) => {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DORM_DRIFT_BOTTLE_REPLY_TEXT_LIMIT)
}

const normalizeDormDriftBottleReplyState = (value, fallback = 'none') => {
  const key = String(value || '').trim().toLowerCase()
  if (key === 'pending' || key === 'ready' || key === 'none') return key
  return String(fallback || 'none').trim() || 'none'
}

const normalizeDormDriftBottleFollowUpReplies = (rawValue) => {
  if (!Array.isArray(rawValue)) return []
  return rawValue
    .map((item) => normalizeDormDriftBottleReplyText(item))
    .filter(Boolean)
    .slice(0, DORM_DRIFT_BOTTLE_FOLLOW_UP_LIMIT)
}

const buildDormDriftBottleFeedbackSnippet = (text, limit = DORM_DRIFT_BOTTLE_FEEDBACK_TEXT_LIMIT) => {
  const normalizedText = normalizeDormDriftBottleText(text)
  const safeLimit = clampInt(limit, 8, DORM_DRIFT_BOTTLE_TEXT_LIMIT, DORM_DRIFT_BOTTLE_FEEDBACK_TEXT_LIMIT)
  if (normalizedText.length <= safeLimit) return normalizedText
  return `${normalizedText.slice(0, safeLimit)}...`
}

const createDormDriftBottle = ({ text = '', authorBookId = '', authorCharId = '', authorName = '' } = {}) => {
  const normalizedText = normalizeDormDriftBottleText(text)
  if (!normalizedText) return null
  return {
    id: `drift_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text: normalizedText,
    authorBookId: String(authorBookId || '').trim(),
    authorCharId: String(authorCharId || '').trim(),
    authorName: String(authorName || '匿名').trim() || '匿名',
    createdAt: new Date().toISOString(),
  }
}

const normalizeDormDriftBottlePool = (rawValue) => {
  if (!Array.isArray(rawValue)) return []
  return rawValue
    .map((item) => ({
      id: String(item?.id || `drift_${Date.now()}`).trim(),
      text: normalizeDormDriftBottleText(item?.text),
      authorBookId: String(item?.authorBookId || '').trim(),
      authorCharId: String(item?.authorCharId || '').trim(),
      authorName: String(item?.authorName || '匿名').trim() || '匿名',
      createdAt: String(item?.createdAt || new Date().toISOString()),
    }))
    .filter((item) => item.id && item.text)
    .slice(0, DORM_DRIFT_BOTTLE_POOL_LIMIT)
}

const normalizeDormDriftBottleSeenIds = (rawValue) => {
  if (!Array.isArray(rawValue)) return []
  const next = []
  rawValue.forEach((item) => {
    const key = String(item || '').trim()
    if (!key) return
    if (next.includes(key)) return
    next.push(key)
  })
  return next.slice(-DORM_DRIFT_BOTTLE_SEEN_LIMIT)
}

const createDormDriftBottleInboxEntry = (bottle, {
  replyState = 'none',
  replyText = '',
  replyAuthorName = '',
  replyAt = '',
} = {}) => {
  const normalizedBottle = bottle && typeof bottle === 'object' ? bottle : {}
  const normalizedText = normalizeDormDriftBottleText(normalizedBottle.text)
  if (!normalizedText) return null
  const normalizedReplyText = normalizeDormDriftBottleReplyText(replyText)
  const fallbackReplyState = normalizedReplyText ? 'ready' : 'none'
  const normalizedReplyState = normalizeDormDriftBottleReplyState(replyState, fallbackReplyState)
  return {
    id: `drift_pick_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    bottleId: String(normalizedBottle.id || '').trim(),
    text: normalizedText,
    authorName: String(normalizedBottle.authorName || '匿名').trim() || '匿名',
    pickedAt: new Date().toISOString(),
    createdAt: String(normalizedBottle.createdAt || ''),
    replyState: normalizedReplyState,
    replyText: normalizedReplyText,
    replyAuthorName: String(replyAuthorName || '角色').trim() || '角色',
    replyAt: normalizedReplyText
      ? String(replyAt || new Date().toISOString())
      : '',
    isStarred: false,
    followUpReplies: [],
  }
}

const normalizeDormDriftBottleInbox = (rawValue) => {
  if (!Array.isArray(rawValue)) return []
  return rawValue
    .map((item) => {
      const normalizedReplyText = normalizeDormDriftBottleReplyText(item?.replyText || item?.reply)
      const fallbackReplyState = normalizedReplyText ? 'ready' : 'none'
      return {
        id: String(item?.id || `drift_pick_${Date.now()}`).trim(),
        bottleId: String(item?.bottleId || '').trim(),
        text: normalizeDormDriftBottleText(item?.text),
        authorName: String(item?.authorName || '匿名').trim() || '匿名',
        pickedAt: String(item?.pickedAt || new Date().toISOString()),
        createdAt: String(item?.createdAt || ''),
        replyState: normalizeDormDriftBottleReplyState(item?.replyState, fallbackReplyState),
        replyText: normalizedReplyText,
        replyAuthorName: String(item?.replyAuthorName || '角色').trim() || '角色',
        replyAt: normalizedReplyText
          ? String(item?.replyAt || item?.pickedAt || new Date().toISOString())
          : '',
        isStarred: Boolean(item?.isStarred),
        followUpReplies: normalizeDormDriftBottleFollowUpReplies(item?.followUpReplies),
      }
    })
    .filter((item) => item.id && item.text)
    .slice(0, DORM_DRIFT_BOTTLE_INBOX_LIMIT)
}

const normalizeDiaries = (rawValue) => {
  if (!Array.isArray(rawValue)) return []
  return rawValue
    .map((item) => ({
      id: String(item?.id || `diary_${Date.now()}`).trim(),
      date: String(item?.date || '').trim(),
      title: String(item?.title || '无题').trim(),
      content: String(item?.content || item?.text || '').trim(),
      mood: String(item?.mood || '平静').trim(),
      wordCount: Number(item?.wordCount || item?.content?.length || 0) || 0,
    }))
    .filter((item) => item.id && item.date)
    .sort((a, b) => {
      const dateA = a.date || ''
      const dateB = b.date || ''
      return dateB.localeCompare(dateA) // 最新的在前
    })
}

const getCharacterDisplayName = (character, index = 0) => {
  const fallback = `角色 ${index + 1}`
  return String(character?.name || '').trim() || fallback
}

const pickCharacterPortrait = (character) => {
  if (!Array.isArray(character?.portraits) || character.portraits.length === 0) {
    return null
  }
  return character.portraits.find((portrait) => String(portrait?.emotion || '').trim() === 'default') || character.portraits[0]
}

const createDefaultDormState = (character = null, label = '') => {
  const favor = Number.parseFloat(String(character?.relationshipBase?.favor ?? 0))
  const trust = Number.parseFloat(String(character?.relationshipBase?.trust ?? 50))
  const baseAffinity = Number.isFinite(favor)
    ? clampInt(Math.round((favor + 100) / 2), DORM_AFFECTION_MIN, DORM_AFFECTION_MAX, 50)
    : 50
  const baseEnergy = Number.isFinite(trust)
    ? clampInt(Math.round(trust), DORM_ENERGY_MIN, DORM_ENERGY_MAX, 70)
    : 70
  const name = String(label || character?.name || '角色').trim() || '角色'
  const dayIndex = 1
  const relationshipStage = resolveDormRelationshipStageByAffection(baseAffinity)
  return {
    affection: baseAffinity,
    energy: baseEnergy,
    relationshipStage,
    mood: '平静',
    dayIndex,
    timeSlotIndex: 0,
    visitCount: 0,
    chatCount: 0,
    giftCount: 0,
    eventCount: 0,
    sceneCount: 0,
    facilityUpgradeCount: 0,
    driftBottleThrowCount: 0,
    driftBottlePickCount: 0,
    preferredSceneId: '',
    sceneVisitMap: {},
    sceneFacilityLevels: {},
    driftBottleSeenIds: [],
    driftBottleInbox: [],
    diaries: [],
    activeEvent: null,
    todayWishes: createDailyWishesForCharacter(character, name, dayIndex),
    chatHistory: [
      createDormChatMessage('assistant', `${name}看向你，示意你可以直接开口聊天。`),
    ],
    journal: [createJournalEntry(`寝室记录已建立：${name}`, 'system')],
  }
}

const normalizeDormState = (rawValue, fallbackCharacter = null, fallbackLabel = '') => {
  const fallback = createDefaultDormState(fallbackCharacter, fallbackLabel)
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const rawJournal = Array.isArray(source.journal) ? source.journal : []
  const chatHistory = normalizeDormChatHistory(source.chatHistory)
  const driftBottleSeenIds = normalizeDormDriftBottleSeenIds(source.driftBottleSeenIds)
  const driftBottleInbox = normalizeDormDriftBottleInbox(source.driftBottleInbox)
  const diaries = normalizeDiaries(source.diaries)
  const journal = rawJournal
    .map((item) => ({
      id: String(item?.id || `journal_${Date.now()}`),
      text: String(item?.text || '').trim(),
      type: String(item?.type || 'system').trim() || 'system',
      time: String(item?.time || new Date().toISOString()),
    }))
    .filter((item) => item.text)
    .slice(0, DORM_JOURNAL_LIMIT)

  return {
    affection: clampInt(source.affection, DORM_AFFECTION_MIN, DORM_AFFECTION_MAX, fallback.affection),
    energy: clampInt(source.energy, DORM_ENERGY_MIN, DORM_ENERGY_MAX, fallback.energy),
    relationshipStage: normalizeDormRelationshipStage(
      source.relationshipStage,
      clampInt(source.affection, DORM_AFFECTION_MIN, DORM_AFFECTION_MAX, fallback.affection),
    ),
    mood: String(source.mood || fallback.mood).trim() || fallback.mood,
    dayIndex: clampInt(source.dayIndex, 1, 9999, fallback.dayIndex),
    timeSlotIndex: clampInt(source.timeSlotIndex, 0, DORM_TIME_SLOT_COUNT, fallback.timeSlotIndex),
    visitCount: clampInt(source.visitCount, 0, 9999, fallback.visitCount),
    chatCount: clampInt(source.chatCount, 0, 9999, fallback.chatCount),
    giftCount: clampInt(source.giftCount, 0, 9999, fallback.giftCount),
    eventCount: clampInt(source.eventCount, 0, 9999, fallback.eventCount),
    sceneCount: clampInt(source.sceneCount, 0, 9999, fallback.sceneCount),
    facilityUpgradeCount: clampInt(source.facilityUpgradeCount, 0, 9999, fallback.facilityUpgradeCount),
    driftBottleThrowCount: clampInt(source.driftBottleThrowCount, 0, 99, fallback.driftBottleThrowCount),
    driftBottlePickCount: clampInt(source.driftBottlePickCount, 0, 99, fallback.driftBottlePickCount),
    preferredSceneId: String(source.preferredSceneId || '').trim(),
    sceneVisitMap: normalizeCounterMap(source.sceneVisitMap, 32),
    sceneFacilityLevels: normalizeFacilityLevelMap(source.sceneFacilityLevels, 32),
    driftBottleSeenIds,
    driftBottleInbox,
    diaries,
    activeEvent: normalizeActiveDormEventState(source.activeEvent),
    todayWishes: normalizeDailyWishList(source.todayWishes, fallback.todayWishes),
    chatHistory: chatHistory.length > 0 ? chatHistory : fallback.chatHistory,
    journal: journal.length > 0 ? journal : fallback.journal,
  }
}

const normalizeDormRuntimeMap = (rawValue) => {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return {}
  const next = {}
  Object.keys(rawValue).forEach((key) => {
    const runtimeKey = String(key || '').trim()
    if (!runtimeKey) return
    next[runtimeKey] = normalizeDormState(rawValue[key])
  })
  return next
}

const readDormRuntimeMap = () => {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  try {
    const raw = window.localStorage.getItem(DORM_RUNTIME_STORAGE_KEY)
    if (!raw) return {}
    return normalizeDormRuntimeMap(JSON.parse(raw))
  } catch {
    return {}
  }
}

const persistDormRuntimeMap = (nextMap) => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(DORM_RUNTIME_STORAGE_KEY, JSON.stringify(normalizeDormRuntimeMap(nextMap)))
  } catch {
    // ignore
  }
}

const readDormDriftBottlePool = () => {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(DORM_DRIFT_BOTTLE_POOL_STORAGE_KEY)
    if (!raw) return []
    return normalizeDormDriftBottlePool(JSON.parse(raw))
  } catch {
    return []
  }
}

const persistDormDriftBottlePool = (nextPool) => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(
      DORM_DRIFT_BOTTLE_POOL_STORAGE_KEY,
      JSON.stringify(normalizeDormDriftBottlePool(nextPool)),
    )
  } catch {
    // ignore
  }
}

// 世界书级别经济系统
const DORM_WORLD_BOOK_ECONOMY_DEFAULTS = {
  coins: 180,
  crystals: 0,
}

const normalizeWorldBookEconomy = (value) => {
  if (!value || typeof value !== 'object') return { ...DORM_WORLD_BOOK_ECONOMY_DEFAULTS }
  return {
    coins: clampInt(value.coins, 0, 9999, DORM_WORLD_BOOK_ECONOMY_DEFAULTS.coins),
    crystals: clampInt(value.crystals, 0, 9999, DORM_WORLD_BOOK_ECONOMY_DEFAULTS.crystals),
  }
}

const readWorldBookEconomy = (bookId) => {
  if (typeof window === 'undefined' || !window.localStorage) return { ...DORM_WORLD_BOOK_ECONOMY_DEFAULTS }
  try {
    const raw = window.localStorage.getItem(DORM_WORLD_BOOK_ECONOMY_STORAGE_KEY)
    if (!raw) return { ...DORM_WORLD_BOOK_ECONOMY_DEFAULTS }
    const allEconomies = JSON.parse(raw)
    const bookEconomy = allEconomies[bookId]
    return normalizeWorldBookEconomy(bookEconomy)
  } catch {
    return { ...DORM_WORLD_BOOK_ECONOMY_DEFAULTS }
  }
}

const persistWorldBookEconomy = (bookId, economy) => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const raw = window.localStorage.getItem(DORM_WORLD_BOOK_ECONOMY_STORAGE_KEY)
    const allEconomies = raw ? JSON.parse(raw) : {}
    allEconomies[bookId] = normalizeWorldBookEconomy(economy)
    window.localStorage.setItem(DORM_WORLD_BOOK_ECONOMY_STORAGE_KEY, JSON.stringify(allEconomies))
  } catch {
    // ignore
  }
}

const updateWorldBookEconomy = (bookId, updater) => {
  const current = readWorldBookEconomy(bookId)
  const updated = typeof updater === 'function' ? updater({ ...current }) : current
  persistWorldBookEconomy(bookId, updated)
  // 更新响应式 ref 以触发 UI 更新
  worldBookEconomyMap.value[bookId] = normalizeWorldBookEconomy(updated)
  worldBookEconomyMap.value = { ...worldBookEconomyMap.value }
  return updated
}

// 世界书级别背包系统
const readWorldBookInventory = (bookId) => {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(DORM_WORLD_BOOK_INVENTORY_STORAGE_KEY)
    if (!raw) return []
    const allInventories = JSON.parse(raw)
    const bookInventory = allInventories[bookId]
    return Array.isArray(bookInventory) ? bookInventory : []
  } catch {
    return []
  }
}

const persistWorldBookInventory = (bookId, items) => {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const raw = window.localStorage.getItem(DORM_WORLD_BOOK_INVENTORY_STORAGE_KEY)
    const allInventories = raw ? JSON.parse(raw) : {}
    allInventories[bookId] = Array.isArray(items) ? items : []
    window.localStorage.setItem(DORM_WORLD_BOOK_INVENTORY_STORAGE_KEY, JSON.stringify(allInventories))
  } catch {
    // ignore
  }
}

const addToWorldBookInventory = (bookId, item) => {
  if (!bookId || !item) return
  const current = readWorldBookInventory(bookId)
  const newItem = {
    ...item,
    purchasedAt: Date.now(),
    quantity: (item.quantity || 0) + 1,
  }
  // 检查是否已存在相同物品
  const existingIndex = current.findIndex(i => i.id === item.id)
  if (existingIndex >= 0) {
    current[existingIndex].quantity = (current[existingIndex].quantity || 0) + 1
  } else {
    current.push(newItem)
  }
  persistWorldBookInventory(bookId, current)
  // 更新响应式 ref 以触发 UI 更新
  worldBookInventoryMap.value[bookId] = [...current]
  worldBookInventoryMap.value = { ...worldBookInventoryMap.value }
  return current
}

const removeFromWorldBookInventory = (bookId, itemId) => {
  if (!bookId || !itemId) return
  const current = readWorldBookInventory(bookId)
  const filtered = current.filter(i => i.id !== itemId)
  persistWorldBookInventory(bookId, filtered)
  // 更新响应式 ref 以触发 UI 更新
  worldBookInventoryMap.value[bookId] = [...filtered]
  worldBookInventoryMap.value = { ...worldBookInventoryMap.value }
  return filtered
}

// 当前世界书背包物品 computed
const activeBookInventory = computed(() => {
  const bookId = String(activeBook.value?.id || '').trim()
  if (!bookId) return []
  // 优先从响应式 ref 读取
  const fromRef = worldBookInventoryMap.value[bookId]
  if (fromRef && Array.isArray(fromRef)) return fromRef
  return readWorldBookInventory(bookId)
})

const isAndroidPlatform = computed(() => isAndroid())

const activeBook = computed(() => {
  if (!worldBooks.value.length) return null
  const maxIndex = worldBooks.value.length - 1
  const nextIndex = Math.max(0, Math.min(activeCardIndex.value, maxIndex))
  if (nextIndex !== activeCardIndex.value) activeCardIndex.value = nextIndex
  return worldBooks.value[nextIndex] || null
})

const userPortraitUrl = ref('')

const loadUserPortrait = async () => {
  const portraits = Array.isArray(activeBook.value?.userProfile?.portraits) ? activeBook.value.userProfile.portraits : []
  if (portraits.length === 0) { userPortraitUrl.value = ''; return }
  const portrait = portraits.find((p) => String(p?.emotion || '').trim() === 'default') || portraits[0]
  const rawPath = String(portrait?.filePath || '').trim()
  if (!rawPath) { userPortraitUrl.value = ''; return }
  if (window.avgLLM?.file?.readImage) {
    try {
      const result = await window.avgLLM.file.readImage(rawPath)
      if (result?.base64) { userPortraitUrl.value = `data:${result.mimeType};base64,${result.base64}`; return }
    } catch (e) { /* fallback below */ }
  }
  userPortraitUrl.value = ''
}

watch(() => activeBook.value?.id, () => { loadUserPortrait() }, { immediate: true })

// 世界书级别经济系统 computed
const activeBookEconomy = computed(() => {
  const bookId = String(activeBook.value?.id || '').trim()
  if (!bookId) return { ...DORM_WORLD_BOOK_ECONOMY_DEFAULTS }
  // 优先从响应式 ref 读取
  const fromRef = worldBookEconomyMap.value[bookId]
  if (fromRef && typeof fromRef === 'object') return normalizeWorldBookEconomy(fromRef)
  return readWorldBookEconomy(bookId)
})

const activeBookEconomyCoins = computed(() => {
  return activeBookEconomy.value.coins
})

const activeBookEconomyCrystals = computed(() => {
  return activeBookEconomy.value.crystals
})

const characterCards = computed(() => {
  const characters = Array.isArray(activeBook.value?.characters) ? activeBook.value.characters : []
  return characters.map((character, index) => ({
    id: String(character?.id || `char_${index + 1}`),
    label: getCharacterDisplayName(character, index),
    raw: character,
  }))
})

const selectedCharacter = computed(() => {
  return characterCards.value.find((card) => card.id === selectedCharacterId.value) || null
})

const selectedDormRuntimeKey = computed(() => {
  const bookId = String(activeBook.value?.id || '').trim()
  const characterId = String(selectedCharacterId.value || '').trim()
  if (!bookId || !characterId) return ''
  return `${bookId}::${characterId}`
})

const selectedDormState = computed(() => {
  if (!selectedDormRuntimeKey.value) {
    return createDefaultDormState(selectedCharacter.value?.raw, selectedCharacter.value?.label)
  }
  return normalizeDormState(
    dormRuntimeMap.value[selectedDormRuntimeKey.value],
    selectedCharacter.value?.raw,
    selectedCharacter.value?.label,
  )
})

const selectedDormRelationshipStageId = computed(() => {
  return normalizeDormRelationshipStage(selectedDormState.value.relationshipStage, selectedDormState.value.affection)
})

const selectedDormRelationshipStageLabel = computed(() => {
  return getDormRelationshipStageLabel(selectedDormRelationshipStageId.value)
})

const selectedDormRelationshipNextStage = computed(() => {
  const currentIndex = getDormRelationshipStageIndex(selectedDormRelationshipStageId.value)
  return DORM_RELATIONSHIP_STAGE_LIBRARY[currentIndex + 1] || null
})

const selectedDormRelationshipProgressHint = computed(() => {
  const nextStage = selectedDormRelationshipNextStage.value
  if (!nextStage) return '已达到最高关系阶段'
  return `下一阶段「${nextStage.label}」需好感 ${nextStage.minAffection}`
})

const selectedDormQuickActionLabel = computed(() => {
  const key = String(dormQuickActionType.value || '').trim()
  return DORM_QUICK_ACTION_LABEL_MAP[key] || DORM_QUICK_ACTION_LABEL_MAP.chat
})

const canRunDormQuickAction = computed(() => {
  if (String(dormQuickActionType.value || '').trim() !== 'event') return true
  return !activeDormEvent.value
})

const dormQuickActionRunButtonText = computed(() => {
  const quickActionId = String(dormQuickActionType.value || '').trim()
  if (quickActionId === 'event') {
    return activeDormEvent.value ? '事件进行中' : '执行：触发事件'
  }
  return `执行：${selectedDormQuickActionLabel.value}`
})

const remainingDormActionSlots = computed(() => {
  const used = clampInt(selectedDormState.value.timeSlotIndex, 0, DORM_TIME_SLOT_COUNT, 0)
  return Math.max(0, DORM_TIME_SLOT_COUNT - used)
})

const currentDormTimeSlotLabel = computed(() => {
  if (remainingDormActionSlots.value <= 0) return '已结束'
  const used = clampInt(selectedDormState.value.timeSlotIndex, 0, DORM_TIME_SLOT_COUNT - 1, 0)
  return DORM_TIME_SLOT_LABELS[used] || DORM_TIME_SLOT_LABELS[0]
})

const isDormDayActionClosed = computed(() => {
  return remainingDormActionSlots.value <= 0
})

const completedTodayWishCount = computed(() => {
  return selectedDormState.value.todayWishes.filter((wish) => wish.completed).length
})

const totalTodayWishCount = computed(() => {
  return selectedDormState.value.todayWishes.length
})

const selectedDormAffectionStyle = computed(() => ({ width: `${selectedDormState.value.affection}%` }))
const selectedDormEnergyStyle = computed(() => ({ width: `${selectedDormState.value.energy}%` }))

const selectedDormChatHistory = computed(() => {
  return normalizeDormChatHistory(selectedDormState.value.chatHistory)
})

// 合并聊天历史和来访记录，按时间排序
const mergedDormChatHistory = computed(() => {
  const chatMessages = normalizeDormChatHistory(selectedDormState.value.chatHistory)
  const visits = appointment.visitChatMessages.value

  // 将来访记录转换为聊天消息格式
  const visitMessages = visits.map((v) => ({
    id: `visit_${v.id}`,
    type: 'visit',
    role: 'assistant',
    text: '',
    visit: v,
    createdAt: v.triggeredAt,
  }))

  // 合并并按时间排序
  const allMessages = [...chatMessages, ...visitMessages]
  allMessages.sort((a, b) => {
    const aTime = a.createdAt || a.timestamp || 0
    const bTime = b.createdAt || b.timestamp || 0
    return aTime - bTime
  })

  return allMessages
})
const canSendDormChat = computed(() => {
  if (isDormChatSending.value) return false
  return String(dormChatDraft.value || '').trim().length > 0
})

const selectedDormDriftAuthorBookId = computed(() => {
  return String(activeBook.value?.id || '').trim()
})

const selectedDormDriftAuthorCharId = computed(() => {
  return String(selectedCharacter.value?.id || '').trim()
})

const selectedDormDriftAuthorName = computed(() => {
  return String(selectedCharacter.value?.label || '匿名角色').trim() || '匿名角色'
})

const selectedDormDriftPoolList = computed(() => {
  return normalizeDormDriftBottlePool(driftBottlePool.value)
})

const selectedDormDriftExternalPoolList = computed(() => {
  const selfBookId = selectedDormDriftAuthorBookId.value
  const selfCharId = selectedDormDriftAuthorCharId.value
  return selectedDormDriftPoolList.value.filter((item) => {
    const isSelf = item.authorBookId === selfBookId && item.authorCharId === selfCharId
    return !isSelf
  })
})

const selectedDormDriftPickCandidates = computed(() => {
  const seenIdSet = new Set(normalizeDormDriftBottleSeenIds(selectedDormState.value.driftBottleSeenIds))
  return selectedDormDriftExternalPoolList.value.filter((item) => !seenIdSet.has(item.id))
})

const selectedDormDriftInbox = computed(() => {
  return normalizeDormDriftBottleInbox(selectedDormState.value.driftBottleInbox)
})

const selectedDormDriftMyThrowList = computed(() => {
  const bookId = selectedDormDriftAuthorBookId.value
  const charId = selectedDormDriftAuthorCharId.value
  if (!bookId || !charId) return []
  return selectedDormDriftPoolList.value
    .filter((item) => item.authorBookId === bookId && item.authorCharId === charId)
    .slice(0, 16)
})

const selectedDormDriftRemainingThrowCount = computed(() => {
  const used = clampInt(selectedDormState.value.driftBottleThrowCount, 0, DORM_DRIFT_BOTTLE_DAILY_THROW_LIMIT, 0)
  return Math.max(0, DORM_DRIFT_BOTTLE_DAILY_THROW_LIMIT - used)
})

const selectedDormDriftRemainingPickCount = computed(() => {
  const used = clampInt(selectedDormState.value.driftBottlePickCount, 0, DORM_DRIFT_BOTTLE_DAILY_PICK_LIMIT, 0)
  return Math.max(0, DORM_DRIFT_BOTTLE_DAILY_PICK_LIMIT - used)
})

const canThrowDormDriftBottle = computed(() => {
  if (!selectedDormRuntimeKey.value) return false
  if (selectedDormDriftRemainingThrowCount.value <= 0) return false
  return normalizeDormDriftBottleText(driftBottleDraft.value).length > 0
})

const canPickDormDriftBottle = computed(() => {
  if (!selectedDormRuntimeKey.value) return false
  if (isDormDriftPicking.value) return false
  if (selectedDormDriftRemainingPickCount.value <= 0) return false
  return selectedDormDriftPickCandidates.value.length > 0
})

const selectedDormDriftPickHint = computed(() => {
  if (isDormDriftPicking.value) return '正在捞取并等待角色回信...'
  if (selectedDormDriftRemainingPickCount.value <= 0) return '今日捞取次数已用完。'
  if (selectedDormDriftPickCandidates.value.length > 0) return `海域仍有 ${selectedDormDriftPickCandidates.value.length} 条可捞新漂流瓶。`
  if (selectedDormDriftExternalPoolList.value.length <= 0) return '海域里目前只有你投放的漂流瓶，等等别人再来吧。'
  return '你已经看过当前海域里的其他漂流瓶了。'
})

const isDormDriftFollowUpPending = (entryId = '') => {
  const safeId = String(entryId || '').trim()
  if (!safeId) return false
  return driftFollowupPendingEntryId.value === safeId
}

const canAskDormDriftBottleFollowUp = (entry = null) => {
  if (!selectedDormRuntimeKey.value) return false
  if (isDormDriftPicking.value) return false
  const safeEntry = entry && typeof entry === 'object' ? entry : null
  if (!safeEntry?.id) return false
  if (safeEntry.replyState === 'pending') return false
  const followUps = normalizeDormDriftBottleFollowUpReplies(safeEntry.followUpReplies)
  if (followUps.length >= DORM_DRIFT_BOTTLE_FOLLOW_UP_LIMIT) return false
  if (driftFollowupPendingEntryId.value && !isDormDriftFollowUpPending(safeEntry.id)) return false
  return true
}

const characterGridColumns = computed(() => {
  const count = characterCards.value.length
  if (count <= 0) return 1
  return Math.min(5, count)
})

const characterGridStyle = computed(() => ({
  '--dorm-grid-columns': String(characterGridColumns.value),
}))

const selectedCharacterPortraitUrl = computed(() => {
  const key = String(selectedCharacter.value?.id || '').trim()
  if (!key) return defaultPortraitUrl.value
  return portraitUrlMap.value[key] || defaultPortraitUrl.value
})

const activeBookUserName = computed(() => {
  const profile = activeBook.value?.userProfile
  return String(profile?.name || profile?.nickname || '').trim() || 'User'
})

const activeBookUserProfile = computed(() => {
  return activeBook.value?.userProfile || {}
})

const getDefaultPortraitUrl = async () => {
  if (portraitImageCache.value.has(DEFAULT_PORTRAIT_PATH)) return portraitImageCache.value.get(DEFAULT_PORTRAIT_PATH)

  if (window.avgLLM?.file?.readImage) {
    try {
      const result = await window.avgLLM.file.readImage(DEFAULT_PORTRAIT_PATH)
      if (result?.base64) {
        const nextUrl = `data:${result.mimeType};base64,${result.base64}`
        portraitImageCache.value.set(DEFAULT_PORTRAIT_PATH, nextUrl)
        return nextUrl
      }
    } catch {
      return DEFAULT_PORTRAIT_PATH
    }
  }

  return DEFAULT_PORTRAIT_PATH
}

const getPortraitImageUrl = async (portrait) => {
  if (!portrait?.filePath) return getDefaultPortraitUrl()

  const rawPath = String(portrait.filePath || '').trim()
  if (!rawPath) return getDefaultPortraitUrl()

  if (rawPath.startsWith('data:image')) return rawPath
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) return rawPath

  if (portraitImageCache.value.has(rawPath)) return portraitImageCache.value.get(rawPath)

  if (window.avgLLM?.file?.readImage) {
    try {
      const result = await window.avgLLM.file.readImage(rawPath)
      if (result?.base64) {
        const nextUrl = `data:${result.mimeType};base64,${result.base64}`
        portraitImageCache.value.set(rawPath, nextUrl)
        return nextUrl
      }
    } catch {
      return getDefaultPortraitUrl()
    }
  }

  return getDefaultPortraitUrl()
}

const preloadCharacterPortraits = async () => {
  const token = ++characterPreloadToken
  isLoadingCharacters.value = true

  try {
    const nextMap = {}
    await Promise.all(
      characterCards.value.map(async (card) => {
        const portrait = pickCharacterPortrait(card.raw)
        nextMap[card.id] = await getPortraitImageUrl(portrait)
      }),
    )

    if (token !== characterPreloadToken) return
    portraitUrlMap.value = nextMap
  } finally {
    if (token === characterPreloadToken) isLoadingCharacters.value = false
  }
}

const ensureSelectedBookAsActive = async () => {
  const bookId = String(activeBook.value?.id || '').trim()
  if (!bookId) return
  await setActiveWorldBookId(bookId)
}

const ensureDormStateForCharacter = (characterId) => {
  const bookId = String(activeBook.value?.id || '').trim()
  const charId = String(characterId || '').trim()
  if (!bookId || !charId) return

  const key = `${bookId}::${charId}`
  const card = characterCards.value.find((item) => item.id === charId) || null
  const normalized = normalizeDormState(dormRuntimeMap.value[key], card?.raw, card?.label)

  if (!dormRuntimeMap.value[key]) {
    const nextMap = { ...dormRuntimeMap.value, [key]: normalized }
    dormRuntimeMap.value = nextMap
    persistDormRuntimeMap(nextMap)
  }
}

const updateDormStateByRuntimeKey = (runtimeKey, updater, { fallbackCharacter = null, fallbackLabel = '' } = {}) => {
  const key = String(runtimeKey || '').trim()
  if (!key) return
  const previous = normalizeDormState(dormRuntimeMap.value[key], fallbackCharacter, fallbackLabel)
  const updated = typeof updater === 'function' ? updater({ ...previous }) : previous
  const normalized = normalizeDormState(updated, fallbackCharacter, fallbackLabel)
  const nextMap = { ...dormRuntimeMap.value, [key]: normalized }
  dormRuntimeMap.value = nextMap
  persistDormRuntimeMap(nextMap)
}

const updateSelectedDormState = (updater) => {
  updateDormStateByRuntimeKey(selectedDormRuntimeKey.value, updater, {
    fallbackCharacter: selectedCharacter.value?.raw,
    fallbackLabel: selectedCharacter.value?.label,
  })
}

const clearDormEvent = ({ persist = true } = {}) => {
  activeDormEvent.value = null
  if (!persist || !selectedDormRuntimeKey.value) return
  updateSelectedDormState((previous) => ({
    ...previous,
    activeEvent: null,
  }))
}

const setActiveDormEvent = (nextEvent, { persist = true } = {}) => {
  const normalized = normalizeActiveDormEventState(nextEvent)
  activeDormEvent.value = normalized
  if (!persist || !selectedDormRuntimeKey.value) return
  updateSelectedDormState((previous) => ({
    ...previous,
    activeEvent: normalized,
  }))
}

const applyFacilityBonusDelta = (delta, level) => {
  const numeric = Number(delta) || 0
  if (numeric <= 0) return numeric
  const safeLevel = Math.max(DORM_SCENE_FACILITY_MIN_LEVEL, Math.min(DORM_SCENE_FACILITY_MAX_LEVEL, level || DORM_SCENE_FACILITY_MIN_LEVEL))
  const ratio = 1 + (safeLevel - DORM_SCENE_FACILITY_MIN_LEVEL) * DORM_SCENE_FACILITY_BONUS_STEP
  return Math.max(1, Math.round(numeric * ratio))
}

const buildFacilityBoostedAction = ({ affectionDelta = 0, energyDelta = 0 }, level, enabled = true) => {
  const baseAffection = Number(affectionDelta) || 0
  const baseEnergy = Number(energyDelta) || 0
  if (!enabled) {
    return {
      affectionDelta: baseAffection,
      energyDelta: baseEnergy,
      hasBoost: false,
    }
  }

  const nextAffection = applyFacilityBonusDelta(baseAffection, level)
  const nextEnergy = applyFacilityBonusDelta(baseEnergy, level)
  return {
    affectionDelta: nextAffection,
    energyDelta: nextEnergy,
    hasBoost: nextAffection !== baseAffection || nextEnergy !== baseEnergy,
  }
}

const ensureActionTimeAvailable = (actionLabel = '行动') => {
  if (!isDormDayActionClosed.value) return true
  actionFeedback.value = `今日时段已用尽，请先进入下一天再进行${actionLabel}。`
  return false
}

const applyDailyProgressToState = (state, { consumeTimeSlot = false, wishType = '', charLabel = '角色' } = {}) => {
  const next = { ...state }
  const usedSlot = clampInt(next.timeSlotIndex, 0, DORM_TIME_SLOT_COUNT, 0)
  const nextUsedSlot = consumeTimeSlot
    ? clampInt(usedSlot + 1, 0, DORM_TIME_SLOT_COUNT, usedSlot)
    : usedSlot
  next.timeSlotIndex = nextUsedSlot

  const wishResult = resolveDailyWishesByAction(next.todayWishes, wishType)
  next.todayWishes = wishResult.wishes

  if (wishResult.rewardAffection > 0 || wishResult.rewardEnergy > 0) {
    next.affection = clampInt(next.affection + wishResult.rewardAffection, DORM_AFFECTION_MIN, DORM_AFFECTION_MAX, next.affection)
    next.energy = clampInt(next.energy + wishResult.rewardEnergy, DORM_ENERGY_MIN, DORM_ENERGY_MAX, next.energy)
    wishResult.completedLabels.forEach((label) => {
      next.journal = appendJournal(
        next.journal,
        renderTemplate(`完成今日心愿：${label}（奖励 好感+${wishResult.rewardAffection} / 体力+${wishResult.rewardEnergy}）`, charLabel),
        'wish',
      )
    })
  }

  return {
    state: next,
    consumedSlot: consumeTimeSlot && nextUsedSlot > usedSlot,
    remainingSlots: Math.max(0, DORM_TIME_SLOT_COUNT - nextUsedSlot),
    completedWishLabels: wishResult.completedLabels,
  }
}

const applyDormAction = ({
  affectionDelta = 0,
  energyDelta = 0,
  mood = '',
  journalText = '',
  feedbackText = '',
  countKey = '',
  type = 'system',
  consumeTimeSlot = false,
  wishType = '',
}) => {
  const charName = selectedCharacter.value?.label || '角色'
  const nextJournal = renderTemplate(journalText, charName)
  const nextFeedback = renderTemplate(feedbackText || journalText, charName)
  if (consumeTimeSlot && isDormDayActionClosed.value) {
    actionFeedback.value = '今日时段已用尽，请先进入下一天。'
    return
  }
  let progressOutcome = {
    consumedSlot: false,
    remainingSlots: remainingDormActionSlots.value,
    completedWishLabels: [],
  }
  let stageOutcome = {
    changed: false,
    previousStage: '',
    nextStage: '',
  }

  updateSelectedDormState((previous) => {
    const previousStage = normalizeDormRelationshipStage(previous.relationshipStage, previous.affection)
    const baseNext = {
      ...previous,
      affection: clampInt(previous.affection + affectionDelta, DORM_AFFECTION_MIN, DORM_AFFECTION_MAX, previous.affection),
      energy: clampInt(previous.energy + energyDelta, DORM_ENERGY_MIN, DORM_ENERGY_MAX, previous.energy),
      mood: String(mood || previous.mood).trim() || previous.mood,
      journal: nextJournal ? appendJournal(previous.journal, nextJournal, type) : previous.journal,
    }
    if (countKey && Number.isFinite(Number(baseNext[countKey]))) {
      baseNext[countKey] = clampInt(baseNext[countKey] + 1, 0, 9999, baseNext[countKey])
    }

    const progressed = applyDailyProgressToState(baseNext, {
      consumeTimeSlot,
      wishType,
      charLabel: charName,
    })
    progressOutcome = {
      consumedSlot: progressed.consumedSlot,
      remainingSlots: progressed.remainingSlots,
      completedWishLabels: progressed.completedWishLabels,
    }
    const progressedState = { ...progressed.state }
    const nextStage = resolveDormRelationshipStageByAffection(progressedState.affection)
    progressedState.relationshipStage = nextStage

    if (nextStage !== previousStage) {
      stageOutcome = {
        changed: true,
        previousStage,
        nextStage,
      }
      progressedState.journal = appendJournal(
        progressedState.journal,
        renderTemplate(`关系阶段提升为「${getDormRelationshipStageLabel(nextStage)}」。`, charName),
        'stage',
      )
    }
    return progressedState
  })

  let feedback = nextFeedback || '互动完成。'
  if (progressOutcome.completedWishLabels.length > 0) {
    feedback = `${feedback} 已完成心愿：${progressOutcome.completedWishLabels.join('、')}。`
  }
  if (stageOutcome.changed) {
    const stageText = `关系阶段提升：${getDormRelationshipStageLabel(stageOutcome.previousStage)} -> ${getDormRelationshipStageLabel(stageOutcome.nextStage)}。`
    feedback = `${feedback} ${stageText}`.trim()
    showStageUpgradeToast(stageOutcome)
  }
  if (progressOutcome.consumedSlot && progressOutcome.remainingSlots <= 0) {
    feedback = `${feedback} 今日时段已结束，可进入下一天。`
  }
  actionFeedback.value = feedback
}

// ===== 商店与赠送 Composable =====
const shop = useDormShop(activeBook, worldBookEconomyMap, worldBookInventoryMap)
console.log('shop: ', shop.isWorldBookShopOpen)

const gift = useDormGift({
  selectedCharacter,
  activeBook,
  selectedDormState,
  actionFeedback,
  updateSelectedDormState,
  scrollDormChatToBottom,
  getStageLabel: getDormRelationshipStageLabel,
  normalizeStage: normalizeDormRelationshipStage,
  renderTemplate,
  appendJournal,
  appendDormChatMessage,
  normalizeDormChatHistory,
  readWorldBookInventory,
  persistWorldBookInventory,
  worldBookInventoryMap,
})

const task = useDormTask({
  activeBook,
  selectedCharacter,
  selectedCharacterId,
  selectedDormState,
  selectedDormChatHistory,
  updateSelectedDormState,
  updateWorldBookEconomy: (bookId, updater) => {
    updateWorldBookEconomy(bookId, updater)
  },
  addToWorldBookInventory: (bookId, item) => {
    addToWorldBookInventory(bookId, item)
  },
  normalizeDormChatHistory,
})

// 战斗系统状态
const isTeamSelectOpen = ref(false)
const isBattleScreenOpen = ref(false)
const battleTask = ref(null)
const battleSelectedCharacters = ref([])

function handleOpenTeamBattle(taskItem) {
  battleTask.value = taskItem
  isTeamSelectOpen.value = true
}

function handleTeamSelectClose() {
  isTeamSelectOpen.value = false
}

function handleTeamSelectStartBattle(selected) {
  battleSelectedCharacters.value = selected
  isTeamSelectOpen.value = false
  isBattleScreenOpen.value = true
}

function handleBattleVictory() {
  isBattleScreenOpen.value = false
  // 标记任务为可完成
  const bookId = getActiveWorldBookId()
  if (bookId && battleTask.value) {
    // 先从内存中查找任务，确保 ID 匹配
    const taskFromMemory = task.taskBoardTasks.value.find(t => t.id === battleTask.value.id)
    const targetTask = taskFromMemory || battleTask.value
    console.log('[BattleVictory] 目标任务:', targetTask.id, targetTask.name, targetTask.status)
    console.log('[BattleVictory] 当前内存任务:', task.taskBoardTasks.value.map(t => ({ id: t.id, status: t.status, name: t.name })))

    const board = { tasks: [...task.taskBoardTasks.value], lastGenerated: Date.now() }
    const evidence = {
      type: 'battle',
      waves: 3,
      victory: true,
      summary: `战斗胜利！完成了任务「${targetTask.name}」`,
    }
    const updated = markTaskCompletable(board, targetTask.id, evidence)
    console.log('[BattleVictory] markTaskCompletable结果:', updated.tasks?.map(t => ({ id: t.id, status: t.status, name: t.name })) || '空')
    saveTaskBoard(bookId, updated)
    // 同步到 taskBoardTasks
    task.taskBoardTasks.value = updated.tasks
    actionFeedback.value = '战斗胜利！任务已完成，可领取奖励。'
  }
  battleTask.value = null
  battleSelectedCharacters.value = []
}

function handleBattleDefeat() {
  isBattleScreenOpen.value = false
  actionFeedback.value = '战斗失败，任务仍然可以重新尝试或使用对话模式完成。'
  battleTask.value = null
  battleSelectedCharacters.value = []
}

function handleBattleClose() {
  isBattleScreenOpen.value = false
}

const diary = useDormDiary({
  selectedCharacter,
  selectedDormState,
  dormRuntimeMap,
  selectedDormRuntimeKey,
  actionFeedback,
  activeDormOverlayPanelId,
  isDormOverlayPanelExpanded,
  updateSelectedDormState,
  getActiveWorldBookId,
})

const redPacket = useDormRedPacket({
  selectedCharacter,
  selectedCharacterId,
  selectedDormState,
  selectedDormRuntimeKey,
  dormRuntimeMap,
  dormChatError,
  actionFeedback,
  isDormChatSending,
  activeBook,
  activeBookEconomyCoins,
  selectedDormChatHistory,
  updateSelectedDormState,
  updateWorldBookEconomy,
  scrollDormChatToBottom,
  createDefaultDormState,
  normalizeDormChatHistory,
  appendJournal,
  getValidatedActiveConfig,
  callChatCompletion,
  DORM_CHAT_HISTORY_LIMIT,
})

const appointment = useDormAppointment({
  selectedCharacter,
  activeBook,
  selectedDormState,
  actionFeedback,
  scrollDormChatToBottom,
  getStageLabel: getDormRelationshipStageLabel,
  normalizeStage: normalizeDormRelationshipStage,
  emitPanelChange: (panelId) => {
    activeDormOverlayPanelId.value = panelId
    isDormOverlayPanelExpanded.value = true
  },
})

const subScene = useDormSubScene({
  selectedCharacter,
  selectedDormState,
  selectedSubSceneId,
  selectedSubSceneActivityId,
  actionFeedback,
  activeDormEvent,
  dormRuntimeMap,
  selectedDormRuntimeKey,
  updateSelectedDormState,
  clearDormEvent,
  applyDormAction,
  ensureActionTimeAvailable,
  buildFacilityBoostedAction,
  renderTemplate,
  clampInt,
  normalizeFacilityLevelMap,
  normalizeCounterMap,
  appendJournal,
  getDormRelationshipStageLabel,
  resolveDormRelationshipStageByAffection,
  normalizeDormRelationshipStage,
  DORM_AFFECTION_MIN,
  DORM_AFFECTION_MAX,
  DORM_ENERGY_MIN,
  DORM_ENERGY_MAX,
  DORM_JOURNAL_LIMIT,
  showStageUpgradeToast,
})

const {
  generatedDormSubScenes,
  activeDormSubScene,
  activeDormSubSceneActivityOptions,
  selectedDormSubSceneActivity,
  activeDormSubSceneVisitCount,
  activeDormSubSceneFacilityLevel,
  activeDormSubSceneFacilityBonusPercent,
  canUpgradeActiveSceneFacility,
  activeSceneUpgradeButtonText,
  handleSelectDormSubScene,
  handleDormSubSceneSelectChange,
  handleUpgradeActiveSceneFacility,
  handleDormSubSceneAction,
  handleDormSubSceneActivitySelectChange,
  handleRunDormSubSceneActivity,
  getSceneEventPool,
  getFacilityBonusPercentByLevel,
} = subScene

const resolveDormDriftBottleFallbackReply = ({
  bottleText = '',
  bottleAuthorName = '',
  characterCard = null,
} = {}) => {
  const snippet = buildDormDriftBottleFeedbackSnippet(bottleText, 24)
  const safeAuthorName = String(bottleAuthorName || '匿名').trim() || '匿名'
  const snippets = [
    `这句"${snippet}"让我有点在意，来自 ${safeAuthorName}。`,
    `看到"${snippet}"这条，我会记住的。`,
    `这条漂流瓶挺有意思，我想再看看后续。`,
  ]
  return normalizeDormDriftBottleReplyText(snippets[randomInt(0, snippets.length - 1)])
}

const resolveDormDriftBottleFollowUpFallbackReply = ({
  bottleText = '',
  previousReply = '',
  followUpCount = 0,
  characterCard = null,
} = {}) => {
  const snippet = buildDormDriftBottleFeedbackSnippet(bottleText, 18)
  const previousSnippet = normalizeDormDriftBottleReplyText(previousReply)
  const sequenceLabel = followUpCount > 0 ? `补充第 ${followUpCount + 1} 条` : '补充'
  const snippets = [
    `${sequenceLabel}想法：关于"${snippet}"，我更在意对方当时的心境。`,
    `${sequenceLabel}一下，我会把"${snippet}"这句和最近发生的事一起看。`,
    `${sequenceLabel}一句：这条漂流瓶后劲很大。`,
  ]
  if (previousSnippet) {
    snippets[1] = `${sequenceLabel}延伸：在我刚才"${buildDormDriftBottleFeedbackSnippet(previousSnippet, 16)}"的基础上，我想再观察一下。`
  }
  return normalizeDormDriftBottleReplyText(snippets[randomInt(0, snippets.length - 1)])
}

const requestDormDriftBottleRoleReply = async ({
  worldBook = null,
  characterCard = null,
  history = [],
  bottleText = '',
  bottleAuthorName = '',
  previousReply = '',
  followUpCount = 0,
  mode = 'pick',
  fallbackReply = '',
} = {}) => {
  const safeFallback = normalizeDormDriftBottleReplyText(fallbackReply)
  const safeBottleText = normalizeDormDriftBottleText(bottleText)
  if (!safeBottleText) return safeFallback
  const safeAuthorName = String(bottleAuthorName || '匿名').trim() || '匿名'
  const safePreviousReply = normalizeDormDriftBottleReplyText(previousReply)
  const safeMode = String(mode || 'pick').trim() === 'follow-up' ? 'follow-up' : 'pick'

  try {
    const smsResult = await generatePhoneSmsReply({
      worldBook,
      contact: buildDormChatContact(characterCard),
      userMessage: safeMode === 'follow-up'
        ? [
            '我们在寝室漂流瓶互动中继续追问同一条瓶子。',
            `漂流瓶内容：「${safeBottleText}」`,
            `署名：${safeAuthorName}`,
            safePreviousReply ? `你上一条回应是：「${safePreviousReply}」` : '',
            `这是第 ${Math.max(1, followUpCount + 1)} 次补充回复，请再补充 1-2 句自然回应。`,
          ].filter(Boolean).join('\n')
        : [
            '我们在寝室海域捞到一条漂流瓶。',
            `漂流瓶内容：「${safeBottleText}」`,
            `署名：${safeAuthorName}`,
            '请你以当前角色身份，给出对这条漂流瓶的即时回应（1-2句）。',
          ].join('\n'),
      history: (Array.isArray(history) ? history : [])
        .slice(-8)
        .map((item) => ({
          role: item.role === 'assistant' ? 'assistant' : 'user',
          text: String(item?.text || '').trim(),
        }))
        .filter((item) => item.text),
      options: {
        historyLimit: 6,
        dialogueLimit: 0,
        maxTokens: 220,
      },
    })

    if (!smsResult.success || !Array.isArray(smsResult.replies)) return safeFallback
    const reply = smsResult.replies
      .map((item) => normalizeDormDriftBottleReplyText(item))
      .filter(Boolean)
      .slice(0, 2)
      .join(' ')
    return reply ? normalizeDormDriftBottleReplyText(reply) : safeFallback
  } catch {
    return safeFallback
  }
}

const handleAdvanceDormDay = () => {
  const nextDay = clampInt(selectedDormState.value.dayIndex + 1, 1, 9999, selectedDormState.value.dayIndex + 1)
  const charName = selectedCharacter.value?.label || '角色'

  updateSelectedDormState((previous) => ({
    ...previous,
    dayIndex: nextDay,
    timeSlotIndex: 0,
    driftBottleThrowCount: 0,
    driftBottlePickCount: 0,
    mood: '平静',
    todayWishes: createDailyWishesForCharacter(selectedCharacter.value?.raw, charName, nextDay),
    journal: appendJournal(
      previous.journal,
      renderTemplate(`第${nextDay}天开始，今日心愿已刷新。`, charName),
      'system',
    ),
  }))

  actionFeedback.value = `已进入第 ${nextDay} 天，新的时段与心愿已刷新。`
}

const handleThrowDormDriftBottle = () => {
  if (!selectedDormRuntimeKey.value) return

  const content = normalizeDormDriftBottleText(driftBottleDraft.value)
  if (!content) {
    actionFeedback.value = '请输入要投放的漂流瓶内容。'
    return
  }
  if (selectedDormDriftRemainingThrowCount.value <= 0) {
    actionFeedback.value = '今天已经投放过漂流瓶了，明天再来吧。'
    return
  }

  const bottle = createDormDriftBottle({
    text: content,
    authorBookId: selectedDormDriftAuthorBookId.value,
    authorCharId: selectedDormDriftAuthorCharId.value,
    authorName: selectedDormDriftAuthorName.value,
  })
  if (!bottle) return

  const nextPool = [bottle, ...normalizeDormDriftBottlePool(driftBottlePool.value)]
    .slice(0, DORM_DRIFT_BOTTLE_POOL_LIMIT)
  driftBottlePool.value = nextPool
  persistDormDriftBottlePool(nextPool)

  const charName = selectedCharacter.value?.label || '角色'
  updateSelectedDormState((previous) => ({
    ...previous,
    driftBottleThrowCount: clampInt(previous.driftBottleThrowCount + 1, 0, 99, previous.driftBottleThrowCount),
    journal: appendJournal(
      previous.journal,
      renderTemplate(`你帮{char}投放了一个漂流瓶：「${bottle.text}」`, charName),
      'drift',
    ),
  }))

  driftBottleDraft.value = ''
  actionFeedback.value = '漂流瓶已投放到公共海域。'
}

const handlePickDormDriftBottle = async () => {
  if (!selectedDormRuntimeKey.value) return
  if (isDormDriftPicking.value) return
  if (selectedDormDriftRemainingPickCount.value <= 0) {
    actionFeedback.value = '今天捞瓶次数已用完，明天再来吧。'
    return
  }

  if (selectedDormDriftPickCandidates.value.length <= 0) {
    actionFeedback.value = selectedDormDriftPickHint.value
    return
  }

  const pickedBottle = selectedDormDriftPickCandidates.value[randomInt(0, selectedDormDriftPickCandidates.value.length - 1)]
  const runtimeKeyAtRequest = selectedDormRuntimeKey.value
  const worldBookAtRequest = activeBook.value
  const characterCardAtRequest = selectedCharacter.value
  const historyAtRequest = selectedDormChatHistory.value
  const requestToken = ++dormDriftPickRequestToken
  const charName = selectedCharacter.value?.label || '角色'
  const pickedInboxEntry = createDormDriftBottleInboxEntry(pickedBottle, {
    replyState: 'pending',
    replyAuthorName: charName,
  })
  if (!pickedInboxEntry) return

  updateSelectedDormState((previous) => ({
    ...previous,
    driftBottlePickCount: clampInt(previous.driftBottlePickCount + 1, 0, 99, previous.driftBottlePickCount),
    driftBottleSeenIds: normalizeDormDriftBottleSeenIds([
      ...normalizeDormDriftBottleSeenIds(previous.driftBottleSeenIds),
      pickedBottle.id,
    ]),
    driftBottleInbox: [pickedInboxEntry, ...normalizeDormDriftBottleInbox(previous.driftBottleInbox)]
      .slice(0, DORM_DRIFT_BOTTLE_INBOX_LIMIT),
    journal: appendJournal(
      previous.journal,
      renderTemplate(`你和{char}捞到漂流瓶：${pickedBottle.text}（来自 ${pickedBottle.authorName}）`, charName),
      'drift',
    ),
  }))

  actionFeedback.value = `捞到一条漂流瓶：「${buildDormDriftBottleFeedbackSnippet(pickedBottle.text)}」`
  isDormDriftPicking.value = true

  let resolvedReply = resolveDormDriftBottleFallbackReply({
    bottleText: pickedBottle.text,
    bottleAuthorName: pickedBottle.authorName,
    characterCard: characterCardAtRequest,
  })
  resolvedReply = await requestDormDriftBottleRoleReply({
    worldBook: worldBookAtRequest,
    characterCard: characterCardAtRequest,
    history: historyAtRequest,
    bottleText: pickedBottle.text,
    bottleAuthorName: pickedBottle.authorName,
    mode: 'pick',
    fallbackReply: resolvedReply,
  })
  if (requestToken === dormDriftPickRequestToken) {
    isDormDriftPicking.value = false
  }

  if (requestToken !== dormDriftPickRequestToken) return

  updateDormStateByRuntimeKey(runtimeKeyAtRequest, (previous) => {
    const inbox = normalizeDormDriftBottleInbox(previous.driftBottleInbox)
    let updated = false
    const nextInbox = inbox.map((entry) => {
      if (entry.id !== pickedInboxEntry.id) return entry
      updated = true
      return {
        ...entry,
        replyState: 'ready',
        replyText: resolvedReply,
        replyAuthorName: charName,
        replyAt: new Date().toISOString(),
      }
    })
    if (!updated) return previous
    return {
      ...previous,
      driftBottleInbox: nextInbox,
      journal: appendJournal(
        previous.journal,
        renderTemplate(`{char}看完漂流瓶后说：「${resolvedReply}」`, charName),
        'drift',
      ),
    }
  }, {
    fallbackCharacter: characterCardAtRequest?.raw,
    fallbackLabel: characterCardAtRequest?.label,
  })

  if (runtimeKeyAtRequest === selectedDormRuntimeKey.value) {
    actionFeedback.value = `${charName}看完漂流瓶后给出了回应。`
  }
}

const handleToggleDormDriftBottleStar = (entryId) => {
  const safeId = String(entryId || '').trim()
  if (!safeId) return

  let nextStarState = false
  updateSelectedDormState((previous) => {
    const inbox = normalizeDormDriftBottleInbox(previous.driftBottleInbox)
    let updated = false
    const nextInbox = inbox.map((entry) => {
      if (entry.id !== safeId) return entry
      updated = true
      nextStarState = !Boolean(entry.isStarred)
      return {
        ...entry,
        isStarred: nextStarState,
      }
    })
    if (!updated) return previous
    return {
      ...previous,
      driftBottleInbox: nextInbox,
    }
  })

  actionFeedback.value = nextStarState ? '已收藏这条漂流瓶。' : '已取消收藏。'
}

const handleDeleteDormDriftBottleInboxEntry = (entryId) => {
  const safeId = String(entryId || '').trim()
  if (!safeId) return
  if (isDormDriftFollowUpPending(safeId)) {
    actionFeedback.value = '该条目正在追问中，请稍候再删除。'
    return
  }

  let removed = false
  updateSelectedDormState((previous) => {
    const inbox = normalizeDormDriftBottleInbox(previous.driftBottleInbox)
    const nextInbox = inbox.filter((entry) => entry.id !== safeId)
    removed = nextInbox.length !== inbox.length
    if (!removed) return previous
    return {
      ...previous,
      driftBottleInbox: nextInbox,
    }
  })

  if (removed) {
    actionFeedback.value = '已删除这条漂流瓶记录。'
  }
}

const handleAskDormDriftBottleFollowUp = async (entryId) => {
  const safeId = String(entryId || '').trim()
  if (!safeId) return
  if (!selectedDormRuntimeKey.value) return
  if (isDormDriftPicking.value) {
    actionFeedback.value = '当前正在捞取漂流瓶，请稍后再追问。'
    return
  }
  if (driftFollowupPendingEntryId.value && !isDormDriftFollowUpPending(safeId)) {
    actionFeedback.value = '当前已有一条漂流瓶在追问中，请稍候。'
    return
  }

  const entry = selectedDormDriftInbox.value.find((item) => item.id === safeId)
  if (!entry) return
  if (!canAskDormDriftBottleFollowUp(entry)) {
    actionFeedback.value = '该条漂流瓶当前不可追问。'
    return
  }

  const runtimeKeyAtRequest = selectedDormRuntimeKey.value
  const worldBookAtRequest = activeBook.value
  const characterCardAtRequest = selectedCharacter.value
  const historyAtRequest = selectedDormChatHistory.value
  const requestToken = ++dormDriftFollowupRequestToken
  driftFollowupPendingEntryId.value = safeId

  const charName = selectedCharacter.value?.label || '角色'
  actionFeedback.value = `${charName}正在补充回应...`

  const followUpCount = normalizeDormDriftBottleFollowUpReplies(entry.followUpReplies).length
  const previousReply = normalizeDormDriftBottleReplyText(entry.replyText)
  let resolvedReply = resolveDormDriftBottleFollowUpFallbackReply({
    bottleText: entry.text,
    previousReply,
    followUpCount,
    characterCard: characterCardAtRequest,
  })

  resolvedReply = await requestDormDriftBottleRoleReply({
    worldBook: worldBookAtRequest,
    characterCard: characterCardAtRequest,
    history: historyAtRequest,
    bottleText: entry.text,
    bottleAuthorName: entry.authorName,
    previousReply,
    followUpCount,
    mode: 'follow-up',
    fallbackReply: resolvedReply,
  })

  if (requestToken !== dormDriftFollowupRequestToken) return

  updateDormStateByRuntimeKey(runtimeKeyAtRequest, (previous) => {
    const inbox = normalizeDormDriftBottleInbox(previous.driftBottleInbox)
    let updated = false
    const nextInbox = inbox.map((item) => {
      if (item.id !== safeId) return item
      updated = true
      const nextFollowUps = [
        ...normalizeDormDriftBottleFollowUpReplies(item.followUpReplies),
        resolvedReply,
      ].slice(0, DORM_DRIFT_BOTTLE_FOLLOW_UP_LIMIT)
      return {
        ...item,
        followUpReplies: nextFollowUps,
        replyAuthorName: charName,
        replyAt: new Date().toISOString(),
      }
    })
    if (!updated) return previous
    return {
      ...previous,
      driftBottleInbox: nextInbox,
      journal: appendJournal(
        previous.journal,
        renderTemplate(`{char}补充了漂流瓶回应：「${resolvedReply}」`, charName),
        'drift',
      ),
    }
  }, {
    fallbackCharacter: characterCardAtRequest?.raw,
    fallbackLabel: characterCardAtRequest?.label,
  })

  if (runtimeKeyAtRequest === selectedDormRuntimeKey.value) {
    actionFeedback.value = `${charName}补充了一条新回应。`
  }
  if (requestToken === dormDriftFollowupRequestToken) {
    driftFollowupPendingEntryId.value = ''
  }
}

const buildDormChatContact = (characterCard = selectedCharacter.value) => {
  const safeCharacterCard = characterCard && typeof characterCard === 'object' ? characterCard : null
  const character = safeCharacterCard?.raw || {}
  const personality = character?.personalityProfile && typeof character.personalityProfile === 'object'
    ? character.personalityProfile
    : {}
  const behaviorTags = Array.isArray(personality.behaviorTags)
    ? personality.behaviorTags.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
    : []
  const dimensionText = personality?.cognitiveDimensions && typeof personality.cognitiveDimensions === 'object'
    ? Object.entries(personality.cognitiveDimensions)
      .map(([key, value]) => {
        const numeric = Number.parseFloat(String(value))
        if (!Number.isFinite(numeric)) return ''
        return `${key}:${numeric}`
      })
      .filter(Boolean)
      .slice(0, 4)
      .join(' | ')
    : ''
  const identityParts = [
    String(character?.identity || '').trim(),
    String(character?.background || '').trim(),
    behaviorTags.length > 0 ? `性格标签：${behaviorTags.join('、')}` : '',
    dimensionText ? `认知维度：${dimensionText}` : '',
  ].filter(Boolean)
  return {
    id: String(safeCharacterCard?.id || '').trim(),
    name: safeCharacterCard?.label || String(character?.name || '角色').trim() || '角色',
    identity: identityParts.join('；'),
    subtitle: String(character?.appearance || '').trim(),
  }
}


const handleDormChatDraftInput = (value) => {
  dormChatDraft.value = value
}

const handleDriftBottleDraftInput = (value) => {
  driftBottleDraft.value = value
}

const handleDormQuickActionTypeChange = (value) => {
  dormQuickActionType.value = value
}

const handleSendDormChat = async () => {
  if (isDormChatSending.value) return
  if (!selectedDormRuntimeKey.value) return

  const userMessage = String(dormChatDraft.value || '').replace(/\s+/g, ' ').trim().slice(0, 280)
  if (!userMessage) return

  const runtimeKeyAtRequest = selectedDormRuntimeKey.value
  const historyBefore = selectedDormChatHistory.value
  const characterLabel = selectedCharacter.value?.label || '角色'
  const requestToken = ++dormChatRequestToken

  dormChatDraft.value = ''
  dormChatError.value = ''
  isDormChatSending.value = true

  updateSelectedDormState((previous) => ({
    ...previous,
    chatHistory: appendDormChatMessage(previous.chatHistory, 'user', userMessage),
    journal: appendJournal(previous.journal, `你对${characterLabel}说：「${userMessage}」`, 'chat'),
  }))

  try {
    const result = await generateDormChatReply({
      worldBook: activeBook.value,
      contact: buildDormChatContact(),
      userMessage,
      history: historyBefore
        .slice(-12)
        .map((item) => {
          if (item.type === 'redPacket' && item.redPacket) {
            return {
              role: 'user',
              type: 'redPacket',
              text: `${item.redPacket.senderName || '玩家'}发了一个红包`,
              senderName: item.redPacket.senderName,
            }
          }
          return {
            role: item.role === 'assistant' ? 'assistant' : 'user',
            text: item.text,
          }
        }),
      hasPendingRedPacket: historyBefore.length > 0 && historyBefore[historyBefore.length - 1]?.type === 'redPacket',
      options: {
        historyLimit: 10,
        maxTokens: 420,
      },
    })

    if (requestToken !== dormChatRequestToken) return
    if (runtimeKeyAtRequest !== selectedDormRuntimeKey.value) return

    if (!result.success || !Array.isArray(result.replies) || result.replies.length <= 0) {
      const errorText = String(result.error || '角色暂时没有回复，请稍后再试。').trim() || '角色暂时没有回复，请稍后再试。'
      dormChatError.value = errorText
      actionFeedback.value = errorText
      return
    }

    const replies = result.replies
      .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 4)
    if (replies.length <= 0) {
      dormChatError.value = '角色暂时没有回复，请稍后再试。'
      actionFeedback.value = dormChatError.value
      return
    }

    updateSelectedDormState((previous) => {
      let nextChatHistory = normalizeDormChatHistory(previous.chatHistory)
      let nextJournal = previous.journal
      replies.forEach((reply) => {
        nextChatHistory = appendDormChatMessage(nextChatHistory, 'assistant', reply)
        nextJournal = appendJournal(nextJournal, `${characterLabel}：${reply}`, 'chat')
      })

      // 处理 LLM 决定的红包
      if (result.redPacket && typeof result.redPacket === 'object') {
        const rpAmount = result.redPacket.amount
        const rpBlessing = result.redPacket.blessing || '小小意思，不成敬意~'
        const charId = String(selectedCharacterId.value || '').trim()

        const rpPacket = createRedPacket({
          senderId: `char_${charId}`,
          senderName: characterLabel,
          amount: rpAmount,
          type: 'normal',
          blessing: rpBlessing,
          characterId: charId,
        })

        if (rpPacket) {
          addRedPacket(rpPacket)
          recordSentRedPacket(rpPacket)

          const rpMessage = redPacket.createRedPacketChatMessage(rpPacket)
          nextChatHistory = [...nextChatHistory, rpMessage].slice(-DORM_CHAT_HISTORY_LIMIT)
          nextJournal = appendJournal(nextJournal, `${characterLabel}给你发了一个红包`, 'redPacket')
          actionFeedback.value = `${characterLabel}给你发了一个红包！`
        }
      }

      // 处理角色对玩家红包的响应（领取/退回）
      if (result.redPacketAction && typeof result.redPacketAction === 'object') {
        const rpAction = result.redPacketAction.action
        const rpRemark = result.redPacketAction.remark

        // 找到聊天历史里最新的未处理的玩家发的红包
        const lastPlayerRpIndex = [...nextChatHistory].reverse().findIndex(msg =>
          msg.type === 'redPacket' && msg.redPacket && !msg.redPacket.isOpened
        )
        if (lastPlayerRpIndex >= 0) {
          const realIndex = nextChatHistory.length - 1 - lastPlayerRpIndex
          const rpMsg = nextChatHistory[realIndex]
          const rpAmount = rpMsg.redPacket.amount

          if (rpAction === 'accept') {
            nextChatHistory[realIndex] = {
              ...nextChatHistory[realIndex],
              redPacket: {
                ...nextChatHistory[realIndex].redPacket,
                isOpened: true,
                openedAt: new Date().toISOString(),
              },
            }
            nextJournal = appendJournal(nextJournal, `${characterLabel}领取了你的红包（${rpAmount}金币）`, 'redPacket')
            actionFeedback.value = `${characterLabel}领取了你的红包！${rpRemark ? rpRemark : ''}`
          } else if (rpAction === 'decline') {
            nextChatHistory[realIndex] = {
              ...nextChatHistory[realIndex],
              redPacket: {
                ...nextChatHistory[realIndex].redPacket,
                isReturned: true,
                returnedAt: new Date().toISOString(),
              },
            }
            // 退回红包，金币返还给玩家
            const bookId = String(activeBook.value?.id || '').trim()
            if (bookId) {
              updateWorldBookEconomy(bookId, (previous) => ({
                ...previous,
                coins: clampInt(previous.coins + rpAmount, 0, 9999, previous.coins),
              }))
            }
            nextJournal = appendJournal(nextJournal, `${characterLabel}退回了你的红包（${rpAmount}金币已返还）`, 'redPacket')
            actionFeedback.value = `${characterLabel}退回了你的红包。${rpRemark ? rpRemark : ''}`
          }
        }
      }

      // 处理角色送礼物给玩家
      if (result.giftToPlayer && typeof result.giftToPlayer === 'object') {
        const giftItem = result.giftToPlayer
        const bookId = String(activeBook.value?.id || '').trim()

        // 在世界书背包里查找匹配的物品
        const inventory = bookId ? worldBookInventoryMap.value[bookId] || [] : []
        const matchedItem = inventory.find(inv =>
          inv.name === giftItem.itemName || inv.name?.includes(giftItem.itemName) || giftItem.itemName.includes(inv.name || '')
        )

        if (matchedItem) {
          // 增加物品数量
          const updatedInventory = [...inventory]
          const idx = updatedInventory.indexOf(matchedItem)
          updatedInventory[idx] = {
            ...matchedItem,
            quantity: (matchedItem.quantity || 0) + (giftItem.count || 1),
          }
          if (bookId) {
            worldBookInventoryMap.value[bookId] = [...updatedInventory]
            worldBookInventoryMap.value = { ...worldBookInventoryMap.value }
            persistWorldBookInventory(bookId, updatedInventory)
          }

          // 生成礼物卡片消息
          const giftMsg = {
            id: `gift_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            role: 'assistant',
            type: 'gift',
            gift: {
              itemName: giftItem.itemName,
              icon: matchedItem.icon || '🎁',
              message: giftItem.message || '这个给你~',
              addedToBackpack: true,
            },
            time: new Date().toISOString(),
          }
          nextChatHistory = [...nextChatHistory, giftMsg].slice(-DORM_CHAT_HISTORY_LIMIT)
          nextJournal = appendJournal(nextJournal, `${characterLabel}送了${giftItem.itemName}给你`, 'gift')
          actionFeedback.value = `${characterLabel}送了${matchedItem.icon || '🎁'}${giftItem.itemName}给你！`
        } else {
          // 找不到匹配的物品，只生成消息
          const giftMsg = {
            id: `gift_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            role: 'assistant',
            type: 'gift',
            gift: {
              itemName: giftItem.itemName,
              icon: '🎁',
              message: giftItem.message || '这个给你~',
              addedToBackpack: false,
            },
            time: new Date().toISOString(),
          }
          nextChatHistory = [...nextChatHistory, giftMsg].slice(-DORM_CHAT_HISTORY_LIMIT)
          nextJournal = appendJournal(nextJournal, `${characterLabel}想送你${giftItem.itemName}，但背包里没有这个物品`, 'gift')
        }
      }

      return {
        ...previous,
        chatHistory: nextChatHistory,
        journal: nextJournal,
      }
    })

    actionFeedback.value = `${characterLabel}回复了你。`
    
    // 聊天过程中随机生成日记
    diary.generateRandomDiaryDuringChat()
  } finally {
    if (requestToken === dormChatRequestToken) {
      isDormChatSending.value = false
    }
  }
}


const handleRunDormQuickAction = () => {
  const actionType = String(dormQuickActionType.value || '').trim()
  if (actionType === 'gift') {
    handleGiftAction()
    return
  }
  if (actionType === 'rest') {
    handleRestAction()
    return
  }
  if (actionType === 'event') {
    if (activeDormEvent.value) {
      actionFeedback.value = '当前已有进行中的事件，请先完成后再触发新事件。'
      return
    }
    triggerDormEvent()
    return
  }
  if (actionType === 'outing') {
    handleOutingAction()
    return
  }
  handleChatAction()
}

const handleChatAction = () => {
  if (!ensureActionTimeAvailable('聊天')) return
  const pool = [
    '{char}靠在椅背上，认真听完了你的分享。',
    '你和{char}聊起最近的琐事，气氛很轻松。',
    '{char}说了句玩笑话，寝室里一下子热闹起来。',
  ]
  const boosted = buildFacilityBoostedAction(
    {
      affectionDelta: randomInt(3, 6),
      energyDelta: -randomInt(3, 6),
    },
    activeDormSubSceneFacilityLevel.value,
    true,
  )
  const boostSuffix = boosted.hasBoost ? `（${activeDormSubScene.value?.name || '当前场景'}设施加成）` : ''
  applyDormAction({
    affectionDelta: boosted.affectionDelta,
    energyDelta: boosted.energyDelta,
    mood: '开心',
    journalText: pool[randomInt(0, pool.length - 1)],
    feedbackText: `你们聊了很久，关系更近了一点。${boostSuffix}`,
    countKey: 'chatCount',
    type: 'chat',
    consumeTimeSlot: true,
    wishType: 'chat',
  })
}

const handleGiftAction = () => {
  if (!ensureActionTimeAvailable('送礼')) return
  const gifts = ['手作甜点', '书签', '便携耳机', '电影票']
  const pickedGift = gifts[randomInt(0, gifts.length - 1)]
  const boosted = buildFacilityBoostedAction(
    {
      affectionDelta: randomInt(6, 11),
      energyDelta: -randomInt(2, 5),
    },
    activeDormSubSceneFacilityLevel.value,
    true,
  )
  const boostSuffix = boosted.hasBoost ? `（${activeDormSubScene.value?.name || '当前场景'}设施加成）` : ''
  applyDormAction({
    affectionDelta: boosted.affectionDelta,
    energyDelta: boosted.energyDelta,
    mood: '惊喜',
    journalText: `你送给{char}一份${pickedGift}。`,
    feedbackText: `{char}收下了${pickedGift}，看起来很开心。${boostSuffix}`,
    countKey: 'giftCount',
    type: 'gift',
    consumeTimeSlot: true,
    wishType: 'gift',
  })
}

const isPolaroidScreenOpen = ref(false)

const { activeFrame } = useAvatarFrame()
const { activeAvatarDataUrl } = useAvatar()
const isAvatarFrameScreenOpen = ref(false)

const handleOutingAction = () => {
  if (!ensureActionTimeAvailable('邀请出去玩')) return
  isPolaroidScreenOpen.value = true
}

const handlePolaroidBack = () => {
  isPolaroidScreenOpen.value = false
}

const handlePolaroidComplete = (photoData) => {
  isPolaroidScreenOpen.value = false
  const boosted = buildFacilityBoostedAction(
    {
      affectionDelta: randomInt(8, 15),
      energyDelta: -randomInt(5, 10),
    },
    activeDormSubSceneFacilityLevel.value,
    true,
  )
  const boostSuffix = boosted.hasBoost ? `（${activeDormSubScene.value?.name || '当前场景'}设施加成）` : ''
  applyDormAction({
    affectionDelta: boosted.affectionDelta,
    energyDelta: boosted.energyDelta,
    mood: '开心',
    journalText: `你和${selectedCharacter.value?.label || '角色'}一起出去玩，拍了一张拍立得照片。`,
    feedbackText: `和${selectedCharacter.value?.label || '角色'}度过了愉快的时光，关系更近了。${boostSuffix}`,
    countKey: 'outingCount',
    type: 'outing',
    consumeTimeSlot: true,
    wishType: 'outing',
  })
}

const handleRestAction = () => {
  if (!ensureActionTimeAvailable('休息')) return
  const boosted = buildFacilityBoostedAction(
    {
      affectionDelta: randomInt(1, 3),
      energyDelta: randomInt(14, 24),
    },
    activeDormSubSceneFacilityLevel.value,
    true,
  )
  const boostSuffix = boosted.hasBoost ? `（${activeDormSubScene.value?.name || '当前场景'}设施加成）` : ''
  applyDormAction({
    affectionDelta: boosted.affectionDelta,
    energyDelta: boosted.energyDelta,
    mood: '放松',
    journalText: '你和{char}在寝室休息了一会儿。',
    feedbackText: `休息后状态恢复了不少。${boostSuffix}`,
    type: 'rest',
    consumeTimeSlot: true,
    wishType: 'rest',
  })
}

const triggerDormEvent = () => {
  if (activeDormEvent.value) return
  if (!ensureActionTimeAvailable('触发事件')) return

  const charName = selectedCharacter.value?.label || '角色'
  const activeScene = activeDormSubScene.value
  const scenePool = getSceneEventPool(activeScene?.id)
  const hasSceneEvent = scenePool.length > 0
  const eventPool = hasSceneEvent ? scenePool : []
  const facilityLevel = hasSceneEvent ? activeDormSubSceneFacilityLevel.value : DORM_SCENE_FACILITY_MIN_LEVEL
  const facilityBonusPercent = hasSceneEvent ? getFacilityBonusPercentByLevel(facilityLevel) : 0
  const source = hasSceneEvent ? 'scene' : 'global'

  if (eventPool.length <= 0) return
  const eventTemplate = eventPool[randomInt(0, eventPool.length - 1)]
  const nextEventState = buildSingleDormEventState(eventTemplate, {
    charLabel: charName,
    source,
    sourceSceneId: source === 'scene' ? String(activeScene?.id || '').trim() : '',
    sourceSceneName: source === 'scene' ? String(activeScene?.name || '').trim() : '',
    facilityLevel,
    facilityBonusPercent,
  })

  if (!nextEventState) return
  setActiveDormEvent(nextEventState)
  actionFeedback.value = nextEventState.source === 'scene'
    ? `触发场景事件：${nextEventState.title}（${nextEventState.sourceSceneName || '当前场景'}）`
    : `触发事件：${nextEventState.title}`
}

const handleDormEventOption = (option) => {
  if (!option || !activeDormEvent.value) return
  if (!ensureActionTimeAvailable('处理事件')) return
  const currentEvent = normalizeActiveDormEventState(activeDormEvent.value)
  if (!currentEvent) return

  const isSceneEvent = currentEvent.source === 'scene'
  const facilityLevel = clampInt(
    currentEvent.facilityLevel,
    DORM_SCENE_FACILITY_MIN_LEVEL,
    DORM_SCENE_FACILITY_MAX_LEVEL,
    DORM_SCENE_FACILITY_MIN_LEVEL,
  )
  const boosted = buildFacilityBoostedAction(
    {
      affectionDelta: Number(option.affectionDelta) || 0,
      energyDelta: Number(option.energyDelta) || 0,
    },
    facilityLevel,
    isSceneEvent,
  )

  const nextAffectionDelta = boosted.affectionDelta
  const nextEnergyDelta = boosted.energyDelta
  const nextMood = String(option.mood || '').trim()
  const nextJournalText = option.message || '你们共同完成了一次事件。'
  const bonusSuffix = boosted.hasBoost ? `（设施 Lv${currentEvent.facilityLevel} 加成）` : ''

  applyDormAction({
    affectionDelta: nextAffectionDelta,
    energyDelta: nextEnergyDelta,
    mood: nextMood,
    journalText: nextJournalText,
    feedbackText: `${option.message || '事件已结算。'}${bonusSuffix}`,
    countKey: 'eventCount',
    type: 'event',
    consumeTimeSlot: true,
    wishType: 'event',
  })

  clearDormEvent()
}



const handleCollapseDormOverlayPanel = () => {
  isDormOverlayPanelExpanded.value = false
}

const handleToggleDormMenu = () => {
  isDormNavMenuOpen.value = false
  isDormMenuOpen.value = !isDormMenuOpen.value
}

const handleToggleDormNavMenu = () => {
  isDormMenuOpen.value = false
  isDormNavMenuOpen.value = !isDormNavMenuOpen.value
}

const handleDormNavBackMain = () => {
  isDormNavMenuOpen.value = false
  isDormMenuOpen.value = false
  emit('back')
}

const handleDormNavBackCharacterGrid = () => {
  isDormNavMenuOpen.value = false
  isDormMenuOpen.value = false
  backToCharacterGrid()
}

watch(
  activeDormSubSceneActivityOptions,
  (activities) => {
    const source = Array.isArray(activities) ? activities : []
    if (source.length <= 0) {
      selectedSubSceneActivityId.value = ''
      return
    }

    const currentId = String(selectedSubSceneActivityId.value || '').trim()
    const exists = source.some((activity) => activity.id === currentId)
    if (exists) return
    selectedSubSceneActivityId.value = source[0].id
  },
  { immediate: true },
)

watch(
  dormQuickActionType,
  (value) => {
    const key = String(value || '').trim()
    if (Object.prototype.hasOwnProperty.call(DORM_QUICK_ACTION_LABEL_MAP, key)) return
    dormQuickActionType.value = 'chat'
  },
  { immediate: true },
)



watch(
  selectedDormRuntimeKey,
  (runtimeKey) => {
    isDormNavMenuOpen.value = false
    isDormMenuOpen.value = false
    dormChatDraft.value = ''
    driftBottleDraft.value = ''
    dormChatError.value = ''
    isDormChatSending.value = false
    isDormDriftPicking.value = false
    dormDriftPickRequestToken += 1
    driftFollowupPendingEntryId.value = ''
    dormDriftFollowupRequestToken += 1
    if (!runtimeKey) {
      activeDormEvent.value = null
      return
    }
    activeDormEvent.value = normalizeActiveDormEventState(dormRuntimeMap.value[runtimeKey]?.activeEvent)
  },
  { immediate: true },
)

watch(
  [selectedDormRuntimeKey, generatedDormSubScenes],
  ([runtimeKey, scenes]) => {
    const sceneList = Array.isArray(scenes) ? scenes : []
    if (sceneList.length <= 0) {
      selectedSubSceneId.value = ''
      return
    }

    const currentExists = sceneList.some((scene) => scene.id === selectedSubSceneId.value)
    if (currentExists) return

    const preferredSceneId = runtimeKey
      ? String(dormRuntimeMap.value[runtimeKey]?.preferredSceneId || '').trim()
      : ''
    const preferredExists = preferredSceneId && sceneList.some((scene) => scene.id === preferredSceneId)
    selectedSubSceneId.value = preferredExists ? preferredSceneId : sceneList[0].id
  },
  { immediate: true },
)

watch(
  activeDormEvent,
  (eventState) => {
    if (!eventState) return
    activeDormOverlayPanelId.value = 'interaction'
    isDormOverlayPanelExpanded.value = true
  },
)

watch(
  selectedDormChatHistory,
  () => {
    void scrollDormChatToBottom()
  },
  { deep: true },
)

watch(
  [activeDormOverlayPanelId, isDormOverlayPanelExpanded],
  ([panelId, expanded]) => {
    if (!expanded || panelId !== 'interaction') return
    void scrollDormChatToBottom()
  },
)

// 当 activeBook 加载后，初始化任务板数据
watch(
  activeBook,
  (book) => {
    task.syncTaskBoardFromBook()
  },
  { immediate: true },
)

const refreshWorldBooks = async () => {
  isLoadingBooks.value = true
  try {
    const books = await loadWorldBooks()
    worldBooks.value = Array.isArray(books) ? books : []

    if (!worldBooks.value.length) {
      activeCardIndex.value = 0
      portraitUrlMap.value = {}
      selectedCharacterId.value = ''
      return
    }

    const activeBookId = await getActiveWorldBookId()
    const matchedIndex = worldBooks.value.findIndex((book) => book.id === activeBookId)
    activeCardIndex.value = matchedIndex >= 0 ? matchedIndex : 0
    await ensureSelectedBookAsActive()
    await preloadCharacterPortraits()
  } finally {
    isLoadingBooks.value = false
  }
}

const switchWorldBookCard = async (direction = 1) => {
  if (worldBooks.value.length <= 1) return

  const step = Number(direction) >= 0 ? 1 : -1
  const total = worldBooks.value.length
  cardTransitionName.value = step > 0 ? 'card-slide-next' : 'card-slide-prev'
  activeCardIndex.value = (activeCardIndex.value + step + total) % total
  selectedCharacterId.value = ''
  actionFeedback.value = ''
  clearStageUpgradeToast()
  clearDormEvent({ persist: false })

  await ensureSelectedBookAsActive()
  await preloadCharacterPortraits()
}

const goToNextWorldBook = async () => {
  await switchWorldBookCard(1)
}

const goToPrevWorldBook = async () => {
  await switchWorldBookCard(-1)
}

const handleCardTouchStart = (event) => {
  const touch = event.touches?.[0]
  if (!touch) return
  cardTouchStartX = touch.clientX
  cardTouchStartY = touch.clientY
  cardTouchTracking = true
}

const handleCardTouchCancel = () => {
  cardTouchTracking = false
}

const handleCardTouchEnd = async (event) => {
  if (!cardTouchTracking) return
  cardTouchTracking = false

  const touch = event.changedTouches?.[0]
  if (!touch) return

  const deltaX = touch.clientX - cardTouchStartX
  const deltaY = touch.clientY - cardTouchStartY
  const horizontalSwipe = Math.abs(deltaX) >= CARD_SWIPE_TRIGGER_PX && Math.abs(deltaX) > Math.abs(deltaY)
  if (!horizontalSwipe) return

  if (deltaX < 0) {
    await goToNextWorldBook()
    return
  }
  await goToPrevWorldBook()
}

const enterCharacterGrid = async () => {
  if (!activeBook.value) return
  currentView.value = VIEW_CHARACTER_GRID
  activeCharacterIndex.value = 0
  selectedCharacterId.value = ''
  dormQuickActionType.value = 'chat'
  activeDormOverlayPanelId.value = 'interaction'
  isDormOverlayPanelExpanded.value = false
  isDormNavMenuOpen.value = false
  isDormMenuOpen.value = false
  dormChatDraft.value = ''
  driftBottleDraft.value = ''
  dormChatError.value = ''
  isDormChatSending.value = false
  isDormDriftPicking.value = false
  dormDriftPickRequestToken += 1
  driftFollowupPendingEntryId.value = ''
  dormDriftFollowupRequestToken += 1
  actionFeedback.value = ''
  clearStageUpgradeToast()
  clearDormEvent({ persist: false })
  await preloadCharacterPortraits()
}

const switchCharacterCard = async (step) => {
  const total = characterCards.value.length
  if (total <= 1) return
  characterTransitionName.value = step > 0 ? 'card-slide-next' : 'card-slide-prev'
  activeCharacterIndex.value = (activeCharacterIndex.value + step + total) % total
}

const goToNextCharacter = async () => {
  await switchCharacterCard(1)
}

const goToPrevCharacter = async () => {
  await switchCharacterCard(-1)
}

const switchToCharacter = async (targetIndex) => {
  const total = characterCards.value.length
  if (total <= 1) return
  const current = activeCharacterIndex.value
  if (targetIndex === current) return
  const diff = (targetIndex - current + total) % total
  const step = diff <= total / 2 ? diff : diff - total
  characterTransitionName.value = step > 0 ? 'card-slide-next' : 'card-slide-prev'
  activeCharacterIndex.value = targetIndex
}

let characterTouchTracking = false
let characterTouchStartX = 0

const handleCharacterTouchStart = (event) => {
  const touch = event.touches?.[0]
  if (!touch) return
  characterTouchTracking = true
  characterTouchStartX = touch.clientX
}

const handleCharacterTouchCancel = () => {
  characterTouchTracking = false
}

const handleCharacterTouchEnd = async (event) => {
  if (!characterTouchTracking) return
  characterTouchTracking = false
  const touch = event.changedTouches?.[0]
  if (!touch) return
  const deltaX = touch.clientX - characterTouchStartX
  const threshold = 40
  if (Math.abs(deltaX) < threshold) return
  if (deltaX < 0) {
    await goToNextCharacter()
    return
  }
  await goToPrevCharacter()
}

const backToBookCard = () => {
  currentView.value = VIEW_BOOK_CARD
  selectedCharacterId.value = ''
  dormQuickActionType.value = 'chat'
  activeDormOverlayPanelId.value = 'interaction'
  isDormOverlayPanelExpanded.value = false
  isDormNavMenuOpen.value = false
  dormChatDraft.value = ''
  driftBottleDraft.value = ''
  dormChatError.value = ''
  isDormChatSending.value = false
  isDormDriftPicking.value = false
  dormDriftPickRequestToken += 1
  driftFollowupPendingEntryId.value = ''
  dormDriftFollowupRequestToken += 1
  actionFeedback.value = ''
  clearStageUpgradeToast()
  clearDormEvent({ persist: false })
}

const enterCharacterRoom = (characterId) => {
  const nextId = String(characterId || '').trim()
  if (!nextId) return

  selectedCharacterId.value = nextId
  ensureDormStateForCharacter(nextId)
  currentView.value = VIEW_CHARACTER_ROOM
  dormQuickActionType.value = 'chat'
  activeDormOverlayPanelId.value = 'interaction'
  isDormNavMenuOpen.value = false
  isDormMenuOpen.value = false
  dormChatDraft.value = ''
  driftBottleDraft.value = ''
  dormChatError.value = ''
  isDormChatSending.value = false
  isDormDriftPicking.value = false
  dormDriftPickRequestToken += 1
  driftFollowupPendingEntryId.value = ''
  dormDriftFollowupRequestToken += 1
  clearStageUpgradeToast()
  setActiveDormEvent(dormRuntimeMap.value[selectedDormRuntimeKey.value]?.activeEvent, { persist: false })
}

const backToCharacterGrid = () => {
  currentView.value = VIEW_CHARACTER_GRID
  dormQuickActionType.value = 'chat'
  activeDormOverlayPanelId.value = 'interaction'
  isDormNavMenuOpen.value = false
  isDormMenuOpen.value = false
  dormChatDraft.value = ''
  driftBottleDraft.value = ''
  dormChatError.value = ''
  isDormChatSending.value = false
  isDormDriftPicking.value = false
  dormDriftPickRequestToken += 1
  driftFollowupPendingEntryId.value = ''
  dormDriftFollowupRequestToken += 1
  actionFeedback.value = ''
  clearStageUpgradeToast()
  clearDormEvent({ persist: false })
}

const formatJournalTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

onMounted(async () => {
  // 重置模块级 composable 状态（避免卸载后残留）
  redPacket.cancelSendRedPacket()
  diary.showDiaryModal.value = false
  diary.selectedDiary.value = null
  diary.showDiaryGeneratingModal.value = false
  diary.isGeneratingDiary.value = false
  dormRuntimeMap.value = readDormRuntimeMap()
  driftBottlePool.value = readDormDriftBottlePool()
  // 初始化世界书经济和背包的响应式 ref
  try {
    const economyRaw = window.localStorage.getItem(DORM_WORLD_BOOK_ECONOMY_STORAGE_KEY)
    if (economyRaw) {
      worldBookEconomyMap.value = JSON.parse(economyRaw)
    }
    const inventoryRaw = window.localStorage.getItem(DORM_WORLD_BOOK_INVENTORY_STORAGE_KEY)
    if (inventoryRaw) {
      worldBookInventoryMap.value = JSON.parse(inventoryRaw)
    }
  } catch {
    // ignore
  }
  defaultPortraitUrl.value = await getDefaultPortraitUrl()
  await refreshWorldBooks()

  // 初始化商店商品
  shop.initShopItems()

  // 检查并生成当天的日记
  diary.checkAndGenerateDailyDiary()

  // 启动来访巡检定时器
  appointment.startVisitWatcher()
  appointment.cleanOldVisits()

  // 注册通知点击监听器（处理约定到期和来访通知）
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    dormNotificationListener = LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
      const extra = notification?.notification?.extra
      if (extra) {
        appointment.handleNotificationClicked(extra)
      }
    })
  } catch (err) {
    console.warn('[Dormitory] 通知点击监听器注册失败:', err.message)
  }
})

onBeforeUnmount(() => {
  // 停止来访巡检定时器
  appointment.stopVisitWatcher()
  // 移除通知点击监听器
  if (dormNotificationListener) {
    dormNotificationListener.remove()
    dormNotificationListener = null
  }
  clearStageUpgradeToast()
  characterPreloadToken += 1
  dormDriftPickRequestToken += 1
  dormDriftFollowupRequestToken += 1
  // 清理拖动调整高度的事件监听器
  stopDragResize()
  stopDragResizeTouch()
  // 重置模块级 composable 状态
  redPacket.cancelSendRedPacket()
  diary.showDiaryModal.value = false
  diary.showDiaryGeneratingModal.value = false
})
</script>

<template>
  <main class="dormitory-screen" :class="{ 'platform-android': isAndroidPlatform, 'android-portrait': isAndroidPlatform }" role="main">
    <header class="dormitory-header">
      <button type="button" class="dorm-back-button" @click="handleDormNavBackMain">
        <span class="dorm-back-icon">‹</span>
      </button>
      <div class="dorm-title-group">
        <h1 class="dorm-title">
          <span>寝室系统</span>
          <span class="dorm-title-gradient">CHARACTER DORMITORY</span>
        </h1>
      </div>
    </header>

    <section class="dormitory-body">
      <div v-if="isLoadingBooks" class="dorm-state-box">正在加载世界书...</div>
      <div v-else-if="worldBooks.length === 0" class="dorm-state-box">未找到世界书，请先创建世界书。</div>

      <template v-else>
        <section
          v-if="currentView === VIEW_BOOK_CARD"
          class="worldbook-card-stage"
          @touchstart="handleCardTouchStart"
          @touchcancel="handleCardTouchCancel"
          @touchend="handleCardTouchEnd"
        >
          <div class="worldbook-card-wrap">
            <p class="card-swipe-hint">支持左右滑动切换世界书</p>
            <Transition :name="cardTransitionName" mode="out-in">
              <article :key="activeBook?.id || `book-${activeCardIndex}`" class="worldbook-card">
                <p class="card-index">世界书卡片 {{ activeCardIndex + 1 }} / {{ worldBooks.length }}</p>
                <h2 class="worldbook-title">{{ activeBook?.title || '未命名世界书' }}</h2>
                <p class="worldbook-summary">{{ activeBook?.summary || '该世界书暂未填写简介。' }}</p>
                <div class="worldbook-meta-row">
                  <span class="meta-chip">{{ characterCards.length }} 个 CHAR</span>
                  <span class="meta-chip">{{ activeBook?.isDefault ? '默认' : '自定义' }}</span>
                </div>
                <button type="button" class="enter-dorm-btn" :disabled="characterCards.length === 0" @click="enterCharacterGrid">
                  进入寝室
                </button>
                <p v-if="characterCards.length === 0" class="worldbook-hint">该世界书暂无 CHAR，请先在世界书中创建角色。</p>
              </article>
            </Transition>
          </div>
        </section>

        <section
          v-else-if="currentView === VIEW_CHARACTER_GRID"
          class="character-grid-stage"
          @touchstart="handleCharacterTouchStart"
          @touchcancel="handleCharacterTouchCancel"
          @touchend="handleCharacterTouchEnd"
        >
          <!-- 世界书级别货币显示 -->
          <div class="worldbook-top-bar">
            <span class="user-avatar" @click="isAvatarFrameScreenOpen = true">
              <template v-if="activeAvatarDataUrl || userPortraitUrl">
                <img :src="activeAvatarDataUrl || userPortraitUrl" alt="用户头像" />
                <img
                  v-if="activeFrame?.dataUrl"
                  :src="activeFrame.dataUrl"
                  class="avatar-frame-overlay"
                  alt=""
                />
              </template>
              <span v-else class="user-avatar-placeholder">👤</span>
            </span>
            <span class="economy-item">
              {{ activeBook?.userProfile?.name || '未命名角色' }}
            </span>
            <span class="economy-item">
              <span class="economy-icon">💰</span>
              <span class="economy-value">{{ activeBookEconomyCoins }}</span>
            </span>
            <span class="economy-item">
              <span class="economy-icon">💎</span>
              <span class="economy-value">{{ activeBookEconomyCrystals }}</span>
            </span>
            <button type="button" class="economy-shop-btn" @click="shop.openWorldBookShop">
              🏪 SHOP
            </button>
          </div>

          <!-- 侧边操作按钮：TASK / TRPG -->
          <div class="side-action-bar">
            <button type="button" class="side-action-btn" @click="task.handleOpenTaskBoard">
              TASK
            </button>
            <button type="button" class="side-action-btn" @click="handleLaunchTRPG">
              TRPG
            </button>
          </div>
          
          <div v-if="isLoadingCharacters" class="dorm-state-box">正在加载角色立绘...</div>
          <div v-else-if="characterCards.length === 0" class="dorm-state-box">当前世界书暂无 CHAR。</div>
          <div v-else class="character-carousel">
            <p class="card-swipe-hint">左右滑动切换角色</p>
            <p class="character-card-name">{{ characterCards[activeCharacterIndex]?.label || '未命名角色' }}</p>
            <div class="character-carousel-track">
              <button
                v-for="(character, index) in characterCards"
                :key="character.id"
                type="button"
                class="character-carousel-card"
                :class="{
                  'is-active': index === activeCharacterIndex,
                  'is-prev': index === (activeCharacterIndex - 1 + characterCards.length) % characterCards.length,
                  'is-next': index === (activeCharacterIndex + 1) % characterCards.length
                }"
                @click="index === activeCharacterIndex ? enterCharacterRoom(character.id) : switchToCharacter(index)"
              >
                <img
                  class="character-card-portrait-img"
                  :src="portraitUrlMap[character.id] || defaultPortraitUrl"
                  :alt="character.label"
                />
              </button>
            </div>
          </div>
        </section>

        <CharacterRoomView
          v-else
          ref="characterRoomViewRef"
          :selected-character="selectedCharacter"
          :selected-character-portrait-url="selectedCharacterPortraitUrl"
          :selected-character-archetype-labels="selectedCharacterArchetypeLabels"
          :active-dorm-overlay-panel-id="activeDormOverlayPanelId"
          :selected-dorm-state="selectedDormState"
          :selected-dorm-relationship-stage-label="selectedDormRelationshipStageLabel"
          :selected-dorm-relationship-progress-hint="selectedDormRelationshipProgressHint"
          :selected-dorm-unlocked-event-chain-count="selectedDormUnlockedEventChainCount"
          :selected-dorm-unlocked-event-chain-hint="selectedDormUnlockedEventChainHint"
          :generated-dorm-sub-scenes="generatedDormSubScenes"
          :active-dorm-sub-scene="activeDormSubScene"
          :active-dorm-sub-scene-visit-count="activeDormSubSceneVisitCount"
          :active-dorm-sub-scene-facility-level="activeDormSubSceneFacilityLevel"
          :active-dorm-sub-scene-facility-bonus-percent="activeDormSubSceneFacilityBonusPercent"
          :dorm-scene-facility-max-level="DORM_SCENE_FACILITY_MAX_LEVEL"
          :can-upgrade-active-scene-facility="canUpgradeActiveSceneFacility"
          :active-scene-upgrade-button-text="activeSceneUpgradeButtonText"
          :active-dorm-sub-scene-activity-options="activeDormSubSceneActivityOptions"
          :selected-dorm-sub-scene-activity="selectedDormSubSceneActivity"
          :current-dorm-time-slot-label="currentDormTimeSlotLabel"
          :remaining-dorm-action-slots="remainingDormActionSlots"
          :completed-today-wish-count="completedTodayWishCount"
          :total-today-wish-count="totalTodayWishCount"
          :is-dorm-day-action-closed="isDormDayActionClosed"
          :active-book-inventory="activeBookInventory"
          :is-gift-item-processing="gift.isGiftItemProcessing.value"
          :selected-dorm-drift-remaining-throw-count="selectedDormDriftRemainingThrowCount"
          :selected-dorm-drift-remaining-pick-count="selectedDormDriftRemainingPickCount"
          :selected-dorm-drift-pick-hint="selectedDormDriftPickHint"
          :selected-dorm-drift-inbox="selectedDormDriftInbox"
          :selected-dorm-drift-my-throw-list="selectedDormDriftMyThrowList"
          :is-dorm-drift-picking="isDormDriftPicking"
          :dorm-drift-bottle-daily-throw-limit="DORM_DRIFT_BOTTLE_DAILY_THROW_LIMIT"
          :dorm-drift-bottle-daily-pick-limit="DORM_DRIFT_BOTTLE_DAILY_PICK_LIMIT"
          :dorm-drift-bottle-text-limit="DORM_DRIFT_BOTTLE_TEXT_LIMIT"
          :drift-bottle-draft="driftBottleDraft"
          :can-throw-dorm-drift-bottle="canThrowDormDriftBottle"
          :can-pick-dorm-drift-bottle="canPickDormDriftBottle"
          :can-ask-dorm-drift-bottle-follow-up="canAskDormDriftBottleFollowUp"
          :dorm-chat-overlay-height="dormChatOverlayHeight"
          :selected-dorm-chat-history="mergedDormChatHistory"
          :dorm-chat-draft="dormChatDraft"
          :is-dorm-chat-sending="isDormChatSending"
          :can-send-dorm-chat="canSendDormChat"
          :dorm-chat-error="dormChatError"
          :dorm-quick-action-type="dormQuickActionType"
          :dorm-quick-action-options="DORM_QUICK_ACTION_OPTIONS"
          :can-run-dorm-quick-action="canRunDormQuickAction"
          :dorm-quick-action-run-button-text="dormQuickActionRunButtonText"
          :action-feedback="actionFeedback"
          :stage-upgrade-toast="stageUpgradeToast"
          :active-dorm-event="activeDormEvent"
          :active-dorm-event-chain-progress-text="activeDormEventChainProgressText"
          :diary-list="diary.diaryList.value"
          :selected-diary="diary.selectedDiary.value"
          :diary-mode="activeDormOverlayPanelId === 'diary-detail' ? 'detail' : 'list'"
          :is-dorm-menu-open="isDormMenuOpen"
          @close-overlay-panel="handleCollapseDormOverlayPanel"
          @toggle-dorm-menu="handleToggleDormMenu"
          @select-dorm-sub-scene="handleDormSubSceneSelectChange"
          @upgrade-scene-facility="handleUpgradeActiveSceneFacility"
          @select-dorm-sub-scene-activity="handleDormSubSceneActivitySelectChange"
          @run-dorm-sub-scene-activity="handleRunDormSubSceneActivity"
          @advance-dorm-day="handleAdvanceDormDay"
          @gift-dorm-item="gift.handleGiftDormItem"
          @throw-drift-bottle="handleThrowDormDriftBottle"
          @pick-drift-bottle="handlePickDormDriftBottle"
          @ask-drift-follow-up="handleAskDormDriftBottleFollowUp"
          @toggle-drift-star="handleToggleDormDriftBottleStar"
          @delete-drift-inbox-entry="handleDeleteDormDriftBottleInboxEntry"
          @send-dorm-chat="handleSendDormChat"
          @start-drag-resize="startDragResize"
          @start-drag-resize-touch="startDragResizeTouch"
          @run-dorm-quick-action="handleRunDormQuickAction"
          @handle-dorm-event-option="handleDormEventOption"
          @open-diary-detail="diary.openDiaryDetail"
          @back-to-diary-list="diary.closeDiaryDetail"
          @update-dorm-chat-draft="handleDormChatDraftInput"
          @update-drift-bottle-draft="handleDriftBottleDraftInput"
          @update-dorm-quick-action-type="handleDormQuickActionTypeChange"
          @task-invite-click="task.handleTaskInviteClick"
          @task-invite-toggle="task.toggleTaskInviteDropdown"
          @red-packet-opened="redPacket.handleRedPacketOpened"
          @red-packet-send="redPacket.handleSendRedPacket"
          :is-polaroid-screen-open="isPolaroidScreenOpen"
          :active-book-economy-coins="activeBookEconomyCoins"
          :gift="gift"
          :diary="diary"
          :red-packet="redPacket"
          :task="task"
          @polaroid-back="handlePolaroidBack"
          @polaroid-complete="handlePolaroidComplete"
          @open-appointment="appointment.openAppointmentModal"
        />
      </template>
    </section>
  </main>

  <!-- 世界书商店面板 -->
  <WorldBookShopModal
    :is-open="shop.isWorldBookShopOpen.value"
    :active-book-economy-coins="shop.activeBookEconomyCoins.value"
    :active-book-economy-crystals="shop.activeBookEconomyCrystals.value"
    :shop-items="shop.shopFilteredItems.value"
    :selected-category="shop.shopSelectedCategory.value"
    :categories="shop.DORM_SHOP_CATEGORIES"
    :is-refreshing="shop.isShopRefreshing.value"
    :purchase-feedback="shop.shopPurchaseFeedback.value"
    @close="shop.closeWorldBookShop"
    @select-category="shop.handleSelectShopCategory"
    @refresh-items="shop.handleRefreshShopItems"
    @buy-item="shop.handleBuyShopItem"
  />

  <!-- 任务板面板 -->
  <TaskBoardModal
    :is-open="task.isTaskBoardOpen.value"
    :tasks="task.taskBoardTasks.value"
    :is-loading="task.taskBoardGenerating.value"
    :feedback="task.taskBoardFeedback.value"
    :coins="shop.activeBookEconomyCoins.value"
    :crystals="shop.activeBookEconomyCrystals.value"
    @close="task.handleCloseTaskBoard"
    @generate-tasks="task.handleGenerateTaskBoardTasks"
    @accept-task="task.handleAcceptTaskBoardTask"
    @submit-task="task.handleSubmitTaskBoardTask"
    @complete-task="task.handleCompleteTaskBoardTask"
    @delete-task="task.handleDeleteTaskBoardTask"
    @team-battle="handleOpenTeamBattle"
  />

  <!-- 任务执行界面 -->
  <TaskExecutionModal
    v-if="task.isTaskExecutionOpen.value && task.currentExecutionTask.value"
    :key="'task_exec_' + (task.currentExecutionTask.value?.id || 'none')"
    :is-open="task.isTaskExecutionOpen.value"
    :task="task.currentExecutionTask.value"
    :character-roles="[]"
    :world-book="activeBook"
    :user-name="activeBookUserName"
    :target-character-id="task.currentExecutionTask.value?.targetCharacterId || ''"
    :target-character-name="task.currentExecutionTask.value?.targetCharacterName || ''"
    @close="task.handleTaskExecutionClose"
    @complete="task.handleTaskExecutionComplete"
  />

  <!-- 组队选择界面 -->
  <TeamSelectModal
    :is-open="isTeamSelectOpen"
    :world-book="activeBook"
    :user-profile="activeBookUserProfile"
    @close="handleTeamSelectClose"
    @start-battle="handleTeamSelectStartBattle"
  />

  <!-- 战斗界面 -->
  <BattleScreen
    :is-open="isBattleScreenOpen"
    :task-id="battleTask?.id || ''"
    :board-id="getActiveWorldBookId()"
    :world-book="activeBook"
    :selected-characters="battleSelectedCharacters"
    :user-profile="activeBookUserProfile"
    @close="handleBattleClose"
    @battle-victory="handleBattleVictory"
    @battle-defeat="handleBattleDefeat"
  />

  <!-- 跑团界面 -->
  <TRPGPanel
    ref="trpgPanelRef"
    :is-open="isTRPGPanelOpen"
    :active-book="activeBook"
    :user-name="activeBookUserName"
    @close="isTRPGPanelOpen = false"
  />

  <!-- 约定设定面板 -->
  <AppointmentModal
    :is-open="appointment.showAppointmentModal.value"
    :character="selectedCharacter"
    :existing-appointments="appointment.characterAppointments.value"
    :is-creating="appointment.isAppointmentCreating.value"
    :feedback="appointment.appointmentFeedback.value"
    @close="appointment.closeAppointmentModal"
    @create="(payload) => appointment.createAppointment(payload.scheduledAt)"
    @cancel="appointment.cancelAppointment"
  />

  <!-- 头像框选择界面 -->
  <AvatarFrameScreen
    v-if="isAvatarFrameScreenOpen"
    @close="isAvatarFrameScreenOpen = false"
  />
</template>

<style scoped src="./DormitoryScreen.css"></style>
