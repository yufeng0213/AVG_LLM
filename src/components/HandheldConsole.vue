<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { kvStorage } from '../storage/index.js'
import {
  generateHandheldBrickLevel,
  generateHandheldPetProfile,
  generateHandheldPetReply,
  generateHandheldDungeonScene,
  generateHandheldDungeonBanter,
} from '../llm/index.js'
import { isAndroid } from '../utils/platform.js'

defineProps({
  worldBook: {
    type: Object,
    default: null,
  },
  saveSlotId: {
    type: [String, Number],
    default: '',
  },
})

const BOARD_SIZE = 4
const POSITION_STORAGE_KEY = 'handheld-position'
const BEST_SCORE_STORAGE_KEY = 'handheld-2048-best-score'
const MINES_BEST_TIMES_STORAGE_KEY = 'handheld-mines-best-times'
const TETRIS_BEST_SCORE_STORAGE_KEY = 'handheld-tetris-best-score'
const BRICK_BEST_SCORE_STORAGE_KEY = 'handheld-brick-best-score'
const KLOTSKI_BEST_STEP_STORAGE_KEY = 'handheld-klotski-best-step'
const PET_STATE_STORAGE_KEY = 'handheld-pet-state'
const DUNGEON_STATE_STORAGE_KEY = 'handheld-dungeon-state'
const GAME_ID_2048 = '2048'
const GAME_ID_MINESWEEPER = 'minesweeper'
const GAME_ID_TETRIS = 'tetris'
const GAME_ID_BRICK = 'brick'
const GAME_ID_KLOTSKI = 'klotski'
const GAME_ID_PET = 'pet'
const GAME_ID_DUNGEON = 'dungeon'
const TETRIS_ROWS = 20
const TETRIS_COLS = 10
const TETRIS_DROP_INTERVAL_MS = 760
const TETRIS_MIN_DROP_INTERVAL_MS = 140
const TETRIS_DROP_STEP_MS = 58
const BRICK_WORLD_WIDTH = 320
const BRICK_WORLD_HEIGHT = 220
const BRICK_PADDLE_HEIGHT = 8
const BRICK_BALL_RADIUS = 4
const BRICK_PADDLE_SPEED = 290
const BRICK_MAX_SPEED = 520
const BRICK_MIN_SPEED = 240
const KLOTSKI_COLS = 4
const KLOTSKI_ROWS = 5
const MINES_LONG_PRESS_MS = 360
const MINES_MODE_REVEAL = 'reveal'
const MINES_MODE_FLAG = 'flag'
const PET_FOOD_PRICE = 12
const PET_DECAY_INTERVAL_MS = 30000
const PET_SPECIES_LIST = ['cat', 'dog', 'fox', 'rabbit', 'slime', 'dragon']
const PET_THEME_LIST = ['mint', 'peach', 'sky', 'violet', 'lime']
const PET_PIXEL_PATTERNS = {
  cat: ['01011010', '01111110', '11122111', '11111111', '11133111', '01111110', '00111100', '00100100'],
  dog: ['01100110', '01111110', '11122111', '11111111', '11133111', '01111110', '00111100', '00100100'],
  fox: ['10000001', '11011011', '11122111', '11111111', '11133111', '01111110', '00111100', '00011000'],
  rabbit: ['01000010', '01100110', '01122110', '11111111', '11133111', '01111110', '00111100', '00011000'],
  slime: ['00000000', '00111100', '01122110', '11111111', '11133111', '01111110', '00111100', '00000000'],
  dragon: ['01011010', '11111111', '11122111', '11111111', '11133111', '01111110', '00111100', '01000010'],
}
const PET_REPLY_FALLBACKS = {
  feed: ['好香呀！我再来一口。', '这份食物太棒了，我元气恢复！', '肚子暖暖的，想跟你贴贴。'],
  pet: ['摸摸好舒服，我喜欢你。', '你一摸我就开心到转圈。', '再摸一下，我会更乖一点。'],
  buy_food: ['库存补满啦，我们不怕饿肚子。', '我看到零食啦，眼睛都亮了。', '有吃的就安心，今天继续冒险。'],
  idle: ['我在等你下一步指令。', '要不要陪我玩一会儿？', '今天也一起加油吧。'],
}
const DUNGEON_TEAMMATE_SINGLE_COST = 160
const DUNGEON_EQUIPMENT_SINGLE_COST = 120
const DUNGEON_TEAMMATE_PITY_LIMIT = 70
const DUNGEON_EQUIPMENT_PITY_LIMIT = 60
const DUNGEON_TEAMMATE_POOL = [
  { name: '雾刃·柊', rarity: 'SSR', role: '刺客', power: 62, skill: '背刺后排目标，追加暴击伤害' },
  { name: '焰枪·伊洛', rarity: 'SSR', role: '战士', power: 58, skill: '对首领造成破甲' },
  { name: '钟塔魔女·艾芙', rarity: 'SSR', role: '法师', power: 60, skill: '群体法术并附带灼烧' },
  { name: '圣光医师·琳', rarity: 'SR', role: '治疗', power: 45, skill: '战斗后恢复额外生命' },
  { name: '石盾守卫·塔恩', rarity: 'SR', role: '坦克', power: 43, skill: '降低受到的首轮伤害' },
  { name: '游侠·维拉', rarity: 'SR', role: '射手', power: 42, skill: '提升探索收益' },
  { name: '见习剑士·阿离', rarity: 'R', role: '战士', power: 30, skill: '基础输出稳定' },
  { name: '炼金学徒·米娅', rarity: 'R', role: '辅助', power: 28, skill: '偶尔带回额外金币' },
  { name: '侦察兵·灰羽', rarity: 'R', role: '侦查', power: 29, skill: '提升遭遇预判' },
]
const DUNGEON_EQUIPMENT_POOL = [
  { name: '冥火长刃', rarity: 'SSR', slot: 'weapon', atk: 36, def: 0, hp: 0, desc: '命中后引发灼烧' },
  { name: '星穹法典', rarity: 'SSR', slot: 'weapon', atk: 34, def: 0, hp: 6, desc: '法术伤害大幅提升' },
  { name: '古龙铠甲', rarity: 'SSR', slot: 'armor', atk: 0, def: 24, hp: 42, desc: '高额减伤' },
  { name: '追猎之弓', rarity: 'SR', slot: 'weapon', atk: 24, def: 0, hp: 0, desc: '提高先手压制' },
  { name: '守夜披风', rarity: 'SR', slot: 'armor', atk: 0, def: 16, hp: 24, desc: '提高生存能力' },
  { name: '苍银徽章', rarity: 'SR', slot: 'relic', atk: 8, def: 8, hp: 18, desc: '属性均衡增益' },
  { name: '锻铁短剑', rarity: 'R', slot: 'weapon', atk: 14, def: 0, hp: 0, desc: '基础锋锐' },
  { name: '旅行皮甲', rarity: 'R', slot: 'armor', atk: 0, def: 9, hp: 12, desc: '轻装护体' },
  { name: '旧王戒', rarity: 'R', slot: 'relic', atk: 5, def: 4, hp: 10, desc: '微弱祝福' },
]
const DUNGEON_BANTER_FALLBACKS = [
  '这迷宫像是故意绕晕人的。',
  '别担心，我会盯住前面的岔路。',
  'BOSS 看起来很吓人，但我们更狠。',
  '抽卡别太上头，先保住补给。',
  '这件装备终于像样了，继续冲层。',
]
const DUNGEON_RARITY_SET = new Set(['R', 'SR', 'SSR'])
const DUNGEON_SLOT_SET = new Set(['weapon', 'armor', 'relic'])
const MINES_DIFFICULTIES = [
  { id: 'beginner', name: '初级', rows: 9, cols: 9, mines: 10 },
  { id: 'medium', name: '中级', rows: 11, cols: 11, mines: 20 },
  { id: 'hard', name: '高级', rows: 13, cols: 13, mines: 32 },
]

const isAndroidPlatform = isAndroid()

const handheldRef = ref(null)
const boardRef = ref(null)
const brickFieldRef = ref(null)

const clampPetMetric = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

const pickRandomItem = (list, fallback = '') => {
  if (!Array.isArray(list) || list.length === 0) return fallback
  const index = Math.floor(Math.random() * list.length)
  return list[index]
}

const buildDefaultPetState = () => ({
  adopted: false,
  profile: null,
  mood: 62,
  hunger: 56,
  affection: 52,
  energy: 70,
  coins: 120,
  food: 3,
  dialogue: '领养一只像素宠物吧',
  lastTickAt: Date.now(),
})

const buildDefaultDungeonState = () => ({
  started: true,
  floor: 1,
  level: 1,
  exp: 0,
  hp: 132,
  maxHp: 132,
  coins: 220,
  gems: 1800,
  teammatePity: 0,
  equipmentPity: 0,
  teammates: [
    {
      id: 'starter-ali',
      name: '见习剑士·阿离',
      rarity: 'R',
      role: '战士',
      power: 30,
      skill: '基础输出稳定',
    },
  ],
  equipments: [],
  equipped: {
    weapon: null,
    armor: null,
    relic: null,
  },
  logs: ['欢迎来到 xx大冒险，地下城第 1 层已开启。'],
  lastBanter: '',
  lastScene: '',
})

const isOpen = ref(false)
const currentView = ref('library')
const selectedGameId = ref('')
const isDragging = ref(false)
const dragMoved = ref(false)
const activePointerId = ref(null)
const pointerCaptureTarget = ref(null)
const dragStartPos = ref({ x: 0, y: 0 })
const pluginStartPos = ref({ x: 0, y: 0 })

const swipeState = ref({
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
})

const createEmptyBoard = () =>
  Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0))

const createEmptyMinesBoard = (rows, cols) =>
  Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacent: 0,
    })),
  )

const createEmptyTetrisBoard = () =>
  Array.from({ length: TETRIS_ROWS }, () => Array(TETRIS_COLS).fill(0))

const TETRIS_PIECES = {
  I: { matrix: [[1, 1, 1, 1]], color: 1 },
  O: { matrix: [[1, 1], [1, 1]], color: 2 },
  T: { matrix: [[0, 1, 0], [1, 1, 1]], color: 3 },
  S: { matrix: [[0, 1, 1], [1, 1, 0]], color: 4 },
  Z: { matrix: [[1, 1, 0], [0, 1, 1]], color: 5 },
  J: { matrix: [[1, 0, 0], [1, 1, 1]], color: 6 },
  L: { matrix: [[0, 0, 1], [1, 1, 1]], color: 7 },
}
const TETRIS_TYPES = Object.keys(TETRIS_PIECES)
const KLOTSKI_TEMPLATES = [
  { id: 'cao', label: '曹操', width: 2, height: 2, kind: 'cao' },
  { id: 'v1', label: '关', width: 1, height: 2, kind: 'general' },
  { id: 'v2', label: '张', width: 1, height: 2, kind: 'general' },
  { id: 'v3', label: '赵', width: 1, height: 2, kind: 'general' },
  { id: 'v4', label: '马', width: 1, height: 2, kind: 'general' },
  { id: 'h1', label: '黄忠', width: 2, height: 1, kind: 'general' },
  { id: 's1', label: '兵', width: 1, height: 1, kind: 'soldier' },
  { id: 's2', label: '兵', width: 1, height: 1, kind: 'soldier' },
  { id: 's3', label: '兵', width: 1, height: 1, kind: 'soldier' },
  { id: 's4', label: '兵', width: 1, height: 1, kind: 'soldier' },
]
const KLOTSKI_DIRECTIONS = [
  { key: 'up', dx: 0, dy: -1, label: '↑' },
  { key: 'left', dx: -1, dy: 0, label: '←' },
  { key: 'down', dx: 0, dy: 1, label: '↓' },
  { key: 'right', dx: 1, dy: 0, label: '→' },
]
const KLOTSKI_SOLVED_POSITIONS = {
  cao: [1, 3],
  v1: [0, 0],
  v2: [3, 0],
  v3: [0, 2],
  v4: [3, 2],
  h1: [1, 1],
  s1: [1, 2],
  s2: [2, 2],
  s3: [0, 4],
  s4: [3, 4],
}
const KLOTSKI_CLASSIC_START_POSITIONS = {
  cao: [1, 0],
  v1: [0, 0],
  v2: [3, 0],
  v3: [0, 2],
  v4: [3, 2],
  h1: [1, 2],
  s1: [1, 3],
  s2: [2, 3],
  s3: [0, 4],
  s4: [3, 4],
}

const getDefaultPosition = () => {
  if (typeof window === 'undefined') {
    return { x: 20, y: 80 }
  }
  return {
    x: Math.max(8, window.innerWidth - 86),
    y: Math.max(8, window.innerHeight - 220),
  }
}

const pluginPosition = ref(getDefaultPosition())
const board = ref(createEmptyBoard())
const score = ref(0)
const bestScore = ref(0)
const gameOver = ref(false)
const reached2048 = ref(false)
const has2048Initialized = ref(false)
const minesDifficulty = ref(MINES_DIFFICULTIES[0].id)
const minesBoard = ref(createEmptyMinesBoard(MINES_DIFFICULTIES[0].rows, MINES_DIFFICULTIES[0].cols))
const minesMode = ref(MINES_MODE_REVEAL)
const minesStarted = ref(false)
const minesOver = ref(false)
const minesWon = ref(false)
const minesElapsed = ref(0)
const minesFlagCount = ref(0)
const minesBestTimes = ref({})
const minesNewRecord = ref(false)
const suppressNextMinesClick = ref(false)
const minesLongPressState = ref({
  active: false,
  pointerId: null,
  row: -1,
  col: -1,
  triggered: false,
})
const tetrisBoard = ref(createEmptyTetrisBoard())
const tetrisCurrent = ref(null)
const tetrisNextType = ref('')
const tetrisScore = ref(0)
const tetrisLines = ref(0)
const tetrisLevel = ref(1)
const tetrisBestScore = ref(0)
const tetrisOver = ref(false)
const klotskiPieces = ref([])
const klotskiMoves = ref(0)
const klotskiBestSteps = ref(0)
const klotskiSolved = ref(false)
const klotskiGenerating = ref(false)
const klotskiSelectedPieceId = ref('cao')
const klotskiMeta = ref({
  scrambleSteps: 0,
  uniqueStates: 0,
  complexity: 0,
})
const petState = ref(buildDefaultPetState())
const isAdoptingPet = ref(false)
const isPetReplying = ref(false)
const petError = ref('')
const petBlinking = ref(false)
const dungeonState = ref(buildDefaultDungeonState())
const isDungeonExploring = ref(false)
const isDungeonDrawing = ref(false)
const isDungeonGeneratingBanter = ref(false)
const dungeonError = ref('')
const brickBricks = ref([])
const brickPaddle = ref({
  x: BRICK_WORLD_WIDTH * 0.5 - BRICK_WORLD_WIDTH * 0.09,
  y: BRICK_WORLD_HEIGHT - 18,
  width: BRICK_WORLD_WIDTH * 0.18,
  height: BRICK_PADDLE_HEIGHT,
})
const brickBall = ref({
  x: BRICK_WORLD_WIDTH * 0.5,
  y: BRICK_WORLD_HEIGHT - 24,
  vx: 0,
  vy: 0,
  radius: BRICK_BALL_RADIUS,
  stuck: true,
})
const brickScore = ref(0)
const brickBestScore = ref(0)
const brickLives = ref(3)
const brickStage = ref(1)
const brickLevelConfig = ref(null)
const brickLoadingLevel = ref(false)
const brickConfigSource = ref('fallback')
const brickConfigError = ref('')
const brickOver = ref(false)
const brickLevelCleared = ref(false)
const brickControlDir = ref(0)
const brickPointerId = ref(null)
const hasBrickInitialized = ref(false)
const hasKlotskiInitialized = ref(false)
const hasTetrisInitialized = ref(false)
const hasMinesInitialized = ref(false)
const hasDungeonInitialized = ref(false)
let minesTimerId = null
let minesLongPressTimerId = null
let tetrisTimerId = null
let brickRafId = null
let brickLastFrameTs = 0
let petDecayTimerId = null
let petBlinkTimerId = null

const games = [
  {
    id: GAME_ID_2048,
    name: '2048',
    icon: '🔢',
    subtitle: '合并数字冲高分',
    enabled: true,
  },
  {
    id: GAME_ID_MINESWEEPER,
    name: '扫雷',
    icon: '💣',
    subtitle: '找出全部地雷',
    enabled: true,
  },
  {
    id: GAME_ID_TETRIS,
    name: '俄罗斯方块',
    icon: '🧱',
    subtitle: '消行冲分',
    enabled: true,
  },
  {
    id: GAME_ID_BRICK,
    name: '打砖块',
    icon: '🏓',
    subtitle: '反弹击碎砖块',
    enabled: true,
  },
  {
    id: GAME_ID_KLOTSKI,
    name: '华容道',
    icon: '🧩',
    subtitle: '滑块解谜',
    enabled: true,
  },
  {
    id: GAME_ID_PET,
    name: '像素宠物',
    icon: '🐾',
    subtitle: '领养并照顾伙伴',
    enabled: true,
  },
  {
    id: GAME_ID_DUNGEON,
    name: 'xx大冒险',
    icon: '⚔️',
    subtitle: '地下城RPG+抽卡',
    enabled: true,
  },
  {
    id: 'snake',
    name: '贪吃蛇',
    icon: '🐍',
    subtitle: '开发中',
    enabled: false,
  },
  {
    id: 'racing',
    name: '极速赛道',
    icon: '🏎️',
    subtitle: '开发中',
    enabled: false,
  },
]

const flatBoard = computed(() => board.value.flat())
const isIn2048Game = computed(() => currentView.value === 'game' && selectedGameId.value === GAME_ID_2048)
const isInMinesweeperGame = computed(
  () => currentView.value === 'game' && selectedGameId.value === GAME_ID_MINESWEEPER,
)
const isInTetrisGame = computed(() => currentView.value === 'game' && selectedGameId.value === GAME_ID_TETRIS)
const isInBrickGame = computed(() => currentView.value === 'game' && selectedGameId.value === GAME_ID_BRICK)
const isInKlotskiGame = computed(() => currentView.value === 'game' && selectedGameId.value === GAME_ID_KLOTSKI)
const isInPetGame = computed(() => currentView.value === 'game' && selectedGameId.value === GAME_ID_PET)
const isInDungeonGame = computed(() => currentView.value === 'game' && selectedGameId.value === GAME_ID_DUNGEON)
const isInAnyGame = computed(
  () =>
    isIn2048Game.value ||
    isInMinesweeperGame.value ||
    isInTetrisGame.value ||
    isInBrickGame.value ||
    isInKlotskiGame.value ||
    isInPetGame.value ||
    isInDungeonGame.value,
)
const showGameOverModal = computed(() => isIn2048Game.value && gameOver.value)
const showMinesResultModal = computed(() => isInMinesweeperGame.value && minesOver.value)
const showTetrisOverModal = computed(() => isInTetrisGame.value && tetrisOver.value)
const showBrickOverModal = computed(() => isInBrickGame.value && brickOver.value)
const showKlotskiWinModal = computed(() => isInKlotskiGame.value && klotskiSolved.value)
const currentMinesConfig = computed(
  () => MINES_DIFFICULTIES.find((item) => item.id === minesDifficulty.value) || MINES_DIFFICULTIES[0],
)
const currentMinesBestTime = computed(() => {
  const stored = Number(minesBestTimes.value[minesDifficulty.value])
  if (!Number.isFinite(stored) || stored <= 0) return null
  return Math.floor(stored)
})
const currentSubtitle = computed(() => {
  if (isIn2048Game.value) return '2048'
  if (isInMinesweeperGame.value) return '扫雷'
  if (isInTetrisGame.value) return '俄罗斯方块'
  if (isInBrickGame.value) return '打砖块'
  if (isInKlotskiGame.value) return '华容道'
  if (isInPetGame.value) return '像素宠物'
  if (isInDungeonGame.value) return 'xx大冒险'
  return '游戏库'
})

