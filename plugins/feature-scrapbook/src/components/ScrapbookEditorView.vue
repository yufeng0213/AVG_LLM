<script setup>
/**
 * ScrapbookEditorView.vue - A4 手帐编辑器
 * 自由画布模式：文字块可随意放置、拖拽、旋转，贴纸散落各处。
 * 支持「提交给角色」让 AI 角色回应。
 */
import { ref, nextTick } from 'vue'
import ScrapbookStickerItem from './ScrapbookStickerItem.vue'
import ScrapbookStickerPanel from './ScrapbookStickerPanel.vue'
import ScrapbookTemplateImport from './ScrapbookTemplateImport.vue'
import { saveBook } from '../composables/useScrapbookData.js'
import { callChatCompletion, getValidatedActiveConfig } from '../../../../src/llm/llmService.core.js'
import { loadWorldBooks } from '../../../../src/worldbook/worldBookStore.js'
import { loadSmsThreads, getSmsThread } from '../../../feature-phone/src/phone/composables/usePhoneData.js'
import { queryEvents, getCharacterMemories } from '../../../../src/memory/worldMemoryStore.js'
import { getRelationshipLevel } from '../../../../src/relationship/relationshipLevels.js'
import { printHtmlNative } from '../../../../src/native/cardImportPlugin.js'

const props = defineProps({
  book: { type: Object, required: true },
})
const emit = defineEmits(['back', 'saved'])

const showStickerPanel = ref(false)
const showImportPanel = ref(false)
const saving = ref(false)
const saveMsg = ref('')
const selectedStickerId = ref(null)
const selectedTextId = ref(null)

// 当前编辑的页面
const currentPage = ref(0)

// 本地工作副本
const pages = ref(props.book.pages || [])

// 角色回应
const submitting = ref(false)
const submitMsg = ref('')
const showSubmitDialog = ref(false)

// 打印
const showPrintDialog = ref(false)
const printSelectedPages = ref([])
const printMsg = ref('')

// 汉堡菜单
const showMenu = ref(false)

// 背景
const bgImageData = ref(null)
const bgOpacity = ref(1)

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

function getCurrentPage() {
  if (!pages.value[currentPage.value]) {
    pages.value[currentPage.value] = {
      id: `page_${Date.now()}`,
      title: `第 ${currentPage.value + 1} 页`,
      elements: [],
    }
  }
  return pages.value[currentPage.value]
}

function getElements() {
  const page = getCurrentPage()
  if (!page.elements) page.elements = []
  return page.elements
}

// ===== 文字块 =====

const textBlockDragging = ref({})
const textBlockResizing = ref({})

function addTextBlock(x, y) {
  const elements = getElements()
  const block = {
    id: 'text_' + generateId(),
    type: 'text',
    author: 'user',
    content: '',
    x: x || 30,
    y: y || 30,
    width: 160,
    height: 'auto',
    rotation: Math.round((Math.random() - 0.5) * 10),
    fontSize: 13 + Math.round(Math.random() * 4),
    color: '#333',
    fontWeight: Math.random() > 0.7 ? 'bold' : 'normal',
    fontStyle: Math.random() > 0.85 ? 'italic' : 'normal',
    zIndex: elements.length + 10,
  }
  elements.push(block)
  nextTick(() => {
    selectedTextId.value = block.id
    selectedStickerId.value = null
  })
}

function removeTextBlock(id) {
  const page = getCurrentPage()
  if (page.elements) {
    page.elements = page.elements.filter(e => e.id !== id)
  }
  selectedTextId.value = null
  delete textBlockDragging.value[id]
  delete textBlockResizing.value[id]
}

function onTextBlockInput(id, newContent) {
  const elements = getElements()
  const el = elements.find(e => e.id === id)
  if (el) el.content = newContent
}

// 文字块拖拽
function startTextDrag(e, el) {
  // 编辑状态下不拖拽
  if (el._editing) return
  selectElement(el)
  textBlockDragging.value[el.id] = true
  const pos = getEventPos(e)
  const parent = document.querySelector('.a4-canvas')
  if (!parent) return
  const rect = parent.getBoundingClientRect()
  const offset = { x: pos.x - rect.left - el.x, y: pos.y - rect.top - el.y }
  let dragging = false

  const onMove = (ev) => {
    if (!dragging) {
      ev.preventDefault()
      dragging = true
    }
    const p = getEventPos(ev)
    el.x = Math.max(0, Math.round(p.x - rect.left - offset.x))
    el.y = Math.max(0, Math.round(p.y - rect.top - offset.y))
  }
  const onEnd = () => {
    textBlockDragging.value[el.id] = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onEnd)
    document.removeEventListener('touchmove', onMove, { passive: false })
    document.removeEventListener('touchend', onEnd)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onEnd)
  document.addEventListener('touchmove', onMove, { passive: false })
  document.addEventListener('touchend', onEnd)
}

