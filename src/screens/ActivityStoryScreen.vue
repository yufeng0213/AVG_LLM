<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import {
  getActiveWorldBookId,
  loadWorldBooks,
} from '../worldbook/worldBookStore.js'
import {
  generateStory,
  buildStoryPrompt,
  parseStoryContent,
  parseXmlStoryContent,
  toGameScript,
} from '../llm/index.js'
import {
  getActivityStorySave,
  saveActivityStory,
  updateActivityStoryDialogue,
  buildActivityStoryPromptContext,
} from '../features/activityStoryStore.js'
import { kvStorage } from '../storage/index.js'

const emit = defineEmits(['back'])

const props = defineProps({
  activityId: {
    type: String,
    required: true,
  },
  storyConfig: {
    type: Object,
    default: () => ({}),
  },
  activityFiles: {
    type: Array,
    default: null,
  },
})

// 世界书数据
const worldBooks = ref([])
const activeBookId = ref('default_world_book')

// 对话数据
const dialogueScript = ref([])
const currentLineIndex = ref(0)
const isLoading = ref(false)
const isGenerating = ref(false)
const userInput = ref('')
const error = ref(null)

// 显示状态
const displayLine = ref({ speaker: '', text: '', emotion: 'neutral' })

// ========== 对话框文字截断 / 续行分页 (来自 GameScreen) ==========
const lineTruncationMap = ref(new Map())
const currentContinuationPage = ref(0)
const dialogueTextRef = ref(null)

const isCurrentLineTruncated = computed(() => {
  const segs = lineTruncationMap.value.get(currentLineIndex.value)
  return segs && segs.length > 1
})

const totalContinuationPages = computed(() => {
  const segs = lineTruncationMap.value.get(currentLineIndex.value)
  return segs ? segs.length : 1
})

const displayedText = computed(() => {
  const segs = lineTruncationMap.value.get(currentLineIndex.value)
  if (!segs) return displayLine.value?.text || ''
  return segs[Math.min(currentContinuationPage.value, segs.length - 1)] || segs[0]
})

// ========== 打字机效果 (来自 GameScreen) ==========
const TYPEWRITER_SPEED = 30 // 字/秒
const typewriterProgress = ref(0)
const typewriterActiveLine = ref(-1)
let typewriterTimer = null

const isTypingActive = computed(() => {
  if (typewriterActiveLine.value !== currentLineIndex.value) return false
  return typewriterTimer !== null
})

const visibleText = computed(() => {
  const fullText = displayedText.value
  // 行索引不匹配（新行还没开始打字）：显示第一个字符
  if (typewriterActiveLine.value !== currentLineIndex.value) {
    return fullText ? fullText.substring(0, 1) : ''
  }
  if (typewriterProgress.value <= 0) return ''
  return fullText.substring(0, typewriterProgress.value)
})

const PUNCTUATION_CHARS = new Set(['。', '！', '？', '…', '\n', '.', '!', '?'])
const LONG_PAUSE_CHARS = new Set(['。', '！', '？', '…', '\n'])

const startTyping = (text) => {
  if (typewriterTimer) clearTimeout(typewriterTimer)
  if (!text) {
    typewriterTimer = null
    typewriterActiveLine.value = currentLineIndex.value
    typewriterProgress.value = 0
    return
  }
  typewriterActiveLine.value = currentLineIndex.value
  const baseDelay = 1000 / TYPEWRITER_SPEED
  const punctPause = baseDelay * 2
  const longPause = baseDelay * 3

  typewriterProgress.value = 1

  const typeNext = () => {
    if (typewriterProgress.value >= text.length) {
      typewriterTimer = null
      return
    }
    typewriterProgress.value++
    const char = text[typewriterProgress.value - 1]
    let delay = baseDelay
    if (PUNCTUATION_CHARS.has(char)) delay = punctPause
    if (LONG_PAUSE_CHARS.has(char)) delay = longPause
    typewriterTimer = setTimeout(typeNext, delay)
  }
  typewriterTimer = setTimeout(typeNext, 0)
}

const skipTyping = () => {
  if (typewriterTimer) {
    clearTimeout(typewriterTimer)
    typewriterTimer = null
  }
  typewriterProgress.value = displayedText.value?.length || 0
}

