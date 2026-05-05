<script setup>
/**
 * SmsPrivateThread.vue — 私聊线程视图（浅色 IM 风格）
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
  onlineStatus: { type: Object, default: null },
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
  'call-voice',
  'open-file',
])

const showMenuDropdown = ref(false)
const messagesContainerRef = ref(null)
defineExpose({ messagesContainerRef })

function toggleMenu() {
  showMenuDropdown.value = !showMenuDropdown.value
}

function handleMenuAction(action) {
  showMenuDropdown.value = false
  if (action === 'settings') emit('open-settings')
  else if (action === 'gift') emit('open-gift-shop')
  else if (action === 'video') emit('call-video', props.contact)
}

const PLUS_ACTIONS = [
  { id: 'redpacket', icon: '🧧', label: '红包', color: 'linear-gradient(135deg, #e74c3c, #c0392b)' },
  { id: 'voicecall', icon: '📞', label: '语音通话', color: 'linear-gradient(135deg, #ff8fab, #fb6f92)' },
  { id: 'camera', icon: '', label: '拍照', color: 'linear-gradient(135deg, #3498db, #2980b9)' },
  { id: 'music', icon: '', label: '音乐', color: 'linear-gradient(135deg, #9b59b6, #8e44ad)' },
  { id: 'location', icon: '📍', label: '位置', color: 'linear-gradient(135deg, #2ecc71, #27ae60)' },
  { id: 'file', icon: '📁', label: '文件', color: 'linear-gradient(135deg, #95a5a6, #7f8c8d)' },
  { id: 'gift', icon: '🎁', label: '礼物', color: 'linear-gradient(135deg, #ff6b6b, #ee5a24)' },
]
</script>

<template>
  <div class="sms-thread">
    <!-- 聊天背景层 -->
    <div v-if="chatBgUrl" class="sms-chat-bg" :style="{ backgroundImage: 'url(' + chatBgUrl + ')' }"></div>

    <!-- Header：返回 + 角色名/在线状态 + 三点菜单 -->
    <div class="sms-thread-header">
      <div class="sms-header-left">
        <button type="button" class="sms-header-btn sms-back-btn" @click="emit('back')">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="sms-header-title-block">
          <div class="sms-header-title">{{ contact.name }}</div>
          <div class="sms-header-subtitle" v-if="onlineStatus">{{ onlineStatus.label }}</div>
        </div>
      </div>
      <div class="sms-header-right">
        <button type="button" class="sms-header-btn sms-menu-btn" @click="toggleMenu">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
        </button>
      </div>
    </div>

    <!-- 三点菜单下拉 -->
    <div v-if="showMenuDropdown" class="sms-menu-dropdown" @click="showMenuDropdown = false">
      <div class="sms-menu-content" @click.stop>
        <div class="sms-menu-item" @click="handleMenuAction('settings')">
          <span class="sms-menu-item-icon">⚙️</span>
          <span>聊天设置</span>
        </div>
        <div class="sms-menu-item" @click="handleMenuAction('gift')">
          <span class="sms-menu-item-icon"></span>
          <span>送礼物</span>
        </div>
        <div class="sms-menu-item" @click="handleMenuAction('video')">
          <span class="sms-menu-item-icon">📹</span>
          <span>视频通话</span>
        </div>
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

    <!-- 输入栏：表情 + 文本框 + +号 + 发送 -->
    <div class="sms-input-bar">
      <button
        type="button"
        class="sms-action-btn"
        :class="{ active: showStickerPanel }"
        @click="emit('toggle-sticker')"
        title="表情"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
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
        class="sms-action-btn"
        :class="{ active: showPlusPanel }"
        @click="emit('toggle-plus')"
        title="更多"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button
        type="button"
        class="sms-send-btn"
        :disabled="!draft.trim() || loading"
        @click="emit('send')"
        title="发送"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
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
  padding: 4px 8px 8px;
}

/* ===== 聊天背景 ===== */
.sms-chat-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  z-index: 0;
  opacity: 0.12;
  pointer-events: none;
}

/* ===== Header ===== */
.sms-thread-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  padding-top: max(8px, var(--safe-area-inset-top, 8px));
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.sms-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.sms-back-btn {
  flex-shrink: 0;
  color: #333;
}