function startTextResize(e, el) {
  e.preventDefault()
  e.stopPropagation()
  textBlockResizing.value[el.id] = true
  const pos = getEventPos(e)
  const startW = el.width || 160

  const onMove = (ev) => {
    ev.preventDefault()
    const p = getEventPos(ev)
    const dx = p.x - pos.x
    el.width = Math.max(60, Math.round(startW + dx))
  }
  const onEnd = () => {
    textBlockResizing.value[el.id] = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onEnd)
    document.removeEventListener('touchmove', onMove, { passive: false })
    document.removeEventListener('touchend', onEnd)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onEnd)
  document.addEventListener('touchmove', onMove, { passive: false })
  document.addEventListener('touchend', onEnd)
}

function toggleTextEdit(el) {
  el._editing = !el._editing
  if (el._editing) {
    selectedTextId.value = el.id
  }
}

const textBlockRotating = ref({})

function startTextRotate(e, el) {
  e.preventDefault()
  e.stopPropagation()
  textBlockRotating.value[el.id] = true
  const pos = getEventPos(e)

  const onMove = (ev) => {
    if (!textBlockRotating.value[el.id]) return
    ev.preventDefault()
    const p = getEventPos(ev)
    const blockEl = ev.target.closest('.text-block')
    if (!blockEl) return
    const rect = blockEl.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const angle = Math.atan2(p.y - cy, p.x - cx) * (180 / Math.PI) + 90
    el.rotation = Math.round(angle)
  }
  const onEnd = () => {
    textBlockRotating.value[el.id] = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onEnd)
    document.removeEventListener('touchmove', onMove, { passive: false })
    document.removeEventListener('touchend', onEnd)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onEnd)
  document.addEventListener('touchmove', onMove, { passive: false })
  document.addEventListener('touchend', onEnd)
}

function getEventPos(e) {
  if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY }
  if (e.changedTouches && e.changedTouches.length > 0) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
  return { x: e.clientX, y: e.clientY }
}

// ===== 贴纸 =====

function addSticker(stickerData) {
  const elements = getElements()
  elements.push({
    id: 'sticker_' + generateId(),
    type: 'sticker',
    author: 'user',
    src: stickerData.imageData || stickerData.src,
    x: 40 + Math.round(Math.random() * 60),
    y: 40 + Math.round(Math.random() * 60),
    width: 100,
    height: 100,
    rotation: Math.round((Math.random() - 0.5) * 20),
    zIndex: elements.length + 10,
  })
  showStickerPanel.value = false
}

function onStickerSelected(id) {
  selectedStickerId.value = id
  selectedTextId.value = null
}

function removeElement(id) {
  const page = getCurrentPage()
  if (page.elements) {
    page.elements = page.elements.filter(e => e.id !== id)
  }
  selectedStickerId.value = null
  selectedTextId.value = null
}

// ===== 页面操作 =====

function addNewPage() {
  pages.value.push({
    id: 'page_' + generateId(),
    title: `第 ${pages.value.length + 1} 页`,
    elements: [],
  })
  currentPage.value = pages.value.length - 1
}

function removePage(idx) {
  if (pages.value.length <= 1) return
  pages.value.splice(idx, 1)
  if (currentPage.value >= pages.value.length) {
    currentPage.value = pages.value.length - 1
  }
}

async function handleSave() {
  saving.value = true
  saveMsg.value = ''
  try {
    const book = { ...props.book, pages: pages.value }
    await saveBook(book)
    saveMsg.value = '保存成功'
    setTimeout(() => { saveMsg.value = '' }, 2000)
  } catch (e) {
    saveMsg.value = '保存失败: ' + (e.message || '未知错误')
  } finally {
    saving.value = false
  }
}

function onTemplatesImported() {
  showImportPanel.value = false
}

// ===== 提交给角色 =====

function getPageTextContent() {
  const elements = getElements()
  return elements
    .filter(e => e.type === 'text')
    .map(e => {
      const text = e.content || e.htmlContent || ''
      // 去除 HTML 标签
      return text.replace(/<[^>]*>/g, '').trim()
    })
    .filter(Boolean)
    .join('\n')
}