// ========== 截断检测函数 (来自 GameScreen) ==========
const findSafeBreakPoint = (text, targetIndex) => {
  if (targetIndex >= text.length) return text.length
  const sentenceBreaks = ['。', '！', '？', '.', '!', '?', '…', '\n']
  const softBreaks = [' ', '，', ',', '、', '；', ';', '」', '"', '）', ')']
  // 向前搜索句号
  for (let i = targetIndex; i > Math.max(0, targetIndex - 40); i--) {
    if (sentenceBreaks.includes(text[i - 1])) return i
  }
  // 向前搜索逗号
  for (let i = targetIndex; i > Math.max(0, targetIndex - 25); i--) {
    if (softBreaks.includes(text[i - 1])) return i
  }
  // 向后搜索句号
  for (let i = targetIndex; i < Math.min(targetIndex + 40, text.length); i++) {
    if (sentenceBreaks.includes(text[i])) return i + 1
  }
  // 向后搜索逗号
  for (let i = targetIndex; i < Math.min(targetIndex + 25, text.length); i++) {
    if (softBreaks.includes(text[i])) return i + 1
  }
  return targetIndex
}

const computeTruncatedSegments = (text, containerWidth, containerHeight) => {
  if (!text || text.length < 30) return [text]

  const measurer = document.createElement('p')
  measurer.className = 'dialogue-text'
  measurer.style.cssText = `position:absolute;visibility:hidden;left:-9999px;top:-9999px;width:${containerWidth}px;line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;padding:0;margin:0;`
  document.body.appendChild(measurer)

  const maxHeight = containerHeight - 4
  const segments = []
  let remaining = text

  while (remaining.length > 0) {
    measurer.textContent = remaining
    if (measurer.scrollHeight <= maxHeight) {
      segments.push(remaining)
      remaining = ''
      break
    }

    // 二分查找最大适配字符数
    let lo = 1
    let hi = remaining.length
    let bestFit = 1
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2)
      const bp = findSafeBreakPoint(remaining, mid)
      measurer.textContent = remaining.substring(0, bp)
      if (measurer.scrollHeight <= maxHeight) {
        bestFit = bp
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    if (bestFit <= 1) {
      bestFit = Math.min(1, remaining.length)
    }

    const bp = findSafeBreakPoint(remaining, bestFit)
    const segment = remaining.substring(0, bp).trimEnd()
    segments.push(segment)
    remaining = remaining.substring(bp).trimStart()
    if (remaining.length === 0) break
  }

  document.body.removeChild(measurer)

  if (segments.length === 1) return segments
  for (let i = 0; i < segments.length - 1; i++) {
    if (!segments[i].endsWith('...')) segments[i] += '...'
  }
  return segments.length > 0 ? segments : [text]
}

const detectLineTruncation = async () => {
  const line = displayLine.value
  if (!line || !line.text) {
    lineTruncationMap.value.delete(currentLineIndex.value)
    currentContinuationPage.value = 0
    return
  }

  // 已有缓存则跳过
  if (lineTruncationMap.value.has(currentLineIndex.value)) return

  await nextTick()
  await nextTick()

  const el = dialogueTextRef.value
  if (!el) return
  const w = el.clientWidth
  const h = el.clientHeight
  if (w < 50 || h < 30) return

  const segs = computeTruncatedSegments(line.text, w, h)
  lineTruncationMap.value.set(currentLineIndex.value, segs)
  if (segs.length > 1) {
    currentContinuationPage.value = 0
  }
}

// 背景 - 安全访问
const backgroundImage = ref('')
const bgImageError = ref(false)

// 渐变色配置
const backgroundGradient = computed(() => {
  const gradient = props.storyConfig?.backgroundGradient
  if (Array.isArray(gradient) && gradient.length >= 2) {
    return gradient
  }
  // 默认渐变色
  return ['#1a0a2e', '#2a1f10', '#0a1628']
})

