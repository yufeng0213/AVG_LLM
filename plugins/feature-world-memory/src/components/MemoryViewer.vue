<template>
  <div class="memory-viewer">
    <!-- Header -->
    <div class="memory-header">
      <button class="memory-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        返回
      </button>
      <span class="memory-title">
        <span class="memory-title-glow"></span>
        {{ worldBook?.title || '世界记忆' }}
      </span>
      <button class="memory-extract-btn" @click="handleExtract" :disabled="isExtracting">
        {{ isExtracting ? '提取中...' : '提取' }}
      </button>
    </div>

    <!-- Toast -->
    <div v-if="toast" :class="['memory-toast', toast.type]">{{ toast.msg }}</div>

    <!-- Tabs -->
    <div class="memory-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="['tab-btn', { active: activeTab === tab.key }]"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Content -->
    <div class="memory-content">
      <!-- Events Tab -->
      <div v-if="activeTab === 'events'" class="tab-panel">
        <div v-if="events.length === 0" class="empty">暂无事件记录</div>
        <div v-for="evt in sortedEvents" :key="evt.id" :class="['event-card', `impact-${impactLevel(evt.emotionalImpact)}`]">
          <div class="event-header">
            <span class="event-type">{{ typeLabel(evt.type) }}</span>
            <span class="event-impact">{{ evt.emotionalImpact }}</span>
          </div>
          <div class="event-summary">{{ evt.summary }}</div>
          <div class="event-meta">
            <span class="event-participants">
              <span v-for="pid in evt.participants" :key="pid" class="participant">
                {{ charName(pid) }}
              </span>
            </span>
            <span class="event-time">{{ formatTime(evt.createdAt) }}</span>
          </div>
          <div v-if="evt.scene" class="event-scene">{{ evt.scene }}</div>
        </div>
      </div>

      <!-- Characters Tab -->
      <div v-if="activeTab === 'characters'" class="tab-panel">
        <div v-if="memoryCharacters.length === 0" class="empty">暂无角色记忆</div>
        <div v-for="charId in memoryCharacters" :key="charId" class="char-section">
          <div class="char-name">{{ charName(charId) }} 的记忆</div>
          <div v-for="mem in getMemoriesFor(charId)" :key="mem.id" class="memory-card">
            <div class="memory-about">关于 {{ charName(mem.about) }}</div>
            <div class="memory-content-text">{{ mem.content }}</div>
            <div class="memory-sentiment" :style="{ color: sentimentColor(mem.sentiment) }">
              {{ mem.sentiment > 0 ? '+' : '' }}{{ mem.sentiment }}
            </div>
          </div>
        </div>
      </div>

      <!-- Stats Tab -->
      <div v-if="activeTab === 'stats'" class="tab-panel">
        <div class="stat-row">
          <span class="stat-label">事件总数</span>
          <span class="stat-value">{{ events.length }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">活跃事件</span>
          <span class="stat-value">{{ events.filter(e => e.status === 'active').length }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">角色记忆</span>
          <span class="stat-value">{{ totalMemoryEntries }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">上次提取</span>
          <span class="stat-value">{{ lastExtracted || '从未' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { extractMemoriesFromArchive } from '../../../../src/composables/useWorldMemory.js'
import { getWorldMemory } from '../../../../src/memory/worldMemoryStore.js'

const props = defineProps({
  worldBook: Object,
  worldMemory: Object,
})

const emit = defineEmits(['back', 'refresh'])

const activeTab = ref('events')
const isExtracting = ref(false)
const toast = ref(null)

const tabs = [
  { key: 'events', label: '事件' },
  { key: 'characters', label: '角色记忆' },
  { key: 'stats', label: '统计' },
]

const events = computed(() => props.worldMemory?.events || [])
const sortedEvents = computed(() => {
  return [...events.value].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
})

const memoryCharacters = computed(() => {
  const mems = props.worldMemory?.characterMemories || {}
  return Object.keys(mems)
})

const totalMemoryEntries = computed(() => {
  const mems = props.worldMemory?.characterMemories || {}
  let total = 0
  for (const key of Object.keys(mems)) total += mems[key].length
  return total
})

const lastExtracted = computed(() => {
  if (!props.worldMemory?.lastExtractedAt) return ''
  return formatTime(props.worldMemory.lastExtractedAt)
})

function getMemoriesFor(charId) {
  return props.worldMemory?.characterMemories?.[charId] || []
}

function charName(id) {
  if (id === '__player__') return props.worldBook?.userProfile?.name || '玩家'
  return props.worldBook?.characters?.find(c => c.id === id)?.name || id
}

function typeLabel(type) {
  const map = {
    conversation: '对话', conflict: '冲突', agreement: '约定',
    discovery: '发现', departure: '离别', romance: '情感',
    gift: '赠礼', betrayal: '背叛', milestone: '里程碑', other: '其他',
  }
  return map[type] || type || '其他'
}

function impactLevel(impact) {
  if (impact >= 70) return 'high'
  if (impact >= 40) return 'medium'
  return 'low'
}

function sentimentColor(sentiment) {
  if (sentiment > 0) return '#4ade80'
  if (sentiment < 0) return '#f87171'
  return '#9ca3af'
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function showToast(msg, type = 'info') {
  toast.value = { msg, type }
  setTimeout(() => { toast.value = null }, 3000)
}

async function handleExtract() {
  if (isExtracting.value || !props.worldBook?.id) return
  isExtracting.value = true
  try {
    const result = await extractMemoriesFromArchive(props.worldBook.id)
    if (result.success) {
      if (result.eventsExtracted === 0 && result.memoriesExtracted === 0) {
        showToast('未发现新记忆', 'info')
      } else {
        showToast(`提取 ${result.eventsExtracted} 个事件, ${result.memoriesExtracted} 条角色记忆`, 'success')
      }
      emit('refresh')
    } else {
      showToast(result.error || '提取失败', 'error')
    }
  } catch (e) {
    showToast('提取出错: ' + (e.message || '未知错误'), 'error')
  } finally {
    isExtracting.value = false
  }
}
</script>

<style scoped>
.memory-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1a2e;
  color: #fff;
}

.memory-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: clamp(10px, 2vw, 16px) clamp(12px, 3vw, 20px);
  padding-top: max(clamp(10px, 2vw, 16px), var(--safe-area-inset-top, 16px));
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}

.memory-back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
  padding: 6px 14px;
  border-radius: 9999px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.memory-back-btn:hover {
  background: rgba(139, 133, 242, 0.2);
  border-color: rgba(139, 133, 242, 0.4);
}

.memory-back-btn svg {
  width: 16px;
  height: 16px;
}

.memory-title {
  font-size: clamp(14px, 3.5vw, 18px);
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.memory-title-glow {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8b85f2;
  box-shadow: 0 0 8px rgba(139, 133, 242, 0.6);
  animation: memory-glow-pulse 2s ease-in-out infinite;
}

@keyframes memory-glow-pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}

.memory-tabs {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 8px 0;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tab-btn.active {
  color: #8b85f2;
  border-bottom-color: #8b85f2;
}

.memory-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
  padding: 40px 0;
}

.event-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 10px 12px;
  border-left: 3px solid rgba(255, 255, 255, 0.2);
}

.event-card.impact-high {
  border-left-color: #f87171;
}

.event-card.impact-medium {
  border-left-color: #fbbf24;
}

.event-card.impact-low {
  border-left-color: #60a5fa;
}

.event-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.event-type {
  font-size: 11px;
  color: #8b85f2;
  background: rgba(139, 133, 242, 0.15);
  padding: 2px 8px;
  border-radius: 10px;
}

.event-impact {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
}

.event-summary {
  font-size: 13px;
  line-height: 1.4;
  margin-bottom: 4px;
}

.event-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}

.participant {
  display: inline-block;
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 6px;
  border-radius: 8px;
  margin-right: 4px;
}

.event-scene {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 4px;
}

.char-section {
  margin-bottom: 12px;
}

.char-name {
  font-size: 14px;
  font-weight: 600;
  color: #8b85f2;
  margin-bottom: 6px;
}

.memory-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 6px;
}

.memory-about {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 2px;
}

.memory-content-text {
  font-size: 12px;
  line-height: 1.4;
}

.memory-sentiment {
  font-size: 11px;
  font-weight: 600;
  margin-top: 2px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.stat-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.stat-value {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}

.memory-extract-btn {
  padding: 4px 12px;
  border-radius: 16px;
  border: 1px solid rgba(74, 222, 128, 0.5);
  background: rgba(74, 222, 128, 0.15);
  color: #4ade80;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.2s;
}
.memory-extract-btn:disabled {
  opacity: 0.5;
}

.memory-toast {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 12px;
  z-index: 200;
  white-space: nowrap;
}
.memory-toast.success {
  background: rgba(74, 222, 128, 0.9);
  color: #fff;
}
.memory-toast.error {
  background: rgba(248, 113, 113, 0.9);
  color: #fff;
}
.memory-toast.info {
  background: rgba(96, 165, 250, 0.9);
  color: #fff;
}



  .platform-android.android-portrait .memory-header {
    background: rgba(0, 0, 0, 0.85) !important;
  }

  .platform-android.android-portrait .memory-back-btn,
  .platform-android.android-portrait .memory-extract-btn,
  .platform-android.android-portrait .tab-btn{
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