async function handleSubmitToCharacter() {
  if (!props.book.characterName) {
    submitMsg.value = '没有关联角色，无法提交'
    return
  }
  if (!getPageTextContent()) {
    submitMsg.value = '先写点东西再提交吧'
    return
  }

  submitting.value = true
  submitMsg.value = ''
  showSubmitDialog.value = true

  try {
    const configResult = await getValidatedActiveConfig()
    if (!configResult.success) {
      submitMsg.value = '未配置 LLM API: ' + configResult.error
      showSubmitDialog.value = false
      return
    }

    const worldBookId = props.book.worldBookId || ''
    const characterId = props.book.characterId || ''

    // ===== 收集角色上下文 =====

    // 1. 最近的 SMS 对话（最近 20 条）
    let recentSms = ''
    try {
      const threads = await loadSmsThreads()
      if (characterId) {
        const messages = getSmsThread(threads, characterId)
        const recent = messages.slice(-20)
        if (recent.length > 0) {
          recentSms = recent.map(m => {
            const role = m.role === 'user' ? '你' : props.book.characterName
            return `[${role}]: ${m.text}`
          }).join('\n')
        }
      }
    } catch { /* 忽略 */ }

    // 2. 世界记忆（最近事件 + 角色个人记忆）
    let worldMemory = ''
    try {
      if (worldBookId && characterId) {
        const events = await queryEvents(worldBookId, {
          participants: [characterId],
          limit: 10,
          excludeFading: true,
        })
        if (events && events.length > 0) {
          worldMemory = events.map(e => {
            const summary = e.summary || e.description || ''
            return `- ${summary}`
          }).slice(0, 8).join('\n')
        }

        const charMemories = await getCharacterMemories(worldBookId, characterId)
        if (charMemories && charMemories.length > 0) {
          const memoryText = charMemories.slice(0, 6).map(m => {
            const content = m.content || m.detail || ''
            return `- ${content}`
          }).filter(Boolean).join('\n')
          if (memoryText) {
            worldMemory += (worldMemory ? '\n' : '') + `角色个人记忆:\n${memoryText}`
          }
        }
      }
    } catch { /* 忽略 */ }

    // 3. 关系等级
    let relationshipInfo = ''
    try {
      if (worldBookId && characterId) {
        const book = await loadWorldBooks().then(books =>
          books.find(b => b.id === worldBookId)
        )
        if (book) {
          const character = book.characters?.find(c => c.id === characterId || c.name === characterId)
          const relBase = character?.relationshipBase
          if (relBase) {
            const level = getRelationshipLevel(relBase.favor)
            relationshipInfo = `你和用户的关系等级: ${level.name} (好感度: ${relBase.favor}, 信任度: ${relBase.trust})`
          }
        }
      }
    } catch { /* 忽略 */ }

    // ===== 构建 Prompt =====

    const userContent = getPageTextContent()
    const stickersCount = getElements().filter(e => e.type === 'sticker').length

    let contextSection = ''
    if (recentSms) {
      contextSection += `\n\n你们最近的短信对话:\n${recentSms}`
    }
    if (worldMemory) {
      contextSection += `\n\n世界记忆和事件:\n${worldMemory}`
    }
    if (relationshipInfo) {
      contextSection += `\n\n${relationshipInfo}`
    }

    const systemPrompt = `你是${props.book.characterName}。你正在和一位用户一起编写一本手帐。
用户在手帐上写了一些内容，现在提交给你看，请你用自己的语气和风格回应。

角色名: ${props.book.characterName}
当前页面上用户贴了 ${stickersCount} 张贴纸。${contextSection}

你需要以 JSON 格式输出你的回应。JSON 结构如下:
{
  "text_blocks": [
    {
      "html": "你写的一段文字，支持HTML标签如 <b>粗体</b>、<i>斜体</i>、<span style='color:#ff6b6b'>彩色文字</span>、<u>下划线</u>、<br>换行等",
      "x": 50到400之间的数字,
      "y": 50到700之间的数字,
      "rotation": -15到15之间的数字,
      "width": 80到200之间的数字（文字块宽度）
    }
  ],
  "sticker_hints": [
    "描述你想要的贴纸样子"
  ]
}

要求:
- 根据你们的关系来决定回应语气。关系好就热情亲切，关系一般就平淡，关系差就冷淡或带刺
- 结合最近的短信对话和世界记忆来回应，让内容连贯
- 文字散落在页面不同位置，不要堆在一起
- 2-4段文字，风格随意自然
- 使用HTML让文字看起来更有趣：粗体、斜体、不同颜色的文字（用span style='color:#xxx'）、下划线等
- 可以用<sup>上标</sup>、<sub>下标</sub>、<small>小字</small>、<big>大字</big>等让手帐更生动
- sticker_hints 是0-2个你想要的贴纸描述
- 只输出 JSON，不要其他内容`

    const userPrompt = `用户在手帐里写了:\n\n${userContent}\n\n请用你自己的语气回应，也添加到这本手帐里。`

    const result = await callChatCompletion({
      config: configResult.config,
      systemPrompt,
      userPrompt,
      temperature: 0.85,
      maxTokens: 800,
      label: 'scrapbook_submit',
    })

    if (!result.success) {
      submitMsg.value = '角色回应失败: ' + result.error
      showSubmitDialog.value = false
      return
    }

    // 解析 JSON
    const raw = (result.data || '').trim()
    const jsonStart = raw.indexOf('{')
    const jsonEnd = raw.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) {
      submitMsg.value = '角色回应格式异常'
      showSubmitDialog.value = false
      return
    }

    const jsonResponse = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))

    const elements = getElements()

    // 添加角色的文字块
    if (Array.isArray(jsonResponse.text_blocks)) {
      for (const tb of jsonResponse.text_blocks) {
        elements.push({
          id: 'text_' + generateId(),
          type: 'text',
          author: 'character',
          htmlContent: tb.html || '',
          content: tb.html ? tb.html.replace(/<[^>]*>/g, '').trim() : '',
          x: Math.max(10, Math.min(400, tb.x || 50 + Math.random() * 200)),
          y: Math.max(10, Math.min(650, tb.y || 100 + Math.random() * 300)),
          rotation: tb.rotation || Math.round((Math.random() - 0.5) * 15),
          width: tb.width || 160,
          zIndex: elements.length + 10,
        })
      }
    }

    // sticker_hints 暂时以文字形式提示（后续可对接贴纸搜索）
    if (Array.isArray(jsonResponse.sticker_hints)) {
      for (const hint of jsonResponse.sticker_hints) {
        elements.push({
          id: 'text_' + generateId(),
          type: 'text',
          author: 'character',
          content: `[${hint}]`,
          x: 200 + Math.random() * 150,
          y: 300 + Math.random() * 200,
          rotation: Math.round((Math.random() - 0.5) * 20),
          fontSize: 11,
          color: '#999',
          fontStyle: 'italic',
          fontWeight: 'normal',
          width: 80,
          zIndex: elements.length + 10,
        })
      }
    }

    submitMsg.value = `${props.book.characterName} 回应了手帐!`
    showSubmitDialog.value = false
    setTimeout(() => { submitMsg.value = '' }, 3000)
  } catch (e) {
    submitMsg.value = '提交失败: ' + (e.message || '未知错误')
    showSubmitDialog.value = false
  } finally {
    submitting.value = false
  }
}

