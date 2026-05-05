<script setup>
/**
 * ArchiveCardBubble.vue - 档案卡片气泡（用于档案馆网格视图和SMS消息）
 */
import { computed } from 'vue'
import { RARITY_CONFIG, CATEGORY_LABELS } from '../../services/archiveService.js'

const props = defineProps({
  card: { type: Object, required: true },
})

const rarityConfig = computed(() => RARITY_CONFIG[props.card.rarity] || RARITY_CONFIG.common)
const categoryLabel = computed(() => CATEGORY_LABELS[props.card.category] || props.card.category)
</script>

<template>
  <div class="archive-card-bubble" :style="{ borderColor: rarityConfig.color }">
    <div class="archive-card-header">
      <span class="archive-card-rarity" :style="{ backgroundColor: rarityConfig.color }">
        {{ rarityConfig.label }}
      </span>
      <span class="archive-card-category">{{ categoryLabel }}</span>
    </div>
    <div class="archive-card-title">{{ card.title }}</div>
    <div v-if="card.summary" class="archive-card-summary">{{ card.summary }}</div>
    <div v-if="card.tags?.length" class="archive-card-tags">
      <span v-for="tag in card.tags" :key="tag" class="archive-card-tag">{{ tag }}</span>
    </div>
    <div v-if="card.sourceUrl" class="archive-card-source">{{ card.sourceUrl }}</div>
  </div>
</template>

<style scoped>
.archive-card-bubble {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: transform 0.15s, box-shadow 0.15s;
}

.archive-card-bubble:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.archive-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.archive-card-rarity {
  font-size: 0.6rem;
  padding: 2px 6px;
  border-radius: 8px;
  color: #fff;
  font-weight: 600;
}

.archive-card-category {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.5);
}

.archive-card-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-card-summary {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.archive-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.archive-card-tag {
  font-size: 0.6rem;
  padding: 2px 6px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
}

.archive-card-source {
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.35);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
