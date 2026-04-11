<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { kvStorage } from '../../storage/index.js'
import {
  generateBedroomFurnitureItems,
  generateHandheldCampfireCompanions,
  generateHandheldDungeonBanter,
  generateHandheldDungeonMap,
  generateHandheldDungeonScene,
  generateMerchantItems,
} from '../../llm/index.js'
import { isAndroid } from '../../utils/platform.js'
import { getActiveWorldBookId, loadWorldBooks } from '../../worldbook/worldBookStore.js'
import { ROLE_FALLBACK_LIST, resolveClassicRole } from './logic/roleEngine.js'
import {
  createDungeonMapRuntime,
  DUNGEON_MAP_MAX_SIZE,
  DUNGEON_MAP_MIN_SIZE,
  DUNGEON_TILE_EMPTY,
  DUNGEON_TILE_START,
  DUNGEON_TILE_EXIT,
  DUNGEON_TILE_BOSS,
  DUNGEON_TILE_MONSTER,
  DUNGEON_TILE_TREASURE,
} from './logic/dungeonMapEngine.js'
import { buildDungeonMapForFloorWithFallback } from './logic/dungeonMapGeneration.js'
import { generateBedroomFurnitureDraftsWithFallback } from './logic/bedroomGeneration.js'
import {
  buildLocalBedroomFurnitureDrafts as buildLocalBedroomFurnitureDraftsByTemplate,
} from './logic/bedroomPlacement.js'
import { applyBedroomFurnitureDraftsToState } from './logic/bedroomFurnitureApply.js'
import {
  loadActiveWorldBookSnapshot as loadActiveWorldBookSnapshotByRuntime,
  buildWorldBookCharacterSignature as buildWorldBookCharacterSignatureByRuntime,
  buildWorldBookTeammates as buildWorldBookTeammatesByRuntime,
} from './logic/worldbookRuntime.js'
import {
  buildFallbackCampfireCompanions as buildFallbackCampfireCompanionsByRuntime,
  calcTargetCampfireCompanionCount as calcTargetCampfireCompanionCountByRuntime,
  mergeGeneratedCompanions as mergeGeneratedCompanionsByRuntime,
  applyCompanionRolesToTeammates as applyCompanionRolesToTeammatesByRuntime,
} from './logic/campfireCompanionRuntime.js'
import { resolveCampfireCompanionsState } from './logic/campfireEnsure.js'
import {
  rollEquipmentRarity as rollEquipmentRarityByProgression,
  drawEquipmentOne as drawEquipmentOneByProgression,
  promoteByExp as promoteByExpByProgression,
  createEnemyByFloor as createEnemyByFloorByProgression,
} from './logic/battleProgression.js'
import {
  createLocalScene as createLocalSceneByRuntime,
  tryBuildLootAsEquipment as tryBuildLootAsEquipmentByRuntime,
  loadDungeonSceneWithFallback,
} from './logic/dungeonSceneRuntime.js'
import { applyExploreResultToState } from './logic/dungeonExploreResult.js'
import {
  buildDungeonCellBadge as buildDungeonCellBadgeByRuntime,
  buildDungeonCellClass as buildDungeonCellClassByRuntime,
  buildDungeonCellTitle as buildDungeonCellTitleByRuntime,
} from './logic/dungeonCellView.js'
import { resolveStorageScopeKey as resolveStorageScopeKeyByState } from './state/storageScope.js'
import {
  buildPersistPayload,
  persistStateSnapshot,
  restoreStateSnapshot,
} from './state/persistence.js'
import {
  buildMerchantSellPriceRange,
} from './logic/merchantEquipment.js'
import {
  loadMerchantItemsFromStorage,
  saveMerchantItemsToStorage,
} from './logic/merchantItems.js'
import { generateMerchantItemsWithFallback } from './logic/merchantGeneration.js'
import {
  applyMerchantPurchase,
  applyMerchantSell,
} from './logic/merchantTransactions.js'
import {
  EQUIPMENT_POOL,
  LOCAL_BANTER_LINES,
  LOCAL_SCENE_LIBRARY,
} from './logic/dungeonLocalContent.js'
import {
  getCampfireLayoutKey as getCampfireLayoutKeyByInput,
  getCampfireCompanionLayout as getCampfireCompanionLayoutByInput,
  pruneCampfireLayoutMap as pruneCampfireLayoutMapByInput,
  resolveCampfirePointerPercent as resolveCampfirePointerPercentByInput,
  resolveCampfireDragLayoutPoint as resolveCampfireDragLayoutPointByInput,
  createCampfireDragState as createCampfireDragStateByInput,
} from './logic/campfireInput.js'
import {
  resolveBedroomPointerCell as resolveBedroomPointerCellByInput,
  resolveBedroomDragPosition as resolveBedroomDragPositionByInput,
  buildBedroomDragState as buildBedroomDragStateByInput,
} from './logic/bedroomInput.js'
import {
  createEmptyCampfireBubble as createEmptyCampfireBubbleByLoopRuntime,
  createCampfireLoopRuntimeState as createCampfireLoopRuntimeStateByModule,
  shouldRunCampfireBubbleLoop as shouldRunCampfireBubbleLoopByLoopRuntime,
  shouldRunCampfireFrameLoop as shouldRunCampfireFrameLoopByLoopRuntime,
  resolveCampfireSpeakerIndex as resolveCampfireSpeakerIndexByLoopRuntime,
  stopCampfireBubbleLoop as stopCampfireBubbleLoopByLoopRuntime,
  startCampfireBubbleLoop as startCampfireBubbleLoopByLoopRuntime,
  stopCampfireFrameLoop as stopCampfireFrameLoopByLoopRuntime,
  startCampfireFrameLoop as startCampfireFrameLoopByLoopRuntime,
} from './logic/campfireLoopRuntime.js'
import {
  SPRITE_PIXEL_SIZE as CAMPFIRE_SPRITE_PIXEL,
  SPRITE_GRID_SIZE as CAMPFIRE_SPRITE_SIZE,
  createSpriteGrid,
  paintPixel,
  paintPoint,
  paintRect,
  paintPoints,
} from './render/pixelGrid.js'
import { createCampfireSpriteResolver } from './render/campfireSprites.js'
import { createDungeonSpriteRuntime } from './render/dungeonSprites.js'

const props = defineProps({
  worldBook: {
    type: Object,
    default: null,
  },
  saveSlotId: {
    type: [String, Number],
    default: '',
  },
  autoOpen: {
    type: Boolean,
    default: false,
  },
})

const STORAGE_KEY_BASE = 'handheld-xx-dungeon-adventure-state'
const MERCHANT_STORAGE_KEY = 'handheld-xx-dungeon-adventure-merchant-items'
const EQUIPMENT_SINGLE_COST = 100
const EQUIPMENT_PITY_LIMIT = 70
const MAX_LOG_COUNT = 420
const MAX_TEAMMATE_COUNT = 240
const MAX_EQUIPMENT_COUNT = 360
const MAX_BACKPACK_ITEM_COUNT = 240
const MAX_BACKPACK_ITEM_STACK = 99
const MAX_CAMPFIRE_COMPANIONS = MAX_TEAMMATE_COUNT
const MAX_CAMPFIRE_VISIBLE = 4
const MAX_CAMPFIRE_LLM_COUNT = 48
const MAX_MERCHANT_ITEMS = 6
const MERCHANT_REFRESH_COST = 50
const MERCHANT_SELL_DISCOUNT_MIN = 18
const MERCHANT_SELL_DISCOUNT_MAX = 45
const BEDROOM_GRID_WIDTH = 12
const BEDROOM_GRID_HEIGHT = 8
const MAX_BEDROOM_FURNITURE_ITEMS = 48
const BEDROOM_GENERATE_ITEM_COUNT = 4
const CAMPFIRE_BUBBLE_INTERVAL_MS = 6400
const CAMPFIRE_BUBBLE_BOOT_DELAY_MS = 900
const CAMPFIRE_STYLE_LIST = ['knight', 'mage', 'ranger', 'rogue', 'priest', 'alchemist']
const CAMPFIRE_PALETTE_LIST = ['ember', 'forest', 'sky', 'violet', 'sand', 'iron']
const CAMPFIRE_ACTION_LIST = ['idle', 'warm_hands', 'sharpen_blade', 'lookout', 'stretch', 'cheer']
const CAMPFIRE_STYLE_SET = new Set(CAMPFIRE_STYLE_LIST)
const CAMPFIRE_PALETTE_SET = new Set(CAMPFIRE_PALETTE_LIST)
const CAMPFIRE_ACTION_SET = new Set(CAMPFIRE_ACTION_LIST)
const DEFAULT_CAMPFIRE_NAMES = ['艾诺', '米拉', '托比', '莎米']
const CAMPFIRE_LAYOUT_X_MIN = 12
const CAMPFIRE_LAYOUT_X_MAX = 88
const CAMPFIRE_LAYOUT_Y_MIN = 18
const CAMPFIRE_LAYOUT_Y_MAX = 84
const CAMPFIRE_DEFAULT_LAYOUT = [
  { x: 26, y: 35 },
  { x: 74, y: 35 },
  { x: 22, y: 78 },
  { x: 78, y: 78 },
]

const resolveStorageScopeKey = () => {
  return resolveStorageScopeKeyByState({
    storageKeyBase: STORAGE_KEY_BASE,
    worldBookId: props.worldBook?.id || 'default_world_book',
    saveSlotId: props.saveSlotId || 'global',
  })
}

const panelOpen = ref(false)
const loading = ref(false)
const drawing = ref(false)
const banterLoading = ref(false)
const campfireCasting = ref(false)
const merchantLoading = ref(false)
const bedroomLoading = ref(false)
const merchantRestockModal = ref(false)
const activeCampfireBubble = ref({ companionId: '', text: '' })
const campfireRotateCursor = ref(0)
const campfireSpeakerCursor = ref(0)
const campfireFrameTick = ref(0)
const errorText = ref('')
const android = ref(false)
const logListRef = ref(null)
const campfireFieldRef = ref(null)
const dungeonMapCardRef = ref(null)
const bedroomBoardRef = ref(null)
const currentView = ref('home')
const draggingCampfireKey = ref('')
const draggingBedroomFurnitureId = ref('')
const selectedPartyMemberId = ref('')
const selectedBackpackItemKey = ref('')
const selectedBedroomFurnitureId = ref('')
const merchantItems = ref([])
const merchantSprite = ref('merchant')
const dungeonMapViewport = ref({
  width: 0,
  height: 0,
  cardWidth: 0,
})
const bedroomViewport = ref({
  width: 0,
  height: 0,
  cardWidth: 0,
})

const VIEW_LABELS = {
  home: '营地',
  dungeon: '地下城',
  gacha: '装备池',
  rest: '休息',
  tent: '帐篷',
  merchant: '流浪商人',
  bedroom: '卧室',
}

const rarityValue = (rarity) => (rarity === 'SSR' ? 3 : rarity === 'SR' ? 2 : 1)

const clampInt = (value, min, max, fallback = min) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

const pickRandomItem = (list, fallback = null) => {
  if (!Array.isArray(list) || list.length === 0) return fallback
  return list[Math.floor(Math.random() * list.length)]
}

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const {
  normalizeDungeonEnemy,
  normalizeDungeonReward,
  normalizeDungeonMap,
  countDungeonBossRemainingByMap,
  cloneDungeonMapState,
  findDungeonCellIndex,
  isDungeonMapUsable,
  createLocalDungeonMapDraft,
} = createDungeonMapRuntime({
  clampInt,
  makeId,
  pickRandomItem,
  randomInt,
})

const needExpByLevel = (level) => {
  const lv = Math.max(1, Number(level) || 1)
  return Math.floor(110 + lv * 72 + (lv - 1) * (lv - 1) * 8)
}

const normalizeRarity = (rawValue, fallback = 'R') => {
  const text = String(rawValue || '').toUpperCase()
  if (text === 'SSR' || text === 'SR' || text === 'R') return text
  return fallback
}

const normalizeSlot = (rawValue, fallback = 'weapon') => {
  const text = String(rawValue || '').toLowerCase()
  if (text === 'weapon' || text === 'armor' || text === 'relic') return text
  return fallback
}

const calcEquipmentScore = (item) => {
  const rarity = normalizeRarity(item?.rarity, 'R')
  const base = (Number(item?.atk) || 0) * 1.65 + (Number(item?.def) || 0) * 1.42 + (Number(item?.hp) || 0) * 0.54
  return Math.round(base + rarityValue(rarity) * 12)
}

const estimateEquipmentBasePrice = (rawValue) => {
  const rarity = normalizeRarity(rawValue?.rarity, 'R')
  const atk = clampInt(rawValue?.atk, 0, 999, 0)
  const def = clampInt(rawValue?.def, 0, 999, 0)
  const hp = clampInt(rawValue?.hp, 0, 9999, 0)
  const rarityBase = rarity === 'SSR' ? 210 : rarity === 'SR' ? 130 : 70
  const statValue = atk * 2.1 + def * 1.9 + hp * 0.36
  return clampInt(Math.round(rarityBase + statValue), 30, 99999, 60)
}

const normalizeTeammate = (rawValue, index = 0) => {
  if (!rawValue || typeof rawValue !== 'object') return null
  const rarity = normalizeRarity(rawValue.rarity, 'R')
  const name = String(rawValue.name || `冒险者${index + 1}`).trim().slice(0, 18)
  const role = resolveClassicRole(rawValue.role, index, `${rawValue.name || ''} ${rawValue.hint || ''}`)
  return {
    id: String(rawValue.id || makeId('tm')),
    worldCharacterId: String(rawValue.worldCharacterId || '').trim().slice(0, 80),
    name: name || `冒险者${index + 1}`,
    role,
    rarity,
    power: clampInt(rawValue.power, 1, 9999, 24 + index * 3),
  }
}

const normalizeEquipment = (rawValue, index = 0) => {
  if (!rawValue || typeof rawValue !== 'object') return null
  const rarity = normalizeRarity(rawValue.rarity, 'R')
  const slot = normalizeSlot(rawValue.slot, 'weapon')
  const name = String(rawValue.name || `装备${index + 1}`).trim().slice(0, 18)
  const fallbackPrice = estimateEquipmentBasePrice(rawValue)
  const basePrice = clampInt(rawValue.basePrice ?? rawValue.price, 1, 99999, fallbackPrice)
  const normalized = {
    id: String(rawValue.id || makeId('eq')),
    name: name || `装备${index + 1}`,
    rarity,
    slot,
    atk: clampInt(rawValue.atk, 0, 999, 0),
    def: clampInt(rawValue.def, 0, 999, 0),
    hp: clampInt(rawValue.hp, 0, 9999, 0),
    basePrice,
    desc: String(rawValue.desc || '').trim().slice(0, 40),
  }
  return {
    ...normalized,
    score: calcEquipmentScore(normalized),
  }
}

// 商人商品规范化
const MERCHANT_SPRITE_MOTIF_LIST = ['blade', 'axe', 'spear', 'shield', 'armor', 'helm', 'ring', 'orb', 'amulet']
const MERCHANT_SPRITE_PALETTE_LIST = ['iron', 'frost', 'jade', 'royal', 'ember', 'obsidian']
const MERCHANT_SPRITE_SILHOUETTE_LIST = ['slim', 'wide', 'spike', 'round']
const MERCHANT_SPRITE_ORNAMENT_LIST = ['none', 'rune', 'gem', 'wing', 'chain']
const MERCHANT_SPRITE_MOTIF_SET = new Set(MERCHANT_SPRITE_MOTIF_LIST)
const MERCHANT_SPRITE_PALETTE_SET = new Set(MERCHANT_SPRITE_PALETTE_LIST)
const MERCHANT_SPRITE_SILHOUETTE_SET = new Set(MERCHANT_SPRITE_SILHOUETTE_LIST)
const MERCHANT_SPRITE_ORNAMENT_SET = new Set(MERCHANT_SPRITE_ORNAMENT_LIST)
const MERCHANT_SPRITE_MOTIFS_BY_SLOT = {
  weapon: ['blade', 'axe', 'spear'],
  armor: ['shield', 'armor', 'helm'],
  relic: ['ring', 'orb', 'amulet'],
}
const MERCHANT_SPRITE_PALETTES_BY_RARITY = {
  R: ['iron', 'frost'],
  SR: ['jade', 'royal'],
  SSR: ['ember', 'obsidian'],
}
const MERCHANT_SPRITE_SILHOUETTE_BY_SLOT = {
  weapon: ['slim', 'spike', 'round'],
  armor: ['wide', 'round', 'spike'],
  relic: ['round', 'slim', 'wide'],
}
const MERCHANT_SPRITE_ORNAMENT_BY_RARITY = {
  R: ['none', 'rune', 'chain'],
  SR: ['rune', 'gem', 'wing'],
  SSR: ['gem', 'wing', 'chain'],
}

const hashMerchantSpriteSeed = (rawValue) => {
  const text = String(rawValue || '')
  let hash = 2166136261 >>> 0
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const createMerchantSeededRandom = (seedRaw) => {
  let seed = hashMerchantSpriteSeed(seedRaw) || 1
  return () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return ((seed >>> 0) % 1000000) / 1000000
  }
}

const pickMerchantBySeed = (list, seedRaw, fallback = '') => {
  const source = Array.isArray(list) ? list.filter(Boolean) : []
  if (source.length === 0) return fallback
  const random = createMerchantSeededRandom(seedRaw)
  const index = Math.floor(random() * source.length)
  return source[index] || source[0] || fallback
}

const buildDefaultMerchantSpriteSpec = (item = {}, index = 0) => {
  const rarity = normalizeRarity(item?.rarity, 'R')
  const slot = normalizeSlot(item?.slot, 'weapon')
  const motifCandidates = MERCHANT_SPRITE_MOTIFS_BY_SLOT[slot] || MERCHANT_SPRITE_MOTIFS_BY_SLOT.weapon
  const paletteCandidates = MERCHANT_SPRITE_PALETTES_BY_RARITY[rarity] || MERCHANT_SPRITE_PALETTES_BY_RARITY.R
  const silhouetteCandidates = MERCHANT_SPRITE_SILHOUETTE_BY_SLOT[slot] || MERCHANT_SPRITE_SILHOUETTE_LIST
  const ornamentCandidates = MERCHANT_SPRITE_ORNAMENT_BY_RARITY[rarity] || MERCHANT_SPRITE_ORNAMENT_LIST
  const seedBasis = `${item?.id || ''}:${item?.name || ''}:${slot}:${rarity}:${index}`
  const fallbackSeed = hashMerchantSpriteSeed(`${seedBasis}:seed`) % 1000000
  return {
    motif: pickMerchantBySeed(motifCandidates, `${seedBasis}:motif`, motifCandidates[0] || 'blade'),
    palette: pickMerchantBySeed(paletteCandidates, `${seedBasis}:palette`, paletteCandidates[0] || 'iron'),
    silhouette: pickMerchantBySeed(silhouetteCandidates, `${seedBasis}:silhouette`, silhouetteCandidates[0] || 'round'),
    ornament: pickMerchantBySeed(ornamentCandidates, `${seedBasis}:ornament`, ornamentCandidates[0] || 'none'),
    glow: rarity === 'SSR' ? 1 : 0,
    seed: clampInt(fallbackSeed, 0, 999999, 0),
  }
}

const normalizeMerchantSpriteSpec = (rawValue, item = {}, index = 0) => {
  const fallback = buildDefaultMerchantSpriteSpec(item, index)
  const rawObject = rawValue && typeof rawValue === 'object' ? rawValue : null
  if (!rawObject) return fallback

  const motifRaw = String(rawObject.motif || '').trim().toLowerCase()
  const paletteRaw = String(rawObject.palette || '').trim().toLowerCase()
  const silhouetteRaw = String(rawObject.silhouette || '').trim().toLowerCase()
  const ornamentRaw = String(rawObject.ornament || '').trim().toLowerCase()
  const glowText = String(rawObject.glow ?? '').trim().toLowerCase()
  const hasGlowInput = glowText !== ''
  const seedValue = Number(rawObject.seed)

  return {
    motif: MERCHANT_SPRITE_MOTIF_SET.has(motifRaw) ? motifRaw : fallback.motif,
    palette: MERCHANT_SPRITE_PALETTE_SET.has(paletteRaw) ? paletteRaw : fallback.palette,
    silhouette: MERCHANT_SPRITE_SILHOUETTE_SET.has(silhouetteRaw) ? silhouetteRaw : fallback.silhouette,
    ornament: MERCHANT_SPRITE_ORNAMENT_SET.has(ornamentRaw) ? ornamentRaw : fallback.ornament,
    glow: hasGlowInput ? (glowText === '1' || glowText === 'true' || glowText === 'yes' ? 1 : 0) : fallback.glow,
    seed: Number.isFinite(seedValue) ? clampInt(Math.round(seedValue), 0, 999999, fallback.seed) : fallback.seed,
  }
}

const normalizeMerchantItem = (rawValue, index = 0) => {
  if (!rawValue || typeof rawValue !== 'object') return null
  const rarity = normalizeRarity(rawValue.rarity, 'R')
  const slot = normalizeSlot(rawValue.slot, 'weapon')
  const name = String(rawValue.name || `商品${index + 1}`).trim().slice(0, 18)
  const price = clampInt(rawValue.price, 1, 99999, 50 + rarityValue(rarity) * 30)
  const base = {
    id: String(rawValue.id || makeId('mi')),
    name: name || `商品${index + 1}`,
    rarity,
    slot,
    atk: clampInt(rawValue.atk, 0, 999, 0),
    def: clampInt(rawValue.def, 0, 999, 0),
    hp: clampInt(rawValue.hp, 0, 9999, 0),
    price,
    desc: String(rawValue.desc || '').trim().slice(0, 40),
  }
  const legacySpriteStyle = String(rawValue.spriteStyle || '').trim().toLowerCase()
  const rawSpriteSpec = rawValue.spriteSpec && typeof rawValue.spriteSpec === 'object'
    ? rawValue.spriteSpec
    : legacySpriteStyle
      ? { motif: legacySpriteStyle }
      : null
  const normalized = {
    ...base,
    spriteSpec: normalizeMerchantSpriteSpec(rawSpriteSpec, base, index),
  }
  return {
    ...normalized,
    score: calcEquipmentScore(normalized),
  }
}

// 商人商品列表规范化
const normalizeMerchantItems = (rawList) => {
  const list = (Array.isArray(rawList) ? rawList : [])
    .map((item, index) => normalizeMerchantItem(item, index))
    .filter(Boolean)
    .slice(0, MAX_MERCHANT_ITEMS)
  return list
}

