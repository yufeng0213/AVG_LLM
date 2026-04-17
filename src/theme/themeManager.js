import dopamineMax from '../themes/presets/dopamine-max.json'
import clayHiFi from '../themes/presets/clay-hifi.json'
import linearModern from '../themes/presets/linear-modern.json'
import iosGlass from '../themes/presets/ios-glass.json'
import { kvStorage } from '../storage/index.js'

const ACTIVE_THEME_KEY = 'active_theme'
const CUSTOM_THEMES_KEY = 'custom_themes'
const EXTERNAL_THEMES_KEY = 'external_themes'
const DEFAULT_STYLE_PROFILE = 'dopamine-max'

const presetThemes = [dopamineMax, clayHiFi, linearModern, iosGlass]
const fallbackTheme = presetThemes[0]

const tokenToCssVar = {
  background: '--background',
  foreground: '--foreground',
  muted: '--muted',
  accentMagenta: '--accent-magenta',
  accentCyan: '--accent-cyan',
  accentYellow: '--accent-yellow',
  accentOrange: '--accent-orange',
  accentPurple: '--accent-purple',
  fontHeading: '--font-heading',
  fontBody: '--font-body',
  fontDisplay: '--font-display',
  fontMono: '--font-mono',
  radiusButton: '--radius-button',
  radiusCard: '--radius-card',
  radiusPanel: '--radius-panel',
  textShadowSingle: '--text-shadow-single',
  textShadowDouble: '--text-shadow-double',
  textShadowTriple: '--text-shadow-triple',
  surfacePanel: '--surface-panel',
  surfaceField: '--surface-field',
  surfaceControl: '--surface-control',
  surfaceStatus: '--surface-status',
  borderPanel: '--border-panel',
  borderField: '--border-field',
  borderControl: '--border-control',
  borderStatus: '--border-status',
  borderAction: '--border-action',
  gradientPrimary: '--gradient-primary',
  gradientSecondary: '--gradient-secondary',
  shadowScreen: '--shadow-screen',
  shadowPanel: '--shadow-panel',
  shadowCard: '--shadow-card',
  shadowField: '--shadow-field',
  shadowButton: '--shadow-button',
  shadowButtonDisabled: '--shadow-button-disabled',
  shadowStatus: '--shadow-status',
  shadowPressed: '--shadow-pressed',
  blobPrimary: '--blob-primary',
  blobSecondary: '--blob-secondary',
  blobTertiary: '--blob-tertiary',
  backdropBlur: '--backdrop-blur',
}

// 组件级 CSS 变量映射（用于 StartScreen.css 等组件的变量化样式）
const componentVarToCssVar = {
  launchScreenBorder: '--launch-screen-border',
  launchScreenRadius: '--launch-screen-radius',
  launchScreenBg: '--launch-screen-bg',
  launchScreenBackdrop: '--launch-screen-backdrop',
  launchScreenTransform: '--launch-screen-transform',
  launchScreenShadow: '--launch-screen-shadow',
  heroTagBorder: '--hero-tag-border',
  heroTagRadius: '--hero-tag-radius',
  heroTagBg: '--hero-tag-bg',
  heroTagShadow: '--hero-tag-shadow',
  menuPanelBorder: '--menu-panel-border',
  menuPanelBg: '--menu-panel-bg',
  menuPanelShadow: '--menu-panel-shadow',
  menuButtonBorder: '--menu-button-border',
  menuButtonTransform: '--menu-button-transform',
  menuButtonShadow: '--menu-button-shadow',
  metaChipBorder: '--meta-chip-border',
  metaChipRadius: '--meta-chip-radius',
  metaChipBg: '--meta-chip-bg',
  metaChipShadow: '--meta-chip-shadow',
}

/**
 * 应用手机/阅读器/测验等子系统的派生变量。
 * 这些变量基于核心 token 自动计算，确保子功能跟随系统主题。
 */
