<script setup>
/**
 * SmsVoiceCall.vue — 语音通话界面（LLM 驱动）
 * 全屏覆盖，角色立绘为背景，支持文字输入与 LLM 回复、逐句显示、通话记录保存。
 */
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  getWorldBookById,
  loadCallLogs,
  saveCallLogs,
  addCallLog,
  formatCallDuration,
} from '../../composables/usePhoneData.js'
import { generatePhoneCallReply } from '../../../../../../src/llm/index.js'
import { usePlayerState } from '../../../../../../src/stores/playerState.store.js'
import { kvStorage } from '../../../../../../src/storage/index.js'

const props = defineProps({
  contact: { type: Object, required: true },
  standeeUrl: { type: String, default: null },
  incomingCall: { type: Boolean, default: false },
})

const emit = defineEmits(['hangup'])

const playerState = usePlayerState()

const duration = ref(0)
const transcript = ref([])
const draft = ref('')
const loading = ref(false)
const isMuted = ref(false)
const isSpeakerOn = ref(false)
let timerInterval = null

const CALL_OPENING_KEY_PREFIX = 'avg_llm_call_opening_'

onMounted(async () => {
  // 来电开场白：从 kvStorage 读取
  if (props.incomingCall) {
    try {
      const data = await kvStorage.get(`${CALL_OPENING_KEY_PREFIX}${props.contact.id}`)
      if (data?.replies?.length) {
        for (const reply of data.replies) {
          transcript.value.push({ role: 'assistant', text: reply })
        }
        await kvStorage.remove(`${CALL_OPENING_KEY_PREFIX}${props.contact.id}`)
      }
    } catch (e) {
      console.warn('[SmsVoiceCall] 读取来电开场白失败:', e)
    }
    nextTick(scrollToBottom)
  }
})

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval)
})

function startTimer() {
  if (timerInterval) return
  duration.value = 0
  timerInterval = setInterval(() => { duration.value++ }, 1000)
}

function scrollToBottom() {
  const el = document.querySelector('.call-transcript')
  if (el) el.scrollTop = el.scrollHeight
}

async function handleSend() {
  const text = draft.value.trim()
  if (!text || loading.value) return

  startTimer()

  transcript.value.push({ role: 'user', text })
  draft.value = ''
  loading.value = true

  try {
    const contact = props.contact
    const book = await getWorldBookById(contact.worldBookId)
    const history = transcript.value.slice(-14).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      text: m.text,
    }))

    const result = await generatePhoneCallReply({
      worldBook: book || { id: contact.worldBookId, title: contact.worldBookTitle, characters: [] },
      contact: {
        id: contact.id,
        name: contact.name,
        identity: contact.identity || contact.nickname || '',
      },
      userMessage: text,
      effectiveUser: { name: playerState.username || '玩家', description: '' },
      history: history.filter(m => m.role !== 'user').slice(-6),
      options: { historyLimit: 10, maxTokens: 400 },
    })

    if (result.success && result.replies?.length) {
      for (const reply of result.replies) {
        transcript.value.push({ role: 'assistant', text: reply })
      }
      nextTick(scrollToBottom)
    }
  } catch (e) {
    console.warn('[SmsVoiceCall] 通话 LLM 失败:', e)
  } finally {
    loading.value = false
  }
}

async function handleHangup() {
  if (timerInterval) clearInterval(timerInterval)
  const contact = props.contact
  if (contact) {
    try {
      const logs = await loadCallLogs()
      addCallLog(logs, {
        contactId: contact.id,
        contactName: contact.name,
        type: 'outgoing',
        duration: duration.value,
        transcript: [...transcript.value],
      })
      await saveCallLogs(logs)
    } catch (e) {
      console.warn('[SmsVoiceCall] 保存通话记录失败:', e)
    }
  }
  emit('hangup')
}

function toggleMute() { isMuted.value = !isMuted.value }
function toggleSpeaker() { isSpeakerOn.value = !isSpeakerOn.value }
</script>

