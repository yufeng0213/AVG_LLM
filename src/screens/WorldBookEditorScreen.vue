<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  CHARACTER_MBTI_OPTIONS,
  CHARACTER_PERSONALITY_DIMENSION_DEFS,
  CHARACTER_PERSONALITY_SCORE_MAX,
  CHARACTER_PERSONALITY_SCORE_MIN,
  createDefaultCharacterVoiceConfig,
  createDefaultPersonalityProfile,
  RELATIONSHIP_METRIC_MAX,
  RELATIONSHIP_METRIC_MIN,
  WORLD_BOOK_ENTRY_DEFS,
  WORLD_BOOK_PORTRAIT_STYLE_OPTIONS,
  createDirectorEventTemplate,
  createNewCharacter,
  createNewScene,
  getActiveWorldBookId,
  loadWorldBooks,
  normalizeDirectorEvents,
  normalizeCharacterVoiceConfig,
  normalizePersonalityProfile,
  persistWorldBooks,
  setActiveWorldBookId,
} from '../worldbook/worldBookStore'
import { getEnabledNarratorProfiles, loadNarratorProfiles } from '../narrator/narratorStore'
import PortraitManager from '../components/PortraitManager.vue'
import {
  loadBackgroundFolder,
  loadBackgroundFiles,
  backgroundList,
  backgroundFolderPath
} from '../background/backgroundStore'
import { isAndroid } from '../utils/platform.js'

