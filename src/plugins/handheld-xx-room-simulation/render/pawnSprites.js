// 小人精灵渲染 - 部件化换装系统 + 4方向支持

import {
  SPRITE_PIXEL_SIZE,
  SPRITE_GRID_SIZE,
} from '../config/constants.js'

// ==================== 调色板 ====================

const PAWN_PIXEL_PALETTES = {
  ember: { robe: '#b35943', trim: '#ffd4a8', accent: '#ff9f5f', hair: '#5f3728' },
  forest: { robe: '#477e50', trim: '#c6f1bf', accent: '#84cf7f', hair: '#2f4d33' },
  sky: { robe: '#507ebf', trim: '#c9e5ff', accent: '#8dc9ff', hair: '#3e5982' },
  violet: { robe: '#7653ba', trim: '#dccbff', accent: '#b99dff', hair: '#4d3b74' },
  sand: { robe: '#9d7d55', trim: '#f5dfbf', accent: '#e5bc84', hair: '#6b5234' },
  iron: { robe: '#6b7688', trim: '#dce5f5', accent: '#9faec5', hair: '#424c62' },
  copper: { robe: '#b87333', trim: '#ffd9a0', accent: '#ffab5f', hair: '#5a3a28' },
  silver: { robe: '#9a9aa0', trim: '#dadae0', accent: '#babac0', hair: '#5a5a60' },
}

const PAWN_STYLE_LIST = ['knight', 'mage', 'ranger', 'rogue', 'priest', 'alchemist', 'worker', 'cook', 'scholar', 'nurse']
const PAWN_ACTION_LIST = ['idle', 'walk', 'work', 'sleep', 'eat', 'talk', 'read', 'carry']

// ==================== 部件定义 ====================
// 每个部件变体包含 4 个方向的像素数据
// facing: 'front' | 'back' | 'left' | 'right'
// 数据格式: Array<[x, y, token]>
// right 由 left 水平翻转自动派生，无需手动定义

// ---------- 发型 ----------

const OUTFIT_HAIR = {
  short: {
    label: '短发',
    front:  [[5,0,'h'],[6,0,'h'],[7,0,'h'],[8,0,'h'],[9,0,'h'],[10,0,'h'],[5,1,'h'],[10,1,'h']],
    back:   [[5,0,'h'],[6,0,'h'],[7,0,'h'],[8,0,'h'],[9,0,'h'],[10,0,'h'],[5,1,'h'],[5,2,'h'],[5,3,'h'],[10,1,'h'],[10,2,'h'],[10,3,'h']],
    left:   [[5,0,'h'],[6,0,'h'],[7,0,'h'],[8,0,'h'],[9,0,'h'],[10,0,'h'],[5,1,'h'],[5,2,'h'],[5,3,'h']],
  },
  long: {
    label: '长发',
    front:  [[5,0,'h'],[6,0,'h'],[7,0,'h'],[8,0,'h'],[9,0,'h'],[10,0,'h'],[5,1,'h'],[10,1,'h'],[4,2,'h'],[11,2,'h'],[4,3,'h'],[11,3,'h'],[4,4,'h'],[11,4,'h'],[4,5,'h'],[11,5,'h']],
    back:   [[5,0,'h'],[6,0,'h'],[7,0,'h'],[8,0,'h'],[9,0,'h'],[10,0,'h'],[5,1,'h'],[5,2,'h'],[5,3,'h'],[5,4,'h'],[5,5,'h'],[10,1,'h'],[10,2,'h'],[10,3,'h'],[10,4,'h'],[10,5,'h']],
    left:   [[5,0,'h'],[6,0,'h'],[7,0,'h'],[8,0,'h'],[9,0,'h'],[10,0,'h'],[5,1,'h'],[4,2,'h'],[4,3,'h'],[4,4,'h'],[4,5,'h']],
  },
  ponytail: {
    label: '马尾',
    front:  [[5,0,'h'],[6,0,'h'],[7,0,'h'],[8,0,'h'],[9,0,'h'],[10,0,'h'],[5,1,'h'],[10,1,'h']],
    back:   [[5,0,'h'],[6,0,'h'],[7,0,'h'],[8,0,'h'],[9,0,'h'],[10,0,'h'],[5,1,'h'],[5,2,'h'],[5,3,'h'],[5,4,'h'],[10,1,'h'],[10,2,'h'],[10,3,'h'],[10,4,'h'],[7,5,'h'],[8,5,'h'],[7,6,'h'],[8,6,'h']],
    left:   [[5,0,'h'],[6,0,'h'],[7,0,'h'],[8,0,'h'],[9,0,'h'],[10,0,'h'],[5,1,'h'],[5,2,'h'],[9,2,'h'],[9,3,'h']],
  },
  spiky: {
    label: '刺猬头',
    front:  [[5,0,'h'],[6,0,'h'],[7,0,'h'],[8,0,'h'],[9,0,'h'],[10,0,'h'],[4,1,'h'],[5,1,'h'],[10,1,'h'],[11,1,'h']],
    back:   [[5,0,'h'],[6,0,'h'],[7,0,'h'],[8,0,'h'],[9,0,'h'],[10,0,'h'],[4,1,'h'],[5,1,'h'],[5,2,'h'],[5,3,'h'],[10,1,'h'],[10,2,'h'],[10,3,'h'],[11,1,'h']],
    left:   [[5,0,'h'],[6,0,'h'],[7,0,'h'],[8,0,'h'],[9,0,'h'],[10,0,'h'],[4,1,'h'],[5,1,'h'],[5,2,'h'],[5,3,'h']],
  },
  bob: {
    label: '波波头',
    front:  [[5,0,'h'],[6,0,'h'],[7,0,'h'],[8,0,'h'],[9,0,'h'],[10,0,'h'],[4,1,'h'],[5,1,'h'],[10,1,'h'],[11,1,'h'],[4,2,'h'],[11,2,'h']],
    back:   [[5,0,'h'],[6,0,'h'],[7,0,'h'],[8,0,'h'],[9,0,'h'],[10,0,'h'],[4,1,'h'],[5,1,'h'],[5,2,'h'],[5,3,'h'],[5,4,'h'],[10,1,'h'],[10,2,'h'],[10,3,'h'],[10,4,'h'],[11,1,'h']],
    left:   [[5,0,'h'],[6,0,'h'],[7,0,'h'],[8,0,'h'],[9,0,'h'],[10,0,'h'],[4,1,'h'],[5,1,'h'],[4,2,'h'],[5,2,'h'],[4,3,'h'],[5,3,'h']],
  },
  bald: {
    label: '光头',
    front:  [],
    back:   [],
    left:   [],
  },
}

