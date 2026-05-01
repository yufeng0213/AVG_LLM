// 房间模拟系统常量定义

// 网格尺寸
export const ROOM_GRID_MIN_WIDTH = 16
export const ROOM_GRID_MAX_WIDTH = 32
export const ROOM_GRID_MIN_HEIGHT = 12
export const ROOM_GRID_MAX_HEIGHT = 24
export const ROOM_DEFAULT_WIDTH = 24
export const ROOM_DEFAULT_HEIGHT = 16

// 像素精灵尺寸
export const SPRITE_PIXEL_SIZE = 4  // 每个像素块渲染尺寸（64px格子 / 16格 = 4px）
export const SPRITE_GRID_SIZE = 16  // 精灵网格尺寸（16x16像素块）
export const ROOM_CELL_SIZE = 64  // 每个网格单元格的渲染尺寸（像素）
export const ROOM_TILE_SIZE = ROOM_CELL_SIZE // 同义词
export const PAWN_SPRITE_DISPLAY_SIZE = 96  // 小人精灵显示尺寸（像素），用于自定义导入的精灵

// Tile 类型常量
export const TILE_TYPE_FLOOR = 'floor'
export const TILE_TYPE_WALL = 'wall'
export const TILE_TYPE_DOOR = 'door'
export const TILE_TYPE_WINDOW = 'window'

// 家具类型常量
export const FURNITURE_KIND_FLOOR = 'floor'
export const FURNITURE_KIND_SLEEP = 'sleep'
export const FURNITURE_KIND_FOOD = 'food'
export const FURNITURE_KIND_WORK = 'work'
export const FURNITURE_KIND_SOCIAL = 'social'
export const FURNITURE_KIND_STORAGE = 'storage'
export const FURNITURE_KIND_DECOR = 'decor'
export const FURNITURE_KIND_UTIL = 'utility'

export const FURNITURE_KIND_LIST = ['floor', 'sleep', 'food', 'work', 'social', 'storage', 'decor', 'utility']

export const INTERACTION_TYPE_LIST = ['none', 'work', 'sleep', 'eat', 'storage', 'social']

// 交互类型
export const INTERACTION_TYPE_WORK = 'work'
export const INTERACTION_TYPE_SLEEP = 'sleep'
export const INTERACTION_TYPE_EAT = 'eat'
export const INTERACTION_TYPE_STORAGE = 'storage'
export const INTERACTION_TYPE_SOCIAL = 'social'

// 需求常量
export const NEED_MAX_VALUE = 100
export const NEED_MIN_VALUE = 0
export const NEED_DECAY_INTERVAL_MS = 3000

// 需求类型
export const NEED_TYPE_HUNGER = 'hunger'
export const NEED_TYPE_REST = 'rest'
export const NEED_TYPE_COMFORT = 'comfort'
export const NEED_TYPE_JOY = 'joy'
export const NEED_TYPE_SOCIAL = 'social'
export const NEED_TYPE_WORK_SATISFACTION = 'work_satisfaction'

// 需求默认配置
export const NEED_DEFAULT_CONFIG = {
  hunger: { decayRate: 0.02, threshold: 30, critical: 10, recoveryRate: 0.25 },
  rest: { decayRate: 0.015, threshold: 40, critical: 15, recoveryRate: 0.15 },
  comfort: { decayRate: 0.008, threshold: 50, critical: 20, recoveryRate: 0.02 },
  joy: { decayRate: 0.012, threshold: 35, critical: 10, recoveryRate: 0.1 },
  social: { decayRate: 0.01, threshold: 30, critical: 15, recoveryRate: 0.1 },
  work_satisfaction: { decayRate: 0.005, threshold: 20, critical: 5, recoveryRate: 0.05 },
}

// 技能常量
export const SKILL_MAX_LEVEL = 20
export const SKILL_TYPE_CRAFTING = 'crafting'
export const SKILL_TYPE_COOKING = 'cooking'
export const SKILL_TYPE_SOCIAL = 'social'
export const SKILL_TYPE_CLEANING = 'cleaning'

// 小人活动状态
export const PAWN_ACTIVITY_IDLE = 'idle'
export const PAWN_ACTIVITY_MOVING = 'moving'
export const PAWN_ACTIVITY_WORKING = 'working'
export const PAWN_ACTIVITY_SLEEPING = 'sleeping'
export const PAWN_ACTIVITY_EATING = 'eating'
export const PAWN_ACTIVITY_SOCIALIZING = 'socializing'

// 小人精灵动作（扩展 campfireSprites）
export const PAWN_SPRITE_ACTION_IDLE = 'idle'
export const PAWN_SPRITE_ACTION_WALK = 'walk'
export const PAWN_SPRITE_ACTION_WORK = 'work'
export const PAWN_SPRITE_ACTION_SLEEP = 'sleep'
export const PAWN_SPRITE_ACTION_EAT = 'eat'
export const PAWN_SPRITE_ACTION_TALK = 'talk'

// 时间系统
export const TIME_TICK_INTERVAL_MS = 100
export const TIME_HOURS_PER_DAY = 24
export const TIME_DAY_START_HOUR = 6
export const TIME_NIGHT_START_HOUR = 18
export const TICKS_PER_HOUR = 60