const petProfile = computed(() => (petState.value.profile && typeof petState.value.profile === 'object' ? petState.value.profile : null))
const petName = computed(() => petProfile.value?.name || '未领养')
const petMood = computed(() => clampPetMetric(petState.value.mood))
const petHunger = computed(() => clampPetMetric(petState.value.hunger))
const petAffection = computed(() => clampPetMetric(petState.value.affection))
const petEnergy = computed(() => clampPetMetric(petState.value.energy))
const petFoodCount = computed(() => Math.max(0, Number.parseInt(String(petState.value.food), 10) || 0))
const petCoins = computed(() => Math.max(0, Number.parseInt(String(petState.value.coins), 10) || 0))
const canBuyPetFood = computed(() => petCoins.value >= PET_FOOD_PRICE)
const petColorThemeClass = computed(() => {
  const color = String(petProfile.value?.colorTheme || 'mint').trim().toLowerCase()
  return PET_THEME_LIST.includes(color) ? `theme-${color}` : 'theme-mint'
})
const petSpriteClass = computed(() => ({
  'is-blink': petBlinking.value,
  'is-low-energy': petEnergy.value < 25,
  'is-happy': petMood.value >= 70,
}))
const petStatusCards = computed(() => [
  { key: 'mood', label: '心情', value: petMood.value },
  { key: 'hunger', label: '饱腹', value: petHunger.value },
  { key: 'affection', label: '好感', value: petAffection.value },
  { key: 'energy', label: '体力', value: petEnergy.value },
])
const petMoodText = computed(() => {
  if (petMood.value >= 80) return '超开心'
  if (petMood.value >= 60) return '心情不错'
  if (petMood.value >= 35) return '有点无聊'
  return '闷闷不乐'
})
const petPixelCells = computed(() => {
  const species = String(petProfile.value?.species || 'slime').trim().toLowerCase()
  const rows = PET_PIXEL_PATTERNS[species] || PET_PIXEL_PATTERNS.slime
  const cells = []
  for (let y = 0; y < rows.length; y += 1) {
    const row = String(rows[y] || '')
    for (let x = 0; x < row.length; x += 1) {
      const code = row[x]
      if (code === '0') continue
      const type = code === '2' ? 'eye' : code === '3' ? 'accent' : 'body'
      cells.push({
        key: `${x}-${y}-${type}`,
        x,
        y,
        type,
      })
    }
  }
  return cells
})
const dungeonPartySorted = computed(() => {
  const list = Array.isArray(dungeonState.value.teammates) ? dungeonState.value.teammates : []
  return [...list].sort((a, b) => (Number(b?.power) || 0) - (Number(a?.power) || 0))
})
const dungeonActiveParty = computed(() => dungeonPartySorted.value.slice(0, 4))
const dungeonEquipBonuses = computed(() => {
  const equipped = dungeonState.value.equipped && typeof dungeonState.value.equipped === 'object' ? dungeonState.value.equipped : {}
  const slots = [equipped.weapon, equipped.armor, equipped.relic]
  return slots.reduce(
    (total, item) => ({
      atk: total.atk + (Number(item?.atk) || 0),
      def: total.def + (Number(item?.def) || 0),
      hp: total.hp + (Number(item?.hp) || 0),
    }),
    { atk: 0, def: 0, hp: 0 },
  )
})
const dungeonTotalPower = computed(() => {
  const level = Math.max(1, Number.parseInt(String(dungeonState.value.level), 10) || 1)
  const partyPower = dungeonActiveParty.value.reduce((sum, item) => sum + (Number(item?.power) || 0), 0)
  const bonusAtk = dungeonEquipBonuses.value.atk
  return Math.max(8, level * 16 + partyPower + bonusAtk)
})
const dungeonLevelNeedExp = computed(() => {
  const level = Math.max(1, Number.parseInt(String(dungeonState.value.level), 10) || 1)
  return level * 100
})
const dungeonHpPercent = computed(() => {
  const hp = Math.max(0, Number(dungeonState.value.hp) || 0)
  const maxHp = Math.max(1, Number(dungeonState.value.maxHp) || 1)
  return Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)))
})
const dungeonRecentLogs = computed(() => {
  const list = Array.isArray(dungeonState.value.logs) ? dungeonState.value.logs : []
  return list.slice(-24)
})
const dungeonCanDrawTeammateSingle = computed(
  () => !isDungeonDrawing.value && (Number(dungeonState.value.gems) || 0) >= DUNGEON_TEAMMATE_SINGLE_COST,
)
const dungeonCanDrawTeammateTen = computed(
  () => !isDungeonDrawing.value && (Number(dungeonState.value.gems) || 0) >= DUNGEON_TEAMMATE_SINGLE_COST * 10,
)
const dungeonCanDrawEquipmentSingle = computed(
  () => !isDungeonDrawing.value && (Number(dungeonState.value.gems) || 0) >= DUNGEON_EQUIPMENT_SINGLE_COST,
)
const dungeonCanDrawEquipmentTen = computed(
  () => !isDungeonDrawing.value && (Number(dungeonState.value.gems) || 0) >= DUNGEON_EQUIPMENT_SINGLE_COST * 10,
)
const minesCells = computed(() => {
  const cells = []
  for (let row = 0; row < currentMinesConfig.value.rows; row += 1) {
    for (let col = 0; col < currentMinesConfig.value.cols; col += 1) {
      cells.push({
        key: `${row}-${col}`,
        row,
        col,
        cell: minesBoard.value[row][col],
      })
    }
  }
  return cells
})
const minesRemaining = computed(() => Math.max(0, currentMinesConfig.value.mines - minesFlagCount.value))
const minesBoardStyle = computed(() => ({
  gridTemplateColumns: `repeat(${currentMinesConfig.value.cols}, minmax(0, 1fr))`,
}))
const minesBoardClass = computed(() => ({
  'is-compact': currentMinesConfig.value.cols >= 11,
  'is-dense': currentMinesConfig.value.cols >= 13,
}))
const tetrisDisplayCells = computed(() => {
  const display = tetrisBoard.value.map((row) => [...row])
  const piece = tetrisCurrent.value
  if (piece && !tetrisOver.value) {
    const matrix = getTetrisMatrix(piece.type, piece.rotation)
    const color = TETRIS_PIECES[piece.type]?.color || 1
    for (let row = 0; row < matrix.length; row += 1) {
      for (let col = 0; col < matrix[row].length; col += 1) {
        if (!matrix[row][col]) continue
        const nextRow = piece.row + row
        const nextCol = piece.col + col
        if (nextRow < 0 || nextRow >= TETRIS_ROWS || nextCol < 0 || nextCol >= TETRIS_COLS) continue
        display[nextRow][nextCol] = color
      }
    }
  }

  const cells = []
  for (let row = 0; row < TETRIS_ROWS; row += 1) {
    for (let col = 0; col < TETRIS_COLS; col += 1) {
      cells.push({
        key: `${row}-${col}`,
        value: display[row][col],
      })
    }
  }
  return cells
})
const tetrisNextCells = computed(() => {
  const size = 4
  const preview = Array.from({ length: size }, () => Array(size).fill(0))
  const nextType = tetrisNextType.value || TETRIS_TYPES[0]
  const matrix = getTetrisMatrix(nextType, 0)
  const color = TETRIS_PIECES[nextType]?.color || 1
  const offsetRow = Math.floor((size - matrix.length) / 2)
  const offsetCol = Math.floor((size - matrix[0].length) / 2)

  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix[row].length; col += 1) {
      if (!matrix[row][col]) continue
      const nextRow = row + offsetRow
      const nextCol = col + offsetCol
      if (nextRow < 0 || nextRow >= size || nextCol < 0 || nextCol >= size) continue
      preview[nextRow][nextCol] = color
    }
  }

  const cells = []
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      cells.push({
        key: `${row}-${col}`,
        value: preview[row][col],
      })
    }
  }
  return cells
})
const brickBallStyle = computed(() => ({
  left: `${(brickBall.value.x / BRICK_WORLD_WIDTH) * 100}%`,
  top: `${(brickBall.value.y / BRICK_WORLD_HEIGHT) * 100}%`,
  width: `${(brickBall.value.radius * 2 / BRICK_WORLD_WIDTH) * 100}%`,
  height: `${(brickBall.value.radius * 2 / BRICK_WORLD_HEIGHT) * 100}%`,
}))
const brickPaddleStyle = computed(() => ({
  left: `${(brickPaddle.value.x / BRICK_WORLD_WIDTH) * 100}%`,
  top: `${(brickPaddle.value.y / BRICK_WORLD_HEIGHT) * 100}%`,
  width: `${(brickPaddle.value.width / BRICK_WORLD_WIDTH) * 100}%`,
  height: `${(brickPaddle.value.height / BRICK_WORLD_HEIGHT) * 100}%`,
}))
const brickRemainingBricks = computed(() => brickBricks.value.filter((item) => item.hp > 0).length)
const brickSourceLabel = computed(() =>
  brickConfigSource.value === 'llm' ? '智能关卡' : '本地关卡',
)
const klotskiSelectedPiece = computed(() =>
  klotskiPieces.value.find((item) => item.id === klotskiSelectedPieceId.value) || null,
)
const klotskiDifficultyLabel = computed(() => {
  const complexity = Number(klotskiMeta.value.complexity) || 0
  if (complexity >= 92) return '高'
  if (complexity >= 68) return '中'
  return '低'
})
const klotskiMoveMap = computed(() => {
  const map = {
    up: null,
    left: null,
    down: null,
    right: null,
  }
  if (!isInKlotskiGame.value || klotskiGenerating.value || klotskiSolved.value) {
    return map
  }

  const selectedId = klotskiSelectedPieceId.value
  if (!selectedId) return map
  const moves = getKlotskiAvailableMoves(klotskiPieces.value)
  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index]
    if (move.pieceId !== selectedId) continue
    map[move.key] = move
  }
  return map
})
const klotskiBoardCells = computed(() => {
  const cells = []
  for (let y = 0; y < KLOTSKI_ROWS; y += 1) {
    for (let x = 0; x < KLOTSKI_COLS; x += 1) {
      cells.push({
        key: `${x}-${y}`,
      })
    }
  }
  return cells
})

const getEmptyCells = (targetBoard) => {
  const cells = []
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (!targetBoard[r][c]) {
        cells.push({ r, c })
      }
    }
  }
  return cells
}

const spawnRandomTile = (targetBoard, count = 1) => {
  for (let i = 0; i < count; i += 1) {
    const emptyCells = getEmptyCells(targetBoard)
    if (emptyCells.length === 0) return

    const pick = emptyCells[Math.floor(Math.random() * emptyCells.length)]
    targetBoard[pick.r][pick.c] = Math.random() < 0.9 ? 2 : 4
  }
}

const collapseLine = (line) => {
  const compact = line.filter((value) => value !== 0)
  const nextLine = []
  let gained = 0

  for (let index = 0; index < compact.length; index += 1) {
    const current = compact[index]
    const next = compact[index + 1]
    if (next !== undefined && next === current) {
      const merged = current * 2
      nextLine.push(merged)
      gained += merged
      index += 1
    } else {
      nextLine.push(current)
    }
  }

  while (nextLine.length < BOARD_SIZE) {
    nextLine.push(0)
  }

  return {
    line: nextLine,
    gained,
    changed: nextLine.some((value, index) => value !== line[index]),
    maxValue: nextLine.reduce((max, value) => Math.max(max, value), 0),
  }
}

const hasAvailableMoves = (targetBoard) => {
  if (getEmptyCells(targetBoard).length > 0) return true

  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const value = targetBoard[r][c]
      if (r + 1 < BOARD_SIZE && targetBoard[r + 1][c] === value) return true
      if (c + 1 < BOARD_SIZE && targetBoard[r][c + 1] === value) return true
    }
  }

  return false
}

const persistBestScore = async () => {
  try {
    await kvStorage.set(BEST_SCORE_STORAGE_KEY, bestScore.value)
  } catch {
    // no-op
  }
}

const persistMinesBestTimes = async () => {
  try {
    await kvStorage.set(MINES_BEST_TIMES_STORAGE_KEY, minesBestTimes.value)
  } catch {
    // no-op
  }
}

const persistTetrisBestScore = async () => {
  try {
    await kvStorage.set(TETRIS_BEST_SCORE_STORAGE_KEY, tetrisBestScore.value)
  } catch {
    // no-op
  }
}

const createLocalPetProfile = () => {
  const species = pickRandomItem(PET_SPECIES_LIST, 'slime')
  const colorTheme = pickRandomItem(PET_THEME_LIST, 'mint')
  const names = ['团团', '泡泡', '栗子', '小闪', '米露', '咕噜']
  const titles = ['口袋探险家', '夜灯守护者', '零食侦探', '像素小队长', '掌机陪伴官']
  const personalities = ['好奇又黏人', '爱撒娇、胆子小但很勇敢', '行动派，喜欢跟着你冒险', '外冷内热，熟了就话多']
  const foods = ['宠物饼干', '果冻块', '小鱼干', '蜂蜜豆', '星星糖粒']
  const name = pickRandomItem(names, '团团')

  return {
    name,
    species,
    title: pickRandomItem(titles, '口袋小伙伴'),
    personality: pickRandomItem(personalities, '好奇又黏人'),
    colorTheme,
    favoriteFood: pickRandomItem(foods, '宠物饼干'),
    openingLine: `${name} 抖了抖耳朵，已经认你当伙伴啦。`,
  }
}

const normalizePetProfile = (rawProfile) => {
  if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) return null
  const name = String(rawProfile.name || '').trim().slice(0, 10)
  if (!name) return null

  const speciesRaw = String(rawProfile.species || '').trim().toLowerCase()
  const colorRaw = String(rawProfile.colorTheme || rawProfile.color || '').trim().toLowerCase()

  return {
    name,
    species: PET_SPECIES_LIST.includes(speciesRaw) ? speciesRaw : 'slime',
    title: String(rawProfile.title || '口袋小伙伴').trim().slice(0, 20) || '口袋小伙伴',
    personality: String(rawProfile.personality || '好奇又黏人').trim().slice(0, 36) || '好奇又黏人',
    colorTheme: PET_THEME_LIST.includes(colorRaw) ? colorRaw : 'mint',
    favoriteFood: String(rawProfile.favoriteFood || '宠物饼干').trim().slice(0, 14) || '宠物饼干',
    openingLine: String(rawProfile.openingLine || `${name} 来啦，今天也一起冒险吧。`).trim().slice(0, 48),
  }
}

const normalizePetState = (rawValue) => {
  const defaultState = buildDefaultPetState()
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return defaultState
  }

  const profile = normalizePetProfile(rawValue.profile)
  const adopted = Boolean(rawValue.adopted && profile)
  const coins = Math.max(0, Number.parseInt(String(rawValue.coins), 10) || defaultState.coins)
  const food = Math.max(0, Number.parseInt(String(rawValue.food), 10) || defaultState.food)
  const lastTickRaw = Number(rawValue.lastTickAt)
  const lastTickAt = Number.isFinite(lastTickRaw) && lastTickRaw > 0 ? lastTickRaw : Date.now()
  const fallbackDialogue = adopted ? (profile?.openingLine || defaultState.dialogue) : defaultState.dialogue

  return {
    adopted,
    profile: adopted ? profile : null,
    mood: clampPetMetric(rawValue.mood ?? defaultState.mood),
    hunger: clampPetMetric(rawValue.hunger ?? defaultState.hunger),
    affection: clampPetMetric(rawValue.affection ?? defaultState.affection),
    energy: clampPetMetric(rawValue.energy ?? defaultState.energy),
    coins,
    food,
    dialogue: String(rawValue.dialogue || fallbackDialogue).trim().slice(0, 80) || fallbackDialogue,
    lastTickAt,
  }
}

const getPetPersistPayload = () => ({
  adopted: Boolean(petState.value.adopted),
  profile: petState.value.profile && typeof petState.value.profile === 'object' ? petState.value.profile : null,
  mood: petMood.value,
  hunger: petHunger.value,
  affection: petAffection.value,
  energy: petEnergy.value,
  coins: petCoins.value,
  food: petFoodCount.value,
  dialogue: String(petState.value.dialogue || '').trim().slice(0, 80),
  lastTickAt: Number(petState.value.lastTickAt) || Date.now(),
})

const persistPetState = async () => {
  try {
    await kvStorage.set(PET_STATE_STORAGE_KEY, getPetPersistPayload())
  } catch {
    // no-op
  }
}

const loadPetState = async () => {
  try {
    const stored = await kvStorage.get(PET_STATE_STORAGE_KEY)
    petState.value = normalizePetState(stored)
  } catch {
    petState.value = buildDefaultPetState()
  }
}

const applyPetDecayByElapsed = (now = Date.now()) => {
  const current = petState.value
  const lastTickRaw = Number(current.lastTickAt)
  const lastTick = Number.isFinite(lastTickRaw) && lastTickRaw > 0 ? lastTickRaw : now
  const elapsedMinutes = Math.max(0, (now - lastTick) / 60000)

  if (!current.adopted || elapsedMinutes < 0.2) {
    petState.value = {
      ...current,
      lastTickAt: now,
    }
    return false
  }

  const hungerLoss = elapsedMinutes * 1.75
  const energyLoss = elapsedMinutes * 1.2
  const moodLoss = elapsedMinutes * 0.95
  const affectionLoss = current.hunger < 22 || current.energy < 18 ? elapsedMinutes * 0.7 : 0

  petState.value = {
    ...current,
    hunger: clampPetMetric(current.hunger - hungerLoss),
    energy: clampPetMetric(current.energy - energyLoss),
    mood: clampPetMetric(current.mood - moodLoss),
    affection: clampPetMetric(current.affection - affectionLoss),
    lastTickAt: now,
  }
  return true
}

const stopPetDecayLoop = () => {
  if (petDecayTimerId !== null) {
    clearInterval(petDecayTimerId)
    petDecayTimerId = null
  }
}

const startPetDecayLoop = () => {
  stopPetDecayLoop()
  if (!petState.value.adopted) return
  petDecayTimerId = setInterval(() => {
    const changed = applyPetDecayByElapsed(Date.now())
    if (changed) {
      void persistPetState()
    }
  }, PET_DECAY_INTERVAL_MS)
}

const stopPetBlinkLoop = () => {
  if (petBlinkTimerId !== null) {
    clearInterval(petBlinkTimerId)
    petBlinkTimerId = null
  }
  petBlinking.value = false
}

const startPetBlinkLoop = () => {
  stopPetBlinkLoop()
  petBlinkTimerId = setInterval(() => {
    petBlinking.value = true
    setTimeout(() => {
      petBlinking.value = false
    }, 140)
  }, 3100)
}

const getPetReplyFallback = (action, fallbackLine = '') => {
  const fallbackList = PET_REPLY_FALLBACKS[action]
  if (Array.isArray(fallbackList) && fallbackList.length > 0) {
    return pickRandomItem(fallbackList, fallbackLine)
  }
  return fallbackLine || pickRandomItem(PET_REPLY_FALLBACKS.idle, '今天也一起加油吧。')
}

const requestPetReply = async (action, fallbackLine = '') => {
  if (!petState.value.adopted || !petProfile.value) return
  const fallback = getPetReplyFallback(action, fallbackLine)

  isPetReplying.value = true
  try {
    const result = await generateHandheldPetReply({
      action,
      petProfile: petProfile.value,
      stats: {
        mood: petMood.value,
        hunger: petHunger.value,
        affection: petAffection.value,
        energy: petEnergy.value,
        food: petFoodCount.value,
        coins: petCoins.value,
      },
    })

    const dialogue = result.success && result.line ? result.line : fallback
    petState.value = {
      ...petState.value,
      dialogue,
      lastTickAt: Date.now(),
    }
    if (!result.success) {
      petError.value = result.error || '宠物回复生成失败，已使用本地文案'
    }
  } finally {
    isPetReplying.value = false
    await persistPetState()
  }
}

const adoptPet = async () => {
  if (isAdoptingPet.value) return
  petError.value = ''
  isAdoptingPet.value = true

  try {
    const result = await generateHandheldPetProfile({})
    const profile = result.success && result.profile ? result.profile : createLocalPetProfile()

    petState.value = {
      adopted: true,
      profile,
      mood: 72,
      hunger: 68,
      affection: 63,
      energy: 78,
      coins: Math.max(80, petCoins.value),
      food: Math.max(3, petFoodCount.value),
      dialogue: String(profile.openingLine || `${profile.name} 开心地围着你转圈。`).trim(),
      lastTickAt: Date.now(),
    }

    if (!result.success) {
      petError.value = result.error || 'LLM 领养失败，已切换本地宠物模板'
    }

    startPetBlinkLoop()
    startPetDecayLoop()
    await persistPetState()
  } finally {
    isAdoptingPet.value = false
  }
}

const buyPetFood = async () => {
  if (!petState.value.adopted || !petProfile.value) return
  petError.value = ''

  if (!canBuyPetFood.value) {
    petError.value = '金币不足，无法购买食物'
    return
  }

  applyPetDecayByElapsed(Date.now())
  petState.value = {
    ...petState.value,
    coins: Math.max(0, petCoins.value - PET_FOOD_PRICE),
    food: petFoodCount.value + 1,
    mood: clampPetMetric(petMood.value + 2),
    dialogue: `${petName.value} 盯着新买的食物，眼睛亮晶晶。`,
    lastTickAt: Date.now(),
  }
  await persistPetState()
  await requestPetReply('buy_food', `${petName.value} 开心地蹭了蹭你的手。`)
}

const feedPet = async () => {
  if (!petState.value.adopted || !petProfile.value) return
  petError.value = ''
  applyPetDecayByElapsed(Date.now())

  if (petFoodCount.value <= 0) {
    petError.value = '没有食物了，先去购买吧'
    return
  }

  petState.value = {
    ...petState.value,
    food: Math.max(0, petFoodCount.value - 1),
    hunger: clampPetMetric(petHunger.value + 22),
    mood: clampPetMetric(petMood.value + 6),
    affection: clampPetMetric(petAffection.value + 4),
    energy: clampPetMetric(petEnergy.value + 3),
    dialogue: `${petName.value} 正在开心进食。`,
    lastTickAt: Date.now(),
  }
  await persistPetState()
  await requestPetReply('feed', `${petName.value} 吃得很满足，尾巴都翘起来了。`)
}

const petCompanion = async () => {
  if (!petState.value.adopted || !petProfile.value) return
  petError.value = ''
  applyPetDecayByElapsed(Date.now())

  petState.value = {
    ...petState.value,
    mood: clampPetMetric(petMood.value + 7),
    affection: clampPetMetric(petAffection.value + 9),
    hunger: clampPetMetric(petHunger.value - 1),
    energy: clampPetMetric(petEnergy.value - 2),
    dialogue: `${petName.value} 主动把脸贴过来。`,
    lastTickAt: Date.now(),
  }
  await persistPetState()
  await requestPetReply('pet', `${petName.value} 发出轻轻的呼噜声。`)
}

const resetPetProgress = async () => {
  petError.value = ''
  if (!petState.value.adopted || !petProfile.value) {
    petState.value = buildDefaultPetState()
    await persistPetState()
    return
  }

  petState.value = {
    ...petState.value,
    mood: 68,
    hunger: 62,
    affection: 58,
    energy: 72,
    dialogue: `${petName.value} 伸了个懒腰，状态已重置。`,
    lastTickAt: Date.now(),
  }
  await persistPetState()
}

const clampDungeonInt = (value, min, max, fallback) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

const normalizeDungeonRarity = (value, fallback = 'R') => {
  const rarity = String(value || '').trim().toUpperCase()
  return DUNGEON_RARITY_SET.has(rarity) ? rarity : fallback
}

const normalizeDungeonSlot = (value, fallback = 'weapon') => {
  const slot = String(value || '').trim().toLowerCase()
  return DUNGEON_SLOT_SET.has(slot) ? slot : fallback
}

const getDungeonRandomId = (prefix = 'item') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const normalizeDungeonTeammate = (rawValue, index = 0) => {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null
  const name = String(rawValue.name || '').trim().slice(0, 18)
  if (!name) return null

  return {
    id: String(rawValue.id || `tm-${index}`).trim() || `tm-${index}`,
    name,
    rarity: normalizeDungeonRarity(rawValue.rarity, 'R'),
    role: String(rawValue.role || '冒险者').trim().slice(0, 10) || '冒险者',
    power: clampDungeonInt(rawValue.power, 16, 120, 26),
    skill: String(rawValue.skill || '稳步推进战线').trim().slice(0, 28) || '稳步推进战线',
  }
}

const normalizeDungeonEquipment = (rawValue, index = 0) => {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null
  const name = String(rawValue.name || '').trim().slice(0, 18)
  if (!name) return null

  const slot = normalizeDungeonSlot(rawValue.slot, 'weapon')
  return {
    id: String(rawValue.id || `eq-${index}`).trim() || `eq-${index}`,
    name,
    rarity: normalizeDungeonRarity(rawValue.rarity, 'R'),
    slot,
    atk: clampDungeonInt(rawValue.atk, 0, 120, 0),
    def: clampDungeonInt(rawValue.def, 0, 120, 0),
    hp: clampDungeonInt(rawValue.hp, 0, 240, 0),
    desc: String(rawValue.desc || '').trim().slice(0, 36),
  }
}

const mergeDungeonLogs = (baseLogs, lines) => {
  const logs = Array.isArray(baseLogs) ? [...baseLogs] : []
  const normalized = (Array.isArray(lines) ? lines : [lines])
    .map((item) => String(item || '').replace(/\s+/g, ' ').trim().slice(0, 88))
    .filter(Boolean)
  if (normalized.length === 0) return logs.slice(-140)
  return [...logs, ...normalized].slice(-140)
}

const normalizeDungeonState = (rawValue) => {
  const defaults = buildDefaultDungeonState()
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return defaults
  }

  const teammatesRaw = Array.isArray(rawValue.teammates) ? rawValue.teammates : []
  const teammates = teammatesRaw.map((item, index) => normalizeDungeonTeammate(item, index)).filter(Boolean)
  if (teammates.length === 0) {
    teammates.push(...defaults.teammates)
  }

  const equipmentsRaw = Array.isArray(rawValue.equipments) ? rawValue.equipments : []
  const equipments = equipmentsRaw.map((item, index) => normalizeDungeonEquipment(item, index)).filter(Boolean)

  const equippedRaw = rawValue.equipped && typeof rawValue.equipped === 'object' ? rawValue.equipped : {}
  const equippedWeapon = normalizeDungeonEquipment(equippedRaw.weapon, 0)
  const equippedArmor = normalizeDungeonEquipment(equippedRaw.armor, 1)
  const equippedRelic = normalizeDungeonEquipment(equippedRaw.relic, 2)

  const maxHp = clampDungeonInt(rawValue.maxHp, 80, 999, defaults.maxHp)
  const hp = clampDungeonInt(rawValue.hp, 1, maxHp, defaults.hp)
  const level = clampDungeonInt(rawValue.level, 1, 99, defaults.level)

  return {
    started: true,
    floor: clampDungeonInt(rawValue.floor, 1, 999, defaults.floor),
    level,
    exp: clampDungeonInt(rawValue.exp, 0, 999999, defaults.exp),
    hp,
    maxHp,
    coins: clampDungeonInt(rawValue.coins, 0, 999999, defaults.coins),
    gems: clampDungeonInt(rawValue.gems, 0, 999999, defaults.gems),
    teammatePity: clampDungeonInt(rawValue.teammatePity, 0, DUNGEON_TEAMMATE_PITY_LIMIT - 1, 0),
    equipmentPity: clampDungeonInt(rawValue.equipmentPity, 0, DUNGEON_EQUIPMENT_PITY_LIMIT - 1, 0),
    teammates: teammates.slice(-120),
    equipments: equipments.slice(-180),
    equipped: {
      weapon: equippedWeapon && equippedWeapon.slot === 'weapon' ? equippedWeapon : null,
      armor: equippedArmor && equippedArmor.slot === 'armor' ? equippedArmor : null,
      relic: equippedRelic && equippedRelic.slot === 'relic' ? equippedRelic : null,
    },
    logs: mergeDungeonLogs(rawValue.logs, []),
    lastBanter: String(rawValue.lastBanter || '').trim().slice(0, 64),
    lastScene: String(rawValue.lastScene || '').trim().slice(0, 64),
  }
}

const getDungeonPersistPayload = () => normalizeDungeonState(dungeonState.value)

const persistDungeonState = async () => {
  try {
    await kvStorage.set(DUNGEON_STATE_STORAGE_KEY, getDungeonPersistPayload())
  } catch {
    // no-op
  }
}

const loadDungeonState = async () => {
  try {
    const stored = await kvStorage.get(DUNGEON_STATE_STORAGE_KEY)
    dungeonState.value = normalizeDungeonState(stored)
  } catch {
    dungeonState.value = buildDefaultDungeonState()
  }
}

