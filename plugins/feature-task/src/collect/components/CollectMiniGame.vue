<script setup>
/**
 * 采集小游戏组件
 * 三种：反应力测试、记忆翻牌、精准判定
 */

import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  type: { type: String, default: 'reflex' },
})

const emit = defineEmits(['complete'])

// ===== 反应力测试 =====
const reflexBarPos = ref(50)
const reflexSpeed = ref(2)
const reflexHits = ref(0)
const reflexMaxHits = 3
const reflexRound = ref(0)
const reflexMaxRounds = 5
const reflexActive = ref(false)
const reflexGreenStart = ref(40)
const reflexGreenEnd = ref(60)
let reflexAnimId = null

function startReflex() {
  reflexHits.value = 0
  reflexRound.value = 0
  reflexSpeed.value = 1.5
  reflexActive.value = true
  animateReflexBar()
}

function animateReflexBar() {
  reflexBarPos.value += reflexSpeed.value
  if (reflexBarPos.value >= 100 || reflexBarPos.value <= 0) {
    reflexSpeed.value *= -1
  }
  reflexAnimId = requestAnimationFrame(animateReflexBar)
}

function onReflexTap() {
  if (!reflexActive.value) return
  const pos = reflexBarPos.value
  if (pos >= reflexGreenStart.value && pos <= reflexGreenEnd.value) {
    reflexHits.value++
    // 加速
    reflexSpeed.value *= 1.3
    reflexGreenStart.value = Math.max(10, reflexGreenStart.value - 5)
    reflexGreenEnd.value = Math.min(90, reflexGreenEnd.value + 5)

    if (reflexHits.value >= reflexMaxHits) {
      cancelAnimationFrame(reflexAnimId)
      reflexActive.value = false
      const bonus = {
        resource: {
          name: '稀有碎片',
          icon: '💎',
          points: 200,
          rarity: 'rare',
          id: `collect_reflex_${Date.now()}`,
        },
      }
      emit('complete', true, bonus)
    }
  } else {
    reflexRound.value++
    if (reflexRound.value >= reflexMaxRounds) {
      cancelAnimationFrame(reflexAnimId)
      reflexActive.value = false
      emit('complete', false, null)
    }
  }
}

function cleanupReflex() {
  if (reflexAnimId) cancelAnimationFrame(reflexAnimId)
}

// ===== 记忆翻牌 =====
const memoryCards = ref([])
const memoryFlipped = ref([])
const memoryMatched = ref([])
const memoryLocked = ref(false)
const memoryTimer = ref(15)
const memoryPhase = ref('showing') // showing → playing → done
let memoryTimerId = null

function initMemory() {
  const icons = ['🌿', '🍄', '🔮', '⚡', '💎', '🌟']
  const pairs = icons.flatMap((icon, i) => [
    { id: i * 2, icon, pairId: i },
    { id: i * 2 + 1, icon, pairId: i },
  ])
  memoryCards.value = pairs.sort(() => Math.random() - 0.5)
  memoryFlipped.value = []
  memoryMatched.value = []
  memoryLocked.value = false
  memoryTimer.value = 15
  memoryPhase.value = 'showing'

  // 展示2秒
  setTimeout(() => {
    memoryPhase.value = 'playing'
    memoryTimerId = setInterval(() => {
      memoryTimer.value--
      if (memoryTimer.value <= 0) {
        clearInterval(memoryTimerId)
        memoryPhase.value = 'done'
        const matched = memoryMatched.value.length
        if (matched >= 6) {
          const bonus = { resource: { name: '记忆宝藏', icon: '✨', points: 300, rarity: 'epic', id: `collect_memory_${Date.now()}` } }
          emit('complete', true, bonus)
        } else if (matched >= 3) {
          emit('complete', true, { extraExplores: 2 })
        } else {
          emit('complete', false, null)
        }
      }
    }, 1000)
  }, 2000)
}

