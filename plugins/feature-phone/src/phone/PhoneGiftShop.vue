<script setup>
/**
 * PhoneGiftShop.vue - 礼物商店 & 送礼界面
 */
import { computed, ref } from 'vue'

const props = defineProps({
  contacts: { type: Array, required: true }, // 联系人列表
  economy: { type: Object, required: true }, // usePhoneEconomy 返回值
})

const emit = defineEmits(['back', 'gift-sent'])

const activeTab = ref('shop') // 'shop' | 'my-gifts'
const pendingGift = ref(null) // 待送出的礼物
const showContactPicker = ref(false)

const catalog = computed(() => props.economy.getGiftCatalog())
const myGifts = computed(() => props.economy.availableGifts.value || [])

async function handleBuyGift(gift) {
  if (props.economy.balance.value < gift.price) return
  const result = await props.economy.buyGift(gift.id)
  if (result.success) {
    // 自动进入送礼流程
    pendingGift.value = result.gift
    showContactPicker.value = true
  }
}

async function handleSendGift(contact) {
  if (!pendingGift.value) return
  const result = await props.economy.sendGift(pendingGift.value.id, contact.id, contact.name)
  if (result.success) {
    showContactPicker.value = false
    pendingGift.value = null
    emit('gift-sent', { gift: result.gift, contact })
  }
}

function formatPrice(n) {
  return `${n}`
}
</script>

<template>
  <div class="gift-shop-app">
    <!-- 顶部导航 -->
    <div class="gift-shop-header">
      <button type="button" class="gift-shop-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <h2 class="gift-shop-title">礼物商店</h2>
      <div class="gift-shop-balance">💰 {{ economy.balance.value }}</div>
    </div>

    <!-- 标签切换 -->
    <div class="gift-shop-tabs">
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'shop' }" @click="activeTab = 'shop'">商店</button>
      <button type="button" class="tab-btn" :class="{ active: activeTab === 'my-gifts' }" @click="activeTab = 'my-gifts'">我的礼物 ({{ myGifts.length }})</button>
    </div>

    <!-- 商店 -->
    <div v-if="activeTab === 'shop'" class="gift-grid">
      <div v-for="gift in catalog" :key="gift.id" class="gift-card" :class="{ 'gift-card-disabled': economy.balance.value < gift.price }" @click="economy.balance.value >= gift.price && handleBuyGift(gift)">
        <div class="gift-icon">{{ gift.icon }}</div>
        <div class="gift-name">{{ gift.name }}</div>
        <div class="gift-price">💰 {{ gift.price }}</div>
        <div class="gift-category-tag">{{ gift.category }}</div>
      </div>
    </div>

    <!-- 我的礼物 -->
    <div v-else class="my-gifts-list">
      <div v-if="myGifts.length === 0" class="gifts-empty">
        <span class="empty-icon">🎁</span>
        <p class="empty-text">还没有购买的礼物</p>
        <p class="empty-hint">去商店挑一个吧</p>
      </div>
      <div v-for="gift in myGifts" :key="gift.id" class="my-gift-card">
        <div class="my-gift-icon">{{ gift.icon }}</div>
        <div class="my-gift-info">
          <div class="my-gift-name">{{ gift.name }}</div>
          <div class="my-gift-price">购买价: 💰{{ gift.price }}</div>
        </div>
        <div class="my-gift-action">
          <button type="button" class="send-btn" @click="pendingGift = gift; showContactPicker = true">送出</button>
        </div>
      </div>
    </div>

    <!-- 选择收礼人 -->
    <div v-if="showContactPicker" class="contact-picker-overlay" @click.self="showContactPicker = false">
      <div class="contact-picker-panel">
        <div class="contact-picker-header">
          <h3>选择收礼人</h3>
          <button type="button" class="picker-close" @click="showContactPicker = false">×</button>
        </div>
        <div class="contact-picker-list">
          <template v-for="group in contacts" :key="group.worldBookId">
            <div class="picker-group-title">《{{ group.worldBookTitle }}》</div>
            <div v-for="char in (group.characters || [])" :key="char.id" class="picker-contact-item" @click="handleSendGift(char)">
              <div class="picker-contact-avatar">
                <img v-if="char.portraits?.[0]" :src="char.portraits[0]" />
                <span v-else class="picker-avatar-text">{{ char.name.slice(0, 1) }}</span>
              </div>
              <div class="picker-contact-name">{{ char.name }}</div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gift-shop-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1c1c1e;
  color: #fff;
}

.gift-shop-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.gift-shop-back-btn {
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
  padding: 4px;
  display: flex;
}

.gift-shop-title {
  font-size: 18px;
  font-weight: 600;
  flex: 1;
}

.gift-shop-balance {
  font-size: 14px;
  color: #ffd60a;
  background: rgba(255, 214, 10, 0.1);
  padding: 4px 10px;
  border-radius: 12px;
}

.gift-shop-tabs {
  display: flex;
  padding: 8px 12px;
  gap: 8px;
}

.tab-btn {
  flex: 1;
  padding: 8px;
  background: rgba(44, 44, 46, 0.6);
  border: none;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  cursor: pointer;
}

.tab-btn.active {
  background: rgba(255, 204, 0, 0.15);
  color: #ffd60a;
}

.gift-grid {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  align-content: start;
}

.gift-card {
  background: rgba(44, 44, 46, 0.8);
  border-radius: 12px;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: transform 0.15s;
}

.gift-card:active {
  transform: scale(0.95);
}

.gift-card-disabled {
  opacity: 0.4;
  pointer-events: none;
}

.gift-icon {
  font-size: 32px;
}

.gift-name {
  font-size: 13px;
  text-align: center;
}

.gift-price {
  font-size: 12px;
  color: #ffd60a;
}

.gift-category-tag {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
}

/* 我的礼物 */
.my-gifts-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.gifts-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

.empty-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 4px;
}

.my-gift-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(44, 44, 46, 0.6);
  border-radius: 12px;
  margin-bottom: 8px;
}

.my-gift-icon {
  font-size: 32px;
}

.my-gift-info {
  flex: 1;
}

.my-gift-name {
  font-size: 14px;
  font-weight: 500;
}

.my-gift-price {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
}

.send-btn {
  padding: 6px 16px;
  background: rgba(255, 204, 0, 0.2);
  border: none;
  border-radius: 12px;
  color: #ffd60a;
  font-size: 13px;
  cursor: pointer;
}

/* 收礼人选择器 */
.contact-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 100;
}

.contact-picker-panel {
  width: 100%;
  max-width: 400px;
  max-height: 70vh;
  background: #2c2c2e;
  border-radius: 16px 16px 0 0;
  overflow-y: auto;
}

.contact-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.contact-picker-header h3 {
  margin: 0;
  font-size: 16px;
}

.picker-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 24px;
  cursor: pointer;
}

.picker-group-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  padding: 8px 16px 4px;
}

.picker-contact-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
}

.picker-contact-item:active {
  background: rgba(255, 255, 255, 0.08);
}

.picker-contact-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.picker-contact-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.picker-avatar-text {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.picker-contact-name {
  font-size: 14px;
}
</style>
