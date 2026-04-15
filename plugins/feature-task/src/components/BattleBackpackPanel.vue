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
</script>

<template>
  <Teleport to="body">
    <Transition name="backpack-panel">
      <div v-if="isOpen" class="backpack-overlay" @click.self="handleClose">
        <section class="backpack-panel">
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
              <div class="item-icon">
                <span>{{ item.icon || '📦' }}</span>
              </div>
              <div class="item-info">
                <div class="item-name">{{ item.name }}</div>
                <div class="item-desc">{{ item.description }}</div>
                <div class="item-meta">
                  <span class="item-type">{{ EFFECT_TYPE_LABELS[item.effectType] || item.effectType }}</span>
                  <span v-if="item.usageCount > 1" class="item-uses">x{{ item.usageCount }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.backpack-panel-enter-active,
.backpack-panel-leave-active {
  transition: opacity 0.2s ease;
}

.backpack-panel-enter-from,
.backpack-panel-leave-to {
  opacity: 0;
}

.backpack-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1001;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.backpack-panel {
  width: 100%;
  max-height: 60vh;
  background: #1a1a1a;
  color: var(--foreground, #ffffff);
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.backpack-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.backpack-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.backpack-close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 18px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.backpack-list {
  overflow-y: auto;
  padding: 8px;
}

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
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 6px;
}

.backpack-item:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.item-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(234, 179, 8, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
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
  background: rgba(59, 130, 246, 0.2);
  border-radius: 3px;
  color: #60a5fa;
}

.item-uses {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}
</style>
