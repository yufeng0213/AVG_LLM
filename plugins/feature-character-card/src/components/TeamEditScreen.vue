<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCardCollection } from '../composables/useCardCollection.js'
import { useTeamEdit } from '../composables/useTeamEdit.js'
import { CHARACTER_CARD_DEFS, getRarityConfig } from '../services/cardData.js'

const emit = defineEmits(['back'])

const collection = useCardCollection()
const teamEdit = useTeamEdit()

const selectedCard = ref(null)

// 已拥有的卡牌列表
const ownedCards = computed(() => {
  return collection.cards.value.map(card => {
    const def = CHARACTER_CARD_DEFS.find(d => d.id === card.cardId)
    return { card, def }
  }).filter(x => x.def)
})

// 编队中的卡牌
const teamMembers = computed(() => {
  return teamEdit.getTeamMembers(ownedCards.value.map(x => x.card))
})

// 编队外的卡牌
const availableCards = computed(() => {
  const teamIds = new Set(teamEdit.teamInstanceIds.value)
  return ownedCards.value.filter(x => !teamIds.has(x.card.instanceId))
})

// 按角色分组（编队）
const teamByCharacter = computed(() => {
  const groups = {}
  teamMembers.value.forEach(({ card, def }) => {
    if (!groups[def.characterName]) groups[def.characterName] = []
    groups[def.characterName].push({ card, def })
  })
  return groups
})

// 按角色分组（可用）
const availableByCharacter = computed(() => {
  const groups = {}
  availableCards.value.forEach(({ card, def }) => {
    if (!groups[def.characterName]) groups[def.characterName] = []
    groups[def.characterName].push({ card, def })
  })
  return groups
})

function getRarityColor(rarity) {
  const colors = { N: '#9ca3af', R: '#ffffff', SR: '#3b82f6', SSR: '#f59e0b', UR: '#a855f7' }
  return colors[rarity] || '#9ca3af'
}

async function removeFromTeam(instanceId) {
  await teamEdit.removeFromTeam(instanceId)
}

async function addToTeam(instanceId) {
  await teamEdit.addToTeam(instanceId)
}

function openDetail(member) {
  const detail = collection.getCardDetail(member.card.instanceId)
  if (detail) selectedCard.value = detail
}

function closeDetail() {
  selectedCard.value = null
}

async function clearAll() {
  if (confirm('确定要清空编队吗？')) {
    await teamEdit.clearTeam()
  }
}

onMounted(async () => {
  await Promise.all([collection.load(), teamEdit.load()])
})
</script>

