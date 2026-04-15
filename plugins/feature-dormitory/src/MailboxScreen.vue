<script setup>
/**
 * MailboxScreen.vue - 信箱
 */

import { computed, onMounted, onUnmounted } from 'vue'
import { useMailbox } from './composables/useMailbox.js'
import { CHECKIN_ITEMS } from './checkInItems.js'

const emit = defineEmits(['back', 'mail-affection-change'])
const props = defineProps({
  coins: { type: Number, default: 0 },
  characters: { type: Array, default: () => [] }, // [{ id, label, raw, affection, stageLabel }]
  worldBookId: { type: String, default: 'default' },
})

const {
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
} = useMailbox()

// 当前选择的角色对象
const selectedCharacter = computed(() => {
  return props.characters.find(c => c.id === selectedRecipient.value) || null
})

const charCount = computed(() => letterContent.value.length)
const isContentValid = computed(() => charCount.value >= 100 && charCount.value <= 1000)

// 时间格式化
function timeAgo(timestamp) {
  if (!timestamp) return '等待回信中...'
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}

// 获取邮票图标
function getStampIcon(stampId) {
  const cfg = STAMP_CONFIG[stampId]
  return cfg ? cfg.icon : '🌸'
}

function getStampLabel(stampId) {
  const cfg = STAMP_CONFIG[stampId]
  return cfg ? cfg.label : ''
}

// ====== 操作 ======

function handleSend() {
  if (!isContentValid.value || !selectedRecipient.value) return
  const char = selectedCharacter.value
  if (!char) return

  isSending.value = true
  sendingStatus.value = 'sending'

  const success = sendLetter(props.worldBookId, char.label)
  isSending.value = false

  if (success) {
    setTimeout(() => {
      sendingStatus.value = ''
    }, 2000)
  } else {
    sendingStatus.value = 'error'
    setTimeout(() => {
      sendingStatus.value = ''
    }, 3000)
  }
}

function handleViewLetter(letter) {
  viewLetter(letter)
  // 标记已读并保存
  letter.read = true
  saveInbox(props.worldBookId)
}

function handleTabSwitch(tab) {
  activeTab.value = tab
  if (tab === 'write') {
    resetForm()
  }
}

function handleSelectStamp(stampId) {
  if (stamps.value[stampId] <= 0) return
  selectedStamp.value = stampId
}

// ====== 生命周期 ======

onMounted(() => {
  loadInbox(props.worldBookId)
  startChecker(props.worldBookId, props.characters)
})

onUnmounted(() => {
  stopChecker()
})
</script>

