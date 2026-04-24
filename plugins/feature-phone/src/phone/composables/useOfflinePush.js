/**
 * useOfflinePush.js - 角色主动消息推送
 *
 * 功能：
 * 1. App 运行时，定时随机选角色发消息（模拟"角色主动联系你"）
 * 2. App 切后台时，触发系统通知
 * 3. 回到前台时，补发错过的消息
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { getGroupedContacts, getWorldBookById, loadSmsThreads, saveSmsThreads, addSmsMessage } from './usePhoneData.js'
import { generatePhoneSmsReply } from '../../../../../src/llm/index.js'
import { resolvePrompt } from '../../../../../src/llm/promptRegistry.js'

// 推送间隔范围（毫秒）：测试用 1 分钟
const MIN_INTERVAL = 5 * 60 * 1000
const MAX_INTERVAL = 20 * 60 * 1000

/**
 * 获取当前电量上下文（用于注入 prompt）
 */
async function getBatteryPromptContext() {
  if (!('getBattery' in navigator)) return ''
  try {
    const battery = await navigator.getBattery()
    const level = Math.round(battery.level * 100)
    const charging = battery.charging
    if (level <= 10) {
      return `\n\n【设备状态】⚡ 手机电量仅剩 ${level}%，${charging ? '充电中' : '未充电'}。请在消息中自然地表达担心玩家手机没电、催促充电的关心。`
    }
    if (level <= 20) {
      return `\n\n【设备状态】手机电量 ${level}%，${charging ? '充电中' : '未充电'}。如果合适，可以自然地提一句电量。`
    }
    if (charging && level < 100) {
      return `\n\n【设备状态】手机正在充电中，当前 ${level}%。`
    }
    return ''
  } catch {
    return ''
  }
}

