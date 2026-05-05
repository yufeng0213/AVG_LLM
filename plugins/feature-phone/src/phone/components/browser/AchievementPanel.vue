<script setup>
/**
 * AchievementPanel.vue - 成就面板
 */
import { onMounted, ref } from 'vue'
import { getAchievements } from '../../services/achievementService.js'

const emit = defineEmits(['back'])

const achievements = ref([])
const loading = ref(true)

onMounted(async () => {
  loading.value = true
  achievements.value = await getAchievements()
  loading.value = false
})
</script>

<template>
  <div class="achievement-panel-screen">
    <div class="browser-sub-header">
      <button class="browser-back-btn" @click="emit('back')">&#8592; 返回浏览器</button>
    </div>

    <div class="achievement-panel-list">
      <div v-if="loading" class="achievement-loading">加载中...</div>
      <template v-else>
        <div
          v-for="ach in achievements"
          :key="ach.id"
          class="achievement-panel-item"
          :class="{ unlocked: ach.unlocked }"
        >
          <div class="achievement-icon" :class="{ locked: !ach.unlocked }">
            {{ ach.unlocked ? ach.icon : '🔒' }}
          </div>
          <div class="achievement-info">
            <div class="achievement-name">{{ ach.name }}</div>
            <div class="achievement-desc">{{ ach.description }}</div>
            <div v-if="!ach.unlocked" class="achievement-progress">
              进度: {{ ach.progress }}/{{ ach.target }}
            </div>
            <div v-else class="achievement-unlocked-at">
              解锁于 {{ new Date(ach.unlockedAt).toLocaleDateString() }}
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
