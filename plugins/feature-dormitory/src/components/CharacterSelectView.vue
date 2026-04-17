<script setup>
/**
 * CharacterSelectView.vue - 角色轮播选择视图
 * 左右滑动切换角色，点击当前角色进入寝室房间，支持卡牌边框叠加。
 */
import './CharacterSelectView.css'
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps({
  worldBook: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['back', 'enter-room'])

const DEFAULT_PORTRAIT_PATH = './data/lihui/default.png'

// 角色列表
const characterCards = computed(() => {
  const characters = Array.isArray(props.worldBook?.characters) ? props.worldBook.characters : []
  return characters.map((character, index) => ({
    id: String(character?.id || `char_${index + 1}`),
    label: getCharacterDisplayName(character, index),
    raw: character,
  }))
})

// 当前选中索引
const activeCardIndex = ref(0)

// 触摸滑动状态
let touchStartX = 0
let touchStartY = 0
let touchDeltaX = 0
const CARD_SWIPE_THRESHOLD = 50

// 上一张/下一张索引
const prevCardIndex = computed(() => {
  if (characterCards.value.length <= 1) return 0
  return (activeCardIndex.value - 1 + characterCards.value.length) % characterCards.value.length
})

const nextCardIndex = computed(() => {
  if (characterCards.value.length <= 1) return 0
  return (activeCardIndex.value + 1) % characterCards.value.length
})

// 当前激活角色
const activeCard = computed(() => characterCards.value[activeCardIndex.value] || null)

// 卡牌边框相关
const displaySettings = computed(() => props.worldBook?.displaySettings || {})
const cardBorderList = computed(() => displaySettings.value?.cardBorderList || [])
const activeCardBorder = computed(() => {
  const activeId = displaySettings.value?.activeCardBorderId
  if (!activeId || cardBorderList.value.length === 0) return null
  return cardBorderList.value.find(b => b.id === activeId) || cardBorderList.value[0] || null
})

// 角色立绘 URL
const portraitUrlMap = ref({})
const isLoadingPortraits = ref(false)

// 边框图片尺寸（用于计算容器高度和 cropRect 缩放）
const borderSize = ref({ naturalWidth: 0, naturalHeight: 0 })

// 动态 aspect-ratio：让容器高度跟随边框图片原始比例
const frameAspectRatio = computed(() => {
  const b = borderSize.value
  if (b.naturalWidth && b.naturalHeight) return b.naturalWidth / b.naturalHeight
  return 4 / 5 // 默认 4:5
})

// 立绘叠加区域样式（根据 cropRect + 边框缩放比例计算）
const portraitSlotStyle = computed(() => {
  if (!activeCardBorder.value) return {}
  const rect = activeCardBorder.value.cropRect
  const b = borderSize.value
  // 边框在 70vw 容器中的缩放比：displayWidth / naturalWidth
  // displayWidth = containerWidth = 70vw，但 container aspect-ratio = border ratio
  // 所以 displayWidth = displayHeight * (naturalWidth/naturalHeight)
  // 简化：container 宽度 = 70vw，高度 = 70vw / aspectRatio
  // 边框 object-fit: contain → 如果 container aspect-ratio = border ratio，则完全填满
  // scaleX = containerWidth / naturalWidth
  // scaleY = containerHeight / naturalHeight
  // 但 containerWidth 是 vw 单位，无法在 JS 中直接计算
  // 方案：用百分比定位
  if (!rect.w && !rect.h) return {}
  if (!b.naturalWidth || !b.naturalHeight) return {}
  return {
    left: `${(rect.x / b.naturalWidth) * 100}%`,
    top: `${(rect.y / b.naturalHeight) * 100}%`,
    width: `${(rect.w / b.naturalWidth) * 100}%`,
    height: `${(rect.h / b.naturalHeight) * 100}%`,
  }
})

// 预加载边框图片获取自然尺寸
const loadBorderImageSize = () => {
  if (!activeCardBorder.value?.filePath) return
  const img = new Image()
  img.onload = () => {
    borderSize.value = {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    }
  }
  img.src = activeCardBorder.value.filePath
}

const pickCharacterPortrait = (character) => {
  if (!Array.isArray(character?.portraits) || character.portraits.length === 0) {
    return null
  }
  return character.portraits.find(p => String(p?.emotion || '').trim() === 'default') || character.portraits[0]
}

const getPortraitImageUrl = (portrait) => {
  if (!portrait) return DEFAULT_PORTRAIT_PATH
  if (typeof portrait === 'string') return portrait
  if (portrait.filePath) return portrait.filePath
  if (portrait.path) return portrait.path
  return DEFAULT_PORTRAIT_PATH
}

const loadPortraits = async () => {
  isLoadingPortraits.value = true
  try {
    const nextMap = {}
    for (const card of characterCards.value) {
      const portrait = pickCharacterPortrait(card.raw)
      nextMap[card.id] = getPortraitImageUrl(portrait)
    }
    portraitUrlMap.value = nextMap
  } catch (e) {
    console.warn('[CharacterSelect] Failed to load portraits:', e)
  } finally {
    isLoadingPortraits.value = false
  }
}

// 触摸处理
const handleTouchStart = (event) => {
  touchStartX = event.touches[0].clientX
  touchStartY = event.touches[0].clientY
  touchDeltaX = 0
}

const handleTouchMove = (event) => {
  const dx = event.touches[0].clientX - touchStartX
  const dy = event.touches[0].clientY - touchStartY
  if (Math.abs(dx) > Math.abs(dy)) {
    touchDeltaX = dx
  }
}

const handleTouchEnd = () => {
  if (touchDeltaX > CARD_SWIPE_THRESHOLD && characterCards.value.length > 1) {
    activeCardIndex.value = prevCardIndex.value
  } else if (touchDeltaX < -CARD_SWIPE_THRESHOLD && characterCards.value.length > 1) {
    activeCardIndex.value = nextCardIndex.value
  }
  touchDeltaX = 0
}

const getCardClass = (index) => {
  const isPrev = index === prevCardIndex.value
  const isNext = index === nextCardIndex.value
  const isActive = index === activeCardIndex.value
  return {
    'char-card-active': isActive,
    'char-card-prev': isPrev,
    'char-card-next': isNext,
  }
}

const handleCardClick = (index) => {
  if (index === activeCardIndex.value) {
    // 点击当前角色 → 进入房间
    handleEnterRoom(activeCard.value)
  } else {
    activeCardIndex.value = index
  }
}

const handleEnterRoom = (card) => {
  if (!card) return
  emit('enter-room', card)
}

function getCharacterDisplayName(character, index) {
  const fallback = `角色 ${index + 1}`
  return String(character?.name || '').trim() || fallback
}

// 组件挂载后加载
onMounted(() => {
  loadPortraits()
  loadBorderImageSize()
  activeCardIndex.value = 0
})

// worldBook 变化时重置
watch(() => props.worldBook?.id, () => {
  loadPortraits()
  loadBorderImageSize()
  activeCardIndex.value = 0
})

// 边框切换时重新加载尺寸
watch(() => activeCardBorder.value?.id, () => {
  loadBorderImageSize()
})
</script>

<template>
  <div class="character-select-view">
    <!-- 顶部占位 -->
    <header class="char-select-header"></header>

    <!-- 角色轮播 -->
    <section
      class="char-select-carousel"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
    >
      <!-- 空状态 -->
      <div v-if="isLoadingPortraits" class="char-select-empty">
        <p>正在加载角色立绘...</p>
      </div>
      <div v-else-if="characterCards.length === 0" class="char-select-empty">
        <p>该世界书暂无角色</p>
        <p class="char-select-empty-hint">请先在世界书中创建角色</p>
      </div>

      <!-- 角色卡片轨道 -->
      <template v-else>
        <div class="char-carousel-track">
          <button
            v-for="(card, index) in characterCards"
            :key="card.id"
            type="button"
            class="char-carousel-card"
            :class="getCardClass(index)"
            @click="handleCardClick(index)"
          >
            <div class="char-card-inner">
              <span class="char-card-index">{{ index + 1 }} / {{ characterCards.length }}</span>

              <!-- 有卡牌边框时：立绘在 cropRect 位置 + 边框 overlay -->
              <div
                v-if="activeCardBorder && activeCardBorder.filePath"
                class="char-card-frame"
                :style="{ aspectRatio: frameAspectRatio }"
              >
                <!-- 立绘：根据 cropRect 百分比定位在边框下方 -->
                <div
                  v-if="activeCardBorder.cropRect.w > 0 || activeCardBorder.cropRect.h > 0"
                  class="portrait-slot"
                  :style="portraitSlotStyle"
                >
                  <img
                    :src="portraitUrlMap[card.id] || DEFAULT_PORTRAIT_PATH"
                    class="portrait-img"
                    :alt="card.label"
                  />
                </div>
                <!-- 边框 overlay：覆盖在立绘上方 -->
                <img
                  :src="activeCardBorder.filePath"
                  class="card-border-overlay"
                  alt="卡牌边框"
                />
              </div>

              <!-- 无边框时：直接显示立绘 -->
              <div v-else class="char-card-portrait">
                <img
                  class="char-card-img"
                  :src="portraitUrlMap[card.id] || DEFAULT_PORTRAIT_PATH"
                  :alt="card.label"
                  loading="lazy"
                />
              </div>

              <h3 class="char-card-name">{{ card.label }}</h3>
              <span class="char-card-hint" v-if="getCardClass(index)['char-card-active']">点击进入房间</span>
            </div>
          </button>
        </div>

        <!-- 轮播指示器 -->
        <div class="char-carousel-dots">
          <span
            v-for="(card, index) in characterCards"
            :key="card.id"
            class="char-carousel-dot"
            :class="{ active: index === activeCardIndex }"
            @click="activeCardIndex = index"
          />
        </div>
      </template>
    </section>

    <!-- 底部按钮 -->
    <footer class="char-select-footer">
      <button
        v-if="activeCard"
        type="button"
        class="char-enter-btn"
        @click="handleEnterRoom(activeCard)"
      >
        <span class="char-enter-icon">🚪</span>
        <span class="char-enter-label">进入「{{ activeCard.label }}」的房间</span>
      </button>
    </footer>
  </div>
</template>
