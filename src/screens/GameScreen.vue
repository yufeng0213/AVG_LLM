<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  createDefaultRelationshipBase,
  getActiveWorldBookId,
  loadWorldBooks,
  normalizeDirectorEvents,
  normalizeCharacterVoiceConfig,
  normalizeRelationshipBase,
} from '../worldbook/worldBookStore'
import {
  generateCharacterSpeech,
  generateCgPrompt,
  generateStory,
  buildStoryPrompt,
  parseStoryContent,
  toGameScript,
  hasChoices,
  extractChoices,
} from '../llm'
import { saveGame, createHistoryBackup, formatTimestamp } from '../save/saveManager'
import { kvStorage } from '../storage/index.js'
import { DEFAULT_NARRATOR_ID, loadNarratorProfiles, resolveNarratorProfile } from '../narrator/narratorStore'
import MusicPlayer from '../components/MusicPlayer.vue'
import Phone from '../components/Phone.vue'
import HandheldConsole from '../components/HandheldConsole.vue'
import Backpack from '../components/Backpack.vue'
import PluginComponent from '../plugins/PluginComponent.vue'
import { PluginTypes } from '../plugins/pluginManager.js'
import CGGeneratorModal from '../components/CGGeneratorModal.vue'
import { generateCG, getImageBase64 } from '../comfyui/comfyuiService.js'
import { isAndroid, isNative } from '../utils/platform.js'
import { Filesystem, Directory } from '@capacitor/filesystem'
import {
  applyWorldBookBackgroundAssets,
  loadBackgroundFolder,
  switchBackground,
  currentBackgroundUrl
} from '../background/backgroundStore'

const emit = defineEmits(['back'])

// 接收存档数据 prop
const props = defineProps({
  saveData: {
    type: Object,
    default: null,
  },
  worldBookId: {
    type: String,
    default: 'default_world_book',
  },
  sessionNarratorId: {
    type: String,
    default: '',
  },
})

// 世界书数据
const worldBooks = ref([])
// 使用传入的世界书ID，如果没有则使用存档中的或默认的
const activeBookId = ref(props.worldBookId || props.saveData?.game?.worldBookId || 'default_world_book')
// 叙事者数据（优先：本局覆盖 > 世界书默认 > 系统默认）
const narratorProfiles = ref([])
const sessionNarratorId = ref(props.sessionNarratorId || '')
const LLM_SETTINGS_STORAGE_PREFIX = 'game-llm-settings'

