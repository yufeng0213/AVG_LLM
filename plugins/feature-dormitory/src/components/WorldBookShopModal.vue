<script setup>
/**
 * 世界书商店模态框组件
 * 显示商店面板和购买选项
 */
import { computed, ref, watch, nextTick } from 'vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  activeBookEconomyCoins: {
    type: Number,
    default: 0
  },
  activeBookEconomyCrystals: {
    type: Number,
    default: 0
  },
  shopItems: {
    type: Array,
    default: () => []
  },
  selectedCategory: {
    type: String,
    default: 'all'
  },
  categories: {
    type: Array,
    default: () => []
  },
  isRefreshing: {
    type: Boolean,
    default: false
  },
  purchaseFeedback: {
    type: String,
    default: ''
  }
})

const safeShopItems = computed(() => {
  const items = props.shopItems
  return Array.isArray(items) ? items.filter(Boolean) : []
})

const emit = defineEmits([
  'close',
  'select-category',
  'refresh-items',
  'buy-item'
])

// 气泡提示
const feedbackToast = ref({ visible: false, message: '' })
let feedbackTimer = null

// 下拉刷新 — 用组件 ref 代替 DOM query
const PULL_DEADZONE = 5
const PULL_THRESHOLD = 60
const MAX_PULL = 120

const pullState = ref({ pulling: false, pulled: false, distance: 0 })
const pullContainerEl = ref(null)
let pullStartY = 0
let touchId = null
let listenersAttached = false

function onTouchStart(e) {
  if (props.isRefreshing) return
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

  // 死区内不拦截，click 正常工作
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
      handleRefresh()
    }
  }
  pullState.value.distance = 0
  pullState.value.pulled = false
  touchId = null
}

function attachPullListeners() {
  const el = pullContainerEl.value
  if (!el) {
    console.warn('[ShopModal] attachPullListeners: container ref is null')
    return
  }
  if (listenersAttached) return // 防止重复绑定

  el.addEventListener('touchstart', onTouchStart, { passive: true })
  el.addEventListener('touchmove', onTouchMove, { passive: false })
  el.addEventListener('touchend', onTouchEnd, { passive: false })
  listenersAttached = true
  console.log('[ShopModal] pull listeners attached')
}

function removePullListeners() {
  const el = pullContainerEl.value
  if (!el) return
  el.removeEventListener('touchstart', onTouchStart)
  el.removeEventListener('touchmove', onTouchMove)
  el.removeEventListener('touchend', onTouchEnd)
  listenersAttached = false
  console.log('[ShopModal] pull listeners removed')
}

function showFeedbackToast(message) {
  if (!message) return
  feedbackToast.value = { visible: true, message }
  clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => {
    feedbackToast.value.visible = false
  }, 3000)
}

watch(() => props.purchaseFeedback, (val) => {
  if (val) showFeedbackToast(val)
})

function onRefreshComplete() {
  pullState.value = { pulling: false, pulled: false, distance: 0 }
}

watch(() => props.isRefreshing, (val) => {
  if (!val) onRefreshComplete()
})

function handleRefresh() {
  if (props.isRefreshing) return
  emit('refresh-items')
}

watch(() => props.isOpen, (val) => {
  if (val) {
    nextTick(() => {
      attachPullListeners()
    })
  } else {
    removePullListeners()
    onRefreshComplete()
  }
})

function handleClose() {
  emit('close')
}

function handleSelectCategory(categoryId) {
  emit('select-category', categoryId)
}

function handleBuyItem(item) {
  emit('buy-item', item)
}

function canAfford(item) {
  return props.activeBookEconomyCoins >= item.price
}
</script>

