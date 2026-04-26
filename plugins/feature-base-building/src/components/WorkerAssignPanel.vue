<script setup>
import { computed } from 'vue'

const props = defineProps({
  workers: { type: Object, default: () => ({}) },
  characters: { type: Array, default: () => [] },
  facilityDefs: { type: Array, default: () => [] },
})

const emit = defineEmits(['assign', 'remove'])

const workerList = computed(() => {
  return Object.entries(props.workers).map(([charId, worker]) => {
    const facility = props.facilityDefs.find(f => f.id === worker.facilityId)
    return {
      charId,
      facilityId: worker.facilityId,
      facilityName: facility?.name || worker.facilityId,
      fatigue: worker.fatigue || 0,
      assignedAt: worker.assignedAt,
    }
  })
})

function handleRemove(charId) {
  emit('remove', charId)
}
</script>

<template>
  <div class="worker-panel">
    <div class="worker-header">
      <span>工人分配</span>
      <span class="worker-count">{{ workerList.length }} 人工作中</span>
    </div>

    <div v-if="workerList.length === 0" class="worker-empty">
      暂无角色被派遣到设施
    </div>

    <div v-else class="worker-list">
      <div v-for="worker in workerList" :key="worker.charId" class="worker-card">
        <div class="worker-info">
          <span class="worker-char">{{ worker.charId }}</span>
          <span class="worker-facility">→ {{ worker.facilityName }}</span>
        </div>
        <div class="worker-fatigue">
          <div class="fatigue-bar">
            <div
              class="fatigue-fill"
              :style="{ width: `${worker.fatigue}%` }"
              :class="{ high: worker.fatigue > 70 }"
            ></div>
          </div>
          <span class="fatigue-text">疲劳 {{ worker.fatigue }}%</span>
        </div>
        <button class="worker-remove" @click="handleRemove(worker.charId)">撤回</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.worker-panel {
  padding: 8px 0;
}

.worker-header {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 8px;
}

.worker-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 400;
}

.worker-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  font-size: 12px;
  padding: 20px 0;
}

.worker-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.worker-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
}

.worker-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.worker-char {
  font-size: 13px;
  color: #fff;
  font-weight: 500;
}

.worker-facility {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.worker-fatigue {
  width: 100px;
}

.fatigue-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.fatigue-fill {
  height: 100%;
  background: #22c55e;
  transition: width 0.3s, background 0.3s;
}

.fatigue-fill.high {
  background: #ef4444;
}

.fatigue-text {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}

.worker-remove {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  cursor: pointer;
}
</style>