function onMemoryCardClick(cardId) {
  if (memoryPhase.value !== 'playing' || memoryLocked.value) return
  if (memoryMatched.value.includes(memoryCards.value.find(c => c.id === cardId)?.pairId)) return

  const alreadyFlipped = memoryFlipped.value.includes(cardId)
  if (alreadyFlipped) return

  memoryFlipped.value.push(cardId)

  if (memoryFlipped.value.length === 2) {
    memoryLocked.value = true
    const [a, b] = memoryFlipped.value
    const cardA = memoryCards.value.find(c => c.id === a)
    const cardB = memoryCards.value.find(c => c.id === b)

    if (cardA.pairId === cardB.pairId) {
      memoryMatched.value.push(cardA.pairId)
      memoryFlipped.value = []
      memoryLocked.value = false

      if (memoryMatched.value.length >= 6) {
        clearInterval(memoryTimerId)
        memoryPhase.value = 'done'
        const bonus = { resource: { name: '记忆宝藏', icon: '✨', points: 300, rarity: 'epic', id: `collect_memory_${Date.now()}` } }
        emit('complete', true, bonus)
      }
    } else {
      setTimeout(() => {
        memoryFlipped.value = []
        memoryLocked.value = false
      }, 800)
    }
  }
}

function cleanupMemory() {
  if (memoryTimerId) clearInterval(memoryTimerId)
}

// ===== 精准判定 =====
const precisionNumber = ref(0)
const precisionSpeed = ref(50)
const precisionLuckyStart = ref(60)
const precisionLuckyEnd = ref(80)
const precisionHits = ref(0)
const precisionRounds = ref(0)
const precisionMaxRounds = 5
const precisionActive = ref(false)
let precisionAnimId = null

function startPrecision() {
  precisionHits.value = 0
  precisionRounds.value = 0
  precisionSpeed.value = 3
  precisionActive.value = true
  animatePrecision()
}

function animatePrecision() {
  precisionNumber.value += precisionSpeed.value
  if (precisionNumber.value >= 100) {
    precisionNumber.value -= 100
    precisionSpeed.value += 0.5
    precisionActive.value = false
    precisionAnimId = requestAnimationFrame(animatePrecision)
  } else {
    precisionAnimId = requestAnimationFrame(animatePrecision)
  }
}

function onPrecisionTap() {
  if (!precisionActive.value) return
  const num = Math.round(precisionNumber.value)
  if (num >= precisionLuckyStart.value && num <= precisionLuckyEnd.value) {
    precisionHits.value++
    precisionLuckyStart.value = Math.max(5, precisionLuckyStart.value - 5)
    precisionLuckyEnd.value = Math.min(95, precisionLuckyEnd.value + 5)

    if (precisionHits.value >= 3) {
      cancelAnimationFrame(precisionAnimId)
      precisionActive.value = false
      emit('complete', true, null)
    }
  } else {
    precisionRounds.value++
    if (precisionRounds.value >= precisionMaxRounds) {
      cancelAnimationFrame(precisionAnimId)
      precisionActive.value = false
      emit('complete', false, null)
    }
  }
}

function cleanupPrecision() {
  if (precisionAnimId) cancelAnimationFrame(precisionAnimId)
}

// ===== 生命周期 =====
onMounted(() => {
  if (props.type === 'reflex') startReflex()
  else if (props.type === 'memory') initMemory()
  else if (props.type === 'precision') startPrecision()
})

onUnmounted(() => {
  cleanupReflex()
  cleanupMemory()
  cleanupPrecision()
})

const typeLabel = { reflex: '⚡ 反应力测试', memory: '🧠 记忆翻牌', precision: '🎯 精准判定' }
</script>