const SESSION_SCOPED_STORAGE_PREFIXES = [
  'phone-sms-threads',
  'phone-moments-feed',
  'phone-forum-posts',
  'phone-news-events',
  'phone-map-data',
  LLM_SETTINGS_STORAGE_PREFIX,
  'phone-clues',
  'phone-settings',
  'phone-wallet',
  'phone-shop',
  'backpack-items',
]
const createSessionSmsScopeId = () => `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const sanitizeSmsScopeId = (value) => String(value || '').trim()
const smsSaveScopeId = ref(sanitizeSmsScopeId(props.saveData?.__slotId) || createSessionSmsScopeId())

const getScopedStorageKey = (prefix, worldBookId = activeBookId.value, scopeId = smsSaveScopeId.value) => {
  const normalizedWorldId = String(worldBookId || 'default_world_book').trim() || 'default_world_book'
  const normalizedScopeId = sanitizeSmsScopeId(scopeId) || 'session_default'
  return `${prefix}:${normalizedWorldId}:${normalizedScopeId}`
}

const syncPhoneSmsScopeAfterSave = async (nextSlotId) => {
  const normalizedNextSlotId = sanitizeSmsScopeId(nextSlotId)
  if (!normalizedNextSlotId) return

  const previousScopeId = sanitizeSmsScopeId(smsSaveScopeId.value) || 'session_default'
  if (previousScopeId !== normalizedNextSlotId) {
    for (const prefix of SESSION_SCOPED_STORAGE_PREFIXES) {
      const sourceKey = getScopedStorageKey(prefix, activeBookId.value, previousScopeId)
      const targetKey = getScopedStorageKey(prefix, activeBookId.value, normalizedNextSlotId)
      try {
        const sourceData = await kvStorage.get(sourceKey)
        if (sourceData !== undefined && sourceData !== null) {
          await kvStorage.set(targetKey, sourceData)
        }
      } catch {
        // no-op
      }
    }
  }

  smsSaveScopeId.value = normalizedNextSlotId
}

// 立绘图片缓存
const portraitImageCache = ref(new Map())

const defaultSceneCharacters = [
  {
    id: 'eve',
    sourceId: '',
    name: '伊芙',
    role: '档案管理员',
    toneClass: 'tone-violet',
    positionClass: 'is-left',
  },
  {
    id: 'lead',
    sourceId: 'user',
    name: '你',
    role: '调查员',
    toneClass: 'tone-cyan',
    positionClass: 'is-center',
  },
  {
    id: 'zero',
    sourceId: '',
    name: '零号',
    role: '未知访客',
    toneClass: 'tone-orange',
    positionClass: 'is-right',
  },
]

const dynamicToneClasses = ['tone-violet', 'tone-orange', 'tone-cyan']
const dynamicPositionClasses = ['is-left', 'is-right', 'is-center']

const sceneCharacters = computed(() => {
  const currentBook = worldBooks.value.find((book) => book.id === activeBookId.value) || null
  if (!currentBook) {
    return defaultSceneCharacters
  }

  const userName = String(currentBook.userProfile?.name || currentBook.userProfile?.nickname || '你').trim() || '你'
  const userRole = String(currentBook.userProfile?.role || '调查员').trim() || '调查员'
  const leadCharacter = {
    id: 'lead',
    sourceId: 'user',
    name: userName,
    role: userRole,
    toneClass: 'tone-cyan',
    positionClass: 'is-center',
  }

  const dynamicCharacters = (Array.isArray(currentBook.characters) ? currentBook.characters : []).map((char, index) => {
    const name = String(char?.name || char?.nickname || `角色${index + 1}`).trim() || `角色${index + 1}`
    const role = String(char?.role || '').trim() || '角色'
    return {
      id: `char_${index}`,
      sourceId: String(char?.id || '').trim(),
      name,
      role,
      toneClass: dynamicToneClasses[index % dynamicToneClasses.length],
      positionClass: dynamicPositionClasses[index % dynamicPositionClasses.length],
    }
  })

  return [leadCharacter, ...dynamicCharacters]
})

// 默认开场白（当世界书没有定义时使用）
const defaultOpeningDialogue = [
  {
    speaker: '旁白',
    text: '雨夜的图书馆只剩你与断续的电流声，窗外的霓虹正把地面切成碎片。',
    emotion: null,
  },
  {
    speaker: '伊芙',
    text: '终于等到你了，档案室的门只会在今晚开启，过了零点就会再次封存。',
    emotion: 'happy',
  },
  {
    speaker: '你',
    text: '我来找失踪案的原始记录，线索应该在禁区最深处的那排手稿里。',
    emotion: 'neutral',
  },
  {
    speaker: '零号',
    text: '再往前一步，你会看到不该被公开的名字，也会看到你自己的过去。',
    emotion: 'worried',
  },
  {
    speaker: '旁白',
    text: '你握紧终端，屏幕上的微光把三道身影叠在一起，像命运重写前的倒计时。',
    emotion: null,
  },
]

// 对话脚本（改为 ref 以支持动态添加）- 初始化使用默认开场白
const dialogueScript = ref([...defaultOpeningDialogue])

// 初始化开场白（根据世界书或使用默认）
const initializeOpeningDialogue = () => {
  if (activeBook.value?.openingDialogue && activeBook.value.openingDialogue.length > 0) {
    dialogueScript.value = [...activeBook.value.openingDialogue]
  } else {
    dialogueScript.value = [...defaultOpeningDialogue]
  }
  // 重置对话索引
  currentLineIndex.value = 0
}

// LLM 剧情生成状态
const isGenerating = ref(false)
const generateError = ref(null)
const userPromptInput = ref('')
const showGeneratePanel = ref(false)
const generateMessageRange = ref({ min: 5, max: 10 }) // 生成消息条数范围，默认5-10条
const selectedMessageRangeKey = ref('5-10')
const customMessageRange = ref({ min: 5, max: 10 })
const storyContextLineCount = ref(24)
const storyMaxTokens = ref(2000)
const llmSettingsStorageKey = computed(() => getScopedStorageKey(LLM_SETTINGS_STORAGE_PREFIX))

// 选项相关状态
const currentChoices = ref(null) // 当前对话的选项
const showChoicesPanel = ref(false) // 是否显示选项面板
const customInputText = ref('') // 用户自定义输入内容
const selectedChoice = ref(null) // 用户选择的选项（用于继续生成）
const showDialogueHistoryPanel = ref(false) // 历史对话面板
const historyBodyRef = ref(null)
const HISTORY_DIALOGUE_PAGE_SIZE = 24
const HISTORY_DIALOGUE_PRELOAD_THRESHOLD = 72
const historyVisibleCount = ref(HISTORY_DIALOGUE_PAGE_SIZE)
const isHistoryPrepending = ref(false)

// 角色语音（TTS）状态
const isTtsGenerating = ref(false)
const isTtsPlaying = ref(false)
const isTtsSaving = ref(false)
const ttsStatusMessage = ref('')
const ttsStatusType = ref('info')
const ttsAudioInstance = ref(null)
const ttsObjectUrl = ref('')
const ttsPlayingLineKey = ref('')
const ttsCachedLineKey = ref('')
const ttsCachedAudioBytes = ref(null)
const ttsCachedMimeType = ref('audio/mpeg')
const ttsCachedFormat = ref('mp3')

// CG 生成相关状态
const showCGModal = ref(false) // 是否显示 CG 生成弹窗
const generatedCG = ref(null) // 生成的 CG 图片数据
const showCGResultPanel = ref(false)
const isCgSummarizing = ref(false)
const cgSummaryError = ref('')
const cgSummaryResult = ref(null)
const isCgGenerating = ref(false)
const cgStatusMessage = ref('')
const cgStatusType = ref('info')
let cgStatusTimer = null

// 可选的消息条数范围选项
const messageRangeOptions = [
  { key: '5-10', min: 5, max: 10, label: '5-10条' },
  { key: '10-20', min: 10, max: 20, label: '10-20条' },
  { key: '20-30', min: 20, max: 30, label: '20-30条' },
  { key: '30-40', min: 30, max: 40, label: '30-40条' },
  { key: '40-50', min: 40, max: 50, label: '40-50条' },
  { key: 'custom', label: '自定义', isCustom: true },
]

const getPresetMessageRangeByKey = (key) => {
  const targetKey = String(key || '').trim()
  const found = messageRangeOptions.find((opt) => opt.key === targetKey && !opt.isCustom)
  if (!found) return null
  return {
    min: found.min,
    max: found.max,
  }
}

const clampMessageCount = (value, fallback = 5) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(200, Math.max(1, parsed))
}

const clampStoryContextLineCount = (value, fallback = 24) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(400, Math.max(0, parsed))
}

const clampStoryMaxTokens = (value, fallback = 2000) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(200000, Math.max(128, parsed))
}

const normalizeCustomMessageRange = (rawValue, fallback = { min: 5, max: 10 }) => {
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const fallbackSource = fallback && typeof fallback === 'object' ? fallback : { min: 5, max: 10 }
  const min = clampMessageCount(source.min, fallbackSource.min)
  const max = clampMessageCount(source.max, fallbackSource.max)
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
  }
}

const normalizeLlmSettingsPayload = (rawValue, fallbackValue = null) => {
  const source = rawValue && typeof rawValue === 'object' ? rawValue : {}
  const fallbackSource = fallbackValue && typeof fallbackValue === 'object' ? fallbackValue : {}

  const rangeKeys = new Set(messageRangeOptions.map((opt) => opt.key))
  const rawKey = String(
    source.selectedMessageRangeKey ??
    source.messageRangeKey ??
    fallbackSource.selectedMessageRangeKey ??
    '5-10',
  ).trim()
  const selectedKey = rangeKeys.has(rawKey) ? rawKey : '5-10'
  const presetRange = getPresetMessageRangeByKey(selectedKey)

  const fallbackCustomSource = fallbackSource.customMessageRange && typeof fallbackSource.customMessageRange === 'object'
    ? fallbackSource.customMessageRange
    : customMessageRange.value
  const sourceCustom = source.customMessageRange && typeof source.customMessageRange === 'object'
    ? source.customMessageRange
    : {
      min: source.customMin ?? source.min,
      max: source.customMax ?? source.max,
    }
  const normalizedCustomRange = normalizeCustomMessageRange(sourceCustom, fallbackCustomSource)

  let normalizedGenerateRange = normalizedCustomRange
  if (selectedKey !== 'custom' && presetRange) {
    normalizedGenerateRange = presetRange
  }

  return {
    selectedMessageRangeKey: selectedKey,
    generateMessageRange: {
      min: clampMessageCount(
        normalizedGenerateRange.min,
        generateMessageRange.value.min,
      ),
      max: clampMessageCount(
        normalizedGenerateRange.max,
        generateMessageRange.value.max,
      ),
    },
    customMessageRange: normalizedCustomRange,
    storyContextLineCount: clampStoryContextLineCount(
      source.storyContextLineCount ?? source.contextLineCount,
      fallbackSource.storyContextLineCount ?? storyContextLineCount.value,
    ),
    storyMaxTokens: clampStoryMaxTokens(
      source.storyMaxTokens ?? source.maxTokens,
      fallbackSource.storyMaxTokens ?? storyMaxTokens.value,
    ),
  }
}

const applyLlmSettingsPayload = (payload, fallbackValue = null) => {
  const normalized = normalizeLlmSettingsPayload(payload, fallbackValue)
  selectedMessageRangeKey.value = normalized.selectedMessageRangeKey
  generateMessageRange.value = normalized.generateMessageRange
  customMessageRange.value = normalized.customMessageRange
  storyContextLineCount.value = normalized.storyContextLineCount
  storyMaxTokens.value = normalized.storyMaxTokens
}

const getCurrentLlmSettingsPayload = () => ({
  selectedMessageRangeKey: selectedMessageRangeKey.value,
  generateMessageRange: {
    min: generateMessageRange.value.min,
    max: generateMessageRange.value.max,
  },
  customMessageRange: {
    min: customMessageRange.value.min,
    max: customMessageRange.value.max,
  },
  storyContextLineCount: storyContextLineCount.value,
  storyMaxTokens: storyMaxTokens.value,
})

const persistLlmSettings = async () => {
  try {
    await kvStorage.set(llmSettingsStorageKey.value, getCurrentLlmSettingsPayload())
  } catch {
    // no-op
  }
}

const loadLlmSettingsFromStorage = async () => {
  try {
    const raw = await kvStorage.get(llmSettingsStorageKey.value)
    if (raw && typeof raw === 'object') {
      applyLlmSettingsPayload(raw)
      return true
    }
  } catch {
    // no-op
  }
  return false
}

const hydrateLlmSettingsForScope = async (fallbackValue = null) => {
  const loaded = await loadLlmSettingsFromStorage()
  if (loaded) return
  if (fallbackValue && typeof fallbackValue === 'object') {
    applyLlmSettingsPayload(fallbackValue)
  } else {
    applyLlmSettingsPayload(getCurrentLlmSettingsPayload())
  }
  await persistLlmSettings()
}

// 在范围内随机生成消息条数
const getRandomMessageCount = () => {
  const { min, max } = generateMessageRange.value
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const applyCustomMessageRange = () => {
  const min = clampMessageCount(customMessageRange.value.min, generateMessageRange.value.min)
  const max = clampMessageCount(customMessageRange.value.max, generateMessageRange.value.max)
  const normalizedMin = Math.min(min, max)
  const normalizedMax = Math.max(min, max)

  customMessageRange.value = {
    min: normalizedMin,
    max: normalizedMax,
  }
  generateMessageRange.value = {
    min: normalizedMin,
    max: normalizedMax,
  }
}

// 更新消息条数范围
const updateMessageRange = (event) => {
  const selectedKey = String(event.target.value || '5-10')
  selectedMessageRangeKey.value = selectedKey

  const selectedOption = messageRangeOptions.find((opt) => opt.key === selectedKey)
  if (!selectedOption) {
    return
  }

  if (selectedOption.isCustom) {
    customMessageRange.value = {
      min: generateMessageRange.value.min,
      max: generateMessageRange.value.max,
    }
    applyCustomMessageRange()
    void persistLlmSettings()
    return
  }

  generateMessageRange.value = {
    min: selectedOption.min,
    max: selectedOption.max,
  }
  void persistLlmSettings()
}

const updateCustomMessageRangeField = (field, event) => {
  if (selectedMessageRangeKey.value !== 'custom') {
    return
  }

  customMessageRange.value = {
    ...customMessageRange.value,
    [field]: event?.target?.value,
  }
  applyCustomMessageRange()
  void persistLlmSettings()
}

const updateStoryContextLineCount = (event) => {
  storyContextLineCount.value = clampStoryContextLineCount(event?.target?.value, storyContextLineCount.value)
  void persistLlmSettings()
}

const updateStoryMaxTokens = (event) => {
  storyMaxTokens.value = clampStoryMaxTokens(event?.target?.value, storyMaxTokens.value)
  void persistLlmSettings()
}

const resolveSpeakerCharacterId = (speakerName) => {
  const speaker = String(speakerName || '').trim()
  if (!speaker || speaker === '旁白') return null

  const book = activeBook.value

  const userAliases = [
    book?.userProfile?.name,
    book?.userProfile?.nickname,
    '你',
    '玩家',
    '主角',
  ]
    .map((name) => String(name || '').trim())
    .filter(Boolean)

  if (userAliases.includes(speaker)) {
    return 'lead'
  }

  const characters = Array.isArray(book?.characters) ? book.characters : []
  const matchedIndex = characters.findIndex((char) => {
    const aliases = [char?.name, char?.nickname, char?.id]
      .map((name) => String(name || '').trim())
      .filter(Boolean)
    return aliases.includes(speaker)
  })

  if (matchedIndex >= 0) {
    return `char_${matchedIndex}`
  }

  const matchedSceneCharacter = sceneCharacters.value.find((char) => {
    const aliases = [char?.id, char?.name, char?.sourceId]
      .map((name) => String(name || '').trim())
      .filter(Boolean)
    return aliases.includes(speaker)
  })
  if (matchedSceneCharacter) {
    return matchedSceneCharacter.id
  }

  // 向后兼容旧存档/旧脚本里的历史标识
  if (speaker === 'lead' || speaker === 'user' || speaker === '你') {
    return 'lead'
  }
  if (speaker === 'eve') {
    return characters.length > 0 ? 'char_0' : 'eve'
  }
  if (speaker === 'zero') {
    if (characters.length > 1) return 'char_1'
    if (characters.length > 0) return 'char_0'
    return 'zero'
  }

  // 在世界书未加载时，保留默认开场白角色映射
  if (!book) {
    if (speaker === '伊芙') return 'eve'
    if (speaker === '零号') return 'zero'
  }

  return null
}

const currentLineIndex = ref(0)
const activeCharacterId = ref('lead')
const currentSceneName = ref('旧图书馆')

const currentLine = computed(() => dialogueScript.value[currentLineIndex.value])
const isLastLine = computed(() => currentLineIndex.value === dialogueScript.value.length - 1)
const isAndroidPlatform = computed(() => isAndroid())

// 只保留当前剧情尾部的待选项，历史选项在分支确定后自动清理
const normalizeDialogueChoicesForHistory = (script) => {
  if (!Array.isArray(script) || script.length === 0) {
    return []
  }

  const lastIndex = script.length - 1

  return script.map((line, index) => {
    if (!line || typeof line !== 'object') {
      return line
    }

    if (index === lastIndex && hasChoices(line)) {
      return { ...line }
    }

    if (!Object.prototype.hasOwnProperty.call(line, 'choices')) {
      return { ...line }
    }

    const { choices, ...rest } = line
    return rest
  })
}

const resolveSceneFromWorldBook = (scene) => {
  if (!scene) return null

  const bookScenes = Array.isArray(activeBook.value?.scenes) ? activeBook.value.scenes : []
  if (bookScenes.length === 0) return null

  if (typeof scene === 'string') {
    const sceneText = String(scene).trim()
    if (!sceneText) return null

    return (
      bookScenes.find((item) => item?.id === sceneText || item?.name === sceneText || item?.background === sceneText) ||
      null
    )
  }

  if (typeof scene === 'object') {
    const id = String(scene.id || scene.sceneId || '').trim()
    if (id) {
      const matchedById = bookScenes.find((item) => item?.id === id || item?.name === id)
      if (matchedById) return matchedById
    }

    const name = String(scene.name || scene.sceneName || '').trim()
    if (name) {
      const matchedByName = bookScenes.find((item) => item?.name === name || item?.id === name)
      if (matchedByName) return matchedByName
    }

    const background = String(scene.background || scene.bg || '').trim()
    if (background) {
      const matchedByBg = bookScenes.find((item) => item?.background === background)
      if (matchedByBg) return matchedByBg
    }
  }

  return null
}

const resolveSceneName = (scene) => {
  if (!scene) return ''

  const matchedScene = resolveSceneFromWorldBook(scene)
  if (matchedScene?.name) {
    return String(matchedScene.name)
  }

  if (typeof scene === 'string') {
    const sceneText = String(scene).trim()
    return sceneText
  }

  if (typeof scene === 'object') {
    const name = String(scene.name || scene.sceneName || '').trim()
    if (name) return name

    const id = String(scene.id || scene.sceneId || '').trim()
    if (id) return id

    const background = String(scene.background || scene.bg || '').trim()
    if (background) return background
  }

  return ''
}

const updateCurrentSceneName = (scene) => {
  const resolved = resolveSceneName(scene)
  if (resolved) {
    currentSceneName.value = resolved
    return
  }

  if (!currentSceneName.value) {
    const fallback = activeBook.value?.scenes?.[0]?.name
    currentSceneName.value = String(fallback || '旧图书馆')
  }
}

const applyBackgroundByLineScene = async (line, options = {}) => {
  const sceneInput = line?.scene
  const matchedScene = resolveSceneFromWorldBook(sceneInput)

  if (matchedScene?.background) {
    await switchBackground(matchedScene)
    return
  }

  if (sceneInput) {
    const sceneObject = typeof sceneInput === 'string'
      ? { id: sceneInput, name: sceneInput, background: '' }
      : sceneInput
    await switchBackground(sceneObject)
    return
  }

  if (options.allowFallback) {
    const fallbackScene = (activeBook.value?.scenes || []).find((item) => item?.background)
    if (fallbackScene?.background) {
      updateCurrentSceneName(fallbackScene)
      await switchBackground(fallbackScene)
    }
  }
}

// 当前说话的角色
const currentSpeakingCharacter = computed(() => {
  const speakerId = resolveSpeakerCharacterId(currentLine.value?.speaker)
  return sceneCharacters.value.find(c => c.id === speakerId) || null
})

const hasPortraitForCharacter = (characterId) => {
  const character = getCharacterData(characterId)
  return Array.isArray(character?.portraits) && character.portraits.length > 0
}

const shouldShowCurrentPortrait = computed(() => {
  const speaker = currentSpeakingCharacter.value
  if (!speaker) return false

  // Android 下：没有立绘配置就不显示
  if (isAndroidPlatform.value) {
    return hasPortraitForCharacter(speaker.id)
  }

  return true
})

// 当前活跃的世界书
const activeBook = computed(() =>
  worldBooks.value.find((book) => book.id === activeBookId.value) || null,
)
const effectiveNarrator = computed(() => {
  const preferredId = String(sessionNarratorId.value || activeBook.value?.defaultNarratorId || DEFAULT_NARRATOR_ID)
  return resolveNarratorProfile(narratorProfiles.value, preferredId)
})
const activeNarratorIdForSave = computed(() => {
  return String(sessionNarratorId.value || activeBook.value?.defaultNarratorId || effectiveNarrator.value?.id || DEFAULT_NARRATOR_ID)
})
const relationshipState = ref({})
const directorState = ref({
  triggeredEventIds: [],
  flags: {},
})

const normalizeText = (value) => String(value || '').trim()
const normalizeMatchToken = (value) => normalizeText(value).toLowerCase()

const createEmptyDirectorRuntimeState = () => ({
  triggeredEventIds: [],
  flags: {},
})

const normalizeDirectorRuntimeState = (rawState) => {
  const triggeredEventIds = Array.isArray(rawState?.triggeredEventIds)
    ? [...new Set(rawState.triggeredEventIds.map((item) => normalizeText(item)).filter(Boolean))]
    : []

  const flags = {}
  if (rawState?.flags && typeof rawState.flags === 'object' && !Array.isArray(rawState.flags)) {
    for (const [key, value] of Object.entries(rawState.flags)) {
      const normalizedKey = normalizeText(key)
      if (!normalizedKey) continue
      flags[normalizedKey] = Boolean(value)
    }
  } else if (Array.isArray(rawState?.flags)) {
    for (const rawFlag of rawState.flags) {
      const normalizedKey = normalizeText(rawFlag)
      if (!normalizedKey) continue
      flags[normalizedKey] = true
    }
  }

  return {
    ...createEmptyDirectorRuntimeState(),
    triggeredEventIds,
    flags,
  }
}

const buildDefaultRelationshipStateFromBook = (book) => {
  const result = {}
  const characters = Array.isArray(book?.characters) ? book.characters : []

  for (const char of characters) {
    const characterId = normalizeText(char?.id)
    if (!characterId) continue
    result[characterId] = normalizeRelationshipBase(char?.relationshipBase || createDefaultRelationshipBase())
  }

  return result
}

const mergeRelationshipStateWithBook = (book, rawState) => {
  const defaults = buildDefaultRelationshipStateFromBook(book)
  const merged = { ...defaults }

  if (rawState && typeof rawState === 'object' && !Array.isArray(rawState)) {
    for (const [rawKey, rawValue] of Object.entries(rawState)) {
      const key = normalizeText(rawKey)
      if (!key) continue
      const fallback = defaults[key] || createDefaultRelationshipBase()
      const source = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
        ? rawValue
        : fallback
      merged[key] = normalizeRelationshipBase({ ...fallback, ...source })
    }
  }

  return merged
}

const hydrateNarrativeRuntimeState = (rawGameState = null) => {
  relationshipState.value = mergeRelationshipStateWithBook(activeBook.value, rawGameState?.relationshipState)
  directorState.value = normalizeDirectorRuntimeState(rawGameState?.directorState)
}

const buildRelationshipSnapshotForPrompt = (relationshipOverride = null) => {
  const runtimeState = mergeRelationshipStateWithBook(
    activeBook.value,
    relationshipOverride || relationshipState.value,
  )
  const characters = Array.isArray(activeBook.value?.characters) ? activeBook.value.characters : []

  return characters.map((char) => {
    const characterId = normalizeText(char?.id)
    const fallback = normalizeRelationshipBase(char?.relationshipBase || createDefaultRelationshipBase())
    const metrics = characterId && runtimeState[characterId]
      ? normalizeRelationshipBase(runtimeState[characterId])
      : fallback

    return {
      id: characterId,
      name: normalizeText(char?.name) || characterId || '未命名角色',
      nickname: normalizeText(char?.nickname),
      favor: metrics.favor,
      trust: metrics.trust,
      stance: metrics.stance,
    }
  })
}

const isAllCharactersTarget = (value) => {
  const token = normalizeMatchToken(value)
  return token === '*' || token === 'all' || token === 'all_characters' || token === '全部'
}

const resolveCharacterIdByIdentifier = (rawIdentifier) => {
  const token = normalizeMatchToken(rawIdentifier)
  if (!token) return ''

  const characters = Array.isArray(activeBook.value?.characters) ? activeBook.value.characters : []
  for (const char of characters) {
    const id = normalizeText(char?.id)
    if (!id) continue

    const aliases = [char?.id, char?.name, char?.nickname]
      .map((item) => normalizeMatchToken(item))
      .filter(Boolean)
    if (aliases.includes(token)) {
      return id
    }
  }

  return ''
}

const resolveDirectorTargetCharacter = (rawTarget) => {
  if (isAllCharactersTarget(rawTarget)) {
    return '*'
  }
  return resolveCharacterIdByIdentifier(rawTarget)
}

const doesMetricMeetBounds = (value, min, max) => {
  if (Number.isFinite(min) && value < min) return false
  if (Number.isFinite(max) && value > max) return false
  return true
}

const doesSceneConditionMatch = (scenes) => {
  const normalizedScenes = Array.isArray(scenes)
    ? scenes.map((item) => normalizeMatchToken(item)).filter(Boolean)
    : []
  if (normalizedScenes.length === 0) return true

  const currentSceneTokens = new Set([
    normalizeMatchToken(currentSceneName.value),
    normalizeMatchToken(resolveSceneName(currentLine.value?.scene)),
    normalizeMatchToken(currentLine.value?.scene?.id),
    normalizeMatchToken(currentLine.value?.scene?.name),
    normalizeMatchToken(currentLine.value?.scene),
  ].filter(Boolean))

  return normalizedScenes.some((sceneName) => currentSceneTokens.has(sceneName))
}

const doesRelationshipRuleMatch = (rule, runtimeState) => {
  const targetKey =
    resolveDirectorTargetCharacter(rule?.characterId) ||
    resolveDirectorTargetCharacter(rule?.characterName) ||
    resolveDirectorTargetCharacter(rule?.target)

  const stateSource = mergeRelationshipStateWithBook(activeBook.value, runtimeState)

  const verifyMetrics = (metrics) => {
    return (
      doesMetricMeetBounds(metrics.favor, rule?.favorMin, rule?.favorMax) &&
      doesMetricMeetBounds(metrics.trust, rule?.trustMin, rule?.trustMax) &&
      doesMetricMeetBounds(metrics.stance, rule?.stanceMin, rule?.stanceMax)
    )
  }

  if (targetKey === '*') {
    return Object.values(stateSource).every((metrics) => verifyMetrics(normalizeRelationshipBase(metrics)))
  }

  if (!targetKey) return false

  const metrics = normalizeRelationshipBase(stateSource[targetKey] || createDefaultRelationshipBase())
  return verifyMetrics(metrics)
}

const doesDirectorConditionMatch = (condition, context) => {
  const lineNumber = currentLineIndex.value + 1
  if (Number.isFinite(condition?.minLine) && lineNumber < condition.minLine) return false
  if (Number.isFinite(condition?.maxLine) && lineNumber > condition.maxLine) return false
  if (!doesSceneConditionMatch(condition?.scenes)) return false

  const choice = context.choiceToApply || null
  const choiceText = normalizeText(choice?.text)
  const choiceAction = normalizeMatchToken(choice?.action)
  const userInput = normalizeMatchToken(context.userInput)

  if (condition?.requireChoice && !choice) return false
  if (condition?.customInputOnly && !choice?.isCustomInput) return false

  if (Array.isArray(condition?.choiceIncludes) && condition.choiceIncludes.length > 0) {
    const normalizedChoiceText = normalizeMatchToken(choiceText)
    if (!normalizedChoiceText) return false
    const matched = condition.choiceIncludes.some((keyword) => {
      const normalizedKeyword = normalizeMatchToken(keyword)
      return normalizedKeyword && normalizedChoiceText.includes(normalizedKeyword)
    })
    if (!matched) return false
  }

  if (Array.isArray(condition?.choiceActions) && condition.choiceActions.length > 0) {
    if (!choiceAction) return false
    const normalizedActions = condition.choiceActions.map((item) => normalizeMatchToken(item)).filter(Boolean)
    if (!normalizedActions.includes(choiceAction)) return false
  }

  if (Array.isArray(condition?.userInputIncludes) && condition.userInputIncludes.length > 0) {
    if (!userInput) return false
    const matched = condition.userInputIncludes.some((keyword) => {
      const normalizedKeyword = normalizeMatchToken(keyword)
      return normalizedKeyword && userInput.includes(normalizedKeyword)
    })
    if (!matched) return false
  }

  if (Array.isArray(condition?.requiredFlags) && condition.requiredFlags.length > 0) {
    const hasMissing = condition.requiredFlags.some((flag) => {
      const flagKey = normalizeText(flag)
      return flagKey && !context.directorRuntime.flags[flagKey]
    })
    if (hasMissing) return false
  }

  if (Array.isArray(condition?.blockedFlags) && condition.blockedFlags.length > 0) {
    const hasBlocked = condition.blockedFlags.some((flag) => {
      const flagKey = normalizeText(flag)
      return flagKey && context.directorRuntime.flags[flagKey]
    })
    if (hasBlocked) return false
  }

  if (Array.isArray(condition?.relationship) && condition.relationship.length > 0) {
    const allMatched = condition.relationship.every((rule) => doesRelationshipRuleMatch(rule, context.relationshipRuntime))
    if (!allMatched) return false
  }

  return true
}

const applyRelationshipDelta = (metrics, delta) => {
  const base = normalizeRelationshipBase(metrics || createDefaultRelationshipBase())
  return normalizeRelationshipBase({
    favor: base.favor + (Number.isFinite(delta?.favor) ? delta.favor : 0),
    trust: base.trust + (Number.isFinite(delta?.trust) ? delta.trust : 0),
    stance: base.stance + (Number.isFinite(delta?.stance) ? delta.stance : 0),
  })
}

const applyDirectorRelationshipDeltas = (sourceState, deltas) => {
  const nextState = mergeRelationshipStateWithBook(activeBook.value, sourceState)
  const characterKeys = Object.keys(nextState)

  for (const delta of deltas) {
    const targetKey =
      resolveDirectorTargetCharacter(delta?.target) ||
      resolveDirectorTargetCharacter(delta?.characterId) ||
      resolveDirectorTargetCharacter(delta?.characterName)

    if (targetKey === '*') {
      for (const key of characterKeys) {
        nextState[key] = applyRelationshipDelta(nextState[key], delta)
      }
      continue
    }

    if (!targetKey) continue
    nextState[targetKey] = applyRelationshipDelta(nextState[targetKey], delta)
  }

  return nextState
}

const collectDirectorDirectives = (event) => {
  const directives = []
  const eventTag = normalizeText(event?.name || event?.id || '导演事件')

  const pushDirective = (value) => {
    const text = normalizeText(value)
    if (!text) return
    directives.push(`${eventTag}: ${text}`)
  }

  pushDirective(event?.promptHint)
  for (const item of Array.isArray(event?.promptDirectives) ? event.promptDirectives : []) {
    pushDirective(item)
  }
  pushDirective(event?.effects?.promptHint)
  for (const item of Array.isArray(event?.effects?.promptDirectives) ? event.effects.promptDirectives : []) {
    pushDirective(item)
  }

  return directives
}

const evaluateDirectorEventsPreview = ({ choiceToApply = null, userInput = '' } = {}) => {
  const events = normalizeDirectorEvents(activeBook.value?.directorEvents)
  const currentDirectorRuntime = normalizeDirectorRuntimeState(directorState.value)
  let nextDirectorRuntime = {
    triggeredEventIds: [...currentDirectorRuntime.triggeredEventIds],
    flags: { ...currentDirectorRuntime.flags },
  }
  let nextRelationshipRuntime = mergeRelationshipStateWithBook(activeBook.value, relationshipState.value)

  const directives = []
  const triggeredEventNames = []
  let changed = false

  for (const event of events) {
    if (event?.enabled === false) continue

    const eventId = normalizeText(event?.id)
    if (event?.once && eventId && nextDirectorRuntime.triggeredEventIds.includes(eventId)) {
      continue
    }

    const matched = doesDirectorConditionMatch(event?.condition, {
      choiceToApply,
      userInput,
      relationshipRuntime: nextRelationshipRuntime,
      directorRuntime: nextDirectorRuntime,
    })
    if (!matched) continue

    changed = true
    triggeredEventNames.push(normalizeText(event?.name || eventId || '导演事件'))
    directives.push(...collectDirectorDirectives(event))

    const deltas = Array.isArray(event?.effects?.relationshipDeltas)
      ? event.effects.relationshipDeltas
      : []
    if (deltas.length > 0) {
      nextRelationshipRuntime = applyDirectorRelationshipDeltas(nextRelationshipRuntime, deltas)
    }

    const setFlags = Array.isArray(event?.effects?.setFlags) ? event.effects.setFlags : []
    for (const rawFlag of setFlags) {
      const flag = normalizeText(rawFlag)
      if (!flag) continue
      nextDirectorRuntime.flags[flag] = true
    }

    const clearFlags = Array.isArray(event?.effects?.clearFlags) ? event.effects.clearFlags : []
    for (const rawFlag of clearFlags) {
      const flag = normalizeText(rawFlag)
      if (!flag) continue
      nextDirectorRuntime.flags[flag] = false
    }

    if (event?.once && eventId && !nextDirectorRuntime.triggeredEventIds.includes(eventId)) {
      nextDirectorRuntime.triggeredEventIds.push(eventId)
    }
  }

  nextDirectorRuntime = normalizeDirectorRuntimeState(nextDirectorRuntime)
  nextRelationshipRuntime = mergeRelationshipStateWithBook(activeBook.value, nextRelationshipRuntime)

  return {
    changed,
    directives,
    triggeredEventNames,
    relationshipState: nextRelationshipRuntime,
    directorState: nextDirectorRuntime,
  }
}

const resolvePortraitStyle = (rawStyle) => {
  const style = String(rawStyle || '').trim()
  if (style === 'half_body' || style === 'full_body' || style === 'leg_body' || style === 'card') {
    return style
  }
  return 'card'
}

const portraitStyle = computed(() => resolvePortraitStyle(activeBook.value?.displaySettings?.portraitStyle))
const portraitStyleClass = computed(() => {
  if (portraitStyle.value === 'half_body') return 'portrait-style-half-body'
  if (portraitStyle.value === 'full_body') return 'portrait-style-full-body'
  if (portraitStyle.value === 'leg_body') return 'portrait-style-leg-body'
  return 'portrait-style-card'
})

// 加载世界书数据
const loadWorldBookData = async () => {
  worldBooks.value = await loadWorldBooks()
}

const loadNarratorData = async () => {
  narratorProfiles.value = await loadNarratorProfiles()
}

const applyBackgroundAssetsFromActiveBook = async () => {
  const assets = Array.isArray(activeBook.value?.backgroundAssets) ? activeBook.value.backgroundAssets : []
  if (assets.length > 0) {
    await applyWorldBookBackgroundAssets(
      assets,
      `世界书背景：${String(activeBook.value?.title || '未命名世界书')}`,
    )
    return
  }

  await loadBackgroundFolder()
}

// 根据角色ID获取角色数据（支持 USER 和 Char）
const getCharacterData = (characterId) => {
  if (!activeBook.value) return null

  // USER 角色（lead/你）
  if (characterId === 'lead' || characterId === 'user') {
    return activeBook.value.userProfile
  }

  const characters = Array.isArray(activeBook.value.characters) ? activeBook.value.characters : []

  if (typeof characterId === 'string' && characterId.startsWith('char_')) {
    const slotIndex = Number.parseInt(characterId.slice(5), 10)
    if (Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < characters.length) {
      return characters[slotIndex]
    }
  }

  // 其他角色：根据名称或ID匹配
  const character = characters.find(
    (char) => char.id === characterId || char.name === characterId || char.nickname === characterId,
  )
  if (character) {
    return character
  }

  // 场景槽位回退（适配世界书动态角色ID）
  if (characterId === 'eve') {
    return characters[0] || null
  }
  if (characterId === 'zero') {
    return characters[1] || characters[0] || null
  }

  return null
}

const resolveVoiceCharacterBySpeaker = (speakerName) => {
  const speaker = normalizeText(speakerName)
  if (!speaker || speaker === '旁白') return null

  const book = activeBook.value
  if (!book) return null

  const userAliases = [book.userProfile?.name, book.userProfile?.nickname, '你', '玩家', '主角']
    .map((item) => normalizeText(item))
    .filter(Boolean)
  if (userAliases.includes(speaker)) {
    return null
  }

  const matchedChar = (book.characters || []).find((char) => {
    const aliases = [char?.name, char?.nickname, char?.id]
      .map((item) => normalizeText(item))
      .filter(Boolean)
    return aliases.includes(speaker)
  })

  if (!matchedChar) return null

  return {
    id: normalizeText(matchedChar.id),
    name: normalizeText(matchedChar.name) || speaker,
    voiceConfig: normalizeCharacterVoiceConfig(matchedChar.voiceConfig || {}),
  }
}

const currentLineVoiceCharacter = computed(() => resolveVoiceCharacterBySpeaker(currentLine.value?.speaker))
const isCurrentCharacterLine = computed(() => Boolean(currentLineVoiceCharacter.value))
const canSpeakCurrentLine = computed(() => {
  const lineText = normalizeText(currentLine.value?.text)
  if (!lineText) return false
  const voiceConfig = currentLineVoiceCharacter.value?.voiceConfig
  if (!voiceConfig || voiceConfig.enabled !== true) return false
  return normalizeText(voiceConfig.voiceId) !== ''
})

const currentLineSpeakButtonTitle = computed(() => {
  if (!isCurrentCharacterLine.value) return ''
  if (isTtsGenerating.value) return '正在生成语音...'
  if (isTtsPlaying.value) return '点击停止播放'
  if (!currentLineVoiceCharacter.value) return '当前说话角色未在世界书 CHAR 中找到'
  if (!currentLineVoiceCharacter.value.voiceConfig?.enabled) return '请在 CHAR 设定中开启该角色语音'
  if (!currentLineVoiceCharacter.value.voiceConfig?.voiceId) return '请在 CHAR 设定中填写 voice_id'
  return '播放当前台词'
})

const currentLineSaveButtonTitle = computed(() => {
  if (!isCurrentCharacterLine.value) return ''
  if (isTtsSaving.value) return '正在保存语音...'
  if (isTtsGenerating.value) return '语音生成中，请稍后'
  if (!currentLineVoiceCharacter.value) return '当前说话角色未在世界书 CHAR 中找到'
  if (!currentLineVoiceCharacter.value.voiceConfig?.enabled) return '请在 CHAR 设定中开启该角色语音'
  if (!currentLineVoiceCharacter.value.voiceConfig?.voiceId) return '请在 CHAR 设定中填写 voice_id'
  return '保存当前台词语音到本地'
})

const updateTtsStatus = (message = '', type = 'info') => {
  ttsStatusMessage.value = String(message || '').trim()
  ttsStatusType.value = type === 'error' ? 'error' : 'info'
}

const cloneAudioBytes = (bytes) => {
  if (!bytes) return null
  try {
    return new Uint8Array(bytes)
  } catch {
    return null
  }
}

const setCachedLineAudio = ({ lineKey, audioBytes, mimeType, format }) => {
  const cloned = cloneAudioBytes(audioBytes)
  if (!lineKey || !cloned || cloned.length === 0) return

  ttsCachedLineKey.value = String(lineKey)
  ttsCachedAudioBytes.value = cloned
  ttsCachedMimeType.value = String(mimeType || 'audio/mpeg').trim() || 'audio/mpeg'
  ttsCachedFormat.value = String(format || 'mp3').trim().toLowerCase() || 'mp3'
}

const getCachedLineAudio = (lineKey) => {
  if (!lineKey || ttsCachedLineKey.value !== String(lineKey)) return null
  const cloned = cloneAudioBytes(ttsCachedAudioBytes.value)
  if (!cloned || cloned.length === 0) return null

  return {
    audioBytes: cloned,
    mimeType: ttsCachedMimeType.value || 'audio/mpeg',
    format: ttsCachedFormat.value || 'mp3',
  }
}

const getLineTtsKey = (lineIndex, line) => {
  const safeIndex = Number.isInteger(lineIndex) && lineIndex >= 0 ? lineIndex : 0
  return `${safeIndex}:${normalizeText(line?.speaker)}:${normalizeText(line?.text)}`
}

const resolveLineVoiceContext = (line, lineIndex, options = {}) => {
  const silent = Boolean(options?.silent)
  const speaker = normalizeText(line?.speaker)
  const lineText = normalizeText(line?.text)
  if (!speaker || speaker === '旁白' || !lineText) {
    if (!silent) {
      updateTtsStatus('旁白或空台词不支持语音播放。', 'error')
    }
    return null
  }

  const voiceCharacter = resolveVoiceCharacterBySpeaker(speaker)
  const voiceConfig = voiceCharacter?.voiceConfig
  if (!voiceCharacter || !voiceConfig || !voiceConfig.enabled) {
    if (!silent) {
      updateTtsStatus('该角色未开启语音，请到 CHAR 设定中启用。', 'error')
    }
    return null
  }
  if (!voiceConfig.voiceId) {
    if (!silent) {
      updateTtsStatus('该角色缺少 voice_id，请到 CHAR 设定补充。', 'error')
    }
    return null
  }

  return {
    line,
    speaker,
    lineText,
    voiceCharacter,
    voiceConfig,
    currentLineKey: getLineTtsKey(lineIndex, line),
  }
}

const canSpeakDialogueLine = (line, lineIndex = -1) => {
  return Boolean(resolveLineVoiceContext(line, lineIndex, { silent: true }))
}

const dialogueHistoryFromCurrentStart = computed(() => {
  const script = Array.isArray(dialogueScript.value) ? dialogueScript.value : []
  if (script.length === 0) {
    return []
  }

  const maxIndex = Math.min(Math.max(currentLineIndex.value, 0), script.length - 1)
  return script.slice(0, maxIndex + 1).map((line, lineIndex) => ({
    line,
    lineIndex,
    lineKey: getLineTtsKey(lineIndex, line),
    speaker: normalizeText(line?.speaker) || '旁白',
    text: normalizeText(line?.text) || '...',
    canSpeak: canSpeakDialogueLine(line, lineIndex),
  }))
})

const visibleDialogueHistory = computed(() => {
  const fullHistory = dialogueHistoryFromCurrentStart.value
  if (fullHistory.length === 0) {
    return []
  }
  const count = Math.min(historyVisibleCount.value, fullHistory.length)
  return fullHistory.slice(fullHistory.length - count)
})

const hasMoreHistoryDialogues = computed(() => {
  return visibleDialogueHistory.value.length < dialogueHistoryFromCurrentStart.value.length
})

const scrollHistoryToBottom = () => {
  const container = historyBodyRef.value
  if (!container) return
  container.scrollTop = container.scrollHeight
}

const resetHistoryDialoguesViewport = async () => {
  const total = dialogueHistoryFromCurrentStart.value.length
  historyVisibleCount.value = Math.min(HISTORY_DIALOGUE_PAGE_SIZE, total || HISTORY_DIALOGUE_PAGE_SIZE)
  await nextTick()
  scrollHistoryToBottom()
}

const toggleDialogueHistoryPanel = async () => {
  const nextVisible = !showDialogueHistoryPanel.value
  showDialogueHistoryPanel.value = nextVisible
  if (!nextVisible) {
    return
  }
  await resetHistoryDialoguesViewport()
}

const closeDialogueHistoryPanel = () => {
  showDialogueHistoryPanel.value = false
}

const handleHistoryBodyScroll = async () => {
  if (!showDialogueHistoryPanel.value || isHistoryPrepending.value) {
    return
  }

  const container = historyBodyRef.value
  if (!container) {
    return
  }
  if (container.scrollTop > HISTORY_DIALOGUE_PRELOAD_THRESHOLD) {
    return
  }
  if (!hasMoreHistoryDialogues.value) {
    return
  }

  const prevHeight = container.scrollHeight
  const prevTop = container.scrollTop
  const total = dialogueHistoryFromCurrentStart.value.length

  isHistoryPrepending.value = true
  try {
    historyVisibleCount.value = Math.min(total, historyVisibleCount.value + HISTORY_DIALOGUE_PAGE_SIZE)
    await nextTick()
    const heightDelta = container.scrollHeight - prevHeight
    container.scrollTop = prevTop + Math.max(0, heightDelta)
  } finally {
    isHistoryPrepending.value = false
  }
}

const isHistoryLinePlaying = (lineKey) => {
  return isTtsPlaying.value && ttsPlayingLineKey.value === String(lineKey || '')
}

const getCurrentLineVoiceContext = () => {
  return resolveLineVoiceContext(currentLine.value, currentLineIndex.value)
}

const requestLineVoiceAudio = async (voiceContext) => {
  const result = await generateCharacterSpeech({
    text: voiceContext.lineText,
    emotion: normalizeText(voiceContext.line?.emotion),
    voiceConfig: voiceContext.voiceConfig,
  })

  if (!result.success || !result.audioBytes) {
    return {
      success: false,
      error: result.error || '语音生成失败。',
      audioBytes: null,
      mimeType: '',
      format: '',
    }
  }

  const audioBytes = cloneAudioBytes(result.audioBytes)
  if (!audioBytes || audioBytes.length === 0) {
    return {
      success: false,
      error: '语音数据为空。',
      audioBytes: null,
      mimeType: '',
      format: '',
    }
  }

  const payload = {
    success: true,
    error: '',
    audioBytes,
    mimeType: String(result.mimeType || 'audio/mpeg').trim() || 'audio/mpeg',
    format: String(result.format || 'mp3').trim().toLowerCase() || 'mp3',
  }

  setCachedLineAudio({
    lineKey: voiceContext.currentLineKey,
    audioBytes: payload.audioBytes,
    mimeType: payload.mimeType,
    format: payload.format,
  })

  return payload
}

const bytesToBase64 = (bytes) => {
  const payload = cloneAudioBytes(bytes)
  if (!payload || payload.length === 0) return ''

  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  try {
    return btoa(binary)
  } catch {
    return ''
  }
}

const MAX_TTS_FILENAME_TEXT_LENGTH = 30

const sanitizeDialogueTextForFilename = (value, fallback = '语音') => {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/g, '')

  const truncated = normalized.slice(0, MAX_TTS_FILENAME_TEXT_LENGTH).trim()
  let safeName = String(truncated || fallback).trim().replace(/[. ]+$/g, '')
  if (!safeName) {
    safeName = fallback
  }

  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safeName)) {
    safeName = `${fallback}_${safeName}`
  }

  return safeName
}

const resolveTtsFileExtension = (format, mimeType) => {
  const normalizedFormat = String(format || '').trim().toLowerCase()
  if (normalizedFormat === 'wav' || normalizedFormat === 'flac' || normalizedFormat === 'mp3') {
    return normalizedFormat
  }

  const normalizedMime = String(mimeType || '').trim().toLowerCase()
  if (normalizedMime.includes('wav')) return 'wav'
  if (normalizedMime.includes('flac')) return 'flac'
  return 'mp3'
}

const buildTtsFilename = (voiceContext, extension) => {
  const textBasedName = sanitizeDialogueTextForFilename(voiceContext?.lineText || currentLine.value?.text || '', '语音')
  return `${textBasedName}.${extension}`
}

const releaseTtsObjectUrl = () => {
  if (ttsObjectUrl.value) {
    try {
      URL.revokeObjectURL(ttsObjectUrl.value)
    } catch {
      // no-op
    }
    ttsObjectUrl.value = ''
  }
}

const stopCurrentTtsPlayback = () => {
  const audio = ttsAudioInstance.value
  if (audio) {
    try {
      audio.pause()
      audio.currentTime = 0
    } catch {
      // no-op
    }
  }
  ttsAudioInstance.value = null
  isTtsPlaying.value = false
  ttsPlayingLineKey.value = ''
  releaseTtsObjectUrl()
}

const playLineVoiceByContext = async (voiceContext) => {
  if (!voiceContext || isTtsGenerating.value) return
  if (isTtsPlaying.value && ttsPlayingLineKey.value === voiceContext.currentLineKey) {
    stopCurrentTtsPlayback()
    updateTtsStatus('已停止语音播放。')
    return
  }

  stopCurrentTtsPlayback()

  try {
    let audioPayload = getCachedLineAudio(voiceContext.currentLineKey)
    if (!audioPayload) {
      isTtsGenerating.value = true
      updateTtsStatus('正在生成语音...')
      const generated = await requestLineVoiceAudio(voiceContext)
      if (!generated.success || !generated.audioBytes) {
        updateTtsStatus(generated.error || '语音生成失败。', 'error')
        return
      }
      audioPayload = generated
    }

    const blob = new Blob([audioPayload.audioBytes], {
      type: audioPayload.mimeType || 'audio/mpeg',
    })
    const objectUrl = URL.createObjectURL(blob)
    const audio = new Audio(objectUrl)

    ttsObjectUrl.value = objectUrl
    ttsAudioInstance.value = audio
    ttsPlayingLineKey.value = voiceContext.currentLineKey

    audio.onended = () => {
      isTtsPlaying.value = false
      ttsPlayingLineKey.value = ''
      releaseTtsObjectUrl()
      ttsAudioInstance.value = null
      updateTtsStatus('语音播放完成。')
    }
    audio.onerror = () => {
      stopCurrentTtsPlayback()
      updateTtsStatus('语音播放失败。', 'error')
    }

    await audio.play()
    isTtsPlaying.value = true
    updateTtsStatus('正在播放语音...')
  } catch (error) {
    stopCurrentTtsPlayback()
    updateTtsStatus(`语音播放失败：${error?.message || '未知错误'}`, 'error')
  } finally {
    isTtsGenerating.value = false
  }
}

const handlePlayCurrentLineVoice = async () => {
  const voiceContext = getCurrentLineVoiceContext()
  if (!voiceContext) return
  await playLineVoiceByContext(voiceContext)
}

const handlePlayHistoryLineVoice = async (historyItem) => {
  const item = historyItem && typeof historyItem === 'object' ? historyItem : null
  if (!item?.line) return

  const voiceContext = resolveLineVoiceContext(item.line, item.lineIndex)
  if (!voiceContext) return
  await playLineVoiceByContext(voiceContext)
}

const handleSaveCurrentLineVoice = async () => {
  if (isTtsSaving.value) return

  const voiceContext = getCurrentLineVoiceContext()
  if (!voiceContext) return

  isTtsSaving.value = true
  let shouldResetGenerating = false

  try {
    let audioPayload = getCachedLineAudio(voiceContext.currentLineKey)
    if (!audioPayload) {
      shouldResetGenerating = true
      isTtsGenerating.value = true
      updateTtsStatus('正在生成语音...')
      const generated = await requestLineVoiceAudio(voiceContext)
      if (!generated.success || !generated.audioBytes) {
        updateTtsStatus(generated.error || '语音生成失败。', 'error')
        return
      }
      audioPayload = generated
    }

    const extension = resolveTtsFileExtension(audioPayload.format, audioPayload.mimeType)
    const filename = buildTtsFilename(voiceContext, extension)

    if (isNative()) {
      const base64Payload = bytesToBase64(audioPayload.audioBytes)
      if (!base64Payload) {
        updateTtsStatus('保存失败：语音数据编码失败。', 'error')
        return
      }

      await Filesystem.writeFile({
        path: `avg_llm_voice/${filename}`,
        data: base64Payload,
        directory: Directory.Documents,
        recursive: true,
      })
      updateTtsStatus(`已保存到 Documents/avg_llm_voice/${filename}`)
      return
    }

    const blob = new Blob([audioPayload.audioBytes], {
      type: audioPayload.mimeType || 'audio/mpeg',
    })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(objectUrl)
    updateTtsStatus(`已保存 ${filename}`)
  } catch (error) {
    updateTtsStatus(`保存失败：${error?.message || '未知错误'}`, 'error')
  } finally {
    isTtsSaving.value = false
    if (shouldResetGenerating) {
      isTtsGenerating.value = false
    }
  }
}

// 根据角色ID和情绪获取对应立绘
const getCharacterPortrait = (characterId, emotion = 'default') => {
  const characterData = getCharacterData(characterId)
  if (!characterData?.portraits?.length) return null

  // 按情绪精确匹配
  const matchedPortrait = characterData.portraits.find((p) => p.emotion === emotion)
  if (matchedPortrait) return matchedPortrait

  // 回退到默认立绘
  const defaultPortrait = characterData.portraits.find((p) => p.emotion === 'default')
  if (defaultPortrait) return defaultPortrait

  // 使用第一个立绘作为最终回退
  return characterData.portraits[0]
}

// 默认立绘路径
const DEFAULT_PORTRAIT_PATH = './data/lihui/default.png'

// 获取立绘图片 URL（通过 Electron API）
const getPortraitImageUrl = async (portrait) => {
  // 如果没有立绘，返回默认立绘
  if (!portrait?.filePath) {
    return getDefaultPortraitUrl()
  }

  // Android/Web 下的 data URL 立绘直接使用
  if (portrait.filePath.startsWith('data:image')) {
    return portrait.filePath
  }

  // 图床 URL 直接使用
  if (portrait.filePath.startsWith('http://') || portrait.filePath.startsWith('https://')) {
    return portrait.filePath
  }

  // 检查缓存
  if (portraitImageCache.value.has(portrait.filePath)) {
    return portraitImageCache.value.get(portrait.filePath)
  }

  // Electron 环境：读取文件为 Base64
  if (window.avgLLM?.file?.readImage) {
    try {
      const result = await window.avgLLM.file.readImage(portrait.filePath)
      if (result?.base64) {
        const url = `data:${result.mimeType};base64,${result.base64}`
        portraitImageCache.value.set(portrait.filePath, url)
        return url
      }
    } catch {
      // 加载失败，返回默认立绘
      return getDefaultPortraitUrl()
    }
  }

  // 非 Electron 环境，返回默认立绘路径
  return getDefaultPortraitUrl()
}

// 获取默认立绘 URL
const getDefaultPortraitUrl = async () => {
  const defaultPath = DEFAULT_PORTRAIT_PATH
  
  // 检查缓存
  if (portraitImageCache.value.has(defaultPath)) {
    return portraitImageCache.value.get(defaultPath)
  }

  // Electron 环境：读取默认立绘为 Base64
  if (window.avgLLM?.file?.readImage) {
    try {
      const result = await window.avgLLM.file.readImage(defaultPath)
      if (result?.base64) {
        const url = `data:${result.mimeType};base64,${result.base64}`
        portraitImageCache.value.set(defaultPath, url)
        return url
      }
    } catch {
      // 默认立绘加载失败，返回空
      console.warn('默认立绘加载失败:', defaultPath)
    }
  }

  // 非 Electron 环境或加载失败，返回相对路径
  return defaultPath
}

// 获取角色当前应显示的情绪
const getDisplayEmotion = (characterId) => {
  // 当前说话的角色显示对话情绪
  const speakerId = resolveSpeakerCharacterId(currentLine.value?.speaker)
  if (activeCharacterId.value === characterId && speakerId === characterId) {
    return currentLine.value?.emotion || 'default'
  }
  // 非说话角色显示默认表情
  return 'default'
}

// ========== LLM 剧情生成功能 ==========

// 生成剧情
const handleGenerateStory = async (choiceToApply = null, options = {}) => {
  if (isGenerating.value) return

  isGenerating.value = true
  generateError.value = null

  try {
    await persistLlmSettings()

    const overrideUserInput = String(options?.overrideUserInput || '').trim()
    const effectiveUserInput = overrideUserInput || userPromptInput.value

    const directorPreview = evaluateDirectorEventsPreview({
      choiceToApply,
      userInput: effectiveUserInput,
    })
    const relationshipSnapshot = buildRelationshipSnapshotForPrompt(directorPreview.relationshipState)

    // 在范围内随机生成消息条数
    const actualMessageCount = getRandomMessageCount()
    
    // 构建 Prompt（包含随机消息条数和选择的选项）
    const prompt = buildStoryPrompt({
      worldBook: activeBook.value,
      narratorProfile: effectiveNarrator.value,
      dialogueHistory: dialogueScript.value.slice(0, currentLineIndex.value + 1),
      currentLine: currentLine.value,
      sceneCharacters: sceneCharacters.value,
      userInput: effectiveUserInput,
      messageCount: actualMessageCount,
      selectedChoice: choiceToApply,
      contextLineCount: storyContextLineCount.value,
      relationshipSnapshot,
      directorDirectives: directorPreview.directives,
    })

    // 调用 LLM API
    const result = await generateStory(prompt, {
      maxTokens: storyMaxTokens.value,
    })

    if (!result.success) {
      generateError.value = result.error
      return
    }

    // 解析返回内容
    const parsed = parseStoryContent(result.data)

    if (!parsed.success) {
      generateError.value = parsed.error
      return
    }

    if (directorPreview.changed) {
      relationshipState.value = directorPreview.relationshipState
      directorState.value = directorPreview.directorState
    }

    // 转换为游戏脚本格式并添加到对话列表
    const newDialogues = toGameScript(parsed.dialogues)
    
    if (newDialogues.length > 0) {
      // 添加新对话到脚本末尾，并清理历史选项
      const mergedScript = [...dialogueScript.value, ...newDialogues]
      const normalizedScript = normalizeDialogueChoicesForHistory(mergedScript)
      dialogueScript.value = normalizedScript
      
      // 自动跳转到第一条新对话
      currentLineIndex.value = normalizedScript.length - newDialogues.length
      
      // 清空用户输入和选择状态
      userPromptInput.value = ''
      selectedChoice.value = null
      customInputText.value = ''
      
      // 关闭生成面板和选项面板
      showGeneratePanel.value = false
      showChoicesPanel.value = false
      currentChoices.value = null
      
      // 检查最后一条对话是否有选项
      const lastDialogue = normalizedScript[normalizedScript.length - 1]
      if (hasChoices(lastDialogue)) {
        currentChoices.value = extractChoices(lastDialogue)
        showChoicesPanel.value = true
      }
    }
  } catch (err) {
    generateError.value = `生成失败: ${err.message}`
  } finally {
    isGenerating.value = false
  }
}

// ========== 选项处理功能 ==========

// 处理用户选择选项
const handleSelectChoice = async (option) => {
  // 设置选择的选项
  selectedChoice.value = {
    text: option.text,
    action: option.action,
    isCustomInput: false,
  }
  
  // 关闭选项面板
  showChoicesPanel.value = false
  
  // 自动生成后续剧情
  await handleGenerateStory(selectedChoice.value)
}

// 处理用户自定义输入
const handleCustomInput = async () => {
  if (!customInputText.value.trim()) return
  
  // 设置选择的选项（自定义输入）
  selectedChoice.value = {
    text: customInputText.value.trim(),
    action: 'custom_input',
    isCustomInput: true,
  }
  
  // 关闭选项面板
  showChoicesPanel.value = false
  
  // 自动生成后续剧情
  await handleGenerateStory(selectedChoice.value)
}

// 检查当前对话是否有选项
const checkCurrentDialogueChoices = () => {
  if (hasChoices(currentLine.value)) {
    currentChoices.value = extractChoices(currentLine.value)
    // 进入含选项台词时先展示台词，下一次点击再弹出选项
    showChoicesPanel.value = false
  } else {
    currentChoices.value = null
    showChoicesPanel.value = false
  }
}

// 切换生成面板显示
const toggleGeneratePanel = async () => {
  if (!showGeneratePanel.value) {
    closeDialogueHistoryPanel()
    await loadApiConfigStatus()
  }

  showGeneratePanel.value = !showGeneratePanel.value
  if (!showGeneratePanel.value) {
    generateError.value = null
    userPromptInput.value = ''
  }
}

// 检查是否有 API 配置
const hasApiConfig = ref(false)

// 加载 API 配置状态
const loadApiConfigStatus = async () => {
  try {
    const activeId = await kvStorage.get('active_api_id')
    if (!activeId) {
      hasApiConfig.value = false
      return
    }

    const configs = await kvStorage.get('api_configs')
    hasApiConfig.value = Array.isArray(configs) && configs.some((item) => item?.id === activeId)
  } catch {
    hasApiConfig.value = false
  }
}

// ========== CG 生成功能 ==========

const showCgStatus = (message, type = 'info', duration = 3200) => {
  cgStatusMessage.value = String(message || '').trim()
  cgStatusType.value = type

  if (cgStatusTimer) {
    clearTimeout(cgStatusTimer)
    cgStatusTimer = null
  }

  if (!cgStatusMessage.value || duration <= 0) return
  cgStatusTimer = setTimeout(() => {
    cgStatusMessage.value = ''
    cgStatusType.value = 'info'
    cgStatusTimer = null
  }, duration)
}

const extractBase64Payload = (rawData) => {
  const normalized = String(rawData || '').trim()
  if (!normalized) return ''
  if (normalized.startsWith('data:')) {
    const commaIndex = normalized.indexOf(',')
    if (commaIndex >= 0) {
      return normalized.slice(commaIndex + 1)
    }
  }
  return normalized
}

const resolveGeneratedCgDataUrl = async () => {
  const source = String(generatedCG.value?.base64 || generatedCG.value?.url || '').trim()
  if (!source) return ''
  if (source.startsWith('data:')) return source

  try {
    return await getImageBase64(source)
  } catch {
    return ''
  }
}

const handleRequestCgSceneSummary = async () => {
  if (isCgSummarizing.value || isCgGenerating.value) return

  await persistLlmSettings()
  await loadApiConfigStatus()

  if (!hasApiConfig.value) {
    cgSummaryError.value = '请先在设置中配置并应用 API'
    return
  }

  cgSummaryError.value = ''
  isCgSummarizing.value = true

  try {
    const result = await generateCgPrompt({
      worldBook: activeBook.value,
      narratorProfile: effectiveNarrator.value,
      dialogueHistory: dialogueScript.value.slice(0, currentLineIndex.value + 1),
      currentLine: currentLine.value,
      sceneName: currentSceneName.value,
      contextLineCount: storyContextLineCount.value,
      maxTokens: storyMaxTokens.value,
    })

    if (!result.success || !result.prompt) {
      cgSummaryError.value = result.error || '场景总结失败'
      return
    }

    cgSummaryResult.value = {
      ...result.prompt,
      updatedAt: Date.now(),
    }
  } catch (error) {
    cgSummaryError.value = `场景总结失败: ${error?.message || '未知错误'}`
  } finally {
    isCgSummarizing.value = false
  }
}

const handleCGGenerateRequest = async (rawRequest) => {
  if (isCgGenerating.value) return
  if (isGenerating.value) {
    showCgStatus('剧情正在生成中，请稍后再生图。', 'error', 3600)
    return
  }

  const request = rawRequest && typeof rawRequest === 'object' ? rawRequest : {}
  const positivePrompt = String(request.positivePrompt || '').trim()
  if (!positivePrompt) {
    cgSummaryError.value = '提示词为空，请先输入提示词或点击“总结当前场景”'
    return
  }

  cgSummaryError.value = ''
  showCGModal.value = false
  showCGResultPanel.value = false
  isCgGenerating.value = true

  try {
    const result = await generateCG({
      ...request,
      positivePrompt,
      negativePrompt: String(request.negativePrompt || '').trim(),
    })

    if (!result.success || !result.image) {
      showCgStatus(result.error || 'CG 生成失败', 'error', 4600)
      return
    }

    let imageUrl = String(result.image.url || '').trim()
    let imageBase64 = String(result.image.base64 || '').trim()

    if (imageBase64 && !imageBase64.startsWith('data:')) {
      imageBase64 = `data:image/png;base64,${imageBase64}`
    }

    if (!imageBase64 && imageUrl) {
      try {
        imageBase64 = await getImageBase64(imageUrl)
      } catch {
        // no-op
      }
    }

    const finalImageUrl = imageBase64 || imageUrl
    if (!finalImageUrl) {
      showCgStatus('CG 生成完成，但未获取到图片地址。', 'error', 4600)
      return
    }

    generatedCG.value = {
      ...result.image,
      url: finalImageUrl,
      base64: imageBase64 || finalImageUrl,
      positivePrompt,
      negativePrompt: String(request.negativePrompt || '').trim(),
      sceneSummary: String(
        request.sceneSummary ||
        cgSummaryResult.value?.sceneSummary ||
        '',
      ).trim(),
    }
    showCGResultPanel.value = true
  } catch (error) {
    showCgStatus(`CG 生成失败: ${error?.message || '未知错误'}`, 'error', 5000)
  } finally {
    isCgGenerating.value = false
  }
}

const handleCloseCGResult = () => {
  showCGResultPanel.value = false
}

const handleSaveGeneratedCG = async () => {
  if (!generatedCG.value) return

  const dataUrl = await resolveGeneratedCgDataUrl()
  if (!dataUrl) {
    showCgStatus('保存失败：图片数据为空。', 'error', 4200)
    return
  }

  const filename = `avg_cg_${Date.now()}.png`

  try {
    if (isNative()) {
      const base64Payload = extractBase64Payload(dataUrl)
      if (!base64Payload) {
        showCgStatus('保存失败：无有效图片数据。', 'error', 4200)
        return
      }

      await Filesystem.writeFile({
        path: `avg_llm_cg/${filename}`,
        data: base64Payload,
        directory: Directory.Documents,
        recursive: true,
      })
      showCgStatus(`已保存到 Documents/avg_llm_cg/${filename}`, 'success', 3800)
      return
    }

    const link = document.createElement('a')
    link.href = dataUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showCgStatus(`已保存 ${filename}`, 'success', 2600)
  } catch (error) {
    showCgStatus(`保存失败: ${error?.message || '未知错误'}`, 'error', 4600)
  }
}

const handleOpenCGModal = () => {
  if (isCgGenerating.value) return
  closeDialogueHistoryPanel()
  cgSummaryError.value = ''
  cgSummaryResult.value = null
  showCGModal.value = true
}

// 立绘图片 URL 状态（用于模板显示）
const portraitUrls = ref({})

// 更新立绘图片 URL
const updatePortraitUrls = async () => {
  for (const character of sceneCharacters.value) {
    const emotion = getDisplayEmotion(character.id)
    const portrait = getCharacterPortrait(character.id, emotion)
    // 无论是否有立绘，都调用 getPortraitImageUrl（它会处理默认立绘）
    const url = await getPortraitImageUrl(portrait)
    portraitUrls.value[character.id] = url
  }
}

const syncActiveCharacterBySpeaker = () => {
  const characterId = resolveSpeakerCharacterId(currentLine.value?.speaker)
  if (characterId) {
    activeCharacterId.value = characterId
  }
  // 更新立绘显示
  updatePortraitUrls()
  // 检查当前对话是否有选项
  checkCurrentDialogueChoices()
}

const goNextLine = () => {
  if (hasChoices(currentLine.value) && !showChoicesPanel.value) {
    if (!currentChoices.value) {
      currentChoices.value = extractChoices(currentLine.value)
    }
    showChoicesPanel.value = true
    return
  }

  if (isLastLine.value) {
    // 最后一句时，打开 AI 生成面板
    if (!showGeneratePanel.value) {
      showGeneratePanel.value = true
    }
    return
  }

  currentLineIndex.value += 1
}

const goPrevLine = () => {
  if (currentLineIndex.value === 0) {
    return
  }

  currentLineIndex.value -= 1
}

const handleBackpackUseRequest = async (event) => {
  const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {}
  const requestWorldId = String(detail.worldBookId || '').trim()
  const requestSaveSlotId = String(detail.saveSlotId || '').trim()
  const currentWorldId = String(activeBookId.value || '').trim()
  const currentSaveSlotId = String(smsSaveScopeId.value || '').trim()

  if (requestWorldId && requestWorldId !== currentWorldId) return
  if (requestSaveSlotId && requestSaveSlotId !== currentSaveSlotId) return
  if (isGenerating.value) return

  await loadApiConfigStatus()
  if (!hasApiConfig.value) {
    generateError.value = '请先在设置中配置并应用 API'
    return
  }

  const itemName = String(detail.itemName || '').trim()
  const promptText = String(detail.promptText || `使用了 ${itemName || '未知物品'}`).trim()
  if (!promptText) return

  showGeneratePanel.value = false
  showChoicesPanel.value = false
  currentChoices.value = null
  selectedChoice.value = null
  customInputText.value = ''

  await handleGenerateStory(null, { overrideUserInput: promptText })
}

const handleMapTravelRequest = async (event) => {
  const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {}
  const requestWorldId = String(detail.worldBookId || '').trim()
  const requestSaveSlotId = String(detail.saveSlotId || '').trim()
  const currentWorldId = String(activeBookId.value || '').trim()
  const currentSaveSlotId = String(smsSaveScopeId.value || '').trim()

  if (requestWorldId && requestWorldId !== currentWorldId) return
  if (requestSaveSlotId && requestSaveSlotId !== currentSaveSlotId) return
  if (isGenerating.value) return

  await loadApiConfigStatus()
  if (!hasApiConfig.value) {
    generateError.value = '请先在设置中配置并应用 API'
    return
  }

  const locationName = String(detail.locationName || detail.locationId || '').trim()
  const promptText = String(
    detail.promptText ||
    `角色已移动到地点「${locationName || '新地点'}」，请继续生成该地点发生的新剧情。`,
  ).trim()
  if (!promptText) return

  if (locationName) {
    updateCurrentSceneName(locationName)
    try {
      await applyBackgroundByLineScene({ scene: locationName }, { allowFallback: false })
    } catch {
      // no-op
    }
  }

  showGeneratePanel.value = false
  showChoicesPanel.value = false
  currentChoices.value = null
  selectedChoice.value = null
  customInputText.value = ''

  await handleGenerateStory(null, { overrideUserInput: promptText })
}

const createSerializableGameData = () => {
  const sanitizedDialogueScript = normalizeDialogueChoicesForHistory(dialogueScript.value)

  return JSON.parse(JSON.stringify({
    metadata: {
      chapter: '第一章',
      scene: '旧图书馆',
      playTime: currentPlayTime.value,
      preview: currentLine.value?.text || '',
    },
    game: {
      worldBookId: activeBookId.value,
      narratorId: activeNarratorIdForSave.value,
      currentLineIndex: currentLineIndex.value,
      dialogueScript: sanitizedDialogueScript,
      llmSettings: getCurrentLlmSettingsPayload(),
      relationshipState: mergeRelationshipStateWithBook(activeBook.value, relationshipState.value),
      directorState: normalizeDirectorRuntimeState(directorState.value),
      sceneCharacters: sceneCharacters.value.map(c => ({
        id: c.id,
        name: c.name,
        role: c.role,
        toneClass: c.toneClass,
        positionClass: c.positionClass,
      })),
    },
  }))
}

const handleDialogueBoxClick = (event) => {
  if (showChoicesPanel.value || isGenerating.value || showSavePanel.value) {
    return
  }

  const target = event?.target
  if (target instanceof Element) {
    const interactiveSelector = [
      '.dialogue-actions',
      'button',
      'a',
      'input',
      'textarea',
      'select',
      'label',
      '[role="button"]',
      '[data-no-advance]',
    ].join(', ')

    if (target.closest(interactiveSelector)) {
      return
    }
  }

  goNextLine()
}

// ========== 存档功能 ==========

// 存档状态
const isSaving = ref(false)
const saveError = ref(null)
const saveSuccess = ref(null)
const showSavePanel = ref(false)
const showTopMenu = ref(false)
const saveSlotName = ref('')
const playStartTime = ref(Date.now()) // 游戏开始时间

// 计算游戏时长（秒）
const currentPlayTime = computed(() => {
  return Math.floor((Date.now() - playStartTime.value) / 1000)
})

const closeTopMenu = () => {
  showTopMenu.value = false
}

const toggleTopMenu = () => {
  showTopMenu.value = !showTopMenu.value
}

// 切换存档面板显示
const toggleSavePanel = () => {
  closeTopMenu()
  closeDialogueHistoryPanel()
  showSavePanel.value = !showSavePanel.value
  if (!showSavePanel.value) {
    saveError.value = null
    saveSuccess.value = null
    saveSlotName.value = ''
  }
}

// 保存游戏进度
const handleSaveGame = async () => {
  if (isSaving.value) return
  
  isSaving.value = true
  saveError.value = null
  saveSuccess.value = null
  
  try {
    const gameData = createSerializableGameData()
    
    const result = await saveGame(gameData)
    
    if (result.success) {
      await syncPhoneSmsScopeAfterSave(result.id)
      saveSuccess.value = `存档成功！时间: ${formatTimestamp(Date.now())}`
      // 自动创建历史备份
      await createHistoryBackup(
        JSON.parse(JSON.stringify(gameData.game.dialogueScript)),
        `自动备份_${formatTimestamp(Date.now())}`,
      )
    } else {
      saveError.value = result.error || '存档失败'
    }
  } catch (error) {
    saveError.value = error.message || '存档失败'
  } finally {
    isSaving.value = false
  }
}

// 快速存档（不显示面板）
const quickSave = async () => {
  if (isSaving.value) return
  
  isSaving.value = true
  
  try {
    const gameData = createSerializableGameData()
    
    const result = await saveGame(gameData)
    
    if (result.success) {
      await syncPhoneSmsScopeAfterSave(result.id)
      // 简短提示
      saveSuccess.value = '快速存档成功！'
      setTimeout(() => {
        saveSuccess.value = null
      }, 2000)
    }
  } catch {
    // 快速存档失败不显示错误
  } finally {
    isSaving.value = false
  }
}

const handleBackFromMenu = () => {
  closeTopMenu()
  emit('back')
}

const handleQuickSaveFromMenu = async () => {
  closeTopMenu()
  await quickSave()
}

const handleToggleSavePanelFromMenu = () => {
  closeTopMenu()
  toggleSavePanel()
}

const handleToggleDialogueHistoryFromMenu = () => {
  closeTopMenu()
  showSavePanel.value = false
  toggleDialogueHistoryPanel()
}

// 加载存档数据
const loadSaveData = async () => {
  if (!(props.saveData && props.saveData.game)) {
    hydrateNarrativeRuntimeState(null)
    await hydrateLlmSettingsForScope(null)
    return
  }

  smsSaveScopeId.value = sanitizeSmsScopeId(props.saveData.__slotId) || createSessionSmsScopeId()

  // 从存档恢复游戏状态
  if (props.saveData.game.dialogueScript && props.saveData.game.dialogueScript.length > 0) {
    dialogueScript.value = normalizeDialogueChoicesForHistory(props.saveData.game.dialogueScript)
  }
  if (props.saveData.game.currentLineIndex !== undefined) {
    currentLineIndex.value = props.saveData.game.currentLineIndex
  }
  if (props.saveData.game.worldBookId) {
    activeBookId.value = props.saveData.game.worldBookId
  }
  if (props.saveData.game.narratorId) {
    sessionNarratorId.value = props.saveData.game.narratorId
  }

  hydrateNarrativeRuntimeState(props.saveData.game)
  await hydrateLlmSettingsForScope(props.saveData.game.llmSettings)

  // 重置游戏开始时间
  playStartTime.value = Date.now() - (props.saveData.metadata?.playTime || 0) * 1000
}

watch(
  () => props.sessionNarratorId,
  (newId) => {
    if (!props.saveData) {
      sessionNarratorId.value = String(newId || '')
    }
  },
)

watch(currentLine, syncActiveCharacterBySpeaker, { immediate: true })

// 监听存档数据变化
watch(() => props.saveData, (newData) => {
  if (newData) {
    void loadSaveData()
  }
}, { immediate: true })

// 监听当前对话变化，切换背景
watch(currentLine, async (newLine) => {
  if (isTtsPlaying.value || ttsPlayingLineKey.value) {
    stopCurrentTtsPlayback()
  }
  updateTtsStatus('')

  // 更新立绘显示
  updatePortraitUrls()
  // 检查当前对话是否有选项
  checkCurrentDialogueChoices()
  // 更新当前场景名称
  updateCurrentSceneName(newLine?.scene)

  // 根据当前对话场景切换背景（支持世界书场景映射）
  await applyBackgroundByLineScene(newLine)
}, { immediate: true })

// 背景样式计算
const backgroundStyle = computed(() => {
  if (!currentBackgroundUrl.value) {
    return {}
  }
  return {
    backgroundImage: `url(${currentBackgroundUrl.value})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }
})

