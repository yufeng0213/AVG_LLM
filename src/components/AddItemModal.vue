<script setup>
/**
 * AddItemModal.vue - 冰箱添加物品弹窗
 * 支持单件录入和采购单批量录入两种模式
 */
import { computed, ref } from 'vue'
import { useFridgeInventory } from '../composables/useFridgeInventory.js'

const props = defineProps({
  mode: {
    type: String,
    default: 'single',
  },
})

const emit = defineEmits(['close', 'saved'])

const fridge = useFridgeInventory()
const currentMode = ref(props.mode)

const singleForm = ref({
  name: '',
  category: 'fridge',
  quantity: 1,
  unit: '个',
  price: 0,
  source: '',
  expiryDate: '',
  note: '',
})

const purchaseForm = ref({
  source: '',
  date: new Date().toISOString().slice(0, 10),
  note: '',
  items: [],
})

const purchaseNewItem = ref({
  name: '',
  category: 'fridge',
  quantity: 1,
  unit: '个',
  price: 0,
})

const CATEGORY_OPTIONS = Object.entries(fridge.CATEGORY_META).map(([key, val]) => ({
  value: key,
  label: `${val.emoji} ${val.label}`,
}))

function computeExpiry() {
  const days = fridge.DEFAULT_EXPIRY_DAYS[singleForm.value.category]
  if (days === null) return ''
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function addPurchaseRow() {
  const item = { ...purchaseNewItem.value }
  if (!item.name.trim()) return
  purchaseForm.value.items.push(item)
  purchaseNewItem.value = { name: '', category: 'fridge', quantity: 1, unit: '个', price: 0 }
}

function removePurchaseRow(index) {
  purchaseForm.value.items.splice(index, 1)
}

const purchaseTotal = computed(() => {
  return purchaseForm.value.items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0)
})

async function save() {
  if (currentMode.value === 'single') {
    if (!singleForm.value.name.trim()) return
    await fridge.addItem({
      ...singleForm.value,
      price: Number(singleForm.value.price) || 0,
      quantity: Number(singleForm.value.quantity) || 1,
      expiryDate: singleForm.value.expiryDate || undefined,
    })
  } else {
    if (purchaseForm.value.items.length === 0) return
    const dateStr = purchaseForm.value.date || new Date().toISOString().slice(0, 10)
    await fridge.addPurchaseRecord({
      source: purchaseForm.value.source,
      date: new Date(dateStr).toISOString(),
      note: purchaseForm.value.note,
      items: purchaseForm.value.items.map(i => ({
        ...i,
        price: Number(i.price) || 0,
        quantity: Number(i.quantity) || 1,
      })),
    })
  }
  emit('saved')
}

function close() {
  emit('close')
}
</script>