// ---------- 眼睛 ----------

const OUTFIT_EYES = {
  normal: {
    label: '普通',
    front: [[7,2,'e'],[8,2,'e']],
    back:  [],
    left:  [[7,2,'e']],
  },
  big: {
    label: '大眼',
    front: [[7,2,'e'],[8,2,'e'],[7,3,'e'],[8,3,'e']],
    back:  [],
    left:  [[7,2,'e'],[7,3,'e']],
  },
  sleepy: {
    label: '睡眼',
    front: [[7,3,'e'],[8,3,'e']],
    back:  [],
    left:  [[7,3,'e']],
  },
  happy: {
    label: '笑眼',
    front: [[7,3,'e'],[8,3,'e']],
    back:  [],
    left:  [[7,3,'e']],
  },
}

// ---------- 上衣 ----------

const OUTFIT_TOP = {
  robe: {
    label: '长袍',
    front: [[5,5,'r'],[6,5,'r'],[7,5,'r'],[8,5,'r'],[9,5,'r'],[10,5,'r'],[5,6,'r'],[6,6,'r'],[7,6,'r'],[8,6,'r'],[9,6,'r'],[10,6,'r'],[5,7,'r'],[6,7,'r'],[7,7,'r'],[8,7,'r'],[9,7,'r'],[10,7,'r'],[5,8,'r'],[6,8,'r'],[7,8,'r'],[8,8,'r'],[9,8,'r'],[10,8,'r'],[5,9,'r'],[6,9,'r'],[7,9,'r'],[8,9,'r'],[9,9,'r'],[10,9,'r'],[5,10,'r'],[6,10,'r'],[7,10,'r'],[8,10,'r'],[9,10,'r'],[10,10,'r']],
    back:  [[5,5,'r'],[6,5,'r'],[7,5,'r'],[8,5,'r'],[9,5,'r'],[10,5,'r'],[5,6,'r'],[6,6,'r'],[7,6,'r'],[8,6,'r'],[9,6,'r'],[10,6,'r'],[5,7,'r'],[6,7,'r'],[7,7,'r'],[8,7,'r'],[9,7,'r'],[10,7,'r'],[5,8,'r'],[6,8,'r'],[7,8,'r'],[8,8,'r'],[9,8,'r'],[10,8,'r'],[5,9,'r'],[6,9,'r'],[7,9,'r'],[8,9,'r'],[9,9,'r'],[10,9,'r'],[5,10,'r'],[6,10,'r'],[7,10,'r'],[8,10,'r'],[9,10,'r'],[10,10,'r']],
    left:  [[5,5,'r'],[6,5,'r'],[7,5,'r'],[8,5,'r'],[9,5,'r'],[10,5,'r'],[5,6,'r'],[6,6,'r'],[7,6,'r'],[8,6,'r'],[9,6,'r'],[10,6,'r'],[5,7,'r'],[6,7,'r'],[7,7,'r'],[8,7,'r'],[9,7,'r'],[10,7,'r'],[5,8,'r'],[6,8,'r'],[7,8,'r'],[8,8,'r'],[9,8,'r'],[10,8,'r'],[5,9,'r'],[6,9,'r'],[7,9,'r'],[8,9,'r'],[9,9,'r'],[10,9,'r'],[5,10,'r'],[6,10,'r'],[7,10,'r'],[8,10,'r'],[9,10,'r'],[10,10,'r']],
  },
  tunic: {
    label: '束腰衣',
    front: [[5,5,'r'],[6,5,'r'],[7,5,'r'],[8,5,'r'],[9,5,'r'],[10,5,'r'],[5,6,'r'],[6,6,'r'],[7,6,'r'],[8,6,'r'],[9,6,'r'],[10,6,'r'],[5,7,'r'],[6,7,'t'],[7,7,'r'],[8,7,'r'],[9,7,'t'],[10,7,'r'],[5,8,'r'],[6,8,'r'],[7,8,'r'],[8,8,'r'],[9,8,'r'],[10,8,'r'],[5,9,'r'],[6,9,'r'],[7,9,'r'],[8,9,'r'],[9,9,'r'],[10,9,'r'],[5,10,'r'],[6,10,'r'],[7,10,'r'],[8,10,'r'],[9,10,'r'],[10,10,'r']],
    back:  [[5,5,'r'],[6,5,'r'],[7,5,'r'],[8,5,'r'],[9,5,'r'],[10,5,'r'],[5,6,'r'],[6,6,'r'],[7,6,'r'],[8,6,'r'],[9,6,'r'],[10,6,'r'],[5,7,'r'],[6,7,'r'],[7,7,'r'],[8,7,'r'],[9,7,'r'],[10,7,'r'],[5,8,'r'],[6,8,'r'],[7,8,'r'],[8,8,'r'],[9,8,'r'],[10,8,'r'],[5,9,'r'],[6,9,'r'],[7,9,'r'],[8,9,'r'],[9,9,'r'],[10,9,'r'],[5,10,'r'],[6,10,'r'],[7,10,'r'],[8,10,'r'],[9,10,'r'],[10,10,'r']],
    left:  [[5,5,'r'],[6,5,'r'],[7,5,'r'],[8,5,'r'],[9,5,'r'],[10,5,'r'],[5,6,'r'],[6,6,'r'],[7,6,'r'],[8,6,'r'],[9,6,'r'],[10,6,'r'],[5,7,'r'],[6,7,'r'],[7,7,'r'],[8,7,'r'],[9,7,'t'],[10,7,'r'],[5,8,'r'],[6,8,'r'],[7,8,'r'],[8,8,'r'],[9,8,'r'],[10,8,'r'],[5,9,'r'],[6,9,'r'],[7,9,'r'],[8,9,'r'],[9,9,'r'],[10,9,'r'],[5,10,'r'],[6,10,'r'],[7,10,'r'],[8,10,'r'],[9,10,'r'],[10,10,'r']],
  },
  vest: {
    label: '背心',
    front: [[5,5,'r'],[6,5,'r'],[7,5,'r'],[8,5,'r'],[9,5,'r'],[10,5,'r'],[5,6,'r'],[6,6,'r'],[10,6,'r'],[5,7,'r'],[6,7,'r'],[10,7,'r'],[5,8,'r'],[6,8,'r'],[7,8,'r'],[8,8,'r'],[9,8,'r'],[10,8,'r'],[5,9,'r'],[6,9,'r'],[7,9,'r'],[8,9,'r'],[9,9,'r'],[10,9,'r'],[5,10,'r'],[6,10,'r'],[7,10,'r'],[8,10,'r'],[9,10,'r'],[10,10,'r']],
    back:  [[5,5,'r'],[6,5,'r'],[7,5,'r'],[8,5,'r'],[9,5,'r'],[10,5,'r'],[5,6,'r'],[6,6,'r'],[7,6,'r'],[8,6,'r'],[9,6,'r'],[10,6,'r'],[5,7,'r'],[6,7,'r'],[7,7,'r'],[8,7,'r'],[9,7,'r'],[10,7,'r'],[5,8,'r'],[6,8,'r'],[7,8,'r'],[8,8,'r'],[9,8,'r'],[10,8,'r'],[5,9,'r'],[6,9,'r'],[7,9,'r'],[8,9,'r'],[9,9,'r'],[10,9,'r'],[5,10,'r'],[6,10,'r'],[7,10,'r'],[8,10,'r'],[9,10,'r'],[10,10,'r']],
    left:  [[5,5,'r'],[6,5,'r'],[7,5,'r'],[8,5,'r'],[9,5,'r'],[10,5,'r'],[5,6,'r'],[6,6,'r'],[10,6,'r'],[5,7,'r'],[6,7,'r'],[10,7,'r'],[5,8,'r'],[6,8,'r'],[7,8,'r'],[8,8,'r'],[9,8,'r'],[10,8,'r'],[5,9,'r'],[6,9,'r'],[7,9,'r'],[8,9,'r'],[9,9,'r'],[10,9,'r'],[5,10,'r'],[6,10,'r'],[7,10,'r'],[8,10,'r'],[9,10,'r'],[10,10,'r']],
  },
}

