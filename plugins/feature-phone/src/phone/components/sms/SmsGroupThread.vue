<script setup>
/**
 * SmsGroupThread.vue — 群聊线程视图
 * 包含 header、消息列表、@提及输入栏。
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
        &#x2139;&#xFE0F;
      </button>
    </div>

    <div class="sms-thread">
      <div ref="groupMessagesRef" class="sms-messages">
        <div v-if="!threadMessages || threadMessages.filter(m => m.type === 'message').length === 0" class="phone-loading">
          发送消息开始群聊 · {{ memberCount }} 位成员
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
        <button type="button" class="sms-mention-btn" @click="$emit('open-info')">
          <!-- @ button toggles mention, but for now let it just be decorative;
               actual mention trigger is done by typing @ in textarea -->
          <span style="font-size: 1rem; line-height: 1;">@</span>
        </button>
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
        >
          <span class="sms-send-icon">&#x27A4;</span>
        </button>
        <!-- @ 提及下拉 -->
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
  padding: 8px 6px;
}

.sms-msg-row {
  display: flex;
  align-items: flex-end;
  width: 100%;
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
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.sms-msg-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sms-msg-avatar-default {
  font-size: 1.5rem;
  line-height: 1;
}

.sms-msg-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.group-sender-name {
  display: inline-block;
  font-size: 0.72rem;
  color: var(--phone-accent-blue, #0a84ff);
  font-weight: 600;
  margin-bottom: 3px;
}

.mention-highlight {
  color: var(--phone-accent-blue, #0a84ff);
  font-weight: 700;
}

.group-info-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
  line-height: 1;
}

.group-info-btn:hover {
  background: var(--phone-card-bg, rgba(255, 255, 255, 0.1));
}

.sms-input-bar {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 8px 10px;
  background: rgba(28, 28, 30, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid var(--phone-border, rgba(255, 255, 255, 0.08));
  position: relative;
}

.sms-input-wrapper {
  flex: 1;
  position: relative;
}

.sms-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 8px 14px;
  color: var(--phone-text-primary, #fff);
  font-size: 0.88rem;
  outline: none;
  resize: none;
  max-height: 100px;
  line-height: 1.4;
  box-sizing: border-box;
}

.sms-input:focus {
  border-color: rgba(10, 132, 255, 0.5);
}

.sms-input:disabled {
  opacity: 0.5;
}

.sms-send-btn {
  width: 36px;
  height: 36px;
  min-width: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 132, 255, 0.25);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(10, 132, 255, 0.4);
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.sms-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sms-send-btn:hover:not(:disabled) {
  background: rgba(10, 132, 255, 0.4);
}

.mention-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: rgba(28, 28, 30, 0.9);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  max-height: 160px;
  overflow-y: auto;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.4);
  z-index: 30;
}

.mention-item {
  padding: 8px 14px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--phone-text-primary, #fff);
  transition: background 0.1s;
}

.mention-item:hover {
  background: rgba(10, 132, 255, 0.15);
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
  color: var(--phone-text-secondary, rgba(255, 255, 255, 0.4));
  text-align: center;
}

.platform-android.android-portrait .sms-input {
  background: rgba(255, 255, 255, 0.14) !important;
}
.platform-android.android-portrait .sms-send-btn {
  background: rgba(10, 132, 255, 0.45) !important;
}
.platform-android.android-portrait .sms-msg-avatar {
  background: rgba(255, 255, 255, 0.18) !important;
}
</style>
