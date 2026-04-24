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

.sms-msg-row .sms-bubble {
  margin-left: 0;
  margin-right: 0;
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

.sms-time {
  text-align: center;
  font-size: 0.7rem;
  color: #c0a0b0;
  background: rgba(255, 255, 255, 0.7);
  display: inline-block;
  margin: 12px auto;
  padding: 4px 16px;
  border-radius: 12px;
  border: 1px solid rgba(224, 180, 200, 0.3);
  letter-spacing: 0.5px;
}

/* ===== 语音消息气泡 ===== */
.sms-voice-wrapper {
  display: flex;
  flex-direction: column;
  max-width: 75%;
}

.sms-voice-bubble {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 10px 16px !important;
  min-width: 120px;
  user-select: none;
  position: relative;
}

.sms-voice-bubble > * {
  color: inherit;
}

.sms-voice-bubble:active {
  opacity: 0.8;
}

.sms-voice-bubble.playing {
  animation: voice-pulse 1.5s ease-in-out infinite;
}

@keyframes voice-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0, 212, 255, 0.3); }
  50% { box-shadow: 0 0 0 6px rgba(0, 212, 255, 0); }
}

.voice-icon {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.voice-wave {
  font-family: var(--font-mono, monospace);
  font-size: 0.85rem;
  letter-spacing: 1px;
  opacity: 0.5;
}

.sms-voice-bubble.playing .voice-wave {
  opacity: 0.8;
}

.voice-duration {
  font-size: 0.75rem;
  font-weight: 600;
  opacity: 0.4;
}

.voice-hint {
  font-size: 0.65rem;
  opacity: 0.3;
  position: absolute;
  bottom: 4px;
  right: 8px;
}

/* 语音文字引用（QQ风格）*/
.sms-msg-row.user .voice-text-quote {
  color: #5a3e2b !important;
  background: rgba(252, 182, 159, 0.15);
  border-left: 3px solid #fcb69f;
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 0.8rem;
  animation: fade-in 0.2s ease;
}

.sms-msg-row.assistant .voice-text-quote {
  color: #1b4a5e !important;
  background: rgba(178, 235, 242, 0.2);
  border-left: 3px solid #b2ebf2;
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 0.8rem;
  animation: fade-in 0.2s ease;
}

.sms-msg-row.user .voice-text-quote .voice-quote-text,
.sms-msg-row.assistant .voice-text-quote .voice-quote-text {
  color: inherit !important;
}

.sms-msg-row.user .voice-text-quote .voice-quote-icon,
.sms-msg-row.assistant .voice-text-quote .voice-quote-icon {
  color: inherit !important;
}

.voice-text-quote .voice-quote-icon {
  flex-shrink: 0;
  font-size: 0.75rem;
}

.voice-text-quote .voice-quote-text {
  line-height: 1.5;
  word-break: break-word;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ===== 红包/礼物气泡 ===== */
.sms-redpacket-bubble {
  background: linear-gradient(135deg, #e74c3c, #c0392b) !important;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px !important;
  cursor: pointer;
  min-width: 200px;
  transition: transform 0.15s;
}

.sms-redpacket-bubble:active:not(.opened) {
  transform: scale(0.96);
}

.sms-redpacket-bubble.opened {
  opacity: 0.7;
  cursor: default;
}

.redpacket-icon {
  font-size: 32px;
  flex-shrink: 0;
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
  color: rgba(255, 255, 255, 0.7);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.redpacket-opened-tag {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}

/* 角色回礼气泡 */
.sms-giftreturn-bubble {
  background: linear-gradient(135deg, #f39c12, #e67e22) !important;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px !important;
  min-width: 200px;
}

.giftreturn-icon {
  font-size: 32px;
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
  color: rgba(255, 255, 255, 0.7);
  margin-top: 2px;
}

/* 文件气泡 */
.sms-file-bubble {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px !important;
  min-width: 180px;
  cursor: pointer;
  transition: transform 0.15s;
}

.sms-file-bubble:active {
  transform: scale(0.96);
}

.file-bubble-icon {
  font-size: 28px;
  flex-shrink: 0;
}

.file-bubble-content {
  flex: 1;
  min-width: 0;
}

.file-bubble-name {
  font-size: 14px;
  font-weight: 600;
  color: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-bubble-hint {
  font-size: 11px;
  opacity: 0.5;
  margin-top: 2px;
}

/* 表情包图片 */
.sms-sticker-img {
  display: inline-block;
  max-width: 120px;
  max-height: 120px;
  vertical-align: bottom;
  border-radius: 4px;
}

.platform-android.android-portrait .sms-msg-avatar {
  background: rgba(255, 255, 255, 0.18) !important;
}
</style>
