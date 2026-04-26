<script setup>
/**
 * SmsMessageRender.vue — 消息渲染组件
 * 负责渲染时间线、语音、红包、回礼、贴纸、普通文字消息。
 * 纯展示组件，不持有业务状态。
 */
const props = defineProps({
  messages: { type: Array, required: true },
  selectedContact: { type: Object, default: null },
  userAvatar: { type: String, default: null },
  charAvatar: { type: String, default: null },
  playingVoiceId: { type: String, default: null },
  voiceShownText: { type: Set, default: () => new Set() },
  loading: { type: Boolean, default: false },
  loadingText: { type: String, default: '对方正在输入...' },
})

const emit = defineEmits(['play-voice', 'voice-long-press', 'voice-long-release', 'red-packet-click', 'open-file'])

function getAvailableStickers() {
  const stickers = props.selectedContact?.smsStickers || {}
  return Object.entries(stickers)
}

function renderStickerText(text) {
  if (!text) return ''
  const stickers = props.selectedContact?.smsStickers || {}
  const stickerRegex = /\[sticker:([^\]]+)\]/g
  const parts = []
  let lastIndex = 0
  let match
  while ((match = stickerRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }
    const desc = match[1]
    const url = stickers[desc]
    if (url) {
      parts.push({ type: 'sticker', desc, url })
    } else {
      parts.push({ type: 'text', text: match[0] })
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', text: text.slice(lastIndex) })
  }
  return parts
}

function getVoiceDuration(msg) {
  const textLen = msg.voiceText?.length || 0
  return Math.max(1, Math.ceil(textLen / 4))
}
</script>

<template>
  <div class="sms-messages">
    <div v-if="!messages || messages.filter(m => m.type === 'message').length === 0" class="phone-loading">
      发送消息开始与 {{ selectedContact?.name }} 对话
    </div>
    <template v-for="(item, idx) in messages" :key="item.id || item.dateKey || idx">
      <div v-if="item.type === 'time'" class="sms-time">{{ item.text }}</div>
      <!-- 语音消息 -->
      <div v-else-if="item.msgType === 'voice'" class="sms-msg-row" :class="item.role">
        <div class="sms-msg-avatar">
          <img v-if="item.role === 'assistant' && charAvatar" :src="charAvatar" />
          <span v-else class="sms-msg-avatar-default">&#x1F9D1;</span>
        </div>
        <div class="sms-voice-wrapper">
          <div
            class="sms-bubble sms-voice-bubble"
            :class="[item.role, { playing: playingVoiceId === item.id }]"
            @click="emit('play-voice', item)"
            @touchstart="emit('voice-long-press', $event, item)"
            @touchend="emit('voice-long-release')"
            @touchcancel="emit('voice-long-release')"
          >
            <span class="voice-icon">{{ playingVoiceId === item.id ? '🔊' : '🎙️' }}</span>
            <span class="voice-wave">{{ playingVoiceId === item.id ? '▂▃▅▇' : '~~~~' }}</span>
            <span class="voice-duration">{{ getVoiceDuration(item) }}s</span>
            <span class="voice-hint">长按看文字</span>
          </div>
          <!-- 长按显示的文字 -->
          <div v-if="voiceShownText.has(item.id)" class="voice-text-quote">
            <span class="voice-quote-icon">💬</span>
            <span class="voice-quote-text">{{ item.voiceText }}</span>
          </div>
        </div>
      </div>
      <!-- 红包消息 -->
      <div v-else-if="item.msgType === 'redPacket'" class="sms-msg-row assistant" @click="!item.redPacket?.isOpened && emit('red-packet-click', item)">
        <div class="sms-msg-avatar">
          <img v-if="charAvatar" :src="charAvatar" />
          <span v-else class="sms-msg-avatar-default">&#x1F9D1;</span>
        </div>
        <div class="sms-bubble sms-redpacket-bubble" :class="{ opened: item.redPacket?.isOpened }">
          <div class="redpacket-icon">{{ item.redPacket?.isOpened ? '🧧' : '🎁' }}</div>
          <div class="redpacket-content">
            <div class="redpacket-title">{{ item.redPacket?.senderName }} 的红包</div>
            <div class="redpacket-blessing">{{ item.redPacket?.blessing }}</div>
            <div v-if="item.redPacket?.isOpened" class="redpacket-opened-tag">已领取</div>
          </div>
        </div>
      </div>
      <!-- 角色回礼消息 -->
      <div v-else-if="item.msgType === 'giftReturn'" class="sms-msg-row assistant">
        <div class="sms-msg-avatar">
          <img v-if="charAvatar" :src="charAvatar" />
          <span v-else class="sms-msg-avatar-default">&#x1F9D1;</span>
        </div>
        <div class="sms-bubble sms-giftreturn-bubble">
          <div class="giftreturn-icon">{{ item.giftReturn?.icon || '🎁' }}</div>
          <div class="giftreturn-content">
            <div class="giftreturn-title">收到了 {{ item.giftReturn?.fromName }} 的回礼</div>
            <div class="giftreturn-item">{{ item.giftReturn?.itemName }} {{ item.giftReturn?.message || '' }}</div>
          </div>
        </div>
      </div>
      <!-- 文件消息 -->
      <div v-else-if="item.msgType === 'file'" class="sms-msg-row assistant" @click="emit('open-file', item)">
        <div class="sms-msg-avatar">
          <img v-if="charAvatar" :src="charAvatar" />
          <span v-else class="sms-msg-avatar-default">&#x1F9D1;</span>
        </div>
        <div class="sms-bubble sms-file-bubble">
          <div class="file-bubble-icon">&#x1F4C4;</div>
          <div class="file-bubble-content">
            <div class="file-bubble-name">{{ item.fileName }}</div>
            <div class="file-bubble-hint">点击查看并打印</div>
          </div>
        </div>
      </div>
      <!-- 文字消息 -->
      <div v-else class="sms-msg-row" :class="item.role">
        <div class="sms-msg-avatar">
          <img v-if="item.role === 'assistant' && charAvatar" :src="charAvatar" />
          <img v-else-if="item.role === 'user' && userAvatar" :src="userAvatar" />
          <span v-else class="sms-msg-avatar-default">&#x1F9D1;</span>
        </div>
        <div class="sms-bubble" :class="item.role">
          <template v-for="part in renderStickerText(item.text)" :key="part.desc || part.text">
            <img v-if="part.type === 'sticker'" class="sms-sticker-img" :src="part.url" :alt="part.desc" />
            <span v-else>{{ part.text }}</span>
          </template>
        </div>
      </div>
    </template>
    <div v-if="loading" class="phone-loading">
      <div class="loading-spinner" />{{ loadingText }}
    </div>
  </div>
