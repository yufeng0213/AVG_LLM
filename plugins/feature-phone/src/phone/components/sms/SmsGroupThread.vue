<script setup>
/**
 * SmsGroupThread.vue — 群聊线程视图（浅色主题）
 */
import { ref } from 'vue'

const props = defineProps({
  group: { type: Object, required: true },
  threadMessages: { type: Array, required: true },
  draft: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  showMentionDropdown: { type: Boolean, default: false },
  mentionableMembers: { type: Array, default: () => [] },
  groupSenderAvatar: { type: Function, default: () => null },
  memberCount: { type: Number, default: 0 },
})

const emit = defineEmits(['back', 'update:draft', 'send', 'input', 'insert-mention', 'open-info'])

function renderMentionText(text) {
  if (!text) return ''
  const parts = []
  const regex = /(@[^\s@]+)/g
  const segments = text.split(regex)
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (regex.test(seg)) {
      parts.push({ type: 'mention', text: seg })
    } else if (seg) {
      parts.push({ type: 'text', text: seg })
    }
    regex.lastIndex = 0
  }
  return parts
}

function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    if (props.showMentionDropdown) {
      e.preventDefault()
      if (props.mentionableMembers.length > 0) {
        emit('insert-mention', props.mentionableMembers[0])
      }
      return
    }
    e.preventDefault()
    emit('send')
  }
  if (e.key === 'Tab' && props.showMentionDropdown) {
    e.preventDefault()
    if (props.mentionableMembers.length > 0) {
      emit('insert-mention', props.mentionableMembers[0])
    }
  }
}

const groupMessagesRef = ref(null)
defineExpose({ groupMessagesRef })
</script>

<template>
  <div class="sms-thread">
    <div class="phone-app-header">
      <button type="button" class="phone-app-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        {{ group.name }}
      </button>
      <div class="phone-app-title" />
      <button type="button" class="group-info-btn" @click="emit('open-info')">
        &#8505;
      </button>
    </div>

    <div class="sms-thread">
      <div ref="groupMessagesRef" class="sms-messages">
        <div v-if="!threadMessages || threadMessages.filter(m => m.type === 'message').length === 0" class="phone-loading">
          发送消息开始群聊 &#183; {{ memberCount }} 位成员
        </div>
        <template v-for="(item, idx) in threadMessages" :key="item.id || 'time-g-' + idx">
          <div v-if="item.type === 'time'" class="sms-time">{{ item.text }}</div>
          <template v-else>
            <div class="sms-msg-row" :class="item.role">
              <div class="sms-msg-avatar">
                <img v-if="item.role === 'assistant' && groupSenderAvatar(item.senderId)" :src="groupSenderAvatar(item.senderId)" />
                <span v-else-if="item.role === 'assistant'" class="sms-msg-avatar-default" :title="item.senderName">{{ item.senderName?.charAt(0) }}</span>
                <span v-else class="sms-msg-avatar-default">&#x1F9D1;</span>
              </div>
              <div class="sms-msg-content">
                <span v-if="item.role === 'assistant'" class="group-sender-name">{{ item.senderName }}</span>
                <div class="sms-bubble" :class="item.role">
                  <template v-for="part in renderMentionText(item.text)" :key="part.text">
                    <span v-if="part.type === 'mention'" class="mention-highlight">{{ part.text }}</span>
                    <span v-else>{{ part.text }}</span>
                  </template>
                </div>
              </div>
            </div>
          </template>
        </template>
        <div v-if="loading" class="phone-loading">
          <div class="loading-spinner" />群友正在输入...
        </div>
      </div>
      <div class="sms-input-bar">
        <div class="sms-input-wrapper">
          <textarea
            :value="draft"
            @input="$emit('update:draft', $event.target.value); $emit('input', $event)"
            class="sms-input"
            placeholder="输入消息，@ 可提及角色..."
            rows="1"
            maxlength="500"
            :disabled="loading"
            @keydown="handleKeyDown"
          />
        </div>
        <button
          type="button"
          class="sms-send-btn"
          :disabled="!draft.trim() || loading"
          @click="emit('send')"
          title="发送"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
        <div v-if="showMentionDropdown" class="mention-dropdown">
          <template v-for="m in mentionableMembers" :key="m.contactId">
            <div class="mention-item" @click="emit('insert-mention', m)">{{ m.contactName }}</div>
          </template>
          <div v-if="mentionableMembers.length === 0" class="mention-empty">
            没有匹配的角色
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sms-thread {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: transparent;
}

.sms-messages {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 4px 8px 8px;
}

.sms-msg-row {
  display: flex;
  align-items: flex-end;
  width: 100%;
  gap: 6px;
}

.sms-msg-row.assistant {
  flex-direction: row;
}

.sms-msg-row.user {
  flex-direction: row-reverse;
}

.sms-msg-avatar {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  margin: 0 2px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e0f7fa, #b2ebf2);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.sms-msg-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sms-msg-avatar-default {
  font-size: 1.3rem;
  line-height: 1;
  opacity: 0.6;
}

.sms-msg-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.group-sender-name {
  display: inline-block;
  font-size: 0.72rem;
  color: #fb6f92;
  font-weight: 600;
  margin-bottom: 3px;
}