const applyDerivedVarsToDocument = (tokens) => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const bg = tokens.background || '#0d0d1a'
  const fg = tokens.foreground || '#ffffff'
  const muted = tokens.muted || '#2d1b4e'
  const accentCyan = tokens.accentCyan || '#00f5d4'
  const accentPurple = tokens.accentPurple || '#7b2fff'
  const accentYellow = tokens.accentYellow || '#ffd700'

  // 手机层
  root.style.setProperty('--phone-bg', bg)
  root.style.setProperty('--phone-bg-secondary', `color-mix(in srgb, ${bg} 85%, transparent)`)
  root.style.setProperty('--phone-header-bg', `color-mix(in srgb, ${bg} 85%, transparent)`)
  root.style.setProperty('--phone-text-primary', fg)
  root.style.setProperty('--phone-text-secondary', 'rgba(255, 255, 255, 0.5)')
  root.style.setProperty('--phone-card-bg', 'rgba(255, 255, 255, 0.06)')
  root.style.setProperty('--phone-border', 'rgba(255, 255, 255, 0.1)')
  root.style.setProperty('--phone-overlay', 'rgba(0, 0, 0, 0.85)')
  root.style.setProperty('--phone-gradient-start', bg)
  root.style.setProperty('--phone-gradient-end', muted)

  // 阅读器层
  root.style.setProperty('--reader-bg', bg)
  root.style.setProperty('--reader-text', fg)
  root.style.setProperty('--reader-header-bg', 'rgba(0, 0, 0, 0.2)')
  root.style.setProperty('--reader-footer-bg', 'rgba(0, 0, 0, 0.3)')
  root.style.setProperty('--reader-panel-bg', 'rgba(255, 255, 255, 0.04)')
  root.style.setProperty('--reader-border', 'rgba(255, 255, 255, 0.08)')
  root.style.setProperty('--reader-secondary', '#8b9dc3')
  root.style.setProperty('--reader-strong', fg)
  root.style.setProperty('--reader-accent-start', accentCyan)
  root.style.setProperty('--reader-accent-end', accentPurple)

  // 测验层
  root.style.setProperty('--quiz-bg', bg)
  root.style.setProperty('--quiz-text-primary', fg)
  root.style.setProperty('--quiz-text-secondary', '#8b9dc3')
  root.style.setProperty('--quiz-gradient-start', accentCyan)
  root.style.setProperty('--quiz-gradient-end', accentPurple)
  root.style.setProperty('--quiz-card-bg', 'rgba(255, 255, 255, 0.06)')
  root.style.setProperty('--quiz-border', 'rgba(255, 255, 255, 0.1)')

  // 游戏厅层
  root.style.setProperty('--game-bg', bg)
  root.style.setProperty('--game-text-primary', fg)
  root.style.setProperty('--game-text-secondary', 'rgba(255, 255, 255, 0.5)')
  root.style.setProperty('--game-header-bg', 'rgba(0, 0, 0, 0.3)')
  root.style.setProperty('--game-card-bg', 'rgba(255, 255, 255, 0.06)')
  root.style.setProperty('--game-border', 'rgba(255, 255, 255, 0.1)')
  root.style.setProperty('--game-gold', accentYellow)
  root.style.setProperty('--game-gold-dim', 'rgba(255, 215, 0, 0.1)')
  root.style.setProperty('--game-gold-border', 'rgba(255, 215, 0, 0.2)')
  root.style.setProperty('--game-gradient-start', accentCyan)
  root.style.setProperty('--game-gradient-end', accentPurple)

  // 任务板层
  root.style.setProperty('--task-bg', bg)
  root.style.setProperty('--task-text-primary', fg)
  root.style.setProperty('--task-text-secondary', 'rgba(255, 255, 255, 0.5)')
  root.style.setProperty('--task-header-bg', 'rgba(0, 0, 0, 0.3)')
  root.style.setProperty('--task-card-bg', 'rgba(255, 255, 255, 0.06)')
  root.style.setProperty('--task-border', 'rgba(255, 255, 255, 0.1)')
  root.style.setProperty('--task-gold', accentYellow)
  root.style.setProperty('--task-gold-dim', 'rgba(255, 215, 0, 0.1)')
  root.style.setProperty('--task-gold-border', 'rgba(255, 215, 0, 0.2)')

  // 商店层
  root.style.setProperty('--shop-bg', bg)
  root.style.setProperty('--shop-text-primary', fg)
  root.style.setProperty('--shop-text-secondary', 'rgba(255, 255, 255, 0.5)')
  root.style.setProperty('--shop-header-bg', 'rgba(0, 0, 0, 0.3)')
  root.style.setProperty('--shop-card-bg', 'rgba(255, 255, 255, 0.06)')
  root.style.setProperty('--shop-border', 'rgba(255, 255, 255, 0.1)')
  root.style.setProperty('--shop-gold', accentYellow)
  root.style.setProperty('--shop-gold-dim', 'rgba(255, 215, 0, 0.1)')
  root.style.setProperty('--shop-gold-border', 'rgba(255, 215, 0, 0.2)')

  // 签到层
  root.style.setProperty('--checkin-bg', bg)
  root.style.setProperty('--checkin-text-primary', fg)
  root.style.setProperty('--checkin-text-secondary', 'rgba(255, 255, 255, 0.5)')
  root.style.setProperty('--checkin-header-bg', 'rgba(0, 0, 0, 0.3)')
  root.style.setProperty('--checkin-card-bg', 'rgba(255, 255, 255, 0.06)')
  root.style.setProperty('--checkin-border', 'rgba(255, 255, 255, 0.1)')
  root.style.setProperty('--checkin-gold', accentYellow)
  root.style.setProperty('--checkin-gold-dim', 'rgba(255, 215, 0, 0.1)')
  root.style.setProperty('--checkin-gold-border', 'rgba(255, 215, 0, 0.2)')
}