</template>

<style scoped>
.sms-messages {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 6px;
  min-height: 100%;
}

.sms-msg-row {
  display: flex;
  align-items: flex-end;
  width: 100%;
  gap: 4px;
  animation: msg-slide-in 0.3s ease-out;
}

@keyframes msg-slide-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.sms-msg-row.assistant {
  flex-direction: row;
}

.sms-msg-row.user {
  flex-direction: row-reverse;
}

/* ===== 头像 ===== */
.sms-msg-avatar {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.05));
  border: 1.5px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s ease;
  margin: 0 2px;
}

.sms-msg-avatar:hover {
  transform: scale(1.08);
}

.sms-msg-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sms-msg-avatar-default {
  font-size: 1.2rem;
  opacity: 0.7;
}

/* ===== 时间戳 ===== */
.sms-time {
  align-self: center;
  text-align: center;
  font-size: 0.68rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  padding: 3px 12px;
  border-radius: 10px;
  margin: 8px auto;
  letter-spacing: 0.3px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

/* ===== 消息气泡基础（仅布局属性，装饰样式由自定义CSS控制） ===== */
.sms-bubble {
  position: relative;
  max-width: 75%;
  word-wrap: break-word;
  /* 不设置任何装饰样式，让自定义CSS完全控制 */
}

/* 用户消息间距 */
.sms-bubble.user {
  margin-right: 4px;
}

/* 角色消息间距 */
.sms-bubble.assistant {
  margin-left: 4px;
}

/* ===== 语音消息 ===== */
.sms-voice-wrapper {
  display: flex;
  flex-direction: column;
  max-width: 75%;
  gap: 4px;
}

.sms-voice-bubble {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 10px 14px !important;
  min-width: 120px;
  user-select: none;
  position: relative;
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(9, 182, 255, 0.12)) !important;
  border-radius: 16px !important;
}

.sms-voice-bubble:hover {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.35), rgba(9, 182, 255, 0.25)) !important;
}

.sms-voice-bubble.playing {
  animation: voice-pulse 1.2s ease-in-out infinite;
}

@keyframes voice-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(0, 212, 255, 0.4);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(0, 212, 255, 0);
    transform: scale(1.02);
  }
}

.voice-icon {
  font-size: 1.3rem;
  flex-shrink: 0;
  animation: voice-icon-bounce 0.6s ease-in-out infinite;
}

.sms-voice-bubble.playing .voice-icon {
  animation: none;
}

