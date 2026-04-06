<script setup>
/**
 * 默认手机组件
 * 支持通讯录与短信（短信可调用 LLM 生成角色回复）
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { kvStorage } from '../storage/index.js'
import {
  generatePhoneForumPosts,
  generatePhoneMapData,
  generatePhoneNewsFeed,
  generatePhoneMomentsBatchReplies,
  generatePhoneMomentsReplies,
  generatePhoneShopItems,
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
const FORUM_STORAGE_PREFIX = 'phone-forum-posts'
const NEWS_STORAGE_PREFIX = 'phone-news-events'
const MAP_STORAGE_PREFIX = 'phone-map-data'
const ALERT_STORAGE_PREFIX = 'phone-alerts'
const CLUE_STORAGE_PREFIX = 'phone-clues'
const PHONE_SETTINGS_STORAGE_PREFIX = 'phone-settings'
const PHONE_WALLET_STORAGE_PREFIX = 'phone-wallet'
const PHONE_SHOP_STORAGE_PREFIX = 'phone-shop'
const BACKPACK_STORAGE_PREFIX = 'backpack-items'
const MAX_ALERTS = 120
const MAX_CLUES = 200
const MAX_SHOP_RESULTS = 16
const MAX_SHOP_ORDERS = 80
const DEFAULT_WALLET_BALANCE_CENTS = 500000
const DEFAULT_PHONE_SETTINGS = Object.freeze({
  newsRefreshCooldownSec: 45,
  forumRefreshCooldownSec: 45,
  smsHistoryLineCount: 24,
  smsDialogueLineCount: 12,
  smsMaxTokens: 1200,
})
const NEWS_CHANNELS = ['推荐', '热点', '传闻', '深度', '最新']

const FALLBACK_CONTACTS = [
  { id: 'fallback_mom', name: '妈妈', subtitle: '138-0000-0001' },
  { id: 'fallback_dad', name: '爸爸', subtitle: '138-0000-0002' },
  { id: 'fallback_xiaoming', name: '小明', subtitle: '139-1111-2222' },
]

const apps = [
  { id: 'alerts', name: '通知', icon: '🔔', color: '#ef3f3f' },
  { id: 'phone', name: '电话', icon: '📞', color: '#4CAF50' },
  { id: 'messages', name: '短信', icon: '💬', color: '#2196F3' },
  { id: 'moments', name: '朋友圈', icon: '🫧', color: '#18b887' },
  { id: 'forum', name: '论坛', icon: '🧵', color: '#ff9f0a' },
  { id: 'news', name: '今日X条', icon: '📰', color: '#4169e1' },
  { id: 'map', name: '地图', icon: '🗺️', color: '#3a8dff' },
  { id: 'shop', name: '点购网', icon: '🛍️', color: '#ff6f61' },
  { id: 'wallet', name: '余额', icon: '💳', color: '#1f89f7' },
  { id: 'clues', name: '线索板', icon: '📌', color: '#7b69ff' },
  { id: 'settings', name: '频率设置', icon: '⚙️', color: '#6f7889' },
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

const forumStorageKey = computed(() => {
  const worldId = String(props.worldBook?.id || 'default_world_book').trim() || 'default_world_book'
  const saveSlotId = String(props.saveSlotId || 'session_default').trim() || 'session_default'
  return `${FORUM_STORAGE_PREFIX}:${worldId}:${saveSlotId}`
})

const newsStorageKey = computed(() => {
  const worldId = String(props.worldBook?.id || 'default_world_book').trim() || 'default_world_book'
  const saveSlotId = String(props.saveSlotId || 'session_default').trim() || 'session_default'
  return `${NEWS_STORAGE_PREFIX}:${worldId}:${saveSlotId}`
})

const mapStorageKey = computed(() => {
  const worldId = String(props.worldBook?.id || 'default_world_book').trim() || 'default_world_book'
  const saveSlotId = String(props.saveSlotId || 'session_default').trim() || 'session_default'
  return `${MAP_STORAGE_PREFIX}:${worldId}:${saveSlotId}`
})

const alertStorageKey = computed(() => {
  const worldId = String(props.worldBook?.id || 'default_world_book').trim() || 'default_world_book'
  const saveSlotId = String(props.saveSlotId || 'session_default').trim() || 'session_default'
  return `${ALERT_STORAGE_PREFIX}:${worldId}:${saveSlotId}`
})

const clueStorageKey = computed(() => {
  const worldId = String(props.worldBook?.id || 'default_world_book').trim() || 'default_world_book'
  const saveSlotId = String(props.saveSlotId || 'session_default').trim() || 'session_default'
  return `${CLUE_STORAGE_PREFIX}:${worldId}:${saveSlotId}`
})

const phoneSettingsKey = computed(() => {
  const worldId = String(props.worldBook?.id || 'default_world_book').trim() || 'default_world_book'
  const saveSlotId = String(props.saveSlotId || 'session_default').trim() || 'session_default'
  return `${PHONE_SETTINGS_STORAGE_PREFIX}:${worldId}:${saveSlotId}`
})

const walletStorageKey = computed(() => {
  const worldId = String(props.worldBook?.id || 'default_world_book').trim() || 'default_world_book'
  const saveSlotId = String(props.saveSlotId || 'session_default').trim() || 'session_default'
  return `${PHONE_WALLET_STORAGE_PREFIX}:${worldId}:${saveSlotId}`
})

const shopStorageKey = computed(() => {
  const worldId = String(props.worldBook?.id || 'default_world_book').trim() || 'default_world_book'
  const saveSlotId = String(props.saveSlotId || 'session_default').trim() || 'session_default'
  return `${PHONE_SHOP_STORAGE_PREFIX}:${worldId}:${saveSlotId}`
})

const backpackStorageKey = computed(() => {
  const worldId = String(props.worldBook?.id || 'default_world_book').trim() || 'default_world_book'
  const saveSlotId = String(props.saveSlotId || 'session_default').trim() || 'session_default'
  return `${BACKPACK_STORAGE_PREFIX}:${worldId}:${saveSlotId}`
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

const forumPosts = ref([])
const forumError = ref('')
const isRefreshingForum = ref(false)
const isForumThreadView = ref(false)
const selectedForumPostId = ref('')
const lastForumRefreshAt = ref(0)

const newsEvents = ref([])
const newsError = ref('')
const isRefreshingNews = ref(false)
const isNewsDetailView = ref(false)
const selectedNewsEventId = ref('')
const selectedNewsVersionIndex = ref(0)
const selectedNewsChannel = ref(NEWS_CHANNELS[0])
const lastNewsRefreshAt = ref(0)
const mapData = ref(null)
const mapError = ref('')
const isRefreshingMap = ref(false)
const selectedMapNodeId = ref('')

const alerts = ref([])
const toastAlert = ref(null)
const isAlertsViewOnlyUnread = ref(false)
const clues = ref([])
const clueKeyword = ref('')
const clueSourceFilter = ref('all')
const clueStatusFilter = ref('all')
const clueError = ref('')
const isClueDetailView = ref(false)
const selectedClueId = ref('')
const isClueForwardPickerOpen = ref(false)
const clueForwardTargetId = ref('')
const isForwardingClue = ref(false)
const phoneSettings = ref({ ...DEFAULT_PHONE_SETTINGS })
const SHOP_TAG_OPTIONS = ['全部', '剧情', '工具', '医疗', '电子', '服饰', '收藏']
const shopQuery = ref('')
const selectedShopTag = ref(SHOP_TAG_OPTIONS[0])
const shopResults = ref([])
const shopError = ref('')
const isSearchingShop = ref(false)
const isBuyingItemId = ref('')
const walletBalanceCents = ref(DEFAULT_WALLET_BALANCE_CENTS)
const shopOrderHistory = ref([])
let toastTimer = null

const selectedContact = computed(() => {
  if (!selectedContactId.value) return null
  return contacts.value.find((item) => item.id === selectedContactId.value) || null
})

const selectedThread = computed(() => {
  const id = selectedContactId.value
  if (!id) return []
  return Array.isArray(smsThreads.value[id]) ? smsThreads.value[id] : []
})

const selectedForumPost = computed(() => {
  if (!selectedForumPostId.value) return null
  return forumPosts.value.find((post) => post.id === selectedForumPostId.value) || null
})

const selectedNewsEvent = computed(() => {
  if (!selectedNewsEventId.value) return null
  return newsEvents.value.find((event) => event.id === selectedNewsEventId.value) || null
})

const selectedNewsVersion = computed(() => {
  const event = selectedNewsEvent.value
  if (!event || !Array.isArray(event.versions) || event.versions.length === 0) return null
  const safeIndex = Math.max(0, Math.min(selectedNewsVersionIndex.value, event.versions.length - 1))
  return event.versions[safeIndex] || null
})

const mapLocations = computed(() => (Array.isArray(mapData.value?.locations) ? mapData.value.locations : []))
const selectedMapNode = computed(() => {
  if (mapLocations.value.length === 0) return null
  const selectedId = String(selectedMapNodeId.value || '').trim()
  if (!selectedId) return mapLocations.value[0]
  return mapLocations.value.find((item) => item.id === selectedId) || mapLocations.value[0]
})

const getNewsPrimaryVersion = (event) => {
  if (!event || !Array.isArray(event.versions) || event.versions.length === 0) return null
  return event.versions[0] || null
}

const getNewsEventTimestamp = (event) => {
  const raw = getNewsPrimaryVersion(event)?.timestamp || event?.timestamp
  const parsed = new Date(raw)
  const time = parsed.getTime()
  return Number.isNaN(time) ? 0 : time
}

const getNewsImportanceRank = (importance) => {
  if (importance === 'high') return 3
  if (importance === 'medium') return 2
  return 1
}

const isNewsRumorEvent = (event) => {
  return Array.isArray(event?.versions)
    ? event.versions.some((version) => version?.credibility === 'rumor')
    : false
}

const isNewsDeepEvent = (event) => {
  if (!Array.isArray(event?.versions)) return false
  return event.versions.length >= 3 || event.versions.some((version) => version?.credibility === 'analysis')
}

const newsEventsForList = computed(() => {
  const baseList = [...newsEvents.value]
  const channel = selectedNewsChannel.value
  const sortByTimeline = (a, b) => getNewsEventTimestamp(b) - getNewsEventTimestamp(a)
  const sortByHotness = (a, b) => {
    const rankDiff = getNewsImportanceRank(b?.importance) - getNewsImportanceRank(a?.importance)
    return rankDiff !== 0 ? rankDiff : sortByTimeline(a, b)
  }

  if (channel === '热点') {
    const hotOnly = baseList.filter((event) => event?.importance === 'high')
    return (hotOnly.length > 0 ? hotOnly : baseList).sort(sortByHotness)
  }

  if (channel === '传闻') {
    const rumorOnly = baseList.filter((event) => isNewsRumorEvent(event))
    return (rumorOnly.length > 0 ? rumorOnly : baseList).sort(sortByTimeline)
  }

  if (channel === '深度') {
    const deepOnly = baseList.filter((event) => isNewsDeepEvent(event))
    return (deepOnly.length > 0 ? deepOnly : baseList).sort(sortByTimeline)
  }

  if (channel === '最新') {
    return baseList.sort(sortByTimeline)
  }

  return baseList.sort(sortByHotness)
})

const unreadAlertCount = computed(() =>
  alerts.value.reduce((count, item) => count + (item?.isRead ? 0 : 1), 0),
)

const filteredAlerts = computed(() => {
  const list = [...alerts.value]
  if (isAlertsViewOnlyUnread.value) {
    return list.filter((item) => !item?.isRead)
  }
  return list
})

const filteredClues = computed(() => {
  const keyword = String(clueKeyword.value || '').trim().toLowerCase()
  return clues.value.filter((item) => {
    if (clueSourceFilter.value !== 'all' && item.sourceType !== clueSourceFilter.value) return false
    if (clueStatusFilter.value !== 'all' && item.status !== clueStatusFilter.value) return false
    if (!keyword) return true
    const corpus = `${item.title} ${item.summary} ${(item.tags || []).join(' ')}`.toLowerCase()
    return corpus.includes(keyword)
  })
})

const selectedClue = computed(() => {
  const id = String(selectedClueId.value || '').trim()
  if (!id) return null
  return clues.value.find((item) => item.id === id) || null
})

const clampCooldownSec = (value) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(300, parsed))
}

const clampSmsContextLineCount = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(300, parsed))
}

const clampSmsMaxTokens = (value, fallback = 1200) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(128, Math.min(200000, parsed))
}

const normalizePhoneSettings = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    newsRefreshCooldownSec: clampCooldownSec(source.newsRefreshCooldownSec ?? DEFAULT_PHONE_SETTINGS.newsRefreshCooldownSec),
    forumRefreshCooldownSec: clampCooldownSec(source.forumRefreshCooldownSec ?? DEFAULT_PHONE_SETTINGS.forumRefreshCooldownSec),
    smsHistoryLineCount: clampSmsContextLineCount(
      source.smsHistoryLineCount ?? DEFAULT_PHONE_SETTINGS.smsHistoryLineCount,
      DEFAULT_PHONE_SETTINGS.smsHistoryLineCount,
    ),
    smsDialogueLineCount: clampSmsContextLineCount(
      source.smsDialogueLineCount ?? DEFAULT_PHONE_SETTINGS.smsDialogueLineCount,
      DEFAULT_PHONE_SETTINGS.smsDialogueLineCount,
    ),
    smsMaxTokens: clampSmsMaxTokens(
      source.smsMaxTokens ?? DEFAULT_PHONE_SETTINGS.smsMaxTokens,
      DEFAULT_PHONE_SETTINGS.smsMaxTokens,
    ),
  }
}

const clampWalletCents = (value, fallback = DEFAULT_WALLET_BALANCE_CENTS) => {
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(9_999_999_99, parsed))
}

const formatCents = (value) => {
  const cents = clampWalletCents(value, 0)
  return `¥${(cents / 100).toFixed(2)}`
}

const parsePriceToCents = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value * 100))
  }

  const text = String(value ?? '').trim()
  if (!text) return fallback
  const cleaned = text.replace(/[￥¥元,\s]/g, '')
  const matched = cleaned.match(/-?\d+(?:\.\d+)?/)
  if (!matched) return fallback
  const parsed = Number.parseFloat(matched[0])
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.round(parsed * 100))
}

const normalizeShopItem = (rawItem, index = 0) => {
  const name = String(rawItem?.name || rawItem?.title || rawItem?.productName || '').trim()
  if (!name) return null

  const description = String(
    rawItem?.description ||
    rawItem?.summary ||
    rawItem?.detail ||
    rawItem?.content ||
    '',
  ).trim()

  const tags = Array.isArray(rawItem?.tags)
    ? rawItem.tags
        .map((tag) => String(tag || '').trim())
        .filter(Boolean)
        .slice(0, 6)
    : []

  const directPriceCents = clampWalletCents(rawItem?.priceCents, 0)
  const priceCents = directPriceCents > 0
    ? directPriceCents
    : parsePriceToCents(rawItem?.price ?? rawItem?.amount ?? rawItem?.cost, 0)
  if (priceCents <= 0) return null

  return {
    id: String(rawItem?.id || `shop_item_${Date.now()}_${index}`).trim() || `shop_item_${Date.now()}_${index}`,
    name,
    description,
    tags,
    priceCents,
    priceText: formatCents(priceCents),
  }
}

const normalizeShopResults = (rawList) => {
  if (!Array.isArray(rawList)) return []
  return rawList
    .map((item, index) => normalizeShopItem(item, index))
    .filter(Boolean)
    .slice(0, MAX_SHOP_RESULTS)
}

const normalizeShopOrder = (rawItem, index = 0) => {
  const name = String(rawItem?.name || '').trim()
  if (!name) return null
  const priceCents = clampWalletCents(rawItem?.priceCents, 0)
  if (priceCents <= 0) return null
  const quantity = Math.max(1, Math.min(99, Number.parseInt(String(rawItem?.quantity), 10) || 1))
  const totalCents = clampWalletCents(rawItem?.totalCents, priceCents * quantity)

  return {
    id: String(rawItem?.id || `shop_order_${Date.now()}_${index}`).trim() || `shop_order_${Date.now()}_${index}`,
    itemId: String(rawItem?.itemId || '').trim(),
    name,
    description: String(rawItem?.description || '').trim(),
    tags: Array.isArray(rawItem?.tags)
      ? rawItem.tags.map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 6)
      : [],
    priceCents,
    totalCents,
    quantity,
    timestamp: String(rawItem?.timestamp || new Date().toISOString()),
  }
}

const normalizeShopOrders = (rawList) => {
  if (!Array.isArray(rawList)) return []
  return rawList
    .map((item, index) => normalizeShopOrder(item, index))
    .filter(Boolean)
    .slice(0, MAX_SHOP_ORDERS)
}

const walletBalanceText = computed(() => formatCents(walletBalanceCents.value))

const persistWallet = async () => {
  try {
    await kvStorage.set(walletStorageKey.value, {
      balanceCents: clampWalletCents(walletBalanceCents.value, DEFAULT_WALLET_BALANCE_CENTS),
    })
  } catch {
    // no-op
  }
}

const loadWallet = async () => {
  try {
    const raw = await kvStorage.get(walletStorageKey.value)
    const source = raw && typeof raw === 'object' ? raw : {}
    walletBalanceCents.value = clampWalletCents(source.balanceCents, DEFAULT_WALLET_BALANCE_CENTS)
  } catch {
    walletBalanceCents.value = DEFAULT_WALLET_BALANCE_CENTS
  }
}

const persistShopState = async () => {
  try {
    await kvStorage.set(shopStorageKey.value, {
      results: shopResults.value.slice(0, MAX_SHOP_RESULTS),
      orders: shopOrderHistory.value.slice(0, MAX_SHOP_ORDERS),
      query: String(shopQuery.value || '').trim(),
      tag: String(selectedShopTag.value || SHOP_TAG_OPTIONS[0]).trim() || SHOP_TAG_OPTIONS[0],
    })
  } catch {
    // no-op
  }
}

const loadShopState = async () => {
  try {
    const raw = await kvStorage.get(shopStorageKey.value)
    const source = raw && typeof raw === 'object' ? raw : {}
    shopResults.value = normalizeShopResults(source.results)
    shopOrderHistory.value = normalizeShopOrders(source.orders)
    shopQuery.value = String(source.query || '').trim()
    const tag = String(source.tag || '').trim()
    selectedShopTag.value = SHOP_TAG_OPTIONS.includes(tag) ? tag : SHOP_TAG_OPTIONS[0]
  } catch {
    shopResults.value = []
    shopOrderHistory.value = []
    shopQuery.value = ''
    selectedShopTag.value = SHOP_TAG_OPTIONS[0]
  }
}

const buildShopSearchTags = () => {
  const tagSet = new Set()
  if (selectedShopTag.value && selectedShopTag.value !== SHOP_TAG_OPTIONS[0]) {
    tagSet.add(selectedShopTag.value)
  }

  const queryTags = String(shopQuery.value || '')
    .split(/[、,，\s/|]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
  queryTags.forEach((item) => tagSet.add(item))
  return [...tagSet].slice(0, 8)
}

const makeBackpackItemId = (shopItem) => {
  const sourceId = String(shopItem?.id || '').trim()
  if (sourceId) return `shop_${sourceId}`
  const normalizedName = String(shopItem?.name || '').trim()
  const safeName = normalizedName.replace(/[^\w\u4e00-\u9fa5]+/g, '_').slice(0, 28) || 'item'
  return `shop_${safeName}`
}

const addItemToBackpack = async (shopItem, quantity = 1) => {
  const addCount = Math.max(1, Math.min(99, Number.parseInt(String(quantity), 10) || 1))
  const nextItemId = makeBackpackItemId(shopItem)
  const worldBookId = String(props.worldBook?.id || '').trim()
  const saveSlotId = String(props.saveSlotId || '').trim()

  let nextItems = []
  try {
    const raw = await kvStorage.get(backpackStorageKey.value)
    const sourceItems = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === 'object' && Array.isArray(raw.items) ? raw.items : [])
    const normalized = sourceItems
      .map((item, index) => ({
        id: String(item?.id || `bag_item_${index + 1}`).trim(),
        name: String(item?.name || '').trim(),
        description: String(item?.description || '').trim(),
        category: String(item?.category || '物品').trim() || '物品',
        rarity: String(item?.rarity || 'common').trim() || 'common',
        tags: Array.isArray(item?.tags)
          ? item.tags.map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 8)
          : [],
        count: Math.max(0, Number.parseInt(String(item?.count), 10) || 0),
      }))
      .filter((item) => item.name && item.count > 0)

    let merged = false
    nextItems = normalized.map((item) => {
      if (item.id !== nextItemId) return item
      merged = true
      return {
        ...item,
        description: item.description || String(shopItem?.description || '').trim(),
        category: item.category || '网购',
        tags: item.tags.length > 0 ? item.tags : (Array.isArray(shopItem?.tags) ? shopItem.tags : []),
        count: Math.min(999, item.count + addCount),
      }
    })

    if (!merged) {
      nextItems.push({
        id: nextItemId,
        name: String(shopItem?.name || '').trim() || '未命名商品',
        description: String(shopItem?.description || '').trim(),
        category: '网购',
        rarity: 'common',
        tags: Array.isArray(shopItem?.tags)
          ? shopItem.tags.map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 8)
          : [],
        count: addCount,
      })
    }

    nextItems = nextItems.slice(0, 180)
    await kvStorage.set(backpackStorageKey.value, nextItems)
  } catch {
    return false
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('backpack-items-updated', {
      detail: {
        worldBookId,
        saveSlotId,
        itemId: nextItemId,
        itemName: String(shopItem?.name || '').trim(),
      },
    }))
  }

  return true
}

const handleSearchShop = async () => {
  if (isSearchingShop.value) return
  shopError.value = ''
  isSearchingShop.value = true

  try {
    const result = await generatePhoneShopItems({
      worldBook: props.worldBook,
      dialogueHistory: props.dialogueHistory,
      currentLine: props.currentLine,
      query: String(shopQuery.value || '').trim(),
      tags: buildShopSearchTags(),
      recentOrders: shopOrderHistory.value.slice(0, 6).map((order) => ({
        name: order.name,
        price: formatCents(order.priceCents),
      })),
      resultCount: 8,
    })

    if (!result.success || !Array.isArray(result.items) || result.items.length === 0) {
      shopError.value = result.error || '暂无商品，请换个关键词试试'
      return
    }

    const normalized = normalizeShopResults(result.items)
    if (normalized.length === 0) {
      shopError.value = '商品解析失败，请重试'
      return
    }

    shopResults.value = normalized
    await persistShopState()
  } catch {
    shopError.value = '搜索失败，请稍后重试'
  } finally {
    isSearchingShop.value = false
  }
}

const selectShopTag = async (tag) => {
  if (!SHOP_TAG_OPTIONS.includes(tag)) return
  selectedShopTag.value = tag
  await persistShopState()
}

const handleBuyShopItem = async (item) => {
  if (isBuyingItemId.value) return
  if (!item) return
  const priceCents = clampWalletCents(item.priceCents, 0)
  if (priceCents <= 0) {
    shopError.value = '商品价格无效，暂无法购买'
    return
  }

  if (walletBalanceCents.value < priceCents) {
    shopError.value = `余额不足，当前 ${formatCents(walletBalanceCents.value)}`
    return
  }

  isBuyingItemId.value = item.id
  shopError.value = ''
  try {
    const added = await addItemToBackpack(item, 1)
    if (!added) {
      shopError.value = '加入背包失败，请重试'
      return
    }

    walletBalanceCents.value = Math.max(0, walletBalanceCents.value - priceCents)
    shopOrderHistory.value = [
      {
        id: `shop_order_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        itemId: item.id,
        name: item.name,
        description: item.description || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        priceCents,
        totalCents: priceCents,
        quantity: 1,
        timestamp: new Date().toISOString(),
      },
      ...shopOrderHistory.value,
    ].slice(0, MAX_SHOP_ORDERS)

    await persistWallet()
    await persistShopState()
  } finally {
    isBuyingItemId.value = ''
  }
}

const newsRefreshCooldownMs = computed(() => clampCooldownSec(phoneSettings.value.newsRefreshCooldownSec) * 1000)
const forumRefreshCooldownMs = computed(() => clampCooldownSec(phoneSettings.value.forumRefreshCooldownSec) * 1000)

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

const createAlertId = () => `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
const createClueId = () => `clue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

const normalizeAlertItem = (rawItem, index = 0) => {
  const title = String(rawItem?.title || '').trim()
  const content = String(rawItem?.content || '').trim()
  if (!title || !content) return null

  return {
    id: String(rawItem?.id || `alert_${Date.now()}_${index}`),
    type: String(rawItem?.type || 'system').trim() || 'system',
    title,
    content,
    sourceApp: String(rawItem?.sourceApp || '').trim(),
    sourceId: String(rawItem?.sourceId || '').trim(),
    dedupeKey: String(rawItem?.dedupeKey || '').trim(),
    isRead: Boolean(rawItem?.isRead),
    timestamp: String(rawItem?.timestamp || new Date().toISOString()),
  }
}

const normalizeAlerts = (rawList) => {
  if (!Array.isArray(rawList)) return []
  return rawList
    .map((item, index) => normalizeAlertItem(item, index))
    .filter(Boolean)
    .slice(0, MAX_ALERTS)
}

const normalizeClueItem = (rawItem, index = 0) => {
  const title = String(rawItem?.title || '').trim()
  const summary = String(rawItem?.summary || '').trim()
  if (!title || !summary) return null

  const sourceType = String(rawItem?.sourceType || 'system').trim() || 'system'
  const status = rawItem?.status === 'resolved' ? 'resolved' : 'open'
  const tags = Array.isArray(rawItem?.tags)
    ? rawItem.tags
        .map((tag) => String(tag || '').trim())
        .filter(Boolean)
        .slice(0, 6)
    : []

  return {
    id: String(rawItem?.id || `clue_${Date.now()}_${index}`),
    sourceType,
    sourceId: String(rawItem?.sourceId || '').trim(),
    dedupeKey: String(rawItem?.dedupeKey || '').trim(),
    title,
    summary,
    tags,
    status,
    timestamp: String(rawItem?.timestamp || new Date().toISOString()),
  }
}

const normalizeClues = (rawList) => {
  if (!Array.isArray(rawList)) return []
  return rawList
    .map((item, index) => normalizeClueItem(item, index))
    .filter(Boolean)
    .slice(0, MAX_CLUES)
}

const persistAlerts = async () => {
  // 通知改为仅内存态，不做本地持久化
}

const loadAlerts = async () => {
  // 每次进入/切换存档都从空通知开始
  alerts.value = []
}

const persistClues = async () => {
  try {
    await kvStorage.set(clueStorageKey.value, clues.value.slice(0, MAX_CLUES))
  } catch {
    // no-op
  }
}

const loadClues = async () => {
  try {
    const raw = await kvStorage.get(clueStorageKey.value)
    clues.value = normalizeClues(raw)
  } catch {
    clues.value = []
  }
}

const persistPhoneSettings = async () => {
  try {
    await kvStorage.set(phoneSettingsKey.value, normalizePhoneSettings(phoneSettings.value))
  } catch {
    // no-op
  }
}

const loadPhoneSettings = async () => {
  try {
    const raw = await kvStorage.get(phoneSettingsKey.value)
    phoneSettings.value = normalizePhoneSettings(raw)
  } catch {
    phoneSettings.value = { ...DEFAULT_PHONE_SETTINGS }
  }
}

const updatePhoneRefreshCooldown = async (field, value) => {
  if (field !== 'newsRefreshCooldownSec' && field !== 'forumRefreshCooldownSec') return
  phoneSettings.value = {
    ...phoneSettings.value,
    [field]: clampCooldownSec(value),
  }
  await persistPhoneSettings()
}

const updatePhoneSmsSetting = async (field, value) => {
  if (field !== 'smsHistoryLineCount' && field !== 'smsDialogueLineCount' && field !== 'smsMaxTokens') return
  const nextValue = field === 'smsMaxTokens'
    ? clampSmsMaxTokens(value, phoneSettings.value.smsMaxTokens)
    : clampSmsContextLineCount(value, phoneSettings.value[field])
  phoneSettings.value = {
    ...phoneSettings.value,
    [field]: nextValue,
  }
  await persistPhoneSettings()
}

const dismissToast = () => {
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
  toastAlert.value = null
}

const showToastAlert = (alertItem) => {
  toastAlert.value = alertItem
  if (toastTimer) {
    clearTimeout(toastTimer)
  }
  toastTimer = setTimeout(() => {
    toastAlert.value = null
    toastTimer = null
  }, 2600)
}

const markAllAlertsRead = async () => {
  if (alerts.value.length === 0) return
  alerts.value = alerts.value.map((item) => ({ ...item, isRead: true }))
  await persistAlerts()
}

const markAlertRead = async (alertId) => {
  const id = String(alertId || '').trim()
  if (!id) return
  let changed = false
  alerts.value = alerts.value.map((item) => {
    if (item.id !== id || item.isRead) return item
    changed = true
    return { ...item, isRead: true }
  })
  if (changed) {
    await persistAlerts()
  }
}

const pushAlert = async ({
  type = 'system',
  title = '',
  content = '',
  sourceApp = '',
  sourceId = '',
  dedupeKey = '',
  silentToast = false,
} = {}) => {
  const normalizedTitle = String(title || '').trim()
  const normalizedContent = String(content || '').trim()
  if (!normalizedTitle || !normalizedContent) return null

  const normalizedDedupeKey = String(dedupeKey || '').trim()
  if (normalizedDedupeKey) {
    const exists = alerts.value.some((item) => item.dedupeKey && item.dedupeKey === normalizedDedupeKey)
    if (exists) return null
  }

  const alertItem = {
    id: createAlertId(),
    type: String(type || 'system').trim() || 'system',
    title: normalizedTitle,
    content: normalizedContent,
    sourceApp: String(sourceApp || '').trim(),
    sourceId: String(sourceId || '').trim(),
    dedupeKey: normalizedDedupeKey,
    isRead: false,
    timestamp: new Date().toISOString(),
  }

  alerts.value = [alertItem, ...alerts.value].slice(0, MAX_ALERTS)
  await persistAlerts()

  if (!silentToast) {
    showToastAlert(alertItem)
  }

  return alertItem
}

const getClueSourceLabel = (sourceType) => {
  if (sourceType === 'news') return '新闻'
  if (sourceType === 'forum') return '论坛'
  if (sourceType === 'sms') return '短信'
  return '系统'
}

const isClueCollected = (dedupeKey) => {
  const key = String(dedupeKey || '').trim()
  if (!key) return false
  return clues.value.some((item) => item.dedupeKey === key)
}

const addClue = async (payload = {}) => {
  clueError.value = ''
  const dedupeKey = String(payload?.dedupeKey || '').trim()
  if (dedupeKey && isClueCollected(dedupeKey)) {
    clueError.value = '该线索已在列表中'
    return false
  }

  const normalized = normalizeClueItem(
    {
      id: createClueId(),
      sourceType: payload?.sourceType || 'system',
      sourceId: payload?.sourceId || '',
      dedupeKey,
      title: payload?.title || '',
      summary: payload?.summary || '',
      tags: Array.isArray(payload?.tags) ? payload.tags : [],
      status: payload?.status || 'open',
      timestamp: payload?.timestamp || new Date().toISOString(),
    },
    0,
  )

  if (!normalized) {
    clueError.value = '线索信息不完整'
    return false
  }

  clues.value = [normalized, ...clues.value].slice(0, MAX_CLUES)
  await persistClues()
  return true
}

const toggleClueStatus = async (clueId) => {
  const id = String(clueId || '').trim()
  if (!id) return
  clues.value = clues.value.map((item) => {
    if (item.id !== id) return item
    return {
      ...item,
      status: item.status === 'resolved' ? 'open' : 'resolved',
    }
  })
  await persistClues()
}

const removeClue = async (clueId) => {
  const id = String(clueId || '').trim()
  if (!id) return
  clues.value = clues.value.filter((item) => item.id !== id)
  await persistClues()
}

const ensureClueForwardTarget = () => {
  if (contacts.value.length === 0) {
    clueForwardTargetId.value = ''
    return
  }
  const exists = contacts.value.some((item) => item.id === clueForwardTargetId.value)
  if (!exists) {
    clueForwardTargetId.value = contacts.value[0].id
  }
}

const openClueDetail = (clueId) => {
  const id = String(clueId || '').trim()
  if (!id) return
  const exists = clues.value.some((item) => item.id === id)
  if (!exists) return
  selectedClueId.value = id
  isClueDetailView.value = true
  isClueForwardPickerOpen.value = false
  clueError.value = ''
}

const showClueList = () => {
  isClueDetailView.value = false
  selectedClueId.value = ''
  isClueForwardPickerOpen.value = false
  clueError.value = ''
}

const handleDeleteCurrentClue = async () => {
  const item = selectedClue.value
  if (!item?.id) return
  await removeClue(item.id)
  showClueList()
}

const addClueFromNewsEvent = async (event) => {
  if (!event?.id) return
  const primary = getNewsPrimaryVersion(event)
  await addClue({
    sourceType: 'news',
    sourceId: String(event.id),
    dedupeKey: `news:${event.id}`,
    title: String(primary?.headline || event.topic || '').trim(),
    summary: String(primary?.summary || event.topic || '').trim(),
    tags: [String(event.topic || '').trim(), String(primary?.outlet || '').trim()].filter(Boolean),
    timestamp: event.timestamp || primary?.timestamp || new Date().toISOString(),
  })
}

const addClueFromForumPost = async (post) => {
  if (!post?.id) return
  await addClue({
    sourceType: 'forum',
    sourceId: String(post.id),
    dedupeKey: `forum:${post.id}`,
    title: String(post.title || '').trim(),
    summary: String(post.preview || post.content || '').trim(),
    tags: [String(post.tag || '').trim(), String(post.authorName || '').trim()].filter(Boolean),
    timestamp: post.timestamp || new Date().toISOString(),
  })
}

const handleToastClick = async () => {
  isPhoneVisible.value = true
  currentApp.value = 'alerts'
  isAlertsViewOnlyUnread.value = false
  dismissToast()
  await markAllAlertsRead()
}

const jumpByAlert = async (alertItem) => {
  if (!alertItem) return
  await markAlertRead(alertItem.id)
  const sourceApp = String(alertItem.sourceApp || '').trim()
  const sourceId = String(alertItem.sourceId || '').trim()
  if (!sourceApp) return

  if (sourceApp === 'forum') {
    currentApp.value = 'forum'
    forumError.value = ''
    isForumThreadView.value = false
    if (forumPosts.value.length === 0) {
      await handleRefreshForum()
    }
    if (sourceId && forumPosts.value.some((item) => item.id === sourceId)) {
      openForumPost(sourceId)
    }
    return
  }

  if (sourceApp === 'news') {
    currentApp.value = 'news'
    newsError.value = ''
    isNewsDetailView.value = false
    if (newsEvents.value.length === 0) {
      await handleRefreshNews()
    }
    if (sourceId && newsEvents.value.some((item) => item.id === sourceId)) {
      openNewsEvent(sourceId)
    }
    return
  }

  if (sourceApp === 'messages') {
    currentApp.value = 'messages'
    const contactId = sourceId
    if (contactId) {
      await selectMessageContact(contactId)
    }
    return
  }

  if (sourceApp === 'clues') {
    currentApp.value = 'clues'
  }
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

const FORUM_TAG_POOL = ['情报', '目击', '讨论', '求证', '考据', '吐槽', '八卦']
const FORUM_OBSERVER_POOL = [
  '夜班保安',
  '旧城区店主',
  '匿名旅人',
  '图书馆管理员',
  '港口搬运工',
  '路边摊主',
  '论坛版主',
  '晨报记者',
]

const toSnippet = (value, maxLength = 18) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

const normalizeForumComment = (rawItem, index = 0) => {
  const text = String(rawItem?.text || '').trim()
  if (!text) return null

  const authorName = String(rawItem?.authorName || '匿名用户').trim() || '匿名用户'
  return {
    id: String(rawItem?.id || `forum_comment_${index}_${Date.now()}`),
    authorName,
    text,
    timestamp: String(rawItem?.timestamp || new Date().toISOString()),
  }
}

const normalizeForumPost = (rawItem, index = 0) => {
  const title = String(rawItem?.title || '').trim()
  const content = String(rawItem?.content || '').trim()
  if (!title || !content) return null

  const comments = Array.isArray(rawItem?.comments)
    ? rawItem.comments
      .map((comment, commentIndex) => normalizeForumComment(comment, commentIndex))
      .filter(Boolean)
    : []

  const views = Math.max(0, Number(rawItem?.views) || 0)
  const replies = Math.max(0, Number(rawItem?.replies) || comments.length)
  const likes = Math.max(0, Number(rawItem?.likes) || Math.floor(views * 0.14))

  return {
    id: String(rawItem?.id || `forum_post_${index}_${Date.now()}`),
    authorName: String(rawItem?.authorName || '匿名用户').trim() || '匿名用户',
    tag: String(rawItem?.tag || '讨论').trim() || '讨论',
    title,
    preview: String(rawItem?.preview || toSnippet(content, 36)).trim() || toSnippet(content, 36),
    content,
    timestamp: String(rawItem?.timestamp || new Date().toISOString()),
    views,
    replies,
    likes,
    isHot: Boolean(rawItem?.isHot),
    comments,
  }
}

const normalizeForumPosts = (rawPosts) => {
  if (!Array.isArray(rawPosts)) return []
  return rawPosts
    .map((item, index) => normalizeForumPost(item, index))
    .filter(Boolean)
}

const NEWS_MEDIA_POOL = [
  { name: '晨星快报', style: '都市快讯，信息密度高，标题直接' },
  { name: '群岛观察', style: '深度调查，重证据与线索串联' },
  { name: '边境财经', style: '财经视角，关注资源与价格波动' },
  { name: '晚潮评论', style: '评论社论，强调观点冲突' },
  { name: '街角小报', style: '市井八卦，语气活泼但夹杂传闻' },
  { name: '公共频道', style: '公信力口吻，偏官方播报' },
  { name: '自由撰稿人联盟', style: '独立媒体，兼顾见闻与质疑' },
]

const normalizeNewsCredibility = (value) => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'confirmed' || raw === 'rumor' || raw === 'analysis') return raw
  if (raw === 'verified') return 'confirmed'
  return 'analysis'
}

const formatNewsCredibilityLabel = (value) => {
  if (value === 'confirmed') return '已证实'
  if (value === 'rumor') return '传闻'
  return '分析'
}

const normalizeNewsImportance = (value) => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw
  return 'medium'
}

const formatNewsImportanceLabel = (value) => {
  if (value === 'high') return '高'
  if (value === 'low') return '低'
  return '中'
}

const normalizeNewsVersion = (rawItem, index = 0) => {
  const headline = String(rawItem?.headline || rawItem?.title || '').trim()
  const summary = String(rawItem?.summary || rawItem?.lead || rawItem?.content || '').trim()
  if (!headline || !summary) return null

  const fallbackMedia = NEWS_MEDIA_POOL[index % NEWS_MEDIA_POOL.length]
  const outlet = String(rawItem?.outlet || rawItem?.media || fallbackMedia?.name || `媒体${index + 1}`).trim() || `媒体${index + 1}`
  const style = String(rawItem?.style || rawItem?.tone || fallbackMedia?.style || '').trim()
  const angle = String(rawItem?.angle || rawItem?.stance || '').trim()

  return {
    id: String(rawItem?.id || `news_ver_${Date.now()}_${index}`),
    outlet,
    style,
    headline,
    summary,
    angle,
    credibility: normalizeNewsCredibility(rawItem?.credibility || rawItem?.status),
    timestamp: String(rawItem?.timestamp || new Date().toISOString()),
  }
}

const normalizeNewsEvent = (rawItem, index = 0) => {
  const topic = String(rawItem?.topic || rawItem?.event || rawItem?.eventTitle || '').trim()
  if (!topic) return null

  const versions = Array.isArray(rawItem?.versions)
    ? rawItem.versions
        .map((version, versionIndex) => normalizeNewsVersion(version, versionIndex))
        .filter(Boolean)
    : []
  if (versions.length === 0) return null

  return {
    id: String(rawItem?.id || `news_event_${Date.now()}_${index}`),
    topic,
    importance: normalizeNewsImportance(rawItem?.importance),
    timestamp: String(rawItem?.timestamp || versions[0]?.timestamp || new Date().toISOString()),
    versions,
  }
}

const normalizeNewsEvents = (rawEvents) => {
  if (!Array.isArray(rawEvents)) return []
  return rawEvents
    .map((item, index) => normalizeNewsEvent(item, index))
    .filter(Boolean)
}

const resolveMapSceneNameFromLine = () => {
  const currentSceneName = String(props.currentLine?.sceneName || '').trim()
  if (currentSceneName) return currentSceneName

  const sceneRaw = props.currentLine?.scene
  if (typeof sceneRaw === 'string') {
    const sceneText = String(sceneRaw).trim()
    if (sceneText) return sceneText
  }

  if (sceneRaw && typeof sceneRaw === 'object') {
    const sceneName = String(sceneRaw.name || sceneRaw.sceneName || sceneRaw.id || '').trim()
    if (sceneName) return sceneName
  }

  const worldSceneName = String(props.worldBook?.currentSceneName || props.worldBook?.activeSceneName || '').trim()
  if (worldSceneName) return worldSceneName

  return String(props.worldBook?.scenes?.[0]?.name || '').trim()
}

const clampMapPercent = (value, fallback = 50) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  const maybePercent = num >= 0 && num <= 1 ? num * 100 : num
  return Math.max(0, Math.min(100, Math.round(maybePercent)))
}

const normalizeMapRisk = (value) => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'low' || raw === 'safe') return 'low'
  if (raw === 'high' || raw === 'danger' || raw === 'dangerous') return 'high'
  return 'medium'
}

const normalizeMapConnections = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 10)
  }

  const text = String(value || '').trim()
  if (!text) return []
  return text
    .split(/[、,，/|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10)
}

const createMapLocationId = (name, fallbackIndex = 0) => {
  const token = String(name || '')
    .trim()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28)
  return token ? `map_${token}` : `map_loc_${fallbackIndex + 1}`
}

const normalizeMapLocation = (rawItem, index = 0) => {
  const name = String(rawItem?.name || rawItem?.title || rawItem?.label || '').trim()
  if (!name) return null

  const id = String(rawItem?.id || createMapLocationId(name, index)).trim() || createMapLocationId(name, index)
  const desc = String(rawItem?.desc || rawItem?.description || rawItem?.summary || '').trim()
  const tags = Array.isArray(rawItem?.tags)
    ? rawItem.tags
        .map((tag) => String(tag || '').trim())
        .filter(Boolean)
        .slice(0, 6)
    : []

  return {
    id,
    name,
    x: clampMapPercent(rawItem?.x ?? rawItem?.positionX ?? rawItem?.left, 20 + (index % 4) * 20),
    y: clampMapPercent(rawItem?.y ?? rawItem?.positionY ?? rawItem?.top, 20 + Math.floor(index / 4) * 20),
    desc,
    risk: normalizeMapRisk(rawItem?.risk || rawItem?.danger || rawItem?.threat),
    tags,
    connections: normalizeMapConnections(rawItem?.connections || rawItem?.links || rawItem?.neighbors),
  }
}

const buildFallbackMapData = () => {
  const worldTitle = toSnippet(props.worldBook?.title, 12) || '剧情'
  const sourceScenes = Array.isArray(props.worldBook?.scenes) ? props.worldBook.scenes : []
  const sceneItems = sourceScenes
    .map((scene, index) => {
      const name = String(scene?.name || '').trim()
      if (!name) return null
      return {
        id: createMapLocationId(name, index),
        name,
        desc: String(scene?.description || '').trim(),
        risk: 'medium',
        tags: ['场景'],
      }
    })
    .filter(Boolean)
    .slice(0, 12)

  const baseList = sceneItems.length > 0
    ? sceneItems
    : [{
      id: 'map_current',
      name: resolveMapSceneNameFromLine() || '当前位置',
      desc: '当前剧情所在地点',
      risk: 'medium',
      tags: ['主线'],
    }]

  const count = baseList.length
  const withPosition = baseList.map((item, index) => {
    if (count === 1) {
      return {
        ...item,
        x: 50,
        y: 52,
        connections: [],
      }
    }

    const angle = ((Math.PI * 2) / count) * index - Math.PI / 2
    const x = Math.round(50 + Math.cos(angle) * 34)
    const y = Math.round(52 + Math.sin(angle) * 26)
    const prev = baseList[(index - 1 + count) % count]?.id
    const next = baseList[(index + 1) % count]?.id
    return {
      ...item,
      x: clampMapPercent(x, 50),
      y: clampMapPercent(y, 52),
      connections: [prev, next].filter(Boolean),
    }
  })

  const currentSceneName = resolveMapSceneNameFromLine()
  const matched = withPosition.find((item) => item.name === currentSceneName) || withPosition[0]

  return {
    title: `${worldTitle}地图`,
    currentLocationId: matched?.id || withPosition[0]?.id || '',
    currentLocationName: matched?.name || withPosition[0]?.name || '',
    locations: withPosition,
    generated: false,
    updatedAt: new Date().toISOString(),
  }
}

const normalizeMapData = (rawData, options = {}) => {
  const source = rawData && typeof rawData === 'object' ? rawData : {}
  const rawLocations = Array.isArray(source.locations)
    ? source.locations
    : (Array.isArray(source.nodes) ? source.nodes : (Array.isArray(source.points) ? source.points : []))

  const fallbackData = options?.fallback && typeof options.fallback === 'object'
    ? options.fallback
    : buildFallbackMapData()

  const normalizedLocations = rawLocations
    .map((item, index) => normalizeMapLocation(item, index))
    .filter(Boolean)
    .slice(0, 20)

  if (normalizedLocations.length === 0) {
    return fallbackData
  }

  const usedIds = new Set()
  const uniqueLocations = normalizedLocations.map((item, index) => {
    let nextId = String(item.id || '').trim() || createMapLocationId(item.name, index)
    if (usedIds.has(nextId)) {
      nextId = `${nextId}_${index + 1}`
    }
    usedIds.add(nextId)
    return {
      ...item,
      id: nextId,
    }
  })

  const idSet = new Set(uniqueLocations.map((item) => item.id))
  const locations = uniqueLocations.map((item) => ({
    ...item,
    connections: item.connections.filter((targetId) => idSet.has(targetId) && targetId !== item.id),
  }))

  const title = String(source.title || source.name || source.mapName || fallbackData.title || '剧情地图').trim() || '剧情地图'
  const rawCurrentId = String(source.currentLocationId || '').trim()
  const rawCurrentName = String(source.currentLocationName || source.currentLocation || '').trim()
  const currentSceneName = resolveMapSceneNameFromLine()

  let currentNode =
    locations.find((item) => item.id === rawCurrentId) ||
    locations.find((item) => item.name === rawCurrentName) ||
    locations.find((item) => currentSceneName && item.name === currentSceneName) ||
    locations[0]

  if (!currentNode) {
    currentNode = locations[0]
  }

  return {
    title,
    currentLocationId: currentNode?.id || '',
    currentLocationName: currentNode?.name || '',
    locations,
    generated: Boolean(source.generated),
    updatedAt: String(source.updatedAt || new Date().toISOString()),
  }
}

const ensureMapSelection = () => {
  if (mapLocations.value.length === 0) {
    selectedMapNodeId.value = ''
    return
  }

  const currentSelectedId = String(selectedMapNodeId.value || '').trim()
  const exists = mapLocations.value.some((item) => item.id === currentSelectedId)
  if (exists) return

  const currentLocationId = String(mapData.value?.currentLocationId || '').trim()
  if (currentLocationId && mapLocations.value.some((item) => item.id === currentLocationId)) {
    selectedMapNodeId.value = currentLocationId
    return
  }

  selectedMapNodeId.value = mapLocations.value[0].id
}

const persistMapData = async () => {
  try {
    await kvStorage.set(mapStorageKey.value, mapData.value || buildFallbackMapData())
  } catch {
    // no-op
  }
}

const loadMapData = async () => {
  try {
    const raw = await kvStorage.get(mapStorageKey.value)
    mapData.value = normalizeMapData(raw)
  } catch {
    mapData.value = buildFallbackMapData()
  } finally {
    ensureMapSelection()
  }
}

const selectMapNode = (nodeId) => {
  const id = String(nodeId || '').trim()
  if (!id) return
  if (!mapLocations.value.some((item) => item.id === id)) return
  selectedMapNodeId.value = id
}

const getMapNodeStyle = (node) => ({
  left: `${clampMapPercent(node?.x, 50)}%`,
  top: `${clampMapPercent(node?.y, 50)}%`,
})

const buildMapTravelPrompt = (node) => {
  const locationName = String(node?.name || '').trim() || '未知地点'
  const locationDesc = String(node?.desc || '').trim()
  const riskLabel = node?.risk === 'high' ? '高风险' : (node?.risk === 'low' ? '低风险' : '中风险')

  return [
    `角色已切换到地图地点「${locationName}」。`,
    locationDesc ? `地点说明：${locationDesc}` : '',
    `地点风险等级：${riskLabel}。`,
    '请继续生成主线剧情，并让新剧情明确发生在该地点。',
    `请在新生成的对话中把 scene 字段设置为「${locationName}」或对应场景ID。`,
  ]
    .filter(Boolean)
    .join('\n')
}

const handleTravelToMapNode = async (node) => {
  if (!node?.id) return

  const selectedNode = mapLocations.value.find((item) => item.id === node.id)
  if (!selectedNode) return

  mapError.value = ''
  mapData.value = normalizeMapData({
    ...mapData.value,
    currentLocationId: selectedNode.id,
    currentLocationName: selectedNode.name,
    generated: Boolean(mapData.value?.generated),
    updatedAt: new Date().toISOString(),
  }, { fallback: buildFallbackMapData() })
  ensureMapSelection()
  await persistMapData()

  const worldBookId = String(props.worldBook?.id || '').trim()
  const saveSlotId = String(props.saveSlotId || '').trim()
  const promptText = buildMapTravelPrompt(selectedNode)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('phone-map-travel-request', {
      detail: {
        worldBookId,
        saveSlotId,
        locationId: selectedNode.id,
        locationName: selectedNode.name,
        locationSummary: selectedNode.desc,
        promptText,
      },
    }))
  }
}

const handleRefreshMap = async () => {
  if (isRefreshingMap.value) return
  mapError.value = ''
  isRefreshingMap.value = true

  try {
    const result = await generatePhoneMapData({
      worldBook: props.worldBook,
      dialogueHistory: props.dialogueHistory,
      currentLine: props.currentLine,
      previousMapData: mapData.value,
      locationCount: 8,
    })

    if (!result.success || !result.map) {
      mapError.value = result.error || '地图刷新失败，请检查 API 设置'
      return
    }

    mapData.value = normalizeMapData({
      ...result.map,
      generated: true,
      updatedAt: new Date().toISOString(),
    }, { fallback: buildFallbackMapData() })
    ensureMapSelection()
    await persistMapData()
  } catch {
    mapError.value = '地图刷新失败，请重试'
  } finally {
    isRefreshingMap.value = false
  }
}

const persistForumPosts = async () => {
  try {
    await kvStorage.set(forumStorageKey.value, forumPosts.value)
  } catch {
    // no-op
  }
}

const ensureForumSelection = () => {
  if (forumPosts.value.length === 0) {
    selectedForumPostId.value = ''
    isForumThreadView.value = false
    return
  }

  const exists = forumPosts.value.some((item) => item.id === selectedForumPostId.value)
  if (!exists) {
    selectedForumPostId.value = forumPosts.value[0].id
  }
}

const loadForumPosts = async () => {
  try {
    const raw = await kvStorage.get(forumStorageKey.value)
    forumPosts.value = normalizeForumPosts(raw)
  } catch {
    forumPosts.value = []
  } finally {
    ensureForumSelection()
  }
}

const persistNewsEvents = async () => {
  try {
    await kvStorage.set(newsStorageKey.value, newsEvents.value)
  } catch {
    // no-op
  }
}

const ensureNewsSelection = () => {
  if (newsEvents.value.length === 0) {
    selectedNewsEventId.value = ''
    selectedNewsVersionIndex.value = 0
    isNewsDetailView.value = false
    return
  }

  const exists = newsEvents.value.some((item) => item.id === selectedNewsEventId.value)
  if (!exists) {
    selectedNewsEventId.value = newsEvents.value[0].id
    selectedNewsVersionIndex.value = 0
  }
}

const loadNewsEvents = async () => {
  try {
    const raw = await kvStorage.get(newsStorageKey.value)
    newsEvents.value = normalizeNewsEvents(raw)
  } catch {
    newsEvents.value = []
  } finally {
    ensureNewsSelection()
  }
}

const collectForumTopicSeeds = () => {
  const topicSet = new Set()
  const pushTopic = (value) => {
    const topic = toSnippet(value, 20)
    if (topic) topicSet.add(topic)
  }

  pushTopic(props.currentLine?.text)
  if (props.currentLine?.speaker && props.currentLine?.speaker !== '旁白') {
    pushTopic(`关于${props.currentLine.speaker}的最新动向`)
  }

  const recentDialogue = Array.isArray(props.dialogueHistory) ? props.dialogueHistory.slice(-8) : []
  recentDialogue.forEach((line) => {
    const speaker = String(line?.speaker || '').trim()
    const text = String(line?.text || '').trim()
    if (speaker && speaker !== '旁白') {
      pushTopic(`${speaker}相关话题`)
    }
    pushTopic(text)
  })

  const scenes = Array.isArray(props.worldBook?.scenes) ? props.worldBook.scenes : []
  scenes.slice(0, 8).forEach((scene) => {
    pushTopic(scene?.name)
    pushTopic(scene?.description)
  })

  const characters = Array.isArray(props.worldBook?.characters) ? props.worldBook.characters : []
  characters.slice(0, 8).forEach((char) => {
    pushTopic(`关于${char?.name || ''}的传闻`)
  })

  pushTopic(props.worldBook?.summary)
  pushTopic(props.worldBook?.entries?.overview)

  const fallbackTopics = [
    '昨晚的异动',
    '旧城区的神秘传闻',
    '主角团行踪',
    '新的委托公告',
    '禁区边缘异响',
    '街头流言合集',
    '目击者口供',
    '隐藏势力动向',
  ]
  fallbackTopics.forEach((item) => pushTopic(item))

  return [...topicSet].slice(0, 24)
}

const buildForumObserverPool = () => {
  const worldTitle = toSnippet(props.worldBook?.title, 10) || '本地'
  const observerSet = new Set(FORUM_OBSERVER_POOL)

  const charNames = contacts.value
    .map((item) => String(item?.name || '').trim())
    .filter(Boolean)
    .slice(0, 5)

  charNames.forEach((name) => {
    observerSet.add(`${name}隔壁邻居`)
    observerSet.add(`${name}同校生`)
  })
  observerSet.add(`${worldTitle}论坛老用户`)
  observerSet.add(`${worldTitle}街头观察员`)

  return [...observerSet]
}

const buildForumRefreshContext = () => {
  const topicSeeds = collectForumTopicSeeds().slice(0, 16)
  const observerCandidates = buildForumObserverPool().slice(0, 20)
  return { topicSeeds, observerCandidates }
}

const collectNewsTopicSeeds = () => {
  const topicSet = new Set()
  const pushTopic = (value) => {
    const topic = toSnippet(value, 24)
    if (topic) topicSet.add(topic)
  }

  pushTopic(props.currentLine?.text)
  pushTopic(props.currentLine?.sceneName)
  if (props.currentLine?.speaker && props.currentLine?.speaker !== '旁白') {
    pushTopic(`${props.currentLine.speaker}相关新进展`)
  }

  const recentDialogue = Array.isArray(props.dialogueHistory) ? props.dialogueHistory.slice(-12) : []
  recentDialogue.forEach((line) => {
    pushTopic(line?.text)
    if (line?.speaker && line.speaker !== '旁白') {
      pushTopic(`${line.speaker}动向`)
    }
  })

  const scenes = Array.isArray(props.worldBook?.scenes) ? props.worldBook.scenes : []
  scenes.slice(0, 10).forEach((scene) => {
    pushTopic(scene?.name)
    pushTopic(scene?.description)
  })

  const chars = Array.isArray(props.worldBook?.characters) ? props.worldBook.characters : []
  chars.slice(0, 10).forEach((char) => {
    pushTopic(`${char?.name || ''}相关消息`)
    pushTopic(char?.identity)
  })

  pushTopic(props.worldBook?.summary)
  pushTopic(props.worldBook?.entries?.overview)
  pushTopic(props.worldBook?.entries?.timeline)
  pushTopic(props.worldBook?.entries?.conflict)

  const fallbackTopics = [
    '城内突发事件',
    '关键角色行踪',
    '资源供给异常',
    '地方势力博弈',
    '边境异常目击',
    '公共安全通报',
    '市场与舆论波动',
    '神秘事件追踪',
  ]
  fallbackTopics.forEach((item) => pushTopic(item))

  return [...topicSet].slice(0, 24)
}

const buildNewsMediaProfiles = () => {
  const profiles = [...NEWS_MEDIA_POOL]
  const worldTitle = toSnippet(props.worldBook?.title, 8) || '本地'
  profiles.push({ name: `${worldTitle}晨报`, style: '区域纸媒，重本地民生' })
  profiles.push({ name: `${worldTitle}速览`, style: '移动端短讯，标题更抓眼球' })
  return profiles.slice(0, 10)
}

const buildNewsRefreshContext = () => ({
  topicSeeds: collectNewsTopicSeeds(),
  mediaProfiles: buildNewsMediaProfiles(),
})

const selectNewsChannel = (channel) => {
  if (!NEWS_CHANNELS.includes(channel)) return
  selectedNewsChannel.value = channel
}

const getNewsTopicBadge = (event) => {
  const topic = String(event?.topic || '').trim().replace(/\s+/g, '')
  if (!topic) return '新闻'
  return topic.slice(0, 4)
}

const formatForumMetric = (value) => {
  const number = Math.max(0, Number(value) || 0)
  if (number >= 10000) {
    const compact = (number / 10000).toFixed(number >= 100000 ? 0 : 1)
    return `${compact}w`
  }
  return String(number)
}

const openForumPost = (postId) => {
  const id = String(postId || '').trim()
  if (!id) return
  selectedForumPostId.value = id
  isForumThreadView.value = true
}

const showForumList = () => {
  isForumThreadView.value = false
}

const openNewsEvent = (eventId) => {
  const id = String(eventId || '').trim()
  if (!id) return
  selectedNewsEventId.value = id
  selectedNewsVersionIndex.value = 0
  isNewsDetailView.value = true
}

const showNewsList = () => {
  isNewsDetailView.value = false
  selectedNewsVersionIndex.value = 0
}

const selectNewsVersion = (index) => {
  if (!selectedNewsEvent.value) return
  const total = selectedNewsEvent.value.versions.length
  if (total <= 0) return
  selectedNewsVersionIndex.value = Math.max(0, Math.min(index, total - 1))
}

const handleRefreshForum = async () => {
  if (isRefreshingForum.value) return
  forumError.value = ''
  const now = Date.now()
  const cooldownMs = forumRefreshCooldownMs.value
  if (
    cooldownMs > 0 &&
    forumPosts.value.length > 0 &&
    now - lastForumRefreshAt.value < cooldownMs
  ) {
    const remain = Math.ceil((cooldownMs - (now - lastForumRefreshAt.value)) / 1000)
    forumError.value = `刷新过于频繁，请 ${remain}s 后再试`
    return
  }
  isRefreshingForum.value = true

  try {
    const context = buildForumRefreshContext()
    const result = await generatePhoneForumPosts({
      worldBook: props.worldBook,
      dialogueHistory: props.dialogueHistory,
      currentLine: props.currentLine,
      recentForumPosts: forumPosts.value.slice(0, 5),
      topicSeeds: context.topicSeeds,
      observerCandidates: context.observerCandidates,
      tags: FORUM_TAG_POOL,
      postCount: 7,
    })

    if (!result.success || !Array.isArray(result.posts) || result.posts.length === 0) {
      forumError.value = result.error || '论坛刷新失败，请检查 API 设置'
      return
    }

    forumPosts.value = normalizeForumPosts(result.posts)
    ensureForumSelection()
    isForumThreadView.value = false
    lastForumRefreshAt.value = Date.now()
    await persistForumPosts()

    if (forumPosts.value.length === 0) {
      forumError.value = '暂无可用帖子'
    }
  } catch {
    forumError.value = '论坛刷新失败，请重试'
  } finally {
    isRefreshingForum.value = false
  }
}

const handleRefreshNews = async () => {
  if (isRefreshingNews.value) return
  newsError.value = ''
  const now = Date.now()
  const cooldownMs = newsRefreshCooldownMs.value
  if (
    cooldownMs > 0 &&
    newsEvents.value.length > 0 &&
    now - lastNewsRefreshAt.value < cooldownMs
  ) {
    const remain = Math.ceil((cooldownMs - (now - lastNewsRefreshAt.value)) / 1000)
    newsError.value = `刷新过于频繁，请 ${remain}s 后再试`
    return
  }
  isRefreshingNews.value = true

  try {
    const context = buildNewsRefreshContext()
    const result = await generatePhoneNewsFeed({
      worldBook: props.worldBook,
      dialogueHistory: props.dialogueHistory,
      currentLine: props.currentLine,
      recentNewsEvents: newsEvents.value.slice(0, 4),
      topicSeeds: context.topicSeeds,
      mediaProfiles: context.mediaProfiles,
      eventCount: 6,
      versionsPerEvent: 3,
    })

    if (!result.success || !Array.isArray(result.events) || result.events.length === 0) {
      newsError.value = result.error || '新闻刷新失败，请检查 API 设置'
      return
    }

    const normalized = normalizeNewsEvents(result.events)
    if (normalized.length === 0) {
      newsError.value = '新闻内容为空，请重试'
      return
    }

    newsEvents.value = normalized
    ensureNewsSelection()
    isNewsDetailView.value = false
    lastNewsRefreshAt.value = Date.now()
    await persistNewsEvents()

    await pushAlert({
      type: 'news',
      title: '今日X条已更新',
      content: `已生成 ${newsEvents.value.length} 条新闻`,
      sourceApp: 'news',
      sourceId: newsEvents.value[0]?.id || '',
      dedupeKey: `news_refresh:${newsEvents.value[0]?.id || 'none'}:${newsEvents.value.length}`,
      silentToast: false,
    })
  } catch {
    newsError.value = '新闻刷新失败，请重试'
  } finally {
    isRefreshingNews.value = false
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

const normalizeSmsReplyList = (result) => {
  const list = Array.isArray(result?.replies)
    ? result.replies
    : [String(result?.reply || '').trim()]

  return list
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 6)
}

const requestSmsReplies = async ({ contact, userMessage, forwardedClues = [] }) => {
  const history = Array.isArray(smsThreads.value[contact.id]) ? smsThreads.value[contact.id] : []
  const result = await generatePhoneSmsReply({
    worldBook: props.worldBook,
    contact,
    userMessage,
    history,
    dialogueHistory: props.dialogueHistory,
    currentLine: props.currentLine,
    forwardedClues,
    options: {
      historyLimit: phoneSettings.value.smsHistoryLineCount,
      dialogueLimit: phoneSettings.value.smsDialogueLineCount,
      maxTokens: phoneSettings.value.smsMaxTokens,
    },
  })

  if (!result.success) {
    return {
      success: false,
      error: result.error || '短信发送失败，请检查 API 设置',
      replies: [],
    }
  }

  const replies = normalizeSmsReplyList(result)
  if (replies.length === 0) {
    return {
      success: false,
      error: '短信回复为空，请重试',
      replies: [],
    }
  }

  return {
    success: true,
    error: null,
    replies,
  }
}

const appendAssistantSmsReplies = async (contactId, replies) => {
  let lastMessage = null
  for (const text of replies) {
    lastMessage = await appendSmsMessage(contactId, 'assistant', text)
  }
  return lastMessage
}

const pushSmsReplyAlert = async (contact, replies, assistantMessage) => {
  const preview = replies.join(' ').slice(0, 36)
  await pushAlert({
    type: 'sms',
    title: `${contact.name} 发来新短信`,
    content: preview,
    sourceApp: 'messages',
    sourceId: contact.id,
    dedupeKey: assistantMessage?.id ? `sms_reply:${assistantMessage.id}` : `sms_reply:${contact.id}:${preview.slice(0, 16)}`,
    silentToast: false,
  })
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
    const replyResult = await requestSmsReplies({
      contact,
      userMessage: content,
    })
    if (!replyResult.success) {
      smsError.value = replyResult.error
      return
    }

    const assistantMessage = await appendAssistantSmsReplies(contact.id, replyResult.replies)
    await pushSmsReplyAlert(contact, replyResult.replies, assistantMessage)
    await scrollThreadToBottom()
  } finally {
    isSendingSms.value = false
  }
}

const buildForwardedCluePromptPayload = (item) => {
  if (!item) return []
  return [{
    sourceType: String(item?.sourceType || '').trim(),
    title: String(item?.title || '').trim(),
    summary: String(item?.summary || '').trim(),
    tags: Array.isArray(item?.tags) ? item.tags : [],
    timestamp: String(item?.timestamp || '').trim(),
  }]
}

const buildClueForwardUserMessage = (item) => {
  const sourceLabel = getClueSourceLabel(item?.sourceType)
  const title = String(item?.title || '').trim() || '无标题线索'
  const summary = String(item?.summary || '').trim()
  const tags = Array.isArray(item?.tags) && item.tags.length > 0 ? `（${item.tags.join('、')}）` : ''
  return `我转发给你一条线索，请结合当前局势给出你的看法和判断：\n[${sourceLabel}] ${title}${summary ? `：${summary}` : ''}${tags}`
}

const openClueForwardPicker = () => {
  if (!selectedClue.value) return
  ensureClueForwardTarget()
  isClueForwardPickerOpen.value = true
  clueError.value = ''
}

const closeClueForwardPicker = () => {
  isClueForwardPickerOpen.value = false
}

const handleForwardCurrentClue = async () => {
  if (isForwardingClue.value || isSendingSms.value) return

  const targetId = String(clueForwardTargetId.value || '').trim()
  if (!targetId) {
    clueError.value = '请先选择要转发给谁'
    return
  }

  const contact = contacts.value.find((item) => item.id === targetId)
  if (!contact) {
    clueError.value = '目标角色不存在，请重新选择'
    return
  }

  const item = selectedClue.value
  if (!item) {
    clueError.value = '线索不存在，请返回列表重试'
    return
  }

  clueError.value = ''
  isForwardingClue.value = true
  try {
    const userMessage = buildClueForwardUserMessage(item)
    await appendSmsMessage(contact.id, 'user', userMessage)

    const replyResult = await requestSmsReplies({
      contact,
      userMessage,
      forwardedClues: buildForwardedCluePromptPayload(item),
    })
    if (!replyResult.success) {
      clueError.value = replyResult.error || '转发失败，请稍后重试'
      return
    }

    const assistantMessage = await appendAssistantSmsReplies(contact.id, replyResult.replies)
    await pushSmsReplyAlert(contact, replyResult.replies, assistantMessage)
    clueError.value = ''
    isClueForwardPickerOpen.value = false
    currentApp.value = 'messages'
    await selectMessageContact(contact.id)
  } finally {
    isForwardingClue.value = false
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
  if (appId === 'alerts') {
    isAlertsViewOnlyUnread.value = false
    await markAllAlertsRead()
  } else if (appId === 'messages') {
    isMessagesThreadView.value = false
    ensureSelectedContact()
    await ensureSmsThreadBootstrapped(selectedContactId.value)
    smsError.value = ''
  } else if (appId === 'moments') {
    momentsError.value = ''
  } else if (appId === 'clues') {
    isClueDetailView.value = false
    selectedClueId.value = ''
    isClueForwardPickerOpen.value = false
    clueError.value = ''
  } else if (appId === 'forum') {
    forumError.value = ''
    isForumThreadView.value = false
    if (forumPosts.value.length === 0) {
      await handleRefreshForum()
    } else {
      ensureForumSelection()
    }
  } else if (appId === 'news') {
    newsError.value = ''
    isNewsDetailView.value = false
    selectedNewsChannel.value = NEWS_CHANNELS[0]
    if (newsEvents.value.length === 0) {
      await handleRefreshNews()
    } else {
      ensureNewsSelection()
    }
  } else if (appId === 'map') {
    mapError.value = ''
    ensureMapSelection()
    if (!mapData.value?.generated) {
      await handleRefreshMap()
    }
  } else if (appId === 'shop') {
    shopError.value = ''
  } else if (appId === 'wallet') {
    shopError.value = ''
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
  isForumThreadView.value = false
  forumError.value = ''
  isNewsDetailView.value = false
  newsError.value = ''
  selectedNewsChannel.value = NEWS_CHANNELS[0]
  selectedNewsVersionIndex.value = 0
  mapError.value = ''
  isAlertsViewOnlyUnread.value = false
  shopError.value = ''
  clueKeyword.value = ''
  clueSourceFilter.value = 'all'
  clueStatusFilter.value = 'all'
  isClueDetailView.value = false
  selectedClueId.value = ''
  isClueForwardPickerOpen.value = false
  clueError.value = ''
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

watch(forumStorageKey, () => {
  void loadForumPosts()
}, { immediate: true })

watch(newsStorageKey, () => {
  void loadNewsEvents()
}, { immediate: true })

watch(mapStorageKey, () => {
  void loadMapData()
}, { immediate: true })

watch(alertStorageKey, () => {
  void loadAlerts()
}, { immediate: true })

watch(clueStorageKey, () => {
  void loadClues()
}, { immediate: true })

watch(phoneSettingsKey, () => {
  void loadPhoneSettings()
}, { immediate: true })

watch(walletStorageKey, () => {
  void loadWallet()
}, { immediate: true })

watch(shopStorageKey, () => {
  void loadShopState()
}, { immediate: true })

watch(contacts, () => {
  ensureSelectedContact()
  ensureClueForwardTarget()
  void ensureSmsThreadBootstrapped(selectedContactId.value)
  if (!selectedContact.value) {
    isMessagesThreadView.value = false
  }
}, { immediate: true })

watch(() => clues.value.map((item) => item.id), (ids) => {
  const currentId = String(selectedClueId.value || '').trim()
  if (!currentId) return
  if (!ids.includes(currentId)) {
    selectedClueId.value = ''
    isClueDetailView.value = false
    isClueForwardPickerOpen.value = false
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
  dismissToast()
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
                    <span
                      v-if="app.id === 'alerts' && unreadAlertCount > 0"
                      class="app-badge"
                    >
                      {{ unreadAlertCount > 99 ? '99+' : unreadAlertCount }}
                    </span>
                  </div>
                  <span class="app-name">{{ app.name }}</span>
                </button>
              </div>
            </div>

            <div v-else-if="currentApp === 'alerts'" class="app-screen alerts-app">
              <div class="app-header alerts-header">
                <button class="back-btn" type="button" @click="goHome" aria-label="返回主页">
                  <span class="chevron">‹</span>
                </button>
                <span class="app-title">通知中心</span>
                <button
                  type="button"
                  class="alerts-read-all-btn"
                  :disabled="unreadAlertCount === 0"
                  @click="markAllAlertsRead"
                >
                  全部已读
                </button>
              </div>

              <div class="alerts-toolbar">
                <button
                  type="button"
                  class="alerts-filter-btn"
                  :class="{ active: !isAlertsViewOnlyUnread }"
                  @click="isAlertsViewOnlyUnread = false"
                >
                  全部
                </button>
                <button
                  type="button"
                  class="alerts-filter-btn"
                  :class="{ active: isAlertsViewOnlyUnread }"
                  @click="isAlertsViewOnlyUnread = true"
                >
                  未读 ({{ unreadAlertCount }})
                </button>
              </div>

              <div class="alerts-page">
                <p v-if="filteredAlerts.length === 0" class="alerts-empty">暂无通知</p>
                <article
                  v-for="item in filteredAlerts"
                  :key="item.id"
                  class="alert-item"
                  :class="{ unread: !item.isRead }"
                  role="button"
                  tabindex="0"
                  @click="jumpByAlert(item)"
                  @keydown.enter.prevent="jumpByAlert(item)"
                  @keydown.space.prevent="jumpByAlert(item)"
                >
                  <div class="alert-dot" aria-hidden="true"></div>
                  <div class="alert-main">
                    <p class="alert-title">{{ item.title }}</p>
                    <p class="alert-content">{{ item.content }}</p>
                    <div class="alert-meta">
                      <span class="alert-type">{{ item.type }}</span>
                      <time class="alert-time">{{ formatMomentTime(item.timestamp) }}</time>
                    </div>
                  </div>
                </article>
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
                      <div class="sms-meta">
                        <time class="sms-time">{{ formatSmsTime(message.timestamp) }}</time>
                      </div>
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

            <div v-else-if="currentApp === 'forum'" class="app-screen forum-app">
              <template v-if="!isForumThreadView">
                <div class="app-header forum-header">
                  <button class="back-btn" type="button" @click="goHome" aria-label="返回主页">
                    <span class="chevron">‹</span>
                  </button>
                  <span class="app-title">论坛</span>
                  <div class="forum-header-actions">
                    <span class="header-action forum-count">{{ forumPosts.length }}帖</span>
                    <button
                      type="button"
                      class="forum-refresh-btn"
                      :disabled="isRefreshingForum"
                      @click="handleRefreshForum"
                    >
                      {{ isRefreshingForum ? '刷新中' : '刷新' }}
                    </button>
                  </div>
                </div>

                <div class="forum-page">
                  <p v-if="forumError" class="forum-error">{{ forumError }}</p>

                  <div class="forum-list">
                    <p v-if="forumPosts.length === 0" class="forum-empty">暂无帖子，点击刷新获取最新讨论</p>

                    <article
                      v-for="post in forumPosts"
                      :key="post.id"
                      class="forum-post-item"
                      role="button"
                      tabindex="0"
                      @click="openForumPost(post.id)"
                      @keydown.enter.prevent="openForumPost(post.id)"
                      @keydown.space.prevent="openForumPost(post.id)"
                    >
                      <div class="forum-post-topline">
                        <span class="forum-tag">{{ post.tag }}</span>
                        <span v-if="post.isHot" class="forum-hot">HOT</span>
                      </div>
                      <p class="forum-post-title">{{ post.title }}</p>
                      <p class="forum-post-preview">{{ post.preview }}</p>
                      <div class="forum-post-meta">
                        <span class="forum-post-author">{{ post.authorName }}</span>
                        <span class="forum-post-time">{{ formatMomentTime(post.timestamp) }}</span>
                      </div>
                      <div class="forum-post-stats">
                        <span>👁 {{ formatForumMetric(post.views) }}</span>
                        <span>💬 {{ formatForumMetric(post.replies) }}</span>
                        <span>👍 {{ formatForumMetric(post.likes) }}</span>
                      </div>
                      <div class="forum-post-actions">
                        <button
                          type="button"
                          class="collect-clue-btn"
                          :disabled="isClueCollected(`forum:${post.id}`)"
                          @click.stop="addClueFromForumPost(post)"
                        >
                          {{ isClueCollected(`forum:${post.id}`) ? '已收录' : '收线索' }}
                        </button>
                      </div>
                    </article>
                  </div>
                </div>
              </template>

              <template v-else>
                <div class="app-header forum-header">
                  <button class="back-btn" type="button" @click="showForumList" aria-label="返回论坛列表">
                    <span class="chevron">‹</span>
                  </button>
                  <span class="app-title">{{ selectedForumPost?.tag || '帖子详情' }}</span>
                  <span class="header-action">详情</span>
                </div>

                <div v-if="selectedForumPost" class="forum-thread-page">
                  <article class="forum-thread-card">
                    <div class="forum-post-topline">
                      <span class="forum-tag">{{ selectedForumPost.tag }}</span>
                      <span v-if="selectedForumPost.isHot" class="forum-hot">HOT</span>
                    </div>
                    <h4 class="forum-thread-title">{{ selectedForumPost.title }}</h4>
                    <p class="forum-thread-content">{{ selectedForumPost.content }}</p>
                    <div class="forum-post-meta">
                      <span class="forum-post-author">{{ selectedForumPost.authorName }}</span>
                      <span class="forum-post-time">{{ formatMomentTime(selectedForumPost.timestamp) }}</span>
                    </div>
                    <div class="forum-post-stats">
                      <span>👁 {{ formatForumMetric(selectedForumPost.views) }}</span>
                      <span>💬 {{ formatForumMetric(selectedForumPost.replies) }}</span>
                      <span>👍 {{ formatForumMetric(selectedForumPost.likes) }}</span>
                    </div>
                    <div class="forum-post-actions">
                      <button
                        type="button"
                        class="collect-clue-btn"
                        :disabled="isClueCollected(`forum:${selectedForumPost.id}`)"
                        @click.stop="addClueFromForumPost(selectedForumPost)"
                      >
                        {{ isClueCollected(`forum:${selectedForumPost.id}`) ? '已收录' : '收线索' }}
                      </button>
                    </div>
                  </article>

                  <section class="forum-thread-comments">
                    <p class="forum-thread-comments-title">回帖讨论</p>
                    <article
                      v-for="comment in selectedForumPost.comments"
                      :key="comment.id"
                      class="forum-thread-comment"
                    >
                      <div class="forum-thread-comment-head">
                        <span class="forum-thread-comment-author">{{ comment.authorName }}</span>
                        <span class="forum-thread-comment-time">{{ formatMomentTime(comment.timestamp) }}</span>
                      </div>
                      <p class="forum-thread-comment-text">{{ comment.text }}</p>
                    </article>
                  </section>
                </div>

                <div v-else class="forum-page">
                  <p class="forum-empty">帖子不存在，返回列表刷新试试</p>
                </div>
              </template>
            </div>

            <div v-else-if="currentApp === 'news'" class="app-screen news-app">
              <template v-if="!isNewsDetailView">
                <div class="app-header news-header">
                  <button class="back-btn" type="button" @click="goHome" aria-label="返回主页">
                    <span class="chevron">‹</span>
                  </button>
                  <div class="news-brand">
                    <span class="news-brand-logo">今日X条</span>
                    <span class="news-brand-sub">推荐</span>
                  </div>
                  <div class="news-header-actions">
                    <button
                      type="button"
                      class="news-refresh-btn"
                      :disabled="isRefreshingNews"
                      @click="handleRefreshNews"
                    >
                      {{ isRefreshingNews ? '刷新中' : '刷新' }}
                    </button>
                  </div>
                </div>

                <div class="news-channel-strip">
                  <button
                    v-for="channel in NEWS_CHANNELS"
                    :key="channel"
                    type="button"
                    class="news-channel-btn"
                    :class="{ active: channel === selectedNewsChannel }"
                    @click="selectNewsChannel(channel)"
                  >
                    {{ channel }}
                  </button>
                </div>

                <div class="news-page news-feed-page">
                  <p v-if="newsError" class="news-error">{{ newsError }}</p>

                  <div class="news-list">
                    <p v-if="newsEventsForList.length === 0" class="news-empty">该频道暂无内容，点击刷新获取报道</p>

                    <article
                      v-for="event in newsEventsForList"
                      :key="event.id"
                      class="news-item news-feed-item"
                      role="button"
                      tabindex="0"
                      @click="openNewsEvent(event.id)"
                      @keydown.enter.prevent="openNewsEvent(event.id)"
                      @keydown.space.prevent="openNewsEvent(event.id)"
                    >
                      <div class="news-item-main">
                        <div class="news-item-topline">
                          <span class="news-importance" :class="`importance-${event.importance}`">
                            热度{{ formatNewsImportanceLabel(event.importance) }}
                          </span>
                          <span
                            class="news-credibility"
                            :class="`cred-${getNewsPrimaryVersion(event)?.credibility || 'analysis'}`"
                          >
                            {{ formatNewsCredibilityLabel(getNewsPrimaryVersion(event)?.credibility) }}
                          </span>
                        </div>
                        <h4 class="news-item-headline">
                          {{ getNewsPrimaryVersion(event)?.headline || event.topic }}
                        </h4>
                        <p class="news-item-summary">{{ getNewsPrimaryVersion(event)?.summary }}</p>
                        <div class="news-item-meta">
                          <span class="news-outlet">{{ getNewsPrimaryVersion(event)?.outlet || '综合来源' }}</span>
                          <span class="news-meta-dot">·</span>
                          <time class="news-item-time">{{ formatMomentTime(event.timestamp) }}</time>
                          <span class="news-meta-dot">·</span>
                          <span class="news-version-count">{{ event.versions.length }}版</span>
                          <button
                            type="button"
                            class="collect-clue-btn news-collect-btn"
                            :disabled="isClueCollected(`news:${event.id}`)"
                            @click.stop="addClueFromNewsEvent(event)"
                          >
                            {{ isClueCollected(`news:${event.id}`) ? '已收录' : '收线索' }}
                          </button>
                        </div>
                      </div>
                      <div class="news-thumb" :class="`thumb-${event.importance}`" aria-hidden="true">
                        <span class="news-thumb-label">{{ getNewsTopicBadge(event) }}</span>
                      </div>
                    </article>
                  </div>
                </div>
              </template>

              <template v-else>
                <div class="app-header news-header">
                  <button class="back-btn" type="button" @click="showNewsList" aria-label="返回新闻列表">
                    <span class="chevron">‹</span>
                  </button>
                  <span class="app-title">{{ selectedNewsEvent?.topic || '新闻详情' }}</span>
                  <span class="header-action">详情</span>
                </div>

                <div v-if="selectedNewsEvent" class="news-thread-page">
                  <div class="news-version-tabs" role="tablist" aria-label="媒体版本">
                    <button
                      v-for="(version, versionIndex) in selectedNewsEvent.versions"
                      :key="version.id"
                      type="button"
                      class="news-version-tab"
                      :class="{ active: versionIndex === selectedNewsVersionIndex }"
                      @click="selectNewsVersion(versionIndex)"
                    >
                      <span class="news-version-outlet">{{ version.outlet }}</span>
                      <span class="news-version-credibility">
                        {{ formatNewsCredibilityLabel(version.credibility) }}
                      </span>
                    </button>
                  </div>

                  <article v-if="selectedNewsVersion" class="news-detail-card">
                    <div class="news-detail-meta">
                      <span class="news-importance" :class="`importance-${selectedNewsEvent.importance}`">
                        热度{{ formatNewsImportanceLabel(selectedNewsEvent.importance) }}
                      </span>
                      <span
                        class="news-credibility"
                        :class="`cred-${selectedNewsVersion.credibility || 'analysis'}`"
                      >
                        {{ formatNewsCredibilityLabel(selectedNewsVersion.credibility) }}
                      </span>
                      <time class="news-item-time">
                        {{ formatMomentTime(selectedNewsVersion.timestamp || selectedNewsEvent.timestamp) }}
                      </time>
                    </div>

                    <h4 class="news-detail-headline">{{ selectedNewsVersion.headline }}</h4>
                    <p class="news-detail-summary">{{ selectedNewsVersion.summary }}</p>
                    <p v-if="selectedNewsVersion.angle" class="news-detail-angle">
                      角度：{{ selectedNewsVersion.angle }}
                    </p>
                    <p v-if="selectedNewsVersion.style" class="news-detail-style">
                      风格：{{ selectedNewsVersion.style }}
                    </p>
                    <div class="news-detail-actions">
                      <button
                        type="button"
                        class="collect-clue-btn"
                        :disabled="isClueCollected(`news:${selectedNewsEvent.id}`)"
                        @click.stop="addClueFromNewsEvent(selectedNewsEvent)"
                      >
                        {{ isClueCollected(`news:${selectedNewsEvent.id}`) ? '已收录' : '收线索' }}
                      </button>
                    </div>
                  </article>

                  <p v-else class="news-empty">当前版本内容为空，请返回刷新</p>
                </div>

                <div v-else class="news-page">
                  <p class="news-empty">新闻不存在，返回列表刷新试试</p>
                </div>
              </template>
            </div>

            <div v-else-if="currentApp === 'map'" class="app-screen map-app">
              <div class="app-header map-header">
                <button class="back-btn" type="button" @click="goHome" aria-label="返回主页">
                  <span class="chevron">‹</span>
                </button>
                <span class="app-title">{{ mapData?.title || '地图' }}</span>
                <button
                  type="button"
                  class="map-refresh-btn"
                  :disabled="isRefreshingMap"
                  @click="handleRefreshMap"
                >
                  {{ isRefreshingMap ? '刷新中' : '刷新' }}
                </button>
              </div>

              <div class="map-page">
                <p v-if="mapError" class="map-error">{{ mapError }}</p>

                <div class="map-canvas" role="list" aria-label="地图地点">
                  <p v-if="mapLocations.length === 0" class="map-empty">暂无地点，请点击刷新</p>
                  <button
                    v-for="node in mapLocations"
                    :key="node.id"
                    type="button"
                    class="map-node-btn"
                    :class="[
                      `risk-${node.risk || 'medium'}`,
                      {
                        active: selectedMapNode?.id === node.id,
                        current: mapData?.currentLocationId === node.id,
                      },
                    ]"
                    :style="getMapNodeStyle(node)"
                    @click="selectMapNode(node.id)"
                  >
                    <span class="map-node-dot" aria-hidden="true"></span>
                    <span class="map-node-name">{{ node.name }}</span>
                  </button>
                </div>

                <article v-if="selectedMapNode" class="map-detail-card">
                  <div class="map-detail-head">
                    <p class="map-detail-name">{{ selectedMapNode.name }}</p>
                    <span class="map-risk-badge" :class="`risk-${selectedMapNode.risk || 'medium'}`">
                      {{
                        selectedMapNode.risk === 'high'
                          ? '高风险'
                          : (selectedMapNode.risk === 'low' ? '低风险' : '中风险')
                      }}
                    </span>
                  </div>
                  <p class="map-detail-desc">{{ selectedMapNode.desc || '暂无地点说明。' }}</p>

                  <div v-if="selectedMapNode.tags?.length" class="map-tags">
                    <span
                      v-for="(tag, tagIndex) in selectedMapNode.tags"
                      :key="`${selectedMapNode.id}_tag_${tagIndex}`"
                      class="map-tag"
                    >
                      {{ tag }}
                    </span>
                  </div>

                  <button
                    type="button"
                    class="map-travel-btn"
                    :disabled="isRefreshingMap || mapData?.currentLocationId === selectedMapNode.id"
                    @click="handleTravelToMapNode(selectedMapNode)"
                  >
                    {{ mapData?.currentLocationId === selectedMapNode.id ? '当前位置' : '前往此地' }}
                  </button>
                </article>
              </div>
            </div>

            <div v-else-if="currentApp === 'shop'" class="app-screen shop-app">
              <div class="app-header shop-header">
                <button class="back-btn" type="button" @click="goHome" aria-label="返回主页">
                  <span class="chevron">‹</span>
                </button>
                <span class="app-title">点购网</span>
                <div class="shop-header-right">
                  <span class="shop-header-balance">{{ walletBalanceText }}</span>
                  <button
                    type="button"
                    class="header-action shop-wallet-link"
                    @click="openApp('wallet')"
                  >
                    余额
                  </button>
                </div>
              </div>

              <div class="shop-page">
                <section class="shop-search-card">
                  <div class="shop-search-row">
                    <input
                      v-model="shopQuery"
                      class="shop-search-input"
                      type="text"
                      maxlength="40"
                      placeholder="搜索道具/装备/补给"
                      @keydown.enter.prevent="handleSearchShop"
                    />
                    <button
                      type="button"
                      class="shop-search-btn"
                      :disabled="isSearchingShop"
                      @click="handleSearchShop"
                    >
                      {{ isSearchingShop ? '搜索中' : '搜索' }}
                    </button>
                  </div>
                </section>

                <p v-if="shopError" class="shop-error">{{ shopError }}</p>

                <section class="shop-results">
                  <p v-if="shopResults.length === 0" class="shop-empty">
                    输入关键词后点击搜索，生成符合当前剧情的商品
                  </p>

                  <article
                    v-for="item in shopResults"
                    :key="item.id"
                    class="shop-item"
                  >
                    <div class="shop-item-main">
                      <p class="shop-item-name">{{ item.name }}</p>
                      <p class="shop-item-desc">{{ item.description || '暂无描述' }}</p>
                      <div v-if="item.tags.length > 0" class="shop-item-tags">
                        <span
                          v-for="(tag, tagIndex) in item.tags"
                          :key="`${item.id}_tag_${tagIndex}`"
                          class="shop-item-tag"
                        >
                          {{ tag }}
                        </span>
                      </div>
                    </div>
                    <div class="shop-item-side">
                      <p class="shop-item-price">{{ item.priceText }}</p>
                      <button
                        type="button"
                        class="shop-buy-btn"
                        :disabled="isBuyingItemId === item.id || walletBalanceCents < item.priceCents"
                        @click="handleBuyShopItem(item)"
                      >
                        {{ isBuyingItemId === item.id ? '购买中' : '购买' }}
                      </button>
                    </div>
                  </article>
                </section>

                <section class="shop-orders">
                  <p class="shop-orders-title">最近购买</p>
                  <p v-if="shopOrderHistory.length === 0" class="shop-orders-empty">暂无购买记录</p>
                  <div v-else class="shop-orders-list">
                    <article
                      v-for="order in shopOrderHistory.slice(0, 8)"
                      :key="order.id"
                      class="shop-order-item"
                    >
                      <div class="shop-order-main">
                        <p class="shop-order-name">{{ order.name }}</p>
                        <time class="shop-order-time">{{ formatMomentTime(order.timestamp) }}</time>
                      </div>
                      <p class="shop-order-price">-{{ formatCents(order.totalCents) }}</p>
                    </article>
                  </div>
                </section>
              </div>
            </div>

            <div v-else-if="currentApp === 'wallet'" class="app-screen wallet-app">
              <div class="app-header wallet-header">
                <button class="back-btn" type="button" @click="goHome" aria-label="返回主页">
                  <span class="chevron">‹</span>
                </button>
                <span class="app-title">余额</span>
                <button type="button" class="header-action wallet-shop-link" @click="openApp('shop')">
                  商城
                </button>
              </div>

              <div class="wallet-page">
                <section class="wallet-balance-card">
                  <p class="wallet-balance-label">当前余额</p>
                  <p class="wallet-balance-value">{{ walletBalanceText }}</p>
                  <p class="wallet-balance-hint">购买时将本地计算扣款，不依赖 LLM 运算。</p>
                </section>

                <section class="wallet-orders">
                  <p class="wallet-orders-title">消费记录</p>
                  <p v-if="shopOrderHistory.length === 0" class="wallet-orders-empty">暂无消费记录</p>
                  <div v-else class="wallet-orders-list">
                    <article
                      v-for="order in shopOrderHistory.slice(0, 20)"
                      :key="`wallet_${order.id}`"
                      class="wallet-order-item"
                    >
                      <div class="wallet-order-main">
                        <p class="wallet-order-name">{{ order.name }}</p>
                        <time class="wallet-order-time">{{ formatMomentTime(order.timestamp) }}</time>
                      </div>
                      <p class="wallet-order-price">-{{ formatCents(order.totalCents) }}</p>
                    </article>
                  </div>
                </section>
              </div>
            </div>

            <div v-else-if="currentApp === 'clues'" class="app-screen clues-app">
              <template v-if="!isClueDetailView">
                <div class="app-header clues-header">
                  <button class="back-btn" type="button" @click="goHome" aria-label="返回主页">
                    <span class="chevron">‹</span>
                  </button>
                  <span class="app-title">线索板</span>
                  <span class="header-action">{{ clues.length }}条</span>
                </div>

                <div class="clues-toolbar">
                  <input
                    v-model="clueKeyword"
                    class="clues-search"
                    type="text"
                    placeholder="搜索标题/摘要/标签"
                  />
                  <div class="clues-filters">
                    <select v-model="clueSourceFilter" class="clues-select">
                      <option value="all">全部来源</option>
                      <option value="news">新闻</option>
                      <option value="forum">论坛</option>
                    </select>
                    <select v-model="clueStatusFilter" class="clues-select">
                      <option value="all">全部状态</option>
                      <option value="open">未解</option>
                      <option value="resolved">已解</option>
                    </select>
                  </div>
                </div>

                <div class="clues-page">
                  <p v-if="clueError" class="clues-error">{{ clueError }}</p>
                  <p v-if="filteredClues.length === 0" class="clues-empty">暂无线索，请在论坛/新闻中收录</p>

                  <article
                    v-for="item in filteredClues"
                    :key="item.id"
                    class="clue-item clue-item-clickable"
                    role="button"
                    tabindex="0"
                    @click="openClueDetail(item.id)"
                    @keydown.enter.prevent="openClueDetail(item.id)"
                    @keydown.space.prevent="openClueDetail(item.id)"
                  >
                    <div class="clue-topline">
                      <span class="clue-source">{{ getClueSourceLabel(item.sourceType) }}</span>
                      <span class="clue-status" :class="`status-${item.status}`">
                        {{ item.status === 'resolved' ? '已解' : '未解' }}
                      </span>
                    </div>
                    <h4 class="clue-title">{{ item.title }}</h4>
                    <p class="clue-summary">{{ item.summary }}</p>
                    <div v-if="item.tags.length > 0" class="clue-tags">
                      <span
                        v-for="(tag, tagIndex) in item.tags"
                        :key="`${item.id}_tag_${tagIndex}`"
                        class="clue-tag"
                      >
                        {{ tag }}
                      </span>
                    </div>
                    <div class="clue-meta">
                      <time class="clue-time">{{ formatMomentTime(item.timestamp) }}</time>
                      <span class="clue-enter-detail">查看详情 ›</span>
                    </div>
                  </article>
                </div>
              </template>

              <template v-else>
                <div class="app-header clues-header">
                  <button class="back-btn" type="button" @click="showClueList" aria-label="返回线索列表">
                    <span class="chevron">‹</span>
                  </button>
                  <span class="app-title">线索详情</span>
                  <span class="header-action">{{ getClueSourceLabel(selectedClue?.sourceType) }}</span>
                </div>

                <div v-if="selectedClue" class="clues-detail-page">
                  <article class="clue-detail-card">
                    <div class="clue-topline">
                      <span class="clue-source">{{ getClueSourceLabel(selectedClue.sourceType) }}</span>
                      <span class="clue-status" :class="`status-${selectedClue.status}`">
                        {{ selectedClue.status === 'resolved' ? '已解' : '未解' }}
                      </span>
                    </div>
                    <h4 class="clue-title">{{ selectedClue.title }}</h4>
                    <p class="clue-summary">{{ selectedClue.summary }}</p>
                    <div v-if="selectedClue.tags.length > 0" class="clue-tags">
                      <span
                        v-for="(tag, tagIndex) in selectedClue.tags"
                        :key="`detail_${selectedClue.id}_tag_${tagIndex}`"
                        class="clue-tag"
                      >
                        {{ tag }}
                      </span>
                    </div>
                    <div class="clue-meta">
                      <time class="clue-time">{{ formatMomentTime(selectedClue.timestamp) }}</time>
                    </div>
                  </article>

                  <div class="clue-detail-actions">
                    <button type="button" class="clue-action-btn" @click="toggleClueStatus(selectedClue.id)">
                      {{ selectedClue.status === 'resolved' ? '标记未解' : '标记已解' }}
                    </button>
                    <button type="button" class="clue-action-btn" @click="openClueForwardPicker">
                      转发到短信
                    </button>
                    <button type="button" class="clue-action-btn danger" @click="handleDeleteCurrentClue">
                      删除线索
                    </button>
                  </div>

                  <section v-if="isClueForwardPickerOpen" class="clue-forward-card">
                    <p class="clue-forward-title">选择转发对象</p>
                    <select v-model="clueForwardTargetId" class="clues-select clue-forward-target">
                      <option value="">选择转发角色</option>
                      <option
                        v-for="contact in contacts"
                        :key="`clue_forward_target_${contact.id}`"
                        :value="contact.id"
                      >
                        {{ contact.name }}
                      </option>
                    </select>
                    <div class="clue-forward-actions">
                      <button
                        type="button"
                        class="clue-action-btn"
                        :disabled="isForwardingClue || !clueForwardTargetId"
                        @click="handleForwardCurrentClue"
                      >
                        {{ isForwardingClue ? '转发中...' : '确认转发' }}
                      </button>
                      <button
                        type="button"
                        class="clue-action-btn"
                        :disabled="isForwardingClue"
                        @click="closeClueForwardPicker"
                      >
                        取消
                      </button>
                    </div>
                  </section>

                  <p v-if="clueError" class="clues-error">{{ clueError }}</p>
                </div>

                <div v-else class="clues-page">
                  <p class="clues-empty">线索不存在，返回列表后重试</p>
                </div>
              </template>
            </div>

            <div v-else-if="currentApp === 'settings'" class="app-screen phone-settings-app">
              <div class="app-header phone-settings-header">
                <button class="back-btn" type="button" @click="goHome" aria-label="返回主页">
                  <span class="chevron">‹</span>
                </button>
                <span class="app-title">频率设置</span>
                <span class="header-action">LLM</span>
              </div>

              <div class="phone-settings-page">
                <article class="phone-settings-card">
                  <p class="phone-settings-title">新闻刷新冷却</p>
                  <p class="phone-settings-value">{{ phoneSettings.newsRefreshCooldownSec }} 秒</p>
                  <input
                    class="phone-settings-range"
                    type="range"
                    min="0"
                    max="180"
                    step="5"
                    :value="phoneSettings.newsRefreshCooldownSec"
                    @input="updatePhoneRefreshCooldown('newsRefreshCooldownSec', $event.target.value)"
                  />
                  <p class="phone-settings-hint">0 秒表示不限制刷新频率</p>
                </article>

                <article class="phone-settings-card">
                  <p class="phone-settings-title">论坛刷新冷却</p>
                  <p class="phone-settings-value">{{ phoneSettings.forumRefreshCooldownSec }} 秒</p>
                  <input
                    class="phone-settings-range"
                    type="range"
                    min="0"
                    max="180"
                    step="5"
                    :value="phoneSettings.forumRefreshCooldownSec"
                    @input="updatePhoneRefreshCooldown('forumRefreshCooldownSec', $event.target.value)"
                  />
                  <p class="phone-settings-hint">建议 30-60 秒，兼顾实时性与 token 成本</p>
                </article>

                <article class="phone-settings-card">
                  <p class="phone-settings-title">短信上下文（条数）</p>
                  <div class="phone-settings-grid">
                    <label class="phone-settings-field">
                      <span class="phone-settings-field-label">短信历史条数</span>
                      <input
                        class="phone-settings-number"
                        type="number"
                        inputmode="numeric"
                        min="0"
                        max="300"
                        :value="phoneSettings.smsHistoryLineCount"
                        @input="updatePhoneSmsSetting('smsHistoryLineCount', $event.target.value)"
                      />
                    </label>
                    <label class="phone-settings-field">
                      <span class="phone-settings-field-label">剧情上下文条数</span>
                      <input
                        class="phone-settings-number"
                        type="number"
                        inputmode="numeric"
                        min="0"
                        max="300"
                        :value="phoneSettings.smsDialogueLineCount"
                        @input="updatePhoneSmsSetting('smsDialogueLineCount', $event.target.value)"
                      />
                    </label>
                  </div>
                  <p class="phone-settings-hint">0 表示不发送对应历史；条数越高，上下文越完整</p>
                </article>

                <article class="phone-settings-card">
                  <p class="phone-settings-title">短信输出 token 上限</p>
                  <p class="phone-settings-value">{{ phoneSettings.smsMaxTokens }}</p>
                  <input
                    class="phone-settings-number"
                    type="number"
                    inputmode="numeric"
                    min="128"
                    max="200000"
                    :value="phoneSettings.smsMaxTokens"
                    @input="updatePhoneSmsSetting('smsMaxTokens', $event.target.value)"
                  />
                  <p class="phone-settings-hint">受模型上限约束，设置过大可能被 API 拒绝</p>
                </article>
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

    <Transition name="phone-toast">
      <button
        v-if="toastAlert"
        type="button"
        class="phone-toast"
        @click="handleToastClick"
      >
        <span class="phone-toast-title">{{ toastAlert.title }}</span>
        <span class="phone-toast-content">{{ toastAlert.content }}</span>
      </button>
    </Transition>
  </div>
</template>

<style scoped src="./Phone.css"></style>

