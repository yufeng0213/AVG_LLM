<template>
  <div class="character-hub">
    <!-- Connection lines (single SVG behind everything) -->
    <svg class="connection-svg" viewBox="0 0 360 480">
      <line
        v-for="(rel, index) in connectedRels"
        :key="'line-' + rel.targetId"
        :x1="lineCenterX"
        :y1="lineCenterY"
        :x2="lineEndX(index, connectedRels.length)"
        :y2="lineEndY(index, connectedRels.length)"
        :stroke="scoreColor(rel.score)"
        :stroke-width="scoreWidth(rel.score)"
        :stroke-opacity="scoreOp(rel.score)"
      />
    </svg>

    <!-- Center character -->
    <div class="center-char" :class="{ 'is-player': centerChar.isPlayer }">
      <div class="center-avatar">
        <img v-if="centerChar.avatar" :src="centerChar.avatar" alt="" />
        <span v-else class="avatar-fallback">{{ centerChar.name.charAt(0) }}</span>
      </div>
      <div class="center-name">{{ centerChar.name }}</div>
      <div v-if="centerChar.identity" class="center-identity">{{ centerChar.identity }}</div>
    </div>

    <!-- Surrounding characters -->
    <div
      v-for="(rel, index) in connectedRels"
      :key="rel.targetId"
      class="orbit-char"
      :style="orbitStyle(index, connectedRels.length)"
      @click="$emit('selectCharacter', rel.targetId)"
    >
      <div class="orbit-avatar">
        <img v-if="rel.avatar" :src="rel.avatar" alt="" />
        <span v-else class="avatar-fallback">{{ rel.name.charAt(0) }}</span>
      </div>
      <div class="orbit-name">{{ rel.name }}</div>
      <div class="orbit-score" :style="{ color: scoreColor(rel.score) }">
        {{ rel.score }} {{ scoreTier(rel.score) }}
      </div>
    </div>

    <!-- No relationships -->
    <div v-if="connectedRels.length === 0" class="empty-state">
      <div class="empty-text">暂无关系数据</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { scoreToColor, scoreToTier, scoreToWidth, scoreToOpacity } from '../composables/useRelationship.js'

const props = defineProps({
  worldBook: Object,
  characterId: String,
})

const emit = defineEmits(['selectCharacter', 'back'])

const lineCenterX = 180
const lineCenterY = 240

function getCharById(id) {
  if (id === '__player__') return {
    id: '__player__',
    name: props.worldBook?.userProfile?.name || '玩家',
    identity: props.worldBook?.userProfile?.identity || '',
    avatar: '',
    isPlayer: true,
  }
  return props.worldBook?.characters?.find(c => c.id === id)
}

const centerChar = computed(() => getCharById(props.characterId) || { name: '未知', identity: '', avatar: '', isPlayer: false })

const connectedRels = computed(() => {
  const rels = props.worldBook?.relationships || {}
  const targets = rels[props.characterId] || {}
  return Object.entries(targets)
    .filter(([_, rel]) => rel.score >= 0)
    .map(([targetId, rel]) => {
      const char = getCharById(targetId)
      return {
        targetId,
        name: char?.name || targetId,
        identity: char?.identity || '',
        avatar: char?.avatar || '',
        score: rel.score,
        description: rel.description || '',
        isPlayer: char?.isPlayer || false,
      }
    })
    .sort((a, b) => b.score - a.score)
})

const orbitRadius = 120

function orbitStyle(index, total) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2
  const x = lineCenterX + orbitRadius * Math.cos(angle) - 30
  const y = lineCenterY + orbitRadius * Math.sin(angle) - 30
  return { left: `${x}px`, top: `${y}px` }
}

function scoreColor(s) { return scoreToColor(s) }
function scoreTier(s) { return scoreToTier(s) }
function scoreWidth(s) { return scoreToWidth(s) }
function scoreOp(s) { return scoreToOpacity(s) }

function lineEndX(index, total) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2
  return lineCenterX + orbitRadius * Math.cos(angle)
}

function lineEndY(index, total) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2
  return lineCenterY + orbitRadius * Math.sin(angle)
}
</script>

<style scoped>
.character-hub {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}
.center-char {
  position: absolute;
  left: 50%;
  top: 45%;
  transform: translate(-50%, -50%);
  text-align: center;
}
.center-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  overflow: hidden;
  margin: 0 auto 8px;
  border: 3px solid #5856d6;
  background: rgba(88, 86, 214, 0.2);
}
.center-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.center-char.is-player .center-avatar {
  border-color: #ffd700;
  background: rgba(255, 215, 0, 0.2);
}
.avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 24px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
}
.center-name {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}
.center-identity {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}
.orbit-char {
  position: absolute;
  width: 60px;
  text-align: center;
  cursor: pointer;
  z-index: 2;
}
.orbit-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  overflow: hidden;
  margin: 0 auto 4px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
}
.orbit-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.orbit-char.is-player .orbit-avatar {
  border-color: #ffd700;
}
.orbit-name {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.orbit-score {
  font-size: 10px;
  font-weight: 600;
  margin-top: 1px;
}
.connection-svg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}
.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
}
</style>
