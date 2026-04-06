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
  position: relative;
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

.app-badge {
  position: absolute;
  top: -5px;
  right: -8px;
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #f04142;
  color: #ffffff;
  font-size: 10px;
  line-height: 18px;
  text-align: center;
  padding: 0 5px;
  font-weight: 700;
  box-shadow: 0 1px 4px rgba(20, 22, 30, 0.24);
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
  min-width: 0;
  text-align: center;
  margin-right: -42px;
  font-size: 17px;
  font-weight: 600;
  color: var(--ios-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-action {
  width: 42px;
  flex: 0 0 42px;
  text-align: center;
  font-size: 13px;
  color: var(--ios-accent);
  font-weight: 500;
  white-space: nowrap;
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

.alerts-app {
  background: #f6f7fb;
}

.alerts-header {
  background: rgba(247, 247, 250, 0.9);
}

.alerts-header .app-title {
  margin-right: 0;
  text-align: left;
  padding-left: 2px;
}

.alerts-read-all-btn {
  border: 0;
  min-width: 0;
  height: 24px;
  border-radius: 0;
  background: transparent;
  color: #ef3f3f;
  font-size: 11px;
  font-weight: 600;
  padding: 0 2px;
  cursor: pointer;
}

.alerts-read-all-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.alerts-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px 6px;
  background: #f6f7fb;
}

.alerts-filter-btn {
  border: 0;
  min-width: 0;
  height: 24px;
  border-radius: 999px;
  background: rgba(120, 131, 152, 0.16);
  color: #60708b;
  font-size: 11px;
  font-weight: 600;
  padding: 0 10px;
  cursor: pointer;
}

.alerts-filter-btn.active {
  background: rgba(239, 63, 63, 0.14);
  color: #d73838;
}

.alerts-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 10px 10px;
}

.alerts-empty {
  margin: auto;
  font-size: 13px;
  color: #8e8e93;
}

.alert-item {
  border-radius: 11px;
  border: 1px solid rgba(60, 60, 67, 0.11);
  background: #ffffff;
  padding: 8px 9px;
  display: flex;
  align-items: flex-start;
  gap: 7px;
  cursor: pointer;
}

.alert-item.unread {
  border-color: rgba(239, 63, 63, 0.2);
  background: rgba(255, 255, 255, 0.96);
}

.alert-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
  background: rgba(239, 63, 63, 0.2);
  flex-shrink: 0;
}

.alert-item.unread .alert-dot {
  background: #ef3f3f;
}

.alert-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.alert-title {
  margin: 0;
  font-size: 13px;
  color: #1a1c20;
  font-weight: 700;
  line-height: 1.3;
}

.alert-content {
  margin: 0;
  font-size: 12px;
  color: #4f5562;
  line-height: 1.4;
  word-break: break-word;
}

.alert-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.alert-type {
  font-size: 10px;
  color: #7a8395;
}

.alert-time {
  font-size: 10px;
  color: #8e8e93;
  white-space: nowrap;
}

.collect-clue-btn {
  border: 0;
  min-width: 0;
  min-height: 0;
  height: 22px;
  border-radius: 999px;
  background: rgba(123, 105, 255, 0.14);
  color: #5b49d6;
  font-size: 10px;
  font-weight: 600;
  padding: 0 9px;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  flex: 0 0 auto;
}

.collect-clue-btn:disabled {
  background: rgba(120, 131, 152, 0.16);
  color: #7f8aa1;
  cursor: not-allowed;
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

.sms-meta {
  display: flex;
  align-items: center;
  gap: 6px;
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

.forum-app {
  background: #f2f2f7;
}

.forum-header {
  background: rgba(247, 247, 250, 0.9);
}

.forum-header .back-btn {
  flex-shrink: 0;
}

.forum-header .app-title {
  margin-right: 0;
  padding-left: 2px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.forum-header .header-action {
  width: auto;
  min-width: 30px;
}

.forum-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex-shrink: 0;
}

.forum-count {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  color: #78849a;
  font-size: 11px;
  font-weight: 600;
}

.forum-refresh-btn {
  border: 0;
  min-width: 0;
  min-height: 0;
  height: 24px;
  background: transparent;
  color: #c26708;
  font-size: 11px;
  line-height: 1.2;
  font-weight: 600;
  padding: 0 2px;
  border-radius: 0;
  -webkit-appearance: none;
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  cursor: pointer;
}

.forum-refresh-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.forum-refresh-btn:focus-visible {
  outline: 2px solid rgba(194, 103, 8, 0.35);
  outline-offset: 1px;
}

.forum-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #f2f2f7;
  overflow: hidden;
}

.forum-error {
  margin: 6px 14px 0;
  font-size: 12px;
  color: #d32f2f;
}

.forum-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 10px 12px 12px;
}

.forum-empty {
  margin: auto;
  font-size: 13px;
  color: #8e8e93;
}

.forum-post-item {
  width: 100%;
  text-align: left;
  -webkit-appearance: none;
  appearance: none;
  box-sizing: border-box;
  min-height: auto;
  border: 1px solid rgba(60, 60, 67, 0.13);
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 7px 16px rgba(10, 22, 46, 0.06);
  padding: 9px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font: inherit;
  line-height: inherit;
  color: #17171b;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.forum-post-item:active {
  transform: scale(0.99);
}

.forum-post-item:focus-visible {
  outline: 2px solid rgba(10, 132, 255, 0.3);
  outline-offset: 1px;
}

.forum-post-topline {
  display: flex;
  align-items: center;
  gap: 5px;
}

