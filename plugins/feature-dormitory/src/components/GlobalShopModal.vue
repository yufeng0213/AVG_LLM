<script setup>
/**
 * GlobalShopModal.vue - 全局商店面板
 * 使用全局经济/背包，商品包含通用物品 + 随机世界书剧情道具。
 */
import { onMounted, watch } from 'vue'
import { useGlobalShop } from '../composables/useGlobalShop.js'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const shop = useGlobalShop()

// 首次打开时初始化商品
const ensureShopInitialized = () => {
  const filteredValue = shop.shopFilteredItems.value
  if (!filteredValue || filteredValue.length === 0) {
    shop.initShopItems()
  }
}

onMounted(() => {
  if (props.isOpen) ensureShopInitialized()
})

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) ensureShopInitialized()
})

const handleClose = () => {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="isOpen" class="global-shop-modal" @click.self="handleClose">
        <div class="global-shop-panel">
          <!-- 顶部 -->
          <header class="shop-header">
            <h2 class="shop-title">🛒 全局商店</h2>
            <div class="shop-economy">
              <span class="economy-chip">💰 {{ shop.activeBookEconomyCoins.value }}</span>
              <span class="economy-chip">💎 {{ shop.activeBookEconomyCrystals.value }}</span>
            </div>
            <button type="button" class="shop-close-btn" @click="handleClose">✕</button>
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

          <!-- 商品网格 -->
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
    </Transition>
  </Teleport>
</template>

<style scoped>
.global-shop-modal {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.global-shop-panel {
  width: min(92vw, 640px);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--background, #0a0a0a);
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 12%, transparent);
  border-radius: 18px;
  overflow: hidden;
  color: var(--foreground, #ffffff);
}

.shop-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 8%, transparent);
}

.shop-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  flex: 1;
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
  background: color-mix(in srgb, var(--foreground, #ffffff) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 10%, transparent);
  font-size: 0.82rem;
  font-weight: 600;
}

.shop-close-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 15%, transparent);
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--foreground, #ffffff);
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 150ms ease;
}

.shop-close-btn:hover {
  background: color-mix(in srgb, var(--foreground, #ffffff) 10%, transparent);
}

.shop-categories {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  overflow-x: auto;
  border-bottom: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 6%, transparent);
}

.shop-cat-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 10%, transparent);
  border-radius: 999px;
  padding: 6px 16px;
  background: transparent;
  color: color-mix(in srgb, var(--foreground, #ffffff) 60%, transparent);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
  white-space: nowrap;
}

.shop-cat-btn.active {
  background: color-mix(in srgb, var(--accent-cyan, #6872D9) 15%, transparent);
  border-color: color-mix(in srgb, var(--accent-cyan, #6872D9) 30%, transparent);
  color: var(--foreground, #ffffff);
}

.shop-cat-btn:hover:not(.active) {
  background: color-mix(in srgb, var(--foreground, #ffffff) 6%, transparent);
  color: var(--foreground, #ffffff);
}

.shop-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
}

.shop-refresh-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--accent-cyan, #6872D9) 25%, transparent);
  border-radius: 10px;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--accent-cyan, #6872D9) 8%, transparent);
  color: var(--foreground, #ffffff);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.shop-refresh-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-cyan, #6872D9) 15%, transparent);
}

.shop-refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.shop-feedback {
  font-size: 0.78rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 55%, transparent);
}

.shop-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  padding: 16px 20px;
  overflow-y: auto;
  min-height: 0;
  flex: 1;
}

.shop-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 8%, transparent);
  background: color-mix(in srgb, var(--foreground, #ffffff) 4%, transparent);
  text-align: center;
}

.shop-item-icon {
  font-size: 2rem;
}

.shop-item-name {
  font-size: 0.9rem;
  font-weight: 600;
}

.shop-book-tag {
  font-size: 0.68rem;
  color: color-mix(in srgb, var(--accent-magenta, #5E6AD2) 60%, transparent);
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-magenta, #5E6AD2) 8%, transparent);
}

.shop-item-desc {
  font-size: 0.75rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 40%, transparent);
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
  color: color-mix(in srgb, var(--accent-yellow, #F5C542) 70%, transparent);
}

.shop-buy-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--accent-cyan, #6872D9) 25%, transparent);
  border-radius: 8px;
  padding: 4px 14px;
  background: color-mix(in srgb, var(--accent-cyan, #6872D9) 10%, transparent);
  color: var(--foreground, #ffffff);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.shop-buy-btn:hover:not(.disabled) {
  background: color-mix(in srgb, var(--accent-cyan, #6872D9) 20%, transparent);
}

.shop-buy-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.shop-empty {
  text-align: center;
  padding: 40px 20px;
  color: color-mix(in srgb, var(--foreground, #ffffff) 35%, transparent);
  font-size: 0.9rem;
}

.shop-empty-hint {
  margin-top: 6px;
  font-size: 0.78rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 20%, transparent);
}

/* 动画 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 200ms ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