const getDungeonRarityRank = (rarity) => {
  const normalized = normalizeDungeonRarity(rarity, 'R')
  if (normalized === 'SSR') return 3
  if (normalized === 'SR') return 2
  return 1
}

const getDungeonEquipmentScore = (item) =>
  getDungeonRarityRank(item?.rarity) * 130 +
  (Number(item?.atk) || 0) * 3 +
  (Number(item?.def) || 0) * 2 +
  (Number(item?.hp) || 0)

const pickDungeonPoolItem = (pool, rarity) => {
  const normalized = normalizeDungeonRarity(rarity, 'R')
  const candidates = pool.filter((item) => normalizeDungeonRarity(item.rarity, 'R') === normalized)
  return pickRandomItem(candidates, pool[0])
}

const rollDungeonRarity = (pity, pityLimit, forceMin = 'R') => {
  const minRarity = normalizeDungeonRarity(forceMin, 'R')
  if (minRarity === 'SSR' || pity + 1 >= pityLimit) return 'SSR'

  const roll = Math.random()
  let rarity = 'R'
  if (roll < 0.028) {
    rarity = 'SSR'
  } else if (roll < 0.22) {
    rarity = 'SR'
  }

  if (minRarity === 'SR' && rarity === 'R') {
    return Math.random() < 0.12 ? 'SSR' : 'SR'
  }
  return rarity
}

const getDungeonLevelNeedExp = (level) => Math.max(80, Math.floor(level) * 100)

const applyDungeonLevelUps = (baseState) => {
  let next = { ...baseState }
  let leveled = 0
  let guard = 0

  while (guard < 12) {
    const need = getDungeonLevelNeedExp(next.level)
    if (next.exp < need || next.level >= 99) break
    next = {
      ...next,
      level: next.level + 1,
      exp: next.exp - need,
      maxHp: next.maxHp + 14,
      hp: Math.min(next.maxHp + 14, next.hp + 26),
    }
    leveled += 1
    guard += 1
  }

  return {
    state: next,
    leveled,
  }
}

const maybeEquipDungeonItem = (baseState, item) => {
  const normalized = normalizeDungeonEquipment(item, 0)
  if (!normalized) {
    return {
      state: baseState,
      equipped: false,
    }
  }

  const slot = normalized.slot
  const nextEquipped = { ...(baseState.equipped || { weapon: null, armor: null, relic: null }) }
  const current = normalizeDungeonEquipment(nextEquipped[slot], 0)
  const shouldEquip = !current || getDungeonEquipmentScore(normalized) > getDungeonEquipmentScore(current)
  if (shouldEquip) {
    nextEquipped[slot] = normalized
  }

  return {
    state: {
      ...baseState,
      equipments: [...(Array.isArray(baseState.equipments) ? baseState.equipments : []), normalized].slice(-180),
      equipped: nextEquipped,
    },
    equipped: shouldEquip,
  }
}

const createDungeonEquipmentByRarity = (rarity = 'R') => {
  const template = pickDungeonPoolItem(DUNGEON_EQUIPMENT_POOL, rarity)
  return normalizeDungeonEquipment(
    {
      ...template,
      id: getDungeonRandomId('eq'),
    },
    0,
  )
}

const getActiveWorldBookContextForDungeon = async () => {
  try {
    const activeId = String((await kvStorage.get('active_world_book')) || 'default_world_book').trim() || 'default_world_book'
    const storedBooks = await kvStorage.get('world_books')
    const books = Array.isArray(storedBooks) ? storedBooks : []
    const activeBook =
      books.find((item) => String(item?.id || '').trim() === activeId) ||
      books.find((item) => Boolean(item?.isDefault)) ||
      null
    return {
      title: String(activeBook?.title || '').trim(),
      summary: String(activeBook?.summary || activeBook?.entries?.overview || '').trim(),
      sceneName: String(activeBook?.currentSceneName || activeBook?.activeSceneName || '').trim(),
    }
  } catch {
    return {
      title: '',
      summary: '',
      sceneName: '',
    }
  }
}

const buildLocalDungeonScene = ({ floor, eventTypeHint = 'battle' } = {}) => {
  const stage = Math.max(1, Math.floor(floor || 1))
  const isBoss = eventTypeHint === 'boss' || stage % 5 === 0
  const eventType = isBoss ? 'boss' : eventTypeHint

  if (eventType === 'rest') {
    return {
      eventType: 'rest',
      title: '营火据点',
      description: '你在破旧营地短暂休整，队伍恢复了体力。',
      enemy: null,
      loot: null,
      banterHint: '短暂休整后继续前进',
    }
  }

  if (eventType === 'treasure') {
    return {
      eventType: 'treasure',
      title: '遗迹宝箱',
      description: '墙角的机关被触发，一只覆尘宝箱弹开。',
      enemy: null,
      loot: createDungeonEquipmentByRarity(stage >= 12 ? 'SR' : stage >= 5 ? (Math.random() < 0.2 ? 'SR' : 'R') : 'R'),
      banterHint: '看看战利品里有没有好东西',
    }
  }

  const enemyNamePool = isBoss
    ? ['深渊守门者', '腐铁魔像', '暗影主祭', '钟楼噬魂者']
    : ['骸骨战士', '地窟掠夺者', '迷雾幼龙', '裂口狼群']
  const enemyName = pickRandomItem(enemyNamePool, isBoss ? '深渊守门者' : '骸骨战士')
  const hpBase = isBoss ? 180 : 86
  const atkBase = isBoss ? 36 : 17

  return {
    eventType: isBoss ? 'boss' : 'battle',
    title: isBoss ? `楼层 BOSS：${enemyName}` : `遭遇战：${enemyName}`,
    description: isBoss ? `${enemyName} 挡在通往下一层的阶梯前。` : `${enemyName} 从阴影中逼近，战斗一触即发。`,
    enemy: {
      name: enemyName,
      rarity: isBoss ? 'SSR' : stage >= 9 ? 'SR' : 'R',
      hp: hpBase + stage * (isBoss ? 16 : 9),
      attack: atkBase + stage * (isBoss ? 3 : 2),
      rewardCoins: stage * (isBoss ? 62 : 24),
      rewardGems: stage * (isBoss ? 20 : 6),
    },
    loot: null,
    banterHint: isBoss ? '这是硬仗，别留手。' : '普通敌人，稳扎稳打。',
  }
}

const resolveDungeonScene = async (floor, eventTypeHint) => {
  const fallback = buildLocalDungeonScene({ floor, eventTypeHint })
  const worldContext = await getActiveWorldBookContextForDungeon()
  const partySummary = dungeonActiveParty.value.map((item) => `${item.name}(${item.rarity})`).join('、')

  const result = await generateHandheldDungeonScene({
    floor,
    eventTypeHint,
    worldTitle: worldContext.title,
    worldSummary: worldContext.summary,
    sceneName: worldContext.sceneName,
    partySummary,
    options: {
      temperature: 0.84,
      maxTokens: 360,
    },
  })

  if (!result.success || !result.scene) {
    if (result.error) {
      dungeonError.value = `${result.error}，已切换本地地下城模板`
    }
    return fallback
  }

  return result.scene
}

const drawDungeonTeammateOne = ({ pity = 0, forceMin = 'R' } = {}) => {
  const rarity = rollDungeonRarity(pity, DUNGEON_TEAMMATE_PITY_LIMIT, forceMin)
  const template = pickDungeonPoolItem(DUNGEON_TEAMMATE_POOL, rarity)
  const item = normalizeDungeonTeammate(
    {
      ...template,
      id: getDungeonRandomId('tm'),
    },
    0,
  )
  return {
    item,
    rarity,
    nextPity: rarity === 'SSR' ? 0 : Math.min(DUNGEON_TEAMMATE_PITY_LIMIT - 1, pity + 1),
  }
}

const drawDungeonEquipmentOne = ({ pity = 0, forceMin = 'R' } = {}) => {
  const rarity = rollDungeonRarity(pity, DUNGEON_EQUIPMENT_PITY_LIMIT, forceMin)
  const template = pickDungeonPoolItem(DUNGEON_EQUIPMENT_POOL, rarity)
  const item = normalizeDungeonEquipment(
    {
      ...template,
      id: getDungeonRandomId('eq'),
    },
    0,
  )
  return {
    item,
    rarity,
    nextPity: rarity === 'SSR' ? 0 : Math.min(DUNGEON_EQUIPMENT_PITY_LIMIT - 1, pity + 1),
  }
}

const executeDungeonTeammateGacha = async (drawCount = 1) => {
  if (isDungeonDrawing.value) return
  const safeCount = drawCount >= 10 ? 10 : 1
  const totalCost = DUNGEON_TEAMMATE_SINGLE_COST * safeCount
  const currentGems = Number(dungeonState.value.gems) || 0
  dungeonError.value = ''

  if (currentGems < totalCost) {
    dungeonError.value = '星钻不足，无法招募队友'
    return
  }

  isDungeonDrawing.value = true
  try {
    let next = normalizeDungeonState({
      ...dungeonState.value,
      gems: currentGems - totalCost,
    })

    let pity = next.teammatePity
    let hasSrPlus = false
    const results = []
    for (let index = 0; index < safeCount; index += 1) {
      const forceMin = safeCount === 10 && index === safeCount - 1 && !hasSrPlus ? 'SR' : 'R'
      const drawn = drawDungeonTeammateOne({ pity, forceMin })
      pity = drawn.nextPity
      if (drawn.rarity !== 'R') hasSrPlus = true
      if (drawn.item) {
        results.push(drawn.item)
      }
    }

    next = {
      ...next,
      teammatePity: pity,
      teammates: [...next.teammates, ...results].slice(-120),
    }

    const preview = results.slice(0, 3).map((item) => `${item.rarity} ${item.name}`).join('、')
    const tail = results.length > 3 ? ` 等${results.length}名` : ''
    next.logs = mergeDungeonLogs(next.logs, [`队友招募${safeCount === 10 ? '十连' : '单抽'}：${preview}${tail}`])
    dungeonState.value = next
    await persistDungeonState()
  } finally {
    isDungeonDrawing.value = false
  }
}

const executeDungeonEquipmentGacha = async (drawCount = 1) => {
  if (isDungeonDrawing.value) return
  const safeCount = drawCount >= 10 ? 10 : 1
  const totalCost = DUNGEON_EQUIPMENT_SINGLE_COST * safeCount
  const currentGems = Number(dungeonState.value.gems) || 0
  dungeonError.value = ''

  if (currentGems < totalCost) {
    dungeonError.value = '星钻不足，无法抽取装备'
    return
  }

  isDungeonDrawing.value = true
  try {
    let next = normalizeDungeonState({
      ...dungeonState.value,
      gems: currentGems - totalCost,
    })

    let pity = next.equipmentPity
    let hasSrPlus = false
    const results = []
    const equipLogs = []

    for (let index = 0; index < safeCount; index += 1) {
      const forceMin = safeCount === 10 && index === safeCount - 1 && !hasSrPlus ? 'SR' : 'R'
      const drawn = drawDungeonEquipmentOne({ pity, forceMin })
      pity = drawn.nextPity
      if (drawn.rarity !== 'R') hasSrPlus = true
      if (!drawn.item) continue

      const equipResult = maybeEquipDungeonItem(next, drawn.item)
      next = equipResult.state
      results.push(drawn.item)
      if (equipResult.equipped) {
        equipLogs.push(`${drawn.item.name} 自动替换到 ${drawn.item.slot.toUpperCase()} 位`)
      }
    }

    next = {
      ...next,
      equipmentPity: pity,
    }

    const preview = results.slice(0, 3).map((item) => `${item.rarity} ${item.name}`).join('、')
    const tail = results.length > 3 ? ` 等${results.length}件` : ''
    next.logs = mergeDungeonLogs(next.logs, [
      `装备抽取${safeCount === 10 ? '十连' : '单抽'}：${preview}${tail}`,
      ...equipLogs,
    ])
    dungeonState.value = next
    await persistDungeonState()
  } finally {
    isDungeonDrawing.value = false
  }
}

const handleDungeonExplore = async () => {
  if (isDungeonExploring.value || isDungeonDrawing.value) return
  dungeonError.value = ''
  isDungeonExploring.value = true

  try {
    const baseState = normalizeDungeonState(dungeonState.value)
    const floor = baseState.floor
    const forceBoss = floor % 5 === 0
    const roll = Math.random()
    const eventTypeHint = forceBoss ? 'boss' : roll < 0.22 ? 'rest' : roll < 0.42 ? 'treasure' : 'battle'
    const scene = await resolveDungeonScene(floor, eventTypeHint)
    let next = { ...baseState }

    const sceneTitle = String(scene?.title || '').trim().slice(0, 32)
    const sceneDesc = String(scene?.description || '').trim().slice(0, 64)
    const sceneEventType = String(scene?.eventType || eventTypeHint).trim().toLowerCase()
    next.lastScene = sceneTitle || sceneDesc || '地下城深处'

    if (sceneEventType === 'rest') {
      const heal = clampDungeonInt(Math.floor(next.maxHp * 0.2) + next.level * 2, 18, 140, 30)
      const bonusCoins = clampDungeonInt(10 + next.level * 4, 8, 200, 12)
      next = {
        ...next,
        hp: Math.min(next.maxHp, next.hp + heal),
        coins: next.coins + bonusCoins,
        logs: mergeDungeonLogs(next.logs, [
          `${sceneTitle || '营火据点'}：恢复 ${heal} 生命并搜到 ${bonusCoins} 金币`,
        ]),
      }
    } else if (sceneEventType === 'treasure') {
      const bonusCoins = clampDungeonInt(26 + floor * 6, 20, 380, 32)
      const bonusGems = clampDungeonInt(14 + floor * 3, 10, 240, 20)
      next = {
        ...next,
        coins: next.coins + bonusCoins,
        gems: next.gems + bonusGems,
      }

      const loot = normalizeDungeonEquipment(scene?.loot, 0)
      if (loot) {
        const equipResult = maybeEquipDungeonItem(next, {
          ...loot,
          id: getDungeonRandomId('eq'),
        })
        next = {
          ...equipResult.state,
          logs: mergeDungeonLogs(equipResult.state.logs, [
            `${sceneTitle || '遗迹宝箱'}：获得 ${loot.rarity} ${loot.name}，星钻 +${bonusGems}`,
            ...(equipResult.equipped ? [`已自动装备 ${loot.name}`] : []),
          ]),
        }
      } else {
        next = {
          ...next,
          logs: mergeDungeonLogs(next.logs, [`${sceneTitle || '遗迹宝箱'}：金币 +${bonusCoins}，星钻 +${bonusGems}`]),
        }
      }
    } else {
      const enemy = scene?.enemy && typeof scene.enemy === 'object' ? scene.enemy : null
      const isBossBattle = sceneEventType === 'boss'
      const enemyName = String(enemy?.name || (isBossBattle ? '深渊守门者' : '地窟魔物')).trim().slice(0, 20)
      const enemyHp = clampDungeonInt(
        enemy?.hp,
        24,
        2600,
        (isBossBattle ? 180 : 90) + floor * (isBossBattle ? 16 : 9),
      )
      const enemyAtk = clampDungeonInt(
        enemy?.attack,
        8,
        420,
        (isBossBattle ? 36 : 18) + floor * (isBossBattle ? 3 : 2),
      )

      const equipDef = dungeonEquipBonuses.value.def
      const playerPower = dungeonTotalPower.value + Math.floor(next.hp * 0.08)
      const playerRoll = Math.round(playerPower * (0.84 + Math.random() * 0.42))
      const damageThreshold = Math.floor(enemyHp * (isBossBattle ? 0.98 : 0.84))
      const victory = playerRoll >= damageThreshold
      const enemyRoll = Math.round(enemyAtk * (0.72 + Math.random() * 0.42))
      let damageTaken = Math.round(enemyRoll - equipDef * 0.62)
      damageTaken = Math.max(isBossBattle ? 14 : 8, damageTaken)

      if (victory) {
        const rewardCoins = clampDungeonInt(enemy?.rewardCoins, 12, 9999, floor * (isBossBattle ? 62 : 24))
        const rewardGems = clampDungeonInt(enemy?.rewardGems, 4, 9999, floor * (isBossBattle ? 20 : 6))
        const rewardExp = clampDungeonInt(floor * (isBossBattle ? 58 : 26), 20, 9999, 32)
        next = {
          ...next,
          floor: next.floor + 1,
          hp: Math.max(1, next.hp - damageTaken),
          coins: next.coins + rewardCoins,
          gems: next.gems + rewardGems,
          exp: next.exp + rewardExp,
        }

        const dropChance = isBossBattle ? 0.62 : 0.24
        const shouldDrop = Math.random() < dropChance
        if (shouldDrop) {
          const dropRarity = isBossBattle ? (Math.random() < 0.4 ? 'SSR' : 'SR') : Math.random() < 0.2 ? 'SR' : 'R'
          const dropItem = createDungeonEquipmentByRarity(dropRarity)
          if (dropItem) {
            const equipResult = maybeEquipDungeonItem(next, dropItem)
            next = {
              ...equipResult.state,
              logs: mergeDungeonLogs(equipResult.state.logs, [
                `${sceneTitle || '遭遇战'}：击败 ${enemyName}，金币 +${rewardCoins}，星钻 +${rewardGems}`,
                `掉落 ${dropItem.rarity} ${dropItem.name}`,
                ...(equipResult.equipped ? [`已自动装备 ${dropItem.name}`] : []),
              ]),
            }
          } else {
            next = {
              ...next,
              logs: mergeDungeonLogs(next.logs, [
                `${sceneTitle || '遭遇战'}：击败 ${enemyName}，金币 +${rewardCoins}，星钻 +${rewardGems}`,
              ]),
            }
          }
        } else {
          next = {
            ...next,
            logs: mergeDungeonLogs(next.logs, [
              `${sceneTitle || '遭遇战'}：击败 ${enemyName}，金币 +${rewardCoins}，星钻 +${rewardGems}`,
            ]),
          }
        }
      } else {
        const coinLoss = Math.min(next.coins, Math.floor(next.coins * (isBossBattle ? 0.16 : 0.1)))
        const retreatHp = Math.max(36, Math.floor(next.maxHp * 0.35))
        next = {
          ...next,
          hp: retreatHp,
          coins: Math.max(0, next.coins - coinLoss),
          logs: mergeDungeonLogs(next.logs, [
            `${enemyName} 压制了队伍，撤退整备，金币 -${coinLoss}`,
          ]),
        }
      }
    }

    const levelResult = applyDungeonLevelUps(next)
    if (levelResult.leveled > 0) {
      levelResult.state.logs = mergeDungeonLogs(levelResult.state.logs, [
        `队伍升级至 Lv.${levelResult.state.level}，生命上限提升`,
      ])
    }

    dungeonState.value = levelResult.state
    await persistDungeonState()
  } finally {
    isDungeonExploring.value = false
  }
}

const requestDungeonBanter = async () => {
  if (isDungeonGeneratingBanter.value) return
  const speaker = pickRandomItem(dungeonActiveParty.value, null)
  if (!speaker) {
    dungeonError.value = '队伍为空，先去招募队友'
    return
  }

  dungeonError.value = ''
  isDungeonGeneratingBanter.value = true
  try {
    const result = await generateHandheldDungeonBanter({
      teammateName: speaker.name,
      teammateRole: speaker.role,
      teammateRarity: speaker.rarity,
      floor: dungeonState.value.floor,
      scene: dungeonState.value.lastScene,
      moodHint: dungeonHpPercent.value <= 35 ? '危险但嘴硬' : '状态在线，略带吐槽',
      options: {
        temperature: 0.9,
        maxTokens: 120,
      },
    })

    const fallback = pickRandomItem(DUNGEON_BANTER_FALLBACKS, '继续前进。')
    const line = result.success && result.line ? result.line : fallback
    if (!result.success && result.error) {
      dungeonError.value = `${result.error}，已使用本地吐槽`
    }

    dungeonState.value = {
      ...dungeonState.value,
      lastBanter: `${speaker.name}：${line}`,
      logs: mergeDungeonLogs(dungeonState.value.logs, [`${speaker.name}：${line}`]),
    }
    await persistDungeonState()
  } finally {
    isDungeonGeneratingBanter.value = false
  }
}

const initializeDungeonAdventure = async ({ reset = false } = {}) => {
  dungeonError.value = ''
  if (reset) {
    dungeonState.value = buildDefaultDungeonState()
  } else {
    dungeonState.value = normalizeDungeonState(dungeonState.value)
  }
  hasDungeonInitialized.value = true
  await persistDungeonState()
}

const resetDungeonProgress = async () => {
  await initializeDungeonAdventure({ reset: true })
}

const getRandomTetrisType = () => TETRIS_TYPES[Math.floor(Math.random() * TETRIS_TYPES.length)]

const rotateTetrisMatrixClockwise = (matrix) => {
  const rows = matrix.length
  const cols = matrix[0].length
  const result = Array.from({ length: cols }, () => Array(rows).fill(0))
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      result[col][rows - 1 - row] = matrix[row][col]
    }
  }
  return result
}

const getTetrisMatrix = (type, rotation = 0) => {
  const piece = TETRIS_PIECES[type]
  if (!piece) return [[1]]

  let matrix = piece.matrix
  const turns = ((rotation % 4) + 4) % 4
  for (let index = 0; index < turns; index += 1) {
    matrix = rotateTetrisMatrixClockwise(matrix)
  }
  return matrix
}

const maybeUpdateTetrisBestScore = () => {
  if (tetrisScore.value <= tetrisBestScore.value) return
  tetrisBestScore.value = tetrisScore.value
  void persistTetrisBestScore()
}

const resetTetrisTimer = () => {
  if (tetrisTimerId !== null) {
    clearInterval(tetrisTimerId)
    tetrisTimerId = null
  }
}

const getTetrisDropInterval = () =>
  Math.max(TETRIS_MIN_DROP_INTERVAL_MS, TETRIS_DROP_INTERVAL_MS - (tetrisLevel.value - 1) * TETRIS_DROP_STEP_MS)

const isValidTetrisPlacement = (piece, row, col, rotation = piece.rotation) => {
  const matrix = getTetrisMatrix(piece.type, rotation)
  for (let matrixRow = 0; matrixRow < matrix.length; matrixRow += 1) {
    for (let matrixCol = 0; matrixCol < matrix[matrixRow].length; matrixCol += 1) {
      if (!matrix[matrixRow][matrixCol]) continue
      const nextRow = row + matrixRow
      const nextCol = col + matrixCol
      if (nextRow < 0 || nextRow >= TETRIS_ROWS || nextCol < 0 || nextCol >= TETRIS_COLS) {
        return false
      }
      if (tetrisBoard.value[nextRow][nextCol] !== 0) {
        return false
      }
    }
  }
  return true
}

const spawnTetrisPiece = () => {
  const type = tetrisNextType.value || getRandomTetrisType()
  tetrisNextType.value = getRandomTetrisType()
  const matrix = getTetrisMatrix(type, 0)
  const startCol = Math.floor((TETRIS_COLS - matrix[0].length) / 2)
  const piece = {
    type,
    row: 0,
    col: startCol,
    rotation: 0,
  }

  if (!isValidTetrisPlacement(piece, piece.row, piece.col, piece.rotation)) {
    tetrisOver.value = true
    resetTetrisTimer()
    maybeUpdateTetrisBestScore()
    return
  }

  tetrisCurrent.value = piece
}

const initializeTetris = () => {
  resetTetrisTimer()
  tetrisBoard.value = createEmptyTetrisBoard()
  tetrisCurrent.value = null
  tetrisNextType.value = getRandomTetrisType()
  tetrisScore.value = 0
  tetrisLines.value = 0
  tetrisLevel.value = 1
  tetrisOver.value = false
  hasTetrisInitialized.value = true
  spawnTetrisPiece()
}

const startTetrisTimer = () => {
  if (tetrisTimerId !== null) return
  if (!isInTetrisGame.value || tetrisOver.value || !tetrisCurrent.value) return
  tetrisTimerId = setInterval(() => {
    stepTetrisDown()
  }, getTetrisDropInterval())
}

const setTetrisLevelByLines = () => {
  const nextLevel = Math.floor(tetrisLines.value / 10) + 1
  if (nextLevel === tetrisLevel.value) return
  tetrisLevel.value = nextLevel
  if (isInTetrisGame.value && !tetrisOver.value) {
    resetTetrisTimer()
    startTetrisTimer()
  }
}

