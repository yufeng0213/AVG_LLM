<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useCardCollection } from '../composables/useCardCollection.js'
import { useCardPool } from '../composables/useCardPool.js'
import { usePlayerState } from '../../../../src/stores/playerState.store.js'

const emit = defineEmits(['back'])

const playerState = usePlayerState()
const collection = useCardCollection()
const pool = useCardPool({
  getCrystals: () => playerState.economy?.crystals ?? 0,
  updateCrystals: (val) => {
    playerState.updateEconomy((prev) => ({ ...prev, crystals: Math.max(0, val) }))
  },
})

// 解包 ref，确保模板中能正常使用
const poolCards = computed(() => pool.poolCards.value || [])
const highRarityCards = computed(() => poolCards.value.filter(c => c.rarity === 'SSR' || c.rarity === 'UR'))
const pullCount = computed(() => pool.pullCount.value || 0)
const pityGuaranteed = computed(() => pool.pityGuaranteed.value || false)
const pullHistory = computed(() => pool.pullHistory.value || [])
const pityProgress = computed(() => pool.pityProgress.value || 0)
const remainingToPity = computed(() => pool.remainingToPity.value ?? 60)
const canAffordSingle = computed(() => pool.canAffordSingle.value ?? false)
const canAffordTen = computed(() => pool.canAffordTen.value ?? false)
const PULL_COST = pool.PULL_COST
const PULL_10_COST = pool.PULL_10_COST

// 状态
const isPulling = ref(false)
const pullResults = ref([]) // 当前抽卡结果
const showResults = ref(false)
const showSingleResult = ref(false)
const singleResult = ref(null)
const pullMode = ref('single') // 'single' or 'ten'
const skipAnimation = ref(false)

// 单抽结果动画
const singleRevealStage = ref('hidden') // hidden -> reveal -> done

async function doSinglePull() {
  if (isPulling.value) return
  isPulling.value = true
  pullMode.value = 'single'

  const result = await pool.pullSingle()
  if (!result.success) {
    alert(result.error)
    isPulling.value = false
    return
  }

  pullResults.value = result.results
  singleResult.value = result.results[0]

  // 添加卡牌到收藏
  await collection.addCard(singleResult.value.cardDef.id)

  // 显示单抽动画
  showSingleResult.value = true
  singleRevealStage.value = 'hidden'
  await nextTick()
  setTimeout(() => { singleRevealStage.value = 'reveal' }, 100)
  setTimeout(() => { singleRevealStage.value = 'done' }, 800)
}

async function doTenPull() {
  if (isPulling.value) return
  isPulling.value = true
  pullMode.value = 'ten'

  const result = await pool.pullTen()
  if (!result.success) {
    alert(result.error)
    isPulling.value = false
    return
  }

  pullResults.value = result.results

  // 批量添加到收藏
  for (const r of result.results) {
    await collection.addCard(r.cardDef.id)
  }

  showResults.value = true
}

function closeResults() {
  showResults.value = false
  pullResults.value = []
  isPulling.value = false
}

function closeSingleResult() {
  showSingleResult.value = false
  singleResult.value = null
  singleRevealStage.value = 'hidden'
  isPulling.value = false
}

// 调试：添加钻石
function addCrystalsDebug(amount = 10000) {
  updateEconomy((prev) => ({ ...prev, crystals: prev.crystals + amount }))
}

function getRarityColorDirect(rarity) {
  const colors = { N: '#9ca3af', R: '#ffffff', SR: '#3b82f6', SSR: '#f59e0b', UR: '#a855f7' }
  return colors[rarity] || '#9ca3af'
}

onMounted(async () => {
  await Promise.all([collection.load(), pool.load()])
})
</script>