<template>
  <div class="team-edit-screen">
    <header class="team-header">
      <button class="team-back-btn" @click="emit('back')">
        <span>←</span> 返回
      </button>
      <h2 class="team-title">出战编队</h2>
      <div class="team-count">
        <span class="count-num">{{ teamEdit.teamSize }}/{{ teamEdit.MAX_TEAM_SIZE }}</span>
      </div>
    </header>

    <!-- 编队信息 -->
    <div class="team-info-bar">
      <span class="info-text" v-if="teamEdit.teamSize === 0">未选择出战卡牌</span>
      <span class="info-text" v-else-if="teamEdit.teamSize < teamEdit.MAX_TEAM_SIZE">
        还可以添加 {{ teamEdit.MAX_TEAM_SIZE - teamEdit.teamSize }} 张卡牌
      </span>
      <span class="info-text full" v-else>队伍已满</span>
      <button v-if="teamEdit.teamSize > 0" class="clear-btn" @click="clearAll">清空</button>
    </div>

    <!-- 编队中 -->
    <section class="team-section">
      <h3 class="section-label">编队中</h3>
      <div v-if="teamMembers.length === 0" class="section-empty">
        <span class="empty-icon">🎴</span>
        <p>还没有选择出战卡牌</p>
      </div>
      <div v-else class="card-grid">
        <div
          v-for="{ card, def } in teamMembers"
          :key="card.instanceId"
          class="team-card selected"
          :style="{ borderColor: getRarityColor(def.rarity) }"
          @click="openDetail({ card, def })"
        >
          <button class="remove-btn" @click.stop="removeFromTeam(card.instanceId)" title="移出队伍">✕</button>
          <div class="card-rarity-badge" :style="{ color: getRarityColor(def.rarity) }">
            {{ def.rarity }}
          </div>
          <div class="card-art-placeholder">
            <span class="card-art-icon">🎴</span>
          </div>
          <div class="card-name">{{ def.name }}</div>
          <div class="card-character">{{ def.characterName }}</div>
          <div class="card-level">Lv.{{ card.level }} ★{{ card.stars }}</div>
        </div>
      </div>
    </section>

    <!-- 可用卡牌 -->
    <section class="team-section">
      <h3 class="section-label">可用卡牌</h3>
      <div v-if="availableCards.length === 0" class="section-empty">
        <p>没有可用的卡牌</p>
      </div>
      <div v-else class="card-grid">
        <div
          v-for="{ card, def } in availableCards"
          :key="card.instanceId"
          class="team-card available"
          :style="{ borderColor: getRarityColor(def.rarity) }"
        >
          <button class="add-btn" @click="addToTeam(card.instanceId)" title="加入队伍">+</button>
          <div class="card-rarity-badge" :style="{ color: getRarityColor(def.rarity) }">
            {{ def.rarity }}
          </div>
          <div class="card-art-placeholder">
            <span class="card-art-icon">🎴</span>
          </div>
          <div class="card-name">{{ def.name }}</div>
          <div class="card-character">{{ def.characterName }}</div>
          <div class="card-level">Lv.{{ card.level }} ★{{ card.stars }}</div>
        </div>
      </div>
    </section>

    <!-- 卡牌详情弹窗 -->
    <div v-if="selectedCard" class="card-detail-overlay" @click.self="closeDetail">
      <div class="card-detail-panel">
        <button class="detail-close" @click="closeDetail">✕</button>
        <div class="detail-header">
          <div class="detail-name">{{ selectedCard.def.name }}</div>
          <div class="detail-character">{{ selectedCard.def.characterName }}</div>
          <div class="detail-rarity" :style="{ color: getRarityColor(selectedCard.def.rarity) }">
            {{ selectedCard.def.rarity }}
          </div>
        </div>
        <div class="detail-tags">
          <span v-for="tag in selectedCard.def.tags" :key="tag" class="detail-tag">{{ tag }}</span>
        </div>
        <div class="detail-section">
          <div class="detail-stats-grid">
            <div class="detail-stat-item">
              <span class="stat-label-small">等级</span>
              <span class="stat-value-big">Lv.{{ selectedCard.card.level }}</span>
            </div>
            <div class="detail-stat-item">
              <span class="stat-label-small">星级</span>
              <span class="stat-value-big">{{ '★'.repeat(selectedCard.card.stars) }}</span>
            </div>
            <div class="detail-stat-item">
              <span class="stat-label-small">好感度</span>
              <span class="stat-value-big">{{ selectedCard.card.affinity }}/200</span>
            </div>
          </div>
        </div>
        <div class="detail-section">
          <h3 class="section-title">当前属性</h3>
          <div class="attr-list">
            <div class="attr-row"><span class="attr-name">⚔️ 攻击</span><span class="attr-val">{{ selectedCard.stats.attack }}</span></div>
            <div class="attr-row"><span class="attr-name">🛡️ 防御</span><span class="attr-val">{{ selectedCard.stats.defense }}</span></div>
            <div class="attr-row"><span class="attr-name">💕 魅力</span><span class="attr-val">{{ selectedCard.stats.charm }}</span></div>
            <div class="attr-row"><span class="attr-name">🍀 幸运</span><span class="attr-val">{{ selectedCard.stats.luck }}</span></div>
          </div>
        </div>
        <div class="detail-section">
          <h3 class="section-title">技能</h3>
          <div v-if="selectedCard.def.skills.length === 0" class="empty-skill">无技能</div>
          <div v-for="skill in selectedCard.def.skills" :key="skill.id" class="skill-item">
            <span class="skill-name">{{ skill.name }}</span>
            <span class="skill-type">{{ skill.type === 'active' ? '主动' : '被动' }}</span>
            <span class="skill-desc">{{ skill.effect }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.team-edit-screen {
  min-height: 100vh;
  background: var(--background, #0a0a0a);
  color: var(--foreground, #ffffff);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.team-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
}

.team-back-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 8px;
}

.team-back-btn:hover { background: rgba(255, 255, 255, 0.1); }

.team-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}

.team-count {
  font-size: 14px;
  font-weight: 700;
  color: #ff6b9d;
}

.team-info-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.info-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.info-text.full { color: #f59e0b; font-weight: 600; }

.clear-btn {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 6px;
  cursor: pointer;
}

/* 编队区域 */
.team-section {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 10px;
}

.section-empty {
  text-align: center;
  padding: 20px;
  color: rgba(255, 255, 255, 0.3);
  font-size: 12px;
}

.empty-icon { font-size: 24px; display: block; margin-bottom: 6px; }

/* 卡牌网格 */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
}

.team-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  position: relative;
  cursor: pointer;
  transition: all 0.15s;
}

.team-card:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-2px);
}

.team-card.selected {
  background: rgba(34, 197, 94, 0.05);
  border-color: rgba(34, 197, 94, 0.2);
}

.remove-btn, .add-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.remove-btn {
  background: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.add-btn {
  background: rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.card-rarity-badge {
  position: absolute;
  top: 4px;
  left: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.card-art-placeholder {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
}

.card-art-icon { font-size: 24px; opacity: 0.3; }

.card-name {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  text-align: center;
}

.card-character {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
}

.card-level {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.3);
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
}

.detail-header { text-align: center; margin-bottom: 10px; }
.detail-name { font-size: 18px; font-weight: 700; }
.detail-character { font-size: 12px; color: rgba(255, 255, 255, 0.5); margin-top: 2px; }
.detail-rarity { font-size: 14px; font-weight: 700; margin-top: 4px; }

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

.detail-section { margin-bottom: 16px; }

.detail-stats-grid {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.detail-stat-item { text-align: center; }
.stat-label-small { display: block; font-size: 10px; color: rgba(255, 255, 255, 0.4); margin-bottom: 4px; }
.stat-value-big { font-size: 15px; font-weight: 600; color: #ff6b9d; }

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.attr-list { display: flex; flex-direction: column; gap: 6px; }
.attr-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
}
.attr-name { font-size: 13px; color: rgba(255, 255, 255, 0.6); }
.attr-val { font-size: 13px; font-weight: 600; color: #fff; }

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
</style>
