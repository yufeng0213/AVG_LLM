<script setup>
/**
 * NestSelectorView.vue - 寝室选择视图
 * 展示世界书卡片（左右滑动切换），点击卡片进入对应寝室的角色网格。
 * 底部附带"面对面"临时入口按钮。
 */
import './NestSelectorView.css'
import { computed, onMounted, ref } from 'vue'
import { getActiveWorldBookId, loadWorldBooks } from '../../../../src/worldbook/worldBookStore.js'

const emit = defineEmits(['back', 'enter-dorm', 'open-face-to-face'])

const worldBooks = ref([])
const activeCardIndex = ref(0)
const isLoadingBooks = ref(false)

// 触摸滑动状态
let touchStartX = 0
let touchStartY = 0
let touchDeltaX = 0
const CARD_SWIPE_THRESHOLD = 50

const loadBooks = async () => {
  isLoadingBooks.value = true
  try {
    const books = await loadWorldBooks()
    worldBooks.value = Array.isArray(books) ? books : []

    if (worldBooks.value.length === 0) {
      activeCardIndex.value = 0
      return
    }

    const activeBookId = await getActiveWorldBookId()
    const activeIdx = worldBooks.value.findIndex(b => b.id === activeBookId)
    activeCardIndex.value = activeIdx >= 0 ? activeIdx : 0
  } catch (e) {
    console.warn('[NestSelector] Failed to load world books:', e)
    worldBooks.value = []
  } finally {
    isLoadingBooks.value = false
  }
}

onMounted(() => {
  loadBooks()
})

// 当前卡片的世界书
const activeWorldBook = computed(() => {
  return worldBooks.value[activeCardIndex.value] || null
})

// 上一张/下一张索引
const prevCardIndex = computed(() => {
  if (worldBooks.value.length <= 1) return 0
  return (activeCardIndex.value - 1 + worldBooks.value.length) % worldBooks.value.length
})

const nextCardIndex = computed(() => {
  if (worldBooks.value.length <= 1) return 0
  return (activeCardIndex.value + 1) % worldBooks.value.length
})

// 卡片类
const getCardClass = (index) => {
  const isPrev = index === prevCardIndex.value
  const isNext = index === nextCardIndex.value
  const isActive = index === activeCardIndex.value
  return {
    'nest-card-active': isActive,
    'nest-card-prev': isPrev,
    'nest-card-next': isNext,
  }
}

// 触摸滑动处理
const handleTouchStart = (event) => {
  touchStartX = event.touches[0].clientX
  touchStartY = event.touches[0].clientY
  touchDeltaX = 0
}

const handleTouchMove = (event) => {
  const dx = event.touches[0].clientX - touchStartX
  const dy = event.touches[0].clientY - touchStartY
  // 只在横向滑动大于纵向时处理
  if (Math.abs(dx) > Math.abs(dy)) {
    touchDeltaX = dx
  }
}

const handleTouchEnd = () => {
  if (touchDeltaX > CARD_SWIPE_THRESHOLD && worldBooks.value.length > 1) {
    // 右滑：上一张
    activeCardIndex.value = prevCardIndex.value
  } else if (touchDeltaX < -CARD_SWIPE_THRESHOLD && worldBooks.value.length > 1) {
    // 左滑：下一张
    activeCardIndex.value = nextCardIndex.value
  }
  touchDeltaX = 0
}

const handleCardClick = (index) => {
  if (index === activeCardIndex.value) {
    // 点击当前卡片 → 进入角色选择
    emit('enter-dorm', activeWorldBook.value)
  } else {
    activeCardIndex.value = index
  }
}
</script>

<template>
  <div class="nest-selector-view">
    <!-- 顶部占位 -->
    <header class="nest-header"></header>

    <!-- 世界书卡片轮播 -->
    <section
      class="nest-carousel"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
    >
      <!-- 空状态 -->
      <div v-if="isLoadingBooks" class="nest-empty-box">
        <p>正在加载寝室列表...</p>
      </div>
      <div v-else-if="worldBooks.length === 0" class="nest-empty-box">
        <p>暂无可进入的寝室</p>
        <p class="nest-empty-hint">请先创建世界书</p>
      </div>

      <!-- 卡片轨道 -->
      <template v-else>
        <div class="nest-carousel-track">
          <button
            v-for="(book, index) in worldBooks"
            :key="book.id"
            type="button"
            class="nest-carousel-card"
            :class="getCardClass(index)"
            @click="handleCardClick(index)"
          >
            <span class="nest-card-index">{{ index + 1 }} / {{ worldBooks.length }}</span>
            <h3 class="nest-card-title">{{ book.title }}</h3>
            <p class="nest-card-summary">{{ book.summary || '暂无简介' }}</p>
            <div class="nest-card-meta">
              <span v-if="book.isDefault" class="nest-meta-chip">默认</span>
              <span class="nest-meta-chip">点击进入</span>
            </div>
          </button>
        </div>

        <!-- 轮播指示器 -->
        <div class="nest-carousel-dots">
          <span
            v-for="(book, index) in worldBooks"
            :key="book.id"
            class="nest-carousel-dot"
            :class="{ active: index === activeCardIndex }"
            @click="activeCardIndex = index"
          />
        </div>
      </template>
    </section>

    <!-- 底部按钮区域 -->
    <footer class="nest-footer">
      <!-- 面对面临时入口 -->
      <button type="button" class="nest-face-to-face-btn" @click="emit('open-face-to-face')">
        <span class="nest-f2f-icon">🎥</span>
        <span class="nest-f2f-label">面对面</span>
        <span class="nest-f2f-hint">临时入口（后期集成到寝室房间）</span>
      </button>
    </footer>
  </div>
</template>
