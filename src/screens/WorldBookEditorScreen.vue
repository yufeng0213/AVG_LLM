<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  createDefaultCharacterVoiceConfig,
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
    ensureCharacterRelationshipBase(activeCharacter.value)
    ensureCharacterVoiceConfig(activeCharacter.value)
  },
  { immediate: true },
)

onMounted(async () => {
  await loadEditorData()
})
</script>

<template>
  <main class="worldbook-editor-screen" role="main">
    <p class="worldbook-editor-bg-word" aria-hidden="true">BOOK</p>

    <header class="worldbook-editor-header">
      <button type="button" class="back-button" @click="emit('back')">返回书架</button>
      <div class="worldbook-editor-title-group">
        <p class="worldbook-editor-tag">World Book Editor</p>
        <div class="worldbook-editor-title-row">
          <h1 class="worldbook-editor-title">{{ activeBook?.title || '世界书' }}</h1>
          <button type="button" class="edit-title-btn icon-btn" @click="openEditTitleDialog" title="编辑世界书名称">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span class="edit-btn-text">编辑</span>
          </button>
        </div>
        <p class="worldbook-editor-title-gradient">设定编辑</p>
      </div>
    </header>

    <section class="worldbook-editor-tabs" aria-label="设定分类">
      <button
        v-for="tab in editorTabs"
        :key="tab.id"
        type="button"
        class="worldbook-editor-tab"
        :class="{ active: activeEditorTab === tab.id }"
        @click="activeEditorTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </section>

    <section v-if="activeEditorTab === 'lore'" class="worldbook-editor-single">
      <section class="worldbook-editor settings-panel-content">
        <h2 class="panel-title">世界背景</h2>

        <section class="worldbook-global-display-settings" aria-label="整体显示设置">
          <h3 class="subpanel-title">整体显示设置</h3>
          <label class="setting-field">
            <span class="setting-label">立绘风格</span>
            <div class="select-wrapper">
              <select
                :value="activeBook?.displaySettings?.portraitStyle || 'card'"
                class="setting-select"
                @change="updateDisplaySetting('portraitStyle', $event.target.value)"
              >
                <option
                  v-for="option in WORLD_BOOK_PORTRAIT_STYLE_OPTIONS"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <span class="select-arrow">▼</span>
            </div>
            <p class="setting-hint portrait-style-hint">
              参考分辨率：卡片式/半身建议 1080×1620，全身/腿部建议 1080×1920（透明 PNG/WebP）。
            </p>
          </label>

          <label class="setting-field">
            <span class="setting-label">默认叙事者</span>
            <div class="select-wrapper">
              <select
                :value="activeBook?.defaultNarratorId || ''"
                class="setting-select"
                @change="updateActiveBookField('defaultNarratorId', $event.target.value)"
              >
                <option
                  v-for="profile in narratorOptions"
                  :key="profile.id"
                  :value="profile.id"
                >
                  {{ profile.name }}{{ !profile.enabled && !profile.isDefault ? '（已禁用）' : '' }}
                </option>
              </select>
              <span class="select-arrow">▼</span>
            </div>
            <p class="setting-hint">新游戏未手动覆盖时，将使用该叙事者风格。</p>
          </label>
        </section>

        <section class="worldbook-director-settings" aria-label="事件导演器配置">
          <h3 class="subpanel-title">事件导演器（高级）</h3>
          <p class="setting-hint">
            可按剧情行号/场景/选项/关系阈值触发事件，并注入 Prompt 指令、关系变化、导演标记。
          </p>
          <div class="director-actions">
            <button type="button" class="action-button action-outline" @click="insertDirectorEventTemplate">
              ＋ 插入模板
            </button>
            <button type="button" class="action-button action-outline" @click="resetDirectorEventsJson">
              重置文本
            </button>
            <button type="button" class="action-button action-strong" @click="applyDirectorEventsJson">
              应用 JSON
            </button>
          </div>
          <label class="setting-field">
            <span class="setting-label">directorEvents JSON</span>
            <textarea
              v-model="directorEventsText"
              class="setting-textarea director-json-textarea"
              rows="10"
              placeholder="[]"
              spellcheck="false"
            ></textarea>
          </label>
          <p v-if="directorEventsError" class="setting-error">{{ directorEventsError }}</p>
        </section>
        
        <!-- 条目选择下拉框 -->
        <label class="setting-field entry-select-field">
          <span class="setting-label">选择条目</span>
          <div class="select-wrapper">
            <select
              v-model="activeEntryKey"
              class="setting-select entry-select"
            >
              <option
                v-for="entry in WORLD_BOOK_ENTRY_DEFS"
                :key="entry.key"
                :value="entry.key"
              >
                {{ entry.label }}
              </option>
            </select>
            <span class="select-arrow">▼</span>
          </div>
          <span class="entry-hint" v-if="activeEntryDef">{{ activeEntryDef.hint }}</span>
        </label>

        <label class="setting-field">
          <span class="setting-label">{{ activeEntryDef.label }}</span>
          <textarea
            :value="activeBook?.entries?.[activeEntryKey] || ''"
            class="setting-textarea"
            rows="14"
            placeholder="在这里填写这个条目的详细背景设定"
            spellcheck="false"
            @input="updateActiveEntry($event.target.value)"
          ></textarea>
        </label>
      </section>
    </section>

    <section v-else-if="activeEditorTab === 'opening'" class="worldbook-editor-single">
      <section class="worldbook-editor settings-panel-content">
        <h2 class="panel-title">开场白设置</h2>
        <p class="panel-description">
          新游戏开场对白设置。若未启用自定义，将在开始新游戏时根据当前世界书自动生成 10-15 句。
        </p>

        <div class="director-actions">
          <button
            type="button"
            class="action-button action-outline"
            :class="{ active: openingDialogueMode === 'auto' }"
            @click="setOpeningDialogueMode('auto')"
          >
            自动生成
          </button>
          <button
            type="button"
            class="action-button action-outline"
            :class="{ active: openingDialogueMode === 'custom' }"
            @click="setOpeningDialogueMode('custom')"
          >
            自定义
          </button>
          <button type="button" class="action-button action-outline" @click="clearOpeningDialogueToAuto">
            清空并自动
          </button>
        </div>

        <label class="setting-field">
          <span class="setting-label">openingDialogue JSON</span>
          <textarea
            v-model="openingDialogueText"
            class="setting-textarea director-json-textarea"
            rows="14"
            :disabled="openingDialogueMode === 'auto'"
            placeholder='[{"speaker":"旁白","text":"...","emotion":null}]'
            spellcheck="false"
          ></textarea>
          <p class="setting-hint">每行格式：speaker / text / emotion（emotion 可留空）。</p>
        </label>

        <div class="director-actions">
          <button type="button" class="action-button action-outline" @click="resetOpeningDialogueText">
            重置文本
          </button>
          <button
            type="button"
            class="action-button action-strong"
            :disabled="openingDialogueMode === 'auto'"
            @click="applyOpeningDialogueJson"
          >
            应用自定义
          </button>
        </div>
        <p v-if="openingDialogueError" class="setting-error">{{ openingDialogueError }}</p>
      </section>
    </section>

    <section v-else-if="activeEditorTab === 'user'" class="worldbook-editor-single">
      <section class="worldbook-editor settings-panel-content">
        <h2 class="panel-title">user设定</h2>
        <p class="panel-description">用于设定当前用户/主视角人物的基本信息。</p>

        <div class="settings-grid two-column">
          <label class="setting-field">
            <span class="setting-label">名字</span>
            <input
              :value="activeBook?.userProfile?.name || ''"
              class="setting-input"
              type="text"
              placeholder="例如：林川"
              @input="updateUserField('name', $event.target.value)"
            />
          </label>

          <label class="setting-field">
            <span class="setting-label">昵称</span>
            <input
              :value="activeBook?.userProfile?.nickname || ''"
              class="setting-input"
              type="text"
              placeholder="例如：小川"
              @input="updateUserField('nickname', $event.target.value)"
            />
          </label>
        </div>

        <label class="setting-field">
          <span class="setting-label">身份</span>
          <input
            :value="activeBook?.userProfile?.identity || ''"
            class="setting-input"
            type="text"
            placeholder="例如：学院调查员 / 前特勤队员"
            @input="updateUserField('identity', $event.target.value)"
          />
        </label>

        <label class="setting-field">
          <span class="setting-label">外表</span>
          <textarea
            :value="activeBook?.userProfile?.appearance || ''"
            class="setting-textarea"
            rows="7"
            placeholder="记录体型、发色、穿着、标志性特征等"
            spellcheck="false"
            @input="updateUserField('appearance', $event.target.value)"
          ></textarea>
        </label>

        <label class="setting-field">
          <span class="setting-label">背景补充</span>
          <textarea
            :value="activeBook?.userProfile?.background || ''"
            class="setting-textarea"
            rows="7"
            placeholder="经历、性格、动机、禁忌等补充信息"
            spellcheck="false"
            @input="updateUserField('background', $event.target.value)"
          ></textarea>
        </label>

        <label class="setting-field">
          <span class="setting-label">立绘配置</span>
          <PortraitManager
            :portraits="activeBook?.userProfile?.portraits || []"
            @update="updateUserField('portraits', $event)"
          />
        </label>
      </section>
    </section>

    <section v-else-if="activeEditorTab === 'char'" class="worldbook-editor-single">
      <section class="worldbook-editor settings-panel-content">
        <!-- 标题行 - 包含标题和新增按钮 -->
        <div class="panel-title-row">
          <h2 class="panel-title">char设定</h2>
          <button type="button" class="action-button action-outline add-char-inline-btn" @click="addCharacter">
            ＋ 新增角色
          </button>
        </div>
        
        <!-- 角色选择下拉框 -->
        <label class="setting-field char-select-field">
          <span class="setting-label">选择角色</span>
          <div class="select-wrapper">
            <select
              v-model="activeCharacterId"
              class="setting-select char-select"
            >
              <option value="" disabled>-- 请选择角色 --</option>
              <option
                v-for="(char, index) in characters"
                :key="char.id"
                :value="char.id"
              >
                {{ getCharacterDisplayName(char, index) }}{{ char.nickname ? ` (${char.nickname})` : '' }}
              </option>
            </select>
            <span class="select-arrow">▼</span>
          </div>
        </label>
        
        <p class="panel-description" v-if="activeCharacter">当前编辑：{{ activeCharacterDisplayName }}</p>
        <p class="panel-description" v-else>请选择或新增一个角色进行编辑</p>

        <template v-if="activeCharacter">
          <div class="settings-grid two-column">
            <label class="setting-field">
              <span class="setting-label">名字</span>
              <input
                :value="activeCharacter.name"
                class="setting-input"
                type="text"
                @input="updateActiveCharacterField('name', $event.target.value)"
              />
            </label>

            <label class="setting-field">
              <span class="setting-label">昵称</span>
              <input
                :value="activeCharacter.nickname"
                class="setting-input"
                type="text"
                @input="updateActiveCharacterField('nickname', $event.target.value)"
              />
            </label>
          </div>

          <label class="setting-field">
            <span class="setting-label">身份</span>
            <input
              :value="activeCharacter.identity"
              class="setting-input"
              type="text"
              placeholder="例如：反抗军联络官 / 学院导师"
              @input="updateActiveCharacterField('identity', $event.target.value)"
            />
          </label>

          <label class="setting-field">
            <span class="setting-label">外表</span>
            <textarea
              :value="activeCharacter.appearance"
              class="setting-textarea"
              rows="7"
              placeholder="体型、发色、衣着、配件、动作习惯等"
              spellcheck="false"
              @input="updateActiveCharacterField('appearance', $event.target.value)"
            ></textarea>
          </label>

          <label class="setting-field">
            <span class="setting-label">背景</span>
            <textarea
              :value="activeCharacter.background"
              class="setting-textarea"
              rows="7"
              placeholder="经历、立场、目标、关系网"
              spellcheck="false"
              @input="updateActiveCharacterField('background', $event.target.value)"
            ></textarea>
          </label>

          <label class="setting-field">
            <span class="setting-label">备注</span>
            <textarea
              :value="activeCharacter.notes"
              class="setting-textarea"
              rows="6"
              placeholder="口癖、禁忌、剧情伏笔、台词风格"
              spellcheck="false"
              @input="updateActiveCharacterField('notes', $event.target.value)"
            ></textarea>
          </label>

          <section class="relationship-settings-card" aria-label="角色关系初始值">
            <h3 class="subpanel-title">角色关系初始值</h3>
            <p class="setting-hint">范围：{{ relationshipMetricMin }} ~ {{ relationshipMetricMax }}，会在新游戏时作为初始关系状态。</p>
            <div class="settings-grid relationship-grid">
              <label class="setting-field">
                <span class="setting-label">好感 (favor)</span>
                <input
                  :value="activeCharacter.relationshipBase?.favor ?? 50"
                  class="setting-input"
                  type="number"
                  inputmode="numeric"
                  :min="relationshipMetricMin"
                  :max="relationshipMetricMax"
                  @input="updateActiveCharacterRelationshipField('favor', $event.target.value)"
                />
              </label>
              <label class="setting-field">
                <span class="setting-label">信任 (trust)</span>
                <input
                  :value="activeCharacter.relationshipBase?.trust ?? 50"
                  class="setting-input"
                  type="number"
                  inputmode="numeric"
                  :min="relationshipMetricMin"
                  :max="relationshipMetricMax"
                  @input="updateActiveCharacterRelationshipField('trust', $event.target.value)"
                />
              </label>
              <label class="setting-field">
                <span class="setting-label">立场 (stance)</span>
                <input
                  :value="activeCharacter.relationshipBase?.stance ?? 0"
                  class="setting-input"
                  type="number"
                  inputmode="numeric"
                  :min="relationshipMetricMin"
                  :max="relationshipMetricMax"
                  @input="updateActiveCharacterRelationshipField('stance', $event.target.value)"
                />
              </label>
            </div>
          </section>

          <section class="voice-settings-card" aria-label="角色TTS语音配置">
            <h3 class="subpanel-title">角色 TTS 语音配置</h3>
            <p class="setting-hint">在游戏中点击“语音”按钮时会使用这里的设置调用 TTS。需要先在 API 设置中配置语音模型。</p>

            <label class="setting-field">
              <span class="setting-label">启用角色语音</span>
              <select
                :value="activeCharacter.voiceConfig?.enabled ? '1' : '0'"
                class="setting-select"
                @change="updateActiveCharacterVoiceField('enabled', $event.target.value === '1')"
              >
                <option value="0">关闭</option>
                <option value="1">开启</option>
              </select>
            </label>

            <div class="settings-grid two-column">
              <label class="setting-field">
                <span class="setting-label">voice_id</span>
                <input
                  :value="activeCharacter.voiceConfig?.voiceId || ''"
                  class="setting-input"
                  type="text"
                  placeholder="例如：male-qn-qingse"
                  @input="updateActiveCharacterVoiceField('voiceId', $event.target.value)"
                />
              </label>
              <label class="setting-field">
                <span class="setting-label">emotion（可选）</span>
                <input
                  :value="activeCharacter.voiceConfig?.emotion || ''"
                  class="setting-input"
                  type="text"
                  placeholder="例如：happy"
                  @input="updateActiveCharacterVoiceField('emotion', $event.target.value)"
                />
              </label>
            </div>

            <div class="settings-grid three-column">
              <label class="setting-field">
                <span class="setting-label">speed</span>
                <input
                  :value="activeCharacter.voiceConfig?.speed ?? 1"
                  class="setting-input"
                  type="number"
                  inputmode="decimal"
                  min="0.5"
                  max="2"
                  step="0.05"
                  @input="updateActiveCharacterVoiceField('speed', $event.target.value)"
                />
              </label>
              <label class="setting-field">
                <span class="setting-label">vol</span>
                <input
                  :value="activeCharacter.voiceConfig?.vol ?? 1"
                  class="setting-input"
                  type="number"
                  inputmode="decimal"
                  step="0.01"
                  @change="updateActiveCharacterVoiceField('vol', $event.target.value)"
                  @blur="updateActiveCharacterVoiceField('vol', $event.target.value)"
                />
              </label>
              <label class="setting-field">
                <span class="setting-label">pitch（-12 ~ 12）</span>
                <input
                  :value="activeCharacter.voiceConfig?.pitch ?? 0"
                  class="setting-input"
                  type="number"
                  inputmode="decimal"
                  min="-12"
                  max="12"
                  step="0.5"
                  @change="updateActiveCharacterVoiceField('pitch', $event.target.value)"
                  @blur="updateActiveCharacterVoiceField('pitch', $event.target.value)"
                />
              </label>
            </div>

            <div class="settings-grid four-column">
              <label class="setting-field">
                <span class="setting-label">sample_rate</span>
                <input
                  :value="activeCharacter.voiceConfig?.sampleRate ?? 32000"
                  class="setting-input"
                  type="number"
                  inputmode="numeric"
                  min="8000"
                  max="48000"
                  step="1000"
                  @input="updateActiveCharacterVoiceField('sampleRate', $event.target.value)"
                />
              </label>
              <label class="setting-field">
                <span class="setting-label">bitrate</span>
                <input
                  :value="activeCharacter.voiceConfig?.bitrate ?? 128000"
                  class="setting-input"
                  type="number"
                  inputmode="numeric"
                  min="32000"
                  max="320000"
                  step="1000"
                  @input="updateActiveCharacterVoiceField('bitrate', $event.target.value)"
                />
              </label>
              <label class="setting-field">
                <span class="setting-label">format</span>
                <select
                  :value="activeCharacter.voiceConfig?.format || 'mp3'"
                  class="setting-select"
                  @change="updateActiveCharacterVoiceField('format', $event.target.value)"
                >
                  <option value="mp3">mp3</option>
                  <option value="wav">wav</option>
                  <option value="flac">flac</option>
                </select>
              </label>
              <label class="setting-field">
                <span class="setting-label">channel</span>
                <select
                  :value="String(activeCharacter.voiceConfig?.channel ?? 1)"
                  class="setting-select"
                  @change="updateActiveCharacterVoiceField('channel', $event.target.value)"
                >
                  <option value="1">1 (mono)</option>
                  <option value="2">2 (stereo)</option>
                </select>
              </label>
            </div>

            <label class="setting-field">
              <span class="setting-label">pronunciation_dict.tone（每行一条，可选）</span>
              <textarea
                :value="getActiveCharacterVoiceToneText()"
                class="setting-textarea"
                rows="4"
                placeholder="处理/(chu3)(li3)"
                spellcheck="false"
                @input="updateActiveCharacterVoiceToneText($event.target.value)"
              ></textarea>
            </label>
          </section>

          <label class="setting-field">
            <span class="setting-label">立绘配置</span>
            <PortraitManager
              :portraits="activeCharacter?.portraits || []"
              @update="updateActiveCharacterField('portraits', $event)"
            />
          </label>
        </template>
      </section>
    </section>

    <!-- 场景管理标签页 -->
    <section v-if="activeEditorTab === 'scenes'" class="worldbook-editor-layout">
      <aside class="worldbook-entry-nav" aria-label="场景列表">
        <button
          v-for="(scene, index) in scenes"
          :key="scene.id"
          type="button"
          class="worldbook-entry-item worldbook-char-item"
          :class="{ active: activeSceneId === scene.id }"
          @click="activeSceneId = scene.id"
        >
          <span class="char-name">{{ getSceneDisplayName(scene, index) }}</span>
          <span class="char-note">{{ scene.description?.substring(0, 10) || '无描述' }}</span>
        </button>
        
        <button
          type="button"
          class="worldbook-entry-item add-item"
          @click="addScene"
        >
          + 新增场景
        </button>
      </aside>

      <section class="worldbook-editor settings-panel-content">
        <h2 class="panel-title">场景管理</h2>
        <p class="panel-description">
          当前场景：{{ activeSceneDisplayName }}
          <span v-if="backgroundList.length > 0"> | 已加载 {{ backgroundList.length }} 个背景</span>
        </p>

        <!-- 背景文件夹操作 -->
        <div class="scene-folder-actions">
          <button
            type="button"
            class="action-button"
            :disabled="isLoadingBackgrounds"
            @click="handleSelectBackgroundFolder"
          >
            {{ isAndroidPlatform ? '🖼️ 选择背景图片' : '📁 选择背景文件夹' }}
          </button>
          <button
            type="button"
            class="action-button"
            :disabled="isLoadingBackgrounds"
            @click="handleLoadBackgroundFolder"
          >
            🔄 刷新背景列表
          </button>
          <span v-if="backgroundFolderPath" class="folder-path">
            {{ backgroundFolderPath }}
          </span>
        </div>

        <template v-if="activeScene">
          <div class="settings-grid two-column">
            <label class="setting-field">
              <span class="setting-label">场景ID</span>
              <input
                :value="activeScene.id"
                class="setting-input"
                type="text"
                disabled
                placeholder="自动生成"
              />
            </label>

            <label class="setting-field">
              <span class="setting-label">场景名称</span>
              <input
                :value="activeScene.name"
                class="setting-input"
                type="text"
                placeholder="例如：旧图书馆、雨夜街道"
                @input="updateActiveSceneField('name', $event.target.value)"
              />
            </label>
          </div>

          <label class="setting-field">
            <span class="setting-label">背景图片</span>
            <select
              :value="activeScene.background"
              class="setting-select"
              @change="updateActiveSceneField('background', $event.target.value)"
            >
              <option value="">-- 选择背景图片 --</option>
              <option
                v-for="bg in backgroundList"
                :key="bg.id"
                :value="bg.id"
              >
                {{ bg.label }}
              </option>
            </select>
            <p class="setting-hint">
              从已加载的背景列表中选择，或手动输入背景ID
            </p>
          </label>

          <label class="setting-field">
            <span class="setting-label">场景描述</span>
            <textarea
              :value="activeScene.description"
              class="setting-textarea"
              rows="4"
              placeholder="场景的详细描述，用于 LLM 生成剧情时参考"
              spellcheck="false"
              @input="updateActiveSceneField('description', $event.target.value)"
            ></textarea>
          </label>

          <!-- 背景预览 -->
          <div v-if="activeScene.background" class="scene-preview">
            <p class="preview-label">背景预览</p>
            <div class="preview-box">
              <p class="preview-placeholder">
                已选择: {{ activeScene.background }}
              </p>
            </div>
          </div>

          <!-- 删除场景按钮 -->
          <div class="scene-delete-action">
            <button
              type="button"
              class="action-button action-danger"
              @click="deleteScene(activeScene.id)"
            >
              🗑️ 删除此场景
            </button>
          </div>
        </template>

        <div v-else class="empty-state">
          <p>暂无场景配置</p>
          <button type="button" class="action-button" @click="addScene">
            + 添加第一个场景
          </button>
        </div>
      </section>
    </section>

    <div class="setting-actions worldbook-editor-actions">
      <button type="button" class="action-button action-strong" :disabled="isSaving" @click="saveWorldBooks">
        {{ isSaving ? '保存中...' : '保存世界书' }}
      </button>
    </div>

    <p class="status-message">{{ statusMessage }}</p>

    <!-- 编辑世界书名称对话框 -->
    <Teleport to="body">
      <div v-if="showEditTitleDialog" class="dialog-overlay" @click.self="cancelEditTitle">
        <div class="dialog-content edit-title-dialog">
          <h3 class="dialog-title">编辑世界书名称</h3>
          <label class="setting-field">
            <span class="setting-label">世界书名称</span>
            <input
              v-model="editTitle"
              class="setting-input"
              type="text"
              placeholder="请输入世界书名称"
              @keyup.enter="confirmEditTitle"
              ref="editTitleInput"
            />
          </label>
          <div class="dialog-actions">
            <button type="button" class="dialog-btn dialog-btn-cancel small-btn" @click="cancelEditTitle">取消</button>
            <button type="button" class="dialog-btn dialog-btn-confirm small-btn" @click="confirmEditTitle">确认</button>
          </div>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<style scoped src="./WorldBookEditorScreen.css"></style>

