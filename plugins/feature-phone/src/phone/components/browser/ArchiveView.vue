<script setup>
/**
 * ArchiveView.vue - 档案馆浏览视图
 * 网格展示 + 分类/稀有度过滤 + 详情弹窗
 */
import { computed, onMounted, ref } from 'vue'
import { filterArchive, getArchiveStats, CATEGORY_LABELS, RARITY_CONFIG } from '../../services/archiveService.js'
import ArchiveCardBubble from './ArchiveCardBubble.vue'

const emit = defineEmits(['back'])

const cards = ref([])
const stats = ref({ byRarity: {}, byCategory: {}, totalCount: 0 })
const filterCategory = ref(null)
const filterRarity = ref(null)
const selectedCard = ref(null)

onMounted(async () => {
  await loadData()
})

async function loadData() {
  const result = await filterArchive({
    category: filterCategory.value || undefined,
    rarity: filterRarity.value || undefined,
  })
  cards.value = result
  stats.value = await getArchiveStats()
}

function clearFilters() {
  filterCategory.value = null
  filterRarity.value = null
  loadData()
}

function onCategoryClick(cat) {
  filterCategory.value = filterCategory.value === cat ? null : cat
  loadData()
}

function onRarityClick(rarity) {
  filterRarity.value = filterRarity.value === rarity ? null : rarity
  loadData()
}

const categoryKeys = computed(() => Object.keys(CATEGORY_LABELS))
const rarityKeys = computed(() => Object.keys(RARITY_CONFIG))

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<template>
  <div class="archive-view-screen">
    <!-- 统计头 -->
    <div class="archive-header">
      <button class="archive-back-btn" @click="emit('back')">&#8592; 返回</button>
      <div class="archive-stats">
        <span class="archive-stat-total">{{ stats.totalCount }} 张档案</span>
      </div>
    </div>

    <!-- 过滤器 -->
    <div class="archive-filter-bar">
      <div class="archive-filter-row">
        <button
          v-for="cat in categoryKeys"
          :key="cat"
          class="archive-filter-chip"
          :class="{ active: filterCategory === cat }"
          @click="onCategoryClick(cat)"
        >
          {{ CATEGORY_LABELS[cat] }}
          <span v-if="stats.byCategory[cat]" class="filter-chip-count">{{ stats.byCategory[cat] }}</span>
        </button>
      </div>
      <div class="archive-filter-row">
        <button
          v-for="rarity in rarityKeys"
          :key="rarity"
          class="archive-filter-chip rarity-chip"
          :class="{ active: filterRarity === rarity }"
          :style="filterRarity === rarity ? { borderColor: RARITY_CONFIG[rarity].color, color: RARITY_CONFIG[rarity].color } : {}"
          @click="onRarityClick(rarity)"
        >
          {{ RARITY_CONFIG[rarity].label }}
          <span v-if="stats.byRarity[rarity]" class="filter-chip-count">{{ stats.byRarity[rarity] }}</span>
        </button>
      </div>
      <button v-if="filterCategory || filterRarity" class="archive-clear-filter" @click="clearFilters">清除筛选</button>
    </div>

    <!-- 卡片网格 -->
    <div class="archive-grid">
      <div v-if="cards.length === 0" class="archive-empty">
        <p>还没有档案卡片</p>
        <p class="archive-empty-hint">在浏览器中分享网页来开始收集</p>
      </div>
      <div
        v-for="card in cards"
        :key="card.id"
        class="archive-grid-item"
        @click="selectedCard = card"
      >
        <ArchiveCardBubble :card="card" />
        <div class="archive-grid-date">{{ formatDate(card.createdAt) }}</div>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="selectedCard" class="archive-detail-overlay" @click="selectedCard = null">
      <div class="archive-detail-modal" @click.stop>
        <button class="archive-detail-close" @click="selectedCard = null">&times;</button>
        <ArchiveCardBubble :card="selectedCard" />
        <div v-if="selectedCard.excerpt" class="archive-detail-excerpt">
          <div class="archive-detail-excerpt-title">原文片段</div>
          <div class="archive-detail-excerpt-text">{{ selectedCard.excerpt }}</div>
        </div>
        <div class="archive-detail-meta">
          <span>发现于 {{ formatDate(selectedCard.createdAt) }}</span>
          <span v-if="selectedCard.sourceUrl">{{ selectedCard.sourceUrl }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
