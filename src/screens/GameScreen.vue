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
  generateMiniTheater,
  generateStory,
  generateWorldBookOpeningDialogue,
  generateCardContent,
  buildStoryPrompt,
  parseStoryContent,
  toGameScript,
  hasChoices,
  extractChoices,
} from '../llm'
import {
  drawRandomCard,
  loadCardIndex,
  getCardInfo,
  getCardConfigPath,
  setCardConfigPath,
  setCustomCardConfig,
  clearCustomCardConfig,
} from '../cards/cardService'
import {
  saveCardToCollection,
  isCardCollected,
} from '../cards/cardCollectionService'
import {
  exportCardFromDataAndSave,
  exportCardFromDataAndShare,
} from '../cards/cardExportService'
import { saveGame, createHistoryBackup, formatTimestamp } from '../save/saveManager'
import { kvStorage } from '../storage/index.js'
import { DEFAULT_NARRATOR_ID, loadNarratorProfiles, resolveNarratorProfile } from '../narrator/narratorStore'
import MusicPlayer from '../components/MusicPlayer.vue'
import Phone from '../components/Phone.vue'
import HandheldConsole from '../components/HandheldConsole.vue'
import Backpack from '../components/Backpack.vue'
import PluginComponent from '../plugins/PluginComponent.vue'
import RelationshipPanel from '../components/RelationshipPanel.vue'
import RelationshipChangeToast from '../components/RelationshipChangeToast.vue'
import {
  initRelationshipSystem,
  getCharacterRelationship,
  updateRelationship,
  getAllRelationships,
  getRelationshipSnapshot,
  getRelationshipPromptContext,
} from '../relationship/index.js'
import {
  doesFavorMeetLevelCondition,
  getLevelRange,
} from '../relationship/relationshipLevels.js'
import { PluginTypes } from '../plugins/pluginManager.js'
import CGGeneratorModal from '../components/CGGeneratorModal.vue'
import { generateCG, getImageBase64 } from '../comfyui/comfyuiService.js'
import { isAndroid, isNative } from '../utils/platform.js'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { importCardDirectoryNative } from '../native/cardImportPlugin'
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
const RELATIONSHIP_LEDGER_STORAGE_PREFIX = 'relationship-ledger'

const SESSION_SCOPED_STORAGE_PREFIXES = [
  'phone-sms-threads',
  'phone-moments-feed',
  'phone-forum-posts',
  'phone-news-events',
  'phone-map-data',
  LLM_SETTINGS_STORAGE_PREFIX,
  RELATIONSHIP_LEDGER_STORAGE_PREFIX,
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

const OPENING_DIALOGUE_MIN_LINES = 10
const OPENING_DIALOGUE_MAX_LINES = 15
const isInitializingOpeningDialogue = ref(false)
const isAutoOpeningGenerating = ref(false)

const normalizeOpeningDialogueLines = (rawLines, options = {}) => {
  const min = Number.isFinite(options.min) ? Math.max(0, Math.floor(options.min)) : 1
  const max = Number.isFinite(options.max) ? Math.max(min, Math.floor(options.max)) : 200
  const normalized = Array.isArray(rawLines)
    ? rawLines
      .map((line) => ({
        speaker: String(line?.speaker || '旁白').trim() || '旁白',
        text: String(line?.text || '').trim(),
        emotion: line?.emotion || null,
      }))
      .filter((line) => line.text)
      .slice(0, max)
    : []

  if (normalized.length < min) {
    return []
  }

  return normalized
}

const resolveOpeningDialogueMode = (book) => {
  const mode = String(book?.openingDialogueMode || '').trim().toLowerCase()
  return mode === 'custom' ? 'custom' : 'auto'
}

// 对话脚本（改为 ref 以支持动态添加）- 初始化使用默认开场白
const dialogueScript = ref([...defaultOpeningDialogue])

// 初始化开场白（根据世界书或使用默认）
const initializeOpeningDialogue = async () => {
  if (isInitializingOpeningDialogue.value) return

  isInitializingOpeningDialogue.value = true
  try {
    const book = activeBook.value
    const openingMode = resolveOpeningDialogueMode(book)
    const customOpening = openingMode === 'custom'
      ? normalizeOpeningDialogueLines(book?.openingDialogue, { min: 1, max: 120 })
      : []

    if (customOpening.length > 0) {
      dialogueScript.value = customOpening
      currentLineIndex.value = 0
      return
    }

    if (book) {
      isAutoOpeningGenerating.value = true
      try {
        const generatedResult = await generateWorldBookOpeningDialogue({
          worldBook: book,
          minLines: OPENING_DIALOGUE_MIN_LINES,
          maxLines: OPENING_DIALOGUE_MAX_LINES,
        })
        if (generatedResult.success && Array.isArray(generatedResult.openingDialogue)) {
          const generatedOpening = normalizeOpeningDialogueLines(generatedResult.openingDialogue, {
            min: OPENING_DIALOGUE_MIN_LINES,
            max: OPENING_DIALOGUE_MAX_LINES,
          })
          if (generatedOpening.length >= OPENING_DIALOGUE_MIN_LINES) {
            dialogueScript.value = generatedOpening
            currentLineIndex.value = 0
            return
          }
        } else if (generatedResult.error) {
          console.warn('[opening-dialogue] LLM generation failed:', generatedResult.error)
        }
      } finally {
        isAutoOpeningGenerating.value = false
      }
    }

    const fallbackBookOpening = normalizeOpeningDialogueLines(book?.openingDialogue, { min: 1, max: 120 })
    dialogueScript.value = fallbackBookOpening.length > 0 ? fallbackBookOpening : [...defaultOpeningDialogue]
    currentLineIndex.value = 0
  } finally {
    isAutoOpeningGenerating.value = false
    isInitializingOpeningDialogue.value = false
  }
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
const showDebugPanel = ref(false)
const showInputTokensHud = ref(false)
const showOutputTokensHud = ref(false)
const storyTokenUsage = ref({
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
})
const llmSettingsStorageKey = computed(() => getScopedStorageKey(LLM_SETTINGS_STORAGE_PREFIX))
const isGeneratingMiniTheater = ref(false)
const showMiniTheaterPanel = ref(false)
const miniTheaterError = ref('')
const miniTheaterThemeInput = ref('')
const miniTheaterTitle = ref('')
const miniTheaterScript = ref([])
const miniTheaterLineIndex = ref(0)
const isMiniTheaterMode = ref(false)
const MINI_THEATER_MIN_LINES = 3
const MINI_THEATER_MAX_LINES = 8

// ========== 随机小卡片功能 ==========
const showCardPanel = ref(false)
const isGeneratingCard = ref(false)
const cardError = ref('')
const currentCard = ref(null) // 当前显示的卡片信息
const currentCardContent = ref(null) // 当前卡片生成的内容
const cardIndexData = ref(null) // 卡片索引数据缓存

// ========== 卡片收藏功能 ==========
const isSavingCard = ref(false)
const isCurrentCardCollected = ref(false)
const cardSaveMessage = ref('')
const cardSaveMessageType = ref('success')
let cardSaveMessageTimer = null
const isExportingCard = ref(false)
const isSharingCard = ref(false)

// ========== 卡片路径配置功能 ==========
const showCardSettings = ref(false)
const currentCardConfigPath = ref('')
const cardConfigPathInput = ref('')
const cardConfigPathSaving = ref(false)
const cardConfigPathError = ref('')
const cardConfigPathSaved = ref(false)
const cardConfigFileInput = ref(null)

const normalizeMiniTheaterLine = (line) => {
  if (!line || typeof line !== 'object') {
    return null
  }

  const speaker = String(line.speaker || '旁白').trim() || '旁白'
  const text = String(line.text || '').trim()
  if (!text) {
    return null
  }

  return {
    speaker,
    emotion: String(line.emotion || 'default').trim() || 'default',
    text,
    highlight: Boolean(line.highlight),
    storyTime: String(line.storyTime || line.time || line.date || '').trim(),
  }
}

const normalizeMiniTheaterScript = (lines) => {
  if (!Array.isArray(lines)) {
    return []
  }
  return lines
    .map((line) => normalizeMiniTheaterLine(line))
    .filter(Boolean)
    .slice(0, MINI_THEATER_MAX_LINES)
}

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
const showRelationshipTablePanel = ref(false)
// 新增：好感度面板状态
const showAffectionPanel = ref(false)
const activeRelationshipChange = ref(null) // 当前显示的变化提示
const RELATIONSHIP_LEDGER_VERSION = 1
const RELATIONSHIP_LEDGER_MAX_ROWS = 600
const createEmptyRelationshipLedger = () => ({
  version: RELATIONSHIP_LEDGER_VERSION,
  rows: [],
})
const relationshipLedger = ref(createEmptyRelationshipLedger())
const relationshipLedgerStorageKey = computed(() => getScopedStorageKey(RELATIONSHIP_LEDGER_STORAGE_PREFIX))

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

const parseTokenCount = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }
  return parsed
}