// ===== 画布点击 =====

function onCanvasClick(e) {
  // 只有直接点击画布空白区域时才处理
  if (e.target.classList.contains('a4-canvas')) {
    // 退出所有编辑状态
    for (const el of getElements()) {
      if (el._editing) {
        el._editing = false
      }
    }
    selectedTextId.value = null
    selectedStickerId.value = null
    addTextBlock(
      Math.round(e.clientX - e.target.getBoundingClientRect().left),
      Math.round(e.clientY - e.target.getBoundingClientRect().top)
    )
  }
}

// ===== 元素选择 =====

function selectElement(el) {
  if (el.type === 'sticker') {
    selectedStickerId.value = el.id
    selectedTextId.value = null
  } else {
    selectedTextId.value = el.id
    selectedStickerId.value = null
  }
}

function deselectAll() {
  selectedStickerId.value = null
  selectedTextId.value = null
}

// ===== 打印 =====

function togglePrintPage(idx) {
  const i = printSelectedPages.value.indexOf(idx)
  if (i >= 0) {
    printSelectedPages.value.splice(i, 1)
  } else {
    printSelectedPages.value.push(idx)
  }
}

function openPrintDialog() {
  printSelectedPages.value = pages.value.map((_, i) => i)
  showPrintDialog.value = true
  printMsg.value = ''
}

function closePrintDialog() {
  showPrintDialog.value = false
}

