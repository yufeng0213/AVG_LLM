<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  filterCards,
  deleteCardFromCollection,
} from '../cards/cardCollectionService'
import {
  exportCardFromDataAndSave,
  exportCardFromDataAndShare,
} from '../cards/cardExportService'

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
      <div class="collection-header-main">
        <button type="button" class="back-btn collection-back-btn" @click="handleBack">
          ← 返回
        </button>
        <div class="collection-title-wrap">
          <h1 class="collection-title">🃏 卡片收藏室</h1>
          <p class="collection-subtitle">浏览并管理你收藏的剧情卡片</p>
        </div>
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
.card-collection-screen {
  height: 100dvh;
  min-height: 100vh;
  width: 100%;
  background:
    radial-gradient(circle at 8% 10%, color-mix(in srgb, var(--accent-cyan) 20%, transparent) 0%, transparent 34%),
    radial-gradient(circle at 92% 8%, color-mix(in srgb, var(--accent-magenta) 18%, transparent) 0%, transparent 30%),
    linear-gradient(160deg, #05070f 0%, #0c1324 50%, #0d1630 100%);
  color: var(--text-primary);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.collection-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px clamp(12px, 2.2vw, 22px);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--background) 90%, transparent) 0%, color-mix(in srgb, var(--background) 66%, transparent) 100%);
  border-bottom: 1px solid color-mix(in srgb, var(--accent-cyan) 26%, transparent);
  backdrop-filter: blur(10px);
}

.collection-header-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 100%;
}

.collection-title-wrap {
  min-width: 0;
  flex: 1;
}

.collection-back-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--accent-cyan) 68%, transparent);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent-cyan) 20%, transparent) 0%, color-mix(in srgb, var(--background) 82%, transparent) 100%);
  color: color-mix(in srgb, var(--accent-cyan) 92%, #fff);
  padding: 7px 12px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 600;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.collection-back-btn:hover {
  background: color-mix(in srgb, var(--accent-cyan) 16%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-cyan) 32%, transparent);
}

.collection-title {
  margin: 0;
  font-size: clamp(1.14rem, 1.6vw, 1.4rem);
  font-weight: 700;
  letter-spacing: 0.02em;
  color: color-mix(in srgb, var(--accent-cyan) 92%, #fff);
}

.collection-subtitle {
  margin: 2px 0 0;
  font-size: 0.78rem;
  color: color-mix(in srgb, var(--foreground) 64%, var(--accent-cyan));
  line-height: 1.3;
}

.collection-body {
  min-height: 0;
  padding: 12px clamp(12px, 2.2vw, 22px) 14px;
  display: flex;
}

.collection-empty {
  flex: 1;
  min-height: 0;
  text-align: center;
  padding: 40px 20px;
  border: 1px dashed color-mix(in srgb, var(--accent-cyan) 28%, transparent);
  border-radius: 18px;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--background) 82%, transparent) 0%, color-mix(in srgb, #101a33 60%, transparent) 100%);
  color: color-mix(in srgb, var(--foreground) 72%, transparent);
  display: grid;
  place-content: center;
  gap: 6px;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 6px;
  opacity: 0.58;
}

.collection-empty .empty-hint {
  font-size: 0.86rem;
  margin-top: 4px;
  opacity: 0.72;
}

.collection-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
  padding-right: 2px;
}

.collection-card-item {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px;
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--accent-cyan) 14%, transparent) 0%, transparent 62%),
    linear-gradient(200deg, color-mix(in srgb, var(--accent-magenta) 10%, transparent) 0%, transparent 64%),
    color-mix(in srgb, var(--background) 86%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-cyan) 32%, transparent);
  border-radius: 16px;
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  position: relative;
  min-height: 164px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-cyan) 8%, transparent);
}

.collection-card-item:hover {
  border-color: color-mix(in srgb, var(--accent-cyan) 70%, transparent);
  transform: translateY(-3px);
  box-shadow:
    0 12px 24px color-mix(in srgb, var(--background) 58%, #000),
    0 0 0 1px color-mix(in srgb, var(--accent-cyan) 14%, transparent);
}

.card-item-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.card-item-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: 1px solid color-mix(in srgb, var(--accent-cyan) 44%, transparent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--background) 76%, transparent);
}

.card-item-icon {
  font-size: 1.08rem;
  line-height: 1;
}

.card-item-name {
  width: 100%;
  font-size: 0.92rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--foreground) 90%, #fff);
  line-height: 1.34;
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
  font-size: 0.72rem;
  color: color-mix(in srgb, var(--foreground) 76%, transparent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-item-rarity {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-align: right;
}

.card-item-time {
  font-size: 0.68rem;
  color: color-mix(in srgb, var(--foreground) 58%, transparent);
  white-space: nowrap;
}

/* 卡片详情弹窗 */
.card-detail-overlay {
  position: fixed;
  inset: 0;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--background) 70%, transparent) 0%, color-mix(in srgb, var(--background) 88%, transparent) 100%);
  backdrop-filter: blur(12px);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: clamp(10px, 3vh, 28px);
  z-index: 120;
  animation: fade-in 0.3s ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.card-detail-panel {
  width: min(96vw, 920px);
  max-height: min(90dvh, 880px);
  background:
    linear-gradient(150deg, color-mix(in srgb, var(--background) 92%, transparent) 0%, color-mix(in srgb, #122141 72%, transparent) 100%);
  border: 2px solid color-mix(in srgb, var(--accent-cyan) 62%, transparent);
  border-radius: 18px;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  box-shadow:
    0 24px 70px color-mix(in srgb, var(--background) 60%, #000),
    0 0 0 1px color-mix(in srgb, var(--accent-magenta) 24%, transparent),
    0 0 34px color-mix(in srgb, var(--accent-cyan) 22%, transparent);
}

.card-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent-cyan) 24%, transparent);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent-cyan) 12%, transparent) 0%, transparent 72%);
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
  color: color-mix(in srgb, var(--foreground) 68%, transparent);
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--accent-cyan) 28%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--background) 82%, transparent);
}

