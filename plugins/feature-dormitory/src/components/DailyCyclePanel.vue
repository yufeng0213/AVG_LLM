<script setup>
/**
 * DailyCyclePanel.vue - 日程循环面板组件
 * 负责展示日程循环、心愿列表等功能
 */

const props = defineProps({
  dayIndex: {
    type: Number,
    default: 1,
  },
  currentTimeSlotLabel: {
    type: String,
    default: '',
  },
  remainingDormActionSlots: {
    type: Number,
    default: 0,
  },
  completedTodayWishCount: {
    type: Number,
    default: 0,
  },
  totalTodayWishCount: {
    type: Number,
    default: 0,
  },
  todayWishes: {
    type: Array,
    default: () => [],
  },
  isDormDayActionClosed: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['advance-day'])

const handleAdvanceDay = () => {
  emit('advance-day')
}

const formatDailyWishTypeLabel = (wishType) => {
  const typeLabels = {
    chat: '聊天',
    gift: '送礼',
    rest: '休息',
    event: '事件',
    scene: '场景',
    upgrade: '升级',
  }
  const key = String(wishType || '').trim()
  return typeLabels[key] || key || '心愿'
}
</script>

<template>
  <section class="daily-cycle-panel">
    <div class="daily-cycle-head">
      <p class="daily-cycle-title">日程循环</p>
      <p class="daily-cycle-meta">
        第 {{ dayIndex }} 天 · 当前时段：{{ currentTimeSlotLabel }} · 剩余行动 {{ remainingDormActionSlots }}
      </p>
    </div>

    <div class="daily-cycle-toolbar">
      <p class="daily-cycle-progress">今日心愿 {{ completedTodayWishCount }} / {{ totalTodayWishCount }}</p>
      <button type="button" class="daily-next-day-btn" @click="handleAdvanceDay">
        {{ isDormDayActionClosed ? '进入下一天' : '提前结束今日' }}
      </button>
    </div>

    <ul class="daily-wish-list">
      <li
        v-for="wish in todayWishes"
        :key="wish.id"
        class="daily-wish-item"
        :class="{ completed: wish.completed }"
      >
        <span class="daily-wish-main">
          {{ wish.label }}
          <span class="daily-wish-type">[{{ formatDailyWishTypeLabel(wish.type) }}]</span>
        </span>
        <span class="daily-wish-progress">
          {{ wish.progress }} / {{ wish.target }} · 奖励 好感+{{ wish.rewardAffection }} 体力+{{ wish.rewardEnergy }}
        </span>
      </li>
    </ul>
  </section>
</template>