function selectAllPages() {
  printSelectedPages.value = pages.value.map((_, i) => i)
}

function deselectAllPages() {
  printSelectedPages.value = []
}

function renderPageToHtml(page, bgImg, bgOp) {
  const bgStyle = bgImg
    ? `<div style="position:absolute;inset:0;background-image:url(${bgImg});background-size:cover;background-position:center;background-repeat:no-repeat;opacity:${bgOp};z-index:0;pointer-events:none;"></div>`
    : ''

  const elements = (page.elements || []).map(el => {
    if (el.type === 'text') {
      const html = el.htmlContent || (el.content || '').replace(/\n/g, '<br>')
      return `<div style="position:absolute;left:${el.x}px;top:${el.y}px;transform:rotate(${el.rotation}deg);z-index:${el.zIndex};width:${el.width || 160}px;">${html}</div>`
    }
    if (el.type === 'sticker') {
      return `<div style="position:absolute;left:${el.x}px;top:${el.y}px;transform:rotate(${el.rotation}deg);z-index:${el.zIndex};width:${el.width}px;height:${el.height}px;"><img src="${el.src}" style="width:100%;height:100%;object-fit:contain;" /></div>`
    }
    return ''
  }).filter(Boolean).join('')

  return `
    <div style="position:relative;width:500px;min-height:707px;background:#fff;page-break-after:always;overflow:hidden;">
      ${bgStyle}
      ${elements}
    </div>
  `
}

