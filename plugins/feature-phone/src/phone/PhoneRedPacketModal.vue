<script setup>
/**
 * PhoneRedPacketModal.vue - 红包打开动画
 */
import { ref } from 'vue'

const props = defineProps({
  redPacket: { type: Object, required: true },
})

const emit = defineEmits(['opened', 'close'])

const isOpening = ref(false)
const isOpened = ref(false)
const openedAmount = ref(0)
const coinParticles = ref([])

async function handleOpen() {
  if (isOpening.value) return
  isOpening.value = true

  const result = await props.onOpen?.()
  if (result?.success) {
    openedAmount.value = result.amount
    // 生成金币粒子动画
    coinParticles.value = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      delay: Math.random() * 0.3,
      x: (Math.random() - 0.5) * 100,
      y: -30 - Math.random() * 60,
      rotation: Math.random() * 360,
    }))
    isOpened.value = true
  }

  setTimeout(() => {
    isOpening.value = false
  }, 2000)
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <div class="redpacket-overlay" @click.self="!isOpening && handleClose()">
    <div class="redpacket-modal">
      <!-- 未打开状态 -->
      <div v-if="!isOpened" class="redpacket-unopened" @click="handleOpen">
        <div class="redpacket-envelope">
          <div class="redpacket-seal">
            <span class="seal-text">開</span>
          </div>
          <div class="redpacket-blessing">{{ redPacket.blessing }}</div>
          <div class="redpacket-sender">{{ redPacket.senderName }} 的红包</div>
        </div>
        <div class="redpacket-hint">点击拆开</div>
      </div>

      <!-- 已打开状态 -->
      <div v-else class="redpacket-opened">
        <div class="redpacket-opened-inner">
          <!-- 金币粒子 -->
          <div
            v-for="coin in coinParticles"
            :key="coin.id"
            class="coin-particle"
            :style="{
              '--coin-x': coin.x + 'px',
              '--coin-y': coin.y + 'px',
              '--coin-rotation': coin.rotation + 'deg',
              '--coin-delay': coin.delay + 's',
            }"
          >🪙</div>

          <div class="opened-icon">🎉</div>
          <div class="opened-amount">
            <span class="amount-num">{{ openedAmount.toFixed(2) }}</span>
            <span class="amount-unit">元</span>
          </div>
          <div class="opened-from">来自 {{ redPacket.senderName }}</div>
          <button type="button" class="opened-close-btn" @click="handleClose">好的</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.redpacket-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.redpacket-modal {
  width: 300px;
  max-width: 90vw;
}

/* ===== 未打开 ===== */
.redpacket-unopened {
  cursor: pointer;
  user-select: none;
}

.redpacket-envelope {
  width: 100%;
  aspect-ratio: 3 / 4;
  background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
  border-radius: 16px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(231, 76, 60, 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* 金色装饰圈 */
.redpacket-envelope::before {
  content: '';
  position: absolute;
  top: 15%;
  left: 50%;
  transform: translateX(-50%);
  width: 80px;
  height: 80px;
  border: 3px solid rgba(255, 215, 0, 0.5);
  border-radius: 50%;
}

.redpacket-seal {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffd700, #f0c040);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  box-shadow: 0 4px 12px rgba(255, 215, 0, 0.3);
}

.seal-text {
  font-size: 28px;
  font-weight: 700;
  color: #c0392b;
}

.redpacket-blessing {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
  padding: 0 20px;
  margin-bottom: 12px;
}

.redpacket-sender {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.redpacket-hint {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  margin-top: 16px;
}

/* 点击抖动动画 */
.redpacket-unopened:active .redpacket-envelope {
  animation: rp-shake 0.3s ease;
}

@keyframes rp-shake {
  0%, 100% { transform: rotate(0); }
  25% { transform: rotate(-3deg) scale(0.98); }
  50% { transform: rotate(3deg) scale(0.96); }
  75% { transform: rotate(-2deg) scale(0.98); }
}

/* ===== 已打开 ===== */
.redpacket-opened {
  position: relative;
}

.redpacket-opened-inner {
  width: 100%;
  aspect-ratio: 3 / 4;
  background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
  border-radius: 16px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(243, 156, 18, 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.opened-icon {
  font-size: 48px;
  margin-bottom: 16px;
  animation: rp-pop 0.5s ease;
}

.opened-amount {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 16px;
}

.amount-num {
  font-size: 48px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.amount-unit {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.8);
}

.opened-from {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 24px;
}

.opened-close-btn {
  padding: 10px 40px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 24px;
  color: #fff;
  font-size: 15px;
  cursor: pointer;
}

@keyframes rp-pop {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

/* 金币粒子 */
.coin-particle {
  position: absolute;
  font-size: 20px;
  left: 50%;
  top: 50%;
  animation: coin-fly 1s ease-out var(--coin-delay) forwards;
  pointer-events: none;
}

@keyframes coin-fly {
  0% {
    transform: translate(0, 0) rotate(0);
    opacity: 1;
  }
  100% {
    transform: translate(var(--coin-x), var(--coin-y)) rotate(var(--coin-rotation));
    opacity: 0;
  }
}
</style>
