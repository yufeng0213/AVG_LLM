<script setup>
/**
 * SmsPrivateThread.vue — 私聊线程视图
 * 包含 header（返回/设置/头像/视频）、聊天背景、消息容器、输入栏、Plus面板。
 * 消息渲染委托给 SmsMessageRender。
 */
import { ref } from 'vue'
import SmsMessageRender from './SmsMessageRender.vue'

const props = defineProps({
  contact: { type: Object, required: true },
  threadMessages: { type: Array, required: true },
  draft: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  showPlusPanel: { type: Boolean, default: false },
  showStickerPanel: { type: Boolean, default: false },
  chatBgUrl: { type: String, default: '' },
  charAvatar: { type: String, default: null },
  userAvatar: { type: String, default: null },
  playingVoiceId: { type: String, default: null },
  voiceShownText: { type: Set, default: () => new Set() },
})

const emit = defineEmits([
  'back',
  'update:draft',
  'send',
  'toggle-plus',
  'toggle-sticker',
  'open-settings',
  'open-gift-shop',
  'plus-action',
  'play-voice',
  'voice-long-press',
  'voice-long-release',
  'avatar-pointer-down',
  'avatar-pointer-up',
  'avatar-pointer-leave',
  'red-packet-click',
  'call-video',
  'open-file',
])

const PLUS_ACTIONS = [
  { id: 'redpacket', icon: '🧧', label: '红包', color: 'linear-gradient(135deg, #e74c3c, #c0392b)' },
  { id: 'emoji', icon: '😀', label: '表情', color: 'linear-gradient(135deg, #f39c12, #e67e22)' },
  { id: 'camera', icon: '📷', label: '拍照', color: 'linear-gradient(135deg, #3498db, #2980b9)' },
  { id: 'music', icon: '🎵', label: '音乐', color: 'linear-gradient(135deg, #9b59b6, #8e44ad)' },
  { id: 'location', icon: '📍', label: '位置', color: 'linear-gradient(135deg, #2ecc71, #27ae60)' },
  { id: 'file', icon: '📁', label: '文件', color: 'linear-gradient(135deg, #95a5a6, #7f8c8d)' },
  { id: 'voice', icon: '🎙️', label: '语音', color: 'linear-gradient(135deg, #1abc9c, #16a085)' },
  { id: 'gift', icon: '🎁', label: '礼物', color: 'linear-gradient(135deg, #ff6b6b, #ee5a24)' },
]

const messagesContainerRef = ref(null)
defineExpose({ messagesContainerRef })
</script>

<template>
  <div class="sms-thread">
    <!-- 聊天背景层 -->
    <div v-if="chatBgUrl" class="sms-chat-bg" :style="{ backgroundImage: 'url(' + chatBgUrl + ')' }"></div>

    <!-- Header：简洁按钮 -->
    <div class="sms-thread-header">
      <div class="sms-header-left">
        <button type="button" class="sms-header-btn" @click="emit('back')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button type="button" class="sms-header-btn" @click="emit('open-settings')" title="设置">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4m-9-9h4m14 0h4m-3.3-6.7l-2.8 2.8M6.1 17.9l-2.8 2.8m0-13.4l2.8 2.8m11.8 7.8l2.8 2.8"/></svg>
        </button>
      </div>
      <div class="sms-header-avatar" @pointerdown="emit('avatar-pointer-down', $event, contact)" @pointerup="emit('avatar-pointer-up')" @pointerleave="emit('avatar-pointer-leave')">
        <img v-if="charAvatar" :src="charAvatar" />
        <span v-else class="sms-header-avatar-placeholder">{{ contact.name?.slice(0, 1) }}</span>
      </div>
      <div class="sms-header-right">
        <button type="button" class="sms-header-btn" @click="emit('open-gift-shop')" title="礼物">
          <span style="font-size: 20px;">&#x1F381;</span>
        </button>
        <button type="button" class="sms-header-btn" @click="emit('call-video', contact)" title="视频通话">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        </button>
      </div>
    </div>

    <!-- 消息列表 -->
    <div ref="messagesContainerRef" class="sms-messages-wrapper">
      <SmsMessageRender
        :messages="threadMessages"
        :selected-contact="contact"
        :user-avatar="userAvatar"
        :char-avatar="charAvatar"
        :playing-voice-id="playingVoiceId"
        :voice-shown-text="voiceShownText"
        :loading="loading"
        loading-text="对方正在输入..."
        @play-voice="(msg) => $emit('play-voice', msg)"
        @voice-long-press="(e, msg) => $emit('voice-long-press', e, msg)"
        @voice-long-release="$emit('voice-long-release')"
        @red-packet-click="(msg) => $emit('red-packet-click', msg)"
        @open-file="(msg) => $emit('open-file', msg)"
      />
    </div>

    <!-- 输入栏 -->
    <div class="sms-input-bar">
      <button
        type="button"
        class="sms-plus-btn"
        :class="{ active: showPlusPanel }"
        @click="emit('toggle-plus')"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <div class="sms-input-wrapper">
        <textarea
          :value="draft"
          @input="emit('update:draft', $event.target.value)"
          class="sms-input"
          placeholder="输入消息..."
          rows="1"
          maxlength="500"
          :disabled="loading"
          @keydown.enter.exact.prevent="emit('send')"
          @focus="emit('toggle-plus', false)"
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
    </div>

    <!-- + 展开面板 -->
    <div v-if="showPlusPanel" class="sms-plus-panel">
      <div class="sms-plus-grid">
        <div
          v-for="action in PLUS_ACTIONS"
          :key="action.id"
          class="sms-plus-item"
          @click="emit('plus-action', action.id)"
        >
          <div class="sms-plus-item-icon" :style="{ background: action.color }">{{ action.icon }}</div>
          <span class="sms-plus-item-label">{{ action.label }}</span>
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
  position: relative;
}

