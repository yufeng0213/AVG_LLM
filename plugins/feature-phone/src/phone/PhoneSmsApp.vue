<script setup>
/**
 * PhoneSmsApp.vue - 短信应用
 * 私聊（联系人列表）+ 群聊（世界书默认群 + 自定义群）+ 对话线程 + LLM 回复。
 * 支持自定义气泡 CSS 样式导入。
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import {
  getGroupedContacts,
  getWorldBookById,
  loadSmsThreads,
  saveSmsThreads,
  getSmsThread,
  addSmsMessage,
  formatSmsTime,
  loadSmsSettings,
  saveSmsSettings,
  loadGroupChats,
  saveGroupChats,
  loadGroupThreads,
  saveGroupThreads,
  getGroupThread,
  addGroupChatMessage,
  ensureWorldBookGroups,
  createCustomGroup,
  addCalendarEvent,
  updateCalendarEventStatus,
  clearWorldBookCache,
} from './composables/usePhoneData.js'
import { generatePhoneSmsReply, generateGroupChatReply } from '../../../../src/llm/index.js'
import { kvStorage } from '../../../../src/storage/index.js'
import { generateIcsContent } from './utils/generateIcsContent.js'
import { openCalendarImport } from './services/calendarBridge.js'
import { loadWorldBooks, persistWorldBooks } from '../../../../src/worldbook/worldBookStore.js'
import AvatarCropModal from '../../../feature-dormitory/src/components/AvatarCropModal.vue'
import { useAvatar as useDormAvatar } from '../../../feature-dormitory/src/composables/useAvatar.js'

const emit = defineEmits(['back'])

// 寝室头像：获取当前激活的头像作为用户头像
const dormAvatarRef = ref(null)
try {
  const avatarApi = useDormAvatar()
  dormAvatarRef.value = avatarApi.activeAvatarDataUrl?.value || null
} catch {
  dormAvatarRef.value = null
}

// ===== 状态 =====
const contacts = ref([])
const smsThreads = ref({})
const selectedContact = ref(null)
const smsDraft = ref('')
const smsLoading = ref(false)
const messagesRef = ref(null)

// 群聊状态
const activeTab = ref('private')
const groupChats = ref([])
const groupThreads = ref({})
const selectedGroup = ref(null)
const groupDraft = ref('')
const groupLoading = ref(false)

// 群聊管理
const showGroupInfo = ref(false)
const showManageMembers = ref(false)
const manageExpandedWb = ref(null)

// @ 提及
const showMentionDropdown = ref(false)
const mentionFilter = ref('')
const mentionCursorPos = ref(-1)

// 创建群聊状态
const showCreateGroup = ref(false)
const createGroupName = ref('')
const createGroupMembers = ref([])
const createGroupExpandedWb = ref(null)

// 气泡样式设置
const showBubbleSettings = ref(false)
const bubbleCss = ref('')
const bubbleCssFile = ref(null)

// 聊天背景设置
const chatBgUrl = ref('')
const chatBgUrlInput = ref('')
const chatBgFileInputRef = ref(null)

// 日历事件弹窗
const showCalendarEventModal = ref(false)
const pendingCalendarEvent = ref(null)
const calendarEventImporting = ref(false)

// 短信通用设置
const smsContextMessages = ref(8)

// 短信头像裁剪
const showAvatarCrop = ref(false)
const cropModalRef = ref(null)
const pendingAvatarFile = ref(null)
const pendingAvatarChar = ref(null) // { charId, worldBookId }
let longPressTimer = null

// 默认气泡 CSS 模板
const DEFAULT_BUBBLE_CSS = `/* ===== 短信气泡自定义样式 ===== */
/* 可用选择器：
 * .sms-bubble.user      - 用户消息气泡
 * .sms-bubble.assistant - 对方消息气泡
 * .sms-bubble           - 通用气泡
 * .sms-time             - 时间分隔线
 * .sms-messages         - 消息容器
 */

