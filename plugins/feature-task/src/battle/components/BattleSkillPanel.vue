<script setup>
/**
 * 技能选择面板
 * 显示当前角色的可用技能
 */

import { ref } from 'vue'

const props = defineProps({
  actor: {
    type: Object,
    default: null,
  },
  availableTargets: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['select-skill'])

const LONG_PRESS_DURATION = 500 // ms

const skillDetail = ref(null)
const longPressTimer = ref(null)

const TARGET_MODE_LABEL = {
  single: '单体',
  all_allies: '我方全体',
  all_enemies: '敌方全体',
  self: '自身',
  random_enemy: '随机敌方单体',
  random_ally: '随机我方单体',
}

const DAMAGE_TYPE_LABEL = {
  physical: '物理',
  fire: '火',
  poison: '毒',
  ice: '冰',
  lightning: '雷',
  dark: '暗',
}

const SKILL_TYPE_ICONS = {
  attack: '⚔️',
  defense: '🛡️',
  support: '✨',
  heal: '💚',
}

const DAMAGE_TYPE_COLORS = {
  physical: '#9ca3af',
  fire: '#ef4444',
  poison: '#22c55e',
  ice: '#3b82f6',
  lightning: '#eab308',
  dark: '#8b5cf6',
}

function handleSelect(skill) {
  if (!props.actor) return
  if ((skill.currentCooldown || 0) > 0) return
  emit('select-skill', skill)
}

function startLongPress(e, skill) {
  longPressTimer.value = setTimeout(() => {
    skillDetail.value = { skill, x: 0, y: 0 }
    if (e.touches) {
      skillDetail.value.x = e.touches[0].clientX
      skillDetail.value.y = e.touches[0].clientY
    } else if (e.clientX != null) {
      skillDetail.value.x = e.clientX
      skillDetail.value.y = e.clientY
    }
  }, LONG_PRESS_DURATION)
}

function cancelLongPress() {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
    longPressTimer.value = null
  }
}

function closeSkillDetail() {
  skillDetail.value = null
}

function getSkillLabel(skill) {
  const icon = SKILL_TYPE_ICONS[skill.type] || '⚡'
  const cd = (skill.currentCooldown || 0) > 0 ? ` (CD:${skill.currentCooldown})` : ''
  return `${icon} ${skill.name}${cd}`
}
</script>

<template>
  <div class="skill-panel" v-if="actor">
    <div class="skill-buttons">
      <button
        v-for="skill in actor.skills"
        :key="skill.id"
        type="button"
        class="skill-btn"
        :class="[
          'type-' + skill.type,
          { 'on-cooldown': (skill.currentCooldown || 0) > 0 },
        ]"
        :disabled="(skill.currentCooldown || 0) > 0"
        @click="handleSelect(skill)"
        @touchstart.passive="startLongPress($event, skill)"
        @touchend="cancelLongPress"
        @touchcancel="cancelLongPress"
        @mousedown="startLongPress($event, skill)"
        @mouseup="cancelLongPress"
        @mouseleave="cancelLongPress"
      >
        <span class="skill-icon" :style="{ color: DAMAGE_TYPE_COLORS[skill.damageType] || '#9ca3af' }">
          {{ SKILL_TYPE_ICONS[skill.type] || '⚡' }}
        </span>
        <span class="skill-name">{{ skill.name }}</span>
        <span v-if="skill.damageMultiplier !== 1" class="skill-mult">x{{ skill.damageMultiplier }}</span>
        <span v-if="(skill.currentCooldown || 0) > 0" class="skill-cd">CD:{{ skill.currentCooldown }}</span>
      </button>
    </div>
    <div v-if="availableTargets.length > 0" class="skill-target-hint">
      请点击敌方卡片选择目标
    </div>

    <!-- 长按弹出的技能详情浮层 -->
    <Teleport to="body">
      <div
        v-if="skillDetail"
        class="skill-detail-tooltip"
        :style="{ left: skillDetail.x + 'px', top: skillDetail.y + 'px' }"
        @click.stop="closeSkillDetail"
        @touchstart.stop="closeSkillDetail"
      >
        <div class="tooltip-header">
          <span class="tooltip-icon">{{ SKILL_TYPE_ICONS[skillDetail.skill.type] || '⚡' }}</span>
          <span class="tooltip-name">{{ skillDetail.skill.name }}</span>
        </div>
        <div v-if="skillDetail.skill.description" class="tooltip-desc">
          {{ skillDetail.skill.description }}
        </div>
        <div class="tooltip-stats">
          <span v-if="skillDetail.skill.targetMode" class="stat">
            目标：{{ TARGET_MODE_LABEL[skillDetail.skill.targetMode] || skillDetail.skill.targetMode }}
          </span>
          <span v-if="skillDetail.skill.damageType" class="stat">
            伤害类型：{{ DAMAGE_TYPE_LABEL[skillDetail.skill.damageType] || skillDetail.skill.damageType }}
          </span>
          <span v-if="skillDetail.skill.damageMultiplier" class="stat">
            倍率：x{{ skillDetail.skill.damageMultiplier }}
          </span>
          <span v-if="skillDetail.skill.hitCount > 1" class="stat">
            命中次数：{{ skillDetail.skill.hitCount }}
          </span>
          <span v-if="skillDetail.skill.cooldown > 0" class="stat">
            冷却：{{ skillDetail.skill.cooldown }} 回合
          </span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.skill-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-buttons {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.skill-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--foreground, #fff);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.skill-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.3);
}

.skill-btn:disabled,
.skill-btn.on-cooldown {
  opacity: 0.4;
  cursor: not-allowed;
}

.skill-btn.type-heal {
  border-color: rgba(34, 194, 94, 0.3);
}

.skill-btn.type-attack {
  border-color: rgba(239, 68, 68, 0.2);
}

.skill-icon {
  font-size: 14px;
}

.skill-mult {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
}

.skill-cd {
  font-size: 10px;
  color: #eab308;
}

.skill-target-hint {
  font-size: 12px;
  color: #22c55e;
  text-align: center;
  padding: 4px;
  animation: blink 1s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>

<!-- 全局样式：长按浮层（不能 scoped） -->
<style>
.skill-detail-tooltip {
  position: fixed;
  z-index: 10000;
  background: rgba(20, 20, 30, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 12px 16px;
  min-width: 200px;
  max-width: 300px;
  color: #fff;
  font-size: 13px;
  backdrop-filter: blur(8px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  transform: translate(-50%, calc(-100% - 12px));
  pointer-events: auto;
}

.tooltip-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.tooltip-icon {
  font-size: 20px;
}

.tooltip-name {
  font-weight: 600;
  font-size: 15px;
}

.tooltip-desc {
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  line-height: 1.4;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.tooltip-stats {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.tooltip-stats .stat {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}
</style>