.forum-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 18px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10px;
  color: #9a5a0c;
  background: rgba(255, 159, 10, 0.16);
}

.forum-hot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 10px;
  color: #d83030;
  background: rgba(216, 48, 48, 0.14);
}

.forum-post-title {
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
  color: #1b1c1e;
  font-weight: 600;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.forum-post-preview {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: #4d4d54;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.forum-post-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.forum-post-author {
  font-size: 11px;
  color: #657186;
  min-width: 0;
  max-width: 70%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.forum-post-time {
  font-size: 10px;
  color: #8e8e93;
  white-space: nowrap;
}

.forum-post-stats {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 10px;
  color: #6a7484;
}

.forum-post-actions {
  display: flex;
  justify-content: flex-end;
}

.forum-thread-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 10px 12px 12px;
  background: #f2f2f7;
}

.forum-thread-card {
  border-radius: 12px;
  border: 1px solid rgba(60, 60, 67, 0.13);
  background: #ffffff;
  box-shadow: 0 7px 16px rgba(10, 22, 46, 0.06);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.forum-thread-title {
  margin: 0;
  font-size: 14px;
  line-height: 1.35;
  color: #1b1c1e;
}

.forum-thread-content {
  margin: 0;
  font-size: 12px;
  line-height: 1.48;
  color: #23242a;
  white-space: pre-wrap;
  word-break: break-word;
}

.forum-thread-comments {
  border-radius: 12px;
  border: 1px solid rgba(60, 60, 67, 0.12);
  background: #ffffff;
  padding: 9px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.forum-thread-comments-title {
  margin: 0;
  font-size: 12px;
  color: #657186;
}

.forum-thread-comment {
  border-radius: 9px;
  background: #f6f8fc;
  border: 1px solid rgba(60, 60, 67, 0.1);
  padding: 7px 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.forum-thread-comment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.forum-thread-comment-author {
  font-size: 11px;
  color: #2a66a8;
  font-weight: 600;
}

.forum-thread-comment-time {
  font-size: 10px;
  color: #8e8e93;
}

.forum-thread-comment-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.38;
  color: #2f3034;
  word-break: break-word;
}

.news-app {
  background: #ffffff;
}

.news-header {
  min-height: 52px;
  padding: 8px 10px 8px 4px;
  background: #ffffff;
  border-bottom: 1px solid rgba(18, 18, 20, 0.06);
}

.news-header .back-btn {
  width: 38px;
  color: #f04142;
  flex-shrink: 0;
}

.news-header .app-title {
  margin-right: -42px;
  padding-left: 0;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  color: #1a1c1f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.news-brand {
  flex: 1;
  min-width: 0;
  margin-left: 4px;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.news-brand-logo {
  font-size: 20px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #ef3f3f;
}

.news-brand-sub {
  font-size: 12px;
  color: #8c8f97;
  font-weight: 500;
}

.news-header .header-action {
  width: 42px;
  text-align: center;
  color: #8e8e93;
}

.news-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  flex-shrink: 0;
}

.news-refresh-btn {
  border: 0;
  min-width: 0;
  min-height: 0;
  height: 24px;
  background: transparent;
  color: #f04142;
  font-size: 13px;
  line-height: 1.2;
  font-weight: 600;
  padding: 0 2px;
  border-radius: 0;
  -webkit-appearance: none;
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  cursor: pointer;
}

.news-refresh-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.news-refresh-btn:focus-visible {
  outline: 2px solid rgba(240, 65, 66, 0.28);
  outline-offset: 1px;
}

.news-channel-strip {
  display: flex;
  align-items: center;
  gap: 1px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  white-space: nowrap;
  padding: 0 8px 0 10px;
  background: #ffffff;
  border-bottom: 1px solid rgba(18, 18, 20, 0.06);
}

.news-channel-strip::-webkit-scrollbar {
  display: none;
}

.news-channel-btn {
  position: relative;
  border: 0;
  background: transparent;
  color: #797d86;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  padding: 11px 8px 10px;
  white-space: nowrap;
  cursor: pointer;
}

.news-channel-btn.active {
  color: #1a1c1f;
  font-weight: 700;
}

.news-channel-btn.active::after {
  content: '';
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 4px;
  height: 2px;
  border-radius: 999px;
  background: #f04142;
}

.news-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  overflow: hidden;
}

.news-feed-page {
  background: #ffffff;
}

.news-error {
  margin: 7px 12px 0;
  font-size: 12px;
  color: #d32f2f;
}

.news-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0 10px 12px;
  background: #ffffff;
}

.news-empty {
  margin: 26px auto;
  font-size: 13px;
  color: #8e8e93;
}

.news-item {
  width: 100%;
  text-align: left;
  -webkit-appearance: none;
  appearance: none;
  box-sizing: border-box;
  min-height: auto;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 12px 0;
  display: inline-flex;
  align-items: stretch;
  gap: 10px;
  font: inherit;
  line-height: inherit;
  color: #17171b;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  border-bottom: 1px solid rgba(18, 18, 20, 0.08);
}

.news-item:last-child {
  border-bottom: 0;
}

.news-item:active {
  background: rgba(17, 19, 24, 0.03);
}

.news-item:focus-visible {
  outline: 2px solid rgba(240, 65, 66, 0.26);
  outline-offset: 1px;
}

.news-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.news-item-topline {
  display: flex;
  align-items: center;
  gap: 6px;
}

.news-importance {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 17px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 600;
}

.news-importance.importance-high {
  color: #c13e41;
  background: rgba(240, 65, 66, 0.13);
}

.news-importance.importance-medium {
  color: #50607b;
  background: rgba(80, 96, 123, 0.12);
}

.news-importance.importance-low {
  color: #738297;
  background: rgba(115, 130, 151, 0.13);
}

.news-item-headline {
  margin: 0;
  font-size: 15px;
  line-height: 1.34;
  color: #141518;
  font-weight: 650;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.news-item-summary {
  margin: 0;
  font-size: 12px;
  line-height: 1.38;
  color: #6f7380;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.news-item-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 1px;
}

.news-collect-btn {
  margin-left: auto;
}

.news-outlet {
  font-size: 10px;
  color: #9197a4;
  font-weight: 500;
  min-width: 0;
  max-width: 46%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.news-meta-dot {
  font-size: 10px;
  color: #c0c5ce;
}

.news-item-time {
  font-size: 10px;
  color: #a0a6b2;
  white-space: nowrap;
}

.news-credibility {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 17px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 600;
}

.news-credibility.cred-confirmed {
  color: #2b7f60;
  background: rgba(43, 127, 96, 0.13);
}

.news-credibility.cred-rumor {
  color: #be5b11;
  background: rgba(190, 91, 17, 0.15);
}

.news-credibility.cred-analysis {
  color: #5f7090;
  background: rgba(95, 112, 144, 0.13);
}

.news-version-count {
  font-size: 10px;
  color: #a0a6b2;
}

.news-thumb {
  width: 94px;
  height: 72px;
  flex: 0 0 94px;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 7px;
  box-sizing: border-box;
  background: linear-gradient(145deg, #8da8ff, #5466a4);
}

.news-thumb.thumb-high {
  background: linear-gradient(145deg, #ff9a86, #db4c55);
}

.news-thumb.thumb-medium {
  background: linear-gradient(145deg, #93abff, #5d72bd);
}

.news-thumb.thumb-low {
  background: linear-gradient(145deg, #89b7cc, #4b7f97);
}

.news-thumb-label {
  max-width: 100%;
  font-size: 11px;
  line-height: 1.15;
  color: #ffffff;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(16, 19, 26, 0.3);
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.news-thread-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 12px;
  background: #ffffff;
}

.news-version-tabs {
  display: flex;
  align-items: stretch;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 3px;
  -webkit-overflow-scrolling: touch;
}

.news-version-tabs::-webkit-scrollbar {
  height: 4px;
}

.news-version-tabs::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(16, 19, 26, 0.2);
}

.news-version-tab {
  min-width: 96px;
  max-width: 122px;
  flex: 0 0 auto;
  border: 1px solid rgba(16, 20, 28, 0.1);
  border-radius: 9px;
  background: #fafbfc;
  color: #2f3238;
  padding: 6px 7px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  cursor: pointer;
  text-align: left;
}

.news-version-tab:active {
  transform: scale(0.98);
}

.news-version-tab.active {
  border-color: rgba(240, 65, 66, 0.45);
  background: rgba(240, 65, 66, 0.08);
  box-shadow: 0 0 0 1px rgba(240, 65, 66, 0.16) inset;
}

.news-version-outlet {
  width: 100%;
  font-size: 11px;
  font-weight: 600;
  color: #2c3240;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.news-version-credibility {
  font-size: 10px;
  color: #8790a1;
}

.news-detail-card {
  border-radius: 0;
  border: 0;
  border-top: 1px solid rgba(18, 18, 20, 0.08);
  border-bottom: 1px solid rgba(18, 18, 20, 0.08);
  background: #ffffff;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.news-detail-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.news-detail-headline {
  margin: 0;
  font-size: 17px;
  line-height: 1.36;
  color: #17191d;
  font-weight: 700;
  word-break: break-word;
}

.news-detail-summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.52;
  color: #2a2d34;
  white-space: pre-wrap;
  word-break: break-word;
}

.news-detail-angle,
.news-detail-style {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: #6b7383;
  word-break: break-word;
}

.news-detail-actions {
  display: flex;
  justify-content: flex-end;
}

.map-app {
  background: #f4f6fb;
}

.map-header {
  background: rgba(247, 247, 250, 0.9);
}

.map-header .app-title {
  margin-right: 0;
  text-align: center;
}

.map-refresh-btn {
  border: 0;
  min-width: 0;
  min-height: 0;
  height: 24px;
  border-radius: 0;
  background: transparent;
  color: #3a8dff;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  padding: 0 2px;
  cursor: pointer;
}

.map-refresh-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.map-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 12px;
  background: #f4f6fb;
}

.map-error {
  margin: 0;
  font-size: 12px;
  color: #d84848;
}

.map-empty {
  margin: auto;
  font-size: 12px;
  color: #8e8e93;
}

.map-canvas {
  position: relative;
  flex: 1;
  min-height: 220px;
  border-radius: 12px;
  border: 1px solid rgba(60, 60, 67, 0.12);
  background:
    radial-gradient(circle at 20% 20%, rgba(58, 141, 255, 0.14), transparent 46%),
    radial-gradient(circle at 82% 72%, rgba(86, 115, 255, 0.12), transparent 52%),
    linear-gradient(180deg, #ffffff 0%, #eef3fb 100%);
  overflow: hidden;
}

.map-node-btn {
  position: absolute;
  transform: translate(-50%, -50%);
  border: 0;
  min-width: 0;
  min-height: 0;
  background: transparent;
  padding: 0;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  max-width: 90px;
  cursor: pointer;
}

.map-node-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #4f86ff;
  box-shadow: 0 0 0 3px rgba(79, 134, 255, 0.24);
}

.map-node-name {
  max-width: 100%;
  border-radius: 999px;
  border: 1px solid rgba(80, 96, 123, 0.18);
  background: rgba(255, 255, 255, 0.92);
  color: #273347;
  font-size: 10px;
  line-height: 1.2;
  font-weight: 600;
  padding: 2px 7px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.map-node-btn.active .map-node-name {
  border-color: rgba(58, 141, 255, 0.5);
  background: rgba(232, 242, 255, 0.95);
  color: #1f62bc;
}

.map-node-btn.current .map-node-dot {
  background: #0bbf78;
  box-shadow: 0 0 0 3px rgba(11, 191, 120, 0.24);
}

.map-node-btn.risk-high .map-node-dot {
  background: #f06464;
  box-shadow: 0 0 0 3px rgba(240, 100, 100, 0.25);
}

.map-node-btn.risk-low .map-node-dot {
  background: #40b682;
  box-shadow: 0 0 0 3px rgba(64, 182, 130, 0.24);
}

.map-detail-card {
  border-radius: 12px;
  border: 1px solid rgba(60, 60, 67, 0.12);
  background: #ffffff;
  padding: 9px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.map-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.map-detail-name {
  margin: 0;
  font-size: 13px;
  color: #1b1f27;
  font-weight: 700;
}

.map-risk-badge {
  min-width: 48px;
  height: 20px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  padding: 0 8px;
}

.map-risk-badge.risk-high {
  color: #c04a4a;
  background: rgba(240, 100, 100, 0.16);
}

.map-risk-badge.risk-medium {
  color: #5d6b84;
  background: rgba(93, 107, 132, 0.14);
}

.map-risk-badge.risk-low {
  color: #2f8c68;
  background: rgba(64, 182, 130, 0.16);
}

.map-detail-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: #5f6879;
  word-break: break-word;
}

.map-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.map-tag {
  height: 18px;
  border-radius: 999px;
  background: rgba(58, 141, 255, 0.14);
  color: #2f6ec1;
  font-size: 10px;
  line-height: 18px;
  padding: 0 7px;
}

.map-travel-btn {
  border: 0;
  min-width: 0;
  min-height: 0;
  height: 28px;
  border-radius: 9px;
  background: #3a8dff;
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  padding: 0 12px;
  cursor: pointer;
  align-self: flex-end;
}

.map-travel-btn:disabled {
  background: rgba(120, 131, 152, 0.36);
  color: #eff2f8;
  cursor: not-allowed;
}

.shop-app {
  background: #f6f7fb;
}

.shop-header {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 6px;
  background: rgba(247, 247, 250, 0.9);
}

.shop-header .app-title,
.wallet-header .app-title {
  margin-right: 0;
  text-align: left;
  padding-left: 2px;
}

.shop-header-right {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-self: end;
  gap: 4px;
}

.shop-header-balance {
  font-size: 11px;
  line-height: 1;
  color: #2c3340;
  font-weight: 600;
  white-space: nowrap;
}

.shop-wallet-link,
.wallet-shop-link {
  border: 0;
  width: 42px;
  flex: 0 0 42px;
  height: 24px;
  background: transparent;
  color: var(--ios-accent);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding: 0;
  min-width: 0;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
}

.shop-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 12px;
  background: #f6f7fb;
}

.shop-search-card,
.shop-orders,
.wallet-balance-card,
.wallet-orders {
  border-radius: 12px;
  border: 1px solid rgba(60, 60, 67, 0.12);
  background: #ffffff;
  padding: 9px;
}

.shop-search-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shop-search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
}

.shop-search-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  border: 1px solid rgba(60, 60, 67, 0.18);
  border-radius: 9px;
  background: #ffffff;
  color: #1a1c20;
  font-size: 12px;
  padding: 0 9px;
}

.shop-search-input:focus {
  outline: none;
  border-color: rgba(255, 111, 97, 0.48);
  box-shadow: 0 0 0 2px rgba(255, 111, 97, 0.14);
}

.shop-search-btn {
  border: 0;
  height: 27px;
  min-height: 27px;
  min-width: 44px;
  border-radius: 8px;
  background: #ff6f61;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding: 0 9px;
  white-space: nowrap;
  cursor: pointer;
}

.shop-search-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.shop-error {
  margin: 0;
  font-size: 12px;
  color: #d94a4a;
}

.shop-results {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.shop-empty {
  margin: 4px 0;
  font-size: 12px;
  color: #8e8e93;
  text-align: center;
}

.shop-item {
  border-radius: 11px;
  border: 1px solid rgba(60, 60, 67, 0.12);
  background: #ffffff;
  padding: 9px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: flex-start;
  gap: 8px;
}

.shop-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shop-item-name {
  margin: 0;
  font-size: 13px;
  color: #1a1c20;
  font-weight: 700;
}

.shop-item-desc {
  margin: 0;
  font-size: 11px;
  color: #596175;
  line-height: 1.4;
  word-break: break-word;
}

.shop-item-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.shop-item-tag {
  height: 18px;
  border-radius: 999px;
  background: rgba(80, 96, 123, 0.12);
  color: #607087;
  font-size: 10px;
  line-height: 18px;
  padding: 0 6px;
}

.shop-item-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.shop-item-price {
  margin: 0;
  font-size: 13px;
  color: #d8564a;
  font-weight: 700;
}

.shop-buy-btn {
  border: 0;
  min-width: 48px;
  height: 24px;
  border-radius: 8px;
  background: #1f89f7;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  padding: 0 8px;
  cursor: pointer;
}

.shop-buy-btn:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}

.shop-orders {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.shop-orders-title,
.wallet-orders-title {
  margin: 0;
  font-size: 12px;
  color: #1a1c20;
  font-weight: 700;
}

.shop-orders-empty,
.wallet-orders-empty {
  margin: 0;
  font-size: 11px;
  color: #8e8e93;
}

.shop-orders-list,
.wallet-orders-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.shop-order-item,
.wallet-order-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 5px;
  border-top: 1px solid rgba(60, 60, 67, 0.1);
}

.shop-order-item:first-child,
.wallet-order-item:first-child {
  padding-top: 0;
  border-top: 0;
}

.shop-order-main,
.wallet-order-main {
  min-width: 0;
  flex: 1;
}

.shop-order-name,
.wallet-order-name {
  margin: 0;
  font-size: 11px;
  color: #1d2026;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shop-order-time,
.wallet-order-time {
  margin-top: 2px;
  font-size: 10px;
  color: #8e8e93;
}

.shop-order-price,
.wallet-order-price {
  margin: 0;
  font-size: 11px;
  color: #d8564a;
  font-weight: 700;
}

.wallet-app {
  background: #f6f7fb;
}

.wallet-header {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 6px;
  background: rgba(247, 247, 250, 0.9);
}

.wallet-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 12px;
  background: #f6f7fb;
}

.wallet-balance-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wallet-balance-label {
  margin: 0;
  font-size: 12px;
  color: #657186;
}

.wallet-balance-value {
  margin: 0;
  font-size: 26px;
  color: #1f89f7;
  font-weight: 700;
  line-height: 1.05;
}

.wallet-balance-hint {
  margin: 0;
  font-size: 11px;
  color: #6f7889;
  line-height: 1.4;
}

.clues-app {
  background: #f5f6fb;
}

.clues-header {
  background: rgba(247, 247, 250, 0.9);
}

.clues-header .app-title {
  margin-right: 0;
  text-align: left;
  padding-left: 2px;
}

.clues-toolbar {
  padding: 8px 10px 7px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-bottom: 1px solid rgba(60, 60, 67, 0.1);
  background: #f5f6fb;
}

.clues-search {
  width: 100%;
  height: 30px;
  border: 1px solid rgba(60, 60, 67, 0.18);
  border-radius: 999px;
  background: #ffffff;
  color: #181a1e;
  font-size: 12px;
  padding: 0 11px;
  box-sizing: border-box;
}

.clues-search:focus {
  outline: none;
  border-color: rgba(123, 105, 255, 0.45);
  box-shadow: 0 0 0 2px rgba(123, 105, 255, 0.12);
}

.clues-filters {
  display: flex;
  gap: 6px;
}

.clues-select {
  flex: 1;
  min-width: 0;
  height: 28px;
  border: 1px solid rgba(60, 60, 67, 0.18);
  border-radius: 8px;
  background: #ffffff;
  color: #2a2e36;
  font-size: 11px;
  padding: 0 8px;
}

.clues-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 12px;
  background: #f5f6fb;
}

.clues-error {
  margin: 0;
  font-size: 12px;
  color: #d32f2f;
}

.clues-empty {
  margin: auto;
  font-size: 13px;
  color: #8e8e93;
}

.clue-item {
  border-radius: 11px;
  border: 1px solid rgba(60, 60, 67, 0.12);
  background: #ffffff;
  padding: 9px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.clue-item-clickable {
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.clue-item-clickable:active {
  border-color: rgba(91, 73, 214, 0.35);
  box-shadow: 0 1px 0 rgba(91, 73, 214, 0.14);
}

.clue-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.clue-source {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 18px;
  border-radius: 999px;
  background: rgba(123, 105, 255, 0.14);
  color: #5b49d6;
  font-size: 10px;
  font-weight: 600;
  padding: 0 8px;
}

.clue-status {
  font-size: 10px;
  font-weight: 600;
}

.clue-status.status-open {
  color: #d08316;
}

.clue-status.status-resolved {
  color: #218b68;
}

.clue-title {
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
  color: #1a1c20;
  font-weight: 700;
  word-break: break-word;
}

.clue-summary {
  margin: 0;
  font-size: 12px;
  line-height: 1.43;
  color: #4f5562;
  word-break: break-word;
}

.clue-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.clue-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  border-radius: 999px;
  background: rgba(80, 96, 123, 0.1);
  color: #5a6780;
  font-size: 10px;
  padding: 0 7px;
}

.clue-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.clue-time {
  font-size: 10px;
  color: #8e8e93;
}

.clue-enter-detail {
  font-size: 10px;
  color: #7a8396;
}

.clue-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
}

.clue-action-btn {
  border: 0;
  min-width: 0;
  min-height: 0;
  height: 22px;
  border-radius: 999px;
  background: rgba(123, 105, 255, 0.14);
  color: #5b49d6;
  font-size: 10px;
  font-weight: 600;
  padding: 0 9px;
  line-height: 1;
  flex: 0 0 auto;
  cursor: pointer;
  white-space: nowrap;
}

.clue-action-btn.danger {
  background: rgba(220, 46, 46, 0.14);
  color: #be2f2f;
}

.clues-detail-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 12px;
  background: #f5f6fb;
}

