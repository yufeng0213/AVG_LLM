<script setup>
/**
 * PronunciationNotebookView.vue - 笔记本页
 * 历史课程列表，点击即可回放。
 */
import { ref, onMounted } from 'vue'
import {
  loadNotebook,
  saveNotebook,
  deleteNotebookEntry,
  formatPronTime,
} from '../composables/usePronunciationData.js'

const emit = defineEmits(['back', 'open-entry'])

const notebook = ref([])
const isLoading = ref(true)

onMounted(async () => {
  notebook.value = await loadNotebook()
  isLoading.value = false
})

function openEntry(entry) {
  emit('open-entry', entry)
}

async function deleteEntry(entry) {
  if (!confirm(`确定删除「${entry.topic}」吗？`)) return
  const updated = deleteNotebookEntry(notebook.value, entry.id)
  await saveNotebook(updated)
  notebook.value = updated
}

const LANG_FLAGS = {
  en: '🇬🇧',
  zh: '🇨🇳',
  ja: '🇯🇵',
  ko: '🇰🇷',
  fr: '🇫🇷',
  de: '🇩🇪',
  es: '🇪🇸',
  ru: '🇷🇺',
}
</script>

<template>
  <div class="pron-notebook">
    <h3 class="notebook-title">📒 单词本 / 句子本</h3>

    <div v-if="isLoading" class="loading-msg">加载中...</div>
    <div v-else-if="notebook.length === 0" class="empty-msg">
      <p>还没有课程记录</p>
      <p class="empty-hint">生成今日课程后会自动保存到这里</p>
    </div>

    <div v-else class="entry-list">
      <div
        v-for="entry in notebook"
        :key="entry.id"
        class="entry-card"
        @click="openEntry(entry)"
      >
        <div class="entry-header">
          <span class="entry-lang">{{ LANG_FLAGS[entry.language] || '🌍' }} {{ entry.language.toUpperCase() }}</span>
          <span class="entry-time">{{ formatPronTime(entry.createdAt) }}</span>
        </div>
        <h4 class="entry-topic">{{ entry.topic }}</h4>
        <div v-if="entry.characterName" class="entry-teacher">讲师：{{ entry.characterName }}</div>
        <div class="entry-stats">
          <span>{{ entry.items?.length || 0 }} 条内容</span>
          <span v-if="entry.avgScore">平均分：{{ entry.avgScore }}</span>
        </div>
        <button class="entry-delete-btn" @click.stop="deleteEntry(entry)">🗑️</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pron-notebook {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.notebook-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 8px;
}

.loading-msg,
.empty-msg {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.empty-msg p {
  margin: 4px 0;
}

.empty-hint {
  font-size: 0.8rem;
  color: #444;
}

.entry-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.entry-card {
  padding: 14px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.entry-card:hover {
  background: rgba(255, 255, 255, 0.08);
}

.entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.entry-lang {
  font-size: 0.75rem;
  color: #667eea;
  font-weight: 600;
}

.entry-time {
  font-size: 0.7rem;
  color: #666;
}

.entry-topic {
  margin: 0 0 4px;
  font-size: 0.95rem;
  font-weight: 600;
}

.entry-teacher {
  font-size: 0.75rem;
  color: #888;
  margin-bottom: 6px;
}

.entry-stats {
  display: flex;
  gap: 12px;
  font-size: 0.75rem;
  color: #666;
}

.entry-delete-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: none;
  border: none;
  font-size: 0.9rem;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  opacity: 0.5;
}

.entry-delete-btn:hover {
  opacity: 1;
  background: rgba(255, 59, 48, 0.1);
}
</style>
