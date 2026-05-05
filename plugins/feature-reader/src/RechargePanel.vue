<script setup>
/**
 * RechargePanel.vue - 金币充值面板
 * 从 WorldHub 经济系统扣除金币，充值到书城
 */
import { ref, computed } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  playerCoins: { type: Number, default: 0 },
})
const emit = defineEmits(['close', 'recharge'])

const customAmount = ref('')
const customInputVisible = ref(false)

// 预设档位
const presets = [
  { label: '100 金币', amount: 100, price: '10 世界币' },
  { label: '500 金币', amount: 500, price: '45 世界币' },
  { label: '1000 金币', amount: 1000, price: '80 世界币' },
  { label: '自定义', amount: 0, price: '', isCustom: true },
]

function handlePreset(preset) {
  if (preset.isCustom) {
    customInputVisible.value = true
    customAmount.value = ''
    return
  }
  doRecharge(preset.amount)
}

function handleCustomRecharge() {
  const amount = parseInt(customAmount.value, 10)
  if (!amount || amount <= 0) return
  doRecharge(amount)
}

function doRecharge(amount) {
  if (amount > props.playerCoins) {
    alert('世界币余额不足！')
    return
  }
  emit('recharge', amount)
  customInputVisible.value = false
  customAmount.value = ''
}

function handleClose() {
  customInputVisible.value = false
  customAmount.value = ''
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="recharge-overlay" @click.self="handleClose">
        <div class="recharge-panel">
          <div class="panel-header">
            <h3 class="panel-title">充值金币</h3>
            <button class="close-btn" @click="handleClose">×</button>
          </div>

          <!-- 余额显示 -->
          <div class="balance-bar">
            <span class="balance-label">世界币余额</span>
            <span class="balance-value">💎 {{ playerCoins }}</span>
          </div>

          <!-- 预设档位 -->
          <div v-if="!customInputVisible" class="preset-list">
            <button
              v-for="preset in presets"
              :key="preset.label"
              class="preset-card"
              @click="handlePreset(preset)"
            >
              <span class="preset-amount">{{ preset.label }}</span>
              <span class="preset-price">{{ preset.price }}</span>
            </button>
          </div>

          <!-- 自定义金额 -->
          <div v-else class="custom-input-area">
            <label class="input-label">输入充值金币数量</label>
            <input
              v-model="customAmount"
              class="custom-input"
              type="number"
              placeholder="请输入数量"
              min="1"
              :max="playerCoins"
            />
            <p class="input-hint">最多可充 {{ playerCoins }} 金币</p>
            <div class="custom-actions">
              <button class="cancel-btn" @click="customInputVisible = false">取消</button>
              <button
                class="confirm-btn"
                :disabled="!customAmount || parseInt(customAmount) <= 0 || parseInt(customAmount) > playerCoins"
                @click="handleCustomRecharge"
              >
                确认充值
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.recharge-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 2000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.recharge-panel {
  width: 100%;
  max-width: 480px;
  background: #fff;
  border-radius: 20px 20px 0 0;
  padding: 20px 16px 32px;
  animation: slideUp 0.25s ease;
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.panel-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #2d2040;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #8b7ea8;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

/* 余额显示 */
.balance-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #f0e8ff, #ede4ff);
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 20px;
}

.balance-label {
  font-size: 0.85rem;
  color: #7c5cbf;
  font-weight: 600;
}

.balance-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: #5a3d8a;
}

/* 预设档位 */
.preset-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.preset-card {
  background: linear-gradient(135deg, #f8f4ff, #f0e8ff);
  border: 1px solid #e0d4f5;
  border-radius: 14px;
  padding: 18px 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}

.preset-card:active {
  transform: scale(0.96);
  border-color: #7c5cbf;
}

.preset-amount {
  font-size: 1rem;
  font-weight: 700;
  color: #2d2040;
}

.preset-price {
  font-size: 0.78rem;
  color: #9b8ec4;
}

/* 自定义输入 */
.custom-input-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.input-label {
  font-size: 0.85rem;
  color: #5a3d8a;
  font-weight: 600;
}

.custom-input {
  background: #f8f4ff;
  border: 1px solid #e0d4f5;
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 1.1rem;
  color: #2d2040;
  outline: none;
  text-align: center;
}

.custom-input:focus {
  border-color: #7c5cbf;
}

.input-hint {
  font-size: 0.72rem;
  color: #b0a8c0;
  margin: 0;
  text-align: center;
}

.custom-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.cancel-btn {
  flex: 1;
  background: #f0e8ff;
  border: none;
  border-radius: 12px;
  padding: 12px;
  font-size: 0.9rem;
  color: #7c5cbf;
  font-weight: 600;
  cursor: pointer;
}

.confirm-btn {
  flex: 1;
  background: linear-gradient(135deg, #7c5cbf, #9b8ec4);
  border: none;
  border-radius: 12px;
  padding: 12px;
  font-size: 0.9rem;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.confirm-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 淡入淡出 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
