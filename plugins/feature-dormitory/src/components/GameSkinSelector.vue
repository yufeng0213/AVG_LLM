<script setup>
/**
 * GameSkinSelector.vue - 小游戏皮肤选择器
 * 可复用于所有小游戏，显示皮肤列表、购买、切换
 */

const emit = defineEmits(['select', 'buy', 'close'])
const props = defineProps({
  skins: { type: Array, required: true },
  ownedIds: { type: Array, default: () => [] },
  activeId: { type: String, default: '' },
  coins: { type: Number, default: 0 },
})

function handleSelect(skin) {
  if (props.ownedIds.includes(skin.id)) {
    emit('select', skin.id)
  }
}

function handleBuy(skin) {
  if (skin.price <= 0) return
  emit('buy', { skinId: skin.id, price: skin.price })
}
</script>

<template>
  <Transition name="skin-fade">
    <div class="skin-selector-overlay" @click.self="emit('close')">
      <div class="skin-selector-panel">
        <div class="selector-header">
          <h3 class="selector-title">🎨 选择主题</h3>
          <button type="button" class="selector-close" @click="emit('close')">×</button>
        </div>
        <div class="selector-body">
          <div class="skin-grid">
            <div
              v-for="skin in skins"
              :key="skin.id"
              class="skin-card"
              :class="{
                'skin-owned': ownedIds.includes(skin.id),
                'skin-active': activeId === skin.id && ownedIds.includes(skin.id),
              }"
              @click="handleSelect(skin)"
            >
              <div class="skin-preview" :style="skin.previewStyle || {}">
                <span class="skin-emoji">{{ skin.name.split(' ')[0] }}</span>
              </div>
              <div class="skin-info">
                <span class="skin-name">{{ skin.name.split(' ').slice(1).join(' ') || skin.name }}</span>
                <template v-if="skin.price > 0">
                  <span v-if="!ownedIds.includes(skin.id)" class="skin-price">
                    {{ skin.price }} 💰
                  </span>
                  <span v-else-if="activeId === skin.id" class="skin-status">使用中</span>
                  <span v-else class="skin-status">已拥有</span>
                </template>
                <span v-else class="skin-status">默认</span>
              </div>
              <!-- 购买按钮 -->
              <button
                v-if="skin.price > 0 && !ownedIds.includes(skin.id)"
                type="button"
                class="skin-buy-btn"
                :class="{ disabled: coins < skin.price }"
                :disabled="coins < skin.price"
                @click.stop="handleBuy(skin)"
              >
                {{ coins >= skin.price ? '购买' : '金币不足' }}
              </button>
              <!-- 切换按钮 -->
              <button
                v-else-if="ownedIds.includes(skin.id) && activeId !== skin.id"
                type="button"
                class="skin-switch-btn"
                @click.stop="handleSelect(skin)"
              >
                切换
              </button>
            </div>
          </div>
        </div>
        <p class="selector-hint">点击皮肤卡片切换主题，未拥有的皮肤可购买</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.skin-selector-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  z-index: 10010;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.skin-selector-panel {
  background: rgba(20, 15, 35, 0.98);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 20px;
  max-width: 480px;
  width: 100%;
  max-height: 60vh;
  overflow-y: auto;
}

.selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.selector-title {
  margin: 0;
  font-size: 18px;
  color: #ffd700;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.2);
}

.selector-close {
  background: none;
  border: none;
  font-size: 28px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
}
.selector-close:hover { color: #fff; }

.selector-body {
  margin-bottom: 12px;
}

.skin-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.skin-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.skin-card:hover { background: rgba(255, 255, 255, 0.06); transform: translateY(-2px); }
.skin-owned { border-color: rgba(34, 197, 94, 0.3); }
.skin-active {
  border-color: #ffd700;
  background: rgba(255, 215, 0, 0.08);
  box-shadow: 0 0 15px rgba(255, 215, 0, 0.15);
}

.skin-preview {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
}
.skin-active .skin-preview { border-color: #ffd700; }
.skin-emoji { font-size: 24px; }

.skin-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.skin-name {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  text-align: center;
}

.skin-price {
  font-size: 12px;
  font-weight: 700;
  color: #ffd700;
}

.skin-status {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
}
.skin-active .skin-status { color: #ffd700; font-weight: 600; }

.skin-buy-btn {
  margin-top: 4px;
  padding: 4px 12px;
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 6px;
  background: rgba(255, 215, 0, 0.1);
  color: #ffd700;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.skin-buy-btn:hover:not(:disabled) { background: rgba(255, 215, 0, 0.2); }
.skin-buy-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.03);
}

.skin-switch-btn {
  margin-top: 4px;
  padding: 4px 12px;
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 6px;
  background: rgba(34, 197, 94, 0.1);
  color: #4ade80;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.skin-switch-btn:hover { background: rgba(34, 197, 94, 0.2); }

.selector-hint {
  margin: 0;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
}

/* Transition */
.skin-fade-enter-active, .skin-fade-leave-active { transition: all 0.3s ease; }
.skin-fade-enter-from, .skin-fade-leave-to { opacity: 0; }
</style>