// 从 activityFiles 中查找图片并返回 data URI（Android/Web 环境）
const resolveImageFromFiles = (relativePath) => {
  if (!relativePath || !props.activityFiles || !props.activityFiles.length) return null

  // 标准化路径：去掉 ./ 前缀
  let normalizedPath = relativePath
  if (normalizedPath.startsWith('./')) {
    normalizedPath = normalizedPath.substring(2)
  }

  // 在 files 中查找
  const file = props.activityFiles.find(f => {
    const filePath = f.path || ''
    return filePath === normalizedPath ||
           filePath.endsWith('/' + normalizedPath) ||
           normalizedPath.endsWith(filePath)
  })

  if (!file) return null

  // 构建 data URI
  const ext = file.path.split('.').pop().toLowerCase()
  const mimeType = ext === 'png' ? 'image/png'
    : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'webp' ? 'image/webp'
    : ext === 'gif' ? 'image/gif'
    : 'application/octet-stream'

  if (file.encoding === 'base64') {
    return `data:${mimeType};base64,${file.content}`
  }
  return null
}

// 解析背景图片路径
const resolvedBackgroundImage = computed(() => {
  const bgPath = props.storyConfig?.backgroundImage || ''
  if (!bgPath) return null

  // Android/Web 环境：优先从 activityFiles 中查找
  if (props.activityFiles && props.activityFiles.length) {
    const dataUri = resolveImageFromFiles(bgPath)
    if (dataUri) return dataUri
  }

  // Electron/Web 文件系统环境：使用文件路径
  // 相对路径解析
  if (bgPath.startsWith('./')) {
    return `/data/activities/${props.activityId}/${bgPath.substring(2)}`
  }
  if (bgPath.startsWith('/') || bgPath.startsWith('http')) {
    return bgPath
  }
  return `/data/activities/${props.activityId}/${bgPath}`
})

// 是否显示渐变背景
const showGradientBg = computed(() => {
  return !resolvedBackgroundImage.value || bgImageError.value
})

// 监听背景图片变化
watch(resolvedBackgroundImage, (newPath) => {
  if (newPath) {
    backgroundImage.value = newPath
    bgImageError.value = false
  } else {
    backgroundImage.value = ''
    bgImageError.value = true
  }
}, { immediate: true })

// 背景图片加载失败处理
function handleBgImageError() {
  console.warn('[ActivityStory] 背景图片加载失败:', backgroundImage.value)
  bgImageError.value = true
}

// ========== 立绘配置 ==========
const portraitsConfig = computed(() => props.storyConfig?.portraits || {})

// 获取活动根路径（基于 activityId）
const activityBasePath = computed(() => {
  // activityId 格式如 "废土娇宠_夏日祭"，对应目录 data/activities/废土娇宠_夏日祭/
  return `/data/activities/${props.activityId}/`
})

// 解析立绘路径为完整 URL
const resolvePortraitPath = (relativePath) => {
  if (!relativePath) return null

  // Android/Web 环境：优先从 activityFiles 中查找
  if (props.activityFiles && props.activityFiles.length) {
    const dataUri = resolveImageFromFiles(relativePath)
    if (dataUri) return dataUri
  }

  // Electron/Web 文件系统环境：使用文件路径
  // 相对路径如 "./activity/portraits/陆野.png" -> "/data/activities/废土娇宠_夏日祭/activity/portraits/陆野.png"
  if (relativePath.startsWith('./')) {
    return activityBasePath.value + relativePath.substring(2)
  }
  // 已是完整路径或 http URL
  if (relativePath.startsWith('/') || relativePath.startsWith('http')) {
    return relativePath
  }
  return activityBasePath.value + relativePath
}

// 当前说话角色的立绘 URL
const currentPortraitUrl = computed(() => {
  const speaker = displayLine.value.speaker
  const emotion = displayLine.value.emotion || 'default'
  const portraits = portraitsConfig.value[speaker]

  // 调试日志
  console.log('[ActivityStory Portrait]', {
    speaker,
    emotion,
    hasPortraitsConfig: !!portraitsConfig.value[speaker],
    portraitsKeys: Object.keys(portraitsConfig.value),
    activityBasePath: activityBasePath.value,
  })

  if (!portraits) return null

  // 优先匹配情绪，回退到 default
  const portraitPath = portraits[emotion] || portraits['default']
  const fullPath = resolvePortraitPath(portraitPath)
  console.log('[ActivityStory Portrait] resolved path:', fullPath)
  return fullPath
})