@keyframes voice-icon-bounce {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.voice-wave {
  font-family: var(--font-mono, monospace);
  font-size: 0.9rem;
  letter-spacing: 2px;
  opacity: 0.6;
  color: rgba(0, 212, 255, 0.8);
}

.sms-voice-bubble.playing .voice-wave {
  opacity: 1;
  animation: wave-animate 0.4s steps(4) infinite;
}

@keyframes wave-animate {
  0% { content: '~~~~'; }
  25% { content: '▂▃▅'; }
  50% { content: '▃▅▇'; }
  75% { content: '▅▇█'; }
  100% { content: '▇█▇'; }
}

.voice-duration {
  font-size: 0.75rem;
  font-weight: 600;
  opacity: 0.5;
  color: rgba(0, 212, 255, 0.7);
}

.voice-hint {
  font-size: 0.6rem;
  opacity: 0.35;
  position: absolute;
  bottom: 2px;
  right: 8px;
  color: rgba(255, 255, 255, 0.5);
}

/* 语音文字引用 */
.voice-text-quote {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  margin-top: 4px;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 0.8rem;
  animation: quote-fade-in 0.25s ease;
  color: rgba(255, 255, 255, 0.85);
}

@keyframes quote-fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.voice-quote-icon {
  flex-shrink: 0;
  font-size: 0.7rem;
  opacity: 0.6;
}

.voice-quote-text {
  line-height: 1.5;
  word-break: break-word;
}

/* ===== 红包气泡 ===== */
.sms-redpacket-bubble {
  background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%) !important;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px !important;
  cursor: pointer;
  min-width: 180px;
  border-radius: 12px !important;
  box-shadow: 0 4px 12px rgba(231, 76, 60, 0.3) !important;
  transition: transform 0.15s ease;
  margin-left: 4px;
}

.sms-redpacket-bubble:hover:not(.opened) {
  transform: scale(1.02);
}

.sms-redpacket-bubble:active:not(.opened) {
  transform: scale(0.96);
}

.sms-redpacket-bubble.opened {
  opacity: 0.6;
  cursor: default;
  filter: grayscale(30%);
}

.redpacket-icon {
  font-size: 28px;
  flex-shrink: 0;
}

.sms-redpacket-bubble:hover:not(.opened) .redpacket-icon {
  animation: redpacket-shake 0.3s ease-in-out infinite;
}

@keyframes redpacket-shake {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-5deg); }
  75% { transform: rotate(5deg); }
}

.redpacket-content {
  flex: 1;
  min-width: 0;
}

.redpacket-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.redpacket-blessing {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.redpacket-opened-tag {
  font-size: 11px;
  color: rgba(255, 215, 0, 0.8);
  margin-top: 3px;
  font-weight: 500;
}

/* ===== 角色回礼气泡 ===== */
.sms-giftreturn-bubble {
  background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%) !important;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px !important;
  min-width: 180px;
  border-radius: 12px !important;
  box-shadow: 0 4px 12px rgba(243, 156, 18, 0.3) !important;
  margin-left: 4px;
}

.giftreturn-icon {
  font-size: 28px;
  flex-shrink: 0;
}

.giftreturn-content {
  flex: 1;
  min-width: 0;
}

.giftreturn-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.giftreturn-item {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 3px;
}

/* ===== 文件气泡 ===== */
.sms-file-bubble {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px !important;
  min-width: 160px;
  cursor: pointer;
  background: linear-gradient(135deg, rgba(100, 100, 255, 0.15), rgba(150, 100, 255, 0.1)) !important;
  border-radius: 12px !important;
  transition: transform 0.15s ease;
  margin-left: 4px;
}

.sms-file-bubble:hover {
  transform: scale(1.02);
}

.sms-file-bubble:active {
  transform: scale(0.96);
}

.file-bubble-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.file-bubble-content {
  flex: 1;
  min-width: 0;
}

.file-bubble-name {
  font-size: 13px;
  font-weight: 600;
  color: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-bubble-hint {
  font-size: 11px;
  opacity: 0.5;
  margin-top: 3px;
}

/* ===== 表情包 ===== */
.sms-sticker-img {
  display: inline-block;
  max-width: 100px;
  max-height: 100px;
  vertical-align: bottom;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* ===== 加载动画 ===== */
.phone-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.5);
}

.loading-spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2.5px solid rgba(255, 255, 255, 0.15);
  border-top-color: rgba(10, 132, 255, 0.8);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ===== 打字动画 ===== */
.sms-typing-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
}

.typing-dot {
  width: 8px;
  height: 8px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  animation: typing-bounce 1.2s ease-in-out infinite;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
  30% { transform: translateY(-6px); opacity: 1; }
}

/* ===== Android 兼容 ===== */
.platform-android.android-portrait .sms-msg-avatar {
  background: rgba(255, 255, 255, 0.18) !important;
}
/* Android端气泡样式由自定义CSS控制，不再强制覆盖 */
</style>
