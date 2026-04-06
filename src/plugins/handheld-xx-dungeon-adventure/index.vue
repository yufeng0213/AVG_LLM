<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { kvStorage } from '../../storage/index.js'
import {
  generateHandheldCampfireCompanions,
  generateHandheldDungeonBanter,
  generateHandheldDungeonMap,
  generateHandheldDungeonScene,
} from '../../llm/index.js'
import { isAndroid } from '../../utils/platform.js'
import { getActiveWorldBookId, loadWorldBooks } from '../../worldbook/worldBookStore.js'
import { ROLE_FALLBACK_LIST, resolveClassicRole } from './logic/roleEngine.js'
import {
  createDungeonMapRuntime,
  DUNGEON_MAP_MAX_SIZE,
  DUNGEON_MAP_MIN_SIZE,
  DUNGEON_TILE_BOSS,
  DUNGEON_TILE_MONSTER,
  DUNGEON_TILE_TREASURE,
} from './logic/dungeonMapEngine.js'

const props = defineProps({
  worldBook: {
    type: Object,
    default: null,
  },
  saveSlotId: {
    type: [String, Number],
    default: '',
  },
})

const STORAGE_KEY_BASE = 'handheld-xx-dungeon-adventure-state'
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

const sanitizeScopeToken = (value, fallback) => {
  const token = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 96)
  return token || fallback
}

const resolveStorageScopeKey = () => {
  const worldBookId = sanitizeScopeToken(props.worldBook?.id || 'default_world_book', 'default_world_book')
  const saveSlotId = sanitizeScopeToken(props.saveSlotId || 'global', 'global')
  return `${STORAGE_KEY_BASE}:${worldBookId}:${saveSlotId}`
}

const EQUIPMENT_POOL = {
  R: [
    { name: '铁脊短剑', slot: 'weapon', atk: 12, def: 0, hp: 0 },
    { name: '矿石战斧', slot: 'weapon', atk: 14, def: 0, hp: 0 },
    { name: '鳞片轻甲', slot: 'armor', atk: 0, def: 11, hp: 18 },
    { name: '灰土护肩', slot: 'armor', atk: 0, def: 10, hp: 20 },
    { name: '回响戒指', slot: 'relic', atk: 6, def: 5, hp: 16 },
    { name: '幸运护符', slot: 'relic', atk: 4, def: 6, hp: 20 },
  ],
  SR: [
    { name: '雷鸣重剑', slot: 'weapon', atk: 24, def: 2, hp: 8 },
    { name: '裂风长枪', slot: 'weapon', atk: 22, def: 3, hp: 10 },
    { name: '龙鳞重甲', slot: 'armor', atk: 4, def: 22, hp: 36 },
    { name: '银月板甲', slot: 'armor', atk: 3, def: 24, hp: 32 },
    { name: '星痕吊坠', slot: 'relic', atk: 14, def: 10, hp: 24 },
    { name: '回春徽章', slot: 'relic', atk: 8, def: 12, hp: 42 },
  ],
  SSR: [
    { name: '天陨之刃', slot: 'weapon', atk: 40, def: 8, hp: 18 },
    { name: '幽冥圣枪', slot: 'weapon', atk: 42, def: 7, hp: 14 },
    { name: '不落王铠', slot: 'armor', atk: 10, def: 40, hp: 70 },
    { name: '苍穹壁垒甲', slot: 'armor', atk: 8, def: 42, hp: 66 },
    { name: '命运星核', slot: 'relic', atk: 24, def: 16, hp: 52 },
    { name: '深渊圣印', slot: 'relic', atk: 20, def: 20, hp: 58 },
  ],
}

const LOCAL_BANTER_LINES = [
  '这波怪还行，至少没把我鞋踩坏。',
  '别急着冲，我的法杖还没热身完。',
  '说好是探险，怎么又是加班打工副本？',
  '前面那团雾看着不对劲，先把盾抬起来。',
  '宝箱要是空的，我要实名吐槽策划。',
  '队长，下一抽出金我就承认你是欧皇。',
]

const LOCAL_SCENE_LIBRARY = {
  battle: [
    { title: '碎石回廊', description: '阴影里传来铁靴声，巡逻怪冲了出来。', banterHint: '别省技能，快收掉。' },
    { title: '潮湿墓室', description: '青苔覆盖石砖，亡骨在角落重新拼起身形。', banterHint: '它们看起来很能扛。' },
    { title: '矿井断桥', description: '桥面半塌，敌人从两侧包夹。', banterHint: '稳住阵型，别被推下去。' },
  ],
  treasure: [
    { title: '密封藏宝间', description: '一排锁箱静置多年，似乎还能开。', banterHint: '快看看有没有值钱货。' },
    { title: '裂纹祭坛', description: '祭坛中央浮着微光，像是奖励节点。', banterHint: '这次应该不是陷阱吧？' },
  ],
  rest: [
    { title: '旧营地火盆', description: '火苗尚温，说明这里曾有人停留。', banterHint: '抓紧喘口气。' },
    { title: '温泉暗室', description: '岩缝里冒出热雾，伤势能慢慢缓解。', banterHint: '休整一下再推进。' },
  ],
  trap: [
    { title: '毒针走廊', description: '墙体机关被触发，细针成片射出。', banterHint: '这设计太恶意了。' },
    { title: '坍塌通道', description: '头顶岩块突然砸落，队伍被迫后撤。', banterHint: '先保命，别贪。' },
  ],
  boss: [
    { title: '深层王座厅', description: '黑曜石王座前，守层首领已苏醒。', banterHint: '硬仗开始了，别慌。' },
    { title: '深渊升降井', description: '机械巨像堵住去路，战斗无法回避。', banterHint: '先拆护甲，再打核心。' },
  ],
}

const panelOpen = ref(false)
const loading = ref(false)
const drawing = ref(false)
const banterLoading = ref(false)
const campfireCasting = ref(false)
const activeCampfireBubble = ref({ companionId: '', text: '' })
const campfireRotateCursor = ref(0)
const campfireSpeakerCursor = ref(0)
const campfireFrameTick = ref(0)
const errorText = ref('')
const android = ref(false)
const logListRef = ref(null)
const campfireFieldRef = ref(null)
const currentView = ref('home')
const draggingCampfireKey = ref('')
const selectedPartyMemberId = ref('')
const selectedBackpackItemKey = ref('')