// 是否有自定义背景
const hasCustomBackground = computed(() => {
  return Boolean(currentBackgroundUrl.value)
})

onMounted(async () => {
  await loadApiConfigStatus()
  await loadNarratorData()
  await loadWorldBookData()
  await updatePortraitUrls()
  await applyBackgroundAssetsFromActiveBook()
  
  // 如果有存档数据，加载它
  if (props.saveData) {
    await loadSaveData()
  } else {
    // 新游戏：初始化开场白
    initializeOpeningDialogue()
    hydrateNarrativeRuntimeState(null)
    await hydrateLlmSettingsForScope(null)
  }

  // 确保初始场景背景按世界书配置生效
  await applyBackgroundByLineScene(currentLine.value, { allowFallback: true })

  if (typeof window !== 'undefined') {
    window.addEventListener('backpack-use-request', handleBackpackUseRequest)
    window.addEventListener('phone-map-travel-request', handleMapTravelRequest)
  }
})

onUnmounted(() => {
  stopCurrentTtsPlayback()
  if (cgStatusTimer) {
    clearTimeout(cgStatusTimer)
    cgStatusTimer = null
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('backpack-use-request', handleBackpackUseRequest)
    window.removeEventListener('phone-map-travel-request', handleMapTravelRequest)
  }
})

