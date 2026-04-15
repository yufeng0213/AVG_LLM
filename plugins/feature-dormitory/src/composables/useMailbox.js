/**
 * useMailbox.js - 信箱逻辑（发送、延迟回信、LLM 调用、pending 队列检查）
 */

import { ref, computed } from 'vue'
import { CHECKIN_ITEMS } from '../checkInItems.js'
import { callChatCompletion } from '../../../../src/llm/llmService.core.js'

const STORAGE_KEY_INBOX = 'avg_llm_dormitory_mailbox_v1'
const STORAGE_KEY_PENDING = 'avg_llm_dormitory_mail_pending_v1'
const CHECK_INTERVAL = 60_000 // 每 60 秒检查一次

// 邮票配置
const STAMP_CONFIG = {
  stamp_normal: {
    id: 'stamp_normal',
    label: '普通邮票',
    icon: '🌸',
    promptBonus: '',
    effect: null,
  },
  stamp_star: {
    id: 'stamp_star',
    label: '星光邮票',
    icon: '🌟',
    promptBonus: '请写得更热情一些，多分享一些生活细节和内心感受。',
    effect: null,
  },
  stamp_ribbon: {
    id: 'stamp_ribbon',
    label: '蝴蝶结邮票',
    icon: '🎀',
    promptBonus: '请在回信中表达对送信人的好感。',
    effect: { affectionDelta: 1 },
  },
  stamp_limited: {
    id: 'stamp_limited',
    label: '限定邮票',
    icon: '📮',
    promptBonus: '请写一封非常用心的长信，包含回忆和未来期待，字数可以多一些。',
    effect: { gift: true },
  },
}

