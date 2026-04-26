<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCardCollection } from '../composables/useCardCollection.js'
import { getRarityConfig } from '../services/cardData.js'
import { useGlobalUser } from '../../../../src/composables/useGlobalUser.js'

const props = defineProps({
  instanceId: { type: String, default: '' },
})

const emit = defineEmits(['back'])

const { economy, updateEconomy } = useGlobalUser()
const collection = useCardCollection()

const detail = ref(null)
const activeSection = ref('stats') // stats | skills | stories

// 升级消耗（金币 = 当前等级 * 50）
const levelUpCost = computed(() => {
  if (!detail.value) return 0
  return detail.value.card.level * 50
})

// 升阶消耗（相同卡牌 = 当前星级 * 3）
const evolveCost = computed(() => {
  if (!detail.value) return 0
  return detail.value.card.stars * 3
})

// 当前拥有的相同卡牌数量
const sameCardCount = computed(() => {
  if (!detail.value) return 0
  return collection.cards.value.filter(c => c.cardId === detail.value.card.cardId).length
})

// 是否可以升阶
const canEvolve = computed(() => {
  if (!detail.value) return false
  const maxStar = getRarityConfig(detail.value.def.rarity).maxStar
  if (detail.value.card.stars >= maxStar) return false
  return sameCardCount.value >= evolveCost.value + 1 // +1 因为升阶的这张也要保留
})

// 好感度剧情解锁进度
const storyProgress = computed(() => {
  if (!detail.value) return []
  const { def, card } = detail.value
  return def.cardStories.map(story => {
    const req = story.unlockCondition?.affinity || 0
    const unlocked = card.storiesUnlocked.includes(story.id)
    return {
      ...story,
      required: req,
      unlocked,
      progress: Math.min(100, (card.affinity / req) * 100) || 0,
    }
  })
})

function getRarityColor(rarity) {
  const colors = { N: '#9ca3af', R: '#ffffff', SR: '#3b82f6', SSR: '#f59e0b', UR: '#a855f7' }
  return colors[rarity] || '#9ca3af'
}

async function handleLevelUp() {
  if (!detail.value) return
  const cost = levelUpCost.value
  const maxLevel = getRarityConfig(detail.value.def.rarity).maxLevel
  if (detail.value.card.level >= maxLevel) {
    alert('已达等级上限')
    return
  }
  const coins = economy.value?.coins ?? 0
  if (coins < cost) {
    alert(`金币不足（需要${cost}）`)
    return
  }

  updateEconomy(prev => ({ ...prev, coins: prev.coins - cost }))
  await collection.levelUp(detail.value.card.instanceId, 100)
  refreshDetail()
}

async function handleEvolve() {
  if (!detail.value) return
  const maxStar = getRarityConfig(detail.value.def.rarity).maxStar
  if (detail.value.card.stars >= maxStar) {
    alert('已达星级上限')
    return
  }

  const cost = evolveCost.value
  const owned = sameCardCount.value

  if (owned < cost + 1) {
    alert(`需要${cost}张相同卡牌进行升阶\n当前拥有：${owned}张`)
    return
  }

  const result = await collection.evolve(detail.value.card.instanceId)
  if (result.success) {
    alert(`升阶成功！消耗了${result.consumed}张相同卡牌`)
    refreshDetail()
  } else {
    alert(result.error)
  }
}

function refreshDetail() {
  const newDetail = collection.getCardDetail(props.instanceId)
  if (newDetail) detail.value = newDetail
}

function openStory(story) {
  if (story.unlocked) {
    alert(`剧情「${story.title}」\n\n${story.seed}\n\n（LLM生成内容将在阶段5实现）`)
  }
}

// 调试：添加金币
function addCoinsDebug(amount = 10000) {
  updateEconomy(prev => ({ ...prev, coins: prev.coins + amount }))
}

onMounted(async () => {
  await collection.load()
  refreshDetail()
})
</script>