const normalizeTokenUsage = (rawUsage) => {
  const usage = rawUsage && typeof rawUsage === 'object' ? rawUsage : {}
  const inputTokens = parseTokenCount(
    usage.prompt_tokens ??
    usage.input_tokens ??
    usage.promptTokens ??
    usage.inputTokens,
  )
  const outputTokens = parseTokenCount(
    usage.completion_tokens ??
    usage.output_tokens ??
    usage.completionTokens ??
    usage.outputTokens,
  )
  const explicitTotal = parseTokenCount(
    usage.total_tokens ??
    usage.totalTokens,
  )
  const fallbackTotal =
    Number.isFinite(inputTokens) && Number.isFinite(outputTokens)
      ? inputTokens + outputTokens
      : null

  return {
    inputTokens,
    outputTokens,
    totalTokens: explicitTotal ?? fallbackTotal,
  }
}

const resetStoryTokenUsage = () => {
  storyTokenUsage.value = normalizeTokenUsage(null)
}

const updateStoryTokenUsageFromResponse = (rawResponse) => {
  const usage =
    rawResponse?.usage ??
    rawResponse?.token_usage ??
    rawResponse?.tokenUsage ??
    null
  storyTokenUsage.value = normalizeTokenUsage(usage)
}

const formatTokenForHud = (value) => {
  const normalized = parseTokenCount(value)
  if (!Number.isFinite(normalized)) {
    return '--'
  }
  return normalized.toLocaleString('zh-CN')
}

const inputTokensHudText = computed(() => formatTokenForHud(storyTokenUsage.value.inputTokens))
const outputTokensHudText = computed(() => formatTokenForHud(storyTokenUsage.value.outputTokens))
const totalTokensHudText = computed(() => formatTokenForHud(storyTokenUsage.value.totalTokens))

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

  const sourceDebugHud = source.debugHud && typeof source.debugHud === 'object'
    ? source.debugHud
    : {}
  const fallbackDebugHud = fallbackSource.debugHud && typeof fallbackSource.debugHud === 'object'
    ? fallbackSource.debugHud
    : {}

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
    debugHud: {
      showInputTokens: Boolean(
        sourceDebugHud.showInputTokens ??
        source.showInputTokensHud ??
        fallbackDebugHud.showInputTokens ??
        fallbackSource.showInputTokensHud ??
        showInputTokensHud.value,
      ),
      showOutputTokens: Boolean(
        sourceDebugHud.showOutputTokens ??
        source.showOutputTokensHud ??
        fallbackDebugHud.showOutputTokens ??
        fallbackSource.showOutputTokensHud ??
        showOutputTokensHud.value,
      ),
    },
  }
}

