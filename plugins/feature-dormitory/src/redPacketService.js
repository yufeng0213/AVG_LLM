/**
 * 寝室红包服务
 * 处理红包的生成、存储、开启等功能
 */

// 存储键名
const RED_PACKET_STORAGE_KEY = 'avg_llm_dormitory_red_packets_v1'
const RED_PACKET_SENT_STORAGE_KEY = 'avg_llm_dormitory_red_packets_sent_v1'

// 红包类型
const RED_PACKET_TYPES = {
  NORMAL: 'normal',      // 普通红包
  LUCKY: 'lucky',        // 幸运红包（金额随机）
  SPECIAL: 'special',    // 特殊红包（节日/活动）
}

// 红包金额范围
const RED_PACKET_AMOUNT_RANGES = {
  normal: { min: 1, max: 50 },
  lucky: { min: 0.01, max: 100 },
  special: { min: 10, max: 200 },
}

// 角色发送红包的概率配置（每天）
const CHARACTER_SEND_PROBABILITY = 0.3 // 30% 概率

/**
 * 生成随机金额
 */
function generateRandomAmount(type = 'normal') {
  const range = RED_PACKET_AMOUNT_RANGES[type] || RED_PACKET_AMOUNT_RANGES.normal
  const min = range.min
  const max = range.max
  
  // 生成保留两位小数的随机数
  const random = Math.random() * (max - min) + min
  return Math.round(random * 100) / 100
}

/**
 * 创建红包
 */
