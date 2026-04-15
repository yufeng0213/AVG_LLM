/**
 * checkInItems.js - 签到系统共享的道具配置和奖池定义
 */

// ====== 道具配置 ======

export const CHECKIN_ITEMS = {
  energy_potion: {
    id: 'energy_potion',
    name: '精力药水',
    icon: '🧪',
    description: '使用后 +20 精力',
    category: 'consumable',
  },
  affection_boost: {
    id: 'affection_boost',
    name: '好感加速卡',
    icon: '🌟',
    description: '下次送礼获得的好感度 ×1.5',
    category: 'consumable',
  },
  theme_fragment: {
    id: 'theme_fragment',
    name: '主题碎片',
    icon: '🧩',
    description: '集齐 10 个可兑换新主题',
    category: 'collectible',
  },
  free_ticket: {
    id: 'free_ticket',
    name: '免入场券',
    icon: '🎫',
    description: '小游戏免一次入场费',
    category: 'consumable',
  },
  double_coin_card: {
    id: 'double_coin_card',
    name: '双倍金币卡',
    icon: '✖️',
    description: '下一局小游戏获得金币 ×2',
    category: 'consumable',
  },
  avatar_frame_exp: {
    id: 'avatar_frame_exp',
    name: '头像框体验卡',
    icon: '🖼️',
    description: '限时头像框，持续 3 天',
    category: 'consumable',
  },
  avatar_frame_limited: {
    id: 'avatar_frame_limited',
    name: '限定头像框',
    icon: '👑',
    description: '永久限定头像框',
    category: 'permanent',
  },
  stamp_normal: {
    id: 'stamp_normal',
    name: '普通邮票',
    icon: '🌸',
    description: '用于投递信件的基础邮票',
    category: 'stamp',
    price: 10,
  },
  stamp_star: {
    id: 'stamp_star',
    name: '星光邮票',
    icon: '🌟',
    description: '回信更热情，分享更多生活细节',
    category: 'stamp',
    price: 50,
  },
  stamp_ribbon: {
    id: 'stamp_ribbon',
    name: '蝴蝶结邮票',
    icon: '🎀',
    description: '回信附带好感度 +1',
    category: 'stamp',
    price: 0, // 商店不售
  },
  stamp_limited: {
    id: 'stamp_limited',
    name: '限定邮票',
    icon: '📮',
    description: '回信更长、更用心，附带随机小礼物',
    category: 'stamp',
    price: 0, // 商店不售
  },
}

// ====== 七日签到奖池 ======

export const PRIZE_POOL_7DAY = {
  copper: [
    { type: 'coin', min: 1, max: 3, weight: 70 },
    { type: 'item', itemId: 'energy_potion', quantity: 1, weight: 20 },
    { type: 'item', itemId: 'avatar_frame_exp', quantity: 1, weight: 10 },
  ],
  silver: [
    { type: 'coin', min: 5, max: 15, weight: 50 },
    { type: 'item', itemId: 'energy_potion', quantity: 2, weight: 20 },
    { type: 'item', itemId: 'affection_boost', quantity: 1, weight: 15 },
    { type: 'item', itemId: 'theme_fragment', quantity: 1, weight: 10 },
    { type: 'item', itemId: 'avatar_frame_limited', quantity: 1, weight: 5 },
  ],
  gold: [
    { type: 'coin', min: 20, max: 40, weight: 30 },
    { type: 'item', itemId: 'energy_potion', quantity: 3, weight: 20 },
    { type: 'item', itemId: 'affection_boost', quantity: 2, weight: 15 },
    { type: 'item', itemId: 'theme_fragment', quantity: 3, weight: 15 },
    { type: 'item', itemId: 'free_ticket', quantity: 1, weight: 10 },
    { type: 'item', itemId: 'double_coin_card', quantity: 1, weight: 8 },
    { type: 'item', itemId: 'avatar_frame_limited', quantity: 1, weight: 2 },
  ],
}

// ====== 七日签到关卡配置 ======

export const LEVEL_7DAY = [
  { day: 1, baseCoin: 5,  pool: 'copper', label: '新手好运' },
  { day: 2, baseCoin: 8,  pool: 'copper', label: '' },
  { day: 3, baseCoin: 12, pool: 'silver', label: '🎁 额外礼包' },
  { day: 4, baseCoin: 15, pool: 'silver', label: '' },
  { day: 5, baseCoin: 20, pool: 'silver', label: '' },
  { day: 6, baseCoin: 25, pool: 'gold', label: '🎁 额外礼包' },
  { day: 7, baseCoin: 50, pool: 'gold', label: '🔥 七日大奖' },
]

// ====== 每日签到奖励 ======

