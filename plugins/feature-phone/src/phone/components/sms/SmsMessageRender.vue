<script setup>
/**
 * SmsMessageRender.vue — 消息渲染组件（浅色 IM 风格）
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

import SmsShareCardBubble from './SmsShareCardBubble.vue'
import ArchiveCardBubble from '../browser/ArchiveCardBubble.vue'

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
          <img v-else-if="item.role === 'user' && userAvatar" :src="userAvatar" />
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
          <div class="redpacket-inner">
            <div class="redpacket-icon">{{ item.redPacket?.isOpened ? '✅' : '🧧' }}</div>
            <div class="redpacket-content">
              <div class="redpacket-title">{{ item.redPacket?.senderName }} 的红包</div>
              <div class="redpacket-blessing">{{ item.redPacket?.blessing }}</div>
              <div v-if="item.redPacket?.isOpened" class="redpacket-opened-tag">已领取</div>
              <div v-else class="redpacket-hint">点击拆开</div>
            </div>
            <div class="redpacket-arrow" v-if="!item.redPacket?.isOpened">›</div>
          </div>
        </div>
      </div>

      <!-- 玩家送礼卡片 -->
      <div v-else-if="item.msgType === 'giftCard'" class="sms-msg-row user">
        <div class="sms-msg-avatar">
          <img v-if="userAvatar" :src="userAvatar" />
          <span v-else class="sms-msg-avatar-default">&#x1F9D1;</span>
        </div>
        <div class="sms-bubble sms-giftcard-bubble">
          <div class="giftcard-inner">
            <div class="giftcard-icon-wrap">
              <div class="giftcard-icon">{{ item.giftCard?.icon || '🎁' }}</div>
              <div class="giftcard-sparkle" />
            </div>
            <div class="giftcard-content">
              <div class="giftcard-header">
                <span class="giftcard-label">送礼</span>
              </div>
              <div class="giftcard-item">{{ item.giftCard?.giftName }}</div>
            </div>
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
          <div class="giftreturn-inner">
            <div class="giftreturn-icon-wrap">
              <div class="giftreturn-icon">{{ item.giftReturn?.icon || '🎁' }}</div>
              <div class="giftreturn-sparkle" />
            </div>
            <div class="giftreturn-content">
              <div class="giftreturn-header">
                <span class="giftreturn-label">回礼</span>
              </div>
              <div class="giftreturn-name">来自 {{ item.giftReturn?.fromName }}</div>
              <div class="giftreturn-item">{{ item.giftReturn?.itemName }}</div>
              <div class="giftreturn-message" v-if="item.giftReturn?.message">"{{ item.giftReturn.message }}"</div>
            </div>
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

      <!-- 分享卡片 -->
      <div v-else-if="item.msgType === 'shareCard'" class="sms-msg-row" :class="item.role">
        <div class="sms-msg-avatar">
          <img v-if="item.role === 'assistant' && charAvatar" :src="charAvatar" />
          <img v-else-if="item.role === 'user' && userAvatar" :src="userAvatar" />
          <span v-else class="sms-msg-avatar-default">&#x1F9D1;</span>
        </div>
        <div class="sms-share-card-wrapper">
          <SmsShareCardBubble :share-card="item.shareCard" />
        </div>
      </div>

      <!-- 档案卡片 -->
      <div v-else-if="item.msgType === 'archiveCard'" class="sms-msg-row" :class="item.role">
        <div class="sms-msg-avatar">
          <img v-if="item.role === 'assistant' && charAvatar" :src="charAvatar" />
          <img v-else-if="item.role === 'user' && userAvatar" :src="userAvatar" />
          <span v-else class="sms-msg-avatar-default">&#x1F9D1;</span>
        </div>
        <div class="sms-archive-card-wrapper">
          <ArchiveCardBubble :card="item.archiveCard" />
        </div>
      </div>

      <!-- 成就通知 -->
      <div v-else-if="item.msgType === 'achievement'" class="sms-msg-row achievement-msg">
        <div class="achievement-msg-content">
          <span class="achievement-msg-icon">{{ item.achievement?.icon || '🏆' }}</span>
          <div class="achievement-msg-text">
            <div class="achievement-msg-name">成就解锁：{{ item.achievement?.name }}</div>
            <div class="achievement-msg-desc">{{ item.achievement?.description }}</div>
          </div>
        </div>
      </div>

      <!-- 纯贴纸（无气泡包裹） -->
      <div v-else-if="item.text && item.text.startsWith('[sticker:') && item.text.endsWith(']')" class="sms-msg-row" :class="item.role">
        <div class="sms-msg-avatar">
          <img v-if="item.role === 'assistant' && charAvatar" :src="charAvatar" />
          <img v-else-if="item.role === 'user' && userAvatar" :src="userAvatar" />
          <span v-else class="sms-msg-avatar-default">&#x1F9D1;</span>
        </div>
        <img
          v-for="part in [renderStickerText(item.text).find(p => p.type === 'sticker')]"
          :key="part?.desc"
          v-if="part"
          class="sms-sticker-img-large"
          :src="part.url"
          :alt="part.desc"
        />
      </div>

      <!-- 文字消息（含内联贴纸） -->
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
  gap: 4px;
  padding: 4px 8px 8px;
  min-height: 100%;
}

.sms-msg-row {
  display: flex;
  align-items: flex-end;
  width: 100%;
  gap: 6px;
  animation: msg-slide-in 0.25s ease-out;
}

@keyframes msg-slide-in {
  from {
    opacity: 0;
    transform: translateY(8px);
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
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e0f7fa, #b2ebf2);
  flex-shrink: 0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  transition: transform 0.2s ease;
  align-self: flex-end;
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
  font-size: 1.1rem;
  opacity: 0.6;
}

/* ===== 时间戳 ===== */
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
  letter-spacing: 0.3px;
}

