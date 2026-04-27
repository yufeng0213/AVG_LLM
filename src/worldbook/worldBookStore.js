import { getEmotionLabel } from './emotionPresets'
import { kvStorage } from '../storage/index.js'
import { DEFAULT_NARRATOR_ID } from '../narrator/narratorStore'
import { isSQLiteAvailable, exec, query, transaction, loadBookFull, loadAllBooksFull, insertBook, clearAllTables } from '../db/db.js'

export const WORLD_BOOK_STORAGE_KEY = 'world_books'
export const ACTIVE_WORLD_BOOK_KEY = 'active_world_book'

// --- 规范化结果缓存 ---
let _normalizedCache = null
let _cacheVersion = 0

// --- 活跃世界书 ID 缓存 ---
let _activeBookIdCache = null

export const WORLD_BOOK_ENTRY_DEFS = [
  { key: 'overview', label: '世界概述', hint: '一句话说明这个世界最核心的设定。' },
  { key: 'era', label: '时代背景', hint: '故事发生的时代、科技水平与历史阶段。' },
  { key: 'regions', label: '地理与区域', hint: '大陆/城市/禁区/交通方式等信息。' },
  { key: 'forces', label: '主要势力', hint: '政体、组织、家族、阵营及其关系。' },
  { key: 'rules', label: '世界规则', hint: '魔法/科技/能力运行规则与限制。' },
  { key: 'culture', label: '社会文化', hint: '价值观、宗教、风俗、语言、礼仪。' },
  { key: 'conflict', label: '核心冲突', hint: '推动剧情的根本矛盾与风险。' },
  { key: 'secrets', label: '秘密与禁忌', hint: '禁区、真相、伏笔、不可公开设定。' },
  { key: 'storyHook', label: '开局前提', hint: '主角进入故事时已知/未知的状态。' },
]

export const WORLD_BOOK_PORTRAIT_STYLE_OPTIONS = [
  { value: 'card', label: '卡片式立绘（底部贴对话框顶部 -10px）' },
  { value: 'half_body', label: '半身立绘（底部贴对话框顶部 -10px）' },
  { value: 'full_body', label: '全身立绘（底部贴屏幕底部）' },
  { value: 'leg_body', label: '腿部立绘（底部贴屏幕底部）' },
]

const WORLD_BOOK_PORTRAIT_STYLE_VALUES = WORLD_BOOK_PORTRAIT_STYLE_OPTIONS.map((item) => item.value)
export const RELATIONSHIP_METRIC_MIN = -100
export const RELATIONSHIP_METRIC_MAX = 100
export const CHARACTER_PERSONALITY_SCORE_MIN = 0
export const CHARACTER_PERSONALITY_SCORE_MAX = 100
export const CHARACTER_MBTI_OPTIONS = [
  'INTJ',
  'INTP',
  'ENTJ',
  'ENTP',
  'INFJ',
  'INFP',
  'ENFJ',
  'ENFP',
  'ISTJ',
  'ISFJ',
  'ESTJ',
  'ESFJ',
  'ISTP',
  'ISFP',
  'ESTP',
  'ESFP',
]
const CHARACTER_MBTI_SET = new Set(CHARACTER_MBTI_OPTIONS)
export const CHARACTER_PERSONALITY_DIMENSION_DEFS = [
  { key: 'Se', label: 'Se（外倾感觉）', hint: '关注当下感官刺激与即时行动。' },
  { key: 'Si', label: 'Si（内倾感觉）', hint: '依赖经验记忆与稳定秩序。' },
  { key: 'Ne', label: 'Ne（外倾直觉）', hint: '联想可能性、跳跃式发散。' },
  { key: 'Ni', label: 'Ni（内倾直觉）', hint: '提炼趋势、预判长期走向。' },
  { key: 'Te', label: 'Te（外倾思维）', hint: '强调效率、结果与外部标准。' },
  { key: 'Ti', label: 'Ti（内倾思维）', hint: '强调逻辑自洽与概念精度。' },
  { key: 'Fe', label: 'Fe（外倾情感）', hint: '关注群体情绪与关系协调。' },
  { key: 'Fi', label: 'Fi（内倾情感）', hint: '坚持个人价值与内在感受。' },
]
const CHARACTER_PERSONALITY_DIMENSION_KEYS = CHARACTER_PERSONALITY_DIMENSION_DEFS.map((item) => item.key)
const OPENING_DIALOGUE_MODE_SET = new Set(['auto', 'custom'])
const LEGACY_DEFAULT_OPENING_DIALOGUE = [
  { speaker: '旁白', text: '雨夜的图书馆只剩你与断续的电流声，窗外的霓虹正把地面切成碎片。', emotion: null },
  { speaker: '伊芙', text: '终于等到你了，档案室的门只会在今晚开启，过了零点就会再次封存。', emotion: 'happy' },
  { speaker: '你', text: '我来找失踪案的原始记录，线索应该在禁区最深处的那排手稿里。', emotion: 'neutral' },
  { speaker: '零号', text: '再往前一步，你会看到不该被公开的名字，也会看到你自己的过去。', emotion: 'worried' },
  { speaker: '旁白', text: '你握紧终端，屏幕上的微光把三道身影叠在一起，像命运重写前的倒计时。', emotion: null },
]

const normalizeOpeningDialogueMode = (rawMode, fallback = 'auto') => {
  const mode = String(rawMode || '').trim().toLowerCase()
  if (OPENING_DIALOGUE_MODE_SET.has(mode)) {
    return mode
  }
  return fallback
}

const normalizeOpeningDialogue = (rawDialogue) => {
  if (!Array.isArray(rawDialogue)) {
    return []
  }

  return rawDialogue
    .map((line) => ({
      speaker: String(line?.speaker || '旁白').trim() || '旁白',
      text: String(line?.text || '').trim(),
      emotion: line?.emotion || null,
    }))
    .filter((line) => line.text)
}