const clearTetrisLines = () => {
  let cleared = 0
  const nextRows = []
  for (let row = 0; row < TETRIS_ROWS; row += 1) {
    const line = tetrisBoard.value[row]
    const isFull = line.every((value) => value !== 0)
    if (isFull) {
      cleared += 1
      continue
    }
    nextRows.push([...line])
  }

  while (nextRows.length < TETRIS_ROWS) {
    nextRows.unshift(Array(TETRIS_COLS).fill(0))
  }

  if (cleared === 0) return

  tetrisBoard.value = nextRows
  tetrisLines.value += cleared
  const scoreTable = [0, 100, 300, 500, 800]
  const gained = (scoreTable[cleared] || 0) * tetrisLevel.value
  tetrisScore.value += gained
  maybeUpdateTetrisBestScore()
  setTetrisLevelByLines()
}

const lockTetrisPiece = () => {
  const piece = tetrisCurrent.value
  if (!piece) return

  const matrix = getTetrisMatrix(piece.type, piece.rotation)
  const color = TETRIS_PIECES[piece.type]?.color || 1
  const nextBoard = tetrisBoard.value.map((row) => [...row])
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix[row].length; col += 1) {
      if (!matrix[row][col]) continue
      const nextRow = piece.row + row
      const nextCol = piece.col + col
      if (nextRow < 0 || nextRow >= TETRIS_ROWS || nextCol < 0 || nextCol >= TETRIS_COLS) continue
      nextBoard[nextRow][nextCol] = color
    }
  }
  tetrisBoard.value = nextBoard
  clearTetrisLines()
  spawnTetrisPiece()
}

const moveTetrisPiece = (deltaRow, deltaCol) => {
  const piece = tetrisCurrent.value
  if (!piece || tetrisOver.value) return false

  const nextRow = piece.row + deltaRow
  const nextCol = piece.col + deltaCol
  if (!isValidTetrisPlacement(piece, nextRow, nextCol, piece.rotation)) return false

  tetrisCurrent.value = {
    ...piece,
    row: nextRow,
    col: nextCol,
  }
  return true
}

const rotateTetrisPiece = () => {
  const piece = tetrisCurrent.value
  if (!piece || tetrisOver.value) return false

  const nextRotation = (piece.rotation + 1) % 4
  const wallKickOffsets = [0, -1, 1, -2, 2]
  for (let index = 0; index < wallKickOffsets.length; index += 1) {
    const offsetCol = wallKickOffsets[index]
    const nextCol = piece.col + offsetCol
    if (!isValidTetrisPlacement(piece, piece.row, nextCol, nextRotation)) continue

    tetrisCurrent.value = {
      ...piece,
      col: nextCol,
      rotation: nextRotation,
    }
    return true
  }
  return false
}

const stepTetrisDown = () => {
  if (!isInTetrisGame.value || tetrisOver.value) return
  const moved = moveTetrisPiece(1, 0)
  if (moved) return
  lockTetrisPiece()
}

const softDropTetrisPiece = () => {
  if (!isInTetrisGame.value || tetrisOver.value) return
  const moved = moveTetrisPiece(1, 0)
  if (moved) {
    tetrisScore.value += 1
    maybeUpdateTetrisBestScore()
    return
  }
  lockTetrisPiece()
}

const hardDropTetrisPiece = () => {
  if (!isInTetrisGame.value || tetrisOver.value) return
  let movedCount = 0
  while (moveTetrisPiece(1, 0)) {
    movedCount += 1
  }
  if (movedCount > 0) {
    tetrisScore.value += movedCount * 2
    maybeUpdateTetrisBestScore()
  }
  lockTetrisPiece()
}

const BRICK_PALETTES = {
  neon: ['#47dbff', '#a879ff', '#ff7cb3', '#7bffac', '#ffd166'],
  sunset: ['#ff9e5e', '#ff6b6b', '#ffb86b', '#f9f871', '#ffd3b6'],
  ice: ['#8fd7ff', '#a9e8ff', '#d2f2ff', '#9bc4ff', '#d7e8ff'],
  forest: ['#7bcf7b', '#9adf7a', '#5fbf93', '#b7e4a2', '#7fd98d'],
  mono: ['#d9e2f2', '#c4d0e7', '#adbcd6', '#95a8c7', '#7f96b9'],
  retro: ['#ff7f51', '#ffd166', '#06d6a0', '#118ab2', '#ef476f'],
}

const clampBrickValue = (value, min, max) => Math.max(min, Math.min(max, value))

const createSeededRandom = (seedBase) => {
  let seed = Math.floor(Number(seedBase) || 1) % 2147483647
  if (seed <= 0) {
    seed += 2147483646
  }
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

const getFallbackBrickLevelConfig = (stage) => {
  const level = Math.max(1, Math.floor(stage || 1))
  return {
    rows: clampBrickValue(5 + Math.floor(level / 3), 5, 9),
    cols: clampBrickValue(9 + Math.floor(level / 4), 9, 12),
    density: clampBrickValue(0.62 + level * 0.02, 0.62, 0.9),
    durabilityBias: level >= 9 ? 'hard' : level >= 4 ? 'normal' : 'soft',
    pattern: ['solid', 'pyramid', 'waves', 'checker', 'diamond', 'stairs'][level % 6],
    palette: ['neon', 'sunset', 'ice', 'forest', 'retro', 'mono'][level % 6],
    paddleWidthRatio: clampBrickValue(0.21 - level * 0.004, 0.13, 0.21),
    ballSpeed: clampBrickValue(300 + level * 10, 280, 420),
    lives: level >= 10 ? 2 : 3,
  }
}

const buildBrickMaskScore = (pattern, row, col, rows, cols) => {
  const centerCol = (cols - 1) / 2
  const centerRow = (rows - 1) / 2
  const normalizedCol = cols > 1 ? Math.abs(col - centerCol) / centerCol : 0
  const normalizedRow = rows > 1 ? Math.abs(row - centerRow) / centerRow : 0

  if (pattern === 'solid') return 1
  if (pattern === 'pyramid') return 1 - normalizedCol * 0.9 - (row / Math.max(1, rows - 1)) * 0.12
  if (pattern === 'diamond') return 1 - (normalizedCol + normalizedRow) * 0.72
  if (pattern === 'corridor') {
    const corridor = Math.abs(col - centerCol) < 1.2 ? 0.35 : 1
    return corridor - row * 0.03
  }
  if (pattern === 'checker') return (row + col) % 2 === 0 ? 1 : 0.52
  if (pattern === 'stairs') return col <= (row / Math.max(1, rows - 1)) * cols + 1 ? 1 : 0.24
  if (pattern === 'waves') return 0.68 + Math.sin((col / Math.max(1, cols - 1)) * Math.PI * 2 + row * 0.6) * 0.28
  return 1
}

const createBrickLayoutFromConfig = (config, stage) => {
  const rows = clampBrickValue(Math.floor(Number(config?.rows) || 6), 4, 9)
  const cols = clampBrickValue(Math.floor(Number(config?.cols) || 10), 7, 12)
  const density = clampBrickValue(Number(config?.density) || 0.72, 0.35, 0.95)
  const durabilityBias = String(config?.durabilityBias || 'normal')
  const pattern = String(config?.pattern || 'solid')
  const paletteKey = String(config?.palette || 'neon')
  const palette = BRICK_PALETTES[paletteKey] || BRICK_PALETTES.neon

  const gap = 3
  const horizontalPadding = 10
  const boardTop = 16
  const availableWidth = BRICK_WORLD_WIDTH - horizontalPadding * 2 - gap * (cols - 1)
  const brickWidth = availableWidth / cols
  const brickHeight = clampBrickValue((92 - gap * (rows - 1)) / rows, 7, 12)
  const random = createSeededRandom(stage * 991 + rows * 53 + cols * 37)

  const bricks = []
  let id = 0
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const score = buildBrickMaskScore(pattern, row, col, rows, cols)
      const rowPressure = row / Math.max(1, rows - 1)
      const activationChance = density * clampBrickValue(score, 0.1, 1)
      if (random() > activationChance) continue

      let hp = 1
      const hardRoll = random()
      if (durabilityBias === 'soft') {
        hp = hardRoll < 0.12 + rowPressure * 0.22 ? 2 : 1
      } else if (durabilityBias === 'hard') {
        hp = hardRoll < 0.38 + rowPressure * 0.2 ? 3 : hardRoll < 0.82 ? 2 : 1
      } else {
        hp = hardRoll < 0.22 + rowPressure * 0.25 ? 2 : 1
      }

      bricks.push({
        id: `brick_${id += 1}`,
        x: horizontalPadding + col * (brickWidth + gap),
        y: boardTop + row * (brickHeight + gap),
        width: brickWidth,
        height: brickHeight,
        hp,
        maxHp: hp,
        color: palette[(row + col) % palette.length],
      })
    }
  }

  if (bricks.length === 0) {
    for (let col = 0; col < Math.min(cols, 8); col += 1) {
      bricks.push({
        id: `brick_fallback_${col}`,
        x: horizontalPadding + col * (brickWidth + gap),
        y: boardTop,
        width: brickWidth,
        height: brickHeight,
        hp: 1,
        maxHp: 1,
        color: palette[col % palette.length],
      })
    }
  }

  return bricks
}

const resetBrickAnimationLoop = () => {
  if (brickRafId !== null) {
    cancelAnimationFrame(brickRafId)
    brickRafId = null
  }
  brickLastFrameTs = 0
  brickControlDir.value = 0
  brickPointerId.value = null
}

const maybeUpdateBrickBestScore = () => {
  if (brickScore.value <= brickBestScore.value) return
  brickBestScore.value = brickScore.value
  void kvStorage.set(BRICK_BEST_SCORE_STORAGE_KEY, brickBestScore.value).catch(() => {})
}

const placeBrickBallOnPaddle = () => {
  brickBall.value = {
    ...brickBall.value,
    x: brickPaddle.value.x + brickPaddle.value.width * 0.5,
    y: brickPaddle.value.y - brickBall.value.radius - 0.8,
    vx: 0,
    vy: 0,
    stuck: true,
  }
}

const normalizeBrickBallVelocity = () => {
  const speed = Math.hypot(brickBall.value.vx, brickBall.value.vy) || BRICK_MIN_SPEED
  const clamped = clampBrickValue(speed, BRICK_MIN_SPEED, BRICK_MAX_SPEED)
  const ratio = clamped / speed
  brickBall.value = {
    ...brickBall.value,
    vx: brickBall.value.vx * ratio,
    vy: brickBall.value.vy * ratio,
  }
}

const setBrickPaddleCenterX = (centerX) => {
  const width = brickPaddle.value.width
  const clampedLeft = clampBrickValue(centerX - width * 0.5, 0, BRICK_WORLD_WIDTH - width)
  brickPaddle.value = {
    ...brickPaddle.value,
    x: clampedLeft,
  }
  if (brickBall.value.stuck) {
    placeBrickBallOnPaddle()
  }
}

const stepBrickPaddle = (direction, delta = 16) => {
  const next = brickPaddle.value.x + direction * delta
  setBrickPaddleCenterX(next + brickPaddle.value.width * 0.5)
}

const getBrickWorldXByClientX = (clientX) => {
  const field = brickFieldRef.value
  if (!field || typeof clientX !== 'number') return BRICK_WORLD_WIDTH * 0.5
  const rect = field.getBoundingClientRect()
  if (!rect.width) return BRICK_WORLD_WIDTH * 0.5
  const relative = (clientX - rect.left) / rect.width
  return clampBrickValue(relative, 0, 1) * BRICK_WORLD_WIDTH
}

const getActiveWorldBookContextForBrick = async () => {
  try {
    const activeId = String((await kvStorage.get('active_world_book')) || 'default_world_book').trim() || 'default_world_book'
    const storedBooks = await kvStorage.get('world_books')
    const books = Array.isArray(storedBooks) ? storedBooks : []
    const activeBook =
      books.find((item) => String(item?.id || '').trim() === activeId) ||
      books.find((item) => Boolean(item?.isDefault)) ||
      null
    return {
      title: String(activeBook?.title || '').trim(),
      summary: String(activeBook?.summary || activeBook?.entries?.overview || '').trim(),
      sceneName: String(activeBook?.currentSceneName || activeBook?.activeSceneName || '').trim(),
    }
  } catch {
    return {
      title: '',
      summary: '',
      sceneName: '',
    }
  }
}

const loadBrickLevelConfig = async (stage) => {
  const safeStage = Math.max(1, Math.floor(stage || 1))
  const fallback = getFallbackBrickLevelConfig(safeStage)
  const worldContext = await getActiveWorldBookContextForBrick()
  const difficultyHint =
    safeStage <= 2
      ? '新手友好，节奏偏慢'
      : safeStage <= 5
        ? '中等挑战，注重节奏变化'
        : safeStage <= 9
          ? '中高难，反弹角度更刁钻'
          : '高难，密度和耐久提升但不能不可玩'

  const result = await generateHandheldBrickLevel({
    stage: safeStage,
    difficultyHint,
    worldTitle: worldContext.title,
    worldSummary: worldContext.summary,
    sceneName: worldContext.sceneName,
    options: {
      temperature: 0.76,
      maxTokens: 240,
    },
  })

  if (!result.success || !result.config) {
    return {
      config: fallback,
      source: 'fallback',
      error: result.error || '',
    }
  }

  return {
    config: result.config,
    source: 'llm',
    error: '',
  }
}

let brickLevelRequestId = 0

const applyBrickLevel = (config, options = {}) => {
  const safeConfig = config || getFallbackBrickLevelConfig(brickStage.value)
  brickLevelConfig.value = safeConfig
  brickConfigSource.value = options.source || 'fallback'
  brickConfigError.value = options.error || ''
  brickBricks.value = createBrickLayoutFromConfig(safeConfig, brickStage.value)
  const paddleWidth = clampBrickValue(
    BRICK_WORLD_WIDTH * clampBrickValue(Number(safeConfig.paddleWidthRatio) || 0.18, 0.12, 0.26),
    40,
    92,
  )
  brickPaddle.value = {
    x: BRICK_WORLD_WIDTH * 0.5 - paddleWidth * 0.5,
    y: BRICK_WORLD_HEIGHT - 18,
    width: paddleWidth,
    height: BRICK_PADDLE_HEIGHT,
  }
  brickBall.value = {
    x: BRICK_WORLD_WIDTH * 0.5,
    y: BRICK_WORLD_HEIGHT - 24,
    vx: 0,
    vy: 0,
    radius: BRICK_BALL_RADIUS,
    stuck: true,
  }
  placeBrickBallOnPaddle()
  brickOver.value = false
  brickLevelCleared.value = false
}

const prepareBrickLevel = async ({ stage, resetScore = false, resetLives = false } = {}) => {
  const targetStage = Math.max(1, Math.floor(stage || brickStage.value || 1))
  brickStage.value = targetStage
  brickLoadingLevel.value = true
  brickLevelCleared.value = false
  brickOver.value = false
  const requestId = ++brickLevelRequestId

  const { config, source, error } = await loadBrickLevelConfig(targetStage)
  if (requestId !== brickLevelRequestId) {
    return
  }

  if (resetScore) {
    brickScore.value = 0
  }

  if (resetLives) {
    brickLives.value = clampBrickValue(Math.floor(Number(config?.lives) || 3), 2, 5)
  }

  applyBrickLevel(config, { source, error })
  brickLoadingLevel.value = false
}

const initializeBrickBreaker = async ({ resetStage = true } = {}) => {
  resetBrickAnimationLoop()
  if (resetStage) {
    brickStage.value = 1
  }
  await prepareBrickLevel({
    stage: brickStage.value,
    resetScore: true,
    resetLives: true,
  })
  hasBrickInitialized.value = true
}

const launchBrickBall = () => {
  if (!isInBrickGame.value || brickLoadingLevel.value || brickOver.value || brickLevelCleared.value) return
  if (!brickBall.value.stuck) return

  const configSpeed = clampBrickValue(Number(brickLevelConfig.value?.ballSpeed) || 320, BRICK_MIN_SPEED, BRICK_MAX_SPEED)
  const randomOffset = (Math.random() * 0.66 - 0.33) * configSpeed
  const verticalSpeed = Math.sqrt(Math.max(0, configSpeed * configSpeed - randomOffset * randomOffset))

  brickBall.value = {
    ...brickBall.value,
    stuck: false,
    vx: randomOffset,
    vy: -Math.max(180, verticalSpeed),
  }
  normalizeBrickBallVelocity()
}

const handleBrickLifeLost = () => {
  brickLives.value -= 1
  if (brickLives.value <= 0) {
    brickLives.value = 0
    brickOver.value = true
    maybeUpdateBrickBestScore()
    return
  }
  placeBrickBallOnPaddle()
}

const handleBrickLevelCleared = async () => {
  if (brickLevelCleared.value || brickOver.value) return
  brickLevelCleared.value = true
  brickScore.value += 120 + brickStage.value * 40
  maybeUpdateBrickBestScore()
}

const advanceBrickStage = async () => {
  if (!isInBrickGame.value) return
  if (brickLoadingLevel.value) return
  brickStage.value += 1
  await prepareBrickLevel({
    stage: brickStage.value,
    resetScore: false,
    resetLives: false,
  })
}

const updateBrickPhysics = (dtSeconds) => {
  if (!isInBrickGame.value || brickLoadingLevel.value || brickOver.value || brickLevelCleared.value) return

  if (brickControlDir.value !== 0) {
    stepBrickPaddle(brickControlDir.value, BRICK_PADDLE_SPEED * dtSeconds)
  }

  if (brickBall.value.stuck) {
    placeBrickBallOnPaddle()
    return
  }

  const previousX = brickBall.value.x
  const previousY = brickBall.value.y

  let nextX = brickBall.value.x + brickBall.value.vx * dtSeconds
  let nextY = brickBall.value.y + brickBall.value.vy * dtSeconds
  let nextVx = brickBall.value.vx
  let nextVy = brickBall.value.vy
  const radius = brickBall.value.radius

  if (nextX - radius <= 0) {
    nextX = radius
    nextVx = Math.abs(nextVx)
  } else if (nextX + radius >= BRICK_WORLD_WIDTH) {
    nextX = BRICK_WORLD_WIDTH - radius
    nextVx = -Math.abs(nextVx)
  }

  if (nextY - radius <= 0) {
    nextY = radius
    nextVy = Math.abs(nextVy)
  }

  const paddleTop = brickPaddle.value.y
  const paddleBottom = paddleTop + brickPaddle.value.height
  const paddleLeft = brickPaddle.value.x
  const paddleRight = paddleLeft + brickPaddle.value.width

  if (
    nextVy > 0 &&
    nextY + radius >= paddleTop &&
    nextY - radius <= paddleBottom &&
    nextX >= paddleLeft - radius &&
    nextX <= paddleRight + radius
  ) {
    nextY = paddleTop - radius
    const center = paddleLeft + brickPaddle.value.width * 0.5
    const hit = clampBrickValue((nextX - center) / (brickPaddle.value.width * 0.5), -1, 1)
    const speed = clampBrickValue(Math.hypot(nextVx, nextVy) * 1.02, BRICK_MIN_SPEED, BRICK_MAX_SPEED)
    nextVx = speed * hit * 0.92
    const vertical = Math.sqrt(Math.max(speed * speed - nextVx * nextVx, 120 * 120))
    nextVy = -Math.abs(vertical)
  }

  let hitBrick = null
  for (let index = 0; index < brickBricks.value.length; index += 1) {
    const brick = brickBricks.value[index]
    if (brick.hp <= 0) continue

    const closestX = clampBrickValue(nextX, brick.x, brick.x + brick.width)
    const closestY = clampBrickValue(nextY, brick.y, brick.y + brick.height)
    const dx = nextX - closestX
    const dy = nextY - closestY
    if (dx * dx + dy * dy > radius * radius) continue

    hitBrick = brick
    const cameFromLeft = previousX + radius <= brick.x
    const cameFromRight = previousX - radius >= brick.x + brick.width
    const cameFromTop = previousY + radius <= brick.y
    const cameFromBottom = previousY - radius >= brick.y + brick.height

    if (cameFromLeft) {
      nextX = brick.x - radius
      nextVx = -Math.abs(nextVx)
    } else if (cameFromRight) {
      nextX = brick.x + brick.width + radius
      nextVx = Math.abs(nextVx)
    } else if (cameFromTop) {
      nextY = brick.y - radius
      nextVy = -Math.abs(nextVy)
    } else if (cameFromBottom) {
      nextY = brick.y + brick.height + radius
      nextVy = Math.abs(nextVy)
    } else {
      nextVy = -nextVy
    }
    break
  }

  if (hitBrick) {
    hitBrick.hp = Math.max(0, hitBrick.hp - 1)
    brickScore.value += hitBrick.hp === 0 ? 24 + brickStage.value * 4 : 8 + brickStage.value
    maybeUpdateBrickBestScore()
    if (brickRemainingBricks.value === 0) {
      void handleBrickLevelCleared()
    }
  }

  if (nextY - radius > BRICK_WORLD_HEIGHT) {
    handleBrickLifeLost()
    return
  }

  brickBall.value = {
    ...brickBall.value,
    x: nextX,
    y: nextY,
    vx: nextVx,
    vy: nextVy,
  }
  normalizeBrickBallVelocity()
}

const runBrickFrame = (timestamp) => {
  if (!isInBrickGame.value) {
    resetBrickAnimationLoop()
    return
  }

  if (!brickLastFrameTs) {
    brickLastFrameTs = timestamp
  }
  const deltaMs = Math.min(34, Math.max(0, timestamp - brickLastFrameTs))
  brickLastFrameTs = timestamp
  updateBrickPhysics(deltaMs / 1000)
  brickRafId = requestAnimationFrame(runBrickFrame)
}

const startBrickAnimationLoop = () => {
  if (brickRafId !== null) return
  brickLastFrameTs = 0
  brickRafId = requestAnimationFrame(runBrickFrame)
}

const getBrickStyle = (brick) => ({
  left: `${(brick.x / BRICK_WORLD_WIDTH) * 100}%`,
  top: `${(brick.y / BRICK_WORLD_HEIGHT) * 100}%`,
  width: `${(brick.width / BRICK_WORLD_WIDTH) * 100}%`,
  height: `${(brick.height / BRICK_WORLD_HEIGHT) * 100}%`,
  background: brick.color,
  opacity: String(0.6 + (brick.hp / Math.max(1, brick.maxHp)) * 0.4),
})

const getBrickClass = (brick) => `is-hp-${clampBrickValue(brick.hp, 1, 3)}`

const handleBrickFieldPointerDown = (event) => {
  if (!isInBrickGame.value) return
  if (typeof event.pointerId === 'number') {
    brickPointerId.value = event.pointerId
    const target = event.currentTarget
    if (target && typeof target.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        // no-op
      }
    }
  }
  setBrickPaddleCenterX(getBrickWorldXByClientX(event.clientX))
  if (brickBall.value.stuck && !brickLoadingLevel.value && !brickOver.value && !brickLevelCleared.value) {
    launchBrickBall()
  }
}

const handleBrickFieldPointerMove = (event) => {
  if (!isInBrickGame.value) return
  if (brickPointerId.value !== null && event.pointerId !== brickPointerId.value) return
  setBrickPaddleCenterX(getBrickWorldXByClientX(event.clientX))
}

const handleBrickFieldPointerUp = (event) => {
  if (brickPointerId.value !== null && event.pointerId !== brickPointerId.value) return
  brickPointerId.value = null
}

const handleBrickFieldPointerCancel = () => {
  brickPointerId.value = null
}

const startBrickDirectionControl = (direction) => {
  brickControlDir.value = clampBrickValue(direction, -1, 1)
}

const stopBrickDirectionControl = () => {
  brickControlDir.value = 0
}

const handleBrickPrimaryAction = () => {
  if (!isInBrickGame.value || brickLoadingLevel.value || brickOver.value) return
  if (brickLevelCleared.value) {
    void advanceBrickStage()
    return
  }
  launchBrickBall()
}

const buildKlotskiPiecesFromPositions = (positionsMap) =>
  KLOTSKI_TEMPLATES.map((template) => {
    const [x, y] = positionsMap[template.id] || [0, 0]
    return {
      ...template,
      x,
      y,
    }
  })