.card-detail-rarity {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.card-detail-close {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--accent-magenta) 34%, transparent);
  background: color-mix(in srgb, var(--background) 80%, transparent);
  color: color-mix(in srgb, var(--accent-magenta) 88%, #fff);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  width: 34px;
  height: 34px;
  min-width: 34px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 34px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.card-detail-close:hover {
  background: color-mix(in srgb, var(--accent-magenta) 18%, transparent);
}

.card-detail-name {
  font-size: 1.14rem;
  font-weight: 700;
  color: color-mix(in srgb, var(--accent-cyan) 90%, #fff);
  text-align: center;
  padding: 12px 14px;
  letter-spacing: 0.02em;
  border-bottom: 1px solid color-mix(in srgb, var(--accent-cyan) 16%, transparent);
}

.card-detail-body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 270px;
}

.card-detail-content {
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
  background: color-mix(in srgb, var(--background) 86%, transparent);
}

.card-detail-side {
  min-height: 0;
  border-left: 1px solid color-mix(in srgb, var(--accent-cyan) 20%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--background) 80%, transparent) 0%, color-mix(in srgb, var(--background) 88%, transparent) 100%);
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-detail-meta {
  border: 1px solid color-mix(in srgb, var(--accent-cyan) 26%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--background) 82%, transparent);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-label {
  font-size: 0.73rem;
  color: color-mix(in srgb, var(--foreground) 62%, transparent);
}

.meta-value {
  font-size: 0.82rem;
  color: color-mix(in srgb, var(--foreground) 86%, transparent);
  line-height: 1.35;
  word-break: break-word;
}

.card-detail-footer {
  margin-top: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.card-action-btn {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--accent-cyan) 46%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(140deg, color-mix(in srgb, var(--accent-cyan) 12%, transparent) 0%, transparent 72%);
  color: color-mix(in srgb, var(--accent-cyan) 88%, #fff);
  font-size: 0.82rem;
  font-weight: 600;
  padding: 9px 10px;
  cursor: pointer;
  width: 100%;
  min-width: 0;
  text-align: center;
  line-height: 1.25;
  transition: all 0.2s ease;
}

.card-action-btn:hover {
  background:
    linear-gradient(140deg, color-mix(in srgb, var(--accent-cyan) 24%, transparent) 0%, color-mix(in srgb, var(--accent-magenta) 12%, transparent) 100%);
  box-shadow: 0 0 14px color-mix(in srgb, var(--accent-cyan) 30%, transparent);
}

.card-action-btn.delete-btn {
  border-color: #e96f63;
  color: #ff9286;
  background: linear-gradient(140deg, rgba(231, 76, 60, 0.16) 0%, transparent 76%);
  grid-column: 1 / -1;
}

.card-action-btn.delete-btn:hover {
  background: linear-gradient(140deg, rgba(231, 76, 60, 0.24) 0%, rgba(192, 57, 43, 0.14) 100%);
  box-shadow: 0 0 14px rgba(231, 76, 60, 0.26);
}

.card-action-btn.export-btn {
  border-color: #a571c0;
  color: #ca9ff2;
  background: linear-gradient(140deg, rgba(155, 89, 182, 0.16) 0%, transparent 78%);
}

.card-action-btn.export-btn:hover {
  background: linear-gradient(140deg, rgba(155, 89, 182, 0.26) 0%, rgba(142, 68, 173, 0.14) 100%);
  box-shadow: 0 0 14px rgba(155, 89, 182, 0.28);
}

.card-action-btn.export-btn:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.card-action-btn.share-btn {
  border-color: #57b7d7;
  color: #8adfff;
  background: linear-gradient(140deg, rgba(52, 152, 219, 0.2) 0%, transparent 78%);
}

.card-action-btn.share-btn:hover {
  background: linear-gradient(140deg, rgba(52, 152, 219, 0.3) 0%, rgba(41, 128, 185, 0.14) 100%);
  box-shadow: 0 0 14px rgba(52, 152, 219, 0.28);
}

.card-action-btn.share-btn:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.export-message {
  border: 1px solid color-mix(in srgb, #e74c3c 32%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, #e74c3c 12%, transparent);
  text-align: center;
  padding: 9px 10px;
  font-size: 0.8rem;
  color: #ff9386;
  animation: fade-in 0.3s ease;
}

.export-message.is-success {
  border-color: color-mix(in srgb, #2ecc71 36%, transparent);
  background: color-mix(in srgb, #2ecc71 14%, transparent);
  color: #8bf3b2;
}

@media (max-width: 900px) {
  .card-detail-body {
    grid-template-columns: 1fr;
  }

  .card-detail-side {
    border-left: 0;
    border-top: 1px solid color-mix(in srgb, var(--accent-cyan) 20%, transparent);
  }
}

@media (max-width: 640px) {
  .collection-header {
    padding: 12px 10px;
  }

  .collection-header-main {
    width: 100%;
  }

  .collection-title {
    font-size: 1.05rem;
  }

  .collection-subtitle {
    font-size: 0.74rem;
  }

  .collection-body {
    padding: 10px;
  }

  .collection-grid {
    gap: 10px;
  }

  .collection-card-item {
    min-height: 152px;
    padding: 10px;
    border-radius: 14px;
  }

  .card-detail-overlay {
    padding: 8px;
  }

  .card-detail-panel {
    width: 100%;
    max-height: 92dvh;
    border-radius: 14px;
  }

  .card-detail-footer {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