// ---------- 下装 ----------

const OUTFIT_BOTTOM = {
  boots: {
    label: '长靴',
    front: [[6,11,'b'],[9,11,'b'],[6,12,'b'],[9,12,'b'],[6,13,'b'],[9,13,'b']],
    back:  [[6,11,'b'],[9,11,'b'],[6,12,'b'],[9,12,'b'],[6,13,'b'],[9,13,'b']],
    left:  [[6,11,'b'],[9,11,'b'],[6,12,'b'],[9,12,'b'],[6,13,'b'],[9,13,'b']],
  },
  pants: {
    label: '短裤',
    front: [[6,11,'b'],[9,11,'b']],
    back:  [[6,11,'b'],[9,11,'b']],
    left:  [[6,11,'b'],[9,11,'b']],
  },
  barefoot: {
    label: '赤脚',
    front: [[6,11,'s'],[9,11,'s']],
    back:  [[6,11,'s'],[9,11,'s']],
    left:  [[6,11,'s'],[9,11,'s']],
  },
}

// ---------- 配饰 ----------

const OUTFIT_ACCESSORY = {
  none: {
    label: '无',
    front: [],
    back: [],
    left: [],
  },
  helmet: {
    label: '头盔',
    front: [[5,0,'a'],[6,0,'a'],[7,0,'a'],[8,0,'a'],[9,0,'a'],[10,0,'a'],[7,6,'a'],[8,6,'a']],
    back:  [[5,0,'a'],[6,0,'a'],[7,0,'a'],[8,0,'a'],[9,0,'a'],[10,0,'a']],
    left:  [[5,0,'a'],[6,0,'a'],[7,0,'a'],[8,0,'a'],[9,0,'a'],[10,0,'a']],
  },
  pointed_hat: {
    label: '尖帽',
    front: [[7,0,'a'],[6,1,'a'],[7,1,'a'],[8,1,'a'],[5,2,'a'],[6,2,'a'],[7,2,'a'],[8,2,'a'],[9,2,'a'],[10,2,'a'],[8,7,'a'],[8,8,'a']],
    back:  [[7,0,'a'],[6,1,'a'],[7,1,'a'],[8,1,'a'],[5,2,'a'],[6,2,'a'],[7,2,'a'],[8,2,'a'],[9,2,'a'],[10,2,'a']],
    left:  [[7,0,'a'],[6,1,'a'],[7,1,'a'],[8,1,'a'],[9,1,'a'],[5,2,'a'],[6,2,'a'],[7,2,'a'],[8,2,'a'],[9,2,'a'],[10,2,'a']],
  },
  bow: {
    label: '弓箭',
    front: [[11,6,'a'],[11,7,'a'],[11,8,'a'],[11,9,'a']],
    back:  [[4,6,'a'],[4,7,'a'],[4,8,'a'],[4,9,'a']],
    left:  [[11,6,'a'],[11,7,'a'],[11,8,'a'],[11,9,'a']],
  },
  staff: {
    label: '法杖',
    front: [[11,5,'a'],[11,6,'a'],[11,7,'a'],[11,8,'a'],[11,9,'a'],[11,10,'a']],
    back:  [[4,5,'a'],[4,6,'a'],[4,7,'a'],[4,8,'a'],[4,9,'a'],[4,10,'a']],
    left:  [[11,5,'a'],[11,6,'a'],[11,7,'a'],[11,8,'a'],[11,9,'a'],[11,10,'a']],
  },
  belt: {
    label: '腰带',
    front: [[5,6,'a'],[6,6,'a'],[7,6,'a'],[8,6,'a'],[9,6,'a'],[10,6,'a']],
    back:  [[5,6,'a'],[6,6,'a'],[7,6,'a'],[8,6,'a'],[9,6,'a'],[10,6,'a']],
    left:  [[5,6,'a'],[6,6,'a'],[7,6,'a'],[8,6,'a'],[9,6,'a'],[10,6,'a']],
  },
  cross: {
    label: '十字架',
    front: [[7,6,'a'],[8,6,'a'],[7,7,'a'],[8,7,'a'],[7,8,'a'],[8,8,'a']],
    back:  [],
    left:  [[9,7,'a'],[9,8,'a']],
  },
  flask: {
    label: '烧瓶',
    front: [[10,7,'a'],[10,8,'a'],[11,7,'a'],[11,8,'a'],[10,9,'a']],
    back:  [[5,7,'a'],[5,8,'a']],
    left:  [[10,7,'a'],[10,8,'a'],[11,7,'a'],[11,8,'a']],
  },
  book: {
    label: '书本',
    front: [[4,7,'a'],[4,8,'a'],[5,7,'a'],[5,8,'a']],
    back:  [],
    left:  [[4,7,'a'],[4,8,'a']],
  },
  chef_hat: {
    label: '厨师帽',
    front: [[4,0,'a'],[5,0,'a'],[6,0,'a'],[7,0,'a'],[8,0,'a'],[9,0,'a'],[10,0,'a'],[11,0,'a'],[7,6,'a'],[8,6,'a']],
    back:  [[4,0,'a'],[5,0,'a'],[6,0,'a'],[7,0,'a'],[8,0,'a'],[9,0,'a'],[10,0,'a'],[11,0,'a']],
    left:  [[4,0,'a'],[5,0,'a'],[6,0,'a'],[7,0,'a'],[8,0,'a'],[9,0,'a'],[10,0,'a'],[11,0,'a']],
  },
}

