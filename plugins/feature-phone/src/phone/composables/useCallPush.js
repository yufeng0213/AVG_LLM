/**
 * useCallPush.js - 角色主动来电推送
 * 随机间隔(30-60分钟)选择角色，生成来电开场白，调度系统通知
 * 用户点击通知后进入通话界面
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { getGroupedContacts, getWorldBookById, loadCallLogs, saveCallLogs, addCallLog } from './usePhoneData.js'
import { generatePhoneCallReply } from '../../../../../src/llm/index.js'
import { resolvePrompt } from '../../../../../src/llm/promptRegistry.js'
import { kvStorage } from '../../../../../src/storage/index.js'

const CALL_PUSH_MIN = 30 * 60 * 1000
const CALL_PUSH_MAX = 60 * 60 * 1000
const CALL_OPENING_KEY_PREFIX = 'avg_llm_call_opening_'

export function useCallPush({ onNewCall, onNotificationClick }) {
  let timer = null
  let lastCallTime = 0
  let isPushEnabled = ref(false)
  let notificationPermission = ref('default')

  function getRandomInterval() {
    return CALL_PUSH_MIN + Math.random() * (CALL_PUSH_MAX - CALL_PUSH_MIN)
  }

  // 检查权限（Android 13+）
  async function checkPermission() {
    if (!('Notification' in window)) {
      notificationPermission.value = 'unsupported'
      return false
    }
    notificationPermission.value = Notification.permission
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false
    const result = await Notification.requestPermission()
    notificationPermission.value = result
    return result === 'granted'
  }

  // 生成来电开场白
  async function generateCallOpening(contact) {
    const book = await getWorldBookById(contact.worldBookId)
    if (!book) return null

    const spontaneousPrompt = await resolvePrompt('phone_offline:spontaneous_call')

    const result = await generatePhoneCallReply({
      worldBook: book,
      contact: {
        id: contact.id,
        name: contact.name,
        identity: contact.identity || contact.nickname || '',
      },
      userMessage: spontaneousPrompt,
      options: { historyLimit: 0, maxTokens: 150, temperature: 0.9 },
    })

    if (result.success && result.replies && result.replies.length > 0) {
      return result.replies
    }
    return null
  }

  // 显示系统通知
  async function showNotification(title, body, contactId, contactName, appId = 'calls') {
    // 尝试 Capacitor 本地通知（原生 Android/iOS）
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const perm = await LocalNotifications.checkPermissions()
      if (perm.display === 'granted' || (await LocalNotifications.requestPermissions()).display === 'granted') {
        const notifId = Date.now() % 100000 + Math.floor(Math.random() * 90000)
        await LocalNotifications.schedule({
          notifications: [{
            title,
            body: body.slice(0, 200),
            id: notifId,
            schedule: { at: new Date(Date.now() + 3000), allowsWhileIdle: true },
            extra: { contactId, contactName, type: 'spontaneous_call', appId },
            actionTypeId: '',
            sound: null,
            attachments: null,
          }],
        })
        return
      }
    } catch (e) {
      // 非原生环境，回退到 Web Notification
    }

    // Web Notification 回退
    if ('Notification' in window && Notification.permission === 'granted') {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'show-notification',
          title,
          body,
          contactId,
          appId,
          targetUrl: window.location.href,
        })
        return
      }
      try {
        new Notification(title, {
          body,
          icon: '/favicon.svg',
          tag: `call-${contactId}`,
          renotify: true,
        })
      } catch (e) {
        console.warn('[CallPush] 通知发送失败:', e)
      }
    }
  }

  // 执行一次来电推送
  async function doCallPush() {
    try {
      const contacts = await getGroupedContacts()
      if (contacts.length === 0) return

      const wb = contacts[Math.floor(Math.random() * contacts.length)]
      const chars = wb.characters || []
      if (chars.length === 0) return
      const contact = chars[Math.floor(Math.random() * chars.length)]

      const replies = await generateCallOpening(contact)
      if (!replies || replies.length === 0) return

      const openingText = replies[0]
      if (!openingText || !openingText.trim()) return

      // 保存开场白到 kvStorage，供 PhoneCallsApp 读取
      await kvStorage.set(`${CALL_OPENING_KEY_PREFIX}${contact.id}`, {
        text: openingText.trim(),
        replies,
        timestamp: new Date().toISOString(),
      })

      // 写入通话记录（incoming）
      const logs = await loadCallLogs()
      addCallLog(logs, {
        contactId: contact.id,
        contactName: contact.name,
        type: 'incoming',
        duration: 0,
        transcript: [{ role: 'assistant', text: openingText.trim() }],
      })
      await saveCallLogs(logs)

      lastCallTime = Date.now()

      // 回调通知 UI（手机内弹窗）
      if (onNewCall) {
        onNewCall({ contact, text: openingText.trim() })
      }

      // 系统通知
      showNotification(
        `📞 ${contact.name} 来电`,
        openingText.trim().slice(0, 60),
        contact.id,
        contact.name,
        'sms',
      )
    } catch (e) {
      console.warn('[CallPush] 来电推送失败:', e)
    }
  }

  function startTimer() {
    stopTimer()
    const interval = getRandomInterval()
    timer = setTimeout(() => {
      doCallPush()
      startTimer()
    }, interval)
    console.log(`[CallPush] 下次来电将在 ${Math.round(interval / 60000)} 分钟后`)
  }

  function stopTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  // 处理 visibilitychange
  function handleVisibilityChange() {
    if (!document.hidden && isPushEnabled.value) {
      const elapsed = Date.now() - lastCallTime
      if (elapsed > CALL_PUSH_MIN) {
        startTimer()
      }
    }
  }

  onMounted(async () => {
    await checkPermission()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    isPushEnabled.value = true
    lastCallTime = Date.now()
    startTimer()
  })

  onUnmounted(() => {
    stopTimer()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return {
    isPushEnabled,
    notificationPermission,
    triggerCall: doCallPush,
  }
}
