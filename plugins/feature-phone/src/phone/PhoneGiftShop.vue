<script setup>
/**
 * PhoneGiftShop.vue - 礼物商店（底部滑出面板，浅色 IM 风格）
 * 点击即买即送，自动关闭弹窗。
 */
import { computed } from 'vue'

const props = defineProps({
  economy: { type: Object, required: true },
})

const emit = defineEmits(['back', 'gift-sent'])

const catalog = computed(() => props.economy.getGiftCatalog())

async function handleBuyAndSend(gift) {
  if (props.economy.balance.value < gift.price) return
  const result = await props.economy.buyGift(gift.id)
  if (result.success) {
    emit('gift-sent', { gift: result.gift })
    emit('back')
  }
}

function categoryColor(cat) {
  const map = {
    食物: '#ff6b6b', 饰品: '#f0b800', 鲜花: '#ff9ec4', 书籍: '#7c5cbf', 玩具: '#5cb8ff', 其他: '#b0a8c0',
  }
  return map[cat] || map.其他
}
</script>

<template>
  <div class="gift-shop-overlay" @click.self="emit('back')">
    <div class="gift-shop-panel">
      <!-- 关闭按钮 -->
      <div class="gift-shop-handle">
        <div class="gift-shop-handle-bar" />
        <button type="button" class="gift-shop-close mailbox-back-btn" @click="emit('back')">&times;</button>
      </div>

      <!-- 余额 -->
      <div class="gift-shop-balance">&#x1FA99; {{ economy.balance.value }} 金币</div>

      <!-- 礼物网格 -->
      <div v-if="catalog.length > 0" class="gift-grid">
        <div
          v-for="gift in catalog"
          :key="gift.id"
          class="gift-card"
          :class="{ 'gift-card-disabled': economy.balance.value < gift.price }"
          @click="handleBuyAndSend(gift)"
        >
          <div class="gift-card-bg" :style="{ background: 'linear-gradient(135deg, ' + categoryColor(gift.category) + '18, ' + categoryColor(gift.category) + '06)' }" />
          <div class="gift-card-content">
            <div class="gift-icon-wrap">
              <span class="gift-icon">{{ gift.icon }}</span>
              <span class="gift-cat-dot" :style="{ background: categoryColor(gift.category) }" />
            </div>
            <div class="gift-name">{{ gift.name }}</div>
            <div class="gift-price">&#x1FA99; {{ gift.price }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gift-shop-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  animation: gs-overlay-in 0.2s ease;
}

@keyframes gs-overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.gift-shop-panel {
  width: 100%;
  max-height: 75vh;
  background: linear-gradient(180deg, #fff5f9 0%, #fef0ff 30%, #f0f4ff 100%);
  border-radius: 18px 18px 0 0;
  overflow-y: auto;
  animation: gs-slide-up 0.25s ease;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
}

@keyframes gs-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

/* 顶部手柄区域 */
.gift-shop-handle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 6px;
  flex-shrink: 0;
}

.gift-shop-handle-bar {
  width: 40px;
  height: 4px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
}

.gift-shop-close {
  background: none;
  border: none;
  color: rgba(51, 51, 51, 0.5);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background 0.15s;
}

.gift-shop-close:hover {
  background: rgba(0, 0, 0, 0.06);
}

/* 余额 */
.gift-shop-balance {
  font-size: 0.82rem;
  color: #e67e22;
  font-weight: 600;
  text-align: center;
  padding: 6px 0 10px;
}

/* 礼物网格 */
.gift-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 0 14px 14px;
}

.gift-card {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(0, 0, 0, 0.04);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.gift-card:active {
  transform: scale(0.96);
}

.gift-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.gift-card-disabled {
  opacity: 0.4;
  pointer-events: none;
}

.gift-card-bg {
  position: absolute;
  inset: 0;
  border-radius: 14px;
}

.gift-card-content {
  position: relative;
  z-index: 1;
  padding: 10px 8px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.gift-icon-wrap {
  position: relative;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  margin-bottom: 2px;
}

.gift-icon {
  font-size: 24px;
}

.gift-cat-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid #fff;
}

.gift-name {
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
  color: rgba(51, 51, 51, 0.85);
}

.gift-price {
  font-size: 0.68rem;
  color: #e67e22;
  font-weight: 600;
  background: linear-gradient(135deg, #fff8e8, #fef0d5);
  padding: 2px 8px;
  border-radius: 8px;
}

/* ===== Android portrait ===== */
.platform-android.android-portrait .gift-shop-close {
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