<template>
  <div class="card-detail-screen">
    <!-- 顶部返回 -->
    <header class="detail-header">
      <button class="detail-back-btn" @click="emit('back')">
        <span>←</span> 返回
      </button>
      <h2 class="detail-title">卡牌详情</h2>
      <div class="detail-spacer">
        <span class="detail-coins">💰 {{ economy.coins }}</span>
        <button class="debug-add-btn" @click="addCoinsDebug(10000)">+💰</button>
      </div>
    </header>

    <template v-if="detail">
      <!-- 卡牌展示区 -->
      <section class="card-showcase" :style="{ borderBottomColor: getRarityColor(detail.def.rarity) + '40' }">
        <div class="showcase-card" :style="{ borderColor: getRarityColor(detail.def.rarity) }">
          <div class="showcase-rarity" :style="{ color: getRarityColor(detail.def.rarity) }">
            {{ detail.def.rarity }}
          </div>
          <div class="showcase-art">🎴</div>
        </div>
        <div class="showcase-info">
          <h1 class="card-name-big">{{ detail.def.name }}</h1>
          <p class="card-char-name">{{ detail.def.characterName }}</p>
          <div class="card-tags">
            <span v-for="tag in detail.def.tags" :key="tag" class="tag">{{ tag }}</span>
          </div>
        </div>
      </section>

      <!-- 等级 + 星级 -->
      <section class="cultivation-bar">
        <div class="cultivation-item">
          <span class="cultivation-label">等级</span>
          <span class="cultivation-value">
            Lv.{{ detail.card.level }}
            <span class="cultivation-max" :style="{ opacity: detail.card.level >= getRarityConfig(detail.def.rarity).maxLevel ? 1 : 0 }">
              MAX
            </span>
          </span>
        </div>
        <div class="cultivation-item">
          <span class="cultivation-label">星级</span>
          <span class="cultivation-value stars">
            <span v-for="i in getRarityConfig(detail.def.rarity).maxStar" :key="i" class="star" :class="{ filled: i <= detail.card.stars }">
              {{ i <= detail.card.stars ? '★' : '☆' }}
            </span>
          </span>
        </div>
        <div class="cultivation-item">
          <span class="cultivation-label">好感度</span>
          <span class="cultivation-value">{{ detail.card.affinity }}/200</span>
        </div>
      </section>

      <!-- 升级 & 升阶按钮 -->
      <section class="action-bar">
        <button class="action-btn level-btn" @click="handleLevelUp">
          <div class="action-content">
            <span class="action-label">升级</span>
            <span class="action-cost">💰 {{ levelUpCost }}</span>
          </div>
        </button>
        <button class="action-btn evolve-btn" :disabled="!canEvolve" @click="handleEvolve">
          <div class="action-content">
            <span class="action-label">升阶</span>
            <span class="action-cost">相同卡 ×{{ evolveCost }}</span>
            <span class="action-hint">(拥有{{ sameCardCount }}张)</span>
          </div>
        </button>
      </section>

      <!-- Section 切换 -->
      <div class="section-tabs">
        <button
          class="section-tab"
          :class="{ active: activeSection === 'stats' }"
          @click="activeSection = 'stats'"
        >属性</button>
        <button
          class="section-tab"
          :class="{ active: activeSection === 'skills' }"
          @click="activeSection = 'skills'"
        >技能</button>
        <button
          class="section-tab"
          :class="{ active: activeSection === 'stories' }"
          @click="activeSection = 'stories'"
        >剧情</button>
      </div>

      <!-- 属性 -->
      <section v-if="activeSection === 'stats'" class="section-body">
        <div class="attr-grid">
          <div class="attr-card">
            <span class="attr-icon">⚔️</span>
            <span class="attr-name">攻击</span>
            <span class="attr-number">{{ detail.stats.attack }}</span>
          </div>
          <div class="attr-card">
            <span class="attr-icon">🛡️</span>
            <span class="attr-name">防御</span>
            <span class="attr-number">{{ detail.stats.defense }}</span>
          </div>
          <div class="attr-card">
            <span class="attr-icon">💕</span>
            <span class="attr-name">魅力</span>
            <span class="attr-number">{{ detail.stats.charm }}</span>
          </div>
          <div class="attr-card">
            <span class="attr-icon">🍀</span>
            <span class="attr-name">幸运</span>
            <span class="attr-number">{{ detail.stats.luck }}</span>
          </div>
        </div>
        <div class="stat-bonus-hint">
          <p>属性受等级和星级加成</p>
          <p class="hint-detail">每级+5%，每星+10%</p>
        </div>
      </section>

      <!-- 技能 -->
      <section v-if="activeSection === 'skills'" class="section-body">
        <div v-if="detail.def.skills.length === 0" class="empty-section">
          <p>暂无技能</p>
        </div>
        <div v-for="skill in detail.def.skills" :key="skill.id" class="skill-card">
          <div class="skill-header">
            <span class="skill-name">{{ skill.name }}</span>
            <span class="skill-type-tag" :class="skill.type">{{ skill.type === 'active' ? '主动' : '被动' }}</span>
          </div>
          <div class="skill-detail">
            <span class="skill-effect">效果: {{ skill.effect }}</span>
            <span class="skill-value">+{{ skill.value }}%</span>
            <span v-if="skill.cooldown" class="skill-cd">CD: {{ skill.cooldown }}回合</span>
          </div>
        </div>
      </section>

      <!-- 剧情 -->
      <section v-if="activeSection === 'stories'" class="section-body">
        <div v-if="storyProgress.length === 0" class="empty-section">
          <p>暂无专属剧情</p>
        </div>
        <div v-for="story in storyProgress" :key="story.id" class="story-card" :class="{ unlocked: story.unlocked }">
          <div class="story-header">
            <span class="story-title-text">{{ story.title }}</span>
            <span v-if="story.unlocked" class="story-badge unlocked">已解锁</span>
            <span v-else class="story-badge locked">好感{{ story.required }}解锁</span>
          </div>
          <div v-if="!story.unlocked" class="story-progress-bar">
            <div class="story-progress-fill" :style="{ width: story.progress + '%' }"></div>
          </div>
          <div v-if="story.unlocked" class="story-preview">
            {{ story.seed.slice(0, 50) }}...
          </div>
          <button v-if="story.unlocked" class="story-read-btn" @click="openStory(story)">阅读</button>
        </div>
        <div class="story-hint">
          <p>提升好感度可解锁更多剧情</p>
          <p class="hint-detail">好感度可通过互动/约会提升</p>
        </div>
      </section>
    </template>

    <div v-else class="detail-loading">加载中...</div>
  </div>
