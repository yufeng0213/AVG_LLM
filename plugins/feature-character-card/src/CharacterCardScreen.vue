<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useCardCollection } from './composables/useCardCollection.js'
import CardPoolScreen from './components/CardPoolScreen.vue'
import CardDetailScreen from './components/CardDetailScreen.vue'
import ActivityScreen from './ActivityScreen.vue'
import ActivityStoryScreen from '../../../src/screens/ActivityStoryScreen.vue'
import { CHARACTER_CARD_DEFS, getRarityConfig } from './services/cardData.js'
import { useActivityEntry } from '../../../src/features/useActivityEntry.js'

const props = defineProps({
  worldBookId: { type: String, default: 'default_world_book' }
})

const emit = defineEmits(['back'])

console.log('[CharacterCardScreen] props.worldBookId:', props.worldBookId)

// 使用全局的 cardCollection API（如果可用），确保与 iframe 调用同步
const globalCardCollection = window.__avgLLM?.cardCollection

const {
  cards,
  loaded,
  load,
  totalCards,
  cardsByCharacter,
  cardsByRarity,
  getCardDetail,
  getUnownedCards,
} = useCardCollection(props.worldBookId)

// 监听 iframe 添加卡牌事件，刷新本地数据
watch(cards, () => {
  console.log('[CharacterCardScreen] cards changed:', cards.value.length)
}, { deep: true })

const activeTab = ref('collection')
const selectedCard = ref(null)
const showAllCards = ref(false)
const showPool = ref(false)
const showActivity = ref(false)
const showActivityStory = ref(false)
const activityStoryData = ref({ activityId: '', storyConfig: null, activityFiles: null })
const selectedInstanceId = ref(null) // 用于跳转到详情界面

const tabs = [
  { key: 'collection', label: '我的卡牌', icon: '🎴' },
  { key: 'gallery', label: '图鉴', icon: '📖' },
  { key: 'activity', label: '活动', icon: '🎪' },
]

const collectionTotal = computed(() => totalCards.value)
const galleryTotal = computed(() => CHARACTER_CARD_DEFS.length)
const collectionRate = computed(() => {
  const owned = new Set(cards.value.map(c => c.cardId))
  return Math.round((owned.size / CHARACTER_CARD_DEFS.length) * 100)
})

// 获取卡牌图片路径
function getCardImage(cardDef) {
  // 优先使用定义中的 image 字段
  if (cardDef.image) return cardDef.image

  // 根据 activityId 和角色名构建路径（活动卡牌）
  if (cardDef.activityId && cardDef.characterName) {
    const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron
    const basePath = isElectron
      ? `activity://${cardDef.activityId}/activity/portraits/`
      : `/data/activities/${cardDef.activityId}/activity/portraits/`
    return basePath + cardDef.characterName + '.png'
  }

  // 默认占位图
  return null
}

// 格式化卡牌显示名称：卡牌名·角色名
function formatCardName(cardDef) {
  return `${cardDef.name}·${cardDef.characterName}`
}

function openCardDetail(instanceId) {
  selectedInstanceId.value = instanceId
}

function openGalleryCard(cardDef) {
  const ownedInstance = cards.value.find(c => c.cardId === cardDef.id)
  if (ownedInstance) {
    openCardDetail(ownedInstance.instanceId)
  } else {
    selectedCard.value = { def: cardDef, card: null, stats: cardDef.baseStats }
  }
}

function closeDetail() {
  selectedCard.value = null
}

function handleCardClick(instanceId) {
  selectedInstanceId.value = instanceId
}

const activityEntry = useActivityEntry()

onMounted(async () => {
  await load()
})

// 监听来自 WorldHub 的活动跳转请求
watch(
  () => activityEntry.pendingActivityId.value,
  (id) => {
    if (id) {
      activeTab.value = 'activity'
      showActivity.value = true
    }
  },
  { immediate: true },
)

// 处理活动故事打开事件
function handleOpenActivityStory(data) {
  activityStoryData.value = {
    activityId: data.activityId,
    storyConfig: data.storyConfig || {
      title: '活动故事',
      openingPrompt: '一场奇妙的故事即将展开...',
      sceneCharacters: [],
      mood: '轻松愉悦'
    },
    activityFiles: data.activityFiles || null,
  }
  showActivity.value = false
  showActivityStory.value = true
}