const props = defineProps({
  bookId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['back'])

const editorTabs = [
  { id: 'lore', label: '世界背景' },
  { id: 'opening', label: '开场白设置' },
  { id: 'user', label: 'user设定' },
  { id: 'char', label: 'char设定' },
  { id: 'scenes', label: '场景管理' },  // 新增：场景管理标签页
]

const statusMessage = ref('请选择条目并填写设定。')
const worldBooks = ref([])
const activeBookId = ref('default_world_book')
const activeEntryKey = ref(WORLD_BOOK_ENTRY_DEFS[0].key)
const activeEditorTab = ref('lore')
const activeCharacterId = ref('')
const activeSceneId = ref('')  // 新增：当前选中的场景ID
const isSaving = ref(false)
const isLoadingBackgrounds = ref(false)  // 新增：背景加载状态
const narratorProfiles = ref([])
const isAndroidPlatform = computed(() => isAndroid())
const directorEventsText = ref('[]')
const directorEventsError = ref('')
const openingDialogueText = ref('[]')
const openingDialogueError = ref('')
const relationshipMetricMin = RELATIONSHIP_METRIC_MIN
const relationshipMetricMax = RELATIONSHIP_METRIC_MAX
const personalityDimensionMin = CHARACTER_PERSONALITY_SCORE_MIN
const personalityDimensionMax = CHARACTER_PERSONALITY_SCORE_MAX
const mbtiOptions = CHARACTER_MBTI_OPTIONS
const personalityDimensions = CHARACTER_PERSONALITY_DIMENSION_DEFS
const charBasicOpen = ref(true)
const charIdentityOpen = ref(false)
const charAppearanceOpen = ref(false)
const charBackgroundOpen = ref(false)
const charPersonalityOpen = ref(true)
const charNotesOpen = ref(false)
const charRelationshipOpen = ref(false)
const charVoiceOpen = ref(false)
const charPortraitsOpen = ref(false)
const userBasicOpen = ref(true)
const userIdentityOpen = ref(false)
const userAppearanceOpen = ref(false)
const userBackgroundOpen = ref(false)
const userPortraitsOpen = ref(false)

// 编辑世界书名称相关
const showEditTitleDialog = ref(false)
const editTitle = ref('')

const activeBook = computed(() =>
  worldBooks.value.find((book) => book.id === activeBookId.value) || null,
)
const activeEntryDef = computed(
  () => WORLD_BOOK_ENTRY_DEFS.find((entry) => entry.key === activeEntryKey.value) || WORLD_BOOK_ENTRY_DEFS[0],
)
const characters = computed(() => activeBook.value?.characters || [])
const scenes = computed(() => activeBook.value?.scenes || [])  // 新增：场景列表
const activeCharacterIndex = computed(() =>
  characters.value.findIndex((char) => char.id === activeCharacterId.value),
)
const activeCharacter = computed(() => {
  if (activeCharacterIndex.value >= 0) {
    return characters.value[activeCharacterIndex.value]
  }
  return characters.value[0] || null
})

// 新增：场景相关计算属性
const activeSceneIndex = computed(() =>
  scenes.value.findIndex((scene) => scene.id === activeSceneId.value),
)
const activeScene = computed(() => {
  if (activeSceneIndex.value >= 0) {
    return scenes.value[activeSceneIndex.value]
  }
  return scenes.value[0] || null
})

const getCharacterDisplayName = (char, index = 0) => {
  const name = String(char?.name || '').trim()
  if (name) return name

  const nickname = String(char?.nickname || '').trim()
  if (nickname) return nickname

  return `角色 ${index + 1}`
}

const activeCharacterDisplayName = computed(() => {
  if (!activeCharacter.value) return '未选择角色'
  const index = activeCharacterIndex.value >= 0 ? activeCharacterIndex.value : 0
  return getCharacterDisplayName(activeCharacter.value, index)
})
const openingDialogueMode = computed(() => {
  const mode = String(activeBook.value?.openingDialogueMode || '').trim().toLowerCase()
  return mode === 'custom' ? 'custom' : 'auto'
})

const narratorOptions = computed(() => {
  const enabledProfiles = getEnabledNarratorProfiles(narratorProfiles.value)
  const currentId = String(activeBook.value?.defaultNarratorId || '')
  const currentProfile = narratorProfiles.value.find((profile) => profile.id === currentId)

  if (currentProfile && !enabledProfiles.some((profile) => profile.id === currentProfile.id)) {
    return [currentProfile, ...enabledProfiles]
  }

  return enabledProfiles
})

const markBookUpdated = () => {
  if (!activeBook.value) return
  activeBook.value.updatedAt = new Date().toISOString()
}

const clampRelationshipMetric = (value, fallback = 0) => {
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(relationshipMetricMax, Math.max(relationshipMetricMin, Math.round(parsed)))
}

const ensureCharacterRelationshipBase = (character) => {
  if (!character || typeof character !== 'object') return
  if (!character.relationshipBase || typeof character.relationshipBase !== 'object') {
    character.relationshipBase = {
      favor: 50,
      trust: 50,
      stance: 0,
    }
    return
  }

  character.relationshipBase.favor = clampRelationshipMetric(character.relationshipBase.favor, 50)
  character.relationshipBase.trust = clampRelationshipMetric(character.relationshipBase.trust, 50)
  character.relationshipBase.stance = clampRelationshipMetric(character.relationshipBase.stance, 0)
}

const ensureCharacterVoiceConfig = (character) => {
  if (!character || typeof character !== 'object') return
  character.voiceConfig = normalizeCharacterVoiceConfig(character.voiceConfig || createDefaultCharacterVoiceConfig())
}

const ensureCharacterPersonalityProfile = (character) => {
  if (!character || typeof character !== 'object') return
  character.personalityProfile = normalizePersonalityProfile(
    character.personalityProfile || createDefaultPersonalityProfile(),
  )
}

const syncDirectorEventsTextFromBook = () => {
  if (!activeBook.value) {
    directorEventsText.value = '[]'
    directorEventsError.value = ''
    return
  }

  const events = normalizeDirectorEvents(activeBook.value.directorEvents)
  activeBook.value.directorEvents = events
  directorEventsText.value = JSON.stringify(events, null, 2)
  directorEventsError.value = ''
}

const normalizeOpeningDialogueLines = (rawLines) => {
  if (!Array.isArray(rawLines)) {
    return []
  }

  return rawLines
    .map((line) => ({
      speaker: String(line?.speaker || '旁白').trim() || '旁白',
      text: String(line?.text || '').trim(),
      emotion: line?.emotion || null,
    }))
    .filter((line) => line.text)
}

const syncOpeningDialogueTextFromBook = () => {
  if (!activeBook.value) {
    openingDialogueText.value = '[]'
    openingDialogueError.value = ''
    return
  }

  const normalized = normalizeOpeningDialogueLines(activeBook.value.openingDialogue)
  activeBook.value.openingDialogue = normalized
  activeBook.value.openingDialogueMode = openingDialogueMode.value
  openingDialogueText.value = JSON.stringify(normalized, null, 2)
  openingDialogueError.value = ''
}

const setOpeningDialogueMode = (mode) => {
  if (!activeBook.value) return
  const nextMode = mode === 'custom' ? 'custom' : 'auto'
  activeBook.value.openingDialogueMode = nextMode
  if (nextMode === 'auto') {
    openingDialogueError.value = ''
  }
  markBookUpdated()
  syncOpeningDialogueTextFromBook()
  statusMessage.value = nextMode === 'custom' ? '已切换为自定义开场白模式' : '已切换为自动生成开场白模式'
}

const clearOpeningDialogueToAuto = () => {
  if (!activeBook.value) return
  activeBook.value.openingDialogue = []
  activeBook.value.openingDialogueMode = 'auto'
  markBookUpdated()
  syncOpeningDialogueTextFromBook()
  statusMessage.value = '已清空开场白，将在新游戏时自动生成'
}

const applyOpeningDialogueJson = () => {
  if (!activeBook.value) return

  try {
    const parsed = JSON.parse(openingDialogueText.value || '[]')
    const list = Array.isArray(parsed) ? parsed : parsed?.openingDialogue
    if (!Array.isArray(list)) {
      openingDialogueError.value = '开场白 JSON 必须是数组，或对象中包含 openingDialogue 数组。'
      return
    }

    const normalized = normalizeOpeningDialogueLines(list).slice(0, 80)
    if (normalized.length === 0) {
      openingDialogueError.value = '至少需要 1 条有效开场对白（text 不能为空）。'
      return
    }

    activeBook.value.openingDialogue = normalized
    activeBook.value.openingDialogueMode = 'custom'
    openingDialogueText.value = JSON.stringify(normalized, null, 2)
    openingDialogueError.value = ''
    markBookUpdated()
    statusMessage.value = `已应用自定义开场白，共 ${normalized.length} 句`
  } catch (error) {
    openingDialogueError.value = `JSON 格式错误：${error?.message || '未知错误'}`
  }
}

const resetOpeningDialogueText = () => {
  syncOpeningDialogueTextFromBook()
  statusMessage.value = '已重置开场白编辑文本'
}

const ensureCharacterSelection = () => {
  if (characters.value.length === 0) {
    activeCharacterId.value = ''
    return
  }

  const exists = characters.value.some((char) => char.id === activeCharacterId.value)
  if (!exists) {
    activeCharacterId.value = characters.value[0].id
  }
}

const loadEditorData = async () => {
  worldBooks.value = await loadWorldBooks()
  narratorProfiles.value = await loadNarratorProfiles()

  const desiredBookId = props.bookId || await getActiveWorldBookId()
  const exists = worldBooks.value.some((book) => book.id === desiredBookId)
  const nextId = exists ? desiredBookId : worldBooks.value[0]?.id || 'default_world_book'

  activeBookId.value = nextId
  await setActiveWorldBookId(nextId)
  ensureCharacterSelection()
  ensureSceneSelection()
  syncDirectorEventsTextFromBook()
  syncOpeningDialogueTextFromBook()
}

const updateActiveBookField = (field, value) => {
  if (!activeBook.value) return
  activeBook.value[field] = value
  markBookUpdated()
}

const updateActiveEntry = (value) => {
  if (!activeBook.value) return
  activeBook.value.entries[activeEntryKey.value] = value
  markBookUpdated()
}

const updateDisplaySetting = (field, value) => {
  if (!activeBook.value) return
  if (!activeBook.value.displaySettings || typeof activeBook.value.displaySettings !== 'object') {
    activeBook.value.displaySettings = {}
  }
  activeBook.value.displaySettings[field] = value
  markBookUpdated()
}

const updateUserField = (field, value) => {
  if (!activeBook.value?.userProfile) return
  activeBook.value.userProfile[field] = value
  markBookUpdated()
}

const addCharacter = () => {
  if (!activeBook.value) return

  const nextCharacter = createNewCharacter(activeBook.value.characters)
  activeBook.value.characters = [...activeBook.value.characters, nextCharacter]
  activeCharacterId.value = nextCharacter.id
  activeEditorTab.value = 'char'
  markBookUpdated()
  statusMessage.value = `已新增角色：${nextCharacter.name}`
}

const updateActiveCharacterField = (field, value) => {
  if (!activeCharacter.value) return
  activeCharacter.value[field] = value
  activeCharacter.value.updatedAt = new Date().toISOString()
  markBookUpdated()
}

const updateActiveCharacterPersonalityField = (field, value) => {
  if (!activeCharacter.value) return
  ensureCharacterPersonalityProfile(activeCharacter.value)

  const nextProfile = normalizePersonalityProfile({
    ...activeCharacter.value.personalityProfile,
    [field]: value,
  })
  activeCharacter.value.personalityProfile = nextProfile
  activeCharacter.value.updatedAt = new Date().toISOString()
  markBookUpdated()
}

const updateActiveCharacterPersonalityDimension = (dimensionKey, value) => {
  if (!activeCharacter.value) return
  ensureCharacterPersonalityProfile(activeCharacter.value)

  const nextDimensions = {
    ...(activeCharacter.value.personalityProfile?.cognitiveDimensions || {}),
    [dimensionKey]: value,
  }
  updateActiveCharacterPersonalityField('cognitiveDimensions', nextDimensions)
}

const updateActiveCharacterBehaviorTagsText = (value) => {
  const nextTags = String(value || '')
    .split(/\r?\n/g)
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .slice(0, 12)
  updateActiveCharacterPersonalityField('behaviorTags', nextTags)
}

const getActiveCharacterBehaviorTagsText = () => {
  const tags = activeCharacter.value?.personalityProfile?.behaviorTags
  if (!Array.isArray(tags)) {
    return ''
  }
  return tags.join('\n')
}

const updateActiveCharacterRelationshipField = (field, value) => {
  if (!activeCharacter.value) return
  ensureCharacterRelationshipBase(activeCharacter.value)

  const fallbackValue = field === 'stance' ? 0 : 50
  activeCharacter.value.relationshipBase[field] = clampRelationshipMetric(value, fallbackValue)
  activeCharacter.value.updatedAt = new Date().toISOString()
  markBookUpdated()
}

const updateActiveCharacterVoiceField = (field, value) => {
  if (!activeCharacter.value) return
  ensureCharacterVoiceConfig(activeCharacter.value)
  const nextVoiceConfig = normalizeCharacterVoiceConfig({
    ...activeCharacter.value.voiceConfig,
    [field]: value,
  })
  activeCharacter.value.voiceConfig = nextVoiceConfig
  activeCharacter.value.updatedAt = new Date().toISOString()
  markBookUpdated()
}

const updateActiveCharacterVoiceToneText = (value) => {
  if (!activeCharacter.value) return
  ensureCharacterVoiceConfig(activeCharacter.value)
  const nextTones = String(value || '')
    .split(/\r?\n/g)
    .map((line) => String(line || '').trim())
    .filter(Boolean)
  updateActiveCharacterVoiceField('pronunciationTone', nextTones)
}

const getActiveCharacterVoiceToneText = () => {
  const toneList = activeCharacter.value?.voiceConfig?.pronunciationTone
  if (!Array.isArray(toneList)) {
    return ''
  }
  return toneList.join('\n')
}

// ========== 场景管理功能 ==========

// 确保场景选择有效
const ensureSceneSelection = () => {
  if (scenes.value.length === 0) {
    activeSceneId.value = ''
    return
  }

  const exists = scenes.value.some((scene) => scene.id === activeSceneId.value)
  if (!exists) {
    activeSceneId.value = scenes.value[0].id
  }
}

// 添加新场景
const addScene = () => {
  if (!activeBook.value) return

  const nextScene = createNewScene(scenes.value.length + 1)
  activeBook.value.scenes = [...scenes.value, nextScene]
  activeSceneId.value = nextScene.id
  activeEditorTab.value = 'scenes'
  markBookUpdated()
  statusMessage.value = `已新增场景：${nextScene.name}`
}

// 删除场景
const deleteScene = (sceneId) => {
  if (!activeBook.value) return
  
  const index = scenes.value.findIndex((s) => s.id === sceneId)
  if (index < 0) return
  
  activeBook.value.scenes = scenes.value.filter((s) => s.id !== sceneId)
  ensureSceneSelection()
  markBookUpdated()
  statusMessage.value = `已删除场景`
}

// 更新场景字段
const updateActiveSceneField = (field, value) => {
  if (!activeScene.value) return
  activeScene.value[field] = value
  markBookUpdated()
}

// 获取场景显示名称
const getSceneDisplayName = (scene, index = 0) => {
  const name = String(scene?.name || '').trim()
  if (name) return name
  return `场景 ${index + 1}`
}

// 加载背景文件夹
const handleLoadBackgroundFolder = async () => {
  isLoadingBackgrounds.value = true
  try {
    const result = await loadBackgroundFolder()
    if (result.success) {
      statusMessage.value = `已加载 ${backgroundList.value.length} 个背景图片`
    } else if (!result.canceled) {
      statusMessage.value = `加载背景失败：${result.error || '未知错误'}`
    }
  } finally {
    isLoadingBackgrounds.value = false
  }
}

// 选择背景文件夹
const pickBackgroundFiles = () => {
  if (typeof document === 'undefined') {
    return Promise.resolve({ files: [], canceled: true })
  }

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.style.position = 'fixed'
    input.style.left = '-9999px'

    let settled = false
    const finish = (files, canceled = false) => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', handleFocus)
      input.remove()
      resolve({ files, canceled })
    }

    const handleFocus = () => {
      window.setTimeout(() => {
        if (!settled) {
          const files = Array.from(input.files || [])
          finish(files, files.length === 0)
        }
      }, 320)
    }

    input.addEventListener('change', () => {
      finish(Array.from(input.files || []), false)
    }, { once: true })

    input.addEventListener('cancel', () => {
      finish([], true)
    }, { once: true })

    window.addEventListener('focus', handleFocus, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

const handleSelectBackgroundFolder = async () => {
  isLoadingBackgrounds.value = true
  try {
    if (window.avgLLM?.background?.selectFolder) {
      const result = await window.avgLLM.background.selectFolder()
      if (result.success && result.path) {
        await loadBackgroundFolder(result.path)
        statusMessage.value = `已选择背景文件夹：${result.path}`
      } else if (!result?.canceled) {
        statusMessage.value = `选择背景文件夹失败：${result?.error || '未知错误'}`
      }
      return
    }

    const picked = await pickBackgroundFiles()
    if (picked.canceled || picked.files.length === 0) {
      return
    }

    const sourceLabel = isAndroidPlatform.value ? 'Android本地背景图片' : '本地背景图片'
    const result = await loadBackgroundFiles(picked.files, sourceLabel)
    if (result.success) {
      statusMessage.value = `已导入 ${backgroundList.value.length} 张背景图片`
    } else if (!result.canceled) {
      statusMessage.value = `导入背景失败：${result.error || '未知错误'}`
    }
  } catch (error) {
    statusMessage.value = `选择背景失败：${error?.message || '未知错误'}`
  } finally {
    isLoadingBackgrounds.value = false
  }
}

// 场景显示名称计算属性
const activeSceneDisplayName = computed(() => {
  if (!activeScene.value) return '未选择场景'
  const index = activeSceneIndex.value >= 0 ? activeSceneIndex.value : 0
  return getSceneDisplayName(activeScene.value, index)
})

const applyDirectorEventsJson = () => {
  if (!activeBook.value) return

  try {
    const parsed = JSON.parse(directorEventsText.value || '[]')
    if (!Array.isArray(parsed)) {
      directorEventsError.value = 'directorEvents 必须是 JSON 数组。'
      return
    }

    const normalized = normalizeDirectorEvents(parsed)
    activeBook.value.directorEvents = normalized
    directorEventsText.value = JSON.stringify(normalized, null, 2)
    directorEventsError.value = ''
    markBookUpdated()
    statusMessage.value = `导演事件已更新，共 ${normalized.length} 条`
  } catch (error) {
    directorEventsError.value = `JSON 格式错误：${error?.message || '未知错误'}`
  }
}

const insertDirectorEventTemplate = () => {
  if (!activeBook.value) return

  const currentEvents = normalizeDirectorEvents(activeBook.value.directorEvents)
  const template = createDirectorEventTemplate(currentEvents.length + 1)
  activeBook.value.directorEvents = [...currentEvents, template]
  directorEventsText.value = JSON.stringify(activeBook.value.directorEvents, null, 2)
  directorEventsError.value = ''
  markBookUpdated()
  statusMessage.value = '已插入导演事件模板'
}

const resetDirectorEventsJson = () => {
  syncDirectorEventsTextFromBook()
  statusMessage.value = '已重置为当前保存中的导演事件配置'
}

// 打开编辑标题对话框
const openEditTitleDialog = () => {
  editTitle.value = activeBook.value?.title || ''
  showEditTitleDialog.value = true
}

// 取消编辑标题
const cancelEditTitle = () => {
  showEditTitleDialog.value = false
  editTitle.value = ''
}

// 确认编辑标题
const confirmEditTitle = async () => {
  if (!activeBook.value) return
  
  const newTitle = editTitle.value.trim()
  if (!newTitle) {
    statusMessage.value = '世界书名称不能为空'
    return
  }
  
  activeBook.value.title = newTitle
  markBookUpdated()
  showEditTitleDialog.value = false
  statusMessage.value = `世界书名称已更新为：${newTitle}`
}

const saveWorldBooks = async () => {
   if (!activeBook.value) {
     statusMessage.value = '未找到可编辑的世界书。'
     return
  }

  isSaving.value = true
  try {
    await persistWorldBooks(worldBooks.value)
    await setActiveWorldBookId(activeBook.value.id)
    statusMessage.value = `已保存：${activeBook.value.title}`
  } finally {
    isSaving.value = false
  }
}

watch(
  () => props.bookId,
  async () => {
    await loadEditorData()
  },
)

watch(
  () => activeBook.value?.id,
  () => {
    ensureCharacterSelection()
    ensureSceneSelection()
    syncDirectorEventsTextFromBook()
    syncOpeningDialogueTextFromBook()
  },
)

watch(
  () => activeCharacter.value?.id,
  () => {
    ensureCharacterPersonalityProfile(activeCharacter.value)
    ensureCharacterRelationshipBase(activeCharacter.value)
    ensureCharacterVoiceConfig(activeCharacter.value)
  },
  { immediate: true },
)

onMounted(async () => {
  await loadEditorData()
})
</script>


<template src="./worldbook-editor/WorldBookEditorScreen.template.html"></template>

<style scoped src="./worldbook-editor/styles/worldbook-editor-01.css"></style>
<style scoped src="./worldbook-editor/styles/worldbook-editor-02.css"></style>
<style scoped src="./worldbook-editor/styles/worldbook-editor-03.css"></style>

