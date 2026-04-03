<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { getActiveWorldBookId, loadWorldBooks } from '../worldbook/worldBookStore'
import { generateStory, buildStoryPrompt, parseStoryContent, toGameScript, hasChoices, extractChoices } from '../llm'
import { saveGame, createHistoryBackup, formatTimestamp } from '../save/saveManager'
import MusicPlayer from '../components/MusicPlayer.vue'
import Phone from '../components/Phone.vue'
import PluginComponent from '../plugins/PluginComponent.vue'
import { PluginTypes } from '../plugins/pluginManager.js'
import CGGeneratorModal from '../components/CGGeneratorModal.vue'
import {
  loadBackgroundFolder,
  switchBackground,
  currentBackgroundUrl,
  backgroundList
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
})

// 世界书数据
const worldBooks = ref([])
// 使用传入的世界书ID，如果没有则使用存档中的或默认的
const activeBookId = ref(props.worldBookId || props.saveData?.game?.worldBookId || getActiveWorldBookId())

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
  { min: 5, max: 10, label: '5-10条' },
  { min: 10, max: 20, label: '10-20条' },
  { min: 20, max: 30, label: '20-30条' },
]

// 在范围内随机生成消息条数
const getRandomMessageCount = () => {
  const { min, max } = generateMessageRange.value
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// 更新消息条数范围
const updateMessageRange = (event) => {
  const selectedIndex = parseInt(event.target.value)
  if (selectedIndex >= 0 && selectedIndex < messageRangeOptions.length) {
    generateMessageRange.value = {
      min: messageRangeOptions[selectedIndex].min,
      max: messageRangeOptions[selectedIndex].max,
    }
  }
}

const speakerCharacterMap = {
  伊芙: 'eve',
  你: 'lead',
  零号: 'zero',
}

const currentLineIndex = ref(0)
const activeCharacterId = ref('lead')

const currentLine = computed(() => dialogueScript.value[currentLineIndex.value])
const isLastLine = computed(() => currentLineIndex.value === dialogueScript.value.length - 1)

// 当前说话的角色
const currentSpeakingCharacter = computed(() => {
  const speakerId = speakerCharacterMap[currentLine.value?.speaker]
  return sceneCharacters.find(c => c.id === speakerId) || null
})

// 当前活跃的世界书
const activeBook = computed(() =>
  worldBooks.value.find((book) => book.id === activeBookId.value) || null,
)

// 加载世界书数据
const loadWorldBookData = () => {
  worldBooks.value = loadWorldBooks()
}

// 根据角色ID获取角色数据（支持 USER 和 Char）
const getCharacterData = (characterId) => {
  if (!activeBook.value) return null

  // USER 角色（lead/你）
  if (characterId === 'lead' || characterId === 'user') {
    return activeBook.value.userProfile
  }

  // 其他角色：根据名称或ID匹配
  const character = activeBook.value.characters.find(
    (char) => char.id === characterId || char.name === characterId,
  )
  return character
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
  const speakerId = speakerCharacterMap[currentLine.value?.speaker]
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
      // 添加新对话到脚本末尾
      dialogueScript.value = [...dialogueScript.value, ...newDialogues]
      
      // 自动跳转到第一条新对话
      currentLineIndex.value = dialogueScript.value.length - newDialogues.length
      
      // 清空用户输入和选择状态
      userPromptInput.value = ''
      selectedChoice.value = null
      customInputText.value = ''
      
      // 关闭生成面板和选项面板
      showGeneratePanel.value = false
      showChoicesPanel.value = false
      currentChoices.value = null
      
      // 检查最后一条对话是否有选项
      const lastDialogue = dialogueScript.value[dialogueScript.value.length - 1]
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
    showChoicesPanel.value = true
  } else {
    currentChoices.value = null
    showChoicesPanel.value = false
  }
}

// 切换生成面板显示
const toggleGeneratePanel = () => {
  showGeneratePanel.value = !showGeneratePanel.value
  if (!showGeneratePanel.value) {
    generateError.value = null
    userPromptInput.value = ''
  }
}

// 检查是否有 API 配置
const hasApiConfig = computed(() => {
  const activeId = localStorage.getItem('avg_llm_active_api_id')
  return Boolean(activeId)
})

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
  const characterId = speakerCharacterMap[currentLine.value?.speaker]
  if (characterId) {
    activeCharacterId.value = characterId
  }
  // 更新立绘显示
  updatePortraitUrls()
  // 检查当前对话是否有选项
  checkCurrentDialogueChoices()
}

