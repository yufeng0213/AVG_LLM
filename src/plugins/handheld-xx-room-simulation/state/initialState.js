import {
  ROOM_DEFAULT_WIDTH,
  ROOM_DEFAULT_HEIGHT,
  NEED_MAX_VALUE,
  NEED_DEFAULT_CONFIG,
  SKILL_MAX_LEVEL,
  MAX_ROOM_FURNITURE_ITEMS,
  MAX_PAWN_COUNT,
  MAX_LOG_COUNT,
  MOOD_BASE_VALUE,
  MOOD_EFFECT_CONFIG,
} from '../config/constants.js'

// ========== 测试用的 Tile 像素图案 ==========

// 木地板图案 - 温暖的木质纹理
const FLOOR_WOOD_PIXELS = [
  '1111111111111111',
  '1212121212121212',
  '1111111111111111',
  '2121212121212121',
  '1111111111111111',
  '1212121212121212',
  '1111111111111111',
  '2121212121212121',
  '1111111111111111',
  '1212121212121212',
  '1111111111111111',
  '2121212121212121',
  '1111111111111111',
  '1212121212121212',
  '1111111111111111',
  '2121212121212121',
]

// 石地板图案 - 冷色调石材
const FLOOR_STONE_PIXELS = [
  '1122112211221122',
  '2211221122112211',
  '1122112211221122',
  '2211221122112211',
  '1133113311331133',
  '3311331133113311',
  '1122112211221122',
  '2211221122112211',
  '1122112211221122',
  '2211221122112211',
  '1133113311331133',
  '3311331133113311',
  '1122112211221122',
  '2211221122112211',
  '1122112211221122',
  '2211221122112211',
]

// 红砖地板图案 - 砖块效果
const FLOOR_BRICK_PIXELS = [
  '1111111111111111',
  '1111112222221111',
  '1111112222221111',
  '1111112222221111',
  '2222221111112222',
  '2222221111112222',
  '2222221111112222',
  '1111111111111111',
  '1111112222221111',
  '1111112222221111',
  '1111112222221111',
  '2222221111112222',
  '2222221111112222',
  '2222221111112222',
  '1111111111111111',
  '1111112222221111',
]

// 石墙图案 - 坚固的墙壁纹理
const WALL_STONE_PIXELS = [
  '2222222222222222',
  '2233223322332233',
  '2222222222222222',
  '3322332233223322',
  '2222222222222222',
  '2233223322332233',
  '2222222222222222',
  '3322332233223322',
  '2222222222222222',
  '2233223322332233',
  '2222222222222222',
  '3322332233223322',
  '2222222222222222',
  '2233223322332233',
  '2222222222222222',
  '3322332233223322',
]

// 木门图案 - 有把手和边框
const DOOR_WOOD_PIXELS = [
  '2222222222222222',
  '2222222222222222',
  '2111111111111112',
  '2111111111111112',
  '2111111111111112',
  '2111111111111112',
  '2111111133111112',
  '2111111133111112',
  '2111111111111112',
  '2111111111111112',
  '2111111111111112',
  '2111111111111112',
  '2111111111111112',
  '2222222222222222',
  '2222222222222222',
  '2222222222222222',
]

// 窗户图案 - 透明玻璃效果
const WINDOW_PIXELS = [
  '2222222222222222',
  '2333333333333332',
  '2333333333333332',
  '2333111111133332',
  '2333111111133332',
  '2333111111133332',
  '2333111111133332',
  '2333111111133332',
  '2333111111133332',
  '2333111111133332',
  '2333111111133332',
  '2333333333333332',
  '2333333333333332',
  '2222222222222222',
  '2222222222222222',
  '2222222222222222',
]

// ========== 测试用的 Tile 调色板 ==========

// 木地板调色板 - 温暖棕色系
const FLOOR_WOOD_PALETTE = ['#00000000', '#6a4a2a', '#8a6a4a', '#aa8a6a']