// ==================== 工具函数 ====================

const createSpriteGrid = (size = SPRITE_GRID_SIZE, fillToken = '.') => {
  return Array.from({ length: size }, () => Array(size).fill(fillToken))
}

const paintRect = (grid, x, y, w, h, token) => {
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const gx = x + xx
      const gy = y + yy
      if (gx >= 0 && gx < SPRITE_GRID_SIZE && gy >= 0 && gy < SPRITE_GRID_SIZE) {
        grid[gy][gx] = token
      }
    }
  }
}

const paintPoints = (grid, points, token) => {
  for (const [x, y] of points) {
    if (x >= 0 && x < SPRITE_GRID_SIZE && y >= 0 && y < SPRITE_GRID_SIZE) {
      grid[y][x] = token
    }
  }
}

// 水平翻转网格（用于 right facing）
const mirrorGridHorizontal = (src, dst) => {
  for (let y = 0; y < SPRITE_GRID_SIZE; y++) {
    for (let x = 0; x < SPRITE_GRID_SIZE; x++) {
      dst[y][SPRITE_GRID_SIZE - 1 - x] = src[y][x]
    }
  }
}

// ==================== 身体基础绘制 ====================

// 头部（皮肤）— 发型会覆盖头顶部分
const applyHead = (grid) => {
  paintRect(grid, 6, 1, 4, 4, 's')
}