const applyLlmSettingsPayload = (payload, fallbackValue = null) => {
  const normalized = normalizeLlmSettingsPayload(payload, fallbackValue)
  selectedMessageRangeKey.value = normalized.selectedMessageRangeKey
  generateMessageRange.value = normalized.generateMessageRange
  customMessageRange.value = normalized.customMessageRange
  storyContextLineCount.value = normalized.storyContextLineCount
  storyMaxTokens.value = normalized.storyMaxTokens
  showInputTokensHud.value = normalized.debugHud.showInputTokens
  showOutputTokensHud.value = normalized.debugHud.showOutputTokens
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
  debugHud: {
    showInputTokens: showInputTokensHud.value,
    showOutputTokens: showOutputTokensHud.value,
  },
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

const updateShowInputTokensHud = (event) => {
  showInputTokensHud.value = Boolean(event?.target?.checked)
  void persistLlmSettings()
}

const updateShowOutputTokensHud = (event) => {
  showOutputTokensHud.value = Boolean(event?.target?.checked)
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
const hasMountedGameScreen = ref(false)
const DEFAULT_STORY_TIME_LABEL = '2024年2月3日'
const getCurrentStoryTimeLabel = () => DEFAULT_STORY_TIME_LABEL
const normalizeStoryTimeLabel = (value, fallback = getCurrentStoryTimeLabel()) => {
  const normalized = String(value || '').trim()
  return normalized || fallback
}
const resolveLineStoryTimeLabel = (line) => {
  if (!line || typeof line !== 'object') return ''
  return String(line.storyTime || line.time || line.date || '').trim()
}
const hasStoryTimeProgressed = (currentStoryTime, nextStoryTime) => {
  const currentText = String(currentStoryTime || '').trim()
  const nextText = String(nextStoryTime || '').trim()
  if (!nextText) return false
  if (!currentText) return true
  return nextText !== currentText
}

const incrementDayForDateParts = (yearText, monthText, dayText) => {
  const year = Number.parseInt(String(yearText), 10)
  const month = Number.parseInt(String(monthText), 10)
  const day = Number.parseInt(String(dayText), 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + 1)

  return {
    year: String(date.getFullYear()).padStart(4, '0'),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    day: String(date.getDate()).padStart(2, '0'),
  }
}

const createProgressedStoryTimeLabel = (baseStoryTime) => {
  const text = String(baseStoryTime || '').trim()
  if (!text) return ''

  // 中文日期（允许前后缀），例如：星历2501年04月07日、2501年4月7日 夜
  const chineseDateMatch = text.match(/^(.*?)(\d{4})年(\d{1,2})月(\d{1,2})日?(.*)$/)
  if (chineseDateMatch) {
    const [, prefix, yearText, monthText, dayText, suffix] = chineseDateMatch
    const nextDate = incrementDayForDateParts(yearText, monthText, dayText)
    if (nextDate) {
      return `${prefix}${nextDate.year}年${nextDate.month}月${nextDate.day}日${suffix}`
    }
  }

  // 公历风格（允许前后缀），例如：2026-04-07、2026/4/7
  const westernDateMatch = text.match(/^(.*?)(\d{4})([-/.])(\d{1,2})\3(\d{1,2})(.*)$/)
  if (westernDateMatch) {
    const [, prefix, yearText, separator, monthText, dayText, suffix] = westernDateMatch
    const nextDate = incrementDayForDateParts(yearText, monthText, dayText)
    if (nextDate) {
      return `${prefix}${nextDate.year}${separator}${nextDate.month}${separator}${nextDate.day}${suffix}`
    }
  }

  // 回退：将最后一个数字 +1（如“第12天” -> “第13天”）
  const lastNumberMatch = text.match(/(\d+)(?!.*\d)/)
  if (lastNumberMatch) {
    const oldValue = lastNumberMatch[1]
    const nextValue = String(Number.parseInt(oldValue, 10) + 1).padStart(oldValue.length, '0')
    return `${text.slice(0, lastNumberMatch.index)}${nextValue}${text.slice((lastNumberMatch.index || 0) + oldValue.length)}`
  }

  return `${text}·后续`
}
const storyTimeLabel = ref(getCurrentStoryTimeLabel())

const currentLine = computed(() => dialogueScript.value[currentLineIndex.value])
const isLastLine = computed(() => currentLineIndex.value === dialogueScript.value.length - 1)
const isAndroidPlatform = computed(() => isAndroid())
const storyTimelineLabel = computed(() => {
  const currentLineStoryTime = resolveLineStoryTimeLabel(currentLine.value)
  if (currentLineStoryTime) {
    return currentLineStoryTime
  }
  return storyTimeLabel.value
})
const EMPTY_DISPLAY_LINE = Object.freeze({
  speaker: '旁白',
  emotion: 'default',
  text: '...',
  highlight: false,
})
const displayDialogueScript = computed(() => {
  if (isMiniTheaterMode.value) {
    return miniTheaterScript.value
  }
  return dialogueScript.value
})
const displayLineIndex = computed(() => {
  if (isMiniTheaterMode.value) {
    return miniTheaterLineIndex.value
  }
  return currentLineIndex.value
})
const displayLine = computed(() => {
  return displayDialogueScript.value[displayLineIndex.value] || EMPTY_DISPLAY_LINE
})
const displayDialogueLength = computed(() => displayDialogueScript.value.length)
const isDisplayLastLine = computed(() => {
  const total = displayDialogueLength.value
  if (total <= 0) return true
  return displayLineIndex.value >= total - 1
})
const nextLineButtonLabel = computed(() => {
  if (isMiniTheaterMode.value) {
    return isDisplayLastLine.value ? '结束小剧场' : '下一句'
  }
  return isLastLine.value ? '继续' : '下一句'
})
const isPrevLineDisabled = computed(() => {
  if (isMiniTheaterMode.value) {
    return miniTheaterLineIndex.value === 0
  }
  return currentLineIndex.value === 0
})
const miniTheaterActionLabel = computed(() => {
  return isMiniTheaterMode.value ? '🎭 退出小剧场' : '🎭 小剧场'
})

const createFallbackChoices = () => ({
  prompt: '你接下来要怎么做？',
  options: [
    { id: `choice_fallback_${Date.now()}_0`, text: '先观察局势', action: 'observe' },
    { id: `choice_fallback_${Date.now()}_1`, text: '谨慎推进', action: 'advance_carefully' },
    { id: `choice_fallback_${Date.now()}_2`, text: '直接行动', action: 'act_now' },
  ],
  allowCustomInput: true,
})

const ensureLastDialogueHasChoices = (dialogues) => {
  if (!Array.isArray(dialogues) || dialogues.length === 0) {
    return []
  }

  const lastIndex = dialogues.length - 1
  const lastDialogue = dialogues[lastIndex]
  if (hasChoices(lastDialogue)) {
    return dialogues
  }

  const nextDialogues = dialogues.slice()
  nextDialogues[lastIndex] = {
    ...lastDialogue,
    choices: createFallbackChoices(),
  }
  return nextDialogues
}

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
  if (isMiniTheaterMode.value) return false

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
const normalizeTextArray = (items) => {
  if (!Array.isArray(items)) return []
  return [...new Set(items.map((item) => normalizeText(item)).filter(Boolean))]
}
const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
const normalizeRelationshipLedgerMetrics = (value, fallback = createDefaultRelationshipBase()) => {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}
  return normalizeRelationshipBase({
    favor: toFiniteNumber(source.favor, fallback.favor),
    trust: toFiniteNumber(source.trust, fallback.trust),
    stance: toFiniteNumber(source.stance, fallback.stance),
  })
}
const truncateRelationshipLedgerText = (value, maxLength = 80) => {
  const text = normalizeText(value).replace(/\s+/g, ' ')
  if (!text) return ''
  const safeMaxLength = Number.isFinite(maxLength) ? Math.max(4, Math.floor(maxLength)) : 80
  if (text.length <= safeMaxLength) return text
  return `${text.slice(0, safeMaxLength - 1)}…`
}
const resolveRelationshipCharacterName = (characterId, fallbackName = '') => {
  const normalizedId = normalizeText(characterId)
  if (!normalizedId) {
    return normalizeText(fallbackName) || '未知角色'
  }

  const characters = Array.isArray(activeBook.value?.characters) ? activeBook.value.characters : []
  const matched = characters.find((char) => normalizeText(char?.id) === normalizedId)
  if (matched) {
    return (
      normalizeText(matched?.name) ||
      normalizeText(matched?.nickname) ||
      normalizedId
    )
  }

  return normalizeText(fallbackName) || normalizedId
}
const normalizeRelationshipLedgerRow = (rawRow, rowIndex = 0) => {
  const defaultMetrics = createDefaultRelationshipBase()
  const before = normalizeRelationshipLedgerMetrics(rawRow?.before, defaultMetrics)
  const after = normalizeRelationshipLedgerMetrics(rawRow?.after, before)
  const fallbackDelta = {
    favor: after.favor - before.favor,
    trust: after.trust - before.trust,
    stance: after.stance - before.stance,
  }
  const sourceDelta = rawRow?.delta && typeof rawRow.delta === 'object' && !Array.isArray(rawRow.delta)
    ? rawRow.delta
    : fallbackDelta

  const delta = {
    favor: toFiniteNumber(sourceDelta.favor, fallbackDelta.favor),
    trust: toFiniteNumber(sourceDelta.trust, fallbackDelta.trust),
    stance: toFiniteNumber(sourceDelta.stance, fallbackDelta.stance),
  }

  const createdAt = Number.parseInt(String(rawRow?.createdAt ?? ''), 10)
  const lineIndex = Number.parseInt(String(rawRow?.lineIndex ?? ''), 10)
  const characterId = normalizeText(rawRow?.characterId)
  const storyTime = normalizeText(rawRow?.storyTime)
  const choiceText = truncateRelationshipLedgerText(rawRow?.choiceText, 90)
  const triggeredEvents = normalizeTextArray(rawRow?.triggeredEvents)
  const rowId = normalizeText(rawRow?.id) || `rel_${createdAt || Date.now()}_${rowIndex}`

  return {
    id: rowId,
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now(),
    storyTime,
    lineIndex: Number.isFinite(lineIndex) && lineIndex > 0 ? lineIndex : 0,
    characterId,
    characterName: resolveRelationshipCharacterName(characterId, rawRow?.characterName),
    before,
    after,
    delta,
    triggeredEvents,
    choiceText,
  }
}
const normalizeRelationshipLedgerPayload = (rawValue, fallbackValue = null) => {
  const source = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {}
  const fallbackSource = fallbackValue && typeof fallbackValue === 'object' && !Array.isArray(fallbackValue)
    ? fallbackValue
    : {}

  const sourceRows = Array.isArray(source.rows)
    ? source.rows
    : (Array.isArray(rawValue) ? rawValue : [])
  const fallbackRows = Array.isArray(fallbackSource.rows)
    ? fallbackSource.rows
    : (Array.isArray(fallbackValue) ? fallbackValue : [])
  const rowsToUse = sourceRows.length > 0 || !fallbackRows.length ? sourceRows : fallbackRows
  const normalizedRows = rowsToUse
    .map((row, index) => normalizeRelationshipLedgerRow(row, index))
    .slice(-RELATIONSHIP_LEDGER_MAX_ROWS)

  return {
    version: RELATIONSHIP_LEDGER_VERSION,
    rows: normalizedRows,
  }
}
const relationshipLedgerRows = computed(() => {
  const rows = Array.isArray(relationshipLedger.value?.rows) ? relationshipLedger.value.rows : []
  return [...rows].reverse()
})
const relationshipLedgerCountText = computed(() => String(relationshipLedgerRows.value.length))
const formatRelationshipLedgerTimestamp = (timestamp) => {
  const value = Number.parseInt(String(timestamp ?? ''), 10)
  if (!Number.isFinite(value) || value <= 0) return '--'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}
const formatRelationshipDelta = (value) => {
  const normalized = toFiniteNumber(value, 0)
  if (normalized > 0) return `+${normalized}`
  if (normalized < 0) return `${normalized}`
  return '0'
}
const resolveRelationshipDeltaClass = (value) => {
  const normalized = toFiniteNumber(value, 0)
  if (normalized > 0) return 'is-up'
  if (normalized < 0) return 'is-down'
  return 'is-flat'
}
const formatRelationshipEventsText = (events) => {
  const list = normalizeTextArray(events)
  if (list.length === 0) return '—'
  return list.join('、')
}
const formatRelationshipChoiceText = (value) => {
  const text = normalizeText(value)
  return text || '—'
}
const persistRelationshipLedger = async () => {
  try {
    const payload = normalizeRelationshipLedgerPayload(relationshipLedger.value, createEmptyRelationshipLedger())
    relationshipLedger.value = payload
    await kvStorage.set(relationshipLedgerStorageKey.value, payload)
  } catch {
    // no-op
  }
}
const loadRelationshipLedgerFromStorage = async () => {
  try {
    const rawValue = await kvStorage.get(relationshipLedgerStorageKey.value)
    if (rawValue === undefined || rawValue === null) {
      return false
    }
    relationshipLedger.value = normalizeRelationshipLedgerPayload(rawValue, createEmptyRelationshipLedger())
    return true
  } catch {
    return false
  }
}
const hydrateRelationshipLedgerForScope = async (fallbackValue = null) => {
  const fallbackPayload = normalizeRelationshipLedgerPayload(fallbackValue, createEmptyRelationshipLedger())
  const loaded = await loadRelationshipLedgerFromStorage()
  if (loaded) {
    const loadedRows = Array.isArray(relationshipLedger.value?.rows) ? relationshipLedger.value.rows.length : 0
    const fallbackRows = Array.isArray(fallbackPayload.rows) ? fallbackPayload.rows.length : 0
    if (loadedRows === 0 && fallbackRows > 0) {
      relationshipLedger.value = fallbackPayload
      await persistRelationshipLedger()
    }
    return
  }
  relationshipLedger.value = fallbackPayload
  await persistRelationshipLedger()
}
const buildRelationshipLedgerRowsFromDiff = ({
  beforeState = null,
  afterState = null,
  storyTime = '',
  lineIndex = 0,
  choiceText = '',
  triggeredEvents = [],
} = {}) => {
  const beforeRuntime = mergeRelationshipStateWithBook(activeBook.value, beforeState)
  const afterRuntime = mergeRelationshipStateWithBook(activeBook.value, afterState)
  const characterIds = [...new Set([...Object.keys(beforeRuntime), ...Object.keys(afterRuntime)])]
    .map((item) => normalizeText(item))
    .filter(Boolean)
  if (characterIds.length === 0) return []

  const now = Date.now()
  const normalizedStoryTime = normalizeStoryTimeLabel(storyTime, storyTimelineLabel.value)
  const normalizedLineIndex = Number.isFinite(lineIndex) && lineIndex > 0
    ? Math.floor(lineIndex)
    : Math.max(1, currentLineIndex.value + 1)
  const normalizedChoiceText = truncateRelationshipLedgerText(choiceText, 90)
  const normalizedEvents = normalizeTextArray(triggeredEvents)

  return characterIds
    .map((characterId, index) => {
      const beforeMetrics = normalizeRelationshipLedgerMetrics(beforeRuntime[characterId], createDefaultRelationshipBase())
      const afterMetrics = normalizeRelationshipLedgerMetrics(afterRuntime[characterId], beforeMetrics)
      const delta = {
        favor: afterMetrics.favor - beforeMetrics.favor,
        trust: afterMetrics.trust - beforeMetrics.trust,
        stance: afterMetrics.stance - beforeMetrics.stance,
      }
      const changed = delta.favor !== 0 || delta.trust !== 0 || delta.stance !== 0
      if (!changed) return null

      return normalizeRelationshipLedgerRow({
        id: `rel_${now}_${characterId}_${index}`,
        createdAt: now + index,
        storyTime: normalizedStoryTime,
        lineIndex: normalizedLineIndex,
        characterId,
        characterName: resolveRelationshipCharacterName(characterId),
        before: beforeMetrics,
        after: afterMetrics,
        delta,
        triggeredEvents: normalizedEvents,
        choiceText: normalizedChoiceText,
      }, index)
    })
    .filter(Boolean)
}
const appendRelationshipLedgerRows = async (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return

  const normalizedRows = rows
    .map((row, index) => normalizeRelationshipLedgerRow(row, index))
    .filter(Boolean)
  if (normalizedRows.length === 0) return

  const currentRows = Array.isArray(relationshipLedger.value?.rows) ? relationshipLedger.value.rows : []
  relationshipLedger.value = {
    version: RELATIONSHIP_LEDGER_VERSION,
    rows: [...currentRows, ...normalizedRows].slice(-RELATIONSHIP_LEDGER_MAX_ROWS),
  }
  await persistRelationshipLedger()
}

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
    const normalizedMetrics = normalizeRelationshipBase(metrics)
    
    // 检查数值范围条件
    const meetsBounds = (
      doesMetricMeetBounds(normalizedMetrics.favor, rule?.favorMin, rule?.favorMax) &&
      doesMetricMeetBounds(normalizedMetrics.trust, rule?.trustMin, rule?.trustMax) &&
      doesMetricMeetBounds(normalizedMetrics.stance, rule?.stanceMin, rule?.stanceMax)
    )
    
    if (!meetsBounds) return false
    
    // 检查好感度等级名称条件（新增）
    if (rule?.favorLevel) {
      const meetsLevel = doesFavorMeetLevelCondition(normalizedMetrics.favor, rule.favorLevel)
      if (!meetsLevel) return false
    }
    
    // 检查信任度等级名称条件（新增）
    if (rule?.trustLevel) {
      const meetsTrustLevel = doesFavorMeetLevelCondition(normalizedMetrics.trust, rule.trustLevel)
      if (!meetsTrustLevel) return false
    }
    
    return true
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

const toggleRelationshipTablePanel = () => {
  const nextVisible = !showRelationshipTablePanel.value
  showRelationshipTablePanel.value = nextVisible
}

const closeRelationshipTablePanel = () => {
  showRelationshipTablePanel.value = false
}

// 新增：好感度面板控制函数
const toggleAffectionPanel = () => {
  showAffectionPanel.value = !showAffectionPanel.value
}

const closeAffectionPanel = () => {
  showAffectionPanel.value = false
}

// 新增：显示好感度变化提示
const showRelationshipChangeNotification = (changeData) => {
  activeRelationshipChange.value = changeData
}

// 新增：关闭好感度变化提示
const dismissRelationshipChangeNotification = () => {
  activeRelationshipChange.value = null
}

// 新增：处理导演器关系变更
const handleDirectorRelationshipDeltas = (deltas, reason = '导演器事件') => {
  if (!deltas || deltas.length === 0) return
  
  const results = applyDirectorRelationshipDeltas(deltas, reason)
  
  // 显示变化提示
  for (const result of results) {
    const character = activeBook.value?.characters?.find(c => c.id === result.characterId)
    if (character && result.changes.favor.delta !== 0) {
      showRelationshipChangeNotification({
        characterId: result.characterId,
        characterName: character.name,
        characterPortrait: character.portraits?.[0]?.filePath || '',
        metric: 'favor',
        delta: result.deltas.favor,
        newValue: result.newValues.favor,
        reason: reason,
      })
    }
  }
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

const extractFallbackDialoguesFromRawContent = (rawContent, fallbackStoryTime = '') => {
  const raw = String(rawContent || '').trim()
  if (!raw) return []

  const cleaned = raw
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ''))
    .replace(/\r/g, '\n')

  const lines = cleaned
    .split('\n')
    .map((line) => String(line || '').trim())
    .map((line) => line.replace(/^\d+[\.\)\u3001]\s*/, ''))
    .map((line) => line.replace(/^[-*]\s*/, ''))
    .map((line) => line.replace(/^"+|"+$/g, '').trim())
    .filter((line) => line && !/^[\[\]{},"']+$/.test(line))

  const fallbackDialogues = []
  for (const rawLine of lines) {
    const match = rawLine.match(/^([^:：]{1,20})[:：]\s*(.+)$/)
    const speaker = match ? String(match[1] || '').trim() : '旁白'
    const text = String(match ? match[2] : rawLine).trim()
    if (!text) continue

    fallbackDialogues.push({
      speaker: speaker || '旁白',
      emotion: 'default',
      text,
      highlight: false,
      storyTime: String(fallbackStoryTime || '').trim(),
      choices: null,
      scene: null,
    })
    if (fallbackDialogues.length >= 24) {
      break
    }
  }

  if (fallbackDialogues.length > 0) {
    return fallbackDialogues
  }

  const compact = cleaned.replace(/\s+/g, ' ').trim()
  if (!compact) return []

  return [{
    speaker: '旁白',
    emotion: 'default',
    text: compact.slice(0, 220),
    highlight: false,
    storyTime: String(fallbackStoryTime || '').trim(),
    choices: null,
    scene: null,
  }]
}

// 生成剧情
const handleGenerateStory = async (choiceToApply = null, options = {}) => {
  if (isGenerating.value) return

  isGenerating.value = true
  generateError.value = null
  resetStoryTokenUsage()

  try {
    await persistLlmSettings()

    const overrideUserInput = String(options?.overrideUserInput || '').trim()
    const effectiveUserInput = overrideUserInput || userPromptInput.value
    const relationshipBeforeGeneration = mergeRelationshipStateWithBook(activeBook.value, relationshipState.value)
    const relationshipChoiceText = truncateRelationshipLedgerText(
      choiceToApply?.text || effectiveUserInput,
      90,
    )

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
      currentStoryTime: storyTimelineLabel.value,
      messageCount: actualMessageCount,
      selectedChoice: choiceToApply,
      contextLineCount: storyContextLineCount.value,
      relationshipSnapshot,
      relationshipLedger: relationshipLedger.value?.rows,
      directorDirectives: directorPreview.directives,
    })

    // 调用 LLM API
    const result = await generateStory(prompt, {
      maxTokens: storyMaxTokens.value,
    })

    const rawModelContent = typeof result?.data === 'string'
      ? result.data
      : String(result?.data || '').trim()

    if (!result.success && !rawModelContent) {
      generateError.value = result.error
      return
    }

    updateStoryTokenUsageFromResponse(result.rawResponse)

    // 解析返回内容
    const parsed = parseStoryContent(rawModelContent)
    let normalizedDialogues = []

    if (parsed.success && Array.isArray(parsed.dialogues)) {
      normalizedDialogues = parsed.dialogues
    } else {
      normalizedDialogues = extractFallbackDialoguesFromRawContent(rawModelContent, storyTimelineLabel.value)
      if (normalizedDialogues.length > 0) {
        generateError.value = ''
      } else {
        generateError.value = parsed.error || result.error || '生成失败：未获取到可用剧情内容'
        return
      }
    }

    // 转换为游戏脚本格式并添加到对话列表
    let newDialogues = toGameScript(normalizedDialogues)
    newDialogues = ensureLastDialogueHasChoices(newDialogues)
    
    if (newDialogues.length > 0) {
      if (directorPreview.changed) {
        relationshipState.value = directorPreview.relationshipState
        directorState.value = directorPreview.directorState
      }

      const currentTimelineStoryTime = String(storyTimelineLabel.value || '').trim()
      let latestStoryTime = resolveLineStoryTimeLabel(newDialogues[newDialogues.length - 1])

      // 兼容模型偶发未推进时间线的情况：本地自动修正最后一条剧情时间，避免中断剧情展示
      if (!hasStoryTimeProgressed(currentTimelineStoryTime, latestStoryTime)) {
        const fallbackBaseStoryTime = latestStoryTime || currentTimelineStoryTime
        const progressedStoryTime = createProgressedStoryTimeLabel(fallbackBaseStoryTime)
        if (progressedStoryTime) {
          latestStoryTime = progressedStoryTime
          const lastDialogueIndex = newDialogues.length - 1
          newDialogues[lastDialogueIndex] = {
            ...newDialogues[lastDialogueIndex],
            storyTime: progressedStoryTime,
            time: progressedStoryTime,
            date: progressedStoryTime,
          }
        }
      }

      if (latestStoryTime) {
        storyTimeLabel.value = latestStoryTime
      }

      // 添加新对话到脚本末尾，并清理历史选项
      const mergedScript = [...dialogueScript.value, ...newDialogues]
      const normalizedScript = normalizeDialogueChoicesForHistory(mergedScript)
      dialogueScript.value = normalizedScript

      if (directorPreview.changed) {
        const relationshipRows = buildRelationshipLedgerRowsFromDiff({
          beforeState: relationshipBeforeGeneration,
          afterState: directorPreview.relationshipState,
          storyTime: latestStoryTime || currentTimelineStoryTime || storyTimelineLabel.value,
          lineIndex: normalizedScript.length,
          choiceText: relationshipChoiceText,
          triggeredEvents: directorPreview.triggeredEventNames,
        })
        await appendRelationshipLedgerRows(relationshipRows)
      }
      
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

      // 每次剧情成功推进后，自动写入默认快速存档槽位
      await quickSave({ silent: true })
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
  if (isMiniTheaterMode.value) {
    return
  }

  if (!showGeneratePanel.value) {
    showMiniTheaterPanel.value = false
    closeDialogueHistoryPanel()
    closeRelationshipTablePanel()
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

const clearMiniTheaterMode = () => {
  isMiniTheaterMode.value = false
  miniTheaterScript.value = []
  miniTheaterLineIndex.value = 0
  miniTheaterTitle.value = ''
}

const exitMiniTheater = () => {
  clearMiniTheaterMode()
  miniTheaterError.value = ''
  showMiniTheaterPanel.value = false
}

const goNextMiniTheaterLine = () => {
  const total = miniTheaterScript.value.length
  if (total === 0) {
    exitMiniTheater()
    return
  }

  if (miniTheaterLineIndex.value >= total - 1) {
    exitMiniTheater()
    return
  }

  miniTheaterLineIndex.value += 1
}

const goPrevMiniTheaterLine = () => {
  if (miniTheaterLineIndex.value <= 0) {
    return
  }
  miniTheaterLineIndex.value -= 1
}

const toggleMiniTheaterPanel = async () => {
  if (isMiniTheaterMode.value) {
    exitMiniTheater()
    return
  }

  if (!showMiniTheaterPanel.value) {
    showGeneratePanel.value = false
    showChoicesPanel.value = false
    currentChoices.value = null
    closeDialogueHistoryPanel()
    closeRelationshipTablePanel()
    await loadApiConfigStatus()
  }

  showMiniTheaterPanel.value = !showMiniTheaterPanel.value
  if (!showMiniTheaterPanel.value) {
    miniTheaterError.value = ''
  }
}

const startMiniTheater = async (options = {}) => {
  if (isGeneratingMiniTheater.value || isGenerating.value || isCgGenerating.value) {
    return
  }

  await loadApiConfigStatus()
  if (!hasApiConfig.value) {
    miniTheaterError.value = '请先在设置中配置并应用 API'
    return
  }

  const customTheme = String(options?.customTheme || '').trim()
  if (options?.useCustomTheme && !customTheme) {
    miniTheaterError.value = '请输入小剧场主题'
    return
  }

  isGeneratingMiniTheater.value = true
  miniTheaterError.value = ''

  try {
    const contextStart = Math.max(0, currentLineIndex.value - storyContextLineCount.value + 1)
    const result = await generateMiniTheater({
      worldBook: activeBook.value,
      narratorProfile: effectiveNarrator.value,
      dialogueHistory: dialogueScript.value.slice(contextStart, currentLineIndex.value + 1),
      currentLine: currentLine.value,
      currentStoryTime: storyTimelineLabel.value,
      customTheme,
      maxLines: MINI_THEATER_MAX_LINES,
      maxTokens: Math.min(1600, storyMaxTokens.value),
    })

    if (!result.success) {
      miniTheaterError.value = result.error || '小剧场生成失败'
      return
    }

    const parsedMiniScript = normalizeMiniTheaterScript(result.dialogues)
    if (parsedMiniScript.length < MINI_THEATER_MIN_LINES) {
      miniTheaterError.value = `小剧场内容过短（至少 ${MINI_THEATER_MIN_LINES} 条）`
      return
    }

    if (isTtsPlaying.value || ttsPlayingLineKey.value) {
      stopCurrentTtsPlayback()
    }
    updateTtsStatus('')

    miniTheaterScript.value = parsedMiniScript
    miniTheaterLineIndex.value = 0
    miniTheaterTitle.value = String(
      result.title || customTheme || result.theme || '无题小剧场',
    ).trim() || '无题小剧场'
    isMiniTheaterMode.value = true
    showMiniTheaterPanel.value = false
    showGeneratePanel.value = false
    showChoicesPanel.value = false
    currentChoices.value = null
    selectedChoice.value = null
    customInputText.value = ''
  } catch (error) {
    miniTheaterError.value = `小剧场生成失败: ${error?.message || '未知错误'}`
  } finally {
    isGeneratingMiniTheater.value = false
  }
}

// ========== 随机小卡片功能 ==========

/**
 * 切换小卡片面板显示
 */
const toggleCardPanel = async () => {
  if (!showCardPanel.value) {
    // 打开面板前关闭其他面板
    showGeneratePanel.value = false
    showMiniTheaterPanel.value = false
    showChoicesPanel.value = false
    currentChoices.value = null
    closeDialogueHistoryPanel()
    closeRelationshipTablePanel()
    await loadApiConfigStatus()
    
    // 加载卡片索引数据
    if (!cardIndexData.value) {
      cardIndexData.value = await loadCardIndex()
    }
    
    // 加载当前卡片配置路径
    const path = await getCardConfigPath()
    currentCardConfigPath.value = path
    cardConfigPathInput.value = path
  }
  
  showCardPanel.value = !showCardPanel.value
  if (!showCardPanel.value) {
    cardError.value = ''
    showCardSettings.value = false
  }
}

/**
 * 关闭小卡片面板
 */
const closeCardPanel = () => {
  showCardPanel.value = false
  cardError.value = ''
  showCardSettings.value = false
}

/**
 * 切换卡片设置面板
 */
const toggleCardSettings = () => {
  showCardSettings.value = !showCardSettings.value
  if (showCardSettings.value) {
    // 打开设置时，重置状态
    cardConfigPathError.value = ''
    cardConfigPathSaved.value = false
  }
}

/**
 * 保存卡片配置路径
 */
const saveCardConfigPath = async () => {
  const newPath = cardConfigPathInput.value.trim()
  
  if (!newPath) {
    cardConfigPathError.value = '路径不能为空'
    return
  }
  
  cardConfigPathSaving.value = true
  cardConfigPathError.value = ''
  cardConfigPathSaved.value = false
  
  try {
    // 验证路径是否有效
    const testResponse = await fetch(newPath)
    if (!testResponse.ok) {
      cardConfigPathError.value = `路径无效: HTTP ${testResponse.status}`
      cardConfigPathSaving.value = false
      return
    }
    
    // 尝试解析JSON
    try {
      await testResponse.json()
    } catch {
      cardConfigPathError.value = '配置文件不是有效的JSON格式'
      cardConfigPathSaving.value = false
      return
    }
    
    // 保存路径
    await setCardConfigPath(newPath)
    currentCardConfigPath.value = newPath
    
    // 重新加载卡片索引
    cardIndexData.value = await loadCardIndex()
    
    cardConfigPathSaved.value = true
    cardConfigPathError.value = ''
    
    // 3秒后隐藏成功提示
    setTimeout(() => {
      cardConfigPathSaved.value = false
    }, 3000)
  } catch (error) {
    cardConfigPathError.value = `保存失败: ${error.message || '未知错误'}`
  } finally {
    cardConfigPathSaving.value = false
  }
}

/**
 * 重置卡片配置路径为默认值
 */
const resetCardConfigPath = async () => {
  cardConfigPathInput.value = './data/cards/index.json (默认)'
  
  cardConfigPathSaving.value = true
  cardConfigPathError.value = ''
  cardConfigPathSaved.value = false
  
  try {
    // 清除自定义配置，恢复默认
    await clearCustomCardConfig()
    currentCardConfigPath.value = ''
    
    // 重新加载卡片索引（从默认路径）
    cardIndexData.value = await loadCardIndex()
    
    cardConfigPathSaved.value = true
    cardConfigPathError.value = ''
    
    setTimeout(() => {
      cardConfigPathSaved.value = false
    }, 3000)
  } catch (error) {
    cardConfigPathError.value = `重置失败: ${error.message || '未知错误'}`
  } finally {
    cardConfigPathSaving.value = false
  }
}

/**
 * 触发文件浏览
 */
const triggerCardConfigFileBrowse = async () => {
  if (isAndroid() && isNative()) {
    cardConfigPathSaving.value = true
    cardConfigPathError.value = ''
    cardConfigPathSaved.value = false

    try {
      const result = await importCardDirectoryNative()
      if (!result?.success) {
        if (result?.canceled) {
          return
        }
        cardConfigPathError.value = result?.message || '导入失败，请重试'
        return
      }

      const baseDir = String(result.baseDir || 'native://card-imports/current/')
      const importDisplayPath = String(result.indexPath || `${baseDir}index.json`)
      const importSaved = await setCustomCardConfig(baseDir, importDisplayPath)
      if (!importSaved) {
        cardConfigPathError.value = '导入成功，但保存配置失败'
        return
      }

      cardIndexData.value = await loadCardIndex()
      if (!cardIndexData.value) {
        cardConfigPathError.value = '导入成功，但加载卡片索引失败，请检查目录结构'
        return
      }

      currentCardConfigPath.value = importDisplayPath
      cardConfigPathInput.value = currentCardConfigPath.value
      cardConfigPathSaved.value = true
      cardConfigPathError.value = ''

      setTimeout(() => {
        cardConfigPathSaved.value = false
      }, 3000)
      return
    } catch (error) {
      cardConfigPathError.value = `导入失败: ${error?.message || '未知错误'}`
      return
    } finally {
      cardConfigPathSaving.value = false
    }
  }

  if (cardConfigFileInput.value) {
    cardConfigFileInput.value.click()
  }
}

/**
 * 处理文件选择
 */
 const handleCardConfigFileSelect = async (event) => {
   const file = event.target.files?.[0]
   if (!file) return
   
   cardConfigPathError.value = ''
   cardConfigPathSaved.value = false
   
   try {
     // 读取文件内容验证是否为有效JSON
     const text = await file.text()
     const config = JSON.parse(text)
     
     // 验证基本结构
     if (!config.cards || typeof config.cards !== 'object') {
       cardConfigPathError.value = '配置文件格式无效：缺少 cards 字段'
       return
     }
     
     // Web 文件选择器无法得到可靠目录路径，因此只能验证文件内容
     cardConfigPathError.value = '文件验证成功。Web 端无法自动推导目录，请手动输入卡片目录路径（如 ./data/cards/）'
     
     // 清空缓存，让用户可以重新加载
     cardIndexData.value = config
     
   } catch (error) {
     if (error instanceof SyntaxError) {
       cardConfigPathError.value = '文件不是有效的JSON格式'
     } else {
       cardConfigPathError.value = `加载失败: ${error.message || '未知错误'}`
     }
   }
   
   // 清空input以便再次选择同一文件
   event.target.value = ''
 }

/**
 * 关闭当前显示的卡片
 */
const closeCurrentCard = () => {
  currentCard.value = null
  currentCardContent.value = null
  isCurrentCardCollected.value = false
  isExportingCard.value = false
  isSharingCard.value = false
  cardSaveMessage.value = ''
}

/**
 * 显示卡片保存消息
 * @param {string} message - 消息内容
 * @param {string} type - 消息类型 (success/error)
 * @param {number} duration - 显示时长
 */
const showCardSaveMessage = (message, type = 'success', duration = 3000) => {
  cardSaveMessage.value = message
  cardSaveMessageType.value = type
  
  if (cardSaveMessageTimer) {
    clearTimeout(cardSaveMessageTimer)
    cardSaveMessageTimer = null
  }
  
  if (duration > 0) {
    cardSaveMessageTimer = setTimeout(() => {
      cardSaveMessage.value = ''
      cardSaveMessageTimer = null
    }, duration)
  }
}

/**
 * 保存当前卡片到收藏
 */
const saveCurrentCard = async () => {
  if (!currentCard.value || !currentCardContent.value) {
    showCardSaveMessage('没有可保存的卡片', 'error')
    return
  }
  
  if (isSavingCard.value) {
    return
  }
  
  isSavingCard.value = true
  
  try {
    // 获取当前游戏时间
    const currentGameTime = dialogueScript.value[currentLineIndex.value]?.storyTime || ''
    
    const result = await saveCardToCollection(
      currentCard.value,
      currentCardContent.value,
      {
        gameTime: currentGameTime,
        sceneName: currentSceneName.value || '',
      }
    )
    
    if (result.success) {
      isCurrentCardCollected.value = true
      showCardSaveMessage('卡片已收藏！', 'success')
    } else {
      showCardSaveMessage(result.error || '保存失败', 'error')
    }
  } catch (error) {
    showCardSaveMessage(`保存失败: ${error.message || '未知错误'}`, 'error')
  } finally {
    isSavingCard.value = false
  }
}

/**
 * 导出当前卡片为PNG
 */
const exportCurrentCardAsPng = async () => {
  if (!currentCard.value || !currentCardContent.value) {
    showCardSaveMessage('没有可导出的卡片', 'error')
    return
  }
  
  if (isExportingCard.value) {
    return
  }
  
  isExportingCard.value = true
  
  try {
    const cardData = {
      templateHtml: currentCard.value.templateHtml,
      content: currentCardContent.value,
      cardName: currentCard.value.name,
    }
    
    const result = await exportCardFromDataAndSave(cardData, {
      filename: `${currentCard.value.name || 'card'}_${Date.now()}.png`,
    })
    
    if (result.success) {
      const successMessage = result.savedPath
        ? `卡片已导出：${result.savedPath}`
        : '卡片已导出为PNG！'
      showCardSaveMessage(successMessage, 'success')
    } else {
      showCardSaveMessage(result.error || '导出失败', 'error')
    }
  } catch (error) {
    showCardSaveMessage(`导出失败: ${error.message || '未知错误'}`, 'error')
  } finally {
    isExportingCard.value = false
  }
}

/**
 * 分享当前卡片到社交媒体
 */
const shareCurrentCardAsPng = async () => {
  if (!currentCard.value || !currentCardContent.value) {
    showCardSaveMessage('没有可分享的卡片', 'error')
    return
  }
  
  if (isSharingCard.value || isExportingCard.value) {
    return
  }
  
  isSharingCard.value = true
  
  try {
    const cardData = {
      templateHtml: currentCard.value.templateHtml,
      content: currentCardContent.value,
      cardName: currentCard.value.name,
    }
    
    const result = await exportCardFromDataAndShare(cardData, {
      filename: `${currentCard.value.name || 'card'}_${Date.now()}.png`,
      shareTitle: '分享卡片',
      shareText: '来自 AVG_LLM 的剧情卡片',
      shareDialogTitle: '分享到社交应用',
    })
    
    if (result.success) {
      showCardSaveMessage('已打开系统分享面板', 'success')
    } else {
      showCardSaveMessage(result.error || '分享失败', 'error')
    }
  } catch (error) {
    showCardSaveMessage(`分享失败: ${error.message || '未知错误'}`, 'error')
  } finally {
    isSharingCard.value = false
  }
}

/**
 * 检查当前卡片是否已收藏
 */
const checkCurrentCardCollected = async () => {
  if (!currentCard.value || !currentCardContent.value) {
    isCurrentCardCollected.value = false
    return
  }
  
  try {
    const collected = await isCardCollected(
      currentCard.value.id,
      currentCardContent.value
    )
    isCurrentCardCollected.value = collected
  } catch (error) {
    isCurrentCardCollected.value = false
  }
}

/**
 * 生成随机小卡片
 */
const generateRandomCard = async () => {
  if (isGeneratingCard.value || isGenerating.value || isGeneratingMiniTheater.value || isCgGenerating.value) {
    return
  }
  
  await loadApiConfigStatus()
  if (!hasApiConfig.value) {
    cardError.value = '请先在设置中配置并应用 API'
    return
  }
  
  // 先关闭面板，显示生成中遮罩
  showCardPanel.value = false
  isGeneratingCard.value = true
  cardError.value = ''
  
  try {
    // 1. 随机抽取一张卡片模板
    const cardData = await drawRandomCard()
    if (!cardData || !cardData.promptConfig) {
      cardError.value = '无法加载卡片模板，请检查卡片配置路径 ./data/cards/index.json'
      isGeneratingCard.value = false
      showCardPanel.value = true
      return
    }
    
    // 2. 获取当前剧情上下文
    const contextStart = Math.max(0, currentLineIndex.value - storyContextLineCount.value + 1)
    const recentDialogue = dialogueScript.value.slice(contextStart, currentLineIndex.value + 1)
    
    // 3. 调用 LLM 生成卡片内容
    const result = await generateCardContent({
      cardConfig: cardData.promptConfig,
      worldBook: activeBook.value,
      recentDialogue,
      currentScene: currentSceneName.value,
      options: {
        temperature: 0.9,
        maxTokens: 1500,
      },
    })
    
    if (!result.success) {
      cardError.value = result.error || '卡片内容生成失败'
      isGeneratingCard.value = false
      showCardPanel.value = true
      return
    }
    
    // 4. 设置当前卡片信息
    currentCard.value = cardData
    currentCardContent.value = result.data
    
    // 检查是否已收藏
    checkCurrentCardCollected()
    
    // 5. 关闭生成中状态，显示卡片
    isGeneratingCard.value = false
    
  } catch (error) {
    cardError.value = `卡片生成失败: ${error?.message || '未知错误'}`
    isGeneratingCard.value = false
    showCardPanel.value = true
  }
}

/**
 * 渲染卡片 HTML 内容
 * 根据卡片模板和生成的内容渲染最终 HTML
 */
const renderedCardHtml = computed(() => {
  if (!currentCard.value || !currentCardContent.value || !currentCard.value.templateHtml) {
    return ''
  }
  
  let html = currentCard.value.templateHtml
  
  // 替换模板中的变量占位符
  const content = currentCardContent.value
  for (const [key, value] of Object.entries(content)) {
    // 支持多种占位符格式: {{key}}, {key}, %key%
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value || ''))
    html = html.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value || ''))
    html = html.replace(new RegExp(`%${key}%`, 'g'), String(value || ''))
  }
  return html
})

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
  closeRelationshipTablePanel()
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
  if (isMiniTheaterMode.value) {
    goNextMiniTheaterLine()
    return
  }

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
  if (isMiniTheaterMode.value) {
    goPrevMiniTheaterLine()
    return
  }

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
  if (isMiniTheaterMode.value) return
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
  if (isMiniTheaterMode.value) return
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
      storyTime: storyTimelineLabel.value,
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
      relationshipLedger: normalizeRelationshipLedgerPayload(relationshipLedger.value, createEmptyRelationshipLedger()),
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
  if (
    showChoicesPanel.value ||
    isGenerating.value ||
    isGeneratingMiniTheater.value ||
    showSavePanel.value ||
    showDebugPanel.value ||
    showMiniTheaterPanel.value ||
    showDialogueHistoryPanel.value ||
    showRelationshipTablePanel.value
  ) {
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
const DEFAULT_QUICK_SAVE_SLOT_ID = 'save_quick_default'

// 计算游戏时长（秒）
const currentPlayTime = computed(() => {
  return Math.floor((Date.now() - playStartTime.value) / 1000)
})

const closeTopMenu = () => {
  showTopMenu.value = false
}

const closeDebugPanel = () => {
  showDebugPanel.value = false
}

const toggleTopMenu = () => {
  const nextState = !showTopMenu.value
  showTopMenu.value = nextState
  if (nextState) {
    showDebugPanel.value = false
  }
}

// 切换存档面板显示
const toggleSavePanel = () => {
  closeTopMenu()
  closeDebugPanel()
  closeDialogueHistoryPanel()
  closeRelationshipTablePanel()
  showSavePanel.value = !showSavePanel.value
  if (!showSavePanel.value) {
    saveError.value = null
    saveSuccess.value = null
    saveSlotName.value = ''
  }
}

const toggleDebugPanel = () => {
  closeTopMenu()
  closeDialogueHistoryPanel()
  closeRelationshipTablePanel()
  showSavePanel.value = false
  showDebugPanel.value = !showDebugPanel.value
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
const quickSave = async (options = {}) => {
  if (isSaving.value) return
  
  const silent = options?.silent === true
  const slotId = String(options?.slotId || DEFAULT_QUICK_SAVE_SLOT_ID).trim() || DEFAULT_QUICK_SAVE_SLOT_ID

  isSaving.value = true
  
  try {
    const gameData = createSerializableGameData()
    
    const result = await saveGame(gameData, slotId)
    
    if (result.success) {
      await syncPhoneSmsScopeAfterSave(result.id)
      if (!silent) {
        // 简短提示
        saveSuccess.value = '快速存档成功！'
        setTimeout(() => {
          saveSuccess.value = null
        }, 2000)
      }
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
  showDebugPanel.value = false
  closeRelationshipTablePanel()
  toggleDialogueHistoryPanel()
}

const handleToggleRelationshipTableFromMenu = () => {
  closeTopMenu()
  showSavePanel.value = false
  showDebugPanel.value = false
  closeDialogueHistoryPanel()
  toggleRelationshipTablePanel()
}

// 加载存档数据
const loadSaveData = async () => {
  clearMiniTheaterMode()
  showMiniTheaterPanel.value = false
  showDebugPanel.value = false
  showRelationshipTablePanel.value = false
  miniTheaterError.value = ''

  if (!(props.saveData && props.saveData.game)) {
    storyTimeLabel.value = getCurrentStoryTimeLabel()
    hydrateNarrativeRuntimeState(null)
    await hydrateLlmSettingsForScope(null)
    await hydrateRelationshipLedgerForScope(null)
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
  storyTimeLabel.value = normalizeStoryTimeLabel(props.saveData.metadata?.storyTime, storyTimeLabel.value)

  hydrateNarrativeRuntimeState(props.saveData.game)
  await hydrateLlmSettingsForScope(props.saveData.game.llmSettings)
  await hydrateRelationshipLedgerForScope(props.saveData.game.relationshipLedger)

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
    await initializeOpeningDialogue()
    hydrateNarrativeRuntimeState(null)
    await hydrateLlmSettingsForScope(null)
    await hydrateRelationshipLedgerForScope(null)
  }

  // 确保初始场景背景按世界书配置生效
  await applyBackgroundByLineScene(currentLine.value, { allowFallback: true })

  if (typeof window !== 'undefined') {
    window.addEventListener('backpack-use-request', handleBackpackUseRequest)
    window.addEventListener('phone-map-travel-request', handleMapTravelRequest)
  }
  hasMountedGameScreen.value = true
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
watch(activeBook, async (newBook, oldBook) => {
  if (hasMountedGameScreen.value && newBook && !props.saveData && newBook.id !== oldBook?.id) {
    await initializeOpeningDialogue()
    hydrateNarrativeRuntimeState(null)
    await hydrateRelationshipLedgerForScope(null)
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


<template src="./game/GameScreen.template.html"></template>

<style scoped src="./game/styles/game-01.css"></style>
<style scoped src="./game/styles/game-02.css"></style>
<style scoped src="./game/styles/game-03.css"></style>
<style scoped src="./game/styles/game-04.css"></style>

