<script setup>
/**
 * 默认手机组件
 * 支持通讯录与短信（短信可调用 LLM 生成角色回复）
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { kvStorage } from '../storage/index.js'
import {
  generatePhoneMomentsBatchReplies,
  generatePhoneMomentsReplies,
  generatePhoneSmsReply,
} from '../llm/index.js'

const props = defineProps({
  worldBook: {
    type: Object,
    default: null,
  },
  saveSlotId: {
    type: [String, Number],
    default: '',
  },
  dialogueHistory: {
    type: Array,
    default: () => [],
  },
  currentLine: {
    type: Object,
    default: null,
  },
})

const PHONE_POSITION_STORAGE_KEY = 'phone-position'
const SMS_STORAGE_PREFIX = 'phone-sms-threads'
const MOMENTS_STORAGE_PREFIX = 'phone-moments-feed'

const FALLBACK_CONTACTS = [
  { id: 'fallback_mom', name: '妈妈', subtitle: '138-0000-0001' },
  { id: 'fallback_dad', name: '爸爸', subtitle: '138-0000-0002' },
  { id: 'fallback_xiaoming', name: '小明', subtitle: '139-1111-2222' },
]

const apps = [
  { id: 'phone', name: '电话', icon: '📞', color: '#4CAF50' },
  { id: 'messages', name: '短信', icon: '💬', color: '#2196F3' },
  { id: 'moments', name: '朋友圈', icon: '🫧', color: '#18b887' },
]

const isPhoneVisible = ref(false)
const currentApp = ref(null)
const phonePluginRef = ref(null)
const messagesThreadRef = ref(null)

const getDefaultPhonePosition = () => {
  if (typeof window === 'undefined') {
    return { x: 20, y: 20 }
  }
  return { x: Math.max(8, window.innerWidth - 80), y: Math.max(8, window.innerHeight - 160) }
}

const phonePosition = ref(getDefaultPhonePosition())
const isDragging = ref(false)
const dragStartPos = ref({ x: 0, y: 0 })
const phoneStartPos = ref({ x: 0, y: 0 })
const dragMoved = ref(false)
const activePointerId = ref(null)
const pointerCaptureTarget = ref(null)

const currentTime = ref(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
let timeInterval = null

const createAvatarText = (name) => {
  const value = String(name || '').trim()
  if (!value) return '#'
  return value.slice(0, 1)
}

const contacts = computed(() => {
  const worldCharacters = Array.isArray(props.worldBook?.characters) ? props.worldBook.characters : []
  const seen = new Set()
  const mapped = []

  worldCharacters.forEach((char, index) => {
    const id = String(char?.id || `char_${index + 1}`).trim()
    const name = String(char?.name || char?.nickname || '').trim()
    if (!id || !name || seen.has(id)) return

    seen.add(id)
    mapped.push({
      id,
      name,
      subtitle: String(char?.identity || char?.nickname || `剧情角色 ${index + 1}`).trim(),
      avatar: createAvatarText(name),
    })
  })

  if (mapped.length > 0) {
    return mapped
  }

  return FALLBACK_CONTACTS.map((item) => ({
    ...item,
    avatar: createAvatarText(item.name),
  }))
})

const smsStorageKey = computed(() => {
  const worldId = String(props.worldBook?.id || 'default_world_book').trim() || 'default_world_book'
  const saveSlotId = String(props.saveSlotId || 'session_default').trim() || 'session_default'
  return `${SMS_STORAGE_PREFIX}:${worldId}:${saveSlotId}`
})

const momentsStorageKey = computed(() => {
  const worldId = String(props.worldBook?.id || 'default_world_book').trim() || 'default_world_book'
  const saveSlotId = String(props.saveSlotId || 'session_default').trim() || 'session_default'
  return `${MOMENTS_STORAGE_PREFIX}:${worldId}:${saveSlotId}`
})

const normalizeSmsMessage = (rawItem, index = 0) => {
  const text = String(rawItem?.text || '').trim()
  if (!text) return null

  return {
    id: String(rawItem?.id || `sms_${Date.now()}_${index}`),
    role: rawItem?.role === 'assistant' ? 'assistant' : 'user',
    text,
    timestamp: String(rawItem?.timestamp || new Date().toISOString()),
  }
}

const normalizeSmsThreads = (rawThreads) => {
  if (!rawThreads || typeof rawThreads !== 'object') {
    return {}
  }

  const normalized = {}
  Object.entries(rawThreads).forEach(([contactId, rawList]) => {
    if (!Array.isArray(rawList)) return
    const parsed = rawList
      .map((item, index) => normalizeSmsMessage(item, index))
      .filter(Boolean)
    if (parsed.length > 0) {
      normalized[contactId] = parsed
    }
  })
  return normalized
}

const smsThreads = ref({})
const selectedContactId = ref('')
const smsDraft = ref('')
const smsError = ref('')
const isSendingSms = ref(false)
const isMessagesThreadView = ref(false)

const momentsFeed = ref([])
const momentsDraft = ref('')
const momentsError = ref('')
const isPublishingMoment = ref(false)
const isRefreshingMoments = ref(false)
const momentReplyTargetMap = ref({})
const momentReplyDraftMap = ref({})

const selectedContact = computed(() => {
  if (!selectedContactId.value) return null
  return contacts.value.find((item) => item.id === selectedContactId.value) || null
})

const selectedThread = computed(() => {
  const id = selectedContactId.value
  if (!id) return []
  return Array.isArray(smsThreads.value[id]) ? smsThreads.value[id] : []
})

const momentsPendingInitCount = computed(() =>
  momentsFeed.value.reduce((count, post) => count + (post?.needsInitComments ? 1 : 0), 0),
)

const momentsPendingReplyCount = computed(() =>
  momentsFeed.value.reduce((count, post) => {
    const comments = Array.isArray(post?.comments) ? post.comments : []
    const pendingCount = comments.reduce(
      (innerCount, comment) => innerCount + (comment?.role === 'user' && comment?.awaitingReply ? 1 : 0),
      0,
    )
    return count + pendingCount
  }, 0),
)

const hasMomentRefreshTask = computed(
  () => momentsPendingInitCount.value > 0 || momentsPendingReplyCount.value > 0,
)

const momentRefreshLabel = computed(() => {
  const total = momentsPendingInitCount.value + momentsPendingReplyCount.value
  return total > 0 ? `刷新(${total})` : '刷新'
})

const createSmsId = () => `sms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

const formatSmsTime = (timestamp) => {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatConversationTime = (timestamp) => {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (isSameDay) {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return `${date.getMonth() + 1}/${date.getDate()}`
}

const getThreadByContactId = (contactId) => {
  const id = String(contactId || '').trim()
  if (!id) return []
  return Array.isArray(smsThreads.value[id]) ? smsThreads.value[id] : []
}

const getContactLastMessageText = (contactId) => {
  const thread = getThreadByContactId(contactId)
  const last = thread[thread.length - 1]
  if (!last) return '暂无消息'

  const text = String(last.text || '').trim()
  if (!text) return '暂无消息'

  return last.role === 'user' ? `你: ${text}` : text
}

const getContactLastMessageTime = (contactId) => {
  const thread = getThreadByContactId(contactId)
  const last = thread[thread.length - 1]
  if (!last?.timestamp) return ''
  return formatConversationTime(last.timestamp)
}

const createMomentId = () => `moment_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
const createMomentCommentId = () => `moment_comment_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

const normalizeMomentComment = (rawItem, index = 0) => {
  const text = String(rawItem?.text || '').trim()
  if (!text) return null

  const role = rawItem?.role === 'user' ? 'user' : 'assistant'
  const fallbackAuthorName = role === 'user' ? '我' : '好友'
  const authorName = String(rawItem?.authorName || fallbackAuthorName).trim() || fallbackAuthorName
  const fallbackAuthorId = role === 'user' ? 'user' : `contact_${index}`
  const targetAuthorName = String(rawItem?.targetAuthorName || '').trim()

  return {
    id: String(rawItem?.id || createMomentCommentId()),
    authorId: String(rawItem?.authorId || fallbackAuthorId),
    authorName,
    authorAvatar: createAvatarText(rawItem?.authorAvatar || authorName),
    text,
    timestamp: String(rawItem?.timestamp || new Date().toISOString()),
    role,
    pending: Boolean(rawItem?.pending),
    awaitingReply: Boolean(rawItem?.awaitingReply),
    replyToCommentId: String(rawItem?.replyToCommentId || ''),
    targetAuthorId: String(rawItem?.targetAuthorId || ''),
    targetAuthorName,
  }
}

const normalizeMomentPost = (rawItem, index = 0) => {
  const content = String(rawItem?.content || '').trim()
  if (!content) return null

  const authorName = String(rawItem?.authorName || '我').trim() || '我'
  const comments = Array.isArray(rawItem?.comments)
    ? rawItem.comments
        .map((comment, commentIndex) => normalizeMomentComment(comment, commentIndex))
        .filter(Boolean)
    : []

  return {
    id: String(rawItem?.id || `moment_${Date.now()}_${index}`),
    authorId: String(rawItem?.authorId || 'user'),
    authorName,
    authorAvatar: createAvatarText(rawItem?.authorAvatar || authorName),
    content,
    timestamp: String(rawItem?.timestamp || new Date().toISOString()),
    comments,
    needsInitComments: Boolean(rawItem?.needsInitComments),
  }
}

const normalizeMomentsFeed = (rawFeed) => {
  if (!Array.isArray(rawFeed)) return []
  return rawFeed
    .map((item, index) => normalizeMomentPost(item, index))
    .filter(Boolean)
}

const formatMomentTime = (timestamp) => {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (isSameDay) {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return `${date.getMonth() + 1}/${date.getDate()} ${date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

const persistMomentsFeed = async () => {
  try {
    await kvStorage.set(momentsStorageKey.value, momentsFeed.value)
  } catch {
    // no-op
  }
}

const loadMomentsFeed = async () => {
  try {
    const raw = await kvStorage.get(momentsStorageKey.value)
    momentsFeed.value = normalizeMomentsFeed(raw)
  } catch {
    momentsFeed.value = []
  } finally {
    momentReplyTargetMap.value = {}
    momentReplyDraftMap.value = {}
  }
}

const getMomentReplyTarget = (postId) => {
  const key = String(postId || '').trim()
  if (!key) return null
  return momentReplyTargetMap.value[key] || null
}

const getMomentReplyDraft = (postId) => {
  const key = String(postId || '').trim()
  if (!key) return ''
  return String(momentReplyDraftMap.value[key] || '')
}

const setMomentReplyDraft = (postId, value) => {
  const key = String(postId || '').trim()
  if (!key) return
  momentReplyDraftMap.value = {
    ...momentReplyDraftMap.value,
    [key]: String(value || ''),
  }
}

const clearMomentReplyComposer = (postId) => {
  const key = String(postId || '').trim()
  if (!key) return

  const nextTargetMap = { ...momentReplyTargetMap.value }
  const nextDraftMap = { ...momentReplyDraftMap.value }
  delete nextTargetMap[key]
  delete nextDraftMap[key]
  momentReplyTargetMap.value = nextTargetMap
  momentReplyDraftMap.value = nextDraftMap
}

const startMomentReply = (postId, comment) => {
  const key = String(postId || '').trim()
  if (!key) return
  if (!comment || comment.role === 'user') return

  const authorName = String(comment.authorName || '好友').trim() || '好友'
  momentReplyTargetMap.value = {
    ...momentReplyTargetMap.value,
    [key]: {
      id: String(comment.id || ''),
      authorId: String(comment.authorId || ''),
      authorName,
    },
  }
}

const buildGeneratedMomentComment = (rawComment, index = 0, baseTime = Date.now()) => {
  const text = String(rawComment?.text || '').trim()
  if (!text) return null

  const authorName = String(rawComment?.authorName || '好友').trim() || '好友'
  const authorId = String(rawComment?.authorId || `contact_${index}`).trim() || `contact_${index}`
  return {
    id: createMomentCommentId(),
    authorId,
    authorName,
    authorAvatar: createAvatarText(authorName),
    text,
    timestamp: new Date(baseTime + (index + 1) * 60 * 1000).toISOString(),
    role: 'assistant',
    pending: false,
    awaitingReply: false,
    replyToCommentId: String(rawComment?.replyToCommentId || ''),
    targetAuthorId: '',
    targetAuthorName: '',
  }
}

const collectPendingMomentReplies = () => {
  const pending = []

  momentsFeed.value.forEach((post) => {
    const comments = Array.isArray(post?.comments) ? post.comments : []
    comments.forEach((comment) => {
      if (!(comment?.role === 'user' && comment?.awaitingReply)) return
      const replyText = String(comment?.text || '').trim()
      if (!replyText) return

      const parentComment = comments.find((item) => item?.id === comment.replyToCommentId) || null
      const targetAuthorId = String(comment?.targetAuthorId || parentComment?.authorId || '').trim()
      const targetAuthorName = String(comment?.targetAuthorName || parentComment?.authorName || '').trim()

      if (!targetAuthorId && !targetAuthorName) return

      pending.push({
        pendingId: String(comment.id || ''),
        postId: String(post.id || ''),
        postContent: String(post.content || '').trim(),
        targetAuthorId,
        targetAuthorName,
        userReplyText: replyText,
      })
    })
  })

  return pending.filter((item) => item.pendingId && item.userReplyText)
}

const submitMomentReply = async (postId) => {
  if (isRefreshingMoments.value) return

  const key = String(postId || '').trim()
  if (!key) return
  const target = getMomentReplyTarget(key)
  const content = getMomentReplyDraft(key).trim()
  if (!target || !content) return

  const nextComment = {
    id: createMomentCommentId(),
    authorId: 'user',
    authorName: '我',
    authorAvatar: '我',
    text: content,
    timestamp: new Date().toISOString(),
    role: 'user',
    pending: true,
    awaitingReply: true,
    replyToCommentId: String(target.id || ''),
    targetAuthorId: String(target.authorId || ''),
    targetAuthorName: String(target.authorName || '').trim(),
  }

  momentsFeed.value = momentsFeed.value.map((post) => {
    if (post.id !== key) return post
    const comments = Array.isArray(post.comments) ? post.comments : []
    return {
      ...post,
      comments: [...comments, nextComment],
    }
  })

  clearMomentReplyComposer(key)
  await persistMomentsFeed()
}

const handlePublishMoment = async () => {
  if (isPublishingMoment.value || isRefreshingMoments.value) return

  const content = String(momentsDraft.value || '').trim()
  if (!content) return

  momentsError.value = ''
  isPublishingMoment.value = true
  try {
    const nextPost = {
      id: createMomentId(),
      authorId: 'user',
      authorName: '我',
      authorAvatar: '我',
      content,
      timestamp: new Date().toISOString(),
      comments: [],
      needsInitComments: true,
    }

    momentsFeed.value = [nextPost, ...momentsFeed.value]
    momentsDraft.value = ''
    await persistMomentsFeed()
  } finally {
    isPublishingMoment.value = false
  }
}

const refreshMomentInitialComments = async (errorMessages) => {
  const pendingPosts = momentsFeed.value.filter((post) => post?.needsInitComments)
  if (pendingPosts.length === 0) return

  for (const post of pendingPosts) {
    const result = await generatePhoneMomentsReplies({
      worldBook: props.worldBook,
      postContent: post.content,
      contacts: contacts.value,
      momentsHistory: momentsFeed.value.filter((item) => item.id !== post.id).slice(0, 8),
      dialogueHistory: props.dialogueHistory,
      currentLine: props.currentLine,
    })

    if (!result.success || !Array.isArray(result.comments) || result.comments.length === 0) {
      errorMessages.push(`动态评论生成失败：${result.error || '请检查 API 设置'}`)
      continue
    }

    const baseTime = Date.now()
    const generatedComments = result.comments
      .map((item, index) => buildGeneratedMomentComment(item, index, baseTime))
      .filter(Boolean)

    if (generatedComments.length === 0) {
      errorMessages.push('动态评论为空')
      continue
    }

    momentsFeed.value = momentsFeed.value.map((item) =>
      item.id === post.id
        ? {
          ...item,
          needsInitComments: false,
          comments: [...(Array.isArray(item.comments) ? item.comments : []), ...generatedComments],
        }
        : item,
    )
  }
}

const refreshMomentThreadReplies = async (errorMessages) => {
  const pendingReplies = collectPendingMomentReplies()
  if (pendingReplies.length === 0) return

  const result = await generatePhoneMomentsBatchReplies({
    worldBook: props.worldBook,
    contacts: contacts.value,
    pendingReplies,
    momentsHistory: momentsFeed.value.slice(0, 8),
    dialogueHistory: props.dialogueHistory,
    currentLine: props.currentLine,
  })

  if (!result.success || !Array.isArray(result.replies) || result.replies.length === 0) {
    errorMessages.push(`评论续聊失败：${result.error || '请检查 API 设置'}`)
    return
  }

  const pendingById = new Map(pendingReplies.map((item) => [item.pendingId, item]))
  const replyByPendingId = new Map()

  result.replies.forEach((item) => {
    const pendingId = String(item?.pendingId || '').trim()
    const text = String(item?.text || '').trim()
    if (!pendingById.has(pendingId) || !text || replyByPendingId.has(pendingId)) return
    replyByPendingId.set(pendingId, item)
  })

  if (replyByPendingId.size === 0) {
    errorMessages.push('评论续聊为空')
    return
  }

  let replyOffset = 0
  momentsFeed.value = momentsFeed.value.map((post) => {
    const comments = Array.isArray(post?.comments) ? post.comments : []
    if (comments.length === 0) return post

    const appendComments = []
    const nextComments = comments.map((comment) => {
      if (!(comment?.role === 'user' && comment?.awaitingReply)) return comment

      const pending = pendingById.get(comment.id)
      const generated = replyByPendingId.get(comment.id)
      if (!pending || !generated) return comment

      const replyText = String(generated.text || '').trim()
      if (!replyText) return comment

      const authorName = String(generated.authorName || pending.targetAuthorName || '好友').trim() || '好友'
      const authorId = String(generated.authorId || pending.targetAuthorId || '').trim() || `contact_reply_${replyOffset}`
      replyOffset += 1

      appendComments.push({
        id: createMomentCommentId(),
        authorId,
        authorName,
        authorAvatar: createAvatarText(authorName),
        text: replyText,
        timestamp: new Date(Date.now() + replyOffset * 60 * 1000).toISOString(),
        role: 'assistant',
        pending: false,
        awaitingReply: false,
        replyToCommentId: comment.id,
        targetAuthorId: '',
        targetAuthorName: '',
      })

      return {
        ...comment,
        pending: false,
        awaitingReply: false,
      }
    })

    if (appendComments.length === 0) return post

    return {
      ...post,
      comments: [...nextComments, ...appendComments],
    }
  })

  const unresolvedCount = pendingReplies.reduce(
    (count, item) => count + (replyByPendingId.has(item.pendingId) ? 0 : 1),
    0,
  )

  if (unresolvedCount > 0) {
    errorMessages.push(`${unresolvedCount}条回复未匹配到结果，可再次刷新`)
  }
}

const handleRefreshMoments = async () => {
  if (isRefreshingMoments.value || isPublishingMoment.value) return

  momentsError.value = ''
  if (!hasMomentRefreshTask.value) {
    momentsError.value = '暂无需要刷新的内容'
    return
  }

  isRefreshingMoments.value = true
  const errorMessages = []

  try {
    await refreshMomentInitialComments(errorMessages)
    await refreshMomentThreadReplies(errorMessages)
    await persistMomentsFeed()

    if (errorMessages.length > 0) {
      momentsError.value = errorMessages.join('；')
    }
  } finally {
    isRefreshingMoments.value = false
  }
}

const persistSmsThreads = async () => {
  try {
    await kvStorage.set(smsStorageKey.value, smsThreads.value)
  } catch {
    // no-op
  }
}

const loadSmsThreads = async () => {
  try {
    const raw = await kvStorage.get(smsStorageKey.value)
    smsThreads.value = normalizeSmsThreads(raw)
  } catch {
    smsThreads.value = {}
  }
}

const ensureSelectedContact = () => {
  if (contacts.value.length === 0) {
    selectedContactId.value = ''
    return
  }

  const exists = contacts.value.some((item) => item.id === selectedContactId.value)
  if (!exists) {
    selectedContactId.value = contacts.value[0].id
  }
}

const ensureSmsThreadBootstrapped = async (contactId) => {
  const id = String(contactId || '').trim()
  if (!id) return
  const contact = contacts.value.find((item) => item.id === id)
  if (!contact) return

  const existing = Array.isArray(smsThreads.value[id]) ? smsThreads.value[id] : []
  if (existing.length > 0) return

  const introMessage = {
    id: createSmsId(),
    role: 'assistant',
    text: `我是${contact.name}，你可以直接发消息给我。`,
    timestamp: new Date().toISOString(),
  }

  smsThreads.value = {
    ...smsThreads.value,
    [id]: [introMessage],
  }
  await persistSmsThreads()
}

const appendSmsMessage = async (contactId, role, text) => {
  const id = String(contactId || '').trim()
  const value = String(text || '').trim()
  if (!id || !value) return null

  const nextMessage = {
    id: createSmsId(),
    role: role === 'assistant' ? 'assistant' : 'user',
    text: value,
    timestamp: new Date().toISOString(),
  }

  const currentThread = Array.isArray(smsThreads.value[id]) ? smsThreads.value[id] : []
  smsThreads.value = {
    ...smsThreads.value,
    [id]: [...currentThread, nextMessage],
  }
  await persistSmsThreads()
  return nextMessage
}

const scrollThreadToBottom = async () => {
  await nextTick()
  const container = messagesThreadRef.value
  if (!container) return
  container.scrollTop = container.scrollHeight
}

const selectMessageContact = async (contactId) => {
  selectedContactId.value = String(contactId || '').trim()
  await ensureSmsThreadBootstrapped(selectedContactId.value)
  smsError.value = ''
  isMessagesThreadView.value = true
  await scrollThreadToBottom()
}

const showMessagesList = () => {
  isMessagesThreadView.value = false
  smsError.value = ''
}

const handleSendSms = async () => {
  if (isSendingSms.value) return

  const contact = selectedContact.value
  const content = String(smsDraft.value || '').trim()
  if (!contact || !content) return

  smsError.value = ''
  smsDraft.value = ''
  await appendSmsMessage(contact.id, 'user', content)
  await scrollThreadToBottom()

  isSendingSms.value = true
  try {
    const history = Array.isArray(smsThreads.value[contact.id]) ? smsThreads.value[contact.id].slice(-20) : []
    const result = await generatePhoneSmsReply({
      worldBook: props.worldBook,
      contact,
      userMessage: content,
      history,
      dialogueHistory: props.dialogueHistory,
      currentLine: props.currentLine,
    })

    if (!result.success) {
      smsError.value = result.error || '短信发送失败，请检查 API 设置'
      return
    }

    const replyText = String(result.reply || '').trim()
    if (!replyText) {
      smsError.value = '短信回复为空，请重试'
      return
    }

    await appendSmsMessage(contact.id, 'assistant', replyText)
    await scrollThreadToBottom()
  } finally {
    isSendingSms.value = false
  }
}

const togglePhone = () => {
  if (dragMoved.value) {
    dragMoved.value = false
    return
  }
  isPhoneVisible.value = !isPhoneVisible.value
  if (!isPhoneVisible.value) {
    currentApp.value = null
  }
}

const openApp = async (appId) => {
  currentApp.value = appId
  if (appId === 'messages') {
    isMessagesThreadView.value = false
    ensureSelectedContact()
    await ensureSmsThreadBootstrapped(selectedContactId.value)
  } else if (appId === 'moments') {
    momentsError.value = ''
  }
}

const openContactMessages = async (contactId) => {
  currentApp.value = 'messages'
  await selectMessageContact(contactId)
}

const goHome = () => {
  currentApp.value = null
  isMessagesThreadView.value = false
  momentsError.value = ''
  momentReplyTargetMap.value = {}
  momentReplyDraftMap.value = {}
}

const startDrag = (event) => {
  if (typeof event.pointerId !== 'number') return
  if (event.pointerType === 'mouse' && event.button !== 0) return

  activePointerId.value = event.pointerId
  const captureTarget = event.currentTarget
  if (captureTarget && typeof captureTarget.setPointerCapture === 'function') {
    try {
      captureTarget.setPointerCapture(event.pointerId)
      pointerCaptureTarget.value = captureTarget
    } catch {
      pointerCaptureTarget.value = null
    }
  } else {
    pointerCaptureTarget.value = null
  }

  isDragging.value = true
  dragMoved.value = false
  dragStartPos.value = {
    x: event.clientX,
    y: event.clientY,
  }
  phoneStartPos.value = {
    x: phonePosition.value.x,
    y: phonePosition.value.y,
  }

  document.addEventListener('pointermove', handleDrag)
  document.addEventListener('pointerup', stopDrag)
  document.addEventListener('pointercancel', stopDrag)

  if (event.cancelable) {
    event.preventDefault()
  }
}

const handleDrag = (event) => {
  if (!isDragging.value) return
  if (activePointerId.value !== null && event.pointerId !== activePointerId.value) return

  const deltaX = event.clientX - dragStartPos.value.x
  const deltaY = event.clientY - dragStartPos.value.y

  if (!dragMoved.value && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) {
    dragMoved.value = true
  }

  let newX = phoneStartPos.value.x + deltaX
  let newY = phoneStartPos.value.y + deltaY

  const windowWidth = window.innerWidth
  const windowHeight = window.innerHeight
  const phoneWidth = isPhoneVisible.value ? 336 : 60
  const phoneHeight = isPhoneVisible.value ? 640 : 60

  newX = Math.max(0, Math.min(newX, windowWidth - phoneWidth))
  newY = Math.max(0, Math.min(newY, windowHeight - phoneHeight))

  phonePosition.value = { x: newX, y: newY }

  if (event.cancelable) {
    event.preventDefault()
  }
}

const stopDrag = () => {
  if (!isDragging.value) return

  isDragging.value = false
  const pointerId = activePointerId.value
  if (
    pointerCaptureTarget.value &&
    typeof pointerCaptureTarget.value.releasePointerCapture === 'function' &&
    typeof pointerId === 'number'
  ) {
    try {
      pointerCaptureTarget.value.releasePointerCapture(pointerId)
    } catch {
      // no-op
    }
  }
  pointerCaptureTarget.value = null
  activePointerId.value = null

  document.removeEventListener('pointermove', handleDrag)
  document.removeEventListener('pointerup', stopDrag)
  document.removeEventListener('pointercancel', stopDrag)

  savePhonePosition()
}

const collapsePhone = () => {
  if (!isPhoneVisible.value) {
    return
  }
  isPhoneVisible.value = false
  currentApp.value = null
}

const handleDocumentPointerDown = (event) => {
  if (!isPhoneVisible.value || isDragging.value) {
    return
  }

  const root = phonePluginRef.value
  if (!root) {
    return
  }

  const target = event.target
  if (target instanceof Node && root.contains(target)) {
    return
  }

  collapsePhone()
}

const savePhonePosition = async () => {
  await kvStorage.set(PHONE_POSITION_STORAGE_KEY, phonePosition.value)
}

const loadPhonePosition = async () => {
  try {
    const pos = await kvStorage.get(PHONE_POSITION_STORAGE_KEY)
    if (pos) {
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight
      if (pos.x >= 0 && pos.x < windowWidth - 60 && pos.y >= 0 && pos.y < windowHeight - 60) {
        phonePosition.value = pos
      }
    }
  } catch {
    phonePosition.value = getDefaultPhonePosition()
  }
}

watch(smsStorageKey, () => {
  void loadSmsThreads()
}, { immediate: true })

watch(momentsStorageKey, () => {
  void loadMomentsFeed()
}, { immediate: true })

watch(contacts, () => {
  ensureSelectedContact()
  void ensureSmsThreadBootstrapped(selectedContactId.value)
  if (!selectedContact.value) {
    isMessagesThreadView.value = false
  }
}, { immediate: true })

watch(selectedContactId, (contactId) => {
  if (!contactId) return
  void ensureSmsThreadBootstrapped(contactId)
})

watch(selectedThread, () => {
  if (currentApp.value === 'messages') {
    void scrollThreadToBottom()
  }
}, { deep: true })

onMounted(() => {
  timeInterval = setInterval(() => {
    currentTime.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }, 1000)

  loadPhonePosition()
  ensureSelectedContact()
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
})

onUnmounted(() => {
  if (timeInterval) {
    clearInterval(timeInterval)
  }
  document.removeEventListener('pointermove', handleDrag)
  document.removeEventListener('pointerup', stopDrag)
  document.removeEventListener('pointercancel', stopDrag)
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
})
</script>

<template>
  <div
    ref="phonePluginRef"
    class="phone-plugin"
    :class="{ dragging: isDragging }"
    :style="{
      right: 'auto',
      bottom: 'auto',
      left: phonePosition.x + 'px',
      top: phonePosition.y + 'px'
    }"
  >
    <button
      class="phone-trigger"
      @pointerdown="startDrag"
      @click="togglePhone"
      title="打开手机"
      aria-label="打开手机"
    >
      <span class="trigger-icon" aria-hidden="true">
        <span class="trigger-cutout"></span>
      </span>
    </button>

    <Transition name="phone-slide">
      <div v-if="isPhoneVisible" class="phone-container">
        <div class="phone-frame">
          <div class="phone-screen">
            <div class="phone-island" @pointerdown="startDrag"></div>

            <div class="status-bar" @pointerdown="startDrag">
              <span class="time">{{ currentTime }}</span>
              <div class="status-icons">
                <div class="signal-bars" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span class="network-text">5G</span>
                <div class="battery-icon" aria-hidden="true">
                  <span class="battery-level"></span>
                </div>
              </div>
            </div>

            <div v-if="!currentApp" class="home-screen">
              <div class="home-glow" aria-hidden="true"></div>
              <div class="lock-time">
                <div class="big-time">{{ currentTime }}</div>
                <div class="date">{{ new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }) }}</div>
              </div>

              <div class="app-grid">
                <button
                  v-for="app in apps"
                  :key="app.id"
                  class="app-icon"
                  type="button"
                  @click="openApp(app.id)"
                >
                  <div class="app-icon-bg" :style="{ backgroundColor: app.color }">
                    {{ app.icon }}
                  </div>
                  <span class="app-name">{{ app.name }}</span>
                </button>
              </div>
            </div>

            <div v-else-if="currentApp === 'phone'" class="app-screen phone-app">
              <div class="app-header">
                <button class="back-btn" type="button" @click="goHome" aria-label="返回主页">
                  <span class="chevron">‹</span>
                </button>
                <span class="app-title">电话</span>
                <span class="header-action">编辑</span>
              </div>
              <div class="phone-content">
                <div class="contacts-list">
                  <button
                    v-for="contact in contacts"
                    :key="contact.id"
                    class="contact-item"
                    type="button"
                    @click="openContactMessages(contact.id)"
                  >
                    <span class="contact-avatar">{{ contact.avatar }}</span>
                    <div class="contact-info">
                      <span class="contact-name">{{ contact.name }}</span>
                      <span class="contact-phone">{{ contact.subtitle }}</span>
                    </div>
                    <span class="contact-chevron">›</span>
                  </button>
                </div>
              </div>
            </div>

            <div v-else-if="currentApp === 'messages'" class="app-screen messages-app">
              <template v-if="!isMessagesThreadView">
                <div class="app-header messages-header">
                  <button class="back-btn" type="button" @click="goHome" aria-label="返回主页">
                    <span class="chevron">‹</span>
                  </button>
                  <span class="app-title">短信</span>
                  <span class="header-action">{{ contacts.length }}人</span>
                </div>

                <div class="messages-list-page">
                  <div class="messages-list-toolbar">
                    <p class="messages-list-title">信息</p>
                  </div>

                  <div class="messages-search-shell" aria-hidden="true">
                    <div class="messages-search-pill">
                      <span class="messages-search-icon">⌕</span>
                      <span class="messages-search-text">搜索</span>
                    </div>
                  </div>

                  <div class="messages-conversation-list">
                    <button
                      v-for="contact in contacts"
                      :key="`msg_list_${contact.id}`"
                      type="button"
                      class="messages-conversation-item"
                      @click="selectMessageContact(contact.id)"
                    >
                      <span class="messages-conversation-avatar">{{ contact.avatar }}</span>
                      <div class="messages-conversation-main">
                        <div class="messages-conversation-top">
                          <span class="messages-conversation-name">{{ contact.name }}</span>
                          <span class="messages-conversation-time">{{ getContactLastMessageTime(contact.id) }}</span>
                        </div>
                        <p class="messages-conversation-preview">{{ getContactLastMessageText(contact.id) }}</p>
                      </div>
                    </button>
                  </div>
                </div>
              </template>

              <template v-else>
                <div class="app-header messages-header">
                  <button class="back-btn" type="button" @click="showMessagesList" aria-label="返回短信列表">
                    <span class="chevron">‹</span>
                  </button>
                  <span class="app-title">{{ selectedContact?.name || '短信' }}</span>
                  <span class="header-action messages-thread-avatar-mini">
                    {{ selectedContact?.avatar || '' }}
                  </span>
                </div>

                <div class="messages-thread-page">
                  <div ref="messagesThreadRef" class="messages-thread">
                    <p v-if="selectedThread.length === 0" class="messages-empty">发送一条消息开始对话</p>
                    <article
                      v-for="message in selectedThread"
                      :key="message.id"
                      class="sms-row"
                      :class="message.role === 'user' ? 'from-user' : 'from-assistant'"
                    >
                      <p class="sms-bubble">{{ message.text }}</p>
                      <time class="sms-time">{{ formatSmsTime(message.timestamp) }}</time>
                    </article>
                  </div>

                  <p v-if="smsError" class="sms-error">{{ smsError }}</p>

                  <div class="messages-compose">
                    <input
                      v-model="smsDraft"
                      class="sms-input"
                      type="text"
                      placeholder="iMessage"
                      :disabled="isSendingSms || !selectedContact"
                      @keydown.enter.prevent="handleSendSms"
                    />
                    <button
                      type="button"
                      class="sms-send-btn"
                      :disabled="isSendingSms || !smsDraft.trim() || !selectedContact"
                      @click="handleSendSms"
                    >
                      {{ isSendingSms ? '...' : '↑' }}
                    </button>
                  </div>
                </div>
              </template>
            </div>

            <div v-else-if="currentApp === 'moments'" class="app-screen moments-app">
              <div class="app-header moments-header">
                <button class="back-btn" type="button" @click="goHome" aria-label="返回主页">
                  <span class="chevron">‹</span>
                </button>
                <span class="app-title">朋友圈</span>
                <div class="moments-header-actions">
                  <span class="header-action">{{ momentsFeed.length }}条</span>
                  <button
                    type="button"
                    class="moments-refresh-btn"
                    :disabled="isRefreshingMoments || isPublishingMoment || !hasMomentRefreshTask"
                    @click="handleRefreshMoments"
                  >
                    {{ isRefreshingMoments ? '刷新中' : momentRefreshLabel }}
                  </button>
                </div>
              </div>

              <div class="moments-page">
                <div class="moments-composer">
                  <span class="moments-composer-avatar">我</span>
                  <div class="moments-composer-panel">
                    <textarea
                      v-model="momentsDraft"
                      class="moments-input"
                      placeholder="写点什么，分享这一刻..."
                      maxlength="180"
                    ></textarea>
                    <div class="moments-composer-footer">
                      <span class="moments-limit">{{ momentsDraft.trim().length }}/180</span>
                      <button
                        type="button"
                        class="moments-new-btn"
                        :disabled="isPublishingMoment || !momentsDraft.trim()"
                        @click="handlePublishMoment"
                      >
                        {{ isPublishingMoment ? '发布中' : '发布' }}
                      </button>
                    </div>
                  </div>
                </div>

                <p v-if="momentsError" class="moments-error">{{ momentsError }}</p>

                <div class="moments-feed">
                  <p v-if="momentsFeed.length === 0" class="moments-empty">还没有朋友圈动态，发布第一条吧</p>

                  <article
                    v-for="post in momentsFeed"
                    :key="post.id"
                    class="moments-post"
                  >
                    <header class="moments-post-header">
                      <span class="moments-post-avatar">{{ post.authorAvatar }}</span>
                      <div class="moments-post-meta">
                        <p class="moments-post-name">{{ post.authorName }}</p>
                        <time class="moments-post-time">{{ formatMomentTime(post.timestamp) }}</time>
                      </div>
                    </header>

                    <p class="moments-post-content">{{ post.content }}</p>

                    <p v-if="post.needsInitComments" class="moments-post-hint">
                      已发布，点击顶部刷新生成角色评论
                    </p>

                    <section v-if="post.comments.length > 0" class="moments-comments">
                      <article
                        v-for="comment in post.comments"
                        :key="comment.id"
                        class="moments-comment"
                        :class="{
                          'moments-comment-user': comment.role === 'user',
                          'moments-comment-pending': comment.role === 'user' && comment.awaitingReply,
                        }"
                      >
                        <span class="moments-comment-name">{{ comment.authorName }}：</span>
                        <span class="moments-comment-text">{{ comment.text }}</span>
                        <button
                          v-if="comment.role !== 'user'"
                          type="button"
                          class="moments-reply-btn"
                          @click="startMomentReply(post.id, comment)"
                        >
                          回复
                        </button>
                        <span
                          v-else-if="comment.awaitingReply"
                          class="moments-comment-state"
                        >
                          待刷新
                        </span>
                      </article>
                    </section>

                    <section
                      v-if="getMomentReplyTarget(post.id)"
                      class="moments-reply-composer"
                    >
                      <p class="moments-reply-target">
                        回复 {{ getMomentReplyTarget(post.id)?.authorName }}
                      </p>
                      <div class="moments-reply-row">
                        <input
                          :value="getMomentReplyDraft(post.id)"
                          class="moments-reply-input"
                          type="text"
                          placeholder="输入回复内容..."
                          maxlength="120"
                          :disabled="isRefreshingMoments"
                          @input="setMomentReplyDraft(post.id, $event.target.value)"
                          @keydown.enter.prevent="submitMomentReply(post.id)"
                        />
                        <button
                          type="button"
                          class="moments-reply-submit-btn"
                          :disabled="isRefreshingMoments || !getMomentReplyDraft(post.id).trim()"
                          @click="submitMomentReply(post.id)"
                        >
                          暂存
                        </button>
                        <button
                          type="button"
                          class="moments-reply-cancel-btn"
                          :disabled="isRefreshingMoments"
                          @click="clearMomentReplyComposer(post.id)"
                        >
                          取消
                        </button>
                      </div>
                    </section>
                  </article>
                </div>
              </div>
            </div>

            <div v-else class="app-screen">
              <div class="app-header">
                <button class="back-btn" type="button" @click="goHome" aria-label="返回主页">
                  <span class="chevron">‹</span>
                </button>
                <span class="app-title">{{ apps.find(a => a.id === currentApp)?.name }}</span>
                <span class="header-action">更多</span>
              </div>
              <div class="app-placeholder">
                <p>应用开发中...</p>
              </div>
            </div>

            <div class="nav-bar">
              <button class="nav-btn" type="button" @click="goHome" aria-label="主页">
                <span class="nav-home-icon">⌂</span>
              </button>
              <button class="nav-btn" type="button" @click="togglePhone" aria-label="收起手机">
                <span class="nav-close-icon">×</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.phone-plugin {
  --ios-text: #10131a;
  --ios-subtle: #657186;
  --ios-line: rgba(16, 19, 26, 0.1);
  --ios-surface: #ffffff;
  --ios-surface-soft: #f4f6fb;
  --ios-accent: #0a84ff;
  --ios-shadow: 0 24px 46px rgba(5, 18, 41, 0.28);
  position: fixed;
  z-index: 1000;
  user-select: none;
  font-family: 'SF Pro Text', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif;
}

.phone-plugin.dragging {
  cursor: grabbing;
}

.phone-plugin.dragging .phone-trigger {
  cursor: grabbing;
}

.phone-trigger {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.72);
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.95), rgba(236, 243, 252, 0.9));
  color: var(--ios-text);
  cursor: grab;
  box-shadow: 0 16px 26px rgba(6, 20, 43, 0.24);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}

.phone-trigger:hover {
  transform: translateY(-1px);
  box-shadow: 0 20px 28px rgba(8, 27, 58, 0.25);
}

.phone-trigger:active {
  transform: scale(0.96);
}

.trigger-icon {
  position: relative;
  width: 26px;
  height: 34px;
  border-radius: 8px;
  border: 2px solid rgba(16, 19, 26, 0.8);
  background: linear-gradient(180deg, #ffffff, #edf3fb);
}

.trigger-cutout {
  position: absolute;
  left: 50%;
  top: 3px;
  width: 10px;
  height: 2px;
  border-radius: 999px;
  transform: translateX(-50%);
  background: rgba(16, 19, 26, 0.45);
}

.phone-container {
  position: absolute;
  top: 66px;
  left: -10px;
  z-index: 999;
}

.phone-frame {
  width: 312px;
  height: 612px;
  padding: 7px;
  background: linear-gradient(155deg, #ecf1f9, #d9e1ed);
  border-radius: 36px;
  border: 1px solid rgba(255, 255, 255, 0.48);
  box-shadow: var(--ios-shadow);
}

.phone-screen {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 30px;
  overflow: hidden;
  background:
    radial-gradient(130% 65% at 50% -8%, rgba(120, 186, 255, 0.34), rgba(120, 186, 255, 0) 58%),
    linear-gradient(180deg, #f8fbff 0%, #edf2fa 100%);
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.48);
}

.phone-island {
  position: absolute;
  top: 8px;
  left: 50%;
  width: 112px;
  height: 28px;
  border-radius: 20px;
  transform: translateX(-50%);
  background: linear-gradient(180deg, #0f1116, #050609);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  z-index: 3;
  touch-action: none;
}

.status-bar {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px 10px;
  margin-top: 2px;
  background: transparent;
  color: var(--ios-text);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.01em;
  touch-action: none;
}

.status-icons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.signal-bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}

.signal-bars span {
  width: 3px;
  border-radius: 1px;
  background: rgba(16, 19, 26, 0.9);
}

.signal-bars span:nth-child(1) {
  height: 4px;
}

.signal-bars span:nth-child(2) {
  height: 6px;
}

.signal-bars span:nth-child(3) {
  height: 9px;
}

.signal-bars span:nth-child(4) {
  height: 12px;
}

.network-text {
  font-size: 11px;
  font-weight: 700;
  color: rgba(16, 19, 26, 0.7);
}

.battery-icon {
  position: relative;
  width: 24px;
  height: 12px;
  border-radius: 4px;
  border: 1.5px solid rgba(16, 19, 26, 0.72);
  padding: 1px;
}

.battery-icon::after {
  content: '';
  position: absolute;
  right: -3px;
  top: 3px;
  width: 2px;
  height: 4px;
  border-radius: 1px;
  background: rgba(16, 19, 26, 0.72);
}

.battery-level {
  display: block;
  width: 72%;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #38d39f 0%, #45d6bf 100%);
}

.home-screen {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px 14px 0;
  overflow: hidden;
}

.home-glow {
  position: absolute;
  top: 22px;
  left: 50%;
  width: 250px;
  height: 116px;
  border-radius: 999px;
  transform: translateX(-50%);
  background: radial-gradient(closest-side, rgba(74, 165, 255, 0.26), rgba(74, 165, 255, 0));
  pointer-events: none;
}

.lock-time {
  position: relative;
  z-index: 1;
  text-align: center;
  margin-bottom: 34px;
  padding-top: 10px;
}

.big-time {
  font-size: 54px;
  font-weight: 500;
  color: var(--ios-text);
  letter-spacing: -0.045em;
  line-height: 1;
}

.date {
  font-size: 14px;
  color: var(--ios-subtle);
  margin-top: 8px;
  font-weight: 500;
}

.app-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px 12px;
  padding: 6px 2px 0;
}

.app-icon {
  background: none;
  border: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: transform 0.16s ease;
  padding: 0;
}

.app-icon:hover {
  transform: translateY(-1px);
}

.app-icon:active {
  transform: scale(0.95);
}

.app-icon-bg {
  width: 58px;
  height: 58px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 27px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.34),
    0 8px 16px rgba(10, 20, 41, 0.14);
}

.app-name {
  font-size: 12px;
  color: var(--ios-text);
  margin-top: 7px;
  text-align: center;
  font-weight: 500;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
}

.app-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--ios-surface-soft);
}

.app-header {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 10px 6px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--ios-text);
  border-bottom: 1px solid var(--ios-line);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

.back-btn {
  width: 42px;
  height: 38px;
  border: 0;
  background: transparent;
  color: var(--ios-accent);
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  transition: background 0.15s ease;
}

.back-btn:hover {
  background: rgba(10, 132, 255, 0.12);
}

.chevron {
  margin-left: -2px;
}

.app-title {
  flex: 1;
  text-align: center;
  margin-right: -42px;
  font-size: 17px;
  font-weight: 600;
  color: var(--ios-text);
}

.header-action {
  width: 42px;
  text-align: center;
  font-size: 13px;
  color: var(--ios-accent);
  font-weight: 500;
}

.phone-app .phone-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  background: var(--ios-surface-soft);
}

.contacts-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.contact-item {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 11px 12px;
  background: var(--ios-surface);
  border-radius: 15px;
  border: 1px solid rgba(255, 255, 255, 0.88);
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: transform 0.16s ease, box-shadow 0.16s ease;
  box-shadow: 0 4px 12px rgba(13, 26, 44, 0.06);
}

.contact-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 16px rgba(13, 26, 44, 0.1);
}

.contact-item:active {
  transform: scale(0.98);
}

.contact-avatar {
  font-size: 16px;
  font-weight: 700;
  margin-right: 12px;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #20467c;
  background: linear-gradient(160deg, #dce9fa, #cfdff5);
  border-radius: 50%;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
}

.contact-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.contact-name {
  color: var(--ios-text);
  font-size: 15px;
  font-weight: 600;
}

.contact-phone {
  color: var(--ios-subtle);
  font-size: 12px;
  margin-top: 2px;
}

.contact-chevron {
  margin-left: 10px;
  color: rgba(16, 19, 26, 0.35);
  font-size: 20px;
  line-height: 1;
}

.messages-app {
  background: #f2f2f7;
}

.messages-header {
  background: rgba(247, 247, 250, 0.9);
}

.messages-thread-avatar-mini {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #1b3f72;
  background: linear-gradient(160deg, #deebff, #cdddf4);
}

.messages-list-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
}

.messages-list-toolbar {
  padding: 8px 16px 2px;
}

.messages-list-title {
  margin: 0;
  color: #111214;
  font-size: 30px;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.messages-search-shell {
  padding: 8px 12px 10px;
}

.messages-search-pill {
  min-height: 34px;
  border-radius: 10px;
  background: #ececf0;
  color: #8c8c91;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
}

.messages-search-icon {
  font-size: 12px;
  opacity: 0.9;
}

.messages-search-text {
  font-weight: 500;
}

.messages-conversation-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 12px;
}

.messages-conversation-item {
  width: 100%;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 4px;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
  border-bottom: 1px solid rgba(60, 60, 67, 0.14);
}

.messages-conversation-item:active {
  background: rgba(10, 132, 255, 0.08);
}

.messages-conversation-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  color: #1e467f;
  background: linear-gradient(160deg, #dce9ff, #cedef6);
  flex-shrink: 0;
}

.messages-conversation-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.messages-conversation-top {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.messages-conversation-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  color: #1c1c1e;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.messages-conversation-time {
  font-size: 12px;
  color: #8e8e93;
  font-weight: 500;
  flex-shrink: 0;
}

.messages-conversation-preview {
  margin: 0;
  font-size: 13px;
  color: #7b7b82;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.messages-thread-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.messages-thread {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  background:
    radial-gradient(circle at 20% 0%, rgba(10, 132, 255, 0.12), transparent 42%),
    linear-gradient(180deg, #f4f8ff 0%, #eef3fb 100%);
}

.messages-empty {
  margin: auto;
  font-size: 13px;
  color: var(--ios-subtle);
}

.sms-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sms-row.from-user {
  align-items: flex-end;
}

.sms-row.from-assistant {
  align-items: flex-start;
}

.sms-bubble {
  margin: 0;
  max-width: 84%;
  padding: 8px 11px;
  border-radius: 17px;
  font-size: 13px;
  line-height: 1.4;
  word-break: break-word;
}

.sms-row.from-user .sms-bubble {
  background: linear-gradient(160deg, #0a84ff, #2d95ff);
  color: #ffffff;
  border-bottom-right-radius: 7px;
}

.sms-row.from-assistant .sms-bubble {
  background: #ffffff;
  color: #16161a;
  border: 1px solid rgba(60, 60, 67, 0.16);
  border-bottom-left-radius: 7px;
}

.sms-time {
  font-size: 10px;
  color: rgba(16, 19, 26, 0.45);
  padding: 0 2px;
}

.sms-error {
  margin: 0;
  padding: 2px 12px 0;
  font-size: 12px;
  color: #d32f2f;
}

.messages-compose {
  border-top: 1px solid rgba(60, 60, 67, 0.16);
  background: rgba(248, 248, 250, 0.95);
  padding: 7px 10px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sms-input {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(60, 60, 67, 0.2);
  border-radius: 17px;
  padding: 8px 11px;
  font-size: 13px;
  line-height: 1.2;
  color: #17171b;
  background: #ffffff;
}

.sms-input:focus {
  outline: none;
  border-color: rgba(10, 132, 255, 0.55);
  box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.14);
}

.sms-send-btn {
  border: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  padding: 0;
  background: #0a84ff;
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.sms-send-btn:active {
  transform: scale(0.92);
}

.sms-send-btn:disabled {
  opacity: 0.5;
  background: #85bcff;
  cursor: not-allowed;
}

.moments-app {
  background: #f2f2f7;
}

.moments-header {
  background: rgba(247, 247, 250, 0.9);
}

.moments-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.moments-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #f2f2f7;
  overflow: hidden;
}

.moments-composer {
  margin: 10px 12px 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.moments-composer-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #165eb4;
  background: linear-gradient(160deg, #ddebff, #cfe0f7);
  margin-top: 4px;
}

.moments-composer-panel {
  flex: 1;
  min-width: 0;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid rgba(60, 60, 67, 0.16);
  box-shadow: 0 4px 12px rgba(10, 22, 46, 0.05);
  padding: 8px 9px 7px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.moments-input {
  width: 100%;
  min-height: 56px;
  max-height: 96px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #17171b;
  font-size: 12px;
  line-height: 1.45;
  padding: 0;
  resize: none;
  box-sizing: border-box;
}

.moments-input:focus {
  outline: none;
}

.moments-composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 5px;
  border-top: 1px solid rgba(60, 60, 67, 0.1);
}

.moments-limit {
  font-size: 10px;
  color: #8e8e93;
}

.moments-new-btn {
  border: 0;
  min-width: auto;
  height: auto;
  border-radius: 0;
  padding: 0 2px;
  background: transparent;
  color: #16a06f;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.moments-refresh-btn {
  border: 0;
  min-width: auto;
  height: auto;
  border-radius: 0;
  padding: 0 2px;
  background: transparent;
  color: #0a6ad6;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

.moments-new-btn:active,
.moments-refresh-btn:active {
  opacity: 0.68;
}

.moments-refresh-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.moments-new-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.moments-error {
  margin: 6px 14px 0;
  font-size: 12px;
  color: #d32f2f;
}

.moments-feed {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.moments-empty {
  margin: auto;
  font-size: 13px;
  color: #8e8e93;
}

.moments-post {
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid rgba(60, 60, 67, 0.14);
  box-shadow: 0 8px 18px rgba(10, 22, 46, 0.06);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.moments-post-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.moments-post-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #1e467f;
  background: linear-gradient(160deg, #dce9ff, #cedef6);
  flex-shrink: 0;
}

.moments-post-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.moments-post-name {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #1c1c1e;
}

.moments-post-time {
  font-size: 11px;
  color: #8e8e93;
}

.moments-post-content {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: #17171b;
  white-space: pre-wrap;
  word-break: break-word;
}

.moments-post-hint {
  margin: 0;
  font-size: 11px;
  color: #8e8e93;
}

.moments-comments {
  border-radius: 10px;
  background: #f4f6fa;
  border: 1px solid rgba(60, 60, 67, 0.1);
  padding: 7px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.moments-comment {
  margin: 0;
  font-size: 12px;
  line-height: 1.35;
  color: #4e4e55;
  word-break: break-word;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  flex-wrap: wrap;
}

.moments-comment-user {
  color: #1d385f;
}

.moments-comment-pending {
  color: #2b4c77;
}

.moments-comment-name {
  color: #1277d5;
  font-weight: 600;
}

.moments-comment-text {
  flex: 1;
  min-width: 0;
}

.moments-reply-btn {
  border: 0;
  padding: 0;
  min-width: auto;
  background: transparent;
  color: #0a84ff;
  font-size: 11px;
  line-height: 1.2;
  cursor: pointer;
}

.moments-comment-state {
  color: #6a7b98;
  font-size: 10px;
  line-height: 1.2;
}

.moments-reply-composer {
  border-radius: 10px;
  background: #f3f6fb;
  border: 1px solid rgba(18, 119, 213, 0.16);
  padding: 7px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.moments-reply-target {
  margin: 0;
  font-size: 11px;
  color: #52627d;
}

.moments-reply-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.moments-reply-input {
  flex: 1;
  min-width: 0;
  height: 30px;
  border: 1px solid rgba(60, 60, 67, 0.2);
  border-radius: 999px;
  background: #ffffff;
  color: #17171b;
  font-size: 12px;
  line-height: 1.2;
  padding: 0 10px;
}

.moments-reply-input:focus {
  outline: none;
  border-color: rgba(10, 132, 255, 0.55);
  box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.12);
}

.moments-reply-submit-btn {
  border: 0;
  min-width: 44px;
  height: 28px;
  border-radius: 999px;
  padding: 0 10px;
  background: #18b887;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.moments-reply-submit-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.moments-reply-cancel-btn {
  border: 0;
  min-width: 42px;
  height: 28px;
  border-radius: 999px;
  padding: 0 10px;
  background: rgba(60, 60, 67, 0.12);
  color: #4e4e55;
  font-size: 11px;
  cursor: pointer;
}

.moments-reply-cancel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.app-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ios-subtle);
  background: var(--ios-surface-soft);
}

.app-placeholder p {
  font-size: 15px;
  margin: 0;
  font-weight: 500;
}

.nav-bar {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 13px;
  background: rgba(255, 255, 255, 0.86);
  border-top: 1px solid var(--ios-line);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

.nav-bar::after {
  content: '';
  position: absolute;
  bottom: 4px;
  left: 50%;
  width: 118px;
  height: 4px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: rgba(16, 19, 26, 0.2);
}

.nav-btn {
  flex: 1;
  height: 36px;
  border: 0;
  border-radius: 12px;
  background: rgba(243, 247, 254, 0.9);
  color: var(--ios-text);
  font-size: 20px;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-btn:hover {
  background: rgba(229, 237, 248, 0.95);
}

.nav-btn:active {
  transform: scale(0.95);
}

.nav-home-icon {
  font-size: 20px;
  line-height: 1;
}

.nav-close-icon {
  font-size: 24px;
  line-height: 1;
  margin-top: -1px;
}

.phone-slide-enter-active,
.phone-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.phone-slide-enter-from,
.phone-slide-leave-to {
  opacity: 0;
  transform: translateY(14px) scale(0.95);
}

@media (max-width: 768px) {
  .phone-plugin {
    z-index: 1200;
  }

  .phone-trigger {
    width: 50px;
    height: 50px;
  }

  .phone-container {
    left: -6px;
  }

  .phone-frame {
    width: min(312px, calc(100vw - 18px));
    height: min(612px, calc(100vh - 118px));
    border-radius: 32px;
  }

  .phone-screen {
    border-radius: 27px;
  }

  .home-screen {
    padding: 10px 12px 0;
  }

  .big-time {
    font-size: 48px;
  }

  .app-grid {
    gap: 16px 8px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .app-icon-bg {
    width: 54px;
    height: 54px;
    font-size: 24px;
  }

  .app-name {
    font-size: 11px;
  }

  .nav-btn {
    height: 34px;
  }

  .messages-list-toolbar {
    padding: 8px 14px 2px;
  }

  .messages-list-title {
    font-size: 26px;
  }

  .messages-search-shell {
    padding: 7px 10px 8px;
  }

  .messages-conversation-list {
    padding: 0 10px;
  }

  .messages-conversation-avatar {
    width: 38px;
    height: 38px;
    font-size: 14px;
  }

  .messages-conversation-name {
    font-size: 14px;
  }

  .messages-conversation-preview {
    font-size: 12px;
  }

  .messages-conversation-time {
    font-size: 11px;
  }

  .messages-thread {
    padding: 10px 8px;
  }

  .sms-bubble {
    font-size: 12px;
  }

  .sms-input {
    font-size: 12px;
    padding: 7px 10px;
  }

  .sms-send-btn {
    width: 28px;
    height: 28px;
    font-size: 13px;
  }

  .moments-composer {
    margin: 8px 10px 0;
    gap: 7px;
  }

  .moments-composer-avatar {
    width: 24px;
    height: 24px;
    font-size: 10px;
    margin-top: 3px;
  }

  .moments-composer-panel {
    padding: 7px 8px 6px;
    border-radius: 10px;
  }

  .moments-input {
    min-height: 50px;
    max-height: 84px;
    font-size: 11px;
  }

  .moments-feed {
    padding: 8px 10px 10px;
  }

  .moments-post {
    padding: 9px;
    gap: 7px;
  }

  .moments-post-content {
    font-size: 12px;
  }

  .moments-comment {
    font-size: 11px;
  }

  .moments-new-btn {
    font-size: 10px;
    padding: 0 1px;
  }

  .moments-refresh-btn {
    font-size: 9px;
    padding: 0 1px;
  }

  .moments-reply-input {
    height: 28px;
    font-size: 11px;
  }

  .moments-reply-submit-btn,
  .moments-reply-cancel-btn {
    height: 26px;
    min-width: 40px;
    font-size: 10px;
    padding: 0 8px;
  }
}

@media (max-width: 768px) and (orientation: landscape) {
  .phone-frame {
    width: min(286px, calc(100vw - 16px));
    height: min(520px, calc(100vh - 72px));
  }

  .big-time {
    font-size: 40px;
  }

  .app-grid {
    gap: 12px 8px;
  }

  .app-icon-bg {
    width: 46px;
    height: 46px;
    font-size: 21px;
  }
}

@media (max-width: 480px) {
  .phone-trigger {
    width: 46px;
    height: 46px;
  }

  .trigger-icon {
    width: 22px;
    height: 30px;
  }

  .phone-frame {
    width: min(300px, calc(100vw - 14px));
    height: min(590px, calc(100vh - 92px));
  }

  .phone-island {
    width: 100px;
    height: 24px;
  }

  .status-bar {
    padding: 12px 12px 8px;
  }

  .big-time {
    font-size: 44px;
  }

  .date {
    font-size: 13px;
  }

  .app-grid {
    gap: 14px 6px;
  }

  .app-icon-bg {
    width: 50px;
    height: 50px;
    border-radius: 14px;
    font-size: 22px;
  }

  .app-title {
    font-size: 16px;
  }

  .messages-list-title {
    font-size: 24px;
  }

  .messages-conversation-item {
    padding: 9px 2px;
  }

  .messages-conversation-avatar {
    width: 34px;
    height: 34px;
    font-size: 13px;
  }

  .messages-conversation-time {
    font-size: 10px;
  }

  .messages-thread-avatar-mini {
    width: 24px;
    height: 24px;
    font-size: 11px;
  }

  .messages-compose {
    padding: 6px 8px 7px;
    gap: 6px;
  }

  .sms-send-btn {
    width: 26px;
    height: 26px;
    font-size: 12px;
  }

  .moments-composer {
    margin: 7px 8px 0;
    gap: 6px;
  }

  .moments-composer-avatar {
    width: 22px;
    height: 22px;
    font-size: 9px;
  }

  .moments-composer-panel {
    padding: 6px 7px 5px;
    border-radius: 9px;
  }

  .moments-input {
    min-height: 44px;
    max-height: 76px;
    font-size: 10px;
  }

  .moments-feed {
    padding: 7px 8px 9px;
    gap: 8px;
  }

  .moments-post-avatar {
    width: 30px;
    height: 30px;
    font-size: 12px;
  }

  .moments-post-name {
    font-size: 12px;
  }

  .moments-post-time {
    font-size: 10px;
  }

  .moments-limit {
    font-size: 10px;
  }

  .moments-header-actions {
    gap: 5px;
  }

  .moments-reply-row {
    gap: 5px;
  }
}
</style>