// 身体皮肤（颈部）
const applyNeck = (grid) => {
  paintRect(grid, 7, 5, 2, 1, 's')
}

// 动作姿势（手臂、腿部动画）
const applyPawnPose = (grid, action, frame) => {
  const variant = frame % 2
  const legOffset = variant === 0 ? 0 : 1

  switch (action) {
    case 'walk':
      paintRect(grid, 4 + legOffset, 11, 2, 3, 'b')
      paintRect(grid, 10 - legOffset, 11, 2, 3, 'b')
      paintRect(grid, 5, 7, 1, 3, 't')
      paintRect(grid, 10, 7, 1, 3, 't')
      break
    case 'work':
      paintRect(grid, 4, 5, 2, 4, 't')
      paintRect(grid, 10, 5, 2, 4, 't')
      paintRect(grid, 6 + legOffset, 11, 1, 3, 'b')
      paintRect(grid, 9 - legOffset, 11, 1, 3, 'b')
      break
    case 'sleep':
      paintRect(grid, 3, 8, 10, 4, 'r')
      paintRect(grid, 2, 8, 4, 4, 's')
      paintPoints(grid, [[3, 9], [4, 9]], 'e')
      break
    case 'eat':
      paintRect(grid, 4, 6, 1, 3, 't')
      paintRect(grid, 10, 7, 1, 3, 't')
      paintRect(grid, 9, 5, 2, 2, 'a')
      break
    case 'talk':
      paintRect(grid, 3, 5, 2, 3, 't')
      paintRect(grid, 11, 6, 1, 3, 't')
      break
    case 'read':
      paintRect(grid, 5, 6, 6, 3, 't')
      paintRect(grid, 6, 5, 4, 2, 'a')
      break
    case 'carry':
      paintRect(grid, 5, 4, 1, 5, 't')
      paintRect(grid, 10, 4, 1, 5, 't')
      paintRect(grid, 6, 3, 4, 3, 'a')
      break
    default:
      paintRect(grid, 4, 6, 1, 3, 't')
      paintRect(grid, 11, 6, 1, 3, 't')
      paintRect(grid, 6 + legOffset, 11, 1, 3, 'b')
      paintRect(grid, 8 - legOffset, 11, 1, 3, 'b')
  }
}