<template>
  <div class="add-item-modal" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">添加物品</h3>
        <button type="button" class="modal-close" @click="close">&times;</button>
      </div>

      <div class="mode-tabs">
        <button type="button" :class="['mode-tab', { active: currentMode === 'single' }]" @click="currentMode = 'single'">单件录入</button>
        <button type="button" :class="['mode-tab', { active: currentMode === 'purchase' }]" @click="currentMode = 'purchase'">采购单</button>
      </div>

      <div class="modal-body">
        <template v-if="currentMode === 'single'">
          <div class="form-group">
            <label class="form-label">物品名称</label>
            <input v-model="singleForm.name" class="form-input" placeholder="如：牛奶、草莓蛋糕" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">分类</label>
              <select v-model="singleForm.category" class="form-select" @change="singleForm.expiryDate = computeExpiry()">
                <option v-for="opt in CATEGORY_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">保质期</label>
              <input v-model="singleForm.expiryDate" type="date" class="form-input" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">数量</label>
              <input v-model.number="singleForm.quantity" type="number" min="1" class="form-input" />
            </div>
            <div class="form-group">
              <label class="form-label">单位</label>
              <input v-model="singleForm.unit" class="form-input" placeholder="个/瓶/袋/盒" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">价格 (元)</label>
              <input v-model.number="singleForm.price" type="number" min="0" step="0.01" class="form-input" />
            </div>
            <div class="form-group">
              <label class="form-label">来源</label>
              <input v-model="singleForm.source" class="form-input" placeholder="超市/网购/便利店" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">备注</label>
            <input v-model="singleForm.note" class="form-input" placeholder="可选" />
          </div>
        </template>

        <template v-else>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">来源</label>
              <input v-model="purchaseForm.source" class="form-input" placeholder="沃尔玛/淘宝/便利店" />
            </div>
            <div class="form-group">
              <label class="form-label">日期</label>
              <input v-model="purchaseForm.date" type="date" class="form-input" />
            </div>
          </div>
          <div class="purchase-items" v-if="purchaseForm.items.length > 0">
            <div v-for="(item, idx) in purchaseForm.items" :key="idx" class="purchase-item-row">
              <span class="row-name">{{ item.name }}</span>
              <span class="row-qty">{{ item.quantity }}{{ item.unit }}</span>
              <span class="row-price">&yen;{{ (item.price * item.quantity).toFixed(2) }}</span>
              <button type="button" class="row-delete" @click="removePurchaseRow(idx)">&times;</button>
            </div>
          </div>
          <div class="purchase-add-row">
            <input v-model="purchaseNewItem.name" class="form-input small" placeholder="名称" />
            <select v-model="purchaseNewItem.category" class="form-select small">
              <option v-for="opt in CATEGORY_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <input v-model.number="purchaseNewItem.quantity" type="number" min="1" class="form-input tiny" />
            <input v-model.number="purchaseNewItem.price" type="number" min="0" step="0.01" class="form-input tiny" placeholder="单价" />
            <button type="button" class="add-row-btn" @click="addPurchaseRow">+ 添加</button>
          </div>
          <div class="purchase-total">
            <span>合计</span>
            <span class="total-price">&yen;{{ purchaseTotal.toFixed(2) }}</span>
          </div>
          <div class="form-group">
            <label class="form-label">备注</label>
            <input v-model="purchaseForm.note" class="form-input" placeholder="可选" />
          </div>
        </template>
      </div>

      <div class="modal-footer">
        <button type="button" class="footer-btn cancel" @click="close">取消</button>
        <button type="button" class="footer-btn save" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.add-item-modal {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}
.modal-content {
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  background: #2c2c2e;
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.modal-title {
  font-size: 17px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}
.modal-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 24px;
  cursor: pointer;
  padding: 0 4px;
}
.mode-tabs {
  display: flex;
  padding: 0 16px;
  gap: 8px;
  padding-top: 12px;
}
.mode-tab {
  flex: 1;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  cursor: pointer;
}
.mode-tab.active {
  background: rgba(255, 204, 0, 0.15);
  border-color: rgba(255, 204, 0, 0.3);
  color: #ffd60a;
}
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.form-group {
  margin-bottom: 12px;
}
.form-label {
  display: block;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
}
.form-input, .form-select {
  width: 100%;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: #fff;
  font-size: 15px;
  outline: none;
}
.form-input:focus, .form-select:focus {
  border-color: rgba(255, 204, 0, 0.4);
}
.form-row {
  display: flex;
  gap: 12px;
}
.form-row .form-group {
  flex: 1;
}
.purchase-items {
  margin-bottom: 12px;
}
.purchase-item-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  margin-bottom: 4px;
}
.row-name {
  flex: 1;
  font-size: 14px;
  color: #fff;
}
.row-qty {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 12px;
}
.row-price {
  font-size: 14px;
  color: #ffd60a;
  font-weight: 500;
}
.row-delete {
  background: none;
  border: none;
  color: rgba(255, 59, 48, 0.6);
  font-size: 18px;
  cursor: pointer;
  padding: 0 0 0 8px;
}
.purchase-add-row {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  align-items: center;
}
.form-input.small, .form-select.small {
  width: auto;
  flex: 1;
  padding: 8px;
  font-size: 13px;
}
.form-input.tiny {
  width: 60px;
  padding: 8px;
  font-size: 13px;
}
.add-row-btn {
  padding: 8px 12px;
  background: rgba(52, 199, 89, 0.2);
  border: none;
  border-radius: 8px;
  color: #34c759;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.purchase-total {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 12px;
}
.total-price {
  font-size: 18px;
  font-weight: 600;
  color: #ffd60a;
}
.modal-footer {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.footer-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
}
.footer-btn.cancel {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.footer-btn.save {
  background: rgba(255, 204, 0, 0.2);
  color: #ffd60a;
}
</style>