<template>
  <div class="voice-call-overlay" @click.self="handleHangup">
    <!-- 立绘背景 -->
    <div v-if="standeeUrl" class="voice-call-bg" :style="{ backgroundImage: 'url(' + standeeUrl + ')' }" />
    <div v-else class="voice-call-bg-default" />

    <!-- 渐变遮罩 -->
    <div class="voice-call-shade" />

    <!-- 顶部：角色名 + 计时 -->
    <div class="voice-call-top">
      <div class="voice-call-name">{{ contact.name }}</div>
      <div class="voice-call-status">通话中 {{ formatCallDuration(duration) }}</div>
    </div>

    <!-- 对话流区域 -->
    <div class="call-transcript">
      <div v-for="(msg, idx) in transcript" :key="idx" class="call-msg" :class="msg.role">
        <span class="call-msg-sender">{{ msg.role === 'user' ? '我' : contact.name }}</span>
        <span class="call-msg-text">{{ msg.text }}</span>
      </div>
      <div v-if="loading" class="call-loading">
        <div class="loading-spinner" />对方正在说话...
      </div>
    </div>

    <!-- 底部操作区 -->
    <div class="voice-call-bottom">
      <button type="button" class="voice-call-action-btn" :class="{ active: isMuted }" @click="toggleMute" title="静音">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
          <line v-if="isMuted" x1="1" y1="1" x2="23" y2="23" stroke-width="2.5" stroke="white"/>
        </svg>
        <span>静音</span>
      </button>

      <button type="button" class="voice-call-action-btn" :class="{ active: isSpeakerOn }" @click="toggleSpeaker" title="扬声器">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path v-if="isSpeakerOn" d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          <path v-if="isSpeakerOn" d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
        <span>扬声器</span>
      </button>

      <button type="button" class="voice-call-hangup-btn" @click="handleHangup" title="挂断">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
          <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.99c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.2v-3.43c0-.54-.45-.99-.99-.99z"/>
        </svg>
        <span>挂断</span>
      </button>
    </div>

    <!-- 底部输入栏 -->
    <div class="voice-call-input-bar">
      <input
        v-model="draft"
        class="voice-call-input"
        placeholder="输入你说的话..."
        maxlength="300"
        :disabled="loading"
        @keydown.enter="handleSend"
      />
      <button
        type="button"
        class="voice-call-send-btn"
        :disabled="!draft.trim() || loading"
        @click="handleSend"
      >
        <svg viewBox="0 0 24 24" width="20" height="20">
          <rect x="3" y="10" width="2" height="4" rx="1" fill="#fff"/>
          <rect x="7" y="6" width="2" height="12" rx="1" fill="#fff"/>
          <rect x="11" y="3" width="2" height="18" rx="1" fill="#fff"/>
          <rect x="15" y="6" width="2" height="12" rx="1" fill="#fff"/>
          <rect x="19" y="10" width="2" height="4" rx="1" fill="#fff"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.voice-call-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: space-between;
  overflow: hidden;
  background: #000;
}

/* 立绘背景 */
.voice-call-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-color: #0a0a1a;
  filter: brightness(0.85);
  z-index: 0;
}

.voice-call-bg-default {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  z-index: 0;
}

/* 渐变遮罩 */
.voice-call-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.4) 0%,
    rgba(0, 0, 0, 0.1) 30%,
    rgba(0, 0, 0, 0.1) 60%,
    rgba(0, 0, 0, 0.5) 100%
  );
  z-index: 1;
}

/* 顶部 */
.voice-call-top {
  position: relative;
  z-index: 2;
  padding-top: max(40px, var(--safe-area-inset-top, 40px));
  padding-bottom: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.voice-call-name {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
  letter-spacing: 1px;
}

.voice-call-status {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
}

/* 对话流 */
.call-transcript {
  position: relative;
  z-index: 2;
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.call-msg {
  max-width: 85%;
  padding: 8px 14px;
  border-radius: 16px;
  font-size: 0.88rem;
  line-height: 1.5;
  word-break: break-word;
}

.call-msg.user {
  align-self: flex-end;
  background: rgba(52, 199, 89, 0.25);
  color: #fff;
  border: 1px solid rgba(52, 199, 89, 0.3);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom-right-radius: 4px;
}

.call-msg.assistant {
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom-left-radius: 4px;
}

.call-msg-sender {
  font-size: 0.72rem;
  font-weight: 600;
  opacity: 0.7;
  display: block;
  margin-bottom: 2px;
}

.call-msg-text {
  white-space: pre-wrap;
}

.call-loading {
  align-self: flex-start;
  padding: 8px 14px;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  gap: 8px;
}

.loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: rgba(255, 255, 255, 0.7);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 底部按钮 */
.voice-call-bottom {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
  padding: 8px 0 4px;
  flex-shrink: 0;
}

.voice-call-action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  cursor: pointer;
  transition: all 0.2s ease;
}

.voice-call-action-btn:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(1.08);
}

