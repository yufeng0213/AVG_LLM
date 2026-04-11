<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  filterCards,
  deleteCardFromCollection,
} from '../../../src/cards/cardCollectionService'
import {
  exportCardFromDataAndSave,
  exportCardFromDataAndShare,
} from '../../../src/cards/cardExportService'

const emit = defineEmits(['back'])

// 状态
const cardCollectionData = ref([])
const selectedCollectionCard = ref(null)
const isExportingCard = ref(false)
const isSharingCard = ref(false)
const exportMessage = ref('')

const formatCollectionTime = (value, withTime = false) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return withTime ? date.toLocaleString() : date.toLocaleDateString()
}

const syncSelectedCollectionCard = () => {
  if (!selectedCollectionCard.value?.collectionId) {
    return
  }
  const latest = cardCollectionData.value.find(
    (item) => item.collectionId === selectedCollectionCard.value.collectionId
  )
  if (latest) {
    selectedCollectionCard.value = latest
  }
}

// 加载收藏数据
const loadCardCollectionData = async () => {
  try {
    const items = await filterCards({
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
    cardCollectionData.value = items
    syncSelectedCollectionCard()
  } catch (error) {
    console.error('加载收藏数据失败:', error)
    cardCollectionData.value = []
  }
}

// 查看卡片详情
const viewCollectionCard = (card) => {
  selectedCollectionCard.value = card
}

// 关闭卡片详情
const closeCollectionCardDetail = () => {
  selectedCollectionCard.value = null
}

// 删除卡片
const deleteCollectionCard = async (collectionId) => {
  if (!confirm('确定要删除这张卡片吗？')) return
  
  const result = await deleteCardFromCollection(collectionId)
  if (result.success) {
    await loadCardCollectionData()
    if (selectedCollectionCard.value?.collectionId === collectionId) {
      selectedCollectionCard.value = null
    }
  }
}

// 渲染卡片HTML
const renderCollectionCardHtml = computed(() => {
  if (!selectedCollectionCard.value || !selectedCollectionCard.value.templateHtml) {
    return ''
  }
  
  let html = selectedCollectionCard.value.templateHtml
  const content = selectedCollectionCard.value.content || {}
  
  for (const [key, value] of Object.entries(content)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value || ''))
    html = html.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value || ''))
    html = html.replace(new RegExp(`%${key}%`, 'g'), String(value || ''))
  }
  
  return html
})

// 导出卡片为PNG
const exportCardAsPng = async () => {
  if (!selectedCollectionCard.value) return
  
  isExportingCard.value = true
  exportMessage.value = ''
  
  try {
    const result = await exportCardFromDataAndSave(selectedCollectionCard.value, {
      filename: `${selectedCollectionCard.value.cardName || 'card'}_${Date.now()}.png`,
    })
    
    if (result.success) {
      exportMessage.value = result.savedPath
        ? `导出成功：${result.savedPath}`
        : '导出成功！'
    } else {
      exportMessage.value = result.error || '导出失败'
    }
  } catch (error) {
    console.error('导出失败:', error)
    exportMessage.value = '导出失败: ' + error.message
  } finally {
    isExportingCard.value = false
    // 3秒后清除消息
    setTimeout(() => {
      exportMessage.value = ''
    }, 3000)
  }
}

// 分享卡片到系统社交面板
const shareCardAsPng = async () => {
  if (!selectedCollectionCard.value) return
  if (isSharingCard.value) return

  isSharingCard.value = true
  exportMessage.value = ''

  try {
    const result = await exportCardFromDataAndShare(selectedCollectionCard.value, {
      filename: `${selectedCollectionCard.value.cardName || 'card'}_${Date.now()}.png`,
      shareTitle: '分享卡片',
      shareText: '来自 AVG_LLM 的剧情卡片',
      shareDialogTitle: '分享到社交应用',
    })

    if (result.success) {
      exportMessage.value = '分享成功：已打开系统分享面板'
    } else {
      exportMessage.value = result.error || '分享失败'
    }
  } catch (error) {
    console.error('分享失败:', error)
    exportMessage.value = '分享失败: ' + error.message
  } finally {
    isSharingCard.value = false
    setTimeout(() => {
      exportMessage.value = ''
    }, 3000)
  }
}

// 返回主菜单
const handleBack = () => {
  emit('back')
}