const goNextLine = () => {
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

// ========== 存档功能 ==========

// 存档状态
const isSaving = ref(false)
const saveError = ref(null)
const saveSuccess = ref(null)
const showSavePanel = ref(false)
const saveSlotName = ref('')
const playStartTime = ref(Date.now()) // 游戏开始时间

// 计算游戏时长（秒）
const currentPlayTime = computed(() => {
  return Math.floor((Date.now() - playStartTime.value) / 1000)
})

// 切换存档面板显示
const toggleSavePanel = () => {
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
    // 使用 JSON 序列化确保数据可被 IPC 克隆
    const gameData = JSON.parse(JSON.stringify({
      metadata: {
        chapter: '第一章',
        scene: '旧图书馆',
        playTime: currentPlayTime.value,
        preview: currentLine.value?.text || '',
      },
      game: {
        worldBookId: activeBookId.value,
        currentLineIndex: currentLineIndex.value,
        dialogueScript: dialogueScript.value,
        sceneCharacters: sceneCharacters.map(c => ({
          id: c.id,
          name: c.name,
          role: c.role,
          toneClass: c.toneClass,
          positionClass: c.positionClass,
        })),
      },
    }))
    
    const result = await saveGame(gameData)
    
    if (result.success) {
      saveSuccess.value = `存档成功！时间: ${formatTimestamp(Date.now())}`
      // 自动创建历史备份
      await createHistoryBackup(JSON.parse(JSON.stringify(dialogueScript.value)), `自动备份_${formatTimestamp(Date.now())}`)
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
    // 使用 JSON 序列化确保数据可被 IPC 克隆
    const gameData = JSON.parse(JSON.stringify({
      metadata: {
        chapter: '第一章',
        scene: '旧图书馆',
        playTime: currentPlayTime.value,
        preview: currentLine.value?.text || '',
      },
      game: {
        worldBookId: activeBookId.value,
        currentLineIndex: currentLineIndex.value,
        dialogueScript: dialogueScript.value,
        sceneCharacters: sceneCharacters.map(c => ({
          id: c.id,
          name: c.name,
          role: c.role,
          toneClass: c.toneClass,
          positionClass: c.positionClass,
        })),
      },
    }))
    
    const result = await saveGame(gameData)
    
    if (result.success) {
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

// 加载存档数据
const loadSaveData = () => {
  if (props.saveData && props.saveData.game) {
    // 从存档恢复游戏状态
    if (props.saveData.game.dialogueScript && props.saveData.game.dialogueScript.length > 0) {
      dialogueScript.value = props.saveData.game.dialogueScript
    }
    if (props.saveData.game.currentLineIndex !== undefined) {
      currentLineIndex.value = props.saveData.game.currentLineIndex
    }
    if (props.saveData.game.worldBookId) {
      activeBookId.value = props.saveData.game.worldBookId
    }
    // 重置游戏开始时间
    playStartTime.value = Date.now() - (props.saveData.metadata?.playTime || 0) * 1000
  }
}

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
  
  // 如果有场景切换指令，切换背景
  if (newLine?.scene) {
    await switchBackground(newLine.scene)
  }
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
  loadWorldBookData()
  updatePortraitUrls()
  
  // 加载背景文件夹
  await loadBackgroundFolder()
  
  // 如果有存档数据，加载它
  if (props.saveData) {
    loadSaveData()
  } else {
    // 新游戏：初始化开场白
    initializeOpeningDialogue()
  }
})

// 监听世界书变化，重新初始化开场白
watch(activeBook, (newBook) => {
  if (newBook && !props.saveData) {
    initializeOpeningDialogue()
  }
})
</script>

<template>
  <main class="game-screen" role="main">
    <p class="game-bg-word" aria-hidden="true">PLAY</p>

    <header class="game-topbar">
      <button type="button" class="back-button" @click="emit('back')">返回主菜单</button>
      <div class="game-hud">
        <p class="hud-chip chip-primary">{{ props.saveData ? '继续游戏' : '新游戏' }}</p>
        <p class="hud-chip chip-secondary">序章 · 旧图书馆</p>
        <p class="hud-chip chip-tertiary">对话 {{ currentLineIndex + 1 }} / {{ dialogueScript.length }}</p>
      </div>
      <div class="save-actions">
        <button
          type="button"
          class="save-button quick-save"
          @click="quickSave"
          :disabled="isSaving"
          title="快速存档"
        >
          💾 快速存档
        </button>
        <button
          type="button"
          class="save-button"
          :class="{ 'is-active': showSavePanel }"
          @click="toggleSavePanel"
          title="存档管理"
        >
          📁 存档
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

      <div class="character-layer" aria-label="人物立绘">
        <div
          v-if="currentSpeakingCharacter"
          class="character-stand"
          :class="[
            'is-left',
            { active: true },
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

      <section class="dialogue-box" aria-live="polite">
        <div class="dialogue-head">
          <p class="speaker-tag">{{ currentLine.speaker }}</p>
          <p class="line-progress">{{ currentLineIndex + 1 }} / {{ dialogueScript.length }}</p>
        </div>
        <p class="dialogue-text">{{ currentLine.text }}</p>

        <div class="dialogue-actions">
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
            <label class="generate-input-group generate-count-group">
              <span class="generate-label">生成条数范围</span>
              <select
                class="generate-select"
                :disabled="isGenerating"
                @change="updateMessageRange($event)"
              >
                <option
                  v-for="(opt, index) in messageRangeOptions"
                  :key="index"
                  :value="index"
                  :selected="generateMessageRange.min === opt.min && generateMessageRange.max === opt.max"
                >
                  {{ opt.label }}（随机）
                </option>
              </select>
            </label>
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

      <!-- 选项面板 -->
      <section v-if="showChoicesPanel && currentChoices" class="choices-panel" aria-label="剧情选项">
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

    <!-- 音乐播放器（支持插件替换） -->
    <PluginComponent
      :default-component="MusicPlayer"
      :plugin-type="PluginTypes.MUSIC_PLAYER"
    />

    <!-- 手机（支持插件替换） -->
    <PluginComponent
      :default-component="Phone"
      :plugin-type="PluginTypes.PHONE"
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
  height: 100vh;
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 16px 20px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--background) 80%, transparent) 0%, transparent 100%);
}