const createKlotskiSolvedPieces = () => buildKlotskiPiecesFromPositions(KLOTSKI_SOLVED_POSITIONS)
const createKlotskiClassicStartPieces = () => buildKlotskiPiecesFromPositions(KLOTSKI_CLASSIC_START_POSITIONS)
const cloneKlotskiPieces = (pieces) => pieces.map((item) => ({ ...item }))

const serializeKlotskiPieces = (pieces) => {
  const byId = pieces.reduce((acc, item) => {
    acc[item.id] = item
    return acc
  }, {})
  return KLOTSKI_TEMPLATES.map((template) => {
    const piece = byId[template.id]
    return `${piece?.x ?? 0},${piece?.y ?? 0}`
  }).join('|')
}

const createKlotskiOccupancy = (pieces) => {
  const grid = Array.from({ length: KLOTSKI_ROWS }, () => Array(KLOTSKI_COLS).fill(''))
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index]
    for (let y = 0; y < piece.height; y += 1) {
      for (let x = 0; x < piece.width; x += 1) {
        const nextX = piece.x + x
        const nextY = piece.y + y
        if (nextX < 0 || nextX >= KLOTSKI_COLS || nextY < 0 || nextY >= KLOTSKI_ROWS) {
          return null
        }
        if (grid[nextY][nextX]) {
          return null
        }
        grid[nextY][nextX] = piece.id
      }
    }
  }
  return grid
}

const canKlotskiMovePiece = (piece, dx, dy, occupancy) => {
  for (let y = 0; y < piece.height; y += 1) {
    for (let x = 0; x < piece.width; x += 1) {
      const currentX = piece.x + x
      const currentY = piece.y + y
      const targetX = currentX + dx
      const targetY = currentY + dy
      if (targetX < 0 || targetX >= KLOTSKI_COLS || targetY < 0 || targetY >= KLOTSKI_ROWS) {
        return false
      }
      const occupied = occupancy[targetY][targetX]
      if (!occupied || occupied === piece.id) continue
      return false
    }
  }
  return true
}

const getKlotskiAvailableMoves = (pieces) => {
  const occupancy = createKlotskiOccupancy(pieces)
  if (!occupancy) return []

  const moves = []
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index]
    for (let directionIndex = 0; directionIndex < KLOTSKI_DIRECTIONS.length; directionIndex += 1) {
      const direction = KLOTSKI_DIRECTIONS[directionIndex]
      if (!canKlotskiMovePiece(piece, direction.dx, direction.dy, occupancy)) continue
      moves.push({
        pieceId: piece.id,
        key: direction.key,
        dx: direction.dx,
        dy: direction.dy,
      })
    }
  }
  return moves
}

const applyKlotskiMove = (pieces, move) =>
  pieces.map((item) => {
    if (item.id !== move.pieceId) return { ...item }
    return {
      ...item,
      x: item.x + move.dx,
      y: item.y + move.dy,
    }
  })

const isKlotskiSolvedState = (pieces) => {
  const cao = pieces.find((item) => item.id === 'cao')
  return Boolean(cao && cao.x === 1 && cao.y === 3)
}

const getKlotskiCaoDistance = (pieces) => {
  const cao = pieces.find((item) => item.id === 'cao')
  if (!cao) return 0
  return Math.abs(cao.x - 1) + Math.abs(cao.y - 3)
}

const generateKlotskiLevel = () => {
  const maxAttempts = 24
  let best = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const random = createSeededRandom(Date.now() + attempt * 9973)
    const scrambleSteps = 54 + Math.floor(random() * 90)
    let pieces = createKlotskiSolvedPieces()
    let lastInverseKey = ''
    let repeatCount = 0
    const visited = new Set([serializeKlotskiPieces(pieces)])

    for (let step = 0; step < scrambleSteps; step += 1) {
      let moves = getKlotskiAvailableMoves(pieces)
      if (moves.length === 0) break

      if (moves.length > 1 && lastInverseKey) {
        const filtered = moves.filter((move) => `${move.pieceId}:${move.dx},${move.dy}` !== lastInverseKey)
        if (filtered.length > 0) {
          moves = filtered
        }
      }

      let pickedMove = null
      let pickedPieces = null
      let pickedKey = ''
      let fallbackMove = null
      let fallbackPieces = null
      let fallbackKey = ''

      for (let index = 0; index < moves.length; index += 1) {
        const candidate = moves[Math.floor(random() * moves.length)]
        const nextPieces = applyKlotskiMove(pieces, candidate)
        const nextKey = serializeKlotskiPieces(nextPieces)

        if (!fallbackMove) {
          fallbackMove = candidate
          fallbackPieces = nextPieces
          fallbackKey = nextKey
        }

        if (!visited.has(nextKey)) {
          pickedMove = candidate
          pickedPieces = nextPieces
          pickedKey = nextKey
          break
        }
      }

      if (!pickedMove || !pickedPieces) {
        pickedMove = fallbackMove
        pickedPieces = fallbackPieces
        pickedKey = fallbackKey
      }
      if (!pickedMove || !pickedPieces) break

      pieces = pickedPieces
      if (visited.has(pickedKey)) {
        repeatCount += 1
      } else {
        visited.add(pickedKey)
      }
      lastInverseKey = `${pickedMove.pieceId}:${-pickedMove.dx},${-pickedMove.dy}`
    }

    if (isKlotskiSolvedState(pieces)) {
      continue
    }

    const uniqueStates = visited.size
    const distance = getKlotskiCaoDistance(pieces)
    const complexity = Math.round(uniqueStates * 0.74 + scrambleSteps * 0.36 + distance * 15 - repeatCount * 1.3)
    const level = {
      pieces,
      meta: {
        scrambleSteps,
        uniqueStates,
        complexity: Math.max(1, complexity),
      },
    }

    if (uniqueStates >= 24 && distance >= 2 && complexity >= 58) {
      return level
    }
    if (!best || complexity > best.meta.complexity) {
      best = level
    }
  }

  return (
    best || {
      pieces: createKlotskiClassicStartPieces(),
      meta: {
        scrambleSteps: 0,
        uniqueStates: 0,
        complexity: 52,
      },
    }
  )
}

const getKlotskiPieceStyle = (piece) => ({
  left: `calc(${(piece.x / KLOTSKI_COLS) * 100}% + 2px)`,
  top: `calc(${(piece.y / KLOTSKI_ROWS) * 100}% + 2px)`,
  width: `calc(${(piece.width / KLOTSKI_COLS) * 100}% - 4px)`,
  height: `calc(${(piece.height / KLOTSKI_ROWS) * 100}% - 4px)`,
})

const applyKlotskiLevel = ({ pieces, meta }) => {
  klotskiPieces.value = cloneKlotskiPieces(pieces || createKlotskiClassicStartPieces())
  klotskiMoves.value = 0
  klotskiSolved.value = false
  klotskiMeta.value = {
    scrambleSteps: Number(meta?.scrambleSteps) || 0,
    uniqueStates: Number(meta?.uniqueStates) || 0,
    complexity: Number(meta?.complexity) || 0,
  }
  klotskiSelectedPieceId.value = 'cao'
}

const maybeUpdateKlotskiBestSteps = () => {
  if (!klotskiSolved.value || klotskiMoves.value <= 0) return
  if (klotskiBestSteps.value > 0 && klotskiMoves.value >= klotskiBestSteps.value) return
  klotskiBestSteps.value = klotskiMoves.value
  void kvStorage.set(KLOTSKI_BEST_STEP_STORAGE_KEY, klotskiBestSteps.value).catch(() => {})
}

const initializeKlotski = async ({ regenerate = true } = {}) => {
  if (!regenerate && hasKlotskiInitialized.value) return

  klotskiGenerating.value = true
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
  const generated = generateKlotskiLevel()
  applyKlotskiLevel(generated)
  klotskiGenerating.value = false
  hasKlotskiInitialized.value = true
}

const moveKlotskiPieceByDirection = (directionKey) => {
  if (!isInKlotskiGame.value || klotskiGenerating.value || klotskiSolved.value) return false
  const move = klotskiMoveMap.value[directionKey]
  if (!move) return false

  klotskiPieces.value = applyKlotskiMove(klotskiPieces.value, move)
  klotskiMoves.value += 1
  if (isKlotskiSolvedState(klotskiPieces.value)) {
    klotskiSolved.value = true
    maybeUpdateKlotskiBestSteps()
  }
  return true
}

const handleKlotskiPieceTap = (pieceId) => {
  if (!isInKlotskiGame.value || klotskiGenerating.value || klotskiSolved.value) return
  const piece = klotskiPieces.value.find((item) => item.id === pieceId)
  if (!piece) return

  const moves = getKlotskiAvailableMoves(klotskiPieces.value).filter((move) => move.pieceId === pieceId)
  klotskiSelectedPieceId.value = pieceId
  if (moves.length === 1) {
    moveKlotskiPieceByDirection(moves[0].key)
  }
}

const initializeGame = () => {
  const nextBoard = createEmptyBoard()
  spawnRandomTile(nextBoard, 2)
  board.value = nextBoard
  score.value = 0
  gameOver.value = false
  reached2048.value = false
  has2048Initialized.value = true
}

const resetMinesTimer = () => {
  if (minesTimerId !== null) {
    clearInterval(minesTimerId)
    minesTimerId = null
  }
}

const resetMinesLongPressState = () => {
  if (minesLongPressTimerId !== null) {
    clearTimeout(minesLongPressTimerId)
    minesLongPressTimerId = null
  }
  minesLongPressState.value = {
    active: false,
    pointerId: null,
    row: -1,
    col: -1,
    triggered: false,
  }
}

const startMinesTimer = () => {
  if (minesTimerId !== null) return
  minesTimerId = setInterval(() => {
    minesElapsed.value += 1
  }, 1000)
}

const getMinesNeighbors = (row, col) => {
  const neighbors = []
  for (let rowDelta = -1; rowDelta <= 1; rowDelta += 1) {
    for (let colDelta = -1; colDelta <= 1; colDelta += 1) {
      if (rowDelta === 0 && colDelta === 0) continue
      const nextRow = row + rowDelta
      const nextCol = col + colDelta
      if (
        nextRow < 0 ||
        nextRow >= currentMinesConfig.value.rows ||
        nextCol < 0 ||
        nextCol >= currentMinesConfig.value.cols
      ) {
        continue
      }
      neighbors.push([nextRow, nextCol])
    }
  }
  return neighbors
}

const recalculateMinesFlagCount = () => {
  let count = 0
  for (let row = 0; row < currentMinesConfig.value.rows; row += 1) {
    for (let col = 0; col < currentMinesConfig.value.cols; col += 1) {
      if (minesBoard.value[row][col].flagged) {
        count += 1
      }
    }
  }
  minesFlagCount.value = count
}

const initializeMinesweeper = () => {
  resetMinesTimer()
  resetMinesLongPressState()
  minesBoard.value = createEmptyMinesBoard(currentMinesConfig.value.rows, currentMinesConfig.value.cols)
  minesMode.value = MINES_MODE_REVEAL
  minesStarted.value = false
  minesOver.value = false
  minesWon.value = false
  minesNewRecord.value = false
  suppressNextMinesClick.value = false
  minesElapsed.value = 0
  minesFlagCount.value = 0
  hasMinesInitialized.value = true
}

const placeMines = (safeRow, safeCol) => {
  const candidates = []
  for (let row = 0; row < currentMinesConfig.value.rows; row += 1) {
    for (let col = 0; col < currentMinesConfig.value.cols; col += 1) {
      if (row === safeRow && col === safeCol) continue
      candidates.push([row, col])
    }
  }

  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]]
  }

  const nextBoard = createEmptyMinesBoard(currentMinesConfig.value.rows, currentMinesConfig.value.cols)
  for (
    let index = 0;
    index < currentMinesConfig.value.mines && index < candidates.length;
    index += 1
  ) {
    const [mineRow, mineCol] = candidates[index]
    nextBoard[mineRow][mineCol].mine = true
  }

  for (let row = 0; row < currentMinesConfig.value.rows; row += 1) {
    for (let col = 0; col < currentMinesConfig.value.cols; col += 1) {
      const cell = nextBoard[row][col]
      if (cell.mine) continue

      const neighbors = getMinesNeighbors(row, col)
      let adjacentCount = 0
      for (let index = 0; index < neighbors.length; index += 1) {
        const [nearRow, nearCol] = neighbors[index]
        if (nextBoard[nearRow][nearCol].mine) {
          adjacentCount += 1
        }
      }
      cell.adjacent = adjacentCount
    }
  }

  minesBoard.value = nextBoard
}

const revealAllMines = () => {
  for (let row = 0; row < currentMinesConfig.value.rows; row += 1) {
    for (let col = 0; col < currentMinesConfig.value.cols; col += 1) {
      const cell = minesBoard.value[row][col]
      if (cell.mine) {
        cell.revealed = true
      }
    }
  }
}

const countRevealedSafeCells = () => {
  let count = 0
  for (let row = 0; row < currentMinesConfig.value.rows; row += 1) {
    for (let col = 0; col < currentMinesConfig.value.cols; col += 1) {
      const cell = minesBoard.value[row][col]
      if (!cell.mine && cell.revealed) {
        count += 1
      }
    }
  }
  return count
}

const checkMinesWin = () => {
  if (minesOver.value) return
  const safeTotal =
    currentMinesConfig.value.rows * currentMinesConfig.value.cols - currentMinesConfig.value.mines
  if (countRevealedSafeCells() < safeTotal) return

  minesWon.value = true
  minesOver.value = true
  resetMinesTimer()
  minesNewRecord.value = false

  const previousBest = Number(minesBestTimes.value[minesDifficulty.value])
  const shouldUpdateBest =
    !Number.isFinite(previousBest) || previousBest <= 0 || minesElapsed.value < previousBest
  if (shouldUpdateBest) {
    minesBestTimes.value = {
      ...minesBestTimes.value,
      [minesDifficulty.value]: minesElapsed.value,
    }
    minesNewRecord.value = true
    void persistMinesBestTimes()
  }

  for (let row = 0; row < currentMinesConfig.value.rows; row += 1) {
    for (let col = 0; col < currentMinesConfig.value.cols; col += 1) {
      const cell = minesBoard.value[row][col]
      if (cell.mine && !cell.flagged) {
        cell.flagged = true
      }
    }
  }
  recalculateMinesFlagCount()
}

const floodReveal = (startRow, startCol) => {
  const queue = [[startRow, startCol]]
  while (queue.length > 0) {
    const [row, col] = queue.shift()
    const cell = minesBoard.value[row][col]
    if (cell.revealed || cell.flagged) continue

    cell.revealed = true
    if (cell.adjacent !== 0) continue

    const neighbors = getMinesNeighbors(row, col)
    for (let index = 0; index < neighbors.length; index += 1) {
      const [nearRow, nearCol] = neighbors[index]
      const nearCell = minesBoard.value[nearRow][nearCol]
      if (!nearCell.mine && !nearCell.revealed && !nearCell.flagged) {
        queue.push([nearRow, nearCol])
      }
    }
  }
}

const revealMinesCell = (row, col) => {
  if (minesOver.value) return

  const firstCell = minesBoard.value[row][col]
  if (firstCell.flagged || firstCell.revealed) return

  if (!minesStarted.value) {
    placeMines(row, col)
    minesStarted.value = true
    startMinesTimer()
  }

  const cell = minesBoard.value[row][col]
  if (cell.mine) {
    cell.revealed = true
    minesWon.value = false
    minesOver.value = true
    revealAllMines()
    resetMinesTimer()
    return
  }

  floodReveal(row, col)
  checkMinesWin()
}

const setMinesDifficulty = (difficultyId) => {
  if (minesDifficulty.value === difficultyId) return
  const exists = MINES_DIFFICULTIES.some((item) => item.id === difficultyId)
  if (!exists) return

  minesDifficulty.value = difficultyId
  initializeMinesweeper()
  requestAnimationFrame(() => {
    clampToViewport()
  })
}

const toggleMinesFlag = (row, col) => {
  if (minesOver.value) return
  const cell = minesBoard.value[row][col]
  if (cell.revealed) return

  cell.flagged = !cell.flagged
  recalculateMinesFlagCount()
}

const handleMinesCellPointerDown = (row, col, event) => {
  if (!isInMinesweeperGame.value || minesOver.value) return
  if (!event || event.pointerType === 'mouse') return

  resetMinesLongPressState()

  minesLongPressState.value = {
    active: true,
    pointerId: typeof event.pointerId === 'number' ? event.pointerId : null,
    row,
    col,
    triggered: false,
  }

  minesLongPressTimerId = setTimeout(() => {
    const state = minesLongPressState.value
    if (!state.active || state.row !== row || state.col !== col) return

    const cell = minesBoard.value[row]?.[col]
    if (!cell || cell.revealed) {
      resetMinesLongPressState()
      return
    }

    toggleMinesFlag(row, col)
    suppressNextMinesClick.value = true
    minesLongPressState.value = {
      ...state,
      triggered: true,
    }
  }, MINES_LONG_PRESS_MS)
}

const handleMinesCellPointerUp = (event) => {
  const state = minesLongPressState.value
  if (!state.active) return
  if (
    state.pointerId !== null &&
    typeof event?.pointerId === 'number' &&
    event.pointerId !== state.pointerId
  ) {
    return
  }

  if (state.triggered) {
    suppressNextMinesClick.value = true
  }
  resetMinesLongPressState()
}

const handleMinesCellPointerCancel = () => {
  resetMinesLongPressState()
}

const handleMinesCellPrimary = (row, col) => {
  if (!isInMinesweeperGame.value) return
  if (suppressNextMinesClick.value) {
    suppressNextMinesClick.value = false
    return
  }
  if (minesMode.value === MINES_MODE_FLAG) {
    toggleMinesFlag(row, col)
    return
  }
  revealMinesCell(row, col)
}

const handleMinesCellSecondary = (row, col) => {
  if (!isInMinesweeperGame.value) return
  toggleMinesFlag(row, col)
}

const restartGame = () => {
  if (isInMinesweeperGame.value) {
    initializeMinesweeper()
    return
  }
  if (isInKlotskiGame.value) {
    void initializeKlotski({ regenerate: true })
    return
  }
  if (isInBrickGame.value) {
    void initializeBrickBreaker({ resetStage: true }).then(() => {
      if (!brickLoadingLevel.value && !brickOver.value) {
        startBrickAnimationLoop()
      }
    })
    return
  }
  if (isInTetrisGame.value) {
    initializeTetris()
    if (!tetrisOver.value) {
      startTetrisTimer()
    }
    return
  }
  if (isInPetGame.value) {
    void resetPetProgress()
    return
  }
  if (isInDungeonGame.value) {
    void resetDungeonProgress()
    return
  }
  initializeGame()
}

const moveBoard = (direction) => {
  if (!isIn2048Game.value || !has2048Initialized.value || gameOver.value) return

  const current = board.value
  const next = createEmptyBoard()
  let moved = false
  let gained = 0
  let maxTile = 0

  if (direction === 'left' || direction === 'right') {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      const original = [...current[row]]
      const working = direction === 'right' ? [...original].reverse() : [...original]
      const result = collapseLine(working)
      const restored = direction === 'right' ? [...result.line].reverse() : [...result.line]
      next[row] = restored

      if (!moved && restored.some((value, index) => value !== original[index])) {
        moved = true
      }
      gained += result.gained
      maxTile = Math.max(maxTile, result.maxValue)
    }
  } else if (direction === 'up' || direction === 'down') {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const original = []
      for (let row = 0; row < BOARD_SIZE; row += 1) {
        original.push(current[row][col])
      }

      const working = direction === 'down' ? [...original].reverse() : [...original]
      const result = collapseLine(working)
      const restored = direction === 'down' ? [...result.line].reverse() : [...result.line]

      for (let row = 0; row < BOARD_SIZE; row += 1) {
        next[row][col] = restored[row]
      }

      if (!moved && restored.some((value, index) => value !== original[index])) {
        moved = true
      }
      gained += result.gained
      maxTile = Math.max(maxTile, result.maxValue)
    }
  } else {
    return
  }

  if (!moved) return

  spawnRandomTile(next, 1)
  board.value = next
  score.value += gained

  const boardMax = next.reduce(
    (max, row) => Math.max(max, row.reduce((rowMax, value) => Math.max(rowMax, value), 0)),
    maxTile,
  )
  if (boardMax >= 2048) {
    reached2048.value = true
  }

  if (score.value > bestScore.value) {
    bestScore.value = score.value
    void persistBestScore()
  }

  if (!hasAvailableMoves(next)) {
    gameOver.value = true
  }
}

const resetToLibraryView = () => {
  if (selectedGameId.value === GAME_ID_MINESWEEPER && minesStarted.value && !minesOver.value) {
    resetMinesTimer()
  }
  if (selectedGameId.value === GAME_ID_TETRIS && !tetrisOver.value) {
    resetTetrisTimer()
  }
  if (selectedGameId.value === GAME_ID_BRICK) {
    resetBrickAnimationLoop()
  }
  if (selectedGameId.value === GAME_ID_PET) {
    stopPetDecayLoop()
    stopPetBlinkLoop()
  }
  resetMinesLongPressState()
  suppressNextMinesClick.value = false
  currentView.value = 'library'
  selectedGameId.value = ''
}

const openGame = async (gameId) => {
  const game = games.find((item) => item.id === gameId)
  if (!game || !game.enabled) return

  if (game.id === GAME_ID_2048) {
    selectedGameId.value = GAME_ID_2048
    currentView.value = 'game'
    if (!has2048Initialized.value) {
      initializeGame()
    }
    requestAnimationFrame(() => {
      clampToViewport()
    })
    return
  }

  if (game.id === GAME_ID_MINESWEEPER) {
    selectedGameId.value = GAME_ID_MINESWEEPER
    currentView.value = 'game'
    if (!hasMinesInitialized.value) {
      initializeMinesweeper()
    } else if (minesStarted.value && !minesOver.value) {
      startMinesTimer()
    }
    requestAnimationFrame(() => {
      clampToViewport()
    })
    return
  }

  if (game.id === GAME_ID_KLOTSKI) {
    selectedGameId.value = GAME_ID_KLOTSKI
    currentView.value = 'game'
    if (!hasKlotskiInitialized.value || klotskiSolved.value) {
      await initializeKlotski({ regenerate: true })
    } else {
      await initializeKlotski({ regenerate: false })
    }
    requestAnimationFrame(() => {
      clampToViewport()
    })
    return
  }

  if (game.id === GAME_ID_BRICK) {
    selectedGameId.value = GAME_ID_BRICK
    currentView.value = 'game'
    if (!hasBrickInitialized.value || brickOver.value) {
      await initializeBrickBreaker({ resetStage: true })
    }
    if (!brickLoadingLevel.value) {
      startBrickAnimationLoop()
    }
    requestAnimationFrame(() => {
      clampToViewport()
    })
    return
  }

  if (game.id === GAME_ID_TETRIS) {
    selectedGameId.value = GAME_ID_TETRIS
    currentView.value = 'game'
    if (!hasTetrisInitialized.value || tetrisOver.value) {
      initializeTetris()
    }
    if (!tetrisOver.value) {
      startTetrisTimer()
    }
    requestAnimationFrame(() => {
      clampToViewport()
    })
    return
  }

  if (game.id === GAME_ID_PET) {
    selectedGameId.value = GAME_ID_PET
    currentView.value = 'game'
    petError.value = ''
    applyPetDecayByElapsed(Date.now())
    startPetBlinkLoop()
    startPetDecayLoop()
    void persistPetState()
    requestAnimationFrame(() => {
      clampToViewport()
    })
    return
  }

  if (game.id === GAME_ID_DUNGEON) {
    selectedGameId.value = GAME_ID_DUNGEON
    currentView.value = 'game'
    if (!hasDungeonInitialized.value) {
      await initializeDungeonAdventure()
    }
    requestAnimationFrame(() => {
      clampToViewport()
    })
  }
}

const handleGameOverBackToLibrary = () => {
  if (isInBrickGame.value || isInKlotskiGame.value) {
    resetToLibraryView()
    return
  }
  restartGame()
  resetToLibraryView()
}

const loadBestScore = async () => {
  try {
    const stored = Number(await kvStorage.get(BEST_SCORE_STORAGE_KEY))
    if (Number.isFinite(stored) && stored >= 0) {
      bestScore.value = Math.floor(stored)
    }
  } catch {
    // no-op
  }
}

