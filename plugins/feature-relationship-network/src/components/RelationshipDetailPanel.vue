<template>
  <Transition name="panel-fade">
    <div v-if="visible" class="relationship-detail-overlay" @click.self="$emit('close')">
      <div class="relationship-detail-panel">
        <!-- Header -->
        <div class="detail-header">
          <div class="detail-character">
            <div class="detail-avatar" :style="{ borderColor: levelColor }">
              <img v-if="character?.smsAvatar || character?.portraits?.[0]" :src="character?.smsAvatar || character?.portraits?.[0]" alt="" />
              <span v-else class="avatar-fallback">{{ character?.name?.[0] || '?' }}</span>
            </div>
            <div class="detail-info">
              <div class="detail-name">{{ character?.name }}</div>
              <div class="detail-level" :style="{ color: levelColor }">
                {{ levelInfo.icon }} {{ levelInfo.name }}
              </div>
            </div>
          </div>
          <button class="detail-close" @click="$emit('close')">&times;</button>
        </div>

        <!-- Indicators -->
        <div class="detail-indicators">
          <!-- Favor -->
          <div class="indicator-row">
            <span class="indicator-label">好感度</span>
            <div class="indicator-bar">
              <div class="indicator-fill" :style="{ width: barWidth(favor), background: levelColor }"></div>
            </div>
            <span class="indicator-value" :style="{ color: levelColor }">{{ favor }}</span>
          </div>
          <!-- Trust -->
          <div class="indicator-row">
            <span class="indicator-label">信任度</span>
            <div class="indicator-bar">
              <div class="indicator-fill" :style="{ width: barWidth(trust), background: trustColor }"></div>
            </div>
            <span class="indicator-value" :style="{ color: trustColor }">{{ trust }}</span>
          </div>
          <!-- Stance -->
          <div class="indicator-row">
            <span class="indicator-label">立场</span>
            <div class="indicator-bar">
              <div class="indicator-fill" :style="{ width: barWidth(stance), background: stanceColor }"></div>
            </div>
            <span class="indicator-value" :style="{ color: stanceColor }">{{ stance > 0 ? '+' : '' }}{{ stance }}</span>
          </div>
        </div>

        <!-- History -->
        <div class="detail-history">
          <div class="history-title">最近变动</div>
          <div v-if="history.length === 0" class="history-empty">暂无变动记录</div>
          <div v-else class="history-list">
            <div v-for="entry in history" :key="entry.timestamp" class="history-item">
              <div class="history-time">{{ formatTime(entry.timestamp) }}</div>
              <div class="detail-line">
                <span v-if="entry.deltas.favor" class="delta-tag favor" :class="entry.deltas.favor > 0 ? 'up' : 'down'">
                  {{ entry.deltas.favor > 0 ? '+' : '' }}{{ entry.deltas.favor }} 好感
                </span>
                <span v-if="entry.deltas.trust" class="delta-tag trust" :class="entry.deltas.trust > 0 ? 'up' : 'down'">
                  {{ entry.deltas.trust > 0 ? '+' : '' }}{{ entry.deltas.trust }} 信任
                </span>
                <span v-if="entry.deltas.stance" class="delta-tag stance" :class="entry.deltas.stance > 0 ? 'up' : 'down'">
                  {{ entry.deltas.stance > 0 ? '+' : '' }}{{ entry.deltas.stance }} 立场
                </span>
              </div>
              <div v-if="entry.reason" class="history-reason">{{ entry.reason }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'
import { favorToLevel, favorToColor } from '../composables/useRelationship.js'
import { getCharacterRelationship, getRelationshipHistory } from '../../../../src/relationship/relationshipStore.js'

const props = defineProps({
  character: Object,
  visible: Boolean,
})

defineEmits(['close'])

const characterId = computed(() => props.character?.id)
const relationship = computed(() => getCharacterRelationship(characterId.value, props.character))
const history = computed(() => characterId.value ? getRelationshipHistory(characterId.value, 10) : [])

const favor = computed(() => relationship.value.favor ?? 0)
const trust = computed(() => relationship.value.trust ?? 0)
const stance = computed(() => relationship.value.stance ?? 0)

const levelInfo = computed(() => favorToLevel(favor.value))
const levelColor = computed(() => favorToColor(favor.value))

const trustColor = computed(() => {
  const t = (trust.value + 100) / 200
  return `hsl(${200 * t}, 70%, 60%)`
})

const stanceColor = computed(() => {
  if (stance.value > 20) return '#34c759'
  if (stance.value < -20) return '#ff3b30'
  return '#808080'
})

function barWidth(value) {
  return `${((value + 100) / 200) * 100}%`
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${min}`
}
</script>

<style scoped>
.relationship-detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.relationship-detail-panel {
  width: min(92vw, 400px);
  max-height: 85vh;
  border: 2px solid rgba(100, 180, 255, 0.25);
  border-radius: 16px;
  background: rgba(20, 20, 35, 0.96);
  backdrop-filter: blur(16px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 20px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.detail-character {
  display: flex;
  align-items: center;
  gap: 14px;
}

.detail-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-fallback {
  font-size: 1.2rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
}

.detail-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
}

.detail-level {
  font-size: 0.85rem;
  font-weight: 600;
}

.detail-close {
  appearance: none;
  width: 32px;
  height: 32px;
  min-width: 32px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.detail-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.detail-indicators {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.indicator-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.indicator-label {
  min-width: 42px;
  font-size: 0.82rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
}

.indicator-bar {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.indicator-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease, background 0.3s ease;
}

.indicator-value {
  min-width: 36px;
  text-align: right;
  font-size: 0.9rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.detail-history {
  padding: 0 20px 20px;
}

.history-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.04em;
  margin-bottom: 10px;
  text-transform: uppercase;
}

.history-empty {
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.35);
  text-align: center;
  padding: 12px 0;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}

.history-time {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 6px;
}

.detail-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.delta-tag {
  font-size: 0.76rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
}

.delta-tag.favor.up { color: #34c759; }
.delta-tag.favor.down { color: #ff3b30; }
.delta-tag.trust.up { color: #5ac8fa; }
.delta-tag.trust.down { color: #ff9500; }
.delta-tag.stance.up { color: #4cd964; }
.delta-tag.stance.down { color: #ff453a; }

.history-reason {
  font-size: 0.76rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 6px;
  line-height: 1.4;
}

.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: opacity 0.2s ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
}
</style>