const VIEW_LABELS = {
  home: '营地',
  dungeon: '地下城',
  gacha: '装备池',
  rest: '休息',
  tent: '帐篷',
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
  const normalized = {
    id: String(rawValue.id || makeId('eq')),
    name: name || `装备${index + 1}`,
    rarity,
    slot,
    atk: clampInt(rawValue.atk, 0, 999, 0),
    def: clampInt(rawValue.def, 0, 999, 0),
    hp: clampInt(rawValue.hp, 0, 9999, 0),
    desc: String(rawValue.desc || '').trim().slice(0, 40),
  }
  return {
    ...normalized,
    score: calcEquipmentScore(normalized),
  }
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

const CAMPFIRE_SPRITE_PIXEL = 2
const CAMPFIRE_SPRITE_SIZE = 16
const CAMPFIRE_SPRITE_CACHE = new Map()
const CAMPFIRE_PIXEL_PALETTES = {
  ember: { robe: '#b35943', trim: '#ffd4a8', accent: '#ff9f5f', hair: '#5f3728' },
  forest: { robe: '#477e50', trim: '#c6f1bf', accent: '#84cf7f', hair: '#2f4d33' },
  sky: { robe: '#507ebf', trim: '#c9e5ff', accent: '#8dc9ff', hair: '#3e5982' },
  violet: { robe: '#7653ba', trim: '#dccbff', accent: '#b99dff', hair: '#4d3b74' },
  sand: { robe: '#9d7d55', trim: '#f5dfbf', accent: '#e5bc84', hair: '#6b5234' },
  iron: { robe: '#6b7688', trim: '#dce5f5', accent: '#9faec5', hair: '#424c62' },
}

const createSpriteGrid = () => Array.from({ length: CAMPFIRE_SPRITE_SIZE }, () => Array(CAMPFIRE_SPRITE_SIZE).fill('.'))

const paintPixel = (grid, x, y, token) => {
  if (x < 0 || y < 0 || x >= CAMPFIRE_SPRITE_SIZE || y >= CAMPFIRE_SPRITE_SIZE) return
  grid[y][x] = token
}

const paintPoint = (grid, x, y, token) => {
  paintPixel(grid, x, y, token)
}

const paintRect = (grid, x, y, width, height, token) => {
  for (let yy = 0; yy < height; yy += 1) {
    for (let xx = 0; xx < width; xx += 1) {
      paintPixel(grid, x + xx, y + yy, token)
    }
  }
}

const paintPoints = (grid, points, token) => {
  for (const [x, y] of points) {
    paintPixel(grid, x, y, token)
  }
}

const applyCampfirePose = (grid, action, frame) => {
  const variant = frame % 2
  const legOffset = variant === 0 ? 0 : 1

  if (action === 'warm_hands') {
    paintRect(grid, 6, 7, 1, 3, 't')
    paintRect(grid, 9, 7, 1, 3, 't')
  } else if (action === 'sharpen_blade') {
    paintRect(grid, 4, 7, 1, 3, 't')
    paintRect(grid, 10, 7, 1, 3, 't')
    paintPoints(grid, [[11, 8], [12, 8], [13, 8]], 'a')
  } else if (action === 'lookout') {
    paintRect(grid, 4, 7, 1, 3, 't')
    paintRect(grid, 11, 6, 1, 3, 't')
  } else if (action === 'stretch') {
    paintRect(grid, 4, 5, 1, 3, 't')
    paintRect(grid, 11, 5, 1, 3, 't')
  } else if (action === 'cheer') {
    paintRect(grid, 5, 4, 1, 3, 't')
    paintRect(grid, 10, 4, 1, 3, 't')
  } else {
    paintRect(grid, 4, 6, 1, 3, 't')
    paintRect(grid, 11, 6, 1, 3, 't')
  }

  paintRect(grid, 6 + legOffset, 11, 1, 3, 'b')
  paintRect(grid, 8 - legOffset, 11, 1, 3, 'b')
  paintPoints(grid, [[6 + legOffset, 14], [7 + legOffset, 14], [8 - legOffset, 14], [9 - legOffset, 14]], 'b')
}

const applyCampfireStyle = (grid, style, frame) => {
  if (style === 'knight') {
    paintRect(grid, 5, 0, 6, 1, 'h')
    paintRect(grid, 5, 1, 1, 4, 'h')
    paintRect(grid, 10, 1, 1, 4, 'h')
    paintPoints(grid, [[7, 6], [8, 6]], 'a')
    return
  }
  if (style === 'mage') {
    paintRect(grid, 7, 0, 2, 1, 'a')
    paintRect(grid, 6, 1, 4, 1, 'h')
    paintRect(grid, 5, 2, 6, 1, 'h')
    paintPoints(grid, [[8, 7], [8, 8]], 'a')
    return
  }
  if (style === 'ranger') {
    paintRect(grid, 5, 1, 1, 4, 'h')
    paintRect(grid, 10, 1, 1, 4, 'h')
    paintRect(grid, 11, 8, 1, 4, 'a')
    return
  }
  if (style === 'rogue') {
    paintRect(grid, 6, 2, 4, 1, 'h')
    paintRect(grid, 5, 6, 6, 1, 'a')
    if (frame % 2 === 1) {
      paintPoint(grid, 4, 9, 'a')
      paintPoint(grid, 11, 9, 'a')
    }
    return
  }
  if (style === 'priest') {
    paintRect(grid, 4, 6, 1, 5, 't')
    paintRect(grid, 11, 6, 1, 5, 't')
    paintRect(grid, 6, 0, 4, 1, 'a')
    paintPoint(grid, 8, 8, 'a')
    return
  }
  if (style === 'alchemist') {
    paintRect(grid, 6, 1, 4, 1, 'a')
    paintRect(grid, 10, 8, 1, 2, 'a')
    paintPoint(grid, 10, 7, 't')
    return
  }
}

const buildCampfireSpriteGrid = (style, action, frame) => {
  const grid = createSpriteGrid()
  paintRect(grid, 6, 1, 4, 4, 's')
  paintRect(grid, 5, 5, 6, 6, 'r')
  paintPoints(grid, [[7, 2], [8, 2]], 'e')
  paintPoints(grid, [[6, 3], [9, 3]], 'h')
  paintPoints(grid, [[5, 5], [10, 5], [5, 10], [10, 10]], 't')
  applyCampfirePose(grid, action, frame)
  applyCampfireStyle(grid, style, frame)
  return grid
}

const resolveCampfirePixelColor = (token, paletteKey) => {
  const palette = CAMPFIRE_PIXEL_PALETTES[paletteKey] || CAMPFIRE_PIXEL_PALETTES.ember
  if (token === 's') return '#f0caa4'
  if (token === 'e') return '#1c120d'
  if (token === 'r') return palette.robe
  if (token === 't') return palette.trim
  if (token === 'a') return palette.accent
  if (token === 'h') return palette.hair
  if (token === 'b') return '#2b3145'
  return ''
}

const buildCampfireSpriteUri = (style, palette, action, frame) => {
  const grid = buildCampfireSpriteGrid(style, action, frame)
  const spriteSize = CAMPFIRE_SPRITE_SIZE * CAMPFIRE_SPRITE_PIXEL
  let rects = ''
  for (let y = 0; y < CAMPFIRE_SPRITE_SIZE; y += 1) {
    for (let x = 0; x < CAMPFIRE_SPRITE_SIZE; x += 1) {
      const token = grid[y][x]
      if (token === '.') continue
      const color = resolveCampfirePixelColor(token, palette)
      if (!color) continue
      rects += `<rect x="${x * CAMPFIRE_SPRITE_PIXEL}" y="${y * CAMPFIRE_SPRITE_PIXEL}" width="${CAMPFIRE_SPRITE_PIXEL}" height="${CAMPFIRE_SPRITE_PIXEL}" fill="${color}"/>`
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spriteSize}" height="${spriteSize}" viewBox="0 0 ${spriteSize} ${spriteSize}" shape-rendering="crispEdges">${rects}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const resolveCampfireSpriteFrame = (action, index = 0) => {
  const base = (campfireFrameTick.value + index) % 2
  if (action === 'idle' || action === 'lookout') return base
  if (action === 'warm_hands' || action === 'sharpen_blade' || action === 'stretch' || action === 'cheer') return base
  return base
}

const getCampfireSpriteSrc = (camper, index = 0) => {
  const style = CAMPFIRE_STYLE_SET.has(camper?.style) ? camper.style : CAMPFIRE_STYLE_LIST[index % CAMPFIRE_STYLE_LIST.length]
  const palette = CAMPFIRE_PALETTE_SET.has(camper?.palette) ? camper.palette : CAMPFIRE_PALETTE_LIST[index % CAMPFIRE_PALETTE_LIST.length]
  const action = CAMPFIRE_ACTION_SET.has(camper?.action) ? camper.action : CAMPFIRE_ACTION_LIST[index % CAMPFIRE_ACTION_LIST.length]
  const frame = resolveCampfireSpriteFrame(action, index)
  const cacheKey = `${style}|${palette}|${action}|${frame}`
  if (CAMPFIRE_SPRITE_CACHE.has(cacheKey)) {
    return CAMPFIRE_SPRITE_CACHE.get(cacheKey)
  }
  const uri = buildCampfireSpriteUri(style, palette, action, frame)
  CAMPFIRE_SPRITE_CACHE.set(cacheKey, uri)
  return uri
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
  return clampInt(Math.round(90 + level * 10 + power * 2.4), 1, 999999, 120)
}

const normalizeConsumableEffectType = (rawValue, fallback = 'heal_hp') => {
  const text = String(rawValue || '').trim().toLowerCase()
  if (text === 'heal_hp' || text === 'heal' || text === 'hp' || text === 'recover') return 'heal_hp'
  return fallback
}

const normalizeConsumableTarget = (rawValue, fallback = 'ally') => {
  const text = String(rawValue || '').trim().toLowerCase()
  if (text === 'ally') return 'ally'
  return fallback
}

const buildBackpackStackKey = (item) => {
  const effectType = normalizeConsumableEffectType(item?.effectType, 'heal_hp')
  const target = normalizeConsumableTarget(item?.target, 'ally')
  const value = clampInt(item?.value, 1, 9999, 20)
  const name = String(item?.name || '').trim().slice(0, 24) || '回复道具'
  return `${name}|${effectType}|${target}|${value}`
}

const normalizeBackpackItem = (rawValue, index = 0) => {
  if (!rawValue || typeof rawValue !== 'object') return null
  const effectType = normalizeConsumableEffectType(rawValue.effectType || rawValue.type || rawValue.effect, 'heal_hp')
  const target = normalizeConsumableTarget(rawValue.target || rawValue.targetType, 'ally')
  const value = clampInt(rawValue.value ?? rawValue.effectValue ?? rawValue.hp, 1, 9999, 20)
  const amount = clampInt(rawValue.amount ?? rawValue.count ?? rawValue.quantity, 1, MAX_BACKPACK_ITEM_STACK, 1)
  const name = String(rawValue.name || `回复药剂${index + 1}`).trim().slice(0, 24) || `回复药剂${index + 1}`
  const descFallback = effectType === 'heal_hp' ? `恢复 ${value} 点生命` : '可在战斗中使用'
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
  partyMemberHpMap: {},
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

  const logs = (Array.isArray(rawValue.logs) ? rawValue.logs : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(-MAX_LOG_COUNT)
  if (logs.length === 0) {
    logs.push(...defaults.logs)
  }

  const next = {
    floor,
    level: clampInt(rawValue.level, 1, 999, defaults.level),
    exp: clampInt(rawValue.exp, 0, 999999, defaults.exp),
    hp: clampInt(rawValue.hp, 1, 999999, defaults.hp),
    maxHp: clampInt(rawValue.maxHp, 1, 999999, defaults.maxHp),
    gems: clampInt(rawValue.gems, 0, 999999, defaults.gems),
    coins: clampInt(rawValue.coins, 0, 9999999, defaults.coins),
    equipmentPity: clampInt(rawValue.equipmentPity, 0, EQUIPMENT_PITY_LIMIT - 1, 0),
    worldBookId: String(rawValue.worldBookId || '').trim().slice(0, 120),
    worldBookCharacterSignature: String(rawValue.worldBookCharacterSignature || '').trim().slice(0, 4000),
    lastScene: String(rawValue.lastScene || defaults.lastScene).trim().slice(0, 40),
    lastBanter: String(rawValue.lastBanter || '').trim().slice(0, 88),
    dungeonMap,
    teammates,
    campfireCompanions,
    campfireLayout,
    equipments,
    backpackItems,
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

  applyAutoEquip(next)
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
  if (!map) return '未生成敌群'
  const bossRemain = dungeonMapBossRemaining.value
  const mobRemain = dungeonEnemyPreviewList.value.filter((item) => item.type === DUNGEON_TILE_MONSTER && !item.cleared).length
  return `Boss 剩余 ${bossRemain} / 小怪剩余 ${mobRemain}`
})

const dungeonAdvanceButtonText = computed(() => {
  if (loading.value) return '生成中...'
  if (!hasDungeonMap.value) return '前进（生成敌群）'
  if (dungeonEnemyRemainingCount.value <= 0) return '前进（进入下一层）'
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
      const fallbackDesc = effectType === 'heal_hp' ? `恢复 ${value} 点生命` : '可在战斗中使用'
      const desc = (descRaw || fallbackDesc).slice(0, 24)
      return `${name} x${amount}（${desc}）`
    })
    .join('，')
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
}

const generateDungeonEncounterBoard = async () => {
  if (isBusy.value) return false
  if (hasDungeonMap.value) {
    errorText.value = '本层敌群已生成，点击“前进”开始战斗'
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
      lastScene: `${nextMap.theme}（敌群已出现）`,
      updatedAt: Date.now(),
    })
    errorText.value = `敌群已出现：${nextMap.theme}`
    return true
  } catch (e) {
    console.error('[xx-dungeon] enemy board generation failed:', e)
    errorText.value = '敌群生成失败，请稍后重试'
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
  const equipped = targetState?.equipped && typeof targetState.equipped === 'object' ? targetState.equipped : {}
  const equipList = [equipped.weapon, equipped.armor, equipped.relic].filter(Boolean)
  const equipAtk = equipList.reduce((sum, item) => sum + (Number(item.atk) || 0), 0)
  const equipDef = equipList.reduce((sum, item) => sum + (Number(item.def) || 0), 0)
  const equipHp = equipList.reduce((sum, item) => sum + (Number(item.hp) || 0), 0)
  return Math.round(level * 9 + floor * 3 + partyPower + equipAtk * 1.2 + equipDef * 0.85 + equipHp * 0.22)
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
let campfireBubbleTimer = null
let campfireBubbleInitTimer = null
let campfireBubbleBusy = false
let campfireFrameTimer = null
let restoreToken = 0
let campfireDragState = null

const getCampfireLayoutKey = (companion, index = 0) => {
  const worldCharacterId = String(companion?.worldCharacterId || '').trim()
  if (worldCharacterId) return `w:${worldCharacterId.slice(0, 80)}`
  const companionId = String(companion?.id || '').trim()
  if (companionId) return `c:${companionId.slice(0, 80)}`
  const name = String(companion?.name || '').replace(/\s+/g, ' ').trim().slice(0, 24)
  if (name) return `n:${name}`
  return `slot:${index + 1}`
}

const getDefaultCampfireLayout = (index = 0) => {
  const base = CAMPFIRE_DEFAULT_LAYOUT[index % CAMPFIRE_DEFAULT_LAYOUT.length] || CAMPFIRE_DEFAULT_LAYOUT[0]
  return { x: base.x, y: base.y }
}

const getCampfireCompanionLayout = (companion, index = 0) => {
  const key = getCampfireLayoutKey(companion, index)
  const layoutMap = state.value?.campfireLayout && typeof state.value.campfireLayout === 'object'
    ? state.value.campfireLayout
    : {}
  const saved = layoutMap[key]
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    return {
      x: clampInt(saved.x, CAMPFIRE_LAYOUT_X_MIN, CAMPFIRE_LAYOUT_X_MAX, CAMPFIRE_LAYOUT_X_MIN),
      y: clampInt(saved.y, CAMPFIRE_LAYOUT_Y_MIN, CAMPFIRE_LAYOUT_Y_MAX, CAMPFIRE_LAYOUT_Y_MIN),
    }
  }
  return getDefaultCampfireLayout(index)
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
  const keys = Object.keys(currentMap)
  if (keys.length <= 0) return
  const keep = new Set(list.map((item, index) => getCampfireLayoutKey(item, index)))
  let changed = false
  const nextMap = {}
  for (const key of keys) {
    if (!keep.has(key)) {
      changed = true
      continue
    }
    nextMap[key] = currentMap[key]
  }
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
  const root = campfireFieldRef.value
  const rect = root?.getBoundingClientRect?.()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  const x = ((clientX - rect.left) / rect.width) * 100
  const y = ((clientY - rect.top) / rect.height) * 100
  return { x, y }
}

const onCampfireDragMove = (event) => {
  if (!campfireDragState) return
  if (campfireDragState.pointerId !== null && event.pointerId !== campfireDragState.pointerId) return
  const point = resolveCampfirePointerPercent(event.clientX, event.clientY)
  if (!point) return
  event.preventDefault()
  const nextX = point.x + campfireDragState.offsetX
  const nextY = point.y + campfireDragState.offsetY
  updateCampfireCompanionLayout(campfireDragState.layoutKey, nextX, nextY, false)
}

const onCampfireDragEnd = (event) => {
  if (!campfireDragState) return
  if (campfireDragState.pointerId !== null && event.pointerId !== campfireDragState.pointerId) return
  const point = resolveCampfirePointerPercent(event.clientX, event.clientY)
  if (point) {
    const nextX = point.x + campfireDragState.offsetX
    const nextY = point.y + campfireDragState.offsetY
    updateCampfireCompanionLayout(campfireDragState.layoutKey, nextX, nextY, true)
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
  campfireDragState = {
    pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
    layoutKey,
    offsetX: current.x - pointerPoint.x,
    offsetY: current.y - pointerPoint.y,
    startX: current.x,
    startY: current.y,
  }
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
    void kvStorage.set(targetKey, {
      ...normalizeState(state.value),
      updatedAt: Date.now(),
    })
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

const buildWorldBookSummary = (book) => {
  const entries = book?.entries && typeof book.entries === 'object' ? book.entries : {}
  const parts = [
    trimText(book?.summary, 80),
    trimText(entries.overview, 70),
    trimText(entries.conflict, 70),
    trimText(entries.rules, 70),
  ].filter(Boolean)
  return parts.join('；').slice(0, 260)
}

const resolveWorldBookCharacterRole = (character) => {
  return (
    trimText(character?.identity, 20) ||
    trimText(character?.nickname, 20) ||
    trimText(character?.notes, 20) ||
    '冒险者'
  )
}

const buildAppearanceHint = (character, fallbackText = '') => {
  const parts = [
    trimText(character?.appearance, 72),
    trimText(character?.identity, 40),
    trimText(character?.notes, 72),
    trimText(character?.background, 72),
    trimText(fallbackText, 64),
  ].filter(Boolean)
  return parts.join('；').slice(0, 220)
}

const extractWorldBookCharacters = (book) => {
  const result = []
  const pushItem = (idRaw, nameRaw, roleRaw, hintRaw) => {
    const name = trimText(nameRaw, 24)
    if (!name) return
    const id = trimText(idRaw, 64) || `world-char-${result.length + 1}`
    if (result.some((item) => item.id === id || item.name === name)) return
    result.push({
      id,
      name,
      role: resolveClassicRole(trimText(roleRaw, 24), result.length, hintRaw),
      hint: trimText(hintRaw, 220),
    })
  }

  // 始终把玩家（User）作为篝火角色之一，保证每次都能出现
  pushItem(
    'world-user-profile',
    book?.userProfile?.name || book?.userProfile?.nickname || '你',
    book?.userProfile?.identity || '冒险者',
    buildAppearanceHint(book?.userProfile, book?.summary),
  )

  const characters = Array.isArray(book?.characters) ? book.characters : []
  if (characters.length > 0) {
    for (const item of characters) {
      pushItem(
        item?.id,
        item?.name || item?.nickname,
        resolveWorldBookCharacterRole(item),
        buildAppearanceHint(item),
      )
      if (result.length >= MAX_TEAMMATE_COUNT) break
    }
  }
  return result
}

const loadActiveWorldBookSnapshot = async () => {
  try {
    const externalBook = props.worldBook && typeof props.worldBook === 'object' ? props.worldBook : null
    if (externalBook) {
      return {
        worldBookId: trimText(externalBook?.id, 120) || 'default_world_book',
        worldTitle: trimText(externalBook?.title, 36),
        worldSummary: buildWorldBookSummary(externalBook),
        characters: extractWorldBookCharacters(externalBook),
      }
    }

    const [books, activeId] = await Promise.all([loadWorldBooks(), getActiveWorldBookId()])
    const list = Array.isArray(books) ? books : []
    const activeBook = list.find((book) => book?.id === activeId) || list[0] || null
    return {
      worldBookId: trimText(activeBook?.id, 120) || 'default_world_book',
      worldTitle: trimText(activeBook?.title, 36),
      worldSummary: buildWorldBookSummary(activeBook),
      characters: extractWorldBookCharacters(activeBook),
    }
  } catch (e) {
    console.error('[xx-dungeon] worldbook snapshot failed:', e)
    return {
      worldBookId: '',
      worldTitle: '',
      worldSummary: '',
      characters: [],
    }
  }
}

const buildWorldBookCharacterSignature = (characters) => {
  const list = Array.isArray(characters) ? characters : []
  return list
    .map((item) => `${item.id}#${item.name}#${item.role}#${trimText(item.hint, 120)}`)
    .join('|')
    .slice(0, 4000)
}

const buildWorldBookTeammates = (characters, previousTeammates = []) => {
  const source = Array.isArray(characters) ? characters : []
  if (source.length === 0) {
    const fallback = (Array.isArray(previousTeammates) ? previousTeammates : [])
      .map((item, index) => normalizeTeammate(item, index))
      .filter(Boolean)
    return fallback.length > 0 ? fallback : buildDefaultState().teammates
  }

  const prevList = (Array.isArray(previousTeammates) ? previousTeammates : [])
    .map((item, index) => normalizeTeammate(item, index))
    .filter(Boolean)

  return source
    .map((item, index) => {
      const matched = prevList.find((teammate) => teammate.worldCharacterId === item.id || teammate.name === item.name)
      const rarity = 'R'
      const basePower = index < 1 ? 72 : index < 3 ? 56 : 40
      const power = clampInt(matched?.power, 1, 9999, basePower + index * 2)
      return normalizeTeammate({
        id: matched?.id || `tm-world-${item.id || index + 1}`,
        worldCharacterId: item.id,
        name: item.name,
        role: resolveClassicRole(matched?.role || item.role, index, item.hint),
        rarity,
        power,
      }, index)
    })
    .filter(Boolean)
    .slice(0, MAX_TEAMMATE_COUNT)
}

const buildFallbackCampfireCompanions = (snapshot = null, teammateList = []) => {
  const characters = Array.isArray(snapshot?.characters) ? snapshot.characters : []
  const teammates = Array.isArray(teammateList) ? teammateList : []
  const source = characters.length > 0
    ? characters
    : teammates.map((item, index) => ({
      id: item.worldCharacterId || item.id || `tm-${index + 1}`,
      name: item.name,
      role: item.role,
      hint: item.role,
    }))

  if (source.length === 0) {
    return DEFAULT_CAMPFIRE_NAMES.map((name, index) => normalizeCampfireCompanion({
      id: `camp-fallback-${index + 1}`,
      worldCharacterId: `fallback-${index + 1}`,
      name,
      role: ROLE_FALLBACK_LIST[index % ROLE_FALLBACK_LIST.length],
      style: CAMPFIRE_STYLE_LIST[index % CAMPFIRE_STYLE_LIST.length],
      palette: CAMPFIRE_PALETTE_LIST[index % CAMPFIRE_PALETTE_LIST.length],
      action: CAMPFIRE_ACTION_LIST[index % CAMPFIRE_ACTION_LIST.length],
      line: `${name}在篝火旁整理装备。`,
    }, index))
  }

  return source.slice(0, MAX_CAMPFIRE_COMPANIONS).map((item, index) => normalizeCampfireCompanion({
    id: `camp-fallback-${item.id || index + 1}`,
    worldCharacterId: item.id,
    name: item.name,
    role: resolveClassicRole(item.role, index, item.hint),
    style: CAMPFIRE_STYLE_LIST[index % CAMPFIRE_STYLE_LIST.length],
    palette: CAMPFIRE_PALETTE_LIST[index % CAMPFIRE_PALETTE_LIST.length],
    action: pickCampfireActionByHint(item.hint || item.role, index),
    line: `${item.name}在篝火旁整理装备。`,
  }, index))
}

const calcTargetCampfireCompanionCount = (worldCharacters, fallbackList = []) => {
  const worldCount = Array.isArray(worldCharacters) ? worldCharacters.length : 0
  if (worldCount > 0) {
    return Math.min(MAX_CAMPFIRE_COMPANIONS, Math.max(1, worldCount))
  }
  const fallbackCount = Array.isArray(fallbackList) ? fallbackList.length : 0
  return Math.max(1, Math.min(MAX_CAMPFIRE_COMPANIONS, fallbackCount || DEFAULT_CAMPFIRE_NAMES.length))
}

const mergeGeneratedCompanions = (generatedList, characters, fallbackList) => {
  const generated = normalizeCampfireCompanionList(generatedList)
  if (generated.length === 0) return normalizeCampfireCompanionList(fallbackList)

  const source = Array.isArray(characters) ? characters : []
  if (source.length === 0) {
    const fallback = normalizeCampfireCompanionList(fallbackList)
    if (fallback.length === 0) return generated
    return normalizeCampfireCompanionList(fallback.map((item, index) => ({
      ...item,
      role: resolveClassicRole(generated[index]?.role || item.role, index, generated[index]?.line || item.line),
      style: generated[index]?.style || item.style,
      palette: generated[index]?.palette || item.palette,
      action: generated[index]?.action || item.action,
      line: generated[index]?.line || item.line,
    })))
  }

  const result = source.map((character, index) => {
    const matched = generated[index] || generated.find((item) => item.name === character.name) || null
    const fallback = fallbackList[index] || fallbackList[index % fallbackList.length] || null
    return normalizeCampfireCompanion({
      id: matched?.id || fallback?.id || `camp-${character.id || index + 1}`,
      worldCharacterId: character.id,
      name: character.name,
      role: resolveClassicRole(matched?.role || character.role || fallback?.role, index, character.hint),
      style: matched?.style || fallback?.style || CAMPFIRE_STYLE_LIST[index % CAMPFIRE_STYLE_LIST.length],
      palette: matched?.palette || fallback?.palette || CAMPFIRE_PALETTE_LIST[index % CAMPFIRE_PALETTE_LIST.length],
      action: matched?.action || fallback?.action || pickCampfireActionByHint(character.hint || character.role, index),
      line: matched?.line || fallback?.line || `${character.name}在篝火旁等待出发。`,
    }, index)
  })

  return normalizeCampfireCompanionList(result)
}

const applyCompanionRolesToTeammates = (teammateList, companionList) => {
  const teammates = (Array.isArray(teammateList) ? teammateList : [])
    .map((item, index) => normalizeTeammate(item, index))
    .filter(Boolean)
  const companions = normalizeCampfireCompanionList(companionList)
  if (teammates.length === 0 || companions.length === 0) return teammates
  return teammates
    .map((teammate, index) => {
      const matched = companions.find((companion) => {
        if (companion.worldCharacterId && teammate.worldCharacterId) {
          return companion.worldCharacterId === teammate.worldCharacterId
        }
        return companion.name === teammate.name
      })
      if (!matched) return teammate
      return normalizeTeammate({
        ...teammate,
        role: resolveClassicRole(matched.role || teammate.role, index, matched.line),
        rarity: 'R',
      }, index)
    })
    .slice(0, MAX_TEAMMATE_COUNT)
}

const ensureCampfireCompanions = async (forceRegenerate = false) => {
  if (campfireCasting.value) return

  campfireCasting.value = true
  try {
    const normalizedState = normalizeState(state.value)
    const worldSnapshot = await loadActiveWorldBookSnapshot()
    const worldCharacters = Array.isArray(worldSnapshot.characters) ? worldSnapshot.characters : []
    const worldSignature = buildWorldBookCharacterSignature(worldCharacters)
    const syncedTeammates = buildWorldBookTeammates(worldCharacters, normalizedState.teammates)
    const fallbackList = buildFallbackCampfireCompanions(worldSnapshot, syncedTeammates)
    const targetCompanionCount = calcTargetCampfireCompanionCount(worldCharacters, fallbackList)
    const hasEnoughCompanions = normalizeCampfireCompanionList(normalizedState.campfireCompanions).length >= targetCompanionCount
    const shouldRegenerate =
      forceRegenerate ||
      !hasEnoughCompanions ||
      normalizedState.worldBookId !== worldSnapshot.worldBookId ||
      normalizedState.worldBookCharacterSignature !== worldSignature

    let nextCompanions = fallbackList

    if (shouldRegenerate) {
      const characterHints = worldCharacters
        .map((item) => {
          const parts = [item.name, item.role, item.hint ? `外观与设定:${item.hint}` : ''].filter(Boolean)
          return parts.join('|')
        })
        .filter(Boolean)
        .slice(0, MAX_CAMPFIRE_COMPANIONS)
      const fallbackHints = fallbackList
        .map((item) => {
          const parts = [item.name, item.role, item.line ? `动作:${item.line}` : ''].filter(Boolean)
          return parts.join('|')
        })
        .filter(Boolean)
      const hints = characterHints.length > 0 ? characterHints : fallbackHints

      const generatedCompanions = []
      for (let offset = 0; offset < hints.length && generatedCompanions.length < targetCompanionCount; offset += MAX_CAMPFIRE_LLM_COUNT) {
        const remaining = targetCompanionCount - generatedCompanions.length
        const chunkSize = Math.min(MAX_CAMPFIRE_LLM_COUNT, remaining)
        const hintChunk = hints.slice(offset, offset + chunkSize)
        if (hintChunk.length === 0) break

        const llmResult = await generateHandheldCampfireCompanions({
          worldTitle: worldSnapshot.worldTitle,
          worldSummary: worldSnapshot.worldSummary,
          characterHints: hintChunk,
          companionCount: hintChunk.length,
        })

        if (!llmResult?.success || !Array.isArray(llmResult.companions) || llmResult.companions.length === 0) {
          break
        }
        generatedCompanions.push(...llmResult.companions)
      }

      if (generatedCompanions.length > 0) {
        nextCompanions = mergeGeneratedCompanions(generatedCompanions, worldCharacters, fallbackList)
      }
    } else {
      nextCompanions = mergeGeneratedCompanions(normalizedState.campfireCompanions, worldCharacters, fallbackList)
    }

    const teammatesWithCompanionRoles = applyCompanionRolesToTeammates(syncedTeammates, nextCompanions)

    state.value = normalizeState({
      ...normalizedState,
      teammates: teammatesWithCompanionRoles,
      worldBookId: worldSnapshot.worldBookId,
      worldBookCharacterSignature: worldSignature,
      campfireCompanions: nextCompanions,
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
  return panelOpen.value && currentView.value === 'home' && campfireCompanions.value.length > 0
}

const resetCampfireBubbleState = () => {
  campfireRotateCursor.value = 0
  campfireSpeakerCursor.value = 0
  activeCampfireBubble.value = { companionId: '', text: '' }
}

const stopCampfireBubbleLoop = () => {
  if (campfireBubbleInitTimer) {
    clearTimeout(campfireBubbleInitTimer)
    campfireBubbleInitTimer = null
  }
  if (campfireBubbleTimer) {
    clearInterval(campfireBubbleTimer)
    campfireBubbleTimer = null
  }
  campfireBubbleBusy = false
  activeCampfireBubble.value = { companionId: '', text: '' }
}

const rotateCampfireBubbleOnce = async () => {
  if (campfireBubbleBusy || !shouldRunCampfireBubbleLoop()) return
  const list = campfireCompanions.value
  if (!Array.isArray(list) || list.length === 0) {
    activeCampfireBubble.value = { companionId: '', text: '' }
    return
  }

  campfireBubbleBusy = true
  try {
    const speakerIndex = ((campfireSpeakerCursor.value % list.length) + list.length) % list.length
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
    campfireBubbleBusy = false
  }
}

const startCampfireBubbleLoop = () => {
  if (!shouldRunCampfireBubbleLoop()) return
  if (campfireBubbleTimer || campfireBubbleInitTimer) return
  campfireBubbleInitTimer = setTimeout(() => {
    campfireBubbleInitTimer = null
    void rotateCampfireBubbleOnce()
    campfireBubbleTimer = setInterval(() => {
      void rotateCampfireBubbleOnce()
    }, CAMPFIRE_BUBBLE_INTERVAL_MS)
  }, CAMPFIRE_BUBBLE_BOOT_DELAY_MS)
}

const syncCampfireBubbleLoop = () => {
  if (shouldRunCampfireBubbleLoop()) {
    startCampfireBubbleLoop()
    return
  }
  stopCampfireBubbleLoop()
}

const shouldRunCampfireFrameLoop = () => panelOpen.value && currentView.value === 'home'

const stopCampfireFrameLoop = () => {
  if (campfireFrameTimer) {
    clearInterval(campfireFrameTimer)
    campfireFrameTimer = null
  }
}

const startCampfireFrameLoop = () => {
  if (!shouldRunCampfireFrameLoop()) return
  if (campfireFrameTimer) return
  campfireFrameTimer = setInterval(() => {
    campfireFrameTick.value = (campfireFrameTick.value + 1) % 2
  }, 720)
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
  stopCampfireBubbleLoop()
  stopCampfireFrameLoop()
  campfireFrameTick.value = 0
  resetCampfireBubbleState()
  panelOpen.value = false
  currentView.value = 'home'
}

const restoreState = async (targetKey = storageScopeKey.value) => {
  const ticket = ++restoreToken
  try {
    const stored = await kvStorage.get(targetKey)
    if (ticket !== restoreToken) return
    state.value = normalizeState(stored)
    campfireFrameTick.value = 0
    resetCampfireBubbleState()
  } catch (e) {
    console.error('[xx-dungeon] restore failed:', e)
    if (ticket !== restoreToken) return
    state.value = buildDefaultState()
    campfireFrameTick.value = 0
    resetCampfireBubbleState()
  }
}

const rollEquipmentRarity = (pity, ensureSr = false) => {
  if (pity + 1 >= EQUIPMENT_PITY_LIMIT) return 'SSR'
  const roll = Math.random()
  let rarity = roll < 0.026 ? 'SSR' : roll < 0.225 ? 'SR' : 'R'
  if (ensureSr && rarity === 'R') {
    rarity = 'SR'
  }
  return rarity
}

const drawEquipmentOne = (pity, ensureSr = false) => {
  const rarity = rollEquipmentRarity(pity, ensureSr)
  const template = pickRandomItem(EQUIPMENT_POOL[rarity], EQUIPMENT_POOL.R[0])
  const variance = rarity === 'SSR' ? 12 : rarity === 'SR' ? 7 : 4
  const equipment = normalizeEquipment({
    id: makeId('eq'),
    name: template.name,
    rarity,
    slot: template.slot,
    atk: template.atk + randomInt(0, variance),
    def: template.def + randomInt(0, variance),
    hp: template.hp + randomInt(0, variance * 3),
    desc: rarity === 'SSR' ? '闪耀着高阶符文的传奇装备。' : '',
  })

  return {
    equipment,
    nextPity: rarity === 'SSR' ? 0 : Math.min(EQUIPMENT_PITY_LIMIT - 1, pity + 1),
  }
}

const promoteByExp = (targetState) => {
  let levelUps = 0
  while (targetState.exp >= needExpByLevel(targetState.level)) {
    targetState.exp -= needExpByLevel(targetState.level)
    targetState.level += 1
    targetState.maxHp += 16 + Math.floor(targetState.level * 0.4)
    targetState.hp = Math.min(targetState.maxHp, targetState.hp + 24)
    levelUps += 1
  }
  return levelUps
}

function createEnemyByFloor(floor, isBoss = false) {
  return {
    name: isBoss ? `深层首领 Lv.${floor}` : `地下城魔物 Lv.${floor}`,
    hp: Math.round((isBoss ? 190 : 108) + floor * (isBoss ? 34 : 18)),
    attack: Math.round((isBoss ? 30 : 17) + floor * (isBoss ? 3.2 : 1.8)),
    rewardCoins: Math.round((isBoss ? 240 : 90) + floor * (isBoss ? 38 : 16)),
    rewardGems: Math.round((isBoss ? 86 : 26) + floor * (isBoss ? 8 : 3)),
  }
}

const createLocalScene = (targetState, eventTypeHint) => {
  const floor = Math.max(1, Number(targetState.floor) || 1)
  let eventType = floor % 5 === 0 ? 'boss' : eventTypeHint
  if (eventType !== 'boss') {
    const roll = Math.random()
    if (roll < 0.58) eventType = 'battle'
    else if (roll < 0.72) eventType = 'treasure'
    else if (roll < 0.88) eventType = 'rest'
    else eventType = 'trap'
  }

  const sceneDef = pickRandomItem(LOCAL_SCENE_LIBRARY[eventType], LOCAL_SCENE_LIBRARY.battle[0])
  const isBattleLike = eventType === 'battle' || eventType === 'boss'

  return {
    eventType,
    title: sceneDef?.title || '未知区间',
    description: sceneDef?.description || '你在黑暗中继续前进。',
    banterHint: sceneDef?.banterHint || '别松懈，继续推进。',
    enemy: isBattleLike ? createEnemyByFloor(floor, eventType === 'boss') : null,
    loot: null,
  }
}

const tryBuildLootAsEquipment = (lootRaw) => {
  if (!lootRaw || typeof lootRaw !== 'object') return null
  const name = String(lootRaw.name || '').trim().slice(0, 18)
  if (!name) return null
  const slot = normalizeSlot(lootRaw.slot, pickRandomItem(['weapon', 'armor', 'relic'], 'weapon'))
  return normalizeEquipment({
    id: makeId('eq'),
    name,
    rarity: normalizeRarity(lootRaw.rarity, 'SR'),
    slot,
    atk: clampInt(lootRaw.atk, 0, 500, randomInt(8, 26)),
    def: clampInt(lootRaw.def, 0, 500, randomInt(8, 26)),
    hp: clampInt(lootRaw.hp, 0, 900, randomInt(18, 56)),
    desc: String(lootRaw.desc || '').trim().slice(0, 40),
  })
}

const loadDungeonScene = async (targetState) => {
  const eventTypeHint = targetState.floor % 5 === 0 ? 'boss' : 'battle'
  const partySummary = dungeonActiveParty.value.map((item) => `${item.name}(${item.rarity})`).join('、')

  try {
    const result = await generateHandheldDungeonScene({
      floor: targetState.floor,
      eventTypeHint,
      sceneName: targetState.lastScene,
      partySummary,
    })

    if (!result?.success || !result.scene) {
      if (result?.error) {
        errorText.value = `${result.error}，已切换本地地下城模板`
      }
      return createLocalScene(targetState, eventTypeHint)
    }

    const scene = result.scene
    return {
      eventType: String(scene.eventType || eventTypeHint).trim().toLowerCase(),
      title: String(scene.title || '地下城').trim().slice(0, 36),
      description: String(scene.description || '前方传来未知动静。').trim().slice(0, 120),
      banterHint: String(scene.banterHint || '保持警戒，继续推进。').trim().slice(0, 40),
      enemy: scene.enemy && typeof scene.enemy === 'object'
        ? {
            name: String(scene.enemy.name || '地下城魔物').trim().slice(0, 24),
            hp: clampInt(scene.enemy.hp, 20, 99999, 120),
            attack: clampInt(scene.enemy.attack, 6, 9999, 20),
            rewardCoins: clampInt(scene.enemy.rewardCoins, 1, 999999, 90),
            rewardGems: clampInt(scene.enemy.rewardGems, 1, 999999, 26),
          }
        : null,
      loot: tryBuildLootAsEquipment(scene.loot),
    }
  } catch (e) {
    console.error('[xx-dungeon] scene generation failed:', e)
    errorText.value = '场景生成失败，已切换本地地下城模板'
    return createLocalScene(targetState, eventTypeHint)
  }
}

const applyExploreResult = (targetState, scene) => {
  const next = normalizeState(targetState)
  const eventType = ['battle', 'boss', 'treasure', 'rest', 'trap'].includes(scene.eventType) ? scene.eventType : 'battle'
  next.lastScene = scene.title || scene.description || '地下城深处'

  if (eventType === 'battle' || eventType === 'boss') {
    const enemy = scene.enemy || createEnemyByFloor(next.floor, eventType === 'boss')
    const playerPower = calcTotalPower(next) + Math.floor(next.hp * 0.08)
    const playerRoll = playerPower + randomInt(12, 52)
    const enemyRoll = enemy.attack + enemy.hp * 0.16 + randomInt(8, 48)
    const victory = playerRoll >= enemyRoll

    if (victory) {
      const rewardCoins = clampInt(enemy.rewardCoins, 1, 999999, 60)
      const rewardGems = clampInt(enemy.rewardGems, 1, 999999, 20)
      const rewardExp = Math.max(22, Math.round(enemy.attack * 1.2 + enemy.hp * 0.08))
      next.coins += rewardCoins
      next.gems += rewardGems
      next.exp += rewardExp
      const levelUps = promoteByExp(next)
      next.floor += 1
      next.hp = Math.min(next.maxHp, next.hp + randomInt(6, 16))

      const rewardLogs = [
        `${eventType === 'boss' ? '首领' : '敌人'} ${enemy.name} 被击败。`,
        `获得 +${rewardCoins} 金币 / +${rewardGems} 星钻 / +${rewardExp} EXP。`,
      ]
      if (levelUps > 0) {
        rewardLogs.push(`队伍等级提升 ${levelUps} 级，当前 Lv.${next.level}。`)
      }

      const loot = scene.loot || (Math.random() < (eventType === 'boss' ? 0.66 : 0.28)
        ? drawEquipmentOne(next.equipmentPity, false).equipment
        : null)
      if (loot) {
        next.equipments = [...next.equipments, loot].slice(-MAX_EQUIPMENT_COUNT)
        applyAutoEquip(next)
        rewardLogs.push(`获得战利品：${loot.name}(${loot.rarity})。`)
      }

      return {
        state: normalizeState(next),
        logs: [scene.description, ...rewardLogs],
      }
    }

    const damage = Math.max(18, Math.round(enemy.attack * 0.7 + randomInt(10, 28)))
    next.hp = Math.max(0, next.hp - damage)
    const logs = [
      scene.description,
      `遭遇 ${enemy.name} 失利，受到 ${damage} 点伤害。`,
    ]
    if (next.hp <= 0) {
      next.floor = Math.max(1, next.floor - 1)
      next.hp = Math.max(1, Math.floor(next.maxHp * 0.55))
      logs.push('队伍被迫撤退到上一层，HP 已回稳。')
    }
    return {
      state: normalizeState(next),
      logs,
    }
  }

  if (eventType === 'rest') {
    const heal = Math.max(14, Math.round(next.maxHp * 0.25))
    next.hp = Math.min(next.maxHp, next.hp + heal)
    next.exp += randomInt(8, 22)
    promoteByExp(next)
    return {
      state: normalizeState(next),
      logs: [scene.description, `队伍休整完成，恢复 ${heal} 点生命。`],
    }
  }

  if (eventType === 'treasure') {
    const gainCoins = randomInt(70, 190) + next.floor * 5
    const gainGems = randomInt(18, 44) + Math.floor(next.floor * 0.6)
    next.coins += gainCoins
    next.gems += gainGems
    const loot = scene.loot || (Math.random() < 0.46 ? drawEquipmentOne(next.equipmentPity, true).equipment : null)
    const logs = [
      scene.description,
      `宝箱开启：+${gainCoins} 金币 / +${gainGems} 星钻。`,
    ]
    if (loot) {
      next.equipments = [...next.equipments, loot].slice(-MAX_EQUIPMENT_COUNT)
      applyAutoEquip(next)
      logs.push(`额外获得：${loot.name}(${loot.rarity})。`)
    }
    return {
      state: normalizeState(next),
      logs,
    }
  }

  const trapDamage = Math.max(12, Math.round(next.maxHp * 0.18) + randomInt(0, 12))
  const gemLoss = Math.min(next.gems, randomInt(6, 18))
  next.hp = Math.max(1, next.hp - trapDamage)
  next.gems -= gemLoss
  return {
    state: normalizeState(next),
    logs: [scene.description, `触发陷阱，损失 ${trapDamage} HP 与 ${gemLoss} 星钻。`],
  }
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
    applyAutoEquip(next)
    state.value = normalizeState(next)
    pushLogs(`装备抽取${drawCount === 10 ? '十连' : '单抽'}：${results.map((item) => `${item.name}(${item.rarity})`).join('、')}`)
  } catch (e) {
    console.error('[xx-dungeon] draw equipment failed:', e)
    errorText.value = '装备抽取失败，请稍后重试'
  } finally {
    drawing.value = false
  }
}

const buildDungeonMapForFloor = async (targetState) => {
  const baseState = normalizeState(targetState)
  const fallbackMap = buildGuaranteedLocalDungeonMap(baseState)
  const worldSnapshot = await loadActiveWorldBookSnapshot()
  const partySummary = dungeonActiveParty.value
    .map((item) => `${item.name}(${item.role || '冒险者'})`)
    .join('、')
  try {
    const result = await generateHandheldDungeonMap({
      floor: baseState.floor,
      worldTitle: worldSnapshot.worldTitle,
      worldSummary: worldSnapshot.worldSummary,
      partySummary,
      sizeHint: `${DUNGEON_MAP_MIN_SIZE}-${DUNGEON_MAP_MAX_SIZE}`,
    })
    if (!result?.success || !result.map) {
      return fallbackMap
    }
    const normalized = normalizeDungeonMap(result.map, baseState.floor)
    return isDungeonMapUsable(normalized) ? normalized : fallbackMap
  } catch (e) {
    console.error('[xx-dungeon] map generation failed:', e)
    return fallbackMap
  }
}

const tryGrantDungeonEquipmentDrop = (targetState, chance = 0.16) => {
  if (Math.random() > chance) return null
  const drawn = drawEquipmentOne(targetState.equipmentPity, false)
  targetState.equipmentPity = drawn.nextPity
  targetState.equipments = [...targetState.equipments, drawn.equipment].slice(-MAX_EQUIPMENT_COUNT)
  applyAutoEquip(targetState)
  return drawn.equipment
}

const advanceDungeon = async () => {
  if (isBusy.value) return
  errorText.value = ''

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

  const nextState = normalizeState(state.value)
  const nextMap = cloneDungeonMapState(map)
  if (!nextMap) return
  const targetIndex = findNextDungeonEncounterIndex(nextMap)
  if (targetIndex < 0) {
    enterNextDungeonFloor(nextState)
    return
  }

  const targetCell = nextMap.cells[targetIndex]
  const isBoss = targetCell.type === DUNGEON_TILE_BOSS
  const enemy = normalizeDungeonEnemy(targetCell.enemy, nextState.floor, isBoss, targetIndex)
  const reward = normalizeDungeonReward(targetCell.reward, nextState.floor, isBoss)
  nextState.lastScene = `${nextMap.theme} · ${isBoss ? '首领' : '小怪'} ${enemy.name}`

  const logs = []
  const playerRoll = calcTotalPower(nextState) + Math.round(nextState.hp * 0.06) + randomInt(16, 66)
  const enemyRoll = enemy.attack + Math.round(enemy.hp * 0.18) + randomInt(12, 58)
  const win = playerRoll >= enemyRoll

  if (win) {
    const damage = Math.max(8, Math.round(enemy.attack * 0.38 + randomInt(4, 14)))
    nextState.hp = Math.max(1, nextState.hp - damage)
    nextState.coins += reward.coins
    nextState.gems += reward.gems
    nextState.exp += reward.exp
    const levelUps = promoteByExp(nextState)
    targetCell.cleared = true
    logs.push(`${isBoss ? '首领' : '怪物'} ${enemy.name} 被击败，受到 ${damage} 点反击伤害。`)
    logs.push(`获得 +${reward.coins} 金币 / +${reward.gems} 星钻 / +${reward.exp} EXP。`)
    const droppedItems = mapEnemyDropsToBackpackItems(enemy.drops)
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
  } else {
    const damage = Math.max(16, Math.round(enemy.attack * 0.82 + randomInt(10, 26)))
    nextState.hp -= damage
    logs.push(`遭遇 ${enemy.name} 失利，受到 ${damage} 点伤害。`)
    if (nextState.hp <= 0) {
      nextState.hp = Math.max(1, Math.floor(nextState.maxHp * 0.55))
      logs.push('队伍被击退，短暂休整后继续前进。')
    }
  }

  syncPartyMemberHpMapByGlobalHp(nextState)
  nextMap.bossTotal = nextMap.cells.filter((cell) => cell.type === DUNGEON_TILE_BOSS).length
  nextMap.bossCleared = nextMap.cells.filter((cell) => cell.type === DUNGEON_TILE_BOSS && cell.cleared).length
  nextState.dungeonMap = nextMap
  state.value = normalizeState({
    ...nextState,
    updatedAt: Date.now(),
  })
  if (countDungeonEnemyRemainingByMap(nextMap) <= 0) {
    logs.push('本层敌群已清空，再次点击“前进”进入下一层。')
  }
  if (logs.length > 0) {
    pushLogs(logs)
  }
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
  }
  if (open && shouldSyncLogScroll()) {
    nextTick(() => {
      scrollLogToTop()
    })
  }
  syncCampfireHomeLoops()
})

watch(currentView, () => {
  if (shouldSyncLogScroll()) {
    nextTick(() => {
      scrollLogToTop()
    })
  }
  syncCampfireHomeLoops()
})

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
    try {
      await kvStorage.set(prevKey, {
        ...normalizeState(state.value),
        updatedAt: Date.now(),
      })
    } catch (e) {
      console.error('[xx-dungeon] persist previous scope failed:', e)
    }
  }

  stopCampfireDrag()
  stopCampfireBubbleLoop()
  stopCampfireFrameLoop()
  await restoreState(nextKey)
  void ensureCampfireCompanions(true)
  syncCampfireHomeLoops()
})

