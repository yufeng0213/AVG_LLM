/**
 * useMailbox.js - 信箱逻辑（发送、延迟回信、LLM 调用、pending 队列检查）
 */

import { ref, computed } from 'vue'
import { callChatCompletion, getActiveApiConfig } from '../../../../src/llm/llmService.core.js'
import { resolvePrompt } from '../../../../src/llm/promptRegistry.js'

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
  const inboxVersion = ref(0) // 版本号，用于触发 globalInbox 重新计算
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

  // ====== 收藏 & 删除 ======

  function toggleFavorite(letter, bookId) {
    if (!letter || !bookId) return
    const allInbox = JSON.parse(localStorage.getItem(STORAGE_KEY_INBOX) || '{}')
    const bookState = allInbox[bookId]
    if (!bookState?.inbox) return

    const target = bookState.inbox.find(i => i.id === letter.id)
    if (!target) return

    target.favorite = !target.favorite
    // 同步更新 reactive inbox ref
    const inboxItem = inbox.value.find(i => i.id === letter.id)
    if (inboxItem) inboxItem.favorite = target.favorite

    // 同步更新当前查看的信件（立即刷新 UI）
    if (viewingLetter.value?.id === letter.id) {
      viewingLetter.value.favorite = target.favorite
    }

    localStorage.setItem(STORAGE_KEY_INBOX, JSON.stringify(allInbox))
    inboxVersion.value++
    console.log('[Mailbox] toggleFavorite:', target.favorite ? '★' : '☆', letter.id)
  }

  function deleteLetter(letter, bookId) {
    if (!letter || !bookId) return
    const allInbox = JSON.parse(localStorage.getItem(STORAGE_KEY_INBOX) || '{}')
    const bookState = allInbox[bookId]
    if (!bookState?.inbox) return

    bookState.inbox = bookState.inbox.filter(i => i.id !== letter.id)
    // 同步更新 reactive inbox ref
    const idx = inbox.value.findIndex(i => i.id === letter.id)
    if (idx !== -1) inbox.value.splice(idx, 1)

    localStorage.setItem(STORAGE_KEY_INBOX, JSON.stringify(allInbox))
    inboxVersion.value++

    if (viewingLetter.value?.id === letter.id) {
      viewingLetter.value = null
    }
    console.log('[Mailbox] deleteLetter:', letter.id)
  }

  // ====== 检查 pending 队列 ======

  async function checkPendingMails(worldBookId, characters) {
    const pending = loadPending(worldBookId)
    console.log(`[Mailbox][checkPending] worldBookId=${worldBookId}, pending count:`, pending.length)
    const now = Date.now()
    let changed = false

    // 直接从 localStorage 读取该书对应的收件箱
    const allInbox = JSON.parse(localStorage.getItem(STORAGE_KEY_INBOX) || '{}')
    const bookInbox = allInbox[worldBookId]?.inbox

    for (const mail of pending) {
      console.log(`[Mailbox][checkPending] mail ${mail.id}: replied=${mail.replied}, replyAt=${mail.replyAt}, now=${now}, overdue=${mail.replyAt <= now}`)
      if (mail.replied) continue
      if (mail.replyAt > now) continue

      console.log(`[Mailbox][checkPending] Generating reply for mail ${mail.id} to ${mail.to}`)
      // 需要生成回信
      try {
        const reply = await generateReply(mail, characters)
        if (!reply) {
          console.warn('[Mailbox][checkPending] generateReply returned null/empty for', mail.id)
          continue
        }
        console.log(`[Mailbox][checkPending] Reply generated successfully for ${mail.id}`)

        // 1. 更新 localStorage 中该书对应的收件箱
        if (bookInbox) {
          const lsItem = bookInbox.find(i => i.id === mail.id)
          if (lsItem) {
            lsItem.content = reply
            lsItem.receivedAt = Date.now()
            lsItem.replied = true
            console.log('[Mailbox][checkPending] Updated localStorage inbox for', mail.id)
          } else {
            console.warn('[Mailbox][checkPending] localStorage inbox item not found for', mail.id)
          }
        }

        // 2. 更新 reactive inbox ref（如果有对应 item）
        const inboxItem = inbox.value.find(i => i.id === mail.id)
        if (inboxItem) {
          inboxItem.content = reply
          inboxItem.receivedAt = Date.now()
          inboxItem.replied = true
          console.log('[Mailbox][checkPending] Updated reactive inbox for', mail.id)
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
        console.error('[Mailbox][checkPending] generate reply failed:', e)
      }
    }

    if (changed) {
      // 直接保存更新后的 localStorage
      allInbox[worldBookId] = {
        inbox: bookInbox || [],
        stamps: allInbox[worldBookId]?.stamps || {},
      }
      localStorage.setItem(STORAGE_KEY_INBOX, JSON.stringify(allInbox))
      savePending(worldBookId, pending)
      // 触发版本号，通知 globalInbox 重新计算
      inboxVersion.value++
      console.log('[Mailbox][checkPending] Saved changes, inboxVersion:', inboxVersion.value)
    }
  }

  // ====== 检查所有世界书的 pending 队列（GlobalMailbox 专用） ======

  async function checkAllPendingMails(characters) {
    try {
      console.log('[Mailbox][checkAll] Scanning all worldBooks for pending mails')
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY_PENDING) || '{}')
      const bookIds = Object.keys(all)
      console.log('[Mailbox][checkAll] Found worldBooks:', bookIds)
      if (bookIds.length === 0) return

      for (const bookId of bookIds) {
        await checkPendingMails(bookId, characters)
      }
    } catch (e) {
      console.error('[Mailbox][checkAll] failed:', e)
    }
  }

  // ====== LLM 回信生成 ======

  async function generateReply(mail, characters) {
    console.log('[Mailbox][generateReply] start, mail:', mail.id, 'to:', mail.to)

    // 获取 API 配置
    const config = await getActiveApiConfig()
    if (!config) {
      console.warn('[Mailbox][generateReply] No active API config, skipping reply generation')
      return null
    }

    const character = characters?.find(c => c.label === mail.to || c.raw?.name === mail.to)
    const charName = mail.to
    const charPersona = character?.raw?.description || character?.raw?.persona || ''

    // 获取聊天记录（最近5条）
    const chatHistory = '' // TODO: 从 dormRuntime 获取

    const stampCfg = STAMP_CONFIG[mail.stamp] || STAMP_CONFIG.stamp_normal
    const stampBonus = stampCfg.promptBonus || ''

    const basePrompt = (await resolvePrompt('mail:reply')).replace(/\{\{charName\}\}/g, charName)
    const systemPrompt = `${basePrompt}

${charPersona ? '角色设定：\n' + charPersona : ''}

${stampBonus ? '邮票特殊效果：\n' + stampBonus : ''}`

    const userPrompt = `你收到了这封信：
"""
${mail.content}
"""

请写一封回信。`

    console.log('[Mailbox][generateReply] Calling LLM, model:', config.model, 'max_tokens: 500')

    const result = await callChatCompletion({
      config,
      systemPrompt,
      userPrompt,
      temperature: 0.8,
      maxTokens: 500,
    })

    console.log('[Mailbox][generateReply] LLM result:', result)

    if (!result.success) {
      console.error('[Mailbox][generateReply] LLM reply generation failed:', result.error)
      return null
    }

    const reply = result.data?.trim() || ''
    console.log('[Mailbox][generateReply] Reply content length:', reply.length)
    return reply
  }

  // ====== 启动定时检查 ======

  function startChecker(worldBookId, characters) {
    stopChecker()
    checkPendingMails(worldBookId, characters)
    checkTimer = setInterval(() => {
      checkPendingMails(worldBookId, characters)
    }, CHECK_INTERVAL)
  }

  // 启动检查所有世界书（GlobalMailbox 专用）
  function startCheckerAll(characters) {
    stopChecker()
    console.log('[Mailbox][startCheckerAll] Starting, character count:', characters?.length)
    checkAllPendingMails(characters)
    checkTimer = setInterval(() => {
      console.log('[Mailbox][startCheckerAll] Interval tick')
      checkAllPendingMails(characters)
    }, CHECK_INTERVAL)
    console.log('[Mailbox][startCheckerAll] Timer set, interval:', CHECK_INTERVAL, 'ms')
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
    inboxVersion,
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
    toggleFavorite,
    deleteLetter,
    checkPendingMails,
    checkAllPendingMails,
    startChecker,
    startCheckerAll,
    stopChecker,
    resetForm,
    STAMP_CONFIG,
  }
}
