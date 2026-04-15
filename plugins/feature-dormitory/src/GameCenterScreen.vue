<script setup>
/**
 * GameCenterScreen.vue - 游戏厅选择中心
 */

import { ref, shallowRef, watch } from 'vue'
import SlotMachineScreen from './games/SlotMachineScreen.vue'
import GachaScreen from './games/GachaScreen.vue'
import PachinkoScreen from './games/PachinkoScreen.vue'
import FarmScreen from './FarmScreen.vue'
import DogRaceScreen from './DogRaceScreen.vue'
import KitchenScreen from './games/KitchenScreen.vue'
import XylophoneScreen from './games/XylophoneScreen.vue'
import HarmonicaScreen from './games/HarmonicaScreen.vue'
import Match3Screen from './games/Match3Screen.vue'

const emit = defineEmits([
  'back',
  'spin-result', 'gacha-result', 'pachinko-result', 'farm-harvest',
  'dograce-result', 'kitchen-result', 'kitchen-consume', 'kitchen-produce',
  'xylophone-result', 'harmonica-result', 'match3-result', 'game-skin-buy',
])

const props = defineProps({
  coins: { type: Number, default: 0 },
  inventory: { type: Array, default: () => [] },
})

// ====== 游戏定义 ======
const GAME_CATEGORIES = [
  {
    id: 'arcade',
    label: '📂 经典街机',
    games: [
      { key: 'slot', icon: '🎰', name: '老虎机', entryFee: 5 },
      { key: 'gacha', icon: '🎁', name: '扭蛋机' },
      { key: 'pachinko', icon: '🎯', name: '弹珠台', entryFee: 3 },
      { key: 'farm', icon: '🌾', name: '农场' },
      { key: 'dog-race', icon: '🐕', name: '赛狗' },
    ],
  },
  {
    id: 'interactive',
    label: '🎨 互动娱乐',
    games: [
      { key: 'kitchen', icon: '🍳', name: '厨房' },
      { key: 'xylophone', icon: '🎵', name: '木琴' },
      { key: 'harmonica', icon: '🎶', name: '口琴' },
      { key: 'match3', icon: '💎', name: '三消' },
    ],
  },
]

const allGames = GAME_CATEGORIES.flatMap(c => c.games)
const gameMap = {}
for (const g of allGames) gameMap[g.key] = g

// ====== 状态 ======
const activeGame = ref(null) // null = 显示选择网格, 'slot'/'gacha'/... = 当前游戏
const gameRef = shallowRef(null) // 当前游戏的 ref

// 进入/退出游戏
function launchGame(key) {
  const game = gameMap[key]
  if (!game) return
  if (game.entryFee && props.coins < game.entryFee) return
  activeGame.value = key
  // SlotMachine 每日首次免费
  if (key === 'slot') {
    // 挂载后调用 useDailyFree
    setTimeout(() => {
      gameRef.value?.useDailyFree?.()
    }, 50)
  }
}

function backToCenter() {
  // 保存游戏状态
  if (gameRef.value?.saveStats) gameRef.value.saveStats()
  if (gameRef.value?.saveState) gameRef.value.saveState()
  activeGame.value = null
  gameRef.value = null
}

// 结果事件统一转发
function emitResult(event, data) {
  emit(event, data)
}

// 按钮是否可点击
function canPlay(game) {
  if (!game.entryFee) return true
  return props.coins >= game.entryFee
}

// 动态游戏组件
const activeComponent = ref(null)

watch(activeGame, (key) => {
  const components = {
    slot: SlotMachineScreen,
    gacha: GachaScreen,
    pachinko: PachinkoScreen,
    farm: FarmScreen,
    'dog-race': DogRaceScreen,
    kitchen: KitchenScreen,
    xylophone: XylophoneScreen,
    harmonica: HarmonicaScreen,
    match3: Match3Screen,
  }
  activeComponent.value = key ? components[key] : null
})
</script>

