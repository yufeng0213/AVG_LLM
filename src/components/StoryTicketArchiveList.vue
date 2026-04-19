<script setup>
/**
 * 剧情券存档列表
 * 在寝室中查看已存档的剧情
 */
import { computed, onMounted, ref } from 'vue'
import { loadStoryArchives, deleteStoryArchive } from '../services/storyTicketArchiveService'

const props = defineProps({
  worldBookId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['back', 'view-archive', 'new-story'])

const archives = ref([])
const loading = ref(true)

onMounted(async () => {
  archives.value = await loadStoryArchives()
  loading.value = false
})

async function handleDelete(id) {
  if (!confirm('确定要删除这段剧情存档吗？')) return
  await deleteStoryArchive(id)
  archives.value = await loadStoryArchives()
}

function handleView(archive) {
  emit('view-archive', archive)
}

function handleNewStory() {
  emit('new-story')
}

function handleBack() {
  emit('back')
}

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <Teleport to="body">
    <div class="story-archive-list">
      <header class="sal-header">
        <button class="sal-back-btn" @click="handleBack">&larr; 返回</button>
        <h3 class="sal-title">&#x1f4dc; 剧情券存档</h3>
        <div class="sal-header-spacer"></div>
      </header>

      <div class="sal-content">
        <p v-if="loading" class="sal-loading">加载中...</p>

        <div v-else-if="archives.length === 0" class="sal-empty">
          <div class="sal-empty-icon">&#x1f4d6;</div>
          <p>还没有剧情券存档</p>
          <span class="sal-empty-hint">使用剧情券生成专属剧情吧</span>
        </div>

        <div v-else class="sal-archive-items">
          <div
            v-for="archive in archives"
            :key="archive.id"
            class="sal-archive-item"
            @click="handleView(archive)"
          >
            <div class="sal-archive-icon">&#x1f3ad;</div>
            <div class="sal-archive-info">
              <div class="sal-archive-title">{{ archive.title || '未命名剧情' }}</div>
              <div class="sal-archive-meta">
                {{ archive.targetCharacter || '' }} &middot; {{ archive.wordCount || 0 }} 字 &middot; {{ formatDate(archive.createdAt) }}
              </div>
              <div v-if="archive.theme" class="sal-archive-theme">
                {{ archive.theme }}
              </div>
            </div>
            <button
              class="sal-archive-delete"
              @click.stop="handleDelete(archive.id)"
              title="删除"
            >
              &times;
            </button>
          </div>
        </div>

        <!-- 新剧情按钮 -->
        <button class="sal-new-btn" @click="handleNewStory">
          &#x2728; 使用剧情券生成新剧情
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.story-archive-list {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: linear-gradient(180deg, rgba(20, 20, 30, 0.95) 0%, rgba(10, 10, 15, 0.98) 100%);
  display: flex;
  flex-direction: column;
  color: #fff;
  font-family: inherit;
}

.sal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
}

.sal-back-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.sal-back-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.sal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  flex: 1;
}

.sal-header-spacer {
  width: 60px;
}

.sal-content {
  flex: 1;
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
  overflow-y: auto;
}

.sal-loading {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  padding: 40px 0;
}

.sal-empty {
  text-align: center;
  padding: 60px 20px;
}

.sal-empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.sal-empty p {
  font-size: 16px;
  margin: 0 0 8px;
}

.sal-empty-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

.sal-archive-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.sal-archive-item {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.sal-archive-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.sal-archive-icon {
  font-size: 28px;
  flex-shrink: 0;
}

.sal-archive-info {
  flex: 1;
  min-width: 0;
}

.sal-archive-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}

.sal-archive-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 2px;
}

.sal-archive-theme {
  font-size: 12px;
  color: #c4b5fd;
  background: rgba(167, 139, 250, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  display: inline-block;
}

.sal-archive-delete {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sal-archive-delete:hover {
  background: rgba(239, 68, 68, 0.3);
}

.sal-new-btn {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #a78bfa, #818cf8);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.sal-new-btn:hover {
  opacity: 0.9;
}
</style>