const BEDROOM_KIND_LIST = ['floor', 'sleep', 'storage', 'decor', 'utility']
const BEDROOM_KIND_SET = new Set(BEDROOM_KIND_LIST)
const BEDROOM_SPRITE_MOTIF_LIST = ['tile', 'rug', 'bed', 'sofa', 'desk', 'table', 'chair', 'cabinet', 'shelf', 'plant', 'lamp', 'window', 'chest', 'screen']
const BEDROOM_SPRITE_PALETTE_LIST = ['oak', 'pine', 'walnut', 'mint', 'sky', 'rose', 'stone', 'violet']
const BEDROOM_SPRITE_SILHOUETTE_LIST = ['compact', 'wide', 'tall', 'low']
const BEDROOM_SPRITE_ORNAMENT_LIST = ['none', 'border', 'cushion', 'drawer', 'leaf', 'rune']
const BEDROOM_TEMPLATE_TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const BEDROOM_TEMPLATE_TOKEN_SET = new Set(BEDROOM_TEMPLATE_TOKEN_ALPHABET.split(''))
const BEDROOM_TEMPLATE_MAX_COLORS = 12
const BEDROOM_SPRITE_MOTIF_SET = new Set(BEDROOM_SPRITE_MOTIF_LIST)
const BEDROOM_SPRITE_PALETTE_SET = new Set(BEDROOM_SPRITE_PALETTE_LIST)
const BEDROOM_SPRITE_SILHOUETTE_SET = new Set(BEDROOM_SPRITE_SILHOUETTE_LIST)
const BEDROOM_SPRITE_ORNAMENT_SET = new Set(BEDROOM_SPRITE_ORNAMENT_LIST)
const BEDROOM_SPRITE_MOTIFS_BY_KIND = {
  floor: ['tile', 'rug'],
  sleep: ['bed', 'sofa'],
  storage: ['cabinet', 'shelf', 'chest'],
  decor: ['plant', 'lamp', 'window', 'screen'],
  utility: ['desk', 'table', 'chair'],
}
const BEDROOM_SPRITE_PALETTES_BY_KIND = {
  floor: ['oak', 'pine', 'stone'],
  sleep: ['walnut', 'rose', 'mint'],
  storage: ['oak', 'walnut', 'stone'],
  decor: ['mint', 'sky', 'violet'],
  utility: ['oak', 'pine', 'sky'],
}

const normalizeBedroomKind = (rawValue, fallback = 'decor') => {
  const text = String(rawValue || '').trim().toLowerCase()
  if (BEDROOM_KIND_SET.has(text)) return text
  return fallback
}

const buildDefaultBedroomSpriteSpec = (item = {}, index = 0) => {
  const kind = normalizeBedroomKind(item?.kind, 'decor')
  const motifCandidates = BEDROOM_SPRITE_MOTIFS_BY_KIND[kind] || BEDROOM_SPRITE_MOTIFS_BY_KIND.decor
  const paletteCandidates = BEDROOM_SPRITE_PALETTES_BY_KIND[kind] || BEDROOM_SPRITE_PALETTES_BY_KIND.decor
  const seedBasis = `${item?.id || ''}:${item?.name || ''}:${kind}:${index}`
  const fallbackSeed = hashMerchantSpriteSeed(`${seedBasis}:bedroom`) % 1000000
  return {
    motif: pickMerchantBySeed(motifCandidates, `${seedBasis}:motif`, motifCandidates[0] || 'table'),
    palette: pickMerchantBySeed(paletteCandidates, `${seedBasis}:palette`, paletteCandidates[0] || 'oak'),
    silhouette: BEDROOM_SPRITE_SILHOUETTE_LIST[index % BEDROOM_SPRITE_SILHOUETTE_LIST.length],
    ornament: BEDROOM_SPRITE_ORNAMENT_LIST[index % BEDROOM_SPRITE_ORNAMENT_LIST.length],
    glow: kind === 'decor' ? 1 : 0,
    seed: clampInt(fallbackSeed, 0, 999999, 0),
  }
}

const normalizeBedroomSpriteSpec = (rawValue, item = {}, index = 0) => {
  const fallback = buildDefaultBedroomSpriteSpec(item, index)
  const rawObject = rawValue && typeof rawValue === 'object' ? rawValue : null
  if (!rawObject) return fallback
  const motifRaw = String(rawObject.motif || '').trim().toLowerCase()
  const paletteRaw = String(rawObject.palette || '').trim().toLowerCase()
  const silhouetteRaw = String(rawObject.silhouette || '').trim().toLowerCase()
  const ornamentRaw = String(rawObject.ornament || '').trim().toLowerCase()
  const glowText = String(rawObject.glow ?? '').trim().toLowerCase()
  const hasGlowInput = glowText !== ''
  const seedValue = Number(rawObject.seed)
  return {
    motif: BEDROOM_SPRITE_MOTIF_SET.has(motifRaw) ? motifRaw : fallback.motif,
    palette: BEDROOM_SPRITE_PALETTE_SET.has(paletteRaw) ? paletteRaw : fallback.palette,
    silhouette: BEDROOM_SPRITE_SILHOUETTE_SET.has(silhouetteRaw) ? silhouetteRaw : fallback.silhouette,
    ornament: BEDROOM_SPRITE_ORNAMENT_SET.has(ornamentRaw) ? ornamentRaw : fallback.ornament,
    glow: hasGlowInput ? (glowText === '1' || glowText === 'true' || glowText === 'yes' ? 1 : 0) : fallback.glow,
    seed: Number.isFinite(seedValue) ? clampInt(Math.round(seedValue), 0, 999999, fallback.seed) : fallback.seed,
  }
}

const isValidBedroomTemplateColor = (value) => {
  const text = String(value || '').trim()
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(text)
}

const normalizeBedroomSpriteTemplate = (rawValue) => {
  if (!rawValue || typeof rawValue !== 'object') return null

  const w = clampInt(rawValue?.w ?? rawValue?.width, 8, 24, 16)
  const h = clampInt(rawValue?.h ?? rawValue?.height, 8, 24, 16)
  const paletteSource = rawValue?.palette && typeof rawValue.palette === 'object'
    ? rawValue.palette
    : {}
  const palette = {}
  const entries = Object.entries(paletteSource)
  for (let i = 0; i < entries.length; i += 1) {
    if (Object.keys(palette).length >= BEDROOM_TEMPLATE_MAX_COLORS) break
    const [tokenRaw, colorRaw] = entries[i]
    const token = String(tokenRaw || '').trim().slice(0, 1).toLowerCase()
    if (!token || token === '.' || !BEDROOM_TEMPLATE_TOKEN_SET.has(token) || palette[token]) continue
    if (!isValidBedroomTemplateColor(colorRaw)) continue
    palette[token] = String(colorRaw).trim()
  }
  if (Object.keys(palette).length < 1) {
    palette.a = '#7a5a3a'
    palette.b = '#c89f72'
    palette.g = '#efe2c2'
  }

  let rowsRaw = []
  if (Array.isArray(rawValue?.rows)) {
    rowsRaw = rawValue.rows
  } else if (typeof rawValue?.rows === 'string') {
    rowsRaw = rawValue.rows.split(/\r?\n/g)
  } else if (typeof rawValue?.pixels === 'string') {
    rowsRaw = rawValue.pixels.split(/\r?\n/g)
  }
  if (rowsRaw.length < 1) return null

  const validTokens = new Set(['.', ...Object.keys(palette)])
  const rows = rowsRaw
    .slice(0, h)
    .map((line) => {
      const text = String(line || '').toLowerCase()
      let output = ''
      for (let i = 0; i < w; i += 1) {
        const token = text[i] || '.'
        output += validTokens.has(token) ? token : '.'
      }
      return output
    })
  while (rows.length < h) {
    rows.push('.'.repeat(w))
  }

  const hasVisible = rows.some((line) => {
    for (let i = 0; i < line.length; i += 1) {
      const token = line[i]
      if (token === '.') continue
      if (palette[token]) return true
    }
    return false
  })
  if (!hasVisible) return null

  return {
    w,
    h,
    palette,
    rows,
  }
}

const getBedroomTemplateSignature = (template) => {
  const normalized = normalizeBedroomSpriteTemplate(template)
  if (!normalized) return ''
  const paletteKeys = Object.keys(normalized.palette).sort()
  const paletteSignature = paletteKeys.map((key) => `${key}:${normalized.palette[key]}`).join(',')
  return `${normalized.w}x${normalized.h}|${paletteSignature}|${normalized.rows.join('/')}`
}

const normalizeBedroomFurnitureItem = (rawValue, index = 0, roomWidth = BEDROOM_GRID_WIDTH, roomHeight = BEDROOM_GRID_HEIGHT) => {
  if (!rawValue || typeof rawValue !== 'object') return null
  const kind = normalizeBedroomKind(rawValue.kind, 'decor')
  const defaultWidth = kind === 'floor' ? 3 : kind === 'sleep' ? 2 : 1
  const defaultHeight = kind === 'floor' ? 2 : kind === 'sleep' ? 2 : 1
  const width = clampInt(rawValue.width, 1, 4, defaultWidth)
  const height = clampInt(rawValue.height, 1, 4, defaultHeight)
  const maxX = Math.max(0, roomWidth - width)
  const maxY = Math.max(0, roomHeight - height)
  const fallbackX = maxX > 0 ? index % (maxX + 1) : 0
  const fallbackY = maxY > 0 ? Math.floor(index / Math.max(1, maxX + 1)) % (maxY + 1) : 0
  const x = clampInt(rawValue.x, 0, maxX, fallbackX)
  const y = clampInt(rawValue.y, 0, maxY, fallbackY)
  const zFallback = kind === 'floor' ? 0 : 10 + y
  const base = {
    id: String(rawValue.id || makeId('br')).trim().slice(0, 80) || makeId('br'),
    name: String(rawValue.name || `家具${index + 1}`).trim().slice(0, 24) || `家具${index + 1}`,
    kind,
    width,
    height,
    x,
    y,
    z: clampInt(rawValue.z, 0, 80, zFallback),
    walkable: typeof rawValue.walkable === 'boolean'
      ? rawValue.walkable
      : (kind === 'floor' || kind === 'decor'),
    desc: String(rawValue.desc || '').trim().slice(0, 60),
  }
  return {
    ...base,
    spriteTemplate: normalizeBedroomSpriteTemplate(rawValue.spriteTemplate),
    spriteSpec: normalizeBedroomSpriteSpec(rawValue.spriteSpec, base, index),
  }
}

const normalizeBedroomFurnitureList = (rawList, roomWidth = BEDROOM_GRID_WIDTH, roomHeight = BEDROOM_GRID_HEIGHT) => {
  const list = (Array.isArray(rawList) ? rawList : [])
    .map((item, index) => normalizeBedroomFurnitureItem(item, index, roomWidth, roomHeight))
    .filter(Boolean)
    .slice(0, MAX_BEDROOM_FURNITURE_ITEMS)
  return list
}

const buildDefaultBedroomState = () => ({
  width: BEDROOM_GRID_WIDTH,
  height: BEDROOM_GRID_HEIGHT,
  items: [],
})

const normalizeBedroomState = (rawValue) => {
  const defaults = buildDefaultBedroomState()
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const width = clampInt(source.width, BEDROOM_GRID_WIDTH, BEDROOM_GRID_WIDTH, BEDROOM_GRID_WIDTH)
  const height = clampInt(source.height, BEDROOM_GRID_HEIGHT, BEDROOM_GRID_HEIGHT, BEDROOM_GRID_HEIGHT)
  const items = normalizeBedroomFurnitureList(source.items, width, height)
  return {
    width,
    height,
    items,
  }
}

// 生成商人商品像素图
const MERCHANT_ITEM_SPRITE_PALETTES = {
  iron: { base: '#6b7688', accent: '#9faec5', glow: '#dce5f5' },
  frost: { base: '#5f7e9b', accent: '#b7d8ee', glow: '#e0f5ff' },
  jade: { base: '#3f7f5c', accent: '#8ad5a9', glow: '#c8f5dc' },
  royal: { base: '#5b56a6', accent: '#b7b0ff', glow: '#ddd7ff' },
  ember: { base: '#b35943', accent: '#ffd4a8', glow: '#ffe8c0' },
  obsidian: { base: '#3f3649', accent: '#a892bf', glow: '#e3d4ff' },
}
const MERCHANT_ITEM_SPRITE_CACHE = new Map()

const clearRect = (grid, x, y, width, height) => {
  for (let yy = 0; yy < height; yy += 1) {
    for (let xx = 0; xx < width; xx += 1) {
      const px = x + xx
      const py = y + yy
      if (px < 0 || py < 0 || px >= CAMPFIRE_SPRITE_SIZE || py >= CAMPFIRE_SPRITE_SIZE) continue
      grid[py][px] = '.'
    }
  }
}

const paintMerchantDiamond = (grid, centerX, centerY, radius, fillToken = 'a', edgeToken = 'b') => {
  for (let dy = -radius; dy <= radius; dy += 1) {
    const span = radius - Math.abs(dy)
    for (let dx = -span; dx <= span; dx += 1) {
      const token = Math.abs(dx) === span || Math.abs(dy) === radius ? edgeToken : fillToken
      paintPixel(grid, centerX + dx, centerY + dy, token)
    }
  }
}

const drawMerchantSlotFallback = (grid, slot, centerX, centerY) => {
  if (slot === 'weapon') {
    for (let y = centerY - 5; y <= centerY + 4; y += 1) {
      paintPixel(grid, centerX, y, 'b')
    }
    paintPoints(grid, [[centerX - 1, centerY - 4], [centerX + 1, centerY - 4], [centerX - 1, centerY + 4], [centerX + 1, centerY + 4]], 'a')
    return
  }
  if (slot === 'armor') {
    paintRect(grid, centerX - 3, centerY - 4, 7, 8, 'a')
    paintRect(grid, centerX - 3, centerY - 4, 7, 1, 'b')
    paintRect(grid, centerX - 3, centerY + 3, 7, 1, 'b')
    paintRect(grid, centerX - 3, centerY - 4, 1, 8, 'b')
    paintRect(grid, centerX + 3, centerY - 4, 1, 8, 'b')
    paintPoints(grid, [[centerX, centerY - 1], [centerX, centerY + 1]], 'g')
    return
  }
  paintMerchantDiamond(grid, centerX, centerY, 3, 'a', 'b')
  paintPoints(grid, [[centerX, centerY - 3], [centerX, centerY + 3]], 'g')
}

const drawMerchantMotif = (grid, motif, slot, silhouette, centerX, centerY, flip = false) => {
  const slim = silhouette === 'slim'
  const wide = silhouette === 'wide'
  const spike = silhouette === 'spike'
  const round = silhouette === 'round'

  if (motif === 'blade') {
    for (let y = centerY - 5; y <= centerY + 4; y += 1) {
      paintPixel(grid, centerX, y, 'b')
      if (!slim && y <= centerY - 2) {
        paintPixel(grid, centerX - 1, y, 'b')
      }
      if (wide && y <= centerY - 3) {
        paintPixel(grid, centerX + 1, y, 'a')
      }
    }
    if (spike) paintPoints(grid, [[centerX, centerY - 6], [centerX - 1, centerY - 5], [centerX + 1, centerY - 5]], 'a')
    paintRect(grid, centerX - 1, centerY + 4, 3, 1, 'a')
    return
  }

  if (motif === 'axe') {
    const dir = flip ? -1 : 1
    for (let y = centerY - 5; y <= centerY + 4; y += 1) {
      paintPixel(grid, centerX, y, 'b')
    }
    const bladeDepth = wide ? 3 : 2
    for (let y = centerY - 4; y <= centerY; y += 1) {
      for (let offset = 1; offset <= bladeDepth; offset += 1) {
        paintPixel(grid, centerX + dir * offset, y, y === centerY - 4 || y === centerY ? 'a' : 'b')
      }
    }
    if (spike) paintPoint(grid, centerX + dir * (bladeDepth + 1), centerY - 2, 'a')
    paintRect(grid, centerX - 1, centerY + 4, 3, 1, 'a')
    return
  }

  if (motif === 'spear') {
    for (let y = centerY - 5; y <= centerY + 4; y += 1) {
      paintPixel(grid, centerX, y, 'b')
      if (wide && y >= centerY + 1) paintPixel(grid, centerX + 1, y, 'a')
    }
    paintPoints(grid, [[centerX, centerY - 6], [centerX - 1, centerY - 5], [centerX + 1, centerY - 5]], 'a')
    if (spike) paintPoints(grid, [[centerX - 1, centerY - 6], [centerX + 1, centerY - 6]], 'a')
    paintRect(grid, centerX - 1, centerY + 4, 3, 1, 'a')
    return
  }

  if (motif === 'shield') {
    const half = wide ? 3 : 2
    paintRect(grid, centerX - half, centerY - 4, half * 2 + 1, 8, 'a')
    paintRect(grid, centerX - half, centerY - 4, half * 2 + 1, 1, 'b')
    paintRect(grid, centerX - half, centerY + 3, half * 2 + 1, 1, 'b')
    paintRect(grid, centerX - half, centerY - 4, 1, 8, 'b')
    paintRect(grid, centerX + half, centerY - 4, 1, 8, 'b')
    if (round) {
      paintPixel(grid, centerX - half, centerY - 4, '.')
      paintPixel(grid, centerX + half, centerY - 4, '.')
      paintPixel(grid, centerX - half, centerY + 3, '.')
      paintPixel(grid, centerX + half, centerY + 3, '.')
    }
    paintPoints(grid, [[centerX, centerY - 1], [centerX, centerY], [centerX, centerY + 1]], 'g')
    return
  }

  if (motif === 'armor') {
    const half = wide ? 4 : 3
    paintRect(grid, centerX - half, centerY - 4, half * 2 + 1, 7, 'a')
    paintRect(grid, centerX - half, centerY - 4, half * 2 + 1, 1, 'b')
    paintRect(grid, centerX - half, centerY + 2, half * 2 + 1, 1, 'b')
    paintRect(grid, centerX - half, centerY - 4, 1, 7, 'b')
    paintRect(grid, centerX + half, centerY - 4, 1, 7, 'b')
    clearRect(grid, centerX - 1, centerY - 3, 3, 2)
    paintRect(grid, centerX - 1, centerY - 1, 3, 2, 'b')
    if (spike) paintPoints(grid, [[centerX - half - 1, centerY - 3], [centerX + half + 1, centerY - 3]], 'a')
    return
  }

  if (motif === 'helm') {
    const half = wide ? 4 : 3
    paintRect(grid, centerX - half, centerY - 4, half * 2 + 1, 5, 'a')
    paintRect(grid, centerX - half, centerY - 4, half * 2 + 1, 1, 'b')
    paintRect(grid, centerX - half, centerY, half * 2 + 1, 1, 'b')
    paintRect(grid, centerX - half, centerY - 4, 1, 5, 'b')
    paintRect(grid, centerX + half, centerY - 4, 1, 5, 'b')
    paintRect(grid, centerX - 1, centerY - 2, 3, 2, 'b')
    if (spike) paintPoints(grid, [[centerX, centerY - 5], [centerX - 1, centerY - 4], [centerX + 1, centerY - 4]], 'a')
    paintPoints(grid, [[centerX - 2, centerY - 1], [centerX + 2, centerY - 1]], 'g')
    return
  }

  if (motif === 'ring') {
    const radius = wide ? 3 : 2
    for (let y = centerY - radius - 1; y <= centerY + radius + 1; y += 1) {
      for (let x = centerX - radius - 1; x <= centerX + radius + 1; x += 1) {
        const dx = x - centerX
        const dy = y - centerY
        const distance = dx * dx + dy * dy
        const outer = radius * radius + 2
        const inner = Math.max(1, (radius - 1) * (radius - 1))
        if (distance <= outer && distance >= inner) {
          paintPixel(grid, x, y, distance >= outer - 2 ? 'b' : 'a')
        }
      }
    }
    paintPoints(grid, [[centerX, centerY - radius - 1], [centerX, centerY + radius + 1]], 'g')
    return
  }

  if (motif === 'orb') {
    const radius = wide ? 3 : 2
    const outer = radius * radius + 1
    for (let y = centerY - radius - 1; y <= centerY + radius + 1; y += 1) {
      for (let x = centerX - radius - 1; x <= centerX + radius + 1; x += 1) {
        const dx = x - centerX
        const dy = y - centerY
        const distance = dx * dx + dy * dy
        if (distance <= outer) {
          paintPixel(grid, x, y, distance >= outer - 2 ? 'b' : 'a')
        }
      }
    }
    paintPoints(grid, [[centerX - 1, centerY - 1], [centerX + 1, centerY + 1]], 'g')
    return
  }

  if (motif === 'amulet') {
    paintRect(grid, centerX, centerY - 6, 1, 3, 'b')
    paintMerchantDiamond(grid, centerX, centerY, wide ? 4 : 3, 'a', 'b')
    if (round) {
      paintPoints(grid, [[centerX, centerY - 1], [centerX - 1, centerY], [centerX + 1, centerY], [centerX, centerY + 1]], 'g')
    } else {
      paintPoints(grid, [[centerX, centerY - 2], [centerX, centerY + 2]], 'g')
    }
    return
  }

  drawMerchantSlotFallback(grid, slot, centerX, centerY)
}

const applyMerchantSpriteOrnament = (grid, ornament, centerX, centerY, flip = false) => {
  if (ornament === 'rune') {
    paintPoints(grid, [
      [centerX - 1, centerY - 1],
      [centerX + 1, centerY - 1],
      [centerX, centerY],
      [centerX - 1, centerY + 1],
      [centerX + 1, centerY + 1],
    ], 'g')
    return
  }
  if (ornament === 'gem') {
    paintPoints(grid, [[centerX, centerY - 3], [centerX - 1, centerY - 2], [centerX + 1, centerY - 2]], 'g')
    return
  }
  if (ornament === 'wing') {
    const wingOffset = flip ? 1 : 0
    paintPoints(grid, [
      [centerX - 4 - wingOffset, centerY - 1],
      [centerX - 5 - wingOffset, centerY],
      [centerX - 4 - wingOffset, centerY + 1],
      [centerX + 4 - wingOffset, centerY - 1],
      [centerX + 5 - wingOffset, centerY],
      [centerX + 4 - wingOffset, centerY + 1],
    ], 'a')
    return
  }
  if (ornament === 'chain') {
    for (let y = centerY + 3; y <= centerY + 6; y += 1) {
      const offset = y % 2 === 0 ? 0 : (flip ? 1 : -1)
      paintPixel(grid, centerX + offset, y, 'a')
    }
  }
}

