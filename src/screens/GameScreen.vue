<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { getActiveWorldBookId, loadWorldBooks } from '../worldbook/worldBookStore'
import { generateStory, buildStoryPrompt, parseStoryContent, toGameScript, hasChoices, extractChoices } from '../llm'
import { saveGame, createHistoryBackup, formatTimestamp } from '../save/saveManager'
import { kvStorage } from '../storage/index.js'
import { DEFAULT_NARRATOR_ID, loadNarratorProfiles, resolveNarratorProfile } from '../narrator/narratorStore'
import MusicPlayer from '../components/MusicPlayer.vue'
import Phone from '../components/Phone.vue'
import PluginComponent from '../plugins/PluginComponent.vue'
import { PluginTypes } from '../plugins/pluginManager.js'
import CGGeneratorModal from '../components/CGGeneratorModal.vue'
import { isAndroid } from '../utils/platform.js'
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

const PHONE_SMS_STORAGE_PREFIX = 'phone-sms-threads'
const createSessionSmsScopeId = () => `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const sanitizeSmsScopeId = (value) => String(value || '').trim()
const smsSaveScopeId = ref(sanitizeSmsScopeId(props.saveData?.__slotId) || createSessionSmsScopeId())

const getPhoneSmsStorageKey = (worldBookId = activeBookId.value, scopeId = smsSaveScopeId.value) => {
  const normalizedWorldId = String(worldBookId || 'default_world_book').trim() || 'default_world_book'
  const normalizedScopeId = sanitizeSmsScopeId(scopeId) || 'session_default'
  return `${PHONE_SMS_STORAGE_PREFIX}:${normalizedWorldId}:${normalizedScopeId}`
}

const syncPhoneSmsScopeAfterSave = async (nextSlotId) => {
  const normalizedNextSlotId = sanitizeSmsScopeId(nextSlotId)
  if (!normalizedNextSlotId) return

  const previousScopeId = sanitizeSmsScopeId(smsSaveScopeId.value) || 'session_default'
  if (previousScopeId !== normalizedNextSlotId) {
    const sourceKey = getPhoneSmsStorageKey(activeBookId.value, previousScopeId)
    const targetKey = getPhoneSmsStorageKey(activeBookId.value, normalizedNextSlotId)

    try {
      const sourceThreads = await kvStorage.get(sourceKey)
      if (sourceThreads && typeof sourceThreads === 'object') {
        await kvStorage.set(targetKey, sourceThreads)
      }
    } catch {
      // no-op
    }
  }

  smsSaveScopeId.value = normalizedNextSlotId
}

// 立绘图片缓存
const portraitImageCache = ref(new Map())

const sceneCharacters = [
  {
    id: 'eve',
    name: '伊芙',
    role: '档案管理员',
    toneClass: 'tone-violet',
    positionClass: 'is-left',
  },
  {
    id: 'lead',
    name: '你',
    role: '调查员',
    toneClass: 'tone-cyan',
    positionClass: 'is-center',
  },
  {
    id: 'zero',
    name: '零号',
    role: '未知访客',
    toneClass: 'tone-orange',
    positionClass: 'is-right',
  },
]

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

// 选项相关状态
const currentChoices = ref(null) // 当前对话的选项
const showChoicesPanel = ref(false) // 是否显示选项面板
const customInputText = ref('') // 用户自定义输入内容
const selectedChoice = ref(null) // 用户选择的选项（用于继续生成）

// CG 生成相关状态
const showCGModal = ref(false) // 是否显示 CG 生成弹窗
const generatedCG = ref(null) // 生成的 CG 图片数据
const showCGViewer = ref(false) // 是否显示 CG 查看器

// 可选的消息条数范围选项
const messageRangeOptions = [
  { key: '5-10', min: 5, max: 10, label: '5-10条' },
  { key: '10-20', min: 10, max: 20, label: '10-20条' },
  { key: '20-30', min: 20, max: 30, label: '20-30条' },
  { key: '30-40', min: 30, max: 40, label: '30-40条' },
  { key: '40-50', min: 40, max: 50, label: '40-50条' },
  { key: 'custom', label: '自定义', isCustom: true },
]

// 在范围内随机生成消息条数
const getRandomMessageCount = () => {
  const { min, max } = generateMessageRange.value
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const clampMessageCount = (value, fallback = 5) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(200, Math.max(1, parsed))
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
    return
  }

  generateMessageRange.value = {
    min: selectedOption.min,
    max: selectedOption.max,
  }
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
}

const speakerCharacterMap = {
  伊芙: 'eve',
  你: 'lead',
  零号: 'zero',
}

const resolveSpeakerCharacterId = (speakerName) => {
  const speaker = String(speakerName || '').trim()
  if (!speaker || speaker === '旁白') return null

  if (speakerCharacterMap[speaker]) {
    return speakerCharacterMap[speaker]
  }

  const book = activeBook.value
  if (!book) return null

  const userAliases = [
    book.userProfile?.name,
    book.userProfile?.nickname,
    '你',
    '玩家',
    '主角',
  ]
    .map((name) => String(name || '').trim())
    .filter(Boolean)

  if (userAliases.includes(speaker)) {
    return 'lead'
  }

  const matchedIndex = (book.characters || []).findIndex((char) => {
    const aliases = [char?.name, char?.nickname, char?.id]
      .map((name) => String(name || '').trim())
      .filter(Boolean)
    return aliases.includes(speaker)
  })

  if (matchedIndex === 0) return 'eve'
  if (matchedIndex === 1) return 'zero'

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
  return sceneCharacters.find(c => c.id === speakerId) || null
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
const handleGenerateStory = async (choiceToApply = null) => {
  if (isGenerating.value) return

  isGenerating.value = true
  generateError.value = null

  try {
    // 在范围内随机生成消息条数
    const actualMessageCount = getRandomMessageCount()
    
    // 构建 Prompt（包含随机消息条数和选择的选项）
    const prompt = buildStoryPrompt({
      worldBook: activeBook.value,
      narratorProfile: effectiveNarrator.value,
      dialogueHistory: dialogueScript.value.slice(0, currentLineIndex.value + 1),
      currentLine: currentLine.value,
      sceneCharacters: sceneCharacters,
      userInput: userPromptInput.value,
      messageCount: actualMessageCount,
      selectedChoice: choiceToApply,
    })

    // 调用 LLM API
    const result = await generateStory(prompt)

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

// 处理 CG 生成完成
const handleCGGenerated = (cgData) => {
  generatedCG.value = cgData
  showCGViewer.value = true
}

// 立绘图片 URL 状态（用于模板显示）
const portraitUrls = ref({})

// 更新立绘图片 URL
const updatePortraitUrls = async () => {
  for (const character of sceneCharacters) {
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
      sceneCharacters: sceneCharacters.map(c => ({
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

// 加载存档数据
const loadSaveData = () => {
  if (props.saveData && props.saveData.game) {
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
    // 重置游戏开始时间
    playStartTime.value = Date.now() - (props.saveData.metadata?.playTime || 0) * 1000
  }
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
    loadSaveData()
  }
}, { immediate: true })

// 监听当前对话变化，切换背景
watch(currentLine, async (newLine) => {
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
    loadSaveData()
  } else {
    // 新游戏：初始化开场白
    initializeOpeningDialogue()
  }

  // 确保初始场景背景按世界书配置生效
  await applyBackgroundByLineScene(currentLine.value, { allowFallback: true })
})

// 监听世界书变化，重新初始化开场白
watch(activeBook, async (newBook) => {
  if (newBook && !props.saveData) {
    initializeOpeningDialogue()
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
        </div>
        <p class="dialogue-text">{{ currentLine.text }}</p>

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
            @click="showCGModal = true"
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
          @click="showCGModal = true"
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
              将在 {{ generateMessageRange.min }}-{{ generateMessageRange.max }} 条范围内随机生成对话
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

    <!-- CG 生成弹窗 -->
    <CGGeneratorModal
      :visible="showCGModal"
      :world-book="activeBook"
      :dialogue-history="dialogueScript"
      :current-line="currentLine"
      @close="showCGModal = false"
      @generated="handleCGGenerated"
    />

    <!-- CG 查看器 -->
    <div v-if="generatedCG && showCGViewer" class="cg-viewer-overlay" @click="showCGViewer = false">
      <div class="cg-viewer">
        <img :src="generatedCG.url" alt="Generated CG" class="cg-image" />
        <div class="cg-info">
          <p class="cg-summary">{{ generatedCG.sceneSummary }}</p>
          <button type="button" class="cg-close-btn" @click="showCGViewer = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- CG 缩略图（已生成时显示） -->
    <div v-if="generatedCG && !showCGViewer" class="cg-thumbnail" @click="showCGViewer = true" title="点击查看CG">
      <img :src="generatedCG.url" alt="CG Thumbnail" class="cg-thumb-img" />
      <span class="cg-thumb-label">CG</span>
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
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
}

.line-progress {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--foreground) 88%, var(--accent-cyan));
}

.dialogue-text {
  margin: 0;
  font-size: clamp(1rem, 1.65vw, 1.24rem);
  line-height: 1.55;
  color: color-mix(in srgb, var(--foreground) 95%, var(--accent-cyan));
}

.dialogue-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
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

/* CG 查看器样式 */
.cg-viewer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  cursor: pointer;
}

.cg-viewer {
  max-width: 90%;
  max-height: 90%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.cg-image {
  max-width: 100%;
  max-height: 80vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 0 40px rgba(0, 212, 255, 0.3);
}

.cg-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.cg-summary {
  margin: 0;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--accent-cyan) 20%, transparent);
  border-radius: 8px;
  color: var(--accent-cyan);
  font-size: 0.9rem;
  max-width: 400px;
}

.cg-close-btn {
  appearance: none;
  border: 2px solid var(--accent-magenta);
  border-radius: 6px;
  padding: 8px 16px;
  background: var(--accent-magenta);
  color: var(--bg);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.cg-close-btn:hover {
  background: color-mix(in srgb, var(--accent-magenta) 80%, var(--accent-cyan));
  transform: scale(1.05);
}

/* CG 缩略图样式 */
.cg-thumbnail {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  border: 2px solid var(--accent-magenta);
  overflow: hidden;
  cursor: pointer;
  z-index: 50;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(255, 0, 255, 0.3);
}

.cg-thumbnail:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(255, 0, 255, 0.5);
}

.cg-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cg-thumb-label {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 8px;
  background: var(--accent-magenta);
  color: var(--bg);
  font-size: 0.7rem;
  font-weight: 600;
  border-radius: 4px;
}

@media (max-width: 768px) {
  .cg-thumbnail {
    width: 60px;
    height: 60px;
    bottom: 10px;
    right: 10px;
  }

  .cg-viewer {
    max-width: 95%;
  }

  .cg-info {
    flex-direction: column;
    gap: 8px;
  }
}

</style>