.back-button {
  appearance: none;
  border: 4px dashed var(--accent-cyan);
  border-radius: 9999px;
  padding: 10px 18px;
  font: 700 0.86rem/1 var(--font-body);
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--foreground);
  background: color-mix(in srgb, var(--accent-purple) 40%, transparent);
  cursor: pointer;
  box-shadow:
    0 0 14px color-mix(in srgb, var(--accent-cyan) 45%, transparent),
    6px 6px 0 var(--accent-yellow);
  transition: transform 240ms ease, box-shadow 240ms ease;
}

.back-button:hover {
  transform: translateY(-2px) scale(1.04);
  box-shadow:
    0 0 20px color-mix(in srgb, var(--accent-cyan) 60%, transparent),
    9px 9px 0 var(--accent-yellow), 14px 14px 0 var(--accent-magenta);
}

.back-button:focus-visible {
  outline: 3px dashed var(--accent-yellow);
  outline-offset: 4px;
}

.game-hud {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.hud-chip {
  margin: 0;
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
  bottom: 20px;
  z-index: 5;
  border: 2px solid color-mix(in srgb, var(--accent-cyan) 60%, transparent);
  border-radius: 0;
  background: color-mix(in srgb, var(--background) 85%, transparent);
  backdrop-filter: blur(12px);
  padding: 16px 20px;
  box-shadow: 0 4px 30px color-mix(in srgb, var(--background) 80%, transparent);
  display: grid;
  gap: 10px;
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
  line-height: 1.65;
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
  width: 28px;
  height: 28px;
  border: 2px solid var(--accent-magenta);
  border-radius: 50%;
  background: transparent;
  color: var(--foreground);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 150ms ease;
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
  gap: 12px;
}

.generate-count-group {
  flex: 0 0 auto;
  min-width: 120px;
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
    padding-bottom: 200px;
  }

  .character-stand {
    width: clamp(160px, 24vw, 240px);
    height: clamp(280px, 52vh, 420px);
  }
}

@media (max-width: 900px) {
  .game-hud {
    justify-content: flex-start;
  }

  .game-topbar {
    padding: 12px 16px;
  }

  .character-layer {
    gap: 10px;
    padding-bottom: 180px;
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
    padding: 12px 16px;
  }
}

@media (max-width: 680px) {
  .character-layer {
    padding: 0 3% 160px;
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

  .game-bg-word {
    font-size: clamp(4.5rem, 24vw, 8rem);
    right: -7%;
  }

  .dialogue-box {
    left: 2%;
    right: 2%;
    bottom: 10px;
    padding: 10px 14px;
    border-radius: 12px;
  }
}

/* 选项面板样式 */
.choices-panel {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 11;
  width: min(90%, 480px);
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
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
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
  background: color-mix(in srgb, var(--background) 75%, transparent);
  backdrop-filter: blur(8px);
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

/* 存档按钮和面板样式 */
.save-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.save-button {
  appearance: none;
  border: 2px solid var(--accent-magenta);
  border-radius: 8px;
  padding: 8px 16px;
  font: 600 0.85rem/1 var(--font-body);
  color: var(--accent-magenta);
  background: color-mix(in srgb, var(--accent-magenta) 15%, transparent);
  cursor: pointer;
  transition: all 0.2s ease;
}

.save-button:hover:not(:disabled) {
  background: var(--accent-magenta);
  color: var(--bg);
  transform: translateY(-2px);
}

.save-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.save-button.quick-save {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: color-mix(in srgb, var(--accent-cyan) 15%, transparent);
}

.save-button.quick-save:hover:not(:disabled) {
  background: var(--accent-cyan);
  color: var(--bg);
}

.save-button.is-active {
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
  .save-actions {
    position: absolute;
    top: 8px;
    right: 8px;
  }

  .save-panel {
    width: 280px;
    right: 10px;
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
