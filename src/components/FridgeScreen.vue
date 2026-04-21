<script setup>
/**
 * FridgeScreen.vue - 小冰箱全屏界面
 * 三个Tab: 库存、记账、统计
 */
import { computed, ref } from 'vue'
import { useFridgeInventory } from '../composables/useFridgeInventory.js'
import AddItemModal from './AddItemModal.vue'

const emit = defineEmits(['back'])

const fridge = useFridgeInventory()

// Tab: 'inventory' | 'purchases' | 'stats'
const currentTab = ref('inventory')

// 添加弹窗
const showAddModal = ref(false)
const addModalMode = ref('single')

function openAddModal(mode = 'single') {
  addModalMode.value = mode
  showAddModal.value = true
}

function onModalSaved() {
  showAddModal.value = false
}

// 分类显示
const CATEGORY_META = fridge.CATEGORY_META
const CATEGORY_ORDER = fridge.CATEGORY_ORDER

// 保质期进度
function expiryProgress(item) {
  if (!item.expiryDate) return { pct: 100, label: '' }
  const now = new Date()
  const purchase = new Date(item.purchaseDate)
  const expiry = new Date(item.expiryDate)
  const total = expiry - purchase
  const left = expiry - now
  if (total <= 0) return { pct: 0, label: '' }
  const pct = Math.max(0, Math.min(100, (left / total) * 100))
  const daysLeft = Math.ceil(left / (1000 * 60 * 60 * 24))
  const label = daysLeft < 0 ? `已过期${Math.abs(daysLeft)}天` : daysLeft === 0 ? '今天过期' : `剩余${daysLeft}天`
  return { pct, label }
}

function expiryBarColor(item) {
  const status = fridge.getItemStatus(item)
  if (status === 'expired') return '#ff3b30'
  if (status === 'expiring') return '#ffcc00'
  return '#34c759'
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatDateTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 统计用数据
const statsByCategory = computed(() => {
  const result = {}
  for (const cat of CATEGORY_ORDER) {
    const catItems = fridge.items.filter(i => i.category === cat)
    const total = catItems.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0)
    if (total > 0 || catItems.length > 0) {
      result[cat] = { count: catItems.length, total }
    }
  }
  return result
})

const mostExpensiveItems = computed(() => {
  return [...fridge.items]
    .filter(i => i.remaining > 0)
    .sort((a, b) => (b.price || 0) - (a.price || 0))
    .slice(0, 10)
})

const monthlyBreakdown = computed(() => {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const byCat = {}
  for (const p of fridge.purchases) {
    if (new Date(p.date) < monthStart) continue
    for (const item of p.items) {
      if (!byCat[item.category]) byCat[item.category] = 0
      byCat[item.category] += (item.price || 0) * (item.quantity || 1)
    }
  }
  return byCat
})

// 删除物品（长按/确认）
async function deleteItem(itemId) {
  if (confirm('确认删除该物品？')) {
    await fridge.removeItem(itemId)
  }
}
</script>

