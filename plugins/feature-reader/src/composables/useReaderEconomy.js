/**
 * useReaderEconomy.js - 书城经济系统
 * 金币独立存储在 kvStorage，可通过世界币充值
 */
import { kvStorage } from '../../../../src/storage/index.js'
import { usePlayerState } from '../../../../src/stores/playerState.store.js'

const READER_COINS_KEY = 'reader_coins'
const DAILY_CHECKIN_KEY = 'reader_daily_checkin'
const READER_SETTINGS_KEY = 'reader_settings'

/**
 * 获取书城金币
 */
export async function getReaderCoins() {
  const coins = await kvStorage.get(READER_COINS_KEY)
  return typeof coins === 'number' ? coins : 500 // 初始赠送 500 金币
}

/**
 * 设置书城金币
 */
export async function setReaderCoins(amount) {
  await kvStorage.set(READER_COINS_KEY, Math.max(0, Math.min(99999, amount)))
}

/**
 * 消费金币
 */
export async function spendReaderCoins(amount) {
  const current = await getReaderCoins()
  if (current < amount) return false
  await setReaderCoins(current - amount)
  return true
}

/**
 * 充值金币（从世界币转换）
 * @param {number} amount - 要充值的金币数量
 * @returns {Promise<{success, message, playerCoins, readerCoins}>}
 */
export async function rechargeReaderCoins(amount) {
  const playerState = usePlayerState()
  const worldCoins = playerState.economy?.coins ?? 0

  // 计算消耗的世界币（1 世界币 = 10 金币，最低消耗 1 世界币）
  const worldCost = Math.max(1, Math.ceil(amount / 10))

  if (worldCoins < worldCost) {
    return { success: false, message: `世界币不足！需要 ${worldCost} 世界币，当前余额 ${worldCoins}` }
  }

  // 扣除世界币，增加金币
  playerState.updateEconomy(prev => ({ ...prev, coins: prev.coins - worldCost }))
  const currentReaderCoins = await getReaderCoins()
  const newReaderCoins = currentReaderCoins + amount
  await setReaderCoins(newReaderCoins)

  return {
    success: true,
    message: `充值成功！消耗 ${worldCost} 世界币，获得 ${amount} 金币`,
    worldCost,
    playerCoins: playerState.economy?.coins ?? 0,
    readerCoins: newReaderCoins,
  }
}

/**
 * 每日签到
 */
export async function dailyCheckIn() {
  const today = new Date().toISOString().slice(0, 10)
  const lastCheckin = await kvStorage.get(DAILY_CHECKIN_KEY)

  if (lastCheckin === today) {
    return { success: false, message: '今天已经签到过了' }
  }

  await kvStorage.set(DAILY_CHECKIN_KEY, today)

  // 随机奖励 10-50 金币
  const reward = 10 + Math.floor(Math.random() * 41)
  const current = await getReaderCoins()
  await setReaderCoins(current + reward)

  return { success: true, reward, readerCoins: current + reward }
}

/**
 * 获取签到状态
 */
export async function getCheckInStatus() {
  const today = new Date().toISOString().slice(0, 10)
  const lastCheckin = await kvStorage.get(DAILY_CHECKIN_KEY)
  return { isCheckedIn: lastCheckin === today }
}
