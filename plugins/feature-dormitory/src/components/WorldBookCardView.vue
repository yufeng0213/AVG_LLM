<script setup>
/**
 * WorldBookCardView.vue - 世界书卡片视图组件
 * 负责展示世界书卡片信息和切换功能
 */

const props = defineProps({
  worldBooks: {
    type: Array,
    default: () => [],
  },
  activeCardIndex: {
    type: Number,
    default: 0,
  },
  characterCards: {
    type: Array,
    default: () => [],
  },
  cardTransitionName: {
    type: String,
    default: 'card-slide-next',
  },
  isLoadingBooks: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['enter-grid', 'next-book', 'prev-book', 'touch-start', 'touch-cancel', 'touch-end'])

const handleEnterGrid = () => {
  emit('enter-grid')
}

const handleNextBook = () => {
  emit('next-book')
}

const handlePrevBook = () => {
  emit('prev-book')
}

const handleTouchStart = (event) => {
  emit('touch-start', event)
}

const handleTouchCancel = () => {
  emit('touch-cancel')
}

const handleTouchEnd = (event) => {
  emit('touch-end', event)
}
</script>

<template>
  <section
    class="worldbook-card-stage"
    @touchstart="handleTouchStart"
    @touchcancel="handleTouchCancel"
    @touchend="handleTouchEnd"
  >
    <div class="worldbook-card-wrap">
      <p class="card-swipe-hint">支持左右滑动切换世界书</p>
      <Transition :name="cardTransitionName" mode="out-in">
        <article :key="worldBooks[activeCardIndex]?.id || `book-${activeCardIndex}`" class="worldbook-card">
          <p class="card-index">世界书卡片 {{ activeCardIndex + 1 }} / {{ worldBooks.length }}</p>
          <h2 class="worldbook-title">{{ worldBooks[activeCardIndex]?.title || '未命名世界书' }}</h2>
          <p class="worldbook-summary">{{ worldBooks[activeCardIndex]?.summary || '该世界书暂未填写简介。' }}</p>
          <div class="worldbook-meta-row">
            <span class="meta-chip">{{ characterCards.length }} 个 CHAR</span>
            <span class="meta-chip">{{ worldBooks[activeCardIndex]?.isDefault ? '默认' : '自定义' }}</span>
          </div>
          <button
            type="button"
            class="enter-dorm-btn"
            :disabled="characterCards.length === 0"
            @click="handleEnterGrid"
          >
            进入寝室
          </button>
          <p v-if="characterCards.length === 0" class="worldbook-hint">
            该世界书暂无 CHAR，请先在世界书中创建角色。
          </p>
        </article>
      </Transition>
    </div>
  </section>
</template>
