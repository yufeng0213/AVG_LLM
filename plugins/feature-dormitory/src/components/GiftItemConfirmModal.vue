<script setup>
/**
 * 物品赠送确认模态框组件
 * 显示赠送确认对话框
 */

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  giftItem: {
    type: Object,
    default: null
  },
  characterName: {
    type: String,
    default: '角色'
  },
  isProcessing: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'close',
  'confirm'
])

function handleClose() {
  emit('close')
}

function handleConfirm() {
  emit('confirm')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="gift-modal">
      <div v-if="isOpen" class="dorm-gift-confirm-overlay" @click.self="handleClose">
        <div class="dorm-gift-confirm-dialog">
          <header class="dorm-gift-confirm-head">
            <h3 class="dorm-gift-confirm-title">赠送物品</h3>
            <button type="button" class="dorm-gift-confirm-close" @click="handleClose">×</button>
          </header>
          <div class="dorm-gift-confirm-body">
            <div class="dorm-gift-confirm-item">
              <span class="dorm-gift-confirm-item-icon">{{ giftItem?.icon }}</span>
              <div class="dorm-gift-confirm-item-info">
                <p class="dorm-gift-confirm-item-name">{{ giftItem?.name }}</p>
                <p class="dorm-gift-confirm-item-desc">{{ giftItem?.description }}</p>
                <p class="dorm-gift-confirm-item-meta">
                  <span class="dorm-gift-confirm-item-category">{{ giftItem?.categoryLabel }}</span>
                  <span v-if="giftItem?.quantity > 1" class="dorm-gift-confirm-item-quantity">拥有 x{{ giftItem?.quantity }}</span>
                </p>
              </div>
            </div>
            <p class="dorm-gift-confirm-hint">
              确定要将此物品赠送给 <strong>{{ characterName }}</strong> 吗？
            </p>
          </div>
          <footer class="dorm-gift-confirm-footer">
            <button type="button" class="dorm-gift-confirm-btn cancel" @click="handleClose">取消</button>
            <button type="button" class="dorm-gift-confirm-btn confirm" :disabled="isProcessing" @click="handleConfirm">
              {{ isProcessing ? '赠送中...' : '确认赠送' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.gift-modal-enter-active,
.gift-modal-leave-active {
  transition: opacity 0.3s ease;
}

.gift-modal-enter-from,
.gift-modal-leave-to {
  opacity: 0;
}

.dorm-gift-confirm-overlay {
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

.dorm-gift-confirm-dialog {
  background: #fff;
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.dorm-gift-confirm-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.dorm-gift-confirm-title {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.dorm-gift-confirm-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 4px 8px;
}

.dorm-gift-confirm-close:hover {
  color: #333;
}

.dorm-gift-confirm-body {
  padding: 16px;
}

.dorm-gift-confirm-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
  margin-bottom: 12px;
}

.dorm-gift-confirm-item-icon {
  font-size: 32px;
}

.dorm-gift-confirm-item-info {
  flex: 1;
}

.dorm-gift-confirm-item-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  margin: 0 0 4px;
}

.dorm-gift-confirm-item-desc {
  font-size: 12px;
  color: #666;
  margin: 0 0 4px;
}

.dorm-gift-confirm-item-meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: #999;
  margin: 0;
}

.dorm-gift-confirm-hint {
  font-size: 14px;
  color: #666;
  text-align: center;
  margin: 0;
}

.dorm-gift-confirm-hint strong {
  color: #333;
}

.dorm-gift-confirm-footer {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid #e0e0e0;
}

.dorm-gift-confirm-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.dorm-gift-confirm-btn.cancel {
  background: #f0f0f0;
  color: #666;
}

.dorm-gift-confirm-btn.cancel:hover {
  background: #e0e0e0;
}

.dorm-gift-confirm-btn.confirm {
  background: #2196f3;
  color: white;
}

.dorm-gift-confirm-btn.confirm:hover:not(:disabled) {
  background: #1976d2;
}

.dorm-gift-confirm-btn.confirm:disabled {
  background: #e0e0e0;
  color: #999;
  cursor: not-allowed;
}
</style>