const isSameOpeningDialogue = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false
  }

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index]
    const right = b[index]
    if (
      String(left?.speaker || '').trim() !== String(right?.speaker || '').trim() ||
      String(left?.text || '').trim() !== String(right?.text || '').trim() ||
      String(left?.emotion || '') !== String(right?.emotion || '')
    ) {
      return false
    }
  }

  return true
}

const clampRelationshipMetric = (value, fallback = 0) => {
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(RELATIONSHIP_METRIC_MAX, Math.max(RELATIONSHIP_METRIC_MIN, Math.round(parsed)))
}

export const createDefaultRelationshipBase = () => ({
  favor: 50,
  trust: 50,
  stance: 0,
})

export const createDefaultCharacterVoiceConfig = () => ({
  enabled: false,
  voiceId: '',
  speed: 1,
  vol: 1,
  pitch: 0,
  emotion: '',
  sampleRate: 32000,
  bitrate: 128000,
  format: 'mp3',
  channel: 1,
  pronunciationTone: [],
  subtitleEnable: false,
})

const clampPersonalityScore = (value, fallback = 50) => {
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(CHARACTER_PERSONALITY_SCORE_MAX, Math.max(CHARACTER_PERSONALITY_SCORE_MIN, Math.round(parsed)))
}

const normalizeMbtiValue = (value) => {
  const nextType = String(value || '').trim().toUpperCase()
  if (CHARACTER_MBTI_SET.has(nextType)) {
    return nextType
  }
  return ''
}

const normalizePersonalityTags = (rawTags) => {
  if (!Array.isArray(rawTags) && typeof rawTags !== 'string') {
    return []
  }

  const values = Array.isArray(rawTags)
    ? rawTags
    : String(rawTags || '').split(/\r?\n|[,，、;；]/g)

  return values
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, 12)
}

const readPersonalityDimensionValue = (source, key) => {
  if (!source || typeof source !== 'object') {
    return undefined
  }
  if (source[key] !== undefined) {
    return source[key]
  }

  const lowerCaseKey = key.toLowerCase()
  if (source[lowerCaseKey] !== undefined) {
    return source[lowerCaseKey]
  }

  const upperCaseKey = key.toUpperCase()
  if (source[upperCaseKey] !== undefined) {
    return source[upperCaseKey]
  }

  return undefined
}

const pickPersonalityDimensionSource = (rawProfile) => {
  if (!rawProfile || typeof rawProfile !== 'object') {
    return {}
  }

  const directCandidates = [
    rawProfile.cognitiveDimensions,
    rawProfile.cognitiveDimension,
    rawProfile.eightDimensions,
    rawProfile.eightDimension,
    rawProfile.functionScores,
    rawProfile.functions,
    rawProfile.axes,
  ]

  const matchedDirect = directCandidates.find((candidate) => candidate && typeof candidate === 'object')
  if (matchedDirect) {
    return matchedDirect
  }

  const hasDirectDimensionValue = CHARACTER_PERSONALITY_DIMENSION_KEYS.some(
    (key) => readPersonalityDimensionValue(rawProfile, key) !== undefined,
  )
  return hasDirectDimensionValue ? rawProfile : {}
}

export const createDefaultCharacterPersonalityDimensions = () => {
  const next = {}
  for (const key of CHARACTER_PERSONALITY_DIMENSION_KEYS) {
    next[key] = 50
  }
  return next
}

const normalizePersonalityDimensions = (rawDimensions) => {
  const fallback = createDefaultCharacterPersonalityDimensions()
  const source = rawDimensions && typeof rawDimensions === 'object' ? rawDimensions : {}
  const next = {}

  for (const key of CHARACTER_PERSONALITY_DIMENSION_KEYS) {
    const rawValue = readPersonalityDimensionValue(source, key)
    next[key] = clampPersonalityScore(rawValue, fallback[key])
  }

  return next
}

export const createDefaultPersonalityProfile = () => ({
  mbti: '',
  behaviorTags: [],
  cognitiveDimensions: createDefaultCharacterPersonalityDimensions(),
})

export const normalizePersonalityProfile = (rawProfile) => {
  const fallback = createDefaultPersonalityProfile()
  const source = rawProfile && typeof rawProfile === 'object' ? rawProfile : {}
  return {
    mbti: normalizeMbtiValue(source.mbti || source.mbtiType || source.type || fallback.mbti),
    behaviorTags: normalizePersonalityTags(
      source.behaviorTags ||
      source.behaviorTraits ||
      source.traits ||
      source.tags ||
      fallback.behaviorTags,
    ),
    cognitiveDimensions: normalizePersonalityDimensions(pickPersonalityDimensionSource(source)),
  }
}

export const normalizeRelationshipBase = (rawBase) => {
  const fallback = createDefaultRelationshipBase()
  return {
    favor: clampRelationshipMetric(rawBase?.favor, fallback.favor),
    trust: clampRelationshipMetric(rawBase?.trust, fallback.trust),
    stance: clampRelationshipMetric(rawBase?.stance, fallback.stance),
  }
}

const clampVoiceNumber = (value, min, max, fallback) => {
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, parsed))
}

const parseVoiceNumber = (value, fallback) => {
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return parsed
}

const clampVoiceInteger = (value, min, max, fallback) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, parsed))
}

const normalizeVoiceFormat = (value) => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'wav' || raw === 'flac' || raw === 'mp3') {
    return raw
  }
  return 'mp3'
}