// 旧版职业样式（向后兼容）
const applyPawnStyleLegacy = (grid, style, frame) => {
  switch (style) {
    case 'knight':
      paintRect(grid, 5, 0, 6, 1, 'h')
      paintRect(grid, 5, 1, 1, 4, 'h')
      paintRect(grid, 10, 1, 1, 4, 'h')
      paintPoints(grid, [[7, 6], [8, 6]], 'a')
      break
    case 'mage':
      paintRect(grid, 7, 0, 2, 1, 'a')
      paintRect(grid, 6, 1, 4, 1, 'h')
      paintRect(grid, 5, 2, 6, 1, 'h')
      paintPoints(grid, [[8, 7], [8, 8]], 'a')
      break
    case 'ranger':
      paintRect(grid, 5, 1, 1, 4, 'h')
      paintRect(grid, 10, 1, 1, 4, 'h')
      paintRect(grid, 11, 8, 1, 4, 'a')
      break
    case 'rogue':
      paintRect(grid, 6, 2, 4, 1, 'h')
      paintRect(grid, 5, 6, 6, 1, 'a')
      if (frame % 2 === 1) paintPoints(grid, [[4, 9], [11, 9]], 'a')
      break
    case 'priest':
      paintRect(grid, 4, 6, 1, 5, 't')
      paintRect(grid, 11, 6, 1, 5, 't')
      paintRect(grid, 6, 0, 4, 1, 'a')
      paintPoints(grid, [[8, 8]], 'a')
      break
    case 'alchemist':
      paintRect(grid, 6, 1, 4, 1, 'a')
      paintRect(grid, 10, 8, 1, 2, 'a')
      paintPoints(grid, [[10, 7]], 't')
      break
    case 'worker':
      paintRect(grid, 5, 0, 6, 1, 'h')
      paintRect(grid, 6, 3, 4, 1, 'a')
      break
    case 'cook':
      paintRect(grid, 4, 0, 8, 1, 'h')
      paintRect(grid, 7, 6, 2, 2, 'a')
      break
    case 'scholar':
      paintRect(grid, 6, 0, 4, 2, 'h')
      paintRect(grid, 5, 2, 6, 1, 'a')
      break
    case 'nurse':
      paintRect(grid, 5, 0, 6, 1, 'h')
      paintRect(grid, 7, 6, 2, 3, 'a')
      paintRect(grid, 4, 7, 1, 4, 't')
      paintRect(grid, 11, 7, 1, 4, 't')
      break
  }
}

// ==================== 面向方向工具 ====================

const FACING_LIST = ['front', 'back', 'left', 'right']

const normalizeFacing = (facing) => {
  const map = { front: 'front', back: 'back', left: 'left', right: 'right', down: 'front', up: 'back' }
  return map[facing] || 'front'
}

// ==================== 核心渲染 ====================