.sms-messages-wrapper {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 8px 6px;
}

/* ===== 聊天背景 ===== */
.sms-chat-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: 0;
  opacity: 0.3;
  pointer-events: none;
}

/* ===== Header 区域 ===== */
.sms-thread-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  padding-top: max(8px, var(--safe-area-inset-top, 8px));
  background: transparent;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

/* 左侧按钮组 */
.sms-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 右侧按钮组 */
.sms-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 简洁按钮（无背景无边框） */
.sms-header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.65);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.sms-header-btn:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.08);
}

.sms-header-btn:active {
  transform: scale(0.92);
  background: rgba(255, 255, 255, 0.12);
}

/* 中间头像 */
.sms-header-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  flex-shrink: 0;
  cursor: pointer;
  border: 2px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
  transition: all 0.2s ease;
}

.sms-header-avatar:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 25px rgba(102, 126, 234, 0.5);
}

.sms-header-avatar:active {
  transform: scale(0.95);
}

.sms-header-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sms-header-avatar-placeholder {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
}

/* ===== + 面板 ===== */
.sms-plus-panel {
  background: rgba(28, 28, 30, 0.92);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 12px 8px;
  padding-bottom: max(16px, var(--safe-area-inset-bottom, 16px));
  animation: sms-plus-slide-up 0.2s ease;
}

@keyframes sms-plus-slide-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.sms-plus-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px 8px;
}

.sms-plus-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 8px 4px;
  border-radius: 12px;
  transition: background 0.15s;
}

.sms-plus-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.sms-plus-item:active {
  background: rgba(255, 255, 255, 0.1);
}

.sms-plus-item-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
}

.sms-plus-item-label {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.6);
}

/* ===== + 按钮（简洁无背景无边框） ===== */
.sms-plus-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.sms-plus-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.75);
}

.sms-plus-btn.active {
  color: #0a84ff;
  transform: rotate(45deg);
}

/* ===== 输入栏 ===== */
.sms-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  padding-bottom: max(10px, var(--safe-area-inset-bottom, 10px));
  background: rgba(28, 28, 30, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
  z-index: 5;
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

/* ===== Android 兼容 ===== */
.platform-android.android-portrait .sms-header-btn {
  color: rgba(255, 255, 255, 0.75) !important;
}
.platform-android.android-portrait .sms-header-avatar {
  background: linear-gradient(135deg, #5a6fd6, #6a3ba2) !important;
}
.platform-android.android-portrait .sms-plus-panel {
  background: rgba(28, 28, 30, 0.97) !important;
}
.platform-android.android-portrait .sms-plus-item-icon {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35) !important;
}
.platform-android.android-portrait .sms-input {
  background: rgba(255, 255, 255, 0.14) !important;
}
.platform-android.android-portrait .sms-input-bar {
  background: transparent !important;
}
.platform-android.android-portrait .sms-plus-btn {
  color: rgba(255, 255, 255, 0.6) !important;
}
.platform-android.android-portrait .sms-plus-btn.active {
  color: #0a84ff !important;
}
.platform-android.android-portrait .sms-send-btn {
  background: rgba(10, 132, 255, 0.45) !important;
}

  .platform-android.android-portrait .sms-send-btn,
  .platform-android.android-portrait .sms-plus-btn,
  .platform-android.android-portrait .sms-header-btn {
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
</style>