.mention-highlight {
  color: #fb6f92;
  font-weight: 700;
}

/* Header */
.phone-app-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  padding-top: max(8px, var(--safe-area-inset-top, 8px));
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
}

.phone-app-back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: #333;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 12px;
  transition: background 0.15s;
}

.phone-app-back-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.phone-app-title {
  flex: 1;
}

.group-info-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  color: #888;
  transition: background 0.15s;
}

.group-info-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

/* 时间戳 */
.sms-time {
  align-self: center;
  text-align: center;
  font-size: 0.65rem;
  font-weight: 500;
  color: #bbb;
  background: rgba(0, 0, 0, 0.04);
  padding: 3px 14px;
  border-radius: 10px;
  margin: 8px auto;
}

/* 气泡 */
.sms-bubble {
  max-width: 75%;
  word-wrap: break-word;
  padding: 10px 14px;
  font-size: 0.88rem;
  line-height: 1.55;
  border-radius: 18px;
}

.sms-bubble.assistant {
  background: #fff;
  color: #333;
  border-radius: 18px 18px 18px 6px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.sms-bubble.user {
  background: linear-gradient(135deg, #ffeef5, #fce4ec);
  color: #4a2040;
  border-radius: 18px 18px 6px 18px;
  box-shadow: 0 1px 4px rgba(252, 182, 159, 0.2);
}

/* 加载 */
.phone-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  font-size: 0.82rem;
  color: #bbb;
}

.loading-spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2.5px solid rgba(0, 0, 0, 0.08);
  border-top-color: #ff8fab;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 输入栏 */
.sms-input-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  padding-bottom: max(8px, var(--safe-area-inset-bottom, 8px));
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 0.5px solid rgba(0, 0, 0, 0.06);
  position: relative;
}

.sms-input-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.sms-input {
  width: 100%;
  background: #f0f0f0;
  border: 1px solid transparent;
  border-radius: 20px;
  padding: 8px 14px;
  color: #333;
  font-size: 0.88rem;
  outline: none;
  resize: none;
  max-height: 100px;
  line-height: 1.4;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.sms-input:focus {
  border-color: #ff8fab;
  background: #fff;
}

.sms-input:disabled {
  opacity: 0.5;
}

.sms-send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  border-radius: 50%;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.sms-send-btn:not(:disabled) {
  background: linear-gradient(135deg, #ff8fab, #fb6f92);
  color: #fff;
}

.sms-send-btn:not(:disabled):hover {
  transform: scale(1.08);
  box-shadow: 0 2px 12px rgba(255, 143, 171, 0.4);
}

.sms-send-btn:active:not(:disabled) {
  transform: scale(0.92);
}

.sms-send-btn:disabled {
  color: #ccc;
  cursor: not-allowed;
}

/* @ 提及下拉 */
.mention-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border: 0.5px solid rgba(0, 0, 0, 0.08);
  border-radius: 14px;
  max-height: 160px;
  overflow-y: auto;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
  z-index: 30;
}

.mention-item {
  padding: 8px 14px;
  cursor: pointer;
  font-size: 0.85rem;
  color: #333;
  transition: background 0.1s;
}

.mention-item:hover {
  background: rgba(255, 143, 171, 0.1);
}

.mention-item:first-child {
  border-radius: 10px 10px 0 0;
}

.mention-item:last-child {
  border-radius: 0 0 10px 10px;
}

.mention-empty {
  padding: 10px 14px;
  font-size: 0.82rem;
  color: #bbb;
  text-align: center;
}

/* Android */
.platform-android.android-portrait .sms-input {
  background: #f5f5f5 !important;
  color: #333 !important;
}

.platform-android.android-portrait .sms-send-btn:not(:disabled) {
  background: linear-gradient(135deg, #ff8fab, #fb6f92) !important;
}

.platform-android.android-portrait .sms-msg-avatar {
  background: #f5f5f5 !important;
}

.platform-android.android-portrait .phone-app-header {
  background: rgba(255, 255, 255, 0.97) !important;
}

.platform-android.android-portrait .phone-app-back-btn {
  color: #333 !important;
}

.platform-android.android-portrait .sms-input-bar {
  background: rgba(255, 255, 255, 0.98) !important;
}

.platform-android.android-portrait .mention-dropdown {
  background: #fff !important;
}

.platform-android.android-portrait .mention-item {
  color: #333 !important;
}

.platform-android.android-portrait .mention-empty {
  color: #bbb !important;
}

.platform-android.android-portrait .phone-loading {
  color: #bbb !important;
}

.platform-android.android-portrait .loading-spinner {
  border-color: rgba(0,0,0,0.08) !important;
  border-top-color: #ff8fab !important;
}

.platform-android.android-portrait .sms-time {
  color: #bbb !important;
  background: rgba(0,0,0,0.04) !important;
}

.platform-android.android-portrait .sms-bubble.assistant {
  background: #fff !important;
  color: #333 !important;
}

.platform-android.android-portrait .sms-bubble.user {
  background: linear-gradient(135deg, #ffeef5, #fce4ec) !important;
  color: #4a2040 !important;
}
</style>