// 使用部件化系统构建精灵网格
const buildOutfitGrid = (outfit, facing, action, frame) => {
  const grid = createSpriteGrid(SPRITE_GRID_SIZE)

  // 1. 绘制头部皮肤
  applyHead(grid)

  // 2. 绘制发型（覆盖头顶）
  const hairKey = outfit.hair || 'short'
  const hairDef = OUTFIT_HAIR[hairKey]
  if (hairDef) {
    let hairFacing = facing
    // right 使用 left 翻转
    if (hairFacing === 'right') hairFacing = 'left'
    const hairPoints = hairDef[hairFacing] || hairDef.front || []
    paintPoints(grid, hairPoints, 'h')
  }

  // 3. 绘制眼睛
  const eyesKey = outfit.eyes || 'normal'
  const eyesDef = OUTFIT_EYES[eyesKey]
  if (eyesDef) {
    let eyesFacing = facing
    if (eyesFacing === 'right') eyesFacing = 'left'
    const eyesPoints = eyesDef[eyesFacing] || eyesDef.front || []
    paintPoints(grid, eyesPoints, 'e')
  }

  // 4. 绘制颈部
  applyNeck(grid)

  // 5. 绘制上衣
  const topKey = outfit.top || 'robe'
  const topDef = OUTFIT_TOP[topKey]
  if (topDef) {
    let topFacing = facing
    if (topFacing === 'right') topFacing = 'left'
    const topPoints = topDef[topFacing] || topDef.front || []
    paintPoints(grid, topPoints, 'r')
  }

  // 6. 绘制下装
  const bottomKey = outfit.bottom || 'boots'
  const bottomDef = OUTFIT_BOTTOM[bottomKey]
  if (bottomDef) {
    let bottomFacing = facing
    if (bottomFacing === 'right') bottomFacing = 'left'
    const bottomPoints = bottomDef[bottomFacing] || bottomDef.front || []
    paintPoints(grid, bottomPoints, 'b')
  }

  // 7. 应用动作姿势（会覆盖手臂和腿部）
  applyPawnPose(grid, action, frame)

  // 8. 绘制配饰（最上层）
  const accKey = outfit.accessory || 'none'
  const accDef = OUTFIT_ACCESSORY[accKey]
  if (accDef) {
    let accFacing = facing
    if (accFacing === 'right') accFacing = 'left'
    const accPoints = accDef[accFacing] || accDef.front || []
    paintPoints(grid, accPoints, 'a')
  }

  // 9. right 方向水平翻转
  if (facing === 'right') {
    const tmp = createSpriteGrid(SPRITE_GRID_SIZE)
    mirrorGridHorizontal(grid, tmp)
    for (let y = 0; y < SPRITE_GRID_SIZE; y++) {
      for (let x = 0; x < SPRITE_GRID_SIZE; x++) {
        grid[y][x] = tmp[y][x]
      }
    }
  }

  return grid
}

// 使用旧版系统构建精灵网格（向后兼容）
const buildLegacyGrid = (style, palette, action, frame) => {
  const grid = createSpriteGrid(SPRITE_GRID_SIZE)
  applyHead(grid)
  paintPoints(grid, [[7, 2], [8, 2]], 'e')
  applyNeck(grid)
  paintRect(grid, 5, 5, 6, 6, 'r')
  paintRect(grid, 6, 11, 1, 3, 'b')
  paintRect(grid, 9, 11, 1, 3, 'b')
  applyPawnPose(grid, action, frame)
  applyPawnStyleLegacy(grid, style, frame)
  return grid
}

// 颜色解析
const resolvePawnPixelColor = (token, palette) => {
  const pal = PAWN_PIXEL_PALETTES[palette] || PAWN_PIXEL_PALETTES.ember
  switch (token) {
    case 's': return '#f0caa4'
    case 'e': return '#1c120d'
    case 'r': return pal.robe
    case 't': return pal.trim
    case 'a': return pal.accent
    case 'h': return pal.hair
    case 'b': return '#2b3145'
    default: return ''
  }
}