.clue-detail-card {
  border-radius: 11px;
  border: 1px solid rgba(60, 60, 67, 0.12);
  background: #ffffff;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.clue-detail-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.clue-forward-card {
  border-radius: 11px;
  border: 1px solid rgba(60, 60, 67, 0.12);
  background: #ffffff;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.clue-forward-title {
  margin: 0;
  font-size: 12px;
  color: #1a1c20;
  font-weight: 600;
}

.clue-forward-target {
  width: 100%;
}

.clue-forward-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.phone-settings-app {
  background: #f6f7fb;
}

.phone-settings-header {
  background: rgba(247, 247, 250, 0.9);
}

.phone-settings-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 10px 10px 12px;
}

.phone-settings-card {
  border-radius: 12px;
  border: 1px solid rgba(60, 60, 67, 0.12);
  background: #ffffff;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.phone-settings-title {
  margin: 0;
  font-size: 13px;
  color: #1a1c20;
  font-weight: 700;
}

.phone-settings-value {
  margin: 0;
  font-size: 12px;
  color: #5b49d6;
  font-weight: 600;
}

.phone-settings-range {
  width: 100%;
  margin: 0;
  accent-color: #5b49d6;
}

.phone-settings-hint {
  margin: 0;
  font-size: 11px;
  color: #778093;
  line-height: 1.35;
}