/* ===== 消息气泡 ===== */
.sms-bubble {
  position: relative;
  max-width: 75%;
  word-wrap: break-word;
  padding: 10px 14px;
  font-size: 0.88rem;
  line-height: 1.55;
  border-radius: 18px;
}

/* 左侧气泡（对方）— 白色 */
.sms-bubble.assistant {
  background: #fff;
  color: #333;
  border-radius: 18px 18px 18px 6px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

/* 右侧气泡（自己）— 淡紫色 */
.sms-bubble.user {
  background: linear-gradient(135deg, #ffeef5, #fce4ec);
  color: #4a2040;
  border-radius: 18px 18px 6px 18px;
  box-shadow: 0 1px 4px rgba(252, 182, 159, 0.2);
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
  background: #fff !important;
  border-radius: 18px !important;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06) !important;
}

.sms-voice-bubble:hover {
  background: #f8f8f8 !important;
}

.sms-voice-bubble.playing {
  animation: voice-pulse 1.2s ease-in-out infinite;
}

@keyframes voice-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(255, 143, 171, 0.4);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(255, 143, 171, 0);
    transform: scale(1.02);
  }
}

.voice-icon {
  font-size: 1.3rem;
  flex-shrink: 0;
}

.sms-voice-bubble.playing .voice-icon {
  animation: none;
}

.voice-wave {
  font-family: var(--font-mono, monospace);
  font-size: 0.9rem;
  letter-spacing: 2px;
  opacity: 0.5;
  color: #ff8fab;
}

.sms-voice-bubble.playing .voice-wave {
  opacity: 1;
}

.voice-duration {
  font-size: 0.75rem;
  font-weight: 600;
  opacity: 0.6;
  color: #999;
}

.voice-hint {
  font-size: 0.6rem;
  opacity: 0.3;
  position: absolute;
  bottom: 2px;
  right: 8px;
  color: #bbb;
}

/* 语音文字引用 */
.voice-text-quote {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  background: #f8f8f8;
  border: 0.5px solid rgba(0, 0, 0, 0.06);
  margin-top: 4px;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 0.8rem;
  animation: quote-fade-in 0.25s ease;
  color: #555;
}

@keyframes quote-fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.voice-quote-icon {
  flex-shrink: 0;
  font-size: 0.7rem;
  opacity: 0.5;
}

.voice-quote-text {
  line-height: 1.5;
  word-break: break-word;
}

/* ===== 红包气泡 ===== */
.sms-redpacket-bubble {
  background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%) !important;
  padding: 0 !important;
  cursor: pointer;
  min-width: 220px;
  border-radius: 14px !important;
  box-shadow: 0 2px 12px rgba(231, 76, 60, 0.25) !important;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  overflow: hidden;
}

.sms-redpacket-bubble:hover:not(.opened) {
  transform: scale(1.02);
  box-shadow: 0 4px 20px rgba(231, 76, 60, 0.35) !important;
}