onMounted(async () => {
  android.value = isAndroid()
  await restoreState(storageScopeKey.value)
  void ensureCampfireCompanions()
  syncCampfireHomeLoops()
})

onUnmounted(() => {
  stopCampfireDrag()
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  stopCampfireBubbleLoop()
  stopCampfireFrameLoop()
  void kvStorage.set(storageScopeKey.value, {
    ...normalizeState(state.value),
    updatedAt: Date.now(),
  })
})
</script>

<template>
  <section class="xx-handheld" :class="{ 'is-android': android }">
    <div class="xx-trigger-group">
      <button
        class="xx-trigger"
        type="button"
        :aria-expanded="panelOpen"
        aria-label="切换xx大冒险面板"
        @click="togglePanel"
      >
        <span class="xx-trigger-icon">⚔</span>
        <span class="xx-trigger-text">{{ panelOpen ? '收起' : 'xx大冒险' }}</span>
      </button>
    </div>

    <Transition name="xx-panel">
      <article
        v-if="panelOpen"
        class="xx-panel"
        :class="{ 'is-home': currentView === 'home' }"
        role="dialog"
        aria-label="xx大冒险地下城插件"
      >
        <template v-if="currentView === 'home'">
          <main class="xx-home-main">
            <button class="xx-close xx-close-floating small-btn" type="button" aria-label="关闭面板" @click="closePanel">×</button>
            <section class="xx-home-screen">
              <div ref="campfireFieldRef" class="xx-campfire-field">
                <button class="xx-orbit-btn small-btn is-dungeon" type="button" @click="openView('dungeon')">
                  <span class="xx-orbit-icon">⛏</span>
                  <span class="xx-orbit-label">地下城</span>
                </button>
                <button class="xx-orbit-btn small-btn is-gacha" type="button" @click="openView('gacha')">
                  <span class="xx-orbit-icon">🛡</span>
                  <span class="xx-orbit-label">装备池</span>
                </button>
                <button class="xx-orbit-btn small-btn is-rest" type="button" @click="openView('rest')">
                  <span class="xx-orbit-icon">🍖</span>
                  <span class="xx-orbit-label">休息</span>
                </button>
                <button class="xx-orbit-btn small-btn is-tent" type="button" @click="openView('tent')">
                  <span class="xx-orbit-icon">⛺</span>
                  <span class="xx-orbit-label">帐篷</span>
                </button>

                <div class="xx-campfire-core" aria-hidden="true">
                  <span class="xx-campfire-flame is-back"></span>
                  <span class="xx-campfire-flame is-mid"></span>
                  <span class="xx-campfire-flame is-front"></span>
                  <span class="xx-campfire-glow"></span>
                  <span class="xx-campfire-wood"></span>
                </div>

                <div class="xx-campfire-crowd" aria-label="篝火角色">
                  <div
                    v-for="(camper, camperIndex) in visibleCampfireCompanions"
                    :key="camper.id"
                    class="xx-camper"
                    :class="[
                      `is-style-${camper.style}`,
                      `is-palette-${camper.palette}`,
                      `is-action-${camper.action}`,
                      { 'is-dragging': draggingCampfireKey === getCampfireLayoutKey(camper, camperIndex) },
                    ]"
                    :style="getCamperInlineStyle(camper, camperIndex)"
                    :title="camper.line || `${camper.name}在篝火旁待命`"
                    @pointerdown="startCampfireDrag($event, camper, camperIndex)"
                  >
                    <p
                      v-if="activeCampfireBubble.text && activeCampfireBubble.companionId === camper.id"
                      class="xx-camper-bubble"
                    >
                      {{ activeCampfireBubble.text }}
                    </p>
                    <span class="xx-camper-shadow"></span>
                    <img class="xx-camper-sprite" :src="getCampfireSpriteSrc(camper, camperIndex)" :alt="`${camper.name}像素形象`" />
                    <span class="xx-camper-name">{{ camper.name }}</span>
                  </div>
                </div>
              </div>
            </section>
          </main>
        </template>

        <template v-else>
          <header class="xx-header">
            <div class="xx-head-text">
              <h3 class="xx-title">xx大冒险</h3>
              <p class="xx-subtitle">当前界面：{{ currentViewTitle }}</p>
            </div>
            <button class="xx-close small-btn" type="button" aria-label="关闭面板" @click="closePanel">×</button>
          </header>

          <main class="xx-main">
            <section class="xx-subview-head">
              <button class="xx-back-btn small-btn" type="button" @click="openView('home')">← 返回营地</button>
              <p class="xx-subview-title">{{ currentViewTitle }}</p>
            </section>

            <section v-if="currentView === 'dungeon'" class="xx-stats xx-stats-dungeon">
              <p class="xx-chip">
                <span class="xx-chip-label">楼层</span>
                <span class="xx-chip-value">F{{ state.floor }}</span>
              </p>
              <p class="xx-chip">
                <span class="xx-chip-label">星钻</span>
                <span class="xx-chip-value">{{ state.gems }}</span>
              </p>
              <p class="xx-chip">
                <span class="xx-chip-label">金币</span>
                <span class="xx-chip-value">{{ state.coins }}</span>
              </p>
            </section>
            <section v-else class="xx-stats">
              <p class="xx-chip">
                <span class="xx-chip-label">楼层</span>
                <span class="xx-chip-value">F{{ state.floor }}</span>
              </p>
              <p class="xx-chip">
                <span class="xx-chip-label">等级</span>
                <span class="xx-chip-value">Lv.{{ state.level }}</span>
              </p>
              <p class="xx-chip">
                <span class="xx-chip-label">生命</span>
                <span class="xx-chip-value">{{ state.hp }}/{{ state.maxHp }}</span>
              </p>
              <p class="xx-chip">
                <span class="xx-chip-label">星钻</span>
                <span class="xx-chip-value">{{ state.gems }}</span>
              </p>
              <p class="xx-chip">
                <span class="xx-chip-label">金币</span>
                <span class="xx-chip-value">{{ state.coins }}</span>
              </p>
            </section>

            <template v-if="currentView === 'dungeon'">
              <section class="xx-scene-card xx-dungeon-overview">
                <p class="xx-scene-title">{{ state.lastScene || '地下城入口' }}</p>
                <div class="xx-hp-track">
                  <span class="xx-hp-fill" :style="{ width: `${hpPercent}%` }"></span>
                </div>
                <p class="xx-hp-text">HP {{ state.hp }}/{{ state.maxHp }}</p>
                <p class="xx-banter">
                  {{ hasDungeonMap ? dungeonMapStatusText : '点击“前进”可生成本层敌群（首领与小怪）。' }}
                </p>
              </section>

              <section class="xx-dungeon-map-card">
                <div class="xx-dungeon-map-head">
                  <p class="xx-dungeon-map-title">{{ activeDungeonMap?.theme || '未生成敌群' }}</p>
                  <span class="xx-dungeon-map-meta">{{ dungeonMapStatusText }}</span>
                </div>
                <div v-if="hasDungeonMap && currentDungeonEnemy" class="xx-dungeon-current-enemy">
                  <div
                    class="xx-dungeon-enemy-card"
                    :class="getDungeonEnemyCardClass(currentDungeonEnemy)"
                  >
                    <p class="xx-dungeon-enemy-name">
                      {{ currentDungeonEnemy.type === 'boss' ? 'Boss' : '小怪' }} · {{ currentDungeonEnemy.name }}
                    </p>
                    <p class="xx-dungeon-enemy-hp">
                      HP {{ currentDungeonEnemy.hp }}
                    </p>
                    <p class="xx-dungeon-enemy-drop">掉落：{{ formatEnemyDropText(currentDungeonEnemy.drops) }}</p>
                  </div>
                </div>
                <p v-else-if="hasDungeonMap" class="xx-dungeon-empty-tip">本层敌群已清空，再次点击“前进”进入下一层。</p>
                <p v-else class="xx-dungeon-empty-tip">点击下方“前进”后会生成本层首领与小怪列表。</p>
              </section>

              <section class="xx-action-grid xx-dungeon-actions">
                <button class="xx-btn is-primary" type="button" :disabled="isBusy" @click="advanceDungeon">
                  {{ dungeonAdvanceButtonText }}
                </button>
              </section>

              <section class="xx-backpack-card">
                <div class="xx-card-head">
                  <p>背包</p>
                  <span>{{ backpackItems.length }} 格</span>
                </div>
                <div v-if="backpackItems.length > 0" class="xx-backpack-list">
                  <button
                    v-for="item in backpackItems"
                    :key="item.stackKey"
                    class="xx-backpack-item"
                    type="button"
                    :class="{ 'is-selected': selectedBackpackItem && selectedBackpackItem.stackKey === item.stackKey }"
                    @click="selectBackpackItem(item)"
                  >
                    <span class="xx-backpack-name">{{ item.name }} x{{ item.amount }}</span>
                    <span class="xx-backpack-effect">{{ item.desc }}</span>
                  </button>
                </div>
                <p v-else class="xx-backpack-empty">暂无道具，击败敌人后会掉落。</p>
                <p class="xx-backpack-tip">
                  {{ selectedBackpackItem ? `已选中：${selectedBackpackItem.name}，点击队友使用` : '选中道具后，点击下方队友使用' }}
                </p>
              </section>

              <section class="xx-roster-card">
                <div class="xx-card-head">
                  <p>当前队伍</p>
                  <span>最多上阵 4 人</span>
                </div>
                <div class="xx-team-row">
                  <button
                    v-for="(member, slotIndex) in dungeonActivePartySlots"
                    :key="member ? member.id : `team-empty-dungeon-${slotIndex}`"
                    class="xx-team-member-btn"
                    type="button"
                    :class="{
                      'is-active': member && selectedPartyMemberDetail && selectedPartyMemberDetail.member.id === member.id,
                      'is-empty': !member,
                    }"
                    :disabled="!member"
                    @click="handleDungeonMemberClick(member)"
                  >
                    {{ member ? member.name : '空位' }}
                  </button>
                </div>
                <div v-if="selectedPartyMemberDetail" class="xx-team-detail">
                  <p class="xx-team-detail-name">{{ selectedPartyMemberDetail.member.name }}</p>
                  <p class="xx-team-detail-line">职业：{{ selectedPartyMemberDetail.member.role || '冒险者' }}</p>
                  <p class="xx-team-detail-line">
                    等级：Lv.{{ selectedPartyMemberDetail.level }}　HP：{{ selectedPartyMemberDetail.hp }}/{{ selectedPartyMemberDetail.maxHp }}
                  </p>
                  <p class="xx-team-detail-line">战力：{{ selectedPartyMemberDetail.power }}</p>
                </div>
                <div v-else class="xx-team-detail is-empty">
                  队伍暂无角色，请先在世界书添加角色。
                </div>
              </section>

              <section class="xx-log-card">
                <div class="xx-card-head">
                  <p>战报（最新在上）</p>
                  <span>{{ battleRecentLogs.length }} 条</span>
                </div>
                <div ref="logListRef" class="xx-log-list">
                  <p v-for="(line, idx) in battleRecentLogs" :key="`${idx}-${line}`" class="xx-log-line">{{ line }}</p>
                </div>
              </section>
            </template>

          <template v-else-if="currentView === 'gacha'">
            <section class="xx-gacha-grid">
              <article class="xx-gacha-card">
                <p class="xx-gacha-title">装备抽取</p>
                <p class="xx-gacha-desc">十连保 SR+，长保底 SSR</p>
                <div class="xx-gacha-actions">
                  <button class="xx-btn" type="button" :disabled="!canDrawEquipmentSingle" @click="drawEquipment(1)">
                    单抽 {{ EQUIPMENT_SINGLE_COST }}
                  </button>
                  <button class="xx-btn is-primary" type="button" :disabled="!canDrawEquipmentTen" @click="drawEquipment(10)">
                    十连 {{ EQUIPMENT_SINGLE_COST * 10 }}
                  </button>
                </div>
              </article>
            </section>

            <section class="xx-roster-card">
              <div class="xx-card-head">
                <p>最近获得装备</p>
                <span>{{ state.equipments.length }} 件</span>
              </div>
              <div class="xx-roster-list">
                <div v-for="item in [...state.equipments].reverse().slice(0, 6)" :key="item.id" class="xx-roster-item">
                  <span class="xx-rarity" :class="`is-${item.rarity.toLowerCase()}`">{{ item.rarity }}</span>
                  <span class="xx-member-name">{{ item.name }}</span>
                  <span class="xx-member-role">{{ item.slot }}</span>
                  <span class="xx-member-power">{{ item.score }}</span>
                </div>
                <div v-if="state.equipments.length === 0" class="xx-roster-item">
                  <span class="xx-rarity">--</span>
                  <span class="xx-member-name">暂无装备</span>
                  <span class="xx-member-role">等待抽取</span>
                  <span class="xx-member-power">0</span>
                </div>
              </div>
            </section>
          </template>

          <template v-else-if="currentView === 'rest'">
            <section class="xx-scene-card xx-rest-card">
              <p class="xx-scene-title">篝火休整区</p>
              <p class="xx-hp-text">当前生命：{{ state.hp }}/{{ state.maxHp }}（{{ hpPercent }}%）</p>
              <p class="xx-banter">{{ campfireHint }}</p>
              <div class="xx-rest-actions">
                <button class="xx-btn is-primary" type="button" :disabled="isBusy" @click="restAtCamp">围着篝火休息</button>
                <button class="xx-btn" type="button" :disabled="isBusy" @click="teammateBanter">
                  {{ banterLoading ? '吐槽中...' : '听队友吐槽' }}
                </button>
                <button class="xx-btn is-ghost" type="button" :disabled="isBusy" @click="openView('dungeon')">继续探险</button>
              </div>
            </section>
          </template>

          <template v-else-if="currentView === 'tent'">
            <section class="xx-equip-card">
              <div class="xx-card-head">
                <p>自动穿戴装备</p>
                <span>保底 {{ state.equipmentPity }}/{{ EQUIPMENT_PITY_LIMIT - 1 }}</span>
              </div>
              <div class="xx-equip-grid">
                <div class="xx-equip-item">
                  <span class="xx-equip-slot">武器</span>
                  <span class="xx-equip-name">{{ state.equipped.weapon?.name || '暂无' }}</span>
                </div>
                <div class="xx-equip-item">
                  <span class="xx-equip-slot">护甲</span>
                  <span class="xx-equip-name">{{ state.equipped.armor?.name || '暂无' }}</span>
                </div>
                <div class="xx-equip-item">
                  <span class="xx-equip-slot">饰品</span>
                  <span class="xx-equip-name">{{ state.equipped.relic?.name || '暂无' }}</span>
                </div>
              </div>
              <p class="xx-equip-bonus">
                加成：+{{ dungeonEquipBonuses.atk }} 攻 / +{{ dungeonEquipBonuses.def }} 防 / +{{ dungeonEquipBonuses.hp }} 生命
              </p>
            </section>

            <section class="xx-roster-card">
              <div class="xx-card-head">
                <p>当前队伍</p>
                <span>最多上阵 4 人</span>
              </div>
              <div class="xx-team-row">
                <button
                  v-for="(member, slotIndex) in dungeonActivePartySlots"
                  :key="member ? member.id : `team-empty-tent-${slotIndex}`"
                  class="xx-team-member-btn"
                  type="button"
                  :class="{
                    'is-active': member && selectedPartyMemberDetail && selectedPartyMemberDetail.member.id === member.id,
                    'is-empty': !member,
                  }"
                  :disabled="!member"
                  @click="selectPartyMember(member)"
                >
                  {{ member ? member.name : '空位' }}
                </button>
              </div>
              <div v-if="selectedPartyMemberDetail" class="xx-team-detail">
                <p class="xx-team-detail-name">{{ selectedPartyMemberDetail.member.name }}</p>
                <p class="xx-team-detail-line">职业：{{ selectedPartyMemberDetail.member.role || '冒险者' }}</p>
                <p class="xx-team-detail-line">
                  等级：Lv.{{ selectedPartyMemberDetail.level }}　HP：{{ selectedPartyMemberDetail.hp }}/{{ selectedPartyMemberDetail.maxHp }}
                </p>
                <p class="xx-team-detail-line">战力：{{ selectedPartyMemberDetail.power }}</p>
              </div>
              <div v-else class="xx-team-detail is-empty">
                队伍暂无角色，请先在世界书添加角色。
              </div>
            </section>

            <section class="xx-log-card">
              <div class="xx-card-head">
                <p>营地记录（最新在上）</p>
                <span>{{ state.logs.length }} 条</span>
              </div>
              <div ref="logListRef" class="xx-log-list">
                <p v-for="(line, idx) in recentLogs" :key="`${idx}-${line}`" class="xx-log-line">{{ line }}</p>
              </div>
            </section>

            <section class="xx-action-grid">
              <button class="xx-btn is-ghost" type="button" :disabled="isBusy" @click="resetRun">重置进度</button>
            </section>
          </template>

            <p v-if="errorText" class="xx-error">{{ errorText }}</p>
          </main>
        </template>
      </article>
    </Transition>
  </section>
</template>

<style scoped src="./styles/index.css"></style>