export const DAILY_REWARD_SCHEDULE = [
  // 索引 0 = 周日, 1 = 周一, ..., 6 = 周六
  { // 周日
    baseCoins: [20, 30],
    label: '周末礼包',
    hasSurprise: true,
  },
  { // 周一
    baseCoins: [10, 15],
    label: '',
    hasSurprise: false,
  },
  { // 周二
    baseCoins: [],
    label: '精力补给',
    hasSurprise: false,
    guaranteedItem: { itemId: 'energy_potion', quantity: 1 },
  },
  { // 周三
    baseCoins: [10, 15],
    label: '',
    hasSurprise: true,
  },
  { // 周四
    baseCoins: [],
    label: '社交加成',
    hasSurprise: false,
    guaranteedItem: { itemId: 'affection_boost', quantity: 1 },
  },
  { // 周五
    baseCoins: [15, 20],
    label: '周末预热',
    hasSurprise: true,
  },
  { // 周六
    baseCoins: [],
    label: '惊喜周末',
    hasSurprise: true,
  },
]

// ====== 周末惊喜池 ======

export const WEEKEND_SURPRISE_POOL = [
  { type: 'coin', min: 5, max: 20, weight: 40 },
  { type: 'item', itemId: 'free_ticket', quantity: 1, weight: 15 },
  { type: 'item', itemId: 'double_coin_card', quantity: 1, weight: 15 },
  { type: 'item', itemId: 'theme_fragment', quantity: 1, weight: 10 },
  { type: 'item', itemId: 'avatar_frame_exp', quantity: 1, weight: 10 },
  { type: 'item', itemId: 'avatar_frame_limited', quantity: 1, weight: 5 },
  { type: 'item', itemId: 'energy_potion', quantity: 3, weight: 5 },
]

// ====== 月度奖励 ======

export const MONTHLY_REWARDS = [
  { threshold: 1.0, label: '完美签到', rewards: [
    { type: 'item', itemId: 'avatar_frame_limited', quantity: 1 },
    { type: 'coin', amount: 200 },
  ]},
  { threshold: 0.8, label: '全勤之星', rewards: [
    { type: 'item', itemId: 'free_ticket', quantity: 2 },
    { type: 'coin', amount: 50 },
  ]},
  { threshold: 0.5, label: '活跃之星', rewards: [
    { type: 'item', itemId: 'theme_fragment', quantity: 3 },
  ]},
]

// ====== 工具函数 ======

/**
 * 根据权重随机抽取奖池中的一个奖品
 */
export function drawFromPool(pool) {
  const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0)
  let random = Math.random() * totalWeight
  for (const prize of pool) {
    random -= prize.weight
    if (random <= 0) return prize
  }
  return pool[pool.length - 1]
}

/**
 * 随机整数 [min, max]
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * 生成签到奖励结果
 * @returns { baseCoins: number, items: Array<{id, name, icon, quantity}>, isWeekend: boolean }
 */
export function generateDailyReward() {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sun
  const schedule = DAILY_REWARD_SCHEDULE[dayOfWeek]

  const result = {
    baseCoins: 0,
    items: [],
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    label: schedule.label,
  }

  // 基础金币
  if (schedule.baseCoins.length > 0) {
    result.baseCoins = randomInt(schedule.baseCoins[0], schedule.baseCoins[1])
  }

  // 保证获得
  if (schedule.guaranteedItem) {
    const item = CHECKIN_ITEMS[schedule.guaranteedItem.itemId]
    result.items.push({
      id: schedule.guaranteedItem.itemId,
      name: item.name,
      icon: item.icon,
      quantity: schedule.guaranteedItem.quantity,
    })
  }

  // 惊喜奖励
  if (schedule.hasSurprise) {
    if (result.isWeekend) {
      const prize = drawFromPool(WEEKEND_SURPRISE_POOL)
      if (prize.type === 'coin') {
        result.baseCoins += randomInt(prize.min, prize.max)
      } else {
        const item = CHECKIN_ITEMS[prize.itemId]
        result.items.push({
          id: prize.itemId,
          name: item.name,
          icon: item.icon,
          quantity: prize.quantity,
        })
      }
    } else {
      // 工作日惊喜池（银池）
      const prize = drawFromPool(PRIZE_POOL_7DAY.silver)
      if (prize.type === 'coin') {
        result.baseCoins += randomInt(prize.min, prize.max)
      } else {
        const item = CHECKIN_ITEMS[prize.itemId]
        result.items.push({
          id: prize.itemId,
          name: item.name,
          icon: item.icon,
          quantity: prize.quantity,
        })
      }
    }
  }

  return result
}

/**
 * 计算月度统计
 */
export function calcMonthStats(records, year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let checkedDays = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (records[key]?.checked) checkedDays++
  }
  return {
    totalDays: daysInMonth,
    checkedDays,
    rate: daysInMonth > 0 ? checkedDays / daysInMonth : 0,
  }
}
