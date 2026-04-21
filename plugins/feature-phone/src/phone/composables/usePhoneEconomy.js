/**
 * usePhoneEconomy.js - 手机经济系统
 * 零花钱余额、红包收发、礼物买卖、交易记录
 */
import { computed, reactive, ref } from 'vue'
import { kvStorage } from '../../../../../src/storage/index.js'

const STORAGE_KEY_BALANCE = 'avg_llm_phone_balance_v1'
const STORAGE_KEY_TRANSACTIONS = 'avg_llm_phone_transactions_v1'
const STORAGE_KEY_RED_PACKETS = 'avg_llm_phone_red_packets_v1'
const STORAGE_KEY_GIFTS = 'avg_llm_phone_gifts_v1'

// 模块级状态
let _balance = 0
let _transactions = []
let _redPackets = []
let _gifts = []
let _initialized = false

async function loadFromStorage() {
  const b = await kvStorage.get(STORAGE_KEY_BALANCE)
  const t = await kvStorage.get(STORAGE_KEY_TRANSACTIONS)
  const rp = await kvStorage.get(STORAGE_KEY_RED_PACKETS)
  const g = await kvStorage.get(STORAGE_KEY_GIFTS)
  _balance = typeof b === 'number' ? b : 0
  _transactions = Array.isArray(t) ? t : []
  _redPackets = Array.isArray(rp) ? rp : []
  _gifts = Array.isArray(g) ? g : []
  _initialized = true
}

function saveAll() {
  return Promise.all([
    kvStorage.set(STORAGE_KEY_BALANCE, _balance),
    kvStorage.set(STORAGE_KEY_TRANSACTIONS, _transactions),
    kvStorage.set(STORAGE_KEY_RED_PACKETS, _redPackets),
    kvStorage.set(STORAGE_KEY_GIFTS, _gifts),
  ])
}

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// 礼物目录（预定义小礼物，也可由 LLM 动态生成）
const GIFT_CATALOG = [
  { id: 'gift_flower', name: '一束花', icon: '💐', price: 8, category: '鲜花' },
  { id: 'gift_chocolate', name: '巧克力', icon: '🍫', price: 5, category: '零食' },
  { id: 'gift_cake', name: '小蛋糕', icon: '🍰', price: 12, category: '零食' },
  { id: 'gift_tea', name: '奶茶', icon: '🧋', price: 6, category: '饮品' },
  { id: 'gift_book', name: '一本好书', icon: '📚', price: 15, category: '文具' },
  { id: 'gift_plushie', name: '小玩偶', icon: '🧸', price: 20, category: '饰品' },
  { id: 'gift_music_box', name: '音乐盒', icon: '🎵', price: 35, category: '饰品' },
  { id: 'gift_necklace', name: '小项链', icon: '📿', price: 50, category: '饰品' },
  { id: 'gift_star', name: '一颗星星', icon: '⭐', price: 99, category: '特别' },
  { id: 'gift_ring', name: '一枚戒指', icon: '💍', price: 88, category: '特别' },
]

