import dopamineMax from '../themes/presets/dopamine-max.json'
import clayHiFi from '../themes/presets/clay-hifi.json'
import linearModern from '../themes/presets/linear-modern.json'

const ACTIVE_THEME_KEY = 'avg_llm_active_theme'
const CUSTOM_THEMES_KEY = 'avg_llm_custom_themes'
const DEFAULT_STYLE_PROFILE = 'dopamine-max'

const presetThemes = [dopamineMax, clayHiFi, linearModern]
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
  }
}

const readJsonStorage = (key) => {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const writeJsonStorage = (key, value) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export const getCustomThemes = () => {
  const raw = readJsonStorage(CUSTOM_THEMES_KEY)
  if (!Array.isArray(raw)) return []
  return raw.map((theme) => normalizeTheme(theme, 'custom'))
}

export const getThemeCatalog = () => {
  const normalizedPresets = presetThemes.map((theme) => normalizeTheme(theme, 'preset'))
  return [...normalizedPresets, ...getCustomThemes()]
}

export const getActiveThemeId = () => {
  if (typeof window === 'undefined') return fallbackTheme.id
  return window.localStorage.getItem(ACTIVE_THEME_KEY) || fallbackTheme.id
}

const setActiveThemeId = (themeId) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ACTIVE_THEME_KEY, themeId)
}

const applyTokensToDocument = (tokens) => {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  for (const [tokenName, cssVar] of Object.entries(tokenToCssVar)) {
    root.style.setProperty(cssVar, tokens[tokenName])
  }
}

const applyStyleProfileToDocument = (styleProfile) => {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.setAttribute('data-theme-style', styleProfile || DEFAULT_STYLE_PROFILE)
}

export const applyThemeById = (themeId, { persist = true } = {}) => {
  const catalog = getThemeCatalog()
  const selected = catalog.find((theme) => theme.id === themeId) || catalog[0]
  if (!selected) return null

  applyTokensToDocument(selected.tokens)
  applyStyleProfileToDocument(selected.styleProfile)

  if (persist) {
    setActiveThemeId(selected.id)
  }

  return selected
}

export const upsertCustomTheme = (themeInput) => {
  const normalized = normalizeTheme(
    {
      ...themeInput,
      id: themeInput?.id || `custom_${Date.now()}`,
    },
    'custom',
  )

  const existing = getCustomThemes()
  const targetIndex = existing.findIndex((item) => item.id === normalized.id)

  if (targetIndex >= 0) {
    existing[targetIndex] = normalized
  } else {
    existing.push(normalized)
  }

  writeJsonStorage(CUSTOM_THEMES_KEY, existing)
  return normalized
}

export const initTheme = () => {
  const activeThemeId = getActiveThemeId()
  const applied = applyThemeById(activeThemeId, { persist: false })
  if (applied) return applied
  return applyThemeById(fallbackTheme.id)
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
    },
    null,
    2,
  )
}