const sanitizeTokens = (tokens = {}) => {
  const normalized = { ...fallbackTheme.tokens }

  for (const tokenName of Object.keys(tokenToCssVar)) {
    if (typeof tokens[tokenName] === 'string' && tokens[tokenName].trim()) {
      normalized[tokenName] = tokens[tokenName].trim()
    }
  }

  return normalized
}

const normalizeTheme = (theme, source = 'custom') => {
  const nextStyleProfile =
    typeof theme?.styleProfile === 'string' && theme.styleProfile.trim()
      ? theme.styleProfile.trim()
      : fallbackTheme.styleProfile || DEFAULT_STYLE_PROFILE

  return {
    id: String(theme?.id || `${source}_${Date.now()}`),
    name: String(theme?.name || 'Unnamed Theme'),
    description: String(theme?.description || ''),
    styleProfile: nextStyleProfile,
    source,
    tokens: sanitizeTokens(theme?.tokens),
    // 支持组件级变量
    componentVars: theme?.componentVars || {},
    // 支持外部文件路径
    externalPath: theme?.externalPath || null,
  }
}

const readJsonStorage = async (key) => {
  if (typeof window === 'undefined') return null

  try {
    return await kvStorage.get(key)
  } catch {
    return null
  }
}

const writeJsonStorage = async (key, value) => {
  if (typeof window === 'undefined') return
  await kvStorage.set(key, value)
}

export const getCustomThemes = async () => {
  const raw = await readJsonStorage(CUSTOM_THEMES_KEY)
  if (!Array.isArray(raw)) return []
  return raw.map((theme) => normalizeTheme(theme, 'custom'))
}

// 从 data/theme/ 目录加载外部主题
export const loadExternalThemes = async () => {
  if (typeof window === 'undefined') return []
  
  try {
    // 尝试从 data/theme/ 目录加载主题文件
    const themeFiles = await fetchExternalThemeFiles()
    const themes = []
    
    for (const themeData of themeFiles) {
      const normalized = normalizeTheme(themeData, 'external')
      normalized.externalPath = themeData._filePath
      themes.push(normalized)
    }
    
    return themes
  } catch (error) {
    console.warn('[ThemeManager] Failed to load external themes:', error)
    return []
  }
}

// 获取外部主题文件（通过 fetch 或预定义列表）
const fetchExternalThemeFiles = async () => {
  // 预定义的外部主题文件列表
  const externalThemePaths = [
    '/data/theme/ios-glass.json',
    '/data/theme/art-deco.json',
    '/data/theme/material-you.json',
  ]
  
  const themes = []
  
  for (const path of externalThemePaths) {
    try {
      const response = await fetch(path)
      if (response.ok) {
        const themeData = await response.json()
        themeData._filePath = path
        themes.push(themeData)
      }
    } catch {
      // 忽略加载失败的文件
    }
  }
  
  return themes
}

export const getThemeCatalog = async () => {
  const normalizedPresets = presetThemes.map((theme) => normalizeTheme(theme, 'preset'))
  const customThemes = await getCustomThemes()
  const externalThemes = await loadExternalThemes()
  
  // 合并所有主题，去重（按 id）
  const allThemes = [...normalizedPresets, ...customThemes]
  const existingIds = new Set(allThemes.map(t => t.id))
  
  for (const theme of externalThemes) {
    if (!existingIds.has(theme.id)) {
      allThemes.push(theme)
      existingIds.add(theme.id)
    }
  }
  
  return allThemes
}

export const getActiveThemeId = async () => {
  if (typeof window === 'undefined') return fallbackTheme.id
  return (await kvStorage.get(ACTIVE_THEME_KEY)) || fallbackTheme.id
}