function createRedPacket({
  senderId,
  senderName,
  amount,
  type = 'normal',
  blessing = '',
  characterId = '',
} = {}) {
  const packetAmount = amount || generateRandomAmount(type)
  
  return {
    id: `rp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    senderId: String(senderId || '').trim(),
    senderName: String(senderName || '匿名').trim() || '匿名',
    characterId: String(characterId || '').trim(),
    amount: packetAmount,
    type: String(type || 'normal').trim(),
    blessing: String(blessing || '').trim().slice(0, 100),
    createdAt: new Date().toISOString(),
    isOpened: false,
    openedAt: null,
  }
}

/**
 * 获取存储的红包列表
 */
function getStoredRedPackets() {
  try {
    const stored = localStorage.getItem(RED_PACKET_STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('[红包服务] 读取红包列表失败:', e)
    return []
  }
}

/**
 * 保存红包列表
 */
function saveStoredRedPackets(packets) {
  try {
    localStorage.setItem(RED_PACKET_STORAGE_KEY, JSON.stringify(Array.isArray(packets) ? packets : []))
    return true
  } catch (e) {
    console.error('[红包服务] 保存红包列表失败:', e)
    return false
  }
}

/**
 * 添加红包到存储
 */
function addRedPacket(packet) {
  const packets = getStoredRedPackets()
  packets.unshift(packet)
  // 限制存储数量
  return saveStoredRedPackets(packets.slice(0, 100))
}

/**
 * 获取已发送红包记录
 */
function getSentRedPackets() {
  try {
    const stored = localStorage.getItem(RED_PACKET_SENT_STORAGE_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    console.error('[红包服务] 读取已发送红包记录失败:', e)
    return []
  }
}

/**
 * 保存已发送红包记录
 */
function saveSentRedPackets(packets) {
  try {
    localStorage.setItem(RED_PACKET_SENT_STORAGE_KEY, JSON.stringify(Array.isArray(packets) ? packets : []))
    return true
  } catch (e) {
    console.error('[红包服务] 保存已发送红包记录失败:', e)
    return false
  }
}

/**
 * 记录已发送红包
 */
function recordSentRedPacket(packet) {
  const packets = getSentRedPackets()
  packets.push({
    id: packet.id,
    senderId: packet.senderId,
    characterId: packet.characterId,
    sentAt: packet.createdAt,
  })
  // 限制存储数量
  return saveSentRedPackets(packets.slice(-200))
}

/**
 * 检查角色今天是否已经发送过红包
 */
function hasCharacterSentToday(characterId) {
  const sentPackets = getSentRedPackets()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  
  return sentPackets.some(packet => {
    if (packet.characterId !== characterId) return false
    const sentDate = packet.sentAt.slice(0, 10)
    return sentDate === today
  })
}

/**
 * 判断角色是否应该发送红包（概率性）
 */
function shouldCharacterSendRedPacket(characterId) {
  // 移除每日发送限制，只要概率命中即可发送
  // 概率判断
  return Math.random() < CHARACTER_SEND_PROBABILITY
}

/**
 * 生成角色发送的红包
 */
function generateCharacterRedPacket(characterId, characterName) {
  if (!shouldCharacterSendRedPacket(characterId)) {
    return null
  }
  
  // 随机选择红包类型
  const typeRoll = Math.random()
  let type = RED_PACKET_TYPES.NORMAL
  if (typeRoll > 0.9) {
    type = RED_PACKET_TYPES.SPECIAL
  } else if (typeRoll > 0.7) {
    type = RED_PACKET_TYPES.LUCKY
  }
  
  // 随机祝福语
  const blessings = [
    '今天也要开心哦~',
    '祝你有个美好的一天！',
    '小小意思，不成敬意~',
    '拿去喝杯奶茶吧！',
    '今天运气不错呢！',
    '加油！',
    '开心每一天！',
    '给你一个小惊喜~',
  ]
  
  const packet = createRedPacket({
    senderId: `char_${characterId}`,
    senderName: characterName || '角色',
    characterId: String(characterId || '').trim(),
    type,
    blessing: blessings[Math.floor(Math.random() * blessings.length)],
  })
  
  // 保存到存储
  addRedPacket(packet)
  recordSentRedPacket(packet)
  
  return packet
}

/**
 * 开启红包
 */
function openRedPacket(packetId) {
  const packets = getStoredRedPackets()
  const index = packets.findIndex(p => p.id === packetId)
  
  if (index === -1) {
    return { success: false, error: '红包不存在' }
  }
  
  const packet = packets[index]
  
  if (packet.isOpened) {
    return { success: false, error: '红包已被开启', amount: packet.amount }
  }
  
  // 标记为已开启
  packet.isOpened = true
  packet.openedAt = new Date().toISOString()
  packets[index] = packet
  
  saveStoredRedPackets(packets)
  
  return { success: true, amount: packet.amount, packet }
}

/**
 * 获取未开启的红包列表
 */
function getUnopenedRedPackets() {
  const packets = getStoredRedPackets()
  return packets.filter(p => !p.isOpened)
}

/**
 * 获取红包信息
 */
function getRedPacket(packetId) {
  const packets = getStoredRedPackets()
  return packets.find(p => p.id === packetId) || null
}

/**
 * 用户发送红包
 */
function sendUserRedPacket({ amount, type = 'normal', blessing = '' } = {}) {
  const packetAmount = amount || generateRandomAmount(type)
  
  const packet = createRedPacket({
    senderId: 'user',
    senderName: '我',
    amount: packetAmount,
    type,
    blessing,
  })
  
  addRedPacket(packet)
  
  return packet
}

/**
 * 获取红包类型标签
 */
function getRedPacketTypeLabel(type) {
  const labels = {
    normal: '普通红包',
    lucky: '幸运红包',
    special: '特殊红包',
  }
  return labels[type] || '普通红包'
}

/**
 * 获取红包类型图标
 */
function getRedPacketTypeIcon(type) {
  const icons = {
    normal: '🧧',
    lucky: '🎁',
    special: '✨',
  }
  return icons[type] || '🧧'
}

export {
  // 常量
  RED_PACKET_TYPES,
  RED_PACKET_AMOUNT_RANGES,
  CHARACTER_SEND_PROBABILITY,
  
  // 函数
  createRedPacket,
  generateRandomAmount,
  getStoredRedPackets,
  saveStoredRedPackets,
  addRedPacket,
  getSentRedPackets,
  saveSentRedPackets,
  recordSentRedPacket,
  hasCharacterSentToday,
  shouldCharacterSendRedPacket,
  generateCharacterRedPacket,
  openRedPacket,
  getUnopenedRedPackets,
  getRedPacket,
  sendUserRedPacket,
  getRedPacketTypeLabel,
  getRedPacketTypeIcon,
}
