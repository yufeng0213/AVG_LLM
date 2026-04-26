<script setup>
/**
 * 战斗背包面板
 * 显示战斗中获得的可使用道具
 */

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  items: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['close', 'use-item'])

function handleUseItem(item) {
  emit('use-item', item)
}

function handleClose() {
  emit('close')
}

const EFFECT_TYPE_LABELS = {
  heal: '治疗',
  damage: '伤害',
  buff: '增益',
  debuff_cleanse: '净化',
  shield: '护盾',
  attackUp: '攻击提升',
  defenseUp: '防御提升',
  healOverTime: '持续治疗',
}

const EFFECT_TYPE_COLORS = {
  heal: '#22c55e',
  damage: '#ef4444',
  buff: '#3b82f6',
  debuff_cleanse: '#a855f7',
  shield: '#60a5fa',
  attackUp: '#f97316',
  defenseUp: '#06b6d4',
  healOverTime: '#22c55e',
}
</script>

<template>
  <Teleport to="body">
    <Transition name="backpack-panel">
      <div v-if="isOpen" class="backpack-overlay" @click.self="handleClose">
        <div class="backpack-panel">
          <header class="backpack-header">
            <h3 class="backpack-title">🎒 战斗背包</h3>
            <button type="button" class="backpack-close-btn" @click="handleClose">×</button>
          </header>

          <div class="backpack-list">
            <div v-if="items.length === 0" class="backpack-empty">
              背包为空
            </div>

            <div
              v-for="item in items"
              :key="item.id"
              class="backpack-item"
              @click="handleUseItem(item)"
            >
              <div class="item-icon" :style="{ borderColor: EFFECT_TYPE_COLORS[item.effectType] + '40', background: EFFECT_TYPE_COLORS[item.effectType] + '15' }">
                <span>{{ item.icon || '📦' }}</span>
              </div>
              <div class="item-info">
                <div class="item-name">{{ item.name }}</div>
                <div class="item-desc">{{ item.description }}</div>
                <div class="item-meta">
                  <span class="item-type" :style="{ color: EFFECT_TYPE_COLORS[item.effectType] || '#60a5fa', background: (EFFECT_TYPE_COLORS[item.effectType] || '#3b82f6') + '20' }">
                    {{ EFFECT_TYPE_LABELS[item.effectType] || item.effectType }}
                  </span>
                  <span v-if="item.usageCount > 1" class="item-uses">x{{ item.usageCount }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.backpack-panel-enter-active {
  animation: backpack-pop 0.3s ease-out;
}
.backpack-panel-leave-active {
  transition: opacity 0.2s ease;
}
.backpack-panel-enter-from,
.backpack-panel-leave-to {
  opacity: 0;
}

@keyframes backpack-pop {
  0% { opacity: 0; transform: scale(0.92); }
  100% { opacity: 1; transform: scale(1); }
}

.backpack-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.backpack-panel {
  width: 90%;
  max-width: 420px;
  max-height: 70vh;
  background: rgba(10, 10, 18, 0.95);
  border: 1px solid rgba(96, 165, 250, 0.2);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
}

.backpack-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.backpack-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.backpack-close-btn {
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 16px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.backpack-close-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.3);
}

.backpack-list {
  overflow-y: auto;
  padding: 10px;
}
.backpack-list::-webkit-scrollbar { width: 3px; }
.backpack-list::-webkit-scrollbar-track { background: transparent; }
.backpack-list::-webkit-scrollbar-thumb { background: rgba(96, 165, 250, 0.2); border-radius: 3px; }

.backpack-empty {
  text-align: center;
  padding: 32px;
  color: rgba(255, 255, 255, 0.3);
  font-size: 14px;
}

.backpack-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 6px;
}

.backpack-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(96, 165, 250, 0.3);
}

.item-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: 1px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-desc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  align-items: center;
}

.item-type {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.item-uses {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}
</style>
