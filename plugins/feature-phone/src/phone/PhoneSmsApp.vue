<script setup>
/**
 * PhoneSmsApp.vue - 短信应用（重构版）
 *
 * 私聊 + 群聊 + LLM 回复。支持红包、礼物、语音、表情包、气泡 CSS。
 * 已拆分子组件：SmsContactList, SmsPrivateThread, SmsGroupThread,
 * SmsGroupInfo, SmsCreateGroup, SmsStickerPanel, SmsBubbleSettings,
 * SmsCalendarModal, SmsMessageRender。
 */
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
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
import { generatePhoneSmsReply, generateGroupChatReply, generateRelationshipAnalysis } from '../../../../src/llm/index.js'
import { generatePhoneSmsFile } from '../../../../src/llm/index.js'
import { useWorldMemoryStore } from '../../../../src/stores/worldMemory.store.js'
import { generateCharacterSpeech } from '../../../../src/llm/llmService.core.js'
import { kvStorage } from '../../../../src/storage/index.js'
import { generateIcsContent } from './utils/generateIcsContent.js'
import { openCalendarImport } from './services/calendarBridge.js'
import { loadWorldBooks, persistWorldBooks } from '../../../../src/worldbook/worldBookStore.js'
import { drawRandomSmsEvent, importSmsEventPoolJson, exportSmsEventPoolJson } from '../../../../src/composables/useSmsEventPool.js'
import { loadNpcSmsThreads } from '../../../../src/services/npcSmsService.js'
import AvatarCropModal from '../../../feature-dormitory/src/components/AvatarCropModal.vue'
import { useAvatar as useDormAvatar } from '../../../feature-dormitory/src/composables/useAvatar.js'
import { useContactStatus } from './composables/useContactStatus.js'
import { useRelationshipStore } from '../../../../src/stores/relationship.store.js'
import { useCharacterSchedule } from '../../../feature-character-schedule/src/composables/useCharacterSchedule.js'
import { usePhoneEconomy } from './composables/usePhoneEconomy.js'
import { archiveDialogue, getUnanalysedCount, shouldAutoAnalyse, getDialogueArchive } from '../../../../src/composables/useDialogueArchive.js'
import { usePlayerState } from '../../../../src/stores/playerState.store.js'
import { generateArchiveCard } from '../../../../src/llm/llmService.phone.js'
import { addArchiveCard, getArchiveStats } from './services/archiveService.js'
import { checkAchievements } from './services/achievementService.js'
import { useSmsMessaging } from './composables/useSmsMessaging.js'
import PhoneRedPacketModal from './PhoneRedPacketModal.vue'
import PhoneGiftShop from './PhoneGiftShop.vue'
import SmsContactList from './components/sms/SmsContactList.vue'
import SmsPrivateThread from './components/sms/SmsPrivateThread.vue'
import SmsGroupThread from './components/sms/SmsGroupThread.vue'
import SmsGroupInfo from './components/sms/SmsGroupInfo.vue'
import SmsCreateGroup from './components/sms/SmsCreateGroup.vue'
import SmsStickerPanel from './components/sms/SmsStickerPanel.vue'
import SmsBubbleSettings from './components/sms/SmsBubbleSettings.vue'
import SmsCalendarModal from './components/sms/SmsCalendarModal.vue'
import NpcSmsThread from './components/sms/NpcSmsThread.vue'
import SmsFilePreview from './components/sms/SmsFilePreview.vue'
import SmsVoiceCall from './components/sms/SmsVoiceCall.vue'
import { importPrintableDirectoryNative } from '../../../../src/native/cardImportPlugin.js'
import { setPrintableDir, getPrintableDir, clearPrintableDir } from '../../../../src/services/printableConfigService.js'

const emit = defineEmits(['back', 'call-video', 'call-voice'])

// 全局用户身份
const playerState = usePlayerState()
const rel = useRelationshipStore()
const isBtConnected = inject('isBluetoothConnected', ref(false))

// 语音通话来电
const pendingVoiceCall = inject('pendingVoiceCall', ref(null))

// Reader 分享转发
const pendingSmsShare = inject('pendingSmsShare', ref(null))

// 寝室头像
const dormAvatarRef = ref(null)
try {
  const avatarApi = useDormAvatar()
  dormAvatarRef.value = avatarApi.activeAvatarDataUrl?.value || null
} catch {
  dormAvatarRef.value = null
}

// ===== Composables =====
const contactStatus = useContactStatus()
const schedule = useCharacterSchedule()
const economy = usePhoneEconomy()
const smsTools = useSmsMessaging()

// ===== 状态 =====
const contacts = ref([])
const smsThreads = ref({})
const selectedContact = ref(null)
const smsDraft = ref('')
const smsLoading = ref(false)
const privateThreadRef = ref(null)
const groupThreadRef = ref(null)

// NPC 短信
const npcSmsThreads = ref([])
const selectedNpcThread = ref(null)
const showNpcThreadViewer = ref(false)

// 文件预览
const selectedFile = ref(null)
const showFilePreview = ref(false)
const cachedPrintableTypes = ref([])
const customPrintableBaseDir = ref(null)
const showPrintableConfig = ref(false)
const printableConfigInput = ref('')
const printableConfigStatus = ref('') // 'success' | 'error' | ''
const printableConfigLoading = ref(false)
const printableConfigToast = ref(null)

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

// 查岗设置（异步初始化）
const spotCheckEnabled = ref(null) // null = 尚未从 kvStorage 加载
const spotCheckMinMin = ref(null)
const spotCheckMinMax = ref(null)
const spotCheckWhitelist = ref(null)

const allContacts = computed(() => {
  return contacts.value.flatMap(g => g.characters || [])
})

// 日历事件
const showCalendarEventModal = ref(false)
const pendingCalendarEvent = ref(null)
const calendarEventImporting = ref(false)

// 短信通用设置
const smsContextMessages = ref(8)
const smsMaxTokens = ref(2000)

// 表情包
const showStickerPanel = ref(false)
const showStickerImport = ref(false)
const stickerImportText = ref('')

// + 展开面板
const showPlusPanel = ref(false)

// 语音消息
const playingVoiceId = ref(null)
const voiceShownText = ref(new Set())
let voiceLongPressTimer = null

// 头像裁剪
const showAvatarCrop = ref(false)
const cropModalRef = ref(null)
const pendingAvatarFile = ref(null)
const pendingAvatarChar = ref(null)
let longPressTimer = null

// 红包/礼物/语音通话
const activeRedPacket = ref(null)
const showRedPacketModal = ref(false)
const showGiftShop = ref(false)
const showGiftReturnToast = ref(null)
const showVoiceCall = ref(false)
const voiceCallIncoming = ref(false)

// 默认气泡 CSS 模板（浅色 IM 风格）
const DEFAULT_BUBBLE_CSS = `/* ===== 短信气泡自定义样式（浅色 IM 风格） ===== */
.sms-messages {
  background: transparent;
  padding: 4px 8px;
}
.sms-messages .sms-msg-row .sms-bubble.user {
  background: linear-gradient(135deg, #ffeef5, #fce4ec);
  border-radius: 18px 18px 6px 18px;
  color: #4a2040;
  font-size: 0.88rem;
  line-height: 1.55;
  padding: 10px 14px;
  box-shadow: 0 1px 4px rgba(252, 182, 159, 0.2);
}
.sms-messages .sms-msg-row .sms-bubble.assistant {
  background: #fff;
  border-radius: 18px 18px 18px 6px;
  color: #333;
  font-size: 0.88rem;
  line-height: 1.55;
  padding: 10px 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.sms-messages .sms-time {
  text-align: center;
  font-size: 0.65rem;
  color: #bbb;
  background: rgba(0, 0, 0, 0.04);
  display: inline-block;
  margin: 8px auto;
  padding: 3px 14px;
  border-radius: 10px;
  letter-spacing: 0.3px;
}`