// 监听世界书变化，重新初始化开场白
watch(activeBook, async (newBook) => {
  if (newBook && !props.saveData) {
    initializeOpeningDialogue()
    hydrateNarrativeRuntimeState(null)
  }

  if (!currentSceneName.value) {
    const fallback = newBook?.scenes?.[0]?.name
    currentSceneName.value = String(fallback || '旧图书馆')
  }

  await applyBackgroundAssetsFromActiveBook()

  // 世界书切换后，重新按当前行场景应用背景
  await applyBackgroundByLineScene(currentLine.value, { allowFallback: true })
})
</script>

<template>
  <main class="game-screen" role="main">
    <p class="game-bg-word" aria-hidden="true">PLAY</p>

    <header class="game-topbar">
      <div class="topbar-row">
        <button
          type="button"
          class="menu-toggle-btn"
          :class="{ 'is-active': showTopMenu }"
          :aria-expanded="showTopMenu"
          aria-label="打开顶部菜单"
          @click="toggleTopMenu"
        >
          ☰
        </button>
        <div class="game-hud">
          <p class="hud-chip chip-primary">{{ currentSceneName || '旧图书馆' }}</p>
          <p class="hud-chip chip-secondary">序章 · 旧图书馆</p>
          <p class="hud-chip chip-tertiary">对话 {{ currentLineIndex + 1 }} / {{ dialogueScript.length }}</p>
        </div>
      </div>

      <div v-if="showTopMenu" class="top-menu-panel" role="menu" aria-label="游戏菜单">
        <button type="button" class="top-menu-btn top-menu-back" role="menuitem" @click="handleBackFromMenu">
          返回主菜单
        </button>
        <button
          type="button"
          class="top-menu-btn top-menu-quick"
          role="menuitem"
          :disabled="isSaving"
          @click="handleQuickSaveFromMenu"
        >
          {{ isSaving ? '保存中...' : '快速存档' }}
        </button>
        <button
          type="button"
          class="top-menu-btn top-menu-save"
          :class="{ 'is-active': showSavePanel }"
          role="menuitem"
          @click="handleToggleSavePanelFromMenu"
        >
          存档
        </button>
        <button
          type="button"
          class="top-menu-btn top-menu-history"
          :class="{ 'is-active': showDialogueHistoryPanel }"
          role="menuitem"
          @click="handleToggleDialogueHistoryFromMenu"
        >
          历史对话
        </button>
      </div>
      <!-- 存档成功提示 -->
      <div v-if="saveSuccess" class="save-toast success">
        <span class="toast-icon">✓</span>
        <span class="toast-text">{{ saveSuccess }}</span>
      </div>
      <!-- 存档失败提示 -->
      <div v-if="saveError" class="save-toast error">
        <span class="toast-icon">⚠</span>
        <span class="toast-text">{{ saveError }}</span>
      </div>
    </header>

    <!-- 存档面板 -->
    <section v-if="showSavePanel" class="save-panel" aria-label="存档管理">
      <div class="save-panel-header">
        <h3 class="save-title">💾 存档管理</h3>
        <button type="button" class="save-close" @click="toggleSavePanel">✕</button>
      </div>

      <div class="save-panel-body">
        <p class="save-info">
          当前进度：对话 {{ currentLineIndex + 1 }} / {{ dialogueScript.length }}
          | 游戏时长：{{ Math.floor(currentPlayTime / 60) }}分{{ currentPlayTime % 60 }}秒
        </p>

        <div class="save-preview">
          <p class="preview-label">存档预览：</p>
          <p class="preview-text">{{ currentLine.text.substring(0, 50) }}...</p>
        </div>

        <p v-if="saveError" class="save-error">{{ saveError }}</p>
        <p v-if="saveSuccess" class="save-success">{{ saveSuccess }}</p>
      </div>

      <div class="save-panel-footer">
        <button
          type="button"
          class="save-btn"
          :disabled="isSaving"
          @click="handleSaveGame"
        >
          {{ isSaving ? '保存中...' : '保存存档' }}
        </button>
      </div>
    </section>

    <section class="scene-stage" aria-label="AVG 场景">
      <div
        class="scene-background"
        :class="{ 'has-custom-bg': hasCustomBackground }"
        :style="backgroundStyle"
        aria-hidden="true"
      >
        <!-- 自定义背景图片时隐藏默认装饰层 -->
        <div v-if="!hasCustomBackground" class="scene-layer scene-gradient"></div>
        <div v-if="!hasCustomBackground" class="scene-layer scene-window"></div>
        <div v-if="!hasCustomBackground" class="scene-layer scene-floor"></div>
        <!-- 背景过渡遮罩（可选，用于平滑切换） -->
        <div v-if="hasCustomBackground" class="scene-layer scene-overlay"></div>
      </div>

      <div
        class="character-layer"
        :class="[portraitStyleClass, { 'android-speaker-layer': isAndroidPlatform }]"
        aria-label="人物立绘"
      >
        <div
          v-if="currentSpeakingCharacter && shouldShowCurrentPortrait"
          class="character-stand"
          :class="[
            isAndroidPlatform ? 'is-center' : 'is-left',
            { active: true, 'android-center-stand': isAndroidPlatform },
          ]"
        >
          <!-- 立绘图片 -->
          <img
            :src="portraitUrls[currentSpeakingCharacter.id]"
            :alt="currentSpeakingCharacter.name"
            class="character-portrait"
          />
        </div>
      </div>

      <section class="dialogue-box" aria-live="polite" @click="handleDialogueBoxClick">
        <div class="dialogue-head">
          <p class="speaker-tag">{{ currentLine.speaker }}</p>
          <p class="line-progress">{{ currentLineIndex + 1 }} / {{ dialogueScript.length }}</p>
          <div
            v-if="isCurrentCharacterLine"
            class="dialogue-tts-actions"
          >
            <button
              type="button"
              class="dialogue-tts-btn"
              :disabled="isTtsGenerating || isTtsSaving"
              :title="currentLineSpeakButtonTitle"
              :aria-label="currentLineSpeakButtonTitle"
              @click.stop="handlePlayCurrentLineVoice"
            >
              {{ isTtsGenerating ? '⏳' : (isTtsPlaying && canSpeakCurrentLine ? '⏹️' : '🔊') }}
            </button>
            <button
              v-if="!isAndroidPlatform"
              type="button"
              class="dialogue-tts-save-inline"
              :disabled="isTtsGenerating || isTtsSaving || !canSpeakCurrentLine"
              :title="currentLineSaveButtonTitle"
              :aria-label="currentLineSaveButtonTitle"
              @click.stop="handleSaveCurrentLineVoice"
            >
              {{ isTtsSaving ? '⏳' : '💾' }}
            </button>
          </div>
        </div>
        <p class="dialogue-text">{{ currentLine.text }}</p>
        <p
          v-if="ttsStatusMessage"
          class="dialogue-tts-status"
          :class="{ 'is-error': ttsStatusType === 'error' }"
        >
          {{ ttsStatusMessage }}
        </p>
        <button
          v-if="isCurrentCharacterLine && isAndroidPlatform"
          type="button"
          class="dialogue-tts-save-corner-floating"
          :disabled="isTtsGenerating || isTtsSaving || !canSpeakCurrentLine"
          :title="currentLineSaveButtonTitle"
          :aria-label="currentLineSaveButtonTitle"
          @click.stop="handleSaveCurrentLineVoice"
        >
          {{ isTtsSaving ? '⏳' : '💾' }}
        </button>

        <div v-if="!isAndroidPlatform" class="dialogue-actions">
          <button
            type="button"
            class="action-button action-outline"
            :disabled="currentLineIndex === 0"
            @click="goPrevLine"
          >
            上一句
          </button>
          <button type="button" class="action-button action-strong" @click="goNextLine">
            {{ isLastLine ? '继续' : '下一句' }}
          </button>
          <button
            type="button"
            class="action-button action-ai"
            :class="{ 'is-active': showGeneratePanel }"
            @click="toggleGeneratePanel"
            title="AI生成剧情"
          >
            🤖 AI生成
          </button>
          <button
            type="button"
            class="action-button action-cg"
            :class="{ 'is-active': showCGModal }"
            @click="handleOpenCGModal"
            title="生成CG图片"
          >
            🎨 生成CG
          </button>
        </div>
      </section>

      <div v-if="isAndroidPlatform" class="dialogue-actions dialogue-actions-strip">
        <button
          type="button"
          class="action-button action-outline"
          :disabled="currentLineIndex === 0"
          @click="goPrevLine"
        >
          上一句
        </button>
        <button type="button" class="action-button action-strong" @click="goNextLine">
          {{ isLastLine ? '继续' : '下一句' }}
        </button>
        <button
          type="button"
          class="action-button action-ai"
          :class="{ 'is-active': showGeneratePanel }"
          @click="toggleGeneratePanel"
          title="AI生成剧情"
        >
          🤖 AI生成
        </button>
        <button
          type="button"
          class="action-button action-cg"
          :class="{ 'is-active': showCGModal }"
          @click="handleOpenCGModal"
          title="生成CG图片"
        >
          🎨 生成CG
        </button>
      </div>

      <!-- AI 剧情生成面板 -->
      <section v-if="showGeneratePanel" class="generate-panel" aria-label="AI剧情生成">
        <div class="generate-panel-header">
          <h3 class="generate-title">🤖 AI 剧情生成</h3>
          <button type="button" class="generate-close" @click="toggleGeneratePanel">✕</button>
        </div>

        <div class="generate-panel-body">
          <div v-if="!hasApiConfig" class="generate-warning">
            ⚠️ 请先在设置中配置并应用 API
          </div>

          <div class="generate-config-row">
            <div class="generate-input-group generate-count-group">
              <span class="generate-label">生成条数范围</span>
              <select
                class="generate-select"
                :disabled="isGenerating"
                :value="selectedMessageRangeKey"
                @change="updateMessageRange($event)"
              >
                <option
                  v-for="opt in messageRangeOptions"
                  :key="opt.key"
                  :value="opt.key"
                >
                  {{ opt.isCustom ? opt.label : `${opt.label}（随机）` }}
                </option>
              </select>
              <div v-if="selectedMessageRangeKey === 'custom'" class="generate-custom-range">
                <div class="generate-custom-item">
                  <span class="generate-custom-label">最小条数</span>
                  <input
                    class="generate-custom-number"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    max="200"
                    :disabled="isGenerating"
                    :value="customMessageRange.min"
                    @input="updateCustomMessageRangeField('min', $event)"
                  />
                </div>
                <div class="generate-custom-item">
                  <span class="generate-custom-label">最大条数</span>
                  <input
                    class="generate-custom-number"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    max="200"
                    :disabled="isGenerating"
                    :value="customMessageRange.max"
                    @input="updateCustomMessageRangeField('max', $event)"
                  />
                </div>
              </div>
            </div>

            <div class="generate-custom-range">
              <label class="generate-custom-item">
                <span class="generate-custom-label">剧情上下文条数</span>
                <input
                  class="generate-custom-number"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="400"
                  :disabled="isGenerating"
                  :value="storyContextLineCount"
                  @input="updateStoryContextLineCount($event)"
                />
              </label>
              <label class="generate-custom-item">
                <span class="generate-custom-label">max_tokens</span>
                <input
                  class="generate-custom-number"
                  type="number"
                  inputmode="numeric"
                  min="128"
                  max="200000"
                  :disabled="isGenerating"
                  :value="storyMaxTokens"
                  @input="updateStoryMaxTokens($event)"
                />
              </label>
            </div>
          </div>

          <label class="generate-input-group">
            <span class="generate-label">剧情方向（可选）</span>
            <input
              v-model="userPromptInput"
              class="generate-input"
              type="text"
              placeholder="例如：伊芙发现了一个秘密文件..."
              :disabled="isGenerating"
            />
          </label>

          <p v-if="generateError" class="generate-error">{{ generateError }}</p>

          <div class="generate-info">
            <span class="generate-hint">
              将在 {{ generateMessageRange.min }}-{{ generateMessageRange.max }} 条范围内随机生成对话（上下文 {{ storyContextLineCount }} 条）
            </span>
            <span v-if="isGenerating" class="generate-status">⏳ 正在生成...</span>
          </div>
        </div>

        <div class="generate-panel-footer">
          <button
            type="button"
            class="generate-btn"
            :disabled="isGenerating || !hasApiConfig"
            @click="handleGenerateStory"
          >
            {{ isGenerating ? '生成中...' : '开始生成' }}
          </button>
        </div>
      </section>

      <!-- 生成中遮罩层 -->
      <section v-if="isGenerating" class="generating-overlay" aria-label="生成中提示">
        <div class="generating-modal">
          <div class="generating-icon">🤖</div>
          <h3 class="generating-title">正在生成剧情...</h3>
          <p class="generating-hint">AI 正在根据你的选择编写后续剧情</p>
          <div class="generating-spinner">
            <span class="spinner-dot"></span>
            <span class="spinner-dot"></span>
            <span class="spinner-dot"></span>
          </div>
        </div>
      </section>
    </section>

    <!-- 历史对话面板 -->
    <section
      v-if="showDialogueHistoryPanel"
      class="history-dialogue-overlay"
      aria-label="历史对话"
      @click.self="closeDialogueHistoryPanel"
    >
      <div class="history-dialogue-panel" role="dialog" aria-modal="false">
        <div class="history-dialogue-header">
          <h3 class="history-dialogue-title">历史对话</h3>
          <button type="button" class="history-dialogue-close" @click="closeDialogueHistoryPanel">✕</button>
        </div>

        <div
          ref="historyBodyRef"
          class="history-dialogue-body"
          data-no-advance
          @scroll.passive="handleHistoryBodyScroll"
        >
          <p v-if="visibleDialogueHistory.length === 0" class="history-dialogue-empty">
            暂无历史对话
          </p>

          <div v-else class="history-dialogue-list">
            <p v-if="hasMoreHistoryDialogues" class="history-dialogue-more-tip">向上滑动加载更早对话</p>
            <article
              v-for="historyItem in visibleDialogueHistory"
              :key="historyItem.lineKey"
              class="history-dialogue-item"
            >
              <p class="history-dialogue-line">
                <span class="history-dialogue-speaker">{{ historyItem.speaker }}</span>
                <span class="history-dialogue-text">{{ historyItem.text }}</span>
              </p>
              <button
                v-if="historyItem.canSpeak"
                type="button"
                class="history-dialogue-voice-btn"
                :disabled="isTtsGenerating || isTtsSaving"
                :title="isHistoryLinePlaying(historyItem.lineKey) ? '停止播放该句语音' : '播放该句语音'"
                :aria-label="isHistoryLinePlaying(historyItem.lineKey) ? '停止播放该句语音' : '播放该句语音'"
                @click="handlePlayHistoryLineVoice(historyItem)"
              >
                {{ isHistoryLinePlaying(historyItem.lineKey) ? '⏹️' : '🔊' }}
              </button>
            </article>
          </div>
        </div>
      </div>
    </section>

    <!-- 选项面板 -->
    <section v-if="showChoicesPanel && currentChoices" class="choices-overlay" aria-label="剧情选项">
      <div class="choices-panel" role="dialog" aria-modal="true">
        <div class="choices-panel-header">
          <h3 class="choices-title">🎯 {{ currentChoices.prompt }}</h3>
        </div>

        <div class="choices-panel-body">
          <div class="choices-options">
            <button
              v-for="option in currentChoices.options"
              :key="option.id"
              type="button"
              class="choice-button"
              :disabled="isGenerating"
              @click="handleSelectChoice(option)"
            >
              {{ option.text }}
            </button>
          </div>

          <!-- 自定义输入区域 -->
          <div v-if="currentChoices.allowCustomInput" class="choices-custom-input">
            <label class="custom-input-label">
              <span class="custom-input-hint">自定义输入：</span>
              <input
                v-model="customInputText"
                class="custom-input-field"
                type="text"
                placeholder="输入你的选择..."
                :disabled="isGenerating"
              />
            </label>
            <button
              type="button"
              class="custom-input-btn"
              :disabled="isGenerating || !customInputText.trim()"
              @click="handleCustomInput"
            >
              确认
            </button>
          </div>

          <p v-if="isGenerating" class="choices-status">⏳ 正在生成后续剧情...</p>
        </div>
      </div>
    </section>

    <!-- 音乐播放器（支持插件替换） -->
    <PluginComponent
      :default-component="MusicPlayer"
      :plugin-type="PluginTypes.MUSIC_PLAYER"
    />

    <!-- 手机（支持插件替换） -->
    <PluginComponent
      :default-component="Phone"
      :plugin-type="PluginTypes.PHONE"
      :component-props="{
        worldBook: activeBook,
        saveSlotId: smsSaveScopeId,
        dialogueHistory: dialogueScript,
        currentLine,
      }"
    />

    <!-- 掌机（支持插件替换） -->
    <PluginComponent
      :default-component="HandheldConsole"
      :plugin-type="PluginTypes.HANDHELD"
      :component-props="{
        worldBook: activeBook,
        saveSlotId: smsSaveScopeId,
      }"
    />

    <!-- 背包（支持插件替换） -->
    <PluginComponent
      :default-component="Backpack"
      :plugin-type="PluginTypes.BACKPACK"
      :component-props="{
        worldBook: activeBook,
        saveSlotId: smsSaveScopeId,
        dialogueHistory: dialogueScript,
        currentLine,
      }"
    />

    <!-- CG 生成弹窗 -->
    <CGGeneratorModal
      :visible="showCGModal"
      :world-book="activeBook"
      :dialogue-history="dialogueScript"
      :current-line="currentLine"
      :summary-loading="isCgSummarizing"
      :summary-error="cgSummaryError"
      :summary-result="cgSummaryResult"
      @close="showCGModal = false"
      @request-scene-summary="handleRequestCgSceneSummary"
      @generate-request="handleCGGenerateRequest"
    />

    <!-- CG 生成中提示 -->
    <section v-if="isCgGenerating" class="generating-overlay cg-generating-overlay" aria-label="CG生成中提示">
      <div class="generating-modal">
        <div class="generating-icon">🎨</div>
        <h3 class="generating-title">正在生成 CG...</h3>
        <p class="generating-hint">请稍候，生成完成后会自动展示结果</p>
        <div class="generating-spinner">
          <span class="spinner-dot"></span>
          <span class="spinner-dot"></span>
          <span class="spinner-dot"></span>
        </div>
      </div>
    </section>

    <!-- CG 结果展示 -->
    <section v-if="generatedCG && showCGResultPanel" class="cg-result-overlay" aria-label="CG结果">
      <div class="cg-result-panel" role="dialog" aria-modal="true">
        <div class="cg-result-frame">
          <img :src="generatedCG.url" alt="Generated CG" class="cg-result-image" />
        </div>
        <p v-if="generatedCG.sceneSummary" class="cg-result-summary">{{ generatedCG.sceneSummary }}</p>
        <div class="cg-result-actions">
          <button type="button" class="cg-result-btn cg-result-btn-confirm" @click="handleCloseCGResult">确定</button>
          <button type="button" class="cg-result-btn cg-result-btn-save" @click="handleSaveGeneratedCG">保存</button>
        </div>
      </div>
    </section>

    <div
      v-if="cgStatusMessage"
      class="cg-status-toast"
      :class="{
        'is-success': cgStatusType === 'success',
        'is-error': cgStatusType === 'error',
      }"
    >
      {{ cgStatusMessage }}
    </div>
  </main>