.phone-settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.phone-settings-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.phone-settings-field-label {
  font-size: 11px;
  color: #667083;
  line-height: 1.25;
}

.phone-settings-number {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: 9px;
  border: 1px solid rgba(60, 60, 67, 0.2);
  background: #f7f8fc;
  color: #1a1c20;
  font-size: 12px;
  font-weight: 600;
  outline: none;
}

.phone-settings-number:focus {
  border-color: rgba(10, 132, 255, 0.5);
  background: #ffffff;
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

.phone-toast {
  position: absolute;
  left: 66px;
  top: -2px;
  width: 188px;
  border: 0;
  border-radius: 12px;
  padding: 8px 10px;
  background: rgba(16, 19, 26, 0.92);
  color: #ffffff;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 3px;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(3, 7, 18, 0.35);
}

.phone-toast-title {
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
}

.phone-toast-content {
  font-size: 11px;
  line-height: 1.3;
  color: rgba(255, 255, 255, 0.86);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.phone-toast-enter-active,
.phone-toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.phone-toast-enter-from,
.phone-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.platform-android .forum-list,
.platform-android .forum-thread-page {
  padding: 8px 10px calc(10px + env(safe-area-inset-bottom, 0px));
  gap: 8px;
}

.platform-android .forum-header {
  min-height: 52px;
  padding: 8px 8px 8px 4px;
}

.platform-android .forum-header .app-title {
  font-size: 16px;
}

.platform-android .forum-header .header-action {
  min-width: 28px;
  font-size: 10px;
}

.platform-android .forum-refresh-btn {
  height: 22px;
  font-size: 10px;
  padding: 0 1px;
}

.platform-android .forum-post-item,
.platform-android .forum-thread-card,
.platform-android .forum-thread-comments {
  box-shadow: none;
}

.platform-android .forum-post-item {
  border-radius: 10px;
  padding: 8px 9px;
  gap: 5px;
}

.platform-android .forum-post-title {
  font-size: 12px;
  line-height: 1.33;
}

.platform-android .forum-post-preview,
.platform-android .forum-thread-content,
.platform-android .forum-thread-comment-text {
  font-size: 11px;
}

.platform-android .forum-post-stats {
  gap: 8px;
  row-gap: 4px;
}

.platform-android .news-list,
.platform-android .news-thread-page {
  padding: 0 8px calc(10px + env(safe-area-inset-bottom, 0px));
  gap: 8px;
}

.platform-android .news-header {
  min-height: 52px;
  padding: 7px 8px 7px 3px;
}

.platform-android .news-header .app-title {
  font-size: 15px;
}

.platform-android .news-header .header-action {
  min-width: 28px;
  font-size: 10px;
}

.platform-android .news-brand-logo {
  font-size: 18px;
}

.platform-android .news-brand-sub {
  font-size: 11px;
}

.platform-android .news-channel-strip {
  padding: 0 6px 0 8px;
}

.platform-android .news-channel-btn {
  font-size: 13px;
  padding: 10px 7px 9px;
}

.platform-android .news-refresh-btn {
  height: 21px;
  font-size: 10px;
  padding: 0 1px;
}

.platform-android .news-item,
.platform-android .news-detail-card,
.platform-android .news-version-tab {
  box-shadow: none;
}

.platform-android .news-item {
  padding: 10px 0;
  gap: 8px;
}

.platform-android .news-item-headline {
  font-size: 13px;
}

.platform-android .news-item-headline,
.platform-android .news-item-summary,
.platform-android .news-detail-summary {
  font-size: 11px;
}

.platform-android .news-thumb {
  width: 84px;
  height: 62px;
  flex-basis: 84px;
  padding: 6px;
}

.platform-android .news-thumb-label {
  font-size: 10px;
}

.platform-android .news-version-tab {
  min-width: 90px;
  max-width: 114px;
  padding: 5px 6px;
}

.platform-android .map-page {
  padding: 8px 8px 10px;
  gap: 7px;
}

.platform-android .map-header .app-title {
  font-size: 16px;
}

.platform-android .map-refresh-btn {
  height: 22px;
  font-size: 10px;
  padding: 0 1px;
}

.platform-android .map-canvas {
  min-height: 206px;
  border-radius: 10px;
}

.platform-android .map-node-name {
  font-size: 9px;
  padding: 1px 6px;
}

.platform-android .map-detail-card {
  border-radius: 10px;
  padding: 8px;
  box-shadow: none;
}

.platform-android .map-detail-name {
  font-size: 12px;
}

.platform-android .map-detail-desc {
  font-size: 10px;
}

.platform-android .map-tag {
  font-size: 9px;
  height: 16px;
  line-height: 16px;
}

.platform-android .map-travel-btn {
  height: 24px;
  font-size: 10px;
  padding: 0 10px;
}

.platform-android .shop-page,
.platform-android .wallet-page {
  padding: 8px 8px 10px;
  gap: 7px;
}

.platform-android .shop-header .app-title,
.platform-android .wallet-header .app-title {
  font-size: 16px;
}

.platform-android .shop-header-right {
  gap: 3px;
}

.platform-android .shop-header-balance {
  font-size: 10px;
}

.platform-android .shop-wallet-link,
.platform-android .wallet-shop-link {
  font-size: 10px;
}

.platform-android .shop-search-card,
.platform-android .shop-orders,
.platform-android .wallet-balance-card,
.platform-android .wallet-orders {
  border-radius: 10px;
  padding: 8px;
  box-shadow: none;
}

.platform-android .shop-search-input {
  height: 30px;
  font-size: 11px;
}

.platform-android .shop-search-btn {
  height: 26px;
  min-width: 42px;
  font-size: 10px;
  padding: 0 8px;
}

.platform-android .shop-tag-btn {
  height: 21px;
  font-size: 9px;
  padding: 0 8px;
}

.platform-android .shop-item {
  border-radius: 9px;
  padding: 8px;
  gap: 7px;
}

.platform-android .shop-item-side {
  min-width: 52px;
  gap: 5px;
}

.platform-android .shop-item-name {
  font-size: 12px;
}

.platform-android .shop-item-desc {
  font-size: 10px;
}

.platform-android .shop-item-price {
  font-size: 12px;
}

.platform-android .shop-buy-btn {
  min-width: 44px;
  height: 22px;
  font-size: 9px;
  padding: 0 7px;
}

.platform-android .shop-orders-title,
.platform-android .wallet-orders-title {
  font-size: 11px;
}

.platform-android .wallet-balance-value {
  font-size: 22px;
}

.platform-android .wallet-balance-label,
.platform-android .wallet-balance-hint,
.platform-android .shop-order-name,
.platform-android .shop-order-time,
.platform-android .shop-order-price,
.platform-android .wallet-order-name,
.platform-android .wallet-order-time,
.platform-android .wallet-order-price {
  font-size: 10px;
}

.platform-android .alerts-toolbar,
.platform-android .alerts-page,
.platform-android .clues-toolbar,
.platform-android .clues-page,
.platform-android .clues-detail-page {
  padding-left: 8px;
  padding-right: 8px;
}

.platform-android .alerts-header,
.platform-android .clues-header {
  min-height: 52px;
  padding: 8px 8px 8px 4px;
}

.platform-android .alerts-header .app-title,
.platform-android .clues-header .app-title {
  font-size: 16px;
}

.platform-android .alert-item,
.platform-android .clue-item {
  border-radius: 9px;
  box-shadow: none;
}

.platform-android .collect-clue-btn,
.platform-android .clue-action-btn {
  height: 20px;
  font-size: 9px;
  padding: 0 7px;
}

.platform-android .clue-meta {
  align-items: flex-start;
  gap: 6px;
}

.platform-android .clue-actions {
  width: 100%;
  justify-content: flex-end;
}

.platform-android .phone-settings-page {
  padding: 8px 8px 10px;
  gap: 8px;
}

.platform-android .phone-settings-card {
  border-radius: 10px;
  padding: 8px;
}

.platform-android .phone-settings-title {
  font-size: 12px;
}

.platform-android .phone-settings-value,
.platform-android .phone-settings-hint {
  font-size: 10px;
}

.platform-android .phone-settings-grid {
  gap: 6px;
}

.platform-android .phone-settings-field-label {
  font-size: 10px;
}

.platform-android .phone-settings-number {
  height: 30px;
  font-size: 11px;
  padding: 0 8px;
}

.platform-android .phone-toast {
  left: 58px;
  top: -4px;
  width: 170px;
  padding: 7px 8px;
}

.platform-android .phone-toast-title {
  font-size: 11px;
}

.platform-android .phone-toast-content {
  font-size: 10px;
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

  .app-badge {
    top: -4px;
    right: -7px;
    min-width: 16px;
    height: 16px;
    font-size: 9px;
    line-height: 16px;
    padding: 0 4px;
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

  .forum-list,
  .forum-thread-page {
    padding: 8px 10px 10px;
    gap: 8px;
  }

  .forum-post-item {
    padding: 8px 9px;
    gap: 5px;
  }

  .forum-post-title {
    font-size: 12px;
  }

  .forum-post-preview,
  .forum-thread-content,
  .forum-thread-comment-text {
    font-size: 11px;
  }

  .forum-refresh-btn {
    font-size: 9px;
    padding: 0 1px;
  }

  .alerts-toolbar,
  .alerts-page,
  .clues-toolbar,
  .clues-page,
  .clues-detail-page {
    padding-left: 8px;
    padding-right: 8px;
  }

  .alert-item,
  .clue-item {
    border-radius: 9px;
  }

  .collect-clue-btn,
  .clue-action-btn {
    height: 20px;
    font-size: 9px;
    padding: 0 7px;
  }

  .news-list,
  .news-thread-page {
    padding: 0 8px 10px;
    gap: 8px;
  }

  .news-channel-strip {
    padding: 0 6px 0 8px;
  }

  .news-channel-btn {
    font-size: 13px;
    padding: 10px 7px 9px;
  }

  .news-item {
    padding: 10px 0;
    gap: 8px;
  }

  .news-item-headline {
    font-size: 13px;
  }

  .news-item-headline,
  .news-item-summary,
  .news-detail-summary {
    font-size: 11px;
  }

  .news-thumb {
    width: 84px;
    height: 62px;
    flex-basis: 84px;
    padding: 6px;
  }

  .phone-toast {
    left: 58px;
    width: 170px;
    padding: 7px 8px;
  }

  .phone-toast-title {
    font-size: 11px;
  }

  .phone-toast-content {
    font-size: 10px;
  }

  .news-refresh-btn {
    font-size: 9px;
    padding: 0 1px;
  }

  .news-version-tab {
    min-width: 90px;
    max-width: 112px;
  }

  .map-page {
    padding: 8px 8px 10px;
    gap: 7px;
  }

  .map-canvas {
    min-height: 208px;
    border-radius: 10px;
  }

  .map-node-name {
    font-size: 9px;
    padding: 1px 6px;
  }

  .map-detail-card {
    border-radius: 10px;
    padding: 8px;
  }

  .map-detail-name {
    font-size: 12px;
  }

  .map-detail-desc {
    font-size: 11px;
  }

  .map-travel-btn {
    height: 24px;
    font-size: 10px;
    padding: 0 10px;
  }

  .map-refresh-btn {
    font-size: 10px;
    padding: 0 1px;
  }

  .shop-page,
  .wallet-page {
    padding: 8px 8px 10px;
    gap: 7px;
  }

  .shop-search-card,
  .shop-orders,
  .wallet-balance-card,
  .wallet-orders {
    border-radius: 10px;
    padding: 8px;
  }

  .shop-search-input {
    height: 30px;
    font-size: 11px;
  }

  .shop-search-btn {
    height: 26px;
    min-width: 42px;
    font-size: 10px;
    padding: 0 8px;
  }

  .shop-tag-btn {
    height: 21px;
    font-size: 9px;
    padding: 0 8px;
  }

  .shop-item {
    border-radius: 9px;
    padding: 8px;
    gap: 7px;
  }

  .shop-item-side {
    min-width: 52px;
    gap: 5px;
  }

  .shop-item-name {
    font-size: 12px;
  }

  .shop-item-desc {
    font-size: 10px;
  }

  .shop-item-price {
    font-size: 12px;
  }

  .shop-buy-btn {
    min-width: 44px;
    height: 22px;
    font-size: 9px;
    padding: 0 7px;
  }

  .shop-orders-title,
  .wallet-orders-title {
    font-size: 11px;
  }

  .wallet-balance-value {
    font-size: 22px;
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

  .app-badge {
    top: -3px;
    right: -6px;
    min-width: 15px;
    height: 15px;
    font-size: 8px;
    line-height: 15px;
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

  .forum-header-actions {
    gap: 5px;
  }

  .forum-refresh-btn {
    font-size: 9px;
  }

  .forum-post-author,
  .forum-thread-comment-author {
    font-size: 10px;
  }

  .forum-post-time,
  .forum-thread-comment-time,
  .forum-post-stats {
    font-size: 9px;
  }

  .news-header-actions {
    gap: 5px;
  }

  .news-brand-logo {
    font-size: 17px;
  }

  .news-brand-sub {
    font-size: 10px;
  }

  .news-channel-btn {
    font-size: 12px;
    padding: 9px 6px 8px;
  }

  .news-refresh-btn {
    font-size: 9px;
  }

  .news-outlet {
    font-size: 9px;
    max-width: 42%;
  }

  .news-thumb {
    width: 78px;
    height: 58px;
    flex-basis: 78px;
    padding: 5px;
  }

  .news-thumb-label {
    font-size: 9px;
  }

  .news-item-time,
  .news-version-count,
  .news-version-credibility {
    font-size: 9px;
  }

  .alerts-filter-btn,
  .alerts-read-all-btn,
  .collect-clue-btn,
  .clue-action-btn {
    font-size: 9px;
  }

  .phone-toast {
    left: 54px;
    width: 154px;
    padding: 6px 7px;
  }

  .phone-toast-title {
    font-size: 10px;
  }

  .phone-toast-content {
    font-size: 9px;
  }

  .news-detail-headline {
    font-size: 13px;
  }

  .map-canvas {
    min-height: 190px;
  }

  .map-node-name {
    font-size: 8px;
    padding: 1px 5px;
  }

  .map-risk-badge {
    min-width: 44px;
    height: 18px;
    font-size: 9px;
    padding: 0 7px;
  }

  .map-tag {
    font-size: 8px;
    height: 15px;
    line-height: 15px;
    padding: 0 6px;
  }

  .map-travel-btn {
    height: 22px;
    font-size: 9px;
    padding: 0 9px;
  }

  .shop-wallet-link,
  .wallet-shop-link {
    font-size: 10px;
    min-width: 0;
  }

  .shop-header-right {
    gap: 2px;
  }

  .shop-header-balance {
    font-size: 9px;
  }

  .shop-search-input {
    height: 28px;
    font-size: 10px;
  }

  .shop-search-btn {
    height: 24px;
    min-width: 40px;
    font-size: 9px;
    padding: 0 7px;
  }

  .shop-item-name {
    font-size: 11px;
  }

  .shop-item-desc,
  .shop-order-name,
  .shop-order-time,
  .shop-order-price,
  .wallet-order-name,
  .wallet-order-time,
  .wallet-order-price {
    font-size: 9px;
  }

  .wallet-balance-value {
    font-size: 20px;
  }
}
</style>