const loadMinesBestTimes = async () => {
  try {
    const stored = await kvStorage.get(MINES_BEST_TIMES_STORAGE_KEY)
    if (!stored || typeof stored !== 'object') return

    const next = {}
    for (let index = 0; index < MINES_DIFFICULTIES.length; index += 1) {
      const id = MINES_DIFFICULTIES[index].id
      const value = Number(stored[id])
      if (Number.isFinite(value) && value > 0) {
        next[id] = Math.floor(value)
      }
    }
    minesBestTimes.value = next
  } catch {
    // no-op
  }
}

const loadTetrisBestScore = async () => {
  try {
    const stored = Number(await kvStorage.get(TETRIS_BEST_SCORE_STORAGE_KEY))
    if (Number.isFinite(stored) && stored >= 0) {
      tetrisBestScore.value = Math.floor(stored)
    }
  } catch {
    // no-op
  }
}

const loadBrickBestScore = async () => {
  try {
    const stored = Number(await kvStorage.get(BRICK_BEST_SCORE_STORAGE_KEY))
    if (Number.isFinite(stored) && stored >= 0) {
      brickBestScore.value = Math.floor(stored)
    }
  } catch {
    // no-op
  }
}

const loadKlotskiBestSteps = async () => {
  try {
    const stored = Number(await kvStorage.get(KLOTSKI_BEST_STEP_STORAGE_KEY))
    if (Number.isFinite(stored) && stored > 0) {
      klotskiBestSteps.value = Math.floor(stored)
    }
  } catch {
    // no-op
  }
}

const getRootSize = () => {
  const fallback = isOpen.value ? { width: 324, height: 496 } : { width: 60, height: 60 }
  const root = handheldRef.value
  if (!root) return fallback

  return {
    width: Math.max(56, root.offsetWidth || fallback.width),
    height: Math.max(56, root.offsetHeight || fallback.height),
  }
}

const clampToViewport = () => {
  const { width, height } = getRootSize()
  const maxX = Math.max(0, window.innerWidth - width)
  const maxY = Math.max(0, window.innerHeight - height)

  pluginPosition.value = {
    x: Math.max(0, Math.min(pluginPosition.value.x, maxX)),
    y: Math.max(0, Math.min(pluginPosition.value.y, maxY)),
  }
}

const savePosition = async () => {
  try {
    await kvStorage.set(POSITION_STORAGE_KEY, pluginPosition.value)
  } catch {
    // no-op
  }
}

const loadPosition = async () => {
  try {
    const stored = await kvStorage.get(POSITION_STORAGE_KEY)
    if (!stored || typeof stored !== 'object') return

    const x = Number(stored.x)
    const y = Number(stored.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    pluginPosition.value = { x, y }
  } catch {
    // no-op
  }
}

const stopDrag = () => {
  if (!isDragging.value) return

  isDragging.value = false
  const pointerId = activePointerId.value
  if (
    pointerCaptureTarget.value &&
    typeof pointerCaptureTarget.value.releasePointerCapture === 'function' &&
    typeof pointerId === 'number'
  ) {
    try {
      pointerCaptureTarget.value.releasePointerCapture(pointerId)
    } catch {
      // no-op
    }
  }
  pointerCaptureTarget.value = null
  activePointerId.value = null

  document.removeEventListener('pointermove', handleDrag)
  document.removeEventListener('pointerup', stopDrag)
  document.removeEventListener('pointercancel', stopDrag)

  clampToViewport()
  void savePosition()
}

const handleDrag = (event) => {
  if (!isDragging.value) return
  if (activePointerId.value !== null && event.pointerId !== activePointerId.value) return

  const deltaX = event.clientX - dragStartPos.value.x
  const deltaY = event.clientY - dragStartPos.value.y

  if (!dragMoved.value && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
    dragMoved.value = true
  }

  const { width, height } = getRootSize()
  const maxX = Math.max(0, window.innerWidth - width)
  const maxY = Math.max(0, window.innerHeight - height)

  pluginPosition.value = {
    x: Math.max(0, Math.min(pluginStartPos.value.x + deltaX, maxX)),
    y: Math.max(0, Math.min(pluginStartPos.value.y + deltaY, maxY)),
  }

  if (event.cancelable) {
    event.preventDefault()
  }
}

const startDrag = (event) => {
  if (typeof event.pointerId !== 'number') return
  if (event.pointerType === 'mouse' && event.button !== 0) return

  activePointerId.value = event.pointerId
  const captureTarget = event.currentTarget
  if (captureTarget && typeof captureTarget.setPointerCapture === 'function') {
    try {
      captureTarget.setPointerCapture(event.pointerId)
      pointerCaptureTarget.value = captureTarget
    } catch {
      pointerCaptureTarget.value = null
    }
  } else {
    pointerCaptureTarget.value = null
  }

  isDragging.value = true
  dragMoved.value = false
  dragStartPos.value = { x: event.clientX, y: event.clientY }
  pluginStartPos.value = { ...pluginPosition.value }

  document.addEventListener('pointermove', handleDrag)
  document.addEventListener('pointerup', stopDrag)
  document.addEventListener('pointercancel', stopDrag)

  if (event.cancelable) {
    event.preventDefault()
  }
}

const toggleOpen = () => {
  if (dragMoved.value) {
    dragMoved.value = false
    return
  }

  const nextOpen = !isOpen.value
  isOpen.value = nextOpen
  resetToLibraryView()
  requestAnimationFrame(() => {
    clampToViewport()
  })
}

const collapsePanel = () => {
  if (!isOpen.value) return
  isOpen.value = false
  resetToLibraryView()
}

const handleDocumentPointerDown = (event) => {
  if (!isOpen.value || isDragging.value) return

  const root = handheldRef.value
  if (!root) return

  const target = event.target
  if (target instanceof Node && root.contains(target)) {
    return
  }

  collapsePanel()
}

const handleBoardPointerDown = (event) => {
  if (!isIn2048Game.value) return
  if (typeof event.pointerId !== 'number') return
  if (event.pointerType === 'mouse' && event.button !== 0) return

  swipeState.value = {
    active: true,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
  }

  const target = boardRef.value
  if (target && typeof target.setPointerCapture === 'function') {
    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      // no-op
    }
  }
}

const resetSwipe = () => {
  swipeState.value = {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
  }
}

const handleBoardPointerUp = (event) => {
  if (!isIn2048Game.value) {
    resetSwipe()
    return
  }
  if (!swipeState.value.active) return
  if (swipeState.value.pointerId !== null && swipeState.value.pointerId !== event.pointerId) return

  const deltaX = event.clientX - swipeState.value.startX
  const deltaY = event.clientY - swipeState.value.startY
  const absX = Math.abs(deltaX)
  const absY = Math.abs(deltaY)
  const threshold = 24

  let direction = ''
  if (absX >= threshold || absY >= threshold) {
    if (absX > absY) {
      direction = deltaX > 0 ? 'right' : 'left'
    } else {
      direction = deltaY > 0 ? 'down' : 'up'
    }
  }

  resetSwipe()

  if (!direction) return
  moveBoard(direction)
}

const getTileClass = (value) => {
  if (!value) return 'is-empty'
  if (value <= 2048) return `tile-${value}`
  return 'tile-big'
}

const getMinesCellClass = (cell) => {
  if (!cell.revealed) {
    return cell.flagged ? 'is-flagged' : 'is-hidden'
  }
  if (cell.mine) return 'is-mine'
  if (cell.adjacent === 0) return 'is-clear'
  return `is-num-${cell.adjacent}`
}

const getMinesCellText = (cell) => {
  if (!cell.revealed) return cell.flagged ? '⚑' : ''
  if (cell.mine) return '💣'
  if (cell.adjacent > 0) return String(cell.adjacent)
  return ''
}

const handleKeydown = (event) => {
  if (!isOpen.value || (!isIn2048Game.value && !isInTetrisGame.value && !isInBrickGame.value && !isInKlotskiGame.value)) return
  if (event.metaKey || event.ctrlKey || event.altKey) return

  const target = event.target
  const tagName = String(target?.tagName || '').toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) {
    return
  }

  const key = String(event.key || '').toLowerCase()

  if (isIn2048Game.value) {
    const keyDirectionMap = {
      arrowup: 'up',
      arrowdown: 'down',
      arrowleft: 'left',
      arrowright: 'right',
      w: 'up',
      s: 'down',
      a: 'left',
      d: 'right',
    }
    const direction = keyDirectionMap[key]
    if (!direction) return

    event.preventDefault()
    moveBoard(direction)
    return
  }

  if (isInBrickGame.value) {
    if (key === 'arrowleft' || key === 'a') {
      event.preventDefault()
      stepBrickPaddle(-1, 16)
      return
    }
    if (key === 'arrowright' || key === 'd') {
      event.preventDefault()
      stepBrickPaddle(1, 16)
      return
    }
    if (key === 'arrowup' || key === 'w' || key === ' ') {
      event.preventDefault()
      if (brickLevelCleared.value) {
        void advanceBrickStage()
      } else {
        launchBrickBall()
      }
      return
    }
    if (key === 'r') {
      event.preventDefault()
      restartGame()
    }
    return
  }

  if (isInKlotskiGame.value) {
    const keyDirectionMap = {
      arrowup: 'up',
      arrowleft: 'left',
      arrowdown: 'down',
      arrowright: 'right',
      w: 'up',
      a: 'left',
      s: 'down',
      d: 'right',
    }
    const direction = keyDirectionMap[key]
    if (direction) {
      event.preventDefault()
      moveKlotskiPieceByDirection(direction)
      return
    }
    if (key === 'r') {
      event.preventDefault()
      restartGame()
      return
    }
    if (key === 'n' || key === ' ') {
      event.preventDefault()
      void initializeKlotski({ regenerate: true })
    }
    return
  }

  if (!isInTetrisGame.value || tetrisOver.value) return

  if (key === 'arrowleft' || key === 'a') {
    event.preventDefault()
    moveTetrisPiece(0, -1)
    return
  }
  if (key === 'arrowright' || key === 'd') {
    event.preventDefault()
    moveTetrisPiece(0, 1)
    return
  }
  if (key === 'arrowdown' || key === 's') {
    event.preventDefault()
    softDropTetrisPiece()
    return
  }
  if (key === 'arrowup' || key === 'w' || key === 'x') {
    event.preventDefault()
    rotateTetrisPiece()
    return
  }
  if (key === ' ') {
    event.preventDefault()
    hardDropTetrisPiece()
  }
}

const handleWindowResize = () => {
  clampToViewport()
}

onMounted(async () => {
  await Promise.all([
    loadPosition(),
    loadBestScore(),
    loadMinesBestTimes(),
    loadTetrisBestScore(),
    loadBrickBestScore(),
    loadKlotskiBestSteps(),
    loadPetState(),
    loadDungeonState(),
  ])
  applyPetDecayByElapsed(Date.now())
  await persistPetState()

  requestAnimationFrame(() => {
    clampToViewport()
  })

  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', handleWindowResize)
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', handleWindowResize)
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  stopDrag()
  resetMinesLongPressState()
  resetMinesTimer()
  resetTetrisTimer()
  resetBrickAnimationLoop()
  stopPetDecayLoop()
  stopPetBlinkLoop()
})
</script>

