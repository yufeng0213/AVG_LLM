<script setup>
import { computed } from 'vue'

const props = defineProps({
  facility: { type: Object, required: true },
  resources: { type: Array, default: () => [] },
})

const emit = defineEmits(['upgrade', 'close'])

const instance = computed(() => props.facility.instance || { level: 0, status: 'not-built' })
const canUpgrade = computed(() => {
  if (instance.value.status === 'building') return false
  if (instance.value.level >= 5) return false
  return true
})

const upgradeCostList = computed(() => {
  const cost = props.facility.upgradeCost || {}
  return Object.entries(cost).map(([resId, amount]) => {
    const def = props.resources.find(r => r.id === resId)
    const has = def ? def.current : 0
    return {
      id: resId,
      name: def?.name || resId,
      icon: def?.icon || '❓',
      needed: amount,
      has,
      sufficient: has >= amount,
    }
  })
})

const allCostsMet = computed(() => {
  return upgradeCostList.value.length > 0 && upgradeCostList.value.every(c => c.sufficient)
})

function handleUpgrade() {
  emit('upgrade', props.facility.id)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="detail-fade">
      <div class="building-detail-overlay" @click.self="emit('close')">
        <div class="building-detail-panel">
          <div class="detail-header">
            <div class="detail-title">
              <span class="detail-icon">{{ facility.icon }}</span>
              <span>{{ facility.name }}</span>
            </div>
            <button class="detail-close" @click="emit('close')">✕</button>
          </div>

          <div class="detail-body">
            <div class="detail-section">
              <div class="detail-label">分类</div>
              <div class="detail-value">{{ facility.categoryLabel }}</div>
            </div>

            <div class="detail-section">
              <div class="detail-label">等级</div>
              <div class="detail-value">
                <span v-if="instance.level > 0">Lv.{{ instance.level }} / 5</span>
                <span v-else class="not-built-text">未建造</span>
              </div>
            </div>

            <div class="detail-section" v-if="facility.produces">
              <div class="detail-label">产出</div>
              <div class="detail-value">{{ facility.output }}</div>
            </div>

            <!-- Upgrade section -->
            <div v-if="instance.level > 0 && canUpgrade" class="detail-section upgrade-section">
              <div class="detail-label">升级费用</div>
              <div class="cost-list">
                <div
                  v-for="cost in upgradeCostList"
                  :key="cost.id"
                  class="cost-item"
                  :class="{ sufficient: cost.sufficient }"
                >
                  <span>{{ cost.icon }} {{ cost.name }}</span>
                  <span :class="{ 'cost-red': !cost.sufficient }">
                    {{ cost.has }} / {{ cost.needed }}
                  </span>
                </div>
              </div>
              <button
                class="upgrade-btn"
                :disabled="!allCostsMet"
                @click="handleUpgrade"
              >
                {{ instance.level >= 5 ? '已满级' : `升级到 Lv.${instance.level + 1}` }}
              </button>
            </div>

            <!-- Build section for not-yet-built -->
            <div v-if="instance.level === 0" class="detail-section upgrade-section">
              <div class="detail-label">建造费用</div>
              <div class="cost-list">
                <div
                  v-for="cost in upgradeCostList"
                  :key="cost.id"
                  class="cost-item"
                  :class="{ sufficient: cost.sufficient }"
                >
                  <span>{{ cost.icon }} {{ cost.name }}</span>
                  <span :class="{ 'cost-red': !cost.sufficient }">
                    {{ cost.has }} / {{ cost.needed }}
                  </span>
                </div>
              </div>
              <button
                class="upgrade-btn"
                :disabled="!allCostsMet"
                @click="handleUpgrade"
              >
                建造
              </button>
            </div>

            <div v-if="instance.status === 'building'" class="building-progress">
              <div class="progress-bar">
                <div class="progress-fill"></div>
              </div>
              <span class="progress-text">建造中...</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.building-detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.building-detail-panel {
  background: #1a1a2e;
  border-radius: 12px;
  width: min(400px, 90vw);
  max-height: 80vh;
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.detail-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}

.detail-icon {
  font-size: 20px;
}

.detail-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 16px;
  cursor: pointer;
}

.detail-body {
  padding: 16px;
  max-height: 60vh;
  overflow-y: auto;
}

.detail-section {
  margin-bottom: 12px;
}

.detail-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 4px;
}

.detail-value {
  font-size: 14px;
  color: #fff;
}

.not-built-text {
  color: rgba(255, 255, 255, 0.3);
}

.upgrade-section {
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.cost-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.cost-item {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.cost-item.sufficient {
  color: rgba(255, 255, 255, 0.8);
}

.cost-red {
  color: #ef4444 !important;
}

.upgrade-btn {
  width: 100%;
  padding: 8px;
  background: #4a9eff;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.upgrade-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.building-progress {
  margin-top: 8px;
  text-align: center;
}

.progress-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}

.progress-fill {
  height: 100%;
  width: 50%;
  background: #f59e0b;
  border-radius: 2px;
  animation: pulse 1s ease-in-out infinite;
}

.progress-text {
  font-size: 11px;
  color: #f59e0b;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.detail-fade-enter-active,
.detail-fade-leave-active {
  transition: opacity 0.15s;
}

.detail-fade-enter-from,
.detail-fade-leave-to {
  opacity: 0;
}
</style>