export function useOfflinePush({ onNewMessage, onNotificationClick }) {
  let timer = null
  let lastPushTime = 0
  let missedMessages = []
  let isPushEnabled = ref(false)
  let notificationPermission = ref('default')

  // 随机间隔时间
  function getRandomInterval() {
    return MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL)
  }

  // 检查通知权限
  async function checkNotificationPermission() {
    if (!('Notification' in window)) {
      notificationPermission.value = 'unsupported'
      return false
    }
    notificationPermission.value = Notification.permission
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false
    // 请求权限
    const result = await Notification.requestPermission()
    notificationPermission.value = result
    return result === 'granted'
  }

  // 注册 Service Worker
  async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        return reg
      } catch (e) {
        console.warn('[OfflinePush] Service Worker 注册失败:', e)
      }
    }
    return null
  }

  // 显示系统通知（Android 系统栏）
  async function showNotification(title, body, contactId, appId = 'sms') {
    if (!('Notification' in window)) return
    if (Notification.permission !== 'granted') return

    // 尝试通过 Service Worker 发送（后台也能工作）
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: appId === 'calls' ? 'navigate-to-calls' : 'show-notification',
        title,
        body,
        contactId,
        appId,
        targetUrl: window.location.href,
      })
      return
    }

    // 回退：直接发（前台有效）
    try {
      new Notification(title, {
        body,
        icon: '/favicon.svg',
        tag: `sms-${contactId || 'general'}`,
        renotify: true,
      })
    } catch (e) {
      console.warn('[OfflinePush] 通知发送失败:', e)
    }
  }

  // 生成一条主动消息
  async function generateSpontaneousMessage(contact) {
    const book = await getWorldBookById(contact.worldBookId)
    if (!book) return null

    const contactForLlm = {
      id: contact.id,
      name: contact.name,
      identity: contact.identity || contact.nickname || '',
    }

    const spontaneousPrompt = await resolvePrompt('phone_offline:spontaneous')
    const batteryContext = await getBatteryPromptContext()

    const result = await generatePhoneSmsReply({
      worldBook: book,
      contact: contactForLlm,
      userMessage: batteryContext + spontaneousPrompt,
      history: [], // 主动发起，不带历史
      options: { historyLimit: 0, maxTokens: 200 },
    })

    if (result.success && result.replies && result.replies.length > 0) {
      return result.replies[0]
    }
    return null
  }

  // 执行一次推送
  async function doPush() {
    try {
      const contacts = await getGroupedContacts()
      if (contacts.length === 0) return

      // 随机选一个世界书，再随机选一个角色
      const wb = contacts[Math.floor(Math.random() * contacts.length)]
      const chars = wb.characters || []
      if (chars.length === 0) return
      const contact = chars[Math.floor(Math.random() * chars.length)]

      const text = await generateSpontaneousMessage(contact)
      if (!text || !text.trim()) return

      // 写入短信线程
      const threads = await loadSmsThreads()
      addSmsMessage(threads, contact.id, 'assistant', text.trim())
      await saveSmsThreads(threads)

      lastPushTime = Date.now()

      // 通知回调（更新 UI 未读数等）
      if (onNewMessage) {
        onNewMessage({ contact, text: text.trim() })
      }

      // 显示系统通知
      showNotification(
        `来自 ${contact.name} 的短信`,
        text.trim().slice(0, 50),
        contact.id,
        'sms',
      )
    } catch (e) {
      console.warn('[OfflinePush] 推送失败:', e)
    }
  }

  // 启动定时器
  function startTimer() {
    stopTimer()
    const interval = getRandomInterval()
    timer = setTimeout(() => {
      doPush()
      startTimer() // 递归，下次随机间隔
    }, interval)
    console.log(`[OfflinePush] 下次推送将在 ${Math.round(interval / 60000)} 分钟后`)
  }

  // 停止定时器
  function stopTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  // 处理 visibilitychange
  async function handleVisibilityChange() {
    if (document.hidden) {
      // App 切后台：不停止定时器，让推送继续在后台运行
      // Service Worker + Notification API 可以在后台弹出系统通知
    } else {
      // App 回到前台：补发错过的消息
      const now = Date.now()
      const elapsed = now - lastPushTime
      if (elapsed > MIN_INTERVAL && isPushEnabled.value) {
        // 计算错过的次数
        let missedCount = 0
        let nextTime = lastPushTime + getRandomInterval()
        while (nextTime < now) {
          missedCount++
          nextTime += getRandomInterval()
        }
        // 最多补发 3 条，避免信息轰炸
        const toSend = Math.min(missedCount, 3)
        for (let i = 0; i < toSend; i++) {
          await doPush()
        }
        if (toSend > 0) {
          console.log(`[OfflinePush] 补发了 ${toSend} 条错过的消息`)
        }
      }
      // 重新启动定时器
      if (isPushEnabled.value) startTimer()
    }
  }

  // 处理 Service Worker 的 postMessage（通知点击）
  function handleSWMessage(event) {
    if (event.data?.type === 'navigate-to-sms') {
      if (onNotificationClick) {
        onNotificationClick(event.data.contactId)
      }
    }
    if (event.data?.type === 'navigate-to-calls') {
      if (onNotificationClick) {
        onNotificationClick({ appId: 'calls', contactId: event.data.contactId })
      }
    }
  }

  onMounted(async () => {
    // 注册 Service Worker
    await registerServiceWorker()

    // 检查通知权限
    await checkNotificationPermission()

    // 监听 visibilitychange
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // 监听 Service Worker 消息
    navigator.serviceWorker?.addEventListener?.('message', handleSWMessage)

    // 启动推送
    isPushEnabled.value = true
    lastPushTime = Date.now()
    startTimer()
  })

  onUnmounted(() => {
    stopTimer()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    navigator.serviceWorker?.removeEventListener?.('message', handleSWMessage)
  })

  return {
    isPushEnabled,
    notificationPermission,
    triggerPush: doPush, // 手动触发一次（调试用）
  }
}
