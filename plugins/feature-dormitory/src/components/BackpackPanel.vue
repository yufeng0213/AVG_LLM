<script setup>
/**
 * 背包面板组件
 * 显示背包物品列表和交互选项
 */
import { ref } from 'vue'

const props = defineProps({
  backpackItems: {
    type: Array,
    default: () => []
  }
})

const selectedItemId = ref(null)
const emit = defineEmits([
  'close',
  'use-item',
  'give-item'
])

function handleClose() {
  emit('close')
}

function handleSelectItem(item) {
  selectedItemId.value = selectedItemId.value === item.id ? null : item.id
}

function handleUseItem(item) {
  emit('use-item', item)
}

function handleGiveItem(item) {
  emit('give-item', item)
}
</script>

<template>
  <section class="backpack-panel">
    <header class="panel-header">
      <div class="header-left">
        <h3>🎒 背包</h3>
        <span class="item-count">{{ backpackItems.length }} 件物品</span>
      </div>
      <button class="close-btn" @click="handleClose">✕</button>
    </header>

    <div class="backpack-content" v-if="backpackItems.length > 0">
      <TransitionGroup name="item-list">
        <div
          v-for="item in backpackItems"
          :key="item.id"
          class="backpack-item"
          :class="{ selected: selectedItemId === item.id }"
          @click="handleSelectItem(item)"
        >
          <div class="item-icon-wrap">
            <span class="item-icon">{{ item.icon }}</span>
          </div>
          <div class="item-info">
            <div class="item-name">{{ item.name }}</div>
            <div class="item-desc">{{ item.description || '暂无描述' }}</div>
          </div>
          <Transition name="actions">
            <div v-if="selectedItemId === item.id" class="item-actions" @click.stop>
              <button class="action-btn action-use" @click.stop="handleUseItem(item)">
                使用
              </button>
              <button class="action-btn action-give" @click.stop="handleGiveItem(item)">
                赠送
              </button>
            </div>
          </Transition>
        </div>
      </TransitionGroup>
    </div>

    <div v-else class="empty-backpack">
      <div class="empty-icon">📦</div>
      <p>背包是空的</p>
      <span class="empty-hint">去商店逛逛吧</span>
    </div>
  </section>
</template>

<style scoped>
.backpack-panel {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, rgba(30, 30, 35, 0.92) 0%, rgba(20, 20, 25, 0.96) 100%);
  backdrop-filter: blur(40px) saturate(1.8);
  -webkit-backdrop-filter: blur(40px) saturate(1.8);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* Header */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
}

.item-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
  font-weight: 400;
}

.close-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 18px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.6);
  width: 32px;
  height: 32px;
  min-width: 32px;
  min-height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s ease;
}

.close-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.15);
}

/* Content */
.backpack-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.backpack-content::-webkit-scrollbar {
  width: 4px;
}

.backpack-content::-webkit-scrollbar-track {
  background: transparent;
}

.backpack-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

/* Item */
.backpack-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 14px;
  margin-bottom: 8px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  overflow: hidden;
}

.backpack-item:hover {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.03));
  border-color: rgba(255, 255, 255, 0.12);
}

.backpack-item.selected,
.backpack-item.selected:hover {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)) !important;
  border-color: rgba(255, 255, 255, 0.15);
}

/* Icon */
.item-icon-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.item-icon {
  font-size: 28px;
  line-height: 1;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3));
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.backpack-item:hover .item-icon {
  transform: scale(1.1);
}

.item-badge {
  font-size: 9px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.backpack-item.selected .item-badge {
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.08);
}

/* Info */
.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.item-name {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.backpack-item.selected .item-desc {
  color: rgba(255, 255, 255, 0.55);
}

/* Actions */
.item-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.action-btn {
  padding: 7px 14px;
  border: none;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}
  .platform-android.android-portrait .action-btn  {
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
.action-use {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04));
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.85);
}

.action-use:hover {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.08));
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
  box-shadow: 0 3px 12px rgba(255, 255, 255, 0.08);
}

.action-give {
  background: linear-gradient(135deg, rgba(46, 204, 113, 0.2), rgba(46, 204, 113, 0.08));
  border: 1px solid rgba(46, 204, 113, 0.2);
  color: #2ecc71;
}

.action-give:hover {
  background: linear-gradient(135deg, rgba(46, 204, 113, 0.35), rgba(46, 204, 113, 0.18));
  border-color: rgba(46, 204, 113, 0.4);
  transform: translateY(-1px);
  box-shadow: 0 3px 12px rgba(46, 204, 113, 0.2);
}

/* Empty state */
.empty-backpack {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.3);
}

.empty-icon {
  font-size: 48px;
  opacity: 0.4;
  filter: grayscale(0.5);
}

.empty-backpack p {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.4);
}

.empty-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.2);
}

/* Transitions */
.item-list-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.item-list-leave-active {
  transition: all 0.2s ease;
}

.item-list-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.item-list-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.actions-enter-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.actions-leave-active {
  transition: all 0.15s ease;
}

.actions-enter-from {
  opacity: 0;
  transform: scale(0.85);
}

.actions-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

/* Android竖屏适配 */
.platform-android.android-portrait .close-btn {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  font-size: 20px !important;
}
</style>