// 是否显示立绘（非旁白时显示）
const shouldShowPortrait = computed(() => {
  const speaker = displayLine.value.speaker
  return speaker && speaker !== '旁白' && speaker !== 'narrator' && currentPortraitUrl.value
})

// 计算属性
const currentBook = computed(() => {
  return worldBooks.value.find(book => book.id === activeBookId.value) || null
})

const sceneCharacters = computed(() => {
  const configChars = props.storyConfig?.sceneCharacters || []
  if (configChars.length > 0 && currentBook.value?.characters) {
    return configChars.map(name => {
      const found = currentBook.value.characters.find(c => c.name === name || c.nickname === name)
      return found || { id: name, name, role: '角色' }
    })
  }
  return currentBook.value?.characters || []
})

const displayDialogueLength = computed(() => dialogueScript.value.length)

// 是否在最后一行
const isLastLine = computed(() => currentLineIndex.value === dialogueScript.value.length - 1)

// 是否显示输入面板
const showInputPanel = ref(false)

// 初始化
onMounted(async () => {
  // 打印接收到的 storyConfig
  console.log('========================================')
  console.log('[ActivityStory] 接收到的 props:')
  console.log('========================================')
  console.log('activityId:', props.activityId)
  console.log('storyConfig:', props.storyConfig)
  console.log('openingPrompt:', props.storyConfig?.openingPrompt)
  console.log('portraits:', props.storyConfig?.portraits)
  console.log('========================================')

  worldBooks.value = await loadWorldBooks()
  activeBookId.value = await getActiveWorldBookId()

  const save = await getActivityStorySave(props.activityId)
  if (save) {
    dialogueScript.value = save.dialogueScript || []
    currentLineIndex.value = save.currentLineIndex || 0
  }

  if (dialogueScript.value.length === 0) {
    await generateOpeningDialogue()
  } else {
    updateDisplayLine()
    // 如果已有对话且在最后一行，显示输入面板
    if (isLastLine.value) {
      showInputPanel.value = true
    }
  }

  // 监听窗口 resize
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (typewriterTimer) clearTimeout(typewriterTimer)
  window.removeEventListener('resize', handleResize)
})

let resizeClearTimer = null
const handleResize = () => {
  if (resizeClearTimer) clearTimeout(resizeClearTimer)
  resizeClearTimer = setTimeout(() => {
    lineTruncationMap.value.clear()
    detectLineTruncation()
  }, 300)
}

// 生成开场对话
async function generateOpeningDialogue() {
  isLoading.value = true
  error.value = null
  showInputPanel.value = false // 加载时隐藏输入面板

  try {
    const activityContext = buildActivityStoryPromptContext(props.storyConfig)
    const narratorProfile = currentBook.value?.narrator || null

    const prompt = buildStoryPrompt({
      worldBook: currentBook.value,
      narratorProfile,
      sceneCharacters: sceneCharacters.value,
      activityStoryContext: activityContext,
      userInput: '故事开始',
      messageCount: 5,
    })

    // 打印 LLM 输入 Prompt
    console.log('========================================')
    console.log('[ActivityStory] LLM 输入 Prompt:')
    console.log('========================================')
    console.log(prompt)
    console.log('========================================')

    const result = await generateStory(prompt, {
      worldBookId: activeBookId.value,
    })

    // 打印 LLM 输出结果
    console.log('========================================')
    console.log('[ActivityStory] LLM 输出结果:')
    console.log('========================================')
    console.log('success:', result?.success)
    console.log('error:', result?.error)
    console.log('data (raw):', result?.data)
    console.log('========================================')

    if (result && result.success && result.data) {
      let parsed = parseStoryContent(result.data)

      // 如果 JSON 解析失败，尝试 XML 解析
      if (!parsed.success || !parsed.dialogues?.length) {
        parsed = parseXmlStoryContent(result.data)
      }

      if (!parsed.success || !parsed.dialogues?.length) {
        error.value = parsed.error || '解析结果为空'
        return
      }

      const script = toGameScript(parsed.dialogues)

      if (!script?.length) {
        error.value = '脚本转换失败'
        return
      }

      dialogueScript.value = script
      currentLineIndex.value = 0
      lineTruncationMap.value.clear()

      await saveActivityStory(props.activityId, {
        dialogueScript: script,
        currentLineIndex: 0,
        sceneCharacters: sceneCharacters.value,
        storyConfig: props.storyConfig,
      })

      updateDisplayLine()
      // 开场生成完成后显示输入面板（因为在最后一行）
      showInputPanel.value = true
    } else {
      error.value = result?.error || '生成结果为空'
    }
  } catch (e) {
    error.value = e.message || '生成失败'
    console.error('[ActivityStory] 开场生成失败:', e)
  } finally {
    isLoading.value = false
  }
}

