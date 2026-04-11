<script setup>
/**
 * CharacterGridView.vue - 角色网格视图组件
 * 负责展示角色列表和切换功能
 */

const props = defineProps({
  characterCards: {
    type: Array,
    default: () => [],
  },
  activeCharacterIndex: {
    type: Number,
    default: 0,
  },
  portraitUrlMap: {
    type: Object,
    default: () => ({}),
  },
  defaultPortraitUrl: {
    type: String,
    default: '',
  },
  isLoadingCharacters: {
    type: Boolean,
    default: false,
  },
  activeBookEconomyCoins: {
    type: Number,
    default: 0,
  },
  activeBookEconomyCrystals: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits([
  'enter-room',
  'next-character',
  'prev-character',
  'switch-character',
  'touch-start',
  'touch-cancel',
  'touch-end',
  'open-shop',
])

const handleEnterRoom = (characterId) => {
  emit('enter-room', characterId)
}

const handleNextCharacter = () => {
  emit('next-character')
}

const handlePrevCharacter = () => {
  emit('prev-character')
}

const handleSwitchCharacter = (index) => {
  emit('switch-character', index)
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

const handleOpenShop = () => {
  emit('open-shop')
}

const getCharacterCardClass = (index) => {
  return {
    'is-active': index === props.activeCharacterIndex,
    'is-prev': index === (props.activeCharacterIndex - 1 + props.characterCards.length) % props.characterCards.length,
    'is-next': index === (props.activeCharacterIndex + 1) % props.characterCards.length,
  }
}
</script>

<template>
  <section
    class="character-grid-stage"
    @touchstart="handleTouchStart"
    @touchcancel="handleTouchCancel"
    @touchend="handleTouchEnd"
  >
    <!-- 世界书级别货币显示 -->
    <div class="worldbook-economy-bar">
      <span class="economy-item">
        <span class="economy-icon">💰</span>
        <span class="economy-value">{{ activeBookEconomyCoins }}</span>
      </span>
      <span class="economy-item">
        <span class="economy-icon">💎</span>
        <span class="economy-value">{{ activeBookEconomyCrystals }}</span>
      </span>
      <button type="button" class="economy-shop-btn" @click="handleOpenShop">
        🏪 商店
      </button>
    </div>

    <div v-if="isLoadingCharacters" class="dorm-state-box">正在加载角色立绘...</div>
    <div v-else-if="characterCards.length === 0" class="dorm-state-box">当前世界书暂无 CHAR。</div>
    <div v-else class="character-carousel">
      <p class="card-swipe-hint">左右滑动切换角色</p>
      <p class="character-card-name">{{ characterCards[activeCharacterIndex]?.label || '未命名角色' }}</p>
      <div class="character-carousel-track">
        <button
          v-for="(character, index) in characterCards"
          :key="character.id"
          type="button"
          class="character-carousel-card"
          :class="getCharacterCardClass(index)"
          @click="index === activeCharacterIndex ? handleEnterRoom(character.id) : handleSwitchCharacter(index)"
        >
          <img
            class="character-card-portrait-img"
            :src="portraitUrlMap[character.id] || defaultPortraitUrl"
            :alt="character.label"
          />
        </button>
      </div>
    </div>
  </section>
</template>
