// 光照系统常量定义

// 最大光源数量
export const MAX_LIGHT_SOURCES = 16

// 光照半径范围（格数）
export const LIGHT_RADIUS_MIN = 1
export const LIGHT_RADIUS_MAX = 5
export const LIGHT_RADIUS_DEFAULT = 3

// 光照强度范围
export const LIGHT_INTENSITY_MIN = 0.3
export const LIGHT_INTENSITY_MAX = 1.0
export const LIGHT_INTENSITY_DEFAULT = 0.8

// 预设光照颜色
export const LIGHT_COLOR_PRESETS = {
  warmYellow: { name: '暖黄', color: '#ffaa44', rgba: 'rgba(255, 170, 68, 0.1)' },
  warmWhite: { name: '暖白', color: '#ffe4c4', rgba: 'rgba(255, 228, 196, 0.1)' },
  coolWhite: { name: '冷白', color: '#e8f4ff', rgba: 'rgba(232, 244, 255, 0.1)' },
  softBlue: { name: '柔蓝', color: '#88ccff', rgba: 'rgba(136, 204, 255, 0.1)' },
  pink: { name: '粉色', color: '#ffaacc', rgba: 'rgba(255, 170, 204, 0.1)' },
  green: { name: '绿色', color: '#88ff88', rgba: 'rgba(136, 255, 136, 0.1)' },
}

// 默认光照颜色
export const LIGHT_COLOR_DEFAULT = 'warmYellow'

// 时间段对应的环境光强度
export const TIME_AMBIENT_LIGHT_MAP = {
  morning: 1.0,    // 早晨：全亮
  afternoon: 0.9,  // 下午：稍暗
  evening: 0.6,    // 傍晚：明显变暗
  night: 0.3,      // 夜晚：很暗
}

// 光照遮罩颜色（夜间叠加的暗色）
export const LIGHT_MASK_COLOR = 'rgba(10, 10, 30, 1)'
export const LIGHT_MASK_COLOR_DAY = 'rgba(0, 0, 0, 0)'

// 光照更新间隔（毫秒）
export const LIGHT_UPDATE_INTERVAL_MS = 500