.voice-call-action-btn:active {
  transform: scale(0.92);
}

.voice-call-action-btn.active {
  background: rgba(255, 255, 255, 0.35);
  border-color: rgba(255, 255, 255, 0.5);
}

.voice-call-action-btn span {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 500;
}

.voice-call-hangup-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff4444, #cc0000);
  border: none;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 20px rgba(255, 68, 68, 0.4);
}

.voice-call-hangup-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 28px rgba(255, 68, 68, 0.5);
}

.voice-call-hangup-btn:active {
  transform: scale(0.92);
}

.voice-call-hangup-btn span {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 500;
}

/* 输入栏 */
.voice-call-input-bar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px max(16px, var(--safe-area-inset-bottom, 16px));
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  flex-shrink: 0;
}

.voice-call-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  padding: 8px 16px;
  color: #fff;
  font-size: 0.88rem;
  outline: none;
}

.voice-call-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.voice-call-input:focus {
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.15);
}

.voice-call-input:disabled {
  opacity: 0.5;
}

.voice-call-send-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: linear-gradient(135deg, #34c759, #28a745);
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  box-shadow: 0 2px 10px rgba(52, 199, 89, 0.3);
}

.voice-call-send-btn:hover {
  transform: scale(1.08);
}

.voice-call-send-btn:active {
  transform: scale(0.92);
}

.voice-call-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

/* Android 适配 */
.platform-android.android-portrait .voice-call-bg {
  filter: brightness(0.85) !important;
}

.platform-android.android-portrait .voice-call-name {
  color: #fff !important;
}

.platform-android.android-portrait .voice-call-status {
  color: rgba(255, 255, 255, 0.8) !important;
}

.platform-android.android-portrait .voice-call-action-btn,
.platform-android.android-portrait .voice-call-hangup-btn {
  width: 64px !important;
  height: 64px !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  flex: none !important;
  font-size: 1rem !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 50% !important;
  white-space: nowrap !important;
}

.platform-android.android-portrait .voice-call-action-btn svg,
.platform-android.android-portrait .voice-call-hangup-btn svg {
  width: 22px !important;
  height: 22px !important;
}

.platform-android.android-portrait .voice-call-action-btn span,
.platform-android.android-portrait .voice-call-hangup-btn span {
  position: absolute !important;
  bottom: -20px !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  font-size: 0.6rem !important;
  color: rgba(255, 255, 255, 0.6) !important;
  white-space: nowrap !important;
}

.platform-android.android-portrait .voice-call-bottom {
  gap: 20px !important;
  position: relative !important;
  padding-bottom: 8px !important;
  padding-top: 8px !important;
}

.platform-android.android-portrait .voice-call-action-btn {
  position: relative !important;
}

.platform-android.android-portrait .voice-call-hangup-btn {
  position: relative !important;
}

.platform-android.android-portrait .voice-call-action-btn.active {
  background: #fff !important;
}

.platform-android.android-portrait .voice-call-action-btn.active svg {
  stroke: #333 !important;
}

/* 输入栏 & 发送按钮 */
.platform-android.android-portrait .voice-call-input-bar {
  padding-left: 12px !important;
  padding-right: 12px !important;
}

.platform-android.android-portrait .voice-call-input {
  font-size: 0.9rem !important;
  padding: 8px 14px !important;
}

.platform-android.android-portrait .voice-call-send-btn {
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  flex: none !important;
  padding: 8px 12px !important;
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 18px !important;
  white-space: nowrap !important;
  box-shadow: none !important;
}

.platform-android.android-portrait .voice-call-send-btn svg {
  width: 18px !important;
  height: 18px !important;
}
</style>