// 生成后续对话
async function generateNextDialogue() {
  if (!userInput.value.trim()) return

  isGenerating.value = true
  error.value = null
  showInputPanel.value = false // 生成时隐藏输入面板

  // 记录当前对话长度，用于生成后定位到新对话的第一行
  const prevLength = dialogueScript.value.length

  try {
    const activityContext = buildActivityStoryPromptContext(props.storyConfig)
    const narratorProfile = currentBook.value?.narrator || null

    const recentDialogue = dialogueScript.value.slice(-10)

    const prompt = buildStoryPrompt({
      worldBook: currentBook.value,
      narratorProfile,
      dialogueHistory: recentDialogue,
      currentLine: displayLine.value,
      sceneCharacters: sceneCharacters.value,
      activityStoryContext: activityContext,
      userInput: userInput.value.trim(),
      messageCount: 3,
    })

    // 打印 LLM 输入 Prompt
    console.log('========================================')
    console.log('[ActivityStory] LLM 输入 Prompt (后续对话):')
    console.log('========================================')
    console.log(prompt)
    console.log('========================================')

    const result = await generateStory(prompt, {
      worldBookId: activeBookId.value,
    })

    // 打印 LLM 输出结果
    console.log('========================================')
    console.log('[ActivityStory] LLM 输出结果 (后续对话):')
    console.log('========================================')
    console.log('success:', result?.success)
    console.log('error:', result?.error)
    console.log('data (raw):', result?.data)
    console.log('========================================')

    if (result && result.success && result.data) {
      let parsed = parseStoryContent(result.data)

      if (!parsed.success || !parsed.dialogues?.length) {
        parsed = parseXmlStoryContent(result.data)
      }

      if (!parsed.success || !parsed.dialogues?.length) {
        error.value = parsed.error || '解析结果为空'
        return
      }

      const script = toGameScript(parsed.dialogues)

      if (!script?.length) {
        error.value = '脚本转换失败'
        return
      }

      dialogueScript.value = [...dialogueScript.value, ...script]
      // 跳到新对话的第一行（而不是最后一行）
      currentLineIndex.value = prevLength
      lineTruncationMap.value.clear()

      await updateActivityStoryDialogue(props.activityId, dialogueScript.value, currentLineIndex.value)

      userInput.value = ''
      updateDisplayLine()
      // 生成完成后不立即显示输入面板，让用户先阅读新对话
      // 输入面板将在到达最后一行时自动显示
    } else {
      error.value = result?.error || '生成结果为空'
      // 生成失败时恢复输入面板
      showInputPanel.value = true
    }
  } catch (e) {
    error.value = e.message || '生成失败'
    console.error('[ActivityStory] 对话生成失败:', e)
    // 生成失败时恢复输入面板
    showInputPanel.value = true
  } finally {
    isGenerating.value = false
  }
}

// 更新当前显示行
function updateDisplayLine() {
  if (dialogueScript.value.length === 0) return

  const line = dialogueScript.value[currentLineIndex.value]
  if (!line) return

  displayLine.value = {
    speaker: line.speaker || '',
    text: line.text || '',
    emotion: line.emotion || 'neutral',
  }

  currentContinuationPage.value = 0

  // 检测截断并开始打字机
  nextTick(() => {
    detectLineTruncation().then(() => {
      startTyping(displayedText.value)
    })
  })

  // 如果在最后一行，等待打字机完成后显示输入面板
  if (isLastLine.value && !isGenerating.value && !isLoading.value) {
    // 等待打字机效果完成后显示输入面板
    const checkTypingDone = () => {
      if (!isTypingActive.value) {
        showInputPanel.value = true
      } else {
        setTimeout(checkTypingDone, 100)
      }
    }
    setTimeout(checkTypingDone, 100)
  }
}

