<script setup>
import { computed } from 'vue'

/**
 * ClueBoard.vue - 线索拼图界面
 * 显示已获取/未获取的线索卡片
 */

const props = defineProps({
  clues: { type: Array, default: () => [] },
})

const safeClues = computed(() => {
  const arr = Array.isArray(props.clues) ? props.clues : []
  return arr.filter(c => c && typeof c === 'object')
})
</script>

<template>
  <div class="clue-board">
    <h3 class="board-title">🔍 线索墙</h3>
    <div class="board-grid">
      <div
        v-for="(clue, i) in safeClues"
        :key="i"
        class="clue-card"
        :class="clue.unlocked ? 'unlocked' : 'locked'"
      >
        <div class="clue-card-icon">
          {{ clue.unlocked ? '📄' : '❓' }}
        </div>
        <div class="clue-card-name">
          {{ clue.unlocked ? clue.name : '??? 未获取' }}
        </div>
        <div v-if="clue.npcName" class="clue-card-source">
          来自：{{ clue.npcName }}
        </div>
        <div v-if="clue.unlocked" class="clue-card-text">
          {{ clue.text }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clue-board {
  padding: 16px;
  background: var(--task-card-bg, rgba(255, 215, 0, 0.04));
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.12));
  border-radius: 14px;
}

.board-title {
  margin: 0 0 12px;
  font-size: 0.95rem;
  color: var(--task-gold, #ffd700);
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}

.clue-card {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--task-gold-border, rgba(255, 215, 0, 0.12));
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.clue-card.unlocked {
  background: rgba(255, 215, 0, 0.06);
  border-color: rgba(255, 215, 0, 0.2);
}

.clue-card.locked {
  background: rgba(255, 255, 255, 0.02);
  border-style: dashed;
  opacity: 0.5;
}

.clue-card-icon {
  font-size: 1.5rem;
  text-align: center;
}

.clue-card-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--task-text-primary, #fff);
  text-align: center;
}

.clue-card-source {
  font-size: 0.68rem;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.4));
  text-align: center;
}

.clue-card-text {
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--task-text-secondary, rgba(255, 255, 255, 0.6));
  text-align: center;
}
</style>
