<script setup>
/**
 * 世界书商店模态框组件
 * 显示商店面板和购买选项
 */

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

const emit = defineEmits([
  'close',
  'select-category',
  'refresh-items',
  'buy-item'
])

function handleClose() {
  emit('close')
}

function handleSelectCategory(categoryId) {
  emit('select-category', categoryId)
}

function handleRefresh() {
  emit('refresh-items')
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
              <span class="shop-coin-item">💰 金币: {{ activeBookEconomyCoins }}</span>
              <span class="shop-coin-item">💎 晶石: {{ activeBookEconomyCrystals }}</span>
            </div>
            <button type="button" class="worldbook-shop-close" @click="handleClose">×</button>
          </header>

          <div class="worldbook-shop-body">
            <!-- 分类选择 -->
            <div class="worldbook-shop-categories">
              <button
                v-for="cat in categories"
                :key="cat.id"
                type="button"
                class="worldbook-shop-category-btn"
                :class="{ active: selectedCategory === cat.id }"
                @click="handleSelectCategory(cat.id)"
              >
                <span class="category-icon">{{ cat.icon }}</span>
                <span class="category-label">{{ cat.label }}</span>
              </button>
            </div>

            <!-- 刷新按钮 -->
            <div class="worldbook-shop-toolbar">
              <button
                type="button"
                class="worldbook-shop-refresh-btn"
                :disabled="isRefreshing"
                @click="handleRefresh"
              >
                {{ isRefreshing ? '刷新中...' : '🔄 刷新商品' }}
              </button>
            </div>

            <!-- 购买反馈 -->
            <p v-if="purchaseFeedback" class="worldbook-shop-feedback">{{ purchaseFeedback }}</p>

            <!-- 商品列表 -->
            <div class="worldbook-shop-items">
              <div v-if="shopItems.length === 0" class="worldbook-shop-empty">
                暂无商品，请尝试刷新。
              </div>
              <div v-else class="worldbook-shop-item-grid">
                <div
                  v-for="item in shopItems"
                  :key="item.id"
                  class="worldbook-shop-item"
                >
                  <div class="worldbook-shop-item-icon">{{ item.icon }}</div>
                  <h3 class="worldbook-shop-item-name">{{ item.name }}</h3>
                  <p class="worldbook-shop-item-desc">{{ item.description }}</p>
                  <p class="worldbook-shop-item-price">💰 {{ item.price }} 金币</p>
                  <button
                    type="button"
                    class="worldbook-shop-buy-btn"
                    :class="{ affordable: canAfford(item), unaffordable: !canAfford(item) }"
                    :disabled="!canAfford(item)"
                    @click="handleBuyItem(item)"
                  >
                    {{ canAfford(item) ? '购买' : '金币不足' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
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
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.worldbook-shop-panel {
  background: #fff;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.worldbook-shop-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.worldbook-shop-title {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.worldbook-shop-coins {
  flex: 1;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.shop-coin-item {
  font-size: 14px;
  color: #666;
}

.worldbook-shop-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 4px 8px;
}

.worldbook-shop-close:hover {
  color: #333;
}

.worldbook-shop-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.worldbook-shop-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.worldbook-shop-category-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #f0f0f0;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  transition: background 0.2s;
}

.worldbook-shop-category-btn.active {
  background: #2196f3;
  color: white;
}

.category-icon {
  font-size: 16px;
}

.category-label {
  font-size: 14px;
}

.worldbook-shop-toolbar {
  margin-bottom: 12px;
}

.worldbook-shop-refresh-btn {
  padding: 8px 16px;
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.worldbook-shop-refresh-btn:hover:not(:disabled) {
  background: #388e3c;
}

.worldbook-shop-feedback {
  padding: 8px 12px;
  background: #e8f5e9;
  border-radius: 6px;
  color: #2e7d32;
  font-size: 14px;
  margin-bottom: 12px;
}

.worldbook-shop-items {
  margin-top: 12px;
}

.worldbook-shop-empty {
  text-align: center;
  color: #999;
  padding: 24px;
}

.worldbook-shop-item-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.worldbook-shop-item {
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
  text-align: center;
}

.worldbook-shop-item-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.worldbook-shop-item-name {
  font-size: 14px;
  margin: 0 0 4px;
  color: #333;
}

.worldbook-shop-item-desc {
  font-size: 12px;
  color: #666;
  margin: 0 0 8px;
}

.worldbook-shop-item-price {
  font-size: 13px;
  color: #ff9800;
  margin: 0 0 8px;
}

.worldbook-shop-buy-btn {
  width: 100%;
  padding: 8px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.worldbook-shop-buy-btn.affordable {
  background: #2196f3;
  color: white;
}

.worldbook-shop-buy-btn.affordable:hover:not(:disabled) {
  background: #1976d2;
}

.worldbook-shop-buy-btn.unaffordable {
  background: #e0e0e0;
  color: #999;
  cursor: not-allowed;
}
</style>