// 石地板调色板 - 冷灰蓝色系
const FLOOR_STONE_PALETTE = ['#00000000', '#5a5a6a', '#7a7a8a', '#9a9aaa']

// 红砖调色板 - 红褐色系
const FLOOR_BRICK_PALETTE = ['#00000000', '#8a4a3a', '#6a3a2a', '#aa5a4a']

// 石墙调色板 - 深灰紫色系
const WALL_STONE_PALETTE = ['#00000000', '#3a3a4a', '#5a5a6a', '#4a4a5a']

// 木门调色板 - 棕色系
const DOOR_WOOD_PALETTE = ['#00000000', '#5a4a3a', '#7a6a5a', '#cacaca']

// 窗户调色板 - 蓝灰色系
const WINDOW_PALETTE = ['#00000000', '#4a5a6a', '#8a9aaa', '#b0c0d0']

// ========== 导出测试用的 Tile 数据 ==========

export const TEST_TILES = {
  // 像素图案
  pixels: {
    floorWood: FLOOR_WOOD_PIXELS,
    floorStone: FLOOR_STONE_PIXELS,
    floorBrick: FLOOR_BRICK_PIXELS,
    wallStone: WALL_STONE_PIXELS,
    doorWood: DOOR_WOOD_PIXELS,
    window: WINDOW_PIXELS,
  },
  // 调色板
  palettes: {
    floorWood: FLOOR_WOOD_PALETTE,
    floorStone: FLOOR_STONE_PALETTE,
    floorBrick: FLOOR_BRICK_PALETTE,
    wallStone: WALL_STONE_PALETTE,
    doorWood: DOOR_WOOD_PALETTE,
    window: WINDOW_PALETTE,
  },
  // 预设 Tile 配置
  presets: {
    floorWood: {
      type: 'floor',
      terrainId: 'floor-wood',
      terrainPalette: FLOOR_WOOD_PALETTE,
      terrainPixels16: FLOOR_WOOD_PIXELS,
      passable: true,
    },
    floorStone: {
      type: 'floor',
      terrainId: 'floor-stone',
      terrainPalette: FLOOR_STONE_PALETTE,
      terrainPixels16: FLOOR_STONE_PIXELS,
      passable: true,
    },
    floorBrick: {
      type: 'floor',
      terrainId: 'floor-brick',
      terrainPalette: FLOOR_BRICK_PALETTE,
      terrainPixels16: FLOOR_BRICK_PIXELS,
      passable: true,
    },
    wallStone: {
      type: 'wall',
      terrainId: 'wall-stone',
      terrainPalette: WALL_STONE_PALETTE,
      terrainPixels16: WALL_STONE_PIXELS,
      passable: false,
    },
    doorWood: {
      type: 'door',
      terrainId: 'door-wood',
      terrainPalette: DOOR_WOOD_PALETTE,
      terrainPixels16: DOOR_WOOD_PIXELS,
      passable: true,
    },
    windowGlass: {
      type: 'window',
      terrainId: 'window-glass',
      terrainPalette: WINDOW_PALETTE,
      terrainPixels16: WINDOW_PIXELS,
      passable: false,
    },
  },
}

// 默认需求值
const buildDefaultNeeds = () => {
  const needs = {}
  for (const [key, config] of Object.entries(NEED_DEFAULT_CONFIG)) {
    needs[key] = {
      value: NEED_MAX_VALUE,
      decayRate: config.decayRate,
      threshold: config.threshold,
      critical: config.critical,
    }
  }
  return needs
}

// 默认技能值
const buildDefaultSkills = () => ({
  crafting: { level: 1, exp: 0, maxLevel: SKILL_MAX_LEVEL },
  cooking: { level: 1, exp: 0, maxLevel: SKILL_MAX_LEVEL },
  social: { level: 1, exp: 0, maxLevel: SKILL_MAX_LEVEL },
  cleaning: { level: 1, exp: 0, maxLevel: SKILL_MAX_LEVEL },
})