<template>
  <div
    ref="handheldRef"
    class="handheld-plugin"
    :class="{ dragging: isDragging, 'is-open': isOpen, 'is-android': isAndroidPlatform }"
    :style="{
      left: `${pluginPosition.x}px`,
      top: `${pluginPosition.y}px`,
    }"
  >
    <button
      type="button"
      class="handheld-trigger small-btn"
      aria-label="打开掌机"
      @pointerdown="startDrag"
      @click="toggleOpen"
    >
      <span class="trigger-icon">🎮</span>
    </button>

    <Transition name="handheld-slide">
      <section
        v-if="isOpen"
        class="handheld-panel"
        :class="{
          'is-mines-layout': isInMinesweeperGame,
          'is-mines-dense-layout': isInMinesweeperGame && currentMinesConfig.cols >= 11,
          'is-tetris-layout': isInTetrisGame,
          'is-brick-layout': isInBrickGame,
          'is-klotski-layout': isInKlotskiGame,
          'is-pet-layout': isInPetGame,
          'is-dungeon-layout': isInDungeonGame,
        }"
      >
        <header class="handheld-header" @pointerdown="startDrag">
          <div class="title-group">
            <p class="title-main">掌机</p>
            <p class="title-sub">{{ currentSubtitle }}</p>
          </div>
          <div class="header-actions">
            <button
              v-if="isInAnyGame"
              type="button"
              class="small-btn reset-btn back-btn"
              @pointerdown.stop
              @click.stop="resetToLibraryView"
            >
              游戏库
            </button>
            <button
              v-if="isInAnyGame"
              type="button"
              class="small-btn reset-btn"
              @pointerdown.stop
              @click.stop="restartGame"
            >
              重开
            </button>
          </div>
        </header>

        <div v-if="!isInAnyGame" class="game-library">
          <div class="game-grid">
            <button
              v-for="game in games"
              :key="game.id"
              type="button"
              class="small-btn game-icon-btn"
              :class="{ 'is-disabled': !game.enabled }"
              :disabled="!game.enabled"
              @pointerdown.stop
              @click.stop="openGame(game.id)"
            >
              <span class="game-icon-emoji">{{ game.icon }}</span>
              <span class="game-icon-name">{{ game.name }}</span>
              <span class="game-icon-sub">{{ game.subtitle }}</span>
            </button>
          </div>
          <p class="library-hint">点击游戏图标进入</p>
        </div>

        <template v-else>
          <template v-if="isIn2048Game">
            <div class="score-row">
              <div class="score-chip">
                <span class="chip-label">分数</span>
                <span class="chip-value">{{ score }}</span>
              </div>
              <div class="score-chip">
                <span class="chip-label">最高</span>
                <span class="chip-value">{{ bestScore }}</span>
              </div>
            </div>

            <div
              ref="boardRef"
              class="board"
              @pointerdown="handleBoardPointerDown"
              @pointerup="handleBoardPointerUp"
              @pointercancel="resetSwipe"
            >
              <div
                v-for="(value, index) in flatBoard"
                :key="index"
                class="tile"
                :class="getTileClass(value)"
              >
                {{ value || '' }}
              </div>
            </div>

            <div class="controls">
              <button type="button" class="small-btn ctrl-btn" @pointerdown.stop @click="moveBoard('up')">↑</button>
              <button type="button" class="small-btn ctrl-btn" @pointerdown.stop @click="moveBoard('left')">←</button>
              <button type="button" class="small-btn ctrl-btn" @pointerdown.stop @click="moveBoard('down')">↓</button>
              <button type="button" class="small-btn ctrl-btn" @pointerdown.stop @click="moveBoard('right')">→</button>
            </div>

            <p v-if="gameOver" class="game-state state-over">已无可移动位置</p>
            <p v-else-if="reached2048" class="game-state state-win">已达到 2048，可继续挑战更高分</p>
            <p v-else class="game-state state-hint">支持滑动、方向键、WASD</p>

            <div v-if="showGameOverModal" class="mini-modal-mask">
              <div class="mini-modal" @pointerdown.stop>
                <p class="mini-title">游戏结束</p>
                <p class="mini-desc">已经没有可移动位置</p>
                <div class="mini-actions">
                  <button
                    type="button"
                    class="small-btn mini-btn mini-btn-primary"
                    @pointerdown.stop
                    @click.stop="restartGame"
                  >
                    再来一局
                  </button>
                  <button
                    type="button"
                    class="small-btn mini-btn"
                    @pointerdown.stop
                    @click.stop="handleGameOverBackToLibrary"
                  >
                    返回游戏库
                  </button>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="isInMinesweeperGame">
            <div class="mines-stats">
              <div class="score-chip">
                <span class="chip-label">剩余雷</span>
                <span class="chip-value">{{ minesRemaining }}</span>
              </div>
              <div class="score-chip">
                <span class="chip-label">用时</span>
                <span class="chip-value">{{ minesElapsed }}s</span>
              </div>
              <div class="score-chip">
                <span class="chip-label">最佳</span>
                <span class="chip-value">{{ currentMinesBestTime === null ? '--' : `${currentMinesBestTime}s` }}</span>
              </div>
            </div>

            <div class="mines-difficulty">
              <button
                v-for="difficulty in MINES_DIFFICULTIES"
                :key="difficulty.id"
                type="button"
                class="small-btn mines-diff-btn"
                :class="{ active: minesDifficulty === difficulty.id }"
                @pointerdown.stop
                @click.stop="setMinesDifficulty(difficulty.id)"
              >
                {{ difficulty.name }}
              </button>
            </div>

            <div class="mines-mode">
              <button
                type="button"
                class="small-btn mines-mode-btn"
                :class="{ active: minesMode === 'reveal' }"
                @pointerdown.stop
                @click.stop="minesMode = 'reveal'"
              >
                挖开
              </button>
              <button
                type="button"
                class="small-btn mines-mode-btn"
                :class="{ active: minesMode === 'flag' }"
                @pointerdown.stop
                @click.stop="minesMode = 'flag'"
              >
                插旗
              </button>
            </div>

            <div class="mines-board" :class="minesBoardClass" :style="minesBoardStyle" @contextmenu.prevent>
              <button
                v-for="item in minesCells"
                :key="item.key"
                type="button"
                class="small-btn mines-cell"
                :class="getMinesCellClass(item.cell)"
                @pointerdown.stop="handleMinesCellPointerDown(item.row, item.col, $event)"
                @pointerup.stop="handleMinesCellPointerUp($event)"
                @pointercancel.stop="handleMinesCellPointerCancel"
                @pointerleave.stop="handleMinesCellPointerCancel"
                @click.stop="handleMinesCellPrimary(item.row, item.col)"
                @contextmenu.prevent.stop="handleMinesCellSecondary(item.row, item.col)"
              >
                {{ getMinesCellText(item.cell) }}
              </button>
            </div>

            <p v-if="minesOver && minesWon" class="game-state state-win">排雷成功</p>
            <p v-else-if="minesOver" class="game-state state-over">踩雷了</p>
            <p v-else class="game-state state-hint">左键挖开，右键插旗，手机长按可插旗</p>

            <div v-if="showMinesResultModal" class="mini-modal-mask">
              <div class="mini-modal" :class="{ 'is-win': minesWon }" @pointerdown.stop>
                <p class="mini-title">{{ minesWon ? '排雷成功' : '踩雷了' }}</p>
                <p class="mini-desc">
                  {{ minesWon ? (minesNewRecord ? `新纪录 ${minesElapsed}s` : `用时 ${minesElapsed}s`) : '触发地雷，再来一局' }}
                </p>
                <div class="mini-actions">
                  <button
                    type="button"
                    class="small-btn mini-btn mini-btn-primary"
                    @pointerdown.stop
                    @click.stop="restartGame"
                  >
                    再来一局
                  </button>
                  <button
                    type="button"
                    class="small-btn mini-btn"
                    @pointerdown.stop
                    @click.stop="handleGameOverBackToLibrary"
                  >
                    返回游戏库
                  </button>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="isInTetrisGame">
            <div class="tetris-stats">
              <div class="score-chip">
                <span class="chip-label">分数</span>
                <span class="chip-value">{{ tetrisScore }}</span>
              </div>
              <div class="score-chip">
                <span class="chip-label">最高</span>
                <span class="chip-value">{{ tetrisBestScore }}</span>
              </div>
              <div class="score-chip">
                <span class="chip-label">行数</span>
                <span class="chip-value">{{ tetrisLines }}</span>
              </div>
              <div class="score-chip">
                <span class="chip-label">等级</span>
                <span class="chip-value">{{ tetrisLevel }}</span>
              </div>
            </div>

            <div class="tetris-stage">
              <div class="tetris-board">
                <div
                  v-for="item in tetrisDisplayCells"
                  :key="item.key"
                  class="tetris-cell"
                  :class="`is-c${item.value || 0}`"
                ></div>
              </div>

              <div class="tetris-side">
                <p class="tetris-next-title">下一个</p>
                <div class="tetris-next">
                  <div
                    v-for="item in tetrisNextCells"
                    :key="item.key"
                    class="tetris-next-cell"
                    :class="`is-c${item.value || 0}`"
                  ></div>
                </div>
              </div>
            </div>

            <div class="tetris-controls">
              <button
                type="button"
                class="small-btn tetris-ctrl-btn tetris-ctrl-wide"
                @pointerdown.stop
                @click.stop="rotateTetrisPiece"
              >
                旋转
              </button>
              <button
                type="button"
                class="small-btn tetris-ctrl-btn tetris-ctrl-wide"
                @pointerdown.stop
                @click.stop="hardDropTetrisPiece"
              >
                速降
              </button>
              <button
                type="button"
                class="small-btn tetris-ctrl-btn"
                @pointerdown.stop
                @click.stop="moveTetrisPiece(0, -1)"
              >
                ←
              </button>
              <button
                type="button"
                class="small-btn tetris-ctrl-btn"
                @pointerdown.stop
                @click.stop="softDropTetrisPiece"
              >
                ↓
              </button>
              <button
                type="button"
                class="small-btn tetris-ctrl-btn"
                @pointerdown.stop
                @click.stop="moveTetrisPiece(0, 1)"
              >
                →
              </button>
            </div>

            <p v-if="tetrisOver" class="game-state state-over">方块堆满，游戏结束</p>
            <p v-else class="game-state state-hint">方向键/WASD控制，空格速降</p>

            <div v-if="showTetrisOverModal" class="mini-modal-mask">
              <div class="mini-modal" @pointerdown.stop>
                <p class="mini-title">游戏结束</p>
                <p class="mini-desc">分数 {{ tetrisScore }}，消除 {{ tetrisLines }} 行</p>
                <div class="mini-actions">
                  <button
                    type="button"
                    class="small-btn mini-btn mini-btn-primary"
                    @pointerdown.stop
                    @click.stop="restartGame"
                  >
                    再来一局
                  </button>
                  <button
                    type="button"
                    class="small-btn mini-btn"
                    @pointerdown.stop
                    @click.stop="handleGameOverBackToLibrary"
                  >
                    返回游戏库
                  </button>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="isInBrickGame">
            <div class="brick-stats">
              <div class="score-chip">
                <span class="chip-label">分数</span>
                <span class="chip-value">{{ brickScore }}</span>
              </div>
              <div class="score-chip">
                <span class="chip-label">最高</span>
                <span class="chip-value">{{ brickBestScore }}</span>
              </div>
              <div class="score-chip">
                <span class="chip-label">生命</span>
                <span class="chip-value">{{ brickLives }}</span>
              </div>
              <div class="score-chip">
                <span class="chip-label">关卡</span>
                <span class="chip-value">{{ brickStage }}</span>
              </div>
            </div>

            <div class="brick-source-row">
              <span class="brick-source-tag">{{ brickSourceLabel }}</span>
              <p v-if="brickLoadingLevel" class="brick-tip">第 {{ brickStage }} 关生成中...</p>
              <p v-else-if="brickConfigError" class="brick-tip is-warning">智能关卡失败，已切换本地关卡</p>
              <p v-else-if="brickLevelCleared" class="brick-tip is-clear">本关完成，点“下一关”继续</p>
              <p v-else-if="brickBall.stuck" class="brick-tip">拖动挡板，点击场地或发球按钮开始</p>
              <p v-else class="brick-tip">剩余砖块 {{ brickRemainingBricks }}</p>
            </div>

            <div class="brick-field-wrap">
              <div
                ref="brickFieldRef"
                class="brick-field"
                @pointerdown.stop="handleBrickFieldPointerDown"
                @pointermove.stop="handleBrickFieldPointerMove"
                @pointerup.stop="handleBrickFieldPointerUp"
                @pointercancel.stop="handleBrickFieldPointerCancel"
                @pointerleave.stop="handleBrickFieldPointerCancel"
              >
                <div
                  v-for="brick in brickBricks"
                  v-show="brick.hp > 0"
                  :key="brick.id"
                  class="brick-tile"
                  :class="getBrickClass(brick)"
                  :style="getBrickStyle(brick)"
                ></div>
                <div class="brick-paddle" :style="brickPaddleStyle"></div>
                <div class="brick-ball" :style="brickBallStyle"></div>
              </div>
            </div>

            <div class="brick-controls">
              <button
                type="button"
                class="small-btn brick-btn"
                @pointerdown.stop.prevent="startBrickDirectionControl(-1)"
                @pointerup.stop.prevent="stopBrickDirectionControl"
                @pointerleave.stop.prevent="stopBrickDirectionControl"
                @pointercancel.stop.prevent="stopBrickDirectionControl"
              >
                左移
              </button>
              <button
                type="button"
                class="small-btn brick-btn brick-btn-primary"
                @pointerdown.stop
                @click.stop="handleBrickPrimaryAction"
              >
                {{ brickLevelCleared ? '下一关' : '发球' }}
              </button>
              <button
                type="button"
                class="small-btn brick-btn"
                @pointerdown.stop.prevent="startBrickDirectionControl(1)"
                @pointerup.stop.prevent="stopBrickDirectionControl"
                @pointerleave.stop.prevent="stopBrickDirectionControl"
                @pointercancel.stop.prevent="stopBrickDirectionControl"
              >
                右移
              </button>
            </div>

            <p v-if="brickOver" class="game-state state-over">生命耗尽，最终分 {{ brickScore }}</p>
            <p v-else-if="brickLevelCleared" class="game-state state-win">第 {{ brickStage }} 关已清空</p>
            <p v-else class="game-state state-hint">键盘支持：← → 发球空格，R 重开</p>

            <div v-if="showBrickOverModal" class="mini-modal-mask">
              <div class="mini-modal" @pointerdown.stop>
                <p class="mini-title">挑战结束</p>
                <p class="mini-desc">分数 {{ brickScore }}，最高 {{ brickBestScore }}</p>
                <div class="mini-actions">
                  <button
                    type="button"
                    class="small-btn mini-btn mini-btn-primary"
                    @pointerdown.stop
                    @click.stop="restartGame"
                  >
                    再来一局
                  </button>
                  <button
                    type="button"
                    class="small-btn mini-btn"
                    @pointerdown.stop
                    @click.stop="handleGameOverBackToLibrary"
                  >
                    返回游戏库
                  </button>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="isInKlotskiGame">
            <div class="klotski-stats">
              <div class="score-chip">
                <span class="chip-label">步数</span>
                <span class="chip-value">{{ klotskiMoves }}</span>
              </div>
              <div class="score-chip">
                <span class="chip-label">最佳</span>
                <span class="chip-value">{{ klotskiBestSteps > 0 ? klotskiBestSteps : '--' }}</span>
              </div>
              <div class="score-chip">
                <span class="chip-label">难度</span>
                <span class="chip-value">{{ klotskiDifficultyLabel }}</span>
              </div>
              <button
                type="button"
                class="small-btn klotski-refresh-btn"
                @pointerdown.stop
                @click.stop="initializeKlotski({ regenerate: true })"
              >
                换一关
              </button>
            </div>

            <div class="klotski-board-wrap">
              <div class="klotski-board">
                <div v-for="cell in klotskiBoardCells" :key="cell.key" class="klotski-cell-bg"></div>
                <button
                  v-for="piece in klotskiPieces"
                  :key="piece.id"
                  type="button"
                  class="small-btn klotski-piece"
                  :class="[`kind-${piece.kind}`, { active: klotskiSelectedPieceId === piece.id }]"
                  :style="getKlotskiPieceStyle(piece)"
                  @pointerdown.stop
                  @click.stop="handleKlotskiPieceTap(piece.id)"
                >
                  {{ piece.label }}
                </button>
                <div class="klotski-exit">出口</div>
              </div>
            </div>

            <div class="klotski-controls">
              <button
                v-for="direction in KLOTSKI_DIRECTIONS"
                :key="direction.key"
                type="button"
                class="small-btn klotski-ctrl-btn"
                :disabled="!klotskiMoveMap[direction.key] || klotskiGenerating || klotskiSolved"
                @pointerdown.stop
                @click.stop="moveKlotskiPieceByDirection(direction.key)"
              >
                {{ direction.label }}
              </button>
            </div>

            <p v-if="klotskiGenerating" class="game-state state-hint">正在生成算法关卡...</p>
            <p v-else-if="klotskiSolved" class="game-state state-win">通关成功，用时 {{ klotskiMoves }} 步</p>
            <p v-else class="game-state state-hint">
              选中棋子：{{ klotskiSelectedPiece?.label || '--' }}，点击棋子或方向按钮移动
            </p>
            <p class="klotski-meta">
              扰动步数 {{ klotskiMeta.scrambleSteps }} | 探索状态 {{ klotskiMeta.uniqueStates }}
            </p>

            <div v-if="showKlotskiWinModal" class="mini-modal-mask">
              <div class="mini-modal is-win" @pointerdown.stop>
                <p class="mini-title">闯关成功</p>
                <p class="mini-desc">本关 {{ klotskiMoves }} 步，最佳 {{ klotskiBestSteps || klotskiMoves }} 步</p>
                <div class="mini-actions">
                  <button
                    type="button"
                    class="small-btn mini-btn mini-btn-primary"
                    @pointerdown.stop
                    @click.stop="initializeKlotski({ regenerate: true })"
                  >
                    下一关
                  </button>
                  <button
                    type="button"
                    class="small-btn mini-btn"
                    @pointerdown.stop
                    @click.stop="handleGameOverBackToLibrary"
                  >
                    返回游戏库
                  </button>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="isInDungeonGame">
            <div class="dungeon-stats">
              <div class="score-chip">
                <span class="chip-label">楼层</span>
                <span class="chip-value">F{{ dungeonState.floor }}</span>
              </div>
              <div class="score-chip">
                <span class="chip-label">等级</span>
                <span class="chip-value">Lv.{{ dungeonState.level }}</span>
              </div>
              <div class="score-chip">
                <span class="chip-label">战力</span>
                <span class="chip-value">{{ dungeonTotalPower }}</span>
              </div>
              <div class="score-chip">
                <span class="chip-label">星钻</span>
                <span class="chip-value">{{ dungeonState.gems }}</span>
              </div>
            </div>

            <div class="dungeon-scene-box">
              <p class="dungeon-scene-title">{{ dungeonState.lastScene || '地下城入口' }}</p>
              <div class="dungeon-hp-track">
                <span class="dungeon-hp-fill" :style="{ width: `${dungeonHpPercent}%` }"></span>
              </div>
              <p class="dungeon-hp-text">
                生命 {{ dungeonState.hp }}/{{ dungeonState.maxHp }} · EXP {{ dungeonState.exp }}/{{ dungeonLevelNeedExp }}
              </p>
            </div>

            <div class="dungeon-party-box">
              <div class="dungeon-box-head">
                <span>队伍（前排4人）</span>
                <span>金币 {{ dungeonState.coins }}</span>
              </div>
              <div class="dungeon-party-list">
                <div v-for="member in dungeonActiveParty" :key="member.id" class="dungeon-party-item">
                  <span class="dungeon-rarity-tag" :class="`is-${member.rarity.toLowerCase()}`">{{ member.rarity }}</span>
                  <span class="dungeon-member-name">{{ member.name }}</span>
                  <span class="dungeon-member-power">{{ member.power }}</span>
                </div>
              </div>
              <p v-if="dungeonState.lastBanter" class="dungeon-banter">{{ dungeonState.lastBanter }}</p>
            </div>

            <div class="dungeon-equip-box">
              <div class="dungeon-box-head">
                <span>当前装备</span>
                <span>保底 {{ dungeonState.equipmentPity }}/{{ DUNGEON_EQUIPMENT_PITY_LIMIT - 1 }}</span>
              </div>
              <div class="dungeon-equip-grid">
                <div class="dungeon-equip-item">
                  <span class="dungeon-equip-slot">武器</span>
                  <span class="dungeon-equip-name">{{ dungeonState.equipped.weapon?.name || '暂无' }}</span>
                </div>
                <div class="dungeon-equip-item">
                  <span class="dungeon-equip-slot">护甲</span>
                  <span class="dungeon-equip-name">{{ dungeonState.equipped.armor?.name || '暂无' }}</span>
                </div>
                <div class="dungeon-equip-item">
                  <span class="dungeon-equip-slot">饰品</span>
                  <span class="dungeon-equip-name">{{ dungeonState.equipped.relic?.name || '暂无' }}</span>
                </div>
              </div>
            </div>

            <div class="dungeon-actions">
              <button
                type="button"
                class="small-btn dungeon-action-btn is-main"
                :disabled="isDungeonExploring || isDungeonDrawing"
                @pointerdown.stop
                @click.stop="handleDungeonExplore"
              >
                {{ isDungeonExploring ? '探索中...' : '推进地下城' }}
              </button>
              <button
                type="button"
                class="small-btn dungeon-action-btn"
                :disabled="isDungeonGeneratingBanter || isDungeonExploring || isDungeonDrawing"
                @pointerdown.stop
                @click.stop="requestDungeonBanter"
              >
                {{ isDungeonGeneratingBanter ? '生成中...' : '队友吐槽' }}
              </button>
              <button
                type="button"
                class="small-btn dungeon-action-btn"
                :disabled="isDungeonExploring || isDungeonDrawing"
                @pointerdown.stop
                @click.stop="resetDungeonProgress"
              >
                重置冒险
              </button>
            </div>

            <div class="dungeon-gacha-grid">
              <div class="dungeon-gacha-card">
                <p class="dungeon-gacha-title">队友招募</p>
                <p class="dungeon-gacha-desc">SSR 保底 {{ dungeonState.teammatePity }}/{{ DUNGEON_TEAMMATE_PITY_LIMIT - 1 }}</p>
                <div class="dungeon-gacha-actions">
                  <button
                    type="button"
                    class="small-btn dungeon-gacha-btn"
                    :disabled="!dungeonCanDrawTeammateSingle"
                    @pointerdown.stop
                    @click.stop="executeDungeonTeammateGacha(1)"
                  >
                    单抽 {{ DUNGEON_TEAMMATE_SINGLE_COST }}
                  </button>
                  <button
                    type="button"
                    class="small-btn dungeon-gacha-btn"
                    :disabled="!dungeonCanDrawTeammateTen"
                    @pointerdown.stop
                    @click.stop="executeDungeonTeammateGacha(10)"
                  >
                    十连 {{ DUNGEON_TEAMMATE_SINGLE_COST * 10 }}
                  </button>
                </div>
              </div>

              <div class="dungeon-gacha-card">
                <p class="dungeon-gacha-title">装备抽取</p>
                <p class="dungeon-gacha-desc">SR+ 保底十连，SSR 长保底</p>
                <div class="dungeon-gacha-actions">
                  <button
                    type="button"
                    class="small-btn dungeon-gacha-btn"
                    :disabled="!dungeonCanDrawEquipmentSingle"
                    @pointerdown.stop
                    @click.stop="executeDungeonEquipmentGacha(1)"
                  >
                    单抽 {{ DUNGEON_EQUIPMENT_SINGLE_COST }}
                  </button>
                  <button
                    type="button"
                    class="small-btn dungeon-gacha-btn"
                    :disabled="!dungeonCanDrawEquipmentTen"
                    @pointerdown.stop
                    @click.stop="executeDungeonEquipmentGacha(10)"
                  >
                    十连 {{ DUNGEON_EQUIPMENT_SINGLE_COST * 10 }}
                  </button>
                </div>
              </div>
            </div>

            <div class="dungeon-log-box">
              <p class="dungeon-log-title">战报</p>
              <div class="dungeon-log-list">
                <p v-for="(line, index) in dungeonRecentLogs" :key="`${index}-${line}`" class="dungeon-log-line">
                  {{ line }}
                </p>
              </div>
            </div>

            <p v-if="dungeonError" class="dungeon-error-text">{{ dungeonError }}</p>
          </template>

          <template v-else-if="isInPetGame">
            <div v-if="!petState.adopted" class="pet-empty">
              <div class="pet-empty-icon">🥚</div>
              <p class="pet-empty-title">像素宠物领养中心</p>
              <p class="pet-empty-desc">通过 LLM 生成一只专属宠物，开始你的照料日常</p>
              <button
                type="button"
                class="small-btn pet-main-btn"
                :disabled="isAdoptingPet"
                @pointerdown.stop
                @click.stop="adoptPet"
              >
                {{ isAdoptingPet ? '领养中...' : '领养宠物' }}
              </button>
              <p v-if="petError" class="pet-error-text">{{ petError }}</p>
            </div>

            <template v-else>
              <div class="pet-header-row">
                <div class="pet-title-wrap">
                  <p class="pet-name">{{ petName }}</p>
                  <p class="pet-meta">{{ petProfile?.title || '口袋小伙伴' }} · {{ petMoodText }}</p>
                </div>
                <div class="pet-wallet">
                  <span class="pet-wallet-label">金币</span>
                  <span class="pet-wallet-value">{{ petCoins }}</span>
                </div>
              </div>

              <div class="pet-stage">
                <div class="pet-sprite-wrap">
                  <div class="pet-sprite" :class="[petColorThemeClass, petSpriteClass]">
                    <span
                      v-for="pixel in petPixelCells"
                      :key="pixel.key"
                      class="pet-pixel"
                      :class="`is-${pixel.type}`"
                      :style="{
                        gridColumn: pixel.x + 1,
                        gridRow: pixel.y + 1,
                      }"
                    ></span>
                  </div>
                </div>
                <p class="pet-dialogue">{{ isPetReplying ? '...' : (petState.dialogue || '...') }}</p>
              </div>

              <div class="pet-stats">
                <div v-for="item in petStatusCards" :key="item.key" class="pet-stat-card">
                  <div class="pet-stat-top">
                    <span>{{ item.label }}</span>
                    <span>{{ item.value }}</span>
                  </div>
                  <div class="pet-progress">
                    <span class="pet-progress-inner" :style="{ width: `${item.value}%` }"></span>
                  </div>
                </div>
              </div>

              <div class="pet-food-row">
                <span>库存食物：{{ petFoodCount }}</span>
                <span>单价：{{ PET_FOOD_PRICE }} 金币</span>
                <span>最爱：{{ petProfile?.favoriteFood || '宠物饼干' }}</span>
              </div>

              <div class="pet-actions">
                <button
                  type="button"
                  class="small-btn pet-action-btn is-feed"
                  :disabled="petFoodCount <= 0 || isPetReplying"
                  @pointerdown.stop
                  @click.stop="feedPet"
                >
                  喂食
                </button>
                <button
                  type="button"
                  class="small-btn pet-action-btn"
                  :disabled="!canBuyPetFood || isPetReplying"
                  @pointerdown.stop
                  @click.stop="buyPetFood"
                >
                  买食物
                </button>
                <button
                  type="button"
                  class="small-btn pet-action-btn"
                  :disabled="isPetReplying"
                  @pointerdown.stop
                  @click.stop="petCompanion"
                >
                  摸摸
                </button>
              </div>
              <p v-if="petError" class="pet-error-text">{{ petError }}</p>
            </template>
          </template>
        </template>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.handheld-plugin {
  position: fixed;
  z-index: 1002;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  user-select: none;
}

.handheld-plugin.dragging {
  cursor: grabbing;
}

.handheld-trigger {
  width: 58px;
  height: 58px;
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 50%;
  background: linear-gradient(160deg, rgba(31, 39, 60, 0.92), rgba(18, 24, 38, 0.95));
  color: #f4f8ff;
  box-shadow: 0 14px 24px rgba(4, 12, 24, 0.34);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}

.handheld-trigger:active {
  transform: scale(0.96);
}

.trigger-icon {
  font-size: 25px;
  line-height: 1;
}