</template>

<style scoped>
.game-screen {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  min-height: 100vh;
  background: var(--background);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: none;
  border-radius: 0;
  margin: 0;
  padding: 0;
}

.game-screen::before,
.game-screen::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.game-screen::before {
  opacity: 0.08;
  background-image:
    radial-gradient(circle, var(--accent-cyan) 1px, transparent 1px),
    repeating-linear-gradient(
      -40deg,
      transparent 0 12px,
      color-mix(in srgb, var(--accent-orange) 35%, transparent) 12px 22px
    );
  background-size:
    24px 24px,
    100% 100%;
}

.game-screen::after {
  opacity: 0.06;
  background-image: conic-gradient(
    from 90deg at 1px 1px,
    transparent 90deg,
    color-mix(in srgb, var(--accent-magenta) 28%, transparent) 0
  );
  background-size: 44px 44px;
}

.game-bg-word {
  position: absolute;
  margin: 0;
  right: -2%;
  top: -4%;
  font-family: var(--font-heading);
  font-size: clamp(6rem, 20vw, 14rem);
  line-height: 0.8;
  letter-spacing: -0.07em;
  color: color-mix(in srgb, var(--accent-yellow) 30%, transparent);
  opacity: 0.23;
  pointer-events: none;
  user-select: none;
}

