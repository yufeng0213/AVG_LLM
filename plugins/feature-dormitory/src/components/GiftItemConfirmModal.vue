<script setup>
/**
 * 物品赠送确认模态框组件
 * 显示赠送确认对话框
 */
import { watch } from 'vue'

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

watch(() => props.giftItem, (item) => {
  console.log('[GiftConfirmModal] giftItem:', item ? JSON.stringify({ id: item.id, name: item.name, icon: item.icon, description: item.description, category: item.category, categoryLabel: item.categoryLabel, quantity: item.quantity }) : 'null')
}, { immediate: true })

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
      <div v-if="isOpen" class="gift-confirm-overlay" @click.self="handleClose">
        <div class="gift-confirm-dialog" @click.stop>
          <header class="gift-confirm-head">
            <h3 class="gift-confirm-title">赠送物品</h3>
            <button type="button" class="gift-confirm-close" @click="handleClose">×</button>
          </header>
          <div class="gift-confirm-body">
            <div class="gift-confirm-item">
              <div class="gift-confirm-item-icon-wrap">
                <span class="gift-confirm-item-icon">{{ giftItem?.icon }}</span>
              </div>
              <div class="gift-confirm-item-info">
                <p class="gift-confirm-item-name">{{ giftItem?.name }}</p>
                <p class="gift-confirm-item-desc">{{ giftItem?.description || '暂无描述' }}</p>
                
              </div>
            </div>
            <p class="gift-confirm-hint">
              确定要将此物品赠送给 <strong>{{ characterName }}</strong> 吗？
            </p>
          </div>
          <footer class="gift-confirm-footer">
            <button type="button" class="gift-confirm-btn cancel" @click="handleClose">取消</button>
            <button type="button" class="gift-confirm-btn confirm" :disabled="isProcessing" @click="handleConfirm">
              {{ isProcessing ? '赠送中...' : '确认赠送' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Overlay */
.gift-modal-enter-active {
  transition: opacity 0.3s ease;
}

.gift-modal-leave-active {
  transition: opacity 0.2s ease;
}

.gift-modal-enter-from,
.gift-modal-leave-to {
  opacity: 0;
}

.gift-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(24px) saturate(1.6);
  -webkit-backdrop-filter: blur(24px) saturate(1.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}
.platform-android.android-portrait .gift-confirm-overlay {
  background: linear-gradient(180deg, rgba(30, 30, 35, 0.94) 0%, rgba(18, 18, 22, 0.96) 100%) !important;
  backdrop-filter: blur(40px) saturate(1.8) !important;
  -webkit-backdrop-filter: blur(40px) saturate(1.8) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}
/* Dialog */
.gift-confirm-dialog {
  width: min(88vw, 360px);
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4), 0 8px 32px rgba(0, 0, 0, 0.2);
  animation: gift-dialog-in 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes gift-dialog-in {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(12px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Header */
.gift-confirm-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.gift-confirm-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: #ffffff;
}

.gift-confirm-close {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.06);
  width: 30px;
  height: 30px;
  min-width: 30px;
  min-height: 30px;
  border-radius: 50%;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s ease;
}
  .platform-android.android-portrait .gift-confirm-close {
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

.gift-confirm-close:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.12);
}

/* Body */
.gift-confirm-body {
  padding: 20px;
}

/* Gift item card */
.gift-confirm-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  margin-bottom: 16px;
}

.gift-confirm-item-icon-wrap {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  
  border-radius: 12px;
}

.gift-confirm-item-icon {
  font-size: 28px;
  border: none;
  background: transparent;
  color: #ffffff;
}

.gift-confirm-item-info {
  flex: 1;
  min-width: 0;
}

.gift-confirm-item-name {
  font-size: 15px;
  font-weight: 600;
  color: #ffffff;
  margin: 0 0 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gift-confirm-item-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0 0 6px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.gift-confirm-item-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0;
}

.gift-confirm-item-category {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 8px;
  border-radius: 6px;
}

.gift-confirm-item-quantity {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.4);
}

/* Hint */
.gift-confirm-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
  margin: 0;
  line-height: 1.5;
}

.gift-confirm-hint strong {
  color: rgba(255, 255, 255, 0.85);
  font-weight: 600;
}

/* Footer */
.gift-confirm-footer {
  display: flex;
  gap: 10px;
  padding: 16px 20px 20px;
}

.gift-confirm-btn {
  flex: 1;
  padding: 13px 16px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  letter-spacing: 0.01em;
}
  .platform-android.android-portrait .gift-confirm-btn {
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
.gift-confirm-btn.cancel {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.65);
}

.gift-confirm-btn.cancel:hover {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.06));
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.15);
}

.gift-confirm-btn.confirm {
  background: linear-gradient(135deg, rgba(46, 204, 113, 0.25), rgba(46, 204, 113, 0.12));
  border: 1px solid rgba(46, 204, 113, 0.25);
  color: #2ecc71;
}

.gift-confirm-btn.confirm:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(46, 204, 113, 0.38), rgba(46, 204, 113, 0.22));
  border-color: rgba(46, 204, 113, 0.4);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(46, 204, 113, 0.2);
}

.gift-confirm-btn.confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
