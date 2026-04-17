<script setup>
/**
 * ShopScreen.vue - 全屏全局商店界面
 * 使用全局经济/背包，商品包含通用物品 + 随机世界书剧情道具。
 * 支持下拉刷新（移动端触摸手势）。
 */
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { useGlobalShop } from './composables/useGlobalShop.js'

const emit = defineEmits(['back'])

const shop = useGlobalShop()

// 初始化商品
onMounted(() => {
  const filteredValue = shop.shopFilteredItems.value
  if (!filteredValue || filteredValue.length === 0) {
    shop.initShopItems()
  }
  nextTick(() => {
    attachPullListeners()
  })
})

onBeforeUnmount(() => {
  removePullListeners()
})

const handleClose = () => {
  emit('back')
}

// 下拉刷新
const PULL_DEADZONE = 5
const PULL_THRESHOLD = 60
const MAX_PULL = 120

const pullContainerEl = ref(null)
const pullState = ref({ pulling: false, pulled: false, distance: 0 })
let pullStartY = 0
let touchId = null
let listenersAttached = false

function onTouchStart(e) {
  if (shop.isShopRefreshing.value) return
  const container = pullContainerEl.value
  if (!container) return
  if (container.scrollTop > 0) return

  pullStartY = e.touches[0].clientY
  touchId = e.touches[0].identifier
  pullState.value = { pulling: true, pulled: false, distance: 0 }
}

function onTouchMove(e) {
  if (!pullState.value.pulling) return

  let touch = null
  for (let i = 0; i < e.touches.length; i++) {
    if (e.touches[i].identifier === touchId) {
      touch = e.touches[i]
      break
    }
  }
  if (!touch) return

  const deltaY = touch.clientY - pullStartY

  if (deltaY < PULL_DEADZONE) return

  e.preventDefault()

  const clamped = Math.min(deltaY, MAX_PULL)
  pullState.value.distance = clamped
  pullState.value.pulled = clamped >= PULL_THRESHOLD
}

function onTouchEnd(e) {
  if (!pullState.value.pulling) return
  pullState.value.pulling = false

  if (pullState.value.distance >= PULL_DEADZONE) {
    e.preventDefault()
    if (pullState.value.pulled) {
      shop.handleRefreshShopItems()
    }
  }
  pullState.value.distance = 0
  pullState.value.pulled = false
  touchId = null
}

function attachPullListeners() {
  const el = pullContainerEl.value
  if (!el || listenersAttached) return

  el.addEventListener('touchstart', onTouchStart, { passive: true })
  el.addEventListener('touchmove', onTouchMove, { passive: false })
  el.addEventListener('touchend', onTouchEnd, { passive: false })
  listenersAttached = true
}

function removePullListeners() {
  const el = pullContainerEl.value
  if (!el) return
  el.removeEventListener('touchstart', onTouchStart)
  el.removeEventListener('touchmove', onTouchMove)
  el.removeEventListener('touchend', onTouchEnd)
  listenersAttached = false
}

function onRefreshComplete() {
  pullState.value = { pulling: false, pulled: false, distance: 0 }
}

watch(() => shop.isShopRefreshing.value, (val) => {
  if (!val) onRefreshComplete()
})

// 反馈 Toast
const feedbackToast = ref({ visible: false, message: '' })
let feedbackTimer = null

watch(() => shop.shopPurchaseFeedback.value, (val) => {
  if (!val) return
  feedbackToast.value = { visible: true, message: val }
  clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => {
    feedbackToast.value.visible = false
  }, 3000)
})

// 下拉指示器
const pullIndicatorStyle = computed(() => {
  const d = pullState.value.distance
  if (d <= 0) return { display: 'none' }
  return {
    display: 'flex',
    height: `${d}px`,
    opacity: Math.min(d / PULL_THRESHOLD, 1),
  }
})

const pullIndicatorText = computed(() => {
  if (shop.isShopRefreshing.value) return '刷新中...'
  return pullState.value.pulled ? '松开刷新' : '下拉刷新'
})
</script>