.sms-redpacket-bubble:active:not(.opened) {
  transform: scale(0.96);
}

.sms-redpacket-bubble.opened {
  opacity: 0.6;
  cursor: default;
  filter: grayscale(10%);
}

.redpacket-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  position: relative;
}

/* 金色分隔线 */
.redpacket-inner::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 16px;
  right: 16px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.4), transparent);
}

.redpacket-icon {
  font-size: 32px;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.sms-redpacket-bubble:hover:not(.opened) .redpacket-icon {
  animation: rp-icon-shake 0.6s ease-in-out infinite;
}

@keyframes rp-icon-shake {
  0%, 100% { transform: rotate(0deg) scale(1); }
  25% { transform: rotate(-8deg) scale(1.05); }
  75% { transform: rotate(8deg) scale(1.05); }
}

.redpacket-content {
  flex: 1;
  min-width: 0;
}

.redpacket-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  margin-bottom: 4px;
}

.redpacket-blessing {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.redpacket-hint {
  font-size: 11px;
  color: rgba(255, 215, 0, 0.7);
  margin-top: 3px;
  font-style: italic;
}

.redpacket-opened-tag {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 3px;
}

.redpacket-arrow {
  font-size: 22px;
  color: rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
  font-weight: 300;
  line-height: 1;
}

/* ===== 送礼卡片 ===== */
.sms-giftcard-bubble {
  background: linear-gradient(135deg, #fef9e7, #fdf0d5) !important;
  padding: 0 !important;
  min-width: 180px;
  border-radius: 14px !important;
  box-shadow: 0 2px 10px rgba(243, 156, 18, 0.12) !important;
  border: 1px solid rgba(243, 156, 18, 0.15) !important;
  overflow: hidden;
}

.giftcard-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  position: relative;
}

.giftcard-inner::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 16px;
  right: 16px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(243, 156, 18, 0.2), transparent);
}

.giftcard-icon-wrap {
  position: relative;
  flex-shrink: 0;
}

.giftcard-icon {
  font-size: 32px;
}

.giftcard-sparkle {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  background: radial-gradient(circle, #ffd700, transparent);
  border-radius: 50%;
  animation: sparkle 2s ease-in-out infinite;
}

.giftcard-content {
  flex: 1;
  min-width: 0;
}

.giftcard-header {
  display: flex;
  align-items: center;
  margin-bottom: 2px;
}

.giftcard-label {
  font-size: 11px;
  font-weight: 700;
  color: #e67e22;
  background: rgba(230, 126, 34, 0.1);
  padding: 1px 8px;
  border-radius: 6px;
  letter-spacing: 0.5px;
}

.giftcard-item {
  font-size: 13px;
  font-weight: 600;
  color: #4a3728;
}

/* ===== 回礼气泡 ===== */
.sms-giftreturn-bubble {
  background: linear-gradient(135deg, #fef9e7, #fdf0d5) !important;
  padding: 0 !important;
  min-width: 200px;
  border-radius: 14px !important;
  box-shadow: 0 2px 10px rgba(243, 156, 18, 0.12) !important;
  border: 1px solid rgba(243, 156, 18, 0.15) !important;
  overflow: hidden;
}

.giftreturn-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  position: relative;
}

.giftreturn-inner::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 16px;
  right: 16px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(243, 156, 18, 0.2), transparent);
}

.giftreturn-icon-wrap {
  position: relative;
  flex-shrink: 0;
}

.giftreturn-icon {
  font-size: 32px;
}

/* 闪光点动画 */
.giftreturn-sparkle {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  background: radial-gradient(circle, #ffd700, transparent);
  border-radius: 50%;
  animation: sparkle 2s ease-in-out infinite;
}

@keyframes sparkle {
  0%, 100% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.5); opacity: 0.8; }
}

.giftreturn-content {
  flex: 1;
  min-width: 0;
}

.giftreturn-header {
  display: flex;
  align-items: center;
  margin-bottom: 2px;
}

.giftreturn-label {
  font-size: 11px;
  font-weight: 700;
  color: #e67e22;
  background: rgba(230, 126, 34, 0.1);
  padding: 1px 8px;
  border-radius: 6px;
  letter-spacing: 0.5px;
}

.giftreturn-name {
  font-size: 12px;
  color: #8b7355;
  margin-bottom: 4px;
}

.giftreturn-item {
  font-size: 13px;
  font-weight: 600;
  color: #4a3728;
}