export function usePhoneEconomy() {
  if (!_initialized) {
    _balance = 0
    _transactions = []
    _redPackets = []
    _gifts = []
    _initialized = true
    loadFromStorage()
  }

  const balance = ref(_balance)
  const transactions = reactive(_transactions)
  const redPackets = reactive(_redPackets)
  const gifts = reactive(_gifts)

  // ===== 余额操作 =====

  // 增加余额（收入）
  async function addBalance(amount, reason) {
    _balance += amount
    balance.value = _balance
    const tx = {
      id: genId('tx'),
      type: 'income',
      amount,
      reason: reason || '红包',
      createdAt: new Date().toISOString(),
    }
    transactions.push(tx)
    await saveAll()
    return tx
  }

  // 扣除余额（支出）
  async function deductBalance(amount, reason) {
    if (_balance < amount) {
      return { success: false, error: '余额不足' }
    }
    _balance -= amount
    balance.value = _balance
    const tx = {
      id: genId('tx'),
      type: 'expense',
      amount,
      reason: reason || '购物',
      createdAt: new Date().toISOString(),
    }
    transactions.push(tx)
    await saveAll()
    return { success: true, transaction: tx }
  }

  // ===== 红包 =====

  // 创建红包（角色发红包给玩家）
  async function createRedPacket(senderId, senderName, amount, blessing) {
    const rp = {
      id: genId('rp'),
      senderId,
      senderName,
      amount: Math.round(amount * 100) / 100,
      blessing: blessing || '给你一个小惊喜~',
      createdAt: new Date().toISOString(),
      isOpened: false,
      openedAt: null,
      openedAmount: null,
    }
    redPackets.push(rp)
    await saveAll()
    return rp
  }

  // 打开红包
  async function openRedPacket(redPacketId) {
    const rp = redPackets.find(r => r.id === redPacketId)
    if (!rp || rp.isOpened) return { success: false, error: '红包无效或已打开' }

    // 随机金额（1~红包总额，保留两位小数）
    const openAmount = Math.round((1 + Math.random() * (rp.amount - 1)) * 100) / 100
    rp.isOpened = true
    rp.openedAt = new Date().toISOString()
    rp.openedAmount = openAmount

    await addBalance(openAmount, `${rp.senderName} 的红包`)
    await saveAll()
    return { success: true, amount: openAmount, senderName: rp.senderName }
  }

  // 标记红包已打开（不扣款，仅更新状态）
  async function markRedPacketOpened(redPacketId) {
    const rp = redPackets.find(r => r.id === redPacketId)
    if (!rp || rp.isOpened) return
    rp.isOpened = true
    rp.openedAt = new Date().toISOString()
    await saveAll()
  }

  // 获取未打开的红包
  const unopenedRedPackets = computed(() => redPackets.filter(r => !r.isOpened))

  // ===== 礼物 =====

  // 获取礼物目录
  function getGiftCatalog() {
    return GIFT_CATALOG
  }

  // 购买礼物
  async function buyGift(giftId) {
    const gift = GIFT_CATALOG.find(g => g.id === giftId)
    if (!gift) return { success: false, error: '礼物不存在' }

    const result = await deductBalance(gift.price, `购买 ${gift.name}`)
    if (!result.success) return result

    const purchasedGift = {
      id: genId('gift'),
      catalogId: gift.id,
      name: gift.name,
      icon: gift.icon,
      price: gift.price,
      category: gift.category,
      purchasedAt: new Date().toISOString(),
      sentTo: null,
      sentAt: null,
      senderReply: null,
    }
    gifts.push(purchasedGift)
    await saveAll()
    return { success: true, gift: purchasedGift }
  }

  // 送出礼物
  async function sendGift(giftId, contactId, contactName) {
    const gift = gifts.find(g => g.id === giftId && !g.sentTo)
    if (!gift) return { success: false, error: '礼物不存在或已送出' }

    gift.sentTo = contactId
    gift.sentToName = contactName
    gift.sentAt = new Date().toISOString()
    await saveAll()
    return { success: true, gift }
  }

  // 记录角色回礼
  async function recordGiftReply(giftId, replyText) {
    const gift = gifts.find(g => g.id === giftId)
    if (!gift) return
    gift.senderReply = { text: replyText, repliedAt: new Date().toISOString() }
    await saveAll()
  }

  // 记录角色回赠（角色给玩家送东西）
  async function recordGiftReturn(fromName, itemName, message) {
    const returnGift = {
      id: genId('gift_return'),
      catalogId: null,
      name: itemName,
      icon: '🎁',
      price: 0,
      category: '回礼',
      purchasedAt: new Date().toISOString(),
      sentTo: 'player',
      sentToName: '玩家',
      sentAt: new Date().toISOString(),
      senderReply: { text: message, repliedAt: new Date().toISOString() },
      isReturnGift: true,
      fromName,
    }
    gifts.push(returnGift)
    await saveAll()
    return returnGift
  }

  // 可送出的礼物（未送过的）
  const availableGifts = computed(() => gifts.filter(g => !g.sentTo))

  // 已送出的礼物
  const sentGifts = computed(() => gifts.filter(g => g.sentTo && !g.isReturnGift))

  // ===== 统计 =====

  // 总收入
  const totalIncome = computed(() =>
    transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
  )

  // 总支出
  const totalExpense = computed(() =>
    transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
  )

  // 最近交易
  function getRecentTransactions(limit = 20) {
    return [...transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit)
  }

  // 清空经济数据（调试用）
  async function resetEconomy() {
    _balance = 0
    _transactions = []
    _redPackets = []
    _gifts = []
    balance.value = 0
    transactions.splice(0, transactions.length)
    redPackets.splice(0, redPackets.length)
    gifts.splice(0, gifts.length)
    await saveAll()
  }

  return {
    balance,
    transactions,
    redPackets,
    gifts,
    unopenedRedPackets,
    availableGifts,
    sentGifts,
    totalIncome,
    totalExpense,
    addBalance,
    deductBalance,
    createRedPacket,
    openRedPacket,
    markRedPacketOpened,
    getGiftCatalog,
    buyGift,
    sendGift,
    recordGiftReply,
    recordGiftReturn,
    getRecentTransactions,
    resetEconomy,
  }
}
