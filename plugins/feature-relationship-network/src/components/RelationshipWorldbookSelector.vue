<template>
  <div class="relationship-selector">
    <div class="selector-title">选择世界书</div>
    <div v-if="books.length === 0" class="empty-text">暂无世界书</div>
    <div v-else class="book-list">
      <div
        v-for="book in books"
        :key="book.id"
        class="book-item"
        @click="$emit('select', book.id)"
      >
        <div class="book-name">{{ book.title }}</div>
        <div class="book-info">
          {{ book.characters?.length || 0 }} 个角色
          <span v-if="countRelationships(book) > 0">
            · {{ countRelationships(book) }} 条关系
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { loadWorldBookSummaries } from '../../../../src/worldbook/worldBookStore.js'

defineEmits(['select'])

const books = ref([])

function countRelationships(book) {
  if (!book.relationships) return 0
  let count = 0
  for (const targets of Object.values(book.relationships)) {
    count += Object.keys(targets).length
  }
  return count
}

onMounted(async () => {
  const summaries = await loadWorldBookSummaries()
  books.value = summaries.filter(b => (b.characters?.length || 0) >= 2)
})
</script>

<style scoped>
.relationship-selector {
  padding: 16px;
  flex: 1;
  overflow-y: auto;
}
.selector-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 12px;
  text-align: center;
}
.book-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 20px;
}
.book-item {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.2s;
}
.book-item:active {
  background: rgba(255, 255, 255, 0.2);
}
.book-name {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
}
.book-info {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
}
.empty-text {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  padding: 24px 0;
}
</style>