.giftreturn-message {
  font-size: 11px;
  color: #a08060;
  margin-top: 4px;
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 文件气泡 ===== */
.sms-file-bubble {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px !important;
  min-width: 160px;
  cursor: pointer;
  background: #fff !important;
  border-radius: 14px !important;
  border: 1px solid rgba(0, 0, 0, 0.06);
  transition: transform 0.15s ease;
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
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-bubble-hint {
  font-size: 11px;
  color: #bbb;
  margin-top: 3px;
}

/* ===== 表情包 ===== */
.sms-sticker-img {
  display: inline-block;
  max-width: 80px;
  max-height: 80px;
  vertical-align: bottom;
  border-radius: 8px;
}

/* 纯贴纸（无气泡，大图） */
.sms-sticker-img-large {
  display: block;
  max-width: 140px;
  max-height: 140px;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

/* ===== 加载动画 ===== */
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
  background: #ccc;
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
  background: #f5f5f5 !important;
}

.platform-android.android-portrait .sms-bubble.assistant {
  background: #fff !important;
  color: #333 !important;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08) !important;
}

.platform-android.android-portrait .sms-bubble.user {
  background: linear-gradient(135deg, #ffeef5, #fce4ec) !important;
  color: #4a2040 !important;
}

.platform-android.android-portrait .sms-time {
  color: #bbb !important;
  background: rgba(0,0,0,0.04) !important;
}

.platform-android.android-portrait .sms-voice-bubble {
  background: #fff !important;
}

.platform-android.android-portrait .sms-redpacket-bubble,
.platform-android.android-portrait .sms-giftreturn-bubble,
.platform-android.android-portrait .sms-giftcard-bubble {
  color: #fff !important;
}

.platform-android.android-portrait .redpacket-title {
  color: rgba(255, 255, 255, 0.95) !important;
}

.platform-android.android-portrait .redpacket-blessing {
  color: rgba(255, 255, 255, 0.7) !important;
}

.platform-android.android-portrait .redpacket-hint {
  color: rgba(255, 215, 0, 0.7) !important;
}

.platform-android.android-portrait .redpacket-arrow {
  color: rgba(255, 255, 255, 0.4) !important;
}

.platform-android.android-portrait .sms-file-bubble {
  background: #fff !important;
  border: 1px solid rgba(0,0,0,0.08) !important;
}

.platform-android.android-portrait .file-bubble-name {
  color: #333 !important;
}

.platform-android.android-portrait .file-bubble-hint {
  color: #bbb !important;
}

.platform-android.android-portrait .voice-text-quote {
  background: #f8f8f8 !important;
  border-color: rgba(0,0,0,0.06) !important;
  color: #555 !important;
}

.platform-android.android-portrait .phone-loading {
  color: #bbb !important;
}

.platform-android.android-portrait .loading-spinner {
  border-color: rgba(0,0,0,0.08) !important;
  border-top-color: #ff8fab !important;
}

.platform-android.android-portrait .typing-dot {
  background: #ccc !important;
}

.platform-android.android-portrait .sms-share-card-wrapper {
  max-width: 85%;
}

.platform-android.android-portrait .sms-archive-card-wrapper {
  max-width: 85%;
}

.platform-android.android-portrait .share-card-bubble {
  max-width: 100%;
  font-size: 1rem;
}

.platform-android.android-portrait .archive-card-bubble {
  max-width: 100%;
  font-size: 1rem;
}

/* 成就消息 */
.achievement-msg {
  justify-content: center !important;
}

.achievement-msg-content {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: linear-gradient(135deg, rgba(243,156,18,0.15), rgba(155,89,182,0.15));
  border: 1px solid rgba(243,156,18,0.3);
  border-radius: 16px;
  max-width: 90%;
  animation: achievement-glow 2s ease-in-out infinite alternate;
}

@keyframes achievement-glow {
  from { box-shadow: 0 0 8px rgba(243,156,18,0.2); }
  to { box-shadow: 0 0 16px rgba(243,156,18,0.4); }
}

.achievement-msg-icon {
  font-size: 1.5rem;
}

.achievement-msg-text {
  display: flex;
  flex-direction: column;
}

.achievement-msg-name {
  font-size: 0.82rem;
  font-weight: 700;
  color: #f39c12;
}

.achievement-msg-desc {
  font-size: 0.7rem;
  color: rgba(255,255,255,0.6);
  margin-top: 2px;
}
</style>
