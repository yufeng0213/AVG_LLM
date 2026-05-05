<script setup>
import { ref, computed, watch } from 'vue'
import { createRoomSpriteResolver } from '../render/roomSprites.js'

const props = defineProps({
  furniture: { type: Object, default: null },
  visible: { type: Boolean, default: false },
  currency: { type: Object, default: () => ({ coins: 100 }) },
})

const emit = defineEmits(['close', 'retrieve-item', 'purchase-item', 'add-item'])

const expanded = ref(true)
const selectedTab = ref('inventory')

// 创建 sprite resolver 用于获取家具图片
const spriteResolver = createRoomSpriteResolver()

const getFurnitureSpriteSrc = (furniture) => {
  return spriteResolver.getFurnitureSpriteSrc(furniture)
}

// 计算属性
const isStorage = computed(() => props.furniture?.kind === 'storage')
const isVending = computed(() => props.furniture?.kind === 'vending')

const inventoryItems = computed(() => {
  if (!props.furniture?.inventory) return []
  // inventory 可能是数组，也可能是 { items: [] } 对象
  const invArray = Array.isArray(props.furniture.inventory) ? props.furniture.inventory : (props.furniture.inventory?.items || [])
  return invArray.filter(item => item.amount > 0)
})

const shopProducts = computed(() => {
  if (!props.furniture?.shopInventory) return []
  return props.furniture.shopInventory.filter(p => p.stock > 0)
})

const capacityUsed = computed(() => inventoryItems.value.length)
const capacityMax = computed(() => props.furniture?.inventoryCapacity || 50)

// 物品类型图标
const getItemIcon = (type) => {
  switch (type) {
    case 'food': return '🍎'
    case 'material': return '📦'
    case 'product': return '🎁'
    default: return '❓'
  }
}

// 需求效果描述
const getEffectDescription = (effect) => {
  if (!effect || typeof effect !== 'object') return ''
  const parts = []
  for (const [need, value] of Object.entries(effect)) {
    if (value > 0) {
      const needName = {
        hunger: '饥饿',
        rest: '休息',
        comfort: '舒适',
        joy: '快乐',
        social: '社交',
        work_satisfaction: '工作满足',
      }[need] || need
      parts.push(`${needName}+${value}`)
    }
  }
  return parts.join(', ')
}

// 处理取出物品
const handleRetrieveItem = (itemId, amount = 1) => {
  emit('retrieve-item', {
    furnitureId: props.furniture.id,
    itemId,
    amount,
  })
}

// 处理购买商品
const handlePurchaseProduct = (templateId, amount = 1) => {
  emit('purchase-item', {
    furnitureId: props.furniture.id,
    templateId,
    amount,
  })
}

// 处理存入物品
const handleAddItem = () => {
  emit('add-item', {
    furnitureId: props.furniture.id,
  })
}

// 关闭面板
const handleClose = () => {
  expanded.value = true
  emit('close')
}

// 可见性变化时重置
watch(() => props.visible, (newVal) => {
  if (newVal) {
    expanded.value = true
    selectedTab.value = 'inventory'
  }
})
</script>

<template>
  <div class="furniture-info-overlay" :class="{ visible }">
    <!-- 展开状态 -->
    <div class="furniture-info-expanded" v-if="expanded && furniture">
      <!-- 头部 -->
      <div class="overlay-header">
        <div class="furniture-title">
          <span class="furniture-name">{{ furniture.name }}</span>
          <span class="furniture-kind">{{ furniture.kind === 'storage' ? '存储家具' : furniture.kind === 'vending' ? '售货机' : furniture.kind }}</span>
        </div>
        <button class="close-btn" @click="handleClose">✕</button>
      </div>

      <!-- 存储家具面板 -->
      <template v-if="isStorage">
        <div class="inventory-header">
          <span class="capacity-info">库存 ({{ capacityUsed }}/{{ capacityMax }})</span>
          <button class="add-item-btn" @click="handleAddItem">+ 添加</button>
        </div>

        <div class="inventory-list" v-if="inventoryItems.length > 0">
          <div v-for="item in inventoryItems" :key="item.id" class="inventory-item">
            <span class="item-icon">{{ getItemIcon(item.type) }}</span>
            <div class="item-info">
              <span class="item-name">{{ item.name }}</span>
              <span class="item-effect">{{ getEffectDescription(item.effect) }}</span>
            </div>
            <span class="item-amount">x{{ item.amount }}</span>
            <button class="retrieve-btn" @click="handleRetrieveItem(item.id, 1)">取出</button>
          </div>
        </div>

        <div class="empty-inventory" v-else>
          <span>库存为空</span>
          <span class="hint">点击"+ 添加"存入物品</span>
        </div>
      </template>

      <!-- 售货机面板 -->
      <template v-if="isVending">
        <div class="shop-header">
          <span>商品列表</span>
          <span class="currency">💰 {{ currency.coins }} 金币</span>
        </div>

        <div class="shop-list" v-if="shopProducts.length > 0">
          <div v-for="product in shopProducts" :key="product.templateId" class="shop-product">
            <span class="product-icon">{{ getItemIcon(product.type) }}</span>
            <div class="product-info">
              <span class="product-name">{{ product.name }}</span>
              <span class="product-effect">{{ getEffectDescription(product.effect) }}</span>
            </div>
            <div class="product-meta">
              <span class="product-price">{{ product.price }} 金币</span>
              <span class="product-stock">库存: {{ product.stock }}</span>
            </div>
            <button
              class="purchase-btn"
              :disabled="product.stock <= 0 || currency.coins < product.price"
              @click="handlePurchaseProduct(product.templateId, 1)"
            >购买</button>
          </div>
        </div>

        <div class="empty-shop" v-else>
          <span>商品已售罄</span>
          <span class="hint">等待自动补货...</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.furniture-info-overlay {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  transform: translateY(100%);
  transition: transform 0.3s ease;
  z-index: 100;
  pointer-events: none;
}