.handheld-panel {
  position: relative;
  width: 322px;
  margin-top: 10px;
  border-radius: 16px;
  border: 1px solid rgba(123, 153, 210, 0.42);
  background: linear-gradient(180deg, rgba(16, 24, 40, 0.94), rgba(11, 18, 30, 0.96));
  box-shadow: 0 16px 30px rgba(0, 0, 0, 0.4);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.handheld-panel.is-mines-layout {
  width: min(350px, calc(100vw - 14px));
}

.handheld-panel.is-mines-dense-layout {
  width: min(366px, calc(100vw - 10px));
}

.handheld-panel.is-tetris-layout {
  width: min(366px, calc(100vw - 12px));
}

.handheld-panel.is-brick-layout {
  width: min(366px, calc(100vw - 10px));
}

.handheld-panel.is-klotski-layout {
  width: min(356px, calc(100vw - 10px));
}

.handheld-panel.is-pet-layout {
  width: min(346px, calc(100vw - 10px));
}

.handheld-panel.is-dungeon-layout {
  width: min(374px, calc(100vw - 8px));
}

.handheld-header {
  border-radius: 11px;
  border: 1px solid rgba(123, 153, 210, 0.28);
  background: rgba(23, 33, 52, 0.86);
  padding: 7px 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: grab;
  touch-action: none;
}

.title-group {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.title-main {
  margin: 0;
  color: #eef3ff;
  font-size: 14px;
  font-weight: 700;
}

.title-sub {
  margin: 0;
  color: #81cbff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.reset-btn {
  min-width: 0;
  min-height: 0;
  width: auto;
  height: 26px;
  border: 1px solid rgba(129, 203, 255, 0.45);
  border-radius: 999px;
  background: rgba(129, 203, 255, 0.14);
  color: #cbe9ff;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.back-btn {
  color: #b6d7f8;
  border-color: rgba(165, 206, 248, 0.46);
  background: rgba(165, 206, 248, 0.12);
}

.game-library {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.game-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.game-icon-btn {
  min-width: 0;
  min-height: 0;
  height: 92px;
  border: 1px solid rgba(129, 203, 255, 0.3);
  border-radius: 10px;
  background: rgba(24, 35, 55, 0.7);
  color: #d8ecff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 8px 6px;
  text-align: center;
}

.game-icon-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.game-icon-btn.is-disabled {
  opacity: 0.5;
}

.game-icon-emoji {
  font-size: 22px;
  line-height: 1;
}

.game-icon-name {
  font-size: 12px;
  font-weight: 700;
  line-height: 1.1;
}

.game-icon-sub {
  font-size: 10px;
  color: #8ea7cc;
  line-height: 1.2;
}

.library-hint {
  margin: 0;
  text-align: center;
  font-size: 11px;
  color: #93aace;
}

.score-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.score-chip {
  border-radius: 10px;
  border: 1px solid rgba(123, 153, 210, 0.26);
  background: rgba(26, 36, 56, 0.72);
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.chip-label {
  color: #9eb4d3;
  font-size: 10px;
  letter-spacing: 0.06em;
}

.chip-value {
  color: #f2f6ff;
  font-size: 15px;
  font-weight: 700;
}

.board {
  border-radius: 12px;
  border: 1px solid rgba(123, 153, 210, 0.22);
  background: rgba(34, 45, 68, 0.88);
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
  touch-action: none;
}

.tile {
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.tile.is-empty {
  background: rgba(124, 139, 171, 0.16);
}

.tile.tile-2 {
  background: #e3edf9;
  color: #2c3a53;
}

.tile.tile-4 {
  background: #d6e7fb;
  color: #273652;
}

.tile.tile-8 {
  background: #b2d6ff;
  color: #1d2f4d;
}

.tile.tile-16 {
  background: #8ec9ff;
  color: #173155;
}

.tile.tile-32 {
  background: #69bbff;
  color: #102a4e;
}

.tile.tile-64 {
  background: #4dacff;
  color: #0b2446;
}

.tile.tile-128 {
  background: #7cb8ff;
  color: #0f2440;
  font-size: 16px;
}

.tile.tile-256 {
  background: #67a8ff;
  color: #0f2140;
  font-size: 16px;
}

.tile.tile-512 {
  background: #4d95ff;
  color: #f5fbff;
  font-size: 16px;
}

.tile.tile-1024 {
  background: #3a7fff;
  color: #f7fbff;
  font-size: 14px;
}

.tile.tile-2048 {
  background: #ffcf5b;
  color: #3f2a00;
  font-size: 14px;
}

.tile.tile-big {
  background: linear-gradient(140deg, #ffd982, #ffb74a);
  color: #3c2500;
  font-size: 12px;
}

.controls {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.mines-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.mines-stats .score-chip {
  padding: 5px 6px;
}

.mines-stats .chip-value {
  font-size: 13px;
}

.mines-difficulty {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.mines-diff-btn {
  min-width: 0;
  min-height: 0;
  height: 26px;
  border-radius: 8px;
  border: 1px solid rgba(126, 175, 234, 0.34);
  background: rgba(126, 175, 234, 0.1);
  color: #bfdfff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.mines-diff-btn.active {
  border-color: rgba(155, 213, 255, 0.66);
  background: rgba(155, 213, 255, 0.22);
  color: #f0f9ff;
}

.mines-diff-btn:disabled {
  opacity: 0.6;
}

.mines-mode {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.mines-mode-btn {
  min-width: 0;
  min-height: 0;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(129, 203, 255, 0.38);
  background: rgba(129, 203, 255, 0.12);
  color: #cfe8ff;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}

.mines-mode-btn.active {
  border-color: rgba(142, 214, 255, 0.7);
  background: rgba(142, 214, 255, 0.24);
  color: #eff8ff;
}

.mines-board {
  border-radius: 12px;
  border: 1px solid rgba(123, 153, 210, 0.22);
  background: rgba(34, 45, 68, 0.88);
  padding: 6px;
  display: grid;
  gap: 4px;
  touch-action: manipulation;
}

.mines-board.is-compact {
  gap: 3px;
}

.mines-board.is-dense {
  gap: 2px;
}

.mines-cell {
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  aspect-ratio: 1 / 1;
  border-radius: 6px;
  border: 1px solid rgba(125, 152, 192, 0.42);
  background: rgba(84, 108, 142, 0.38);
  color: #e8f4ff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.mines-board.is-compact .mines-cell {
  font-size: 10px;
  border-radius: 5px;
}

.mines-board.is-dense .mines-cell {
  font-size: 8px;
  border-radius: 4px;
}

.mines-cell.is-hidden {
  background: linear-gradient(180deg, rgba(96, 124, 160, 0.55), rgba(71, 95, 129, 0.58));
  border-color: rgba(140, 170, 206, 0.42);
  color: transparent;
}

.mines-cell.is-flagged {
  background: linear-gradient(180deg, rgba(84, 116, 158, 0.56), rgba(63, 91, 131, 0.62));
  border-color: rgba(147, 201, 255, 0.58);
  color: #ffe186;
}

.mines-cell.is-clear {
  background: rgba(210, 225, 245, 0.8);
  border-color: rgba(170, 192, 220, 0.7);
  color: transparent;
}

.mines-cell.is-mine {
  background: rgba(255, 143, 143, 0.82);
  border-color: rgba(255, 194, 194, 0.72);
  color: #5a1010;
}

.mines-cell.is-num-1 {
  background: rgba(214, 232, 250, 0.86);
  color: #2d61bb;
}

.mines-cell.is-num-2 {
  background: rgba(214, 236, 222, 0.88);
  color: #2e9149;
}

.mines-cell.is-num-3 {
  background: rgba(248, 222, 222, 0.9);
  color: #cf3939;
}

.mines-cell.is-num-4 {
  background: rgba(221, 222, 250, 0.9);
  color: #4f4fd1;
}

.mines-cell.is-num-5 {
  background: rgba(243, 227, 211, 0.92);
  color: #b45d2a;
}

.mines-cell.is-num-6 {
  background: rgba(216, 240, 240, 0.9);
  color: #2e8a8a;
}

.mines-cell.is-num-7 {
  background: rgba(230, 232, 236, 0.9);
  color: #3b4a5d;
}

.mines-cell.is-num-8 {
  background: rgba(227, 227, 233, 0.9);
  color: #4a4a59;
}

.tetris-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.tetris-stats .score-chip {
  padding: 5px 6px;
}

.tetris-stats .chip-value {
  font-size: 13px;
}

.tetris-stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 74px;
  gap: 8px;
  align-items: start;
}

.tetris-board {
  border-radius: 12px;
  border: 1px solid rgba(123, 153, 210, 0.28);
  background: rgba(18, 27, 43, 0.92);
  padding: 5px;
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 2px;
}

.tetris-cell {
  aspect-ratio: 1 / 1;
  border-radius: 3px;
  border: 1px solid rgba(122, 152, 196, 0.2);
  background: rgba(86, 107, 141, 0.2);
}

.tetris-side {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tetris-next-title {
  margin: 0;
  color: #9eb6d8;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.05em;
}

.tetris-next {
  border-radius: 10px;
  border: 1px solid rgba(123, 153, 210, 0.24);
  background: rgba(24, 34, 54, 0.78);
  padding: 5px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 2px;
}

.tetris-next-cell {
  aspect-ratio: 1 / 1;
  border-radius: 2px;
  border: 1px solid rgba(122, 152, 196, 0.17);
  background: rgba(86, 107, 141, 0.18);
}

.tetris-cell.is-c0,
.tetris-next-cell.is-c0 {
  background: rgba(90, 108, 142, 0.16);
  border-color: rgba(130, 155, 194, 0.16);
}

.tetris-cell.is-c1,
.tetris-next-cell.is-c1 {
  background: #4dd7ff;
  border-color: #8cecff;
}

.tetris-cell.is-c2,
.tetris-next-cell.is-c2 {
  background: #ffd76e;
  border-color: #ffe5a4;
}

.tetris-cell.is-c3,
.tetris-next-cell.is-c3 {
  background: #c185ff;
  border-color: #d8b2ff;
}

.tetris-cell.is-c4,
.tetris-next-cell.is-c4 {
  background: #78e18d;
  border-color: #abefb8;
}

.tetris-cell.is-c5,
.tetris-next-cell.is-c5 {
  background: #ff7a7a;
  border-color: #ffb1b1;
}

.tetris-cell.is-c6,
.tetris-next-cell.is-c6 {
  background: #5d8fff;
  border-color: #9bbaff;
}

.tetris-cell.is-c7,
.tetris-next-cell.is-c7 {
  background: #ffad5c;
  border-color: #ffd0a2;
}

.tetris-controls {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}

.tetris-ctrl-btn {
  min-width: 0;
  min-height: 0;
  height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(130, 206, 255, 0.4);
  background: rgba(130, 206, 255, 0.15);
  color: #d9f0ff;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}

.tetris-ctrl-wide {
  font-size: 12px;
}

.brick-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.brick-stats .score-chip {
  padding: 5px 6px;
}

.brick-stats .chip-value {
  font-size: 13px;
}

.brick-source-row {
  min-height: 22px;
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.brick-source-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 20px;
  border-radius: 999px;
  border: 1px solid rgba(145, 216, 255, 0.45);
  background: rgba(145, 216, 255, 0.16);
  padding: 0 8px;
  color: #d7f0ff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.brick-tip {
  margin: 0;
  color: #a8c2e2;
  font-size: 11px;
  line-height: 1.35;
}

.brick-tip.is-warning {
  color: #ffbe9f;
}

.brick-tip.is-clear {
  color: #ffe59f;
}

.brick-field-wrap {
  border-radius: 12px;
  border: 1px solid rgba(123, 153, 210, 0.24);
  background: rgba(23, 34, 54, 0.62);
  padding: 6px;
}

.brick-field {
  position: relative;
  width: 100%;
  aspect-ratio: 320 / 220;
  border-radius: 10px;
  background:
    radial-gradient(circle at 50% 6%, rgba(180, 233, 255, 0.24), transparent 52%),
    linear-gradient(180deg, rgba(20, 34, 58, 0.92), rgba(10, 19, 33, 0.97));
  border: 1px solid rgba(120, 152, 198, 0.2);
  overflow: hidden;
  touch-action: none;
}

.brick-tile {
  position: absolute;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.32);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
}

.brick-tile.is-hp-3 {
  filter: saturate(1.15);
}

.brick-tile.is-hp-2 {
  filter: saturate(0.95) brightness(0.96);
}

.brick-tile.is-hp-1 {
  filter: saturate(0.78) brightness(0.9);
}

.brick-paddle {
  position: absolute;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(214, 240, 255, 0.97), rgba(157, 215, 255, 0.95));
  border: 1px solid rgba(194, 232, 255, 0.92);
  box-shadow:
    0 2px 6px rgba(88, 169, 230, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.brick-ball {
  position: absolute;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle at 35% 35%, #ffffff, #c8ecff 55%, #7cc8ff 100%);
  border: 1px solid rgba(217, 244, 255, 0.9);
  box-shadow:
    0 2px 8px rgba(110, 202, 255, 0.45),
    inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}

.brick-controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.brick-btn {
  min-width: 0;
  min-height: 0;
  height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(129, 203, 255, 0.42);
  background: rgba(129, 203, 255, 0.14);
  color: #d8efff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.brick-btn-primary {
  border-color: rgba(255, 219, 145, 0.5);
  background: rgba(255, 219, 145, 0.2);
  color: #fff2d0;
}

.klotski-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  align-items: stretch;
}

.klotski-stats .score-chip {
  padding: 5px 6px;
}

.klotski-stats .chip-value {
  font-size: 13px;
}

.klotski-refresh-btn {
  min-width: 0;
  min-height: 0;
  height: auto;
  border-radius: 8px;
  border: 1px solid rgba(143, 219, 255, 0.44);
  background: rgba(143, 219, 255, 0.16);
  color: #d8f3ff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.klotski-board-wrap {
  border-radius: 12px;
  border: 1px solid rgba(123, 153, 210, 0.24);
  background: rgba(23, 34, 54, 0.62);
  padding: 6px;
}

.klotski-board {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 5;
  border-radius: 10px;
  border: 1px solid rgba(120, 152, 198, 0.22);
  background:
    radial-gradient(circle at 50% 0%, rgba(185, 235, 255, 0.18), transparent 44%),
    linear-gradient(180deg, rgba(19, 33, 58, 0.93), rgba(10, 19, 33, 0.97));
  overflow: hidden;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: repeat(5, minmax(0, 1fr));
  gap: 0;
}

.klotski-cell-bg {
  border: 1px solid rgba(118, 149, 193, 0.12);
  background: rgba(73, 95, 132, 0.12);
}

.klotski-piece {
  position: absolute;
  min-width: 0;
  min-height: 0;
  border-radius: 9px;
  border: 1px solid rgba(212, 234, 255, 0.42);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.3),
    0 4px 10px rgba(7, 13, 22, 0.4);
  color: #eff9ff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1;
}

.klotski-piece.kind-cao {
  background: linear-gradient(180deg, rgba(255, 186, 148, 0.92), rgba(238, 126, 102, 0.96));
  border-color: rgba(255, 210, 181, 0.78);
  color: #fff2e8;
}

.klotski-piece.kind-general {
  background: linear-gradient(180deg, rgba(140, 205, 255, 0.88), rgba(79, 151, 224, 0.93));
  border-color: rgba(192, 228, 255, 0.72);
}

.klotski-piece.kind-soldier {
  background: linear-gradient(180deg, rgba(181, 208, 255, 0.86), rgba(118, 152, 222, 0.9));
  border-color: rgba(208, 226, 255, 0.7);
}

.klotski-piece.active {
  outline: 2px solid rgba(255, 235, 161, 0.82);
  outline-offset: -2px;
}

.klotski-piece:disabled {
  opacity: 0.65;
}

.klotski-exit {
  position: absolute;
  left: 25%;
  bottom: 0;
  width: 50%;
  height: 6px;
  border-radius: 999px 999px 0 0;
  background: linear-gradient(180deg, rgba(255, 216, 137, 0.75), rgba(255, 173, 93, 0.92));
  color: transparent;
}

.klotski-controls {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.klotski-ctrl-btn {
  min-width: 0;
  min-height: 0;
  height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(129, 203, 255, 0.42);
  background: rgba(129, 203, 255, 0.14);
  color: #dbf2ff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.klotski-ctrl-btn:disabled {
  opacity: 0.45;
}

.klotski-meta {
  margin: 0;
  color: #8ea7c9;
  font-size: 10px;
  text-align: center;
}

.dungeon-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.dungeon-stats .score-chip {
  padding: 5px 6px;
}

.dungeon-stats .chip-value {
  font-size: 13px;
}

.dungeon-scene-box {
  border-radius: 11px;
  border: 1px solid rgba(136, 178, 232, 0.24);
  background:
    radial-gradient(circle at 50% -28%, rgba(188, 231, 255, 0.22), transparent 62%),
    linear-gradient(180deg, rgba(24, 37, 60, 0.82), rgba(13, 22, 36, 0.9));
  padding: 8px 9px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dungeon-scene-title {
  margin: 0;
  color: #e6f1ff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
}

.dungeon-hp-track {
  position: relative;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(87, 114, 152, 0.4);
}

.dungeon-hp-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #82deff, #82ffbf);
}

.dungeon-hp-text {
  margin: 0;
  color: #a8c2e2;
  font-size: 10px;
  line-height: 1.3;
}

.dungeon-party-box,
.dungeon-equip-box,
.dungeon-log-box {
  border-radius: 10px;
  border: 1px solid rgba(131, 169, 223, 0.22);
  background: rgba(20, 31, 49, 0.66);
  padding: 7px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dungeon-box-head {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  color: #adc7e7;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.dungeon-party-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dungeon-party-item {
  min-height: 25px;
  border-radius: 7px;
  border: 1px solid rgba(130, 170, 223, 0.22);
  background: rgba(15, 25, 41, 0.68);
  padding: 4px 6px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 36px;
  align-items: center;
  gap: 6px;
}

.dungeon-rarity-tag {
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(135, 183, 240, 0.4);
  background: rgba(135, 183, 240, 0.14);
  color: #d9efff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.dungeon-rarity-tag.is-sr {
  border-color: rgba(168, 166, 255, 0.56);
  background: rgba(168, 166, 255, 0.2);
  color: #ecebff;
}

.dungeon-rarity-tag.is-ssr {
  border-color: rgba(255, 205, 136, 0.6);
  background: rgba(255, 205, 136, 0.2);
  color: #fff2d2;
}

.dungeon-member-name {
  min-width: 0;
  color: #e7f1ff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dungeon-member-power {
  color: #b5cef0;
  font-size: 11px;
  font-weight: 700;
  text-align: right;
}

.dungeon-banter {
  margin: 0;
  border-radius: 6px;
  border: 1px solid rgba(124, 164, 220, 0.2);
  background: rgba(13, 23, 38, 0.64);
  padding: 5px 6px;
  color: #d7eaff;
  font-size: 10px;
  line-height: 1.4;
}

.dungeon-equip-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
}

.dungeon-equip-item {
  min-height: 55px;
  border-radius: 7px;
  border: 1px solid rgba(130, 170, 223, 0.2);
  background: rgba(14, 24, 40, 0.7);
  padding: 5px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dungeon-equip-slot {
  color: #a8c2e2;
  font-size: 10px;
  line-height: 1;
}

.dungeon-equip-name {
  color: #ecf5ff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
  word-break: break-word;
}

.dungeon-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.dungeon-action-btn {
  min-width: 0;
  min-height: 0;
  height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(142, 206, 255, 0.4);
  background: rgba(120, 176, 235, 0.16);
  color: #dcedff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.dungeon-action-btn.is-main {
  border-color: rgba(255, 211, 137, 0.58);
  background: rgba(255, 200, 111, 0.2);
  color: #fff2d5;
}

.dungeon-action-btn:disabled {
  opacity: 0.48;
}

.dungeon-gacha-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.dungeon-gacha-card {
  border-radius: 9px;
  border: 1px solid rgba(133, 173, 227, 0.22);
  background: rgba(18, 30, 47, 0.68);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dungeon-gacha-title {
  margin: 0;
  color: #e4f0ff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.1;
}

.dungeon-gacha-desc {
  margin: 0;
  color: #95b0d2;
  font-size: 10px;
  line-height: 1.35;
}

.dungeon-gacha-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 5px;
}

.dungeon-gacha-btn {
  min-width: 0;
  min-height: 0;
  height: 28px;
  border-radius: 7px;
  border: 1px solid rgba(139, 205, 255, 0.42);
  background: rgba(128, 189, 247, 0.15);
  color: #dcf0ff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.dungeon-gacha-btn:disabled {
  opacity: 0.46;
}

.dungeon-log-title {
  margin: 0;
  color: #c0d7f4;
  font-size: 10px;
  line-height: 1;
}

.dungeon-log-list {
  max-height: 120px;
  overflow-y: auto;
  padding-right: 2px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dungeon-log-line {
  margin: 0;
  border-radius: 6px;
  border: 1px solid rgba(124, 164, 220, 0.14);
  background: rgba(12, 22, 36, 0.64);
  padding: 4px 5px;
  color: #d8eaff;
  font-size: 10px;
  line-height: 1.4;
}

.dungeon-error-text {
  margin: 0;
  color: #ffb2b2;
  font-size: 10px;
  line-height: 1.35;
  text-align: center;
}

.pet-empty {
  border-radius: 12px;
  border: 1px solid rgba(135, 178, 235, 0.26);
  background: linear-gradient(180deg, rgba(23, 35, 57, 0.74), rgba(14, 22, 37, 0.82));
  min-height: 242px;
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
}

.pet-empty-icon {
  font-size: 36px;
  line-height: 1;
}

.pet-empty-title {
  margin: 0;
  color: #e9f2ff;
  font-size: 15px;
  font-weight: 700;
}

.pet-empty-desc {
  margin: 0;
  color: #9eb4d3;
  font-size: 11px;
  line-height: 1.45;
}

.pet-main-btn {
  min-width: 0;
  min-height: 0;
  height: 32px;
  border-radius: 9px;
  border: 1px solid rgba(146, 219, 255, 0.55);
  background: rgba(120, 190, 255, 0.2);
  color: #e8f6ff;
  font-size: 13px;
  font-weight: 700;
}

.pet-main-btn:disabled {
  opacity: 0.55;
}

.pet-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pet-title-wrap {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pet-name {
  margin: 0;
  color: #edf5ff;
  font-size: 17px;
  font-weight: 800;
  line-height: 1.1;
}

.pet-meta {
  margin: 0;
  color: #9fb8da;
  font-size: 11px;
  line-height: 1.25;
}

.pet-wallet {
  flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid rgba(150, 196, 255, 0.4);
  background: rgba(109, 162, 235, 0.18);
  height: 28px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.pet-wallet-label {
  color: #bad2f0;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.pet-wallet-value {
  color: #ffdd83;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.pet-stage {
  border-radius: 12px;
  border: 1px solid rgba(124, 163, 219, 0.26);
  background:
    radial-gradient(circle at 50% -20%, rgba(166, 214, 255, 0.22), transparent 60%),
    linear-gradient(180deg, rgba(25, 38, 61, 0.68), rgba(14, 22, 36, 0.88));
  padding: 8px 9px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
}

.pet-sprite-wrap {
  width: 126px;
  height: 126px;
  border-radius: 12px;
  border: 1px solid rgba(142, 186, 247, 0.3);
  background:
    linear-gradient(90deg, rgba(122, 158, 208, 0.16) 1px, transparent 1px) 0 0 / 16px 16px,
    linear-gradient(180deg, rgba(122, 158, 208, 0.14) 1px, transparent 1px) 0 0 / 16px 16px,
    rgba(12, 22, 36, 0.66);
  display: flex;
  align-items: center;
  justify-content: center;
}

.pet-sprite {
  --pet-body: #89d7c1;
  --pet-body-shadow: #58ae95;
  --pet-eye: #1f2d3f;
  --pet-accent: #ffc894;
  position: relative;
  width: 96px;
  height: 96px;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(8, 1fr);
  image-rendering: pixelated;
  animation: pet-bob 1.5s ease-in-out infinite;
}

.pet-sprite.theme-mint {
  --pet-body: #86d9c4;
  --pet-body-shadow: #54a991;
  --pet-eye: #223044;
  --pet-accent: #ffd79f;
}

.pet-sprite.theme-peach {
  --pet-body: #f5b794;
  --pet-body-shadow: #d18a6b;
  --pet-eye: #3a2a24;
  --pet-accent: #ffd5d5;
}

.pet-sprite.theme-sky {
  --pet-body: #91c9ff;
  --pet-body-shadow: #5d90d1;
  --pet-eye: #1f3052;
  --pet-accent: #ffdfa6;
}

.pet-sprite.theme-violet {
  --pet-body: #b49cff;
  --pet-body-shadow: #7f6bc7;
  --pet-eye: #2d2253;
  --pet-accent: #ffd6ff;
}

.pet-sprite.theme-lime {
  --pet-body: #b8e284;
  --pet-body-shadow: #84b557;
  --pet-eye: #2f3a1e;
  --pet-accent: #ffe9a1;
}

.pet-sprite.is-low-energy {
  animation-duration: 2.2s;
  opacity: 0.92;
}

.pet-sprite.is-happy {
  filter: saturate(1.08);
}

.pet-pixel {
  width: 100%;
  height: 100%;
}

.pet-pixel.is-body {
  background: var(--pet-body);
  box-shadow: inset 0 -1px 0 0 var(--pet-body-shadow);
}

.pet-pixel.is-eye {
  background: var(--pet-eye);
}

.pet-pixel.is-accent {
  background: var(--pet-accent);
}

.pet-sprite.is-blink .pet-pixel.is-eye {
  background: var(--pet-body-shadow);
}

.pet-dialogue {
  margin: 0;
  min-height: 34px;
  width: 100%;
  border-radius: 8px;
  border: 1px solid rgba(131, 170, 224, 0.25);
  background: rgba(16, 27, 43, 0.62);
  padding: 6px 8px;
  color: #e4efff;
  font-size: 11px;
  line-height: 1.45;
  text-align: center;
}

.pet-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.pet-stat-card {
  border-radius: 8px;
  border: 1px solid rgba(124, 163, 219, 0.23);
  background: rgba(21, 32, 50, 0.64);
  padding: 6px 7px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.pet-stat-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #b8cce9;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.pet-progress {
  height: 6px;
  border-radius: 999px;
  background: rgba(95, 121, 163, 0.42);
  overflow: hidden;
}

.pet-progress-inner {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #76d8ff, #8fffba);
}

.pet-food-row {
  border-radius: 8px;
  border: 1px solid rgba(129, 169, 224, 0.2);
  background: rgba(18, 29, 46, 0.58);
  padding: 6px 8px;
  display: flex;
  justify-content: space-between;
  gap: 6px;
  color: #95afcf;
  font-size: 10px;
  line-height: 1.2;
}

.pet-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.pet-action-btn {
  min-width: 0;
  min-height: 0;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(144, 206, 255, 0.4);
  background: rgba(122, 177, 238, 0.16);
  color: #deefff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.pet-action-btn.is-feed {
  border-color: rgba(255, 209, 133, 0.48);
  background: rgba(255, 188, 92, 0.2);
  color: #fff1d4;
}

.pet-action-btn:disabled {
  opacity: 0.45;
}

.pet-error-text {
  margin: 0;
  color: #ffb7b7;
  font-size: 10px;
  line-height: 1.35;
  text-align: center;
}

@keyframes pet-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}

.ctrl-btn {
  min-width: 0;
  min-height: 0;
  height: 28px;
  border: 1px solid rgba(129, 203, 255, 0.4);
  border-radius: 8px;
  background: rgba(129, 203, 255, 0.15);
  color: #d6edff;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
}

.game-state {
  margin: 0;
  text-align: center;
  font-size: 11px;
  line-height: 1.35;
}

.state-over {
  color: #ff9c9c;
}

.state-win {
  color: #ffd982;
}

.state-hint {
  color: #93aace;
}

.mini-modal-mask {
  position: absolute;
  inset: 0;
  z-index: 8;
  background: rgba(5, 10, 18, 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
}

.mini-modal {
  width: min(92%, 250px);
  border-radius: 12px;
  border: 1px solid rgba(255, 170, 170, 0.56);
  background: linear-gradient(180deg, rgba(37, 18, 28, 0.96), rgba(25, 13, 21, 0.97));
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.45);
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: center;
}

.mini-modal.is-win {
  border-color: rgba(255, 226, 152, 0.64);
  background: linear-gradient(180deg, rgba(49, 39, 14, 0.96), rgba(30, 24, 10, 0.97));
}

.mini-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #ffd0d0;
}

.mini-desc {
  margin: 0;
  font-size: 12px;
  color: #f2d8d8;
}

.mini-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 7px;
}

.mini-btn {
  min-width: 0;
  min-height: 0;
  height: 30px;
  border: 1px solid rgba(255, 205, 205, 0.45);
  border-radius: 8px;
  background: rgba(255, 205, 205, 0.1);
  color: #ffe3e3;
  font-size: 12px;
  font-weight: 600;
}

.mini-btn-primary {
  border-color: rgba(255, 130, 130, 0.6);
  background: rgba(255, 130, 130, 0.2);
  color: #fff0f0;
}

.handheld-slide-enter-active,
.handheld-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.handheld-slide-enter-from,
.handheld-slide-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

@media (max-width: 768px) {
  .handheld-panel {
    width: min(302px, calc(100vw - 22px));
    padding: 9px;
    gap: 8px;
  }

  .handheld-panel.is-mines-layout {
    width: min(334px, calc(100vw - 10px));
  }

  .handheld-panel.is-mines-dense-layout {
    width: min(350px, calc(100vw - 8px));
  }

  .handheld-panel.is-tetris-layout {
    width: min(350px, calc(100vw - 10px));
  }

  .handheld-panel.is-brick-layout {
    width: min(350px, calc(100vw - 8px));
  }

  .handheld-panel.is-klotski-layout {
    width: min(344px, calc(100vw - 8px));
  }

  .handheld-panel.is-pet-layout {
    width: min(340px, calc(100vw - 8px));
  }

  .handheld-panel.is-dungeon-layout {
    width: min(362px, calc(100vw - 8px));
  }

  .title-main {
    font-size: 13px;
  }

  .game-icon-btn {
    height: 86px;
  }

  .tile {
    font-size: 16px;
  }
}

.handheld-plugin.is-android .handheld-panel {
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.36);
}

.handheld-plugin.is-android .handheld-panel.is-mines-layout {
  width: min(338px, calc(100vw - 10px));
}

.handheld-plugin.is-android .handheld-panel.is-mines-dense-layout {
  width: min(356px, calc(100vw - 8px));
}

.handheld-plugin.is-android .handheld-panel.is-tetris-layout {
  width: min(354px, calc(100vw - 8px));
}

.handheld-plugin.is-android .handheld-panel.is-brick-layout {
  width: min(356px, calc(100vw - 8px));
}

.handheld-plugin.is-android .handheld-panel.is-klotski-layout {
  width: min(346px, calc(100vw - 8px));
}

.handheld-plugin.is-android .handheld-panel.is-pet-layout {
  width: min(344px, calc(100vw - 8px));
}

.handheld-plugin.is-android .handheld-panel.is-dungeon-layout {
  width: min(364px, calc(100vw - 8px));
}

.handheld-plugin.is-android .handheld-header {
  padding: 6px 8px;
}

.handheld-plugin.is-android .game-icon-btn {
  height: 84px;
}

.handheld-plugin.is-android .ctrl-btn {
  height: 30px;
}

.handheld-plugin.is-android .mines-mode-btn {
  height: 30px;
}

.handheld-plugin.is-android .mines-diff-btn {
  height: 28px;
}

.handheld-plugin.is-android .mines-board {
  gap: 3px;
}

.handheld-plugin.is-android .mines-cell {
  border-radius: 5px;
  font-size: 10px;
}

.handheld-plugin.is-android .mines-board.is-dense .mines-cell {
  font-size: 8px;
}

.handheld-plugin.is-android .tetris-cell {
  border-radius: 2px;
}

.handheld-plugin.is-android .tetris-ctrl-btn {
  height: 32px;
}

.handheld-plugin.is-android .brick-stats .chip-value {
  font-size: 12px;
}

.handheld-plugin.is-android .brick-tip {
  font-size: 10px;
}

.handheld-plugin.is-android .brick-btn {
  height: 32px;
  font-size: 12px;
}

.handheld-plugin.is-android .klotski-stats .chip-value {
  font-size: 12px;
}

.handheld-plugin.is-android .klotski-piece {
  font-size: 12px;
}

.handheld-plugin.is-android .klotski-ctrl-btn {
  height: 32px;
}

.handheld-plugin.is-android .pet-main-btn,
.handheld-plugin.is-android .pet-action-btn {
  height: 30px;
  font-size: 11px;
}

.handheld-plugin.is-android .pet-sprite-wrap {
  width: 118px;
  height: 118px;
}

.handheld-plugin.is-android .pet-dialogue {
  font-size: 10px;
}

.handheld-plugin.is-android .dungeon-action-btn {
  height: 32px;
  font-size: 10px;
}

.handheld-plugin.is-android .dungeon-gacha-btn {
  height: 30px;
  font-size: 10px;
}

.handheld-plugin.is-android .dungeon-party-item {
  min-height: 27px;
}

.handheld-plugin.is-android .dungeon-log-list {
  max-height: 128px;
}

.handheld-plugin.is-android .tile {
  font-size: 15px;
}

.handheld-plugin.is-android .tile.tile-1024,
.handheld-plugin.is-android .tile.tile-2048 {
  font-size: 12px;
}
</style>