// 导航 - 处理分页
function goNextLine() {
  // 如果当前行有多页，先翻完续行
  const segs = lineTruncationMap.value.get(currentLineIndex.value)
  if (segs && segs.length > 1 && currentContinuationPage.value < segs.length - 1) {
    currentContinuationPage.value += 1
    skipTyping()
    startTyping(displayedText.value)
    return
  }

  // 翻到下一行
  if (currentLineIndex.value < dialogueScript.value.length - 1) {
    currentLineIndex.value++
    updateDisplayLine()
    // 离开最后一行时隐藏输入面板
    showInputPanel.value = false
  } else if (isLastLine.value) {
    // 已在最后一行，显示输入面板
    showInputPanel.value = true
  }
}

function goPrevLine() {
  // 如果当前行有多页且不在第一页，先回退续行
  const segs = lineTruncationMap.value.get(currentLineIndex.value)
  if (segs && segs.length > 1 && currentContinuationPage.value > 0) {
    currentContinuationPage.value -= 1
    skipTyping()
    startTyping(displayedText.value)
    return
  }

  // 翻到上一行
  if (currentLineIndex.value > 0) {
    currentLineIndex.value--
    updateDisplayLine()
    // 离开最后一行时隐藏输入面板
    showInputPanel.value = false
  }
}

// 点击对话框 - 根据点击位置判断左(上一页)/右(下一页)
function handleDialogueClick(event) {
  // 检查是否点击了交互元素
  const target = event?.target
  if (target instanceof Element) {
    if (target.closest('button, input, textarea, select, a, [role="button"]')) {
      return
    }
  }

  // 获取对话框元素和点击位置
  const dialogueBox = event.currentTarget
  if (!dialogueBox) return

  const rect = dialogueBox.getBoundingClientRect()
  const clickX = event.clientX - rect.left
  const isLeftClick = clickX < rect.width / 2

  // 如果打字机效果进行中，先跳过
  if (isTypingActive.value) {
    skipTyping()
  }

  // 根据点击位置决定导航方向
  if (isLeftClick) {
    goPrevLine()
  } else {
    goNextLine()
  }

  // 如果当前在最后一行且打字机已完成，显示输入面板
  if (isLastLine.value && !isTypingActive.value) {
    showInputPanel.value = true
  }
}

// 返回
function handleBack() {
  emit('back')
}
</script>

<template>
  <main class="activity-story-screen">
    <!-- 背景 -->
    <div class="story-background">
      <img v-if="!showGradientBg" :src="backgroundImage" class="bg-image" alt="" @error="handleBgImageError" />
      <div v-if="showGradientBg" class="bg-gradient" :style="{ background: `linear-gradient(180deg, ${backgroundGradient[0]} 0%, ${backgroundGradient[1]} 50%, ${backgroundGradient[2] || backgroundGradient[1]} 100%)` }"></div>
      <div class="bg-overlay"></div>
    </div>

    <!-- 返回按钮 -->
    <button class="back-btn" @click="handleBack">«</button>

    <!-- 立绘层 -->
    <div v-if="shouldShowPortrait" class="portrait-layer">
      <img :src="currentPortraitUrl" class="character-portrait" alt="" />
    </div>

    <!-- 对话框 (点击左半边上一页，右半边下一页) -->
    <section class="dialogue-box" @click="handleDialogueClick">
      <div class="dialogue-head">
        <p class="speaker-tag">{{ displayLine.speaker || '旁白' }}</p>
        <p class="line-progress">{{ currentLineIndex + 1 }} / {{ displayDialogueLength }}</p>
      </div>
      <p class="dialogue-text" :class="{ 'is-showing-continuation': currentContinuationPage > 0, 'is-typing': isTypingActive }" ref="dialogueTextRef">
        {{ visibleText }}
      </p>
      <p v-if="totalContinuationPages > 1" class="dialogue-continue-arrow">▼</p>
    </section>

    <!-- 输入区域 (仅在最后一行时显示) -->
    <transition name="input-fade">
      <section v-if="showInputPanel && isLastLine" class="input-area">
        <input
          v-model="userInput"
          type="text"
          class="story-input"
          placeholder="输入你的行动..."
          :disabled="isGenerating"
          @keyup.enter="generateNextDialogue"
        />
        <button
          class="send-btn"
          :disabled="isGenerating || !userInput.trim()"
          @click="generateNextDialogue"
        >
          {{ isGenerating ? '生成中...' : '发送' }}
        </button>
      </section>
    </transition>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p class="loading-text">正在生成故事...</p>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-toast">
      {{ error }}
      <button @click="error = null">关闭</button>
    </div>
  </main>