// 初始化
onMounted(() => {
  loadCardCollectionData()
})
</script>

<template>
  <div class="card-collection-screen">
    <header class="collection-header">
      <button type="button" class="back-button" @click="handleBack">
        <span class="back-icon">‹</span>
      </button>
      <div class="collection-title-group">
        <h1 class="collection-title">
          <span>卡片收藏室</span>
          <span class="collection-title-gradient">CARD COLLECTION</span>
        </h1>
      </div>
    </header>
    
    <div class="collection-body">
      <div v-if="cardCollectionData.length === 0" class="collection-empty">
        <div class="empty-icon">🃏</div>
        <p>还没有收藏任何卡片</p>
        <p class="empty-hint">在游戏中点击"随机小卡片"按钮生成卡片后可以收藏</p>
      </div>
      <div v-else class="collection-grid">
        <div 
          v-for="card in cardCollectionData" 
          :key="card.collectionId" 
          class="collection-card-item"
          @click="viewCollectionCard(card)"
        >
          <div class="card-item-head">
            <div class="card-item-icon-wrap">
              <span class="card-item-icon">{{ card.categoryIcon }}</span>
            </div>
            <span class="card-item-rarity" :style="{ color: card.rarityColor }">{{ card.rarityName }}</span>
          </div>
          <span class="card-item-name">{{ card.cardName }}</span>
          <div class="card-item-meta">
            <span class="card-item-category">{{ card.categoryName }}</span>
            <span class="card-item-time">{{ formatCollectionTime(card.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 卡片详情弹窗 -->
    <div v-if="selectedCollectionCard" class="card-detail-overlay" @click.self="closeCollectionCardDetail">
      <div class="card-detail-panel">
        <div class="card-detail-header">
          <div class="card-detail-head-meta">
            <span class="card-detail-category">{{ selectedCollectionCard.categoryIcon }} {{ selectedCollectionCard.categoryName }}</span>
            <span class="card-detail-rarity" :style="{ color: selectedCollectionCard.rarityColor }">{{ selectedCollectionCard.rarityName }}</span>
          </div>
          <button type="button" class="card-detail-close" @click="closeCollectionCardDetail">✕</button>
        </div>
        <div class="card-detail-name">{{ selectedCollectionCard.cardName }}</div>
        <div class="card-detail-body">
          <div class="card-detail-content" v-html="renderCollectionCardHtml"></div>
          <aside class="card-detail-side">
            <div class="card-detail-meta">
              <span class="meta-label">收藏时间</span>
              <span class="meta-value">{{ formatCollectionTime(selectedCollectionCard.createdAt, true) }}</span>
            </div>
            <div class="card-detail-footer">
              <button
                type="button"
                class="card-action-btn share-btn"
                :disabled="isSharingCard || isExportingCard"
                @click="shareCardAsPng"
              >
                {{ isSharingCard ? '分享中...' : '分享到... 📤' }}
              </button>
              <button
                type="button"
                class="card-action-btn export-btn"
                :disabled="isExportingCard || isSharingCard"
                @click="exportCardAsPng"
              >
                {{ isExportingCard ? '导出中...' : '导出PNG 📷' }}
              </button>
              <button
                type="button"
                class="card-action-btn delete-btn"
                @click="deleteCollectionCard(selectedCollectionCard.collectionId)"
              >
                删除卡片
              </button>
            </div>
            <div v-if="exportMessage" class="export-message" :class="{ 'is-success': exportMessage.includes('成功') }">
              {{ exportMessage }}
            </div>
          </aside>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 主容器 - 现代化扁平设计 ========== */
.card-collection-screen {
  height: 100dvh;
  min-height: 100vh;
  width: 100%;
  background: var(--background, #0a0a0a);
  color: var(--foreground, #ffffff);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

/* ========== 头部区域 - 参考世界书样式 ========== */
.collection-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.back-button {
  appearance: none !important;
  border: none !important;
  border-radius: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  font: 500 1.2rem/1 var(--font-body) !important;
  letter-spacing: 0 !important;
  text-transform: none !important;
  color: color-mix(in srgb, var(--foreground, #ffffff) 50%, transparent) !important;
  background: transparent !important;
  background-image: none !important;
  background-color: transparent !important;
  cursor: pointer !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  transition: all 150ms ease !important;
  flex-shrink: 0 !important;
  white-space: nowrap !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 0 !important;
  width: 44px !important;
  min-width: 44px !important;
  min-height: 44px !important;
}

.back-icon {
  font-size: 1.5rem !important;
  line-height: 1 !important;
  font-weight: 700 !important;
  display: inline-block !important;
  background: none !important;
}

.back-button:hover {
  transform: none !important;
  color: var(--foreground, #ffffff) !important;
  background: transparent !important;
  background-image: none !important;
  background-color: transparent !important;
  box-shadow: none !important;
}

.back-button:focus-visible {
  outline: 2px solid var(--accent-cyan, #00d4ff) !important;
  outline-offset: 2px !important;
  background: transparent !important;
}

.collection-title-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-left: auto;
  text-align: right;
}

.collection-title {
  margin: 0;
  display: flex;
  flex-direction: column;
  font-family: var(--font-heading, 'Inter', system-ui, sans-serif);
  font-size: clamp(1.5rem, 4vw, 2.5rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
  text-shadow: none;
  color: var(--foreground, #EDEDEF);
}

.collection-title-gradient {
  width: fit-content;
  margin-left: auto;
  font-family: var(--font-display, 'Inter', system-ui, sans-serif);
  font-size: clamp(0.7rem, 1.5vw, 0.9rem);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: linear-gradient(
    90deg,
    var(--accent-magenta, #5E6AD2),
    var(--accent-cyan, #6872D9),
    var(--accent-yellow, #8B9DF5),
    var(--accent-magenta, #5E6AD2)
  );
  background-size: 250% 250%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: avg-gradient-shift 4s linear infinite;
}

@keyframes avg-gradient-shift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* ========== 内容区域 ========== */
.collection-body {
  min-height: 0;
  padding: 16px clamp(16px, 3vw, 24px);
  display: flex;
}

.collection-empty {
  flex: 1;
  min-height: 0;
  text-align: center;
  padding: 60px 24px;
  border: 1px dashed color-mix(in srgb, var(--foreground, #ffffff) 12%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--foreground, #ffffff) 3%, transparent);
  color: color-mix(in srgb, var(--foreground, #ffffff) 50%, transparent);
  display: grid;
  place-content: center;
  gap: 8px;
}

.empty-icon {
  font-size: 3.5rem;
  margin-bottom: 8px;
  opacity: 0.5;
}

.collection-empty .empty-hint {
  font-size: 0.85rem;
  margin-top: 4px;
  opacity: 0.8;
}

.collection-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  align-content: start;
  padding-right: 4px;
}

/* ========== 卡片列表项 ========== */
.collection-card-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: color-mix(in srgb, var(--foreground, #ffffff) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 10%, transparent);
  border-radius: 12px;
  cursor: pointer;
  transition: all 150ms ease;
  position: relative;
  min-height: 140px;
}

.collection-card-item:hover {
  background: color-mix(in srgb, var(--foreground, #ffffff) 8%, transparent);
  border-color: color-mix(in srgb, var(--foreground, #ffffff) 18%, transparent);
  transform: translateY(-2px);
}

.card-item-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.card-item-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--foreground, #ffffff) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 12%, transparent);
}

.card-item-icon {
  font-size: 1.1rem;
  line-height: 1;
}

.card-item-name {
  width: 100%;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--foreground, #ffffff);
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.card-item-meta {
  margin-top: auto;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.card-item-category {
  font-size: 0.75rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 55%, transparent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-item-rarity {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-align: right;
}

.card-item-time {
  font-size: 0.7rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 45%, transparent);
  white-space: nowrap;
}

/* ========== 卡片详情弹窗 ========== */
.card-detail-overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--background, #0a0a0a) 85%, transparent);
  backdrop-filter: blur(16px);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: clamp(12px, 3vh, 32px);
  z-index: 120;
  animation: fade-in 0.2s ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.card-detail-panel {
  width: min(96vw, 960px);
  max-height: min(90dvh, 880px);
  background: var(--background, #0a0a0a);
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 12%, transparent);
  border-radius: 16px;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  box-shadow: 0 24px 48px color-mix(in srgb, #000 40%, transparent);
}

.card-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 10%, transparent);
}

.card-detail-head-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}

.card-detail-category {
  font-size: 0.8rem;
  color: color-mix(in srgb, var(--foreground, #ffffff) 60%, transparent);
  padding: 5px 10px;
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 12%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--foreground, #ffffff) 5%, transparent);
}

.card-detail-rarity {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.card-detail-close {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 15%, transparent);
  background: color-mix(in srgb, var(--foreground, #ffffff) 6%, transparent);
  color: var(--foreground, #ffffff);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  width: 36px;
  height: 36px;
  min-width: 36px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 36px;
  border-radius: 8px;
  transition: all 150ms ease;
}

.card-detail-close:hover {
  background: color-mix(in srgb, var(--foreground, #ffffff) 12%, transparent);
}

.card-detail-name {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--foreground, #ffffff);
  text-align: center;
  padding: 14px 18px;
  letter-spacing: -0.01em;
  border-bottom: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 8%, transparent);
}

.card-detail-body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
}

.card-detail-content {
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  background: color-mix(in srgb, var(--foreground, #ffffff) 2%, transparent);
}

.card-detail-side {
  min-height: 0;
  border-left: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 10%, transparent);
  background: color-mix(in srgb, var(--foreground, #ffffff) 3%, transparent);
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card-detail-meta {
  border: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 10%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--foreground, #ffffff) 4%, transparent);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meta-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--foreground, #ffffff) 50%, transparent);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.meta-value {
  font-size: 0.85rem;
  color: var(--foreground, #ffffff);
  line-height: 1.4;
  word-break: break-word;
}

.card-detail-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ========== 操作按钮 - 扁平化设计 ========== */
.card-action-btn {
  appearance: none;
  border: none;
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  text-align: center;
  line-height: 1.3;
}

.card-action-btn.share-btn {
  background: color-mix(in srgb, #3498db 15%, transparent);
  color: #8adfff;
}

.card-action-btn.share-btn:hover:not(:disabled) {
  background: color-mix(in srgb, #3498db 25%, transparent);
}

.card-action-btn.export-btn {
  background: color-mix(in srgb, #9b59b6 15%, transparent);
  color: #ca9ff2;
}

.card-action-btn.export-btn:hover:not(:disabled) {
  background: color-mix(in srgb, #9b59b6 25%, transparent);
}

.card-action-btn.delete-btn {
  background: color-mix(in srgb, #e74c3c 15%, transparent);
  color: #ff9286;
}

.card-action-btn.delete-btn:hover:not(:disabled) {
  background: color-mix(in srgb, #e74c3c 25%, transparent);
}

.card-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.export-message {
  border-radius: 8px;
  background: color-mix(in srgb, #e74c3c 12%, transparent);
  text-align: center;
  padding: 10px 12px;
  font-size: 0.8rem;
  color: #ff9386;
  animation: fade-in 0.2s ease;
}

.export-message.is-success {
  background: color-mix(in srgb, #2ecc71 12%, transparent);
  color: #8bf3b2;
}

/* ========== 响应式设计 ========== */
@media (max-width: 900px) {
  .card-detail-body {
    grid-template-columns: 1fr;
  }

  .card-detail-side {
    border-left: 0;
    border-top: 1px solid color-mix(in srgb, var(--foreground, #ffffff) 10%, transparent);
  }
}

@media (max-width: 768px) {
  .collection-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
}

@media (max-width: 640px) {
  .collection-header {
    flex-direction: row !important;
    gap: 12px !important;
    padding: 16px !important;
    background: var(--background, #050506) !important;
    border-bottom: 1px solid var(--border-panel, rgba(255, 255, 255, 0.06)) !important;
  }

  .collection-title-group {
    gap: 8px !important;
  }

  .collection-title {
    font-size: clamp(1.2rem, 5vw, 1.8rem) !important;
  }

  .collection-title-gradient {
    font-size: clamp(0.6rem, 2vw, 0.75rem) !important;
  }

  .collection-body {
    padding: 12px;
  }

  .collection-grid {
    gap: 10px;
    grid-template-columns: repeat(2, 1fr);
  }

  .collection-card-item {
    min-height: 130px;
    padding: 12px;
    border-radius: 10px;
  }

  .card-detail-overlay {
    padding: 8px;
  }

  .card-detail-panel {
    width: 100%;
    max-height: 92dvh;
    border-radius: 12px;
  }

  .card-detail-footer {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .card-detail-footer .card-action-btn {
    flex: 1;
    min-width: calc(50% - 5px);
  }
}
</style>