const SMS_BUBBLE_CSS_KEY = 'phone_sms_bubble_css'

// ===== 辅助函数 =====
function getCharScheduleStatus(char) {
  const s = schedule.getCharacterStatus(char.worldBookId || '', char.id)
  if (!s) return { activityType: 'leisure', canContact: true }
  return { activityType: s.activityType || 'leisure', canContact: s.canContact ?? true }
}

function getOnlineStatusForChar(char) {
  const { activityType, canContact } = getCharScheduleStatus(char)
  return contactStatus.getOnlineStatus(activityType, canContact)
}

function getLastMessage(contactId) {
  const thread = smsThreads.value[contactId]
  if (!thread || thread.length === 0) return null
  return thread[thread.length - 1]
}

function getLastGroupMessage(groupId) {
  const thread = groupThreads.value[groupId]
  if (!thread || thread.length === 0) return null
  return thread[thread.length - 1]
}

function getGroupMemberCount(group) {
  return Array.isArray(group.members) ? group.members.length : 0
}

function getCharAvatar(char) {
  return char?.smsAvatar || char?.portraits?.[0]?.filePath || null
}

function getUserAvatar() {
  return dormAvatarRef.value || null
}

function findContactById(charId) {
  for (const group of contacts.value) {
    for (const c of group.characters) {
      if (c.id === charId) return c
    }
  }
  return null
}

// ===== Computed =====
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
    result.push({ ...msg, type: 'message', dateKey: msg.timestamp })
  }
  return result
})

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

// ===== 红包/礼物 =====
async function handleRedPacketClick(rpMessage) {
  if (rpMessage.redPacket?.isOpened) return
  activeRedPacket.value = rpMessage
  showRedPacketModal.value = true
}

async function handleRedPacketOpen() {
  if (!activeRedPacket.value) return null
  const rpId = activeRedPacket.value.redPacketId
  const result = await economy.openRedPacket(rpId)
  if (result.success) {
    activeRedPacket.value.redPacket.isOpened = true
    await saveSmsThreads(smsThreads.value)
  }
  return result
}

function handleRedPacketClose() {
  showRedPacketModal.value = false
  activeRedPacket.value = null
}

function openGiftShop() {
  showGiftShop.value = true
}

