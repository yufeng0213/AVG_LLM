/**
 * useSpotCheckPush.js - 角色查岗语音推送
 *
 * 功能：
 * 1. 定时随机触发（间隔 40-90 分钟），随机选角色生成查岗语音
 * 2. 写入 SMS 线程作为 voice 消息
 * 3. 如果蓝牙已连接，自动播放到音箱
 * 4. 同时弹出系统通知
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { getGroupedContacts, getWorldBookById, loadSmsThreads, saveSmsThreads } from './usePhoneData.js'
import { generateCharacterSpeech } from '../../../../../src/llm/llmService.core.js'
import { resolvePrompt } from '../../../../../src/llm/promptRegistry.js'
import { kvStorage } from '../../../../../src/storage/index.js'

const SPOT_CHECK_MIN = 40 * 60 * 1000
const SPOT_CHECK_MAX = 90 * 60 * 1000
const SPOT_CHECK_VOICE_KEY = 'spot_check_voice_enabled'

export function useSpotCheckPush({ isBtConnected, onNewVoiceMessage }) {
  let timer = null
  let lastCheckTime = 0
  let isPushEnabled = ref(false)

  let cachedMinMin = 40
  let cachedMaxMin = 90
  let cachedWhitelist = []

  async function loadSettings() {
    try {
      const [enabled, min, max, whitelist] = await Promise.all([
        kvStorage.get('spot_check_voice_enabled'),
        kvStorage.get('spot_check_min_min'),
        kvStorage.get('spot_check_max_min'),
        kvStorage.get('spot_check_whitelist'),
      ])
      console.log('[SpotCheckPush] loadSettings raw:', { enabled, min, max, whitelist })
      if (enabled !== undefined && enabled !== null) isPushEnabled.value = !!enabled
      if (min) cachedMinMin = min
      if (max) cachedMaxMin = max
      if (Array.isArray(whitelist)) cachedWhitelist = whitelist
      console.log('[SpotCheckPush] loadSettings applied:', {
        isPushEnabled: isPushEnabled.value,
        cachedMinMin,
        cachedMaxMin,
        cachedWhitelist,
      })
    } catch (e) {
      console.warn('[SpotCheckPush] loadSettings failed:', e)
    }
  }

  function getRandomInterval() {
    const min = cachedMinMin * 60 * 1000
    const max = cachedMaxMin * 60 * 1000
    const interval = min + Math.random() * (max - min)
    console.log('[SpotCheckPush] getRandomInterval:', { cachedMinMin, cachedMaxMin, intervalMs: interval, intervalMin: Math.round(interval / 60000) })
    return interval
  }

  // 显示系统通知
  async function showNotification(contactName, body) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      const perm = await LocalNotifications.checkPermissions()
      if (perm.display === 'granted' || (await LocalNotifications.requestPermissions()).display === 'granted') {
        const notifId = Date.now() % 100000 + Math.floor(Math.random() * 90000)
        await LocalNotifications.schedule({
          notifications: [{
            title: `${contactName} 查岗`,
            body: body.slice(0, 200),
            id: notifId,
            schedule: { at: new Date(Date.now() + 1000), allowsWhileIdle: true },
            extra: { type: 'spot_check' },
            sound: null,
            attachments: null,
          }],
        })
        return
      }
    } catch (e) { /* fallback below */ }

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`${contactName} 查岗`, {
        body: body.slice(0, 100),
        icon: '/favicon.svg',
        tag: 'spot-check',
      })
    }
  }

  // 生成查岗文本（用 LLM 生成）
  async function generateSpotCheckText(contact) {
    const book = await getWorldBookById(contact.worldBookId)
    if (!book) return null

    const prompt = await resolvePrompt('phone_offline:spot_check_voice')
    if (!prompt) {
      // 无专用 prompt 时用简单模板
      return `${contact.name}突然想看看你在干嘛，想知道你现在在做什么。`
    }

    try {
      // 不依赖 generatePhoneSmsReply，直接用 LLM 生成短句
      const { callChatCompletion, getValidatedActiveConfig } = await import('../../../../../src/llm/llmService.core.js')
      const config = await getValidatedActiveConfig()
      if (!config.success) return null

      const result = await callChatCompletion({
        model: config.config.model,
        messages: [
          { role: 'system', content: `你是${contact.name}，${contact.identity || ''}。现在你要用短信语音"查岗"玩家。语气要自然、亲切，像突然发消息问对方在干嘛。控制在50字以内。` },
          { role: 'user', content: prompt },
        ],
        max_tokens: 100,
        temperature: 0.9,
      })
      return result?.choices?.[0]?.message?.content?.trim() || null
    } catch {
      return null
    }
  }

  // 生成查岗语音（MiniMax TTS）
  async function generateSpotCheckAudio(text, contact) {
    const voiceConfig = contact?.voiceConfig || {}
    const result = await generateCharacterSpeech({
      text,
      emotion: contact?.voiceEmotion || 'neutral',
      voiceConfig: voiceConfig.voiceId ? voiceConfig : null,
    })
    if (!result.success || !result.audioBytes) return null
    const blob = new Blob([result.audioBytes], { type: result.mimeType || 'audio/mp3' })
    return URL.createObjectURL(blob)
  }

  // 执行一次查岗推送
  async function doSpotCheck() {
    console.log('[SpotCheckPush] === doSpotCheck triggered ===')
    try {
      const contacts = await getGroupedContacts()
      if (contacts.length === 0) {
        console.log('[SpotCheckPush] no contacts, skipping')
        return
      }

      // 过滤白名单：只选允许查岗的角色
      const whitelist = cachedWhitelist
      const allChars = contacts.flatMap(c => c.characters || [])
      const eligible = whitelist.length > 0
        ? allChars.filter(ch => whitelist.includes(ch.id))
        : allChars
      console.log('[SpotCheckPush] filter:', { whitelistLen: whitelist.length, allCharsLen: allChars.length, eligibleLen: eligible.length, whitelist })
      if (eligible.length === 0) {
        console.log('[SpotCheckPush] no eligible characters, skipping')
        return
      }

      const contact = eligible[Math.floor(Math.random() * eligible.length)]
      console.log('[SpotCheckPush] selected contact:', contact.name, contact.id)

      // 生成查岗文本
      const text = await generateSpotCheckText(contact)
      if (!text || !text.trim()) {
        console.log('[SpotCheckPush] no text generated, skipping')
        return
      }
      const trimmed = text.trim()
      console.log('[SpotCheckPush] generated text:', trimmed.slice(0, 60))

      // 生成语音
      console.log('[SpotCheckPush] generating audio...')
      const audioUrl = await generateSpotCheckAudio(trimmed, contact)
      console.log('[SpotCheckPush] audio result:', audioUrl ? 'success' : 'failed')

      // 写入 SMS 线程（voice 消息）
      const threads = await loadSmsThreads()
      const voiceMsg = {
        id: `sms_voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: 'assistant',
        msgType: 'voice',
        voiceText: trimmed,
        voiceEmotion: contact?.voiceEmotion || 'neutral',
        ttsAudioUrl: audioUrl,
        timestamp: new Date().toISOString(),
      }
      const thread = threads[contact.id] || []
      thread.push(voiceMsg)
      threads[contact.id] = thread
      await saveSmsThreads(threads)
      console.log('[SpotCheckPush] saved to SMS thread:', contact.id)

      lastCheckTime = Date.now()

      // 回调通知 UI
      if (onNewVoiceMessage) {
        console.log('[SpotCheckPush] calling onNewVoiceMessage callback')
        onNewVoiceMessage({ contact, voiceMsg, audioUrl })
      }

      // 系统通知
      console.log('[SpotCheckPush] showing notification')
      showNotification(contact.name, trimmed.slice(0, 60))
    } catch (e) {
      console.warn('[SpotCheckPush] 查岗推送失败:', e)
    }
  }

  function startTimer() {
    stopTimer()
    const interval = getRandomInterval()
    console.log(`[SpotCheckPush] timer started, next check in ${Math.round(interval / 60000)} min`)
    timer = setTimeout(() => {
      console.log('[SpotCheckPush] timer fired!')
      doSpotCheck()
      startTimer()
    }, interval)
  }

  function stopTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function handleVisibilityChange() {
    if (!document.hidden && isPushEnabled.value) {
      const elapsed = Date.now() - lastCheckTime
      console.log('[SpotCheckPush] visibility change, elapsed:', Math.round(elapsed / 60000), 'min, enabled:', isPushEnabled.value)
      if (elapsed > cachedMinMin * 60 * 1000) {
        console.log('[SpotCheckPush] visibility triggered spot check')
        startTimer()
      }
    }
  }

  onMounted(async () => {
    console.log('[SpotCheckPush] onMounted')
    await loadSettings()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    lastCheckTime = Date.now()
    startTimer()
    // 暴露手动触发：控制台输入 window.__avgSpotCheck()
    if (typeof window !== 'undefined') {
      window.__avgSpotCheck = () => {
        console.log('[SpotCheckPush] manual trigger')
        doSpotCheck()
      }
    }
  })

  onUnmounted(() => {
    console.log('[SpotCheckPush] onUnmounted')
    stopTimer()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return {
    isPushEnabled,
    triggerSpotCheck: doSpotCheck,
  }
}