async function handlePrint() {
  if (printSelectedPages.value.length === 0) {
    printMsg.value = '请先选择要打印的页面'
    return
  }

  try {
    const selectedPages = printSelectedPages.value
      .sort((a, b) => a - b)
      .filter(i => pages.value[i])
      .map(i => pages.value[i])

    const pagesHtml = selectedPages.map(p => renderPageToHtml(p, bgImageData.value, bgOpacity.value)).join('')
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${props.book.title || '手帐'} - 打印</title>
        <style>
          @media print {
            body { margin: 0; padding: 0; }
            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { margin: 0; padding: 0; background: #fff; }
        </style>
      </head>
      <body>${pagesHtml}</body>
      </html>
    `

    const result = await printHtmlNative(html, `${props.book.title || '手帐'} - 打印`)
    if (result?.success) {
      printMsg.value = '已发送到打印机'
    } else {
      printMsg.value = '打印失败: ' + (result?.error || '未知错误')
    }
  } catch (e) {
    printMsg.value = '打印失败: ' + (e.message || '未知错误')
  }
}

// ===== 背景 =====

async function handleImportBackground(event) {
  const file = event.target.files?.[0]
  if (!file) return
  bgImageData.value = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  showMenu.value = false
}

function removeBackground() {
  bgImageData.value = null
  bgOpacity.value = 1
  showMenu.value = false
}
</script>

<template>
  <div class="scrapbook-editor">
    <!-- 顶栏 -->
    <div class="editor-header">
      <button class="menu-btn" @click="showMenu = !showMenu">☰</button>
      <span class="header-title">{{ props.book.title || '手帐' }}</span>
      <span v-if="saveMsg" class="save-msg">{{ saveMsg }}</span>
      <span v-if="submitMsg" class="submit-msg">{{ submitMsg }}</span>
    </div>

    <!-- 汉堡菜单面板 -->
    <div v-if="showMenu" class="menu-overlay" @click.self="showMenu = false">
      <div class="menu-panel">
        <div class="menu-section">
          <button class="menu-item" @click="handleSave(); showMenu = false">💾 保存</button>
          <button class="menu-item" @click="addTextBlock(60, 80); showMenu = false">✏️ 添加文字块</button>
          <button class="menu-item" @click="showStickerPanel = true; showMenu = false">🏷️ 贴纸库</button>
          <button class="menu-item" @click="showImportPanel = true; showMenu = false">📁 导入贴纸</button>
        </div>
        <div class="menu-section">
          <button
            class="menu-item menu-item-accent"
            :disabled="submitting || !getPageTextContent()"
            @click="handleSubmitToCharacter(); showMenu = false"
          >
            {{ submitting ? '提交中...' : '📨 提交给角色' }}
          </button>
        </div>
        <div class="menu-section">
          <button class="menu-item" @click="openPrintDialog(); showMenu = false">🖨️ 打印</button>
          <button v-if="pages.length > 1" class="menu-item" @click="removePage(currentPage); showMenu = false">🗑️ 删除当前页</button>
          <button class="menu-item" @click="addNewPage(); showMenu = false">📄 新建页面</button>
        </div>
        <div class="menu-section">
          <p class="menu-label">页面背景</p>
          <label class="menu-item menu-item-file">
            🖼️ 导入背景
            <input type="file" accept="image/*" @change="handleImportBackground" hidden />
          </label>
          <div v-if="bgImageData" class="menu-opacity">
            <span class="opacity-label">透明度</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              :value="bgOpacity"
              @input="bgOpacity = parseFloat($event.target.value)"
              class="opacity-slider"
            />
            <span class="opacity-value">{{ Math.round(bgOpacity * 100) }}%</span>
          </div>
          <button v-if="bgImageData" class="menu-item" @click="removeBackground">❌ 移除背景</button>
          <span v-else class="menu-hint">点击「导入背景」为当前页面设置背景图</span>
        </div>
      </div>
    </div>

    <!-- 提交等待弹窗 -->
    <div v-if="showSubmitDialog" class="submit-overlay">
      <div class="submit-dialog">
        <div class="submit-spinner"></div>
        <p class="submit-title">正在等待 {{ props.book.characterName }} 回应...</p>
        <p class="submit-desc">角色正在阅读你的手帐并写下回应，请稍候</p>
      </div>
    </div>

    <!-- 页码切换 -->
    <div class="page-nav" v-if="pages.length > 1">
      <button
        v-for="(page, idx) in pages"
        :key="page.id"
        :class="['page-tab', { active: idx === currentPage }]"
        @click="currentPage = idx"
      >
        {{ idx + 1 }}
      </button>
    </div>

    <!-- A4 画布 -->
    <div class="editor-canvas-wrapper">
      <div
        class="a4-canvas"
        :key="currentPage"
        @click="onCanvasClick"
      >
        <!-- 背景层 -->
        <div
          v-if="bgImageData"
          class="a4-bg-layer"
          :style="{ backgroundImage: `url(${bgImageData})`, opacity: bgOpacity }"
        ></div>

        <!-- 所有元素 -->
        <template v-for="el in getElements()" :key="el.id">
          <!-- 文字块 -->
          <div
            v-if="el.type === 'text'"
            :class="['text-block', { selected: selectedTextId === el.id, editing: el._editing, 'char-block': el.author === 'character' }]"
            :style="{
              left: el.x + 'px',
              top: el.y + 'px',
              transform: `rotate(${el.rotation}deg)`,
              zIndex: el.zIndex,
              width: (el.width || 160) + 'px',
            }"
            @mousedown="startTextDrag($event, el)"
            @touchstart="startTextDrag($event, el)"
            @click.stop="selectElement(el)"
          >
            <!-- 编辑模式 -->
            <textarea
              v-if="el._editing"
              class="text-block-input"
              :value="el.content || el.htmlContent || ''"
              @input="onTextBlockInput(el.id, $event.target.value)"
              placeholder="写点什么..."
              @mousedown.stop
              @blur="el._editing = false"
            ></textarea>
            <!-- 显示模式（渲染HTML） -->
            <div
              v-else
              class="text-block-render"
              @dblclick.stop="toggleTextEdit(el)"
              v-html="el.htmlContent || el.content || '&nbsp;'"
            ></div>
            <!-- 控制手柄（选中时显示） -->
            <template v-if="selectedTextId === el.id && !el._editing">
              <div
                class="text-resize-handle"
                @mousedown.stop="startTextResize($event, el)"
                @touchstart.stop="startTextResize($event, el)"
              ></div>
              <div
                class="text-rotate-handle"
                @mousedown.stop="startTextRotate($event, el)"
                @touchstart.stop="startTextRotate($event, el)"
              >↻</div>
              <button
                class="text-block-remove"
                @mousedown.stop
                @click.stop="removeTextBlock(el.id)"
              >×</button>
            </template>
          </div>

          <!-- 贴纸 -->
          <ScrapbookStickerItem
            v-else-if="el.type === 'sticker'"
            :sticker="el"
            :selected="selectedStickerId === el.id"
            @select="selectElement(el)"
            @remove="removeElement(el.id)"
          />
        </template>
      </div>
    </div>

    <!-- 贴纸面板 -->
    <ScrapbookStickerPanel
      v-if="showStickerPanel"
      @add-sticker="addSticker"
      @close="showStickerPanel = false"
    />

    <!-- 导入面板 -->
    <ScrapbookTemplateImport
      v-if="showImportPanel"
      @close="showImportPanel = false"
      @templates-imported="onTemplatesImported"
    />

    <!-- 打印选择弹窗 -->
    <div v-if="showPrintDialog" class="print-overlay" @click.self="closePrintDialog">
      <div class="print-panel">
        <div class="print-header">
          <span>选择打印页面</span>
          <button class="print-close" @click="closePrintDialog">×</button>
        </div>
        <div class="print-actions">
          <button class="print-select-btn" @click="selectAllPages">全选</button>
          <button class="print-select-btn" @click="deselectAllPages">取消全选</button>
        </div>
        <div class="print-page-list">
          <label
            v-for="(page, idx) in pages"
            :key="page.id"
            :class="['print-page-item', { selected: printSelectedPages.includes(idx) }]"
          >
            <input
              type="checkbox"
              :checked="printSelectedPages.includes(idx)"
              @change="togglePrintPage(idx)"
            />
            <span>第 {{ idx + 1 }} 页</span>
          </label>
        </div>
        <div class="print-footer">
          <span v-if="printMsg" class="print-msg">{{ printMsg }}</span>
          <button
            class="print-btn"
            :disabled="printSelectedPages.length === 0"
            @click="handlePrint"
          >
            {{ `打印 (${printSelectedPages.length} 页)` }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrapbook-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ===== 顶栏 ===== */
.editor-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--reader-header-bg, rgba(255, 255, 255, 0.05));
  border-bottom: 1px solid var(--reader-border, rgba(255, 255, 255, 0.08));
  flex-shrink: 0;
}

.menu-btn {
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  color: var(--reader-text, #fff);
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  line-height: 1;
}

.header-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--reader-text, #fff);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.save-msg {
  font-size: 0.75rem;
  color: #4ade80;
}

.submit-msg {
  font-size: 0.75rem;
  color: #f5af19;
}

/* ===== 汉堡菜单 ===== */
.menu-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 10002;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
}

.menu-panel {
  background: var(--reader-bg, #0a0a1a);
  border-bottom-left-radius: 16px;
  width: 280px;
  max-height: 80vh;
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  border-top: none;
  border-right: none;
  overflow-y: auto;
  padding: 12px 0;
}

.menu-section {
  padding: 8px 16px;
  border-bottom: 1px solid var(--reader-border, rgba(255, 255, 255, 0.06));
}

.menu-section:last-child {
  border-bottom: none;
}

.menu-item {
  display: block;
  width: 100%;
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  color: var(--reader-text, #fff);
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.85rem;
  cursor: pointer;
  text-align: left;
  margin-bottom: 6px;
  transition: background 0.15s;
}

.menu-item:hover {
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.12));
}

.menu-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.menu-item-accent {
  background: linear-gradient(135deg, #f5af19, #f12711);
  border: none;
  color: #fff;
  font-weight: 600;
}

.menu-item-file {
  position: relative;
  cursor: pointer;
}

.menu-item-file input[type="file"] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.menu-label {
  font-size: 0.72rem;
  color: var(--reader-secondary, #8b9dc3);
  font-weight: 600;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.menu-opacity {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 0.8rem;
}

.opacity-label {
  color: var(--reader-secondary, #8b9dc3);
  white-space: nowrap;
}

.opacity-slider {
  flex: 1;
  accent-color: var(--reader-accent-start, #667eea);
}

.opacity-value {
  color: var(--reader-text, #fff);
  font-size: 0.75rem;
  min-width: 36px;
  text-align: right;
}

.menu-hint {
  display: block;
  font-size: 0.7rem;
  color: var(--reader-secondary, #8b9dc3);
  opacity: 0.6;
  margin-top: 4px;
}

/* ===== 提交等待弹窗 ===== */
.submit-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10003;
  display: flex;
  align-items: center;
  justify-content: center;
}

.submit-dialog {
  background: var(--reader-bg, #0a0a1a);
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  border-radius: 16px;
  padding: 32px 24px;
  width: 90%;
  max-width: 340px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.submit-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  border-top-color: var(--reader-accent-start, #667eea);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.submit-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--reader-text, #fff);
  text-align: center;
  margin: 0;
}

.submit-desc {
  font-size: 0.8rem;
  color: var(--reader-secondary, #8b9dc3);
  text-align: center;
  margin: 0;
}

/* ===== 打印弹窗 ===== */
.print-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10002;
  display: flex;
  align-items: center;
  justify-content: center;
}

.print-panel {
  background: var(--reader-bg, #0a0a1a);
  border-radius: 16px;
  width: 90%;
  max-width: 380px;
  max-height: 70vh;
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.print-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--reader-border, rgba(255, 255, 255, 0.08));
  font-weight: 600;
}

.print-close {
  background: none;
  border: none;
  color: var(--reader-text, #fff);
  font-size: 1.4rem;
  cursor: pointer;
  padding: 0 4px;
}

.print-actions {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
}

.print-select-btn {
  flex: 1;
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  color: var(--reader-text, #fff);
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 0.75rem;
  cursor: pointer;
}

.print-page-list {
  padding: 8px 16px;
  overflow-y: auto;
  max-height: 300px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.print-page-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--reader-secondary, #8b9dc3);
  border: 1px solid transparent;
  transition: border-color 0.15s, background 0.15s;
}

.print-page-item.selected {
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.06));
  border-color: var(--reader-accent-start, #667eea);
  color: var(--reader-text, #fff);
}

.print-page-item input[type="checkbox"] {
  accent-color: #667eea;
}

.print-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--reader-border, rgba(255, 255, 255, 0.08));
}

.print-msg {
  font-size: 0.75rem;
  color: #4ade80;
  flex: 1;
}

.print-btn {
  background: linear-gradient(135deg, #f5af19, #f12711);
  border: none;
  color: #fff;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.page-nav {
  display: flex;
  gap: 4px;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
  overflow-x: auto;
}

.page-tab {
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  color: var(--reader-secondary, #8b9dc3);
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 0.75rem;
  cursor: pointer;
}

.page-tab.active {
  background: var(--reader-accent-start, #667eea);
  color: #fff;
  border-color: var(--reader-accent-start, #667eea);
}

.editor-canvas-wrapper {
  flex: 1;
  overflow: auto;
  padding: 16px;
  display: flex;
  justify-content: center;
}

.a4-canvas {
  aspect-ratio: 210 / 297;
  width: min(100%, 500px);
  background: #ffffff;
  border-radius: 4px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  position: relative;
  min-height: 400px;
  overflow: hidden;
  cursor: text;
}

.a4-bg-layer {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: 0;
  pointer-events: none;
}

/* 文字块 */
.text-block {
  position: absolute;
  min-width: 40px;
  max-width: 100%;
  transition: box-shadow 0.15s;
  user-select: none;
  touch-action: none;
}

.text-block.selected {
  box-shadow: 0 0 0 2px #667eea;
  border-radius: 4px;
}

.text-block.editing {
  box-shadow: 0 0 0 2px #4ade80;
  border-radius: 4px;
  user-select: text;
}

.char-block {
  opacity: 0.85;
}

.text-block-render {
  padding: 4px 6px;
  font-size: 13px;
  line-height: 1.5;
  color: #333;
  cursor: move;
  min-height: 1.2em;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.text-block-render:empty::before {
  content: '双击编辑';
  color: #bbb;
  font-style: italic;
}

.text-block-render b,
.text-block-render strong {
  font-weight: bold;
}

.text-block-render i,
.text-block-render em {
  font-style: italic;
}

.text-block-render u {
  text-decoration: underline;
}

.text-block-input {
  background: transparent;
  border: none;
  outline: none;
  resize: both;
  overflow: auto;
  min-width: 60px;
  min-height: 1.5em;
  width: 100%;
  font-family: inherit;
  line-height: 1.6;
  cursor: text;
  padding: 4px 6px;
}

.text-resize-handle {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 12px;
  height: 12px;
  background: #667eea;
  border-radius: 50%;
  cursor: nwse-resize;
  border: 2px solid #fff;
}

.text-rotate-handle {
  position: absolute;
  top: -20px;
  right: -6px;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #667eea;
  cursor: grab;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  user-select: none;
}

.text-block-remove {
  position: absolute;
  top: -10px;
  left: -10px;
  width: 20px;
  height: 20px;
  background: #ff4d4d;
  border: 2px solid #fff;
  border-radius: 50%;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0;
}

.platform-android.android-portrait .page-tab,
.platform-android.android-portrait .menu-btn,
.platform-android.android-portrait .text-block-remove,
.platform-android.android-portrait .text-rotate-handle,
.platform-android.android-portrait .text-resize-handle,
.platform-android.android-portrait .print-select-btn,
.platform-android.android-portrait .print-close
 {
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  flex: none !important;
  font-size: 1.1rem !important;
  padding: 6px 10px !important;
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 8px !important;
  white-space: nowrap !important;
}
</style>