.furniture-info-overlay.visible {
  transform: translateY(0);
  pointer-events: auto;
}

.furniture-info-expanded {
  background: #22222a;
  border-top: 1px solid #3a3a42;
  border-radius: 12px 12px 0 0;
  padding: 16px;
  max-height: 50vh;
  overflow-y: auto;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.5);
}

.overlay-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #3a3a42;
}

.furniture-title {
  display: flex;
  flex-direction: column;
}

.furniture-name {
  font-size: 18px;
  font-weight: 600;
  color: #eaeaea;
}

.furniture-kind {
  font-size: 12px;
  color: #888;
}

.close-btn {
  width: 32px;
  height: 32px;
  background: #3a3a42;
  border: none;
  border-radius: 8px;
  color: #aaa;
  font-size: 16px;
  cursor: pointer;
}

.close-btn:hover {
  background: #4a4a52;
  color: #eaeaea;
}

/* 存储家具样式 */
.inventory-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.capacity-info {
  font-size: 14px;
  color: #888;
}

.add-item-btn {
  padding: 6px 12px;
  background: #4a6a4a;
  border: none;
  border-radius: 6px;
  color: #eaeaea;
  font-size: 12px;
  cursor: pointer;
}

.add-item-btn:hover {
  background: #5a8a5a;
}

.inventory-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.inventory-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #3a3a42;
  border-radius: 6px;
}

.item-icon {
  font-size: 24px;
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.item-name {
  font-size: 14px;
  color: #eaeaea;
}

.item-effect {
  font-size: 12px;
  color: #6a8a6a;
}

.item-amount {
  font-size: 14px;
  color: #aaa;
}

.retrieve-btn {
  padding: 4px 12px;
  background: #5a5a62;
  border: none;
  border-radius: 4px;
  color: #eaeaea;
  font-size: 12px;
  cursor: pointer;
}

.retrieve-btn:hover {
  background: #6a6a72;
}

.empty-inventory {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 20px;
  color: #888;
}

.empty-inventory .hint {
  font-size: 12px;
  color: #666;
}

/* 售货机样式 */
.shop-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.shop-header span:first-child {
  font-size: 14px;
  color: #888;
}

.currency {
  font-size: 14px;
  color: #caa;
  font-weight: 600;
}

.shop-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shop-product {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #3a3a42;
  border-radius: 6px;
}

.product-icon {
  font-size: 24px;
}

.product-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.product-name {
  font-size: 14px;
  color: #eaeaea;
}

.product-effect {
  font-size: 12px;
  color: #6a8a6a;
}

.product-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.product-price {
  font-size: 14px;
  color: #caa;
  font-weight: 600;
}

.product-stock {
  font-size: 12px;
  color: #888;
}

.purchase-btn {
  padding: 6px 12px;
  background: #5a7a9a;
  border: none;
  border-radius: 4px;
  color: #eaeaea;
  font-size: 12px;
  cursor: pointer;
}

.purchase-btn:hover:not(:disabled) {
  background: #6a8aaa;
}

.purchase-btn:disabled {
  background: #4a4a52;
  color: #666;
  cursor: not-allowed;
}

.empty-shop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 20px;
  color: #888;
}

.empty-shop .hint {
  font-size: 12px;
  color: #666;
}

/* 移动端优化 */
@media (pointer: coarse) {
  .furniture-info-expanded {
    max-height: 60vh;
  }

  .inventory-item,
  .shop-product {
    padding: 12px;
  }

  .retrieve-btn,
  .purchase-btn {
    padding: 8px 16px;
  }
}

/* Android 平台适配 */
.platform-android.android-portrait .furniture-info-overlay .close-btn,
.platform-android.android-portrait .furniture-info-overlay .add-item-btn,
.platform-android.android-portrait .furniture-info-overlay .retrieve-btn,
.platform-android.android-portrait .furniture-info-overlay .purchase-btn {
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