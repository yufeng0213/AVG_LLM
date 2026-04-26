<script setup>
/**
 * 采集背包面板
 */

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  items: { type: Array, default: () => [] },
})

const emit = defineEmits(['close'])

const RARITY_COLORS = { common: '#9ca3af', rare: '#3b82f6', epic: '#a855f7' }
const RARITY_LABELS = { common: '普通', rare: '稀有', epic: '史诗' }
</script>

<template>
  <Teleport to="body">
    <Transition name="collect-backpack-panel">
      <div v-if="isOpen" class="collect-backpack-overlay" @click.self="emit('close')">
        <div class="collect-backpack-panel">
          <header class="collect-backpack-header">
            <h3 class="collect-backpack-title">🎒 采集背包</h3>
            <button type="button" class="collect-backpack-close-btn" @click="emit('close')">×</button>
          </header>

          <div class="collect-backpack-list">
            <div v-if="items.length === 0" class="collect-backpack-empty">
              背包为空
            </div>

            <div
              v-for="item in items"
              :key="item.id"
              class="collect-backpack-item"
              :style="{ borderColor: (RARITY_COLORS[item.rarity] || '#9ca3af') + '40' }"
            >
              <div class="item-icon">
                <span>{{ item.icon || '📦' }}</span>
              </div>
              <div class="item-info">
                <div class="item-name">{{ item.name }}</div>
                <div class="item-meta">
                  <span class="item-rarity" :style="{ color: RARITY_COLORS[item.rarity] || '#9ca3af' }">
                    {{ RARITY_LABELS[item.rarity] || item.rarity }}
                  </span>
                  <span class="item-points">{{ item.points || 0 }} 分</span>
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
.collect-backpack-panel-enter-active { animation: collect-backpack-pop 0.3s ease-out; }
.collect-backpack-panel-leave-active { transition: opacity 0.2s ease; }
.collect-backpack-panel-enter-from,
.collect-backpack-panel-leave-to { opacity: 0; }
@keyframes collect-backpack-pop { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }

.collect-backpack-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5);
  z-index: 1001; display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(4px);
}

.collect-backpack-panel {
  width: 90%; max-width: 420px; max-height: 70vh;
  background: rgba(10, 10, 18, 0.95); border: 1px solid rgba(251, 191, 36, 0.2);
  border-radius: 16px; display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
}

.collect-backpack-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); flex-shrink: 0;
}
.collect-backpack-title { margin: 0; font-size: 15px; font-weight: 700; }
.collect-backpack-close-btn {
  width: 30px; height: 30px; border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06); color: #fff; font-size: 16px;
  border-radius: 8px; cursor: pointer; display: flex; align-items: center;
  justify-content: center; transition: all 0.15s;
}
.collect-backpack-close-btn:hover { background: rgba(255, 255, 255, 0.12); }

.collect-backpack-list { overflow-y: auto; padding: 10px; }
.collect-backpack-list::-webkit-scrollbar { width: 3px; }
.collect-backpack-list::-webkit-scrollbar-track { background: transparent; }
.collect-backpack-list::-webkit-scrollbar-thumb { background: rgba(251, 191, 36, 0.2); border-radius: 3px; }

.collect-backpack-empty { text-align: center; padding: 32px; color: rgba(255, 255, 255, 0.3); font-size: 14px; }

.collect-backpack-item {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px;
  background: rgba(255, 255, 255, 0.04); border: 1px solid; border-radius: 10px;
  margin-bottom: 6px;
}

.item-icon {
  width: 40px; height: 40px; border-radius: 8px;
  background: rgba(251, 191, 36, 0.1); display: flex; align-items: center;
  justify-content: center; font-size: 18px; flex-shrink: 0;
}

.item-info { flex: 1; min-width: 0; }
.item-name { font-size: 13px; font-weight: 600; }
.item-meta { display: flex; gap: 6px; margin-top: 2px; }
.item-rarity { font-size: 10px; font-weight: 500; }
.item-points { font-size: 10px; color: rgba(255, 255, 255, 0.4); }
</style>