export const normalizeCharacterVoiceConfig = (rawConfig) => {
  const fallback = createDefaultCharacterVoiceConfig()
  return {
    enabled: Boolean(rawConfig?.enabled),
    voiceId: String(rawConfig?.voiceId || '').trim(),
    speed: clampVoiceNumber(rawConfig?.speed, 0.5, 2, fallback.speed),
    vol: parseVoiceNumber(rawConfig?.vol, fallback.vol),
    pitch: clampVoiceNumber(rawConfig?.pitch, -12, 12, fallback.pitch),
    emotion: String(rawConfig?.emotion || '').trim(),
    sampleRate: clampVoiceInteger(rawConfig?.sampleRate, 8000, 48000, fallback.sampleRate),
    bitrate: clampVoiceInteger(rawConfig?.bitrate, 32000, 320000, fallback.bitrate),
    format: normalizeVoiceFormat(rawConfig?.format),
    channel: clampVoiceInteger(rawConfig?.channel, 1, 2, fallback.channel),
    pronunciationTone: toStringArray(rawConfig?.pronunciationTone),
    subtitleEnable: Boolean(rawConfig?.subtitleEnable),
  }
}

const toStringArray = (rawValue) => {
  if (!Array.isArray(rawValue)) return []
  return rawValue
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
}

const parseOptionalInteger = (value) => {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return parsed
}

const parseOptionalRelationshipMetric = (value) => {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) {
    return null
  }
  return Math.min(RELATIONSHIP_METRIC_MAX, Math.max(RELATIONSHIP_METRIC_MIN, Math.round(parsed)))
}

const normalizeDirectorRelationshipRule = (rawRule, index = 0) => {
  const fallbackId = `rule_${index + 1}`
  return {
    characterId: String(rawRule?.characterId || '').trim(),
    characterName: String(rawRule?.characterName || '').trim(),
    favorMin: parseOptionalRelationshipMetric(rawRule?.favorMin),
    favorMax: parseOptionalRelationshipMetric(rawRule?.favorMax),
    trustMin: parseOptionalRelationshipMetric(rawRule?.trustMin),
    trustMax: parseOptionalRelationshipMetric(rawRule?.trustMax),
    stanceMin: parseOptionalRelationshipMetric(rawRule?.stanceMin),
    stanceMax: parseOptionalRelationshipMetric(rawRule?.stanceMax),
    id: String(rawRule?.id || fallbackId),
  }
}

const normalizeDirectorCondition = (rawCondition) => {
  return {
    minLine: parseOptionalInteger(rawCondition?.minLine),
    maxLine: parseOptionalInteger(rawCondition?.maxLine),
    scenes: toStringArray(rawCondition?.scenes),
    requireChoice: Boolean(rawCondition?.requireChoice),
    choiceIncludes: toStringArray(rawCondition?.choiceIncludes),
    choiceActions: toStringArray(rawCondition?.choiceActions),
    customInputOnly: Boolean(rawCondition?.customInputOnly),
    userInputIncludes: toStringArray(rawCondition?.userInputIncludes),
    requiredFlags: toStringArray(rawCondition?.requiredFlags),
    blockedFlags: toStringArray(rawCondition?.blockedFlags),
    relationship: Array.isArray(rawCondition?.relationship)
      ? rawCondition.relationship.map((rule, index) => normalizeDirectorRelationshipRule(rule, index))
      : [],
  }
}

const normalizeDirectorRelationshipDelta = (rawDelta, index = 0) => {
  const fallbackId = `delta_${index + 1}`
  return {
    id: String(rawDelta?.id || fallbackId),
    target: String(rawDelta?.target || rawDelta?.characterId || '').trim(),
    characterId: String(rawDelta?.characterId || '').trim(),
    characterName: String(rawDelta?.characterName || '').trim(),
    favor: clampRelationshipMetric(rawDelta?.favor, 0),
    trust: clampRelationshipMetric(rawDelta?.trust, 0),
    stance: clampRelationshipMetric(rawDelta?.stance, 0),
  }
}

const normalizeDirectorEffects = (rawEffects) => {
  return {
    promptHint: String(rawEffects?.promptHint || '').trim(),
    promptDirectives: toStringArray(rawEffects?.promptDirectives),
    relationshipDeltas: Array.isArray(rawEffects?.relationshipDeltas)
      ? rawEffects.relationshipDeltas.map((delta, index) => normalizeDirectorRelationshipDelta(delta, index))
      : [],
    setFlags: toStringArray(rawEffects?.setFlags),
    clearFlags: toStringArray(rawEffects?.clearFlags),
  }
}

export const createDirectorEventTemplate = (index = 1) => ({
  id: `director_event_${Date.now()}_${index}`,
  name: `导演事件 ${index}`,
  enabled: true,
  once: true,
  promptHint: '',
  promptDirectives: [],
  condition: {
    minLine: null,
    maxLine: null,
    scenes: [],
    requireChoice: false,
    choiceIncludes: [],
    choiceActions: [],
    customInputOnly: false,
    userInputIncludes: [],
    requiredFlags: [],
    blockedFlags: [],
    relationship: [],
  },
  effects: {
    promptHint: '',
    promptDirectives: [],
    relationshipDeltas: [],
    setFlags: [],
    clearFlags: [],
  },
})

export const normalizeDirectorEvent = (rawEvent, index = 0) => {
  const fallback = createDirectorEventTemplate(index + 1)
  return {
    id: String(rawEvent?.id || fallback.id),
    name: String(rawEvent?.name || fallback.name),
    enabled: rawEvent?.enabled !== false,
    once: rawEvent?.once !== false,
    promptHint: String(rawEvent?.promptHint || '').trim(),
    promptDirectives: toStringArray(rawEvent?.promptDirectives),
    condition: normalizeDirectorCondition(rawEvent?.condition),
    effects: normalizeDirectorEffects(rawEvent?.effects),
  }
}

export const normalizeDirectorEvents = (rawEvents) => {
  if (!Array.isArray(rawEvents)) {
    return []
  }
  return rawEvents.map((event, index) => normalizeDirectorEvent(event, index))
}

export const createEmptyEntries = () => {
  const entries = {}
  for (const item of WORLD_BOOK_ENTRY_DEFS) {
    entries[item.key] = ''
  }
  return entries
}