<template>
  <div class="shop-screen">
    <!-- 顶部 -->
    <header class="shop-header">
      <button type="button" class="shop-back-btn" @click="handleClose">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="shop-title">🛒 全局商店</h2>
      <div class="shop-economy">
        <span class="economy-chip">💰 {{ shop.activeBookEconomyCoins.value }}</span>
        <span class="economy-chip">💎 {{ shop.activeBookEconomyCrystals.value }}</span>
      </div>
    </header>

    <!-- 分类 -->
    <nav class="shop-categories">
      <button
        v-for="cat in shop.DORM_SHOP_CATEGORIES"
        :key="cat.id"
        type="button"
        class="shop-cat-btn"
        :class="{ active: shop.shopSelectedCategory.value === cat.id }"
        @click="shop.handleSelectShopCategory(cat.id)"
      >
        {{ cat.label }}
      </button>
    </nav>

    <!-- 操作栏 -->
    <div class="shop-toolbar">
      <button
        type="button"
        class="shop-refresh-btn"
        :disabled="shop.isShopRefreshing.value"
        @click="shop.handleRefreshShopItems"
      >
        {{ shop.isShopRefreshing.value ? '刷新中...' : '🔄 刷新商品' }}
      </button>
      <span v-if="shop.shopPurchaseFeedback.value" class="shop-feedback">{{ shop.shopPurchaseFeedback.value }}</span>
    </div>

    <!-- 商品区域（支持下拉刷新） -->
    <div ref="pullContainerEl" class="shop-scroll-area">
      <!-- 下拉指示器 -->
      <div class="pull-indicator" :style="pullIndicatorStyle">
        <span class="pull-text">{{ pullIndicatorText }}</span>
      </div>

      <div class="shop-grid">
        <div
          v-for="(item, idx) in shop.shopFilteredItems.value"
          :key="item?.id || (item?.name ? `name_${item.name}` : `idx_${idx}`)"
          class="shop-card"
        >
          <span class="shop-item-icon">{{ item?.icon || '📦' }}</span>
          <span class="shop-item-name">{{ item?.name || '未知商品' }}</span>
          <span v-if="item?.scope === 'book' && item?.bookTitle" class="shop-book-tag">
            《{{ item.bookTitle }}》专属
          </span>
          <span v-else-if="item?.scope === 'book'" class="shop-book-tag">剧情道具</span>
          <span class="shop-item-desc">{{ item?.description || item?.categoryLabel || '' }}</span>
          <div class="shop-item-footer">
            <span class="shop-price">💰 {{ item?.price ?? '?' }}</span>
            <button
              type="button"
              class="shop-buy-btn"
              :disabled="!shop.canAffordShopItem(item)"
              :class="{ disabled: !shop.canAffordShopItem(item) }"
              @click="shop.handleBuyShopItem(item)"
            >
              购买
            </button>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!shop.shopFilteredItems.value || shop.shopFilteredItems.value.length === 0" class="shop-empty">
        <p>暂无商品</p>
        <p class="shop-empty-hint">点击"刷新商品"获取新商品</p>
      </div>
    </div>
  </div>

  <!-- 反馈 Toast -->
  <Teleport to="body">
    <transition name="toast-fade">
      <div v-if="feedbackToast.visible" class="shop-feedback-toast">
        {{ feedbackToast.message }}
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.shop-screen {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  background: var(--shop-bg, #0a0a1a);
  color: var(--shop-text-primary, #ffffff);
  overflow: hidden;
}

.shop-scroll-area {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: var(--shop-bg, #0a1628);
}

.pull-indicator {
  display: none;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: height 0.1s ease;
}

.pull-text {
  font-size: 0.78rem;
  color: var(--shop-gold-dim, rgba(255, 215, 0, 0.6));
}

/* Header */
.shop-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--shop-header-bg, rgba(0,0,0,0.3));
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--shop-gold-border, rgba(255, 215, 0, 0.1));
}

.shop-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--shop-text-secondary, rgba(255, 255, 255, 0.7));
  width: 40px;
  height: 40px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.shop-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: var(--shop-text-primary, #fff); }

.shop-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--shop-gold, #ffd700);
  text-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
  flex: 1;
  text-align: center;
}

