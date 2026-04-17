<script setup>
/**
 * QuizHomeView.vue - 陪学 APP 首页
 * 显示评级、XP、功能入口和最近活动。
 */
import { computed, onMounted, ref } from 'vue'
import {
  loadProfile,
  loadHistory,
  loadAchievements,
  formatQuizTime,
} from '../../composables/useQuizData.js'

const emit = defineEmits(['open-assessment', 'open-url-import', 'open-teaching', 'open-practice', 'open-history'])

const profile = ref({
  rating: null,
  xp: 0,
  level: 1,
  totalCorrect: 0,
  totalWrong: 0,
  totalQuestions: 0,
  streak: 0,
  bestStreak: 0,
})

const recentActivity = ref([])

const xpPercent = computed(() => {
  const needed = profile.value.level * 100
  return Math.min(100, Math.round((profile.value.xp / needed) * 100))
})

const ratingColor = computed(() => {
  const colors = { S: '#ffd700', A: '#ff6b6b', B: '#4d96ff', C: '#6bcb77', D: '#636e72' }
  return colors[profile.value.rating] || '#8b9dc3'
})

const ratingLabel = computed(() => profile.value.rating || '未评级')

onMounted(async () => {
  profile.value = await loadProfile()
  const history = await loadHistory()
  recentActivity.value = history.slice(0, 5)
})

const activityText = computed(() => {
  const items = []
  for (const act of recentActivity.value) {
    if (act.type === 'quiz_result') {
      items.push({
        icon: act.isCorrect ? '✓' : '✗',
        text: `${act.topic || '练习'} ${act.isCorrect ? '答对' : '答错'} +${act.xp || 0}XP`,
        time: formatQuizTime(act.timestamp),
      })
    } else if (act.type === 'rating') {
      items.push({
        icon: '🧠',
        text: `测评完成: 评级${act.rating}`,
        time: formatQuizTime(act.timestamp),
      })
    } else if (act.type === 'teaching') {
      items.push({
        icon: '🎓',
        text: `${act.characterName || '默认'}讲解了${act.topic || '一个主题'}`,
        time: formatQuizTime(act.timestamp),
      })
    } else if (act.type === 'url_import') {
      items.push({
        icon: '🔗',
        text: `解析了一个 URL: ${act.title || '未命名'}`,
        time: formatQuizTime(act.timestamp),
      })
    } else if (act.type === 'level_up') {
      items.push({
        icon: '🌟',
        text: `升级到 Level ${act.level}!`,
        time: formatQuizTime(act.timestamp),
      })
    } else if (act.type === 'achievement') {
      items.push({
        icon: '🏆',
        text: `解锁成就「${act.achievementName}」`,
        time: formatQuizTime(act.timestamp),
      })
    }
  }
  return items
})
</script>

<template>
  <div class="quiz-home">
    <!-- 评级卡片 -->
    <div class="rating-card">
      <div class="rating-main">
        <span class="rating-badge" :style="{ color: ratingColor, fontSize: ratingLabel.length > 1 ? '0.85rem' : '2rem' }">{{ ratingLabel }}</span>
        <div class="rating-info">
          <div class="rating-level">Level {{ profile.level }}</div>
          <div class="rating-xp">
            {{ profile.xp }} / {{ profile.level * 100 }} XP
          </div>
        </div>
      </div>
      <div class="xp-bar-bg">
        <div class="xp-bar-fill" :style="{ width: xpPercent + '%' }" />
      </div>
      <div class="rating-stats">
        <span>✅ {{ profile.totalCorrect }}</span>
        <span>❌ {{ profile.totalWrong }}</span>
        <span>🔥 {{ profile.bestStreak }}</span>
      </div>
    </div>

    <!-- 功能入口 -->
    <div class="feature-grid">
      <button class="feature-btn" @click="emit('open-teaching')">
        <div class="feature-icon" style="background: linear-gradient(135deg, #667eea, #764ba2)">🎓</div>
        <span class="feature-label">角色陪学</span>
      </button>
      <button class="feature-btn" @click="emit('open-practice')">
        <div class="feature-icon" style="background: linear-gradient(135deg, #f093fb, #f5576c)">📝</div>
        <span class="feature-label">自由练习</span>
      </button>
      <button class="feature-btn" @click="emit('open-url-import')">
        <div class="feature-icon" style="background: linear-gradient(135deg, #4facfe, #00f2fe)">🔗</div>
        <span class="feature-label">导入链接</span>
      </button>
      <button class="feature-btn" @click="emit('open-history')">
        <div class="feature-icon" style="background: linear-gradient(135deg, #43e97b, #38f9d7)">📋</div>
        <span class="feature-label">历史</span>
      </button>
    </div>

    <!-- 最近活动 -->
    <div class="activity-section">
      <h3 class="activity-title">最近活动</h3>
      <div v-if="activityText.length === 0" class="activity-empty">
        还没有学习记录，开始你的第一次学习吧！
      </div>
      <div v-else class="activity-list">
        <div v-for="(item, idx) in activityText" :key="idx" class="activity-item">
          <span class="activity-icon">{{ item.icon }}</span>
          <span class="activity-text">{{ item.text }}</span>
          <span class="activity-time">{{ item.time }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quiz-home {
  padding: 16px;
  min-height: 100%;
}

.rating-card {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 20px;
}

.rating-main {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.rating-badge {
  font-weight: 800;
  width: 70px;
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  flex-shrink: 0;
}

.rating-info {
  flex: 1;
}

.rating-level {
  font-size: 1.3rem;
  font-weight: 700;
  margin-bottom: 4px;
}

.rating-xp {
  font-size: 0.85rem;
  color: #8b9dc3;
}

.xp-bar-bg {
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 10px;
}

.xp-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  border-radius: 4px;
  transition: width 0.5s ease;
}

.rating-stats {
  display: flex;
  gap: 16px;
  font-size: 0.85rem;
  color: #8b9dc3;
}

.feature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

.feature-btn {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.15s, background 0.2s;
  color: #fff;
}

.feature-btn:hover {
  transform: scale(1.03);
  background: rgba(255, 255, 255, 0.08);
}

.feature-btn:active {
  transform: scale(0.97);
}

.feature-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

.feature-label {
  font-size: 0.9rem;
  font-weight: 600;
}

.activity-section {
  margin-top: 8px;
}

.activity-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #8b9dc3;
  margin-bottom: 10px;
}

.activity-empty {
  text-align: center;
  color: #555;
  font-size: 0.85rem;
  padding: 20px;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  font-size: 0.85rem;
}

.activity-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.activity-text {
  flex: 1;
  color: #ccc;
}

.activity-time {
  font-size: 0.75rem;
  color: #666;
  flex-shrink: 0;
}
</style>