<template>
  <div class="game-center-screen">
    <!-- 选择网格 -->
    <template v-if="!activeGame">
      <header class="game-center-header">
        <button type="button" class="game-center-back-btn" @click="emit('back')">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h2 class="game-center-title">🎮 游戏厅</h2>
        <div class="game-center-coin-box">
          <span class="game-center-coin-icon">💰</span>
          <span class="game-center-coin-value">{{ coins }}</span>
        </div>
      </header>

      <div class="game-center-content">
        <div v-for="cat in GAME_CATEGORIES" :key="cat.id" class="game-category">
          <div class="category-title">{{ cat.label }}</div>
          <div class="game-grid">
            <div
              v-for="game in cat.games"
              :key="game.key"
              class="game-card"
              :class="{ 'card-disabled': !canPlay(game) }"
              @click="launchGame(game.key)"
            >
              <div class="game-card-icon">{{ game.icon }}</div>
              <div class="game-card-name">{{ game.name }}</div>
              <div v-if="game.entryFee" class="game-card-fee">
                {{ canPlay(game) ? game.entryFee + '💰' : '💰不足' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 游戏画面 -->
    <template v-else>
      <!-- 老虎机 -->
      <SlotMachineScreen
        v-if="activeGame === 'slot'"
        ref="gameRef"
        :coins="coins"
        @back="backToCenter"
        @spin-result="emitResult('spin-result', $event)"
        @game-skin-buy="emitResult('game-skin-buy', $event)"
      />
      <!-- 扭蛋机 -->
      <GachaScreen
        v-if="activeGame === 'gacha'"
        ref="gameRef"
        :coins="coins"
        :inventory="inventory"
        @back="backToCenter"
        @gacha-result="emitResult('gacha-result', $event)"
        @game-skin-buy="emitResult('game-skin-buy', $event)"
      />
      <!-- 弹珠台 -->
      <PachinkoScreen
        v-if="activeGame === 'pachinko'"
        ref="gameRef"
        :coins="coins"
        @back="backToCenter"
        @pachinko-result="emitResult('pachinko-result', $event)"
        @game-skin-buy="emitResult('game-skin-buy', $event)"
      />
      <!-- 农场 -->
      <FarmScreen
        v-if="activeGame === 'farm'"
        ref="gameRef"
        :coins="coins"
        @back="backToCenter"
        @farm-harvest="emitResult('farm-harvest', $event)"
      />
      <!-- 赛狗 -->
      <DogRaceScreen
        v-if="activeGame === 'dog-race'"
        ref="gameRef"
        :coins="coins"
        @back="backToCenter"
        @dograce-result="emitResult('dograce-result', $event)"
      />
      <!-- 厨房 -->
      <KitchenScreen
        v-if="activeGame === 'kitchen'"
        ref="gameRef"
        :coins="coins"
        :inventory="inventory"
        @back="backToCenter"
        @kitchen-result="emitResult('kitchen-result', $event)"
        @kitchen-consume="emitResult('kitchen-consume', $event)"
        @kitchen-produce="emitResult('kitchen-produce', $event)"
        @game-skin-buy="emitResult('game-skin-buy', $event)"
      />
      <!-- 木琴 -->
      <XylophoneScreen
        v-if="activeGame === 'xylophone'"
        :coins="coins"
        @back="backToCenter"
        @xylophone-result="emitResult('xylophone-result', $event)"
      />
      <!-- 口琴 -->
      <HarmonicaScreen
        v-if="activeGame === 'harmonica'"
        :coins="coins"
        @back="backToCenter"
        @harmonica-result="emitResult('harmonica-result', $event)"
      />
      <!-- 三消 -->
      <Match3Screen
        v-if="activeGame === 'match3'"
        :coins="coins"
        @back="backToCenter"
        @match3-result="emitResult('match3-result', $event)"
      />
    </template>
  </div>
</template>

<style scoped>
.game-center-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10000;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Header */
.game-center-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(180deg, #1a0a2e 0%, rgba(26,10,46,0.95) 100%);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 215, 0, 0.1);
  gap: 10px;
}

.game-center-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  width: 40px;
  height: 40px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.game-center-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
  .platform-android.android-portrait .game-center-back-btn {
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
.game-center-title {
  flex: 1;
  text-align: center;
  margin: 0;
  color: #ffd700;
  font-size: 17px;
  font-weight: 600;
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
}

.game-center-coin-box {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 10px;
  padding: 6px 12px;
}
.game-center-coin-value { color: #ffd700; font-size: 15px; font-weight: 700; min-width: 30px; text-align: right; }

/* Content */
.game-center-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  background: linear-gradient(180deg, rgba(15,26,46,0.95) 0%, #0a1628 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.game-category {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.category-title {
  font-size: 14px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.6);
  padding-left: 4px;
}

.game-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.game-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: linear-gradient(135deg, rgba(255,215,0,0.05), rgba(255,140,0,0.03));
  border: 1px solid rgba(255, 215, 0, 0.12);
  border-radius: 14px;
  padding: 16px 8px 12px;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 100px;
  justify-content: center;
}
.game-card:hover:not(.card-disabled) {
  border-color: rgba(255, 215, 0, 0.35);
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.15);
  transform: translateY(-2px);
}

.card-disabled {
  opacity: 0.4;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.game-card-icon {
  font-size: 36px;
  line-height: 1;
}

.game-card-name {
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.8);
  text-align: center;
}

.game-card-fee {
  font-size: 11px;
  font-weight: 600;
  color: #ffd700;
}
.card-disabled .game-card-fee {
  color: #ff6b6b;
}
</style>
