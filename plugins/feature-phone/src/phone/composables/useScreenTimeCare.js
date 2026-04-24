/**
 * useScreenTimeCare.js — 屏幕时间关怀
 *
 * 追踪玩家当天的累计使用时长，在达到阈值时触发角色关心消息，
 * 提醒休息眼睛、注意休息等。
 */
import { onMounted, onUnmounted } from 'vue'
import { getGroupedContacts } from './usePhoneData.js'

const STORAGE_PREFIX = 'avg_llm_screen_time_'
const CARE_SENT_PREFIX = 'avg_llm_screen_care_'
const THRESHOLDS = [
  { minutes: 30, key: '30min' },
  { minutes: 60, key: '60min' },
  { minutes: 120, key: '120min' },
]

function getTodayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getAccumulatedTime() {
  const key = STORAGE_PREFIX + getTodayKey()
  return parseInt(localStorage.getItem(key) || '0')
}

function addAccumulatedTime(ms) {
  const key = STORAGE_PREFIX + getTodayKey()
  const current = parseInt(localStorage.getItem(key) || '0')
  localStorage.setItem(key, (current + ms).toString())
  return current + ms
}

function hasCaredForThreshold(thresholdKey) {
  const key = CARE_SENT_PREFIX + getTodayKey() + '_' + thresholdKey
  return localStorage.getItem(key) === '1'
}

function markCaredForThreshold(thresholdKey) {
  const key = CARE_SENT_PREFIX + getTodayKey() + '_' + thresholdKey
  localStorage.setItem(key, '1')
}

function getCareMessage(minutes, charName) {
  if (minutes <= 35) {
    return `${charName}: 已经玩了半小时手机啦，休息下眼睛吧~ 👀`
  }
  if (minutes <= 65) {
    return `${charName}: 看手机快一小时了，该起来活动活动了！别一直坐着 🏃`
  }
  return `${charName}: 你已经盯着屏幕两小时了…再这样下去眼睛要抗议了！快去休息！😤`
}

export function useScreenTimeCare({ onNewMessage }) {
  let sessionStart = null
  let visibilityHandler = null
  let resetInterval = null

  async function checkAndSendCare(totalMs) {
    const totalMin = Math.floor(totalMs / 60000)

    for (const t of THRESHOLDS) {
      if (totalMin >= t.minutes && !hasCaredForThreshold(t.key)) {
        markCaredForThreshold(t.key)

        const contacts = await getGroupedContacts()
        if (contacts.length === 0) return

        const wb = contacts[Math.floor(Math.random() * contacts.length)]
        const chars = wb.characters || []
        if (chars.length === 0) return
        const contact = chars[Math.floor(Math.random() * chars.length)]

        const text = getCareMessage(t.minutes, contact.name)
        if (onNewMessage) {
          onNewMessage({ contact, text })
        }
        break // 每次只触发一个阈值
      }
    }
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      // 切后台：记录这段使用时长
      if (sessionStart) {
        const sessionMs = Date.now() - sessionStart
        const total = addAccumulatedTime(sessionMs)
        sessionStart = null
        checkAndSendCare(total)
      }
    } else {
      // 回到前台：开始新 session
      sessionStart = Date.now()
    }
  }

  // 每天零点重置累计（简单方案：每分钟检查一次日期变化）
  function startResetTimer() {
    resetInterval = setInterval(() => {
      // 不主动清，让 getTodayKey 自然跨天就行
      // 但清理旧数据避免无限增长
      cleanOldData()
    }, 60 * 60 * 1000) // 每小时清理一次旧数据
  }

  function cleanOldData() {
    const today = getTodayKey()
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(STORAGE_PREFIX) && !key.includes(today)) {
        keysToRemove.push(key)
      }
      if (key?.startsWith(CARE_SENT_PREFIX) && !key.includes(today)) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key)
    }
  }

  onMounted(() => {
    sessionStart = Date.now()
    visibilityHandler = handleVisibilityChange
    document.addEventListener('visibilitychange', visibilityHandler)
    startResetTimer()
  })

  onUnmounted(() => {
    // 离开时记录最后一段时长
    if (sessionStart) {
      addAccumulatedTime(Date.now() - sessionStart)
    }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler)
    }
    if (resetInterval) {
      clearInterval(resetInterval)
    }
  })
}