<template>
  <Teleport to="body">
    <Transition name="shop-modal">
      <div v-if="isOpen" class="worldbook-shop-overlay" @click.self="handleClose">
        <section class="worldbook-shop-panel">
          <header class="worldbook-shop-header">
            <h2 class="worldbook-shop-title">🏪 世界书商店</h2>
            <div class="worldbook-shop-coins">
              <span class="shop-coin-item">💰 {{ activeBookEconomyCoins }}</span>
              <span class="shop-coin-item">💎 {{ activeBookEconomyCrystals }}</span>
            </div>
            <button type="button" class="worldbook-shop-close" @click="handleClose">×</button>
          </header>

          <div
            ref="pullContainerEl"
            class="worldbook-shop-body"
          >
            <!-- 分类Tab -->
            <div class="shop-tab-bar">
              <button
                v-for="cat in categories"
                :key="cat.id"
                type="button"
                class="shop-tab-item"
                :class="{ active: selectedCategory === cat.id }"
                @click="handleSelectCategory(cat.id)"
              >
                <span class="tab-icon">{{ cat.icon }}</span>
                <span class="tab-label">{{ cat.label }}</span>
                <span class="tab-indicator"></span>
              </button>
            </div>

            <!-- 刷新中转圈提示 -->
            <div v-if="isRefreshing" class="shop-refresh-spinner">
              <span class="spinner-icon"></span>
              <span class="spinner-text">正在采购新商品…</span>
            </div>

            <!-- 商品列表 -->
            <div class="worldbook-shop-items">
              <div v-if="safeShopItems.length === 0" class="worldbook-shop-empty">
                暂无商品，请尝试刷新。
              </div>
              <div v-else class="worldbook-shop-item-grid">
                <button
                  v-for="item in safeShopItems"
                  :key="item?.id || item?.name || Math.random()"
                  type="button"
                  class="worldbook-shop-item"
                  :class="{ affordable: canAfford(item), unaffordable: !canAfford(item) }"
                  :disabled="!canAfford(item)"
                  @click="canAfford(item) && handleBuyItem(item)"
                >
                  <!-- 价格标签贴纸 -->
                  <div class="item-price-tag">
                    <span class="price-tag-icon">💰</span>
                    <span class="price-tag-value">{{ item.price }}</span>
                  </div>
                  <!-- 左侧商品图标 -->
                  <div class="item-icon-col">
                    <span class="item-icon">{{ item.icon }}</span>
                  </div>
                  <!-- 右侧信息 -->
                  <div class="item-info-col">
                    <h3 class="item-name">{{ item.name }}</h3>
                    <p class="item-desc">{{ item.description }}</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Transition>

    <!-- 购买反馈 Toast -->
    <Transition name="shop-toast">
      <div v-if="feedbackToast.visible" class="shop-toast-overlay">
        <div class="shop-toast-bubble">
          {{ feedbackToast.message }}
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.shop-modal-enter-active,
.shop-modal-leave-active {
  transition: opacity 0.3s ease;
}

.shop-modal-enter-from,
.shop-modal-leave-to {
  opacity: 0;
}