function closeActivityStory() {
  showActivityStory.value = false
  showActivity.value = true
}
</script>

<template>
  <div class="character-card-screen">
    <!-- 抽卡页面 -->
    <CardPoolScreen v-if="showPool" @back="showPool = false" />

    <!-- 卡牌详情页面 -->
    <CardDetailScreen v-else-if="selectedInstanceId" :instance-id="selectedInstanceId" @back="selectedInstanceId = null" />

    <!-- 活动页面 -->
    <ActivityScreen v-else-if="showActivity" @back="showActivity = false" @open-activity-story="handleOpenActivityStory" />

    <!-- 活动故事页面 -->
    <ActivityStoryScreen
      v-else-if="showActivityStory"
      :activity-id="activityStoryData.activityId"
      :story-config="activityStoryData.storyConfig"
      :activity-files="activityStoryData.activityFiles"
      @back="closeActivityStory"
    />

    <!-- 主页面 -->
    <template v-else>
    <header class="card-screen-header">
      <button type="button" class="back-button" @click="emit('back')">
        <span class="back-icon">‹</span>
      </button>
      <div class="title-group">
        <h1 class="card-title">角色卡牌</h1>
        <p class="card-subtitle">CHARACTER CARD</p>
      </div>
    </header>

    <!-- 收集率统计 -->
    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-value">{{ collectionTotal }}</span>
        <span class="stat-label">已收集</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ galleryTotal }}</span>
        <span class="stat-label">总数</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ collectionRate }}%</span>
        <span class="stat-label">收集率</span>
      </div>
      <button class="pool-entry-btn" @click="showPool = true">
        <span class="pool-icon">🎰</span>
        <span class="pool-label">抽卡</span>
      </button>
    </div>

    <!-- Tab 切换 -->
    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <span class="tab-icon">{{ tab.icon }}</span>
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <!-- 内容区域 -->
    <div class="card-screen-body">
      <!-- 我的卡牌 -->
      <div v-if="activeTab === 'collection'" class="tab-content">
        <div v-if="!loaded" class="loading">加载中...</div>
        <div v-else-if="cards.length === 0" class="empty-state">
          <span class="empty-icon">🎴</span>
          <p>还没有收集到任何角色卡牌</p>
          <p class="empty-hint">去图鉴看看吧</p>
        </div>
        <div v-else class="card-list">
          <div
            v-for="(group, gi) in cardsByCharacter"
            :key="gi"
            class="character-group"
          >
            <div class="group-header">
              <span class="group-name">{{ group.name }}</span>
              <span class="group-count">{{ group.cards.length }}张</span>
            </div>
            <div class="card-grid">
              <div
                v-for="card in group.cards"
                :key="card.instanceId"
                class="card-cell"
                @click="handleCardClick(card.instanceId)"
              >
                <div
                  class="card-item"
                  :class="card.def.rarity"
                >
                  <div class="card-rarity-tag" :class="card.def.rarity">
                    {{ card.def.rarity }}
                  </div>
                  <img
                    v-if="getCardImage(card.def)"
                    :src="getCardImage(card.def)"
                    class="card-art-img"
                    alt=""
                  />
                  <div v-else class="card-art-placeholder">
                    <span class="card-art-icon">🎴</span>
                  </div>
                </div>
                <div class="card-info">
                  <div class="card-full-name">{{ formatCardName(card.def) }}</div>
                  <div class="card-level">Lv.{{ card.level }} ★{{ card.stars }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 图鉴 -->
      <div v-if="activeTab === 'gallery'" class="tab-content">
        <div class="gallery-controls">
          <button class="toggle-btn" @click="showAllCards = !showAllCards">
            {{ showAllCards ? '只看未收集' : '显示全部' }}
          </button>
        </div>
        <div class="card-list">
          <div
            v-for="(group, gi) in CHARACTER_CARD_DEFS.reduce((acc, def) => {
              if (!showAllCards && cards.some(c => c.cardId === def.id)) return acc
              const name = def.characterName
              if (!acc[name]) acc[name] = { name, cards: [] }
              acc[name].cards.push(def)
              return acc
            }, {})"
            :key="gi"
            class="character-group"
          >
            <div class="group-header">
              <span class="group-name">{{ group.name }}</span>
            </div>
            <div class="card-grid">
              <div
                v-for="def in group.cards"
                :key="def.id"
                class="card-cell"
                @click="openGalleryCard(def)"
              >
                <div
                  class="card-item gallery-item"
                  :class="{ owned: cards.some(c => c.cardId === def.id), [def.rarity]: true }"
                >
                  <div class="card-rarity-tag" :class="def.rarity">
                    {{ def.rarity }}
                  </div>
                  <img
                    v-if="cards.some(c => c.cardId === def.id) && getCardImage(def)"
                    :src="getCardImage(def)"
                    class="card-art-img"
                    alt=""
                  />
                  <div v-else class="card-art-placeholder" :class="{ 'art-owned': cards.some(c => c.cardId === def.id) }">
                    <span v-if="cards.some(c => c.cardId === def.id)" class="card-art-icon owned-icon">✓</span>
                    <span v-else class="card-art-icon">?</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 活动 -->
      <div v-if="activeTab === 'activity'" class="tab-content">
        <button class="activity-entry-btn" @click="showActivity = true">
          <span class="activity-entry-icon">🎪</span>
          <span class="activity-entry-text">进入活动中心</span>
        </button>
        <p class="activity-entry-hint">活动需要联网加载，将活动文件夹放在 data/activities/ 下即可自动发现</p>
      </div>
    </div>

    <!-- 未拥有卡牌预览弹窗（仅图鉴用） -->
    <div v-if="selectedCard && !selectedCard.card" class="card-detail-overlay" @click.self="closeDetail">
      <div class="card-detail-panel">
        <button class="detail-close" @click="closeDetail">✕</button>

        <div class="detail-header">
          <div class="detail-name">{{ selectedCard.def.name }}</div>
          <div class="detail-character">{{ selectedCard.def.characterName }}</div>
          <div class="detail-rarity" :style="{ color: getRarityConfig(selectedCard.def.rarity).color }">
            {{ selectedCard.def.rarity }}
          </div>
        </div>

        <div class="detail-section">
          <div class="not-owned-hint">
            <span class="hint-icon">🔒</span>
            <span>尚未获得此卡牌</span>
          </div>
        </div>
        <div class="detail-section">
          <h3 class="section-title">获取方式</h3>
          <div class="obtain-info">
            <span class="obtain-method">{{ selectedCard.def.obtainMethod === 'gacha' ? '抽卡' : selectedCard.def.obtainMethod === 'event' ? '活动' : selectedCard.def.obtainMethod === 'shop' ? '商店' : '剧情解锁' }}</span>
            <span class="obtain-source">{{ selectedCard.def.obtainSource }}</span>
          </div>
        </div>
        <div class="detail-section">
          <h3 class="section-title">基础属性</h3>
          <div class="attr-list">
            <div class="attr-row"><span class="attr-name">⚔️ 攻击</span><span class="attr-val">{{ selectedCard.def.baseStats.attack }}</span></div>
            <div class="attr-row"><span class="attr-name">🛡️ 防御</span><span class="attr-val">{{ selectedCard.def.baseStats.defense }}</span></div>
            <div class="attr-row"><span class="attr-name">💕 魅力</span><span class="attr-val">{{ selectedCard.def.baseStats.charm }}</span></div>
            <div class="attr-row"><span class="attr-name">🍀 幸运</span><span class="attr-val">{{ selectedCard.def.baseStats.luck }}</span></div>
          </div>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<style scoped>