<template>
  <div class="card-pool-screen">
    <!-- 顶部返回 -->
    <header class="pool-header">
      <button class="pool-back-btn" @click="emit('back')">
        <span>←</span> 返回
      </button>
      <h2 class="pool-title">卡池</h2>
      <div class="pool-economy">
        <span class="eco-crystal">💎 {{ economy.crystals }}</span>
        <button class="debug-add-btn" @click="addCrystalsDebug(10000)">+💎</button>
      </div>
    </header>

    <!-- 卡池展示 -->
    <section class="pool-display" v-if="!isPulling">
      <div class="pool-banner">
        <div class="banner-glow"></div>
        <div class="banner-content">
          <h3 class="banner-name">命运召唤</h3>
          <p class="banner-desc">每一次相遇都是命中注定</p>
          <div class="banner-rates">
            <span class="rate-item" :style="{ color: '#a855f7' }">UR {{ 1.5 }}%</span>
            <span class="rate-item" :style="{ color: '#f59e0b' }">SSR {{ 5.5 }}%</span>
            <span class="rate-item" :style="{ color: '#3b82f6' }">SR {{ 18 }}%</span>
            <span class="rate-item" :style="{ color: '#ffffff' }">R {{ 35 }}%</span>
            <span class="rate-item" :style="{ color: '#9ca3af' }">N {{ 40 }}%</span>
          </div>
        </div>
      </div>

      <!-- 保底进度 -->
      <div class="pity-bar">
        <div class="pity-info">
          <span class="pity-label">保底进度</span>
          <span class="pity-value">{{ pullCount }} / 60</span>
          <span class="pity-remaining" v-if="remainingToPity > 0">
            距离保底还有 {{ remainingToPity }} 抽
          </span>
          <span class="pity-remaining pity-ready" v-else>
            下次必出SSR+！
          </span>
        </div>
        <div class="pity-progress-track">
          <div class="pity-progress-fill" :style="{ width: pityProgress + '%' }"></div>
        </div>
      </div>

      <!-- UP卡牌预览 -->
      <div class="pool-preview">
        <h4 class="preview-title">卡池预览</h4>
        <div class="preview-cards">
          <div
            v-for="card in highRarityCards"
            :key="card.id"
            class="preview-card"
            :style="{ borderColor: getRarityColorDirect(card.rarity) }"
          >
            <div class="preview-rarity" :style="{ color: getRarityColorDirect(card.rarity) }">
              {{ card.rarity }}
            </div>
            <div class="preview-name">{{ card.name }}</div>
            <div class="preview-char">{{ card.characterName }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 抽卡按钮 -->
    <footer class="pool-actions" v-if="!isPulling">
      <button
        class="pull-btn single-btn"
        :disabled="!canAffordSingle"
        @click="doSinglePull"
      >
        <div class="pull-btn-content">
          <span class="pull-label">单次召唤</span>
          <span class="pull-cost">💎 {{ PULL_COST }}</span>
        </div>
      </button>
      <button
        class="pull-btn ten-btn"
        :disabled="!canAffordTen"
        @click="doTenPull"
      >
        <div class="pull-btn-content">
          <span class="pull-label">10连召唤</span>
          <span class="pull-cost">💎 {{ PULL_10_COST }}</span>
        </div>
      </button>
    </footer>

    <!-- 单抽结果动画 -->
    <Teleport to="body" v-if="showSingleResult && singleResult">
      <div class="pull-overlay" :class="{ 'visible': singleRevealStage !== 'hidden' }">
        <div class="single-reveal" :class="singleRevealStage">
          <div class="reveal-card" :style="{ borderColor: getRarityColorDirect(singleResult.cardDef.rarity) }">
            <div class="reveal-rarity" :style="{ color: getRarityColorDirect(singleResult.cardDef.rarity) }">
              {{ singleResult.cardDef.rarity }}
            </div>
            <div class="reveal-name">{{ singleResult.cardDef.name }}</div>
            <div class="reveal-character">{{ singleResult.cardDef.characterName }}</div>
            <div v-if="singleResult.isPity" class="reveal-badge pity-badge">保底出奇迹！</div>
            <div v-else class="reveal-badge new-badge">NEW</div>
          </div>
        </div>
        <button class="overlay-close-btn" @click="closeSingleResult">继续</button>
      </div>
    </Teleport>

    <!-- 10连结果 -->
    <Teleport to="body" v-if="showResults">
      <div class="pull-overlay visible">
        <div class="ten-results">
          <h3 class="ten-results-title">召唤结果</h3>
          <div class="ten-results-grid">
            <div
              v-for="(result, i) in pullResults"
              :key="i"
              class="ten-result-card"
              :style="{ borderColor: getRarityColorDirect(result.cardDef.rarity) }"
              :class="{ 'is-rare': result.cardDef.rarity === 'SSR' || result.cardDef.rarity === 'UR' }"
            >
              <div class="ten-result-rarity" :style="{ color: getRarityColorDirect(result.cardDef.rarity) }">
                {{ result.cardDef.rarity }}
              </div>
              <div class="ten-result-name">{{ result.cardDef.name }}</div>
              <div class="ten-result-character">{{ result.cardDef.characterName }}</div>
            </div>
          </div>
        </div>
        <button class="overlay-close-btn" @click="closeResults">确认</button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.card-pool-screen {
  min-height: 100vh;
  background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
  color: #fff;
  display: flex;
  flex-direction: column;
}

.pool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
}

.pool-back-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 8px;
  transition: background 0.2s;
}

.pool-back-btn:hover { background: rgba(255, 255, 255, 0.1); }

.pool-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}

.pool-economy {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
}

.debug-add-btn {
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #22c55e;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.debug-add-btn:hover { background: rgba(34, 197, 94, 0.3); }

/* 卡池展示 */
.pool-display {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.pool-banner {
  position: relative;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(245, 158, 11, 0.1));
  border: 1px solid rgba(168, 85, 247, 0.3);
  border-radius: 16px;
  padding: 32px 24px;
  text-align: center;
  overflow: hidden;
}

.banner-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(168, 85, 247, 0.3), transparent 70%);
  animation: glow-pulse 3s ease-in-out infinite;
}

