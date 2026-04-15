<script setup>
/**
 * PhoneSmsApp.vue - 短信应用
 * 联系人列表（按世界书分区）+ 对话线程 + LLM 回复。
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import {
  getGroupedContacts,
  getWorldBookById,
  loadSmsThreads,
  saveSmsThreads,
  getSmsThread,
  addSmsMessage,
  formatSmsTime,
} from './composables/usePhoneData.js'
import { generatePhoneSmsReply } from '../../../../src/llm/index.js'

const emit = defineEmits(['back'])

const contacts = ref([])
const smsThreads = ref({})
const selectedContact = ref(null)
const smsDraft = ref('')
const smsLoading = ref(false)
const messagesRef = ref(null)

onMounted(async () => {
  const [groups, threads] = await Promise.all([
    getGroupedContacts(),
    loadSmsThreads(),
  ])
  contacts.value = groups
  smsThreads.value = threads
})

const threadMessages = computed(() => {
  if (!selectedContact.value) return []
  const messages = getSmsThread(smsThreads.value, selectedContact.value.id)
  // 将消息列表转换为包含时间戳分隔符的混合列表
  const items = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (i > 0) {
      const prev = messages[i - 1]
      const diff = new Date(msg.timestamp) - new Date(prev.timestamp)
      if (diff > 5 * 60 * 1000) {
        items.push({ type: 'time', text: formatSmsTime(msg.timestamp) })
      }
    }
    items.push({ ...msg, type: 'message' })
  }
  return items
})

function selectContact(contact) {
  selectedContact.value = contact
  smsDraft.value = ''
  nextTick(() => scrollToBottom())
}

function goBack() {
  if (selectedContact.value) {
    selectedContact.value = null
    smsDraft.value = ''
  } else {
    emit('back')
  }
}

function scrollToBottom() {
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

async function handleSendSms() {
  const text = smsDraft.value.trim()
  if (!text || !selectedContact.value || smsLoading.value) return

  const contact = selectedContact.value
  smsDraft.value = ''
  addSmsMessage(smsThreads.value, contact.id, 'user', text)
  await saveSmsThreads(smsThreads.value)
  nextTick(() => scrollToBottom())

  smsLoading.value = true
  try {
    const book = await getWorldBookById(contact.worldBookId)
    const contactForLlm = {
      id: contact.id,
      name: contact.name,
      identity: contact.identity || contact.nickname || '',
    }

    const history = getSmsThread(smsThreads.value, contact.id)
      .slice(-10)
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        text: m.text,
      }))

    const result = await generatePhoneSmsReply({
      worldBook: book || { id: contact.worldBookId, title: contact.worldBookTitle, characters: [] },
      contact: contactForLlm,
      userMessage: text,
      history: history.filter(m => m.role !== 'user').slice(-4),
      options: { historyLimit: 8, maxTokens: 300 },
    })

    if (result.success && result.replies && result.replies.length > 0) {
      for (const reply of result.replies) {
        if (reply && reply.trim()) {
          addSmsMessage(smsThreads.value, contact.id, 'assistant', reply.trim())
        }
      }
      await saveSmsThreads(smsThreads.value)
      nextTick(() => scrollToBottom())
    }
  } catch (e) {
    console.warn('[PhoneSmsApp] 发送短信失败:', e)
  } finally {
    smsLoading.value = false
  }
}

function getLastMessage(contactId) {
  const thread = smsThreads.value[contactId]
  if (!thread || thread.length === 0) return null
  return thread[thread.length - 1]
}

function formatContactName(contact) {
  if (contact.identity) return `${contact.name} · ${contact.identity}`
  return contact.name
}
</script>

<template>
  <div class="sms-app">
    <!-- 联系人列表 -->
    <template v-if="!selectedContact">
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="emit('back')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          返回
        </button>
        <h2 class="phone-app-title">短信</h2>
        <div class="phone-app-header-spacer" />
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
              <div class="contact-last-msg">
                {{ getLastMessage(char.id)?.text || '暂无消息，点击开始对话' }}
              </div>
            </div>
            <div class="contact-time" :class="{ unread: getLastMessage(char.id)?.role === 'assistant' }">
              {{ getLastMessage(char.id) ? formatSmsTime(getLastMessage(char.id).timestamp) : '' }}
            </div>
          </div>
        </template>
        <div v-if="contacts.length === 0" class="phone-loading">
          暂无联系人，请先在世界书中创建角色
        </div>
      </div>
    </template>

    <!-- 对话线程 -->
    <template v-else>
      <div class="phone-app-header">
        <button type="button" class="phone-app-back-btn" @click="goBack">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          {{ selectedContact.name }}
        </button>
        <div class="phone-app-title" />
        <div class="phone-app-header-spacer" />
      </div>
      <div class="sms-thread">
        <div ref="messagesRef" class="sms-messages">
          <div v-if="threadMessages.filter(m => m.type === 'message').length === 0" class="phone-loading">
            发送消息开始与 {{ selectedContact.name }} 对话
          </div>
          <template v-for="(item, idx) in threadMessages" :key="item.id || 'time-' + idx">
            <div v-if="item.type === 'time'" class="sms-time">{{ item.text }}</div>
            <div
              v-else
              class="sms-bubble"
              :class="item.role"
            >
              {{ item.text }}
            </div>
          </template>
          <div v-if="smsLoading" class="phone-loading">
            <div class="loading-spinner" />对方正在输入...
          </div>
        </div>
        <div class="sms-input-bar">
          <textarea
            v-model="smsDraft"
            class="sms-input"
            placeholder="输入消息..."
            rows="1"
            maxlength="500"
            :disabled="smsLoading"
            @keydown.enter.exact.prevent="handleSendSms"
          />
          <button
            type="button"
            class="sms-send-btn"
            :disabled="!smsDraft.trim() || smsLoading"
            @click="handleSendSms"
          >
            <span class="sms-send-icon">&#x27A4;</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