// 创建空立绘数组
export const createEmptyPortraits = () => []

// 创建空场景数组
export const createEmptyScenes = () => []
export const createEmptyBackgroundAssets = () => []

// 创建新卡牌边框配置
export const createNewCardBorder = (filePath, fileName, name, list) => {
  const index = (list?.length || 0) + 1
  return {
    id: `cardBorder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name || `边框 ${index}`,
    filePath,
    fileName,
    cropRect: { x: 0, y: 0, w: 0, h: 0 },
    addedAt: new Date().toISOString(),
  }
}

// 创建默认显示设置
export const createDefaultDisplaySettings = () => ({
  portraitStyle: 'card',
  cardBorderList: [],
  activeCardBorderId: '',
})

// 创建新场景配置
export const createNewScene = (index = 1) => ({
  id: `scene_${Date.now()}_${index}`,
  name: `场景 ${index}`,
  background: '',
  description: '',
  createdAt: new Date().toISOString(),
})

// 创建新立绘配置
export const createNewPortrait = (filePath, fileName, emotion = 'default') => ({
  id: `portrait_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  label: getEmotionLabel(emotion),
  emotion: emotion,
  filePath,
  fileName,
  addedAt: new Date().toISOString(),
})

export const createEmptyUserProfile = () => ({
  name: '',
  nickname: '',
  appearance: '',
  identity: '',
  background: '',
  portraits: [],  // 新增：立绘列表
})