@keyframes glow-pulse {
  0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.2); }
}

.banner-name {
  font-size: 28px;
  font-weight: 800;
  margin: 0 0 8px;
  background: linear-gradient(90deg, #a855f7, #f59e0b);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.banner-desc {
  margin: 0 0 16px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
}

.banner-rates {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.rate-item {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.3);
}

/* 保底进度 */
.pity-bar {
  margin-top: 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  padding: 12px 16px;
}

.pity-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.pity-label { font-size: 13px; color: rgba(255, 255, 255, 0.6); }
.pity-value { font-size: 14px; font-weight: 700; }

.pity-remaining {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.pity-ready { color: #f59e0b !important; font-weight: 600; }

.pity-progress-track {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.pity-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #a855f7, #f59e0b);
  border-radius: 3px;
  transition: width 0.5s ease;
}

/* 卡池预览 */
.pool-preview { margin-top: 20px; }

.preview-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 10px;
}

.preview-cards {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.preview-card {
  flex-shrink: 0;
  width: 120px;
  background: rgba(0, 0, 0, 0.3);
  border: 2px solid;
  border-radius: 10px;
  padding: 12px 8px;
  text-align: center;
}

.preview-rarity {
  font-size: 16px;
  font-weight: 800;
  margin-bottom: 4px;
}

.preview-name {
  font-size: 12px;
  margin-bottom: 2px;
}

.preview-char {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
}

/* 抽卡按钮 */
.pool-actions {
  display: flex;
  gap: 12px;
  padding: 16px;
}

.pull-btn {
  flex: 1;
  border: none;
  border-radius: 14px;
  padding: 16px;
  cursor: pointer;
  transition: transform 0.15s, filter 0.15s;
}

.pull-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pull-btn:not(:disabled):hover { transform: translateY(-2px); }
.pull-btn:not(:disabled):active { transform: scale(0.98); }

.single-btn {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
}

.ten-btn {
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  color: #fff;
}

.pull-btn-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.pull-label { font-size: 16px; font-weight: 700; }
.pull-cost { font-size: 13px; opacity: 0.8; }

/* 抽卡结果遮罩 */
.pull-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.pull-overlay.visible {
  opacity: 1;
  pointer-events: auto;
}

/* 单抽展示 */
.single-reveal {
  perspective: 800px;
}

.reveal-card {
  background: rgba(0, 0, 0, 0.6);
  border: 3px solid;
  border-radius: 16px;
  padding: 40px 30px;
  text-align: center;
  min-width: 260px;
  opacity: 0;
  transform: scale(0.3) rotateY(180deg);
  transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.single-reveal.reveal .reveal-card {
  opacity: 1;
  transform: scale(1) rotateY(0);
}

.single-reveal.done .reveal-card {
  opacity: 1;
  transform: scale(1);
}

.reveal-rarity {
  font-size: 32px;
  font-weight: 900;
  margin-bottom: 8px;
  text-shadow: 0 0 20px currentColor;
}

.reveal-name {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}

.reveal-character {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 16px;
}

.reveal-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
}

.new-badge { background: #22c55e; }
.pity-badge { background: #f59e0b; }

/* 10连结果 */
.ten-results {
  width: 100%;
  max-width: 600px;
  padding: 16px;
}

.ten-results-title {
  text-align: center;
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
}

.ten-results-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.ten-result-card {
  background: rgba(0, 0, 0, 0.4);
  border: 2px solid;
  border-radius: 8px;
  padding: 10px 6px;
  text-align: center;
  transition: transform 0.2s;
}

.ten-result-card:hover { transform: scale(1.05); }

.ten-result-card.is-rare {
  animation: rare-glow 2s ease-in-out infinite;
}

@keyframes rare-glow {
  0%, 100% { box-shadow: 0 0 8px currentColor; }
  50% { box-shadow: 0 0 20px currentColor; }
}

.ten-result-rarity {
  font-size: 14px;
  font-weight: 800;
  margin-bottom: 4px;
}

.ten-result-name {
  font-size: 11px;
  margin-bottom: 2px;
}

.ten-result-character {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
}

.overlay-close-btn {
  margin-top: 20px;
  padding: 12px 40px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s;
}

.overlay-close-btn:hover { transform: scale(1.05); }

@media (max-width: 480px) {
  .ten-results-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}


  /* Android 刘海屏适配 */
.platform-android.android-portrait .pool-header {
  padding-top: max(12px, var(--safe-area-inset-top, 12px));
  padding-left: 14px;
  padding-right: 14px;
}

.platform-android.android-portrait .pool-title {
  font-size: 1.1rem;
}

.platform-android.android-portrait .pull-btn,
  .platform-android.android-portrait .pool-back-btn,
  .platform-android.android-portrait .overlay-close-btn,
  .platform-android.android-portrait .debug-add-btn {
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