<template>
  <div class="fridge-screen">
    <!-- 顶部导航 -->
    <div class="fridge-header">
      <button type="button" class="back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <h2 class="title">小冰箱</h2>
      <div class="header-spacer" />
    </div>

    <!-- Tab切换 -->
    <div class="tab-bar">
      <button type="button" :class="['tab-btn', { active: currentTab === 'inventory' }]" @click="currentTab = 'inventory'">库存</button>
      <button type="button" :class="['tab-btn', { active: currentTab === 'purchases' }]" @click="currentTab = 'purchases'">记账</button>
      <button type="button" :class="['tab-btn', { active: currentTab === 'stats' }]" @click="currentTab = 'stats'">统计</button>
    </div>

    <!-- 内容区 -->
    <div class="fridge-content">
      <!-- 库存Tab -->
      <div v-if="currentTab === 'inventory'" class="inventory-view">
        <!-- 临期提醒 -->
        <div class="expiring-banner" v-if="fridge.expiringItems.length > 0">
          <span class="banner-icon">&#x26A0;&#xFE0F;</span>
          <span class="banner-text">
            {{ fridge.expiringItems.length }} 件物品
            {{ fridge.expiringItems.some(i => fridge.getItemStatus(i) === 'expired') ? '已过期' : '即将过期' }}
          </span>
        </div>

        <!-- 按分类展示 -->
        <div v-for="cat in CATEGORY_ORDER" :key="cat" class="category-section" v-if="fridge.categorizedItems[cat]">
          <div class="category-header">
            <span class="cat-emoji">{{ CATEGORY_META[cat].emoji }}</span>
            <span class="cat-label">{{ CATEGORY_META[cat].label }}</span>
            <span class="cat-count">{{ fridge.categorizedItems[cat].length }} 件</span>
          </div>
          <div class="item-list">
            <div v-for="item in fridge.categorizedItems[cat]" :key="item.id" class="item-card" :class="fridge.getItemStatus(item)">
              <div class="item-main" @click="deleteItem(item.id)">
                <div class="item-name-row">
                  <span class="item-name">{{ item.name }}</span>
                  <span class="item-remaining" v-if="item.remaining < item.quantity">剩{{ item.remaining }}</span>
                </div>
                <div class="item-detail">
                  <span class="item-qty">{{ item.quantity }}{{ item.unit }}</span>
                  <span class="item-price" v-if="item.price">&yen;{{ item.price.toFixed(2) }}</span>
                  <span class="item-source" v-if="item.source">{{ item.source }}</span>
                </div>
                <!-- 保质期进度条 -->
                <div class="expiry-bar" v-if="item.expiryDate">
                  <div class="expiry-fill" :style="{ width: expiryProgress(item).pct + '%', background: expiryBarColor(item) }" />
                  <span class="expiry-label" :style="{ color: expiryBarColor(item) }">{{ expiryProgress(item).label }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p v-if="fridge.items.filter(i => i.remaining > 0).length === 0" class="empty-text">
          冰箱空空如也，快去添加物品吧！
        </p>
      </div>

      <!-- 记账Tab -->
      <div v-else-if="currentTab === 'purchases'" class="purchases-view">
        <div v-if="fridge.purchases.length > 0" class="purchase-timeline">
          <div v-for="purchase in [...fridge.purchases].sort((a, b) => new Date(b.date) - new Date(a.date))" :key="purchase.id" class="purchase-card">
            <div class="purchase-header">
              <span class="purchase-date">{{ formatDateTime(purchase.date) }}</span>
              <span class="purchase-source" v-if="purchase.source">{{ purchase.source }}</span>
              <button type="button" class="purchase-delete" @click="fridge.deletePurchaseRecord(purchase.id)">&times;</button>
            </div>
            <div class="purchase-items-list">
              <div v-for="(item, idx) in purchase.items" :key="idx" class="purchase-line">
                <span class="line-name">{{ item.name }}</span>
                <span class="line-qty">{{ item.quantity }}{{ item.unit }}</span>
                <span class="line-price">&yen;{{ (item.price * item.quantity).toFixed(2) }}</span>
              </div>
            </div>
            <div class="purchase-footer">
              <span class="purchase-note" v-if="purchase.note">{{ purchase.note }}</span>
              <span class="purchase-total">合计 &yen;{{ purchase.total.toFixed(2) }}</span>
            </div>
          </div>
        </div>
        <p v-else class="empty-text">暂无采购记录</p>
      </div>

      <!-- 统计Tab -->
      <div v-else-if="currentTab === 'stats'" class="stats-view">
        <!-- 本月总支出 -->
        <div class="stat-card total-card">
          <span class="stat-label">本月支出</span>
          <span class="stat-value">&yen;{{ fridge.monthlyTotal.toFixed(2) }}</span>
        </div>

        <!-- 分类占比 -->
        <div class="stat-card" v-if="Object.keys(monthlyBreakdown).length > 0">
          <h3 class="stat-title">本月分类占比</h3>
          <div v-for="cat in CATEGORY_ORDER" :key="cat" class="stat-bar-row" v-if="monthlyBreakdown[cat]">
            <span class="stat-bar-label">{{ CATEGORY_META[cat].emoji }} {{ CATEGORY_META[cat].label }}</span>
            <div class="stat-bar-track">
              <div class="stat-bar-fill" :style="{ width: (monthlyBreakdown[cat] / fridge.monthlyTotal * 100) + '%' }" />
            </div>
            <span class="stat-bar-value">&yen;{{ monthlyBreakdown[cat].toFixed(2) }}</span>
          </div>
        </div>

        <!-- 最贵物品 -->
        <div class="stat-card" v-if="mostExpensiveItems.length > 0">
          <h3 class="stat-title">最贵物品</h3>
          <div v-for="(item, idx) in mostExpensiveItems" :key="item.id" class="rank-item">
            <span class="rank-num">{{ idx + 1 }}</span>
            <span class="rank-name">{{ item.name }}</span>
            <span class="rank-price">&yen;{{ (item.price * item.quantity).toFixed(2) }}</span>
          </div>
        </div>

        <p v-if="fridge.items.length === 0 && fridge.purchases.length === 0" class="empty-text">
          暂无统计数据
        </p>
      </div>
    </div>

    <!-- 底部添加按钮 -->
    <div class="fridge-footer">
      <button type="button" class="add-btn" @click="openAddModal('single')">+ 单件</button>
      <button type="button" class="add-btn" @click="openAddModal('purchase')">+ 采购单</button>
    </div>

    <!-- 添加弹窗 -->
    <AddItemModal v-if="showAddModal" :mode="addModalMode" @close="showAddModal = false" @saved="onModalSaved" />
  </div>
</template>

<style scoped>
.fridge-screen {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1c1c1e;
  color: #fff;
}

.fridge-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(28, 28, 30, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.back-btn {
  display: flex;
  align-items: center;
  padding: 6px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
}

.title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.header-spacer {
  width: 32px;
}

.tab-bar {
  display: flex;
  padding: 8px 16px;
  gap: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.tab-btn {
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  cursor: pointer;
}

.tab-btn.active {
  background: rgba(255, 204, 0, 0.12);
  color: #ffd60a;
}

.fridge-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* 库存视图 */
.expiring-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(255, 59, 48, 0.15);
  border-radius: 8px;
  margin-bottom: 12px;
}

.banner-icon {
  font-size: 16px;
}

.banner-text {
  font-size: 13px;
  color: #ef9a9a;
}

.category-section {
  margin-bottom: 16px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px;
  margin-bottom: 8px;
}

.cat-emoji {
  font-size: 16px;
}

.cat-label {
  font-size: 14px;
  font-weight: 500;
}

.cat-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin-left: auto;
}

.item-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item-card {
  padding: 10px 12px;
  background: rgba(44, 44, 46, 0.8);
  border-radius: 10px;
}

.item-card.expired {
  border-left: 3px solid #ff3b30;
}

.item-card.expiring {
  border-left: 3px solid #ffcc00;
}

.item-main {
  cursor: pointer;
}

.item-name-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-name {
  font-size: 15px;
  font-weight: 500;
}

.item-remaining {
  font-size: 12px;
  color: #ff6b6b;
  background: rgba(255, 59, 48, 0.15);
  padding: 1px 6px;
  border-radius: 4px;
}

.item-detail {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.item-qty, .item-price, .item-source {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.item-price {
  color: #ffd60a;
}

.expiry-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.expiry-fill {
  height: 4px;
  border-radius: 2px;
  flex: 1;
  background: #34c759;
}

.expiry-label {
  font-size: 11px;
  white-space: nowrap;
}

/* 记账视图 */
.purchase-timeline {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.purchase-card {
  padding: 12px;
  background: rgba(44, 44, 46, 0.8);
  border-radius: 10px;
}

.purchase-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.purchase-date {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.purchase-source {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 8px;
  border-radius: 4px;
}

.purchase-delete {
  margin-left: auto;
  background: none;
  border: none;
  color: rgba(255, 59, 48, 0.5);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
}

.purchase-items-list {
  padding-left: 4px;
}

.purchase-line {
  display: flex;
  align-items: center;
  padding: 4px 0;
}

.line-name {
  flex: 1;
  font-size: 14px;
}

.line-qty {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 12px;
}

.line-price {
  font-size: 13px;
  color: #ffd60a;
}

.purchase-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.purchase-note {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.purchase-total {
  font-size: 15px;
  font-weight: 600;
  color: #ffd60a;
}

/* 统计视图 */
.stat-card {
  padding: 14px;
  background: rgba(44, 44, 46, 0.8);
  border-radius: 10px;
  margin-bottom: 12px;
}

.total-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}

.stat-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #ffd60a;
  margin-top: 4px;
}

.stat-title {
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 12px;
}

.stat-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.stat-bar-label {
  font-size: 13px;
  width: 60px;
  white-space: nowrap;
}

.stat-bar-track {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #ffd60a, #ffb800);
  border-radius: 4px;
}

.stat-bar-value {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  width: 60px;
  text-align: right;
}

.rank-item {
  display: flex;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.rank-item:last-child {
  border-bottom: none;
}

.rank-num {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  margin-right: 10px;
}

.rank-num:first-child {
  background: rgba(255, 204, 0, 0.2);
  color: #ffd60a;
}

.rank-name {
  flex: 1;
  font-size: 14px;
}

.rank-price {
  font-size: 13px;
  color: #ffd60a;
}

.empty-text {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  padding: 40px 20px;
  font-size: 14px;
}

/* 底部按钮 */
.fridge-footer {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.add-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  background: rgba(255, 204, 0, 0.15);
  color: #ffd60a;
}
</style>