export const createCharacterSkeleton = (index = 1) => ({
  id: `char_${Date.now()}_${index}`,
  name: `角色 ${index}`,
  nickname: '',
  appearance: '',
  identity: '',
  background: '',
  notes: '',
  personalityProfile: createDefaultPersonalityProfile(),
  relationshipBase: createDefaultRelationshipBase(),
  voiceConfig: createDefaultCharacterVoiceConfig(),
  portraits: [],  // 新增：立绘列表
  birthday: (() => {
    const m = Math.floor(Math.random() * 12) + 1
    const d = Math.floor(Math.random() * 28) + 1
    return `${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
  })(),
  smsAvatar: null,  // 短信聊天专用头像（base64 dataUrl）
  smsBg: null,  // 短信聊天背景图（base64 dataUrl 或 URL）
  smsStickers: {},  // 短信表情包（{描述: url}）
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

// 规范化单个立绘数据
const normalizePortrait = (rawPortrait) => {
  return {
    id: String(rawPortrait?.id || `portrait_${Date.now()}`),
    label: String(rawPortrait?.label || '默认'),
    emotion: String(rawPortrait?.emotion || 'default'),
    filePath: String(rawPortrait?.filePath || ''),
    fileName: String(rawPortrait?.fileName || ''),
    addedAt: String(rawPortrait?.addedAt || new Date().toISOString()),
  }
}

// 规范化立绘数组
const normalizePortraits = (rawPortraits) => {
  if (!Array.isArray(rawPortraits)) {
    return []
  }
  return rawPortraits.map(normalizePortrait).filter((p) => p.filePath)
}

const normalizeUserProfile = (rawProfile) => {
  const fallback = createEmptyUserProfile()
  const nextProfile = { ...fallback }
  for (const key of Object.keys(fallback)) {
    if (key === 'portraits') {
      nextProfile[key] = normalizePortraits(rawProfile?.portraits)
    } else if (typeof rawProfile?.[key] === 'string') {
      nextProfile[key] = rawProfile[key]
    }
  }
  return nextProfile
}

const normalizeCharacter = (rawCharacter, index = 0) => {
  const fallback = createCharacterSkeleton(index + 1)
  const rawPersonalityProfile =
    rawCharacter?.personalityProfile ||
    rawCharacter?.personality_profile ||
    rawCharacter?.personality ||
    rawCharacter?.mbtiProfile ||
    rawCharacter
  return {
    id: String(rawCharacter?.id || fallback.id),
    name: String(rawCharacter?.name || fallback.name),
    nickname: String(rawCharacter?.nickname || ''),
    appearance: String(rawCharacter?.appearance || ''),
    identity: String(rawCharacter?.identity || ''),
    background: String(rawCharacter?.background || ''),
    notes: String(rawCharacter?.notes || ''),
    personalityProfile: normalizePersonalityProfile(rawPersonalityProfile),
    relationshipBase: normalizeRelationshipBase(rawCharacter?.relationshipBase),
    voiceConfig: normalizeCharacterVoiceConfig(rawCharacter?.voiceConfig),
    portraits: normalizePortraits(rawCharacter?.portraits),
    smsAvatar: typeof rawCharacter?.smsAvatar === 'string' ? rawCharacter.smsAvatar : null,
    smsBg: typeof rawCharacter?.smsBg === 'string' ? rawCharacter.smsBg : null,
    smsStickers: rawCharacter?.smsStickers && typeof rawCharacter.smsStickers === 'object' ? rawCharacter.smsStickers : {},
    birthday: String(rawCharacter?.birthday || fallback.birthday),
    createdAt: String(rawCharacter?.createdAt || fallback.createdAt),
    updatedAt: String(rawCharacter?.updatedAt || fallback.updatedAt),
  }
}

const normalizeCharacters = (rawCharacters) => {
  if (!Array.isArray(rawCharacters)) {
    return [createCharacterSkeleton(1)]
  }

  const parsed = rawCharacters.map((char, index) => normalizeCharacter(char, index))
  return parsed.length > 0 ? parsed : [createCharacterSkeleton(1)]
}

const normalizePortraitStyle = (rawStyle) => {
  const nextStyle = String(rawStyle || '').trim()
  if (WORLD_BOOK_PORTRAIT_STYLE_VALUES.includes(nextStyle)) {
    return nextStyle
  }
  return 'card'
}

const normalizeDisplaySettings = (rawSettings) => {
  const fallback = createDefaultDisplaySettings()
  const cardBorderList = Array.isArray(rawSettings?.cardBorderList)
    ? rawSettings.cardBorderList.map((item, index) => normalizeCardBorder(item, index))
    : []
  const activeId = rawSettings?.activeCardBorderId || ''
  const activeExists = activeId && cardBorderList.some((item) => item.id === activeId)
  return {
    portraitStyle: normalizePortraitStyle(rawSettings?.portraitStyle || fallback.portraitStyle),
    cardBorderList,
    activeCardBorderId: activeExists ? activeId : (cardBorderList.length > 0 ? cardBorderList[0].id : ''),
  }
}

const normalizeCropRect = (rawRect) => ({
  x: Number.isFinite(rawRect?.x) ? Math.max(0, Math.round(rawRect.x)) : 0,
  y: Number.isFinite(rawRect?.y) ? Math.max(0, Math.round(rawRect.y)) : 0,
  w: Number.isFinite(rawRect?.w) ? Math.max(0, Math.round(rawRect.w)) : 0,
  h: Number.isFinite(rawRect?.h) ? Math.max(0, Math.round(rawRect.h)) : 0,
})

const normalizeCardBorder = (rawBorder, index = 0) => ({
  id: String(rawBorder?.id || `cardBorder_${index + 1}`),
  name: String(rawBorder?.name || `边框 ${index + 1}`),
  filePath: String(rawBorder?.filePath || ''),
  fileName: String(rawBorder?.fileName || ''),
  cropRect: normalizeCropRect(rawBorder?.cropRect),
  addedAt: String(rawBorder?.addedAt || new Date().toISOString()),
})

const normalizeBackgroundAsset = (rawAsset, index = 0) => {
  const idFallback = `bg_${index + 1}`
  const nameFallback = `背景 ${index + 1}`
  return {
    id: String(rawAsset?.id || idFallback),
    name: String(rawAsset?.name || nameFallback),
    path: String(rawAsset?.path || ''),
    label: String(rawAsset?.label || rawAsset?.name || nameFallback),
  }
}

const normalizeBackgroundAssets = (rawAssets) => {
  if (!Array.isArray(rawAssets)) {
    return []
  }

  return rawAssets
    .map((asset, index) => normalizeBackgroundAsset(asset, index))
    .filter((asset) => asset.path)
}

// 规范化单个场景数据
const normalizeScene = (rawScene, index = 0) => {
  return {
    id: String(rawScene?.id || `scene_${Date.now()}_${index}`),
    name: String(rawScene?.name || `场景 ${index + 1}`),
    background: String(rawScene?.background || ''),
    description: String(rawScene?.description || ''),
    createdAt: String(rawScene?.createdAt || new Date().toISOString()),
  }
}

// 规范化场景数组
const normalizeScenes = (rawScenes) => {
  if (!Array.isArray(rawScenes)) {
    return []
  }
  return rawScenes.map((scene, index) => normalizeScene(scene, index)).filter((s) => s.name || s.background)
}

export const createDefaultRelationships = () => ({})

export const normalizeRelationships = (raw, characters) => {
  if (!raw || typeof raw !== 'object') return createDefaultRelationships()

  const validIds = new Set(['__player__'])
  if (Array.isArray(characters)) {
    characters.forEach(c => { if (c?.id) validIds.add(String(c.id)) })
  }

  const result = {}
  for (const [fromId, targets] of Object.entries(raw)) {
    if (!validIds.has(fromId)) continue
    if (!targets || typeof targets !== 'object') continue

    const normalizedTargets = {}
    for (const [toId, rel] of Object.entries(targets)) {
      if (!validIds.has(toId)) continue
      if (!rel || typeof rel !== 'object') continue

      const score = typeof rel.score === 'number' ? Math.max(0, Math.min(1000, rel.score)) : 0
      normalizedTargets[toId] = {
        score,
        description: typeof rel.description === 'string' && rel.description ? rel.description : '',
        updatedAt: typeof rel.updatedAt === 'string' && rel.updatedAt ? rel.updatedAt : new Date().toISOString(),
      }
    }

    if (Object.keys(normalizedTargets).length > 0) {
      result[fromId] = normalizedTargets
    }
  }
  return result
}

export const createDefaultWorldBook = () => ({
  id: 'default_world_book',
  title: '默认世界书',
  summary: '主线剧情默认背景设定。',
  isDefault: true,
  tags: [],
  defaultNarratorId: DEFAULT_NARRATOR_ID,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  entries: createEmptyEntries(),
  userProfile: createEmptyUserProfile(),
  characters: [createCharacterSkeleton(1)],
  directorEvents: [],
  scenes: [],  // 新增：场景列表
  backgroundAssets: createEmptyBackgroundAssets(),
  displaySettings: createDefaultDisplaySettings(),
  openingDialogueMode: 'auto',
  openingDialogue: [],
  relationships: createDefaultRelationships(),
})

export const normalizeWorldBook = (rawBook, index = 0) => {
  const fallback = createDefaultWorldBook()
  const nextEntries = createEmptyEntries()

  for (const item of WORLD_BOOK_ENTRY_DEFS) {
    if (typeof rawBook?.entries?.[item.key] === 'string') {
      nextEntries[item.key] = rawBook.entries[item.key]
    }
  }

  const isDefault = Boolean(rawBook?.isDefault) || rawBook?.id === fallback.id
  const id = isDefault ? fallback.id : String(rawBook?.id || `world_book_${Date.now()}_${index}`)
  const normalizedOpeningDialogue = normalizeOpeningDialogue(rawBook?.openingDialogue)
  const rawOpeningMode = String(rawBook?.openingDialogueMode || rawBook?.openingMode || '').trim().toLowerCase()
  const hasLegacyDefaultOpening = !rawOpeningMode && isSameOpeningDialogue(normalizedOpeningDialogue, LEGACY_DEFAULT_OPENING_DIALOGUE)
  const openingDialogueMode = rawOpeningMode
    ? normalizeOpeningDialogueMode(rawOpeningMode, 'auto')
    : (normalizedOpeningDialogue.length > 0 && !hasLegacyDefaultOpening ? 'custom' : 'auto')

  return {
    id,
    title: String(rawBook?.title || (isDefault ? fallback.title : `世界书 ${index + 1}`)),
    summary: String(rawBook?.summary || ''),
    isDefault,
    defaultNarratorId: String(rawBook?.defaultNarratorId || fallback.defaultNarratorId || DEFAULT_NARRATOR_ID),
    createdAt: String(rawBook?.createdAt || new Date().toISOString()),
    updatedAt: String(rawBook?.updatedAt || new Date().toISOString()),
    entries: nextEntries,
    userProfile: normalizeUserProfile(rawBook?.userProfile),
    characters: normalizeCharacters(rawBook?.characters),
    directorEvents: normalizeDirectorEvents(rawBook?.directorEvents),
    scenes: normalizeScenes(rawBook?.scenes),
    backgroundAssets: normalizeBackgroundAssets(rawBook?.backgroundAssets),
    displaySettings: normalizeDisplaySettings(rawBook?.displaySettings),
    openingDialogueMode,
    openingDialogue: hasLegacyDefaultOpening ? [] : normalizedOpeningDialogue,
    relationships: normalizeRelationships(rawBook?.relationships, rawBook?.characters),
    tags: normalizeWorldbookTags(rawBook?.tags),
  }
}

const normalizeWorldbookTags = (rawTags) => {
  if (!Array.isArray(rawTags)) return []
  return rawTags
    .map((t) => String(t ?? '').trim().toLowerCase())
    .filter(Boolean)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 20)
}

const sortWorldBooks = (books) => {
  return [...books].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1
    if (!a.isDefault && b.isDefault) return 1
    return String(a.createdAt).localeCompare(String(b.createdAt))
  })
}

const ensureDefaultWorldBook = (books) => {
  const hasDefault = books.some((book) => book.id === 'default_world_book' || book.isDefault)
  if (hasDefault) {
    return books.map((book) =>
      book.id === 'default_world_book'
        ? { ...book, isDefault: true, title: '默认世界书' }
        : book,
    )
  }

  return [createDefaultWorldBook(), ...books]
}

// ============================================================
// SQLite 存储层（Android） / kvStorage 回退（Web dev）
// ============================================================

// --- Web fallback: 使用现有 kvStorage ---

async function _loadRawBooksFromKV() {
  try {
    const parsed = await kvStorage.get(WORLD_BOOK_STORAGE_KEY)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function _saveRawBooksToKV(books) {
  await kvStorage.set(WORLD_BOOK_STORAGE_KEY, books)
}

// --- SQLite 加载 ---

async function _loadBooksSQLite() {
  const books = await loadAllBooksFull()
  return books.map(book => normalizeWorldBook(book, 0))
}

async function _getBookSQLite(bookId) {
  const book = await loadBookFull(bookId)
  return book ? normalizeWorldBook(book, 0) : null
}

// --- SQLite 保存 ---

async function _saveBooksSQLite(books) {
  await transaction(async () => {
    await clearAllTables()
    for (const book of books) {
      await insertBook(book)
    }
  })
}

// --- 规范化书架轻量数据（从 SQLite 查询结果提取） ---

async function _loadBookTitlesSQLite() {
  const rows = await query(
    'SELECT id, title, summary, is_default, created_at FROM world_books ORDER BY is_default DESC, created_at'
  )
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    summary: r.summary || '',
    isDefault: !!r.is_default,
  }))
}

async function _loadBookSummariesSQLite() {
  const books = await query(
    'SELECT id, title, summary, is_default FROM world_books ORDER BY is_default DESC, created_at'
  )
  if (books.length === 0) return []

  const bookIds = books.map(b => b.id)
  const chars = await query(
    'SELECT id, world_book_id, name, nickname, identity, birthday, sms_avatar_path, sms_bg_path, voice_enabled, voice_id FROM characters WHERE world_book_id IN (' + bookIds.map(() => '?').join(',') + ')',
    bookIds
  )
  const rels = await query(
    'SELECT world_book_id, from_id, to_id, score, description, updated_at FROM relationships WHERE world_book_id IN (' + bookIds.map(() => '?').join(',') + ')',
    bookIds
  )
  const stickers = await query(
    'SELECT description, file_path, world_book_id FROM sms_stickers WHERE world_book_id IN (' + bookIds.map(() => '?').join(',') + ')',
    bookIds
  )

  const charMap = {}
  for (const c of chars) {
    if (!charMap[c.world_book_id]) charMap[c.world_book_id] = []
    charMap[c.world_book_id].push({
      id: c.id,
      name: c.name,
      nickname: c.nickname || '',
      identity: c.identity || '',
      portraits: [],
      smsAvatar: c.sms_avatar_path,
      smsBg: c.sms_bg_path,
      smsStickers: {},
      voiceConfig: { enabled: !!c.voice_enabled, voiceId: c.voice_id || '' },
      birthday: c.birthday || '',
    })
  }

  const stickerMapByBook = {}
  for (const s of stickers) {
    if (!stickerMapByBook[s.world_book_id]) stickerMapByBook[s.world_book_id] = {}
    stickerMapByBook[s.world_book_id][s.description] = s.file_path
  }
  for (const bookId of bookIds) {
    const sd = stickerMapByBook[bookId] || {}
    for (const c of (charMap[bookId] || [])) { c.smsStickers = { ...sd } }
  }

  const relMap = {}
  for (const r of rels) {
    if (!relMap[r.world_book_id]) relMap[r.world_book_id] = {}
    if (!relMap[r.world_book_id][r.from_id]) relMap[r.world_book_id][r.from_id] = {}
    relMap[r.world_book_id][r.from_id][r.to_id] = {
      score: r.score,
      description: r.description || '',
      updatedAt: r.updated_at,
    }
  }

  return books.map(b => ({
    id: b.id,
    title: b.title,
    summary: b.summary || '',
    isDefault: !!b.is_default,
    characters: charMap[b.id] || [],
    relationships: relMap[b.id] || {},
  }))
}

// ============================================================
// 公共 API（保持原有签名）
// ============================================================

/**
 * 书架级轻量加载
 */
export const loadWorldBookTitles = async () => {
  if (typeof window === 'undefined') return [createDefaultWorldBook()]

  if (isSQLiteAvailable()) {
    try {
      const titles = await _loadBookTitlesSQLite()
      return sortWorldBooks(ensureDefaultWorldBook(titles))
    } catch (e) {
      console.error('[worldBook] SQLite loadWorldBookTitles failed:', e.message)
    }
  }

  // Web fallback
  if (_normalizedCache) {
    return _normalizedCache.map(b => ({
      id: b.id, title: b.title, summary: b.summary, isDefault: b.isDefault,
    }))
  }
  try {
    const parsed = await _loadRawBooksFromKV()
    if (parsed.length === 0) return [createDefaultWorldBook()]
    const titlesOnly = parsed.map((rawBook, index) => {
      const isDefault = Boolean(rawBook?.isDefault) || rawBook?.id === 'default_world_book'
      return {
        id: String(rawBook?.id || `world_book_${Date.now()}_${index}`),
        title: String(rawBook?.title || (isDefault ? '默认世界书' : `世界书 ${index + 1}`)),
        summary: String(rawBook?.summary || ''),
        isDefault,
      }
    })
    return sortWorldBooks(ensureDefaultWorldBook(titlesOnly))
  } catch {
    return [createDefaultWorldBook()]
  }
}

/**
 * 轻量加载：世界书 + 角色基本信息 + 关系
 */
export const loadWorldBookSummaries = async () => {
  if (typeof window === 'undefined') return [createDefaultWorldBook()]

  if (isSQLiteAvailable()) {
    try {
      const summaries = await _loadBookSummariesSQLite()
      return sortWorldBooks(ensureDefaultWorldBook(summaries))
    } catch (e) {
      console.error('[worldBook] SQLite loadWorldBookSummaries failed:', e.message)
    }
  }

  // Web fallback
  if (_normalizedCache) {
    return _normalizedCache.map(b => ({
      id: b.id, title: b.title, summary: b.summary, isDefault: b.isDefault,
      characters: b.characters.map(c => ({
        id: c.id, name: c.name, nickname: c.nickname, identity: c.identity,
        portraits: c.portraits, smsAvatar: c.smsAvatar, smsBg: c.smsBg,
        smsStickers: c.smsStickers, voiceConfig: c.voiceConfig, birthday: c.birthday,
      })),
      relationships: b.relationships,
    }))
  }
  try {
    const parsed = await _loadRawBooksFromKV()
    if (parsed.length === 0) return [createDefaultWorldBook()]
    const liteBooks = parsed.map((rawBook, index) => {
      const isDefault = Boolean(rawBook?.isDefault) || rawBook?.id === 'default_world_book'
      const chars = Array.isArray(rawBook?.characters) ? rawBook.characters : []
      const rawRelationships = rawBook?.relationships && typeof rawBook.relationships === 'object' ? rawBook.relationships : {}
      return {
        id: String(rawBook?.id || `world_book_${Date.now()}_${index}`),
        title: String(rawBook?.title || (isDefault ? '默认世界书' : `世界书 ${index + 1}`)),
        summary: String(rawBook?.summary || ''),
        isDefault,
        characters: chars.filter(Boolean).map(c => ({
          id: String(c?.id || ''), name: String(c?.name || '未知角色'),
          nickname: String(c?.nickname || ''), identity: String(c?.identity || ''),
          portraits: Array.isArray(c?.portraits) ? c.portraits : [],
          smsAvatar: typeof c?.smsAvatar === 'string' ? c.smsAvatar : null,
          smsBg: typeof c?.smsBg === 'string' ? c.smsBg : null,
          smsStickers: c?.smsStickers && typeof c.smsStickers === 'object' ? c.smsStickers : {},
          voiceConfig: c?.voiceConfig && typeof c.voiceConfig === 'object' ? c.voiceConfig : { enabled: false, voiceId: '' },
          birthday: String(c?.birthday || ''),
        })),
        relationships: normalizeRelationships(rawRelationships, chars),
      }
    })
    return sortWorldBooks(ensureDefaultWorldBook(liteBooks))
  } catch {
    return [createDefaultWorldBook()]
  }
}

/**
 * 完整加载所有世界书
 */
export const loadWorldBooks = async () => {
  if (typeof window === 'undefined') return [createDefaultWorldBook()]

  // 命中缓存直接返回
  if (_normalizedCache) return _normalizedCache

  if (isSQLiteAvailable()) {
    try {
      _normalizedCache = await _loadBooksSQLite()
      _normalizedCache = sortWorldBooks(ensureDefaultWorldBook(_normalizedCache))
      _cacheVersion++
      return _normalizedCache
    } catch (e) {
      console.error('[worldBook] SQLite loadWorldBooks failed:', e.message)
    }
  }

  // Web fallback
  try {
    const parsed = await _loadRawBooksFromKV()
    _normalizedCache = Array.isArray(parsed)
      ? parsed.map((book, index) => normalizeWorldBook(book, index))
      : []
    _normalizedCache = sortWorldBooks(ensureDefaultWorldBook(_normalizedCache))
    _cacheVersion++
    return _normalizedCache
  } catch {
    return [createDefaultWorldBook()]
  }
}

/**
 * 保存所有世界书
 */
export const persistWorldBooks = async (books) => {
  if (typeof window === 'undefined') return

  if (isSQLiteAvailable()) {
    try {
      await _saveBooksSQLite(books)
      _normalizedCache = null
      _cacheVersion++
      return
    } catch (e) {
      console.error('[worldBook] SQLite persistWorldBooks failed:', e.message)
    }
  }

  // Web fallback
  await _saveRawBooksToKV(books)
  _normalizedCache = null
  _cacheVersion++
}

/**
 * 按 ID 获取单本规范化的世界书
 */
export const getNormalizedBook = async (bookId) => {
  if (typeof window === 'undefined') return createDefaultWorldBook()

  // 优先从缓存查找
  if (_normalizedCache) {
    const cached = _normalizedCache.find(b => b.id === bookId)
    if (cached) return cached
  }

  if (isSQLiteAvailable()) {
    try {
      const book = await _getBookSQLite(bookId)
      if (book) return book
    } catch (e) {
      console.error('[worldBook] SQLite getNormalizedBook failed:', e.message)
    }
  }

  // 缓存未命中，回退到完整加载
  const books = await loadWorldBooks()
  return books.find(b => b.id === bookId) || createDefaultWorldBook()
}

export const getActiveWorldBookId = async () => {
  if (typeof window === 'undefined') return 'default_world_book'
  if (_activeBookIdCache !== null) return _activeBookIdCache
  const id = (await kvStorage.get(ACTIVE_WORLD_BOOK_KEY)) || 'default_world_book'
  _activeBookIdCache = id
  return id
}

export const setActiveWorldBookId = async (bookId) => {
  if (typeof window === 'undefined') return
  const id = bookId || 'default_world_book'
  await kvStorage.set(ACTIVE_WORLD_BOOK_KEY, id)
  _activeBookIdCache = id
}

export const getActiveWorldBookTags = async () => {
  try {
    const activeId = await getActiveWorldBookId()
    const book = await getNormalizedBook(activeId)
    return Array.isArray(book?.tags) ? book.tags : []
  } catch {
    return []
  }
}

export const createNewWorldBook = (books = []) => {
  const index = books.filter((book) => !book.isDefault).length + 1
  return normalizeWorldBook({
    id: `world_book_${Date.now()}`,
    title: `世界书 ${index}`,
    summary: '用于扩展支线或平行世界背景。',
    isDefault: false,
    defaultNarratorId: DEFAULT_NARRATOR_ID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    entries: createEmptyEntries(),
    userProfile: createEmptyUserProfile(),
    characters: [createCharacterSkeleton(1)],
    directorEvents: [],
    backgroundAssets: createEmptyBackgroundAssets(),
    displaySettings: createDefaultDisplaySettings(),
  })
}

export const createNewCharacter = (characters = []) => {
  const nextIndex = (Array.isArray(characters) ? characters.length : 0) + 1
  return createCharacterSkeleton(nextIndex)
}

export const addNewScene = (scenes = []) => {
  const nextIndex = (Array.isArray(scenes) ? scenes.length : 0) + 1
  return createNewScene(nextIndex)
}

export const deleteWorldBook = (books, bookId) => {
  const bookToDelete = books.find((book) => book.id === bookId)

  if (!bookToDelete || bookToDelete.isDefault || bookId === 'default_world_book') {
    return { success: false, message: '无法删除默认世界书', books }
  }

  const filteredBooks = books.filter((book) => book.id !== bookId)
  const sortedBooks = sortWorldBooks(filteredBooks)

  return { success: true, message: `已删除：${bookToDelete.title}`, books: sortedBooks }
}

export const exportWorldBook = (book) => {
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    worldBook: {
      ...book,
      _exportedId: book.id,
    }
  }
  return JSON.stringify(exportData, null, 2)
}

export const importWorldBook = (jsonString, existingBooks = []) => {
  try {
    const data = JSON.parse(jsonString)
    if (!data.worldBook && !data.title) {
      return { success: false, message: '无效的世界书格式', book: null }
    }
    const rawBook = data.worldBook || data
    const existingIds = new Set(existingBooks.map(b => b.id))
    const originalId = rawBook._exportedId || rawBook.id
    let newId
    if (originalId && !existingIds.has(originalId) && !originalId.startsWith('default_')) {
      newId = originalId
    } else {
      newId = `world_book_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    }
    const normalizedBook = normalizeWorldBook({
      ...rawBook,
      id: newId,
      isDefault: false,
      title: rawBook.title || `导入的世界书 ${existingBooks.length}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    return { success: true, message: `已导入：${normalizedBook.title}`, book: normalizedBook }
  } catch (error) {
    return { success: false, message: `导入失败：${error.message}`, book: null }
  }
}

export const importWorldBooks = (jsonString, existingBooks = []) => {
  try {
    const data = JSON.parse(jsonString)
    if (Array.isArray(data)) {
      const results = []
      for (const item of data) {
        const result = importWorldBook(JSON.stringify(item), existingBooks)
        if (result.success && result.book) results.push(result.book)
      }
      return { success: true, message: `成功导入 ${results.length} 本世界书`, books: results }
    }
    if (data.worldBooks && Array.isArray(data.worldBooks)) {
      const results = []
      for (const item of data.worldBooks) {
        const result = importWorldBook(JSON.stringify(item), existingBooks)
        if (result.success && result.book) results.push(result.book)
      }
      return { success: true, message: `成功导入 ${results.length} 本世界书`, books: results }
    }
    const result = importWorldBook(jsonString, existingBooks)
    return { success: result.success, message: result.message, books: result.book ? [result.book] : [] }
  } catch (error) {
    return { success: false, message: `导入失败：${error.message}`, books: [] }
  }
}

export const invalidateWorldBookCache = () => {
  _normalizedCache = null
  _activeBookIdCache = null
  _cacheVersion++
}

// --- 跨页签同步 ---
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === `avg_llm_${WORLD_BOOK_STORAGE_KEY}`) {
      _normalizedCache = null
      _cacheVersion++
    }
  })
}
