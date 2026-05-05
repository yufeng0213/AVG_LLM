<script setup>
/**
 * PhoneRedPacketModal.vue - 红包打开动画（优化版）
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

function handleOpen() {
  if (isOpening.value) return
  isOpening.value = true
}

async function doOpen() {
  const result = await props.onOpen?.()
  if (result?.success) {
    openedAmount.value = result.amount
    // 金币粒子
    coinParticles.value = Array.from({ length: 16 }, (_, i) => ({
      id: i,
      delay: Math.random() * 0.4,
      x: (Math.random() - 0.5) * 140,
      y: -40 - Math.random() * 80,
      rotation: Math.random() * 360,
      scale: 0.6 + Math.random() * 0.8,
    }))
    isOpened.value = true
  }
  setTimeout(() => {
    isOpening.value = false
  }, 2500)
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <div class="rp-overlay" @click.self="!isOpening && handleClose()">
    <!-- 未拆红包 -->
    <div v-if="!isOpened" class="rp-unopened" @click="handleOpen" @touchend.prevent="doOpen()">
      <div class="rp-envelope" :class="{ shaking: isOpening }">
        <!-- 装饰纹样 -->
        <div class="rp-deco rp-deco-top" />
        <div class="rp-deco rp-deco-bottom" />
        <div class="rp-gold-line" />

        <div class="rp-seal-wrap">
          <div class="rp-seal">
            <span class="rp-seal-text">開</span>
          </div>
        </div>

        <div class="rp-blessing">{{ redPacket.blessing }}</div>
        <div class="rp-sender">{{ redPacket.senderName }} 的红包</div>
      </div>
      <div class="rp-hint">长按拆开</div>
    </div>

    <!-- 已拆红包 -->
    <div v-else class="rp-opened">
      <div class="rp-opened-card">
        <!-- 光效 -->
        <div class="rp-glow" />

        <!-- 金币粒子 -->
        <div
          v-for="coin in coinParticles"
          :key="coin.id"
          class="rp-coin"
          :style="{
            '--coin-x': coin.x + 'px',
            '--coin-y': coin.y + 'px',
            '--coin-rotation': coin.rotation + 'deg',
            '--coin-delay': coin.delay + 's',
            '--coin-scale': coin.scale,
          }"
        >🪙</div>

        <div class="rp-opened-celebration">🎉</div>
        <div class="rp-opened-amount">
          <span class="rp-amount-num">{{ openedAmount.toFixed(2) }}</span>
          <span class="rp-amount-unit">元</span>
        </div>
        <div class="rp-opened-from">来自 {{ redPacket.senderName }}</div>
        <button type="button" class="rp-opened-close" @click="handleClose">好的</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10010;
  animation: rp-overlay-in 0.3s ease;
}

@keyframes rp-overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ===== 未拆红包 ===== */
.rp-unopened {
  cursor: pointer;
  user-select: none;
  animation: rp-envelope-float 0.5s ease;
}