.sms-header-title-block {
  min-width: 0;
}

.sms-header-title {
  font-size: 1rem;
  font-weight: 600;
  color: #222;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sms-header-subtitle {
  font-size: 0.7rem;
  color: #999;
  margin-top: 1px;
}

.sms-header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: none;
  color: #555;
  cursor: pointer;
  border-radius: 50%;
  transition: background 0.15s ease;
  flex-shrink: 0;
}

.sms-header-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.sms-header-btn:active {
  background: rgba(0, 0, 0, 0.1);
}

/* 三点菜单下拉 */
.sms-menu-dropdown {
  position: absolute;
  top: 50px;
  right: 12px;
  z-index: 100;
  padding: 4px;
}

.sms-menu-content {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  min-width: 140px;
  animation: menu-fade-in 0.15s ease;
}

@keyframes menu-fade-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.sms-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  font-size: 0.88rem;
  color: #333;
  cursor: pointer;
  transition: background 0.1s;
}

.sms-menu-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.sms-menu-item:active {
  background: rgba(0, 0, 0, 0.08);
}

.sms-menu-item-icon {
  font-size: 1rem;
}

/* ===== + 面板 ===== */
.sms-plus-panel {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-top: 0.5px solid rgba(0, 0, 0, 0.08);
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
  background: rgba(0, 0, 0, 0.04);
}

.sms-plus-item:active {
  background: rgba(0, 0, 0, 0.08);
}

.sms-plus-item-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.sms-plus-item-label {
  font-size: 0.7rem;
  color: #666;
}

/* ===== 输入栏 ===== */
.sms-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  padding-bottom: max(8px, var(--safe-area-inset-bottom, 8px));
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 0.5px solid rgba(0, 0, 0, 0.06);
  position: relative;
  z-index: 5;
}

.sms-action-btn,
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

.sms-action-btn:hover,
.sms-send-btn:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #555;
}

.sms-action-btn.active {
  color: #ff8fab;
}

.sms-input-wrapper {
  flex: 1;
  position: relative;
  min-width: 0;
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

.sms-input::placeholder {
  color: #bbb;
}

.sms-send-btn:disabled {
  color: #ccc;
  cursor: not-allowed;
}

.sms-send-btn:not(:disabled) {
  background: linear-gradient(135deg, #ff8fab, #fb6f92);
  color: #fff;
}

.sms-send-btn:not(:disabled):hover {
  background: linear-gradient(135deg, #ff8fab, #fb6f92);
  transform: scale(1.08);
  box-shadow: 0 2px 12px rgba(255, 143, 171, 0.4);
}

.sms-send-btn:active:not(:disabled) {
  transform: scale(0.92);
}

/* ===== Android 兼容 ===== */
.platform-android.android-portrait .sms-header-btn,
.platform-android.android-portrait .sms-back-btn {
  color: #333 !important;
}

.platform-android.android-portrait .sms-thread-header {
  background: rgba(255, 255, 255, 0.97) !important;
}

.platform-android.android-portrait .sms-input {
  background: #f5f5f5 !important;
}

.platform-android.android-portrait .sms-input:focus {
  background: #fff !important;
}

.platform-android.android-portrait .sms-input-bar {
  background: rgba(255, 255, 255, 0.98) !important;
}

.platform-android.android-portrait .sms-action-btn,
.platform-android.android-portrait .sms-send-btn {
  color: #888 !important;
}

.platform-android.android-portrait .sms-send-btn:not(:disabled) {
  background: linear-gradient(135deg, #ff8fab, #fb6f92) !important;
}

.platform-android.android-portrait .sms-plus-panel {
  background: rgba(255, 255, 255, 0.98) !important;
}

.platform-android.android-portrait .sms-plus-item-label {
  color: #555 !important;
}

.platform-android.android-portrait .sms-menu-content {
  background: #fff !important;
}

.platform-android.android-portrait .sms-menu-item {
  color: #333 !important;
}

  .platform-android.android-portrait .sms-send-btn,
  .platform-android.android-portrait .sms-action-btn,
  .platform-android.android-portrait .sms-header-btn,
  .platform-android.android-portrait .sms-back-btn {
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