export function useMailbox() {
  const inbox = ref([]) // 收件箱
  const stamps = ref({
    stamp_normal: 5,
    stamp_star: 0,
    stamp_ribbon: 0,
    stamp_limited: 0,
  })
  const selectedRecipient = ref('')
  const letterContent = ref('')
  const selectedStamp = ref('stamp_normal')
  const isSending = ref(false)
  const sendingStatus = ref('') // 'sending' | 'sent' | 'error'
  const viewingLetter = ref(null) // 当前查看的信件
  const activeTab = ref('inbox') // 'inbox' | 'write'
  let checkTimer = null

  // 未读数量
  const unreadCount = computed(() => {
    return inbox.value.filter(m => !m.read).length
  })

  // 可用邮票列表
  const availableStamps = computed(() => {
    return Object.entries(stamps.value)
      .filter(([_, count]) => count > 0)
      .map(([id, count]) => ({
        ...STAMP_CONFIG[id],
        quantity: count,
      }))
  })

  // ====== 存储 ======

  function loadInbox(worldBookId) {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY_INBOX) || '{}')
      const bookState = all[worldBookId]
      if (bookState) {
        inbox.value = bookState.inbox || []
        stamps.value = { ...stamps.value, ...(bookState.stamps || {}) }
      }
    } catch (e) {
      console.warn('[useMailbox] load inbox failed:', e)
    }
  }

  function saveInbox(worldBookId) {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY_INBOX) || '{}')
      all[worldBookId] = {
        inbox: inbox.value,
        stamps: stamps.value,
      }
      localStorage.setItem(STORAGE_KEY_INBOX, JSON.stringify(all))
    } catch (e) {
      console.warn('[useMailbox] save inbox failed:', e)
    }
  }

  function loadPending(worldBookId) {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY_PENDING) || '{}')
      return all[worldBookId] || []
    } catch (e) {
      console.warn('[useMailbox] load pending failed:', e)
      return []
    }
  }

  function savePending(worldBookId, pending) {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY_PENDING) || '{}')
      all[worldBookId] = pending
      localStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(all))
    } catch (e) {
      console.warn('[useMailbox] save pending failed:', e)
    }
  }

  // ====== 发送信件 ======

  function sendLetter(worldBookId, characterName) {
    const content = letterContent.value.trim()
    if (content.length < 100) {
      sendingStatus.value = 'error'
      return false
    }
    if (content.length > 1000) {
      sendingStatus.value = 'error'
      return false
    }

    const stampId = selectedStamp.value
    if (!stamps.value[stampId] || stamps.value[stampId] <= 0) {
      sendingStatus.value = 'error'
      return false
    }

    // 扣除邮票
    stamps.value[stampId]--

    // 延迟 3~10 分钟
    const delayMs = (Math.floor(Math.random() * 7) + 3) * 60 * 1000
    const replyAt = Date.now() + delayMs

    const mail = {
      id: 'mail_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      to: characterName,
      content,
      stamp: stampId,
      sentAt: Date.now(),
      replyAt,
    }

    // 保存到 pending
    const pending = loadPending(worldBookId)
    pending.push(mail)
    savePending(worldBookId, pending)

    // 保存到 outbox（inbox 中也有记录）
    inbox.value.unshift({
      id: mail.id,
      from: characterName,
      content: null, // 还没回信
      stamp: stampId,
      sentAt: mail.sentAt,
      receivedAt: null,
      originalLetter: content,
      read: false,
      replied: false,
      replyAt: mail.replyAt,
    })

    saveInbox(worldBookId)

    sendingStatus.value = 'sent'
    letterContent.value = ''
    selectedStamp.value = 'stamp_normal'

    return true
  }

  // ====== 查看信件 ======

  function viewLetter(letter) {
    viewingLetter.value = letter
    if (!letter.read) {
      letter.read = true
      // 持久化
    }
  }

  function closeLetter() {
    viewingLetter.value = null
  }

  // ====== 检查 pending 队列 ======

  async function checkPendingMails(worldBookId, characters) {
    const pending = loadPending(worldBookId)
    const now = Date.now()
    let changed = false

    for (const mail of pending) {
      if (mail.replied) continue
      if (mail.replyAt > now) continue

      // 需要生成回信
      try {
        const reply = await generateReply(mail, characters)
        // 更新 inbox
        const inboxItem = inbox.value.find(i => i.id === mail.id)
        if (inboxItem) {
          inboxItem.content = reply
          inboxItem.receivedAt = Date.now()
          inboxItem.replied = true
        }
        mail.replied = true
        changed = true

        // 蝴蝶结邮票效果：好感度 +1
        const stampCfg = STAMP_CONFIG[mail.stamp]
        if (stampCfg?.effect?.affectionDelta) {
          // 通知父组件处理好感度
          console.log('[Mailbox] Ribbon stamp effect: affection +1 for', mail.to)
        }
      } catch (e) {
        console.warn('[useMailbox] generate reply failed:', e)
      }
    }

    if (changed) {
      savePending(worldBookId, pending)
      saveInbox(worldBookId)
    }
  }

  // ====== LLM 回信生成 ======

  async function generateReply(mail, characters) {
    const character = characters?.find(c => c.label === mail.to || c.raw?.name === mail.to)
    const charName = mail.to
    const charPersona = character?.raw?.description || character?.raw?.persona || ''

    // 获取聊天记录（最近5条）
    const chatHistory = '' // TODO: 从 dormRuntime 获取

    const stampCfg = STAMP_CONFIG[mail.stamp] || STAMP_CONFIG.stamp_normal
    const stampBonus = stampCfg.promptBonus || ''

    const systemPrompt = `你是「${charName}」。你收到了一封来自用户的信，请以${charName}的身份回信。

${charPersona ? '角色设定：\n' + charPersona : ''}

${stampBonus ? '邮票特殊效果：\n' + stampBonus : ''}

要求：
1. 语气要自然、亲切，像朋友之间的书信
2. 回信长度 50~200 字
3. 只输出回信正文，不要加标题、解释或格式化标记
4. 不要使用列表、markdown 等格式
5. 用中文回复`

    const userPrompt = `你收到了这封信：
"""
${mail.content}
"""

请写一封回信。`

    const response = await callChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], {
      max_tokens: 500,
      temperature: 0.8,
    })

    return response.trim()
  }

  // ====== 启动定时检查 ======

  function startChecker(worldBookId, characters) {
    stopChecker()
    checkPendingMails(worldBookId, characters)
    checkTimer = setInterval(() => {
      checkPendingMails(worldBookId, characters)
    }, CHECK_INTERVAL)
  }

  function stopChecker() {
    if (checkTimer) {
      clearInterval(checkTimer)
      checkTimer = null
    }
  }

  // ====== 清理 ======

  function resetForm() {
    letterContent.value = ''
    selectedStamp.value = 'stamp_normal'
    sendingStatus.value = ''
  }

  return {
    inbox,
    stamps,
    selectedRecipient,
    letterContent,
    selectedStamp,
    isSending,
    sendingStatus,
    viewingLetter,
    activeTab,
    unreadCount,
    availableStamps,
    loadInbox,
    saveInbox,
    sendLetter,
    viewLetter,
    closeLetter,
    checkPendingMails,
    startChecker,
    stopChecker,
    resetForm,
    STAMP_CONFIG,
  }
}
