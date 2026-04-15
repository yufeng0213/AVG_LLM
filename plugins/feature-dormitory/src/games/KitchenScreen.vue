<script setup>
/**
 * KitchenScreen.vue - 我的厨房
 * 从农场/菜市场获取原料，按食谱烹饪，timing 小游戏判定品质
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import Toast from '../Toast.vue'
import GameSkinSelector from '../components/GameSkinSelector.vue'
import { useGameSkin } from '../composables/useGameSkin'

const emit = defineEmits(['back', 'kitchen-result', 'kitchen-consume', 'kitchen-produce', 'game-skin-buy'])
const props = defineProps({
  coins: { type: Number, default: 0 },
  inventory: { type: Array, default: () => [] },
})

const GAME_KEY = 'kitchen'

// ====== 皮肤系统 ======
const {
  skins: kitchenSkins,
  activeSkin: kitchenActiveSkin,
  ownedSkinList: kitchenOwnedSkins,
  selectSkin: kitchenSelectSkin,
  buySkin: kitchenBuySkin,
} = useGameSkin(GAME_KEY)

const showSkinSelector = ref(false)

function handleKitchenSkinBuy({ skinId, price }) {
  const result = kitchenBuySkin(skinId, props.coins)
  if (result.success) {
    emit('game-skin-buy', { gameKey: GAME_KEY, cost: price })
    showToast(`🎨 主题已解锁：${kitchenSkins.find(s => s.id === skinId)?.name}`, 'success')
  } else if (result.notEnoughCoins) {
    showToast('金币不足！', 'error')
  }
}

// 皮肤主题样式
const kitchenThemeStyle = computed(() => {
  const theme = kitchenActiveSkin.value.theme || {}
  return {
    '--kitchen-screen-bg': theme.screenBg || 'linear-gradient(180deg, #2e1a0a 0%, #1e1a0a 40%, #0a1a1e 100%)',
    '--kitchen-header-bg': theme.headerBg || 'rgba(0, 0, 0, 0.4)',
    '--kitchen-header-border': theme.headerBorder || 'rgba(255, 140, 0, 0.2)',
    '--kitchen-header-text': theme.headerText || '#ff8c00',
    '--kitchen-market-inner-bg': theme.marketInnerBg || 'linear-gradient(180deg, #2e1a0a, #1a0e04)',
    '--kitchen-market-border': theme.marketBorder || 'rgba(255, 140, 0, 0.3)',
  }
})

// ====== 常量 ======
const CATEGORIES = [
  { id: 'drink', label: '饮品', emoji: '🥤' },
  { id: 'noodle', label: '面点', emoji: '🍜' },
  { id: 'dish', label: '菜', emoji: '🍲' },
  { id: 'dessert', label: '甜品', emoji: '🍰' },
]

// 农场原料
const FARM_MATERIALS = {
  mint:         { name: '薄荷',     icon: '🌿', type: 'farm' },
  sunflower:    { name: '向日葵籽', icon: '🌻', type: 'farm' },
  rose:         { name: '玫瑰花瓣', icon: '🌹', type: 'farm' },
  clover:       { name: '幸运草',   icon: '🍀', type: 'farm' },
  goldenApple:  { name: '金苹果',   icon: '🍎', type: 'farm' },
  succulent:    { name: '多肉',     icon: '🌵', type: 'farm' },
}

// 菜市场原料
const MARKET_MATERIALS = {
  milk:      { name: '牛奶',   icon: '🥛', price: 8 },
  egg:       { name: '鸡蛋',   icon: '🥚', price: 5 },
  flour:     { name: '面粉',   icon: '🍚', price: 6 },
  sugar:     { name: '糖',     icon: '🍬', price: 3 },
  butter:    { name: '黄油',   icon: '🧈', price: 10 },
  tea:       { name: '茶叶',   icon: '🫖', price: 7 },
  chocolate: { name: '巧克力', icon: '🍫', price: 12 },
  strawberry:{ name: '草莓',   icon: '🍓', price: 10 },
}

const ALL_MATERIALS = { ...FARM_MATERIALS, ...MARKET_MATERIALS }

// 食谱
const RECIPES = [
  // 饮品
  { id: 'mint_tea',       cat: 'drink',   name: '薄荷冰茶',     emoji: '🧊',  materials: ['mint', 'sugar', 'tea'],       price: 30 },
  { id: 'rose_milk_tea',  cat: 'drink',   name: '玫瑰奶茶',     emoji: '🧋',  materials: ['rose', 'milk', 'sugar'],     price: 45 },
  { id: 'sunflower_tea',  cat: 'drink',   name: '向日葵花茶',   emoji: '🌼',  materials: ['sunflower', 'tea', 'sugar'], price: 35 },
  { id: 'clover_drink',   cat: 'drink',   name: '幸运草特饮',   emoji: '🥤',  materials: ['clover', 'milk', 'sugar'],   price: 55 },
  { id: 'golden_juice',   cat: 'drink',   name: '金苹果汁',     emoji: '🧃',  materials: ['goldenApple', 'sugar'],      price: 80 },
  { id: 'succulent_lemon',cat: 'drink',   name: '多肉柠檬水',   emoji: '🍹',  materials: ['succulent', 'sugar', 'milk'],price: 40 },
  // 面点
  { id: 'sunflower_pasta',cat: 'noodle',  name: '向日葵意面',   emoji: '🍝',  materials: ['sunflower', 'flour', 'butter'],      price: 50 },
  { id: 'rose_pie',       cat: 'noodle',  name: '玫瑰饼',       emoji: '🥮',  materials: ['rose', 'flour', 'sugar'],            price: 45 },
  { id: 'egg_pancake',    cat: 'noodle',  name: '鸡蛋煎饼',     emoji: '🫓',  materials: ['egg', 'flour', 'butter'],            price: 35 },
  { id: 'choco_crepe',    cat: 'noodle',  name: '巧克力可丽饼', emoji: '🥞',  materials: ['chocolate', 'flour', 'egg'],         price: 60 },
  { id: 'mint_biscuit',   cat: 'noodle',  name: '薄荷酥饼',     emoji: '🍪',  materials: ['mint', 'flour', 'butter'],           price: 40 },
  { id: 'golden_apple_pie',cat:'noodle',  name: '金苹果派',     emoji: '🥧',  materials: ['goldenApple', 'flour', 'butter', 'sugar'], price: 90 },
  // 菜
  { id: 'sunflower_salad',cat: 'dish',    name: '向日葵沙拉',   emoji: '🥗',  materials: ['sunflower', 'strawberry', 'butter'], price: 45 },
  { id: 'succulent_egg',  cat: 'dish',    name: '多肉炒蛋',     emoji: '🍳',  materials: ['succulent', 'egg', 'butter'],        price: 50 },
  { id: 'mint_roll',      cat: 'dish',    name: '薄荷鸡肉卷',   emoji: '🌯',  materials: ['mint', 'egg', 'flour'],              price: 55 },
  { id: 'rose_fried_egg', cat: 'dish',    name: '玫瑰煎蛋',     emoji: '🍳',  materials: ['rose', 'egg', 'butter'],             price: 60 },
  { id: 'golden_roast',   cat: 'dish',    name: '金苹果烤鸡',   emoji: '🍗',  materials: ['goldenApple', 'egg', 'butter'],      price: 100 },
  { id: 'clover_stew',    cat: 'dish',    name: '幸运草炖菜',   emoji: '🍲',  materials: ['clover', 'egg', 'butter', 'flour'],  price: 70 },
  // 甜品
  { id: 'mint_choco',     cat: 'dessert', name: '薄荷巧克力',   emoji: '🍫',  materials: ['mint', 'chocolate', 'sugar'],        price: 55 },
  { id: 'rose_mousse',    cat: 'dessert', name: '玫瑰慕斯',     emoji: '🍮',  materials: ['rose', 'milk', 'sugar', 'butter'],   price: 65 },
  { id: 'sunflower_cookie',cat:'dessert', name: '向日葵曲奇',   emoji: '🍪',  materials: ['sunflower', 'egg', 'sugar', 'butter'],price: 50 },
  { id: 'golden_cake',    cat: 'dessert', name: '金苹果蛋糕',   emoji: '🎂',  materials: ['goldenApple', 'egg', 'sugar', 'butter', 'milk'], price: 120 },
  { id: 'strawberry_cake',cat: 'dessert', name: '草莓奶油蛋糕', emoji: '🍰',  materials: ['strawberry', 'milk', 'sugar'],         price: 40 },
  { id: 'succulent_jelly',cat: 'dessert', name: '多肉果冻',     emoji: '🧊',  materials: ['succulent', 'sugar', 'milk'],          price: 45 },
]

const RECIPE_MAP = {}
for (const r of RECIPES) RECIPE_MAP[r.id] = r

const STORAGE_KEY = 'avg_llm_kitchen_state_v1'

const COOKING_QUALITIES = [
  { id: 'perfect', emoji: '🌟', label: '完美',   stars: 5, multiplier: 2.0 },
  { id: 'great',   emoji: '✨', label: '优秀',   stars: 4, multiplier: 1.5 },
  { id: 'normal',  emoji: '👍', label: '普通',   stars: 3, multiplier: 1.0 },
  { id: 'fail',    emoji: '😢', label: '失败',   stars: 1, multiplier: 0.5 },
]

const LEGENDARY_CHANCE = 0.05

// ====== 状态 ======
const selectedCategory = ref('drink')
const selectedRecipe = ref(null)
const isCooking = ref(false)
const showMarket = ref(false)
const showRecipeDetail = ref(false)

// 烹饪小游戏
const cookingAngle = ref(0)
let cookingAnimFrame = null
let cookingSpeed = 2 // 度/帧
let targetStart = 0
let targetWidth = 60

// 统计
const stats = ref({
  discoveredRecipes: [],
  totalCooks: 0,
  totalEarned: 0,
  consecutiveSuccess: 0,
  legendaryCount: 0,
  achievements: [],
  lastDailySpecialDate: null,
  dailySpecialRecipeId: null,
})

// 菜市场原料库存
const marketInventory = ref({})

// Toast
const toastMessage = ref('')
const toastType = ref('success')
const toastVisible = ref(false)
let toastKey = 0

function showToast(msg, type = 'success') {
  toastKey++
  toastMessage.value = msg
  toastType.value = type
  toastVisible.value = true
}

function hideToast() {
  toastVisible.value = false
  toastMessage.value = ''
}

// 品质结果
const cookResult = ref(null)

// ====== 计算属性 ======
const filteredRecipes = computed(() => {
  return RECIPES.filter(r => r.cat === selectedCategory.value)
})

const discoveredCount = computed(() => stats.value.discoveredRecipes.length)

const chefMode = computed(() => stats.value.consecutiveSuccess >= 3)

// 每日特价
const dailySpecial = computed(() => {
  return RECIPE_MAP[stats.value.dailySpecialRecipeId] || RECIPES[0]
})

function initDailySpecial() {
  const today = new Date().toDateString()
  if (stats.value.lastDailySpecialDate !== today) {
    const randomRecipe = RECIPES[Math.floor(Math.random() * RECIPES.length)]
    stats.value.lastDailySpecialDate = today
    stats.value.dailySpecialRecipeId = randomRecipe.id
  }
}

// 检查原料是否足够
function hasMaterials(recipe) {
  for (const matKey of recipe.materials) {
    const mat = ALL_MATERIALS[matKey]
    if (!mat) return false
    if (mat.type === 'farm') {
      // 检查背包
      const farmItem = props.inventory.find(item => {
        const name = item.name || ''
        return name.includes(mat.name) || (item.type === 'farm_produce' && item.id?.includes(matKey))
      })
      if (!farmItem) return false
    } else {
      // 检查菜市场库存
      if (!marketInventory.value[matKey] || marketInventory.value[matKey] <= 0) return false
    }
  }
  return true
}

// 获取缺少的原料
function missingMaterials(recipe) {
  const missing = []
  for (const matKey of recipe.materials) {
    const mat = ALL_MATERIALS[matKey]
    if (!mat) { missing.push(matKey); continue }
    if (mat.type === 'farm') {
      const farmItem = props.inventory.find(item =>
        (item.name || '').includes(mat.name) || (item.type === 'farm_produce' && item.id?.includes(matKey))
      )
      if (!farmItem) missing.push(matKey)
    } else {
      if (!marketInventory.value[matKey] || marketInventory.value[matKey] <= 0) missing.push(matKey)
    }
  }
  return missing
}

// ====== 菜市场 ======
function buyMaterial(matKey) {
  const mat = MARKET_MATERIALS[matKey]
  if (!mat) return
  if (props.coins < mat.price) {
    showToast('金币不足！', 'error')
    return
  }
  emit('kitchen-result', { cost: mat.price, earned: 0 })
  marketInventory.value[matKey] = (marketInventory.value[matKey] || 0) + 1
  showToast(`购买了 ${mat.icon} ${mat.name}`, 'info')
}

function buyAllMissing(recipe) {
  const missing = missingMaterials(recipe)
  for (const matKey of missing) {
    const mat = MARKET_MATERIALS[matKey]
    if (!mat) continue
    buyMaterial(matKey)
  }
}

// ====== 食谱选择 ======
function selectRecipe(recipe) {
  selectedRecipe.value = recipe
  showRecipeDetail.value = true
  cookResult.value = null
}

// ====== 烹饪 ======
function startCooking() {
  const recipe = selectedRecipe.value
  if (!recipe) return
  if (!hasMaterials(recipe)) {
    showToast('原料不足！先去农场收获或菜市场购买吧', 'warning')
    return
  }
  if (isCooking.value) return

  isCooking.value = true
  cookResult.value = null

  // 消耗原料
  consumeMaterials(recipe)

  // 根据难度设定速度
  const matCount = recipe.materials.length
  cookingSpeed = 1.5 + matCount * 0.5 // 3原料=3度/帧, 5原料=4度/帧
  targetWidth = Math.max(20, 80 - matCount * 10) // 3原料=50度, 5原料=30度
  targetStart = Math.random() * (360 - targetWidth)
  cookingAngle.value = 0

  function animate() {
    cookingAngle.value = (cookingAngle.value + cookingSpeed) % 360
    cookingAnimFrame = requestAnimationFrame(animate)
  }
  cookingAnimFrame = requestAnimationFrame(animate)
}

function finishCooking() {
  if (!isCooking.value) return

  // 停止动画
  if (cookingAnimFrame) {
    cancelAnimationFrame(cookingAnimFrame)
    cookingAnimFrame = null
  }
  isCooking.value = false

  const recipe = selectedRecipe.value
  if (!recipe) return

  const angle = cookingAngle.value % 360
  let quality

  // 判定
  const center = targetStart + targetWidth / 2
  let diff = Math.abs(angle - center)
  if (diff > 180) diff = 360 - diff

  const halfTarget = targetWidth / 2
  if (diff < halfTarget * 0.3) {
    quality = COOKING_QUALITIES[0] // perfect
  } else if (diff < halfTarget) {
    quality = COOKING_QUALITIES[1] // great
  } else if (diff < halfTarget + 40) {
    quality = COOKING_QUALITIES[2] // normal
  } else {
    quality = COOKING_QUALITIES[3] // fail
  }

  // 随机暴击（传说级）
  const isLegendary = Math.random() < LEGENDARY_CHANCE
  if (isLegendary) {
    stats.value.legendaryCount++
  }

  // 厨神模式
  if (quality.id === 'perfect' || quality.id === 'great') {
    stats.value.consecutiveSuccess++
  } else {
    stats.value.consecutiveSuccess = 0
  }

  // 更新统计（totalEarned 仍记录品质分数用于统计）
  stats.value.totalCooks++
  stats.value.totalEarned += recipe.price * quality.multiplier

  // 记录是否为新发现（必须在添加之前判断）
  const isNewDiscovery = !stats.value.discoveredRecipes.includes(recipe.id)
  if (isNewDiscovery) {
    // 用新数组赋值确保 Vue 响应式系统能检测到变化
    stats.value.discoveredRecipes = [...stats.value.discoveredRecipes, recipe.id]
  }

  // 成就检查
  const achievements = [
    { id: 'cook_10', count: 10, label: '厨房新手' },
    { id: 'cook_50', count: 50, label: '家常好手' },
    { id: 'cook_100', count: 100, label: '资深大厨' },
    { id: 'all_recipes', count: 24, label: '料理大师', isRecipeCount: true },
  ]
  for (const ach of achievements) {
    if (!stats.value.achievements.includes(ach.id)) {
      const checkValue = ach.isRecipeCount ? stats.value.discoveredRecipes.length : stats.value.totalCooks
      if (checkValue >= ach.count) {
        stats.value.achievements = [...stats.value.achievements, ach.id]
        setTimeout(() => showToast(`🏆 成就解锁：${ach.label}！`, 'success'), 2000)
      }
    }
  }

  // 菜品存入背包
  const categoryObj = CATEGORIES.find(c => c.id === recipe.cat)
  emit('kitchen-produce', {
    id: `cooked_${recipe.id}`,
    name: recipe.name,
    icon: recipe.emoji,
    description: `${quality.label}品质的${recipe.name}${isLegendary ? '（传说级）' : ''}`,
    category: recipe.cat,
    categoryLabel: categoryObj?.label || recipe.cat,
    quality: quality.id,
  })

  cookResult.value = {
    quality,
    isLegendary,
    isNew: isNewDiscovery,
  }

  saveStats()

  // Toast
  const legendaryText = isLegendary ? ' 🌟传说级料理！' : ''
  const chefText = chefMode.value ? ' 🔥厨神模式！' : ''
  const stars = '⭐'.repeat(quality.stars)
  showToast(
    `${recipe.emoji} ${recipe.name} - ${quality.emoji}${quality.label} ${stars}\n已存入背包！${legendaryText}${chefText}`,
    isLegendary ? 'success' : quality.id === 'fail' ? 'error' : 'success'
  )
}

function consumeMaterials(recipe) {
  for (const matKey of recipe.materials) {
    const mat = ALL_MATERIALS[matKey]
    if (!mat) continue
    if (mat.type === 'farm') {
      // 从背包中消耗（通过 emit 通知父组件？不，直接在 inventory 里标记）
      // 由于 inventory 是 props，不能直接修改，需要通知父组件
      // 这里简化处理：农场原料从农场直接产出时已经算消耗了
      // 所以我们只消耗市场库存
    } else {
      marketInventory.value[matKey] = Math.max(0, (marketInventory.value[matKey] || 0) - 1)
    }
  }
  // 通知父组件消耗农场原料
  for (const matKey of recipe.materials) {
    const mat = ALL_MATERIALS[matKey]
    if (mat && mat.type === 'farm') {
      emit('kitchen-consume', { materialKey: matKey })
    }
  }
}

// ====== 持久化 ======
function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      stats.value = { ...stats.value, ...parsed }
    }
  } catch (e) {
    console.warn('Kitchen stats load failed:', e)
  }
}

function saveStats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats.value))
  } catch (e) {
    console.warn('Kitchen stats save failed:', e)
  }
}

// ====== 生命周期 ======
onMounted(() => {
  loadStats()
  initDailySpecial()
  saveStats()
})

onUnmounted(() => {
  if (cookingAnimFrame) cancelAnimationFrame(cookingAnimFrame)
})

defineExpose({ saveStats })
</script>

<template>
  <div class="kitchen-screen" :style="kitchenThemeStyle">
    <!-- Header -->
    <header class="kitchen-header">
      <button type="button" class="kitchen-back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <h2 class="kitchen-title">🍳 我的厨房</h2>
      <div class="kitchen-coin-box">
        <span class="kitchen-coin-icon">💰</span>
        <span class="kitchen-coin-value">{{ coins }}</span>
      </div>
      <button type="button" class="kitchen-theme-btn" @click="showSkinSelector = true">
        🎨 主题
      </button>
    </header>

    <!-- 统计栏 -->
    <div class="kitchen-stats-bar">
      <span class="stat-text">📖 图鉴: {{ discoveredCount }}/24</span>
      <span class="stat-divider">|</span>
      <span class="streak-text" :class="{ hot: chefMode }">
        {{ chefMode ? `🔥厨神模式! (${stats.consecutiveSuccess}连)` : stats.consecutiveSuccess > 0 ? `连胜: ${stats.consecutiveSuccess}` : `传说: ${stats.legendaryCount}次` }}
      </span>
      <span v-if="dailySpecial" class="stat-divider">|</span>
      <span v-if="dailySpecial" class="daily-special">📅 {{ dailySpecial.name }} +50%</span>
    </div>

    <!-- 主体 -->
    <main class="kitchen-body">
      <!-- 分类标签 -->
      <div class="kitchen-tabs">
        <button
          v-for="cat in CATEGORIES"
          :key="cat.id"
          type="button"
          class="kitchen-tab-btn"
          :class="{ active: selectedCategory === cat.id }"
          @click="() => { selectedCategory = cat.id; showRecipeDetail = false; cookResult = null }"
        >
          <span class="tab-emoji">{{ cat.emoji }}</span>
          <span class="tab-label">{{ cat.label }}</span>
        </button>
      </div>

      <!-- 食谱网格 -->
      <section v-if="!showRecipeDetail" class="kitchen-recipe-grid">
        <div
          v-for="recipe in filteredRecipes"
          :key="recipe.id"
          class="recipe-card"
          :class="{
            'recipe-discovered': stats.discoveredRecipes.includes(recipe.id),
            'recipe-selected': selectedRecipe?.id === recipe.id,
            'recipe-special': recipe.id === dailySpecial?.id,
            'recipe-missing': !hasMaterials(recipe),
          }"
          @click="selectRecipe(recipe)"
        >
          <span class="recipe-emoji">{{ recipe.emoji }}</span>
          <span class="recipe-name">{{ recipe.name }}</span>
          <span class="recipe-price">{{ recipe.price }}💰</span>
          <span v-if="stats.discoveredRecipes.includes(recipe.id)" class="recipe-check">✓</span>
          <span v-else class="recipe-lock">?</span>
        </div>
      </section>

      <!-- 食谱详情 -->
      <section v-else class="kitchen-recipe-detail">
        <button type="button" class="detail-back-btn" @click="() => { showRecipeDetail = false; cookResult = null }">
          ← 返回食谱列表
        </button>

        <div class="detail-card" :class="{ 'card-special': selectedRecipe?.id === dailySpecial?.id }">
          <h3 class="detail-name">{{ selectedRecipe?.emoji }} {{ selectedRecipe?.name }}</h3>
          <span v-if="selectedRecipe?.id === dailySpecial?.id" class="special-badge">📅 今日特价 +50%</span>

          <!-- 配方 -->
          <div class="detail-recipe">
            <template v-for="(matKey, idx) in selectedRecipe?.materials || []" :key="matKey">
              <span class="recipe-material">
                <span class="mat-icon">{{ ALL_MATERIALS[matKey]?.icon }}</span>
                <span class="mat-name">{{ ALL_MATERIALS[matKey]?.name }}</span>
              </span>
              <span v-if="idx < (selectedRecipe?.materials?.length || 0) - 1" class="recipe-plus">+</span>
            </template>
          </div>

          <!-- 原料检查 -->
          <div class="material-check" :class="{ 'has-all': hasMaterials(selectedRecipe) }">
            <template v-if="hasMaterials(selectedRecipe)">
              <span class="check-icon">✅</span>
              <span class="check-text">原料充足！</span>
            </template>
            <template v-else>
              <span class="check-icon">❌</span>
              <span class="check-text">缺少: </span>
              <span v-for="matKey in missingMaterials(selectedRecipe)" :key="matKey" class="missing-mat">
                {{ ALL_MATERIALS[matKey]?.icon }} {{ ALL_MATERIALS[matKey]?.name }}
              </span>
              <button type="button" class="buy-all-btn" @click.stop="buyAllMissing(selectedRecipe)">
                菜市场一键购买
              </button>
            </template>
          </div>

          <p class="detail-sell-price">品质: {{ selectedRecipe?.price }} 分</p>
        </div>

        <!-- 烹饪结果 -->
        <div v-if="cookResult && !isCooking" class="cook-result-card">
          <span class="result-emoji">{{ cookResult.quality.emoji }}</span>
          <span class="result-label">{{ cookResult.quality.label }}</span>
          <span class="result-stars">{{ '⭐'.repeat(cookResult.quality.stars) }}</span>
          <span class="result-earned">已存入背包</span>
          <span v-if="cookResult.isLegendary" class="result-legendary">🌟 传说级！</span>
        </div>

        <!-- 烹饪小游戏 -->
        <div v-if="isCooking" class="cooking-game">
          <div class="cooking-ring-container">
            <svg viewBox="0 0 200 200" class="cooking-ring">
              <!-- 背景环 -->
              <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="12"/>
              <!-- 目标区 -->
              <circle
                cx="100" cy="100" r="80"
                fill="none"
                stroke="rgba(34, 197, 94, 0.6)"
                stroke-width="12"
                :stroke-dasharray="`${targetWidth / 360 * 502.65} ${502.65 - targetWidth / 360 * 502.65}`"
                :stroke-dashoffset="-targetStart / 360 * 502.65"
                transform="rotate(-90 100 100)"
              />
              <!-- 指针 -->
              <line
                :x1="100" :y1="100"
                :x2="100 + 80 * Math.cos((cookingAngle - 90) * Math.PI / 180)"
                :y2="100 + 80 * Math.sin((cookingAngle - 90) * Math.PI / 180)"
                stroke="#ffffff"
                stroke-width="3"
                stroke-linecap="round"
              />
              <!-- 中心点 -->
              <circle cx="100" cy="100" r="8" fill="#ffffff"/>
              <!-- 中心文字 -->
              <text x="100" y="104" text-anchor="middle" fill="#333" font-size="10" font-weight="bold">GO</text>
            </svg>
          </div>
          <p class="cooking-hint">指针到达绿色区域时点击完成！</p>
          <button type="button" class="cooking-finish-btn" @click="finishCooking">
            🏃 完成烹饪！
          </button>
        </div>

        <!-- 开始烹饪按钮 -->
        <button
          v-if="!isCooking && !cookResult"
          type="button"
          class="kitchen-cook-btn"
          :class="{ disabled: !hasMaterials(selectedRecipe) }"
          :disabled="!hasMaterials(selectedRecipe)"
          @click="startCooking"
        >
          🍳 开始烹饪！
        </button>

        <!-- 再来一次 -->
        <button
          v-if="cookResult && !isCooking"
          type="button"
          class="kitchen-cook-again-btn"
          @click="cookResult = null"
        >
          🔄 再做一次
        </button>
      </section>

      <!-- 菜市场按钮 -->
      <button type="button" class="kitchen-market-btn" @click="showMarket = !showMarket">
        🛒 菜市场
      </button>
    </main>

    <!-- 菜市场面板 -->
    <Transition name="market-slide">
      <div v-if="showMarket" class="market-overlay" @click.self="showMarket = false">
        <div class="market-inner">
          <div class="market-header">
            <h3>🛒 菜市场</h3>
            <button type="button" class="market-close" @click="showMarket = false">×</button>
          </div>
          <div class="market-grid">
            <div
              v-for="(mat, key) in MARKET_MATERIALS"
              :key="key"
              class="market-item"
              @click="buyMaterial(key)"
            >
              <span class="market-icon">{{ mat.icon }}</span>
              <span class="market-name">{{ mat.name }}</span>
              <span class="market-price">{{ mat.price }} 💰</span>
              <span class="market-stock">库存: {{ marketInventory[key] || 0 }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Toast -->
    <Teleport to="body">
      <Transition name="toast-fade">
        <Toast
          v-if="toastVisible"
          :key="toastKey"
          :message="toastMessage"
          :type="toastType"
          :duration="3500"
          position="top"
          :on-close="hideToast"
        />
      </Transition>
    </Teleport>

    <!-- 皮肤选择器 -->
    <Teleport to="body">
      <GameSkinSelector
        v-if="showSkinSelector"
        :skins="kitchenSkins"
        :owned-ids="kitchenOwnedSkins.map(s => s.id)"
        :active-id="kitchenActiveSkin.id"
        :coins="coins"
        @select="kitchenSelectSkin"
        @buy="handleKitchenSkinBuy"
        @close="showSkinSelector = false"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.kitchen-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--kitchen-screen-bg, linear-gradient(180deg, #2e1a0a 0%, #1e1a0a 40%, #0a1a1e 100%));
  z-index: 10000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.kitchen-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: var(--kitchen-header-bg, rgba(0, 0, 0, 0.4));
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--kitchen-header-border, rgba(255, 140, 0, 0.2));
  gap: 10px;
}

.kitchen-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.kitchen-back-btn:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

.kitchen-title {
  flex: 1;
  text-align: center;
  margin: 0;
  color: var(--kitchen-header-text, #ff8c00);
  font-size: 17px;
  font-weight: 600;
  text-shadow: 0 0 15px rgba(255, 140, 0, 0.3);
}

.kitchen-coin-box {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 10px;
  padding: 6px 12px;
}
.kitchen-coin-value { color: #ffd700; font-size: 15px; font-weight: 700; min-width: 30px; text-align: right; }

/* 主题按钮 */
.kitchen-theme-btn {
  padding: 6px 12px;
  border: 1px solid var(--kitchen-header-border, rgba(255, 140, 0, 0.2));
  border-radius: 8px;
  background: rgba(255, 140, 0, 0.08);
  color: var(--kitchen-header-text, #ff8c00);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.kitchen-theme-btn:hover { background: rgba(255, 140, 0, 0.15); }
  .platform-android.android-portrait .kitchen-theme-btn {
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
/* 统计栏 */
.kitchen-stats-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  flex-wrap: wrap;
}
.stat-divider { color: rgba(255, 255, 255, 0.2); }
.streak-text.hot { color: #ff8c00; font-weight: 700; }
.daily-special { color: #4ade80; font-weight: 600; }

/* Body */
.kitchen-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 分类标签 */
.kitchen-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.kitchen-tab-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 4px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.2s;
  color: rgba(255, 255, 255, 0.6);
}
.kitchen-tab-btn:hover { background: rgba(255, 255, 255, 0.08); }
.kitchen-tab-btn.active {
  background: rgba(255, 140, 0, 0.15);
  border-color: rgba(255, 140, 0, 0.4);
  color: #ff8c00;
}
.tab-emoji { font-size: 20px; }
.tab-label { font-size: 11px; font-weight: 600; }

/* 食谱网格 */
.kitchen-recipe-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.recipe-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 6px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.recipe-card:hover { background: rgba(255, 255, 255, 0.08); transform: translateY(-2px); }
.recipe-card:active { transform: scale(0.97); }

.recipe-discovered { border-color: rgba(34, 197, 94, 0.3); }
.recipe-selected { border-color: #ffd700; background: rgba(255, 215, 0, 0.1); }
.recipe-special { border-color: rgba(74, 222, 128, 0.5); box-shadow: 0 0 10px rgba(74, 222, 128, 0.2); }

.recipe-emoji { font-size: 28px; }
.recipe-name { font-size: 11px; font-weight: 600; color: #fff; text-align: center; }
.recipe-price { font-size: 10px; color: #ffd700; }
.recipe-check { position: absolute; top: 4px; right: 4px; font-size: 12px; color: #22c55e; }
.recipe-lock { position: absolute; top: 4px; right: 4px; font-size: 12px; color: rgba(255, 255, 255, 0.3); }

/* 食谱详情 */
.kitchen-recipe-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-back-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 0;
}
.detail-back-btn:hover { color: #fff; }

.detail-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 20px;
  text-align: center;
}
.card-special { border-color: rgba(74, 222, 128, 0.4); background: rgba(74, 222, 128, 0.05); }

.detail-name { margin: 0 0 8px; font-size: 18px; color: #fff; }
.special-badge {
  display: inline-block;
  background: rgba(74, 222, 128, 0.2);
  color: #4ade80;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 12px;
}

.detail-recipe {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
  margin: 12px 0;
}

.recipe-material {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.mat-icon { font-size: 24px; }
.mat-name { font-size: 10px; color: rgba(255, 255, 255, 0.5); }
.recipe-plus { font-size: 18px; color: rgba(255, 255, 255, 0.3); }

.material-check {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 8px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  font-size: 12px;
}
.material-check.has-all { background: rgba(34, 197, 94, 0.1); }
.check-icon { font-size: 16px; }
.check-text { color: rgba(255, 255, 255, 0.7); }
.missing-mat { color: #f87171; font-size: 11px; }

.buy-all-btn {
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #60a5fa;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
}
.buy-all-btn:hover { background: rgba(59, 130, 246, 0.3); }

.detail-sell-price { font-size: 14px; color: #ffd700; font-weight: 700; margin: 8px 0 0; }

/* 烹饪结果 */
.cook-result-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 12px;
}
.result-emoji { font-size: 36px; }
.result-label { font-size: 16px; font-weight: 700; color: #fff; }
.result-stars { font-size: 18px; }
.result-earned { font-size: 18px; font-weight: 700; color: #ffd700; }
.result-legendary {
  font-size: 14px;
  font-weight: 700;
  color: #ffd700;
  animation: legendary-pulse 0.5s ease infinite alternate;
}

@keyframes legendary-pulse {
  0% { text-shadow: 0 0 5px #ffd700; }
  100% { text-shadow: 0 0 20px #ffd700, 0 0 40px rgba(255, 215, 0, 0.5); }
}

/* 烹饪小游戏 */
.cooking-game {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
}

.cooking-ring-container {
  width: 200px;
  height: 200px;
}

.cooking-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
}

.cooking-finish-btn {
  padding: 14px 32px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.4), rgba(34, 197, 94, 0.15));
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #4ade80;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.cooking-finish-btn:hover { transform: scale(1.05); box-shadow: 0 4px 20px rgba(34, 197, 94, 0.3); }
.cooking-finish-btn:active { transform: scale(0.95); }

/* 开始烹饪按钮 */
.kitchen-cook-btn {
  padding: 14px 32px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(255, 140, 0, 0.4), rgba(255, 140, 0, 0.15));
  border: 1px solid rgba(255, 140, 0, 0.4);
  color: #ff8c00;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.kitchen-cook-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(255, 140, 0, 0.3); }
.kitchen-cook-btn:active:not(:disabled) { transform: scale(0.97); }
.kitchen-cook-btn.disabled { opacity: 0.4; cursor: not-allowed; }

.kitchen-cook-again-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.kitchen-cook-again-btn:hover { background: rgba(255, 255, 255, 0.1); }

/* 菜市场按钮 */
.kitchen-market-btn {
  padding: 14px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(59, 130, 246, 0.1));
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #60a5fa;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.kitchen-market-btn:hover { transform: translateY(-2px); }

/* 菜市场面板 */
.market-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 10003;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.market-inner {
  background: var(--kitchen-market-inner-bg, linear-gradient(180deg, #2e1a0a, #1a0e04));
  border: 1px solid var(--kitchen-market-border, rgba(255, 140, 0, 0.3));
  border-radius: 16px 16px 0 0;
  padding: 20px;
  max-width: 400px;
  width: 100%;
  max-height: 70vh;
  overflow-y: auto;
}

.market-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.market-header h3 { margin: 0; color: #ff8c00; font-size: 16px; }
.market-close { background: none; border: none; font-size: 28px; color: rgba(255, 255, 255, 0.5); cursor: pointer; padding: 4px 8px; }
.market-close:hover { color: #fff; }

.market-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.market-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.2s;
}
.market-item:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 140, 0, 0.3); }

.market-icon { font-size: 26px; }
.market-name { font-size: 11px; font-weight: 600; color: #fff; }
.market-price { font-size: 10px; color: #ffd700; }
.market-stock { font-size: 9px; color: rgba(255, 255, 255, 0.4); }

/* Transitions */
.market-slide-enter-active, .market-slide-leave-active { transition: all 0.3s ease; }
.market-slide-enter-from, .market-slide-leave-to { transform: translateY(100%); opacity: 0; }

/* Android竖屏适配 */
.platform-android.android-portrait .kitchen-header {
  padding-top: calc(12px + env(safe-area-inset-top)) !important;
}
.platform-android.android-portrait .kitchen-back-btn {
  width: 44px !important; height: 44px !important; min-width: 44px !important; min-height: 44px !important;
}
.platform-android.android-portrait .kitchen-title { font-size: 15px !important; }
.platform-android.android-portrait .kitchen-recipe-grid { grid-template-columns: repeat(2, 1fr) !important; }
.platform-android.android-portrait .market-grid { grid-template-columns: repeat(3, 1fr) !important; }
</style>