// 将网格转为 SVG data URI
const gridToSvgUri = (grid) => {
  const spriteSize = SPRITE_GRID_SIZE * SPRITE_PIXEL_SIZE
  let rects = ''
  for (let y = 0; y < SPRITE_GRID_SIZE; y++) {
    for (let x = 0; x < SPRITE_GRID_SIZE; x++) {
      const token = grid[y][x]
      if (token === '.') continue
      const color = resolvePawnPixelColor(token, 'ember')
      if (!color) continue
      rects += `<rect x="${x * SPRITE_PIXEL_SIZE}" y="${y * SPRITE_PIXEL_SIZE}" width="${SPRITE_PIXEL_SIZE}" height="${SPRITE_PIXEL_SIZE}" fill="${color}"/>`
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spriteSize}" height="${spriteSize}" viewBox="0 0 ${spriteSize} ${spriteSize}" shape-rendering="crispEdges">${rects}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// 带调色板的 SVG 生成
const buildPawnSpriteUri = (grid, palette) => {
  const spriteSize = SPRITE_GRID_SIZE * SPRITE_PIXEL_SIZE
  let rects = ''
  for (let y = 0; y < SPRITE_GRID_SIZE; y++) {
    for (let x = 0; x < SPRITE_GRID_SIZE; x++) {
      const token = grid[y][x]
      if (token === '.') continue
      const color = resolvePawnPixelColor(token, palette)
      if (!color) continue
      rects += `<rect x="${x * SPRITE_PIXEL_SIZE}" y="${y * SPRITE_PIXEL_SIZE}" width="${SPRITE_PIXEL_SIZE}" height="${SPRITE_PIXEL_SIZE}" fill="${color}"/>`
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spriteSize}" height="${spriteSize}" viewBox="0 0 ${spriteSize} ${spriteSize}" shape-rendering="crispEdges">${rects}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// ==================== 精灵解析器 ====================

export const createPawnSpriteResolver = (options = {}) => {
  const styleList = Array.isArray(options?.styleList) ? options.styleList : PAWN_STYLE_LIST
  const paletteList = Array.isArray(options?.paletteList) ? options.paletteList : Object.keys(PAWN_PIXEL_PALETTES)
  const actionList = Array.isArray(options?.actionList) ? options.actionList : PAWN_ACTION_LIST
  const getFrameTick = typeof options?.getFrameTick === 'function' ? options.getFrameTick : (() => 0)
  const cache = new Map()
  const maxCacheSize = options.maxCacheSize || 256

  // 公开部件定义供 UI 使用
  const getOutfitDefinitions = () => ({
    hair: OUTFIT_HAIR,
    eyes: OUTFIT_EYES,
    top: OUTFIT_TOP,
    bottom: OUTFIT_BOTTOM,
    accessory: OUTFIT_ACCESSORY,
  })

  const getPawnSpriteSrc = (pawn, index = 0) => {
    // 优先使用自定义精灵（导入的PNG）
    if (pawn?.customSprites) {
      const facing = normalizeFacing(pawn?.sprite?.facing || 'front')
      const directionMap = { front: 'front', back: 'back', left: 'left', right: 'right', down: 'front', up: 'back' }
      const direction = directionMap[facing] || 'front'
      return pawn.customSprites[direction] || pawn.customSprites.front || ''
    }

    const sprite = pawn?.sprite || {}
    const palette = paletteList.includes(sprite.palette) ? sprite.palette : paletteList[index % paletteList.length]
    const action = actionList.includes(sprite.action) ? sprite.action : 'idle'
    const frame = (Number(getFrameTick()) + index) % 2
    const facing = normalizeFacing(sprite.facing || 'front')
    const outfit = sprite.outfit || null

    let cacheKey
    let grid

    if (outfit) {
      // 部件化系统
      cacheKey = `o:${outfit.hair||''}:${outfit.eyes||''}:${outfit.top||''}:${outfit.bottom||''}:${outfit.accessory||''}|${palette}|${action}|${frame}|${facing}`
      if (cache.has(cacheKey)) return cache.get(cacheKey)
      grid = buildOutfitGrid(outfit, facing, action, frame)
    } else {
      // 旧版 style 系统（向后兼容）
      const style = styleList.includes(sprite.style) ? sprite.style : styleList[index % styleList.length]
      cacheKey = `l:${style}|${palette}|${action}|${frame}`
      if (cache.has(cacheKey)) return cache.get(cacheKey)
      grid = buildLegacyGrid(style, palette, action, frame)
    }

    const uri = buildPawnSpriteUri(grid, palette)
    if (cache.size < maxCacheSize) cache.set(cacheKey, uri)
    return uri
  }

  const getTeammateSpriteSrc = (member, index = 0) => {
    return getPawnSpriteSrc(member, index)
  }

  return {
    getPawnSpriteSrc,
    getTeammateSpriteSrc,
    getOutfitDefinitions,
    clearCache: () => cache.clear(),
  }
}

export default createPawnSpriteResolver