const applyMerchantSpriteGlow = (grid, centerX, centerY, sparkle = false) => {
  const glowPoints = [
    [centerX - 4, centerY - 3],
    [centerX + 4, centerY - 3],
    [centerX - 4, centerY + 3],
    [centerX + 4, centerY + 3],
    [centerX, centerY - 5],
    [centerX, centerY + 5],
  ]
  if (sparkle) glowPoints.push([centerX - 2, centerY - 4], [centerX + 2, centerY + 4])
  paintPoints(grid, glowPoints, 'g')
}

const getMerchantSpriteVariant = (spec, index = 0) => {
  const random = createMerchantSeededRandom(`${spec.seed}:${spec.motif}:${index}`)
  const shiftXRoll = random()
  const shiftYRoll = random()
  return {
    centerX: 8 + (shiftXRoll > 0.72 ? 1 : shiftXRoll < 0.28 ? -1 : 0),
    centerY: 8 + (shiftYRoll > 0.86 ? 1 : shiftYRoll < 0.14 ? -1 : 0),
    flip: random() > 0.5,
    sparkle: random() > 0.58,
  }
}

const getMerchantItemSpriteSrc = (item, index = 0) => {
  const rawItem = item && typeof item === 'object' ? item : {}
  const rarity = normalizeRarity(rawItem.rarity, 'R')
  const slot = normalizeSlot(rawItem.slot, 'weapon')
  const normalizedItem = {
    ...rawItem,
    rarity,
    slot,
  }
  const spriteSpec = normalizeMerchantSpriteSpec(normalizedItem.spriteSpec, normalizedItem, index)
  const cacheKey = [
    slot,
    rarity,
    spriteSpec.motif,
    spriteSpec.palette,
    spriteSpec.silhouette,
    spriteSpec.ornament,
    spriteSpec.glow,
    spriteSpec.seed,
  ].join('|')
  const cached = MERCHANT_ITEM_SPRITE_CACHE.get(cacheKey)
  if (cached) return cached

  const palette = MERCHANT_ITEM_SPRITE_PALETTES[spriteSpec.palette] || MERCHANT_ITEM_SPRITE_PALETTES.iron
  const variant = getMerchantSpriteVariant(spriteSpec, index)
  const grid = createSpriteGrid()
  drawMerchantMotif(grid, spriteSpec.motif, slot, spriteSpec.silhouette, variant.centerX, variant.centerY, variant.flip)
  applyMerchantSpriteOrnament(grid, spriteSpec.ornament, variant.centerX, variant.centerY, variant.flip)
  if (spriteSpec.glow === 1) {
    applyMerchantSpriteGlow(grid, variant.centerX, variant.centerY, variant.sparkle)
  }

  const pixelSize = CAMPFIRE_SPRITE_PIXEL
  const size = CAMPFIRE_SPRITE_SIZE * pixelSize
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="image-rendering:pixelated">`

  for (let y = 0; y < CAMPFIRE_SPRITE_SIZE; y++) {
    for (let x = 0; x < CAMPFIRE_SPRITE_SIZE; x++) {
      const token = grid[y][x]
      if (token === '.') continue
      let color = palette.base
      if (token === 'a') color = palette.accent
      if (token === 'g') color = palette.glow
      svg += `<rect x="${x * pixelSize}" y="${y * pixelSize}" width="${pixelSize}" height="${pixelSize}" fill="${color}"/>`
    }
  }

  svg += '</svg>'
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`
  MERCHANT_ITEM_SPRITE_CACHE.set(cacheKey, uri)
  if (MERCHANT_ITEM_SPRITE_CACHE.size > 260) {
    const oldestKey = MERCHANT_ITEM_SPRITE_CACHE.keys().next().value
    MERCHANT_ITEM_SPRITE_CACHE.delete(oldestKey)
  }
  return uri
}

const BEDROOM_ITEM_SPRITE_PALETTES = {
  oak: { base: '#7a5a3a', accent: '#c89f72', glow: '#efe2c2' },
  pine: { base: '#6d7f44', accent: '#b7d38a', glow: '#e6f2c9' },
  walnut: { base: '#5f4439', accent: '#b98c7b', glow: '#e4cdc2' },
  mint: { base: '#4e7f6f', accent: '#9dd8c2', glow: '#ddf8ee' },
  sky: { base: '#4d6e98', accent: '#9ec8f4', glow: '#dff0ff' },
  rose: { base: '#8f5c74', accent: '#e7aac7', glow: '#fce4f0' },
  stone: { base: '#5c6376', accent: '#9ea7c4', glow: '#dbe0f2' },
  violet: { base: '#655285', accent: '#b9a2e8', glow: '#e9dcff' },
}
const BEDROOM_ITEM_SPRITE_CACHE = new Map()

const drawBedroomFrame = (grid, x, y, width, height, fillToken = 'b', edgeToken = 'a') => {
  paintRect(grid, x, y, width, height, fillToken)
  paintRect(grid, x, y, width, 1, edgeToken)
  paintRect(grid, x, y + height - 1, width, 1, edgeToken)
  paintRect(grid, x, y, 1, height, edgeToken)
  paintRect(grid, x + width - 1, y, 1, height, edgeToken)
}

const drawBedroomMotif = (grid, motif, silhouette, centerX, centerY) => {
  const compact = silhouette === 'compact'
  const wide = silhouette === 'wide'
  const tall = silhouette === 'tall'
  const low = silhouette === 'low'
  const sizeX = wide ? 10 : compact ? 6 : 8
  const sizeY = tall ? 10 : low ? 4 : 6
  const left = Math.round(centerX - sizeX / 2)
  const top = Math.round(centerY - sizeY / 2)

  if (motif === 'tile') {
    paintRect(grid, left, top, sizeX, sizeY, 'b')
    for (let y = top; y < top + sizeY; y += 2) {
      for (let x = left + ((y - top) % 4 === 0 ? 0 : 1); x < left + sizeX; x += 2) {
        paintPixel(grid, x, y, 'a')
      }
    }
    return
  }

  if (motif === 'rug') {
    drawBedroomFrame(grid, left, top, sizeX, sizeY, 'b', 'a')
    paintRect(grid, left + 2, top + 2, Math.max(2, sizeX - 4), Math.max(2, sizeY - 4), 'a')
    return
  }

  if (motif === 'bed' || motif === 'sofa') {
    drawBedroomFrame(grid, left, top, sizeX, sizeY, 'b', 'a')
    paintRect(grid, left + 1, top + 1, Math.max(3, sizeX - 2), Math.max(2, sizeY - 2), motif === 'bed' ? 'a' : 'b')
    paintRect(grid, left + 1, top + 1, Math.max(2, sizeX - 4), 2, 'g')
    return
  }

  if (motif === 'desk' || motif === 'table') {
    drawBedroomFrame(grid, left, top, sizeX, Math.max(3, sizeY - 1), 'b', 'a')
    paintRect(grid, left + 1, top + sizeY - 1, 1, 2, 'a')
    paintRect(grid, left + sizeX - 2, top + sizeY - 1, 1, 2, 'a')
    if (motif === 'desk') {
      paintRect(grid, left + Math.max(2, sizeX - 4), top + 1, 2, Math.max(2, sizeY - 3), 'g')
    }
    return
  }

  if (motif === 'chair') {
    drawBedroomFrame(grid, left + 2, top + 1, Math.max(3, sizeX - 4), Math.max(2, sizeY - 1), 'b', 'a')
    paintRect(grid, left + 2, top + sizeY - 1, 1, 2, 'a')
    paintRect(grid, left + sizeX - 3, top + sizeY - 1, 1, 2, 'a')
    return
  }

  if (motif === 'cabinet' || motif === 'shelf' || motif === 'chest') {
    drawBedroomFrame(grid, left + 1, top, Math.max(4, sizeX - 2), sizeY, 'b', 'a')
    if (motif === 'shelf') {
      paintRect(grid, left + 2, top + 2, Math.max(2, sizeX - 4), 1, 'a')
      paintRect(grid, left + 2, top + Math.max(3, sizeY - 3), Math.max(2, sizeX - 4), 1, 'a')
    }
    if (motif === 'chest') {
      paintRect(grid, left + 1, top + Math.max(1, sizeY - 3), Math.max(4, sizeX - 2), 2, 'a')
      paintPoint(grid, centerX, top + Math.max(1, sizeY - 2), 'g')
    }
    return
  }

  if (motif === 'plant') {
    paintRect(grid, centerX - 2, top + Math.max(2, sizeY - 3), 4, 3, 'b')
    paintPoints(grid, [
      [centerX, top],
      [centerX - 1, top + 1],
      [centerX + 1, top + 1],
      [centerX - 2, top + 2],
      [centerX + 2, top + 2],
      [centerX, top + 2],
    ], 'g')
    return
  }

  if (motif === 'lamp') {
    paintRect(grid, centerX, top + 1, 1, Math.max(4, sizeY - 1), 'a')
    paintRect(grid, centerX - 2, top, 5, 2, 'b')
    paintRect(grid, centerX - 1, top + sizeY, 3, 1, 'a')
    paintPoint(grid, centerX, top + 1, 'g')
    return
  }

  if (motif === 'window') {
    drawBedroomFrame(grid, left + 1, top + 1, Math.max(4, sizeX - 2), Math.max(4, sizeY - 1), 'g', 'a')
    paintRect(grid, centerX, top + 1, 1, Math.max(4, sizeY - 1), 'a')
    paintRect(grid, left + 1, centerY, Math.max(4, sizeX - 2), 1, 'a')
    return
  }

  if (motif === 'screen') {
    drawBedroomFrame(grid, left + 1, top, Math.max(4, sizeX - 2), sizeY, 'b', 'a')
    for (let x = left + 2; x < left + sizeX - 1; x += 2) {
      paintRect(grid, x, top + 1, 1, Math.max(2, sizeY - 2), 'a')
    }
    return
  }

  drawBedroomFrame(grid, left, top, sizeX, sizeY, 'b', 'a')
}

const applyBedroomSpriteOrnament = (grid, ornament, centerX, centerY) => {
  if (ornament === 'border') {
    paintRect(grid, centerX - 4, centerY - 4, 9, 1, 'a')
    paintRect(grid, centerX - 4, centerY + 4, 9, 1, 'a')
    return
  }
  if (ornament === 'cushion') {
    paintRect(grid, centerX - 2, centerY - 1, 5, 2, 'g')
    return
  }
  if (ornament === 'drawer') {
    paintRect(grid, centerX - 2, centerY + 1, 5, 1, 'a')
    paintPoint(grid, centerX, centerY + 1, 'g')
    return
  }
  if (ornament === 'leaf') {
    paintPoints(grid, [
      [centerX - 1, centerY - 2],
      [centerX, centerY - 3],
      [centerX + 1, centerY - 2],
      [centerX, centerY - 1],
    ], 'g')
    return
  }
  if (ornament === 'rune') {
    paintPoints(grid, [
      [centerX - 2, centerY - 2],
      [centerX + 2, centerY - 2],
      [centerX, centerY],
      [centerX - 2, centerY + 2],
      [centerX + 2, centerY + 2],
    ], 'g')
  }
}

const getBedroomSpriteVariant = (spec, index = 0) => {
  const random = createMerchantSeededRandom(`${spec.seed}:${spec.motif}:${index}:bedroom`)
  return {
    centerX: 8 + (random() > 0.72 ? 1 : random() < 0.28 ? -1 : 0),
    centerY: 8 + (random() > 0.76 ? 1 : random() < 0.24 ? -1 : 0),
  }
}

const getBedroomFurnitureSpriteSrc = (item, index = 0) => {
  const rawItem = item && typeof item === 'object' ? item : {}
  const kind = normalizeBedroomKind(rawItem.kind, 'decor')
  const normalizedItem = {
    ...rawItem,
    kind,
  }
  const spriteTemplate = normalizeBedroomSpriteTemplate(normalizedItem.spriteTemplate)
  const templateSignature = getBedroomTemplateSignature(spriteTemplate)
  const spriteSpec = normalizeBedroomSpriteSpec(normalizedItem.spriteSpec, normalizedItem, index)
  const cacheKey = templateSignature
    ? `tpl|${kind}|${templateSignature}`
    : [
        kind,
        spriteSpec.motif,
        spriteSpec.palette,
        spriteSpec.silhouette,
        spriteSpec.ornament,
        spriteSpec.glow,
        spriteSpec.seed,
      ].join('|')
  const cached = BEDROOM_ITEM_SPRITE_CACHE.get(cacheKey)
  if (cached) return cached

  const pixelSize = CAMPFIRE_SPRITE_PIXEL
  let svg = ''

  if (templateSignature && spriteTemplate) {
    const sizeW = spriteTemplate.w * pixelSize
    const sizeH = spriteTemplate.h * pixelSize
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sizeW}" height="${sizeH}" viewBox="0 0 ${sizeW} ${sizeH}" style="image-rendering:pixelated">`
    for (let y = 0; y < spriteTemplate.h; y += 1) {
      const row = spriteTemplate.rows[y] || ''
      for (let x = 0; x < spriteTemplate.w; x += 1) {
        const token = row[x] || '.'
        if (token === '.') continue
        const color = spriteTemplate.palette[token]
        if (!color) continue
        svg += `<rect x="${x * pixelSize}" y="${y * pixelSize}" width="${pixelSize}" height="${pixelSize}" fill="${color}"/>`
      }
    }
  } else {
    const palette = BEDROOM_ITEM_SPRITE_PALETTES[spriteSpec.palette] || BEDROOM_ITEM_SPRITE_PALETTES.oak
    const variant = getBedroomSpriteVariant(spriteSpec, index)
    const grid = createSpriteGrid()
    drawBedroomMotif(grid, spriteSpec.motif, spriteSpec.silhouette, variant.centerX, variant.centerY)
    applyBedroomSpriteOrnament(grid, spriteSpec.ornament, variant.centerX, variant.centerY)
    if (spriteSpec.glow === 1) {
      applyMerchantSpriteGlow(grid, variant.centerX, variant.centerY, true)
    }

    const size = CAMPFIRE_SPRITE_SIZE * pixelSize
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="image-rendering:pixelated">`
    for (let y = 0; y < CAMPFIRE_SPRITE_SIZE; y += 1) {
      for (let x = 0; x < CAMPFIRE_SPRITE_SIZE; x += 1) {
        const token = grid[y][x]
        if (token === '.') continue
        let color = palette.base
        if (token === 'a') color = palette.accent
        if (token === 'g') color = palette.glow
        svg += `<rect x="${x * pixelSize}" y="${y * pixelSize}" width="${pixelSize}" height="${pixelSize}" fill="${color}"/>`
      }
    }
  }

  svg += '</svg>'
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`
  BEDROOM_ITEM_SPRITE_CACHE.set(cacheKey, uri)
  if (BEDROOM_ITEM_SPRITE_CACHE.size > 360) {
    const oldestKey = BEDROOM_ITEM_SPRITE_CACHE.keys().next().value
    BEDROOM_ITEM_SPRITE_CACHE.delete(oldestKey)
  }
  return uri
}