</template>

<style scoped>
.card-detail-screen {
  min-height: 100vh;
  background: var(--background, #0a0a0a);
  color: var(--foreground, #ffffff);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* 顶部 */
.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.detail-back-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 8px;
}

.detail-back-btn:hover { background: rgba(255, 255, 255, 0.1); }

.detail-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.detail-spacer {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}

.detail-coins {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.debug-add-btn {
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #f59e0b;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.debug-add-btn:hover { background: rgba(245, 158, 11, 0.3); }

/* 卡牌展示 */
.card-showcase {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 16px;
  border-bottom: 2px solid;
}

.showcase-card {
  width: 100px;
  height: 130px;
  border: 2px solid;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  position: relative;
  flex-shrink: 0;
}

.showcase-rarity {
  position: absolute;
  top: 6px;
  left: 8px;
  font-size: 14px;
  font-weight: 800;
}

.showcase-art {
  font-size: 48px;
  opacity: 0.4;
}

.showcase-info { flex: 1; }

.card-name-big {
  font-size: 22px;
  font-weight: 800;
  margin: 0 0 4px;
}

.card-char-name {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 10px;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
}

/* 培养信息条 */
.cultivation-bar {
  display: flex;
  justify-content: space-around;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.cultivation-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.cultivation-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.cultivation-value {
  font-size: 15px;
  font-weight: 700;
  color: #ff6b9d;
}

.cultivation-max {
  font-size: 10px;
  color: #f59e0b;
  opacity: 0;
  margin-left: 4px;
}

.cultivation-value.stars {
  font-size: 14px;
  letter-spacing: 2px;
}

.star { color: rgba(255, 255, 255, 0.2); }
.star.filled { color: #f59e0b; }

/* 升级 & 升阶 */
.action-bar {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
}

.action-btn {
  flex: 1;
  border: none;
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  transition: transform 0.15s;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-btn:not(:disabled):hover { transform: translateY(-2px); }

.level-btn {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #fff;
}

.evolve-btn {
  background: linear-gradient(135deg, #a855f7, #7c3aed);
  color: #fff;
}

.evolve-btn:disabled {
  background: rgba(168, 85, 247, 0.3);
  color: rgba(255, 255, 255, 0.5);
  cursor: not-allowed;
}

.action-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.action-label { font-size: 14px; font-weight: 700; }
.action-cost { font-size: 11px; opacity: 0.8; }
.action-hint { font-size: 10px; opacity: 0.5; }

/* Section Tabs */
.section-tabs {
  display: flex;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 0 16px;
}

.section-tab {
  flex: 1;
  padding: 10px 0;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.section-tab.active {
  color: #ff6b9d;
  border-bottom-color: #ff6b9d;
}

/* Section Body */
.section-body {
  padding: 16px;
  flex: 1;
}

.empty-section {
  text-align: center;
  padding: 40px 20px;
  color: rgba(255, 255, 255, 0.3);
}

/* 属性网格 */
.attr-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.attr-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.attr-icon { font-size: 28px; }
.attr-name { font-size: 12px; color: rgba(255, 255, 255, 0.5); }
.attr-number { font-size: 20px; font-weight: 700; }

.stat-bonus-hint {
  text-align: center;
  padding: 16px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
}

.hint-detail { font-size: 11px; color: rgba(255, 255, 255, 0.2); margin-top: 4px; }

/* 技能 */
.skill-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}

.skill-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.skill-name { font-size: 14px; font-weight: 600; }

.skill-type-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  color: #fff;
}

.skill-type-tag.active { background: rgba(245, 158, 11, 0.3); }
.skill-type-tag.passive { background: rgba(59, 130, 246, 0.3); }

.skill-detail {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.skill-effect { flex: 1; }
.skill-value { color: #22c55e; font-weight: 600; }
.skill-cd { color: #f59e0b; }

/* 剧情 */
.story-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}

.story-card.unlocked {
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.05);
}

.story-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.story-title-text { font-size: 14px; font-weight: 600; }

.story-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
}

.story-badge.unlocked {
  background: rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.story-badge.locked {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.4);
}

.story-progress-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}

.story-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff6b9d, #a855f7);
  border-radius: 2px;
  transition: width 0.3s;
}

.story-preview {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 8px;
  font-style: italic;
}

.story-read-btn {
  width: 100%;
  padding: 6px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.story-read-btn:hover { background: rgba(255, 255, 255, 0.15); }

.story-hint {
  text-align: center;
  padding: 16px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
}

.detail-loading {
  text-align: center;
  padding: 60px;
  color: rgba(255, 255, 255, 0.3);
}

  .platform-android.android-portrait .action-btn,
  .platform-android.android-portrait .story-read-btn,
  .platform-android.android-portrait .detail-back-btn,
  .platform-android.android-portrait .section-tab,
  .platform-android.android-portrait .debug-add-btn {
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
</style>
