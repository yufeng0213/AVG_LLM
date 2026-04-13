<template>
  <div class="red-packet-chat" @click="handleClick">
    <!-- 红包装饰线 -->
    <div class="red-packet-chat-accent"></div>

    <div class="red-packet-chat-body">
      <!-- 红包图标 -->
      <div class="red-packet-chat-icon" :class="{ 'is-opening': isAnimating }">
        <span class="packet-emoji">{{ packetIcon }}</span>
      </div>

      <!-- 红包信息 -->
      <div class="red-packet-chat-info">
        <p class="red-packet-chat-sender">{{ senderName }}</p>
        <p class="red-packet-chat-blessing">{{ packetBlessing }}</p>
      </div>

      <!-- 状态标签 -->
      <span v-if="!isOpened && !isReturned" class="red-packet-chat-badge unopened">
        <span class="badge-dot"></span>
        待领取
      </span>
      <span v-else-if="isReturned" class="red-packet-chat-badge returned">
        已退回
      </span>
      <span v-else class="red-packet-chat-badge opened">
        已领取
      </span>
    </div>
  </div>

  <!-- 红包开启弹窗 -->
  <Teleport to="body">
    <Transition name="red-packet-modal">
      <div v-if="showModal" class="red-packet-modal-overlay" @click.self="closeModal">
        <div class="red-packet-modal-content">
          <!-- 关闭按钮 -->
          <button type="button" class="modal-close-btn" @click="closeModal">×</button>

          <!-- 红包动画区域 -->
          <div class="red-packet-animation-area">
            <Transition name="packet-open" @after-enter="onAnimationComplete">
              <div v-if="!animationFinished" class="packet-closed-state">
                <div class="packet-closed-icon">
                  <span class="rp-big-emoji">{{ packetIcon }}</span>
                </div>
                <p class="packet-hint">点击打开红包</p>
                <button type="button" class="open-packet-btn" @click="openPacket">
                  开红包
                </button>
              </div>

              <div v-else class="packet-opened-state">
                <div class="opened-icon">
                  <span class="big-emoji">💰</span>
                </div>
                <div class="amount-display">
                  <span class="currency-symbol">¥</span>
                  <span class="amount-value">{{ displayAmount }}</span>
                </div>
                <p class="blessing-text">{{ packetBlessing }}</p>
                <p class="sender-text">来自 {{ senderName }}</p>
              </div>
            </Transition>
          </div>

          <!-- 金币飞散效果 -->
          <div v-if="showCoinEffect" class="coin-effect-container">
            <div v-for="coin in coins" :key="coin.id" class="flying-coin" :style="coin.style"></div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref } from 'vue'
import { getRedPacketTypeIcon, getRedPacketTypeLabel } from '../redPacketService.js'