// 商人像素精灵
const getMerchantSpriteSrc = () => {
  const grid = createSpriteGrid()
  const palette = { robe: '#5a4a3a', trim: '#c9a050', accent: '#8b7355', hair: '#3a2a1a' }
  
  // 绘制商人像素（站立姿态，背着背包）
  // 身体
  for (let y = 6; y < 14; y++) {
    for (let x = 5; x < 11; x++) {
      paintPixel(grid, x, y, 'r')
    }
  }
  // 头部
  for (let y = 2; y < 6; y++) {
    for (let x = 6; x < 10; x++) {
      paintPixel(grid, x, y, 'h')
    }
  }
  // 背包
  for (let y = 5; y < 10; y++) {
    for (let x = 10; x < 14; x++) {
      if (x < 12) paintPixel(grid, x, y, 'a')
      else paintPixel(grid, x, y, 't')
    }
  }
  // 边缘装饰
  paintPixel(grid, 5, 6, 't')
  paintPixel(grid, 10, 6, 't')
  paintPixel(grid, 7, 14, 't')
  paintPixel(grid, 8, 14, 't')
  
  const pixelSize = CAMPFIRE_SPRITE_PIXEL
  const size = CAMPFIRE_SPRITE_SIZE * pixelSize
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="image-rendering:pixelated">`
  
  for (let y = 0; y < CAMPFIRE_SPRITE_SIZE; y++) {
    for (let x = 0; x < CAMPFIRE_SPRITE_SIZE; x++) {
      const token = grid[y][x]
      if (token === '.') continue
      let color = palette.robe
      if (token === 't') color = palette.trim
      if (token === 'a') color = palette.accent
      if (token === 'h') color = palette.hair
      svg += `<rect x="${x * pixelSize}" y="${y * pixelSize}" width="${pixelSize}" height="${pixelSize}" fill="${color}"/>`
    }
  }
  
  svg += '</svg>'
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const normalizeCampfireCompanion = (rawValue, index = 0) => {
  const fallbackName = DEFAULT_CAMPFIRE_NAMES[index] || `营地伙伴${index + 1}`
  const rawObject = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const styleRaw = String(rawObject.style || '').trim().toLowerCase()
  const paletteRaw = String(rawObject.palette || rawObject.color || '').trim().toLowerCase()
  const actionRaw = String(rawObject.action || '').trim().toLowerCase()
  const name = String(rawObject.name || fallbackName).trim().slice(0, 24) || fallbackName
  const role = resolveClassicRole(rawObject.role, index, `${rawObject.hint || ''} ${rawObject.line || ''}`)
  return {
    id: String(rawObject.id || makeId('camp')),
    worldCharacterId: String(rawObject.worldCharacterId || '').trim().slice(0, 80),
    name,
    role,
    style: CAMPFIRE_STYLE_SET.has(styleRaw) ? styleRaw : CAMPFIRE_STYLE_LIST[index % CAMPFIRE_STYLE_LIST.length],
    palette: CAMPFIRE_PALETTE_SET.has(paletteRaw) ? paletteRaw : CAMPFIRE_PALETTE_LIST[index % CAMPFIRE_PALETTE_LIST.length],
    action: CAMPFIRE_ACTION_SET.has(actionRaw) ? actionRaw : CAMPFIRE_ACTION_LIST[index % CAMPFIRE_ACTION_LIST.length],
    line: String(rawObject.line || '').trim().slice(0, 32),
  }
}

const normalizeCampfireCompanionList = (rawList) => {
  const list = (Array.isArray(rawList) ? rawList : [])
    .map((item, index) => normalizeCampfireCompanion(item, index))
    .filter(Boolean)
    .slice(0, MAX_CAMPFIRE_COMPANIONS)
  return list
}

const normalizeCampfireLayoutMap = (rawValue) => {
  const map = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const result = {}
  for (const [rawKey, rawPos] of Object.entries(map)) {
    const key = String(rawKey || '').trim().slice(0, 96)
    if (!key) continue
    const x = clampInt(rawPos?.x, CAMPFIRE_LAYOUT_X_MIN, CAMPFIRE_LAYOUT_X_MAX, NaN)
    const y = clampInt(rawPos?.y, CAMPFIRE_LAYOUT_Y_MIN, CAMPFIRE_LAYOUT_Y_MAX, NaN)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    result[key] = { x, y }
  }
  return result
}


const pickCampfireActionByHint = (hintText, index = 0) => {
  const text = String(hintText || '').toLowerCase()
  if (text.includes('守') || text.includes('警戒') || text.includes('侦查')) return 'lookout'
  if (text.includes('锻') || text.includes('剑') || text.includes('刀') || text.includes('匕首')) return 'sharpen_blade'
  if (text.includes('祈祷') || text.includes('治疗') || text.includes('恢复')) return 'warm_hands'
  if (text.includes('炼金') || text.includes('药')) return 'stretch'
  return CAMPFIRE_ACTION_LIST[index % CAMPFIRE_ACTION_LIST.length]
}

const campfireSpriteResolver = createCampfireSpriteResolver({
  styleList: CAMPFIRE_STYLE_LIST,
  paletteList: CAMPFIRE_PALETTE_LIST,
  actionList: CAMPFIRE_ACTION_LIST,
  styleSet: CAMPFIRE_STYLE_SET,
  paletteSet: CAMPFIRE_PALETTE_SET,
  actionSet: CAMPFIRE_ACTION_SET,
  getFrameTick: () => campfireFrameTick.value,
})

const getCampfireSpriteSrc = (camper, index = 0) => {
  return campfireSpriteResolver.getCampfireSpriteSrc(camper, index)
}

const getTeammateSpriteSrc = (member, index = 0) => {
  return campfireSpriteResolver.getTeammateSpriteSrc(member, index)
}

const dungeonSpriteRuntime = createDungeonSpriteRuntime({
  hiddenObjectTypesWhenCleared: [DUNGEON_TILE_MONSTER, DUNGEON_TILE_BOSS, DUNGEON_TILE_TREASURE],
  emptyTileType: DUNGEON_TILE_EMPTY,
})

const shouldRenderDungeonObjectSprite = (cell) => {
  return dungeonSpriteRuntime.shouldRenderDungeonObjectSprite(cell)
}

const getDungeonTerrainSpriteSrc = (cell, index = 0) => {
  return dungeonSpriteRuntime.getDungeonTerrainSpriteSrc(cell, index)
}

const getDungeonObjectSpriteSrc = (cell, index = 0) => {
  return dungeonSpriteRuntime.getDungeonObjectSpriteSrc(cell, index)
}

const sortTeammatesByPower = (list = []) => {
  const teammates = Array.isArray(list) ? list : []
  return [...teammates].sort((a, b) => {
    if ((b.power || 0) !== (a.power || 0)) return (b.power || 0) - (a.power || 0)
    return rarityValue(b.rarity) - rarityValue(a.rarity)
  })
}

const resolvePartyMemberLevelByState = (targetState, member, index = 0) => {
  const teamLevel = clampInt(targetState?.level, 1, 999, 1)
  const power = clampInt(member?.power, 1, 9999, 20 + index * 4)
  const delta = Math.floor((power - 36) / 26)
  return clampInt(teamLevel + delta, 1, 999, teamLevel)
}

const resolvePartyMemberMaxHpByState = (targetState, member, index = 0) => {
  const level = resolvePartyMemberLevelByState(targetState, member, index)
  const power = clampInt(member?.power, 1, 9999, 36)
  const baseHp = clampInt(Math.round(90 + level * 10 + power * 2.4), 1, 999999, 120)
  
  // 添加队员装备加成
  const memberId = member?.id
  if (memberId) {
    const map = targetState?.memberEquippedMap && typeof targetState.memberEquippedMap === 'object'
      ? targetState.memberEquippedMap
      : {}
    const equipped = map[memberId] && typeof map[memberId] === 'object' ? map[memberId] : {}
    const equipList = [equipped.weapon, equipped.armor, equipped.relic].filter(Boolean)
    const equipHpBonus = equipList.reduce((sum, item) => sum + (Number(item.hp) || 0), 0)
    return clampInt(baseHp + equipHpBonus, 1, 999999, baseHp)
  }
  
  return baseHp
}

const normalizeConsumableEffectType = (rawValue, fallback = 'heal_hp') => {
  const text = String(rawValue || '').trim().toLowerCase()
  if (text === 'heal_hp' || text === 'heal' || text === 'hp' || text === 'recover') return 'heal_hp'
  if (text === 'material' || text === 'resource' || text === 'craft' || text === 'ingredient' || text === 'herb') return 'material'
  if (text === 'junk' || text === 'scrap' || text === 'misc') return 'junk'
  return fallback
}

const normalizeConsumableTarget = (rawValue, fallback = 'ally') => {
  const text = String(rawValue || '').trim().toLowerCase()
  if (text === 'ally') return 'ally'
  if (text === 'self') return 'self'
  if (text === 'inventory' || text === 'none') return 'inventory'
  return fallback
}

const buildBackpackStackKey = (item) => {
  const effectType = normalizeConsumableEffectType(item?.effectType, 'heal_hp')
  const target = normalizeConsumableTarget(item?.target, effectType === 'heal_hp' ? 'ally' : 'inventory')
  const value = effectType === 'heal_hp'
    ? clampInt(item?.value, 1, 9999, 20)
    : clampInt(item?.value, 0, 9999, 0)
  const name = String(item?.name || '').trim().slice(0, 24) || '回复道具'
  return `${name}|${effectType}|${target}|${value}`
}

const normalizeBackpackItem = (rawValue, index = 0) => {
  if (!rawValue || typeof rawValue !== 'object') return null
  const rawEffect = rawValue.effectType || rawValue.type || rawValue.effect
  const hasNumericValue = Number.isFinite(Number(rawValue.value ?? rawValue.effectValue ?? rawValue.hp))
  const effectType = normalizeConsumableEffectType(rawEffect, hasNumericValue ? 'heal_hp' : 'material')
  const target = normalizeConsumableTarget(rawValue.target || rawValue.targetType, effectType === 'heal_hp' ? 'ally' : 'inventory')
  const value = effectType === 'heal_hp'
    ? clampInt(rawValue.value ?? rawValue.effectValue ?? rawValue.hp, 1, 9999, 20)
    : clampInt(rawValue.value ?? rawValue.effectValue ?? rawValue.hp, 0, 9999, 0)
  const amount = clampInt(rawValue.amount ?? rawValue.count ?? rawValue.quantity, 1, MAX_BACKPACK_ITEM_STACK, 1)
  const name = String(rawValue.name || `回复药剂${index + 1}`).trim().slice(0, 24) || `回复药剂${index + 1}`
  const descFallback = effectType === 'heal_hp'
    ? `恢复 ${value} 点生命`
    : (effectType === 'junk' ? '杂物材料，可出售或加工' : '合成原料，可用于制作')
  const desc = String(rawValue.desc || rawValue.description || descFallback).trim().slice(0, 40) || descFallback
  const normalized = {
    id: String(rawValue.id || makeId('bag')).trim().slice(0, 80) || makeId('bag'),
    name,
    effectType,
    target,
    value,
    amount,
    desc,
  }
  return {
    ...normalized,
    stackKey: buildBackpackStackKey(normalized),
  }
}

const normalizeBackpackItems = (rawList) => {
  const list = Array.isArray(rawList) ? rawList : []
  const stackMap = new Map()
  for (let index = 0; index < list.length; index += 1) {
    const normalized = normalizeBackpackItem(list[index], index)
    if (!normalized) continue
    const prev = stackMap.get(normalized.stackKey)
    if (!prev) {
      stackMap.set(normalized.stackKey, normalized)
      continue
    }
    prev.amount = clampInt(prev.amount + normalized.amount, 1, MAX_BACKPACK_ITEM_STACK, prev.amount)
  }
  return [...stackMap.values()]
    .slice(0, MAX_BACKPACK_ITEM_COUNT)
    .map((item) => ({ ...item }))
}

const mergeBackpackItems = (baseList, incomingList) => normalizeBackpackItems([...(Array.isArray(baseList) ? baseList : []), ...(Array.isArray(incomingList) ? incomingList : [])])

const normalizePartyMemberHpMap = (rawMap, targetState) => {
  const source = rawMap && typeof rawMap === 'object' ? rawMap : {}
  const teammates = sortTeammatesByPower(targetState?.teammates)
  const ratio = Math.max(0, Math.min(1, (Number(targetState?.hp) || 0) / Math.max(1, Number(targetState?.maxHp) || 1)))
  const result = {}
  teammates.forEach((member, index) => {
    const maxHp = resolvePartyMemberMaxHpByState(targetState, member, index)
    const rawHp = Number(source?.[member.id])
    if (Number.isFinite(rawHp)) {
      result[member.id] = clampInt(rawHp, 0, maxHp, maxHp)
      return
    }
    result[member.id] = clampInt(Math.round(maxHp * ratio), 0, maxHp, maxHp)
  })
  return result
}

const syncPartyMemberHpMapByGlobalHp = (targetState) => {
  const ratio = Math.max(0, Math.min(1, (Number(targetState?.hp) || 0) / Math.max(1, Number(targetState?.maxHp) || 1)))
  const teammates = sortTeammatesByPower(targetState?.teammates)
  const map = {}
  teammates.forEach((member, index) => {
    const maxHp = resolvePartyMemberMaxHpByState(targetState, member, index)
    map[member.id] = clampInt(Math.round(maxHp * ratio), 0, maxHp, maxHp)
  })
  targetState.partyMemberHpMap = map
}

const applyDebugNoDamageState = (targetState) => {
  if (!targetState || typeof targetState !== 'object') return false
  if (!targetState.debugNoDamage) return false
  targetState.hp = targetState.maxHp
  syncPartyMemberHpMapByGlobalHp(targetState)
  return true
}

const rebuildGlobalHpFromPartyMemberHpMap = (targetState) => {
  const activeMembers = sortTeammatesByPower(targetState?.teammates).slice(0, 4)
  if (activeMembers.length < 1) return
  const map = targetState?.partyMemberHpMap && typeof targetState.partyMemberHpMap === 'object'
    ? targetState.partyMemberHpMap
    : {}
  let ratioSum = 0
  activeMembers.forEach((member, index) => {
    const maxHp = resolvePartyMemberMaxHpByState(targetState, member, index)
    const hp = clampInt(map[member.id], 0, maxHp, maxHp)
    ratioSum += maxHp > 0 ? hp / maxHp : 1
  })
  const avgRatio = Math.max(0, Math.min(1, ratioSum / activeMembers.length))
  targetState.hp = clampInt(Math.round((Number(targetState?.maxHp) || 1) * avgRatio), 0, targetState.maxHp, targetState.hp)
}

const buildDefaultState = () => ({
  floor: 1,
  level: 1,
  exp: 0,
  hp: 120,
  maxHp: 120,
  gems: 320,
  coins: 680,
  equipmentPity: 0,
  worldBookId: '',
  worldBookCharacterSignature: '',
  debugNoDamage: false,
  lastScene: '地下城入口',
  lastBanter: '',
  dungeonMap: null,
  teammates: [
    {
      id: 'starter-r-0',
      name: '见习骑士艾诺',
      role: '冒险者',
      rarity: 'R',
      power: 34,
    },
  ],
  campfireCompanions: [],
  campfireLayout: {},
  equipments: [],
  backpackItems: [],
  bedroom: buildDefaultBedroomState(),
  partyMemberHpMap: {},
  memberEquippedMap: {},
  equipped: {
    weapon: null,
    armor: null,
    relic: null,
  },
  logs: ['欢迎来到 xx大冒险，地下城第 1 层开启。'],
  updatedAt: Date.now(),
})

const pickBestEquipmentBySlot = (equipments, slot) => {
  const candidates = Array.isArray(equipments) ? equipments.filter((item) => item?.slot === slot) : []
  if (candidates.length === 0) return null
  return [...candidates].sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0)
    return rarityValue(b.rarity) - rarityValue(a.rarity)
  })[0] || null
}

const applyAutoEquip = (targetState) => {
  const equipments = Array.isArray(targetState.equipments) ? targetState.equipments : []
  targetState.equipped = {
    weapon: pickBestEquipmentBySlot(equipments, 'weapon'),
    armor: pickBestEquipmentBySlot(equipments, 'armor'),
    relic: pickBestEquipmentBySlot(equipments, 'relic'),
  }
}

const buildGuaranteedLocalDungeonMap = (targetState, maxAttempts = 4) => {
  const floor = clampInt(targetState?.floor, 1, 999, 1)
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const draft = createLocalDungeonMapDraft({ floor })
    const normalized = normalizeDungeonMap(draft, floor)
    if (isDungeonMapUsable(normalized)) {
      return normalized
    }
  }
  return normalizeDungeonMap({
    id: makeId('map-fallback'),
    floor,
    theme: '灰烬地宫',
    width: 5,
    height: 5,
    start: { x: 0, y: 4 },
    exit: { x: 4, y: 0 },
    player: { x: 0, y: 4 },
    tiles: [
      { x: 1, y: 4, type: DUNGEON_TILE_MONSTER },
      { x: 2, y: 3, type: DUNGEON_TILE_MONSTER },
      { x: 3, y: 2, type: DUNGEON_TILE_BOSS },
      { x: 2, y: 1, type: DUNGEON_TILE_TREASURE },
    ],
  }, floor)
}

const normalizeState = (rawValue) => {
  const defaults = buildDefaultState()
  if (!rawValue || typeof rawValue !== 'object') {
    return defaults
  }

  const teammates = (Array.isArray(rawValue.teammates) ? rawValue.teammates : [])
    .map((item, index) => normalizeTeammate(item, index))
    .filter(Boolean)
    .slice(-MAX_TEAMMATE_COUNT)
  if (teammates.length === 0) {
    teammates.push(...defaults.teammates)
  }
  const campfireCompanions = normalizeCampfireCompanionList(rawValue.campfireCompanions)
  const campfireLayout = normalizeCampfireLayoutMap(rawValue.campfireLayout)
  const floor = clampInt(rawValue.floor, 1, 999, defaults.floor)
  const normalizedDungeonMap = normalizeDungeonMap(rawValue.dungeonMap, floor)
  const dungeonMap = isDungeonMapUsable(normalizedDungeonMap) ? normalizedDungeonMap : null

  const equipments = (Array.isArray(rawValue.equipments) ? rawValue.equipments : [])
    .map((item, index) => normalizeEquipment(item, index))
    .filter(Boolean)
    .slice(-MAX_EQUIPMENT_COUNT)
  const backpackItems = normalizeBackpackItems(rawValue.backpackItems)
  const bedroom = normalizeBedroomState(rawValue.bedroom)

  const logs = (Array.isArray(rawValue.logs) ? rawValue.logs : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(-MAX_LOG_COUNT)
  if (logs.length === 0) {
    logs.push(...defaults.logs)
  }

  // 处理队员装备映射
  const memberEquippedMap = rawValue.memberEquippedMap && typeof rawValue.memberEquippedMap === 'object'
    ? rawValue.memberEquippedMap
    : {}

  const next = {
    floor,
    level: clampInt(rawValue.level, 1, 999, defaults.level),
    exp: clampInt(rawValue.exp, 0, 999999, defaults.exp),
    hp: clampInt(rawValue.hp, 0, 999999, defaults.hp),
    maxHp: clampInt(rawValue.maxHp, 1, 999999, defaults.maxHp),
    gems: clampInt(rawValue.gems, 0, 999999, defaults.gems),
    coins: clampInt(rawValue.coins, 0, 9999999, defaults.coins),
    equipmentPity: clampInt(rawValue.equipmentPity, 0, EQUIPMENT_PITY_LIMIT - 1, 0),
    worldBookId: String(rawValue.worldBookId || '').trim().slice(0, 120),
    worldBookCharacterSignature: String(rawValue.worldBookCharacterSignature || '').trim().slice(0, 4000),
    debugNoDamage: Boolean(rawValue.debugNoDamage),
    lastScene: String(rawValue.lastScene || defaults.lastScene).trim().slice(0, 40),
    lastBanter: String(rawValue.lastBanter || '').trim().slice(0, 88),
    dungeonMap,
    teammates,
    campfireCompanions,
    campfireLayout,
    equipments,
    backpackItems,
    bedroom,
    memberEquippedMap,
    equipped: {
      weapon: normalizeEquipment(rawValue?.equipped?.weapon || null),
      armor: normalizeEquipment(rawValue?.equipped?.armor || null),
      relic: normalizeEquipment(rawValue?.equipped?.relic || null),
    },
    logs,
    updatedAt: clampInt(rawValue.updatedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  }

  if (!next.lastScene) {
    next.lastScene = defaults.lastScene
  }

  if (next.hp > next.maxHp) {
    next.hp = next.maxHp
  }
  next.partyMemberHpMap = normalizePartyMemberHpMap(rawValue.partyMemberHpMap, next)
  applyDebugNoDamageState(next)

  // 不再自动穿戴装备
  // applyAutoEquip(next)
  return next
}

const state = ref(buildDefaultState())
const storageScopeKey = computed(() => resolveStorageScopeKey())

const dungeonPartySorted = computed(() => {
  const list = Array.isArray(state.value.teammates) ? state.value.teammates : []
  return sortTeammatesByPower(list)
})

const dungeonActiveParty = computed(() => dungeonPartySorted.value.slice(0, 4))

const dungeonActivePartySlots = computed(() => {
  const members = Array.isArray(dungeonActiveParty.value) ? dungeonActiveParty.value : []
  const slots = []
  for (let index = 0; index < 4; index += 1) {
    slots.push(members[index] || null)
  }
  return slots
})

const resolvePartyMemberLevel = (member, index = 0) => {
  return resolvePartyMemberLevelByState(state.value, member, index)
}

const resolvePartyMemberMaxHp = (member, index = 0) => {
  return resolvePartyMemberMaxHpByState(state.value, member, index)
}

const resolvePartyMemberHp = (member, index = 0) => {
  const maxHp = resolvePartyMemberMaxHp(member, index)
  const map = state.value?.partyMemberHpMap && typeof state.value.partyMemberHpMap === 'object'
    ? state.value.partyMemberHpMap
    : {}
  const rawHp = Number(map?.[member?.id])
  if (Number.isFinite(rawHp)) {
    return clampInt(rawHp, 0, maxHp, maxHp)
  }
  const hpRatio = Math.max(0, Math.min(1, (Number(state.value.hp) || 0) / Math.max(1, Number(state.value.maxHp) || 1)))
  return clampInt(Math.round(maxHp * hpRatio), 0, maxHp, maxHp)
}

const selectedPartyMemberDetail = computed(() => {
  const members = Array.isArray(dungeonActiveParty.value) ? dungeonActiveParty.value : []
  if (members.length === 0) return null
  const selected = members.find((item) => item.id === selectedPartyMemberId.value) || members[0]
  const index = Math.max(0, members.findIndex((item) => item.id === selected.id))
  const level = resolvePartyMemberLevel(selected, index)
  const maxHp = resolvePartyMemberMaxHp(selected, index)
  const hp = resolvePartyMemberHp(selected, index)
  return {
    member: selected,
    index,
    level,
    hp,
    maxHp,
    power: clampInt(selected.power, 1, 9999, 1),
  }
})

const selectPartyMember = (member) => {
  if (!member?.id) return
  selectedPartyMemberId.value = String(member.id)
}

// 获取队员的装备
const getMemberEquipped = (memberId) => {
  const map = state.value.memberEquippedMap && typeof state.value.memberEquippedMap === 'object'
    ? state.value.memberEquippedMap
    : {}
  const equipped = map[memberId] && typeof map[memberId] === 'object' ? map[memberId] : {}
  return {
    weapon: equipped.weapon || null,
    armor: equipped.armor || null,
    relic: equipped.relic || null,
  }
}

// 获取选中队员的装备
const selectedMemberEquipped = computed(() => {
  if (!selectedPartyMemberId.value) return { weapon: null, armor: null, relic: null }
  return getMemberEquipped(selectedPartyMemberId.value)
})

// 获取队员装备加成
const getMemberEquipBonuses = (memberId) => {
  const equipped = getMemberEquipped(memberId)
  const list = [equipped.weapon, equipped.armor, equipped.relic].filter(Boolean)
  return list.reduce(
    (sum, item) => ({
      atk: sum.atk + (Number(item.atk) || 0),
      def: sum.def + (Number(item.def) || 0),
      hp: sum.hp + (Number(item.hp) || 0),
    }),
    { atk: 0, def: 0, hp: 0 },
  )
}

// 选中队员的装备加成
const selectedMemberEquipBonuses = computed(() => {
  if (!selectedPartyMemberId.value) return { atk: 0, def: 0, hp: 0 }
  return getMemberEquipBonuses(selectedPartyMemberId.value)
})

// 获取可用装备列表（排除已装备的）
const availableEquipmentsForMember = computed(() => {
  const memberId = selectedPartyMemberId.value
  if (!memberId) return []
  
  const allEquipments = Array.isArray(state.value.equipments) ? state.value.equipments : []
  const memberEquipped = getMemberEquipped(memberId)
  const equippedIds = [memberEquipped.weapon?.id, memberEquipped.armor?.id, memberEquipped.relic?.id].filter(Boolean)
  
  // 排除该队员已装备的装备
  return allEquipments.filter(item => !equippedIds.includes(item.id))
})

// 按槽位分类的可用装备
const availableEquipmentsBySlot = computed(() => {
  const available = availableEquipmentsForMember.value
  return {
    weapon: available.filter(item => item.slot === 'weapon'),
    armor: available.filter(item => item.slot === 'armor'),
    relic: available.filter(item => item.slot === 'relic'),
  }
})

// 装备给队员
const equipToMember = (memberId, equipment) => {
  if (!memberId || !equipment?.id || !equipment?.slot) return false
  
  const baseState = normalizeState(state.value)
  const teammates = sortTeammatesByPower(baseState.teammates)
  const member = teammates.find(item => item.id === memberId)
  if (!member) {
    errorText.value = '目标角色不存在'
    return false
  }
  
  // 检查装备是否存在
  const allEquipments = Array.isArray(baseState.equipments) ? baseState.equipments : []
  const equipItem = allEquipments.find(item => item.id === equipment.id)
  if (!equipItem) {
    errorText.value = '装备不存在'
    return false
  }
  
  // 获取队员当前装备
  const map = baseState.memberEquippedMap && typeof baseState.memberEquippedMap === 'object'
    ? { ...baseState.memberEquippedMap }
    : {}
  const currentEquipped = map[memberId] && typeof map[memberId] === 'object' ? { ...map[memberId] } : {}
  
  // 如果该槽位已有装备，先卸下（放回装备列表，不做任何操作因为装备列表本身就有）
  // 直接替换装备
  currentEquipped[equipment.slot] = equipItem
  map[memberId] = currentEquipped
  
  baseState.memberEquippedMap = map
  state.value = normalizeState({
    ...baseState,
    updatedAt: Date.now(),
  })
  
  pushLogs(`${member.name} 装备了 ${equipItem.name}`)
  errorText.value = `${member.name} 已装备 ${equipItem.name}`
  return true
}

// 卸下队员装备
const unequipFromMember = (memberId, slot) => {
  if (!memberId || !slot) return false
  
  const baseState = normalizeState(state.value)
  const teammates = sortTeammatesByPower(baseState.teammates)
  const member = teammates.find(item => item.id === memberId)
  if (!member) {
    errorText.value = '目标角色不存在'
    return false
  }
  
  const map = baseState.memberEquippedMap && typeof baseState.memberEquippedMap === 'object'
    ? { ...baseState.memberEquippedMap }
    : {}
  const currentEquipped = map[memberId] && typeof map[memberId] === 'object' ? { ...map[memberId] } : {}
  
  const unequippedItem = currentEquipped[slot]
  if (!unequippedItem) {
    errorText.value = '该槽位没有装备'
    return false
  }
  
  currentEquipped[slot] = null
  map[memberId] = currentEquipped
  
  baseState.memberEquippedMap = map
  state.value = normalizeState({
    ...baseState,
    updatedAt: Date.now(),
  })
  
  pushLogs(`${member.name} 卸下了 ${unequippedItem.name}`)
  errorText.value = `${member.name} 已卸下 ${unequippedItem.name}`
  return true
}

// 选中的装备槽位
const selectedEquipSlot = ref('')
const selectedEquipItem = ref(null)

// 选择装备槽位
const selectEquipSlot = (slot) => {
  if (selectedEquipSlot.value === slot) {
    selectedEquipSlot.value = ''
    selectedEquipItem.value = null
  } else {
    selectedEquipSlot.value = slot
    selectedEquipItem.value = null
  }
}

// 选择要装备的物品
const selectEquipItem = (item) => {
  if (selectedEquipItem.value?.id === item?.id) {
    selectedEquipItem.value = null
  } else {
    selectedEquipItem.value = item
  }
}

// 确认装备
const confirmEquipToMember = () => {
  if (!selectedPartyMemberId.value || !selectedEquipSlot.value || !selectedEquipItem.value) return
  equipToMember(selectedPartyMemberId.value, selectedEquipItem.value)
  selectedEquipSlot.value = ''
  selectedEquipItem.value = null
}

const backpackItems = computed(() => {
  return normalizeBackpackItems(state.value?.backpackItems)
})

const selectedBackpackItem = computed(() => {
  const key = String(selectedBackpackItemKey.value || '').trim()
  if (!key) return null
  return backpackItems.value.find((item) => item.stackKey === key) || null
})

const selectBackpackItem = (item) => {
  const key = String(item?.stackKey || '').trim()
  if (!key) return
  selectedBackpackItemKey.value = selectedBackpackItemKey.value === key ? '' : key
}

const activeDungeonMap = computed(() => {
  const map = state.value?.dungeonMap
  if (!map || typeof map !== 'object') return null
  if (!Array.isArray(map.cells) || !Number.isFinite(map.width) || !Number.isFinite(map.height)) return null
  if (!isDungeonMapUsable(map)) return null
  return map
})

const hasDungeonMap = computed(() => Boolean(activeDungeonMap.value))
const dungeonLeader = computed(() => {
  return (Array.isArray(dungeonActiveParty.value) ? dungeonActiveParty.value : [])[0] || null
})
const dungeonLeaderSpriteSrc = computed(() => {
  const leader = dungeonLeader.value
  if (!leader) return ''
  return getTeammateSpriteSrc(leader, 0)
})
const dungeonManualMoveEnabled = computed(() => {
  return !android.value && hasDungeonMap.value && dungeonEnemyRemainingCount.value > 0
})

const syncDungeonMapViewport = () => {
  if (typeof window === 'undefined') return
  const width = Math.max(0, Number(window.innerWidth) || 0)
  const height = Math.max(0, Number(window.innerHeight) || 0)
  const cardWidth = Math.max(0, Number(dungeonMapCardRef.value?.clientWidth) || 0)
  dungeonMapViewport.value = { width, height, cardWidth }
}

const handleDungeonMapResize = () => {
  syncDungeonMapViewport()
  syncBedroomViewport()
}

const dungeonMapGridStyle = computed(() => {
  const map = activeDungeonMap.value
  if (!map) return {}
  const width = clampInt(map.width, DUNGEON_MAP_MIN_SIZE, DUNGEON_MAP_MAX_SIZE, DUNGEON_MAP_MIN_SIZE)
  const height = clampInt(map.height, DUNGEON_MAP_MIN_SIZE, DUNGEON_MAP_MAX_SIZE, DUNGEON_MAP_MIN_SIZE)
  const viewportWidth = Math.max(320, Number(dungeonMapViewport.value?.width) || 430)
  const viewportHeight = Math.max(320, Number(dungeonMapViewport.value?.height) || 760)
  const targetScreenWidth = Math.floor(viewportWidth * 0.8)
  const targetScreenHeight = Math.floor(viewportHeight * 0.8)
  const rawCardWidth = Math.max(0, Number(dungeonMapViewport.value?.cardWidth) || 0)
  const targetCardWidth = rawCardWidth > 0 ? Math.max(120, Math.floor(rawCardWidth - 14)) : targetScreenWidth
  const targetWidth = Math.max(120, Math.min(targetScreenWidth, targetCardWidth))
  const gap = 2
  const widthBudget = Math.max(1, targetWidth - gap * Math.max(0, width - 1))
  const heightBudget = Math.max(1, targetScreenHeight - gap * Math.max(0, height - 1))
  const byWidth = Math.floor(widthBudget / Math.max(1, width))
  const byHeight = Math.floor(heightBudget / Math.max(1, height))
  const cellSize = clampInt(Math.min(byWidth, byHeight), 10, 56, 14)
  return {
    '--xx-dungeon-grid-gap': `${gap}px`,
    '--xx-dungeon-cell-size': `${cellSize}px`,
    gridTemplateColumns: `repeat(${width}, var(--xx-dungeon-cell-size))`,
    gridAutoRows: 'var(--xx-dungeon-cell-size)',
  }
})

const bedroomState = computed(() => normalizeBedroomState(state.value?.bedroom))
const bedroomFurnitureCount = computed(() => {
  const list = Array.isArray(bedroomState.value?.items) ? bedroomState.value.items : []
  return list.length
})

const bedroomGridCellSize = computed(() => {
  const roomWidth = clampInt(bedroomState.value?.width, BEDROOM_GRID_WIDTH, BEDROOM_GRID_WIDTH, BEDROOM_GRID_WIDTH)
  const roomHeight = clampInt(bedroomState.value?.height, BEDROOM_GRID_HEIGHT, BEDROOM_GRID_HEIGHT, BEDROOM_GRID_HEIGHT)
  const viewportWidth = Math.max(320, Number(bedroomViewport.value?.width) || 430)
  const viewportHeight = Math.max(320, Number(bedroomViewport.value?.height) || 760)
  const targetScreenWidth = Math.floor(viewportWidth * 0.72)
  const targetScreenHeight = Math.floor(viewportHeight * 0.48)
  const rawCardWidth = Math.max(0, Number(bedroomViewport.value?.cardWidth) || 0)
  const targetCardWidth = rawCardWidth > 0 ? Math.max(120, Math.floor(rawCardWidth - 8)) : targetScreenWidth
  const targetWidth = Math.max(120, Math.min(targetScreenWidth, targetCardWidth))
  const byWidth = Math.floor(targetWidth / Math.max(1, roomWidth))
  const byHeight = Math.floor(targetScreenHeight / Math.max(1, roomHeight))
  return clampInt(Math.min(byWidth, byHeight), 16, 52, 28)
})

const bedroomGridStyle = computed(() => {
  const roomWidth = clampInt(bedroomState.value?.width, BEDROOM_GRID_WIDTH, BEDROOM_GRID_WIDTH, BEDROOM_GRID_WIDTH)
  const roomHeight = clampInt(bedroomState.value?.height, BEDROOM_GRID_HEIGHT, BEDROOM_GRID_HEIGHT, BEDROOM_GRID_HEIGHT)
  return {
    '--xx-bedroom-cell-size': `${bedroomGridCellSize.value}px`,
    width: `calc(${roomWidth} * var(--xx-bedroom-cell-size))`,
    height: `calc(${roomHeight} * var(--xx-bedroom-cell-size))`,
    gridTemplateColumns: `repeat(${roomWidth}, var(--xx-bedroom-cell-size))`,
    gridTemplateRows: `repeat(${roomHeight}, var(--xx-bedroom-cell-size))`,
  }
})

const bedroomGridCells = computed(() => {
  const width = clampInt(bedroomState.value?.width, BEDROOM_GRID_WIDTH, BEDROOM_GRID_WIDTH, BEDROOM_GRID_WIDTH)
  const height = clampInt(bedroomState.value?.height, BEDROOM_GRID_HEIGHT, BEDROOM_GRID_HEIGHT, BEDROOM_GRID_HEIGHT)
  const cells = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      cells.push({
        x,
        y,
        key: `${x}:${y}`,
      })
    }
  }
  return cells
})

const bedroomFurnitureRenderList = computed(() => {
  const source = Array.isArray(bedroomState.value?.items) ? bedroomState.value.items : []
  return [...source]
    .sort((a, b) => {
      if ((a?.z || 0) !== (b?.z || 0)) return (a?.z || 0) - (b?.z || 0)
      if ((a?.y || 0) !== (b?.y || 0)) return (a?.y || 0) - (b?.y || 0)
      if ((a?.x || 0) !== (b?.x || 0)) return (a?.x || 0) - (b?.x || 0)
      return String(a?.id || '').localeCompare(String(b?.id || ''))
    })
    .map((item, index) => ({
      ...item,
      renderIndex: index,
    }))
})

const selectedBedroomFurniture = computed(() => {
  const id = String(selectedBedroomFurnitureId.value || '').trim()
  if (!id) return null
  return bedroomFurnitureRenderList.value.find((item) => item.id === id) || null
})

const syncBedroomViewport = () => {
  if (typeof window === 'undefined') return
  const width = Math.max(0, Number(window.innerWidth) || 0)
  const height = Math.max(0, Number(window.innerHeight) || 0)
  const cardWidth = Math.max(
    0,
    Number(bedroomBoardRef.value?.parentElement?.clientWidth) || Number(bedroomBoardRef.value?.clientWidth) || 0,
  )
  bedroomViewport.value = { width, height, cardWidth }
}

const buildLocalBedroomFurnitureDrafts = () => {
  return buildLocalBedroomFurnitureDraftsByTemplate({
    itemCount: BEDROOM_GENERATE_ITEM_COUNT,
    makeId,
    pickRandomItem,
    randomInt,
    paletteList: BEDROOM_SPRITE_PALETTE_LIST,
    silhouetteList: BEDROOM_SPRITE_SILHOUETTE_LIST,
    ornamentList: BEDROOM_SPRITE_ORNAMENT_LIST,
    randomFn: Math.random,
  })
}

const updateBedroomFurnitureById = (itemId, mutator, persist = false) => {
  const targetId = String(itemId || '').trim()
  if (!targetId || typeof mutator !== 'function') return false
  const next = normalizeState(state.value)
  const bedroom = normalizeBedroomState(next.bedroom)
  const index = bedroom.items.findIndex((item) => String(item?.id || '') === targetId)
  if (index < 0) return false

  const current = bedroom.items[index]
  const mutated = mutator({ ...current }, bedroom, index)
  if (!mutated || typeof mutated !== 'object') return false

  const normalized = normalizeBedroomFurnitureItem({
    ...current,
    ...mutated,
    id: current.id,
  }, index, bedroom.width, bedroom.height)
  if (!normalized) return false

  const unchanged = (
    normalized.x === current.x &&
    normalized.y === current.y &&
    normalized.z === current.z &&
    normalized.width === current.width &&
    normalized.height === current.height &&
    normalized.name === current.name &&
    normalized.kind === current.kind &&
    normalized.walkable === current.walkable &&
    normalized.desc === current.desc &&
    getBedroomTemplateSignature(normalized.spriteTemplate) === getBedroomTemplateSignature(current.spriteTemplate) &&
    JSON.stringify(normalized.spriteSpec) === JSON.stringify(current.spriteSpec)
  )
  if (unchanged) return false

  bedroom.items[index] = normalized
  next.bedroom = normalizeBedroomState(bedroom)
  state.value = normalizeState({
    ...next,
    updatedAt: persist ? Date.now() : next.updatedAt,
  })
  if (persist) {
    schedulePersist()
  }
  return true
}

const focusBedroomFurniture = (itemId, bringToFront = true) => {
  const id = String(itemId || '').trim()
  if (!id) return
  selectedBedroomFurnitureId.value = id
  if (!bringToFront) return
  updateBedroomFurnitureById(id, (item, bedroom) => {
    const maxZ = bedroom.items.reduce((max, entry) => Math.max(max, clampInt(entry?.z, 0, 200, 0)), 0)
    if (item.z >= maxZ) return item
    return {
      ...item,
      z: maxZ + 1,
    }
  }, true)
}

const adjustBedroomFurnitureZ = (itemId, delta = 0) => {
  const id = String(itemId || '').trim()
  const shift = Number(delta) || 0
  if (!id || shift === 0) return
  updateBedroomFurnitureById(id, (item) => {
    return {
      ...item,
      z: clampInt((Number(item.z) || 0) + shift, 0, 200, item.z || 0),
    }
  }, true)
}

const getBedroomFurnitureInlineStyle = (item, renderIndex = 0) => {
  const width = clampInt(item?.width, 1, 4, 1)
  const height = clampInt(item?.height, 1, 4, 1)
  const x = clampInt(item?.x, 0, BEDROOM_GRID_WIDTH - width, 0)
  const y = clampInt(item?.y, 0, BEDROOM_GRID_HEIGHT - height, 0)
  const z = clampInt(item?.z, 0, 200, 0)
  return {
    left: `calc(${x} * var(--xx-bedroom-cell-size))`,
    top: `calc(${y} * var(--xx-bedroom-cell-size))`,
    width: `calc(${width} * var(--xx-bedroom-cell-size))`,
    height: `calc(${height} * var(--xx-bedroom-cell-size))`,
    zIndex: 40 + z * 2 + renderIndex,
  }
}

const resolveBedroomPointerCell = (clientX, clientY) => {
  return resolveBedroomPointerCellByInput(
    clientX,
    clientY,
    bedroomBoardRef.value,
    bedroomGridCellSize.value,
  )
}

const removeBedroomDragListeners = () => {
  window.removeEventListener('pointermove', onBedroomDragMove)
  window.removeEventListener('pointerup', onBedroomDragEnd)
  window.removeEventListener('pointercancel', onBedroomDragCancel)
}

const stopBedroomDrag = () => {
  bedroomDragState = null
  draggingBedroomFurnitureId.value = ''
  removeBedroomDragListeners()
}

const onBedroomDragMove = (event) => {
  if (!bedroomDragState) return
  if (bedroomDragState.pointerId !== null && event.pointerId !== bedroomDragState.pointerId) return
  const point = resolveBedroomPointerCell(event.clientX, event.clientY)
  if (!point) return
  event.preventDefault()
  const nextPos = resolveBedroomDragPositionByInput(point, bedroomState.value, bedroomDragState, clampInt)
  if (!nextPos) return
  updateBedroomFurnitureById(
    bedroomDragState.itemId,
    (item) => ({ ...item, x: nextPos.x, y: nextPos.y }),
    false,
  )
}

const onBedroomDragEnd = (event) => {
  if (!bedroomDragState) return
  if (bedroomDragState.pointerId !== null && event.pointerId !== bedroomDragState.pointerId) return
  const point = resolveBedroomPointerCell(event.clientX, event.clientY)
  if (point) {
    const nextPos = resolveBedroomDragPositionByInput(point, bedroomState.value, bedroomDragState, clampInt)
    if (nextPos) {
      updateBedroomFurnitureById(
        bedroomDragState.itemId,
        (item) => ({ ...item, x: nextPos.x, y: nextPos.y }),
        true,
      )
    } else {
      schedulePersist()
    }
  } else {
    schedulePersist()
  }
  stopBedroomDrag()
}

const onBedroomDragCancel = () => {
  if (!bedroomDragState) return
  updateBedroomFurnitureById(
    bedroomDragState.itemId,
    (item) => ({
      ...item,
      x: bedroomDragState.startX,
      y: bedroomDragState.startY,
    }),
    true,
  )
  stopBedroomDrag()
}

const startBedroomFurnitureDrag = (event, item) => {
  if (!event || !item) return
  if (typeof event.button === 'number' && event.button !== 0) return
  const point = resolveBedroomPointerCell(event.clientX, event.clientY)
  if (!point) return
  focusBedroomFurniture(item.id, true)
  const nextDragState = buildBedroomDragStateByInput({
    event,
    item,
    point,
    clampInt,
    gridWidth: BEDROOM_GRID_WIDTH,
    gridHeight: BEDROOM_GRID_HEIGHT,
  })
  if (!nextDragState) return
  bedroomDragState = nextDragState
  draggingBedroomFurnitureId.value = nextDragState.itemId
  removeBedroomDragListeners()
  window.addEventListener('pointermove', onBedroomDragMove, { passive: false })
  window.addEventListener('pointerup', onBedroomDragEnd, { passive: false })
  window.addEventListener('pointercancel', onBedroomDragCancel, { passive: false })
  if (typeof event.preventDefault === 'function') {
    event.preventDefault()
  }
}

const clearBedroomFurniture = () => {
  if (bedroomLoading.value) return
  const next = normalizeState(state.value)
  next.bedroom = normalizeBedroomState({
    ...next.bedroom,
    items: [],
  })
  state.value = normalizeState({
    ...next,
    updatedAt: Date.now(),
  })
  selectedBedroomFurnitureId.value = ''
  stopBedroomDrag()
  pushLogs('卧室已清空，等待新的家具摆放。')
}

const applyBedroomFurnitureDrafts = (drafts = [], usedLLM = false) => {
  const result = applyBedroomFurnitureDraftsToState({
    targetState: state.value,
    drafts,
    normalizeState,
    normalizeBedroomState,
    normalizeBedroomFurnitureItem,
    maxFurnitureItems: MAX_BEDROOM_FURNITURE_ITEMS,
    makeId,
    clampInt,
    randomInt,
  })
  if (!result.ok) return false

  const appended = result.appended
  state.value = normalizeState({
    ...result.nextState,
    updatedAt: Date.now(),
  })
  selectedBedroomFurnitureId.value = appended[appended.length - 1]?.id || selectedBedroomFurnitureId.value
  schedulePersist()
  pushLogs(`卧室新增 ${appended.length} 件家具（${usedLLM ? 'LLM' : '本地'}生成）。`)
  return true
}

const generateNewBedroomFurniture = async () => {
  if (bedroomLoading.value || isBusy.value) return
  bedroomLoading.value = true
  errorText.value = ''
  try {
    const generation = await generateBedroomFurnitureDraftsWithFallback({
      loadWorldSnapshot: loadActiveWorldBookSnapshot,
      requestBedroomFurnitureItems: generateBedroomFurnitureItems,
      floor: state.value.floor,
      itemCount: BEDROOM_GENERATE_ITEM_COUNT,
      styleHint: '像素风卧室，包含地面与家具，可摆放',
      makeId,
      clampInt,
      buildLocalDrafts: buildLocalBedroomFurnitureDrafts,
      logger: console,
    })
    const drafts = generation.drafts
    const usedLLM = generation.usedLLM
    if (!applyBedroomFurnitureDrafts(drafts, usedLLM)) {
      errorText.value = '家具生成失败，请稍后重试'
    }
  } catch (e) {
    console.error('[xx-dungeon] generate bedroom furniture failed:', e)
    errorText.value = '家具生成失败，请稍后重试'
  } finally {
    bedroomLoading.value = false
  }
}

const dungeonMapCells = computed(() => {
  const map = activeDungeonMap.value
  if (!map || !Array.isArray(map.cells)) return []
  const playerX = clampInt(map?.player?.x, 0, Math.max(0, map.width - 1), 0)
  const playerY = clampInt(map?.player?.y, 0, Math.max(0, map.height - 1), 0)
  const monsterIndex = map.cells.findIndex((cell) => cell?.type === DUNGEON_TILE_MONSTER && !cell?.cleared)
  const bossIndex = map.cells.findIndex((cell) => cell?.type === DUNGEON_TILE_BOSS && !cell?.cleared)
  const nextIndex = monsterIndex >= 0 ? monsterIndex : bossIndex
  const nextCell = nextIndex >= 0 ? map.cells[nextIndex] : null
  const nextKey = nextCell ? `${nextCell.x}:${nextCell.y}` : ''
  return [...map.cells]
    .sort((a, b) => {
      if ((a?.y || 0) !== (b?.y || 0)) return (a?.y || 0) - (b?.y || 0)
      return (a?.x || 0) - (b?.x || 0)
    })
    .map((cell, index) => {
      const key = `${cell?.x}:${cell?.y}`
      return {
        ...cell,
        renderKey: key,
        renderIndex: index,
        isPlayer: cell?.x === playerX && cell?.y === playerY,
        isNextEncounter: Boolean(nextKey) && key === nextKey && !cell?.cleared,
      }
    })
})

const getDungeonCellBadge = (cell) => {
  return buildDungeonCellBadgeByRuntime(cell, {
    hasLeaderSprite: Boolean(dungeonLeaderSpriteSrc.value),
    shouldRenderObject: shouldRenderDungeonObjectSprite,
    tileTypes: {
      start: DUNGEON_TILE_START,
      exit: DUNGEON_TILE_EXIT,
      boss: DUNGEON_TILE_BOSS,
      monster: DUNGEON_TILE_MONSTER,
      treasure: DUNGEON_TILE_TREASURE,
    },
  })
}

const getDungeonCellClass = (cell) => {
  return buildDungeonCellClassByRuntime(cell, {
    tileTypes: {
      empty: DUNGEON_TILE_EMPTY,
    },
  })
}

const getDungeonCellTitle = (cell) => {
  return buildDungeonCellTitleByRuntime(cell, {
    tileTypes: {
      start: DUNGEON_TILE_START,
      exit: DUNGEON_TILE_EXIT,
      monster: DUNGEON_TILE_MONSTER,
      boss: DUNGEON_TILE_BOSS,
      treasure: DUNGEON_TILE_TREASURE,
      empty: DUNGEON_TILE_EMPTY,
    },
  })
}

const dungeonEnemyPreviewList = computed(() => {
  const map = activeDungeonMap.value
  if (!map || !Array.isArray(map.cells)) return []
  const floor = clampInt(state.value?.floor, 1, 999, 1)
  const monsters = []
  const bosses = []
  map.cells.forEach((cell, index) => {
    if (cell?.type !== DUNGEON_TILE_BOSS && cell?.type !== DUNGEON_TILE_MONSTER) return
    const isBoss = cell.type === DUNGEON_TILE_BOSS
    const enemy = normalizeDungeonEnemy(cell.enemy, floor, isBoss, index)
    const item = {
      id: String(cell.id || `${isBoss ? 'boss' : 'mob'}-${index}`),
      type: cell.type,
      name: enemy.name,
      hp: enemy.hp,
      attack: enemy.attack,
      drops: Array.isArray(enemy?.drops) ? enemy.drops : [],
      cleared: Boolean(cell.cleared),
    }
    if (isBoss) {
      bosses.push(item)
      return
    }
    monsters.push(item)
  })
  return [...monsters, ...bosses]
})

const dungeonEnemyRemainingCount = computed(() => dungeonEnemyPreviewList.value.filter((item) => !item.cleared).length)

const currentDungeonEnemy = computed(() => {
  return dungeonEnemyPreviewList.value.find((item) => !item.cleared) || null
})

const dungeonMapBossRemaining = computed(() => {
  return dungeonEnemyPreviewList.value.filter((item) => item.type === DUNGEON_TILE_BOSS && !item.cleared).length
})

const dungeonMapStatusText = computed(() => {
  const map = activeDungeonMap.value
  if (!map) return '未生成地图'
  const bossRemain = dungeonMapBossRemaining.value
  const mobRemain = dungeonEnemyPreviewList.value.filter((item) => item.type === DUNGEON_TILE_MONSTER && !item.cleared).length
  const treasureRemain = Array.isArray(map?.cells)
    ? map.cells.filter((cell) => cell?.type === DUNGEON_TILE_TREASURE && !cell?.cleared).length
    : 0
  return `Boss 剩余 ${bossRemain} / 小怪剩余 ${mobRemain} / 宝箱 ${treasureRemain}`
})

const dungeonAdvanceButtonText = computed(() => {
  if (loading.value) return '生成中...'
  if (state.value.hp <= 0) return '已阵亡（先休整）'
  if (!hasDungeonMap.value) return '前进（生成地图）'
  if (dungeonEnemyRemainingCount.value <= 0) return '前进（进入下一层）'
  if (dungeonManualMoveEnabled.value) return '方向键移动中'
  return '前进'
})

const getDungeonEnemyCardClass = (enemy) => {
  const isBoss = enemy?.type === DUNGEON_TILE_BOSS
  return [
    isBoss ? 'is-boss' : 'is-monster',
    {
      'is-cleared': Boolean(enemy?.cleared),
    },
  ]
}

const formatEnemyDropText = (drops = []) => {
  const list = Array.isArray(drops) ? drops : []
  if (list.length < 1) return '无掉落'
  return list
    .map((drop) => {
      const name = String(drop?.name || '未知道具').trim().slice(0, 16) || '未知道具'
      const effectType = normalizeConsumableEffectType(drop?.effectType, 'heal_hp')
      const value = clampInt(drop?.value, 1, 9999, 0)
      const amount = clampInt(drop?.amount, 1, MAX_BACKPACK_ITEM_STACK, 1)
      const descRaw = String(drop?.desc || '').replace(/\s+/g, ' ').trim()
      const fallbackDesc = effectType === 'heal_hp'
        ? `恢复 ${value} 点生命`
        : (effectType === 'junk' ? '杂物材料，可出售或加工' : '合成原料，可用于制作')
      const desc = (descRaw || fallbackDesc).slice(0, 24)
      return `${name} x${amount}（${desc}）`
    })
    .join('，')
}

const DUNGEON_RESOURCE_DROP_POOL = [
  { id: 'weed_fiber', name: '草纤维', effectType: 'material', desc: '草药原料，可作缠带基底', minAmount: 1, maxAmount: 3, weight: 14, sources: ['monster', 'treasure'] },
  { id: 'mint_leaf', name: '野薄荷叶', effectType: 'material', desc: '清凉草药，可调制药剂', minAmount: 1, maxAmount: 3, weight: 13, sources: ['monster', 'treasure'] },
  { id: 'fungi_powder', name: '菌粉', effectType: 'material', desc: '潮湿洞窟常见炼金原料', minAmount: 1, maxAmount: 2, weight: 11, sources: ['monster', 'treasure'] },
  { id: 'beast_bone', name: '兽骨碎片', effectType: 'material', desc: '可用于强化护具的骨料', minAmount: 1, maxAmount: 2, weight: 10, sources: ['monster', 'boss'] },
  { id: 'rough_ore', name: '粗矿石', effectType: 'material', desc: '未提炼矿料，可用于锻造', minAmount: 1, maxAmount: 2, weight: 9, sources: ['monster', 'treasure', 'boss'] },
  { id: 'rust_coin', name: '锈蚀铜片', effectType: 'junk', desc: '地下城杂物，多少值点钱', minAmount: 1, maxAmount: 4, weight: 13, sources: ['monster', 'treasure'] },
  { id: 'broken_gear', name: '破损齿轮', effectType: 'junk', desc: '旧机关拆下的废弃零件', minAmount: 1, maxAmount: 3, weight: 10, sources: ['monster', 'treasure', 'boss'] },
  { id: 'torn_badge', name: '残旧徽章', effectType: 'junk', desc: '冒险队遗落的旧徽章', minAmount: 1, maxAmount: 2, weight: 8, sources: ['treasure', 'boss'] },
  { id: 'field_salve', name: '简易药膏', effectType: 'heal_hp', desc: '应急治疗药膏，恢复生命', baseValue: 16, scale: 1.8, minAmount: 1, maxAmount: 2, weight: 12, sources: ['monster', 'treasure'] },
  { id: 'herb_extract', name: '草药萃取液', effectType: 'heal_hp', desc: '浓缩草药，回复效果更好', baseValue: 24, scale: 2.2, minAmount: 1, maxAmount: 2, weight: 8, minFloor: 3, sources: ['treasure', 'boss'] },
]

const pickDungeonResourceDropByWeight = (list = []) => {
  const source = Array.isArray(list) ? list : []
  if (source.length < 1) return null
  const totalWeight = source.reduce((sum, entry) => sum + Math.max(1, Number(entry?.weight) || 1), 0)
  let roll = Math.random() * totalWeight
  for (const entry of source) {
    roll -= Math.max(1, Number(entry?.weight) || 1)
    if (roll <= 0) return entry
  }
  return source[source.length - 1] || null
}

const buildDungeonResourceDropItem = (entry, floor = 1, index = 0) => {
  if (!entry || typeof entry !== 'object') return null
  const effectType = normalizeConsumableEffectType(entry.effectType, 'material')
  const minAmount = clampInt(entry.minAmount, 1, MAX_BACKPACK_ITEM_STACK, 1)
  const maxAmount = clampInt(entry.maxAmount, minAmount, MAX_BACKPACK_ITEM_STACK, minAmount)
  const amount = randomInt(minAmount, Math.max(minAmount, maxAmount))
  const value = effectType === 'heal_hp'
    ? clampInt(Math.round((Number(entry.baseValue) || 16) + floor * (Number(entry.scale) || 1.8) + randomInt(0, 6)), 1, 9999, 20)
    : 0
  return normalizeBackpackItem({
    id: makeId(`res-drop-${index + 1}`),
    name: entry.name,
    effectType,
    target: effectType === 'heal_hp' ? 'ally' : 'inventory',
    value,
    amount,
    desc: entry.desc,
  }, index)
}

const rollDungeonResourceDrops = (floor = 1, options = {}) => {
  const sourceType = String(options?.source || 'monster').trim().toLowerCase()
  const guaranteedCount = clampInt(options?.guaranteedCount, 0, 6, 0)
  const source = DUNGEON_RESOURCE_DROP_POOL.filter((entry) => {
    const sources = Array.isArray(entry?.sources) ? entry.sources : []
    if (!sources.includes(sourceType)) return false
    const minFloor = clampInt(entry?.minFloor, 1, 999, 1)
    return floor >= minFloor
  })
  if (source.length < 1) return []

  let baseCount = 0
  if (sourceType === 'treasure') {
    baseCount = randomInt(2, 4)
  } else if (sourceType === 'boss') {
    baseCount = randomInt(1, 3)
  } else if (Math.random() < 0.72) {
    baseCount = randomInt(1, 2)
  }
  const dropCount = Math.max(guaranteedCount, baseCount)
  if (dropCount < 1) return []

  const results = []
  const usedIds = new Set()
  for (let index = 0; index < dropCount; index += 1) {
    const available = usedIds.size < source.length
      ? source.filter((entry) => !usedIds.has(entry.id))
      : source
    const picked = pickDungeonResourceDropByWeight(available.length > 0 ? available : source)
    if (!picked) continue
    usedIds.add(picked.id)
    const item = buildDungeonResourceDropItem(picked, floor, index)
    if (item) results.push(item)
  }
  return results
}

const findNextDungeonEncounterIndex = (map) => {
  if (!map || !Array.isArray(map.cells)) return -1
  const monsterIndex = map.cells.findIndex((cell) => cell.type === DUNGEON_TILE_MONSTER && !cell.cleared)
  if (monsterIndex >= 0) return monsterIndex
  return map.cells.findIndex((cell) => cell.type === DUNGEON_TILE_BOSS && !cell.cleared)
}

const countDungeonEnemyRemainingByMap = (map) => {
  if (!map || !Array.isArray(map.cells)) return 0
  return map.cells.filter(
    (cell) => (cell.type === DUNGEON_TILE_BOSS || cell.type === DUNGEON_TILE_MONSTER) && !cell.cleared,
  ).length
}

const resolveDungeonBattleAtCell = (nextState, nextMap, targetCell, targetIndex = 0) => {
  if (!targetCell) {
    return {
      didBattle: false,
      isPartyWiped: false,
      logs: [],
      enemyName: '',
    }
  }

  const isBoss = targetCell.type === DUNGEON_TILE_BOSS
  const isMonster = targetCell.type === DUNGEON_TILE_MONSTER
  const isTreasure = targetCell.type === DUNGEON_TILE_TREASURE
  if ((!isBoss && !isMonster && !isTreasure) || targetCell.cleared) {
    return {
      didBattle: false,
      isPartyWiped: false,
      logs: [],
      enemyName: '',
    }
  }

  if (isTreasure) {
    const reward = normalizeDungeonReward(targetCell.reward, nextState.floor, false)
    const logs = []
    nextState.lastScene = `${nextMap.theme} · 宝箱补给`
    targetCell.cleared = true
    nextState.coins += reward.coins
    nextState.gems += reward.gems
    nextState.exp += reward.exp
    const levelUps = promoteByExp(nextState)
    logs.push(`开启宝箱，获得 +${reward.coins} 金币 / +${reward.gems} 星钻 / +${reward.exp} EXP。`)

    const treasureDrops = rollDungeonResourceDrops(nextState.floor, {
      source: 'treasure',
      guaranteedCount: 2,
    })
    if (treasureDrops.length > 0) {
      nextState.backpackItems = mergeBackpackItems(nextState.backpackItems, treasureDrops)
      logs.push(`宝箱掉落：${formatEnemyDropText(treasureDrops)}。`)
    }

    const chestEquipChance = Math.max(0, Math.min(1, (Number(reward.equipmentChance) || 0) + 0.12))
    const loot = tryGrantDungeonEquipmentDrop(nextState, chestEquipChance)
    if (loot) {
      logs.push(`宝箱额外开出装备：${loot.name}(${loot.rarity})。`)
    }
    if (levelUps > 0) {
      logs.push(`队伍等级提升 ${levelUps} 级，当前 Lv.${nextState.level}。`)
    }

    return {
      didBattle: false,
      isPartyWiped: false,
      logs,
      enemyName: '',
    }
  }

  const enemy = normalizeDungeonEnemy(targetCell.enemy, nextState.floor, isBoss, targetIndex)
  const reward = normalizeDungeonReward(targetCell.reward, nextState.floor, isBoss)
  const debugNoDamage = Boolean(nextState.debugNoDamage)
  const logs = []
  let isPartyWiped = false

  nextState.lastScene = `${nextMap.theme} · ${isBoss ? '首领' : '小怪'} ${enemy.name}`
  if (debugNoDamage) {
    nextState.hp = nextState.maxHp
  }

  const playerRoll = calcTotalPower(nextState) + Math.round(nextState.hp * 0.06) + randomInt(16, 66)
  const enemyRoll = enemy.attack + Math.round(enemy.hp * 0.18) + randomInt(12, 58)
  const win = playerRoll >= enemyRoll

  if (win) {
    const damage = Math.max(8, Math.round(enemy.attack * 0.38 + randomInt(4, 14)))
    if (debugNoDamage) {
      logs.push(`${isBoss ? '首领' : '怪物'} ${enemy.name} 被击败，Debug免伤生效，反击伤害已忽略。`)
    } else {
      nextState.hp = Math.max(0, nextState.hp - damage)
      logs.push(`${isBoss ? '首领' : '怪物'} ${enemy.name} 被击败，受到 ${damage} 点反击伤害。`)
    }
    if (nextState.hp <= 0) {
      isPartyWiped = true
      const { coinLoss, gemLoss } = applyPartyWipePenalty(nextState)
      logs.push('💀 队伍同归于尽，全军覆没！')
      logs.push(`损失 ${coinLoss} 金币和 ${gemLoss} 星钻，倒在当前层。`)
    } else {
      nextState.coins += reward.coins
      nextState.gems += reward.gems
      nextState.exp += reward.exp
      const levelUps = promoteByExp(nextState)
      targetCell.cleared = true
      logs.push(`获得 +${reward.coins} 金币 / +${reward.gems} 星钻 / +${reward.exp} EXP。`)
      const droppedItems = [
        ...mapEnemyDropsToBackpackItems(enemy.drops),
        ...rollDungeonResourceDrops(nextState.floor, { source: isBoss ? 'boss' : 'monster' }),
      ]
      if (droppedItems.length > 0) {
        nextState.backpackItems = mergeBackpackItems(nextState.backpackItems, droppedItems)
        logs.push(`掉落：${formatEnemyDropText(droppedItems)}。`)
      }
      const loot = tryGrantDungeonEquipmentDrop(nextState, reward.equipmentChance)
      if (loot) {
        logs.push(`掉落装备：${loot.name}(${loot.rarity})。`)
      }
      if (levelUps > 0) {
        logs.push(`队伍等级提升 ${levelUps} 级，当前 Lv.${nextState.level}。`)
      }
      if (isBoss) {
        const remainingAfter = Math.max(0, countDungeonBossRemainingByMap(nextMap))
        if (remainingAfter <= 0) {
          logs.push('本层首领已全部击败。')
        }
      }
    }
  } else {
    const damage = Math.max(16, Math.round(enemy.attack * 0.82 + randomInt(10, 26)))
    if (debugNoDamage) {
      logs.push(`遭遇 ${enemy.name} 失利，Debug免伤生效，未受到伤害。`)
    } else {
      nextState.hp = Math.max(0, nextState.hp - damage)
      logs.push(`遭遇 ${enemy.name} 失利，受到 ${damage} 点伤害。`)
    }
    if (nextState.hp <= 0) {
      isPartyWiped = true
      const { coinLoss, gemLoss } = applyPartyWipePenalty(nextState)
      logs.push('💀 队伍全军覆没！')
      logs.push(`损失 ${coinLoss} 金币和 ${gemLoss} 星钻，倒在当前层。`)
    }
  }
  if (applyDebugNoDamageState(nextState)) {
    isPartyWiped = false
  }

  return {
    didBattle: true,
    isPartyWiped,
    logs,
    enemyName: enemy.name,
  }
}

const finalizeDungeonStepState = (nextState, nextMap, isPartyWiped = false) => {
  if (!applyDebugNoDamageState(nextState)) {
    syncPartyMemberHpMapByGlobalHp(nextState)
  }
  nextMap.bossTotal = nextMap.cells.filter((cell) => cell.type === DUNGEON_TILE_BOSS).length
  nextMap.bossCleared = nextMap.cells.filter((cell) => cell.type === DUNGEON_TILE_BOSS && cell.cleared).length
  nextState.dungeonMap = nextMap
  if (isPartyWiped) {
    nextState.lastScene = `${nextMap.theme}（队伍倒下，等待休整）`
  }
}

const moveDungeonPlayerBy = (dx, dy) => {
  if (isBusy.value) return false
  if (!hasDungeonMap.value) return false
  if (state.value.hp <= 0) {
    errorText.value = '队伍已阵亡，请先休整或重置进度'
    return false
  }

  const deltaX = Number(dx) || 0
  const deltaY = Number(dy) || 0
  if (deltaX === 0 && deltaY === 0) return false

  const map = activeDungeonMap.value
  if (!map) return false
  const currentX = clampInt(map?.player?.x, 0, Math.max(0, map.width - 1), map?.start?.x || 0)
  const currentY = clampInt(map?.player?.y, 0, Math.max(0, map.height - 1), map?.start?.y || 0)
  const targetX = currentX + deltaX
  const targetY = currentY + deltaY
  if (targetX < 0 || targetY < 0 || targetX >= map.width || targetY >= map.height) return false

  const nextState = normalizeState(state.value)
  const nextMap = cloneDungeonMapState(map)
  if (!nextMap) return false

  const targetIndex = findDungeonCellIndex(nextMap, targetX, targetY)
  if (targetIndex < 0) return false

  const targetCell = nextMap.cells[targetIndex]
  if (!targetCell?.terrainPassable) {
    errorText.value = '该地形不可通行'
    return false
  }

  const currentIndex = findDungeonCellIndex(nextMap, currentX, currentY)
  if (currentIndex >= 0 && nextMap.cells[currentIndex]) {
    nextMap.cells[currentIndex].discovered = true
  }

  nextMap.player = { x: targetX, y: targetY }
  targetCell.discovered = true

  const result = resolveDungeonBattleAtCell(nextState, nextMap, targetCell, targetIndex)
  finalizeDungeonStepState(nextState, nextMap, result.isPartyWiped)

  state.value = normalizeState({
    ...nextState,
    updatedAt: Date.now(),
  })

  if (result.logs.length > 0) {
    pushLogs(result.logs)
  }
  if (!result.isPartyWiped && countDungeonEnemyRemainingByMap(nextMap) <= 0) {
    pushLogs('本层敌群已清空，再次点击“前进”进入下一层。')
  }
  errorText.value = result.isPartyWiped ? '队伍已阵亡，请先休整或重置进度' : ''
  return true
}

const DUNGEON_MOVE_KEY_MAP = {
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  w: { dx: 0, dy: -1 },
  W: { dx: 0, dy: -1 },
  s: { dx: 0, dy: 1 },
  S: { dx: 0, dy: 1 },
  a: { dx: -1, dy: 0 },
  A: { dx: -1, dy: 0 },
  d: { dx: 1, dy: 0 },
  D: { dx: 1, dy: 0 },
}

const isDungeonMoveInputLocked = () => {
  return (
    !panelOpen.value ||
    currentView.value !== 'dungeon' ||
    !hasDungeonMap.value ||
    state.value.hp <= 0 ||
    isBusy.value
  )
}

const shouldSkipDungeonMoveKey = (event) => {
  const target = event?.target
  if (!target || typeof target !== 'object') return false
  const tag = String(target.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  return Boolean(target.isContentEditable)
}

const handleDungeonKeydown = (event) => {
  const move = DUNGEON_MOVE_KEY_MAP[String(event?.key || '')]
  if (!move) return
  if (isDungeonMoveInputLocked()) return
  if (shouldSkipDungeonMoveKey(event)) return
  event.preventDefault()
  if (dungeonMoveLock) return
  dungeonMoveLock = true
  try {
    moveDungeonPlayerBy(move.dx, move.dy)
  } finally {
    dungeonMoveLock = false
  }
}

const mapEnemyDropsToBackpackItems = (drops = []) => {
  const source = Array.isArray(drops) ? drops : []
  return source
    .map((item, index) => normalizeBackpackItem({
      id: makeId(`drop-${index + 1}`),
      name: item?.name,
      effectType: item?.effectType,
      target: item?.target,
      value: item?.value,
      amount: item?.amount,
      desc: item?.desc,
    }, index))
    .filter(Boolean)
}

const useBackpackItemOnMember = (item, member) => {
  if (!item || !member?.id) return false
  const baseState = normalizeState(state.value)
  const teammates = sortTeammatesByPower(baseState.teammates)
  const memberIndex = teammates.findIndex((target) => target.id === member.id)
  if (memberIndex < 0) {
    errorText.value = '目标角色不存在'
    return false
  }
  const targetMember = teammates[memberIndex]
  const maxHp = resolvePartyMemberMaxHpByState(baseState, targetMember, memberIndex)
  const hpMap = baseState.partyMemberHpMap && typeof baseState.partyMemberHpMap === 'object' ? { ...baseState.partyMemberHpMap } : {}
  const currentHp = clampInt(hpMap[targetMember.id], 0, maxHp, maxHp)

  let effectText = ''
  if (item.effectType === 'heal_hp') {
    const nextHp = Math.min(maxHp, currentHp + item.value)
    const healed = Math.max(0, nextHp - currentHp)
    if (healed <= 0) {
      errorText.value = `${targetMember.name} 生命已满`
      return false
    }
    hpMap[targetMember.id] = nextHp
    effectText = `${targetMember.name} 恢复 ${healed} HP`
  } else {
    errorText.value = '该道具当前不可用'
    return false
  }

  const nextBackpack = normalizeBackpackItems(baseState.backpackItems)
    .map((bagItem) => ({ ...bagItem }))
  const bagIndex = nextBackpack.findIndex((bagItem) => bagItem.stackKey === item.stackKey)
  if (bagIndex < 0) {
    errorText.value = '道具不存在'
    return false
  }
  nextBackpack[bagIndex].amount = clampInt(nextBackpack[bagIndex].amount - 1, 0, MAX_BACKPACK_ITEM_STACK, 0)
  const filteredBackpack = nextBackpack.filter((bagItem) => bagItem.amount > 0)

  baseState.partyMemberHpMap = hpMap
  baseState.backpackItems = filteredBackpack
  rebuildGlobalHpFromPartyMemberHpMap(baseState)
  state.value = normalizeState({
    ...baseState,
    updatedAt: Date.now(),
  })
  if (!filteredBackpack.some((bagItem) => bagItem.stackKey === item.stackKey)) {
    selectedBackpackItemKey.value = ''
  }
  pushLogs(`使用道具：${item.name}，${effectText}。`)
  errorText.value = `${targetMember.name} 使用了 ${item.name}`
  return true
}

const handleDungeonMemberClick = (member) => {
  if (!member?.id) return
  const selectedItem = selectedBackpackItem.value
  if (selectedItem) {
    selectPartyMember(member)
    void useBackpackItemOnMember(selectedItem, member)
    return
  }
  selectPartyMember(member)
}

const enterNextDungeonFloor = (targetState) => {
  const nextState = normalizeState(targetState)
  const currentMap = nextState?.dungeonMap && Array.isArray(nextState.dungeonMap.cells)
    ? nextState.dungeonMap
    : null
  if (currentMap) {
    const bossRemaining = Math.max(0, countDungeonBossRemainingByMap(currentMap))
    if (bossRemaining > 0) {
      errorText.value = `还有 ${bossRemaining} 个Boss未击败，无法进入下一层`
      return false
    }
    const enemyRemaining = Math.max(0, countDungeonEnemyRemainingByMap(currentMap))
    if (enemyRemaining > 0) {
      errorText.value = `还有 ${enemyRemaining} 个敌人未清理，无法进入下一层`
      return false
    }
  }
  nextState.floor += 1
  nextState.hp = Math.min(nextState.maxHp, nextState.hp + randomInt(10, 24))
  nextState.dungeonMap = null
  syncPartyMemberHpMapByGlobalHp(nextState)
  nextState.lastScene = `地下城第 ${nextState.floor} 层入口`
  state.value = normalizeState({
    ...nextState,
    updatedAt: Date.now(),
  })
  errorText.value = `已进入第 ${nextState.floor} 层，请继续前进`
  return true
}

const generateDungeonEncounterBoard = async () => {
  if (isBusy.value) return false
  if (hasDungeonMap.value) {
    errorText.value = dungeonManualMoveEnabled.value
      ? '本层地图已生成，请使用方向键移动队长触发战斗'
      : '本层地图已生成，点击“前进”开始战斗'
    return true
  }
  errorText.value = ''
  loading.value = true
  try {
    const baseState = normalizeState(state.value)
    const nextMap = await buildDungeonMapForFloor(baseState)
    if (!nextMap) {
      throw new Error('no usable dungeon map generated')
    }
    state.value = normalizeState({
      ...baseState,
      dungeonMap: nextMap,
      lastScene: `${nextMap.theme}（地图已生成）`,
      updatedAt: Date.now(),
    })
    errorText.value = dungeonManualMoveEnabled.value
      ? `地图已生成：${nextMap.theme}，请用方向键移动队长`
      : `地图已生成：${nextMap.theme}`
    return true
  } catch (e) {
    console.error('[xx-dungeon] map board generation failed:', e)
    errorText.value = '地图生成失败，请稍后重试'
    return false
  } finally {
    loading.value = false
  }
}

const campfireCompanions = computed(() => {
  const list = normalizeCampfireCompanionList(state.value.campfireCompanions)
  return list.slice(0, MAX_CAMPFIRE_COMPANIONS)
})

const visibleCampfireCompanions = computed(() => {
  const list = campfireCompanions.value
  if (list.length <= MAX_CAMPFIRE_VISIBLE) return list
  const start = ((campfireRotateCursor.value % list.length) + list.length) % list.length
  const result = []
  for (let index = 0; index < MAX_CAMPFIRE_VISIBLE; index += 1) {
    result.push(list[(start + index) % list.length])
  }
  return result
})

const campfireCompanionSignature = computed(() => {
  return campfireCompanions.value
    .map((item) => `${item.id}:${item.worldCharacterId}:${item.style}:${item.palette}:${item.action}`)
    .join('|')
})

const dungeonEquipBonuses = computed(() => {
  const equipped = state.value.equipped && typeof state.value.equipped === 'object' ? state.value.equipped : {}
  const list = [equipped.weapon, equipped.armor, equipped.relic].filter(Boolean)
  return list.reduce(
    (sum, item) => ({
      atk: sum.atk + (Number(item.atk) || 0),
      def: sum.def + (Number(item.def) || 0),
      hp: sum.hp + (Number(item.hp) || 0),
    }),
    { atk: 0, def: 0, hp: 0 },
  )
})

const calcTotalPower = (targetState) => {
  const level = Math.max(1, Number(targetState?.level) || 1)
  const floor = Math.max(1, Number(targetState?.floor) || 1)
  const teammates = Array.isArray(targetState?.teammates) ? targetState.teammates : []
  const party = [...teammates].sort((a, b) => (b.power || 0) - (a.power || 0)).slice(0, 4)
  const partyPower = party.reduce((sum, item) => sum + (Number(item.power) || 0), 0)
  
  // 全队装备加成（旧系统）
  const equipped = targetState?.equipped && typeof targetState.equipped === 'object' ? targetState.equipped : {}
  const equipList = [equipped.weapon, equipped.armor, equipped.relic].filter(Boolean)
  const equipAtk = equipList.reduce((sum, item) => sum + (Number(item.atk) || 0), 0)
  const equipDef = equipList.reduce((sum, item) => sum + (Number(item.def) || 0), 0)
  const equipHp = equipList.reduce((sum, item) => sum + (Number(item.hp) || 0), 0)
  
  // 队员个人装备加成
  const memberEquippedMap = targetState?.memberEquippedMap && typeof targetState.memberEquippedMap === 'object'
    ? targetState.memberEquippedMap
    : {}
  let memberEquipAtk = 0
  let memberEquipDef = 0
  let memberEquipHp = 0
  party.forEach((member) => {
    const memberEquipped = memberEquippedMap[member.id] && typeof memberEquippedMap[member.id] === 'object'
      ? memberEquippedMap[member.id]
      : {}
    const memberEquipList = [memberEquipped.weapon, memberEquipped.armor, memberEquipped.relic].filter(Boolean)
    memberEquipAtk += memberEquipList.reduce((sum, item) => sum + (Number(item.atk) || 0), 0)
    memberEquipDef += memberEquipList.reduce((sum, item) => sum + (Number(item.def) || 0), 0)
    memberEquipHp += memberEquipList.reduce((sum, item) => sum + (Number(item.hp) || 0), 0)
  })
  
  const totalEquipAtk = equipAtk + memberEquipAtk
  const totalEquipDef = equipDef + memberEquipDef
  const totalEquipHp = equipHp + memberEquipHp
  
  return Math.round(level * 9 + floor * 3 + partyPower + totalEquipAtk * 1.2 + totalEquipDef * 0.85 + totalEquipHp * 0.22)
}

const dungeonTotalPower = computed(() => calcTotalPower(state.value))

const dungeonLevelNeedExp = computed(() => needExpByLevel(state.value.level))

const hpPercent = computed(() => {
  const hp = Math.max(0, Number(state.value.hp) || 0)
  const maxHp = Math.max(1, Number(state.value.maxHp) || 1)
  return Math.min(100, Math.round((hp / maxHp) * 100))
})

const recentLogs = computed(() => [...state.value.logs].reverse().slice(0, MAX_LOG_COUNT))
const battleRecentLogs = computed(() => {
  const logs = Array.isArray(state.value.logs) ? state.value.logs : []
  const battleOnly = logs.filter((line) => {
    const text = String(line || '')
    return /被击败|遭遇|反击伤害|首领已清空|首领已全部击败|失利|撤回营地起点|掉落|使用道具/.test(text)
  })
  return [...battleOnly].reverse().slice(0, MAX_LOG_COUNT)
})
const currentViewTitle = computed(() => VIEW_LABELS[currentView.value] || '营地')
const campfireHint = computed(() => {
  if (hpPercent.value <= 32) return '队伍状态偏低，建议先休整。'
  if (state.value.floor > 1 && state.value.floor % 5 === 0) return '前方是首领层，先整备再出发。'
  if (drawing.value) return '装备抽取中，篝火旁传来神秘回响。'
  return '篝火稳定燃烧，今晚适合整备或深入地下城。'
})

const isBusy = computed(() => loading.value || drawing.value || banterLoading.value)
const canDrawEquipmentSingle = computed(() => !isBusy.value && state.value.gems >= EQUIPMENT_SINGLE_COST)
const canDrawEquipmentTen = computed(() => !isBusy.value && state.value.gems >= EQUIPMENT_SINGLE_COST * 10)

let persistTimer = null
const campfireLoopRuntime = createCampfireLoopRuntimeStateByModule()
let restoreToken = 0
let campfireDragState = null
let bedroomDragState = null
let dungeonMoveLock = false

const getCampfireLayoutKey = (companion, index = 0) => {
  return getCampfireLayoutKeyByInput(companion, index)
}

const getCampfireCompanionLayout = (companion, index = 0) => {
  return getCampfireCompanionLayoutByInput({
    companion,
    index,
    layoutMap: state.value?.campfireLayout,
    defaultLayout: CAMPFIRE_DEFAULT_LAYOUT,
    clampInt,
    xMin: CAMPFIRE_LAYOUT_X_MIN,
    xMax: CAMPFIRE_LAYOUT_X_MAX,
    yMin: CAMPFIRE_LAYOUT_Y_MIN,
    yMax: CAMPFIRE_LAYOUT_Y_MAX,
  })
}

const getCamperInlineStyle = (companion, index = 0) => {
  const pos = getCampfireCompanionLayout(companion, index)
  return {
    left: `${pos.x}%`,
    top: `${pos.y}%`,
  }
}

const updateCampfireCompanionLayout = (layoutKey, x, y, persist = false) => {
  const key = String(layoutKey || '').trim().slice(0, 96)
  if (!key) return
  const nextX = clampInt(x, CAMPFIRE_LAYOUT_X_MIN, CAMPFIRE_LAYOUT_X_MAX, NaN)
  const nextY = clampInt(y, CAMPFIRE_LAYOUT_Y_MIN, CAMPFIRE_LAYOUT_Y_MAX, NaN)
  if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return
  const currentMap = state.value?.campfireLayout && typeof state.value.campfireLayout === 'object'
    ? state.value.campfireLayout
    : {}
  const previous = currentMap[key]
  if (previous && previous.x === nextX && previous.y === nextY) {
    if (persist) schedulePersist()
    return
  }
  state.value = {
    ...state.value,
    campfireLayout: {
      ...currentMap,
      [key]: { x: nextX, y: nextY },
    },
    updatedAt: persist ? Date.now() : state.value.updatedAt,
  }
  if (persist) {
    schedulePersist()
  }
}

const pruneCampfireLayoutMap = (companions) => {
  const list = Array.isArray(companions) ? companions : []
  const currentMap = state.value?.campfireLayout && typeof state.value.campfireLayout === 'object'
    ? state.value.campfireLayout
    : {}
  const { changed, nextMap } = pruneCampfireLayoutMapByInput(currentMap, list, {
    getLayoutKey: getCampfireLayoutKey,
  })
  if (!changed) return
  state.value = {
    ...state.value,
    campfireLayout: nextMap,
    updatedAt: Date.now(),
  }
  schedulePersist()
}

const removeCampfireDragListeners = () => {
  window.removeEventListener('pointermove', onCampfireDragMove)
  window.removeEventListener('pointerup', onCampfireDragEnd)
  window.removeEventListener('pointercancel', onCampfireDragCancel)
}

const stopCampfireDrag = () => {
  campfireDragState = null
  draggingCampfireKey.value = ''
  removeCampfireDragListeners()
}

const resolveCampfirePointerPercent = (clientX, clientY) => {
  return resolveCampfirePointerPercentByInput(clientX, clientY, campfireFieldRef.value)
}

const onCampfireDragMove = (event) => {
  if (!campfireDragState) return
  if (campfireDragState.pointerId !== null && event.pointerId !== campfireDragState.pointerId) return
  const point = resolveCampfirePointerPercent(event.clientX, event.clientY)
  if (!point) return
  event.preventDefault()
  const nextPos = resolveCampfireDragLayoutPointByInput(point, campfireDragState)
  if (!nextPos) return
  updateCampfireCompanionLayout(campfireDragState.layoutKey, nextPos.x, nextPos.y, false)
}

const onCampfireDragEnd = (event) => {
  if (!campfireDragState) return
  if (campfireDragState.pointerId !== null && event.pointerId !== campfireDragState.pointerId) return
  const point = resolveCampfirePointerPercent(event.clientX, event.clientY)
  if (point) {
    const nextPos = resolveCampfireDragLayoutPointByInput(point, campfireDragState)
    if (nextPos) {
      updateCampfireCompanionLayout(campfireDragState.layoutKey, nextPos.x, nextPos.y, true)
    } else {
      schedulePersist()
    }
  } else {
    schedulePersist()
  }
  stopCampfireDrag()
}

const onCampfireDragCancel = () => {
  if (!campfireDragState) return
  updateCampfireCompanionLayout(
    campfireDragState.layoutKey,
    campfireDragState.startX,
    campfireDragState.startY,
    true,
  )
  stopCampfireDrag()
}

const startCampfireDrag = (event, companion, index = 0) => {
  if (!event || !companion) return
  if (typeof event.button === 'number' && event.button !== 0) return
  const layoutKey = getCampfireLayoutKey(companion, index)
  const current = getCampfireCompanionLayout(companion, index)
  const pointerPoint = resolveCampfirePointerPercent(event.clientX, event.clientY)
  if (!pointerPoint) return
  const nextDragState = createCampfireDragStateByInput(event, layoutKey, current, pointerPoint)
  if (!nextDragState) return
  campfireDragState = nextDragState
  draggingCampfireKey.value = layoutKey
  updateCampfireCompanionLayout(layoutKey, current.x, current.y, false)
  removeCampfireDragListeners()
  window.addEventListener('pointermove', onCampfireDragMove, { passive: false })
  window.addEventListener('pointerup', onCampfireDragEnd, { passive: false })
  window.addEventListener('pointercancel', onCampfireDragCancel, { passive: false })
  if (typeof event.preventDefault === 'function') {
    event.preventDefault()
  }
}

const schedulePersist = () => {
  if (persistTimer) {
    clearTimeout(persistTimer)
  }
  persistTimer = setTimeout(() => {
    persistTimer = null
    const targetKey = storageScopeKey.value
    const payload = buildPersistPayload({
      state: state.value,
      normalizeState,
      now: Date.now,
    })
    void kvStorage.set(targetKey, payload)
  }, 160)
}

const pushLogs = (lines) => {
  const normalized = (Array.isArray(lines) ? lines : [lines])
    .map((line) => String(line || '').trim())
    .filter(Boolean)
  if (normalized.length === 0) return
  state.value = normalizeState({
    ...state.value,
    logs: [...state.value.logs, ...normalized].slice(-MAX_LOG_COUNT),
    updatedAt: Date.now(),
  })
  schedulePersist()
}

const trimText = (value, maxLen = 80) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLen)

const loadActiveWorldBookSnapshot = async () => {
  return loadActiveWorldBookSnapshotByRuntime({
    externalBook: props.worldBook && typeof props.worldBook === 'object' ? props.worldBook : null,
    loadWorldBooks,
    getActiveWorldBookId,
    trimText,
    resolveClassicRole,
    maxTeammateCount: MAX_TEAMMATE_COUNT,
    logger: console,
  })
}

const buildWorldBookCharacterSignature = (characters) => {
  return buildWorldBookCharacterSignatureByRuntime(characters, {
    trimText,
    hintLimit: 120,
    maxLength: 4000,
  })
}

const buildWorldBookTeammates = (characters, previousTeammates = []) => {
  return buildWorldBookTeammatesByRuntime(characters, previousTeammates, {
    normalizeTeammate,
    resolveClassicRole,
    clampInt,
    maxTeammateCount: MAX_TEAMMATE_COUNT,
    buildDefaultTeammates: () => buildDefaultState().teammates,
  })
}

const buildFallbackCampfireCompanions = (snapshot = null, teammateList = []) => {
  return buildFallbackCampfireCompanionsByRuntime(snapshot, teammateList, {
    normalizeCampfireCompanion,
    resolveClassicRole,
    pickCampfireActionByHint,
    defaultCampfireNames: DEFAULT_CAMPFIRE_NAMES,
    roleFallbackList: ROLE_FALLBACK_LIST,
    styleList: CAMPFIRE_STYLE_LIST,
    paletteList: CAMPFIRE_PALETTE_LIST,
    actionList: CAMPFIRE_ACTION_LIST,
    maxCampfireCompanions: MAX_CAMPFIRE_COMPANIONS,
  })
}

const calcTargetCampfireCompanionCount = (worldCharacters, fallbackList = []) => {
  return calcTargetCampfireCompanionCountByRuntime(worldCharacters, fallbackList, {
    maxCampfireCompanions: MAX_CAMPFIRE_COMPANIONS,
    defaultCampfireNames: DEFAULT_CAMPFIRE_NAMES,
  })
}

const mergeGeneratedCompanions = (generatedList, characters, fallbackList) => {
  return mergeGeneratedCompanionsByRuntime(generatedList, characters, fallbackList, {
    normalizeCampfireCompanionList,
    normalizeCampfireCompanion,
    resolveClassicRole,
    pickCampfireActionByHint,
    styleList: CAMPFIRE_STYLE_LIST,
    paletteList: CAMPFIRE_PALETTE_LIST,
  })
}

const applyCompanionRolesToTeammates = (teammateList, companionList) => {
  return applyCompanionRolesToTeammatesByRuntime(teammateList, companionList, {
    normalizeTeammate,
    normalizeCampfireCompanionList,
    resolveClassicRole,
    maxTeammateCount: MAX_TEAMMATE_COUNT,
  })
}

const ensureCampfireCompanions = async (forceRegenerate = false) => {
  if (campfireCasting.value) return

  campfireCasting.value = true
  try {
    const normalizedState = normalizeState(state.value)
    const result = await resolveCampfireCompanionsState({
      forceRegenerate,
      normalizedState,
      loadWorldSnapshot: loadActiveWorldBookSnapshot,
      buildWorldBookCharacterSignature,
      buildWorldBookTeammates,
      buildFallbackCampfireCompanions,
      calcTargetCampfireCompanionCount,
      normalizeCampfireCompanionList,
      mergeGeneratedCompanions,
      applyCompanionRolesToTeammates,
      requestCampfireCompanions: generateHandheldCampfireCompanions,
      maxCampfireLlmCount: MAX_CAMPFIRE_LLM_COUNT,
      maxCampfireCompanions: MAX_CAMPFIRE_COMPANIONS,
    })

    state.value = normalizeState({
      ...normalizedState,
      teammates: result.teammatesWithCompanionRoles,
      worldBookId: result.worldSnapshot.worldBookId,
      worldBookCharacterSignature: result.worldSignature,
      campfireCompanions: result.nextCompanions,
      updatedAt: Date.now(),
    })
    schedulePersist()
  } catch (e) {
    console.error('[xx-dungeon] campfire companions init failed:', e)
  } finally {
    campfireCasting.value = false
  }
}

const buildCampfireBubbleFallbackLine = (companion) => {
  const line = pickRandomItem(LOCAL_BANTER_LINES, '篝火很暖和，继续前进吧。')
  return String(line || '篝火很暖和，继续前进吧。').trim().slice(0, 40)
}

const generateCampfireBubbleLine = async (companion) => {
  if (!companion) return buildCampfireBubbleFallbackLine(companion)
  const result = await generateHandheldDungeonBanter({
    teammateName: companion.name,
    teammateRole: companion.role || '冒险者',
    teammateRarity: 'SR',
    floor: state.value.floor,
    scene: '篝火营地',
    moodHint: '在篝火边与队友闲聊，简短自然',
    options: {
      temperature: 0.88,
      maxTokens: 90,
    },
  })

  if (result?.success && result.line) {
    return String(result.line).trim().slice(0, 40)
  }
  return buildCampfireBubbleFallbackLine(companion)
}

const shouldRunCampfireBubbleLoop = () => {
  return shouldRunCampfireBubbleLoopByLoopRuntime({
    panelOpen: panelOpen.value,
    currentView: currentView.value,
    companionCount: campfireCompanions.value.length,
  })
}

const resetCampfireBubbleState = () => {
  campfireRotateCursor.value = 0
  campfireSpeakerCursor.value = 0
  activeCampfireBubble.value = createEmptyCampfireBubbleByLoopRuntime()
}

const stopCampfireBubbleLoop = () => {
  stopCampfireBubbleLoopByLoopRuntime(campfireLoopRuntime, {
    onStop: () => {
      activeCampfireBubble.value = createEmptyCampfireBubbleByLoopRuntime()
    },
  })
}

const rotateCampfireBubbleOnce = async () => {
  if (campfireLoopRuntime.bubbleBusy || !shouldRunCampfireBubbleLoop()) return
  const list = campfireCompanions.value
  if (!Array.isArray(list) || list.length === 0) {
    activeCampfireBubble.value = createEmptyCampfireBubbleByLoopRuntime()
    return
  }

  campfireLoopRuntime.bubbleBusy = true
  try {
    const speakerIndex = resolveCampfireSpeakerIndexByLoopRuntime(campfireSpeakerCursor.value, list.length)
    const speaker = list[speakerIndex]
    campfireRotateCursor.value = speakerIndex
    const line = await generateCampfireBubbleLine(speaker)
    activeCampfireBubble.value = {
      companionId: speaker.id,
      text: trimText(line, 42),
    }
    campfireSpeakerCursor.value = (speakerIndex + 1) % list.length
  } catch (e) {
    console.error('[xx-dungeon] campfire bubble failed:', e)
  } finally {
    campfireLoopRuntime.bubbleBusy = false
  }
}

const startCampfireBubbleLoop = () => {
  startCampfireBubbleLoopByLoopRuntime(campfireLoopRuntime, {
    shouldRun: shouldRunCampfireBubbleLoop,
    rotateOnce: rotateCampfireBubbleOnce,
    intervalMs: CAMPFIRE_BUBBLE_INTERVAL_MS,
    bootDelayMs: CAMPFIRE_BUBBLE_BOOT_DELAY_MS,
  })
}

const syncCampfireBubbleLoop = () => {
  if (shouldRunCampfireBubbleLoop()) {
    startCampfireBubbleLoop()
    return
  }
  stopCampfireBubbleLoop()
}

const shouldRunCampfireFrameLoop = () => shouldRunCampfireFrameLoopByLoopRuntime({
  panelOpen: panelOpen.value,
  currentView: currentView.value,
})

const stopCampfireFrameLoop = () => {
  stopCampfireFrameLoopByLoopRuntime(campfireLoopRuntime)
}

const startCampfireFrameLoop = () => {
  startCampfireFrameLoopByLoopRuntime(campfireLoopRuntime, {
    shouldRun: shouldRunCampfireFrameLoop,
    onTick: () => {
      campfireFrameTick.value = (campfireFrameTick.value + 1) % 2
    },
    intervalMs: 720,
  })
}

const syncCampfireHomeLoops = () => {
  syncCampfireBubbleLoop()
  if (shouldRunCampfireFrameLoop()) {
    startCampfireFrameLoop()
    return
  }
  stopCampfireFrameLoop()
}

const openView = (view) => {
  const target = typeof view === 'string' ? view.trim().toLowerCase() : 'home'
  if (!Object.prototype.hasOwnProperty.call(VIEW_LABELS, target)) {
    currentView.value = 'home'
    return
  }
  currentView.value = target
  if (target === 'dungeon' || target === 'tent') {
    nextTick(() => {
      scrollLogToTop()
    })
  }
}

const togglePanel = () => {
  const next = !panelOpen.value
  panelOpen.value = next
  if (next) {
    currentView.value = 'home'
    void ensureCampfireCompanions()
  }
}

const closePanel = () => {
  stopCampfireDrag()
  stopBedroomDrag()
  stopCampfireBubbleLoop()
  stopCampfireFrameLoop()
  campfireFrameTick.value = 0
  resetCampfireBubbleState()
  selectedBedroomFurnitureId.value = ''
  panelOpen.value = false
  currentView.value = 'home'
}

const restoreState = async (targetKey = storageScopeKey.value) => {
  const ticket = ++restoreToken
  const restored = await restoreStateSnapshot({
    storage: kvStorage,
    key: targetKey,
    normalizeState,
    buildDefaultState,
  })
  if (ticket !== restoreToken) return
  if (restored.error) {
    console.error('[xx-dungeon] restore failed:', restored.error)
  }
  state.value = restored.state
  campfireFrameTick.value = 0
  resetCampfireBubbleState()
}

const rollEquipmentRarity = (pity, ensureSr = false) => {
  return rollEquipmentRarityByProgression(pity, ensureSr, {
    pityLimit: EQUIPMENT_PITY_LIMIT,
    randomFn: Math.random,
  })
}

const drawEquipmentOne = (pity, ensureSr = false) => {
  return drawEquipmentOneByProgression(pity, ensureSr, {
    pityLimit: EQUIPMENT_PITY_LIMIT,
    equipmentPool: EQUIPMENT_POOL,
    pickRandomItem,
    normalizeEquipment: (item) => normalizeEquipment(item, 0),
    makeId,
    randomInt,
    rollRarity: (rawPity, rawEnsureSr) => rollEquipmentRarity(rawPity, rawEnsureSr),
  })
}

const promoteByExp = (targetState) => {
  return promoteByExpByProgression(targetState, {
    needExpByLevel,
  })
}

function createEnemyByFloor(floor, isBoss = false) {
  return createEnemyByFloorByProgression(floor, isBoss)
}

const createLocalScene = (targetState, eventTypeHint) => {
  return createLocalSceneByRuntime(targetState, eventTypeHint, {
    sceneLibrary: LOCAL_SCENE_LIBRARY,
    pickRandomItem,
    createEnemyByFloor,
    randomFn: Math.random,
  })
}

const tryBuildLootAsEquipment = (lootRaw) => {
  return tryBuildLootAsEquipmentByRuntime(lootRaw, {
    normalizeSlot,
    normalizeRarity,
    normalizeEquipment: (item) => normalizeEquipment(item, 0),
    makeId,
    pickRandomItem,
    clampInt,
    randomInt,
  })
}

const loadDungeonScene = async (targetState) => {
  const result = await loadDungeonSceneWithFallback({
    targetState,
    activeParty: dungeonActiveParty.value,
    requestDungeonScene: generateHandheldDungeonScene,
    createLocalScene,
    tryBuildLootAsEquipment,
    clampInt,
    logger: console,
  })
  if (result.errorMessage) {
    errorText.value = result.errorMessage
  }
  return result.scene
}

const applyExploreResult = (targetState, scene) => {
  return applyExploreResultToState(targetState, scene, {
    normalizeState,
    createEnemyByFloor,
    calcTotalPower,
    randomInt,
    clampInt,
    promoteByExp,
    drawEquipmentOne,
    maxEquipmentCount: MAX_EQUIPMENT_COUNT,
    rollDungeonResourceDrops,
    mergeBackpackItems,
    formatEnemyDropText,
    randomFn: Math.random,
  })
}

const drawEquipment = async (count = 1) => {
  if (drawing.value || loading.value || banterLoading.value) return
  errorText.value = ''

  const drawCount = count === 10 ? 10 : 1
  const cost = EQUIPMENT_SINGLE_COST * drawCount
  if (state.value.gems < cost) {
    errorText.value = '星钻不足，无法抽取装备'
    return
  }

  drawing.value = true
  try {
    const next = normalizeState(state.value)
    next.gems -= cost
    let pity = next.equipmentPity
    let hasSrOrAbove = false
    const results = []

    for (let index = 0; index < drawCount; index += 1) {
      const ensureSr = drawCount === 10 && index === drawCount - 1 && !hasSrOrAbove
      const drawn = drawEquipmentOne(pity, ensureSr)
      pity = drawn.nextPity
      if (drawn.equipment.rarity !== 'R') {
        hasSrOrAbove = true
      }
      results.push(drawn.equipment)
    }

    next.equipmentPity = pity
    next.equipments = [...next.equipments, ...results].slice(-MAX_EQUIPMENT_COUNT)
    state.value = normalizeState(next)
    pushLogs(`装备抽取${drawCount === 10 ? '十连' : '单抽'}：${results.map((item) => `${item.name}(${item.rarity})`).join('、')}`)
  } catch (e) {
    console.error('[xx-dungeon] draw equipment failed:', e)
    errorText.value = '装备抽取失败，请稍后重试'
  } finally {
    drawing.value = false
  }
}

// 商人相关功能
const merchantSellEquipments = computed(() => {
  const list = Array.isArray(state.value?.equipments) ? state.value.equipments : []
  return list
    .map((item, index) => normalizeEquipment(item, index))
    .filter(Boolean)
    .map((item) => {
      const originalPrice = clampInt(item.basePrice, 1, 99999, estimateEquipmentBasePrice(item))
      const range = buildMerchantSellPriceRange(originalPrice, {
        discountMin: MERCHANT_SELL_DISCOUNT_MIN,
        discountMax: MERCHANT_SELL_DISCOUNT_MAX,
      })
      return {
        ...item,
        originalPrice,
        sellPriceMin: range.min,
        sellPriceMax: range.max,
      }
    })
    .sort((a, b) => {
      if (b.originalPrice !== a.originalPrice) return b.originalPrice - a.originalPrice
      if (b.score !== a.score) return b.score - a.score
      return String(a.id).localeCompare(String(b.id))
    })
})

const loadMerchantItems = async () => {
  const result = await loadMerchantItemsFromStorage({
    storage: kvStorage,
    storageKey: MERCHANT_STORAGE_KEY,
    normalizeItems: normalizeMerchantItems,
  })
  if (result.error) {
    console.error('[xx-dungeon] load merchant items failed:', result.error)
  }
  if (result.items.length > 0) {
    merchantItems.value = result.items
    return
  }
  // 如果没有存储的商品，生成默认商品
  await generateNewMerchantItems(true)
}

const saveMerchantItems = async () => {
  const result = await saveMerchantItemsToStorage({
    storage: kvStorage,
    storageKey: MERCHANT_STORAGE_KEY,
    items: merchantItems.value,
  })
  if (!result.ok) {
    console.error('[xx-dungeon] save merchant items failed:', result.error)
  }
}

// 刷新商品：从本地数据库重新加载（免费）
const refreshMerchantItems = async () => {
  if (merchantLoading.value) return
  merchantLoading.value = true
  errorText.value = ''

  try {
    const result = await loadMerchantItemsFromStorage({
      storage: kvStorage,
      storageKey: MERCHANT_STORAGE_KEY,
      normalizeItems: normalizeMerchantItems,
    })
    if (result.error) {
      throw result.error
    }
    if (result.items.length > 0) {
      merchantItems.value = result.items
      pushLogs('流浪商人展示了他的商品')
    } else {
      // 如果本地没有商品，提示用户获取新商品
      errorText.value = '暂无商品，请点击"获取新商品"'
    }
  } catch (e) {
    console.error('[xx-dungeon] refresh merchant items failed:', e)
    errorText.value = '加载商品失败，请稍后重试'
  } finally {
    merchantLoading.value = false
  }
}

// 获取新商品：调用LLM生成并保存到本地数据库（花费金币）
const generateNewMerchantItems = async (isFree = false) => {
  if (merchantLoading.value) return
  merchantLoading.value = true
  merchantRestockModal.value = true  // 显示进货弹窗
  errorText.value = ''

  try {
    // 检查金币是否足够（首次免费）
    if (!isFree && state.value.coins < MERCHANT_REFRESH_COST) {
      errorText.value = `金币不足，需要${MERCHANT_REFRESH_COST}金币获取新商品`
      merchantLoading.value = false
      merchantRestockModal.value = false  // 关闭弹窗
      return
    }

    // 扣除刷新费用（首次免费）
    if (!isFree) {
      const next = normalizeState(state.value)
      next.coins -= MERCHANT_REFRESH_COST
      state.value = next
    }

    const generation = await generateMerchantItemsWithFallback({
      floor: state.value.floor,
      teammates: state.value.teammates,
      equipmentPity: state.value.equipmentPity,
      maxItems: MAX_MERCHANT_ITEMS,
      equipmentPool: EQUIPMENT_POOL,
      rollEquipmentRarity,
      pickRandomItem,
      makeId,
      rarityValue,
      normalizeMerchantItem,
      loadWorldSnapshot: loadActiveWorldBookSnapshot,
      requestLlmMerchantItems: generateMerchantItems,
      logger: console,
    })
    const newItems = generation.items
    const usedLLM = generation.usedLLM

    merchantItems.value = newItems
    await saveMerchantItems()
    
    if (isFree) {
      pushLogs('流浪商人带来了新商品')
    } else if (usedLLM) {
      pushLogs(`流浪商人带来了新商品（LLM生成），花费${MERCHANT_REFRESH_COST}金币`)
    } else {
      pushLogs(`流浪商人带来了新商品（本地生成），花费${MERCHANT_REFRESH_COST}金币`)
    }
  } catch (e) {
    console.error('[xx-dungeon] generate new merchant items failed:', e)
    errorText.value = '获取新商品失败，请稍后重试'
  } finally {
    merchantLoading.value = false
    merchantRestockModal.value = false  // 关闭弹窗
  }
}

// 关闭商人进货弹窗
const closeMerchantRestockModal = () => {
  if (!merchantLoading.value) {
    merchantRestockModal.value = false
  }
}

const buyMerchantItem = async (item) => {
  if (!item || !item.id) return
  if (merchantLoading.value) return
  errorText.value = ''

  const price = clampInt(item.price, 1, 99999, 50)
  if (state.value.coins < price) {
    errorText.value = `金币不足，需要${price}金币购买${item.name}`
    return
  }

  merchantLoading.value = true
  try {
    const transaction = applyMerchantPurchase({
      targetState: state.value,
      item,
      price,
      normalizeState,
      normalizeEquipment,
      makeId,
      maxEquipmentCount: MAX_EQUIPMENT_COUNT,
    })
    if (!transaction.ok) {
      if (transaction.error === 'insufficient_coins') {
        errorText.value = `金币不足，需要${price}金币购买${item.name}`
      } else {
        errorText.value = '购买失败，请稍后重试'
      }
      return
    }

    state.value = transaction.nextState

    // 从商品列表移除已购买的商品
    merchantItems.value = merchantItems.value.filter((i) => i.id !== item.id)
    await saveMerchantItems()
    
    pushLogs(`从流浪商人购买了${item.name}(${item.rarity})，花费${price}金币`)
  } catch (e) {
    console.error('[xx-dungeon] buy merchant item failed:', e)
    errorText.value = '购买失败，请稍后重试'
  } finally {
    merchantLoading.value = false
  }
}

const sellMerchantEquipment = async (item) => {
  if (!item || !item.id) return
  if (merchantLoading.value) return
  errorText.value = ''

  merchantLoading.value = true
  try {
    const transaction = applyMerchantSell({
      targetState: state.value,
      itemId: item.id,
      normalizeState,
      estimateEquipmentBasePrice,
      discountMin: MERCHANT_SELL_DISCOUNT_MIN,
      discountMax: MERCHANT_SELL_DISCOUNT_MAX,
      randomInt,
    })
    if (!transaction.ok) {
      errorText.value = '该装备不存在或已卖出'
      return
    }

    const { target, originalPrice, discountPercent, sellPrice, unequippedTargets } = transaction
    state.value = normalizeState({
      ...transaction.nextState,
      updatedAt: Date.now(),
    })

    if (selectedEquipItem.value?.id === target.id) {
      selectedEquipItem.value = null
    }

    const extra = unequippedTargets.length > 0 ? `，自动卸下：${unequippedTargets.join('、')}` : ''
    pushLogs(`向流浪商人卖出${target.name}，原价${originalPrice}金币，折价${discountPercent}%后获得${sellPrice}金币${extra}`)
    errorText.value = `已卖出${target.name}，获得${sellPrice}金币（-${discountPercent}%）`
  } catch (e) {
    console.error('[xx-dungeon] sell merchant equipment failed:', e)
    errorText.value = '卖出失败，请稍后重试'
  } finally {
    merchantLoading.value = false
  }
}

const merchantSpriteSrc = computed(() => getMerchantSpriteSrc())

const buildDungeonMapForFloor = async (targetState) => {
  return buildDungeonMapForFloorWithFallback({
    targetState,
    normalizeState,
    buildFallbackMap: buildGuaranteedLocalDungeonMap,
    loadWorldSnapshot: loadActiveWorldBookSnapshot,
    partyMembers: dungeonActiveParty.value,
    requestDungeonMap: generateHandheldDungeonMap,
    normalizeDungeonMap,
    isDungeonMapUsable,
    mapSizeHintMin: DUNGEON_MAP_MIN_SIZE,
    mapSizeHintMax: DUNGEON_MAP_MAX_SIZE,
    logger: console,
  })
}

const tryGrantDungeonEquipmentDrop = (targetState, chance = 0.16) => {
  if (Math.random() > chance) return null
  const drawn = drawEquipmentOne(targetState.equipmentPity, false)
  targetState.equipmentPity = drawn.nextPity
  targetState.equipments = [...targetState.equipments, drawn.equipment].slice(-MAX_EQUIPMENT_COUNT)
  return drawn.equipment
}

const applyPartyWipePenalty = (targetState) => {
  if (targetState?.debugNoDamage) {
    targetState.hp = targetState.maxHp
    return { coinLoss: 0, gemLoss: 0 }
  }
  const coinLoss = Math.min(targetState.coins, Math.round(targetState.coins * 0.3))
  const gemLoss = Math.min(targetState.gems, Math.round(targetState.gems * 0.15))
  targetState.coins -= coinLoss
  targetState.gems -= gemLoss
  targetState.hp = 0
  return { coinLoss, gemLoss }
}

const healToFullDebug = () => {
  const next = normalizeState(state.value)
  next.hp = next.maxHp
  syncPartyMemberHpMapByGlobalHp(next)
  state.value = normalizeState({
    ...next,
    updatedAt: Date.now(),
  })
  errorText.value = 'Debug：已回满血'
  pushLogs('Debug指令：队伍生命已回满。')
}

const toggleDebugNoDamage = () => {
  if (isBusy.value) return
  const next = normalizeState(state.value)
  next.debugNoDamage = !next.debugNoDamage
  if (next.debugNoDamage) {
    next.hp = next.maxHp
    syncPartyMemberHpMapByGlobalHp(next)
  }
  state.value = normalizeState({
    ...next,
    updatedAt: Date.now(),
  })
  const actionText = next.debugNoDamage ? '开启' : '关闭'
  errorText.value = `Debug免伤已${actionText}`
  pushLogs(`Debug指令：免伤模式已${actionText}。`)
}

const advanceDungeon = async () => {
  if (isBusy.value) return
  errorText.value = ''
  if (state.value.hp <= 0) {
    errorText.value = '队伍已阵亡，请先休整或重置进度'
    return
  }

  if (!hasDungeonMap.value) {
    const generated = await generateDungeonEncounterBoard()
    if (!generated) return
    return
  }

  const map = activeDungeonMap.value
  if (!map) return

  if (countDungeonEnemyRemainingByMap(map) <= 0) {
    enterNextDungeonFloor(state.value)
    return
  }
  if (dungeonManualMoveEnabled.value) {
    errorText.value = '请使用键盘方向键移动队长，进入怪物格会自动触发战斗'
    return
  }

  const nextState = normalizeState(state.value)
  const nextMap = cloneDungeonMapState(map)
  if (!nextMap) return
  const targetIndex = findNextDungeonEncounterIndex(nextMap)
  if (targetIndex < 0) {
    enterNextDungeonFloor(nextState)
    return
  }

  const targetCell = nextMap.cells[targetIndex]
  nextMap.player = {
    x: clampInt(targetCell?.x, 0, Math.max(0, nextMap.width - 1), nextMap?.player?.x || 0),
    y: clampInt(targetCell?.y, 0, Math.max(0, nextMap.height - 1), nextMap?.player?.y || 0),
  }
  targetCell.discovered = true
  const result = resolveDungeonBattleAtCell(nextState, nextMap, targetCell, targetIndex)
  finalizeDungeonStepState(nextState, nextMap, result.isPartyWiped)
  state.value = normalizeState({
    ...nextState,
    updatedAt: Date.now(),
  })
  const logs = [...result.logs]
  if (!result.isPartyWiped && countDungeonEnemyRemainingByMap(nextMap) <= 0) {
    logs.push('本层敌群已清空，再次点击“前进”进入下一层。')
  }
  if (logs.length > 0) {
    pushLogs(logs)
  }
  errorText.value = result.isPartyWiped ? '队伍已阵亡，请先休整或重置进度' : ''
}

const teammateBanter = async () => {
  if (isBusy.value) return
  const speaker = pickRandomItem(dungeonActiveParty.value, null)
  if (!speaker) {
    errorText.value = '队伍为空，请先在世界书中添加角色'
    return
  }

  errorText.value = ''
  banterLoading.value = true
  try {
    let line = ''
    const result = await generateHandheldDungeonBanter({
      teammateName: speaker.name,
      teammateRole: speaker.role,
      teammateRarity: speaker.rarity,
      floor: state.value.floor,
      scene: state.value.lastScene,
      moodHint: hpPercent.value <= 35 ? '危险但嘴硬' : '状态不错，带点吐槽',
    })

    if (result?.success && result.line) {
      line = String(result.line).trim().slice(0, 72)
    } else {
      if (result?.error) {
        errorText.value = `${result.error}，已使用本地吐槽`
      }
      line = pickRandomItem(LOCAL_BANTER_LINES, '前面肯定有宝箱，冲。')
    }

    const text = `${speaker.name}：${line}`
    state.value = normalizeState({
      ...state.value,
      lastBanter: text,
      updatedAt: Date.now(),
    })
    pushLogs(text)
  } catch (e) {
    console.error('[xx-dungeon] banter failed:', e)
    errorText.value = '队友吐槽失败，稍后再试'
  } finally {
    banterLoading.value = false
  }
}

const restAtCamp = async () => {
  if (isBusy.value) return
  errorText.value = ''

  try {
    const next = normalizeState(state.value)
    const beforeHp = next.hp
    const healBase = Math.max(22, Math.round(next.maxHp * 0.3))
    next.hp = Math.min(next.maxHp, next.hp + healBase)
    const healed = Math.max(0, next.hp - beforeHp)
    const gainCoins = randomInt(30, 105)
    const gainGems = randomInt(5, 16)
    const gainExp = randomInt(9, 24)
    next.coins += gainCoins
    next.gems += gainGems
    next.exp += gainExp
    const levelUps = promoteByExp(next)
    syncPartyMemberHpMapByGlobalHp(next)
    state.value = normalizeState(next)

    const logs = [
      healed > 0
        ? `营地休息完成，恢复 ${healed} 点生命。`
        : '营地休息完成，状态已满。',
      `补给收益：+${gainCoins} 金币 / +${gainGems} 星钻 / +${gainExp} EXP。`,
    ]
    if (levelUps > 0) {
      logs.push(`休整后突破，当前 Lv.${state.value.level}。`)
    }
    pushLogs(logs)
  } catch (e) {
    console.error('[xx-dungeon] rest failed:', e)
    errorText.value = '休息失败，请稍后重试'
  }
}

const resetRun = async () => {
  if (isBusy.value) return
  errorText.value = ''
  const preservedTeammates = (Array.isArray(state.value.teammates) ? state.value.teammates : [])
    .map((item, index) => normalizeTeammate(item, index))
    .filter(Boolean)
    .slice(0, MAX_TEAMMATE_COUNT)
  const preservedCompanions = normalizeCampfireCompanionList(state.value.campfireCompanions)
  const preservedCampfireLayout = normalizeCampfireLayoutMap(state.value.campfireLayout)
  state.value = normalizeState({
    ...buildDefaultState(),
    worldBookId: state.value.worldBookId,
    worldBookCharacterSignature: state.value.worldBookCharacterSignature,
    teammates: preservedTeammates.length > 0 ? preservedTeammates : buildDefaultState().teammates,
    campfireCompanions: preservedCompanions,
    campfireLayout: preservedCampfireLayout,
    updatedAt: Date.now(),
  })
  resetCampfireBubbleState()
  schedulePersist()
  currentView.value = 'home'
  if (preservedCompanions.length < 1) {
    void ensureCampfireCompanions()
  }
}

const scrollLogToTop = () => {
  const root = logListRef.value
  if (!root) return
  root.scrollTop = 0
}

const shouldSyncLogScroll = () => panelOpen.value && (currentView.value === 'dungeon' || currentView.value === 'tent')

watch(panelOpen, (open) => {
  if (!open) {
    stopCampfireDrag()
    stopBedroomDrag()
  }
  if (open && shouldSyncLogScroll()) {
    nextTick(() => {
      scrollLogToTop()
    })
  }
  syncCampfireHomeLoops()
})

watch(currentView, () => {
  if (currentView.value !== 'bedroom') {
    stopBedroomDrag()
  }
  if (shouldSyncLogScroll()) {
    nextTick(() => {
      scrollLogToTop()
    })
  }
  syncCampfireHomeLoops()
})

watch([panelOpen, currentView, hasDungeonMap, bedroomFurnitureCount], () => {
  nextTick(() => {
    syncDungeonMapViewport()
    syncBedroomViewport()
  })
}, { immediate: true })

watch(recentLogs, () => {
  if (shouldSyncLogScroll()) {
    nextTick(() => {
      scrollLogToTop()
    })
  }
})

watch(dungeonActiveParty, (members) => {
  const list = Array.isArray(members) ? members : []
  if (list.length === 0) {
    selectedPartyMemberId.value = ''
    return
  }
  if (!list.some((item) => item.id === selectedPartyMemberId.value)) {
    selectedPartyMemberId.value = String(list[0].id)
  }
}, { immediate: true })

watch(bedroomFurnitureRenderList, (list) => {
  const source = Array.isArray(list) ? list : []
  if (source.length < 1) {
    selectedBedroomFurnitureId.value = ''
    return
  }
  if (!source.some((item) => item.id === selectedBedroomFurnitureId.value)) {
    selectedBedroomFurnitureId.value = source[source.length - 1].id
  }
}, { immediate: true })

watch(campfireCompanionSignature, () => {
  const list = campfireCompanions.value
  pruneCampfireLayoutMap(list)
  if (list.length === 0) {
    resetCampfireBubbleState()
    stopCampfireBubbleLoop()
    return
  }
  if (campfireSpeakerCursor.value >= list.length) {
    campfireSpeakerCursor.value = 0
  }
  if (campfireRotateCursor.value >= list.length) {
    campfireRotateCursor.value = 0
  }
  syncCampfireHomeLoops()
  if (shouldRunCampfireBubbleLoop() && !activeCampfireBubble.value.companionId) {
    void rotateCampfireBubbleOnce()
  }
})

watch(storageScopeKey, async (nextKey, prevKey) => {
  if (!nextKey || nextKey === prevKey) return

  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (prevKey) {
    const result = await persistStateSnapshot({
      storage: kvStorage,
      key: prevKey,
      state: state.value,
      normalizeState,
      now: Date.now,
    })
    if (!result.ok) {
      console.error('[xx-dungeon] persist previous scope failed:', result.error)
    }
  }

  stopCampfireDrag()
  stopBedroomDrag()
  stopCampfireBubbleLoop()
  stopCampfireFrameLoop()
  await restoreState(nextKey)
  void ensureCampfireCompanions(true)
  syncCampfireHomeLoops()
})

onMounted(async () => {
  android.value = isAndroid()
  syncDungeonMapViewport()
  syncBedroomViewport()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleDungeonMapResize, { passive: true })
    window.addEventListener('keydown', handleDungeonKeydown)
  }
  await restoreState(storageScopeKey.value)
  void ensureCampfireCompanions()
  void loadMerchantItems()
  syncCampfireHomeLoops()
  // 全屏模式下自动打开面板
  if (props.autoOpen) {
    panelOpen.value = true
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleDungeonMapResize)
    window.removeEventListener('keydown', handleDungeonKeydown)
  }
  stopCampfireDrag()
  stopBedroomDrag()
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  stopCampfireBubbleLoop()
  stopCampfireFrameLoop()
  void persistStateSnapshot({
    storage: kvStorage,
    key: storageScopeKey.value,
    state: state.value,
    normalizeState,
    now: Date.now,
  })
})
</script>


<template src="./view/index.template.html"></template>

<style scoped src="./styles/split/index-01.css"></style>
<style scoped src="./styles/split/index-02.css"></style>
<style scoped src="./styles/split/index-03.css"></style>

