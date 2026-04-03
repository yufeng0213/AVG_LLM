/**
 * 音乐播放器皮肤管理器
 * 支持通过JSON文件自定义播放器外观
 */

import defaultSkin from '../themes/music-player/default.json'
import neonCyberSkin from '../themes/music-player/neon-cyber.json'
import { kvStorage } from '../storage/index.js'

// 默认皮肤配置（当加载失败时使用）
const DEFAULT_SKIN = defaultSkin || {
  name: '默认皮肤',
  version: '1.0.0',
  colors: {
    primary: '#667eea',
    secondary: '#764ba2',
    background: 'rgba(30, 30, 40, 0.95)',
    backgroundHover: 'rgba(255, 255, 255, 0.1)',
    textPrimary: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.8)',
    textMuted: 'rgba(255, 255, 255, 0.5)',
    border: 'rgba(255, 255, 255, 0.1)',
    accent: '#667eea',
    progressBar: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
    shadow: 'rgba(0, 0, 0, 0.4)',
    glow: 'rgba(102, 126, 234, 0.4)'
  },
  toggleButton: {
    size: 48,
    borderRadius: 50,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    shadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
    shadowHover: '0 6px 20px rgba(102, 126, 234, 0.6)',
    iconColor: '#ffffff',
    iconSize: 24,
    scaleHover: 1.1
  },
  panel: {
    width: 320,
    borderRadius: 16,
    padding: 16,
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    shadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    maxHeight: 500
  },
  header: {
    fontSize: 14,
    fontWeight: 600,
    paddingBottom: 12,
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    iconSize: 18
  },
  controls: {
    buttonSize: 44,
    playButtonSize: 56,
    buttonBackground: 'rgba(255, 255, 255, 0.1)',
    buttonBackgroundHover: 'rgba(255, 255, 255, 0.2)',
    playButtonBackground: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    iconSize: 24,
    playIconSize: 28,
    borderRadius: 50
  },
  progressBar: {
    height: 4,
    background: 'rgba(255, 255, 255, 0.2)',
    fill: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
    borderRadius: 2
  },
  playlist: {
    itemPadding: '8px 10px',
    itemBorderRadius: 6,
    itemBackgroundHover: 'rgba(255, 255, 255, 0.1)',
    itemBackgroundActive: 'rgba(102, 126, 234, 0.3)',
    maxHeight: 200,
    scrollbarWidth: 4
  },
  settings: {
    panelBackground: 'rgba(0, 0, 0, 0.2)',
    panelBorderRadius: 8,
    panelPadding: 12,
    sliderHeight: 4,
    sliderThumbSize: 14
  },
  animation: {
    transitionDuration: '0.3s',
    hoverTransition: 'all 0.2s ease',
    panelSlide: 'panel-slide 0.3s ease',
    pulse: 'pulse 1s infinite'
  },
  customCSS: ''
}

// 内置皮肤列表
const BUILTIN_SKINS = [
  { id: 'default', name: '默认皮肤', path: 'default.json' },
  { id: 'neon-cyber', name: '霓虹赛博', path: 'neon-cyber.json' }
]

// 当前皮肤状态
let currentSkin = null
let currentSkinId = 'default'

/**
 * 获取皮肤列表
 * @returns {Array} 皮肤列表
 */
export const getSkinList = () => {
  return BUILTIN_SKINS
}

// 内置皮肤映射
const BUILTIN_SKIN_MAP = {
  'default': defaultSkin,
  'neon-cyber': neonCyberSkin
}

/**
 * 加载皮肤配置
 * @param {string} skinId - 皮肤ID或路径
 * @returns {Promise<Object>} 皮肤配置对象
 */
export const loadSkin = async (skinId) => {
  try {
    // 如果是内置皮肤ID
    if (BUILTIN_SKIN_MAP[skinId]) {
      currentSkin = BUILTIN_SKIN_MAP[skinId]
      currentSkinId = skinId
      return currentSkin
    }
    
    // 如果是外部JSON文件路径（Electron环境）
    if (window.avgLLM?.file?.readJson) {
      const result = await window.avgLLM.file.readJson(skinId)
      if (result) {
        currentSkin = result
        currentSkinId = skinId
        return currentSkin
      }
    }
    
    // 尝试通过fetch加载（Web环境）
    const response = await fetch(skinId)
    if (response.ok) {
      const skinData = await response.json()
      currentSkin = skinData
      currentSkinId = skinId
      return currentSkin
    }
    
    throw new Error('Failed to load skin')
  } catch (error) {
    console.warn('Failed to load skin:', error)
    // 返回默认皮肤
    currentSkin = DEFAULT_SKIN
    currentSkinId = 'default'
    return DEFAULT_SKIN
  }
}

/**
 * 获取当前皮肤
 * @returns {Object} 当前皮肤配置
 */
export const getCurrentSkin = () => {
  return currentSkin || DEFAULT_SKIN
}

/**
 * 获取当前皮肤ID
 * @returns {string} 当前皮肤ID
 */
export const getCurrentSkinId = () => {
  return currentSkinId
}

/**
 * 将皮肤配置转换为CSS样式对象
 * @param {Object} skin - 皮肤配置
 * @returns {Object} CSS样式对象
 */
