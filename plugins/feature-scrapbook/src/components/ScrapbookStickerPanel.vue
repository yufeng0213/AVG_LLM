<script setup>
/**
 * ScrapbookStickerPanel.vue - 贴纸面板
 * 显示已导入的贴纸模板，点击添加到页面。
 */
import { ref, computed, onMounted } from 'vue'
import { loadTemplates, deleteTemplate } from '../composables/useStickerData.js'

const emit = defineEmits(['add-sticker', 'close'])

const templates = ref([])
const selectedCategory = ref('all')

onMounted(async () => {
  templates.value = await loadTemplates()
})

function handleAdd(template) {
  emit('add-sticker', template)
}

async function handleDelete(template) {
  if (confirm(`删除贴纸「${template.name}」？`)) {
    await deleteTemplate(template.id)
    templates.value = templates.value.filter(t => t.id !== template.id)
  }
}

const categories = computed(() => {
  const cats = new Set(templates.value.map(t => t.category))
  return ['all', ...cats]
})

const filteredTemplates = computed(() => {
  if (selectedCategory.value === 'all') return templates.value
  return templates.value.filter(t => t.category === selectedCategory.value)
})
</script>

<template>
  <div class="sticker-panel-overlay" @click.self="emit('close')">
    <div class="sticker-panel">
      <div class="sticker-panel-header">
        <span>贴纸库</span>
        <button class="sticker-panel-close" @click="emit('close')">×</button>
      </div>

      <!-- 分类标签 -->
      <div class="sticker-categories" v-if="categories.length > 2">
        <button
          v-for="cat in categories"
          :key="cat"
          :class="['cat-tag', { active: cat === selectedCategory }]"
          @click="selectedCategory = cat"
        >
          {{ cat === 'all' ? '全部' : cat }}
        </button>
      </div>

      <!-- 贴纸网格 -->
      <div v-if="filteredTemplates.length === 0" class="sticker-empty">
        <p>还没有贴纸</p>
        <p class="hint">点击右上角「导入」添加贴纸</p>
      </div>

      <div v-else class="sticker-grid">
        <div
          v-for="template in filteredTemplates"
          :key="template.id"
          class="sticker-thumb"
          @click="handleAdd(template)"
        >
          <img :src="template.imageData" :alt="template.name" />
          <span class="sticker-name">{{ template.name }}</span>
          <button class="sticker-thumb-del" @click.stop="handleDelete(template)">×</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sticker-panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10002;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sticker-panel {
  background: var(--reader-bg, #0a0a1a);
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  width: 100%;
  max-width: 600px;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  border-bottom: none;
}

.sticker-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--reader-border, rgba(255, 255, 255, 0.08));
  font-weight: 600;
}

.sticker-panel-close {
  background: none;
  border: none;
  color: var(--reader-text, #fff);
  font-size: 1.4rem;
  cursor: pointer;
  padding: 0 4px;
}

.sticker-categories {
  display: flex;
  gap: 6px;
  padding: 8px 16px;
  overflow-x: auto;
  flex-shrink: 0;
}

.cat-tag {
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  color: var(--reader-secondary, #8b9dc3);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.72rem;
  cursor: pointer;
  white-space: nowrap;
}

.cat-tag.active {
  background: var(--reader-accent-start, #667eea);
  color: #fff;
  border-color: var(--reader-accent-start, #667eea);
}

.sticker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 10px;
  padding: 12px 16px;
  overflow-y: auto;
}

.sticker-thumb {
  position: relative;
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--reader-border, rgba(255, 255, 255, 0.1));
  transition: border-color 0.15s;
}

.sticker-thumb:hover {
  border-color: var(--reader-accent-start, #667eea);
}

.sticker-thumb img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  background: #fff;
  display: block;
}

.sticker-name {
  display: block;
  padding: 4px 6px;
  font-size: 0.65rem;
  color: var(--reader-secondary, #8b9dc3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--reader-panel-bg, rgba(255, 255, 255, 0.04));
}

.sticker-thumb-del {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  color: #ff6b6b;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 14px;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.sticker-thumb:hover .sticker-thumb-del {
  display: inline-flex;
}

.sticker-empty {
  text-align: center;
  padding: 40px;
  color: var(--reader-secondary, #8b9dc3);
}

.sticker-empty .hint {
  font-size: 0.75rem;
  opacity: 0.6;
  margin-top: 8px;
}

.platform-android.android-portrait .sticker-thumb-del,
.platform-android.android-portrait .cat-tag,
.platform-android.android-portrait .sticker-panel-close {
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  flex: none !important;
  font-size: 1.1rem !important;
  padding: 6px 10px !important;
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 8px !important;
  white-space: nowrap !important;
}
</style>
