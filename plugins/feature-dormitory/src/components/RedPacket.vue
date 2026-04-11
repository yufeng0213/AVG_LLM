<template>
  <div class="red-packet-container" @click="handleClick">
    <!-- 红包图标 -->
    <div class="red-packet-icon" :class="{ 'is-opening': isAnimating }">
      <span class="packet-emoji">{{ packetIcon }}</span>
    </div>
    
    <!-- 红包信息 -->
    <div class="red-packet-info">
      <p class="red-packet-sender">{{ senderName }}</p>
      <p class="red-packet-blessing">{{ packetBlessing }}</p>
    </div>
    
    <!-- 状态指示器 -->
    <div class="red-packet-status">
      <span v-if="isOpened" class="status-opened">已领取</span>
      <span v-else class="status-unopened">点击领取</span>
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
                  <span class="big-emoji">{{ packetIcon }}</span>
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
    // 已开启的红包也可以点击查看
    showModal.value = true
    animationFinished.value = true
  }
}

// 打开红包
function openPacket() {
  isAnimating.value = true
  emit('opened', props.packet)
  
  // 延迟显示结果
  setTimeout(() => {
    animationFinished.value = true
    isAnimating.value = false
    showCoinEffect.value = true
    
    // 生成金币动画
    generateCoinAnimation()
    
    // 隐藏金币效果
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

// 动画完成
function onAnimationComplete() {
  // 可以在这里添加额外的动画完成逻辑
}

// 关闭弹窗
function closeModal() {
  showModal.value = false
  animationFinished.value = false
  showCoinEffect.value = false
  coins.value = []
}
</script>

<style scoped>
/* 红包容器 */
.red-packet-container {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin: 8px 0;
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 50%, #d63031 100%);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(214, 48, 49, 0.3);
  position: relative;
  overflow: hidden;
}

.red-packet-container::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
  animation: shimmer 3s infinite;
}

@keyframes shimmer {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.red-packet-container:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(214, 48, 49, 0.4);
}

.red-packet-container:active {
  transform: translateY(0);
}

/* 红包图标 */
.red-packet-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.red-packet-icon.is-opening {
  animation: packetShake 0.6s ease-in-out;
}

@keyframes packetShake {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-10deg); }
  75% { transform: rotate(10deg); }
}

.packet-emoji {
  font-size: 32px;
  line-height: 1;
}

/* 红包信息 */
.red-packet-info {
  flex: 1;
  min-width: 0;
}

.red-packet-sender {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 4px 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.red-packet-blessing {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 状态指示器 */
.red-packet-status {
  flex-shrink: 0;
}

.status-opened {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.15);
  padding: 4px 8px;
  border-radius: 10px;
}

.status-unopened {
  font-size: 11px;
  color: #fff;
  background: rgba(255, 215, 0, 0.3);
  padding: 4px 8px;
  border-radius: 10px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* 弹窗样式 */
.red-packet-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.red-packet-modal-content {
  position: relative;
  width: 320px;
  min-height: 400px;
  background: linear-gradient(180deg, #ff4757 0%, #c0392b 100%);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

/* 装饰边框 */
.red-packet-modal-content::before {
  content: '';
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  bottom: 8px;
  border: 2px solid rgba(255, 215, 0, 0.5);
  border-radius: 18px;
  pointer-events: none;
}

.modal-close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  background: rgba(0, 0, 0, 0.3);
  border: none;
  border-radius: 50%;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.modal-close-btn:hover {
  background: rgba(0, 0, 0, 0.5);
}

/* 动画区域 */
.red-packet-animation-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 40px 20px;
}

/* 未开启状态 */
.packet-closed-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.packet-closed-icon {
  animation: float 2s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.big-emoji {
  font-size: 80px;
  line-height: 1;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
}

.packet-hint {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  margin: 0;
}

.open-packet-btn {
  padding: 14px 48px;
  background: linear-gradient(135deg, #ffd700 0%, #ffb347 100%);
  border: none;
  border-radius: 30px;
  color: #c0392b;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
  transition: all 0.3s ease;
}

.open-packet-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 20px rgba(255, 215, 0, 0.5);
}

.open-packet-btn:active {
  transform: scale(0.98);
}

/* 已开启状态 */
.packet-opened-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  animation: fadeInUp 0.5s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.opened-icon {
  animation: bounce 0.6s ease-out;
}

@keyframes bounce {
  0% { transform: scale(0); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.amount-display {
  display: flex;
  align-items: baseline;
  color: #ffd700;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.currency-symbol {
  font-size: 28px;
  font-weight: 600;
}

.amount-value {
  font-size: 56px;
  font-weight: 700;
  margin-left: 4px;
}

.blessing-text {
  color: rgba(255, 255, 255, 0.95);
  font-size: 16px;
  margin: 0;
  text-align: center;
}

.sender-text {
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  margin: 0;
}

/* 金币飞散效果 */
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
  width: 24px;
  height: 24px;
  background: radial-gradient(circle at 30% 30%, #ffd700, #f39c12);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  animation: flyOut 1s ease-out forwards;
  animation-delay: var(--delay);
}

.flying-coin::after {
  content: '¥';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  font-weight: 700;
  color: #c0392b;
}

@keyframes flyOut {
  0% {
    transform: translate(0, 0) scale(0);
    opacity: 0;
  }
  20% {
    transform: translate(0, 0) scale(1);
    opacity: 1;
  }
  100% {
    transform: 
      translate(
        calc(cos(var(--angle)) * var(--distance)),
        calc(sin(var(--angle)) * var(--distance))
      )
      scale(0.5);
    opacity: 0;
  }
}

/* 弹窗过渡动画 */
.red-packet-modal-enter-active,
.red-packet-modal-leave-active {
  transition: opacity 0.3s ease;
}

.red-packet-modal-enter-from,
.red-packet-modal-leave-to {
  opacity: 0;
}

.red-packet-modal-enter-active .red-packet-modal-content {
  animation: modalSlideIn 0.4s ease-out;
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: scale(0.8) translateY(40px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* 红包开启过渡动画 */
.packet-open-enter-active {
  animation: packetOpen 0.6s ease-out;
}

@keyframes packetOpen {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
}

/* Android竖屏适配 */
.platform-android.android-portrait .modal-close-btn {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  font-size: 1.2rem !important;
  flex-shrink: 0 !important;
  box-sizing: border-box !important;
}
</style>