<template>
  <div class="mini-game-overlay" @click.self="$emit('complete', false, null)">
    <div class="mini-game-panel">
      <header class="mini-game-header">
        <h3 class="mini-game-title">{{ typeLabel[type] || '❓ 特殊事件' }}</h3>
      </header>

      <!-- 反应力测试 -->
      <div v-if="type === 'reflex'" class="reflex-game">
        <p class="reflex-hint">在进度条进入绿色区域时点击！</p>
        <div class="reflex-bar-track">
          <div class="reflex-bar-green" :style="{ left: reflexGreenStart + '%', width: (reflexGreenEnd - reflexGreenStart) + '%' }"></div>
          <div class="reflex-bar-pointer" :style="{ left: reflexBarPos + '%' }">▼</div>
        </div>
        <div class="reflex-stats">
          <span>命中：{{ reflexHits }}/{{ reflexMaxHits }}</span>
          <span>失误：{{ reflexRound }}/{{ reflexMaxRounds }}</span>
        </div>
        <button type="button" class="reflex-tap-btn" @click="onReflexTap">
          点击！
        </button>
      </div>

      <!-- 记忆翻牌 -->
      <div v-if="type === 'memory'" class="memory-game">
        <p class="memory-hint">
          <span v-if="memoryPhase === 'showing'">记住这些卡片...（{{ memoryTimer }}）</span>
          <span v-else-if="memoryPhase === 'playing'">找出配对的卡片！剩余 {{ memoryTimer }} 秒</span>
          <span v-else>时间到！</span>
        </p>
        <div class="memory-grid">
          <div
            v-for="card in memoryCards"
            :key="card.id"
            class="memory-card"
            :class="{
              flipped: memoryFlipped.includes(card.id) || memoryMatched.includes(card.pairId),
              matched: memoryMatched.includes(card.pairId),
            }"
            @click="onMemoryCardClick(card.id)"
          >
            <span v-if="memoryFlipped.includes(card.id) || memoryMatched.includes(card.pairId)">{{ card.icon }}</span>
            <span v-else>?</span>
          </div>
        </div>
        <div class="memory-progress">配对：{{ memoryMatched.length }}/6</div>
      </div>

      <!-- 精准判定 -->
      <div v-if="type === 'precision'" class="precision-game">
        <p class="precision-hint">数字在 {{ precisionLuckyStart }}-{{ precisionLuckyEnd }} 之间时点击！</p>
        <div class="precision-number">
          {{ Math.round(precisionNumber) }}
        </div>
        <div class="precision-range">
          幸运区间：{{ precisionLuckyStart }} — {{ precisionLuckyEnd }}
        </div>
        <div class="precision-stats">
          <span>命中：{{ precisionHits }}/3</span>
          <span>失误：{{ precisionRounds }}/{{ precisionMaxRounds }}</span>
        </div>
        <button type="button" class="precision-tap-btn" @click="onPrecisionTap">
          锁定！
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mini-game-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  animation: overlay-fade 0.3s ease-out;
}
@keyframes overlay-fade { from { opacity: 0; } to { opacity: 1; } }

.mini-game-panel {
  width: 90%;
  max-width: 400px;
  background: rgba(15, 15, 30, 0.95);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
  animation: panel-pop 0.3s ease-out;
}
@keyframes panel-pop { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }

.mini-game-header {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}
.mini-game-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #fbbf24;
}

/* 反应力测试 */
.reflex-game { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.reflex-hint { font-size: 12px; color: rgba(255, 255, 255, 0.5); margin: 0; }

.reflex-bar-track {
  width: 100%;
  height: 24px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  position: relative;
  overflow: hidden;
}
.reflex-bar-green {
  position: absolute;
  height: 100%;
  background: rgba(34, 197, 94, 0.4);
  border-radius: 12px;
}
.reflex-bar-pointer {
  position: absolute;
  top: -4px;
  font-size: 14px;
  color: #fff;
  transform: translateX(-50%);
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
}

.reflex-stats { display: flex; gap: 16px; font-size: 11px; color: rgba(255, 255, 255, 0.6); }
.reflex-tap-btn {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.1s;
}
.reflex-tap-btn:active { transform: scale(0.95); }

/* 记忆翻牌 */
.memory-game { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.memory-hint { font-size: 12px; color: rgba(255, 255, 255, 0.5); margin: 0; }
.memory-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  width: 100%;
}
.memory-card {
  aspect-ratio: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}
.memory-card.flipped {
  background: rgba(96, 165, 250, 0.15);
  border-color: rgba(96, 165, 250, 0.3);
}
.memory-card.matched {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.4);
}
.memory-card:active { transform: scale(0.92); }
.memory-progress { font-size: 12px; color: #fbbf24; }

/* 精准判定 */
.precision-game { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.precision-hint { font-size: 12px; color: rgba(255, 255, 255, 0.5); margin: 0; }
.precision-number {
  font-size: 48px;
  font-weight: 900;
  color: #60a5fa;
  text-shadow: 0 0 20px rgba(96, 165, 250, 0.3);
  font-variant-numeric: tabular-nums;
}
.precision-range { font-size: 13px; color: #22c55e; font-weight: 600; }
.precision-stats { display: flex; gap: 16px; font-size: 11px; color: rgba(255, 255, 255, 0.6); }
.precision-tap-btn {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.1s;
}
.precision-tap-btn:active { transform: scale(0.95); }
</style>
