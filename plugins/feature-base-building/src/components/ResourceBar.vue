<script setup>
defineProps({
  resources: { type: Array, default: () => [] },
})
</script>

<template>
  <div class="resource-bar">
    <div
      v-for="res in resources"
      :key="res.id"
      class="resource-item"
      :title="`${res.name} (${res.categoryLabel})`"
    >
      <span class="resource-icon">{{ res.icon }}</span>
      <span class="resource-count">{{ res.current }}</span>
    </div>
  </div>
</template>

<style scoped>
.resource-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.resource-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  font-size: 12px;
}

.resource-icon {
  font-size: 14px;
}

.resource-count {
  color: #fff;
  font-weight: 500;
  min-width: 2ch;
  text-align: right;
}
</style>