const setActiveThemeId = async (themeId) => {
  if (typeof window === 'undefined') return
  await kvStorage.set(ACTIVE_THEME_KEY, themeId)
}

const applyTokensToDocument = (tokens) => {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  for (const [tokenName, cssVar] of Object.entries(tokenToCssVar)) {
    root.style.setProperty(cssVar, tokens[tokenName])
  }
}

// 应用组件级 CSS 变量
const applyComponentVarsToDocument = (componentVars = {}) => {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  for (const [varName, cssVar] of Object.entries(componentVarToCssVar)) {
    if (componentVars[varName] !== undefined) {
      root.style.setProperty(cssVar, componentVars[varName])
    }
  }
}

const applyStyleProfileToDocument = (styleProfile) => {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.setAttribute('data-theme-style', styleProfile || DEFAULT_STYLE_PROFILE)
}

export const applyThemeById = async (themeId, { persist = true } = {}) => {
  const catalog = await getThemeCatalog()
  const selected = catalog.find((theme) => theme.id === themeId) || catalog[0]
  if (!selected) return null

  applyTokensToDocument(selected.tokens)
  applyComponentVarsToDocument(selected.componentVars)
  applyDerivedVarsToDocument(selected.tokens)
  applyStyleProfileToDocument(selected.styleProfile)

  if (persist) {
    await setActiveThemeId(selected.id)
  }

  return selected
}

export const upsertCustomTheme = async (themeInput) => {
  const normalized = normalizeTheme(
    {
      ...themeInput,
      id: themeInput?.id || `custom_${Date.now()}`,
    },
    'custom',
  )

  const existing = await getCustomThemes()
  const targetIndex = existing.findIndex((item) => item.id === normalized.id)

  if (targetIndex >= 0) {
    existing[targetIndex] = normalized
  } else {
    existing.push(normalized)
  }

  await writeJsonStorage(CUSTOM_THEMES_KEY, existing)
  return normalized
}

export const initTheme = async () => {
  const activeThemeId = await getActiveThemeId()
  const applied = await applyThemeById(activeThemeId, { persist: false })
  if (applied) return applied
  return applyThemeById(fallbackTheme.id)
}

/**
 * 初始化自定义字体：从存储恢复已导入字体，并应用字体分配。
 */
export const initCustomFonts = async () => {
  if (typeof document === 'undefined') return

  try {
    const {
      getImportedFonts,
      getFontBinary,
      getFontAssignments,
    } = await import('../fonts/fontStorage.js')
    const { restoreFontFromBuffer } = await import('../fonts/fontLoader.js')

    // 恢复所有已导入字体
    const fonts = await getImportedFonts()
    for (const font of fonts) {
      const buffer = await getFontBinary(font.id)
      if (buffer) {
        await restoreFontFromBuffer(buffer, font.familyName)
      }
    }

    // 应用字体分配
    const assignments = await getFontAssignments()
    const root = document.documentElement
    const defaults = {
      fontHeading: "'Outfit', 'Segoe UI', sans-serif",
      fontBody: "'DM Sans', 'Segoe UI', sans-serif",
      fontDisplay: "'Bangers', 'Impact', sans-serif",
    }
    const mapping = {
      fontHeading: '--font-heading',
      fontBody: '--font-body',
      fontDisplay: '--font-display',
    }

    for (const [key, cssVar] of Object.entries(mapping)) {
      const value = assignments[key] || defaults[key]
      root.style.setProperty(cssVar, value)
    }
  } catch (e) {
    // 字体初始化失败不影响主流程，静默处理
    console.warn('[ThemeManager] Custom fonts initialization failed:', e)
  }
}