<template>
  <div class="mailbox-screen">
    <!-- Header -->
    <header class="mailbox-header">
      <button type="button" class="mailbox-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="mailbox-title">📮 信箱</h2>
      <div class="mailbox-coin-box">
        <span class="mailbox-coin-icon">💰</span>
        <span class="mailbox-coin-value">{{ coins }}</span>
      </div>
    </header>

    <!-- 信件详情弹窗 -->
    <div v-if="viewingLetter" class="letter-overlay" @click.self="closeLetter">
      <div class="letter-detail">
        <header class="letter-detail-header">
          <button type="button" class="letter-close-btn" @click="closeLetter">✕</button>
          <span class="letter-detail-from">{{ viewingLetter.from }} 的回信</span>
          <span class="letter-detail-time">{{ timeAgo(viewingLetter.receivedAt || viewingLetter.sentAt) }}</span>
        </header>
        <div class="letter-detail-content">
          <!-- 邮票标识 -->
          <div class="letter-stamp-badge">
            <span class="letter-stamp-icon">{{ getStampIcon(viewingLetter.stamp) }}</span>
            <span class="letter-stamp-label">{{ getStampLabel(viewingLetter.stamp) }}</span>
          </div>
          <!-- 回信内容 -->
          <div v-if="viewingLetter.content" class="letter-text">
            {{ viewingLetter.content }}
          </div>
          <div v-else class="letter-waiting">
            <p>🕊️ 对方正在回信中...</p>
            <p class="letter-waiting-sub">预计 {{ timeAgo(viewingLetter.replyAt) }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="mailbox-tabs">
      <button
        type="button"
        class="mailbox-tab"
        :class="{ 'tab-active': activeTab === 'inbox' }"
        @click="handleTabSwitch('inbox')"
      >
        📬 收件箱
        <span v-if="unreadCount > 0" class="unread-badge">{{ unreadCount }}</span>
      </button>
      <button
        type="button"
        class="mailbox-tab"
        :class="{ 'tab-active': activeTab === 'write' }"
        @click="handleTabSwitch('write')"
      >
        ✉️ 写信
      </button>
    </div>

    <!-- 收件箱 -->
    <div v-if="activeTab === 'inbox'" class="mailbox-inbox">
      <template v-if="inbox.length === 0">
        <div class="mailbox-empty">
          <p>📭 收件箱是空的</p>
          <p class="mailbox-empty-sub">去写一封信吧！</p>
        </div>
      </template>
      <template v-else>
        <div
          v-for="letter in inbox"
          :key="letter.id"
          class="inbox-item"
          :class="{ 'item-unread': !letter.read }"
          @click="handleViewLetter(letter)"
        >
          <div class="inbox-item-header">
            <span class="inbox-item-from">
              <span v-if="!letter.read" class="unread-dot">🔴</span>
              {{ letter.from }}
            </span>
            <span class="inbox-item-time">{{ timeAgo(letter.receivedAt || letter.sentAt) }}</span>
          </div>
          <div class="inbox-item-preview">
            <template v-if="letter.replied">
              {{ letter.content?.slice(0, 40) }}{{ letter.content?.length > 40 ? '...' : '' }}
            </template>
            <template v-else>
              <span class="waiting-text">🕊️ 等待回信中...</span>
            </template>
          </div>
          <div class="inbox-item-stamp">
            {{ getStampIcon(letter.stamp) }} {{ getStampLabel(letter.stamp) }}
          </div>
        </div>
      </template>
    </div>

    <!-- 写信 -->
    <div v-if="activeTab === 'write'" class="mailbox-write">
      <!-- 收信人选择 -->
      <div class="write-section">
        <label class="write-label">收信人</label>
        <select v-model="selectedRecipient" class="recipient-select">
          <option value="" disabled>请选择一个角色</option>
          <option v-for="char in characters" :key="char.id" :value="char.id">
            {{ char.label }}（好感 {{ char.affection ?? 50 }}）
          </option>
        </select>
      </div>

      <!-- 信件内容 -->
      <div class="write-section">
        <label class="write-label">信件内容</label>
        <textarea
          v-model="letterContent"
          class="letter-textarea"
          placeholder="写下你想对 TA 说的话...（至少 100 字）"
          maxlength="1000"
          rows="8"
        ></textarea>
        <div class="char-count" :class="{ 'count-valid': isContentValid }">
          {{ charCount }}/1000 {{ charCount < 100 ? '（还需 ' + (100 - charCount) + ' 字）' : '✓' }}
        </div>
      </div>

      <!-- 邮票选择 -->
      <div class="write-section">
        <label class="write-label">邮票（选择1张贴上）</label>
        <div class="stamp-grid">
          <div
            v-for="stamp in [
              { id: 'stamp_normal' },
              { id: 'stamp_star' },
              { id: 'stamp_ribbon' },
              { id: 'stamp_limited' },
            ]"
            :key="stamp.id"
            class="stamp-option"
            :class="{
              'stamp-selected': selectedStamp === stamp.id,
              'stamp-disabled': stamps[stamp.id] <= 0,
            }"
            @click="handleSelectStamp(stamp.id)"
          >
            <div class="stamp-icon">{{ STAMP_CONFIG[stamp.id].icon }}</div>
            <div class="stamp-name">{{ STAMP_CONFIG[stamp.id].label }}</div>
            <div class="stamp-count">×{{ stamps[stamp.id] || 0 }}</div>
          </div>
        </div>
      </div>

      <!-- 发送状态 -->
      <Transition name="status-fade">
        <div v-if="sendingStatus" class="sending-status" :class="`status-${sendingStatus}`">
          <template v-if="sendingStatus === 'sending'">📮 投递中...</template>
          <template v-else-if="sendingStatus === 'sent'">✅ 投递成功！等待回信中...</template>
          <template v-else>❌ 投递失败，请检查字数和邮票</template>
        </div>
      </Transition>

      <!-- 投递按钮 -->
      <button
        type="button"
        class="send-btn"
        :class="{
          'btn-disabled': !isContentValid || !selectedRecipient || !stamps[selectedStamp] || stamps[selectedStamp] <= 0,
        }"
        :disabled="isSending || !isContentValid || !selectedRecipient"
        @click="handleSend"
      >
        📮 投递信件
      </button>
    </div>
  </div>
</template>

<style scoped>
.mailbox-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, #1a0a2e 0%, #0f1a2e 50%, #0a1628 100%);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.mailbox-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 215, 0, 0.1);
  gap: 10px;
}

.mailbox-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  width: 40px;
  height: 40px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.mailbox-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

.mailbox-title {
  flex: 1;
  text-align: center;
  margin: 0;
  color: #ffd700;
  font-size: 17px;
  font-weight: 600;
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
}

