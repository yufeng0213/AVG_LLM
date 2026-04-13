<script setup>
/**
 * 技能选择面板
 * 显示当前角色的可用技能
 */

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

function getSkillLabel(skill) {
  const icon = SKILL_TYPE_ICONS[skill.type] || '⚡'
  const cd = (skill.currentCooldown || 0) > 0 ? ` (CD:${skill.currentCooldown})` : ''
  return `${icon} ${skill.name}${cd}`
}
</script>

<template>
  <div class="skill-panel" v-if="actor">
    <div class="skill-panel-header">
      <span class="actor-name">{{ actor.name }} 的回合</span>
      <span class="actor-hp">{{ actor.hp }}/{{ actor.maxHp }}</span>
    </div>
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
  </div>
</template>

<style scoped>
.skill-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.actor-name {
  font-weight: 600;
}

.actor-hp {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
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
  border-color: rgba(34, 197, 94, 0.3);
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