.game-topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 16px 20px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--background) 80%, transparent) 0%, transparent 100%);
}

.topbar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

.menu-toggle-btn {
  appearance: none;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  border: 3px solid var(--accent-cyan);
  border-radius: 10px;
  padding: 0;
  font: 800 1.15rem/1 var(--font-heading);
  color: var(--accent-cyan);
  background: color-mix(in srgb, var(--accent-cyan) 18%, transparent);
  cursor: pointer;
  box-shadow:
    0 0 14px color-mix(in srgb, var(--accent-cyan) 42%, transparent),
    4px 4px 0 color-mix(in srgb, var(--accent-purple) 75%, transparent);
  transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease, color 180ms ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.menu-toggle-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow:
    0 0 18px color-mix(in srgb, var(--accent-cyan) 58%, transparent),
    6px 6px 0 color-mix(in srgb, var(--accent-purple) 75%, transparent);
}

.menu-toggle-btn.is-active {
  color: var(--background);
  background: var(--accent-cyan);
}

.menu-toggle-btn:focus-visible {
  outline: 3px dashed var(--accent-yellow);
  outline-offset: 4px;
}

.game-hud {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-wrap: nowrap;
  justify-content: flex-end;
  margin-left: auto;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.game-hud::-webkit-scrollbar {
  display: none;
}

.hud-chip {
  margin: 0;
  flex: 0 0 auto;
  padding: 8px 14px;
  border: 4px solid;
  border-radius: 9999px;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: color-mix(in srgb, var(--muted) 60%, transparent);
  box-shadow:
    0 0 14px color-mix(in srgb, var(--accent-purple) 45%, transparent),
    5px 5px 0 var(--accent-purple);
}

.chip-primary {
  border-color: var(--accent-yellow);
  color: var(--accent-yellow);
}

.chip-secondary {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  border-style: dashed;
}

.chip-tertiary {
  border-color: var(--accent-orange);
  color: var(--accent-orange);
  border-style: dotted;
}

.scene-stage {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.scene-background {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.scene-background.has-custom-bg {
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.scene-layer {
  position: absolute;
  inset: 0;
}

.scene-gradient {
  background:
    radial-gradient(
      ellipse at 15% 22%,
      color-mix(in srgb, var(--accent-cyan) 38%, transparent) 0%,
      transparent 54%
    ),
    radial-gradient(
      ellipse at 85% 18%,
      color-mix(in srgb, var(--accent-magenta) 36%, transparent) 0%,
      transparent 52%
    ),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--accent-purple) 42%, var(--background)) 0%,
      color-mix(in srgb, var(--background) 90%, black) 62%,
      color-mix(in srgb, var(--accent-orange) 32%, var(--background)) 100%
    );
}

.scene-window {
  opacity: 0.26;
  background:
    repeating-linear-gradient(
      to right,
      transparent 0 68px,
      color-mix(in srgb, var(--accent-cyan) 32%, transparent) 68px 72px
    ),
    linear-gradient(
      180deg,
      transparent 0 26%,
      color-mix(in srgb, var(--accent-cyan) 28%, transparent) 26% 30%,
      transparent 30% 100%
    );
}

.scene-floor {
  top: auto;
  height: 42%;
  background:
    linear-gradient(
      to top,
      color-mix(in srgb, var(--background) 92%, black) 0%,
      color-mix(in srgb, var(--muted) 64%, transparent) 78%,
      transparent 100%
    ),
    repeating-linear-gradient(
      -14deg,
      color-mix(in srgb, var(--accent-yellow) 24%, transparent) 0 2px,
      transparent 2px 32px
    );
  opacity: 0.68;
}

.character-layer {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 0 5%;
  pointer-events: none;
  z-index: 2;
}

.character-layer.android-speaker-layer {
  justify-content: center;
  padding-left: 0;
  padding-right: 0;
}

.character-stand {
  position: relative;
  cursor: pointer;
  pointer-events: auto;
  transition: transform 300ms ease, filter 300ms ease;
}

.character-portrait {
  height: 95vh;
  width: auto;
  object-fit: contain;
  object-position: bottom center;
}

.character-stand:hover {
  transform: translateY(-8px);
}

.character-stand.active {
  transform: translateY(-12px);
}

.character-stand:not(.active) {
  opacity: 0.7;
}

/* 左侧立绘位置 */
.is-left {
  transform-origin: bottom center;
}

/* 中间立绘位置 */
.is-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
}

