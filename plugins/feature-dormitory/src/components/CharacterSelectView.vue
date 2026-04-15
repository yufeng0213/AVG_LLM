<script setup>
/**
 * CharacterSelectView.vue - 角色网格选择视图
 * 显示指定世界书下的角色列表，点击角色进入房间。
 */
import './CharacterSelectView.css'
import { computed, ref } from 'vue'

const props = defineProps({
  worldBook: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['back', 'enter-room'])

const DEFAULT_PORTRAIT_PATH = './data/lihui/default.png'

// 角色卡片列表
const characterCards = computed(() => {
  const characters = Array.isArray(props.worldBook?.characters) ? props.worldBook.characters : []
  return characters.map((character, index) => ({
    id: String(character?.id || `char_${index + 1}`),
    label: getCharacterDisplayName(character, index),
    raw: character,
  }))
})

// 角色头像 URL 映射
const portraitUrlMap = ref({})
const isLoadingPortraits = ref(false)

// 头像加载
const pickCharacterPortrait = (character) => {
  if (!Array.isArray(character?.portraits) || character.portraits.length === 0) {
    return null
  }
  return character.portraits.find(p => String(p?.emotion || '').trim() === 'default') || character.portraits[0]
}

const getPortraitImageUrl = (portrait) => {
  if (!portrait) return DEFAULT_PORTRAIT_PATH
  if (typeof portrait === 'string') return portrait
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

// 网格列数
const gridColumns = computed(() => {
  const count = characterCards.value.length
  if (count <= 0) return 1
  return Math.min(4, Math.max(2, count))
})

const handleEnterRoom = (card) => {
  emit('enter-room', card)
}

function getCharacterDisplayName(character, index) {
  const fallback = `角色 ${index + 1}`
  return String(character?.name || '').trim() || fallback
}

// 组件挂载后加载头像
loadPortraits()
</script>

<template>
  <div class="character-select-view">
    <!-- 顶部返回 + 标题 -->
    <header class="char-select-header">
      <button type="button" class="char-select-back-btn" @click="emit('back')">
        <span class="char-select-back-icon">‹</span>
        <span class="char-select-back-label">返回</span>
      </button>
      <div class="char-select-header-info">
        <h2 class="char-select-title">《{{ worldBook.title || '未命名世界书' }}》</h2>
        <p class="char-select-subtitle">选择一位角色进入寝室房间</p>
      </div>
    </header>

    <!-- 角色网格 -->
    <section class="char-select-body">
      <!-- 空状态 -->
      <div v-if="isLoadingPortraits" class="char-select-empty">
        <p>正在加载角色立绘...</p>
      </div>
      <div v-else-if="characterCards.length === 0" class="char-select-empty">
        <p>该世界书暂无角色</p>
        <p class="char-select-empty-hint">请先在世界书中创建角色</p>
      </div>

      <!-- 角色网格列表 -->
      <div v-else class="char-select-grid" :style="{ '--char-grid-columns': gridColumns }">
        <button
          v-for="card in characterCards"
          :key="card.id"
          type="button"
          class="char-select-card"
          @click="handleEnterRoom(card)"
        >
          <div class="char-select-card-portrait">
            <img
              class="char-select-card-img"
              :src="portraitUrlMap[card.id] || DEFAULT_PORTRAIT_PATH"
              :alt="card.label"
              loading="lazy"
            />
          </div>
          <span class="char-select-card-name">{{ card.label }}</span>
        </button>
      </div>
    </section>
  </div>
</template>