export const getThemeTemplate = () => {
  return JSON.stringify(
    {
      id: 'custom_theme_id',
      name: 'Custom Theme',
      description: 'Describe this theme',
      styleProfile: 'dopamine-max',
      tokens: {
        background: '#0d0d1a',
        foreground: '#ffffff',
        muted: '#2d1b4e',
        accentMagenta: '#ff3af2',
        accentCyan: '#00f5d4',
        accentYellow: '#ffe600',
        accentOrange: '#ff6b35',
        accentPurple: '#7b2fff',
        fontHeading: "'Outfit', 'Segoe UI', sans-serif",
        fontBody: "'DM Sans', 'Segoe UI', sans-serif",
        fontDisplay: "'Bangers', 'Impact', sans-serif",
        radiusButton: '9999px',
        radiusCard: '24px',
        radiusPanel: '16px',
        textShadowSingle: '2px 2px 0 var(--accent-purple)',
        textShadowDouble:
          '2px 2px 0 var(--accent-purple), 4px 4px 0 var(--accent-magenta)',
        textShadowTriple:
          '2px 2px 0 var(--accent-purple), 4px 4px 0 var(--accent-magenta), 6px 6px 0 var(--accent-cyan)',
        surfacePanel: 'color-mix(in srgb, var(--background) 32%, transparent)',
        surfaceField: 'color-mix(in srgb, var(--background) 28%, transparent)',
        surfaceControl: 'color-mix(in srgb, var(--muted) 76%, transparent)',
        surfaceStatus: 'color-mix(in srgb, var(--muted) 65%, transparent)',
        borderPanel: 'var(--accent-cyan)',
        borderField: 'var(--accent-cyan)',
        borderControl: 'var(--accent-magenta)',
        borderStatus: 'var(--accent-cyan)',
        borderAction: 'var(--accent-yellow)',
        gradientPrimary:
          'linear-gradient(120deg, color-mix(in srgb, var(--accent-magenta) 70%, var(--background)), color-mix(in srgb, var(--accent-purple) 60%, var(--background)), color-mix(in srgb, var(--accent-cyan) 58%, var(--background)))',
        gradientSecondary:
          'linear-gradient(120deg, color-mix(in srgb, var(--accent-cyan) 72%, var(--background)), color-mix(in srgb, var(--accent-purple) 62%, var(--background)), color-mix(in srgb, var(--accent-magenta) 58%, var(--background)))',
        shadowScreen:
          '0 0 34px color-mix(in srgb, var(--accent-cyan) 45%, transparent), 12px 12px 0 var(--accent-magenta), 24px 24px 0 var(--accent-cyan)',
        shadowPanel:
          '0 0 22px color-mix(in srgb, var(--accent-cyan) 45%, transparent), 6px 6px 0 var(--accent-yellow)',
        shadowCard:
          '0 0 24px color-mix(in srgb, var(--accent-orange) 45%, transparent), 8px 8px 0 var(--accent-magenta), 16px 16px 0 var(--accent-cyan)',
        shadowField:
          '0 0 14px color-mix(in srgb, var(--accent-cyan) 35%, transparent), 6px 6px 0 var(--accent-magenta)',
        shadowButton:
          '0 0 16px color-mix(in srgb, var(--accent-magenta) 38%, transparent), 6px 6px 0 var(--accent-cyan), 12px 12px 0 var(--accent-yellow)',
        shadowButtonDisabled:
          '0 0 12px color-mix(in srgb, var(--accent-magenta) 25%, transparent), 4px 4px 0 var(--accent-cyan)',
        shadowStatus:
          '0 0 12px color-mix(in srgb, var(--accent-yellow) 32%, transparent), 6px 6px 0 var(--accent-cyan)',
        shadowPressed: 'inset 10px 10px 20px #d9d4e3, inset -10px -10px 20px #ffffff',
        blobPrimary: 'rgba(255, 58, 242, 0.22)',
        blobSecondary: 'rgba(0, 245, 212, 0.22)',
        blobTertiary: 'rgba(123, 47, 255, 0.2)',
        backdropBlur: '9px',
      },
      // 组件级变量（可选）
      componentVars: {
        launchScreenBorder: '1px solid var(--border-panel)',
        launchScreenRadius: 'var(--radius-card)',
        launchScreenBg: 'var(--surface-panel)',
        launchScreenBackdrop: 'blur(var(--backdrop-blur)) saturate(180%)',
        launchScreenTransform: 'none',
        launchScreenShadow: 'var(--shadow-screen)',
        heroTagBorder: '1px solid var(--border-status)',
        heroTagRadius: '9999px',
        heroTagBg: 'var(--surface-status)',
        heroTagShadow: 'var(--shadow-field)',
        menuPanelBorder: '1px solid var(--border-panel)',
        menuPanelBg: 'var(--surface-panel)',
        menuPanelShadow: 'var(--shadow-panel)',
        menuButtonBorder: '1px solid var(--border-control)',
        menuButtonTransform: 'none',
        menuButtonShadow: 'var(--shadow-button)',
        metaChipBorder: '1px solid var(--border-field)',
        metaChipRadius: '9999px',
        metaChipBg: 'var(--surface-field)',
        metaChipShadow: 'var(--shadow-field)',
      },
    },
    null,
    2,
  )
}