</template>

<style scoped>
/* 复用 GameScreen 样式 */
.activity-story-screen {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  min-height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
  color: #fff;
}

/* 背景 */
.story-background {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.bg-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bg-gradient {
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #1a0a2e 0%, #2a1f10 50%, #0a1628 100%);
}

.bg-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
}

/* 返回按钮 */
.back-btn {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 10;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 28px;
  cursor: pointer;
  transition: color 0.15s;
  padding: 0;
}

.back-btn:hover {
  color: rgba(255, 255, 255, 0.9);
}

/* 立绘层 */
.portrait-layer {
  position: absolute;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 220px);
  left: 50%;
  z-index: 3;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.character-portrait {
  max-height: 60dvh;
  max-width: 80vw;
  object-fit: contain;
  transform: translateX(-50%);
}

/* 对话框 */
.dialogue-box {
  position: absolute;
  left: 5%;
  right: 5%;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 60px);
  z-index: 5;
  border: 2px solid rgba(72, 209, 204, 0.6);
  border-radius: 8px;
  background: rgba(10, 22, 40, 0.85);
  backdrop-filter: blur(12px);
  padding: 12px 16px;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  height: clamp(120px, 18dvh, 200px);
  max-height: clamp(120px, 18dvh, 200px);
  overflow: hidden;
  max-width: 90%;
  margin: 0 auto;
  cursor: pointer;
}

.dialogue-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.speaker-tag {
  margin: 0;
  padding: 4px 10px;
  border: 2px solid #fbbf24;
  border-radius: 9999px;
  background: rgba(72, 209, 204, 0.34);
  font-size: 0.84rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.line-progress {
  margin: 0 auto;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: rgba(232, 244, 255, 0.88);
  white-space: nowrap;
}

.dialogue-text {
  margin: 0;
  padding-top: 8px;
  flex: 1 1 auto;
  min-height: 0;
  font-size: clamp(1rem, 1.65vw, 1.24rem);
  line-height: 1.55;
  color: rgba(232, 244, 255, 0.95);
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.dialogue-text.is-showing-continuation {
  display: block;
}

.dialogue-text.is-typing::after {
  content: '|';
  animation: cursor-blink 0.5s infinite;
}

@keyframes cursor-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.dialogue-continue-arrow {
  margin: 0;
  flex-shrink: 0;
  font-size: 0.7rem;
  line-height: 1;
  color: rgba(72, 209, 204, 0.7);
  text-align: right;
  user-select: none;
  animation: dialogue-arrow-pulse 1.2s ease-in-out infinite;
}

@keyframes dialogue-arrow-pulse {
  0%, 100% { opacity: 0.5; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(2px); }
}

/* 输入区域 */
.input-area {
  position: absolute;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 10px);
  left: 5%;
  right: 5%;
  z-index: 6;
  display: flex;
  gap: 8px;
}

.story-input {
  flex: 1;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
}

.story-input:focus {
  border-color: #48d1cc;
  background: rgba(0, 0, 0, 0.6);
}

.story-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.send-btn {
  padding: 10px 18px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #48d1cc, #3bb8b4);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.send-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(72, 209, 204, 0.3);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 输入面板淡入动画 */
.input-fade-enter-active {
  animation: input-slide-up 0.3s ease-out;
}

.input-fade-leave-active {
  animation: input-slide-down 0.2s ease-in;
}

@keyframes input-slide-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes input-slide-down {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(20px);
  }
}

/* 加载状态 */
.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #48d1cc;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 16px;
}

/* 错误提示 */
.error-toast {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 107, 107, 0.95);
  color: #fff;
  padding: 16px 24px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 12px;
}

.error-toast button {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}
</style>