// 默认心情值
const buildDefaultMood = () => ({
  value: MOOD_BASE_VALUE,
  breakdown: { positive: 0, negative: 0, total: 0 },
  state: 'normal',
  effects: MOOD_EFFECT_CONFIG.normal,
})

// 默认小人生成 - 分散初始位置
export const createDefaultPawn = (index = 0, roleHint = '') => {
  const roles = ['工匠', '厨师', '学者', '护士', '农夫', '矿工', '商人', '艺术家']
  const styles = ['knight', 'mage', 'ranger', 'rogue', 'priest', 'alchemist', 'worker', 'cook']
  const palettes = ['ember', 'forest', 'sky', 'violet', 'sand', 'iron', 'copper', 'silver']
  const names = ['艾诺', '米拉', '托比', '莎米', '莱恩', '琳娜', '卡尔', '菲菲']

  const role = roleHint || roles[index % roles.length]
  const name = names[index % names.length]

  // 分散初始位置
  const positions = [
    { x: 4, y: 4 },
    { x: ROOM_DEFAULT_WIDTH - 6, y: ROOM_DEFAULT_HEIGHT - 6 },
    { x: ROOM_DEFAULT_WIDTH / 2, y: ROOM_DEFAULT_HEIGHT / 2 },
    { x: 4, y: ROOM_DEFAULT_HEIGHT - 4 },
    { x: ROOM_DEFAULT_WIDTH - 4, y: 4 },
    { x: ROOM_DEFAULT_WIDTH / 2 - 2, y: ROOM_DEFAULT_HEIGHT / 2 },
    { x: ROOM_DEFAULT_WIDTH / 2 + 2, y: ROOM_DEFAULT_HEIGHT / 2 },
    { x: ROOM_DEFAULT_WIDTH / 2, y: ROOM_DEFAULT_HEIGHT / 2 - 2 },
  ]
  const position = positions[index % positions.length]

  return {
    id: `pawn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    role,
    worldCharacterId: '',
    position,
    targetPosition: null,
    path: [],
    pathIndex: 0,
    moving: false,
    speed: 1.0,
    needs: buildDefaultNeeds(),
    skills: buildDefaultSkills(),
    mood: buildDefaultMood(),
    moodThoughts: [],
    currentActivity: 'idle',
    currentTask: null,
    targetFurniture: null,
    activityStartTime: 0,
    taskQueue: [],
    assignedWork: null,
    sprite: {
      style: styles[index % styles.length],
      palette: palettes[index % palettes.length],
      action: 'idle',
      facing: 'right',
    },
    lastDialogue: '',
    dialogueCooldown: 0,
    updatedAt: Date.now(),
  }
}

// 默认房间生成 - 包含测试 Tile 和家具
export const buildDefaultRoomState = () => {
  const tiles = []

  // 根据位置选择不同的地板类型
  for (let y = 0; y < ROOM_DEFAULT_HEIGHT; y++) {
    for (let x = 0; x < ROOM_DEFAULT_WIDTH; x++) {
      const isWall = x === 0 || x === ROOM_DEFAULT_WIDTH - 1 || y === 0 || y === ROOM_DEFAULT_HEIGHT - 1

      if (isWall) {
        // 墙壁 Tile
        tiles.push({
          id: `tile-${x}-${y}`,
          x,
          y,
          type: 'wall',
          terrainId: 'wall-stone',
          terrainPalette: WALL_STONE_PALETTE,
          terrainPixels16: WALL_STONE_PIXELS,
          passable: false,
          speedModifier: 1.0,
        })
      } else {
        // 根据区域选择不同地板
        // 左上区域：木地板，右上区域：石地板，下方：红砖
        let floorType = 'wood'
        if (x < ROOM_DEFAULT_WIDTH / 2 && y < ROOM_DEFAULT_HEIGHT / 2) {
          floorType = 'wood'
        } else if (x >= ROOM_DEFAULT_WIDTH / 2 && y < ROOM_DEFAULT_HEIGHT / 2) {
          floorType = 'stone'
        } else {
          floorType = 'brick'
        }

        const pixels = floorType === 'wood' ? FLOOR_WOOD_PIXELS
          : floorType === 'stone' ? FLOOR_STONE_PIXELS
          : FLOOR_BRICK_PIXELS
        const palette = floorType === 'wood' ? FLOOR_WOOD_PALETTE
          : floorType === 'stone' ? FLOOR_STONE_PALETTE
          : FLOOR_BRICK_PALETTE

        tiles.push({
          id: `tile-${x}-${y}`,
          x,
          y,
          type: 'floor',
          terrainId: `floor-${floorType}`,
          terrainPalette: palette,
          terrainPixels16: pixels,
          passable: true,
          speedModifier: 1.0,
        })
      }
    }
  }

  // 添加门（顶部中间）
  const doorX = Math.floor(ROOM_DEFAULT_WIDTH / 2)
  const doorIndex = tiles.findIndex(t => t.x === doorX && t.y === 0)
  if (doorIndex >= 0) {
    tiles[doorIndex] = {
      ...tiles[doorIndex],
      type: 'door',
      terrainId: 'door-wood',
      terrainPalette: DOOR_WOOD_PALETTE,
      terrainPixels16: DOOR_WOOD_PIXELS,
      passable: true,
    }
  }

  // 添加窗户（左右墙各一个）
  const windowLeftX = 0
  const windowLeftY = Math.floor(ROOM_DEFAULT_HEIGHT / 2)
  const windowLeftIndex = tiles.findIndex(t => t.x === windowLeftX && t.y === windowLeftY)
  if (windowLeftIndex >= 0) {
    tiles[windowLeftIndex] = {
      ...tiles[windowLeftIndex],
      type: 'window',
      terrainId: 'window-glass',
      terrainPalette: WINDOW_PALETTE,
      terrainPixels16: WINDOW_PIXELS,
      passable: false,
    }
  }

  const windowRightX = ROOM_DEFAULT_WIDTH - 1
  const windowRightY = Math.floor(ROOM_DEFAULT_HEIGHT / 2)
  const windowRightIndex = tiles.findIndex(t => t.x === windowRightX && t.y === windowRightY)
  if (windowRightIndex >= 0) {
    tiles[windowRightIndex] = {
      ...tiles[windowRightIndex],
      type: 'window',
      terrainId: 'window-glass',
      terrainPalette: WINDOW_PALETTE,
      terrainPixels16: WINDOW_PIXELS,
      passable: false,
    }
  }

  // ========== 测试家具 ==========

  // 床（左下角）
  const testBed = {
    id: 'furn-bed-test',
    name: '舒适床铺',
    kind: 'sleep',
    width: 2,
    height: 1,
    x: 2,
    y: ROOM_DEFAULT_HEIGHT - 3,
    z: 10,
    walkable: false,
    interactable: true,
    interactionType: 'sleep',
    needsSatisfied: { rest: 0.8, comfort: 0.3 },
    spriteSpec: { motif: 'bed', palette: 'oak', silhouette: 'compact', ornament: 'cushion', glow: 0, seed: 100 },
  }

  // 工作台（右上角）
  const testDesk = {
    id: 'furn-desk-test',
    name: '工匠工作台',
    kind: 'work',
    width: 2,
    height: 1,
    x: ROOM_DEFAULT_WIDTH - 5,
    y: 2,
    z: 12,
    walkable: false,
    interactable: true,
    interactionType: 'work',
    workType: 'crafting',
    workDuration: 120,
    needsSatisfied: { work_satisfaction: 0.3 },
    spriteSpec: { motif: 'desk', palette: 'walnut', silhouette: 'compact', ornament: 'rune', glow: 0, seed: 300 },
  }

  // 炉灶（右下角）
  const testStove = {
    id: 'furn-stove-test',
    name: '烹饪炉灶',
    kind: 'food',
    width: 2,
    height: 1,
    x: ROOM_DEFAULT_WIDTH - 5,
    y: ROOM_DEFAULT_HEIGHT - 3,
    z: 14,
    walkable: false,
    interactable: true,
    interactionType: 'work',
    workType: 'cooking',
    workDuration: 180,
    needsSatisfied: { work_satisfaction: 0.25 },
    spriteSpec: { motif: 'stove', palette: 'iron', silhouette: 'compact', ornament: 'rune', glow: 1, seed: 400 },
  }

  // 餐桌（中央）
  const testTable = {
    id: 'furn-table-test',
    name: '用餐桌',
    kind: 'social',
    width: 2,
    height: 2,
    x: Math.floor(ROOM_DEFAULT_WIDTH / 2) - 1,
    y: Math.floor(ROOM_DEFAULT_HEIGHT / 2),
    z: 15,
    walkable: false,
    interactable: true,
    interactionType: 'eat',
    needsSatisfied: { hunger: 0.3, social: 0.2 },
    spriteSpec: { motif: 'table', palette: 'pine', silhouette: 'wide', ornament: 'border', glow: 0, seed: 500 },
  }

  // 盆栽（左上角）
  const testPlant = {
    id: 'furn-plant-test',
    name: '绿色盆栽',
    kind: 'decor',
    width: 1,
    height: 1,
    x: 2,
    y: 2,
    z: 5,
    walkable: true,
    interactable: false,
    interactionType: 'none',
    needsSatisfied: { comfort: 0.1, joy: 0.05 },
    spriteSpec: { motif: 'plant', palette: 'mint', silhouette: 'compact', ornament: 'leaf', glow: 0, seed: 900 },
  }

  // 落地灯（右侧）
  const testLamp = {
    id: 'furn-lamp-test',
    name: '暖光落地灯',
    kind: 'decor',
    width: 1,
    height: 1,
    x: ROOM_DEFAULT_WIDTH - 3,
    y: Math.floor(ROOM_DEFAULT_HEIGHT / 2),
    z: 6,
    walkable: true,
    interactable: false,
    interactionType: 'none',
    needsSatisfied: { comfort: 0.08 },
    spriteSpec: { motif: 'lamp', palette: 'iron', silhouette: 'tall', ornament: 'rune', glow: 1, seed: 1000 },
  }

  const furniture = []  // 默认不添加任何家具

  return {
    id: `room-${Date.now().toString(36)}`,
    width: ROOM_DEFAULT_WIDTH,
    height: ROOM_DEFAULT_HEIGHT,
    tiles,
    furniture,
    doors: [{ x: doorX, y: 0 }],
    regions: [],
    temperature: 20,
    lightLevel: 1.0,
    updatedAt: Date.now(),
  }
}

// 默认时间状态
export const buildDefaultTimeState = () => ({
  tick: 0,
  dayCount: 1,
  hourOfDay: 6,
  timeSpeed: 1.0,
  isPaused: true,
  dayPhase: 'morning',
  lightModifier: 1.0,
})

// 默认物品状态
export const buildDefaultItemsState = () => ({
  foods: [],
  materials: [],
  products: [],
})

// 默认统计状态
export const buildDefaultStatsState = () => ({
  totalWorkCompleted: 0,
  totalFoodConsumed: 0,
  totalSocialInteractions: 0,
})

// 创建新房间（用于多房间系统）
export const createDefaultRoom = (index = 0, type = 'common', ownerId = null) => {
  const roomNames = {
    common: ['公共区域', '大厅', '活动室'],
    bedroom: ['寝室', '卧室', '房间'],
    storage: ['仓库', '储藏室', '杂物间'],
  }

  const names = roomNames[type] || roomNames.common
  const name = names[index % names.length] + (index >= names.length ? ` ${index + 1}` : '')

  const width = type === 'bedroom' ? 16 : ROOM_DEFAULT_WIDTH
  const height = type === 'bedroom' ? 12 : ROOM_DEFAULT_HEIGHT

  const tiles = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isWall = x === 0 || x === width - 1 || y === 0 || y === height - 1

      if (isWall) {
        tiles.push({
          id: `tile-${x}-${y}`,
          x,
          y,
          type: 'wall',
          terrainId: 'wall-stone',
          terrainPalette: WALL_STONE_PALETTE,
          terrainPixels16: WALL_STONE_PIXELS,
          passable: false,
          speedModifier: 1.0,
        })
      } else {
        tiles.push({
          id: `tile-${x}-${y}`,
          x,
          y,
          type: 'floor',
          terrainId: 'floor-wood',
          terrainPalette: FLOOR_WOOD_PALETTE,
          terrainPixels16: FLOOR_WOOD_PIXELS,
          passable: true,
          speedModifier: 1.0,
        })
      }
    }
  }

  // 添加门
  const doorX = Math.floor(width / 2)
  const doorIndex = tiles.findIndex(t => t.x === doorX && t.y === 0)
  if (doorIndex >= 0) {
    tiles[doorIndex] = {
      ...tiles[doorIndex],
      type: 'door',
      terrainId: 'door-wood',
      terrainPalette: DOOR_WOOD_PALETTE,
      terrainPixels16: DOOR_WOOD_PIXELS,
      passable: true,
    }
  }

  return {
    id: `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    type,
    ownerId,
    backgroundImage: null,
    width,
    height,
    tiles,
    furniture: [],
    doors: [{ x: doorX, y: 0 }],
    regions: [],
    temperature: 20,
    lightLevel: 1.0,
    updatedAt: Date.now(),
  }
}