export const skinToStyles = (skin) => {
  const s = skin || DEFAULT_SKIN
  
  return {
    // 播放器容器
    player: {
      '--mp-primary': s.colors.primary,
      '--mp-secondary': s.colors.secondary,
      '--mp-bg': s.colors.background,
      '--mp-text': s.colors.textPrimary,
      '--mp-text-secondary': s.colors.textSecondary,
      '--mp-text-muted': s.colors.textMuted,
      '--mp-border': s.colors.border,
      '--mp-accent': s.colors.accent,
      '--mp-shadow': s.colors.shadow,
      '--mp-glow': s.colors.glow,
      '--mp-progress': s.colors.progressBar,
      '--mp-transition': s.animation.transitionDuration
    },
    
    // 悬浮按钮
    toggleButton: {
      width: `${s.toggleButton.size}px`,
      height: `${s.toggleButton.size}px`,
      borderRadius: `${s.toggleButton.borderRadius}%`,
      background: s.toggleButton.background,
      boxShadow: s.toggleButton.shadow,
      color: s.toggleButton.iconColor
    },
    
    toggleButtonHover: {
      transform: `scale(${s.toggleButton.scaleHover})`,
      boxShadow: s.toggleButton.shadowHover
    },
    
    // 面板
    panel: {
      width: `${s.panel.width}px`,
      borderRadius: `${s.panel.borderRadius}px`,
      padding: `${s.panel.padding}px`,
      backdropFilter: s.panel.backdropFilter,
      border: s.panel.border,
      boxShadow: s.panel.shadow,
      background: s.colors.background,
      maxHeight: `${s.panel.maxHeight}px`
    },
    
    // 头部
    header: {
      fontSize: `${s.header.fontSize}px`,
      fontWeight: s.header.fontWeight,
      paddingBottom: `${s.header.paddingBottom}px`,
      borderBottom: s.header.borderBottom,
      color: s.colors.textPrimary
    },
    
    // 控制按钮
    controlButton: {
      width: `${s.controls.buttonSize}px`,
      height: `${s.controls.buttonSize}px`,
      borderRadius: `${s.controls.borderRadius}%`,
      background: s.controls.buttonBackground,
      color: s.colors.textSecondary
    },
    
    playButton: {
      width: `${s.controls.playButtonSize}px`,
      height: `${s.controls.playButtonSize}px`,
      borderRadius: `${s.controls.borderRadius}%`,
      background: s.controls.playButtonBackground,
      color: s.colors.textPrimary
    },
    
    // 进度条
    progressBar: {
      height: `${s.progressBar.height}px`,
      background: s.progressBar.background,
      borderRadius: `${s.progressBar.borderRadius}px`
    },
    
    progressFill: {
      height: '100%',
      background: s.progressBar.fill,
      borderRadius: `${s.progressBar.borderRadius}px`
    },
    
    // 播放列表
    playlistItem: {
      padding: s.playlist.itemPadding,
      borderRadius: `${s.playlist.itemBorderRadius}px`
    },
    
    playlistItemHover: {
      background: s.playlist.itemBackgroundHover
    },
    
    playlistItemActive: {
      background: s.playlist.itemBackgroundActive
    },
    
    // 设置面板
    settingsPanel: {
      background: s.settings.panelBackground,
      borderRadius: `${s.settings.panelBorderRadius}px`,
      padding: `${s.settings.panelPadding}px`
    }
  }
}

/**
 * 生成自定义CSS字符串
 * @param {Object} skin - 皮肤配置
 * @returns {string} CSS字符串
 */
export const generateCustomCSS = (skin) => {
  const s = skin || DEFAULT_SKIN
  let css = ''
  
  // 基础变量
  css += `
    .music-player {
      --mp-primary: ${s.colors.primary};
      --mp-secondary: ${s.colors.secondary};
      --mp-bg: ${s.colors.background};
      --mp-text: ${s.colors.textPrimary};
      --mp-text-secondary: ${s.colors.textSecondary};
      --mp-text-muted: ${s.colors.textMuted};
      --mp-border: ${s.colors.border};
      --mp-accent: ${s.colors.accent};
      --mp-shadow: ${s.colors.shadow};
      --mp-glow: ${s.colors.glow};
      --mp-progress: ${s.colors.progressBar};
      --mp-transition: ${s.animation.transitionDuration};
    }
  `
  
  // 添加皮肤自定义CSS
  if (s.customCSS) {
    css += s.customCSS
  }
  
  return css
}

/**
 * 保存皮肤设置
 * @param {string} skinId - 皮肤ID
 */
export const saveSkinSetting = async (skinId) => {
  await kvStorage.set('music-player-skin', skinId)
}

/**
 * 加载皮肤设置
 * @returns {Promise<string>} 皮肤ID
 */
export const loadSkinSetting = async () => {
  return (await kvStorage.get('music-player-skin')) || 'default'
}

/**
 * 初始化皮肤系统
 * @returns {Promise<Object>} 初始皮肤配置
 */
export const initSkinSystem = async () => {
  const savedSkinId = await loadSkinSetting()
  return await loadSkin(savedSkinId)
}

export { DEFAULT_SKIN }