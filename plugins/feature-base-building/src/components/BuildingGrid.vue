<script setup>
import { computed } from 'vue'

const props = defineProps({
  facilities: { type: Array, default: () => [] },
})

const emit = defineEmits(['facility-click'])

const categories = computed(() => {
  const map = new Map()
  props.facilities.forEach(f => {
    if (!map.has(f.category)) {
      map.set(f.category, { key: f.category, label: f.categoryLabel, items: [] })
    }
    map.get(f.category).items.push(f)
  })
  return Array.from(map.values())
})

function handleClick(facility) {
  emit('facility-click', facility)
}
</script>

<template>
  <div class="building-grid">
    <div
      v-for="cat in categories"
      :key="cat.key"
      class="facility-category"
    >
      <div class="category-label">{{ cat.label }}</div>
      <div class="facility-grid">
        <div
          v-for="facility in cat.items"
          :key="facility.id"
          class="facility-card"
          :class="{
            'not-built': !facility.instance,
            'building': facility.instance?.status === 'building',
          }"
          @click="handleClick(facility)"
        >
          <span class="facility-icon">{{ facility.icon }}</span>
          <span class="facility-name">{{ facility.name }}</span>
          <span v-if="facility.instance" class="facility-level">Lv.{{ facility.instance.level }}</span>
          <span v-else class="facility-status">未建造</span>
          <span v-if="facility.instance?.status === 'building'" class="facility-building">建造中...</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.building-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.category-label {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.facility-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.facility-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.facility-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}

.facility-card.not-built {
  opacity: 0.5;
}

.facility-card.building {
  border-color: #f59e0b;
}

.facility-icon {
  font-size: 28px;
}

.facility-name {
  font-size: 12px;
  color: #fff;
  text-align: center;
}

.facility-level {
  font-size: 11px;
  color: #4a9eff;
  font-weight: 500;
}

.facility-status {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
}

.facility-building {
  font-size: 11px;
  color: #f59e0b;
}
</style>