/* 可爱风格气泡 */
.sms-messages {
  background: linear-gradient(180deg, #fff5f9 0%, #fef0ff 50%, #f0f4ff 100%);
  padding: 12px 6px;
}

.sms-bubble.user {
  position: relative;
  background: linear-gradient(135deg, #ffecd2, #fcb69f);
  border-radius: 20px 20px 6px 20px;
  color: #5a3e2b;
  font-size: 0.88rem;
  line-height: 1.55;
  padding: 10px 16px;
  margin: 6px 12px 6px 8px;
  box-shadow: 0 3px 10px rgba(252, 182, 159, 0.35),
              inset 0 -2px 4px rgba(0, 0, 0, 0.04);
  border: 2px solid rgba(255, 255, 255, 0.6);
}

/* 用户气泡右侧加小星星装饰 */
.sms-bubble.user::after {
  content: '✦';
  position: absolute;
  right: -18px;
  top: -8px;
  font-size: 0.75rem;
  color: #fcb69f;
  text-shadow: 0 0 6px rgba(252, 182, 159, 0.6);
}

.sms-bubble.assistant {
  position: relative;
  background: linear-gradient(135deg, #e0f7fa, #b2ebf2);
  border-radius: 20px 20px 20px 6px;
  color: #1b4a5e;
  font-size: 0.88rem;
  line-height: 1.55;
  padding: 10px 16px;
  margin: 6px 8px 6px 12px;
  box-shadow: 0 3px 10px rgba(178, 235, 242, 0.4),
              inset 0 -2px 4px rgba(0, 0, 0, 0.04);
  border: 2px solid rgba(255, 255, 255, 0.7);
}

/* 对方气泡左侧加小花朵装饰 */
.sms-bubble.assistant::before {
  content: '❀';
  position: absolute;
  left: -18px;
  top: -8px;
  font-size: 0.75rem;
  color: #80deea;
  text-shadow: 0 0 6px rgba(128, 222, 234, 0.6);
}

/* 时间分隔线 */
.sms-time {
  text-align: center;
  font-size: 0.7rem;
  color: #c0a0b0;
  background: rgba(255, 255, 255, 0.7);
  display: inline-block;
  margin: 12px auto;
  padding: 4px 16px;
  border-radius: 12px;
  border: 1px solid rgba(224, 180, 200, 0.3);
  letter-spacing: 0.5px;
}`

const SMS_BUBBLE_CSS_KEY = 'phone_sms_bubble_css'

onMounted(async () => {
  const [groupedContacts, threads, savedCss, smsSettings, groups, groupThreadsData] = await Promise.all([
    getGroupedContacts(),
    loadSmsThreads(),
    kvStorage.get(SMS_BUBBLE_CSS_KEY),
    loadSmsSettings(),
    loadGroupChats(),
    loadGroupThreads(),
  ])
  contacts.value = groupedContacts
  smsThreads.value = threads
  if (savedCss) {
    bubbleCss.value = savedCss
  } else {
    bubbleCss.value = DEFAULT_BUBBLE_CSS
  }
  smsContextMessages.value = smsSettings.contextMessages ?? 8

  // 自动创建世界书群聊
  const allGroups = await ensureWorldBookGroups(groups)
  groupChats.value = allGroups
  groupThreads.value = groupThreadsData
})

// 注入自定义气泡 CSS
let bubbleStyleEl = null

function applyBubbleCss(css) {
  if (bubbleStyleEl && bubbleStyleEl.parentNode) {
    bubbleStyleEl.parentNode.removeChild(bubbleStyleEl)
  }
  if (!css || !css.trim()) return
  const el = document.createElement('style')
  el.className = 'sms-bubble-custom-css'
  el.textContent = css
  const smsApp = document.querySelector('.sms-app')
  if (smsApp) {
    smsApp.appendChild(el)
    bubbleStyleEl = el
  }
}

function handleSaveSettings() {
  kvStorage.set(SMS_BUBBLE_CSS_KEY, bubbleCss.value)
  applyBubbleCss(bubbleCss.value)
  saveSmsSettings({ contextMessages: smsContextMessages.value })
  showBubbleSettings.value = false
}

function handleResetBubbleCss() {
  bubbleCss.value = DEFAULT_BUBBLE_CSS
  kvStorage.set(SMS_BUBBLE_CSS_KEY, DEFAULT_BUBBLE_CSS)
  applyBubbleCss(DEFAULT_BUBBLE_CSS)
}

function handleImportCssFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  bubbleCssFile.value = file.name
  const reader = new FileReader()
  reader.onload = (ev) => {
    bubbleCss.value = ev.target?.result || ''
  }
  reader.readAsText(file)
}

// ===== 聊天背景 =====

function handleBgFileSelect(e) {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = '' // reset
  const reader = new FileReader()
  reader.onload = (ev) => {
    chatBgUrl.value = ev.target?.result || ''
  }
  reader.readAsDataURL(file)
}

async function handleBgUrlImport() {
  const url = chatBgUrlInput.value.trim()
  if (!url) return
  // 验证是否为图片 URL
  chatBgUrl.value = url
  chatBgUrlInput.value = ''
}

function handleBgClear() {
  chatBgUrl.value = ''
}

async function handleBgSave() {
  if (!selectedContact.value) return
  const charId = selectedContact.value.id
  const worldBookId = selectedContact.value.worldBookId

  try {
    const books = await loadWorldBooks()
    const book = books.find(b => b.id === worldBookId)
    if (!book) return

    const char = book.characters?.find(c => c.id === charId)
    if (!char) return

    char.smsBg = chatBgUrl.value || null
    char.updatedAt = new Date().toISOString()

    await persistWorldBooks(books)
    clearWorldBookCache()

    // 更新内存
    selectedContact.value.smsBg = chatBgUrl.value || null
  } catch (e) {
    console.warn('[PhoneSmsApp] 保存聊天背景失败:', e)
  }
}

// ===== 私聊 =====
async function selectContact(contact) {
  selectedContact.value = contact
  smsDraft.value = ''
  chatBgUrl.value = contact?.smsBg || ''
  const savedCss = await kvStorage.get(SMS_BUBBLE_CSS_KEY)
  if (savedCss && savedCss.trim()) {
    applyBubbleCss(savedCss)
  }
  nextTick(() => scrollToBottom())
}

function goBack() {
  if (selectedContact.value || selectedGroup.value) {
    selectedContact.value = null
    selectedGroup.value = null
    smsDraft.value = ''
    groupDraft.value = ''
  } else {
    emit('back')
  }
}

function scrollToBottom() {
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

async function handleSendSms() {
  const text = smsDraft.value.trim()
  if (!text || !selectedContact.value || smsLoading.value) return

  const contact = selectedContact.value
  smsDraft.value = ''
  addSmsMessage(smsThreads.value, contact.id, 'user', text)
  await saveSmsThreads(smsThreads.value)
  nextTick(() => scrollToBottom())

  smsLoading.value = true
  try {
    const book = await getWorldBookById(contact.worldBookId)
    const contactForLlm = {
      id: contact.id,
      name: contact.name,
      identity: contact.identity || contact.nickname || '',
    }

    const thread = getSmsThread(smsThreads.value, contact.id)
    const history = thread
      .slice(-smsContextMessages.value)
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        text: m.text,
      }))

    const result = await generatePhoneSmsReply({
      worldBook: book || { id: contact.worldBookId, title: contact.worldBookTitle, characters: [] },
      contact: contactForLlm,
      userMessage: text,
      history,
      options: { historyLimit: smsContextMessages.value, maxTokens: 300 },
    })

    if (result.success && result.replies && result.replies.length > 0) {
      for (const reply of result.replies) {
        if (reply && reply.trim()) {
          addSmsMessage(smsThreads.value, contact.id, 'assistant', reply.trim())
        }
      }
      await saveSmsThreads(smsThreads.value)
      nextTick(() => scrollToBottom())

      // 检测到日历事件，弹出预览
      if (result.calendarEvent) {
        pendingCalendarEvent.value = {
          ...result.calendarEvent,
          contactName: contact.name,
        }
        showCalendarEventModal.value = true
      }
    }
  } catch (e) {
    console.warn('[PhoneSmsApp] 发送短信失败:', e)
  } finally {
    smsLoading.value = false
  }
}

// ===== 日历事件操作 =====

async function handleImportCalendarEvent() {
  if (!pendingCalendarEvent.value) return
  calendarEventImporting.value = true
  try {
    // 1. 存入 kvStorage
    const saved = await addCalendarEvent(pendingCalendarEvent.value)

    // 2. 生成 ICS 并调起日历
    const icsContent = generateIcsContent(pendingCalendarEvent.value)
    const fileName = `event_${saved.id}.ics`
    await openCalendarImport(icsContent, fileName)

    // 3. 更新状态
    await updateCalendarEventStatus(saved.id, 'imported')
  } catch (e) {
    console.error('[PhoneSmsApp] 导入日历失败:', e)
  } finally {
    calendarEventImporting.value = false
    showCalendarEventModal.value = false
    pendingCalendarEvent.value = null
  }
}

async function handleDismissCalendarEvent() {
  if (!pendingCalendarEvent.value) return
  // 存入 kvStorage（状态 dismissed），用户可以在日历 app 中查看
  await addCalendarEvent({ ...pendingCalendarEvent.value, status: 'dismissed' })
  showCalendarEventModal.value = false
  pendingCalendarEvent.value = null
}

// ===== 短信 =====

function getLastMessage(contactId) {
  const thread = smsThreads.value[contactId]
  if (!thread || thread.length === 0) return null
  return thread[thread.length - 1]
}

const threadMessages = computed(() => {
  if (!selectedContact.value) return []
  const thread = getSmsThread(smsThreads.value, selectedContact.value.id)
  if (!thread || thread.length === 0) return []

  const result = []
  let lastDate = ''
  for (const msg of thread) {
    const msgDate = formatSmsTime(msg.timestamp)
    if (msgDate !== lastDate) {
      result.push({ type: 'time', text: msgDate, id: 'time-' + msg.timestamp })
      lastDate = msgDate
    }
    result.push({ ...msg, type: 'message', id: msg.timestamp })
  }
  return result
})

// ===== 群聊 =====
function selectGroup(group) {
  selectedGroup.value = group
  groupDraft.value = ''
  nextTick(() => scrollToBottom())
}

const groupThreadMessages = computed(() => {
  if (!selectedGroup.value) return []
  const thread = getGroupThread(groupThreads.value, selectedGroup.value.id)
  if (!thread || thread.length === 0) return []

  const result = []
  let lastDate = ''
  for (const msg of thread) {
    const msgDate = formatSmsTime(msg.timestamp)
    if (msgDate !== lastDate) {
      result.push({ type: 'time', text: msgDate, id: 'time-' + msg.timestamp })
      lastDate = msgDate
    }
    result.push({ ...msg, type: 'message', id: msg.timestamp })
  }
  return result
})

function getLastGroupMessage(groupId) {
  const thread = groupThreads.value[groupId]
  if (!thread || thread.length === 0) return null
  return thread[thread.length - 1]
}

function getGroupMemberCount(group) {
  return Array.isArray(group.members) ? group.members.length : 0
}

async function handleSendGroupMessage() {
  const text = groupDraft.value.trim()
  if (!text || !selectedGroup.value || groupLoading.value) return

  const group = selectedGroup.value
  groupDraft.value = ''

  // 解析 @ 提及
  const mentionRegex = /@([^\s@]+)/g
  const mentions = []
  let m
  while ((m = mentionRegex.exec(text)) !== null) {
    const name = m[1].trim()
    if (name && !mentions.includes(name)) mentions.push(name)
  }

  addGroupChatMessage(groupThreads.value, group.id, 'user', text, '', '', mentions)
  await saveGroupThreads(groupThreads.value)
  nextTick(() => scrollToBottom())

  groupLoading.value = true
  try {
    const book = group.type === 'worldbook' ? await getWorldBookById(group.worldBookId) : null

    // 自定义群聊：给每个成员附加自己世界书的背景
    let members = group.members || []
    if (group.type === 'custom') {
      const wbCache = {}
      members = members.map(m => {
        if (!m.worldBookId) return m
        if (!wbCache[m.worldBookId]) {
          wbCache[m.worldBookId] = getWorldBookById(m.worldBookId)
        }
        return m // 后面通过 LLM 参数传递 worldBookSummary
      })
      // 加载所有成员的世界书摘要
      const wbSummaries = {}
      for (const wbId of Object.keys(wbCache)) {
        const wb = await wbCache[wbId]
        if (wb) {
          wbSummaries[wbId] = String(wb.summary || wb.entries?.overview || '').trim()
        }
      }
      members = members.map(m => ({
        ...m,
        worldBookSummary: m.worldBookId ? (wbSummaries[m.worldBookId] || '') : '',
      }))
    }

    const history = getGroupThread(groupThreads.value, group.id)
      .slice(-smsContextMessages.value)
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        text: msg.text,
        senderName: msg.senderName || (msg.role === 'user' ? '玩家' : ''),
        mentionedNames: msg.mentionedNames || [],
      }))

    const result = await generateGroupChatReply({
      worldBook: book || null,
      members,
      groupType: group.type,
      userMessage: text,
      history,
      contextMessages: smsContextMessages.value,
      options: { maxTokens: 800 },
    })

    if (result.success && result.replies && result.replies.length > 0) {
      for (const reply of result.replies) {
        if (reply && reply.text && reply.text.trim()) {
          addGroupChatMessage(
            groupThreads.value,
            group.id,
            'assistant',
            reply.text.trim(),
            reply.authorName || '角色',
            reply.authorId || '',
          )
        }
      }
      await saveGroupThreads(groupThreads.value)
      nextTick(() => scrollToBottom())
    }
  } catch (e) {
    console.warn('[PhoneSmsApp] 发送群聊消息失败:', e)
  } finally {
    groupLoading.value = false
  }
}

// ===== 创建群聊 =====
function toggleCreateGroupMember(member) {
  const idx = createGroupMembers.value.findIndex(m => m.contactId === member.contactId)
  if (idx >= 0) {
    createGroupMembers.value.splice(idx, 1)
  } else {
    createGroupMembers.value.push(member)
  }
}

function handleCreateGroup() {
  if (!createGroupName.value.trim() || createGroupMembers.value.length < 2) return
  const newGroup = createCustomGroup({
    name: createGroupName.value.trim(),
    members: [...createGroupMembers.value],
  })
  groupChats.value = [newGroup, ...groupChats.value]
  saveGroupChats(groupChats.value)
  // 重置
  createGroupName.value = ''
  createGroupMembers.value = []
  showCreateGroup.value = false
  // 自动打开新群
  selectGroup(newGroup)
  activeTab.value = 'group'
}

function getAllMembersForCreate() {
  // 从所有世界书收集所有角色
  const all = []
  for (const wbGroup of contacts.value) {
    for (const char of wbGroup.characters) {
      all.push({
        contactId: char.id,
        contactName: char.name,
        worldBookId: char.worldBookId || wbGroup.worldBookId,
        worldBookTitle: char.worldBookTitle || wbGroup.worldBookTitle,
        identity: char.identity || '',
      })
    }
  }
  return all
}

function isMemberSelected(contactId) {
  return createGroupMembers.value.some(m => m.contactId === contactId)
}

// 渲染带 @ 高亮的文本
function renderMentionText(text) {
  if (!text) return ''
  const parts = []
  const regex = /(@[^\s@]+)/g
  const segments = text.split(regex)
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (regex.test(seg)) {
      parts.push({ type: 'mention', text: seg })
    } else if (seg) {
      parts.push({ type: 'text', text: seg })
    }
    // reset regex
    regex.lastIndex = 0
  }
  return parts
}

// ===== 群聊管理 =====

// --- 删除群聊 ---
function deleteGroup(group) {
  if (group.type === 'worldbook') {
    // 世界书默认群聊不能删除，但可以移除（隐藏）
    return
  }
  groupChats.value = groupChats.value.filter(g => g.id !== group.id)
  saveGroupChats(groupChats.value)
  delete groupThreads.value[group.id]
  saveGroupThreads(groupThreads.value)
  if (selectedGroup.value?.id === group.id) {
    selectedGroup.value = null
  }
  showGroupInfo.value = false
}

// --- 查看/管理群成员 ---
function openGroupInfo() {
  showGroupInfo.value = true
  showManageMembers.value = false
  manageExpandedWb.value = null
}

function toggleManageMembers() {
  showManageMembers.value = !showManageMembers.value
  manageExpandedWb.value = null
}

function isMemberInGroup(contactId) {
  return (selectedGroup.value?.members || []).some(m => m.contactId === contactId)
}

function toggleGroupMember(member) {
  if (!selectedGroup.value) return
  const members = selectedGroup.value.members || []
  const idx = members.findIndex(m => m.contactId === member.contactId)
  if (idx >= 0) {
    members.splice(idx, 1)
  } else {
    members.push(member)
  }
  // 更新群聊
  const gIdx = groupChats.value.findIndex(g => g.id === selectedGroup.value.id)
  if (gIdx >= 0) {
    groupChats.value[gIdx].members = [...members]
  }
  saveGroupChats(groupChats.value)
}

// --- @ 提及功能 ---

const mentionableMembers = computed(() => {
  return (selectedGroup.value?.members || []).map(m => ({
    contactId: m.contactId,
    contactName: m.contactName || m.name,
  }))
})

function getFilteredMentions() {
  if (!mentionFilter.value.trim()) return mentionableMembers.value
  return mentionableMembers.value.filter(m =>
    m.contactName.includes(mentionFilter.value.trim()),
  )
}

function onGroupDraftInput(e) {
  const text = groupDraft.value
  const cursor = e.target.selectionStart
  if (cursor === null || cursor === undefined) return

  // 查找光标位置之前最近的 @
  const beforeCursor = text.slice(0, cursor)
  const lastAt = beforeCursor.lastIndexOf('@')
  if (lastAt >= 0) {
    const afterAt = beforeCursor.slice(lastAt + 1)
    // 如果 @ 后面没有空格，显示提及下拉
    if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
      mentionFilter.value = afterAt
      mentionCursorPos.value = lastAt
      showMentionDropdown.value = true
      return
    }
  }
  showMentionDropdown.value = false
}

function insertMention(member) {
  const text = groupDraft.value
  const atPos = mentionCursorPos.value
  const mentionText = `@${member.contactName} `

  if (atPos >= 0) {
    // 替换 @ 之前的内容
    const before = text.slice(0, atPos)
    const after = text.slice(atPos)
    // 删除旧的 @ + filter 内容
    const oldLen = 1 + mentionFilter.value.length
    groupDraft.value = before.slice(0, -oldLen === 0 ? 0 : before.length - oldLen + before.length) + mentionText + after.slice(oldLen)
    // 简单做法：直接替换
    groupDraft.value = text.slice(0, atPos) + mentionText + text.slice(atPos + mentionFilter.value.length + 1)
  } else {
    groupDraft.value += mentionText
  }

  showMentionDropdown.value = false
  // 聚焦输入框
  nextTick(() => {
    const input = document.querySelector('.sms-input')
    if (input) {
      input.focus()
    }
  })
}

function handleGroupKeyDown(e) {
  // Enter 发送
  if (e.key === 'Enter' && !e.shiftKey) {
    // 如果提及下拉显示中，选择第一个
    if (showMentionDropdown.value) {
      e.preventDefault()
      const filtered = getFilteredMention()
      if (filtered.length > 0) {
        insertMention(filtered[0])
      }
      return
    }
    e.preventDefault()
    handleSendGroupMessage()
  }
  // Tab 补全提及
  if (e.key === 'Tab' && showMentionDropdown.value) {
    e.preventDefault()
    const filtered = getFilteredMention()
    if (filtered.length > 0) {
      insertMention(filtered[0])
    }
  }
}

// ===== 短信头像裁剪 =====

// 获取头像 URL（优先 smsAvatar，回退 portraits[0]）
function getCharAvatar(char) {
  return char?.smsAvatar || char?.portraits?.[0] || null
}

function getUserAvatar() {
  return dormAvatarRef.value || null
}

// 长按开始
function onAvatarPointerDown(e, char) {
  e.preventDefault()
  clearLongPressTimer()
  longPressTimer = setTimeout(() => {
    openAvatarCropForChar(char)
    clearLongPressTimer()
  }, 1000)
}

// 长按取消（手指移开 / 点击）
function onAvatarPointerUp() {
  clearLongPressTimer()
}

function onAvatarPointerLeave() {
  clearLongPressTimer()
}

function clearLongPressTimer() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

// 触发文件选择
function triggerAvatarFileInput() {
  const input = document.getElementById('sms-avatar-file-input')
  if (input) input.click()
}

function handleAvatarFileSelect(e) {
  const file = e.target.files?.[0]
  if (!file || !pendingAvatarChar.value) return
  pendingAvatarFile.value = file
  // 重置 input 以便重复选择同一文件
  e.target.value = ''
  // 打开裁剪弹窗
  showAvatarCrop.value = true
  // 等 DOM 渲染后加载图片
  nextTick(() => {
    if (cropModalRef.value) {
      cropModalRef.value.loadImage(file)
    }
  })
}

// 裁剪确认
async function handleAvatarCropConfirm(croppedDataUrl) {
  if (!pendingAvatarChar.value) return
  const { charId, worldBookId } = pendingAvatarChar.value
  showAvatarCrop.value = false

  try {
    // 加载完整世界书
    const books = await loadWorldBooks()
    const book = books.find(b => b.id === worldBookId)
    if (!book) return

    const char = book.characters?.find(c => c.id === charId)
    if (!char) return

    // 更新 smsAvatar
    char.smsAvatar = croppedDataUrl
    char.updatedAt = new Date().toISOString()

    // 持久化
    await persistWorldBooks(books)

    // 清除缓存，让下次进入 SMS 重新从 storage 加载
    clearWorldBookCache()

    // 更新内存中的联系人数据
    const contact = findContactById(charId)
    if (contact) {
      contact.smsAvatar = croppedDataUrl
    }
    // 如果当前正在和这个 char 聊天，也更新 selectedContact
    if (selectedContact.value?.id === charId) {
      selectedContact.value.smsAvatar = croppedDataUrl
    }
  } catch (e) {
    console.warn('[PhoneSmsApp] 保存短信头像失败:', e)
  }
}

function handleAvatarCropClose() {
  showAvatarCrop.value = false
  pendingAvatarChar.value = null
  pendingAvatarFile.value = null
}

function openAvatarCropForChar(char) {
  pendingAvatarChar.value = { charId: char.id, worldBookId: char.worldBookId }
  triggerAvatarFileInput()
}

function findContactById(charId) {
  for (const group of contacts.value) {
    for (const c of group.characters) {
      if (c.id === charId) return c
    }
  }
  return null
}

// 群聊中根据 senderId 获取角色头像
function getGroupSenderAvatar(senderId) {
  const contact = findContactById(senderId)
  if (!contact) return null
  return getCharAvatar(contact)
}
</script>

<template>
  <div class="sms-app">
    <!-- ====== 私聊列表 ====== -->
    <template v-if="!selectedContact && !selectedGroup">
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="emit('back')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="phone-app-title">短信</h2>
        <div class="phone-app-header-spacer" />
      </div>

      <!-- 标签切换 -->
      <div class="sms-tab-bar">
        <button class="sms-tab" :class="{ active: activeTab === 'private' }" @click="activeTab = 'private'">私聊</button>
        <button class="sms-tab" :class="{ active: activeTab === 'group' }" @click="activeTab = 'group'">群聊</button>
      </div>

      <!-- 私聊联系人 -->
      <div v-if="activeTab === 'private'" class="contact-list">
        <template v-for="group in contacts" :key="group.worldBookId">
          <div class="contact-section-header">《{{ group.worldBookTitle }}》</div>
          <div
            v-for="char in group.characters"
            :key="char.id"
            class="contact-item"
            @click="selectContact(char)"
          >
            <div class="contact-avatar" @pointerdown.stop="onAvatarPointerDown($event, char)" @pointerup.stop="onAvatarPointerUp" @pointerleave.stop="onAvatarPointerLeave">
              <img v-if="getCharAvatar(char)" :src="getCharAvatar(char)" :alt="char.name" />
              <span v-else class="contact-avatar-placeholder">&#x1F464;</span>
            </div>
            <div class="contact-info">
              <div class="contact-name">{{ char.name }}</div>
              <div class="contact-last-msg">
                {{ getLastMessage(char.id)?.text || '暂无消息，点击开始对话' }}
              </div>
            </div>
            <div class="contact-time" :class="{ unread: getLastMessage(char.id)?.role === 'assistant' }">
              {{ getLastMessage(char.id) ? formatSmsTime(getLastMessage(char.id).timestamp) : '' }}
            </div>
          </div>
        </template>
        <div v-if="contacts.length === 0" class="phone-loading">
          暂无联系人，请先在世界书中创建角色
        </div>
      </div>

      <!-- 群聊列表 -->
      <div v-else class="contact-list">
        <div class="group-list-header">
          <span>群聊列表</span>
          <button class="group-create-btn" @click="showCreateGroup = true">+ 新建</button>
        </div>
        <div
          v-for="g in groupChats"
          :key="g.id"
          class="contact-item group-item"
          @click="selectGroup(g)"
        >
          <div class="contact-avatar group-avatar">
            &#x1F465;
          </div>
          <div class="contact-info">
            <div class="contact-name">{{ g.name }}</div>
            <div class="contact-last-msg">
              {{ getLastGroupMessage(g.id)?.text || `暂无消息，${getGroupMemberCount(g)} 位成员` }}
            </div>
          </div>
          <div class="contact-time">
            {{ getLastGroupMessage(g.id) ? formatSmsTime(getLastGroupMessage(g.id).timestamp) : '' }}
          </div>
        </div>
        <div v-if="groupChats.length === 0" class="phone-loading">
          暂无群聊
        </div>
      </div>
    </template>

    <!-- ====== 创建群聊弹窗 ====== -->
    <div v-if="showCreateGroup" class="sms-bubble-settings-overlay">
      <div class="sms-bubble-settings-panel create-group-panel">
        <div class="settings-header">
          <h3>新建群聊</h3>
          <button class="settings-close-btn" @click="showCreateGroup = false">×</button>
        </div>
        <div class="settings-body">
          <label class="settings-label">群聊名称</label>
          <input
            v-model="createGroupName"
            class="group-name-input"
            type="text"
            placeholder="输入群名..."
            maxlength="20"
          />

          <label class="settings-label" style="margin-top: 14px;">
            选择成员（已选 {{ createGroupMembers.length }} 人）
          </label>

          <!-- 按世界书展开选择 -->
          <div v-for="wb in contacts" :key="wb.worldBookId" class="wb-member-section">
            <button
              class="wb-toggle-btn"
              :class="{ expanded: createGroupExpandedWb === wb.worldBookId }"
              @click="createGroupExpandedWb = createGroupExpandedWb === wb.worldBookId ? null : wb.worldBookId"
            >
              {{ createGroupExpandedWb === wb.worldBookId ? '▼' : '▶' }}
              《{{ wb.worldBookTitle }}》
            </button>
            <div v-if="createGroupExpandedWb === wb.worldBookId" class="wb-member-list">
              <div
                v-for="char in wb.characters"
                :key="char.id"
                class="wb-member-item"
                :class="{ selected: isMemberSelected(char.id) }"
                @click="toggleCreateGroupMember({ contactId: char.id, contactName: char.name, worldBookId: wb.worldBookId, worldBookTitle: wb.worldBookTitle, identity: char.identity })"
              >
                <span class="wb-member-check">{{ isMemberSelected(char.id) ? '&#x2714;' : '&#x25FB;' }}</span>
                <span>{{ char.name }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="settings-footer">
          <button
            class="apply-btn"
            :disabled="!createGroupName.trim() || createGroupMembers.length < 2"
            @click="handleCreateGroup"
          >
            创建群聊（至少2人）
          </button>
        </div>
      </div>
    </div>

    <!-- ====== 私聊线程 ====== -->
    <template v-else-if="selectedContact">
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="goBack">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          {{ selectedContact.name }}
        </button>
        <div class="phone-app-title" />
        <button type="button" class="sms-bubble-settings-btn" @click="showBubbleSettings = !showBubbleSettings">
          &#x1F3A8;
        </button>
      </div>

      <div class="sms-thread">
        <div ref="messagesRef" class="sms-messages">
          <!-- 聊天背景层 -->
          <div v-if="chatBgUrl" class="sms-chat-bg" :style="{ backgroundImage: 'url(' + chatBgUrl + ')' }"></div>
          <div v-if="!threadMessages || threadMessages.filter(m => m.type === 'message').length === 0" class="phone-loading">
            发送消息开始与 {{ selectedContact.name }} 对话
          </div>
          <template v-for="(item, idx) in threadMessages" :key="item.id || 'time-' + idx">
            <div v-if="item.type === 'time'" class="sms-time">{{ item.text }}</div>
            <div v-else class="sms-msg-row" :class="item.role">
              <div class="sms-msg-avatar">
                <img v-if="item.role === 'assistant' && getCharAvatar(selectedContact)" :src="getCharAvatar(selectedContact)" />
                <img v-else-if="item.role === 'user' && getUserAvatar()" :src="getUserAvatar()" />
                <span v-else class="sms-msg-avatar-default">&#x1F9D1;</span>
              </div>
              <div
                class="sms-bubble"
                :class="item.role"
              >
                {{ item.text }}
              </div>
            </div>
          </template>
          <div v-if="smsLoading" class="phone-loading">
            <div class="loading-spinner" />对方正在输入...
          </div>
        </div>
        <div class="sms-input-bar">
          <textarea
            v-model="smsDraft"
            class="sms-input"
            placeholder="输入消息..."
            rows="1"
            maxlength="500"
            :disabled="smsLoading"
            @keydown.enter.exact.prevent="handleSendSms"
          />
          <button
            type="button"
            class="sms-send-btn"
            :disabled="!smsDraft.trim() || smsLoading"
            @click="handleSendSms"
          >
            <span class="sms-send-icon">&#x27A4;</span>
          </button>
        </div>
      </div>
    </template>

    <!-- ====== 群聊线程 ====== -->
    <template v-else-if="selectedGroup">
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="goBack">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          {{ selectedGroup.name }}
        </button>
        <div class="phone-app-title" />
        <button type="button" class="group-info-btn" @click="openGroupInfo">
          &#x2139;&#xFE0F;
        </button>
      </div>

      <div class="sms-thread">
        <div ref="messagesRef" class="sms-messages">
          <div v-if="!groupThreadMessages || groupThreadMessages.filter(m => m.type === 'message').length === 0" class="phone-loading">
            发送消息开始群聊 · {{ getGroupMemberCount(selectedGroup) }} 位成员
          </div>
          <template v-for="(item, idx) in groupThreadMessages" :key="item.id || 'time-g-' + idx">
            <div v-if="item.type === 'time'" class="sms-time">{{ item.text }}</div>
            <!-- 群聊：带发送者头像和名字 -->
            <template v-else>
              <div class="sms-msg-row" :class="item.role">
                <div class="sms-msg-avatar">
                  <img v-if="item.role === 'assistant' && getGroupSenderAvatar(item.senderId)" :src="getGroupSenderAvatar(item.senderId)" />
                  <span v-else-if="item.role === 'assistant'" class="sms-msg-avatar-default" :title="item.senderName">{{ item.senderName?.charAt(0) }}</span>
                  <span v-else class="sms-msg-avatar-default">&#x1F9D1;</span>
                </div>
                <div class="sms-msg-content">
                  <span v-if="item.role === 'assistant'" class="group-sender-name">{{ item.senderName }}</span>
                  <div
                    class="sms-bubble"
                    :class="item.role"
                  >
                    <template v-for="part in renderMentionText(item.text)" :key="part.text">
                      <span v-if="part.type === 'mention'" class="mention-highlight">{{ part.text }}</span>
                      <span v-else>{{ part.text }}</span>
                    </template>
                  </div>
                </div>
              </div>
            </template>
          </template>
          <div v-if="groupLoading" class="phone-loading">
            <div class="loading-spinner" />群友正在输入...
          </div>
        </div>
        <div class="sms-input-bar">
          <button
            type="button"
            class="sms-mention-btn"
            @click="showMentionDropdown = !showMentionDropdown"
          >@</button>
          <div class="sms-input-wrapper">
            <textarea
              v-model="groupDraft"
              class="sms-input"
              placeholder="输入消息，@ 可提及角色..."
              rows="1"
              maxlength="500"
              :disabled="groupLoading"
              @keydown="handleGroupKeyDown"
              @input="onGroupDraftInput"
            />
          </div>
          <button
            type="button"
            class="sms-send-btn"
            :disabled="!groupDraft.trim() || groupLoading"
            @click="handleSendGroupMessage"
          >
            <span class="sms-send-icon">&#x27A4;</span>
          </button>
          <!-- @ 提及下拉 -->
          <div v-if="showMentionDropdown" class="mention-dropdown">
            <template v-for="m in getFilteredMentions()" :key="m.contactId">
              <div
                class="mention-item"
                @click="insertMention(m)"
              >{{ m.contactName }}</div>
            </template>
            <div v-if="getFilteredMentions().length === 0" class="mention-empty">
              没有匹配的角色
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ====== 群聊信息面板 ====== -->
    <div v-if="showGroupInfo && selectedGroup" class="group-info-overlay" @click.self="showGroupInfo = false">
      <div class="group-info-container">
        <!-- 顶部群名称 -->
        <div class="group-info-header">
          <div class="group-avatar-large">&#x1F465;</div>
          <div class="group-info-title">{{ selectedGroup.name }}</div>
          <div class="group-info-subtitle">
            {{ selectedGroup.type === 'worldbook' ? '世界书群聊' : '自定义群聊' }}
            <span v-if="selectedGroup.type === 'worldbook'"> · {{ selectedGroup.worldBookTitle }}</span>
          </div>
        </div>

        <!-- 成员九宫格/列表 -->
        <div class="group-members-section">
          <div class="members-section-title">
            聊天成员 ({{ selectedGroup.members?.length || 0 }})
          </div>
          <div class="members-grid">
            <div
              v-for="m in selectedGroup.members"
              :key="m.contactId"
              class="member-grid-item"
              :class="{ canRemove: selectedGroup.type === 'custom' }"
              @click="selectedGroup.type === 'custom' && toggleGroupMember(m)"
            >
              <div class="member-grid-avatar">
                <span>{{ m.contactName.charAt(0) }}</span>
              </div>
              <div class="member-grid-name">{{ m.contactName }}</div>
              <span v-if="selectedGroup.type === 'custom'" class="member-remove-badge">×</span>
            </div>
            <!-- 添加成员按钮 -->
            <div
              v-if="selectedGroup.type === 'custom'"
              class="member-grid-item add-member-btn"
              @click="toggleManageMembers"
            >
              <div class="member-grid-avatar add-avatar">
                +
              </div>
              <div class="member-grid-name">添加成员</div>
            </div>
          </div>
        </div>

        <!-- 管理成员面板（可展开） -->
        <div v-if="showManageMembers && selectedGroup.type === 'custom'" class="manage-members-panel">
          <div class="manage-header">
            <h4>管理成员</h4>
            <button class="manage-close-btn" @click="showManageMembers = false">×</button>
          </div>
          <div class="manage-body">
            <div v-for="wb in contacts" :key="wb.worldBookId" class="wb-member-section">
              <button
                class="wb-toggle-btn"
                :class="{ expanded: manageExpandedWb === wb.worldBookId }"
                @click="manageExpandedWb = manageExpandedWb === wb.worldBookId ? null : wb.worldBookId"
              >
                {{ manageExpandedWb === wb.worldBookId ? '▼' : '▶' }}
                《{{ wb.worldBookTitle }}》
              </button>
              <div v-if="manageExpandedWb === wb.worldBookId" class="wb-member-list">
                <div
                  v-for="char in wb.characters"
                  :key="char.id"
                  class="wb-member-item"
                  :class="{ selected: isMemberInGroup(char.id) }"
                  @click="toggleGroupMember({ contactId: char.id, contactName: char.name, worldBookId: wb.worldBookId, worldBookTitle: wb.worldBookTitle, identity: char.identity })"
                >
                  <span class="wb-member-check">{{ isMemberInGroup(char.id) ? '&#x2714;' : '&#x25FB;' }}</span>
                  <span>{{ char.name }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部操作 -->
        <div class="group-info-actions">
          <button
            v-if="selectedGroup.type === 'custom'"
            class="action-btn delete-btn"
            @click="deleteGroup(selectedGroup)"
          >
            删除群聊
          </button>
          <button class="action-btn close-btn" @click="showGroupInfo = false">
            关闭
          </button>
        </div>
      </div>
    </div>

    <!-- ====== 设置面板 ====== -->
    <div v-if="showBubbleSettings" class="sms-bubble-settings-overlay">
      <div class="sms-bubble-settings-panel">
        <div class="settings-header">
          <h3>设置</h3>
          <button class="settings-close-btn" @click="showBubbleSettings = false">×</button>
        </div>

        <div class="settings-body">
          <label class="settings-label">发送上下文消息数</label>
          <div class="context-messages-row">
            <input
              v-model.number="smsContextMessages"
              class="context-messages-input"
              type="number"
              min="0"
              step="1"
              placeholder="输入数量..."
            />
            <span class="context-messages-hint">
              {{ smsContextMessages > 0 ? `附带最近 ${smsContextMessages} 条消息` : '不带上下文，仅根据当前消息生成回复' }}
            </span>
          </div>

          <!-- 聊天背景 -->
          <label class="settings-label" style="margin-top: 16px;">聊天背景</label>

          <!-- 当前背景预览 -->
          <div class="chat-bg-preview" :style="chatBgUrl ? { backgroundImage: 'url(' + chatBgUrl + ')' } : {}">
            <span v-if="!chatBgUrl" class="chat-bg-placeholder">暂无背景</span>
          </div>

          <div class="chat-bg-actions">
            <label class="chat-bg-btn chat-bg-upload-btn">
              上传图片
              <input type="file" accept="image/*" @change="handleBgFileSelect" />
            </label>
            <div class="chat-bg-url-row">
              <input
                v-model="chatBgUrlInput"
                class="chat-bg-url-input"
                type="text"
                placeholder="图片 URL..."
                @keydown.enter="handleBgUrlImport"
              />
              <button class="chat-bg-btn chat-bg-url-btn" @click="handleBgUrlImport">导入</button>
            </div>
            <button class="chat-bg-btn chat-bg-clear-btn" @click="handleBgClear">清除背景</button>
          </div>

          <label class="settings-label" style="margin-top: 16px;">自定义 CSS 样式</label>
          <textarea
            v-model="bubbleCss"
            class="css-editor"
            placeholder="输入自定义 CSS..."
            spellcheck="false"
          />

          <div class="settings-actions">
            <label class="import-btn">
              导入 .css 文件
              <input type="file" accept=".css" @change="handleImportCssFile" />
            </label>
            <button class="reset-btn" @click="handleResetBubbleCss">恢复默认</button>
          </div>

          <div class="css-hint">
            <p>可用选择器：</p>
            <code>.sms-bubble.user</code> — 用户消息<br/>
            <code>.sms-bubble.assistant</code> — 对方消息<br/>
            <code>.sms-bubble</code> — 通用气泡<br/>
            <code>.sms-time</code> — 时间分隔线
          </div>
        </div>

        <div class="settings-footer">
          <button class="apply-btn" @click="handleBgSave">保存背景</button>
          <button class="apply-btn" @click="handleSaveSettings">应用设置</button>
        </div>
      </div>
    </div>

    <!-- ====== 日历事件预览弹窗 ====== -->
    <div v-if="showCalendarEventModal" class="calendar-modal-overlay" @click.self="handleDismissCalendarEvent">
      <div class="calendar-modal">
        <div class="calendar-modal-header">
          <span class="calendar-modal-icon">&#128198;</span>
          <h3 class="calendar-modal-title">检测到日程</h3>
        </div>
        <div class="calendar-modal-body">
          <div class="calendar-event-field">
            <span class="calendar-event-label">日期</span>
            <span class="calendar-event-value">{{ pendingCalendarEvent?.date }}{{ pendingCalendarEvent?.time ? ' ' + pendingCalendarEvent.time : '' }}</span>
          </div>
          <div class="calendar-event-field">
            <span class="calendar-event-label">标题</span>
            <span class="calendar-event-value">{{ pendingCalendarEvent?.title }}</span>
          </div>
          <div v-if="pendingCalendarEvent?.description" class="calendar-event-field">
            <span class="calendar-event-label">描述</span>
            <span class="calendar-event-value">{{ pendingCalendarEvent.description }}</span>
          </div>
          <div class="calendar-event-field">
            <span class="calendar-event-label">来源</span>
            <span class="calendar-event-value">{{ pendingCalendarEvent?.contactName }}</span>
          </div>
        </div>
        <div class="calendar-modal-footer">
          <button class="calendar-modal-btn calendar-modal-btn-dismiss" @click="handleDismissCalendarEvent">
            稍后再说
          </button>
          <button class="calendar-modal-btn calendar-modal-btn-import" :disabled="calendarEventImporting" @click="handleImportCalendarEvent">
            {{ calendarEventImporting ? '导入中...' : '导入日历' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ====== 隐藏的文件输入 ====== -->
    <input
      id="sms-avatar-file-input"
      type="file"
      accept="image/png,image/jpeg,image/webp"
      style="display: none;"
      @change="handleAvatarFileSelect"
    />

    <!-- ====== 头像裁剪弹窗 ====== -->
    <AvatarCropModal
      ref="cropModalRef"
      :is-open="showAvatarCrop"
      @close="handleAvatarCropClose"
      @confirm="handleAvatarCropConfirm"
    />
  </div>
</template>

<style scoped>
/* ===== 标签切换 ===== */
.sms-tab-bar {
  display: flex;
  padding: 6px 12px;
  gap: 6px;
  border-bottom: 1px solid var(--phone-border, rgba(255, 255, 255, 0.1));
}

/* 联系人头像长按交互 */
.contact-avatar {
  cursor: pointer;
  transition: transform 0.15s;
}

.contact-avatar:active {
  transform: scale(0.92);
}

/* ===== 消息行布局（气泡+头像） ===== */
.sms-msg-row {
  display: flex;
  align-items: flex-end;
  width: 100%;
}

.sms-msg-row.assistant {
  flex-direction: row;
}

.sms-msg-row.user {
  flex-direction: row-reverse;
}

.sms-msg-row .sms-bubble {
  margin-left: 0;
  margin-right: 0;
}

.sms-msg-avatar {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  margin: 0 2px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.1));
}

.sms-msg-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sms-msg-avatar-default {
  font-size: 1.5rem;
  line-height: 1;
}

.sms-tab {
  flex: 1;
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--phone-border, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
  padding: 6px;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.5));
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.sms-tab.active {
  background: var(--phone-accent-blue, #0a84ff);
  color: #fff;
  border-color: var(--phone-accent-blue, #0a84ff);
}

/* ===== 群聊相关 ===== */
.group-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px 6px;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.5));
  font-size: 0.78rem;
  font-weight: 600;
}

.group-create-btn {
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--phone-border, rgba(255, 255, 255, 0.15));
  border-radius: 6px;
  padding: 3px 10px;
  color: var(--phone-accent-blue, #0a84ff);
  font-size: 0.78rem;
  cursor: pointer;
}

.group-avatar {
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 创建群聊面板 */
.create-group-panel {
  max-height: 85vh;
}

.group-name-input {
  width: 100%;
  background: var(--phone-bg, #000);
  border: 1px solid var(--phone-border, rgba(255, 255, 255, 0.15));
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--phone-text-primary, #fff);
  font-size: 0.88rem;
  outline: none;
  box-sizing: border-box;
}

.group-name-input:focus {
  border-color: var(--phone-accent-blue, #0a84ff);
}

.wb-member-section {
  margin-bottom: 4px;
}

.wb-toggle-btn {
  width: 100%;
  text-align: left;
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.04));
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  color: var(--phone-text-primary, #fff);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s;
}

.wb-toggle-btn:hover {
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.08));
}

.wb-toggle-btn.expanded {
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.1));
}

.wb-member-list {
  padding-left: 12px;
}

.wb-member-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 0.82rem;
  color: var(--phone-text-primary, #fff);
}

.wb-member-item:hover {
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.06));
}

.wb-member-item.selected {
  background: rgba(10, 132, 255, 0.15);
}

.wb-member-check {
  font-size: 1rem;
  color: var(--phone-accent-blue, #0a84ff);
}

.group-sender-name {
  display: inline-block;
  font-size: 0.72rem;
  color: var(--phone-accent-blue, #0a84ff);
  font-weight: 600;
  margin-bottom: 3px;
}

.sms-msg-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* ===== 聊天背景 ===== */
.sms-chat-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: 0;
  opacity: 0.3;
  pointer-events: none;
}

.sms-messages {
  position: relative;
}

.chat-bg-preview {
  width: 100%;
  height: 80px;
  border-radius: 8px;
  border: 1px solid var(--phone-border, rgba(255, 255, 255, 0.15));
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.06));
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
}

.chat-bg-placeholder {
  font-size: 0.75rem;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.4));
}

.chat-bg-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.chat-bg-btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--phone-border, rgba(255, 255, 255, 0.15));
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.06));
  color: var(--phone-accent-blue, #0a84ff);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  text-align: center;
  transition: background 0.2s;
}

.chat-bg-btn:hover {
  background: var(--phone-border, rgba(255, 255, 255, 0.1));
}

.chat-bg-btn input {
  display: none;
}

.chat-bg-url-row {
  display: flex;
  gap: 8px;
}

.chat-bg-url-input {
  flex: 1;
  background: var(--phone-bg, #000);
  border: 1px solid var(--phone-border, rgba(255, 255, 255, 0.15));
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--phone-text-primary, #fff);
  font-size: 0.82rem;
  outline: none;
}

.chat-bg-url-input:focus {
  border-color: var(--phone-accent-blue, #0a84ff);
}

.chat-bg-url-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--phone-accent-blue, #0a84ff);
  background: rgba(10, 132, 255, 0.15);
  color: var(--phone-accent-blue, #0a84ff);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.chat-bg-clear-btn {
  color: var(--phone-accent-orange, #ff9500);
  border-color: rgba(255, 149, 0, 0.3);
  background: rgba(255, 149, 0, 0.1);
}

/* @ 提及高亮 */
.mention-highlight {
  color: var(--phone-accent-blue, #0a84ff);
  font-weight: 700;
}

/* 群聊信息按钮 */
.group-info-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
  line-height: 1;
}

.group-info-btn:hover {
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.1));
}

/* 群聊信息面板 - 微信风格 */
.group-info-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  background: var(--phone-overlay, rgba(0, 0, 0, 0.7));
  display: flex;
  align-items: flex-end;
  padding: 16px;
  animation: fade-in 0.2s ease;
}

.group-info-container {
  width: 100%;
  max-height: 85vh;
  background: var(--phone-bg, #000);
  border-radius: 16px 16px 0 0;
  overflow-y: auto;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}

/* 顶部群名称 */
.group-info-header {
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-bottom: 1px solid var(--phone-border, rgba(255, 255, 255, 0.08));
}

.group-avatar-large {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.08));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.8rem;
  margin-bottom: 10px;
}

.group-info-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--phone-text-primary, #fff);
  margin-bottom: 4px;
}

.group-info-subtitle {
  font-size: 0.75rem;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.4));
}

/* 成员列表 - 网格 */
.group-members-section {
  padding: 16px;
}

.members-section-title {
  font-size: 0.82rem;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.4));
  margin-bottom: 12px;
}

.members-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.member-grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: default;
  position: relative;
}

.member-grid-item.canRemove {
  cursor: pointer;
}

.member-grid-item.canRemove:active .member-grid-avatar {
  opacity: 0.5;
}

.member-grid-avatar {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.1));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--phone-text-primary, #fff);
  transition: opacity 0.15s;
}

.member-grid-avatar.add-avatar {
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.06));
  font-size: 1.2rem;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.5));
  font-weight: 400;
}

.member-grid-name {
  font-size: 0.7rem;
  color: var(--phone-text-primary, #fff);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.member-remove-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--phone-accent-red, #ff3b30);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.add-member-btn {
  cursor: pointer;
}

.add-member-btn:active .member-grid-avatar {
  opacity: 0.7;
}

/* 管理成员面板 */
.manage-members-panel {
  margin: 0 16px 16px;
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.04));
  border-radius: 12px;
  overflow: hidden;
}

.manage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--phone-border, rgba(255, 255, 255, 0.08));
}

.manage-header h4 {
  margin: 0;
  font-size: 0.9rem;
  color: var(--phone-text-primary, #fff);
}

.manage-close-btn {
  background: none;
  border: none;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.4));
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px 8px;
}

.manage-body {
  padding: 12px;
  max-height: 300px;
  overflow-y: auto;
}

/* 底部操作 */
.group-info-actions {
  padding: 16px;
  display: flex;
  gap: 10px;
  border-top: 1px solid var(--phone-border, rgba(255, 255, 255, 0.08));
}

.action-btn {
  flex: 1;
  padding: 12px;
  border-radius: 10px;
  border: none;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.action-btn:active {
  opacity: 0.7;
}

.action-btn.delete-btn {
  background: rgba(255, 59, 48, 0.15);
  color: var(--phone-accent-red, #ff3b30);
  border: 1px solid rgba(255, 59, 48, 0.3);
}

.action-btn.close-btn {
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.08));
  color: var(--phone-text-primary, #fff);
}

/* @ 提及相关 */
.sms-input-wrapper {
  flex: 1;
  position: relative;
}

.sms-input-wrapper .sms-input {
  width: 100%;
}

.sms-mention-btn {
  background: none;
  border: none;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.4));
  font-size: 1rem;
  cursor: pointer;
  padding: 0;
  margin: 0;
  line-height: 1;
  width: 1em;
  height: 1em;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  align-self: center;
}

.sms-mention-btn:hover {
  color: var(--phone-accent-blue, #0a84ff);
  background: rgba(10, 132, 255, 0.1);
}

.mention-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: var(--phone-bg-secondary, #1c1c1e);
  border: 1px solid var(--phone-border, rgba(255, 255, 255, 0.15));
  border-radius: 10px;
  max-height: 160px;
  overflow-y: auto;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.4);
  z-index: 30;
}

.mention-item {
  padding: 8px 14px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--phone-text-primary, #fff);
  transition: background 0.1s;
}

.mention-item:hover {
  background: rgba(10, 132, 255, 0.15);
}

.mention-item:first-child {
  border-radius: 10px 10px 0 0;
}

.mention-item:last-child {
  border-radius: 0 0 10px 10px;
}

.mention-empty {
  padding: 10px 14px;
  font-size: 0.82rem;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.4));
  text-align: center;
}

/* 删除群聊按钮 */
/* ===== 以下为原有样式 ===== */

/* 气泡设置按钮 */
.sms-bubble-settings-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
  line-height: 1;
}

.sms-bubble-settings-btn:hover {
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.1));
}

/* 设置面板遮罩 */
.sms-bubble-settings-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  background: var(--phone-overlay, rgba(0, 0, 0, 0.85));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: fade-in 0.2s ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 设置面板 */
.sms-bubble-settings-panel {
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  background: var(--phone-bg-secondary, #1c1c1e);
  border-radius: 16px;
  border: 1px solid var(--phone-border, rgba(255, 255, 255, 0.1));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--phone-border, rgba(255, 255, 255, 0.1));
  flex-shrink: 0;
}

.settings-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--phone-text-primary, #fff);
}

.settings-close-btn {
  background: none;
  border: none;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.5));
  font-size: 1.4rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  line-height: 1;
}

.settings-close-btn:hover {
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.1));
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 0;
}

.settings-label {
  display: block;
  font-size: 0.85rem;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.5));
  font-weight: 600;
  margin-bottom: 8px;
}

.context-messages-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.context-messages-input {
  width: 80px;
  background: var(--phone-bg, #000);
  border: 1px solid var(--phone-border, rgba(255, 255, 255, 0.15));
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--phone-text-primary, #fff);
  font-size: 0.9rem;
  outline: none;
  text-align: center;
  box-sizing: border-box;
}

.context-messages-input:focus {
  border-color: var(--phone-accent-blue, #0a84ff);
}

.context-messages-input::-webkit-outer-spin-button,
.context-messages-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.context-messages-input[type='number'] {
  -moz-appearance: textfield;
}

.context-messages-hint {
  font-size: 0.78rem;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.5));
}

.css-editor {
  width: 100%;
  min-height: 200px;
  max-height: 40vh;
  background: var(--phone-bg, #000);
  border: 1px solid var(--phone-border, rgba(255, 255, 255, 0.15));
  border-radius: 10px;
  padding: 12px;
  color: var(--phone-text-primary, #fff);
  font-family: var(--font-mono, 'Consolas', 'Monaco', monospace);
  font-size: 0.8rem;
  line-height: 1.5;
  outline: none;
  resize: vertical;
  box-sizing: border-box;
  tab-size: 2;
}

.css-editor:focus {
  border-color: var(--phone-accent-blue, #0a84ff);
}

.settings-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.import-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--phone-border, rgba(255, 255, 255, 0.15));
  border-radius: 8px;
  color: var(--phone-accent-blue, #0a84ff);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.import-btn:hover {
  background: var(--phone-border, rgba(255, 255, 255, 0.1));
}

.import-btn input {
  display: none;
}

.reset-btn {
  padding: 8px 16px;
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--phone-border, rgba(255, 255, 255, 0.15));
  border-radius: 8px;
  color: var(--phone-accent-orange, #ff9500);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.reset-btn:hover {
  background: var(--phone-border, rgba(255, 255, 255, 0.1));
}

.css-hint {
  margin-top: 14px;
  padding: 10px 12px;
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.04));
  border-radius: 8px;
  font-size: 0.75rem;
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.5));
  line-height: 1.6;
}

.css-hint p {
  margin: 0 0 4px;
  font-weight: 600;
}

.css-hint code {
  display: inline-block;
  background: var(--phone-bg, rgba(0, 0, 0, 0.3));
  padding: 1px 5px;
  border-radius: 4px;
  font-family: var(--font-mono, monospace);
  font-size: 0.72rem;
  color: var(--phone-accent-blue, #0a84ff);
  margin: 1px 0;
}

.settings-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--phone-border, rgba(255, 255, 255, 0.1));
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}

.apply-btn {
  flex: 1;
  padding: 10px;
  background: linear-gradient(135deg, var(--phone-accent-blue, #0a84ff), #5856d6);
  border: none;
  border-radius: 10px;
  color: var(--phone-text-primary, #fff);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s;
}

.apply-btn:hover {
  transform: scale(1.02);
}

.apply-btn:active {
  transform: scale(0.98);
}

.apply-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}


  .platform-android.android-portrait .sms-tab,
  .platform-android.android-portrait .reset-btn,
  .platform-android.android-portrait .settings-close-btn,
  .platform-android.android-portrait .sms-bubble-settings-btn,
  .platform-android.android-portrait .group-create-btn,
  .platform-android.android-portrait .sms-mention-btn {
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

/* ===== 日历事件弹窗 ===== */
.calendar-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.calendar-modal {
  width: 100%;
  max-width: 420px;
  background: var(--phone-bg, #1a1a2e);
  border-radius: 16px 16px 0 0;
  padding-bottom: env(safe-area-inset-bottom, 16px);
  animation: slideUp 0.3s ease;
}

.calendar-modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 20px 12px;
  border-bottom: 1px solid var(--phone-border, rgba(255, 255, 255, 0.08));
}

.calendar-modal-icon {
  font-size: 1.5rem;
}

.calendar-modal-title {
  margin: 0;
  font-size: 1.1rem;
  color: var(--phone-text-primary, #fff);
  font-weight: 600;
}

.calendar-modal-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.calendar-event-field {
  display: flex;
  gap: 8px;
  font-size: 0.9rem;
}

.calendar-event-label {
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.5));
  min-width: 40px;
}

.calendar-event-value {
  color: var(--phone-text-primary, #fff);
  flex: 1;
}

.calendar-modal-footer {
  display: flex;
  gap: 12px;
  padding: 12px 20px 20px;
}

.calendar-modal-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.calendar-modal-btn:disabled {
  opacity: 0.5;
}

.calendar-modal-btn-dismiss {
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.08));
  color: var(--phone-text-primary, #fff);
}

.calendar-modal-btn-import {
  background: var(--phone-accent, #4a90d9);
  color: #fff;
}
</style>
