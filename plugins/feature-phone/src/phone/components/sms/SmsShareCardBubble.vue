<script setup>
/**
 * SmsShareCardBubble.vue - 分享卡片气泡（书籍/网页）
 */
import { computed } from 'vue'

const props = defineProps({
  shareCard: { type: Object, required: true },
})

const isBrowser = computed(() => props.shareCard.shareType === 'browser')
</script>

<template>
  <div class="share-card-bubble" :class="{ 'share-card--browser': isBrowser }">
    <div class="share-card-icon">{{ isBrowser ? '🧭' : '📖' }}</div>
    <div class="share-card-content">
      <div class="share-card-title">{{ shareCard.storyTitle }}</div>
      <div v-if="shareCard.chapterTitle" class="share-card-chapter">{{ shareCard.chapterTitle }}</div>
      <div v-if="isBrowser && shareCard.sourceUrl" class="share-card-url">{{ shareCard.sourceUrl }}</div>
      <div class="share-card-excerpt">{{ shareCard.excerpt }}</div>
    </div>
  </div>
</template>

<style scoped>
.share-card-bubble {
  background: linear-gradient(135deg, #f8f0ff, #f0e8ff);
  border: 1px solid #d4c4f0;
  border-radius: 14px;
  padding: 12px;
  max-width: 260px;
  display: flex;
  gap: 10px;
  box-shadow: 0 2px 8px rgba(124, 92, 191, 0.08);
}

.share-card-icon {
  font-size: 1.6rem;
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 2px;
}

.share-card-content {
  min-width: 0;
  flex: 1;
}

.share-card-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: #2d2040;
  margin-bottom: 2px;
}

.share-card-chapter {
  font-size: 0.72rem;
  color: #8b7ea8;
  margin-bottom: 6px;
}

.share-card-excerpt {
  font-size: 0.75rem;
  color: #4a3d5c;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.share-card--browser {
  background: linear-gradient(135deg, #e8f4ff, #e0ecff);
  border-color: #b8d4f0;
}

.share-card--browser .share-card-title {
  color: #1a3050;
}

.share-card-url {
  font-size: 0.68rem;
  color: #007aff;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