async function handleGiftSent({ gift }) {
  if (!selectedContact.value) return
  const contact = selectedContact.value
  // 插入 giftCard 消息用于卡片渲染
  const thread = smsThreads.value[contact.id] || []
  thread.push({
    id: `sms_gc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role: 'user',
    msgType: 'giftCard',
    giftCard: { giftName: gift.name, icon: gift.icon },
    timestamp: new Date().toISOString(),
  })
  smsThreads.value[contact.id] = thread
  await saveSmsThreads(smsThreads.value)
  try {
    const book = await getWorldBookById(contact.worldBookId)
    const contactForLlm = {
      id: contact.id,
      name: contact.name,
      identity: contact.identity || contact.nickname || '',
    }
    const result = await generatePhoneSmsReply({
      worldBook: book || { id: contact.worldBookId, title: contact.worldBookTitle, characters: [] },
      contact: contactForLlm,
      userMessage: `[送出了 ${gift.icon} ${gift.name} 给${contact.name}]`,
      history: [],
      options: { historyLimits: 0, maxTokens: smsMaxTokens.value },
    })
    if (result.success && result.replies && result.replies.length > 0) {
      for (const reply of result.replies) {
        if (reply && reply.trim()) {
          addSmsMessage(smsThreads.value, contact.id, 'assistant', reply.trim())
        }
      }
      await saveSmsThreads(smsThreads.value)
    }
    if (result.replies?.[0]) {
      await economy.recordGiftReply(gift.id, result.replies[0])
    }
  } catch (e) {
    console.warn('[PhoneSmsApp] 礼物感谢生成失败:', e)
  }
  nextTick(() => scrollToBottom())
}

// ===== 语音消息 =====
async function playVoiceMessage(msg) {
  if (playingVoiceId.value === msg.id) return
  if (window._smsVoiceAudio) {
    window._smsVoiceAudio.pause()
    window._smsVoiceAudio = null
    playingVoiceId.value = null
  }
  try {
    let audioUrl = msg.ttsAudioUrl
    if (!audioUrl) {
      const voiceConfig = selectedContact.value?.voiceConfig || {}
      const result = await generateCharacterSpeech({
        text: msg.voiceText,
        emotion: msg.voiceEmotion || 'neutral',
        voiceConfig: voiceConfig.voiceId ? voiceConfig : null,
      })
      if (!result.success || !result.audioBytes) {
        console.warn('[PhoneSmsApp] TTS 生成失败:', result.error)
        return
      }
      const blob = new Blob([result.audioBytes], { type: result.mimeType || 'audio/mp3' })
      audioUrl = URL.createObjectURL(blob)
      msg.ttsAudioUrl = audioUrl
      await saveSmsThreads(smsThreads.value)
    }
    playingVoiceId.value = msg.id
    const audio = new Audio(audioUrl)
    window._smsVoiceAudio = audio
    audio.onended = () => { playingVoiceId.value = null; window._smsVoiceAudio = null }
    audio.onerror = () => { playingVoiceId.value = null; window._smsVoiceAudio = null }
    await audio.play()
  } catch (e) {
    console.warn('[PhoneSmsApp] 播放语音失败:', e)
    playingVoiceId.value = null
    window._smsVoiceAudio = null
  }
}

function stopVoicePlayback() {
  if (window._smsVoiceAudio) {
    window._smsVoiceAudio.pause()
    window._smsVoiceAudio = null
    playingVoiceId.value = null
  }
}

function startVoiceLongPress(e, msg) {
  voiceLongPressTimer = setTimeout(() => {
    const set = new Set(voiceShownText.value)
    if (set.has(msg.id)) set.delete(msg.id)
    else set.add(msg.id)
    voiceShownText.value = set
    voiceLongPressTimer = null
  }, 500)
}

function cancelVoiceLongPress() {
  if (voiceLongPressTimer) {
    clearTimeout(voiceLongPressTimer)
    voiceLongPressTimer = null
  }
}

// ===== Plus 面板 =====
function handlePlusAction(action) {
  showPlusPanel.value = false
  switch (action) {
    case 'emoji':
      showStickerPanel.value = !showStickerPanel.value
      break
    case 'voicecall':
      voiceCallIncoming.value = false
      showVoiceCall.value = true
      break
    case 'gift':
      openGiftShop()
      break
    case 'redpacket':
      smsDraft.value += '[红包]'
      break
    case 'file':
      openPrintableConfig()
      break
    case 'camera': case 'music': case 'location':
      break // TODO
  }
}

// ===== 可打印文件配置 =====
async function openPrintableConfig() {
  showPrintableConfig.value = true
  const saved = await getPrintableDir()
  customPrintableBaseDir.value = saved
  printableConfigInput.value = saved || ''
  printableConfigStatus.value = ''
}

async function handleImportPrintableFolder() {
  printableConfigLoading.value = true
  printableConfigStatus.value = ''
  try {
    const result = await importPrintableDirectoryNative()
    if (result?.success) {
      const saved = await setPrintableDir(result.baseDir, result.sourceUri || result.baseDir)
      if (saved) {
        customPrintableBaseDir.value = result.baseDir
        printableConfigInput.value = result.baseDir
        printableConfigStatus.value = `success`
        printableConfigToast.value = `已导入 ${result.filesCopied} 个文件`
        setTimeout(() => { printableConfigToast.value = null }, 3000)
        // 加载类型列表
        await loadPrintableTypesForConfig(result.baseDir)
      } else {
        printableConfigStatus.value = 'error'
      }
    } else if (result?.canceled) {
      // 用户取消，不做处理
    } else {
      printableConfigStatus.value = 'error'
    }
  } catch (e) {
    printableConfigStatus.value = 'error'
    console.warn('[PhoneSmsApp] 导入可打印文件夹失败:', e)
  } finally {
    printableConfigLoading.value = false
  }
}

async function handleSavePrintablePath() {
  const path = printableConfigInput.value.trim()
  if (!path) {
    printableConfigStatus.value = 'error'
    return
  }
  printableConfigLoading.value = true
  printableConfigStatus.value = ''
  try {
    const saved = await setPrintableDir(path, path)
    if (saved) {
      customPrintableBaseDir.value = path
      printableConfigStatus.value = 'success'
      await loadPrintableTypesForConfig(path)
    } else {
      printableConfigStatus.value = 'error'
    }
  } catch (e) {
    printableConfigStatus.value = 'error'
  } finally {
    printableConfigLoading.value = false
  }
}

async function handleResetPrintablePath() {
  await clearPrintableDir()
  customPrintableBaseDir.value = null
  printableConfigInput.value = ''
  printableConfigStatus.value = 'success'
  cachedPrintableTypes.value = []
}

async function loadPrintableTypesForConfig(baseDir) {
  try {
    const { scanPrintableTypes, loadPrintablePromptJson } = await import('../../../../src/llm/llmService.phone.js')
    // scanPrintableTypes is not exported, so we use the exported generatePhoneSmsFile path
    // For now, just close the config and let the actual generation handle it
  } catch { /* ignore */ }
}

function closePrintableConfig() {
  showPrintableConfig.value = false
  printableConfigStatus.value = ''
}

// ===== 表情包 =====
async function handleStickerImport() {
  const raw = stickerImportText.value.trim()
  if (!raw) return
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return
    if (!selectedContact.value) return
    const { charId, worldBookId } = { charId: selectedContact.value.id, worldBookId: selectedContact.value.worldBookId }
    const books = await loadWorldBooks()
    const book = books.find(b => b.id === worldBookId)
    if (!book) return
    const char = book.characters?.find(c => c.id === charId)
    if (!char) return
    char.smsStickers = { ...char.smsStickers, ...parsed }
    char.updatedAt = new Date().toISOString()
    await persistWorldBooks(books)
    clearWorldBookCache()
    selectedContact.value.smsStickers = char.smsStickers
    stickerImportText.value = ''
  } catch (e) {
    console.warn('[PhoneSmsApp] 导入表情包失败:', e)
  }
}

// ===== 气泡 CSS =====
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
  if (smsApp) { smsApp.appendChild(el); bubbleStyleEl = el }
}

function handleSaveSettings() {
  kvStorage.set(SMS_BUBBLE_CSS_KEY, bubbleCss.value)
  applyBubbleCss(bubbleCss.value)
  saveSmsSettings({ contextMessages: smsContextMessages.value, maxTokens: smsMaxTokens.value })
  showBubbleSettings.value = false
}

function handleResetBubbleCss() {
  bubbleCss.value = DEFAULT_BUBBLE_CSS
  kvStorage.set(SMS_BUBBLE_CSS_KEY, DEFAULT_BUBBLE_CSS)
  applyBubbleCss(DEFAULT_BUBBLE_CSS)
}

function handleSaveSpotCheck() {
  kvStorage.set('spot_check_voice_enabled', spotCheckEnabled.value)
  kvStorage.set('spot_check_min_min', spotCheckMinMin.value)
  kvStorage.set('spot_check_max_min', spotCheckMinMax.value)
  kvStorage.set('spot_check_whitelist', spotCheckWhitelist.value || [])
}

function handleImportCssFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  bubbleCssFile.value = file.name
  const reader = new FileReader()
  reader.onload = (ev) => { bubbleCss.value = ev.target?.result || '' }
  reader.readAsText(file)
}

// ===== 事件池 =====
async function handleImportEventPool(e) {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = ''
  try {
    const text = await file.text()
    const result = await importSmsEventPoolJson(text)
    console.log('[sms-event-pool] Imported:', result.count, 'events')
  } catch (err) {
    console.error('[sms-event-pool] Import failed:', err.message)
  }
}

async function handleExportEventPool() {
  try {
    const json = await exportSmsEventPoolJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sms-event-pool.json'
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('[sms-event-pool] Export failed:', err.message)
  }
}

// ===== 聊天背景 =====
function handleBgFileSelect(e) {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = ''
  const reader = new FileReader()
  reader.onload = (ev) => { chatBgUrl.value = ev.target?.result || '' }
  reader.readAsDataURL(file)
}

function handleBgUrlImport() {
  const url = chatBgUrlInput.value.trim()
  if (!url) return
  chatBgUrl.value = url
  chatBgUrlInput.value = ''
}

function handleBgClear() {
  chatBgUrl.value = ''
}

async function handleBgSave() {
  if (!selectedContact.value) return
  const { charId, worldBookId } = { charId: selectedContact.value.id, worldBookId: selectedContact.value.worldBookId }
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
  if (savedCss && savedCss.trim()) applyBubbleCss(savedCss)
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
  nextTick(() => {
    const container = privateThreadRef.value?.messagesContainerRef
      || groupThreadRef.value?.groupMessagesRef
    if (container) container.scrollTop = container.scrollHeight
  })
}

/**
 * 30% 概率随机抽取 SMS 事件
 */
async function drawRandomSmsEventWithChance() {
  if (Math.random() >= 0.3) return null
  try {
    return await drawRandomSmsEvent()
  } catch (e) {
    console.warn('[sms-event] drawRandomSmsEvent failed:', e.message)
    return null
  }
}

// ===== 发送私聊 =====
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
    const stickers = smsTools.getAvailableStickers(contact)
    const thread = getSmsThread(smsThreads.value, contact.id)
    const history = thread.slice(-smsContextMessages.value).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      text: m.text,
    }))
    const stickerList = stickers.map(([desc]) => desc)

    // 加载世界记忆
    const bookId = book?.id || contact.worldBookId
    const worldMemories = await useWorldMemoryStore().get(bookId)

    // 加载关系数据
    let relationshipSnapshot = null
    try {
      const relData = rel.getCharacter(contact.id)
      if (rel) {
        relationshipSnapshot = {
          [contact.id]: {
            favor: rel.favor,
            trust: rel.trust,
            stance: rel.stance,
            level: rel.level,
          },
        }
      }
    } catch { /* 忽略 */ }

    const result = await generatePhoneSmsReply({
      worldBook: book || { id: contact.worldBookId, title: contact.worldBookTitle, characters: [] },
      contact: contactForLlm,
      userMessage: text,
      history,
      worldMemories,
      relationshipSnapshot,
      options: { historyLimit: smsContextMessages.value, maxTokens: smsMaxTokens.value, stickerList },
      eventContext: await drawRandomSmsEventWithChance(),
    })

    if (result.success && result.replies?.length > 0) {
      for (const reply of result.replies) {
        if (reply && reply.trim()) {
          addSmsMessage(smsThreads.value, contact.id, 'assistant', reply.trim())
        }
      }
      if (result.voiceMessages?.length > 0) {
        for (const vm of result.voiceMessages) {
          const thread = smsThreads.value[contact.id] || []
          thread.push({
            id: `sms_vmsg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            role: 'assistant',
            msgType: 'voice',
            voiceText: vm.voiceText,
            voiceEmotion: vm.voiceEmotion,
            ttsAudioUrl: null,
            timestamp: new Date().toISOString(),
          })
          smsThreads.value[contact.id] = thread
        }
        // 蓝牙模式下自动播放语音消息
        if (isBtConnected?.value) {
          const lastThread = smsThreads.value[contact.id]
          const lastVoice = lastThread[lastThread.length - 1]
          if (lastVoice?.msgType === 'voice') {
            setTimeout(() => playVoiceMessage(lastVoice), 300)
          }
        }
      }
      await saveSmsThreads(smsThreads.value)
      nextTick(() => scrollToBottom())

      // 归档
      if (book) {
        await archiveDialogue({ speaker: '玩家', text: text.slice(0, 150), worldBookId: book.id, characterId: 'player' })
        await archiveDialogue({ speaker: contact.name, text: result.replies.join('\n').slice(0, 150), worldBookId: book.id, characterId: contact.id })
        const count = await getUnanalysedCount()
        if (shouldAutoAnalyse(count)) await runRelationshipAnalysis(book, book.id)
      }

      // 日历事件
      if (result.calendarEvent) {
        pendingCalendarEvent.value = { ...result.calendarEvent, contactName: contact.name }
        showCalendarEventModal.value = true
      }

      // 文件（三阶段流程）
      if (result.sendFileIntent) {
        console.log('[sms-file] sendFileIntent detected, baseDir:', customPrintableBaseDir.value)
        const thread = smsThreads.value[contact.id] || []
        const history = thread.slice(-8).map(m => ({ role: m.role || (m.msgType === 'voice' ? 'assistant' : 'user'), text: m.text || '' }))
        const fileResult = await generatePhoneSmsFile({
          contact: { id: contact.id, name: contact.name, identity: contact.identity || contact.nickname || '' },
          worldBook: book || { id: contact.worldBookId, title: contact.worldBookTitle, characters: [] },
          history,
          customBaseDir: customPrintableBaseDir.value,
        })
        console.log('[sms-file] result:', fileResult.success ? 'OK' : fileResult.error)
        if (fileResult.success) {
          const templateHtml = await loadPrintableTemplate(fileResult.fileType, fileResult.fileName)
          const fileMsg = {
            id: `sms_file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            role: 'assistant',
            msgType: 'file',
            fileName: fileResult.fileName,
            fileType: fileResult.fileType,
            fileVariables: fileResult.variables,
            fileTemplateHtml: templateHtml,
            timestamp: new Date().toISOString(),
          }
          thread.push(fileMsg)
          smsThreads.value[contact.id] = thread
          await saveSmsThreads(smsThreads.value)
        }
      }

      // 红包
      if (result.redPacket && result.redPacket.amount) {
        const rp = await economy.createRedPacket(contact.id, contact.name, result.redPacket.amount, result.redPacket.blessing || '给你一个小惊喜~')
        const thread = smsThreads.value[contact.id] || []
        thread.push({
          id: `sms_rp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          msgType: 'redPacket',
          redPacketId: rp.id,
          redPacket: { amount: rp.amount, blessing: rp.blessing, senderName: rp.senderName, isOpened: false },
          timestamp: new Date().toISOString(),
        })
        smsThreads.value[contact.id] = thread
        await saveSmsThreads(smsThreads.value)
      }

      // 角色回礼
      if (result.giftToPlayer && result.giftToPlayer.itemName) {
        const returnGift = await economy.recordGiftReturn(contact.name, result.giftToPlayer.itemName, result.giftToPlayer.message || '')
        const thread = smsThreads.value[contact.id] || []
        thread.push({
          id: `sms_gift_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          msgType: 'giftReturn',
          giftReturn: { itemName: returnGift.name, icon: returnGift.icon, fromName: contact.name, message: returnGift.senderReply?.text || '' },
          timestamp: new Date().toISOString(),
        })
        smsThreads.value[contact.id] = thread
        await saveSmsThreads(smsThreads.value)
        // 显示回礼弹窗
        showGiftReturnToast.value = returnGift
        setTimeout(() => { showGiftReturnToast.value = null }, 4000)
      }
    }
  } catch (e) {
    console.warn('[PhoneSmsApp] 发送短信失败:', e)
  } finally {
    smsLoading.value = false
  }
}

// ===== 日历事件 =====
async function handleImportCalendarEvent() {
  if (!pendingCalendarEvent.value) return
  calendarEventImporting.value = true
  try {
    const saved = await addCalendarEvent(pendingCalendarEvent.value)
    const icsContent = generateIcsContent(pendingCalendarEvent.value)
    const fileName = `event_${saved.id}.ics`
    await openCalendarImport(icsContent, fileName)
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
  await addCalendarEvent({ ...pendingCalendarEvent.value, status: 'dismissed' })
  showCalendarEventModal.value = false
  pendingCalendarEvent.value = null
}

// ===== 群聊 =====
function selectGroup(group) {
  selectedGroup.value = group
  groupDraft.value = ''
  nextTick(() => scrollToBottom())
}

function openNpcThread(thread) {
  selectedNpcThread.value = thread
  showNpcThreadViewer.value = true
}

function closeNpcThreadViewer() {
  showNpcThreadViewer.value = false
  selectedNpcThread.value = null
}

async function handleSendGroupMessage() {
  const text = groupDraft.value.trim()
  if (!text || !selectedGroup.value || groupLoading.value) return
  const group = selectedGroup.value
  groupDraft.value = ''

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
    let members = group.members || []
    if (group.type === 'custom') {
      const wbCache = {}
      members = members.map(m => {
        if (!m.worldBookId) return m
        if (!wbCache[m.worldBookId]) wbCache[m.worldBookId] = getWorldBookById(m.worldBookId)
        return m
      })
      const wbSummaries = {}
      for (const wbId of Object.keys(wbCache)) {
        const wb = await wbCache[wbId]
        if (wb) wbSummaries[wbId] = String(wb.summary || wb.entries?.overview || '').trim()
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

    const effectiveUser = {
      name: playerState.username || '玩家',
      avatar: playerState.avatar || null,
    }

    const memberPrivateChats = {}
    for (const member of members) {
      const contactId = member.contactId || member.id
      if (contactId && smsThreads.value[contactId]) {
        const pt = smsThreads.value[contactId].slice(-10).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          text: msg.text,
        }))
        if (pt.length > 0) memberPrivateChats[member.contactName || member.name] = pt
      }
    }

    // 加载世界记忆
    const bookId = book?.id || group.worldBookId || 'default_world_book'
    const worldMemories = await useWorldMemoryStore().get(bookId)

    // 加载群成员关系数据
    const memberRelationships = {}
    for (const member of members) {
      const contactId = member.contactId || member.id
      try {
        const relData = rel.getCharacter(contactId)
        if (rel) {
          memberRelationships[contactId] = {
            favor: rel.favor,
            trust: rel.trust,
            stance: rel.stance,
            level: rel.level,
          }
        }
      } catch { /* 忽略 */ }
    }

    const result = await generateGroupChatReply({
      worldBook: book || null,
      members,
      groupType: group.type,
      userMessage: text,
      history,
      contextMessages: smsContextMessages.value,
      effectiveUser,
      memberPrivateChats,
      worldMemories,
      memberRelationships,
      options: { maxTokens: 800 },
    })

    if (result.success && result.replies?.length > 0) {
      for (const reply of result.replies) {
        if (reply && reply.text && reply.text.trim()) {
          addGroupChatMessage(groupThreads.value, group.id, 'assistant', reply.text.trim(), reply.authorName || '角色', reply.authorId || '')
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

// ===== @ 提及 =====
function onGroupDraftInput(e) {
  const text = groupDraft.value
  const cursor = e.target.selectionStart
  if (cursor === null || cursor === undefined) return
  const beforeCursor = text.slice(0, cursor)
  const lastAt = beforeCursor.lastIndexOf('@')
  if (lastAt >= 0) {
    const afterAt = beforeCursor.slice(lastAt + 1)
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
    groupDraft.value = text.slice(0, atPos) + mentionText + text.slice(atPos + mentionFilter.value.length + 1)
  } else {
    groupDraft.value += mentionText
  }
  showMentionDropdown.value = false
  nextTick(() => {
    const input = document.querySelector('.sms-input')
    if (input) input.focus()
  })
}

// ===== 创建群聊 =====
function handleCreateGroup() {
  if (!createGroupName.value.trim() || createGroupMembers.value.length < 2) return
  const newGroup = createCustomGroup({
    name: createGroupName.value.trim(),
    members: [...createGroupMembers.value],
  })
  groupChats.value = [newGroup, ...groupChats.value]
  saveGroupChats(groupChats.value)
  createGroupName.value = ''
  createGroupMembers.value = []
  showCreateGroup.value = false
  selectGroup(newGroup)
  activeTab.value = 'group'
}

// ===== 群聊管理 =====
function deleteGroup(group) {
  if (group.type === 'worldbook') return
  groupChats.value = groupChats.value.filter(g => g.id !== group.id)
  saveGroupChats(groupChats.value)
  delete groupThreads.value[group.id]
  saveGroupThreads(groupThreads.value)
  if (selectedGroup.value?.id === group.id) selectedGroup.value = null
  showGroupInfo.value = false
}

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
  if (idx >= 0) members.splice(idx, 1)
  else members.push(member)
  const gIdx = groupChats.value.findIndex(g => g.id === selectedGroup.value.id)
  if (gIdx >= 0) groupChats.value[gIdx].members = [...members]
  saveGroupChats(groupChats.value)
}

function getGroupSenderAvatar(senderId) {
  const contact = findContactById(senderId)
  if (!contact) return null
  return getCharAvatar(contact)
}

// ===== 头像裁剪 =====
function onAvatarPointerDown(e, char) {
  e.preventDefault()
  clearLongPressTimer()
  longPressTimer = setTimeout(() => {
    openAvatarCropForChar(char)
    clearLongPressTimer()
  }, 1000)
}

function onAvatarPointerUp() { clearLongPressTimer() }
function onAvatarPointerLeave() { clearLongPressTimer() }

function clearLongPressTimer() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
}

function triggerAvatarFileInput() {
  const input = document.getElementById('sms-avatar-file-input')
  if (input) input.click()
}

function handleAvatarFileSelect(e) {
  const file = e.target.files?.[0]
  if (!file || !pendingAvatarChar.value) return
  pendingAvatarFile.value = file
  e.target.value = ''
  showAvatarCrop.value = true
  nextTick(() => {
    if (cropModalRef.value) cropModalRef.value.loadImage(file)
  })
}

async function handleAvatarCropConfirm(croppedDataUrl) {
  if (!pendingAvatarChar.value) return
  const { charId, worldBookId } = pendingAvatarChar.value
  showAvatarCrop.value = false
  try {
    const books = await loadWorldBooks()
    const book = books.find(b => b.id === worldBookId)
    if (!book) return
    const char = book.characters?.find(c => c.id === charId)
    if (!char) return
    char.smsAvatar = croppedDataUrl
    char.updatedAt = new Date().toISOString()
    await persistWorldBooks(books)
    clearWorldBookCache()
    const contact = findContactById(charId)
    if (contact) contact.smsAvatar = croppedDataUrl
    if (selectedContact.value?.id === charId) selectedContact.value.smsAvatar = croppedDataUrl
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

// ===== 关系网分析 =====
let isRelationshipAnalysing = false

async function runRelationshipAnalysis(worldBook, worldBookId) {
  if (isRelationshipAnalysing) return
  isRelationshipAnalysing = true
  try {
    const allBooks = await loadWorldBooks()
    const book = allBooks.find(b => b.id === worldBookId)
    if (!book) return
    const archive = await getDialogueArchive()
    const recentDialogue = archive.slice(-140)
    const result = await generateRelationshipAnalysis({
      worldBook: book,
      recentDialogue,
      existingRelationships: book.relationships || {},
    })
    if (result.success) {
      book.relationships = result.relationships
      book.updatedAt = new Date().toISOString()
      await persistWorldBooks(allBooks)
      await kvStorage.set('dialogue_archive', [])
    }
  } catch (e) {
    console.warn('[PhoneSmsApp] 关系分析失败:', e)
  } finally {
    isRelationshipAnalysing = false
  }
}

// ===== 可打印文件 =====
async function loadPrintableTemplate(fileType, _fileName) {
  try {
    if (customPrintableBaseDir.value && customPrintableBaseDir.value.startsWith('native://')) {
      const { readPrintableFile } = await import('../../../../src/services/printableConfigService.js')
      const content = await readPrintableFile(customPrintableBaseDir.value, `${fileType}/index.html`)
      return content
    }
    const res = await fetch(`./data/printables/${fileType}/index.html`)
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function openFilePreview(fileMsg) {
  selectedFile.value = {
    fileName: fileMsg.fileName,
    fileType: fileMsg.fileType,
    variables: fileMsg.fileVariables,
    templateHtml: fileMsg.fileTemplateHtml,
  }
  showFilePreview.value = true
}

function closeFilePreview() {
  selectedFile.value = null
  showFilePreview.value = false
}

// ===== 初始化 =====
onMounted(async () => {
  // 迁移旧手机零钱到全局金币
  economy.migrateOldBalance()
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
  bubbleCss.value = savedCss || DEFAULT_BUBBLE_CSS
  // 初始化时立即应用气泡CSS（无论是保存的还是默认的）
  applyBubbleCss(bubbleCss.value)
  smsContextMessages.value = smsSettings.contextMessages ?? 8
  smsMaxTokens.value = smsSettings.maxTokens ?? 2000
  groupChats.value = await ensureWorldBookGroups(groups)
  groupThreads.value = groupThreadsData

  // 加载 NPC 短信
  const books = await loadWorldBooks()
  for (const book of books) {
    const threads = await loadNpcSmsThreads(book.id)
    npcSmsThreads.value.push(...threads)
  }

  // 初始化时加载已配置的可打印文件目录
  const savedPrintableDir = await getPrintableDir()
  if (savedPrintableDir) {
    customPrintableBaseDir.value = savedPrintableDir
  }

  // 加载查岗设置
  const [scEnabled, scMin, scMax, scWhitelist] = await Promise.all([
    kvStorage.get('spot_check_voice_enabled'),
    kvStorage.get('spot_check_min_min'),
    kvStorage.get('spot_check_max_min'),
    kvStorage.get('spot_check_whitelist'),
  ])
  spotCheckEnabled.value = (scEnabled !== undefined && scEnabled !== null) ? !!scEnabled : true
  spotCheckMinMin.value = (scMin !== undefined && scMin !== null) ? scMin : 40
  spotCheckMinMax.value = (scMax !== undefined && scMax !== null) ? scMax : 90
  spotCheckWhitelist.value = (scWhitelist !== undefined && scWhitelist !== null) ? scWhitelist : []
})

// ===== 监听来电（语音通话） =====
watch(pendingVoiceCall, async (contact) => {
  if (contact && contact.id && !showVoiceCall.value) {
    const allChars = contacts.value.flatMap(g => g.characters || [])
    const found = allChars.find(c => c.id === contact.id)
    if (found) {
      selectedContact.value = found
      voiceCallIncoming.value = true
      showVoiceCall.value = true
    }
    pendingVoiceCall.value = null
  }
}, { immediate: true })

// ===== 监听 Reader 分享转发 =====
watch(pendingSmsShare, async (shareInfo) => {
  console.log('[PhoneSmsApp] pendingSmsShare watch fired:', shareInfo)
  if (!shareInfo?.contact) return
  const { contact, shareData } = shareInfo

  console.log('[PhoneSmsApp] contacts count:', contacts.value?.length || 0, 'smsThreads count:', Object.keys(smsThreads.value || {}).length)

  // 等待 contacts/smsThreads 初始化完成
  if (!contacts.value || contacts.value.length === 0) {
    console.log('[PhoneSmsApp] contacts 未初始化，等待中...')
    await new Promise(resolve => {
      const stopWatch = watch(
        () => contacts.value?.length,
        (len) => {
          if (len > 0) { stopWatch(); resolve() }
        },
      )
      setTimeout(() => { stopWatch(); resolve() }, 5000)
    })
    console.log('[PhoneSmsApp] contacts 初始化完成:', contacts.value.length)
  }

  // 1. 直接使用该角色，不再去 contacts 里找（避免异步等待导致时序问题）
  const allChars = contacts.value.flatMap(g => g.characters || [])
  const found = allChars.find(c => c.id === contact.id)
  if (found) {
    console.log('[PhoneSmsApp] found contact in list:', found.name)
    await selectContact(found)
  } else {
    console.log('[PhoneSmsApp] using raw contact:', contact.name)
    selectedContact.value = contact
    smsDraft.value = ''
    chatBgUrl.value = contact?.smsBg || ''
    nextTick(() => scrollToBottom())
  }

  // 2. 插入 shareCard 消息（根据分享类型构建不同数据）
  const isBrowserShare = shareData?.type === 'browser_share'
  const shareMsg = {
    id: `sms_sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    role: 'user',
    msgType: 'shareCard',
    text: isBrowserShare
      ? `[分享了网页《${shareData.title}》：${shareData.url}]`
      : `[分享了《${shareData.storyTitle}》的内容：${shareData.excerpt?.substring(0, 100)}...]`,
    shareCard: isBrowserShare
      ? {
          storyTitle: shareData.title || '未知网页',
          chapterTitle: '',
          excerpt: shareData.excerpt || '',
          storyId: '',
          chapterIndex: -1,
          sourceUrl: shareData.url || '',
          shareType: 'browser',
        }
      : {
          storyTitle: shareData.storyTitle,
          chapterTitle: shareData.chapterTitle || '',
          excerpt: shareData.excerpt || '',
          storyId: shareData.storyId || '',
          chapterIndex: shareData.chapterIndex ?? -1,
          shareType: 'book',
        },
    timestamp: new Date().toISOString(),
  }

  console.log('[PhoneSmsApp] inserting shareCard for:', contact.id)
  const thread = smsThreads.value[contact.id] || []
  thread.push(shareMsg)
  smsThreads.value[contact.id] = thread
  await saveSmsThreads(smsThreads.value)

  // 2.5 浏览器分享：生成档案卡片
  let generatedArchive = null
  if (isBrowserShare) {
    try {
      const book = await getWorldBookById(contact.worldBookId)
      const archiveResult = await generateArchiveCard({
        title: shareData.title,
        url: shareData.url,
        excerpt: shareData.excerpt,
        worldBookTitle: book?.title || '',
        contactName: contact.name,
      })
      if (archiveResult.success) {
        const saveResult = await addArchiveCard({
          ...archiveResult.card,
          sourceUrl: shareData.url,
          excerpt: shareData.excerpt,
          sharedWithChar: contact.name,
        })
        if (saveResult.success) {
          generatedArchive = saveResult.card
          console.log('[PhoneSmsApp] Archive card generated:', generatedArchive.title)
        }
      } else {
        console.warn('[PhoneSmsApp] generateArchiveCard failed:', archiveResult.error)
      }
    } catch (e) {
      console.error('[PhoneSmsApp] Archive card generation error:', e)
    }
  }

  // 2.6 检查成就
  try {
    const archiveStats = await getArchiveStats()
    const shareCount = (await kvStorage.get('browser_share_count_v1')) || 0
    const newCount = shareCount + (isBrowserShare ? 1 : 0)
    await kvStorage.set('browser_share_count_v1', newCount)

    const newlyUnlocked = await checkAchievements(archiveStats, newCount)
    for (const ach of newlyUnlocked) {
      console.log('[PhoneSmsApp] Achievement unlocked:', ach.name)
      // 插入成就通知消息到SMS线程
      const achMsg = {
        id: `sms_ach_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'system',
        msgType: 'achievement',
        text: `🏆 成就解锁：${ach.name} - ${ach.description}`,
        achievement: ach,
        timestamp: new Date().toISOString(),
      }
      const thread = smsThreads.value[contact.id] || []
      thread.push(achMsg)
      smsThreads.value[contact.id] = thread
      await saveSmsThreads(smsThreads.value)
    }
  } catch (e) {
    console.warn('[PhoneSmsApp] Achievement check error:', e)
  }

  // 3. 触发 LLM 回复
  smsLoading.value = true
  try {
    await triggerReplyForShareCard(shareMsg, contact, generatedArchive)
    console.log('[PhoneSmsApp] shareCard reply done')
  } catch (e) {
    console.warn('[PhoneSmsApp] shareCard 回复失败:', e)
  } finally {
    smsLoading.value = false
  }

  // 4. 清除 pending
  pendingSmsShare.value = null
}, { immediate: true })

async function triggerReplyForShareCard(shareMsg, contact, generatedArchive) {
  const book = await getWorldBookById(contact.worldBookId)
  const contactForLlm = {
    id: contact.id,
    name: contact.name,
    identity: contact.identity || contact.nickname || '',
  }

  const isBrowserShare = shareMsg.shareCard.shareType === 'browser'

  // 构建 forwardedClues
  const excerpt = shareMsg.shareCard.excerpt || ''
  const forwardedClues = [isBrowserShare
    ? {
        sourceType: '网页分享',
        title: shareMsg.shareCard.storyTitle,
        summary: excerpt.length > 500 ? excerpt.substring(0, 500) + '...' : excerpt,
        tags: shareMsg.shareCard.sourceUrl ? [shareMsg.shareCard.sourceUrl] : [],
        ...(generatedArchive ? {
          archiveCard: {
            title: generatedArchive.title,
            category: generatedArchive.category,
            rarity: generatedArchive.rarity,
            summary: generatedArchive.summary,
          },
        } : {}),
      }
    : {
        sourceType: '书籍分享',
        title: `${shareMsg.shareCard.storyTitle}${shareMsg.shareCard.chapterTitle ? ' · ' + shareMsg.shareCard.chapterTitle : ''}`,
        summary: excerpt.length > 500 ? excerpt.substring(0, 500) + '...' : excerpt,
        tags: book ? [book.title] : [],
      }
  ]

  // 获取短信历史
  const thread = getSmsThread(smsThreads.value, contact.id)
  const history = thread.slice(-smsContextMessages.value).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    text: m.text,
  }))

  // 加载世界记忆
  const bookId = book?.id || contact.worldBookId
  const worldMemories = await useWorldMemoryStore().get(bookId)

  // 加载关系数据
  let relationshipSnapshot = null
  try {
    const relData = rel.getCharacter(contact.id)
    if (rel) {
      relationshipSnapshot = {
        [contact.id]: {
          favor: rel.favor,
          trust: rel.trust,
          stance: rel.stance,
          level: rel.level,
        },
      }
    }
  } catch { /* 忽略 */ }

  const userMessage = isBrowserShare
    ? `[分享] 玩家给你分享了一个网页《${shareMsg.shareCard.storyTitle}》(${shareMsg.shareCard.sourceUrl})`
    : `[分享] 玩家给你分享了一段来自《${shareMsg.shareCard.storyTitle}》${shareMsg.shareCard.chapterTitle ? '· ' + shareMsg.shareCard.chapterTitle : ''}的内容`

  const result = await generatePhoneSmsReply({
    worldBook: book || { id: contact.worldBookId, title: contact.worldBookTitle, characters: [] },
    contact: contactForLlm,
    userMessage,
    history,
    worldMemories,
    relationshipSnapshot,
    forwardedClues,
    options: { historyLimit: smsContextMessages.value, maxTokens: smsMaxTokens.value },
  })

  if (result.success && result.replies?.length > 0) {
    for (const reply of result.replies) {
      if (reply && reply.trim()) {
        addSmsMessage(smsThreads.value, contact.id, 'assistant', reply.trim())
      }
    }
    await saveSmsThreads(smsThreads.value)
  }

  nextTick(() => scrollToBottom())
}
</script>

<template>
  <div class="sms-app">
    <!-- ====== 列表视图 ====== -->
    <template v-if="!selectedContact && !selectedGroup">
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="emit('back')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="phone-app-title">短信</h2>
        <div class="phone-app-header-spacer" />
      </div>

      <SmsContactList
        :contacts="contacts"
        :group-chats="groupChats"
        v-model:active-tab="activeTab"
        :npc-sms-threads="npcSmsThreads"
        :get-last-message="getLastMessage"
        :get-last-group-message="getLastGroupMessage"
        :get-online-status-for-char="getOnlineStatusForChar"
        :format-sms-time="formatSmsTime"
        :get-char-avatar="getCharAvatar"
        :get-group-member-count="getGroupMemberCount"
        @select-contact="selectContact"
        @select-group="selectGroup"
        @create-group="showCreateGroup = true"
        @open-npc-thread="openNpcThread"
        @avatar-pointer-down="onAvatarPointerDown"
        @avatar-pointer-up="onAvatarPointerUp"
        @avatar-pointer-leave="onAvatarPointerLeave"
      />
    </template>

    <!-- ====== 创建群聊 ====== -->
    <SmsCreateGroup
      v-if="showCreateGroup"
      :contacts="contacts"
      v-model:group-name="createGroupName"
      v-model:members="createGroupMembers"
      v-model:expanded-wb="createGroupExpandedWb"
      @close="showCreateGroup = false"
      @create="handleCreateGroup"
    />

    <!-- ====== 私聊线程 ====== -->
    <SmsPrivateThread
      ref="privateThreadRef"
      v-else-if="selectedContact"
      :contact="selectedContact"
      :thread-messages="threadMessages"
      v-model:draft="smsDraft"
      :loading="smsLoading"
      v-model:show-plus-panel="showPlusPanel"
      v-model:show-sticker-panel="showStickerPanel"
      :chat-bg-url="chatBgUrl"
      :char-avatar="getCharAvatar(selectedContact)"
      :user-avatar="getUserAvatar()"
      :playing-voice-id="playingVoiceId"
      :voice-shown-text="voiceShownText"
      :online-status="getOnlineStatusForChar(selectedContact)"
      @back="goBack"
      @send="handleSendSms"
      @toggle-plus="(val) => { if (val !== undefined) showPlusPanel = val; else showPlusPanel = !showPlusPanel }"
      @toggle-sticker="showStickerPanel = !showStickerPanel"
      @open-settings="showBubbleSettings = true"
      @open-gift-shop="openGiftShop"
      @plus-action="handlePlusAction"
      @play-voice="playVoiceMessage"
      @voice-long-press="startVoiceLongPress"
      @voice-long-release="cancelVoiceLongPress"
      @avatar-pointer-down="onAvatarPointerDown"
      @avatar-pointer-up="onAvatarPointerUp"
      @avatar-pointer-leave="onAvatarPointerLeave"
      @red-packet-click="handleRedPacketClick"
      @open-file="openFilePreview"
      @call-video="(c) => emit('call-video', c)"
    />

    <!-- ====== 表情包面板 ====== -->
    <SmsStickerPanel
      v-if="showStickerPanel"
      :stickers="smsTools.getAvailableStickers(selectedContact)"
      :show-import="showStickerImport"
      v-model:import-text="stickerImportText"
      @close="showStickerPanel = false"
      @toggle-import="showStickerImport = !showStickerImport"
      @import="handleStickerImport"
      @insert="(desc) => { smsDraft += '[sticker:' + desc + ']'; showStickerPanel = false }"
    />

    <!-- ====== 红包/礼物 ====== -->
    <PhoneRedPacketModal
      v-if="showRedPacketModal && activeRedPacket"
      :red-packet="activeRedPacket.redPacket"
      :on-open="handleRedPacketOpen"
      @close="handleRedPacketClose"
    />

    <PhoneGiftShop
      v-if="showGiftShop"
      :economy="economy"
      @back="showGiftShop = false"
      @gift-sent="handleGiftSent"
    />

    <!-- ====== 语音通话 ====== -->
    <SmsVoiceCall
      v-if="showVoiceCall && selectedContact"
      :contact="selectedContact"
      :standee-url="selectedContact?.portraits?.[0]?.filePath || null"
      :incoming-call="voiceCallIncoming"
      @hangup="showVoiceCall = false; voiceCallIncoming = false"
    />

    <!-- ====== 群聊线程 ====== -->
    <SmsGroupThread
      ref="groupThreadRef"
      v-else-if="selectedGroup"
      :group="selectedGroup"
      :thread-messages="groupThreadMessages"
      v-model:draft="groupDraft"
      :loading="groupLoading"
      :show-mention-dropdown="showMentionDropdown"
      :mentionable-members="getFilteredMentions()"
      :group-sender-avatar="getGroupSenderAvatar"
      :member-count="getGroupMemberCount(selectedGroup)"
      @back="goBack"
      @send="handleSendGroupMessage"
      @input="onGroupDraftInput"
      @insert-mention="insertMention"
      @open-info="openGroupInfo"
    />

    <!-- ====== 群聊信息 ====== -->
    <SmsGroupInfo
      v-if="showGroupInfo && selectedGroup"
      :group="selectedGroup"
      :contacts="contacts"
      :show-manage-members="showManageMembers"
      v-model:expanded-wb="manageExpandedWb"
      @close="showGroupInfo = false"
      @toggle-manage="toggleManageMembers"
      @toggle-member="toggleGroupMember"
      @delete-group="deleteGroup(selectedGroup)"
    />

    <!-- ====== 设置 ====== -->
    <SmsBubbleSettings
      v-if="showBubbleSettings"
      :bubble-css="bubbleCss"
      v-model:chat-bg-url="chatBgUrl"
      v-model:chat-bg-url-input="chatBgUrlInput"
      v-model:context-messages="smsContextMessages"
      v-model:sms-max-tokens="smsMaxTokens"
      :bubble-css-file="bubbleCssFile"
      :spot-check-enabled="spotCheckEnabled"
      :spot-check-min-min="spotCheckMinMin"
      :spot-check-min-max="spotCheckMinMax"
      :spot-check-whitelist="spotCheckWhitelist"
      :all-contacts="allContacts"
      :selected-contact="selectedContact"
      @close="showBubbleSettings = false"
      @save-settings="handleSaveSettings"
      @save-bg="handleBgSave"
      @save-spot-check="handleSaveSpotCheck"
      @update:spot-check-enabled="spotCheckEnabled = $event"
      @update:spot-check-min-min="spotCheckMinMin = $event"
      @update:spot-check-min-max="spotCheckMinMax = $event"
      @update:spot-check-whitelist="spotCheckWhitelist = $event"
      @reset-css="handleResetBubbleCss"
      @import-css="handleImportCssFile"
      @bg-file-select="handleBgFileSelect"
      @bg-url-import="handleBgUrlImport"
      @bg-clear="handleBgClear"
      @import-event-pool="handleImportEventPool"
      @export-event-pool="handleExportEventPool"
    />

    <!-- ====== 日历事件 ====== -->
    <SmsCalendarModal
      :pending-event="pendingCalendarEvent"
      :importing="calendarEventImporting"
      @dismiss="handleDismissCalendarEvent"
      @import="handleImportCalendarEvent"
    />

    <!-- NPC 短信查看器 -->
    <NpcSmsThread
      v-if="selectedNpcThread"
      :visible="showNpcThreadViewer"
      :thread="selectedNpcThread"
      @close="closeNpcThreadViewer"
    />

    <!-- 文件预览 -->
    <SmsFilePreview
      :visible="showFilePreview"
      :file="selectedFile"
      @close="closeFilePreview"
    />

    <!-- ====== 可打印文件配置底部弹窗 ====== -->
    <div v-if="showPrintableConfig" class="printable-config-overlay" @click.self="closePrintableConfig">
      <div class="printable-config-panel">
        <div class="panel-header">
          <h3 class="panel-title">文件模板配置</h3>
          <button type="button" class="panel-close" @click="closePrintableConfig">&times;</button>
        </div>
        <div class="panel-body">
          <div class="config-section">
            <p class="config-desc">选择一个包含文件模板的文件夹，用于生成短信中的可打印文件。</p>
            <button
              type="button"
              class="config-import-btn"
              @click="handleImportPrintableFolder"
              :disabled="printableConfigLoading"
            >
              {{ printableConfigLoading ? '导入中...' : '📁 导入文件夹' }}
            </button>
          </div>
          <div class="config-section">
            <label class="config-label">手动输入路径</label>
            <div class="config-input-row">
              <input
                v-model="printableConfigInput"
                class="config-input"
                placeholder="./data/printables 或 native://..."
              />
              <button
                type="button"
                class="config-save-btn"
                @click="handleSavePrintablePath"
                :disabled="printableConfigLoading"
              >保存</button>
            </div>
          </div>
          <div class="config-section">
            <button type="button" class="config-reset-btn" @click="handleResetPrintablePath">恢复默认</button>
          </div>
          <div v-if="printableConfigStatus === 'success'" class="config-success">✓ 配置已保存</div>
          <div v-if="printableConfigStatus === 'error'" class="config-error">✗ 操作失败，请重试</div>
          <div class="config-hint">
            当前：{{ customPrintableBaseDir || '默认 (./data/printables)' }}
          </div>
        </div>
      </div>
    </div>

    <!-- ====== Toast 提示 ====== -->
    <div v-if="printableConfigToast" class="printable-toast">{{ printableConfigToast }}</div>

    <!-- ====== 礼物回礼弹窗 ====== -->
    <Transition name="gift-return-toast">
      <div v-if="showGiftReturnToast" class="gift-return-toast" @click="showGiftReturnToast = null">
        <div class="gift-return-toast-card">
          <div class="grt-icon">{{ showGiftReturnToast.icon }}</div>
          <div class="grt-content">
            <div class="grt-label">收到回礼</div>
            <div class="grt-name">{{ showGiftReturnToast.itemName }}</div>
            <div class="grt-message">{{ showGiftReturnToast.message || '来自 ' + showGiftReturnToast.fromName }}</div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ====== 头像裁剪 ====== -->
    <input
      id="sms-avatar-file-input"
      type="file"
      accept="image/png,image/jpeg,image/webp"
      style="display: none;"
      @change="handleAvatarFileSelect"
    />

    <AvatarCropModal
      ref="cropModalRef"
      :is-open="showAvatarCrop"
      @close="handleAvatarCropClose"
      @confirm="handleAvatarCropConfirm"
    />
  </div>
</template>

<style scoped>
/* ===== 公共基础 ===== */
.phone-app-header {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  padding-top: max(14px, var(--safe-area-inset-top, 14px));
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
}

.phone-app-back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: #333;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 12px;
  transition: all 0.2s ease;
}

.phone-app-back-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #111;
}

.phone-app-back-btn:active {
  transform: scale(0.95);
}

.phone-app-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #222;
  flex: 1;
  text-align: center;
  letter-spacing: 0.5px;
}

.phone-app-header-spacer {
  width: 60px;
}

.sms-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
  background: linear-gradient(180deg, #fff5f9 0%, #fef0ff 50%, #f0f4ff 100%);
}

.phone-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  font-size: 0.82rem;
  color: #bbb;
}

.loading-spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2.5px solid rgba(0, 0, 0, 0.08);
  border-top-color: #ff8fab;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 8px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 气泡基础布局样式（不覆盖颜色/背景，让自定义CSS生效） */
:deep(.sms-bubble) {
  word-wrap: break-word;
  max-width: 75%;
}

:deep(.sms-messages) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 10px 8px;
}

/* ===== 可打印文件配置底部弹窗 ===== */
.printable-config-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  animation: printable-fade-in 0.2s ease;
}

@keyframes printable-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.printable-config-panel {
  width: 100%;
  max-width: 500px;
  max-height: 70vh;
  background: #2c2c2e;
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: printable-slide-up 0.25s ease;
}

@keyframes printable-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-title {
  font-size: 17px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.panel-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 24px;
  cursor: pointer;
  padding: 0 4px;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.config-section {
  margin-bottom: 16px;
}

.config-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 12px;
}

.config-import-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  background: rgba(10, 132, 255, 0.2);
  color: #6db3f2;
}

.config-import-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.config-label {
  display: block;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 6px;
}

.config-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.config-input {
  flex: 1;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  outline: none;
}

.config-input:focus {
  border-color: rgba(10, 132, 255, 0.4);
}

.config-save-btn {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: rgba(10, 132, 255, 0.3);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

.config-save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.config-reset-btn {
  padding: 10px 16px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  cursor: pointer;
}

.config-reset-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.config-success {
  padding: 8px 12px;
  background: rgba(52, 199, 89, 0.15);
  border-radius: 8px;
  color: #34c759;
  font-size: 13px;
  text-align: center;
}

.config-error {
  padding: 8px 12px;
  background: rgba(255, 59, 48, 0.15);
  border-radius: 8px;
  color: #ff6b6b;
  font-size: 13px;
  text-align: center;
}

.config-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
  text-align: center;
}

.printable-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 13px;
  z-index: 10001;
  background: rgba(52, 199, 89, 0.9);
  color: #fff;
  white-space: nowrap;
  animation: printable-fade-in 0.2s ease;
}


  .platform-android.android-portrait .panel-close,
  .platform-android.android-portrait .config-save-btn,
  .platform-android.android-portrait .config-reset-btn
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

/* ===== 礼物回礼弹窗 ===== */
.gift-return-toast {
  position: fixed;
  top: max(60px, var(--safe-area-inset-top, 60px));
  left: 16px;
  right: 16px;
  z-index: 10020;
  display: flex;
  justify-content: center;
}

.gift-return-toast-card {
  background: linear-gradient(135deg, #fff8e8, #fef0d5);
  border: 1px solid rgba(243, 156, 18, 0.2);
  border-radius: 16px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 8px 32px rgba(243, 156, 18, 0.2);
  max-width: 340px;
  cursor: pointer;
  animation: gift-toast-slide-in 0.4s ease;
}

@keyframes gift-toast-slide-in {
  from { opacity: 0; transform: translateY(-20px) scale(0.9); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.gift-return-toast-enter-active,
.gift-return-toast-leave-active {
  transition: all 0.3s ease;
}

.gift-return-toast-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.9);
}

.gift-return-toast-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

.grt-icon {
  font-size: 36px;
  flex-shrink: 0;
  animation: gift-icon-bounce 0.6s ease;
}

@keyframes gift-icon-bounce {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}

.grt-content {
  flex: 1;
  min-width: 0;
}

.grt-label {
  font-size: 11px;
  font-weight: 700;
  color: #e67e22;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}

.grt-name {
  font-size: 14px;
  font-weight: 600;
  color: #4a3728;
  margin-bottom: 2px;
}

.grt-message {
  font-size: 11px;
  color: #a08060;
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