const props = defineProps({
  packet: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['opened', 'click'])

// 状态管理
const showModal = ref(false)
const isAnimating = ref(false)
const animationFinished = ref(false)
const showCoinEffect = ref(false)

// 金币动画
const coins = ref([])

// 计算属性
const packetIcon = computed(() => {
  return getRedPacketTypeIcon(props.packet.type)
})

const senderName = computed(() => {
  return props.packet.senderName || '匿名'
})

const packetBlessing = computed(() => {
  return props.packet.blessing || '恭喜发财，大吉大利！'
})

const isOpened = computed(() => {
  return props.packet.isOpened
})

const isReturned = computed(() => {
  return props.packet.isReturned
})

const displayAmount = computed(() => {
  return props.packet.amount.toFixed(2)
})

// 点击处理
function handleClick() {
  if (!isOpened.value) {
    showModal.value = true
    animationFinished.value = false
    emit('click', props.packet)
  } else {
    showModal.value = true
    animationFinished.value = true
  }
}

// 打开红包
function openPacket() {
  isAnimating.value = true
  emit('opened', props.packet)

  setTimeout(() => {
    animationFinished.value = true
    isAnimating.value = false
    showCoinEffect.value = true

    generateCoinAnimation()

    setTimeout(() => {
      showCoinEffect.value = false
    }, 1500)
  }, 600)
}

// 生成金币动画
function generateCoinAnimation() {
  const coinCount = 12
  coins.value = []

  for (let i = 0; i < coinCount; i++) {
    const angle = (i / coinCount) * 360
    const distance = 80 + Math.random() * 60
    const delay = Math.random() * 200

    coins.value.push({
      id: i,
      style: {
        '--angle': `${angle}deg`,
        '--distance': `${distance}px`,
        '--delay': `${delay}ms`,
      },
    })
  }
}

function onAnimationComplete() {}

function closeModal() {
  showModal.value = false
  animationFinished.value = false
  showCoinEffect.value = false
  coins.value = []
}
</script>

<style scoped>
/* ===== 聊天内红包卡片 - iOS16 暗色风格 ===== */
.red-packet-chat {
  position: relative;
  display: flex;
  align-items: stretch;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  max-width: 85%;
  align-self: flex-start;
  background: linear-gradient(135deg,
    rgba(220, 60, 60, 0.25) 0%,
    rgba(180, 40, 50, 0.18) 40%,
    rgba(160, 35, 45, 0.12) 100%
  );
  border: 1px solid rgba(220, 60, 60, 0.2);
  box-shadow:
    0 2px 8px rgba(220, 60, 60, 0.12),
    0 4px 16px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* 左侧红色装饰线 */
.red-packet-chat-accent {
  width: 3px;
  flex-shrink: 0;
  background: linear-gradient(180deg, #ff4757, #c0392b, #ff6b6b);
  box-shadow: 0 0 8px rgba(255, 71, 87, 0.4);
}

.red-packet-chat:hover {
  transform: translateY(-1px);
  background: linear-gradient(135deg,
    rgba(220, 60, 60, 0.32) 0%,
    rgba(180, 40, 50, 0.24) 40%,
    rgba(160, 35, 45, 0.16) 100%
  );
  border-color: rgba(220, 60, 60, 0.3);
  box-shadow:
    0 4px 12px rgba(220, 60, 60, 0.2),
    0 8px 24px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.red-packet-chat:active {
  transform: translateY(0) scale(0.98);
}

/* 红包主体 */
.red-packet-chat-body {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px 12px 12px;
  flex: 1;
  min-width: 0;
}

/* 红包图标 */
.red-packet-chat-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: linear-gradient(135deg, rgba(255, 71, 87, 0.2), rgba(192, 57, 43, 0.15));
  border-radius: 12px;
  border: 1px solid rgba(255, 71, 87, 0.15);
}

.red-packet-chat-icon.is-opening {
  animation: packetShake 0.6s ease-in-out;
}

@keyframes packetShake {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-8deg); }
  75% { transform: rotate(8deg); }
}

.packet-emoji {
  font-size: 22px;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
}

/* 红包信息 */
.red-packet-chat-info {
  flex: 1;
  min-width: 0;
}

.red-packet-chat-sender {
  font-size: 0.82rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  margin: 0 0 3px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.red-packet-chat-blessing {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.45);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 状态标签 */
.red-packet-chat-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.65rem;
  font-weight: 600;
  flex-shrink: 0;
  letter-spacing: 0.02em;
}

.red-packet-chat-badge.unopened {
  color: #ffd700;
  background: rgba(255, 215, 0, 0.12);
  border: 1px solid rgba(255, 215, 0, 0.2);
  animation: badgePulse 2s ease-in-out infinite;
}

.badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ffd700;
  box-shadow: 0 0 4px rgba(255, 215, 0, 0.6);
}

@keyframes badgePulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.65; }
}

