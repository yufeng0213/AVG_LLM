/**
 * useBatteryAwareness.js — 电量感知 + 关怀消息
 *
 * 使用 Web Battery API 读取真实设备电量，在关键时刻（低电量/充电/充满）
 * 触发角色关心消息，增强游戏与现实生活的联系。
 */
import { onMounted, onUnmounted } from 'vue'
import { getGroupedContacts } from './usePhoneData.js'

const STORAGE_PREFIX = 'avg_llm_battery_care_'
const THRESHOLDS = { low: 20, critical: 10 }

/**
 * 获取电量上下文
 * @returns {{ level: number, charging: boolean, status: string } | null}
 */
async function getBatteryContext() {
  if (!('getBattery' in navigator)) return null
  try {
    const battery = await navigator.getBattery()
    return {
      level: Math.round(battery.level * 100),
      charging: battery.charging,
      status: getBatteryStatus(battery.level, battery.charging),
    }
  } catch {
    return null
  }
}

function getBatteryStatus(level, charging) {
  if (charging && level >= 0.99) return 'full'
  if (charging) return 'charging'
  if (level <= THRESHOLDS.critical / 100) return 'critical'
  if (level <= THRESHOLDS.low / 100) return 'low'
  return 'normal'
}

/**
 * 判断某个阈值的关怀是否已经发过（当日去重）
 */
function hasCaredToday(thresholdKey) {
  const key = STORAGE_PREFIX + thresholdKey
  const lastTime = localStorage.getItem(key)
  if (!lastTime) return false
  const lastDate = new Date(parseInt(lastTime)).toDateString()
  return lastDate === new Date().toDateString()
}

function markCared(thresholdKey) {
  localStorage.setItem(STORAGE_PREFIX + thresholdKey, Date.now().toString())
}

export function useBatteryAwareness({ onNewMessage }) {
  let battery = null
  let cleanupFns = []

  async function tryTriggerCare() {
    if (!battery || !onNewMessage) return

    const level = Math.round(battery.level * 100)
    const charging = battery.charging

    // 充满
    if (level >= 100 && !hasCaredToday('full')) {
      markCared('full')
      await sendCareMessage('battery_full', charging)
      return
    }

    // 开始充电
    if (charging && !hasCaredToday('charging_start')) {
      markCared('charging_start')
      await sendCareMessage('charging_start', charging)
      return
    }

    // 停止充电（且电量未满）
    if (!charging && level < 100 && !hasCaredToday('charging_stop') && hasCaredToday('charging_start')) {
      markCared('charging_stop')
      await sendCareMessage('charging_stop', charging)
      return
    }

    // 低电量
    if (level <= THRESHOLDS.low && !hasCaredToday(`low_${THRESHOLDS.low}`)) {
      markCared(`low_${THRESHOLDS.low}`)
      await sendCareMessage('battery_low', charging)
      return
    }

    // 极低电量
    if (level <= THRESHOLDS.critical && !hasCaredToday(`critical_${THRESHOLDS.critical}`)) {
      markCared(`critical_${THRESHOLDS.critical}`)
      await sendCareMessage('battery_critical', charging)
      return
    }
  }

  async function sendCareMessage(eventType, charging) {
    const contacts = await getGroupedContacts()
    if (contacts.length === 0) return

    // 选一个关系好的角色来发消息
    const wb = contacts[Math.floor(Math.random() * contacts.length)]
    const chars = wb.characters || []
    if (chars.length === 0) return
    const contact = chars[Math.floor(Math.random() * chars.length)]

    const careText = getCareMessageText(eventType, contact.name)
    if (onNewMessage) {
      onNewMessage({ contact, text: careText })
    }
  }

  function getCareMessageText(eventType, charName) {
    // 这些是快捷消息，不需要 LLM。如果想更自然可以改用 LLM 生成
    const texts = {
      battery_full: [
        `${charName}: 充满电啦！今天也要元气满满哦 ☀️`,
      ],
      charging_start: [
        `充电中记得休息一下眼睛~`,
      ],
      charging_stop: [
        `电量告急还不充电，你是想让我担心吗？`,
      ],
      battery_low: [
        `${charName}: 电量只剩 ${THRESHOLDS.low}% 了，快去找充电器！别突然失联啊…`,
      ],
      battery_critical: [
        `${charName}: ⚡ 快没电了！赶紧充电！我不想联系不到你…`,
      ],
    }
    return texts[eventType]?.[0] || ''
  }

  function onBatteryChange() {
    tryTriggerCare()
  }

  onMounted(async () => {
    if (!('getBattery' in navigator)) {
      console.log('[BatteryAwareness] Battery API not supported')
      return
    }

    try {
      battery = await navigator.getBattery()

      // 初始检查
      tryTriggerCare()

      // 监听变化
      battery.addEventListener('chargingchange', onBatteryChange)
      battery.addEventListener('levelchange', onBatteryChange)
      cleanupFns = [
        () => battery.removeEventListener('chargingchange', onBatteryChange),
        () => battery.removeEventListener('levelchange', onBatteryChange),
      ]

      console.log('[BatteryAwareness] monitoring battery, level:', Math.round(battery.level * 100) + '%')
    } catch (e) {
      console.warn('[BatteryAwareness] failed to get battery:', e.message)
    }
  })

  onUnmounted(() => {
    for (const fn of cleanupFns) fn()
  })

  return { getBatteryContext }
}
