<script setup>
/**
 * 背包面板组件
 * 显示背包物品列表和交互选项
 */

const props = defineProps({
  backpackItems: {
    type: Array,
    default: () => []
  },
  selectedItemId: {
    type: [String, Number],
    default: null
  }
})

const emit = defineEmits([
  'close',
  'select-item',
  'use-item',
  'give-item'
])

function handleClose() {
  emit('close')
}

function handleSelectItem(item) {
  emit('select-item', item)
}

function handleUseItem(item) {
  emit('use-item', item)
}

function handleGiveItem(item) {
  emit('give-item', item)
}

function getItemIcon(itemType) {
  const icons = {
    gift: '🎁',
    food: '🍱',
    book: '📚',
    flower: '🌸',
    letter: '💌',
    default: '📦'
  }
  return icons[itemType] || icons.default
}
</script>

<template>
  <section class="backpack-panel">
    <header class="panel-header">
      <h3>背包</h3>
      <button class="close-btn" @click="handleClose">✕</button>
    </header>

    <div class="backpack-content" v-if="backpackItems.length > 0">
      <div
        v-for="item in backpackItems"
        :key="item.id"
        class="backpack-item"
        :class="{ selected: selectedItemId === item.id }"
        @click="handleSelectItem(item)"
      >
        <div class="item-icon">{{ getItemIcon(item.type) }}</div>
        <div class="item-info">
          <div class="item-name">{{ item.name }}</div>
          <div class="item-desc">{{ item.description || '' }}</div>
        </div>
        <div class="item-actions" v-if="selectedItemId === item.id">
          <button class="action-btn" @click.stop="handleUseItem(item)">使用</button>
          <button class="action-btn" @click.stop="handleGiveItem(item)">赠送</button>
        </div>
      </div>
    </div>

    <div v-else class="empty-backpack">
      <p>背包是空的</p>
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
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e0e0e0;
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #666;
  padding: 4px 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 28px;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:hover {
  color: #333;
  background: rgba(0, 0, 0, 0.06);
}

.backpack-content {
  flex: 1;
  overflow-y: auto;
}

.backpack-item {
  display: flex;
  align-items: center;
  padding: 12px;
  margin-bottom: 8px;
  background: #f8f9fa;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.backpack-item:hover {
  background: #e9ecef;
}

.backpack-item.selected {
  background: #e3f2fd;
  border: 1px solid #2196f3;
}

.item-icon {
  font-size: 24px;
  margin-right: 12px;
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.item-desc {
  font-size: 12px;
  color: #666;
}

.item-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 6px 12px;
  background: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.action-btn:hover {
  background: #1976d2;
}

.empty-backpack {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
}

/* Android竖屏适配 */
.platform-android.android-portrait .close-btn {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  min-height: 36px !important;
  font-size: 1.2rem !important;
  padding: 0 !important;
  flex-shrink: 0 !important;
  box-sizing: border-box !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 50% !important;
}
</style>