.character-card-screen {
  height: 100dvh;
  min-height: 100vh;
  width: 100%;
  background: var(--background, #0a0a0a);
  color: var(--foreground, #ffffff);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.card-screen-header {
  position: relative;
  z-index: 2;
  display: flex;
  flex-shrink: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
}

.back-button {
  appearance: none !important;
  border: none !important;
  padding: 0 !important;
  margin: 0 !important;
  font: 500 1.2rem/1 var(--font-body) !important;
  color: rgba(255, 255, 255, 0.5) !important;
  background: transparent !important;
  cursor: pointer !important;
  width: 44px !important;
  min-width: 44px !important;
  min-height: 44px !important;
}

.back-icon { font-size: 1.5rem !important; font-weight: 700 !important; }

.title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: auto;
  text-align: right;
}

.card-title { margin: 0; font-size: 1.4rem; }

.card-subtitle {
  margin: 0;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: linear-gradient(90deg, #ff6b9d, #c44dff, #ff6b9d);
  background-size: 250% 250%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: avg-gradient-shift 4s linear infinite;
}

/* 统计栏 */
.stats-bar {
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  gap: 24px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: #ff6b9d;
}

.stat-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}

/* 抽卡入口按钮 */
.pool-entry-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(245, 158, 11, 0.2));
  border: 1px solid rgba(168, 85, 247, 0.4);
  border-radius: 8px;
  padding: 6px 14px;
  cursor: pointer;
  transition: all 0.2s;
  animation: pool-btn-glow 3s ease-in-out infinite;
}

