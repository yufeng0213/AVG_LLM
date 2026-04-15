<script setup>
/**
 * PhoneCallsApp.vue - 电话应用
 * 联系人列表 + 通话模拟 + 通话记录。
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import {
  getGroupedContacts,
  getWorldBookById,
  loadCallLogs,
  saveCallLogs,
  addCallLog,
  formatCallDuration,
} from './composables/usePhoneData.js'
import { generatePhoneCallReply } from '../../../../src/llm/index.js'
import { useGlobalUser } from '../composables/useGlobalUser.js'

const emit = defineEmits(['back'])

const contacts = ref([])
const callLogs = ref([])
const selectedContact = ref(null)
const callDraft = ref('')
const callLoading = ref(false)
const callTimer = ref(0)
const callTranscript = ref([])
const showCallLogs = ref(false)
let timerInterval = null

const globalUser = useGlobalUser()

onMounted(async () => {
  const [groups, logs] = await Promise.all([
    getGroupedContacts(),
    loadCallLogs(),
  ])
  contacts.value = groups
  callLogs.value = logs
})

function selectContact(contact) {
  selectedContact.value = contact
  callDraft.value = ''
  callTranscript.value = []
  callTimer.value = 0
  showCallLogs.value = false
}

function goBack() {
  if (selectedContact.value) {
    if (timerInterval) clearInterval(timerInterval)
    selectedContact.value = null
    callDraft.value = ''
    callTranscript.value = []
    callTimer.value = 0
  } else {
    showCallLogs.value = false
    emit('back')
  }
}

function startCallTimer() {
  if (timerInterval) clearInterval(timerInterval)
  callTimer.value = 0
  timerInterval = setInterval(() => {
    callTimer.value++
  }, 1000)
}

async function handleSendCallMsg() {
  const text = callDraft.value.trim()
  if (!text || !selectedContact.value || callLoading.value) return

  if (callTimer.value === 0) startCallTimer()

  callDraft.value = ''
  callTranscript.value.push({ role: 'user', text })
  callLoading.value = true

  try {
    const contact = selectedContact.value
    const book = await getWorldBookById(contact.worldBookId)
    const history = callTranscript.value.slice(-12).map(m => ({
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
      effectiveUser: { name: globalUser.username.value || '玩家', description: '' },
      history: history.filter(m => m.role !== 'user').slice(-6),
      options: { historyLimit: 10, maxTokens: 400 },
    })

    if (result.success && result.replies && result.replies.length > 0) {
      for (const reply of result.replies) {
        callTranscript.value.push({ role: 'assistant', text: reply })
      }
      nextTick(() => scrollToBottom())
    }
  } catch (e) {
    console.warn('[PhoneCallsApp] 通话失败:', e)
  } finally {
    callLoading.value = false
  }
}

function handleHangup() {
  if (timerInterval) clearInterval(timerInterval)
  const contact = selectedContact.value
  if (contact) {
    callLogs.value = addCallLog(callLogs.value, {
      contactId: contact.id,
      contactName: contact.name,
      type: 'outgoing',
      duration: callTimer.value,
      transcript: [...callTranscript.value],
    })
    saveCallLogs(callLogs.value)
  }
  selectedContact.value = null
  callDraft.value = ''
  callTranscript.value = []
  callTimer.value = 0
}

function scrollToBottom() {
  const el = document.querySelector('.call-transcript')
  if (el) el.scrollTop = el.scrollHeight
}

function formatLogTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="calls-app">
    <!-- 联系人列表 -->
    <template v-if="!selectedContact && !showCallLogs">
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="emit('back')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="phone-app-title">电话</h2>
        <button type="button" class="phone-app-back-btn" @click="showCallLogs = true">记录</button>
      </div>
      <div class="contact-list">
        <template v-for="group in contacts" :key="group.worldBookId">
          <div class="contact-section-header">《{{ group.worldBookTitle }}》</div>
          <div
            v-for="char in group.characters"
            :key="char.id"
            class="contact-item"
            @click="selectContact(char)"
          >
            <div class="contact-avatar">
              <img v-if="char.portraits?.[0]" :src="char.portraits[0]" :alt="char.name" />
              <span v-else class="contact-avatar-placeholder">&#x1F464;</span>
            </div>
            <div class="contact-info">
              <div class="contact-name">{{ char.name }}</div>
              <div class="contact-last-msg">{{ char.identity || '点击拨打电话' }}</div>
            </div>
          </div>
        </template>
        <div v-if="contacts.length === 0" class="phone-loading">
          暂无联系人，请先在世界书中创建角色
        </div>
      </div>
    </template>

    <!-- 通话记录列表 -->
    <template v-else-if="showCallLogs">
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="showCallLogs = false">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="phone-app-title">通话记录</h2>
        <div class="phone-app-header-spacer" />
      </div>
      <div class="call-log">
        <div v-if="callLogs.length === 0" class="phone-loading">暂无通话记录</div>
        <div v-for="log in callLogs" :key="log.id" class="call-log-item">
          <span class="call-log-type" :class="log.type">
            {{ log.type === 'incoming' ? '&#x1F4DE;' : log.type === 'missed' ? '&#x1F4F5;' : '&#x1F4DE;' }}
          </span>
          <div class="call-log-info">
            <div class="call-log-name">{{ log.contactName }}</div>
            <div class="call-log-detail">{{ formatCallDuration(log.duration) }}</div>
          </div>
          <span class="call-log-time">{{ formatLogTime(log.timestamp) }}</span>
        </div>
      </div>
    </template>

    <!-- 通话中 -->
    <template v-else>
      <div class="phone-app-header">
        <div class="phone-app-header-spacer" />
        <h2 class="phone-app-title" style="color:#34c759">通话中 {{ formatCallDuration(callTimer) }}</h2>
        <div class="phone-app-header-spacer" />
      </div>
      <div class="call-view">
        <div class="call-avatar-large">
          <img v-if="selectedContact?.portraits?.[0]" :src="selectedContact.portraits[0]" :alt="selectedContact.name" />
          <span v-else class="contact-avatar-placeholder">&#x1F464;</span>
        </div>
        <div class="call-contact-name">{{ selectedContact?.name }}</div>
        <div class="call-contact-info">{{ selectedContact?.identity || '' }}</div>

        <div class="call-transcript">
          <div v-for="(msg, idx) in callTranscript" :key="idx" class="call-msg" :class="msg.role">
            {{ msg.text }}
          </div>
          <div v-if="callLoading" class="phone-loading" style="padding:8px 0">
            <div class="loading-spinner" />对方正在说话...
          </div>
        </div>

        <!-- 底部操作区 -->
        <div class="call-bottom-bar">
          <!-- 挂断按钮 -->
          <button type="button" class="call-hangup-btn" @click="handleHangup">
            <svg class="hangup-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.99c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.2v-3.43c0-.54-.45-.99-.99-.99z"/></svg>
          </button>

          <div class="call-input-row">
            <input
              v-model="callDraft"
              class="call-input"
              placeholder="输入你说的话..."
              maxlength="300"
              :disabled="callLoading"
              @keydown.enter="handleSendCallMsg"
            />
            <button
              type="button"
              class="sms-send-btn"
              :disabled="!callDraft.trim() || callLoading"
              @click="handleSendCallMsg"
            >
              <span class="call-send-icon">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <rect x="3" y="10" width="2" height="4" rx="1" fill="#fff"/>
                  <rect x="7" y="6" width="2" height="12" rx="1" fill="#fff"/>
                  <rect x="11" y="3" width="2" height="18" rx="1" fill="#fff"/>
                  <rect x="15" y="6" width="2" height="12" rx="1" fill="#fff"/>
                  <rect x="19" y="10" width="2" height="4" rx="1" fill="#fff"/>
                </svg>
              </span>
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
