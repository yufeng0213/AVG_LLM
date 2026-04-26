<script setup>
/**
 * NPCDialog.vue - NPC对话组件
 * 显示NPC头像、名称、角色、对话气泡、策略选项
 */

const props = defineProps({
  npc: { type: Object, required: true },
  dialogue: { type: Object, required: true },
  trust: { type: Number, default: 0 },
})

const emit = defineEmits(['select'])

const personalityIcon = (p) => {
  const map = { '谨慎': '🔒', '开朗': '😊', '冷漠': '😐', '急躁': '😤', '狡猾': '🦊' }
  return map[p] || '👤'
}
</script>

<template>
  <div class="npc-dialog">
    <!-- NPC Info -->
    <div class="npc-info">
      <div class="npc-avatar">
        {{ personalityIcon(npc.personality) }}
      </div>
      <div class="npc-details">
        <div class="npc-name">
          {{ npc.name }}
          <span class="npc-role-tag">{{ npc.role }}</span>
        </div>
        <div class="npc-trust-bar">
          <div class="npc-trust-fill" :style="{ width: Math.min(100, Math.max(0, (trust / 20) * 100)) + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- Dialogue Bubble -->
    <div class="dialogue-bubble">
      <div class="dialogue-round-label">第 {{ dialogue.round }} 轮</div>
      <p class="dialogue-text">{{ dialogue.text }}</p>
    </div>

    <!-- Options -->
    <div class="dialogue-options">
      <button
        v-for="(opt, i) in dialogue.options"
        :key="i"
        type="button"
        class="dialogue-option-btn"
        @click="emit('select', opt)"
      >
        <span class="option-strategy-tag" :class="opt.strategy">
          {{ opt.strategy === 'gentle' ? '温和' : opt.strategy === 'direct' ? '直接' : '迂回' }}
        </span>
        <span class="option-text">{{ opt.text }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.npc-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: var(--task-card-bg, rgba(255, 215, 0, 0.04));
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.12));
  border-radius: 14px;
}

.npc-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.npc-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 215, 0, 0.1);
  border: 2px solid var(--task-gold-border, rgba(255, 215, 0, 0.2));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  flex-shrink: 0;
}

.npc-details { flex: 1; min-width: 0; }

.npc-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--task-text-primary, #fff);
  margin-bottom: 6px;
}

.npc-role-tag {
  font-size: 0.68rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 140, 0, 0.08);
  color: rgba(255, 140, 0, 0.7);
  margin-left: 8px;
}

.npc-trust-bar {
  width: 100%;
  max-width: 200px;
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.npc-trust-fill {
  height: 100%;
  background: var(--task-gold, #ffd700);
  transition: width 0.5s ease;
  border-radius: 2px;
}

/* Dialogue Bubble */
.dialogue-bubble {
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  border-bottom-left-radius: 4px;
  position: relative;
}

.dialogue-round-label {
  font-size: 0.68rem;
  color: var(--task-gold, #ffd700);
  margin-bottom: 6px;
}

.dialogue-text {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--task-text-primary, #fff);
}

/* Options */
.dialogue-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dialogue-option-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.15));
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.2);
  color: var(--task-text-primary, #fff);
  font-size: 0.85rem;
  cursor: pointer;
  text-align: left;
  transition: all 150ms ease;
  line-height: 1.4;
}

.dialogue-option-btn:hover {
  background: rgba(255, 215, 0, 0.08);
  border-color: var(--task-gold, #ffd700);
}

.option-strategy-tag {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 999px;
  flex-shrink: 0;
  font-weight: 600;
}

.option-strategy-tag.gentle {
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
}

.option-strategy-tag.direct {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.option-strategy-tag.indirect {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}

.option-text { flex: 1; }
</style>
