/**
 * usePhoneEconomy.js - 手机经济系统
 * 余额使用 WorldHub 全局金币 (playerState.economy.coins)。
 * 红包、礼物、交易记录等手机特有数据仍存 kvStorage。
 */
import { computed, reactive, ref, toRaw } from 'vue'
import { kvStorage } from '../../../../../src/storage/index.js'
import { usePlayerState } from '../../../../../src/stores/playerState.store.js'

const STORAGE_KEY_TRANSACTIONS = 'avg_llm_phone_transactions_v1'
const STORAGE_KEY_RED_PACKETS = 'avg_llm_phone_red_packets_v1'
const STORAGE_KEY_GIFTS = 'avg_llm_phone_gifts_v1'
const STORAGE_KEY_MIGRATED = 'avg_llm_phone_migrated_balance'

// 模块级状态
let _transactions = []
let _redPackets = []
let _gifts = []
let _initialized = false
let _migrationDone = false

async function loadFromStorage() {
  const t = await kvStorage.get(STORAGE_KEY_TRANSACTIONS)
  const rp = await kvStorage.get(STORAGE_KEY_RED_PACKETS)
  const g = await kvStorage.get(STORAGE_KEY_GIFTS)
  _transactions = Array.isArray(t) ? t : []
  _redPackets = Array.isArray(rp) ? rp : []
  _gifts = Array.isArray(g) ? g : []
  _initialized = true
}

function saveAll() {
  return Promise.all([
    kvStorage.set(STORAGE_KEY_TRANSACTIONS, _transactions),
    kvStorage.set(STORAGE_KEY_RED_PACKETS, _redPackets),
    kvStorage.set(STORAGE_KEY_GIFTS, _gifts),
  ])
}

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// 礼物目录
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
    _transactions = []
    _redPackets = []
    _gifts = []
    _initialized = true
    loadFromStorage()
  }

  const playerState = usePlayerState()

  const balance = computed({
    get: () => playerState.economy?.coins ?? 0,
    set: (val) => playerState.updateEconomy({ coins: val }),
  })

  const transactions = reactive(_transactions)
  const redPackets = reactive(_redPackets)
  const gifts = reactive(_gifts)

  // ===== 余额操作 =====

  // 增加金币（收入）
  async function addBalance(amount, reason) {
    const current = playerState.economy?.coins ?? 0
    playerState.updateEconomy({ coins: current + amount })
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

  // 扣除金币（支出）
  async function deductBalance(amount, reason) {
    const current = playerState.economy?.coins ?? 0
    if (current < amount) {
      return { success: false, error: '金币不足' }
    }
    playerState.updateEconomy({ coins: current - amount })
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

  // ===== 一次性迁移旧余额到全局金币 =====
  async function migrateOldBalance() {
    if (_migrationDone) return
    _migrationDone = true
    const BALANCE_KEY = 'avg_llm_phone_balance_v1'
    const oldBalance = await kvStorage.get(BALANCE_KEY)
    if (typeof oldBalance === 'number' && oldBalance > 0) {
      const current = playerState.economy?.coins ?? 0
      playerState.updateEconomy({ coins: current + oldBalance })
      // 记录一条迁移交易
      transactions.push({
        id: genId('tx_migrate'),
        type: 'income',
        amount: oldBalance,
        reason: '旧手机零钱迁移',
        createdAt: new Date().toISOString(),
      })
      await saveAll()
      // 标记已迁移，避免重复
      await kvStorage.set(STORAGE_KEY_MIGRATED, true)
    }
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
    migrateOldBalance,
  }
}