.red-packet-chat-badge.opened {
  color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.red-packet-chat-badge.returned {
  color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  text-decoration: line-through;
}
</style>

<!-- 弹窗样式（Teleport 到 body，需要非 scoped） -->
<style>
.red-packet-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.red-packet-modal-content {
  position: relative;
  width: 300px;
  min-height: 380px;
  background: linear-gradient(180deg, #d63031 0%, #c0392b 60%, #a93226 100%);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}

.red-packet-modal-content::before {
  content: '';
  position: absolute;
  top: 6px;
  left: 6px;
  right: 6px;
  bottom: 6px;
  border: 1.5px solid rgba(255, 215, 0, 0.35);
  border-radius: 16px;
  pointer-events: none;
}

.modal-close-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 30px;
  height: 30px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.7);
  font-size: 18px;
  cursor: pointer;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  line-height: 1;
}

.modal-close-btn:hover {
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
}

.red-packet-animation-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 380px;
  padding: 40px 20px;
}

.packet-closed-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

.packet-closed-icon {
  animation: rp-float 2s ease-in-out infinite;
}

@keyframes rp-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.rp-big-emoji {
  font-size: 72px;
  line-height: 1;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));
}

.packet-hint {
  color: rgba(255, 255, 255, 0.75);
  font-size: 13px;
  margin: 0;
}

.open-packet-btn {
  padding: 12px 44px;
  background: linear-gradient(135deg, #ffd700 0%, #f0c040 100%);
  border: none;
  border-radius: 24px;
  color: #a93226;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(255, 215, 0, 0.35);
  transition: all 0.25s ease;
}

.open-packet-btn:hover {
  transform: scale(1.04);
  box-shadow: 0 6px 20px rgba(255, 215, 0, 0.45);
}

.open-packet-btn:active {
  transform: scale(0.97);
}

.packet-opened-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  animation: rp-fadeInUp 0.5s ease-out;
}

@keyframes rp-fadeInUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.opened-icon {
  animation: rp-bounce 0.6s ease-out;
}

@keyframes rp-bounce {
  0% { transform: scale(0); }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

.amount-display {
  display: flex;
  align-items: baseline;
  color: #ffd700;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.currency-symbol {
  font-size: 24px;
  font-weight: 600;
}

.amount-value {
  font-size: 48px;
  font-weight: 700;
  margin-left: 3px;
}

.blessing-text {
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  margin: 0;
  text-align: center;
}

.sender-text {
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  margin: 0;
}

.coin-effect-container {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  pointer-events: none;
}

.flying-coin {
  position: absolute;
  width: 22px;
  height: 22px;
  background: radial-gradient(circle at 30% 30%, #ffd700, #f39c12);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  animation: rp-flyOut 1s ease-out forwards;
  animation-delay: var(--delay);
}

.flying-coin::after {
  content: '¥';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 11px;
  font-weight: 700;
  color: #a93226;
}

@keyframes rp-flyOut {
  0% { transform: translate(0, 0) scale(0); opacity: 0; }
  20% { transform: translate(0, 0) scale(1); opacity: 1; }
  100% {
    transform:
      translate(calc(cos(var(--angle)) * var(--distance)), calc(sin(var(--angle)) * var(--distance)))
      scale(0.5);
    opacity: 0;
  }
}

.red-packet-modal-enter-active,
.red-packet-modal-leave-active {
  transition: opacity 0.3s ease;
}

.red-packet-modal-enter-from,
.red-packet-modal-leave-to {
  opacity: 0;
}

.red-packet-modal-enter-active .red-packet-modal-content {
  animation: rp-modalSlideIn 0.4s ease-out;
}

@keyframes rp-modalSlideIn {
  from { opacity: 0; transform: scale(0.85) translateY(30px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.packet-open-enter-active {
  animation: rp-packetOpen 0.6s ease-out;
}

@keyframes rp-packetOpen {
  0% { transform: scale(1); }
  50% { transform: scale(1.08); }
  100% { transform: scale(1); }
}

.platform-android.android-portrait .modal-close-btn {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  font-size: 1.2rem !important;
}
</style>