.pool-entry-btn:hover {
  transform: scale(1.05);
  border-color: rgba(168, 85, 247, 0.7);
}

.pool-icon { font-size: 20px; }
.pool-label { font-size: 10px; color: #a855f7; font-weight: 700; }

@keyframes pool-btn-glow {
  0%, 100% { box-shadow: 0 0 4px rgba(168, 85, 247, 0.3); }
  50% { box-shadow: 0 0 12px rgba(168, 85, 247, 0.6); }
}

/* Tab */
.tab-bar {
  display: flex;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 0;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.tab-btn.active {
  color: #ff6b9d;
  border-bottom-color: #ff6b9d;
}

.tab-icon { font-size: 15px; }

/* 内容区域 */
.card-screen-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.loading, .empty-state {
  text-align: center;
  padding: 60px 20px;
  color: rgba(255, 255, 255, 0.4);
}

.empty-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 12px;
}

.empty-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 4px;
}

/* 角色分组 */
.character-group {
  margin-bottom: 20px;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 10px;
}

.group-name {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
}

.group-count {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
}

/* 卡牌网格 - 两列布局 */
.card-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  padding: 0 8px;
}

/* 卡牌单元格（包含卡片和信息） */
.card-cell {
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
}

/* 卡牌卡片框（只包含图片和稀有度） */
.card-item {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;  /* 卡牌比例 */
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s ease;
  border: 3px solid transparent;
}

.card-item:hover {
  transform: translateY(-4px) scale(1.02);
}

/* 稀有度便签样式 */
.card-rarity-tag {
  position: absolute;
  top: 0;
  left: 0;
  padding: 4px 12px 6px 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  border-radius: 0 0 8px 0;
  z-index: 2;
}

.card-rarity-tag.SSR {
  background: linear-gradient(135deg, #ffd700, #ffb800);
  color: #1a1a2e;
  border-bottom: 2px solid #b8860b;
}

.card-rarity-tag.SR {
  background: linear-gradient(135deg, #48d1cc, #3bb8b4);
  color: #fff;
  border-bottom: 2px solid #2a9d8f;
}

.card-rarity-tag.R {
  background: rgba(255, 255, 255, 0.9);
  color: #333;
  border-bottom: 2px solid rgba(255, 255, 255, 0.5);
}

.card-rarity-tag.N {
  background: rgba(156, 163, 175, 0.9);
  color: #fff;
  border-bottom: 2px solid rgba(107, 114, 128, 0.8);
}

/* 卡牌图片填满卡片 */
.card-art-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-art-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
}

.card-art-icon { font-size: 48px; opacity: 0.3; }

.owned-icon {
  font-size: 36px !important;
  color: #22c55e;
  opacity: 1 !important;
  font-weight: 700;
}

/* 稀有度边框和背景效果 */
.card-item.SSR {
  border-color: #ffd700;
  box-shadow: 0 2px 12px rgba(255, 215, 0, 0.2);
}

.card-item.SSR:hover {
  box-shadow: 0 8px 24px rgba(255, 215, 0, 0.4);
}

.card-item.SR {
  border-color: #48d1cc;
  box-shadow: 0 2px 10px rgba(72, 209, 204, 0.2);
}

.card-item.SR:hover {
  box-shadow: 0 8px 20px rgba(72, 209, 204, 0.4);
}

.card-item.R {
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 2px 8px rgba(255, 255, 255, 0.1);
}

.card-item.N {
  border-color: rgba(156, 163, 175, 0.3);
}

/* 图鉴未拥有的样式 */
.gallery-item:not(.owned) {
  opacity: 0.5;
  filter: grayscale(40%);
}

.gallery-item.owned {
  border-color: rgba(34, 197, 94, 0.4);
}

/* 卡牌信息区域（在卡片下方） */
.card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: center;
}