.shop-economy {
  display: flex;
  gap: 8px;
}

.economy-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--shop-gold-dim, rgba(255, 215, 0, 0.1));
  border: 1px solid var(--shop-gold-border, rgba(255, 215, 0, 0.2));
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--shop-gold, #ffd700);
}

/* Categories */
.shop-categories {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  overflow-x: auto;
  border-bottom: 1px solid var(--shop-border, rgba(255, 255, 255, 0.06));
  background: var(--shop-header-bg, rgba(26, 10, 46, 0.95));
}

.shop-cat-btn {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  padding: 6px 16px;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
}

.shop-cat-btn.active {
  background: var(--shop-gold-dim, rgba(255, 215, 0, 0.1));
  border-color: var(--shop-gold-border, rgba(255, 215, 0, 0.3));
  color: var(--shop-gold, #ffd700);
}

.shop-cat-btn:hover:not(.active) {
  background: rgba(255, 255, 255, 0.06);
  color: var(--shop-text-primary, #fff);
}

/* Toolbar */
.shop-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--shop-bg, #0a1628);
}

.shop-refresh-btn {
  appearance: none;
  border: 1px solid var(--shop-gold-border, rgba(255, 215, 0, 0.25));
  border-radius: 10px;
  padding: 8px 16px;
  background: var(--shop-gold-dim, rgba(255, 215, 0, 0.08));
  color: var(--shop-gold, #ffd700);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.shop-refresh-btn:hover:not(:disabled) {
  background: rgba(255, 215, 0, 0.15);
}

.shop-refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.shop-feedback {
  font-size: 0.78rem;
  color: var(--shop-text-secondary, rgba(255, 255, 255, 0.55));
}

/* Grid */
.shop-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
  min-height: 0;
  flex: 1;
  align-content: flex-start;
}

.shop-card {
  width: calc((100% - 24px) / 2);
  min-width: 150px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 12px;
  border-radius: 14px;
  border: 1px solid var(--shop-gold-border, rgba(255, 215, 0, 0.12));
  background: var(--shop-card-bg, rgba(255,215,0,0.05));
  text-align: center;
  height: 220px;
}

.shop-item-icon {
  font-size: 2rem;
}

.shop-item-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--shop-text-primary, rgba(255, 255, 255, 0.9));
}

.shop-book-tag {
  font-size: 0.68rem;
  color: rgba(255, 140, 0, 0.7);
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 140, 0, 0.08);
}

.shop-item-desc {
  font-size: 0.75rem;
  color: var(--shop-text-secondary, rgba(255, 255, 255, 0.4));
  line-height: 1.4;
}

.shop-item-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.shop-price {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--shop-gold, #ffd700);
}

.shop-buy-btn {
  appearance: none;
  border: 1px solid var(--shop-gold-border, rgba(255, 215, 0, 0.25));
  border-radius: 8px;
  padding: 4px 14px;
  background: var(--shop-gold-dim, rgba(255, 215, 0, 0.1));
  color: var(--shop-gold, #ffd700);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.shop-buy-btn:hover:not(.disabled) {
  background: rgba(255, 215, 0, 0.2);
}

.shop-buy-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Empty */
.shop-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--shop-text-secondary, rgba(255, 255, 255, 0.35));
  font-size: 0.9rem;
}

.shop-empty-hint {
  margin-top: 6px;
  font-size: 0.78rem;
  color: var(--shop-text-secondary, rgba(255, 255, 255, 0.2));
}

/* Toast */
.shop-feedback-toast {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10001;
  padding: 10px 20px;
  border-radius: 12px;
  background: var(--shop-header-bg, rgba(26, 10, 46, 0.92));
  border: 1px solid var(--shop-gold-border, rgba(255, 215, 0, 0.2));
  color: var(--shop-gold, #ffd700);
  font-size: 0.82rem;
  max-width: 80vw;
  text-align: center;
  backdrop-filter: blur(8px);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

.platform-android.android-portrait .shop-back-btn,
.platform-android.android-portrait .shop-refresh-btn,
.platform-android.android-portrait .shop-cat-btn {
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