.character-layer.android-speaker-layer .character-stand.android-center-stand {
  position: relative;
  left: auto;
  transform: translateY(0);
  margin-inline: auto;
}

.character-layer.android-speaker-layer .character-stand.android-center-stand:hover {
  transform: translateY(-8px);
}

.character-layer.android-speaker-layer .character-stand.android-center-stand.active {
  transform: translateY(-12px);
}

.character-stand.is-center:hover {
  transform: translateX(-50%) translateY(-8px);
}

.character-stand.is-center.active {
  transform: translateX(-50%) translateY(-12px);
}

/* 右侧立绘位置 */
.is-right {
  transform-origin: bottom center;
}

.character-stand.is-left.active,
.character-stand.is-center.active,
.character-stand.is-right.active {
  opacity: 1;
}

.dialogue-box {
  position: absolute;
  left: 5%;
  right: 5%;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 4px);
  z-index: 5;
  border: 2px solid color-mix(in srgb, var(--accent-cyan) 60%, transparent);
  border-radius: 0;
  background: color-mix(in srgb, var(--background) 85%, transparent);
  backdrop-filter: blur(12px);
  padding: 12px 16px;
  box-shadow: 0 4px 30px color-mix(in srgb, var(--background) 80%, transparent);
  display: grid;
  gap: 8px;
  max-width: 90%;
  margin: 0 auto;
}

.dialogue-head {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 6px;
}

.speaker-tag {
  margin: 0;
  padding: 6px 12px;
  border: 4px solid var(--accent-yellow);
  border-radius: 9999px;
  background: color-mix(in srgb, var(--accent-magenta) 34%, transparent);
  font-family: var(--font-heading);
  font-size: 0.84rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-shadow: var(--text-shadow-single);
  justify-self: start;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.line-progress {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--foreground) 88%, var(--accent-cyan));
  white-space: nowrap;
  justify-self: center;
}

.dialogue-tts-actions {
  display: inline-flex;
  align-items: center;
  justify-self: end;
  gap: 6px;
}

.dialogue-tts-btn {
  appearance: none;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font-size: 0.62rem;
  line-height: 1;
  padding: 0;
  width: auto;
  height: auto;
  min-height: 0;
  display: inline-block;
  justify-self: end;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.dialogue-tts-save-inline {
  appearance: none;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font-size: 0.62rem;
  line-height: 1;
  padding: 0;
  width: auto;
  height: auto;
  min-width: 0;
  min-height: 0;
  display: inline-block;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.dialogue-tts-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.dialogue-tts-save-inline:hover:not(:disabled) {
  opacity: 0.85;
}

.dialogue-tts-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.dialogue-tts-save-inline:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.dialogue-tts-save-corner-floating {
  appearance: none;
  position: absolute;
  right: 8px;
  bottom: 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: color-mix(in srgb, var(--foreground) 94%, var(--accent-cyan));
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1;
  padding: 0;
  width: auto;
  height: auto;
  min-width: 0;
  min-height: 0;
  display: inline-block;
  z-index: 3;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.dialogue-tts-save-corner-floating:hover:not(:disabled) {
  opacity: 0.85;
}

.dialogue-tts-save-corner-floating:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.dialogue-text {
  margin: 0;
  font-size: clamp(1rem, 1.65vw, 1.24rem);
  line-height: 1.55;
  color: color-mix(in srgb, var(--foreground) 95%, var(--accent-cyan));
}

.dialogue-tts-status {
  margin: 0;
  font-size: 0.75rem;
  color: color-mix(in srgb, var(--accent-cyan) 85%, var(--foreground));
}

.dialogue-tts-status.is-error {
  color: var(--accent-orange);
}

.dialogue-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.history-dialogue-overlay {
  position: fixed;
  inset: 0;
  z-index: 34;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(10px, 2.4vh, 22px) clamp(8px, 2.6vw, 24px);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--background) 58%, transparent) 0%,
      color-mix(in srgb, var(--background) 72%, transparent) 100%
    );
  backdrop-filter: blur(8px);
}

.history-dialogue-panel {
  width: min(97vw, 980px);
  height: min(90dvh, 900px);
  max-height: 90dvh;
  border: 3px solid var(--accent-cyan);
  border-radius: 14px;
  background: color-mix(in srgb, var(--background) 92%, transparent);
  box-shadow:
    0 0 34px color-mix(in srgb, var(--accent-cyan) 36%, transparent),
    10px 10px 0 color-mix(in srgb, var(--accent-purple) 68%, transparent);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.history-dialogue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 2px dashed var(--accent-cyan);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent-cyan) 24%, transparent),
    color-mix(in srgb, var(--accent-purple) 16%, transparent)
  );
}

.history-dialogue-title {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 1.03rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--accent-cyan);
}

.history-dialogue-close {
  appearance: none;
  min-width: 30px;
  max-width: 30px;
  width: 30px;
  min-height: 30px;
  max-height: 30px;
  height: 30px;
  flex: 0 0 30px;
  flex-shrink: 0;
  flex-grow: 0;
  aspect-ratio: 1 / 1;
  border: 2px solid var(--accent-cyan);
  border-radius: 9999px;
  background: transparent;
  color: var(--accent-cyan);
  font-size: 0.92rem;
  line-height: 1;
  padding: 0;
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.history-dialogue-close:hover {
  background: var(--accent-cyan);
  color: var(--background);
}

.history-dialogue-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 16px 18px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--accent-cyan) 56%, transparent) transparent;
}

.history-dialogue-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-dialogue-more-tip {
  margin: 0;
  padding: 4px 0 6px;
  text-align: center;
  font-size: 0.76rem;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--accent-cyan) 80%, var(--foreground));
}

.history-dialogue-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--accent-cyan) 42%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface-panel) 72%, transparent),
      color-mix(in srgb, var(--background) 84%, transparent)
    );
}

.history-dialogue-line {
  margin: 0;
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  column-gap: 8px;
  font-size: 0.96rem;
  line-height: 1.52;
  color: color-mix(in srgb, var(--foreground) 92%, var(--accent-cyan));
  word-break: break-word;
}

.history-dialogue-speaker {
  font-weight: 700;
  color: var(--accent-yellow);
  white-space: nowrap;
}

.history-dialogue-text {
  color: color-mix(in srgb, var(--foreground) 95%, var(--accent-cyan));
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.history-dialogue-separator {
  color: color-mix(in srgb, var(--foreground) 75%, var(--accent-cyan));
}

.history-dialogue-voice-btn {
  appearance: none;
  flex: 0 0 auto;
  min-width: 34px;
  max-width: 34px;
  width: 34px;
  min-height: 34px;
  max-height: 34px;
  height: 34px;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
  align-self: center;
  border: 1px solid color-mix(in srgb, var(--accent-cyan) 45%, transparent);
  border-radius: 9999px;
  background: color-mix(in srgb, var(--accent-cyan) 16%, transparent);
  color: var(--accent-cyan);
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
  transition: transform 0.18s ease, background 0.2s ease;
}

.history-dialogue-voice-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--accent-cyan) 30%, transparent);
}

.history-dialogue-voice-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.history-dialogue-empty {
  margin: 0;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.92rem;
  color: color-mix(in srgb, var(--foreground) 72%, var(--muted));
}

/* AI 生成按钮样式 */
.action-ai {
  background: linear-gradient(135deg, var(--accent-purple), var(--accent-magenta));
  border: 3px solid var(--accent-purple);
  color: var(--foreground);
  font-weight: 700;
  letter-spacing: 0.05em;
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent-purple) 50%, transparent);
  transition: all 200ms ease;
}

.action-ai:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 20px color-mix(in srgb, var(--accent-magenta) 60%, transparent);
}

.action-ai.is-active {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent-cyan) 50%, transparent);
}

/* AI 剧情生成面板 */
.generate-panel {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
  width: min(90%, 420px);
  border: 4px solid var(--accent-purple);
  border-radius: 0;
  background: color-mix(in srgb, var(--background) 85%, transparent);
  backdrop-filter: blur(12px);
  box-shadow:
    0 0 30px color-mix(in srgb, var(--accent-purple) 40%, transparent),
    10px 10px 0 var(--accent-magenta);
  overflow: hidden;
}

.generate-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 2px dashed var(--accent-magenta);
  background: color-mix(in srgb, var(--accent-purple) 30%, transparent);
}

.generate-title {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--accent-cyan);
}

.generate-close {
  appearance: none;
  -webkit-appearance: none;
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  min-height: 28px !important;
  max-width: 28px !important;
  max-height: 28px !important;
  flex: 0 0 28px !important;
  flex-shrink: 0 !important;
  flex-grow: 0 !important;
  aspect-ratio: 1 / 1 !important;
  border: 2px solid var(--accent-magenta);
  border-radius: 50% !important;
  background: transparent;
  color: var(--foreground);
  font-size: 0.9rem;
  line-height: 1 !important;
  cursor: pointer;
  transition: all 150ms ease;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
  margin: 0 !important;
  box-sizing: border-box !important;
}

.generate-close:hover {
  background: var(--accent-magenta);
  color: var(--background);
}

.generate-panel-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.generate-warning {
  padding: 10px 14px;
  border: 2px dashed var(--accent-orange);
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-orange) 20%, transparent);
  font-size: 0.85rem;
  color: var(--accent-orange);
}

.generate-config-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: stretch;
}

.generate-count-group {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.generate-custom-range {
  width: 100%;
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.generate-custom-item {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.generate-custom-label {
  flex: 0 0 auto;
  white-space: nowrap;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: color-mix(in srgb, var(--foreground) 82%, var(--accent-cyan));
}

.generate-custom-number {
  flex: 1 1 auto;
  min-width: 0;
}

.generate-select {
  appearance: none;
  padding: 10px 14px;
  border: 3px solid var(--accent-purple);
  border-radius: 0;
  background: color-mix(in srgb, var(--background) 60%, transparent);
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--foreground);
  cursor: pointer;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.generate-select:focus {
  outline: none;
  border-color: var(--accent-cyan);
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent-purple) 40%, transparent);
}

.generate-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.generate-custom-number {
  appearance: none;
  width: auto;
  padding: 10px 14px;
  border: 3px solid var(--accent-purple);
  border-radius: 0;
  background: color-mix(in srgb, var(--background) 60%, transparent);
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--foreground);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.generate-custom-number:focus {
  outline: none;
  border-color: var(--accent-cyan);
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent-purple) 40%, transparent);
}

.generate-custom-number:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.generate-input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.generate-label {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, var(--foreground) 80%, var(--accent-cyan));
}

.generate-input {
  appearance: none;
  padding: 10px 14px;
  border: 3px solid var(--accent-cyan);
  border-radius: 0;
  background: color-mix(in srgb, var(--background) 60%, transparent);
  font-size: 0.95rem;
  color: var(--foreground);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.generate-input:focus {
  outline: none;
  border-color: var(--accent-yellow);
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent-cyan) 40%, transparent);
}

.generate-input::placeholder {
  color: color-mix(in srgb, var(--foreground) 50%, transparent);
}

.generate-error {
  margin: 0;
  padding: 8px 12px;
  border: 2px solid var(--accent-orange);
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-orange) 15%, transparent);
  font-size: 0.82rem;
  color: var(--accent-orange);
}

.generate-info {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
}

.generate-hint {
  font-size: 0.78rem;
  color: color-mix(in srgb, var(--foreground) 70%, var(--muted));
}

.generate-status {
  font-size: 0.78rem;
  color: var(--accent-cyan);
  animation: pulse 1.5s ease infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.generate-panel-footer {
  padding: 12px 16px;
  border-top: 2px dashed var(--accent-magenta);
  background: color-mix(in srgb, var(--accent-purple) 20%, transparent);
}

.generate-btn {
  appearance: none;
  width: 100%;
  padding: 12px 20px;
  border: 3px solid var(--accent-cyan);
  border-radius: 0;
  background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple));
  font-family: var(--font-heading);
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--foreground);
  cursor: pointer;
  transition: all 200ms ease;
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent-cyan) 40%, transparent);
}

.generate-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 0 24px color-mix(in srgb, var(--accent-purple) 50%, transparent);
}

.generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--muted);
  border-color: var(--muted);
  box-shadow: none;
}

@media (max-width: 1180px) {
  .character-layer {
    gap: 12px;
    padding-bottom: 184px;
  }

  .character-stand {
    width: clamp(160px, 24vw, 240px);
    height: clamp(280px, 52vh, 420px);
  }
}

@media (max-width: 900px) {
  .game-hud {
    justify-content: flex-end;
  }

  .game-topbar {
    padding: 12px 16px;
  }

  .character-layer {
    gap: 10px;
    padding-bottom: 160px;
  }

  .character-stand.is-right {
    display: none;
  }

  .dialogue-actions {
    justify-content: flex-start;
  }

  .dialogue-box {
    left: 3%;
    right: 3%;
    padding: 10px 14px;
  }
}

@media (max-width: 680px) {
  .game-topbar {
    padding: 8px 12px;
    gap: 6px;
  }

  .topbar-row {
    gap: 6px;
  }

  .menu-toggle-btn {
    width: 34px;
    height: 34px;
    min-width: 34px;
    min-height: 34px;
    font-size: 1rem;
    border-width: 2px;
  }

  .game-hud {
    gap: 4px;
  }

  .hud-chip {
    padding: 4px 8px;
    font-size: 0.65rem;
    border-width: 2px;
    box-shadow: 0 0 6px color-mix(in srgb, var(--accent-purple) 25%, transparent);
  }

  .character-layer {
    padding: 0 3% 118px;
  }

  .character-stand {
    width: min(40vw, 180px);
    height: min(50vh, 300px);
  }

  /* 移动端只显示中间立绘 */
  .character-stand.is-left,
  .character-stand.is-right {
    display: none;
  }

  .character-stand.is-center {
    display: block;
    width: min(70vw, 280px);
    height: min(60vh, 350px);
  }

  .character-portrait {
    height: 55vh;
  }

  .game-bg-word {
    display: none;
  }

  .dialogue-box {
    left: 2%;
    right: 2%;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 2px);
    padding: 8px 10px;
    border-radius: 8px;
    border-width: 1px;
    max-width: 96%;
    backdrop-filter: blur(6px);
  }

  .dialogue-head {
    gap: 6px;
  }

  .speaker-tag {
    padding: 4px 8px;
    font-size: 0.7rem;
    border-width: 2px;
  }

  .line-progress {
    font-size: 0.7rem;
  }

  .dialogue-tts-btn,
  .dialogue-tts-save-inline {
    font-size: 0.62rem;
  }

  .dialogue-tts-save-corner-floating {
    right: 6px;
    bottom: 6px;
    font-size: 0.9rem;
  }

  .dialogue-text {
    font-size: 0.9rem;
    line-height: 1.42;
  }

  .dialogue-actions {
    flex-wrap: wrap;
    gap: 6px;
  }

  .action-button {
    padding: 8px 12px;
    min-height: 36px;
    font-size: 0.7rem;
    border-width: 2px;
  }

  .top-menu-panel {
    top: 52px;
    left: 12px;
    min-width: 150px;
    padding: 6px;
    gap: 4px;
  }

  .top-menu-btn {
    padding: 6px 10px;
    font-size: 0.72rem;
    border-width: 1px;
  }

  .history-dialogue-overlay {
    padding:
      max(6px, env(safe-area-inset-top, 0px))
      6px
      max(6px, env(safe-area-inset-bottom, 0px));
  }

  .history-dialogue-panel {
    width: 98vw;
    height: 90dvh;
    max-height: 90dvh;
    border-radius: 12px;
    border-width: 2px;
    box-shadow:
      0 0 24px color-mix(in srgb, var(--accent-cyan) 30%, transparent),
      0 10px 30px rgba(0, 0, 0, 0.38);
  }

  .history-dialogue-header {
    padding: 10px 12px;
  }

  .history-dialogue-title {
    font-size: 0.92rem;
  }

  .history-dialogue-body {
    padding: 10px 12px 14px;
  }

  .history-dialogue-item {
    padding: 8px 9px;
  }

  .history-dialogue-line {
    font-size: 0.84rem;
    line-height: 1.42;
  }

  .history-dialogue-voice-btn {
    width: 32px;
    height: 32px;
    font-size: 0.84rem;
  }
}