@keyframes rp-envelope-float {
  from { opacity: 0; transform: scale(0.7) translateY(30px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.rp-envelope {
  width: 280px;
  aspect-ratio: 3 / 4;
  background: linear-gradient(180deg, #e8533e 0%, #c0392b 40%, #a93226 100%);
  border-radius: 18px;
  position: relative;
  overflow: hidden;
  box-shadow:
    0 16px 48px rgba(231, 76, 60, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease;
}

.rp-unopened:active .rp-envelope:not(.shaking) {
  transform: scale(0.97);
}

/* 装饰弧线 - 上半部分 */
.rp-deco {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  border-radius: 50%;
  border: 2px solid rgba(255, 215, 0, 0.2);
}

.rp-deco-top {
  top: -20%;
  width: 140%;
  height: 60%;
}

.rp-deco-bottom {
  bottom: -20%;
  width: 140%;
  height: 60%;
}

/* 金色分隔线 */
.rp-gold-line {
  position: absolute;
  top: 38%;
  left: 10%;
  right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.45), transparent);
}

/* 金色印章 */
.rp-seal-wrap {
  position: relative;
  z-index: 1;
  margin-bottom: 20px;
}

.rp-seal {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ffd700, #f0b830, #e6a817);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 4px 16px rgba(255, 215, 0, 0.35),
    inset 0 2px 0 rgba(255, 255, 255, 0.3);
}

.rp-seal-text {
  font-size: 30px;
  font-weight: 800;
  color: #c0392b;
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.2);
}

.rp-blessing {
  position: relative;
  z-index: 1;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.92);
  text-align: center;
  padding: 0 24px;
  margin-bottom: 10px;
  font-weight: 500;
}

.rp-sender {
  position: relative;
  z-index: 1;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
}

.rp-hint {
  text-align: center;
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
  margin-top: 14px;
}

/* 摇晃动画 */
@keyframes rp-envelope-shake {
  0%, 100% { transform: rotate(0) scale(1); }
  10% { transform: rotate(-4deg) scale(0.97); }
  20% { transform: rotate(4deg) scale(0.95); }
  30% { transform: rotate(-3deg) scale(0.97); }
  40% { transform: rotate(3deg) scale(0.98); }
  50% { transform: rotate(-2deg) scale(0.97); }
  60% { transform: rotate(2deg) scale(0.98); }
  70% { transform: rotate(-1deg) scale(0.99); }
}

.shaking {
  animation: rp-envelope-shake 0.6s ease;
}

/* ===== 已拆红包 ===== */
.rp-opened {
  animation: rp-overlay-in 0.3s ease;
}

.rp-opened-card {
  width: 280px;
  aspect-ratio: 3 / 4;
  background: linear-gradient(160deg, #f5c842 0%, #e6a817 30%, #d4941a 70%, #c07f16 100%);
  border-radius: 18px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 16px 48px rgba(243, 156, 18, 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* 放射光效 */
.rp-glow {
  position: absolute;
  top: 30%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, transparent 70%);
  border-radius: 50%;
  animation: rp-glow-pulse 2s ease-in-out infinite;
}

@keyframes rp-glow-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
  50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.9; }
}

/* 金币粒子 */
.rp-coin {
  position: absolute;
  font-size: 22px;
  left: 50%;
  top: 45%;
  transform-origin: center;
  animation: rp-coin-fly 1.2s ease-out var(--coin-delay) forwards;
  pointer-events: none;
}

@keyframes rp-coin-fly {
  0% {
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
  }
  10% {
    transform: translate(-50%, -50%) scale(var(--coin-scale));
    opacity: 1;
  }
  100% {
    transform: translate(calc(-50% + var(--coin-x)), calc(-50% + var(--coin-y))) rotate(var(--coin-rotation)) scale(var(--coin-scale));
    opacity: 0;
  }
}

/* 庆祝图标 */
.rp-opened-celebration {
  position: relative;
  z-index: 1;
  font-size: 52px;
  margin-bottom: 12px;
  animation: rp-celebration-pop 0.5s ease;
}

@keyframes rp-celebration-pop {
  0% { transform: scale(0) rotate(-20deg); opacity: 0; }
  50% { transform: scale(1.3) rotate(5deg); }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}

/* 金额 */
.rp-opened-amount {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 12px;
}

.rp-amount-num {
  font-size: 52px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  letter-spacing: -1px;
}

.rp-amount-unit {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
}

.rp-opened-from {
  position: relative;
  z-index: 1;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
  margin-bottom: 24px;
}

.rp-opened-close {
  position: relative;
  z-index: 1;
  padding: 10px 48px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 24px;
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  backdrop-filter: blur(4px);
  transition: background 0.15s ease;
}

.rp-opened-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

.rp-opened-close:active {
  transform: scale(0.95);
}
</style>