// 主状态构建 - 多房间系统（空房间，无默认小人）
export const buildDefaultState = () => {
  // 创建公共区域（空房间）
  const commonRoom = buildDefaultRoomState()
  commonRoom.id = 'room-common'
  commonRoom.name = '公共区域'
  commonRoom.type = 'common'

  return {
    time: buildDefaultTimeState(),
    rooms: [commonRoom],
    room: null, // 保留兼容旧版本
    pawns: [], // 无默认小人
    tasks: [],
    items: buildDefaultItemsState(),
    stats: buildDefaultStatsState(),
    worldBookId: '',
    worldBookCharacterSignature: '',
    selectedPawnId: '',
    selectedFurnitureId: '',
    currentView: 'room',
    logs: ['房间模拟系统已启动。'],
    updatedAt: Date.now(),
  }
}

// 为特定角色创建默认状态（每个角色有自己的房间）
export const buildDefaultStateForCharacter = (characterInfo) => {
  const name = characterInfo?.name || '角色'
  const charId = characterInfo?.id || '__player__'

  // 创建角色的房间（空房间，无预设家具）
  const room = buildDefaultRoomState()
  room.id = `room-${charId}`
  room.name = name
  room.furniture = [] // 无预设家具
  room.tiles = room.tiles.map(t => ({ ...t, type: 'floor' })) // 全地板，无墙

  // 创建代表该角色的小人
  const pawn = createDefaultPawn(0, name)
  pawn.id = `pawn-${charId}`
  pawn.name = name
  pawn.worldCharacterId = charId
  pawn.position = { x: Math.floor(ROOM_DEFAULT_WIDTH / 2), y: Math.floor(ROOM_DEFAULT_HEIGHT / 2) }
  pawn.customSprites = null // 需要玩家配置

  return {
    time: buildDefaultTimeState(),
    rooms: [room],
    room: null,
    pawns: [pawn],
    tasks: [],
    items: buildDefaultItemsState(),
    stats: buildDefaultStatsState(),
    worldBookId: '',
    worldBookCharacterSignature: charId,
    selectedPawnId: pawn.id,
    selectedFurnitureId: '',
    currentView: 'room',
    logs: [`${name}已创建，请配置精灵和家具。`],
    customFurnitureLibrary: [],
    updatedAt: Date.now(),
  }
}