.card-full-name {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  line-height: 1.3;
}

.card-name {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  text-align: center;
}

.card-level {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.card-source {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

/* 图鉴 */
.gallery-controls {
  margin-bottom: 12px;
}

.toggle-btn {
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  cursor: pointer;
}

.gallery-item:not(.owned) {
  opacity: 0.6;
}

.gallery-item.owned {
  border-color: rgba(34, 197, 94, 0.3);
}

/* 活动入口 */
.activity-entry-btn {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px;
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(245, 158, 11, 0.1));
  border: 1px solid rgba(168, 85, 247, 0.3);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  color: #fff;
  animation: activity-btn-glow 3s ease-in-out infinite;
}

.activity-entry-btn:hover {
  transform: translateY(-2px);
  border-color: rgba(168, 85, 247, 0.5);
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(245, 158, 11, 0.15));
}

.activity-entry-icon { font-size: 36px; }
.activity-entry-text { font-size: 14px; font-weight: 600; color: #a855f7; }

.activity-entry-hint {
  text-align: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 12px;
  line-height: 1.4;
}

@keyframes activity-btn-glow {
  0%, 100% { box-shadow: 0 0 4px rgba(168, 85, 247, 0.2); }
  50% { box-shadow: 0 0 12px rgba(168, 85, 247, 0.5); }
}

/* 详情弹窗 */
.card-detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  animation: fade-in 0.15s ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.card-detail-panel {
  background: #1a1a2e;
  border-radius: 14px;
  width: min(420px, 92vw);
  max-height: 85vh;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 16px;
  position: relative;
}

.detail-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
}

.detail-header {
  text-align: center;
  margin-bottom: 10px;
}

.detail-name {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.detail-character {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}

.detail-rarity {
  font-size: 14px;
  font-weight: 700;
  margin-top: 4px;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-bottom: 16px;
}

.detail-tag {
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}

.detail-section {
  margin-bottom: 16px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

/* 养成信息 */
.detail-stats-grid {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.detail-stat-item {
  text-align: center;
}

.stat-label-small {
  display: block;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 4px;
}

.stat-value-big {
  font-size: 15px;
  font-weight: 600;
  color: #ff6b9d;
}

/* 属性 */
.attr-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.attr-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
}

.attr-name { font-size: 13px; color: rgba(255, 255, 255, 0.6); }
.attr-val { font-size: 13px; font-weight: 600; color: #fff; }

/* 技能 */
.skill-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  margin-bottom: 6px;
}

.skill-name { font-size: 13px; font-weight: 600; color: #fff; }
.skill-type { font-size: 10px; padding: 2px 6px; background: rgba(255, 255, 255, 0.08); border-radius: 4px; color: rgba(255, 255, 255, 0.5); }
.skill-desc { font-size: 11px; color: rgba(255, 255, 255, 0.4); }

.empty-skill { font-size: 12px; color: rgba(255, 255, 255, 0.3); }

/* 剧情 */
.story-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  margin-bottom: 6px;
}

.story-title { font-size: 13px; color: rgba(255, 255, 255, 0.7); }
.story-status { font-size: 11px; color: rgba(255, 255, 255, 0.3); }
.story-status.unlocked { color: #22c55e; }

/* 未拥有提示 */
.not-owned-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
}

.hint-icon { font-size: 20px; }

.obtain-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
}

.obtain-method { font-size: 13px; color: rgba(255, 255, 255, 0.6); }
.obtain-source { font-size: 12px; color: rgba(255, 255, 255, 0.4); }

@keyframes avg-gradient-shift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}


  .platform-android.android-portrait .pool-entry-btn {
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

  .platform-android.android-portrait .tab-bar {
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    flex-shrink: 0 !important;
    flex-wrap: nowrap !important;
    display: flex !important;
    box-sizing: border-box !important;
    overflow: visible !important;
  }

  .platform-android.android-portrait .tab-btn {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    max-width: none !important;
    max-height: none !important;
    flex: 1 1 0 !important;
    font-size: 0.85rem !important;
    padding: 8px 2px !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border-radius: 0 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    gap: 4px !important;
  }

  .platform-android.android-portrait .tab-icon {
    font-size: 1rem !important;
    flex-shrink: 0 !important;
  }
</style>
