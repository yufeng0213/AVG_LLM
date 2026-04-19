<script setup>
/**
 * 剧情券存档查看/重播组件
 * 以 AVG 对话形式重播已存档的剧情
 */
import { computed, ref } from 'vue'
import {
  deleteStoryArchive,
} from '../services/storyTicketArchiveService'

const emit = defineEmits(['back', 'view-archive'])

const props = defineProps({
  archive: {
    type: Object,
    default: null,
  },
})

// 状态
const currentLineIndex = ref(0)
const showHistory = ref(false)

// 对话数据
const dialogues = computed(() => props.archive?.dialogues || [])
const currentDialogue = computed(() => dialogues.value[currentLineIndex.value] || null)
const totalLines = computed(() => dialogues.value.length)

// 字数统计
const wordCount = computed(() => {
  if (!props.archive) return 0
  return props.archive.wordCount || 0
})

// 导航
function goNext() {
  if (currentLineIndex.value < totalLines.value - 1) {
    currentLineIndex.value++
  }
}

function goPrev() {
  if (currentLineIndex.value > 0) {
    currentLineIndex.value--
  }
}

function handleBack() {
  emit('back')
}

async function handleDeleteArchive() {
  if (!props.archive?.id) return
  if (!confirm('确定要删除这段剧情存档吗？')) return
  await deleteStoryArchive(props.archive.id)
  emit('back')
}
</script>

<template>
  <Teleport to="body">
    <div class="story-ticket-viewer">
      <!-- 顶部栏 -->
      <header class="stv-header">
        <button class="stv-back-btn" @click="handleBack">
          &larr; 返回
        </button>
        <div class="stv-header-info">
          <span class="stv-title">{{ archive?.title || '剧情券存档' }}</span>
          <span class="stv-meta">{{ archive?.targetCharacter || '' }} &middot; 共 {{ wordCount }} 字 &middot; {{ totalLines }} 条对话</span>
        </div>
        <button class="stv-delete-btn" @click="handleDeleteArchive" title="删除存档">
          &#x1f5d1;
        </button>
      </header>

      <!-- 对话区域 -->
      <div class="stv-stage" @click="goNext">
        <div class="stv-dialogue-box">
          <div v-if="currentDialogue" class="stv-speaker-info">
            <span class="stv-speaker-name">{{ currentDialogue.speaker }}</span>
            <span v-if="currentDialogue.emotion && currentDialogue.emotion !== 'default'" class="stv-emotion">
              {{ currentDialogue.emotion }}
            </span>
          </div>
          <p class="stv-dialogue-text">
            {{ currentDialogue?.text || '' }}
          </p>
        </div>
      </div>

      <!-- 底部导航 -->
      <footer class="stv-nav">
        <button class="stv-nav-btn" :disabled="currentLineIndex === 0" @click="goPrev">
          &larr; 上一句
        </button>
        <span class="stv-nav-progress">
          <span class="stv-nav-index">{{ currentLineIndex + 1 }} / {{ totalLines }}</span>
          <div class="stv-nav-bar">
            <div
              class="stv-nav-bar-fill"
              :style="{ width: totalLines ? ((currentLineIndex + 1) / totalLines * 100) + '%' : '0%' }"
            ></div>
          </div>
        </span>
        <button class="stv-nav-btn" :disabled="currentLineIndex >= totalLines - 1" @click="goNext">
          下一句 &rarr;
        </button>
      </footer>

      <!-- 历史记录面板 -->
      <Transition name="stv-slide">
        <div v-if="showHistory" class="stv-history-panel">
          <header class="stv-history-header">
            <h4>历史对话</h4>
            <button class="stv-history-close" @click="showHistory = false">&times;</button>
          </header>
          <div class="stv-history-list">
            <div
              v-for="(dlg, idx) in dialogues"
              :key="dlg.id || idx"
              class="stv-history-item"
              :class="{ active: idx === currentLineIndex }"
              @click="currentLineIndex = idx"
            >
              <span class="stv-history-speaker">{{ dlg.speaker }}</span>
              <span class="stv-history-text">{{ dlg.text.substring(0, 50) }}{{ dlg.text.length > 50 ? '...' : '' }}</span>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 历史记录切换按钮 -->
      <button class="stv-history-toggle" @click="showHistory = !showHistory">
        {{ showHistory ? '关闭历史' : '查看历史' }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.story-ticket-viewer {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: linear-gradient(180deg, rgba(20, 20, 30, 0.95) 0%, rgba(10, 10, 15, 0.98) 100%);
  display: flex;
  flex-direction: column;
  color: #fff;
  font-family: inherit;
}

/* 顶部栏 */
.stv-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
}

.stv-back-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.stv-back-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.stv-header-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stv-title {
  font-size: 16px;
  font-weight: 600;
}

.stv-meta {
  font-size: 12px;
  opacity: 0.6;
}

.stv-delete-btn {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
}

.stv-delete-btn:hover {
  background: rgba(239, 68, 68, 0.4);
}

/* 对话区域 */
.stv-stage {
  padding: 0 16px 16px;
  cursor: pointer;
}

.stv-dialogue-box {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.stv-speaker-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.stv-speaker-name {
  font-weight: 700;
  font-size: 15px;
  color: #a78bfa;
}

.stv-emotion {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}

.stv-dialogue-text {
  font-size: 16px;
  line-height: 1.7;
  color: #f0f0f0;
  margin: 0;
  word-break: break-word;
}

/* 底部导航 */
.stv-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
}

.stv-nav-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}

.stv-nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.stv-nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.stv-nav-progress {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stv-nav-index {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.stv-nav-bar {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.stv-nav-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #a78bfa, #818cf8);
  border-radius: 2px;
  transition: width 0.2s ease;
}

/* 历史记录面板 */
.stv-history-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  max-width: 80vw;
  background: rgba(20, 20, 30, 0.95);
  backdrop-filter: blur(20px);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  z-index: 10;
}

.stv-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.stv-history-header h4 {
  margin: 0;
  font-size: 16px;
}

.stv-history-close {
  background: none;
  border: none;
  color: #fff;
  font-size: 24px;
  cursor: pointer;
}

.stv-history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.stv-history-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stv-history-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.stv-history-item.active {
  background: rgba(167, 139, 250, 0.15);
  border-left: 3px solid #a78bfa;
}

.stv-history-speaker {
  font-size: 12px;
  color: #a78bfa;
  font-weight: 600;
}

.stv-history-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.4;
}

/* 历史切换按钮 */
.stv-history-toggle {
  position: absolute;
  bottom: 70px;
  right: 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  z-index: 5;
}

.stv-history-toggle:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* 过渡动画 */
.stv-slide-enter-active,
.stv-slide-leave-active {
  transition: transform 0.2s ease;
}

.stv-slide-enter-from,
.stv-slide-leave-to {
  transform: translateX(100%);
}
</style>
