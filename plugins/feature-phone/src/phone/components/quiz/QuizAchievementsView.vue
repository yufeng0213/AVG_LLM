<script setup>
/**
 * QuizAchievementsView.vue - 成就列表
 * 展示所有成就及解锁状态。
 */
import { computed, onMounted, ref } from 'vue'
import { loadAchievements } from '../../composables/useQuizData.js'

const emit = defineEmits(['back'])

const achievements = ref([])

onMounted(async () => {
  achievements.value = await loadAchievements()
})

const unlockedCount = computed(() => {
  return achievements.value.filter(a => a.unlocked).length
})

const totalCount = computed(() => achievements.value.length)

const progressPercent = computed(() => {
  if (totalCount.value === 0) return 0
  return Math.round((unlockedCount.value / totalCount.value) * 100)
})
</script>

<template>
  <div class="quiz-achievements">
    <h2 class="achievements-title">🏆 成就</h2>

    <div class="achievements-progress">
      <span>已解锁 {{ unlockedCount }} / {{ totalCount }}</span>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }" />
      </div>
      <span>{{ progressPercent }}%</span>
    </div>

    <div class="achievements-grid">
      <div
        v-for="achievement in achievements"
        :key="achievement.id"
        class="achievement-card"
        :class="{ unlocked: achievement.unlocked }"
      >
        <div class="achievement-icon" :class="{ locked: !achievement.unlocked }">
          {{ achievement.icon }}
        </div>
        <div class="achievement-info">
          <span class="achievement-name">{{ achievement.name }}</span>
          <span class="achievement-desc">{{ achievement.description }}</span>
          <span v-if="achievement.unlocked && achievement.unlockedAt" class="achievement-time">
            {{ new Date(achievement.unlockedAt).toLocaleDateString('zh-CN') }} 解锁
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quiz-achievements {
  padding: 16px;
  min-height: 100%;
}

.achievements-title {
  font-size: 1.2rem;
  margin-bottom: 16px;
  text-align: center;
}

.achievements-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  margin-bottom: 20px;
  font-size: 0.85rem;
  color: #8b9dc3;
}

.progress-bar-bg {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #ffd700, #ffaa00);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.achievements-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.achievement-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.achievement-card.unlocked {
  background: rgba(255, 215, 0, 0.05);
  border-color: rgba(255, 215, 0, 0.15);
}

.achievement-icon {
  font-size: 2rem;
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  flex-shrink: 0;
}

.achievement-icon.locked {
  filter: grayscale(1);
  opacity: 0.4;
}

.achievement-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.achievement-name {
  font-size: 0.95rem;
  font-weight: 600;
}

.achievement-card:not(.unlocked) .achievement-name {
  color: #555;
}

.achievement-desc {
  font-size: 0.8rem;
  color: #888;
}

.achievement-time {
  font-size: 0.7rem;
  color: #ffd700;
}
</style>