// 数量限制
export const MAX_ROOM_FURNITURE_ITEMS = 256
export const MAX_PAWN_COUNT = 8
export const MAX_LOG_COUNT = 200
export const MAX_PATH_LENGTH = 128

// 存储键
export const STORAGE_KEY_BASE = 'handheld-xx-room-simulation-state'

// ========== 心情系统常量 ==========

// 心情值范围
export const MOOD_BASE_VALUE = 50
export const MOOD_MIN_VALUE = 0
export const MOOD_MAX_VALUE = 100

// 心情效果阈值
export const MOOD_THRESHOLD_VERY_HAPPY = 80   // 效率+20%, 社交+30%
export const MOOD_THRESHOLD_HAPPY = 60        // 效率+10%
export const MOOD_THRESHOLD_NORMAL = 40       // 无影响
export const MOOD_THRESHOLD_UNHAPPY = 20      // 效率-15%, 社交-20%
export const MOOD_THRESHOLD_BREAKDOWN = 0     // 效率-30%, 可能崩溃

// 心情条目类型
export const MOOD_THOUGHT_TYPE_ENVIRONMENT = 'environment'  // 环境
export const MOOD_THOUGHT_TYPE_NEED = 'need'                // 需求
export const MOOD_THOUGHT_TYPE_SOCIAL = 'social'            // 社交
export const MOOD_THOUGHT_TYPE_WORK = 'work'                // 工作
export const MOOD_THOUGHT_TYPE_EVENT = 'event'              // 事件

// 心情条目衰减间隔（毫秒）
export const MOOD_DECAY_INTERVAL_MS = 5000

// 需求→心情映射表
export const NEED_MOOD_MAPPING = {
  hunger: [
    { max: 20, label: '极度饥饿', modifier: -20 },
    { max: 40, label: '非常饥饿', modifier: -12 },
    { max: 60, label: '有点饿', modifier: -5 },
    { max: 80, label: '正常', modifier: 0 },
    { max: 100, label: '饱足', modifier: +5 },
  ],
  rest: [
    { max: 20, label: '极度疲劳', modifier: -18 },
    { max: 40, label: '很累', modifier: -10 },
    { max: 60, label: '有点累', modifier: -4 },
    { max: 80, label: '正常', modifier: 0 },
    { max: 100, label: '精力充沛', modifier: +8 },
  ],
  comfort: [
    { max: 30, label: '非常不适', modifier: -12 },
    { max: 50, label: '有点不适', modifier: -5 },
    { max: 70, label: '正常', modifier: 0 },
    { max: 100, label: '舒适', modifier: +6 },
  ],
  joy: [
    { max: 20, label: '非常无聊', modifier: -10 },
    { max: 40, label: '有点无聊', modifier: -4 },
    { max: 60, label: '正常', modifier: 0 },
    { max: 100, label: '快乐', modifier: +5 },
  ],
  social: [
    { max: 20, label: '极度孤独', modifier: -15 },
    { max: 40, label: '有点孤独', modifier: -8 },
    { max: 60, label: '正常', modifier: 0 },
    { max: 100, label: '社交满足', modifier: +6 },
  ],
  work_satisfaction: [
    { max: 20, label: '工作沮丧', modifier: -8 },
    { max: 50, label: '正常', modifier: 0 },
    { max: 100, label: '工作满足', modifier: +5 },
  ],
}

// 环境→心情映射
export const ENVIRONMENT_MOOD_FACTORS = {
  crowding: { threshold: 0.7, label: '拥挤环境', modifier: -10 },     // 小人密度>0.7
  beautiful: { threshold: 0.6, label: '美观房间', modifier: +8 },     // 装饰类家具占比>0.6
  dirty: { threshold: 0.3, label: '肮脏环境', modifier: -5 },         // 以后扩展
  dark: { threshold: 0.5, label: '光线不足', modifier: -3 },          // 光照<0.5
  comfortable: { threshold: 0.8, label: '舒适房间', modifier: +10 },  // 综合舒适度>0.8
}

// 事件类心情条目模板
export const EVENT_MOOD_TEMPLATES = {
  work_complete: { label: '完成工作', modifier: +6, duration: 300 },
  work_fail: { label: '工作失败', modifier: -8, duration: 400 },
  social_chat: { label: '愉快的聊天', modifier: +5, duration: 200 },
  social_insult: { label: '被冒犯了', modifier: -10, duration: 500 },
  social_praise: { label: '被表扬了', modifier: +8, duration: 300 },
  new_pawn: { label: '有人入住', modifier: +4, duration: 600 },
  pawn_leave: { label: '有人离开', modifier: -6, duration: 500 },
  good_sleep: { label: '睡得很好', modifier: +10, duration: 400 },
  bad_sleep: { label: '睡得很差', modifier: -8, duration: 300 },
  ate_good: { label: '美味的食物', modifier: +6, duration: 200 },
  ate_bad: { label: '糟糕的食物', modifier: -4, duration: 200 },
}

// 心情效果配置
export const MOOD_EFFECT_CONFIG = {
  veryHappy: { efficiencyMod: 1.2, socialMod: 1.3 },
  happy: { efficiencyMod: 1.1, socialMod: 1.1 },
  normal: { efficiencyMod: 1.0, socialMod: 1.0 },
  unhappy: { efficiencyMod: 0.85, socialMod: 0.8 },
  breakdown: { efficiencyMod: 0.7, socialMod: 0.5 },
}