.worldbook-shop-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--background, #0a0a0a);
  color: var(--foreground, #ffffff);
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.worldbook-shop-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.worldbook-shop-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.worldbook-shop-title {
  margin: 0;
  font-size: 18px;
  color: var(--foreground, #ffffff);
}

.worldbook-shop-coins {
  flex: 1;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.shop-coin-item {
  font-size: 14px;
  color: color-mix(in srgb, var(--foreground, #ffffff) 60%, transparent);
}

.worldbook-shop-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: color-mix(in srgb, var(--foreground, #ffffff) 50%, transparent);
  padding: 4px 8px;
}

.worldbook-shop-close:hover {
  color: var(--foreground, #ffffff);
}

.worldbook-shop-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  overscroll-behavior-y: none;
}

.shop-refresh-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 0;
  color: var(--accent-cyan, #00d4ff);
  font-size: 0.85rem;
}

.spinner-icon {
  width: 18px;
  height: 18px;
  border: 2px solid color-mix(in srgb, var(--accent-cyan, #00d4ff) 25%, transparent);
  border-top-color: var(--accent-cyan, #00d4ff);
  border-radius: 50%;
  animation: shop-spinner-spin 0.8s linear infinite;
}

@keyframes shop-spinner-spin {
  to { transform: rotate(360deg); }
}

/* 分类Tab栏 */
.shop-tab-bar {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  overflow-x: auto;
  flex-shrink: 0;
}

.shop-tab-bar::-webkit-scrollbar {
  display: none;
}

.shop-tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  background: none;
  border: none;
  color: color-mix(in srgb, var(--foreground, #ffffff) 50%, transparent);
  cursor: pointer;
  position: relative;
  transition: color 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}
  .platform-android.android-portrait .shop-tab-item {
    flex: 0 0 auto !important;  /* 不伸缩，按内容宽度显示 */
    min-width: auto !important;
    max-width: none !important;
    width: auto !important;
    box-sizing: border-box !important;
    padding: 16px !important;
  }
.shop-tab-item:hover {
  color: var(--foreground, #ffffff);
}

.shop-tab-item.active {
  color: var(--accent-cyan, #00d4ff);
}

.tab-icon {
  font-size: 1.1rem;
}

.tab-label {
  font-size: 0.8rem;
  font-weight: 500;
}

.tab-indicator {
  position: absolute;
  bottom: -1px;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 2px;
  background: var(--accent-cyan, #00d4ff);
  border-radius: 1px;
  opacity: 0;
  transition: opacity 0.2s;
}

.shop-tab-item.active .tab-indicator {
  opacity: 1;
}

.shop-toast-overlay {
  position: fixed;
  top: 60px;
  left: 0;
  right: 0;
  z-index: 2000;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.shop-toast-bubble {
  padding: 12px 24px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.08) 0%,
    rgba(255, 255, 255, 0.02) 100%
  );
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  color: var(--accent-cyan, #ffffff);
  font-size: 0.85rem;
  font-weight: 500;
  text-align: center;
  max-width: 85%;
  pointer-events: none;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.shop-toast-enter-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.shop-toast-leave-active {
  transition: all 0.3s ease-in;
}

.shop-toast-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}

.shop-toast-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

.worldbook-shop-items {
  margin-top: 12px;
}

.worldbook-shop-empty {
  text-align: center;
  color: color-mix(in srgb, var(--foreground, #ffffff) 40%, transparent);
  padding: 24px;
}

.worldbook-shop-item-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.worldbook-shop-item {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 14px 14px 14px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  cursor: pointer;
  color: var(--foreground, #ffffff);
  transition: all 0.2s ease;
  width: 100%;
  min-height: 72px;
  overflow: visible;
}

.worldbook-shop-item.affordable:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.worldbook-shop-item.affordable:active {
  transform: scale(0.98);
}

/* 金币不足：整体变灰不可点 */
.worldbook-shop-item.unaffordable {
  opacity: 0.3;
  pointer-events: none;
  filter: saturate(0);
  cursor: not-allowed;
}

/* 价格标签贴纸 */
.item-price-tag {
  position: absolute;
  top: 0;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px 6px;
  background: linear-gradient(135deg, #fcd34d, #f59e0b);
  color: #1a1a1a;
  font-size: 0.72rem;
  font-weight: 700;
  font-family: var(--font-mono, 'Courier New', monospace);
  border-radius: 0 0 6px 6px;
  box-shadow: 0 3px 8px rgba(245, 158, 11, 0.35);
  z-index: 2;
}


.price-tag-icon {
  font-size: 0.6rem;
  line-height: 1;
}

.price-tag-value {
  line-height: 1;
}

/* 左侧商品图标 */
.item-icon-col {
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-icon {
  font-size: 2.2rem;
  line-height: 1;
}

/* 右侧信息列 */
.item-info-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--foreground, #ffffff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-desc {
  margin: 0;
  font-size: 0.7rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 45%, transparent);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

</style>