/* 横屏模式优化 */
@media (max-width: 768px) and (orientation: landscape) {
  .game-topbar {
    padding: 4px 8px;
  }

  .menu-toggle-btn {
    width: 32px;
    height: 32px;
    min-width: 32px;
    min-height: 32px;
    font-size: 0.9rem;
  }

  .top-menu-panel {
    top: 44px;
    left: 8px;
    min-width: 140px;
  }

  .hud-chip {
    padding: 3px 6px;
    font-size: 0.6rem;
  }

  .character-layer {
    padding-bottom: 84px;
  }

  .character-portrait {
    height: 70vh;
  }

  .dialogue-box {
    bottom: calc(env(safe-area-inset-bottom, 0px) + 2px);
    padding: 7px 10px;
    max-height: 28vh;
  }

  .dialogue-text {
    font-size: 0.85rem;
    line-height: 1.35;
  }

  .dialogue-actions {
    gap: 4px;
  }

  .action-button {
    padding: 6px 10px;
    min-height: 28px;
    font-size: 0.65rem;
  }

  .generate-panel {
    width: min(80%, 320px);
    z-index: 50;
    border-radius: 12px;
    border-width: 2px;
    box-shadow:
      0 0 20px color-mix(in srgb, var(--accent-purple) 30%, transparent),
      0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .generate-panel-header {
    padding: 14px 16px;
    background: linear-gradient(135deg,
      color-mix(in srgb, var(--accent-purple) 25%, transparent),
      color-mix(in srgb, var(--accent-magenta) 15%, transparent)
    );
  }

  .generate-title {
    font-size: 0.95rem;
  }

  .generate-close {
    width: 32px;
    height: 32px;
  }

  .generate-panel-body {
    padding: 14px;
    gap: 10px;
    max-height: 50vh;
    overflow-y: auto;
  }

  .generate-warning {
    padding: 10px;
    font-size: 0.8rem;
  }

  .generate-config-row {
    gap: 10px;
  }

  .generate-count-group {
    min-width: 100%;
  }

  .generate-custom-range {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .generate-custom-item {
    gap: 6px;
  }

  .generate-custom-label {
    font-size: 0.76rem;
  }

  .generate-input-group {
    padding: 12px;
    border-radius: 8px;
  }

  .generate-label {
    font-size: 0.8rem;
  }

  .generate-select,
  .generate-input,
  .generate-custom-number {
    padding: 10px 12px;
    min-height: 44px;
    font-size: 0.85rem;
    border-radius: 6px;
  }

  .generate-close {
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    min-height: 32px !important;
    max-width: 32px !important;
    max-height: 32px !important;
    flex: 0 0 32px !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    aspect-ratio: 1 / 1 !important;
    border-radius: 50% !important;
    font-size: 1rem !important;
    line-height: 1 !important;
    padding: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  .generate-panel-footer {
    padding: 12px 16px;
  }

  .generate-btn {
    padding: 12px 16px;
    min-height: 44px;
    font-size: 0.9rem;
    border-radius: 8px;
  }

  .choices-panel {
    width: min(80%, 360px);
    z-index: 50;
    border-radius: 12px;
  }
}

/* 超小屏幕 (小于480px) */
@media (max-width: 480px) {
  .game-topbar {
    padding: 4px 8px;
    gap: 4px;
  }

  .topbar-row {
    gap: 4px;
  }

  .menu-toggle-btn {
    width: 30px;
    height: 30px;
    min-width: 30px;
    min-height: 30px;
    font-size: 0.82rem;
  }

  .hud-chip {
    padding: 2px 4px;
    font-size: 0.55rem;
  }

  .dialogue-box {
    left: 1%;
    right: 1%;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 1px);
    padding: 7px 8px;
  }

  .dialogue-text {
    font-size: 0.8rem;
  }

  .action-button {
    padding: 6px 8px;
    min-height: 32px;
    font-size: 0.6rem;
  }

  .top-menu-panel {
    top: 40px;
    left: 8px;
    min-width: 134px;
    padding: 4px;
  }

  .top-menu-btn {
    padding: 5px 8px;
    font-size: 0.64rem;
  }

  .history-dialogue-overlay {
    padding:
      max(4px, env(safe-area-inset-top, 0px))
      4px
      max(4px, env(safe-area-inset-bottom, 0px));
  }

  .history-dialogue-panel {
    width: 99vw;
    height: 90dvh;
    max-height: 90dvh;
    border-radius: 10px;
  }

  .history-dialogue-title {
    font-size: 0.84rem;
  }

  .history-dialogue-voice-btn {
    width: 30px;
    height: 30px;
    font-size: 0.78rem;
  }

  /* 隐藏部分按钮，只保留核心功能 */
  .action-button.action-cg {
    display: none;
  }

  .generate-panel {
    width: 92%;
    max-width: 360px;
    z-index: 50;
    border-radius: 10px;
    border-width: 2px;
  }

  .generate-panel-header {
    padding: 12px 14px;
  }

  .generate-title {
    font-size: 0.85rem;
  }

  .generate-close {
    width: 28px !important;
    height: 28px !important;
    min-width: 28px !important;
    min-height: 28px !important;
    max-width: 28px !important;
    max-height: 28px !important;
    flex: 0 0 28px !important;
    flex-shrink: 0 !important;
    flex-grow: 0 !important;
    aspect-ratio: 1 / 1 !important;
    border-radius: 50% !important;
    font-size: 0.85rem !important;
    line-height: 1 !important;
    padding: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  .generate-panel-body {
    padding: 12px;
    max-height: 45vh;
  }

  .generate-panel-footer {
    padding: 10px 14px;
  }

  .generate-btn {
    padding: 10px 14px;
    min-height: 40px;
    font-size: 0.85rem;
  }

  .choices-panel {
    width: 92%;
    max-width: 340px;
    z-index: 50;
    border-radius: 10px;
  }
}

/* 选项面板样式 */
.choices-overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(12px, 3vw, 28px);
  background: color-mix(in srgb, var(--background) 45%, transparent);
  backdrop-filter: blur(6px);
}

.choices-panel {
  position: relative;
  width: min(92vw, 520px);
  max-height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
  border: 4px solid var(--accent-yellow);
  border-radius: 0;
  background: color-mix(in srgb, var(--background) 88%, transparent);
  backdrop-filter: blur(14px);
  box-shadow:
    0 0 36px color-mix(in srgb, var(--accent-yellow) 45%, transparent),
    12px 12px 0 var(--accent-cyan);
  overflow: hidden;
}

.choices-panel-header {
  padding: 14px 18px;
  border-bottom: 3px dashed var(--accent-cyan);
  background: color-mix(in srgb, var(--accent-yellow) 25%, transparent);
}

.choices-title {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--accent-cyan);
  text-shadow: var(--text-shadow-single);
}

.choices-panel-body {
  flex: 1 1 auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
}

.choices-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.choice-button {
  appearance: none;
  padding: 14px 20px;
  border: 3px solid var(--accent-cyan);
  border-radius: 0;
  background: color-mix(in srgb, var(--accent-purple) 30%, transparent);
  font-family: var(--font-heading);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--foreground);
  cursor: pointer;
  transition: all 200ms ease;
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent-purple) 35%, transparent);
  text-align: left;
}

.choice-button:hover:not(:disabled) {
  transform: translateX(8px);
  border-color: var(--accent-yellow);
  background: color-mix(in srgb, var(--accent-cyan) 25%, transparent);
  box-shadow: 0 0 20px color-mix(in srgb, var(--accent-yellow) 40%, transparent);
}

.choice-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.choices-custom-input {
  display: flex;
  gap: 10px;
  padding-top: 12px;
  border-top: 2px dashed var(--accent-magenta);
}

.custom-input-label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.custom-input-hint {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, var(--foreground) 80%, var(--accent-cyan));
}

.custom-input-field {
  appearance: none;
  padding: 10px 14px;
  border: 3px solid var(--accent-magenta);
  border-radius: 0;
  background: color-mix(in srgb, var(--background) 60%, transparent);
  font-size: 0.95rem;
  color: var(--foreground);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.custom-input-field:focus {
  outline: none;
  border-color: var(--accent-yellow);
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent-magenta) 40%, transparent);
}

.custom-input-field::placeholder {
  color: color-mix(in srgb, var(--foreground) 50%, transparent);
}

.custom-input-btn {
  appearance: none;
  padding: 10px 18px;
  border: 3px solid var(--accent-yellow);
  border-radius: 0;
  background: linear-gradient(135deg, var(--accent-yellow), var(--accent-orange));
  font-family: var(--font-heading);
  font-size: 0.9rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--background);
  cursor: pointer;
  transition: all 200ms ease;
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent-yellow) 40%, transparent);
  align-self: flex-end;
}

.custom-input-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 0 20px color-mix(in srgb, var(--accent-orange) 50%, transparent);
}

.custom-input-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--muted);
  border-color: var(--muted);
  box-shadow: none;
}

.choices-status {
  margin: 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-cyan) 20%, transparent);
  font-size: 0.85rem;
  color: var(--accent-cyan);
  text-align: center;
  animation: pulse 1.5s ease infinite;
}

@media (max-width: 680px) {
  .choices-panel {
    width: 95%;
  }

  .choices-custom-input {
    flex-direction: column;
  }

  .custom-input-btn {
    width: 100%;
  }
}

/* 生成中遮罩层样式 */
.generating-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  backdrop-filter: none;
}

.generating-modal {
  padding: 32px 48px;
  border: 4px solid var(--accent-cyan);
  border-radius: 0;
  background: color-mix(in srgb, var(--background) 90%, transparent);
  box-shadow:
    0 0 40px color-mix(in srgb, var(--accent-cyan) 50%, transparent),
    12px 12px 0 var(--accent-purple);
  text-align: center;
}

.generating-icon {
  font-size: 3rem;
  animation: bounce 1s ease infinite;
}

.generating-title {
  margin: 16px 0 8px;
  font-family: var(--font-heading);
  font-size: 1.4rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--accent-cyan);
  text-shadow: var(--text-shadow-single);
}

.generating-hint {
  margin: 0;
  font-size: 0.9rem;
  color: color-mix(in srgb, var(--foreground) 80%, var(--muted));
}

.generating-spinner {
  margin-top: 20px;
  display: flex;
  justify-content: center;
  gap: 8px;
}

.spinner-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent-cyan);
  animation: spinner-bounce 1.4s ease-in-out infinite;
}

.spinner-dot:nth-child(1) {
  animation-delay: 0s;
}

.spinner-dot:nth-child(2) {
  animation-delay: 0.2s;
}

/* 顶部折叠菜单样式 */
.top-menu-panel {
  position: absolute;
  top: 68px;
  left: 20px;
  z-index: 16;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 168px;
  padding: 8px;
  border: 2px solid var(--accent-cyan);
  border-radius: 10px;
  background: color-mix(in srgb, var(--background) 95%, transparent);
  backdrop-filter: blur(8px);
  box-shadow:
    0 0 20px color-mix(in srgb, var(--accent-cyan) 30%, transparent),
    6px 6px 0 color-mix(in srgb, var(--accent-purple) 70%, transparent);
}

.top-menu-btn {
  appearance: none;
  min-width: 100%;
  border: 2px solid var(--accent-magenta);
  border-radius: 8px;
  padding: 8px 12px;
  font: 700 0.78rem/1 var(--font-body);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: left;
  color: var(--accent-magenta);
  background: color-mix(in srgb, var(--accent-magenta) 15%, transparent);
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.top-menu-btn:hover:not(:disabled) {
  background: var(--accent-magenta);
  color: var(--bg);
  transform: translateY(-1px);
}

.top-menu-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.top-menu-btn.top-menu-back {
  border-color: var(--accent-yellow);
  color: var(--accent-yellow);
  background: color-mix(in srgb, var(--accent-yellow) 16%, transparent);
}

.top-menu-btn.top-menu-back:hover:not(:disabled) {
  background: var(--accent-yellow);
  color: var(--bg);
}

.top-menu-btn.top-menu-quick {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: color-mix(in srgb, var(--accent-cyan) 15%, transparent);
}

.top-menu-btn.top-menu-quick:hover:not(:disabled) {
  background: var(--accent-cyan);
  color: var(--bg);
}

.top-menu-btn.top-menu-save.is-active {
  background: var(--accent-magenta);
  color: var(--bg);
}

.top-menu-btn.top-menu-history {
  border-color: var(--accent-yellow);
  color: var(--accent-yellow);
  background: color-mix(in srgb, var(--accent-yellow) 12%, transparent);
}

.top-menu-btn.top-menu-history:hover:not(:disabled) {
  background: var(--accent-yellow);
  color: var(--bg);
}

.top-menu-btn.top-menu-history.is-active {
  background: var(--accent-yellow);
  color: var(--bg);
}

.save-toast {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  animation: toast-slide 0.3s ease;
  z-index: 10;
}

.save-toast.success {
  background: var(--accent-cyan);
  color: var(--bg);
}

.save-toast.error {
  background: var(--accent-orange);
  color: var(--bg);
}

.toast-icon {
  font-size: 1rem;
}

@keyframes toast-slide {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.save-panel {
  position: absolute;
  top: 80px;
  right: 20px;
  width: 320px;
  border: 4px solid var(--accent-magenta);
  border-radius: 0;
  background: color-mix(in srgb, var(--bg) 95%, transparent);
  backdrop-filter: blur(8px);
  box-shadow:
    0 0 30px color-mix(in srgb, var(--accent-magenta) 40%, transparent),
    8px 8px 0 var(--accent-cyan);
  z-index: 15;
  animation: panel-slide 0.3s ease;
}

@keyframes panel-slide {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.save-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 2px dashed var(--accent-magenta);
}

.save-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--accent-magenta);
}

.save-close {
  appearance: none;
  border: none;
  background: transparent;
  font-size: 1.2rem;
  color: var(--muted-foreground);
  cursor: pointer;
  padding: 4px;
}

.save-close:hover {
  color: var(--accent-orange);
}

.save-panel-body {
  padding: 16px;
}

.save-info {
  margin: 0 0 12px;
  font-size: 0.9rem;
  color: var(--muted-foreground);
}

.save-preview {
  padding: 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-panel) 50%, transparent);
  border: 1px dashed var(--border);
}

.preview-label {
  margin: 0 0 4px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}

.preview-text {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted-foreground);
  line-height: 1.4;
}

.save-error {
  margin: 12px 0 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-orange) 20%, transparent);
  color: var(--accent-orange);
  font-size: 0.85rem;
}

.save-success {
  margin: 12px 0 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-cyan) 20%, transparent);
  color: var(--accent-cyan);
  font-size: 0.85rem;
}

.save-panel-footer {
  padding: 12px 16px;
  border-top: 2px dashed var(--accent-magenta);
}

.save-btn {
  appearance: none;
  width: 100%;
  border: 2px solid var(--accent-cyan);
  border-radius: 0;
  padding: 10px 20px;
  font: 600 1rem/1 var(--font-body);
  color: var(--bg);
  background: var(--accent-cyan);
  cursor: pointer;
  transition: all 0.2s ease;
}

.save-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-cyan) 80%, var(--accent-magenta));
  transform: scale(1.02);
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .top-menu-panel {
    left: 8px;
    top: 56px;
  }

  .save-panel {
    width: 280px;
    right: 10px;
    top: 72px;
  }
}

.spinner-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

@keyframes spinner-bounce {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

/* CG 生成按钮样式 */
.action-cg {
  border-color: var(--accent-magenta);
  color: var(--accent-magenta);
  background: color-mix(in srgb, var(--accent-magenta) 15%, transparent);
}

.action-cg:hover:not(:disabled) {
  background: var(--accent-magenta);
  color: var(--bg);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent-magenta) 40%, transparent);
}

.action-cg.is-active {
  background: var(--accent-magenta);
  color: var(--bg);
}

/* CG 结果面板样式 */
.cg-generating-overlay {
  z-index: 36;
}

.cg-result-overlay {
  position: fixed;
  inset: 0;
  z-index: 38;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.62);
  padding: 14px;
}

.cg-result-panel {
  width: min(94vw, 760px);
  max-height: 90dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 2px solid var(--accent-magenta);
  border-radius: 12px;
  background: color-mix(in srgb, var(--background) 94%, transparent);
  box-shadow:
    0 0 32px color-mix(in srgb, var(--accent-magenta) 40%, transparent),
    10px 10px 0 color-mix(in srgb, var(--accent-purple) 72%, transparent);
}

.cg-result-frame {
  border: 2px solid var(--accent-cyan);
  border-radius: 10px;
  background: color-mix(in srgb, var(--background) 88%, black 12%);
  overflow: hidden;
  width: 100%;
  min-height: 120px;
  max-height: 72dvh;
}

.cg-result-image {
  display: block;
  width: 100%;
  max-height: 72dvh;
  object-fit: contain;
}

.cg-result-summary {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent-cyan) 45%, transparent);
  background: color-mix(in srgb, var(--accent-cyan) 12%, transparent);
  color: var(--foreground);
  font-size: 0.86rem;
  line-height: 1.45;
}

.cg-result-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.cg-result-btn {
  appearance: none;
  border: 2px solid var(--accent-cyan);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease, background 0.2s ease;
}

.cg-result-btn:hover {
  transform: translateY(-1px);
}

.cg-result-btn-confirm {
  background: transparent;
  color: var(--accent-cyan);
}

.cg-result-btn-save {
  background: var(--accent-cyan);
  color: var(--background);
}

.cg-status-toast {
  position: fixed;
  left: 50%;
  top: 84px;
  transform: translateX(-50%);
  z-index: 40;
  max-width: min(92vw, 560px);
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--accent-cyan);
  background: color-mix(in srgb, var(--background) 92%, transparent);
  color: var(--accent-cyan);
  font-size: 0.82rem;
  line-height: 1.4;
  text-align: center;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}

.cg-status-toast.is-success {
  border-color: #4ade80;
  color: #4ade80;
}

.cg-status-toast.is-error {
  border-color: var(--accent-orange);
  color: var(--accent-orange);
}

@media (max-width: 768px) {
  .cg-result-overlay {
    padding: 8px;
  }

  .cg-result-panel {
    width: 96vw;
    padding: 9px;
    gap: 8px;
    max-height: 92dvh;
  }

  .cg-result-summary {
    font-size: 0.8rem;
  }

  .cg-result-actions {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .cg-result-btn {
    width: 100%;
    padding: 8px 10px;
    font-size: 0.82rem;
  }

  .cg-status-toast {
    top: 72px;
    font-size: 0.78rem;
  }
}

</style>