.mailbox-coin-box {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 10px;
  padding: 6px 12px;
}
.mailbox-coin-value { color: #ffd700; font-size: 15px; font-weight: 700; min-width: 30px; text-align: right; }

/* Tabs */
.mailbox-tabs {
  display: flex;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.mailbox-tab {
  flex: 1;
  padding: 12px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.mailbox-tab.tab-active {
  color: #ffd700;
  background: rgba(255, 215, 0, 0.05);
}
.mailbox-tab.tab-active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: #ffd700;
}

.unread-badge {
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

/* Inbox */
.mailbox-inbox {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mailbox-empty {
  text-align: center;
  padding: 40px 20px;
  color: rgba(255, 255, 255, 0.4);
}
.mailbox-empty p { font-size: 16px; margin: 0; }
.mailbox-empty-sub { font-size: 13px; margin-top: 8px !important; }

.inbox-item {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.inbox-item:hover { background: rgba(255, 255, 255, 0.06); }
.inbox-item.item-unread {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.05);
}

.inbox-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.inbox-item-from {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 4px;
}

.unread-dot {
  font-size: 8px;
}

.inbox-item-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.inbox-item-preview {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.4;
}

.waiting-text {
  color: rgba(255, 215, 0, 0.5);
  font-style: italic;
}

.inbox-item-stamp {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 6px;
}

/* Write */
.mailbox-write {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.write-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.write-label {
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.6);
}

.recipient-select {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 10px 12px;
  color: #fff;
  font-size: 14px;
  width: 100%;
  cursor: pointer;
}
.recipient-select option { background: #1a1a2e; color: #fff; }

.letter-textarea {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 12px;
  color: #fff;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  width: 100%;
  font-family: inherit;
}
.letter-textarea::placeholder { color: rgba(255, 255, 255, 0.2); }
.letter-textarea:focus { border-color: rgba(255, 215, 0, 0.3); outline: none; }

.char-count {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  text-align: right;
}
.char-count.count-valid { color: #22c55e; }

/* Stamp Grid */
.stamp-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.stamp-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 10px 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.stamp-option:hover:not(.stamp-disabled) { background: rgba(255, 255, 255, 0.08); }
.stamp-option.stamp-selected {
  border-color: #ffd700;
  background: rgba(255, 215, 0, 0.1);
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.2);
}
.stamp-option.stamp-disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.stamp-icon {
  font-size: 24px;
}

.stamp-name {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}

.stamp-count {
  font-size: 9px;
  color: #ffd700;
  font-weight: 700;
}

/* Sending Status */
.sending-status {
  text-align: center;
  padding: 8px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
}
.status-sending { background: rgba(96, 165, 250, 0.1); color: #60a5fa; }
.status-sent { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
.status-error { background: rgba(239, 68, 68, 0.1); color: #ef4444; }

/* Send Button */
.send-btn {
  background: linear-gradient(135deg, #ffd700, #ff8c00);
  border: none;
  color: #1a0a2e;
  font-size: 16px;
  font-weight: 800;
  padding: 14px;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);
}
.send-btn:hover:not(.btn-disabled) { transform: scale(1.02); box-shadow: 0 6px 25px rgba(255, 215, 0, 0.5); }
.send-btn:active:not(.btn-disabled) { transform: scale(0.95); }
.send-btn.btn-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Letter Overlay */
.letter-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
}

.letter-detail {
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  border: 2px solid rgba(255, 215, 0, 0.2);
  border-radius: 16px;
  max-width: 400px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
}

.letter-detail-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  position: relative;
}

.letter-close-btn {
  position: absolute;
  top: 8px;
  right: 12px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
}
.letter-close-btn:hover { color: #fff; }

.letter-detail-from {
  font-size: 15px;
  font-weight: 700;
  color: #ffd700;
}

.letter-detail-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.letter-detail-content {
  padding: 16px;
}

.letter-stamp-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 215, 0, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.1);
  border-radius: 8px;
  padding: 4px 10px;
  margin-bottom: 16px;
  width: fit-content;
}

.letter-stamp-icon { font-size: 16px; }
.letter-stamp-label { font-size: 11px; color: rgba(255, 215, 0, 0.6); }

.letter-text {
  font-size: 14px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.8);
  white-space: pre-wrap;
}

.letter-waiting {
  text-align: center;
  padding: 20px;
}
.letter-waiting p { margin: 0; font-size: 15px; color: rgba(255, 215, 0, 0.6); }
.letter-waiting-sub { font-size: 12px !important; color: rgba(255, 255, 255, 0.3) !important; margin-top: 8px !important; }

/* Transitions */
.status-fade-enter-active,
.status-fade-leave-active {
  transition: all 0.3s ease;
}
.status-fade-enter-from,
.status-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

  .platform-android.android-portrait .mailbox-back-btn {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: none !important;
    font-size: 1.1rem !important;
    padding: 6px 10px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
  }


 
    .platform-android.android-portrait .mailbox-tabs {
    flex: 0 0 auto !important;  /* 不伸缩，按内容宽度显示 */
    min-width: auto !important;
    max-width: none !important;
    width: auto !important;
    box-sizing: border-box !important;
    padding: 16px !important;
  }
</style>
